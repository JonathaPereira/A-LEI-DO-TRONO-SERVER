'use strict';
const {spawn}=require('node:child_process'),path=require('node:path');
// Real SendInput on the disposable Windows desktop; never invoke the app callback.
function sendDesktopInput(commands){
 return new Promise((resolve,reject)=>{
  const child=spawn(path.resolve('artifacts/native-audio/Release/MN-Remote-Input.exe'),['--desktop'],{windowsHide:true,stdio:['pipe','pipe','pipe']});let output='',ready=false,settled=false;
  const timer=setTimeout(()=>{child.kill();finish(Error('Windows shortcut injection timed out.'));},10000);
  function finish(error){if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve();}
  child.on('error',finish);child.stdin.on('error',finish);
  child.stdout.on('data',data=>{output+=data.toString();if(!ready&&output.includes('READY desktop')){ready=true;child.stdin.end(commands+'q\n');}});
  child.on('close',code=>finish(code===0&&ready?null:Error('Native shortcut injection failed: '+code)));
 });
}
function pressClipShortcut(){return sendDesktopInput('k 162 1\nk 160 1\nk 88 1\nk 88 0\nk 160 0\nk 162 0\n');}
function clickDesktop({x,y}){return sendDesktopInput(`m ${Math.round(x)} ${Math.round(y)}\nb 0 1\nb 0 0\n`);}
module.exports={pressClipShortcut,clickDesktop};
