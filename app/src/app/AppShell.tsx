import type { ReactNode } from 'react';
import { usePrefs } from '../store/prefs';
import { Icon, type IconName } from '../ui/Icon';
import { Pressable } from '../ui/Pressable';
import { glass, radius } from '../ui/tokens';

export type Tab = 'today' | 'recipes' | 'plan' | 'pantry';

/**
 * Cuatro pestañas. Ni una más.
 * "Cocinar" NO es una pestaña: es un modo que se lanza desde una comida o una
 * receta, que es donde de verdad se necesita.
 */
const TABS: Array<{ id: Tab; icon: IconName }> = [
  { id: 'today', icon: 'bowl' },
  { id: 'recipes', icon: 'book' },
  { id: 'plan', icon: 'calendar' },
  { id: 'pantry', icon: 'shelf' },
];

export function AppShell({
  tab,
  onTab,
  isWide,
  onOpenSettings,
  children,
}: {
  tab: Tab;
  onTab: (next: Tab) => void;
  isWide: boolean;
  onOpenSettings: () => void;
  children: ReactNode;
}) {
  const { t } = usePrefs();
  const labels: Record<Tab, string> = {
    today: t.today,
    recipes: t.recipes,
    plan: t.plan,
    pantry: t.pantry,
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: 'var(--bg)' }}>
      {isWide && (
        <nav
          style={{
            width: 232,
            flex: '0 0 232px',
            borderRight: '1px solid var(--line)',
            padding: '26px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            position: 'sticky',
            top: 0,
            height: '100vh',
            background: 'var(--bg2)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 10px 22px' }}>
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: 9,
                background: 'var(--accent)',
                color: 'var(--onaccent)',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <Icon name="bowl" size={16} />
            </div>
            <div style={{ fontSize: 18, fontWeight: 650, letterSpacing: '-.02em' }}>Rezet</div>
          </div>

          {TABS.map(({ id, icon }) => {
            const active = tab === id;
            return (
              <Pressable
                key={id}
                onClick={() => onTab(id)}
                scale={1}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  height: 44,
                  padding: '0 12px',
                  borderRadius: 12,
                  fontSize: 15.5,
                  fontWeight: 550,
                  letterSpacing: '-.012em',
                  background: active ? 'var(--soft)' : 'transparent',
                  color: active ? 'var(--accent-ink)' : 'var(--muted)',
                  transition: 'background .18s ease',
                }}
              >
                <Icon name={icon} size={20} strokeWidth={1.9} />
                {labels[id]}
              </Pressable>
            );
          })}

          <div style={{ flex: 1 }} />
          <Pressable
            onClick={onOpenSettings}
            scale={1}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              height: 44,
              padding: '0 12px',
              borderRadius: 12,
              fontSize: 15.5,
              fontWeight: 550,
              color: 'var(--muted)',
            }}
          >
            <Icon name="sun" size={19} strokeWidth={1.8} />
            {t.settings}
          </Pressable>
        </nav>
      )}

      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>{children}</main>

      {!isWide && (
        <nav
          style={{
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 40,
            ...glass,
            borderTop: '1px solid var(--line)',
            padding: '8px 10px calc(8px + env(safe-area-inset-bottom))',
            display: 'flex',
            justifyContent: 'space-around',
          }}
        >
          {TABS.map(({ id, icon }) => {
            const active = tab === id;
            return (
              <Pressable
                key={id}
                onClick={() => onTab(id)}
                scale={0.94}
                style={{
                  flex: 1,
                  minHeight: 52,
                  borderRadius: radius.input,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                  background: active ? 'var(--soft)' : 'transparent',
                  color: active ? 'var(--accent-ink)' : 'var(--muted)',
                  transition: 'background .18s ease',
                }}
              >
                <Icon name={icon} size={21} strokeWidth={1.9} />
                <span style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '-.005em' }}>
                  {labels[id]}
                </span>
              </Pressable>
            );
          })}
        </nav>
      )}
    </div>
  );
}
