import { useState } from 'react';
import { usePrefs } from '../store/prefs';
import { useData } from '../data/store';
import { Button } from '../ui/Button';
import { OptionChip } from '../ui/Chip';
import { IngredientNameField } from '../ui/IngredientNameField';
import { TextField } from '../ui/Fields';
import { Sheet } from '../ui/Sheet';
import { radius } from '../ui/tokens';
import type { PantryLoc, Unit } from '../types';

export function PantryAddSheet({
  onClose,
  onToast,
}: {
  onClose: () => void;
  onToast: (message: string) => void;
}) {
  const { t, locale, loc } = usePrefs();
  const { pantryAdd, ingredients } = useData();
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState<Unit>('g');
  const [location, setLocation] = useState<PantryLoc>('cupboard');

  const unitOptions: Array<[Unit, string]> = [
    ['g', 'g'],
    ['ml', 'ml'],
    ['ud', locale === 'es' ? 'uds' : 'pcs'],
  ];
  const locations: Array<[PantryLoc, string]> = [
    ['cupboard', t.cupboard],
    ['fridge', t.fridge],
    ['freezer', t.freezer],
  ];

  const submit = () => {
    if (!name.trim()) return;
    pantryAdd({
      name: name.trim(),
      quantity: parseFloat(quantity.replace(',', '.')) || 1,
      unit,
      location,
    });
    onClose();
    onToast(t.savedPantry);
  };

  return (
    <Sheet title={t.add} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 6 }}>
        <IngredientNameField
          value={name}
          onChange={setName}
          onPick={(ing) => setUnit(ing.defaultUnit)}
          placeholder={t.itemName}
          ingredients={ingredients}
          locale={locale}
          loc={loc}
        />
        <div style={{ display: 'flex', gap: 10 }}>
          <TextField
            value={quantity}
            onChange={setQuantity}
            placeholder="500"
            inputMode="decimal"
            style={{ flex: 2, fontVariantNumeric: 'tabular-nums' }}
          />
          <div style={{ flex: 3, display: 'flex', gap: 6 }}>
            {unitOptions.map(([id, label]) => (
              <OptionChip key={id} label={label} height={50} active={unit === id} onClick={() => setUnit(id)} />
            ))}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>{t.location}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {locations.map(([id, label]) => (
              <OptionChip key={id} label={label} active={location === id} onClick={() => setLocation(id)} />
            ))}
          </div>
        </div>
        <Button full size="primary" onClick={submit} style={{ borderRadius: radius.button }}>
          {t.add}
        </Button>
      </div>
    </Sheet>
  );
}
