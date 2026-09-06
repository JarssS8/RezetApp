import { useState } from 'react';
import { Chip } from 'rezet';

export function FilterRow() {
  const [active, setActive] = useState('todos');
  const options = ['todos', 'desayuno', 'comida', 'cena'];
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {options.map((o) => (
        <Chip key={o} label={o[0]!.toUpperCase() + o.slice(1)} active={active === o} onClick={() => setActive(o)} />
      ))}
    </div>
  );
}
