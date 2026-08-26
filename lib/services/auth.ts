// Envoltorios finos para las rutas de app/api/auth/**: los ficheros bajo app/
// no pueden importar '@/db' directamente (regla de boundaries de eslint), así
// que estas funciones resuelven la conexión aquí y exponen solo lo necesario.
import 'server-only'
import type {
  AuthenticationResponseJSON, PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON, RegistrationResponseJSON,
} from '@simplewebauthn/server'
import { db } from '@/db'
import { getKeys, verifySignedValue } from '@/lib/auth/crypto'
import type { Locale } from '@/lib/domain/types'
import { destroySession, switchHousehold } from '@/lib/auth/session'
import { finishLogin, finishRegistration, startLogin, startRegistration } from '@/lib/auth/webauthn'
import { ServiceError } from './ctx'
import { acceptInvite, createUserWithHousehold, getInvite, isRegistrationOpen, listHouseholdsOf, registerViaInvite } from './households'

export type RegisterOptionsResult =
  | { ok: true; challengeId: string; options: PublicKeyCredentialCreationOptionsJSON }
  | { ok: false; reason: 'invalid_invite' | 'registration_closed' }

// ¿Puede alguien crear cuenta sin invitación? (regla W1-R18)
export function registrationOpen(): Promise<boolean> {
  return isRegistrationOpen(db)
}

// invalid_invite cuando la invitación no existe o ha caducado;
// registration_closed cuando no hay invitación y el registro está cerrado
export async function registerOptions(displayName: string, inviteToken: string | undefined): Promise<RegisterOptionsResult> {
  if (inviteToken) {
    if (!(await getInvite(db, inviteToken))) return { ok: false, reason: 'invalid_invite' }
  } else if (!(await isRegistrationOpen(db))) {
    return { ok: false, reason: 'registration_closed' }
  }
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
  // Se revisa otra vez aquí: entre /options y /verify el registro pudo cerrarse,
  // y /verify es el que crea la cuenta de verdad
  if (!input.inviteToken && !(await isRegistrationOpen(db))) throw new ServiceError('forbidden', 'El registro está cerrado')
  const credential = await finishRegistration(db, { challengeId: input.challengeId, response: input.response })
  return input.inviteToken
    ? registerViaInvite(db, { token: input.inviteToken, displayName: input.displayName, credential, locale: input.locale })
    : createUserWithHousehold(db, { displayName: input.displayName, credential, locale: input.locale })
}

export function loginOptions(): Promise<{ challengeId: string; options: PublicKeyCredentialRequestOptionsJSON }> {
  return startLogin(db)
}

// null cuando el usuario autenticado no pertenece a ningún hogar (no debería pasar en flujo normal).
// Si la invitación falla tras un login ya verificado, no rebotamos al usuario: seguimos con su
// hogar habitual y devolvemos inviteError para que la UI lo informe si quiere.
export async function loginVerify(input: {
  challengeId: string
  inviteToken: string | undefined
  response: AuthenticationResponseJSON
}): Promise<{ userId: string; householdId: string; inviteError: 'invalid' | null } | null> {
  const { userId } = await finishLogin(db, { challengeId: input.challengeId, response: input.response })
  let householdId: string | undefined
  let inviteError: 'invalid' | null = null
  if (input.inviteToken) {
    try {
      householdId = (await acceptInvite(db, { token: input.inviteToken, userId })).householdId
    } catch (e) {
      console.error('loginVerify: no se pudo aceptar la invitación, se continúa con el hogar habitual', e)
      inviteError = 'invalid'
    }
  }
  const households = await listHouseholdsOf(db, userId)
  householdId ??= households[0]?.id
  if (!householdId) return null
  return { userId, householdId, inviteError }
}

export async function logoutSession(cookieValue: string | undefined): Promise<void> {
  const id = cookieValue ? verifySignedValue(cookieValue, getKeys().session) : null
  if (id) await destroySession(db, id)
}

export function getInviteInfo(token: string): Promise<{ householdId: string; householdName: string; invitedBy: string } | null> {
  return getInvite(db, token)
}

// El usuario ya tiene sesión: si ya es miembro del hogar de la invitación, no se
// consume el token (evita quemar una invitación de un solo uso para otros); si no,
// se acepta y se cambia el hogar activo de la sesión.
export async function joinInviteAsCurrentUser(input: { token: string; sessionId: string; userId: string }): Promise<{ householdId: string }> {
  const invite = await getInvite(db, input.token)
  if (!invite) throw new ServiceError('not_found', 'Invitación inválida o caducada')
  const households = await listHouseholdsOf(db, input.userId)
  const alreadyMember = households.some((h) => h.id === invite.householdId)
  const householdId = alreadyMember ? invite.householdId : (await acceptInvite(db, { token: input.token, userId: input.userId })).householdId
  await switchHousehold(db, input.sessionId, householdId)
  return { householdId }
}
