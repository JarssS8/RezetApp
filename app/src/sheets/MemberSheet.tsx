import { useEffect, useRef, useState } from 'react';
import { usePrefs, ACCENTS } from '../store/prefs';
import { useData } from '../data/storeContext';
import { useAuth } from '../data/auth';
import { supabase } from '../data/supabaseClient';
import { stripHouseholdErrorTag } from '../data/householdErrors';
import { formatKcal } from '../domain/units';
import { Sheet } from '../ui/Sheet';
import { Avatar } from '../ui/Avatar';
import { Pressable } from '../ui/Pressable';
import { Button } from '../ui/Button';
import { Stepper } from '../ui/Stepper';
import { TextField } from '../ui/Fields';
import { Eyebrow } from '../ui/Card';
import { radius } from '../ui/tokens';
import type { Accent, MemberId } from '../types';

/**
 * Objetivo diario en pasos de 50 kcal. El rango tiene que coincidir con el
 * `check (kcal_target between 1000 and 5000)` de la columna
 * (`20260920090000_rezet_member_foundation.sql`): salirse de él en el
 * cliente dispara en modo real una violación de CHECK cruda de Postgres,
 * sin prefijo `REZET_`, que `stripHouseholdErrorTag` no sabe traducir.
 */
const KCAL_STEP = 50;
const KCAL_MIN = 1000;
const KCAL_MAX = 5000;

/**
 * Lado máximo del avatar comprimido, en píxeles: de sobra para el tamaño
 * mayor en que `Avatar.tsx` lo pinta hoy (64px) más margen de pantallas de
 * alta densidad, y muy por debajo del límite de 2 MB del bucket `avatars`
 * (migración `20260920090400_rezet_avatars_storage`) — una foto de móvil sin
 * comprimir lo supera con facilidad. `RecipeForm.tsx` sube el archivo tal
 * cual, sin comprimir; el único sitio del código que sí reduce una imagen
 * antes de mandarla es `PantryScanCapture.tsx` (`canvas.toBlob` a calidad
 * 0.85), así que se reutiliza esa técnica aquí en vez de inventar una nueva.
 * Siempre se reencodea a JPEG — de ahí que la ruta subida termine siempre en
 * `.jpg`, igual que el ejemplo del diseño (`<household_id>/<uuid>.jpg`).
 */
const AVATAR_MAX_DIM = 512;

async function compressAvatar(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, AVATAR_MAX_DIM / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', 0.85),
    );
  } finally {
    bitmap.close();
  }
}

/**
 * Hoja de un miembro (`HouseholdSheet` la abre al tocar una fila): nombre,
 * color y objetivo de kcal propios, y "Quitar del hogar" cuando corresponde.
 * Sigue el patrón de `PantryAddSheet` — formulario simple con un botón de
 * guardar explícito, sin autosave por campo.
 *
 * "Quién soy" y si soy administrador se derivan del propio `Store`
 * (`myMemberId` → `member.authUserId` → el `HouseholdMember` con ese id),
 * igual que en `HouseholdSheet` — así funciona en demo sin `useAuth()`.
 */
export function MemberSheet({
  memberId,
  onClose,
  onToast,
}: {
  memberId: MemberId;
  onClose: () => void;
  onToast?: (msg: string) => void;
}) {
  const { t, locale } = usePrefs();
  const { members, myMemberId, household, setMemberSettings, deleteWardMember } = useData();
  // `null` en demo (sin `useAuth()` real) y mientras carga — mismo patrón que
  // `RecipeForm.tsx`, que gatea la subida de foto de receta con `profile &&`.
  const { profile } = useAuth();
  const member = members.find((m) => m.id === memberId);

  const [displayName, setDisplayName] = useState(member?.displayName ?? '');
  const [color, setColor] = useState<Accent>(member?.color ?? 'green');
  const [kcalTarget, setKcalTarget] = useState(member?.kcalTarget ?? 2000);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);

  const [avatarPath, setAvatarPath] = useState<string | null>(member?.avatarPath ?? null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const avatarInput = useRef<HTMLInputElement>(null);

  // Si la hoja monta antes de que lleguen los miembros (`members` aún vacío
  // en la primera carga), los cuatro `useState` de arriba se quedan clavados
  // en sus valores de fábrica (nombre vacío, verde, 2000, sin avatar) y
  // guardar escribiría eso. Se resincronizan en cuanto cambia la IDENTIDAD
  // del miembro — aparece por primera vez, o esta misma hoja se reutiliza
  // para otro — no en cada cambio de sus campos, para no pisar lo que el
  // usuario está escribiendo mientras edita.
  useEffect(() => {
    if (!member) return;
    setDisplayName(member.displayName);
    setColor(member.color);
    setKcalTarget(member.kcalTarget);
    setAvatarPath(member.avatarPath);
  }, [member?.id]);

  // El bucket `avatars` NO es público (a diferencia de `recipe-photos`): hace
  // falta una URL firmada, que caduca, así que se pide de nuevo cada vez que
  // cambia la ruta en vez de guardarla.
  useEffect(() => {
    if (!avatarPath) {
      setAvatarUrl(null);
      return;
    }
    let cancelled = false;
    void supabase.storage
      .from('avatars')
      .createSignedUrl(avatarPath, 3600)
      .then(({ data }) => {
        if (!cancelled) setAvatarUrl(data?.signedUrl ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [avatarPath]);

  if (!member) {
    return (
      <Sheet title={t.memberSheetTitle} onClose={onClose}>
        <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--muted)' }}>…</div>
      </Sheet>
    );
  }

  // Un miembro borrado solo existe para poner nombre al historial (regla del
  // contrato `Store`): no se enseña ningún control de edición sobre él.
  if (member.deletedAt) {
    return (
      <Sheet title={member.displayName} onClose={onClose}>
        <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--muted)' }}>{t.memberInactive}</div>
      </Sheet>
    );
  }

  const me = members.find((m) => m.id === myMemberId);
  const myAccount = me?.authUserId ? household?.members.find((hm) => hm.id === me.authUserId) : undefined;
  const amIAdmin = myAccount?.isAdmin ?? false;
  const isSelf = member.id === myMemberId;
  /**
   * Espejo de `private.can_act_for` en el servidor: solo tu propia fila o la
   * de un tutelado se puede editar; cualquier otra rechaza con
   * `REZET_FORBIDDEN`. Sin este gate el formulario se dejaba escribir sobre
   * la ficha de cualquier adulto y "Guardar" fallaba siempre.
   */
  const canEdit = isSelf || member.isWard;

  const save = async () => {
    if (!canEdit || !displayName.trim() || saving) return;
    setSaving(true);
    try {
      await setMemberSettings(memberId, { displayName: displayName.trim(), color, kcalTarget });
      onClose();
    } catch (e) {
      onToast?.(stripHouseholdErrorTag(e instanceof Error ? e.message : String(e)) || t.memberActionError);
    } finally {
      setSaving(false);
    }
  };

  const removeWard = async () => {
    if (removing) return;
    setRemoving(true);
    try {
      await deleteWardMember(memberId);
      onClose();
    } catch (e) {
      onToast?.(stripHouseholdErrorTag(e instanceof Error ? e.message : String(e)) || t.memberActionError);
    } finally {
      setRemoving(false);
    }
  };

  // Ruta plana `<household_id>/<uuid>.jpg`, igual que `RecipeForm.tsx` con
  // `recipe-photos` — nunca anidada por miembro (ver la migración
  // `20260920090400_rezet_avatars_storage`, que existe justo para que estas
  // rutas no se le escapen al barrido de huérfanos). Se guarda con
  // `setMemberSettings` en cuanto termina la subida, sin esperar al botón
  // "Guardar" general: el archivo ya está en Storage, no tiene sentido dejar
  // la referencia sin guardar y arriesgarse a que el barrido la trate como
  // huérfana.
  const onPickAvatar = async (file: File) => {
    if (!profile || !canEdit || avatarBusy) return;
    setAvatarBusy(true);
    setAvatarError(null);
    try {
      const blob = await compressAvatar(file);
      const path = `${profile.householdId}/${crypto.randomUUID()}.jpg`;
      const { error } = await supabase.storage.from('avatars').upload(path, blob, {
        cacheControl: '3600',
        upsert: false,
        contentType: 'image/jpeg',
      });
      if (error) throw error;
      await setMemberSettings(memberId, { avatarPath: path });
      setAvatarPath(path);
    } catch {
      setAvatarError(t.photoUploadError);
    } finally {
      setAvatarBusy(false);
    }
  };

  return (
    <Sheet title={t.memberSheetTitle} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 6 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          {/* Vista previa en vivo: el avatar refleja nombre/color todavía sin guardar.
              La foto sí es la ya guardada (URL firmada, el bucket no es público). */}
          <Avatar member={{ ...member, displayName, color }} size={64} src={avatarUrl} />

          {canEdit && profile && (
            <>
              <input
                ref={avatarInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void onPickAvatar(file);
                  e.target.value = '';
                }}
              />
              <Pressable
                onClick={() => avatarInput.current?.click()}
                ariaLabel={avatarUrl ? t.changePhoto : t.addPhoto}
                disabled={avatarBusy}
                scale={0.95}
                style={{
                  fontSize: 13.5,
                  fontWeight: 600,
                  // Texto de acento sobre el fondo de la hoja (claro/tintado): --accent-ink.
                  color: 'var(--accent-ink)',
                  opacity: avatarBusy ? 0.6 : 1,
                }}
              >
                {avatarBusy ? t.uploadingPhoto : avatarUrl ? t.changePhoto : t.addPhoto}
              </Pressable>
              {avatarError && (
                <div style={{ fontSize: 12.5, color: 'var(--warn-ink)' }}>{avatarError}</div>
              )}
            </>
          )}
        </div>

        {!canEdit && (
          <div
            style={{
              fontSize: 13.5,
              lineHeight: 1.45,
              color: 'var(--warn-ink)',
              background: 'var(--warnsoft)',
              borderRadius: radius.chip,
              padding: '10px 12px',
            }}
          >
            {t.memberCannotEdit}
          </div>
        )}

        {/* El servidor rechaza esta edición con `REZET_FORBIDDEN` para quien
            no sea la propia persona o un admin sobre su tutelado
            (`private.can_act_for`) — deshabilitar el formulario entero evita
            que se pueda escribir y pulsar Guardar solo para ver ese error. */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
            opacity: canEdit ? 1 : 0.55,
            pointerEvents: canEdit ? 'auto' : 'none',
          }}
        >
          <div>
            <Eyebrow style={{ marginBottom: 9 }}>{t.memberName}</Eyebrow>
            <TextField value={displayName} onChange={setDisplayName} placeholder={t.memberName} />
          </div>

          <div>
            <Eyebrow style={{ marginBottom: 9 }}>{t.memberColor}</Eyebrow>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {(Object.keys(ACCENTS) as Accent[]).map((key) => (
                <Pressable
                  key={key}
                  onClick={() => setColor(key)}
                  ariaLabel={key}
                  scale={0.9}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: radius.pill,
                    background: ACCENTS[key],
                    border: `2px solid ${color === key ? 'var(--text)' : 'transparent'}`,
                  }}
                />
              ))}
            </div>
          </div>

          <div>
            <Eyebrow style={{ marginBottom: 9 }}>{t.memberKcalTarget}</Eyebrow>
            <Stepper
              value={kcalTarget}
              formatted={`${formatKcal(kcalTarget, locale)} ${t.kcal}`}
              valueWidth={110}
              onDecrement={() => setKcalTarget((v) => Math.max(KCAL_MIN, v - KCAL_STEP))}
              onIncrement={() => setKcalTarget((v) => Math.min(KCAL_MAX, v + KCAL_STEP))}
              label={t.memberKcalTarget}
            />
          </div>
        </div>

        <Button
          full
          disabled={!canEdit || !displayName.trim() || saving}
          onClick={() => void save()}
          style={{ borderRadius: radius.button }}
        >
          {t.save}
        </Button>

        {member.isWard && amIAdmin && (
          <Pressable
            onClick={() => void removeWard()}
            disabled={removing}
            scale={0.98}
            style={{
              height: 48,
              borderRadius: radius.input,
              background: 'var(--warnsoft)',
              color: 'var(--warn-ink)',
              fontSize: 15.5,
              fontWeight: 600,
              opacity: removing ? 0.6 : 1,
            }}
          >
            {t.removeWardMember}
          </Pressable>
        )}
      </div>
    </Sheet>
  );
}
