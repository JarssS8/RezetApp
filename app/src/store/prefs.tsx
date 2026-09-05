import { createContext, useCallback, useContext, useEffect, useMemo } from 'react';
import { usePersistentState } from '../hooks/usePersistentState';
import { es } from '../i18n/es';
import { en } from '../i18n/en';
import type { Accent, Locale, Localized, Theme, UnitSystem } from '../types';
import type { Dictionary } from '../i18n/es';

/**
 * Los cuatro acentos están calibrados para que el blanco encima pase 4.5:1.
 * No los aclares: el texto de los botones dejaría de ser legible.
 */
export const ACCENTS: Record<Accent, string> = {
  green: 'oklch(0.54 0.105 156)',
  amber: 'oklch(0.555 0.125 72)',
  coral: 'oklch(0.555 0.135 32)',
  blue: 'oklch(0.545 0.105 245)',
};

interface Prefs {
  locale: Locale;
  theme: Theme;
  accent: Accent;
  units: UnitSystem;
}

const DEFAULTS: Prefs = { locale: 'es', theme: 'system', accent: 'green', units: 'metric' };

interface PrefsContext extends Prefs {
  t: Dictionary;
  setLocale: (v: Locale) => void;
  setTheme: (v: Theme) => void;
  setAccent: (v: Accent) => void;
  setUnits: (v: UnitSystem) => void;
  /** Resuelve un texto bilingüe al idioma activo. */
  loc: (value: Localized) => string;
}

const Ctx = createContext<PrefsContext | null>(null);

export function PrefsProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = usePersistentState<Prefs>('rezet.prefs', DEFAULTS);

  // Tema y acento se materializan en <html>, nunca en clases de body.
  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const dark =
        prefs.theme === 'dark' ||
        (prefs.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      root.dataset.theme = dark ? 'dark' : 'light';
    };
    apply();
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [prefs.theme]);

  useEffect(() => {
    document.documentElement.style.setProperty('--accent', ACCENTS[prefs.accent]);
  }, [prefs.accent]);

  useEffect(() => {
    document.documentElement.lang = prefs.locale;
  }, [prefs.locale]);

  const patch = useCallback(
    (next: Partial<Prefs>) => setPrefs((p) => ({ ...p, ...next })),
    [setPrefs],
  );

  const value = useMemo<PrefsContext>(() => {
    const t = prefs.locale === 'es' ? es : en;
    return {
      ...prefs,
      t,
      setLocale: (locale) => patch({ locale }),
      setTheme: (theme) => patch({ theme }),
      setAccent: (accent) => patch({ accent }),
      setUnits: (units) => patch({ units }),
      loc: (v) => v[prefs.locale] || v.es,
    };
  }, [prefs, patch]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePrefs(): PrefsContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('usePrefs fuera de PrefsProvider');
  return ctx;
}
