import { useState } from 'react';
import { TextField } from 'rezet';

export function Basic() {
  const [value, setValue] = useState('');
  return (
    <div style={{ width: 280 }}>
      <TextField value={value} onChange={setValue} placeholder="Nombre de la receta" />
    </div>
  );
}

export function Numeric() {
  const [value, setValue] = useState('250');
  return (
    <div style={{ width: 140 }}>
      <TextField value={value} onChange={setValue} inputMode="numeric" />
    </div>
  );
}
