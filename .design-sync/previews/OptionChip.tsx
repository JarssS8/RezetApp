import { useState } from 'react';
import { OptionChip } from 'rezet';

export function ThemePicker() {
  const [active, setActive] = useState('claro');
  return (
    <div style={{ display: 'flex', gap: 8, width: 280 }}>
      <OptionChip label="Claro" active={active === 'claro'} onClick={() => setActive('claro')} />
      <OptionChip label="Oscuro" active={active === 'oscuro'} onClick={() => setActive('oscuro')} />
      <OptionChip label="Sistema" active={active === 'sistema'} onClick={() => setActive('sistema')} />
    </div>
  );
}
