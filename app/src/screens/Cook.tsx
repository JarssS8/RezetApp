import { useMemo } from 'react';
import { usePrefs } from '../store/prefs';
import { useData } from '../data/store';
import { clock } from '../domain/dates';
import { formatQuantity } from '../domain/units';
import { isCovered } from '../domain/coverage';
import { isPassiveStep, stepIngredientMap } from '../domain/recipeText';
import { Button } from '../ui/Button';
import { CheckRow } from '../ui/CheckRow';
import { Eyebrow, ListCard, StepNumber } from '../ui/Card';
import { Icon } from '../ui/Icon';
import { Pressable } from '../ui/Pressable';
import { AlertDialog } from '../ui/Sheet';
import { glass, height, maxW, radius, tabular, text as T } from '../ui/tokens';
import { isRunning, remainingOf, type CookController } from './useCookSession';
import type { CookSession } from '../types';

/**
 * Modo cocinar. Dos fases y modal de verdad: mientras está abierto no hay forma
 * de llegar a la navegación, y la única salida es completar la receta o
 * confirmar el abandono.
 */
export function Cook({
  session,
  cook,
  onFinish,
}: {
  session: CookSession;
  cook: CookController;
  onFinish: () => void;
}) {
  const { t, locale, units, loc } = usePrefs();
  const { recipeById, ingredientById, needOf, stockOf, coverageOf } = useData();
  const recipe = recipeById.get(session.recipeId);

  const stepMap = useMemo(
    () => (recipe ? stepIngredientMap(recipe, ingredientById, locale) : []),
    [recipe, ingredientById, locale],
  );

  if (!recipe) return null;

  const stepCount = recipe.steps.length;
  const mise = session.phase === 'mise';
  const step = recipe.steps[session.step];
  const timer = session.timers[session.step];
  const now = cook.now;

  const liveTimers = Object.entries(session.timers)
    .map(([key, value]) => ({ index: Number(key), timer: value }))
    .filter(({ timer: tm }) => isRunning(tm) || tm.remainingSeconds === 0)
    .sort((a, b) => a.index - b.index);

  const coverage = coverageOf(recipe, session.servings);
  const ticked = recipe.ingredients.filter((_, i) => session.checked[i]).length;
  const allOk = coverage.full;

  const passive = isPassiveStep(recipe, session.step);
  const canParallel = passive && timer != null && isRunning(timer) && remainingOf(timer, now) > 0;
  const meanwhile = canParallel
    ? recipe.steps.map((s, i) => ({ s, i })).filter(({ i }) => i > session.step).slice(0, 2)
    : [];
  const upcoming = recipe.steps.map((s, i) => ({ s, i })).filter(({ i }) => i > session.step);
  const stepIngs = stepMap[session.step] ?? [];

  const ingredientRow = (index: number) => {
    const ri = recipe.ingredients[index];
    if (!ri) return null;
    const ing = ingredientById.get(ri.ingredientId);
    const need = needOf(recipe, index, session.servings);
    return (
      <CheckRow
        key={index}
        checked={!!session.checked[index]}
        onToggle={() => cook.toggleChecked(index)}
        warn={ing?.sensitive}
        label={ing ? loc(ing.name) : '—'}
        trailing={
          <div
            style={{
              fontSize: 15,
              fontWeight: 600,
              ...(need === null ? {} : tabular),
              color: need === null ? 'var(--muted)' : session.checked[index] ? 'var(--muted)' : 'var(--text)',
            }}
          >
            {need === null ? t.toTaste : formatQuantity(need, ri.unit!, units, locale)}
          </div>
        }
      />
    );
  };

  return (
    <>
      <div
        data-screen-label="Cocinar"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 70,
          background: 'var(--bg)',
          display: 'flex',
          flexDirection: 'column',
          animation: 'fadein .26s both',
        }}
      >
        <div
          style={{
            padding: '12px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            borderBottom: '1px solid var(--line)',
          }}
        >
          {/* No cierra: abre la confirmación. */}
          <Pressable
            onClick={() => cook.patch({ askExit: true })}
            ariaLabel={t.exitTitle}
            scale={0.93}
            style={{
              width: 40,
              height: 40,
              flex: '0 0 40px',
              borderRadius: 12,
              display: 'grid',
              placeItems: 'center',
              background: 'var(--surface2)',
            }}
          >
            <Icon name="close" size={16} strokeWidth={2.4} />
          </Pressable>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 16,
                fontWeight: 650,
                letterSpacing: '-.018em',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {loc(recipe.name)}
            </div>
            <div style={{ marginTop: 2, fontSize: 12.5, color: 'var(--muted)', ...tabular }}>
              {mise
                ? `${t.mise} · ${recipe.ingredients.length}`
                : `${t.stepOf} ${session.step + 1}/${stepCount}`}
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              background: 'var(--surface2)',
              borderRadius: radius.stepper,
              padding: 3,
            }}
          >
            <Pressable
              onClick={() => cook.setServings(session.servings - 1)}
              ariaLabel={`${t.servings} −`}
              scale={0.9}
              style={{ width: 32, height: 32, borderRadius: 9, display: 'grid', placeItems: 'center', color: 'var(--muted)' }}
            >
              <Icon name="minus" size={13} strokeWidth={2.6} />
            </Pressable>
            <div style={{ minWidth: 28, textAlign: 'center', fontSize: 15, fontWeight: 650, ...tabular }}>
              {session.servings}
            </div>
            <Pressable
              onClick={() => cook.setServings(session.servings + 1)}
              ariaLabel={`${t.servings} +`}
              scale={0.9}
              style={{ width: 32, height: 32, borderRadius: 9, display: 'grid', placeItems: 'center', color: 'var(--muted)' }}
            >
              <Icon name="plus" size={13} strokeWidth={2.6} />
            </Pressable>
          </div>
        </div>

        <div
          style={{ height: 3, background: 'var(--line)' }}
          role="progressbar"
          aria-valuenow={mise ? 0 : Math.round(((session.step + 1) / stepCount) * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            style={{
              height: 3,
              background: 'var(--accent)',
              width: mise ? '0%' : `${Math.round(((session.step + 1) / stepCount) * 100)}%`,
              transition: 'width .45s cubic-bezier(.2,.7,.2,1)',
            }}
          />
        </div>

        {/* Franja de temporizadores: visible en todo momento mientras alguno corra. */}
        {liveTimers.length > 0 && (
          <div
            style={{
              padding: '10px 14px',
              borderBottom: '1px solid var(--line)',
              background: 'var(--bg2)',
              display: 'flex',
              gap: 8,
              overflowX: 'auto',
              scrollbarWidth: 'none',
              alignItems: 'center',
            }}
          >
            <div
              style={{
                flex: '0 0 auto',
                fontSize: 11.5,
                fontWeight: 650,
                letterSpacing: '.05em',
                textTransform: 'uppercase',
                color: 'var(--muted)',
              }}
            >
              {t.running}
            </div>
            {liveTimers.map(({ index, timer: tm }) => {
              const left = remainingOf(tm, now);
              const done = left === 0;
              return (
                <Pressable
                  key={index}
                  onClick={() => cook.goStep(index, stepCount)}
                  scale={0.95}
                  style={{
                    flex: '0 0 auto',
                    height: 36,
                    padding: '0 6px 0 12px',
                    borderRadius: radius.pill,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    border: `1px solid ${done ? 'var(--warn)' : 'var(--soft2)'}`,
                    background: done ? 'var(--warnsoft)' : 'var(--soft)',
                    color: done ? 'var(--warn-ink)' : 'var(--accent-ink)',
                  }}
                >
                  <span style={{ fontSize: 12.5, fontWeight: 650 }}>
                    {t.stepOf} {index + 1}
                  </span>
                  <span style={{ fontSize: 14.5, fontWeight: 700, ...tabular }}>{clock(left)}</span>
                  <span
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: radius.pill,
                      display: 'grid',
                      placeItems: 'center',
                      background: done ? 'var(--warn)' : 'var(--accent)',
                      color: 'var(--onaccent)',
                      fontSize: 13,
                      fontWeight: 700,
                    }}
                  >
                    {done ? '!' : index === session.step ? '•' : '→'}
                  </span>
                </Pressable>
              );
            })}
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto', padding: '26px 20px 140px' }}>
          <div style={{ maxWidth: maxW.cook, margin: '0 auto' }}>
            {mise ? (
              <div>
                <div style={T.onboardTitle}>{t.misePlace}</div>
                <div
                  style={{ marginTop: 10, fontSize: 16, lineHeight: 1.5, color: 'var(--muted)', textWrap: 'pretty' }}
                >
                  {t.miseBody}
                </div>

                <div
                  style={{
                    marginTop: 18,
                    padding: '14px 16px',
                    borderRadius: radius.button,
                    background: allOk ? 'var(--soft)' : 'var(--warnsoft)',
                    color: allOk ? 'var(--accent-ink)' : 'var(--warn-ink)',
                    fontSize: 14.5,
                    fontWeight: 600,
                    lineHeight: 1.5,
                    textWrap: 'pretty',
                  }}
                >
                  {allOk ? t.miseAllOk : t.miseShort}
                  {'  ·  '}
                  {t.miseChecked} {ticked}/{recipe.ingredients.length}
                </div>

                <ListCard style={{ marginTop: 20 }}>
                  {recipe.ingredients.map((ri, index) => {
                    const ing = ingredientById.get(ri.ingredientId);
                    if (ri.toTaste) {
                      return (
                        <CheckRow
                          key={index}
                          checked={!!session.checked[index]}
                          onToggle={() => cook.toggleChecked(index)}
                          warn={ing?.sensitive}
                          label={ing ? loc(ing.name) : '—'}
                          sublabelTone="muted"
                          trailing={<div style={{ fontSize: 15, fontWeight: 600, color: 'var(--muted)' }}>{t.toTaste}</div>}
                        />
                      );
                    }
                    const need = needOf(recipe, index, session.servings)!;
                    const have = stockOf(ri.ingredientId, ri.unit!);
                    const ok = isCovered(need, have);
                    return (
                      <CheckRow
                        key={index}
                        checked={!!session.checked[index]}
                        onToggle={() => cook.toggleChecked(index)}
                        warn={ing?.sensitive}
                        label={ing ? loc(ing.name) : '—'}
                        sublabel={
                          ok
                            ? `${t.have} ${formatQuantity(have, ri.unit!, units, locale)}`
                            : have > 0
                              ? `${formatQuantity(need - have, ri.unit!, units, locale)} ${t.short}`
                              : t.notInPantry
                        }
                        sublabelTone={ok ? 'muted' : 'warn'}
                        trailing={
                          <div style={{ fontSize: 15, fontWeight: 600, ...tabular }}>
                            {formatQuantity(need, ri.unit!, units, locale)}
                          </div>
                        }
                      />
                    );
                  })}
                </ListCard>

                <div style={{ marginTop: 22 }}>
                  <Eyebrow style={{ margin: '0 2px 10px' }}>{t.cookPlan}</Eyebrow>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {recipe.steps.map((s, index) => (
                      <div
                        key={index}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          padding: '12px 14px',
                          borderRadius: radius.input,
                          background: 'var(--surface2)',
                        }}
                      >
                        <StepNumber n={index + 1} size={22} />
                        <div
                          style={{
                            flex: 1,
                            minWidth: 0,
                            fontSize: 14.5,
                            lineHeight: 1.45,
                            letterSpacing: '-.01em',
                            textWrap: 'pretty',
                          }}
                        >
                          {loc(s.text)}
                        </div>
                        {s.timerMinutes != null && (
                          <div
                            style={{
                              flex: '0 0 auto',
                              fontSize: 12.5,
                              fontWeight: 650,
                              color: 'var(--accent-ink)',
                              ...tabular,
                            }}
                          >
                            {s.timerMinutes} min
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div>
                {passive && (
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 7,
                      marginBottom: 14,
                      height: 30,
                      padding: '0 12px',
                      borderRadius: radius.pill,
                      background: 'var(--soft)',
                      color: 'var(--accent-ink)',
                      fontSize: 12.5,
                      fontWeight: 650,
                      letterSpacing: '.02em',
                    }}
                  >
                    <Icon name="clock" size={13} strokeWidth={2.2} />
                    {t.unattended}
                  </div>
                )}

                <div style={T.cookStep}>{step ? loc(step.text) : ''}</div>

                {timer && (
                  <>
                    <div
                      style={{
                        marginTop: 22,
                        background: 'var(--surface)',
                        border: '1px solid var(--line)',
                        borderRadius: radius.card,
                        padding: 18,
                        boxShadow: 'var(--shadow-s)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 14,
                        flexWrap: 'wrap',
                      }}
                    >
                      <div
                        style={{
                          flex: '1 1 120px',
                          minWidth: 110,
                          ...T.timer,
                          ...tabular,
                          color: remainingOf(timer, now) === 0 ? 'var(--warn-ink)' : 'var(--text)',
                        }}
                      >
                        {clock(remainingOf(timer, now))}
                      </div>
                      <Button
                        onClick={() => cook.toggleTimer(session.step)}
                        style={{ height: 46, borderRadius: radius.input, fontSize: 15 }}
                      >
                        {isRunning(timer) ? t.pauseTimer : t.startTimer}
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => cook.resetTimer(session.step)}
                        style={{ height: 46, borderRadius: radius.input, fontSize: 15, padding: '0 16px' }}
                      >
                        {t.reset}
                      </Button>
                    </div>
                    <div
                      style={{
                        marginTop: 8,
                        fontSize: 12.5,
                        color: 'var(--muted)',
                        padding: '0 2px',
                        lineHeight: 1.45,
                        textWrap: 'pretty',
                      }}
                    >
                      {t.timerKeepsRunning}
                    </div>
                  </>
                )}

                {meanwhile.length > 0 && (
                  <div
                    style={{
                      marginTop: 24,
                      borderRadius: radius.card,
                      border: '1px solid var(--soft2)',
                      background: 'var(--soft)',
                      padding: 16,
                    }}
                  >
                    <Eyebrow tone="accent" style={{ marginBottom: 12 }}>
                      {t.meanwhile}
                    </Eyebrow>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {meanwhile.map(({ s, i }) => (
                        <div
                          key={i}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            padding: '12px 12px 12px 14px',
                            borderRadius: radius.input,
                            background: 'var(--surface)',
                          }}
                        >
                          <StepNumber n={i + 1} size={22} />
                          <div
                            style={{
                              flex: 1,
                              minWidth: 0,
                              fontSize: 14.5,
                              lineHeight: 1.45,
                              letterSpacing: '-.01em',
                              textWrap: 'pretty',
                            }}
                          >
                            {loc(s.text)}
                          </div>
                          {/* Salta al paso sin tocar el temporizador en marcha. */}
                          <Button
                            onClick={() => cook.goStep(i, stepCount)}
                            style={{
                              flex: '0 0 auto',
                              minWidth: 56,
                              height: height.touch,
                              borderRadius: radius.chip,
                              padding: '0 18px',
                              fontSize: 14.5,
                            }}
                          >
                            {t.goStep}
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ marginTop: 26 }}>
                  <Eyebrow style={{ margin: '0 2px 10px' }}>{t.forThisStep}</Eyebrow>
                  {stepIngs.length > 0 ? (
                    <ListCard>{stepIngs.map(ingredientRow)}</ListCard>
                  ) : (
                    <div
                      style={{
                        padding: 16,
                        borderRadius: radius.button,
                        border: '1px dashed var(--line)',
                        fontSize: 14.5,
                        color: 'var(--muted)',
                        lineHeight: 1.45,
                        textWrap: 'pretty',
                      }}
                    >
                      {t.noStepIngs}
                    </div>
                  )}
                </div>

                <div
                  style={{
                    marginTop: 22,
                    background: 'var(--surface)',
                    border: '1px solid var(--line)',
                    borderRadius: radius.list,
                    boxShadow: 'var(--shadow-s)',
                    overflow: 'hidden',
                  }}
                >
                  <Pressable
                    onClick={() => cook.patch({ showUpcoming: !session.showUpcoming })}
                    scale={1}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      padding: '15px 16px',
                      textAlign: 'left',
                    }}
                  >
                    <span style={{ fontSize: 15.5, fontWeight: 600, letterSpacing: '-.015em' }}>
                      {t.upcoming}
                      {upcoming.length ? ` · ${upcoming.length}` : ''}
                    </span>
                    <span style={{ fontSize: 13, color: 'var(--muted)' }}>
                      {session.showUpcoming ? '–' : '+'}
                    </span>
                  </Pressable>
                  {session.showUpcoming && (
                    <div
                      style={{
                        padding: '14px 16px 16px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                        borderTop: '1px solid var(--line)',
                      }}
                    >
                      {upcoming.length > 0 ? (
                        upcoming.map(({ s, i }) => (
                          <Pressable
                            key={i}
                            onClick={() => cook.goStep(i, stepCount)}
                            scale={0.985}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 12,
                              padding: '12px 14px',
                              borderRadius: radius.input,
                              background: 'var(--surface2)',
                              textAlign: 'left',
                            }}
                          >
                            <StepNumber n={i + 1} size={22} />
                            <div
                              style={{
                                flex: 1,
                                minWidth: 0,
                                fontSize: 14.5,
                                lineHeight: 1.45,
                                letterSpacing: '-.01em',
                                textWrap: 'pretty',
                              }}
                            >
                              {loc(s.text)}
                            </div>
                            {s.timerMinutes != null && (
                              <div
                                style={{
                                  flex: '0 0 auto',
                                  fontSize: 12.5,
                                  fontWeight: 650,
                                  color: 'var(--accent-ink)',
                                  ...tabular,
                                }}
                              >
                                {s.timerMinutes} min
                              </div>
                            )}
                          </Pressable>
                        ))
                      ) : (
                        <div style={{ fontSize: 14.5, color: 'var(--muted)', padding: '2px 2px 4px' }}>
                          {t.lastStepNote}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            padding: '14px 20px calc(16px + env(safe-area-inset-bottom))',
            ...glass,
            borderTop: '1px solid var(--line)',
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          <div style={{ width: '100%', maxWidth: maxW.cook, display: 'flex', gap: 10 }}>
            {!mise && (
              <Pressable
                onClick={() =>
                  session.step === 0 ? cook.patch({ phase: 'mise' }) : cook.goStep(session.step - 1, stepCount)
                }
                ariaLabel={t.back}
                scale={0.95}
                style={{
                  width: 56,
                  height: height.cta,
                  flex: '0 0 56px',
                  borderRadius: radius.button,
                  background: 'var(--surface2)',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <Icon name="chevronLeft" size={18} strokeWidth={2.2} />
              </Pressable>
            )}
            <Button
              size="cta"
              full
              onClick={() => {
                if (mise) cook.goStep(0, stepCount);
                else if (session.step === stepCount - 1) onFinish();
                else cook.goStep(session.step + 1, stepCount);
              }}
              style={{ boxShadow: 'var(--shadow-m)' }}
            >
              {mise ? t.startCooking : session.step === stepCount - 1 ? t.finishCook : t.next}
            </Button>
          </div>
        </div>
      </div>

      {session.askExit && (
        <AlertDialog
          title={t.exitTitle}
          body={liveTimers.some(({ timer: tm }) => isRunning(tm)) ? t.exitBodyTimers : t.exitBody}
          cancelLabel={t.keepCooking}
          confirmLabel={t.stopCooking}
          onCancel={() => cook.patch({ askExit: false })}
          onConfirm={cook.endCook}
        />
      )}
    </>
  );
}
