'use strict';
window.TronoStorage=(()=>{
  const memory=new Map();let persistent=null;
  try{persistent=window.localStorage;}catch{}
  return {getItem(key){if(memory.has(key))return memory.get(key);try{return persistent?.getItem(key)??null;}catch{return null;}},setItem(key,value){memory.set(key,String(value));try{persistent?.setItem(key,String(value));}catch{}},removeItem(key){memory.set(key,null);try{persistent?.removeItem(key);}catch{}}};
})();
window.TronoAudio=(()=>{
const $=id=>document.getElementById(id),storage=window.TronoStorage;
// Áudio procedural original (Web Audio). Funciona offline: trilha medieval + efeitos.
let audioCtx = null;
let masterBus = null;
let musicMaster = null;
let sfxMaster = null;
let musicEnabled = storage.getItem('tronoMusicEnabled')!=='0';
let sfxEnabled = storage.getItem('tronoSfxEnabled')!=='0';
let musicStep = 0;
let musicRequest=0;
const MUSIC_TRACKS={
  // Faixas modernas liberadas em CC0/Public Domain pelo próprio autor no OpenGameArt.
  // Cada faixa possui fallback local original do protótipo para evitar silêncio caso a origem externa esteja indisponível.
  lofi:{label:'Lo-fi',artist:'omfgdude',license:'CC0',src:'https://opengameart.org/sites/default/files/lofiagain.ogg',fallback:'assets/audio/classical_piano_nocturne.mp3'},
  edm:{label:'EDM',artist:'MintoDog',license:'CC0',src:'https://opengameart.org/sites/default/files/joyfully_loop_bpm170.mp3',fallback:'assets/audio/electronic_summer_nights.mp3'},
  rock:{label:'Rock',artist:'Kistol',license:'CC0',src:'https://opengameart.org/sites/default/files/Codename%20Granny%20II_0.ogg',fallback:'assets/audio/rock_guitar_solo.mp3'},
  electronic:{label:'Eletrônica',artist:'vitalezzz',license:'CC0',src:'https://opengameart.org/sites/default/files/claimed_by_the_void_loop.mp3',fallback:'assets/audio/electronic_summer_nights.mp3'}
};
const LEGACY_MUSIC_TRACKS={tavern:'lofi',classical:'lofi'};
let currentMusicTrack=storage.getItem('tronoMusicTrack')||'lofi';
currentMusicTrack=LEGACY_MUSIC_TRACKS[currentMusicTrack]||currentMusicTrack;
if(!MUSIC_TRACKS[currentMusicTrack]) currentMusicTrack='lofi';
window.TRONO_MUSIC_TRACKS=MUSIC_TRACKS;

async function ensureAudio(){
  const AC=window.AudioContext||window.webkitAudioContext;
  if(AC && !audioCtx){
    try{
      audioCtx=new AC();
      masterBus=audioCtx.createGain();musicMaster=audioCtx.createGain();sfxMaster=audioCtx.createGain();
      masterBus.gain.value=.82;musicMaster.gain.value=.0001;sfxMaster.gain.value=.78;
      musicMaster.connect(masterBus);sfxMaster.connect(masterBus);masterBus.connect(audioCtx.destination);
    }catch(err){audioCtx=null;console.warn('Efeitos de áudio indisponíveis neste navegador:',err);}
  }
  try{if(audioCtx?.state==='suspended')void audioCtx.resume().catch(e=>console.warn('O áudio aguarda interação.',e));}catch{}
  if(musicEnabled)void startBackgroundMusic();
  updateMusicButton();
  return !audioCtx || audioCtx.state==='running';
}

function loadMusicSource(el,track,{fallback=false}={}){
  if(!el||!track)return;
  const source=fallback?track.fallback:track.src;
  if(!source)return;
  const expected=new URL(source,location.href).href;
  if(el.src!==expected){el.pause();el.src=source;el.dataset.musicFallback=fallback?'1':'0';el.load();}
}
function setMusicPlaybackStatus(message=''){
  for(const id of ['portalMusicStatus','voiceMusicStatus']){const el=$(id);if(el)el.textContent=message;}
}
async function startBackgroundMusic(){
  const el=$('bgMusic'); if(!el) return false;
  const track=MUSIC_TRACKS[currentMusicTrack]||MUSIC_TRACKS.lofi;
  const expected=new URL(track.src,location.href).href;
  const fallbackExpected=track.fallback?new URL(track.fallback,location.href).href:'';
  if(el.src!==expected&&el.src!==fallbackExpected) loadMusicSource(el,track);
  const vol=Number($('musicVolume')?.value ?? $('lobbyMusicVolume')?.value ?? $('portalMusicVolume')?.value ?? 32)/100;
  el.volume=musicEnabled?Math.max(0,Math.min(1,vol)):0;
  el.muted=!musicEnabled;
  if(!el.paused){setMusicPlaybackStatus();return true;}
  const request=++musicRequest;setMusicPlaybackStatus('Carregando música…');
  try{await el.play();if(request===musicRequest)setMusicPlaybackStatus();return true;}
  catch(e){if(request===musicRequest)setMusicPlaybackStatus(e.name==='NotAllowedError'?'O navegador bloqueou a música. Clique em uma faixa para liberar.':'Não foi possível tocar a faixa. Tente outra música.');console.info('A música aguardará a próxima interação do jogador.',e);return false;}
}
function syncVolumeControls(value){
  for(const id of ['musicVolume','lobbyMusicVolume','portalMusicVolume','voiceMusicVolume']){const input=$(id);if(input&&String(input.value)!==String(value))input.value=value;}
  for(const id of ['musicVolumeValue','lobbyMusicVolumeValue','portalMusicVolumeValue','voiceMusicVolumeValue']){const out=$(id);if(out)out.textContent=`${value}%`;}
}
function setMusicVolume(v){
  const value=Math.max(0,Math.min(100,Number(v)||0));
  const el=$('bgMusic'); if(el){el.volume=value/100; el.muted=!musicEnabled || value===0;}
  syncVolumeControls(value);
  storage.setItem('tronoMusicVolume',String(value));
}
function setMusicTrack(id,{play=true}={}){
  if(!MUSIC_TRACKS[id]) return;
  currentMusicTrack=id;storage.setItem('tronoMusicTrack',id);
  document.querySelectorAll('.track-btn').forEach(b=>b.classList.toggle('active',b.dataset.track===id));
  const el=$('bgMusic');if(el)loadMusicSource(el,MUSIC_TRACKS[id]);
  window.dispatchEvent(new CustomEvent('trono-music-track',{detail:{id,...MUSIC_TRACKS[id]}}));
  if(musicEnabled&&play)void ensureAudio().catch(()=>{});
}
function tone(freq,when,dur=.45,vol=.08,type='triangle',destination=musicMaster,attack=.018,cutoff=1800){
  if(!audioCtx||!destination) return;
  const osc=audioCtx.createOscillator(), gain=audioCtx.createGain(), filter=audioCtx.createBiquadFilter();
  osc.type=type; osc.frequency.setValueAtTime(freq,when);
  filter.type='lowpass'; filter.frequency.setValueAtTime(cutoff,when);
  gain.gain.setValueAtTime(.0001,when);
  gain.gain.exponentialRampToValueAtTime(Math.max(.0002,vol),when+attack);
  gain.gain.exponentialRampToValueAtTime(.0001,when+dur);
  osc.connect(filter); filter.connect(gain); gain.connect(destination);
  osc.start(when); osc.stop(when+dur+.06);
}
function noiseHit(when,dur=.10,vol=.03,destination=musicMaster,cutoff=700){
  if(!audioCtx||!destination) return;
  const len=Math.max(1,Math.floor(audioCtx.sampleRate*dur));
  const buffer=audioCtx.createBuffer(1,len,audioCtx.sampleRate), data=buffer.getChannelData(0);
  for(let i=0;i<len;i++) data[i]=(Math.random()*2-1)*(1-i/len);
  const src=audioCtx.createBufferSource(), filter=audioCtx.createBiquadFilter(), gain=audioCtx.createGain();
  src.buffer=buffer; filter.type='lowpass'; filter.frequency.value=cutoff; gain.gain.value=vol;
  src.connect(filter); filter.connect(gain); gain.connect(destination); src.start(when); src.stop(when+dur);
}
function scheduleTavernBar(){
  if(!audioCtx||audioCtx.state!=='running'||!musicEnabled||!musicMaster) return;
  const now=audioCtx.currentTime+.08;
  // Frase original em Ré menor/dórico: alaúde, bordão e percussão leve.
  const phraseA=[293.66,349.23,392,440,392,349.23,329.63,293.66,261.63,293.66,349.23,392,349.23,329.63,293.66,261.63];
  const phraseB=[293.66,329.63,349.23,392,440,392,349.23,293.66,261.63,293.66,329.63,349.23,392,349.23,329.63,293.66];
  const melody=(musicStep%2===0?phraseA:phraseB);
  const bassRoots=[146.83,130.81,174.61,146.83];
  for(let i=0;i<16;i++){
    const t=now+i*.46;
    tone(melody[i],t,.33,.095,i%4===0?'triangle':'sine',musicMaster,.014,1450);
    if(i%4===0){
      const root=bassRoots[(musicStep+(i/4))%bassRoots.length];
      tone(root,t,.92,.055,'triangle',musicMaster,.025,750);
      tone(root*1.5,t+.02,.58,.025,'sine',musicMaster,.025,950);
      noiseHit(t,.075,.018,musicMaster,520);
    }else if(i%2===0) noiseHit(t,.045,.008,musicMaster,1200);
  }
  musicStep=(musicStep+1)%8;
}
function playSfx(kind){
  if(!sfxEnabled||!audioCtx||audioCtx.state!=='running'||!sfxMaster) return;
  const t=audioCtx.currentTime+.01;
  if(kind==='click'){
    tone(720,t,.055,.025,'sine',sfxMaster,.004,2600);tone(520,t+.025,.045,.012,'triangle',sfxMaster,.003,1800);
  }else if(kind==='card'){
    noiseHit(t,.055,.055,sfxMaster,1700); tone(170,t,.10,.035,'triangle',sfxMaster,.006,900);
  }else if(kind==='crown'){
    tone(293.66,t,.75,.14,'triangle',sfxMaster,.02,2200); tone(369.99,t+.11,.78,.12,'triangle',sfxMaster,.02,2400); tone(440,t+.24,1.05,.13,'sine',sfxMaster,.025,2600); tone(587.33,t+.42,.85,.08,'sine',sfxMaster,.02,2800);
  }else if(kind==='shadow'){
    tone(174.61,t,1.25,.13,'sawtooth',sfxMaster,.04,900); tone(146.83,t+.18,1.45,.11,'triangle',sfxMaster,.04,700); noiseHit(t+.05,.7,.028,sfxMaster,420);
  }else if(kind==='influence'){
    tone(659.25,t,.48,.11,'sine',sfxMaster,.01,3000); tone(783.99,t+.13,.58,.10,'sine',sfxMaster,.01,3200);
  }else if(kind==='decree'){
    noiseHit(t,.22,.035,sfxMaster,850); tone(220,t,.42,.06,'triangle',sfxMaster,.02,1200);
  }else if(kind==='turn'){
    // Arauto curto, mais audível: três notas ascendentes + sino agudo.
    tone(392.00,t,.24,.12,'triangle',sfxMaster,.006,2200);
    tone(523.25,t+.10,.32,.13,'sine',sfxMaster,.006,2800);
    tone(659.25,t+.22,.38,.12,'triangle',sfxMaster,.006,3200);
    tone(783.99,t+.35,.48,.075,'sine',sfxMaster,.008,3600);
  }
}
async function setMusicEnabled(next){
  musicEnabled=!!next;storage.setItem('tronoMusicEnabled',musicEnabled?'1':'0');
  const el=$('bgMusic');
  if(musicEnabled){if(el){el.muted=false;setMusicVolume(storage.getItem('tronoMusicVolume')??32);}void ensureAudio().catch(()=>{});}
  else{musicRequest++;if(el){el.muted=true;el.pause();}setMusicPlaybackStatus('Música silenciada.');}
  updateMusicButton();window.dispatchEvent(new CustomEvent('trono-audio-state',{detail:{musicEnabled,sfxEnabled}}));return musicEnabled;
}
async function toggleMusic(){return setMusicEnabled(!musicEnabled);}
function setSfxEnabled(next){
  sfxEnabled=!!next;storage.setItem('tronoSfxEnabled',sfxEnabled?'1':'0');
  window.dispatchEvent(new CustomEvent('trono-audio-state',{detail:{musicEnabled,sfxEnabled}}));return sfxEnabled;
}
function toggleSfx(){return setSfxEnabled(!sfxEnabled);}
function updateMusicButton(unsupported=false){
  for(const id of ['musicBtn','lobbyMusicBtn','portalMusicBtn']){
    const btn=$(id); if(!btn) continue;
    btn.disabled=false;btn.setAttribute('aria-pressed',String(musicEnabled));
    if(unsupported){btn.textContent='♫ Áudio indisponível';btn.classList.add('muted');continue;}
    btn.textContent=musicEnabled?'♫ Música ligada':'♫ Música silenciada';
    btn.classList.toggle('muted',!musicEnabled);
    btn.classList.toggle('music-active',musicEnabled);
  }
  document.querySelectorAll('.track-btn').forEach(b=>b.classList.toggle('active',b.dataset.track===currentMusicTrack));
}


function bind(){
  setMusicVolume(storage.getItem('tronoMusicVolume')??32);setMusicTrack(currentMusicTrack,{play:false});updateMusicButton();
  for(const id of ['musicVolume','lobbyMusicVolume','portalMusicVolume'])$(id)?.addEventListener('input',e=>setMusicVolume(e.target.value));
  for(const id of ['musicBtn','lobbyMusicBtn','portalMusicBtn'])$(id)?.addEventListener('click',toggleMusic);
  document.querySelectorAll('.track-btn').forEach(btn=>btn.addEventListener('click',()=>setMusicTrack(btn.dataset.track)));
  $('bgMusic')?.addEventListener('error',()=>{const el=$('bgMusic'),track=MUSIC_TRACKS[currentMusicTrack];if(!el||!track?.fallback||el.dataset.musicFallback==='1')return;loadMusicSource(el,track,{fallback:true});if(musicEnabled)void startBackgroundMusic();});
  window.addEventListener('pointerdown',()=>{if(musicEnabled||sfxEnabled)void ensureAudio().catch(()=>{});},{once:true});
  document.addEventListener('click',e=>{const target=e.target?.closest?.('button,[role="button"],a[href],select,input[type="checkbox"],input[type="radio"],summary,.hand-card,.room-card');if(!target||target.matches(':disabled')||target.dataset.noClickSfx==='1'||!sfxEnabled)return;void ensureAudio().then(()=>playSfx('click')).catch(()=>{});},true);
}
window.addEventListener('DOMContentLoaded',bind);
return {ensureAudio,playSfx,toggleMusic,setMusicEnabled,toggleSfx,setSfxEnabled,setMusicTrack,setMusicVolume,
 get currentTrack(){return currentMusicTrack;},get musicEnabled(){return musicEnabled;},get sfxEnabled(){return sfxEnabled;},get musicVolume(){return Number(storage.getItem('tronoMusicVolume')??32);}};
})();
