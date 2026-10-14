(() => {
  'use strict';
  const { Engine, SPECIALS, CARDS, CHAPTERS, TERRAIN, WEAPONS, REGIONS, COLORS, W, H, FLOOR, random, clamp } = Abyss;
  const $ = id => document.getElementById(id);
  const canvas=$('game'), ctx=canvas.getContext('2d',{alpha:false});ctx.imageSmoothingEnabled=true;
  const engine=new Engine();engine.start({seed:'cinzas-attract'});engine.status='menu';engine.player.x=420;engine.player.y=engine.groundY(420)-engine.player.h;engine.enemies=[];engine.cameraY=180;
  let selectedMode='adventure', keys={}, pressed={}, lastFrame=0, visualTime=0, shake=0, toastUntil=0, sound=true, modalPaused=false, codexFilter='all';
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse=window.matchMedia('(pointer: coarse)').matches;
  const embedded=!!window.parent&&window.parent!==window;let hostVisible=!embedded,frameRequest=0;
  if(embedded)document.documentElement.classList.add('mn-embedded');
  const keyMap={ArrowLeft:'left',KeyA:'left',ArrowRight:'right',KeyD:'right',Space:'jump',KeyW:'jump',ArrowUp:'jump',KeyJ:'attack',KeyZ:'attack',KeyK:'skill',KeyX:'skill',ShiftLeft:'dash',ShiftRight:'dash',KeyL:'dash',KeyE:'interact',Enter:'interact',KeyS:'down',ArrowDown:'down',KeyQ:'element'};
  const storageKey='cinzas-demo-v1';
  function readStorage(){try{const data=JSON.parse(localStorage.getItem(storageKey)||'{}');return data&&typeof data==='object'&&!Array.isArray(data)?data:{};}catch{return {};}}
  let stored=readStorage();if(!Array.isArray(stored.scores))stored.scores=[];stored.scores=AbyssPersistence.mergeRecords(stored.scores);sound=stored.sound!==false;const sfx=new AbyssSound.Soundscape({enabled:false,music:stored.musicVolume??(embedded?0:.42),effects:stored.effectsVolume??.8});
  const renderer=new AbyssRenderer(canvas);renderer.setQuality(stored.quality||(embedded?'low':'high'));
  const controller=new AbyssController.Controller(stored.controllerMapping||{});let padConnected=false, padUsed=false, padFocus=0, padContext='', learningAction=null;
  $('quality').value=stored.quality||(embedded?'low':'high');$('vibration').checked=stored.vibration!==false;
  function saveStorage(){try{localStorage.setItem(storageKey,JSON.stringify(stored));}catch{toast('Armazenamento indisponível: recordes ficam apenas nesta sessão.');}}
  $('nameInput').value=typeof stored.name==='string'?stored.name:'';
  function escapeHTML(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  const difficultyNames={easy:'Explorador',normal:'Aventureiro',hard:'Abismo'};
  function renderScores(){const scores=stored.scores.filter(s=>s.edition==='0.5').slice().sort(AbyssPersistence.compare).slice(0,5);$('scores').innerHTML=scores.length?scores.map((s,i)=>`<div class="score-row"><span>${String(i+1).padStart(2,'0')}</span><strong>${escapeHTML(s.name)}</strong><small>${escapeHTML(difficultyNames[s.difficulty])}</small><b>${s.wave} ondas</b></div>`).join(''):'<div class="scoreempty">Nenhuma onda registrada nesta edição.</div>';$('bestLabel').textContent=scores.length?`Líder: ${scores[0].name} · ${scores[0].wave} ondas`:'Melhor horda: —';}
  function updateRecord(){if(engine.mode!=='horde'||engine.status==='menu')return;stored.scores=AbyssPersistence.mergeRecords(stored.scores,[{edition:'0.5',score:engine.score,name:engine.name,wave:engine.completedWaves,reached:engine.stage+1,kills:engine.kills,difficulty:engine.difficulty,time:engine.time,seed:engine.seed,date:new Date().toISOString()}]);saveStorage();renderScores();}
  function refreshResume(){const cp=stored.hordeSave;const valid=cp&&new Engine().restoreCheckpoint(cp);$('continueHorde').hidden=!valid;if(valid){$('continueHorde').textContent=`CONTINUAR HORDA · ${cp.name} · ONDA ${cp.stage+1}`;$('saveNote').textContent=cp.phase==='entry'?'Retoma o início da onda salva.':'Retoma a onda concluída ou a escolha de carta pendente.';}else $('saveNote').textContent='A horda salva automaticamente entre ondas.';}
  function saveCheckpoint(){if(engine.mode==='horde'&&!['menu','ended'].includes(engine.status)){stored.hordeSave=engine.createCheckpoint();saveStorage();refreshResume();}}
  function runUI(){const difficulty=engine.difficulty;$('seedLabel').textContent='SEMENTE '+engine.seed;$('modeLabel').textContent=engine.mode==='horde'?'HORDA SEM FIM · '+difficultyNames[difficulty].toUpperCase():'EXPEDIÇÃO · '+difficultyNames[difficulty].toUpperCase();$('gameframe').classList.add('running');for(const id of ['hud','skillHud','actionHints','pauseBtn'])$(id).hidden=false;$('touchControls').hidden=!coarse;$('pauseBtn').textContent='Ⅱ Pausar';$('suspendBtn').hidden=engine.mode!=='horde';showScreen(null);if(embedded)window.scrollTo({top:0});if(sound)sfx.enable();canvas.focus();}
  function soundLabel(){$('soundBtn').setAttribute('aria-label',sound?'Desativar som':'Ativar som');$('soundBtn').title=sound?'Desativar som':'Ativar som';document.querySelector('.soundstate').textContent=sound?'on':'off';}
  renderScores();refreshResume();soundLabel();
  function toast(message,duration=3){$('toast').textContent=message;$('toast').classList.add('visible');toastUntil=visualTime+duration;}
  function showScreen(screen){$('gameframe').classList.toggle('choosing',screen==='upgradeScreen');for(const id of ['menuScreen','upgradeScreen','pauseScreen','endScreen'])$(id).hidden=id!==screen;}
  function startRun(){modalPaused=false;closeDialogs();keys={};pressed={};const difficulty=$('difficulty').value;const seed=$('dailySeed').checked?'dia-'+new Date().toLocaleDateString('en-CA',{timeZone:'America/Fortaleza'}):Math.random().toString(36).slice(2,9).toUpperCase();const name=$('nameInput').value.trim().slice(0,20)||'Andarilho';stored.name=name;saveStorage();engine.start({mode:selectedMode,difficulty,name,seed});engine.offerCards('start');runUI();processEvents();updateHUD();}
  function pause(){if(engine.status==='running'){engine.status='paused';keys={};pressed={};showScreen('pauseScreen');$('pauseBtn').textContent='▶ Continuar';}else if(engine.status==='paused'){engine.status='running';showScreen(null);$('pauseBtn').textContent='Ⅱ Pausar';canvas.focus();}}
  function goMenu(){closeDialogs();engine.start({seed:'cinzas-attract'});engine.status='menu';engine.biome=0;engine.camera=0;engine.cameraY=180;engine.player=engine.newPlayer();engine.player.x=420;engine.player.y=engine.groundY(420)-engine.player.h;engine.enemies=[];engine.projectiles=[];engine.effects=[];engine.hazards=[];engine.portals=[];engine.particles=[];engine.fields=[];engine.cleared=false;engine.events=[];keys={};pressed={};$('gameframe').classList.remove('running');$('hud').hidden=true;$('bossHud').hidden=true;$('skillHud').hidden=true;$('actionHints').hidden=true;$('prompt').hidden=true;$('pauseBtn').hidden=true;$('touchControls').hidden=true;$('modeLabel').textContent='UMA VIDA. INFINITAS COMBINAÇÕES.';$('seedLabel').textContent='SEMENTE —';$('runStatus').innerHTML='<i></i> Pronto para explorar';showScreen('menuScreen');renderScores();refreshResume();}
  function openDialog(id){if(engine.status==='upgrade')return;keys={};pressed={};if(engine.status==='running'){engine.status='paused';modalPaused=true;}else modalPaused=false;if(id==='codexDialog'){codexFilter='all';renderCodex();}if(!$(id).open)$(id).showModal();}
  function closeDialogs(){for(const id of ['helpDialog','codexDialog','controllerDialog'])if($(id).open)$(id).close();}
  for(const id of ['helpDialog','codexDialog','controllerDialog']){$(id).querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(id).close());$(id).addEventListener('close',()=>{if(modalPaused){modalPaused=false;engine.status='running';canvas.focus();}});}
  $('startBtn').onclick=startRun;$('retryBtn').onclick=startRun;$('menuBtn').onclick=goMenu;$('exitBtn').onclick=()=>{engine.end(false);processEvents();};$('resumeBtn').onclick=pause;$('pauseBtn').onclick=pause;
  $('helpBtn').onclick=()=>openDialog('helpDialog');$('footerHelp').onclick=()=>openDialog('helpDialog');$('codexBtn').onclick=()=>openDialog('codexDialog');$('pauseCardsBtn').onclick=()=>openDialog('codexDialog');
  $('brand').onclick=event=>{event.preventDefault();if(engine.status==='running')pause();else if(engine.status==='menu')window.scrollTo({top:0,behavior:'smooth'});};
  document.querySelectorAll('.modecard').forEach(button=>button.onclick=()=>{selectedMode=button.dataset.mode;document.querySelectorAll('.modecard').forEach(b=>b.classList.toggle('selected',b===button));$('startBtn').innerHTML=selectedMode==='horde'?'ENTRAR NA HORDA <span>→</span>':'INICIAR EXPEDIÇÃO <span>→</span>';});
  $('soundBtn').onclick=()=>{sound=!sound;stored.sound=sound;saveStorage();soundLabel();if(sound)sfx.enable();else sfx.mute();};
  $('continueHorde').onclick=()=>{closeDialogs();keys={};pressed={};if(!engine.restoreCheckpoint(stored.hordeSave)){toast('O salvamento não pôde ser restaurado.');return;}selectedMode='horde';$('nameInput').value=engine.name;$('difficulty').value=engine.difficulty;runUI();processEvents();updateHUD();toast('Horda retomada · '+engine.name,3);};
  $('suspendBtn').onclick=()=>{updateRecord();goMenu();toast('Horda guardada. A retomada usa a onda salva, sem os danos ou abates posteriores.',4);};
  $('exportSave').onclick=()=>{try{const blob=new Blob([AbyssPersistence.backup(stored.scores,stored.hordeSave)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='cinzas-horda-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Backup exportado.');}catch{toast('Não foi possível exportar o backup.');}};
  $('importSave').onclick=()=>$('saveFile').click();
  $('saveFile').onchange=async()=>{const file=$('saveFile').files?.[0];if(!file)return;try{if(file.size>2e6)throw new Error();const data=AbyssPersistence.parseBackup(await file.text());if(!data||data.checkpoint&&!new Engine().restoreCheckpoint(data.checkpoint))throw new Error();stored.scores=AbyssPersistence.mergeRecords(stored.scores,data.scores);if(data.checkpoint)stored.hordeSave=data.checkpoint;saveStorage();renderScores();refreshResume();toast('Recordes e horda importados.');}catch{toast('Backup inválido. O progresso anterior foi mantido.');}$('saveFile').value='';};
  for(const [id,key,level] of [['musicVolume','musicVolume',sfx.musicLevel],['effectsVolume','effectsVolume',sfx.effectsLevel]]){$(id).value=Math.round(level*100);$(id).oninput=()=>{stored[key]=Number($(id).value)/100;sfx.levels(Number($('musicVolume').value)/100,Number($('effectsVolume').value)/100);saveStorage();};}
  $('fullBtn').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('gameframe').requestFullscreen();}catch{toast('Tela cheia indisponível neste navegador.');}};
  function blocked(){return $('helpDialog').open||$('codexDialog').open||$('controllerDialog').open||/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName);}
  window.addEventListener('keydown',event=>{
    if(blocked())return;
    if(event.code==='Tab'){event.preventDefault();if(!event.repeat)openDialog('codexDialog');return;}
    if(event.code==='Escape'||event.code==='KeyP'){event.preventDefault();if(!event.repeat)pause();return;}
    if(event.key==='?'){openDialog('helpDialog');return;}
    if(engine.status==='upgrade'&&event.code==='KeyR'){event.preventDefault();if(!event.repeat)reroll();return;}
    if(engine.status==='upgrade'&&/^Digit[123]$/.test(event.code)){event.preventDefault();selectUpgrade(Number(event.code.slice(-1))-1);return;}
    if(engine.status==='running'&&/^Digit[1234]$/.test(event.code)){event.preventDefault();engine.setElement(['fire','frost','lightning','poison'][Number(event.code.slice(-1))-1]);return;}
    const action=keyMap[event.code];if(action&&engine.status==='running'){event.preventDefault();if(!keys[action]&&!event.repeat)pressed[action]=true;keys[action]=true;}
  });
  window.addEventListener('keyup',event=>{if(engine.status==='running'&&/^Digit[1234]$/.test(event.code)){event.preventDefault();engine.setElement(['fire','frost','lightning','poison'][Number(event.code.slice(-1))-1]);return;}
    const action=keyMap[event.code];if(action)keys[action]=false;});
  window.addEventListener('blur',()=>{keys={};pressed={};if(engine.status==='running')pause();});
  document.addEventListener('visibilitychange',()=>{syncHostFrame();});
  canvas.addEventListener('pointerdown',event=>{if(event.pointerType==='mouse'&&engine.status==='running'&&event.button===0){canvas.focus();keys.attack=true;pressed.attack=true;event.preventDefault();}});
  window.addEventListener('pointerup',()=>keys.attack=false);
  document.querySelectorAll('[data-key]').forEach(b=>{b.addEventListener('pointerdown',e=>{e.preventDefault();if(engine.status!=='running')return;b.setPointerCapture(e.pointerId);keys[b.dataset.key]=true;pressed[b.dataset.key]=true;b.classList.add('pressed');});const release=e=>{e.preventDefault();keys[b.dataset.key]=false;b.classList.remove('pressed');};b.addEventListener('pointerup',release);b.addEventListener('pointercancel',release);b.addEventListener('lostpointercapture',release);});

  function art(icon,color){const shapes={
    flame:'<path d="M72 13c5 29-12 29-9 47 2-13 13-17 17-32 20 24 21 45 6 56-12 10-39 4-38-14 0-16 13-26 12-43 10 9 3 21 12-14Z"/><path d="M72 49c11 16 17 30 1 33-15-2-9-19-1-33Z" fill="#f7e2ac"/>',
    snow:'<path d="M74 10v80M39 30l70 40M39 70l70-40M62 18l12 12 12-12M62 82l12-12 12 12M40 43l16-4-4-16M108 57l-16 4 4 16M52 77l4-16-16-4M96 23l-4 16 16 4" fill="none" stroke-width="3"/>',
    bolt:'<path d="m81 9-33 46h24L60 89l40-49H76Z"/><path d="m41 17-12 20h10l-4 14 18-24H42z" opacity=".4"/><path d="m111 52-11 17h10l-5 19 20-25h-13z" opacity=".4"/>',
    leaf:'<path d="M107 17C64 11 37 39 53 65c28 20 53-7 54-48Z"/><path d="M41 83 96 30M65 57l-2-19M76 46l19 2" fill="none" stroke="#132d2a" stroke-width="3"/><circle cx="108" cy="72" r="5"/><circle cx="37" cy="34" r="3"/>',
    sword:'<path d="m100 12 5 13-39 43-10-10z"/><path d="m49 53 27 23-7 7-27-23z" fill="#efd2a1"/><path d="m55 66-22 25-7-7 22-25z" fill="#677c7b"/><path d="m62 57 37-38" fill="none" stroke="#eff6e5" stroke-width="2"/>',
    bow:'<path d="M98 13C39 25 40 76 100 86L80 73C46 52 65 29 83 26z"/><path d="m99 13 1 73M32 52h89m-12-7 12 7-12 7" fill="none" stroke-width="2"/>',
    hammer:'<path d="m72 41-37 46 9 7 37-46z" fill="#8b7970"/><path d="m75 11 39 33-24 26-39-33z"/><path d="m79 19 28 23-9 9-28-23z" fill="#f4deab" opacity=".6"/>',
    staff:'<path d="m80 32-29 64 8 4 30-64z" fill="#b5bba0"/><path d="m82 8 18 16-15 19-19-17z"/><circle cx="82" cy="24" r="7" fill="#ecfae8"/><path d="m60 16-6-9m47 10 9-4m-34 34-2 8" fill="none" stroke-width="2"/>',
    heart:'<path d="M75 81 40 46C20 14 56 9 75 29c20-24 54-7 33 22Z"/><path d="m55 49 13 1 6-17 7 29 8-13h12" fill="none" stroke="#edf5d0" stroke-width="3"/>',
    shield:'<path d="m75 10 34 13-6 39-28 25-28-25-6-39z"/><path d="m75 20 23 9-5 29-18 16-18-16-5-29z" fill="#183231"/><path d="M75 29v35m-14-18h28" stroke-width="3" fill="none"/>',
    orb:'<circle cx="75" cy="49" r="23"/><circle cx="75" cy="49" r="32" fill="none" stroke-width="1"/><path d="m75 8 4 13-4 7-4-7zm0 61 4 10-4 13-4-13zM32 49l13-4 9 4-9 4zm64 0 9-4 13 4-13 4z"/><circle cx="75" cy="49" r="8" fill="#f5eede"/>',
    crystal:'<path d="m74 10 20 36-18 39-21-39zM41 36l14 26-14 20-12-21zm65-10 19 24-14 35-12-28z"/><path d="M74 10v75m32-59 5 59" stroke="#f0f4e9" stroke-width="1"/>',
    drop:'<path d="M75 10c4 22 29 31 29 52C98 98 49 98 46 62c0-21 25-30 29-52z"/><path d="M57 61q0 17 15 17" fill="none" stroke="#f3f0d1" stroke-width="3"/>',
    eye:'<path d="M26 49c28-38 71-38 99 0-27 38-71 38-99 0Z" fill="none" stroke-width="3"/><circle cx="75" cy="49" r="18"/><circle cx="75" cy="49" r="7" fill="#13262a"/><path d="M75 6v12m0 64v12M26 18l10 10m78-10-10 10" fill="none" stroke-width="2"/>',
    wind:'<path d="M25 32h61c30 0 29-33 7-27M15 49h91c31 0 32 30 11 34M35 66h36c20 0 20 22 4 20" fill="none" stroke-width="4"/>',
    arrow:'<path d="M27 76 112 18m-27 2 27-2-9 26M35 53l20 4 2 17M23 65l20 4 2 17" fill="none" stroke-width="3"/>',
    wing:'<path d="M28 72C27 46 50 26 124 16 100 37 85 72 62 79l26-28-43 37z"/><path d="m35 85 75-58M64 39l-7 25m37-24-22 9" fill="none" stroke="#13262a" stroke-width="2"/>',
    stars:'<path d="m75 15 9 21 24 10-24 9-9 25-9-25-24-9 24-10zM31 15l4 9 10 4-10 4-4 10-4-10-9-4 9-4zm87 55 4 10 11 4-11 4-4 9-4-9-10-4 10-4z"/>',
    sprout:'<path d="M74 87V40M72 63C40 65 35 32 35 24c33-1 40 19 37 39ZM77 48c-7-33 21-38 36-38 0 28-12 43-36 38Z"/><path d="M38 88h74" stroke-width="2" fill="none"/>',
    thorns:'<path d="M36 79c62-49 14-53 60-71m-57 57-11-2 16-11M75 52l16-4-9 16M61 36l-15-9 17-4M87 19l20 6-11-17" fill="none" stroke-width="4"/><circle cx="55" cy="72" r="5"/><circle cx="106" cy="68" r="4"/>',
    arc:'<path d="M30 75Q56-2 116 27M42 82q24-55 60-42" fill="none" stroke-width="3"/><path d="m118 24-19 0 16 19" fill="none" stroke-width="3"/>',
    burst:'<path d="m74 8 10 23 22-11-8 24 25 7-25 10 8 22-22-7-10 21-9-23-24 9 11-23-24-9 23-10-9-21 23 11z"/><circle cx="74" cy="51" r="18" fill="#243132"/><circle cx="74" cy="51" r="9" fill="#f4e2b3"/>',
    storm:'<path d="M40 48C20 48 27 25 46 25c1-21 31-23 39-7 25-8 42 16 28 31H40z" fill="none" stroke-width="3"/><path d="m78 44-20 25h17L61 94l35-37H77z"/>'
  };return `<svg viewBox="0 0 150 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><g fill="none" stroke="${color}" opacity=".16"><circle cx="75" cy="49" r="42"/><path d="M18 49h114M75 4v90" stroke-dasharray="2 7"/></g><g fill="${color}" stroke="${color}" stroke-width=".8" stroke-linejoin="round">${shapes[icon]||shapes.stars}</g></svg>`;}
  function cardHTML(card,index,owned=0,button=true){
    const color=COLORS[card.family],artPath=card.art?'assets/v4/card-'+card.art+'.webp':'assets/v3/card-'+(WEAPONS[card.id]?card.id:card.family)+'.webp';
    const level=Number(owned)||0,badge=card.category==='weapon'?'ESCOLHER ARMA':card.category==='element'?'DESPERTAR ELEMENTO':Number.isFinite(card.max)?`NÍVEL ${level} → ${level+1} / ${card.max}`:'REPETÍVEL';
    return `<${button?'button':'article'} class="upgradecard" style="--cardcolor:${color}"${button?` data-choice="${index}" data-current-level="${level}"`:''}><div class="cardart"><img src="${artPath}" alt="" loading="lazy"></div><div class="cardtext"><span class="cardtype">${escapeHTML(card.type.toUpperCase())}</span><h3>${escapeHTML(card.name)}</h3><p>${escapeHTML(card.desc)}</p>${button?`<small class="card-preview">${escapeHTML(engine.cardPreview(card))}</small><span class="level-step">${badge}</span>`:''}</div>${button?`<span class="cardnumber">${index+1}</span>`:level?`<span class="cardowned">NÍVEL ${level}${Number.isFinite(card.max)?' / '+card.max:''}</span>`:''}</${button?'button':'article'}>`;
  }
  function renderCards(){
    $('upgradeCards').innerHTML=engine.cards.map((c,i)=>cardHTML(c,i,engine.owned[c.id])).join('');$('upgradeCards').querySelectorAll('button').forEach(b=>b.onclick=()=>selectUpgrade(Number(b.dataset.choice)));
    $('upgradePhase').textContent='TRIO '+(engine.upgradeCount+1)+' · '+engine.draftLabel().replace(/^\d · /,'').toUpperCase();$('upgradeTitle').textContent=engine.upgradeCount===0?'Escolha sua arma.':engine.upgradeCount===1?'Desperte seu elemento.':'Fortaleça sua build.';
    $('upgradeSubtitle').textContent=engine.upgradeSource==='start'?'Sua arma define o estilo de combate. Os próximos trios trazem elemento e aprimoramentos.':engine.upgradeSource==='shrine'?'Santuário protegido. A carta fica na sua build; você continua nesta área.':engine.mode==='horde'?`Onda ${engine.stage+1} vencida. Sua build segue para a próxima onda.`:engine.chapter+': capítulo conquistado. Todas as melhorias seguem com você.';
    $('draftBuildCount').textContent=engine.upgradeCount+' melhorias adquiridas · arma '+WEAPONS[engine.player.weapon].name;$('rerollBtn').disabled=engine.rerolls<1;$('rerollBtn').textContent='Reroll · '+engine.rerolls+' restante'+(engine.rerolls===1?'':'s');
    $('choiceHint').textContent=displayProfile()==='keyboard'?'1 / 2 / 3: escolher · R: reroll (1 ficha) · repetir aprimoramentos soma níveis':`Direcional: escolher · ${AbyssController.buttonLabel(0,padProfile())}: confirmar · ${binding('reroll')}: reroll (1 ficha) · níveis se acumulam`;
  }
  function reroll(){if(engine.rerollCards()){processEvents();padContext='';}else toast('Sem fichas de reroll. Derrote guardiões ou colete 3 relíquias.');}
  $('rerollBtn').onclick=reroll;
  function selectUpgrade(i){if(engine.chooseCard(i)){showScreen(null);keys={};pressed={};processEvents();updateHUD();canvas.focus();}}
  function allBuildCards(){const seen=new Set();return [...CARDS,...(engine.selectedCards||[])].filter(c=>{if(seen.has(c.id))return false;seen.add(c.id);return true;});}
  function renderCodex(){const p=engine.player,inRun=engine.status!=='menu',count=inRun?Object.values(engine.owned).reduce((a,b)=>a+b,0):0;$('ownedCount').textContent=count;$('codexTitle').textContent=codexFilter==='owned'?'Seu poder, carta por carta.':CARDS.length+' maneiras de mudar seu destino.';$('buildSummary').textContent=inRun?`${WEAPONS[p.weapon].name} · ${Math.round(p.maxHp)} vida máxima · ${Math.round((p.power-1)*100)}% dano base adicional · ${Math.round(p.armor*100)}% resistência · ${Math.round(p.crit*100)}% crítico · ${count} melhorias`:'Primeiro armas, depois elementos, depois aprimoramentos. Reroll renova o trio. Repetir modificadores soma seus efeitos.';const cards=allBuildCards().filter(c=>codexFilter==='all'||(inRun&&engine.owned[c.id]));$('codexGrid').innerHTML=cards.length?cards.map(c=>cardHTML(c,0,inRun?engine.owned[c.id]:0,false)).join(''):'<div class="emptybuild">Sua build ainda está por nascer. Escolha sua arma ao iniciar a run.</div>';document.querySelectorAll('[data-filter]').forEach(b=>b.classList.toggle('selected',b.dataset.filter===codexFilter));}
  document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{codexFilter=b.dataset.filter;renderCodex();});
  const actionNames={jump:'Pulo / pulo duplo',dash:'Esquiva',attack:'Ataque / combo',interact:'Santuário / portal',skill:'Especial da arma',pause:'Pausa',codex:'Build / grimório',element:'Trocar elemento',reroll:'Reroll nas cartas'};
  const keyboardNames={jump:'Espaço',dash:'Shift',attack:'J',interact:'E',skill:'K',pause:'Esc',codex:'Tab',element:'Q',reroll:'R'};
  $('inputMode').value=stored.inputDisplay||'auto';
  function padProfile(){const choice=$('inputMode').value;return ['xbox','playstation','generic'].includes(choice)?choice:AbyssController.profileFor(controller.device?.id||'');}
  function displayProfile(){const mode=$('inputMode').value;return mode==='keyboard'?'keyboard':mode==='auto'?(padConnected?padProfile():'keyboard'):padProfile();}
  function binding(action){return displayProfile()==='keyboard'?keyboardNames[action]:AbyssController.buttonLabel(controller.mapping[action],padProfile());}
  function renderControlHints(){
    const profile=displayProfile(),pad=profile!=='keyboard';$('padHelp').hidden=!pad;$('keyboardHelp').hidden=pad;$('dashKey').textContent=binding('dash');$('skillKey').textContent=binding('skill');
    $('padHelp').innerHTML='<span>Analógico / direcional: mover</span>'+['jump','attack','dash','skill','interact','element','pause','codex'].map(action=>`<span><kbd>${escapeHTML(binding(action))}</kbd> ${escapeHTML(actionNames[action])}</span>`).join('')+`<span>↓ + ${binding('jump')}: descer</span>`;
    $('actionHints').innerHTML=['jump','attack','dash','skill','interact'].map(action=>`<span><kbd>${escapeHTML(binding(action))}</kbd>${actionNames[action].split(' / ')[0]}</span>`).join('');
    $('padIndicator').textContent=padConnected?'CONTROLE · '+(padProfile()==='playstation'?'PLAYSTATION':padProfile().toUpperCase()):pad?'GUIA · '+profile.toUpperCase():'TECLADO + CONTROLE';
    if(engine.status==='upgrade')renderCards();
  }
  function renderMapping(){
    const profile=padProfile();$('mappingButtons').innerHTML=Object.entries(actionNames).map(([action,label])=>`<button class="mappingbtn" data-map="${action}"><span>${label}<small>Teclado: ${keyboardNames[action]}</small></span><b>${learningAction===action?'APERTE UM BOTÃO…':escapeHTML(AbyssController.buttonLabel(controller.mapping[action],profile))}</b></button>`).join('');
    $('mappingButtons').querySelectorAll('button').forEach(button=>button.onclick=()=>{learningAction=button.dataset.map;renderMapping();});
    $('controllerDiagram').innerHTML=`<svg viewBox="0 0 460 160" role="img" aria-label="Guia dos botões de um controle"><path d="M95 45Q55 38 39 80L23 131q1 23 27 15l51-36h257l49 36q28 10 27-15l-17-52q-18-40-57-34z" fill="#172c33" stroke="#9a997c" stroke-width="2"/><path d="M84 65v48M60 89h48" stroke="#bbc7ba" stroke-width="10"/><circle cx="145" cy="113" r="18" fill="#33434a" stroke="#c6ba8a"/><circle cx="304" cy="113" r="18" fill="#33434a" stroke="#c6ba8a"/>${[[355,57,3],[378,80,1],[333,80,2],[355,103,0]].map(([x,y,b])=>`<circle cx="${x}" cy="${y}" r="11" fill="#2c4145" stroke="#d7bf89"/><text x="${x}" y="${y+4}" fill="#e6e7d5" font-size="12" text-anchor="middle">${AbyssController.buttonLabel(b,profile)}</text>`).join('')}<text x="89" y="25" fill="#e2c99a" text-anchor="middle" font-size="13">${AbyssController.buttonLabel(4,profile)} / ${AbyssController.buttonLabel(6,profile)}</text><text x="365" y="25" fill="#e2c99a" text-anchor="middle" font-size="13">${AbyssController.buttonLabel(5,profile)} / ${AbyssController.buttonLabel(7,profile)}</text><text x="229" y="89" fill="#b8c4b5" font-size="12" text-anchor="middle">${AbyssController.buttonLabel(8,profile)} · ${AbyssController.buttonLabel(9,profile)}</text></svg>`;
  }
  renderMapping();renderControlHints();
  $('inputMode').onchange=()=>{stored.inputDisplay=$('inputMode').value;saveStorage();renderMapping();renderControlHints();};
  $('controllerBtn').onclick=$('mapShortcut').onclick=()=>{learningAction=null;renderMapping();openDialog('controllerDialog');};
  $('quality').onchange=()=>{stored.quality=$('quality').value;renderer.setQuality(stored.quality);saveStorage();};
  $('vibration').onchange=()=>{stored.vibration=$('vibration').checked;saveStorage();};
  $('resetMapping').onclick=()=>{controller.mapping={...AbyssController.DEFAULT};stored.controllerMapping={...controller.mapping};learningAction=null;renderMapping();renderControlHints();saveStorage();};
  $('controllerDialog').addEventListener('close',()=>learningAction=null);
  function padTargets(){
    const dialog=['helpDialog','codexDialog','controllerDialog'].find(id=>$(id).open);
    if(dialog)return {id:dialog,items:Array.from($(dialog).querySelectorAll('button,select,input'))};
    if(engine.status==='upgrade')return {id:'upgrade-'+engine.stage+'-'+engine.draftCount,items:[...$('upgradeCards').querySelectorAll('button'),$('rerollBtn')].filter(b=>!b.disabled)};
    if(engine.status==='paused')return {id:'pause',items:[$('resumeBtn'),$('pauseCardsBtn'),$('suspendBtn'),$('exitBtn')].filter(b=>!b.hidden)};
    if(engine.status==='ended')return {id:'end',items:[$('retryBtn'),$('menuBtn')]};
    if(engine.status==='menu')return {id:'menu',items:[...document.querySelectorAll('.modecard'),$('difficulty'),$('dailySeed'),$('startBtn'),...(!$('continueHorde').hidden?[$('continueHorde')]:[]),$('soundBtn'),$('fullBtn'),$('controllerBtn')]};
    return null;
  }
  function focusPad(targets){targets.items.forEach((item,i)=>item.classList.toggle('pad-focus',i===padFocus));targets.items[padFocus]?.focus({preventScroll:true});}
  function readController(){
    let pads=[];try{if(typeof navigator!=='undefined'&&navigator.getGamepads)pads=navigator.getGamepads();}catch{}
    const state=controller.poll(pads,visualTime);
    if(state.disconnected){padFocus=0;padContext='';document.querySelectorAll('.pad-focus').forEach(b=>b.classList.remove('pad-focus'));if(padUsed&&engine.status==='running')pause();padUsed=false;toast('Controle desconectado. Use o teclado ou reconecte.');}
    if(state.connected!==padConnected||state.changed){padConnected=state.connected;renderControlHints();renderMapping();$('controllerStatus').textContent=padConnected?'Controle conectado · '+state.pad.id:'Conecte o controle e pressione um botão';if(padConnected)toast(state.pad.mapping==='standard'?'Controle conectado · '+AbyssController.buttonLabel(0,padProfile())+' confirma':'Controle detectado · ajuste os botões em Controles se necessário.');}
    if(!state.connected)return {};
    const testButtons=state.down.map((on,i)=>on?AbyssController.buttonLabel(i,padProfile()):null).filter(Boolean);$('controllerTest').textContent=testButtons.length?'Detectado: '+testButtons.join(' + '):'Controle pronto. Pressione um botão para testar.';
    if(learningAction){const button=state.buttonEdges.findIndex(Boolean);if(button>=0){controller.setBinding(learningAction,button);stored.controllerMapping={...controller.mapping};saveStorage();learningAction=null;renderMapping();renderControlHints();padContext='';}return {};}
    const dialog=['helpDialog','codexDialog','controllerDialog'].find(id=>$(id).open);
    if(state.back&&dialog){$(dialog).close();padContext='';return {};}
    if(state.pressed.pause&&!dialog){if(engine.status==='running'||engine.status==='paused'){pause();padContext='';return {};}}
    if(state.pressed.codex&&!dialog&&engine.status!=='upgrade'){openDialog('codexDialog');padContext='';return {};}
    if(state.back&&engine.status==='paused'){pause();padContext='';return {};}
    if(engine.status==='upgrade'&&state.pressed.reroll){reroll();return {};}
    const targets=padTargets();
    if(targets&&targets.items.length){
      if(targets.id!==padContext){padContext=targets.id;padFocus=0;focusPad(targets);}
      const focused=targets.items[padFocus];
      if(state.nav){
        if(focused?.type==='range'&&(state.nav==='left'||state.nav==='right')){focused.value=clamp(Number(focused.value)+(state.nav==='right'?5:-5),0,100);focused.oninput?.();}
        else if(focused?.tagName==='SELECT'&&(state.nav==='left'||state.nav==='right')){const dir=state.nav==='right'?1:-1;focused.selectedIndex=(focused.selectedIndex+dir+focused.options.length)%focused.options.length;focused.onchange?.();}
        else{padFocus=(padFocus+(state.nav==='right'||state.nav==='down'?1:-1)+targets.items.length)%targets.items.length;focusPad(targets);}
      }
      if(state.confirm){const item=targets.items[padFocus];if(item?.type==='checkbox'){item.checked=!item.checked;item.onchange?.();}else if(item?.tagName==='SELECT'){item.selectedIndex=(item.selectedIndex+1)%item.options.length;item.onchange?.();}else if(item)item.click();}
      return {};
    }
    padContext='';if(engine.status!=='running'||document.hidden)return {};
    if(Object.values(state.held).some(Boolean))padUsed=true;
    return {left:state.held.left,right:state.held.right,down:state.held.down,attack:state.held.attack,jump:state.pressed.jump,dash:state.pressed.dash,skill:state.pressed.skill,interact:state.pressed.interact,element:state.pressed.element};
  }
  function endRun(){showScreen('endScreen');$('pauseBtn').hidden=true;$('touchControls').hidden=true;$('actionHints').hidden=true;$('prompt').hidden=true;$('endEyebrow').textContent=engine.won?'OS TRÊS GUARDIÕES CAÍRAM':'A CHAMA AINDA VIVE';$('endTitle').textContent=engine.won?'Você atravessou o abismo.':'O abismo venceu.';$('endDescription').textContent=engine.won?'A demo termina aqui. Outra semente, outras cartas, outra jornada.':engine.mode==='horde'?`Você concluiu ${engine.completedWaves} ondas. A próxima run pode ir além.`:'Cada queda ensina um caminho. Experimente outra arma ou uma nova combinação.';$('endStats').innerHTML=[{v:engine.mode==='horde'?engine.completedWaves:engine.stage+1,l:engine.mode==='horde'?'ONDAS VENCIDAS':'ETAPA ALCANÇADA'},{v:engine.kills,l:'ABATES'},{v:engine.bosses,l:'CHEFES'},{v:engine.mode==='horde'?engine.score:formatTime(engine.time),l:engine.mode==='horde'?'PONTOS':'TEMPO'}].map(s=>`<div><strong>${s.v}</strong><span>${s.l}</span></div>`).join('');$('endBuild').innerHTML=allBuildCards().filter(c=>engine.owned[c.id]).map(c=>`<span style="color:${COLORS[c.family]}">${escapeHTML(c.name)}${engine.owned[c.id]>1?' ×'+engine.owned[c.id]:''}</span>`).join('');if(engine.mode==='horde'){updateRecord();if(stored.hordeSave?.seed===engine.seed&&stored.hordeSave?.name===engine.name){delete stored.hordeSave;saveStorage();refreshResume();}}}
  function processEvents(){const events=engine.events.splice(0);for(const event of events){sfx.event(event);switch(event.type){
    case 'stage':$('waveBanner').textContent=engine.mode==='horde'?(engine.bossStage?'GUARDIÃO · ':'')+engine.waveRule.name:'';toast(engine.bossStage?'GUARDIÃO · '+REGIONS[engine.biome].boss:(engine.chapter||REGIONS[engine.biome].name).toUpperCase()+' · '+(engine.mode==='horde'?'ONDA '+(engine.stage+1):'ÁREA '+(engine.stage+1)),3);$('bossHud').hidden=!engine.bossStage;saveCheckpoint();break;
    case 'clear':toast('ÁREA LIVRE · Vá até o cristal e use '+binding('interact'),4);updateRecord();saveCheckpoint();break;
    case 'upgrade':renderCards();showScreen('upgradeScreen');keys={};saveCheckpoint();break;
    case 'rerolled':renderCards();toast('Trio renovado · '+engine.rerolls+' fichas restantes',1.6);saveCheckpoint();break;
    case 'chosen':toast(event.card.name+' · nível '+event.level+' adquirido');renderCodex();saveCheckpoint();break;
    case 'attack':if(stored.vibration!==false)controller.vibrate(.1,35);break;
    case 'impact':if(event.critical&&stored.vibration!==false)controller.vibrate(.25,50);break;
    case 'skill':if(stored.vibration!==false)controller.vibrate(.3,100);break;
    case 'element':toast('Elemento · '+({arcane:'Arcano',fire:'Fogo',frost:'Gelo',lightning:'Raio',poison:'Veneno'}[event.element]),1.5);break;
    case 'relic':toast('Relíquia · +200 pontos · 3 concedem 1 reroll',2);break;
    case 'fall':toast('Você retornou ao último terreno seguro.',2);break;
    case 'hurt':if(stored.vibration!==false)controller.vibrate(.55,120);break;
    case 'bosskill':if(stored.vibration!==false)controller.vibrate(.8,260);toast('GUARDIÃO DERROTADO · +1 reroll',3);break;
    case 'shake':if(!reduced)shake=Math.max(shake,event.amount);break;
    case 'end':endRun();break;
  }}}
  function formatTime(t){return `${Math.floor(t/60).toString().padStart(2,'0')}:${Math.floor(t%60).toString().padStart(2,'0')}`;}
  let hudStamp=-1;
  const elementNames={arcane:'Explosão arcana',fire:'Anel de chamas',frost:'Onda glacial',lightning:'Tempestade elétrica',poison:'Névoa venenosa'};
  document.querySelectorAll('[data-element]').forEach(button=>button.onclick=()=>{engine.setElement(button.dataset.element);canvas.focus();});
  function updateHUD(){
    if(engine.status==='menu')return;const p=engine.player;
    $('hpBar').style.width=Math.max(0,p.hp/p.maxHp*100)+'%';$('hpLabel').textContent=Math.ceil(p.hp)+' / '+Math.round(p.maxHp);$('heroName').textContent=engine.name;$('weaponLabel').textContent=WEAPONS[p.weapon].name.toUpperCase();$('regionLabel').textContent=REGIONS[engine.biome].name.toUpperCase();$('roomLabel').textContent=engine.mode==='horde'?`Onda ${engine.stage+1}`:`Etapa ${engine.stage+1} / ${CHAPTERS.length}`;
    $('zoneLabel').textContent=engine.zoneName();$('terrainStatus').textContent=engine.player.terrain&&engine.player.terrain!=='normal'?TERRAIN[engine.player.terrain].name:'';$('buildLabel').textContent=engine.upgradeCount+' melhorias · '+engine.rerolls+' rerolls';$('killLabel').textContent=engine.kills+' abates';$('timeLabel').textContent=formatTime(engine.time);$('dashStatus').textContent=p.dashCd>0?p.dashCd.toFixed(1)+'s':'ESQUIVA';$('skillStatus').textContent=p.skillCd>0?p.skillCd.toFixed(1)+'s':SPECIALS[p.weapon].name.toUpperCase();
    const symbols={fire:'♨',frost:'❄',lightning:'ϟ',poison:'✿'};$('buffIcons').innerHTML=Object.keys(symbols).filter(k=>p[k]>0).map(k=>`<span style="color:${COLORS[k]}">${symbols[k]} ${p[k]}</span>`).join('');
    document.querySelectorAll('[data-element]').forEach(button=>{button.disabled=!p[button.dataset.element];button.classList.toggle('active',p.activeElement===button.dataset.element);});
    const progress=engine.mode==='horde'?Math.max(0,(engine.waveTotal-engine.enemies.length-engine.spawnQueue.length-engine.portals.length)/Math.max(1,engine.waveTotal)):p.x/engine.width;
    $('stageProgress').style.width=clamp(progress*100,0,100)+'%';$('objectiveLabel').textContent=engine.cleared?'Portal liberado →':engine.mode==='horde'?`Restantes: ${engine.enemies.length+engine.spawnQueue.length+engine.portals.length} · ${engine.score} pontos`:engine.bossStage?'Derrote o guardião':`Explore · ${engine.enemies.length} inimigos · ${engine.relicCount} relíquias`;
    const boss=engine.enemies.find(e=>e.type==='boss');$('bossHud').hidden=!boss;if(boss){$('bossLabel').textContent=REGIONS[engine.biome].boss+(boss.phase===2?' · FÚRIA':'');$('bossBar').style.width=Math.max(0,boss.hp/boss.maxHp*100)+'%';}
    const target=engine.interactable(),nearShrine=engine.shrines.find(s=>!s.used&&Math.abs(p.x-s.x)<130&&Math.abs(p.y+p.h-s.y)<120);$('prompt').hidden=engine.status!=='running'||!target&&!nearShrine&&!engine.cleared;
    if(target)$('prompt').innerHTML=`<kbd>${binding('interact')}</kbd> ${target.type==='exit'?engine.mode==='adventure'&&engine.stage===CHAPTERS.length-1?'Concluir expedição':engine.mode==='horde'?'Próxima onda'+(engine.willDraftAtExit()?' · escolher carta':''):'Avançar · carta · curar '+(engine.bossStage?'15%':'10%'):'Santuário · carta · curar 8%'}`;
    else if(nearShrine)$('prompt').textContent='Derrote os inimigos próximos para ativar o santuário.';
    else if(engine.cleared)$('prompt').textContent=`Portal de saída ${engine.checkpoint.x>p.x?'→':'←'} · ${Math.round(Math.abs(engine.checkpoint.x-p.x))}m`;
    $('waveBanner').hidden=engine.mode!=='horde';$('skillRecharge').style.width=clamp((1-p.skillCd/(SPECIALS[p.weapon].cooldown/p.magicRate))*100,0,100)+'%';$('runStatus').innerHTML='<i></i> '+(engine.status==='running'?'Run em andamento':engine.status==='ended'?'Run concluída':'Jornada em pausa');
  }

  function render(){renderer.draw(engine,visualTime,shake);shake*=.84;}
  function scheduleFrame(){if(hostVisible&&!document.hidden&&!frameRequest)frameRequest=requestAnimationFrame(frame);}
  function syncHostFrame(){
    const visible=hostVisible&&!document.hidden;
    if(!visible){keys={};pressed={};if(engine.status==='running')pause();if(frameRequest){cancelAnimationFrame(frameRequest);frameRequest=0;}sfx.tick(.1,{paused:true,hidden:true});}
    else{sfx.tick(.1,{paused:engine.status!=='running',hidden:false});scheduleFrame();}
    lastFrame=0;document.documentElement?.setAttribute('data-host-active',String(visible));
  }
  if(embedded)window.addEventListener('message',event=>{if(event.source===window.parent&&event.origin===location.origin&&event.data?.type==='mn-game-visibility'&&typeof event.data.visible==='boolean'){hostVisible=event.data.visible;syncHostFrame();}});
  function frame(now){frameRequest=0;if(!hostVisible||document.hidden)return;const dt=lastFrame?Math.min((now-lastFrame)/1000,1/30):1/60;lastFrame=now;visualTime+=dt;const pad=readController();const input={left:keys.left||pad.left,right:keys.right||pad.right,down:keys.down||pad.down,element:pressed.element||pad.element,attack:keys.attack||pad.attack,jump:pressed.jump||pad.jump,dash:pressed.dash||pad.dash,skill:pressed.skill||pad.skill,interact:pressed.interact||pad.interact};pressed={};engine.update(dt,input);processEvents();sfx.scene(engine.biome,engine.bossStage&&engine.status!=='menu',engine.environment().tunnel);sfx.tick(dt,{paused:engine.status!=='running',hidden:document.hidden});render();if(Math.floor(visualTime*12)!==hudStamp){hudStamp=Math.floor(visualTime*12);updateHUD();}if(visualTime>toastUntil)$('toast').classList.remove('visible');scheduleFrame();}
  renderCodex();scheduleFrame();
  if(embedded)window.parent.postMessage({type:"cinzas-ready",version:"0.5"},location.origin);
})();
