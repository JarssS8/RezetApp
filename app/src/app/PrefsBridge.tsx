import { useEffect, useRef } from 'react';
import { useAuth } from '../data/auth';
import { usePrefs } from '../store/prefs';
import { supabase } from '../data/supabaseClient';

/**
 * Trae los ajustes de la cuenta al arrancar la sesión, y los devuelve al
 * servidor cuando cambian. Existe porque `PrefsProvider` está por encima de
 * `AuthProvider` (main.tsx) y no puede leer la sesión por sí mismo.
 *
 * El servidor gana sobre el dispositivo: si entras en un móvil nuevo, te
 * encuentras tus ajustes, no los de fábrica.
 */
export function PrefsBridge() {
  const { profile } = useAuth();
  const { locale, theme, accent, units, hydrateFromServer } = usePrefs();
  const hydrated = useRef<string | null>(null);

  useEffect(() => {
    if (!profile || hydrated.current === profile.id) return;
    hydrated.current = profile.id;
    void (async () => {
      const { data } = await supabase
        .from('profile')
        .select('locale, theme, accent, units')
        .eq('id', profile.id)
        .maybeSingle();
      if (data) {
        hydrateFromServer({
          locale: data.locale as typeof locale,
          theme: data.theme as typeof theme,
          accent: data.accent as typeof accent,
          units: data.units as typeof units,
        });
      }
    })();
  }, [profile, hydrateFromServer, locale, theme, accent, units]);

  useEffect(() => {
    if (!profile || hydrated.current !== profile.id) return;
    // Reintento silencioso: que falle la escritura no debe romper la
    // interfaz, el dispositivo ya tiene el valor bueno en localStorage.
    void supabase.from('profile').update({ locale, theme, accent, units }).eq('id', profile.id);
  }, [profile, locale, theme, accent, units]);

  return null;
}
