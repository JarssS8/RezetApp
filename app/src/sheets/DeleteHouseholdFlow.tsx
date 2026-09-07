import { useState, type CSSProperties } from 'react';
import { usePrefs } from '../store/prefs';
import { useData } from '../data/storeContext';
import { buildHouseholdExport, downloadHouseholdExport } from '../data/householdExport';
import { REZET_NOT_OWNER, stripHouseholdErrorTag } from '../data/householdErrors';
import { Sheet, AlertDialog } from '../ui/Sheet';
import { Button } from '../ui/Button';
import { Icon, type IconName } from '../ui/Icon';
import { Pressable } from '../ui/Pressable';
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
 * Paso 1 de eliminar el hogar: consecuencias detalladas + exportar copia en
 * JSON antes de seguir. El título usa el color de texto por defecto de
 * `Sheet` (nunca `--warn-ink`: esa ficha se reserva a texto pequeño de
 * estado/etiqueta/botón en este sistema de diseño, nunca a una cabecera
 * entera) — la lista ya deja clara la gravedad.
 */
export function DeleteIntroSheet({ onClose, onContinue }: { onClose: () => void; onContinue: () => void }) {
  const { t, locale } = usePrefs();
  const { household, recipes, ingredientById } = useData();
  const [exportedCount, setExportedCount] = useState<number | null>(null);

  if (!household) return null;

  // `household.membersLoaded` puede seguir en `false` cuando esta hoja se abre justo tras
  // "Tu hogar" (esa query no entra en el gate `ready` — ver `supabaseStore.tsx`). Mientras
  // tanto no se calcula `othersCount` con un `members.length` todavía incompleto: se deja en
  // 0 y el bloque de abajo muestra un estado de carga en vez de la lista real.
  const othersCount = household.membersLoaded ? Math.max(0, household.members.length - 1) : 0;

  const items: Array<{ icon: IconName; label: string }> = [
    { icon: 'book', label: t.deleteIntroRecipesCount(recipes.length) },
    { icon: 'calendar', label: t.deleteIntroPlanRow },
    { icon: 'shelf', label: t.deleteIntroPantryRow },
    ...(othersCount > 0
      ? [{ icon: 'home' as IconName, label: t.deleteIntroOthersRow(othersCount) }]
      : []),
  ];

  const download = () => {
    const rows = buildHouseholdExport(recipes, ingredientById, locale);
    downloadHouseholdExport(rows, household.name);
    setExportedCount(rows.length);
  };

  return (
    <Sheet title={t.deleteIntroTitle(household.name)} onClose={onClose}>
      <div style={{ paddingBottom: 6 }}>
        <div style={{ fontSize: 15, color: 'var(--muted)', lineHeight: 1.5 }}>
          {t.deleteIntroBodyLead} <strong style={{ color: 'var(--warn-ink)' }}>{t.irreversibleWord}</strong>{' '}
          {household.membersLoaded ? t.deleteIntroBodyMid(household.members.length) : '…'}
        </div>

        <div style={{ marginTop: 10 }}>
          {household.membersLoaded ? (
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
          <Pressable
            onClick={download}
            scale={0.98}
            style={{
              height: 52,
              borderRadius: radius.button,
              background: 'var(--soft)',
              color: 'var(--accent-ink)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 16px',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14.5, fontWeight: 600 }}>
              {exportedCount != null && <Icon name="check" size={16} strokeWidth={2.4} />}
              {exportedCount != null ? t.downloadedJson(exportedCount) : t.downloadJson}
            </span>
            <span style={{ fontSize: 13, fontWeight: 650 }}>JSON</span>
          </Pressable>

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
 * Paso 2, final: escribir el nombre exacto del hogar para confirmar. La
 * comparación ignora mayúsculas y espacios sobrantes a propósito — exigir
 * coincidencia exacta de mayúsculas es fricción sin aportar seguridad real.
 * El botón de confirmar se deshabilita mientras no coincide y mientras la
 * petición está en curso (evita doble-tap disparando el RPC dos veces).
 */
export function DeleteConfirmDialog({
  onCancel,
  onDeleted,
}: {
  onCancel: () => void;
  onDeleted: () => void;
}) {
  const { t } = usePrefs();
  const { household, deleteHousehold } = useData();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!household) return null;

  const matches = typed.trim().toLowerCase() === household.name.trim().toLowerCase();

  const confirm = async () => {
    if (busy || !matches) return;
    setBusy(true);
    setError(null);
    try {
      await deleteHousehold();
      onDeleted();
    } catch (e) {
      setBusy(false);
      const message = e instanceof Error ? e.message : String(e);
      // REZET_NOT_OWNER: hoy inalcanzable desde esta UI (solo el propietario ve esta hoja),
      // pero el backend sigue rechazándolo — se muestra su copia localizada igualmente.
      setError(message.startsWith(REZET_NOT_OWNER) ? t.deleteNotOwnerError : stripHouseholdErrorTag(message));
    }
  };

  return (
    <AlertDialog
      title={t.deleteConfirmTitle}
      body={
        <>
          {t.deleteConfirmBodyLead} <strong style={{ color: 'var(--text)' }}>{household.name}</strong>{' '}
          {t.deleteConfirmBodyTrail(household.members.length)}
        </>
      }
      cancelLabel={t.cancel}
      confirmLabel={t.deleteForeverAction}
      confirmDisabled={busy || !matches}
      onCancel={onCancel}
      onConfirm={() => void confirm()}
    >
      <div style={{ marginTop: 16, textAlign: 'left' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>
          {t.deleteConfirmTypePrefix} <strong style={{ color: 'var(--text)' }}>{household.name}</strong>{' '}
          {t.deleteConfirmTypeSuffix}
        </div>
        <TextField
          value={typed}
          onChange={setTyped}
          placeholder={household.name}
          ariaLabel={`${t.deleteConfirmTypePrefix} ${household.name}`}
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
