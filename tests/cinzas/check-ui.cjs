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
const winListeners={},window={matchMedia:()=>({matches:false}),addEventListener:(type,cb)=>(winListeners[type]||=[]).push(cb),scrollTo(){}};
let nextFrame;
let pads=[];
class MockImage{constructor(){this.width=1774;this.height=887;}set src(v){assert(fs.existsSync('../../public/roguelite/'+v),'Missing texture '+v);this.onload?.();}}
const memory={};
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
ids.get('startBtn').onclick();
assert.equal(captured.status,'upgrade');assert.equal(ids.get('hud').hidden,false);assert(captured.cards.every(c=>c.category==='weapon'));ids.get('upgradeCards').querySelectorAll('button')[0].onclick();assert.equal(captured.stage,0);assert.equal(captured.status,'running');
for(let i=0;i<100;i++)nextFrame(16.666*i);
ids.get('pauseBtn').onclick();assert.equal(captured.status,'paused');
ids.get('resumeBtn').onclick();assert.equal(captured.status,'running');
ids.get('helpBtn').onclick();assert.equal(captured.status,'paused');assert(ids.get('helpDialog').open);
ids.get('helpDialog').close();assert.equal(captured.status,'running');
captured.spawnQueue=[];captured.enemies.forEach(e=>captured.damageEnemy(e,1e6,false,false));
nextFrame(2000);captured.player.x=captured.checkpoint.x-14;captured.player.y=captured.checkpoint.y-captured.player.h;captured.useCheckpoint();nextFrame(2016);
assert.equal(captured.status,'upgrade');assert.equal(ids.get('upgradeScreen').hidden,false);assert(captured.cards.every(c=>c.category==='element'));const tokens=captured.rerolls;ids.get('rerollBtn').onclick();assert.equal(captured.rerolls,tokens-1);assert(captured.cards.every(c=>c.category==='element'));assert(!ids.get('upgradeCards').innerHTML.includes('0/0'));
const choice=ids.get('upgradeCards').querySelectorAll('button')[0];assert(choice);choice.onclick();
assert.equal(captured.stage,1);assert.equal(ids.get('upgradeScreen').hidden,true);
for(let biome=0;biome<3;biome++){captured.stage=biome*5+4;captured.loadStage();for(let i=0;i<150;i++)nextFrame(2200+biome*3000+i*16.666);}
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
