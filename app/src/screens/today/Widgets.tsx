/**
 * Los widgets de Hoy (diseño §7).
 *
 * Son componentes de presentación: reciben por props lo que pintan y no
 * leen `useData()` ni `usePrefs()` por su cuenta. Así el orden en que la
 * rejilla los coloca no cambia cuántas veces consultan nada, y cada uno se
 * puede mirar solo.
 */
import type { CSSProperties, ReactNode } from 'react';
import { usePrefs } from '../../store/prefs';
import { formatKcal } from '../../domain/units';
import type { IntakeExtraLine, MealLine } from '../../domain/intake';
import type { Suggestion } from '../../domain/suggestions';
import { Button, IconButton } from '../../ui/Button';
import { Card, Eyebrow, SectionHeader } from '../../ui/Card';
import { Pill } from '../../ui/Chip';
import { Icon } from '../../ui/Icon';
import { Pressable } from '../../ui/Pressable';
import { height, radius, tabular, text as T } from '../../ui/tokens';
import type { Locale, MemberId, PlanEntry, Recipe } from '../../types';

const RING_CIRCUMFERENCE = 263.9;

/** Media, entera, y media más raciones — las cuatro opciones del segmentado de reparto. */
const SHARE_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 0.5, label: '½' },
  { value: 1, label: '1' },
  { value: 1.5, label: '1½' },
  { value: 2, label: '2' },
];

/** El envoltorio común: `Eyebrow` del label (si lo hay) + contenido debajo. */
export function WidgetCard({
  label,
  children,
  style,
}: {
  label?: string;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div style={style}>
      {label && <Eyebrow style={{ margin: '0 4px 12px' }}>{label}</Eyebrow>}
      {children}
    </div>
  );
}

/** La baldosa de receta con nombre, minutos y kcal — usada por "Para ti" y "Puedes cocinarlo ya". */
export function RecipeTile({ recipe, onOpen }: { recipe: Recipe; onOpen: () => void }) {
  const { t, loc } = usePrefs();
  return (
    <Pressable
      onClick={onOpen}
      scale={0.98}
      style={{
        textAlign: 'left',
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        borderRadius: radius.list,
        padding: 14,
        boxShadow: 'var(--shadow-s)',
      }}
    >
      <div style={{ fontSize: 15.5, fontWeight: 600, letterSpacing: '-.015em', lineHeight: 1.25 }}>
        {loc(recipe.name)}
      </div>
      <div style={{ marginTop: 6, fontSize: 13, color: 'var(--muted)', ...tabular }}>
        {recipe.minutes} min · {recipe.kcalPerServing} {t.kcal}
      </div>
    </Pressable>
  );
}

export function KcalRingWidget({
  pct,
  animatedPct,
  done,
  kcalLine,
  kcalHint,
  kcalHintColor,
  locale,
}: {
  pct: number;
  animatedPct: number;
  done: number;
  kcalLine: string;
  kcalHint: string;
  kcalHintColor: string;
  locale: Locale;
}) {
  return (
    <Card style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
      <div style={{ position: 'relative', width: 92, height: 92, flex: '0 0 92px' }}>
        <svg
          width={92}
          height={92}
          viewBox="0 0 100 100"
          style={{ transform: 'rotate(-90deg)' }}
          role="progressbar"
          aria-valuenow={Math.round(pct * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <circle cx="50" cy="50" r="42" fill="none" stroke="var(--soft)" strokeWidth={9} />
          <circle
            cx="50"
            cy="50"
            r="42"
            fill="none"
            stroke="var(--accent)"
            strokeWidth={9}
            strokeLinecap="round"
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={RING_CIRCUMFERENCE * (1 - animatedPct)}
            style={{ transition: 'stroke-dashoffset .7s cubic-bezier(.2,.7,.2,1)' }}
          />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 650, letterSpacing: '-.02em', ...tabular }}>
            {Math.round(pct * 100)}%
          </div>
        </div>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ ...T.bigNumber, ...tabular }}>{formatKcal(done, locale)}</div>
        <div style={{ marginTop: 7, fontSize: 14.5, color: 'var(--muted)', letterSpacing: '-.005em' }}>
          {kcalLine}
        </div>
        <div style={{ marginTop: 10, fontSize: 13.5, color: kcalHintColor, fontWeight: 600 }}>
          {kcalHint}
        </div>
      </div>
    </Card>
  );
}

/**
 * Entrada a "Tu semana" (Tarea 13): una fila bajo el anillo, no una pestaña
 * propia — es un vistazo ocasional, no algo que se consulte cada día como
 * Hoy o Plan.
 */
export function WeekProgressWidget({ onOpenWeek, label }: { onOpenWeek: () => void; label: string }) {
  return (
    <Pressable
      onClick={onOpenWeek}
      scale={0.98}
      style={{
        marginTop: 14,
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        padding: '13px 16px',
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        borderRadius: radius.list,
        boxShadow: 'var(--shadow-s)',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 15, fontWeight: 600 }}>
        <Icon name="calendar" size={18} strokeWidth={1.8} />
        {label}
      </span>
      <Icon name="chevronRight" size={16} strokeWidth={2.2} />
    </Pressable>
  );
}

export function TodayMealsWidget({
  meals,
  entryById,
  recipeById,
  extraLines,
  turnsEnabled,
  myMemberId,
  removingExtraId,
  hasEntries,
  locale,
  onOpenRecipe,
  onCook,
  onSetShare,
  onRemoveExtra,
  onAddIntake,
  onGoPlan,
}: {
  meals: MealLine[];
  entryById: Map<string, PlanEntry>;
  recipeById: Map<string, Recipe>;
  extraLines: IntakeExtraLine[];
  turnsEnabled: boolean;
  myMemberId: MemberId | null;
  removingExtraId: string | null;
  hasEntries: boolean;
  locale: Locale;
  onOpenRecipe: (recipeId: string, servings: number) => void;
  onCook: (recipeId: string, servings: number, planEntryId: string | null) => void;
  onSetShare: (memberId: MemberId, planEntryId: string, servings: number) => Promise<void>;
  onRemoveExtra: (id: string) => Promise<void>;
  onAddIntake: () => void;
  onGoPlan: () => void;
}) {
  const { t } = usePrefs();
  return (
    <>
      <div style={{ marginTop: 26 }}>
        <SectionHeader label={t.yourDay} trailing={t.yourDayCount(meals.length)} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {meals.map((meal) => {
            const entry = entryById.get(meal.planEntryId);
            const recipe = recipeById.get(meal.recipeId);
            if (!entry || !recipe) return null;
            return (
              <MealCard
                key={meal.planEntryId}
                meal={meal}
                entry={entry}
                recipe={recipe}
                isMyTurn={turnsEnabled && myMemberId != null && entry.cookMemberId === myMemberId}
                onOpenRecipe={onOpenRecipe}
                onCook={onCook}
                onSetShare={(servings) =>
                  myMemberId && void onSetShare(myMemberId, meal.planEntryId, servings)
                }
              />
            );
          })}

          {/* Una fila por extra, con su nombre y sus kcal — no una tarjeta
           * genérica con el total: cada extra es una cosa distinta que la
           * persona registró, no un agregado sin nombre. */}
          {extraLines.map((extra) => (
            <div
              key={extra.id}
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--line)',
                borderRadius: radius.list,
                padding: '14px 14px 14px 16px',
                boxShadow: 'var(--shadow-s)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 14,
              }}
            >
              <div
                style={{
                  ...T.cardTitle,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {extra.label}
              </div>
              <div style={{ ...tabular, fontSize: 14.5, fontWeight: 650, whiteSpace: 'nowrap' }}>
                {formatKcal(extra.kcal, locale)} {t.kcal}
              </div>
              {/* Hallazgo de revisión: un extra registrado no se podía borrar
               * — si te equivocabas de cifra, el anillo mentía el resto del
               * día sin recurso, y encima contaminaba `frequentExtras`. */}
              <IconButton
                onClick={() => void onRemoveExtra(extra.id)}
                ariaLabel={t.removeExtraAction(extra.label)}
                disabled={removingExtraId === extra.id}
                size={height.touch}
                style={{ color: 'var(--muted)' }}
              >
                <Icon name="trash" size={16} strokeWidth={1.9} />
              </IconButton>
            </div>
          ))}
        </div>

        <Button
          full
          size="primary"
          onClick={onAddIntake}
          icon={<Icon name="plus" size={16} />}
          style={{ marginTop: 14, borderRadius: radius.button }}
        >
          {t.addWhatIAte}
        </Button>
      </div>

      {!hasEntries && (
        <Card dashed style={{ marginTop: 20, padding: '36px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 650, letterSpacing: '-.02em' }}>{t.emptyToday}</div>
          <div
            style={{
              marginTop: 8,
              fontSize: 14.5,
              color: 'var(--muted)',
              lineHeight: 1.5,
              maxWidth: 280,
              margin: '8px auto 0',
              textWrap: 'pretty',
            }}
          >
            {t.emptyTodayBody}
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 18 }}>
            <Button onClick={onGoPlan} size="header">
              {t.planWeek}
            </Button>
          </div>
        </Card>
      )}
    </>
  );
}

export function ForYouWidget({
  suggestions,
  onOpenRecipe,
  label,
  hint,
}: {
  suggestions: Suggestion[];
  onOpenRecipe: (recipeId: string, servings: number) => void;
  label: string;
  hint: string;
}) {
  if (suggestions.length === 0) return null;
  return (
    <div style={{ marginTop: 26 }}>
      <Eyebrow style={{ margin: '0 4px 4px' }}>{label}</Eyebrow>
      <div style={{ margin: '0 4px 12px', fontSize: 13, color: 'var(--muted)' }}>{hint}</div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: 12,
        }}
      >
        {suggestions.map(({ recipe: r }) => (
          <RecipeTile key={r.id} recipe={r} onOpen={() => onOpenRecipe(r.id, r.baseServings)} />
        ))}
      </div>
    </div>
  );
}

export function CookableNowWidget({
  recipes,
  onOpenRecipe,
  label,
}: {
  recipes: Recipe[];
  onOpenRecipe: (recipeId: string, servings: number) => void;
  label: string;
}) {
  if (recipes.length === 0) return null;
  return (
    <WidgetCard label={label} style={{ marginTop: 26 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: 12,
        }}
      >
        {recipes.map((r) => (
          <RecipeTile key={r.id} recipe={r} onOpen={() => onOpenRecipe(r.id, r.baseServings)} />
        ))}
      </div>
    </WidgetCard>
  );
}

/**
 * Una comida del plan de hoy. Solo cocinada muestra el reparto (segmentado
 * ½/1/1½/2 + "No lo comí"): mientras no se cocine, la ración de nadie está
 * decidida todavía, así que no hay nada que ajustar.
 */
function MealCard({
  meal,
  entry,
  recipe,
  isMyTurn,
  onOpenRecipe,
  onCook,
  onSetShare,
}: {
  meal: MealLine;
  entry: PlanEntry;
  recipe: Recipe;
  /** Turnos (§10): esta comida está sin cocinar y te toca a ti cocinarla. */
  isMyTurn: boolean;
  onOpenRecipe: (recipeId: string, servings: number) => void;
  onCook: (recipeId: string, servings: number, planEntryId: string | null) => void;
  onSetShare: (servings: number) => void;
}) {
  const { t, locale, loc } = usePrefs();
  const cooked = meal.cooked;
  // Lo que aportaría si se cocinara con la ración actual: todavía no cuenta,
  // de ahí el "+" y el tono apagado.
  const potentialKcal = recipe.kcalPerServing * meal.share;

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        borderRadius: radius.list,
        padding: '14px 14px 14px 16px',
        boxShadow: 'var(--shadow-s)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <Pressable
          onClick={() => onOpenRecipe(recipe.id, entry.servings)}
          scale={1}
          style={{ flex: 1, minWidth: 0, textAlign: 'left' }}
        >
          <div
            style={{
              ...T.cardTitle,
              color: cooked ? 'var(--text)' : 'var(--muted)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {loc(recipe.name)}
          </div>
          <div style={{ marginTop: 4, fontSize: 13.5, color: 'var(--muted)' }}>
            {t[meal.slot]} · {cooked ? t.cooked : t.mealNotCooked}
          </div>
        </Pressable>
        <div
          style={{
            ...tabular,
            fontSize: 14.5,
            fontWeight: 650,
            color: cooked ? 'var(--text)' : 'var(--muted)',
            whiteSpace: 'nowrap',
          }}
        >
          {cooked ? '' : '+'}
          {formatKcal(cooked ? meal.kcal : potentialKcal, locale)} {t.kcal}
        </div>
      </div>

      {/* Turnos (§10): chip informativo, no cambia nada del bucle plan→cocinar→despensa. */}
      {!cooked && isMyTurn && (
        <div style={{ marginTop: 10 }}>
          <Pill>{t.turnsYours}</Pill>
        </div>
      )}

      {/*
       * Una comida o está por cocinar —y aquí se ofrece cocinarla, el atajo
       * del bucle plan→cocinar→despensa— o ya se cocinó, y entonces se
       * ofrece ajustar cuánto se comió. Nunca las dos cosas a la vez.
       */}
      {!cooked && (
        <div style={{ marginTop: 12 }}>
          <Button
            size="header"
            onClick={() => onCook(recipe.id, entry.servings, entry.id)}
            icon={<Icon name="cook" size={15} />}
            style={{ height: 40, borderRadius: radius.chip, fontSize: 14.5, fontWeight: 600 }}
          >
            {t.cook}
          </Button>
        </div>
      )}

      {cooked && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          <div
            role="group"
            aria-label={loc(recipe.name)}
            style={{
              display: 'flex',
              height: height.stepper,
              background: 'var(--surface2)',
              borderRadius: radius.stepper,
              padding: 3,
              gap: 2,
            }}
          >
            {SHARE_OPTIONS.map((opt) => {
              const active = meal.share === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  onClick={() => onSetShare(opt.value)}
                  ariaPressed={active}
                  scale={0.95}
                  style={{
                    minWidth: 44,
                    padding: '0 6px',
                    borderRadius: radius.stepper - 3,
                    fontSize: 14,
                    fontWeight: 600,
                    background: active ? 'var(--soft)' : 'transparent',
                    color: active ? 'var(--accent-ink)' : 'var(--text)',
                  }}
                >
                  {opt.label}
                </Pressable>
              );
            })}
          </div>
          <Pressable
            onClick={() => onSetShare(0)}
            ariaPressed={meal.share === 0}
            scale={0.96}
            style={{
              height: height.stepper,
              padding: '0 14px',
              borderRadius: radius.stepper,
              fontSize: 14,
              fontWeight: 600,
              border: `1px solid ${meal.share === 0 ? 'var(--soft2)' : 'var(--line)'}`,
              background: meal.share === 0 ? 'var(--soft)' : 'var(--surface)',
              color: meal.share === 0 ? 'var(--accent-ink)' : 'var(--muted)',
            }}
          >
            {t.notEaten}
          </Pressable>
        </div>
      )}
    </div>
  );
}
