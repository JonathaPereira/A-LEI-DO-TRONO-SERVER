'use strict';
window.TronoFiles=(()=>{
 const limits={file:10_000_000,video:100_000_000},cache=new Map(),attachments=new WeakMap();
 const size=n=>n>=1e9?`${(n/1e9).toFixed(2)} GB`:n>=1e6?`${(n/1e6).toFixed(1)} MB`:`${Math.ceil(n/1000)} KB`;
 async function api(path,{method='GET',body}={}){
   const token=await window.TronoAuth.getAccessToken();if(!token)throw new Error('Entre na sua conta para continuar.');
   const res=await fetch(`${window.TronoNetwork.BACKEND_HTTP}/files${path}`,{method,headers:{Authorization:`Bearer ${token}`},body,cache:'no-store',signal:AbortSignal.timeout(25000)}),data=await res.json().catch(()=>({}));
   if(!res.ok)throw Object.assign(new Error(data.error?.message||'Não foi possível acessar esse arquivo.'),{code:data.error?.code});return data;
 }
 async function url(id,download=false){const key=`${id}:${download}`,old=cache.get(key);if(old&&old.expiresAt>Date.now()+30000)return old.url;const data=await api(`/${id}/url${download?'?download=1':''}`);cache.set(key,data);return data.url;}
 async function upload(file,{kind='chat',roomId,onProgress,signal}={}){
   const video=/\.(mp4|webm)$/i.test(file.name),max=kind==='soundboard'?2_880_044:kind==='avatar'?1_000_000:video?limits.video:limits.file;
   if(!file.size||file.size>max)throw new Error(`Limite: ${size(max)} ${video?'por vídeo':'por arquivo'}.`);
   const token=await window.TronoAuth.getAccessToken();if(!token)throw new Error('Entre na sua conta.');
   return new Promise((resolve,reject)=>{
     const xhr=new XMLHttpRequest();xhr.open('POST',`${window.TronoNetwork.BACKEND_HTTP}/files/upload`);xhr.timeout=300000;
     xhr.setRequestHeader('Authorization',`Bearer ${token}`);xhr.setRequestHeader('Content-Type','application/octet-stream');xhr.setRequestHeader('X-File-Name',encodeURIComponent(file.name));xhr.setRequestHeader('X-File-Kind',kind);if(roomId)xhr.setRequestHeader('X-Room-Id',roomId);
     const abort=()=>xhr.abort();signal?.addEventListener('abort',abort,{once:true});
     const done=fn=>{signal?.removeEventListener('abort',abort);fn();};
     xhr.upload.onprogress=e=>{if(e.lengthComputable)onProgress?.(Math.round(e.loaded/e.total*100));};
     xhr.onload=()=>done(()=>{let data={};try{data=JSON.parse(xhr.responseText);}catch{}if(xhr.status>=200&&xhr.status<300)resolve(data.file);else reject(new Error(data.error?.message||'Falha ao enviar o arquivo.'));});
     xhr.onerror=()=>done(()=>reject(new Error('Conexão interrompida durante o envio.')));xhr.ontimeout=()=>done(()=>reject(new Error('Envio demorou demais. Tente novamente.')));xhr.onabort=()=>done(()=>reject(new Error('Envio cancelado.')));
     if(signal?.aborted)return abort();xhr.send(file);
   });
 }
 function invalidate(id){for(const key of cache.keys())if(key.startsWith(`${id}:`))cache.delete(key);}
 function markDeleted(id){invalidate(id);for(const el of document.querySelectorAll('[data-attachment]'))if(el.dataset.attachment===id){const file=attachments.get(el);if(file)file.deleted=true;el.replaceChildren(document.createTextNode('Arquivo excluído.'));}}
 async function remove(id){await api(`/${id}`,{method:'DELETE'});markDeleted(id);}
 function renderAttachment(host,file){
   attachments.set(host,file);host.replaceChildren();
   host.dataset.attachment=file.id;
   const label=document.createElement('button');label.type='button';label.className='file-download';label.textContent=`${file.name} · ${size(file.bytes)} ↓`;host.appendChild(label);
   const notice=document.createElement('small');host.appendChild(notice);
   if(file.deleted){label.disabled=true;notice.textContent='Arquivo excluído.';return;}
   label.onclick=async()=>{const tab=window.open('about:blank','_blank');if(tab)tab.opener=null;try{const link=await url(file.id,true);if(tab)tab.location=link;else notice.textContent='Permita abrir a aba para baixar o arquivo.';}catch(e){tab?.close();notice.textContent=e.message;}};
   if(['image/png','image/jpeg','image/gif','image/webp'].includes(file.mime)){
     const img=document.createElement('img');img.className='chat-file-image';img.alt=file.name;img.loading='lazy';host.prepend(img);url(file.id).then(link=>{if(img.isConnected)img.src=link;}).catch(e=>{img.remove();notice.textContent=e.message;});
   }else if(['video/mp4','video/webm'].includes(file.mime)){
     const load=document.createElement('button');load.type='button';load.className='file-preview';load.textContent='▶ Abrir vídeo';host.prepend(load);
     load.onclick=async()=>{try{const video=document.createElement('video');video.controls=true;video.playsInline=true;video.preload='metadata';video.className='chat-file-video';video.src=await url(file.id);load.replaceWith(video);}catch(e){notice.textContent=e.message;}};
   }else if(file.mime==='application/pdf'){
     const open=document.createElement('button');open.type='button';open.className='file-preview';open.textContent='▤ Abrir PDF';host.prepend(open);open.onclick=async()=>{const tab=window.open('about:blank','_blank');if(tab)tab.opener=null;try{const link=await url(file.id);if(tab)tab.location=link;else notice.textContent='Permita abrir a aba para visualizar o PDF.';}catch(e){tab?.close();notice.textContent=e.message;}};
   }
   if(file.ownerId===window.TronoAuth.user?.id||window.TronoAuth.user?.permissions?.moderateFiles){const del=document.createElement('button');del.type='button';del.className='file-delete';del.textContent=file.ownerId===window.TronoAuth.user?.id?'Excluir anexo':'Moderar: excluir';host.appendChild(del);del.onclick=async()=>{if(!confirm('Excluir este anexo para todos no canal?'))return;del.disabled=true;try{await remove(file.id);host.replaceChildren(document.createTextNode('Arquivo excluído.'));}catch(e){notice.textContent=e.message;del.disabled=false;}};}
 }
 let cacheUser=null;window.addEventListener('trono-auth-change',e=>{const id=e.detail.user?.id;if(id!==cacheUser){cache.clear();cacheUser=id;}});
 window.addEventListener('trono-role-change',()=>{for(const host of document.querySelectorAll('[data-attachment]')){const file=attachments.get(host);if(file)renderAttachment(host,file);}});
 window.TronoNetwork.onMessage(m=>{if(m.type==='attachment-deleted')markDeleted(m.id);});
 return {api,upload,url,remove,size,renderAttachment,limits};
})();
window.TronoProfile=(()=>{
 const $=id=>document.getElementById(id);
 const presets={crown:['♛','Coroa'],scepter:['⚜','Cetro'],key:['🗝️','Chave'],blade:['⚔️','Lâmina'],mask:['🎭','Máscara'],shield:['🛡️','Escudo'],knight:['♞','Cavaleiro'],dragon:['🐉','Dragão'],person:['👤','Pessoa'],cat:['🐱','Gato'],dog:['🐶','Cachorro'],robot:['🤖','Robô'],star:['⭐','Estrela'],moon:['🌙','Lua'],gamepad:['🎮','Controle'],flower:['🌻','Flor']};
 let chosen='crown',photo=null,photoUrl=null,selectedFile=null,busy=false;
 function avatarHtml(person={}){const preset=Object.hasOwn(presets,person.avatar_preset)?person.avatar_preset:'crown';const file=person.avatar_file_id;return file&&window.TronoAuth?.user&&/^[a-f0-9-]{36}$/i.test(file)?`<img class="profile-avatar-photo" data-avatar-file="${file}" data-avatar-preset="${preset}" alt="Ícone de perfil">`:window.TronoAvatarIcons.html(preset);}
 function hydrate(host=document){for(const img of host.querySelectorAll('[data-avatar-file]')){if(img.dataset.loading)continue;img.dataset.loading='1';const fallback=()=>{const el=document.createElement('span');el.innerHTML=window.TronoAvatarIcons.html(img.dataset.avatarPreset||'person');img.replaceWith(el.firstElementChild);};window.TronoFiles.url(img.dataset.avatarFile).then(link=>{if(img.isConnected){img.src=link;img.onerror=fallback;}}).catch(fallback);}}
 function preview(){const host=$('profilePreview');host.innerHTML=photoUrl?'<img alt="Prévia da foto">':avatarHtml({avatar_preset:chosen,avatar_file_id:selectedFile});if(photoUrl)host.firstElementChild.src=photoUrl;else hydrate(host);for(const btn of $('avatarPresets').children)btn.setAttribute('aria-pressed',String(!photo&&!selectedFile&&btn.dataset.preset===chosen));}
 function message(text,error=false){$('profileMessage').textContent=text;$('profileMessage').classList.toggle('auth-error',error);}
 async function open(){await window.TronoAuth.ready;if(!window.TronoAuth.user){window.TronoAuth.open('login');return;}const u=window.TronoAuth.user;$('profileNickname').value=u.nickname;chosen=u.avatar_preset||'crown';selectedFile=u.avatar_file_id||null;photo=null;if(photoUrl)URL.revokeObjectURL(photoUrl);photoUrl=null;$('profilePhoto').value='';message();preview();$('profileDialog').showModal();void refreshFiles();}
 async function formatPhoto(file){
   if(!file||file.size>10_000_000||!/^image\/(jpeg|png|webp|gif)$/.test(file.type))throw new Error('Selecione uma imagem JPG, PNG, WebP ou GIF de até 10 MB.');
   const bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});
   try{if(bitmap.width*bitmap.height>40_000_000)throw new Error('Essa imagem tem resolução muito alta. Reduza a resolução.');const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const ctx=canvas.getContext('2d'),side=Math.min(bitmap.width,bitmap.height);ctx.drawImage(bitmap,(bitmap.width-side)/2,(bitmap.height-side)/2,side,side,0,0,256,256);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error('Não foi possível preparar a foto.');return new File([blob],'icone.png',{type:'image/png'});}finally{bitmap.close();}
 }
 async function refreshFiles(){
   const host=$('profileFiles');host.replaceChildren();$('storageUsage').textContent='Consultando arquivos…';
   function addFiles(files){for(const file of files){
     const row=document.createElement('div');row.className='profile-file-row';
     const name=document.createElement('button');name.type='button';name.textContent=`${file.name} · ${window.TronoFiles.size(file.bytes)}${file.kind==='avatar'?' · ícone':''}`;
     name.onclick=async()=>{const tab=window.open('about:blank','_blank');if(tab)tab.opener=null;try{const link=await window.TronoFiles.url(file.id,true);if(tab)tab.location=link;else message('Permita abrir a aba para baixar o arquivo.',true);}catch(e){tab?.close();message(e.message,true);}};
     const del=document.createElement('button');del.type='button';del.textContent='Excluir';del.disabled=file.id===window.TronoAuth.user?.avatar_file_id;del.title=del.disabled?'Troque seu ícone antes de excluir essa foto.':'';
     del.onclick=async()=>{del.disabled=true;try{await window.TronoFiles.remove(file.id);await refreshFiles();}catch(e){message(e.message,true);del.disabled=false;}};row.append(name,del);host.appendChild(row);
   }}
   function addMore(data){if(!data.hasMore)return;const btn=document.createElement('button');btn.type='button';btn.className='small-btn';btn.textContent='Carregar mais arquivos';host.appendChild(btn);btn.onclick=async()=>{btn.disabled=true;try{const next=await window.TronoFiles.api(`/mine?offset=${data.nextOffset}`);btn.remove();addFiles(next.files);addMore(next);}catch(e){message(e.message,true);btn.disabled=false;}};}
   try{const [status,mine]=await Promise.all([window.TronoFiles.api('/status'),window.TronoFiles.api('/mine')]);$('storageUsage').textContent=`Uso compartilhado: ${window.TronoFiles.size(status.used)} de 8 GB. Fotos e anexos usam esse espaço.`;addFiles(mine.files);addMore(mine);if(!mine.files.length)host.textContent='Você ainda não enviou arquivos.';}catch(e){$('storageUsage').textContent=e.message;}
 }
 async function save(e){e.preventDefault();if(busy)return;busy=true;for(const el of $('profileForm').querySelectorAll('input,button'))el.disabled=true;message('Salvando…');
   try{if(photo){const uploaded=await window.TronoFiles.upload(photo,{kind:'avatar',onProgress:n=>message(`Enviando foto: ${n}%`)});selectedFile=uploaded.id;photo=null;}await window.TronoAuth.updateProfile({nickname:$('profileNickname').value,avatar_preset:chosen,avatar_file_id:selectedFile});message('Perfil atualizado.');await refreshFiles();preview();}catch(e){message(e.message,true);}finally{busy=false;for(const el of $('profileForm').querySelectorAll('input,button'))el.disabled=false;}
 }
 window.addEventListener('DOMContentLoaded',()=>{
   for(const [id,[icon,name]] of Object.entries(presets)){const btn=document.createElement('button');btn.type='button';btn.dataset.preset=id;btn.title=name;btn.setAttribute('aria-label',name);btn.innerHTML=window.TronoAvatarIcons.html(id);btn.onclick=()=>{chosen=id;selectedFile=null;photo=null;if(photoUrl)URL.revokeObjectURL(photoUrl);photoUrl=null;preview();};$('avatarPresets').appendChild(btn);}
   for(const id of ['accountProfileBtn','chatProfileBtn'])$(id)?.addEventListener('click',()=>void open());$('profileForm').addEventListener('submit',save);$('profileClose').onclick=()=>{if(!busy)$('profileDialog').close();};$('profileDialog').addEventListener('cancel',e=>{if(busy)e.preventDefault();});
   $('profilePhotoChoose').onclick=()=>$('profilePhoto').click();
   $('profilePhoto').onchange=async e=>{try{photo=await formatPhoto(e.target.files[0]);selectedFile=null;if(photoUrl)URL.revokeObjectURL(photoUrl);photoUrl=URL.createObjectURL(photo);preview();message('Foto recortada no centro e formatada em 256 × 256 pixels. Salve para aplicar.');}catch(err){message(err.message,true);}};
 });
 return {open,avatarHtml,hydrate,formatPhoto};
})();
