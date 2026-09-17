-- Auditoría run-2 (recognize-pantry-item/unbounded-gemini-spend).
-- La función solo comprobaba identidad antes de gastar la clave de Gemini del
-- operador. Esta tabla lleva la cuenta por perfil en ventanas fijas; el rol de
-- servicio es el único que puede consumirla, desde la Edge Function.

create table if not exists public.recognition_usage (
  profile_id   uuid primary key references public.profile(id) on delete cascade,
  window_start timestamptz not null default now(),
  calls        int not null default 0
);

alter table public.recognition_usage enable row level security;
revoke all on public.recognition_usage from anon, authenticated;

create or replace function public.consume_recognition_quota(
  p_profile uuid, p_limit int, p_window interval
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_calls int;
begin
  insert into public.recognition_usage (profile_id) values (p_profile)
  on conflict (profile_id) do update
    set window_start = case when recognition_usage.window_start < now() - p_window
                            then now() else recognition_usage.window_start end,
        calls        = case when recognition_usage.window_start < now() - p_window
                            then 0 else recognition_usage.calls end;

  -- Sin coincidencia, RETURNING deja v_calls a NULL (no lanza: eso solo pasa
  -- con INTO STRICT), que es justo la señal de "cuota agotada".
  update public.recognition_usage
     set calls = calls + 1
   where profile_id = p_profile
     and calls < p_limit
  returning calls into v_calls;

  return v_calls is not null;
end;
$$;

revoke all on function public.consume_recognition_quota(uuid, int, interval) from public, anon, authenticated;
grant execute on function public.consume_recognition_quota(uuid, int, interval) to service_role;
