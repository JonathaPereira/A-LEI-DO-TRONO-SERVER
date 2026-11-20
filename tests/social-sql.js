'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');
test('friends and private messages: account identity, membership, persistence, unread cursor, invitations and idempotent send',async()=>{
  const db=new PGlite(),a='10000000-0000-4000-8000-000000000001',b='10000000-0000-4000-8000-000000000002',c='10000000-0000-4000-8000-000000000003';
  const migration=fs.readFileSync(path.join(__dirname,'../supabase/upgrade-social.sql'),'utf8');
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,service_role;grant execute on function auth.uid() to authenticated,service_role;`);
    for(const file of ['schema.sql','upgrade-v079.sql','upgrade-v080.sql','upgrade-community.sql'])await db.exec(fs.readFileSync(path.join(__dirname,'../supabase',file),'utf8'));
    for(const [id,name]of [[a,'Ana'],[b,'Bruno'],[c,'Terceiro']])await db.query('insert into auth.users values($1,$2,now(),$3)',[id,name+'@example.test',JSON.stringify({nickname:name})]);
    await db.exec(migration);async function as(id,role='authenticated'){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);await db.exec('set role '+role);}
    const rpc=async(name,args=[])=>{const q=args.map((_,i)=>'$'+(i+1)).join(',');return (await db.query(`select public.social_${name}(${q}) value`,args)).rows[0].value;};
    await as(a);await assert.rejects(rpc('send',[b,crypto.randomUUID(),'Sem amizade',null]),/FRIEND_REQUIRED/);await assert.rejects(rpc('friend',[a,'request']),/INVALID_TARGET/);
    await rpc('friend',[b,'request']);await rpc('friend',[b,'request']);assert.equal((await rpc('snapshot')).friends.length,1);await assert.rejects(rpc('friend',[b,'accept']),/FORBIDDEN/);
    await as(c);await assert.rejects(rpc('read',[a,null]),/FORBIDDEN/);assert.deepEqual(await rpc('snapshot'),{friends:[],threads:[]});await assert.rejects(db.query('select * from public.social_messages'),/permission denied/);
    await as(b);assert.equal((await rpc('snapshot')).friends[0].incoming,true);await rpc('friend',[a,'accept']);
    await as(a);const id=crypto.randomUUID();const first=await rpc('send',[b,id,'Primeira',null]);assert.deepEqual(await rpc('send',[b,id,'Primeira',null]),first);await assert.rejects(rpc('send',[b,id,'Outra mensagem',null]),/INVALID_MESSAGE/);await rpc('friend',[c,'request']);
    await as(b);let state=await rpc('snapshot');assert.equal(state.threads[0].unread,1);await rpc('mark_read',[a,id]);assert.equal((await rpc('snapshot')).threads[0].unread,0);
    const answer=await rpc('send',[a,crypto.randomUUID(),'Resposta',null]);await as(a);assert.equal((await rpc('snapshot')).threads[0].unread,1);
    await rpc('send',[b,crypto.randomUUID(),'', 'chat-livre']);await assert.rejects(rpc('send',[b,crypto.randomUUID(),'', 'deleted-room']),/CHANNEL_NOT_FOUND/);
    await as(c);await assert.rejects(rpc('read',[b,id]),/FORBIDDEN/);await assert.rejects(rpc('mark_read',[a,id]),/INVALID_MESSAGE/);await assert.rejects(rpc('send',[a,id,'Primeira',null]),/FRIEND_REQUIRED/);
    await rpc('friend',[a,'accept']);await assert.rejects(rpc('send',[a,id,'Primeira',null]),/INVALID_MESSAGE/);await assert.rejects(rpc('read',[a,answer.id]),/INVALID_CURSOR/);
    await as(a);for(let i=0;i<53;i++)await rpc('send',[b,crypto.randomUUID(),'Mensagem '+i,null]);let page=await rpc('read',[b,null]);assert.equal(page.length,51);const older=await rpc('read',[b,page[0].id]);assert.equal(older.length,5);
    await db.exec('reset role');await db.exec(migration);await as(b);assert.equal((await rpc('read',[a,null])).length,51);await rpc('friend',[a,'remove']);await assert.rejects(rpc('send',[a,crypto.randomUUID(),'Depois de remover',null]),/FRIEND_REQUIRED/);assert.equal((await rpc('read',[a,null])).length,51);
    await db.exec('reset role');await db.query('update public.profiles set nickname=$1 where id=$2',['Nome Novo',a]);await as(b);assert.equal((await rpc('snapshot')).threads[0].name,'Nome Novo');
    await as('', 'anon');await assert.rejects(rpc('snapshot'),/permission denied/);
    await as('');await assert.rejects(rpc('snapshot'),/AUTH_REQUIRED/);
  }finally{await db.close();}
});
