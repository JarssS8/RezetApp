import { useState } from 'react';
import { SearchField } from 'rezet';

export function Basic() {
  const [value, setValue] = useState('');
  return (
    <div style={{ width: 300 }}>
      <SearchField value={value} onChange={setValue} placeholder="Buscar recetas" />
    </div>
  );
}

export function WithValue() {
  const [value, setValue] = useState('pasta');
  return (
    <div style={{ width: 300 }}>
      <SearchField value={value} onChange={setValue} placeholder="Buscar recetas" />
    </div>
  );
}
