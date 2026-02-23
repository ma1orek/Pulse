import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('pulse', {
  // Tab management
  createTab: (url: string) => ipcRenderer.invoke('create-tab', url),
  switchTab: (id: number) => ipcRenderer.invoke('switch-tab', id),
  closeTab: (id: number) => ipcRenderer.invoke('close-tab', id),
  navigate: (url: string) => ipcRenderer.invoke('navigate', url),
  getTabs: () => ipcRenderer.invoke('get-tabs'),

  // Browser actions (from agent)
  executeAction: (action: any) => ipcRenderer.invoke('execute-action', action),

  // Screenshots
  captureScreenshot: () => ipcRenderer.invoke('capture-screenshot'),

  // Event listeners
  onTabCreated: (cb: (data: any) => void) => {
    ipcRenderer.on('tab-created', (_e, data) => cb(data));
  },
  onTabUpdated: (cb: (data: any) => void) => {
    ipcRenderer.on('tab-updated', (_e, data) => cb(data));
  },
  onTabSwitched: (cb: (data: any) => void) => {
    ipcRenderer.on('tab-switched', (_e, data) => cb(data));
  },
  onTabClosed: (cb: (data: any) => void) => {
    ipcRenderer.on('tab-closed', (_e, data) => cb(data));
  },
  onScreenshotCaptured: (cb: (base64: string) => void) => {
    ipcRenderer.on('screenshot-captured', (_e, data) => cb(data));
  },
});
