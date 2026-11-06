-- Execute once in Supabase > SQL Editor > New snippet. Preserves existing accounts.
begin;
alter table public.profiles add column if not exists avatar_preset text not null default 'crown';
alter table public.profiles add column if not exists avatar_file_id uuid;

create table if not exists public.chat_files (
 id uuid primary key,
 owner_id uuid not null references auth.users(id) on delete restrict,
 object_key text not null unique,
 name text not null,
 bytes bigint not null check(bytes > 0 and bytes <= 100000000),
 mime text not null,
 kind text not null check(kind in ('chat','avatar')),
 room_id text,
 state text not null default 'pending' check(state in ('pending','ready','deleting')),
 created_at timestamptz not null default now(),
 check((kind='avatar' and room_id is null) or (kind='chat' and room_id is not null))
);
alter table public.chat_files enable row level security;
revoke all on public.chat_files from anon, authenticated;
grant select, insert, update, delete on public.chat_files to service_role;
create index if not exists chat_files_owner on public.chat_files(owner_id,created_at desc);

-- Every reservation, including incomplete uploads, counts. A transaction lock
-- prevents parallel uploads or multiple backend instances from crossing 8 GB.
create or replace function public.reserve_chat_file(p_id uuid,p_owner uuid,p_key text,p_name text,p_bytes bigint,p_mime text,p_kind text,p_room text)
returns public.chat_files language plpgsql security definer set search_path='' as $$
declare result public.chat_files;
begin
 perform pg_advisory_xact_lock(790079);
 if p_bytes <= 0 or p_bytes > 100000000 or
    (p_mime not in ('video/mp4','video/webm') and p_bytes > 10000000) or
    (p_kind='avatar' and (p_bytes > 1000000 or p_mime<>'image/png')) then
   raise exception 'FILE_TOO_LARGE';
 end if;
 if (select coalesce(sum(bytes),0) from public.chat_files)+p_bytes > 8000000000 then
   raise exception 'STORAGE_FULL';
 end if;
 insert into public.chat_files(id,owner_id,object_key,name,bytes,mime,kind,room_id)
 values(p_id,p_owner,p_key,p_name,p_bytes,p_mime,p_kind,p_room) returning * into result;
 return result;
end $$;
revoke all on function public.reserve_chat_file(uuid,uuid,text,text,bigint,text,text,text) from public,anon,authenticated;
grant execute on function public.reserve_chat_file(uuid,uuid,text,text,bigint,text,text,text) to service_role;

create or replace function public.chat_storage_usage()
returns bigint language sql security definer set search_path='' as $$
 select coalesce(sum(bytes),0)::bigint from public.chat_files;
$$;
revoke all on function public.chat_storage_usage() from public,anon,authenticated;
grant execute on function public.chat_storage_usage() to service_role;

-- Mark deleting while locking the profile. A displayed avatar cannot be deleted.
create or replace function public.mark_chat_file_deleting(p_id uuid,p_owner uuid)
returns public.chat_files language plpgsql security definer set search_path='' as $$
declare result public.chat_files;
begin
 perform 1 from public.profiles where id=p_owner for update;
 if exists(select 1 from public.profiles where avatar_file_id=p_id) then raise exception 'AVATAR_IN_USE'; end if;
 update public.chat_files set state='deleting' where id=p_id and owner_id=p_owner returning * into result;
 return result;
end $$;
revoke all on function public.mark_chat_file_deleting(uuid,uuid) from public,anon,authenticated;
grant execute on function public.mark_chat_file_deleting(uuid,uuid) to service_role;

create or replace function public.update_chat_profile(p_nickname text,p_preset text,p_file uuid default null)
returns public.profiles language plpgsql security definer set search_path='' as $$
declare result public.profiles; clean text:=normalize(btrim(p_nickname),NFKC);
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
 perform 1 from public.profiles where id=auth.uid() for update;
 if char_length(clean) not between 2 and 20 or clean !~ '^[[:alnum:] _.-]+$' then raise exception 'INVALID_NICKNAME'; end if;
 if p_preset not in ('crown','scepter','key','blade','mask','shield','knight','dragon','person','cat','dog','robot','star','moon','gamepad','flower') or p_preset is null then raise exception 'INVALID_AVATAR'; end if;
 if p_file is not null and not exists(select 1 from public.chat_files where id=p_file and owner_id=auth.uid() and kind='avatar' and state='ready') then raise exception 'INVALID_AVATAR'; end if;
 update public.profiles set nickname=clean,avatar_preset=p_preset,avatar_file_id=p_file where id=auth.uid() returning * into result;
 if result.id is null then raise exception 'PROFILE_UNAVAILABLE'; end if;
 return result;
exception when unique_violation then raise exception 'NICKNAME_TAKEN';
end $$;
revoke all on function public.update_chat_profile(text,text,uuid) from public,anon;
grant execute on function public.update_chat_profile(text,text,uuid) to authenticated;
commit;
