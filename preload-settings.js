const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('settingsAPI', {
  loadSettings: () => ipcRenderer.invoke('load-settings'),
  saveSettings: (settings) => ipcRenderer.send('save-settings', { settings }),
  onSettingsUpdated: (callback) => {
    ipcRenderer.on('settings-updated', (_event, payload) => callback(payload));
  },
  getPowerSave: () => ipcRenderer.invoke('get-power-save'),
  setPowerSave: (enabled) => ipcRenderer.send('set-power-save', { enabled }),
  onPowerSaveUpdate: (callback) => {
    ipcRenderer.on('power-save-updated', (_event, payload) => callback(payload));
  },
  loadStrings: () => ipcRenderer.invoke('load-strings'),
  onLanguageUpdate: (callback) => {
    ipcRenderer.on('language-updated', (_event, payload) => callback(payload));
  },
});
