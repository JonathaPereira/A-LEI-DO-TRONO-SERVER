(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Abyss = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const W = 1280, H = 640, FLOOR = 558;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const approach = (v, target, amount) => v < target ? Math.min(target, v + amount) : Math.max(target, v - amount);
  const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  function hash(text) { let h = 2166136261; for (const c of String(text)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
  function random(seed) { let a = hash(seed); return () => { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const COLORS = { fire: '#f69d65', frost: '#8fddeb', lightning: '#c4a8fb', poison: '#a5d284', weapon: '#e9bc83', body: '#90d4b7', arcane: '#d1b7de' };
  const WEAPONS = {
    blade: { name: 'Lâmina do Andarilho', cooldown: .32, damage: 1, range: 120 },
    bow: { name: 'Arco do Crepúsculo', cooldown: .40, damage: 1.1, range: 750 },
    hammer: { name: 'Martelo Ancestral', cooldown: .65, damage: 2.15, range: 138 },
    staff: { name: 'Cajado das Marés', cooldown: .28, damage: .8, range: 700 }
  };
  const CARDS = [
    { id:'fire',name:'Brasa viva',type:'Fogo',family:'fire',icon:'flame',desc:'Ataques queimam por 3s: 6 de dano por segundo por nível.',max:3,apply:p=>p.fire++ },
    { id:'inferno',name:'Última faísca',type:'Fogo · sinergia',family:'fire',icon:'burst',desc:'Inimigos queimando explodem ao morrer: 24 de dano ao redor.',max:1,requires:p=>p.fire>0,apply:p=>p.inferno=true },
    { id:'frost',name:'Toque do inverno',type:'Gelo',family:'frost',icon:'snow',desc:'Desacelera inimigos por 2s. +8% de dano por nível.',max:3,apply:p=>{p.frost++;p.power+=.08;} },
    { id:'shatter',name:'Gelo quebradiço',type:'Gelo · sinergia',family:'frost',icon:'crystal',desc:'Causa 30% a mais de dano em inimigos desacelerados.',max:1,requires:p=>p.frost>0,apply:p=>p.shatter=true },
    { id:'lightning',name:'Corrente elétrica',type:'Raio',family:'lightning',icon:'bolt',desc:'Cada ataque salta para outro alvo próximo com 35% do dano.',max:3,apply:p=>p.lightning++ },
    { id:'storm',name:'Olho da tempestade',type:'Raio · sinergia',family:'lightning',icon:'storm',desc:'Aumenta o alcance do raio em 50% e seu dano para 60%.',max:1,requires:p=>p.lightning>0,apply:p=>p.storm=true },
    { id:'poison',name:'Espinho tóxico',type:'Veneno',family:'poison',icon:'leaf',desc:'Aplica veneno por 5s: 4 de dano por segundo por nível.',max:3,apply:p=>p.poison++ },
    { id:'plague',name:'Jardim venenoso',type:'Veneno · sinergia',family:'poison',icon:'thorns',desc:'Veneno causa o dobro do dano. Reduz seu dano direto em 10%.',max:1,requires:p=>p.poison>0,apply:p=>{p.plague=true;p.power-=.1;} },
    { id:'bow',name:'Arco do crepúsculo',type:'Arma · substitui a atual',family:'weapon',icon:'bow',desc:'Dispara flechas à distância. Mantém todos os seus buffs.',max:1,requires:p=>p.weapon!=='bow',apply:p=>p.weapon='bow' },
    { id:'hammer',name:'Martelo ancestral',type:'Arma · substitui a atual',family:'weapon',icon:'hammer',desc:'Golpes lentos em área causam 2,15× dano. Mantém buffs.',max:1,requires:p=>p.weapon!=='hammer',apply:p=>p.weapon='hammer' },
    { id:'staff',name:'Cajado das marés',type:'Arma · substitui a atual',family:'weapon',icon:'staff',desc:'Orbes à distância seguem inimigos. Mantém todos os buffs.',max:1,requires:p=>p.weapon!=='staff',apply:p=>p.weapon='staff' },
    { id:'blade',name:'Lâmina do andarilho',type:'Arma · substitui a atual',family:'weapon',icon:'sword',desc:'Retoma a lâmina rápida com arco de corte. Mantém buffs.',max:1,requires:p=>p.weapon!=='blade',apply:p=>p.weapon='blade' },
    { id:'power',name:'Fio de obsidiana',type:'Arma · aprimoramento',family:'weapon',icon:'sword',desc:'+22% ao dano base dos ataques e da explosão arcana.',max:5,apply:p=>p.power+=.22 },
    { id:'haste',name:'Mãos do vento',type:'Arma · aprimoramento',family:'weapon',icon:'wind',desc:'+18% de velocidade de ataque. Acumula até 4 níveis.',max:4,apply:p=>p.haste+=.18 },
    { id:'critical',name:'Olhar do caçador',type:'Arma · aprimoramento',family:'weapon',icon:'eye',desc:'+15% de chance de crítico. Críticos causam 2× dano.',max:4,apply:p=>p.crit+=.15 },
    { id:'reach',name:'Corte distante',type:'Arma · aprimoramento',family:'weapon',icon:'arc',desc:'+25% ao alcance corpo a corpo e à duração de projéteis.',max:3,apply:p=>p.reach+=.25 },
    { id:'pierce',name:'Atravessador',type:'Arma · aprimoramento',family:'weapon',icon:'arrow',desc:'Projéteis atravessam mais 1 alvo. Lâmina e martelo: +12% dano.',max:3,apply:p=>{p.pierce++;p.meleePower+=.12;} },
    { id:'vitality',name:'Coração da floresta',type:'Vigor',family:'body',icon:'heart',desc:'+20 de vida máxima e recupera 20 de vida.',max:3,apply:p=>{p.maxHp+=20;p.hp=Math.min(p.maxHp,p.hp+20);} },
    { id:'armor',name:'Pele de pedra',type:'Vigor',family:'body',icon:'shield',desc:'Reduz o dano recebido em 10%, até o limite de 30%.',max:3,apply:p=>p.armor+=.10 },
    { id:'vampire',name:'Pacto vital',type:'Vigor',family:'body',icon:'drop',desc:'Cada inimigo derrotado recupera 1 de vida por nível.',max:3,apply:p=>p.vampire+=1 },
    { id:'regen',name:'Sopro verde',type:'Vigor',family:'body',icon:'sprout',desc:'Recupera 0,4 de vida por segundo por nível.',max:2,apply:p=>p.regen+=.4 },
    { id:'dash',name:'Passo espectral',type:'Movimento',family:'arcane',icon:'wing',desc:'Esquiva recarrega 20% mais rápido. +10% ao movimento.',max:3,apply:p=>{p.dashRate+=.2;p.speed+=.1;} },
    { id:'magic',name:'Núcleo arcano',type:'Habilidade',family:'arcane',icon:'orb',desc:'Especial da arma: +25% de dano e +15% à velocidade de recarga.',max:3,apply:p=>{p.magicPower+=.25;p.magicRate+=.15;} },
    { id:'nova',name:'Constelação perdida',type:'Habilidade',family:'arcane',icon:'stars',desc:'Amplia a área dos especiais e o alcance do tiro concentrado. +20% de dano.',max:2,apply:p=>{p.magicRange+=100;p.magicPower+=.2;} }
  ];
  const WEAPON_IDS=['blade','bow','hammer','staff'],ELEMENT_IDS=['fire','frost','lightning','poison'];
  for(const card of CARDS){card.category=WEAPON_IDS.includes(card.id)?'weapon':ELEMENT_IDS.includes(card.id)?'element':'modifier';if(card.category==='element'){card.max=1;card.type+=' · desperta a habilidade';}if(card.category==='weapon')delete card.requires;}
  CARDS.push(
    {id:'ember',name:'Pena da fênix',type:'Elemento · intensidade',family:'fire',icon:'flame',art:'phoenix',desc:'Adiciona 1 nível de fogo aos ataques e +10% de dano à habilidade. Combina com outros elementos.',max:4,apply:p=>{p.fire++;p.magicPower+=.1;}},
    {id:'rime',name:'Coroa do inverno',type:'Elemento · intensidade',family:'frost',icon:'snow',art:'icecrown',desc:'Adiciona 1 nível de gelo e +8% de dano base. Habilita a onda glacial.',max:4,apply:p=>{p.frost++;p.power+=.08;}},
    {id:'conductor',name:'Anéis da tempestade',type:'Elemento · intensidade',family:'lightning',icon:'bolt',art:'rings',desc:'Adiciona 1 nível de raio: mais um salto elétrico e +8% de dano da habilidade.',max:3,apply:p=>{p.lightning++;p.magicPower+=.08;}},
    {id:'toxin',name:'Flor da peste',type:'Elemento · intensidade',family:'poison',icon:'leaf',art:'toxic',desc:'Adiciona 1 nível de veneno aos ataques e +20% de alcance da habilidade.',max:4,apply:p=>{p.poison++;p.magicRange+=49;}},
    {id:'echo',name:'Lâminas ecoantes',type:'Arma · golpe adicional',family:'weapon',icon:'arc',art:'echo',desc:'Cada golpe repete 28% do dano após 0,18s. Dois níveis: 56%. O eco não gera outro eco.',max:2,apply:p=>p.echo=(p.echo||0)+1},
    {id:'shockwave',name:'Ruptura sísmica',type:'Arma · onda de impacto',family:'weapon',icon:'burst',art:'meteor',desc:'Lâmina e martelo lançam uma onda no chão: 18 de dano por nível. A onda atravessa inimigos.',max:3,requires:p=>['blade','hammer'].includes(p.weapon),apply:p=>p.shockwave=(p.shockwave||0)+1},
    {id:'fury',name:'Último juramento',type:'Arma · combo',family:'weapon',icon:'sword',art:'edge',desc:'Terceiro golpe do combo causa +25% de dano por nível. Também melhora o ataque aéreo.',max:3,requires:p=>['blade','hammer'].includes(p.weapon),apply:p=>p.fury=(p.fury||0)+1},
    {id:'focus',name:'Constelação voraz',type:'Habilidade · recarga',family:'arcane',icon:'stars',art:'core',desc:'Cada abate reduz a recarga da habilidade em 0,4s por nível.',max:3,apply:p=>p.focus=(p.focus||0)+1},
    {id:'aegis',name:'Escudo do peregrino',type:'Vida · proteção',family:'body',icon:'shield',art:'shield',desc:'Por 2s após esquivar, reduz mais 15% do dano recebido por nível.',max:2,apply:p=>p.aegis=(p.aegis||0)+1},
    {id:'bloodrage',name:'Lua de sangue',type:'Vida · risco e recompensa',family:'body',icon:'drop',art:'bloodmoon',desc:'Abaixo de 40% da vida, ataques causam +35% de dano. Abates recuperam mais 1 de vida.',max:1,apply:p=>{p.bloodrage=true;p.vampire++;}},
    {id:'fleet',name:'Botas do horizonte',type:'Movimento · travessia',family:'arcane',icon:'wing',art:'boots',desc:'+8% de movimento e +6% à força do pulo por nível.',max:3,apply:p=>{p.speed+=.08;p.jumpPower=(p.jumpPower||1)+.06;}},
    {id:'ward',name:'Pele de salamandra',type:'Vida · terreno',family:'body',icon:'shield',art:'shield',desc:'Reduz em 50% o dano de terrenos de brasa. Dois níveis anulam esse dano.',max:2,apply:p=>p.terrainWard=(p.terrainWard||0)+.5}
  );
  for(const card of CARDS){card.category=card.category||'modifier';card.art=card.art||({power:'edge',haste:'boots',critical:'edge',reach:'echo',pierce:'edge',vitality:'heart',armor:'shield',vampire:'bloodmoon',regen:'heart',dash:'boots',magic:'core',nova:'core',inferno:'phoenix',shatter:'icecrown',storm:'rings',plague:'toxic'}[card.id]);}
  const DRAFT_LABELS=['1 · Escolha sua arma','2 · Desperte um elemento','3 · Aprimore vida, elemento ou arma','Modificadores · componha sua build'];
  const REGIONS = [
    {name:'Floresta esquecida',subtitle:'Sob as raízes, algo desperta.',boss:'O Guardião de Raízes',accent:'#78c9ac',sky:['#0c2028','#21443e'],stone:'#1d3b3a',top:'#5b8470'},
    {name:'Ruínas do eclipse',subtitle:'As pedras lembram o seu nome.',boss:'A Sentinela do Eclipse',accent:'#ba9ed9',sky:['#181c32','#3a344c'],stone:'#343346',top:'#78728a'},
    {name:'Forja das cinzas',subtitle:'A última chama exige um preço.',boss:'O Rei da Forja',accent:'#ee9b6c',sky:['#251c26','#51342e'],stone:'#3d3335',top:'#94785d'}
  ];
  const Levels=typeof module==='object'&&module.exports?require('./levels.js'):globalThis.AbyssLevels;
  const Rig=typeof module==='object'&&module.exports?require('./rig.js'):globalThis.AbyssRig;
  const SPECIALS={blade:{name:'Corte giratório',cooldown:6,windup:.16,duration:.72},bow:{name:'Tiro concentrado',cooldown:7,windup:.7,duration:1.06},staff:{name:'Disparo elemental',cooldown:6,windup:.46,duration:.82},hammer:{name:'Impacto sísmico',cooldown:8,windup:.48,duration:1.02}};
  function hordeTuning(wave){const w=Math.max(1,wave),tier=Math.floor((w-1)/5);return {hp:1+(w-1)*.065+Math.max(0,w-5)*.012,damage:1+(w-1)*.042,speed:Math.min(1.3,.95+(w-1)*.011),cooldown:Math.max(.68,1-(w-1)*.011),count:Math.min(38,6+Math.floor((w-1)*.9)+Math.min(4,tier)),simultaneous:Math.min(14,8+tier),interval:Math.max(.65,1.4-(w-1)*.023)};}
  const MONSTERS={crawler:{name:'Goblin',size:[40,46,60],unlock:1},bat:{name:'Morcego',size:[38,32,40],unlock:2},caster:{name:'Feiticeiro',size:[34,56,66],unlock:3},spider:{name:'Aranha de seda',size:[52,30,48],unlock:4},stalker:{name:'Caçador',size:[40,46,72],unlock:4},brute:{name:'Bruto',size:[52,68,135],unlock:5},archer:{name:'Arqueiro condenado',size:[34,58,70],unlock:6},bulwark:{name:'Escudeiro',size:[48,76,135],unlock:7},wisp:{name:'Espectro elétrico',size:[30,35,42],unlock:8},hellhound:{name:'Cão de brasa',size:[62,40,90],unlock:9}};
  const RESERVES=[
        {id:'rest',name:'Fonte da vida',type:'Vida · repetível',family:'body',icon:'heart',art:'heart',max:Infinity,desc:'Recupera 40% da vida máxima.',apply:p=>p.hp=Math.min(p.maxHp,p.hp+p.maxHp*.4)},
        {id:'provisions',name:'Reserva do viajante',type:'Vida · repetível',family:'body',icon:'heart',art:'heart',max:Infinity,desc:'+15 de vida máxima; recupera 15 de vida.',apply:p=>{p.maxHp+=15;p.hp=Math.min(p.maxHp,p.hp+15);}},
        {id:'resolve',name:'Vontade infinita',type:'Arma · repetível',family:'weapon',icon:'sword',art:'edge',max:Infinity,desc:'+5% de dano base. Sem limite de acúmulo.',apply:p=>p.power+=.05}
      ];
  class Engine {
    constructor(){this.status='menu';this.events=[];this.enemies=[];this.projectiles=[];this.effects=[];this.hazards=[];this.fields=[];this.particles=[];this.time=0;this.stage=0;this.biome=0;this.width=2800;this.height=1480;this.camera=0;this.cameraY=0;this.player=this.newPlayer();this.platforms=[];this.owned={};this.spawnQueue=[];this.portals=[];this.shrines=[];this.relics=[];this.zones=[];this.decor=[];}
    newPlayer(difficulty='normal'){const hp=difficulty==='easy'?160:100;return {x:110,y:FLOOR-108,w:34,h:108,vx:0,vy:0,dir:1,hp,maxHp:hp,weapon:'blade',power:1,meleePower:1,haste:1,crit:.05,reach:1,pierce:0,fire:0,frost:0,lightning:0,poison:0,activeElement:'arcane',armor:0,vampire:0,regen:0,speed:1,dashRate:1,magicPower:1,magicRate:1,magicRange:245,jumps:0,ground:true,coyote:.1,jumpBuffer:0,attackCd:0,attackAnim:0,attackDuration:0,skillCd:0,castAnim:0,dashCd:0,dashTime:0,invuln:0,hurtAnim:0,landAnim:0,combo:0,comboWindow:0,swing:null,pendingSkill:null,dropTime:0,dropId:null,platformId:null,respawn:{x:110,y:FLOOR},runPhase:0,jumpPower:1,jumpAge:0,postDash:0,burn:0,shock:0,shockVisual:0,shockLock:0,bleed:0,echo:0,fury:0,shockwave:0,focus:0,aegis:0,terrainWard:0,specialTime:0,specialDuration:0,specialWindup:0,footstepTimer:0,snare:0,frostVisual:0,poisonVisual:0};}
    emit(type,data={}){this.events.push({type,...data});}
    start({mode='adventure',difficulty='normal',name='Andarilho',seed='cinzas'}={}){this.mode=mode;this.difficulty=difficulty;this.name=name;this.seed=seed;this.rng=random(seed);this.combatRng=random(seed+':combat');this.status='running';this.stage=0;this.time=0;this.kills=0;this.bosses=0;this.completedWaves=0;this.score=0;this.relicCount=0;this.player=this.newPlayer(difficulty);this.owned={};this.selectedCards=[];this.events=[];this.cards=[];this.draftCount=0;this.upgradeCount=0;this.rerolls=3;this.rerollCount=0;this.echoQueue=[];this.chosenHistory=[];this.loadStage();this.emit('start');}
    loadStage(){
      this.rng=random(this.seed+':map:'+this.stage);const chapter=Levels.CHAPTERS[Math.min(this.stage,Levels.CHAPTERS.length-1)];this.biome=this.mode==='horde'?Math.floor(this.stage/5)%3:chapter.biome;this.bossStage=this.mode==='horde'?(this.stage+1)%5===0:!!chapter.boss;
      const map=Levels.create({mode:this.mode,boss:this.bossStage,stage:this.stage,biome:this.biome,rng:this.rng});Object.assign(this,{width:map.width,height:map.height,platforms:map.platforms,zones:map.zones,shrines:map.shrines,relics:map.relics,decor:map.decor,checkpoint:{...map.checkpoint,active:false},chapter:map.chapter,weather:map.weather,background:map.background,tunnels:map.tunnels});
      this.enemies=[];this.projectiles=[];this.effects=[];this.hazards=[];this.fields=[];this.particles=[];this.portals=[];this.spawnQueue=[];this.cleared=false;this.hitStop=0;this.waveElapsed=0;this.spawnTimer=1.4;this.hazardTimer=5;this.waveRule=Levels.WAVE_RULES[this.stage%Levels.WAVE_RULES.length];this.hordeTuning=hordeTuning(this.stage+1);this.waveTotal=0;this.waveSpawned=0;this.echoQueue=[];this.skillPulses=[];
      const p=this.player;Object.assign(p,{x:map.spawn.x,y:map.spawn.y-p.h,vx:0,vy:0,jumps:0,ground:true,invuln:1.2,dashTime:0,swing:null,pendingSkill:null,specialTime:0,attackAnim:0,castAnim:0,dropTime:0,platformId:null,respawn:{...map.spawn}});this.camera=clamp(p.x-W*.38,0,this.width-W);this.cameraY=clamp(p.y-H*.52,0,this.height-H);
      if(this.bossStage)this.addEnemy('boss',this.width-620,this.groundY(this.width-620)-120);
      if(this.mode==='horde'){
        const count=this.bossStage?2+Math.min(5,Math.floor(this.stage/5)):this.hordeTuning.count;this.waveTotal=count+(this.bossStage?1:0);
        const available=Object.keys(MONSTERS).filter(type=>MONSTERS[type].unlock<=this.stage+1);
        for(let i=0;i<count;i++){
          let type=available[Math.floor(this.rng()*available.length)];if(this.stage===0)type='crawler';
          if(this.waveRule.id==='swarm'&&this.stage>=1&&i%2===0)type='bat';
          if(this.waveRule.id==='arcane'&&this.stage>=2&&i%3===0)type=this.stage>=7&&i%2===0?'wisp':'caster';
          this.spawnQueue.push({type,side:i%2,lane:(i+this.stage)%3,elite:this.stage>=6&&(i%7===0||this.waveRule.id==='elite'&&i%5===0)});
        }
      }else if(!this.bossStage){
        const count=18+this.stage*2;for(let i=0;i<count;i++){const x=480+i*(this.width-950)/(count-1)+this.rng()*60,type=i%11===9&&this.stage>=6?'bulwark':i%11===8&&this.stage>=5?'archer':i%11===6&&this.stage>=10?'hellhound':i%9===7&&this.stage>=2?'stalker':i%8===6&&this.stage>=1?'spider':i%7===5?'brute':i%4===3?'caster':i%3===1?'bat':'crawler';this.addEnemy(type,x,this.groundY(x)-48,{elite:this.stage>=3&&i%7===0});}
      }
      this.emit('stage',{biome:this.biome,boss:this.bossStage,rule:this.mode==='horde'?this.waveRule.name:null});
    }
    groundY(x){let best=null;for(const plat of this.platforms){if(plat.oneWay!==false||plat.ceiling||x<plat.x||x>plat.x+plat.w)continue;const y=Levels.surface(plat,x);if(best===null||y<best)best=y;}return best===null?this.checkpoint?.y||FLOOR:best;}
    surface(plat,x){return Levels.surface(plat,x);}
    environment(){const zone=this.zones.find(z=>this.player.x>=z.x&&this.player.x<z.x+z.w);return {background:zone?.background||this.background,tunnel:!!zone?.tunnel};}
    ceilingY(x){let bottom=0;for(const roof of this.platforms)if(roof.ceiling&&x>=roof.x&&x<=roof.x+roof.w)bottom=Math.max(bottom,this.surface(roof,x)+roof.h);return bottom;}
    zoneName(){return this.zones.find(z=>this.player.x>=z.x&&this.player.x<z.x+z.w)?.name||REGIONS[this.biome].name;}
    addEnemy(type,x,y,options={}){
      const waveScale=this.mode==='horde'?this.hordeTuning.hp:1+this.biome*.3+this.stage*.035;
      const base=type==='boss'?[76,136,780]:(MONSTERS[type]?.size||MONSTERS.crawler.size).slice();if(type==='boss'&&this.biome===1){base[0]=60;base[1]=112;}
      const elite=!!options.elite,scale=(this.mode==='horde'?this.hordeTuning.damage:waveScale)*(elite?1.15:1),hp=base[2]*waveScale*(elite?1.5:1)*(this.mode==='horde'?this.waveRule.hp:1)*(this.difficulty==='easy'?.8:1);
      const e={id:(this.enemyId||0)+1,type,x,y:['bat','wisp'].includes(type)?Math.max(70,this.groundY(x+base[0]/2)-220):this.groundY(x+base[0]/2)-base[1],w:base[0],h:base[1],hp,maxHp:hp,vx:0,vy:0,ground:false,dir:-1,cd:1.8+this.rng()*1.5,age:this.rng()*6,flash:0,burn:0,slow:0,venom:0,dead:false,phase:1,action:'idle',actionTime:0,actionCycle:0,scale,elite,jumpCd:this.rng()*2,platformId:null,shock:0,shockLock:0,hitReact:0,bleed:0,charred:0,burnTick:0,animTime:0,outOfBoundsRecoveries:0};
      if(options.platform){e.x=options.platform.x+options.platform.w*.5;e.y=this.surface(options.platform,e.x+e.w/2)-e.h;e.ground=true;e.platformId=options.platform.id;}
      this.enemyId=e.id;this.enemies.push(e);return e;
    }
    draftKind(){return this.upgradeCount===0?'weapon':this.upgradeCount===1?'element':'modifier';}
    draftLabel(){return DRAFT_LABELS[Math.min(this.upgradeCount,3)];}
    drawCards(previous=[]){
      const category=this.draftKind(),rng=random(this.seed+':cards:'+this.stage+':'+this.draftCount+':'+this.rerollCount);
      let pool=CARDS.filter(c=>c.category===category&&(this.owned[c.id]||0)<c.max&&(!c.requires||c.requires(this.player)));
      if(this.upgradeCount===2)pool=pool.filter(c=>['body','weapon','fire','frost','lightning','poison'].includes(c.family));
      const choices=[],fresh=pool.filter(c=>!previous.includes(c.id));
      if(previous.length&&fresh.length){const pick=fresh[Math.floor(rng()*fresh.length)];choices.push(pick);pool.splice(pool.indexOf(pick),1);}
      while(choices.length<3&&pool.length)choices.push(pool.splice(Math.floor(rng()*pool.length),1)[0]);
      for(const card of RESERVES)if(choices.length<3)choices.push(card);
      this.cards=choices;return choices;
    }
    offerCards(source='exit'){
      if(this.status==='upgrade')return this.cards;this.draftCount++;this.upgradeSource=source;this.status='upgrade';this.drawCards();this.emit('upgrade');return this.cards;
    }
    rerollCards(){
      if(this.status!=='upgrade'||this.rerolls<1)return false;const previous=this.cards.map(c=>c.id);this.rerolls--;this.rerollCount++;this.drawCards(previous);this.emit('rerolled');return true;
    }
    cardPreview(card){
      const p=this.player,next={...p};card.apply(next);const stats=[['maxHp','vida máxima',0],['power','dano base',100],['haste','velocidade de ataque',100],['crit','crítico',100],['armor','resistência',100],['fire','fogo',0],['frost','gelo',0],['lightning','raio',0],['poison','veneno',0],['echo','eco',0],['shockwave','onda sísmica',0],['speed','movimento',100],['magicPower','poder da habilidade',100]];
      if(next.weapon!==p.weapon)return WEAPONS[next.weapon].name;
      const changes=stats.filter(([key])=>next[key]!==p[key]).slice(0,2).map(([key,label,m])=>label+': '+Math.round(p[key]*(m||1))+(m?'%':'')+' → '+Math.round(next[key]*(m||1))+(m?'%':''));
      return changes.join(' · ')||'Efeito permanente na sua build';
    }
    chooseCard(index){
      if(this.status!=='upgrade'||!this.cards[index])return false;const card=this.cards[index],level=(this.owned[card.id]||0)+1;if(Number.isFinite(card.max)&&level>card.max)return false;
      card.apply(this.player);this.chosenHistory.push(card.id);if(!this.selectedCards.some(c=>c.id===card.id))this.selectedCards.push(card);this.owned[card.id]=level;this.upgradeCount++;this.player.hp=clamp(this.player.hp,0,this.player.maxHp);
      if(ELEMENT_IDS.includes(card.id)&&this.player.activeElement==='arcane')this.player.activeElement=card.id;
      this.status='running';if(this.upgradeSource==='exit'){this.stage++;this.rerolls+=this.bossStage?1:0;this.loadStage();}else{this.player.invuln=1;this.player.vx=0;this.player.swing=null;this.player.attackAnim=0;}
      this.emit('chosen',{card,level});return true;
    }
    shrineClear(shrine){return !this.enemies.some(e=>!e.dead&&Math.abs(e.x-shrine.x)<560&&Math.abs(e.y+e.h-shrine.y)<300);}
    interactable(){const p=this.player;if(this.cleared&&Math.abs(p.x+p.w/2-this.checkpoint.x)<100&&Math.abs(p.y+p.h-this.checkpoint.y)<115)return {type:'exit',...this.checkpoint};return this.shrines.find(s=>!s.used&&Math.abs(p.x+p.w/2-s.x)<95&&Math.abs(p.y+p.h-s.y)<115&&this.shrineClear(s))||null;}
    willDraftAtExit(){return this.mode!=='horde'||this.upgradeCount<3||this.bossStage||this.stage%2===0;}
    useCheckpoint(){
      if(this.status!=='running')return false;const target=this.interactable();if(!target)return false;
      if(target.type==='exit'){if(this.mode==='adventure'&&this.stage===Levels.CHAPTERS.length-1){this.end(true);return true;}this.player.hp=Math.min(this.player.maxHp,this.player.hp+this.player.maxHp*(this.mode==='horde'?0:this.bossStage?.15:.1));if(this.mode==='horde'&&!this.willDraftAtExit()){this.stage++;this.loadStage();}else this.offerCards('exit');}
      else{const shrine=this.shrines.find(s=>s.id===target.id);shrine.used=true;this.player.hp=Math.min(this.player.maxHp,this.player.hp+this.player.maxHp*.08);this.player.respawn={x:shrine.x,y:shrine.y};this.offerCards('shrine');}
      return true;
    }
    setElement(element){if(element==='arcane'||this.player[element]>0){this.player.activeElement=element;this.emit('element',{element});return true;}return false;}
    cycleElement(){const available=['arcane','fire','frost','lightning','poison'].filter(k=>k==='arcane'||this.player[k]>0),i=available.indexOf(this.player.activeElement);this.setElement(available[(i+1)%available.length]);}
    particlesAt(x,y,color,count=14,speed=170,kind='spark'){
      for(let i=0;i<count&&this.particles.length<600;i++){const a=this.combatRng()*Math.PI*2,v=speed*(.2+this.combatRng()*.8),life=.22+this.combatRng()*.5;this.particles.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v-25,t:life,max:life,color,size:1.2+this.combatRng()*2.7,kind});}
    }
    moveBody(b,dt){
      const oldCenter=b.x+b.w/2,oldX=b.x,oldHead=b.y,feet=b.y+b.h,wasGround=b.ground,oldVy=b.vy;
      b.x=clamp(b.x+b.vx*dt,4,this.width-b.w-4);let center=b.x+b.w/2;b.vy=Math.min(1050,b.vy+1550*dt);b.y+=b.vy*dt;b.ground=false;
      for(const roof of this.platforms){
        if(!roof.ceiling)continue;const roofY=this.surface(roof,center),bottom=roofY+roof.h;
        if(center>=roof.x&&center<=roof.x+roof.w&&oldHead>=bottom-2&&b.y<bottom&&b.vy<0){b.y=bottom+1;b.vy=0;if(b===this.player)this.emit('headbump');}
        if(b.y<bottom&&b.y+b.h>roofY){if(oldX+b.w<=roof.x&&b.x+b.w>roof.x){b.x=roof.x-b.w-1;b.vx=0;}else if(oldX>=roof.x+roof.w&&b.x<roof.x+roof.w){b.x=roof.x+roof.w+1;b.vx=0;}}
      }

      center=b.x+b.w/2;let support=null,top=Infinity;
      for(const plat of this.platforms){
        if(plat.disabled||center<plat.x||center>plat.x+plat.w)continue;
        if(b===this.player&&b.dropTime>0&&plat.id===b.dropId)continue;
        const y=this.surface(plat,b.x+b.w/2),oldSurface=this.surface(plat,oldCenter)-(plat.y-(plat.previousY??plat.y));
        const attached=wasGround&&b.platformId===plat.id&&oldVy>=0;
        const connectedSlope=wasGround&&oldVy>=0&&plat.oneWay===false&&Math.abs(feet-oldSurface)<Math.max(12,Math.abs(center-oldCenter)*2.5+5);
        const crossed=b.vy>=0&&feet<=oldSurface+3&&b.y+b.h>=y-2;
        const solidPenetration=plat.oneWay===false&&!plat.ceiling&&b.y+b.h>=y&&feet<=oldSurface+12;
        if((crossed||attached||connectedSlope||solidPenetration)&&y<top){support=plat;top=y;}
      }
      if(support){
        b.y=top-b.h;b.vy=0;b.ground=true;b.platformId=support.id;
        if(b===this.player&&!wasGround&&oldVy>240){b.landAnim=.2;this.particlesAt(center,top,'#bbc2ad',12,90,'dust');this.effects.push({type:'groundring',x:center,y:top,size:45,t:.25,max:.25,color:'#b6c4ac'});this.emit('land');}
        if(b===this.player&&support.oneWay===false&&support.effect!=='lava'&&Math.abs(b.vx)<310)b.respawn={x:b.x,y:top};
        if(b!==this.player)b.lastSafe={x:b.x,y:top};
      }else b.platformId=null;
      if(b.y>this.height+100){
        if(b===this.player){const safe=b.respawn||{x:110,y:this.groundY(110+b.w/2)};b.x=safe.x;b.y=safe.y-b.h;b.vy=0;b.vx=0;b.invuln=0;this.hurtPlayer(12,undefined,'physical');b.invuln=1.3;this.emit('fall');}
        else{b.outOfBoundsRecoveries++;const safe=b.lastSafe||{x:b.x,y:this.groundY(b.x+b.w/2)};b.x=clamp(safe.x,4,this.width-b.w-4);b.y=this.groundY(b.x+b.w/2)-b.h;b.vy=0;b.vx=0;b.ground=true;b.platformId=this.platforms.find(p=>p.oneWay===false&&b.x+b.w/2>=p.x&&b.x+b.w/2<=p.x+p.w)?.id;}
      }
    }
    damageVisual(body,kind,damage=0){
      const x=body.x+body.w/2,y=body.y+body.h*.48;
      if(kind==='physical'){
        body.bleed=.3;body.hitReact=Math.max(body.hitReact||0,.18);this.particlesAt(x,y,'#b42c38',damage>50?19:11,180,'blood');this.effects.push({type:'bloodcut',x,y,dir:this.player.dir,size:body.h*.8,t:.24,max:.24,color:'#d3414b'});
      }else if(kind==='fire'){
        body.burn=Math.max(body.burn||0,1.4);body.charred=Math.min(1,(body.charred||0)+.16);this.particlesAt(x,y,COLORS.fire,18,140,'ember');this.particlesAt(x,y,'#55443a',6,45,'smoke');
      }else if(kind==='frost'){body.frostVisual=1.4;if(body!==this.player)body.slow=Math.max(body.slow||0,2);this.particlesAt(x,y,COLORS.frost,18,155,'ice');
      }else if(kind==='poison'){body.poisonVisual=1.2;this.particlesAt(x,y,COLORS.poison,12,60,'smoke');
      }else if(kind==='arcane'){this.particlesAt(x,y,COLORS.arcane,9,130);
      }else if(kind==='lightning'){
        body.shockVisual=.55;if(body.type!=='boss'&&(body.shockLock||0)<=0){body.shock=.14;body.shockLock=.7;}
        this.effects.push({type:'electrocute',target:body,x,y,size:body.h,t:.4,max:.4,color:'#d7cbff'});this.particlesAt(x,y,COLORS.lightning,14,210);
      }
      if(['fire','frost','lightning','poison'].includes(kind))this.emit('status',{element:kind});
    }
    attack(){
      const p=this.player;if(this.status!=='running'||p.attackCd>0||p.swing||p.specialTime>0)return false;const w=WEAPONS[p.weapon];p.combo=p.comboWindow>0?(p.combo+1)%3:0;p.comboWindow=1.1;
      const duration=(p.weapon==='hammer'?.66:p.weapon==='bow'?.4:p.weapon==='staff'?.38:.42)/p.haste;p.attackDuration=duration;p.attackAnim=duration;p.attackCd=Math.max(duration,w.cooldown/p.haste);p.swing={weapon:p.weapon,t:0,duration,windup:duration*(p.weapon==='hammer'?.45:.36),hit:false,combo:p.combo,airborne:!p.ground,variant:p.combo%2};this.emit('attack',{weapon:p.weapon,combo:p.combo});return true;
    }
    resolveAttack(swing){
      const p=this.player,w=WEAPONS[swing.weapon],comboFactor=swing.weapon==='blade'?[1,1.12,1.45][swing.combo]:1;let damage=22*p.power*w.damage*comboFactor*(p.bloodrage&&p.hp/p.maxHp<.4?1.35:1)*(swing.combo===2||swing.airborne?1+p.fury*.25:1);if(swing.weapon==='blade'||swing.weapon==='hammer')damage*=p.meleePower;const critical=this.combatRng()<p.crit;if(critical)damage*=2;
      const color=this.elementColor(),x=p.x+p.w/2,y=p.y+p.h*.46;
      if(swing.weapon==='blade'||swing.weapon==='hammer'){
        if(p.shockwave&&p.ground)this.projectiles.push({x:x+p.dir*25,y:this.groundY(x)-22,vx:p.dir*420,vy:0,w:38,h:28,t:1.4,enemy:false,damage:18*p.shockwave*p.power,critical:false,pierce:50,hit:[],kind:'wave',damageKind:'physical',color:'#d4b78d',trail:[]});
        const range=w.range*p.reach+(swing.weapon==='blade'&&swing.combo===2?20:0),hitbox={x:p.dir===1?x:x-range,y:p.y-35,w:range,h:p.h+85};
        this.effects.push({type:'slash',x,y,dir:p.dir,size:range,t:.32,max:.32,heavy:swing.weapon==='hammer',combo:swing.combo,color});
        this.particlesAt(x+p.dir*range*.65,y,color,swing.weapon==='hammer'?25:12,180);
        for(const e of this.enemies)if(!e.dead&&overlap(hitbox,e)){this.damageEnemy(e,damage,critical,true,'physical');e.vx=p.dir*(e.type==='boss'?60:240);this.hitStop=Math.max(this.hitStop,swing.weapon==='hammer'?.065:.025);}
        if(swing.weapon==='hammer'){const gy=this.groundY(x);this.effects.push({type:'groundring',x:x+p.dir*35,y:gy,size:170,t:.48,max:.48,color});this.emit('shake',{amount:6});}
      }else{
        const origin=Rig.muzzle(p,swing.weapon,this.time),x=origin.x,y=origin.y;
        let target=null,best=w.range;for(const enemy of this.enemies){const dx=enemy.x+enemy.w/2-x;if(enemy.dead||Math.sign(dx)!==p.dir)continue;const d=Math.hypot(dx,enemy.y+enemy.h/2-y);if(d<best){target=enemy;best=d;}}
        const angle=target?Math.atan2(target.y+target.h/2-y,target.x+target.w/2-x):p.dir===1?0:Math.PI,speed=swing.weapon==='bow'?840:480;
        this.projectiles.push({x,y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,w:18,h:12,t:1.4*p.reach,enemy:false,damage,critical,homing:swing.weapon==='staff',pierce:p.pierce,hit:[],color,kind:swing.weapon,damageKind:swing.weapon==='bow'?'physical':'arcane',element:p.activeElement,trail:[]});this.particlesAt(x,y,color,8,90);this.emit('release',{weapon:swing.weapon,element:p.activeElement});
      }
    }
    skill(){
      const p=this.player;if(this.status!=='running'||p.skillCd>0||p.specialTime>0)return false;
      const element=p.activeElement!=='arcane'&&p[p.activeElement]>0?p.activeElement:'arcane',spec=SPECIALS[p.weapon];
      p.skillCd=spec.cooldown/p.magicRate;p.specialTime=spec.duration;p.specialDuration=spec.duration;p.specialWindup=spec.windup;p.castAnim=spec.duration;p.swing=null;p.attackAnim=0;
      p.pendingSkill={element,weapon:p.weapon,t:spec.windup};if(p.weapon==='hammer'&&!p.ground)p.vy=Math.max(650,p.vy);const origin=['bow','staff'].includes(p.weapon)?Rig.muzzle(p,p.weapon,this.time):{x:p.x+p.w/2,y:p.y+p.h-58};
      this.effects.push({type:'charge',element,weapon:p.weapon,x:origin.x,y:origin.y,follow:true,size:p.weapon==='bow'?34:50,t:spec.windup,max:spec.windup,color:COLORS[element]||COLORS.arcane});this.emit('cast',{element,weapon:p.weapon});return true;
    }
    aimFrom(origin,range=900){
      const p=this.player;let target=null,best=range;
      for(const enemy of this.enemies){const dx=enemy.x+enemy.w/2-origin.x;if(enemy.dead||Math.sign(dx)!==p.dir)continue;const d=Math.hypot(dx,enemy.y+enemy.h*.45-origin.y);if(d<best){target=enemy;best=d;}}
      return target?Math.atan2(target.y+target.h*.45-origin.y,target.x+target.w/2-origin.x):p.dir===1?0:Math.PI;
    }
    resolveSkill(element,weapon=this.player.weapon){
      const p=this.player,x=p.x+p.w/2,y=p.y+p.h-52,color=COLORS[element]||COLORS.arcane,damage=p.power*p.magicPower;
      if(weapon==='blade'){
        const radius=155+(p.magicRange-245)*.3;
        for(let i=0;i<3;i++)this.skillPulses.push({x,y,follow:true,t:i*.17,radius,damage:25*damage,element,weapon});
        this.effects.push({type:'spin',element,x,y,follow:true,size:radius,t:.62,max:.62,color});
      }else if(weapon==='hammer'){
        const gy=this.groundY(x),radius=225+(p.magicRange-245)*.35;
        this.effects.push({type:'quake',element,x,y:gy,size:radius,t:.85,max:.85,color});this.particlesAt(x,gy,color,50,300,'debris');
        for(const enemy of this.enemies)if(!enemy.dead&&Math.abs(enemy.x+enemy.w/2-x)<radius&&Math.abs(enemy.y+enemy.h-gy)<160){this.damageEnemy(enemy,85*damage,false,true,'physical',true,{unblockable:true});if(enemy.type!=='boss'){enemy.vy=-260;enemy.ground=false;}this.damageVisual(enemy,element);}
        for(const dir of [-1,1])this.projectiles.push({x,y:gy-22,vx:dir*430,vy:0,w:45,h:32,t:1.1,enemy:false,damage:26*damage,critical:false,pierce:40,hit:[],kind:'wave',damageKind:'physical',element,color,trail:[]});this.emit('shake',{amount:8});
      }else{
        const origin=Rig.muzzle(p,weapon,this.time),angle=this.aimFrom(origin),bow=weapon==='bow',speed=bow?1120:620;
        this.projectiles.push({x:origin.x,y:origin.y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,w:bow?32:42,h:bow?18:42,t:2.1+(bow?(p.magicRange-245)/1120:0),enemy:false,damage:(bow?118:82)*damage,critical:bow,pierce:bow?4+p.pierce:0,hit:[],kind:bow?'chargedArrow':'superOrb',damageKind:bow?'physical':element,element,color,explosion:!bow,radius:130+(p.magicRange-245)*.28,trail:[]});
        this.effects.push({type:'muzzle',x:origin.x,y:origin.y,size:bow?42:65,t:.3,max:.3,color});this.particlesAt(origin.x,origin.y,color,25,180);this.emit('release',{weapon,element,super:true});
      }
      this.emit('skill',{weapon,element,name:SPECIALS[weapon].name});return true;
    }
    explodeShot(shot){
      if(shot.exploded)return;shot.exploded=true;const color=shot.color||COLORS[shot.element];this.effects.push({type:'nova',element:shot.element,x:shot.x,y:shot.y,size:shot.radius||125,t:.7,max:.7,color});this.particlesAt(shot.x,shot.y,color,40,220,shot.element==='frost'?'ice':'spark');
      for(const enemy of this.enemies)if(!enemy.dead&&!shot.hit.includes(enemy.id)&&Math.hypot(enemy.x+enemy.w/2-shot.x,enemy.y+enemy.h*.5-shot.y)<shot.radius){this.damageEnemy(enemy,shot.damage*.55,false,true,shot.element,false);this.damageVisual(enemy,shot.element);}
      if(shot.element==='fire'||shot.element==='poison')this.fields.push({x:shot.x,y:shot.y,radius:95,t:2.5,max:2.5,damage:8,element:shot.element,color});
    }
    elementColor(){const p=this.player,k=p.activeElement!=='arcane'&&p[p.activeElement]>0?p.activeElement:p.lightning?'lightning':p.fire?'fire':p.frost?'frost':p.poison?'poison':'arcane';return COLORS[k]||'#b9e4d4';}
    damageEnemy(e,damage,critical=false,element=true,kind='physical',echo=true,meta={}){
      if(e.dead)return;const p=this.player;const blocked=e.type==='bulwark'&&kind==='physical'&&!meta.unblockable&&!['windup','attack'].includes(e.action)&&Math.sign(p.x-e.x)===e.dir;if(blocked){damage*=.42;this.effects.push({type:'block',x:e.x+e.w/2,y:e.y+e.h*.4,size:45,t:.3,max:.3,color:'#f4dca0'});this.particlesAt(e.x+e.w/2,e.y+e.h*.4,'#f1d39c',12,160);kind='metal';}if(p.shatter&&e.slow>0)damage*=1.3;e.hp-=damage;e.flash=.1;this.damageVisual(e,kind,damage);if(echo&&p.echo&&kind!=='echo')this.echoQueue.push({target:e,damage:damage*.28*p.echo,t:.18});this.effects.push({type:'text',x:e.x+e.w/2,y:e.y-8,text:Math.ceil(damage),critical,color:critical?'#ffd99b':'#deece1',t:.65,max:.65});this.particlesAt(e.x+e.w/2,e.y+e.h*.5,this.elementColor(),critical?16:7,160);this.emit('impact',{critical,kind,weapon:meta.weapon||p.weapon});
      if(element){if(p.fire){e.burn=3;this.damageVisual(e,'fire');}if(p.frost){e.slow=2;this.damageVisual(e,'frost');}if(p.poison){e.venom=5;this.damageVisual(e,'poison');}
        if(p.lightning){this.damageVisual(e,'lightning');let previous=e;const used=[e.id];for(let n=0;n<p.lightning;n++){let best=null,dist=240*(p.storm?1.5:1);for(const other of this.enemies){if(other.dead||used.includes(other.id))continue;const d=Math.hypot(other.x-previous.x,other.y-previous.y);if(d<dist){best=other;dist=d;}}if(!best)break;this.effects.push({type:'bolt',x:previous.x+previous.w/2,y:previous.y+previous.h/2,x2:best.x+best.w/2,y2:best.y+best.h/2,t:.26,max:.26,color:COLORS.lightning});used.push(best.id);this.damageEnemy(best,damage*(p.storm?.6:.35),false,false,'lightning',false);previous=best;}}
      }
      if(e.hp<=0)this.killEnemy(e);
    }
    killEnemy(e){
      if(e.dead)return;e.dead=true;this.kills++;this.score+=e.type==='boss'?700:e.elite?120:40;const p=this.player;p.hp=Math.min(p.maxHp,p.hp+p.vampire+(e.elite?4:0));p.skillCd=Math.max(0,p.skillCd-p.focus*.4);this.particlesAt(e.x+e.w/2,e.y+e.h/2,e.burn?COLORS.fire:REGIONS[this.biome].accent,e.type==='boss'?70:22,e.type==='boss'?320:180);
      this.effects.push({type:'burst',x:e.x+e.w/2,y:e.y+e.h/2,size:e.type==='boss'?160:65,t:.75,max:.75,color:e.burn?COLORS.fire:REGIONS[this.biome].accent});if(e.type==='boss'){this.bosses++;this.rerolls++;this.emit('bosskill');this.emit('shake',{amount:12});}this.emit('kill',{boss:e.type==='boss',elite:e.elite});
      if(p.inferno&&e.burn>0){this.effects.push({type:'nova',element:'fire',x:e.x+e.w/2,y:e.y+e.h/2,size:125,t:.4,max:.4,color:COLORS.fire});for(const other of this.enemies)if(!other.dead&&Math.hypot(other.x-e.x,other.y-e.y)<125)this.damageEnemy(other,24,false,false,'fire',false);}
    }
    hurtPlayer(damage,sourceX,kind='physical'){const p=this.player;if(p.invuln>0||p.dashTime>0||this.status!=='running')return false;const factor=this.difficulty==='easy'?.7:this.difficulty==='hard'?1.45:1;p.hp=Math.max(0,p.hp-damage*factor*(1-p.armor)*(p.postDash>0?1-p.aegis*.15:1));p.invuln=.8;p.hurtAnim=.28;this.damageVisual(p,kind,damage);if(sourceX!==undefined)p.vx=Math.sign(p.x-sourceX)*210;this.particlesAt(p.x+p.w/2,p.y+p.h*.5,'#e4b092',15,150);this.emit('hurt',{kind,damage});if(kind==='web')p.snare=1.8;this.emit('shake',{amount:5});if(p.hp<=0)this.end(false);return true;}
    shootEnemy(e,angle,speed=250,damage=12,kind='orb'){this.projectiles.push({x:e.x+e.w/2,y:e.y+e.h*.4,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,w:14,h:14,t:5,enemy:true,damage:damage*e.scale,color:this.biome===2?'#f39e6c':'#cf9ea5',kind,damageKind:kind==='web'?'web':kind==='fireball'?'fire':this.biome===1?'lightning':'arcane',trail:[]});}
    mobAI(e,dt){
      if(['archer','bulwark','spider','hellhound','wisp'].includes(e.type)){this.extraMobAI(e,dt);return;}
      const p=this.player,dx=p.x+p.w/2-e.x-e.w/2,dy=p.y-e.y,abs=Math.abs(dx);
      if(abs>32&&e.action!=='attack')e.dir=Math.sign(dx);e.cd-=dt;e.jumpCd-=dt;e.actionTime-=dt;
      const slow=e.slow>0?Math.max(.35,.65-p.frost*.06):1,speed=(this.mode==='horde'?this.waveRule.speed*this.hordeTuning.speed:1)*(e.elite?1.15:1);
      if(e.shock>0){e.vx=approach(e.vx,0,1800*dt);if(!['bat','wisp'].includes(e.type))this.moveBody(e,dt);return;}
      if(e.type==='bat'){
        if(e.action==='windup'){e.vx=0;e.vy=-30;if(e.actionTime<=0){e.action='attack';e.actionTime=.5;e.diveX=p.x+p.w/2;e.diveY=p.y+p.h*.4;e.attackDir=e.dir;}}
        else if(e.action==='attack'){const angle=Math.atan2(e.diveY-e.y,e.diveX-e.x);e.vx=Math.cos(angle)*310*slow;e.vy=Math.sin(angle)*310*slow;if(e.actionTime<=0){e.action='recover';e.actionTime=.65;e.cd=2.3;}}
        else if(e.action==='recover'){e.vx=e.dir*60;e.vy=-120;if(e.actionTime<=0)e.action='idle';}
        else{e.vx=(abs>100?e.dir*100:0)*slow*speed;e.vy=clamp(p.y-100-e.y,-115,115)*slow+Math.sin(e.age*5)*26;if(e.cd<=0&&abs<450){e.action='windup';e.actionTime=.38;}}
        e.x=clamp(e.x+e.vx*dt,4,this.width-e.w-4);e.y=clamp(e.y+e.vy*dt,Math.max(30,this.ceilingY(e.x+e.w/2)+12),Math.max(40,this.groundY(e.x+e.w/2)-e.h-16));return;
      }
      const target=e.type==='caster'?(abs>360?e.dir*65:abs<180?-e.dir*55:0):e.dir*(e.type==='brute'?66:e.type==='stalker'?135:98)*slow*speed;
      if(e.action==='windup'){
        e.vx=approach(e.vx,0,1600*dt);
        if(e.actionTime<=0){e.action='attack';e.animTime=0;e.actionTime=e.type==='brute'?.32:e.type==='caster'?.38:.24;e.attackDir=e.dir;e.attackHit=false;}
      }else if(e.action==='attack'){
        if(e.type==='crawler'||e.type==='stalker')e.vx=e.attackDir*(e.type==='stalker'?380:240)*slow;else e.vx=0;
        if(!e.attackHit&&e.animTime>.055){
          e.attackHit=true;
          if(e.type==='caster'){
            const angle=Math.atan2(p.y+p.h/2-e.y-e.h*.5,p.x+p.w/2-e.x-e.w/2);e.actionCycle++;
            for(let i=-1;i<=1;i++)if(e.elite||e.actionCycle%2===0||i===0)this.shootEnemy(e,angle+i*.14,240,e.elite?10:9);
            this.effects.push({type:'sigil',x:e.x+e.w*.5,y:e.y+e.h*.35,size:40,t:.4,max:.4,color:'#bca0f4'});this.emit('enemyshot');
          }else{
            const range=e.type==='brute'?155:95,box={x:e.attackDir>0?e.x:e.x-range+e.w,y:e.y-15,w:range,h:e.h+50};
            this.effects.push({type:'slash',x:e.x+e.w/2,y:e.y+e.h*.4,dir:e.attackDir,size:range,t:.27,max:.27,combo:e.type==='brute'?2:0,color:e.type==='brute'?'#ddb788':'#b7c89e'});
            if(overlap(p,box))this.hurtPlayer((e.type==='brute'?19:e.type==='stalker'?14:11)*e.scale,e.x,'physical');
            if(e.type==='brute'){const gy=this.groundY(e.x+e.w/2);this.effects.push({type:'groundring',x:e.x+e.w/2,y:gy,size:160,t:.4,max:.4,color:'#d6b59a'});if(e.elite)for(const dir of [-1,1])this.projectiles.push({x:e.x+e.w/2,y:gy-20,vx:dir*220,vy:0,w:25,h:22,t:2.1,enemy:true,damage:11*e.scale,damageKind:'physical',kind:'wave',color:'#c8b893',trail:[]});}
          }
        }
        if(e.actionTime<=0){e.action='recover';e.animTime=0;e.actionTime=e.type==='brute'?.65:.3;e.cd=e.type==='caster'?(e.elite?1.2:2):e.type==='brute'?2:1.5;}
      }else if(e.action==='recover'){
        e.vx=approach(e.vx,0,700*dt);if(e.actionTime<=0)e.action='idle';
      }else{
        e.vx=approach(e.vx,target,e.hitReact>0?140*dt:620*dt);
        if(e.cd<=0&&abs<(e.type==='caster'?820:e.type==='brute'?175:e.type==='stalker'?260:140)&&Math.abs(dy)<190){e.action='windup';e.animTime=0;e.actionTime=e.type==='brute'?.65:e.type==='caster'?.6:.34;this.emit('telegraph',{action:e.type});}
        if(e.ground&&e.jumpCd<=0&&abs<500&&p.y<e.y-70){e.vy=-530;e.ground=false;e.jumpCd=2;}
      }
      this.moveBody(e,dt);
    }
    enemyMuzzle(e){const size=e.h*2.1;return {x:e.x+e.w/2+e.dir*(e.type==='archer'?.24:.27)*size,y:e.y+e.h-size*(e.type==='archer'?.34:.39)};}
    extraMobAI(e,dt){
      const p=this.player,dx=p.x+p.w/2-e.x-e.w/2,dy=p.y-e.y,d=Math.abs(dx);if(d>30&&e.action!=='attack')e.dir=Math.sign(dx);e.cd-=dt;e.actionTime-=dt;e.jumpCd-=dt;
      const slow=e.slow>0?.52:1,speed=(this.mode==='horde'?this.hordeTuning.speed:1)*slow;
      if(e.shock>0){e.vx=0;if(e.type!=='wisp')this.moveBody(e,dt);return;}
      const flying=e.type==='wisp',ranged=['archer','spider'].includes(e.type),range=e.type==='archer'?760:e.type==='spider'?560:flying?270:e.type==='hellhound'?280:160;
      if(e.action==='windup'){
        e.vx=approach(e.vx,0,1500*dt);if(e.actionTime<=0){e.action='attack';e.animTime=0;e.attackHit=false;e.actionTime=flying?.35:e.type==='hellhound'?.5:.3;e.attackDir=e.dir;if(e.type==='hellhound'){e.vy=-230;e.ground=false;}}
      }else if(e.action==='attack'){
        e.vx=e.type==='hellhound'?e.attackDir*370*speed:0;
        if(!e.attackHit&&e.animTime>.055){e.attackHit=true;
          if(e.type==='archer'){
            const origin=this.enemyMuzzle(e),angle=Math.atan2(p.y+p.h*.45-origin.y,p.x+p.w/2-origin.x);for(let i=-1;i<=1;i++)if(e.elite||i===0)this.projectiles.push({x:origin.x,y:origin.y,vx:Math.cos(angle+i*.09)*490,vy:Math.sin(angle+i*.09)*490,w:20,h:8,t:3,enemy:true,damage:12*e.scale,damageKind:'physical',kind:'enemyArrow',color:'#dbba88',trail:[]});this.emit('enemyshot');
          }else if(e.type==='spider'){
            const angle=Math.atan2(p.y+p.h*.5-e.y-e.h*.3,p.x-e.x);this.shootEnemy(e,angle,220,6,'web');
          }else if(flying){
            const x=e.x+e.w/2,y=e.y+e.h*.5;this.effects.push({type:'nova',element:'lightning',x,y,size:165,t:.6,max:.6,color:COLORS.lightning});if(Math.hypot(p.x+p.w/2-x,p.y+p.h*.5-y)<165)this.hurtPlayer(13*e.scale,e.x,'lightning');
          }else if(e.type==='bulwark'){
            const box={x:e.dir>0?e.x:e.x-120+e.w,y:e.y-10,w:120,h:e.h+30};this.effects.push({type:'slash',x:e.x+e.w/2,y:e.y+e.h*.4,dir:e.dir,size:110,t:.3,max:.3,color:'#d4bc87'});if(overlap(p,box))this.hurtPlayer(18*e.scale,e.x);
          }
        }
        if(e.type==='hellhound'&&Math.floor(e.animTime*12)!==e.trailTick){e.trailTick=Math.floor(e.animTime*12);this.fields.push({x:e.x+e.w/2,y:this.groundY(e.x+e.w/2)-10,radius:38,t:1.4,max:1.4,damage:8*e.scale,enemy:true,element:'fire',color:COLORS.fire});}
        if(e.actionTime<=0){e.action='recover';e.actionTime=.45;e.cd=(flying?2.5:ranged?2.25:e.type==='hellhound'?2.2:2)*(this.mode==='horde'?this.hordeTuning.cooldown:1);}
      }else if(e.action==='recover'){e.vx=approach(e.vx,0,700*dt);if(e.actionTime<=0)e.action='idle';}
      else{
        const target=ranged?(d>330?e.dir*70:d<170?-e.dir*55:0):flying?(d>130?e.dir*80:0):e.dir*(e.type==='hellhound'?125:58);
        e.vx=approach(e.vx,target*speed,550*dt);if(e.cd<=0&&d<range&&Math.abs(dy)<250){e.action='windup';e.animTime=0;e.actionTime=e.type==='bulwark'?.55:e.type==='archer'?.65:e.type==='spider'?.5:.58;this.emit('telegraph',{action:e.type});}
        if(!flying&&e.ground&&e.jumpCd<=0&&d<500&&p.y<e.y-95){e.vy=-500;e.ground=false;e.jumpCd=2;}
      }
      if(flying){e.x=clamp(e.x+e.vx*dt,4,this.width-e.w-4);const target=p.y-70;const vy=e.action==='idle'?clamp(target-e.y,-90,90)+Math.sin(e.age*4)*20:0;e.y=clamp(e.y+vy*dt,Math.max(35,this.ceilingY(e.x+e.w/2)+12),Math.max(40,this.groundY(e.x+e.w/2)-e.h-20));}
      else this.moveBody(e,dt);
    }
    bossAI(e,dt){
      const p=this.player;e.phase=e.hp/e.maxHp<.5?2:1;e.cd-=dt;e.actionTime-=dt;if(Math.abs(p.x-e.x)>40)e.dir=Math.sign(p.x-e.x)||e.dir;
      if(e.action==='charge'&&e.actionTime>0){e.vx=e.chargeDir*(e.phase===2?620:490);if(e.x<40||e.x>this.width-e.w-40)e.actionTime=0;}
      else if(e.action==='windup'&&e.actionTime<=0){
        if(e.nextAction==='charge'){e.action='charge';e.animTime=0;e.actionTime=.9;e.chargeDir=e.dir;e.vx=e.chargeDir*520;this.emit('bossattack');}
        else if(e.nextAction==='slam'){e.action='leap';e.animTime=0;e.actionTime=.85;e.vy=-610;e.vx=e.dir*140;this.emit('bossattack');}
        else{e.action='recover';e.animTime=0;e.actionTime=.38;e.cd=e.phase===2?1.25:2.1;const gy=this.groundY(e.x+e.w/2);
          if(e.nextAction==='roots'){for(const dir of [-1,1])this.projectiles.push({x:e.x+e.w/2,y:gy-22,vx:dir*300,vy:0,w:30,h:22,t:5,enemy:true,damage:16*e.scale,color:REGIONS[this.biome].accent,kind:'wave',trail:[]});if(this.enemies.filter(x=>!x.dead).length<5)this.addEnemy('crawler',clamp(e.x+e.dir*125,100,this.width-100),gy-46);}
          if(e.nextAction==='shots'){const a=Math.atan2(p.y+p.h/2-e.y-e.h*.4,p.x+p.w/2-e.x-e.w/2);for(let i=-1;i<=1;i++)this.shootEnemy(e,a+i*.22,260+e.phase*30,13);}
          if(e.nextAction==='crystals')for(let i=0;i<3+e.phase;i++){const x=clamp(p.x+(i-1)*145,80,this.width-80);this.hazards.push({x,y:this.groundY(x),t:.9,max:.9,age:0,damage:17*e.scale,active:false});}
          if(e.nextAction==='fan')for(let i=0;i<7;i++)this.shootEnemy(e,-Math.PI+.18+i*(Math.PI-.36)/6,245+e.phase*30,14,'fireball');
        }
      }else if(e.action==='leap'){if(e.ground&&e.actionTime<.3){e.action='idle';e.cd=1.6;const y=this.groundY(e.x);for(const dir of [-1,1])this.projectiles.push({x:e.x+e.w/2,y:y-25,vx:dir*340,vy:0,w:35,h:25,t:4,enemy:true,damage:20*e.scale,color:'#f9a568',kind:'wave',trail:[]});this.effects.push({type:'groundring',x:e.x+e.w/2,y,size:240,t:.6,max:.6,color:'#ffbe70'});this.particlesAt(e.x+e.w/2,y,'#ffbe70',40,280);this.emit('shake',{amount:8});}}
      else if(e.action==='charge'&&e.actionTime<=0){e.action='idle';e.cd=1.4;}
      else if(e.action==='recover'){e.vx=approach(e.vx,0,600*dt);if(e.actionTime<=0){e.action='idle';e.animTime=0;}}
      else if(e.action==='idle'){const speed=this.biome===0?45:this.biome===1?80:60;e.vx=approach(e.vx,Math.abs(p.x-e.x)>200?e.dir*speed:0,400*dt);if(e.cd<=0){e.actionCycle++;e.action='windup';e.animTime=0;e.actionTime=e.phase===2?.6:.9;e.vx=0;const cycle=e.actionCycle%3;e.nextAction=this.biome===0?(cycle===1?'shots':'roots'):this.biome===1?(cycle===1?'shots':'crystals'):cycle===0?'fan':cycle===1?'charge':'slam';if(this.biome===1&&cycle===2){this.effects.push({type:'sigil',element:'lightning',x:e.x+e.w/2,y:e.y+e.h/2,size:120,t:.7,max:.7,color:COLORS.lightning});}this.emit('telegraph',{action:e.nextAction});}}
      if(e.slow>0)e.vx*=.75;this.moveBody(e,dt);
    }
    spawnHorde(dt){
      if(this.spawnQueue.length&&this.enemies.filter(e=>!e.dead).length<this.hordeTuning.simultaneous){this.spawnTimer-=dt;if(this.spawnTimer<=0){const spawn=this.spawnQueue.shift(),x=spawn.side?this.width-110:70;let platform=null;if(spawn.lane&&['caster','archer'].includes(spawn.type)){const elevated=this.platforms.filter(p=>p.oneWay&&!p.moving);platform=elevated[spawn.side?elevated.length-1:0];}this.portals.push({...spawn,x:platform?platform.x+platform.w*.5:x,y:platform?platform.y:this.groundY(x),platform,t:.9});this.spawnTimer=this.hordeTuning.interval;}}
      for(const portal of this.portals){portal.t-=dt;if(portal.t<=0){this.addEnemy(portal.type,portal.x,portal.y,{elite:portal.elite,platform:portal.platform});this.waveSpawned++;this.emit('spawn');}}this.portals=this.portals.filter(p=>p.t>0);
      if(this.waveRule.id==='storm'&&!this.cleared){this.hazardTimer-=dt;if(this.hazardTimer<=0){const x=clamp(this.player.x+80,80,this.width-80);this.hazards.push({x,y:this.groundY(x),t:1.2,max:1.2,age:0,damage:10+this.stage,active:false});this.hazardTimer=5;}}
    }
    update(dt,input={}){
      if(this.status!=='running')return;dt=clamp(dt,0,1/30);this.time+=dt;this.waveElapsed+=dt;const p=this.player;if(this.hitStop>0){this.hitStop=Math.max(0,this.hitStop-dt);return;}
      for(const key of ['attackCd','attackAnim','skillCd','castAnim','dashCd','dashTime','invuln','hurtAnim','landAnim','comboWindow','dropTime','postDash','burn','shock','shockVisual','shockLock','bleed','specialTime','snare','frostVisual','poisonVisual','footstepTimer'])p[key]=Math.max(0,p[key]-dt);
      for(const platform of this.platforms)if(platform.moving){platform.previousY=platform.y;platform.y=platform.baseY+Math.sin(this.time*platform.speed+platform.phase)*platform.amplitude;const dy=platform.y-platform.previousY;if(p.ground&&p.platformId===platform.id)p.y+=dy;for(const enemy of this.enemies)if(enemy.ground&&enemy.platformId===platform.id)enemy.y+=dy;}
      if(p.regen)p.hp=Math.min(p.maxHp,p.hp+p.regen*dt);const axis=(input.right?1:0)-(input.left?1:0);if(axis)p.dir=axis;
      if(input.element)this.cycleElement();if(input.jump)p.jumpBuffer=.12;else p.jumpBuffer=Math.max(0,p.jumpBuffer-dt);
      const support=this.platforms.find(plat=>plat.id===p.platformId);p.terrain=p.ground?support?.effect||'normal':'normal';if(input.down&&input.jump&&p.ground&&support?.oneWay){p.dropTime=.3;p.dropId=support.id;p.y+=8;p.vy=90;p.ground=false;p.coyote=0;p.jumpBuffer=0;p.jumps=1;}
      if(p.jumpBuffer>0&&(p.ground||p.coyote>0||p.jumps<2)){p.vy=-540*p.jumpPower*(p.terrain==='spring'?1.22:1);p.jumpAge=0;if(!p.ground&&p.coyote<=0)p.jumps++;else p.jumps=1;p.ground=false;p.coyote=0;p.jumpBuffer=0;this.particlesAt(p.x+p.w/2,p.y+p.h,'#adc8bb',p.jumps===2?16:8,80,'dust');this.emit('jump');}
      if(input.dash&&p.dashCd<=0){p.dashTime=.21;p.postDash=2;p.dashCd=1.3/p.dashRate;p.invuln=Math.max(p.invuln,.25);p.vy=0;this.particlesAt(p.x,p.y+p.h*.5,this.elementColor(),12,90);this.emit('dash');}
      if(p.dashTime>0){p.vx=p.dir*790;p.vy=0;if(Math.floor(this.time*60)%2===0)this.effects.push({type:'ghost',x:p.x,y:p.y,dir:p.dir,t:.3,max:.3,color:this.elementColor()});}
      else{const moveFactor=p.specialTime>0?(p.weapon==='bow'?.48:.64):p.castAnim>0?.7:p.swing?.weapon==='hammer'?.52:p.swing?.weapon==='blade'?.78:1;const terrainFactor=p.terrain==='mud'?.64:p.terrain==='water'?.78:1,acceleration=p.terrain==='ice'?(axis?510:180):2200;p.vx=approach(p.vx,axis*300*p.speed*moveFactor*terrainFactor*(p.snare>0?.58:1),dt*acceleration);if(p.terrain==='wind')p.vx+=Math.sin(this.time*.7+this.stage)*210*dt;if(p.terrain==='conveyor')p.vx+=125*dt;}
      p.jumpAge+=dt;p.runPhase+=Math.abs(p.vx)*dt/46;this.moveBody(p,dt);if(p.ground){p.jumps=0;p.coyote=.09;}else p.coyote=Math.max(0,p.coyote-dt);
      if(p.ground&&Math.abs(p.vx)>90&&p.footstepTimer<=0){p.footstepTimer=.2;const wet=['water','mud'].includes(p.terrain);this.particlesAt(p.x+p.w/2,p.y+p.h,wet?'#8cbac7':'#a9a794',wet?5:3,wet?90:45,wet?'splash':'dust');this.emit('step',{terrain:p.terrain,kind:support?.kind});}
      if(p.pendingSkill){p.pendingSkill.t-=dt;if(p.pendingSkill.weapon==='hammer'&&p.pendingSkill.t<=0&&!p.ground)p.specialTime=Math.max(p.specialTime,.35);if(p.pendingSkill.t<=0&&(p.pendingSkill.weapon!=='hammer'||p.ground)){const {element,weapon}=p.pendingSkill;p.pendingSkill=null;this.resolveSkill(element,weapon);}}
      if(p.swing){p.swing.t+=dt;if(!p.swing.hit&&p.swing.t>=p.swing.windup){p.swing.hit=true;this.resolveAttack(p.swing);}if(p.swing.t>=p.swing.duration)p.swing=null;}
      if(input.attack)this.attack();if(input.skill)this.skill();if(input.interact)this.useCheckpoint();if(this.status!=='running')return;
      for(const relic of this.relics)if(!relic.taken&&Math.hypot(p.x+p.w/2-relic.x,p.y+p.h/2-relic.y)<58){relic.taken=true;this.relicCount++;if(this.relicCount%3===0)this.rerolls++;this.score+=200;this.particlesAt(relic.x,relic.y,'#ffe6a1',28,160);this.emit('relic');}
      if(p.terrain==='lava'&&p.terrainWard<1)this.hurtPlayer(9*(1-p.terrainWard),undefined,'fire');
      if(this.mode==='horde')this.spawnHorde(dt);
      for(const pulse of this.skillPulses){pulse.t-=dt;if(pulse.t<=0){const x=p.x+p.w/2,y=p.y+p.h-52;for(const enemy of this.enemies)if(!enemy.dead&&Math.hypot(enemy.x+enemy.w/2-x,enemy.y+enemy.h*.5-y)<pulse.radius){this.damageEnemy(enemy,pulse.damage,false,true,'physical',true,{unblockable:true});this.damageVisual(enemy,pulse.element);}}}this.skillPulses=this.skillPulses.filter(pulse=>pulse.t>0);
      for(const echo of this.echoQueue){echo.t-=dt;if(echo.t<=0&&!echo.target.dead){this.damageEnemy(echo.target,echo.damage,false,false,'echo',false);this.effects.push({type:'slash',x:echo.target.x,y:echo.target.y+echo.target.h/2,dir:1,size:65,t:.2,max:.2,color:'#adc9ed'});}}this.echoQueue=this.echoQueue.filter(q=>q.t>0);
      for(const e of this.enemies){
        if(e.dead)continue;e.age+=dt;e.animTime+=dt;e.hitReact=Math.max(0,e.hitReact-dt);e.bleed=Math.max(0,e.bleed-dt);e.shock=Math.max(0,e.shock-dt);e.shockLock=Math.max(0,e.shockLock-dt);e.shockVisual=Math.max(0,(e.shockVisual||0)-dt);e.frostVisual=Math.max(0,(e.frostVisual||0)-dt);e.poisonVisual=Math.max(0,(e.poisonVisual||0)-dt);e.flash=Math.max(0,e.flash-dt);e.slow=Math.max(0,e.slow-dt);if(e.burn>0){e.burn-=dt;e.hp-=6*Math.max(1,p.fire)*dt;e.charred=Math.min(1,e.charred+dt*.08);e.burnTick-=dt;if(e.burnTick<=0){this.particlesAt(e.x+e.w*.5,e.y+e.h*.6,'#f69949',3,50,'ember');e.burnTick=.11;}}if(e.venom>0){e.venom-=dt;e.hp-=4*p.poison*(p.plague?2:1)*dt;}if(e.hp<=0){this.killEnemy(e);continue;}
        if(this.mode==='adventure'&&e.type!=='boss'&&Math.abs(e.x-p.x)>1150)continue;
        if(e.type==='boss')this.bossAI(e,dt);else this.mobAI(e,dt);
        if(overlap(p,e))this.hurtPlayer(e.type==='boss'?20*e.scale:10*e.scale,e.x);
      }
      for(const shot of this.projectiles){shot.t-=dt;if(shot.t<=0)continue;
        if(shot.homing&&!shot.enemy){let target=null,best=500;for(const e of this.enemies){if(e.dead||shot.hit.includes(e.id))continue;const d=Math.hypot(e.x-shot.x,e.y-shot.y);if(d<best){best=d;target=e;}}if(target){const a=Math.atan2(target.y+target.h/2-shot.y,target.x+target.w/2-shot.x);shot.vx=approach(shot.vx,Math.cos(a)*480,dt*1400);shot.vy=approach(shot.vy,Math.sin(a)*480,dt*1400);}}
        if(!shot.enemy&&shot.element&&shot.element!=='arcane'){shot.fxClock=(shot.fxClock||0)-dt;if(shot.fxClock<=0){shot.fxClock=.07;this.particlesAt(shot.x,shot.y,shot.color,shot.kind==='superOrb'?3:1,40,shot.element==='frost'?'ice':shot.element==='fire'?'ember':shot.element==='poison'?'smoke':'spark');}}
        if(shot.kind==='wave')shot.y=this.groundY(shot.x)-22;shot.trail=shot.trail||[];shot.trail.unshift({x:shot.x,y:shot.y});if(shot.trail.length>7)shot.trail.pop();const oldShotX=shot.x,oldShotY=shot.y;shot.x+=shot.vx*dt;shot.y+=shot.vy*dt;
        if(shot.kind!=='wave')for(const solid of this.platforms){if(solid.oneWay!==false||shot.x<solid.x||shot.x>solid.x+solid.w)continue;const top=this.surface(solid,shot.x);const collision=solid.ceiling?shot.y>=top&&shot.y<=top+solid.h:shot.y>top+2&&oldShotY<=this.surface(solid,oldShotX)+4;if(collision){if(shot.explosion)this.explodeShot(shot);this.particlesAt(shot.x,shot.y,shot.color,10,120,shot.element==='frost'?'ice':'spark');shot.t=0;break;}}
        if(shot.t<=0)continue;

        if(shot.enemy){if(overlap({x:shot.x-shot.w/2,y:shot.y-shot.h/2,w:shot.w,h:shot.h},p)){this.hurtPlayer(shot.damage,shot.x,shot.damageKind||'arcane');shot.t=0;this.particlesAt(shot.x,shot.y,shot.color,12,120);}}
        else for(const e of this.enemies){if(e.dead||shot.hit.includes(e.id))continue;if(overlap({x:shot.x-shot.w/2,y:shot.y-shot.h/2,w:shot.w,h:shot.h},e)){shot.hit.push(e.id);this.damageEnemy(e,shot.damage,shot.critical,true,shot.damageKind||'physical',true,{weapon:shot.kind==='chargedArrow'?'bow':shot.kind});this.damageVisual(e,shot.element||'arcane');if(shot.explosion)this.explodeShot(shot);if(shot.pierce<=0){shot.t=0;break;}shot.pierce--;}}
        if(shot.x<0||shot.x>this.width||shot.y<0||shot.y>this.height+50)shot.t=0;
      }
      for(const field of this.fields){field.t-=dt;if(field.enemy){if(Math.hypot(p.x+p.w/2-field.x,p.y+p.h-10-field.y)<field.radius)this.hurtPlayer(field.damage,field.x,field.element);continue;}for(const enemy of this.enemies)if(!enemy.dead&&Math.hypot(enemy.x+enemy.w/2-field.x,enemy.y+enemy.h/2-field.y)<field.radius){enemy.hp-=field.damage*p.magicPower*dt;if(field.element==='fire')enemy.burn=Math.max(enemy.burn,.3);if(field.element==='poison')enemy.venom=Math.max(enemy.venom,.15);if(enemy.hp<=0)this.killEnemy(enemy);}}
      this.fields=this.fields.filter(f=>f.t>0);
      for(const h of this.hazards){h.age+=dt;h.t-=dt;if(!h.active&&h.t<=0){h.active=true;h.t=.6;this.emit('shake',{amount:3});this.particlesAt(h.x,h.y-20,COLORS.lightning,18,200);}if(h.active&&Math.abs(p.x+p.w/2-h.x)<35&&p.y+p.h>h.y-125&&p.y<h.y)this.hurtPlayer(h.damage,h.x,'lightning');}
      this.hazards=this.hazards.filter(h=>h.t>0||!h.active);this.projectiles=this.projectiles.filter(s=>s.t>0);for(const effect of this.effects)effect.t-=dt;this.effects=this.effects.filter(e=>e.t>0);for(const particle of this.particles){particle.t-=dt;particle.x+=particle.vx*dt;particle.y+=particle.vy*dt;particle.vy+=(particle.kind==='dust'?40:particle.kind==='smoke'?-50:particle.kind==='ember'?-90:particle.kind==='blood'?650:270)*dt;particle.vx*=.985;if(particle.kind==='blood'&&particle.y>=this.groundY(particle.x)){particle.y=this.groundY(particle.x)-1;particle.kind='bloodstain';particle.vx=0;particle.vy=0;particle.t=4;particle.max=4;}if(particle.kind==='bloodstain')particle.vy=0;}this.particles=this.particles.filter(p=>p.t>0);
      this.enemies=this.enemies.filter(e=>!e.dead);if(!this.cleared&&!this.enemies.length&&!this.spawnQueue.length&&!this.portals.length&&this.status==='running'){this.cleared=true;this.checkpoint.active=true;if(this.mode==='horde'){this.completedWaves=this.stage+1;this.score+=200+Math.max(0,Math.round(200-this.waveElapsed*2));p.hp=Math.min(p.maxHp,p.hp+p.maxHp*(this.bossStage?.08:.04));}this.emit('clear');}
      this.camera=clamp(approach(this.camera,p.x-W*.38,dt*1100),0,Math.max(0,this.width-W));this.cameraY=clamp(approach(this.cameraY,p.y-H*.53,dt*600),0,Math.max(0,this.height-H));
    }
    createCheckpoint(){
      if(this.mode!=='horde')return null;const phase=this.status==='upgrade'?'draft':this.cleared?'cleared':'entry';
      return {format:'cinzas-horde',edition:'0.5',version:1,phase,name:this.name,difficulty:this.difficulty,seed:this.seed,stage:this.stage,completedWaves:this.completedWaves,time:this.time,kills:this.kills,bosses:this.bosses,score:this.score,hp:this.player.hp,history:this.chosenHistory.slice(),activeElement:this.player.activeElement,rerolls:this.rerolls,rerollCount:this.rerollCount,draftCount:this.draftCount,cards:phase==='draft'?this.cards.map(c=>c.id):[],upgradeSource:phase==='draft'?this.upgradeSource:null};
    }
    restoreCheckpoint(data){
      try{
        const validNumber=(v,max)=>Number.isFinite(v)&&v>=0&&v<=max;
        if(!data||data.format!=='cinzas-horde'||data.edition!=='0.5'||data.version!==1||!['entry','cleared','draft'].includes(data.phase))return false;
        if(!Number.isInteger(data.stage)||data.stage<0||data.stage>9999||!['easy','normal','hard'].includes(data.difficulty)||typeof data.name!=='string'||data.name.length>20||typeof data.seed!=='string'||data.seed.length>64)return false;
        if(!Array.isArray(data.history)||data.history.length>1000||!validNumber(data.hp,20000)||data.hp<=0||!validNumber(data.kills,1e7)||!validNumber(data.time,1e8)||!validNumber(data.score,1e10)||!validNumber(data.bosses,10000))return false;
        const finished=data.phase==='cleared'||data.phase==='draft'&&data.upgradeSource==='exit';
        if(data.completedWaves!==data.stage+(finished?1:0))return false;
        const probe=new Engine();probe.start({mode:'horde',difficulty:data.difficulty,name:data.name,seed:data.seed});
        for(const id of data.history){const card=[...CARDS,...RESERVES].find(c=>c.id===id);if(!card||(probe.owned[id]||0)>=card.max)return false;card.apply(probe.player);probe.owned[id]=(probe.owned[id]||0)+1;probe.chosenHistory.push(id);if(!probe.selectedCards.some(c=>c.id===id))probe.selectedCards.push(card);}
        if(data.hp>probe.player.maxHp+.001)return false;
        for(const key of ['rerolls','rerollCount','draftCount'])if(!Number.isInteger(data[key])||!validNumber(data[key],10000))return false;
        Object.assign(probe,{stage:data.stage,completedWaves:data.completedWaves,time:data.time,kills:data.kills,bosses:data.bosses,score:data.score,rerolls:data.rerolls,rerollCount:data.rerollCount,draftCount:data.draftCount,upgradeCount:data.history.length});probe.player.hp=data.hp;
        if(data.activeElement==='arcane'||ELEMENT_IDS.includes(data.activeElement)&&probe.player[data.activeElement]>0)probe.player.activeElement=data.activeElement;else return false;
        probe.events=[];probe.loadStage();
        if(finished){probe.enemies=[];probe.spawnQueue=[];probe.portals=[];probe.cleared=true;probe.checkpoint.active=true;probe.player.x=probe.checkpoint.x-17;probe.player.y=probe.checkpoint.y-probe.player.h;}
        if(data.phase==='draft'){
          if(!['start','exit'].includes(data.upgradeSource)||!Array.isArray(data.cards)||data.cards.length!==3||new Set(data.cards).size!==3)return false;
          probe.cards=data.cards.map(id=>[...CARDS,...RESERVES].find(c=>c.id===id));if(probe.cards.some(c=>!c||(probe.owned[c.id]||0)>=c.max||c.requires&&!c.requires(probe.player)))return false;
          const category=probe.draftKind();if(probe.cards.some(c=>c.category&&c.category!==category))return false;
          probe.upgradeSource=data.upgradeSource;probe.status='upgrade';probe.emit('upgrade');
        }
        Object.assign(this,probe);this.emit('resumed');return true;
      }catch{return false;}
    }
    end(won=false){if(this.status==='ended')return;this.status='ended';this.won=won;this.emit('end',{won});}
  }
  return { Engine, CARDS, MONSTERS, hordeTuning, SPECIALS, Rig, CHAPTERS:Levels.CHAPTERS, TERRAIN:Levels.TERRAIN, DRAFT_LABELS, WEAPONS, REGIONS, COLORS, W, H, FLOOR, random, hash, clamp, overlap };
});
