'use strict';
const path=require('node:path');
const APP_ORIGIN='https://a-lei-do-trono.surge.sh';
function isAppURL(value){try{return new URL(value).origin===APP_ORIGIN;}catch{return false;}}
function bundlePath(root,url){
  if(!isAppURL(url))throw Error('Invalid application origin');
  const pathname=decodeURIComponent(new URL(url).pathname);
  if(pathname.includes('\0')||pathname.includes('\\'))throw Error('Invalid bundle path');
  const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(file!==root&&!file.startsWith(path.resolve(root)+path.sep))throw Error('Invalid bundle path');
  return file;
}
function clipFilename(value){if(typeof value!=='string'||value.length>160||!/^Trono_Clipe_[a-zA-Z0-9_-]+\.webm$/.test(value))throw Error('Nome de clipe inválido.');return value;}
function accelerator(value){
  if(!value||typeof value!=='object'||!/^Key[A-Z]$|^Digit[0-9]$|^F([1-9]|1[0-9]|2[0-4])$/.test(value.code||''))throw Error('Atalho inválido.');
  const {code}=value;
  if(['F5','F11','F12'].includes(code)||(value.ctrl||value.meta)&&['KeyR','KeyW','KeyT','KeyL','KeyN','KeyP'].includes(code)||value.alt&&code==='F4')throw Error('Escolha outro atalho.');
  if(!value.ctrl&&!value.alt&&!value.meta&&!/^F/.test(code))throw Error('Use Ctrl/Alt/Win com uma tecla ou uma tecla F livre.');
  return [value.ctrl?'Control':'',value.alt?'Alt':'',value.shift?'Shift':'',value.meta?'Super':'',code.replace(/^Key|^Digit/,'')].filter(Boolean).join('+');
}
module.exports={APP_ORIGIN,isAppURL,bundlePath,clipFilename,accelerator};
