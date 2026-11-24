create or replace function private.creator_registered_accounts(p_offset integer default 0)
returns table(id uuid,nickname text,email text,confirmed boolean,created_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
 if public.community_role() is distinct from 'creator' then raise exception 'FORBIDDEN'; end if;
 return query select p.id,p.nickname,u.email::text,u.email_confirmed_at is not null,p.created_at from public.profiles p join auth.users u on u.id=p.id where u.email is not null order by p.created_at desc,p.id limit 50 offset greatest(0,least(1000000,p_offset));
end $$;
