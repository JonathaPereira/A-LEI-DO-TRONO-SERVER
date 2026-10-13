-- M&N Desktop 0.1.7: execute depois de upgrade-community.sql.
-- Pode executar novamente. Não apaga canais, amizades ou mensagens.
create table if not exists public.social_links (
  account_a uuid not null references auth.users(id) on delete cascade,
  account_b uuid not null references auth.users(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  state text not null check (state in ('pending','accepted')),
  created_at timestamptz not null default clock_timestamp(),
  primary key(account_a,account_b),
  check(account_a < account_b), check(requested_by in (account_a,account_b))
);
create index if not exists social_links_b on public.social_links(account_b);
create table if not exists public.social_threads (
  account_a uuid not null references auth.users(id) on delete cascade,
  account_b uuid not null references auth.users(id) on delete cascade,
  read_a timestamptz not null default '-infinity',
  read_b timestamptz not null default '-infinity',
  primary key(account_a,account_b), check(account_a < account_b)
);
create index if not exists social_threads_b on public.social_threads(account_b);
create table if not exists public.social_messages (
  id uuid primary key,
  account_a uuid not null, account_b uuid not null,
  sender_id uuid not null references auth.users(id) on delete cascade,
  text text not null check(char_length(text) between 1 and 2000),
  room_id text,
  created_at timestamptz not null default clock_timestamp(),
  foreign key(account_a,account_b) references public.social_threads(account_a,account_b) on delete cascade,
  check(sender_id in (account_a,account_b))
);
create index if not exists social_messages_thread on public.social_messages(account_a,account_b,created_at desc,id desc);
alter table public.social_links enable row level security;
alter table public.social_threads enable row level security;
alter table public.social_messages enable row level security;
revoke all on public.social_links,public.social_threads,public.social_messages from public,anon,authenticated;

create or replace function public.social_identity() returns uuid
language plpgsql stable security definer set search_path = public,pg_temp as $$
declare who uuid := auth.uid();
begin
  if who is null or not exists(select 1 from auth.users where id=who and email_confirmed_at is not null) then
    raise exception 'AUTH_REQUIRED';
  end if;
  return who;
end $$;

create or replace function public.social_friend(p_target uuid,p_action text) returns void
language plpgsql security definer set search_path = public,pg_temp as $$
declare who uuid := public.social_identity(); a uuid; b uuid; link public.social_links;
begin
  if who=p_target or not exists(select 1 from auth.users where id=p_target and email_confirmed_at is not null) then raise exception 'INVALID_TARGET'; end if;
  a:=least(who,p_target); b:=greatest(who,p_target);
  if p_action='request' then
    insert into public.social_links(account_a,account_b,requested_by,state) values(a,b,who,'pending') on conflict do nothing;
  elsif p_action in ('accept','decline','remove') then
    select * into link from public.social_links where account_a=a and account_b=b for update;
    if link is null then raise exception 'REQUEST_NOT_FOUND'; end if;
    if p_action='accept' then
      if link.state<>'pending' or link.requested_by=who then raise exception 'FORBIDDEN'; end if;
      update public.social_links set state='accepted' where account_a=a and account_b=b;
    elsif p_action='decline' then
      if link.state<>'pending' then raise exception 'FORBIDDEN'; end if;
      delete from public.social_links where account_a=a and account_b=b;
    else
      if link.state<>'accepted' then raise exception 'FORBIDDEN'; end if;
      delete from public.social_links where account_a=a and account_b=b;
    end if;
  else raise exception 'INVALID_ACTION'; end if;
end $$;

create or replace function public.social_send(p_peer uuid,p_id uuid,p_text text,p_room text default null) returns jsonb
language plpgsql security definer set search_path = public,pg_temp as $$
declare who uuid := public.social_identity(); a uuid; b uuid; m public.social_messages; room_name text;
begin
  a:=least(who,p_peer); b:=greatest(who,p_peer);
  perform 1 from public.social_links where account_a=a and account_b=b and state='accepted' for share;
  if not found then raise exception 'FRIEND_REQUIRED'; end if;
  if p_id is null then raise exception 'INVALID_MESSAGE'; end if;
  if p_room is not null then
    select name into room_name from public.community_channels where id=p_room and deleted_at is null;
    if not found then raise exception 'CHANNEL_NOT_FOUND'; end if;
    p_text:='Convite para '||room_name;
  end if;
  p_text:=btrim(p_text);
  if p_text is null or char_length(p_text) not between 1 and 2000 then raise exception 'INVALID_MESSAGE'; end if;
  insert into public.social_threads(account_a,account_b) values(a,b) on conflict do nothing;
  perform 1 from public.social_threads where account_a=a and account_b=b for update;
  insert into public.social_messages(id,account_a,account_b,sender_id,text,room_id) values(p_id,a,b,who,p_text,p_room) on conflict do nothing;
  select * into m from public.social_messages where id=p_id;
  if m.account_a<>a or m.account_b<>b or m.sender_id<>who or m.text<>p_text or m.room_id is distinct from p_room then raise exception 'INVALID_MESSAGE'; end if;
  return jsonb_build_object('id',m.id,'senderId',m.sender_id,'text',m.text,'roomId',m.room_id,'ts',m.created_at);
end $$;

create or replace function public.social_read(p_peer uuid,p_before uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public,pg_temp as $$
declare who uuid := public.social_identity(); a uuid; b uuid; cursor_at timestamptz;
begin
  a:=least(who,p_peer); b:=greatest(who,p_peer);
  if not exists(select 1 from public.social_threads where account_a=a and account_b=b) and not exists(select 1 from public.social_links where account_a=a and account_b=b) then raise exception 'FORBIDDEN'; end if;
  if p_before is not null then
    select created_at into cursor_at from public.social_messages where id=p_before and account_a=a and account_b=b;
    if not found then raise exception 'INVALID_CURSOR'; end if;
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'senderId',m.sender_id,'text',m.text,'roomId',m.room_id,'ts',m.created_at) order by m.created_at,m.id)
    from (select * from public.social_messages where account_a=a and account_b=b and (p_before is null or (created_at,id)<(cursor_at,p_before)) order by created_at desc,id desc limit 51) m),'[]'::jsonb);
end $$;

create or replace function public.social_mark_read(p_peer uuid,p_message uuid) returns void
language plpgsql security definer set search_path = public,pg_temp as $$
declare who uuid := public.social_identity(); a uuid; b uuid; stamp timestamptz;
begin
  a:=least(who,p_peer); b:=greatest(who,p_peer);
  select created_at into stamp from public.social_messages where id=p_message and account_a=a and account_b=b;
  if not found then raise exception 'INVALID_MESSAGE'; end if;
  update public.social_threads set read_a=case when who=a then greatest(read_a,stamp) else read_a end,
    read_b=case when who=b then greatest(read_b,stamp) else read_b end where account_a=a and account_b=b;
end $$;

create or replace function public.social_snapshot() returns jsonb
language plpgsql stable security definer set search_path = public,pg_temp as $$
declare who uuid := public.social_identity(); friends jsonb; threads jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.nickname,'avatar_preset',p.avatar_preset,'avatar_file_id',p.avatar_file_id,
    'state',l.state,'incoming',l.requested_by<>who) order by p.nickname),'[]'::jsonb) into friends
    from public.social_links l join public.profiles p on p.id=case when l.account_a=who then l.account_b else l.account_a end where who in (l.account_a,l.account_b);
  select coalesce(jsonb_agg(jsonb_build_object('peerId',p.id,'name',p.nickname,'avatar_preset',p.avatar_preset,'avatar_file_id',p.avatar_file_id,
    'last',jsonb_build_object('id',last.id,'senderId',last.sender_id,'text',last.text,'roomId',last.room_id,'ts',last.created_at),
    'unread',(select count(*) from public.social_messages m where m.account_a=t.account_a and m.account_b=t.account_b and m.sender_id<>who and m.created_at>case when who=t.account_a then t.read_a else t.read_b end)) order by last.created_at desc),'[]'::jsonb) into threads
    from public.social_threads t join public.profiles p on p.id=case when t.account_a=who then t.account_b else t.account_a end
    join lateral (select * from public.social_messages m where m.account_a=t.account_a and m.account_b=t.account_b order by m.created_at desc,m.id desc limit 1) last on true
    where who in (t.account_a,t.account_b);
  return jsonb_build_object('friends',friends,'threads',threads);
end $$;
revoke all on function public.social_identity(),public.social_friend(uuid,text),public.social_send(uuid,uuid,text,text),public.social_read(uuid,uuid),public.social_mark_read(uuid,uuid),public.social_snapshot() from public,anon;
grant execute on function public.social_friend(uuid,text),public.social_send(uuid,uuid,text,text),public.social_read(uuid,uuid),public.social_mark_read(uuid,uuid),public.social_snapshot() to authenticated;
notify pgrst, 'reload schema';
