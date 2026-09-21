import { useMemo, type CSSProperties } from 'react';
import { usePrefs } from '../store/prefs';
import { useData } from '../data/storeContext';
import { dateKey, longDate, shortDay, todayKey, weekDays } from '../domain/dates';
import { dayBand, streakOf, weekAverage, type DayBand, type DayTotal } from '../domain/intake';
import { formatKcal } from '../domain/units';
import type { Dictionary } from '../i18n/es';
import { Eyebrow } from '../ui/Card';
import { PushHeader } from '../ui/Fields';
import { useStackDismiss } from '../motion/useStackDismiss';
import { maxW, radius, tabular, text as T } from '../ui/tokens';

/** Alto del área de las barras, en px. El objetivo (100%) llena ~2/3 de ese alto, dejando
 * sitio arriba para que un día por encima del objetivo también se distinga por altura. */
const BAR_AREA_HEIGHT = 108;
/** Tope de la proporción kcal/objetivo que se deja crecer en altura, para que un día muy
 * por encima no aplaste visualmente al resto de la semana. */
const BAR_HEIGHT_CAP = 1.6;

/** Oculto a la vista, presente para quien usa un lector de pantalla. */
const srOnly: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0,0,0,0)',
  whiteSpace: 'nowrap',
  border: 0,
};

function fillFor(band: DayBand): string {
  // Verde de acento dentro de la banda, aviso si te pasaste, verde apagado
  // (--soft2) si quedaste por debajo — nunca un color inventado fuera de
  // estos tres tokens.
  if (band === 'within') return 'var(--accent)';
  if (band === 'over') return 'var(--warn)';
  return 'var(--soft2)';
}

function legendFor(band: DayBand, t: Dictionary): string {
  if (band === 'within') return t.legendWithin;
  if (band === 'over') return t.legendOver;
  return t.legendUnder;
}

/**
 * "Tu semana": siete barras contra el objetivo propio, más la racha de días
 * seguidos dentro de él. Toda la aritmética (medias, racha, banda de cada
 * día) sale de `domain/intake.ts` — esta pantalla solo la coloca en pantalla,
 * exactamente igual que Hoy, Cocinar, la compra y la despensa ya hacen con
 * `scaleQuantity`/`isCovered`: una sola fuente de verdad, cuatro sitios que
 * tienen que coincidir con ella.
 */
export function Week({ onClose }: { onClose: () => void }) {
  const { t, locale } = usePrefs();
  const { weekTotalsFor, members, myMemberId, kcalTarget: householdKcalTarget } = useData();
  const stack = useStackDismiss(onClose);

  // Mismo objetivo "propio, si existe, si no el del hogar" que usa Hoy — ver
  // ese comentario en Today.tsx. Repetirlo distinto aquí rompería el acuerdo
  // entre las dos pantallas sobre qué cuenta como "tu objetivo".
  const target = members.find((m) => m.id === myMemberId)?.kcalTarget ?? householdKcalTarget;
  const today = todayKey();

  const weekDates = useMemo(() => weekDays(0), []);
  const dates = useMemo(() => weekDates.map(dateKey), [weekDates]);

  const days: DayTotal[] = useMemo(
    () => (myMemberId ? weekTotalsFor(myMemberId, dates) : dates.map((date) => ({ date, kcal: 0 }))),
    [myMemberId, dates, weekTotalsFor],
  );

  const average = weekAverage(days, today);
  const streak = streakOf(days, target, today);

  return (
    <div
      data-screen-label="Tu semana"
      onAnimationEnd={stack.onAnimationEnd}
      style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'var(--bg)', overflowY: 'auto', ...stack.style }}
    >
      <PushHeader onBack={stack.dismiss} title={t.yourWeek} backLabel={t.back} />

      <div style={{ maxWidth: maxW.detail, margin: '0 auto', padding: '18px 20px 140px' }}>
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            borderRadius: radius.hero,
            padding: 20,
            boxShadow: 'var(--shadow-s)',
          }}
        >
          {/* El gráfico en sí es decorativo para un lector de pantalla — ni la
             altura ni el color se pueden "oír". La lista oculta de abajo es la
             alternativa real: la misma cifra y la misma banda, en texto. */}
          <div aria-hidden="true" style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
            {days.map((day, i) => {
              const isToday = day.date === today;
              const band = dayBand(day.kcal, target);
              const pct = target > 0 ? day.kcal / target : 0;
              const barHeight = Math.max(4, Math.min(pct, BAR_HEIGHT_CAP) * BAR_AREA_HEIGHT);
              return (
                <div
                  key={day.date}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', ...tabular }}>
                    {formatKcal(day.kcal, locale)}
                  </div>
                  <div style={{ height: BAR_AREA_HEIGHT, width: '100%', display: 'flex', alignItems: 'flex-end' }}>
                    <div
                      style={{
                        width: '100%',
                        height: barHeight,
                        borderRadius: radius.chip,
                        background: fillFor(band),
                        boxSizing: 'border-box',
                        // El día en curso lleva borde discontinuo porque aún no
                        // ha terminado — la misma idea que hace que `streakOf`
                        // no lo cuente ni lo corte, solo que aquí se ve. Un
                        // color de borde neutro (--text) para que se note igual
                        // sobre las tres bandas, no solo sobre una de ellas.
                        border: isToday ? '2px dashed var(--text)' : 'none',
                      }}
                    />
                  </div>
                  <div
                    style={{
                      fontSize: 11.5,
                      fontWeight: isToday ? 700 : 550,
                      color: isToday ? 'var(--text)' : 'var(--muted)',
                    }}
                  >
                    {/* `weekDates[i]` siempre existe: `days` viene de `dates`, y
                     * `dates` es `weekDates` mapeado uno a uno — mismo orden,
                     * misma longitud, por construcción. */}
                    {shortDay(weekDates[i]!, locale)}
                  </div>
                </div>
              );
            })}
          </div>

          <ul style={srOnly}>
            {days.map((day, i) => {
              const band = dayBand(day.kcal, target);
              const isToday = day.date === today;
              return (
                <li key={day.date}>
                  {longDate(weekDates[i]!, locale)}: {formatKcal(day.kcal, locale)} {t.kcal}, {legendFor(band, t)}
                  {isToday ? ` (${t.today})` : ''}
                </li>
              );
            })}
          </ul>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              marginTop: 18,
              paddingTop: 16,
              borderTop: '1px solid var(--line)',
            }}
          >
            <div>
              <Eyebrow style={{ margin: '0 0 4px' }}>{t.weekAverage}</Eyebrow>
              <div style={{ ...tabular, fontSize: 17, fontWeight: 700 }}>
                {formatKcal(average, locale)} {t.kcal}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <Eyebrow style={{ margin: '0 0 4px' }}>{t.weekTarget}</Eyebrow>
              <div style={{ ...tabular, fontSize: 17, fontWeight: 700 }}>
                {formatKcal(target, locale)} {t.kcal}
              </div>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 20, background: 'var(--soft)', borderRadius: radius.hero, padding: 20 }}>
          <Eyebrow tone="accent" style={{ margin: '0 0 8px' }}>
            {t.streakWithin}
          </Eyebrow>
          <div style={{ ...T.bigNumber, fontSize: 34, color: 'var(--accent-ink)' }}>{t.streakDays(streak)}</div>
          <div style={{ marginTop: 8, fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.4 }}>
            {t.streakTodayNote}
          </div>
        </div>

        <div style={{ marginTop: 20, display: 'flex', flexWrap: 'wrap', gap: 14 }}>
          <LegendItem color="var(--accent)" label={t.legendWithin} />
          <LegendItem color="var(--warn)" label={t.legendOver} />
          <LegendItem color="var(--soft2)" label={t.legendUnder} />
        </div>
      </div>
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--muted)' }}>
      <span style={{ width: 10, height: 10, flex: '0 0 10px', borderRadius: radius.pill, background: color }} />
      {label}
    </div>
  );
}
