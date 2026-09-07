import { useState } from 'react';
import { usePrefs } from '../store/prefs';
import { useData } from '../data/storeContext';
import { REZET_OWNER_WITH_MEMBERS, REZET_SOLE_MEMBER, stripHouseholdErrorTag } from '../data/householdErrors';
import { AlertDialog } from '../ui/Sheet';
import { radius } from '../ui/tokens';

/**
 * "¿Salir de {hogar}?" — confirmación normal de `leave_household()`. Si el
 * RPC rechaza con la etiqueta `REZET_SOLE_MEMBER:` (condición de carrera:
 * p. ej. el resto salió justo antes de que esto se ejecutara), se lo pasa a
 * `onSoleMember` para que quien monta este diálogo muestre
 * `LeaveLastMemberDialog` en su lugar en vez de un error genérico. Si
 * rechaza con `REZET_OWNER_WITH_MEMBERS:` (hoy inalcanzable desde esta UI
 * porque el propietario nunca ve la fila "Salir", pero el backend sigue
 * rechazándolo) se muestra su copia localizada. Cualquier otro rechazo
 * muestra el mensaje del backend sin la etiqueta, tal cual.
 */
export function LeaveConfirmDialog({
  onCancel,
  onLeft,
  onSoleMember,
}: {
  onCancel: () => void;
  onLeft: () => void;
  onSoleMember: () => void;
}) {
  const { t } = usePrefs();
  const { household, leaveHousehold } = useData();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!household) return null;

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await leaveHousehold();
      onLeft();
    } catch (e) {
      setBusy(false);
      const message = e instanceof Error ? e.message : String(e);
      if (message.startsWith(REZET_SOLE_MEMBER)) {
        onSoleMember();
        return;
      }
      if (message.startsWith(REZET_OWNER_WITH_MEMBERS)) {
        setError(t.leaveOwnerWithMembersError);
        return;
      }
      setError(stripHouseholdErrorTag(message));
    }
  };

  return (
    <AlertDialog
      title={t.leaveConfirmTitle(household.name)}
      body={t.leaveConfirmBody}
      cancelLabel={t.cancel}
      confirmLabel={t.leaveHouseholdRow}
      confirmDisabled={busy}
      onCancel={onCancel}
      onConfirm={() => void confirm()}
    >
      {error && (
        <div
          style={{
            marginTop: 14,
            fontSize: 13.5,
            color: 'var(--warn-ink)',
            background: 'var(--warnsoft)',
            borderRadius: radius.chip,
            padding: '10px 12px',
          }}
        >
          {error}
        </div>
      )}
    </AlertDialog>
  );
}

/**
 * Caso borde: quien intenta salir es la única persona del hogar. En la
 * práctica esto no debería ser alcanzable desde "Salir del hogar" (esa fila
 * no se muestra al propietario, y quien no es propietario nunca está solo:
 * si hay alguien más, ese alguien es al menos el propietario) — existe como
 * respuesta defensiva a lo que devuelva el RPC, no como flujo principal.
 */
export function LeaveLastMemberDialog({
  onCancel,
  onDeleteInstead,
}: {
  onCancel: () => void;
  onDeleteInstead: () => void;
}) {
  const { t } = usePrefs();
  const { household } = useData();
  if (!household) return null;

  return (
    <AlertDialog
      title={t.leaveLastMemberTitle}
      body={t.leaveLastMemberBody(household.name)}
      cancelLabel={t.cancel}
      confirmLabel={t.deleteInsteadAction}
      onCancel={onCancel}
      onConfirm={onDeleteInstead}
    />
  );
}
