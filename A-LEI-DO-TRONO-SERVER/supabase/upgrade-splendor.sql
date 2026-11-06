-- M&N: ranking de Splendor. Execute uma vez depois de schema.sql; pode repetir.
-- Somente o backend registra resultados calculados pelo motor da partida.
begin;
create table if not exists public.splendor_matches (
  id uuid primary key,
  rounds integer not null check(rounds between 1 and 2000),
  mode text not null check(mode in ('online','bots')),
  finished_at timestamptz not null default now()
);
create table if not exists public.splendor_scores (
  match_id uuid not null references public.splendor_matches(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  score integer not null check(score between 0 and 200),
  development_cards integer not null check(development_cards between 0 and 90),
  primary key(match_id,player_id)
);
create index if not exists splendor_scores_best on public.splendor_scores(player_id,score desc);
alter table public.splendor_matches enable row level security;
alter table public.splendor_scores enable row level security;
revoke all on public.splendor_matches,public.splendor_scores from public,anon,authenticated;

create or replace function public.splendor_record_match(p_match uuid,p_rounds integer,p_mode text,p_players jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare item jsonb; existed boolean;
begin
  if p_match is null or p_rounds is null or p_rounds < 1 or p_mode is null or p_mode not in ('online','bots') or jsonb_typeof(p_players) is distinct from 'array' then raise exception 'INVALID_RESULT'; end if;
  if jsonb_array_length(p_players) not between 1 and 4 then raise exception 'INVALID_RESULT'; end if;
  if (select count(distinct x->>'id') from jsonb_array_elements(p_players) x) <> jsonb_array_length(p_players) then raise exception 'INVALID_RESULT'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_match::text,916));
  existed := exists(select 1 from public.splendor_matches where id=p_match);
  if existed then
    if not exists(select 1 from public.splendor_matches where id=p_match and rounds=p_rounds and mode=p_mode) or
      (select count(*) from public.splendor_scores where match_id=p_match)<>jsonb_array_length(p_players) or
      exists(select 1 from jsonb_array_elements(p_players) x where not exists(select 1 from public.splendor_scores s where s.match_id=p_match and s.player_id=(x->>'id')::uuid and s.score=(x->>'score')::integer and s.development_cards=(x->>'cards')::integer)) then raise exception 'RESULT_CONFLICT'; end if;
    return jsonb_build_object('saved',true);
  end if;
  insert into public.splendor_matches(id,rounds,mode) values(p_match,p_rounds,p_mode);
  for item in select * from jsonb_array_elements(p_players) loop
    if jsonb_typeof(item->'score') is distinct from 'number' or jsonb_typeof(item->'cards') is distinct from 'number' or not exists(select 1 from auth.users u where u.id=(item->>'id')::uuid and u.email_confirmed_at is not null) then raise exception 'INVALID_RESULT'; end if;
    insert into public.splendor_scores values(p_match,(item->>'id')::uuid,(item->>'score')::integer,(item->>'cards')::integer);
  end loop;
  return jsonb_build_object('saved',true);
end;
$$;

create or replace function public.splendor_top_five()
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('playerId',best.player_id,'name',best.nickname,'score',best.score,'cards',best.development_cards,'mode',best.mode,'date',best.finished_at) order by best.score desc,best.development_cards asc,best.finished_at,best.player_id),'[]'::jsonb)
  from (select * from (select distinct on(s.player_id) s.player_id,p.nickname,s.score,s.development_cards,m.mode,m.finished_at
    from public.splendor_scores s join public.splendor_matches m on m.id=s.match_id join public.profiles p on p.id=s.player_id
    order by s.player_id,s.score desc,s.development_cards asc,m.finished_at,s.match_id) personal
    order by score desc,development_cards asc,finished_at,player_id limit 5) best;
$$;
revoke all on function public.splendor_record_match(uuid,integer,text,jsonb),public.splendor_top_five() from public,anon,authenticated;
grant execute on function public.splendor_record_match(uuid,integer,text,jsonb),public.splendor_top_five() to service_role;
commit;
