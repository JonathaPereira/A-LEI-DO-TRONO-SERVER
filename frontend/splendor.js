'use strict';
window.TronoSplendor=(()=>{
  const $=id=>document.getElementById(id),R=window.SplendorRules;
  const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
  const button=(text,fn,cls='sp-button')=>{const n=el('button',cls,text);n.type='button';n.onclick=fn;return n;};
  let room=null,rooms=[],resume=null,notice='',ranking=[],rankingError='',rankRequest=null,pending=false,pendingTimer=null,selected=Array(6).fill(0),paymentChoice=null,returnChoice=null,immersive=false;
  let visual=null,busy=false,queue=[],generation=0,wake=null,detail=null;
  const visible=()=>!$('splendorScreen').classList.contains('hidden')&&!document.hidden;
  const state=()=>visual||room?.state,mine=s=>s?.players.find(p=>p.id===window.TronoAuth.user?.id),myTurn=s=>s?.phase==='action'&&s.players[s.turn]?.id===window.TronoAuth.user?.id;
  const locked=()=>pending||busy||!window.TronoNetwork.connected,reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
  function sound(kind){if(visible())window.TronoAudio?.playSfx('splendor-'+kind);}
  function gem(color,count,{chip=false}={}){const n=el('span','sp-gem sp-gem-'+color+(chip?' sp-chip':''));n.setAttribute('aria-label',R.colors[color]+(count!==undefined?': '+count:''));n.append(el('i','',R.symbols[color]));if(count!==undefined)n.append(el('b','',String(count)));return n;}
  function costs(cost,bonuses=null){const row=el('span','sp-costs');cost.forEach((count,color)=>{if(!count)return;const g=gem(color,count);if(bonuses){g.classList.toggle('sp-met',bonuses[color]>=count);g.title=R.colors[color]+': '+bonuses[color]+' de '+count+' bônus';}row.append(g);});return row;}
  function card(c,{small=false,action=true}={}){
    if(!c)return el('span','sp-card sp-empty');
    const n=button('',()=>openCard(c),'sp-card'+(small?' sp-card-small':''));n.dataset.card=c.id||'';n.dataset.noClickSfx='1';
    if(c.hidden){n.classList.add('sp-card-back','sp-level-'+c.level);n.append(el('span','sp-back-emblem','✦'),el('small','','NÍVEL '+c.level));n.disabled=true;n.setAttribute('aria-label','Carta reservada oculta, nível '+c.level);return n;}
    const index=(c.level===1?[3,0,2,1,4][c.bonus]:(c.level-1)*4+Number(c.id.slice(1))%4),art=el('span','sp-card-art');art.style.backgroundPosition=(index%4)*100/3+'% '+Math.floor(index/4)*50+'%';n.append(art);
    const top=el('span','sp-card-top');top.append(el('b','sp-card-points',c.points?String(c.points):''),gem(c.bonus));n.append(top,costs(c.cost));
    const p=mine(state()),affordable=p&&!!R.payment(p,c);n.classList.toggle('sp-affordable',!!(action&&myTurn(state())&&affordable&&!locked()));
    n.title='Nível '+c.level+' · '+c.points+' ponto(s) · bônus de '+R.colors[c.bonus];n.setAttribute('aria-label',n.title+'. Custo: '+c.cost.map((v,i)=>v?v+' '+R.colors[i]:null).filter(Boolean).join(', ')+(affordable?'. Você pode comprar.':''));
    if(!action)n.onclick=()=>openCard(c,false);return n;
  }
  function noble(n,s){
    const eligible=s.phase==='noble'&&s.eligible.includes(n.id)&&s.players[s.turn].id===window.TronoAuth.user?.id;
    const b=button('',()=>{if(eligible&&!locked())void submit({kind:'noble',id:n.id});},'sp-noble'+(eligible?' sp-noble-eligible':''));b.dataset.noble=n.id;b.dataset.noClickSfx='1';
    const i=window.SplendorData.nobles.findIndex(v=>v.id===n.id),portrait=el('span','sp-noble-art');portrait.style.backgroundPosition=(i%5)*25+'% '+Math.floor(i/5)*100+'%';b.append(portrait,el('b','sp-noble-points','3'),costs(n.cost,mine(s)?.bonuses));
    b.setAttribute('aria-label','Nobre: 3 pontos. Requer '+n.cost.map((v,i)=>v?v+' bônus de '+R.colors[i]:null).filter(Boolean).join(', ')+(eligible?'. Escolher este nobre.':''));b.disabled=!eligible||locked();return b;
  }
  async function request(action,payload={}){try{if(!await window.TronoNetwork.ensureSplendor())return false;if(!window.TronoNetwork.splendor(action,payload))throw Error('Conexão interrompida. Tente novamente.');return true;}catch(e){notice=e.message;render();return false;}}
  function refreshRanking(){rankingError='';rankRequest=crypto.randomUUID();void request('ranking',{requestId:rankRequest});}
  function open(){window.TronoPortal.showOnly('splendorScreen');window.TronoSocial.showForRoom(false);document.body.dataset.gamesView='splendor';render();void request('list');refreshRanking();}
  function closeDialog(id){if($(id).open)$(id).close();}
  function dismiss(){for(const id of ['splendorCardDialog','splendorReturnDialog','splendorCollectionDialog','splendorRulesDialog'])closeDialog(id);paymentChoice=null;returnChoice=null;}
  async function commit(move){
    if(locked()||!room?.state)return;pending=true;selected=Array(6).fill(0);notice='';dismiss();render();
    clearTimeout(pendingTimer);pendingTimer=setTimeout(()=>{pending=false;notice='Aguardando confirmação. Confira a conexão antes de tentar novamente.';render();void request('state');},12000);
    if(!await request('move',{revision:room.state.revision,move})){pending=false;clearTimeout(pendingTimer);render();}
  }
  function submit(move){
    if(locked()||!room?.state)return;
    const p=mine(room.state),held=[...p.tokens];if(move.kind==='take')move.tokens.forEach((n,i)=>held[i]+=n);if(move.kind==='reserve')held[5]+=Math.min(1,room.state.bank[5]);
    const excess=Math.max(0,R.sum(held)-10);
    if(excess){closeDialog('splendorCardDialog');returnChoice={move,held,excess,returned:Array(6).fill(0),revision:room.state.revision};renderReturns();$('splendorReturnDialog').showModal();return;}
    return commit(move);
  }
  function renderReturns(){
    const host=$('splendorReturnContent'),choice=returnChoice;host.replaceChildren();if(!choice)return;
    host.append(el('span','sp-eyebrow','LIMITE DE 10 FICHAS'),el('h2','','Escolha o que devolver'),el('p','','Você ficará com '+R.sum(choice.held)+' fichas. Devolva '+choice.excess+' para concluir a jogada.'));
    const tokens=el('div','sp-return-tokens');choice.held.forEach((held,i)=>{if(!held)return;const b=button('',()=>{if(choice.returned[i]<held&&R.sum(choice.returned)<choice.excess)choice.returned[i]++;else choice.returned[i]=0;renderReturns();},'sp-token-choice');b.dataset.returnToken=i;b.append(gem(i,held-choice.returned[i],{chip:true}),el('small','','Devolver: '+choice.returned[i]));tokens.append(b);});host.append(tokens);
    const actions=el('div','sp-dialog-actions'),confirm=button('Devolver '+R.sum(choice.returned)+' / '+choice.excess,()=>{if(choice.revision!==room?.state?.revision){dismiss();return;}void commit({...choice.move,returnTokens:choice.returned});},'sp-button sp-primary');confirm.disabled=R.sum(choice.returned)!==choice.excess;actions.append(button('Cancelar',()=>dismiss()),confirm);host.append(actions);
  }
  function openCard(c,actions=true){
    if(c.hidden)return;const s=state(),p=mine(s),owned=s?.players.some(p=>p.cards.some(v=>v.id===c.id)),reserved=p?.reserved.some(v=>v.id===c.id);
    paymentChoice={card:c,payment:p?R.payment(p,c):null};const host=$('splendorCardContent');host.replaceChildren();
    const image=card(c,{action:false});image.disabled=true;host.append(image);const copy=el('div','sp-card-detail');copy.append(el('span','sp-eyebrow','DESENVOLVIMENTO · NÍVEL '+c.level),el('h2','',c.points+' ponto(s) de prestígio'),el('p','','Bônus permanente de '+R.colors[c.bonus]+'. Cada bônus reduz em 1 o custo dessa cor nas próximas compras.'));
    if(p){
      const cost=R.price(p,c);copy.append(el('h3','','Custo após seus bônus'),costs(cost));
      if(!R.sum(cost))copy.append(el('p','sp-free','Gratuita com seus bônus.'));
      const pay=el('div');pay.id='splendorPayment';copy.append(pay);
    }
    const tools=el('div','sp-dialog-actions'),buy=button('Comprar carta',()=>{void submit({kind:'buy',id:c.id,payment:paymentChoice.payment});},'sp-button sp-primary');buy.id='splendorBuy';buy.disabled=!actions||owned||!myTurn(s)||locked()||!paymentChoice.payment;tools.append(buy);
    if(!reserved&&!owned){const reserve=button('Reservar'+(s?.bank[5]?' · +1 ouro':''),()=>void submit({kind:'reserve',id:c.id}));reserve.id='splendorReserve';reserve.disabled=!actions||!myTurn(s)||locked()||p?.reserved.length>=3;tools.append(reserve);}
    copy.append(tools);host.append(copy);renderPayment();sound('card');if(!$('splendorCardDialog').open)$('splendorCardDialog').showModal();
  }
  function renderPayment(){
    const host=$('splendorPayment'),choice=paymentChoice;if(!host||!choice)return;host.replaceChildren();const p=mine(state());if(!p)return;
    if(!choice.payment){host.append(el('p','sp-unaffordable','Ainda faltam fichas. Você pode reservar a carta para comprar depois.'));return;}
    const total=el('div','sp-payment-total');total.append(el('strong','','Pagamento:'));choice.payment.forEach((n,i)=>{if(n)total.append(gem(i,n));});if(!R.sum(choice.payment))total.append(el('span','','nenhuma ficha'));host.append(total);
    if(p.tokens[5]){const more=el('details','sp-payment-options');more.append(el('summary','','Escolher uso do ouro'));for(let i=0;i<5;i++)if(R.price(p,choice.card)[i]){
      const row=el('div','sp-payment-row');row.append(el('span','',R.colors[i]));const use=button('Usar ouro',()=>{choice.payment[i]--;choice.payment[5]++;renderPayment();}),restore=button('Usar cor',()=>{choice.payment[i]++;choice.payment[5]--;renderPayment();});use.disabled=!choice.payment[i]||choice.payment[5]>=p.tokens[5];restore.disabled=choice.payment[i]>=Math.min(R.price(p,choice.card)[i],p.tokens[i]);row.append(use,restore);more.append(row);
    }host.append(more);}
  }
  function selectToken(color){
    if(!myTurn(state())||locked())return;
    if(selected[color]===2)selected[color]=0;else if(selected[color]===1){if(R.sum(selected)===1&&state().bank[color]>=4)selected[color]=2;else selected[color]=0;}
    else if(!selected.includes(2)&&R.sum(selected)<3&&state().bank[color]>0)selected[color]=1;
    sound('chip');render();
  }
  function player(p,i,s,{self=false}={}){
    const panel=el('article','sp-player'+(self?' sp-self':'')+(s.turn===i&&s.phase!=='finished'?' sp-player-active':''));panel.dataset.player=p.id;
    const header=el('header'),identity=el('div');identity.append(el('strong','',p.name+(self?' · você':'')),el('small','',p.forfeited?'Saiu · bot assume':p.bot?'Mercador automático':i===s.starter?'Primeiro da rodada':'Mercador'));const points=el('b','sp-score',String(detail?.playerId===p.id?detail.displayScore:p.score));points.dataset.score=p.id;points.title='Pontos de prestígio';header.append(identity,points);panel.append(header);
    const holdings=el('div','sp-holdings');for(let color=0;color<5;color++){const g=el('div','sp-holding');g.dataset.bonus=color;g.append(gem(color,p.bonuses[color]),el('small','',p.tokens[color]+' fichas'));holdings.append(g);}const gold=el('div','sp-holding');gold.append(gem(5,p.tokens[5]),el('small','','curingas'));holdings.append(gold);panel.append(holdings);
    const footer=el('div','sp-player-foot');footer.append(el('small','',R.sum(p.tokens)+'/10 fichas · '+p.cards.length+' cartas · '+p.nobles.length+' nobres'));const collection=button('Coleção',()=>openCollection(p),'sp-link');footer.append(collection);panel.append(footer);
    const reserved=el('div','sp-reserved');reserved.setAttribute('aria-label','Cartas reservadas de '+p.name);for(const c of p.reserved)reserved.append(card(c,{small:true}));for(let j=p.reserved.length;j<3;j++)reserved.append(el('span','sp-reserved-slot',self?'Reserva '+(j+1):'◇'));panel.append(reserved);return panel;
  }
  function openCollection(p){const host=$('splendorCollectionContent');host.replaceChildren();host.append(el('span','sp-eyebrow','DESENVOLVIMENTOS E NOBRES'),el('h2','','Coleção de '+p.name));const list=el('div','sp-collection');for(const c of p.cards)list.append(card(c,{small:true,action:false}));if(!p.cards.length)list.append(el('p','','Nenhuma carta comprada ainda.'));host.append(list);if(p.nobles.length){const nobles=el('div','sp-nobles');p.nobles.forEach(n=>nobles.append(noble(n,{...state(),phase:'finished'})));host.append(nobles);}if(!$('splendorCollectionDialog').open)$('splendorCollectionDialog').showModal();}
  function market(s){
    const host=el('section','sp-market');host.setAttribute('aria-label','Mercado de desenvolvimentos');
    for(let level=3;level>=1;level--){const row=el('div','sp-market-row');row.dataset.level=level;const deck=button('',()=>{if(window.confirm('Reservar uma carta oculta do nível '+level+'?'))void submit({kind:'reserve',level});},'sp-deck sp-level-'+level);deck.append(el('span','sp-back-emblem','✦'),el('b','',String(s.deckCounts[level-1])),el('small','','NÍVEL '+level));deck.setAttribute('aria-label','Reservar do baralho de nível '+level+', '+s.deckCounts[level-1]+' cartas restantes');deck.disabled=!myTurn(s)||locked()||mine(s)?.reserved.length>=3||!s.deckCounts[level-1];row.append(deck);for(const c of s.market[level-1])row.append(card(c));host.append(row);}return host;
  }
  function bank(s){const host=el('section','sp-bank');host.setAttribute('aria-label','Banco de fichas');const heading=el('header');heading.append(el('span','sp-eyebrow','BANCO'),el('small','','3 diferentes ou 2 iguais¹'));host.append(heading);const tokens=el('div','sp-bank-tokens');s.bank.forEach((count,i)=>{const b=button('',()=>selectToken(i),'sp-bank-token'+(selected[i]?' selected':''));b.dataset.token=i;b.dataset.noClickSfx='1';b.append(gem(i,count,{chip:true}));if(selected[i])b.append(el('b','sp-token-selected','+'+selected[i]));b.disabled=i===5||!count||!myTurn(s)||locked();b.title=i===5?'Ouro: obtido ao reservar uma carta':R.colors[i]+': '+count+' disponíveis'+(count>=4?' · permite pegar 2 iguais':'');tokens.append(b);});host.append(tokens,el('small','sp-bank-hint','¹ Duas iguais: a pilha deve ter ao menos 4. Ouro vem de reservas.'));return host;}
  function actionBar(s){const choosing=s.phase==='noble'&&s.players[s.turn].id===window.TronoAuth.user?.id,finished=s.phase==='finished';const host=el('section','sp-action-bar');host.setAttribute('aria-label','Sua jogada');const copy=el('div');copy.append(el('strong','',finished?'Partida encerrada':choosing?'Escolha um nobre destacado':myTurn(s)?'Sua vez de negociar':'Aguardando '+s.players[s.turn].name),el('small','',finished?'Confira os resultados e volte ao catálogo para outra mesa.':choosing?'Você recebe uma visita por turno, sem gastar fichas.':s.phase==='noble'?'O mercador da vez está escolhendo um nobre.':myTurn(s)?'Pegue fichas no banco ou clique em uma carta para comprar / reservar.':'A chamada continua. Você pode examinar cartas e coleções.'));host.append(copy);
    if(myTurn(s)){const choices=el('div','sp-action-selection');selected.forEach((n,i)=>{if(n)choices.append(gem(i,n));});const confirm=button('Pegar '+R.sum(selected)+' ficha(s)',()=>void submit({kind:'take',tokens:[...selected]}),'sp-button sp-primary');confirm.id='splendorTake';confirm.disabled=!R.sum(selected)||locked();host.append(choices,button('Limpar',()=>{selected=Array(6).fill(0);render();},'sp-link'),confirm);if(!R.legalActions(s).length)host.append(button('Passar · sem ações',()=>void submit({kind:'pass'})));}return host;}
  function eventText(event,s){const name=s.players.find(p=>p.id===event.playerId)?.name||'Mercador';if(event.kind==='take')return name+' pegou '+R.sum(event.tokens)+' ficha(s)'+(R.sum(event.returned||[])?' e devolveu '+R.sum(event.returned)+'.':'.');if(event.kind==='reserve')return name+' reservou uma carta '+(event.blind?'oculta ':'')+'do nível '+event.level+(event.gold?' e recebeu ouro':'')+(R.sum(event.returned||[])?' e devolveu '+R.sum(event.returned)+' ficha(s).':'.');if(event.kind==='noble')return name+' recebeu um nobre: +3 pontos.';if(event.kind==='buy')return name+' comprou uma carta: +1 bônus de '+R.colors[event.card.bonus]+', +'+event.card.points+' ponto(s)'+(event.noble?' e um nobre (+3).':'.');return name+' passou sem ação disponível.';}
  function table(s){
    const root=el('div','sp-table'),opponents=el('aside','sp-opponents');opponents.setAttribute('aria-label','Outros mercadores');s.players.forEach((p,i)=>{if(p.id!==window.TronoAuth.user?.id)opponents.append(player(p,i,s));});
    const center=el('div','sp-center');center.append(market(s));const sidebar=el('aside','sp-side');sidebar.append(bank(s));const nobles=el('section','sp-nobles-section');nobles.append(el('span','sp-eyebrow','PATRONOS · 3 PONTOS CADA'));const list=el('div','sp-nobles');s.nobles.forEach(n=>list.append(noble(n,s)));nobles.append(list);sidebar.append(nobles);root.append(opponents,center,sidebar);
    const p=mine(s);if(p)root.append(player(p,s.players.indexOf(p),s,{self:true}));root.append(actionBar(s));return root;
  }
  function renderRanking(){const host=$('splendorRanking');host.replaceChildren();const header=el('header');header.append(el('h3','','Cinco grandes mercadores'),button('Atualizar',refreshRanking,'sp-link'));host.append(header);if(rankingError){host.append(el('p','',rankingError));return;}if(!ranking.length){host.append(el('p','','Complete uma partida para registrar seu melhor resultado.'));return;}const list=el('ol','sp-records');ranking.forEach((r,i)=>{const n=el('li'),copy=el('div');copy.append(el('strong','',r.name),el('small','',r.cards+' cartas · '+(r.mode==='bots'?'Com bots':'Online')+' · '+new Date(r.date).toLocaleDateString('pt-BR')));n.append(el('b','',String(i+1).padStart(2,'0')),copy,el('strong','',r.score+' pts'));list.append(n);});host.append(list,el('small','','Melhor resultado por conta. Empate: menos cartas e data do recorde.'));}
  function render(){
    const content=$('splendorContent');if(!content)return;const s=state();content.replaceChildren();$('splendorNotice').textContent=notice;$('splendorScreen').dataset.playing=String(!!s);renderRanking();
    const status=$('splendorStatus');status.textContent=!s?'O mercado aguarda você':s.phase==='finished'?'Partida encerrada':'Rodada '+s.round+(s.finalRound?' · Última rodada':s.phase==='noble'?' · Visita de um nobre':' · '+s.players[s.turn].name);
    if(!room){const lobby=el('section','sp-lobby'),art=el('img','sp-lobby-art');art.src='assets/games/splendor-cover.webp';art.alt='Mercador renascentista examinando uma safira';const copy=el('div');copy.append(el('span','sp-eyebrow','2–4 MERCADORES · REGRAS CLÁSSICAS'),el('h2','','Transforme gemas em prestígio.'),el('p','','Adquira minas, construa sua rede de comércio e atraia os nobres. Quinze pontos iniciam a última rodada. Sua chamada continua durante a partida.'));
      const controls=el('div','sp-lobby-controls'),label=el('label','','Participantes '),select=el('select');select.id='splendorPlayerCount';for(const n of [2,3,4]){const option=el('option','',String(n));option.value=n;select.append(option);}label.append(select);controls.append(label,button('Criar mesa',()=>void request('create',{maxPlayers:Number(select.value)}),'sp-button sp-primary'));if(resume)controls.append(button('Retomar minha mesa',()=>void request('resume',{roomId:resume})));copy.append(controls);lobby.append(art,copy);content.append(lobby);
      const open=el('section','sp-open-rooms');open.append(el('h3','','Mesas abertas'),button('Atualizar mesas',()=>void request('list'),'sp-link'));if(!rooms.length)open.append(el('p','','Nenhuma mesa esperando. Crie uma e convide seus amigos.'));rooms.forEach(r=>open.append(button('Mesa de '+r.name+' · '+r.players+'/'+r.maxPlayers,()=>void request('join',{roomId:r.id}))));content.append(open);return;
    }
    const tools=el('div','sp-room-tools');tools.append(el('span','','Mesa '+room.id+' · '+room.players.length+' mercadores'),button('Sair da mesa',()=>{if(!s||s.phase==='finished'||confirm('Sair da partida? Um bot assume sua cadeira; esse resultado não entra nos seus recordes.'))void request('leave');},'sp-link'));content.append(tools);
    if(!s){const lobby=el('section','sp-waiting');lobby.append(el('span','sp-eyebrow','A MESA ESTÁ ABERTA'),el('h2','','Convide os outros mercadores'));const seats=el('div','sp-seats');room.players.forEach(p=>seats.append(el('span','',p.name+(p.online?' · pronto':' · reconectando'))));lobby.append(seats);if(room.hostId===window.TronoAuth.user?.id){const start=button('Começar com os presentes',()=>void request('start'),'sp-button sp-primary');start.disabled=room.players.length<2||room.players.some(p=>!p.online);const bots=button('Completar com bots e começar',()=>void request('start',{fillBots:true}));bots.disabled=room.players.some(p=>!p.online);lobby.append(start,bots);}else lobby.append(el('p','','Aguardando quem criou a mesa iniciar.'));content.append(lobby);return;}
    if(s.phase==='finished'){const result=el('section','sp-result');result.append(el('span','sp-eyebrow','O PRESTÍGIO CONQUISTA A CORTE'),el('h2','',s.winners.map(id=>s.players.find(p=>p.id===id).name).join(' e ')+(s.winners.length>1?' compartilham a vitória':' venceu')),el('p','','Maior pontuação; no empate, menos cartas de desenvolvimento. '+(room.recordStatus==='saved'?'Recordes salvos.':room.recordStatus==='pending'?'Recordes aguardando conexão.':'Conferindo os recordes…')));if(room.recordStatus==='pending')result.append(button('Tentar guardar recordes',()=>void request('retry-record')));content.append(result);}
    if(s.finalRound&&s.phase!=='finished')content.append(el('p','sp-final-round','Última rodada — todos completam o mesmo número de turnos. Vence a maior pontuação, mesmo acima de 15.'));
    content.append(table(s));const history=el('details','sp-history');history.append(el('summary','','Histórico de negociações'));const logs=el('ol');[...s.log].reverse().forEach(event=>logs.append(el('li','',eventText(event,s))));history.append(logs);content.append(history);
    if(detail){const banner=el('div','sp-event-banner');banner.setAttribute('role','status');banner.append(el('b','sp-event-value',detail.event.points?'+'+detail.event.points:'✦'),el('span','',eventText(detail.event,s)));content.append(banner);}
  }
  function stopAnimations(){generation++;wake?.();wake=null;queue=[];visual=null;busy=false;detail=null;document.querySelectorAll('.sp-flight').forEach(n=>n.remove());render();}
  const wait=ms=>new Promise(resolve=>{const timer=setTimeout(()=>{wake=null;resolve();},ms);wake=()=>{clearTimeout(timer);resolve();};});
  function fly(event,source,target){
    if(!source||!target)return;const a=source,b=target.getBoundingClientRect(),n=el('span','sp-flight');if(event.card){const image=card(event.card,{small:true,action:false});image.disabled=true;n.append(image);}else n.append(gem(event.kind==='reserve'?5:event.tokens?.findIndex(Boolean)??0,undefined,{chip:true}));$('splendorScreen').append(n);n.style.left=a.left+'px';n.style.top=a.top+'px';n.style.width=Math.max(38,Math.min(95,a.width))+'px';
    const anim=n.animate([{transform:'translate(0,0) rotate(-7deg) scale(1)',opacity:1},{transform:'translate('+(b.left-a.left)+'px,'+(b.top-a.top)+'px) rotate(5deg) scale(.65)',opacity:1},{transform:'translate('+(b.left-a.left)+'px,'+(b.top-a.top)+'px) scale(.35)',opacity:0}],{duration:1050,easing:'cubic-bezier(.22,.6,.23,1)',fill:'forwards'});anim.finished.catch(()=>{}).finally(()=>n.remove());
  }
  async function animateQueue(){
    if(busy)return;busy=true;const ticket=generation;
    while(queue.length&&ticket===generation&&visible()){
      const next=queue.shift(),event=next.last,source=event.card?document.querySelector('#splendorContent [data-card="'+event.card.id+'"]'):event.noble?document.querySelector('#splendorContent [data-noble="'+event.noble.id+'"]'):document.querySelector('#splendorContent [data-token="'+(event.kind==='reserve'?5:event.tokens?.findIndex(Boolean))+'"]');const rect=source?.getBoundingClientRect();visual=next;detail={event,playerId:event.playerId,displayScore:next.players.find(p=>p.id===event.playerId).score-event.points};render();sound(event.kind==='take'?'chip':event.kind==='noble'?'noble':'card');const target=document.querySelector('#splendorContent [data-player="'+event.playerId+'"]');fly(event,rect,target);await wait(1100);if(ticket!==generation)return;detail.displayScore=next.players.find(p=>p.id===event.playerId).score;render();if(event.points)sound('score');await wait(event.points?950:350);
    }
    if(ticket===generation){busy=false;visual=null;detail=null;render();}
  }
  function accept(next){
    const previous=room;room=next;resume=next.id;notice='';pending=false;clearTimeout(pendingTimer);selected=Array(6).fill(0);if(returnChoice&&returnChoice.revision!==next.state?.revision)dismiss();
    if(next.state?.revision>previous?.state?.revision&&next.state.revision===previous.state.revision+1&&visible()&&!reduced()){queue.push(JSON.parse(JSON.stringify(next.state)));void animateQueue();}else if(!busy)render();
    if(next.state?.phase==='finished'&&previous?.recordStatus!=='saved'&&next.recordStatus==='saved')refreshRanking();
  }
  function fullscreenState(){const active=document.fullscreenElement===$('splendorScreen')||immersive;$('splendorFullscreen').textContent=active?'Sair da tela cheia':'Tela cheia';$('splendorFullscreen').setAttribute('aria-pressed',String(active));}
  async function exitFullscreen(){if(immersive){immersive=false;$('splendorScreen').classList.remove('sp-immersive');}if(document.fullscreenElement===$('splendorScreen'))await document.exitFullscreen().catch(()=>{});fullscreenState();}
  window.addEventListener('DOMContentLoaded',()=>{
    $('playSplendor').onclick=open;$('splendorBack').onclick=()=>window.TronoGames.openLibrary();$('splendorRulesButton').onclick=()=>$('splendorRulesDialog').showModal();
    for(const id of ['splendorCardDialog','splendorReturnDialog','splendorRulesDialog','splendorCollectionDialog']){$(id).querySelector('[data-close]').onclick=()=>closeDialog(id);$(id).addEventListener('click',e=>{if(e.target===$(id)){const r=$(id).getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDialog(id);}});}
    $('splendorFullscreen').onclick=async()=>{if(document.fullscreenElement===$('splendorScreen')||immersive)return exitFullscreen();try{await $('splendorScreen').requestFullscreen();}catch{immersive=true;$('splendorScreen').classList.add('sp-immersive');}fullscreenState();};document.addEventListener('fullscreenchange',fullscreenState);window.addEventListener('keydown',e=>{if(e.key==='Escape'&&immersive)void exitFullscreen();});matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',e=>{if(e.matches)stopAnimations();});
    const sync=()=>{if(!visible()){stopAnimations();dismiss();void exitFullscreen();}};new MutationObserver(sync).observe($('splendorScreen'),{attributes:true,attributeFilter:['class']});document.addEventListener('visibilitychange',sync);
    window.TronoNetwork.onMessage(msg=>{
      if(msg.type==='splendor-state')accept(msg.room);
      if(msg.type==='splendor-rooms'){rooms=msg.rooms;resume=msg.resumeId;if(!busy)render();}
      if(msg.type==='splendor-left'){room=null;resume=null;stopAnimations();dismiss();void request('list');}
      if(msg.type==='splendor-ranking'&&msg.requestId===rankRequest){ranking=msg.rows;rankingError='';renderRanking();}
      if(msg.type==='splendor-error'){pending=false;clearTimeout(pendingTimer);if(msg.requestId===rankRequest)rankingError=msg.message;else notice=msg.message;if(msg.code==='SPLENDOR_STALE')void request('state');render();}
      if(msg.type==='connection'&&!msg.connected&&room){notice='Conexão interrompida. Sua mesa aguarda sua volta.';pending=false;stopAnimations();}
      if(msg.type==='auth-result'&&msg.ok&&room)void request('resume',{roomId:room.id});
    });
    window.addEventListener('trono-auth-change',()=>{if(!window.TronoAuth.user){room=null;resume=null;ranking=[];notice='';stopAnimations();dismiss();}else if(visible()){void request('list');refreshRanking();}});render();
  });
  return {open,get room(){return room;},get animating(){return busy;}};
})();
