import { usePrefs } from '../store/prefs';
import { Button } from '../ui/Button';
import { Pressable } from '../ui/Pressable';
import { radius, text as T } from '../ui/tokens';

const BARS = [
  { height: 64, opacity: 0.35 },
  { height: 104, opacity: 0.6 },
  { height: 82, opacity: 1 },
  { height: 52, opacity: 0.45 },
];

/**
 * Guía de tres pasos, saltable y repetible desde Ajustes.
 * El hero es un diagrama abstracto, no una ilustración: no lo sustituyas por un
 * dibujo ni por una imagen generada.
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
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
              {BARS.map((bar, i) => (
                <div
                  key={i}
                  style={{
                    width: 34,
                    height: bar.height,
                    borderRadius: 9,
                    background: 'var(--accent)',
                    opacity: bar.opacity,
                  }}
                />
              ))}
            </div>
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
