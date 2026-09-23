import { useMemo } from 'react';
import { usePrefs } from '../store/prefs';
import { useData } from '../data/store';
import { SLOT_ORDER, dateKey, shortDay, todayKey, weekDays, weekRange } from '../domain/dates';
import { dayKcal } from '../domain/shopping';
import { useSlotDrag } from '../motion/useSlotDrag';
import { haptics } from '../motion/motion';
import { Button, IconButton } from '../ui/Button';
import { Eyebrow } from '../ui/Card';
import { Avatar } from '../ui/Avatar';
import { Icon } from '../ui/Icon';
import { Pressable } from '../ui/Pressable';
import { ScreenBody, ScreenHeader } from '../ui/Fields';
import { maxW, radius, tabular } from '../ui/tokens';
import type { MealSlot, MemberId, PlanEntry } from '../types';

export function Plan({
  weekOffset,
  onWeekOffset,
  onOpenShopping,
  onOpenTurns,
  onOpenRecipe,
  onPickForSlot,
  onNewRecipe,
  onToast,
}: {
  weekOffset: number;
  onWeekOffset: (next: number) => void;
  onOpenShopping: () => void;
  /** Abre la hoja de turnos (Tarea 8). Solo se ofrece cuando los turnos están encendidos. */
  onOpenTurns: () => void;
  onOpenRecipe: (recipeId: string, servings: number) => void;
  onPickForSlot: (date: string, slot: MealSlot) => void;
  onNewRecipe: () => void;
  onToast: (message: string) => void;
}) {
  const { t, locale, loc } = usePrefs();
  const { recipes, plan, recipeById, addPlanEntry, removePlanEntry, household, members, setCookMember } =
    useData();
  const today = todayKey();
  const days = useMemo(() => weekDays(weekOffset), [weekOffset]);
  const turnsEnabled = household?.turnsEnabled ?? false;

  // Turnos (§10): miembros vivos, en el mismo orden que el resto de la app
  // (`sortOrder`) — se recorren en ese orden al pulsar el avatar de "quién
  // cocina" para pasar al siguiente.
  const activeMembers = useMemo(
    () => [...members].filter((m) => m.deletedAt === null).sort((a, b) => a.sortOrder - b.sortOrder),
    [members],
  );

  /** `null` ("nadie") seguido de cada miembro vivo, en orden: el ciclo que sigue el avatar de cada comida. */
  const cookCycle = useMemo<(MemberId | null)[]>(() => [null, ...activeMembers.map((m) => m.id)], [activeMembers]);

  const cycleCookMember = (entry: PlanEntry) => {
    const idx = cookCycle.indexOf(entry.cookMemberId);
    const next = cookCycle[(idx + 1) % cookCycle.length] ?? null;
    void setCookMember(entry.id, next).catch(() => onToast(t.memberActionError));
  };

  const { drag, start } = useSlotDrag((recipeId, slotKey) => {
    const [date, slot] = slotKey.split('|') as [string, MealSlot];
    addPlanEntry(recipeId, date, slot);
    haptics.addToPlan();
    onToast(t.added);
  });

  return (
    <ScreenBody maxWidth={maxW.plan} label="Plan">
      <ScreenHeader
        title={t.plan}
        subtitle={weekRange(weekOffset, locale)}
        trailing={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <IconButton onClick={() => onWeekOffset(weekOffset - 1)} ariaLabel="Semana anterior">
              <Icon name="chevronLeft" size={17} strokeWidth={2.2} />
            </IconButton>
            <Button variant="secondary" size="header" onClick={() => onWeekOffset(0)} style={{ height: 40 }}>
              {t.thisWeek}
            </Button>
            <IconButton onClick={() => onWeekOffset(weekOffset + 1)} ariaLabel="Semana siguiente">
              <Icon name="chevronRight" size={17} strokeWidth={2.2} />
            </IconButton>
            <Button
              size="header"
              onClick={onOpenShopping}
              icon={<Icon name="bag" size={15} />}
              style={{ height: 40, fontSize: 14.5 }}
            >
              {t.shoppingList}
            </Button>
            {/* Turnos (§10): sin esto, ni el botón ni la hoja existen mientras el hogar los tenga apagados. */}
            {turnsEnabled && (
              <IconButton onClick={onOpenTurns} ariaLabel={t.turnsTitle}>
                <Icon name="account" size={17} strokeWidth={2} />
              </IconButton>
            )}
          </div>
        }
      />

      {/* Cajón de recetas arrastrables. */}
      {recipes.length > 0 ? (
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            borderRadius: radius.list,
            padding: '12px 14px',
            boxShadow: 'var(--shadow-s)',
            marginBottom: 16,
          }}
        >
          <Eyebrow style={{ fontSize: 12.5, marginBottom: 10 }}>{t.dragHint}</Eyebrow>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2, scrollbarWidth: 'none' }}>
            {recipes.slice(0, 8).map((r) => (
              <div
                key={r.id}
                onPointerDown={start(r.id)}
                style={{
                  flex: '0 0 auto',
                  height: 36,
                  padding: '0 14px',
                  borderRadius: radius.pill,
                  background: 'var(--soft)',
                  color: 'var(--accent-ink)',
                  fontSize: 14,
                  fontWeight: 600,
                  letterSpacing: '-.01em',
                  display: 'flex',
                  alignItems: 'center',
                  cursor: 'grab',
                  touchAction: 'none',
                  userSelect: 'none',
                }}
              >
                {loc(r.name)}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            borderRadius: radius.list,
            padding: '20px 16px',
            boxShadow: 'var(--shadow-s)',
            marginBottom: 18,
            textAlign: 'center',
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: radius.pill,
              background: 'var(--soft)',
              display: 'grid',
              placeItems: 'center',
              margin: '0 auto 12px',
              color: 'var(--accent-ink)',
            }}
          >
            <Icon name="book" size={22} strokeWidth={1.9} />
          </div>
          <div style={{ fontSize: 14.5, fontWeight: 650, letterSpacing: '-.015em' }}>{t.planDrawerEmpty}</div>
          <div
            style={{
              marginTop: 5,
              fontSize: 13,
              color: 'var(--muted)',
              lineHeight: 1.4,
              maxWidth: 260,
              margin: '5px auto 0',
            }}
          >
            {t.planDrawerEmptyBody}
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}>
            <Button
              size="header"
              onClick={onNewRecipe}
              icon={<Icon name="plus" size={14} strokeWidth={2.6} />}
              style={{ height: 36, fontSize: 14 }}
            >
              {t.newRecipe}
            </Button>
          </div>
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridAutoFlow: 'column',
          gridAutoColumns: 'minmax(168px, 1fr)',
          gap: 10,
          overflowX: 'auto',
          paddingBottom: 8,
        }}
      >
        {days.map((day) => {
          const key = dateKey(day);
          const kcal = dayKcal(key, plan, recipeById);
          return (
            <div key={key} style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, padding: '0 4px 2px' }}>
                <div style={{ fontSize: 15, fontWeight: 650, letterSpacing: '-.015em' }}>
                  {shortDay(day, locale)}
                </div>
                {key === today && (
                  <div
                    style={{
                      marginLeft: 'auto',
                      width: 7,
                      height: 7,
                      borderRadius: radius.pill,
                      background: 'var(--accent)',
                    }}
                  />
                )}
              </div>
              {/* Hallazgo de revisión: esta cifra es la del PLATO ENTERO
               * (kcalPerServing × raciones, para todo el hogar) — correcta
               * para planificar, pero antes de "Tu objetivo" no había otra
               * cifra de kcal con la que confundirla. Se etiqueta para que
               * no se lea como la ración propia que enseña Hoy. */}
              {kcal > 0 && (
                <div
                  style={{
                    fontSize: 11.5,
                    color: 'var(--muted)',
                    padding: '0 4px 10px',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    ...tabular,
                  }}
                  title={`${Math.round(kcal)} ${t.kcal} ${t.planDayKcalHousehold}`}
                >
                  {`${Math.round(kcal / 100) / 10}k ${t.kcal} · ${t.planDayKcalHousehold}`}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {SLOT_ORDER.map((slot) => {
                  const slotKey = `${key}|${slot}`;
                  const items = plan.filter((e) => e.date === key && e.slot === slot);
                  const hot = drag?.slot === slotKey;
                  return (
                    <div
                      key={slot}
                      data-slot={slotKey}
                      style={{
                        position: 'relative',
                        borderRadius: radius.slot,
                        border: '1px solid var(--line)',
                        background: 'var(--surface)',
                        minHeight: 66,
                        padding: 9,
                        boxShadow: 'var(--shadow-s)',
                      }}
                    >
                      {hot && (
                        <div
                          style={{
                            position: 'absolute',
                            inset: -2,
                            borderRadius: 17,
                            border: '2px solid var(--accent)',
                            background: 'var(--soft)',
                            opacity: 0.55,
                            pointerEvents: 'none',
                          }}
                        />
                      )}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          position: 'relative',
                        }}
                      >
                        <div
                          style={{
                            fontSize: 11.5,
                            fontWeight: 650,
                            letterSpacing: '.05em',
                            textTransform: 'uppercase',
                            color: 'var(--muted)',
                          }}
                        >
                          {t[slot]}
                        </div>
                        <Pressable
                          onClick={() => onPickForSlot(key, slot)}
                          ariaLabel={t.add}
                          scale={0.9}
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: 7,
                            display: 'grid',
                            placeItems: 'center',
                            color: 'var(--muted)',
                            background: 'var(--surface2)',
                          }}
                        >
                          <Icon name="plus" size={12} strokeWidth={2.6} />
                        </Pressable>
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 6,
                          marginTop: 7,
                          position: 'relative',
                        }}
                      >
                        {items.map((entry) => {
                          const recipe = recipeById.get(entry.recipeId);
                          const cookMember = activeMembers.find((m) => m.id === entry.cookMemberId);
                          return (
                            <div
                              key={entry.id}
                              style={{
                                background: 'var(--soft)',
                                borderRadius: 11,
                                padding: '8px 9px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 6,
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <Pressable
                                  onClick={() => onOpenRecipe(entry.recipeId, entry.servings)}
                                  scale={1}
                                  style={{ flex: 1, minWidth: 0, textAlign: 'left' }}
                                >
                                  <div
                                    style={{
                                      fontSize: 13.5,
                                      fontWeight: 600,
                                      letterSpacing: '-.012em',
                                      lineHeight: 1.25,
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                    }}
                                  >
                                    {recipe ? loc(recipe.name) : '—'}
                                  </div>
                                  <div style={{ marginTop: 3, fontSize: 11.5, color: 'var(--muted)', ...tabular }}>
                                    {entry.servings}× {entry.cooked ? `· ${t.cooked}` : ''}
                                  </div>
                                </Pressable>
                                <Pressable
                                  onClick={() => {
                                    removePlanEntry(entry.id);
                                    onToast(t.removed);
                                  }}
                                  ariaLabel={t.removed}
                                  scale={0.9}
                                  style={{
                                    width: 20,
                                    height: 20,
                                    borderRadius: 6,
                                    display: 'grid',
                                    placeItems: 'center',
                                    color: 'var(--muted)',
                                  }}
                                >
                                  <Icon name="close" size={11} strokeWidth={2.6} />
                                </Pressable>
                              </div>

                              {/*
                               * Turnos (§10): "quién cocina" esta comida.
                               * Un toque pasa al siguiente miembro del ciclo
                               * (ver `cycleCookMember` más arriba) — el
                               * avatar nunca va solo, siempre con el nombre
                               * (o "Nadie") en texto al lado.
                               */}
                              {turnsEnabled && (
                                <Pressable
                                  onClick={() => cycleCookMember(entry)}
                                  ariaLabel={`${t.turnsAssign}: ${cookMember?.displayName ?? t.turnsNobody}`}
                                  scale={0.97}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    height: 26,
                                    padding: '0 6px 0 0',
                                    borderRadius: radius.chip,
                                    alignSelf: 'flex-start',
                                  }}
                                >
                                  {cookMember ? (
                                    <Avatar member={cookMember} size={18} />
                                  ) : (
                                    <div
                                      aria-hidden
                                      style={{
                                        width: 18,
                                        height: 18,
                                        flex: '0 0 18px',
                                        borderRadius: '50%',
                                        border: '1px dashed var(--line)',
                                      }}
                                    />
                                  )}
                                  <span
                                    style={{
                                      fontSize: 11.5,
                                      fontWeight: 600,
                                      color: 'var(--muted)',
                                      whiteSpace: 'nowrap',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                    }}
                                  >
                                    {cookMember?.displayName ?? t.turnsNobody}
                                  </span>
                                </Pressable>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Fantasma de arrastre. `pointer-events: none` es obligatorio. */}
      {drag && (
        <div
          style={{
            position: 'fixed',
            left: 0,
            top: 0,
            zIndex: 95,
            pointerEvents: 'none',
            transform: `translate3d(${drag.x - 40}px, ${drag.y - 24}px, 0) scale(1.04)`,
          }}
        >
          <div
            style={{
              height: 38,
              padding: '0 15px',
              borderRadius: radius.pill,
              background: 'var(--accent)',
              color: 'var(--onaccent)',
              fontSize: 14.5,
              fontWeight: 650,
              display: 'flex',
              alignItems: 'center',
              boxShadow: 'var(--shadow-l)',
            }}
          >
            {loc(recipeById.get(drag.id)?.name ?? { es: '', en: '' })}
          </div>
        </div>
      )}
    </ScreenBody>
  );
}
