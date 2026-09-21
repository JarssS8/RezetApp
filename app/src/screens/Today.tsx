import { useEffect, useMemo, useState } from 'react';
import { usePrefs } from '../store/prefs';
import { useData } from '../data/store';
import { longDate, todayKey } from '../domain/dates';
import { entriesOfDay } from '../domain/shopping';
import { formatKcal } from '../domain/units';
import type { MealLine } from '../domain/intake';
import { prefersReducedMotion } from '../motion/motion';
import { Button, IconButton } from '../ui/Button';
import { Card, Eyebrow, SectionHeader } from '../ui/Card';
import { Icon } from '../ui/Icon';
import { Pressable } from '../ui/Pressable';
import { ScreenBody, ScreenHeader } from '../ui/Fields';
import { height, maxW, radius, tabular, text as T } from '../ui/tokens';
import type { PlanEntry, Recipe } from '../types';

const RING_CIRCUMFERENCE = 263.9;

/** Media, entera, y media más raciones — las cuatro opciones del segmentado de reparto. */
const SHARE_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 0.5, label: '½' },
  { value: 1, label: '1' },
  { value: 1.5, label: '1½' },
  { value: 2, label: '2' },
];

/** Hoy responde una pregunta: qué toca comer y qué hago con ello. */
export function Today({
  onOpenRecipe,
  onGoPlan,
  onOpenSettings,
  onAddIntake,
  isWide,
}: {
  onOpenRecipe: (recipeId: string, servings: number) => void;
  onGoPlan: () => void;
  onOpenSettings: () => void;
  /**
   * Abre la hoja de "añadir algo que comí" (Tarea 11, todavía no existe).
   * El padre puede dejarlo sin conectar mientras tanto.
   */
  onAddIntake: () => void;
  isWide: boolean;
}) {
  const { t, locale, loc } = usePrefs();
  const {
    plan,
    recipes,
    recipeById,
    kcalTarget: householdKcalTarget,
    coverageOf,
    members,
    myMemberId,
    intakeOfDayFor,
    setShare,
  } = useData();
  const today = todayKey();

  // El anillo compara contra el objetivo PROPIO cuando existe (control por
  // persona, Tarea de fundación de miembro), cayendo al del hogar si no hay
  // sesión de miembro (demo, o carga inicial antes de que lleguen los
  // miembros).
  const kcalTarget = members.find((m) => m.id === myMemberId)?.kcalTarget ?? householdKcalTarget;

  const entries = useMemo(() => entriesOfDay(today, plan), [today, plan]);
  const entryById = useMemo(() => new Map(entries.map((e) => [e.id, e])), [entries]);

  // Lo que lleva comido HOY es lo que dice el registro de esta persona, no
  // una suma de raciones de plato — ver `domain/intake.ts`. Calcularlo aquí
  // sería una segunda fuente de verdad que acabaría divergiendo de las
  // otras pantallas que también leen `intakeOfDayFor`.
  const dayIntake = useMemo(
    () =>
      myMemberId
        ? intakeOfDayFor(myMemberId, today)
        : { done: 0, planned: 0, extras: 0, meals: [] as MealLine[] },
    [myMemberId, today, intakeOfDayFor],
  );
  const { done, planned, extras, meals } = dayIntake;

  const pct = kcalTarget > 0 ? Math.min(1, done / kcalTarget) : 0;

  // Se inicia en 0 para que el anillo siempre haga el relleno al entrar en
  // la pantalla (Today se desmonta/monta entero al cambiar de pestaña, así
  // que un valor de partida ya correcto nunca tendría nada que animar).
  const [animatedPct, setAnimatedPct] = useState(() => (prefersReducedMotion() ? pct : 0));
  useEffect(() => {
    setAnimatedPct(pct);
  }, [pct]);

  const cookable = useMemo(
    () => recipes.filter((r) => coverageOf(r, r.baseServings).full).slice(0, 3),
    [recipes, coverageOf],
  );

  const kcalLine = `${t.kcalOf} ${formatKcal(kcalTarget, locale)} ${t.kcal}${
    planned ? ` · ${t.planned} ${formatKcal(planned, locale)}` : ''
  }`;
  // Pasarse del objetivo es un aviso (--warn/--warn-ink), nunca --accent:
  // son tokens de papeles distintos y mezclarlos rompe el contraste.
  const over = done - kcalTarget;
  const kcalHint =
    over > 0
      ? `${t.overTarget} ${formatKcal(over, locale)} ${t.kcal}`
      : done === kcalTarget
        ? t.kcalDoneAll
        : `${t.kcalLeft} ${formatKcal(kcalTarget - done, locale)} ${t.kcal}`;
  const kcalHintColor = over > 0 ? 'var(--warn-ink)' : 'var(--accent-ink)';

  return (
    <ScreenBody maxWidth={maxW.today} label="Hoy">
      <ScreenHeader
        eyebrow={longDate(new Date(), locale)}
        title={t.today}
        trailing={
          !isWide && (
            <IconButton onClick={onOpenSettings} ariaLabel={t.settings} style={{ color: 'var(--muted)' }}>
              <Icon name="sun" size={19} strokeWidth={1.8} />
            </IconButton>
          )
        }
      />

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
                onOpenRecipe={onOpenRecipe}
                onSetShare={(servings) =>
                  myMemberId && void setShare(myMemberId, meal.planEntryId, servings)
                }
              />
            );
          })}

          {extras > 0 && (
            <div
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
              <div style={T.cardTitle}>{t.extraLabel}</div>
              <div style={{ ...tabular, fontSize: 14.5, fontWeight: 650 }}>
                {formatKcal(extras, locale)} {t.kcal}
              </div>
            </div>
          )}
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

      {entries.length === 0 && (
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

      {cookable.length > 0 && (
        <div style={{ marginTop: 26 }}>
          <Eyebrow style={{ margin: '0 4px 12px' }}>{t.cookableNow}</Eyebrow>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
              gap: 12,
            }}
          >
            {cookable.map((r) => (
              <Pressable
                key={r.id}
                onClick={() => onOpenRecipe(r.id, r.baseServings)}
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
                  {loc(r.name)}
                </div>
                <div style={{ marginTop: 6, fontSize: 13, color: 'var(--muted)', ...tabular }}>
                  {r.minutes} min · {r.kcalPerServing} {t.kcal}
                </div>
              </Pressable>
            ))}
          </div>
        </div>
      )}
    </ScreenBody>
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
  onOpenRecipe,
  onSetShare,
}: {
  meal: MealLine;
  entry: PlanEntry;
  recipe: Recipe;
  onOpenRecipe: (recipeId: string, servings: number) => void;
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
