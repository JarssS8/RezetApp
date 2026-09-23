import { useEffect, useMemo, useState } from 'react';
import { usePrefs } from '../store/prefs';
import { useData } from '../data/store';
import { longDate, todayKey } from '../domain/dates';
import { entriesOfDay } from '../domain/shopping';
import { rankSuggestions } from '../domain/suggestions';
import { formatKcal } from '../domain/units';
import type { MealLine } from '../domain/intake';
import { prefersReducedMotion } from '../motion/motion';
import { IconButton } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { ScreenBody, ScreenHeader } from '../ui/Fields';
import { maxW } from '../ui/tokens';
import {
  CookableNowWidget,
  ForYouWidget,
  KcalRingWidget,
  TodayMealsWidget,
  WeekProgressWidget,
} from './today/Widgets';

/** Hoy responde una pregunta: qué toca comer y qué hago con ello. */
export function Today({
  onOpenRecipe,
  onCook,
  onGoPlan,
  onOpenSettings,
  onAddIntake,
  onOpenWeek,
  onToast,
  isWide,
}: {
  onOpenRecipe: (recipeId: string, servings: number) => void;
  onCook: (recipeId: string, servings: number, planEntryId: string | null) => void;
  onGoPlan: () => void;
  onOpenSettings: () => void;
  /** Abre `IntakeAddSheet`, la hoja de "añadir algo que comí" (Tarea 11). */
  onAddIntake: () => void;
  /** Abre "Tu semana" (Tarea 13): la fila bajo el anillo. */
  onOpenWeek: () => void;
  /** Toast de error al borrar un extra (hallazgo de revisión: antes no se podía). */
  onToast: (message: string) => void;
  isWide: boolean;
}) {
  const { t, locale } = usePrefs();
  const {
    plan,
    recipes,
    recipeById,
    kcalTarget: householdKcalTarget,
    coverageOf,
    members,
    myMemberId,
    household,
    intakeOfDayFor,
    setShare,
    removeExtra,
    recipePrefsByRecipe,
  } = useData();
  // Turnos (§10): mientras estén apagados, el chip "Te toca" no existe.
  const turnsEnabled = household?.turnsEnabled ?? false;
  const today = todayKey();

  // Un extra a la vez: evita un doble borrado si se toca dos veces mientras
  // la llamada sigue en vuelo, y sirve para deshabilitar solo SU botón.
  const [removingExtraId, setRemovingExtraId] = useState<string | null>(null);
  const handleRemoveExtra = async (id: string) => {
    if (removingExtraId) return;
    setRemovingExtraId(id);
    try {
      await removeExtra(id);
    } catch {
      onToast(t.memberActionError);
    } finally {
      setRemovingExtraId(null);
    }
  };

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
        : { done: 0, planned: 0, extras: 0, extraLines: [], meals: [] as MealLine[] },
    [myMemberId, today, intakeOfDayFor],
  );
  const { done, planned, extraLines, meals } = dayIntake;

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

  /**
   * "Para ti": las tres mejores según `domain/suggestions.ts` (gustos +
   * despensa + cuánto hace que no se cocina) — la puntuación vive entera en
   * ese módulo, aquí solo se junta lo que hace falta para calcularla.
   */
  const suggestions = useMemo(
    () =>
      rankSuggestions(
        recipes.map((r) => ({
          recipe: r,
          myRating: myMemberId
            ? (recipePrefsByRecipe.get(r.id)?.find((p) => p.memberId === myMemberId)?.rating ?? null)
            : null,
          pantryFull: coverageOf(r, r.baseServings).full,
        })),
        plan,
        3,
      ),
    [recipes, recipePrefsByRecipe, myMemberId, coverageOf, plan],
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

      <KcalRingWidget
        pct={pct}
        animatedPct={animatedPct}
        done={done}
        kcalLine={kcalLine}
        kcalHint={kcalHint}
        kcalHintColor={kcalHintColor}
        locale={locale}
      />

      <WeekProgressWidget onOpenWeek={onOpenWeek} label={t.yourWeek} />

      <TodayMealsWidget
        meals={meals}
        entryById={entryById}
        recipeById={recipeById}
        extraLines={extraLines}
        turnsEnabled={turnsEnabled}
        myMemberId={myMemberId}
        removingExtraId={removingExtraId}
        hasEntries={entries.length > 0}
        locale={locale}
        onOpenRecipe={onOpenRecipe}
        onCook={onCook}
        onSetShare={setShare}
        onRemoveExtra={handleRemoveExtra}
        onAddIntake={onAddIntake}
        onGoPlan={onGoPlan}
      />

      <ForYouWidget suggestions={suggestions} onOpenRecipe={onOpenRecipe} label={t.forYou} hint={t.forYouHint} />

      <CookableNowWidget recipes={cookable} onOpenRecipe={onOpenRecipe} label={t.cookableNow} />
    </ScreenBody>
  );
}
