/**
 * `leave_household()`/`delete_household()` (migración
 * `20260907161449_rezet_leave_delete_household_error_tags.sql`) prefijan sus
 * rechazos conocidos con una etiqueta estable en mayúsculas antes de la
 * prosa en español, para que la UI pueda distinguir el caso sin depender del
 * texto exacto (que podría cambiar de redacción). Único punto de estas
 * constantes — `LeaveHouseholdDialogs.tsx` y `DeleteHouseholdFlow.tsx` las
 * comparten.
 */
export const REZET_SOLE_MEMBER = 'REZET_SOLE_MEMBER:';
export const REZET_OWNER_WITH_MEMBERS = 'REZET_OWNER_WITH_MEMBERS:';
export const REZET_NOT_OWNER = 'REZET_NOT_OWNER:';

/** Quita el prefijo `REZET_..._TAG: ` de un mensaje de error del backend, si lo tiene. */
export function stripHouseholdErrorTag(message: string): string {
  return message.replace(/^REZET_[A-Z_]+:\s*/, '');
}
