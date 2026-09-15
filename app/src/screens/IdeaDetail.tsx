import { useEffect, useState } from 'react';
import { usePrefs } from '../store/prefs';
import { useData } from '../data/storeContext';
import { supabase } from '../data/supabaseClient';
import { useIdeaDetail, type IdeaDetail as IdeaDetailData } from '../data/ideas';
import { scaleQuantity } from '../domain/scaling';
import { isCovered } from '../domain/coverage';
import { findIngredientByName } from '../domain/recipeText';
import { formatQuantity } from '../domain/units';
import { Button } from '../ui/Button';
import { Eyebrow, ListCard, Row, StepNumber } from '../ui/Card';
import { Icon } from '../ui/Icon';
import { PushHeader } from '../ui/Fields';
import { useStackDismiss } from '../motion/useStackDismiss';
import { Stepper } from '../ui/Stepper';
import { maxW, radius, tabular, text as T } from '../ui/tokens';
import type { RecipeDraft } from '../data/storeContext';

/** Construye el borrador que ya sabe guardar `useData().saveRecipe` — mismo camino que RecipeForm. */
function draftFromIdea(idea: IdeaDetailData, servings: number, loc: (v: { es: string; en: string }) => string): RecipeDraft {
  return {
    title: loc(idea.name),
    description: '',
    baseServings: servings,
    minutes: String(idea.minutes ?? 20),
    kcal: '450',
    difficulty: idea.difficulty,
    tags: [],
    sourceIdeaId: idea.id,
    ingredients: idea.ingredients.map((ri) => ({
      name: loc(ri.name),
      quantity: ri.toTaste || ri.quantity == null ? '' : String(ri.quantity),
      unit: ri.unit ?? 'g',
      toTaste: ri.toTaste,
    })),
    steps: idea.steps.map((s) => ({
      text: loc(s.text),
      timerMinutes: s.timerMinutes ? String(s.timerMinutes) : '',
    })),
  };
}

/**
 * Descarga la foto de la idea y la sube al `recipe-photos` del hogar (vía la
 * función de servidor `import-idea-photo` — el bucket de Cecotec no manda
 * CORS, así que un `fetch()` directo desde aquí fallaría). Best-effort a
 * propósito: si falla (sin sesión real, red, host no permitido…) la receta
 * se guarda igual, sin foto, como hasta ahora — nunca bloquea "Guardar".
 */
async function importIdeaPhoto(photoUrl: string): Promise<string | undefined> {
  try {
    const { data, error } = await supabase.functions.invoke<{ path?: string }>('import-idea-photo', {
      body: { url: photoUrl },
    });
    if (error || !data?.path) return undefined;
    return data.path;
  } catch {
    return undefined;
  }
}

export function IdeaDetail({
  ideaId,
  onClose,
  onSaved,
  onAddToPlan,
}: {
  ideaId: string;
  onClose: () => void;
  /** Se llama tras guardar, tanto si lo pide el usuario como si "Añadir al plan" guarda primero. */
  onSaved: (recipeId: string) => void;
  onAddToPlan: (recipeId: string) => void;
}) {
  const { t, locale, units, loc } = usePrefs();
  const { recipes, ingredients: ownIngredients, stockOf, saveRecipe } = useData();
  const { data: idea, isLoading, isError } = useIdeaDetail(ideaId);
  const [servings, setServings] = useState(2);
  const [saving, setSaving] = useState(false);
  // Tras guardar, la salida anima igual que un cierre normal; solo cambia
  // adónde se navega cuando termina (README §7: toda pantalla sale por el
  // mismo camino por el que entró, guardar no es una excepción).
  const [savedId, setSavedId] = useState<string | null>(null);
  const stack = useStackDismiss(() => (savedId ? onSaved(savedId) : onClose()));

  useEffect(() => {
    if (idea) setServings(idea.baseServings ?? 2);
  }, [idea]);

  const alreadySaved = idea ? recipes.find((r) => r.sourceIdeaId === idea.id) : undefined;
  const [photoBroken, setPhotoBroken] = useState(false);

  const save = async (): Promise<string> => {
    if (alreadySaved) return alreadySaved.id;
    if (!idea) throw new Error('idea not loaded');
    setSaving(true);
    try {
      const photoPath = idea.photoUrl ? await importIdeaPhoto(idea.photoUrl) : undefined;
      return await saveRecipe({ ...draftFromIdea(idea, servings, loc), photoPath });
    } finally {
      setSaving(false);
    }
  };

  if (isLoading || !idea) {
    return (
      <div data-screen-label="Detalle de idea" style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'var(--bg)' }}>
        <div style={{ padding: '40vh 0', textAlign: 'center', color: 'var(--muted)' }}>…</div>
      </div>
    );
  }
  if (isError) {
    return (
      <div data-screen-label="Detalle de idea" style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'var(--bg)' }}>
        <PushHeader onBack={onClose} backLabel={t.back} title="" />
        <div style={{ padding: '20vh 20px', textAlign: 'center', color: 'var(--muted)' }}>{t.ideasLoadError}</div>
      </div>
    );
  }

  const hasSensitive = idea.ingredients.some((ri) => ri.sensitive);
  const baseServings = idea.baseServings ?? 2;
  const applianceLabel = idea.appliances.includes('cecofry') ? 'Cecofry' : 'Olla GM';

  return (
    <>
    <div
      data-screen-label="Detalle de idea"
      onAnimationEnd={stack.onAnimationEnd}
      style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'var(--bg)', overflowY: 'auto', ...stack.style }}
    >
      <PushHeader onBack={stack.dismiss} title={loc(idea.name)} backLabel={t.back} />

      <div style={{ maxWidth: maxW.detail, margin: '0 auto', padding: '18px 20px 140px' }}>
        {photoBroken ? (
          <div
            style={{
              height: 170,
              borderRadius: radius.hero,
              background: 'var(--soft)',
              display: 'grid',
              placeItems: 'center',
              marginBottom: 20,
              color: 'var(--accent-ink)',
            }}
          >
            <Icon name="bowl" size={30} strokeWidth={1.6} />
          </div>
        ) : (
          <img
            src={idea.photoUrl}
            alt=""
            onError={() => setPhotoBroken(true)}
            style={{ width: '100%', height: 170, borderRadius: radius.hero, objectFit: 'cover', marginBottom: 20 }}
          />
        )}

        <h1 style={{ margin: 0, ...T.detailTitle }}>{loc(idea.name)}</h1>
        <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 13.5, color: 'var(--muted)', ...tabular }}>
          {idea.minutes != null && (
            <>
              <span>{idea.minutes} min</span>
              <span>·</span>
            </>
          )}
          <span>{t[idea.difficulty]}</span>
          <span>·</span>
          <span>{applianceLabel}</span>
        </div>
        <div style={{ marginTop: 8, fontSize: 13.5, color: 'var(--muted)' }}>
          {t.originalRecipeAt}{' '}
          <a href={idea.sourceUrl} target="_blank" rel="noreferrer">
            cecotec.es
          </a>
        </div>

        <div
          style={{
            marginTop: 22,
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            borderRadius: radius.card,
            padding: 16,
            boxShadow: 'var(--shadow-s)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-.015em' }}>{t.servings}</div>
            <Stepper
              value={servings}
              label={t.servings}
              onDecrement={() => setServings((s) => Math.max(1, s - 1))}
              onIncrement={() => setServings((s) => Math.min(24, s + 1))}
            />
          </div>
          <div style={{ marginTop: 12, fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.45 }}>
            {t.ideaNoKcal}
          </div>
        </div>

        <div style={{ marginTop: 20 }}>
          <Eyebrow style={{ margin: '0 4px 10px' }}>{t.ingredients}</Eyebrow>
          <ListCard style={{ borderRadius: radius.card }}>
            {idea.ingredients.map((ri, index) => {
              if (ri.toTaste) {
                return (
                  <Row key={`${ri.ingredientId}-${index}`} warn={ri.sensitive}>
                    <div style={{ width: 8, height: 8, flex: '0 0 8px', borderRadius: radius.pill, background: 'var(--line)' }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={T.row}>{loc(ri.name)}</div>
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--muted)' }}>{t.toTaste}</div>
                  </Row>
                );
              }
              const need = scaleQuantity(ri.quantity!, baseServings, servings, ri.sensitive);
              const matched = findIngredientByName(ownIngredients, loc(ri.name));
              const have = matched ? stockOf(matched.id, ri.unit!) : 0;
              const ok = isCovered(need, have);
              const note = ok
                ? `${t.have} ${formatQuantity(have, ri.unit!, units, locale)}`
                : have > 0
                  ? `${formatQuantity(need - have, ri.unit!, units, locale)} ${t.short}`
                  : t.notInPantry;
              return (
                <Row key={`${ri.ingredientId}-${index}`} warn={ri.sensitive}>
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      flex: '0 0 8px',
                      borderRadius: radius.pill,
                      background: ok ? 'var(--accent)' : 'var(--warn)',
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={T.row}>{loc(ri.name)}</div>
                    <div style={{ marginTop: 3, fontSize: 12.5, color: 'var(--muted)' }}>{note}</div>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 600, ...tabular }}>{formatQuantity(need, ri.unit!, units, locale)}</div>
                </Row>
              );
            })}
          </ListCard>
          {hasSensitive && (
            <div
              style={{
                marginTop: 10,
                padding: '12px 14px',
                borderRadius: radius.input,
                background: 'var(--warnsoft)',
                color: 'var(--warn-ink)',
                fontSize: 13,
                lineHeight: 1.5,
                textWrap: 'pretty',
              }}
            >
              {t.sensitiveNote}
            </div>
          )}
        </div>

        <div style={{ marginTop: 22 }}>
          <Eyebrow style={{ margin: '0 4px 10px' }}>{t.steps}</Eyebrow>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {idea.steps.map((step, index) => (
              <div
                key={index}
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--line)',
                  borderRadius: radius.button,
                  padding: 14,
                  display: 'flex',
                  gap: 13,
                  boxShadow: 'var(--shadow-s)',
                }}
              >
                <StepNumber n={index + 1} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15.5, lineHeight: 1.5, letterSpacing: '-.01em', textWrap: 'pretty' }}>
                    {loc(step.text)}
                  </div>
                  {step.timerMinutes != null && (
                    <div style={{ marginTop: 6, fontSize: 12.5, color: 'var(--accent-ink)', fontWeight: 600, ...tabular }}>
                      {step.timerMinutes} min
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>

    {/* Fuera del contenedor animado a propósito: un `position:fixed` anidado dentro de
        un ancestro que anima `transform` deja de estar fijo respecto al viewport
        mientras se hace scroll (bug real visto en móvil). "Guardar" es la acción
        principal de una idea y conviene tenerla siempre a mano mientras se lee. */}
    <div
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 61,
        background: 'var(--glass)',
        backdropFilter: 'blur(var(--glass-blur, 20px)) saturate(180%)',
        WebkitBackdropFilter: 'blur(var(--glass-blur, 20px)) saturate(180%)',
        borderTop: '1px solid var(--line)',
        padding: 'calc(14px + env(safe-area-inset-bottom)) 20px 14px',
        pointerEvents: stack.style.pointerEvents,
      }}
    >
      <div style={{ maxWidth: maxW.detail, margin: '0 auto', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Button
          size="primary"
          disabled={saving}
          onClick={async () => {
            const id = await save();
            setSavedId(id);
            stack.dismiss();
          }}
          icon={<Icon name={alreadySaved ? 'check' : 'bookmark'} size={17} />}
          style={{ flex: '1 1 180px', boxShadow: 'var(--shadow-m)', borderRadius: radius.button }}
        >
          {alreadySaved ? t.savedRecipe : t.save}
        </Button>
        <Button
          variant="secondary"
          size="primary"
          disabled={saving}
          onClick={async () => onAddToPlan(await save())}
          style={{ flex: '1 1 140px', borderRadius: radius.button }}
        >
          {t.addToPlan}
        </Button>
      </div>
    </div>
    </>
  );
}

