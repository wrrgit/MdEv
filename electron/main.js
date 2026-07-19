import { app, BrowserWindow, Menu, ipcMain, dialog, nativeTheme, screen, nativeImage } from 'electron'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { registerFileHandlers } from './ipc/fileHandlers.js'
import { registerSearchHandlers } from './ipc/searchHandlers.js'
import { registerExportHandlers } from './ipc/exportHandlers.js'
import { registerSettingsHandlers, getSettingsStore } from './ipc/settingsHandlers.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const isDev = process.env.NODE_ENV === 'development'
const boundsPath = join(app.getPath('userData'), 'window-bounds.json')

let mainWindow = null

function loadWindowBounds() {
  try {
    if (existsSync(boundsPath)) {
      const data = JSON.parse(readFileSync(boundsPath, 'utf-8'))
      if (data.width && data.height) return data
    }
  } catch { }
  return null
}

function saveWindowBounds() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  try {
    const bounds = mainWindow.getBounds()
    writeFileSync(boundsPath, JSON.stringify({ width: bounds.width, height: bounds.height, x: bounds.x, y: bounds.y }))
  } catch { }
}

function getDefaultBounds() {
  const primaryDisplay = screen.getPrimaryDisplay()
  const { width, height } = primaryDisplay.workAreaSize
  return {
    width: Math.round(width * 3 / 5),
    height: Math.round(height * 3 / 5)
  }
}

async function createWindow() {
  const saved = loadWindowBounds()
  const defaults = getDefaultBounds()

  const winOptions = {
    width: saved?.width || defaults.width,
    height: saved?.height || defaults.height,
    minWidth: 900,
    minHeight: 600,
    title: 'MdEv',
    icon: nativeImage.createFromPath(join(__dirname, '..', 'assets', 'icons', 'icon.png')),
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#ffffff'
  }

  if (saved?.x !== undefined && saved?.y !== undefined) {
    winOptions.x = saved.x
    winOptions.y = saved.y
  }

  mainWindow = new BrowserWindow(winOptions)

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(join(__dirname, '..', 'dist', 'index.html'))
  }

  // 诊断：读取 renderer 的 wordWrap 调试信息并写入文件（排查自动换行不生效）
  mainWindow.webContents.on('did-finish-load', () => {
    let attempts = 0
    const timer = setInterval(() => {
      attempts++
      if (!mainWindow || mainWindow.isDestroyed()) { clearInterval(timer); return }
      mainWindow.webContents.executeJavaScript('window.__wwDebug || null')
        .then(result => {
          if (result) {
            try {
              writeFileSync(join(app.getPath('userData'), 'ww-debug.json'), JSON.stringify(result, null, 2))
            } catch (e) {}
            clearInterval(timer)
          }
        })
        .catch(() => {})
      if (attempts > 60) clearInterval(timer)
    }, 1000)
  })

  // 诊断：持续读取目录跳转调试信息（每次点击目录更新），写入 toc-debug.json
  const tocTimer = setInterval(() => {
    if (!mainWindow || mainWindow.isDestroyed()) { clearInterval(tocTimer); return }
    mainWindow.webContents.executeJavaScript('window.__tocDebug || null')
      .then(result => {
        if (result) {
          try {
            writeFileSync(join(app.getPath('userData'), 'toc-debug.json'), JSON.stringify(result, null, 2))
          } catch (e) {}
        }
      })
      .catch(() => {})
  }, 1500)

  await setupMenu()

  mainWindow.on('resize', saveWindowBounds)
  mainWindow.on('move', saveWindowBounds)
  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

async function setupMenu() {
  const settingsStore = await getSettingsStore()
  const template = [
    {
      label: '文件',
      submenu: [
        {
          label: '新建文件',
          accelerator: 'CmdOrCtrl+N',
          click: () => mainWindow?.webContents.send('menu:new-file')
        },
        {
          label: '打开文件...',
          accelerator: 'CmdOrCtrl+O',
          click: () => mainWindow?.webContents.send('menu:open-file')
        },
        {
          label: '打开文件夹...',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: () => mainWindow?.webContents.send('menu:open-folder')
        },
        { type: 'separator' },
        {
          label: '保存',
          accelerator: 'CmdOrCtrl+S',
          click: () => mainWindow?.webContents.send('menu:save')
        },
        {
          label: '另存为...',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => mainWindow?.webContents.send('menu:save-as')
        },
        { type: 'separator' },
        {
          label: '导出 PDF...',
          click: () => mainWindow?.webContents.send('menu:export-pdf')
        },
        {
          label: '导出 HTML...',
          click: () => mainWindow?.webContents.send('menu:export-html')
        },
        { type: 'separator' },
        { role: 'quit', label: '退出' }
      ]
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { type: 'separator' },
        {
          label: '查找',
          accelerator: 'CmdOrCtrl+F',
          click: () => mainWindow?.webContents.send('menu:find')
        },
        {
          label: '跨文件搜索',
          accelerator: 'CmdOrCtrl+Shift+F',
          click: () => mainWindow?.webContents.send('menu:find-global')
        },
        { type: 'separator' },
        {
          label: '跳转到行...',
          accelerator: 'CmdOrCtrl+G',
          click: () => mainWindow?.webContents.send('menu:goto-line')
        }
      ]
    },
    {
      label: '视图',
      submenu: [
        {
          label: '双栏模式',
          type: 'radio',
          checked: true,
          click: () => mainWindow?.webContents.send('menu:view-mode', 'dual')
        },
        {
          label: '纯编辑模式',
          type: 'radio',
          click: () => mainWindow?.webContents.send('menu:view-mode', 'edit')
        },
        {
          label: '纯预览模式',
          type: 'radio',
          click: () => mainWindow?.webContents.send('menu:view-mode', 'preview')
        },
        { type: 'separator' },
        {
          label: '切换侧栏',
          accelerator: 'CmdOrCtrl+B',
          click: () => mainWindow?.webContents.send('menu:toggle-sidebar')
        },
        { type: 'separator' },
        {
          label: '设置...',
          accelerator: 'CmdOrCtrl+,',
          click: () => mainWindow?.webContents.send('menu:settings')
        },
        { type: 'separator' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { role: 'reload', label: '重新加载' }
      ]
    },
    {
      label: '显示',
      submenu: [
        {
          label: '自动换行',
          type: 'checkbox',
          checked: settingsStore.get('settings.wordWrap', false),
          click: (menuItem) => mainWindow?.webContents.send('menu:toggle-wordwrap', menuItem.checked)
        }
      ]
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '关于 MdEv',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: '关于 MdEv',
              message: 'MdEv v0.1.0',
              detail: 'Markdown Editor for Windows\n基于 Electron + Vue 3 + CodeMirror 6'
            })
          }
        }
      ]
    }
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

function registerIpcHandlers() {
  registerFileHandlers(ipcMain, mainWindow)
  registerSearchHandlers(ipcMain)
  registerExportHandlers(ipcMain, mainWindow)
  registerSettingsHandlers(ipcMain)

  ipcMain.handle('dialog:openFile', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [
        { name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'mdx'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('dialog:openFolder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory']
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('dialog:saveFile', async (_, defaultName) => {
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: defaultName || '未命名.md',
      filters: [
        { name: 'Markdown', extensions: ['md', 'markdown'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    })
    return result.canceled ? null : result.filePath
  })
}

app.whenReady().then(() => {
  createWindow()
  registerIpcHandlers()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})
