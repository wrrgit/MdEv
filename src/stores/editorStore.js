import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}

export const useEditorStore = defineStore('editor', () => {
  // ── 多标签 ──
  const tabs = ref([])
  const activeTabId = ref(null)

  const activeTab = computed(() => {
    return tabs.value.find(t => t.id === activeTabId.value) || null
  })

  // ── 项目 ──
  const projectRoot = ref(null)
  const fileTree = ref([])

  // ── 搜索 ──
  const searchQuery = ref('')
  const searchResults = ref([])
  const searchMode = ref('file')

  // ── UI ──
  const showWelcome = ref(true)
  const sidebarPanel = ref('filetree')
  const sidebarVisible = ref(true)
  const sidebarWidth = ref(260)
  const showSettings = ref(false)
  const showExport = ref(false)
  const showAbout = ref(false)
  const exportFormat = ref('pdf')

  // ── 设置 ──
  const settings = ref({
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
    viewMode: 'dual',
    autoSaveInterval: 3,
    defaultPanelFocus: 'filetree',
    recentFilesMax: 20,
    exportFileName: ''
  })

  // ── 最近文件 ──
  const recentFiles = ref([])
  const recentFolders = ref([])

  // ── 当前内容快捷访问 ──
  const content = computed({
    get: () => activeTab.value?.content || '',
    set: (val) => {
      if (activeTab.value) {
        activeTab.value.content = val
        activeTab.value.isDirty = true
      }
    }
  })

  // ── 标签操作 ──
  function addTab(filePath = null, content = '', fileName = '未命名.md') {
    const id = generateId()
    const tab = {
      id,
      filePath,
      fileName,
      content,
      isDirty: false,
      scrollPos: 0,
      cursorPos: { line: 0, col: 0 }
    }
    tabs.value.push(tab)
    activeTabId.value = id
    showWelcome.value = false
    return id
  }

  function closeTab(tabId) {
    const idx = tabs.value.findIndex(t => t.id === tabId)
    if (idx === -1) return

    tabs.value.splice(idx, 1)

    if (activeTabId.value === tabId) {
      if (tabs.value.length > 0) {
        const newIdx = Math.min(idx, tabs.value.length - 1)
        activeTabId.value = tabs.value[newIdx].id
      } else {
        activeTabId.value = null
        showWelcome.value = true
      }
    }
  }

  function closeOtherTabs(tabId) {
    tabs.value = tabs.value.filter(t => t.id === tabId)
    activeTabId.value = tabId
  }

  function closeRightTabs(tabId) {
    const idx = tabs.value.findIndex(t => t.id === tabId)
    if (idx !== -1) {
      tabs.value = tabs.value.slice(0, idx + 1)
    }
  }

  function setActiveTab(tabId) {
    activeTabId.value = tabId
    showWelcome.value = false
  }

  function updateTabOrder(newOrder) {
    tabs.value = newOrder
  }

  function markAsSaved() {
    if (activeTab.value) {
      activeTab.value.isDirty = false
    }
  }

  // ── 最近文件 ──
  function addRecentFile(filePath) {
    const existing = recentFiles.value.findIndex(f => f.path === filePath)
    if (existing !== -1) {
      const f = recentFiles.value.splice(existing, 1)[0]
      f.lastOpened = new Date().toISOString()
      recentFiles.value.unshift(f)
    } else {
      recentFiles.value.unshift({
        path: filePath,
        fileName: filePath.split(/[\\/]/).pop(),
        pinned: false,
        lastOpened: new Date().toISOString()
      })
      if (recentFiles.value.length > settings.value.recentFilesMax) {
        recentFiles.value = recentFiles.value.slice(0, settings.value.recentFilesMax)
      }
    }
  }

  function addRecentFolder(folderPath) {
    const existing = recentFolders.value.findIndex(f => f.path === folderPath)
    if (existing !== -1) {
      const f = recentFolders.value.splice(existing, 1)[0]
      f.lastOpened = new Date().toISOString()
      recentFolders.value.unshift(f)
    } else {
      recentFolders.value.unshift({
        path: folderPath,
        folderName: folderPath.split(/[\\/]/).pop(),
        pinned: false,
        lastOpened: new Date().toISOString()
      })
    }
  }

  function toggleRecentPin(type, path) {
    const list = type === 'file' ? recentFiles.value : recentFolders.value
    const item = list.find(f => f.path === path)
    if (item) item.pinned = !item.pinned
  }

  function reorderRecent(type, newList) {
    if (type === 'file') recentFiles.value = newList
    else recentFolders.value = newList
  }

  // ── 项目 ──
  function setProjectRoot(path) {
    projectRoot.value = path
    addRecentFolder(path)
  }

  // ── 持久化 ──
  function loadSettings(saved) {
    if (saved) {
      Object.assign(settings.value, saved)
    }
  }

  function loadRecentData(data) {
    if (data?.recentFiles) recentFiles.value = data.recentFiles
    if (data?.recentFolders) recentFolders.value = data.recentFolders
  }

  return {
    tabs, activeTabId, activeTab,
    projectRoot, fileTree,
    searchQuery, searchResults, searchMode,
    showWelcome, sidebarPanel, sidebarVisible, sidebarWidth, showSettings, showExport, showAbout, exportFormat,
    settings,
    recentFiles, recentFolders,
    content,
    addTab, closeTab, closeOtherTabs, closeRightTabs, setActiveTab,
    updateTabOrder, markAsSaved,
    addRecentFile, addRecentFolder, toggleRecentPin, reorderRecent,
    setProjectRoot,
    loadSettings, loadRecentData
  }
})
