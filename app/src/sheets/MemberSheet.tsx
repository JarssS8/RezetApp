import { useState } from 'react';
import { usePrefs, ACCENTS } from '../store/prefs';
import { useData } from '../data/storeContext';
import { stripHouseholdErrorTag } from '../data/householdErrors';
import { formatKcal } from '../domain/units';
import { Sheet } from '../ui/Sheet';
import { Avatar } from '../ui/Avatar';
import { Pressable } from '../ui/Pressable';
import { Button } from '../ui/Button';
import { Stepper } from '../ui/Stepper';
import { TextField } from '../ui/Fields';
import { Eyebrow } from '../ui/Card';
import { radius } from '../ui/tokens';
import type { Accent, MemberId } from '../types';

/** Objetivo diario en pasos de 50 kcal, entre 500 y 6000 — evita valores absurdos sin imponer una cifra "correcta". */
const KCAL_STEP = 50;
const KCAL_MIN = 500;
const KCAL_MAX = 6000;

/**
 * Hoja de un miembro (`HouseholdSheet` la abre al tocar una fila): nombre,
 * color y objetivo de kcal propios, y "Quitar del hogar" cuando corresponde.
 * Sigue el patrón de `PantryAddSheet` — formulario simple con un botón de
 * guardar explícito, sin autosave por campo.
 *
 * "Quién soy" y si soy administrador se derivan del propio `Store`
 * (`myMemberId` → `member.authUserId` → el `HouseholdMember` con ese id),
 * igual que en `HouseholdSheet` — así funciona en demo sin `useAuth()`.
 */
export function MemberSheet({
  memberId,
  onClose,
  onToast,
}: {
  memberId: MemberId;
  onClose: () => void;
  onToast?: (msg: string) => void;
}) {
  const { t, locale } = usePrefs();
  const { members, myMemberId, household, setMemberSettings, deleteWardMember } = useData();
  const member = members.find((m) => m.id === memberId);

  const [displayName, setDisplayName] = useState(member?.displayName ?? '');
  const [color, setColor] = useState<Accent>(member?.color ?? 'green');
  const [kcalTarget, setKcalTarget] = useState(member?.kcalTarget ?? 2000);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);

  if (!member) {
    return (
      <Sheet title={t.memberSheetTitle} onClose={onClose}>
        <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--muted)' }}>…</div>
      </Sheet>
    );
  }

  // Un miembro borrado solo existe para poner nombre al historial (regla del
  // contrato `Store`): no se enseña ningún control de edición sobre él.
  if (member.deletedAt) {
    return (
      <Sheet title={member.displayName} onClose={onClose}>
        <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--muted)' }}>{t.memberInactive}</div>
      </Sheet>
    );
  }

  const me = members.find((m) => m.id === myMemberId);
  const myAccount = me?.authUserId ? household?.members.find((hm) => hm.id === me.authUserId) : undefined;
  const amIAdmin = myAccount?.isAdmin ?? false;

  const save = async () => {
    if (!displayName.trim() || saving) return;
    setSaving(true);
    try {
      await setMemberSettings(memberId, { displayName: displayName.trim(), color, kcalTarget });
      onClose();
    } catch (e) {
      onToast?.(stripHouseholdErrorTag(e instanceof Error ? e.message : String(e)) || t.memberActionError);
    } finally {
      setSaving(false);
    }
  };

  const removeWard = async () => {
    if (removing) return;
    setRemoving(true);
    try {
      await deleteWardMember(memberId);
      onClose();
    } catch (e) {
      onToast?.(stripHouseholdErrorTag(e instanceof Error ? e.message : String(e)) || t.memberActionError);
    } finally {
      setRemoving(false);
    }
  };

  return (
    <Sheet title={t.memberSheetTitle} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          {/* Vista previa en vivo: el avatar refleja nombre/color todavía sin guardar. */}
          <Avatar member={{ ...member, displayName, color }} size={64} />
        </div>

        <div>
          <Eyebrow style={{ marginBottom: 9 }}>{t.memberName}</Eyebrow>
          <TextField value={displayName} onChange={setDisplayName} placeholder={t.memberName} />
        </div>

        <div>
          <Eyebrow style={{ marginBottom: 9 }}>{t.memberColor}</Eyebrow>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {(Object.keys(ACCENTS) as Accent[]).map((key) => (
              <Pressable
                key={key}
                onClick={() => setColor(key)}
                ariaLabel={key}
                scale={0.9}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: radius.pill,
                  background: ACCENTS[key],
                  border: `2px solid ${color === key ? 'var(--text)' : 'transparent'}`,
                }}
              />
            ))}
          </div>
        </div>

        <div>
          <Eyebrow style={{ marginBottom: 9 }}>{t.memberKcalTarget}</Eyebrow>
          <Stepper
            value={kcalTarget}
            formatted={`${formatKcal(kcalTarget, locale)} ${t.kcal}`}
            valueWidth={110}
            onDecrement={() => setKcalTarget((v) => Math.max(KCAL_MIN, v - KCAL_STEP))}
            onIncrement={() => setKcalTarget((v) => Math.min(KCAL_MAX, v + KCAL_STEP))}
            label={t.memberKcalTarget}
          />
        </div>

        <Button
          full
          disabled={!displayName.trim() || saving}
          onClick={() => void save()}
          style={{ borderRadius: radius.button }}
        >
          {t.save}
        </Button>

        {member.isWard && amIAdmin && (
          <Pressable
            onClick={() => void removeWard()}
            disabled={removing}
            scale={0.98}
            style={{
              height: 48,
              borderRadius: radius.input,
              background: 'var(--warnsoft)',
              color: 'var(--warn-ink)',
              fontSize: 15.5,
              fontWeight: 600,
              opacity: removing ? 0.6 : 1,
            }}
          >
            {t.removeWardMember}
          </Pressable>
        )}
      </div>
    </Sheet>
  );
}
