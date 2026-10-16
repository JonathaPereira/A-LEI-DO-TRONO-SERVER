'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),R=require('../src/legacy/game-rules');
const play=(suit,value,playerId,modifier=0)=>({playerId,card:{suit,value},modifier});
const outcome=(cards,law='ordem',trump)=>{const result=R.evaluate(cards,law,cards[0].card.suit,trump);return [result.crown.playerId,result.shadow.playerId];};
test('Ordem distinguishes the opening suit from Anarquia and falls back only without a second eligible card',()=>{
 assert.deepEqual(outcome([play('cetro',10,0),play('chave',4,1),play('mascara',3,2),play('lamina',8,3)]),[0,2]);
 const cards=[play('cetro',10,0),play('cetro',8,1),play('mascara',3,2),play('lamina',1,3)];assert.deepEqual(outcome(cards),[0,1]);assert.deepEqual(outcome(cards,'anarquia'),[0,3]);
 assert.deepEqual(outcome([play('cetro',3,0),play('cetro',10,1),play('cetro',3,2),play('lamina',1,3)]),[1,0]);
});
test('Estandarte uses two trumps, one trump or Ordem when there are none; ties retain play order',()=>{
 const cards=[play('mascara',12,0),play('cetro',8,1),play('cetro',3,2),play('chave',1,3)];assert.deepEqual(outcome(cards,'estandarte','cetro'),[1,2]);
 assert.deepEqual(outcome([cards[0],cards[1],play('lamina',3,2),cards[3]],'estandarte','cetro'),[1,3]);
 assert.deepEqual(outcome([cards[0],play('mascara',4,1),play('lamina',3,2),cards[3]],'estandarte','cetro'),[0,1]);
 assert.deepEqual(outcome([cards[0],play('cetro',8,1),play('cetro',8,2),cards[3]],'estandarte','cetro'),[1,2]);
 const hand=[{id:'a',suit:'mascara'},{id:'b',suit:'cetro'},{id:'c',suit:'chave'}];assert.deepEqual(R.followCards(hand,'estandarte','mascara','cetro').map(c=>c.id),['a','b']);assert.deepEqual(R.followCards(hand,'ordem','mascara').map(c=>c.id),['a']);
});
test('Revolta remains minimum opening suit/maximum others; effective values clamp and ties are first played',()=>{
 assert.deepEqual(outcome([play('cetro',10,0),play('cetro',4,1),play('mascara',12,2),play('chave',1,3)],'revolta'),[1,2]);
 assert.deepEqual(outcome([play('cetro',10,0,3),play('cetro',12,1),play('cetro',3,2,-3),play('cetro',1,3)]),[0,2]);
});
const players=()=>Array.from({length:4},(_,seat)=>({seat,name:'Casa '+seat,hand:Array.from({length:5},(_,i)=>({id:seat+'-'+i,value:i+1,suit:'cetro',...(i===4?{public:true,publicReason:'Corte Aberta'}:{})}))}));
test('Usurpação allows all three opponents, never picks the separated card, preserves protected cards and full hands',()=>{
 for(const targetSeat of [1,2,3])for(let index=0;index<4;index++){
 const ps=players(),before=ps.flatMap(p=>p.hand.map(c=>c.id)).sort(),state=R.reserveExchange(ps,ps[0],ps[targetSeat],'0-0',a=>[...a].reverse());assert(!state.pickableIds.includes('0-0'));assert(!ps[targetSeat].hand.some(c=>c.id==='0-0'));
 const result=R.finishExchange(ps[0],ps[targetSeat],state,index);assert.notEqual(result.taken.id,'0-0');assert.notEqual(result.taken.id,targetSeat+'-4');assert.equal(result.returnedSameCard,false);assert(ps.every(p=>p.hand.length===5));assert.deepEqual(ps.flatMap(p=>p.hand.map(c=>c.id)).sort(),before);
 }
 const ps=players();assert.throws(()=>R.reserveExchange(ps,ps[0],ps[0],'0-0',a=>a));assert.throws(()=>R.reserveExchange(ps,ps[0],ps[1],'0-4',a=>a));ps[3].hand.length=3;assert.throws(()=>R.reserveExchange(ps,ps[0],ps[1],'0-0',a=>a));
});
test('Conselho transfers simultaneously right; rotation remains left; Espionagem copies a private right-hand clue',()=>{
 for(const direction of [-1,1]){const ps=players(),choices=new Map(ps.map(p=>[p.seat,p.hand[0].id]));R.passCards(ps,choices,direction);for(const p of ps){assert.equal(p.hand.length,5);assert(p.hand.some(c=>c.id===(p.seat-direction+4)%4+'-0'));}}
 const ps=players(),clue=R.intelligence(ps,0,()=>.4);assert.equal(clue.target,3);assert.equal(clue.card.id,'3-2');clue.card.value=99;assert.equal(ps[3].hand[2].value,3);
});
test('Peso blocks only the last Crown starting at trick two, Silêncio blocks all only through trick three',()=>{
 for(let seat=0;seat<4;seat++){assert.equal(R.influenceBlocked({decree:{id:'peso'},trick:1,lastCrown:seat},{seat}),false);assert.equal(R.influenceBlocked({decree:{id:'peso'},trick:2,lastCrown:1},{seat}),seat===1);assert(R.influenceBlocked({decree:{id:'silencio'},trick:3},{seat}));assert(!R.influenceBlocked({decree:{id:'silencio'},trick:4},{seat}));}
 assert.equal(R.decrees.length,10);assert.equal(new Set(R.decrees.map(d=>d.id)).size,10);
});
