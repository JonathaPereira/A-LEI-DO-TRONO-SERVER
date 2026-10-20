'use strict';
const {permissions}=require('./roles');
const KICK_MS=5*60*1000;
class VoiceModeration{
 constructor({rooms,send,changed,removed,restricted,now=Date.now}){Object.assign(this,{rooms,send,changed,removed,restricted,now});this.rules=new WeakMap();this.rates=new WeakMap();}
 key(ws){return ws.account?.id?'account:'+ws.account.id:ws.guest?.id?'guest:'+ws.guest.id:'client:'+ws.clientId;}
 state(room,ws){const map=this.rules.get(room),key=this.key(ws),rule=map?.get(key);if(!rule)return {muted:false,mediaBlocked:false,blockedUntil:0};if(rule.blockedUntil<=this.now())rule.blockedUntil=0;return {...rule};}
 entry(room,ws){let map=this.rules.get(room);if(!map)this.rules.set(room,map=new Map());const key=this.key(ws);let rule=map.get(key);if(!rule)map.set(key,rule={muted:false,mediaBlocked:false,blockedUntil:0});return rule;}
 enforce(room,player){const rule=this.state(room,player.ws);player.serverMuted=rule.muted;player.mediaBlocked=rule.mediaBlocked;if(rule.muted)player.voiceMuted=true;if(rule.mediaBlocked){player.cameraOn=false;player.screenOn=false;}return rule;}
 mayJoin(room,ws){const rule=this.state(room,ws);if(!rule.blockedUntil)return true;this.send(ws,{type:'voice-moderated',roomId:room.id,action:'kick',blockedUntil:rule.blockedUntil,message:'Você foi removido desta chamada. Aguarde 5 minutos para entrar novamente.'});return false;}
 handle(ws,message){
  const requestId=String(message.requestId||'').slice(0,80),reply=(ok,error)=>this.send(ws,{type:'voice-moderation-result',requestId,ok,error});
  const room=this.rooms.get(ws.roomId),actor=room?.players.get(ws.clientId),target=room?.players.get(String(message.targetId||''));
  if(!ws.account||ws.account.expiresAt<=this.now()||!permissions(ws.account.role).moderateVoice||!actor?.voiceJoined)return reply(false,'Apenas administradores e criador na chamada podem moderar.');
  if(!target?.voiceJoined||target===actor)return reply(false,'Escolha outra pessoa desta chamada.');
  const role=target.guest?'guest':target.ws.account?.role||'member';if(role==='creator'||(role==='admin'&&ws.account.role!=='creator'))return reply(false,'Você não pode moderar este perfil.');
  const action=message.action;if(!['mute','unmute','block-media','allow-media','kick'].includes(action))return reply(false,'Ação de moderação inválida.');
  const now=this.now(),rate=this.rates.get(ws)||{until:now+10000,count:0};if(rate.until<=now){rate.until=now+10000;rate.count=0;}this.rates.set(ws,rate);if(++rate.count>15)return reply(false,'Aguarde alguns segundos antes de moderar novamente.');
  const rule=this.entry(room,target.ws);if(action==='mute')rule.muted=true;if(action==='unmute')rule.muted=false;if(action==='block-media')rule.mediaBlocked=true;if(action==='allow-media')rule.mediaBlocked=false;
  const descriptions={mute:'Seu microfone foi silenciado pela moderação.',unmute:'A moderação liberou seu microfone. Ative-o quando quiser.', 'block-media':'Câmera e compartilhamentos bloqueados pela moderação.', 'allow-media':'A moderação liberou câmera e compartilhamentos.',kick:'Você foi removido desta chamada por 5 minutos.'};
  if(action==='kick'){rule.blockedUntil=now+KICK_MS;this.removed(room,target);}
  this.enforce(room,target);
  this.send(target.ws,{type:'voice-moderated',roomId:room.id,action,moderator:actor.name,muted:rule.muted,mediaBlocked:rule.mediaBlocked,blockedUntil:rule.blockedUntil,message:descriptions[action]});
  // Capture enforcement before any asynchronous SFU cleanup.
  if(rule.muted||rule.mediaBlocked)void this.restricted(room,target);
  this.changed(room);reply(true);
 }
}
module.exports={VoiceModeration,KICK_MS};
