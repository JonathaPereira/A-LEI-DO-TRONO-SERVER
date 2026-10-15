'use strict';
const os=require('node:os');
// Only Electron's own, positively identified Audio Service is eligible. No
// renderer, game, arbitrary PID, administrator privilege or real-time class.
class AudioPriority{
  constructor({platform=process.platform,metrics,getPriority=os.getPriority,setPriority=os.setPriority}={}){this.platform=platform;this.metrics=metrics;this.getPriority=getPriority;this.setPriority=setPriority;this.active=false;this.timer=null;this.changed=new Map();this.status='idle';}
  isAudio(row){return row.type==='Utility'&&(row.serviceName==='audio.mojom.AudioService'||row.name==='Audio Service')&&Number.isSafeInteger(row.pid)&&row.pid>0&&Number.isFinite(row.creationTime);}
  setActive(active){
    if(typeof active!=='boolean')throw Error('Invalid voice protection state');
    this.active=active;clearInterval(this.timer);this.timer=null;
    if(!active){this.restore();this.status='idle';return this.snapshot();}
    this.refresh();if(this.platform==='win32'){this.timer=setInterval(()=>this.refresh(),10000);this.timer.unref?.();}return this.snapshot();
  }
  refresh(){
    if(!this.active)return;if(this.platform!=='win32'){this.status='system';return;}
    let rows;try{rows=this.metrics().filter(row=>this.isAudio(row));}catch{this.status='unavailable';return;}
    for(const [pid,entry]of this.changed)if(!rows.some(r=>r.pid===pid&&r.creationTime===entry.created))this.changed.delete(pid);
    this.status=rows.length?'system':'waiting';
    for(const row of rows)try{
      const current=this.getPriority(row.pid),target=os.constants.priority.PRIORITY_ABOVE_NORMAL;
      // Lower numbers mean higher priority. Keep any stronger native priority
      // and do not override a user/system change after our initial adjustment.
      if(this.changed.has(row.pid)){this.status=current===target?'managed':'system';continue;}
      if(current>target){this.setPriority(row.pid,target);this.changed.set(row.pid,{created:row.creationTime,original:current,target});this.status='managed';}
    }catch{this.status='unavailable';}
  }
  restore(){
    let rows=[];try{rows=this.metrics();}catch{}
    for(const [pid,entry]of this.changed)try{if(rows.some(r=>this.isAudio(r)&&r.pid===pid&&r.creationTime===entry.created)&&this.getPriority(pid)===entry.target)this.setPriority(pid,entry.original);}catch{}
    this.changed.clear();
  }
  snapshot(){return {active:this.active,status:this.status};}
  dispose(){this.setActive(false);}
}
module.exports={AudioPriority};
