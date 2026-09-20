import { useEffect, useRef } from 'react';
import { useAuth } from '../data/auth';
import { usePrefs } from '../store/prefs';
import { supabase } from '../data/supabaseClient';
import type { Accent, Locale, Theme, UnitSystem } from '../types';

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
  /** Id del perfil cuya lectura YA ha terminado. No se marca al empezar. */
  const hydratedFor = useRef<string | null>(null);
  /** Lo último que sabemos que hay en el servidor, para no reescribirlo. */
  const lastSynced = useRef<string | null>(null);

  useEffect(() => {
    if (!profile || hydratedFor.current === profile.id) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from('profile')
        .select('locale, theme, accent, units')
        .eq('id', profile.id)
        .maybeSingle();
      if (cancelled) return;
      if (data) {
        const next = {
          locale: data.locale as Locale,
          theme: data.theme as Theme,
          accent: data.accent as Accent,
          units: data.units as UnitSystem,
        };
        lastSynced.current = JSON.stringify(next);
        hydrateFromServer(next);
      }
      // Se marca al TERMINAR, nunca al empezar: si se marcara antes, el
      // efecto de escritura pasaría su guarda mientras la lectura sigue en
      // vuelo y subiría los ajustes del dispositivo encima de los de la
      // cuenta, que es justo lo que este puente existe para evitar.
      hydratedFor.current = profile.id;
    })();
    return () => {
      cancelled = true;
    };
  }, [profile, hydrateFromServer]);

  useEffect(() => {
    if (!profile || hydratedFor.current !== profile.id) return;
    const payload = { locale, theme, accent, units };
    const serialized = JSON.stringify(payload);
    // Nada que subir si es exactamente lo que acabamos de leer: evita un
    // UPDATE redundante en cada inicio de sesión que traiga valores
    // distintos a los locales.
    if (lastSynced.current === serialized) return;
    lastSynced.current = serialized;
    // Escritura de mejor esfuerzo: si falla (sin red), el dispositivo
    // conserva el valor bueno en localStorage y no se reintenta hasta el
    // próximo cambio de preferencia.
    void supabase.from('profile').update(payload).eq('id', profile.id);
  }, [profile, locale, theme, accent, units]);

  return null;
}
