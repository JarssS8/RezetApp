import { useMemo, useRef, useState } from 'react';
import { usePrefs } from '../store/prefs';
import { useData, type RecipeDraft } from '../data/store';
import { useAuth } from '../data/auth';
import { supabase } from '../data/supabaseClient';
import { Button } from '../ui/Button';
import { Chip, OptionChip } from '../ui/Chip';
import { Eyebrow } from '../ui/Card';
import { Pressable } from '../ui/Pressable';
import { PushHeader, TextField } from '../ui/Fields';
import { IngredientNameField } from '../ui/IngredientNameField';
import { Icon } from '../ui/Icon';
import { AlertDialog } from '../ui/Sheet';
import { Stepper } from '../ui/Stepper';
import { StepNumber } from '../ui/Card';
import { maxW, radius, tabular } from '../ui/tokens';
import { useStackDismiss } from '../motion/useStackDismiss';
import type { Difficulty, Ingredient, Localized, Recipe, Unit } from '../types';

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];
const UNITS: Unit[] = ['g', 'ml', 'ud', 'tbsp'];

const emptyIngredient = () => ({ name: '', quantity: '', unit: 'g' as Unit, toTaste: false });
const emptyStep = () => ({ text: '', timerMinutes: '' });

const EMPTY: RecipeDraft = {
  title: '',
  description: '',
  ingredients: [emptyIngredient()],
  steps: [emptyStep()],
  baseServings: 2,
  minutes: '',
  kcal: '',
  difficulty: 'easy',
  tags: [],
};

function draftFromRecipe(recipe: Recipe, ingredientById: Map<string, Ingredient>, locale: 'es' | 'en'): RecipeDraft {
  const nameOf = (l: Localized) => l[locale] || l.es;
  return {
    id: recipe.id,
    title: nameOf(recipe.name),
    description: nameOf(recipe.description),
    ingredients: recipe.ingredients.map((ri) => ({
      name: nameOf(ingredientById.get(ri.ingredientId)?.name ?? { es: '', en: '' }),
      quantity: ri.quantity == null ? '' : String(ri.quantity),
      unit: ri.unit ?? 'g',
      toTaste: ri.toTaste ?? false,
    })),
    steps: recipe.steps.map((s) => ({
      text: nameOf(s.text),
      timerMinutes: s.timerMinutes ? String(s.timerMinutes) : '',
    })),
    baseServings: recipe.baseServings,
    minutes: String(recipe.minutes),
    kcal: String(recipe.kcalPerServing),
    difficulty: recipe.difficulty,
    tags: recipe.tags,
  };
}

/** Tres campos visibles. Todo lo demás, detrás de "Más detalles". */
export function RecipeForm({
  recipe,
  onClose,
  onSaved,
}: {
  /** Si viene, el formulario edita esta receta en vez de crear una nueva. */
  recipe?: Recipe;
  onClose: () => void;
  onSaved: (recipeId: string) => void;
}) {
  const { t, locale, loc } = usePrefs();
  const { saveRecipe, deleteRecipe, ingredients, ingredientById, knownTags: allKnownTags } = useData();
  const { profile } = useAuth();
  const [draft, setDraft] = useState<RecipeDraft>(() =>
    recipe ? draftFromRecipe(recipe, ingredientById, locale) : EMPTY,
  );
  const [advanced, setAdvanced] = useState(false);
  const [newTag, setNewTag] = useState('');
  const [photoPreview, setPhotoPreview] = useState<string | null>(recipe?.photoUrl ?? null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  // Tras guardar, la salida anima igual que un cierre normal; solo cambia adónde se
  // navega cuando termina (README §7: toda pantalla sale por el mismo camino).
  const [savedId, setSavedId] = useState<string | null>(null);
  const stack = useStackDismiss(() => (savedId ? onSaved(savedId) : onClose()));
  const [confirmDelete, setConfirmDelete] = useState(false);

  const patch = (next: Partial<RecipeDraft>) => setDraft((d) => ({ ...d, ...next }));
  const canSave = draft.title.trim().length > 0;

  const patchIngredient = (index: number, next: Partial<RecipeDraft['ingredients'][number]>) =>
    setDraft((d) => ({
      ...d,
      ingredients: d.ingredients.map((ri, i) => (i === index ? { ...ri, ...next } : ri)),
    }));
  const addIngredientRow = () => setDraft((d) => ({ ...d, ingredients: [...d.ingredients, emptyIngredient()] }));
  const removeIngredientRow = (index: number) =>
    setDraft((d) => ({ ...d, ingredients: d.ingredients.filter((_, i) => i !== index) }));

  const patchStep = (index: number, next: Partial<RecipeDraft['steps'][number]>) =>
    setDraft((d) => ({ ...d, steps: d.steps.map((s, i) => (i === index ? { ...s, ...next } : s)) }));
  const addStepRow = () => setDraft((d) => ({ ...d, steps: [...d.steps, emptyStep()] }));
  const removeStepRow = (index: number) => setDraft((d) => ({ ...d, steps: d.steps.filter((_, i) => i !== index) }));
  const moveStep = (index: number, dir: -1 | 1) =>
    setDraft((d) => {
      const target = index + dir;
      if (target < 0 || target >= d.steps.length) return d;
      const steps = [...d.steps];
      [steps[index], steps[target]] = [steps[target]!, steps[index]!];
      return { ...d, steps };
    });

  // El catálogo real de etiquetas ya viene deduplicado por nombre desde el
  // servidor (tabla `tag`); aquí solo añadimos un puñado de arranque para
  // hogares sin recetas todavía y quitamos las ya elegidas en este borrador.
  const knownTags = useMemo(() => {
    const starters = ['dieta', 'rápido', 'batch', 'tartera'];
    return Array.from(new Set([...starters, ...allKnownTags])).filter((tg) => !draft.tags.includes(tg));
  }, [allKnownTags, draft.tags]);

  const addTag = (tg: string) => {
    const clean = tg.trim();
    if (!clean || draft.tags.includes(clean)) return;
    patch({ tags: [...draft.tags, clean] });
    setNewTag('');
  };
  const removeTag = (tg: string) => patch({ tags: draft.tags.filter((x) => x !== tg) });

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

  const submit = async () => {
    if (!canSave) return;
    setSavedId(await saveRecipe(draft));
    stack.dismiss();
  };

  return (
    <>
    <div
      data-screen-label={recipe ? 'Editar receta' : 'Nueva receta'}
      onAnimationEnd={stack.onAnimationEnd}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        background: 'var(--bg)',
        overflowY: 'auto',
        ...stack.style,
      }}
    >
      <PushHeader
        title={recipe ? t.editRecipe : t.newRecipe}
        leading={
          <Pressable
            onClick={stack.dismiss}
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
            onClick={() => void submit()}
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {draft.ingredients.map((ri, index) => (
              <div
                key={index}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  padding: 12,
                  background: 'var(--surface)',
                  border: '1px solid var(--line)',
                  borderRadius: radius.button,
                  boxShadow: 'var(--shadow-s)',
                }}
              >
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <IngredientNameField
                      value={ri.name}
                      onChange={(v) => patchIngredient(index, { name: v })}
                      onPick={(ing) => patchIngredient(index, { name: loc(ing.name), unit: ing.defaultUnit })}
                      placeholder={t.ingredientNamePlaceholder}
                      ingredients={ingredients}
                      locale={locale}
                      loc={loc}
                      style={{ height: 44 }}
                    />
                  </div>
                  <Pressable
                    onClick={() => removeIngredientRow(index)}
                    ariaLabel={t.removeIngredient}
                    scale={0.9}
                    style={{
                      width: 44,
                      height: 44,
                      flex: '0 0 44px',
                      borderRadius: radius.pill,
                      display: 'grid',
                      placeItems: 'center',
                      color: 'var(--warn-ink)',
                    }}
                  >
                    <Icon name="close" size={14} strokeWidth={2.4} />
                  </Pressable>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <OptionChip
                    label={t.toTaste}
                    height={44}
                    active={ri.toTaste}
                    onClick={() => patchIngredient(index, { toTaste: !ri.toTaste })}
                  />
                  {!ri.toTaste && (
                    <>
                      <TextField
                        value={ri.quantity}
                        onChange={(v) => patchIngredient(index, { quantity: v.replace(/[^\d.,]/g, '') })}
                        placeholder={t.quantityPlaceholder}
                        inputMode="decimal"
                        ariaLabel={t.quantityPlaceholder}
                        style={{ flex: '0 0 96px', height: 44, ...tabular }}
                      />
                      <div style={{ display: 'flex', gap: 6, flex: 1 }}>
                        {UNITS.map((u) => (
                          <OptionChip
                            key={u}
                            label={
                              u === 'ud' ? (locale === 'es' ? 'uds' : 'pcs')
                              : u === 'tbsp' ? (locale === 'es' ? 'cda' : 'tbsp')
                              : u
                            }
                            height={44}
                            active={ri.unit === u}
                            onClick={() => patchIngredient(index, { unit: u })}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
          <Pressable
            onClick={addIngredientRow}
            scale={0.98}
            style={{
              marginTop: 10,
              width: '100%',
              height: 44,
              borderRadius: radius.button,
              border: '1px dashed var(--line)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              fontSize: 14.5,
              fontWeight: 600,
              color: 'var(--accent-ink)',
            }}
          >
            <Icon name="plus" size={15} />
            {t.addIngredient}
          </Pressable>
        </div>

        <div>
          <Eyebrow style={{ margin: '0 2px 10px' }}>{t.steps}</Eyebrow>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {draft.steps.map((s, index) => (
              <div
                key={index}
                style={{
                  display: 'flex',
                  gap: 10,
                  padding: 12,
                  background: 'var(--surface)',
                  border: '1px solid var(--line)',
                  borderRadius: radius.button,
                  boxShadow: 'var(--shadow-s)',
                }}
              >
                <StepNumber n={index + 1} />
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <textarea
                    value={s.text}
                    onChange={(e) => patchStep(index, { text: e.target.value })}
                    placeholder={t.stepPlaceholder}
                    rows={2}
                    aria-label={`${t.steps} ${index + 1}`}
                    style={{
                      width: '100%',
                      border: '1px solid var(--line)',
                      background: 'var(--surface2)',
                      borderRadius: 12,
                      padding: 10,
                      fontSize: 15,
                      lineHeight: 1.5,
                      outline: 'none',
                      resize: 'vertical',
                    }}
                  />
                  <TextField
                    value={s.timerMinutes}
                    onChange={(v) => patchStep(index, { timerMinutes: v.replace(/\D/g, '') })}
                    placeholder={t.timerMinutesPlaceholder}
                    inputMode="numeric"
                    ariaLabel={t.timerMinutesPlaceholder}
                    style={{ height: 40, width: 160, fontSize: 14, ...tabular }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 2,
                      background: 'var(--surface2)',
                      borderRadius: radius.stepper,
                      padding: 3,
                    }}
                  >
                    <Pressable
                      onClick={() => moveStep(index, -1)}
                      disabled={index === 0}
                      ariaLabel={t.moveStepUp}
                      scale={0.9}
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 9,
                        display: 'grid',
                        placeItems: 'center',
                        color: 'var(--muted)',
                        opacity: index === 0 ? 0.35 : 1,
                      }}
                    >
                      <Icon name="chevronUp" size={15} />
                    </Pressable>
                    <Pressable
                      onClick={() => moveStep(index, 1)}
                      disabled={index === draft.steps.length - 1}
                      ariaLabel={t.moveStepDown}
                      scale={0.9}
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 9,
                        display: 'grid',
                        placeItems: 'center',
                        color: 'var(--muted)',
                        opacity: index === draft.steps.length - 1 ? 0.35 : 1,
                      }}
                    >
                      <Icon name="chevronDown" size={15} />
                    </Pressable>
                  </div>
                  <Pressable
                    onClick={() => removeStepRow(index)}
                    ariaLabel={t.removeStep}
                    scale={0.9}
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: radius.pill,
                      display: 'grid',
                      placeItems: 'center',
                      color: 'var(--warn-ink)',
                    }}
                  >
                    <Icon name="close" size={14} strokeWidth={2.4} />
                  </Pressable>
                </div>
              </div>
            ))}
          </div>
          <Pressable
            onClick={addStepRow}
            scale={0.98}
            style={{
              marginTop: 10,
              width: '100%',
              height: 44,
              borderRadius: radius.button,
              border: '1px dashed var(--line)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              fontSize: 14.5,
              fontWeight: 600,
              color: 'var(--accent-ink)',
            }}
          >
            <Icon name="plus" size={15} />
            {t.addStep}
          </Pressable>
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
                {draft.tags.length > 0 && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                    {draft.tags.map((tg) => (
                      <div
                        key={tg}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          height: 34,
                          padding: '0 8px 0 14px',
                          borderRadius: radius.pill,
                          background: 'var(--soft)',
                          color: 'var(--accent-ink)',
                          fontSize: 14,
                          fontWeight: 550,
                        }}
                      >
                        {tg}
                        <Pressable
                          onClick={() => removeTag(tg)}
                          ariaLabel={t.removeTag}
                          scale={0.85}
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: radius.pill,
                            display: 'grid',
                            placeItems: 'center',
                          }}
                        >
                          <Icon name="close" size={11} strokeWidth={2.6} />
                        </Pressable>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  <TextField
                    value={newTag}
                    onChange={setNewTag}
                    placeholder={t.newTagPlaceholder}
                    ariaLabel={t.newTagPlaceholder}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addTag(newTag);
                      }
                    }}
                    style={{ height: 40, fontSize: 14.5 }}
                  />
                  <Pressable
                    onClick={() => addTag(newTag)}
                    scale={0.95}
                    style={{
                      flex: '0 0 auto',
                      height: 40,
                      padding: '0 16px',
                      borderRadius: radius.input,
                      background: 'var(--surface2)',
                      fontSize: 14,
                      fontWeight: 600,
                    }}
                  >
                    {t.addTag}
                  </Pressable>
                </div>
                {knownTags.length > 0 && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                    {knownTags.map((tg) => (
                      <Chip key={tg} label={tg} active={false} onClick={() => addTag(tg)} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {recipe && (
          // Zona de peligro: propia sección, fuera de "Más detalles" — no dentro
          // (se veía como si formara parte de esa tarjeta). Solo al editar, nunca
          // al crear; vive aquí para que un toque en falso desde el detalle de la
          // receta no sea posible — mismo lenguaje visual que borrar hogar/cuenta.
          <Button
            variant="danger"
            size="secondary"
            full
            icon={<Icon name="trash" size={17} strokeWidth={2} />}
            onClick={() => setConfirmDelete(true)}
          >
            {t.deleteRecipeAction}
          </Button>
        )}
      </div>
    </div>

    {/* Fuera del contenedor animado/con scroll a propósito: un diálogo `position:fixed`
        anidado ahí podía quedar fuera de la vista al haber hecho scroll (mismo bug que
        la barra de Ideas). */}
    {recipe && confirmDelete && (
      <AlertDialog
        title={t.deleteRecipeConfirmTitle}
        body={t.deleteRecipeConfirmBody(loc(recipe.name))}
        confirmLabel={t.deleteRecipeConfirmAction}
        cancelLabel={t.cancel}
        onConfirm={() => {
          deleteRecipe(recipe.id);
          setConfirmDelete(false);
          stack.dismiss();
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    )}
    </>
  );
}
