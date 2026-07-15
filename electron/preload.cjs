const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  // ── 文件操作 ──
  readFile: (filePath) => ipcRenderer.invoke('file:read', filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke('file:write', filePath, content),
  readDirectory: (dirPath) => ipcRenderer.invoke('file:readdir', dirPath),
  createFile: (filePath) => ipcRenderer.invoke('file:create', filePath),
  createDirectory: (dirPath) => ipcRenderer.invoke('file:mkdir', dirPath),
  rename: (oldPath, newPath) => ipcRenderer.invoke('file:rename', oldPath, newPath),
  delete: (targetPath) => ipcRenderer.invoke('file:delete', targetPath),
  exists: (targetPath) => ipcRenderer.invoke('file:exists', targetPath),

  // ── 文件监听 ──
  watchDirectory: (dirPath) => ipcRenderer.invoke('file:watch', dirPath),
  unwatchDirectory: (dirPath) => ipcRenderer.invoke('file:unwatch', dirPath),
  onFileChanged: (callback) => {
    ipcRenderer.on('file:changed', (_, data) => callback(data))
  },

  // ── 对话框 ──
  openFileDialog: () => ipcRenderer.invoke('dialog:openFile'),
  openFolderDialog: () => ipcRenderer.invoke('dialog:openFolder'),
  saveFileDialog: (defaultName) => ipcRenderer.invoke('dialog:saveFile', defaultName),

  // ── 搜索 ──
  searchInProject: (rootPath, query, options) =>
    ipcRenderer.invoke('search:project', rootPath, query, options),

  // ── 导出 ──
  exportPdf: (options) => ipcRenderer.invoke('export:pdf', options),
  exportImage: (dataUrl, filePath) => ipcRenderer.invoke('export:image', dataUrl, filePath),
  exportZip: (rootPath, outputPath, include) =>
    ipcRenderer.invoke('export:zip', rootPath, outputPath, include),

  // ── 设置 ──
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (settings) => ipcRenderer.invoke('settings:set', settings),

  // ── 主题 ──
  getNativeTheme: () => ipcRenderer.invoke('theme:getNative'),
  onThemeChanged: (callback) => {
    ipcRenderer.on('theme:changed', (_, mode) => callback(mode))
  },

  // ── 窗口控制 ──
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  onMaximizeChange: (callback) => {
    ipcRenderer.on('window:maximize-changed', (_, maximized) => callback(maximized))
  },

  // ── 菜单事件监听 ──
  onMenuEvent: (channel, callback) => {
    const validChannels = [
      'menu:new-file', 'menu:open-file', 'menu:open-folder',
      'menu:save', 'menu:save-as',
      'menu:export-pdf', 'menu:export-image',
      'menu:find', 'menu:find-global', 'menu:goto-line',
      'menu:view-mode', 'menu:toggle-sidebar', 'menu:settings'
    ]
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (_, ...args) => callback(...args))
    }
  },

  removeMenuListener: (channel) => {
    ipcRenderer.removeAllListeners(channel)
  }
})
