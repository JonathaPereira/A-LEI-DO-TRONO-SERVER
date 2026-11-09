(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.AbyssRig=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function pose(p,time=0){
    const q={sheet:{blade:'heroBlade',bow:'heroBow',hammer:'heroHammer',staff:'heroStaff'}[p.weapon],index:12,cols:4,rows:4,size:216,dx:0,dy:0,angle:0,sy:1};
    if(p.specialTime>0){
      const age=p.specialDuration-p.specialTime,phase=clamp(age/p.specialDuration,0,1),impact=p.specialWindup/p.specialDuration;
      const step=phase<impact*.48?0:phase<impact?1:phase<impact+.2?2:3;
      if(p.weapon==='blade'){q.sheet='bladeSpecial';q.rows=2;q.index=age<p.specialWindup?0:age<p.specialWindup+.17?1:age<p.specialWindup+.34?2:3;q.dx=Math.sin(phase*Math.PI)*4;}
      else if(p.weapon==='bow'||p.weapon==='staff'){q.sheet=p.weapon==='bow'?'bowActions':'staffActions';q.rows=3;q.index=8+step;q.angle=Math.sin(phase*Math.PI)*.025;}
      else{q.index=8+step;q.angle=-Math.cos(phase*Math.PI)*.055;}
    }else if(p.swing){
      const phase=clamp(p.swing.t/p.swing.duration,0,1),impact=p.swing.windup/p.swing.duration;
      const step=phase<impact*.52?0:phase<impact?1:phase<impact+.29?2:3;
      if(p.weapon==='blade'){q.sheet=p.swing.airborne?'bladeSpecial':'bladeCombos';q.rows=p.swing.airborne?2:3;q.index=p.swing.airborne?4+step:p.swing.combo*4+step;}
      else if((p.weapon==='bow'||p.weapon==='staff')&&(p.swing.airborne||p.swing.variant===1)){q.sheet=p.weapon==='bow'?'bowActions':'staffActions';q.rows=3;q.index=(p.swing.airborne?4:0)+step;}
      else q.index=8+step;
      const energy=Math.sin(phase*Math.PI);q.angle=p.weapon==='hammer'?-Math.cos(phase*Math.PI)*.055:energy*.04;q.dx=energy*(p.weapon==='blade'?5:2);
    }else if(p.dashTime>0){q.index=15;q.angle=-.025;q.dx=6;}
    else if(p.hurtAnim>0){q.index=13;q.angle=-Math.sin(p.hurtAnim/.28*Math.PI)*.05;}
    else if(p.landAnim>0){q.index=14;q.sy=1-Math.sin(p.landAnim/.2*Math.PI)*.045;}
    else if(!p.ground){q.index=p.jumpAge<.065?4:p.vy<-380?5:p.vy<220?6:7;q.angle=clamp(p.vx/4000,-.045,.045);}
    else if(Math.abs(p.vx)>20){q.index=Math.floor(p.runPhase)%4;q.angle=Math.sin(p.runPhase*Math.PI)*.012;q.dy=-Math.abs(Math.sin(p.runPhase*Math.PI))*1.8;}
    else q.dy=Math.sin(time*2)*.55;
    return q;
  }
  // Pixel anchors on the registered 512px production frames. Shared by gameplay and drawing.
  const ANCHORS={heroBow:[376,295],heroStaff:[420,293],bowActions:[[365,350],[379,362],[369,329]],staffActions:[[413,393],[412,343],[419,347]]};
  function muzzle(p,weapon=p.weapon,time=0){
    const q=pose(p,time),reference=ANCHORS[q.sheet]||ANCHORS[weapon==='bow'?'heroBow':'heroStaff'];
    const a=Array.isArray(reference[0])?reference[Math.min(2,Math.floor(q.index/4))]:reference;
    const px=(a[0]/512-.5)*q.size,py=(a[1]/512-480/512)*q.size*q.sy,c=Math.cos(q.angle),s=Math.sin(q.angle);
    return {x:p.x+p.w/2+p.dir*(q.dx+px*c-py*s),y:p.y+p.h+q.dy+px*s+py*c,pose:q,local:a};
  }
  return {pose,muzzle,ANCHORS};
});
