'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const {createCommunityManagement}=require('../server/community-management.ts');
test('GIPHY client configuration requires authentication, respects origins and exposes no service credentials',async()=>{
 const env={},auth={configured:false,allowedOrigins:new Set(['https://app.example.test']),tokenFrom:req=>req.headers.authorization,identity:async token=>{if(token!=='Bearer fixture-session')throw Object.assign(Error('Entre na conta'),{status:401});return {id:'member',role:'member'};}},management=createCommunityManagement({auth,rooms:new Map(),env}),app=express();management.install(app,express);app.get('/health',(req,res)=>res.json(management.health()));const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));}),base='http://127.0.0.1:'+server.address().port;
 try{
  assert.equal((await fetch(base+'/community/gif-provider')).status,401);
  const headers={Authorization:'Bearer fixture-session',Origin:'https://app.example.test'};
  assert.deepEqual(await(await fetch(base+'/community/gif-provider',{headers})).json(),{provider:'giphy',configured:false});
  env.GIPHY_API_KEY='fixture-client-key';env.SUPABASE_SERVICE_ROLE_KEY='fixture-private-service-key';
  const res=await fetch(base+'/community/gif-provider',{headers});assert.equal(res.headers.get('cache-control'),'no-store');assert.equal(res.headers.get('access-control-allow-origin'),headers.Origin);assert.deepEqual(await res.json(),{provider:'giphy',configured:true,apiKey:'fixture-client-key'});
  assert.equal((await fetch(base+'/community/gif-provider',{headers:{...headers,Origin:'https://evil.test'}})).status,403);
  assert(!(await(await fetch(base+'/health')).text()).includes('fixture-'));
  env.GIPHY_API_KEY='invalid key';assert.equal((await(await fetch(base+'/community/gif-provider',{headers})).json()).configured,false);
 }finally{management.stop();await new Promise(r=>server.close(r));}
});
