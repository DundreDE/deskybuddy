const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('buddyAPI', {
  notifyHitTest: (overDragon) => ipcRenderer.send('hit-test-changed', { overDragon }),
  startDrag: (offsetX, offsetY) => ipcRenderer.send('drag-start', { offsetX, offsetY }),
  endDrag: () => ipcRenderer.send('drag-end'),
  requestContextMenu: (x, y) => ipcRenderer.send('context-menu-request', { x, y }),
  reportStatEvent: (type) => ipcRenderer.send('stat-event', { type }),
  setSleeping: (sleeping) => ipcRenderer.send('sleep-state-changed', { sleeping }),
  quit: () => ipcRenderer.send('quit-app'),

  loadState: () => ipcRenderer.invoke('load-state'),
  loadStrings: () => ipcRenderer.invoke('load-strings'),

  onTriggerAction: (callback) => {
    ipcRenderer.on('trigger-action', (_event, payload) => callback(payload));
  },
  onWalkCommand: (callback) => {
    ipcRenderer.on('walk-command', (_event, payload) => callback(payload));
  },
  onLanding: (callback) => {
    ipcRenderer.on('landing', (_event, payload) => callback(payload));
  },
  onInitConfig: (callback) => {
    ipcRenderer.on('init-config', (_event, payload) => callback(payload));
  },
  onCursorUpdate: (callback) => {
    ipcRenderer.on('cursor-update', (_event, payload) => callback(payload));
  },
  onContextUpdate: (callback) => {
    ipcRenderer.on('context-update', (_event, payload) => callback(payload));
  },
  onDisplayChanged: (callback) => {
    ipcRenderer.on('display-changed', (_event, payload) => callback(payload));
  },
  onCharacterUpdate: (callback) => {
    ipcRenderer.on('character-updated', (_event, payload) => callback(payload));
  },
  onCollarColorUpdate: (callback) => {
    ipcRenderer.on('collar-color-updated', (_event, payload) => callback(payload));
  },
  onDayModeUpdate: (callback) => {
    ipcRenderer.on('day-mode-updated', (_event, payload) => callback(payload));
  },
  onIdleConfigUpdate: (callback) => {
    ipcRenderer.on('idle-config-updated', (_event, payload) => callback(payload));
  },
  onPowerSaveUpdate: (callback) => {
    ipcRenderer.on('power-save-updated', (_event, payload) => callback(payload));
  },
  onShowOnboarding: (callback) => {
    ipcRenderer.on('show-onboarding', () => callback());
  },
  onLanguageUpdate: (callback) => {
    ipcRenderer.on('language-updated', (_event, payload) => callback(payload));
  },
  onStatsUpdate: (callback) => {
    ipcRenderer.on('stats-updated', (_event, payload) => callback(payload));
  },
});
