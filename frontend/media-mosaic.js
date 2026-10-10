'use strict';
window.TronoMosaic=(()=>{
  const $=id=>document.getElementById(id);let selected=new Set(),frame=0;
  const sources=()=>window.TronoSocial.getMediaSources();
  function close(){if($('mediaFocusDialog')?.open){cleanup();$('mediaFocusDialog').close();}selected.clear();}
  function fullscreen(person,kind){if(person?.[kind])void window.TronoSocial.fullscreenMedia(person.id,kind);}
  function attach(video,stream){if(video.srcObject!==stream)video.srcObject=stream||null;if(stream)void video.play().catch(()=>{});}
  function cleanup(){for(const video of $('mediaFocusGrid').querySelectorAll('video')){video.pause();video.srcObject=null;}$('mediaFocusGrid').replaceChildren();}
  function render(){
    const list=sources(),ids=new Set(list.map(p=>p.id));
    for(const id of selected)if(!ids.has(id))selected.delete(id);
    const toolbar=$('expandMosaicBtn');toolbar.disabled=!list.length;
    // Pair a person's screen and camera consecutively in the shared base grid.
    const order=new Map(list.map((p,i)=>[p.id,i]));
    for(const tile of document.querySelectorAll('#mediaMosaic [data-peer]'))tile.style.order=String((order.get(tile.dataset.peer)||0)*2+(tile.classList.contains('camera-tile')?1:0));
    if(!$('mediaFocusDialog').open)return;
    if(!window.TronoSocial.voiceJoined){close();return;}
    const picker=$('mediaFocusPicker');picker.replaceChildren();
    for(const p of list){const label=document.createElement('label'),checkbox=document.createElement('input'),name=document.createElement('span');checkbox.type='checkbox';checkbox.checked=selected.has(p.id);checkbox.disabled=selected.size>=6&&!checkbox.checked;name.textContent=p.name;checkbox.setAttribute('aria-label','Incluir '+p.name+' no mosaico');checkbox.onchange=()=>{if(checkbox.checked&&selected.size<6)selected.add(p.id);else selected.delete(p.id);render();};label.append(checkbox,name);picker.appendChild(label);}
    $('mediaFocusCount').textContent=selected.size+' de 6 pessoas';
    const host=$('mediaFocusGrid'),visible=list.filter(p=>selected.has(p.id));host.dataset.count=String(visible.length);
    for(const tile of [...host.children])if(!selected.has(tile.dataset.peer)){for(const video of tile.querySelectorAll('video'))video.srcObject=null;tile.remove();}
    host.querySelector('.mosaic-empty')?.remove();
    for(const p of visible){
      let cell=[...host.children].find(c=>c.dataset.peer===p.id);
      if(!cell){cell=document.createElement('article');cell.className='focus-person';cell.dataset.peer=p.id;cell.innerHTML='<div class="focus-person-media"><video class="focus-screen" autoplay muted playsinline></video><video class="focus-camera" autoplay muted playsinline></video><span class="focus-video-placeholder">Aguardando vídeo…</span></div><footer><div><strong></strong><small></small></div><div class="focus-media-actions"><button class="focus-full-screen" type="button">⛶ Tela</button><button class="focus-full-camera" type="button">⛶ Câmera</button><button class="focus-watch" type="button">▶ Assistir</button><button class="focus-camera-toggle" type="button"></button></div></footer>';host.appendChild(cell);}
      cell.querySelector('strong').textContent=p.name+(p.self?' · você':'');cell.querySelector('small').textContent=p.camera&&p.screen?'Câmera + tela':p.screen?'Tela':p.camera?'Câmera':'Aguardando mídia';
      const camera=p.camera?.getVideoTracks().some(t=>t.readyState==='live'),screen=p.screen?.getVideoTracks().some(t=>t.readyState==='live');cell.classList.toggle('has-camera',!!camera);cell.classList.toggle('has-screen',!!screen);
      attach(cell.querySelector('.focus-camera'),camera?p.camera:null);attach(cell.querySelector('.focus-screen'),screen?p.screen:null);
      for(const kind of ['screen','camera']){const button=cell.querySelector('.focus-full-'+kind);button.hidden=!(kind==='screen'?screen:camera);button.setAttribute('aria-label','Tela cheia: '+(kind==='screen'?'tela':'câmera')+' de '+p.name);button.onclick=()=>fullscreen(p,kind);cell.querySelector('.focus-'+kind).ondblclick=()=>fullscreen(p,kind);}
      const watch=cell.querySelector('.focus-watch');watch.hidden=!p.screenOffered||p.watching;watch.onclick=()=>window.TronoSocial.toggleWatchStream(p.id);
      const cameraToggle=cell.querySelector('.focus-camera-toggle');cameraToggle.hidden=p.self||!p.cameraOffered;cameraToggle.textContent=p.cameraHidden?'Mostrar câmera':'Ocultar câmera';cameraToggle.setAttribute('aria-label',(p.cameraHidden?'Mostrar':'Ocultar')+' câmera de '+p.name+' na grade');cameraToggle.onclick=()=>window.TronoSocial.toggleWatchCamera(p.id);
      cell.querySelector('.focus-video-placeholder').hidden=!!camera||!!screen;
    }
    if(!visible.length){const empty=document.createElement('p');empty.className='mosaic-empty';empty.textContent='Selecione até seis pessoas para montar sua grade.';host.appendChild(empty);}
    $('mediaFocusFullscreen').disabled=!visible.some(p=>p.screen||p.camera);
  }
  function schedule(){if(frame)return;frame=requestAnimationFrame(()=>{frame=0;render();});}
  function open(peerId){const list=sources();selected=new Set(peerId?[peerId]:list.slice(0,6).map(p=>p.id));if(!$('mediaFocusDialog').open)$('mediaFocusDialog').showModal();render();}
  function bind(){
    $('expandMosaicBtn').onclick=()=>open();$('mediaFocusClose').onclick=close;
    $('mediaFocusFullscreen').onclick=()=>{const p=sources().find(p=>selected.has(p.id)&&(p.screen||p.camera));fullscreen(p,p?.screen?'screen':'camera');};
    $('mediaFocusDialog').addEventListener('close',()=>{if(!$('mediaFocusDialog').open){cleanup();selected.clear();}});
    new MutationObserver(schedule).observe($('mediaMosaic'),{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
    window.addEventListener('trono-call-change',schedule);window.addEventListener('trono-media-change',schedule);window.addEventListener('resize',schedule);
    window.TronoNetwork.onMessage(message=>{if(['voice-roster','voice-state','channel-deleted'].includes(message.type))schedule();});render();
  }
  window.addEventListener('DOMContentLoaded',bind);
  return {open,close};
})();
