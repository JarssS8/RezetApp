import { useCallback, useState, type CSSProperties, type ReactNode } from 'react';

/**
 * Feedback de presión en `pointer-down`, nunca al soltar.
 * Devuelve los handlers y el transform actual.
 */
export function usePress(scale: number) {
  const [down, setDown] = useState(false);
  const handlers = {
    onPointerDown: useCallback(() => setDown(true), []),
    onPointerUp: useCallback(() => setDown(false), []),
    onPointerLeave: useCallback(() => setDown(false), []),
    onPointerCancel: useCallback(() => setDown(false), []),
  };
  return {
    handlers,
    style: {
      transform: down ? `scale(${scale})` : 'none',
      transition: 'transform .12s ease-out',
    } as CSSProperties,
  };
}

export interface PressableProps {
  onClick?: () => void;
  scale?: number;
  style?: CSSProperties;
  children?: ReactNode;
  className?: string;
  ariaLabel?: string;
  disabled?: boolean;
  role?: string;
  ariaChecked?: boolean;
  /** Para botones toggle sueltos (no agrupados con role="radio"): comunica cuál está activo. */
  ariaPressed?: boolean;
  type?: 'button' | 'submit';
}

/** Botón con la presión del diseño ya aplicada. */
export function Pressable({
  onClick,
  scale = 0.96,
  style,
  children,
  ariaLabel,
  disabled,
  role,
  ariaChecked,
  ariaPressed,
  type = 'button',
}: PressableProps) {
  const press = usePress(scale);
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      role={role}
      aria-checked={ariaChecked}
      aria-pressed={ariaPressed}
      {...press.handlers}
      style={{
        font: 'inherit',
        color: 'inherit',
        border: 0,
        background: 'none',
        cursor: disabled ? 'default' : 'pointer',
        WebkitTapHighlightColor: 'transparent',
        ...press.style,
        ...style,
      }}
    >
      {children}
    </button>
  );
}
