import { forwardRef } from 'react';
import type { CSSProperties, KeyboardEvent, ReactNode, Ref } from 'react';
import { Icon } from './Icon';
import { Pressable } from './Pressable';
import { glassHeader, height, radius, screen } from './tokens';

/** Toast, anunciado en una región aria-live. */
export function Toast({ message }: { message: string | null }) {
  return (
    <div
      aria-live="polite"
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 96,
        zIndex: 90,
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
        padding: '0 20px',
      }}
    >
      {message && (
        <div
          style={{
            maxWidth: 420,
            padding: '13px 18px',
            borderRadius: radius.button,
            background: 'var(--glass)',
            backdropFilter: 'blur(20px) saturate(180%)',
            WebkitBackdropFilter: 'blur(20px) saturate(180%)',
            border: '1px solid var(--line)',
            boxShadow: 'var(--shadow-l)',
            fontSize: 14.5,
            fontWeight: 600,
            letterSpacing: '-.01em',
            textAlign: 'center',
            animation: 'toastin .28s cubic-bezier(.2,.75,.2,1) both',
          }}
        >
          {message}
        </div>
      )}
    </div>
  );
}

/** Buscador. */
export function SearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        height: height.input,
        padding: '0 14px',
        borderRadius: radius.input,
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        boxShadow: 'var(--shadow-s)',
      }}
    >
      <span style={{ color: 'var(--muted)', display: 'grid' }}>
        <Icon name="search" size={17} />
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          flex: 1,
          minWidth: 0,
          border: 0,
          outline: 'none',
          background: 'none',
          fontSize: 16,
          letterSpacing: '-.01em',
        }}
      />
      {value && (
        <Pressable
          onClick={() => onChange('')}
          ariaLabel="Limpiar"
          scale={0.9}
          style={{
            width: 24,
            height: 24,
            borderRadius: radius.pill,
            display: 'grid',
            placeItems: 'center',
            background: 'var(--surface2)',
            color: 'var(--muted)',
          }}
        >
          <Icon name="close" size={12} strokeWidth={2.6} />
        </Pressable>
      )}
    </div>
  );
}

/** Campo de texto con caja. */
export const TextField = forwardRef(function TextField(
  {
    value,
    onChange,
    placeholder,
    inputMode,
    type = 'text',
    min,
    style,
    onFocus,
    onBlur,
    onKeyDown,
    ariaLabel,
  }: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    inputMode?: 'numeric' | 'decimal' | 'text';
    type?: 'text' | 'date';
    min?: string;
    style?: CSSProperties;
    onFocus?: () => void;
    onBlur?: () => void;
    onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
    ariaLabel?: string;
  },
  ref: Ref<HTMLInputElement>,
) {
  return (
    <input
      ref={ref}
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      inputMode={inputMode}
      min={min}
      onFocus={onFocus}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      aria-label={ariaLabel}
      style={{
        width: '100%',
        height: 50,
        border: '1px solid var(--line)',
        background: 'var(--surface2)',
        borderRadius: radius.input,
        padding: '0 14px',
        fontSize: 16.5,
        outline: 'none',
        ...style,
      }}
    />
  );
});

/** Cabecera translúcida de una vista apilada. */
export function PushHeader({
  onBack,
  title,
  leading,
  trailing,
  backLabel = 'Atrás',
}: {
  onBack?: () => void;
  title?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  backLabel?: string;
}) {
  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 2,
        ...glassHeader,
        borderBottom: '1px solid var(--line)',
        padding: '10px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}
    >
      {leading ??
        (onBack && (
          <Pressable
            onClick={onBack}
            ariaLabel={backLabel}
            scale={0.93}
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              display: 'grid',
              placeItems: 'center',
              background: 'var(--surface2)',
              flex: '0 0 40px',
            }}
          >
            <Icon name="chevronLeft" size={18} strokeWidth={2.2} />
          </Pressable>
        ))}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: 16,
          fontWeight: 600,
          letterSpacing: '-.015em',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          textAlign: trailing ? 'center' : 'left',
        }}
      >
        {title}
      </div>
      {trailing}
    </div>
  );
}

/** Contenedor de pantalla: ancho máximo, aire arriba y reserva inferior. */
export function ScreenBody({
  maxWidth,
  children,
  label,
}: {
  maxWidth: number;
  children: ReactNode;
  label: string;
}) {
  return (
    <div
      data-screen-label={label}
      style={{
        flex: 1,
        padding: `0 ${screen.padX}px ${screen.padBottomMobile}px`,
        animation: 'fadein .28s both',
      }}
    >
      <div style={{ maxWidth, margin: '0 auto' }}>{children}</div>
    </div>
  );
}

/** Título de pantalla con acción a la derecha. */
export function ScreenHeader({
  title,
  eyebrow,
  trailing,
  subtitle,
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: 12,
        padding: `${screen.padTop}px 0 18px`,
        flexWrap: 'wrap',
      }}
    >
      <div>
        {eyebrow != null && (
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: '.06em',
              textTransform: 'uppercase',
              color: 'var(--accent-ink)',
            }}
          >
            {eyebrow}
          </div>
        )}
        <h1
          style={{
            margin: eyebrow != null ? '6px 0 0' : 0,
            fontSize: 34,
            fontWeight: 700,
            letterSpacing: '-.03em',
            lineHeight: 1,
          }}
        >
          {title}
        </h1>
        {subtitle != null && (
          <div style={{ marginTop: 8, fontSize: 14.5, color: 'var(--muted)' }}>{subtitle}</div>
        )}
      </div>
      {trailing}
    </div>
  );
}
