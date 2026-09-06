import { Pressable } from 'rezet';

export function Basic() {
  return (
    <Pressable
      onClick={() => {}}
      ariaLabel="Acción"
      style={{
        padding: '10px 18px',
        borderRadius: 12,
        background: 'var(--surface2)',
        color: 'var(--text)',
        fontWeight: 600,
      }}
    >
      Presiona aquí
    </Pressable>
  );
}

export function Disabled() {
  return (
    <Pressable
      disabled
      ariaLabel="Acción deshabilitada"
      style={{
        padding: '10px 18px',
        borderRadius: 12,
        background: 'var(--surface2)',
        color: 'var(--muted)',
        fontWeight: 600,
        opacity: 0.6,
      }}
    >
      No disponible
    </Pressable>
  );
}
