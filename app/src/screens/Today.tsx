import { useEffect, useMemo, useState } from 'react';
import { usePrefs } from '../store/prefs';
import { useData } from '../data/store';
import { columnsFor, spanFor, visibleWidgets, type WidgetItem } from '../domain/dashboard';
import { longDate, todayKey } from '../domain/dates';
import { entriesOfDay } from '../domain/shopping';
import { rankSuggestions } from '../domain/suggestions';
import { formatKcal } from '../domain/units';
import type { MealLine } from '../domain/intake';
import { useIsMedium } from '../hooks/useMediaQuery';
import { prefersReducedMotion } from '../motion/motion';
import type { FrequentExtra } from '../types';
import { IconButton } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { ScreenBody, ScreenHeader } from '../ui/Fields';
import { maxW } from '../ui/tokens';
import {
  CookableNowWidget,
  ExpiringSoonWidget,
  ForYouWidget,
  KcalRingWidget,
  QuickLogWidget,
  ShoppingSummaryWidget,
  TodayMealsWidget,
  WeekProgressWidget,
  WhoseTurnWidget,
} from './today/Widgets';

/** Hoy responde una pregunta: qué toca comer y qué hago con ello. */
export function Today({
  onOpenRecipe,
  onCook,
  onGoPlan,
  onOpenSettings,
  onAddIntake,
  onOpenWeek,
  onOpenPantry,
  onOpenShopping,
  onOpenDashboardEdit,
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
  /** Abre la pestaña Despensa, desde el widget "Caduca pronto". */
  onOpenPantry: () => void;
  /** Abre la hoja de Compra, desde el widget "Para la semana". */
  onOpenShopping: () => void;
  /** Abre el modo "Personalizar" (Tarea 7): reordenar, encender/apagar y cambiar tamaño. */
  onOpenDashboardEdit: () => void;
  /** Toast de error al borrar un extra (hallazgo de revisión: antes no se podía). */
  onToast: (message: string) => void;
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
    household,
    intakeOfDayFor,
    setShare,
    removeExtra,
    recipePrefsByRecipe,
    pantry,
    ingredientById,
    frequentExtras,
    addExtra,
    needsForWeek,
    dashboardLayout,
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

  // "Registro rápido" (widget nuevo): registra un extra ya conocido sin
  // abrir `IntakeAddSheet`. Con `await`/`catch` a propósito — un registro
  // que falla en silencio deja el anillo mintiendo el resto del día (mismo
  // hallazgo de revisión que `handleRemoveExtra` de arriba).
  const handleLogFrequent = async (extra: FrequentExtra) => {
    if (!myMemberId) return;
    try {
      await addExtra({ memberId: myMemberId, date: today, label: extra.label, kcal: extra.kcal, source: 'manual' });
    } catch {
      onToast(t.memberActionError);
    }
  };

  // El anillo compara contra el objetivo PROPIO cuando existe (control por
  // persona, Tarea de fundación de miembro), cayendo al del hogar si no hay
  // sesión de miembro (demo, o carga inicial antes de que lleguen los
  // miembros).
  const kcalTarget = members.find((m) => m.id === myMemberId)?.kcalTarget ?? householdKcalTarget;

  const entries = useMemo(() => entriesOfDay(today, plan), [today, plan]);
  const entryById = useMemo(() => new Map(entries.map((e) => [e.id, e])), [entries]);

  // "Caduca pronto" (widget nuevo): `PantryItem.expiresInDays` ya trae la
  // cuenta hecha, aquí solo se filtra a 7 días o menos y se ordena — nada
  // de fechas ni restas, eso vive en el tipo y en quien lo escribe.
  const expiringSoon = useMemo(
    () =>
      pantry
        .filter((p): p is typeof p & { expiresInDays: number } => p.expiresInDays !== null && p.expiresInDays <= 7)
        .sort((a, b) => a.expiresInDays - b.expiresInDays)
        .map((p) => {
          const ing = ingredientById.get(p.ingredientId);
          return { id: p.id, name: ing ? ing.name[locale] || ing.name.es : '', days: p.expiresInDays };
        }),
    [pantry, ingredientById, locale],
  );

  // "Para la semana" (widget nuevo): los mismos argumentos que usa hoy
  // `ShoppingSheet` para la semana actual — `needsForWeek` es un envoltorio
  // de `domain/shopping.ts::shoppingNeeds`, nada calculado aquí.
  const shoppingNeedsCount = needsForWeek(0).length;

  // "A quién le toca" (widget nuevo): quien cocina cada comida de hoy, ya
  // en `plan_entry.cook_member_id` — ni una fecha ni una comparación nueva.
  const whoseTurnRows = useMemo(
    () =>
      entries.map((entry) => {
        const recipe = recipeById.get(entry.recipeId);
        const member = entry.cookMemberId
          ? (members.find((m) => m.id === entry.cookMemberId && m.deletedAt === null) ?? null)
          : null;
        return { slot: entry.slot, recipeName: recipe ? loc(recipe.name) : '', member };
      }),
    [entries, recipeById, members, loc],
  );

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

  const columns = columnsFor(useIsMedium(), isWide);
  const visible = useMemo(() => visibleWidgets(dashboardLayout), [dashboardLayout]);

  // Un `switch` exhaustivo a propósito: el día que se añada un widget al
  // catálogo (`domain/dashboard.ts`) y se olvide de pintarlo aquí, esto
  // tiene que romper `tsc`, no dejar la rejilla a medias en silencio.
  const renderWidget = (item: WidgetItem) => {
    switch (item.id) {
      case 'kcal_ring':
        return (
          <KcalRingWidget
            pct={pct}
            animatedPct={animatedPct}
            done={done}
            kcalLine={kcalLine}
            kcalHint={kcalHint}
            kcalHintColor={kcalHintColor}
            locale={locale}
          />
        );
      case 'today_meals':
        return (
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
        );
      case 'week_progress':
        return <WeekProgressWidget onOpenWeek={onOpenWeek} label={t.yourWeek} />;
      case 'quick_log':
        return (
          <QuickLogWidget
            extras={myMemberId ? frequentExtras(myMemberId) : []}
            onLog={(extra) => void handleLogFrequent(extra)}
            label={t.widgetQuickLog}
            emptyLabel={t.widgetQuickLogEmpty}
          />
        );
      case 'whose_turn':
        return (
          <WhoseTurnWidget rows={whoseTurnRows} nobodyLabel={t.widgetWhoseTurnNobody} label={t.widgetWhoseTurn} />
        );
      case 'for_you':
        return (
          <ForYouWidget suggestions={suggestions} onOpenRecipe={onOpenRecipe} label={t.forYou} hint={t.forYouHint} />
        );
      case 'cookable_now':
        return <CookableNowWidget recipes={cookable} onOpenRecipe={onOpenRecipe} label={t.cookableNow} />;
      case 'expiring_soon':
        return (
          <ExpiringSoonWidget
            items={expiringSoon}
            onOpenPantry={onOpenPantry}
            label={t.widgetExpiring}
            emptyLabel={t.widgetExpiringEmpty}
            formatDays={t.widgetExpiringIn}
          />
        );
      case 'shopping_summary':
        return (
          <ShoppingSummaryWidget
            count={shoppingNeedsCount}
            onOpenShopping={onOpenShopping}
            label={t.widgetShopping}
            countLabel={t.widgetShoppingCount}
            emptyLabel={t.widgetShoppingEmpty}
          />
        );
      default: {
        // Exhaustividad real: un id nuevo en el catálogo que no se pinte
        // aquí rompe `tsc` (noUnusedLocals incluido), no la pantalla.
        const _never: never = item.id;
        return _never;
      }
    }
  };

  return (
    <ScreenBody maxWidth={maxW.today} label="Hoy">
      <ScreenHeader
        eyebrow={longDate(new Date(), locale)}
        title={t.today}
        trailing={
          <div style={{ display: 'flex', gap: 6 }}>
            {/*
             * El de ajustes solo se pinta en pantalla estrecha (en ancho
             * vive en la barra lateral); el de personalizar se pinta
             * SIEMPRE — en ancho, con la rejilla de varias columnas a la
             * vista, es donde más se nota el orden.
             */}
            <IconButton onClick={onOpenDashboardEdit} ariaLabel={t.widgetCustomize} style={{ color: 'var(--muted)' }}>
              <Icon name="edit" size={18} strokeWidth={1.8} />
            </IconButton>
            {!isWide && (
              <IconButton onClick={onOpenSettings} ariaLabel={t.settings} style={{ color: 'var(--muted)' }}>
                <Icon name="sun" size={19} strokeWidth={1.8} />
              </IconButton>
            )}
          </div>
        }
      />

      {/*
       * La rejilla se pinta desde el layout normalizado del miembro
       * (Tareas 1 y 3): nada que validar aquí, `dashboardLayout` nunca
       * viene vacío ni con ids/tamaños que este catálogo no reconozca.
       * Una columna por debajo de 600px, dos hasta 900, tres desde ahí —
       * `full` nunca pasa de dos (`spanFor`).
       */}
      <div
        style={{
          marginTop: 22,
          display: 'grid',
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          gap: 16,
          alignItems: 'start',
        }}
      >
        {visible.map((item) => (
          <div key={item.id} style={{ gridColumn: `span ${spanFor(item.w, columns)}`, minWidth: 0 }}>
            {renderWidget(item)}
          </div>
        ))}
      </div>
    </ScreenBody>
  );
}
