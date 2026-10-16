'use strict';
// Both arrangements use the same controls, socket and live media tracks.
window.TronoAppLayout=(()=>{
  const $=id=>document.getElementById(id);let current='original',bound=false,lastGame='setupScreen';
  async function navigate(view){
    if(window.TronoDesktopShell)return window.TronoDesktopShell.navigate(view);
    if(view==='home'){window.TronoPortal.showOnly('portalScreen');return;}
    if(view==='game')return window.TronoGames.openLibrary();
    if(view==='throne'){
      if(!window.TronoAuth.user&&!window.TronoAuth.guest)return window.TronoPortal.openGame(true);
      if(!window.TronoNetwork.gameRoom)lastGame='setupScreen';
      window.TronoPortal.showOnly(lastGame);window.TronoNetwork.requestRooms();return;
    }
    const room=window.TronoNetwork.currentRoom;
    if(room&&window.TronoChatHub.channels.some(channel=>channel.id===room)){
      window.TronoPortal.showOnly('chatOnlyScreen');window.TronoSocial.setChatHubMode(true);window.TronoSocial.showForRoom(true);return;
    }
    return window.TronoPortal.openVoice();
  }
  function identity(){
    const user=window.TronoAuth.user,icon=$('layoutUserAvatar');if(!icon)return;
    icon.innerHTML=window.TronoProfile.avatarHtml(user||{});window.TronoProfile.hydrate(icon);
    const name=user?.nickname||window.TronoAuth.guest?.nickname||'Visitante';
    $('layoutUserName').textContent=name;$('layoutUserName').title=name;
    icon.dataset.online=String(!!(user||window.TronoAuth.guest)&&window.TronoNetwork.connected);
    const call=window.TronoSocial;
    $('layoutUserStatus').textContent=call.deafened?'Áudio silenciado':call.voiceJoined?(call.getLocalAudioTrack()?.enabled?'Em voz':'Microfone mutado'):window.TronoNetwork.connected?'Disponível':'Reconectando…';
    syncConnection();
  }
  function syncConnection(){
    const call=window.TronoSocial,panel=$('layoutVoicePanel');if(!panel)return;
    const room=call.voiceRoom,eligible=room&&room.channelType!=='text',joined=call.voiceJoined&&!!eligible,joining=call.voiceJoining&&!joined;
    panel.dataset.state=joining?'connecting':joined?'connected':'disconnected';
    const status=$('voiceStatus'),failed=!joined&&!joining&&status?.dataset.kind==='error';
    $('layoutVoiceLabel').textContent=joining?'Conectando…':joined?'Voz conectada':failed?'Falha ao conectar':'Fora da chamada';
    const channel=failed?status.textContent:eligible?room.name+(room.kind==='game'?' / A Lei do Trono':' / Comunidade M&N'):'Selecione um canal de voz';
    $('layoutVoiceChannel').textContent=channel;$('layoutVoiceChannel').title=channel;
    $('layoutVoiceLocation').disabled=!joined;$('layoutVoiceLocation').title=joined?'Abrir canal de voz: '+room.name:channel;
  }
  async function openVoiceChannel(){
    const call=window.TronoSocial,room=call.voiceRoom;if(!call.voiceJoined||!room)return;
    if(document.body.classList.contains('chat-only-active')&&window.TronoNetwork.currentRoom===room.id)return;
    if(room.kind==='game'){await navigate('throne');return;}
    await navigate('community');
    if(call.voiceJoined&&call.voiceRoom?.id===room.id)await window.TronoChatHub.switchChannel(room.id);
  }
  function syncView(){
    const gameView=['setupScreen','roomScreen','gameScreen'].find(id=>!$(id).classList.contains('hidden'));if(gameView)lastGame=gameView;
    const body=document.body;body.dataset.layoutView=body.classList.contains('chat-only-active')?'community':!$('portalScreen').classList.contains('hidden')?'home':'game';
    for(const button of document.querySelectorAll('#webLayoutRail [data-layout-route]')){const selected=button.dataset.layoutRoute===body.dataset.layoutView;button.classList.toggle('active',selected);if(selected)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');}
  }
  function apply(value,{save=false}={}){
    const next=value==='discord'?'discord':'original';if(!bound)return;
    current=next;document.body.dataset.appLayout=next;
    window.TronoCallControlsLayout.refresh();
    for(const input of document.querySelectorAll('[name=appLayout]'))input.checked=input.value===next;
    if(save){window.TronoPersonal.set('appLayout',next);$('appLayoutStatus').textContent='Layout '+(next==='discord'?'Discord':'Original / Padrão')+' aplicado.';}
    syncView();identity();window.dispatchEvent(new CustomEvent('trono-layout-change',{detail:{layout:next}}));
    // Let existing media/resize controllers measure their new available area.
    window.dispatchEvent(new Event('resize'));
  }
  function read(){apply(window.TronoPersonal.get('appLayout','original'));}
  function bind(){
    const panel=document.createElement('section');panel.id='layoutVoicePanel';panel.setAttribute('aria-label','Sua chamada e seu perfil');
    const connection=document.createElement('section');connection.id='layoutVoiceConnection';connection.setAttribute('aria-label','Conexão de voz');
    connection.innerHTML='<div class="layout-voice-heading"><button id="layoutVoiceLocation" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 12a8 8 0 0 1 8 8M4 7a13 13 0 0 1 13 13M4 2a18 18 0 0 1 18 18"/><circle cx="4" cy="20" r="1"/></svg><span><strong id="layoutVoiceLabel" role="status"></strong><small id="layoutVoiceChannel"></small></span></button><div id="layoutConnectionControls"></div></div>';
    const bar=document.createElement('section');bar.id='layoutUserBar';bar.setAttribute('aria-label','Seu perfil e controles de áudio');
    bar.innerHTML='<button id="layoutProfile" type="button" title="Minha conta e aparência" aria-label="Abrir meu perfil"><span id="layoutUserAvatar" class="community-avatar"></span><span class="layout-user-copy"><strong id="layoutUserName"></strong><small id="layoutUserStatus"></small></span></button><div id="layoutUserControls"></div>';
    const actions=document.createElement('section');actions.id='layoutCallActions';actions.setAttribute('aria-label','Câmera e compartilhamento');connection.append(actions);panel.append(connection,bar);document.body.append(panel);
    $('layoutProfile').onclick=()=>window.TronoDesktopSettings?window.TronoDesktopSettings.open('account'):void window.TronoProfile.open();
    $('layoutVoiceLocation').onclick=()=>void openVoiceChannel();
    new MutationObserver(syncConnection).observe($('voiceStatus'),{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['data-kind']});
    if(!window.TronoDesktop){
      const rail=document.createElement('nav');rail.id='webLayoutRail';rail.setAttribute('aria-label','Áreas M&N');
      rail.innerHTML='<button class="layout-web-home" data-layout-route="home" type="button" aria-label="M&N · Ir para o início" title="Início">M&N</button><button data-layout-route="game" type="button" title="Jogos"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m3 6 4 4 5-6 5 6 4-4-2 13H5z"/></svg><span>Jogos</span></button><button data-layout-route="community" type="button" title="Comunidade"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M21 11a8 8 0 0 1-8 8H8l-5 3V11a9 9 0 0 1 18 0Z"/></svg><span>Comunidade</span></button>';
      rail.addEventListener('click',event=>{const button=event.target.closest('[data-layout-route]');if(button)void navigate(button.dataset.layoutRoute);});document.body.append(rail);
    }
    $('channelHomeBtn').onclick=()=>void navigate('home');
    for(const input of document.querySelectorAll('[name=appLayout]'))input.onchange=()=>{if(input.checked)apply(input.value,{save:true});};
    new MutationObserver(syncView).observe(document.body,{attributes:true,attributeFilter:['class','data-desktop-view']});
    for(const id of ['portalScreen','setupScreen','roomScreen','gameScreen','chatOnlyScreen','gamesScreen','azulScreen','rogueliteScreen','splendorScreen','loveLetterScreen'])new MutationObserver(syncView).observe($(id),{attributes:true,attributeFilter:['class']});
    window.addEventListener('trono-auth-change',read);window.addEventListener('trono-profile-change',identity);window.addEventListener('trono-call-change',identity);
    window.TronoNetwork.onMessage(event=>{if(['connection','room-state','joined-room','joined-text-channel','voice-room-attached','left-voice-room'].includes(event.type))identity();});
    window.addEventListener('trono-personal-change',event=>{if(event.detail.key==='appLayout'&&window.TronoPersonal.get('appLayout','original')!==current)read();});
    bound=true;read();void window.TronoAuth.ready.then(read);
  }
  window.addEventListener('DOMContentLoaded',bind);return {apply,get current(){return current;},navigate};
})();
