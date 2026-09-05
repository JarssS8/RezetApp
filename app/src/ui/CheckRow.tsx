import type { ReactNode } from 'react';
import { Pressable } from './Pressable';
import { radius, text as T } from './tokens';

/** Casilla accesible: role checkbox + aria-checked, no un div decorativo. */
export function CheckRow({
  checked,
  onToggle,
  label,
  sublabel,
  sublabelTone = 'muted',
  trailing,
  warn,
  size = 22,
}: {
  checked: boolean;
  onToggle: () => void;
  label: ReactNode;
  sublabel?: ReactNode;
  sublabelTone?: 'muted' | 'warn';
  trailing?: ReactNode;
  warn?: boolean;
  size?: number;
}) {
  return (
    <Pressable
      onClick={onToggle}
      role="checkbox"
      ariaChecked={checked}
      scale={1}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 13,
        padding: '14px 15px',
        borderBottom: '1px solid var(--line)',
        textAlign: 'left',
        background: warn ? 'var(--warnsoft)' : 'transparent',
      }}
    >
      <div
        style={{
          width: size,
          height: size,
          flex: `0 0 ${size}px`,
          borderRadius: radius.check,
          display: 'grid',
          placeItems: 'center',
          border: `2px solid ${checked ? 'var(--accent)' : 'var(--line)'}`,
          background: checked ? 'var(--accent)' : 'transparent',
        }}
      >
        {checked && (
          <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill="none" stroke="var(--onaccent)" strokeWidth={3.4} strokeLinecap="round">
            <path d="M4 12.5 9.5 18 20 6.5" />
          </svg>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            ...T.row,
            color: checked ? 'var(--muted)' : 'var(--text)',
            textDecoration: checked ? 'line-through' : 'none',
          }}
        >
          {label}
        </div>
        {sublabel != null && (
          <div
            style={{
              marginTop: 3,
              fontSize: 12.5,
              color: sublabelTone === 'warn' ? 'var(--warn-ink)' : 'var(--muted)',
            }}
          >
            {sublabel}
          </div>
        )}
      </div>
      {trailing}
    </Pressable>
  );
}
