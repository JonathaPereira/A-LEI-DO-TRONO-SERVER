begin;
create schema if not exists private;
grant usage on schema private to authenticated;
create table if not exists public.profile_customizations (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 handle text unique check(handle is null or handle ~ '^[a-z0-9_]{3,24}$'),
 data jsonb not null default '{}'::jsonb,
 updated_at timestamptz not null default now()
);
alter table public.profile_customizations enable row level security;
revoke all on public.profile_customizations from public,anon,authenticated;
grant select on public.profile_customizations to authenticated;
create policy profile_customizations_own on public.profile_customizations for select to authenticated using ((select auth.uid())=user_id);

create or replace function private.valid_member_profile(d jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare item jsonb; field text;
begin
 if jsonb_typeof(d) is distinct from 'object' or octet_length(d::text)>12000 or
 d-array['handle','bio','status','emoji','tags','links','cover_file_id','background_file_id','accent','darkness','blur','opacity','reduce_motion'] <> '{}'::jsonb then return false; end if;
 foreach field in array array['handle','bio','status','emoji','accent'] loop
  if jsonb_typeof(d->field) is distinct from 'string' then return false; end if;
 end loop;
 if (d->>'handle'<>'' and d->>'handle' !~ '^[a-z0-9_]{3,24}$') or char_length(d->>'bio')>300 or char_length(d->>'status')>100 or char_length(d->>'emoji')>12 or d->>'accent' !~ '^#[0-9a-fA-F]{6}$' then return false; end if;
 if jsonb_typeof(d->'tags') is distinct from 'array' or jsonb_array_length(d->'tags')>12 or jsonb_typeof(d->'links') is distinct from 'array' or jsonb_array_length(d->'links')>8 then return false; end if;
 for item in select value from jsonb_array_elements(d->'tags') loop
  if jsonb_typeof(item)<>'string' or char_length(item#>>'{}') not between 1 and 24 then return false; end if;
 end loop;
 for item in select value from jsonb_array_elements(d->'links') loop
  if jsonb_typeof(item)<>'object' or jsonb_typeof(item->'label') is distinct from 'string' or char_length(item->>'label') not between 1 and 32 or jsonb_typeof(item->'url') is distinct from 'string' or char_length(item->>'url')>400 or item->>'url' !~ '^https://[^[:space:]/@]+([/?#][^[:space:]]*)?$' then return false; end if;
 end loop;
 foreach field in array array['darkness','blur','opacity'] loop
  if jsonb_typeof(d->field) is distinct from 'number' then return false; end if;
 end loop;
 if (d->>'darkness')::numeric not between 0 and 90 or (d->>'blur')::numeric not between 0 and 20 or (d->>'opacity')::numeric not between 40 and 100 or jsonb_typeof(d->'reduce_motion') is distinct from 'boolean' then return false; end if;
 foreach field in array array['cover_file_id','background_file_id'] loop
  if jsonb_typeof(d->field) is distinct from 'null' and (jsonb_typeof(d->field) is distinct from 'string' or d->>field !~ '^[0-9a-fA-F-]{36}$') then return false; end if;
 end loop;
 return true;
exception when others then return false;
end $$;
revoke all on function private.valid_member_profile(jsonb) from public,anon,authenticated;

create or replace function private.save_member_profile(p_nickname text,p_preset text,p_file uuid,p_data jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare media uuid;
begin
 if not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then raise exception 'AUTH_REQUIRED'; end if;
 if not private.valid_member_profile(p_data) then raise exception 'INVALID_PROFILE'; end if;
 -- Same owner lock as avatar deletion. All identity and appearance edits are atomic.
 perform public.update_chat_profile(p_nickname,p_preset,p_file);
 for media in select (p_data->>k)::uuid from unnest(array['cover_file_id','background_file_id']) k where p_data->>k is not null loop
  if not exists(select 1 from public.chat_files where id=media and owner_id=auth.uid() and kind='avatar' and state='ready' and mime in ('image/png','image/jpeg','image/webp','image/gif')) then raise exception 'INVALID_PROFILE_MEDIA'; end if;
 end loop;
 insert into public.profile_customizations(user_id,handle,data) values(auth.uid(),nullif(p_data->>'handle',''),p_data)
 on conflict(user_id) do update set handle=excluded.handle,data=excluded.data,updated_at=now();
exception when unique_violation then raise exception 'HANDLE_TAKEN';
end $$;
create or replace function public.save_member_profile(p_nickname text,p_preset text,p_file uuid,p_data jsonb) returns void
language sql security invoker set search_path='' as $$select private.save_member_profile(p_nickname,p_preset,p_file,p_data)$$;

create or replace function private.read_member_profile(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then raise exception 'AUTH_REQUIRED'; end if;
 return (select jsonb_build_object('id',p.id,'nickname',p.nickname,'avatar_preset',p.avatar_preset,'avatar_file_id',p.avatar_file_id,'created_at',p.created_at,'personalization',coalesce(c.data,'{}'::jsonb)) from public.profiles p join auth.users u on u.id=p.id left join public.profile_customizations c on c.user_id=p.id where p.id=p_user and u.email_confirmed_at is not null);
end $$;
create or replace function public.read_member_profile(p_user uuid) returns jsonb
language sql stable security invoker set search_path='' as $$select private.read_member_profile(p_user)$$;

create or replace function private.creator_registered_accounts(p_offset integer default 0)
returns table(id uuid,nickname text,email text,confirmed boolean,created_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
 if public.community_role() is distinct from 'creator' then raise exception 'FORBIDDEN'; end if;
 return query select p.id,p.nickname,u.email,u.email_confirmed_at is not null,p.created_at from public.profiles p join auth.users u on u.id=p.id where u.email is not null order by p.created_at desc,p.id limit 50 offset greatest(0,least(1000000,p_offset));
end $$;
create or replace function public.creator_registered_accounts(p_offset integer default 0)
returns table(id uuid,nickname text,email text,confirmed boolean,created_at timestamptz)
language sql stable security invoker set search_path='' as $$select * from private.creator_registered_accounts(p_offset)$$;

revoke all on function private.save_member_profile(text,text,uuid,jsonb), public.save_member_profile(text,text,uuid,jsonb), private.read_member_profile(uuid), public.read_member_profile(uuid), private.creator_registered_accounts(integer), public.creator_registered_accounts(integer) from public,anon;
grant execute on function private.save_member_profile(text,text,uuid,jsonb), public.save_member_profile(text,text,uuid,jsonb), private.read_member_profile(uuid), public.read_member_profile(uuid), private.creator_registered_accounts(integer), public.creator_registered_accounts(integer) to authenticated;

create or replace function public.mark_chat_file_deleting(p_id uuid,p_owner uuid)
returns public.chat_files language plpgsql security definer set search_path='' as $$
declare result public.chat_files;
begin
 perform 1 from public.profiles where id=p_owner for update;
 if exists(select 1 from public.profiles where avatar_file_id=p_id) or exists(select 1 from public.profile_customizations where data->>'cover_file_id'=p_id::text or data->>'background_file_id'=p_id::text) then raise exception 'AVATAR_IN_USE'; end if;
 update public.chat_files set state='deleting' where id=p_id and owner_id=p_owner returning * into result;
 return result;
end $$;

create or replace function public.reserve_chat_file(p_id uuid,p_owner uuid,p_key text,p_name text,p_bytes bigint,p_mime text,p_kind text,p_room text)
returns public.chat_files language plpgsql security definer set search_path='' as $$
declare result public.chat_files;
begin
 perform pg_advisory_xact_lock(790079);
 if p_bytes<=0 or p_bytes>100000000 or
    (p_mime not in ('video/mp4','video/webm') and p_bytes>10000000) or
    (p_kind='avatar' and (p_bytes>10000000 or p_mime not in ('image/png','image/jpeg','image/webp','image/gif'))) or
    (p_kind='soundboard' and (p_bytes>2880044 or p_mime<>'audio/wav')) then raise exception 'FILE_TOO_LARGE'; end if;
 if (select coalesce(sum(bytes),0) from public.chat_files)+p_bytes>8000000000 then raise exception 'STORAGE_FULL'; end if;
 insert into public.chat_files(id,owner_id,object_key,name,bytes,mime,kind,room_id)
 values(p_id,p_owner,p_key,p_name,p_bytes,p_mime,p_kind,p_room) returning * into result;
 return result;
end $$;
revoke all on function public.reserve_chat_file(uuid,uuid,text,text,bigint,text,text,text) from public,anon,authenticated;
grant execute on function public.reserve_chat_file(uuid,uuid,text,text,bigint,text,text,text) to service_role;

commit;
