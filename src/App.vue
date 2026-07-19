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
  </div>
</template>

<script setup>
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useEditorStore } from '@/stores/editorStore'
import { useTheme } from '@/composables/useTheme'
import { useAutoSave } from '@/composables/useAutoSave'
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

// ── Lifecycle ──
onMounted(async () => {
  await loadSavedSettings()
  initTheme()
  watchThemeChanges()
  const cleanupSystemTheme = startSystemThemeListener()
  listenForNativeTheme()
  watchSettingsChanges()
  startAutoSave()

  if (window.api?.onMenuEvent) {
    window.api.onMenuEvent('menu:new-file', () => {
      store.addTab(null, '', '未命名.md')
    })
    window.api.onMenuEvent('menu:open-file', async () => {
      const filePath = await window.api.openFileDialog()
      if (filePath) {
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
          store.fileTree = result.tree
          store.setProjectRoot(folderPath)
        }
      }
    })
    window.api.onMenuEvent('menu:save', () => saveNow())
    window.api.onMenuEvent('menu:save-as', () => saveAs())
    window.api.onMenuEvent('menu:export-pdf', () => {
      store.exportFormat = 'pdf'
      store.showExport = true
    })
    window.api.onMenuEvent('menu:export-image', () => {
      store.exportFormat = 'image'
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
  }
})

onUnmounted(() => {
  if (window.api?.removeMenuListener) {
    const channels = [
      'menu:new-file', 'menu:open-file', 'menu:open-folder',
      'menu:save', 'menu:save-as', 'menu:export-pdf', 'menu:export-image', 'menu:export-html',
      'menu:find', 'menu:find-global', 'menu:settings', 'menu:toggle-sidebar',
      'menu:toggle-wordwrap'
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
