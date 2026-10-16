begin;
-- Extend profile JSON validation; ownership checks and grants are unchanged.
create or replace function private.valid_member_profile(d jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare item jsonb; field text; credit jsonb;
begin
 if jsonb_typeof(d) is distinct from 'object' or octet_length(d::text)>12000 or
 d-array['handle','bio','status','emoji','tags','links','cover_file_id','background_file_id','accent','darkness','blur','opacity','reduce_motion','cover_position','cover_zoom','media_credits'] <> '{}'::jsonb then return false; end if;
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
 -- Optional keys preserve compatibility with older app versions.
 foreach field in array array['cover_position','cover_zoom'] loop
  if d ? field then
   if jsonb_typeof(d->field) is distinct from 'number' then return false; end if;
   if (d->>field)::numeric <> trunc((d->>field)::numeric) then return false; end if;
  end if;
 end loop;
 if d ? 'cover_position' and (d->>'cover_position')::numeric not between 0 and 100 then return false; end if;
 if d ? 'cover_zoom' and (d->>'cover_zoom')::numeric not between 100 and 250 then return false; end if;
 if d ? 'media_credits' then
  if jsonb_typeof(d->'media_credits') is distinct from 'object' or (d->'media_credits')-array['avatar','cover','background'] <> '{}'::jsonb then return false; end if;
  for credit in select value from jsonb_each(d->'media_credits') loop
   if jsonb_typeof(credit) is distinct from 'object' or credit-array['title','author','license','source','license_url'] <> '{}'::jsonb then return false; end if;
   foreach field in array array['title','author','license','source','license_url'] loop
    if jsonb_typeof(credit->field) is distinct from 'string' then return false; end if;
   end loop;
   if char_length(credit->>'title')>200 or char_length(credit->>'author')>200 or char_length(credit->>'license')>80 or char_length(credit->>'source')>400 or char_length(credit->>'license_url')>400 then return false; end if;
   if credit->>'source' !~ '^https://commons[.]wikimedia[.]org/[^[:space:]]*$' then return false; end if;
   if credit->>'license_url'<>'' and credit->>'license_url' !~ '^https://[^[:space:]/@]+([/?#][^[:space:]]*)?$' then return false; end if;
  end loop;
 end if;
 return true;
exception when others then return false;
end $$;
commit;
