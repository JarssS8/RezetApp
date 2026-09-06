import { Icon } from 'rezet';
import type { IconName } from 'rezet';

const NAMES: IconName[] = [
  'bowl', 'cook', 'book', 'calendar', 'shelf', 'plus', 'minus', 'close',
  'chevronLeft', 'chevronRight', 'check', 'search', 'bag', 'trash', 'key',
  'sun', 'clock', 'edit',
];

export function Set() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 14, color: 'var(--text)' }}>
      {NAMES.map((n) => (
        <div key={n} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <Icon name={n} size={22} />
          <span style={{ fontSize: 10, color: 'var(--muted)' }}>{n}</span>
        </div>
      ))}
    </div>
  );
}

export function Weights() {
  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center', color: 'var(--accent-ink)' }}>
      <Icon name="check" size={32} strokeWidth={1.8} />
      <Icon name="check" size={32} strokeWidth={2.2} />
      <Icon name="check" size={32} strokeWidth={2.6} />
    </div>
  );
}
