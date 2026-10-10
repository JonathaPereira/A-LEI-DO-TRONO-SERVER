'use strict';
const {app,BrowserWindow,session,net,ipcMain,globalShortcut,dialog,Tray,Menu,nativeImage,shell}=require('electron');
const path=require('node:path'),fs=require('node:fs/promises'),crypto=require('node:crypto'),{pathToFileURL}=require('node:url');
const {APP_ORIGIN,BACKEND_ORIGIN,isAppURL,bundlePath,clipFilename,accelerator}=require('./policy.cjs');
const {clipBytes,writeClip}=require('./clip-files.cjs');
const root=app.isPackaged?path.join(process.resourcesPath,'frontend'):path.resolve(__dirname,'../../frontend');
let window,tray,quitting=false,hotkey=null,capture=null,clipActive=false;
const folders=new Map(),mediaPermissions=new Set();
const trace=(...values)=>{if(!app.isPackaged&&app.commandLine.hasSwitch('desktop-diagnostics'))console.error('[desktop]',...values);};
if(!app.requestSingleInstanceLock())app.quit();
else{
  app.on('second-instance',()=>{window?.show();window?.focus();});
  app.on('before-quit',()=>{quitting=true;globalShortcut.unregisterAll();});
  app.on('window-all-closed',()=>app.quit());
  app.whenReady().then(start).catch(error=>{dialog.showErrorBox('Não foi possível abrir o M&N',error.message);app.quit();});
}
function trusted(event){if(event.sender!==window?.webContents||event.senderFrame!==window.webContents.mainFrame||!isAppURL(event.senderFrame.url))throw Error('Desktop access denied');}
function clip(){if(clipActive&&!window?.isDestroyed())window.webContents.send('mn:clip',{id:crypto.randomUUID()});}
function clearHotkey(){if(hotkey)globalShortcut.unregister(hotkey);hotkey=null;clipActive=false;}
async function start(){
  app.setAppUserModelId('com.jonatha.mn.trono');
  const browserSession=session.fromPartition('persist:mn-trono');
  const attachmentSession=session.fromPartition('persist:mn-attachments');
  attachmentSession.setPermissionCheckHandler(()=>false);attachmentSession.setPermissionRequestHandler((_,__,callback)=>callback(false));
  // This partition contains only the installed UI. External frames are blocked
  // by CSP and all popups get a separate, unprivileged network session.
  let testAPI=null;
  if(!app.isPackaged){try{const candidate=new URL(app.commandLine.getSwitchValue('desktop-api-test-origin'));if(candidate.protocol==='https:'&&candidate.hostname==='127.0.0.1')testAPI=candidate.origin;}catch{}}
  // Local, versioned UI uses the existing origin for API/WS compatibility.
  // Every request to this origin is served only from the installed bundle.
  // There is no remote-site fallback with desktop privileges.
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
    try{
      const file=bundlePath(root,request.url),real=await fs.realpath(file),realRoot=await fs.realpath(root);
      if(!real.startsWith(realRoot+path.sep))return new Response('',{status:403});
      const response=await net.fetch(pathToFileURL(real).href),headers=new Headers(response.headers);
      headers.set('Cache-Control','no-store');
      headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' blob: https:; connect-src 'self' https: wss: http://127.0.0.1:* ws://127.0.0.1:*; worker-src 'self' blob:; frame-src 'self' blob:; object-src 'none'");
      return new Response(request.method==='HEAD'?null:response.body,{status:response.status,headers});
    }catch{return new Response('Arquivo local indisponível.',{status:404});}
  });
  window=new BrowserWindow({title:'M&N · A Lei do Trono',icon:path.join(__dirname,'assets/icon.png'),width:1440,height:960,minWidth:960,minHeight:640,show:false,backgroundColor:'#141727',webPreferences:{session:browserSession,preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false}});
  window.on('ready-to-show',()=>window.show());
  window.on('close',event=>{if(tray&&!quitting){event.preventDefault();window.hide();}});
  window.webContents.on('will-prevent-unload',event=>{
    const response=dialog.showMessageBoxSync(window,{type:'question',buttons:['Continuar no app','Sair'],defaultId:0,cancelId:0,message:'Encerrar o M&N?',detail:'A chamada e o buffer de replay serão encerrados. Clipes já armazenados na biblioteca local permanecem; clipes somente na memória podem ser perdidos.'});
    if(response===1)event.preventDefault();else quitting=false;
  });
  window.webContents.on('render-process-gone',()=>{clearHotkey();cancelCapture();});
  window.webContents.on('did-start-navigation',(_,url,isInPlace,isMainFrame)=>{if(isMainFrame&&!isInPlace){clearHotkey();cancelCapture();}});
  window.webContents.on('will-navigate',(event,url)=>{if(!isAppURL(url)){event.preventDefault();if(/^https:\/\//.test(url))void shell.openExternal(url);}});
  window.webContents.on('will-attach-webview',event=>event.preventDefault());
  // window.open inherits the opener's Chromium partition, even with some
  // BrowserWindow overrides. File viewers are created through the fixed IPC
  // below, so foreign content never enters the app's API network partition.
  window.webContents.setWindowOpenHandler(({url})=>{if(/^https:\/\//.test(url))void shell.openExternal(url);return {action:'deny'};});
  ipcMain.handle('mn:attachment',(event,choice)=>{
    trusted(event);if(typeof choice?.url!=='string'||choice.url.length>16384)throw Error('Link de arquivo inválido.');
    const target=new URL(choice.url);if(target.protocol!=='https:'||target.username||target.password||isAppURL(target.href))throw Error('Link de arquivo inválido.');
    const viewer=new BrowserWindow({title:'Arquivo · M&N',width:1024,height:760,icon:path.join(__dirname,'assets/icon.png'),webPreferences:{session:attachmentSession,nodeIntegration:false,contextIsolation:true,sandbox:true}});
    const navigate=(event,url)=>{if(isAppURL(url)){event.preventDefault();void shell.openExternal(url);}};
    viewer.webContents.on('will-navigate',navigate);viewer.webContents.on('will-redirect',navigate);
    viewer.webContents.setWindowOpenHandler(({url})=>{if(/^https:\/\//.test(url))void shell.openExternal(url);return {action:'deny'};});
    void viewer.loadURL(target.href).catch(error=>{if(error.code==='ERR_ABORTED'){viewer.destroy();return;}dialog.showErrorBox('Não foi possível abrir o arquivo',error.message);viewer.destroy();});return {opened:true};
  });
  browserSession.setPermissionCheckHandler((contents,permission,origin)=>{trace('permission',permission,origin,contents===window.webContents);return contents===window.webContents&&isAppURL(origin)&&['media','display-capture','fullscreen','speaker-selection','clipboard-sanitized-write'].includes(permission);});
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
    const types=details.mediaTypes||['audio','video'],key=types.slice().sort().join(',');
    if(mediaPermissions.has(key))return callback(true);
    const label=types.includes('video')?'câmera e microfone':'microfone';
    const answer=await dialog.showMessageBox(window,{type:'question',buttons:['Permitir','Cancelar'],defaultId:0,cancelId:1,message:'Permitir acesso ao '+label+'?',detail:'Usado pela voz e câmera do M&N. Os controles da chamada permitem desligar quando desejar.'});
    if(answer.response===0)mediaPermissions.add(key);callback(answer.response===0);
  });
  browserSession.setDisplayMediaRequestHandler(async(request,callback)=>{
    trace('capture request',request.securityOrigin,request.frame===window.webContents.mainFrame);
    if(request.frame!==window.webContents.mainFrame||!isAppURL(request.securityOrigin)||capture)return callback({});
    const pending={id:crypto.randomUUID(),callback,sources:[],audio:request.audioRequested,timer:setTimeout(cancelCapture,60000)};capture=pending;
    try{
      const {desktopCapturer}=require('electron'),sources=await desktopCapturer.getSources({types:['screen','window'],thumbnailSize:{width:320,height:180}});
      if(capture!==pending||window.isDestroyed())return;
      const options=sources.filter(s=>s.id!==window.getMediaSourceId());
      pending.sources=options;
      window.webContents.send('mn:capture',{id:pending.id,audio:request.audioRequested,windows:process.platform==='win32',sources:options.map(s=>({id:s.id,name:s.name,thumbnail:s.thumbnail.toDataURL()}))});
    }catch(error){trace('capture failure',error.message);if(capture===pending)cancelCapture();}
  });
  ipcMain.handle('mn:clips-configure',(event,configuration)=>{
    trusted(event);clearHotkey();if(configuration?.active!==true)return {active:false};
    try{const chosen=accelerator(configuration.shortcut);if(!globalShortcut.register(chosen,clip))return {active:false,error:'Atalho ocupado. Escolha outro nas preferências.'};hotkey=chosen;clipActive=true;return {active:true,shortcut:chosen};}
    catch(error){return {active:false,error:error.message};}
  });
  ipcMain.handle('mn:capture-select',(event,choice)=>{
    trusted(event);if(!capture||choice?.id!==capture.id)return false;
    const current=capture;capture=null;clearTimeout(current.timer);
    const source=current.sources.find(s=>s.id===choice.source);
    current.callback(source?{video:source,...(current.audio&&choice.audio===true&&process.platform==='win32'?{audio:'loopback'}:{})}:{});return !!source;
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
  Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'M&N',submenu:[{label:'Abrir site',click:()=>void shell.openExternal(APP_ORIGIN)},{type:'separator'},{label:'Sair',click:()=>app.quit()}]},{label:'Visualização',submenu:[{role:'reload'},{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'},{role:'togglefullscreen'},...(!app.isPackaged?[{role:'toggleDevTools'}]:[])]}]));
  await window.loadURL(APP_ORIGIN+'/');
}
function cancelCapture(){if(!capture)return;const current=capture;capture=null;clearTimeout(current.timer);current.callback({});if(window&&!window.isDestroyed())window.webContents.send('mn:capture-cancel',{id:current.id});}
