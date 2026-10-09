'use strict';
window.TronoSoundboard=(()=>{
  const $=id=>document.getElementById(id),storage=window.TronoStorage||localStorage;
  let sounds=[],volume=70,player=null,generation=0,uploadController=null,previewUrl=null;
  const volumeKey=()=> 'mnSoundVolume:'+(window.TronoAuth.user?.id||'guest');
  function notice(text){$('soundboardMessage').textContent=text;}
  function stop(){generation++;if(player){player.pause();player.removeAttribute('src');player.load();player=null;}if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl=null;}}
  function controls(){
    const canPlay=!!window.TronoAuth.user&&window.TronoSocial.voiceJoined;
    for(const button of $('soundboardList').querySelectorAll('[data-play-sound]'))button.disabled=!canPlay;
    $('soundboardCallHint').textContent=canPlay?'Os efeitos tocam para quem está nesta chamada.':'Entre na voz para tocar um efeito para a chamada.';
    $('soundboardVolume').value=volume;$('soundboardVolumeValue').textContent=volume+'%';
  }
  async function playFile(file,{local=false}={}){
    stop();const version=generation;
    try{const link=await window.TronoFiles.url(file.id);if(version!==generation||(!local&&!window.TronoSocial.voiceJoined))return;
      player=new Audio(link);player.volume=window.TronoSocial.deafened&&!local?0:volume/100;
      await player.play();if(local)notice('Prévia tocando somente para você.');
    }catch(e){if(version===generation)notice(e.name==='NotAllowedError'?'O navegador bloqueou o áudio. Abra Efeitos e clique em Ouvir.':e.message);}
  }
  function render(){
    const host=$('soundboardList');host.replaceChildren();
    for(const file of sounds){
      const card=document.createElement('article');card.className='sound-card';const name=document.createElement('strong');name.textContent=file.name.replace(/\.wav$/i,'');const duration=document.createElement('small');duration.textContent=(file.durationMs/1000).toFixed(1)+' s';
      const play=document.createElement('button');play.type='button';play.dataset.playSound=file.id;play.className='sound-play';play.textContent='▶ Tocar na chamada';play.onclick=()=>{if(!window.TronoNetwork.playSound(file.id))notice('Servidor desconectado.');};
      const preview=document.createElement('button');preview.type='button';preview.className='sound-preview';preview.textContent='Ouvir';preview.setAttribute('aria-label','Ouvir prévia de '+file.name);preview.onclick=()=>playFile(file,{local:true});
      card.append(name,duration,play,preview);
      if(file.ownerId===window.TronoAuth.user?.id||window.TronoAuth.user?.permissions?.moderateFiles){const del=document.createElement('button');del.type='button';del.className='sound-delete';del.textContent='Excluir';del.onclick=async()=>{if(!confirm('Excluir o efeito “'+file.name+'”?'))return;del.disabled=true;try{await window.TronoFiles.remove(file.id);sounds=sounds.filter(s=>s.id!==file.id);render();}catch(e){notice(e.message);del.disabled=false;}};card.appendChild(del);}
      host.appendChild(card);
    }
    if(!sounds.length){const empty=document.createElement('p');empty.className='sound-empty';empty.textContent='Dê um som à conversa. Envie seu primeiro efeito.';host.appendChild(empty);}
    controls();
  }
  async function refresh(){
    let offset=0,list=[];
    for(;;){const data=await window.TronoFiles.api('/soundboard?offset='+offset);list.push(...data.files);if(!data.hasMore)break;offset=data.nextOffset;}
    sounds=list;render();
  }
  async function open(){
    if(!window.TronoAuth.user){window.TronoAuth.open('login');return;}
    $('soundboardDialog').showModal();controls();notice('Carregando efeitos…');
    try{await refresh();notice('');}catch(e){notice(e.message);}
  }
  function encodeWav(buffer){
    const channels=Math.min(2,buffer.numberOfChannels),rate=buffer.sampleRate,frames=buffer.length;
    if(rate<8000||rate>48000||!frames||frames>rate*15)throw Error('O efeito deve ter no máximo 15 segundos.');
    const out=new ArrayBuffer(44+frames*channels*2),view=new DataView(out),write=(at,text)=>{for(let i=0;i<text.length;i++)view.setUint8(at+i,text.charCodeAt(i));};
    write(0,'RIFF');view.setUint32(4,out.byteLength-8,true);write(8,'WAVEfmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,channels,true);view.setUint32(24,rate,true);view.setUint32(28,rate*channels*2,true);view.setUint16(32,channels*2,true);view.setUint16(34,16,true);write(36,'data');view.setUint32(40,out.byteLength-44,true);
    const samples=Array.from({length:channels},(_,i)=>buffer.getChannelData(i));let at=44;
    for(let frame=0;frame<frames;frame++)for(let channel=0;channel<channels;channel++){const value=Math.max(-1,Math.min(1,samples[channel][frame]));view.setInt16(at,value<0?value*32768:value*32767,true);at+=2;}
    return new Blob([out],{type:'audio/wav'});
  }
  async function upload(e){
    e.preventDefault();if(uploadController)return;const file=$('soundFile').files[0],name=$('soundName').value.trim();
    if(!file||!name)return;if(file.size>20_000_000){notice('Escolha um áudio de até 20 MB e 15 segundos.');return;}
    const userId=window.TronoAuth.user?.id;uploadController=new AbortController();$('soundUpload').disabled=true;let context;
    try{
      notice('Preparando áudio…');context=new AudioContext({sampleRate:48000});const decoded=await context.decodeAudioData(await file.arrayBuffer());const blob=encodeWav(decoded);
      if(uploadController.signal.aborted||window.TronoAuth.user?.id!==userId)throw Error('Envio cancelado.');
      const sound=new File([blob],name+'.wav',{type:'audio/wav'});
      await window.TronoFiles.upload(sound,{kind:'soundboard',signal:uploadController.signal,onProgress:n=>notice('Enviando: '+n+'%')});$('soundUploadForm').reset();await refresh();notice('Efeito adicionado à biblioteca.');
    }catch(err){notice(err.message||'Formato não suportado pelo navegador.');}finally{await context?.close();uploadController=null;$('soundUpload').disabled=false;}
  }
  function readVolume(){try{const saved=Number(storage.getItem(volumeKey())??70);volume=Number.isFinite(saved)?Math.max(0,Math.min(100,saved)):70;}catch{volume=70;}controls();}
  function bind(){
    $('soundboardBtn').onclick=open;$('soundboardClose').onclick=()=>$('soundboardDialog').close();$('soundUploadForm').onsubmit=upload;$('soundStop').onclick=stop;
    $('soundboardDialog').addEventListener('close',()=>{uploadController?.abort();stop();});
    $('soundboardVolume').oninput=e=>{volume=Number(e.target.value);storage.setItem(volumeKey(),String(volume));if(player)player.volume=window.TronoSocial.deafened?0:volume/100;controls();};
    window.addEventListener('trono-auth-change',()=>{stop();uploadController?.abort();readVolume();if(!window.TronoAuth.user&&$('soundboardDialog').open)$('soundboardDialog').close();});
    window.addEventListener('trono-role-change',render);
    window.addEventListener('trono-call-change',e=>{controls();if(!e.detail.joined)stop();else if(player)player.volume=e.detail.deafened?0:volume/100;});
    window.TronoNetwork.onMessage(message=>{
      if(message.type==='soundboard-play'&&message.roomId===window.TronoNetwork.currentRoom&&window.TronoSocial.voiceJoined)void playFile(message.file);
      if(message.type==='error'&&['SOUND_RATE','SOUND_UNAVAILABLE','STORAGE_UNCONFIGURED'].includes(message.code))notice(message.message);
      if(message.type==='attachment-deleted'){sounds=sounds.filter(s=>s.id!==message.id);render();}
      if(message.type==='channel-deleted'||message.type==='connection'&&!message.connected)stop();
    });readVolume();
  }
  window.addEventListener('DOMContentLoaded',bind);
  return {open,encodeWav,stop};
})();
