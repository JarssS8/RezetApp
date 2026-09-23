import type { CSSProperties } from 'react';
import { radius } from './tokens';

/**
 * Interruptor de encendido/apagado.
 *
 * Nació como tres copias idénticas dentro de `NotifySheet`, `HouseholdSheet` y
 * `DashboardEditSheet`, porque ni `RezetApp.dc.html` ni el `README` traen uno:
 * es una pieza que faltaba en el sistema de diseño y cada hoja se la inventó.
 * Aquí está una sola vez.
 *
 * Dos cosas que las copias hacían mal y que este arregla:
 *
 * - **La bolita era un `radial-gradient` hacia `transparent`.** Ese degradado
 *   interpola hacia negro transparente, así que dejaba un halo gris alrededor
 *   del círculo en vez de un borde limpio. Aquí la bolita es un elemento de
 *   verdad, con su sombra.
 * - **No se movía.** La animación iba en `background-position`, entre
 *   `left 3px center` y `right 3px center`: ningún navegador interpola entre
 *   dos posiciones con palabras clave distintas, así que la bolita saltaba de
 *   un lado a otro. Aquí se mueve con `transform`, que sí anima.
 *
 * El control real sigue siendo un `<input type="checkbox" role="switch">`
 * nativo, invisible pero encima de todo: el foco, el teclado, el estado que
 * anuncia un lector de pantalla y el `disabled` son los del navegador, no
 * imitaciones. El aro de foco vive en `tokens.css` (`.rz-switch`), porque un
 * `:focus-visible` no se puede escribir en estilos en línea.
 */
export function Switch({
  checked,
  onChange,
  ariaLabel,
  disabled,
  id,
  style,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  ariaLabel?: string;
  disabled?: boolean;
  id?: string;
  style?: CSSProperties;
}) {
  const TRACK_W = 44;
  const TRACK_H = 26;
  const KNOB = 20;
  const INSET = 2;
  // Lo que recorre la bolita de un extremo al otro, medido y no a ojo.
  const TRAVEL = TRACK_W - KNOB - INSET * 2;

  return (
    <span
      className="rz-switch"
      style={{
        position: 'relative',
        display: 'inline-block',
        flex: `0 0 ${TRACK_W}px`,
        width: TRACK_W,
        height: TRACK_H,
        opacity: disabled ? 0.55 : 1,
        ...style,
      }}
    >
      {/* La pista. `aria-hidden`: lo que se anuncia es el input de abajo. */}
      <span
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: radius.pill,
          border: '1px solid var(--line)',
          // `--accent` es un RELLENO; la bolita es `--surface`, nunca
          // `--onaccent`, que es un token para TEXTO sobre relleno de acento.
          background: checked ? 'var(--accent)' : 'var(--surface2)',
          transition: 'background-color .18s ease, border-color .18s ease',
        }}
      />
      <span
        aria-hidden
        style={{
          position: 'absolute',
          top: (TRACK_H - KNOB) / 2,
          left: INSET,
          width: KNOB,
          height: KNOB,
          borderRadius: '50%',
          background: 'var(--surface)',
          boxShadow: 'var(--shadow-s)',
          transform: `translateX(${checked ? TRAVEL : 0}px)`,
          transition: 'transform .18s cubic-bezier(.2,.75,.2,1)',
        }}
      />
      <input
        type="checkbox"
        role="switch"
        id={id}
        aria-label={ariaLabel}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          margin: 0,
          opacity: 0,
          cursor: disabled ? 'default' : 'pointer',
        }}
      />
    </span>
  );
}
