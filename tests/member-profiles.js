'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite'),{cleanProfile}=require('../profile-customization'),{permissions}=require('../roles');
const data=()=>cleanProfile({handle:'jonatha',bio:'Música e jogos',tags:['Jogos','Música'],links:[{label:'YouTube',url:'https://youtube.com/@jonatha'}]});
test('profile inputs reject executable links, forged media ids and appearance values',()=>{
 for(const v of [{links:[{label:'x',url:'javascript:alert(1)'}]},{cover_file_id:'not-an-id'},{darkness:NaN},{tags:Array(13).fill('Jogos')},{handle:'bad handle'},{opacity:10},{links:[{label:'x',url:'https://user:password@example.test/'}]}])assert.throws(()=>cleanProfile(v));
 assert.equal(permissions('creator').viewEmails,true);assert.equal(permissions('admin').viewEmails,false);assert.equal(permissions('member').viewEmails,false);
});
test('persistent profiles are atomic; creator emails remain private across authenticated roles and direct RPCs',async()=>{
 const db=new PGlite(),a='10000000-0000-4000-8000-000000000001',b='10000000-0000-4000-8000-000000000002',c='10000000-0000-4000-8000-000000000003',g='20000000-0000-4000-8000-000000000001';
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,service_role;grant execute on function auth.uid() to authenticated,service_role;`);
  for(const name of ['schema.sql','upgrade-v079.sql','upgrade-v080.sql','upgrade-community.sql','upgrade-social.sql','upgrade-direct-attachments.sql'])await db.exec(fs.readFileSync(path.join(__dirname,'../supabase',name),'utf8'));
  for(const [id,name,email]of [[a,'Dono','jonathapereira.jj@gmail.com'],[b,'Membro','member@example.test'],[c,'Admin','admin@example.test']])await db.query('insert into auth.users values($1,$2,now(),$3)',[id,email,JSON.stringify({nickname:name})]);
  await db.query("update public.profiles set community_role='admin' where id=$1",[c]);
  const migration=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261015145458_member_profiles.sql'),'utf8');await db.exec(migration);
  await db.query("insert into public.chat_files(id,owner_id,object_key,name,bytes,mime,kind,state) values($1,$2,'avatar/gif','animated.gif',500,'image/gif','avatar','ready')",[g,b]);
  async function as(id,role='authenticated'){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);await db.exec('set role '+role);}
  const save=(name,preset,file,d)=>db.query('select public.save_member_profile($1,$2,$3,$4)',[name,preset,file,d]);
  await as(b);await save('Membro','crown',g,{...data(),cover_file_id:g,background_file_id:g});
  const first=(await db.query('select public.read_member_profile($1) value',[b])).rows[0].value;assert.equal(first.personalization.bio,'Música e jogos');assert.equal(first.avatar_file_id,g);assert(!JSON.stringify(first).includes('@example.test'));
  await assert.rejects(db.query('select * from public.creator_registered_accounts(0)'),/FORBIDDEN/);
  await assert.rejects(db.query('select * from private.creator_registered_accounts(0)'),/FORBIDDEN/);
  await assert.rejects(save('Mudou','crown',g,{...data(),links:[{label:'x',url:'javascript:alert(1)'}]}),/INVALID_PROFILE/);
  assert.equal((await db.query('select nickname from public.profiles where id=$1',[b])).rows[0].nickname,'Membro');
  await as(c);await assert.rejects(db.query('select * from public.creator_registered_accounts(0)'),/FORBIDDEN/);
  await assert.rejects(save('Admin','crown',null,data()),/HANDLE_TAKEN/);
  await assert.rejects(save('Admin','crown',null,{...data(),handle:'admin',cover_file_id:g}),/INVALID_PROFILE_MEDIA/);
  assert.deepEqual((await db.query('select * from public.profile_customizations')).rows,[]);
  await as(a);const accounts=(await db.query('select * from public.creator_registered_accounts(0)')).rows;assert.equal(accounts.length,3);assert.equal(accounts.find(x=>x.id===b).email,'member@example.test');assert(!JSON.stringify(accounts).includes('password'));
  await as(b,'service_role');await assert.rejects(db.query('select public.mark_chat_file_deleting($1,$2)',[g,b]),/AVATAR_IN_USE/);
  await as('', 'anon');await assert.rejects(db.query('select public.read_member_profile($1)',[b]),/permission denied/);await assert.rejects(db.query('select * from public.creator_registered_accounts(0)'),/permission denied/);
  await as('');await assert.rejects(db.query('select public.read_member_profile($1)',[b]),/AUTH_REQUIRED/);
  await db.exec('reset role');await db.query('update auth.users set email_confirmed_at=null where id=$1',[a]);await as(a);await assert.rejects(db.query('select * from public.creator_registered_accounts(0)'),/FORBIDDEN/);
 }finally{await db.close();}
});
