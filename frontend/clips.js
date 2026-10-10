'use strict';
window.TronoClips=(()=>{
  const $=id=>document.getElementById(id),store=window.TronoClipStore,storage=window.TronoStorage||localStorage,workerURL=new URL('clip-buffer.js?v=090clips',document.currentScript.src);
  const qualities={light:{width:1280,height:720,bitrate:2500000,label:'720p'},balanced:{width:1920,height:1080,bitrate:5000000,label:'1080p'},high:{width:2560,height:1440,bitrate:8000000,label:'1440p'}};
  let owner='local',settings,session=null,starting=false,generation=0,clips=[],directory=null,choosingShortcut=false,pip=null,loading=0;
  const emergency=new Map(),memoryOnly=new Set(),urls=new Map(),busy=new Set();
  const account=()=>window.TronoAuth?.user?.id||'local';
  const defaults=()=>({quality:'light',fps:30,seconds:30,audio:true,shortcut:{code:'KeyX',ctrl:true,shift:true,alt:false,meta:false}});
  function message(text){$('clipsStatus').textContent=text;}
  function shortcutLabel(s=settings.shortcut){return [s.ctrl?'Ctrl':'',s.alt?'Alt':'',s.shift?'Shift':'',s.meta?'Meta':'',s.code.replace(/^Key|^Digit/,'')].filter(Boolean).join(' + ');}
  function readSettings(){let saved={};try{saved=JSON.parse(storage.getItem('tronoClips:'+owner)||'{}');}catch{}settings={...defaults(),...saved};if(!qualities[settings.quality])settings.quality='light';if(![30,60].includes(settings.fps))settings.fps=30;if(![15,30,60,120].includes(settings.seconds))settings.seconds=30;if(!settings.shortcut?.code)settings.shortcut=defaults().shortcut;settings.audio=!!settings.audio;}
  function saveSettings(){storage.setItem('tronoClips:'+owner,JSON.stringify(settings));}
  function renderState(){
    const active=!!session&&!session.stopping;
    for(const id of ['clipQuality','clipFps','clipSeconds','clipIncludeAudio'])$(id).disabled=active||starting;
    $('clipQuality').value=settings.quality;$('clipFps').value=String(settings.fps);$('clipSeconds').value=String(settings.seconds);$('clipIncludeAudio').checked=settings.audio;
    $('clipStart').disabled=starting;$('clipStart').textContent=starting?'Escolhendo origem…':active?'Parar captura':'Escolher tela ou jogo';
    const ready=active&&session.status?.ready;$('clipNow').disabled=!ready;$('clipNow').textContent='Clipar últimos '+settings.seconds+' s';
    $('clipShortcut').textContent=choosingShortcut?'Pressione o atalho…':shortcutLabel();
    $('clipSource').textContent=active?'Capturando: '+session.label+' · '+Math.floor(session.status?.seconds||0)+' s disponíveis':starting?'Aguardando sua escolha no navegador':'Captura desligada';
    $('clipFolder').textContent=directory?'Destino ao salvar: '+directory.name:'Destino ao salvar: escolher arquivo ou usar Downloads';
    $('clipResetFolder').hidden=!directory;
    $('clipChooseFolder').hidden=typeof window.showDirectoryPicker!=='function';$('clipFloating').hidden=!window.documentPictureInPicture;
    $('clipPendingCount').textContent=String(clips.filter(c=>c.blob).length);
    $('clipCaptureNotice').hidden=!active&&!starting;
    $('clipCaptureNoticeText').textContent=active?'Clipes: captura local ativa':'Clipes: escolhendo origem';
    if(pip&&!pip.closed){const status=pip.document.getElementById('pipStatus');if(status)status.textContent=$('clipSource').textContent;const button=pip.document.getElementById('pipClip');if(button){button.disabled=!ready;button.textContent='Clipar últimos '+settings.seconds+' s';}const count=pip.document.getElementById('pipCount');if(count)count.textContent=clips.filter(c=>c.blob).length+' clipes pendentes';}
  }
  function revoke(id){if(urls.has(id)){URL.revokeObjectURL(urls.get(id));urls.delete(id);}}
  function renderList(){
    const host=$('clipList');for(const id of urls.keys())revoke(id);host.replaceChildren();
    if(!clips.length){const empty=document.createElement('p');empty.className='clips-empty';empty.textContent='Seus clipes ficam aqui até você decidir salvar ou descartar.';host.appendChild(empty);}
    for(const clip of clips){
      const card=document.createElement('article');card.className='clip-card';card.dataset.clipId=clip.id;
      const heading=document.createElement('strong');heading.textContent=clip.name;
      const detail=document.createElement('small');detail.textContent=Math.round(clip.duration)+' s · '+clip.quality+' · '+clip.fps+' FPS · '+(clip.bytes/1048576).toFixed(1)+' MB';
      const state=document.createElement('span');state.className='clip-state';state.textContent=clip.state==='saved'?'Salvo na pasta escolhida':clip.state==='download'?'Download solicitado · cópia local mantida':emergency.has(clip.id)?'Pendente nesta sessão · armazenamento do navegador indisponível':'Armazenado no navegador · pendente';
      const actions=document.createElement('div');actions.className='clip-actions';
      function button(label,fn){const b=document.createElement('button');b.type='button';b.textContent=label;b.disabled=busy.has(clip.id);b.onclick=fn;actions.appendChild(b);return b;}
      if(clip.blob){
        const preview=document.createElement('div');preview.className='clip-preview';preview.hidden=true;
        button('Prévia',()=>{if(!preview.hidden){preview.querySelector('video')?.pause();preview.replaceChildren();revoke(clip.id);preview.hidden=true;return;}const video=document.createElement('video');video.controls=true;video.playsInline=true;video.preload='metadata';const url=URL.createObjectURL(clip.blob);urls.set(clip.id,url);video.src=url;video.setAttribute('aria-label','Prévia de '+clip.name);preview.appendChild(video);preview.hidden=false;});
        button('Salvar',()=>void save(clip.id));card.appendChild(preview);
      }
      button(clip.blob?'Descartar':'Remover da lista',()=>void discard(clip.id));card.prepend(heading,detail,state,actions);host.appendChild(card);
    }
    renderState();
  }
  async function refresh(){const version=++loading,current=owner;try{const saved=await store.list(current);if(version!==loading||current!==owner)return;const merged=new Map(saved.map(c=>[c.id,c]));for(const c of emergency.values())if(c.owner===current)merged.set(c.id,c);clips=[...merged.values()].sort((a,b)=>b.createdAt-a.createdAt);renderList();}catch(e){clips=[...emergency.values()].filter(c=>c.owner===owner);renderList();message(e.message);}}
  function dispose(s){if(s.closed&&!s.waiters.size){s.worker.terminate();}}
  async function retain(s,result){
    const id=result.id,createdAt=Date.now(),stamp=new Date(createdAt).toISOString().slice(0,19).replace(/[:T]/g,'-');
    const clip={id,owner:s.owner,name:'Clipe '+new Date(createdAt).toLocaleString('pt-BR'),filename:'Trono_Clipe_'+stamp+'_'+id.slice(0,8)+'.webm',createdAt,quality:s.quality,fps:s.fps,duration:result.duration,bytes:result.bytes,blob:result.blob,state:'pending'};
    try{await store.put(clip);}catch{emergency.set(id,clip);memoryOnly.add(id);if(session===s)stop(s);if(s.owner===owner)message('Captura pausada: sem espaço ou acesso ao armazenamento do navegador. Este clipe está somente na memória: salve ou descarte antes de retomar e antes de fechar a página.');}
    s.waiters.delete(id);dispose(s);if(s.owner===owner){await refresh();if(!emergency.has(id))message('Clipe armazenado. Você pode continuar jogando e guardar outros antes de salvar.');}
  }
  function stop(s=session){
    const current=s===session;if(current||!s){generation++;starting=false;}if(!s){renderState();return;}if(s.stopping)return;s.stopping=true;
    if(session===s)session=null;try{if(s.recorder.state!=='inactive')s.recorder.stop();else{s.closed=true;dispose(s);}}catch{s.closed=true;dispose(s);}
    s.stream.getTracks().forEach(t=>t.stop());if(current){renderState();message('Captura encerrada. Os clipes já armazenados continuam na lista.');}
  }
  async function start(){
    if(session){stop();return;}if(starting)return;
    if([...emergency.values()].some(c=>c.owner===owner&&c.blob)){message('Salve ou descarte os clipes guardados somente nesta sessão antes de retomar a captura.');return;}
    if(!navigator.mediaDevices?.getDisplayMedia||!window.MediaRecorder||!window.Worker){message('Este navegador não oferece captura de clipes. Use Chrome ou Edge atualizado em HTTPS.');return;}
    const request=++generation,current=owner;starting=true;renderState();let stream,worker;
    try{
      const q=qualities[settings.quality];
      stream=await navigator.mediaDevices.getDisplayMedia({video:{displaySurface:'monitor',width:{ideal:q.width,max:q.width},height:{ideal:q.height,max:q.height},frameRate:{ideal:settings.fps,max:settings.fps}},audio:settings.audio?{restrictOwnAudio:true,suppressLocalAudioPlayback:false}:false,systemAudio:settings.audio?'include':'exclude',windowAudio:settings.audio?'window':'exclude',selfBrowserSurface:'exclude'});
      if(request!==generation||current!==owner){stream.getTracks().forEach(t=>t.stop());return;}
      if(!stream.getVideoTracks().length)throw Error('Nenhuma tela ou jogo foi selecionado.');
      const video=stream.getVideoTracks()[0];try{await video.applyConstraints({width:{ideal:q.width,max:q.width},height:{ideal:q.height,max:q.height},frameRate:{ideal:settings.fps,max:settings.fps}});}catch{}
      if(request!==generation||current!==owner){stream.getTracks().forEach(t=>t.stop());return;}
      const mime=['video/webm;codecs=vp8,opus','video/webm;codecs=vp8','video/webm'].find(m=>MediaRecorder.isTypeSupported(m));if(!mime)throw Error('Este navegador não grava WebM compatível com os clipes.');
      let recorder;const options={mimeType:mime,videoBitsPerSecond:q.bitrate,audioBitsPerSecond:128000};try{recorder=new MediaRecorder(stream,{...options,videoKeyFrameIntervalDuration:2000});}catch{recorder=new MediaRecorder(stream,options);}
      const actual=video.getSettings();worker=new Worker(workerURL);const s={stream,worker,recorder,owner:current,quality:actual.width&&actual.height?actual.width+'×'+actual.height:q.label,fps:settings.fps,label:video.label||'Origem selecionada',waiters:new Set(),flushing:[],reads:Promise.resolve(),status:null,closed:false,stopping:false};session=s;
      worker.onmessage=e=>{const m=e.data;if(m.type==='status'){s.status=m;if(session===s)renderState();}else if(m.type==='clip')void retain(s,m);else if(m.type==='error'){if(m.id){s.waiters.delete(m.id);dispose(s);message(m.message);}else{s.waiters.clear();stop(s);message(m.message);}}};
      worker.onerror=()=>{s.waiters.clear();stop(s);message('Falha no buffer local de clipes. Os clipes já armazenados foram preservados.');s.closed=true;dispose(s);};
      worker.postMessage({type:'init',seconds:settings.seconds,fps:settings.fps});
      recorder.ondataavailable=e=>{s.reads=s.reads.then(async()=>{if(e.data.size){const data=await e.data.arrayBuffer();s.worker.postMessage({type:'chunk',data},[data]);}for(const id of s.flushing.splice(0))s.worker.postMessage({type:'clip',id});}).catch(()=>{s.waiters.clear();stop(s);message('Não foi possível preparar este trecho. Os clipes anteriores continuam armazenados.');});};
      recorder.onstop=()=>{void s.reads.finally(()=>{s.closed=true;dispose(s);});};recorder.onerror=()=>{stop(s);message('A gravação foi interrompida pelo navegador.');};
      stream.getVideoTracks()[0].addEventListener('ended',()=>stop(s),{once:true});recorder.start(1000);starting=false;renderState();message('Captura local iniciada. Aguarde o buffer e use Clipar; sua tela não é transmitida para a chamada.');
    }catch(e){stream?.getTracks().forEach(t=>t.stop());worker?.terminate();if(request!==generation||current!==owner)return;session=null;starting=false;renderState();message(e.name==='NotAllowedError'||e.name==='AbortError'?'Seleção de tela cancelada.':e.message||'Não foi possível iniciar a captura.');}
  }
  function clip(){const s=session;if(!s||!s.status?.ready){message('Inicie a captura e aguarde alguns segundos antes de clipar.');return;}if(s.waiters.size>=4){message('Aguarde os clipes em preparação antes de clipar novamente.');return;}const id=crypto.randomUUID();s.waiters.add(id);s.flushing.push(id);message('Preparando clipe…');try{s.recorder.requestData();}catch{s.flushing=s.flushing.filter(k=>k!==id);s.waiters.delete(id);message('A captura não está disponível. Os clipes anteriores continuam armazenados.');}}
  async function chooseFolder(){const current=owner;try{const handle=await window.showDirectoryPicker({id:'trono-clips',mode:'readwrite'});if(current!==owner)return;directory=handle;renderState();try{await store.setDirectory(current,handle);message('Pasta escolhida. Nenhum clipe é salvo nela sem clicar em Salvar.');}catch{message('Pasta escolhida para esta sessão. O navegador não permitiu lembrar essa pasta.');}}catch(e){if(e.name!=='AbortError')message('Não foi possível escolher a pasta. Você pode usar Salvar para escolher um arquivo.');}}
  async function save(id){
    const clip=clips.find(c=>c.id===id);if(!clip?.blob||busy.has(id))return;busy.add(id);let handle,writable;
    try{
      // Invoke picker/permission from this click, before storage work can expire user activation.
      if(directory){const permission=directory.queryPermission?await directory.queryPermission({mode:'readwrite'}):'granted';if(permission!=='granted'&&(!directory.requestPermission||await directory.requestPermission({mode:'readwrite'})!=='granted'))throw Error('Acesso à pasta negado. Escolha outra pasta e tente novamente.');handle=await directory.getFileHandle(clip.filename,{create:true});}
      else if(window.showSaveFilePicker)handle=await window.showSaveFilePicker({id:'trono-clips',suggestedName:clip.filename,types:[{description:'Vídeo WebM',accept:{'video/webm':['.webm']}}]});
      if(handle){writable=await handle.createWritable();await writable.write(clip.blob);await writable.close();writable=null;const saved={...clip,blob:null,state:'saved'};try{await store.put(saved);emergency.delete(id);memoryOnly.delete(id);message('Clipe salvo.');}catch{emergency.set(id,saved);message('Clipe salvo no arquivo. A lista local não pôde ser atualizada e ele pode reaparecer pendente ao recarregar.');}}
      else{const url=URL.createObjectURL(clip.blob),a=document.createElement('a');a.href=url;a.download=clip.filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);const exported={...clip,state:'download'};try{await store.put(exported);emergency.delete(id);memoryOnly.delete(id);}catch{emergency.set(id,exported);}message('Download solicitado. A cópia local fica guardada até você descartar; confira o arquivo em Downloads.');}
    }catch(e){try{await writable?.abort();}catch{}message(e.name==='AbortError'?'Salvamento cancelado. O clipe continua armazenado.':e.message||'Não foi possível salvar. O clipe continua armazenado.');}
    finally{busy.delete(id);await refresh();}
  }
  async function discard(id){if(busy.has(id))return;busy.add(id);try{if(!memoryOnly.has(id))await store.remove(id);emergency.delete(id);memoryOnly.delete(id);revoke(id);await refresh();message('Clipe removido da lista local. Arquivos já salvos em uma pasta continuam lá.');}catch(e){message(e.message);}finally{busy.delete(id);}}
  async function floating(){
    if(pip&&!pip.closed){pip.focus();return;}try{pip=await window.documentPictureInPicture.requestWindow({width:290,height:210});const doc=pip.document;doc.title='Clipes M&N';const style=doc.createElement('style');style.textContent='body{margin:0;padding:16px;background:#141727;color:#eef0ff;font:14px system-ui}button{padding:12px;width:100%;border:1px solid #8d7ec0;border-radius:10px;background:#453764;color:white;margin:8px 0;cursor:pointer}button:disabled{opacity:.5}small{display:block;color:#b5b8d2;margin:6px 0}';doc.head.appendChild(style);const title=doc.createElement('strong');title.textContent='Clipes · M&N';const status=doc.createElement('small');status.id='pipStatus';const button=doc.createElement('button');button.id='pipClip';button.onclick=clip;const count=doc.createElement('small');count.id='pipCount';const back=doc.createElement('button');back.textContent='Abrir central';back.onclick=()=>{window.focus();open();};doc.body.append(title,status,button,count,back);doc.addEventListener('keydown',keydown);renderState();}catch{message('Não foi possível abrir a janela flutuante. Use a central de clipes nesta página.');}
  }
  function keydown(e){
    if(choosingShortcut){if(e.key==='Escape'){e.preventDefault();e.stopPropagation();choosingShortcut=false;renderState();return;}if(!/^(Key[A-Z]|Digit[0-9]|F\d{1,2})$/.test(e.code))return;e.preventDefault();e.stopPropagation();const reserved=['F5','F11','F12'].includes(e.code)||((e.ctrlKey||e.metaKey)&&['KeyR','KeyW','KeyT','KeyL','KeyN','KeyP'].includes(e.code));if(reserved||(!e.ctrlKey&&!e.altKey&&!e.metaKey&&!/^F\d/.test(e.code))){message('Use Ctrl/Alt/Meta com uma tecla ou uma tecla F livre. Evite atalhos reservados do navegador.');return;}settings.shortcut={code:e.code,ctrl:e.ctrlKey,alt:e.altKey,shift:e.shiftKey,meta:e.metaKey};choosingShortcut=false;saveSettings();renderState();message('Atalho configurado. Funciona quando esta página ou a janela de clipes estiver em foco.');return;}
    const s=settings?.shortcut;if(!s||e.repeat||e.target.closest?.('input,textarea,select,[contenteditable="true"]'))return;if(e.code===s.code&&e.ctrlKey===s.ctrl&&e.altKey===s.alt&&e.shiftKey===s.shift&&e.metaKey===s.meta){e.preventDefault();e.stopPropagation();clip();}
  }
  function open(){if(!$('clipsDialog').open)$('clipsDialog').showModal();void refresh();}
  async function accountChanged(){const next=account();if(next===owner&&settings)return;stop();owner=next;readSettings();directory=null;clips=[];renderList();const current=owner;try{const saved=await store.directory(current);if(current===owner){directory=saved||null;renderState();}}catch{}await refresh();}
  function bind(){
    owner=account();readSettings();renderState();void refresh();const initialOwner=owner;void store.directory(initialOwner).then(h=>{if(owner===initialOwner){directory=h||null;renderState();}}).catch(()=>{});
    document.querySelectorAll('[data-open-clips]').forEach(b=>b.addEventListener('click',open));$('clipClose').onclick=()=>{$('clipsDialog').close();choosingShortcut=false;renderState();};$('clipStart').onclick=()=>void start();$('clipNow').onclick=clip;$('clipChooseFolder').onclick=()=>void chooseFolder();$('clipFloating').onclick=()=>void floating();$('clipShortcut').onclick=()=>{choosingShortcut=true;renderState();message('Pressione o novo atalho. Esc cancela.');};$('clipCaptureStop').onclick=()=>stop();
    $('clipResetFolder').onclick=()=>{directory=null;renderState();void store.setDirectory(owner,null).catch(()=>{});message('Ao salvar, você poderá escolher um arquivo ou usar Downloads.');};
    for(const [id,key]of [['clipQuality','quality'],['clipFps','fps'],['clipSeconds','seconds'],['clipIncludeAudio','audio']])$(id).addEventListener('change',()=>{if(session||starting)return;settings[key]=key==='audio'?$(id).checked:key==='quality'?$(id).value:Number($(id).value);saveSettings();renderState();});
    document.addEventListener('keydown',keydown,true);$('clipsDialog').addEventListener('close',()=>{choosingShortcut=false;for(const video of $('clipList').querySelectorAll('video'))video.pause();});
    window.addEventListener('trono-auth-change',()=>void accountChanged());window.addEventListener('beforeunload',e=>{if(session||starting||[...emergency.values()].some(c=>c.blob)){e.preventDefault();e.returnValue='';}});
    window.addEventListener('pagehide',()=>{stop();for(const id of urls.keys())revoke(id);});
  }
  window.addEventListener('DOMContentLoaded',bind);
  return {open,clip,stop,get active(){return !!session&&!session.stopping;}};
})();
