import type { CSSProperties, ReactNode } from 'react';
import { Pressable } from './Pressable';
import { height, radius } from './tokens';

type Variant = 'primary' | 'secondary' | 'danger' | 'quiet';
type Size = 'cta' | 'primary' | 'secondary' | 'header';

const SIZES: Record<Size, { height: number; radius: number; fontSize: number; padX: number }> = {
  cta: { height: height.cta, radius: radius.button, fontSize: 16.5, padX: 20 },
  primary: { height: height.primary, radius: 15, fontSize: 16, padX: 20 },
  secondary: { height: height.secondary, radius: radius.input, fontSize: 15.5, padX: 16 },
  header: { height: height.header, radius: radius.chip, fontSize: 15, padX: 16 },
};

/**
 * `--accent` es un RELLENO. El texto encima usa `--onaccent` (blanco).
 * El texto de acento sobre fondo claro es `--accent-ink`, nunca `--accent`.
 */
const VARIANTS: Record<Variant, CSSProperties> = {
  primary: { background: 'var(--accent)', color: 'var(--onaccent)', fontWeight: 650 },
  secondary: { background: 'var(--surface2)', color: 'var(--text)', fontWeight: 600 },
  danger: { background: 'var(--warnsoft)', color: 'var(--warn-ink)', fontWeight: 600 },
  quiet: { background: 'transparent', color: 'var(--muted)', fontWeight: 550 },
};

export interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  variant?: Variant;
  size?: Size;
  full?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  icon?: ReactNode;
  style?: CSSProperties;
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  size = 'primary',
  full,
  disabled,
  ariaLabel,
  icon,
  style,
}: ButtonProps) {
  const s = SIZES[size];
  const v = VARIANTS[variant];
  return (
    <Pressable
      onClick={onClick}
      disabled={disabled}
      ariaLabel={ariaLabel}
      scale={size === 'cta' || size === 'primary' ? 0.98 : 0.96}
      style={{
        height: s.height,
        borderRadius: s.radius,
        padding: `0 ${s.padX}px`,
        fontSize: s.fontSize,
        letterSpacing: '-.015em',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        width: full ? '100%' : undefined,
        opacity: disabled ? 0.55 : 1,
        ...v,
        ...style,
      }}
    >
      {icon}
      {children}
    </Pressable>
  );
}

/** Botón cuadrado de icono. Mantiene el área táctil de 40px. */
export function IconButton({
  children,
  onClick,
  ariaLabel,
  size = 40,
  disabled,
  style,
}: {
  children: ReactNode;
  onClick?: () => void;
  ariaLabel: string;
  size?: number;
  disabled?: boolean;
  style?: CSSProperties;
}) {
  return (
    <Pressable
      onClick={onClick}
      ariaLabel={ariaLabel}
      disabled={disabled}
      scale={0.93}
      style={{
        width: size,
        height: size,
        borderRadius: 12,
        display: 'grid',
        placeItems: 'center',
        background: 'var(--surface2)',
        color: 'var(--text)',
        flex: `0 0 ${size}px`,
        opacity: disabled ? 0.55 : 1,
        ...style,
      }}
    >
      {children}
    </Pressable>
  );
}
