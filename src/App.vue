<template>
  <div class="app-container" ref="appContainer">
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

// ── 全局快捷键：Ctrl+P 快速打开 ──
function onGlobalKeydown(e) {
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'p') {
    e.preventDefault()
    if (store.projectRoot) store.showQuickOpen = !store.showQuickOpen
  }
}

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
          }
        }
      } catch {}
    }
  }
  }

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
