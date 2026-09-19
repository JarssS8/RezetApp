/**
 * Qué puede hacer quien mira "Tu hogar" con un miembro concreto. Espejo de
 * las reglas de promote_admin / demote_admin / remove_member en el servidor
 * (20260919100100_rezet_remove_member_demote_admin.sql), que es quien decide
 * de verdad: esto solo elige qué botones se enseñan.
 *
 * - Solo un admin gestiona a otros; nadie se gestiona a sí mismo aquí (para
 *   salir está "Salir del hogar").
 * - A un admin no se le expulsa directamente: primero se le quita el rol.
 */
export function memberActions(opts: { viewerIsAdmin: boolean; isSelf: boolean; memberIsAdmin: boolean }): {
  promote: boolean;
  demote: boolean;
  remove: boolean;
} {
  const canManage = opts.viewerIsAdmin && !opts.isSelf;
  return {
    promote: canManage && !opts.memberIsAdmin,
    demote: canManage && opts.memberIsAdmin,
    remove: canManage && !opts.memberIsAdmin,
  };
}
