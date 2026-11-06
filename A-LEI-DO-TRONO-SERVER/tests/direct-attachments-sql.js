'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');
test('private attachments enforce ownership, accepted friends, participants-only access, shared limits and durable deleted-file messages',async()=>{
  const db=new PGlite(),a='10000000-0000-4000-8000-000000000001',b='10000000-0000-4000-8000-000000000002',creator='10000000-0000-4000-8000-000000000003';
  const migration=fs.readFileSync(path.join(__dirname,'../supabase/upgrade-direct-attachments.sql'),'utf8');
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,service_role;grant execute on function auth.uid() to authenticated,service_role;`);
    for(const name of ['schema.sql','upgrade-v079.sql','upgrade-v080.sql','upgrade-community.sql','upgrade-social.sql'])await db.exec(fs.readFileSync(path.join(__dirname,'../supabase',name),'utf8'));
    for(const [id,nickname,email] of [[a,'Ana','ana@example.test'],[b,'Bruno','bruno@example.test'],[creator,'Criador','Jonathapereira.jj@gmail.com']])await db.query('insert into auth.users values($1,$2,now(),$3)',[id,email,JSON.stringify({nickname})]);
    await db.exec(migration);
    const as=async(id,role='authenticated')=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);await db.exec('set role '+role);};
    const rpc=async(name,args=[])=> (await db.query('select public.'+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') value',args)).rows[0].value;
    const reserve=async(owner,peer,bytes=8,mime='application/pdf')=>{const id=crypto.randomUUID();await rpc('reserve_direct_file',[id,owner,'direct/'+owner+'/'+id,'Anexo.pdf',bytes,mime,peer]);return id;};
    await as(a);await assert.rejects(rpc('social_attachment_target',[b]),/FRIEND_REQUIRED/);await assert.rejects(reserve(a,b),/permission denied/);
    await rpc('social_friend',[b,'request']);await as(b);await rpc('social_friend',[a,'accept']);
    await as('', 'service_role');const file=await reserve(a,b);await db.query("update public.chat_files set state='ready' where id=$1",[file]);
    assert.equal(await rpc('direct_file_access',[file,a]),true);assert.equal(await rpc('direct_file_access',[file,b]),false);assert.equal(await rpc('direct_file_access',[file,creator]),false);
    await assert.rejects(reserve(a,b,10000001),/FILE_TOO_LARGE/);await assert.rejects(reserve(a,b,100000001,'video/mp4'),/FILE_TOO_LARGE/);
    const video=await reserve(a,b,100000000,'video/mp4');await db.query('delete from public.chat_files where id=$1',[video]);
    await as(b);await assert.rejects(rpc('social_send_attachment',[a,crypto.randomUUID(),'',file]),/INVALID_ATTACHMENT/);
    await as(a);await rpc('social_friend',[creator,'request']);await as(creator);await rpc('social_friend',[a,'accept']);
    await assert.rejects(rpc('social_send_attachment',[a,crypto.randomUUID(),'',file]),/INVALID_ATTACHMENT/);
    await as(a);await assert.rejects(rpc('social_send_attachment',[creator,crypto.randomUUID(),'',file]),/INVALID_ATTACHMENT/);
    await assert.rejects(rpc('social_send_attachment',[b,crypto.randomUUID(),'x'.repeat(2001),file]),/INVALID_MESSAGE/);
    const id=crypto.randomUUID(),message=await rpc('social_send_attachment',[b,id,'',file]);assert.equal(message.attachment.id,file);assert.equal(message.text,'');assert.equal(message.attachment.deleted,false);assert(!JSON.stringify(message).includes('object_key'));
    assert.deepEqual(await rpc('social_send_attachment',[b,id,'',file]),message);await assert.rejects(rpc('social_send',[b,id,'',null]),/INVALID_MESSAGE/);await assert.rejects(rpc('social_send_attachment',[b,id,'Texto alterado',file]),/INVALID_MESSAGE/);
    await as('', 'service_role');assert.equal(await rpc('direct_file_access',[file,b]),true);assert.equal(await rpc('direct_file_access',[file,creator]),false);
    await as(creator);assert.equal((await rpc('social_snapshot')).threads.length,0);await assert.rejects(rpc('social_read',[b,null]),/FORBIDDEN/);await assert.rejects(rpc('direct_file_access',[file,creator]),/permission denied/);await assert.rejects(db.query('select * from public.chat_files'),/permission denied/);await assert.rejects(db.query('select public.social_message_payload(m) from public.social_messages m'),/permission denied/);
    await as(b);assert.equal((await rpc('social_snapshot')).threads[0].last.attachment.id,file);assert.equal((await rpc('social_read',[a,null]))[0].attachment.id,file);await rpc('social_friend',[a,'remove']);assert.equal((await rpc('social_read',[a,null]))[0].attachment.id,file);await assert.rejects(rpc('social_send_attachment',[a,crypto.randomUUID(),'',file]),/FRIEND_REQUIRED/);
    await as('', 'service_role');assert.equal(await rpc('direct_file_access',[file,b]),true);await assert.rejects(reserve(a,b),/FRIEND_REQUIRED/);
    await db.exec('reset role');await db.exec(migration);await as(b);assert.equal((await rpc('social_read',[a,null]))[0].attachment.id,file);
    await as('', 'service_role');await db.query('delete from public.chat_files where id=$1',[file]);assert.equal(await rpc('direct_file_access',[file,b]),false);
    await as(b);const tombstone=(await rpc('social_read',[a,null]))[0];assert.equal(tombstone.id,id);assert.equal(tombstone.attachment.name,'Anexo.pdf');assert.equal(tombstone.attachment.deleted,true);assert.equal((await rpc('social_snapshot')).threads[0].last.attachment.deleted,true);
    await as(a);await rpc('social_friend',[b,'request']);await as(b);await rpc('social_friend',[a,'accept']);
    await as('', 'service_role');for(let i=0;i<80;i++){const row=crypto.randomUUID();await db.query("insert into public.chat_files(id,owner_id,object_key,name,bytes,mime,kind,room_id,state) values($1,$2,$3,'Legado',100000000,'video/mp4','chat','chat-livre','ready')",[row,a,'chat/'+row]);}assert.equal(Number(await rpc('chat_storage_usage')),8000000000);await assert.rejects(reserve(a,b),/STORAGE_FULL/);
    await as('', 'anon');await assert.rejects(rpc('social_send_attachment',[b,crypto.randomUUID(),'',file]),/permission denied/);
  }finally{await db.close();}
});
