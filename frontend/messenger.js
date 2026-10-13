'use strict';
window.TronoMessenger=(()=>{
  const $=id=>document.getElementById(id);let state={friends:[],threads:[]},members=[],peer=null,owner=null,opened=false,refreshTimer=null,refreshing=false,refreshAgain=false,generation=0,messages=[],hasMore=false,before=null;
  const seen=new Set(),drafts=new Map();let sending=false,pendingSend=null;
  const make=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;};
  const person=id=>members.find(row=>row.id===id)||state.friends.find(row=>row.id===id)||state.threads.find(row=>row.peerId===id);
  const friend=id=>state.friends.find(row=>row.id===id);
  function status(text){$('messengerStatus').textContent=text;}
  async function request(action,body={}){
    const token=await window.TronoAuth.getAccessToken();if(!token)throw new Error('Entre na sua conta para usar amigos e conversas.');
    const response=await fetch(window.TronoNetwork.BACKEND_HTTP+'/social/'+action,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
    const data=await response.json();if(!response.ok)throw new Error(data.error?.message||'Não foi possível completar a operação.');return data;
  }
  async function refresh(){if(!owner)return;if(refreshing){refreshAgain=true;return;}refreshing=true;const id=owner;
    try{const data=await request('snapshot');if(id!==owner)return;state=data;render();if(opened)status('');}catch(error){if(id===owner)status(error.message);}finally{refreshing=false;if(refreshAgain){refreshAgain=false;schedule();}}
  }
  function schedule(){clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>void refresh(),250);}
  async function action(id,value){try{await request('friend',{peerId:id,action:value});await refresh();status(value==='request'?'Pedido de amizade enviado.':'');}catch(error){status(error.message);}}
  function actionButton(label,fn){const button=make('button','social-small-button',label);button.type='button';button.onclick=fn;return button;}
  function row(member){
    const id=member.id||member.peerId,entry=friend(id),thread=state.threads.find(row=>row.peerId===id),line=make('div','messenger-person'+(id===peer?' selected':''));
    const view=actionButton('',()=>void open(id));view.className='messenger-person-main';const icon=make('span','community-avatar');icon.innerHTML=window.TronoProfile.avatarHtml(member);const copy=make('span','messenger-person-copy');copy.append(make('strong','',person(id)?.name||member.name),make('small','',entry?.state==='pending'?(entry.incoming?'Pedido recebido':'Pedido enviado'):thread?.last?.text||(person(id)?.online?'Online':'Offline')));view.append(icon,copy);if(thread?.unread)view.append(make('b','social-badge',String(thread.unread)));line.append(view);
    if(entry?.state==='pending'){if(entry.incoming)line.append(actionButton('Aceitar',()=>void action(id,'accept')));line.append(actionButton(entry.incoming?'Recusar':'Cancelar',()=>void action(id,'decline')));}
    return line;
  }
  function render(){
    if(!$('messengerList'))return;const total=state.threads.reduce((sum,row)=>sum+Number(row.unread||0),0)+state.friends.filter(row=>row.state==='pending'&&row.incoming).length;
    $('messengerToggle').textContent='Amigos'+(total?' · '+Math.min(total,99):'');$('messengerToggle').classList.toggle('has-unread',total>0);
    const list=$('messengerList'),scroll=list.scrollTop;list.replaceChildren();
    const ids=new Set();for(const group of [['Pedidos',state.friends.filter(row=>row.state==='pending')],['Conversas',state.threads],['Amigos',state.friends.filter(row=>row.state==='accepted')]]){
      const entries=group[1].filter(row=>!ids.has(row.id||row.peerId));if(!entries.length)continue;list.append(make('h3','',group[0]));for(const entry of entries){ids.add(entry.id||entry.peerId);list.append(row(entry));}
    }
    if(!ids.size)list.append(make('p','appearance-help','Adicione alguém da comunidade para conversar em particular.'));list.scrollTop=scroll;window.TronoProfile.hydrate(list);renderHeader();
  }
  function renderHeader(){
    const entry=friend(peer),p=person(peer);$('messengerName').textContent=peer?p?.name||'Conversa privada':'Sua comunidade, mais perto';
    $('messengerSubtitle').textContent=peer?(entry?.state==='accepted'?'Conversa privada · chamada permanece conectada':entry?'Aceite a amizade para conversar.':'Histórico preservado · adicione aos amigos para conversar.'):'Amigos, pedidos e mensagens privadas';
    $('messengerComposer').hidden=!peer;$('messengerInput').disabled=entry?.state!=='accepted';$('messengerSend').disabled=entry?.state!=='accepted'||sending;$('messengerInvite').hidden=entry?.state!=='accepted';$('messengerRemove').hidden=entry?.state!=='accepted';$('messengerAdd').hidden=!peer||!!entry;
    $('messengerMute').hidden=!peer;$('messengerMute').textContent=window.TronoNotifications.muted(peer)?'Ativar avisos':'Silenciar avisos';$('messengerEarlier').hidden=!hasMore;
  }
  function paintMessages({prepend=false}={}){
    const host=$('messengerMessages'),oldHeight=host.scrollHeight,oldScroll=host.scrollTop;host.replaceChildren();
    if(!peer)host.append(make('p','messenger-empty','Escolha um amigo para começar. Você pode conversar enquanto joga ou participa de uma chamada.'));
    for(const msg of messages){const line=make('article','direct-message'+(msg.senderId===owner?' own':''));line.dataset.messageId=msg.id;line.append(make('strong','',msg.senderId===owner?'Você':person(peer)?.name||'Amigo'),make('p','',msg.text));const time=make('time','',new Date(msg.ts).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}));line.append(time);if(msg.roomId)line.append(actionButton('Entrar no canal',()=>void joinChannel(msg.roomId)));host.append(line);}
    if(prepend)host.scrollTop=host.scrollHeight-oldHeight+oldScroll;else host.scrollTop=host.scrollHeight;
  }
  async function read({older=false}={}){
    if(!peer)return;const id=peer,epoch=generation;
    try{const data=await request('read',{peerId:id,before:older?before:null});if(id!==peer||epoch!==generation)return;hasMore=data.hasMore;before=data.messages[0]?.id||null;messages=older?[...data.messages,...messages]:data.messages;paintMessages({prepend:older});renderHeader();if(!older)void markRead();status('');}catch(error){if(epoch===generation)status(error.message);}
  }
  async function markRead(){if(!opened||!peer||!document.hasFocus()||document.visibilityState==='hidden'||!messages.length)return;const id=peer,last=messages.at(-1).id;try{await request('mark-read',{peerId:id,messageId:last});const thread=state.threads.find(row=>row.peerId===id);if(thread)thread.unread=0;render();}catch{}}
  async function open(id){
    if(!window.TronoAuth.user){window.TronoAuth.open('login');return;}window.TronoSocial.toggleTelemetry(false);opened=true;$('messengerPanel').hidden=false;$('messengerToggle').setAttribute('aria-expanded','true');
    if(id&&id!==peer){if(peer)drafts.set(peer,$('messengerInput').value);peer=id;generation++;messages=[];hasMore=false;before=null;pendingSend=null;$('messengerInput').value=drafts.get(peer)||'';paintMessages();void read();}
    $('messengerPanel').classList.toggle('has-peer',!!peer);render();schedule();void markRead();
  }
  function close(){opened=false;$('messengerPanel').hidden=true;$('messengerToggle').setAttribute('aria-expanded','false');}
  async function submit(roomId=null){
    const text=$('messengerInput').value.trim();if(!peer||sending||(!text&&!roomId))return;const id=peer,account=owner;
    const payload=pendingSend&&pendingSend.peerId===id&&pendingSend.text===text&&pendingSend.roomId===roomId?pendingSend:{id:crypto.randomUUID(),peerId:id,text,roomId};pendingSend=payload;sending=true;renderHeader();status('Enviando…');
    try{const message=await request('send',payload);if(owner!==account||peer!==id)return;if(!messages.some(row=>row.id===message.id)){messages.push(message);paintMessages();}if(!roomId&&$('messengerInput').value.trim()===text){$('messengerInput').value='';drafts.delete(id);}pendingSend=null;status('');schedule();void markRead();}catch(error){if(owner===account&&peer===id)status(error.message+' O texto foi mantido para tentar novamente.');}finally{sending=false;renderHeader();}
  }
  async function joinChannel(id){
    const channel=window.TronoChatHub.channels.find(row=>row.id===id);if(!channel){status('Esse canal não está disponível.');return;}
    if(document.body.classList.contains('chat-only-active')){await window.TronoChatHub.switchChannel(id);window.TronoPortal.showOnly('chatOnlyScreen');}
    else{if(window.TronoNetwork.primaryRoom?.startsWith('sala-')&&!confirm('Entrar neste canal sairá da sala do jogo. Continuar?'))return;await window.TronoChatHub.enter({channelId:id});}
    close();window.TronoNotifications.channelRead(id);
  }
  function search(){const text=$('messengerSearch').value.trim().toLocaleLowerCase('pt-BR'),host=$('messengerSearchResults');host.replaceChildren();if(text.length<2)return;for(const member of members.filter(row=>!row.guest&&row.id!==owner&&row.name.toLocaleLowerCase('pt-BR').includes(text)).slice(0,12)){const line=make('div','messenger-search-row');line.append(make('span','',member.name),actionButton(friend(member.id)?'Ver':'Adicionar',()=>friend(member.id)?void open(member.id):void action(member.id,'request')));host.append(line);}if(!host.children.length)host.append(make('p','appearance-help','Nenhuma conta encontrada.'));}
  function bind(){
    const toggle=make('button','messenger-toggle','Amigos');toggle.id='messengerToggle';toggle.type='button';toggle.setAttribute('aria-controls','messengerPanel');toggle.setAttribute('aria-expanded','false');const top=$('desktopTopBar');if(top)top.insertBefore(toggle,$('communityToggle'));else document.body.append(toggle);toggle.onclick=()=>opened?close():void open();
    const panel=make('aside','messenger-panel');panel.id='messengerPanel';panel.hidden=true;panel.setAttribute('aria-label','Amigos e conversas privadas');
    panel.innerHTML='<header class="messenger-heading"><strong>Amigos & conversas</strong><button id="messengerClose" class="settings-close" type="button" aria-label="Fechar amigos">×</button></header><div class="messenger-layout"><section class="messenger-sidebar"><label class="messenger-search-label">Adicionar amigo<input id="messengerSearch" placeholder="Buscar pelo apelido" maxlength="20" autocomplete="off"></label><div id="messengerSearchResults"></div><div id="messengerList"></div></section><section class="messenger-conversation"><header><button id="messengerBack" type="button" class="social-small-button">‹ Amigos</button><div><strong id="messengerName"></strong><small id="messengerSubtitle"></small></div></header><div class="messenger-tools"><button id="messengerAdd" type="button" class="social-small-button">Adicionar amigo</button><button id="messengerMute" type="button" class="social-small-button">Silenciar avisos</button><button id="messengerInvite" type="button" class="social-small-button">Convidar para canal</button><button id="messengerRemove" type="button" class="social-small-button">Remover amigo</button><button id="messengerEarlier" type="button" class="social-small-button">Mensagens anteriores</button></div><div id="messengerInvitePicker" hidden><label>Canal<select id="messengerInviteChannel"></select></label><button id="messengerInviteSend" type="button" class="social-small-button">Enviar convite</button></div><div id="messengerMessages" class="messenger-messages"></div><form id="messengerComposer" hidden><textarea id="messengerInput" rows="2" maxlength="2000" placeholder="Mensagem privada" aria-label="Mensagem privada"></textarea><button id="messengerSend" type="submit">Enviar</button></form></section></div><p id="messengerStatus" role="status"></p>';
    document.body.append(panel);$('messengerClose').onclick=close;$('messengerSearch').oninput=search;$('messengerComposer').onsubmit=e=>{e.preventDefault();void submit();};$('messengerInput').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();void submit();}};
    $('messengerBack').onclick=()=>{if(peer)drafts.set(peer,$('messengerInput').value);peer=null;generation++;messages=[];panel.classList.remove('has-peer');paintMessages();renderHeader();};
    $('messengerAdd').onclick=()=>void action(peer,'request');$('messengerMute').onclick=()=>{window.TronoNotifications.mute(peer,!window.TronoNotifications.muted(peer));renderHeader();};$('messengerRemove').onclick=()=>{if(confirm('Remover esta amizade? O histórico da conversa será preservado.'))void action(peer,'remove');};$('messengerEarlier').onclick=()=>void read({older:true});
    $('messengerInvite').onclick=()=>{const picker=$('messengerInvitePicker'),select=$('messengerInviteChannel');picker.hidden=!picker.hidden;select.replaceChildren();for(const channel of window.TronoChatHub.channels)select.add(new Option(channel.name,channel.id));select.value=window.TronoNetwork.primaryRoom||window.TronoNetwork.currentRoom||select.value;};$('messengerInviteSend').onclick=()=>{const id=$('messengerInviteChannel').value;if(id){void submit(id);$('messengerInvitePicker').hidden=true;}};
    window.addEventListener('trono-telemetry-change',event=>{if(event.detail.open)close();});
    document.addEventListener('keydown',e=>{if(e.key==='Escape')close();});window.addEventListener('focus',()=>{schedule();void markRead();});document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){schedule();void markRead();}});
    window.TronoNetwork.onMessage(event=>{
      if(event.type==='presence'){members=event.members||[];render();if($('messengerSearch').value)search();}
      if(event.type==='auth-result'&&event.ok)schedule();
      if(event.type==='social-changed'){schedule();if(event.kind==='friend'&&event.accountId!==owner&&event.action==='request')void window.TronoNotifications.notify({key:'friend:'+event.accountId,title:'Pedido de amizade',body:event.name+' quer adicionar você.',target:{type:'friends',id:event.accountId},request:true});}
      if(event.type==='direct-message'){
        const msg=event.message;if(seen.has(msg.id))return;seen.add(msg.id);if(seen.size>500)seen.delete(seen.values().next().value);const other=msg.senderId===owner?event.peerId:msg.senderId;
        if(other===peer&&!messages.some(row=>row.id===msg.id)){messages.push(msg);paintMessages();void markRead();}
        if(msg.senderId!==owner)void window.TronoNotifications.notify({key:msg.id,title:event.senderName+' · mensagem privada',body:msg.text,target:{type:'direct',id:other},direct:true});schedule();
      }
    });
    function auth(){const id=window.TronoAuth.user?.id||null;if(owner!==id){owner=id;generation++;state={friends:[],threads:[]};peer=null;messages=[];drafts.clear();seen.clear();pendingSend=null;close();paintMessages();render();}toggle.hidden=!id;if(id)schedule();}
    window.addEventListener('trono-auth-change',auth);void window.TronoAuth.ready.then(auth);auth();paintMessages();
  }
  window.addEventListener('DOMContentLoaded',bind);return {open,close,joinChannel,request};
})();
