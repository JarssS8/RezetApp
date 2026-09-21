import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabaseClient';
import { storeKeys } from './keys';
import { asMemberId, type MemberId, type NotifyPref } from '../../types';

/** Fila de `member_notify_pref` con el id de a quién pertenece, tal como la
 * devuelve `notifyPrefQ` — un ARRAY, nunca un `Map` (mismo motivo que
 * `BodyRow` en `useIntake.ts`: un `Map` no tiene structural sharing en
 * TanStack Query y cada refetch produciría una identidad nueva). */
interface NotifyPrefRow extends NotifyPref {
  memberId: MemberId;
}

function mapNotifyPref(row: NotifyPrefRow): NotifyPref {
  const { memberId: _memberId, ...pref } = row;
  return pref;
}

/**
 * Preferencias de aviso (`member_notify_pref`), capa real. Sin RPC: a
 * diferencia de `member_body`/`member`, esta tabla concede
 * INSERT/UPDATE/DELETE a `authenticated` directamente bajo RLS
 * (`can_act_for`, migración `20260921100000_rezet_notify_pref.sql`), así que
 * un `upsert` con solo las columnas del patch basta.
 */
export function useNotifyPref(householdId: string, myMemberId: MemberId | null) {
  const queryClient = useQueryClient();
  const key = useMemo(() => storeKeys.notifyPref(householdId), [householdId]);

  // La `queryFn` devuelve un ARRAY, nunca un `Map` — ver el comentario largo
  // de `bodyQ` en `useIntake.ts` (y el test dedicado
  // `__tests__/bodyQueryIdentity.test.ts`) sobre por qué eso importa: sin
  // structural sharing, cada refetch en segundo plano (basta con
  // `refetchOnWindowFocus`) da una identidad nueva y dispara en falso
  // cualquier efecto que dependa de ella.
  const notifyPrefQ = useQuery({
    queryKey: key,
    queryFn: async (): Promise<NotifyPrefRow[]> => {
      const { data, error } = await supabase
        .from('member_notify_pref')
        .select('member_id, timers, expiring, cook_turn, log_reminder, log_reminder_at, quiet_from, quiet_to');
      if (error) throw error;
      return (data ?? []).map((row) => ({
        memberId: asMemberId(row.member_id as string),
        timers: row.timers as boolean,
        expiring: row.expiring as boolean,
        cookTurn: row.cook_turn as boolean,
        logReminder: row.log_reminder as boolean,
        logReminderAt: row.log_reminder_at as string,
        quietFrom: row.quiet_from as string | null,
        quietTo: row.quiet_to as string | null,
      }));
    },
    enabled: myMemberId !== null,
  });

  // Solo la fila propia: a diferencia de los datos corporales, un tutelado
  // sin cuenta no recibe avisos (no hay dónde enviárselos), así que el
  // contrato (`Store.notifyPref`) no necesita indexar por miembro — basta
  // con buscar la fila de `myMemberId` en el array ya descargado.
  const notifyPref = useMemo(() => {
    if (myMemberId === null) return null;
    const row = (notifyPrefQ.data ?? []).find((r) => r.memberId === myMemberId);
    return row ? mapNotifyPref(row) : null;
  }, [notifyPrefQ.data, myMemberId]);

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: key }),
    [queryClient, key],
  );

  const setNotifyPrefMut = useMutation({
    mutationFn: async ({ memberId, patch }: { memberId: MemberId; patch: Partial<NotifyPref> }) => {
      // Solo las claves presentes en el patch: `upsert` de PostgREST solo
      // toca en SQL las columnas incluidas en el objeto (tanto al insertar
      // como al actualizar), así que basta con omitir las ausentes — mandar
      // `undefined` como `null` borraría un ajuste que nadie pidió tocar.
      const payload: Record<string, unknown> = { member_id: memberId };
      if (patch.timers !== undefined) payload.timers = patch.timers;
      if (patch.expiring !== undefined) payload.expiring = patch.expiring;
      if (patch.cookTurn !== undefined) payload.cook_turn = patch.cookTurn;
      if (patch.logReminder !== undefined) payload.log_reminder = patch.logReminder;
      if (patch.logReminderAt !== undefined) payload.log_reminder_at = patch.logReminderAt;
      if (patch.quietFrom !== undefined) payload.quiet_from = patch.quietFrom;
      if (patch.quietTo !== undefined) payload.quiet_to = patch.quietTo;

      const { error } = await supabase.from('member_notify_pref').upsert(payload, { onConflict: 'member_id' });
      if (error) throw error;
    },
    onSuccess: () => void invalidate(),
  });
  const setNotifyPref = useCallback(
    (memberId: MemberId, patch: Partial<NotifyPref>) => setNotifyPrefMut.mutateAsync({ memberId, patch }),
    [setNotifyPrefMut],
  );

  return { notifyPref, setNotifyPref };
}
