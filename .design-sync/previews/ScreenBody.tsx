import { ScreenBody, Card } from 'rezet';

export function Basic() {
  return (
    <div style={{ width: 400, background: 'var(--bg)', display: 'flex' }}>
      <ScreenBody maxWidth={400} label="preview">
        <Card>
          <div style={{ fontWeight: 650 }}>Contenido de pantalla</div>
        </Card>
      </ScreenBody>
    </div>
  );
}
