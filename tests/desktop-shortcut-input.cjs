'use strict';
const {spawn}=require('node:child_process'),path=require('node:path');
// Real SendInput on the disposable Windows desktop; never invoke the app callback.
function pressClipShortcut(){
 return new Promise((resolve,reject)=>{
  const child=spawn(path.resolve('artifacts/native-audio/Release/MN-Remote-Input.exe'),['--desktop'],{windowsHide:true,stdio:['pipe','pipe','pipe']});let output='',ready=false,settled=false;
  const timer=setTimeout(()=>{child.kill();finish(Error('Windows shortcut injection timed out.'));},10000);
  function finish(error){if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve();}
  child.on('error',finish);child.stdin.on('error',finish);
  child.stdout.on('data',data=>{output+=data.toString();if(!ready&&output.includes('READY desktop')){ready=true;child.stdin.end('k 162 1\nk 160 1\nk 88 1\nk 88 0\nk 160 0\nk 162 0\nq\n');}});
  child.on('close',code=>finish(code===0&&ready?null:Error('Native shortcut injection failed: '+code)));
 });
}
module.exports={pressClipShortcut};
