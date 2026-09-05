import type { CSSProperties, ReactNode } from 'react';
import { Pressable } from './Pressable';
import { radius, tabular } from './tokens';

export function Card({
  children,
  style,
  dashed,
  padding = 20,
}: {
  children: ReactNode;
  style?: CSSProperties;
  dashed?: boolean;
  padding?: number;
}) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: `1px ${dashed ? 'dashed' : 'solid'} var(--line)`,
        borderRadius: radius.hero,
        padding,
        boxShadow: dashed ? undefined : 'var(--shadow-s)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** Contenedor de filas con separadores. */
export function ListCard({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        borderRadius: radius.list,
        overflow: 'hidden',
        boxShadow: 'var(--shadow-s)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Row({
  children,
  onClick,
  style,
  warn,
}: {
  children: ReactNode;
  onClick?: () => void;
  style?: CSSProperties;
  warn?: boolean;
}) {
  const base: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '13px 15px',
    borderBottom: '1px solid var(--line)',
    background: warn ? 'var(--warnsoft)' : 'transparent',
    textAlign: 'left',
    width: '100%',
    ...style,
  };
  if (!onClick) return <div style={base}>{children}</div>;
  return (
    <Pressable onClick={onClick} scale={1} style={base}>
      {children}
    </Pressable>
  );
}

/** Eyebrow: 13px, 650, mayúsculas, +0.05em. */
export function Eyebrow({
  children,
  tone = 'muted',
  style,
}: {
  children: ReactNode;
  tone?: 'muted' | 'accent';
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        fontSize: 13,
        fontWeight: 650,
        letterSpacing: '.05em',
        textTransform: 'uppercase',
        color: tone === 'accent' ? 'var(--accent-ink)' : 'var(--muted)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** Cabecera de sección: eyebrow + regla + valor a la derecha. */
export function SectionHeader({
  label,
  trailing,
}: {
  label: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 4px 10px' }}>
      <Eyebrow>{label}</Eyebrow>
      <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
      {trailing != null && (
        <div style={{ fontSize: 12.5, color: 'var(--muted)', ...tabular }}>{trailing}</div>
      )}
    </div>
  );
}

/** Número de paso en círculo. */
export function StepNumber({ n, size = 24 }: { n: number; size?: number }) {
  return (
    <div
      style={{
        flex: `0 0 ${size}px`,
        height: size,
        borderRadius: radius.pill,
        background: 'var(--soft)',
        color: 'var(--accent-ink)',
        display: 'grid',
        placeItems: 'center',
        fontSize: size >= 24 ? 12.5 : 11.5,
        fontWeight: 700,
        ...tabular,
      }}
    >
      {n}
    </div>
  );
}
