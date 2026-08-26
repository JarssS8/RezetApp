import { and, eq, gt, lt, sql } from 'drizzle-orm'
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
  // Barrido de caducados: la tabla solo crece con retos abandonados (el usuario
  // cierra el diálogo del navegador) y nadie más los borra. Es barato: hay
  // índice por expires_at y como mucho unas decenas de filas.
  await db.delete(schema.webauthnChallenges).where(lt(schema.webauthnChallenges.expiresAt, sql`now()`))
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

// Passkeys que ya tiene el usuario, para que el autenticador no deje registrar la misma dos veces
async function getExcludeCredentials(db: Db, userId: string): Promise<{ id: string; transports: AuthenticatorTransportFuture[] }[]> {
  const rows = await db
    .select({ credentialId: schema.webauthnCredentials.credentialId, transports: schema.webauthnCredentials.transports })
    .from(schema.webauthnCredentials)
    .where(eq(schema.webauthnCredentials.userId, userId))
  return rows.map((r) => ({ id: r.credentialId, transports: r.transports as AuthenticatorTransportFuture[] }))
}

export async function startRegistration(db: Db, displayName: string, userId: string | null = null): Promise<{ challengeId: string; options: PublicKeyCredentialCreationOptionsJSON }> {
  const { rpID, rpName } = getRp()
  const excludeCredentials = userId ? await getExcludeCredentials(db, userId) : []
  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: displayName,
    userDisplayName: displayName,
    attestationType: 'none',
    // Obligatorio: el login usa credenciales descubribles (sin allowCredentials)
    authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
    ...(excludeCredentials.length > 0 ? { excludeCredentials } : {}),
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

// El reto de alta de una passkey extra desde ajustes está atado al usuario de
// la sesión que lo pidió (options): sin esta comprobación, cualquiera con un
// challengeId ajeno (filtrado, adivinado) podría colgarse una credencial en
// la cuenta de otro usuario con solo llamar a /verify con su propia sesión.
// El alta inicial (crear cuenta) no tiene aún userId: se pasa expectedUserId
// undefined y no se comprueba nada (challenge.userId ya es null en ese caso).
export class ChallengeUserMismatchError extends Error {
  constructor() {
    super('El reto no pertenece a este usuario')
  }
}

export async function finishRegistration(db: Db, input: { challengeId: string; response: RegistrationResponseJSON; expectedUserId?: string }): Promise<VerifiedCredential> {
  const { rpID, origin } = getRp()
  const { challenge, userId } = await takeChallenge(db, input.challengeId, 'register')
  if (input.expectedUserId !== undefined && userId !== input.expectedUserId) throw new ChallengeUserMismatchError()
  const v = await verifyRegistrationResponse({
    response: input.response,
    expectedChallenge: challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    // El cliente pide verificación 'preferred' (no 'required'): el servidor no debe exigirla
    requireUserVerification: false,
  })
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
    // El cliente pide verificación 'preferred' (no 'required'): el servidor no debe exigirla
    requireUserVerification: false,
    credential: { id: cred.credentialId, publicKey: new Uint8Array(cred.publicKey), counter: cred.counter, transports: cred.transports as AuthenticatorTransportFuture[] },
  })
  if (!v.verified) throw new Error('Autenticación no verificada')
  // Actualización optimista: si el contador cambió entre la lectura y aquí, hubo uso concurrente
  const [updated] = await db
    .update(schema.webauthnCredentials)
    .set({ counter: v.authenticationInfo.newCounter, lastUsedAt: new Date() })
    .where(and(eq(schema.webauthnCredentials.credentialId, cred.credentialId), eq(schema.webauthnCredentials.counter, cred.counter)))
    .returning({ credentialId: schema.webauthnCredentials.credentialId })
  if (!updated) throw new Error('Uso concurrente de la credencial')
  return { userId: cred.userId }
}

// Guarda una passkey nueva para un usuario ya existente (alta o ajustes, W2)
export async function addCredentialToUser(db: Db, userId: string, c: VerifiedCredential, name: string | null): Promise<void> {
  await db.insert(schema.webauthnCredentials).values({
    credentialId: c.credentialId, userId, publicKey: c.publicKey, counter: c.counter, transports: c.transports, deviceType: c.deviceType, backedUp: c.backedUp, name,
  })
}

// Alias: Task 19 importa este nombre
export const saveCredential = addCredentialToUser
