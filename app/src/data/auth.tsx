import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';

export interface Profile {
  id: string;
  householdId: string;
  displayName: string;
  onboardedAt: string | null;
}

/**
 * `loading` — comprobando si hay sesión.
 * `signedOut` — sin sesión: Login.
 * `needsHousehold` — sesión pero sin fila en `profile`: crear o unirse a un hogar.
 * `ready` — sesión + hogar: la app.
 */
export type AuthStatus = 'loading' | 'signedOut' | 'needsHousehold' | 'ready';

interface AuthContextValue {
  status: AuthStatus;
  session: Session | null;
  profile: Profile | null;
  error: string | null;
  signInWithGoogle: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  signInWithPasskey: () => Promise<void>;
  registerPasskey: () => Promise<'ok' | 'error'>;
  signOut: () => Promise<void>;
  createHousehold: (name: string, displayName: string) => Promise<void>;
  redeemInvite: (code: string, displayName: string) => Promise<void>;
  markOnboarded: () => Promise<void>;
  clearError: () => void;
}

const Ctx = createContext<AuthContextValue | null>(null);

async function loadProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profile')
    .select('id, household_id, display_name, onboarded_at')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id as string,
    householdId: data.household_id as string,
    displayName: data.display_name as string,
    onboardedAt: (data.onboarded_at as string | null) ?? null,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [error, setError] = useState<string | null>(null);

  const refreshProfile = useCallback(async (userId: string) => {
    try {
      const p = await loadProfile(userId);
      setProfile(p);
      setStatus(p ? 'ready' : 'needsHousehold');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus('needsHousehold');
    }
  }, []);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      if (data.session) void refreshProfile(data.session.user.id);
      else setStatus('signedOut');
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (next) void refreshProfile(next.user.id);
      else {
        setProfile(null);
        setStatus('signedOut');
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [refreshProfile]);

  const signInWithGoogle = useCallback(async () => {
    setError(null);
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (err) setError(err.message);
  }, []);

  const signInWithApple = useCallback(async () => {
    setError(null);
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: { redirectTo: window.location.origin },
    });
    if (err) setError(err.message);
  }, []);

  const signInWithPasskey = useCallback(async () => {
    setError(null);
    const { error: err } = await supabase.auth.signInWithPasskey();
    if (err) setError(err.message);
  }, []);

  /** Requiere sesión ya iniciada (por Google/Apple, normalmente). */
  const registerPasskey = useCallback(async (): Promise<'ok' | 'error'> => {
    const { error: err } = await supabase.auth.registerPasskey();
    return err ? 'error' : 'ok';
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const createHousehold = useCallback(
    async (name: string, displayName: string) => {
      setError(null);
      const { error: err } = await supabase.rpc('create_household', {
        p_name: name,
        p_display_name: displayName,
      });
      if (err) {
        setError(err.message);
        throw err;
      }
      if (session) await refreshProfile(session.user.id);
    },
    [session, refreshProfile],
  );

  const redeemInvite = useCallback(
    async (code: string, displayName: string) => {
      setError(null);
      const { error: err } = await supabase.rpc('redeem_invite', {
        p_code: code,
        p_display_name: displayName,
      });
      if (err) {
        setError(err.message);
        throw err;
      }
      if (session) await refreshProfile(session.user.id);
    },
    [session, refreshProfile],
  );

  const markOnboarded = useCallback(async () => {
    if (!session) return;
    const now = new Date().toISOString();
    await supabase.from('profile').update({ onboarded_at: now }).eq('id', session.user.id);
    setProfile((p) => (p ? { ...p, onboardedAt: now } : p));
  }, [session]);

  const clearError = useCallback(() => setError(null), []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      session,
      profile,
      error,
      signInWithGoogle,
      signInWithApple,
      signInWithPasskey,
      registerPasskey,
      signOut,
      createHousehold,
      redeemInvite,
      markOnboarded,
      clearError,
    }),
    [
      status,
      session,
      profile,
      error,
      signInWithGoogle,
      signInWithApple,
      signInWithPasskey,
      registerPasskey,
      signOut,
      createHousehold,
      redeemInvite,
      markOnboarded,
      clearError,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth fuera de AuthProvider');
  return ctx;
}
