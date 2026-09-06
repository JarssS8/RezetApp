import { Toast } from 'rezet';

// `Toast` is `position: fixed; bottom: 96px` internally. A `transform` on
// this wrapper makes it the containing block for that fixed element (CSS
// spec) so it lands 96px from the 420x160 preview viewport's own bottom
// edge instead of the real page viewport's, which would push it below crop.
export function Message() {
  return (
    <div style={{ position: 'relative', width: 420, height: 160, overflow: 'hidden', transform: 'translateZ(0)' }}>
      <Toast message="Añadido a la despensa" />
    </div>
  );
}
