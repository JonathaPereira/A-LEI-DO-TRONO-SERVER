'use strict';
window.TronoRoguelite=(()=>{
  const $=id=>document.getElementById(id);let frame=null,loading=false,sequence=0,abort=null,immersive=false,bootTimer=null,frameReady=false;
  const active=()=>!$('rogueliteScreen').classList.contains('hidden')&&!document.hidden;
  function sync(){
    frame?.contentWindow?.postMessage({type:'mn-game-visibility',visible:active()},location.origin);
    if(!active()){if(loading){sequence++;abort?.abort();loading=false;clearTimeout(bootTimer);if(frame&&!frameReady){frame.remove();frame=null;}}if($('rogueliteScreen').classList.contains('rg-immersive'))$('rogueliteScreen').classList.remove('rg-immersive');immersive=false;if(document.fullscreenElement&&[$('rogueliteScreen'),frame].includes(document.fullscreenElement))void document.exitFullscreen().catch(()=>{});}
    updateFullscreen();
  }
  async function prepare(){
    if(frame||loading)return;loading=true;const generation=++sequence;abort=new AbortController();const signal=abort.signal;
    $('rogueliteLoading').hidden=false;$('rogueliteRetry').hidden=true;$('rogueliteProgress').value=0;
    $('rogueliteLoadStatus').textContent=window.TronoDesktop?'Preparando o jogo neste computador…':'Abrindo Cinzas do Abismo…';
    try{
      if(window.TronoDesktop){
        const response=await fetch('roguelite/asset-manifest.json',{signal});if(!response.ok)throw Error('Manifest unavailable');const manifest=await response.json();let cursor=0,done=0;
        const worker=async()=>{while(cursor<manifest.files.length){const file=manifest.files[cursor++];const resource=await fetch('roguelite/'+file.path,{signal});if(!resource.ok)throw Error('Asset unavailable');const bytes=await resource.arrayBuffer();if(bytes.byteLength!==file.bytes)throw Error('Incomplete asset');done+=file.bytes;$('rogueliteProgress').value=Math.round(done/manifest.bytes*100);$('rogueliteLoadStatus').textContent='Preparando o jogo · '+Math.round(done/manifest.bytes*100)+'%';}};
        await Promise.all([worker(),worker()]);
      }
      if(generation!==sequence||!active())return;
      frame=document.createElement('iframe');frame.id='rogueliteFrame';frame.title='Cinzas do Abismo · demo v0.5';frame.src='roguelite/index.html';frame.allow='fullscreen; gamepad';frame.setAttribute('sandbox','allow-scripts allow-same-origin allow-downloads allow-pointer-lock');frame.allowFullscreen=true;
      frameReady=false;frame.onload=()=>{sync();if(active())frame.focus();};$('rogueliteViewport').append(frame);bootTimer=setTimeout(()=>{if(frame&&!frameReady){frame.remove();frame=null;loading=false;$('rogueliteLoadStatus').textContent='Não foi possível abrir o jogo. Tente novamente.';$('rogueliteRetry').hidden=false;}},20000);
    }catch(error){abort?.abort();if(generation===sequence&&error.name!=='AbortError'){$('rogueliteLoadStatus').textContent='Não foi possível preparar o jogo. Verifique a conexão e tente novamente.';$('rogueliteRetry').hidden=false;}}
    finally{if(generation===sequence&&!frame)loading=false;}
  }
  function open(){window.TronoPortal.showOnly('rogueliteScreen');window.TronoSocial.showForRoom(false);document.body.dataset.gamesView='roguelite';sync();void prepare();}
  function updateFullscreen(){const enabled=immersive||[ $('rogueliteScreen'),frame ].includes(document.fullscreenElement)&&!!document.fullscreenElement;$('rogueliteFullscreen').textContent=enabled?'Sair da tela cheia':'Tela cheia';$('rogueliteFullscreen').setAttribute('aria-pressed',String(enabled));}
  async function fullscreen(){if(immersive||document.fullscreenElement){immersive=false;$('rogueliteScreen').classList.remove('rg-immersive');if(document.fullscreenElement)await document.exitFullscreen().catch(()=>{});}else{try{await $('rogueliteScreen').requestFullscreen();}catch{immersive=true;$('rogueliteScreen').classList.add('rg-immersive');}}updateFullscreen();}
  window.addEventListener('DOMContentLoaded',()=>{
    $('playRoguelite').onclick=open;$('rogueliteBack').onclick=()=>window.TronoGames.openLibrary();$('rogueliteRetry').onclick=()=>void prepare();$('rogueliteFullscreen').onclick=()=>void fullscreen();
    new MutationObserver(sync).observe($('rogueliteScreen'),{attributes:true,attributeFilter:['class']});document.addEventListener('visibilitychange',sync);document.addEventListener('fullscreenchange',updateFullscreen);
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&immersive){immersive=false;$('rogueliteScreen').classList.remove('rg-immersive');updateFullscreen();}});
    window.addEventListener('message',e=>{if(e.source===frame?.contentWindow&&e.origin===location.origin&&e.data?.type==='cinzas-ready'){frameReady=true;loading=false;clearTimeout(bootTimer);$('rogueliteLoading').hidden=true;sync();}});
  });
  return {open};
})();
