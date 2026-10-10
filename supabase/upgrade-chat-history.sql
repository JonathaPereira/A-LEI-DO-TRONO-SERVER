-- Execute AFTER upgrade-community.sql. Safe to run again: existing messages are preserved.
-- Messages are private to the backend. Browser roles cannot read or write this table/RPCs.
begin;
create table if not exists public.chat_messages (
  id uuid primary key,
  room_id text not null references public.community_channels(id) on delete cascade,
  sender_account_id uuid references auth.users(id) on delete set null,
  message jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint chat_message_shape check ((
    jsonb_typeof(message)='object' and message->>'id'=id::text and message->>'roomId'=room_id
    and jsonb_typeof(message->'text')='string' and char_length(message->>'text')<=300
  ) is true)
);
create index if not exists chat_messages_room_date on public.chat_messages(room_id,created_at desc,id desc);
alter table public.chat_messages enable row level security;
revoke all on public.chat_messages from public,anon,authenticated;

create or replace function public.chat_history_append(p_id uuid,p_room text,p_sender uuid,p_message jsonb)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.community_channels where id=p_room and deleted_at is null and channel_type in ('text','mixed') for share;
  if not found then raise exception 'CHANNEL_NOT_FOUND'; end if;
  if not exists(select 1 from auth.users where id=p_sender and email_confirmed_at is not null) then raise exception 'MEMBER_NOT_FOUND'; end if;
  insert into public.chat_messages(id,room_id,sender_account_id,message) values(p_id,p_room,p_sender,p_message);
end $$;
revoke all on function public.chat_history_append(uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.chat_history_append(uuid,text,uuid,jsonb) to service_role;

create or replace function public.chat_history_read(p_room text,p_before uuid default null,p_limit integer default 50)
returns table(message jsonb) language sql stable security definer set search_path='' as $$
  select case when m.message->'attachment' is not null and m.message->'attachment'<>'null'::jsonb
    and not exists(select 1 from public.chat_files f where f.id::text=m.message->'attachment'->>'id' and f.state='ready')
    then jsonb_set(m.message,'{attachment,deleted}','true'::jsonb,true) else m.message end
  from public.chat_messages m join public.community_channels c on c.id=m.room_id
  where m.room_id=p_room and c.deleted_at is null and c.channel_type in ('text','mixed')
    and (p_before is null or (m.created_at,m.id)<(select b.created_at,b.id from public.chat_messages b where b.id=p_before and b.room_id=p_room))
  order by m.created_at desc,m.id desc limit greatest(1,least(coalesce(p_limit,50),100))+1;
$$;
revoke all on function public.chat_history_read(text,uuid,integer) from public,anon,authenticated;
grant execute on function public.chat_history_read(text,uuid,integer) to service_role;
commit;
