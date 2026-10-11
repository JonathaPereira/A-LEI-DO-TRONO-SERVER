'use strict';
if(window.TronoDesktop)window.addEventListener('DOMContentLoaded',()=>{
  const native=window.TronoDesktop,check=document.getElementById('desktopUpdateCheck'),banner=document.createElement('aside');let manual=false,state={status:'idle'};
  banner.className='desktop-update-banner';banner.hidden=true;banner.setAttribute('role','status');
  const text=document.createElement('span'),restart=document.createElement('button'),close=document.createElement('button');restart.type=close.type='button';restart.textContent='Reiniciar e atualizar';restart.hidden=true;close.textContent='×';close.setAttribute('aria-label','Fechar aviso de atualização');banner.append(text,restart,close);document.body.append(banner);
  function render(value){const previous=state.status;state=value;const ready=state.status==='ready';restart.hidden=!ready;
    check.textContent=ready?'Atualização pronta':state.status==='downloading'?'Baixando · '+state.percent+'%':'Windows '+native.version;
    check.title=ready?'Clique para reiniciar e atualizar':'Verificar atualização';
    text.textContent=ready?'Nova versão pronta. Será instalada ao sair do app; você também pode reiniciar agora.':state.status==='downloading'?'Baixando atualização · '+state.percent+'%':state.status==='checking'?'Verificando atualizações…':state.status==='current'?'Você está na versão mais recente.':state.status==='development'?'Atualizador disponível na versão instalada.':state.message||'Verificar atualizações';
    if(manual||ready&&previous!=='ready')banner.hidden=false;
  }
  check.onclick=async()=>{manual=true;banner.hidden=false;if(state.status==='ready'){render(state);return;}try{render(await native.checkUpdates());}catch{render({status:'error',message:'Não foi possível verificar atualizações agora.'});}};
  restart.onclick=async()=>{restart.disabled=true;try{await native.installUpdate();}catch{render({status:'error',message:'Não foi possível reiniciar para atualizar. Tente novamente.'});}finally{restart.disabled=false;}};
  close.onclick=()=>{manual=false;banner.hidden=true;};native.onUpdateState(render);void native.getUpdateState().then(render).catch(()=>{});
});
