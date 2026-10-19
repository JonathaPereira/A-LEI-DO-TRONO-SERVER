'use strict';
const {app,BrowserWindow,screen,session,net,ipcMain,globalShortcut,dialog,Tray,Menu,nativeImage,shell,safeStorage,Notification,clipboard}=require('electron');
const path=require('node:path'),fs=require('node:fs/promises'),crypto=require('node:crypto'),{pathToFileURL}=require('node:url');
const {APP_ORIGIN,BACKEND_ORIGIN,isAppURL,bundlePath,clipFilename,accelerator}=require('./policy.cjs');
const {clipBytes,writeClip}=require('./clip-files.cjs');
const {DesktopPreferences}=require('./preferences.cjs');
const {DesktopActivity}=require('./activity.cjs');
const {createNotifications}=require('./notifications.cjs');
const {GameAssets}=require('./game-assets.cjs');
const {AudioPriority}=require('./audio-priority.cjs');
const {RemoteInput}=require('./remote-input.cjs');
const {ApplicationAudio}=require('./application-audio.cjs'),{createUpdates}=require('./updates.cjs');
const root=app.isPackaged?path.join(process.resourcesPath,'frontend'):path.resolve(__dirname,'../../frontend');
let window,tray,quitting=false,hotkey=null,capture=null,clipActive=false,applicationAudio,updates,installingUpdate=false,preferences,activity;
const folders=new Map();
let remoteInput,remotePermit=null,remoteNotice=null;
const REMOTE_STOP='Control+Alt+Shift+F12';
function stopRemote(){
 remotePermit=null;if(capture?.remote)cancelCapture();remoteInput?.reset();globalShortcut.unregister(REMOTE_STOP);
 if(remoteNotice){const old=remoteNotice;remoteNotice=null;old.destroy();}
 if(window&&!window.isDestroyed())window.webContents.send('mn:remote',{type:'ended'});
}
function showRemoteNotice(name){
 if(remoteNotice)return;const area=screen.getPrimaryDisplay().workArea;
 remoteNotice=new BrowserWindow({width:380,height:112,x:Math.round(area.x+(area.width-380)/2),y:area.y+8,alwaysOnTop:true,skipTaskbar:true,resizable:false,minimizable:false,maximizable:false,title:'PC compartilhado · Beta',webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});
 remoteNotice.setMenu(null);remoteNotice.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 remoteNotice.webContents.on('will-navigate',event=>{event.preventDefault();stopRemote();});
 remoteNotice.on('closed',()=>{if(remoteNotice){remoteNotice=null;stopRemote();}});
 const safe=String(name).replace(/[&<>"']/g,'');
 const html=`<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><style>body{margin:0;padding:10px 14px;background:#191d2d;color:#f1f2fa;font:12px system-ui}b{color:#c2b4ff}a{float:right;color:#ffc3c3}small{display:block;margin-top:6px;color:#b5bed2}</style><b>PC compartilhado · Beta</b><a href="mn-remote-stop:">Encerrar</a><div>${safe}</div><small>Encerrar: Ctrl + Alt + Shift + F12</small>`;
 void remoteNotice.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(html));
}

const trace=(...values)=>{if(!app.isPackaged&&app.commandLine.hasSwitch('desktop-diagnostics'))console.error('[desktop]',...values);};
// Web Audio capture/RNNoise runs in the renderer, not the Audio Service alone.
// Keep its Windows scheduling priority when covered, minimized or on another
// desktop. backgroundThrottling:false only controls the window/page policy.
if(process.platform==='win32'){
  app.commandLine.appendSwitch('disable-renderer-backgrounding');
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
}
if(!app.requestSingleInstanceLock())app.quit();
else{
  app.on('second-instance',()=>{window?.show();window?.focus();});
  app.on('before-quit',()=>{quitting=true;});
  app.on('will-quit',()=>{stopRemote();globalShortcut.unregisterAll();applicationAudio?.stopAll();activity?.dispose();});
  app.on('window-all-closed',()=>app.quit());
  app.whenReady().then(start).catch(error=>{dialog.showErrorBox('Não foi possível abrir o M&N',error.message);app.quit();});
}
function trusted(event){if(event.sender!==window?.webContents||event.senderFrame!==window.webContents.mainFrame||!isAppURL(event.senderFrame.url))throw Error('Desktop access denied');}
function clip(){if(clipActive&&!window?.isDestroyed())window.webContents.send('mn:clip',{id:crypto.randomUUID()});}
function clearHotkey(){if(hotkey)globalShortcut.unregister(hotkey);hotkey=null;clipActive=false;}
async function start(){
  app.setAppUserModelId('com.jonatha.mn.trono');
  preferences=new DesktopPreferences(app.getPath('userData'),safeStorage);await preferences.load();
  const browserSession=session.fromPartition('persist:mn-trono');
  const gameManifest=JSON.parse(await fs.readFile(path.join(root,'roguelite/asset-manifest.json'),'utf8'));
  const gameAssets=new GameAssets({manifest:gameManifest,directory:path.join(app.getPath('userData'),'game-assets'),origin:APP_ORIGIN,fetchAsset:url=>net.fetch(url,{bypassCustomProtocolHandlers:true,credentials:'omit',redirect:'error',signal:AbortSignal.timeout(60000)})});
  const attachmentSession=session.fromPartition('persist:mn-attachments');
  attachmentSession.setPermissionCheckHandler(()=>false);attachmentSession.setPermissionRequestHandler((_,__,callback)=>callback(false));
  // This partition contains only the installed UI. External frames are blocked
  // by CSP and all popups get a separate, unprivileged network session.
  let testAPI=null;
  if(!app.isPackaged){try{const candidate=new URL(app.commandLine.getSwitchValue('desktop-api-test-origin'));if(candidate.protocol==='https:'&&candidate.hostname==='127.0.0.1')testAPI=candidate.origin;}catch{}}
  // Local, versioned UI uses the existing origin for API/WS compatibility.
  // Code and HTML come only from the installed bundle. Listed game media may
  // use its verified cache; there is no remote HTML/script fallback.
  await browserSession.protocol.handle('https',async request=>{
    if(!isAppURL(request.url)){
      const headers=new Headers(request.headers),target=new URL(request.url).origin;
      // Protocol requests omit Chromium's automatic Origin header, including
      // no-referrer auth POSTs and XHR uploads. The app's dedicated partition
      // supplies its origin only to its own backend; foreign pages never use
      // this partition or receive desktop capabilities.
      if((target===BACKEND_ORIGIN||target===testAPI)&&!headers.has('origin'))headers.set('Origin',APP_ORIGIN);
      return net.fetch(request,{headers,bypassCustomProtocolHandlers:true});
    }
    if(!['GET','HEAD'].includes(request.method))return new Response('',{status:405});
    const gamePath=new URL(request.url).pathname.slice('/roguelite/'.length);
    if(new URL(request.url).pathname.startsWith('/roguelite/assets/')){
      if(!gameAssets.has(gamePath))return new Response('',{status:404});
      try{const data=await gameAssets.read(gamePath);return new Response(request.method==='HEAD'?null:data,{headers:{'Content-Type':gameAssets.entries.get(gamePath).type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}catch{return new Response('Não foi possível preparar os recursos do jogo.',{status:503});}
    }
    try{
      const file=bundlePath(root,request.url),real=await fs.realpath(file),realRoot=await fs.realpath(root);
      if(!real.startsWith(realRoot+path.sep))return new Response('',{status:403});
      const response=await net.fetch(pathToFileURL(real).href),headers=new Headers(response.headers);
      headers.set('Cache-Control','no-store');
      headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' blob: https:; connect-src 'self' https: wss: http://127.0.0.1:* ws://127.0.0.1:*; worker-src 'self' blob:; frame-src 'self' blob:; object-src 'none'");
      // Complete local responses before handing them back to Chromium. A file
      // stream crossing the HTTPS handler can leave embedded documents waiting.
      return new Response(request.method==='HEAD'?null:await response.arrayBuffer(),{status:response.status,headers});
    }catch{return new Response('Arquivo local indisponível.',{status:404});}
  });
  const voicePriority=new AudioPriority({metrics:()=>app.getAppMetrics()});
  app.on('will-quit',()=>voicePriority.dispose());
  ipcMain.handle('mn:voice-protection',(event,active)=>{trusted(event);return voicePriority.setActive(active);});
  const workArea=screen.getPrimaryDisplay().workAreaSize;
  window=new BrowserWindow({title:'M&N · A Lei do Trono',icon:path.join(__dirname,'assets/icon.png'),width:Math.max(480,Math.min(1440,workArea.width)),height:Math.max(520,Math.min(960,workArea.height)),minWidth:480,minHeight:520,fullscreenable:true,show:false,backgroundColor:'#141727',webPreferences:{session:browserSession,preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false}});
  window.on('ready-to-show',()=>window.show());
  const notifications=createNotifications({Notification,window,activate:target=>{if(window.isDestroyed())return;window.show();if(window.isMinimized())window.restore();window.focus();window.webContents.send('mn:notification-click',target);}});
  ipcMain.handle('mn:notify',(event,value)=>{trusted(event);return notifications.notify(value);});
  app.on('will-quit',()=>notifications.dispose());
  ipcMain.handle('mn:copy-diagnostics',(event,text)=>{trusted(event);if(typeof text!=='string'||text.length>12000)throw Error('Invalid diagnostic report');clipboard.writeText(text);return {copied:true};});
  ipcMain.handle('mn:resources',event=>{trusted(event);const metrics=app.getAppMetrics(),memory=process.getSystemMemoryInfo();return {appCpuPercent:Math.round(metrics.reduce((sum,row)=>sum+(row.cpu.percentCPUUsage||0),0)*10)/10,appMemoryMB:Math.round(metrics.reduce((sum,row)=>sum+(row.memory.workingSetSize||0),0)/1024),freeMemoryMB:Math.round(memory.free/1024),voicePriority:voicePriority.snapshot()};});
  applicationAudio=new ApplicationAudio(app,data=>{if(!window.isDestroyed())window.webContents.send('mn:application-audio',data);});
  remoteInput=new RemoteInput({app,displays:()=>screen.getAllDisplays(),point:p=>screen.dipToScreenPoint(p),publish:data=>{if(!window.isDestroyed())window.webContents.send('mn:remote',data);}});
  screen.on('display-removed',stopRemote);screen.on('display-metrics-changed',stopRemote);
  ipcMain.handle('mn:remote-capability',event=>{trusted(event);return {host:remoteInput.available,beta:true,audio:applicationAudio.capability.available};});
  ipcMain.handle('mn:remote-prepare',async(event,peerName)=>{
    trusted(event);if(!remoteInput.available)throw Error('Instale a versão Windows com Compartilhar PC Beta.');
    if(remotePermit||capture)throw Error('Encerre o compartilhamento atual antes de iniciar outro.');
    if(typeof peerName!=='string'||!peerName.trim()||peerName.length>80)throw Error('Participante inválido.');
    // The HUD notice and the explicit monitor picker authorize viewing. Keep
    // this preflight short so getDisplayMedia retains the user's activation.
    if(!globalShortcut.register(REMOTE_STOP,stopRemote))throw Error('O atalho de emergência está ocupado. Libere Ctrl + Alt + Shift + F12 para continuar.');
    remotePermit={peerName,expires:Date.now()+60000,selected:false};return {allowed:true};
  });
  ipcMain.handle('mn:remote-allow',async event=>{
    trusted(event);const permit=remotePermit;if(!permit?.selected)throw Error('Compartilhamento indisponível.');
    const answer=await dialog.showMessageBox(window,{type:'question',buttons:['Somente assistir','Permitir controle'],defaultId:0,cancelId:0,message:permit.peerName+' quer controlar seu PC',detail:'Permite mouse e teclado neste computador durante esta sessão beta. Não abra senhas ou informações privadas. Ctrl + Alt + Shift + F12 encerra o acesso.'});
    if(remotePermit!==permit||answer.response!==1)return {allowed:false};
    const result=await remoteInput.start();if(remotePermit!==permit){remoteInput.stop();return {allowed:false};}return {allowed:true,...result};
  });
  ipcMain.on('mn:remote-input',(event,data)=>{try{trusted(event);remoteInput.input(data?.token,data?.event);}catch{}});
  ipcMain.handle('mn:remote-revoke',event=>{trusted(event);remoteInput.stop();return true;});
  ipcMain.handle('mn:remote-stop',event=>{trusted(event);stopRemote();return true;});

  activity=new DesktopActivity(app,state=>{if(!window.isDestroyed())window.webContents.send('mn:activity',state);});
  ipcMain.handle('mn:activity-state',event=>{trusted(event);return activity.snapshot();});
  ipcMain.handle('mn:activity-configure',(event,config)=>{trusted(event);return activity.configure(config);});
  ipcMain.handle('mn:application-audio-stop',(event,id)=>{trusted(event);applicationAudio.stop(id);});
  ipcMain.handle('mn:replay-prepare',event=>{trusted(event);return {active:false,suspended:true};});
  ipcMain.handle('mn:session-read',event=>{trusted(event);return preferences.readSession();});
  ipcMain.handle('mn:session-save',(event,value)=>{trusted(event);return preferences.saveSession(value);});
  ipcMain.handle('mn:media-permissions',event=>{trusted(event);return [...preferences.permissions];});
  ipcMain.handle('mn:media-reset',async event=>{trusted(event);await preferences.reset();return [];});
  ipcMain.on('mn:application-audio-ack',(event,id)=>{try{trusted(event);applicationAudio.ack(id);}catch{}});
  updates=createUpdates({updater:require('electron-updater').autoUpdater,enabled:app.isPackaged,publish:state=>{if(!window.isDestroyed())window.webContents.send('mn:update-state',state);},confirm:async()=>{const answer=await dialog.showMessageBox(window,{type:'question',buttons:['Continuar no app','Reiniciar e atualizar'],defaultId:0,cancelId:0,message:'Reiniciar para atualizar?',detail:'A chamada será encerrada. Sua conta, preferências e arquivos locais serão preservados.'});return answer.response===1;},prepareInstall:()=>{installingUpdate=true;quitting=true;}});
  ipcMain.handle('mn:update-state',event=>{trusted(event);return updates.state;});
  ipcMain.handle('mn:update-check',event=>{trusted(event);return updates.check({force:true});});
  ipcMain.handle('mn:update-install',event=>{trusted(event);return updates.install();});
  if(app.isPackaged){const first=setTimeout(()=>void updates.check(),10000),periodic=setInterval(()=>void updates.check({force:true}),4*60*60*1000);first.unref();periodic.unref();app.on('will-quit',()=>{clearTimeout(first);clearInterval(periodic);});}
  const windowState=()=>({fullscreen:window.isFullScreen()});
  for(const name of ['enter-full-screen','leave-full-screen'])window.on(name,()=>window.webContents.send('mn:window-state',windowState()));
  ipcMain.handle('mn:window-state',event=>{trusted(event);return windowState();});
  ipcMain.handle('mn:fullscreen',event=>{trusted(event);const fullscreen=!window.isFullScreen();window.setFullScreen(fullscreen);return {fullscreen};});
  window.on('close',event=>{if(tray&&!quitting){event.preventDefault();window.hide();}});
  window.webContents.on('will-prevent-unload',event=>{
    if(installingUpdate){event.preventDefault();return;}
    const response=dialog.showMessageBoxSync(window,{type:'question',buttons:['Continuar no app','Sair'],defaultId:0,cancelId:0,message:'Encerrar o M&N?',detail:'Sua chamada será encerrada. A conta lembrada e as preferências ficam salvas neste computador.'});
    if(response===1)event.preventDefault();else quitting=false;
  });
  window.webContents.on('render-process-gone',()=>{voicePriority.setActive(false);stopRemote();clearHotkey();cancelCapture();applicationAudio.stopAll();activity.dispose();});
  window.webContents.on('did-start-navigation',(_,url,isInPlace,isMainFrame)=>{if(isMainFrame&&!isInPlace){voicePriority.setActive(false);cancelCapture();}});
  window.webContents.on('did-navigate',()=>{stopRemote();clearHotkey();applicationAudio.stopAll();});
  window.webContents.on('will-navigate',(event,url)=>{if(!isAppURL(url)){event.preventDefault();if(/^https:\/\//.test(url))void shell.openExternal(url);}});
  window.webContents.on('will-attach-webview',event=>event.preventDefault());
  // window.open inherits the opener's Chromium partition, even with some
  // BrowserWindow overrides. File viewers are created through the fixed IPC
  // below, so foreign content never enters the app's API network partition.
  window.webContents.setWindowOpenHandler(({url})=>{if(/^https:\/\//.test(url))void shell.openExternal(url);return {action:'deny'};});
  ipcMain.handle('mn:manual',event=>{
    trusted(event);
    const manualSession=session.fromPartition('mn-manual');
    manualSession.setPermissionCheckHandler(()=>false);manualSession.setPermissionRequestHandler((_,__,callback)=>callback(false));
    const manualArea=screen.getDisplayMatching(window.getBounds()).workAreaSize;
    const viewer=new BrowserWindow({title:'Manual da Corte · A Lei do Trono',width:Math.max(480,Math.min(1000,manualArea.width)),height:Math.max(520,Math.min(800,manualArea.height)),minWidth:480,minHeight:520,icon:path.join(__dirname,'assets/icon.png'),webPreferences:{session:manualSession,nodeIntegration:false,contextIsolation:true,sandbox:true}});
    const manual=pathToFileURL(path.join(root,'manual/index.html')).href,pdf=pathToFileURL(path.join(root,'manual/A_Lei_do_Trono_Manual_v0.9.0.pdf')).href;
    viewer.webContents.on('will-navigate',(event,url)=>{if(url.split('#')[0]!==manual&&url!==pdf)event.preventDefault();});
    viewer.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    void viewer.loadURL(manual).catch(error=>{dialog.showErrorBox('Não foi possível abrir o manual',error.message);viewer.destroy();});return {opened:true};
  });
  ipcMain.handle('mn:attachment' ,(event,choice)=>{
    trusted(event);if(typeof choice?.url!=='string'||choice.url.length>16384)throw Error('Link de arquivo inválido.');
    const target=new URL(choice.url);if(target.protocol!=='https:'||target.username||target.password||isAppURL(target.href))throw Error('Link de arquivo inválido.');
    const viewer=new BrowserWindow({title:'Arquivo · M&N',width:1024,height:760,icon:path.join(__dirname,'assets/icon.png'),webPreferences:{session:attachmentSession,nodeIntegration:false,contextIsolation:true,sandbox:true}});
    const navigate=(event,url)=>{if(isAppURL(url)){event.preventDefault();void shell.openExternal(url);}};
    viewer.webContents.on('will-navigate',navigate);viewer.webContents.on('will-redirect',navigate);
    viewer.webContents.setWindowOpenHandler(({url})=>{if(/^https:\/\//.test(url))void shell.openExternal(url);return {action:'deny'};});
    void viewer.loadURL(target.href).catch(error=>{if(error.code==='ERR_ABORTED'){viewer.destroy();return;}dialog.showErrorBox('Não foi possível abrir o arquivo',error.message);viewer.destroy();});return {opened:true};
  });
  browserSession.setPermissionCheckHandler((contents,permission,origin,details)=>{trace('permission',permission,origin,contents===window.webContents);if(contents!==window.webContents||!isAppURL(origin))return false;if(permission==='media')return preferences.permissions.has(details?.mediaType);return ['display-capture','fullscreen','speaker-selection','clipboard-sanitized-write'].includes(permission);});
  browserSession.setPermissionRequestHandler(async(contents,permission,callback,details)=>{
    trace('permission request',permission,details.mediaTypes,contents===window.webContents);
    if(contents!==window.webContents||!isAppURL(details.requestingUrl||contents.getURL()))return callback(false);
    if(permission==='fullscreen')return callback(true);
    if(permission==='speaker-selection'||permission==='clipboard-sanitized-write')return callback(true);
    // This authorizes opening our picker, not a screen source. The separate
    // display handler still requires the main frame and explicit selection.
    if(permission==='display-capture')return callback(true);
    if(permission!=='media')return callback(false);
    // Chromium asks for "media" with no device types before display capture.
    // The next handler presents the explicit screen/window picker. Do not
    // mislabel this as a camera/microphone permission or block behind that dialog.
    if(Array.isArray(details.mediaTypes)&&details.mediaTypes.length===0)return callback(true);
    const types=(details.mediaTypes||['audio','video']).filter(type=>['audio','video'].includes(type));
    if(!types.length)return callback(false);
    if(types.every(type=>preferences.permissions.has(type)))return callback(true);
    const label=types.includes('video')?(types.includes('audio')?'câmera e microfone':'câmera'):'microfone';
    const answer=await dialog.showMessageBox(window,{type:'question',buttons:['Permitir','Cancelar'],defaultId:0,cancelId:1,message:'Permitir acesso ao '+label+'?',detail:'Sua escolha será lembrada neste computador. Você pode redefini-la em Configurações > Privacidade. Os controles da chamada permitem desligar quando desejar.'});
    if(answer.response===0){try{await preferences.grant(types);}catch{dialog.showErrorBox('Permissão não salva','O acesso funciona nesta sessão, mas não foi possível lembrar a escolha.');}}callback(answer.response===0);
  });
  browserSession.setDisplayMediaRequestHandler(async(request,callback)=>{
    trace('capture request',request.securityOrigin,request.frame===window.webContents.mainFrame);
    if(request.frame!==window.webContents.mainFrame||!isAppURL(request.securityOrigin)||capture)return callback({});
    const pending={id:crypto.randomUUID(),callback,sources:[],audio:request.audioRequested,timer:setTimeout(cancelCapture,60000)};capture=pending;
    try{
      const isRemote=!!remotePermit&&!remotePermit.selected&&remotePermit.expires>Date.now();pending.remote=isRemote;
      const {desktopCapturer}=require('electron'),sources=await desktopCapturer.getSources({types:['screen','window'],thumbnailSize:{width:320,height:180}});
      if(capture!==pending||window.isDestroyed())return;
      const all=sources.filter(s=>s.id!==window.getMediaSourceId()),options=isRemote?all.filter(s=>s.id.startsWith('screen:')):all;
      pending.sources=all;
      window.webContents.send('mn:capture',{id:pending.id,audio:request.audioRequested,windows:process.platform==='win32',applicationAudio:applicationAudio.capability.available,remote:isRemote,audioSources:all.filter(s=>s.id.startsWith('window:')).map(s=>({id:s.id,name:s.name})),sources:options.map(s=>({id:s.id,name:s.name,thumbnail:s.thumbnail.toDataURL()}))});
    }catch(error){trace('capture failure',error.message);if(capture===pending)cancelCapture();}
  });
  ipcMain.handle('mn:clips-configure',event=>{trusted(event);clearHotkey();return {active:false,suspended:true};});
  ipcMain.handle('mn:capture-select',async(event,choice)=>{
    trusted(event);if(!capture||choice?.id!==capture.id)return false;
    const current=capture;capture=null;clearTimeout(current.timer);
    const source=current.sources.find(s=>s.id===choice.source);
    if(!source||current.remote&&!source.id.startsWith('screen:')){current.callback({});if(current.remote)stopRemote();return {selected:false};}
    if(current.remote){if(!remotePermit||remotePermit.expires<Date.now()){current.callback({});stopRemote();return {selected:false};}try{remoteInput.select(source.display_id);remotePermit.selected=true;showRemoteNotice(remotePermit.peerName);}catch(error){current.callback({});stopRemote();return {selected:false,error:error.message};}}
    let audio=null;
    if(current.audio&&choice.audioMode==='application'){
      const target=current.sources.find(s=>s.id===(source.id.startsWith('window:')?source.id:choice.audioSource)&&s.id.startsWith('window:'));
      try{if(!target)throw Error('Escolha uma janela para o áudio isolado.');audio=await applicationAudio.start(target.id);}catch(error){current.callback({});return {selected:false,error:error.message};}
    }
    current.callback({video:source,...(current.audio&&(!current.remote&&(choice.audioMode==='system'||choice.audio===true))&&process.platform==='win32'?{audio:'loopback'}:{})});return {selected:true,audio};
  });
  ipcMain.handle('mn:folder',async event=>{
    trusted(event);const answer=await dialog.showOpenDialog(window,{title:'Pasta para salvar clipes',properties:['openDirectory','createDirectory']});
    if(answer.canceled||!answer.filePaths.length)return null;
    const id=crypto.randomUUID(),directory=answer.filePaths[0];if(folders.size>=32)folders.delete(folders.keys().next().value);folders.set(id,directory);return {native:true,id,name:path.basename(directory)};
  });
  ipcMain.handle('mn:clip-save',async(event,data)=>{
    trusted(event);const name=clipFilename(data?.filename);
    const bytes=clipBytes(data.bytes);
    let target;if(data.directory){const folder=folders.get(data.directory);if(!folder)throw Error('Escolha novamente a pasta de clipes.');target=path.join(folder,name);}
    else{const answer=await dialog.showSaveDialog(window,{title:'Salvar clipe',defaultPath:path.join(app.getPath('videos'),name),filters:[{name:'Vídeo WebM',extensions:['webm']}]});if(answer.canceled||!answer.filePath)return {canceled:true};target=answer.filePath;if(!target.toLowerCase().endsWith('.webm'))throw Error('Escolha um arquivo .webm.');}
    await writeClip(target,bytes,{overwrite:!data.directory});return {saved:true};
  });
  const icon=nativeImage.createFromPath(path.join(__dirname,'assets/icon.png')).resize({width:32,height:32});
  tray=new Tray(icon);tray.setToolTip('M&N · A Lei do Trono');tray.setContextMenu(Menu.buildFromTemplate([{label:'Abrir M&N',click:()=>{window.show();window.focus();}},{label:'Clipar',click:clip},{type:'separator'},{label:'Sair',click:()=>app.quit()}]));tray.on('double-click',()=>{window.show();window.focus();});
  Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'M&N',submenu:[{label:'Abrir site',click:()=>void shell.openExternal(APP_ORIGIN)},{type:'separator'},{label:'Sair',click:()=>app.quit()}]},{label:'Visualização',submenu:[{role:'reload'},{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'},{role:'togglefullscreen',label:'Tela cheia',accelerator:'F11'},...(!app.isPackaged?[{role:'toggleDevTools'}]:[])]}]));
  await window.loadURL(APP_ORIGIN+'/');
}
function cancelCapture(){if(!capture)return;const current=capture;capture=null;clearTimeout(current.timer);current.callback({});if(window&&!window.isDestroyed())window.webContents.send('mn:capture-cancel',{id:current.id});}
