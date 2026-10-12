'use strict';
const UPDATE_URL='https://a-lei-do-trono.surge.sh/downloads/';
function createUpdates({updater,enabled,publish,confirm,prepareInstall}){
  let state={status:enabled?'idle':'development'},checking=false,cachedReady=null;
  const set=value=>{state={...value};publish(state);};
  const failed=()=>{const fallback=cachedReady||(state.status==='ready'?state:null);if(fallback&&state.status!=='downloading'){set({...fallback,message:'Não foi possível consultar uma versão mais recente. A atualização já baixada continua pronta.'});cachedReady=null;}else set({status:'error',message:'Não foi possível verificar ou baixar a atualização. Tente novamente mais tarde.'});};
  if(enabled){
    // latest.yml identifies one complete installer; no intermediate release is required.
    updater.setFeedURL({provider:'generic',url:UPDATE_URL});updater.autoDownload=true;updater.autoInstallOnAppQuit=true;updater.disableDifferentialDownload=true;updater.allowDowngrade=false;
    updater.on('checking-for-update',()=>set({status:'checking'}));
    updater.on('update-available',info=>{cachedReady=null;set({status:'downloading',version:info.version,percent:0});});
    updater.on('download-progress',progress=>set({...state,status:'downloading',percent:Math.max(0,Math.min(100,Math.round(progress.percent||0)))}));
    updater.on('update-not-available',()=>{set(cachedReady||{status:'current'});cachedReady=null;});
    updater.on('update-downloaded',info=>set({status:'ready',version:info.version}));
    updater.on('error',failed);
  }
  return {
    get state(){return {...state};},
    async check({force=false}={}){if(!enabled)return state;if(checking||state.status==='downloading'||state.status==='ready'&&!force)return state;cachedReady=state.status==='ready'?{...state}:null;checking=true;try{await updater.checkForUpdates();}catch{failed();}finally{checking=false;}return state;},
    async install(){if(state.status!=='ready')throw Error('Nenhuma atualização pronta para instalar.');const version=state.version;if(!await confirm())return {canceled:true};if(state.status!=='ready'||state.version!==version)return {pending:true};prepareInstall();updater.quitAndInstall(false,true);return {restarting:true};}
  };
}
module.exports={createUpdates,UPDATE_URL};
