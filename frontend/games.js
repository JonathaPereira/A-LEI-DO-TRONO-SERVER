'use strict';
window.TronoGames=(()=>{
  const $=id=>document.getElementById(id),R=window.AzulRules,P=window.AzulPresentation;
  let room=null,selection=null,rooms=[],resumeId=null,ranking=[],rankingError='',notice='',pending=false,pendingTimer=null,rankingRequest=null;
  let replay=null,replayQueue=[],replayGeneration=0,replayTimer=null,replayWake=null,detail=null,fullscreenFallback=false;
  const reducedMotion=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const displayState=()=>replay?.state||room?.state;
  const locked=()=>pending||!!replay;
  const el=(tag,className,text)=>{const n=document.createElement(tag);if(className)n.className=className;if(text!==undefined)n.textContent=text;return n;};
  function button(text,fn,className='az-button'){const n=el('button',className,text);n.type='button';n.onclick=fn;return n;}
  function tile(color,{ghost=false}={}){const n=el('span','az-tile az-color-'+color+(ghost?' az-ghost':''),'');n.setAttribute('aria-label',color===5?'Marcador de primeiro jogador':R.colors[color]);return n;}
  function show(id){if(id!=='azulScreen'){finishReplay();void exitFullscreen();}window.TronoPortal.showOnly(id);window.TronoSocial.showForRoom(false);document.body.dataset.gamesView=id==='gamesScreen'?'library':'azul';}
  function openLibrary(){show('gamesScreen');if(window.TronoAuth.user)void request('list');}
  function openThrone(){if(window.TronoDesktopShell)return window.TronoDesktopShell.navigate('throne');if(window.TronoAppLayout)return window.TronoAppLayout.navigate('throne');window.TronoPortal.openGame(true);}
  async function request(action,payload={}){
    try{
      if(!await window.TronoNetwork.ensureAzul())return false;
      if(!window.TronoNetwork.azul(action,payload))throw Error('Conexão interrompida. Tente novamente.');return true;
    }catch(error){notice=error.message;render();return false;}
  }
  function refreshRanking(){rankingError='';rankingRequest=crypto.randomUUID();void request('ranking',{requestId:rankingRequest});}
  function openAzul(){show('azulScreen');render();void request('list');refreshRanking();}
  function sendMove(row){
    if(locked()||!selection||!room?.state||room.state.players[room.state.turn]?.id!==window.TronoAuth.user?.id)return;
    pending=true;clearTimeout(pendingTimer);pendingTimer=setTimeout(()=>{pending=false;notice='Aguardando conexão. Confira a mesa antes de tentar novamente.';render();void request('state');},12000);
    void request('move',{revision:room.state.revision,move:{...selection,row}}).then(ok=>{if(!ok){pending=false;clearTimeout(pendingTimer);render();}});render();
  }
  function colorLabel(color){return color===5?'primeiro jogador':R.colors[color];}
  function sound(kind){if(!$('azulScreen').classList.contains('hidden')&&!document.hidden)window.TronoAudio?.playSfx(kind);}
  function sourceButton(tiles,source,color,{factory=false}={}){
    const count=tiles.filter(c=>c===color).length;
    const n=button('',()=>{selection={source,color};notice='';sound('azul-pick');render();},'az-pick');
    n.dataset.noClickSfx='1';n.dataset.source=source;n.dataset.color=color;n.title='Pegar '+count+' '+R.colors[color];
    if(factory){n.append(tile(color));}else{n.append(tile(color),el('b','az-pick-count','×'+count));}
    n.setAttribute('aria-label',(source===-1?'Centro':'Fábrica '+(source+1))+': pegar '+count+' '+R.colors[color]);
    n.disabled=locked()||displayState().phase!=='draft'||displayState().players[displayState().turn].id!==window.TronoAuth.user?.id;
    n.classList.toggle('selected',selection?.source===source&&selection.color===color);return n;
  }
  function sources(state){
    const section=el('section','az-supply');section.setAttribute('aria-label','Fábricas e centro');
    const heading=el('div','az-supply-title');heading.append(el('span','az-eyebrow','A MESA DOS ARTESÃOS'),el('strong','','Mercado de azulejos'),el('small','',state.bagCount+' no saco · '+state.discardCount+' no descarte'));section.append(heading);
    const ring=el('div','az-market-ring');ring.dataset.factories=state.factories.length;
    state.factories.forEach((tiles,source)=>{
      const angle=(-90+source*360/state.factories.length)*Math.PI/180,disk=el('div','az-factory');
      disk.style.setProperty('--factory-x',(50+37*Math.cos(angle))+'%');disk.style.setProperty('--factory-y',(50+37*Math.sin(angle))+'%');disk.dataset.factory=source;
      disk.append(el('span','az-factory-label',String(source+1)));
      const pieces=el('div','az-factory-pieces');
      // Four fixed positions retain the physical layout even when colors repeat.
      // Repeated pieces select the same group; only its first is a tab stop.
      tiles.forEach((color,i)=>{const pick=sourceButton(tiles,source,color,{factory:true});if(tiles.indexOf(color)!==i){pick.tabIndex=-1;pick.setAttribute('aria-hidden','true');}pieces.append(pick);});
      if(!tiles.length)disk.append(el('span','az-empty-factory','✥'));else disk.append(pieces);ring.append(disk);
    });
    const center=el('section','az-center');center.append(el('strong','','CENTRO'));const pool=el('div','az-center-tiles');
    if(state.marker)pool.append(tile(5));for(const color of new Set(state.center))pool.append(sourceButton(state.center,-1,color));
    if(!state.center.length)pool.append(el('small','',state.phase==='scoring'?'Contando os mosaicos…':'As sobras vêm para cá'));center.append(pool);ring.append(center);section.append(ring);
    const selectedCount=selection?(selection.source===-1?state.center:state.factories[selection.source]).filter(c=>c===selection.color).length:0;
    const instruction=el('p','az-instruction',replay?'Acompanhe cada azulejo e suas conexões.':selection?selectedCount+' × '+R.colors[selection.color]+' · escolha uma linha destacada. As sobras vão para o chão.':'Escolha uma cor. Depois, escolha uma linha no seu tabuleiro.');
    section.append(instruction);return section;
  }
  function playerBoard(p,index,state){
    const mine=p.id===window.TronoAuth.user?.id,active=state.phase==='draft'&&state.turn===index,scoring=detail?.playerId===p.id;
    const article=el('article','az-board'+(mine?' az-mine':'')+(active?' az-turn':'')+(scoring?' az-scoring':''));article.dataset.azulPlayer=p.id;
    const h=el('header','az-board-heading'),who=el('div','az-name-plaque');
    who.append(el('strong','',p.name+(mine?' · você':'')),el('small','',p.forfeited?'Saiu · bot jogando':p.bot?'Artesão automático':scoring?'Pontuando o mosaico':active?'Sua escolha de azulejos':'Artesão'));
    const points=el('div','az-score-plaque');points.append(el('small','','PONTOS'),el('b','az-score',p.score+' pts'));const cube=el('span','az-score-cube');cube.setAttribute('aria-hidden','true');points.prepend(cube);h.append(who,points);article.append(h);
    const grid=el('div','az-board-grid'),lines=el('div','az-lines'),arrows=el('div','az-wall-arrows'),wall=el('div','az-wall');
    p.lines.forEach((line,row)=>{
      const valid=mine&&active&&selection&&!locked()&&R.canPlace(p,row,selection.color),lineButton=button('',()=>sendMove(row),'az-pattern-row');
      lineButton.dataset.azulRow=row;lineButton.dataset.noClickSfx='1';lineButton.disabled=!valid;lineButton.classList.toggle('az-valid',!!valid);
      lineButton.classList.toggle('az-row-scoring',scoring&&detail.kind==='placement'&&detail.row===row);
      lineButton.setAttribute('aria-label','Linha '+(row+1)+': '+line.count+' de '+(row+1)+(line.color!==null?', '+colorLabel(line.color):'')+(valid?', colocar azulejos selecionados':''));
      for(let j=0;j<row+1;j++)lineButton.append(j>=row+1-line.count?tile(line.color):el('span','az-slot'));lines.append(lineButton);
      const arrow=el('span','az-wall-arrow','');arrow.setAttribute('aria-hidden','true');arrows.append(arrow);
      for(let col=0;col<5;col++){
        const color=(col-row+5)%5,cell=el('span','az-wall-cell');cell.dataset.cell=row+','+col;cell.append(tile(color,{ghost:!p.wall[row][col]}));
        if(scoring&&detail.cells?.some(([r,c])=>r===row&&c===col))cell.classList.add('az-connected');
        if(scoring&&detail.kind==='placement'&&detail.row===row&&detail.col===col){cell.classList.add('az-score-target');if(detail.landed)cell.append(el('b','az-points-pop','+'+detail.points));}
        wall.append(cell);
      }
    });grid.append(lines,arrows,wall);article.append(grid);
    const bottom=el('div','az-board-bottom'),floor=el('div','az-floor');floor.classList.toggle('az-floor-scoring',scoring&&detail.kind==='floor');
    const drop=button('Chão',()=>sendMove(-1),'az-floor-label');drop.disabled=!(mine&&active&&selection&&!locked());drop.title='Enviar os azulejos selecionados para o chão';drop.dataset.noClickSfx='1';floor.append(drop);
    const slots=el('div','az-floor-slots');for(let i=0;i<7;i++){const slot=el('div','az-floor-slot');slot.append(el('small','','−'+R.penalties[i]),p.floor[i]!==undefined?tile(p.floor[i]):el('span','az-slot'));slots.append(slot);}floor.append(slots);
    const bonus=el('div','az-bonus-key');bonus.setAttribute('aria-label','Bônus finais: linha 2, coluna 7, cor completa 10 pontos');
    for(const [symbol,value]of [['━━━━','+2'],['▥','+7'],['✥','+10']]){const item=el('span');item.append(el('i','',symbol),el('b','',value));bonus.append(item);}bottom.append(floor,bonus);article.append(bottom);
    const recap=el('p','az-round-score');if(p.last){recap.textContent='Rodada: +'+p.last.points+' na parede · −'+p.last.penalty+' no chão · saldo '+(p.last.delta>=0?'+':'')+p.last.delta;recap.title='O total nunca fica abaixo de zero.';}else recap.textContent=mine?'Seu ateliê · complete as linhas da direita para a esquerda':'Ateliê de '+p.name;article.append(recap);
    if(p.bonus)article.append(el('p','az-bonus','Bônus: '+p.bonus.rows+' linhas × 2 · '+p.bonus.columns+' colunas × 7 · '+p.bonus.sets+' cores × 10 = +'+p.bonus.total));return article;
  }
  function replayVisible(){return !$('azulScreen').classList.contains('hidden')&&!document.hidden;}
  function delay(ms,generation){
    if(generation!==replayGeneration)return Promise.resolve();
    return new Promise(resolve=>{replayWake=resolve;replayTimer=setTimeout(()=>{replayWake=null;replayTimer=null;resolve();},ms);});
  }
  function finishReplay(){
    replayGeneration++;clearTimeout(replayTimer);replayWake?.();replayWake=null;replayTimer=null;replay=null;replayQueue=[];detail=null;
    document.querySelectorAll('.az-flying-tile').forEach(n=>{n.getAnimations().forEach(a=>a.cancel());n.remove();});if($('azulContent'))render();
  }
  function fly(color,from,to,duration=700){
    if(!from||!to||reducedMotion()||!replayVisible())return;
    const a=from.getBoundingClientRect(),b=to.getBoundingClientRect();if(!a.width||!b.width)return;
    const n=tile(color);n.classList.add('az-flying-tile');Object.assign(n.style,{left:a.left+'px',top:a.top+'px',width:a.width+'px',height:a.height+'px'});$('azulScreen').append(n);
    const animation=n.animate([{transform:'translate(0,0) rotate(-5deg) scale(1)',opacity:1},{transform:`translate(${(b.left-a.left)*.5}px,${(b.top-a.top)*.5-25}px) rotate(8deg) scale(1.15)`,offset:.5},{transform:`translate(${b.left-a.left}px,${b.top-a.top}px) rotate(0) scale(${b.width/a.width})`,opacity:1}],{duration,easing:'cubic-bezier(.3,.1,.2,1)',fill:'forwards'});
    animation.finished.catch(()=>{}).finally(()=>n.remove());
  }
  function stepCopy(step){
    const name=replay.state.players.find(p=>p.id===step.playerId).name;
    if(step.kind==='placement'){
      const explanation=step.horizontal>1&&step.vertical>1?step.horizontal+' na horizontal + '+step.vertical+' na vertical':step.horizontal>1?step.horizontal+' azulejos conectados na horizontal':step.vertical>1?step.vertical+' azulejos conectados na vertical':'Azulejo isolado';
      return {name,label:'Linha '+(step.row+1)+' → parede',description:explanation,points:'+'+step.points};
    }
    if(step.kind==='floor')return {name,label:'Penalidade do chão',description:'Chão: −'+step.penalty+' · desconto aplicado: '+step.applied+' · mínimo de 0 pontos.',points:'−'+step.applied};
    const label={rows:'linhas completas',columns:'colunas completas',sets:'conjuntos da mesma cor'}[step.type];
    return {name,label:'Bônus de '+label,description:step.count+' '+label+' × '+({rows:2,columns:7,sets:10}[step.type])+' pontos',points:'+'+step.points};
  }
  function scoringBanner(){
    const banner=el('section','az-scoring-banner');banner.setAttribute('aria-label','Contagem de pontos');banner.setAttribute('role','status');banner.setAttribute('aria-live','polite');
    const copy=el('div','az-scoring-copy');
    if(detail){const text=stepCopy(detail);copy.append(el('small','',text.name+' · rodada '+replay.round),el('strong','',text.label),el('span','',text.description));banner.append(el('b','az-scoring-value'+(detail.kind==='floor'?' az-negative':''),text.points));}
    else copy.append(el('small','','O MERCADO FECHOU'),el('strong','','Vamos pontuar a rodada '+replay.round),el('span','','Uma peça de cada linha completa vai para a parede.'));
    const progress=el('span','az-scoring-progress',replay.progress+' / '+replay.total);banner.append(copy,progress,button('Concluir contagem',finishReplay,'az-button'));return banner;
  }
  async function playReplays(){
    if(replay||!replayQueue.length)return;
    const generation=replayGeneration;
    while(replayQueue.length&&generation===replayGeneration){
      replay=replayQueue.shift();replay.total=replay.steps.filter(s=>s.kind!=='recap').length;replay.progress=0;detail=null;render();
      await delay(900,generation);
      for(const step of replay?.steps||[]){
        if(generation!==replayGeneration)return;
        if(step.kind==='recap'){P.apply(replay.state,step);continue;}
        detail={...step,landed:false};replay.progress++;render();
        const board=$('azulContent').querySelector('[data-azul-player="'+step.playerId+'"]');
        const focus=step.kind==='placement'?board?.querySelector('[data-cell="'+step.row+','+step.col+'"]'):step.kind==='floor'?board?.querySelector('.az-floor'):board;
        const bounds=focus?.getBoundingClientRect(),area=$('azulScreen').getBoundingClientRect(),bannerHeight=$('azulContent').querySelector('.az-scoring-banner').offsetHeight;
        if(bounds&&(bounds.top<area.top+bannerHeight+12||bounds.bottom>area.bottom-12))focus.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});
        if(step.kind==='placement'){
          fly(step.color,board?.querySelector('[data-azul-row="'+step.row+'"] .az-tile:last-child'),board?.querySelector('[data-cell="'+step.row+','+step.col+'"]'));
          await delay(720,generation);if(generation!==replayGeneration)return;
        }
        P.apply(replay.state,step);detail.landed=true;render();sound(step.kind==='floor'?'azul-penalty':'azul-score');
        await delay(step.kind==='bonus'?1600:1250,generation);
      }
      if(generation!==replayGeneration)return;
      detail=null;await delay(800,generation);replay=null;
    }
    if(generation===replayGeneration){detail=null;render();}
  }
  function receiveRoom(next){
    const previous=room;if(previous&&previous.id!==next.id)finishReplay();
    const job=previous?.id===next.id?P.round(previous.state,next.state):null;
    const from=next.state?.last&&document.querySelector('.az-pick[data-source="'+next.state.last.source+'"][data-color="'+next.state.last.color+'"]');
    const rect=from?.getBoundingClientRect();
    const changed=previous?.id!==next.id||previous?.state?.revision!==next.state?.revision;
    room=next;resumeId=room.id;if(changed){selection=null;pending=false;clearTimeout(pendingTimer);}notice='';
    if(job&&replayVisible()&&!reducedMotion())replayQueue.push(job);
    if(!replay&&replayQueue.length){void playReplays();return;}
    // Keep the current flight/pop intact when a bot, roster or save update
    // arrives. The authoritative room is already current; reveal it at the end.
    if(replay)return;
    render();
    if(!job&&!replay&&previous?.state?.revision+1===next.state?.revision&&rect){
      const m=next.state.last,board=document.querySelector('[data-azul-player="'+m.playerId+'"]'),target=m.row>=0?board?.querySelector('[data-azul-row="'+m.row+'"] .az-tile'):[...(board?.querySelectorAll('.az-floor-slot .az-tile')||[])].at(-1);
      if(target)fly(m.color,{getBoundingClientRect:()=>rect},target,650);sound('azul-place');
    }
  }
  function updateFullscreen(){const active=document.fullscreenElement===$('azulScreen')||fullscreenFallback;const b=$('azulFullscreen');b.setAttribute('aria-pressed',String(active));b.textContent=active?'Sair da tela cheia':'Tela cheia';}
  async function exitFullscreen(){
    fullscreenFallback=false;$('azulScreen')?.classList.remove('az-immersive');
    if(document.fullscreenElement===$('azulScreen'))await document.exitFullscreen().catch(()=>{});updateFullscreen();
  }
  async function toggleFullscreen(){
    if(document.fullscreenElement===$('azulScreen')||fullscreenFallback)return exitFullscreen();
    try{await $('azulScreen').requestFullscreen();}catch{fullscreenFallback=true;$('azulScreen').classList.add('az-immersive');}
    updateFullscreen();
  }
  function renderRanking(){const host=$('azulRanking');host.replaceChildren();const heading=el('header');heading.append(el('h3','','Os cinco recordistas'),button('↻',refreshRanking,'az-refresh'));host.append(heading);if(rankingError){host.append(el('p','az-error',rankingError));return;}if(!ranking.length){host.append(el('p','','O primeiro mosaico perfeito pode ser seu. Complete uma partida para entrar no ranking.'));return;}
    const list=el('ol','az-records');ranking.forEach((r,index)=>{const item=el('li');const copy=el('span');copy.append(el('strong','',r.name),el('small','',(r.mode==='bots'?'Contra bots':'Mesa online')+' · '+new Date(r.date).toLocaleDateString('pt-BR')));item.append(el('b','',String(index+1).padStart(2,'0')),copy,el('strong','',r.score+' pts'));list.append(item);});host.append(list,el('small','','Melhor resultado por conta. Empate: linhas completas e data do recorde.'));}
  function render(){
    const content=$('azulContent');if(!content)return;content.replaceChildren();$('azulScreen').dataset.playing=String(!!room?.state);$('azulNotice').textContent=notice;renderRanking();
    const status=$('azulTurnStatus');
    if(!room){
      status.textContent='Escolha sua mesa';const lobby=el('div','az-lobby');const intro=el('div','az-lobby-intro'),cover=el('img','az-lobby-cover'),copy=el('div');cover.src='assets/azul/box-cover.png';cover.alt='Caixa do jogo Azul';cover.width=1230;cover.height=1278;cover.decoding='async';copy.append(el('span','az-eyebrow','DE 2 A 4 ARTESÃOS'),el('h2','','Seu próximo mosaico começa aqui.'),el('p','','Escolha azulejos, complete as linhas e construa sua parede. Jogue com amigos ou contra os artesãos automáticos.'));intro.append(cover,copy);lobby.append(intro);
      const controls=el('div','az-lobby-controls'),label=el('label','','Participantes '),select=el('select');select.id='azulPlayerCount';for(const n of [2,3,4]){const o=el('option','',String(n));o.value=n;select.append(o);}label.append(select);controls.append(label,button('Criar mesa',()=>void request('create',{maxPlayers:Number(select.value)}),'az-button az-primary'));if(resumeId)controls.append(button('Retomar minha mesa',()=>void request('resume',{roomId:resumeId})));lobby.append(controls);
      const online=el('div','az-open-rooms');online.append(el('h3','','Mesas abertas'),button('Atualizar mesas',()=>void request('list'),'az-text-button'));if(!rooms.length)online.append(el('p','','Nenhuma mesa esperando. Crie a sua e convide seus amigos.'));for(const r of rooms)online.append(button('Mesa de '+r.name+' · '+r.players+'/'+r.maxPlayers,()=>void request('join',{roomId:r.id})));lobby.append(online);content.append(lobby);return;
    }
    const top=el('div','az-room-tools');top.append(el('span','','Mesa '+room.id),button('Sair da mesa',()=>{if(!room.state||room.state.phase==='finished'||window.confirm('Sair desta partida? Um bot assume sua cadeira e este resultado não entra nos seus recordes.'))void request('leave');},'az-text-button'));content.append(top);
    if(!room.state){
      status.textContent='Aguardando os artesãos';const lobby=el('div','az-lobby');lobby.append(el('h2','','À mesa, artesãos.'),el('p','','Seus amigos encontram esta partida em Azul → Mesas abertas. A chamada continua conectada.'));
      const people=el('div','az-seated');for(const p of room.players)people.append(el('span','',p.name+(p.id===room.hostId?' · anfitrião':'')+(!p.online?' · reconectando…':'')));lobby.append(people);
      if(room.hostId===window.TronoAuth.user?.id){const actions=el('div','az-lobby-controls');const start=button('Iniciar com os presentes',()=>void request('start',{fillBots:false}),'az-button az-primary');start.disabled=room.players.length<2;actions.append(start,button('Completar com bots e iniciar',()=>void request('start',{fillBots:true})));lobby.append(actions);}else lobby.append(el('p','','O anfitrião inicia a partida.'));content.append(lobby);return;
    }
    const s=displayState();$('azulScreen').dataset.playing='true';if(replay)content.append(scoringBanner());status.textContent=s.phase==='finished'?'Mosaico concluído':replay?'Contagem da rodada '+replay.round:'Rodada '+s.round+' · '+(s.players[s.turn].id===window.TronoAuth.user?.id?'Sua vez':s.players[s.turn].name+' está jogando');
    if(s.phase==='finished'){const done=el('div','az-result');done.setAttribute('role','status');done.append(el('h2','',s.winners.map(id=>s.players.find(p=>p.id===id).name).join(' e ')+(s.winners.length>1?' venceram!':' venceu!')));const saved={saving:'Salvando os recordes…',saved:'Recordes salvos no ranking permanente.',pending:'Resultado aguardando conexão com o ranking. O servidor tentará novamente.',unranked:'Partida sem recordes elegíveis.'};done.append(el('p','',saved[room.recordStatus]||'Calculando os recordes…'));if(room.recordStatus==='pending')done.append(button('Tentar salvar novamente',()=>void request('retry-record')));done.append(button('Nova partida',()=>void request('leave'),'az-button az-primary'));content.append(done);}
    const table=el('div','az-table');table.append(sources(s));const boards=el('div','az-boards');const local=s.players.find(p=>p.id===window.TronoAuth.user?.id);const order=local?[local,...s.players.filter(p=>p!==local)]:s.players;order.forEach((p,seat)=>{const board=playerBoard(p,s.players.indexOf(p),s);board.dataset.seat=seat;boards.append(board);});table.append(boards);content.append(table);
  }
  function bind(){
    const side=el('nav');side.id='gamesSideNav';side.setAttribute('aria-label','Jogos da comunidade');side.append(el('strong','','Sua ludoteca'),button('Todos os jogos',openLibrary),button('♛ A Lei do Trono',openThrone),button('✥ Azul',openAzul),button('🎙 Comunidade',()=>window.TronoAppLayout.navigate('community')),el('small','','Escolha uma mesa e continue na chamada.'));document.body.append(side);
    $('gamesHome').onclick=()=>window.TronoAppLayout.navigate('home');$('gamesVoice').onclick=()=>window.TronoAppLayout.navigate('community');$('playThrone').onclick=openThrone;$('playAzul').onclick=openAzul;$('azulBack').onclick=openLibrary;
    document.addEventListener('click',e=>{const target=e.target.closest('#openGamePortalBtn,#gamePortalCard,.portal-nav-btn[data-portal-target=game]');if(target&&!e.target.closest('#openGuestGameBtn')){e.preventDefault();e.stopImmediatePropagation();openLibrary();}},true);
    window.TronoNetwork.onMessage(msg=>{
      if(msg.type==='azul-state'){const savedBefore=room?.recordStatus==='saved';receiveRoom(msg.room);if(room.recordStatus==='saved'&&!savedBefore)refreshRanking();}
      if(msg.type==='azul-rooms'){rooms=msg.rooms;resumeId=msg.resumeId;if(!replay)render();}
      if(msg.type==='azul-left'){finishReplay();void exitFullscreen();room=null;resumeId=null;selection=null;notice=msg.reason||'';render();void request('list');}
      if(msg.type==='azul-ranking'&&msg.requestId===rankingRequest){ranking=msg.rows;rankingError='';renderRanking();}
      if(msg.type==='azul-error'){pending=false;clearTimeout(pendingTimer);if(msg.requestId===rankingRequest){rankingError=msg.message;renderRanking();}else{notice=msg.message;render();}}
      if(msg.type==='connection'&&!msg.connected&&room){finishReplay();notice='Conexão perdida. Reconecte para retomar a mesa em até 90 segundos.';pending=false;render();}
      if(msg.type==='auth-result'&&msg.ok){if(room)void request('resume',{roomId:room.id});else if(!$('azulScreen').classList.contains('hidden')){void request('list');refreshRanking();}}
    });
    window.addEventListener('trono-auth-change',()=>{if(!window.TronoAuth.user){finishReplay();void exitFullscreen();room=null;resumeId=null;ranking=[];selection=null;pending=false;clearTimeout(pendingTimer);render();}});
    $('azulFullscreen').onclick=()=>void toggleFullscreen();document.addEventListener('fullscreenchange',updateFullscreen);document.addEventListener('keydown',e=>{if(e.key==='Escape'&&fullscreenFallback)void exitFullscreen();});
    document.addEventListener('visibilitychange',()=>{if(document.hidden)finishReplay();});
    window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',e=>{if(e.matches)finishReplay();});
    new MutationObserver(()=>{if(!replayVisible()&&(replay||replayQueue.length))finishReplay();if($('azulScreen').classList.contains('hidden')&&fullscreenFallback)void exitFullscreen();}).observe($('azulScreen'),{attributes:true,attributeFilter:['class']});
    $('azulRulesButton').onclick=()=>{$('azulRulesDialog').showModal();};$('azulRulesClose').onclick=()=>$('azulRulesDialog').close();render();
  }
  window.addEventListener('DOMContentLoaded',bind);return {openLibrary,openAzul,openThrone,get room(){return room;},get animating(){return !!replay;}};
})();
