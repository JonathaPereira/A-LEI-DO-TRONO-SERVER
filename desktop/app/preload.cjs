'use strict';
const {contextBridge,ipcRenderer}=require('electron');
const listen=(channel,fn)=>{const handler=(_,data)=>fn(data);ipcRenderer.on(channel,handler);return()=>ipcRenderer.removeListener(channel,handler);};
contextBridge.exposeInMainWorld('TronoDesktop',{
  version:'0.1.0',
  configureClips:configuration=>ipcRenderer.invoke('mn:clips-configure',configuration),
  onClip:fn=>listen('mn:clip',fn),
  onCapture:fn=>listen('mn:capture',fn),
  onCaptureCancel:fn=>listen('mn:capture-cancel',fn),
  selectCapture:choice=>ipcRenderer.invoke('mn:capture-select',choice),
  chooseFolder:()=>ipcRenderer.invoke('mn:folder'),
  saveClip:data=>ipcRenderer.invoke('mn:clip-save',data)
});
