'use strict';
// One grid owns every call surface. Existing controllers retain their elements and tracks.
window.addEventListener('DOMContentLoaded',()=>{
 const $=id=>document.getElementById(id),body=document.body,homes=new Map();let mounted=false,arranging=false;
 const svg=path=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+path+'</svg>';
 const make=(tag,id,cls)=>{const el=document.createElement(tag);if(id)el.id=id;if(cls)el.className=cls;return el;};
 const screen=$('chatOnlyScreen'),shell=make('div','callWorkspace'),sidebar=make('div','callWorkspaceSidebar'),main=make('main','callWorkspaceMain');
 shell.setAttribute('aria-label','Comunidade M&N');screen.append(shell);shell.append(sidebar,main);
 const header=screen.querySelector('.chat-only-topbar'),channels=screen.querySelector('.mn-channel-sidebar');shell.prepend(header);sidebar.append(channels);
 header.id='workspaceHeader';
 const headerToggle=make('button','workspaceHeaderToggle');headerToggle.type='button';headerToggle.setAttribute('aria-controls',header.id);headerToggle.innerHTML=svg('<path d="m6 14 6-6 6 6"/>');shell.append(headerToggle);
 function compactHeader(collapsed){
  shell.classList.toggle('workspace-header-collapsed',collapsed);header.inert=collapsed;
  headerToggle.setAttribute('aria-expanded',String(!collapsed));headerToggle.title=collapsed?'Mostrar barra superior':'Ocultar barra superior';headerToggle.setAttribute('aria-label',headerToggle.title);
 }
 function readHeader(){compactHeader(window.TronoPersonal.get('workspaceHeaderCollapsed',false)===true);}
 headerToggle.onclick=()=>{const collapsed=!shell.classList.contains('workspace-header-collapsed');compactHeader(collapsed);window.TronoPersonal.set('workspaceHeaderCollapsed',collapsed);window.dispatchEvent(new Event('resize'));};
 window.addEventListener('trono-auth-change',readHeader);window.addEventListener('trono-personal-change',e=>{if(e.detail.key==='workspaceHeaderCollapsed')readHeader();});void window.TronoAuth.ready.then(readHeader);
 header.querySelector('.chat-app-crest').innerHTML=svg('<path d="M3 19V5l9 9 9-9v14l-9-9-9 9"/>');
 const tabs=make('nav',null,'workspace-area-tabs');tabs.setAttribute('aria-label','Áreas da comunidade');tabs.innerHTML='<button type="button" class="active" data-workspace-area="call">'+svg('<path d="M4 10v4h4l5 4V6l-5 4zM17 8a6 6 0 0 1 0 8"/>')+'Call</button><button type="button" data-workspace-area="games">'+svg('<rect x="3" y="6" width="18" height="13" rx="4"/><path d="M7 10v5m-2-2h4m7-2h.01m2 4h.01"/>')+'Jogos</button>';channels.querySelector('.mn-sidebar-heading').after(tabs);tabs.onclick=e=>{if(e.target.closest('[data-workspace-area=games]'))void window.TronoAppLayout.navigate('game');};
 const dm=make('section',null,'workspace-direct-menu');dm.innerHTML='<button id="workspaceDirectOpen" type="button">'+svg('<path d="M21 11a8 8 0 0 1-8 8H8l-5 3V11a9 9 0 0 1 18 0Z"/>')+'<span>Mensagens diretas</span><b id="workspaceDirectCount" hidden></b></button><div id="workspaceDirectList"></div>';channels.querySelector('.mn-sidebar-scroll').prepend(dm);
 const tools=make('details','workspaceTools');tools.innerHTML='<summary aria-label="Mais opções" title="Mais opções">'+svg('<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>')+'</summary><div></div>';channels.querySelector('.mn-sidebar-heading').append(tools);
 for(const id of ['communityManageBtn','creatorAccountsBtn','backFromChatOnlyBtn'])if($(id))tools.lastElementChild.append($(id));
 const toggle=make('button','workspaceSidebarBtn');toggle.type='button';toggle.title='Canais';toggle.setAttribute('aria-label','Abrir canais');toggle.setAttribute('aria-expanded','false');toggle.innerHTML=svg('<path d="M4 6h16M4 12h16M4 18h16"/>');header.prepend(toggle);
 const shade=make('button','workspaceSidebarShade');shade.type='button';shade.hidden=true;shade.setAttribute('aria-label','Fechar canais');shell.append(shade);
 function showChannels(on){shell.classList.toggle('workspace-sidebar-open',on);shade.hidden=!on;toggle.setAttribute('aria-expanded',String(on));}
 toggle.onclick=()=>showChannels(!shell.classList.contains('workspace-sidebar-open'));shade.onclick=()=>showChannels(false);
 $('workspaceDirectOpen').onclick=()=>{showChannels(false);void window.TronoMessenger.openFriends();};
 const layout=make('button','workspaceLayoutToggle','chat-header-action');layout.type='button';layout.title='Alternar entre Original e Discord';layout.onclick=()=>window.TronoAppLayout.apply(body.dataset.appLayout==='discord'?'original':'discord',{save:true});$('chatProfileBtn').before(layout);
 const dock=make('footer','callFocusDock');dock.setAttribute('aria-label','Controles da chamada');$('socialPanel').querySelector('.voice-section').append(dock);
 function move(id,host){const node=$(id);if(!node||!host)return;if(!homes.has(id)){const marker=document.createComment('workspace:'+id);node.before(marker);homes.set(id,marker);}if(node.parentElement!==host)host.append(node);}
 function syncPanels(){const panel=$('socialPanel'),direct=$('messengerPanel');if(!mounted)return;const isDirect=direct&&!direct.hidden,isChannel=panel.classList.contains('chat-drawer-open');shell.dataset.messages=isDirect?'direct':isChannel?'channel':'none';}
 function updatePlacement(){const button=$('desktopUpdateCheck');if(!button)return;const compact=mounted&&body.dataset.appLayout==='discord'&&innerWidth<760;button.classList.toggle('workspace-update-compact',compact);if(mounted)move(button.id,compact?shell:$('desktopRail'));}
 function labels(){const discord=body.dataset.appLayout==='discord';layout.textContent=discord?'Discord':'Original';layout.setAttribute('aria-label','Layout '+layout.textContent+' · trocar');const tabHost=discord?channels:header;if(tabs.parentElement!==tabHost){if(discord)channels.querySelector('.mn-sidebar-heading').after(tabs);else header.querySelector('.chat-app-brand').after(tabs);}header.querySelector('h2').textContent=discord?$('mnStageRoomName').textContent.trim()||'Comunidade M&N':'M&N';updatePlacement();}

 function arrange(){if(arranging)return;arranging=true;const active=body.classList.contains('chat-only-active');
  if(active){const first=!mounted;mounted=true;move('socialPanel',main);move('messengerPanel',$('socialPanel'));move('layoutVoicePanel',sidebar);move('communityPanel',shell);move(window.TronoDesktop?'desktopRail':'webLayoutRail',shell);
   if(first&&innerWidth>=1100)window.TronoSocial.toggleTextChat(true);
  }else if(mounted){mounted=false;showChannels(false);for(const [id,marker]of homes)if(marker.isConnected&&$(id))marker.after($(id));window.TronoCallControlsLayout.refresh();}
  window.TronoCallControlsLayout.refresh();labels();syncPanels();arranging=false;
 }
 const modeObserver=new MutationObserver(arrange);modeObserver.observe(body,{attributes:true,attributeFilter:['class','data-app-layout']});
 new MutationObserver(syncPanels).observe($('socialPanel'),{attributes:true,attributeFilter:['class']});if($('messengerPanel'))new MutationObserver(syncPanels).observe($('messengerPanel'),{attributes:true,attributeFilter:['hidden','class']});
 new MutationObserver(labels).observe($('mnStageRoomName'),{childList:true,subtree:true,characterData:true});
 window.addEventListener('trono-layout-change',arrange);window.addEventListener('trono-call-change',()=>{labels();syncPanels();});
 document.addEventListener('click',e=>{if(e.target.closest('[data-chat-channel]')){showChannels(false);window.TronoMessenger.close();}const avatar=e.target.closest('#voiceRoster .mn-person-avatar');if(avatar){const id=avatar.closest('[data-account-id]')?.dataset.accountId;if(id)void window.TronoProfile.openMini(id);}});
 $('chatOnlyTextBtn').addEventListener('click',()=>window.TronoMessenger.close(),true);
 const roster=$('voiceRoster');new MutationObserver(()=>{for(const avatar of roster.querySelectorAll('.mn-person-avatar'))if(avatar.closest('[data-account-id]')?.dataset.accountId){avatar.tabIndex=0;avatar.setAttribute('role','button');avatar.setAttribute('aria-label','Ver perfil de '+(avatar.closest('.voice-person').querySelector(':scope > strong')?.textContent||'participante'));}}).observe(roster,{childList:true,subtree:true});
 roster.addEventListener('keydown',e=>{if(e.target.matches('.mn-person-avatar')&&['Enter',' '].includes(e.key)){e.preventDefault();e.target.click();}});
 window.addEventListener('trono-direct-change',e=>{const host=$('workspaceDirectList');host.replaceChildren();for(const person of e.detail.people.slice(0,7)){const button=make('button',null,'workspace-direct-person');button.type='button';button.dataset.directProfile=person.id;const avatar=make('span',null,'community-avatar');avatar.innerHTML=window.TronoProfile.avatarHtml(person);const name=make('span',null,'workspace-direct-name');name.textContent=person.name;button.append(avatar,name);if(person.unread){const badge=make('b');badge.textContent=String(person.unread);button.append(badge);}button.onclick=()=>{showChannels(false);void window.TronoMessenger.open(person.id);};host.append(button);}const badge=$('workspaceDirectCount');badge.textContent=String(e.detail.unread);badge.hidden=!e.detail.unread;window.TronoProfile.hydrate(host);window.TronoProfile.directBanners(host);});
 document.addEventListener('keydown',e=>{if(e.key==='Escape')showChannels(false);});window.addEventListener('resize',()=>{if(innerWidth>=1100)showChannels(false);updatePlacement();});
 window.addEventListener('trono-auth-change',()=>{if(!window.TronoAuth.user){$('workspaceDirectList').replaceChildren();$('workspaceDirectCount').hidden=true;showChannels(false);}});
 body.dataset.callWorkspace='true';arrange();
});
