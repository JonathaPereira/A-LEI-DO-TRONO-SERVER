'use strict';
window.TronoRecorder = (()=>{
  const $=id=>document.getElementById(id);
  let recorder=null,displayStream=null,mixContext=null,chunks=[],startedAt=0,timerId=null,pendingDirectory=null,pendingDirectoryPromise=null,stopping=false;

  function notify(message,kind=''){
    const el=document.createElement('div');el.className=`recorder-toast ${kind}`;el.textContent=message;document.body.appendChild(el);requestAnimationFrame(()=>el.classList.add('show'));setTimeout(()=>{el.classList.remove('show');setTimeout(()=>el.remove(),250);},3600);
  }
  function formatTime(ms){const total=Math.max(0,Math.floor(ms/1000)),m=Math.floor(total/60),s=total%60;return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;}
  function updateUi(active,phase='idle'){
    const btn=$('recordMatchBtn'),notice=$('recordingNotice'),stopBtn=$('recordingStopBtn'),label=$('recordingNoticeLabel'),help=$('recordingNoticeHelp');
    const stoppingNow=phase==='stopping';
    if(btn){btn.classList.toggle('recording',active||stoppingNow);btn.disabled=stoppingNow;btn.textContent=stoppingNow?'… Finalizando':active?'■ Parar gravação':'⏺ Gravar';}
    notice?.classList.toggle('hidden',!(active||stoppingNow));
    if(stopBtn){stopBtn.disabled=stoppingNow;stopBtn.textContent=stoppingNow?'…':'■ Parar';}
    if(label)label.textContent=stoppingNow?'FINALIZANDO':'GRAVANDO';
    if(help)help.textContent=stoppingNow?'Aguarde o arquivo ser preparado.':'Clique em Parar quando quiser encerrar.';
    if(active){clearInterval(timerId);timerId=setInterval(()=>{if($('recordingTimer'))$('recordingTimer').textContent=formatTime(Date.now()-startedAt);},500);}else if(!stoppingNow){clearInterval(timerId);timerId=null;if($('recordingTimer'))$('recordingTimer').textContent='00:00';}
  }
  function bestMime(){const types=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'];return types.find(t=>MediaRecorder.isTypeSupported?.(t))||'';}

  async function buildRecordingStream(){
    displayStream=await navigator.mediaDevices.getDisplayMedia({video:{frameRate:{ideal:30,max:30},displaySurface:'browser'},audio:true,preferCurrentTab:true,selfBrowserSurface:'include'});
    const out=new MediaStream();const video=displayStream.getVideoTracks()[0];if(!video)throw new Error('Nenhuma imagem foi selecionada para gravação.');out.addTrack(video);
    const audioTracks=[...displayStream.getAudioTracks()];const localMic=window.TronoSocial?.getLocalAudioTrack?.();if(localMic&&localMic.readyState==='live')audioTracks.push(localMic);
    if(audioTracks.length){
      const Ctx=window.AudioContext||window.webkitAudioContext;
      if(Ctx){mixContext=new Ctx({latencyHint:'playback'});try{if(mixContext.state==='suspended')await mixContext.resume();}catch{}
        const dest=mixContext.createMediaStreamDestination();
        for(const track of audioTracks){try{const source=mixContext.createMediaStreamSource(new MediaStream([track]));source.connect(dest);}catch(err){console.warn('[TronoRecorder] áudio',err);}}
        const mixed=dest.stream.getAudioTracks()[0];if(mixed)out.addTrack(mixed);
      }else if(audioTracks[0])out.addTrack(audioTracks[0].clone());
    }
    return out;
  }

  async function start(){
    if(recorder?.state==='recording')return;
    if(!navigator.mediaDevices?.getDisplayMedia||!window.MediaRecorder){notify('Este navegador não oferece gravação de tela pelo site.','error');return;}
    try{
      const stream=await buildRecordingStream();chunks=[];pendingDirectory=null;pendingDirectoryPromise=null;stopping=false;
      const mime=bestMime();recorder=new MediaRecorder(stream,mime?{mimeType:mime,videoBitsPerSecond:5_000_000}:undefined);
      recorder.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data);};
      recorder.onerror=e=>notify(`Falha na gravação: ${e.error?.message||'erro desconhecido'}.`,'error');
      recorder.onstop=finalize;
      displayStream.getVideoTracks()[0]?.addEventListener('ended',()=>{if(recorder?.state==='recording')stop(false);},{once:true});
      recorder.start(1000);startedAt=Date.now();updateUi(true);notify('Gravação iniciada. Para registrar o jogo completo, compartilhe esta aba e habilite o áudio da aba.','ok');
    }catch(err){cleanup();if(err?.name!=='NotAllowedError')notify(err.message||'Não foi possível iniciar a gravação.','error');else notify('Gravação cancelada.');}
  }

  async function chooseDirectory(){
    if(typeof window.showDirectoryPicker!=='function')return null;
    try{return await window.showDirectoryPicker({id:'trono-recordings',mode:'readwrite',startIn:'desktop'});}catch(err){if(err?.name!=='AbortError')console.warn('[TronoRecorder] pasta',err);return null;}
  }

  async function stop(promptDirectory=true){
    if(!recorder||!['recording','paused'].includes(recorder.state)||stopping)return;
    stopping=true;
    // O seletor é disparado no clique do usuário para preservar user-activation,
    // mas não aguardamos a escolha antes de parar o MediaRecorder. Assim o botão
    // de parar sempre encerra a captura imediatamente.
    pendingDirectoryPromise=promptDirectory?chooseDirectory():Promise.resolve(null);
    updateUi(false,'stopping');
    try{recorder.requestData?.();}catch{}
    try{recorder.stop();}catch(err){stopping=false;pendingDirectoryPromise=null;updateUi(true);notify(err?.message||'Não foi possível encerrar a gravação.','error');}
  }

  async function saveBlob(blob){
    const stamp=new Date().toISOString().replace(/[:.]/g,'-').replace('T','_').slice(0,19),filename=`A_Lei_do_Trono_${stamp}.webm`;
    if(pendingDirectory){
      try{
        const folder=await pendingDirectory.getDirectoryHandle('A Lei do Trono - Gravações',{create:true});
        const handle=await folder.getFileHandle(filename,{create:true}),writable=await handle.createWritable();await writable.write(blob);await writable.close();
        notify('Gravação salva na pasta “A Lei do Trono - Gravações” dentro da pasta escolhida.','ok');return;
      }catch(err){console.warn('[TronoRecorder] gravação local',err);notify('Não foi possível gravar na pasta escolhida; o arquivo será baixado pelo navegador.','warn');}
    }
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),15000);
    notify('Gravação finalizada. Selecione/mova o arquivo para a Área de Trabalho se o navegador salvou em Downloads.','ok');
  }

  async function finalize(){
    updateUi(false,'stopping');
    try{if(pendingDirectoryPromise)pendingDirectory=await pendingDirectoryPromise;}catch{pendingDirectory=null;}
    const mime=recorder?.mimeType||'video/webm',blob=new Blob(chunks,{type:mime});
    if(blob.size>0)await saveBlob(blob);else notify('A gravação terminou sem dados válidos.','error');cleanup();
  }
  function cleanup(){
    updateUi(false);try{displayStream?.getTracks?.().forEach(t=>t.stop());}catch{}displayStream=null;try{mixContext?.close?.();}catch{}mixContext=null;recorder=null;chunks=[];pendingDirectory=null;pendingDirectoryPromise=null;stopping=false;
  }
  function toggle(){if(stopping){notify('A gravação já está sendo finalizada.','warn');return;}if(recorder&&['recording','paused'].includes(recorder.state))void stop(true);else void start();}
  function bind(){$('recordMatchBtn')?.addEventListener('click',toggle);$('recordingStopBtn')?.addEventListener('click',toggle);window.addEventListener('beforeunload',()=>{try{if(recorder?.state==='recording')recorder.stop();}catch{}});}
  window.addEventListener('DOMContentLoaded',bind);
  return {start,stop,toggle,get recording(){return recorder?.state==='recording';}};
})();
