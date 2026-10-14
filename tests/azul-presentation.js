'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),R=require('../frontend/azul-rules'),P=require('../frontend/azul-presentation');
function random(seed){return ()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};}
test('scoring presentation reproduces authoritative walls, floor penalties and final bonuses in complete 2–4-player games',()=>{
  let rounds=0,penalties=0,bonuses=0;
  for(let n=2;n<=4;n++)for(let seed=1;seed<=12;seed++){
    const rng=random(seed),players=Array.from({length:n},(_,i)=>({id:'p'+i,name:'Artesão '+i}));let state=R.create(players,rng);
    while(state.phase==='draft'){
      const before=R.publicState(state),original=JSON.stringify(before);state=R.move(state,state.players[state.turn].id,R.botMove(state,rng),rng);
      const after=R.publicState(state),saved=JSON.stringify(after),job=P.round(before,after);
      if(job){
        rounds++;assert.equal(job.state.round,before.round);assert.equal(job.state.phase,'scoring');
        for(const step of job.steps){
          P.apply(job.state,step);const p=job.state.players.find(p=>p.id===step.playerId);
          if(step.kind==='placement'){assert.equal(step.points,R.adjacency(p.wall,step.row,step.col));assert(step.cells.some(([r,c])=>r===step.row&&c===step.col));}
          if(step.kind==='floor')penalties++;
          if(step.kind==='bonus')bonuses++;
          assert(p.score>=0);
        }
        for(const p of job.state.players){const result=after.players.find(v=>v.id===p.id);for(const key of ['score','wall','lines','floor','last'])assert.deepEqual(p[key],result[key],key);}
        assert.equal(P.round(after,after),null,'roster/save updates never repeat points');
      }
      assert.equal(JSON.stringify(before),original);assert.equal(JSON.stringify(after),saved);
    }
  }
  assert(rounds>100&&penalties>50&&bonuses>20);
});
test('reconnects with missing revisions do not invent a partial round replay; both connection directions are distinct',()=>{
  const s=R.publicState(R.create([{id:'a'},{id:'b'}]));const after={...s,round:s.round+1,revision:s.revision+5,last:{}};assert.equal(P.round(s,after),null);
  const wall=Array.from({length:5},()=>Array(5).fill(false));for(const [r,c]of [[2,1],[2,2],[2,3],[1,2],[3,2]])wall[r][c]=true;
  assert.deepEqual(P.connections(wall,2,2),{horizontal:3,vertical:3,cells:[[2,2],[2,1],[2,3],[1,2],[3,2]]});
});
