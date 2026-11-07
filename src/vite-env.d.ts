/// <reference types="vite/client" />


interface LiniyaDesktopSettings {
  launchAtLogin: boolean
  closeToTray: boolean
}

interface LiniyaReminder {
  id: string
  title: string
  chainTitle: string
  reminderAt: string
}

interface LiniyaDesktopAPI {
  readonly isDesktop: true
  readonly platform: string
  getSettings: () => Promise<LiniyaDesktopSettings>
  setPreferences: (preferences: Partial<LiniyaDesktopSettings>) => Promise<LiniyaDesktopSettings>
  syncReminders: (reminders: LiniyaReminder[]) => void
  testNotification: () => Promise<{ ok: boolean; message?: string }>
}

declare interface Window {
  liniyaDesktop?: LiniyaDesktopAPI
}
