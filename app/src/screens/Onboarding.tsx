import { usePrefs } from '../store/prefs';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { Pressable } from '../ui/Pressable';
import { radius, text as T } from '../ui/tokens';

const WEEKDAYS_ES = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const PANTRY_BEFORE = [0.85, 0.55, 0.95, 0.4];
const PANTRY_AFTER = [0.85, 0.2, 0.95, 0.4];
const RING_CIRCUMFERENCE = 2 * Math.PI * 42;
const COOK_STEP_PCT = 0.6;

/** Rejilla semanal con una receta cayendo en el hueco del jueves: escena del paso "Plan". */
function PlanHero() {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', display: 'grid', placeItems: 'center' }}>
      <div style={{ display: 'flex', gap: 8 }}>
        {WEEKDAYS_ES.map((d, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <div style={{ fontSize: 10.5, fontWeight: 650, color: 'var(--muted)', opacity: 0.7 }}>{d}</div>
            <div
              style={{
                width: 26,
                height: 58,
                borderRadius: 8,
                background: i === 3 ? 'var(--accent)' : 'var(--surface)',
                border: i === 3 ? 'none' : '1px solid var(--line)',
              }}
            />
          </div>
        ))}
      </div>
      <div
        style={{
          position: 'absolute',
          top: 14,
          left: '50%',
          transform: 'translateX(calc(-50% + 3px))',
          width: 40,
          height: 30,
          borderRadius: 10,
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          boxShadow: 'var(--shadow-s)',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <Icon name="bowl" size={15} strokeWidth={1.8} />
      </div>
    </div>
  );
}

/** Dos despensas, antes y después de cocinar: la segunda barra baja. Escena del paso "Despensa". */
function PantryHero() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      {[PANTRY_BEFORE, PANTRY_AFTER].map((levels, group) => (
        <div key={group} style={{ display: 'flex', gap: 7, alignItems: 'flex-end', height: 84 }}>
          {levels.map((lvl, i) => (
            <div
              key={i}
              style={{
                width: 16,
                height: 84,
                borderRadius: 7,
                background: 'var(--soft)',
                border: '1px solid var(--line)',
                display: 'flex',
                alignItems: 'flex-end',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: '100%',
                  height: `${lvl * 100}%`,
                  background: 'var(--accent)',
                  opacity: group === 1 && i === 1 ? 0.55 : 1,
                  transition: 'height .3s ease',
                }}
              />
            </div>
          ))}
        </div>
      ))}
      <Icon name="chevronRight" size={16} strokeWidth={2} />
    </div>
  );
}

/** Anillo de progreso con el paso 3 de 5 y un ingrediente ya marcado: escena del paso "Cocinar". */
function CookHero() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
      <div style={{ position: 'relative', width: 76, height: 76, flex: '0 0 76px' }}>
        <svg width={76} height={76} viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}>
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
            strokeDashoffset={RING_CIRCUMFERENCE * (1 - COOK_STEP_PCT)}
          />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 650, letterSpacing: '-.02em' }}>3/5</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
        {[true, true, false].map((done, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <div
              style={{
                width: 18,
                height: 18,
                borderRadius: radius.check,
                display: 'grid',
                placeItems: 'center',
                background: done ? 'var(--accent)' : 'var(--surface)',
                border: done ? 'none' : '1px solid var(--line)',
                color: 'var(--onaccent)',
              }}
            >
              {done && <Icon name="check" size={11} strokeWidth={2.6} />}
            </div>
            <div style={{ width: 46, height: 8, borderRadius: 4, background: 'var(--soft)', opacity: done ? 0.5 : 1 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

const HEROES = [PlanHero, PantryHero, CookHero];

/**
 * Guía de tres pasos, saltable y repetible desde Ajustes.
 * Cada paso tiene su propio diagrama abstracto (rejilla semanal, despensa
 * antes/después, anillo de cocinar) que ilustra ese paso concreto del bucle
 * plan → despensa → cocinar. Diagramas, no ilustraciones: nada de dibujos ni
 * imágenes generadas.
 */
export function Onboarding({
  step,
  onNext,
  onSkip,
}: {
  step: number;
  onNext: () => void;
  onSkip: () => void;
}) {
  const { t } = usePrefs();
  const page = t.onboarding[step] ?? t.onboarding[0]!;
  const last = step >= t.onboarding.length - 1;
  const Hero = HEROES[step] ?? HEROES[0]!;

  return (
    <div
      data-screen-label="Primeros pasos"
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg)',
        animation: 'fadein .3s both',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '18px 20px' }}>
        <Pressable
          onClick={onSkip}
          scale={0.96}
          style={{ fontSize: 15, fontWeight: 550, color: 'var(--muted)', padding: '8px 12px', borderRadius: 10 }}
        >
          {t.skip}
        </Pressable>
      </div>

      <div style={{ flex: 1, display: 'grid', placeItems: 'center', padding: '8px 24px 0' }}>
        <div style={{ width: '100%', maxWidth: 420, textAlign: 'center' }}>
          <div
            style={{
              height: 210,
              borderRadius: radius.sheet,
              background: 'var(--soft)',
              border: '1px solid var(--line)',
              display: 'grid',
              placeItems: 'center',
              overflow: 'hidden',
              boxShadow: 'var(--shadow-s)',
            }}
          >
            <Hero />
          </div>
          <div style={{ marginTop: 30, ...T.onboardTitle }}>{page.title}</div>
          <div
            style={{
              marginTop: 12,
              fontSize: 16.5,
              lineHeight: 1.5,
              color: 'var(--muted)',
              textWrap: 'pretty',
            }}
          >
            {page.body}
          </div>
        </div>
      </div>

      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
        <div style={{ display: 'flex', gap: 7 }} aria-hidden="true">
          {t.onboarding.map((_, i) => (
            <div
              key={i}
              style={{
                width: 7,
                height: 7,
                borderRadius: radius.pill,
                background: 'var(--accent)',
                opacity: i === step ? 1 : 0.3,
                transition: 'opacity .25s ease',
              }}
            />
          ))}
        </div>
        <div style={{ width: '100%', maxWidth: 420 }}>
          <Button onClick={onNext} full>
            {last ? t.start : t.next}
          </Button>
        </div>
      </div>
    </div>
  );
}
