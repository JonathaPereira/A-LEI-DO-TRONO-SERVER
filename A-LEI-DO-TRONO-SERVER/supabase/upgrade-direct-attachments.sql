-- M&N: anexos nas conversas privadas. Execute depois de upgrade-social.sql.
-- Reexecutável. Preserva amizades, mensagens, anexos e a cota compartilhada de 8 GB.
begin;
alter table public.chat_files add column if not exists direct_peer_id uuid references auth.users(id) on delete restrict;
alter table public.chat_files drop constraint if exists chat_files_kind_check;
alter table public.chat_files drop constraint if exists chat_files_check;
alter table public.chat_files add constraint chat_files_kind_check check(kind in ('chat','avatar','soundboard','direct'));
alter table public.chat_files add constraint chat_files_check check(
  (kind in ('avatar','soundboard') and room_id is null and direct_peer_id is null) or
  (kind='chat' and room_id is not null and direct_peer_id is null) or
  (kind='direct' and room_id is null and direct_peer_id is not null and direct_peer_id<>owner_id));
alter table public.social_messages add column if not exists attachment_id uuid references public.chat_files(id) on delete set null;
-- Keep the safe display metadata after an uploader deletes the underlying file.
alter table public.social_messages add column if not exists attachment jsonb;
alter table public.social_messages drop constraint if exists social_messages_text_check;
alter table public.social_messages add constraint social_messages_text_check check(
  char_length(text)<=2000 and (char_length(text)>0 or attachment is not null));
create index if not exists social_messages_attachment on public.social_messages(attachment_id) where attachment_id is not null;

create or replace function public.social_attachment_target(p_peer uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare who uuid:=public.social_identity();
begin
  if who=p_peer or not exists(select 1 from auth.users where id=p_peer and email_confirmed_at is not null) then raise exception 'INVALID_TARGET'; end if;
  perform 1 from public.social_links where account_a=least(who,p_peer) and account_b=greatest(who,p_peer) and state='accepted' for share;
  if not found then raise exception 'FRIEND_REQUIRED'; end if;
end $$;

-- Service-only reservation uses the SAME transaction lock and total as channel uploads.
create or replace function public.reserve_direct_file(p_id uuid,p_owner uuid,p_key text,p_name text,p_bytes bigint,p_mime text,p_peer uuid)
returns public.chat_files language plpgsql security definer set search_path='' as $$
declare result public.chat_files;
begin
  perform pg_advisory_xact_lock(790079);
  if p_owner=p_peer or not exists(select 1 from auth.users where id=p_owner and email_confirmed_at is not null)
    or not exists(select 1 from auth.users where id=p_peer and email_confirmed_at is not null) then raise exception 'INVALID_ATTACHMENT'; end if;
  perform 1 from public.social_links where account_a=least(p_owner,p_peer) and account_b=greatest(p_owner,p_peer) and state='accepted' for share;
  if not found then raise exception 'FRIEND_REQUIRED'; end if;
  if p_bytes<=0 or p_bytes>100000000 or (p_mime not in ('video/mp4','video/webm') and p_bytes>10000000) then raise exception 'FILE_TOO_LARGE'; end if;
  if (select coalesce(sum(bytes),0) from public.chat_files)+p_bytes>8000000000 then raise exception 'STORAGE_FULL'; end if;
  insert into public.chat_files(id,owner_id,object_key,name,bytes,mime,kind,room_id,direct_peer_id)
    values(p_id,p_owner,p_key,p_name,p_bytes,p_mime,'direct',null,p_peer) returning * into result;
  return result;
end $$;

create or replace function public.social_message_payload(p_message public.social_messages) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
  select jsonb_build_object('id',p_message.id,'senderId',p_message.sender_id,'text',p_message.text,'roomId',p_message.room_id,'ts',p_message.created_at)
    || case when p_message.attachment is null then '{}'::jsonb else jsonb_build_object('attachment',p_message.attachment
      ||jsonb_build_object('deleted',not exists(select 1 from public.chat_files f where f.id=p_message.attachment_id and f.state='ready'))) end;
$$;

-- Central validation also protects callers using Supabase directly, outside the app.
create or replace function public.social_send_message(p_peer uuid,p_id uuid,p_text text,p_room text,p_attachment uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare who uuid:=public.social_identity(); a uuid; b uuid; m public.social_messages; room_name text; file public.chat_files; safe_file jsonb;
begin
  a:=least(who,p_peer); b:=greatest(who,p_peer);
  perform public.social_attachment_target(p_peer);
  if p_id is null or (p_room is not null and p_attachment is not null) then raise exception 'INVALID_MESSAGE'; end if;
  if p_room is not null then
    select name into room_name from public.community_channels where id=p_room and deleted_at is null;
    if not found then raise exception 'CHANNEL_NOT_FOUND'; end if;
    p_text:='Convite para '||room_name;
  end if;
  p_text:=btrim(coalesce(p_text,''));
  if char_length(p_text)>2000 or (p_text='' and p_attachment is null) then raise exception 'INVALID_MESSAGE'; end if;
  if p_attachment is not null then
    -- Lock against owner deletion while committing the message. The recipient cannot
    -- fetch an upload until the message becomes visible in this conversation.
    select * into file from public.chat_files where id=p_attachment and kind='direct' and state='ready'
      and owner_id=who and direct_peer_id=p_peer for share;
    if not found then raise exception 'INVALID_ATTACHMENT'; end if;
    safe_file:=jsonb_build_object('id',file.id,'name',file.name,'bytes',file.bytes,'mime',file.mime,'kind',file.kind,
      'ownerId',file.owner_id,'peerId',file.direct_peer_id,'roomId',null,'createdAt',file.created_at);
  end if;
  insert into public.social_threads(account_a,account_b) values(a,b) on conflict do nothing;
  perform 1 from public.social_threads where account_a=a and account_b=b for update;
  insert into public.social_messages(id,account_a,account_b,sender_id,text,room_id,attachment_id,attachment)
    values(p_id,a,b,who,p_text,p_room,p_attachment,safe_file) on conflict do nothing;
  select * into m from public.social_messages where id=p_id;
  if m.account_a<>a or m.account_b<>b or m.sender_id<>who or m.text<>p_text or m.room_id is distinct from p_room
    or m.attachment_id is distinct from p_attachment or m.attachment is distinct from safe_file then raise exception 'INVALID_MESSAGE'; end if;
  return public.social_message_payload(m);
end $$;

-- Keep the original four-argument RPC intact for existing installed apps.
create or replace function public.social_send(p_peer uuid,p_id uuid,p_text text,p_room text default null) returns jsonb
language sql security definer set search_path=public,pg_temp as $$
  select public.social_send_message(p_peer,p_id,p_text,p_room,null);
$$;
create or replace function public.social_send_attachment(p_peer uuid,p_id uuid,p_text text,p_attachment uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if p_attachment is null then raise exception 'INVALID_ATTACHMENT'; end if;
  return public.social_send_message(p_peer,p_id,p_text,null,p_attachment);
end $$;

create or replace function public.social_read(p_peer uuid,p_before uuid default null) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare who uuid:=public.social_identity(); a uuid; b uuid; cursor_at timestamptz;
begin
  a:=least(who,p_peer); b:=greatest(who,p_peer);
  if not exists(select 1 from public.social_threads where account_a=a and account_b=b)
    and not exists(select 1 from public.social_links where account_a=a and account_b=b) then raise exception 'FORBIDDEN'; end if;
  if p_before is not null then
    select created_at into cursor_at from public.social_messages where id=p_before and account_a=a and account_b=b;
    if not found then raise exception 'INVALID_CURSOR'; end if;
  end if;
  return coalesce((select jsonb_agg(public.social_message_payload(m) order by m.created_at,m.id)
    from (select * from public.social_messages where account_a=a and account_b=b
      and (p_before is null or (created_at,id)<(cursor_at,p_before)) order by created_at desc,id desc limit 51) m),'[]'::jsonb);
end $$;

create or replace function public.social_snapshot() returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare who uuid:=public.social_identity(); friends jsonb; threads jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.nickname,'avatar_preset',p.avatar_preset,'avatar_file_id',p.avatar_file_id,
    'state',l.state,'incoming',l.requested_by<>who) order by p.nickname),'[]'::jsonb) into friends
    from public.social_links l join public.profiles p on p.id=case when l.account_a=who then l.account_b else l.account_a end where who in (l.account_a,l.account_b);
  select coalesce(jsonb_agg(jsonb_build_object('peerId',p.id,'name',p.nickname,'avatar_preset',p.avatar_preset,'avatar_file_id',p.avatar_file_id,
    'last',public.social_message_payload(last),
    'unread',(select count(*) from public.social_messages m where m.account_a=t.account_a and m.account_b=t.account_b
      and m.sender_id<>who and m.created_at>case when who=t.account_a then t.read_a else t.read_b end)) order by last.created_at desc),'[]'::jsonb) into threads
    from public.social_threads t join public.profiles p on p.id=case when t.account_a=who then t.account_b else t.account_a end
    join lateral (select * from public.social_messages m where m.account_a=t.account_a and m.account_b=t.account_b order by m.created_at desc,m.id desc limit 1) last on true
    where who in (t.account_a,t.account_b);
  return jsonb_build_object('friends',friends,'threads',threads);
end $$;

-- No friendship/role test here: old conversations remain readable after removing a
-- friend. The recorded sender and recipient are the only possible viewers.
create or replace function public.direct_file_access(p_file uuid,p_account uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.chat_files f where f.id=p_file and f.kind='direct' and f.state='ready'
    and (f.owner_id=p_account or (f.direct_peer_id=p_account and exists(select 1 from public.social_messages m
      where m.attachment_id=f.id and m.sender_id=f.owner_id and m.account_a=least(f.owner_id,f.direct_peer_id)
      and m.account_b=greatest(f.owner_id,f.direct_peer_id)))));
$$;
revoke all on function public.reserve_direct_file(uuid,uuid,text,text,bigint,text,uuid),public.direct_file_access(uuid,uuid) from public,anon,authenticated;
grant execute on function public.reserve_direct_file(uuid,uuid,text,text,bigint,text,uuid),public.direct_file_access(uuid,uuid) to service_role;
revoke all on function public.social_message_payload(public.social_messages),public.social_send_message(uuid,uuid,text,text,uuid) from public,anon,authenticated;
revoke all on function public.social_attachment_target(uuid),public.social_send_attachment(uuid,uuid,text,uuid) from public,anon;
grant execute on function public.social_attachment_target(uuid),public.social_send_attachment(uuid,uuid,text,uuid) to authenticated;
-- The existing send/read/snapshot grants remain unchanged by CREATE OR REPLACE.
notify pgrst,'reload schema';
commit;
