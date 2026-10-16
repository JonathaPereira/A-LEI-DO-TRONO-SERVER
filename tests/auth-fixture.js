'use strict';
// TEST ONLY: fake Supabase contracts, no connection to a user's Supabase project.
const http=require('http'),crypto=require('crypto'),path=require('path'),{spawn}=require('child_process');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function startFixture({appOrigin='http://127.0.0.1:18880',port=10280,required=true,realtime=false,soundboard=false,directAttachments=false,gameDecree=null,allowedOrigins=[],loveLetterSeed=null}={}){
  const users=new Map(),access=new Map(),refresh=new Map(),links=new Map(),chatMessages=new Map(),historyState={fail:false};let backend;
  const azulRecords=new Map(),splendorRecords=new Map();
  const channels=new Map([['chat-livre','Geral'],['chat-jogos','Jogos'],['chat-conversa','Conversa']].map(([id,name])=>[id,{id,name,description:'',channel_type:'mixed'}]));
  const socialLinks=new Map(),directMessages=new Map(),readCursors=new Map(),files=new Map();
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
    if(url.pathname==='/rest/v1/rpc/azul_record_match'){
      if(req.headers.apikey!=='sb_secret_fixture_only')return fail('FORBIDDEN',403);
      if(!azulRecords.has(body.p_match))azulRecords.set(body.p_match,body);return reply(200,{saved:true});
    }
    if(url.pathname==='/rest/v1/rpc/azul_top_five'){
      if(req.headers.apikey!=='sb_secret_fixture_only')return fail('FORBIDDEN',403);
      const best=new Map();for(const m of azulRecords.values())for(const p of m.p_players){const u=[...users.values()].find(u=>u.id===p.id),r={playerId:p.id,name:u?.nickname,score:p.score,rows:p.rows,mode:m.p_mode,date:'2026-10-14T12:00:00Z'};if(!best.has(p.id)||best.get(p.id).score<r.score)best.set(p.id,r);}return reply(200,[...best.values()].sort((a,b)=>b.score-a.score||b.rows-a.rows).slice(0,5));
    }
    if(url.pathname==='/rest/v1/rpc/splendor_record_match'){
      if(req.headers.apikey!=='sb_secret_fixture_only')return fail('FORBIDDEN',403);
      if(!splendorRecords.has(body.p_match))splendorRecords.set(body.p_match,body);return reply(200,{saved:true});
    }
    if(url.pathname==='/rest/v1/rpc/splendor_top_five'){
      if(req.headers.apikey!=='sb_secret_fixture_only')return fail('FORBIDDEN',403);
      const best=new Map();for(const m of splendorRecords.values())for(const p of m.p_players){const u=[...users.values()].find(u=>u.id===p.id),r={playerId:p.id,name:u?.nickname,score:p.score,cards:p.cards,mode:m.p_mode,date:'2026-10-14T12:00:00Z'};const old=best.get(p.id);if(!old||old.score<r.score||old.score===r.score&&old.cards>r.cards)best.set(p.id,r);}return reply(200,[...best.values()].sort((a,b)=>b.score-a.score||a.cards-b.cards).slice(0,5));
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
    if(directAttachments&&(url.pathname==='/rest/v1/chat_files'||['reserve_direct_file','reserve_chat_file','mark_chat_file_deleting','direct_file_access','chat_storage_usage'].some(name=>url.pathname==='/rest/v1/rpc/'+name))){
      if(req.headers.apikey!=='sb_secret_fixture_only')return fail('permission_denied',403);
      const id=url.searchParams.get('id')?.replace(/^eq\./,''),operation=url.pathname.split('/').at(-1);
      if(operation==='reserve_direct_file'||operation==='reserve_chat_file'){
        if(operation==='reserve_direct_file'&&socialLinks.get([body.p_owner,body.p_peer].sort().join(':'))?.state!=='accepted')return reply(403,{message:'FRIEND_REQUIRED'});
        if([...files.values()].reduce((sum,row)=>sum+row.bytes,0)+body.p_bytes>8000000000)return reply(409,{message:'STORAGE_FULL'});
        const row={id:body.p_id,owner_id:body.p_owner,object_key:body.p_key,name:body.p_name,bytes:body.p_bytes,mime:body.p_mime,kind:body.p_kind||'direct',direct_peer_id:body.p_peer||null,room_id:body.p_room||null,state:'pending',created_at:new Date().toISOString()};files.set(row.id,row);return reply(200,row);
      }
      if(operation==='mark_chat_file_deleting'){const row=files.get(body.p_id);if(!row||row.owner_id!==body.p_owner)return reply(200,null);row.state='deleting';return reply(200,row);}
      if(operation==='chat_storage_usage')return reply(200,[...files.values()].reduce((sum,row)=>sum+row.bytes,0));
      if(operation==='direct_file_access'){const row=files.get(body.p_file);return reply(200,!!row&&row.kind==='direct'&&row.state==='ready'&&(row.owner_id===body.p_account||(row.direct_peer_id===body.p_account&&[...directMessages.values()].some(m=>m.message.attachment?.id===row.id&&m.message.senderId===row.owner_id&&m.accounts.includes(row.direct_peer_id)))));}
      if(req.method==='PATCH'){const row=files.get(id);if(row)Object.assign(row,body);return reply(200,row?[row]:[]);}
      if(req.method==='DELETE'){files.delete(id);return reply(200,null);}
      let result=id?[files.get(id)].filter(Boolean):[...files.values()];for(const key of ['kind','owner_id','state','room_id']){const value=url.searchParams.get(key);if(value?.startsWith('eq.'))result=result.filter(row=>row[key]===value.slice(3));}return reply(200,result);
    }
    if(['/rest/v1/rpc/chat_history_append','/rest/v1/rpc/chat_history_read','/rest/v1/rpc/chat_history_delete','/rest/v1/rpc/chat_history_clear'].includes(url.pathname)){
      if(req.headers.apikey!=='sb_secret_fixture_only')return fail('permission_denied',403);
      if(historyState.fail)return reply(503,{});
      const channel=channels.get(body.p_room);if(!channel||channel.deleted_at||channel.channel_type==='voice')return reply(400,{message:'CHANNEL_NOT_FOUND'});
      if(url.pathname.endsWith('delete')||url.pathname.endsWith('clear')){
        const actor=[...users.values()].find(u=>u.id===body.p_actor);if(!actor||role(actor)!=='creator')return reply(403,{message:'FORBIDDEN'});
        if(url.pathname.endsWith('delete'))return reply(200,chatMessages.get(body.p_id)?.roomId===body.p_room?chatMessages.delete(body.p_id):false);
        let removed=0;for(const [id,message]of chatMessages)if(message.roomId===body.p_room){chatMessages.delete(id);removed++;}return reply(200,removed);
      }
      if(url.pathname.endsWith('append')){chatMessages.set(body.p_id,body.p_message);res.writeHead(204);return res.end();}
      const messages=[...chatMessages.values()].filter(m=>m.roomId===body.p_room).reverse(),before=body.p_before?messages.findIndex(m=>m.id===body.p_before):-1;
      return reply(200,(body.p_before&&before<0?[]:messages.slice(before+1,before+1+body.p_limit+1)).map(message=>({message})));
    }
    if(url.pathname.startsWith('/rest/v1/rpc/social_')){
      if(!record)return fail('bad_jwt',401);const who=record.user.id,peer=body.p_peer||body.p_target,key=[who,peer].sort().join(':'),link=socialLinks.get(key),operation=url.pathname.split('social_')[1];
      const reject=reason=>reply(400,{message:reason}),user=id=>[...users.values()].find(u=>u.id===id&&u.email_confirmed_at),profile=u=>({id:u.id,name:u.nickname,avatar_preset:u.avatar_preset||'crown',avatar_file_id:u.avatar_file_id||null});
      const threadMessages=[...directMessages.values()].filter(m=>m.accounts.includes(who)&&m.accounts.includes(peer));
      if(operation==='friend'){
        if(who===peer||!user(peer))return reject('INVALID_TARGET');
        if(body.p_action==='request'){if(!link)socialLinks.set(key,{accounts:[who,peer],requestedBy:who,state:'pending'});}
        else if(!link)return reject('REQUEST_NOT_FOUND');
        else if(body.p_action==='accept'){if(link.state!=='pending'||link.requestedBy===who)return reject('FORBIDDEN');link.state='accepted';}
        else if(body.p_action==='decline'){if(link.state!=='pending')return reject('FORBIDDEN');socialLinks.delete(key);}
        else if(body.p_action==='remove'){if(link.state!=='accepted')return reject('FORBIDDEN');socialLinks.delete(key);}
        return reply(200,null);
      }
      if(operation==='snapshot'){
        const friends=[...socialLinks.values()].filter(l=>l.accounts.includes(who)).map(l=>({...profile(user(l.accounts.find(id=>id!==who))),state:l.state,incoming:l.requestedBy!==who}));
        const threads=new Map();for(const msg of directMessages.values())if(msg.accounts.includes(who)){const id=msg.accounts.find(id=>id!==who),old=threads.get(id)||{...profile(user(id)),peerId:id,unread:0};old.last=msg.message;if(msg.message.senderId!==who&&msg.ordinal>(readCursors.get(who+':'+id)||0))old.unread++;threads.set(id,old);}
        return reply(200,{friends,threads:[...threads.values()].reverse()});
      }
      if(operation==='attachment_target')return link?.state==='accepted'&&user(peer)&&peer!==who?reply(200,null):reject('FRIEND_REQUIRED');
      if(operation==='send'||operation==='send_attachment'){
        if(link?.state!=='accepted')return reject('FRIEND_REQUIRED');const channel=body.p_room?channels.get(body.p_room):null;if(body.p_room&&(!channel||channel.deleted_at))return reject('CHANNEL_NOT_FOUND');const text=channel?'Convite para '+channel.name:body.p_text;
        const file=body.p_attachment?files.get(body.p_attachment):null;if(operation==='send_attachment'&&(!file||file.kind!=='direct'||file.state!=='ready'||file.owner_id!==who||file.direct_peer_id!==peer))return reject('INVALID_ATTACHMENT');
        const existing=directMessages.get(body.p_id);if(existing){if(existing.message.senderId!==who||!existing.accounts.includes(peer)||existing.message.text!==text||(existing.message.attachment?.id||null)!==(body.p_attachment||null))return reject('INVALID_MESSAGE');return reply(200,existing.message);}
        const attachment=file?{id:file.id,name:file.name,bytes:file.bytes,mime:file.mime,kind:file.kind,peerId:file.direct_peer_id,ownerId:file.owner_id,roomId:null,createdAt:file.created_at,deleted:false}:null;
        const message={id:body.p_id,senderId:who,text,roomId:body.p_room||null,ts:new Date().toISOString(),...(attachment?{attachment}:{})};directMessages.set(message.id,{accounts:[who,peer],message,ordinal:directMessages.size+1});return reply(200,message);
      }
      if(operation==='read'){
        if(!link&&!threadMessages.length)return reject('FORBIDDEN');const reverse=threadMessages.slice().reverse(),index=body.p_before?reverse.findIndex(m=>m.message.id===body.p_before):-1;if(body.p_before&&index<0)return reject('INVALID_CURSOR');return reply(200,reverse.slice(index+1,index+52).reverse().map(m=>({...m.message,...(m.message.attachment?{attachment:{...m.message.attachment,deleted:files.get(m.message.attachment.id)?.state!=='ready'}}:{})})));
      }
      if(operation==='mark_read'){const msg=threadMessages.find(m=>m.message.id===body.p_message);if(!msg)return reject('INVALID_MESSAGE');readCursors.set(who+':'+peer,Math.max(readCursors.get(who+':'+peer)||0,msg.ordinal));return reply(200,null);}
      return reply(404,{});
    }
    if(url.pathname==='/rest/v1/rpc/read_member_profile'){
      if(!record)return fail('bad_jwt',401);const u=[...users.values()].find(u=>u.id===body.p_user);return reply(200,u?{id:u.id,nickname:u.nickname,avatar_preset:u.avatar_preset||'crown',avatar_file_id:u.avatar_file_id||null,created_at:'2026-10-01T12:00:00Z',personalization:u.personalization||{}}:null);
    }
    if(['/rest/v1/rpc/update_chat_profile','/rest/v1/rpc/save_member_profile'].includes(url.pathname)){
      if(!record)return fail('bad_jwt',401);if([...users.values()].some(u=>u.id!==record.user.id&&u.nickname.toLowerCase()===body.p_nickname.toLowerCase()))return reply(409,{message:'NICKNAME_TAKEN'});record.user.nickname=body.p_nickname;record.user.avatar_preset=body.p_preset;record.user.avatar_file_id=body.p_file;if(body.p_data)record.user.personalization=body.p_data;return reply(200,{});
    }
    if(url.pathname==='/auth/v1/logout'){
      if(!record)return fail('bad_jwt',401);for(const [k,v] of access)if(v.user.id===record.user.id&&(url.searchParams.get('scope')==='global'||v.sid===record.sid))access.delete(k);for(const [k,v] of refresh)if(v.user.id===record.user.id&&(url.searchParams.get('scope')==='global'||v.sid===record.sid))refresh.delete(k);return reply(200,{});
    }
    reply(404,{});
  });
  await new Promise(resolve=>provider.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${port}`;
  async function boot(){
  backend=spawn(process.execPath,[...(loveLetterSeed!==null?['--require',path.resolve(__dirname,'love-letter-seed.cjs')]:[]),...(gameDecree?['--require',path.resolve(__dirname,'game-test-clock.cjs')]:[]),...(directAttachments?['--require',path.resolve(__dirname,'direct-attachments-adapter.cjs')]:[]),path.resolve(__dirname,'../server/index.ts')],{env:{...process.env,PORT:String(port),...(loveLetterSeed!==null?{MN_TEST_LOVE_LETTER_SEED:String(loveLetterSeed)}:{}),...(gameDecree?{TRONO_TEST_DECREE:gameDecree}:{}),AUTH_TEST_LOCAL:'true',AUTH_REQUIRED:String(required),SUPABASE_URL:`http://127.0.0.1:${provider.address().port}`,SUPABASE_PUBLISHABLE_KEY:'fixture-key',SUPABASE_SECRET_KEY:'sb_secret_fixture_only',APP_URL:appOrigin+'/',AUTH_ALLOWED_ORIGINS:allowedOrigins.join(','),CLOUDFLARE_REALTIME_ENABLED:String(realtime),CLOUDFLARE_REALTIME_APP_ID:realtime?'test-app':'',CLOUDFLARE_REALTIME_API_TOKEN:realtime?'test-token':'',...(soundboard||directAttachments?{R2_ACCOUNT_ID:'a'.repeat(32),R2_BUCKET:'fixture',R2_ACCESS_KEY_ID:'fixture-only',R2_SECRET_ACCESS_KEY:'fixture-only'}:{})},stdio:['ignore','pipe','pipe']});let logs='';backend.stdout.on('data',d=>logs+=d);backend.stderr.on('data',d=>logs+=d);
    for(let attempt=0;attempt<100;attempt++){try{const r=await fetch(base+'/health');if(r.ok)break;}catch{}if(attempt===99)throw new Error('Backend did not start: '+logs);await wait(50);}
  }
  async function stopBackend(){const child=backend;if(child.exitCode!==null)return;const closed=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGTERM');const timer=setTimeout(()=>child.kill('SIGKILL'),2000);await closed;clearTimeout(timer);}
  await boot();
  async function call(endpoint,body,token,origin=appOrigin,method='POST'){
    const r=await fetch(`${base}/auth/${endpoint}`,{method,headers:{'Content-Type':'application/json',Origin:origin,...(token?{Authorization:`Bearer ${token}`}:{})},body:method==='GET'?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json(),headers:r.headers};
  }
  async function stop(){await stopBackend();await new Promise(resolve=>provider.close(resolve));}
  async function restart(){await stopBackend();await boot();}
  return {base,call,users,links,stop,restart,azulRecords,splendorRecords,chatMessages,historyState,appOrigin,soundId,files,directMessages,socialLinks};
}
module.exports={startFixture};
