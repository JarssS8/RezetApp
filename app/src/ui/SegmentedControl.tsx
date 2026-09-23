import { useLayoutEffect, useRef, useState } from 'react';
import { Pressable } from './Pressable';
import { EASE } from '../motion/motion';
import { height, radius } from './tokens';

/**
 * Control segmentado real: una pista hundida y una píldora que se desliza,
 * no N botones de igual peso. Genérico sobre un union de strings para poder
 * reutilizarlo sin rediseñarlo.
 */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  disabled,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string }>;
  /**
   * `disabled` de verdad, hasta el `<button disabled>` nativo de cada
   * opción — no un envoltorio con `pointerEvents: 'none'` por fuera. Ese
   * envoltorio bloquea el ratón y el toque, pero no el foco por Tab ni la
   * activación por Enter/Espacio: un `<button>` nativo dispara `click` al
   * activarse por teclado sin pasar por el pipeline de punteros, así que
   * `pointer-events` nunca lo intercepta (hallazgo de revisión de
   * `DashboardEditSheet.tsx`, ronda 2). `Pressable` ya sabe deshabilitarse
   * de verdad; aquí solo se reenvía.
   */
  disabled?: boolean;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);
  const index = options.findIndex((o) => o.value === value);

  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const measure = () => {
      const btn = track.querySelectorAll('button')[index] as HTMLElement | undefined;
      if (btn) setPill({ left: btn.offsetLeft, width: btn.offsetWidth });
    };
    measure();
    window.addEventListener('resize', measure);
    const ro = new ResizeObserver(measure);
    ro.observe(track);
    return () => {
      window.removeEventListener('resize', measure);
      ro.disconnect();
    };
  }, [index, options.length]);

  return (
    <div
      ref={trackRef}
      role="radiogroup"
      aria-disabled={disabled}
      style={{
        position: 'relative',
        display: 'flex',
        background: 'var(--surface2)',
        borderRadius: radius.chip,
        padding: 3,
        // Una sola atenuación, aquí: con `disabled` de verdad en cada
        // `Pressable`, no hace falta que quien use este componente lo
        // envuelva aparte para apagarlo visualmente.
        opacity: disabled ? 0.55 : 1,
      }}
    >
      {pill && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: 3,
            bottom: 3,
            left: pill.left,
            width: pill.width,
            background: 'var(--surface)',
            borderRadius: radius.chip - 3,
            boxShadow: 'var(--shadow-s)',
            transition: `left .22s ${EASE}, width .22s ${EASE}`,
          }}
        />
      )}
      {options.map((o) => (
        <Pressable
          key={o.value}
          onClick={() => onChange(o.value)}
          role="radio"
          ariaChecked={o.value === value}
          disabled={disabled}
          scale={0.97}
          style={{
            position: 'relative',
            flex: 1,
            height: height.segment,
            borderRadius: radius.chip - 3,
            fontSize: 14,
            fontWeight: 600,
            color: o.value === value ? 'var(--text)' : 'var(--muted)',
            transition: `color .18s ${EASE}`,
          }}
        >
          {o.label}
        </Pressable>
      ))}
    </div>
  );
}
