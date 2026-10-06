'use strict';

const express = require('express');
const http = require('http');
const crypto = require('crypto');
const { WebSocketServer, WebSocket } = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const PORT = Number(process.env.PORT || 10000);
const HOST = '0.0.0.0';
const VERSION = '0.5.1-alpha';

const SUITS = ['cetro','chave','lamina','mascara'];
const LAWS = ['ordem','estandarte','revolta','anarquia','usurpacao'];
const DECREES = [
  {id:'reserva', name:'Reserva', icon:'▣', text:'Cada jogador separa 1 carta. Ela fica fora da mão nas 9 primeiras vazas e deve ser jogada na 10ª.'},
  {id:'rotacao', name:'Rotação', icon:'⟳', text:'Após as vazas 7, 8 e 9, todos passam simultaneamente 1 carta ao jogador à esquerda.'},
  {id:'corte', name:'Corte Aberta', icon:'◉', text:'No início da rodada, cada jogador revela 1 carta da mão. Ela permanece pública até ser usada.'},
  {id:'desafio', name:'Desafio', icon:'⚔', text:'Na primeira Coroa de cada jogador, revele 1 carta. Novas Coroas consecutivas revelam mais 1.'},
  {id:'silencio', name:'Silêncio', icon:'⊘', text:'Nas 5 primeiras vazas, ninguém pode gastar Influência. A partir da 6ª, funciona normalmente.'},
  {id:'sucessao', name:'Sucessão', icon:'♛', text:'O próximo líder não pode abrir com o naipe que venceu a vaza anterior, salvo se não possuir outro.'},
];
const decreeById = Object.fromEntries(DECREES.map(d=>[d.id,d]));

const roomDefs = [
  ['sala-cetro', 'Sala do Cetro'],
  ['sala-chave', 'Sala da Chave'],
  ['sala-mascara', 'Sala da Máscara'],
];

const rooms = new Map(roomDefs.map(([id, name]) => [id, {
  id,
  name,
  max: 4,
  players: new Map(),
  createdAt: Date.now(),
  game: null,
}]));

const rand = n => Math.floor(Math.random()*n);
function shuffle(arr){
  const a=[...arr];
  for(let i=a.length-1;i>0;i--){ const j=rand(i+1); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}
function sanitizeName(value) {
  const name = String(value || 'Jogador').replace(/[<>]/g, '').trim().slice(0, 18);
  return name || 'Jogador';
}
function makeDeck(){
  let id=0; const deck=[];
  for(const suit of SUITS) for(let value=1;value<=12;value++) deck.push({id:`c${id++}`,suit,value,public:false,publicReason:null});
  return deck;
}
function sortHand(hand){
  hand.sort((a,b)=>SUITS.indexOf(a.suit)-SUITS.indexOf(b.suit)||a.value-b.value);
}
function nextFreeSeat(room) {
  const occupied = new Set([...room.players.values()].map(p => p.seat));
  for (let seat = 0; seat < room.max; seat += 1) if (!occupied.has(seat)) return seat;
  return null;
}
function roomHostId(room) {
  const sorted = [...room.players.values()].sort((a, b) => a.seat - b.seat);
  return sorted[0]?.id || null;
}
function publicPlayer(room, player) {
  return {id:player.id,name:player.name,seat:player.seat,ready:!!player.ready,host:player.id===roomHostId(room)};
}
function safeRoom(room) {
  return {
    id:room.id,name:room.name,max:room.max,count:room.players.size,
    gameActive:!!room.game && room.game.phase!=='game-over',
    players:[...room.players.values()].sort((a,b)=>a.seat-b.seat).map(p=>publicPlayer(room,p)),
  };
}
function safeRooms(){ return [...rooms.values()].map(safeRoom); }
function send(ws,payload){ if(ws?.readyState===WebSocket.OPEN) ws.send(JSON.stringify(payload)); }
function broadcastAll(payload){ for(const client of wss.clients) send(client,payload); }
function broadcastRooms(){ broadcastAll({type:'rooms',rooms:safeRooms()}); }
function roomHumanBySeat(room,seat){ return [...room.players.values()].find(p=>p.seat===seat) || null; }
function playerSocketBySeat(room,seat){ return roomHumanBySeat(room,seat)?.ws || null; }
function broadcastRoom(room){
  const payload={type:'room-state',room:safeRoom(room)};
  for(const p of room.players.values()) send(p.ws,payload);
}
function sendToSeat(room,seat,payload){ const ws=playerSocketBySeat(room,seat); if(ws) send(ws,payload); }
function broadcastGameEvent(room,payload){ for(const p of room.players.values()) send(p.ws,{type:'game-event',...payload}); }
function broadcastLog(room,message){ broadcastGameEvent(room,{event:'log',message}); }
function schedule(room,fn,ms=450){
  if(!room.game) return;
  const token=room.game.token;
  setTimeout(()=>{ if(room.game?.token===token) { try{ fn(); }catch(err){ console.error(err); broadcastGameEvent(room,{event:'server-error',message:err.message}); } } },ms);
}

function leaveRoom(ws, reason='leave') {
  if (!ws.roomId) return;
  const room=rooms.get(ws.roomId);
  if(!room){ ws.roomId=null; return; }
  const leaving=room.players.get(ws.clientId);
  room.players.delete(ws.clientId); ws.roomId=null;

  if(room.game && leaving){
    const gp=room.game.players[leaving.seat];
    if(gp && !gp.bot){
      gp.bot=true; gp.clientId=null; gp.name=`${leaving.name} (IA)`;
      broadcastGameEvent(room,{event:'player-replaced-by-bot',seat:leaving.seat,name:leaving.name});
      if(room.game.turn===leaving.seat && room.game.phase==='await-play') schedule(room,()=>advanceTurn(room),650);
      if(room.game.pending && room.game.pending.waiting?.has(leaving.seat)) {
        autoResolvePendingSeat(room,leaving.seat);
      }
    }
  }

  broadcastRoom(room); broadcastRooms();
  if(leaving){
    for(const p of room.players.values()) send(p.ws,{type:'player-left',roomId:room.id,playerId:leaving.id,name:leaving.name,reason});
  }
}

function joinRoom(ws,roomId,rawName){
  const room=rooms.get(roomId);
  if(!room){ send(ws,{type:'error',code:'ROOM_NOT_FOUND',message:'Sala inexistente.'}); return; }
  if(room.game && room.game.phase!=='game-over') { send(ws,{type:'error',code:'GAME_IN_PROGRESS',message:'Esta sala já está em partida.'}); return; }
  if(ws.roomId===roomId && room.players.has(ws.clientId)){ send(ws,{type:'joined-room',room:safeRoom(room),me:publicPlayer(room,room.players.get(ws.clientId))}); return; }
  leaveRoom(ws,'switch-room');
  if(room.players.size>=room.max){ send(ws,{type:'error',code:'ROOM_FULL',message:'Sala cheia.'}); return; }
  const seat=nextFreeSeat(room); if(seat===null){ send(ws,{type:'error',code:'NO_SEAT',message:'Nenhum assento disponível.'}); return; }
  const player={id:ws.clientId,name:sanitizeName(rawName),seat,ready:false,joinedAt:Date.now(),ws};
  room.players.set(ws.clientId,player); ws.roomId=room.id;
  send(ws,{type:'joined-room',room:safeRoom(room),me:publicPlayer(room,player)});
  broadcastRoom(room); broadcastRooms();
}
function setReady(ws,ready){
  const room=rooms.get(ws.roomId), player=room?.players.get(ws.clientId);
  if(!room||!player){ send(ws,{type:'error',code:'NOT_IN_ROOM',message:'Você não está em uma sala.'}); return; }
  if(room.game && room.game.phase!=='game-over'){ send(ws,{type:'error',code:'GAME_IN_PROGRESS',message:'A partida já começou.'}); return; }
  player.ready=!!ready; broadcastRoom(room); broadcastRooms();
}

function makeMatchPlayer(room,seat){
  const hp=roomHumanBySeat(room,seat);
  return {
    id:seat, seat,
    clientId:hp?.id||null,
    name:hp?.name || ['Casa do Cetro','Casa da Chave','Casa da Lâmina','Casa da Máscara'][seat],
    bot:!hp,
    hand:[],reserve:null,
    totalCrowns:0,totalShadows:0,roundCrowns:0,roundShadows:0,influence:0,hadCrown:false,crownStreak:0,
  };
}
function totalPairs(p){ return Math.min(p.totalCrowns,p.totalShadows); }
function prestige(p){ return p.totalCrowns+p.totalShadows+2*totalPairs(p); }
function rawAccumulated(p){ return p.totalCrowns+p.totalShadows; }

function requestStart(ws){
  const room=rooms.get(ws.roomId), player=room?.players.get(ws.clientId);
  if(!room||!player){ send(ws,{type:'error',code:'NOT_IN_ROOM',message:'Você não está em uma sala.'}); return; }
  if(roomHostId(room)!==ws.clientId){ send(ws,{type:'error',code:'NOT_HOST',message:'Somente o anfitrião pode iniciar.'}); return; }
  if(room.players.size<2){ send(ws,{type:'error',code:'NOT_ENOUGH_PLAYERS',message:'São necessários pelo menos 2 jogadores online. As vagas restantes serão preenchidas por IAs.'}); return; }
  const notReady=[...room.players.values()].filter(p=>!p.ready);
  if(notReady.length){ send(ws,{type:'error',code:'PLAYERS_NOT_READY',message:'Todos os jogadores precisam marcar Pronto.'}); return; }
  if(room.game && room.game.phase!=='game-over'){ send(ws,{type:'error',code:'GAME_ALREADY_STARTED',message:'A partida já foi iniciada.'}); return; }
  startGame(room);
}

function startGame(room){
  const players=[0,1,2,3].map(seat=>makeMatchPlayer(room,seat));
  const firstStarter=rand(4);
  room.game={
    token:crypto.randomUUID(),
    players,round:1,trick:1,deck:[],undealt:[],decree:null,
    lawUsage:Object.fromEntries(LAWS.map(l=>[l,0])),currentLaw:'ordem',trump:null,declaredLeadSuit:null,
    leader:firstStarter,firstRoundStarter:firstStarter,lastCrown:null,lastShadow:null,previousWinningSuit:null,
    plays:[],turn:null,phase:'starting',pending:null,promptSeq:0,
  };
  for(const p of room.players.values()) p.ready=false;
  broadcastRoom(room); broadcastRooms();
  for(const hp of room.players.values()) send(hp.ws,{type:'game-started',seat:hp.seat,room:safeRoom(room),version:VERSION});
  broadcastLog(room,`Partida online iniciada. ${players[firstStarter].name} foi sorteado para abrir a primeira rodada.`);
  setupRound(room);
}

function resetRoundStats(game){
  for(const p of game.players){ p.hand=[];p.reserve=null;p.roundCrowns=0;p.roundShadows=0;p.influence=0;p.hadCrown=false;p.crownStreak=0; }
}
function setupRound(room){
  const g=room.game; if(!g) return;
  g.phase='round-start';g.trick=1;g.currentLaw='ordem';g.trump=null;g.declaredLeadSuit=null;
  g.lawUsage=Object.fromEntries(LAWS.map(l=>[l,0]));g.lastCrown=null;g.lastShadow=null;g.previousWinningSuit=null;g.plays=[];g.turn=null;g.pending=null;
  resetRoundStats(g);
  const deck=shuffle(makeDeck());
  for(let i=0;i<10;i++) for(let seat=0;seat<4;seat++) g.players[seat].hand.push(deck.pop());
  g.undealt=deck;
  for(const p of g.players) sortHand(p.hand);
  broadcastLog(room,`Rodada ${g.round}: as cartas foram distribuídas. A primeira Lei será Ordem.`);
  chooseDecreeStage(room);
}
function chooseDecreeStage(room){
  const g=room.game;
  const min=Math.min(...g.players.map(rawAccumulated));
  const tied=g.players.filter(p=>rawAccumulated(p)===min);
  const chooser=tied[rand(tied.length)];
  const picks=shuffle(DECREES).slice(0,2).map(d=>d.id);
  g.phase='choose-decree';
  g.pending={kind:'decree',seat:chooser.seat,options:picks};
  broadcastGameState(room);
  if(chooser.bot){ schedule(room,()=>applyDecreeChoice(room,chooser.seat,picks[rand(picks.length)]),650); }
  else sendPrompt(room,chooser.seat,{kind:'choose-decree',title:'Escolha o Decreto',options:picks});
}
function applyDecreeChoice(room,seat,decreeId){
  const g=room.game; if(!g?.pending||g.pending.kind!=='decree'||g.pending.seat!==seat||!g.pending.options.includes(decreeId)) return false;
  g.decree=decreeById[decreeId];g.pending=null;
  broadcastLog(room,`${g.players[seat].name} escolheu o Decreto ${g.decree.name}.`);
  if(decreeId==='reserva') startMultiCardStage(room,'reserva');
  else if(decreeId==='corte') startMultiCardStage(room,'corte');
  else beginTrick(room);
  return true;
}
function startMultiCardStage(room,kind){
  const g=room.game;
  g.phase=`choose-${kind}`;
  g.pending={kind,waiting:new Set(),choices:new Map()};
  for(const p of g.players){
    if(p.bot){ g.pending.choices.set(p.seat,chooseBotCard(p,kind)); }
    else { g.pending.waiting.add(p.seat); sendPrompt(room,p.seat,{kind:`choose-${kind}`,title:kind==='reserva'?'Escolha sua Reserva':'Corte Aberta',cardIds:p.hand.map(c=>c.id)}); }
  }
  broadcastGameState(room);
  maybeFinishMultiStage(room);
}
function chooseBotCard(p,kind){
  if(kind==='reserva') return [...p.hand].sort((a,b)=>Math.abs(a.value-6.5)-Math.abs(b.value-6.5))[0]?.id;
  return p.hand[rand(p.hand.length)]?.id;
}
function maybeFinishMultiStage(room){
  const g=room.game,p=g?.pending; if(!p||!['reserva','corte','rotation'].includes(p.kind)||p.waiting.size) return;
  if(p.kind==='reserva'){
    for(const pl of g.players){ const id=p.choices.get(pl.seat); const idx=pl.hand.findIndex(c=>c.id===id); if(idx<0) continue; pl.reserve=pl.hand.splice(idx,1)[0]; }
    g.pending=null; broadcastLog(room,'Todas as Casas separaram sua carta de Reserva.'); broadcastGameState(room); beginTrick(room); return;
  }
  if(p.kind==='corte'){
    for(const pl of g.players){ const id=p.choices.get(pl.seat); const c=pl.hand.find(c=>c.id===id); if(c){ c.public=true;c.publicReason='Corte Aberta'; } }
    g.pending=null; broadcastLog(room,'Corte Aberta: cada Casa revelou uma carta.'); broadcastGameState(room); beginTrick(room); return;
  }
  if(p.kind==='rotation'){
    const chosen=p.choices;
    const incoming=Array(4);
    for(const pl of g.players){ const id=chosen.get(pl.seat); const idx=pl.hand.findIndex(c=>c.id===id); if(idx<0) throw new Error('Rotação recebeu carta inválida.'); const [card]=pl.hand.splice(idx,1); incoming[(pl.seat+1)%4]=card; }
    for(const pl of g.players){ pl.hand.push(incoming[pl.seat]);sortHand(pl.hand); }
    g.pending=null;
    broadcastGameEvent(room,{event:'exchange',kind:'rotation',moves:g.players.map(p=>({from:p.seat,to:(p.seat+1)%4,label:`${p.name} → ${g.players[(p.seat+1)%4].name}`})),title:`Rotação — fim da vaza ${g.trick}`});
    broadcastLog(room,'Rotação: quatro cartas ocultas foram passadas simultaneamente para a esquerda.');
    broadcastGameState(room); schedule(room,()=>chooseNextLawStage(room),3500); return;
  }
}

function beginTrick(room){
  const g=room.game;if(!g)return;
  g.phase='trick-start';g.plays=[];g.trump=null;g.declaredLeadSuit=null;g.turn=null;g.pending=null;
  g.lawUsage[g.currentLaw]++;
  broadcastLog(room,`Vaza ${g.trick}: ${lawName(g.currentLaw)}.`);
  broadcastGameState(room);
  if(g.currentLaw==='estandarte') return declareTrumpStage(room);
  if(g.currentLaw==='usurpacao') return usurpacaoGiveStage(room);
  startTurns(room);
}
function lawName(id){ return ({ordem:'Ordem',estandarte:'Estandarte',revolta:'Revolta',anarquia:'Anarquia',usurpacao:'Usurpação'})[id]||id; }
function declareTrumpStage(room){
  const g=room.game, seat=g.lastShadow;
  if(seat===null || seat===undefined){ g.trump=SUITS[rand(4)]; return startTurns(room); }
  const p=g.players[seat];g.phase='choose-trump';g.pending={kind:'trump',seat,options:[...SUITS]};broadcastGameState(room);
  if(p.bot) schedule(room,()=>applyTrump(room,seat,chooseBotTrump(p)),500); else sendPrompt(room,seat,{kind:'choose-trump',title:'Declare o Trunfo',options:[...SUITS]});
}
function chooseBotTrump(p){
  return SUITS.map(s=>({s,score:p.hand.filter(c=>c.suit===s).reduce((a,c)=>a+c.value,0)+p.hand.filter(c=>c.suit===s).length*5})).sort((a,b)=>b.score-a.score)[0].s;
}
function applyTrump(room,seat,suit){
  const g=room.game;if(!g?.pending||g.pending.kind!=='trump'||g.pending.seat!==seat||!SUITS.includes(suit))return false;
  g.trump=suit;g.pending=null;broadcastLog(room,`${g.players[seat].name} declarou ${suitName(suit)} como Trunfo.`);broadcastGameState(room);startTurns(room);return true;
}
function suitName(s){ return ({cetro:'Cetro',chave:'Chave',lamina:'Lâmina',mascara:'Máscara'})[s]||s; }

function usurpacaoGiveStage(room){
  const g=room.game, shadow=g.players[g.lastShadow], crown=g.players[g.lastCrown];
  if(!shadow||!crown){ return startTurns(room); }
  if(g.players.some(p=>p.hand.length<4)) throw new Error('Usurpação inválida: todos precisam ter pelo menos 4 cartas.');
  g.phase='usurp-give';g.pending={kind:'usurp-give',seat:shadow.seat,shadow:shadow.seat,crown:crown.seat};broadcastGameState(room);
  if(shadow.bot){ const given=[...shadow.hand].sort((a,b)=>a.value-b.value)[0]; schedule(room,()=>applyUsurpGive(room,shadow.seat,given.id),500); }
  else sendPrompt(room,shadow.seat,{kind:'usurp-give',title:'Usurpação — entregue uma carta',cardIds:shadow.hand.map(c=>c.id),otherName:crown.name});
}
function applyUsurpGive(room,seat,cardId){
  const g=room.game,p=g?.pending;if(!p||p.kind!=='usurp-give'||p.seat!==seat)return false;
  const shadow=g.players[p.shadow],crown=g.players[p.crown];const idx=shadow.hand.findIndex(c=>c.id===cardId);if(idx<0)return false;
  const [given]=shadow.hand.splice(idx,1);crown.hand.push(given);crown.hand=shuffle(crown.hand);
  g.phase='usurp-pick';g.pending={kind:'usurp-pick',seat:shadow.seat,shadow:shadow.seat,crown:crown.seat,given};broadcastGameState(room);
  if(shadow.bot){ schedule(room,()=>applyUsurpPick(room,shadow.seat,rand(crown.hand.length)),500); }
  else sendPrompt(room,shadow.seat,{kind:'usurp-pick',title:'Usurpação — escolha às cegas',count:crown.hand.length,otherName:crown.name});
  return true;
}
function applyUsurpPick(room,seat,index){
  const g=room.game,p=g?.pending;if(!p||p.kind!=='usurp-pick'||p.seat!==seat)return false;
  const shadow=g.players[p.shadow],crown=g.players[p.crown];
  const i=Number(index);if(!Number.isInteger(i)||i<0||i>=crown.hand.length)return false;
  const [taken]=crown.hand.splice(i,1);shadow.hand.push(taken);sortHand(shadow.hand);sortHand(crown.hand);
  const given=p.given;
  const waiting=new Set([shadow,crown].filter(x=>!x.bot).map(x=>x.seat));
  g.phase='usurp-reveal';g.pending={kind:'usurp-ack',waiting};
  broadcastGameEvent(room,{event:'exchange',kind:'usurpacao',title:'Usurpação — troca de mãos',shadow:shadow.seat,crown:crown.seat,moves:[{from:shadow.seat,to:crown.seat,label:'Carta da Sombra → Coroa'},{from:crown.seat,to:shadow.seat,label:'Carta aleatória → Sombra',delay:220}]});
  if(!shadow.bot) sendToSeat(room,shadow.seat,{type:'private-usurpation',role:'shadow',outgoing:given,incoming:taken,otherName:crown.name,returnedSameCard:given.id===taken.id});
  if(!crown.bot) sendToSeat(room,crown.seat,{type:'private-usurpation',role:'crown',outgoing:taken,incoming:given,otherName:shadow.name,returnedSameCard:given.id===taken.id});
  broadcastLog(room,`Usurpação: ${shadow.name} e ${crown.name} trocaram uma carta oculta.`);broadcastGameState(room);
  if(!waiting.size)schedule(room,()=>{g.pending=null;startTurns(room);},3200);
  return true;
}

function startTurns(room){ const g=room.game;g.phase='await-play';g.turn=g.leader;broadcastGameState(room);advanceTurn(room); }
function influenceBlocked(g){ return g.decree?.id==='silencio' && g.trick<=5; }
function leadSuit(g){ return g.declaredLeadSuit || g.plays[0]?.card?.suit || null; }
function legalCards(g,p){
  let cards=[...p.hand];
  if(g.decree?.id==='reserva' && g.trick===10 && p.reserve) return [p.reserve];
  if(g.plays.length===0 && g.decree?.id==='sucessao' && g.previousWinningSuit){ const alt=cards.filter(c=>c.suit!==g.previousWinningSuit); if(alt.length) cards=alt; }
  if(g.plays.length===0) return cards;
  if(['ordem','estandarte','revolta','usurpacao'].includes(g.currentLaw)){
    const same=cards.filter(c=>c.suit===leadSuit(g));if(same.length)return same;
  }
  return cards;
}
function canUseInfluence(g,p){ if(p.influence<2||influenceBlocked(g))return false; if(g.plays.length===0)return p.seat===g.leader; return true; }
function chooseBotPlay(g,p,legal){
  const sorted=[...legal].sort((a,b)=>a.value-b.value),seek=Math.random()<.55;
  if(g.currentLaw==='revolta') return seek?sorted[0]:sorted[sorted.length-1];
  if(g.currentLaw==='anarquia') return seek?sorted[sorted.length-1]:sorted[0];
  if(g.currentLaw==='estandarte'&&g.trump){const tr=legal.filter(c=>c.suit===g.trump).sort((a,b)=>a.value-b.value);if(seek&&tr.length)return tr[tr.length-1];}
  return seek?sorted[sorted.length-1]:sorted[0];
}
function advanceTurn(room){
  const g=room.game;if(!g||g.phase!=='await-play')return;
  if(g.plays.length>=4)return resolveTrick(room);
  const seat=(g.leader+g.plays.length)%4;g.turn=seat;
  const p=g.players[seat],legal=legalCards(g,p);
  broadcastGameState(room);
  if(g.decree?.id==='reserva' && g.trick===10 && p.reserve){
    return schedule(room,()=>{
      if(!room.game||room.game.turn!==seat||room.game.phase!=='await-play'||!p.reserve)return;
      commitPlay(room,p,p.reserve,{hidden:false,declaredSuit:null,isReserve:true});
    },620);
  }
  if(p.bot){
    schedule(room,()=>{
      if(!room.game||room.game.turn!==seat||room.game.phase!=='await-play')return;
      const card=chooseBotPlay(g,p,legal);let hidden=false,declaredSuit=null;
      if(canUseInfluence(g,p)&&Math.random()<.18&&(card.value>=9||card.value<=3)){hidden=true;p.influence-=2;if(g.plays.length===0){declaredSuit=card.suit;g.declaredLeadSuit=declaredSuit;}}
      commitPlay(room,p,card,{hidden,declaredSuit,isReserve:g.decree?.id==='reserva'&&g.trick===10&&p.reserve?.id===card.id});
    },620);
  }
}
function handlePlay(room,seat,msg){
  const g=room.game;if(!g||g.phase!=='await-play'||g.turn!==seat)return false;
  const p=g.players[seat];if(p.bot)return false;
  const legal=legalCards(g,p);const card=legal.find(c=>c.id===msg.cardId);if(!card)return sendToSeat(room,seat,{type:'error',code:'ILLEGAL_CARD',message:'Esta carta não pode ser jogada agora.'}),false;
  let hidden=!!msg.hidden,declaredSuit=msg.declaredSuit||null;
  if(hidden){
    if(!canUseInfluence(g,p))return sendToSeat(room,seat,{type:'error',code:'NO_INFLUENCE',message:'Influência indisponível.'}),false;
    if(g.plays.length===0){
      if(!SUITS.includes(declaredSuit)||card.suit!==declaredSuit)return sendToSeat(room,seat,{type:'error',code:'BAD_DECLARATION',message:'Ao abrir oculta, anuncie o mesmo naipe da carta jogada.'}),false;
      g.declaredLeadSuit=declaredSuit;
    }
    p.influence-=2;
  }
  const isReserve=g.decree?.id==='reserva'&&g.trick===10&&p.reserve?.id===card.id;
  commitPlay(room,p,card,{hidden,declaredSuit,isReserve});return true;
}
function commitPlay(room,p,card,{hidden=false,declaredSuit=null,isReserve=false}={}){
  const g=room.game;
  if(isReserve){ p.reserve=null; }
  else { const idx=p.hand.findIndex(c=>c.id===card.id);if(idx<0)throw new Error('Carta não encontrada na mão.');p.hand.splice(idx,1); }
  if(card.public){card.public=false;card.publicReason=null;}
  const play={playerId:p.seat,card,hidden,order:g.plays.length};g.plays.push(play);
  broadcastGameEvent(room,{event:'card-played',playerId:p.seat,hidden,card:hidden?null:card,declaredSuit:declaredSuit||null,isReserve});
  if(hidden&&g.plays.length===1&&declaredSuit) broadcastLog(room,`${p.name} anunciou ${suitName(declaredSuit)} e abriu com uma carta oculta.`);
  else broadcastLog(room,`${p.name} jogou ${hidden?'uma carta oculta':`${suitName(card.suit)} ${card.value}`}${isReserve?' da Reserva':''}.`);
  g.turn=null;broadcastGameState(room);schedule(room,()=>{g.phase='await-play';advanceTurn(room);},480);
}

function pickWinner(candidates,mode){
  return candidates.reduce((best,p)=>{if(!best)return p;if(mode==='max')return p.card.value>best.card.value?p:best;return p.card.value<best.card.value?p:best;},null);
}
function evaluateTrick(g){
  const lead=leadSuit(g);let crown;
  if(g.currentLaw==='anarquia')crown=pickWinner(g.plays,'max');
  else if(g.currentLaw==='revolta')crown=pickWinner(g.plays.filter(p=>p.card.suit===lead),'min');
  else if(g.currentLaw==='estandarte'){const tr=g.plays.filter(p=>p.card.suit===g.trump);crown=tr.length?pickWinner(tr,'max'):pickWinner(g.plays.filter(p=>p.card.suit===lead),'max');}
  else crown=pickWinner(g.plays.filter(p=>p.card.suit===lead),'max');
  const others=g.plays.filter(p=>p.playerId!==crown.playerId);const shadow=pickWinner(others,g.currentLaw==='revolta'?'max':'min');return{crown,shadow};
}
function resolveTrick(room){
  const g=room.game;if(!g)return;
  g.phase='resolve';g.turn=null;
  const {crown,shadow}=evaluateTrick(g);const cp=g.players[crown.playerId],sp=g.players[shadow.playerId];
  cp.roundCrowns++;cp.totalCrowns++;sp.roundShadows++;sp.totalShadows++;
  const influenceGains=[];
  for(const p of g.players){if(p.seat!==cp.seat&&p.seat!==sp.seat){const before=p.influence;p.influence=Math.min(2,p.influence+1);if(p.influence>before)influenceGains.push({seat:p.seat,after:p.influence});}}
  const sameCrown=g.lastCrown===cp.seat;
  if(sameCrown)cp.crownStreak++;else{for(const p of g.players)p.crownStreak=0;cp.crownStreak=1;}
  const revealedPlays=g.plays.map(x=>({...x,hidden:false}));
  g.lastCrown=cp.seat;g.lastShadow=sp.seat;g.previousWinningSuit=crown.card.suit;g.leader=cp.seat;
  g.phase='trick-result';
  broadcastGameEvent(room,{event:'trick-result',crownId:cp.seat,shadowId:sp.seat,revealedPlays,influenceGains});
  broadcastLog(room,`Coroa: ${cp.name}. Sombra: ${sp.name}.`);broadcastGameState(room,true);
  schedule(room,()=>afterTrickAnimation(room,sameCrown),6400);
}
function afterTrickAnimation(room,sameCrown){
  const g=room.game;if(!g)return;
  const cp=g.players[g.lastCrown];
  if(g.decree?.id==='desafio'){
    const shouldReveal=!cp.hadCrown||sameCrown;cp.hadCrown=true;
    if(shouldReveal){const privateCards=cp.hand.filter(c=>!c.public);if(privateCards.length){return challengeStage(room,cp,privateCards);}}
  } else cp.hadCrown=true;
  continueAfterChallenge(room);
}
function challengeStage(room,p,cards){
  const g=room.game;g.phase='challenge';g.pending={kind:'challenge',seat:p.seat,cardIds:cards.map(c=>c.id)};broadcastGameState(room);
  if(p.bot){schedule(room,()=>applyChallenge(room,p.seat,cards[rand(cards.length)].id),400);}else sendPrompt(room,p.seat,{kind:'challenge',title:'Desafio — revele uma carta',cardIds:cards.map(c=>c.id)});
}
function applyChallenge(room,seat,cardId){
  const g=room.game,pending=g?.pending;if(!pending||pending.kind!=='challenge'||pending.seat!==seat||!pending.cardIds.includes(cardId))return false;
  const p=g.players[seat],c=p.hand.find(x=>x.id===cardId);if(!c)return false;c.public=true;c.publicReason='Desafio';g.pending=null;broadcastLog(room,`Desafio: ${p.name} revelou ${suitName(c.suit)} ${c.value}.`);broadcastGameState(room);continueAfterChallenge(room);return true;
}
function continueAfterChallenge(room){
  const g=room.game;if(g.trick===10)return endRound(room);
  if(g.decree?.id==='rotacao'&&[7,8,9].includes(g.trick))return startRotationStage(room);
  chooseNextLawStage(room);
}
function startRotationStage(room){
  const g=room.game;g.phase='rotation';g.pending={kind:'rotation',waiting:new Set(),choices:new Map()};
  for(const p of g.players){ if(p.bot)g.pending.choices.set(p.seat,p.hand[rand(p.hand.length)].id); else{g.pending.waiting.add(p.seat);sendPrompt(room,p.seat,{kind:'rotation',title:`Rotação — fim da vaza ${g.trick}`,cardIds:p.hand.map(c=>c.id)});} }
  broadcastGameState(room);maybeFinishMultiStage(room);
}
function minHandBeforeTrick(g,t){return g.decree?.id==='reserva'?(t===10?1:10-t):11-t;}
function lawEligibleAt(g,law,trickNum){return !(law==='usurpacao'&&minHandBeforeTrick(g,trickNum)<4);}
function canFinishLawSequence(g,rem,lastLaw,trickNum,memo=new Map()){
  if(trickNum>10)return LAWS.every(l=>rem[l]===0);
  const key=`${trickNum}|${lastLaw}|${LAWS.map(l=>rem[l]).join(',')}|${g.decree?.id||''}`;if(memo.has(key))return memo.get(key);
  for(const l of LAWS){if(rem[l]<=0||l===lastLaw)continue;if(!lawEligibleAt(g,l,trickNum))continue;rem[l]--;if(canFinishLawSequence(g,rem,l,trickNum+1,memo)){rem[l]++;memo.set(key,true);return true;}rem[l]++;}
  memo.set(key,false);return false;
}
function safeLawChoices(g,nextTrick){
  const rem=Object.fromEntries(LAWS.map(l=>[l,2-g.lawUsage[l]]));
  return LAWS.filter(l=>{if(rem[l]<=0||l===g.currentLaw||!lawEligibleAt(g,l,nextTrick))return false;rem[l]--;const ok=canFinishLawSequence(g,rem,l,nextTrick+1);rem[l]++;return ok;});
}
function chooseNextLawStage(room){
  const g=room.game,seat=g.lastShadow,p=g.players[seat],valid=safeLawChoices(g,g.trick+1);if(!valid.length)throw new Error('Não há Lei válida para a próxima vaza.');
  g.phase='choose-law';g.pending={kind:'law',seat,options:valid};broadcastGameState(room);
  if(p.bot)schedule(room,()=>applyLawChoice(room,seat,valid[rand(valid.length)]),450);else sendPrompt(room,seat,{kind:'choose-law',title:'Escolha a próxima Lei',options:valid});
}
function applyLawChoice(room,seat,law){
  const g=room.game,p=g?.pending;if(!p||p.kind!=='law'||p.seat!==seat||!p.options.includes(law))return false;
  g.currentLaw=law;g.pending=null;g.trick++;broadcastLog(room,`${g.players[seat].name}, como Sombra, escolheu ${lawName(law)}.`);beginTrick(room);return true;
}
function endRound(room){
  const g=room.game;g.phase='round-end';g.turn=null;for(const p of g.players)p.influence=0;
  const scores=g.players.map(p=>({seat:p.seat,name:p.name,crowns:p.totalCrowns,shadows:p.totalShadows,pairs:totalPairs(p),prestige:prestige(p)}));
  broadcastGameEvent(room,{event:'round-ended',round:g.round,scores});broadcastGameState(room);
  if(g.round>=3)return schedule(room,()=>endGame(room),3500);
  const nextStarter=(g.lastCrown+1)%4;
  schedule(room,()=>{g.round++;g.leader=nextStarter;broadcastLog(room,`${g.players[nextStarter].name} iniciará a nova rodada por estar à esquerda do vencedor da 10ª vaza.`);setupRound(room);},3500);
}
function endGame(room){
  const g=room.game;g.phase='game-over';
  const sorted=[...g.players].sort((a,b)=>prestige(b)-prestige(a)||totalPairs(b)-totalPairs(a)||b.totalCrowns-a.totalCrowns||b.totalShadows-a.totalShadows);
  const top=sorted[0];const tied=sorted.filter(p=>prestige(p)===prestige(top)&&totalPairs(p)===totalPairs(top)&&p.totalCrowns===top.totalCrowns&&p.totalShadows===top.totalShadows);
  broadcastGameEvent(room,{event:'game-ended',winners:tied.map(p=>p.seat),scores:sorted.map(p=>({seat:p.seat,name:p.name,crowns:p.totalCrowns,shadows:p.totalShadows,pairs:totalPairs(p),prestige:prestige(p)}))});broadcastGameState(room);
}

function sendPrompt(room,seat,prompt){
  const g=room.game;if(!g)return;const id=`p${++g.promptSeq}`;sendToSeat(room,seat,{type:'game-prompt',prompt:{id,...prompt}});
}
function handleGameAction(ws,message){
  const room=rooms.get(ws.roomId), hp=room?.players.get(ws.clientId),g=room?.game;if(!room||!hp||!g){send(ws,{type:'error',code:'NO_GAME',message:'Não existe partida ativa nesta sala.'});return;}
  const seat=hp.seat,action=message.action,payload=message.payload||{};
  let ok=false;
  if(action==='choose-decree')ok=applyDecreeChoice(room,seat,payload.value);
  else if(action==='choose-trump')ok=applyTrump(room,seat,payload.value);
  else if(action==='choose-law')ok=applyLawChoice(room,seat,payload.value);
  else if(action==='usurp-give')ok=applyUsurpGive(room,seat,payload.cardId);
  else if(action==='usurp-pick')ok=applyUsurpPick(room,seat,Number(payload.index));
  else if(action==='challenge')ok=applyChallenge(room,seat,payload.cardId);
  else if(action==='play-card')ok=handlePlay(room,seat,payload);
  else if(action==='usurp-ack'){
    const p=g.pending;
    if(p?.kind==='usurp-ack'&&p.waiting?.has(seat)){p.waiting.delete(seat);ok=true;if(!p.waiting.size){g.pending=null;schedule(room,()=>startTurns(room),180);}}
  }
  else if(['choose-reserva','choose-corte','rotation'].includes(action)){
    const p=g.pending, expected=action==='choose-reserva'?'reserva':action==='choose-corte'?'corte':'rotation';
    if(p?.kind===expected&&p.waiting?.has(seat)&&g.players[seat].hand.some(c=>c.id===payload.cardId)){p.choices.set(seat,payload.cardId);p.waiting.delete(seat);ok=true;broadcastGameState(room);maybeFinishMultiStage(room);}
  }
  if(!ok && !['play-card'].includes(action)) send(ws,{type:'error',code:'INVALID_ACTION',message:'Essa ação não é válida neste momento.'});
}
function autoResolvePendingSeat(room,seat){
  const g=room.game,p=g?.pending;if(!g||!p)return;
  const gp=g.players[seat];gp.bot=true;gp.clientId=null;
  if(p.kind==='usurp-ack'&&p.waiting?.has(seat)){p.waiting.delete(seat);if(!p.waiting.size){g.pending=null;schedule(room,()=>startTurns(room),180);}return;}
  if(p.waiting?.has(seat)){
    let cardId=gp.hand[rand(gp.hand.length)]?.id;
    if(p.kind==='reserva')cardId=chooseBotCard(gp,'reserva');
    p.choices.set(seat,cardId);p.waiting.delete(seat);maybeFinishMultiStage(room);return;
  }
  if(p.seat!==seat)return;
  if(p.kind==='decree')applyDecreeChoice(room,seat,p.options[rand(p.options.length)]);
  else if(p.kind==='trump')applyTrump(room,seat,chooseBotTrump(gp));
  else if(p.kind==='law')applyLawChoice(room,seat,p.options[rand(p.options.length)]);
  else if(p.kind==='usurp-give'){const c=[...gp.hand].sort((a,b)=>a.value-b.value)[0];applyUsurpGive(room,seat,c.id);}
  else if(p.kind==='usurp-pick')applyUsurpPick(room,seat,rand(g.players[p.crown].hand.length));
  else if(p.kind==='challenge')applyChallenge(room,seat,p.cardIds[rand(p.cardIds.length)]);
}

function privateGameState(room,viewerSeat,revealPlays=false){
  const g=room.game;if(!g)return null;
  const viewer=g.players[viewerSeat];
  const players=g.players.map(p=>({
    id:p.seat,seat:p.seat,name:p.name,ai:p.bot,
    handCount:p.hand.length,reservePresent:!!p.reserve,
    hand:p.seat===viewerSeat?p.hand:undefined,
    reserve:p.seat===viewerSeat?p.reserve:undefined,
    publicCards:p.hand.filter(c=>c.public),
    totalCrowns:p.totalCrowns,totalShadows:p.totalShadows,roundCrowns:p.roundCrowns,roundShadows:p.roundShadows,influence:p.influence,
    prestige:prestige(p),pairs:totalPairs(p),
  }));
  const plays=g.plays.map(pl=>({
    playerId:pl.playerId,order:pl.order,hidden:revealPlays?false:pl.hidden,
    card:(revealPlays||!pl.hidden||pl.playerId===viewerSeat)?pl.card:null,
  }));
  const legal=(g.phase==='await-play'&&g.turn===viewerSeat)?legalCards(g,viewer).map(c=>c.id):[];
  return {
    online:true,youSeat:viewerSeat,round:g.round,trick:g.trick,phase:g.phase,
    currentLaw:g.currentLaw,lawUsage:g.lawUsage,trump:g.trump,declaredLeadSuit:g.declaredLeadSuit,
    decree:g.decree,lastCrown:g.lastCrown,lastShadow:g.lastShadow,previousWinningSuit:g.previousWinningSuit,
    leader:g.leader,turn:g.turn,plays,players,
    legalCardIds:legal,
    canUseInfluence:g.phase==='await-play'&&g.turn===viewerSeat&&canUseInfluence(g,viewer),
    influenceBlocked:influenceBlocked(g),
  };
}
function broadcastGameState(room,revealPlays=false){
  if(!room.game)return;
  for(const hp of room.players.values()) send(hp.ws,{type:'game-state',state:privateGameState(room,hp.seat,revealPlays)});
}

app.get('/',(_req,res)=>res.type('text/plain').send(`A Lei do Trono backend ${VERSION} online.`));
app.get('/health',(_req,res)=>res.json({ok:true,version:VERSION,rooms:safeRooms(),uptime:process.uptime()}));
app.get('/rooms',(_req,res)=>res.json({rooms:safeRooms()}));

wss.on('connection',(ws)=>{
  ws.clientId=crypto.randomUUID();ws.roomId=null;ws.isAlive=true;
  ws.on('pong',()=>{ws.isAlive=true;});
  send(ws,{type:'welcome',clientId:ws.clientId,rooms:safeRooms(),serverVersion:VERSION});
  ws.on('message',raw=>{
    let message;try{message=JSON.parse(raw.toString());}catch{send(ws,{type:'error',code:'BAD_JSON',message:'Mensagem inválida.'});return;}
    switch(message.type){
      case 'list-rooms':send(ws,{type:'rooms',rooms:safeRooms()});break;
      case 'join-room':joinRoom(ws,message.roomId,message.name);break;
      case 'leave-room':leaveRoom(ws,'leave');break;
      case 'ready':setReady(ws,message.ready);break;
      case 'start-room':requestStart(ws);break;
      case 'game-action':handleGameAction(ws,message);break;
      case 'state-request':{const room=rooms.get(ws.roomId),p=room?.players.get(ws.clientId);if(room?.game&&p)send(ws,{type:'game-state',state:privateGameState(room,p.seat)});break;}
      case 'ping':send(ws,{type:'pong',at:Date.now()});break;
      default:send(ws,{type:'error',code:'UNKNOWN_TYPE',message:'Tipo de mensagem desconhecido.'});
    }
  });
  ws.on('close',()=>leaveRoom(ws,'disconnect'));ws.on('error',()=>{});
});

const heartbeat=setInterval(()=>{for(const ws of wss.clients){if(ws.isAlive===false){try{ws.terminate();}catch{}continue;}ws.isAlive=false;try{ws.ping();}catch{}}},30000);
server.listen(PORT,HOST,()=>console.log(`A Lei do Trono backend ${VERSION} em http://${HOST}:${PORT}`));
function shutdown(){clearInterval(heartbeat);for(const ws of wss.clients){try{ws.close(1001,'Servidor reiniciando');}catch{}}server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),5000).unref();}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
