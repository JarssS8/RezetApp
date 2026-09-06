import { useState } from 'react';
import { CheckRow } from 'rezet';

export function List() {
  const [checked, setChecked] = useState<Record<string, boolean>>({ a: true, b: false, c: false });
  const toggle = (k: string) => setChecked((c) => ({ ...c, [k]: !c[k] }));
  return (
    <div style={{ width: 320, background: 'var(--surface)', borderRadius: 16, overflow: 'hidden' }}>
      <CheckRow checked={checked.a} onToggle={() => toggle('a')} label="Tomate" sublabel="2 unidades" />
      <CheckRow checked={checked.b} onToggle={() => toggle('b')} label="Arroz" sublabel="500 g" />
      <CheckRow
        checked={checked.c}
        onToggle={() => toggle('c')}
        label="Leche"
        sublabel="Caduca mañana"
        sublabelTone="warn"
        warn
      />
    </div>
  );
}
