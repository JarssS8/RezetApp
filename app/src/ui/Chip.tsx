import type { CSSProperties, ReactNode } from 'react';
import { Pressable } from './Pressable';
import { height, radius } from './tokens';

/** Chip de filtro o de selección. El activo lleva tinta de acento, no relleno. */
export function Chip({
  label,
  active,
  onClick,
  full,
  style,
}: {
  label: ReactNode;
  active: boolean;
  onClick: () => void;
  full?: boolean;
  style?: CSSProperties;
}) {
  return (
    <Pressable
      onClick={onClick}
      scale={0.95}
      style={{
        flex: full ? 1 : '0 0 auto',
        height: height.chip,
        padding: '0 14px',
        borderRadius: radius.pill,
        fontSize: 14,
        fontWeight: 550,
        letterSpacing: '-.01em',
        border: `1px solid ${active ? 'var(--soft2)' : 'var(--line)'}`,
        background: active ? 'var(--soft)' : 'var(--surface)',
        color: active ? 'var(--accent-ink)' : 'var(--text)',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {label}
    </Pressable>
  );
}

/** Chip rectangular para grupos de opciones (tema, idioma, unidades). */
export function OptionChip({
  label,
  active,
  onClick,
  height: h = 44,
}: {
  label: ReactNode;
  active: boolean;
  onClick: () => void;
  height?: number;
}) {
  return (
    <Pressable
      onClick={onClick}
      scale={0.96}
      style={{
        flex: 1,
        height: h,
        borderRadius: radius.chip,
        fontSize: 14.5,
        fontWeight: 600,
        border: `1px solid ${active ? 'var(--soft2)' : 'var(--line)'}`,
        background: active ? 'var(--soft)' : 'var(--surface)',
        color: active ? 'var(--accent-ink)' : 'var(--text)',
      }}
    >
      {label}
    </Pressable>
  );
}

/** Píldora informativa (no pulsable). */
export function Pill({
  children,
  tone = 'accent',
  style,
}: {
  children: ReactNode;
  tone?: 'accent' | 'warn';
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 11px',
        borderRadius: radius.pill,
        background: tone === 'accent' ? 'var(--soft)' : 'var(--warnsoft)',
        color: tone === 'accent' ? 'var(--accent-ink)' : 'var(--warn-ink)',
        fontSize: 13,
        fontWeight: 600,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
