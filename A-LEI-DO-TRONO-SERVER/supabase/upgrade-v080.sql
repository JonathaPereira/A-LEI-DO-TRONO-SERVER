-- Execute after upgrade-v079.sql. Preserves existing accounts and files.
begin;
create or replace function public.chat_member_directory()
returns table(id uuid,nickname text,avatar_preset text,avatar_file_id uuid)
language sql security definer set search_path='' as $$
  select p.id,p.nickname,p.avatar_preset,p.avatar_file_id
  from public.profiles p join auth.users u on u.id=p.id
  where u.email_confirmed_at is not null
  order by lower(p.nickname),p.id limit 1000;
$$;
revoke all on function public.chat_member_directory() from public,anon,authenticated;
grant execute on function public.chat_member_directory() to service_role;
commit;
