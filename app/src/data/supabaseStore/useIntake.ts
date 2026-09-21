import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabaseClient';
import { storeKeys } from './keys';
import { addDays, dateKey, mondayOf } from '../../domain/dates';
import { entriesOfDay } from '../../domain/shopping';
import { intakeOfDay, weekTotals, type DayIntake, type DayTotal, type IntakeExtraLine } from '../../domain/intake';
import { asMemberId, type ExtraInput, type FrequentExtra, type MemberBody, type MemberId, type PlanEntry, type Recipe } from '../../types';

interface ShareRow {
  memberId: MemberId;
  planEntryId: string;
  servings: number;
}

interface ExtraRow {
  id: string;
  memberId: MemberId;
  date: string;
  label: string;
  kcal: number;
  source: 'manual' | 'recipe' | 'barcode';
  recipeId: string | null;
}

function mapBody(row: {
  sex: string | null;
  birth_year: number | null;
  height_cm: number | string | null;
  weight_kg: number | string | null;
  activity: string;
  goal: string;
}): MemberBody {
  return {
    sex: row.sex as MemberBody['sex'],
    birthYear: row.birth_year,
    heightCm: row.height_cm === null ? null : Number(row.height_cm),
    weightKg: row.weight_kg === null ? null : Number(row.weight_kg),
    activity: row.activity as MemberBody['activity'],
    goal: row.goal as MemberBody['goal'],
  };
}

/**
 * Registro personal de consumo, capa real. Toda la aritmética (raciones,
 * extras, totales) sale de `domain/intake.ts`: este hook solo filtra lo ya
 * descargado y se lo pasa — cuatro pantallas distintas enseñan "cuánto
 * llevo" y tienen que coincidir en el número.
 */
export function useIntake(
  householdId: string,
  myMemberId: MemberId | null,
  recipeById: Map<string, Recipe>,
  plan: PlanEntry[],
) {
  const queryClient = useQueryClient();

  const bodyKey = useMemo(() => storeKeys.body(householdId), [householdId]);
  const sharesKey = useMemo(() => storeKeys.intakeShares(householdId), [householdId]);
  const extrasKey = useMemo(() => storeKeys.intakeExtras(householdId), [householdId]);

  // Sin `.eq('member_id', …)`: la RLS de `member_body` (`can_act_for`) ya
  // devuelve solo lo accesible — la fila propia y la de cualquier tutelado
  // que se administre, nunca la de otro adulto — así que basta con pedirlo
  // todo e indexar por miembro. Antes se filtraba aquí por `myMemberId`, lo
  // que dejaba siempre a ciegas la ficha de un tutelado (hallazgo T9).
  const bodyQ = useQuery({
    queryKey: bodyKey,
    queryFn: async (): Promise<Map<MemberId, MemberBody>> => {
      const { data, error } = await supabase
        .from('member_body')
        .select('member_id, sex, birth_year, height_cm, weight_kg, activity, goal');
      if (error) throw error;
      const byMember = new Map<MemberId, MemberBody>();
      for (const row of data ?? []) {
        byMember.set(asMemberId(row.member_id as string), mapBody(row));
      }
      return byMember;
    },
  });

  const bodyOf = useCallback(
    (memberId: MemberId): MemberBody | null => bodyQ.data?.get(memberId) ?? null,
    [bodyQ.data],
  );

  // Sin filtro de fecha: son las EXCEPCIONES a "una ración por persona", no
  // el historial de lo comido — pocas filas por hogar, no hace falta acotar.
  // Tampoco hay `household_id` en la tabla (ver la migración); la RLS ya
  // limita esto a lo propio o a quien tutelas.
  const sharesQ = useQuery({
    queryKey: sharesKey,
    queryFn: async (): Promise<ShareRow[]> => {
      const { data, error } = await supabase.from('intake_share').select('member_id, plan_entry_id, servings');
      if (error) throw error;
      return (data ?? []).map((r) => ({
        memberId: asMemberId(r.member_id as string),
        planEntryId: r.plan_entry_id as string,
        servings: Number(r.servings),
      }));
    },
  });

  // Semana actual ± 1, el mismo rango que ya navega la pantalla de Plan
  // (flechas semana anterior/siguiente): ni el histórico entero ni un
  // criterio inventado aparte.
  const extrasQ = useQuery({
    queryKey: extrasKey,
    queryFn: async (): Promise<ExtraRow[]> => {
      const start = dateKey(mondayOf(-1));
      const end = dateKey(addDays(mondayOf(1), 6));
      const { data, error } = await supabase
        .from('intake_extra')
        .select('id, member_id, date, label, kcal, source, recipe_id')
        .eq('household_id', householdId)
        .gte('date', start)
        .lte('date', end);
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: r.id as string,
        memberId: asMemberId(r.member_id as string),
        date: r.date as string,
        label: r.label as string,
        kcal: r.kcal as number,
        source: r.source as ExtraRow['source'],
        recipeId: r.recipe_id as string | null,
      }));
    },
  });

  const sharesByMember = useMemo(() => {
    const map = new Map<MemberId, Map<string, number>>();
    for (const row of sharesQ.data ?? []) {
      let byPlanEntry = map.get(row.memberId);
      if (!byPlanEntry) {
        byPlanEntry = new Map();
        map.set(row.memberId, byPlanEntry);
      }
      byPlanEntry.set(row.planEntryId, row.servings);
    }
    return map;
  }, [sharesQ.data]);

  const extrasByMemberDate = useMemo(() => {
    const map = new Map<MemberId, Map<string, IntakeExtraLine[]>>();
    for (const row of extrasQ.data ?? []) {
      let byDate = map.get(row.memberId);
      if (!byDate) {
        byDate = new Map();
        map.set(row.memberId, byDate);
      }
      const list = byDate.get(row.date) ?? [];
      list.push({ id: row.id, label: row.label, kcal: row.kcal });
      byDate.set(row.date, list);
    }
    return map;
  }, [extrasQ.data]);

  const intakeOfDayFor = useCallback(
    (memberId: MemberId, date: string): DayIntake => {
      const entries = entriesOfDay(date, plan);
      const shares = sharesByMember.get(memberId) ?? new Map<string, number>();
      const extras = extrasByMemberDate.get(memberId)?.get(date) ?? [];
      return intakeOfDay({ entries, recipeById, shares, extras });
    },
    [plan, recipeById, sharesByMember, extrasByMemberDate],
  );

  const weekTotalsFor = useCallback(
    (memberId: MemberId, dates: string[]): DayTotal[] => {
      const entriesByDate = new Map(dates.map((d) => [d, entriesOfDay(d, plan)] as const));
      const shares = sharesByMember.get(memberId) ?? new Map<string, number>();
      const byDate = extrasByMemberDate.get(memberId);
      const extrasByDate = new Map(dates.map((d) => [d, byDate?.get(d) ?? []] as const));
      return weekTotals({ dates, entriesByDate, recipeById, shares, extrasByDate });
    },
    [plan, recipeById, sharesByMember, extrasByMemberDate],
  );

  const frequentExtras = useCallback(
    (memberId: MemberId): FrequentExtra[] => {
      const counts = new Map<string, FrequentExtra>();
      for (const row of extrasQ.data ?? []) {
        if (row.memberId !== memberId || row.source !== 'manual') continue;
        const key = `${row.label}\u0000${row.kcal}`;
        const existing = counts.get(key);
        if (existing) existing.times += 1;
        else counts.set(key, { label: row.label, kcal: row.kcal, times: 1 });
      }
      return Array.from(counts.values())
        .sort((a, b) => b.times - a.times)
        .slice(0, 8);
    },
    [extrasQ.data],
  );

  const invalidateShares = useCallback(
    () => queryClient.invalidateQueries({ queryKey: sharesKey }),
    [queryClient, sharesKey],
  );
  const invalidateExtras = useCallback(
    () => queryClient.invalidateQueries({ queryKey: extrasKey }),
    [queryClient, extrasKey],
  );
  const invalidateBody = useCallback(
    () => queryClient.invalidateQueries({ queryKey: bodyKey }),
    [queryClient, bodyKey],
  );
  const invalidateMembers = useCallback(
    () => queryClient.invalidateQueries({ queryKey: storeKeys.members(householdId) }),
    [queryClient, householdId],
  );

  const setShareMut = useMutation({
    mutationFn: async ({
      memberId,
      planEntryId,
      servings,
    }: {
      memberId: MemberId;
      planEntryId: string;
      servings: number;
    }) => {
      const { error } = await supabase
        .from('intake_share')
        .upsert(
          { member_id: memberId, plan_entry_id: planEntryId, servings },
          { onConflict: 'member_id,plan_entry_id' },
        );
      if (error) throw error;
    },
    onSuccess: () => void invalidateShares(),
  });
  const setShare = useCallback(
    (memberId: MemberId, planEntryId: string, servings: number) =>
      setShareMut.mutateAsync({ memberId, planEntryId, servings }),
    [setShareMut],
  );

  const addExtraMut = useMutation({
    mutationFn: async (input: ExtraInput): Promise<string> => {
      // `created_by` es SIEMPRE quien está delante de la pantalla (el
      // "yo" de la sesión), nunca `input.memberId`: distingue "lo registré
      // yo" de "me lo registró mi padre" cuando se anota a un tutelado. El
      // servidor valida que los dos ids sean del mismo hogar.
      if (!myMemberId) throw new Error('Sin miembro propio: no se puede registrar el extra');
      const { data, error } = await supabase
        .from('intake_extra')
        .insert({
          household_id: householdId,
          member_id: input.memberId,
          date: input.date,
          label: input.label,
          kcal: input.kcal,
          source: input.source,
          recipe_id: input.recipeId ?? null,
          created_by: myMemberId,
        })
        .select('id')
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => void invalidateExtras(),
  });
  const addExtra = useCallback((input: ExtraInput) => addExtraMut.mutateAsync(input), [addExtraMut]);

  const removeExtraMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('intake_extra').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => void invalidateExtras(),
  });
  const removeExtra = useCallback((id: string) => removeExtraMut.mutateAsync(id), [removeExtraMut]);

  const setMyBodyMut = useMutation({
    mutationFn: async ({
      memberId,
      patch,
      kcalTarget,
    }: {
      memberId: MemberId;
      patch: Partial<MemberBody>;
      kcalTarget: number | null;
    }) => {
      // Solo las claves presentes: el servidor conserva las ausentes, y
      // mandar `undefined` como `null` borraría datos que nadie pidió
      // borrar (mismo criterio que `setMemberSettings` en `useMembers.ts`).
      const payload: Record<string, unknown> = {};
      if (patch.sex !== undefined) payload.sex = patch.sex;
      if (patch.birthYear !== undefined) payload.birth_year = patch.birthYear;
      if (patch.heightCm !== undefined) payload.height_cm = patch.heightCm;
      if (patch.weightKg !== undefined) payload.weight_kg = patch.weightKg;
      if (patch.activity !== undefined) payload.activity = patch.activity;
      if (patch.goal !== undefined) payload.goal = patch.goal;

      const { error } = await supabase.rpc('set_member_body', {
        p_member_id: memberId,
        p_patch: payload,
        p_kcal_target: kcalTarget,
      });
      if (error) throw error;
    },
    // El objetivo (`p_kcal_target`) vive en `member.kcal_target`, no en
    // `member_body`: sin invalidar también `members` la lista de miembros
    // (y con ella cualquier pantalla que lea `Member.kcalTarget`) se queda
    // con el valor viejo.
    onSuccess: () => {
      void invalidateBody();
      void invalidateMembers();
    },
  });
  const setMyBody = useCallback(
    (memberId: MemberId, patch: Partial<MemberBody>, kcalTarget: number | null) =>
      setMyBodyMut.mutateAsync({ memberId, patch, kcalTarget }),
    [setMyBodyMut],
  );

  return {
    bodyOf,
    bodyLoading: bodyQ.isLoading,
    setMyBody,
    intakeOfDayFor,
    setShare,
    addExtra,
    removeExtra,
    frequentExtras,
    weekTotalsFor,
  };
}
