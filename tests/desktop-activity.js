'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),{PassThrough}=require('node:stream'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {DesktopActivity,idFor}=require('../desktop/app/activity.cjs');
function helper(){const child=new EventEmitter();child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>child.emit('close');child.stdin.once('finish',()=>{child.closed=true;queueMicrotask(()=>child.emit('close'));});return child;}
function next(activity,rows){return new Promise(resolve=>{const publish=activity.publish;activity.publish=state=>{activity.publish=publish;publish(state);resolve(state);};activity.child.stdout.write(JSON.stringify({type:'apps',apps:rows})+'\n');});}
const cs={pid:8123,exe:'cs2.exe',path:'C:\\Games\\CS2\\cs2.exe',product:'Counter-Strike',foreground:false},browser={pid:9234,exe:'chrome.exe',path:'C:\\Browser\\chrome.exe',product:'Chrome',foreground:true};
test('activity is opt-in, recognizes games without window captions, retains start time and releases its helper',async()=>{
  const children=[],states=[];const activity=new DesktopActivity({isPackaged:false},state=>states.push(state),{available:true,spawn:(file,args,options)=>{assert.deepEqual(args,['--activity-watch','--exclude-pid',String(process.pid)]);assert.equal(options.windowsHide,true);const child=helper();children.push(child);return child;}});
  try{assert.equal(children.length,0);activity.configure({enabled:false});assert.equal(children.length,0);activity.configure({enabled:true});let state=await next(activity,[cs,browser]);assert.equal(state.game.name,'Counter-Strike 2');const started=state.game.startedAt;state=await next(activity,[cs,browser]);assert.equal(state.game.startedAt,started);
    assert(!JSON.stringify(state).includes('C:\\'));assert(!Object.hasOwn(state.apps[0],'pid'));assert(!Object.hasOwn(state.apps[0],'exe'));
    state=await next(activity,[browser]);assert.equal(state.game,null);
    activity.configure({enabled:true,preferredAppId:idFor(browser.path),name:'Meu aplicativo'});state=await next(activity,[browser]);assert.equal(state.game.name,'Meu aplicativo');
    activity.configure({enabled:false});assert.equal(activity.child,null);assert.equal(activity.snapshot().game,null);await new Promise(setImmediate);assert.equal(children[0].closed,true);assert.equal(activity.timer,null);
    assert.throws(()=>activity.configure({enabled:true,preferredAppId:'../other'}));assert.throws(()=>activity.configure({enabled:'yes'}));
  }finally{activity.dispose();}
});
test('Steam manifests resolve the actual game name, stay cached and never expose install paths',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'mn-steam-')),steam=path.join(dir,'steamapps');await fs.mkdir(steam);
  const file=path.join(steam,'appmanifest_123.acf');await fs.writeFile(file,'"name" "Jogo da Steam"\n"installdir" "FolderName"');
  const activity=new DesktopActivity({isPackaged:false},()=>{},{available:true,spawn:()=>helper()});try{
    activity.configure({enabled:true});const game={pid:8383,exe:'unknown-game.exe',path:path.join(steam,'common','FolderName','unknown-game.exe'),product:'Engine',foreground:true};
    assert.equal((await next(activity,[game])).game.name,'Jogo da Steam');await fs.writeFile(file,'"name" "Different"\n"installdir" "FolderName"');const state=await next(activity,[game]);assert.equal(state.game.name,'Jogo da Steam');assert(!JSON.stringify(state).includes(dir));
  }finally{activity.dispose();await fs.rm(dir,{recursive:true,force:true});}
});
test('unsupported activity never launches a process and helper failures clear stale games',async()=>{
  const unsupported=new DesktopActivity({isPackaged:false},()=>{},{available:false,spawn:()=>{throw Error('must not start');}});assert.equal(unsupported.configure({enabled:true}).enabled,false);
  const activity=new DesktopActivity({isPackaged:false},()=>{},{available:true,spawn:()=>helper()});try{activity.configure({enabled:true});await next(activity,[cs]);activity.child.emit('error',Error('lost helper'));assert.equal(activity.snapshot().game,null);assert.equal(activity.child,null);assert(activity.snapshot().error);}finally{activity.dispose();}
});
