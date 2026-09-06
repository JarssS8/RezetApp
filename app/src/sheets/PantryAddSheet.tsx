import { useCallback, useRef, useState } from 'react';
import { usePrefs } from '../store/prefs';
import { useData } from '../data/store';
import { Button } from '../ui/Button';
import { Calendar } from '../ui/Calendar';
import { Chip, OptionChip } from '../ui/Chip';
import { Icon } from '../ui/Icon';
import { IngredientNameField } from '../ui/IngredientNameField';
import { TextField } from '../ui/Fields';
import { SegmentedControl } from '../ui/SegmentedControl';
import { Sheet } from '../ui/Sheet';
import { radius, text as T } from '../ui/tokens';
import { offsetKey, shortMonthDate, todayKey } from '../domain/dates';
import { defaultLocationFor, findIngredientByName, inferFoodGroup } from '../domain/recipeText';
import { formatQuantity } from '../domain/units';
import { PantryScanCapture } from './PantryScanCapture';
import type { PantryLoc, Unit } from '../types';

const UNITS: Unit[] = ['g', 'ml', 'ud', 'tbsp'];
const FRACTIONS = [
  { value: '0.25', glyph: '¼' },
  { value: '0.5', glyph: '½' },
  { value: '0.75', glyph: '¾' },
];

type ExpiryChoice = 'today' | '3d' | '1w' | '1m' | 'date' | null;

interface AddedItem {
  entryId: number;
  pantryId: string;
  name: string;
  quantitySummary: string;
  addedQuantity: number;
}

export function PantryAddSheet({
  onClose,
  onToast,
  allowPhoto = false,
}: {
  onClose: () => void;
  onToast: (message: string) => void;
  allowPhoto?: boolean;
}) {
  const { t, locale, loc, units } = usePrefs();
  const { pantryAdd, pantryBump, ingredients } = useData();

  const [mode, setMode] = useState<'scan' | 'manual'>('scan');
  const [name, setName] = useState('');
  const [quantityInput, setQuantityInput] = useState('');
  const [unit, setUnit] = useState<Unit>('ud');
  const [unitTouched, setUnitTouched] = useState(false);
  const [location, setLocation] = useState<PantryLoc>('cupboard');
  const [locationTouched, setLocationTouched] = useState(false);
  const [expiresOn, setExpiresOn] = useState('');
  const [expiryChoice, setExpiryChoice] = useState<ExpiryChoice>(null);
  const [expiryOpen, setExpiryOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [addedItems, setAddedItems] = useState<AddedItem[]>([]);

  const nameRef = useRef<HTMLInputElement>(null);
  const nextEntryId = useRef(0);

  const matchedIngredient = name.trim() ? findIngredientByName(ingredients, name.trim()) : undefined;
  const fallbackUnit: Unit = matchedIngredient?.defaultUnit ?? 'ud';
  const effectiveUnit = unitTouched ? unit : fallbackUnit;
  const parsedQuantity = parseFloat(quantityInput.replace(',', '.'));
  const resolvedQuantity = Number.isFinite(parsedQuantity) && parsedQuantity > 0 ? parsedQuantity : 1;

  const inferredGroup = matchedIngredient?.group ?? (name.trim() ? inferFoodGroup(name.trim()) : undefined);
  const effectiveLocation = locationTouched ? location : inferredGroup ? defaultLocationFor(inferredGroup) : location;

  const focusName = () => {
    // Se dispara siempre dentro de un gesto del usuario (click), nunca en
    // un useEffect — iOS no levanta el teclado para un focus() disparado
    // fuera de un gesto real.
    requestAnimationFrame(() => nameRef.current?.focus());
  };

  const goManual = () => {
    setMode('manual');
    focusName();
  };

  const applyPrefill = useCallback((item: { name: string; quantity?: number; unit?: Unit; expiresOn?: string }) => {
    setName(item.name);
    setQuantityInput(item.quantity != null ? String(item.quantity) : '');
    if (item.unit) {
      setUnit(item.unit);
      setUnitTouched(true);
    } else {
      setUnitTouched(false);
    }
    setLocationTouched(false);
    if (item.expiresOn) {
      if (item.expiresOn === offsetKey(3)) setExpiryChoice('3d');
      else if (item.expiresOn === offsetKey(7)) setExpiryChoice('1w');
      else if (item.expiresOn === offsetKey(30)) setExpiryChoice('1m');
      else setExpiryChoice('date');
      setExpiresOn(item.expiresOn);
      setExpiryOpen(true);
    } else {
      setExpiryChoice(null);
      setExpiresOn('');
      setExpiryOpen(false);
    }
    setMode('manual');
    focusName();
  }, []);

  /** Los cuatro atajos relativos. La fecha exacta la pone el calendario, ver <Calendar onSelect>. */
  const pickExpiry = (choice: 'today' | '3d' | '1w' | '1m' | null) => {
    setExpiryChoice(choice);
    if (choice === 'today') setExpiresOn(todayKey());
    else if (choice === '3d') setExpiresOn(offsetKey(3));
    else if (choice === '1w') setExpiresOn(offsetKey(7));
    else if (choice === '1m') setExpiresOn(offsetKey(30));
    else setExpiresOn('');
  };

  const clearExpiry = () => {
    setExpiryChoice(null);
    setExpiresOn('');
    setExpiryOpen(false);
  };

  const resetForm = () => {
    setName('');
    setQuantityInput('');
    setUnitTouched(false);
    setExpiresOn('');
    setExpiryChoice(null);
    setExpiryOpen(false);
    setLocationTouched(false);
  };

  const submit = async () => {
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    try {
      const result = await pantryAdd({
        name: name.trim(),
        quantity: resolvedQuantity,
        unit: effectiveUnit,
        location: effectiveLocation,
        expiresOn: expiresOn || undefined,
      });
      const entryId = nextEntryId.current++;
      setAddedItems((items) => [
        ...items,
        {
          entryId,
          pantryId: result.id,
          name: name.trim(),
          quantitySummary: formatQuantity(resolvedQuantity, effectiveUnit, units, locale),
          addedQuantity: result.addedQuantity,
        },
      ]);
      resetForm();
      focusName();
    } catch {
      onToast(t.pantryAddError);
    } finally {
      setSubmitting(false);
    }
  };

  const undoAdd = (item: AddedItem) => {
    // Nunca pantryDelete aquí: si otro add posterior fusionó cantidad extra
    // en la misma fila, un delete destruiría también esa cantidad. pantryBump
    // ya deja la fila en 0 y la limpia sola cuando corresponde (ver store.tsx),
    // así que cubre "era la única aportación" y "quedan otras" con una sola
    // llamada.
    pantryBump(item.pantryId, -item.addedQuantity);
    setAddedItems((items) => items.filter((i) => i.entryId !== item.entryId));
  };

  const locations: Array<{ value: PantryLoc; label: string }> = [
    { value: 'cupboard', label: t.cupboard },
    { value: 'fridge', label: t.fridge },
    { value: 'freezer', label: t.freezer },
  ];

  const unitLabel = (u: Unit) => {
    if (u === 'ud') return locale === 'es' ? 'uds' : 'pcs';
    if (u === 'tbsp') return locale === 'es' ? 'cda' : 'tbsp';
    return u;
  };
  const unitOptions: Array<{ value: Unit; label: string }> = UNITS.map((u) => ({ value: u, label: unitLabel(u) }));

  const expirySummary =
    expiryChoice === 'today' ? t.today
    : expiryChoice === '3d' ? t.relative3Days
    : expiryChoice === '1w' ? t.relative1Week
    : expiryChoice === '1m' ? t.relative1Month
    : expiryChoice === 'date' && expiresOn ? shortMonthDate(expiresOn, locale)
    : null;

  return (
    <Sheet title={t.add} onClose={onClose}>
      {mode === 'scan' && (
        <PantryScanCapture allowPhoto={allowPhoto} onResult={applyPrefill} onManual={goManual} />
      )}

      {mode === 'manual' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 6 }}>
          <button
            type="button"
            onClick={() => setMode('scan')}
            style={{ alignSelf: 'flex-start', border: 0, background: 'transparent', padding: 0, fontSize: 14, fontWeight: 600, color: 'var(--accent-ink)' }}
          >
            {t.scanAgain}
          </button>

          <IngredientNameField
            ref={nameRef}
            value={name}
            onChange={setName}
            placeholder={t.itemName}
            ingredients={ingredients}
            locale={locale}
            loc={loc}
            style={{ ...T.cardTitle, height: 54 }}
          />

          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <TextField
              value={quantityInput}
              onChange={(v) => setQuantityInput(v.replace(/[^\d.,]/g, ''))}
              placeholder="500"
              inputMode="decimal"
              style={{ flex: 1, fontVariantNumeric: 'tabular-nums' }}
            />
            <div style={{ width: 224, flex: '0 0 224px' }}>
              <SegmentedControl
                value={effectiveUnit}
                onChange={(u) => {
                  setUnit(u);
                  setUnitTouched(true);
                }}
                options={unitOptions}
              />
            </div>
          </div>

          {(effectiveUnit === 'ud' || effectiveUnit === 'tbsp') && (
            <div style={{ display: 'flex', gap: 8, marginTop: -6 }}>
              {FRACTIONS.map((f) => (
                <OptionChip
                  key={f.value}
                  label={f.glyph}
                  active={quantityInput === f.value}
                  onClick={() => setQuantityInput(f.value)}
                />
              ))}
            </div>
          )}

          {/* Tarjeta agrupada: ubicación y caducidad viven juntas (patrón de lista agrupada), en vez de dos bloques sueltos. */}
          <div style={{ background: 'var(--surface2)', borderRadius: radius.list, padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>{t.location}</div>
              <SegmentedControl
                value={effectiveLocation}
                onChange={(v) => {
                  setLocation(v);
                  setLocationTouched(true);
                }}
                options={locations}
              />
            </div>

            <div style={{ height: 1, background: 'var(--line)' }} />

            <div>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>{t.expiresOnLabel}</div>
              <button
                type="button"
                onClick={() => setExpiryOpen((v) => !v)}
                style={{
                  width: '100%',
                  height: 46,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0 14px',
                  borderRadius: radius.input,
                  border: '1px solid var(--line)',
                  background: 'var(--surface)',
                  fontSize: 15,
                }}
              >
                <span style={{ color: expirySummary ? 'var(--text)' : 'var(--muted)' }}>
                  {expirySummary ?? t.noExpiry}
                </span>
                <Icon name="chevronRight" size={16} strokeWidth={2.2} />
              </button>

              {expiryOpen && (
                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <Chip label={t.today} active={expiryChoice === 'today'} onClick={() => pickExpiry(expiryChoice === 'today' ? null : 'today')} />
                    <Chip label={t.relative3Days} active={expiryChoice === '3d'} onClick={() => pickExpiry(expiryChoice === '3d' ? null : '3d')} />
                    <Chip label={t.relative1Week} active={expiryChoice === '1w'} onClick={() => pickExpiry(expiryChoice === '1w' ? null : '1w')} />
                    <Chip label={t.relative1Month} active={expiryChoice === '1m'} onClick={() => pickExpiry(expiryChoice === '1m' ? null : '1m')} />
                  </div>
                  <Calendar
                    key={expiryChoice ?? 'none'}
                    initialSelected={expiresOn || undefined}
                    minDate={todayKey()}
                    showAdjacentDays={false}
                    showEventDots={false}
                    onSelect={(d) => {
                      setExpiresOn(d);
                      setExpiryChoice('date');
                    }}
                  />
                  {expiryChoice && (
                    <button
                      type="button"
                      onClick={clearExpiry}
                      style={{ alignSelf: 'flex-start', border: 0, background: 'transparent', padding: 0, fontSize: 13.5, fontWeight: 600, color: 'var(--warn-ink)' }}
                    >
                      {t.clearDate}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          <Button full size="primary" disabled={!name.trim() || submitting} onClick={() => void submit()} style={{ borderRadius: radius.button }}>
            {t.add}
          </Button>

          {addedItems.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
              {addedItems.map((item) => (
                <div key={item.entryId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 2px' }}>
                  <div style={{ fontSize: 14.5 }}>
                    {item.name} <span style={{ color: 'var(--muted)' }}>· {item.quantitySummary}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => undoAdd(item)}
                    style={{ border: 0, background: 'transparent', padding: 0, fontSize: 13.5, fontWeight: 600, color: 'var(--warn-ink)' }}
                  >
                    {t.undo}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}
