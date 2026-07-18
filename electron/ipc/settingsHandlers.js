import { app, ipcMain, nativeTheme, BrowserWindow } from 'electron'
import { join } from 'path'

let sharedStore = null

export async function getSettingsStore() {
  if (!sharedStore) {
    const ElectronStore = (await import('electron-store')).default
    sharedStore = new ElectronStore({
      name: 'mdev-settings',
      cwd: join(app.getPath('userData'), 'config'),
      defaults: {
        settings: {
          theme: 'system',
          editorFontFamily: "'JetBrains Mono', 'Cascadia Code', 'Fira Code', monospace",
          editorFontSize: 15,
          previewFontFamily: "-apple-system, 'Microsoft YaHei', 'PingFang SC', sans-serif",
          previewFontSize: 16,
          lineHeight: 1.6,
          tabSize: 4,
          wordWrap: false,
          showLineNumbers: true,
          highlightActiveLine: true,
          matchBrackets: true,
          codeFolding: true,
          scrollSync: true,
          autoSaveInterval: 3,
          defaultPanelFocus: 'filetree',
          recentFilesMax: 20
        },
        recentFiles: [],
        recentFolders: []
      }
    })
  }
  return sharedStore
}

export function registerSettingsHandlers(ipcMainInstance) {
  let store = null

  async function getStore() {
    sharedStore = await getSettingsStore()
    return sharedStore
  }

  ipcMainInstance.handle('settings:get', async () => {
    try {
      const s = await getStore()
      const settings = s.get('settings')
      const recentFiles = s.get('recentFiles')
      const recentFolders = s.get('recentFolders')
      return { success: true, settings, recentFiles, recentFolders }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMainInstance.handle('settings:set', async (_, newSettings) => {
    try {
      const s = await getStore()

      if (newSettings.settings) {
        s.set('settings', newSettings.settings)
        if (newSettings.settings.theme === 'system') {
          nativeTheme.themeSource = 'system'
        } else {
          nativeTheme.themeSource = newSettings.settings.theme
        }
      }
      if (newSettings.recentFiles !== undefined) {
        s.set('recentFiles', newSettings.recentFiles)
      }
      if (newSettings.recentFolders !== undefined) {
        s.set('recentFolders', newSettings.recentFolders)
      }

      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMainInstance.handle('theme:getNative', () => {
    return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
  })

  nativeTheme.on('updated', () => {
    const mode = nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
    const wins = BrowserWindow.getAllWindows()
    wins.forEach(win => {
      if (!win.isDestroyed()) {
        win.webContents.send('theme:changed', mode)
      }
    })
  })

  ipcMainInstance.handle('window:minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })

  ipcMainInstance.handle('window:maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win?.isMaximized()) {
      win.unmaximize()
    } else {
      win?.maximize()
    }
  })

  ipcMainInstance.handle('window:close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
  })

  ipcMainInstance.handle('window:isMaximized', (event) => {
    return BrowserWindow.fromWebContents(event.sender)?.isMaximized() || false
  })
}
