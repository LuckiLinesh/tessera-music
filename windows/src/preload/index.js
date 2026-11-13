const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tessera', {
  downloadTrack: (payload) => ipcRenderer.invoke('download:track', payload),
  pickFolder: () => ipcRenderer.invoke('download:pickFolder'),
  openPath: (p) => ipcRenderer.invoke('shell:openPath', p),
  defaultDownloadFolder: () => ipcRenderer.invoke('app:downloadsPath'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (values) => ipcRenderer.invoke('settings:set', values),
  onDownloadProgress: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('download:progress', handler);
    return () => ipcRenderer.removeListener('download:progress', handler);
  },
  onUpdateAvailable: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('update:available', handler);
    return () => ipcRenderer.removeListener('update:available', handler);
  },
  onUpdateDownloaded: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('update:downloaded', handler);
    return () => ipcRenderer.removeListener('update:downloaded', handler);
  },
  installUpdate: () => ipcRenderer.invoke('update:install'),
});
