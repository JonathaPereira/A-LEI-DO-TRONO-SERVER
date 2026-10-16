'use strict';
if(window.TronoDesktop)window.addEventListener('DOMContentLoaded',()=>{
  const native=window.TronoDesktop,check=document.getElementById('desktopUpdateCheck'),banner=document.createElement('aside');let manual=false,state={status:'idle'};
  banner.className='desktop-update-banner';banner.hidden=true;banner.setAttribute('role','status');
  const text=document.createElement('span'),restart=document.createElement('button'),refresh=document.createElement('button'),close=document.createElement('button');restart.type=refresh.type=close.type='button';restart.textContent='Reiniciar e atualizar';restart.hidden=true;refresh.textContent='Buscar última versão';refresh.hidden=true;close.textContent='×';close.setAttribute('aria-label','Fechar aviso de atualização');banner.append(text,restart,refresh,close);document.body.append(banner);
  function render(value){const previous=state.status;state=value;const ready=state.status==='ready';restart.hidden=!ready;refresh.hidden=!ready;
    const label=ready?'Atualização pronta':state.status==='downloading'?'Baixando · '+state.percent+'%':'Windows '+native.version;
    check.querySelector('span').textContent=label;check.setAttribute('aria-label',label+' · Buscar versão mais recente');
    check.title=ready?'Atualizar diretamente para '+(state.version||'a versão mais recente'):'Buscar versão mais recente';
    restart.textContent=state.version?'Instalar '+state.version+' e reiniciar':'Reiniciar e atualizar';
    const target=state.version?'de '+native.version+' direto para '+state.version:'direto para a versão mais recente';
    text.textContent=ready?(state.message||'Atualização '+target+' pronta. Será instalada ao sair do app, ou você pode reiniciar agora.'):state.status==='downloading'?'Atualizando '+target+' · '+state.percent+'%':state.status==='checking'?'Buscando a versão mais recente…':state.status==='current'?'Você está na versão mais recente.':state.status==='development'?'Atualizador disponível na versão instalada.':state.message||'Verificar atualizações';
    if(manual||ready&&previous!=='ready')banner.hidden=false;
  }
  refresh.onclick=check.onclick=async()=>{manual=true;banner.hidden=false;try{render(await native.checkUpdates());}catch{render({status:'error',message:'Não foi possível verificar atualizações agora.'});}};
  restart.onclick=async()=>{restart.disabled=true;try{const result=await native.installUpdate();if(result?.pending)render(await native.getUpdateState());}catch{render({status:'error',message:'Não foi possível reiniciar para atualizar. Tente novamente.'});}finally{restart.disabled=false;}};
  close.onclick=()=>{manual=false;banner.hidden=true;};native.onUpdateState(render);void native.getUpdateState().then(render).catch(()=>{});
});
