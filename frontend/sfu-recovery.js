'use strict';
(function(root){
 const terminal=new Set(['REALTIME_DISABLED','REALTIME_NOT_CONFIGURED','REALTIME_HARD_LIMIT','SFU_ROOM_SAFETY_LIMIT','SCREEN_BUDGET_BLOCKED']);
 class SfuPublicationRecovery{
  constructor({active,track,publish,exhausted,report=()=>{},now=()=>Date.now(),delay=(ms,signal)=>new Promise(resolve=>{const timer=setTimeout(done,ms);function done(){clearTimeout(timer);signal.removeEventListener('abort',done);resolve();}signal.addEventListener('abort',done,{once:true});})}){Object.assign(this,{active,track,publish,exhausted,report,now,delay});this.jobs=new Map();}
  cancel(kind){const job=this.jobs.get(kind);if(job){job.cancelled=true;job.controller.abort();}this.jobs.delete(kind);}
  clear(){for(const kind of this.jobs.keys())this.cancel(kind);}
  recover(kind,error){
   const track=this.track(kind),old=this.jobs.get(kind);if(old?.track===track)return old.promise;if(old)this.cancel(kind);
   if(!this.active()||!track||track.readyState!=='live')return Promise.resolve(false);
   const job={track,cancelled:false,controller:new AbortController(),promise:null},current=()=>!job.cancelled&&this.jobs.get(kind)===job&&this.active()&&this.track(kind)===track&&track.readyState==='live';this.jobs.set(kind,job);
   job.promise=(async()=>{let last=error;const start=this.now(),limit=kind==='audio'?2:4;
    for(let attempt=1;attempt<=limit;attempt++){
     if(!current())return false;if(terminal.has(last?.code)||last?.code==='SFU_CANCELLED')break;
     this.report(kind,last,attempt,false);await this.delay(Math.min(8000,500*2**(attempt-1)),job.controller.signal);if(!current())return false;
     try{await this.publish(kind,track);return current();}catch(err){last=err;if(this.now()-start>=(kind==='audio'?15000:60000))break;}
    }
    if(current()&&last?.code!=='SFU_CANCELLED'){this.report(kind,last,limit,true);await this.exhausted(kind,last);}return false;
   })().finally(()=>{if(this.jobs.get(kind)===job)this.jobs.delete(kind);});return job.promise;
  }
 }
 class SfuSubscriptionQueue{
  constructor(){this.jobs=new Map();this.pools={audio:{active:0,limit:3,queue:[]},media:{active:0,limit:2,queue:[]}};}
  cancel(key){const job=this.jobs.get(key);if(job)job.cancelled=true;this.jobs.delete(key);}
  clear(){for(const key of this.jobs.keys())this.cancel(key);this.pools={audio:{active:0,limit:3,queue:[]},media:{active:0,limit:2,queue:[]}};}
  schedule(key,kind,version,task){
   const old=this.jobs.get(key);if(old?.version===version)return old.promise;if(old)this.cancel(key);
   const pool=this.pools[kind==='audio'?'audio':'media'],job={version,cancelled:false,promise:null};this.jobs.set(key,job);
   const current=()=>!job.cancelled&&this.jobs.get(key)===job;
   job.promise=new Promise((resolve,reject)=>{pool.queue.push({job,key,current,task,resolve,reject});});this.drain(pool);return job.promise;
  }
  drain(pool){
   while(pool.active<pool.limit&&pool.queue.length){const entry=pool.queue.shift();if(!entry.current()){entry.resolve(false);continue;}pool.active++;
    Promise.resolve().then(()=>entry.current()?entry.task(entry.current):false).then(entry.resolve,entry.reject).finally(()=>{pool.active--;if(this.jobs.get(entry.key)===entry.job)this.jobs.delete(entry.key);this.drain(pool);});
   }
  }
 }
 const api={SfuPublicationRecovery,SfuSubscriptionQueue};root.TronoSfuRecovery=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
