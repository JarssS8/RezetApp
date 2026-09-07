/**
 * `leave_household()`/`delete_household()`/`promote_admin()`/`delete_account()`
 * (migración `20260907181314_rezet_multi_admin_household_and_delete_account.sql`)
 * prefijan sus rechazos conocidos con una etiqueta estable en mayúsculas antes
 * de la prosa en español, para que la UI pueda distinguir el caso sin
 * depender del texto exacto (que podría cambiar de redacción). Único punto de
 * estas constantes — `LeaveHouseholdDialogs.tsx`, `DeleteHouseholdFlow.tsx`,
 * `DeleteAccountFlow.tsx` y `HouseholdSheet.tsx` las comparten.
 */
export const REZET_SOLE_MEMBER = 'REZET_SOLE_MEMBER:';
/** Único administrador del hogar, con otros miembros dentro: sale de `leave_household()` y `delete_account()`. */
export const REZET_LAST_ADMIN = 'REZET_LAST_ADMIN:';
/** `delete_household()`: quien llama no es administrador. */
export const REZET_NOT_ADMIN = 'REZET_NOT_ADMIN:';
/** `promote_admin()`: el objetivo no pertenece al hogar de quien llama. */
export const REZET_NOT_A_MEMBER = 'REZET_NOT_A_MEMBER:';

/** Quita el prefijo `REZET_..._TAG: ` de un mensaje de error del backend, si lo tiene. */
export function stripHouseholdErrorTag(message: string): string {
  return message.replace(/^REZET_[A-Z_]+:\s*/, '');
}
