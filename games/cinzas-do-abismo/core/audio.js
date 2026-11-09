(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.AbyssSound=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const clamp=v=>Math.max(0,Math.min(1,Number(v)||0));
  class Soundscape {
    constructor({enabled=true,music=.34,effects=.65,master=.7}={}){this.enabled=enabled;this.musicLevel=clamp(music);this.effectsLevel=clamp(effects);this.master=clamp(master);this.ctx=null;this.tracks={};this.pains=[];this.cooldowns={};this.current='forest';this.paused=false;this.hidden=false;this.sources=new Set();this.initialized=false;}
    media(path,loop=false){try{if(typeof Audio==='undefined')return null;const a=new Audio(path);a.preload='auto';a.loop=loop;a.volume=0;return a;}catch{return null;}}
    async enable(){
      this.enabled=true;try{if(!this.ctx){const C=typeof window!=='undefined'&&(window.AudioContext||window.webkitAudioContext);if(C){this.ctx=new C();this.bus=this.ctx.createGain();this.bus.connect(this.ctx.destination);this.delay=this.ctx.createDelay(.6);this.delay.delayTime.value=.19;this.wet=this.ctx.createGain();this.wet.gain.value=.14;this.bus.connect(this.delay);this.delay.connect(this.wet);this.wet.connect(this.ctx.destination);this.bus.gain.value=this.effectsLevel*this.master;this.noiseBuffer=this.ctx.createBuffer(1,this.ctx.sampleRate,this.ctx.sampleRate);const data=this.noiseBuffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1);}}
        if(!this.initialized){for(const key of ['forest','crypt','forge','boss'])this.tracks[key]=this.media('assets/v5/audio/music-'+key+'.mp3',true);for(let i=1;i<=3;i++)this.pains.push(this.media('assets/v5/audio/pain-'+i+'.mp3'));this.initialized=true;}
        if(this.bus)this.bus.gain.value=this.effectsLevel*this.master;if(this.ctx?.state==='suspended')await this.ctx.resume();const track=this.tracks[this.current];if(track&&!this.hidden)Promise.resolve(track.play()).catch(()=>{});return !!(this.ctx||track);
      }catch{return false;}
    }
    mute(){this.enabled=false;for(const a of Object.values(this.tracks))a?.pause();for(const a of this.pains)a?.pause();if(this.bus)this.bus.gain.value=0;}
    levels(music,effects,master=this.master){this.musicLevel=clamp(music);this.effectsLevel=clamp(effects);this.master=clamp(master);if(this.bus)this.bus.gain.value=this.enabled?this.effectsLevel*this.master:0;}
    scene(biome=0,boss=false,tunnel=false){const key=boss?'boss':tunnel||biome===1?'crypt':biome===2?'forge':'forest';if(this.current===key)return;this.current=key;if(this.enabled&&!this.hidden){const a=this.tracks[key];if(a){a.currentTime=0;Promise.resolve(a.play()).catch(()=>{});}}}
    tick(dt,{paused=false,hidden=false}={}){
      this.paused=paused;if(hidden!==this.hidden){this.hidden=hidden;if(hidden)for(const a of Object.values(this.tracks))a?.pause();else if(this.enabled)Promise.resolve(this.tracks[this.current]?.play()).catch(()=>{});}
      for(const [key,a] of Object.entries(this.tracks)){if(!a)continue;const target=this.enabled&&!hidden&&key===this.current?this.master*this.musicLevel*(paused?.3:1):0;a.volume=clamp(a.volume+(target-a.volume)*Math.min(1,dt*2.8));if(a.volume<.002&&key!==this.current&&!a.paused)a.pause();}
    }
    ready(key,gap=.06){if(!this.enabled||!this.ctx||this.ctx.state==='suspended'||this.hidden)return false;const t=this.ctx.currentTime;if((this.cooldowns[key]||0)>t||this.sources.size>30)return false;this.cooldowns[key]=t+gap;return true;}
    attach(source,gain,pan=0){const c=this.ctx;source.connect(gain);if(c.createStereoPanner){const p=c.createStereoPanner();p.pan.value=pan;gain.connect(p);p.connect(this.bus);}else gain.connect(this.bus);this.sources.add(source);const cleanup=()=>{this.sources.delete(source);try{source.disconnect();gain.disconnect();}catch{}};source.onended=cleanup;return cleanup;}
    oscillator(frequency,end,duration=.12,volume=.12,type='sine',delay=0,pan=0){const c=this.ctx;if(!c)return;const t=c.currentTime+delay,osc=c.createOscillator(),gain=c.createGain();osc.type=type;osc.frequency.setValueAtTime(frequency,t);osc.frequency.exponentialRampToValueAtTime(Math.max(20,end),t+duration);gain.gain.setValueAtTime(.001,t);gain.gain.linearRampToValueAtTime(volume,t+.008);gain.gain.exponentialRampToValueAtTime(.001,t+duration);this.attach(osc,gain,pan);osc.start(t);osc.stop(t+duration+.025);}
    noise(duration=.12,frequency=1200,volume=.1,type='bandpass',pan=0){const c=this.ctx;if(!c)return;const t=c.currentTime,source=c.createBufferSource(),filter=c.createBiquadFilter(),gain=c.createGain();source.buffer=this.noiseBuffer;filter.type=type;filter.frequency.setValueAtTime(frequency,t);filter.frequency.exponentialRampToValueAtTime(Math.max(80,frequency*.55),t+duration);filter.Q.value=.7;source.connect(filter);gain.gain.setValueAtTime(volume,t);gain.gain.exponentialRampToValueAtTime(.001,t+duration);const cleanup=this.attach(filter,gain,pan);source.onended=()=>{try{source.disconnect();}catch{}cleanup();};source.start(t,Math.random()*.4,duration);}
    element(kind,heavy=false){
      if(!this.ready('element-'+kind,.09))return;const amp=heavy?.22:.11;
      if(kind==='fire'){this.noise(heavy?.48:.2,550,amp,'lowpass');this.oscillator(94,34,.23,amp*.65);}
      else if(kind==='frost'){for(let i=0;i<4;i++)this.oscillator(880+i*420,820+i*410,.2+i*.035,amp*.2,'sine',i*.018,(i-1.5)*.23);this.noise(.23,3200,amp*.45,'highpass');}
      else if(kind==='lightning'){this.noise(.065,3900,amp,'highpass');this.oscillator(160,45,.12,amp*.8);this.noise(.14,1900,amp*.7);}
      else if(kind==='poison'||kind==='web'){this.oscillator(270,88,.18,amp*.6,'sine');this.oscillator(190,290,.12,amp*.4,'sine',.06);this.noise(.2,420,amp*.5);}
      else{this.oscillator(320,520,.22,amp*.3,'sine');this.oscillator(610,910,.29,amp*.18,'sine',.045);this.noise(.13,2100,amp*.3);}
    }
    pain(){if(!this.enabled||this.hidden)return;const a=this.pains[Math.floor(Math.random()*this.pains.length)];if(a){a.volume=this.master*this.effectsLevel*.75;a.currentTime=0;Promise.resolve(a.play()).catch(()=>{});}}
    event(event){
      const type=event.type;
      if(type==='impact'){if(!this.ready('hit',.035))return;this.noise(.07,event.kind==='metal'?1900:600,event.critical?.20:.13);this.oscillator(event.kind==='metal'?780:110,event.kind==='metal'?660:46,.12,.075);if(event.kind&&!['physical','echo','metal'].includes(event.kind))this.element(event.kind);}
      else if(type==='hurt'){if(!this.ready('hurt',.4))return;this.noise(.12,490,.24);this.oscillator(98,37,.16,.14);this.pain();if(event.kind!=='physical')this.element(event.kind);}
      else if(type==='attack'){if(!this.ready('swing',.06))return;if(event.weapon==='blade'||event.weapon==='hammer')this.noise(event.weapon==='hammer'?.2:.12,1450,.10);else this.noise(.12,event.weapon==='bow'?620:1800,.06);}
      else if(type==='release'){if(!this.ready('release',.055))return;if(event.weapon==='bow'){this.noise(event.super?.21:.1,2300,event.super?.2:.13);this.oscillator(510,160,.09,.055);}else this.element(event.element||'arcane',event.super);}
      else if(type==='cast'){if(!this.ready('cast',.15))return;this.oscillator(90,260,.45,.045);this.noise(.35,1100,.06);}
      else if(type==='status')this.element(event.element);
      else if(type==='skill')this.element(event.element||'arcane',true);
      else if(type==='step'){if(!this.ready('step',.12))return;this.noise(.055,event.terrain==='water'?1600:event.terrain==='ice'?2600:event.kind==='bridge'?380:760,.035);}
      else if(type==='land'||type==='headbump'){if(!this.ready(type,.1))return;this.noise(.07,500,.055);this.oscillator(78,37,.08,.045);}
      else if(type==='dash'){if(this.ready('dash',.15))this.noise(.2,1700,.085);}
      else if(type==='telegraph'){if(this.ready('warning',.15)){this.oscillator(58,73,.23,.05);this.noise(.2,460,.045);}}
      else if(['chosen','relic','bosskill','clear','end'].includes(type)){if(!this.ready('reward',.15))return;const notes=type==='bosskill'?[196,294,392]:[392,494,587];notes.forEach((f,i)=>this.oscillator(f,f,.35,.035,'sine',i*.065));}
    }
  }
  return {Soundscape};
});
