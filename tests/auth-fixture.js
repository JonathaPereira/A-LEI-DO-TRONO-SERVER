'use strict';
// TEST ONLY: fake Supabase contracts, no connection to a user's Supabase project.
const http=require('http'),crypto=require('crypto'),path=require('path'),{spawn}=require('child_process');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function startFixture({appOrigin='http://127.0.0.1:18880',port=10280,required=true,realtime=false}={}){
  const users=new Map(),access=new Map(),refresh=new Map(),links=new Map();let backend;
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
      if(!record)return fail('bad_jwt',401);return reply(200,[{id:record.user.id,nickname:record.user.nickname,avatar_preset:record.user.avatar_preset||'crown',avatar_file_id:record.user.avatar_file_id||null}]);
    }
    if(url.pathname==='/rest/v1/rpc/chat_member_directory'){
      if(req.headers.apikey!=='sb_secret_fixture_only')return fail('permission_denied',403);
      return reply(200,[...users.values()].filter(u=>u.email_confirmed_at).map(u=>({id:u.id,nickname:u.nickname,avatar_preset:u.avatar_preset||'crown',avatar_file_id:u.avatar_file_id||null})));
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
  backend=spawn(process.execPath,[path.resolve(__dirname,'../server.js')],{env:{...process.env,PORT:String(port),AUTH_TEST_LOCAL:'true',AUTH_REQUIRED:String(required),SUPABASE_URL:`http://127.0.0.1:${provider.address().port}`,SUPABASE_PUBLISHABLE_KEY:'fixture-key',SUPABASE_SECRET_KEY:'sb_secret_fixture_only',APP_URL:appOrigin+'/',CLOUDFLARE_REALTIME_ENABLED:String(realtime),CLOUDFLARE_REALTIME_APP_ID:realtime?'test-app':'',CLOUDFLARE_REALTIME_API_TOKEN:realtime?'test-token':''},stdio:['ignore','pipe','pipe']});let logs='';backend.stdout.on('data',d=>logs+=d);backend.stderr.on('data',d=>logs+=d);
  const base=`http://127.0.0.1:${port}`;
  for(let attempt=0;attempt<100;attempt++){try{const r=await fetch(base+'/health');if(r.ok)break;}catch{}if(attempt===99)throw new Error('Backend did not start: '+logs);await wait(50);}
  async function call(endpoint,body,token,origin=appOrigin,method='POST'){
    const r=await fetch(`${base}/auth/${endpoint}`,{method,headers:{'Content-Type':'application/json',Origin:origin,...(token?{Authorization:`Bearer ${token}`}:{})},body:method==='GET'?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json(),headers:r.headers};
  }
  async function stop(){backend.kill('SIGTERM');await wait(150);if(backend.exitCode===null)backend.kill('SIGKILL');await new Promise(resolve=>provider.close(resolve));}
  return {base,call,users,links,stop,appOrigin};
}
module.exports={startFixture};
