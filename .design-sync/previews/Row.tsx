import { Row } from 'rezet';

export function Clickable() {
  return (
    <div style={{ width: 320, background: 'var(--surface)', borderRadius: 16, overflow: 'hidden' }}>
      <Row onClick={() => {}}>Tomate — 2 ud</Row>
      <Row onClick={() => {}} warn>
        Leche — caduca mañana
      </Row>
    </div>
  );
}
