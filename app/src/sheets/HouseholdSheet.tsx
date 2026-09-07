import { usePrefs } from '../store/prefs';
import { useAuth } from '../data/auth';
import { useData } from '../data/storeContext';
import { Sheet } from '../ui/Sheet';
import { Icon } from '../ui/Icon';
import { Button } from '../ui/Button';
import { Eyebrow } from '../ui/Card';
import { radius, text as T } from '../ui/tokens';

/**
 * Hoja "Tu hogar": nombre, lista de miembros y la única acción destructiva
 * que le corresponde a quien la ve — "Salir del hogar" para el resto,
 * "Eliminar hogar" solo para quien lo creó (`household.ownerId`). Nunca
 * ambas a la vez, siguiendo la regla del backend (`leave_household`/
 * `delete_household`): el propietario no puede salir mientras queden otros
 * miembros, así que no tiene sentido ofrecerle esa opción.
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
}: {
  onClose: () => void;
  onRequestLeave: () => void;
  onRequestDelete: () => void;
}) {
  const { t } = usePrefs();
  const { profile } = useAuth();
  const { household } = useData();

  if (!household) {
    return (
      <Sheet title={t.householdSheetTitle} onClose={onClose}>
        <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--muted)' }}>…</div>
      </Sheet>
    );
  }

  const isOwner = profile != null && household.ownerId === profile.id;

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
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', minHeight: 44 }}>
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
                {profile?.id === m.id && (
                  <div style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>{t.youTag}</div>
                )}
              </div>
              {i < household.members.length - 1 && (
                <div style={{ height: 1, background: 'var(--line)', marginLeft: 50 }} />
              )}
            </div>
          ))}
        </div>

        <div style={{ marginTop: 24 }}>
          {isOwner ? (
            <Button
              full
              variant="danger"
              size="cta"
              icon={<Icon name="trash" size={18} strokeWidth={1.8} />}
              onClick={onRequestDelete}
            >
              {t.deleteHouseholdRow}
            </Button>
          ) : (
            <Button
              full
              variant="danger"
              size="cta"
              icon={<Icon name="logout" size={18} strokeWidth={1.8} />}
              onClick={onRequestLeave}
            >
              {t.leaveHouseholdRow}
            </Button>
          )}
        </div>
      </div>
    </Sheet>
  );
}
