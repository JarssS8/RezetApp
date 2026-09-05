import { useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';
import { isRunning } from '../screens/useCookSession';
import type { Profile } from './auth';
import type { CookSession } from '../types';

/**
 * M8b — sincroniza los temporizadores en marcha con `cook_timer` para que el
 * cron del servidor pueda avisar por push aunque la pestaña esté cerrada.
 * Los temporizadores en sí siguen siendo 100% locales (`useCookSession`);
 * esto solo espeja los que están corriendo, nunca los pausados.
 *
 * No hace nada en modo demo ni sin perfil real.
 */
export function useCookTimerSync(session: CookSession | null, demo: boolean, profile: Profile | null) {
  const activeRecipe = useRef<string | null>(null);

  useEffect(() => {
    if (demo || !profile || !session) return;
    const { recipeId, timers } = session;

    void (async () => {
      for (const [key, timer] of Object.entries(timers)) {
        const stepIndex = Number(key);
        if (isRunning(timer) && timer.endsAt != null) {
          await supabase.from('cook_timer').upsert(
            {
              household_id: profile.householdId,
              profile_id: profile.id,
              recipe_id: recipeId,
              step_index: stepIndex,
              ends_at: new Date(timer.endsAt).toISOString(),
              notified_at: null,
            },
            { onConflict: 'profile_id,recipe_id,step_index' },
          );
        } else {
          await supabase
            .from('cook_timer')
            .delete()
            .eq('profile_id', profile.id)
            .eq('recipe_id', recipeId)
            .eq('step_index', stepIndex);
        }
      }
    })();

    activeRecipe.current = recipeId;
  }, [demo, profile, session]);

  // Al terminar/abandonar el cocinado: limpia lo que quedara pendiente.
  useEffect(() => {
    if (session || demo || !profile || !activeRecipe.current) return;
    const recipeId = activeRecipe.current;
    activeRecipe.current = null;
    void supabase.from('cook_timer').delete().eq('profile_id', profile.id).eq('recipe_id', recipeId);
  }, [session, demo, profile]);
}
