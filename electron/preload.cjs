const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('liniyaDesktop', {
  isDesktop: true,
  platform: process.platform,
  getSettings: () => ipcRenderer.invoke('liniya:get-settings'),
  setPreferences: (preferences) => ipcRenderer.invoke('liniya:set-preferences', preferences),
  syncReminders: (reminders) => ipcRenderer.send('liniya:sync-reminders', reminders),
  testNotification: () => ipcRenderer.invoke('liniya:test-notification'),
})
