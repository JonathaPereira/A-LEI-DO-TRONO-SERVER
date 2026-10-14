'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');
test('chat moderation SQL verifies confirmed creator email, isolates channels, preserves files and survives migration/restart',{timeout:30000},async()=>{
  const db=new PGlite(),creator=crypto.randomUUID(),admin=crypto.randomUUID(),member=crypto.randomUUID(),unconfirmed=crypto.randomUUID();
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,service_role;grant execute on function auth.uid() to authenticated,service_role;`);
    for(const file of ['schema.sql','upgrade-v079.sql','upgrade-v080.sql','upgrade-community.sql','upgrade-chat-history.sql','upgrade-chat-moderation.sql'])await db.exec(fs.readFileSync(path.join(__dirname,'../supabase',file),'utf8'));
    for(const [id,email,confirmed,nickname]of [[creator,'Jonathapereira.jj@gmail.com',true,'Criador'],[admin,'admin@example.test',true,'Admin'],[member,'member@example.test',true,'Membro'],[unconfirmed,' JONATHAPEREIRA.JJ@GMAIL.COM ',false,'Sem confirmação']])await db.query('insert into auth.users values($1,$2,$3,$4)',[id,email,confirmed?new Date().toISOString():null,{nickname}]);
    await db.query("update public.profiles set community_role='admin' where id=$1",[admin]);
    const first=crypto.randomUUID(),second=crypto.randomUUID(),foreign=crypto.randomUUID(),attachment=crypto.randomUUID();
    await db.query('select public.reserve_chat_file($1,$2,$3,$4,$5,$6,$7,$8)',[attachment,member,'chat/retained','Foto',68,'image/png','chat','chat-livre']);await db.query("update public.chat_files set state='ready' where id=$1",[attachment]);
    for(const [id,room,text]of [[first,'chat-livre','Primeira'],[second,'chat-livre','Segunda'],[foreign,'chat-jogos','Outro canal']])await db.query('select public.chat_history_append($1,$2,$3,$4)',[id,room,member,{id,roomId:room,text,attachment:{id:attachment}}]);
    for(const actor of [admin,member,unconfirmed,crypto.randomUUID(),null]){
      await assert.rejects(db.query('select public.chat_history_delete($1,$2,$3)',[actor,'chat-livre',first]),/FORBIDDEN/);
      await assert.rejects(db.query('select public.chat_history_clear($1,$2)',[actor,'chat-livre']),/FORBIDDEN/);
    }
    for(const role of ['anon','authenticated']){
      await db.exec('set role '+role);await assert.rejects(db.query('select public.chat_history_delete($1,$2,$3)',[creator,'chat-livre',first]),/permission denied/);await assert.rejects(db.query('select public.chat_history_clear($1,$2)',[creator,'chat-livre']),/permission denied/);await assert.rejects(db.query('delete from public.chat_messages'),/permission denied/);await db.exec('reset role');
    }
    await db.exec('set role service_role');
    assert.equal((await db.query('select public.chat_history_delete($1,$2,$3) removed',[creator,'chat-livre',foreign])).rows[0].removed,false,'foreign ID must not delete a different channel message');
    assert.equal((await db.query('select public.chat_history_delete($1,$2,$3) removed',[creator,'chat-livre',first])).rows[0].removed,true);
    assert.equal((await db.query('select public.chat_history_delete($1,$2,$3) removed',[creator,'chat-livre',first])).rows[0].removed,false,'delete is idempotent');
    assert.equal((await db.query('select public.chat_history_clear($1,$2) count',[creator,'chat-livre'])).rows[0].count,1);
    await db.exec('reset role');
    assert.equal((await db.query('select count(*)::int count from public.chat_messages')).rows[0].count,1);
    assert.equal((await db.query('select count(*)::int count from public.chat_files where id=$1',[attachment])).rows[0].count,1,'moderation removes messages, never stored gallery files');
    await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/upgrade-chat-moderation.sql'),'utf8'));
    assert.equal((await db.query('select * from public.chat_history_read($1)',['chat-livre'])).rows.length,0);
    assert.equal((await db.query('select * from public.chat_history_read($1)',['chat-jogos'])).rows[0].message.id,foreign);
    await db.query("update public.community_channels set channel_type='voice' where id='chat-livre'");await assert.rejects(db.query('select public.chat_history_clear($1,$2)',[creator,'chat-livre']),/CHANNEL_NOT_FOUND/);
    await db.query("update public.community_channels set deleted_at=now() where id='chat-jogos'");await assert.rejects(db.query('select public.chat_history_delete($1,$2,$3)',[creator,'chat-jogos',foreign]),/CHANNEL_NOT_FOUND/);
    await db.query('update auth.users set email=$1 where id=$2',['new-owner@example.test',creator]);await assert.rejects(db.query('select public.chat_history_clear($1,$2)',[creator,'chat-livre']),/FORBIDDEN/,'creator authority follows verified email, not nickname or stale profile role');
  }finally{await db.close();}
});
