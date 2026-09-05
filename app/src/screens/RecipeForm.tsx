import { useMemo, useRef, useState } from 'react';
import { usePrefs } from '../store/prefs';
import { useData, type RecipeDraft } from '../data/store';
import { useAuth } from '../data/auth';
import { supabase } from '../data/supabaseClient';
import { parseIngredientLines } from '../domain/recipeText';
import { Chip, OptionChip } from '../ui/Chip';
import { Eyebrow } from '../ui/Card';
import { Pressable } from '../ui/Pressable';
import { PushHeader } from '../ui/Fields';
import { Stepper } from '../ui/Stepper';
import { maxW, radius, tabular } from '../ui/tokens';
import type { Difficulty } from '../types';

const TAGS = ['dieta', 'rápido', 'batch', 'tartera'];
const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

const EMPTY: RecipeDraft = {
  title: '',
  description: '',
  ingredientsText: '',
  stepsText: '',
  baseServings: 2,
  minutes: '',
  kcal: '',
  difficulty: 'easy',
  tags: [],
};

/** Tres campos visibles. Todo lo demás, detrás de "Más detalles". */
export function RecipeForm({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (recipeId: string) => void;
}) {
  const { t } = usePrefs();
  const { saveRecipe } = useData();
  const { profile } = useAuth();
  const [draft, setDraft] = useState<RecipeDraft>(EMPTY);
  const [advanced, setAdvanced] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const patch = (next: Partial<RecipeDraft>) => setDraft((d) => ({ ...d, ...next }));
  const canSave = draft.title.trim().length > 0;

  const onPickPhoto = async (file: File) => {
    if (!profile) return;
    setPhotoBusy(true);
    setPhotoError(null);
    const ext = file.name.split('.').pop() ?? 'jpg';
    const path = `${profile.householdId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from('recipe-photos').upload(path, file, {
      cacheControl: '3600',
      upsert: false,
    });
    setPhotoBusy(false);
    if (error) {
      setPhotoError(t.photoUploadError);
      return;
    }
    patch({ photoPath: path });
    setPhotoPreview(supabase.storage.from('recipe-photos').getPublicUrl(path).data.publicUrl);
  };

  const parsedCount = useMemo(
    () => parseIngredientLines(draft.ingredientsText).length,
    [draft.ingredientsText],
  );

  const submit = async () => {
    if (!canSave) return;
    onSaved(await saveRecipe(draft));
  };

  return (
    <div
      data-screen-label="Nueva receta"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        background: 'var(--bg)',
        overflowY: 'auto',
        animation: 'pushin .3s cubic-bezier(.2,.7,.2,1) both',
      }}
    >
      <PushHeader
        title={t.newRecipe}
        leading={
          <Pressable
            onClick={onClose}
            scale={0.95}
            style={{
              height: 40,
              padding: '0 12px',
              borderRadius: 12,
              background: 'var(--surface2)',
              fontSize: 15,
              fontWeight: 550,
            }}
          >
            {t.cancel}
          </Pressable>
        }
        trailing={
          <Pressable
            onClick={submit}
            scale={0.95}
            style={{
              height: 40,
              padding: '0 16px',
              borderRadius: 12,
              fontSize: 15,
              fontWeight: 650,
              background: canSave ? 'var(--accent)' : 'var(--surface2)',
              color: canSave ? 'var(--onaccent)' : 'var(--muted)',
            }}
          >
            {t.save}
          </Pressable>
        }
      />

      <div
        style={{
          maxWidth: maxW.form,
          margin: '0 auto',
          padding: '22px 20px 60px',
          display: 'flex',
          flexDirection: 'column',
          gap: 22,
        }}
      >
        <div>
          <input
            value={draft.title}
            onChange={(e) => patch({ title: e.target.value })}
            placeholder={t.recipeName}
            aria-label={t.recipeName}
            style={{
              width: '100%',
              border: 0,
              outline: 'none',
              background: 'none',
              fontSize: 27,
              fontWeight: 700,
              letterSpacing: '-.03em',
              padding: '0 2px',
            }}
          />
          <div style={{ height: 1, background: 'var(--line)', marginTop: 12 }} />
          <input
            value={draft.description}
            onChange={(e) => patch({ description: e.target.value })}
            placeholder={t.oneLine}
            aria-label={t.oneLine}
            style={{
              width: '100%',
              border: 0,
              outline: 'none',
              background: 'none',
              fontSize: 16,
              padding: '12px 2px 0',
            }}
          />
        </div>

        <div>
          <Eyebrow style={{ margin: '0 2px 10px' }}>{t.ingredients}</Eyebrow>
          <textarea
            value={draft.ingredientsText}
            onChange={(e) => patch({ ingredientsText: e.target.value })}
            placeholder={t.ingsPlaceholder}
            rows={6}
            aria-label={t.ingredients}
            style={{
              width: '100%',
              border: '1px solid var(--line)',
              background: 'var(--surface)',
              borderRadius: radius.button,
              padding: 14,
              fontSize: 15.5,
              lineHeight: 1.7,
              outline: 'none',
              resize: 'vertical',
              boxShadow: 'var(--shadow-s)',
            }}
          />
          <div style={{ marginTop: 8, fontSize: 13, color: 'var(--muted)', padding: '0 2px' }}>
            {parsedCount ? `${parsedCount} ${t.ingsParsed}` : t.ingsHint}
          </div>
        </div>

        <div>
          <Eyebrow style={{ margin: '0 2px 10px' }}>{t.steps}</Eyebrow>
          <textarea
            value={draft.stepsText}
            onChange={(e) => patch({ stepsText: e.target.value })}
            placeholder={t.stepsPlaceholder}
            rows={6}
            aria-label={t.steps}
            style={{
              width: '100%',
              border: '1px solid var(--line)',
              background: 'var(--surface)',
              borderRadius: radius.button,
              padding: 14,
              fontSize: 15.5,
              lineHeight: 1.7,
              outline: 'none',
              resize: 'vertical',
              boxShadow: 'var(--shadow-s)',
            }}
          />
        </div>

        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            borderRadius: radius.list,
            boxShadow: 'var(--shadow-s)',
            overflow: 'hidden',
          }}
        >
          <Pressable
            onClick={() => setAdvanced((v) => !v)}
            scale={1}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '15px 16px',
              fontSize: 15.5,
              fontWeight: 600,
              letterSpacing: '-.015em',
            }}
          >
            <span>{t.moreDetails}</span>
            <span style={{ color: 'var(--muted)', fontSize: 13 }}>{advanced ? '–' : '+'}</span>
          </Pressable>

          {advanced && (
            <div
              style={{
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
                borderTop: '1px solid var(--line)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 15, fontWeight: 550 }}>{t.baseServings}</div>
                <Stepper
                  size="sm"
                  value={draft.baseServings}
                  label={t.baseServings}
                  valueWidth={32}
                  onDecrement={() => patch({ baseServings: Math.max(1, draft.baseServings - 1) })}
                  onIncrement={() => patch({ baseServings: Math.min(24, draft.baseServings + 1) })}
                />
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                <label style={{ flex: 1, display: 'block' }}>
                  <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 6 }}>{t.minutes}</div>
                  <input
                    value={draft.minutes}
                    onChange={(e) => patch({ minutes: e.target.value.replace(/\D/g, '') })}
                    inputMode="numeric"
                    placeholder="25"
                    style={{
                      width: '100%',
                      height: 44,
                      border: '1px solid var(--line)',
                      background: 'var(--surface2)',
                      borderRadius: 12,
                      padding: '0 12px',
                      fontSize: 15.5,
                      outline: 'none',
                      ...tabular,
                    }}
                  />
                </label>
                <label style={{ flex: 1, display: 'block' }}>
                  <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 6 }}>
                    {t.kcalServingLabel}
                  </div>
                  <input
                    value={draft.kcal}
                    onChange={(e) => patch({ kcal: e.target.value.replace(/\D/g, '') })}
                    inputMode="numeric"
                    placeholder="450"
                    style={{
                      width: '100%',
                      height: 44,
                      border: '1px solid var(--line)',
                      background: 'var(--surface2)',
                      borderRadius: 12,
                      padding: '0 12px',
                      fontSize: 15.5,
                      outline: 'none',
                      ...tabular,
                    }}
                  />
                </label>
              </div>

              <div>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>{t.difficulty}</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {DIFFICULTIES.map((d) => (
                    <OptionChip
                      key={d}
                      label={t[d]}
                      height={40}
                      active={draft.difficulty === d}
                      onClick={() => patch({ difficulty: d })}
                    />
                  ))}
                </div>
              </div>

              {profile && (
                <div>
                  <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>{t.photoSlot}</div>
                  <input
                    ref={fileInput}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    hidden
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void onPickPhoto(file);
                      e.target.value = '';
                    }}
                  />
                  <Pressable
                    onClick={() => fileInput.current?.click()}
                    ariaLabel={photoPreview ? t.changePhoto : t.addPhoto}
                    scale={0.98}
                    disabled={photoBusy}
                    style={{
                      width: '100%',
                      height: photoPreview ? 120 : 44,
                      borderRadius: radius.button,
                      background: photoPreview ? 'transparent' : 'var(--surface2)',
                      overflow: 'hidden',
                      fontSize: 14.5,
                      fontWeight: 550,
                    }}
                  >
                    {photoPreview ? (
                      <img
                        src={photoPreview}
                        alt=""
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <span>{photoBusy ? t.uploadingPhoto : t.addPhoto}</span>
                    )}
                  </Pressable>
                  {photoError && (
                    <div style={{ marginTop: 6, fontSize: 12.5, color: 'var(--warn-ink)' }}>{photoError}</div>
                  )}
                </div>
              )}

              <div>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>{t.tags}</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {TAGS.map((tg) => (
                    <Chip
                      key={tg}
                      label={tg}
                      active={draft.tags.includes(tg)}
                      onClick={() =>
                        patch({
                          tags: draft.tags.includes(tg)
                            ? draft.tags.filter((x) => x !== tg)
                            : [...draft.tags, tg],
                        })
                      }
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
