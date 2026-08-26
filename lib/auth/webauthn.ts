import { and, eq, gt } from 'drizzle-orm'
import {
  generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse,
  type AuthenticationResponseJSON, type AuthenticatorTransportFuture, type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON, type RegistrationResponseJSON,
} from '@simplewebauthn/server'
import * as schema from '@/db/schema'
import type { Db } from '@/db/types'

const CHALLENGE_MINUTES = 5

export function getRp(): { rpID: string; origin: string; rpName: string } {
  const url = new URL(process.env.APP_URL ?? 'http://localhost:3000')
  return { rpID: url.hostname, origin: url.origin, rpName: 'RezetApp' }
}

async function saveChallenge(db: Db, challenge: string, kind: 'register' | 'login', userId: string | null): Promise<string> {
  const [row] = await db
    .insert(schema.webauthnChallenges)
    .values({ challenge, kind, userId, expiresAt: new Date(Date.now() + CHALLENGE_MINUTES * 60_000) })
    .returning({ id: schema.webauthnChallenges.id })
  if (!row) throw new Error('No se pudo guardar el reto')
  return row.id
}

// Consume el reto: se borra al usarlo, caducado no vale
async function takeChallenge(db: Db, id: string, kind: 'register' | 'login'): Promise<{ challenge: string; userId: string | null }> {
  const [row] = await db
    .delete(schema.webauthnChallenges)
    .where(and(eq(schema.webauthnChallenges.id, id), eq(schema.webauthnChallenges.kind, kind), gt(schema.webauthnChallenges.expiresAt, new Date())))
    .returning()
  if (!row) throw new Error('Reto inválido o caducado')
  return { challenge: row.challenge, userId: row.userId }
}

export async function startRegistration(db: Db, displayName: string, userId: string | null = null): Promise<{ challengeId: string; options: PublicKeyCredentialCreationOptionsJSON }> {
  const { rpID, rpName } = getRp()
  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: displayName,
    userDisplayName: displayName,
    attestationType: 'none',
    // Obligatorio: el login usa credenciales descubribles (sin allowCredentials)
    authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
  })
  const challengeId = await saveChallenge(db, options.challenge, 'register', userId)
  return { challengeId, options }
}

export interface VerifiedCredential {
  credentialId: string
  publicKey: Buffer
  counter: number
  transports: string[]
  deviceType: string
  backedUp: boolean
}

export async function finishRegistration(db: Db, input: { challengeId: string; response: RegistrationResponseJSON }): Promise<VerifiedCredential> {
  const { rpID, origin } = getRp()
  const { challenge } = await takeChallenge(db, input.challengeId, 'register')
  const v = await verifyRegistrationResponse({ response: input.response, expectedChallenge: challenge, expectedOrigin: origin, expectedRPID: rpID })
  if (!v.verified || !v.registrationInfo) throw new Error('Registro no verificado')
  const c = v.registrationInfo.credential
  return {
    credentialId: c.id,
    publicKey: Buffer.from(c.publicKey),
    counter: c.counter,
    transports: c.transports ?? [],
    deviceType: v.registrationInfo.credentialDeviceType,
    backedUp: v.registrationInfo.credentialBackedUp,
  }
}

export async function startLogin(db: Db): Promise<{ challengeId: string; options: PublicKeyCredentialRequestOptionsJSON }> {
  const { rpID } = getRp()
  const options = await generateAuthenticationOptions({ rpID, userVerification: 'preferred' })
  const challengeId = await saveChallenge(db, options.challenge, 'login', null)
  return { challengeId, options }
}

export async function finishLogin(db: Db, input: { challengeId: string; response: AuthenticationResponseJSON }): Promise<{ userId: string }> {
  const { rpID, origin } = getRp()
  const { challenge } = await takeChallenge(db, input.challengeId, 'login')
  const [cred] = await db.select().from(schema.webauthnCredentials).where(eq(schema.webauthnCredentials.credentialId, input.response.id)).limit(1)
  if (!cred) throw new Error('Credencial desconocida')
  const v = await verifyAuthenticationResponse({
    response: input.response,
    expectedChallenge: challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    credential: { id: cred.credentialId, publicKey: new Uint8Array(cred.publicKey), counter: cred.counter, transports: cred.transports as AuthenticatorTransportFuture[] },
  })
  if (!v.verified) throw new Error('Autenticación no verificada')
  await db
    .update(schema.webauthnCredentials)
    .set({ counter: v.authenticationInfo.newCounter, lastUsedAt: new Date() })
    .where(eq(schema.webauthnCredentials.credentialId, cred.credentialId))
  return { userId: cred.userId }
}

// Guarda una passkey nueva para un usuario ya existente (alta o ajustes, W2)
export async function addCredentialToUser(db: Db, userId: string, c: VerifiedCredential, name: string | null): Promise<void> {
  await db.insert(schema.webauthnCredentials).values({
    credentialId: c.credentialId, userId, publicKey: c.publicKey, counter: c.counter, transports: c.transports, deviceType: c.deviceType, backedUp: c.backedUp, name,
  })
}
