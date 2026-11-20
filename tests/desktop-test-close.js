'use strict';
const {spawnSync}=require('node:child_process');
function killTestApp(app){
  if(!app)return;
  const child=app.process();
  // Kill only this test's Electron process tree; terminating the parent alone
  // on Windows can leave renderer processes holding Playwright's IPC pipes.
  if(process.platform==='win32')spawnSync('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore',timeout:10000});
  else child.kill();
}
async function closeTestApp(app){
  if(!app)return;let timer;
  try{await Promise.race([app.close().catch(()=>killTestApp(app)),new Promise(resolve=>{timer=setTimeout(()=>{console.log('Test cleanup: terminating the remaining Electron process tree.');killTestApp(app);resolve();},5000);})]);}
  finally{clearTimeout(timer);}
}
module.exports={killTestApp,closeTestApp};
