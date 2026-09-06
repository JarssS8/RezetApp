import { ScreenHeader, Chip } from 'rezet';

export function Basic() {
  return (
    <div style={{ width: 380 }}>
      <ScreenHeader eyebrow="Hoy" title="Tus recetas" subtitle="Martes, 6 de septiembre" />
    </div>
  );
}

export function WithTrailing() {
  return (
    <div style={{ width: 380 }}>
      <ScreenHeader
        title="Recetas"
        trailing={<Chip label="Filtrar" active={false} onClick={() => {}} />}
      />
    </div>
  );
}
