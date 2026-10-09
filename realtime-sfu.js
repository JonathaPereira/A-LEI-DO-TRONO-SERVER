'use strict';

const fs = require('fs');
const path = require('path');

const CF_BASE = 'https://rtc.live.cloudflare.com/v1';
const TURN_BASE = 'https://rtc.live.cloudflare.com/v1/turn';
const USAGE_FILE = process.env.REALTIME_USAGE_FILE || '/tmp/a_lei_do_trono_realtime_usage.json';
const ALLOWED_KINDS = new Set(['audio','camera','screen','screen-audio']);
const ALLOWED_QUALITIES = new Set(['economy','balanced','high']);
const QUALITY_ORDER = ['economy','balanced','high'];
const PROFILE = {
  economy:{audio:64000,camera:{f:900000,h:450000,q:180000},screen:4000000},
  balanced:{audio:96000,camera:{f:2200000,h:950000,q:350000},screen:8000000},
  high:{audio:128000,camera:{f:3500000,h:1400000,q:450000},screen:10000000},
};

function envBool(name, fallback=false){
  const v=process.env[name];
  if(v==null)return fallback;
  return /^(1|true|yes|on)$/i.test(String(v).trim());
}
function envNum(name, fallback){
  const n=Number(process.env[name]);
  return Number.isFinite(n)?n:fallback;
}
function monthKeyUTC(ts=Date.now()){
  const d=new Date(ts);return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;
}
function clonePlain(value){return JSON.parse(JSON.stringify(value));}
function sdpOk(desc,type){return !!desc&&desc.type===type&&typeof desc.sdp==='string'&&desc.sdp.length>20&&desc.sdp.length<400000;}
function safeErrorBody(body){
  if(!body||typeof body!=='object')return null;
  const errors=[];
  for(const e of body.errors||[])errors.push({errorCode:e.errorCode||e.code||'cloudflare_error',errorDescription:String(e.errorDescription||e.message||'Erro Cloudflare').slice(0,240)});
  return errors;
}

class RealtimeSfuManager{
  constructor({rooms,send,broadcastVoiceRoster,chatOnlyRoomId,version}){
    this.rooms=rooms;
    this.send=send;
    this.broadcastVoiceRoster=broadcastVoiceRoster;
    this.chatOnlyRoomId=chatOnlyRoomId;
    this.version=version;
    this.appId=String(process.env.CLOUDFLARE_REALTIME_APP_ID||'').trim();
    this.token=String(process.env.CLOUDFLARE_REALTIME_API_TOKEN||'').trim();
    this.enabled=envBool('CLOUDFLARE_REALTIME_ENABLED',false);
    this.turnEnabled=envBool('CLOUDFLARE_TURN_ENABLED',false);
    this.turnKeyId=String(process.env.CLOUDFLARE_TURN_KEY_ID||'').trim();
    this.turnToken=String(process.env.CLOUDFLARE_TURN_API_TOKEN||'').trim();
    this.turnTtl=Math.max(600,Math.min(172800,Math.floor(envNum('CLOUDFLARE_TURN_TTL_SECONDS',21600))));
    this.turnCache=null;
    this.softLimitGb=Math.max(0,envNum('REALTIME_MONTHLY_SOFT_LIMIT_GB',800));
    this.hardLimitGb=Math.max(this.softLimitGb,envNum('REALTIME_MONTHLY_HARD_LIMIT_GB',950));
    this.ultraDisableGb=Math.max(0,envNum('REALTIME_ULTRA_DISABLE_GB',800));
    this.highDisableGb=Math.max(this.ultraDisableGb,envNum('REALTIME_HIGH_DISABLE_GB',850));
    this.screenDisableGb=Math.max(this.highDisableGb,envNum('REALTIME_SCREEN_DISABLE_GB',900));
    this.monthBaseGb=Math.max(0,envNum('REALTIME_MONTHLY_BASE_GB',0));
    this.maxParticipants=Math.max(2,Math.min(32,Math.floor(envNum('REALTIME_MAX_PARTICIPANTS',8))));
    this.estimateSafetyFactor=Math.max(1,Math.min(4,envNum('REALTIME_ESTIMATE_SAFETY_FACTOR',1.5)));
    this.sessions=new Map();
    this.clientGenerations=new Map();
    this.sessionQueues=new Map();
    this.publicationsByRoom=new Map();
    this.subscriptions=new Map();
    this.usage={month:monthKeyUTC(),bytes:0,lastTick:Date.now(),loadedFromDisk:false};
    this.lastPolicySignature='';
    this.lastRestrictionSignature='';
    this.enforcementRunning=false;
    this._loadUsage();
    this.timer=setInterval(()=>this._tick(),5000);
    this.timer.unref?.();
  }

  stop(){clearInterval(this.timer);this._tick(true);}
  configured(){return !!(this.appId&&this.token);}
  turnConfigured(){return !!(this.turnKeyId&&this.turnToken);}
  totalGb(){return this.monthBaseGb+(this.usage.bytes/1e9);}
  policy(){
    const gb=this.totalGb();
    const hardBlocked=gb>=this.hardLimitGb;
    const screenAllowed=gb<this.screenDisableGb&&!hardBlocked;
    const highAllowed=gb<this.highDisableGb&&!hardBlocked;
    const ultraAllowed=false; // Perfil Ultra removido de todos os canais.
    const maxQuality=hardBlocked?'economy':(!highAllowed?'balanced':'high');
    return {
      enabled:this.enabled,configured:this.configured(),hardBlocked,
      softWarning:gb>=this.softLimitGb,
      screenAllowed,highAllowed,ultraAllowed,maxQuality,
      estimatedGb:Number(gb.toFixed(3)),processEstimatedGb:Number((this.usage.bytes/1e9).toFixed(3)),baseGb:this.monthBaseGb,
      thresholds:{soft:this.softLimitGb,ultra:this.ultraDisableGb,high:this.highDisableGb,screen:this.screenDisableGb,hard:this.hardLimitGb},
      month:this.usage.month,maxParticipants:this.maxParticipants,usageIsEstimate:true,estimateSafetyFactor:this.estimateSafetyFactor,
    };
  }
  statusPayload(){
    const p=this.policy();
    return {type:'realtime-status',version:this.version,mode:'cloudflare-sfu',experimental:true,...p,usagePersistence:'ephemeral-with-local-checkpoint'};
  }
  publicHealth(){
    const p=this.policy();
    return {configured:p.configured,enabled:p.enabled,hardBlocked:p.hardBlocked,estimatedGb:p.estimatedGb,maxQuality:p.maxQuality,screenAllowed:p.screenAllowed,thresholds:p.thresholds,month:p.month,maxParticipants:p.maxParticipants,estimateSafetyFactor:p.estimateSafetyFactor,turnConfigured:this.turnConfigured(),turnEnabled:this.turnEnabled};
  }
  roomPublications(roomId){
    const map=this.publicationsByRoom.get(roomId);if(!map)return [];
    return [...map.values()].filter(p=>p.ready).map(p=>({ownerId:p.ownerId,ownerName:p.ownerName,kind:p.kind,sessionId:p.sessionId,trackName:p.trackName,quality:p.quality,screenBitrate:p.screenBitrate,rids:p.rids||[],createdAt:p.createdAt}));
  }
  broadcastPublications(room){
    if(!room)return;const publications=this.roomPublications(room.id);
    for(const p of room.players.values())if(p.voiceJoined)this.send(p.ws,{type:'sfu-publications',roomId:room.id,publications});
  }
  broadcastStatus(room){if(!room)return;const payload=this.statusPayload();for(const p of room.players.values())if(p.voiceJoined)this.send(p.ws,payload);}

  _loadUsage(){
    try{
      const data=JSON.parse(fs.readFileSync(USAGE_FILE,'utf8'));
      if(data?.month===this.usage.month&&Number.isFinite(Number(data.bytes))){this.usage.bytes=Math.max(0,Number(data.bytes));this.usage.loadedFromDisk=true;}
    }catch{}
  }
  _saveUsage(){
    try{fs.mkdirSync(path.dirname(USAGE_FILE),{recursive:true});fs.writeFileSync(USAGE_FILE,JSON.stringify({month:this.usage.month,bytes:this.usage.bytes,updatedAt:new Date().toISOString()}));}catch{}
  }
  _currentEgressBps(){let total=0;for(const sub of this.subscriptions.values())total+=Math.max(0,Number(sub.estimatedBps)||0);return total;}
  _tick(force=false){
    const now=Date.now(),m=monthKeyUTC(now);
    if(m!==this.usage.month){this.usage={month:m,bytes:0,lastTick:now,loadedFromDisk:false};}
    const dt=Math.max(0,Math.min(15000,now-this.usage.lastTick));this.usage.lastTick=now;
    if(dt>0)this.usage.bytes+=(this._currentEgressBps()/8)*(dt/1000);
    if(force||now%15000<5200)this._saveUsage();
    const currentPolicy=this.policy(),sig=JSON.stringify(currentPolicy);
    if(sig!==this.lastPolicySignature){this.lastPolicySignature=sig;for(const room of this.rooms.values())if(room.kind==='chat')this.broadcastStatus(room);}
    const restrictionSig=JSON.stringify({enabled:currentPolicy.enabled,configured:currentPolicy.configured,hardBlocked:currentPolicy.hardBlocked,screenAllowed:currentPolicy.screenAllowed,highAllowed:currentPolicy.highAllowed,ultraAllowed:currentPolicy.ultraAllowed});
    if(restrictionSig!==this.lastRestrictionSignature){this.lastRestrictionSignature=restrictionSig;void this._enforcePolicy(currentPolicy);}
  }
  async _enforcePolicy(policy){
    if(this.enforcementRunning||!policy?.configured||!policy?.enabled)return;
    this.enforcementRunning=true;
    try{
      if(policy.hardBlocked){
        for(const sub of [...this.subscriptions.values()])await this._closeSubscription(sub,true).catch(()=>{});
        for(const roomMap of this.publicationsByRoom.values())for(const pub of [...roomMap.values()])await this._closePublication(pub,true).catch(()=>{});
      }else{
        if(!policy.screenAllowed){
          for(const roomMap of this.publicationsByRoom.values())for(const pub of [...roomMap.values()].filter(p=>p.kind==='screen'||p.kind==='screen-audio'))await this._closePublication(pub,true).catch(()=>{});
        }
        for(const sub of this.subscriptions.values()){
          if(!['camera','screen'].includes(sub.kind))continue;const pub=this._pubMap(sub.roomId).get(this._pubKey(sub.publisherId,sub.kind));if(!pub)continue;
          const desired=this._clampRid(pub,sub.preferredRid,'balanced');if(desired===sub.preferredRid)continue;
          try{await this._cf('PUT',`/sessions/${encodeURIComponent(sub.sessionId)}/tracks/update`,{tracks:[{mid:sub.mid,simulcast:{preferredRid:desired,priorityOrdering:'asciibetical',ridNotAvailable:'asciibetical'}}]});sub.preferredRid=desired;sub.estimatedBps=this._subscriptionBps(pub,desired);}catch{}
        }
      }
      for(const room of this.rooms.values())if(room.kind==='chat'){this.broadcastPublications(room);this.broadcastStatus(room);}
    }finally{this.enforcementRunning=false;}
  }

  _allowedRoomPlayer(ws,requireVoice=true){
    const room=this.rooms.get(ws.roomId),player=room?.players.get(ws.clientId);
    if(!room||!player||room.kind!=='chat')return {error:'SFU_CHAT_ONLY'};
    if(requireVoice&&!player.voiceJoined)return {error:'VOICE_REQUIRED'};
    return {room,player};
  }
  _assertAvailable(kind='audio',quality='balanced'){
    const p=this.policy();
    if(!this.enabled)return {ok:false,code:'REALTIME_DISABLED',message:'Cloudflare Realtime está desligado pelo kill switch.'};
    if(!this.configured())return {ok:false,code:'REALTIME_NOT_CONFIGURED',message:'Cloudflare Realtime não está configurado no backend.'};
    if(p.hardBlocked)return {ok:false,code:'REALTIME_HARD_LIMIT',message:'Limite operacional mensal do Realtime atingido.'};
    if((kind==='screen'||kind==='screen-audio')&&!p.screenAllowed)return {ok:false,code:'SCREEN_BUDGET_BLOCKED',message:'Compartilhamento bloqueado pelo freio de consumo.'};
    if(quality==='high'&&!p.highAllowed)return {ok:false,code:'HIGH_BUDGET_BLOCKED',message:'Qualidade Alta foi bloqueada pelo freio de consumo.'};
    return {ok:true,policy:p};
  }
  _sessionOwned(ws,sessionId){const s=this.sessions.get(String(sessionId||''));return s&&s.ownerId===ws.clientId&&s.roomId===ws.roomId?s:null;}
  _pubMap(roomId){if(!this.publicationsByRoom.has(roomId))this.publicationsByRoom.set(roomId,new Map());return this.publicationsByRoom.get(roomId);}
  _pubKey(ownerId,kind){return `${ownerId}:${kind}`;}
  _qualityIndex(q){return Math.max(0,QUALITY_ORDER.indexOf(q));}
  _clampQuality(q){q=ALLOWED_QUALITIES.has(q)?q:'balanced';const max=this.policy().maxQuality;return this._qualityIndex(q)>this._qualityIndex(max)?max:q;}
  clampQuality(q){return this._clampQuality(q);}
  notePlayerQuality(roomId,ownerId,q){
    const quality=this._clampQuality(q),map=this._pubMap(roomId);
    for(const pub of map.values())if(pub.ownerId===ownerId)pub.quality=quality;
    for(const sub of this.subscriptions.values()){
      if(sub.roomId!==roomId||sub.publisherId!==ownerId)continue;
      const pub=map.get(this._pubKey(ownerId,sub.kind));if(pub)sub.estimatedBps=this._subscriptionBps(pub,sub.preferredRid);
    }
    return quality;
  }
  _preferredRid(q){q=this._clampQuality(q);return q==='economy'?'q':'f';}
  _clampRid(pub,requestedRid,desiredQuality='balanced'){
    const available=Array.isArray(pub?.rids)?pub.rids.filter(r=>['f','h','q'].includes(r)):[];
    if(!available.length)return null;
    let rid=available.includes(requestedRid)?requestedRid:this._preferredRid(desiredQuality);
    const p=this.policy();
    if(rid==='f'&&!p.highAllowed)rid='h';
    if(!available.includes(rid))rid=available.includes('h')?'h':available.includes('q')?'q':available[0];
    return rid;
  }
  _subscriptionBps(pub,preferredRid){
    const pr=PROFILE[pub.quality]||PROFILE.balanced;
    let bps;if(pub.kind==='audio')bps=pr.audio;
    else if(pub.kind==='screen-audio')bps=192000;
    else if(pub.kind==='screen'){const factor=preferredRid==='q'?.18:preferredRid==='h'?.42:1;bps=(pub.screenBitrate||pr.screen)*factor;}
    else bps=pr.camera[preferredRid]||pr.camera.h;
    return Math.ceil(bps*this.estimateSafetyFactor);
  }
  async _publicationActive(pub,{maxAge=1200}={}){
    if(!pub?.sessionId||!pub?.trackName)return false;
    if(pub.lastVerifiedAt&&Date.now()-pub.lastVerifiedAt<maxAge)return true;
    let info;
    try{info=await this._cf('GET',`/sessions/${encodeURIComponent(pub.sessionId)}`);}catch(err){
      if(err?.status===404||err?.status===410)return false;
      throw err;
    }
    const track=(info?.tracks||[]).find(t=>t&&t.location==='local'&&String(t.trackName||'')===String(pub.trackName));
    const active=!!track&&track.status!=='inactive';
    if(active){pub.lastVerifiedAt=Date.now();pub.remoteStatus=track.status||'active';}
    return active;
  }
  async _waitPublicationActive(pub,timeoutMs=4200){
    const end=Date.now()+timeoutMs;let lastError=null;
    do{try{if(await this._publicationActive(pub,{maxAge:0}))return true;}catch(err){lastError=err;}await new Promise(r=>setTimeout(r,260));}while(Date.now()<end);
    if(lastError)throw lastError;return false;
  }
  async _pruneStalePublication(room,pub){
    if(!pub)return;
    const map=this._pubMap(pub.roomId),key=this._pubKey(pub.ownerId,pub.kind);
    if(map.get(key)?.sessionId===pub.sessionId)map.delete(key);
    const related=[...this.subscriptions.values()].filter(s=>s.roomId===pub.roomId&&s.publisherSessionId===pub.sessionId);
    for(const sub of related)await this._closeSubscription(sub,true).catch(()=>{});
    this.sessions.delete(pub.sessionId);
    if(room)this.broadcastPublications(room);
  }

  async _turnIceServers(){
    const stun=[{urls:['stun:stun.cloudflare.com:3478']}];
    if(!this.turnEnabled||!this.turnConfigured())return {iceServers:stun,turn:false};
    const now=Date.now();
    if(this.turnCache&&this.turnCache.expiresAt>now+300000)return {iceServers:this.turnCache.iceServers,turn:true};
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
    try{
      const res=await fetch(`${TURN_BASE}/keys/${encodeURIComponent(this.turnKeyId)}/credentials/generate-ice-servers`,{
        method:'POST',headers:{Authorization:`Bearer ${this.turnToken}`,'Content-Type':'application/json'},
        body:JSON.stringify({ttl:this.turnTtl}),signal:controller.signal,
      });
      const data=await res.json().catch(()=>({}));
      if(!res.ok||!Array.isArray(data.iceServers))throw new Error(`TURN HTTP ${res.status}`);
      const iceServers=data.iceServers.filter(x=>x&&Array.isArray(x.urls)&&x.urls.length);
      this.turnCache={iceServers,expiresAt:now+this.turnTtl*1000};
      return {iceServers,turn:true};
    }finally{clearTimeout(timer);}
  }

  async _cf(method,suffix,body){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
    try{
      const res=await fetch(`${CF_BASE}/apps/${encodeURIComponent(this.appId)}${suffix}`,{
        method,headers:{Authorization:`Bearer ${this.token}`,'Content-Type':'application/json'},
        body:body===undefined?undefined:JSON.stringify(body),signal:controller.signal,
      });
      const text=await res.text();let data={};try{data=text?JSON.parse(text):{};}catch{data={};}
      if(!res.ok){const err=new Error(`Cloudflare Realtime respondeu HTTP ${res.status}`);err.status=res.status;err.publicErrors=safeErrorBody(data);throw err;}
      const topErrors=safeErrorBody(data);if(topErrors?.length){const err=new Error(topErrors[0].errorDescription||'Erro Cloudflare Realtime');err.status=res.status;err.publicErrors=topErrors;throw err;}
      return data;
    }finally{clearTimeout(timer);}
  }
  _sendResponse(ws,requestId,ok,data=null,error=null){this.send(ws,{type:'sfu-response',requestId,ok,data,error});}
  _publicError(err,code='SFU_REQUEST_FAILED'){
    const detail=err?.publicErrors?.[0];return {code:detail?.errorCode||code,message:String(detail?.errorDescription||err?.message||'Falha ao comunicar com Cloudflare Realtime.').slice(0,260)};
  }

  async handleRequest(ws,message){
    const sid=String(message.payload?.sessionId||'');
    if(!sid)return this._handleRequest(ws,message);
    const queued=(this.sessionQueues.get(sid)||Promise.resolve()).catch(()=>{}).then(()=>this._handleRequest(ws,message));
    this.sessionQueues.set(sid,queued);
    try{await queued;}finally{if(this.sessionQueues.get(sid)===queued)this.sessionQueues.delete(sid);}
  }
  async _handleRequest(ws,message){
    const requestId=String(message.requestId||'').slice(0,80),action=String(message.action||''),payload=message.payload||{};
    if(!requestId)return;
    if(action==='status'){this._sendResponse(ws,requestId,true,this.statusPayload());return;}
    const auth=this._allowedRoomPlayer(ws,true);if(auth.error){this._sendResponse(ws,requestId,false,null,{code:auth.error,message:'Operação SFU não autorizada neste contexto.'});return;}
    const {room,player}=auth;
    if(room.voiceMode==='p2p'&&!['ice-config','close-publication','close-subscription','close-tracks'].includes(action)){this._sendResponse(ws,requestId,false,null,{code:'ROOM_P2P',message:'A sala está sincronizada em P2P.'});return;}
    const contextKey=`${room.id}:${player.id}`,generation=this.clientGenerations.get(contextKey)||0;
    const ensureCurrent=()=>{if(room.voiceMode==='p2p'||ws.roomId!==room.id||room.players.get(player.id)!==player||!player.voiceJoined||(this.clientGenerations.get(contextKey)||0)!==generation)throw Object.assign(new Error('A chamada mudou durante a operação SFU.'),{code:'SFU_SESSION_STALE'});};
    try{
      if(action==='ice-config'){
        try{this._sendResponse(ws,requestId,true,await this._turnIceServers());}catch(err){this._sendResponse(ws,requestId,true,{iceServers:[{urls:['stun:stun.cloudflare.com:3478']}],turn:false,warning:'TURN indisponível; usando STUN.'});}
        return;
      }
      if(action==='list-publications'){
        this._sendResponse(ws,requestId,true,{publications:this.roomPublications(room.id)});return;
      }
      if(action==='publication-ready'){
        const sessionId=String(payload.sessionId||''),session=this._sessionOwned(ws,sessionId);
        if(!session||session.purpose!=='publish')throw Object.assign(new Error('Publicação não encontrada.'),{code:'BAD_SFU_READY'});
        const pub=this._pubMap(room.id).get(this._pubKey(player.id,session.kind));
        if(!pub||pub.sessionId!==sessionId)throw Object.assign(new Error('Publicação não encontrada.'),{code:'PUBLICATION_NOT_FOUND'});
        const active=await this._waitPublicationActive(pub,4200);
        ensureCurrent();
        if(this._pubMap(room.id).get(this._pubKey(player.id,pub.kind))!==pub)throw Object.assign(new Error('A publicação foi substituída.'),{code:'PUBLICATION_STALE'});
        if(!active)throw Object.assign(new Error('A track foi negociada, mas ainda não ficou ativa no SFU.'),{code:'PUBLICATION_NOT_ACTIVE'});
        pub.ready=true;pub.readyAt=Date.now();if(pub.kind==='audio')player.mediaTransport='sfu';this.broadcastPublications(room);this.broadcastVoiceRoster(room);
        this._sendResponse(ws,requestId,true,{ready:true,kind:pub.kind,trackName:pub.trackName,rids:pub.rids});return;
      }
      if(action==='publish-track'){
        const kind=String(payload.kind||''),quality=ALLOWED_QUALITIES.has(payload.quality)?payload.quality:'balanced';
        if(!ALLOWED_KINDS.has(kind)||!sdpOk(payload.sessionDescription,'offer')||typeof payload.mid!=='string')throw Object.assign(new Error('Publicação inválida.'),{code:'BAD_SFU_PUBLISH'});
        const gate=this._assertAvailable(kind,quality);if(!gate.ok){this._sendResponse(ws,requestId,false,null,gate);return;}
        const publishing=new Set([...this._pubMap(room.id).values()].map(p=>p.ownerId));
        const activeSfu=[...room.players.values()].filter(p=>p.voiceJoined&&(p.mediaTransport==='sfu'||publishing.has(p.id)));
        if(!activeSfu.some(p=>p.id===player.id)&&activeSfu.length>=this.maxParticipants){this._sendResponse(ws,requestId,false,null,{code:'SFU_ROOM_SAFETY_LIMIT',message:`Limite de segurança do SFU (${this.maxParticipants} participantes simultâneos) atingido.`});return;}
        const existing=this._pubMap(room.id).get(this._pubKey(player.id,kind));if(existing){await this._closePublication(existing,true).catch(()=>{});this.broadcastPublications(room);}
        const newSession=await this._cf('POST','/sessions/new');const sessionId=String(newSession.sessionId||'');if(!sessionId)throw new Error('Cloudflare não retornou sessionId.');ensureCurrent();
        this.sessions.set(sessionId,{ownerId:player.id,roomId:room.id,purpose:'publish',kind,createdAt:Date.now()});
        const trackName=`${kind}-${String(player.id).replace(/[^a-zA-Z0-9]/g,'').slice(0,8)}-${Date.now().toString(36)}`;
        const requestedRids=Array.isArray(payload.rids)?[...new Set(payload.rids.filter(r=>['f','h','q'].includes(r)))]:[];
        const body={sessionDescription:payload.sessionDescription,tracks:[{location:'local',mid:String(payload.mid),trackName}]};
        let result;try{result=await this._cf('POST',`/sessions/${encodeURIComponent(sessionId)}/tracks/new`,body);}catch(err){this.sessions.delete(sessionId);throw err;}
        const trackResult=(result.tracks||[])[0]||{};if(trackResult.errorCode)throw Object.assign(new Error(trackResult.errorDescription||'Falha ao publicar track.'),{code:trackResult.errorCode});
        ensureCurrent();
        const actualTrackName=String(trackResult.trackName||trackName);
        const requestedBitrate=Number(payload.screenBitrate);const screenBitrate=kind==='screen'?Math.min(this.policy().highAllowed?15000000:6000000,Math.max(4000000,Number.isFinite(requestedBitrate)?requestedBitrate:PROFILE[quality].screen)):null;
        const pub={ownerId:player.id,ownerName:player.name,roomId:room.id,kind,quality,sessionId,trackName:actualTrackName,mid:String(payload.mid),screenBitrate,rids:['camera','screen'].includes(kind)?requestedRids:[],ready:false,createdAt:Date.now(),lastVerifiedAt:0};
        this._pubMap(room.id).set(this._pubKey(player.id,kind),pub);if(kind==='audio')player.mediaTransport='sfu-pending';player.transmissionQuality=quality;
        this.broadcastVoiceRoster(room);
        this._sendResponse(ws,requestId,true,{sessionId,sessionDescription:result.sessionDescription||null,publication:{kind,trackName:actualTrackName,quality,rids:pub.rids}});return;
      }
      if(action==='subscribe-track'){
        const publisherId=String(payload.publisherId||''),kind=String(payload.kind||''),quality=ALLOWED_QUALITIES.has(payload.quality)?payload.quality:'balanced';
        if(!ALLOWED_KINDS.has(kind)||publisherId===player.id)throw Object.assign(new Error('Assinatura inválida.'),{code:'BAD_SFU_SUBSCRIBE'});
        const pub=this._pubMap(room.id).get(this._pubKey(publisherId,kind));if(!pub)throw Object.assign(new Error('Publicação não está disponível.'),{code:'PUBLICATION_NOT_FOUND'});
        if(!pub.ready)throw Object.assign(new Error('Publicação ainda está conectando ao SFU.'),{code:'PUBLICATION_NOT_READY'});
        if(!(await this._publicationActive(pub,{maxAge:1200}))){await this._pruneStalePublication(room,pub);throw Object.assign(new Error('A publicação mudou ou foi encerrada; atualizando a lista de mídia.'),{code:'PUBLICATION_STALE'});}
        const gate=this._assertAvailable(kind,quality);if(!gate.ok){this._sendResponse(ws,requestId,false,null,gate);return;}
        const newSession=await this._cf('POST','/sessions/new');const sessionId=String(newSession.sessionId||'');if(!sessionId)throw new Error('Cloudflare não retornou sessionId.');ensureCurrent();
        const preferredRid=['camera','screen'].includes(kind)?this._clampRid(pub,String(payload.preferredRid||''),quality):null;
        const remote={location:'remote',sessionId:pub.sessionId,trackName:pub.trackName};
        if(['camera','screen'].includes(kind)&&preferredRid&&pub.rids?.length)remote.simulcast={preferredRid,priorityOrdering:'asciibetical',ridNotAvailable:'asciibetical'};
        let result;try{result=await this._cf('POST',`/sessions/${encodeURIComponent(sessionId)}/tracks/new`,{tracks:[remote]});}catch(err){throw err;}
        const tr=(result.tracks||[])[0]||{};
        if(tr.errorCode){
          if(tr.errorCode==='not_found_track_error'){await this._pruneStalePublication(room,pub);throw Object.assign(new Error('A fonte de mídia foi substituída antes da assinatura. Ressincronizando.'),{code:'PUBLICATION_STALE'});}
          throw Object.assign(new Error(tr.errorDescription||'Falha ao assinar track.'),{code:tr.errorCode});
        }
        ensureCurrent();
        if(!sdpOk(result.sessionDescription,'offer'))throw Object.assign(new Error('SFU não forneceu uma oferta SDP válida.'),{code:'BAD_SFU_OFFER'});
        const receivingMid=String(tr.mid??'');
        this.sessions.set(sessionId,{ownerId:player.id,roomId:room.id,purpose:'subscribe',pendingAnswer:true,kind,publisherId,createdAt:Date.now()});
        this.subscriptions.set(sessionId,{sessionId,ownerId:player.id,roomId:room.id,publisherId,publisherSessionId:pub.sessionId,kind,mid:receivingMid,preferredRid:preferredRid||null,estimatedBps:this._subscriptionBps(pub,preferredRid),createdAt:Date.now()});
        this._sendResponse(ws,requestId,true,{sessionId,sessionDescription:result.sessionDescription||null,mid:receivingMid,publisherId,kind,preferredRid});return;
      }
      if(action==='renegotiate'){
        const sessionId=String(payload.sessionId||''),session=this._sessionOwned(ws,sessionId);
        if(!session||session.purpose!=='subscribe')throw Object.assign(new Error('Sessão de recepção encerrada ou substituída. Ressincronize a mídia.'),{code:'SFU_SESSION_STALE'});
        if(!sdpOk(payload.sessionDescription,'answer'))throw Object.assign(new Error('A resposta SDP da recepção está ausente ou é inválida.'),{code:'BAD_SFU_ANSWER'});
        const answer={type:'answer',sdp:payload.sessionDescription.sdp};
        const result=await this._cf('PUT',`/sessions/${encodeURIComponent(sessionId)}/renegotiate`,{sessionDescription:answer});
        ensureCurrent();session.pendingAnswer=false;
        this._sendResponse(ws,requestId,true,{accepted:true,result:result||{}});return;
      }
      if(action==='set-screen-bitrate'){
        const requested=Number(payload.screenBitrate);
        if(![4000000,6000000,8000000,10000000,12000000,15000000].includes(requested))throw Object.assign(new Error('Bitrate de tela inválido.'),{code:'BAD_SCREEN_BITRATE'});
        const pub=this._pubMap(room.id).get(this._pubKey(player.id,'screen'));
        const effective=Math.min(requested,this.policy().highAllowed?15000000:6000000);
        if(pub){pub.screenBitrate=effective;for(const sub of this.subscriptions.values())if(sub.roomId===room.id&&sub.publisherId===player.id&&sub.kind==='screen')sub.estimatedBps=this._subscriptionBps(pub,sub.preferredRid);this.broadcastPublications(room);}
        this._sendResponse(ws,requestId,true,{screenBitrate:effective});return;
      }
      if(action==='update-subscription'){
        const sessionId=String(payload.sessionId||''),session=this._sessionOwned(ws,sessionId),sub=this.subscriptions.get(sessionId);if(!session||!sub||!['camera','screen'].includes(sub.kind))throw Object.assign(new Error('Assinatura de vídeo não encontrada.'),{code:'BAD_SFU_UPDATE'});
        if(session.pendingAnswer)throw Object.assign(new Error('A resposta da negociação ainda está pendente.'),{code:'SFU_NEGOTIATION_PENDING'});
        const pub=this._pubMap(room.id).get(this._pubKey(sub.publisherId,sub.kind));if(!pub)throw Object.assign(new Error('Publicação de vídeo não encontrada.'),{code:'PUBLICATION_NOT_FOUND'});
        const preferredRid=this._clampRid(pub,String(payload.preferredRid||''),player.transmissionQuality||'balanced');
        if(!preferredRid||!pub.rids?.length){sub.preferredRid=null;sub.estimatedBps=this._subscriptionBps(pub,null);this._sendResponse(ws,requestId,true,{preferredRid:null,simulcast:false});return;}
        const result=await this._cf('PUT',`/sessions/${encodeURIComponent(sessionId)}/tracks/update`,{tracks:[{mid:sub.mid,simulcast:{preferredRid,priorityOrdering:'asciibetical',ridNotAvailable:'asciibetical'}}]});
        sub.preferredRid=preferredRid;sub.estimatedBps=this._subscriptionBps(pub,preferredRid);
        this._sendResponse(ws,requestId,true,{preferredRid,result,simulcast:true});return;
      }
      if(action==='close-publication'){
        const sessionId=String(payload.sessionId||''),session=this._sessionOwned(ws,sessionId);if(!session||session.purpose!=='publish')throw Object.assign(new Error('Publicação não encontrada.'),{code:'BAD_SFU_CLOSE'});
        const pub=this._pubMap(room.id).get(this._pubKey(player.id,session.kind));if(pub&&pub.sessionId===sessionId)await this._closePublication(pub,false);else this.sessions.delete(sessionId);
        this.broadcastPublications(room);this._sendResponse(ws,requestId,true,{closed:true});return;
      }
      if(action==='close-subscription'){
        const sessionId=String(payload.sessionId||''),session=this._sessionOwned(ws,sessionId),sub=this.subscriptions.get(sessionId);if(!session||!sub)throw Object.assign(new Error('Assinatura não encontrada.'),{code:'BAD_SFU_CLOSE'});
        await this._closeSubscription(sub,false);this._sendResponse(ws,requestId,true,{closed:true});return;
      }
      this._sendResponse(ws,requestId,false,null,{code:'UNKNOWN_SFU_ACTION',message:'Ação SFU desconhecida.'});
    }catch(err){this._sendResponse(ws,requestId,false,null,{code:err.code||'SFU_REQUEST_FAILED',...this._publicError(err,err.code||'SFU_REQUEST_FAILED')});}
  }

  async _closePublication(pub,silent=false){
    if(!pub)return;
    const related=[...this.subscriptions.values()].filter(s=>s.roomId===pub.roomId&&s.publisherSessionId===pub.sessionId);
    this.sessions.delete(pub.sessionId);const map=this._pubMap(pub.roomId);if(map.get(this._pubKey(pub.ownerId,pub.kind))===pub)map.delete(this._pubKey(pub.ownerId,pub.kind));
    for(const sub of related){this.subscriptions.delete(sub.sessionId);this.sessions.delete(sub.sessionId);}
    try{if(this.configured())await this._cf('PUT',`/sessions/${encodeURIComponent(pub.sessionId)}/tracks/close`,{tracks:[{mid:pub.mid}],force:true});}catch(err){if(!silent)throw err;}
    for(const sub of related)await this._closeSubscription(sub,true).catch(()=>{});
  }
  async _closeSubscription(sub,silent=false){
    if(!sub)return;try{if(this.configured())await this._cf('PUT',`/sessions/${encodeURIComponent(sub.sessionId)}/tracks/close`,{tracks:[{mid:sub.mid}],force:true});}catch(err){if(!silent)throw err;}
    this.subscriptions.delete(sub.sessionId);this.sessions.delete(sub.sessionId);
  }
  async cleanupClient(clientId,roomId){
    const key=`${roomId}:${clientId}`;this.clientGenerations.set(key,(this.clientGenerations.get(key)||0)+1);
    // Capture and detach everything before yielding. A late teardown must never select
    // subscriptions created by the next join to this same room.
    const pubs=[...this._pubMap(roomId).values()].filter(p=>p.ownerId===clientId);
    const subs=[...this.subscriptions.values()].filter(s=>s.roomId===roomId&&s.ownerId===clientId);
    for(const pub of pubs){this.sessions.delete(pub.sessionId);const map=this._pubMap(roomId);if(map.get(this._pubKey(clientId,pub.kind))===pub)map.delete(this._pubKey(clientId,pub.kind));}
    for(const sub of subs){this.sessions.delete(sub.sessionId);this.subscriptions.delete(sub.sessionId);}
    for(const pub of pubs)await this._closePublication(pub,true).catch(()=>{});
    for(const sub of subs)await this._closeSubscription(sub,true).catch(()=>{});
    const room=this.rooms.get(roomId);if(room)this.broadcastPublications(room);
  }
}

module.exports={RealtimeSfuManager,PROFILE};
