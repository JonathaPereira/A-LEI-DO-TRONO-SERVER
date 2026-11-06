import { randomBytes, randomInt, randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { act, currentUnit, canUse, legalTargets, getAction, RULES } from '../src/engine.js';
import { BUILD, PVP, defaultLoadout, validateLoadout, createPvpBattle } from './pvp-loadout.mjs';
const hash=value=>createHash('sha256').update(value).digest();
const ACTIONS=['basic','skill','ultimate','guard'];
export class PvpRooms {
  constructor(store,{turnMs=90000,reconnectMs=60000,idleMs=1800000,maxRooms=32}={}) {this.store=store;this.options={turnMs,reconnectMs,idleMs,maxRooms};this.rooms=new Map();}
  send(peer,data){if(peer?.readyState===1)peer.send(JSON.stringify(data));}
  error(peer,text){this.send(peer,{type:'error',message:text});}
  public(room){return {type:'room',serverTime:Date.now(),code:room.code,phase:room.phase,seq:room.seq,matchId:room.matchId||'',deadline:room.deadline||0,players:room.players.map((p,index)=>p?{name:p.name,connected:p.peer?.readyState===1,ready:p.ready,side:p.side,seat:index,loadout:p.loadout}:null),state:room.state||null,reason:room.reason||'',logStatus:this.store.status()};}
  broadcast(room,data=this.public(room)){for(const player of room.players)this.send(player?.peer,data);}
  bind(peer,room,seat,token){peer.room=room.code;peer.seat=seat;room.players[seat].peer=peer;room.players[seat].disconnectedAt=0;this.send(peer,{type:'session',code:room.code,seat,token});this.broadcast(room);}
  receive(peer,message){
    if(!message||typeof message!=='object'||Array.isArray(message))throw Error('Mensagem inválida.');
    if(message.build!==BUILD)throw Error('Versão diferente do servidor. Atualize o jogo antes de entrar.');
    if(message.type==='resume'){
      if(peer.room)throw Error('Você já está em uma sala.');
      const room=this.rooms.get(String(message.code));const seat=room?.players.findIndex(p=>p&&typeof message.token==='string'&&message.token.length<128&&timingSafeEqual(p.tokenHash,hash(message.token)));
      if(!room||seat<0||seat===undefined)throw Error('Sessão expirada. Crie ou entre em uma sala novamente.');
      const old=room.players[seat].peer;room.players[seat].peer=peer;if(old&&old!==peer)old.close(4001,'Sessão retomada');
      this.bind(peer,room,seat,message.token);return;
    }
    if(message.type==='create'||message.type==='join'){
      if(peer.room)throw Error('Saia da sala atual primeiro.');
      const name=String(message.name||'Jogador').replace(/[\x00-\x1f\x7f<>\[\]]/g,'').trim().slice(0,24)||'Jogador';
      let room,seat;
      if(message.type==='create'){
        if(this.rooms.size>=this.options.maxRooms)throw Error('Servidor cheio. Tente novamente em instantes.');
        let code;do{code=randomBytes(4).toString('hex').slice(0,6).toUpperCase();}while(this.rooms.has(code));
        room={code,phase:'preparing',players:[null,null],seq:0,touched:Date.now()};seat=0;this.rooms.set(code,room);
      }else{
        room=this.rooms.get(String(message.code).toUpperCase());
        if(!room||room.phase!=='preparing'||room.players.every(Boolean))throw Error('Sala indisponível, cheia ou já em combate.');
        seat=room.players.findIndex(p=>!p);
      }
      const token=randomBytes(32).toString('base64url');room.players[seat]={name,tokenHash:hash(token),loadout:defaultLoadout(seat),side:seat,ready:false,peer};room.touched=Date.now();this.bind(peer,room,seat,token);return;
    }
    const room=this.rooms.get(peer.room);const player=room?.players[peer.seat];
    if(!room||player?.peer!==peer)throw Error('Entre em uma sala primeiro.');
    room.touched=Date.now();
    if(message.type==='leave'){
      if(room.phase==='playing')this.finish(room,1-player.side,'surrender');
      room.players[peer.seat]=null;peer.room=null;peer.seat=null;
      if(room.phase==='preparing')for(const p of room.players)if(p)p.ready=false;
      this.send(peer,{type:'left'});this.broadcast(room);if(!room.players.some(Boolean))this.rooms.delete(room.code);return;
    }
    if(message.type==='rematch'){
      if(room.phase!=='finished')throw Error('A partida ainda não terminou.');
      room.phase='preparing';room.state=null;room.deadline=0;room.seq=0;room.reason='';room.matchId='';for(const p of room.players)if(p)p.ready=false;this.broadcast(room);return;
    }
    if(message.type==='loadout'||message.type==='ready'){
      if(room.phase!=='preparing')throw Error('A formação está travada durante o combate.');
      if(message.type==='loadout'){
        if(player.ready)throw Error('Cancele a confirmação para editar sua equipe.');
        player.loadout=validateLoadout(message.loadout);
      }else{player.loadout=validateLoadout(player.loadout);player.ready=message.ready===true;}
      if(room.players.every(p=>p&&p.ready&&p.peer?.readyState===1))this.start(room);
      else this.broadcast(room);return;
    }
    if(message.type==='action'){
      if(room.phase!=='playing')throw Error('A sala não está em combate.');
      if(room.players.some(p=>!p||p.peer?.readyState!==1))throw Error('Aguarde a reconexão do adversário.');
      if(message.seq!==room.seq)throw Error('Ação repetida ou turno desatualizado.');
      if(Date.now()>room.deadline)throw Error('O tempo do turno terminou.');
      const actor=currentUnit(room.state);
      if(actor.side!==player.side)throw Error('Aguarde a sua vez.');
      if(!ACTIONS.includes(message.actionId)||typeof message.targetId!=='string'||!canUse(actor,message.actionId))throw Error('Habilidade indisponível.');
      if(!legalTargets(room.state,actor,getAction(actor,message.actionId)).some(u=>u.id===message.targetId))throw Error('Alvo inválido.');
      const round=room.state.round;const result=act(room.state,message.actionId,message.targetId);room.seq++;
      const after=structuredClone(room.state);delete after.log;
      room.trace.steps.push({seq:room.seq,round,actor:result.actor,actionId:message.actionId,targetId:message.targetId,result:structuredClone(result),after});
      room.deadline=Date.now()+this.options.turnMs;
      if(room.state.phase==='finished')this.finish(room,room.state.winner,'combat',false);
      this.broadcast(room,{...this.public(room),type:'turn',result,actionId:message.actionId,targetId:message.targetId});return;
    }
    throw Error('Operação desconhecida.');
  }
  start(room){
    const first=randomInt(2);room.players[0].side=first;room.players[1].side=1-first;
    const players=[...room.players].sort((a,b)=>a.side-b.side);const seed=randomInt(0x100000000);room.state=createPvpBattle(players.map(p=>p.loadout),seed);
    room.phase='playing';room.seq=0;room.matchId=randomUUID();room.deadline=Date.now()+this.options.turnMs;
    room.trace={id:room.matchId,mode:'pvp',schemaVersion:1,rulesVersion:RULES.rulesVersion,pvpVersion:PVP.version,build:BUILD,inventory:PVP.inventory,seed,startedAt:new Date().toISOString(),players:players.map(p=>({name:p.name})),loadouts:players.map(p=>structuredClone(p.loadout)),initial:structuredClone(room.state),steps:[]};this.broadcast(room);
  }
  finish(room,winner,reason,broadcast=true){
    if(room.phase!=='playing')return;
    room.phase='finished';room.reason=reason;room.state.phase='finished';room.state.winner=winner;room.deadline=0;
    const record={...room.trace,winner,reason,endedAt:new Date().toISOString(),durationMs:Date.now()-Date.parse(room.trace.startedAt),actions:room.state.turns,rounds:room.state.round,finalState:structuredClone(room.state)};
    this.store.save(record);if(broadcast)this.broadcast(room);
  }
  disconnected(peer){const room=this.rooms.get(peer.room);const player=room?.players[peer.seat];if(player?.peer!==peer)return;player.peer=null;player.disconnectedAt=Date.now();if(room.phase==='preparing')player.ready=false;this.broadcast(room);}
  tick(now=Date.now()){
    for(const room of this.rooms.values()){
      if(room.phase==='playing'){
        const absent=room.players.filter(p=>!p?.peer||p.peer.readyState!==1);
        if(absent.some(p=>now-(p?.disconnectedAt||now)>=this.options.reconnectMs)){
          const connected=room.players.filter(p=>p?.peer?.readyState===1);this.finish(room,connected.length===1?connected[0].side:null,'disconnect');
        }else if(!absent.length&&now>room.deadline)this.finish(room,1-currentUnit(room.state).side,'timeout');
        // Reconnection pauses the turn clock, but has its own hard deadline.
        else if(absent.length)room.deadline=now+this.options.turnMs;
      }
      if(room.phase!=='playing'&&now-room.touched>this.options.idleMs){for(const p of room.players)if(p?.peer){p.peer.room=null;this.error(p.peer,'Sala expirada por inatividade.');p.peer.close(4000,'Sala expirada');}this.rooms.delete(room.code);}
    }
  }
}
