'use strict';
window.TronoPortal = (()=>{
  const $=id=>document.getElementById(id);
  const storage=window.TronoStorage||localStorage;
  const allPrimaryScreens=()=>['portalScreen','setupScreen','roomScreen','chatOnlyScreen','gameScreen','gamesScreen','azulScreen'].map($).filter(Boolean);
  const safeName=value=>[...String(value??'').replace(/[<>]/g,'').replace(/[\u0000-\u001F\u007F]/g,' ')].slice(0,20).join('');
  let nameCheckTimer=null,nameCheckSeq=0,voiceOpening=null,navigationSeq=0;

  function syncIdentity(value,{persist=true}={}){
    const name=safeName(window.TronoAuth?(window.TronoAuth.user?.nickname||(window.TronoAuth.guest?value||window.TronoAuth.guest.nickname:'')):value);
    if($('portalIdentity')&&$('portalIdentity').value!==name)$('portalIdentity').value=name;
    if($('playerIdentity')&&$('playerIdentity').value!==name)$('playerIdentity').value=name;
    if($('p0Name')&&$('p0Name').value!==name)$('p0Name').value=name;
    if($('portalPlayerLabel'))$('portalPlayerLabel').textContent=name.trim()||'Sem nome';
    if(persist)storage.setItem('tronoPlayerName',name);
    return name;
  }
  function setNameFeedback(result={}){
    const available=!!result.available,code=result.code||'',text=result.message||'';
    for(const id of ['portalNameAvailability','nameAvailability']){
      const el=$(id);if(!el)continue;el.textContent=text;el.classList.toggle('available',available);el.classList.toggle('taken',code==='NAME_TAKEN');el.classList.toggle('required',code==='NAME_REQUIRED');el.classList.toggle('checking',code==='CHECKING');
    }
    return result;
  }
  async function validateIdentity({silent=false,game=false}={}){
    if(window.TronoAuth?.ready)await window.TronoAuth.ready;
    if(window.TronoAuth&&!window.TronoAuth.user&&!(game&&window.TronoAuth.guest)){if(game)window.TronoAuth.openGuest();else window.TronoAuth.open('login');return {ok:false,code:'AUTH_REQUIRED',message:game?'Escolha um nome de convidado ou entre na sua conta.':'O chat M&N exige login. Entre na sua conta para continuar.'};}
    const raw=safeName($('portalIdentity')?.value??$('playerIdentity')?.value??''),name=raw.trim();
    if(!name)return setNameFeedback({available:false,code:'NAME_REQUIRED',message:'Digite um nome para entrar.'}),{ok:false,name:'',code:'NAME_REQUIRED'};
    syncIdentity(name);
    try{
      const result=await window.TronoNetwork?.checkName?.(name);
      if(result){setNameFeedback(result);return {ok:!!result.available,name:result.name||name,code:result.code||null,message:result.message||''};}
    }catch(err){if(!silent)setNameFeedback({available:false,code:'NETWORK_OFFLINE',message:'Não foi possível validar o nome agora.'});return {ok:false,name,code:err.code||'NAME_CHECK_FAILED',message:err.message};}
    return {ok:true,name};
  }
  function queueNameCheck(value){
    if(window.TronoAuth&&!window.TronoAuth.user&&!window.TronoAuth.guest){syncIdentity('');setNameFeedback({available:false,code:'AUTH_REQUIRED',message:'Entre ou jogue como convidado.'});return;}
    const name=syncIdentity(value),seq=++nameCheckSeq;clearTimeout(nameCheckTimer);
    if(!name.trim()){setNameFeedback({available:false,code:'NAME_REQUIRED',message:'Digite um nome para entrar.'});return;}
    setNameFeedback({available:false,code:'CHECKING',message:'Verificando disponibilidade…'});
    nameCheckTimer=setTimeout(async()=>{try{const result=await window.TronoNetwork?.checkName?.(name.trim());if(seq===nameCheckSeq&&result)setNameFeedback(result);}catch{if(seq===nameCheckSeq)setNameFeedback({available:false,code:'NETWORK_OFFLINE',message:'Aguardando servidor para validar o nome.'});}},300);
  }

  function showOnly(id){
    if(!$(id))throw new Error('A tela solicitada não terminou de carregar. Recarregue com Ctrl+F5.');
    for(const screen of allPrimaryScreens())screen.classList.toggle('hidden',screen.id!==id);
    $('portalStage')?.style.setProperty('--px','0');$('portalStage')?.style.setProperty('--py','0');
    document.body.classList.toggle('portal-active',id==='portalScreen');
    if(id!=='chatOnlyScreen')document.body.classList.remove('chat-only-active');
    window.TronoSocial?.setChatHubMode?.(id==='chatOnlyScreen');
    if(id==='gameScreen'||id==='roomScreen'){window.TronoSocial?.showForRoom?.(!!window.TronoSocial.voiceJoined);window.TronoSocial?.showPanel?.(false);}
  }

  function showPortal(){
    navigationSeq++;
    showOnly('portalScreen');
    try{window.TronoSocial?.showForRoom?.(false);window.TronoSocial?.setChatHubMode?.(false);}catch(err){console.warn('Não foi possível fechar os controles de voz:',err);}
    syncIdentity($('playerIdentity')?.value||$('portalIdentity')?.value||storage.getItem('tronoPlayerName')||'Jogador',{persist:false});
    setNav('home');
  }

  function openGame(direct=false){
    if(direct!==true&&window.TronoGames)return window.TronoGames.openLibrary();
    if(window.TronoAuth&&!window.TronoAuth.user&&!window.TronoAuth.guest){window.TronoAuth.openGuest();return;}
    navigationSeq++;
    syncIdentity($('portalIdentity')?.value);
    showOnly('setupScreen');
    setNav('game');
    window.TronoNetwork?.requestRooms?.();
    requestAnimationFrame(()=>$('playerIdentity')?.focus?.({preventScroll:true}));
  }

  function setVoiceEntryStatus(message='',busy=false){
    const status=$('portalEntryStatus'),button=$('openVoicePortalBtn');
    if(status)status.textContent=message;
    if(button){button.disabled=busy;button.setAttribute('aria-busy',String(busy));}
  }
  function openVoice(){
    if(voiceOpening)return voiceOpening;
    const seq=++navigationSeq;
    voiceOpening=(async()=>{
      try{
        if(!window.TronoChatHub?.enter||!window.TronoSocial?.showForRoom||!window.TronoNetwork?.joinChatOnly)
          throw new Error('O chat não terminou de carregar. Recarregue com Ctrl+F5; se persistir, confira os arquivos publicados.');
        setVoiceEntryStatus('Verificando seu nome…',true);
        void window.TronoAudio?.ensureAudio?.().catch(()=>{});
        const validation=await validateIdentity();
        if(seq!==navigationSeq)return false;
        if(!validation.ok){setVoiceEntryStatus(validation.message||'Escolha um nome disponível.');$('portalIdentity')?.focus();return false;}
        syncIdentity(validation.name);
        setVoiceEntryStatus('Abrindo o chat…',true);
        const entered=await window.TronoChatHub.enter({validatedIdentity:validation});
        if(seq!==navigationSeq)return false;
        if(!entered||$('chatOnlyScreen')?.classList.contains('hidden'))throw new Error('Não foi possível abrir a tela de voz. Recarregue com Ctrl+F5.');
        setNav('voice');setVoiceEntryStatus();return true;
      }catch(err){
        console.error('Falha ao abrir o chat de voz:',err);
        if(seq===navigationSeq){showPortal();setVoiceEntryStatus(err.message||'Não foi possível abrir o chat. Tente novamente.');}
        return false;
      }
    })().finally(()=>{voiceOpening=null;const btn=$('openVoicePortalBtn');if(btn){btn.disabled=false;btn.setAttribute('aria-busy','false');}});
    return voiceOpening;
  }

  function setNav(target){
    document.querySelectorAll('.portal-nav-btn').forEach(btn=>btn.classList.toggle('active',btn.dataset.portalTarget===target));
  }

  function updateServerStatus(connected,detail=''){
    const dot=document.querySelector('.portal-status-dot'),label=$('portalServerStatus');
    dot?.classList.toggle('online',!!connected);
    dot?.classList.toggle('offline',connected===false);
    if(label)label.textContent=connected?(detail||'Servidor conectado'):(detail||'Reconectando…');
  }

  function currentTrackId(){return storage.getItem('tronoMusicTrack')||'lofi';}
  function updateNowPlaying(id=currentTrackId()){
    const track=window.TRONO_MUSIC_TRACKS?.[id]||window.TRONO_MUSIC_TRACKS?.lofi;
    if($('portalNowPlaying')&&track)$('portalNowPlaying').textContent=`${track.label} • ${track.artist}`;
  }

  function showCredits(){
    let dialog=$('portalCreditsDialog');
    if(!dialog){
      dialog=document.createElement('dialog');dialog.id='portalCreditsDialog';dialog.className='portal-credits-dialog';
      dialog.innerHTML=`<form method="dialog"><button class="portal-dialog-close" aria-label="Fechar">×</button><span class="portal-kicker"><i></i> TRILHA SONORA</span><h2>Música moderna em CC0</h2><p>As faixas externas abaixo foram publicadas pelos próprios autores em CC0/Public Domain. Se a origem ficar indisponível, o site usa automaticamente as composições locais originais do protótipo.</p><div class="portal-credit-list"><article><b>Lo-fi</b><strong>Lofi again</strong><span>omfgdude • CC0</span></article><article><b>EDM</b><strong>Joyfully</strong><span>MintoDog • CC0</span></article><article><b>Rock</b><strong>Codename Granny II</strong><span>Kistol • CC0</span></article><article><b>Eletrônica</b><strong>Claimed by the Void</strong><span>vitalezzz • CC0</span></article></div><small>Fontes e URLs estão documentadas em assets/audio/TRILHAS_CC0.md.</small></form>`;
      document.body.appendChild(dialog);
      dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
    }
    if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');
  }

  function bindParallax(){
    const stage=$('portalStage');if(!stage||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    let frame=0;
    const reset=()=>{if(frame)cancelAnimationFrame(frame);frame=0;stage.style.setProperty('--px','0');stage.style.setProperty('--py','0');};
    stage.addEventListener('pointermove',e=>{
      if(frame)return;
      frame=requestAnimationFrame(()=>{
        frame=0;const r=stage.getBoundingClientRect();if(!r.width||!r.height){reset();return;}
        const x=Math.max(-1,Math.min(1,((e.clientX-r.left)/r.width-.5)*2)),y=Math.max(-1,Math.min(1,((e.clientY-r.top)/r.height-.5)*2));
        stage.style.setProperty('--px',x.toFixed(3));stage.style.setProperty('--py',y.toFixed(3));
      });
    });
    stage.addEventListener('pointerleave',reset);window.addEventListener('resize',reset);
  }

  function bind(){
    const stored=storage.getItem('tronoPlayerName');const saved=stored!==null?stored:($('playerIdentity')?.value||'Jogador');syncIdentity(saved,{persist:false});
    document.body.classList.add('portal-active');
    $('portalIdentity')?.addEventListener('input',e=>queueNameCheck(e.target.value));
    $('playerIdentity')?.addEventListener('input',e=>queueNameCheck(e.target.value));
    $('openGamePortalBtn')?.addEventListener('click',openGame);
    $('openVoicePortalBtn')?.addEventListener('click',openVoice);
    $('backFromLobbyBtn')?.addEventListener('click',showPortal);
    $('portalBrandBtn')?.addEventListener('click',showPortal);
    $('portalCreditsBtn')?.addEventListener('click',showCredits);
    $('voicePortalCard')?.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&!e.target.closest('button')){e.preventDefault();void openVoice();}});
    $('gamePortalCard')?.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&!e.target.closest('button')){e.preventDefault();openGame();}});
    document.querySelectorAll('.portal-nav-btn').forEach(btn=>btn.addEventListener('click',()=>{
      const t=btn.dataset.portalTarget;if(t==='voice')void openVoice();else if(t==='game')openGame();else showPortal();
    }));
    window.addEventListener('trono-music-track',e=>updateNowPlaying(e.detail?.id));updateNowPlaying();
    bindParallax();
    window.TronoNetwork?.onMessage?.(msg=>{
      if(msg.type==='connection')updateServerStatus(!!msg.connected,msg.connected?'Servidor conectado':'Reconectando…');
      if(msg.type==='welcome'){updateServerStatus(true,`Servidor ${msg.serverVersion||'online'}`);queueNameCheck($('portalIdentity')?.value||'');}
    });
    updateServerStatus(!!window.TronoNetwork?.connected,window.TronoNetwork?.connected?'Servidor conectado':'Conectando à Corte…');
  }

  window.addEventListener('DOMContentLoaded',bind);
  return {showPortal,showOnly,openGame,openVoice,syncIdentity,validateIdentity,setNameFeedback,queueNameCheck};
})();
