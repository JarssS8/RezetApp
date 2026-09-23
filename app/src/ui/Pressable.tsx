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
  /**
   * Opcional — pasada tal cual al `<button>`. Añadida para
   * `DashboardEditSheet.tsx` (I3, revisión final de rama): mover el foco a
   * un botón hermano ANTES de que React deshabilite el que se acaba de
   * pulsar necesita poder encontrarlo por `id` con `document.getElementById`,
   * porque ni `Pressable` ni `IconButton` reenvían `ref`.
   */
  id?: string;
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
  id,
}: PressableProps) {
  const press = usePress(scale);
  return (
    <button
      type={type}
      id={id}
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
