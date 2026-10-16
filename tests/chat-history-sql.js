'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');
const {createChatHistory}=require('../server/chat-history');
test('persistent chat SQL: ordering, pagination, replay, attachment deletion, channel isolation and private permissions',async()=>{
  const db=new PGlite(),account='10000000-0000-4000-8000-000000000001',attachment='20000000-0000-4000-8000-000000000001';
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,service_role;grant execute on function auth.uid() to authenticated,service_role;`);
    for(const file of ['schema.sql','upgrade-v079.sql','upgrade-v080.sql','upgrade-community.sql','upgrade-chat-history.sql'])await db.exec(fs.readFileSync(path.join(__dirname,'../supabase',file),'utf8'));
    await db.query('insert into auth.users values($1,$2,now(),$3)',[account,'membro@example.test',JSON.stringify({nickname:'Membro'})]);
    async function fetchImpl(url,options){const args=JSON.parse(options.body),name=new URL(url).pathname.split('/').at(-1);await db.exec('set role service_role');try{if(name==='chat_history_append'){await db.query('select public.chat_history_append($1,$2,$3,$4)',[args.p_id,args.p_room,args.p_sender,args.p_message]);return new Response(null,{status:204});}const {rows}=await db.query('select * from public.chat_history_read($1,$2,$3)',[args.p_room,args.p_before,args.p_limit]);return Response.json(rows);}catch{return Response.json({},{status:400});}finally{await db.exec('reset role');}}
    const settings={auth:{configured:true,required:true},env:{SUPABASE_URL:'https://example.test',SUPABASE_SECRET_KEY:'sb_secret_test'},fetchImpl},store=createChatHistory(settings),room={id:'chat-livre',kind:'chat',channelType:'mixed',chatHistory:[]};
    // Millisecond timestamps can tie in PGlite. Ordered fixture IDs keep the expected
    // sequence deterministic while the independent tie case below tests UUID ordering.
    const fixtureId=i=>'30000000-0000-4000-8000-'+i.toString(16).padStart(12,'0');
    const messages=[];for(let i=0;i<55;i++){const message={id:fixtureId(i),roomId:room.id,text:'Mensagem '+i,accountId:account,attachment:null};messages.push(message);await store.append(room,message,account);}
    const latest=await store.read(room);assert.equal(latest.messages.length,50);assert.equal(latest.messages[0].text,'Mensagem 5');assert.equal(latest.messages.at(-1).text,'Mensagem 54');assert(latest.hasMore);
    const older=await store.read(room,latest.before);assert.equal(older.messages.length,5);assert.equal(older.messages[0].text,'Mensagem 0');assert(!older.hasMore);
    const foreign={...room,id:'chat-jogos'};assert.equal((await store.read(foreign)).messages.length,0);assert.equal((await store.read(foreign,latest.before)).messages.length,0);
    await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/upgrade-chat-history.sql'),'utf8'));const replacement=createChatHistory(settings);assert.deepEqual((await replacement.read(room)).messages,latest.messages,'fresh backend store and repeat migration must preserve history');
    // Insert out of UUID order, then force a timestamp tie to verify the SQL cursor.
    const ties=[82,80,81].map(i=>({id:fixtureId(i),roomId:foreign.id,text:'Empate '+i}));
    for(const message of ties)await store.append(foreign,message,account);
    await db.query("update public.chat_messages set created_at='2026-01-01T00:00:00Z' where room_id=$1",[foreign.id]);
    const tied=await store.read(foreign);assert.deepEqual(tied.messages.map(m=>m.id),[80,81,82].map(fixtureId));
    assert.deepEqual((await store.read(foreign,fixtureId(82))).messages.map(m=>m.id),[80,81].map(fixtureId));
    for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(db.query('select * from public.chat_messages'),/permission denied/);await assert.rejects(db.query('select * from public.chat_history_read($1)',[room.id]),/permission denied/);await assert.rejects(db.query('select public.chat_history_append($1,$2,$3,$4)',[crypto.randomUUID(),room.id,account,messages[0]]),/permission denied/);await db.exec('reset role');}
    await assert.rejects(db.query('insert into public.chat_messages(id,room_id,message) values($1,$2,$3)',[crypto.randomUUID(),room.id,{}]),/chat_message_shape/);
    await db.query('select public.reserve_chat_file($1,$2,$3,$4,$5,$6,$7,$8)',[attachment,account,'chat/test','Foto',68,'image/png','chat',room.id]);await db.query("update public.chat_files set state='ready' where id=$1",[attachment]);
    const photo={id:crypto.randomUUID(),roomId:room.id,text:'Uma foto',attachment:{id:attachment,name:'Foto.png'}};await store.append(room,photo,account);assert(!((await store.read(room)).messages.at(-1).attachment.deleted));
    await db.query('delete from public.chat_files where id=$1',[attachment]);assert.equal((await store.read(room)).messages.at(-1).attachment.deleted,true);
    await db.query('update public.community_channels set deleted_at=now() where id=$1',[room.id]);assert.equal((await store.read(room)).messages.length,0);await assert.rejects(store.append(room,{...messages[0],id:crypto.randomUUID()},account),{code:'CHAT_HISTORY_UNAVAILABLE'});
  }finally{await db.close();}
});
test('void RPC accepts empty confirmations; failed writes and invalid history still fail closed',async()=>{
  const room={id:'chat-livre',kind:'chat',channelType:'mixed'},message={id:crypto.randomUUID(),roomId:room.id,text:'Confirmada'};
  let response;const store=createChatHistory({auth:{configured:true,required:true},env:{SUPABASE_URL:'https://fixture.test',SUPABASE_SECRET_KEY:'sb_secret_test'},fetchImpl:async()=>response});
  for(const status of [204,200]){response=new Response(null,{status});await store.append(room,message,'account');assert.equal(store.health().ready,true);}
  response=Response.json(null);await store.append(room,message,'account');
  response=Response.json({message:'Internal database error'},{status:503});await assert.rejects(store.append(room,message,'account'),{code:'CHAT_HISTORY_UNAVAILABLE'});assert.equal(store.health().ready,false);
  for(const result of [null,{},[{message:{id:message.id,roomId:'other'}}]]){response=Response.json(result);await assert.rejects(store.read(room),{code:'CHAT_HISTORY_UNAVAILABLE'});}
  response=new Response(null,{status:204});await assert.rejects(store.read(room),{code:'CHAT_HISTORY_UNAVAILABLE'});
});
