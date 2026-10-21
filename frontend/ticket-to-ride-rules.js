'use strict';
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./ticket-to-ride-data'));else root.TicketToRideRules=factory(root.TicketToRideData);})(typeof globalThis!=='undefined'?globalThis:this,D=>{
 const fail=message=>{throw Object.assign(Error(message),{code:'TICKET_TO_RIDE_INVALID_MOVE'});};
 const shuffle=(array,random)=>{for(let i=array.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[array[i],array[j]]=[array[j],array[i]];}return array;};
 function draw(s){if(!s.deck.length&&s.discard.length)s.deck=shuffle(s.discard.splice(0),s.random);return s.deck.pop();}
 function refill(s){
  while(s.market.length<5){const card=draw(s);if(!card)break;s.market.push(card);}
  // With fewer than three non-locomotives in the entire available supply a legal
  // five-card display is impossible. Leave it drawable rather than looping forever.
  const supply=[...s.market,...s.deck,...s.discard];
  if(s.market.filter(c=>c==='loco').length>=3&&supply.filter(c=>c!=='loco').length>=3){
   // Discard the display and draw from the existing deck. Shuffle discards
   // only when that deck runs out, preserving the tabletop draw order.
   for(let n=0;n<100;n++){s.discard.push(...s.market.splice(0));while(s.market.length<5){const card=draw(s);if(!card)break;s.market.push(card);}if(s.market.filter(c=>c==='loco').length<3)return;}
   // A deterministic/random-source edge case must not lock the server.
   const market=shuffle([...s.market,...s.deck,...s.discard],s.random),non=market.filter(c=>c!=='loco'),locos=market.filter(c=>c==='loco');s.discard=[];
   s.market=non.splice(0,3);s.deck=shuffle([...non,...locos],s.random);while(s.market.length<5)s.market.push(s.deck.pop());
  }
 }
 function create(players,{random=Math.random}={}){
  if(!Array.isArray(players)||players.length<2||players.length>5||new Set(players.map(p=>p.id)).size!==players.length)fail('Escolha de 2 a 5 participantes distintos.');
  const s={revision:0,phase:'setup',turn:Math.floor(random()*players.length),players:players.map(p=>({id:p.id,name:p.name,bot:!!p.bot,forfeited:!!p.forfeited,trains:45,score:0,hand:[],tickets:[],pending:[],initial:true})),deck:shuffle([...D.colors.flatMap(c=>Array(12).fill(c)),...Array(14).fill('loco')],random),discard:[],ticketDeck:shuffle(D.tickets.map(t=>t.id),random),market:[],claimed:{},drawn:0,finalTurns:null,log:[],random};
  for(const p of s.players){for(let i=0;i<4;i++)p.hand.push(draw(s));p.pending=s.ticketDeck.splice(-3);}
  refill(s);return s;
 }
 function connected(s,id,a,b){const visited=new Set([a]),queue=[a];while(queue.length){const city=queue.pop();if(city===b)return true;for(const r of D.routes)if(s.claimed[r.id]===id&&(r.a===city||r.b===city)){const next=r.a===city?r.b:r.a;if(!visited.has(next)){visited.add(next);queue.push(next);}}}return false;}
 function longest(s,id){
  const edges=D.routes.filter(r=>s.claimed[r.id]===id),adj=new Map();edges.forEach((e,i)=>{for(const city of [e.a,e.b]){if(!adj.has(city))adj.set(city,[]);adj.get(city).push(i);}});
  const memo=new Map();function walk(city,used){const key=city+':'+used;if(memo.has(key))return memo.get(key);let best=0;for(const i of adj.get(city)||[]){const bit=1n<<BigInt(i);if(used&bit)continue;const e=edges[i];best=Math.max(best,e.length+walk(e.a===city?e.b:e.a,used|bit));}memo.set(key,best);return best;}
  return Math.max(0,...[...adj.keys()].map(city=>walk(city,0n)));
 }
 function finish(s){
  s.phase='finished';const results=s.players.map(p=>{const tickets=p.tickets.map(id=>{const t=D.tickets.find(t=>t.id===id);return {...t,complete:connected(s,p.id,t.a,t.b)};});return {id:p.id,routeScore:p.score,tickets,completed:tickets.filter(t=>t.complete).length,ticketScore:tickets.reduce((n,t)=>n+(t.complete?t.points:-t.points),0),longest:longest(s,p.id)};});
  const max=Math.max(...results.map(r=>r.longest));for(const r of results){r.bonus=r.longest===max?10:0;r.total=r.routeScore+r.ticketScore+r.bonus;}
  const order=[...results].sort((a,b)=>b.total-a.total||b.completed-a.completed||b.longest-a.longest),best=order[0];s.results=results;s.winners=results.filter(r=>r.total===best.total&&r.completed===best.completed&&r.longest===best.longest).map(r=>r.id);
 }
 function endTurn(s){
  if(s.finalTurns!==null){s.finalTurns--;if(!s.finalTurns){finish(s);return;}}
  else if(s.players[s.turn].trains<=2){s.finalTurns=s.players.length;s.log.push({kind:'final',playerId:s.players[s.turn].id});}
  s.turn=(s.turn+1)%s.players.length;s.drawn=0;
 }
 function available(s,p,r){if(!r||s.claimed[r.id]||p.trains<r.length)return false;return !D.routes.some(x=>x.id!==r.id&&x.group===r.group&&s.claimed[x.id]&&(s.players.length<4||s.claimed[x.id]===p.id));}
 function payments(s,p,r){if(!available(s,p,r))return [];const options=[];for(const color of r.color==='gray'?D.colors:[r.color]){const count=p.hand.filter(c=>c===color).length,locos=p.hand.filter(c=>c==='loco').length;for(let wild=Math.max(0,r.length-count);wild<=Math.min(r.length,locos);wild++)options.push({color,locos:wild});}return options;}
 function move(source,id,m){
  if(!m||typeof m!=='object')fail('Jogada inválida.');
  const s={...source,players:source.players.map(p=>({...p,hand:[...p.hand],tickets:[...p.tickets],pending:[...p.pending]})),deck:[...source.deck],discard:[...source.discard],ticketDeck:[...source.ticketDeck],market:[...source.market],claimed:{...source.claimed},log:[...source.log]};
  const p=s.players.find(p=>p.id===id);if(!p||s.phase==='finished')fail('Esta partida não aceita jogadas.');
  if(m.kind==='tickets'){
   if(!p.pending.length||(s.phase!=='setup'&&s.players[s.turn]!==p))fail('Não há bilhetes para escolher.');
   const min=p.initial?2:1;if(!Array.isArray(m.keep)||m.keep.length<Math.min(min,p.pending.length)||new Set(m.keep).size!==m.keep.length||m.keep.some(t=>!p.pending.includes(t)))fail('Escolha pelo menos '+min+' bilhete(s) oferecido(s).');
   // Rejected tickets go to the bottom, preserving hidden choices.
   s.ticketDeck.unshift(...p.pending.filter(t=>!m.keep.includes(t)));p.tickets.push(...m.keep);p.pending=[];const initial=p.initial;p.initial=false;
   if(initial){if(s.players.every(x=>!x.initial))s.phase='playing';}else endTurn(s);
  }else{
   if(s.phase!=='playing'||s.players[s.turn]!==p||p.pending.length)fail('Aguarde sua vez e conclua seus bilhetes.');
   if(m.kind==='draw'){
    const face=m.source==='market';if(!face&&m.source!=='deck')fail('Escolha o monte ou uma carta aberta.');
    let card;if(face){if(!Number.isInteger(m.index)||!s.market[m.index])fail('Esta carta não está disponível.');card=s.market[m.index];if(card==='loco'&&s.drawn)fail('Locomotiva aberta só pode ser a primeira compra.');s.market.splice(m.index,1);}else{card=draw(s);if(!card)fail('Não há cartas no monte.');}
    p.hand.push(card);s.drawn+=face&&card==='loco'?2:1;refill(s);s.log.push({kind:'draw',playerId:id,card:face?card:null});
    if(s.drawn>=2||(!s.deck.length&&!s.discard.length&&!s.market.some(c=>c!=='loco')))endTurn(s);
   }else if(m.kind==='claim'){
    if(s.drawn)fail('Conclua a compra de cartas antes de construir.');const r=D.routes.find(r=>r.id===m.routeId);
    if(!r||!payments(s,p,r).some(x=>x.color===m.color&&x.locos===m.locos))fail('Rota indisponível ou pagamento inválido.');
    for(let i=0;i<r.length;i++){const card=i<m.locos?'loco':m.color;const index=p.hand.indexOf(card);s.discard.push(...p.hand.splice(index,1));}
    s.claimed[r.id]=id;p.trains-=r.length;p.score+=D.points[r.length];s.log.push({kind:'claim',playerId:id,routeId:r.id,points:D.points[r.length]});endTurn(s);
   }else if(m.kind==='draw-tickets'){
    if(s.drawn||!s.ticketDeck.length)fail('Não é possível comprar bilhetes agora.');p.pending=s.ticketDeck.splice(-3);
   }else if(m.kind==='pass'){
    if(s.market.length||s.deck.length||s.discard.length||D.routes.some(r=>payments(s,p,r).length))fail('Ainda há jogadas disponíveis.');endTurn(s);
   }else fail('Jogada desconhecida.');
  }
  s.revision++;s.log=s.log.slice(-80);return s;
 }
 function publicState(s,id){
  const finished=s.phase==='finished';return {revision:s.revision,phase:s.phase,turn:s.turn,market:[...s.market],deckCount:s.deck.length,discardCount:s.discard.length,ticketCount:s.ticketDeck.length,claimed:{...s.claimed},drawn:s.drawn,finalTurns:s.finalTurns,log:s.log.map(e=>({...e})),players:s.players.map(p=>({id:p.id,name:p.name,bot:p.bot,forfeited:p.forfeited,trains:p.trains,score:p.score,handCount:p.hand.length,ticketCount:p.tickets.length,initial:p.initial,hand:p.id===id?[...p.hand]:null,tickets:p.id===id||finished?[...p.tickets]:null,pending:p.id===id?[...p.pending]:[],completed:p.id===id?p.tickets.filter(tid=>{const t=D.tickets.find(t=>t.id===tid);return connected(s,p.id,t.a,t.b);}):[]})),results:s.results?structuredClone(s.results):null,winners:s.winners?[...s.winners]:[]};
 }
 // Bots receive the same private view as their human seat; no hidden deck access.
 function botMove(v){
  const p=v.players[v.turn];if(p.pending.length)return {kind:'tickets',keep:p.pending.slice(0,p.initial?2:1)};
  const possible=D.routes.flatMap(r=>payments(v,p,r).map(pay=>({r,pay}))).sort((a,b)=>b.r.length-a.r.length||a.pay.locos-b.pay.locos);
  if(!v.drawn&&possible.length){const {r,pay}=possible[0];return {kind:'claim',routeId:r.id,...pay};}
  if(!v.drawn&&p.trains<=2&&v.ticketCount)return {kind:'draw-tickets'};
  const counts=Object.fromEntries(D.colors.map(c=>[c,p.hand.filter(x=>x===c).length]));let indices=v.market.map((c,i)=>({c,i})).filter(x=>!v.drawn||x.c!=='loco').sort((a,b)=>(b.c==='loco'?20:counts[b.c])-(a.c==='loco'?20:counts[a.c]));
  if(indices.length)return {kind:'draw',source:'market',index:indices[0].i};if(v.deckCount||v.discardCount)return {kind:'draw',source:'deck'};
  if(v.ticketCount&&!v.drawn)return {kind:'draw-tickets'};return {kind:'pass'};
 }
 return {create,move,publicState,botMove,connected,longest,payments,available};
});
