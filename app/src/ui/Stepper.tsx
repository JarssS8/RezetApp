import { Pressable } from './Pressable';
import { Icon } from './Icon';
import { radius, tabular } from './tokens';

/**
 * Stepper. Los botones miden 32–36px pero viven dentro de un contenedor de
 * 42–44px con padding, así que el área táctil cumple el mínimo.
 */
export function Stepper({
  value,
  onDecrement,
  onIncrement,
  label,
  size = 'md',
  valueWidth = 34,
  formatted,
}: {
  value: number;
  onDecrement: () => void;
  onIncrement: () => void;
  label: string;
  size?: 'sm' | 'md';
  valueWidth?: number;
  formatted?: string;
}) {
  const btn = size === 'sm' ? 32 : 36;
  const inner = size === 'sm' ? 9 : 10;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        background: 'var(--surface2)',
        borderRadius: size === 'sm' ? radius.stepper : 12,
        padding: 3,
      }}
    >
      <Pressable
        onClick={onDecrement}
        ariaLabel={`${label} −`}
        scale={0.9}
        style={{
          width: btn,
          height: btn,
          borderRadius: inner,
          display: 'grid',
          placeItems: 'center',
          color: 'var(--muted)',
        }}
      >
        <Icon name="minus" size={size === 'sm' ? 13 : 14} />
      </Pressable>
      <div
        style={{
          minWidth: valueWidth,
          textAlign: 'center',
          fontSize: size === 'sm' ? 15 : 17,
          fontWeight: 650,
          ...tabular,
        }}
      >
        {formatted ?? value}
      </div>
      <Pressable
        onClick={onIncrement}
        ariaLabel={`${label} +`}
        scale={0.9}
        style={{
          width: btn,
          height: btn,
          borderRadius: inner,
          display: 'grid',
          placeItems: 'center',
          color: 'var(--muted)',
        }}
      >
        <Icon name="plus" size={size === 'sm' ? 13 : 14} />
      </Pressable>
    </div>
  );
}
