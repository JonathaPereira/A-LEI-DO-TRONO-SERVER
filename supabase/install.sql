-- Fresh Supabase application schema only. Never use this entry to upgrade an existing installation.
-- Auth infrastructure is supplied by Supabase; application SQL remains in its original files.
\set ON_ERROR_STOP on

do $$
begin
  if to_regclass('auth.users') is null or
     (select count(*) from pg_roles where rolname in ('anon','authenticated','service_role')) <> 3 then
    raise exception 'SUPABASE_AUTH_REQUIRED: initialize Supabase Auth before installing application SQL';
  end if;
  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname in (
      'profiles','chat_files','community_channels','chat_messages',
      'social_links','social_threads','social_messages','azul_matches','azul_scores',
      'splendor_matches','splendor_scores','profile_customizations'
    )
  ) then
    raise exception 'APPLICATION_ALREADY_INSTALLED: use individual upgrades for existing databases';
  end if;
end;
$$;

\ir schema.sql
\ir upgrade-v079.sql
\ir upgrade-v080.sql
\ir upgrade-community.sql
\ir upgrade-social.sql
\ir upgrade-azul.sql
\ir upgrade-splendor.sql
\ir upgrade-chat-history.sql
\ir upgrade-chat-moderation.sql
\ir upgrade-direct-attachments.sql
\ir migrations/20261015145458_member_profiles.sql
\ir migrations/20261015194333_profile_media_controls.sql
\ir migrations/20261016140000_giphy_profile_credits.sql
