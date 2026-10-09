'use strict';
window.TronoCommunityAdmin=(()=>{
  const $=id=>document.getElementById(id);
  let channels=[],loading=null,requestVersion=0;
  async function api(path,{method='GET',body}={}){
    const token=await window.TronoAuth.getAccessToken();if(!token)throw Error('Entre na sua conta.');
    const response=await fetch(window.TronoNetwork.BACKEND_HTTP+'/community'+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store',signal:AbortSignal.timeout(20000)});
    const data=await response.json().catch(()=>({}));if(!response.ok)throw Error(data.error?.message||'Não foi possível atualizar a comunidade.');return data;
  }
  async function refresh(){
    if(!window.TronoAuth.user)return [];
    if(loading)return loading;
    const version=requestVersion;
    loading=(async()=>{const data=await api('/channels');if(version!==requestVersion)return [];channels=data.channels.map(c=>({...c,type:c.channel_type}));window.TronoChatHub.setChannels(channels);window.TronoNetwork.requestChatChannels();renderChannels();return channels;})().finally(()=>{loading=null;});
    return loading;
  }
  function syncPermissions(){
    const user=window.TronoAuth.user,canManage=!!user?.permissions?.manageChannels;
    for(const id of ['createChannelBtn','communityManageBtn'])$(id)?.classList.toggle('hidden',!canManage);
    $('myRoleBadge').textContent=user?({creator:'Criador',admin:'Admin',member:'Membro'}[user.role]||'Membro'):'';
    $('myRoleBadge').className='role-badge role-'+(user?.role||'member');
    if(!canManage&&$('channelManagerDialog').open)$('channelManagerDialog').close();
    if(!user?.permissions?.manageRoles&&$('roleDialog').open)$('roleDialog').close();
    renderChannels();
  }
  function renderChannels(){
    const host=$('managedChannels');host.replaceChildren();
    for(const channel of channels){
      const row=document.createElement('div');row.className='managed-channel';
      const name=document.createElement('span');name.textContent=(channel.type==='text'?'# ':'♬ ')+channel.name;
      const del=document.createElement('button');del.type='button';del.className='danger-button';del.textContent='Excluir';del.disabled=!window.TronoAuth.user?.permissions?.manageChannels;
      del.setAttribute('aria-label','Excluir canal '+channel.name);
      del.onclick=async()=>{if(!confirm('Excluir o canal “'+channel.name+'”? Os participantes sairão da chamada; os anexos continuam nos arquivos dos donos.'))return;del.disabled=true;
        try{await api('/channels/'+encodeURIComponent(channel.id),{method:'DELETE'});await refresh();$('channelManagerMessage').textContent='Canal excluído.';}catch(e){$('channelManagerMessage').textContent=e.message;del.disabled=false;}};
      row.append(name,del);host.appendChild(row);
    }
    if(!channels.length)host.textContent='Nenhum canal criado.';
  }
  async function open(){
    if(!window.TronoAuth.user?.permissions?.manageChannels)return;
    $('channelManagerMessage').textContent='';$('channelManagerDialog').showModal();
    try{await refresh();}catch(e){$('channelManagerMessage').textContent=e.message;}
  }
  function editRole(person){
    if(!window.TronoAuth.user?.permissions?.manageRoles||person.guest||person.role==='creator')return;
    $('rolePersonName').textContent=person.name;$('rolePersonId').value=person.id;$('roleSelect').value=person.role==='admin'?'admin':'member';$('roleMessage').textContent='';$('roleDialog').showModal();
  }
  async function openChannelFiles(){
    const roomId=window.TronoNetwork.currentRoom;if(!roomId)return;
    $('channelFilesDialog').showModal();const host=$('channelFileList');host.replaceChildren();$('channelFilesMessage').textContent='Carregando anexos…';
    let offset=0;
    async function load(){
      try{const data=await window.TronoFiles.api('/channel/'+encodeURIComponent(roomId)+'?offset='+offset);if(!host.isConnected||!$('channelFilesDialog').open||roomId!==window.TronoNetwork.currentRoom)return;
        for(const file of data.files){const tile=document.createElement('article');tile.className='channel-file-card';window.TronoFiles.renderAttachment(tile,file);host.appendChild(tile);}
        $('channelFilesMessage').textContent=host.children.length?'':'Nenhum anexo neste canal.';
        const old=host.querySelector('.files-load-more');old?.remove();
        if(data.hasMore){offset=data.nextOffset;const more=document.createElement('button');more.type='button';more.className='files-load-more';more.textContent='Carregar mais';more.onclick=()=>{more.disabled=true;void load();};host.appendChild(more);}
      }catch(e){$('channelFilesMessage').textContent=e.message;}
    }
    await load();
  }
  function bind(){
    $('createChannelBtn').onclick=open;$('communityManageBtn').onclick=open;
    $('channelManagerClose').onclick=()=>$('channelManagerDialog').close();$('roleClose').onclick=()=>$('roleDialog').close();$('channelFilesClose').onclick=()=>$('channelFilesDialog').close();$('channelFilesBtn').onclick=openChannelFiles;
    $('createChannelForm').onsubmit=async e=>{e.preventDefault();const button=$('createChannelSubmit');button.disabled=true;$('channelManagerMessage').textContent='Criando…';
      try{await api('/channels',{method:'POST',body:{name:$('channelName').value,type:$('channelType').value,description:$('channelDescription').value}});$('createChannelForm').reset();await refresh();$('channelManagerMessage').textContent='Canal criado.';}catch(err){$('channelManagerMessage').textContent=err.message;}finally{button.disabled=false;}};
    $('roleForm').onsubmit=async e=>{e.preventDefault();const button=$('roleSave');button.disabled=true;
      try{await api('/roles',{method:'POST',body:{userId:$('rolePersonId').value,role:$('roleSelect').value}});window.TronoNetwork.requestPresence();$('roleDialog').close();}catch(err){$('roleMessage').textContent=err.message;}finally{button.disabled=false;}};
    window.addEventListener('trono-role-change',syncPermissions);
    window.addEventListener('trono-auth-change',()=>{requestVersion++;syncPermissions();if(!window.TronoAuth.user){channels=[];for(const id of ['channelFilesDialog','roleDialog','channelManagerDialog'])if($(id).open)$(id).close();}});
    window.TronoNetwork.onMessage(message=>{if(message.type==='chat-channels'){channels=message.channels||[];renderChannels();}if(message.type==='channel-deleted'&&$('channelFilesDialog').open)$('channelFilesDialog').close();});
    syncPermissions();
  }
  window.addEventListener('DOMContentLoaded',bind);
  return {api,refresh,editRole,openChannelFiles};
})();
