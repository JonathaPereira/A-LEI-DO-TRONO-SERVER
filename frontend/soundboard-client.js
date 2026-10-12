'use strict';
window.TronoSoundboard=(()=>{
  const $=id=>document.getElementById(id),storage=window.TronoStorage||localStorage;
  let sounds=[],volume=70,player=null,playerFileId=null,localPreview=false,generation=0,uploadController=null,previewUrl=null;
  let clip=null,trimStart=0,trimEnd=0,decodeVersion=0,refreshVersion=0,loading=false,returnFocus=null;
  const volumeKey=()=> 'mnSoundVolume:'+(window.TronoAuth.user?.id||'guest');
  const notice=text=>{$('soundboardMessage').textContent=text;};
  function stop(){
    generation++;
    if(player){player.pause();player.removeAttribute('src');player.load();player=null;}
    playerFileId=null;
    if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl=null;}
  }
  function controls(){
    const canPlay=!!window.TronoAuth.user&&window.TronoSocial.voiceJoined;
    for(const button of $('soundboardList').querySelectorAll('[data-play-sound]'))button.disabled=!canPlay;
    $('soundboardCallHint').textContent=canPlay?'Clique para tocar. Clique novamente para reiniciar na chamada.':'Entre na voz para enviar efeitos. As prévias tocam só para você.';
    $('soundboardVolume').value=volume;$('soundboardVolumeValue').textContent=volume+'%';
    $('soundUpload').disabled=loading||!!uploadController||!clip;
    $('soundTrimPreview').disabled=loading||!!uploadController||!clip;
    $('soundFile').disabled=!!uploadController;
    for(const el of $('soundTrimEditor').querySelectorAll('input'))el.disabled=!!uploadController;
  }
  async function playFile(file,{local=false}={}){
    if(player&&playerFileId===file.id&&localPreview===local){
      const version=++generation;
      try{player.pause();player.currentTime=0;player.volume=window.TronoSocial.deafened&&!local?0:volume/100;await player.play();}
      catch(e){if(version===generation)notice(e.message);}
      return;
    }
    stop();const version=generation;
    try{
      const link=await window.TronoFiles.url(file.id);
      if(version!==generation||(!local&&!window.TronoSocial.voiceJoined))return;
      localPreview=local;playerFileId=file.id;player=new Audio(link);player.volume=window.TronoSocial.deafened&&!local?0:volume/100;
      await player.play();if(local)notice('Prévia tocando somente para você.');
    }catch(e){if(version===generation)notice(e.name==='NotAllowedError'?'Clique em Ouvir para permitir o áudio neste navegador.':e.message);}
  }
  function render(){
    const host=$('soundboardList');host.replaceChildren();
    for(const [index,file] of sounds.entries()){
      const card=document.createElement('article');card.className='sound-card';
      const label=file.name.replace(/\.wav$/i,'');
      const play=document.createElement('button');play.type='button';play.dataset.playSound=file.id;play.className='sound-play';play.title='Tocar '+label+' na chamada';play.setAttribute('aria-label',play.title);
      const icon=document.createElement('span');icon.className='sound-thumbnail';icon.setAttribute('aria-hidden','true');icon.textContent=['♫','✦','♪','⚔'][index%4];
      const name=document.createElement('strong');name.textContent=label;
      const duration=document.createElement('small');duration.textContent=(file.durationMs/1000).toFixed(1)+' s';
      play.append(icon,name,duration);play.onclick=()=>{if(!window.TronoNetwork.playSound(file.id))notice('Servidor desconectado.');};
      const actions=document.createElement('div');actions.className='sound-card-actions';
      const preview=document.createElement('button');preview.type='button';preview.className='sound-preview';preview.textContent='Ouvir';preview.setAttribute('aria-label','Ouvir prévia de '+file.name);preview.onclick=()=>playFile(file,{local:true});actions.appendChild(preview);
      if(file.ownerId===window.TronoAuth.user?.id||window.TronoAuth.user?.permissions?.moderateFiles){
        const del=document.createElement('button');del.type='button';del.className='sound-delete';del.textContent='×';del.setAttribute('aria-label','Excluir efeito '+label);del.title=del.getAttribute('aria-label');
        del.onclick=async()=>{if(!confirm('Excluir o efeito “'+file.name+'”?'))return;del.disabled=true;try{await window.TronoFiles.remove(file.id);sounds=sounds.filter(s=>s.id!==file.id);render();}catch(e){notice(e.message);del.disabled=false;}};actions.appendChild(del);
      }
      card.append(play,actions);host.appendChild(card);
    }
    if(!sounds.length){const empty=document.createElement('p');empty.className='sound-empty';empty.textContent='Adicione um efeito para dar um som à conversa.';host.appendChild(empty);}
    controls();
  }
  async function refresh(){
    const version=++refreshVersion,userId=window.TronoAuth.user?.id;let offset=0,list=[];
    for(;;){const data=await window.TronoFiles.api('/soundboard?offset='+offset);list.push(...data.files);if(!data.hasMore)break;offset=data.nextOffset;}
    if(version===refreshVersion&&userId===window.TronoAuth.user?.id){sounds=list;render();}
  }
  function close({restoreFocus=true}={}){
    if($('soundboardDialog').hidden)return;
    $('soundboardDialog').hidden=true;$('soundboardToggle').setAttribute('aria-expanded','false');
    if(localPreview)stop();
    if(restoreFocus&&returnFocus?.isConnected)returnFocus.focus({preventScroll:true});
  }
  async function open(){
    if(!window.TronoAuth.user){window.TronoAuth.open('login');return;}
    if(!$('soundboardDialog').hidden){close();return;}
    returnFocus=document.activeElement;$('soundboardDialog').hidden=false;
    $('soundboardToggle').setAttribute('aria-expanded','true');
    controls();$('soundboardClose').focus({preventScroll:true});notice('Carregando efeitos…');
    try{await refresh();notice('');}catch(e){notice(e.message);}
  }
  // Encode only selected PCM frames; the server still enforces the 15 second limit.
  function encodeWav(buffer,start=0,end=buffer.duration){
    const channels=Math.min(2,buffer.numberOfChannels),rate=buffer.sampleRate;
    if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end>buffer.duration+.000001||end<=start||end-start>15.000001)throw Error('Selecione um trecho de até 15 segundos.');
    const first=Math.round(start*rate),last=Math.min(buffer.length,Math.round(end*rate)),frames=last-first;
    if(rate<8000||rate>48000||!frames||frames>rate*15)throw Error('Selecione um trecho de até 15 segundos.');
    const out=new ArrayBuffer(44+frames*channels*2),view=new DataView(out),write=(at,text)=>{for(let i=0;i<text.length;i++)view.setUint8(at+i,text.charCodeAt(i));};
    write(0,'RIFF');view.setUint32(4,out.byteLength-8,true);write(8,'WAVEfmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,channels,true);view.setUint32(24,rate,true);view.setUint32(28,rate*channels*2,true);view.setUint16(32,channels*2,true);view.setUint16(34,16,true);write(36,'data');view.setUint32(40,out.byteLength-44,true);
    const samples=Array.from({length:channels},(_,i)=>buffer.getChannelData(i));let at=44;
    for(let frame=first;frame<last;frame++)for(let channel=0;channel<channels;channel++){const value=Math.max(-1,Math.min(1,samples[channel][frame]));view.setInt16(at,value<0?value*32768:value*32767,true);at+=2;}
    return new Blob([out],{type:'audio/wav'});
  }
  function drawWaveform(){
    if(!clip)return;
    const canvas=$('soundWaveform'),ctx=canvas.getContext('2d'),data=clip.getChannelData(0),width=canvas.width,height=canvas.height;
    const style=getComputedStyle(document.documentElement),accent=style.getPropertyValue('--theme-accent').trim()||'#a99cff',muted=style.getPropertyValue('--theme-muted').trim()||'#a5acc8';
    ctx.clearRect(0,0,width,height);ctx.fillStyle=style.getPropertyValue('--theme-bg').trim()||'#0c0e18';ctx.fillRect(0,0,width,height);
    const from=trimStart/clip.duration*width,to=trimEnd/clip.duration*width;
    ctx.fillStyle=accent;ctx.globalAlpha=.2;ctx.fillRect(from,0,to-from,height);ctx.globalAlpha=1;
    for(let x=0;x<width;x+=3){
      const first=Math.floor(x/width*data.length),last=Math.min(data.length,Math.ceil((x+3)/width*data.length));let peak=0;
      const step=Math.max(1,Math.floor((last-first)/80));for(let i=first;i<last;i+=step)peak=Math.max(peak,Math.abs(data[i]));
      const bar=Math.max(3,peak*(height-20));ctx.fillStyle=x>=from&&x<=to?accent:muted;ctx.fillRect(x,(height-bar)/2,2,bar);
    }
    ctx.fillStyle=accent;ctx.fillRect(from,0,2,height);ctx.fillRect(Math.max(0,to-2),0,2,height);
  }
  function renderTrim(){
    if(!clip)return;
    $('soundTrimEditor').hidden=false;
    for(const [id,value] of [['soundTrimStart',trimStart],['soundTrimEnd',trimEnd],['soundTrimStartRange',trimStart],['soundTrimEndRange',trimEnd]]){$(id).max=String(clip.duration);$(id).value=String(Number(value.toFixed(2)));}
    $('soundTrimDuration').textContent=(trimEnd-trimStart).toFixed(2)+' s / 15 s';
    drawWaveform();controls();
  }
  function changeTrim(kind,value){
    if(!clip||uploadController||!Number.isFinite(value))return;
    if(localPreview)stop();
    const minimum=Math.min(.05,clip.duration);
    if(kind==='start'){
      trimStart=Math.max(0,Math.min(value,clip.duration-minimum));
      trimEnd=Math.max(trimStart+minimum,Math.min(trimEnd,trimStart+15,clip.duration));
    }else{
      trimEnd=Math.max(minimum,Math.min(value,clip.duration));
      trimStart=Math.max(0,Math.min(trimStart,trimEnd-minimum));
      if(trimEnd-trimStart>15)trimStart=trimEnd-15;
    }
    renderTrim();
  }
  function resetClip(){decodeVersion++;loading=false;clip=null;trimStart=trimEnd=0;$('soundTrimEditor').hidden=true;controls();}
  async function loadClip(){
    const file=$('soundFile').files[0],version=++decodeVersion;clip=null;$('soundTrimEditor').hidden=true;
    if(localPreview)stop();
    if(!file){loading=false;controls();return;}
    if(file.size>20_000_000){loading=false;controls();notice('Escolha um áudio de até 20 MB.');return;}
    loading=true;controls();notice('Lendo áudio para recortar…');let context;
    try{
      context=new AudioContext({sampleRate:48000});const decoded=await context.decodeAudioData(await file.arrayBuffer());
      if(version!==decodeVersion)return;
      if(!decoded.length)throw Error('O áudio está vazio.');
      clip=decoded;trimStart=0;trimEnd=Math.min(15,clip.duration);
      if(!$('soundName').value.trim())$('soundName').value=file.name.replace(/\.[^.]+$/,'').slice(0,40);
      renderTrim();notice('Áudio de '+clip.duration.toFixed(2)+' s. Ajuste o trecho e ouça antes de enviar.');
    }catch(err){if(version===decodeVersion)notice('Não foi possível ler este áudio. Tente um arquivo MP3, WAV, OGG ou M4A compatível.');}
    finally{await context?.close();if(version===decodeVersion){loading=false;controls();}}
  }
  async function previewTrim(){
    if(!clip)return;stop();localPreview=true;
    try{previewUrl=URL.createObjectURL(encodeWav(clip,trimStart,trimEnd));player=new Audio(previewUrl);player.volume=volume/100;await player.play();notice('Ouvindo somente o trecho selecionado.');}
    catch(err){notice(err.message);}
  }
  async function upload(e){
    e.preventDefault();if(uploadController||loading||!clip)return;
    const name=$('soundName').value.trim();if(!name)return;
    const userId=window.TronoAuth.user?.id,controller=new AbortController();uploadController=controller;controls();
    try{
      const blob=encodeWav(clip,trimStart,trimEnd),sound=new File([blob],name+'.wav',{type:'audio/wav'});
      await window.TronoFiles.upload(sound,{kind:'soundboard',signal:controller.signal,onProgress:n=>notice('Enviando: '+n+'%')});
      if(controller.signal.aborted||window.TronoAuth.user?.id!==userId)return;
      if(localPreview)stop();$('soundUploadForm').reset();resetClip();$('soundUploadDetails').open=false;await refresh();notice('Efeito adicionado à biblioteca.');
    }catch(err){if(window.TronoAuth.user?.id===userId)notice(controller.signal.aborted?'Envio cancelado.':err.message||'Não foi possível enviar o efeito.');}
    finally{if(uploadController===controller)uploadController=null;controls();}
  }
  function readVolume(){try{const saved=Number(storage.getItem(volumeKey())??70);volume=Number.isFinite(saved)?Math.max(0,Math.min(100,saved)):70;}catch{volume=70;}controls();}
  function bind(){
    $('soundboardToggle').onclick=open;$('soundboardToggle').setAttribute('aria-controls','soundboardDialog');$('soundboardToggle').setAttribute('aria-expanded','false');
    $('soundboardClose').onclick=close;$('soundUploadForm').onsubmit=upload;$('soundStop').onclick=stop;$('soundFile').onchange=loadClip;$('soundTrimPreview').onclick=previewTrim;
    for(const [id,kind] of [['soundTrimStart','start'],['soundTrimEnd','end'],['soundTrimStartRange','start'],['soundTrimEndRange','end']])$(id).addEventListener($(id).type==='number'?'change':'input',e=>{if(e.target.value!=='')changeTrim(kind,Number(e.target.value));});
    $('soundWaveform').onclick=e=>{if(!clip)return;const rect=e.currentTarget.getBoundingClientRect(),position=(e.clientX-rect.left)/rect.width*clip.duration;trimEnd=Math.min(clip.duration,position+Math.min(15,trimEnd-trimStart));changeTrim('start',position);};
    $('soundboardVolume').oninput=e=>{volume=Number(e.target.value);storage.setItem(volumeKey(),String(volume));if(player)player.volume=window.TronoSocial.deafened&&!localPreview?0:volume/100;controls();};
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('soundboardDialog').hidden){e.preventDefault();close();}});
    // Decide outside interaction before focus/scroll can move the editor under the pointer.
    document.addEventListener('pointerdown',e=>{if(!$('soundboardDialog').hidden&&!e.target.closest('#soundboardDialog,#soundboardToggle'))close({restoreFocus:false});});
    new MutationObserver(()=>{if(!document.body.classList.contains('chat-only-active'))close({restoreFocus:false});}).observe(document.body,{attributes:true,attributeFilter:['class']});
    window.addEventListener('trono-auth-change',()=>{stop();uploadController?.abort();refreshVersion++;resetClip();sounds=[];render();readVolume();close();});
    window.addEventListener('trono-role-change',render);
    window.addEventListener('trono-theme-change',drawWaveform);
    window.addEventListener('trono-call-change',e=>{controls();if(!e.detail.joined)stop();else if(player)player.volume=e.detail.deafened&&!localPreview?0:volume/100;});
    window.TronoNetwork.onMessage(message=>{
      if(message.type==='soundboard-play'&&message.roomId===window.TronoNetwork.currentRoom&&window.TronoSocial.voiceJoined)void playFile(message.file);
      if(message.type==='error'&&['SOUND_RATE','SOUND_UNAVAILABLE','STORAGE_UNCONFIGURED'].includes(message.code))notice(message.message);
      if(message.type==='attachment-deleted'){if(playerFileId===message.id)stop();sounds=sounds.filter(s=>s.id!==message.id);render();}
      if(message.type==='channel-deleted'||message.type==='connection'&&!message.connected)stop();
    });readVolume();
  }
  window.addEventListener('DOMContentLoaded',bind);
  return {open,close,encodeWav,stop};
})();
