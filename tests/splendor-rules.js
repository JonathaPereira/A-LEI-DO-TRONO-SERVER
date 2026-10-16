'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),R=require('../src/legacy/splendor-rules'),D=require('../src/legacy/splendor-data');
const players=n=>Array.from({length:n},(_,i)=>({id:'p'+i,name:'Mercador '+i})),start=n=>R.create(players(n),()=>.01),take=(...indices)=>({kind:'take',tokens:Array.from({length:6},(_,i)=>indices.filter(v=>v===i).length)});
const current=s=>s.players[s.turn],play=(s,m)=>R.move(s,current(s).id,m);
function seed(v){return ()=>{v=(Math.imul(v,1664525)+1013904223)>>>0;return v/4294967296;};}
test('classic components: exact 40/30/20 cards, 10 nobles and symmetric permanent bonuses',()=>{
 assert.equal(D.cards.length,90);assert.equal(D.nobles.length,10);assert.equal(new Set(D.cards.map(c=>c.id)).size,90);
 for(let level=1;level<=3;level++){assert.equal(D.cards.filter(c=>c.level===level).length,[40,30,20][level-1]);for(let bonus=0;bonus<5;bonus++)assert.equal(D.cards.filter(c=>c.level===level&&c.bonus===bonus).length,[8,6,4][level-1]);}
 for(const n of D.nobles){assert.equal(n.points,3);assert([8,9].includes(R.sum(n.cost)));}
});
test('2/3/4-player setup has original bank/decks, player count plus one nobles and no exposed decks',()=>{
 for(const n of [2,3,4]){const s=start(n),v=R.publicState(s,'p0');assert.deepEqual(s.bank,[...Array(5).fill(n===2?4:n===3?5:7),5]);assert.deepEqual(v.deckCounts,[36,26,16]);assert.equal(s.nobles.length,n+1);assert(s.market.every(row=>row.length===4));assert(!('decks' in v));}
 assert.throws(()=>R.create(players(1)));assert.throws(()=>R.create([players(2)[0],players(2)[0]]));
});
test('taking gems enforces three distinct or two from a stack of at least four, never gold',()=>{
 const s=start(2),before=JSON.stringify(s),a=play(s,take(0,1,2));assert.deepEqual(a.players[s.turn].tokens,[1,1,1,0,0,0]);assert.equal(JSON.stringify(s),before);
 assert.equal(play(s,take(0,0)).bank[0],2);s.bank[0]=3;assert.throws(()=>play(s,take(0,0)),/pilha/);assert.throws(()=>play(s,take(0,1,2,3)));assert.throws(()=>play(s,take(0,0,1)));assert.throws(()=>play(s,take(5)));assert.throws(()=>R.move(s,'p1',take(1)));
 assert.equal(play(s,take(0,1)).bank[1],3);s.bank[2]=0;assert.throws(()=>play(s,take(2)));assert.throws(()=>play(s,{kind:'pass'}));
});
test('token overflow is atomic and returns exactly the excess, including newly taken gold',()=>{
 const s=start(2),p=current(s);p.tokens=[2,2,2,2,1,0];assert.throws(()=>play(s,take(0,1,2)),/Devolva exatamente 2/);assert.equal(R.sum(p.tokens),9);
 const a=play(s,{...take(0,1,2),returnTokens:[0,0,0,2,0,0]});assert.equal(R.sum(a.players[0].tokens),10);assert.equal(a.bank[3],s.bank[3]+2);
 p.tokens=[2,2,2,2,2,0];const b=play(s,{kind:'reserve',level:1,returnTokens:[0,0,0,0,0,1]});assert.equal(b.players[0].tokens[5],0);assert.equal(b.bank[5],5);assert.equal(b.players[0].reserved.length,1);
 assert.throws(()=>play(s,{...take(0),returnTokens:[9,0,0,0,0,0]}));
});
test('reserves are limited to three, concealed per viewer, replenish face-up market and work without gold',()=>{
 let s=start(2);const id=s.market[0][0].id;s=play(s,{kind:'reserve',id});assert.equal(s.players[0].reserved[0].id,id);assert.equal(s.players[0].tokens[5],1);assert.notEqual(s.market[0][0].id,id);
 assert.equal(R.publicState(s,'p0').players[0].reserved[0].id,id);const other=R.publicState(s,'p1');assert.deepEqual(other.players[0].reserved,[{hidden:true,level:1}]);
 s.turn=0;s.bank[5]=0;s=play(s,{kind:'reserve',level:3});assert.equal(s.players[0].reserved[1].level,3);assert.equal(s.last.card,undefined);assert.equal(s.players[0].tokens[5],1);s.turn=0;s=play(s,{kind:'reserve',level:2});s.turn=0;assert.throws(()=>play(s,{kind:'reserve',level:1}),/limite/);
});
test('purchases subtract permanent bonuses, return exact colored/wild payment, and support optional gold substitution',()=>{
 const s=start(2),p=current(s),card=D.cards.find(c=>c.level===2&&c.cost.filter(Boolean).length>=3);s.market[1][0]=card;p.bonuses=[1,1,1,1,1];p.tokens=[3,3,3,3,3,5];
 const auto=R.payment(p,card);assert(auto);const a=play(s,{kind:'buy',id:card.id});assert.equal(a.players[0].cards[0].id,card.id);assert.equal(a.players[0].score,card.points);assert.equal(a.players[0].bonuses[card.bonus],2);assert.deepEqual(a.bank,s.bank.map((n,i)=>n+auto[i]));
 const pay=[...auto],i=pay.findIndex((n,i)=>i<5&&n>0);pay[i]--;pay[5]++;const b=play(s,{kind:'buy',id:card.id,payment:pay});assert.deepEqual(b.last.payment,pay);assert.throws(()=>play(s,{kind:'buy',id:card.id,payment:Array(6).fill(0)}));
 p.bonuses=Array(5).fill(9);p.tokens=Array(6).fill(0);assert.equal(play(s,{kind:'buy',id:card.id}).players[0].score,card.points);
});
test('reserved card must be purchased, empty deck leaves a vacant slot, other reserves cannot be bought',()=>{
 let s=start(2);s.nobles=[];s=play(s,{kind:'reserve',level:1});const card=s.players[0].reserved[0];s.turn=1;s.players[1].bonuses=Array(5).fill(10);assert.throws(()=>play(s,{kind:'buy',id:card.id}));s.turn=0;s.players[0].bonuses=Array(5).fill(10);s=play(s,{kind:'buy',id:card.id});assert.equal(s.players[0].reserved.length,0);assert.equal(s.players[0].cards.length,1);
 s.turn=0;s.decks[0]=[];const id=s.market[0][0].id;s=play(s,{kind:'buy',id});assert.equal(s.market[0][0],null);assert.throws(()=>play({...s,turn:0},{kind:'reserve',level:1}));
});
test('nobles use permanent bonuses, award exactly one per turn and require a choice when multiple qualify',()=>{
 const s=start(2),p=current(s);s.nobles=D.nobles.slice(0,2);p.tokens=[0,3,3,3,0,1];const a=play(s,{kind:'reserve',level:1,returnTokens:[0,0,0,0,0,1]});assert.equal(a.players[0].nobles.length,0);
 p.tokens=Array(6).fill(0);p.bonuses=Array(5).fill(4);const b=play(s,take(0));assert.equal(b.phase,'noble');assert.equal(b.turn,0);assert.equal(b.players[0].turns,0);assert.equal(b.eligible.length,2);assert.throws(()=>play(b,take(1)));const c=play(b,{kind:'noble',id:b.eligible[1]});assert.equal(c.players[0].score,3);assert.equal(c.players[0].nobles.length,1);assert.equal(c.nobles.length,1);assert.equal(c.players[0].turns,1);assert.equal(c.turn,1);
});
test('15 prestige triggers end of round, not immediate victory; fewer developments wins ties, then shared victory',()=>{
 let s=start(3);s.players[0].score=15;s=play(s,take(0));assert(s.finalRound);assert.equal(s.phase,'action');s.players[1].score=17;s=play(s,take(1));assert.equal(s.phase,'action');s=play(s,take(2));assert.equal(s.phase,'finished');assert.deepEqual(s.winners,['p1']);assert.deepEqual(s.players.map(p=>p.turns),[1,1,1]);
 s=start(2);s.players.forEach(p=>p.score=15);s.players[0].cards=[D.cards[0]];s=play(s,take(0));s=play(s,take(1));assert.deepEqual(s.winners,['p1']);
 s=start(2);s.starter=1;s.turn=1;s.players.forEach(p=>p.score=15);s=play(s,take(0));assert.equal(s.turn,0);s=play(s,take(1));assert.deepEqual(s.winners,['p0','p1']);
});
test('a noble can trigger the last round and choosing it does not add a second turn',()=>{
 let s=start(2);s.nobles=D.nobles.slice(0,2);s.players[0].score=12;s.players[0].bonuses=Array(5).fill(4);s=play(s,take(0));assert.equal(s.phase,'noble');assert(!s.finalRound);s=play(s,{kind:'noble',id:s.eligible[0]});assert(s.finalRound);assert.equal(s.players[0].score,15);assert.equal(s.players[0].turns,1);
});
test('bots complete full seeded games of every size without losing cards, tokens or exposing reserved hands',()=>{
 for(const n of [2,3,4])for(let run=0;run<6;run++){
  const random=seed(104+run);let s=R.create(players(n),random),actions=0;const totals=[...s.bank];
  while(s.phase!=='finished'&&actions++<700){s=play(s,R.botMove(s,random));for(let i=0;i<6;i++)assert.equal(s.bank[i]+s.players.reduce((v,p)=>v+p.tokens[i],0),totals[i]);assert(s.players.every(p=>R.sum(p.tokens)<=10&&p.reserved.length<=3));const all=[...s.decks.flat(),...s.market.flat().filter(Boolean),...s.players.flatMap(p=>[...p.cards,...p.reserved])];assert.equal(all.length,90);assert.equal(new Set(all.map(c=>c.id)).size,90);for(const p of s.players){assert.equal(p.score,p.cards.reduce((v,c)=>v+c.points,0)+p.nobles.length*3);assert.deepEqual(p.bonuses,Array.from({length:5},(_,i)=>p.cards.filter(c=>c.bonus===i).length));}}
  assert.equal(s.phase,'finished');assert(s.players.some(p=>p.score>=15));assert.equal(new Set(s.players.map(p=>p.turns)).size,1);
 }
});
