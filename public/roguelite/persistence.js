(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.AbyssPersistence=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const finite=(v,max)=>Number.isFinite(v)&&v>=0&&v<=max;
  function cleanRecord(r){if(!r||typeof r.name!=='string'||!['easy','normal','hard'].includes(r.difficulty)||!finite(r.wave,10000)||!finite(r.kills,1e7))return null;return {edition:String(r.edition||'0.5').slice(0,8),name:r.name.trim().slice(0,20)||'Andarilho',difficulty:r.difficulty,wave:Math.floor(r.wave),reached:Math.floor(finite(r.reached,10001)?r.reached:r.wave),kills:Math.floor(r.kills),score:finite(r.score,1e10)?Math.round(r.score):0,time:finite(r.time,1e8)?Math.round(r.time):0,seed:String(r.seed||'').slice(0,64),date:String(r.date||'').slice(0,40)};}
  const compare=(a,b)=>b.wave-a.wave||b.reached-a.reached||b.kills-a.kills||b.score-a.score;
  function mergeRecords(records,newRecords=[]){const best=new Map();for(const item of [...records,...newRecords]){const r=cleanRecord(item);if(!r)continue;const key=r.edition+'|'+r.difficulty+'|'+r.name.toLocaleLowerCase('pt-BR');const old=best.get(key);if(!old||compare(r,old)<0)best.set(key,r);}return [...best.values()].sort(compare).slice(0,150);}
  function backup(scores,checkpoint){return JSON.stringify({format:'cinzas-save',version:1,created:new Date().toISOString(),scores:mergeRecords(scores),checkpoint:checkpoint||null},null,2);}
  function parseBackup(text){if(typeof text!=='string'||text.length>2e6)return null;try{const data=JSON.parse(text);if(data.format!=='cinzas-save'||data.version!==1||!Array.isArray(data.scores)||data.scores.length>150)return null;return {scores:mergeRecords(data.scores),checkpoint:data.checkpoint||null};}catch{return null;}}
  return {cleanRecord,compare,mergeRecords,backup,parseBackup};
});
