import { usePrefs } from '../store/prefs';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { Pressable } from '../ui/Pressable';
import { radius } from '../ui/tokens';

/**
 * Login: Google/Apple son la vía de alta (un passkey no se puede registrar
 * sin una cuenta ya confirmada — ver `data/auth.tsx`), passkey es un atajo
 * para quien ya registró una en este dispositivo, y demo entra sin cuenta.
 */
export function Login({
  onGoogle,
  onApple,
  onPasskey,
  onDemo,
  error,
}: {
  onGoogle: () => void;
  onApple: () => void;
  onPasskey: () => void;
  onDemo: () => void;
  error?: string | null;
}) {
  const { t } = usePrefs();

  return (
    <div
      data-screen-label="Login"
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        background: 'radial-gradient(120% 90% at 50% -10%, var(--soft) 0%, var(--bg) 62%)',
      }}
    >
      <div style={{ width: '100%', maxWidth: 400, animation: 'rise .5s cubic-bezier(.2,.7,.2,1) both' }}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 14,
            marginBottom: 34,
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 20,
              background: 'var(--accent)',
              color: 'var(--onaccent)',
              display: 'grid',
              placeItems: 'center',
              boxShadow: 'var(--shadow-m)',
            }}
          >
            <Icon name="bowl" size={30} strokeWidth={1.9} />
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-.028em', lineHeight: 1.05 }}>
              Rezet
            </div>
            <div
              style={{
                marginTop: 8,
                fontSize: 16,
                color: 'var(--muted)',
                letterSpacing: '-.005em',
                maxWidth: 280,
                textWrap: 'pretty',
              }}
            >
              {t.loginTag}
            </div>
          </div>
        </div>

        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            borderRadius: 24,
            padding: 22,
            boxShadow: 'var(--shadow-m)',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <Button onClick={onGoogle} full>
            {t.continueWithGoogle}
          </Button>
          <Button onClick={onApple} variant="secondary" size="secondary" full>
            {t.continueWithApple}
          </Button>

          <Pressable
            onClick={onPasskey}
            scale={0.97}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              height: 40,
              fontSize: 14,
              fontWeight: 550,
              color: 'var(--muted)',
            }}
          >
            <Icon name="key" size={15} />
            {t.passkey}
          </Pressable>

          <div style={{ height: 1, background: 'var(--line)', margin: '4px 0' }} />

          <Button onClick={onDemo} variant="secondary" size="secondary" full>
            {t.demo}
          </Button>

          {error && (
            <div
              style={{
                fontSize: 13.5,
                color: 'var(--warn-ink)',
                background: 'var(--warnsoft)',
                borderRadius: radius.chip,
                padding: '10px 12px',
                textAlign: 'center',
              }}
            >
              {error}
            </div>
          )}

          <div
            style={{
              fontSize: 13.5,
              color: 'var(--muted)',
              textAlign: 'center',
              lineHeight: 1.5,
            }}
          >
            {t.inviteOnly}
          </div>
        </div>
      </div>
    </div>
  );
}
