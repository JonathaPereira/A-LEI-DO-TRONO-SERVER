'use strict';
const {spawn}=require('node:child_process'),fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const GAMES={
  'cs2.exe':'Counter-Strike 2','csgo.exe':'Counter-Strike: Global Offensive','valorant-win64-shipping.exe':'VALORANT',
  'league of legends.exe':'League of Legends','fortniteclient-win64-shipping.exe':'Fortnite','r5apex.exe':'Apex Legends',
  'overwatch.exe':'Overwatch 2','rocketleague.exe':'Rocket League','robloxplayerbeta.exe':'Roblox','minecraft.windows.exe':'Minecraft',
  'eldenring.exe':'ELDEN RING','gta5.exe':'Grand Theft Auto V','gta5_enhanced.exe':'Grand Theft Auto V Enhanced','rdr2.exe':'Red Dead Redemption 2',
  'cyberpunk2077.exe':'Cyberpunk 2077','bg3.exe':"Baldur's Gate 3",'bg3_dx11.exe':"Baldur's Gate 3",'dota2.exe':'Dota 2',
  'ts4_x64.exe':'The Sims 4','starrail.exe':'Honkai: Star Rail','genshinimpact.exe':'Genshin Impact','wuwa.exe':'Wuthering Waves',
  'diablo iv.exe':'Diablo IV','worldofwarcraft.exe':'World of Warcraft','wow.exe':'World of Warcraft','ffxiv_dx11.exe':'FINAL FANTASY XIV',
  'deadbydaylight-win64-shipping.exe':'Dead by Daylight','palworld-win64-shipping.exe':'Palworld','helldivers2.exe':'HELLDIVERS 2',
  'fc25.exe':'EA SPORTS FC 25','fc26.exe':'EA SPORTS FC 26','rainbowsix.exe':'Rainbow Six Siege','destiny2.exe':'Destiny 2'
};
function label(text){return typeof text==='string'?text.replace(/[\x00-\x1f\x7f]/g,'').normalize('NFKC').trim().slice(0,80):'';}
const idFor=filename=>crypto.createHash('sha256').update(filename.toLowerCase()).digest('hex');
class DesktopActivity{
  constructor(app,publish,options={}){
    this.executable=options.executable||(app.isPackaged?path.join(process.resourcesPath,'native/MN-Application-Audio.exe'):path.resolve(__dirname,'../../artifacts/native-audio/Release/MN-Application-Audio.exe'));
    this.available=options.available??(process.platform==='win32'&&fs.existsSync(this.executable));this.spawn=options.spawn||spawn;this.publish=publish;this.child=null;this.timer=null;this.watchdog=null;this.generation=0;this.busy=false;this.preferred=null;this.customName='';this.steamCache=new Map();
    this.state={available:this.available,enabled:false,game:null,apps:[],error:null};
  }
  configure(config={}){
    if(typeof config.enabled!=='boolean'||config.preferredAppId!=null&&!/^[a-f0-9]{64}$/.test(config.preferredAppId)||config.name!=null&&typeof config.name!=='string')throw Error('Atividade inválida.');
    this.preferred=config.preferredAppId||null;this.customName=label(config.name);this.state.enabled=config.enabled&&this.available;
    if(!this.state.enabled){this.stop();this.state.game=null;this.state.apps=[];this.state.error=null;this.emit();return this.snapshot();}
    if(!this.child)this.start();else this.scan();return this.snapshot();
  }
  snapshot(){return {...this.state,game:this.state.game?{...this.state.game}:null,apps:this.state.apps.map(row=>({...row}))};}
  emit(){this.publish(this.snapshot());}
  start(){
    const child=this.spawn(this.executable,['--activity-watch','--exclude-pid',String(process.pid)],{windowsHide:true,stdio:['pipe','pipe','pipe']});this.child=child;const generation=++this.generation;let bytes='';
    const fail=()=>{if(this.child!==child)return;this.stop();this.state.game=null;this.state.apps=[];this.state.error='Não foi possível detectar os aplicativos. Desative e ative a atividade para tentar novamente.';this.emit();};
    child.on('error',fail);child.stdin.on('error',fail);child.stderr.on('data',()=>{});
    child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>{if(this.child!==child)return;bytes+=chunk.toString();if(bytes.length>262144)return fail();let end;while((end=bytes.indexOf('\n'))!==-1){const line=bytes.slice(0,end);bytes=bytes.slice(end+1);try{const data=JSON.parse(line);if(data.type!=='apps'||!Array.isArray(data.apps)||data.apps.length>128)return fail();clearTimeout(this.watchdog);void this.consume(data.apps,generation).catch(fail);}catch{fail();}}});
    child.once('close',fail);this.timer=setInterval(()=>this.scan(),15000);this.timer.unref();this.scan();
  }
  scan(){if(!this.child||this.busy)return;this.busy=true;clearTimeout(this.watchdog);this.watchdog=setTimeout(()=>{this.stop();this.state.game=null;this.state.apps=[];this.state.error='A detecção de atividade não respondeu.';this.emit();},10000);this.watchdog.unref();this.child.stdin.write('scan\n');}
  async steamName(filename){
    const match=/^(.*[\\/]steamapps)[\\/]common[\\/]([^\\/]+)[\\/]/i.exec(filename);if(!match)return null;
    const directory=match[1],install=match[2].toLowerCase();let cached=this.steamCache.get(directory);
    if(!cached||Date.now()-cached.at>300000){
      const names=new Map();try{const files=(await fsp.readdir(directory)).filter(file=>/^appmanifest_\d+\.acf$/i.test(file)).slice(0,1000);
        // Sequential, cached metadata reads keep activity discovery lightweight.
        for(const file of files){try{const target=path.join(directory,file),stat=await fsp.stat(target);if(stat.size>65536)continue;const text=await fsp.readFile(target,'utf8'),folder=/"installdir"\s+"([^"]+)"/i.exec(text)?.[1],name=/"name"\s+"([^"]+)"/i.exec(text)?.[1];if(folder&&name)names.set(folder.toLowerCase(),label(name));}catch{}}
      }catch{}cached={at:Date.now(),names};this.steamCache.set(directory,cached);
    }return cached.names.get(install)||label(match[2].replace(/[_-]/g,' '));
  }
  async consume(rows,generation){
    const apps=[];
    for(const row of rows){if(typeof row.path!=='string'||row.path.length>16384||typeof row.exe!=='string'||!Number.isInteger(row.pid)||row.pid<=0||row.pid===process.pid)continue;
      const exe=row.exe.toLowerCase();if(/^(mn trono|unitycrashhandler|crashreport)/i.test(exe))continue;
      const recognized=GAMES[exe]||await this.steamName(row.path),name=label(row.product)||label(row.exe.replace(/\.exe$/i,''));
      apps.push({id:idFor(row.path),name,game:recognized||null,foreground:row.foreground===true});
    }
    if(generation!==this.generation||!this.state.enabled)return;clearTimeout(this.watchdog);this.busy=false;
    const unique=[...new Map(apps.map(row=>[row.id,row])).values()];this.state.apps=unique.map(({id,name})=>({id,name})).sort((a,b)=>a.name.localeCompare(b.name));
    const chosen=this.preferred?unique.find(row=>row.id===this.preferred):unique.find(row=>row.game&&row.foreground)||unique.find(row=>row.game&&row.game===this.state.game?.name)||unique.find(row=>row.game);
    const name=chosen?(this.preferred?this.customName||chosen.game||chosen.name:chosen.game):null;
    this.state.game=name?{name,startedAt:this.state.game?.name===name?this.state.game.startedAt:Date.now()}:null;this.state.error=null;this.emit();
  }
  stop(){++this.generation;clearInterval(this.timer);clearTimeout(this.watchdog);this.timer=null;this.watchdog=null;this.busy=false;const child=this.child;this.child=null;if(child){child.stdin.end();const kill=setTimeout(()=>child.kill(),2000);kill.unref();child.once('close',()=>clearTimeout(kill));}}
  dispose(){this.state.enabled=false;this.stop();this.state.game=null;this.state.apps=[];}
}
module.exports={DesktopActivity,label,idFor};
