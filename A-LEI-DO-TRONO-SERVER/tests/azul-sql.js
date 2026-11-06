'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{PGlite}=require('@electric-sql/pglite'),crypto=require('node:crypto');
test('Azul records survive migration, are service-only, transactional/idempotent, keep five distinct current identities',{timeout:30000},async()=>{
 const db=new PGlite(),migration=fs.readFileSync('supabase/upgrade-azul.sql','utf8'),ids=Array.from({length:7},()=>crypto.randomUUID()),match=()=>crypto.randomUUID();
 try{
  await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email_confirmed_at timestamptz);create table public.profiles(id uuid primary key references auth.users(id),nickname text);grant usage on schema public to anon,authenticated,service_role;");
  for(let i=0;i<ids.length;i++){await db.query('insert into auth.users values($1,now())',[ids[i]]);await db.query('insert into public.profiles values($1,$2)',[ids[i],'Jogador '+i]);}await db.exec(migration);
  const record=(m,players,rounds=5,mode='online')=>db.query('select public.azul_record_match($1,$2,$3,$4)',[m,rounds,mode,JSON.stringify(players)]),top=async()=>(await db.query('select public.azul_top_five() value')).rows[0].value;
  for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(record(match(),[{id:ids[0],score:999,rows:1}]),/permission denied/);await assert.rejects(top(),/permission denied/);await assert.rejects(db.query('select * from public.azul_scores'),/permission denied/);await db.exec('reset role');}
  await db.exec('set role service_role');assert.deepEqual(await top(),[]);const m=match(),payload=[{id:ids[0],score:50,rows:1},{id:ids[1],score:70,rows:2}];await record(m,payload);await record(m,[...payload].reverse());await assert.rejects(record(m,[{id:ids[0],score:999,rows:1}]),/RESULT_CONFLICT/);
  for(let i=0;i<7;i++)await record(match(),[{id:ids[i],score:80+i,rows:1}],5,i%2?'bots':'online');await record(match(),[{id:ids[6],score:90,rows:1}]);let rows=await top();assert.equal(rows.length,5);assert.equal(new Set(rows.map(r=>r.playerId)).size,5);assert.equal(rows[0].score,90);assert.equal(rows[0].playerId,ids[6]);
  await db.exec('reset role');await db.query('update public.profiles set nickname=$1 where id=$2',['Novo apelido',ids[6]]);await db.exec(migration);await db.exec('set role service_role');assert.equal((await top())[0].name,'Novo apelido');assert.equal((await top())[0].score,90);
  await assert.rejects(record(match(),[{id:ids[0],score:40,rows:1},{id:crypto.randomUUID(),score:999,rows:1}]),/INVALID_RESULT/);await assert.rejects(record(match(),[{id:ids[0],score:40,rows:1},{id:ids[0],score:50,rows:1}]),/INVALID_RESULT/);await assert.rejects(record(match(),[],5),/INVALID_RESULT/);await assert.rejects(record(match(),[{id:ids[0],score:1001,rows:1}]),/check constraint/);
  await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from public.azul_matches')).rows[0].n,9);assert.equal((await db.query('select count(*)::int n from public.azul_scores')).rows[0].n,10);
 }finally{await db.close();}
});
