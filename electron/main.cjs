const { app, BrowserWindow, Tray, Menu, nativeImage, Notification, ipcMain, shell } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

const APP_ID = 'com.liniya.desktop'
const isDev = !app.isPackaged
const devUrl = 'http://127.0.0.1:5173/'
const maxTimerDelay = 2_147_000_000

let mainWindow = null
let tray = null
let isQuitting = false
let reminderTimers = new Map()
let desktopSettings = { launchAtLogin: false, closeToTray: true }
let reminderState = { items: [], fired: [] }

const dataFile = () => path.join(app.getPath('userData'), 'desktop-state.json')

function readState() {
  try {
    const value = JSON.parse(fs.readFileSync(dataFile(), 'utf8'))
    if (value && typeof value === 'object') {
      desktopSettings = {
        launchAtLogin: Boolean(value.desktopSettings?.launchAtLogin),
        closeToTray: value.desktopSettings?.closeToTray !== false,
      }
      reminderState = {
        items: Array.isArray(value.reminders?.items) ? value.reminders.items : [],
        fired: Array.isArray(value.reminders?.fired) ? value.reminders.fired : [],
      }
    }
  } catch {
    // A first launch or a damaged optional settings file should not block startup.
  }
}

function writeState() {
  try {
    fs.mkdirSync(path.dirname(dataFile()), { recursive: true })
    fs.writeFileSync(dataFile(), JSON.stringify({ desktopSettings, reminders: reminderState }, null, 2), 'utf8')
  } catch (error) {
    console.error('Не удалось сохранить настройки Линии:', error)
  }
}

function applyLaunchAtLogin(enabled) {
  desktopSettings.launchAtLogin = Boolean(enabled)
  if (process.platform === 'win32') {
    app.setLoginItemSettings({
      openAtLogin: desktopSettings.launchAtLogin,
      path: process.execPath,
      args: ['--hidden'],
    })
  }
  writeState()
}

function showWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) createWindow()
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function loadPackagedImage(filename) {
  try {
    return nativeImage.createFromBuffer(fs.readFileSync(path.join(__dirname, filename)))
  } catch {
    return nativeImage.createEmpty()
  }
}

function createTray() {
  if (tray) return
  const icon = loadPackagedImage('tray.png')
  tray = new Tray(icon)
  tray.setToolTip('Линия — пространство задач')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Открыть Линию', click: showWindow },
    { type: 'separator' },
    {
      label: 'Запускать вместе с Windows',
      type: 'checkbox',
      checked: desktopSettings.launchAtLogin,
      click: (item) => applyLaunchAtLogin(item.checked),
    },
    {
      label: 'Сворачивать в трей',
      type: 'checkbox',
      checked: desktopSettings.closeToTray,
      click: (item) => {
        desktopSettings.closeToTray = item.checked
        writeState()
      },
    },
    { type: 'separator' },
    { label: 'Полностью выйти', click: () => { isQuitting = true; app.quit() } },
  ]))
  tray.on('click', showWindow)
  tray.on('double-click', showWindow)
}

function fireReminder(item) {
  if (!Notification.isSupported()) return
  const notification = new Notification({
    title: item.title || 'Напоминание',
    body: item.chainTitle ? `Цепочка: ${item.chainTitle}` : 'Пора вернуться к своей задаче.',
    silent: false,
    timeoutType: 'default',
  })
  notification.on('click', showWindow)
  notification.show()
}

function markFired(item) {
  const key = `${item.id}|${item.reminderAt}`
  if (!reminderState.fired.includes(key)) reminderState.fired.push(key)
  writeState()
}

function scheduleOne(item) {
  if (!item || typeof item.id !== 'string' || typeof item.reminderAt !== 'string') return
  const timestamp = new Date(item.reminderAt).getTime()
  if (!Number.isFinite(timestamp)) return
  const key = `${item.id}|${item.reminderAt}`
  if (reminderState.fired.includes(key)) return

  const delay = timestamp - Date.now()
  if (delay <= 0) {
    // Notify about recently missed reminders once, but don't flood the user with old items.
    if (delay > -24 * 60 * 60 * 1000) fireReminder(item)
    markFired(item)
    return
  }

  const timeout = Math.min(delay, maxTimerDelay)
  const timer = setTimeout(() => {
    reminderTimers.delete(key)
    if (delay > maxTimerDelay) scheduleOne(item)
    else {
      fireReminder(item)
      markFired(item)
    }
  }, timeout)
  reminderTimers.set(key, timer)
}

function syncReminders(items) {
  for (const timer of reminderTimers.values()) clearTimeout(timer)
  reminderTimers.clear()

  const incoming = Array.isArray(items) ? items.filter((item) =>
    item && typeof item.id === 'string' && typeof item.title === 'string' &&
    typeof item.reminderAt === 'string' && item.reminderAt.length > 0,
  ) : []
  const oldById = new Map(reminderState.items.map((item) => [item.id, item.reminderAt]))
  const incomingById = new Map(incoming.map((item) => [item.id, item.reminderAt]))

  // Changing a reminder time makes it a new reminder, even if its task ID stays the same.
  reminderState.fired = reminderState.fired.filter((key) => {
    const separator = key.lastIndexOf('|')
    const id = key.slice(0, separator)
    const timestamp = key.slice(separator + 1)
    return incomingById.get(id) === timestamp && oldById.get(id) === timestamp
  })
  reminderState.items = incoming
  writeState()
  for (const item of incoming) scheduleOne(item)
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 980,
    minHeight: 680,
    show: false,
    backgroundColor: '#f7f7fb',
    title: 'Линия',
    icon: loadPackagedImage('app-icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.on('minimize', (event) => {
    if (desktopSettings.closeToTray && !isQuitting) {
      event.preventDefault()
      mainWindow.hide()
    }
  })

  mainWindow.on('close', (event) => {
    if (desktopSettings.closeToTray && !isQuitting) {
      event.preventDefault()
      mainWindow.hide()
    }
  })

  mainWindow.on('closed', () => { mainWindow = null })

  if (isDev) mainWindow.loadURL(devUrl)
  else mainWindow.loadFile(path.join(app.getAppPath(), 'dist', 'index.html'))

  const startedHidden = process.argv.includes('--hidden')
  mainWindow.once('ready-to-show', () => {
    if (!startedHidden) mainWindow.show()
  })
}

const hasSingleInstanceLock = app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => showWindow())

  app.whenReady().then(() => {
    app.setAppUserModelId(APP_ID)
    readState()
    if (desktopSettings.launchAtLogin && process.platform === 'win32') applyLaunchAtLogin(true)
    createTray()
    createWindow()

    ipcMain.handle('liniya:get-settings', () => ({ ...desktopSettings }))
    ipcMain.handle('liniya:set-preferences', (_event, preferences) => {
      if (preferences && typeof preferences === 'object') {
        if (typeof preferences.launchAtLogin === 'boolean') applyLaunchAtLogin(preferences.launchAtLogin)
        if (typeof preferences.closeToTray === 'boolean') desktopSettings.closeToTray = preferences.closeToTray
        writeState()
      }
      // Rebuild the tray menu so its checkboxes always match the settings page.
      if (tray) {
        tray.destroy()
        tray = null
        createTray()
      }
      return { ...desktopSettings }
    })
    ipcMain.on('liniya:sync-reminders', (_event, items) => syncReminders(items))
    ipcMain.handle('liniya:test-notification', () => {
      if (!Notification.isSupported()) return { ok: false, message: 'Системные уведомления недоступны.' }
      fireReminder({ title: 'Линия работает', chainTitle: 'Тестовое уведомление' })
      return { ok: true }
    })

    // The reminders persisted by the renderer are restored before the window is used.
    syncReminders(reminderState.items)
  })

  app.on('before-quit', () => { isQuitting = true })
  app.on('window-all-closed', () => {
    if (!desktopSettings.closeToTray) {
      isQuitting = true
      app.quit()
    }
  })
  app.on('activate', showWindow)
}
