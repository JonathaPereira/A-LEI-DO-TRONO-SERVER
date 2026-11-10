(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.AbyssPersistence=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const finite=(v,max)=>Number.isFinite(v)&&v>=0&&v<=max;
  function cleanRecord(r){if(!r||typeof r.name!=='string'||!['easy','normal','hard'].includes(r.difficulty)||!finite(r.wave,10000)||!finite(r.kills,1e7))return null;return {edition:String(r.edition||'0.5').slice(0,8),name:r.name.trim().slice(0,20)||'Andarilho',difficulty:r.difficulty,wave:Math.floor(r.wave),reached:Math.floor(finite(r.reached,10001)?r.reached:r.wave),kills:Math.floor(r.kills),score:finite(r.score,1e10)?Math.round(r.score):0,time:finite(r.time,1e8)?Math.round(r.time):0,seed:String(r.seed||'').slice(0,64),date:String(r.date||'').slice(0,40)};}
  const compare=(a,b)=>b.wave-a.wave||b.reached-a.reached||b.kills-a.kills||b.score-a.score;
  function mergeRecords(records,newRecords=[]){const best=new Map();for(const item of [...records,...newRecords]){const r=cleanRecord(item);if(!r)continue;const key=r.edition+'|'+r.difficulty+'|'+r.name.toLocaleLowerCase('pt-BR');const old=best.get(key);if(!old||compare(r,old)<0)best.set(key,r);}return [...best.values()].sort(compare).slice(0,150);}
  const legacyMilestones=Object.freeze({blade:3,bow:5,hammer:10,staff:15});
  const {CHAPTERS,RUNES,WEAPON_VARIANTS}=typeof module==='object'&&module.exports?require('./levels.js'):globalThis.AbyssLevels;
  const chapterLimit=CHAPTERS.length;
  function cleanLegacy(value){
    if(value==null)return {version:1,cleared:0,weapon:''};
    if(value.version!==1||!Number.isInteger(value.cleared)||!finite(value.cleared,chapterLimit)||typeof value.weapon!=='string')return null;
    if(value.weapon&&(!Object.hasOwn(legacyMilestones,value.weapon)||value.cleared<legacyMilestones[value.weapon]))return null;
    if(value.rune!==undefined&&(typeof value.rune!=='string'||value.rune&&(!Object.hasOwn(RUNES,value.rune)||value.cleared<RUNES[value.rune].chapter)))return null;
    if(value.variant!==undefined&&(!Object.hasOwn(WEAPON_VARIANTS,value.variant)||WEAPON_VARIANTS[value.variant].weapon!==value.weapon||value.cleared<WEAPON_VARIANTS[value.variant].chapter))return null;
    return {version:1,cleared:value.cleared,weapon:value.weapon,...(value.rune?{rune:value.rune}:{}),...(value.variant?{variant:value.variant}:{})};
  }
  function updateLegacy(value,checkpoint){
    const previous=cleanLegacy(value)||cleanLegacy(null);
    if(checkpoint?.format!=='cinzas-campaign'||!Number.isInteger(checkpoint.completedChapters)||!finite(checkpoint.completedChapters,chapterLimit))return previous;
    return {...previous,cleared:Math.max(previous.cleared,checkpoint.completedChapters)};
  }
  function selectLegacy(value,weapon){
    const previous=cleanLegacy(value);
    if(!previous)return null;
    const next={...previous,weapon};
    delete next.variant;
    if(Object.hasOwn(WEAPON_VARIANTS,weapon)){
      next.weapon=WEAPON_VARIANTS[weapon].weapon;
      next.variant=weapon;
    }
    return cleanLegacy(next);
  }
  function selectRune(value,rune){
    const previous=cleanLegacy(value);
    return previous&&cleanLegacy({...previous,rune});
  }
  function achievements(legacy,scores=[]){
    const cleared=updateLegacy(legacy).cleared;
    const waves=Math.max(0,...mergeRecords(Array.isArray(scores)?scores:[]).filter(record=>record.edition==='0.5').map(record=>record.wave));
    return [
      ['ember','A primeira chama','Conclua um capítulo da Expedição.',cleared,1],
      ['forest','Além da floresta','Conclua os cinco capítulos da Floresta.',cleared,5],
      ['crypt','O silêncio das criptas','Conclua dez capítulos da Expedição.',cleared,10],
      ['forge','Atravesse a fornalha','Conclua 15 capítulos da Expedição.',cleared,15],
      ['glacier','Uma chama nas geleiras','Conclua 20 capítulos da Expedição.',cleared,20],
      ['dawn','O último alvorecer','Conclua os 25 capítulos da Expedição.',cleared,25],
      ['horde_guardian','Vigília contra a Horda','Conclua cinco ondas da Horda nesta edição.',waves,5],
      ['horde_twenty','O abismo insiste','Conclua 20 ondas da Horda nesta edição.',waves,20]
    ].map(([id,title,hint,current,goal])=>({id,title,hint,current:Math.min(current,goal),goal,unlocked:current>=goal}));
  }
  function mergeLegacy(current,imported){
    const left=cleanLegacy(current)||cleanLegacy(null),right=cleanLegacy(imported)||cleanLegacy(null);
    const rune=left.rune||right.rune,preference=left.weapon?left:right;
    return {version:1,cleared:Math.max(left.cleared,right.cleared),weapon:preference.weapon,...(rune?{rune}:{}),...(preference.variant?{variant:preference.variant}:{})};
  }
  function backup(scores,checkpoint,campaignCheckpoint=null,legacy=null){
    const profile=legacy==null?null:cleanLegacy(legacy);
    return JSON.stringify({
      format:'cinzas-save',version:profile?3:2,created:new Date().toISOString(),
      scores:mergeRecords(scores),checkpoint:checkpoint||null,campaignCheckpoint:campaignCheckpoint||null,
      ...(profile?{legacy:profile}:{})
    },null,2);
  }
  function parseBackup(text){
    if(typeof text!=='string'||text.length>2e6)return null;
    try{
      const data=JSON.parse(text);
      if(data.format!=='cinzas-save'||![1,2,3].includes(data.version)||!Array.isArray(data.scores)||data.scores.length>150)return null;
      const result={scores:mergeRecords(data.scores),checkpoint:data.checkpoint??null,campaignCheckpoint:data.version>=2?data.campaignCheckpoint??null:null};
      if(data.version===3){
        const legacy=data.legacy&&cleanLegacy(data.legacy);
        if(!legacy)return null;
        result.legacy=legacy;
      }
      return result;
    }catch{return null;}
  }
  return {cleanRecord,compare,mergeRecords,backup,parseBackup,legacyMilestones,cleanLegacy,updateLegacy,selectLegacy,selectRune,mergeLegacy,achievements};
});
