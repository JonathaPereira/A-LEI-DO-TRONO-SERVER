'use strict';
const crypto=require('node:crypto');
// Only session negotiation goes through the server. Input and video use the
// separately consented WebRTC connection; room voice mode is never modified.
class RemotePc {
  constructor({rooms,send,ice,now=Date.now}){Object.assign(this,{rooms,send,ice,now});this.sessions=new Map();this.byClient=new Map();this.rates=new WeakMap();}
  player(ws){return ws?.readyState===1&&ws.account?.expiresAt>this.now()?this.rooms.get(ws.roomId)?.players.get(ws.clientId):null;}
  available(ws){const p=this.player(ws);return !!p?.voiceJoined&&!p.mediaBlocked;}
  valid(s){return this.available(s.host)&&this.available(s.viewer)&&s.host.roomId===s.room&&s.viewer.roomId===s.room&&s.host.account.id!==s.viewer.account.id;}
  emit(s,type,extra={}){for(const ws of [s.host,s.viewer])this.send(ws,{type,sessionId:s.id,...extra});}
  finish(s,reason='ended'){if(!s||!this.sessions.has(s.id))return;this.sessions.delete(s.id);for(const ws of [s.host,s.viewer])if(this.byClient.get(ws.clientId)===s.id)this.byClient.delete(ws.clientId);this.emit(s,'remote-ended',{reason});}
  disconnect(ws){this.finish(this.sessions.get(this.byClient.get(ws.clientId)),'disconnected');}
  sweep(){for(const s of this.sessions.values())if(!this.valid(s)||this.now()-s.created>4*60*60*1000||this.now()-s.hostSeen>15000||this.now()-s.viewerSeen>15000||s.state==='invited'&&this.now()-s.created>60000)this.finish(s,'expired');}
  async handle(ws,m){
    const reply=(data,error)=>this.send(ws,{type:'remote-response',requestId:String(m.requestId||'').slice(0,80),ok:!error,...(error?{error:{code:'REMOTE_PC',message:error}}:{data})});
    try{
      if(!this.available(ws))return reply(null,'Entre na voz com sua conta para compartilhar um PC.');
      let rate=this.rates.get(ws);if(!rate||rate.until<this.now()){rate={count:0,until:this.now()+1000};this.rates.set(ws,rate);}if(++rate.count>100)return reply(null,'Aguarde antes de tentar novamente.');
      this.sweep();
      if(m.action==='invite'){
        const room=this.rooms.get(ws.roomId),viewer=room.players.get(m.targetId)?.ws;
        if(!this.available(viewer)||viewer===ws||viewer.account.id===ws.account.id)return reply(null,'Escolha outra pessoa conectada à mesma voz.');
        if(this.byClient.has(ws.clientId)||this.byClient.has(viewer.clientId))return reply(null,'Um dos participantes já tem uma sessão de PC aberta.');
        const s={id:crypto.randomUUID(),host:ws,viewer,room:room.id,state:'invited',created:this.now(),hostSeen:this.now(),viewerSeen:this.now()};this.sessions.set(s.id,s);this.byClient.set(ws.clientId,s.id);this.byClient.set(viewer.clientId,s.id);
        this.send(viewer,{type:'remote-invite',sessionId:s.id,hostName:ws.account.nickname,hostId:ws.clientId});return reply({sessionId:s.id});
      }
      const s=this.sessions.get(m.sessionId);if(!s||![s.host,s.viewer].includes(ws)||!this.valid(s))return reply(null,'A sessão de PC não está mais disponível.');
      if(ws===s.host)s.hostSeen=this.now();else s.viewerSeen=this.now();
      if(m.action==='end'){this.finish(s,'ended');return reply({ended:true});}
      if(m.action==='heartbeat')return reply({active:true});
      if(m.action==='accept'){
        if(ws!==s.viewer||s.state!=='invited')return reply(null,'Convite indisponível.');s.state='accepted';
        this.send(s.host,{type:'remote-ready',sessionId:s.id,role:'host',peerName:s.viewer.account.nickname});this.send(s.viewer,{type:'remote-ready',sessionId:s.id,role:'viewer',peerName:s.host.account.nickname});return reply({accepted:true});
      }
      if(s.state!=='accepted')return reply(null,'O convite precisa ser aceito primeiro.');
      if(m.action==='ice'){const config=await this.ice();if(this.sessions.get(s.id)!==s||!this.valid(s))return reply(null,'Sessão encerrada.');return reply(config);}
      if(m.action==='signal'){
        const p=m.signal;if(!p||typeof p!=='object'||JSON.stringify(p).length>100000)return reply(null,'Sinal inválido.');
        if(p.type==='offer'&&ws===s.host&&typeof p.sdp==='string'||p.type==='answer'&&ws===s.viewer&&typeof p.sdp==='string'||p.type==='candidate'&&(p.candidate===null||typeof p.candidate?.candidate==='string'&&p.candidate.candidate.length<2048)){
          this.send(ws===s.host?s.viewer:s.host,{type:'remote-signal',sessionId:s.id,signal:p});return reply({sent:true});
        }
        return reply(null,'Sinal não permitido.');
      }
      return reply(null,'Operação indisponível.');
    }catch{return reply(null,'Não foi possível iniciar o compartilhamento de PC.');}
  }
}
module.exports={RemotePc};
