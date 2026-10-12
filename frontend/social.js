'use strict';
window.TronoSocial = (()=>{
  const $=id=>document.getElementById(id);
  const storage=window.TronoStorage||localStorage;
  const peers=new Map();
  const remoteAudio=new Map();
  const remoteAvStreams=new Map();
  const remoteScreenStreams=new Map();
  const pendingIce=new Map();
  const voiceMeters=new Map();
  const speakingPeers=new Set();
  const videoRetryTimers=new Map();
  const mediaHealthyAt=new Map();
  const privateVoiceRoster=new Map();
  const sfuLocalPublications=new Map();
  const sfuSubscriptions=new Map();
  const sfuRetryTimers=new Map();
  const sfuRetryCount=new Map();
  let sfuPublicationList=[];
  let realtimeStatus=null;
  let realtimeSyncError='';
  let realtimeSyncTimer=null;
  let mediaTransport='p2p';
  let sfuSyncChain=Promise.resolve();
  let lastSfuError='';
  let sfuGeneration=0;
  let mixedTransportTimer=null,roomVoiceMode=null;
  let voiceGeneration=0,voiceJoinPromise=null;
  const senderQualityQueues=new WeakMap(),profileMedia=new Map();
  let mutedBeforeDeafen=false;

  let meterAudioContext=null;
  const clampGain=v=>Math.min(300,Math.max(0,Math.round((Number(v)||0)/5)*5));
  let microphoneVolume=clampGain(storage.getItem('mnMicrophoneGain')??100);
  let outputVolume=clampGain(storage.getItem('mnOutputGain')??100);
  const peerVolumes=new Map();
  const remoteGraphs=new Map();
  const remotePlayback=new Map();
  const audioPlayRequests=new WeakMap();
  let lastOutputError='';
  const streamVolumes=new Map();
  const watchingStreams=new Set();
  const hiddenCameras=new Set();
  const streamWatchVersions=new Map();
  const blockedAudio=new Set();
  let mediaAudioContext=null;
  const isScreenKind=kind=>kind==='screen'||kind==='screen-audio';
  const wantsSfuPublication=pub=>pub.ownerId!==meId()&&(pub.kind!=='camera'||!hiddenCameras.has(pub.ownerId))&&(!isScreenKind(pub.kind)||(inChatHub()&&watchingStreams.has(pub.ownerId)));
  const streamAudioKey=id=>`stream:${id}`;
  function ensureMediaAudioContext(){
    const Ctx=window.AudioContext||window.webkitAudioContext;if(!Ctx)return null;
    if(!mediaAudioContext||mediaAudioContext.state==='closed'){
      try{mediaAudioContext=new Ctx({latencyHint:'interactive',sampleRate:48000});}catch(err){console.warn('[TronoSocial] Web Audio indisponível; usando áudio direto',err);return null;}
      if(selectedOutput&&mediaAudioContext.setSinkId)void mediaAudioContext.setSinkId(selectedOutput).catch(()=>{});
      mediaAudioContext.onstatechange=()=>{
        void refreshMicPipeline().catch(err=>console.warn('[TronoSocial] retomar microfone',err));
        // A destination produced by a paused context is silent even with healthy RTP.
        // Switch receivers back to their original track on every context transition.
        for(const key of remoteAudio.keys())attachRemoteAudio(key);
        updateAudioRecoveryUI();
      };
    }
    return mediaAudioContext;
  }
  function updateAudioRecoveryUI(){
    const blocked=blockedAudio.size>0||(voiceJoined&&mediaAudioContext&&mediaAudioContext.state!=='running');
    $('resumeAudioBtn')?.classList.toggle('hidden',!blocked);
  }
  function unlockCallAudio(){
    // Call resume/play synchronously inside the user's gesture, before permission/network awaits.
    const ctx=ensureMediaAudioContext();
    if(ctx&&ctx.state!=='running')void ctx.resume().then(()=>{
      for(const key of remoteAudio.keys())attachRemoteAudio(key);updateAudioRecoveryUI();
    }).catch(()=>updateAudioRecoveryUI());
    if(callSoundContext&&callSoundContext.state!=='running')void callSoundContext.resume().catch(()=>{});
    for(const [key,a] of remoteAudio)void playRemoteAudio(key,a);
  }
  function playRemoteAudio(key,a){
    const playback=a.srcObject,pending=audioPlayRequests.get(a);
    if(pending?.playback===playback)return pending.promise;
    const current=()=>remoteAudio.get(key)===a&&a.srcObject===playback&&remotePlayback.get(key)?.route!=='gain';
    const request={playback,promise:null};
    audioPlayRequests.set(a,request);
    request.promise=(async()=>{
      try{
        // Invoke play in the gesture, rather than after an asynchronous sink change.
        const routed=applyOutput(a),playing=a.play();await Promise.all([routed,playing]);
        if(!current())return;blockedAudio.delete(key);const state=remotePlayback.get(key);if(state)state.error='';
      }catch(err){
        // Replacing srcObject cancels the previous play promise; it is not an autoplay denial.
        if(!current()||err?.name==='AbortError')return;
        blockedAudio.add(key);const state=remotePlayback.get(key);if(state)state.error=err?.name||err?.message||'PLAYBACK_FAILED';
        setStatus('Áudio recebido. Toque em Liberar áudio para ouvir.','warn');
      }finally{
        if(audioPlayRequests.get(a)===request)audioPlayRequests.delete(a);
        updateAudioRecoveryUI();
      }
    })();return request.promise;
  }
  // A reprodução é encaminhada por um destino MediaStream para preservar setSinkId.
  function renderGainValues(){
    for(const [prefix,value] of [['mic',microphoneVolume],['output',outputVolume]]){
      const slider=$(`${prefix}GainSlider`),label=$(`${prefix}GainValue`);if(slider)slider.value=String(value);if(label)label.textContent=`${value}%`;
    }
  }
  function updateRemoteGain(id){
    const graph=remoteGraphs.get(id),stream=id.startsWith('stream:'),peer=(stream?streamVolumes.get(id.slice(7)):peerVolumes.get(id))??100;
    const gain=(outputVolume/100)*(peer/100);
    if(graph&&graph.ctx.state==='running'){graph.gain.gain.setTargetAtTime(deafened?0:gain,graph.ctx.currentTime,.012);}
    else{const el=remoteAudio.get(id);if(el)el.volume=Math.min(1,gain);}
  }
  function closeRemoteGain(id){
    const graph=remoteGraphs.get(id);if(!graph)return;remoteGraphs.delete(id);
    try{graph.close();}catch{}
  }
  function attachRemoteAudio(id){
    const screen=id.startsWith('stream:'),peerId=screen?id.slice(7):id;
    if(screen&&!watchingStreams.has(peerId))return;
    const sourceStream=screen?remoteScreenStreamFor(peerId):remoteAvStreamFor(peerId);
    const currentTrack=sourceStream.getAudioTracks().find(t=>t.readyState==='live');if(!currentTrack)return;
    let state=remotePlayback.get(id);
    if(state?.track!==currentTrack){state={track:currentTrack,stream:new MediaStream([currentTrack]),error:'',route:'direct'};remotePlayback.set(id,state);}
    const stream=state.stream;let a=remoteAudio.get(id);
    if(!a){a=document.createElement('audio');a.autoplay=true;a.playsInline=true;a.dataset.peer=id;$('remoteAudioHost')?.appendChild(a);remoteAudio.set(id,a);}
    let graph=remoteGraphs.get(id);
    const volume=(outputVolume/100)*((screen?streamVolumes.get(peerId):peerVolumes.get(peerId))??100)/100;
    // Normal listening needs only the received track. Web Audio is needed for amplification.
    if(graph&&(graph.trackId!==currentTrack.id||volume<=1||graph.ctx.state!=='running')){closeRemoteGain(id);graph=null;}
    if(!graph&&volume>1){
      const ctx=ensureMediaAudioContext();
      if(ctx?.state==='running'&&(!selectedOutput||typeof ctx.setSinkId==='function'))try{
        graph=window.TronoAudioGain.create(ctx,stream,volume);if(graph)remoteGraphs.set(id,graph);
      }catch(err){console.warn('[TronoSocial] ganho de reprodução indisponível',err);}
    }
    // Keep the original received stream attached. Mute only while the running
    // Web Audio graph actually supplies the output; suspension restores it.
    state.route=graph&&graph.ctx.state==='running'?'gain':'direct';if(state.route==='gain')blockedAudio.delete(id);
    if(a.srcObject!==stream)a.srcObject=stream;
    a.muted=deafened||state.route==='gain';a.volume=Math.min(1,volume);updateRemoteGain(id);
    if(state.route==='direct')void playRemoteAudio(id,a);
    if(!screen)void watchStream(id,stream);
  }
  function removeRemoteAudio(key){
    closeRemoteGain(key);blockedAudio.delete(key);remotePlayback.delete(key);const a=remoteAudio.get(key);
    if(a){a.pause?.();a.srcObject=null;a.remove();remoteAudio.delete(key);}updateAudioRecoveryUI();
  }
  function setStreamGain(id,value){
    unlockCallAudio();streamVolumes.set(id,clampGain(value));attachRemoteAudio(streamAudioKey(id));
    const tile=findPeerTile($('screenShareGrid'),id,'.screen-share-tile');
    const label=tile?.querySelector('.mn-stream-volume output');if(label)label.textContent=`${streamVolumes.get(id)}%`;
  }
  async function toggleWatchStream(id){
    if(!voiceJoined||!privateVoiceRoster.get(id)?.screen)return;
    streamWatchVersions.set(id,(streamWatchVersions.get(id)||0)+1);
    if(watchingStreams.has(id)){
      watchingStreams.delete(id);removeRemoteAudio(streamAudioKey(id));
      const retry=videoRetryTimers.get(id);clearTimeout(retry);videoRetryTimers.delete(id);
      if(transportIsSfu())for(const kind of ['screen','screen-audio'])void closeSfuSubscription(sfuKey(id,kind));
      const tile=findPeerTile($('screenShareGrid'),id,'.screen-share-tile'),video=tile?.querySelector('video');if(video){video.pause();video.srcObject=null;}
      if(document.fullscreenElement===tile)await document.exitFullscreen().catch(()=>{});
    }else{watchingStreams.add(id);unlockCallAudio();}
    if(transportIsSfu())void syncSfuSubscriptions();
    else window.TronoNetwork?.sendVoiceSignal(id,'stream-watch',{watching:watchingStreams.has(id)});
    if(watchingStreams.has(id))attachRemoteAudio(streamAudioKey(id));
    renderVoiceRoster();renderScreenGrid();
  }
  function setMicrophoneGain(value){
    microphoneVolume=clampGain(value);storage.setItem('mnMicrophoneGain',String(microphoneVolume));
    const proc=micCapture?.processor;if(proc?.gainNode)proc.gainNode.gain.setTargetAtTime(microphoneVolume/100,proc.ctx.currentTime,.012);
    renderGainValues();
  }
  function setOutputGain(value){
    unlockCallAudio();outputVolume=clampGain(value);storage.setItem('mnOutputGain',String(outputVolume));
    for(const id of remoteAudio.keys())attachRemoteAudio(id);renderGainValues();
  }
  function setPeerGain(id,value){
    if(!privateVoiceRoster.has(id)||id===meId())return;
    unlockCallAudio();peerVolumes.set(id,clampGain(value));attachRemoteAudio(id);
    const slider=document.querySelector(`[data-peer-volume="${CSS.escape(id)}"]`);
    const label=slider?.closest('.mn-peer-gain')?.querySelector('output');if(label)label.textContent=`${peerVolumes.get(id)}%`;
  }

  let roomState=null,chatRoomState=null;
  let localStream=null;
  let localScreenStream=null,localDisplayStream=null,screenGeneration=0;
  let micCapture=null,micGeneration=0,noiseLoading=false;
  let voiceJoined=false;
  let micMuted=false;
  let deafened=false;
  let cameraOn=false;
  let cameraRequest=null,cameraGeneration=0,cameraTogglePending=false;
  let screenSharing=false;
  let panelOpen=false;
  let chatHubMode=false;
  let panelMode=storage.getItem('tronoSocialMode')==='floating'?'floating':'full';
  let chatMuted=storage.getItem('tronoChatMuted')==='1';
  let noiseSuppression=storage.getItem('tronoNoiseSuppression')!=='0';
  let noiseEngine=window.TronoDesktop?(storage.getItem('mnDesktopNoiseMode')|| (noiseSuppression?'native':'off')):'rnnoise';
  if(!['native','rnnoise','off'].includes(noiseEngine))noiseEngine='native';
  if(window.TronoDesktop)noiseSuppression=noiseEngine!=='off';
  let voiceLightMode=storage.getItem('tronoVoiceLightMode')==='1';
  let selectedInput=storage.getItem('tronoVoiceInput')||'';
  let selectedOutput=storage.getItem('tronoVoiceOutput')||'';
  let selectedCamera=storage.getItem('tronoCameraInput')||'';
  let transmissionQuality=['economy','balanced','high'].includes(storage.getItem('tronoTransmissionQuality'))?storage.getItem('tronoTransmissionQuality'):'balanced';
  const SCREEN_BITRATES=[4,6,8,10,12,15];
  let screenBitrateMbps=SCREEN_BITRATES.includes(Number(storage.getItem('mnScreenBitrate')))?Number(storage.getItem('mnScreenBitrate')):8;
  let screenContent=storage.getItem('mnScreenContent')==='motion'?'motion':'detail';
  const SCREEN_FORMATS={
    '720-15':{width:1280,height:720,fps:15},'1080-15':{width:1920,height:1080,fps:15},
    '720-30':{width:1280,height:720,fps:30},'720-60':{width:1280,height:720,fps:60},
    '1080-30':{width:1920,height:1080,fps:30},'1080-60':{width:1920,height:1080,fps:60}
  };
  let screenFormat=SCREEN_FORMATS[storage.getItem('mnScreenFormat')]?storage.getItem('mnScreenFormat'):'720-30';
  let shareStreamAudio=storage.getItem('mnShareStreamAudio')!=='0';
  let settingsOpen=false;
  let settingsTab=storage.getItem('tronoVoiceSettingsTab')||'audio';
  let voiceRosterInitialized=false;
  let voiceEventsSupported=false;
  let callAlertVolume=Math.max(0,Math.min(100,Number(storage.getItem('mnCallAlertVolume')??85)||0));
  let callSoundContext=null;
  const callSoundCooldown=new Map();
  let chatDrawerOpen=false;
  let chatUnreadCount=0;
  let emojiOpen=false;
  let localScreenPreviewPaused=false;
  let localScreenCollapsed=false;
  let telemetryOpen=false;
  let telemetryTimer=null,telemetrySchedule=0,telemetryCollecting=false;
  let telemetrySnapshot=null;
  const telemetryPrev=new Map();

  const rtcConfig=window.TRONO_RTC_CONFIG||{iceServers:[{urls:['stun:stun.l.google.com:19302','stun:stun1.l.google.com:19302']}]};
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const meId=()=>window.TronoNetwork?.clientId;
  const supportedMedia=()=>navigator.mediaDevices?.getSupportedConstraints?.()||{};
  const publicVoiceActive=()=>!!roomState?.voiceActive;
  const detailedPlayers=()=>[...privateVoiceRoster.values()].sort((a,b)=>(a.seat??999)-(b.seat??999));
  const inGame=()=>!$('gameScreen')?.classList.contains('hidden');
  const inChatHub=()=>chatHubMode||!$('chatOnlyScreen')?.classList.contains('hidden');
  const QUALITY_PROFILES={
    economy:{label:'Economia',camera:{width:1280,height:720,fps:30},screen:{width:1280,height:720,fps:30},videoBitrate:900000,screenBitrate:4000000,audioBitrate:64000,hint:'720p/30 FPS.'},
    balanced:{label:'Equilibrada',camera:{width:1280,height:720,fps:30},screen:{width:1280,height:720,fps:30},videoBitrate:2200000,screenBitrate:8000000,audioBitrate:96000,hint:'720p/30 FPS.'},
    high:{label:'Alta',camera:{width:1280,height:720,fps:30},screen:{width:1280,height:720,fps:30},videoBitrate:3500000,screenBitrate:10000000,audioBitrate:128000,hint:'720p/30 FPS.'}
  };
  const QUALITY_ORDER=['economy','balanced','high'];
  function cappedQuality(){
    const max=realtimeStatus?.maxQuality;
    if(mediaTransport==='sfu'&&max&&QUALITY_ORDER.includes(max)&&QUALITY_ORDER.indexOf(transmissionQuality)>QUALITY_ORDER.indexOf(max))return max;
    return transmissionQuality;
  }
  const effectiveScreenBitrate=()=>Math.min(screenBitrateMbps,realtimeStatus?.highAllowed===false&&transportIsSfu()?6:15)*1000000;
  const qualityProfile=()=>({...QUALITY_PROFILES[cappedQuality()]||QUALITY_PROFILES.balanced,screen:SCREEN_FORMATS[screenFormat],screenBitrate:effectiveScreenBitrate()});
  const plainSdp=desc=>desc?{type:desc.type,sdp:desc.sdp}:null;
  const transportIsSfu=()=>mediaTransport==='sfu';
  const transportPending=()=>mediaTransport==='sfu-pending'||mediaTransport==='stopping';
  const announcedTransport=()=>mediaTransport==='sfu'?(sfuLocalPublications.get('audio')?.ready?'sfu':'sfu-pending'):transportPending()?'sfu-pending':'p2p';
  const p2pIceConfig=()=>({...rtcConfig,iceServers:[...(rtcConfig.iceServers||[]),...(sfuIceConfig.iceServers||[])]});
  let sfuIceConfig={iceServers:[{urls:['stun:stun.cloudflare.com:3478']}],iceTransportPolicy:'all'};
  let sfuTurnActive=false;

  function setStatus(text,kind=''){
    const el=$('voiceStatus');
    if(el){el.textContent=text;el.dataset.kind=kind;}
  }
  function setUnreadCount(value){
    chatUnreadCount=Math.max(0,Number(value)||0);
    for(const id of ['chatUnread','chatOnlyUnread']){const el=$(id);if(!el)continue;el.textContent=String(chatUnreadCount);el.classList.toggle('hidden',chatUnreadCount===0);}
    $('chatOnlyTextBtn')?.classList.toggle('has-unread',chatUnreadCount>0);
  }
  function updateChatDrawerUI(){
    const hub=inChatHub(),panel=$('socialPanel');
    if(hub&&chatRoomState?.channelType==='text')chatDrawerOpen=true;if(hub&&chatRoomState?.channelType==='voice')chatDrawerOpen=false;
    panel?.classList.toggle('chat-drawer-open',hub&&chatDrawerOpen);
    const chat=panel?.querySelector('.court-chat-section');if(chat){chat.hidden=hub&&!chatDrawerOpen;chat.setAttribute('aria-hidden',String(hub&&!chatDrawerOpen));}
    for(const id of ['chatOnlyTextBtn','mnSidebarTextBtn'])$(id)?.setAttribute('aria-expanded',String(hub&&chatDrawerOpen));
    $('chatOnlyTextBtn')?.classList.toggle('active',hub&&chatDrawerOpen);
    $('chatDrawerCloseBtn')?.classList.toggle('hidden',!hub);
    if(hub&&chatDrawerOpen)setUnreadCount(0);
  }
  function toggleTextChat(force){
    if(!inChatHub()){showPanel(typeof force==='boolean'?force:!panelOpen);return;}
    chatDrawerOpen=typeof force==='boolean'?force:!chatDrawerOpen;
    updateChatDrawerUI();
    if(chatDrawerOpen){setUnreadCount(0);setTimeout(()=>$('courtChatInput')?.focus(),80);}
  }
  const EMOJIS=['😀','😄','😂','🤣','😊','😍','🥰','😎','🤔','😮','😢','😡','👍','👎','👏','🙌','🙏','💪','🤝','❤️','💙','💜','🔥','✨','⚡','🎉','🏆','🎮','🎲','♛','⚔️','🛡️','👑','☕','🍻','🫡','👀','✅','❌','💬','📷','🎙️','🖥️','🚀','💯','🤡','😅','😉'];
  function populateEmojiPicker(){
    const box=$('emojiPicker');if(!box||box.childElementCount)return;
    box.innerHTML=EMOJIS.map(e=>`<button type="button" class="emoji-option" data-emoji="${e}" aria-label="${e}">${e}</button>`).join('');
    box.addEventListener('click',ev=>{const b=ev.target.closest('.emoji-option');if(!b)return;insertEmoji(b.dataset.emoji||'');});
  }
  function insertEmoji(emoji){
    const input=$('courtChatInput');if(!input||!emoji)return;
    const start=input.selectionStart??input.value.length,end=input.selectionEnd??start;
    input.value=input.value.slice(0,start)+emoji+input.value.slice(end);
    const pos=start+emoji.length;input.setSelectionRange?.(pos,pos);input.focus();
  }
  function toggleEmojiPicker(force){
    emojiOpen=typeof force==='boolean'?force:!emojiOpen;populateEmojiPicker();
    $('emojiPicker')?.classList.toggle('hidden',!emojiOpen);$('emojiBtn')?.classList.toggle('active',emojiOpen);$('emojiBtn')?.setAttribute('aria-expanded',emojiOpen?'true':'false');
  }
  function toggleTelemetry(force){telemetryOpen=typeof force==='boolean'?force:!telemetryOpen;$('telemetryPanel')?.classList.toggle('hidden',!telemetryOpen);$('telemetryOpenBtn')?.setAttribute('aria-expanded',String(telemetryOpen));window.dispatchEvent(new CustomEvent('trono-telemetry-change',{detail:{open:telemetryOpen}}));startTelemetry();}
  function ensureLocalStream(){if(!localStream)localStream=new MediaStream();return localStream;}
  function playCallSound(kind='join',id='local'){
    if(deafened||window.TronoAudio?.sfxEnabled===false||storage.getItem('tronoSfxEnabled')==='0')return;
    const key=`${kind}:${id}`,now=Date.now();if((callSoundCooldown.get(key)||0)>now-750)return;callSoundCooldown.set(key,now);
    const Ctx=window.AudioContext||window.webkitAudioContext;if(!Ctx)return;
    try{
      if(!callSoundContext||callSoundContext.state==='closed')callSoundContext=new Ctx();
      if(callSoundContext.state==='suspended')callSoundContext.resume().catch(()=>{});
      if(kind!=='message'&&callAlertVolume===0)return;
      const ctx=callSoundContext,t=ctx.currentTime+.01,g=ctx.createGain();g.connect(ctx.destination);const level=kind==='message'?.11:.52*callAlertVolume/100;g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(Math.max(.0001,level),t+.025);g.gain.exponentialRampToValueAtTime(.0001,t+(kind==='message'?.36:.65));
      const notes=kind==='join'?[784,1047,1568]:kind==='message'?[1320,1760]:kind==='disconnect'?[740,554,370]:[1047,698];notes.forEach((freq,i)=>{const at=t+i*(kind==='message'?.11:.17),o=ctx.createOscillator();o.type='sine';o.frequency.setValueAtTime(freq,at);o.connect(g);o.start(at);o.stop(at+(kind==='message'?.18:.22));o.onended=()=>{o.disconnect();if(i===notes.length-1)g.disconnect();};});
    }catch(err){console.warn('[TronoSocial] aviso sonoro',err);}
  }
  function primeCallSounds(){if(window.TronoAudio?.sfxEnabled===false)return;const Ctx=window.AudioContext||window.webkitAudioContext;if(!Ctx)return;try{if(!callSoundContext||callSoundContext.state==='closed')callSoundContext=new Ctx();if(callSoundContext.state==='suspended')void callSoundContext.resume().catch(()=>{});if(selectedOutput&&callSoundContext.setSinkId)void callSoundContext.setSinkId(selectedOutput).catch(()=>{});}catch{}}
  function callNotice(event){window.TronoCommunity?.voiceNotice?.(event);}
  function toggleVoiceSettings(force){
    if(window.TronoDesktopSettings)return window.TronoDesktopSettings.toggle(force);
    settingsOpen=typeof force==='boolean'?force:!settingsOpen;
    const panel=$('voiceSettingsPanel'),btn=$('voiceSettingsBtn');panel?.classList.toggle('hidden',!settingsOpen);btn?.classList.toggle('settings-active',settingsOpen);btn?.setAttribute('aria-expanded',settingsOpen?'true':'false');
  }
  function setSettingsTab(tab='audio'){
    if(!['audio','video','connection',...(window.TronoDesktop?['capture','account','appearance','game','activity','privacy']:[])].includes(tab))tab='audio';settingsTab=tab;storage.setItem('tronoVoiceSettingsTab',tab);
    document.querySelectorAll('[data-settings-tab]').forEach(btn=>{const on=btn.dataset.settingsTab===tab;btn.classList.toggle('active',on);btn.setAttribute('aria-selected',on?'true':'false');});
    document.querySelectorAll('[data-settings-panel]').forEach(panel=>{const on=panel.dataset.settingsPanel===tab;panel.classList.toggle('active',on);panel.hidden=!on;});
  }
  function updateAudioPreferenceButtons(){
    const sfx=window.TronoAudio?.sfxEnabled??storage.getItem('tronoSfxEnabled')!=='0',music=window.TronoAudio?.musicEnabled??storage.getItem('tronoMusicEnabled')!=='0';
    const sb=$('voiceSfxBtn'),mb=$('voiceMusicBtn');
    if(sb){sb.textContent=sfx?'🔔 Efeitos: Ligados':'🔕 Efeitos: Mutados';sb.classList.toggle('audio-muted',!sfx);sb.setAttribute('aria-pressed',sfx?'true':'false');}
    if(mb){mb.textContent=music?'♫ Música: Ligada':'♫ Música: Mutada';mb.classList.toggle('audio-muted',!music);mb.setAttribute('aria-pressed',music?'true':'false');}
  }
  async function toggleVoiceSfx(){if(window.TronoAudio?.toggleSfx)window.TronoAudio.toggleSfx();else storage.setItem('tronoSfxEnabled',storage.getItem('tronoSfxEnabled')==='0'?'1':'0');updateAudioPreferenceButtons();}
  async function toggleVoiceMusic(){if(window.TronoAudio?.toggleMusic)await window.TronoAudio.toggleMusic();else storage.setItem('tronoMusicEnabled',storage.getItem('tronoMusicEnabled')==='0'?'1':'0');updateAudioPreferenceButtons();}
  function updateVoiceMusicUI(){
    const select=$('voiceMusicTrackSelect'),tracks=window.TRONO_MUSIC_TRACKS||{};
    if(select){select.innerHTML=Object.entries(tracks).map(([id,t])=>`<option value="${esc(id)}">${esc(t.label)} • ${esc(t.artist)}</option>`).join('');select.value=window.TronoAudio?.currentTrack||storage.getItem('tronoMusicTrack')||'lofi';}
    const volume=window.TronoAudio?.musicVolume??32;if($('voiceMusicVolume'))$('voiceMusicVolume').value=String(volume);if($('voiceMusicVolumeValue'))$('voiceMusicVolumeValue').textContent=`${volume}%`;
  }
  function updateQualityUI(){
    const select=$('transmissionQualitySelect'),hint=$('qualityHint');
    if(select){
      select.value=transmissionQuality;
      const p=realtimeStatus;
      for(const opt of select.options){
        if(mediaTransport!=='sfu'||!p){opt.disabled=false;continue;}
        if(opt.value==='high')opt.disabled=!p.highAllowed;
        else opt.disabled=false;
      }
    }
    if(hint){
      const q=qualityProfile(),cap=cappedQuality();
      const why=cap!==transmissionQuality?' • Freio de uso ativo: qualidade reduzida automaticamente.' : '';
      hint.textContent=`${q.screen.height}p / ${q.screen.fps} FPS · Bitrate máximo: ${q.screenBitrate/1000000} Mbps.${why} A taxa real depende da rede e do conteúdo.`;
    }
    if($('screenBitrateSelect')){$('screenBitrateSelect').value=String(screenBitrateMbps);for(const o of $('screenBitrateSelect').options)o.disabled=transportIsSfu()&&realtimeStatus?.highAllowed===false&&Number(o.value)>6;}
    if($('screenContentSelect'))$('screenContentSelect').value=screenContent;
    if($('screenFormatSelect'))$('screenFormatSelect').value=screenFormat;
    if($('shareStreamAudio'))$('shareStreamAudio').checked=shareStreamAudio;
    updateRealtimeUI();
  }
  function updateRealtimeUI(){
    const card=$('realtimeInfraCard'),mode=$('realtimeModeLabel'),usage=$('realtimeUsageLabel'),bar=$('realtimeUsageBar'),policy=$('realtimePolicyLabel');if(!card)return;
    const r=realtimeStatus;
    const modeState=voiceJoined?announcedTransport():mediaTransport;
    card.classList.toggle('realtime-live',modeState==='sfu');
    card.classList.toggle('realtime-warning',!!r?.softWarning);
    card.classList.toggle('realtime-blocked',!!r?.hardBlocked);
    if(mode){
      if(!inChatHub())mode.textContent='WebRTC P2P (partida)';
      else if(modeState==='sfu')mode.textContent='Cloudflare SFU';
      else if(modeState==='sfu-pending')mode.textContent='Conectando ao SFU…';
      else if(!voiceJoined&&r?.enabled&&r?.configured&&!r?.hardBlocked)mode.textContent='Cloudflare SFU pronto';
      else mode.textContent='WebRTC P2P (fallback)';
    }
    if(usage)usage.textContent=r?`${Number(r.estimatedGb||0).toFixed(2)} / ${Number(r.thresholds?.hard||950).toFixed(0)} GB estimados • margem ${Number(r.estimateSafetyFactor||1).toFixed(1)}×`:(realtimeSyncError||'Aguardando dados do backend');
    if(bar){const hard=Number(r?.thresholds?.hard||950),v=Math.min(100,Math.max(0,Number(r?.estimatedGb||0)/hard*100));bar.style.setProperty('--realtime-progress',`${v}%`);bar.setAttribute('aria-valuenow',String(Math.round(v)));}
    if(policy){
      if(!r)policy.textContent=realtimeSyncError?'Não foi possível sincronizar o freio de consumo. O SFU não será assumido como disponível até nova confirmação.':'Freio de consumo aguardando sincronização.';
      else if(!r.configured)policy.textContent='SFU não configurado no backend.';
      else if(!r.enabled)policy.textContent='Kill switch desligado: mídia permanece em P2P.';
      else if(r.hardBlocked)policy.textContent='Limite de segurança atingido: SFU bloqueado.';
      else if(!r.screenAllowed)policy.textContent='Economia crítica: compartilhamento de tela bloqueado.';
      else if(!r.highAllowed)policy.textContent='Economia automática: máximo Equilibrada.';
      else policy.textContent='Proteção ativa • tela até 1080p/60 permitida.';
    }
    updateTelemetryHeader();
  }
  async function syncRealtimeStatus({quiet=true}={}){
    if(!window.TronoNetwork?.connected){updateRealtimeUI();return null;}
    try{
      const status=await window.TronoNetwork.getRealtimeStatus();
      realtimeSyncError='';
      await applyRealtimeStatus(status);
      return status;
    }catch(err){
      console.warn('[TronoSocial] status Realtime',err?.code||err);
      realtimeSyncError='Falha ao sincronizar com o backend';
      updateRealtimeUI();
      if(!quiet)setStatus('Não foi possível sincronizar o status do Cloudflare Realtime; mantendo P2P por segurança.','warn');
      return null;
    }
  }
  function startRealtimeStatusSync(){
    if(realtimeSyncTimer)clearInterval(realtimeSyncTimer);
    void syncRealtimeStatus({quiet:true});
    realtimeSyncTimer=setInterval(()=>{if(document.visibilityState!=='hidden'&&window.TronoNetwork?.connected)void syncRealtimeStatus({quiet:true});},15000);
  }

  function cameraMediaConstraints(){const q=qualityProfile().camera;const video={width:{ideal:q.width},height:{ideal:q.height},frameRate:{ideal:q.fps,max:q.fps}};if(selectedCamera)video.deviceId={exact:selectedCamera};return video;}
  function cameraFallbackAttempts(){
    const q=qualityProfile().camera,base={width:{ideal:q.width},height:{ideal:q.height},frameRate:{ideal:Math.min(q.fps,30)}};
    // Retain the selected input when relaxing quality; never silently switch cameras.
    return selectedCamera?[{...base,deviceId:{exact:selectedCamera}},{deviceId:{exact:selectedCamera}}]:[{...base,facingMode:{ideal:'user'}},true];
  }
  function cameraErrorCanFallback(err){return ['OverconstrainedError','NotFoundError','NotReadableError','AbortError','TypeError'].includes(err?.name)||['OVERCONSTRAINED','DEVICE_NOT_FOUND'].includes(err?.code);}
  async function openCameraStream(){
    let last=null;for(const video of cameraFallbackAttempts()){
      try{return await navigator.mediaDevices.getUserMedia({audio:false,video});}
      catch(err){last=err;if(err?.name==='NotAllowedError'||err?.name==='SecurityError')throw err;if(!cameraErrorCanFallback(err))throw err;}
    }
    if(selectedCamera&&['NotFoundError','OverconstrainedError'].includes(last?.name)){
      const devices=await navigator.mediaDevices.enumerateDevices();
      if(!devices.some(d=>d.kind==='videoinput'&&d.deviceId===selectedCamera)){
        selectedCamera='';storage.removeItem('tronoCameraInput');return navigator.mediaDevices.getUserMedia({audio:false,video:true});
      }
    }
    throw last||new Error('Não foi possível iniciar a câmera.');
  }
  function cameraErrorMessage(err){
    if(err?.name==='NotAllowedError'||err?.name==='SecurityError')return 'Permita o acesso à câmera nas configurações deste site no navegador.';
    if(err?.name==='NotReadableError'||err?.name==='AbortError')return 'A câmera está ocupada ou não iniciou. Feche outros aplicativos que usam a câmera e escolha a entrada em Configurações → Vídeo.';
    if(err?.name==='NotFoundError')return 'Nenhuma câmera disponível. Conecte uma câmera e escolha a entrada em Configurações → Vídeo.';
    if(err?.name==='OverconstrainedError')return 'Esta câmera não aceitou a captura. Escolha outra entrada em Configurações → Vídeo.';
    return err?.message||'Não foi possível abrir a câmera.';
  }
  // getDisplayMedia rejects min/exact/max capture constraints; apply the ceiling after capture.
  function screenMediaConstraints(){const q=qualityProfile().screen,r=window.TronoClips?.captureProfile?.();return {width:{ideal:Math.max(q.width,r?.width||0)},height:{ideal:Math.max(q.height,r?.height||0)},frameRate:{ideal:Math.max(q.fps,r?.fps||0)}};}
  async function optimizeScreenTrack(track){
    if(!track)return;
    try{if('contentHint' in track)track.contentHint=screenContent;}catch{}
    // Constraints on cloned capture tracks can affect their shared source.
    // Downscale the outgoing encoder instead, preserving the local replay.
  }
  function waitPeerConnected(pc,timeout=10000){
    if(!pc)return Promise.reject(new Error('PeerConnection ausente.'));
    if(pc.connectionState==='connected'||pc.iceConnectionState==='connected'||pc.iceConnectionState==='completed')return Promise.resolve();
    return new Promise((resolve,reject)=>{let done=false;const finish=(ok)=>{if(done)return;done=true;clearTimeout(timer);pc.removeEventListener('connectionstatechange',check);pc.removeEventListener('iceconnectionstatechange',check);ok?resolve():reject(Object.assign(new Error('Tempo esgotado ao conectar mídia ao SFU.'),{code:'SFU_CONNECT_TIMEOUT'}));};const check=()=>{if(pc.connectionState==='connected'||pc.iceConnectionState==='connected'||pc.iceConnectionState==='completed')finish(true);else if(pc.connectionState==='failed'||pc.iceConnectionState==='failed')finish(false);};const timer=setTimeout(()=>finish(false),timeout);pc.addEventListener('connectionstatechange',check);pc.addEventListener('iceconnectionstatechange',check);check();});
  }
  async function refreshSfuIceConfig(){
    const generation=voiceGeneration;
    try{const r=await window.TronoNetwork?.requestSfu('ice-config',{},8000);if(generation!==voiceGeneration)return;if(Array.isArray(r?.iceServers)&&r.iceServers.length){sfuIceConfig={iceServers:r.iceServers,iceTransportPolicy:'all'};sfuTurnActive=!!r.turn;return;}}catch(err){if(generation!==voiceGeneration)return;console.warn('[TronoSocial] ICE/TURN',err?.code||err);}
    sfuIceConfig={iceServers:[{urls:['stun:stun.cloudflare.com:3478']}],iceTransportPolicy:'all'};sfuTurnActive=false;
  }
  function applySenderQuality(sender,kind){
    if(!sender)return Promise.resolve();
    const next=(senderQualityQueues.get(sender)||Promise.resolve()).catch(()=>{}).then(()=>applySenderQualityNow(sender,kind));
    senderQualityQueues.set(sender,next);return next;
  }
  async function applySenderQualityNow(sender,kind){
    if(!sender?.track||!sender.setParameters)return;
    try{
      const p=sender.getParameters()||{};if(!p.encodings?.length)p.encodings=[{}];const q=qualityProfile();
      if(kind==='audio'||kind==='screen-audio'){
        p.encodings[0].maxBitrate=kind==='screen-audio'?192000:q.audioBitrate;
      }else if(kind==='screen'){
        p.degradationPreference='maintain-resolution';
        sender.track.contentHint=screenContent;
        const source=sender.track.getSettings?.()||{};
        const scale=Math.max(1,(source.width||q.screen.width)/q.screen.width,(source.height||q.screen.height)/q.screen.height);
        const byRid={f:q.screenBitrate,h:Math.max(500000,Math.round(q.screenBitrate*.42)),q:Math.max(250000,Math.round(q.screenBitrate*.18))};
        for(const e of p.encodings){e.scaleResolutionDownBy=scale*(e.rid==='h'?2:e.rid==='q'?4:1);e.maxBitrate=byRid[e.rid]||q.screenBitrate;e.maxFramerate=e.rid==='q'?Math.min(q.screen.fps,20):e.rid==='h'?Math.min(q.screen.fps,30):q.screen.fps;}
      }else if(p.encodings.length>=3&&p.encodings.some(e=>e.rid)){
        const byRid={f:q.videoBitrate,h:Math.max(180000,Math.round(q.videoBitrate*.42)),q:Math.max(90000,Math.round(q.videoBitrate*.16))};
        for(const e of p.encodings){e.maxBitrate=byRid[e.rid]||q.videoBitrate;e.maxFramerate=q.camera.fps;}
      }else{
        p.encodings[0].maxBitrate=q.videoBitrate;p.encodings[0].maxFramerate=q.camera.fps;
      }
      await sender.setParameters(p);
    }catch(err){console.warn('[TronoSocial] parâmetros de qualidade',kind,err);}
  }
  async function applyQualityToLiveMedia(){
    const q=qualityProfile();try{const cam=localStream?.getVideoTracks?.()[0];if(cam&&cameraOn)await cam.applyConstraints({width:{ideal:q.camera.width},height:{ideal:q.camera.height},frameRate:{ideal:q.camera.fps,max:q.camera.fps}});}catch(err){console.warn('[TronoSocial] qualidade câmera',err);}
    try{const scr=localScreenStream?.getVideoTracks?.()[0];if(scr&&screenSharing)await optimizeScreenTrack(scr);}catch(err){console.warn('[TronoSocial] qualidade tela',err);}
    const jobs=[];for(const pc of peers.values()){jobs.push(applySenderQuality(pc._tronoAudioSender,'audio'),applySenderQuality(pc._tronoVideoSender,'camera'),applySenderQuality(pc._tronoScreenSender,'screen'),applySenderQuality(pc._tronoScreenAudioSender,'screen-audio'));}
    for(const pub of sfuLocalPublications.values())jobs.push(applySenderQuality(pub.sender,pub.kind));
    await Promise.allSettled(jobs);
    if(transportIsSfu())await updateAllSfuSubscriptionLayers();
  }
  async function changeTransmissionQuality(e){
    let requested=e?.target?.value||transmissionQuality;if(!QUALITY_PROFILES[requested])requested='balanced';
    if(mediaTransport==='sfu'&&realtimeStatus?.maxQuality&&QUALITY_ORDER.indexOf(requested)>QUALITY_ORDER.indexOf(realtimeStatus.maxQuality)){
      requested=realtimeStatus.maxQuality;setStatus(`Freio de consumo: qualidade limitada a ${QUALITY_PROFILES[requested].label}.`,'warn');
    }
    transmissionQuality=requested;storage.setItem('tronoTransmissionQuality',transmissionQuality);updateQualityUI();await applyQualityToLiveMedia();
    window.TronoNetwork?.setVoiceState(voiceJoined,micMuted,cameraOn,screenSharing,transmissionQuality,announcedTransport());
    setStatus(`Qualidade ${qualityProfile().label.toLowerCase()} aplicada.`,'ok');
  }
  function preferredRidForMedia(kind,maximized=false){
    if(maximized)return 'f';
    return kind==='screen'&&cappedQuality()!=='economy'?'f':preferredRidForQuality();
  }
  async function setSfuTileLayer(tile,maximized){
    if(!transportIsSfu()||!tile)return;
    const kind=tile.classList.contains('screen-share-tile')?'screen':tile.classList.contains('camera-tile')?'camera':null;if(!kind)return;
    const peerId=tile.dataset.peer;if(!peerId||peerId===meId())return;
    const sub=sfuSubscriptions.get(sfuKey(peerId,kind));if(!sub)return;
    const requested=preferredRidForMedia(kind,maximized);
    if(sub.preferredRid===requested)return;
    try{const result=await window.TronoNetwork?.requestSfu('update-subscription',{sessionId:sub.sessionId,preferredRid:requested},9000);sub.preferredRid=result?.preferredRid||requested;}catch(err){console.warn('[TronoSocial] qualidade ao maximizar',kind,err.code||err);}
  }
  async function toggleMediaFullscreen(tile){
    if(!tile)return;const video=tile.querySelector('video'),wasMax=tile.classList.contains('media-maximized')||document.fullscreenElement===tile;
    window.TronoMosaic?.close();
    if(!wasMax&&tile.classList.contains('screen-share-tile')){
      if(tile.dataset.peer===meId()){localScreenCollapsed=false;localScreenPreviewPaused=false;}else tile.dataset.collapsed='0';
      renderScreenGrid();
    }
    if(wasMax&&!document.fullscreenElement){tile.classList.remove('media-maximized');document.body.classList.remove('media-focus-open');await setSfuTileLayer(tile,false);return;}
    const old=document.querySelector('.media-maximized');if(old){old.classList.remove('media-maximized');document.body.classList.remove('media-focus-open');void setSfuTileLayer(old,false);}
    try{
      if(document.fullscreenElement){await document.exitFullscreen();await setSfuTileLayer(tile,false);return;}
      if(tile.requestFullscreen){await tile.requestFullscreen();await setSfuTileLayer(tile,true);return;}
      if(video?.webkitEnterFullscreen){video.webkitEnterFullscreen();await setSfuTileLayer(tile,true);return;}
    }catch(err){console.warn('[TronoSocial] tela cheia',err);}
    tile.classList.add('media-maximized');document.body.classList.add('media-focus-open');await setSfuTileLayer(tile,true);
  }
  function fullscreenMedia(peerId,kind='screen'){
    const tiles=document.querySelectorAll(kind==='camera'?'#socialPanel .camera-tile':'#screenShareGrid .screen-share-tile');
    const tile=[...tiles].find(t=>t.dataset.peer===peerId);
    if(tile)return toggleMediaFullscreen(tile);
  }
  function bindMediaFullscreen(tile){if(!tile||tile.dataset.fullscreenBound)return;tile.dataset.fullscreenBound='1';tile.querySelector('.media-fullscreen-btn')?.addEventListener('click',e=>{e.stopPropagation();toggleMediaFullscreen(tile);});tile.querySelector('video')?.addEventListener('dblclick',()=>toggleMediaFullscreen(tile));}
  const FLOATING_RECT_KEY='tronoSocialFloatingRectV2';
  function readFloatingRect(){try{return JSON.parse(storage.getItem(FLOATING_RECT_KEY)||'null');}catch{return null;}}
  function persistFloatingRect(){const panel=$('socialPanel');if(!panel||panelMode!=='floating'||inChatHub())return;const r=panel.getBoundingClientRect();storage.setItem(FLOATING_RECT_KEY,JSON.stringify({left:Math.round(r.left),top:Math.round(r.top),width:Math.round(r.width),height:Math.round(r.height)}));}
  function clearFloatingInlineStyles(){const panel=$('socialPanel');if(!panel)return;for(const k of ['left','top','right','bottom','width','height'])panel.style[k]='';}
  function restoreFloatingRect(){
    const panel=$('socialPanel');if(!panel||panelMode!=='floating'||inChatHub()||innerWidth<=760)return;
    const saved=readFloatingRect();if(!saved)return;
    const width=Math.max(330,Math.min(Number(saved.width)||330,innerWidth-10)),height=Math.max(330,Math.min(Number(saved.height)||360,innerHeight-10));
    const left=Math.max(0,Math.min(Number(saved.left)||0,innerWidth-width)),top=Math.max(0,Math.min(Number(saved.top)||0,innerHeight-height));
    panel.style.width=`${width}px`;panel.style.height=`${height}px`;panel.style.left=`${left}px`;panel.style.top=`${top}px`;panel.style.right='auto';panel.style.bottom='auto';
  }

  function applyPanelMode(){
    const panel=$('socialPanel'),modeBtn=$('socialModeBtn');if(!panel)return;
    const hub=inChatHub();
    panel.classList.toggle('social-chat-hub',hub);
    panel.classList.toggle('social-full',!hub&&panelMode==='full');
    panel.classList.toggle('social-floating',!hub&&panelMode==='floating');
    if(modeBtn){
      modeBtn.classList.toggle('hidden',hub);
      modeBtn.textContent=panelMode==='full'?'▱ Flutuante':'▣ Completa';
      modeBtn.title=panelMode==='full'?'Usar janela flutuante compacta':'Abrir janela completa';
    }
    clearFloatingInlineStyles();if(!hub&&panelMode==='floating')restoreFloatingRect();
    storage.setItem('tronoSocialMode',panelMode);
    renderVideoGrid();renderScreenGrid();renderSeatMedia();
  }
  function clearChannelChat(){chatHistoryBefore=null;$('olderChatMessages')?.classList.add('hidden');const host=$('courtChatMessages');if(host)host.replaceChildren();setUnreadCount(0);toggleTextChat(false);}
  function setChatHubMode(active){
    chatHubMode=!!active;
    if(!chatHubMode)document.body.classList.remove('channel-text-active','channel-voice-active');
    document.body.classList.toggle('chat-only-active',chatHubMode);
    if(chatHubMode)chatDrawerOpen=innerWidth>1000;
    applyPanelMode();updateChatDrawerUI();updateButtons();updateTelemetryHeader();
    if(chatHubMode)showPanel(true);
  }
  function togglePanelMode(){if(inChatHub())return;panelMode=panelMode==='full'?'floating':'full';applyPanelMode();}
  function showPanel(show=true){
    panelOpen=!!show;
    const panel=$('socialPanel');panel?.classList.toggle('social-hidden',!panelOpen);
    $('socialBtn')?.classList.toggle('music-active',panelOpen);
    $('roomSocialBtn')?.classList.toggle('ready-active',panelOpen);
    $('chatOnlyOpenSocialBtn')?.classList.toggle('hidden',panelOpen);
    const canDock=!panelOpen&&!inChatHub()&&panel&&!panel.classList.contains('hidden');$('socialMiniDock')?.classList.toggle('hidden',!canDock);
    if(panelOpen&&!inChatHub())markRead();
    renderSeatMedia();
  }
  function showForRoom(show=true){
    $('socialPanel')?.classList.toggle('hidden',!show);
    if(show)showPanel(true); else {showPanel(false);toggleVoiceSettings(false);}
  }

  function markRead(){setUnreadCount(0);}
  function bumpUnread(){const visible=inChatHub()?chatDrawerOpen:panelOpen;if(visible||chatMuted)return;setUnreadCount(chatUnreadCount+1);}
  function updatePublicPresence(){
    const active=publicVoiceActive(),roomBtn=$('roomSocialBtn'),topBtn=$('socialBtn');
    if(roomBtn)roomBtn.innerHTML=active?'💬 Comunicação <span class="call-presence">🎙 Em call</span>':'💬 Comunicação';
    if(topBtn){
      const unread=chatUnreadCount;
      topBtn.innerHTML=`💬 Chat${active?' <span class="call-presence">🎙 Em call</span>':''} <span id="chatUnread" class="chat-unread ${unread?'':'hidden'}">${esc(unread)}</span>`;
    }
  }

  let chatHistoryBefore=null;
  function appendChat(m,{silent=false}={}){
    const box=$('courtChatMessages');if(!box||!m)return;
    if(m.id&&[...box.children].some(row=>row.dataset.messageId===m.id))return;
    const mine=m.accountId?m.accountId===window.TronoAuth?.user?.id:m.senderId===meId(),row=document.createElement('div');row.dataset.messageId=m.id||'';row.className=`court-chat-msg ${mine?'mine':''}`;
    const t=new Date(m.ts||Date.now()).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
    row.innerHTML=`<div><span class="chat-author-icon">${window.TronoProfile?.avatarHtml(m)||'👤'}</span><strong>${esc(m.name||'Jogador')}</strong><time>${t}</time></div><p>${esc(m.text||'')}</p>`;
    if(m.attachment){const host=document.createElement('div');host.className='chat-attachment';row.appendChild(host);window.TronoFiles?.renderAttachment(host,m.attachment);}
    window.TronoProfile?.hydrate(row);box.appendChild(row);box.scrollTop=box.scrollHeight;if(!mine&&!silent){bumpUnread();if(!chatMuted)playCallSound('message','text');}
  }
  function loadHistory(messages=[],meta={}){
    const box=$('courtChatMessages');if(!box)return;
    const height=box.scrollHeight,top=box.scrollTop,existing=meta.older?[...box.children]:[];
    box.replaceChildren();messages.forEach(m=>appendChat(m,{silent:true}));
    for(const row of existing)if(![...box.children].some(item=>item.dataset.messageId===row.dataset.messageId))box.appendChild(row);
    if(meta.older)box.scrollTop=top+box.scrollHeight-height;
    chatHistoryBefore=meta.before||null;const button=$('olderChatMessages');if(button){button.disabled=false;button.classList.toggle('hidden',!meta.hasMore);}
    markRead();
  }
  function toggleTextMute(){chatMuted=!chatMuted;storage.setItem('tronoChatMuted',chatMuted?'1':'0');const b=$('muteTextBtn');if(b){b.textContent=chatMuted?'Ativar chat':'Silenciar chat';b.classList.toggle('danger-active',chatMuted);}if(chatMuted)markRead();}
  let pendingChatFile=null,chatUploadController=null;
  function attachmentStatus(text='',cancel=false){const host=$('attachmentStatus');if(!host)return;host.replaceChildren(document.createTextNode(text));if(cancel){const btn=document.createElement('button');btn.type='button';btn.textContent='× Cancelar';btn.onclick=()=>{chatUploadController?.abort();pendingChatFile=null;$('chatFileInput').value='';attachmentStatus();};host.appendChild(btn);}}
  async function sendChat(){
    const input=$('courtChatInput');if(!input||chatUploadController)return;const text=input.value.trim(),file=pendingChatFile,roomId=window.TronoNetwork?.currentRoom;if(!text&&!file)return;
    if(!file){if(window.TronoNetwork?.sendChat(text)){attachmentStatus();input.value='';input.focus();}else attachmentStatus('Conexão interrompida. Aguarde a reconexão para enviar.');return;}
    chatUploadController=new AbortController();$('courtChatSend').disabled=true;$('attachFileBtn').disabled=true;input.disabled=true;let uploaded;
    try{uploaded=await window.TronoFiles.upload(file,{roomId,signal:chatUploadController.signal,onProgress:n=>attachmentStatus(`Enviando ${file.name}: ${n}%`,true)});if(roomId!==window.TronoNetwork.currentRoom)throw new Error('O canal mudou durante o envio.');if(!window.TronoNetwork.sendChat(text,uploaded.id))throw new Error('Conexão interrompida. Tente novamente.');pendingChatFile=null;$('chatFileInput').value='';input.value='';attachmentStatus('Arquivo enviado.');}
    catch(e){if(uploaded)await window.TronoFiles.remove(uploaded.id).catch(()=>{});attachmentStatus(e.message);}
    finally{chatUploadController=null;$('courtChatSend').disabled=false;$('attachFileBtn').disabled=false;input.disabled=false;input.focus();}
  }

  async function toggleWatchCamera(id){
    if(!voiceJoined||id===meId()||!privateVoiceRoster.get(id)?.camera)return;
    const hidden=!hiddenCameras.has(id);if(hidden)hiddenCameras.add(id);else hiddenCameras.delete(id);
    for(const track of remoteAvStreamFor(id).getVideoTracks())track.enabled=!hidden;
    const key=sfuKey(id,'camera');clearSfuRetry(key);
    if(hidden){
      const full=document.fullscreenElement;if(full?.classList.contains('camera-tile')&&full.dataset.peer===id)await document.exitFullscreen().catch(()=>{});
      for(const tile of document.querySelectorAll('#socialPanel .camera-tile'))if(tile.dataset.peer===id){tile.classList.remove('media-maximized');const video=tile.querySelector('video');video.pause();video.srcObject=null;}
      if(!document.querySelector('.media-maximized'))document.body.classList.remove('media-focus-open');
      if(transportIsSfu())void closeSfuSubscription(key);
    }
    if(transportIsSfu())void syncSfuSubscriptions();
    renderVoiceRoster();renderVideoGrid();renderSeatMedia();window.dispatchEvent(new CustomEvent('trono-media-change'));
  }

  async function enumerateDevices(){
    const input=$('voiceInputSelect'),output=$('voiceOutputSelect'),camera=$('cameraInputSelect');if(!input||!output||!camera)return;
    try{
      const devices=await navigator.mediaDevices.enumerateDevices();
      const ins=devices.filter(d=>d.kind==='audioinput'),outs=devices.filter(d=>d.kind==='audiooutput'),cams=devices.filter(d=>d.kind==='videoinput');
      input.innerHTML='<option value="">Microfone padrão</option>'+ins.filter(d=>d.deviceId).map((d,i)=>`<option value="${esc(d.deviceId)}">${esc(d.label||`Microfone ${i+1}`)}</option>`).join('');
      output.innerHTML='<option value="">Saída padrão</option>'+outs.filter(d=>d.deviceId).map((d,i)=>`<option value="${esc(d.deviceId)}">${esc(d.label||`Saída ${i+1}`)}</option>`).join('');
      camera.innerHTML='<option value="">Câmera padrão</option>'+cams.filter(d=>d.deviceId).map((d,i)=>`<option value="${esc(d.deviceId)}">${esc(d.label||`Câmera ${i+1}`)}</option>`).join('');
      if(ins.some(d=>d.deviceId===selectedInput))input.value=selectedInput;else selectedInput=input.value||'';
      if(outs.some(d=>d.deviceId===selectedOutput))output.value=selectedOutput;else selectedOutput=output.value||'';
      if(cams.some(d=>d.deviceId===selectedCamera))camera.value=selectedCamera;
      else if(cams.some(d=>d.deviceId)){selectedCamera='';camera.value='';storage.removeItem('tronoCameraInput');}
      if(!('setSinkId' in HTMLMediaElement.prototype)){output.disabled=true;output.title='Este navegador não permite escolher a saída de áudio pelo site.';}
      updateNoiseButton();
    }catch(err){console.warn('[TronoSocial] dispositivos',err);}
  }

  function buildAudioConstraints({nativeOnly=false}={}){
    const support=supportedMedia(),audio={};
    if(support.echoCancellation)audio.echoCancellation=true;
    if(support.noiseSuppression)audio.noiseSuppression=!!noiseSuppression&&(nativeOnly||!window.TronoNoise?.supported(ensureMediaAudioContext()));
    if(support.autoGainControl)audio.autoGainControl=false;
    if(support.channelCount)audio.channelCount={ideal:1};
    if(support.sampleRate)audio.sampleRate={ideal:48000};
    if(selectedInput)audio.deviceId={exact:selectedInput};
    return audio;
  }

  async function enableNativeSuppression(rawStream){
    const track=rawStream.getAudioTracks()[0];
    if(supportedMedia().noiseSuppression)try{await track.applyConstraints({noiseSuppression:true,autoGainControl:false});}catch{}
    return track?.getSettings?.().noiseSuppression===true;
  }
  async function createIntegratedNoiseProcessor(rawStream,{enabled=noiseSuppression,nativeOnly=false}={}){
    const ctx=ensureMediaAudioContext();if(!ctx)return null;
    // Never transmit a silent destination when the audio context is suspended.
    if(ctx.state!=='running'){void ctx.resume().catch(()=>{});return null;}
    const source=ctx.createMediaStreamSource(rawStream),gainNode=ctx.createGain(),outputLimiter=ctx.createDynamicsCompressor(),destination=ctx.createMediaStreamDestination();
    gainNode.gain.value=microphoneVolume/100;
    outputLimiter.threshold.value=-3;outputLimiter.knee.value=0;outputLimiter.ratio.value=16;outputLimiter.attack.value=.003;outputLimiter.release.value=.08;
    gainNode.connect(outputLimiter);outputLimiter.connect(destination);
    let denoiser=null,stopped=false;
    const processor={ctx,source,gainNode,outputLimiter,destination,track:destination.stream.getAudioTracks()[0],mode:'gain-only',
      stop(){if(stopped)return;stopped=true;denoiser?.destroy();for(const node of [source,gainNode,outputLimiter])try{node.disconnect();}catch{}processor.track?.stop();}
    };
    const fallback=async()=>{
      if(stopped)return;try{source.disconnect();}catch{}denoiser?.destroy();denoiser=null;
      source.connect(gainNode);processor.mode='unavailable';
      const native=await enableNativeSuppression(rawStream);if(stopped)return;processor.mode=native?'native':'unavailable';updateNoiseButton();
      // Some browsers only change native suppression when acquiring a new input.
      if(!native&&voiceJoined&&micCapture?.processor===processor)void acquireMic({nativeOnly:true}).catch(err=>{if(err?.code!=='VOICE_CANCELLED')setStatus('Microfone ativo, mas a redução nativa não iniciou.','warn');});
    };
    if(!enabled||nativeOnly){source.connect(gainNode);if(enabled)processor.mode=rawStream.getAudioTracks()[0]?.getSettings?.().noiseSuppression===true?'native':'unavailable';return processor;}
    try{
      denoiser=await window.TronoNoise.create(ctx,{onFailure:()=>void fallback()});
      source.connect(denoiser.node);denoiser.node.connect(gainNode);processor.mode='rnnoise';
    }catch(err){console.warn('[TronoSocial] RNNoise indisponível; verificando redução nativa.',err);await fallback();}
    return processor;
  }

  function cleanupMicCapture(capture){
    if(!capture)return;
    try{capture.processor?.stop?.();}catch{}
    try{capture.rawStream?.getTracks?.().forEach(t=>t.stop());}catch{}
  }
  async function refreshMicPipeline(){
    updateNoiseButton();
    if(!micCapture||!voiceJoined)return;
    const track=micCapture.processor&&mediaAudioContext?.state==='running'?micCapture.processor.track:micCapture.rawStream.getAudioTracks()[0];
    if(!track||track.readyState!=='live'||track===micCapture.outgoingTrack)return;
    if(track===micCapture.processor?.track)micCapture.rawStream.getAudioTracks()[0].enabled=!micMuted;
    track.enabled=!micMuted;const stream=ensureLocalStream();for(const old of stream.getAudioTracks())stream.removeTrack(old);stream.addTrack(track);micCapture.outgoingTrack=track;
    for(const pc of peers.values())await syncInitiatorTracks(pc);
    const pub=sfuLocalPublications.get('audio');if(pub?.sender)await pub.sender.replaceTrack(track);
    void watchStream(meId(),stream);
  }

  async function acquireMic({generation=voiceGeneration,nativeOnly=voiceLightMode||(window.TronoDesktop&&noiseEngine==='native')}={}){
    if(!navigator.mediaDevices?.getUserMedia)throw new Error('Seu navegador não oferece acesso ao microfone nesta página. Use HTTPS em navegador atualizado.');
    const request=++micGeneration,enabled=noiseSuppression,current=()=>generation===voiceGeneration&&request===micGeneration;
    noiseLoading=true;updateNoiseButton();
    let rawStream=null,processor=null,installed=false;
    try{
    rawStream=await navigator.mediaDevices.getUserMedia({audio:buildAudioConstraints({nativeOnly}),video:false});
    if(!current()){cleanupMicCapture({rawStream});throw Object.assign(new Error('Entrada na chamada cancelada.'),{code:'VOICE_CANCELLED'});}
    let outgoingTrack=rawStream.getAudioTracks()[0];
    try{processor=await createIntegratedNoiseProcessor(rawStream,{enabled,nativeOnly});if(processor?.track)outgoingTrack=processor.track;}catch(err){console.warn('[TronoSocial] processador de áudio',err);}
    if(!current()){cleanupMicCapture({rawStream,processor});throw Object.assign(new Error('Entrada na chamada cancelada.'),{code:'VOICE_CANCELLED'});}
    if(enabled&&!processor)await enableNativeSuppression(rawStream);
    if(enabled&&!nativeOnly&&processor?.mode!=='rnnoise'&&rawStream.getAudioTracks()[0]?.getSettings?.().noiseSuppression!==true&&supportedMedia().noiseSuppression&&current()){
      cleanupMicCapture({rawStream,processor});
      rawStream=await navigator.mediaDevices.getUserMedia({audio:buildAudioConstraints({nativeOnly:true}),video:false});
      if(!current()){cleanupMicCapture({rawStream});throw Object.assign(new Error('Entrada na chamada cancelada.'),{code:'VOICE_CANCELLED'});}
      processor=await createIntegratedNoiseProcessor(rawStream,{enabled,nativeOnly:true});outgoingTrack=processor?.track||rawStream.getAudioTracks()[0];
    }
    if(!current()){cleanupMicCapture({rawStream,processor});throw Object.assign(new Error('Entrada na chamada cancelada.'),{code:'VOICE_CANCELLED'});}
    if(!outgoingTrack){cleanupMicCapture({rawStream,processor});throw new Error('Nenhuma trilha de microfone foi recebida.');}
    outgoingTrack.enabled=!micMuted;
    const stream=ensureLocalStream(),oldCapture=micCapture;
    for(const old of stream.getAudioTracks())stream.removeTrack(old);
    stream.addTrack(outgoingTrack);
    micCapture={rawStream,processor,outgoingTrack};applyMicrophoneMute();installed=true;
    for(const [id,pc] of [...peers])if(pc._tronoAudioSender){try{await syncInitiatorTracks(pc);}catch(err){console.warn('[TronoSocial] reconectando novo microfone',err);closePeer(id);ensurePeer(id);}}
    const sfuAudio=sfuLocalPublications.get('audio');if(sfuAudio?.sender){try{await sfuAudio.sender.replaceTrack(outgoingTrack);await applySenderQuality(sfuAudio.sender,'audio');}catch(err){try{await publishSfuTrack('audio',outgoingTrack);}catch{await fallbackToP2p('Microfone alterado. Reconectando a chamada por P2P.');}}}
    cleanupMicCapture(oldCapture);
    await enumerateDevices();return stream;
    }finally{if(!installed)cleanupMicCapture({rawStream,processor});if(request===micGeneration){noiseLoading=false;updateNoiseButton();}}
  }

  async function acquireCamera(){
    if(cameraRequest)return cameraRequest;
    if(!navigator.mediaDevices?.getUserMedia)throw new Error('Seu navegador não oferece acesso à câmera nesta página.');
    const generation=++cameraGeneration,callGeneration=voiceGeneration;
    const current=()=>voiceJoined&&generation===cameraGeneration&&callGeneration===voiceGeneration;
    const run=(async()=>{
      // Release the device before reopening it (some webcams allow only one capture).
      cameraOn=false;
      for(const old of localStream?.getVideoTracks()||[]){localStream.removeTrack(old);old.stop();}
      renderVideoGrid();renderSeatMedia();
      const temp=await openCameraStream(),track=temp.getVideoTracks()[0];
      if(!current()){temp.getTracks().forEach(t=>t.stop());throw Object.assign(new Error('Abertura da câmera cancelada.'),{code:'CAMERA_CANCELLED'});}
      const stream=ensureLocalStream();
      if(!track){temp.getTracks().forEach(t=>t.stop());throw new Error('Nenhuma trilha de câmera foi recebida.');}
      for(const old of stream.getVideoTracks()){stream.removeTrack(old);old.stop();}
      stream.addTrack(track);cameraOn=true;
      track.addEventListener('ended',()=>{if(current()&&stream.getVideoTracks().includes(track))void disableCamera(true).then(updateButtons);},{once:true});
      if(transportIsSfu()){
        try{
          const existing=sfuLocalPublications.get('camera');
          if(existing?.sender){await existing.sender.replaceTrack(track);await applySenderQuality(existing.sender,'camera');}
          else await publishSfuTrack('camera',track);
        }catch(err){
          console.warn('[TronoSocial] câmera SFU; acionando fallback',err?.code||err);
          await fallbackToP2p('A câmera não conseguiu publicar pelo SFU; chamada mantida em P2P para não interromper o vídeo.');
        }
      }
      if(!transportIsSfu())for(const pc of peers.values())if(pc._tronoVideoSender){await pc._tronoVideoSender.replaceTrack(track).catch(()=>{});await applySenderQuality(pc._tronoVideoSender,'camera');}
      if(!current()){track.stop();throw Object.assign(new Error('Abertura da câmera cancelada.'),{code:'CAMERA_CANCELLED'});}
      window.TronoNetwork?.setVoiceState(voiceJoined,micMuted,cameraOn,screenSharing,transmissionQuality,announcedTransport());
      await enumerateDevices();renderVideoGrid();renderSeatMedia();renderVoiceRoster();return track;
    })();
    const tracked=run.catch(async err=>{if(current())await disableCamera(true);throw err;}).finally(()=>{if(cameraRequest===tracked){cameraRequest=null;updateButtons();}});
    cameraRequest=tracked;updateButtons();return tracked;
  }
  async function disableCamera(sendState=true){
    cameraGeneration++;
    cameraOn=false;
    for(const t of localStream?.getVideoTracks?.()||[]){localStream.removeTrack(t);t.stop();}
    if(transportIsSfu())await closeSfuPublication('camera');else for(const pc of peers.values())if(pc._tronoVideoSender)await pc._tronoVideoSender.replaceTrack(null).catch(()=>{});
    if(sendState)window.TronoNetwork?.setVoiceState(voiceJoined,micMuted,false,screenSharing,transmissionQuality,announcedTransport());
    renderVideoGrid();renderSeatMedia();renderVoiceRoster();
  }

  async function startScreenShare({replace=false}={}){
    if(!inChatHub())return false;
    if(screenSharing&&!replace)return true;
    if(!navigator.mediaDevices?.getDisplayMedia){setStatus('Compartilhamento de tela não é suportado neste navegador.','error');return false;}
    if(!voiceJoined){const ok=await joinVoice();if(!ok)return false;}
    if(transportIsSfu()&&realtimeStatus&&!realtimeStatus.screenAllowed){setStatus('Compartilhamento bloqueado pelo freio mensal de consumo.','warn');return false;}
    const previousSource=localDisplayStream,previousStream=localScreenStream;
    const request=++screenGeneration,callGeneration=voiceGeneration;let source,outgoing,committed=false;
    try{
      // A game window must request window audio explicitly; some browsers otherwise
      // offer the entire system mix, including voices played by this call.
      // restrictOwnAudio also requests removal of this page from system capture.
      // These are browser controls, so older implementations may ignore them.
      source=await navigator.mediaDevices.getDisplayMedia({video:screenMediaConstraints(),audio:shareStreamAudio?{echoCancellation:false,noiseSuppression:false,autoGainControl:false,suppressLocalAudioPlayback:false,restrictOwnAudio:true}:false,systemAudio:shareStreamAudio?'include':'exclude',windowAudio:shareStreamAudio?'window':'exclude',selfBrowserSurface:'exclude'});
      if(request!==screenGeneration||callGeneration!==voiceGeneration||!voiceJoined){source.getTracks().forEach(t=>t.stop());return false;}
      // Keep the local source at replay quality. Only the outgoing clones get
      // the call's resolution/FPS ceilings and network bitrate limits.
      outgoing=source.clone();const stream=outgoing,track=stream.getVideoTracks()[0];if(!track)throw new Error('Nenhuma tela foi selecionada.');await optimizeScreenTrack(track);
      if(request!==screenGeneration||callGeneration!==voiceGeneration||!voiceJoined){source.getTracks().forEach(t=>t.stop());outgoing.getTracks().forEach(t=>t.stop());return false;}
      localDisplayStream=source;localScreenStream=stream;screenSharing=true;committed=true;localScreenPreviewPaused=false;localScreenCollapsed=false;
      source.getVideoTracks()[0].addEventListener('ended',()=>{if(localDisplayStream===source)void stopScreenShare(true);},{once:true});
      void window.TronoClips?.sharedStarted?.(source);
      if(transportIsSfu()){
        try{
          // Keep publication IDs and subscriptions when changing an active source.
          // A canceled picker never reaches this point or stops the previous source.
          for(const [kind,next] of [['screen',track],['screen-audio',stream.getAudioTracks()[0]]]){
            const publication=replace?sfuLocalPublications.get(kind):null;
            if(next&&publication?.sender){await publication.sender.replaceTrack(next);await applySenderQuality(publication.sender,kind);}
            else if(next)await publishSfuTrack(kind,next);
            else if(publication)await closeSfuPublication(kind);
          }
        }
        catch(err){console.warn('[TronoSocial] tela SFU; acionando fallback',err?.code||err);await fallbackToP2p('O compartilhamento não conseguiu publicar pelo SFU; chamada mantida em P2P para preservar a tela.');}
      }
      if(!transportIsSfu())for(const pc of peers.values())await syncInitiatorTracks(pc);
      if(request!==screenGeneration||callGeneration!==voiceGeneration||!voiceJoined)return false;
      const sound=stream.getAudioTracks()[0];sound?.addEventListener('ended',async()=>{if(localScreenStream!==stream)return;if(transportIsSfu())await closeSfuPublication('screen-audio');else for(const pc of peers.values())await pc._tronoScreenAudioSender?.replaceTrack(null);renderScreenGrid();},{once:true});
      window.TronoNetwork?.setVoiceState(true,micMuted,cameraOn,true,transmissionQuality,announcedTransport());
      updateButtons();renderScreenGrid();renderVoiceRoster();setStatus(sound?'Compartilhando tela e áudio.':shareStreamAudio?'Tela compartilhada sem áudio. Marque Compartilhar áudio no seletor do navegador quando disponível.':'Compartilhando tela sem áudio.',sound?'ok':'warn');return true;
    }catch(err){if(localDisplayStream===source&&screenSharing)await stopScreenShare(true);else{source?.getTracks().forEach(t=>t.stop());outgoing?.getTracks().forEach(t=>t.stop());}if(request!==screenGeneration||callGeneration!==voiceGeneration)return false;setStatus(['NotAllowedError','AbortError'].includes(err?.name)?(replace&&screenSharing?'Troca cancelada. A tela anterior continua sendo compartilhada.':'Compartilhamento de tela cancelado.'):(err.message||'Não foi possível compartilhar a tela.'),'error');return false;}
    finally{if(committed){previousSource?.getTracks().forEach(t=>t.stop());previousStream?.getTracks().forEach(t=>t.stop());}}
  }
  async function switchScreenShare(){if(screenSharing)return startScreenShare({replace:true});return false;}
  async function stopScreenShare(sendState=true){
    screenGeneration++;if(!screenSharing&&!localScreenStream&&!localDisplayStream)return;
    window.TronoClips?.sharedStopped?.(localDisplayStream);localDisplayStream?.getTracks().forEach(t=>t.stop());localDisplayStream=null;
    screenSharing=false;localScreenPreviewPaused=false;localScreenCollapsed=false;localScreenStream?.getTracks?.().forEach(t=>t.stop());localScreenStream=null;
    if(transportIsSfu()){await closeSfuPublication('screen-audio');await closeSfuPublication('screen');}else for(const pc of peers.values()){pc._tronoWatchingScreen=false;if(pc._tronoScreenSender)await pc._tronoScreenSender.replaceTrack(null).catch(()=>{});if(pc._tronoScreenAudioSender)await pc._tronoScreenAudioSender.replaceTrack(null).catch(()=>{});}
    if(sendState)window.TronoNetwork?.setVoiceState(voiceJoined,micMuted,cameraOn,false,transmissionQuality,announcedTransport());
    updateButtons();renderScreenGrid();renderVoiceRoster();
  }
  async function toggleScreenShare(){if(screenSharing)await stopScreenShare(true);else openScreenOptions();}
  function openScreenOptions(){
    if(!voiceJoined)return;
    const setting=SCREEN_FORMATS[screenFormat];
    $('shareResolution').value=String(setting.height);$('shareFps').value=String(setting.fps);$('shareAudio').checked=shareStreamAudio;
    const limited=transportIsSfu()&&realtimeStatus?.highAllowed===false;
    $('shareResolution').querySelector('[value="1080"]').disabled=limited;
    $('shareFps').querySelector('[value="60"]').disabled=limited;
    if(limited){$('shareResolution').value='720';if(setting.fps===60)$('shareFps').value='30';}
    $('shareOptionsNote').textContent=limited?'O limite de consumo atual permite até 720p / 30 FPS.':'Escolha a qualidade; em seguida, o navegador perguntará qual tela ou aba compartilhar.';
    $('shareReplayHelp').textContent=window.TronoClips?.captureProfile?.()?'O replay será preparado automaticamente para clipar pelo botão ✂ na barra da chamada, com o áudio da tela quando disponível.':'Replay desligado. Ative em Meus clipes → Preferências para preparar clipes ao compartilhar.';
    $('screenOptionsDialog').showModal();
  }
  function confirmScreenOptions(e){
    e.preventDefault();if(!voiceJoined){$('screenOptionsDialog').close();return;}
    screenFormat=$('shareResolution').value+'-'+$('shareFps').value;
    if(!SCREEN_FORMATS[screenFormat])return;
    transmissionQuality=$('shareResolution').value==='1080'?'high':'balanced';
    screenBitrateMbps=$('shareResolution').value==='1080'?($('shareFps').value==='60'?10:8):($('shareFps').value==='15'?4:6);
    shareStreamAudio=$('shareAudio').checked;
    storage.setItem('mnScreenFormat',screenFormat);storage.setItem('mnScreenBitrate',String(screenBitrateMbps));storage.setItem('tronoTransmissionQuality',transmissionQuality);storage.setItem('mnShareStreamAudio',shareStreamAudio?'1':'0');
    updateQualityUI();$('screenOptionsDialog').close();
    // Call capture directly from this click, retaining the browser's user activation.
    void startScreenShare();
  }
  function toggleLocalScreenPreview(){
    if(!screenSharing)return;localScreenPreviewPaused=!localScreenPreviewPaused;if(localScreenPreviewPaused)localScreenCollapsed=true;renderScreenGrid();
    setStatus(localScreenPreviewPaused?'Prévia local pausada. A transmissão continua normalmente.':'Prévia local restaurada.','ok');
  }

  function setSpeaking(id,on){
    const had=speakingPeers.has(id);if(on)speakingPeers.add(id);else speakingPeers.delete(id);
    if(had!==on)updateMediaIndicators();
  }
  function stopMeter(id){
    const m=voiceMeters.get(id);if(m){clearTimeout(m.timer);try{m.source.disconnect();}catch{}try{m.analyser.disconnect();}catch{}voiceMeters.delete(id);}setSpeaking(id,false);
  }
  async function ensureMeterContext(){
    meterAudioContext=ensureMediaAudioContext();return meterAudioContext?.state==='running'?meterAudioContext:null;
  }
  async function watchStream(id,stream){
    if(!id||!stream?.getAudioTracks?.().length)return;
    const trackId=stream.getAudioTracks()[0].id;if(voiceMeters.get(id)?.trackId===trackId)return;
    stopMeter(id);const ctx=await ensureMeterContext();if(!ctx||!voiceJoined||stream.getAudioTracks()[0]?.readyState!=='live')return;
    try{
      if(voiceMeters.get(id)?.trackId===trackId)return;
      const source=ctx.createMediaStreamSource(stream),analyser=ctx.createAnalyser();analyser.fftSize=256;analyser.smoothingTimeConstant=.72;source.connect(analyser);
      const data=new Uint8Array(analyser.fftSize),meter={source,analyser,data,trackId,timer:0,lastVoice:0};voiceMeters.set(id,meter);
      const tick=()=>{if(voiceMeters.get(id)!==meter)return;
        if(document.visibilityState!=='hidden'){analyser.getByteTimeDomainData(data);let sum=0;for(const v of data){const x=(v-128)/128;sum+=x*x;}const rms=Math.sqrt(sum/data.length),now=performance.now();if(rms>.042)meter.lastVoice=now;setSpeaking(id,now-meter.lastVoice<300);}
        meter.timer=setTimeout(tick,document.visibilityState==='hidden'?1000:voiceLightMode?200:100);
      };tick();
    }catch(err){console.warn('[TronoSocial] medidor de voz',err);}
  }

  function closePeer(id){
    const pc=peers.get(id);if(pc){pc._tronoClosing=true;clearTimeout(pc._tronoNegotiationTimer);clearTimeout(pc._tronoOfferRetryTimer);clearTimeout(pc._tronoConnectTimer);try{pc.close();}catch{}peers.delete(id);}
    pendingIce.delete(id);const retry=videoRetryTimers.get(id);if(retry)clearTimeout(retry);videoRetryTimers.delete(id);mediaHealthyAt.delete(`${id}:camera`);mediaHealthyAt.delete(`${id}:screen`);stopMeter(id);
    removeRemoteAudio(id);removeRemoteAudio(streamAudioKey(id));remoteAvStreams.delete(id);remoteScreenStreams.delete(id);
    renderVideoGrid();renderScreenGrid();renderSeatMedia();
  }
  function closeAllPeers(){[...peers.keys()].forEach(closePeer);}
  async function applyOutput(audio){
    if(!audio||typeof audio.setSinkId!=='function')return;
    const target=selectedOutput||'';if(audio.sinkId===target)return;
    try{await audio.setSinkId(target);}catch(err){
      console.warn('[TronoSocial] saída',err);lastOutputError=`${err?.name||'OUTPUT_FAILED'} — saída escolhida indisponível`;
      selectedOutput='';storage.setItem('tronoVoiceOutput','');if($('voiceOutputSelect'))$('voiceOutputSelect').value='';
      try{await audio.setSinkId('');setStatus('Saída escolhida indisponível. Usando a saída padrão.','warn');}
      catch(fallback){lastOutputError=`${fallback?.name||'OUTPUT_FAILED'} — saída padrão indisponível`;setStatus('Não foi possível abrir a saída de áudio. Escolha outra saída em Configurações.','error');}
    }
  }
  function remoteAvStreamFor(id){if(!remoteAvStreams.has(id))remoteAvStreams.set(id,new MediaStream());return remoteAvStreams.get(id);}
  function remoteScreenStreamFor(id){if(!remoteScreenStreams.has(id))remoteScreenStreams.set(id,new MediaStream());return remoteScreenStreams.get(id);}

  function sfuKey(ownerId,kind){return `${ownerId}:${kind}`;}
  function preferredRidForQuality(q=cappedQuality()){return q==='economy'?'q':'f';}
  function waitIceGathering(pc,timeout=4200){
    if(!pc||pc.iceGatheringState==='complete')return Promise.resolve();
    return new Promise(resolve=>{let done=false;const finish=()=>{if(done)return;done=true;clearTimeout(timer);pc.removeEventListener('icegatheringstatechange',onchange);resolve();};const onchange=()=>{if(pc.iceGatheringState==='complete')finish();};const timer=setTimeout(finish,timeout);pc.addEventListener('icegatheringstatechange',onchange);});
  }
  function sfuSimulcastEncodings(){
    const q=qualityProfile();
    return [
      {rid:'f',scaleResolutionDownBy:1,maxBitrate:q.videoBitrate,maxFramerate:q.camera.fps},
      {rid:'h',scaleResolutionDownBy:2,maxBitrate:Math.max(180000,Math.round(q.videoBitrate*.42)),maxFramerate:q.camera.fps},
      {rid:'q',scaleResolutionDownBy:4,maxBitrate:Math.max(90000,Math.round(q.videoBitrate*.16)),maxFramerate:Math.min(q.camera.fps,24)},
    ];
  }
  function sfuScreenEncodings(){
    const q=qualityProfile();return [{maxBitrate:q.screenBitrate,maxFramerate:q.screen.fps,scaleResolutionDownBy:1}];
  }
  // Chromium's startup hint is advisory; congestion control still owns actual bandwidth.
  function screenStartupOffer(offer){
    if(!offer?.sdp)return offer;
    const max=Math.round(effectiveScreenBitrate()/1000),start=Math.min(6000,Math.round(max*.65));
    const parts=offer.sdp.split(/(?=m=)/);
    return {type:offer.type,sdp:parts.map(part=>{
      if(!part.startsWith('m=video'))return part;
      const ids=[...part.matchAll(/^a=rtpmap:(\d+) (?:VP8|VP9|H264|AV1)\/90000/gmi)].map(m=>m[1]);
      for(const id of ids){
        const re=new RegExp('^a=fmtp:'+id+' (.*)$','m'),hint=`x-google-start-bitrate=${start};x-google-max-bitrate=${max}`;
        if(re.test(part))part=part.replace(re,(_,params)=>`a=fmtp:${id} ${params.replace(/;?\s*x-google-(?:start|max|min)-bitrate=\d+/g,'')};${hint}`);
        else part=part.replace(new RegExp('(^a=rtpmap:'+id+' [^\r\n]+\r?\n)','m'),`$1a=fmtp:${id} ${hint}\r\n`);
      }
      return part;
    }).join('')};
  }
  function advertisedSfuRids(transceiver,pc){
    const allowed=new Set(['f','h','q']),rids=[];
    try{for(const enc of transceiver?.sender?.getParameters?.().encodings||[])if(enc?.rid&&allowed.has(enc.rid)&&!rids.includes(enc.rid))rids.push(enc.rid);}catch{}
    if(!rids.length){const sdp=pc?.localDescription?.sdp||'';for(const match of sdp.matchAll(/^a=rid:([^\s]+)\s+send/gm)){const rid=match[1];if(allowed.has(rid)&&!rids.includes(rid))rids.push(rid);}}
    return rids;
  }
  async function prepareSfuPublisher(kind,track,{simulcast=true}={}){
    const pc=new RTCPeerConnection(sfuIceConfig);let transceiver;
    try{
      let init={direction:'sendonly'};
      if(simulcast&&kind==='camera')init={...init,sendEncodings:sfuSimulcastEncodings()};
      if(simulcast&&kind==='screen')init={...init,sendEncodings:sfuScreenEncodings()};
      transceiver=pc.addTransceiver(track,init);
      const offer=await pc.createOffer();await pc.setLocalDescription(kind==='screen'?screenStartupOffer(offer):offer);await waitIceGathering(pc);
      return {pc,transceiver,rids:simulcast?advertisedSfuRids(transceiver,pc):[]};
    }catch(err){try{pc.close();}catch{}throw err;}
  }
  function shouldRetrySingleLayer(err){
    const code=String(err?.code||''),name=String(err?.name||'');
    if(['SCREEN_BUDGET_BLOCKED','REALTIME_DISABLED','REALTIME_HARD_LIMIT','SFU_ROOM_SAFETY_LIMIT','NETWORK_OFFLINE'].includes(code))return false;
    return ['TypeError','InvalidAccessError','OperationError','NotSupportedError'].includes(name)||['PUBLICATION_NOT_ACTIVE','BAD_SFU_PUBLISH','SFU_CONNECT_TIMEOUT','SFU_REQUEST_FAILED'].includes(code)||code.includes('simulcast');
  }
  async function refreshSfuPublicationList(){
    if(!transportIsSfu())return [];
    const generation=sfuGeneration;
    try{const r=await window.TronoNetwork?.requestSfu('list-publications',{},8000);if(generation!==sfuGeneration||!transportIsSfu())return sfuPublicationList;sfuPublicationList=Array.isArray(r?.publications)?r.publications:[];return sfuPublicationList;}
    catch(err){console.warn('[TronoSocial] atualizar publicações SFU',err?.code||err);return sfuPublicationList;}
  }
  function isStalePublicationError(err){return ['PUBLICATION_STALE','PUBLICATION_NOT_FOUND','PUBLICATION_NOT_READY','SFU_SESSION_STALE','not_found_track_error'].includes(String(err?.code||''));}
  function attachSfuRemoteTrack(pub,track){
    if(!pub||!track||!wantsSfuPublication(pub))return;const id=pub.ownerId;const stream=isScreenKind(pub.kind)?remoteScreenStreamFor(id):remoteAvStreamFor(id);
    if(!stream.getTracks().some(t=>t.id===track.id))stream.addTrack(track);
    const generation=sfuGeneration,current=()=>voiceJoined&&transportIsSfu()&&generation===sfuGeneration&&stream.getTracks().includes(track)&&wantsSfuPublication(pub);
    if(pub.kind==='audio'||pub.kind==='screen-audio'){
      attachRemoteAudio(pub.kind==='screen-audio'?streamAudioKey(id):id);
      track.addEventListener?.('unmute',()=>{if(current())attachRemoteAudio(pub.kind==='screen-audio'?streamAudioKey(id):id);});
    }else{
      if(!track.muted)mediaHealthyAt.set(`${id}:${pub.kind==='screen'?'screen':'camera'}`,Date.now());
      track.addEventListener?.('unmute',()=>{if(!current())return;mediaHealthyAt.set(`${id}:${pub.kind==='screen'?'screen':'camera'}`,Date.now());renderVideoGrid();renderScreenGrid();renderSeatMedia();});
      track.addEventListener?.('ended',()=>{if(current()){renderVideoGrid();renderScreenGrid();renderSeatMedia();}});
    }
    renderVideoGrid();renderScreenGrid();renderSeatMedia();
  }
  async function publishSfuTrack(kind,track){
    if(!transportIsSfu()||!track)return null;
    const generation=sfuGeneration;const ensureCurrent=()=>{if(generation!==sfuGeneration||!voiceJoined||!transportIsSfu())throw Object.assign(new Error('A publicação foi cancelada pela troca de chamada.'),{code:'SFU_CANCELLED'});};
    if(isScreenKind(kind)&&!realtimeStatus?.screenAllowed)throw Object.assign(new Error('Compartilhamento bloqueado pelo freio de consumo.'),{code:'SCREEN_BUDGET_BLOCKED'});
    if(sfuLocalPublications.has(kind))await closeSfuPublication(kind);
    const mediaKind=kind==='camera',attempts=mediaKind?[true,false]:[false];let lastError=null;
    for(const simulcast of attempts){
      let prepared=null,result=null;
      try{
        prepared=await prepareSfuPublisher(kind,track,{simulcast});
        ensureCurrent();const {pc,transceiver,rids}=prepared;
        result=await window.TronoNetwork.requestSfu('publish-track',{kind,screenBitrate:effectiveScreenBitrate(),quality:cappedQuality(),mid:String(transceiver.mid),rids,sessionDescription:plainSdp(pc.localDescription)});
        ensureCurrent();if(result?.sessionDescription)await pc.setRemoteDescription(result.sessionDescription);
        const pub={kind,pc,sessionId:result.sessionId,mid:String(transceiver.mid),sender:transceiver.sender,trackName:result.publication?.trackName||kind,rids:Array.isArray(result.publication?.rids)?result.publication.rids:rids};
        sfuLocalPublications.set(kind,pub);await applySenderQuality(pub.sender,kind);await waitPeerConnected(pc,14000);const ready=await window.TronoNetwork.requestSfu('publication-ready',{sessionId:pub.sessionId},9000);ensureCurrent();pub.ready=true;if(Array.isArray(ready?.rids))pub.rids=ready.rids;
        if(lastSfuError.toLowerCase().includes(kind))lastSfuError='';
        pc.onconnectionstatechange=()=>{if(pc.connectionState==='failed'&&transportIsSfu())fallbackToP2p('A conexão com o SFU falhou; retornando ao P2P.');};
        return pub;
      }catch(err){
        lastError=err;if(sfuLocalPublications.get(kind)?.pc===prepared?.pc)sfuLocalPublications.delete(kind);try{prepared?.pc?.close();}catch{}
        if(result?.sessionId)void window.TronoNetwork?.requestSfu('close-publication',{sessionId:result.sessionId},6000).catch(()=>{});
        if(simulcast&&shouldRetrySingleLayer(err)){console.warn(`[TronoSocial] ${kind} simulcast indisponível; tentando camada única`,err?.code||err?.name||err);continue;}
        break;
      }
    }
    throw lastError||new Error(`Não foi possível publicar ${kind} no SFU.`);
  }
  async function closeSfuPublication(kind){
    const pub=sfuLocalPublications.get(kind);if(!pub)return;sfuLocalPublications.delete(kind);
    try{pub.pc?.close();}catch{}
    try{await window.TronoNetwork?.requestSfu('close-publication',{sessionId:pub.sessionId},9000);}catch(err){console.warn('[TronoSocial] fechar publicação SFU',kind,err.code||err);}
  }
  async function subscribeSfuPublication(pub){
    if(!transportIsSfu()||!pub||!wantsSfuPublication(pub))return null;
    const key=sfuKey(pub.ownerId,pub.kind),current=sfuSubscriptions.get(key);
    if(current?.publisherSessionId===pub.sessionId)return current;
    if(current)await closeSfuSubscription(key);
    const generation=sfuGeneration,watchVersion=streamWatchVersions.get(pub.ownerId)||0;
    const ensureCurrent=()=>{if(generation!==sfuGeneration||!voiceJoined||!transportIsSfu()||!wantsSfuPublication(pub)||(isScreenKind(pub.kind)&&watchVersion!==(streamWatchVersions.get(pub.ownerId)||0))||(sub&&sfuSubscriptions.get(key)!==sub))throw Object.assign(new Error('A chamada mudou ou você parou de assistir durante a negociação.'),{code:'SFU_CANCELLED'});};
    const pc=new RTCPeerConnection(sfuIceConfig),rid=['camera','screen'].includes(pub.kind)&&Array.isArray(pub.rids)&&pub.rids.length?preferredRidForMedia(pub.kind,false):null;
    let result,sub;
    try{
      pc.ontrack=e=>{if(generation===sfuGeneration&&transportIsSfu()&&wantsSfuPublication(pub)&&(!isScreenKind(pub.kind)||watchVersion===(streamWatchVersions.get(pub.ownerId)||0))){const active=sfuSubscriptions.get(key);if(active?.pc===pc){active.track=e.track;attachSfuRemoteTrack(pub,e.track);}}};
      result=await window.TronoNetwork.requestSfu('subscribe-track',{publisherId:pub.ownerId,kind:pub.kind,quality:cappedQuality(),preferredRid:rid});
      ensureCurrent();
      if(result?.sessionDescription?.type!=='offer')throw Object.assign(new Error('SFU não retornou uma oferta válida de assinatura.'),{code:'BAD_SFU_OFFER'});
      sub={key,pc,sessionId:result.sessionId,mid:result.mid,publisherSessionId:pub.sessionId,publisherId:pub.ownerId,kind:pub.kind,preferredRid:result.preferredRid||rid,track:null,negotiating:true,readyAt:0};
      sfuSubscriptions.set(key,sub);
      await pc.setRemoteDescription(result.sessionDescription);const answer=await pc.createAnswer();await pc.setLocalDescription(answer);await waitIceGathering(pc);ensureCurrent();
      const localAnswer=plainSdp(pc.localDescription);if(localAnswer?.type!=='answer'||!localAnswer.sdp)throw Object.assign(new Error('Resposta SDP local inválida.'),{code:'BAD_SFU_ANSWER'});
      await window.TronoNetwork.requestSfu('renegotiate',{sessionId:sub.sessionId,sessionDescription:localAnswer});ensureCurrent();await waitPeerConnected(pc,18000);ensureCurrent();sub.negotiating=false;sub.readyAt=Date.now();lastSfuError='';
      pc.onconnectionstatechange=()=>{if(pc.connectionState==='failed'&&transportIsSfu()){closeSfuSubscription(key).finally(()=>setTimeout(()=>syncSfuSubscriptions(),900));}};
      return sub;
    }catch(err){
      try{pc.close();}catch{}
      if(sfuSubscriptions.get(key)?.pc===pc){sfuSubscriptions.delete(key);detachSfuRemoteMedia(sub);}
      if(result?.sessionId)void window.TronoNetwork?.requestSfu('close-subscription',{sessionId:result.sessionId},6000).catch(()=>{});
      throw err;
    }
  }
  function detachSfuRemoteMedia(sub){
    if(!sub)return;
    const stream=isScreenKind(sub.kind)?remoteScreenStreams.get(sub.publisherId):remoteAvStreams.get(sub.publisherId);
    if(stream){for(const t of [...stream.getTracks()])if(t===sub.track){try{stream.removeTrack(t);t.stop();}catch{}}}
    if(sub.kind==='audio'){removeRemoteAudio(sub.publisherId);stopMeter(sub.publisherId);}
    if(sub.kind==='screen-audio')removeRemoteAudio(streamAudioKey(sub.publisherId));
  }
  async function closeSfuSubscription(key){
    const sub=sfuSubscriptions.get(key);if(!sub)return;sfuSubscriptions.delete(key);
    try{sub.pc?.close();}catch{}
    detachSfuRemoteMedia(sub);
    try{await window.TronoNetwork?.requestSfu('close-subscription',{sessionId:sub.sessionId},8000);}catch(err){console.warn('[TronoSocial] fechar assinatura SFU',key,err.code||err);}
  }
  async function updateAllSfuSubscriptionLayers(){
    if(!transportIsSfu())return;const rid=preferredRidForQuality();const jobs=[];
    for(const sub of sfuSubscriptions.values())if(['camera','screen'].includes(sub.kind)){const target=preferredRidForMedia(sub.kind,false);if(sub.preferredRid!==target)jobs.push(window.TronoNetwork.requestSfu('update-subscription',{sessionId:sub.sessionId,preferredRid:target},9000).then(r=>{sub.preferredRid=r?.preferredRid||target;}).catch(err=>console.warn('[TronoSocial] camada SFU',err.code||err)));}
    await Promise.allSettled(jobs);
  }
  function clearSfuRetry(key){const t=sfuRetryTimers.get(key);if(t)clearTimeout(t);sfuRetryTimers.delete(key);sfuRetryCount.delete(key);}
  function scheduleSfuRetry(key,pub,err){
    if(sfuRetryTimers.has(key)||!transportIsSfu())return;const n=(sfuRetryCount.get(key)||0)+1;sfuRetryCount.set(key,n);const stale=isStalePublicationError(err),delay=stale?Math.min(5000,500*Math.pow(1.7,Math.min(n-1,4))):Math.min(12000,900*Math.pow(2,Math.min(n-1,4)));
    const label=pub?.kind==='screen'?'Tela':pub?.kind==='camera'?'Câmera':'Áudio',code=err?.code||'mídia indisponível';lastSfuError=`${label}: ${code}`;
    if(!stale&&n>=3&&['BAD_SFU_ANSWER','BAD_SFU_OFFER','BAD_SFU_RENEGOTIATE','SFU_ANSWER_REJECTED','SFU_CONNECT_TIMEOUT'].includes(String(code))){void fallbackToP2p('Não foi possível negociar a mídia pelo SFU. Reconectando a chamada por P2P.');return;}
    let message=stale?`${label} SFU foi atualizado enquanto conectava. Ressincronizando a publicação…`:`${label} SFU reconectando… (${code}).`;
    if(!stale&&!sfuTurnActive&&['SFU_CONNECT_TIMEOUT','NETWORK_CLOSED','NETWORK_OFFLINE'].includes(String(code)))message+=' A rota ICE falhou; TURN pode ajudar em redes móveis/CGNAT.';
    setStatus(message,'warn');renderTelemetry();
    sfuRetryTimers.set(key,setTimeout(async()=>{sfuRetryTimers.delete(key);if(!transportIsSfu())return;if(stale)await refreshSfuPublicationList();void syncSfuSubscriptions();},delay));
  }
  async function syncSfuSubscriptions(){
    if(!transportIsSfu())return;
    const generation=sfuGeneration;
    sfuSyncChain=sfuSyncChain.then(async()=>{
      if(generation!==sfuGeneration||!transportIsSfu())return;
      const desired=new Map();for(const pub of sfuPublicationList){if(wantsSfuPublication(pub))desired.set(sfuKey(pub.ownerId,pub.kind),pub);}
      for(const key of [...sfuSubscriptions.keys()]){if(generation!==sfuGeneration||!transportIsSfu())break;if(!desired.has(key))await closeSfuSubscription(key);}
      for(const [key,pub] of desired){if(generation!==sfuGeneration||!transportIsSfu())break;const existing=sfuSubscriptions.get(key);if(!existing||existing.publisherSessionId!==pub.sessionId){try{await subscribeSfuPublication(pub);clearSfuRetry(key);}catch(err){console.warn('[TronoSocial] assinatura SFU',key,err.code||err);if(isStalePublicationError(err))await refreshSfuPublicationList();if(err?.code!=='SFU_CANCELLED')scheduleSfuRetry(key,pub,err);}}}
      renderVoiceRoster();renderVideoGrid();renderScreenGrid();renderSeatMedia();
    }).catch(err=>console.warn('[TronoSocial] fila SFU',err));
    return sfuSyncChain;
  }
  async function stopSfuTransport({toP2p=true}={}){
    clearTimeout(mixedTransportTimer);mixedTransportTimer=null;
    sfuGeneration++;mediaTransport='stopping';sfuSyncChain=Promise.resolve();
    // Detach the old resources synchronously. Cloudflare cleanup may be slow;
    // it must not delay P2P readiness or delete media from the next connection.
    for(const t of sfuRetryTimers.values())clearTimeout(t);sfuRetryTimers.clear();sfuRetryCount.clear();
    const cleanup=[...[...sfuSubscriptions.keys()].map(closeSfuSubscription),...[...sfuLocalPublications.keys()].map(closeSfuPublication)];
    sfuPublicationList=[];
    for(const id of [...remoteAudio.keys()]){removeRemoteAudio(id);if(id!==meId())stopMeter(id);}remoteAvStreams.clear();remoteScreenStreams.clear();
    mediaTransport=toP2p?'p2p':'none';updateRealtimeUI();renderVideoGrid();renderScreenGrid();renderSeatMedia();
    void Promise.allSettled(cleanup);
  }
  async function startSfuTransport({callGeneration=voiceGeneration}={}){
    if(!voiceJoined||!inChatHub())return false;
    const generation=sfuGeneration,ensureCurrent=()=>{if(!voiceJoined||callGeneration!==voiceGeneration||generation!==sfuGeneration||roomVoiceMode==='p2p')throw Object.assign(new Error('Entrada SFU cancelada.'),{code:'SFU_CANCELLED'});};
    mediaTransport='sfu-pending';updateRealtimeUI();
    try{
      await refreshSfuIceConfig();
      ensureCurrent();
      const status=await syncRealtimeStatus({quiet:false});realtimeStatus=status||realtimeStatus;updateQualityUI();
      ensureCurrent();
      if(roomVoiceMode==='p2p'||!status?.enabled||!status?.configured||status?.hardBlocked){mediaTransport='p2p';updateRealtimeUI();return false;}
      mediaTransport='sfu';lastSfuError='';closeAllPeers();updateRealtimeUI();
      const audio=localStream?.getAudioTracks?.()[0];if(audio)await publishSfuTrack('audio',audio);
      const camera=localStream?.getVideoTracks?.()[0];if(cameraOn&&camera)await publishSfuTrack('camera',camera);
      const screen=localScreenStream?.getVideoTracks?.()[0];if(screenSharing&&screen&&status.screenAllowed)await publishSfuTrack('screen',screen);
      const screenAudio=localScreenStream?.getAudioTracks?.()[0];if(screenSharing&&screenAudio&&status.screenAllowed)await publishSfuTrack('screen-audio',screenAudio);
      window.TronoNetwork?.setVoiceState(true,micMuted,cameraOn,screenSharing,transmissionQuality,'sfu');
      await syncSfuSubscriptions();ensureCurrent();syncPeers();setStatus('Voz conectada pelo Cloudflare SFU.','ok');return true;
    }catch(err){
      if(err?.code==='SFU_CANCELLED'||callGeneration!==voiceGeneration||generation!==sfuGeneration)return false;
      console.warn('[TronoSocial] inicialização SFU',err);lastSfuError=`Áudio: ${err.code||err.name||'SFU_ERROR'} — ${err.message||'falha ao conectar'}`;
      await stopSfuTransport({toP2p:true});setStatus(`SFU não conectou (${err.code||err.name||'SFU_ERROR'}). Tentando áudio por P2P…`,'warn');return false;
    }
  }
  async function fallbackToP2p(reason='SFU indisponível; retornando ao P2P.'){
    if(!voiceJoined)return;window.TronoNetwork?.fallbackVoice?.();roomVoiceMode='p2p';if(mediaTransport==='p2p')return;const generation=voiceGeneration;await stopSfuTransport({toP2p:true});if(!voiceJoined||generation!==voiceGeneration)return;window.TronoNetwork?.setVoiceState(true,micMuted,cameraOn,screenSharing,transmissionQuality,'p2p');setStatus(reason,'warn');syncPeers();
  }
  async function applyRealtimeStatus(status){
    if(!status)return;realtimeStatus=status;updateQualityUI();
    if(transportIsSfu()&&(!status.enabled||status.hardBlocked)){await fallbackToP2p(status.hardBlocked?'Limite de segurança atingido; mídia voltou ao P2P.':'Cloudflare Realtime foi desligado; mídia voltou ao P2P.');return;}
    if(transportIsSfu()&&!status.screenAllowed&&screenSharing)await stopScreenShare(true);
    if(transportIsSfu()&&status.maxQuality&&QUALITY_ORDER.indexOf(transmissionQuality)>QUALITY_ORDER.indexOf(status.maxQuality)){
      transmissionQuality=status.maxQuality;storage.setItem('tronoTransmissionQuality',transmissionQuality);updateQualityUI();await applyQualityToLiveMedia();setStatus(`Freio de consumo reduziu a transmissão para ${qualityProfile().label}.`,'warn');
    }
  }

  function recoverReceiverTracks(id){
    const pc=peers.get(id),av=remoteAvStreamFor(id),screen=remoteScreenStreamFor(id);if(!pc)return {av,screen};
    const add=(stream,track)=>{if(track&&!stream.getTracks().some(x=>x.id===track.id))stream.addTrack(track);};
    add(av,pc._tronoAudioTransceiver?.receiver?.track);add(av,pc._tronoVideoTransceiver?.receiver?.track);add(screen,pc._tronoScreenTransceiver?.receiver?.track);add(screen,pc._tronoScreenAudioTransceiver?.receiver?.track);
    return {av,screen};
  }
  function scheduleVideoRecovery(id){
    if(!id||videoRetryTimers.has(id))return;
    videoRetryTimers.set(id,setTimeout(async()=>{
      videoRetryTimers.delete(id);const person=privateVoiceRoster.get(id);if(!voiceJoined||(!person?.camera&&!person?.screen))return;
      const {av,screen}=recoverReceiverTracks(id),cameraLive=av.getVideoTracks().some(t=>t.readyState==='live'&&!t.muted),screenLive=screen.getVideoTracks().some(t=>t.readyState==='live'&&!t.muted);
      if(!((person.camera&&!hiddenCameras.has(id)&&!cameraLive)||(person.screen&&watchingStreams.has(id)&&!screenLive)))return;
      if(transportIsSfu()){
        const generation=sfuGeneration;
        const keys=[];if(person.camera&&!hiddenCameras.has(id)&&!cameraLive)keys.push(sfuKey(id,'camera'));if(person.screen&&watchingStreams.has(id)&&!screenLive)keys.push(sfuKey(id,'screen'));
        let retry=false;
        for(const key of keys){
          const sub=sfuSubscriptions.get(key);
          // ICE gathering + answering + first video frames can exceed this timer.
          // Let the negotiation's own bounded timeout handle a pending receiver.
          if(!sub||sub.negotiating||!sub.readyAt||Date.now()-sub.readyAt<8000){retry=true;continue;}
          void closeSfuSubscription(key);
        }
        if(!keys.every(key=>sfuSubscriptions.has(key)))await refreshSfuPublicationList();
        if(!voiceJoined||!transportIsSfu()||generation!==sfuGeneration)return;
        void syncSfuSubscriptions();if(retry)scheduleVideoRecovery(id);return;
      }
      const pc=peers.get(id);if(!pc)return;
      if(pc._tronoInitiator)requestNegotiation(id,pc,true,true);else window.TronoNetwork?.sendVoiceSignal(id,'renegotiate-request',{iceRestart:true});
      setStatus('Ressincronizando mídia da chamada...','warn');
    },3800));
  }

  function attachRemoteTrack(id,track,transceiver){
    const pc=peers.get(id);
    const remoteVideoTransceivers=pc?.getTransceivers?.().filter(t=>t.receiver?.track?.kind==='video')||[];
    // No lado que responde, ontrack dispara durante setRemoteDescription, antes de guardarmos
    // as referências dos transceivers. A ordem dos m-lines do iniciador é câmera -> tela.
    const remoteAudioTransceivers=pc?.getTransceivers?.().filter(t=>t.receiver?.track?.kind==='audio')||[];
    const isScreen=(track?.kind==='video'&&(transceiver===pc?._tronoScreenTransceiver||remoteVideoTransceivers.indexOf(transceiver)===1))||(track?.kind==='audio'&&(transceiver===pc?._tronoScreenAudioTransceiver||remoteAudioTransceivers.indexOf(transceiver)===1));
    const stream=isScreen?remoteScreenStreamFor(id):remoteAvStreamFor(id);
    if(track?.kind==='video'&&!isScreen)track.enabled=!hiddenCameras.has(id);
    if(track&&!stream.getTracks().some(x=>x.id===track.id))stream.addTrack(track);
    if(track.kind==='audio'){
      if(!isScreen||watchingStreams.has(id))attachRemoteAudio(isScreen?streamAudioKey(id):id);
    }
    const rerender=()=>{renderVideoGrid();renderScreenGrid();renderSeatMedia();};
    // 'mute' pode oscilar por poucos quadros durante jitter/renegociação. Não escondemos
    // o <video> nesses pulsos para evitar o efeito de câmera piscando na mesa.
    track.addEventListener?.('ended',rerender);
    track.addEventListener?.('mute',()=>{ if(track.kind==='video') scheduleVideoRecovery(id); });
    track.addEventListener?.('unmute',()=>{
      if(!voiceJoined||peers.get(id)!==pc||pc?._tronoClosing)return;
      if(track.kind==='audio'&&(!isScreen||watchingStreams.has(id)))attachRemoteAudio(isScreen?streamAudioKey(id):id);
      if(track.kind==='video'){const kind=isScreen?'screen':'camera';mediaHealthyAt.set(`${id}:${kind}`,Date.now());}
      const retry=videoRetryTimers.get(id);if(retry)clearTimeout(retry);videoRetryTimers.delete(id);rerender();
    });
    if(track.kind==='video'&&!track.muted)mediaHealthyAt.set(`${id}:${isScreen?'screen':'camera'}`,Date.now());
    rerender();
  }

  async function makeOffer(id,pc,iceRestart=false){
    if(!pc||pc._tronoClosing||pc.connectionState==='closed'||!pc._tronoInitiator)return;
    if(pc._tronoMakingOffer)return;
    if(pc.signalingState!=='stable'){
      if(pc.signalingState==='have-local-offer'&&pc.localDescription?.type==='offer'){
        // The other endpoint may have dropped this offer while still on SFU.
        // Resend the pending SDP instead of waiting forever for its lost answer.
        window.TronoNetwork?.sendVoiceSignal(id,'offer',plainSdp(pc.localDescription));scheduleOfferRetry(id,pc);
      }
      if(iceRestart){pc._tronoRenegotiatePending=true;pc._tronoIceRestartPending=true;}return;
    }
    pc._tronoMakingOffer=true;
    try{
      await syncInitiatorTracks(pc);
      if(iceRestart)try{pc.restartIce?.();}catch{}
      const offer=await pc.createOffer({iceRestart:!!iceRestart});if(pc.signalingState!=='stable'){pc._tronoRenegotiatePending=true;return;}
      await pc.setLocalDescription(offer);if(pc._tronoClosing)return;pc._tronoOfferRetries=0;window.TronoNetwork?.sendVoiceSignal(id,'offer',plainSdp(pc.localDescription));scheduleOfferRetry(id,pc);
    }catch(err){console.warn('[TronoSocial] oferta',id,err);}finally{pc._tronoMakingOffer=false;}
  }
  function scheduleOfferRetry(id,pc){
    clearTimeout(pc._tronoOfferRetryTimer);
    pc._tronoOfferRetryTimer=setTimeout(()=>{
      if(!voiceJoined||transportIsSfu()||transportPending()||peers.get(id)!==pc||pc._tronoClosing||pc.signalingState!=='have-local-offer')return;
      pc._tronoOfferRetries=(pc._tronoOfferRetries||0)+1;
      if(pc._tronoOfferRetries>5){setStatus('A outra ponta ainda não respondeu à conexão de áudio. Tentando restabelecer a chamada…','warn');return;}
      window.TronoNetwork?.sendVoiceSignal(id,'offer',plainSdp(pc.localDescription));scheduleOfferRetry(id,pc);
    },2500);
  }
  function schedulePeerConnectionCheck(id,pc){
    clearTimeout(pc._tronoConnectTimer);
    if(pc.connectionState==='connected')return;
    pc._tronoConnectTimer=setTimeout(()=>{
      if(!voiceJoined||transportIsSfu()||transportPending()||peers.get(id)!==pc||pc._tronoClosing||pc.connectionState==='connected')return;
      pc._tronoConnectAttempts=(pc._tronoConnectAttempts||0)+1;
      if(pc._tronoConnectAttempts>2){setStatus(sfuTurnActive?'Não foi possível conectar o áudio com este participante. Saia e entre na voz para tentar novamente.':'P2P sem rota de áudio. Verifique TURN em Configurações → Conexão.','error');return;}
      requestNegotiation(id,pc,true,true);schedulePeerConnectionCheck(id,pc);
    },10000);
  }
  function requestNegotiation(id,pc,iceRestart=false,immediate=false){
    if(!voiceJoined||!pc||pc._tronoClosing)return;
    if(!pc._tronoInitiator){window.TronoNetwork?.sendVoiceSignal(id,'renegotiate-request',{iceRestart:!!iceRestart});return;}
    clearTimeout(pc._tronoNegotiationTimer);pc._tronoNegotiationTimer=setTimeout(()=>makeOffer(id,pc,iceRestart),immediate?0:90);
  }
  async function flushPendingNegotiation(id,pc){if(!pc||pc.signalingState!=='stable'||!pc._tronoRenegotiatePending)return;const ice=!!pc._tronoIceRestartPending;pc._tronoRenegotiatePending=false;pc._tronoIceRestartPending=false;await makeOffer(id,pc,ice);}

  function configureInitiatorTransceivers(pc){
    if(pc._tronoAudioTransceiver)return;
    pc._tronoAudioTransceiver=pc.addTransceiver('audio',{direction:'sendrecv'});
    pc._tronoVideoTransceiver=pc.addTransceiver('video',{direction:'sendrecv'});
    pc._tronoScreenTransceiver=pc.addTransceiver('video',{direction:'sendrecv'});
    pc._tronoScreenAudioTransceiver=pc.addTransceiver('audio',{direction:'sendrecv'});
    pc._tronoAudioSender=pc._tronoAudioTransceiver.sender;
    pc._tronoVideoSender=pc._tronoVideoTransceiver.sender;
    pc._tronoScreenSender=pc._tronoScreenTransceiver.sender;
    pc._tronoScreenAudioSender=pc._tronoScreenAudioTransceiver.sender;
  }
  async function bindAnswererTransceivers(pc){
    // IMPORTANT: quem responde não cria transceivers antes do offer. Fazer isso cria m-lines
    // paralelos (sendrecv locais + recvonly remotos) e causa exatamente o bug em que só quem
    // iniciou a chamada é visto. Em vez disso, reaproveitamos os m-lines recebidos no offer.
    const all=pc.getTransceivers(),audios=all.filter(t=>t.receiver?.track?.kind==='audio'),audio=audios[0],screenAudio=audios[1];
    const videos=all.filter(t=>t.receiver?.track?.kind==='video');
    const camera=videos[0]||null,screen=videos[1]||null;
    if(audio){pc._tronoAudioTransceiver=audio;pc._tronoAudioSender=audio.sender;audio.direction='sendrecv';}
    if(camera){pc._tronoVideoTransceiver=camera;pc._tronoVideoSender=camera.sender;camera.direction='sendrecv';}
    if(screen){pc._tronoScreenTransceiver=screen;pc._tronoScreenSender=screen.sender;screen.direction='sendrecv';}
    if(screenAudio){pc._tronoScreenAudioTransceiver=screenAudio;pc._tronoScreenAudioSender=screenAudio.sender;screenAudio.direction='sendrecv';}
    await syncInitiatorTracks(pc);
  }
  function syncInitiatorTracks(pc){
    const next=(pc._tronoTrackQueue||Promise.resolve()).catch(()=>{}).then(()=>syncPeerTracksNow(pc));pc._tronoTrackQueue=next;return next;
  }
  async function syncPeerTracksNow(pc){
    if(pc._tronoClosing)return;
    const stream=ensureLocalStream(),screenTrack=pc._tronoWatchingScreen?localScreenStream?.getVideoTracks?.()[0]||null:null,screenAudio=pc._tronoWatchingScreen?localScreenStream?.getAudioTracks?.().find(t=>t.readyState==='live')||null:null;
    for(const [sender,track,kind] of [[pc._tronoAudioSender,stream.getAudioTracks()[0]||null,'audio'],[pc._tronoVideoSender,stream.getVideoTracks()[0]||null,'camera'],[pc._tronoScreenSender,screenTrack,'screen'],[pc._tronoScreenAudioSender,screenAudio,'screen-audio']]){
      if(sender){await sender.replaceTrack(track);await applySenderQuality(sender,kind);}
    }
  }

  function ensurePeer(id){
    if(!voiceJoined||!id||id===meId())return null;if(peers.has(id))return peers.get(id);
    const pc=new RTCPeerConnection(p2pIceConfig());peers.set(id,pc);
    pc._tronoClosing=false;pc._tronoMakingOffer=false;pc._tronoIgnoreOffer=false;pc._tronoRenegotiatePending=false;pc._tronoIceRestartPending=false;
    pc._tronoInitiator=String(meId())<String(id);pc._tronoPolite=!pc._tronoInitiator;
    pc.onicecandidate=e=>{if(e.candidate)window.TronoNetwork?.sendVoiceSignal(id,'ice',e.candidate);};
    pc.onicecandidateerror=e=>console.warn('[TronoSocial] ICE',id,e.errorCode,e.errorText||'');
    pc.ontrack=e=>{if(peers.get(id)===pc&&!pc._tronoClosing)attachRemoteTrack(id,e.track,e.transceiver);};
    pc.onnegotiationneeded=()=>requestNegotiation(id,pc,false,false);
    pc.onconnectionstatechange=()=>{
      if(pc._tronoClosing)return;
      if(pc.connectionState==='failed'){
        if(pc._tronoInitiator)requestNegotiation(id,pc,true,true);else window.TronoNetwork?.sendVoiceSignal(id,'renegotiate-request',{iceRestart:true});
        setStatus('Reconectando mídia da chamada...','warn');
      }
      if(pc.connectionState==='connected'){clearTimeout(pc._tronoConnectTimer);pc._tronoConnectAttempts=0;setStatus('Voz conectada. Malha P2P sincronizada.','ok');window.TronoNetwork?.sendVoiceSignal(id,'stream-watch',{watching:watchingStreams.has(id)});}
      if(pc.connectionState==='closed')closePeer(id);
      renderVoiceRoster();
    };
    pc.oniceconnectionstatechange=()=>{if(pc.iceConnectionState==='failed'){if(pc._tronoInitiator)requestNegotiation(id,pc,true,true);else window.TronoNetwork?.sendVoiceSignal(id,'renegotiate-request',{iceRestart:true});}};

    // Somente o iniciador cria os m-lines. O respondente os recebe pelo offer e os converte
    // para sendrecv em bindAnswererTransceivers(), evitando transceivers duplicados/recvonly.
    if(pc._tronoInitiator){configureInitiatorTransceivers(pc);requestNegotiation(id,pc,false,true);}
    else setTimeout(()=>window.TronoNetwork?.sendVoiceSignal(id,'renegotiate-request',{iceRestart:false}),120);
    schedulePeerConnectionCheck(id,pc);
    return pc;
  }

  function handleSignal(msg){
    if(!voiceJoined||transportIsSfu()||transportPending())return;const id=msg.fromId;if(!id)return;const pc=ensurePeer(id);if(!pc)return;
    const next=(pc._tronoSignalQueue||Promise.resolve()).catch(()=>{}).then(()=>handleSignalNow(msg,id,pc));pc._tronoSignalQueue=next;return next;
  }
  async function handleSignalNow(msg,id,pc){
    if(pc._tronoClosing||!voiceJoined)return;
    try{
      if(msg.signalType==='stream-watch'){pc._tronoWatchingScreen=msg.data?.watching===true;await syncInitiatorTracks(pc);return;}
      if(msg.signalType==='renegotiate-request'){if(pc._tronoInitiator)requestNegotiation(id,pc,!!msg.data?.iceRestart,true);return;}
      if(msg.signalType==='offer'||msg.signalType==='answer'){
        const desc=new RTCSessionDescription(msg.data),isOffer=desc.type==='offer';
        if(!isOffer&&pc.signalingState!=='have-local-offer')return;
        const collision=isOffer&&(pc._tronoMakingOffer||pc.signalingState!=='stable');pc._tronoIgnoreOffer=!pc._tronoPolite&&collision;if(pc._tronoIgnoreOffer)return;
        if(collision&&pc._tronoPolite&&pc.signalingState!=='stable'){try{await pc.setLocalDescription({type:'rollback'});}catch{}}
        await pc.setRemoteDescription(desc);if(!isOffer)clearTimeout(pc._tronoOfferRetryTimer);
        // No primeiro offer recebido, os transceivers remotos já existem. Vincule nossos tracks
        // a esses mesmos m-lines ANTES de criar a resposta para que a mídia seja bidirecional.
        if(isOffer)await bindAnswererTransceivers(pc);
        for(const c of pendingIce.get(id)||[]){try{await pc.addIceCandidate(new RTCIceCandidate(c));}catch{}}pendingIce.delete(id);
        if(isOffer){await pc.setLocalDescription(await pc.createAnswer());window.TronoNetwork?.sendVoiceSignal(id,'answer',pc.localDescription);}else await flushPendingNegotiation(id,pc);
      }else if(msg.signalType==='ice'&&msg.data){
        if(pc.remoteDescription){try{await pc.addIceCandidate(new RTCIceCandidate(msg.data));}catch(err){if(!pc._tronoIgnoreOffer)throw err;}}else{const q=pendingIce.get(id)||[];q.push(msg.data);pendingIce.set(id,q);}
      }
    }catch(err){console.warn('[TronoSocial] signal',id,msg.signalType,err);}
  }

  function syncPeers(){
    if(!voiceJoined){closeAllPeers();renderVoiceRoster();renderVideoGrid();renderScreenGrid();renderSeatMedia();return;}
    if(transportPending()){closeAllPeers();renderVoiceRoster();renderVideoGrid();renderScreenGrid();renderSeatMedia();return;}
    if(transportIsSfu()){
      closeAllPeers();void syncSfuSubscriptions();
      if(detailedPlayers().some(p=>p.id!==meId()&&p.transport==='p2p')){
        if(!mixedTransportTimer)mixedTransportTimer=setTimeout(()=>{mixedTransportTimer=null;if(transportIsSfu()&&detailedPlayers().some(p=>p.id!==meId()&&p.transport==='p2p'))void fallbackToP2p('Um participante está em P2P. Reconectando a chamada no mesmo modo para manter o áudio nos dois sentidos.');},5000);
      }else{clearTimeout(mixedTransportTimer);mixedTransportTimer=null;}
      renderVoiceRoster();renderVideoGrid();renderScreenGrid();renderSeatMedia();return;
    }
    // Wait until both endpoints have announced P2P readiness before sending SDP.
    const me=meId(),active=new Set(detailedPlayers().filter(p=>p.id!==me&&p.joined&&p.transport==='p2p').map(p=>p.id));
    for(const id of active){const pc=ensurePeer(id);if(pc?.connectionState==='failed')requestNegotiation(id,pc,true,true);}
    for(const id of [...peers.keys()])if(!active.has(id))closePeer(id);
    renderVoiceRoster();renderVideoGrid();renderScreenGrid();renderSeatMedia();
  }

  function voiceStatusIcons(muted,silenced){
    const icon=(label,path)=>`<span class="participant-status-icon" role="img" aria-label="${label}" title="${label}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}<path d="M3 3l18 18"/></svg></span>`;
    return (muted?icon('Microfone mutado','<path d="M9 9v3a3 3 0 005 2M15 9V5a3 3 0 00-6 0M5 10v2a7 7 0 0012 5M19 12v-2M12 19v3M8 22h8"/>'):'')+(silenced?icon('Áudio da chamada silenciado','<path d="M4 13v-1a8 8 0 0113-6M20 12v5M4 13H2v7h5v-7H4M20 13h2v7h-5v-3"/>'):'');
  }
  function renderVoiceStatus(host,muted,silenced){if(!host)return;const html=voiceStatusIcons(muted,silenced);if(host.innerHTML!==html)host.innerHTML=html;host.hidden=!html;}
  function personVoiceSummary(p){const self=p.id===meId(),muted=self?micMuted:!!p.muted,cam=self?cameraOn:!!p.camera,screen=self?screenSharing:!!p.screen,transport=self?announcedTransport():(p.transport||'p2p');return (muted?'microfone mutado':speakingPeers.has(p.id)?'falando…':'na voz')+((self?deafened:p.deafened)?' • áudio silenciado':'')+(cam?(hiddenCameras.has(p.id)?' • câmera oculta':' • 📷 câmera'):'')+(screen?' • 🖥 tela':'')+(transport==='sfu'?' • ☁ SFU':transport==='sfu-pending'?' • conectando…':'');}
  function cameraInProfile(id){const mode=profileMedia.get(id)||'auto';return mode==='camera'||(mode==='auto'&&camerasInProfiles());}
  function screenInProfile(id){return profileMedia.get(id)==='screen';}
  function setProfileMedia(id,value){if(!['auto','camera','screen','stage'].includes(value))return;profileMedia.set(id,value);renderVoiceRoster();renderScreenGrid();}
  function camerasInProfiles(){return inChatHub()&&voiceJoined&&detailedPlayers().some(p=>p.id===meId()?screenSharing:p.screen);}
  function renderVoiceRoster(){
    const host=$('voiceRoster');if(!host)return;
    const stage=host.closest('.mn-media-stage');stage?.classList.toggle('has-screen',voiceJoined&&detailedPlayers().some(p=>p.id===meId()?screenSharing:p.screen&&watchingStreams.has(p.id)));stage?.classList.toggle('has-camera',voiceJoined&&detailedPlayers().some(p=>p.id===meId()?cameraOn:p.camera&&!hiddenCameras.has(p.id)));stage?.classList.toggle('screens-layout',camerasInProfiles());
    const roomName=roomState?.name||(inChatHub()?'Geral':'Voz da mesa');if($('mnStageRoomName'))$('mnStageRoomName').textContent=roomName;if($('textVoiceRoomName'))$('textVoiceRoomName').textContent='Voz conectada · '+roomName;
    if(!voiceJoined){
      const active=publicVoiceActive();host.classList.add('voice-roster-private');
      for(const video of host.querySelectorAll('video'))video.srcObject=null;
      host.innerHTML=active?'<div class="voice-privacy-note"><span>🎙️</span><strong>Há alguém na chamada</strong><small>Entre na voz para ver participantes, câmeras e microfones.</small></div>':'<div class="voice-privacy-note"><span>○</span><strong>Ninguém na chamada</strong><small>Entre na voz quando quiser conversar.</small></div>';return;
    }
    host.classList.remove('voice-roster-private');host.querySelector('.voice-privacy-note')?.remove();const me=meId(),players=detailedPlayers(),desired=new Set(players.map(p=>p.id));
    for(const old of [...host.querySelectorAll('.voice-person')])if(!desired.has(old.dataset.peer)){for(const video of old.querySelectorAll('video'))video.srcObject=null;old.remove();}
    for(const p of players){
      const self=p.id===me,muted=self?micMuted:!!p.muted,silenced=self?deafened:!!p.deafened,cam=self?cameraOn:!!p.camera,screen=self?screenSharing:!!p.screen,speaking=!muted&&speakingPeers.has(p.id),transport=self?announcedTransport():(p.transport||'p2p'),hidden=hiddenCameras.has(p.id);
      let card=findPeerTile(host,p.id,'.voice-person');
      if(!card){
        card=document.createElement('div');card.className='voice-person joined';card.dataset.peer=p.id;
        card.innerHTML='<div class="participant-camera-slot" hidden></div><div class="participant-screen-slot" hidden></div><span class="mn-person-avatar"></span><strong></strong><span class="participant-voice-status" hidden></span><small class="participant-summary"></small><button class="participant-camera-toggle" type="button" hidden></button><label class="participant-media-layout" hidden><span>Exibição</span><select aria-label="Exibição da mídia"><option value="auto">Automática</option><option value="camera">Câmera no perfil</option><option value="screen">Tela no perfil</option><option value="stage">Mídia ampliada</option></select></label>';
        const details=document.createElement('div');details.className='participant-details';details.hidden=true;details.id='participant-details-'+p.id;if(typeof details.showPopover==='function')details.setAttribute('popover','auto');const heading=document.createElement('strong');heading.className='participant-popup-name';heading.textContent=p.name;details.append(heading);
        for(const selector of ['.participant-summary','.participant-camera-toggle','.participant-media-layout'])details.append(card.querySelector(selector));card.append(details);
        const expand=document.createElement('button');expand.type='button';expand.className='participant-expand';expand.textContent='⌄';expand.setAttribute('aria-expanded','false');expand.setAttribute('aria-controls',details.id);expand.onclick=()=>{const on=!card.classList.contains('participant-expanded');card.classList.toggle('participant-expanded',on);expand.textContent=on?'⌃':'⌄';expand.setAttribute('aria-expanded',String(on));if(on){details.hidden=false;if(details.showPopover){details.showPopover();const rect=card.getBoundingClientRect(),popup=details.getBoundingClientRect();details.style.left=Math.max(12,Math.min(rect.left,innerWidth-popup.width-12))+'px';details.style.top=Math.max(60,Math.min(rect.top-popup.height-8,innerHeight-popup.height-92))+'px';}}else if(details.hidePopover)details.hidePopover();else details.hidden=true;};details.addEventListener('toggle',event=>{if(event.newState==='closed'){details.hidden=true;card.classList.remove('participant-expanded');expand.textContent='⌄';expand.setAttribute('aria-expanded','false');}});card.append(expand);
        card.querySelector('.participant-camera-toggle').onclick=()=>void toggleWatchCamera(p.id);card.querySelector('.participant-media-layout select').onchange=event=>setProfileMedia(p.id,event.target.value);
        if(!self){const label=document.createElement('label');label.className='mn-peer-gain';label.innerHTML='<span>Volume</span><input type="range" min="0" max="300" step="5"><output></output>';label.querySelector('input').dataset.peerVolume=p.id;label.querySelector('input').setAttribute('aria-label','Volume de '+p.name);details.appendChild(label);}
        host.appendChild(card);
      }
      card.classList.toggle('speaking',speaking);const dock=cameraInProfile(p.id)&&cam&&!hidden,screenDock=screenInProfile(p.id)&&screen&&(self||watchingStreams.has(p.id));card.classList.toggle('camera-in-profile',dock);card.querySelector('.participant-camera-slot').hidden=!dock;card.querySelector('.participant-screen-slot').hidden=!screenDock;card.classList.toggle('media-in-profile',dock||screenDock);const layout=card.querySelector('.participant-media-layout');layout.hidden=!cam&&!screen;const select=layout.querySelector('select');select.value=profileMedia.get(p.id)||'auto';select.setAttribute('aria-label','Exibição da mídia de '+p.name);select.querySelector('[value=camera]').disabled=!cam;select.querySelector('[value=screen]').disabled=!screen;
      const avatar=card.querySelector('.mn-person-avatar'),signature=JSON.stringify([p.name,p.avatar_preset,p.avatar_file_id]);
      if(avatar.dataset.signature!==signature){avatar.dataset.signature=signature;avatar.dataset.color=String([...String(p.id)].reduce((v,c)=>v+c.charCodeAt(0),0)%4);avatar.innerHTML=(window.TronoProfile?.avatarHtml(p)||esc(String(p.name||'M').slice(0,2).toUpperCase()))+'<i class="participant-online-dot" aria-label="Online" title="Online"></i>';}
      card.querySelector('.participant-popup-name').textContent=p.name;const expand=card.querySelector('.participant-expand');expand.title=(card.classList.contains('participant-expanded')?'Recolher':'Expandir')+' perfil de '+p.name;expand.setAttribute('aria-label',expand.title);
      renderVoiceStatus(card.querySelector('.participant-voice-status'),muted,silenced);
      card.querySelector(':scope > strong').textContent=p.name+(self?' (você)':'');
      card.querySelector('.participant-summary').textContent=personVoiceSummary(p);
      const toggle=card.querySelector('.participant-camera-toggle');toggle.hidden=self||!cam;toggle.textContent=hidden?'Mostrar câmera':'Ocultar câmera';toggle.setAttribute('aria-label',(hidden?'Mostrar':'Ocultar')+' câmera de '+p.name);toggle.setAttribute('aria-pressed',String(hidden));toggle.title='Esta preferência muda apenas o que você vê.';
      if(!self){card.querySelector('[data-peer-volume]').value=String(peerVolumes.get(p.id)??100);card.querySelector('output').textContent=(peerVolumes.get(p.id)??100)+'%';}
    }
    window.TronoProfile?.hydrate(host);renderVideoGrid();
  }

  function cameraStreamForPerson(p){return p.id===meId()?localStream:recoverReceiverTracks(p.id).av;}
  function screenStreamForPerson(p){return p.id===meId()?localScreenStream:recoverReceiverTracks(p.id).screen;}
  // Tracks remotas podem oscilar o flag `muted` por jitter. Depois que uma câmera já entregou
  // quadros, mantemos o vídeo visível por alguns segundos durante um pulso de mute; porém uma
  // trilha que nunca entregou mídia não é tratada como pronta e aciona a recuperação WebRTC.
  function remoteVideoUsable(id,stream,kind){
    const track=stream?.getVideoTracks?.().find(t=>t.readyState==='live');if(!track)return false;
    const key=`${id}:${kind}`,now=Date.now();if(!track.muted){mediaHealthyAt.set(key,now);return true;}
    const last=mediaHealthyAt.get(key)||0;return last>0&&(now-last)<5200;
  }
  function personHasLiveCamera(p){const stream=cameraStreamForPerson(p);if(p.id!==meId()&&hiddenCameras.has(p.id))return false;return p.id===meId()?cameraOn&&!!stream?.getVideoTracks?.().length:remoteVideoUsable(p.id,stream,'camera');}
  function personHasLiveScreen(p){const stream=screenStreamForPerson(p);return p.id===meId()?screenSharing&&!!stream?.getVideoTracks?.().length:remoteVideoUsable(p.id,stream,'screen');}

  function findPeerTile(host,id,selector){return [...host.querySelectorAll(selector)].find(el=>el.dataset.peer===id)||null;}
  function updateVideoElement(video,stream){if(!video)return;if(video.srcObject!==stream)video.srcObject=stream||null;if(stream)video.play().catch(()=>{});}
  function mediaSizeKey(kind){return `tronoMediaTileSize:${kind}`;}
  function bindMediaResize(tile,kind){
    if(!tile||tile.dataset.mediaResizeBound)return;if(inChatHub())return;tile.dataset.mediaResizeBound='1';
    let grip=tile.querySelector('.media-resize-grip');if(!grip){grip=document.createElement('button');grip.type='button';grip.className='media-resize-grip';grip.title='Redimensionar';grip.setAttribute('aria-label','Redimensionar janela');grip.textContent='↘';tile.appendChild(grip);}
    try{const saved=JSON.parse(storage.getItem(mediaSizeKey(kind))||'null');if(saved?.w&&saved?.h&&innerWidth>760){tile.style.width=`${Math.min(saved.w,innerWidth-80)}px`;tile.style.height=`${Math.min(saved.h,innerHeight-130)}px`;tile.style.aspectRatio='auto';tile.style.justifySelf='start';}}catch{}
    let resize=null;
    grip.addEventListener('pointerdown',e=>{if(!inChatHub()||innerWidth<=760)return;e.stopPropagation();const r=tile.getBoundingClientRect();resize={x:e.clientX,y:e.clientY,w:r.width,h:r.height};grip.setPointerCapture?.(e.pointerId);tile.classList.add('media-resizing');e.preventDefault();});
    grip.addEventListener('pointermove',e=>{if(!resize)return;const maxW=Math.max(280,Math.min(innerWidth-80,1000)),maxH=Math.max(170,Math.min(innerHeight-130,680));const w=Math.max(240,Math.min(maxW,resize.w+(e.clientX-resize.x))),h=Math.max(135,Math.min(maxH,resize.h+(e.clientY-resize.y)));tile.style.width=`${w}px`;tile.style.height=`${h}px`;tile.style.aspectRatio='auto';tile.style.justifySelf='start';});
    const stop=()=>{if(!resize)return;resize=null;tile.classList.remove('media-resizing');const r=tile.getBoundingClientRect();storage.setItem(mediaSizeKey(kind),JSON.stringify({w:Math.round(r.width),h:Math.round(r.height)}));};
    grip.addEventListener('pointerup',stop);grip.addEventListener('pointercancel',stop);grip.addEventListener('dblclick',e=>{e.stopPropagation();storage.removeItem(mediaSizeKey(kind));tile.style.width='';tile.style.height='';tile.style.aspectRatio='';tile.style.justifySelf='';});
  }

  function renderVideoGrid(){
    const host=$('cameraGrid');if(!host)return;
    if(!voiceJoined){host.className='camera-grid camera-grid-empty camera-grid-private';host.innerHTML='<div class="camera-grid-note">Entre na voz para acessar as câmeras da chamada.</div>';return;}
    if(panelMode==='floating'&&inGame()&&!inChatHub()){host.className='camera-grid camera-grid-empty';host.innerHTML='<div class="camera-grid-note">No modo flutuante, as câmeras aparecem junto à mesa.</div>';return;}
    const me=meId(),players=detailedPlayers(),visible=players.filter(p=>p.id===me?cameraOn:p.camera&&!hiddenCameras.has(p.id)),desired=new Set(visible.map(p=>p.id)),dock=visible.length?visible.every(p=>cameraInProfile(p.id)):camerasInProfiles();
    host.className=`camera-grid ${dock?'camera-grid-docked':visible.length?'':'camera-grid-empty'} ${visible.length===1?'one-camera':''}`;
    host.querySelector('.camera-grid-note')?.remove();
    for(const old of [...$('socialPanel').querySelectorAll('.camera-tile')])if(!desired.has(old.dataset.peer)){old.querySelector('video').srcObject=null;old.remove();}
    for(const p of visible){
      let tile=findPeerTile($('socialPanel'),p.id,'.camera-tile');
      const card=findPeerTile($('voiceRoster'),p.id,'.voice-person'),target=cameraInProfile(p.id)&&card?card.querySelector('.participant-camera-slot'):host;
      if(!tile){tile=document.createElement('div');tile.className='camera-tile camera-live';tile.dataset.peer=p.id;tile.innerHTML='<video autoplay playsinline muted></video><div class="camera-placeholder">Conectando vídeo…</div><button type="button" class="media-dock-btn" aria-label="Minimizar câmera no perfil">↙</button><button class="media-fullscreen-btn" title="Maximizar câmera" aria-label="Maximizar câmera">⛶</button><span></span>';target.appendChild(tile);bindMediaFullscreen(tile);bindMediaResize(tile,'camera');tile.querySelector('.media-dock-btn').onclick=()=>setProfileMedia(p.id,cameraInProfile(p.id)?'stage':'camera');}
      // Keep the same video/track when a screen starts or the roster updates.
      if(tile.parentElement!==target&&document.fullscreenElement!==tile&&!tile.classList.contains('media-maximized'))target.appendChild(tile);
      const minimize=tile.querySelector('.media-dock-btn');minimize.textContent=cameraInProfile(p.id)?'↗':'↙';minimize.title=cameraInProfile(p.id)?'Ampliar câmera':'Minimizar câmera no perfil';minimize.setAttribute('aria-label',minimize.title);bindMediaFullscreen(tile);bindMediaResize(tile,'camera');tile.querySelector('span').textContent=p.name+(p.id===me?' • você':'');
      const stream=cameraStreamForPerson(p),live=personHasLiveCamera(p),video=tile.querySelector('video');
      tile.classList.toggle('has-video',live);tile.classList.toggle('speaking',speakingPeers.has(p.id));
      if(live){const retry=videoRetryTimers.get(p.id);if(retry)clearTimeout(retry);videoRetryTimers.delete(p.id);updateVideoElement(video,stream);}else if(p.id!==me)scheduleVideoRecovery(p.id);
    }
    if(!visible.length&&!dock)host.innerHTML='<div class="camera-grid-note">Nenhuma câmera visível nesta chamada.</div>';
  }

  function renderScreenGrid(){
    const host=$('screenShareGrid');if(!host)return;
    for(const id of [...watchingStreams])if(!privateVoiceRoster.get(id)?.screen){watchingStreams.delete(id);removeRemoteAudio(streamAudioKey(id));}
    if(!voiceJoined||!inChatHub()){for(const tile of host.querySelectorAll('.screen-share-tile'))window.TronoStreamControls?.dispose(tile);host.className='screen-share-grid hidden';host.innerHTML='';return;}
    const me=meId(),visible=detailedPlayers().filter(p=>p.id===me?screenSharing:!!p.screen),desired=new Set(visible.map(p=>p.id));
    host.className=`screen-share-grid ${visible.length?'':'screen-share-empty'}`;
    host.querySelector('.screen-share-note')?.remove();
    for(const old of [...$('socialPanel').querySelectorAll('.screen-share-tile')])if(!desired.has(old.dataset.peer)){window.TronoStreamControls?.dispose(old);const video=old.querySelector('video');if(video)video.srcObject=null;old.remove();}
    for(const p of visible){
      const self=p.id===me,watching=self||watchingStreams.has(p.id);
      const card=findPeerTile($('voiceRoster'),p.id,'.voice-person'),target=screenInProfile(p.id)&&watching&&card?card.querySelector('.participant-screen-slot'):host;let tile=findPeerTile($('socialPanel'),p.id,'.screen-share-tile');
      if(!tile){
        tile=document.createElement('div');tile.className='screen-share-tile';tile.dataset.peer=p.id;
        tile.innerHTML='<video autoplay playsinline muted></video><div class="screen-share-placeholder">Conectando compartilhamento…</div><div class="mn-stream-invite"><strong></strong><small>Escolha quando abrir a transmissão.</small></div><button class="mn-watch-stream" type="button">Assistir stream</button><button class="media-fullscreen-btn" title="Maximizar compartilhamento" aria-label="Maximizar compartilhamento">⛶</button><button class="screen-collapse-btn" title="Minimizar prévia" aria-label="Minimizar prévia">—</button><button class="screen-resource-btn hidden" title="Ocultar apenas a prévia local sem interromper a transmissão">⚡ Economizar recursos</button><button class="screen-switch-btn" type="button" hidden title="Escolher outra tela ou janela sem encerrar o compartilhamento">⇄ Trocar tela</button><label class="mn-stream-volume"><span>Áudio da stream</span><input type="range" min="0" max="300" step="5" value="100"><output>100%</output></label><small class="mn-stream-audio-state"></small><span class="mn-stream-name"></span>';
        host.appendChild(tile);bindMediaFullscreen(tile);bindMediaResize(tile,'screen');
        tile.querySelector('.mn-watch-stream').addEventListener('click',()=>toggleWatchStream(p.id));
        tile.querySelector('.mn-stream-volume input').addEventListener('input',e=>setStreamGain(p.id,e.target.value));
        tile.querySelector('.screen-resource-btn').addEventListener('click',ev=>{ev.stopPropagation();toggleLocalScreenPreview();});
        tile.querySelector('.screen-switch-btn').addEventListener('click',async ev=>{ev.stopPropagation();const button=ev.currentTarget;button.disabled=true;try{await switchScreenShare();}finally{button.disabled=false;}});
        tile.querySelector('.screen-collapse-btn').addEventListener('click',async ev=>{
          ev.stopPropagation();if(document.fullscreenElement===tile)await document.exitFullscreen().catch(()=>{});
          tile.classList.remove('media-maximized');document.body.classList.remove('media-focus-open');
          if(self)localScreenCollapsed=!localScreenCollapsed;else tile.dataset.collapsed=tile.dataset.collapsed==='1'?'0':'1';renderScreenGrid();
        });
      }
      if(tile.parentElement!==target&&document.fullscreenElement!==tile&&!tile.classList.contains('media-maximized'))target.appendChild(tile);
      tile.classList.toggle('stream-invitation',!watching);
      tile.querySelector('.mn-stream-invite strong').textContent=`${p.name} está transmitindo`;
      const watch=tile.querySelector('.mn-watch-stream');watch.hidden=self;watch.textContent=watching?'Parar de assistir':'Assistir stream';
      tile.querySelector('.screen-switch-btn').hidden=!self;
      tile.querySelector('.mn-stream-name').textContent=`🖥 ${p.name}${self?' • você • transmitindo':''}`;
      for(const selector of ['.media-fullscreen-btn','.screen-collapse-btn'])tile.querySelector(selector).hidden=!watching;
      const resource=tile.querySelector('.screen-resource-btn');resource.classList.toggle('hidden',!self);resource.textContent=localScreenPreviewPaused?'👁 Mostrar prévia':'⚡ Economizar recursos';
      const stream=screenStreamForPerson(p),live=watching&&personHasLiveScreen(p),video=tile.querySelector('video');
      const hasAudio=stream?.getAudioTracks().some(t=>t.readyState==='live'&&!t.muted)||(!self&&sfuPublicationList.some(pub=>pub.ownerId===p.id&&pub.kind==='screen-audio'));
      const volume=tile.querySelector('.mn-stream-volume');volume.hidden=self||!watching;volume.querySelector('input').value=String(streamVolumes.get(p.id)??100);volume.querySelector('input').disabled=!hasAudio;volume.querySelector('output').textContent=`${streamVolumes.get(p.id)??100}%`;
      const soundState=tile.querySelector('.mn-stream-audio-state');soundState.hidden=!watching;soundState.textContent=hasAudio?'Áudio da stream disponível':'Transmissão sem áudio compartilhado';
      tile.classList.toggle('has-video',live);tile.classList.toggle('local-preview-paused',self&&localScreenPreviewPaused);
      const collapsed=watching&&(self?localScreenCollapsed:tile.dataset.collapsed==='1');tile.classList.toggle('share-collapsed',collapsed);
      const collapse=tile.querySelector('.screen-collapse-btn');collapse.textContent=collapsed?'▣':'—';collapse.title=collapsed?'Restaurar compartilhamento':'Minimizar compartilhamento';
      const placeholder=tile.querySelector('.screen-share-placeholder');
      if(!watching){video.pause();video.srcObject=null;}
      else if(self&&localScreenPreviewPaused){video.pause();video.srcObject=null;placeholder.innerHTML='<strong>⚡ Economia local ativa</strong><small>Sua tela continua sendo transmitida.</small>';tile.classList.add('has-video');}
      else if(live){placeholder.textContent='Conectando compartilhamento…';updateVideoElement(video,stream);}
      else if(!self)scheduleVideoRecovery(p.id);
      tile.setAttribute('aria-label','Transmissão de '+p.name);
      window.TronoStreamControls?.update(tile,live&&!collapsed&&!(self&&localScreenPreviewPaused));
    }
    if(!host.querySelector('.screen-share-tile'))host.innerHTML='<div class="screen-share-note">'+(visible.length?'Transmissões exibidas nos perfis.':'Nenhuma tela compartilhada.')+'</div>';
  }

  function seatSizeKey(seat){return `tronoSeatCameraSize${seat}`;}
  function applyStoredSeatSize(tile,seat){try{const saved=JSON.parse(storage.getItem(seatSizeKey(seat))||'null');if(saved?.w&&saved?.h){tile.style.width=`${saved.w}px`;tile.style.height=`${saved.h}px`;}}catch{}}
  function persistSeatSize(tile,seat){
    const r=tile.getBoundingClientRect();
    if(r.width>90&&r.height>50)storage.setItem(seatSizeKey(seat),JSON.stringify({w:Math.round(r.width),h:Math.round(r.height)}));
  }
  function bindSeatTileResize(tile,seat){
    if(tile.dataset.resizeBound)return;tile.dataset.resizeBound='1';applyStoredSeatSize(tile,seat);
    const grip=tile.querySelector('.seat-camera-resize');
    let resize=null;
    grip?.addEventListener('pointerdown',e=>{
      if(innerWidth<=900)return;
      const r=tile.getBoundingClientRect();
      resize={x:e.clientX,y:e.clientY,w:r.width,h:r.height};
      grip.setPointerCapture?.(e.pointerId);e.preventDefault();e.stopPropagation();
      tile.classList.add('resizing');
    });
    grip?.addEventListener('pointermove',e=>{
      if(!resize)return;
      const maxW=Math.min(560,Math.max(220,innerWidth*.38)),maxH=Math.min(360,Math.max(140,innerHeight*.40));
      const w=Math.max(110,Math.min(maxW,resize.w+(e.clientX-resize.x)));
      const h=Math.max(62,Math.min(maxH,resize.h+(e.clientY-resize.y)));
      tile.style.width=`${Math.round(w)}px`;tile.style.height=`${Math.round(h)}px`;
    });
    const stop=()=>{if(!resize)return;resize=null;tile.classList.remove('resizing');persistSeatSize(tile,seat);};
    grip?.addEventListener('pointerup',stop);grip?.addEventListener('pointercancel',stop);
    // Mantém compatibilidade com o resize nativo do CSS em navegadores que o oferecem.
    tile.addEventListener('pointerup',()=>persistSeatSize(tile,seat));
  }
  function renderSeatMedia(){
    const host=$('seatMediaLayer');if(!host)return;const active=voiceJoined&&panelMode==='floating'&&inGame()&&!inChatHub();host.classList.toggle('active',active);if(!active){host.innerHTML='';return;}
    const me=meId(),players=detailedPlayers().filter(p=>(p.id===me?cameraOn:!!p.camera)&&Number.isInteger(p.seat)&&p.seat>=0&&p.seat<=3),desired=new Set(players.map(p=>p.id));
    for(const old of [...host.querySelectorAll('.seat-camera-tile')])if(!desired.has(old.dataset.peer))old.remove();
    for(const p of players){
      let tile=findPeerTile(host,p.id,'.seat-camera-tile');
      if(!tile){
        tile=document.createElement('div');tile.dataset.peer=p.id;tile.innerHTML='<video autoplay playsinline muted></video><div class="seat-camera-label"><span class="seat-camera-name"></span><span class="seat-camera-mic"></span></div><i class="seat-camera-resize" title="Arraste o canto para redimensionar">↘</i>';host.appendChild(tile);bindSeatTileResize(tile,p.seat);
      }
      tile.className=`seat-camera-tile seat-camera-${p.seat}`;bindSeatTileResize(tile,p.seat);
      const muted=p.id===me?micMuted:!!p.muted,speaking=!muted&&speakingPeers.has(p.id);tile.classList.toggle('speaking',speaking);
      tile.querySelector('.seat-camera-name').textContent=`${p.name}${p.id===me?' • você':''}`;renderVoiceStatus(tile.querySelector('.seat-camera-mic'),muted,p.id===me?deafened:!!p.deafened);
      const stream=cameraStreamForPerson(p),video=tile.querySelector('video');if(personHasLiveCamera(p)){updateVideoElement(video,stream);tile.classList.add('has-video');}else{tile.classList.remove('has-video');if(p.id!==me)scheduleVideoRecovery(p.id);}
    }
  }
  function updateMediaIndicators(){
    const me=meId();
    for(const card of document.querySelectorAll('#voiceRoster .voice-person')){const p=privateVoiceRoster.get(card.dataset.peer);if(!p)continue;const speaking=!(p.id===me?micMuted:p.muted)&&speakingPeers.has(p.id);card.classList.toggle('speaking',speaking);const summary=card.querySelector('.participant-summary');if(summary)summary.textContent=personVoiceSummary(p);}
    for(const tile of document.querySelectorAll('.seat-camera-tile,.camera-tile')){const p=privateVoiceRoster.get(tile.dataset.peer);if(!p)continue;const muted=p.id===me?micMuted:!!p.muted,speaking=!muted&&speakingPeers.has(p.id);tile.classList.toggle('speaking',speaking);renderVoiceStatus(tile.querySelector('.seat-camera-mic'),muted,p.id===me?deafened:!!p.deafened);}
  }

  function joinVoice(){
    if(voiceJoined)return leaveVoice().then(()=>false);
    if(voiceJoinPromise)return voiceJoinPromise;
    const generation=++voiceGeneration;
    const ensureCurrent=()=>{if(generation!==voiceGeneration)throw Object.assign(new Error('Entrada na chamada cancelada.'),{code:'VOICE_CANCELLED'});};
    unlockCallAudio();micMuted=false;deafened=false;mutedBeforeDeafen=false;watchingStreams.clear();hiddenCameras.clear();profileMedia.clear();
    const joining=(async()=>{
      try{
        const choice=await window.TronoNetwork.prepareVoice();ensureCurrent();roomVoiceMode=choice.mode;
        setStatus('Solicitando acesso ao microfone…');await acquireMic({generation});ensureCurrent();
        voiceJoined=true;privateVoiceRoster.clear();voiceRosterInitialized=false;
        mediaTransport=inChatHub()&&roomVoiceMode==='sfu'?'sfu-pending':'p2p';
        window.TronoNetwork?.setVoiceState(true,false,cameraOn,screenSharing,transmissionQuality,announcedTransport());
        playCallSound('join','local');callNotice({kind:'joined',name:'Você'});$('joinVoiceBtn').innerHTML='<span class="call-icon">↩</span><span>Sair da voz</span>';$('muteMicBtn').disabled=false;$('deafenVoiceBtn').disabled=false;$('cameraBtn').disabled=false;if($('screenShareBtn'))$('screenShareBtn').disabled=!inChatHub();
        updateButtons();updateRealtimeUI();setStatus('Conectando o áudio da chamada…','warn');renderVoiceRoster();renderVideoGrid();renderScreenGrid();renderSeatMedia();
        await watchStream(meId(),localStream);ensureCurrent();
        if(inChatHub()&&roomVoiceMode==='sfu'){
          const sfuOk=await startSfuTransport({callGeneration:generation});ensureCurrent();
          if(!sfuOk&&voiceJoined){window.TronoNetwork?.fallbackVoice?.();roomVoiceMode='p2p';mediaTransport='p2p';window.TronoNetwork?.setVoiceState(true,micMuted,cameraOn,screenSharing,transmissionQuality,'p2p');syncPeers();}
        }else syncPeers();
        return voiceJoined;
      }catch(err){
        if(generation!==voiceGeneration||err?.code==='VOICE_CANCELLED')return false;
        await leaveVoice();setStatus(err.message||'Não foi possível abrir o microfone.','error');return false;
      }
    })();
    const tracked=joining.finally(()=>{if(voiceJoinPromise===tracked)voiceJoinPromise=null;});voiceJoinPromise=tracked;return tracked;
  }
  function leaveVoice(reason='leave'){
    if($('screenOptionsDialog')?.open)$('screenOptionsDialog').close();
    window.TronoMosaic?.close();
    // Cancel pending permission/SFU work before releasing the current devices.
    const wasInVoice=voiceJoined;
    voiceGeneration++;micGeneration++;noiseLoading=false;cameraGeneration++;voiceJoinPromise=null;voiceJoined=false;
    window.TronoNetwork?.setVoiceState(false,false,false,false,transmissionQuality,'p2p');closeAllPeers();
    if(transportIsSfu()||transportPending()||sfuSubscriptions.size||sfuLocalPublications.size)void stopSfuTransport({toP2p:true});
    watchingStreams.clear();hiddenCameras.clear();privateVoiceRoster.clear();stopMeter(meId());mediaTransport='p2p';
    for(const key of [...remoteAudio.keys()])removeRemoteAudio(key);updateAudioRecoveryUI();
    cleanupMicCapture(micCapture);micCapture=null;localStream?.getTracks().forEach(t=>t.stop());localStream=null;
    screenGeneration++;window.TronoClips?.sharedStopped?.(localDisplayStream);localDisplayStream?.getTracks().forEach(t=>t.stop());localDisplayStream=null;
    localScreenStream?.getTracks().forEach(t=>t.stop());localScreenStream=null;screenSharing=false;cameraOn=false;localScreenPreviewPaused=false;localScreenCollapsed=false;
    for(const id of [...voiceMeters.keys()])stopMeter(id);meterAudioContext=null;
    if(wasInVoice){playCallSound(reason==='disconnect'?'disconnect':'leave','local');callNotice({kind:reason==='disconnect'?'disconnected':'left',name:'Você',text:reason==='disconnect'?'Você foi desconectado da chamada.':'Você saiu da chamada.'});}voiceRosterInitialized=false;$('joinVoiceBtn').innerHTML='<span class="call-icon">☎</span><span>Entrar na voz</span>';$('muteMicBtn').disabled=true;$('deafenVoiceBtn').disabled=true;$('cameraBtn').disabled=false;if($('screenShareBtn'))$('screenShareBtn').disabled=true;
    micMuted=false;deafened=false;updateButtons();updateRealtimeUI();setStatus('Fora do chat de voz.');renderVoiceRoster();renderVideoGrid();renderScreenGrid();renderSeatMedia();
    return Promise.resolve();
  }
  function applyMicrophoneMute(){localStream?.getAudioTracks().forEach(track=>track.enabled=!micMuted);micCapture?.rawStream.getAudioTracks().forEach(track=>track.enabled=!micMuted);}
  function toggleMute(){if(!voiceJoined||deafened)return;micMuted=!micMuted;applyMicrophoneMute();window.TronoNetwork?.setVoiceState(true,micMuted,cameraOn,screenSharing,transmissionQuality,announcedTransport());updateButtons();renderVoiceRoster();updateMediaIndicators();}
  function toggleDeafen(){
    if(!voiceJoined)return;
    if(!deafened){mutedBeforeDeafen=micMuted;deafened=true;micMuted=true;}else{deafened=false;micMuted=mutedBeforeDeafen;}
    applyMicrophoneMute();for(const [id,audio]of remoteAudio){audio.muted=deafened||remotePlayback.get(id)?.route==='gain';updateRemoteGain(id);}
    if(!deafened)unlockCallAudio();window.TronoNetwork?.setVoiceState(true,micMuted,cameraOn,screenSharing,transmissionQuality,announcedTransport());updateButtons();renderVoiceRoster();updateMediaIndicators();
  }
  async function toggleCamera(){
    if(cameraTogglePending||cameraRequest)return;
    cameraTogglePending=true;updateButtons();
    try{
      if(cameraOn){await disableCamera(true);setStatus('Câmera desligada.','ok');updateButtons();return;}
      if(!voiceJoined){const ok=await joinVoice();if(!ok)return;}
      setStatus('Solicitando acesso à câmera...');await acquireCamera();setStatus(transportIsSfu()?'Câmera publicada no Cloudflare SFU.':'Câmera ligada e distribuída à malha P2P.','ok');updateButtons();
    }catch(err){if(err?.code!=='CAMERA_CANCELLED'){setStatus(cameraErrorMessage(err),'error');renderVideoGrid();renderSeatMedia();}}
    finally{cameraTogglePending=false;updateButtons();}
  }

  function noiseState(){
    const processor=micCapture?.processor,settings=micCapture?.rawStream.getAudioTracks()[0]?.getSettings?.()||{};
    const activeMode=processor?.mode==='gain-only'?null:processor?.mode;
    const mode=noiseLoading?'loading':!voiceJoined?'idle':processor&&processor.ctx.state!=='running'?'paused':activeMode|| (settings.noiseSuppression?'native':'unavailable');
    return {requested:noiseSuppression,mode:noiseSuppression?mode:'off',sampleRate:processor?.ctx.sampleRate||settings.sampleRate||null};
  }
  function updateNoiseButton(){
    updateVoiceLightMode();
    const select=$('noiseModeSelect');if(select){select.value=noiseSuppression?noiseEngine:'off';select.disabled=noiseLoading;}
    const b=$('noiseSuppressionBtn');if(!b)return;const {mode}=noiseState();
    const labels={off:['Desligado','Supressão desligada. O controle de volume continua ativo.'],idle:['Preparado',voiceLightMode?'Modo leve: a redução nativa será solicitada ao entrar na voz.':'O RNNoise será ativado no seu microfone ao entrar na voz.'],loading:['Iniciando…','Carregando o processamento do microfone…'],rnnoise:['RNNoise','RNNoise ativo no seu microfone. Processamento local, antes de enviar a voz.'],native:['Navegador',voiceLightMode?'Modo leve: redução nativa do navegador ativa; RNNoise pausado.':'RNNoise indisponível. A redução nativa do navegador está ativa.'],paused:['Pausado','Processamento pausado. Use Liberar áudio para retomá-lo.'],unavailable:['Indisponível','Não foi possível ativar a supressão. O microfone continua transmitindo.']};
    const [label,detail]=labels[mode];b.disabled=noiseLoading;b.classList.toggle('noise-active',noiseSuppression);b.classList.toggle('danger-active',!noiseSuppression);b.textContent='Supressor: '+label;b.title=detail;b.dataset.engine=mode;b.setAttribute('aria-pressed',String(noiseSuppression));
    if($('noiseSuppressionStatus'))$('noiseSuppressionStatus').textContent=detail;
  }
  async function toggleNoiseSuppression(){
    if(noiseLoading)return;const previous=noiseSuppression;
    noiseSuppression=!noiseSuppression;storage.setItem('tronoNoiseSuppression',noiseSuppression?'1':'0');updateNoiseButton();
    if(voiceJoined){try{await acquireMic();await watchStream(meId(),localStream);setStatus(noiseState().mode==='rnnoise'?'RNNoise ativo no microfone.':noiseSuppression?'Processamento do microfone atualizado.':'Supressor desligado.','ok');}catch(err){noiseSuppression=previous;storage.setItem('tronoNoiseSuppression',previous?'1':'0');updateNoiseButton();if(err?.code!=='VOICE_CANCELLED')setStatus('Não foi possível atualizar o processamento do microfone.','error');}}
  }
  async function setNoiseMode(value){
    if(!window.TronoDesktop||noiseLoading||!['native','rnnoise','off'].includes(value))return;
    const previous={noiseEngine,noiseSuppression,voiceLightMode};noiseEngine=value;noiseSuppression=value!=='off';if(value==='rnnoise')voiceLightMode=false;
    const save=()=>{storage.setItem('mnDesktopNoiseMode',noiseEngine);storage.setItem('tronoNoiseSuppression',noiseSuppression?'1':'0');storage.setItem('tronoVoiceLightMode',voiceLightMode?'1':'0');updateNoiseButton();startTelemetry();};save();
    try{if(voiceJoined){await acquireMic();await watchStream(meId(),localStream);}setStatus(value==='native'?'Redução leve selecionada.':value==='rnnoise'?'RNNoise selecionado.':'Redução de ruído desligada.','ok');}
    catch(err){({noiseEngine,noiseSuppression,voiceLightMode}=previous);save();if(err?.code!=='VOICE_CANCELLED')setStatus('Não foi possível mudar a redução de ruído. A opção anterior foi mantida.','error');}
  }
  function updateVoiceLightMode(){
    const button=$('voiceLightModeBtn');if(button){button.disabled=noiseLoading;button.textContent='Modo leve para jogar: '+(voiceLightMode?'Ligado':'Desligado');button.setAttribute('aria-pressed',String(voiceLightMode));button.classList.toggle('noise-active',voiceLightMode);}
    document.body.classList.toggle('voice-light-mode',voiceLightMode);
  }
  async function toggleVoiceLightMode(){
    if(noiseLoading)return;const previous=voiceLightMode,previousEngine=noiseEngine;
    voiceLightMode=!voiceLightMode;if(window.TronoDesktop&&voiceLightMode&&noiseSuppression){noiseEngine='native';storage.setItem('mnDesktopNoiseMode',noiseEngine);}storage.setItem('tronoVoiceLightMode',voiceLightMode?'1':'0');updateNoiseButton();startTelemetry();
    if(!voiceJoined)return;
    try{await acquireMic();await watchStream(meId(),localStream);setStatus(voiceLightMode?'Modo leve ativo. O RNNoise fica pausado; a redução nativa depende do navegador.':'Modo leve desligado. Preferências de áudio restauradas.','ok');}
    catch(err){voiceLightMode=previous;noiseEngine=previousEngine;if(window.TronoDesktop)storage.setItem('mnDesktopNoiseMode',noiseEngine);storage.setItem('tronoVoiceLightMode',previous?'1':'0');updateNoiseButton();startTelemetry();if(err?.code!=='VOICE_CANCELLED')setStatus('Não foi possível mudar o processamento. O modo anterior foi mantido.','error');}
  }

  function updateButtons(){
    const m=$('muteMicBtn'),d=$('deafenVoiceBtn'),c=$('cameraBtn'),s=$('screenShareBtn');
    if(m)m.innerHTML=`<span class="call-icon">${micMuted?'🔇':'🎙'}</span><span>${micMuted?'Ativar microfone':'Mutar microfone'}</span>`;if(d)d.innerHTML=`<span class="call-icon">${deafened?'🔈':'🔊'}</span><span>${deafened?'Ouvir voz':'Silenciar voz'}</span>`;if(c)c.innerHTML=`<span class="call-icon">${cameraOn?'▧':'▣'}</span><span>${cameraOn?'Desligar câmera':'Ligar câmera'}</span>`;if(s){s.innerHTML=`<span class="call-icon">${screenSharing?'■':'▤'}</span><span>${screenSharing?'Parar compartilhamento':'Compartilhar tela'}</span>`;s.disabled=!voiceJoined||!inChatHub();}
    $('joinVoiceBtn')?.classList.toggle('call-active',voiceJoined);
    if(m){m.disabled=!voiceJoined||deafened;m.title=deafened?'Ative o áudio da chamada para liberar o microfone.':'';}m?.classList.toggle('danger-active',micMuted);d?.classList.toggle('danger-active',deafened);c?.classList.toggle('camera-active',cameraOn);s?.classList.toggle('screen-active',screenSharing);updateNoiseButton();
    document.body.classList.toggle('call-connected',voiceJoined);
    const textOnly=inChatHub()&&chatRoomState?.channelType==='text'&&!voiceJoined;for(const id of ['joinVoiceBtn','cameraBtn','screenShareBtn'])if($(id))$(id).disabled=textOnly||(id==='screenShareBtn'&&(!voiceJoined||!inChatHub()));
    if(c)c.disabled=textOnly||cameraTogglePending||!!cameraRequest;
    if($('cameraInputSelect'))$('cameraInputSelect').disabled=cameraTogglePending||!!cameraRequest;
    window.dispatchEvent(new CustomEvent('trono-call-change',{detail:{joined:voiceJoined,deafened,roomId:roomState?.id}}));
  }
  async function changeInput(e){selectedInput=e.target.value||'';storage.setItem('tronoVoiceInput',selectedInput);if(voiceJoined){try{await acquireMic();await watchStream(meId(),localStream);setStatus('Microfone alterado.','ok');}catch(err){setStatus('Não foi possível trocar o microfone.','error');}}}
  async function changeOutput(e){selectedOutput=e.target.value||'';lastOutputError='';storage.setItem('tronoVoiceOutput',selectedOutput);for(const a of remoteAudio.values())await applyOutput(a);const ctx=ensureMediaAudioContext();if(ctx?.setSinkId)try{await ctx.setSinkId(selectedOutput);}catch{lastOutputError='Não foi possível trocar a saída amplificada.';}for(const id of remoteAudio.keys())attachRemoteAudio(id);if(!lastOutputError)setStatus(selectedOutput?'Saída de áudio alterada.':'Usando saída padrão.','ok');renderTelemetry();}
  async function changeCamera(e){if(cameraRequest)return;selectedCamera=e.target.value||'';storage.setItem('tronoCameraInput',selectedCamera);if(cameraOn){try{await acquireCamera();setStatus('Câmera alterada.','ok');}catch(err){if(err?.code!=='CAMERA_CANCELLED')setStatus(cameraErrorMessage(err),'error');}}}

  function consumeVoiceRoster(list=[]){
    if(!voiceJoined)return;
    const before=new Set(privateVoiceRoster.keys()),next=new Map();for(const p of list)if(p?.id)next.set(p.id,{id:p.id,name:p.name,avatar_preset:p.avatar_preset||'crown',avatar_file_id:p.avatar_file_id||null,seat:p.seat,joined:true,muted:!!p.muted,deafened:!!p.deafened,camera:!!p.camera,screen:!!p.screen,transport:p.transport||'p2p',quality:p.quality||'balanced'});
    if(voiceRosterInitialized&&!voiceEventsSupported){for(const id of next.keys())if(id!==meId()&&!before.has(id))playCallSound('join',id);for(const id of before)if(id!==meId()&&!next.has(id))playCallSound('leave',id);}else voiceRosterInitialized=true;
    privateVoiceRoster.clear();for(const [id,p] of next)privateVoiceRoster.set(id,p);syncPeers();
  }
  function consumeChatRoom(room){
    if(room?.id!==chatRoomState?.id){chatUploadController?.abort();pendingChatFile=null;if($('chatFileInput'))$('chatFileInput').value='';attachmentStatus();}
    chatRoomState=room||null;
    document.body.classList.toggle('channel-text-active',inChatHub()&&room?.channelType==='text');
    document.body.classList.toggle('channel-voice-active',inChatHub()&&room?.channelType==='voice');
    if(room||voiceJoined)showForRoom(true);
    if(inChatHub()&&room?.channelType==='text')toggleTextChat(true);
    updateChatDrawerUI();updateButtons();
  }
  function consumeRoom(room){
    if(room?.id!==roomState?.id)roomVoiceMode=null;
    roomState=room||null;
    if(roomState)showForRoom(true);
    else if(!voiceJoined){privateVoiceRoster.clear();closeAllPeers();if(transportIsSfu()||transportPending())void stopSfuTransport({toP2p:true});}
    if(!room||room.id===window.TronoNetwork.currentRoom)consumeChatRoom(room);
    updateButtons();updatePublicPresence();renderVoiceRoster();renderVideoGrid();renderScreenGrid();renderSeatMedia();
  }

  function allTelemetryPeerConnections(){
    const list=[];let i=0;
    for(const [id,pc] of peers)if(pc&&pc.connectionState!=='closed')list.push([`p2p:${id}:${i++}`,pc]);
    for(const [kind,pub] of sfuLocalPublications)if(pub?.pc&&pub.pc.connectionState!=='closed')list.push([`sfu-pub:${kind}`,pub.pc]);
    for(const [key,sub] of sfuSubscriptions)if(sub?.pc&&sub.pc.connectionState!=='closed')list.push([`sfu-sub:${key}`,sub.pc]);
    return list;
  }
  function statKind(stat){return stat.kind||stat.mediaType||'';}
  function rateFromStat(key,bytes,ts){
    const prev=telemetryPrev.get(key);telemetryPrev.set(key,{...(prev||{}),bytes:Number(bytes)||0,ts:Number(ts)||performance.now()});
    if(!prev||!Number.isFinite(prev.bytes)||!Number.isFinite(prev.ts))return 0;
    const dt=Math.max(1,(Number(ts)||performance.now())-prev.ts),delta=Math.max(0,(Number(bytes)||0)-prev.bytes);return delta*8*1000/dt;
  }
  function lossFromStat(key,received,lost,ts){
    const stateKey=`loss:${key}`,prev=telemetryPrev.get(stateKey),cur={received:Number(received)||0,lost:Math.max(0,Number(lost)||0),ts:Number(ts)||performance.now()};telemetryPrev.set(stateKey,cur);
    if(!prev)return {lost:0,total:0};const dr=Math.max(0,cur.received-prev.received),dl=Math.max(0,cur.lost-prev.lost);return {lost:dl,total:dr+dl};
  }
  function formatRate(v){if(!Number.isFinite(v)||v<=0)return '—';if(v>=1e6)return `${(v/1e6).toFixed(v>=1e7?1:2)} Mbps`;return `${Math.round(v/1000)} Kbps`;}
  function formatResolution(w,h){return w&&h?`${w}×${h}`:'—';}
  function limiterLabel(reason){return ({cpu:'CPU / codificação',bandwidth:'Banda / congestionamento',other:'Outro fator',none:'Nenhum'})[reason]||'Não informado';}
  function audioPlaybackInfo(){
    const received=[...remoteAudio.entries()].filter(([key])=>!key.startsWith('stream:'));
    const expected=detailedPlayers().filter(p=>p.id!==meId()&&p.joined).length;
    if(!voiceJoined)return {label:'Fora da chamada',expected,count:0};
    if(deafened)return {label:'Voz silenciada neste aparelho',expected,count:received.length,problem:true};
    if(outputVolume===0)return {label:'Volume de saída em 0%',expected,count:received.length,problem:true};
    if(received.some(([key])=>blockedAudio.has(key)))return {label:'Reprodução bloqueada pelo navegador',expected,count:received.length,problem:true};
    if(received.some(([key,a])=>remotePlayback.get(key)?.route!=='gain'&&a.paused))return {label:'Reprodução pausada',expected,count:received.length,problem:true};
    if(received.length&&received.every(([key])=>(peerVolumes.get(key)??100)===0))return {label:'Volume dos participantes em 0%',expected,count:received.length,problem:true};
    if(!received.length)return {label:expected?'Aguardando áudio dos participantes':'Aguardando outro participante',expected,count:0};
    const boosted=received.some(([key])=>remotePlayback.get(key)?.route==='gain');
    return {label:boosted?'Reproduzindo com amplificação':'Reproduzindo áudio direto',expected,count:received.length};
  }
  function assessTelemetry(t){
    const playback=audioPlaybackInfo();
    if(playback.problem||lastOutputError)return {level:'warn',label:'Confira a reprodução de áudio',detail:'saída local',recommendation:lastOutputError?`Saída de áudio: ${lastOutputError}. Confira o dispositivo em Configurações → Áudio.`:`${playback.label}. Confira o volume e use Liberar áudio se o navegador bloqueou a reprodução.`};
    if(voiceJoined&&announcedTransport()==='sfu-pending')return {level:'neutral',label:'Conectando áudio',detail:'negociando',recommendation:'Aguardando a conexão de voz. O microfone já foi aberto, mas a rota de mídia ainda está sendo negociada.'};
    if(voiceJoined&&transportIsSfu()&&[...sfuSubscriptions.values()].some(sub=>sub.negotiating))return {level:'warn',label:'Mídia conectando',detail:'negociando receptor',recommendation:'A conexão de rede já pode estar pronta enquanto o receptor termina a negociação. Aguarde a reprodução iniciar.'};
    if(voiceJoined&&allTelemetryPeerConnections().some(([,pc])=>['new','connecting'].includes(pc.connectionState)))return {level:'warn',label:'Áudio conectando',detail:'aguardando rota',recommendation:'Ainda há uma ponta conectando. Se persistir, confira o último erro SFU e a disponibilidade de TURN.'};
    if(!voiceJoined||!allTelemetryPeerConnections().length)return {level:'neutral',label:'Aguardando mídia',detail:'sem fluxo',recommendation:'Entre na chamada e ative câmera ou compartilhamento para medir a conexão.'};
    if(['failed','disconnected'].includes(t.pcState))return {level:'poor',label:'Mídia desconectada',detail:t.pcState,recommendation:lastSfuError?`Falha SFU: ${lastSfuError}. Em redes móveis/restritivas, habilite o TURN da Cloudflare.`:'A rota WebRTC caiu. Tente reconectar; em redes móveis/restritivas, habilite TURN.'};
    const desired=screenSharing?qualityProfile().screen.fps:qualityProfile().camera.fps;
    const lowFps=desired>=30&&t.outFps>0&&t.outFps<desired*.58;
    if(t.lossPct>=8||t.rttMs>=450||t.jitterMs>=100||lowFps){const captureIssue=lowFps&&t.limiter==='none'&&t.lossPct<3&&t.rttMs<180;return {level:'poor',label:'Conexão crítica',detail:t.rttMs?`${Math.round(t.rttMs)} ms`:'instável',recommendation:captureIssue?'A rede está saudável, mas a origem está codificando poucos quadros. Reduza resolução ou feche aplicações pesadas.':t.limiter==='cpu'?'A CPU está limitando a codificação. Reduza resolução/FPS ou feche aplicações pesadas.':t.limiter==='bandwidth'||t.lossPct>=8?'A rede está limitando a mídia. Reduza a qualidade ou teste outra conexão.':'FPS/latência fora do ideal. Teste uma qualidade menor e confira CPU/rede.'};}
    if(lastSfuError&&mediaTransport==='sfu')return {level:'warn',label:'SFU reconectando',detail:t.rttMs?`${Math.round(t.rttMs)} ms`:'tentando rota',recommendation:`${lastSfuError}. A publicação local pode estar saudável mesmo quando um receptor ainda não conseguiu assinar a mídia.`};
    if(playback.expected&&playback.count<playback.expected)return {level:'warn',label:'Aguardando áudio remoto',detail:`${playback.count}/${playback.expected} receptores`,recommendation:'Ainda falta abrir o áudio de um participante. Uma publicação local conectada não confirma a recepção nos dois sentidos.'};
    if(t.lossPct>=3||t.rttMs>=220||t.jitterMs>=50||t.limiter==='cpu'||t.limiter==='bandwidth')return {level:'warn',label:'Conexão sob atenção',detail:t.rttMs?`${Math.round(t.rttMs)} ms`:'oscilando',recommendation:t.limiter==='cpu'?'Codificação limitada por CPU; considere baixar a qualidade.':t.limiter==='bandwidth'?'WebRTC detectou limitação de banda; a qualidade pode oscilar.':'Há perda/jitter acima do ideal; acompanhe antes de aumentar a qualidade.'};
    return {level:'good',label:'Rede saudável',detail:t.rttMs?`${Math.round(t.rttMs)} ms`:'estável',recommendation:'Sem gargalo de rede detectado. Confira também Reprodução de voz e Saída de áudio: tráfego recebido não confirma som audível no dispositivo.'};
  }
  function renderTelemetry(){
    const t=telemetrySnapshot||{transport:mediaTransport,rttMs:0,uploadBps:0,downloadBps:0,outFps:0,inFps:0,outW:0,outH:0,inW:0,inH:0,lossPct:0,jitterMs:0,limiter:'none'};const health=assessTelemetry(t),modeState=voiceJoined?announcedTransport():mediaTransport;
    const set=(id,v)=>{const el=$(id);if(el)el.textContent=v;};
    const playback=audioPlaybackInfo(),output=$('voiceOutputSelect');
    set('telemetryAppVersion',window.TronoDesktop?.version||window.TronoNetwork?.CLIENT_VERSION||'0.8.0-alpha');
    set('telemetryPlayback',playback.label);set('telemetryVoiceReceivers',`${playback.count} de ${playback.expected}`);
    set('telemetryAudioContext',mediaAudioContext?.state||'Áudio direto');
    set('telemetryOutput',lastOutputError||((output?.options&&[...output.options].find(o=>o.value===selectedOutput)?.textContent)||(selectedOutput?'Dispositivo escolhido':'Saída padrão')));
    set('telemetryTransport',modeState==='sfu-pending'?'Conectando áudio…':modeState==='sfu'?'Cloudflare SFU':'WebRTC P2P');set('telemetryRtt',t.rttMs?`${Math.round(t.rttMs)} ms`:'—');set('telemetryUpload',formatRate(t.uploadBps));set('telemetryDownload',formatRate(t.downloadBps));set('telemetryOutFps',t.outFps?`${Math.round(t.outFps)} FPS`:'—');set('telemetryInFps',t.inFps?`${Math.round(t.inFps)} FPS`:'—');set('telemetryOutResolution',formatResolution(t.outW,t.outH));set('telemetryInResolution',formatResolution(t.inW,t.inH));set('telemetryLoss',Number.isFinite(t.lossPct)?`${t.lossPct.toFixed(t.lossPct>=10?1:2)}%`:'—');set('telemetryJitter',t.jitterMs?`${Math.round(t.jitterMs)} ms`:'—');set('telemetryLimiter',limiterLabel(t.limiter));set('telemetryPcState',t.pcState||'—');set('telemetryIceRoute',t.iceRoute||'—');set('telemetryTurn',sfuTurnActive?'TURN disponível':'STUN direto');set('telemetrySfuError',lastSfuError||'Nenhum');set('telemetryHeroLabel',health.label);set('telemetryRecommendation',health.recommendation);set('telemetryHealthLabel',health.label.replace('Conexão ',''));set('telemetryHealthDetail',health.detail);
    for(const id of ['telemetryHeroDot']){const el=$(id);if(el)el.className=`telemetry-dot ${health.level}`;}
    const pill=$('telemetryStatusPill');if(pill)pill.className=`connection-health ${health.level}`;
    const transport=$('chatOnlyTransport');if(transport){transport.textContent=modeState==='sfu-pending'?'⌁ Conectando…':modeState==='sfu'?'☁ SFU':'↔ P2P';transport.classList.toggle('sfu',modeState==='sfu');}
  }
  function updateTelemetryHeader(){renderTelemetry();}
  async function collectTelemetry(){
    if(telemetryCollecting)return;telemetryCollecting=true;
    try{
    const pcs=allTelemetryPeerConnections();if(!voiceJoined||!pcs.length){telemetrySnapshot=null;renderTelemetry();return;}
    let uploadBps=0,downloadBps=0,rttSum=0,rttCount=0,jitterSum=0,jitterCount=0,lossLost=0,lossTotal=0,outFps=0,inFps=0,outW=0,outH=0,inW=0,inH=0,iceRoute='',pcState='';const limiters=[];
    for(const [pcKey,pc] of pcs){
      if(pc.connectionState&&pc.connectionState!=='new')pcState=pc.connectionState;let report;try{report=await pc.getStats();}catch{continue;}
      report.forEach(stat=>{
        const kind=statKind(stat),ts=stat.timestamp||performance.now(),key=`${pcKey}:${stat.id}`;
        if(stat.type==='outbound-rtp'&&!stat.isRemote){uploadBps+=rateFromStat(`tx:${key}`,stat.bytesSent,ts);if(kind==='video'){if(Number(stat.framesPerSecond)>outFps)outFps=Number(stat.framesPerSecond)||0;if((Number(stat.frameWidth)||0)*(Number(stat.frameHeight)||0)>outW*outH){outW=Number(stat.frameWidth)||0;outH=Number(stat.frameHeight)||0;}if(stat.qualityLimitationReason&&stat.qualityLimitationReason!=='none')limiters.push(stat.qualityLimitationReason);}}
        if(stat.type==='inbound-rtp'&&!stat.isRemote){downloadBps+=rateFromStat(`rx:${key}`,stat.bytesReceived,ts);const loss=lossFromStat(key,stat.packetsReceived,stat.packetsLost,ts);lossLost+=loss.lost;lossTotal+=loss.total;if(Number.isFinite(stat.jitter)){jitterSum+=Number(stat.jitter)*1000;jitterCount++;}if(kind==='video'){if(Number(stat.framesPerSecond)>inFps)inFps=Number(stat.framesPerSecond)||0;if((Number(stat.frameWidth)||0)*(Number(stat.frameHeight)||0)>inW*inH){inW=Number(stat.frameWidth)||0;inH=Number(stat.frameHeight)||0;}}}
        if(stat.type==='candidate-pair'&&stat.state==='succeeded'&&(stat.nominated||stat.selected)){if(Number.isFinite(stat.currentRoundTripTime)){rttSum+=Number(stat.currentRoundTripTime)*1000;rttCount++;}const lc=report.get(stat.localCandidateId);if(lc?.candidateType)iceRoute=lc.candidateType==='relay'?'TURN relay':lc.candidateType==='srflx'?'STUN / srflx':lc.candidateType;}
        if(stat.type==='remote-inbound-rtp'&&Number.isFinite(stat.roundTripTime)){rttSum+=Number(stat.roundTripTime)*1000;rttCount++;}
      });
    }
    if(!outFps){const track=screenSharing?localScreenStream?.getVideoTracks?.()[0]:localStream?.getVideoTracks?.()[0],settings=track?.getSettings?.()||{};outFps=Number(settings.frameRate)||0;outW=outW||Number(settings.width)||0;outH=outH||Number(settings.height)||0;}
    const limiter=limiters.includes('cpu')?'cpu':limiters.includes('bandwidth')?'bandwidth':limiters[0]||'none';
    telemetrySnapshot={transport:mediaTransport,rttMs:rttCount?rttSum/rttCount:0,uploadBps,downloadBps,outFps,inFps,outW,outH,inW,inH,lossPct:lossTotal?lossLost/lossTotal*100:0,jitterMs:jitterCount?jitterSum/jitterCount:0,limiter,iceRoute,pcState};renderTelemetry();
    }finally{telemetryCollecting=false;}
  }
  function startTelemetry(){
    clearTimeout(telemetryTimer);const generation=++telemetrySchedule;
    const tick=async()=>{if(generation!==telemetrySchedule)return;try{if(document.visibilityState!=='hidden')await collectTelemetry();}catch(err){console.warn('[TronoSocial] diagnóstico de mídia',err);}finally{if(generation===telemetrySchedule)telemetryTimer=setTimeout(tick,voiceLightMode&&!telemetryOpen?10000:2000);}};
    void tick();
  }

  function bindFloatingDrag(){
    const panel=$('socialPanel'),handle=$('socialDragHandle');if(!panel||!handle)return;let drag=null;
    handle.addEventListener('pointerdown',e=>{if(panelMode!=='floating'||inChatHub()||e.target.closest('button'))return;const r=panel.getBoundingClientRect();drag={dx:e.clientX-r.left,dy:e.clientY-r.top};handle.setPointerCapture?.(e.pointerId);e.preventDefault();});
    handle.addEventListener('pointermove',e=>{if(!drag||panelMode!=='floating'||inChatHub())return;const maxX=Math.max(0,innerWidth-panel.offsetWidth),maxY=Math.max(0,innerHeight-panel.offsetHeight);panel.style.left=`${Math.max(0,Math.min(maxX,e.clientX-drag.dx))}px`;panel.style.top=`${Math.max(0,Math.min(maxY,e.clientY-drag.dy))}px`;panel.style.right='auto';panel.style.bottom='auto';});
    const stop=()=>{if(!drag)return;drag=null;persistFloatingRect();};handle.addEventListener('pointerup',stop);handle.addEventListener('pointercancel',stop);
  }
  function bindFloatingResize(){
    const panel=$('socialPanel'),grip=$('socialResizeGrip');if(!panel||!grip)return;let resize=null;
    grip.addEventListener('pointerdown',e=>{if(panelMode!=='floating'||inChatHub()||innerWidth<=760)return;const r=panel.getBoundingClientRect();resize={x:e.clientX,y:e.clientY,w:r.width,h:r.height,left:r.left,top:r.top};grip.setPointerCapture?.(e.pointerId);panel.classList.add('resizing');e.preventDefault();e.stopPropagation();});
    grip.addEventListener('pointermove',e=>{if(!resize)return;const maxW=Math.max(330,innerWidth-resize.left-4),maxH=Math.max(330,innerHeight-resize.top-4);panel.style.width=`${Math.max(330,Math.min(maxW,resize.w+(e.clientX-resize.x)))}px`;panel.style.height=`${Math.max(330,Math.min(maxH,resize.h+(e.clientY-resize.y)))}px`;panel.style.right='auto';panel.style.bottom='auto';});
    const stop=()=>{if(!resize)return;resize=null;panel.classList.remove('resizing');persistFloatingRect();};grip.addEventListener('pointerup',stop);grip.addEventListener('pointercancel',stop);
    grip.addEventListener('dblclick',e=>{e.stopPropagation();storage.removeItem(FLOATING_RECT_KEY);clearFloatingInlineStyles();});
  }

  function bind(){
    $('socialBtn')?.addEventListener('click',()=>showPanel(!panelOpen));$('roomSocialBtn')?.addEventListener('click',()=>showPanel(!panelOpen));$('chatOnlyOpenSocialBtn')?.addEventListener('click',()=>showPanel(true));$('socialCloseBtn')?.addEventListener('click',()=>showPanel(false));$('socialModeBtn')?.addEventListener('click',togglePanelMode);$('socialMiniDock')?.addEventListener('click',()=>showPanel(true));
    $('chatOnlyTextBtn')?.addEventListener('click',()=>toggleTextChat());$('mnSidebarTextBtn')?.addEventListener('click',()=>toggleTextChat(true));$('chatDrawerCloseBtn')?.addEventListener('click',()=>toggleTextChat(false));
    $('olderChatMessages')?.addEventListener('click',()=>{if(chatHistoryBefore&&window.TronoNetwork.requestChatHistory(chatHistoryBefore))$('olderChatMessages').disabled=true;});
    $('returnToVoiceRoom')?.addEventListener('click',()=>{const id=window.TronoNetwork.primaryRoom;for(const button of document.querySelectorAll('[data-chat-channel]'))if(button.dataset.chatChannel===id){button.click();break;}});
    $('attachFileBtn')?.addEventListener('click',()=>{if(window.TronoNetwork?.currentRoom)$('chatFileInput').click();else attachmentStatus('Entre em um canal para anexar arquivos.');});
    $('chatFileInput')?.addEventListener('change',e=>{const file=e.target.files[0];if(!file)return;const max=/\.(mp4|webm)$/i.test(file.name)?100_000_000:10_000_000;if(!file.size||file.size>max){pendingChatFile=null;e.target.value='';attachmentStatus(`Limite: ${window.TronoFiles.size(max)} por arquivo.`);return;}pendingChatFile=file;attachmentStatus(`${file.name} · ${window.TronoFiles.size(file.size)}. Clique em enviar.`,true);});
    $('courtChatSend')?.addEventListener('click',sendChat);$('muteTextBtn')?.addEventListener('click',toggleTextMute);$('emojiBtn')?.addEventListener('click',ev=>{ev.stopPropagation();toggleEmojiPicker();});if($('muteTextBtn')){$('muteTextBtn').textContent=chatMuted?'Ativar chat':'Silenciar chat';$('muteTextBtn').classList.toggle('danger-active',chatMuted);}
    $('courtChatInput')?.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendChat();}});
    $('joinVoiceBtn')?.addEventListener('click',joinVoice);$('muteMicBtn')?.addEventListener('click',toggleMute);$('deafenVoiceBtn')?.addEventListener('click',toggleDeafen);$('cameraBtn')?.addEventListener('click',toggleCamera);$('screenShareBtn')?.addEventListener('click',toggleScreenShare);$('voiceSettingsBtn')?.addEventListener('click',()=>toggleVoiceSettings());$('voiceSettingsClose')?.addEventListener('click',()=>toggleVoiceSettings(false));$('noiseSuppressionBtn')?.addEventListener('click',toggleNoiseSuppression);$('voiceSfxBtn')?.addEventListener('click',toggleVoiceSfx);$('voiceMusicBtn')?.addEventListener('click',toggleVoiceMusic);$('refreshDevicesBtn')?.addEventListener('click',enumerateDevices);$('telemetryStatusPill')?.addEventListener('click',()=>toggleTelemetry());$('telemetryOpenBtn')?.addEventListener('click',()=>toggleTelemetry());$('telemetryCloseBtn')?.addEventListener('click',()=>toggleTelemetry(false));
    document.querySelectorAll('[data-settings-tab]').forEach(btn=>btn.addEventListener('click',()=>setSettingsTab(btn.dataset.settingsTab)));
    $('micGainSlider')?.addEventListener('input',e=>setMicrophoneGain(e.target.value));
    $('outputGainSlider')?.addEventListener('input',e=>setOutputGain(e.target.value));
    $('resumeAudioBtn')?.addEventListener('click',()=>{unlockCallAudio();if(voiceJoined&&!micCapture?.processor)void acquireMic().then(()=>watchStream(meId(),localStream)).catch(err=>setStatus(err.message,'warn'));});
    $('voiceMusicTrackSelect')?.addEventListener('change',e=>window.TronoAudio?.setMusicTrack(e.target.value));
    $('voiceMusicVolume')?.addEventListener('input',e=>{window.TronoAudio?.setMusicVolume(e.target.value);updateVoiceMusicUI();});
    $('screenFormatSelect')?.addEventListener('change',async e=>{if(!SCREEN_FORMATS[e.target.value])return;screenFormat=e.target.value;storage.setItem('mnScreenFormat',screenFormat);updateQualityUI();await applyQualityToLiveMedia();});
    $('screenOptionsForm').addEventListener('submit',confirmScreenOptions);$('screenOptionsCancel').onclick=()=>$('screenOptionsDialog').close();
    $('shareStreamAudio')?.addEventListener('change',e=>{shareStreamAudio=!!e.target.checked;storage.setItem('mnShareStreamAudio',shareStreamAudio?'1':'0');setStatus('Preferência de áudio aplicada ao próximo compartilhamento.','ok');});
    $('voiceRoster')?.addEventListener('input',e=>{if(e.target.matches('[data-peer-volume]'))setPeerGain(e.target.dataset.peerVolume,e.target.value);});
    $('screenBitrateSelect')?.addEventListener('change',async e=>{const value=Number(e.target.value);if(!SCREEN_BITRATES.includes(value))return;screenBitrateMbps=value;storage.setItem('mnScreenBitrate',String(value));updateQualityUI();await applyQualityToLiveMedia();if(transportIsSfu())await window.TronoNetwork.requestSfu('set-screen-bitrate',{screenBitrate:effectiveScreenBitrate()}).catch(err=>setStatus(err.message,'warn'));setStatus(`Tela configurada para até ${value} Mbps.`,'ok');});
    $('screenContentSelect')?.addEventListener('change',async e=>{screenContent=e.target.value==='motion'?'motion':'detail';storage.setItem('mnScreenContent',screenContent);await applyQualityToLiveMedia();});
    $('voiceInputSelect')?.addEventListener('change',changeInput);$('voiceOutputSelect')?.addEventListener('change',changeOutput);$('cameraInputSelect')?.addEventListener('change',changeCamera);$('transmissionQualitySelect')?.addEventListener('change',changeTransmissionQuality);
    $('noiseModeSelect')?.addEventListener('change',e=>void setNoiseMode(e.target.value));
    $('voiceLightModeBtn')?.addEventListener('click',toggleVoiceLightMode);
    if($('callAlertVolume'))$('callAlertVolume').value=callAlertVolume;if($('callAlertVolumeValue'))$('callAlertVolumeValue').textContent=`${callAlertVolume}%`;
    $('callAlertVolume')?.addEventListener('input',e=>{callAlertVolume=Math.max(0,Math.min(100,Number(e.target.value)||0));storage.setItem('mnCallAlertVolume',String(callAlertVolume));$('callAlertVolumeValue').textContent=`${callAlertVolume}%`;primeCallSounds();});$('testCallAlert')?.addEventListener('click',()=>{primeCallSounds();playCallSound('join','test');});
    window.TronoNetwork?.onMessage(msg=>{
      if(msg.type==='welcome'){voiceEventsSupported=!!msg.features?.voiceEvents;void syncRealtimeStatus({quiet:true});}
      if(msg.type==='connection'&&msg.connected)void syncRealtimeStatus({quiet:true});
      if(msg.type==='joined-room'){consumeRoom(msg.room);void syncRealtimeStatus({quiet:true});}
      if(msg.type==='joined-text-channel')consumeChatRoom(msg.room);
      if(msg.type==='room-state'){if(msg.room?.id===window.TronoNetwork.primaryRoom)consumeRoom(msg.room);else if(msg.room?.id===window.TronoNetwork.currentRoom)consumeChatRoom(msg.room);}
      if(msg.type==='channel-deleted'&&msg.roomId===roomState?.id){void leaveVoice();roomState=null;updateButtons();}
      if(msg.type==='error'&&['CHAT_HISTORY_UNAVAILABLE','CHAT_HISTORY_RATE'].includes(msg.code)){if($('olderChatMessages'))$('olderChatMessages').disabled=false;const failed=msg.failedMessage,input=$('courtChatInput');if(failed?.roomId===window.TronoNetwork.currentRoom&&input&&!input.value)input.value=failed.text||'';if((failed?.roomId||msg.roomId)===window.TronoNetwork.currentRoom)attachmentStatus(msg.message);}
      if(msg.type==='chat-history'&&msg.roomId===window.TronoNetwork.currentRoom)loadHistory(msg.messages||[],msg);
      if(msg.type==='chat-message'&&msg.message?.roomId===window.TronoNetwork.currentRoom)appendChat(msg.message);
      if(msg.type==='voice-mode'&&msg.roomId===roomState?.id){roomVoiceMode=msg.mode;if(voiceJoined&&msg.mode==='p2p'&&(transportIsSfu()||transportPending()))void fallbackToP2p(msg.reason||'Chamada sincronizada em P2P.');}
      if(msg.type==='voice-roster')consumeVoiceRoster(msg.players||[]);
      if(msg.type==='voice-event'&&msg.roomId===roomState?.id&&msg.playerId!==meId()){callNotice(msg);playCallSound(msg.kind==='joined'?'join':msg.kind==='disconnected'?'disconnect':'leave',msg.playerId);}
      if(msg.type==='realtime-status')void applyRealtimeStatus(msg);
      if(msg.type==='sfu-publications'){
        sfuPublicationList=Array.isArray(msg.publications)?msg.publications:[];
        if(transportIsSfu())void syncSfuSubscriptions();
      }
      if(msg.type==='voice-state'&&voiceJoined){
        const was=privateVoiceRoster.has(msg.playerId),old=privateVoiceRoster.get(msg.playerId)||{id:msg.playerId,name:msg.name,seat:msg.seat};
        if(msg.joined)privateVoiceRoster.set(msg.playerId,{...old,joined:true,muted:!!msg.muted,deafened:!!msg.deafened,camera:!!msg.camera,screen:!!msg.screen,transport:msg.transport||old.transport||'p2p',quality:msg.quality||old.quality||'balanced'});else privateVoiceRoster.delete(msg.playerId);
        if(!voiceEventsSupported&&voiceRosterInitialized&&msg.playerId!==meId()&&was!==!!msg.joined)playCallSound(msg.joined?'join':'leave',msg.playerId);
        syncPeers();
      }
      if(msg.type==='voice-signal'&&!transportIsSfu()&&!transportPending())handleSignal(msg);
      if(msg.type==='player-left'&&msg.roomId===roomState?.id){
        const wasInCall=privateVoiceRoster.has(msg.playerId);privateVoiceRoster.delete(msg.playerId);
        if(!voiceEventsSupported&&voiceJoined&&voiceRosterInitialized&&wasInCall&&msg.playerId!==meId())playCallSound('leave',msg.playerId);
        closePeer(msg.playerId);
        if(transportIsSfu()){
          for(const kind of ['audio','camera','screen','screen-audio']){const key=sfuKey(msg.playerId,kind);if(sfuSubscriptions.has(key))void closeSfuSubscription(key);}
          sfuPublicationList=sfuPublicationList.filter(p=>p.ownerId!==msg.playerId);void syncSfuSubscriptions();
        }
        renderVoiceRoster();renderVideoGrid();renderScreenGrid();renderSeatMedia();
      }
      if(msg.type==='connection'&&!msg.connected){
        realtimeSyncError='Servidor desconectado';realtimeStatus=null;
        void leaveVoice('disconnect');
        setStatus('Servidor desconectado. Recarregue a página para entrar na voz novamente.','error');
      }
      if(msg.type==='game-started'||msg.type==='game-state')setTimeout(renderSeatMedia,0);
    });
    navigator.mediaDevices?.addEventListener?.('devicechange',enumerateDevices);window.addEventListener('resize',renderSeatMedia);window.addEventListener('trono-audio-state',updateAudioPreferenceButtons);document.addEventListener('click',e=>{if(emojiOpen&&!e.target.closest('#emojiPicker')&&!e.target.closest('#emojiBtn'))toggleEmojiPicker(false);});document.addEventListener('keydown',e=>{if(e.key==='Escape'){const maximized=document.querySelector('.media-maximized');if(maximized){maximized.classList.remove('media-maximized');document.body.classList.remove('media-focus-open');void setSfuTileLayer(maximized,false);}else if(emojiOpen)toggleEmojiPicker(false);else if(telemetryOpen)toggleTelemetry(false);else if(inChatHub()&&chatDrawerOpen)toggleTextChat(false);else if(settingsOpen)toggleVoiceSettings(false);}});document.addEventListener('fullscreenchange',()=>{document.body.classList.toggle('native-fullscreen-media',!!document.fullscreenElement);if(!document.fullscreenElement){renderVideoGrid();renderScreenGrid();}if(transportIsSfu()&&!document.fullscreenElement)void updateAllSfuSubscriptionLayers();});bindFloatingDrag();bindFloatingResize();applyPanelMode();populateEmojiPicker();renderGainValues();updateChatDrawerUI();setSettingsTab(settingsTab);updateAudioPreferenceButtons();enumerateDevices();updateQualityUI();updateButtons();updatePublicPresence();renderVoiceRoster();renderVideoGrid();renderScreenGrid();renderSeatMedia();startRealtimeStatusSync();startTelemetry();
    document.addEventListener('pointerdown',()=>{primeCallSounds();if(voiceJoined)unlockCallAudio();});
    document.addEventListener('keydown',()=>{if(voiceJoined)unlockCallAudio();});
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&voiceJoined){for(const key of remoteAudio.keys())attachRemoteAudio(key);updateAudioRecoveryUI();}});
    window.addEventListener('trono-music-track',updateVoiceMusicUI);updateVoiceMusicUI();
    let previousWide=innerWidth>1000;window.addEventListener('resize',()=>{const wide=innerWidth>1000;if(previousWide&&!wide&&chatRoomState?.channelType!=='text')toggleTextChat(false);previousWide=wide;});
  }
  window.addEventListener('DOMContentLoaded',bind);

  return {
    showPanel,showForRoom,consumeRoom,consumeChatRoom,joinVoice,leaveVoice,renderVideoGrid,renderScreenGrid,renderSeatMedia,setChatHubMode,clearChannelChat,toggleTelemetry,toggleVoiceSettings,setSettingsTab,startScreenShare,stopScreenShare,switchScreenShare,openScreenOptions,
    get voiceJoined(){return voiceJoined;},get cameraOn(){return cameraOn;},get screenSharing(){return screenSharing;},get voiceLightMode(){return voiceLightMode;},get noiseSuppression(){return noiseSuppression;},get noiseMode(){return noiseSuppression?noiseEngine:"off";},get noiseState(){return noiseState();},get transmissionQuality(){return transmissionQuality;},get panelMode(){return panelMode;},
    get mediaTransport(){return mediaTransport;},get realtimeStatus(){return realtimeStatus?{...realtimeStatus}:null;},get telemetry(){return telemetrySnapshot?{...telemetrySnapshot}:null;},
    getLocalDisplayStream(){return screenSharing?localDisplayStream:null;},
    getLocalAudioTrack(){return localStream?.getAudioTracks?.()[0]||null;}
    ,get screenSettings(){return {...SCREEN_FORMATS[screenFormat],bitrate:effectiveScreenBitrate(),audio:shareStreamAudio};}
    ,get deafened(){return deafened;},toggleWatchStream,toggleWatchCamera,fullscreenMedia,
    getMediaSources(){return voiceJoined?detailedPlayers().filter(p=>p.camera||p.screen||(p.id===meId()&&(cameraOn||screenSharing))).map(p=>({id:p.id,name:p.name,self:p.id===meId(),camera:(p.id===meId()?cameraOn:p.camera&&!hiddenCameras.has(p.id))?cameraStreamForPerson(p):null,cameraOffered:p.id===meId()?cameraOn:!!p.camera,cameraHidden:hiddenCameras.has(p.id),screen:(p.id===meId()?screenSharing:watchingStreams.has(p.id))?screenStreamForPerson(p):null,screenOffered:p.screen,watching:p.id===meId()||watchingStreams.has(p.id)})):[];}
  };
})();
