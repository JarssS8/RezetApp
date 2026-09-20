import { useState } from 'react';
import { usePrefs, ACCENTS } from '../store/prefs';
import { useData } from '../data/storeContext';
import { stripHouseholdErrorTag } from '../data/householdErrors';
import { memberActions } from '../domain/householdRoles';
import { formatKcal } from '../domain/units';
import { Sheet } from '../ui/Sheet';
import { Pressable } from '../ui/Pressable';
import { Pill } from '../ui/Chip';
import { Eyebrow } from '../ui/Card';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { TextField } from '../ui/Fields';
import { Icon } from '../ui/Icon';
import { radius, text as T } from '../ui/tokens';
import type { Accent, Member, MemberId } from '../types';

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
 * Hoja "Tu hogar": nombre, la lista de personas (con su avatar de color y su
 * objetivo diario — `Member`, no el `HouseholdMember` viejo) y las acciones
 * destructivas que le corresponden a quien la ve. "Salir del hogar" se
 * muestra siempre — `leave_household()` decide si procede (bloquea con un
 * error claro si eres el único miembro, o el único administrador con gente
 * dentro). "Eliminar hogar" se muestra además, solo a cualquier
 * administrador (ya no hay un único propietario: cualquier número de
 * miembros puede serlo, ver `profile.is_admin`) — ser admin no te quita la
 * opción de simplemente salir si no eres el último.
 *
 * Quién es "yo" y si soy administrador no sale de `useAuth()` aquí: se
 * deriva del propio `Store` (`myMemberId` → `member.authUserId` → el
 * `HouseholdMember` con ese id). Es la misma cuenta en los dos casos, pero
 * así el modo demo funciona sin sesión real: el miembro semilla "Ana" tiene
 * `authUserId` igual al único id de `DEMO_HOUSEHOLD.members`, así que sale
 * administradora sin necesitar un `useAuth()` que en demo nunca tiene perfil.
 *
 * Quien ya es administrador puede además gestionar las cuentas del hogar
 * (reglas en `domain/householdRoles.ts`): ascender a un miembro ("Hacer
 * administrador", `promote_admin`), quitarle el rol a otro admin ("Quitar
 * admin", `demote_admin`, sin confirmación: se deshace ascendiéndolo otra
 * vez) y sacar del hogar a un miembro que no sea admin ("Quitar",
 * `remove_member`, que sí pide confirmación vía `onRequestRemove`). Esos tres
 * botones solo tienen sentido para un `Member` con cuenta (`authUserId` no
 * nulo); un tutelado no los enseña — a él se le quita con "Quitar del hogar"
 * dentro de `MemberSheet`.
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
  onOpenMember,
  onToast,
}: {
  onClose: () => void;
  onRequestLeave: () => void;
  onRequestDelete: () => void;
  /** Confirmación de "Quitar" (la abre `App.tsx`, mismo motivo que salir/eliminar). */
  onRequestRemove: (member: { id: string; displayName: string }) => void;
  /** Abre `MemberSheet` para ver/editar nombre, color y objetivo de un miembro (la abre `App.tsx`). */
  onOpenMember: (memberId: MemberId) => void;
  onToast?: (msg: string) => void;
}) {
  const { t, locale } = usePrefs();
  const { household, members, myMemberId, promoteAdmin, demoteAdmin, createWardMember } = useData();
  /** Fila con una acción de rol en curso (ascender o quitar admin). */
  const [promotingId, setPromotingId] = useState<string | null>(null);
  const [addingWard, setAddingWard] = useState(false);
  const [wardName, setWardName] = useState('');
  const [wardColor, setWardColor] = useState<Accent>('green');
  const [wardBusy, setWardBusy] = useState(false);

  if (!household) {
    return (
      <Sheet title={t.householdSheetTitle} onClose={onClose}>
        <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--muted)' }}>…</div>
      </Sheet>
    );
  }

  const me = members.find((m) => m.id === myMemberId);
  const myAccount = me?.authUserId ? household.members.find((hm) => hm.id === me.authUserId) : undefined;
  const amIAdmin = myAccount?.isAdmin ?? false;

  const visibleMembers = [...members]
    .filter((m) => m.deletedAt === null)
    .sort((a, b) => a.sortOrder - b.sortOrder);

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

  const submitWard = async () => {
    if (!wardName.trim() || wardBusy) return;
    setWardBusy(true);
    try {
      await createWardMember(wardName.trim(), wardColor);
      setWardName('');
      setWardColor('green');
      setAddingWard(false);
    } catch (e) {
      onToast?.(stripHouseholdErrorTag(e instanceof Error ? e.message : String(e)) || t.memberActionError);
    } finally {
      setWardBusy(false);
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
          {t.householdMembersCount(visibleMembers.length)}
        </div>

        <Eyebrow style={{ marginTop: 22, marginBottom: 6 }}>{t.householdPeopleSection}</Eyebrow>
        <div>
          {visibleMembers.map((m: Member, i) => {
            const hm = m.authUserId ? household.members.find((x) => x.id === m.authUserId) : undefined;
            const isSelf = m.id === myMemberId;
            const can = hm
              ? memberActions({ viewerIsAdmin: amIAdmin, isSelf, memberIsAdmin: hm.isAdmin })
              : { promote: false, demote: false, remove: false };
            return (
              <div key={m.id}>
                <Pressable
                  onClick={() => onOpenMember(m.id)}
                  scale={0.99}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 0',
                    minHeight: 44,
                    textAlign: 'left',
                  }}
                >
                  <Avatar member={m} size={38} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15.5, fontWeight: 600 }}>{m.displayName}</div>
                    <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                      {formatKcal(m.kcalTarget, locale)} {t.kcal}
                    </div>
                  </div>
                  {hm?.isAdmin && <Pill style={{ flexShrink: 0 }}>{t.adminBadge}</Pill>}
                  {isSelf && (
                    <div style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600, flexShrink: 0 }}>
                      {t.youTag}
                    </div>
                  )}
                </Pressable>
                {(can.promote || can.demote || can.remove) && (
                  <div style={{ display: 'flex', gap: 8, paddingBottom: 10 }}>
                    {can.promote && (
                      <Pressable
                        onClick={() => void promote(hm!.id)}
                        disabled={promotingId !== null}
                        scale={0.95}
                        style={actionStyle}
                      >
                        {promotingId === hm!.id ? t.promotingAdmin : t.makeAdminAction}
                      </Pressable>
                    )}
                    {can.demote && (
                      <Pressable
                        onClick={() => void demote(hm!.id)}
                        disabled={promotingId !== null}
                        scale={0.95}
                        style={actionStyle}
                      >
                        {promotingId === hm!.id ? t.demotingAdmin : t.demoteAdminAction}
                      </Pressable>
                    )}
                    {can.remove && (
                      <Pressable
                        onClick={() => onRequestRemove({ id: hm!.id, displayName: m.displayName })}
                        disabled={promotingId !== null}
                        scale={0.95}
                        style={{ ...actionStyle, background: 'var(--warnsoft)', color: 'var(--warn-ink)' }}
                      >
                        {t.removeMemberAction}
                      </Pressable>
                    )}
                  </div>
                )}
                {i < visibleMembers.length - 1 && (
                  <div style={{ height: 1, background: 'var(--line)', marginLeft: 48 }} />
                )}
              </div>
            );
          })}
        </div>

        {amIAdmin && !addingWard && (
          <Pressable
            onClick={() => setAddingWard(true)}
            scale={0.98}
            style={{
              ...actionStyle,
              width: '100%',
              height: 46,
              marginTop: 14,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <Icon name="plus" size={15} strokeWidth={2.2} />
            {t.addWardMember}
          </Pressable>
        )}

        {amIAdmin && addingWard && (
          <div
            style={{
              marginTop: 14,
              padding: 14,
              borderRadius: radius.list,
              background: 'var(--surface2)',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            {/* Aviso de privacidad de la spec §3.2: dentro del propio formulario,
                visible siempre, no detrás de un enlace — hay que leerlo antes de
                poder crear a nadie. */}
            <div style={{ fontSize: 13, lineHeight: 1.45, color: 'var(--muted)' }}>{t.addWardMemberBody}</div>
            <div>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 6 }}>{t.memberName}</div>
              <TextField value={wardName} onChange={setWardName} placeholder={t.memberName} />
            </div>
            <div>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>{t.memberColor}</div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {(Object.keys(ACCENTS) as Accent[]).map((key) => (
                  <Pressable
                    key={key}
                    onClick={() => setWardColor(key)}
                    ariaLabel={key}
                    scale={0.9}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: radius.pill,
                      background: ACCENTS[key],
                      border: `2px solid ${wardColor === key ? 'var(--text)' : 'transparent'}`,
                    }}
                  />
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button
                variant="secondary"
                onClick={() => {
                  setAddingWard(false);
                  setWardName('');
                }}
                disabled={wardBusy}
                style={{ flex: 1 }}
              >
                {t.cancel}
              </Button>
              <Button onClick={() => void submitWard()} disabled={!wardName.trim() || wardBusy} style={{ flex: 1 }}>
                {t.addWardMemberAction}
              </Button>
            </div>
          </div>
        )}

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
