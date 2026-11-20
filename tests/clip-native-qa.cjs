'use strict';
/** Runs in the separate, disposable Electron target. Contains no Trono runtime. */
function nativeAudioQA(html, helper) {
  const {app,BrowserWindow}=require('electron');
  const {spawn}=require('node:child_process');
  app.setName('Trono QA Audio');
  const tone=spawn(helper,['--test-tone','440'],{windowsHide:true,stdio:['pipe','pipe','pipe']});
  tone.stdin.on('error',()=>{});
  global.qaToneStatus=new Promise(resolve=>{
    let log='',done=false;
    const finish=status=>{if(done)return;done=true;clearTimeout(timer);resolve(status);};
    const timer=setTimeout(()=>finish({type:'error',code:'timeout'}),10000);
    timer.unref();
    tone.stderr.on('data',data=>{
      log+=data;const end=log.indexOf('\n');
      if(end<0)return;
      try{finish(JSON.parse(log.slice(0,end)));}catch{finish({type:'error',code:'invalid-status'});}
    });
    tone.once('error',error=>finish({type:'error',code:error.code}));
    tone.once('close',()=>finish({type:'error',code:'closed'}));
  });
  app.whenReady().then(()=>{
    global.window=new BrowserWindow({width:640,height:420,title:'QA clipes locais',webPreferences:{contextIsolation:true,nodeIntegration:false}});
    return window.loadURL('data:text/html,'+encodeURIComponent(html));
  });
  app.on('window-all-closed',()=>app.quit());
  app.once('will-quit',()=>{tone.stdin.end('q');tone.kill();});
}
function nativeQAProgram(html, helper) {
  return '('+nativeAudioQA.toString()+')('+JSON.stringify(html)+','+JSON.stringify(helper)+');';
}
module.exports={nativeQAProgram};
