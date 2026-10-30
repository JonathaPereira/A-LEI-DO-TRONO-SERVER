-- Additive upgrade. Native push tokens are private and accessible only to the backend service role.
begin;
create table if not exists public.mobile_push_devices (
  id text primary key check (id ~ '^[a-f0-9]{64}$'),
  account_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid not null,
  token text not null check (length(token) between 20 and 4096),
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.mobile_push_devices enable row level security;
revoke all on public.mobile_push_devices from anon, authenticated;
grant select, insert, update, delete on public.mobile_push_devices to service_role;
create index if not exists mobile_push_devices_account on public.mobile_push_devices(account_id);
create or replace function public.register_mobile_push(p_id text, p_account uuid, p_device uuid, p_token text, p_enabled boolean)
returns void language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  -- A stable FCM token identifies the delivery endpoint. Its account changes only on authenticated registration.
  delete from public.mobile_push_devices where account_id=p_account and device_id=p_device and id<>p_id;
  insert into public.mobile_push_devices(id,account_id,device_id,token,enabled)
    values(p_id,p_account,p_device,p_token,p_enabled)
    on conflict(id) do update set account_id=excluded.account_id,device_id=excluded.device_id,
      token=excluded.token,enabled=excluded.enabled,updated_at=now();
end;
$$;
revoke all on function public.register_mobile_push(text,uuid,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.register_mobile_push(text,uuid,uuid,text,boolean) to service_role;
commit;
