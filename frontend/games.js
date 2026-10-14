'use strict';
window.TronoGames=(()=>{
  const $=id=>document.getElementById(id),R=window.AzulRules;
  let room=null,selection=null,rooms=[],resumeId=null,ranking=[],rankingError='',notice='',pending=false,pendingTimer=null,rankingRequest=null;
  const el=(tag,className,text)=>{const n=document.createElement(tag);if(className)n.className=className;if(text!==undefined)n.textContent=text;return n;};
  function button(text,fn,className='az-button'){const n=el('button',className,text);n.type='button';n.onclick=fn;return n;}
  function tile(color,{ghost=false}={}){const n=el('span','az-tile az-color-'+color+(ghost?' az-ghost':''),color===5?'1':R.symbols[color]);n.setAttribute('aria-label',color===5?'Marcador de primeiro jogador':R.colors[color]);return n;}
  function show(id){window.TronoPortal.showOnly(id);window.TronoSocial.showForRoom(false);document.body.dataset.gamesView=id==='gamesScreen'?'library':'azul';}
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
    if(pending||!selection||!room?.state||room.state.players[room.state.turn]?.id!==window.TronoAuth.user?.id)return;
    pending=true;clearTimeout(pendingTimer);pendingTimer=setTimeout(()=>{pending=false;notice='Aguardando conexão. Confira a mesa antes de tentar novamente.';render();void request('state');},12000);
    void request('move',{revision:room.state.revision,move:{...selection,row}}).then(ok=>{if(!ok){pending=false;clearTimeout(pendingTimer);render();}});render();
  }
  function colorLabel(color){return color===5?'primeiro jogador':R.colors[color];}
  function sourceButton(tiles,source,color){const n=button('',()=>{selection={source,color};notice='';render();},'az-pick');for(const c of tiles.filter(c=>c===color))n.append(tile(c));n.setAttribute('aria-label',(source===-1?'Centro':'Fábrica '+(source+1))+': pegar '+tiles.filter(c=>c===color).length+' '+R.colors[color]);n.disabled=pending||room.state.phase!=='draft'||room.state.players[room.state.turn].id!==window.TronoAuth.user?.id;n.classList.toggle('selected',selection?.source===source&&selection.color===color);return n;}
  function sources(state){
    const section=el('section','az-supply');section.setAttribute('aria-label','Fábricas e centro');
    const heading=el('div','az-supply-title');heading.append(el('strong','', 'Mercado de azulejos'),el('small','',state.bagCount+' no saco · '+state.discardCount+' no descarte'));section.append(heading);
    const factories=el('div','az-factories');state.factories.forEach((tiles,source)=>{const disk=el('div','az-factory');disk.append(el('span','az-factory-label',String(source+1)));for(const color of new Set(tiles))disk.append(sourceButton(tiles,source,color));if(!tiles.length)disk.append(el('span','az-empty-factory','✥'));factories.append(disk);});section.append(factories);
    const center=el('section','az-center');center.append(el('strong','','Centro da mesa'));const pool=el('div','az-center-tiles');if(state.marker)pool.append(tile(5));for(const color of new Set(state.center))pool.append(sourceButton(state.center,-1,color));if(!state.center.length)pool.append(el('small','','As sobras das fábricas vêm para cá.'));center.append(pool);section.append(center);
    const hint=el('p','az-instruction',selection?'Agora escolha uma linha no seu tabuleiro ou envie ao chão.':'1. Escolha uma cor na fábrica ou no centro.  2. Escolha uma linha no seu tabuleiro.');section.append(hint);return section;
  }
  function playerBoard(p,index,state){
    const mine=p.id===window.TronoAuth.user?.id,active=state.phase==='draft'&&state.turn===index,article=el('article','az-board'+(mine?' az-mine':'')+(active?' az-turn':''));article.dataset.azulPlayer=p.id;
    const h=el('header','az-board-heading'),who=el('div');who.append(el('strong','',p.name+(mine?' · você':'')),el('small','',p.forfeited?'Saiu · bot jogando':p.bot?'Artesão automático':active?'Escolhendo azulejos':'Artesão'));h.append(who,el('b','az-score',p.score+' pts'));article.append(h);
    const grid=el('div','az-board-grid'),lines=el('div','az-lines'),wall=el('div','az-wall');
    p.lines.forEach((line,row)=>{
      const valid=mine&&active&&selection&&!pending&&R.canPlace(p,row,selection.color),lineButton=button('',()=>sendMove(row),'az-pattern-row');lineButton.dataset.azulRow=row;lineButton.disabled=!valid;lineButton.classList.toggle('az-valid',!!valid);lineButton.setAttribute('aria-label','Linha '+(row+1)+': '+line.count+' de '+(row+1)+(line.color!==null?', '+colorLabel(line.color):'')+(valid?', colocar azulejos selecionados':''));
      for(let j=0;j<row+1;j++)lineButton.append(j>=row+1-line.count?tile(line.color):el('span','az-slot'));lines.append(lineButton);
      for(let col=0;col<5;col++){const color=(col-row+5)%5;wall.append(tile(color,{ghost:!p.wall[row][col]}));}
    });grid.append(lines,el('span','az-wall-arrow','›'),wall);article.append(grid);
    const floor=el('div','az-floor');const drop=button('Chão',()=>sendMove(-1),'az-floor-label');drop.disabled=!(mine&&active&&selection&&!pending);drop.title='Enviar os azulejos selecionados para o chão';floor.append(drop);
    for(let i=0;i<7;i++){const slot=el('div','az-floor-slot');slot.append(el('small','','−'+R.penalties[i]),p.floor[i]!==undefined?tile(p.floor[i]):el('span','az-slot'));floor.append(slot);}article.append(floor);
    if(p.last){const recap=el('p','az-round-score','Última rodada: +'+p.last.points+' na parede, −'+p.last.penalty+' no chão.');recap.title='O total nunca fica abaixo de zero.';article.append(recap);}
    if(p.bonus)article.append(el('p','az-bonus','Bônus: '+p.bonus.rows+' linhas × 2 · '+p.bonus.columns+' colunas × 7 · '+p.bonus.sets+' cores × 10 = +'+p.bonus.total));return article;
  }
  function renderRanking(){const host=$('azulRanking');host.replaceChildren();const heading=el('header');heading.append(el('h3','','Os cinco recordistas'),button('↻',refreshRanking,'az-refresh'));host.append(heading);if(rankingError){host.append(el('p','az-error',rankingError));return;}if(!ranking.length){host.append(el('p','','O primeiro mosaico perfeito pode ser seu. Complete uma partida para entrar no ranking.'));return;}
    const list=el('ol','az-records');ranking.forEach((r,index)=>{const item=el('li');const copy=el('span');copy.append(el('strong','',r.name),el('small','',(r.mode==='bots'?'Contra bots':'Mesa online')+' · '+new Date(r.date).toLocaleDateString('pt-BR')));item.append(el('b','',String(index+1).padStart(2,'0')),copy,el('strong','',r.score+' pts'));list.append(item);});host.append(list,el('small','','Melhor resultado por conta. Empate: linhas completas e data do recorde.'));}
  function render(){
    const content=$('azulContent');if(!content)return;content.replaceChildren();$('azulNotice').textContent=notice;renderRanking();
    const status=$('azulTurnStatus');
    if(!room){
      status.textContent='Escolha sua mesa';const lobby=el('div','az-lobby');lobby.append(el('span','az-eyebrow','DE 2 A 4 ARTESÃOS'),el('h2','','Seu próximo mosaico começa aqui.'),el('p','','Escolha azulejos, complete as linhas e construa sua parede. Jogue com amigos ou contra os artesãos automáticos.'));
      const controls=el('div','az-lobby-controls'),label=el('label','','Participantes '),select=el('select');select.id='azulPlayerCount';for(const n of [2,3,4]){const o=el('option','',String(n));o.value=n;select.append(o);}label.append(select);controls.append(label,button('Criar mesa',()=>void request('create',{maxPlayers:Number(select.value)}),'az-button az-primary'));if(resumeId)controls.append(button('Retomar minha mesa',()=>void request('resume',{roomId:resumeId})));lobby.append(controls);
      const online=el('div','az-open-rooms');online.append(el('h3','','Mesas abertas'),button('Atualizar mesas',()=>void request('list'),'az-text-button'));if(!rooms.length)online.append(el('p','','Nenhuma mesa esperando. Crie a sua e convide seus amigos.'));for(const r of rooms)online.append(button('Mesa de '+r.name+' · '+r.players+'/'+r.maxPlayers,()=>void request('join',{roomId:r.id})));lobby.append(online);content.append(lobby);return;
    }
    const top=el('div','az-room-tools');top.append(el('span','','Mesa '+room.id),button('Sair da mesa',()=>{if(!room.state||room.state.phase==='finished'||window.confirm('Sair desta partida? Um bot assume sua cadeira e este resultado não entra nos seus recordes.'))void request('leave');},'az-text-button'));content.append(top);
    if(!room.state){
      status.textContent='Aguardando os artesãos';const lobby=el('div','az-lobby');lobby.append(el('h2','','À mesa, artesãos.'),el('p','','Seus amigos encontram esta partida em Azul → Mesas abertas. A chamada continua conectada.'));
      const people=el('div','az-seated');for(const p of room.players)people.append(el('span','',p.name+(p.id===room.hostId?' · anfitrião':'')+(!p.online?' · reconectando…':'')));lobby.append(people);
      if(room.hostId===window.TronoAuth.user?.id){const actions=el('div','az-lobby-controls');const start=button('Iniciar com os presentes',()=>void request('start',{fillBots:false}),'az-button az-primary');start.disabled=room.players.length<2;actions.append(start,button('Completar com bots e iniciar',()=>void request('start',{fillBots:true})));lobby.append(actions);}else lobby.append(el('p','','O anfitrião inicia a partida.'));content.append(lobby);return;
    }
    const s=room.state;status.textContent=s.phase==='finished'?'Mosaico concluído':'Rodada '+s.round+' · '+(s.players[s.turn].id===window.TronoAuth.user?.id?'Sua vez':s.players[s.turn].name+' está jogando');
    if(s.phase==='finished'){const done=el('div','az-result');done.setAttribute('role','status');done.append(el('h2','',s.winners.map(id=>s.players.find(p=>p.id===id).name).join(' e ')+(s.winners.length>1?' venceram!':' venceu!')));const saved={saving:'Salvando os recordes…',saved:'Recordes salvos no ranking permanente.',pending:'Resultado aguardando conexão com o ranking. O servidor tentará novamente.',unranked:'Partida sem recordes elegíveis.'};done.append(el('p','',saved[room.recordStatus]||'Calculando os recordes…'));if(room.recordStatus==='pending')done.append(button('Tentar salvar novamente',()=>void request('retry-record')));done.append(button('Nova partida',()=>void request('leave'),'az-button az-primary'));content.append(done);}
    const table=el('div','az-table');table.append(sources(s));const boards=el('section','az-boards');boards.setAttribute('aria-label','Tabuleiros');const local=s.players.find(p=>p.id===window.TronoAuth.user?.id);const order=local?[local,...s.players.filter(p=>p!==local)]:s.players;for(const p of order)boards.append(playerBoard(p,s.players.indexOf(p),s));table.append(boards);content.append(table);
  }
  function bind(){
    const side=el('nav');side.id='gamesSideNav';side.setAttribute('aria-label','Jogos da comunidade');side.append(el('strong','','Sua ludoteca'),button('Todos os jogos',openLibrary),button('♛ A Lei do Trono',openThrone),button('✥ Azul',openAzul),button('🎙 Comunidade',()=>window.TronoAppLayout.navigate('community')),el('small','','Escolha uma mesa e continue na chamada.'));document.body.append(side);
    $('gamesHome').onclick=()=>window.TronoAppLayout.navigate('home');$('gamesVoice').onclick=()=>window.TronoAppLayout.navigate('community');$('playThrone').onclick=openThrone;$('playAzul').onclick=openAzul;$('azulBack').onclick=openLibrary;
    document.addEventListener('click',e=>{const target=e.target.closest('#openGamePortalBtn,#gamePortalCard,.portal-nav-btn[data-portal-target=game]');if(target&&!e.target.closest('#openGuestGameBtn')){e.preventDefault();e.stopImmediatePropagation();openLibrary();}},true);
    window.TronoNetwork.onMessage(msg=>{
      if(msg.type==='azul-state'){const savedBefore=room?.recordStatus==='saved';room=msg.room;resumeId=room.id;selection=null;pending=false;clearTimeout(pendingTimer);notice='';render();if(room.recordStatus==='saved'&&!savedBefore)refreshRanking();}
      if(msg.type==='azul-rooms'){rooms=msg.rooms;resumeId=msg.resumeId;render();}
      if(msg.type==='azul-left'){room=null;resumeId=null;selection=null;notice=msg.reason||'';render();void request('list');}
      if(msg.type==='azul-ranking'&&msg.requestId===rankingRequest){ranking=msg.rows;rankingError='';renderRanking();}
      if(msg.type==='azul-error'){pending=false;clearTimeout(pendingTimer);if(msg.requestId===rankingRequest){rankingError=msg.message;renderRanking();}else{notice=msg.message;render();}}
      if(msg.type==='connection'&&!msg.connected&&room){notice='Conexão perdida. Reconecte para retomar a mesa em até 90 segundos.';pending=false;render();}
      if(msg.type==='auth-result'&&msg.ok){if(room)void request('resume',{roomId:room.id});else if(!$('azulScreen').classList.contains('hidden')){void request('list');refreshRanking();}}
    });
    window.addEventListener('trono-auth-change',()=>{if(!window.TronoAuth.user){room=null;resumeId=null;ranking=[];selection=null;pending=false;clearTimeout(pendingTimer);render();}});
    $('azulRulesButton').onclick=()=>{$('azulRulesDialog').showModal();};$('azulRulesClose').onclick=()=>$('azulRulesDialog').close();render();
  }
  window.addEventListener('DOMContentLoaded',bind);return {openLibrary,openAzul,openThrone,get room(){return room;}};
})();
