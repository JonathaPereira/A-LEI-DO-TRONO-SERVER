-- Run once in the Supabase SQL Editor, before opening registration.
begin;
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null check (char_length(nickname) between 2 and 20 and nickname = btrim(nickname) and nickname = normalize(nickname,NFKC) and nickname ~ '^[[:alnum:] _.-]+$'),
  created_at timestamptz not null default now()
);
create unique index if not exists profiles_nickname_unique on public.profiles (lower(nickname));
alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
drop policy if exists profiles_read_own on public.profiles;
create policy profiles_read_own on public.profiles for select to authenticated using ((select auth.uid()) = id);

create or replace function public.create_chat_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id,nickname)
  values(new.id,btrim(normalize(new.raw_user_meta_data ->> 'nickname',NFKC)));
  return new;
end;
$$;
revoke all on function public.create_chat_profile() from public, anon, authenticated;
drop trigger if exists on_chat_user_created on auth.users;
create trigger on_chat_user_created after insert on auth.users for each row execute function public.create_chat_profile();
-- Apelidos ficam reservados na conta, inclusive quando a pessoa está offline.
-- O cliente não recebe permissão de UPDATE/INSERT/DELETE nesta tabela.
commit;
