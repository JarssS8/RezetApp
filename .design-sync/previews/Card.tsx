import { Card } from 'rezet';

export function Basic() {
  return (
    <Card>
      <div style={{ fontWeight: 650, fontSize: 16 }}>Tortilla de patatas</div>
      <div style={{ marginTop: 6, color: 'var(--muted)', fontSize: 14 }}>25 min · 4 raciones</div>
    </Card>
  );
}

export function Dashed() {
  return (
    <Card dashed padding={28}>
      <div style={{ textAlign: 'center', color: 'var(--muted)' }}>Añade tu primera receta</div>
    </Card>
  );
}
