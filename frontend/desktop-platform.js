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
  window.addEventListener('DOMContentLoaded',()=>{
    const picker=document.createElement('dialog');picker.className='feature-dialog desktop-capture-dialog';picker.setAttribute('aria-label','Escolher tela ou janela');
    picker.innerHTML='<header><div><span class="section-eyebrow">COMPARTILHAMENTO</span><h2>Qual tela ou janela?</h2></div><button type="button" class="dialog-close" aria-label="Cancelar compartilhamento">×</button></header><div class="desktop-capture-sources"></div><label class="feature-checkbox"><input type="checkbox"> Incluir o áudio do computador</label><p class="desktop-capture-help">Nesta primeira versão, o áudio pode incluir sons dos outros aplicativos e as vozes da chamada. A captura de áudio isolado por jogo será uma próxima etapa.</p>';
    document.body.append(picker);let current=null;
    async function select(source,audio=false){const choice=current;if(!choice)return;current=null;picker.close();await window.TronoDesktop.selectCapture({id:choice.id,source,audio});}
    picker.querySelector('button').onclick=()=>void select(null);picker.addEventListener('cancel',event=>{event.preventDefault();void select(null);});
    window.TronoDesktop.onCapture(request=>{
      current=request;const list=picker.querySelector('.desktop-capture-sources');list.replaceChildren();
      const audio=picker.querySelector('input');audio.checked=false;audio.closest('label').hidden=!request.audio||!request.windows;picker.querySelector('.desktop-capture-help').hidden=!request.audio||!request.windows;
      for(const source of request.sources){const button=document.createElement('button');button.type='button';const image=document.createElement('img');image.src=source.thumbnail;image.alt='';const label=document.createElement('span');label.textContent=source.name;button.append(image,label);button.onclick=()=>void select(source.id,audio.checked);list.append(button);}
      if(!request.sources.length){const empty=document.createElement('p');empty.textContent='Nenhuma tela ou janela disponível. Feche e tente novamente.';list.append(empty);}
      if(!picker.open)picker.showModal();
    });
    window.TronoDesktop.onCaptureCancel(request=>{if(current?.id===request.id){current=null;picker.close();}});
  });
}
