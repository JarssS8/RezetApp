import { ACCENTS } from '../store/prefs';
import type { Member } from '../types';

/**
 * La inicial sobre el color del miembro es el caso NORMAL, no el hueco de
 * cuando falta la foto: casi nadie va a subir una. Tiene que verse bien.
 */
export function Avatar({
  member,
  size = 36,
  src,
}: {
  member: Member;
  size?: number;
  /** URL firmada del avatar, si la hay (el bucket no es público). */
  src?: string | null;
}) {
  const initial = member.displayName.trim().charAt(0).toUpperCase() || '·';
  return (
    <div
      aria-hidden
      style={{
        width: size,
        height: size,
        flex: `0 0 ${size}px`,
        borderRadius: '50%',
        overflow: 'hidden',
        background: ACCENTS[member.color],
        display: 'grid',
        placeItems: 'center',
        // Texto sobre un relleno de acento: --onaccent. Nunca --accent-ink,
        // que es para texto sobre fondo claro o tintado.
        color: 'var(--onaccent)',
        fontSize: Math.round(size * 0.42),
        fontWeight: 600,
        opacity: member.deletedAt ? 0.45 : 1,
      }}
    >
      {src ? (
        <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        initial
      )}
    </div>
  );
}
