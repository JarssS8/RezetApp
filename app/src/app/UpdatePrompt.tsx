import { createContext, useContext, type ReactNode } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { usePrefs } from '../store/prefs';
import { Button } from '../ui/Button';
import { radius } from '../ui/tokens';

const CHECK_EVERY_MS = 60 * 60 * 1000;

interface UpdateState {
  needRefresh: boolean;
  update: () => void;
}

const UpdateContext = createContext<UpdateState>({ needRefresh: false, update: () => {} });

/**
 * Registra el service worker en la raíz, para que funcione también antes de
 * iniciar sesión. Una app instalada puede pasar días abierta, así que además
 * de al arrancar se busca versión nueva al volver a primer plano y cada hora.
 */
export function UpdateProvider({ children }: { children: ReactNode }) {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      const check = () => {
        if (navigator.onLine) void registration.update();
      };
      window.setInterval(check, CHECK_EVERY_MS);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
    },
  });

  const update = () => {
    // workbox-window only reloads when the page was already controlled when it loaded; in a
    // first-visit session the worker takes control later, so reload once the new one takes over.
    navigator.serviceWorker?.addEventListener('controllerchange', () => window.location.reload(), { once: true });
    void updateServiceWorker(true);
  };

  return <UpdateContext.Provider value={{ needRefresh, update }}>{children}</UpdateContext.Provider>;
}

/** Aviso persistente de versión nueva. `hidden` lo aparca mientras se cocina. */
export function UpdatePrompt({ hidden }: { hidden: boolean }) {
  const { t } = usePrefs();
  const { needRefresh, update } = useContext(UpdateContext);
  if (!needRefresh || hidden) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 96,
        zIndex: 90,
        display: 'flex',
        justifyContent: 'center',
        padding: '0 20px',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          pointerEvents: 'auto',
          width: '100%',
          maxWidth: 420,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '8px 8px 8px 18px',
          borderRadius: radius.button,
          background: 'var(--glass)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          border: '1px solid var(--line)',
          boxShadow: 'var(--shadow-l)',
          animation: 'toastin .28s cubic-bezier(.2,.75,.2,1) both',
        }}
      >
        <div style={{ flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 600, letterSpacing: '-.01em' }}>
          {t.updateAvailable}
        </div>
        <Button size="header" onClick={update}>
          {t.updateNow}
        </Button>
      </div>
    </div>
  );
}
