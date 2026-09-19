import { useState } from 'react';
import { usePrefs } from '../store/prefs';
import { useAuth } from '../data/auth';
import { useData } from '../data/storeContext';
import { stripHouseholdErrorTag } from '../data/householdErrors';
import { AlertDialog } from '../ui/Sheet';
import { radius } from '../ui/tokens';

function ErrorNote({ message }: { message: string }) {
  return (
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
      {message}
    </div>
  );
}

/**
 * "¿Quitar a {nombre} del hogar?" — confirmación de `remove_member()`. Mismo
 * patrón que `LeaveConfirmDialog`: el rechazo del backend se muestra sin la
 * etiqueta `REZET_...:` dentro del propio diálogo.
 */
export function RemoveMemberDialog({
  member,
  onCancel,
  onRemoved,
}: {
  member: { id: string; displayName: string };
  onCancel: () => void;
  onRemoved: () => void;
}) {
  const { t } = usePrefs();
  const { removeMember } = useData();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await removeMember(member.id);
      onRemoved();
    } catch (e) {
      setBusy(false);
      setError(stripHouseholdErrorTag(e instanceof Error ? e.message : String(e)));
    }
  };

  return (
    <AlertDialog
      title={t.removeMemberTitle(member.displayName)}
      body={t.removeMemberBody}
      cancelLabel={t.cancel}
      confirmLabel={t.removeMemberAction}
      confirmDisabled={busy}
      onCancel={onCancel}
      onConfirm={() => void confirm()}
    >
      {error && <ErrorNote message={error} />}
    </AlertDialog>
  );
}

/**
 * "¿Cerrar sesión en todos los dispositivos?" — `signOut({ scope: 'global' })`.
 * Al terminar, el cambio de sesión de `auth.tsx` lleva a Login solo; aquí
 * solo hay que mostrar el error si GoTrue lo rechaza.
 */
export function SignOutEverywhereDialog({ onCancel }: { onCancel: () => void }) {
  const { t } = usePrefs();
  const { signOutEverywhere } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await signOutEverywhere();
    } catch {
      setBusy(false);
      setError(t.signOutEverywhereError);
    }
  };

  return (
    <AlertDialog
      title={t.signOutEverywhereTitle}
      body={t.signOutEverywhereBody}
      cancelLabel={t.cancel}
      confirmLabel={t.signOutEverywhereConfirm}
      confirmDisabled={busy}
      onCancel={onCancel}
      onConfirm={() => void confirm()}
    >
      {error && <ErrorNote message={error} />}
    </AlertDialog>
  );
}
