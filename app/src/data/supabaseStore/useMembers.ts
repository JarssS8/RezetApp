import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabaseClient';
import { storeKeys } from './keys';
import { asMemberId, asProfileId, type Accent, type Member, type MemberId } from '../../types';
import type { MemberSettingsPatch } from '../storeContext';

interface MemberRow {
  id: string;
  auth_user_id: string | null;
  is_ward: boolean;
  display_name: string;
  avatar_path: string | null;
  color: string;
  sort_order: number;
  kcal_target: number;
  deleted_at: string | null;
}

function mapMember(row: MemberRow): Member {
  return {
    id: asMemberId(row.id),
    authUserId: row.auth_user_id ? asProfileId(row.auth_user_id) : null,
    isWard: row.is_ward,
    displayName: row.display_name,
    avatarPath: row.avatar_path,
    color: row.color as Accent,
    sortOrder: row.sort_order,
    kcalTarget: row.kcal_target,
    deletedAt: row.deleted_at,
  };
}

/**
 * Los miembros del hogar. Se piden TAMBIÉN los borrados: la pantalla los
 * esconde, pero sin ellos no hay forma de poner nombre a lo que dejaron
 * hecho quienes ya no están.
 */
export function useMembers(householdId: string, authUserId: string | null) {
  const queryClient = useQueryClient();
  const key = useMemo(() => storeKeys.members(householdId), [householdId]);

  const membersQ = useQuery({
    queryKey: key,
    queryFn: async (): Promise<Member[]> => {
      const { data, error } = await supabase
        .from('member')
        .select('id, auth_user_id, is_ward, display_name, avatar_path, color, sort_order, kcal_target, deleted_at')
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data as MemberRow[]).map(mapMember);
    },
  });

  const members = useMemo(() => membersQ.data ?? [], [membersQ.data]);

  const myMemberId = useMemo(
    () => members.find((m) => m.authUserId === authUserId && !m.deletedAt)?.id ?? null,
    [members, authUserId],
  );

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: key }),
    [queryClient, key],
  );

  const createMut = useMutation({
    mutationFn: async ({ displayName, color }: { displayName: string; color: Accent }) => {
      const { data, error } = await supabase.rpc('create_ward_member', {
        p_display_name: displayName,
        p_color: color,
      });
      if (error) throw error;
      return asMemberId(data as string);
    },
    onSuccess: () => void invalidate(),
  });

  const deleteMut = useMutation({
    mutationFn: async (memberId: MemberId) => {
      const { error } = await supabase.rpc('delete_ward_member', { p_member_id: memberId });
      if (error) throw error;
    },
    onSuccess: () => void invalidate(),
  });

  const settingsMut = useMutation({
    mutationFn: async ({ memberId, patch }: { memberId: MemberId; patch: MemberSettingsPatch }) => {
      // Se manda solo lo que trae el patch: el servidor conserva lo ausente,
      // así que enviar `undefined` como null borraría datos sin querer.
      const payload: Record<string, unknown> = {};
      if (patch.displayName !== undefined) payload.display_name = patch.displayName;
      if (patch.color !== undefined) payload.color = patch.color;
      if (patch.avatarPath !== undefined) payload.avatar_path = patch.avatarPath;
      if (patch.sortOrder !== undefined) payload.sort_order = patch.sortOrder;
      if (patch.kcalTarget !== undefined) payload.kcal_target = patch.kcalTarget;

      const { error } = await supabase.rpc('set_member_settings', {
        p_member_id: memberId,
        p_patch: payload,
      });
      if (error) throw error;
    },
    onSuccess: () => void invalidate(),
  });

  const createWardMember = useCallback(
    (displayName: string, color: Accent) => createMut.mutateAsync({ displayName, color }),
    [createMut],
  );
  const deleteWardMember = useCallback((memberId: MemberId) => deleteMut.mutateAsync(memberId), [deleteMut]);
  const setMemberSettings = useCallback(
    (memberId: MemberId, patch: MemberSettingsPatch) => settingsMut.mutateAsync({ memberId, patch }),
    [settingsMut],
  );

  return { members, myMemberId, createWardMember, deleteWardMember, setMemberSettings };
}
