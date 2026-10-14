/* Presentation only. Scores and placements always come from the server. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.AzulPresentation=factory();})(globalThis,()=>{
  'use strict';
  const copy=value=>JSON.parse(JSON.stringify(value));
  function connections(wall,row,col){
    const horizontal=[[row,col]],vertical=[[row,col]];
    for(const direction of [-1,1]){
      for(let x=col+direction;x>=0&&x<5&&wall[row][x];x+=direction)horizontal.push([row,x]);
      for(let y=row+direction;y>=0&&y<5&&wall[y][col];y+=direction)vertical.push([y,col]);
    }
    return {horizontal:horizontal.length,vertical:vertical.length,cells:[...new Map([...horizontal,...vertical].map(cell=>[cell.join(','),cell])).values()]};
  }
  function round(before,after){
    if(!before||before.phase!=='draft'||!after?.last||after.revision!==before.revision+1||!(after.round>before.round||after.phase==='finished'))return null;
    // Reconstruct the last draft before wall tiling. The rules resolve that draft
    // and the entire round atomically; the replay must not mutate that state.
    const state=copy(before),move=after.last,player=state.players.find(p=>p.id===move.playerId);
    if(!player||!after.players.every(p=>p.last))return null;
    if(move.source===-1&&state.marker&&player.floor.length<7)player.floor.push(5);
    if(move.accepted){player.lines[move.row].color=move.color;player.lines[move.row].count+=move.accepted;}
    for(let i=move.accepted;i<move.count;i++)if(player.floor.length<7)player.floor.push(move.color);
    state.phase='scoring';state.factories=state.factories.map(()=>[]);state.center=[];state.marker=false;state.winners=[];
    for(const p of state.players){p.last=null;delete p.bonus;}
    const working=copy(state),steps=[];
    for(const result of after.players){
      const p=working.players.find(p=>p.id===result.id);
      p.score=result.last.before;
      for(const placement of result.last.placements){
        p.wall[placement.row][placement.col]=true;
        steps.push({kind:'placement',playerId:p.id,...placement,...connections(p.wall,placement.row,placement.col)});
      }
      if(result.last.penalty)steps.push({kind:'floor',playerId:p.id,penalty:result.last.penalty,applied:Math.min(result.last.before+result.last.points,result.last.penalty)});
      steps.push({kind:'recap',playerId:p.id,last:copy(result.last)});
    }
    if(after.phase==='finished')for(const p of after.players)for(const [type,multiplier] of [['rows',2],['columns',7],['sets',10]]){
      const count=p.bonus[type];if(!count)continue;const cells=[];
      if(type==='rows')p.wall.forEach((row,r)=>{if(row.every(Boolean))row.forEach((_,c)=>cells.push([r,c]));});
      if(type==='columns')for(let c=0;c<5;c++)if(p.wall.every(row=>row[c]))for(let r=0;r<5;r++)cells.push([r,c]);
      if(type==='sets')for(let color=0;color<5;color++)if(p.wall.every((row,r)=>row[(r+color)%5]))for(let r=0;r<5;r++)cells.push([r,(r+color)%5]);
      steps.push({kind:'bonus',playerId:p.id,type,count,points:count*multiplier,cells});
    }
    return {key:after.revision,round:before.round,state,steps};
  }
  function apply(state,step){
    const p=state.players.find(p=>p.id===step.playerId);
    if(step.kind==='placement'){p.wall[step.row][step.col]=true;p.lines[step.row]={color:null,count:0};p.score+=step.points;}
    if(step.kind==='floor'){p.score=Math.max(0,p.score-step.penalty);p.floor=[];}
    if(step.kind==='recap'){p.last=copy(step.last);p.floor=[];}
    if(step.kind==='bonus')p.score+=step.points;
    return state;
  }
  return {round,apply,connections};
});
