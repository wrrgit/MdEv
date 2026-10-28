<template>
  <div class="app-container" ref="appContainer"
    @dragover.prevent="onDragOverApp" @drop.prevent="onDropApp">
    <TitleBar />
    <MenuBar />
    <TabBar />
    <Toolbar />
    <div class="main-content">
      <PanelSidebar />
      <div
        class="editor-area"
        v-show="store.tabs.length > 0 && store.settings.viewMode !== 'preview'"
        :style="editorStyle"
      >
        <EditorPane />
      </div>
      <div
        class="splitter"
        v-show="store.tabs.length > 0 && store.settings.viewMode === 'dual'"
        @mousedown="startSplitDrag"
      ></div>
      <div
        class="preview-area"
        v-show="store.tabs.length > 0 && store.settings.viewMode !== 'edit'"
        :style="previewStyle"
      >
        <PreviewPane ref="previewRef" />
      </div>
    </div>
    <StatusBar />
    <SettingsPanel />
    <ExportDialog />
    <QuickOpen />
    <CommandPalette
      :visible="store.showCommandPalette"
      :commands="paletteCommands"
      @close="store.showCommandPalette = false"
    />
    <FileHistoryDialog />
  </div>
</template>

<script setup>
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import { useEditorStore } from '@/stores/editorStore'
import { useTheme } from '@/composables/useTheme'
import { useAutoSave } from '@/composables/useAutoSave'
import { useSession } from '@/composables/useSession'
import TitleBar from '@/components/TitleBar.vue'
import MenuBar from '@/components/MenuBar.vue'
import TabBar from '@/components/TabBar.vue'
import Toolbar from '@/components/Toolbar.vue'
import PanelSidebar from '@/components/PanelSidebar.vue'
import EditorPane from '@/components/EditorPane.vue'
import PreviewPane from '@/components/PreviewPane.vue'
import StatusBar from '@/components/StatusBar.vue'
import SettingsPanel from '@/components/SettingsPanel.vue'
import ExportDialog from '@/components/ExportDialog.vue'
import QuickOpen from '@/components/QuickOpen.vue'
import CommandPalette from '@/components/CommandPalette.vue'
import FileHistoryDialog from '@/components/FileHistoryDialog.vue'
import { toggleWrap, setHeading, insertLink, insertCodeBlock } from '@/core/markdown/editing'
import { formatTableAtCursor } from '@/core/markdown/tableFormat'

// 可作为文本在编辑器打开的扩展名（预览区/拖拽共用口径）
const TEXT_EXTS = ['md', 'markdown', 'mdown', 'mdx', 'json', 'js', 'ts', 'jsx', 'tsx',
  'css', 'scss', 'less', 'html', 'htm', 'xml', 'yaml', 'yml', 'toml', 'ini', 'txt', 'csv',
  'py', 'java', 'c', 'cpp', 'h', 'go', 'rs', 'rb', 'php', 'sh', 'bash', 'sql', 'lua', 'kt', 'dart']
const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'ico', 'avif']

const store = useEditorStore()
const previewRef = ref(null)
const appContainer = ref(null)

const splitRatio = ref(0.5)

const {
  initTheme,
  watchThemeChanges,
  startSystemThemeListener,
  loadSavedSettings,
  watchSettingsChanges,
  listenForNativeTheme
} = useTheme()

const {
  startAutoSave,
  saveNow,
  saveAs
} = useAutoSave()

const { startPersistSession, restoreSession } = useSession()

// ── 界面字体（菜单栏 / 标题栏路径等）跟随设置 ──
function applyUiFont() {
  const root = document.documentElement
  root.style.setProperty('--ui-font-family', store.settings.uiFontFamily || 'inherit')
  root.style.setProperty('--ui-font-size', `${store.settings.uiFontSize || 13}px`)
}

watch(
  [() => store.settings.uiFontFamily, () => store.settings.uiFontSize],
  applyUiFont,
  { immediate: true }
)

// ── 编辑/预览字体与行高：main.css 里只是默认值，需按设置覆盖 CSS 变量才生效 ──
function applyContentFonts() {
  const s = store.settings
  const root = document.documentElement
  root.style.setProperty('--editor-font-family', s.editorFontFamily)
  root.style.setProperty('--editor-font-size', `${s.editorFontSize}px`)
  root.style.setProperty('--preview-font-family', s.previewFontFamily)
  root.style.setProperty('--preview-font-size', `${s.previewFontSize}px`)
  root.style.setProperty('--line-height', String(s.lineHeight))
}

watch(
  [() => store.settings.editorFontFamily, () => store.settings.editorFontSize,
   () => store.settings.previewFontFamily, () => store.settings.previewFontSize,
   () => store.settings.lineHeight],
  applyContentFonts,
  { immediate: true }
)

const previewStyle = computed(() => {
  if (store.settings.viewMode !== 'dual') return {}
  return { flex: String(1 - splitRatio.value) }
})

const editorStyle = computed(() => {
  if (store.settings.viewMode !== 'dual') return {}
  return { flex: String(splitRatio.value) }
})

function startSplitDrag(e) {
  e.preventDefault()
  const container = appContainer.value
  if (!container) return
  const rect = container.getBoundingClientRect()
  const startX = e.clientX
  const startRatio = splitRatio.value

  function onMove(ev) {
    const dx = ev.clientX - startX
    const containerWidth = rect.width
    let newRatio = startRatio + dx / containerWidth
    newRatio = Math.max(0.2, Math.min(0.8, newRatio))
    splitRatio.value = newRatio
  }

  function onUp() {
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }

  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
}

// ── 文件外部变更监听 ──
let watchedFolder = null

async function watchProjectFolder(folderPath) {
  if (!folderPath || !window.api?.watchDirectory) return
  if (watchedFolder === folderPath) return
  if (watchedFolder) {
    try { await window.api.unwatchDirectory(watchedFolder) } catch {}
  }
  const r = await window.api.watchDirectory(folderPath)
  if (r?.success) watchedFolder = folderPath
}

// 归一化路径用于比较（Windows 大小写不敏感、分隔符统一）
function normPath(p) {
  return (p || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

async function onExternalFileChange(data) {
  const filePath = data?.path
  if (!filePath) return
  // 忽略应用内保存后的自触发（500ms 窗口）
  if (Date.now() - store.lastAppSaveTime < 500) return
  // 忽略 assets 图片目录的写入（避免粘贴图片触发刷新）
  if (/[\\/]assets[\\/]/.test(filePath) && /\.(png|jpe?g|gif|bmp|webp|svg|ico|avif)$/i.test(filePath)) return

  const normChanged = normPath(filePath)
  // 检查是否命中已打开的标签页
  const tab = store.tabs.find(t => t.filePath && normPath(t.filePath) === normChanged)
  if (tab) {
    if (tab.isDirty) {
      // 已脏：不打断用户，仅在状态栏提示
      store.notifyFileChange(`⚠ ${tab.fileName} 已被外部修改（当前有未保存更改）`)
      return
    }
    // 未脏：自动重载内容（抑制自动保存，内容已与磁盘一致）
    const r = await window.api.readFile(tab.filePath)
    if (r?.success) {
      store.suppressAutoSave = true
      tab.content = r.content
      // 下一个宏任务恢复，确保 watch 已经跑过
      setTimeout(() => { store.suppressAutoSave = false }, 0)
      store.notifyFileChange(`已重新加载 ${tab.fileName}（外部修改）`)
    }
    return
  }
  // 未打开的文件变更：刷新文件树
  if (store.projectRoot) {
    const r = await window.api.readDirectory(store.projectRoot)
    if (r?.success) {
      store.applyExpandedToTree(r.tree)
      store.fileTree = r.tree
    }
  }
}

function startFileWatchListener() {
  if (!window.api?.onFileChanged) return
  window.api.onFileChanged(onExternalFileChange)
}

// 项目根变化时自动切换 watch 目标
watch(() => store.projectRoot, (val) => {
  if (val) watchProjectFolder(val)
})

// ── 全局快捷键：Ctrl+P 快速打开 / Ctrl+Shift+P 命令面板 ──
function onGlobalKeydown(e) {
  const mod = e.ctrlKey || e.metaKey
  if (mod && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'p') {
    e.preventDefault()
    store.showCommandPalette = !store.showCommandPalette
    return
  }
  if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'p') {
    e.preventDefault()
    store.showQuickOpen = !store.showQuickOpen
  }
}

// ── 拖拽文件到窗口打开（.md 等文本文件；图片由编辑区拖拽处理）──
function onDragOverApp() {}

async function onDropApp(e) {
  const files = Array.from(e.dataTransfer?.files || [])
  if (files.length === 0) return
  for (const file of files) {
    const filePath = file.path || window.api?.getPathForFile?.(file) || ''
    if (!filePath) continue
    const ext = filePath.toLowerCase().match(/\.([^.]+)$/)?.[1] || ''
    if (!TEXT_EXTS.includes(ext) || IMAGE_EXTS.includes(ext)) continue
    try {
      const result = await window.api.readFile(filePath)
      if (result?.success) {
        store.addTab(filePath, result.content, filePath.split(/[\\/]/).pop())
        store.addRecentFile(filePath)
      }
    } catch {}
  }
}

// ── 编辑器命令辅助（命令面板用）──
function withEditor(fn) {
  const v = window.editorRef
  if (!v) return
  fn(v)
  v.focus()
}

function insertFormula(view, block) {
  const sel = view.state.selection.main
  const text = view.state.sliceDoc(sel.from, sel.to)
  if (block) {
    if (text) view.dispatch({ changes: { from: sel.from, to: sel.to, insert: '$$\n' + text + '\n$$' } })
    else view.dispatch({ changes: { from: sel.from, insert: '$$\n\n$$' }, selection: { anchor: sel.from + 4 } })
  } else {
    if (text) view.dispatch({
      changes: [{ from: sel.from, insert: '$' }, { from: sel.to, insert: '$' }],
      selection: { anchor: sel.from + 1, head: sel.to + 1 }
    })
    else view.dispatch({ changes: { from: sel.from, insert: '$$' }, selection: { anchor: sel.from + 1 } })
  }
}

async function openFileByDialog() {
  const filePath = await window.api.openFileDialog()
  if (!filePath) return
  const ext = filePath.toLowerCase().match(/\.([^.]+)$/)?.[1] || ''
  if (IMAGE_EXTS.includes(ext)) {
    await window.api.openPath(filePath)
    return
  }
  const result = await window.api.readFile(filePath)
  if (result?.success) {
    store.addTab(filePath, result.content, filePath.split(/[\\/]/).pop())
    store.addRecentFile(filePath)
  }
}

async function openFolderByDialog() {
  const folderPath = await window.api.openFolderDialog()
  if (!folderPath) return
  const result = await window.api.readDirectory(folderPath)
  if (result?.success) {
    store.collapseAllPaths()
    store.fileTree = result.tree
    store.setProjectRoot(folderPath)
    store.expandPath(folderPath)
    // watchProjectFolder 定义在下方，onMounted 后才绑定；这里直接调用
    watchProjectFolder(folderPath)
  }
}

// ── 命令面板命令注册 ──
const paletteCommands = computed(() => [
  // 文件
  { id: 'file.new', section: '文件', title: '新建文件', hint: 'Ctrl+N', keywords: 'new file', run: () => store.addTab(null, '', '未命名.md') },
  { id: 'file.open', section: '文件', title: '打开文件…', hint: 'Ctrl+O', keywords: 'open file', run: openFileByDialog },
  { id: 'file.openFolder', section: '文件', title: '打开文件夹…', hint: 'Ctrl+Shift+O', keywords: 'open folder directory', run: openFolderByDialog },
  { id: 'file.save', section: '文件', title: '保存', hint: 'Ctrl+S', keywords: 'save', run: () => saveNow() },
  { id: 'file.saveAs', section: '文件', title: '另存为…', hint: 'Ctrl+Shift+S', keywords: 'save as', run: () => saveAs() },
  { id: 'file.close', section: '文件', title: '关闭当前标签页', keywords: 'close tab', run: () => store.activeTabId && store.closeTab(store.activeTabId) },
  { id: 'file.quickOpen', section: '文件', title: '快速打开文件…', hint: 'Ctrl+P', keywords: 'quick open goto', run: () => { store.showQuickOpen = true } },
  // 编辑
  { id: 'edit.undo', section: '编辑', title: '撤销', hint: 'Ctrl+Z', keywords: 'undo', run: () => window.editorUndo?.() },
  { id: 'edit.redo', section: '编辑', title: '重做', hint: 'Ctrl+Y', keywords: 'redo', run: () => window.editorRedo?.() },
  { id: 'edit.find', section: '编辑', title: '文件内查找', hint: 'Ctrl+F', keywords: 'find search', run: () => { store.sidebarVisible = true; store.sidebarPanel = 'search' } },
  { id: 'edit.findGlobal', section: '编辑', title: '跨文件搜索', hint: 'Ctrl+Shift+F', keywords: 'global search', run: () => { store.sidebarVisible = true; store.sidebarPanel = 'search' } },
  { id: 'edit.table', section: '编辑', title: '格式化当前表格', hint: 'Shift+Alt+F', keywords: 'format table align', run: () => withEditor(formatTableAtCursor) },
  { id: 'edit.copyHtml', section: '编辑', title: '复制为 HTML', keywords: 'copy html clipboard', run: async () => {
    if (!store.activeTab) return
    const { parseMarkdown } = await import('@/core/markdown/parser')
    const html = await parseMarkdown(store.content, {
      filePath: store.activeTab?.filePath,
      projectRoot: store.projectRoot
    })
    await window.api?.copyHtmlToClipboard(html, store.content)
    store.notifyFileChange('已复制渲染后的 HTML')
  } },
  { id: 'file.history', section: '文件', title: '文件历史（本地快照）…', keywords: 'history snapshot recovery timeline', run: () => { if (store.activeTab?.filePath) store.showHistory = true } },
  // 格式
  { id: 'fmt.bold', section: '格式', title: '加粗', hint: 'Ctrl+B', keywords: 'bold', run: () => withEditor(v => toggleWrap(v, '**')) },
  { id: 'fmt.italic', section: '格式', title: '斜体', hint: 'Ctrl+I', keywords: 'italic', run: () => withEditor(v => toggleWrap(v, '*')) },
  { id: 'fmt.strike', section: '格式', title: '删除线', hint: 'Alt+Shift+5', keywords: 'strikethrough', run: () => withEditor(v => toggleWrap(v, '~~')) },
  ...[1, 2, 3, 4, 5, 6].map(n => ({
    id: `fmt.h${n}`, section: '格式', title: `标题 ${n}`, hint: `Ctrl+${n}`,
    keywords: 'heading title', run: () => withEditor(v => setHeading(v, n))
  })),
  { id: 'fmt.p', section: '格式', title: '正文段落', hint: 'Ctrl+0', keywords: 'paragraph plain', run: () => withEditor(v => setHeading(v, 0)) },
  // 插入
  { id: 'ins.link', section: '插入', title: '插入链接', hint: 'Ctrl+K', keywords: 'link url', run: () => withEditor(insertLink) },
  { id: 'ins.code', section: '插入', title: '插入代码块', hint: 'Ctrl+Shift+K', keywords: 'code block', run: () => withEditor(insertCodeBlock) },
  { id: 'ins.formula', section: '插入', title: '插入行内公式', hint: 'Ctrl+M', keywords: 'formula math inline katex', run: () => withEditor(v => insertFormula(v, false)) },
  { id: 'ins.formulaBlock', section: '插入', title: '插入块级公式', hint: 'Ctrl+Shift+M', keywords: 'formula math block katex', run: () => withEditor(v => insertFormula(v, true)) },
  // 视图
  { id: 'view.dual', section: '视图', title: '视图：双栏（编辑 + 预览）', keywords: 'dual view', run: () => { store.settings.viewMode = 'dual' } },
  { id: 'view.edit', section: '视图', title: '视图：仅编辑器', keywords: 'edit view', run: () => { store.settings.viewMode = 'edit' } },
  { id: 'view.preview', section: '视图', title: '视图：仅预览', keywords: 'preview view', run: () => { store.settings.viewMode = 'preview' } },
  { id: 'view.sidebar', section: '视图', title: '切换侧边栏', hint: 'Ctrl+Shift+B', keywords: 'toggle sidebar', run: () => { store.sidebarVisible = !store.sidebarVisible } },
  { id: 'view.focus', section: '视图', title: '专注模式：开 / 关', keywords: 'focus mode zen', run: () => { store.settings.focusMode = !store.settings.focusMode } },
  { id: 'view.typewriter', section: '视图', title: '打字机模式：开 / 关', keywords: 'typewriter mode', run: () => { store.settings.typewriterMode = !store.settings.typewriterMode } },
  { id: 'view.wordwrap', section: '视图', title: '自动换行：开 / 关', keywords: 'word wrap', run: () => { store.settings.wordWrap = !store.settings.wordWrap } },
  { id: 'view.scrollSync', section: '视图', title: '滚动同步：开 / 关', keywords: 'scroll sync', run: () => { store.settings.scrollSync = !store.settings.scrollSync } },
  // 主题
  { id: 'theme.light', section: '主题', title: '主题：浅色', keywords: 'light theme', run: () => { store.settings.theme = 'light' } },
  { id: 'theme.dark', section: '主题', title: '主题：深色', keywords: 'dark theme', run: () => { store.settings.theme = 'dark' } },
  { id: 'theme.system', section: '主题', title: '主题：跟随系统', keywords: 'system theme auto', run: () => { store.settings.theme = 'system' } },
  // 导出
  { id: 'export.pdf', section: '导出', title: '导出为 PDF…', keywords: 'export pdf', run: () => { store.exportFormat = 'pdf'; store.showExport = true } },
  { id: 'export.html', section: '导出', title: '导出为 HTML…', keywords: 'export html', run: () => { store.exportFormat = 'html'; store.showExport = true } },
  { id: 'export.png', section: '导出', title: '导出为 PNG 图片…', keywords: 'export image png', run: () => { store.exportFormat = 'png'; store.showExport = true } },
  // 应用
  { id: 'app.settings', section: '应用', title: '打开设置', hint: 'Ctrl+,', keywords: 'settings preferences', run: () => { store.showSettings = true } },
  { id: 'app.about', section: '应用', title: '关于 MdEv', keywords: 'about version', run: () => { store.showAbout = true } }
])

// ── Lifecycle ──
onMounted(async () => {
  window.addEventListener('keydown', onGlobalKeydown)
  await loadSavedSettings()
  initTheme()
  watchThemeChanges()
  const cleanupSystemTheme = startSystemThemeListener()
  listenForNativeTheme()
  watchSettingsChanges()
  startAutoSave()
  startPersistSession()
  startFileWatchListener()

  // ── 恢复上次未关闭的标签 / 文件夹 ──
  const restored = await restoreSession()
  if (!restored) {
  // ── 无会话记录：默认打开上次的文件夹和文件 ──
  if (store.recentFolders.length > 0) {
    const lastFolder = store.recentFolders[0].path
    if (lastFolder) {
      try {
        const result = await window.api?.readDirectory(lastFolder)
        if (result?.success) {
          store.collapseAllPaths()
          store.fileTree = result.tree
          store.setProjectRoot(lastFolder)
          store.expandPath(lastFolder)
          watchProjectFolder(lastFolder)
        }
      } catch {}
    }
  }
  if (store.recentFiles.length > 0) {
    const lastFile = store.recentFiles[0].path
    if (lastFile) {
      try {
        const ext = lastFile.toLowerCase().match(/\.([^.]+)$/)?.[1] || ''
        const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'ico', 'avif']
        if (!imageExts.includes(ext)) {
          const result = await window.api?.readFile(lastFile)
          if (result?.success) {
            const fileName = lastFile.split(/[\\/]/).pop()
            store.addTab(lastFile, result.content, fileName)
            // 兜底打开的文件同样刷新最近记录（更新 lastOpened 并置顶）
            store.addRecentFile(lastFile)
          }
        }
      } catch {}
    }
  }
  }

  // ── 通过 .md 文件关联 / 第二实例传入的文档 ──
  window.api?.onOpenFile?.(async (filePath) => {
    try {
      const result = await window.api.readFile(filePath)
      if (result?.success) {
        store.addTab(filePath, result.content, filePath.split(/[\\/]/).pop())
        store.addRecentFile(filePath)
      }
    } catch {}
  })

  if (window.api?.onMenuEvent) {
    window.api.onMenuEvent('menu:new-file', () => {
      store.addTab(null, '', '未命名.md')
    })
    window.api.onMenuEvent('menu:open-file', async () => {
      const filePath = await window.api.openFileDialog()
      if (filePath) {
        const ext = filePath.toLowerCase().match(/\.([^.]+)$/)?.[1] || ''
        const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'ico', 'avif']
        if (imageExts.includes(ext)) {
          await window.api.openPath(filePath)
          return
        }
        const result = await window.api.readFile(filePath)
        if (result?.success) {
          const fileName = filePath.split(/[\\/]/).pop()
          store.addTab(filePath, result.content, fileName)
          store.addRecentFile(filePath)
        }
      }
    })
    window.api.onMenuEvent('menu:open-folder', async () => {
      const folderPath = await window.api.openFolderDialog()
      if (folderPath) {
        const result = await window.api.readDirectory(folderPath)
        if (result?.success) {
          store.collapseAllPaths()
          store.fileTree = result.tree
          store.setProjectRoot(folderPath)
          store.expandPath(folderPath)
          watchProjectFolder(folderPath)
        }
      }
    })
    window.api.onMenuEvent('menu:save', () => saveNow())
    window.api.onMenuEvent('menu:save-as', () => saveAs())
    window.api.onMenuEvent('menu:export-pdf', () => {
      store.exportFormat = 'pdf'
      store.showExport = true
    })
    window.api.onMenuEvent('menu:export-html', () => {
      store.exportFormat = 'html'
      store.showExport = true
    })
    window.api.onMenuEvent('menu:find', () => {
      store.sidebarPanel = 'search'
    })
    window.api.onMenuEvent('menu:find-global', () => {
      store.sidebarPanel = 'search'
    })
    window.api.onMenuEvent('menu:settings', () => {
      store.showSettings = true
    })
    window.api.onMenuEvent('menu:toggle-sidebar', () => {
      store.sidebarVisible = !store.sidebarVisible
    })
    window.api.onMenuEvent('menu:toggle-wordwrap', (checked) => {
      store.settings.wordWrap = checked
      window.api.setSettings({ settings: { ...store.settings } })
    })
    window.api.onMenuEvent('menu:undo', () => {
      if (window.editorUndo) window.editorUndo()
    })
    window.api.onMenuEvent('menu:redo', () => {
      if (window.editorRedo) window.editorRedo()
    })
  }
})

onUnmounted(() => {
  window.removeEventListener('keydown', onGlobalKeydown)
  if (window.api?.removeMenuListener) {
    const channels = [
      'menu:new-file', 'menu:open-file', 'menu:open-folder',
      'menu:save', 'menu:save-as', 'menu:export-pdf', 'menu:export-html',
      'menu:find', 'menu:find-global', 'menu:settings', 'menu:toggle-sidebar',
      'menu:toggle-wordwrap', 'menu:undo', 'menu:redo'
    ]
    channels.forEach(c => window.api.removeMenuListener(c))
  }
})
</script>

<style scoped>
.main-content {
  display: flex;
  flex: 1;
  overflow: hidden;
}
.editor-area {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 200px;
  min-height: 0;
}
.preview-area {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 200px;
  min-height: 0;
}
.splitter {
  width: 5px;
  cursor: col-resize;
  background: transparent;
  flex-shrink: 0;
  position: relative;
  z-index: 10;
}
.splitter:hover,
.splitter:active {
  background: var(--accent-color);
}
</style>
