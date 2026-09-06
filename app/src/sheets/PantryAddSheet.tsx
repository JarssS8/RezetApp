import { useRef, useState } from 'react';
import { usePrefs } from '../store/prefs';
import { useData } from '../data/store';
import { Button } from '../ui/Button';
import { OptionChip, Pill } from '../ui/Chip';
import { IngredientNameField } from '../ui/IngredientNameField';
import { TextField } from '../ui/Fields';
import { SegmentedControl } from '../ui/SegmentedControl';
import { Sheet } from '../ui/Sheet';
import { radius, text as T } from '../ui/tokens';
import { offsetKey, todayKey } from '../domain/dates';
import { defaultLocationFor, findIngredientByName, inferFoodGroup } from '../domain/recipeText';
import { formatQuantity, parseQuantityInput } from '../domain/units';
import { PantryScanCapture } from './PantryScanCapture';
import type { PantryLoc, Unit } from '../types';

type ExpiryChoice = '3d' | '1w' | '1m' | 'date' | null;

interface AddedItem {
  entryId: number;
  pantryId: string;
  name: string;
  quantitySummary: string;
  merged: boolean;
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
  const [location, setLocation] = useState<PantryLoc>('cupboard');
  const [locationTouched, setLocationTouched] = useState(false);
  const [expiresOn, setExpiresOn] = useState('');
  const [expiryChoice, setExpiryChoice] = useState<ExpiryChoice>(null);
  const [submitting, setSubmitting] = useState(false);
  const [addedItems, setAddedItems] = useState<AddedItem[]>([]);

  const nameRef = useRef<HTMLInputElement>(null);
  const nextEntryId = useRef(0);

  const matchedIngredient = name.trim() ? findIngredientByName(ingredients, name.trim()) : undefined;
  const fallbackUnit: Unit = matchedIngredient?.defaultUnit ?? 'ud';
  const { quantity: resolvedQuantity, unit: resolvedUnit } = parseQuantityInput(quantityInput, fallbackUnit);

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

  const applyPrefill = (item: { name: string; quantity?: number; unit?: Unit; expiresOn?: string }) => {
    setName(item.name);
    if (item.quantity != null) setQuantityInput(item.unit ? `${item.quantity} ${item.unit}` : String(item.quantity));
    if (item.expiresOn) {
      if (item.expiresOn === offsetKey(3)) setExpiryChoice('3d');
      else if (item.expiresOn === offsetKey(7)) setExpiryChoice('1w');
      else if (item.expiresOn === offsetKey(30)) setExpiryChoice('1m');
      else setExpiryChoice('date');
      setExpiresOn(item.expiresOn);
    }
    setMode('manual');
    focusName();
  };

  const pickExpiry = (choice: ExpiryChoice) => {
    setExpiryChoice(choice);
    if (choice === '3d') setExpiresOn(offsetKey(3));
    else if (choice === '1w') setExpiresOn(offsetKey(7));
    else if (choice === '1m') setExpiresOn(offsetKey(30));
    else if (choice === 'date') setExpiresOn((v) => v || todayKey());
    else setExpiresOn('');
  };

  const resetForm = () => {
    setName('');
    setQuantityInput('');
    setExpiresOn('');
    setExpiryChoice(null);
    setLocationTouched(false);
  };

  const submit = async () => {
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    try {
      const result = await pantryAdd({
        name: name.trim(),
        quantity: resolvedQuantity,
        unit: resolvedUnit,
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
          quantitySummary: formatQuantity(resolvedQuantity, resolvedUnit, units, locale),
          merged: result.merged,
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
              onChange={setQuantityInput}
              placeholder="500 g"
              inputMode="text"
              style={{ flex: 1, fontVariantNumeric: 'tabular-nums' }}
            />
            <Pill>{formatQuantity(resolvedQuantity, resolvedUnit, units, locale)}</Pill>
          </div>

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

          <div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>{t.expiresOnLabel}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <OptionChip label={t.relative3Days} active={expiryChoice === '3d'} onClick={() => pickExpiry(expiryChoice === '3d' ? null : '3d')} />
              <OptionChip label={t.relative1Week} active={expiryChoice === '1w'} onClick={() => pickExpiry(expiryChoice === '1w' ? null : '1w')} />
              <OptionChip label={t.relative1Month} active={expiryChoice === '1m'} onClick={() => pickExpiry(expiryChoice === '1m' ? null : '1m')} />
              <OptionChip label={t.dateOption} active={expiryChoice === 'date'} onClick={() => pickExpiry(expiryChoice === 'date' ? null : 'date')} />
            </div>
            {expiryChoice === 'date' && (
              <div style={{ marginTop: 10 }}>
                <TextField type="date" min={todayKey()} value={expiresOn} onChange={setExpiresOn} />
              </div>
            )}
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
