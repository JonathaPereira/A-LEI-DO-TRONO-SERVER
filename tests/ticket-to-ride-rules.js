'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),D=require('../frontend/ticket-to-ride-data'),R=require('../frontend/ticket-to-ride-rules');
const rng=seed=>()=>((seed=Math.imul(seed,1664525)+1013904223)>>>0)/4294967296;
function create(n=2,seed=42){return R.create(Array.from({length:n},(_,i)=>({id:'p'+i,name:'Pessoa '+i})),{random:rng(seed)});}
function start(n=2,seed=42){let s=create(n,seed);for(const p of s.players)s=R.move(s,p.id,{kind:'tickets',keep:p.pending.slice(0,2)});return s;}
function total(s){return s.deck.length+s.discard.length+s.market.length+s.players.reduce((n,p)=>n+p.hand.length,0);}
const route=(a,b)=>D.routes.find(r=>r.a===a&&r.b===b||r.a===b&&r.b===a);
test('classic USA inventory: 36 cities, 100 routes, 30 original tickets, 110 cards and 45 trains',()=>{
 assert.equal(Object.keys(D.cities).length,36);assert.equal(D.routes.length,100);assert.equal(D.tickets.length,30);assert.equal(new Set(D.routes.map(r=>r.id)).size,100);
 assert(D.routes.every(r=>D.cities[r.a]&&D.cities[r.b]&&r.length>=1&&r.length<=6));assert.equal(D.routes.filter(r=>r.double).length,44);
 const s=create(5),cards=[...s.deck,...s.market,...s.players.flatMap(p=>p.hand)];assert.equal(cards.length,110);for(const c of D.colors)assert.equal(cards.filter(x=>x===c).length,12);assert.equal(cards.filter(x=>x==='loco').length,14);assert(s.players.every(p=>p.trains===45&&p.hand.length===4&&p.pending.length===3));assert.equal(s.ticketDeck.length,15);
 assert.throws(()=>create(1));assert.throws(()=>create(6));
});
test('private initial tickets require two; hidden decks, other hands, offers and rejected tickets never enter public state',()=>{
 let s=create(3);const p=s.players[0],before=JSON.stringify(R.publicState(s,p.id));assert.throws(()=>R.move(s,p.id,{kind:'tickets',keep:[p.pending[0]]}));assert.throws(()=>R.move(s,p.id,{kind:'tickets',keep:[p.pending[0],p.pending[0]]}));assert.equal(JSON.stringify(R.publicState(s,p.id)),before);
 const rejected=p.pending[2];s=R.move(s,p.id,{kind:'tickets',keep:p.pending.slice(0,2)});assert.equal(s.ticketDeck[0],rejected);const v=R.publicState(s,p.id);assert(!('deck'in v));assert(!('ticketDeck'in v));assert(!('random'in v));assert(v.players[1].hand===null&&v.players[1].tickets===null&&v.players[1].pending.length===0);assert.equal(s.phase,'setup');assert.throws(()=>R.move(s,p.id,{kind:'draw',source:'deck'}));
});
test('draw twice, prohibit a second face-up locomotive, blind locomotive costs one and face-up costs the whole turn',()=>{
 let s=start();const id=s.players[s.turn].id,turn=s.turn;s.market=['red','loco','blue','green','white'];s.deck=['yellow','loco'];s.discard=[];
 let next=R.move(s,id,{kind:'draw',source:'market',index:0});assert.equal(next.turn,turn);assert.equal(next.drawn,1);assert.throws(()=>R.move(next,id,{kind:'draw',source:'market',index:0}));assert.throws(()=>R.move(next,id,{kind:'claim',routeId:'r0-0',color:'red',locos:0}));next=R.move(next,id,{kind:'draw',source:'deck'});assert.notEqual(next.turn,turn);
 next=R.move(s,id,{kind:'draw',source:'market',index:1});assert.notEqual(next.turn,turn);assert.equal(next.players[turn].hand.length,s.players[turn].hand.length+1);
 s.deck=['loco'];next=R.move(s,id,{kind:'draw',source:'deck'});assert.equal(next.turn,turn);assert.equal(next.drawn,1);assert.equal(next.players[turn].hand.at(-1),'loco');
});
test('market with three locomotives refreshes and exhausted card pools terminate without looping',()=>{
 let s=start();s.market=['loco','loco','loco','red','green'];s.deck=['white','blue','orange','black','yellow'];s.discard=[];s=R.move(s,s.players[s.turn].id,{kind:'draw',source:'deck'});assert.equal(s.market.length,5);assert(s.market.filter(x=>x==='loco').length<3);
 s=start();s.market=['red','loco','loco'];s.deck=[];s.discard=[];const turn=s.turn;s=R.move(s,s.players[turn].id,{kind:'draw',source:'market',index:0});assert.notEqual(s.turn,turn);
});
test('claims spend exact colors/wilds, score correctly and reject insufficient trains, forged payments and wrong turns atomically',()=>{
 let s=start(),p=s.players[s.turn],r=route('Los Angeles','El Paso');p.hand=['black','black','black','black','loco','loco'];const before=JSON.stringify(R.publicState(s,p.id));assert.throws(()=>R.move(s,p.id,{kind:'claim',routeId:r.id,color:'red',locos:2}));assert.throws(()=>R.move(s,s.players[1-s.turn].id,{kind:'draw',source:'deck'}));assert.equal(JSON.stringify(R.publicState(s,p.id)),before);
 let next=R.move(s,p.id,{kind:'claim',routeId:r.id,color:'black',locos:2});assert.equal(next.claimed[r.id],p.id);assert.equal(next.players.find(x=>x.id===p.id).score,15);assert.equal(next.players.find(x=>x.id===p.id).trains,39);assert.equal(next.players.find(x=>x.id===p.id).hand.length,0);assert.equal(next.discard.length,6);assert.equal(s.claimed[r.id],undefined);
 p.trains=5;assert.throws(()=>R.move(s,p.id,{kind:'claim',routeId:r.id,color:'black',locos:2}));
});
test('parallel routes close at 2–3 players; 4–5 allow distinct owners only; gray routes use a single color',()=>{
 const pair=D.routes.filter(r=>r.a==='Vancouver'&&r.b==='Seattle');for(const n of [2,3,4,5]){const s=start(n),p=s.players[s.turn];s.claimed[pair[0].id]='p0';p.hand=['red','blue','loco'];assert.equal(R.payments(s,p,pair[1]).length>0,n>=4&&p.id!=='p0');}
 let s=start(4),p=s.players[s.turn];p.hand=['red','blue'];const r=route('Los Angeles','Las Vegas');assert.equal(R.payments(s,p,r).length,0);p.hand=['red','loco'];assert(R.payments(s,p,r).some(x=>x.color==='red'&&x.locos===1));
});
test('midgame tickets keep one or more, put rejected under the deck, and consume one turn after selection',()=>{
 let s=start(),id=s.players[s.turn].id,turn=s.turn;const count=s.ticketDeck.length;s=R.move(s,id,{kind:'draw-tickets'});assert.equal(s.turn,turn);const offers=s.players[turn].pending;assert.equal(offers.length,3);assert.throws(()=>R.move(s,id,{kind:'tickets',keep:[]}));assert.throws(()=>R.move(s,id,{kind:'draw',source:'deck'}));s=R.move(s,id,{kind:'tickets',keep:offers.slice(0,1)});assert.equal(s.ticketDeck.length,count-1);assert.notEqual(s.turn,turn);assert.equal(s.players[turn].tickets.length,3);
});
test('longest continuous trail may revisit cities but never edges; disconnected branches cannot be added',()=>{
 const s=start();for(const [a,b]of [['Los Angeles','Phoenix'],['Phoenix','El Paso'],['El Paso','Los Angeles'],['Vancouver','Calgary']])s.claimed[route(a,b).id]='p0';assert.equal(R.longest(s,'p0'),12);assert(R.connected(s,'p0','Los Angeles','El Paso'));assert(!R.connected(s,'p0','Los Angeles','Calgary'));
 const branch=start();for(const [a,b]of [['Helena','Calgary'],['Helena','Winnipeg'],['Helena','Duluth']])branch.claimed[route(a,b).id]='p0';assert.equal(R.longest(branch,'p0'),10);
});
test('final trigger grants exactly one more turn to every player; reveals tickets, penalties and tied longest bonuses',()=>{
 let s=start(3),p=s.players[s.turn],r=route('Vancouver','Seattle');p.trains=3;p.hand=['red'];s=R.move(s,p.id,{kind:'claim',routeId:r.id,color:'red',locos:0});assert.equal(s.finalTurns,3);const trigger=p.id;for(let i=0;i<3;i++){assert.equal(s.phase,'playing');const id=s.players[s.turn].id;s=R.move(s,id,{kind:'draw',source:'market',index:s.market.findIndex(c=>c==='loco')>=0?s.market.findIndex(c=>c==='loco'):0});if(s.drawn)s=R.move(s,id,{kind:'draw',source:'deck'});if(i===2)assert.equal(id,trigger);}assert.equal(s.phase,'finished');assert(s.winners.length);for(const result of s.results)assert.equal(result.total,result.routeScore+result.ticketScore+result.bonus);assert(s.results.some(r=>r.ticketScore<0));assert(R.publicState(s,'p0').players.every(p=>Array.isArray(p.tickets)));assert.throws(()=>R.move(s,'p0',{kind:'draw',source:'deck'}));
});
test('seeded complete games at every player count conserve all cards/tickets and accept only legal private-view bot actions',{timeout:30000},()=>{
 for(const n of [2,3,4,5])for(const seed of [3,75]){let s=start(n,seed),moves=0;while(s.phase!=='finished'){const p=s.players[s.turn],v=R.publicState(s,p.id),m=R.botMove(v);s=R.move(s,p.id,m);assert.equal(total(s),110);assert.equal(s.ticketDeck.length+s.players.reduce((n,p)=>n+p.tickets.length+p.pending.length,0),30);assert(s.players.every(p=>p.trains>=0));assert(++moves<2500,'bots must finish');}assert(s.winners.length);}
});
