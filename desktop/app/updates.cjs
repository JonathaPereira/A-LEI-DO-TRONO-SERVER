'use strict';
const UPDATE_URL='https://a-lei-do-trono.surge.sh/downloads/';
function createUpdates({updater,enabled,publish,confirm,prepareInstall}){
  let state={status:enabled?'idle':'development'},checking=false;
  const set=value=>{state={...value};publish(state);};
  if(enabled){
    updater.setFeedURL({provider:'generic',url:UPDATE_URL});updater.autoDownload=true;updater.autoInstallOnAppQuit=true;updater.disableDifferentialDownload=true;
    updater.on('checking-for-update',()=>set({status:'checking'}));
    updater.on('update-available',info=>set({status:'downloading',version:info.version,percent:0}));
    updater.on('download-progress',progress=>set({status:'downloading',percent:Math.max(0,Math.min(100,Math.round(progress.percent||0)))}));
    updater.on('update-not-available',()=>set({status:'current'}));
    updater.on('update-downloaded',info=>set({status:'ready',version:info.version}));
    updater.on('error',()=>set({status:'error',message:'Não foi possível verificar ou baixar a atualização. Tente novamente mais tarde.'}));
  }
  return {
    get state(){return {...state};},
    async check(){if(!enabled)return state;if(checking||['ready','downloading'].includes(state.status))return state;checking=true;try{await updater.checkForUpdates();}catch{set({status:'error',message:'Não foi possível verificar ou baixar a atualização. Tente novamente mais tarde.'});}finally{checking=false;}return state;},
    async install(){if(state.status!=='ready')throw Error('Nenhuma atualização pronta para instalar.');if(!await confirm())return {canceled:true};prepareInstall();updater.quitAndInstall(false,true);return {restarting:true};}
  };
}
module.exports={createUpdates,UPDATE_URL};
