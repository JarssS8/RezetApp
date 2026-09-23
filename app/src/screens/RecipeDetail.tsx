import { useState } from 'react';
import { usePrefs } from '../store/prefs';
import { useData } from '../data/store';
import { isCovered } from '../domain/coverage';
import { formatKcal, formatQuantity } from '../domain/units';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { Card, Eyebrow, ListCard, Row, StepNumber } from '../ui/Card';
import { Icon } from '../ui/Icon';
import { Pressable } from '../ui/Pressable';
import { PushHeader } from '../ui/Fields';
import { useStackDismiss } from '../motion/useStackDismiss';
import { Stepper } from '../ui/Stepper';
import { maxW, radius, tabular, text as T } from '../ui/tokens';
import type { RecipeRating } from '../types';

export function RecipeDetail({
  recipeId,
  initialServings,
  onClose,
  onCook,
  onAddToPlan,
  onEdit,
  onToast,
}: {
  recipeId: string;
  initialServings: number;
  onClose: () => void;
  onCook: (recipeId: string, servings: number) => void;
  onAddToPlan: (recipeId: string) => void;
  onEdit: (recipeId: string) => void;
  /** Aviso si el voto de "me gusta"/"no me gusta" falla al guardarse (capa real). */
  onToast: (message: string) => void;
}) {
  const { t, locale, units, loc } = usePrefs();
  const { recipeById, ingredientById, needOf, stockOf, coverageOf, members, myMemberId, recipePrefsByRecipe, setRecipePref } =
    useData();
  const recipe = recipeById.get(recipeId);
  const [servings, setServings] = useState(initialServings);
  // Un voto a la vez, para no disparar dos escrituras si se pulsa dos veces
  // mientras la primera sigue en vuelo (mismo patrón que `removingExtraId` en Today).
  const [ratingPending, setRatingPending] = useState(false);
  const stack = useStackDismiss(onClose);

  if (!recipe) return null;
  const cov = coverageOf(recipe, servings);
  const hasSensitive = recipe.ingredients.some(
    (ri) => ingredientById.get(ri.ingredientId)?.sensitive,
  );

  const prefs = recipePrefsByRecipe.get(recipe.id) ?? [];
  const myRating = prefs.find((p) => p.memberId === myMemberId)?.rating ?? null;
  const activeMembers = members.filter((m) => m.deletedAt === null);
  const memberById = new Map(activeMembers.map((m) => [m.id, m]));
  // Solo miembros que siguen en el hogar y han votado: un voto de alguien ya
  // salido no tiene a quién atribuírselo en la interfaz, y no debe sumar en
  // el agregado — si no, el numerador podía superar al denominador ("gusta
  // a 4 de 3"). El voto en sí no se borra, solo deja de contarse aquí.
  const voters = prefs.filter((p) => memberById.has(p.memberId));
  const likedCount = voters.filter((p) => p.rating === 1).length;

  const handleRate = async (rating: RecipeRating) => {
    if (ratingPending) return;
    setRatingPending(true);
    try {
      await setRecipePref(recipe.id, rating);
    } catch {
      onToast(t.memberActionError);
    } finally {
      setRatingPending(false);
    }
  };

  return (
    <div
      data-screen-label="Detalle de receta"
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
        onBack={stack.dismiss}
        title={loc(recipe.name)}
        backLabel={t.back}
        trailing={
          <Pressable
            onClick={() => onEdit(recipe.id)}
            ariaLabel={t.editRecipe}
            scale={0.9}
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              display: 'grid',
              placeItems: 'center',
              background: 'var(--surface2)',
              color: 'var(--text)',
            }}
          >
            <Icon name="edit" size={17} strokeWidth={2} />
          </Pressable>
        }
      />

      <div style={{ maxWidth: maxW.detail, margin: '0 auto', padding: '18px 20px 40px' }}>
        {recipe.photoUrl ? (
          <img
            src={recipe.photoUrl}
            alt=""
            style={{
              width: '100%',
              height: 170,
              borderRadius: radius.hero,
              objectFit: 'cover',
              marginBottom: 20,
            }}
          />
        ) : (
          // Marcador de foto. Se sustituye solo en cuanto la receta tiene una real.
          <div
            style={{
              height: 170,
              borderRadius: radius.hero,
              background: 'var(--soft)',
              display: 'grid',
              placeItems: 'center',
              marginBottom: 20,
            }}
          >
            <div
              style={{
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                fontSize: 12,
                color: 'var(--accent-ink)',
                letterSpacing: '.04em',
              }}
            >
              {t.photoSlot}
            </div>
          </div>
        )}

        <h1 style={{ margin: 0, ...T.detailTitle }}>{loc(recipe.name)}</h1>
        <div style={{ marginTop: 10, fontSize: 16, color: 'var(--muted)', lineHeight: 1.5, textWrap: 'pretty' }}>
          {loc(recipe.description)}
        </div>
        <div
          style={{
            marginTop: 14,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 10,
            fontSize: 13.5,
            color: 'var(--muted)',
            ...tabular,
          }}
        >
          <span>{recipe.minutes} min</span>
          <span>·</span>
          <span>{t[recipe.difficulty]}</span>
          <span>·</span>
          <span>
            {recipe.cookedCount} {t.cookedTimes}
          </span>
        </div>

        <Card style={{ marginTop: 22, borderRadius: radius.card, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-.015em' }}>{t.servings}</div>
            <Stepper
              value={servings}
              label={t.servings}
              onDecrement={() => setServings((s) => Math.max(1, s - 1))}
              onIncrement={() => setServings((s) => Math.min(24, s + 1))}
            />
          </div>
          <div style={{ marginTop: 14, display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <div style={{ ...T.bigNumber, ...tabular }}>{formatKcal(recipe.kcalPerServing, locale)}</div>
            <div style={{ fontSize: 14, color: 'var(--muted)' }}>
              {t.kcal} {t.perServing} · {formatKcal(recipe.kcalPerServing * servings, locale)} {t.kcal} total
            </div>
          </div>
        </Card>

        <div style={{ marginTop: 20 }}>
          <div
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 4px 10px' }}
          >
            <Eyebrow>{t.ingredients}</Eyebrow>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent-ink)' }}>
              {cov.have}/{cov.total} {t.have}
            </div>
          </div>
          <ListCard style={{ borderRadius: radius.card }}>
            {recipe.ingredients.map((ri, index) => {
              const ing = ingredientById.get(ri.ingredientId);
              if (ri.toTaste) {
                return (
                  <Row key={`${ri.ingredientId}-${index}`} warn={ing?.sensitive}>
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        flex: '0 0 8px',
                        borderRadius: radius.pill,
                        background: 'var(--line)',
                      }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={T.row}>{ing ? loc(ing.name) : '—'}</div>
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--muted)' }}>{t.toTaste}</div>
                  </Row>
                );
              }
              const need = needOf(recipe, index, servings)!;
              const have = stockOf(ri.ingredientId, ri.unit!);
              const ok = isCovered(need, have);
              const note = ok
                ? `${t.have} ${formatQuantity(have, ri.unit!, units, locale)}`
                : have > 0
                  ? `${formatQuantity(need - have, ri.unit!, units, locale)} ${t.short}`
                  : t.notInPantry;
              return (
                <Row key={`${ri.ingredientId}-${index}`} warn={ing?.sensitive}>
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
                    <div style={T.row}>{ing ? loc(ing.name) : '—'}</div>
                    <div style={{ marginTop: 3, fontSize: 12.5, color: 'var(--muted)' }}>{note}</div>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 600, ...tabular }}>
                    {formatQuantity(need, ri.unit!, units, locale)}
                  </div>
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
            {recipe.steps.map((step, index) => (
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
                    <div
                      style={{
                        marginTop: 6,
                        fontSize: 12.5,
                        color: 'var(--accent-ink)',
                        fontWeight: 600,
                        ...tabular,
                      }}
                    >
                      {step.timerMinutes} min
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/*
         * Gustos por persona (`member_recipe_pref`): pulsar el mismo botón
         * otra vez quita el voto (ver `setRecipePref`). `aria-pressed`
         * comunica cuál está activo a lectores de pantalla, igual que el
         * segmentado de raciones de `Today.tsx`.
         */}
        <div style={{ marginTop: 22, display: 'flex', gap: 10 }} role="group" aria-label={t.rateRecipeGroup}>
          <Pressable
            onClick={() => void handleRate(1)}
            ariaPressed={myRating === 1}
            disabled={ratingPending}
            scale={0.97}
            style={{
              flex: 1,
              height: 46,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              borderRadius: radius.button,
              fontSize: 15,
              fontWeight: 600,
              background: myRating === 1 ? 'var(--soft)' : 'var(--surface2)',
              color: myRating === 1 ? 'var(--accent-ink)' : 'var(--text)',
              opacity: ratingPending ? 0.7 : 1,
            }}
          >
            {t.likeAction}
          </Pressable>
          <Pressable
            onClick={() => void handleRate(-1)}
            ariaPressed={myRating === -1}
            disabled={ratingPending}
            scale={0.97}
            style={{
              flex: 1,
              height: 46,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              borderRadius: radius.button,
              fontSize: 15,
              fontWeight: 600,
              background: myRating === -1 ? 'var(--warnsoft)' : 'var(--surface2)',
              color: myRating === -1 ? 'var(--warn-ink)' : 'var(--text)',
              opacity: ratingPending ? 0.7 : 1,
            }}
          >
            {t.dislikeAction}
          </Pressable>
        </div>

        {/*
         * Agregado del hogar: quién votó qué es visible a propósito (ver
         * `RecipePref` en `types.ts`) — esconderlo sería peor en un grupo
         * pequeño. El avatar de `Avatar` es `aria-hidden`, así que siempre
         * va acompañado del nombre y el voto en texto.
         */}
        {voters.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)' }}>
              {t.likedByCount(likedCount, activeMembers.length)}
            </div>
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 9 }}>
              {voters.map((p) => {
                const member = memberById.get(p.memberId)!;
                return (
                  <div key={p.memberId} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Avatar member={member} size={26} />
                    <span style={{ fontSize: 14, fontWeight: 600, flex: 1, minWidth: 0 }}>
                      {member.displayName}
                    </span>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: p.rating === 1 ? 'var(--accent-ink)' : 'var(--warn-ink)',
                      }}
                    >
                      {p.rating === 1 ? t.likeAction : t.dislikeAction}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div style={{ marginTop: 26, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Button
            size="primary"
            onClick={() => onCook(recipe.id, servings)}
            icon={<Icon name="cook" size={17} />}
            style={{ flex: '1 1 180px', boxShadow: 'var(--shadow-m)', borderRadius: radius.button }}
          >
            {t.cookNow}
          </Button>
          <Button
            variant="secondary"
            size="primary"
            onClick={() => onAddToPlan(recipe.id)}
            style={{ flex: '1 1 140px', borderRadius: radius.button }}
          >
            {t.addToPlan}
          </Button>
        </div>
      </div>
    </div>
  );
}
