import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NoSessionError } from './context.js';
import { env } from './env.js';
import { fileStorage } from './sessionStorage.js';

export interface RezetSession {
  userId: string;
  email: string;
  householdId: string;
  displayName: string;
  locale: 'es' | 'en';
}

export { NoSessionError };

export function createRezetClient(opts: { autoRefresh: boolean }): SupabaseClient {
  return createClient(env.url, env.anonKey, {
    auth: {
      storage: fileStorage,
      persistSession: true,
      autoRefreshToken: opts.autoRefresh,
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
  });
}

async function loadProfile(
  supabase: SupabaseClient,
  userId: string
): Promise<{ householdId: string; displayName: string; locale: 'es' | 'en' } | null> {
  const { data, error } = await supabase
    .from('profile')
    .select('id, household_id, display_name, onboarded_at, locale')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    householdId: data.household_id as string,
    displayName: data.display_name as string,
    locale: (data.locale as 'es' | 'en') ?? 'es',
  };
}

const LOGIN_HINT = 'Run: npm run login  (in /home/jars/Programing/Rezet/mcp)';

export async function requireSession(supabase: SupabaseClient): Promise<RezetSession> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session) {
    throw new NoSessionError(`No Rezet session. ${LOGIN_HINT}`);
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    throw new NoSessionError(`No Rezet session (${userError?.message ?? 'no user'}). ${LOGIN_HINT}`);
  }

  const profile = await loadProfile(supabase, userData.user.id);
  if (!profile) {
    throw new NoSessionError(
      `Signed in as ${userData.user.email} but this account has no household. Create/join one in the app first.`
    );
  }

  return {
    userId: userData.user.id,
    email: userData.user.email ?? '',
    householdId: profile.householdId,
    displayName: profile.displayName,
    locale: profile.locale,
  };
}
