import { useState } from 'react';
import { usePrefs } from '../store/prefs';
import { useAuth } from '../data/auth';
import { useData } from '../data/storeContext';
import { stripHouseholdErrorTag } from '../data/householdErrors';
import { memberActions } from '../domain/householdRoles';
import { Sheet } from '../ui/Sheet';
import { Pressable } from '../ui/Pressable';
import { Pill } from '../ui/Chip';
import { Eyebrow } from '../ui/Card';
import { radius, text as T } from '../ui/tokens';

const rowStyle = {
  height: 48,
  borderRadius: radius.input,
  background: 'var(--warnsoft)',
  color: 'var(--warn-ink)',
  fontSize: 15.5,
  fontWeight: 600,
  textAlign: 'left' as const,
  padding: '0 16px',
};

/**
 * Hoja "Tu hogar": nombre, lista de miembros (con insignia "Admin" para
 * quien lo es) y las acciones destructivas que le corresponden a quien la
 * ve. "Salir del hogar" se muestra siempre — `leave_household()` decide si
 * procede (bloquea con un error claro si eres el único miembro, o el único
 * administrador con gente dentro). "Eliminar hogar" se muestra además, solo
 * a cualquier administrador (ya no hay un único propietario: cualquier
 * número de miembros puede serlo, ver `profile.is_admin`) — ser admin no te
 * quita la opción de simplemente salir si no eres el último.
 *
 * Quien ya es administrador puede además gestionar a los demás (reglas en
 * `domain/householdRoles.ts`): ascender a un miembro ("Hacer administrador",
 * `promote_admin`), quitarle el rol a otro admin ("Quitar admin",
 * `demote_admin`, sin confirmación: se deshace ascendiéndolo otra vez) y
 * sacar del hogar a un miembro que no sea admin ("Quitar", `remove_member`,
 * que sí pide confirmación vía `onRequestRemove`). Quien no es administrador
 * no ve esos controles en absoluto, ni siquiera deshabilitados.
 *
 * No abre los diálogos de confirmación ella misma — solo avisa hacia
 * arriba (`onRequestLeave`/`onRequestDelete`). Quien monta esta hoja
 * (`App.tsx`) la cierra primero y abre el diálogo después, porque
 * `AlertDialog` (zIndex 78) queda por debajo de `Sheet` (zIndex 80) en este
 * sistema de diseño y no hay precedente de apilar uno sobre otro — mismo
 * patrón que ya usa `Cook.tsx` para su diálogo de "¿Dejar de cocinar?".
 */
export function HouseholdSheet({
  onClose,
  onRequestLeave,
  onRequestDelete,
  onRequestRemove,
  onToast,
}: {
  onClose: () => void;
  onRequestLeave: () => void;
  onRequestDelete: () => void;
  /** Confirmación de "Quitar" (la abre `App.tsx`, mismo motivo que salir/eliminar). */
  onRequestRemove: (member: { id: string; displayName: string }) => void;
  onToast?: (msg: string) => void;
}) {
  const { t } = usePrefs();
  const { profile } = useAuth();
  const { household, promoteAdmin, demoteAdmin } = useData();
  /** Fila con una acción de rol en curso (ascender o quitar admin). */
  const [promotingId, setPromotingId] = useState<string | null>(null);

  if (!household) {
    return (
      <Sheet title={t.householdSheetTitle} onClose={onClose}>
        <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--muted)' }}>…</div>
      </Sheet>
    );
  }

  const myMember = household.members.find((m) => m.id === profile?.id);
  const amIAdmin = myMember?.isAdmin ?? false;

  const promote = async (memberId: string) => {
    if (promotingId) return;
    setPromotingId(memberId);
    try {
      await promoteAdmin(memberId);
      const member = household.members.find((m) => m.id === memberId);
      onToast?.(t.promotedAdminToast(member?.displayName ?? ''));
    } catch (e) {
      onToast?.(stripHouseholdErrorTag(e instanceof Error ? e.message : String(e)));
    } finally {
      setPromotingId(null);
    }
  };

  const demote = async (memberId: string) => {
    if (promotingId) return;
    setPromotingId(memberId);
    try {
      await demoteAdmin(memberId);
      const member = household.members.find((m) => m.id === memberId);
      onToast?.(t.demotedAdminToast(member?.displayName ?? ''));
    } catch (e) {
      onToast?.(stripHouseholdErrorTag(e instanceof Error ? e.message : String(e)));
    } finally {
      setPromotingId(null);
    }
  };

  const actionStyle = {
    flexShrink: 0,
    height: 40,
    padding: '0 12px',
    borderRadius: radius.chip,
    background: 'var(--surface2)',
    color: 'var(--text)',
    fontSize: 13,
    fontWeight: 600,
    opacity: promotingId !== null ? 0.6 : 1,
  };

  return (
    <Sheet title={t.householdSheetTitle} onClose={onClose}>
      <div style={{ paddingBottom: 6 }}>
        <div style={T.detailTitle}>{household.name}</div>
        <div style={{ marginTop: 2, fontSize: 14.5, color: 'var(--muted)' }}>
          {t.householdMembersCount(household.members.length)}
        </div>

        <Eyebrow style={{ marginTop: 22, marginBottom: 6 }}>{t.householdPeopleSection}</Eyebrow>
        <div>
          {household.members.map((m, i) => (
            <div key={m.id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', minHeight: 44 }}>
                <div
                  aria-hidden="true"
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: radius.pill,
                    background: 'var(--soft)',
                    color: 'var(--accent-ink)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 14,
                    fontWeight: 650,
                    flexShrink: 0,
                  }}
                >
                  {m.displayName.slice(0, 1).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0, fontSize: 15.5, fontWeight: 600 }}>{m.displayName}</div>
                {m.isAdmin && <Pill style={{ flexShrink: 0 }}>{t.adminBadge}</Pill>}
                {profile?.id === m.id && (
                  <div style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600, flexShrink: 0 }}>
                    {t.youTag}
                  </div>
                )}
                {(() => {
                  const can = memberActions({ viewerIsAdmin: amIAdmin, isSelf: profile?.id === m.id, memberIsAdmin: m.isAdmin });
                  return (
                    <>
                      {can.promote && (
                        <Pressable
                          onClick={() => void promote(m.id)}
                          disabled={promotingId !== null}
                          scale={0.95}
                          style={actionStyle}
                        >
                          {promotingId === m.id ? t.promotingAdmin : t.makeAdminAction}
                        </Pressable>
                      )}
                      {can.demote && (
                        <Pressable
                          onClick={() => void demote(m.id)}
                          disabled={promotingId !== null}
                          scale={0.95}
                          style={actionStyle}
                        >
                          {promotingId === m.id ? t.demotingAdmin : t.demoteAdminAction}
                        </Pressable>
                      )}
                      {can.remove && (
                        <Pressable
                          onClick={() => onRequestRemove({ id: m.id, displayName: m.displayName })}
                          disabled={promotingId !== null}
                          scale={0.95}
                          style={{ ...actionStyle, background: 'var(--warnsoft)', color: 'var(--warn-ink)' }}
                        >
                          {t.removeMemberAction}
                        </Pressable>
                      )}
                    </>
                  );
                })()}
              </div>
              {i < household.members.length - 1 && (
                <div style={{ height: 1, background: 'var(--line)', marginLeft: 48 }} />
              )}
            </div>
          ))}
        </div>

        <div style={{ marginTop: 24 }}>
          <Pressable onClick={onRequestLeave} scale={0.98} style={rowStyle}>
            {t.leaveHouseholdRow}
          </Pressable>
          {amIAdmin && (
            <>
              <Eyebrow style={{ marginTop: 20, marginBottom: 9, color: 'var(--warn-ink)' }}>
                {t.dangerZoneLabel}
              </Eyebrow>
              <Pressable onClick={onRequestDelete} scale={0.98} style={rowStyle}>
                {t.deleteHouseholdRow}
              </Pressable>
            </>
          )}
        </div>
      </div>
    </Sheet>
  );
}
