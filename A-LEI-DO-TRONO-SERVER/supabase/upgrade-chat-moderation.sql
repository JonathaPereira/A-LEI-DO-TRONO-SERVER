-- Execute AFTER upgrade-chat-history.sql. Safe to repeat: no messages are
-- removed by this migration. Only explicit creator actions delete messages.
-- File objects and the channel attachment gallery are preserved.
begin;
create or replace function public.chat_history_delete(p_actor uuid,p_room text,p_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare affected integer;
begin
  if not exists(select 1 from auth.users where id=p_actor and email_confirmed_at is not null
    and lower(btrim(email))='jonathapereira.jj@gmail.com') then raise exception 'FORBIDDEN'; end if;
  -- The same channel row lock also serializes concurrent append/clear requests.
  perform 1 from public.community_channels where id=p_room and deleted_at is null
    and channel_type in ('text','mixed') for update;
  if not found then raise exception 'CHANNEL_NOT_FOUND'; end if;
  delete from public.chat_messages where id=p_id and room_id=p_room;
  get diagnostics affected=row_count;
  return affected>0;
end $$;
revoke all on function public.chat_history_delete(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.chat_history_delete(uuid,text,uuid) to service_role;

create or replace function public.chat_history_clear(p_actor uuid,p_room text)
returns bigint language plpgsql security definer set search_path='' as $$
declare affected bigint;
begin
  if not exists(select 1 from auth.users where id=p_actor and email_confirmed_at is not null
    and lower(btrim(email))='jonathapereira.jj@gmail.com') then raise exception 'FORBIDDEN'; end if;
  perform 1 from public.community_channels where id=p_room and deleted_at is null
    and channel_type in ('text','mixed') for update;
  if not found then raise exception 'CHANNEL_NOT_FOUND'; end if;
  delete from public.chat_messages where room_id=p_room;
  get diagnostics affected=row_count;
  return affected;
end $$;
revoke all on function public.chat_history_clear(uuid,text) from public,anon,authenticated;
grant execute on function public.chat_history_clear(uuid,text) to service_role;
commit;
