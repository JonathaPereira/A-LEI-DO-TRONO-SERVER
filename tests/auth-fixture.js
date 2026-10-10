'use strict';
// TEST ONLY: fake Supabase contracts, no connection to a user's Supabase project.
const http=require('http'),crypto=require('crypto'),path=require('path'),{spawn}=require('child_process');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function startFixture({appOrigin='http://127.0.0.1:18880',port=10280,required=true,realtime=false,soundboard=false}={}){
  const users=new Map(),access=new Map(),refresh=new Map(),links=new Map(),chatMessages=new Map(),historyState={fail:false};let backend;
  const channels=new Map([['chat-livre','Geral'],['chat-jogos','Jogos'],['chat-conversa','Conversa']].map(([id,name])=>[id,{id,name,description:'',channel_type:'mixed'}]));
  const role=u=>u.email_confirmed_at&&u.email.toLowerCase()==='jonathapereira.jj@gmail.com'?'creator':u.community_role||'member';
  const soundId='30000000-0000-4000-8000-000000000001';
  const secret=crypto.randomBytes(32);
  function createSession(user){const sid=crypto.randomUUID(),claims={sub:user.id,exp:Math.floor(Date.now()/1000)+3600,session_id:sid};const data=Buffer.from(JSON.stringify(claims)).toString('base64url');const head=Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url');const token=`${head}.${data}.${crypto.createHmac('sha256',secret).update(`${head}.${data}`).digest('base64url')}`;const rt=crypto.randomBytes(32).toString('hex');access.set(token,{user,sid});refresh.set(rt,{user,sid});return {access_token:token,refresh_token:rt,expires_in:3600,user};}
  const provider=http.createServer(async(req,res)=>{
    let body={};try{let raw='';for await(const chunk of req)raw+=chunk;body=raw?JSON.parse(raw):{};}catch{res.writeHead(400);res.end('{}');return;}
    const url=new URL(req.url,'http://test'),token=(req.headers.authorization||'').replace(/^Bearer /,''),record=access.get(token);
    const reply=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
    const fail=(code,status=400)=>reply(status,{error_code:code});
    if(url.pathname==='/auth/v1/signup'){
      if(users.has(body.email))return reply(200,{id:crypto.randomUUID(),identities:[]});
      if([...users.values()].some(u=>u.nickname.toLowerCase()===body.data.nickname.toLowerCase()))return fail('unexpected_failure',500);
      const u={id:crypto.randomUUID(),email:body.email,nickname:body.data.nickname,password:body.password,email_confirmed_at:null};users.set(u.email,u);const hash=crypto.randomBytes(24).toString('hex');links.set(hash,{user:u,type:'signup'});return reply(200,{id:u.id,email:u.email});
    }
    if(url.pathname==='/auth/v1/token'&&url.searchParams.get('grant_type')==='password'){
      const u=users.get(body.email);if(!u||u.password!==body.password)return fail('invalid_credentials',400);if(!u.email_confirmed_at)return fail('email_not_confirmed',400);return reply(200,createSession(u));
    }
    if(url.pathname==='/auth/v1/token'&&url.searchParams.get('grant_type')==='refresh_token'){
      const r=refresh.get(body.refresh_token);if(!r)return fail('refresh_token_not_found',401);refresh.delete(body.refresh_token);return reply(200,createSession(r.user));
    }
    if(url.pathname==='/auth/v1/recover'){
      const u=users.get(body.email);if(u){const hash=crypto.randomBytes(24).toString('hex');links.set(hash,{user:u,type:'recovery'});}return reply(200,{});
    }
    if(url.pathname==='/auth/v1/verify'){
      const link=links.get(body.token_hash);if(!link||link.type!==body.type)return fail('otp_expired',403);links.delete(body.token_hash);link.user.email_confirmed_at=new Date().toISOString();return reply(200,createSession(link.user));
    }
    if(url.pathname==='/auth/v1/user'){
      if(!record)return fail('bad_jwt',401);if(req.method==='PUT'){record.user.password=body.password;return reply(200,{id:record.user.id});}
      return reply(200,{id:record.user.id,email:record.user.email,email_confirmed_at:record.user.email_confirmed_at,user_metadata:{nickname:'NOME_METADATA_NAO_CONFIAVEL'}});
    }
    if(url.pathname==='/rest/v1/profiles'){
      if(!record)return fail('bad_jwt',401);return reply(200,[{id:record.user.id,nickname:record.user.nickname,community_role:record.user.community_role||'member',avatar_preset:record.user.avatar_preset||'crown',avatar_file_id:record.user.avatar_file_id||null}]);
    }
    if(url.pathname==='/rest/v1/rpc/chat_member_directory'){
      if(req.headers.apikey!=='sb_secret_fixture_only')return fail('permission_denied',403);
      return reply(200,[...users.values()].filter(u=>u.email_confirmed_at).map(u=>({id:u.id,nickname:u.nickname,role:role(u),avatar_preset:u.avatar_preset||'crown',avatar_file_id:u.avatar_file_id||null})));
    }
    if(url.pathname==='/rest/v1/rpc/community_channels'){
      if(!record&&req.headers.apikey!=='sb_secret_fixture_only')return fail('bad_jwt',401);
      return reply(200,[...channels.values()].filter(c=>!c.deleted_at));
    }
    if(url.pathname==='/rest/v1/rpc/community_set_role'){
      if(!record||role(record.user)!=='creator')return reply(403,{message:'FORBIDDEN'});
      const target=[...users.values()].find(u=>u.id===body.p_user&&u.email_confirmed_at);
      if(!target)return reply(404,{message:'MEMBER_NOT_FOUND'});
      if(role(target)==='creator')return reply(403,{message:'CREATOR_PROTECTED'});
      target.community_role=body.p_role;return reply(200,null);
    }
    if(url.pathname==='/rest/v1/rpc/community_create_channel'){
      if(!record||!['creator','admin'].includes(role(record.user)))return reply(403,{message:'FORBIDDEN'});
      const c={id:'channel-'+crypto.randomUUID(),name:body.p_name,description:body.p_description,channel_type:body.p_type};channels.set(c.id,c);return reply(200,c);
    }
    if(url.pathname==='/rest/v1/rpc/community_delete_channel'){
      if(!record||!['creator','admin'].includes(role(record.user)))return reply(403,{message:'FORBIDDEN'});
      const c=channels.get(body.p_id);if(!c||c.deleted_at)return reply(404,{message:'CHANNEL_NOT_FOUND'});
      c.deleted_at=new Date().toISOString();return reply(200,null);
    }
    if(soundboard&&url.pathname==='/rest/v1/chat_files'){
      if(req.headers.apikey!=='sb_secret_fixture_only')return fail('permission_denied',403);
      return reply(200,url.searchParams.get('id')==='eq.'+soundId?[{id:soundId,owner_id:[...users.values()][0]?.id,name:'Efeito',bytes:32044,mime:'audio/wav',kind:'soundboard',room_id:null,duration_ms:1000,state:'ready',created_at:new Date().toISOString()}]:[]);
    }
    if(url.pathname==='/rest/v1/rpc/chat_history_append'||url.pathname==='/rest/v1/rpc/chat_history_read'){
      if(req.headers.apikey!=='sb_secret_fixture_only')return fail('permission_denied',403);
      if(historyState.fail)return reply(503,{});
      const channel=channels.get(body.p_room);if(!channel||channel.deleted_at||channel.channel_type==='voice')return reply(400,{message:'CHANNEL_NOT_FOUND'});
      if(url.pathname.endsWith('append')){chatMessages.set(body.p_id,body.p_message);return reply(200,null);}
      const messages=[...chatMessages.values()].filter(m=>m.roomId===body.p_room).reverse(),before=body.p_before?messages.findIndex(m=>m.id===body.p_before):-1;
      return reply(200,(body.p_before&&before<0?[]:messages.slice(before+1,before+1+body.p_limit+1)).map(message=>({message})));
    }
    if(url.pathname==='/rest/v1/rpc/update_chat_profile'){
      if(!record)return fail('bad_jwt',401);if([...users.values()].some(u=>u.id!==record.user.id&&u.nickname.toLowerCase()===body.p_nickname.toLowerCase()))return reply(409,{message:'NICKNAME_TAKEN'});record.user.nickname=body.p_nickname;record.user.avatar_preset=body.p_preset;record.user.avatar_file_id=body.p_file;return reply(200,{});
    }
    if(url.pathname==='/auth/v1/logout'){
      if(!record)return fail('bad_jwt',401);for(const [k,v] of access)if(v.user.id===record.user.id&&(url.searchParams.get('scope')==='global'||v.sid===record.sid))access.delete(k);for(const [k,v] of refresh)if(v.user.id===record.user.id&&(url.searchParams.get('scope')==='global'||v.sid===record.sid))refresh.delete(k);return reply(200,{});
    }
    reply(404,{});
  });
  await new Promise(resolve=>provider.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${port}`;
  async function boot(){
  backend=spawn(process.execPath,[path.resolve(__dirname,'../server.js')],{env:{...process.env,PORT:String(port),AUTH_TEST_LOCAL:'true',AUTH_REQUIRED:String(required),SUPABASE_URL:`http://127.0.0.1:${provider.address().port}`,SUPABASE_PUBLISHABLE_KEY:'fixture-key',SUPABASE_SECRET_KEY:'sb_secret_fixture_only',APP_URL:appOrigin+'/',CLOUDFLARE_REALTIME_ENABLED:String(realtime),CLOUDFLARE_REALTIME_APP_ID:realtime?'test-app':'',CLOUDFLARE_REALTIME_API_TOKEN:realtime?'test-token':'',...(soundboard?{R2_ACCOUNT_ID:'a'.repeat(32),R2_BUCKET:'fixture',R2_ACCESS_KEY_ID:'fixture-only',R2_SECRET_ACCESS_KEY:'fixture-only'}:{})},stdio:['ignore','pipe','pipe']});let logs='';backend.stdout.on('data',d=>logs+=d);backend.stderr.on('data',d=>logs+=d);
    for(let attempt=0;attempt<100;attempt++){try{const r=await fetch(base+'/health');if(r.ok)break;}catch{}if(attempt===99)throw new Error('Backend did not start: '+logs);await wait(50);}
  }
  async function stopBackend(){const child=backend;if(child.exitCode!==null)return;const closed=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGTERM');const timer=setTimeout(()=>child.kill('SIGKILL'),2000);await closed;clearTimeout(timer);}
  await boot();
  async function call(endpoint,body,token,origin=appOrigin,method='POST'){
    const r=await fetch(`${base}/auth/${endpoint}`,{method,headers:{'Content-Type':'application/json',Origin:origin,...(token?{Authorization:`Bearer ${token}`}:{})},body:method==='GET'?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json(),headers:r.headers};
  }
  async function stop(){await stopBackend();await new Promise(resolve=>provider.close(resolve));}
  async function restart(){await stopBackend();await boot();}
  return {base,call,users,links,stop,restart,chatMessages,historyState,appOrigin,soundId};
}
module.exports={startFixture};
