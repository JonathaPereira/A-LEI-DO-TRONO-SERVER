'use strict';
(function(root){
  // Isolated policy: sustained trouble lowers video, never microphone quality.
  class CallStability{
    constructor(){this.reset();}
    reset(){this.level=0;this.badSince=null;this.goodSince=null;this.changedAt=-Infinity;this.reason='';}
    sample(t,stamp,enabled=true){
      if(!enabled){const changed=this.level!==0;this.reset();return changed;}
      const cpu=t.limiter==='cpu'||t.eventLoopLagMs>=180;
      const network=t.audioLossPct>=5||t.audioJitterMs>=70||t.rttMs>=350||t.limiter==='bandwidth';
      const poor=cpu||network;
      if(poor){this.goodSince=null;if(this.badSince===null)this.badSince=stamp;this.reason=cpu?'sobrecarga local':'instabilidade de rede';
        if(stamp-this.badSince>=12000&&stamp-this.changedAt>=20000&&this.level<2){this.level++;this.changedAt=stamp;this.badSince=stamp;return true;}
      }else{this.badSince=null;if(this.goodSince===null)this.goodSince=stamp;
        if(this.level&&stamp-this.goodSince>=60000&&stamp-this.changedAt>=20000){this.level--;this.changedAt=stamp;this.goodSince=stamp;if(!this.level)this.reason='';return true;}
      }
      return false;
    }
    profile(base){if(!this.level)return base;const severe=this.level===2;return {...base,
      camera:{width:severe?640:960,height:severe?360:540,fps:severe?15:24},
      screen:{width:Math.min(base.screen.width,1280),height:Math.min(base.screen.height,720),fps:Math.min(base.screen.fps,severe?15:30)},
      videoBitrate:Math.min(base.videoBitrate,severe?450000:1000000),screenBitrate:Math.min(base.screenBitrate,severe?2500000:4000000)};
    }
  }
  function diagnosticReport({version,platform,call,telemetry,processing,adaptation,resources}){
    const fields=['rttMs','uploadBps','downloadBps','audioLossPct','audioJitterMs','concealedPct','jitterBufferMs','eventLoopLagMs','lossPct','jitterMs','outFps','inFps','outW','outH','inW','inH'];
    const numbers={};for(const key of fields)if(Number.isFinite(telemetry?.[key]))numbers[key]=Math.round(Math.max(0,telemetry[key])*100)/100;
    const safe=value=>String(value||'').replace(/[\r\n]/g,' ').slice(0,80);
    return JSON.stringify({app:'M&N',version:safe(version),platform:safe(platform),at:new Date().toISOString(),
      call:{joined:!!call.joined,muted:!!call.muted,deafened:!!call.deafened,camera:!!call.camera,screen:!!call.screen,transport:safe(call.transport)},
      playback:safe(call.playback),processing:safe(processing),adaptation:safe(adaptation),metrics:numbers,
      network:{state:safe(telemetry?.pcState),route:safe(telemetry?.iceRoute),limiter:safe(telemetry?.limiter)},
      resources:resources?{appCpuPercent:Number(resources.appCpuPercent)||0,appMemoryMB:Number(resources.appMemoryMB)||0,freeMemoryMB:Number(resources.freeMemoryMB)||0}:null},null,2);
  }
  root.TronoCallStability={CallStability,diagnosticReport};if(typeof module!=='undefined')module.exports=root.TronoCallStability;
})(typeof window==='undefined'?globalThis:window);
