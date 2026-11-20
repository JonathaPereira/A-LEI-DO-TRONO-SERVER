'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
test('database permissions, persistent channels, protected creator, sound duration and repeatable migration',async()=>{
  const db=new PGlite();
  const owner='10000000-0000-4000-8000-000000000001',admin='10000000-0000-4000-8000-000000000002',member='10000000-0000-4000-8000-000000000003';
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
      create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to authenticated,service_role;grant execute on function auth.uid() to authenticated,service_role;`);
    for(const file of ['schema.sql','upgrade-v079.sql','upgrade-v080.sql','upgrade-community.sql'])await db.exec(fs.readFileSync(path.join(__dirname,'../supabase',file),'utf8'));
    for(const [id,email,nickname]of [[owner,'JonathaPereira.JJ@gmail.com','Dono'],[admin,'admin@example.test','Admin'],[member,'membro@example.test','Membro']])await db.query('insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,now(),$3)',[id,email,JSON.stringify({nickname})]);
    async function as(id,role='authenticated'){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);await db.exec('set role '+role);}
    await as(member);assert.equal((await db.query('select public.community_role() role')).rows[0].role,'member');
    await assert.rejects(db.query('select public.community_set_role($1,$2)',[member,'admin']),/FORBIDDEN/);
    await assert.rejects(db.query('update public.profiles set community_role=$1 where id=$2',['admin',member]),/permission denied/);
    await assert.rejects(db.query('select public.community_create_channel($1,$2,$3)',['Hack','text','']),/FORBIDDEN/);
    await as(owner);assert.equal((await db.query('select public.community_role() role')).rows[0].role,'creator');
    await db.query('select public.community_set_role($1,$2)',[admin,'admin']);
    await assert.rejects(db.query('select public.community_set_role($1,$2)',[owner,'member']),/CREATOR_PROTECTED/);
    await assert.rejects(db.query('select public.community_set_role($1,$2)',[member,'creator']),/INVALID_ROLE/);
    await db.query('select public.update_chat_profile($1,$2,$3)',['Novo Dono','crown',null]);assert.equal((await db.query('select public.community_role() role')).rows[0].role,'creator');
    await as(admin);assert.equal((await db.query('select public.community_role() role')).rows[0].role,'admin');
    await assert.rejects(db.query('select public.community_set_role($1,$2)',[member,'admin']),/FORBIDDEN/);
    const channel=(await db.query('select * from public.community_create_channel($1,$2,$3)',['Imagens','text','Fotos'])).rows[0];assert.equal(channel.channel_type,'text');
    await db.query('select public.community_delete_channel($1)',[channel.id]);await db.query('select public.community_delete_channel($1)',['chat-livre']);
    await as(member);const list=(await db.query('select * from public.community_channels()')).rows;assert(!list.some(c=>c.id===channel.id||c.id==='chat-livre'));
    await assert.rejects(db.query('select public.chat_member_directory()'),/permission denied/);
    await as('', 'service_role');const directory=(await db.query('select * from public.chat_member_directory()')).rows;assert(directory.some(m=>m.id===owner&&m.role==='creator'));assert(!JSON.stringify(directory).includes('@'));
    const file='20000000-0000-4000-8000-000000000001';
    await db.query('select public.reserve_chat_file($1,$2,$3,$4,$5,$6,$7,$8)',[file,member,'soundboard/test','Som',32044,'audio/wav','soundboard',null]);
    await assert.rejects(db.query("update public.chat_files set state='ready',duration_ms=15001 where id=$1",[file]),/chat_files_sound_duration/);
    await db.query("update public.chat_files set state='ready',duration_ms=1000 where id=$1",[file]);
    await db.exec('reset role');await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/upgrade-community.sql'),'utf8'));
    await as(member);assert(!(await db.query('select * from public.community_channels()')).rows.some(c=>c.id==='chat-livre'));
    await as(owner);await db.query('select public.community_set_role($1,$2)',[admin,'member']);
    await as(admin);await assert.rejects(db.query('select public.community_create_channel($1,$2,$3)',['Revogado','voice','']),/FORBIDDEN/);
    await db.exec('reset role');await db.query('update auth.users set email=$1 where id=$2',['outro-dono@example.test',owner]);
    await as(owner);assert.equal((await db.query('select public.community_role() role')).rows[0].role,'member');
  }finally{await db.close();}
});
