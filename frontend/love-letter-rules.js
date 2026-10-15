/* Love Letter, 2ª edição (2019): shared rules, all decisions enforced by server. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.LoveLetterRules=factory();})(typeof globalThis!=='undefined'?globalThis:this,()=>{
 'use strict';
 const cards=[
  {rank:0,name:'Espiã',count:2,effect:'No fim da rodada, ganhe 1 favor se só você, entre os sobreviventes, jogou ou descartou uma Espiã.'},
  {rank:1,name:'Guarda',count:6,effect:'Adivinhe a carta de outra pessoa. Não pode dizer Guarda. Se acertar, ela sai da rodada.'},
  {rank:2,name:'Padre',count:2,effect:'Veja em segredo a carta de outra pessoa.'},
  {rank:3,name:'Barão',count:2,effect:'Compare sua carta com a de outra pessoa. O menor valor sai da rodada; empate não elimina.'},
  {rank:4,name:'Aia',count:2,effect:'Você fica protegido dos efeitos de outras pessoas até seu próximo turno.'},
  {rank:5,name:'Príncipe',count:2,effect:'Escolha alguém, inclusive você, para descartar a mão e comprar outra carta.'},
  {rank:6,name:'Chanceler',count:2,effect:'Compre até 2 cartas. Guarde uma e devolva as outras ao fundo do baralho, na ordem que escolher.'},
  {rank:7,name:'Rei',count:1,effect:'Troque a mão com a de outra pessoa.'},
  {rank:8,name:'Condessa',count:1,effect:'Se estiver com o Rei ou o Príncipe, você deve jogar a Condessa.'},
  {rank:9,name:'Princesa',count:1,effect:'Se jogar ou descartar esta carta, você sai da rodada.'}
 ];
 const fail=message=>{throw Object.assign(Error(message),{code:'LOVE_LETTER_INVALID_MOVE'});};
 const clone=s=>JSON.parse(JSON.stringify(s));
 const shuffle=(list,rng)=>{for(let i=list.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[list[i],list[j]]=[list[j],list[i]];}return list;};
 function deck(rng){return shuffle(cards.flatMap(c=>Array.from({length:c.count},(_,i)=>({id:c.rank+'-'+i,rank:c.rank}))),rng);}
 function targetScore(n){return ({2:6,3:5,4:4,5:3,6:3})[n];}
 function beginRound(s,starter,rng){
  s.round++;s.deck=deck(rng);s.removed=s.deck.pop();s.faceUpRemoved=s.players.length===2?s.deck.splice(-3):[];s.phase='action';s.roundWinners=[];s.spyWinner=null;s.private={};s.chancellor=null;s.roundResult=null;
  for(const p of s.players){p.hand=[s.deck.pop()];p.discards=[];p.eliminated=false;p.protected=false;}
  s.turn=starter;s.starter=starter;s.players[starter].hand.push(s.deck.pop());
 }
 function create(players,rng=Math.random){
  if(!Array.isArray(players)||!targetScore(players.length)||new Set(players.map(p=>p.id)).size!==players.length||players.some(p=>typeof p.id!=='string'||!p.id))fail('Escolha de 2 a 6 participantes distintos.');
  const s={version:1,revision:0,round:0,target:targetScore(players.length),players:players.map(p=>({id:p.id,name:p.name||'Cortesão',bot:!!p.bot,score:0})),turn:0,starter:0,log:[],last:null,winners:[]};beginRound(s,Math.floor(rng()*players.length),rng);return s;
 }
 function eligible(s,rank){const me=s.players[s.turn];return s.players.filter(p=>!p.eliminated&&!p.protected&&(rank===5||p.id!==me.id)).map(p=>p.id);}
 function forced(p){return p.hand.some(c=>c.rank===8)&&p.hand.some(c=>c.rank===5||c.rank===7);}
 function eliminate(p,event){p.eliminated=true;p.protected=false;const c=p.hand.splice(0);p.discards.push(...c);event.eliminated.push(p.id);}
 function settle(s,event){
  const survivors=s.players.filter(p=>!p.eliminated);
  if(survivors.length>1&&s.deck.length){let next=s.turn;do{next=(next+1)%s.players.length;}while(s.players[next].eliminated);s.turn=next;const p=s.players[next];p.protected=false;p.hand.push(s.deck.pop());s.phase='action';return;}
  const high=Math.max(...survivors.map(p=>p.hand[0].rank));s.roundWinners=survivors.filter(p=>p.hand[0].rank===high).map(p=>p.id);s.roundWinners.forEach(id=>s.players.find(p=>p.id===id).score++);
  const spies=survivors.filter(p=>p.discards.some(c=>c.rank===0));s.spyWinner=spies.length===1?spies[0].id:null;if(s.spyWinner)spies[0].score++;
  s.roundResult={reason:survivors.length===1?'last-survivor':'deck-empty',hands:survivors.map(p=>({playerId:p.id,card:p.hand[0]})),winners:[...s.roundWinners],spyWinner:s.spyWinner};event.roundResult=clone(s.roundResult);
  const reached=s.players.filter(p=>p.score>=s.target);s.phase=reached.length?'finished':'round-over';s.winners=reached.map(p=>p.id);
 }
 function move(input,playerId,action){
  if(!action||typeof action!=='object')fail('Jogada inválida.');const s=clone(input),p=s.players[s.turn];if(!p||p.id!==playerId||!['action','chancellor'].includes(s.phase))fail('Aguarde sua vez de jogar.');
  if(s.phase==='chancellor'){
   if(action.kind!=='chancellor'||typeof action.keep!=='string'||!Array.isArray(action.bottom)||new Set([action.keep,...action.bottom]).size!==p.hand.length||action.bottom.length!==p.hand.length-1||[action.keep,...action.bottom].some(id=>!p.hand.some(c=>c.id===id)))fail('Guarde uma carta e ordene as demais para o fundo.');
   const keep=p.hand.find(c=>c.id===action.keep),ordered=action.bottom.map(id=>p.hand.find(c=>c.id===id));p.hand=[keep];s.deck.unshift(...ordered.reverse());s.chancellor=null;const event={kind:'chancellor',playerId,eliminated:[]};settle(s,event);return stamp(s,event);
  }
  if(action.kind!=='play'||typeof action.cardId!=='string')fail('Escolha uma carta da sua mão.');const index=p.hand.findIndex(c=>c.id===action.cardId);if(index<0)fail('Essa carta não está na sua mão.');const c=p.hand[index],rank=c.rank;
  if(forced(p)&&rank!==8)fail('Com Príncipe ou Rei na mão, você precisa jogar a Condessa.');
  const targeted=[1,2,3,5,7].includes(rank),targets=targeted?eligible(s,rank):[],target=targets.length?s.players.find(x=>x.id===action.targetId):null;
  if(targets.length&&!targets.includes(action.targetId))fail('Escolha um alvo disponível.');if(!targets.length&&action.targetId)fail('Não há alvo disponível para essa carta.');
  if(rank===1&&target&&(!Number.isInteger(action.guess)||action.guess<0||action.guess>9||action.guess===1))fail('Escolha uma carta de 0 a 9, exceto Guarda.');
  p.hand.splice(index,1);p.discards.push(c);const event={kind:'play',playerId,card:c,targetId:target?.id||null,eliminated:[]};
  if(targeted&&!target)event.noTarget=true;
  if(rank===1&&target){event.guess=action.guess;if(target.hand[0].rank===action.guess)eliminate(target,event);else event.missed=true;}
  if(rank===2&&target){(s.private[playerId]??=[]).push({revision:s.revision+1,kind:'peek',targetId:target.id,card:clone(target.hand[0])});}
  if(rank===3&&target){const a=p.hand[0].rank,b=target.hand[0].rank;if(a<b)eliminate(p,event);else if(b<a)eliminate(target,event);else event.tied=true;}
  if(rank===4)p.protected=true;
  if(rank===5&&target){const discarded=target.hand.pop();target.discards.push(discarded);event.discarded=discarded;if(discarded.rank===9)eliminate(target,event);else{let replacement;if(s.deck.length)replacement=s.deck.pop();else{replacement=s.removed;s.removed=null;}if(replacement)target.hand=[replacement];else fail('Não há carta de reposição.');}}
  if(rank===6){p.hand.push(...s.deck.splice(Math.max(0,s.deck.length-2)).reverse());if(p.hand.length>1){s.phase='chancellor';s.chancellor={playerId};return stamp(s,event);}}
  if(rank===7&&target){[p.hand,target.hand]=[target.hand,p.hand];}
  if(rank===9)eliminate(p,event);
  settle(s,event);return stamp(s,event);
 }
 function stamp(s,event){s.revision++;event.revision=s.revision;event.round=s.round;s.last=event;s.log.push(event);if(s.log.length>80)s.log.shift();return s;}
 function nextRound(input,rng=Math.random){if(!input||input.phase!=='round-over')fail('A rodada ainda não terminou.');const s=clone(input),w=s.roundWinners[Math.floor(rng()*s.roundWinners.length)],starter=s.players.findIndex(p=>p.id===w);beginRound(s,starter,rng);return stamp(s,{kind:'round-start',playerId:s.players[starter].id,eliminated:[]});}
 function publicState(input,viewer){const s=clone(input);s.deckCount=s.deck.length;delete s.deck;s.removed=!!s.removed;s.private=s.private[viewer]||[];for(const p of s.players){p.handCount=p.hand.length;if(p.id!==viewer)p.hand=p.hand.map(()=>({hidden:true}));}return s;}
 function legalActions(s){
  const p=s.players[s.turn];if(s.phase==='chancellor'){const out=[];for(const c of p.hand){const rest=p.hand.filter(x=>x.id!==c.id).map(x=>x.id);out.push({kind:'chancellor',keep:c.id,bottom:rest});if(rest.length===2)out.push({kind:'chancellor',keep:c.id,bottom:[...rest].reverse()});}return out;}
  if(s.phase!=='action')return [];const out=[];for(const c of p.hand){if(forced(p)&&c.rank!==8)continue;const ids=[1,2,3,5,7].includes(c.rank)?eligible(s,c.rank):[];if(!ids.length)out.push({kind:'play',cardId:c.id});else for(const targetId of ids){if(c.rank===1)for(const guess of [0,2,3,4,5,6,7,8,9])out.push({kind:'play',cardId:c.id,targetId,guess});else out.push({kind:'play',cardId:c.id,targetId});}}return out;
 }
 function botMove(s,rng=Math.random){const actions=legalActions(s),p=s.players[s.turn];if(s.phase==='chancellor')return actions.sort((a,b)=>p.hand.find(c=>c.id===b.keep).rank-p.hand.find(c=>c.id===a.keep).rank)[0];const score=a=>{const c=p.hand.find(c=>c.id===a.cardId);let v=10-c.rank;if(c.rank===9)v=-100;if(c.rank===4)v+=1;if(c.rank===5&&a.targetId===p.id)v-=4;return v;};return actions.map(a=>({a,v:score(a)+rng()*.5})).sort((a,b)=>b.v-a.v)[0]?.a;}
 return {cards,create,move,nextRound,publicState,eligible,forced,legalActions,botMove,targetScore,version:'2019-2e'};
});
