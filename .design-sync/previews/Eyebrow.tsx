import { Eyebrow } from 'rezet';

export function Tones() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Eyebrow>Esta semana</Eyebrow>
      <Eyebrow tone="accent">Recomendado</Eyebrow>
    </div>
  );
}
