import { useState } from 'react';
import { IngredientNameField } from 'rezet';
import type { Ingredient } from 'rezet';

const INGREDIENTS: Ingredient[] = [
  { id: '1', name: { es: 'Tomate', en: 'Tomato' }, group: 'fresco', sensitive: false, defaultUnit: 'ud' },
  { id: '2', name: { es: 'Tomate frito', en: 'Tomato sauce' }, group: 'conserva', sensitive: false, defaultUnit: 'g' },
  { id: '3', name: { es: 'Arroz', en: 'Rice' }, group: 'seco', sensitive: false, defaultUnit: 'g' },
];

export function Empty() {
  const [value, setValue] = useState('');
  return (
    <div style={{ width: 300 }}>
      <IngredientNameField
        value={value}
        onChange={setValue}
        placeholder="Nombre del ingrediente"
        ingredients={INGREDIENTS}
        locale="es"
        loc={(n) => n.es}
      />
    </div>
  );
}

export function WithValue() {
  const [value, setValue] = useState('Tomate');
  return (
    <div style={{ width: 300 }}>
      <IngredientNameField
        value={value}
        onChange={setValue}
        ingredients={INGREDIENTS}
        locale="es"
        loc={(n) => n.es}
      />
    </div>
  );
}
