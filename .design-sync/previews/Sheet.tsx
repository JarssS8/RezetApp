import { Sheet, Button } from 'rezet';

// `Sheet` is `position: fixed; inset: 0` internally, anchored bottom via
// `justify-content: flex-end`. A `transform` on this wrapper makes it the
// containing block for that fixed layer (CSS spec) so the sheet lays out
// against the 420x560 preview viewport instead of the real page viewport —
// without it, "flex-end" pushes the panel below the captured crop.
export function Basic() {
  return (
    <div style={{ position: 'relative', width: 420, height: 560, overflow: 'hidden', transform: 'translateZ(0)' }}>
      <Sheet title="Añadir a la despensa" onClose={() => {}}>
        <div style={{ padding: '4px 0 16px', color: 'var(--muted)', fontSize: 14.5 }}>
          Escanea o escribe el nombre del ingrediente.
        </div>
        <Button variant="primary" full onClick={() => {}}>
          Guardar
        </Button>
      </Sheet>
    </div>
  );
}
