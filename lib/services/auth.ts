// Envoltorios finos para las rutas de app/api/auth/**: los ficheros bajo app/
// no pueden importar '@/db' directamente (regla de boundaries de eslint), así
// que estas funciones resuelven la conexión aquí y exponen solo lo necesario.
import 'server-only'
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server'
import type { PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/server'
import { db } from '@/db'
import { getKeys, verifySignedValue } from '@/lib/auth/crypto'
import type { Locale } from '@/lib/domain/types'
import { destroySession, switchHousehold } from '@/lib/auth/session'
import { finishLogin, finishRegistration, startLogin, startRegistration } from '@/lib/auth/webauthn'
import { acceptInvite, createUserWithHousehold, getInvite, listHouseholdsOf, registerViaInvite } from './households'

export type RegisterOptionsResult =
  | { ok: true; challengeId: string; options: PublicKeyCredentialCreationOptionsJSON }
  | { ok: false }

// null en inviteToken cuando la invitación no existe o ha caducado
export async function registerOptions(displayName: string, inviteToken: string | undefined): Promise<RegisterOptionsResult> {
  if (inviteToken && !(await getInvite(db, inviteToken))) return { ok: false }
  const r = await startRegistration(db, displayName)
  return { ok: true, ...r }
}

export async function registerVerify(input: {
  challengeId: string
  displayName: string
  inviteToken: string | undefined
  locale: Locale
  response: RegistrationResponseJSON
}): Promise<{ userId: string; householdId: string }> {
  const credential = await finishRegistration(db, { challengeId: input.challengeId, response: input.response })
  return input.inviteToken
    ? registerViaInvite(db, { token: input.inviteToken, displayName: input.displayName, credential, locale: input.locale })
    : createUserWithHousehold(db, { displayName: input.displayName, credential, locale: input.locale })
}

export function loginOptions(): Promise<{ challengeId: string; options: PublicKeyCredentialRequestOptionsJSON }> {
  return startLogin(db)
}

// null cuando el usuario autenticado no pertenece a ningún hogar (no debería pasar en flujo normal)
export async function loginVerify(input: {
  challengeId: string
  inviteToken: string | undefined
  response: AuthenticationResponseJSON
}): Promise<{ userId: string; householdId: string } | null> {
  const { userId } = await finishLogin(db, { challengeId: input.challengeId, response: input.response })
  let householdId: string | undefined
  if (input.inviteToken) householdId = (await acceptInvite(db, { token: input.inviteToken, userId })).householdId
  const households = await listHouseholdsOf(db, userId)
  householdId ??= households[0]?.id
  if (!householdId) return null
  return { userId, householdId }
}

export async function logoutSession(cookieValue: string | undefined): Promise<void> {
  const id = cookieValue ? verifySignedValue(cookieValue, getKeys().session) : null
  if (id) await destroySession(db, id)
}

export async function getInviteInfo(token: string): Promise<{ householdId: string; householdName: string; invitedBy: string } | null> {
  return getInvite(db, token)
}

// El usuario ya tiene sesión: aceptar la invitación y cambiar el hogar activo de la sesión
export async function joinInviteAsCurrentUser(input: { token: string; sessionId: string; userId: string }): Promise<{ householdId: string }> {
  const { householdId } = await acceptInvite(db, { token: input.token, userId: input.userId })
  await switchHousehold(db, input.sessionId, householdId)
  return { householdId }
}
