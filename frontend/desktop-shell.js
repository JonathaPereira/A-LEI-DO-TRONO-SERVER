'use strict';
// Navigation changes only the visible area. Existing controllers keep owning
// the game, room, call and clip library; there is no second network connection.
if(window.TronoDesktop)window.addEventListener('DOMContentLoaded',()=>{
  const $=id=>document.getElementById(id),body=document.body;
  body.classList.add('desktop-app');
  const icons={home:'<path d="m3 10 9-7 9 7v10H3z"/><path d="M9 20v-7h6v7"/>',game:'<path d="m3 6 4 4 5-6 5 6 4-4-2 13H5z"/>',community:'<path d="M21 11a8 8 0 0 1-8 8H8l-5 3V11a9 9 0 0 1 18 0Z"/><path d="M8 10h8M8 14h5"/>',clips:'<rect x="3" y="3" width="18" height="18" rx="3"/><path d="m10 8 6 4-6 4zM3 7h18"/>',profile:'<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>'};
  const rail=document.createElement('nav');rail.id='desktopRail';rail.setAttribute('aria-label','Áreas do aplicativo');
  rail.innerHTML='<div class="desktop-brand" title="M&N · A Lei do Trono">M<span>&</span>N</div>';
  for(const [view,label]of [['home','Início'],['game','Jogar'],['community','Comunidade'],['clips','Clipes'],['profile','Perfil']]){
    const button=document.createElement('button');button.type='button';button.dataset.desktopRoute=view;button.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">'+icons[view]+'</svg><span>'+label+'</span>';button.onclick=()=>void navigate(view);rail.append(button);
  }
  const version=document.createElement('small');version.textContent='Windows '+window.TronoDesktop.version;rail.append(version);body.append(rail);
  const dock=document.createElement('footer');dock.id='desktopCallDock';dock.setAttribute('aria-label','Chamada e replay');
  const info=document.createElement('div');info.className='desktop-call-info';info.innerHTML='<small>SEU ESPAÇO, SEM INTERRUPÇÕES</small><strong id="desktopCallName">M&N · pronto para conectar</strong><span id="desktopCallStatus"></span>';
  dock.append(info,$('socialPanel').querySelector('.call-toolbar'));body.append(dock,$('voiceSettingsPanel'));
  const primary=['portalScreen','setupScreen','roomScreen','chatOnlyScreen','gameScreen'];let lastGame='setupScreen',previous='home',clipsOpen=false;
  function setView(view){body.dataset.desktopView=view;for(const b of rail.querySelectorAll('button[data-desktop-route]')){const selected=b.dataset.desktopRoute===view;b.classList.toggle('active',selected);if(selected)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');}}
  function synchronize(){
    const visible=primary.find(id=>!$(id).classList.contains('hidden'));
    if(['setupScreen','roomScreen','gameScreen'].includes(visible))lastGame=visible;
    if(!clipsOpen)setView(visible==='portalScreen'?'home':visible==='chatOnlyScreen'?'community':'game');
  }
  const observer=new MutationObserver(synchronize);for(const id of primary)observer.observe($(id),{attributes:true,attributeFilter:['class']});
  const statusObserver=new MutationObserver(()=>{$('desktopCallStatus').textContent=$('voiceStatus').textContent;$('desktopCallName').textContent=window.TronoSocial?.voiceJoined?'Chamada conectada':'M&N · pronto para conectar';});statusObserver.observe($('voiceStatus'),{childList:true,subtree:true,characterData:true});
  function closeClips(){if(clipsOpen){clipsOpen=false;$('clipsDialog').classList.remove('desktop-clips-page');$('clipsDialog').close();}}
  async function navigate(view){
    if(view==='profile'){(window.TronoAuth?.user?$('accountProfileBtn'):$('accountLoginBtn')).click();return;}
    if(view==='clips'){if(!clipsOpen)previous=body.dataset.desktopView||'home';clipsOpen=true;setView('clips');$('clipsDialog').classList.add('desktop-clips-page');window.TronoClips.open({inline:true});return;}
    closeClips();
    if(view==='home'){window.TronoPortal.showOnly('portalScreen');setView(view);return;}
    if(view==='game'){
      if(!window.TronoAuth?.user&&!window.TronoAuth?.guest){window.TronoPortal.openGame();return;}
      // A community entry may have left a previous game. Do not restore its
      // stale waiting-room UI merely because it was the last game screen.
      if(window.TronoChatHub.channels.some(channel=>channel.id===window.TronoNetwork.primaryRoom))lastGame='setupScreen';
      window.TronoPortal.showOnly(lastGame);window.TronoNetwork.requestRooms();setView(view);return;
    }
    if(view==='community'){
      const room=window.TronoNetwork.currentRoom;
      if(room&&window.TronoChatHub.channels.some(channel=>channel.id===room)){
        window.TronoPortal.showOnly('chatOnlyScreen');body.classList.add('chat-only-active');window.TronoSocial.showForRoom(true);setView(view);return;
      }
      if(room&&!window.confirm('Entrar na comunidade vai sair da sua sala de jogo atual. Continuar?'))return;
      await window.TronoPortal.openVoice();synchronize();
    }
  }
  // Reuse portal entries while protecting an existing room/call from a second
  // enterChatOnly. Going home is navigation, whereas leaving voice stays explicit.
  document.addEventListener('click',event=>{
    const target=event.target.closest('#openVoicePortalBtn,#voicePortalCard,#openGamePortalBtn,#gamePortalCard,#backFromChatOnlyBtn,#portalBrandBtn,.portal-nav-btn,[data-open-clips]');if(!target)return;
    event.preventDefault();event.stopImmediatePropagation();
    const view=target.matches('[data-open-clips]')?'clips':target.matches('#openVoicePortalBtn,#voicePortalCard')||target.dataset.portalTarget==='voice'?'community':target.matches('#openGamePortalBtn,#gamePortalCard')||target.dataset.portalTarget==='game'?'game':'home';void navigate(view);
  },true);
  $('clipClose').onclick=()=>{closeClips();setView(previous);synchronize();};
  $('clipsDialog').addEventListener('close',()=>{if(clipsOpen){clipsOpen=false;$('clipsDialog').classList.remove('desktop-clips-page');synchronize();}});
  window.TronoDesktopShell={navigate};synchronize();$('desktopCallStatus').textContent=$('voiceStatus').textContent;
});
