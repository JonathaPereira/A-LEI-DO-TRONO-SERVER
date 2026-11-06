-- Execute after schema.sql, upgrade-v079.sql and upgrade-v080.sql.
-- Existing accounts, attachments and the three original channels are preserved.
begin;
alter table public.profiles add column if not exists community_role text not null default 'member'
  check(community_role in ('member','admin'));

create or replace function public.community_role()
returns text language sql stable security definer set search_path='' as $$
  select case when lower(btrim(u.email))='jonathapereira.jj@gmail.com' then 'creator'
    else p.community_role end
  from auth.users u join public.profiles p on p.id=u.id
  where u.id=auth.uid() and u.email_confirmed_at is not null;
$$;
revoke all on function public.community_role() from public,anon;
grant execute on function public.community_role() to authenticated,service_role;

create or replace function public.community_set_role(p_user uuid,p_role text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if public.community_role() is distinct from 'creator' then raise exception 'FORBIDDEN'; end if;
  if p_role is null or p_role not in ('admin','member') then raise exception 'INVALID_ROLE'; end if;
  perform 1 from auth.users where id=p_user and email_confirmed_at is not null for update;
  if not found then raise exception 'MEMBER_NOT_FOUND'; end if;
  if exists(select 1 from auth.users where id=p_user and lower(btrim(email))='jonathapereira.jj@gmail.com') then raise exception 'CREATOR_PROTECTED'; end if;
  update public.profiles set community_role=p_role where id=p_user;
  if not found then raise exception 'MEMBER_NOT_FOUND'; end if;
end $$;
revoke all on function public.community_set_role(uuid,text) from public,anon;
grant execute on function public.community_set_role(uuid,text) to authenticated;

create table if not exists public.community_channels (
  id text primary key default ('channel-'||gen_random_uuid()::text),
  name text not null check(char_length(btrim(name)) between 2 and 40 and name !~ '[[:cntrl:]]'),
  description text not null default '' check(char_length(description)<=160),
  channel_type text not null check(channel_type in ('text','voice','mixed')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  check(id ~ '^channel-[0-9a-f-]{36}$' or id in ('chat-livre','chat-jogos','chat-conversa'))
);
alter table public.community_channels enable row level security;
revoke all on public.community_channels from anon,authenticated;
insert into public.community_channels(id,name,description,channel_type) values
 ('chat-livre','Geral','Conversa aberta','mixed'),
 ('chat-jogos','Jogos','Partidas e transmissões','mixed'),
 ('chat-conversa','Conversa','Papo em grupo','mixed') on conflict(id) do nothing;

create or replace function public.community_channels()
returns setof public.community_channels language sql stable security definer set search_path='' as $$
  select * from public.community_channels
  where deleted_at is null and (public.community_role() is not null or current_setting('role',true)='service_role')
  order by created_at,id;
$$;
revoke all on function public.community_channels() from public,anon;
grant execute on function public.community_channels() to authenticated,service_role;

create or replace function public.community_create_channel(p_name text,p_type text,p_description text default '')
returns public.community_channels language plpgsql security definer set search_path='' as $$
declare result public.community_channels;
begin
  if coalesce(public.community_role(),'') not in ('creator','admin') then raise exception 'FORBIDDEN'; end if;
  if p_name is null or char_length(btrim(p_name)) not between 2 and 40 or p_name ~ '[[:cntrl:]]'
     or p_type is null or p_type not in ('text','voice') or p_description is null or char_length(p_description)>160 then raise exception 'INVALID_CHANNEL'; end if;
  perform pg_advisory_xact_lock(790090);
  if (select count(*) from public.community_channels where deleted_at is null)>=50 then raise exception 'CHANNEL_LIMIT'; end if;
  insert into public.community_channels(name,channel_type,description,created_by)
  values(btrim(p_name),p_type,btrim(p_description),auth.uid()) returning * into result;
  return result;
end $$;
revoke all on function public.community_create_channel(text,text,text) from public,anon;
grant execute on function public.community_create_channel(text,text,text) to authenticated;

create or replace function public.community_delete_channel(p_id text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if coalesce(public.community_role(),'') not in ('creator','admin') then raise exception 'FORBIDDEN'; end if;
  update public.community_channels set deleted_at=now() where id=p_id and deleted_at is null;
  if not found then raise exception 'CHANNEL_NOT_FOUND'; end if;
  -- Tombstones prevent previously removed default channels from reappearing on migration/restart.
end $$;
revoke all on function public.community_delete_channel(text) from public,anon;
grant execute on function public.community_delete_channel(text) to authenticated;

-- Return only display identities, never email addresses, to the presence directory.
drop function if exists public.chat_member_directory();
create function public.chat_member_directory()
returns table(id uuid,nickname text,avatar_preset text,avatar_file_id uuid,role text)
language sql security definer set search_path='' as $$
  select p.id,p.nickname,p.avatar_preset,p.avatar_file_id,
    case when lower(btrim(u.email))='jonathapereira.jj@gmail.com' then 'creator' else p.community_role end
  from public.profiles p join auth.users u on u.id=p.id
  where u.email_confirmed_at is not null order by lower(p.nickname),p.id limit 1000;
$$;
revoke all on function public.chat_member_directory() from public,anon,authenticated;
grant execute on function public.chat_member_directory() to service_role;

alter table public.chat_files drop constraint if exists chat_files_kind_check;
alter table public.chat_files drop constraint if exists chat_files_check;
alter table public.chat_files add constraint chat_files_kind_check check(kind in ('chat','avatar','soundboard'));
alter table public.chat_files add constraint chat_files_check
 check((kind in ('avatar','soundboard') and room_id is null) or (kind='chat' and room_id is not null));
alter table public.chat_files add column if not exists duration_ms integer;
alter table public.chat_files drop constraint if exists chat_files_sound_duration;
alter table public.chat_files add constraint chat_files_sound_duration
 check(kind<>'soundboard' or (mime='audio/wav' and bytes<=2880044 and (state<>'ready' or (duration_ms is not null and duration_ms between 1 and 15000))));

create or replace function public.reserve_chat_file(p_id uuid,p_owner uuid,p_key text,p_name text,p_bytes bigint,p_mime text,p_kind text,p_room text)
returns public.chat_files language plpgsql security definer set search_path='' as $$
declare result public.chat_files;
begin
 perform pg_advisory_xact_lock(790079);
 if p_bytes<=0 or p_bytes>100000000 or
    (p_mime not in ('video/mp4','video/webm') and p_bytes>10000000) or
    (p_kind='avatar' and (p_bytes>1000000 or p_mime<>'image/png')) or
    (p_kind='soundboard' and (p_bytes>2880044 or p_mime<>'audio/wav')) then raise exception 'FILE_TOO_LARGE'; end if;
 if (select coalesce(sum(bytes),0) from public.chat_files)+p_bytes>8000000000 then raise exception 'STORAGE_FULL'; end if;
 insert into public.chat_files(id,owner_id,object_key,name,bytes,mime,kind,room_id)
 values(p_id,p_owner,p_key,p_name,p_bytes,p_mime,p_kind,p_room) returning * into result;
 return result;
end $$;
revoke all on function public.reserve_chat_file(uuid,uuid,text,text,bigint,text,text,text) from public,anon,authenticated;
grant execute on function public.reserve_chat_file(uuid,uuid,text,text,bigint,text,text,text) to service_role;
commit;
