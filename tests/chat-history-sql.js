'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');
const {createChatHistory}=require('../chat-history');
test('persistent chat SQL: ordering, pagination, replay, attachment deletion, channel isolation and private permissions',async()=>{
  const db=new PGlite(),account='10000000-0000-4000-8000-000000000001',attachment='20000000-0000-4000-8000-000000000001';
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,service_role;grant execute on function auth.uid() to authenticated,service_role;`);
    for(const file of ['schema.sql','upgrade-v079.sql','upgrade-v080.sql','upgrade-community.sql','upgrade-chat-history.sql'])await db.exec(fs.readFileSync(path.join(__dirname,'../supabase',file),'utf8'));
    await db.query('insert into auth.users values($1,$2,now(),$3)',[account,'membro@example.test',JSON.stringify({nickname:'Membro'})]);
    async function fetchImpl(url,options){const args=JSON.parse(options.body),name=new URL(url).pathname.split('/').at(-1);await db.exec('set role service_role');try{const rows=name==='chat_history_append'?(await db.query('select public.chat_history_append($1,$2,$3,$4)',[args.p_id,args.p_room,args.p_sender,args.p_message])).rows:(await db.query('select * from public.chat_history_read($1,$2,$3)',[args.p_room,args.p_before,args.p_limit])).rows;return {ok:true,json:async()=>rows};}catch{return {ok:false,json:async()=>({})};}finally{await db.exec('reset role');}}
    const settings={auth:{configured:true,required:true},env:{SUPABASE_URL:'https://example.test',SUPABASE_SECRET_KEY:'sb_secret_test'},fetchImpl},store=createChatHistory(settings),room={id:'chat-livre',kind:'chat',channelType:'mixed',chatHistory:[]};
    const messages=[];for(let i=0;i<55;i++){const message={id:crypto.randomUUID(),roomId:room.id,text:'Mensagem '+i,accountId:account,attachment:null};messages.push(message);await store.append(room,message,account);}
    const latest=await store.read(room);assert.equal(latest.messages.length,50);assert.equal(latest.messages[0].text,'Mensagem 5');assert.equal(latest.messages.at(-1).text,'Mensagem 54');assert(latest.hasMore);
    const older=await store.read(room,latest.before);assert.equal(older.messages.length,5);assert.equal(older.messages[0].text,'Mensagem 0');assert(!older.hasMore);
    const foreign={...room,id:'chat-jogos'};assert.equal((await store.read(foreign)).messages.length,0);assert.equal((await store.read(foreign,latest.before)).messages.length,0);
    await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/upgrade-chat-history.sql'),'utf8'));const replacement=createChatHistory(settings);assert.deepEqual((await replacement.read(room)).messages,latest.messages,'fresh backend store and repeat migration must preserve history');
    for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(db.query('select * from public.chat_messages'),/permission denied/);await assert.rejects(db.query('select * from public.chat_history_read($1)',[room.id]),/permission denied/);await assert.rejects(db.query('select public.chat_history_append($1,$2,$3,$4)',[crypto.randomUUID(),room.id,account,messages[0]]),/permission denied/);await db.exec('reset role');}
    await assert.rejects(db.query('insert into public.chat_messages(id,room_id,message) values($1,$2,$3)',[crypto.randomUUID(),room.id,{}]),/chat_message_shape/);
    await db.query('select public.reserve_chat_file($1,$2,$3,$4,$5,$6,$7,$8)',[attachment,account,'chat/test','Foto',68,'image/png','chat',room.id]);await db.query("update public.chat_files set state='ready' where id=$1",[attachment]);
    const photo={id:crypto.randomUUID(),roomId:room.id,text:'Uma foto',attachment:{id:attachment,name:'Foto.png'}};await store.append(room,photo,account);assert(!((await store.read(room)).messages.at(-1).attachment.deleted));
    await db.query('delete from public.chat_files where id=$1',[attachment]);assert.equal((await store.read(room)).messages.at(-1).attachment.deleted,true);
    await db.query('update public.community_channels set deleted_at=now() where id=$1',[room.id]);assert.equal((await store.read(room)).messages.length,0);await assert.rejects(store.append(room,{...messages[0],id:crypto.randomUUID()},account),{code:'CHAT_HISTORY_UNAVAILABLE'});
  }finally{await db.close();}
});
