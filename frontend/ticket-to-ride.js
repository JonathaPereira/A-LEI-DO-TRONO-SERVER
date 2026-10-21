'use strict';
window.TronoTicketToRide=(()=>{
 const $=id=>document.getElementById(id),D=window.TicketToRideData,R=window.TicketToRideRules,ns='http://www.w3.org/2000/svg';
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 const button=(text,fn,cls='tr-button')=>{const n=el('button',cls,text);n.type='button';n.onclick=fn;return n;};
 const svg=(tag,attrs={})=>{const n=document.createElementNS(ns,tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,v);return n;};
 const uid=()=>window.TronoAuth.user?.id,palette=['#f17966','#53c6bf','#e5b856','#a79be7','#70b3ed'];
 let room=null,rooms=[],resume=null,notice='',pending=false,timer,selection=null,highlight=null,drawOrigin=null;
 const effects=new Set(),reducedMotion=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 const mine=s=>s.players.find(p=>p.id===uid()),active=s=>s.phase==='playing'&&s.players[s.turn]?.id===uid(),locked=()=>pending||!window.TronoNetwork.connected;
 async function request(action,payload={}){try{if(!await window.TronoNetwork.ensureTicketToRide())return false;if(!window.TronoNetwork.ticketToRide(action,payload))throw Error('Conexão interrompida.');return true;}catch(e){notice=e.message;render();return false;}}
 function open(){window.TronoPortal.showOnly('ticketToRideScreen');window.TronoSocial.showForRoom(false);document.body.dataset.gamesView='ticket-to-ride';render();void request('list');}
 async function commit(move){if(locked()||!room?.state)return;
  const source=move.kind==='draw'?(move.source==='deck'?$('ticketToRideDeck'):document.querySelector(`[data-market-index="${move.index}"]`)):move.kind==='draw-tickets'?$('ticketToRideDrawTickets'):null;
  drawOrigin=source?{rect:source.getBoundingClientRect(),revision:room.state.revision}:null;
  pending=true;notice='';render();clearTimeout(timer);timer=setTimeout(()=>{pending=false;drawOrigin=null;notice='Aguardando confirmação. Confira a conexão.';void request('state');render();},12000);if(!await request('move',{revision:room.state.revision,move})){pending=false;drawOrigin=null;clearTimeout(timer);render();}}
 function clearEffects(){for(const animation of effects)animation.cancel();effects.clear();}
 function animate(node,frames,options,remove=false){
  const animation=node.animate(frames,options);effects.add(animation);
  const clean=()=>{effects.delete(animation);if(remove)node.remove();};animation.onfinish=clean;animation.oncancel=clean;
 }
 function flyCard(source,target,color,ticket=false,index=0){
  if(!source||!target||!source.width||!source.height)return;
  const end=target.getBoundingClientRect();if(!end.width||!end.height)return;
  const card=ticket?el('div','tr-ticket tr-ticket-flight','BILHETE DE DESTINO'):color?trainCard(color):el('div','tr-train-card tr-deck','✦');
  card.classList.add('tr-card-flight');card.setAttribute('aria-hidden','true');
  Object.assign(card.style,{left:source.left+'px',top:source.top+'px',width:source.width+'px',height:source.height+'px'});$('ticketToRideScreen').append(card);
  const x=end.left+end.width/2-source.left-source.width/2,y=end.top+end.height/2-source.top-source.height/2;
  animate(card,[{transform:'translate(0,0) rotate(-5deg)',opacity:1},{transform:`translate(${x*.55}px,${y*.35-45}px) rotate(8deg)`,opacity:1,offset:.55},{transform:`translate(${x}px,${y}px) scale(.65) rotate(0deg)`,opacity:0}],{duration:560,delay:index*80,easing:'cubic-bezier(.2,.65,.25,1)',fill:'both'},true);
 }
 function animateState(previous,next,origin){
  if(!previous||!next||next.revision<=previous.revision||reducedMotion()||$('ticketToRideScreen').classList.contains('hidden'))return;
  // State acknowledgement, rather than clicks, is the source of visual changes.
  for(const id of Object.keys(next.claimed))if(!previous.claimed[id]){
   const route=document.querySelector(`.tr-map [data-route="${id}"]`);
   route?.querySelectorAll('.tr-wagon-art').forEach((wagon,i)=>animate(wagon,[{opacity:0,transform:'translateY(-18px) scale(.4)'},{opacity:1,transform:'translateY(2px) scale(1.08)',offset:.7},{opacity:1,transform:'translateY(0) scale(1)'}],{duration:420,delay:i*85,easing:'cubic-bezier(.2,.8,.3,1)',fill:'backwards'}));
  }
  const before=mine(previous),after=mine(next);if(!before||!after)return;
  const counts=new Map();for(const color of before.hand)counts.set(color,(counts.get(color)||0)+1);
  const added=[];for(const color of after.hand){if(counts.get(color))counts.set(color,counts.get(color)-1);else added.push(color);}
  const source=origin?.rect||$('ticketToRideDeck')?.getBoundingClientRect();
  added.forEach((color,i)=>flyCard(source,document.querySelector(`.tr-hand [data-train-color="${color}"]`),color,false,i));
  for(const player of next.players)if(player.id!==uid()&&player.handCount>(previous.players.find(p=>p.id===player.id)?.handCount??player.handCount)){
   const event=next.log.at(-1),color=event?.kind==='draw'&&event.playerId===player.id?event.card:null;
   flyCard(source,[...document.querySelectorAll('.tr-player')].find(n=>n.dataset.playerId===player.id),color);
  }
  if(after.pending.length&&!before.pending.length){const deck=origin?.rect||$('ticketToRideDrawTickets')?.getBoundingClientRect();document.querySelectorAll('.tr-ticket-option .tr-ticket').forEach((ticket,i)=>flyCard(deck,ticket,null,true,i));}
 }
 function lobby(host){
  const intro=el('div','tr-intro');intro.append(el('span','tr-eyebrow','UMA VIAGEM PELO MAPA CLÁSSICO'),el('h2','','De costa a costa.'),el('p','','Colecione vagões, conecte cidades e guarde seus destinos em segredo. Cada trecho aproxima sua ferrovia de uma grande viagem.'));
  const metrics=el('div','tr-metrics');for(const t of ['2–5 viajantes','45 vagões por pessoa','30 bilhetes de destino'])metrics.append(el('span','',t));intro.append(metrics);host.append(intro);
  const grid=el('div','tr-lobby'),create=el('section','tr-panel');create.append(el('span','tr-eyebrow','PRÓXIMA PARTIDA'),el('h3','','Uma nova ferrovia'));
  const label=el('label','','Lugares na mesa '),select=el('select');select.id='ticketToRidePlayers';select.setAttribute('aria-label','Lugares na mesa');for(let i=2;i<=5;i++){const o=el('option','',String(i));o.value=i;select.append(o);}label.append(select);create.append(label,button('Criar mesa',()=>void request('create',{maxPlayers:Number(select.value)}),'tr-button tr-primary'));
  const join=el('section','tr-panel');join.append(el('span','tr-eyebrow','VIAJE COM AMIGOS'),el('h3','','Embarcar com um código'));const code=el('input');code.id='ticketToRideCode';code.placeholder='Código da mesa';code.maxLength=10;code.setAttribute('aria-label','Código da mesa');join.append(code,button('Entrar na mesa',()=>void request('join',{roomId:code.value.trim().toUpperCase()})));if(resume)join.append(button('Retomar minha mesa',()=>void request('resume',{roomId:resume}),'tr-button tr-primary'));grid.append(create,join);host.append(grid);
  const list=el('section','tr-open-tables');list.append(el('h3','','Mesas aguardando partida'));if(!rooms.length)list.append(el('p','','A estação está tranquila. Crie a primeira mesa.'));for(const r of rooms)list.append(button(r.name+' · '+r.players+'/'+r.maxPlayers+' · '+r.id,()=>void request('join',{roomId:r.id})));host.append(list);
 }
 function ticketCard(id,complete=false){const t=D.tickets.find(t=>t.id===id),n=el('div','tr-ticket'+(complete?' tr-complete':''));n.dataset.ticketId=id;n.append(el('span','tr-ticket-icon',complete?'✓':'↔'),el('strong','',t.a+' → '+t.b),el('b','',t.points+' pts'));return n;}
 function tickets(host,s,p){
  const panel=el('section','tr-panel tr-tickets');panel.setAttribute('aria-label','Seus objetivos');panel.append(el('span','tr-eyebrow','SUAS VIAGENS'),el('h2','','Objetivos'),el('p','tr-muted',p.completed.length+' de '+p.tickets.length+' concluídos · bilhetes privados'));
  const collection=el('div','tr-ticket-collection');
  for(const id of p.tickets){const n=button('',()=>{highlight=highlight===id?null:id;render();},'tr-ticket-button');n.append(ticketCard(id,p.completed.includes(id)));n.setAttribute('aria-pressed',String(highlight===id));collection.append(n);}panel.append(collection);
  if(p.pending.length){
   const choose=el('div','tr-ticket-choice');choose.id='ticketToRideChoice';choose.setAttribute('role','region');choose.setAttribute('aria-label','Escolha de destinos');choose.append(el('h3','',p.initial?'Escolha seus destinos iniciais':'Novos destinos'),el('p','',p.initial?'Mantenha pelo menos 2 dos 3 bilhetes.':'Mantenha pelo menos 1 bilhete. Os demais voltam ao fundo.'));
   const picks=new Set();for(const id of p.pending){const label=el('label','tr-ticket-option'),check=el('input');check.type='checkbox';check.value=id;check.onchange=()=>{check.checked?picks.add(id):picks.delete(id);confirm.disabled=locked()||picks.size<Math.min(p.initial?2:1,p.pending.length);};label.append(check,ticketCard(id));choose.append(label);}const confirm=button('Confirmar destinos',()=>void commit({kind:'tickets',keep:[...picks]}),'tr-button tr-primary');confirm.id='ticketToRideKeep';confirm.disabled=true;choose.append(confirm);panel.append(choose);
  }host.append(panel);
 }
 function map(s){
  const wrap=el('section','tr-map-wrap'),canvas=svg('svg',{viewBox:'0 0 1200 740',role:'img','aria-label':'Ferrovias do mapa clássico dos Estados Unidos',class:'tr-map'});canvas.append(svg('rect',{width:1200,height:740,rx:18,fill:'#e6ddc5'}));
  const land=svg('path',{d:'M40 85L115 40 265 43 485 52 650 73 730 82 795 123 922 60 1012 82 1096 102 1152 148 1080 244 1054 311 1074 350 1054 394 1036 446 1045 509 1012 542 1015 588 1072 679 1040 705 984 648 947 586 896 585 858 625 787 642 751 679 680 683 642 667 578 643 537 662 502 631 480 618 424 623 356 597 309 586 241 573 182 559 109 543 62 474 25 397 34 313 46 251 32 186Z',fill:'#d5d4b6',stroke:'#b5baa0','stroke-width':3});canvas.append(land);
  // Subtle grid, mountain chains and Great Lakes are original vector artwork.
  for(let x=80;x<1200;x+=80)canvas.append(svg('path',{d:`M${x} 0V740`,stroke:'#7d8877','stroke-opacity':'.08'}));for(let y=60;y<740;y+=60)canvas.append(svg('path',{d:`M0 ${y}H1200`,stroke:'#7d8877','stroke-opacity':'.08'}));
  for(let i=0;i<16;i++){const x=160+(i%4)*35,y=200+Math.floor(i/4)*62;canvas.append(svg('path',{d:`M${x} ${y+27}l15-28 15 28-15-15Z`,fill:'#9fae96','fill-opacity':'.5'}));}
  for(const d of ['M650 151q44-35 86 6l-31 20Z','M720 187q34-19 40 31l-15 37-16-9Z','M777 199q9-47 27-40l9 45-18 22Z','M797 253q41-30 62-1l-28 13Z'])canvas.append(svg('path',{d,fill:'#a1bbc1'}));
  const title=svg('text',{x:72,y:688,class:'tr-map-title'});title.textContent='THE GREAT AMERICAN RAILWAY';canvas.append(title);const subtitle=svg('text',{x:74,y:710,class:'tr-map-subtitle'});subtitle.textContent='36 CIDADES · COSTA A COSTA';canvas.append(subtitle);
  for(const r of D.routes){
   const [ax,ay]=D.cities[r.a],[bx,by]=D.cities[r.b],dx=bx-ax,dy=by-ay,len=Math.hypot(dx,dy),offset=r.double?(r.lane?5:-5):0,nx=-dy/len*offset,ny=dx/len*offset,angle=Math.atan2(dy,dx)*180/Math.PI,owner=s.claimed[r.id],player=s.players.findIndex(p=>p.id===owner),color=owner?palette[player]:{purple:'#976a9b',white:'#fff7e0',blue:'#5589a6',yellow:'#deb64d',orange:'#d28c4c',black:'#52565a',red:'#bf6b5c',green:'#72966b',gray:'#a5a294'}[r.color];
   const g=svg('g',{'data-route':r.id,role:'button',tabindex:0,'aria-label':`${r.a} — ${r.b} · ${r.length} ${D.names[r.color]}${owner?' · '+s.players[player].name:''}`,class:'tr-route'+(owner?' tr-owned':'')+(selection===r.id?' tr-selected':'')});
   const hit=svg('line',{x1:ax+nx,y1:ay+ny,x2:bx+nx,y2:by+ny,stroke:'transparent','stroke-width':16});g.append(hit);
   for(let i=0;i<r.length;i++){const fraction=(i+.5)/r.length,x=ax+dx*fraction+nx,y=ay+dy*fraction+ny,w=Math.min(27,(len-25)/r.length-4),slot=svg('g',{transform:`translate(${x} ${y}) rotate(${angle})`}),art=svg('g',{class:owner?'tr-wagon-art':'tr-track-art'});
    art.append(svg('rect',{x:-w/2,y:-4,width:w,height:8,rx:2,fill:color,stroke:owner?'#fff4d8':'#525a50','stroke-width':owner?1.4:.7}));
    if(owner){art.append(svg('rect',{x:-w/2+3,y:-2.5,width:Math.max(1,w-6),height:3,rx:1,fill:'#ffffff55'}));for(const cx of [-w/2+4,w/2-4])art.append(svg('circle',{cx,cy:4,r:1.6,fill:'#25343a'}));}
    slot.append(art);g.append(slot);
   }
   const choose=()=>{selection=r.id;notice='';render();if(!window.matchMedia('(min-width: 1000px) and (min-aspect-ratio: 4/3)').matches)$('ticketToRidePayment')?.scrollIntoView({block:'nearest',behavior:reducedMotion()?'instant':'smooth'});};g.onclick=choose;g.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose();}};canvas.append(g);
  }
  const destination=D.tickets.find(t=>t.id===highlight);for(const [name,[x,y]]of Object.entries(D.cities)){if(destination&&[destination.a,destination.b].includes(name))canvas.append(svg('circle',{cx:x,cy:y,r:17,fill:'none',stroke:'#c56440','stroke-width':4}));canvas.append(svg('circle',{cx:x,cy:y,r:5,fill:'#f8f0db',stroke:'#48594f','stroke-width':2}));const text=svg('text',{x:x+8,y:y-9,class:'tr-city'});text.textContent=name;canvas.append(text);}wrap.append(canvas);return wrap;
 }
 function payment(host,s,p){
  const r=D.routes.find(r=>r.id===selection);if(!r)return;const panel=el('section','tr-panel tr-payment');panel.id='ticketToRidePayment';panel.append(el('span','tr-eyebrow','CONSTRUIR FERROVIA'),el('h2','',r.a+' → '+r.b),el('p','',r.length+' vagões · '+D.points[r.length]+' pontos · '+D.names[r.color]));
  const options=R.payments(s,p,r);if(s.claimed[r.id])panel.append(el('p','','Esta rota já tem uma ferrovia.'));else if(!active(s)||s.drawn||p.pending.length)panel.append(el('p','','Construa no seu turno, antes de comprar cartas.'));else if(!options.length)panel.append(el('p','','Você precisa de cartas e vagões suficientes. Rotas paralelas ficam bloqueadas em partidas com 2–3 pessoas e não podem pertencer à mesma pessoa.'));
  else{const label=el('label','','Pagamento '),select=el('select');select.setAttribute('aria-label','Pagamento da rota');options.forEach((o,i)=>{const opt=el('option','',(r.length-o.locos)+' '+D.names[o.color]+' + '+o.locos+' locomotiva(s)');opt.value=i;select.append(opt);});label.append(select);const pay=button('Construir rota',()=>void commit({kind:'claim',routeId:r.id,...options[Number(select.value)]}),'tr-button tr-primary');pay.id='ticketToRideClaim';pay.disabled=locked();panel.append(label,pay);}panel.append(button('Fechar rota',()=>{selection=null;render();},'tr-link'));host.append(panel);
 }
 function trainCard(color,count,onClick){const n=onClick?button('',onClick,'tr-train-card'):el('div','tr-train-card');n.dataset.trainColor=color;
  const picture=svg('svg',{viewBox:'0 0 100 64',class:'tr-train-art','aria-hidden':'true'});picture.append(svg('path',{d:color==='loco'?'M12 42V27h15V15h12v12h13V9h8v18h17l9 17H12Z':'M10 17h79v28H10Z',fill:'currentColor',stroke:'#f4e6bf','stroke-width':1.5}));
  if(color!=='loco')for(let x=20;x<82;x+=15)picture.append(svg('rect',{x,y:24,width:9,height:10,rx:1,fill:'#14242f99'}));
  for(const x of [26,74])picture.append(svg('circle',{cx:x,cy:47,r:7,fill:'#152630',stroke:'#e6cc91','stroke-width':2}));picture.append(svg('path',{d:'M5 56H96',stroke:'#e6cc91','stroke-width':2}));
  n.append(picture,el('span','tr-card-name',D.names[color]));if(count!==undefined){n.append(el('b','',String(count)));n.classList.toggle('tr-empty',count===0);n.setAttribute('aria-label',D.names[color]+': '+count+' carta(s)');}return n;}
 function market(host,s,p){
  const panel=el('section','tr-panel tr-supply');panel.setAttribute('aria-label','Compra de vagões');panel.append(el('span','tr-eyebrow','A ESTAÇÃO'),el('h2','','Comprar vagões'),el('p','tr-muted',s.drawn?'Escolha a segunda carta.':'Duas cartas ou uma locomotiva aberta.'));
  const cards=el('div','tr-market');s.market.forEach((c,i)=>{const n=trainCard(c,undefined,()=>void commit({kind:'draw',source:'market',index:i}));n.dataset.marketIndex=i;n.setAttribute('aria-label','Comprar '+D.names[c]+' · carta '+(i+1));n.disabled=locked()||!active(s)||p.pending.length>0||c==='loco'&&s.drawn>0;cards.append(n);});const deck=button('',()=>void commit({kind:'draw',source:'deck'}),'tr-train-card tr-deck');deck.append(el('span','tr-deck-emblem','✦'),el('span','tr-card-name','MONTE FECHADO'),el('b','',String(s.deckCount)));deck.id='ticketToRideDeck';deck.setAttribute('aria-label','Comprar do monte fechado · '+s.deckCount+' cartas');deck.disabled=s.phase!=='playing'||locked()||!active(s)||p.pending.length>0||!s.deckCount&&!s.discardCount;panel.append(deck,cards);
  if(!s.market.length&&!s.deckCount&&!s.discardCount&&s.phase==='playing'){const pass=button('Passar · sem cartas disponíveis',()=>void commit({kind:'pass'}));pass.disabled=locked()||!active(s)||D.routes.some(r=>R.payments(s,p,r).length);panel.append(pass);}host.append(panel);
 }
 function destinationDeck(host,s,p){
  const panel=el('section','tr-panel tr-destination-deck');panel.setAttribute('aria-label','Pilha de cartas de destino');panel.append(el('span','tr-eyebrow','PRÓXIMA VIAGEM'),el('h2','','Cartas de destino'));
  const take=button('',()=>void commit({kind:'draw-tickets'}),'tr-destination-card');take.append(el('span','tr-compass','✥'),el('span','','COMPRAR DESTINOS'),el('strong','',s.ticketCount+' bilhetes'));take.id='ticketToRideDrawTickets';take.setAttribute('aria-label','Comprar bilhetes · '+s.ticketCount);take.disabled=s.phase!=='playing'||locked()||!active(s)||s.drawn>0||p.pending.length>0||!s.ticketCount;panel.append(take);host.append(panel);
 }
 function render(){
  const host=$('ticketToRideContent');if(!host)return;for(const animation of effects)if(host.contains(animation.effect?.target))animation.cancel();host.replaceChildren();$('ticketToRideScreen').classList.toggle('tr-at-table',!!room?.state);$('ticketToRideNotice').textContent=notice;const status=$('ticketToRideStatus');status.textContent=room?'MESA '+room.id:'ESTAÇÃO M&N';if(!room){lobby(host);return;}
  const toolbar=el('div','tr-table-tools');toolbar.append(el('span','','Código: '+room.id),button(room.state?'Sair da partida':'Sair da mesa',()=>{if(!room.state||window.confirm('Sair desta partida? Um bot assumirá seu lugar.'))void request('leave');},'tr-link'));host.append(toolbar);
  if(!room.state){const wait=el('section','tr-panel');wait.append(el('span','tr-eyebrow','AGUARDANDO EMBARQUE'),el('h2','','Sua mesa está pronta'));for(const p of room.players)wait.append(el('p','',p.name+(p.online?' · online':' · reconectando')));if(room.hostId===uid()){wait.append(button('Iniciar com bots',()=>void request('start',{fillBots:true}),'tr-button tr-primary'));if(room.players.length>=2)wait.append(button('Iniciar com os presentes',()=>void request('start')));}else wait.append(el('p','','Aguardando o anfitrião iniciar.'));host.append(wait);return;}
  const s=room.state,p=mine(s);if(!p)return;const scores=el('div','tr-scoreboard');scores.setAttribute('aria-label','Placar dos viajantes');s.players.forEach((x,i)=>{const n=el('article','tr-player'+(s.turn===i?' tr-active':''));n.dataset.playerId=x.id;n.style.setProperty('--player',palette[i]);n.append(el('strong','',x.name+(x.id===uid()?' · você':'')),el('b','',x.score+' pts'),el('small','',x.trains+' vagões · '+x.handCount+' cartas · '+x.ticketCount+' destinos'+(x.bot?' · bot':'')));scores.append(n);});
  const instruction=s.phase==='setup'?'Escolha os destinos iniciais para começar.':s.phase==='finished'?'Viagem concluída. Veja os destinos revelados.':active(s)?p.pending.length?'Escolha os novos destinos.':s.drawn?'Sua vez · escolha a segunda carta.':'Sua vez · compre cartas, construa uma rota ou compre destinos.':'Vez de '+s.players[s.turn].name;
  const turn=el('p','tr-turn',instruction+(s.finalTurns!==null&&s.phase!=='finished'?' · Rodada final: '+s.finalTurns+' turno(s) restante(s)':''));turn.setAttribute('role','status');host.append(turn);
  const layout=el('div','tr-layout'),board=el('div','tr-board-column'),side=el('aside','tr-sidebar');board.append(map(s));payment(board,s,p);
  const hand=el('section','tr-panel tr-hand');hand.setAttribute('aria-label','Suas cartas compradas');hand.append(el('span','tr-eyebrow','SUA MÃO'),el('h2','','Seus vagões'),el('p','tr-muted',p.handCount+' cartas · mão privada'));const cards=el('div','tr-hand-cards');for(const color of [...D.colors,'loco']){const count=p.hand.filter(c=>c===color).length;if(count)cards.append(trainCard(color,count));}if(!p.hand.length)cards.append(el('p','tr-muted','Compre cartas na estação.'));hand.append(cards);
  market(side,s,p);const players=el('aside','tr-players-column');players.append(scores);layout.append(hand,board,side,players);tickets(layout,s,p);destinationDeck(layout,s,p);host.append(layout);
  if(s.phase==='finished'){const results=el('section','tr-panel tr-results');results.id='ticketToRideResults';results.append(el('h2','',s.winners.map(id=>s.players.find(p=>p.id===id).name).join(' e ')+' · vitória!'));for(const result of s.results){const item=el('article');item.append(el('h3','',s.players.find(p=>p.id===result.id).name+' · '+result.total+' pontos'),el('p','',result.routeScore+' de rotas + '+result.ticketScore+' de destinos + '+result.bonus+' de maior caminho ('+result.longest+' vagões)'));for(const t of result.tickets)item.append(ticketCard(t.id,t.complete));results.append(item);}board.append(results);}
  const log=el('details','tr-log');log.append(el('summary','','Diário da viagem'));for(const e of [...s.log].reverse().slice(0,8)){const who=s.players.find(p=>p.id===e.playerId)?.name;if(e.kind==='claim'){const r=D.routes.find(r=>r.id===e.routeId);log.append(el('p','',who+' conectou '+r.a+' a '+r.b+' · +'+e.points+' pts'));}else log.append(el('p','',who+(e.kind==='final'?' iniciou a rodada final.':e.card?' comprou '+D.names[e.card]+'.':' comprou uma carta fechada.')));}players.append(log);
 }
 window.addEventListener('DOMContentLoaded',()=>{
  $('playTicketToRide').onclick=open;$('ticketToRideBack').onclick=()=>window.TronoGames.openLibrary();$('ticketToRideRulesButton').onclick=()=>$('ticketToRideRulesDialog').showModal();$('ticketToRideRulesDialog').querySelector('[data-close]').onclick=()=>$('ticketToRideRulesDialog').close();
  $('ticketToRideFullscreen').onclick=async()=>{try{if(document.fullscreenElement===$('ticketToRideScreen'))await document.exitFullscreen();else await $('ticketToRideScreen').requestFullscreen();}catch{notice='Tela cheia indisponível neste dispositivo.';render();}};
  document.addEventListener('fullscreenchange',()=>{const full=document.fullscreenElement===$('ticketToRideScreen');$('ticketToRideFullscreen').textContent=full?'Sair da tela cheia':'Tela cheia';$('ticketToRideFullscreen').setAttribute('aria-pressed',String(full));clearEffects();});
  new MutationObserver(()=>{if($('ticketToRideScreen').classList.contains('hidden')){clearEffects();if(document.fullscreenElement===$('ticketToRideScreen'))void document.exitFullscreen();if($('ticketToRideRulesDialog').open)$('ticketToRideRulesDialog').close();}}).observe($('ticketToRideScreen'),{attributes:true,attributeFilter:['class']});
  window.TronoNetwork.onMessage(msg=>{
   if(msg.type==='ticket-to-ride-state'){
    const previous=room?.id===msg.room.id?room.state:null,event=msg.room.state?.log.at(-1),index=event?.card?previous?.market.indexOf(event.card):-1;
    const source=index>=0?document.querySelector(`[data-market-index="${index}"]`):$('ticketToRideDeck'),origin=drawOrigin?.revision===previous?.revision?drawOrigin:{rect:source?.getBoundingClientRect()};
    room=msg.room;resume=room.id;pending=false;if(!previous||room.state?.revision>previous.revision)drawOrigin=null;clearTimeout(timer);if(previous&&Object.keys(room.state?.claimed||{}).some(id=>!previous.claimed[id]))selection=null;render();animateState(previous,room.state,origin);
   }
   if(msg.type==='ticket-to-ride-rooms'){rooms=msg.rooms;resume=msg.resumeId;if(!room)render();}
   if(msg.type==='ticket-to-ride-left'){clearEffects();room=null;resume=null;pending=false;drawOrigin=null;clearTimeout(timer);selection=null;highlight=null;notice=msg.reason||'';render();void request('list');}
   if(msg.type==='ticket-to-ride-error'){notice=msg.message;pending=false;drawOrigin=null;clearTimeout(timer);if(msg.code==='TICKET_TO_RIDE_STALE')void request('state');render();}
   if(msg.type==='connection'&&!msg.connected&&room){pending=false;drawOrigin=null;notice='Conexão interrompida. Retome sua mesa em até 90 segundos.';render();}
   if(msg.type==='auth-result'&&msg.ok){if(room)void request('resume',{roomId:room.id});else if(!$('ticketToRideScreen').classList.contains('hidden'))void request('list');}
  });window.addEventListener('trono-auth-change',()=>{if(!uid()){clearEffects();room=null;resume=null;pending=false;drawOrigin=null;clearTimeout(timer);selection=null;highlight=null;render();}});render();
 });return {open,get room(){return room;}};
})();
