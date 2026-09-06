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
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string }>;
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
    return () => window.removeEventListener('resize', measure);
  }, [index, options.length]);

  return (
    <div
      ref={trackRef}
      role="radiogroup"
      style={{
        position: 'relative',
        display: 'flex',
        background: 'var(--surface2)',
        borderRadius: radius.chip,
        padding: 3,
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
