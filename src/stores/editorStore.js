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
  const expandedPaths = ref(new Set())

  function isPathExpanded(path) {
    return expandedPaths.value.has(path)
  }

  function togglePathExpanded(path) {
    const s = expandedPaths.value
    if (s.has(path)) {
      s.delete(path)
    } else {
      s.add(path)
    }
    expandedPaths.value = new Set(s)
  }

  function collapseAllPaths() {
    expandedPaths.value = new Set()
  }

  function expandPath(path) {
    const s = expandedPaths.value
    s.add(path)
    expandedPaths.value = new Set(s)
  }

  // ── 搜索 ──
  const searchQuery = ref('')
  const searchResults = ref([])
  const searchMode = ref('file')
  // 预览区搜索词高亮
  const searchHighlightTerm = ref('')

  // ── UI ──
  const showWelcome = ref(true)
  const sidebarPanel = ref('filetree')
  const sidebarVisible = ref(true)
  const sidebarWidth = ref(260)
  const showSettings = ref(false)
  const showExport = ref(false)
  const showAbout = ref(false)
  const showQuickOpen = ref(false)
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

  // ── 光标位置 ──
  const cursorLine = ref(1)
  const cursorCol = ref(1)

  // ── 选中文本（状态栏选中统计用）──
  const selectionText = ref('')

  // ── 滚动联动（源码行映射：{source: 'editor'|'preview', line: 文档行号}）──
  const scrollSyncSource = ref(null)

  // ── TOC 当前章节所在行（滚动时自动更新）──
  const currentTocLine = ref(0)

  // ── 文件外部变更通知（状态栏短暂显示）──
  const fileChangeNotice = ref('')
  let fileChangeNoticeTimer = null
  function notifyFileChange(msg, ms = 4000) {
    fileChangeNotice.value = msg
    if (fileChangeNoticeTimer) clearTimeout(fileChangeNoticeTimer)
    fileChangeNoticeTimer = setTimeout(() => { fileChangeNotice.value = '' }, ms)
  }

  // 应用内最近一次保存时间戳（用于忽略 watcher 自触发）
  const lastAppSaveTime = ref(0)
  function markAppSave() { lastAppSaveTime.value = Date.now() }

  // 外部重载时短暂抑制自动保存（内容来自磁盘，无需回写）
  const suppressAutoSave = ref(false)

  // ── 标签操作 ──
  function addTab(filePath = null, content = '', fileName = '未命名.md') {
    // 去重：同一路径的文件已打开时，直接激活已有标签页（避免重复标签）
    if (filePath) {
      const existing = tabs.value.find(t => t.filePath === filePath)
      if (existing) {
        activeTabId.value = existing.id
        showWelcome.value = false
        return existing.id
      }
    }
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

  function applyExpandedToTree(nodes) {
    for (const n of nodes) {
      if (n.type === 'directory') {
        n.isExpanded = expandedPaths.value.has(n.path)
        if (n.children) applyExpandedToTree(n.children)
      }
    }
  }

  // ── 文件树重命名/删除联动 ──
  function isPathUnder(childPath, parentPath) {
    return childPath.startsWith(parentPath + '\\') || childPath.startsWith(parentPath + '/')
  }

  function handlePathRenamed(oldPath, newPath) {
    const newName = newPath.split(/[\\/]/).pop()
    // 更新已打开标签的文件路径（含目录重命名时其下所有文件）
    for (const t of tabs.value) {
      if (!t.filePath) continue
      if (t.filePath === oldPath) {
        t.filePath = newPath
        t.fileName = newName
      } else if (isPathUnder(t.filePath, oldPath)) {
        t.filePath = newPath + t.filePath.slice(oldPath.length)
      }
    }
    // 同步展开状态
    const s = new Set()
    for (const p of expandedPaths.value) {
      if (p === oldPath) s.add(newPath)
      else if (isPathUnder(p, oldPath)) s.add(newPath + p.slice(oldPath.length))
      else s.add(p)
    }
    expandedPaths.value = s
  }

  function handlePathDeleted(targetPath) {
    // 关闭被删除文件（或目录下文件）的标签页
    const toClose = tabs.value.filter(t => t.filePath && (t.filePath === targetPath || isPathUnder(t.filePath, targetPath)))
    for (const t of toClose) closeTab(t.id)
    // 清理展开状态
    const s = new Set()
    for (const p of expandedPaths.value) {
      if (p !== targetPath && !isPathUnder(p, targetPath)) s.add(p)
    }
    expandedPaths.value = s
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
    projectRoot, fileTree, expandedPaths,
    isPathExpanded, togglePathExpanded, collapseAllPaths, expandPath,
    applyExpandedToTree,
    searchQuery, searchResults, searchMode, searchHighlightTerm,
    showWelcome, sidebarPanel, sidebarVisible, sidebarWidth, showSettings, showExport, showAbout, showQuickOpen, exportFormat,
    settings,
    recentFiles, recentFolders,
    content,
    cursorLine, cursorCol,
    selectionText,
    scrollSyncSource,
    currentTocLine,
    fileChangeNotice, notifyFileChange,
    lastAppSaveTime, markAppSave,
    suppressAutoSave,
    addTab, closeTab, closeOtherTabs, closeRightTabs, setActiveTab,
    updateTabOrder, markAsSaved,
    addRecentFile, addRecentFolder, toggleRecentPin, reorderRecent,
    setProjectRoot,
    handlePathRenamed, handlePathDeleted,
    loadSettings, loadRecentData
  }
})
