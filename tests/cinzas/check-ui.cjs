// Runtime smoke checks with a minimal DOM/canvas double. This is not browser QA.
const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const html=fs.readFileSync('../../public/roguelite/index.html','utf8');
const elements=[];
function match(el,selector){if(selector.startsWith('.'))return el.classList.contains(selector.slice(1));const m=selector.match(/^\[data-([\w-]+)\]$/);return m?Object.hasOwn(el.dataset,m[1].replace(/-([a-z])/g,(_,x)=>x.toUpperCase())):el.tagName.toLowerCase()===selector;}
function parse(source){const result=[];for(const match of source.matchAll(/<([a-z][a-z\d]*)\b([^>]*)>/gi)){const el=new Element(match[1]);for(const attr of match[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g)){const k=attr[1],v=attr[2]||'';if(k==='id')el.id=v;if(k==='class')v.split(' ').forEach(c=>el.classList.add(c));if(k.startsWith('data-'))el.dataset[k.slice(5).replace(/-([a-z])/g,(_,x)=>x.toUpperCase())]=v;if(k==='value')el.value=v;if(k==='type')el.type=v;if(k==='hidden')el.hidden=true;}result.push(el);}return result;}
class Element{
  constructor(tag){this.tagName=tag.toUpperCase();this.style={};this.dataset={};this.hidden=false;this.open=false;this.value='';this.checked=false;this.listeners={};this.children=[];this.textContent='';this.id='';const classes=new Set();this.classList={add:(...s)=>s.forEach(x=>classes.add(x)),remove:(...s)=>s.forEach(x=>classes.delete(x)),contains:s=>classes.has(s),toggle:(s,on)=>{const value=on===undefined?!classes.has(s):on;value?classes.add(s):classes.delete(s);return value;}};}
  set innerHTML(v){this._html=v;this.children=parse(v);}get innerHTML(){return this._html||'';}
  querySelectorAll(s){return this.children.filter(el=>s.split(',').some(sel=>match(el,sel.trim())));}
  querySelector(s){return this.querySelectorAll(s)[0];}
  addEventListener(type,cb){(this.listeners[type]||=[]).push(cb);}
  fire(type,e={}){for(const cb of this.listeners[type]||[])cb(e);}
  setAttribute(){}focus(){document.activeElement=this;}
  click(){this.onclick?.({preventDefault(){}});}
  showModal(){this.open=true;}close(){this.open=false;this.fire('close');}
  setPointerCapture(){}requestFullscreen(){return Promise.resolve();}
  getContext(){const gradient={addColorStop(){}};return new Proxy({createLinearGradient:()=>gradient,createRadialGradient:()=>gradient},{get:(t,k)=>k in t?t[k]:()=>{},set:(t,k,v)=>(t[k]=v,true)});}
}
elements.push(...parse(html));
const ids=new Map(elements.filter(el=>el.id).map(el=>[el.id,el]));
const closeButtons=elements.filter(el=>Object.hasOwn(el.dataset,'close'));
for(const id of ['helpDialog','codexDialog','controllerDialog'])ids.get(id).children=closeButtons;
ids.get('difficulty').value='normal';
const document={getElementById:id=>ids.get(id)||null,createElement:tag=>new Element(tag),querySelectorAll:s=>elements.filter(el=>match(el,s)),querySelector:s=>elements.find(el=>match(el,s)),activeElement:new Element('body'),addEventListener(){},exitFullscreen:()=>Promise.resolve()};
const winListeners={},window={confirm:()=>true,matchMedia:()=>({matches:false}),addEventListener:(type,cb)=>(winListeners[type]||=[]).push(cb),scrollTo(){}};
let nextFrame;
let pads=[];
class MockImage{constructor(){this.width=1774;this.height=887;}set src(v){assert(fs.existsSync('../../public/roguelite/'+v),'Missing texture '+v);this.onload?.();}}
const memory=process.env.CINZAS_CORRUPT_TEST?{'cinzas-demo-v1':'{invalid original campaign'}:{};
const context=vm.createContext({console,document,window,navigator:{getGamepads:()=>pads},Image:MockImage,localStorage:{getItem:k=>memory[k]||null,setItem:(k,v)=>memory[k]=v},requestAnimationFrame:cb=>nextFrame=cb,setTimeout:cb=>cb(),Math,Date});
vm.runInContext(fs.readFileSync('../../public/roguelite/levels.js','utf8'),context);
vm.runInContext(fs.readFileSync('../../public/roguelite/rig.js','utf8'),context);
vm.runInContext(fs.readFileSync('../../public/roguelite/audio.js','utf8'),context);
vm.runInContext(fs.readFileSync('../../public/roguelite/persistence.js','utf8'),context);
vm.runInContext(fs.readFileSync('../../public/roguelite/core.js','utf8'),context);
vm.runInContext(fs.readFileSync('../../public/roguelite/controller.js','utf8'),context);
vm.runInContext(fs.readFileSync('../../public/roguelite/renderer.js','utf8'),context);
let captured;
const Original=context.Abyss.Engine;
context.Abyss.Engine=class extends Original{constructor(){super();if(!captured)captured=this;}};
vm.runInContext(fs.readFileSync('../../public/roguelite/game.js','utf8'),context);
assert.equal(captured.status,'menu');
ids.get('inputMode').value='playstation';ids.get('inputMode').onchange();assert.equal(ids.get('dashKey').textContent,'○');assert.equal(ids.get('padHelp').hidden,false);assert(ids.get('mappingButtons').innerHTML.includes('R1'));ids.get('inputMode').value='auto';ids.get('inputMode').onchange();
if(process.env.CINZAS_TERMINAL_FRAME_TEST)elements.find(element=>element.dataset.mode==='horde').onclick();
ids.get('startBtn').onclick();
assert.equal(captured.status,'upgrade');assert.equal(ids.get('hud').hidden,false);assert(captured.cards.every(c=>c.category==='weapon'));ids.get('upgradeCards').querySelectorAll('button')[0].onclick();assert.equal(captured.stage,0);assert.equal(captured.status,'running');
if(process.env.CINZAS_TERMINAL_FRAME_TEST){
 nextFrame(1000);captured.enemies=[];captured.spawnQueue=[];captured.portals=[];captured.fields=[];captured.hazards=[];captured.spawnTimer=999;
 const p=captured.player;p.x=400;p.y=captured.groundY(417)-p.h;p.hp=1;p.invuln=0;p.vampire=1;p.weapon='bow';
 const attacker=captured.addEnemy('crawler',400);attacker.cd=999;
 const victim=captured.addEnemy('crawler',600);victim.hp=1;victim.cd=999;
 captured.projectiles=[{x:victim.x+victim.w/2,y:victim.y+victim.h/2,vx:0,vy:0,w:18,h:12,t:1,enemy:false,damage:100,critical:false,pierce:0,hit:[],kind:'bow',damageKind:'physical',color:'#d1b7de',trail:[]}];
 nextFrame(1017);
 assert.equal(captured.status,'ended');assert.equal(p.hp,0,'The real frame must not restore health after defeat');
 assert.equal(ids.get('endScreen').hidden,false);assert.match(ids.get('endStats').innerHTML,/<strong>0<\/strong><span>ABATES<\/span>/);
 const profile=JSON.parse(memory['cinzas-demo-v1']);const record=profile.scores.find(row=>row.seed===captured.seed);
 assert(record);assert.equal(record.score,0);assert.equal(record.kills,0);assert(!profile.hordeSave,'The defeated checkpoint cannot be offered as a living attempt');
 console.log('PASS the real frame presents and stores one terminal result without post-defeat kills, points or lifesteal.');process.exit(0);
}
if(process.env.CINZAS_CONDUCTOR_TEST){
 captured.stage=24;captured.loadStage();captured.enemies=[];captured.spawnQueue=[{}];const object=captured.breakables[0],p=captured.player;
 Object.assign(p,{weapon:'hammer',power:5,crit:0,invuln:100,x:object.x-p.w-24,y:object.y+object.h-p.h,platformId:object.platformId,ground:true,dir:1});
 nextFrame(1000);for(const type of ['keydown','keyup'])for(const callback of winListeners[type]||[])callback({code:'KeyJ',key:'j',repeat:false,preventDefault(){}});
 for(let frame=1;frame<80;frame++)nextFrame(1000+frame*16);
 assert(object.broken,'The actual DOM attack must break the conductor');assert(ids.get('toast').textContent.includes('Eclipse contido'),'The interface must explain the tactical result');
 assert(!ids.get('toast').textContent.includes('renovação'),'A tactical switch must not advertise nonexistent loot');
 assert.equal(captured.rerolls,3);assert.equal(captured.score,0);
 console.log('PASS the conductor breaks through real keyboard events and reports environmental suppression without false loot.');process.exit(0);
}
if(process.env.CINZAS_ATTACK_EDGE_TEST){
 const send=(type)=>{for(const callback of winListeners[type]||[])callback({code:'KeyJ',key:'j',repeat:false,preventDefault(){}});};
 captured.enemies=[];captured.spawnQueue=[{}];captured.player.weapon='blade';nextFrame(1000);
 send('keydown');send('keyup');nextFrame(1016);
 assert(captured.player.swing,'A complete short attack tap between rendered frames must start its attack');
 for(let frame=2;frame<80;frame++)nextFrame(1000+frame*16);
 assert.equal(captured.player.swing,null);assert.equal(captured.player.attackCd,0,'The consumed tap cannot become a held attack');
 captured.player.haste=20;captured.player.combo=2;captured.player.comboWindow=0;
 send('keydown');send('keyup');nextFrame(2364);
 assert.equal(captured.player.combo,0,'A short tap is consumed only by the first substep of a slow frame');
 ids.get('pauseBtn').onclick();send('keydown');send('keyup');ids.get('resumeBtn').onclick();nextFrame(2380);
 assert.equal(captured.player.swing,null);assert.equal(captured.player.attackCd,0,'Attacks typed during pause cannot leak into resumed combat');
 captured.player.haste=1;
 const mouse=ids.get('game');mouse.fire('pointerdown',{pointerType:'mouse',button:0,preventDefault(){}});for(const callback of winListeners.pointerup||[])callback({});nextFrame(2396);
 assert(captured.player.swing,'A full mouse click between frames must also start an attack');
 captured.player.swing=null;captured.player.attackCd=0;
 const touch=elements.find(element=>element.dataset.key==='attack');touch.fire('pointerdown',{pointerId:7,preventDefault(){}});touch.fire('pointerup',{preventDefault(){}});nextFrame(2412);
 assert(captured.player.swing,'A quick touch button tap must survive release before the frame');
 captured.player.swing=null;captured.player.attackCd=0;
 send('keydown');send('keyup');for(const callback of winListeners.blur||[])callback({});ids.get('resumeBtn').onclick();nextFrame(2428);
 assert.equal(captured.player.swing,null,'Leaving the window discards an unconsumed attack edge');
 console.log('PASS a short attack tap survives key release, runs once across slow-frame substeps and respects pause.');process.exit(0);
}
if(process.env.CINZAS_PRACTICE_TEST){
 const original=JSON.parse(memory['cinzas-demo-v1']);
 original.legacy={version:1,cleared:15,weapon:'bow'};
 memory['cinzas-demo-v1']=JSON.stringify(original);
 ids.get('suspendBtn').onclick();
 ids.get('dailySeed').checked=true;
 ids.get('practiceRegion').value='3';ids.get('practiceBtn').onclick();
 assert.equal(captured.stage,15);assert.equal(captured.practiceRegion,3);
 assert.match(captured.seed,/^treino-3-dia-\d{4}-\d{2}-\d{2}$/,'Region practice respects the selected daily seed');
 assert.equal(captured.createCheckpoint(),null);assert(ids.get('suspendBtn').hidden);
 assert(ids.get('modeLabel').textContent.includes('TREINO'));
 ids.get('upgradeCards').querySelectorAll('button')[0].onclick();
 captured.enemies=[];captured.spawnQueue=[];captured.portals=[];nextFrame(16);nextFrame(32);
 captured.end(false);nextFrame(48);
 assert(ids.get('endTitle').textContent.includes('Treino'));
 assert.deepEqual(JSON.parse(memory['cinzas-demo-v1']),original,'A region practice cannot change earned progress or either checkpoint');
 ids.get('menuBtn').onclick();ids.get('continueCampaign').onclick();
 assert.equal(captured.seed,original.campaignSave.seed);assert.equal(captured.practiceRegion,null);
 assert(!ids.get('suspendBtn').hidden,'The regular campaign keeps its suspend action');
 console.log('PASS region practice is unlocked through legacy, has its own session, and preserves campaign continuation.');
 process.exit(0);
}
if(process.env.CINZAS_TERMINAL_TEST){
 nextFrame(16);
 const write=context.localStorage.setItem;
 const before=JSON.parse(memory['cinzas-demo-v1']);
 const ownSeed=captured.seed;
 context.localStorage.setItem=()=>{throw Error('quota')};
 captured.enemies=[];captured.spawnQueue=[];captured.portals=[];nextFrame(32);
 captured.end(false);nextFrame(48);ids.get('menuBtn').onclick();
 context.localStorage.setItem=write;ids.get('soundBtn').onclick();
 assert(!JSON.parse(memory['cinzas-demo-v1']).campaignSave,'A terminal attempt cannot be written later when quota recovers');
 assert(ids.get('continueCampaign').hidden,'An ended local attempt cannot be resumed');
 ids.get('startBtn').onclick();ids.get('upgradeCards').querySelectorAll('button')[0].onclick();nextFrame(64);
 context.localStorage.setItem=()=>{throw Error('quota')};
 captured.enemies=[];captured.spawnQueue=[];captured.portals=[];nextFrame(80);
 const other={...before,campaignSave:{...before.campaignSave,seed:ownSeed+'-other'}};
 memory['cinzas-demo-v1']=JSON.stringify(other);
 captured.end(false);nextFrame(96);ids.get('menuBtn').onclick();
 context.localStorage.setItem=write;ids.get('soundBtn').onclick();
 assert.equal(JSON.parse(memory['cinzas-demo-v1']).campaignSave.seed,other.campaignSave.seed,'A terminal attempt preserves the checkpoint from another tab');
 ids.get('continueCampaign').onclick();
 assert.equal(captured.seed,other.campaignSave.seed,'Continue restores the other live attempt, never the ended pending one');
 console.log('PASS terminal attempts clear quota-pending checkpoints while preserving a newer attempt from another tab.');
 process.exit(0);
}
if(process.env.CINZAS_IMPORT_ACTIVE_TEST){
 (async()=>{
  nextFrame(16);
  const imported=new Original();imported.start({seed:'backup-importado'});
  const data=context.AbyssPersistence.backup([],null,imported.createCheckpoint());
  ids.get('saveFile').files=[{size:100,text:async()=>data}];
  await ids.get('saveFile').onchange();
  assert.equal(JSON.parse(memory['cinzas-demo-v1']).campaignSave.seed,'backup-importado');
  captured.enemies=[];captured.spawnQueue=[];captured.portals=[];nextFrame(32);
  assert.equal(JSON.parse(memory['cinzas-demo-v1']).campaignSave.seed,'backup-importado','An active attempt cannot overwrite a newly imported checkpoint at its next milestone');
  console.log('PASS a backup imported during an active attempt remains protected from later milestones.');
  process.exit(0);
 })().catch(error=>{console.error(error);process.exit(1)});
}else if(process.env.CINZAS_CORRUPT_TEST){
 assert.equal(memory['cinzas-demo-v1'],'{invalid original campaign','Settings and a new session cannot overwrite an unreadable original');
 assert(ids.get('saveNote').textContent.includes('ilegível'));
 ids.get('suspendBtn').onclick();
 assert.equal(ids.get('continueCampaign').hidden,false,'The unsaved new session remains available in memory');
 // The menu resets the attract engine; export the pending session through Continue.
 ids.get('continueCampaign').onclick();
 const recovered=context.AbyssPersistence.backup([],null,captured.createCheckpoint());
 ids.get('saveFile').files=[{size:100,text:async()=>recovered}];
 ids.get('saveFile').onchange().then(()=>{
  assert.equal(memory['cinzas-demo-v1.invalid.bak'],'{invalid original campaign','Explicit import archives the exact unreadable original');
  assert.equal(JSON.parse(memory['cinzas-demo-v1']).campaignSave.seed,captured.seed);
  console.log('PASS unreadable storage is preserved, its new session remains available, and explicit import archives the original bytes.');
  process.exit(0);
 }).catch(error=>{console.error(error);process.exit(1)});
}else{
if(process.env.CINZAS_SUBSTEP_TEST){
 captured.stage=19;captured.loadStage();nextFrame(1000);
 captured.spawnQueue=[];captured.enemies=[];captured.portals=[];
 captured.player.hp=1;captured.player.invuln=0;
 captured.hazards=[{x:captured.player.x+captured.player.w/2,y:captured.player.y+captured.player.h,t:.05,max:.05,age:0,damage:100,active:false}];
 nextFrame(1132);
 assert.equal(captured.status,'ended');
 assert.equal(JSON.parse(memory['cinzas-demo-v1']).legacy.cleared,20,'Clearing then dying during one slow frame preserves the completed regional milestone');
 console.log('PASS a slow frame preserves the earned regional milestone before a later lethal substep.');
 process.exit(0);
}
for(let i=0;i<100;i++)nextFrame(16.666*i);
const beforeSlowFrame=captured.time;
nextFrame(1766.6);
assert(captured.time-beforeSlowFrame>.10,'A 116 ms presentation frame advances the simulation by more than 100 ms');
ids.get('pauseBtn').onclick();assert.equal(captured.status,'paused');
ids.get('resumeBtn').onclick();assert.equal(captured.status,'running');
ids.get('helpBtn').onclick();assert.equal(captured.status,'paused');assert(ids.get('helpDialog').open);
ids.get('helpDialog').close();assert.equal(captured.status,'running');
captured.spawnQueue=[];captured.enemies.forEach(e=>captured.damageEnemy(e,1e6,false,false));
nextFrame(2000);captured.player.x=captured.checkpoint.x-14;captured.player.y=captured.checkpoint.y-captured.player.h;captured.useCheckpoint();nextFrame(2016);
assert.equal(captured.status,'upgrade');assert.equal(ids.get('upgradeScreen').hidden,false);assert(captured.cards.every(c=>c.category==='element'));const tokens=captured.rerolls;ids.get('rerollBtn').onclick();assert.equal(captured.rerolls,tokens-1);assert(captured.cards.every(c=>c.category==='element'));assert(!ids.get('upgradeCards').innerHTML.includes('0/0'));
const choice=ids.get('upgradeCards').querySelectorAll('button')[0];assert(choice);choice.onclick();
assert.equal(captured.stage,1);assert.equal(ids.get('upgradeScreen').hidden,true);
for(let biome=0;biome<5;biome++){captured.stage=biome*5+4;captured.loadStage();for(let i=0;i<150;i++)nextFrame(2200+biome*3000+i*16.666);}
captured.end(false);nextFrame(13000);assert.equal(ids.get('endScreen').hidden,false);
ids.get('menuBtn').onclick();assert.equal(captured.status,'menu');
document.querySelectorAll('.modecard').find(el=>el.dataset.mode==='horde').onclick();
ids.get('startBtn').onclick();assert.equal(captured.mode,'horde');
captured.end(false);nextFrame(13016);assert(ids.get('scores').innerHTML.includes('Andarilho'));
for(const asset of ['core.js','game.js','style.css','icon.svg'])assert(fs.existsSync('../../public/roguelite/'+asset));
// Connect a simulated standard controller to the actual UI/game frame loop.
const pad={index:0,id:'Xbox test fixture',connected:true,mapping:'standard',axes:[0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))};
pads=[pad];nextFrame(14000);assert(ids.get('controllerStatus').textContent.includes('Xbox test'));
ids.get('retryBtn').onclick();ids.get('upgradeCards').querySelectorAll('button')[0].onclick();captured.enemies=[];captured.spawnQueue=[{}];
const beforeX=captured.player.x;pad.axes[0]=.8;for(let i=0;i<15;i++)nextFrame(14016+i*16.666);assert(captured.player.x>beforeX);
pad.axes[0]=0;pad.buttons[0].pressed=true;nextFrame(14300);assert(captured.player.vy<0);const jumps=captured.player.jumps;nextFrame(14316);assert.equal(captured.player.jumps,jumps);
pad.buttons[0].pressed=false;pad.buttons[9].pressed=true;nextFrame(14332);assert.equal(captured.status,'paused');
pad.buttons[9].pressed=false;nextFrame(14348);pad.buttons[0].pressed=true;nextFrame(14364);assert.equal(captured.status,'running');
pad.buttons[0].pressed=false;nextFrame(14380);pads=[];nextFrame(14396);assert.equal(captured.status,'paused','Unplugging active controller pauses the run');
ids.get('resumeBtn').onclick();pads=[pad];nextFrame(14412);
captured.spawnQueue=[];captured.enemies=[];captured.cleared=true;captured.completedWaves=captured.stage+1;captured.player.x=captured.checkpoint.x-14;captured.player.y=captured.checkpoint.y-captured.player.h;captured.useCheckpoint();nextFrame(14428);
assert.equal(captured.status,'upgrade');pad.axes[0]=.9;nextFrame(14444);pad.axes[0]=0;nextFrame(14460);pad.buttons[0].pressed=true;nextFrame(14476);assert.equal(captured.status,'running');
ids.get('controllerBtn').onclick();assert(ids.get('controllerDialog').open);pad.buttons[0].pressed=false;nextFrame(14492);pad.buttons[1].pressed=true;nextFrame(14508);assert.equal(ids.get('controllerDialog').open,false);assert.equal(captured.status,'running');
ids.get('quality').value='ultra';ids.get('quality').onchange();assert.equal(ids.get('game').width,2560);
// Repeated upgrade: real stats and every visible level/count agree.
captured.status='running';captured.offerCards('shrine');captured.cards=[context.Abyss.CARDS.find(c=>c.id==='vitality')];captured.chooseCard(0);const basePower=captured.player.power;for(let n=0;n<2;n++){captured.offerCards('shrine');captured.cards=[context.Abyss.CARDS.find(c=>c.id==='power'),context.Abyss.CARDS.find(c=>c.id==='vitality'),context.Abyss.CARDS.find(c=>c.id==='armor')];nextFrame(15000+n*100);assert(ids.get('upgradeCards').innerHTML.includes('NÍVEL '+n+' → '+(n+1)+' / 5'));ids.get('upgradeCards').querySelectorAll('button')[0].onclick();}assert.equal(captured.owned.power,2);assert(Math.abs(captured.player.power-basePower-.44)<1e-8);assert(ids.get('buildLabel').textContent.includes('5 melhorias'));assert.equal(ids.get('ownedCount').textContent,Object.values(captured.owned).reduce((a,b)=>a+b,0));
// Save survives returning to menu and restores the initial wave checkpoint.
ids.get('suspendBtn').onclick();assert.equal(captured.status,'menu');assert.equal(ids.get('continueHorde').hidden,false);const saved=JSON.parse(memory['cinzas-demo-v1']).hordeSave;assert(saved);ids.get('continueHorde').onclick();assert.equal(captured.mode,'horde');assert.equal(captured.stage,saved.stage);assert.equal(captured.upgradeCount,saved.history.length);
console.log('PASS UI boot, animation across all biomes, start/pause/dialog/upgrade/end flows and horde record wiring.');
console.log('PASS controller UI movement/jump/pause/resume, unplug safety, card choice, close settings and Ultra resolution.');

(async()=>{
 ids.get('suspendBtn').onclick();
 elements.find(el=>el.dataset.mode==='adventure').onclick();
 ids.get('startBtn').onclick();ids.get('upgradeCards').querySelectorAll('button')[0].onclick();
 const checkpoint=JSON.parse(memory['cinzas-demo-v1']).campaignSave;
 assert(checkpoint&&checkpoint.format==='cinzas-campaign');
 const savedHorde=JSON.stringify(JSON.parse(memory['cinzas-demo-v1']).hordeSave);
 captured.player.hp=12;captured.kills=7;
 ids.get('suspendBtn').onclick();assert.equal(captured.status,'menu');
 assert.equal(ids.get('continueCampaign').hidden,false);assert.equal(ids.get('continueHorde').hidden,false);
 assert(ids.get('saveNote').textContent.includes('Ações posteriores'));
 ids.get('continueCampaign').onclick();assert.equal(captured.mode,'adventure');
 assert.equal(captured.player.hp,checkpoint.hp);assert.equal(captured.kills,checkpoint.kills);
 ids.get('suspendBtn').onclick();
 const before=memory['cinzas-demo-v1'];window.confirm=()=>{throw Error('Native dialogs must not be required by the embedded game');};
 ids.get('startBtn').focus();ids.get('startBtn').onclick();assert(ids.get('replaceDialog').open);assert.equal(document.activeElement,ids.get('replaceCancel'));assert.equal(captured.status,'menu');assert.equal(memory['cinzas-demo-v1'],before);
 ids.get('replaceCancel').onclick();assert.equal(ids.get('replaceDialog').open,false);assert.equal(document.activeElement,ids.get('startBtn'));assert.equal(memory['cinzas-demo-v1'],before);
 pad.buttons[0].pressed=false;pad.buttons[1].pressed=false;pads=[pad];nextFrame(16000);
 ids.get('startBtn').onclick();nextFrame(16016);assert.equal(document.activeElement,ids.get('replaceCancel'));
 pad.buttons[0].pressed=true;nextFrame(16032);assert.equal(ids.get('replaceDialog').open,false);assert.equal(memory['cinzas-demo-v1'],before,'A initially cancels rather than discarding campaign');
 pad.buttons[0].pressed=false;nextFrame(16048);ids.get('startBtn').onclick();nextFrame(16064);pad.buttons[1].pressed=true;nextFrame(16080);assert.equal(ids.get('replaceDialog').open,false);assert.equal(memory['cinzas-demo-v1'],before,'B closes without overwriting');
 pad.buttons[1].pressed=false;pads=[];nextFrame(16096);
 const upload=async data=>{ids.get('saveFile').files=[{size:100,text:async()=>JSON.stringify(data)}];await ids.get('saveFile').onchange();};
 const cp=JSON.parse(before).campaignSave,horde=JSON.parse(before).hordeSave;
 for(const data of [
  {format:'cinzas-save',version:2,scores:[{name:'Invalid',difficulty:'normal',wave:999,kills:99}],checkpoint:horde,campaignCheckpoint:{...cp,history:['missing']}},
  {format:'cinzas-save',version:2,scores:[],checkpoint:cp,campaignCheckpoint:null},
  {format:'cinzas-save',version:2,scores:[],checkpoint:null,campaignCheckpoint:horde},
  {format:'cinzas-save',version:2,scores:[],checkpoint:false,campaignCheckpoint:null},
 ]){await upload(data);assert.equal(memory['cinzas-demo-v1'],before);assert(ids.get('toast').textContent.includes('inválido'));}
 await upload({format:'cinzas-save',version:1,scores:[],checkpoint:horde});
 assert.deepEqual(JSON.parse(memory['cinzas-demo-v1']).campaignSave,cp);
 assert.equal(JSON.stringify(JSON.parse(memory['cinzas-demo-v1']).hordeSave),savedHorde);
 const disk=memory['cinzas-demo-v1'],save=context.localStorage.setItem;
 context.localStorage.setItem=()=>{throw Error('quota')};
 await upload({format:'cinzas-save',version:2,scores:[],checkpoint:horde,campaignCheckpoint:{...cp,seed:'other'}});
 assert.equal(memory['cinzas-demo-v1'],disk);assert(ids.get('toast').textContent.includes('indisponível'));
 context.localStorage.setItem=save;ids.get('continueCampaign').onclick();assert.equal(captured.seed,cp.seed);
 const otherTab=JSON.parse(memory['cinzas-demo-v1']);otherTab.legacy={version:1,cleared:25,weapon:'hammer',rune:'frost'};
 memory['cinzas-demo-v1']=JSON.stringify(otherTab);
 ids.get('soundBtn').onclick();
 assert.deepEqual(JSON.parse(memory['cinzas-demo-v1']).legacy,otherTab.legacy,'An older tab cannot erase an earned legacy');
 ids.get('suspendBtn').onclick();pads=[pad];nextFrame(17000);
 for(let i=0;i<3;i++){
  pad.buttons[13].pressed=true;nextFrame(17016+i*32);
  pad.buttons[13].pressed=false;nextFrame(17032+i*32);
 }
 assert.equal(document.activeElement,ids.get('legacyWeapon'),'The expedition legacy is reachable from the controller menu');
 pad.buttons[0].pressed=true;nextFrame(17130);pad.buttons[0].pressed=false;
 assert.equal(JSON.parse(memory['cinzas-demo-v1']).legacy.weapon,'staff','The controller changes and persists the selected weapon');
 assert.equal(JSON.parse(memory['cinzas-demo-v1']).legacy.rune,'frost');
 pad.buttons[13].pressed=true;nextFrame(17146);pad.buttons[13].pressed=false;nextFrame(17162);
 assert.equal(document.activeElement,ids.get('legacyRune'),'The rune is reachable from the controller menu');
 const fromOtherTab=JSON.parse(memory['cinzas-demo-v1']);
 fromOtherTab.campaignSave={...cp,seed:'nova-campanha'};
 fromOtherTab.hordeSave={...horde,seed:'nova-horda'};
 memory['cinzas-demo-v1']=JSON.stringify(fromOtherTab);
 pad.buttons[0].pressed=true;nextFrame(17178);pad.buttons[0].pressed=false;
 const persisted=JSON.parse(memory['cinzas-demo-v1']);
 assert.deepEqual(persisted.campaignSave,fromOtherTab.campaignSave);
 assert.deepEqual(persisted.hordeSave,fromOtherTab.hordeSave);
 assert.equal(JSON.parse(memory['cinzas-demo-v1']).legacy.rune,'fire','The controller changes the rune without changing the selected weapon');
 persisted.campaignSave={...cp,seed:'campanha-mais-nova'};
 persisted.hordeSave={...horde,seed:'horda-mais-nova'};
 memory['cinzas-demo-v1']=JSON.stringify(persisted);
 ids.get('soundBtn').onclick();
 assert.deepEqual(JSON.parse(memory['cinzas-demo-v1']).campaignSave,persisted.campaignSave,'Changing audio in an older tab preserves the newer expedition');
 assert.deepEqual(JSON.parse(memory['cinzas-demo-v1']).hordeSave,persisted.hordeSave,'Changing audio in an older tab preserves the newer horde');

 // A failed write remains available in session and is retried by the next edit.
 pads=[];ids.get('suspendBtn').onclick();
 context.localStorage.setItem=()=>{throw Error('quota')};
 ids.get('continueCampaign').onclick();
 captured.spawnQueue=[];captured.enemies=[];captured.portals=[];
 nextFrame(17300);
 const pendingCheckpoint=captured.createCheckpoint();
 ids.get('suspendBtn').onclick();
 context.localStorage.setItem=save;
 ids.get('soundBtn').onclick();
 ids.get('continueCampaign').onclick();
 assert.equal(captured.seed,pendingCheckpoint.seed,'A quota-failed checkpoint remains resumable after another successful write');
 assert.equal(captured.createCheckpoint().phase,pendingCheckpoint.phase);
 ids.get('suspendBtn').onclick();

 // A fresh external campaign is discovered before the replacement guard.
 const external=JSON.parse(memory['cinzas-demo-v1']);
 external.campaignSave={...cp,seed:'outra-aba-confirmacao'};
 memory['cinzas-demo-v1']=JSON.stringify(external);
 ids.get('startBtn').onclick();
 assert(ids.get('replaceDialog').open,'Start discovers a newer campaign written by another tab');
 assert.equal(JSON.parse(memory['cinzas-demo-v1']).campaignSave.seed,'outra-aba-confirmacao');
 ids.get('replaceCancel').onclick();

 // A running stale tab cannot replace a newer attempt at its next milestone.
 ids.get('continueCampaign').onclick();
 const replacement=JSON.parse(memory['cinzas-demo-v1']);
 replacement.campaignSave={...cp,seed:'outra-aba-em-jogo'};
 memory['cinzas-demo-v1']=JSON.stringify(replacement);
 captured.spawnQueue=[];captured.enemies=[];captured.portals=[];
 nextFrame(17432);
 assert.equal(JSON.parse(memory['cinzas-demo-v1']).campaignSave.seed,'outra-aba-em-jogo','An older active expedition cannot overwrite a different attempt');
 assert(ids.get('saveNote').textContent.toLowerCase().includes('outra aba'));
 ids.get('suspendBtn').onclick();
 assert(ids.get('toast').textContent.includes('apenas nesta sessão'),'Suspending a conflicted attempt cannot claim the checkpoint was saved');
 console.log('PASS campaign UI saves/resumes a separate checkpoint, confirms replacement, preserves v1 imports and rejects invalid/quota-failed imports atomically.');
})().catch(error=>{console.error(error);process.exitCode=1;});
}
