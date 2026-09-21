import type { SupabaseClient } from '@supabase/supabase-js';

/** Built once at startup from `requireSession()`, passed to every tool's `register()`. */
export interface Ctx {
  supabase: SupabaseClient;
  householdId: string;
  /** auth.uid() of whoever is connected — used to resolve `member.auth_user_id` for personal-intake tools. */
  userId: string;
  locale: 'es' | 'en';
  /** Appended to the session-expired tool error, telling the user how to reauthenticate for this entrypoint. */
  reauthHint: string;
}

export class NoSessionError extends Error {}
