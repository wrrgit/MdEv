import { app, BrowserWindow, Menu, ipcMain, dialog, nativeTheme, screen, nativeImage, shell, protocol } from 'electron'
import { join, dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { registerFileHandlers } from './ipc/fileHandlers.js'
import { registerImageHandlers } from './ipc/imageHandlers.js'
import { registerSearchHandlers } from './ipc/searchHandlers.js'
import { registerExportHandlers } from './ipc/exportHandlers.js'
import { registerSettingsHandlers, getSettingsStore } from './ipc/settingsHandlers.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const isDev = process.env.NODE_ENV === 'development'
const boundsPath = join(app.getPath('userData'), 'window-bounds.json')

// 自定义 mdimg:// 本地图片协议：必须在 app ready 前注册为特权 scheme，
// 否则 <img src="mdimg://..."> 会被 Chromium 当作非安全源拦截（显示破裂图标）
protocol.registerSchemesAsPrivileged([
  { scheme: 'mdimg', privileges: { secure: true, supportFetchAPI: true, stream: true } }
])

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

  await setupMenu()

  mainWindow.on('resize', saveWindowBounds)
  mainWindow.on('move', saveWindowBounds)
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // 禁用拖拽默认行为（防止拖入文件时整个窗口跳转到文件路径）
  mainWindow.webContents.on('will-navigate', (e) => {
    if (e.url !== (isDev ? 'http://localhost:5173/' : 'file:///' + join(__dirname, '..', 'dist', 'index.html').replace(/\\/g, '/'))) {
      e.preventDefault()
    }
  })
  // 禁用新窗口打开
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
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
        {
          label: '撤销',
          accelerator: 'CmdOrCtrl+Z',
          click: () => mainWindow?.webContents.send('menu:undo')
        },
        {
          label: '重做',
          accelerator: 'CmdOrCtrl+Y',
          click: () => mainWindow?.webContents.send('menu:redo')
        },
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
          accelerator: 'CmdOrCtrl+Shift+B',
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
  registerImageHandlers(ipcMain)
  registerSearchHandlers(ipcMain)
  registerExportHandlers(ipcMain, mainWindow)
  registerSettingsHandlers(ipcMain)

  ipcMain.handle('dialog:openFile', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [
        { name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'mdx'] },
        { name: 'JSON', extensions: ['json', 'jsonc'] },
        { name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'ico', 'avif'] },
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

  ipcMain.handle('dialog:openImage', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [
        { name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'ico', 'avif'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('dialog:showTableDialog', async () => {
    return new Promise((resolve) => {
      const tableWin = new BrowserWindow({
        width: 360,
        height: 240,
        parent: mainWindow,
        modal: true,
        show: false,
        frame: false,
        resizable: false,
        webPreferences: {
          nodeIntegration: true,
          contextIsolation: false
        }
      })
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:-apple-system,'Microsoft YaHei',sans-serif;font-size:13px;padding:20px;background:#fff;color:#24292e;display:flex;flex-direction:column;height:100vh;overflow:hidden}
        .title{font-size:14px;font-weight:600;margin-bottom:16px}
        .row{display:flex;align-items:center;gap:8px;margin-bottom:12px}
        .lbl{width:60px;font-size:12px;color:#586069}
        .inp{flex:1;padding:6px 10px;border:1px solid #e1e4e8;border-radius:5px;font-size:13px;outline:none}
        .inp:focus{border-color:#0366d6;box-shadow:0 0 0 3px rgba(3,102,214,0.15)}
        .hint{font-size:11px;color:#586069;margin-bottom:12px}
        .btns{display:flex;gap:8px;justify-content:flex-end;margin-top:auto}
        button{padding:6px 16px;border-radius:5px;border:1px solid #e1e4e8;cursor:pointer;font-size:13px}
        .btn-cancel{background:#fff;color:#24292e}
        .btn-cancel:hover{background:#f6f8fa}
        .btn-ok{background:#0366d6;color:#fff;border-color:#0366d6}
        .btn-ok:hover{background:#035ec2}
      </style></head><body>
        <div class="title">插入表格</div>
        <div class="row"><span class="lbl">行数</span><input id="rows" class="inp" type="number" value="3" min="1" max="20" autofocus /></div>
        <div class="row"><span class="lbl">列数</span><input id="cols" class="inp" type="number" value="3" min="1" max="10" /></div>
        <div class="hint">不含表头行</div>
        <div class="btns">
          <button class="btn-cancel" id="cancelBtn">取消</button>
          <button class="btn-ok" id="okBtn">确定</button>
        </div>
        <script>
          const { ipcRenderer } = require('electron')
          const rowsInp = document.getElementById('rows')
          const colsInp = document.getElementById('cols')
          function submit() {
            const r = Math.max(1, Math.min(20, parseInt(rowsInp.value) || 3))
            const c = Math.max(1, Math.min(10, parseInt(colsInp.value) || 3))
            ipcRenderer.send('table-result', { rows: r, cols: c })
          }
          document.getElementById('okBtn').onclick = submit
          document.getElementById('cancelBtn').onclick = () => ipcRenderer.send('table-result', null)
          rowsInp.onkeydown = (e) => { if(e.key==='Enter') submit(); if(e.key==='Escape') ipcRenderer.send('table-result', null) }
          colsInp.onkeydown = (e) => { if(e.key==='Enter') submit(); if(e.key==='Escape') ipcRenderer.send('table-result', null) }
          rowsInp.select()
          rowsInp.focus()
        <\/script>
      </body></html>`
      tableWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
      tableWin.once('ready-to-show', () => { tableWin.show() })
      tableWin.once('closed', () => { resolve(null) })
      ipcMain.once('table-result', (_, val) => {
        resolve(val)
        if (!tableWin.isDestroyed()) tableWin.close()
      })
    })
  })

  // 关闭未命名草稿前的三选一确认：保存 / 不保存 / 取消
  ipcMain.handle('dialog:confirmUnsaved', async (_, fileName) => {
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      buttons: ['保存', '不保存', '取消'],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
      title: '未保存的文档',
      message: `“${fileName || '未命名'}” 尚未保存为文件，是否保存？`,
      detail: '选择“不保存”将丢弃该草稿内容。'
    })
    return ['save', 'discard', 'cancel'][response] || 'cancel'
  })

  ipcMain.handle('dialog:showInputBox', async (_, options) => {
    return new Promise((resolve) => {
      const inputWin = new BrowserWindow({
        width: 400,
        height: 180,
        parent: mainWindow,
        modal: true,
        show: false,
        frame: false,
        resizable: false,
        webPreferences: {
          nodeIntegration: true,
          contextIsolation: false
        }
      })
      const title = options?.title || '输入'
      const label = options?.label || ''
      const value = options?.value || ''
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:-apple-system,'Microsoft YaHei',sans-serif;font-size:13px;padding:20px;background:#fff;color:#24292e;display:flex;flex-direction:column;height:100vh;overflow:hidden}
        .title{font-size:14px;font-weight:600;margin-bottom:12px}
        .label{font-size:12px;color:#586069;margin-bottom:6px}
        input{width:100%;padding:6px 10px;border:1px solid #e1e4e8;border-radius:5px;font-size:13px;outline:none;margin-bottom:16px}
        input:focus{border-color:#0366d6;box-shadow:0 0 0 3px rgba(3,102,214,0.15)}
        .btns{display:flex;gap:8px;justify-content:flex-end;margin-top:auto}
        button{padding:6px 16px;border-radius:5px;border:1px solid #e1e4e8;cursor:pointer;font-size:13px}
        .btn-cancel{background:#fff;color:#24292e}
        .btn-cancel:hover{background:#f6f8fa}
        .btn-ok{background:#0366d6;color:#fff;border-color:#0366d6}
        .btn-ok:hover{background:#035ec2}
      </style></head><body>
        <div class="title">${title}</div>
        ${label ? `<div class="label">${label}</div>` : ''}
        <input id="inp" value="${value}" autofocus />
        <div class="btns">
          <button class="btn-cancel" id="cancelBtn">取消</button>
          <button class="btn-ok" id="okBtn">确定</button>
        </div>
        <script>
          const { ipcRenderer } = require('electron')
          const inp = document.getElementById('inp')
          inp.select()
          inp.focus()
          document.getElementById('okBtn').onclick = () => ipcRenderer.send('input-result', inp.value)
          document.getElementById('cancelBtn').onclick = () => ipcRenderer.send('input-result', null)
          inp.onkeydown = (e) => { if(e.key==='Enter') ipcRenderer.send('input-result', inp.value); if(e.key==='Escape') ipcRenderer.send('input-result', null) }
        <\/script>
      </body></html>`
      inputWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
      inputWin.once('ready-to-show', () => { inputWin.show() })
      inputWin.once('closed', () => { resolve(null) })
      ipcMain.once('input-result', (_, val) => {
        resolve(val)
        if (!inputWin.isDestroyed()) inputWin.close()
      })
    })
  })

  // ── 通用表单弹窗（多字段） ──
  ipcMain.handle('dialog:showFormDialog', async (_, options) => {
    return new Promise((resolvePromise) => {
      const fields = options?.fields || []
      const title = options?.title || '输入'
      const winHeight = 120 + fields.length * 50

      const formWin = new BrowserWindow({
        width: 460,
        height: winHeight,
        parent: mainWindow,
        modal: true,
        show: false,
        frame: false,
        resizable: false,
        webPreferences: {
          nodeIntegration: true,
          contextIsolation: false
        }
      })

      const fieldsHtml = fields.map((f, i) => `
        <div class="field-group">
          <label class="field-label">${f.label || ''}</label>
          <input id="field-${i}" class="field-input" data-name="${f.name || ('field' + i)}"
                 value="${(f.value || '').replace(/"/g, '&quot;').replace(/</g, '&lt;')}"
                 placeholder="${(f.placeholder || '').replace(/"/g, '&quot;')}"
                 ${i === 0 ? 'autofocus' : ''} />
        </div>`).join('')

      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:-apple-system,'Microsoft YaHei',sans-serif;font-size:13px;padding:20px;background:#fff;color:#24292e;display:flex;flex-direction:column;height:100vh;overflow:hidden}
        .title{font-size:14px;font-weight:600;margin-bottom:16px}
        .field-group{margin-bottom:12px}
        .field-label{font-size:12px;color:#586069;margin-bottom:4px;display:block}
        .field-input{width:100%;padding:6px 10px;border:1px solid #e1e4e8;border-radius:5px;font-size:13px;outline:none}
        .field-input:focus{border-color:#0366d6;box-shadow:0 0 0 3px rgba(3,102,214,0.15)}
        .btns{display:flex;gap:8px;justify-content:flex-end;margin-top:auto;padding-top:8px}
        button{padding:6px 16px;border-radius:5px;border:1px solid #e1e4e8;cursor:pointer;font-size:13px}
        .btn-cancel{background:#fff;color:#24292e}
        .btn-cancel:hover{background:#f6f8fa}
        .btn-ok{background:#0366d6;color:#fff;border-color:#0366d6}
        .btn-ok:hover{background:#035ec2}
      </style></head><body>
        <div class="title">${title}</div>
        ${fieldsHtml}
        <div class="btns">
          <button class="btn-cancel" id="cancelBtn">取消</button>
          <button class="btn-ok" id="okBtn">确定</button>
        </div>
        <script>
          const { ipcRenderer } = require('electron')
          function submit() {
            const result = {}
            document.querySelectorAll('.field-input').forEach(inp => {
              result[inp.dataset.name] = inp.value
            })
            ipcRenderer.send('form-result', result)
          }
          document.getElementById('okBtn').onclick = submit
          document.getElementById('cancelBtn').onclick = () => ipcRenderer.send('form-result', null)
          document.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); submit() }
            if (e.key === 'Escape') ipcRenderer.send('form-result', null)
          })
        <\/script>
      </body></html>`

      formWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
      formWin.once('ready-to-show', () => { formWin.show() })
      formWin.once('closed', () => { resolvePromise(null) })
      ipcMain.once('form-result', (_, val) => {
        resolvePromise(val)
        if (!formWin.isDestroyed()) formWin.close()
      })
    })
  })

  // ── 用系统默认程序打开文件 ──
  ipcMain.handle('shell:openPath', async (_, filePath) => {
    if (!filePath) return null
    return shell.openPath(filePath)
  })

  // ── 在系统文件管理器中显示文件 ──
  ipcMain.handle('shell:showItemInFolder', async (_, filePath) => {
    if (!filePath) return null
    shell.showItemInFolder(filePath)
    return true
  })

  // ── 用系统浏览器打开外部链接 ──
  ipcMain.handle('shell:openExternal', async (_, url) => {
    if (!url) return null
    return shell.openExternal(url)
  })

  // ── 解析相对路径为绝对路径 ──
  ipcMain.handle('file:resolvePath', async (_, relativePath, basePath) => {
    if (!relativePath || !basePath) return null
    try {
      const abs = resolve(basePath, relativePath)
      return existsSync(abs) ? abs : null
    } catch {
      return null
    }
  })
}

app.whenReady().then(() => {
  // ── 注册 mdimg:// 自定义协议，用于加载本地图片 ──
  protocol.handle('mdimg', (request) => {
    let filePath = decodeURIComponent(request.url.replace(/^mdimg:\/\/\/?/, ''))
    filePath = filePath.replace(/^\//, '')
    if (!existsSync(filePath)) {
      return new Response(null, { status: 404 })
    }
    const ext = filePath.match(/\.([^.]+)$/)?.[1]?.toLowerCase() || ''
    const mimeMap = {
      png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
      gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp',
      svg: 'image/svg+xml', ico: 'image/x-icon', avif: 'image/avif'
    }
    const mime = mimeMap[ext] || 'application/octet-stream'
    const data = readFileSync(filePath)
    return new Response(data, { headers: { 'Content-Type': mime } })
  })

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
