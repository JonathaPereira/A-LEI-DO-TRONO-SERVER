-- Run in the Supabase SQL editor. Only the backend service role accesses logs.
create table if not exists public.pvp_matches (
  id uuid primary key,
  created_at timestamptz not null,
  payload jsonb not null
);
create index if not exists pvp_matches_created_at on public.pvp_matches (created_at desc);
alter table public.pvp_matches enable row level security;
revoke all on public.pvp_matches from anon, authenticated;
grant select, insert, update on public.pvp_matches to service_role;
