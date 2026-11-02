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
function foregroundPid(){
 const script=`Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class ClipQAForeground { [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow(); [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid); }'; [uint32]$clipOwnerPid=0; [ClipQAForeground]::GetWindowThreadProcessId([ClipQAForeground]::GetForegroundWindow(),[ref]$clipOwnerPid) | Out-Null; Write-Output $clipOwnerPid`;
 return new Promise((resolve,reject)=>{const {execFile}=require('node:child_process');execFile('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,timeout:10000},(error,out)=>{if(error)return reject(error);const pid=Number(out.trim());Number.isInteger(pid)&&pid>0?resolve(pid):reject(Error('Windows did not report a foreground process: '+out));});});
}
module.exports={pressClipShortcut,clickDesktop,foregroundPid};
