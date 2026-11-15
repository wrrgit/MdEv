// MdEv Tauri 垫片（P1）：用 window.__TAURI__ 支撑 window.api，
// 使渲染端 136 处 window.api?.x 调用一行不改即可在 Tauri 构建运行。
//
// 架构：除「自由输入 / 表单 / 表格 / 三选一确认」对话框（Electron 用 BrowserWindow HTML 弹窗，
// 这里用 DOM 模态，行为一致；Tauri dialog 插件无自由文本输入）与剪贴板 / 客户端导出外，
// 其余均经 invoke() 打到 Rust 命令；事件经 event.listen() 接收。
// 仅当存在 window.__TAURI__ 且 window.api 尚未被 Electron preload 注入时安装
// （Electron 构建下本文件是 no-op，避免覆盖 preload 的 contextBridge）。

import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import { createDropPathQueue } from './dragDropPaths.js'
import { showModal } from './dialogHost.js'
import { resolveInputBox, resolveFormDialog, resolveTableDialog, resolveConfirmUnsaved } from './dialogModel.js'

function installTauriApi() {
  const TAURI = window.__TAURI__
  if (!TAURI) return
  const invoke = TAURI?.core?.invoke
  const listen = TAURI?.event?.listen
  // 防御：全局结构若与预期不符，宁可明确报错也不要抛异常阻断模块求值
  //（本文件是 main.js 的静态 import，顶层抛错会导致整个 Vue 应用不挂载 → 白屏）
  if (typeof invoke !== 'function' || typeof listen !== 'function') {
    console.error('[MdEv] window.__TAURI__ 缺少 core.invoke / event.listen，无法安装 window.api')
    return
  }

  // ── 事件绑定：返回同步 unsubscribe 函数（与 Electron 版返回函数一致）──
  function bindEvent(event, cb) {
    const p = listen(event, (e) => {
      const pl = e.payload
      const args = pl === null || pl === undefined ? [] : Array.isArray(pl) ? pl : [pl]
      cb(...args)
    })
    return () => { p.then((f) => f()) }
  }

  const menuListeners = {}

  // ── 拖拽文件路径桥接 ──
  // Tauri 2 默认接管文件拖放，HTML5 DataTransfer.files 里的 File 没有 .path。
  // 通过 webview.onDragDropEvent 取得真实路径，交给 dragDropPaths 队列做双通道去重：
  // HTML5 drop 触发时 getPathForFile 消费路径；未被消费的由 mdev:tauri-drop 兜底派发。
  const dropQueue = createDropPathQueue({
    dispatch: (paths) =>
      window.dispatchEvent(new CustomEvent('mdev:tauri-drop', { detail: { paths } }))
  })

  let webview = null
  try {
    webview = TAURI?.webview?.getCurrentWebview?.() || null
  } catch (err) {
    // 本文件是 main.js 的静态 import：此处抛错会中断 installTauriApi()，
    // 导致 window.api 装不上、全应用按钮失效。拖拽能力降级即可，绝不可阻断启动。
    console.warn('[MdEv] 获取当前 Webview 失败，拖拽打开可能不可用', err)
  }
  if (webview && typeof webview.onDragDropEvent === 'function') {
    try {
      Promise.resolve(
        webview.onDragDropEvent((event) => {
          const payload = event?.payload
          if (payload?.type === 'drop') dropQueue.setPaths(payload.paths)
        })
      ).catch((err) => {
        console.warn('[MdEv] Tauri 拖拽事件注册失败，拖拽打开可能不可用', err)
      })
    } catch (err) {
      console.warn('[MdEv] Tauri 拖拽事件注册失败', err)
    }
  }

  function showInputBox(options) {
    const o = options || {}
    return showModal({
      title: o.title || '输入',
      fields: [{ name: 'v', label: o.label, value: o.value, placeholder: o.placeholder }],
      buttons: [{ id: 'ok', label: '确定' }, { id: 'cancel', label: '取消' }]
    }).then(resolveInputBox)
  }

  function showFormDialog(options) {
    const o = options || {}
    const fields = (o.fields || []).map((f) => ({
      name: f.name || 'field',
      label: f.label,
      value: f.value,
      placeholder: f.placeholder
    }))
    return showModal({
      title: o.title || '输入',
      fields,
      buttons: [{ id: 'ok', label: '确定' }, { id: 'cancel', label: '取消' }]
    }).then(resolveFormDialog)
  }

  function showTableDialog() {
    return showModal({
      title: '插入表格',
      fields: [
        { name: 'rows', label: '行数', type: 'number', value: 3, min: 1, max: 20 },
        { name: 'cols', label: '列数', type: 'number', value: 3, min: 1, max: 10 }
      ],
      buttons: [{ id: 'ok', label: '确定' }, { id: 'cancel', label: '取消' }]
    }).then(resolveTableDialog)
  }

  function confirmUnsaved(fileName) {
    return showModal({
      title: '未保存的文档',
      fields: [{ type: 'message', value: `“${fileName || '未命名'}” 尚未保存为文件，是否保存？` }],
      buttons: [
        { id: 'save', label: '保存' },
        { id: 'discard', label: '不保存' },
        { id: 'cancel', label: '取消' }
      ]
    }).then(resolveConfirmUnsaved)
  }
  // ── 剪贴板图片：渲染端读剪贴板 → Uint8Array → save_image_bytes 落盘 ──
  async function saveClipboardImage(basePath, folder) {
    try {
      if (!navigator.clipboard || !navigator.clipboard.read) {
        return { success: false, error: 'clipboard-unavailable' }
      }
      const items = await navigator.clipboard.read()
      let blob = null
      for (const item of items) {
        const type = item.types.find((t) => t.startsWith('image/'))
        if (type) {
          blob = await item.getType(type)
          break
        }
      }
      if (!blob) return { success: false, error: 'clipboard-empty' }
      const buf = await blob.arrayBuffer()
      return await invoke('save_image_bytes', {
        basePath,
        folder,
        data: new Uint8Array(buf)
      })
    } catch (e) {
      return { success: false, error: (e && e.message) || String(e) }
    }
  }

  async function copyHtmlToClipboard(html, text) {
    try {
      if (!navigator.clipboard || !window.ClipboardItem) return false
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html || ''], { type: 'text/html' }),
          'text/plain': new Blob([text || ''], { type: 'text/plain' })
        })
      ])
      return true
    } catch {
      return false
    }
  }

  // ── 客户端导出（方案 E：渲染端 html2canvas + jsPDF，Rust 仅负责写盘 save_blob）──
  function buildExportContainer(content, theme) {
    const div = document.createElement('div')
    div.className = 'markdown-body'
    div.innerHTML = content
    const bg = theme === 'dark' ? '#0d1117' : '#ffffff'
    div.style.cssText = `position:fixed;left:-100000px;top:0;width:820px;padding:40px;background:${bg};`
    document.body.appendChild(div)
    return { div, bg }
  }

  async function exportPdf(options) {
    const o = options || {}
    const { content, theme = 'light', defaultPath = 'export.pdf' } = o
    if (!content) return { success: false, error: 'No content to export' }
    const { div, bg } = buildExportContainer(content, theme)
    try {
      const canvas = await html2canvas(div, { backgroundColor: bg, scale: 2 })
      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' })
      const pw = pdf.internal.pageSize.getWidth()
      const ph = pdf.internal.pageSize.getHeight()
      const iw = pw
      const ih = (canvas.height * iw) / canvas.width
      let pos = 0
      pdf.addImage(imgData, 'PNG', 0, pos, iw, ih)
      let left = ih - ph
      while (left > 0) {
        pos -= ph
        pdf.addPage()
        pdf.addImage(imgData, 'PNG', 0, pos, iw, ih)
        left -= ph
      }
      const blob = pdf.output('blob')
      const buf = await blob.arrayBuffer()
      await invoke('save_blob', { defaultPath, data: new Uint8Array(buf) })
      return { success: true }
    } catch (e) {
      return { success: false, error: (e && e.message) || String(e) }
    } finally {
      if (div.parentNode) div.parentNode.removeChild(div)
    }
  }

  async function exportPng(options) {
    const o = options || {}
    const { content, theme = 'light', defaultPath = 'export.png', scale = 2 } = o
    if (!content) return { success: false, error: 'No content to export' }
    const { div, bg } = buildExportContainer(content, theme)
    try {
      const canvas = await html2canvas(div, { backgroundColor: bg, scale })
      const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'))
      const buf = await blob.arrayBuffer()
      await invoke('save_blob', { defaultPath, data: new Uint8Array(buf) })
      return { success: true }
    } catch (e) {
      return { success: false, error: (e && e.message) || String(e) }
    } finally {
      if (div.parentNode) div.parentNode.removeChild(div)
    }
  }

  window.api = {
    // ── 拖拽文件路径（从 Tauri onDragDropEvent 的路径队列按 basename 消费）──
    getPathForFile: (file) => dropQueue.consume(file),

    // ── 文件操作 ──
    readFile: (filePath) => invoke('read_file', { path: filePath }),
    writeFile: (filePath, content) => invoke('write_file', { path: filePath, contents: content }),
    readDirectory: (dirPath) => invoke('read_directory', { path: dirPath }),
    createFile: (filePath) => invoke('create_file', { path: filePath }),
    createDirectory: (dirPath) => invoke('create_directory', { path: dirPath }),
    rename: (oldPath, newPath) => invoke('rename_file', { oldPath, newPath }),
    delete: (targetPath) => invoke('delete_path', { targetPath }),
    exists: (targetPath) => invoke('file_exists', { targetPath }),

    // ── 未命名文档草稿 ──
    saveDraft: (draftId, content) => invoke('save_draft', { draftId, content }),
    readDraft: (draftId) => invoke('read_draft', { draftId }),
    deleteDraft: (draftId) => invoke('delete_draft', { draftId }),
    confirmUnsaved: (fileName) => confirmUnsaved(fileName),

    // ── 图片 ──
    saveClipboardImage: (basePath, folder) => saveClipboardImage(basePath, folder),
    copyImageFile: (srcPath, basePath, folder) =>
      invoke('copy_image_file', { srcPath, basePath, folder }),

    // ── 本地文件历史 ──
    listHistory: (filePath) => invoke('list_history', { filePath }),
    readHistory: (filePath, ts) => invoke('read_history', { filePath, ts }),
    restoreHistory: (filePath, ts) => invoke('restore_history', { filePath, ts }),

    // ── 剪贴板 ──
    copyHtmlToClipboard: (html, text) => copyHtmlToClipboard(html, text),

    // ── 文件监听 ──
    watchDirectory: (dirPath) => invoke('watch_directory', { dirPath }),
    unwatchDirectory: (dirPath) => invoke('unwatch_directory', { dirPath }),
    onFileChanged: (callback) => bindEvent('file:changed', callback),

    // ── 文件关联 / 第二实例打开 ──
    onOpenFile: (callback) => bindEvent('app:open-file', callback),

    // ── 对话框 ──
    openFileDialog: () => invoke('open_file_dialog'),
    openFolderDialog: () => invoke('open_folder_dialog'),
    saveFileDialog: (defaultName) => invoke('save_file_dialog', { defaultName }),
    showInputBox: (options) => showInputBox(options),
    showFormDialog: (options) => showFormDialog(options),
    openImageDialog: () => invoke('open_image_dialog'),
    showTableDialog: () => showTableDialog(),

    // ── Shell / 路径 ──
    openPath: (filePath) => invoke('open_path', { filePath }),
    showItemInFolder: (filePath) => invoke('show_item_in_folder', { filePath }),
    openExternal: (url) => invoke('open_external', { url }),
    resolvePath: (relativePath, basePath) =>
      invoke('resolve_path', { relativePath, basePath }),

    // ── 搜索 ──
    searchInProject: (rootPath, query, options) =>
      invoke('search_in_project', { rootPath, query, options: options || {} }),

    // ── 导出 ──
    exportPdf: (options) => exportPdf(options),
    exportHtml: (options) => invoke('export_html', { options }),
    exportPng: (options) => exportPng(options),

    // ── 设置 ──
    getSettings: () => invoke('get_settings'),
    setSettings: (settings) => invoke('set_settings', { newSettings: settings }),

    // ── 主题 ──
    getNativeTheme: () => invoke('get_native_theme'),
    onThemeChanged: (callback) => bindEvent('theme:changed', callback),

    // ── 窗口控制 ──
    minimizeWindow: () => invoke('minimize_window'),
    maximizeWindow: () => invoke('maximize_window'),
    closeWindow: () => invoke('close_window'),
    isMaximized: () => invoke('is_maximized'),
    onMaximizeChange: (callback) => bindEvent('window:maximize-changed', callback),

    // ── 菜单事件监听 ──
    onMenuEvent: (channel, callback) => {
      const off = bindEvent(channel, callback)
      menuListeners[channel] = menuListeners[channel] || []
      menuListeners[channel].push(off)
      return off
    },
    removeMenuListener: (channel) => {
      const arr = menuListeners[channel] || []
      arr.forEach((fn) => fn())
      menuListeners[channel] = []
    }
  }
}

try {
  if (window.__TAURI__ && !window.api) {
    installTauriApi()
    if (window.api) console.info('[MdEv] Tauri window.api 已安装')
  } else if (!window.api) {
    // 纯浏览器直连 Vite dev server 时会走到这里：所有 window.api?.x 静默跳过，
    // 表现为「页面有壳但点按钮无反应」。给出明确提示，避免误判为应用 bug。
    console.warn(
      '[MdEv] 未检测到 Electron preload / Tauri 运行时，window.api 不可用。' +
      '请在 Tauri/Electron 应用窗口内使用，不要直接用浏览器打开 http://localhost:5173/'
    )
  }
} catch (e) {
  console.error('[MdEv] window.api 垫片安装失败（已隔离，不影响页面渲染）', e)
}

export default installTauriApi
