import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import { unsubscribeFromPush } from './push';
import { consumePendingInvite } from './pendingInvite';
import { performSignOut, type SignOutScope } from './signOut';
import { asProfileId, type ProfileId } from '../types';

export interface Profile {
  id: ProfileId;
  householdId: string;
  displayName: string;
  onboardedAt: string | null;
  /** Admin del hogar propio: decide si `AccountHouseholdSheet` enseña la fila de invitar. */
  isAdmin: boolean;
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
  /** Cierra la sesión en todos los dispositivos y asistentes IA conectados. */
  signOutEverywhere: () => Promise<void>;
  createHousehold: (name: string, displayName: string) => Promise<void>;
  redeemInvite: (code: string, displayName: string) => Promise<void>;
  markOnboarded: () => Promise<void>;
  clearError: () => void;
  /**
   * Fuerza una relectura de la fila `profile` de la sesión actual. Hace
   * falta tras `leaveHousehold`/`deleteHousehold`: la sesión sigue siendo la
   * misma (no es un evento de `onAuthStateChange`), pero el `profile` ya no
   * existe, así que nada vuelve a comprobarlo por su cuenta — quien llama a
   * esas acciones debe disparar esto para que `status` pase a
   * `needsHousehold` y `App.tsx` enrute a `CreateOrJoinHousehold`.
   */
  refreshProfile: () => Promise<void>;
}

const Ctx = createContext<AuthContextValue | null>(null);

async function loadProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profile')
    .select('id, household_id, display_name, onboarded_at, is_admin')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    // `ProfileId` es la única defensa que queda contra cruzar este id con el
    // de `member` (`MemberId`): en SQL no se pudieron separar los dos
    // espacios de identificadores.
    id: asProfileId(data.id as string),
    householdId: data.household_id as string,
    displayName: data.display_name as string,
    onboardedAt: (data.onboarded_at as string | null) ?? null,
    isAdmin: data.is_admin as boolean,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [error, setError] = useState<string | null>(null);

  const refreshProfileFor = useCallback(async (userId: string) => {
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
      if (data.session) void refreshProfileFor(data.session.user.id);
      else setStatus('signedOut');
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (next) void refreshProfileFor(next.user.id);
      else {
        setProfile(null);
        setStatus('signedOut');
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [refreshProfileFor]);

  /** Versión pública, sin argumentos: relee el profile de la sesión actual. */
  const refreshProfile = useCallback(async () => {
    if (!session) return;
    await refreshProfileFor(session.user.id);
  }, [session, refreshProfileFor]);

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

  const signOutWithScope = useCallback(async (scope: SignOutScope) => {
    await performSignOut(
      {
        unsubscribePush: unsubscribeFromPush,
        // Los `cook_timer` NO se borran: son del perfil, no del dispositivo, y
        // borrarlos cortaría un temporizador que sigue corriendo en otro
        // dispositivo. Basta con dar de baja el push de este.
        clearDeviceState: () => {
          localStorage.removeItem('rezet.cook');
          localStorage.removeItem('rezet.tab');
          // rezet.pendingInvite es de un flujo de alta que ya no aplica.
          // rezet.prefs y rezet.seenScanTutorial se conservan: son del
          // dispositivo, no de la sesión.
          consumePendingInvite();
        },
        authSignOut: (s) => supabase.auth.signOut({ scope: s }),
      },
      scope,
    );
  }, []);

  /** Solo este dispositivo (el valor por defecto de auth-js es 'global'). */
  const signOut = useCallback(() => signOutWithScope('local'), [signOutWithScope]);
  /**
   * Todas las sesiones de la cuenta, incluida la que guarda cada concesión
   * del MCP remoto: es la forma de revocar un asistente IA o un dispositivo
   * prestado sin borrar la cuenta.
   */
  const signOutEverywhere = useCallback(() => signOutWithScope('global'), [signOutWithScope]);

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
      if (session) await refreshProfileFor(session.user.id);
    },
    [session, refreshProfileFor],
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
      if (session) await refreshProfileFor(session.user.id);
    },
    [session, refreshProfileFor],
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
      signOutEverywhere,
      createHousehold,
      redeemInvite,
      markOnboarded,
      clearError,
      refreshProfile,
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
      signOutEverywhere,
      createHousehold,
      redeemInvite,
      markOnboarded,
      clearError,
      refreshProfile,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth fuera de AuthProvider');
  return ctx;
}
