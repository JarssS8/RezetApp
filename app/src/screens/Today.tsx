import { useEffect, useMemo, useState } from 'react';
import { usePrefs } from '../store/prefs';
import { useData } from '../data/store';
import { SLOT_ORDER, longDate, todayKey } from '../domain/dates';
import { entriesOfDay } from '../domain/shopping';
import { formatKcal } from '../domain/units';
import { prefersReducedMotion } from '../motion/motion';
import { Button, IconButton } from '../ui/Button';
import { Card, Eyebrow, SectionHeader } from '../ui/Card';
import { Pill } from '../ui/Chip';
import { Icon } from '../ui/Icon';
import { Pressable } from '../ui/Pressable';
import { ScreenBody, ScreenHeader } from '../ui/Fields';
import { maxW, radius, tabular, text as T } from '../ui/tokens';
import type { MealSlot, PlanEntry } from '../types';

const RING_CIRCUMFERENCE = 263.9;

/** Hoy responde una pregunta: qué toca comer y qué hago con ello. */
export function Today({
  onOpenRecipe,
  onCook,
  onGoPlan,
  onOpenSettings,
  isWide,
}: {
  onOpenRecipe: (recipeId: string, servings: number) => void;
  onCook: (recipeId: string, servings: number, planEntryId: string | null) => void;
  onGoPlan: () => void;
  onOpenSettings: () => void;
  isWide: boolean;
}) {
  const { t, locale, loc } = usePrefs();
  const { plan, recipes, recipeById, kcalTarget: householdKcalTarget, coverageOf, members, myMemberId } = useData();
  const today = todayKey();

  // El anillo compara contra el objetivo PROPIO cuando existe (control por
  // persona, Tarea de fundación de miembro), cayendo al del hogar si no hay
  // sesión de miembro (demo, o carga inicial antes de que lleguen los
  // miembros). El consumo que cuenta sigue siendo el de las comidas del
  // hogar entero — eso no cambia en esta versión, ver CHANGELOG 1.9.0.
  const kcalTarget = members.find((m) => m.id === myMemberId)?.kcalTarget ?? householdKcalTarget;

  const entries = useMemo(() => entriesOfDay(today, plan), [today, plan]);

  const { done, planned } = useMemo(() => {
    let d = 0;
    let p = 0;
    for (const e of entries) {
      const kcal = (recipeById.get(e.recipeId)?.kcalPerServing ?? 0) * e.servings;
      p += kcal;
      if (e.cooked) d += kcal;
    }
    return { done: d, planned: p };
  }, [entries, recipeById]);

  const pct = kcalTarget > 0 ? Math.min(1, done / kcalTarget) : 0;

  // Se inicia en 0 para que el anillo siempre haga el relleno al entrar en
  // la pantalla (Today se desmonta/monta entero al cambiar de pestaña, así
  // que un valor de partida ya correcto nunca tendría nada que animar).
  const [animatedPct, setAnimatedPct] = useState(() => (prefersReducedMotion() ? pct : 0));
  useEffect(() => {
    setAnimatedPct(pct);
  }, [pct]);

  const groups = useMemo(() => {
    return SLOT_ORDER.map((slot) => ({
      slot,
      items: entries.filter((e) => e.slot === slot),
    })).filter((g) => g.items.length > 0);
  }, [entries]);

  const cookable = useMemo(
    () => recipes.filter((r) => coverageOf(r, r.baseServings).full).slice(0, 3),
    [recipes, coverageOf],
  );

  const kcalLine = `${t.kcalOf} ${formatKcal(kcalTarget, locale)} ${t.kcal}${
    planned ? ` · ${t.planned} ${formatKcal(planned, locale)}` : ''
  }`;
  const kcalHint =
    done >= kcalTarget
      ? t.kcalDoneAll
      : `${t.kcalLeft} ${formatKcal(kcalTarget - done, locale)} ${t.kcal}`;

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
          <div style={{ marginTop: 10, fontSize: 13.5, color: 'var(--accent-ink)', fontWeight: 600 }}>
            {kcalHint}
          </div>
        </div>
      </Card>

      {groups.length > 0 ? (
        <div style={{ marginTop: 26, display: 'flex', flexDirection: 'column', gap: 22 }}>
          {groups.map((group) => (
            <MealGroup
              key={group.slot}
              slot={group.slot}
              items={group.items}
              onOpenRecipe={onOpenRecipe}
              onCook={onCook}
            />
          ))}
        </div>
      ) : (
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

function MealGroup({
  slot,
  items,
  onOpenRecipe,
  onCook,
}: {
  slot: MealSlot;
  items: PlanEntry[];
  onOpenRecipe: (recipeId: string, servings: number) => void;
  onCook: (recipeId: string, servings: number, planEntryId: string | null) => void;
}) {
  const { t, locale, loc } = usePrefs();
  const { recipeById } = useData();
  const kcal = items.reduce(
    (sum, e) => sum + (recipeById.get(e.recipeId)?.kcalPerServing ?? 0) * e.servings,
    0,
  );

  return (
    <div>
      <SectionHeader label={t[slot]} trailing={`${formatKcal(kcal, locale)} ${t.kcal}`} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map((entry) => {
          const recipe = recipeById.get(entry.recipeId);
          if (!recipe) return null;
          return (
            <div
              key={entry.id}
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--line)',
                borderRadius: radius.list,
                padding: '14px 14px 14px 16px',
                boxShadow: 'var(--shadow-s)',
                display: 'flex',
                alignItems: 'center',
                gap: 14,
              }}
            >
              <Pressable
                onClick={() => onOpenRecipe(recipe.id, entry.servings)}
                scale={1}
                style={{ flex: 1, minWidth: 0, textAlign: 'left' }}
              >
                <div
                  style={{
                    ...T.cardTitle,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {loc(recipe.name)}
                </div>
                <div style={{ marginTop: 4, fontSize: 13.5, color: 'var(--muted)', ...tabular }}>
                  {entry.servings}× · {formatKcal(recipe.kcalPerServing * entry.servings, locale)} {t.kcal}
                </div>
              </Pressable>

              {entry.cooked ? (
                <Pill>
                  <Icon name="check" size={13} strokeWidth={3} />
                  {t.cooked}
                </Pill>
              ) : (
                <Button
                  size="header"
                  onClick={() => onCook(recipe.id, entry.servings, entry.id)}
                  icon={<Icon name="cook" size={15} />}
                  style={{ height: 40, borderRadius: radius.chip, fontSize: 14.5, fontWeight: 600 }}
                >
                  {t.cook}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
