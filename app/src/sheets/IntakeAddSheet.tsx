import { useId, useState } from 'react';
import { usePrefs } from '../store/prefs';
import { useData } from '../data/store';
import { todayKey } from '../domain/dates';
import { formatKcal } from '../domain/units';
import { Button } from '../ui/Button';
import { Pressable } from '../ui/Pressable';
import { Sheet } from '../ui/Sheet';
import { Stepper } from '../ui/Stepper';
import { TextField } from '../ui/Fields';
import { height, radius, tabular, text as T } from '../ui/tokens';
import { RecipePickerSheet } from './RecipePickerSheet';
import { PantryScanCapture } from './PantryScanCapture';
import type { FrequentExtra, Unit } from '../types';

type IntakeTab = 'favourites' | 'quick' | 'recipe' | 'barcode';

/** Producto escaneado con kcal ya conocidas, a la espera de los gramos consumidos. */
interface ScannedProduct {
  name: string;
  kcalPer100g: number;
}

/**
 * Hoja "Añadir algo que comí" (Tarea 11): cuatro caminos hasta el mismo
 * `addExtra` — favoritos, número a mano, receta ya guardada o código de
 * barras. Ninguno es un callejón sin salida: el de código, si el producto no
 * trae kcal, cae al de número a mano con el nombre ya puesto.
 */
export function IntakeAddSheet({
  onClose,
  onToast,
}: {
  onClose: () => void;
  onToast: (message: string) => void;
}) {
  const { t, locale, loc } = usePrefs();
  const { myMemberId, frequentExtras, addExtra, recipeById } = useData();
  const tablistId = useId();

  // Favoritos no es un estado propio: se deriva de `frequentExtras` en cada
  // render, para que un extra recién registrado desde otra pestaña de esta
  // misma sesión pueda aparecer sin recargar. Solo la pestaña POR DEFECTO se
  // decide una vez, al abrir la hoja (ver el brief: "en cuanto haya al menos
  // uno" describe la apertura, no una reevaluación continua).
  const favourites = myMemberId ? frequentExtras(myMemberId) : [];
  const [tab, setTab] = useState<IntakeTab>(() => (favourites.length > 0 ? 'favourites' : 'quick'));
  const [submitting, setSubmitting] = useState(false);

  const [quickName, setQuickName] = useState('');
  const [quickKcalInput, setQuickKcalInput] = useState('');

  const [recipePickerOpen, setRecipePickerOpen] = useState(false);
  const [pickedRecipeId, setPickedRecipeId] = useState<string | null>(null);
  const [recipeServings, setRecipeServings] = useState(1);

  const [scannedProduct, setScannedProduct] = useState<ScannedProduct | null>(null);
  const [gramsInput, setGramsInput] = useState('');

  const tabs: Array<{ value: IntakeTab; label: string }> = [
    { value: 'favourites', label: t.tabFavourites },
    { value: 'quick', label: t.tabQuick },
    { value: 'recipe', label: t.tabRecipe },
    { value: 'barcode', label: t.tabBarcode },
  ];

  /** Único punto de escritura: registra el extra de hoy y cierra la hoja. */
  const commit = async (input: { label: string; kcal: number; source: 'manual' | 'recipe' | 'barcode'; recipeId?: string }) => {
    if (!myMemberId || submitting) return;
    setSubmitting(true);
    try {
      await addExtra({
        memberId: myMemberId,
        date: todayKey(),
        label: input.label,
        kcal: Math.round(input.kcal),
        source: input.source,
        recipeId: input.recipeId ?? null,
      });
      onClose();
    } catch {
      onToast(t.memberActionError);
    } finally {
      setSubmitting(false);
    }
  };

  const pickFavourite = (f: FrequentExtra) => void commit({ label: f.label, kcal: f.kcal, source: 'manual' });

  const quickKcalValue = parseFloat(quickKcalInput.replace(',', '.'));
  const quickValid = quickName.trim().length > 0 && Number.isFinite(quickKcalValue) && quickKcalValue > 0;
  const submitQuick = () =>
    void commit({ label: quickName.trim(), kcal: quickKcalValue, source: 'manual' });

  const pickedRecipe = pickedRecipeId ? recipeById.get(pickedRecipeId) : undefined;
  const recipeKcal = pickedRecipe ? pickedRecipe.kcalPerServing * recipeServings : 0;
  const submitRecipe = () =>
    pickedRecipe &&
    void commit({ label: loc(pickedRecipe.name), kcal: recipeKcal, source: 'recipe', recipeId: pickedRecipe.id });

  const gramsValue = parseFloat(gramsInput.replace(',', '.'));
  const gramsValid = Number.isFinite(gramsValue) && gramsValue > 0;
  const barcodeKcal = scannedProduct && gramsValid ? (scannedProduct.kcalPer100g * gramsValue) / 100 : 0;
  const submitBarcode = () =>
    scannedProduct &&
    gramsValid &&
    void commit({ label: scannedProduct.name, kcal: barcodeKcal, source: 'barcode' });

  const handleScanResult = (item: {
    name: string;
    quantity?: number;
    unit?: Unit;
    expiresOn?: string;
    kcalPer100g?: number | null;
  }) => {
    if (item.kcalPer100g == null) {
      // Nunca un callejón sin salida: sin kcal en Open Food Facts, se cae a
      // "Rápido" con el nombre ya puesto para que el usuario lo termine a mano.
      onToast(t.noKcalInProduct);
      setQuickName(item.name);
      setTab('quick');
      return;
    }
    setScannedProduct({ name: item.name, kcalPer100g: item.kcalPer100g });
  };

  const fieldLabelStyle = { fontSize: 13, color: 'var(--muted)', marginBottom: 6 } as const;

  return (
    <Sheet title={t.intakeAddTitle} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, paddingBottom: 6 }}>
        <div
          role="tablist"
          aria-label={t.intakeAddTitle}
          id={tablistId}
          style={{ display: 'flex', gap: 4, background: 'var(--surface2)', borderRadius: radius.chip, padding: 3 }}
        >
          {tabs.map((tItem) => (
            <button
              key={tItem.value}
              type="button"
              role="tab"
              aria-selected={tab === tItem.value}
              aria-controls={`${tablistId}-${tItem.value}`}
              onClick={() => setTab(tItem.value)}
              style={{
                flex: 1,
                minHeight: height.touch,
                border: 0,
                borderRadius: radius.chip - 3,
                fontSize: 13.5,
                fontWeight: 600,
                letterSpacing: '-.01em',
                background: tab === tItem.value ? 'var(--surface)' : 'transparent',
                color: tab === tItem.value ? 'var(--text)' : 'var(--muted)',
                boxShadow: tab === tItem.value ? 'var(--shadow-s)' : undefined,
                cursor: 'pointer',
              }}
            >
              {tItem.label}
            </button>
          ))}
        </div>

        {tab === 'favourites' && (
          <div
            id={`${tablistId}-favourites`}
            role="tabpanel"
            style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
          >
            <div style={{ fontSize: 13.5, color: 'var(--muted)' }}>{t.favouritesHint}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {favourites.map((f) => (
                <Pressable
                  key={`${f.label}\u0000${f.kcal}`}
                  onClick={() => pickFavourite(f)}
                  disabled={submitting}
                  scale={0.985}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    minHeight: height.touch,
                    padding: 14,
                    borderRadius: radius.slot,
                    background: 'var(--surface2)',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ ...tabular, fontSize: 13, fontWeight: 700, color: 'var(--accent-ink)', minWidth: 26 }}>
                    {f.times}×
                  </div>
                  <div style={{ flex: 1, minWidth: 0, ...T.cardTitle }}>{f.label}</div>
                  <div style={{ ...tabular, fontSize: 14.5, fontWeight: 650, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                    {formatKcal(f.kcal, locale)} {t.kcal}
                  </div>
                </Pressable>
              ))}
            </div>
          </div>
        )}

        {tab === 'quick' && (
          <div
            id={`${tablistId}-quick`}
            role="tabpanel"
            style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
          >
            <label style={{ display: 'block' }}>
              <div style={fieldLabelStyle}>{t.quickName}</div>
              <TextField value={quickName} onChange={setQuickName} style={T.cardTitle} />
            </label>
            <label style={{ display: 'block' }}>
              <div style={fieldLabelStyle}>{t.quickKcal}</div>
              <TextField
                value={quickKcalInput}
                onChange={(v) => setQuickKcalInput(v.replace(/[^\d.,]/g, ''))}
                inputMode="numeric"
                placeholder="250"
                style={{ ...tabular }}
              />
            </label>
            <Button full size="primary" disabled={!quickValid || submitting} onClick={submitQuick} style={{ borderRadius: radius.button }}>
              {t.addToMyDay}
            </Button>
          </div>
        )}

        {tab === 'recipe' && (
          <div
            id={`${tablistId}-recipe`}
            role="tabpanel"
            style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
          >
            {!pickedRecipe ? (
              <Button full onClick={() => setRecipePickerOpen(true)} style={{ borderRadius: radius.button }}>
                {t.pickRecipe}
              </Button>
            ) : (
              <>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 14,
                    padding: 14,
                    borderRadius: radius.list,
                    background: 'var(--surface2)',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0, ...T.cardTitle }}>{loc(pickedRecipe.name)}</div>
                  <Stepper
                    value={recipeServings}
                    label={t.servings}
                    onDecrement={() => setRecipeServings((s) => Math.max(1, s - 1))}
                    onIncrement={() => setRecipeServings((s) => Math.min(24, s + 1))}
                  />
                </div>
                <div style={{ fontSize: 14.5, color: 'var(--muted)' }}>
                  {formatKcal(recipeKcal, locale)} {t.kcal}
                </div>
                <Button full size="primary" disabled={submitting} onClick={submitRecipe} style={{ borderRadius: radius.button }}>
                  {t.addToMyDay}
                </Button>
                <button
                  type="button"
                  onClick={() => setRecipePickerOpen(true)}
                  style={{ alignSelf: 'flex-start', border: 0, background: 'transparent', padding: 0, fontSize: 14, fontWeight: 600, color: 'var(--accent-ink)' }}
                >
                  {t.pickRecipe}
                </button>
              </>
            )}
          </div>
        )}

        {tab === 'barcode' && (
          <div
            id={`${tablistId}-barcode`}
            role="tabpanel"
            style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
          >
            {!scannedProduct ? (
              // Sin foto/Gemini aquí: OFF es la única fuente que trae kcal
              // (`kcalPer100g`); el reconocimiento por foto no las da nunca.
              <PantryScanCapture allowPhoto={false} onResult={handleScanResult} onManual={() => setTab('quick')} />
            ) : (
              <>
                <div style={{ ...T.cardTitle }}>{scannedProduct.name}</div>
                <label style={{ display: 'block' }}>
                  <div style={fieldLabelStyle}>{t.gramsEaten}</div>
                  <TextField
                    value={gramsInput}
                    onChange={(v) => setGramsInput(v.replace(/[^\d.,]/g, ''))}
                    inputMode="numeric"
                    placeholder="150"
                    style={{ ...tabular }}
                  />
                </label>
                <div style={{ fontSize: 14.5, color: 'var(--muted)' }}>
                  {formatKcal(barcodeKcal, locale)} {t.kcal}
                </div>
                <Button full size="primary" disabled={!gramsValid || submitting} onClick={submitBarcode} style={{ borderRadius: radius.button }}>
                  {t.addToMyDay}
                </Button>
                <button
                  type="button"
                  onClick={() => {
                    setScannedProduct(null);
                    setGramsInput('');
                  }}
                  style={{ alignSelf: 'flex-start', border: 0, background: 'transparent', padding: 0, fontSize: 14, fontWeight: 600, color: 'var(--accent-ink)' }}
                >
                  {t.scanAgain}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {recipePickerOpen && (
        <RecipePickerSheet
          target={{
            kind: 'choose',
            onPick: (recipeId) => {
              setPickedRecipeId(recipeId);
              setRecipeServings(recipeById.get(recipeId)?.baseServings ?? 1);
            },
          }}
          weekOffset={0}
          onClose={() => setRecipePickerOpen(false)}
          onNewRecipe={() => setRecipePickerOpen(false)}
          onToast={() => {}}
        />
      )}
    </Sheet>
  );
}
