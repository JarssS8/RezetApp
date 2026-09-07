import { useState, type CSSProperties } from 'react';
import { usePrefs } from '../store/prefs';
import { useAuth } from '../data/auth';
import { useData } from '../data/storeContext';
import { REZET_LAST_ADMIN, stripHouseholdErrorTag } from '../data/householdErrors';
import { Sheet, AlertDialog } from '../ui/Sheet';
import { Button } from '../ui/Button';
import { Icon, type IconName } from '../ui/Icon';
import { TextField } from '../ui/Fields';
import { radius } from '../ui/tokens';

const itemRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '11px 4px',
  fontSize: 15,
  color: 'var(--text)',
  borderBottom: '1px solid var(--line)',
};

/**
 * Paso 1 de eliminar la cuenta: consecuencias detalladas antes de seguir.
 * Mismo patrón en dos pasos que `DeleteHouseholdFlow.tsx`, pero las
 * consecuencias son otras — esto borra la cuenta de Auth de quien lo pide,
 * no el hogar entero, salvo un caso: si eres el único miembro del hogar,
 * borrarte a ti también se lleva el hogar por delante (mismo resultado que
 * `DeleteIntroSheet`, explicado aquí en vez de con el hogar como sujeto). Si
 * hay más gente, tu cuenta se va y el hogar sigue existiendo para el resto.
 *
 * `household.membersLoaded` puede seguir en `false` cuando esta hoja se abre
 * justo tras abrir Ajustes (esa query solo se pide con la hoja de hogar
 * abierta — ver `supabaseStore.tsx`); mientras tanto se muestra un estado de
 * carga en vez de adivinar si eres el único miembro.
 */
export function DeleteAccountIntroSheet({ onClose, onContinue }: { onClose: () => void; onContinue: () => void }) {
  const { t } = usePrefs();
  const { household, recipes } = useData();

  if (!household) return null;

  const membersLoaded = household.membersLoaded;
  const othersCount = membersLoaded ? Math.max(0, household.members.length - 1) : 0;
  const soleMember = membersLoaded && othersCount === 0;

  const items: Array<{ icon: IconName; label: string }> = soleMember
    ? [
        { icon: 'book', label: t.deleteIntroRecipesCount(recipes.length) },
        { icon: 'calendar', label: t.deleteIntroPlanRow },
        { icon: 'shelf', label: t.deleteIntroPantryRow },
        { icon: 'home', label: t.deleteAccountSoleMemberHouseholdRow },
      ]
    : [{ icon: 'home', label: t.deleteAccountSharedHouseholdRow(household.name) }];

  return (
    <Sheet title={t.deleteAccountIntroTitle} onClose={onClose}>
      <div style={{ paddingBottom: 6 }}>
        <div style={{ fontSize: 15, color: 'var(--muted)', lineHeight: 1.5 }}>
          {t.deleteIntroBodyLead} <strong style={{ color: 'var(--warn-ink)' }}>{t.irreversibleWord}</strong>{' '}
          {membersLoaded ? (soleMember ? t.deleteAccountIntroBodySole : t.deleteAccountIntroBodyShared) : '…'}
        </div>

        <div style={{ marginTop: 10 }}>
          {membersLoaded ? (
            items.map((item, i) => (
              <div
                key={item.label}
                style={i === items.length - 1 ? { ...itemRowStyle, borderBottom: 'none' } : itemRowStyle}
              >
                <span style={{ color: 'var(--muted)', display: 'flex' }}>
                  <Icon name={item.icon} size={16} strokeWidth={1.8} />
                </span>
                {item.label}
              </div>
            ))
          ) : (
            <div style={{ ...itemRowStyle, borderBottom: 'none', color: 'var(--muted)' }}>…</div>
          )}
        </div>

        <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Button full variant="danger" size="cta" onClick={onContinue}>
            {t.continueAction}
          </Button>
          <Button full variant="quiet" size="secondary" onClick={onClose}>
            {t.cancel}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}

/**
 * Paso 2, final: escribir un valor de confirmación exacto. Al no haber un
 * "nombre de hogar" que sirva aquí (esto es una cuenta personal), se pide el
 * correo de la sesión (`session.user.email`, ya lo conoce quien la usa) — y
 * solo si no hay correo disponible (p. ej. alta con passkey sin correo
 * asociado) se cae a una palabra fija ("ELIMINAR"/"DELETE" según idioma).
 * Comparación sin distinguir mayúsculas ni espacios sobrantes, igual que
 * `DeleteConfirmDialog` del hogar.
 *
 * Si el RPC rechaza con `REZET_LAST_ADMIN:` (eres el único administrador y
 * quedan otros miembros), se avisa a `onLastAdmin` para mostrar
 * `DeleteAccountLastAdminDialog` en vez de un error genérico, con un camino
 * de vuelta a "Tu hogar" para ascender a alguien primero.
 */
export function DeleteAccountConfirmDialog({
  onCancel,
  onDeleted,
  onLastAdmin,
}: {
  onCancel: () => void;
  onDeleted: () => void;
  onLastAdmin: () => void;
}) {
  const { t, locale } = usePrefs();
  const { deleteAccount } = useData();
  const { session } = useAuth();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmationValue = session?.user.email ?? (locale === 'es' ? 'ELIMINAR' : 'DELETE');
  const matches = typed.trim().toLowerCase() === confirmationValue.trim().toLowerCase();

  const confirm = async () => {
    if (busy || !matches) return;
    setBusy(true);
    setError(null);
    try {
      await deleteAccount();
      onDeleted();
    } catch (e) {
      setBusy(false);
      const message = e instanceof Error ? e.message : String(e);
      if (message.startsWith(REZET_LAST_ADMIN)) {
        onLastAdmin();
        return;
      }
      setError(stripHouseholdErrorTag(message));
    }
  };

  return (
    <AlertDialog
      title={t.deleteAccountConfirmTitle}
      body={t.deleteAccountConfirmBody}
      cancelLabel={t.cancel}
      confirmLabel={t.deleteForeverAccountAction}
      confirmDisabled={busy || !matches}
      onCancel={onCancel}
      onConfirm={() => void confirm()}
    >
      <div style={{ marginTop: 16, textAlign: 'left' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>
          {t.deleteConfirmTypePrefix} <strong style={{ color: 'var(--text)' }}>{confirmationValue}</strong>{' '}
          {t.deleteConfirmTypeSuffix}
        </div>
        <TextField
          value={typed}
          onChange={setTyped}
          placeholder={confirmationValue}
          ariaLabel={`${t.deleteConfirmTypePrefix} ${confirmationValue}`}
        />
        {error && (
          <div
            style={{
              marginTop: 10,
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
      </div>
    </AlertDialog>
  );
}

/**
 * Caso borde de `delete_account()`, mismo patrón que `LeaveLastAdminDialog`
 * (mismo título compartido, cuerpo propio para "borrar tu cuenta" en vez de
 * "salir"): no es un callejón sin salida, ofrece volver a "Tu hogar" para
 * ascender a alguien más antes de intentarlo de nuevo.
 */
export function DeleteAccountLastAdminDialog({
  onCancel,
  onGoToHousehold,
}: {
  onCancel: () => void;
  onGoToHousehold: () => void;
}) {
  const { t } = usePrefs();

  return (
    <AlertDialog
      title={t.lastAdminTitle}
      body={t.deleteAccountLastAdminBody}
      cancelLabel={t.cancel}
      confirmLabel={t.goToHouseholdAction}
      onCancel={onCancel}
      onConfirm={onGoToHousehold}
    />
  );
}
