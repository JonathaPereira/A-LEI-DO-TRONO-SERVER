'use strict';
// The website has no desktop privileges. This adapter exists only when the
// installed app exposes its fixed, isolated preload API.
if(window.TronoDesktop){
  window.TronoDesktopClips=(()=>{
    const native=window.TronoDesktop;let active=false,last='',queue=Promise.resolve();
    function status(text){const host=document.getElementById('clipDesktopStatus');if(host)host.textContent=text;}
    native.onClip(()=>window.TronoClips?.clip());
    function configure(value){const signature=JSON.stringify(value);if(signature===last)return;last=signature;queue=queue.catch(()=>{}).then(async()=>{const answer=await native.configureClips(value);active=answer.active;status(answer.error|| (active?'Atalho integrado ativo: '+answer.shortcut+'. Pode continuar no jogo.':'Atalho integrado · aguardando o replay da tela.'));}).catch(()=>{active=false;last='';status('Não foi possível registrar o atalho. Escolha outro nas preferências.');});}
    window.addEventListener('DOMContentLoaded',()=>{for(const id of ['clipDesktopCode','clipDesktopConnect','clipDesktopDisconnect'])document.getElementById(id)?.setAttribute('hidden','');document.querySelector('.clip-desktop-panel>strong').textContent='Windows · integrado ao aplicativo';document.getElementById('clipDesktopCode')?.parentElement.setAttribute('hidden','');status('Atalho integrado ao aplicativo. Compartilhe a tela para preparar o replay.');});
    return {configure,disconnect(){configure({active:false});},saved(){},get connected(){return true;},get globalActive(){return active;}};
  })();
  let selection=null,capturing=false;
  const getDisplayMedia=navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getDisplayMedia=async options=>{
    if(capturing)throw new DOMException('Já existe uma escolha de captura em andamento.','InvalidStateError');
    capturing=true;selection=null;let stream,chosen;
    try{
      stream=await getDisplayMedia(options);chosen=selection?await selection:null;
      if(chosen?.error)throw Error(chosen.error);
      if(chosen?.audio){const pipe=await window.TronoApplicationAudio.create(chosen.audio);stream.addTrack(pipe.track);const video=stream.getVideoTracks()[0],stop=video.stop.bind(video);video.stop=()=>{stop();void pipe.close();};video.addEventListener('ended',()=>void pipe.close(),{once:true});}
      return stream;
    }catch(error){stream?.getTracks().forEach(track=>track.stop());chosen=chosen||(selection?await selection.catch(()=>null):null);if(chosen?.audio)await window.TronoDesktop.stopApplicationAudio(chosen.audio.id).catch(()=>{});if(chosen?.error)throw Error(chosen.error);throw error;}
    finally{capturing=false;selection=null;}
  };
  window.addEventListener('DOMContentLoaded',()=>{
    const picker=document.createElement('dialog');picker.className='feature-dialog desktop-capture-dialog';picker.setAttribute('aria-label','Escolher tela ou janela');
    picker.innerHTML='<header><div><span class="section-eyebrow">CAPTURA LOCAL OU COMPARTILHAMENTO</span><h2>Qual tela ou janela?</h2></div><button type="button" class="dialog-close" aria-label="Cancelar captura">×</button></header><div class="desktop-capture-sources"></div><div class="desktop-audio-options"><label>Áudio<select id="desktopAudioMode"><option value="none">Sem áudio</option><option value="application">Aplicativo escolhido · isolado</option><option value="system">Computador inteiro</option></select></label><label id="desktopAudioSourceLabel">Aplicativo para o áudio da tela<select id="desktopAudioSource"></select></label></div><p class="desktop-capture-help"></p><p id="desktopCaptureMessage" role="status"></p><div class="dialog-actions"><button id="desktopCaptureConfirm" type="button" class="primary-button" disabled>Iniciar captura</button></div>';
    document.body.append(picker);let current=null,source=null;
    const mode=picker.querySelector('#desktopAudioMode'),audioSource=picker.querySelector('#desktopAudioSource'),confirm=picker.querySelector('#desktopCaptureConfirm'),message=picker.querySelector('#desktopCaptureMessage');
    function audioUI(){picker.querySelector('#desktopAudioSourceLabel').hidden=mode.value!=='application'||!!source?.startsWith('window:');picker.querySelector('.desktop-capture-help').textContent=mode.value==='system'?'Áudio do computador inteiro pode incluir as vozes da chamada e causar eco.':mode.value==='application'?'Somente o aplicativo escolhido e seus processos de áudio serão capturados. Abas do mesmo navegador podem compartilhar processos; prefira a janela do jogo.':'Captura sem áudio. Áudio isolado por aplicativo requer Windows 11 ou Windows build 20348 ou superior.';}
    async function select(selected){const choice=current;if(!choice)return;
      if(selected&&mode.value==='application'&&!selected.startsWith('window:')&&!audioSource.value){message.textContent='Escolha o aplicativo para o áudio desta tela ou selecione Sem áudio.';audioSource.focus();return;}
      current=null;picker.close();selection=window.TronoDesktop.selectCapture({id:choice.id,source:selected,audioMode:choice.audio?mode.value:'none',audioSource:audioSource.value});await selection;
    }
    picker.querySelector('.dialog-close').onclick=()=>void select(null);picker.addEventListener('cancel',event=>{event.preventDefault();void select(null);});confirm.onclick=()=>void select(source);mode.onchange=audioUI;
    window.TronoDesktop.onCapture(request=>{
      current=request;source=null;confirm.disabled=true;message.textContent='';const list=picker.querySelector('.desktop-capture-sources');list.replaceChildren();
      mode.querySelector('[value="application"]').disabled=!request.applicationAudio;mode.querySelector('[value="system"]').disabled=!request.windows;mode.value=request.applicationAudio&&request.audio?'application':'none';picker.querySelector('.desktop-audio-options').hidden=!request.audio;
      audioSource.replaceChildren(new Option('Escolha um aplicativo',''));for(const item of request.sources)if(item.id.startsWith('window:'))audioSource.append(new Option(item.name,item.id));
      for(const item of request.sources){const button=document.createElement('button');button.type='button';button.setAttribute('aria-pressed','false');const image=document.createElement('img');image.src=item.thumbnail;image.alt='';const label=document.createElement('span');label.textContent=item.name;button.append(image,label);button.onclick=()=>{source=item.id;for(const b of list.children)b.setAttribute('aria-pressed',String(b===button));confirm.disabled=false;message.textContent='';audioUI();};list.append(button);}
      if(!request.sources.length){const empty=document.createElement('p');empty.textContent='Nenhuma tela ou janela disponível. Feche e tente novamente.';list.append(empty);}
      audioUI();if(!picker.open)picker.showModal();
    });
    window.TronoDesktop.onCaptureCancel(request=>{if(current?.id===request.id){current=null;picker.close();}});
  });
}
