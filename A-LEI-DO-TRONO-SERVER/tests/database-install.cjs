'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const { readInstallation } = require('../scripts/prepare-database.cjs');
const directory = path.resolve('supabase');
const bootstrap = `create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth;
  create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb);
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  grant usage on schema auth to authenticated,service_role;
  grant execute on function auth.uid() to authenticated,service_role;`;

test('fresh installation has one complete ordered source list and the SQL-editor output contains no psql directives', () => {
  const installation = readInstallation();
  const inventory = [
    ...fs.readdirSync(directory).filter((file) => file.endsWith('.sql') && file !== 'install.sql'),
    ...fs
      .readdirSync(path.join(directory, 'migrations'))
      .filter((file) => file.endsWith('.sql'))
      .map((file) => 'migrations/' + file),
  ];
  assert.deepEqual([...installation.files].sort(), inventory.sort());
  assert.equal(new Set(installation.files).size, installation.files.length);
  assert.equal(installation.files[0], 'schema.sql');
  assert.doesNotMatch(installation.sql, /^\\/m);
  assert.match(
    fs.readFileSync(path.join(directory, 'install.sql'), 'utf8'),
    /^\\set ON_ERROR_STOP on$/m,
  );
});

test(
  'complete fresh SQL installs with RLS and private RPCs and refuses to overwrite existing application data',
  { timeout: 30000 },
  async (t) => {
    const db = new PGlite(),
      { sql } = readInstallation();
    const creator = '10000000-0000-4000-8000-000000000001',
      member = '10000000-0000-4000-8000-000000000002';
    try {
      await assert.rejects(db.exec(sql), /SUPABASE_AUTH_REQUIRED/);
      await db.exec(bootstrap);
      await db.exec(sql);
      await t.test(
        'all application tables enable RLS and privileged functions retain a fixed search path',
        async () => {
          const tables = (
            await db.query(
              "select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' order by c.relname",
            )
          ).rows;
          assert.equal(tables.length, 13);
          assert(
            tables.every((table) => table.relrowsecurity),
            JSON.stringify(tables),
          );
          const functions = (
            await db.query(
              "select p.proname,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.prosecdef",
            )
          ).rows;
          assert(functions.length > 10);
          assert(
            functions.every((fn) =>
              fn.proconfig?.some((setting) => setting.startsWith('search_path=')),
            ),
            JSON.stringify(functions),
          );
        },
      );
      for (const [id, email, nickname] of [
        [creator, 'jonathapereira.jj@gmail.com', 'Criador'],
        [member, 'fresh-member@example.test', 'Membro'],
      ])
        await db.query('insert into auth.users values($1,$2,now(),$3)', [
          id,
          email,
          JSON.stringify({ nickname, community_role: 'creator' }),
        ]);
      const as = async (id, role = 'authenticated') => {
        await db.exec('reset role');
        await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id || '']);
        await db.exec('set role ' + role);
      };
      await t.test(
        'member RLS and creator email directory keep their boundaries after every SQL source is installed',
        async () => {
          await as(member);
          assert.deepEqual((await db.query('select id from public.profiles')).rows, [
            { id: member },
          ]);
          assert.equal(
            (await db.query('select public.community_role() role')).rows[0].role,
            'member',
          );
          await assert.rejects(
            db.query('select * from public.creator_registered_accounts(0)'),
            /FORBIDDEN/,
          );
          await assert.rejects(
            db.query('select public.community_set_role($1,$2)', [member, 'admin']),
            /FORBIDDEN/,
          );
          for (const table of [
            'chat_files',
            'mobile_push_devices',
            'chat_messages',
            'social_links',
            'social_threads',
            'social_messages',
            'azul_scores',
            'splendor_scores',
          ])
            await assert.rejects(db.query('select * from public.' + table), /permission denied/);
          const profile = (
          await db.query('select public.read_member_profile($1) profile', [creator])
          ).rows[0].profile;
          assert.equal(profile.nickname, 'Criador');
          assert.equal('email' in profile, false);
          await as(creator);
          const accounts = (await db.query('select * from public.creator_registered_accounts(0)'))
            .rows;
          assert.equal(accounts.length, 2);
          assert(accounts.some((account) => account.email === 'fresh-member@example.test'));
        },
      );
      await t.test(
        'service history works while anonymous and member sessions cannot call its privileged RPC',
        async () => {
          const id = '30000000-0000-4000-8000-000000000001',
            message = { id, roomId: 'chat-livre', text: 'Instalação nova', accountId: member };
          await as(null, 'service_role');
          await db.query('select public.chat_history_append($1,$2,$3,$4)', [
            id,
            message.roomId,
            member,
            message,
          ]);
          assert.deepEqual(
            (await db.query('select * from public.chat_history_read($1)', [message.roomId])).rows[0]
              .message,
            message,
          );
          for (const [account, role] of [
            [null, 'anon'],
            [member, 'authenticated'],
          ]) {
            await as(account, role);
            await assert.rejects(
              db.query('select * from public.chat_history_read($1)', [message.roomId]),
              /permission denied/,
            );
          }
        },
      );
      await t.test(
        'rerunning the fresh installer stops before changing profiles or messages',
        async () => {
          await db.exec('reset role');
          await assert.rejects(db.exec(sql), /APPLICATION_ALREADY_INSTALLED/);
          assert.equal(
            (await db.query('select count(*)::int total from public.profiles')).rows[0].total,
            2,
          );
          assert.equal(
            (await db.query('select count(*)::int total from public.chat_messages')).rows[0].total,
            1,
          );
        },
      );
    } finally {
      await db.close();
    }
  },
);
