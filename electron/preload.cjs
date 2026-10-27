'use strict';
const { contextBridge, ipcRenderer } = require('electron');
const listen = (channel, fn) => {
  const handler = (_, data) => fn(data);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};
contextBridge.exposeInMainWorld('TronoDesktop', {
  version:
    process.argv.find((value) => value.startsWith('--mn-desktop-version='))?.split('=')[1] || '',
  remoteCapability: () => ipcRenderer.invoke('mn:remote-capability'),
  prepareRemoteCapture: (name) => ipcRenderer.invoke('mn:remote-prepare', name),
  allowRemoteControl: (mode = 'desktop') => ipcRenderer.invoke('mn:remote-allow', mode),
  openRemoteDriver: () => ipcRenderer.invoke('mn:remote-driver'),
  remoteInput: (token, event) => ipcRenderer.send('mn:remote-input', { token, event }),
  revokeRemoteControl: () => ipcRenderer.invoke('mn:remote-revoke'),
  stopRemote: () => ipcRenderer.invoke('mn:remote-stop'),
  onRemote: (fn) => listen('mn:remote', fn),
  notify: (value) => ipcRenderer.invoke('mn:notify', value),
  onNotificationClick: (fn) => listen('mn:notification-click', fn),
  copyDiagnostics: (text) => ipcRenderer.invoke('mn:copy-diagnostics', text),
  getResources: () => ipcRenderer.invoke('mn:resources'),
  setVoiceProtection: (active) => ipcRenderer.invoke('mn:voice-protection', active),
  getActivityState: () => ipcRenderer.invoke('mn:activity-state'),
  configureActivity: (config) => ipcRenderer.invoke('mn:activity-configure', config),
  onActivity: (fn) => listen('mn:activity', fn),
  clipsSuspended: true,
  readSession: () => ipcRenderer.invoke('mn:session-read'),
  saveSession: (value) => ipcRenderer.invoke('mn:session-save', value),
  getMediaPermissions: () => ipcRenderer.invoke('mn:media-permissions'),
  resetMediaPermissions: () => ipcRenderer.invoke('mn:media-reset'),
  prepareReplay: () => ipcRenderer.invoke('mn:replay-prepare'),
  getWindowState: () => ipcRenderer.invoke('mn:window-state'),
  toggleFullscreen: () => ipcRenderer.invoke('mn:fullscreen'),
  onWindowState: (fn) => listen('mn:window-state', fn),
  getUpdateState: () => ipcRenderer.invoke('mn:update-state'),
  onUpdateState: (fn) => listen('mn:update-state', fn),
  checkUpdates: () => ipcRenderer.invoke('mn:update-check'),
  installUpdate: () => ipcRenderer.invoke('mn:update-install'),
  onApplicationAudio: (fn) => listen('mn:application-audio', fn),
  ackApplicationAudio: (id) => ipcRenderer.send('mn:application-audio-ack', id),
  stopApplicationAudio: (id) => ipcRenderer.invoke('mn:application-audio-stop', id),
  configureClips: (configuration) => ipcRenderer.invoke('mn:clips-configure', configuration),
  onClip: (fn) => listen('mn:clip', fn),
  onCapture: (fn) => listen('mn:capture', fn),
  onCaptureCancel: (fn) => listen('mn:capture-cancel', fn),
  selectCapture: (choice) => ipcRenderer.invoke('mn:capture-select', choice),
  chooseFolder: () => ipcRenderer.invoke('mn:folder'),
  openAtalaia: () => ipcRenderer.invoke('mn:atalaia'),
  openNexus: () => ipcRenderer.invoke('mn:nexus'),
  openManual: () => ipcRenderer.invoke('mn:manual'),
  openAttachment: (choice) => ipcRenderer.invoke('mn:attachment', choice),
  saveClip: (data) => ipcRenderer.invoke('mn:clip-save', data),
});
