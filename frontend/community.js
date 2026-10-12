'use strict';
window.TronoCommunity=(()=>{
  const $=id=>document.getElementById(id);
  let snapshot=null,rooms=[],channels=[],lastChatMode=null,open=false,authenticating=false;
  const activities=[],seenEvents=new Set();
  function avatar(person){const el=document.createElement('span');el.className='community-avatar';el.innerHTML=window.TronoProfile.avatarHtml(person);return el;}
  function row(person){
    const el=document.createElement('div');el.className=`community-person ${person.online?'is-online':'is-offline'}`;
    const icon=avatar(person),dot=document.createElement('i');dot.className='community-status-dot';icon.appendChild(dot);el.appendChild(icon);
    const copy=document.createElement('div');copy.className='community-person-copy';const name=document.createElement('strong');name.textContent=person.name;copy.appendChild(name);
    const status=document.createElement('small');status.textContent=!person.online?'Offline':person.roomName?`${person.roomName}${person.inVoice?' · na voz':''}`:'Online · no início';copy.appendChild(status);
    if(person.online&&person.activity?.name){const game=document.createElement('small');game.className='community-game-activity';game.textContent='🎮 '+person.activity.name;game.title='Atividade: '+person.activity.name;copy.appendChild(game);}
    if(person.guest){const label=document.createElement('span');label.className='community-guest-tag';label.textContent='Convidado';copy.appendChild(label);}
    else {const badge=document.createElement('span');badge.className='role-badge role-'+(person.role||'member');badge.textContent={creator:'Criador',admin:'Admin',member:'Membro'}[person.role]||'Membro';copy.appendChild(badge);}
    if(window.TronoAuth.user?.permissions?.manageRoles&&!person.guest&&person.role!=='creator'){const edit=document.createElement('button');edit.type='button';edit.className='role-edit-btn';edit.title='Alterar cargo de '+person.name;edit.setAttribute('aria-label',edit.title);edit.textContent='Cargo';edit.onclick=()=>window.TronoCommunityAdmin.editRole(person);el.appendChild(edit);}
    el.appendChild(copy);return el;
  }
  function render(){
    const host=$('communityMembers');if(!host)return;const offlineExpanded=!!host.querySelector('details')?.open,scroll=host.scrollTop;host.replaceChildren();
    const active=snapshot?.members.filter(p=>p.online)||[],offline=snapshot?.members.filter(p=>!p.online)||[];
    $('communitySummary').textContent=snapshot?`${active.length} online · ${offline.length} offline`:'Conectando…';
    $('communityToggle').textContent=`Pessoas${snapshot?` · ${active.length}`:''}`;
    $('communityScope').textContent=snapshot?.scope==='game'?'Convidado: participantes das salas do jogo':snapshot?.directoryReady?'Comunidade · contas confirmadas':snapshot?'Conectados e pessoas vistas nesta sessão':'Entre para ver a comunidade';
    const heading=document.createElement('h3');heading.textContent=`Online — ${active.length}`;host.appendChild(heading);
    if(!active.length){const empty=document.createElement('p');empty.className='community-empty';empty.textContent=snapshot?'Nenhuma pessoa online nesta lista.':'Aguardando conexão…';host.appendChild(empty);}
    for(const p of active)host.appendChild(row(p));
    if(offline.length){const group=document.createElement('details'),title=document.createElement('summary');group.open=offlineExpanded;title.textContent=`Offline — ${offline.length}`;group.appendChild(title);for(const p of offline)group.appendChild(row(p));host.appendChild(group);}
    host.scrollTop=scroll;
    window.TronoProfile.hydrate(host);renderRoomIcons();
  }
  function icons(host,list){
    let strip=host.querySelector('.room-presence-icons');if(!strip){strip=document.createElement('span');strip.className='room-presence-icons';host.appendChild(strip);}strip.replaceChildren();
    for(const p of list.slice(0,8)){const icon=avatar(p);icon.title=`${p.name}${p.guest?' · convidado':''}${p.inVoice?' · na voz':''}`;icon.setAttribute('aria-label',icon.title);strip.appendChild(icon);}
    if(list.length>8){const more=document.createElement('small');more.textContent=`+${list.length-8}`;strip.appendChild(more);}
    window.TronoProfile.hydrate(strip);
  }
  function renderRoomIcons(){
    for(const room of rooms){const card=document.querySelector(`article.room-card[data-room="${room.id}"]`);if(card)icons(card,room.players||[]);}
    for(const channel of channels){const button=document.querySelector(`[data-chat-channel="${channel.id}"]`);if(button){if(channel.type==='text')button.querySelector('.room-presence-icons')?.remove();else icons(button,channel.players||[]);}}
  }
  function toggle(value){open=typeof value==='boolean'?value:!open;document.body.classList.toggle('community-open',open);$('communityPanel').classList.toggle('hidden',!open);$('communityToggle').setAttribute('aria-expanded',String(open));}
  function syncMode(){const logged=!!window.TronoAuth.user,guest=!!window.TronoAuth.guest;$('communityToggle')?.classList.toggle('hidden',!logged&&!guest);const chat=document.body.classList.contains('chat-only-active');if(chat!==lastChatMode){lastChatMode=chat;if(!window.TronoDesktop)toggle(chat&&matchMedia('(min-width:1280px)').matches);}if(!logged&&!guest){snapshot=null;toggle(false);render();}}
  function voiceNotice(event){
    if(event.id){if(seenEvents.has(event.id))return;seenEvents.add(event.id);if(seenEvents.size>200)seenEvents.delete(seenEvents.values().next().value);}
    const action=event.kind==='joined'?'entrou na chamada':event.kind==='disconnected'?'foi desconectado da chamada':'saiu da chamada';
    const text=event.text||`${event.name||'Participante'} ${action}.`;
    const toast=document.createElement('div');toast.className=`community-call-notice ${event.kind||'left'}`;toast.textContent=text;$('callNoticeHost').appendChild(toast);while($('callNoticeHost').children.length>3)$('callNoticeHost').firstElementChild.remove();setTimeout(()=>toast.remove(),8000);
    activities.unshift({text,at:new Date()});activities.splice(8);const host=$('communityActivity');host.replaceChildren();for(const item of activities){const line=document.createElement('li');line.textContent=`${item.at.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})} · ${item.text}`;host.appendChild(line);}
  }
  async function authenticatePresence(){
    if(authenticating)return;authenticating=true;
    try{await window.TronoAuth.ready;if(window.TronoAuth.user){const token=await window.TronoAuth.getAccessToken();if(token)await window.TronoNetwork.authenticate(token);}else if(window.TronoAuth.guest)await window.TronoAuth.ensureGuest();else return;window.TronoNetwork.requestPresence();}catch{}finally{authenticating=false;}
  }
  function bind(){
    $('communityToggle').onclick=()=>toggle();$('communityClose').onclick=()=>toggle(false);
    window.TronoNetwork.onMessage(msg=>{
      if(msg.type==='presence'){snapshot=msg;render();}
      if(msg.type==='rooms'||msg.type==='welcome'){rooms=msg.rooms||rooms;renderRoomIcons();}
      if(msg.type==='chat-channels'){channels=msg.channels||[];renderRoomIcons();}
      if(msg.type==='connection'&&!msg.connected){if(snapshot){render();$('communityScope').textContent='Sem conexão · última presença recebida';$('communitySummary').textContent='Aguardando conexão';}}
      if(msg.type==='connection'&&msg.connected)void authenticatePresence();
    });
    new MutationObserver(syncMode).observe(document.body,{attributes:true,attributeFilter:['class']});window.addEventListener('trono-auth-change',()=>{syncMode();void authenticatePresence();});
    window.addEventListener('resize',()=>{if(innerWidth<1280&&open)toggle(false);});document.addEventListener('keydown',e=>{if(e.key==='Escape')toggle(false);});
    window.addEventListener('trono-role-change',render);
    syncMode();void authenticatePresence();
  }
  window.addEventListener('DOMContentLoaded',bind);
  return {voiceNotice,renderRoomIcons};
})();
