import { Pill } from 'rezet';

export function Tones() {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <Pill tone="accent">Cocinada 12 veces</Pill>
      <Pill tone="warn">Caduca pronto</Pill>
    </div>
  );
}
