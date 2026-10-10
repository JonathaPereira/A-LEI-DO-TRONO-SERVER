'use strict';
const crypto=require('crypto');
const {validNickname}=require('./auth');

function createCommunity({wss,rooms,send,auth,env=process.env}){
  const members=new Map(),tickets=new Map();
  let directoryReady=false,loading=false;
  const validAccount=ws=>ws.account&&ws.account.expiresAt>Date.now();
  const validGuest=ws=>ws.guest&&ws.guest.expiresAt>Date.now();
  function note(ws){
    const identity=validAccount(ws)?ws.account:validGuest(ws)?ws.guest:null;
    if(!identity)return;
    const id=identity.id;
    members.set(id,{id,name:identity.nickname,guest:!!identity.guest,role:identity.guest?'guest':identity.role||'member',avatar_preset:identity.avatar_preset||'person',avatar_file_id:identity.avatar_file_id||null,lastSeen:Date.now()});
  }
  function snapshot(ws){
    const full=!!validAccount(ws),online=new Map();
    for(const client of wss.clients){if(client.readyState!==1)continue;note(client);const id=validAccount(client)?client.account.id:validGuest(client)?client.guest.id:null;if(!id)continue;const primary=rooms.get(client.roomId),room=primary?.players.get(client.clientId)?.voiceJoined?primary:rooms.get(client.textRoomId)||primary,player=room?.players.get(client.clientId);if(!full&&room?.kind!=='game')continue;const old=online.get(id);if(!old||room)online.set(id,{online:true,roomId:room?.id||null,roomName:room?.name||null,roomKind:room?.kind||null,inVoice:!!player?.voiceJoined});}
    const list=[];
    for(const m of members.values()){
      if(!full&&!online.has(m.id))continue;
      list.push({...m,...(online.get(m.id)||{online:false,roomId:null,roomName:null,roomKind:null,inVoice:false})});
    }
    list.sort((a,b)=>Number(b.online)-Number(a.online)||a.name.localeCompare(b.name,'pt-BR'));
    return {type:'presence',scope:full?'community':'game',directoryReady:full&&directoryReady,members:list.slice(0,1000)};
  }
  function broadcast(){for(const ws of wss.clients)if(validAccount(ws)||validGuest(ws))send(ws,snapshot(ws));}
  async function refreshDirectory(){
    const secret=env.SUPABASE_SECRET_KEY||env.SUPABASE_SERVICE_ROLE_KEY;
    if(loading||!auth.configured||!secret)return;
    loading=true;
    try{
      const response=await fetch(`${String(env.SUPABASE_URL).replace(/\/+$/,'')}/rest/v1/rpc/chat_member_directory`,{method:'POST',headers:{apikey:secret,...(!secret.startsWith('sb_secret_')?{Authorization:`Bearer ${secret}`}:{ }),'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(12000)});
      if(!response.ok)throw new Error('directory unavailable');
      const rows=await response.json();if(!Array.isArray(rows))throw new Error('invalid directory');
      const ids=new Set(rows.map(p=>p.id));
      for(const [id,m]of members)if(!m.guest&&!ids.has(id))members.delete(id);
      for(const row of rows)members.set(row.id,{id:row.id,name:row.nickname,guest:false,role:['creator','admin'].includes(row.role)?row.role:'member',avatar_preset:row.avatar_preset||'crown',avatar_file_id:row.avatar_file_id||null,lastSeen:members.get(row.id)?.lastSeen||null});
      directoryReady=true;broadcast();
    }catch{directoryReady=false;}finally{loading=false;}
  }
  function nameReserved(name){return [...members.values()].some(m=>!m.guest&&m.name.normalize('NFKC').toLocaleLowerCase('pt-BR')===name.normalize('NFKC').toLocaleLowerCase('pt-BR'));}
  function guest(ws,message){
    if(validAccount(ws))throw Object.assign(Error('Sua conta já está conectada. Use seu perfil para jogar.'),{code:'ALREADY_AUTHENTICATED'});
    const ticket=typeof message.ticket==='string'?message.ticket:'';
    let identity=tickets.get(ticket),nickname=String(message.name||identity?.nickname||'').trim().normalize('NFKC');
    if(!validNickname(nickname))throw Object.assign(Error('Escolha um nome de 2 a 20 caracteres: letras, números, espaço, ponto, hífen ou sublinhado.'),{code:'INVALID_NICKNAME'});
    if(nameReserved(nickname))throw Object.assign(Error('Esse apelido pertence a uma conta. Escolha outro nome para o convidado.'),{code:'NAME_TAKEN'});
    if(identity?.expiresAt<=Date.now())identity=null;
    if(identity&&ws.roomId&&ws.guest?.id===identity.id&&nickname!==identity.nickname)throw Object.assign(Error('Saia da sala para mudar o nome de convidado.'),{code:'GUEST_IN_ROOM'});
    if(!identity){if(tickets.size>=500)throw Object.assign(Error('Muitos convidados conectados. Tente novamente mais tarde.'),{code:'GUEST_BUSY'});identity={id:`guest:${crypto.randomUUID()}`,nickname,guest:true,avatar_preset:'person',avatar_file_id:null,expiresAt:Date.now()+12*60*60*1000,ticket:crypto.randomBytes(32).toString('hex')};tickets.set(identity.ticket,identity);}else identity.nickname=nickname;
    return identity;
  }
  const timer=setInterval(()=>{for(const [key,g]of tickets)if(g.expiresAt<=Date.now()){tickets.delete(key);members.delete(g.id);}void refreshDirectory();broadcast();},30000);timer.unref();
  void refreshDirectory();
  return {note,snapshot,broadcast,guest,validGuest,nameReserved,refreshDirectory,health:()=>({directoryReady}),stop:()=>clearInterval(timer)};
}
module.exports={createCommunity};
