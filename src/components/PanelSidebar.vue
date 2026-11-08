<template>
  <div class="panel-sidebar" :class="{ collapsed: (!hasTabs && !hasFileTree) || !store.sidebarVisible }" :style="{ width: store.sidebarWidth + 'px' }">
    <div class="sidebar-tabs">
      <button
        v-for="panel in panels"
        :key="panel.id"
        class="sidebar-tab"
        :class="{ active: store.sidebarPanel === panel.id }"
        @click="store.sidebarPanel = panel.id"
        :title="panel.label"
      >
        <span v-html="panel.icon"></span>
      </button>
      <div class="sidebar-tabs-spacer"></div>
      <button
        class="sidebar-tab font-btn"
        @click="decreaseFontSize"
        title="缩小字体"
      >
        <span class="font-label-small">A</span><span class="font-suffix">−</span>
      </button>
      <button
        class="sidebar-tab font-btn"
        @click="increaseFontSize"
        title="增大字体"
      >
        <span class="font-label-large">A</span><span class="font-suffix">+</span>
      </button>
      <button
        class="sidebar-tab theme-toggle-btn"
        @click="cycleTheme"
        :title="themeTooltip"
      >
        <span v-html="themeIcon"></span>
      </button>
      <button
        class="sidebar-tab settings-tab"
        @click="store.showSettings = true"
        title="设置"
      >
        <span v-html="settingsIcon"></span>
      </button>
    </div>
    <div class="sidebar-content">
      <div v-if="store.sidebarPanel === 'filetree'" class="sidebar-panel">
        <div v-if="store.projectRoot" class="panel-header">
          <div class="project-root-info" @click="toggleRootExpand" :title="store.projectRoot">
            <span class="root-arrow" :class="{ expanded: store.isPathExpanded(store.projectRoot) }">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M5.7 13.7a1 1 0 0 1 0-1.4L9.58 8 5.7 3.7a1 1 0 0 1 1.4-1.4l4.59 4.58a1 1 0 0 1 0 1.41L7.12 12.7a1 1 0 0 1-1.41 0z"/></svg>
            </span>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style="opacity:0.6;flex-shrink:0"><path d="M1.5 2.5h4.3l1.2 1.5h7.5v9.5H1.5V2.5z"/><path d="M1.5 5h13l-1.5 8.5H3L1.5 5z"/></svg>
            <span class="project-root-name">{{ projectRootName }}</span>
          </div>
          <div class="panel-header-actions">
            <button class="panel-action-btn" @click="expandAll" title="展开全部">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a1 1 0 00-.7.3L3.3 5.3a1 1 0 101.4 1.4L8 3.82l3.3 3.3a1 1 0 001.4-1.42L8.7 1.3A1 1 0 008 1zM8 6a1 1 0 00-.7.3L3.3 10.3a1 1 0 101.4 1.4L8 8.82l3.3 3.3a1 1 0 001.4-1.42L8.7 6.3A1 1 0 008 6z"/></svg>
            </button>
            <button class="panel-action-btn" @click="collapseAll" title="折叠全部">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 14a1 1 0 00.7-.3L12.7 9.7a1 1 0 10-1.4-1.4L8 11.18 5.7 8.3A1 1 0 004.3 9.7l3.3 3.3A1 1 0 008 14zM8 9a1 1 0 00.7-.3L12.7 4.7a1 1 0 10-1.4-1.4L8 6.18 5.7 3.3A1 1 0 104.3 4.7l3.3 3.3A1 1 0 008 9z"/></svg>
            </button>
            <button class="panel-action-btn" @click="onNewFile" title="新建文件">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M12 7H9V4a1 1 0 00-2 0v3H4a1 1 0 000 2h3v3a1 1 0 002 0V9h3a1 1 0 000-2z"/></svg>
            </button>
            <button class="panel-action-btn" @click="onNewFolder" title="新建文件夹">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M1.5 2.5h4.3l1.2 1.5H14a1 1 0 011 1v8a1 1 0 01-1 1H2a1 1 0 01-1-1V3a.5.5 0 01.5-.5zm8.5 5h-2v2H7v-2H5V6h2V4h1v2h2v1z"/></svg>
            </button>
            <button class="panel-action-btn" @click="openFolder" title="打开文件夹">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a1 1 0 00-.7.3L4.58 4H2a2 2 0 00-2 2v7a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-2.58L8.7 1.3A1 1 0 008 1zm0 1.41l2.3 2.3a1 1 0 00.7.29H14a1 1 0 011 1v7a1 1 0 01-1 1H2a1 1 0 01-1-1V6a1 1 0 011-1h2a1 1 0 00.7-.3L8 2.42z"/></svg>
            </button>
          </div>
        </div>
        <div class="panel-header" v-else>
          <span class="panel-header-title">文件</span>
          <div class="panel-header-actions">
            <button class="panel-action-btn" @click="openFolder" title="打开文件夹">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a1 1 0 00-.7.3L4.58 4H2a2 2 0 00-2 2v7a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-2.58L8.7 1.3A1 1 0 008 1zm0 1.41l2.3 2.3a1 1 0 00.7.29H14a1 1 0 011 1v7a1 1 0 01-1 1H2a1 1 0 01-1-1V6a1 1 0 011-1h2a1 1 0 00.7-.3L8 2.42z"/></svg>
            </button>
          </div>
        </div>
        <div class="file-tree-area" v-if="store.projectRoot && store.fileTree.length > 0 && store.isPathExpanded(store.projectRoot)">
          <FileTree :nodes="store.fileTree" :depth="0" />
        </div>
        <div class="file-tree-area" v-else-if="!store.projectRoot && openFileNodes.length > 0">
          <div class="open-files-title">已打开的文件</div>
          <FileTree :nodes="openFileNodes" :depth="0" />
        </div>
        <div class="empty-state" v-else-if="!store.projectRoot || store.fileTree.length === 0">
          <div class="empty-icon">
            <svg width="48" height="48" viewBox="0 0 16 16" fill="var(--text-muted)" opacity="0.4">
              <path d="M1.5 2.5h4.3l1.2 1.5h7.5v9.5H1.5V2.5z"/>
              <path d="M1.5 5h13l-1.5 8.5H3L1.5 5z"/>
            </svg>
          </div>
          <p class="empty-text">打开文件夹以浏览文件</p>
          <button class="open-folder-btn" @click="openFolder">打开文件夹</button>
        </div>
      </div>

      <div v-if="store.sidebarPanel === 'recent'" class="sidebar-panel">
        <div class="panel-header">
          <span class="panel-header-title">最近打开</span>
          <div class="panel-header-actions" v-if="store.recentFiles.length > 0 || store.recentFolders.length > 0">
            <button class="panel-action-btn" @click="clearRecent" title="清空列表">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2 0A.5.5 0 0 1 8 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/><path d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4L4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3h11V2h-11v1z"/></svg>
            </button>
          </div>
        </div>
        <div class="recent-content">
          <div v-if="store.recentFolders.length > 0" class="recent-section">
            <div class="recent-section-title">文件夹</div>
            <div
              v-for="folder in store.recentFolders"
              :key="folder.path"
              class="recent-item"
              @click="openRecentFolder(folder.path)"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="opacity:0.6;flex-shrink:0"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/></svg>
              <div class="recent-item-info">
                <span class="recent-item-name">{{ folder.folderName }}</span>
                <span class="recent-item-path" :title="folder.path">{{ folder.path }}</span>
              </div>
            </div>
          </div>
          <div v-if="store.recentFiles.length > 0" class="recent-section">
            <div class="recent-section-title">文件</div>
            <div
              v-for="file in store.recentFiles"
              :key="file.path"
              class="recent-item"
              @click="openRecentFile(file.path)"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="opacity:0.6;flex-shrink:0"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              <div class="recent-item-info">
                <span class="recent-item-name">{{ file.fileName }}</span>
                <span class="recent-item-path" :title="file.path">{{ file.path }}</span>
              </div>
            </div>
          </div>
          <div v-if="store.recentFiles.length === 0 && store.recentFolders.length === 0" class="empty-state">
            <p>暂无最近打开记录</p>
          </div>
        </div>
      </div>

      <div v-if="store.sidebarPanel === 'toc'" class="sidebar-panel">
        <div class="panel-header">
          <span>目录</span>
          <div class="panel-header-actions" v-if="tocItems.length > 0">
            <button class="panel-action-btn" @click="tocExpandAll" title="展开全部">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a1 1 0 00-.7.3L3.3 5.3a1 1 0 101.4 1.4L8 3.82l3.3 3.3a1 1 0 001.4-1.42L8.7 1.3A1 1 0 008 1zM8 6a1 1 0 00-.7.3L3.3 10.3a1 1 0 101.4 1.4L8 8.82l3.3 3.3a1 1 0 001.4-1.42L8.7 6.3A1 1 0 008 6z"/></svg>
            </button>
            <button class="panel-action-btn" @click="tocCollapseAll" title="折叠全部">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 14a1 1 0 00.7-.3L12.7 9.7a1 1 0 10-1.4-1.4L8 11.18 5.7 8.3A1 1 0 004.3 9.7l3.3 3.3A1 1 0 008 14zM8 9a1 1 0 00.7-.3L12.7 4.7a1 1 0 10-1.4-1.4L8 6.18 5.7 3.3A1 1 0 104.3 4.7l3.3 3.3A1 1 0 008 9z"/></svg>
            </button>
          </div>
        </div>
        <div class="toc-content" v-if="tocTreeItems.length > 0">
          <div
            v-for="item in tocTreeItems"
            :key="item.line"
            class="toc-item"
            :class="{ active: item.line === activeTocLine }"
            :style="{ paddingLeft: (item.level - 1) * 16 + 8 + 'px' }"
            @click="onTocItemClick(item)"
          >
            <span
              v-if="item.hasChildren"
              class="toc-arrow"
              :class="{ expanded: !item.collapsed }"
              :title="item.collapsed ? '展开' : '折叠'"
              @click.stop="toggleTocCollapsed(item.line)"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M5.7 13.7a1 1 0 0 1 0-1.4L9.58 8 5.7 3.7a1 1 0 0 1 1.4-1.4l4.59 4.58a1 1 0 0 1 0 1.41L7.12 12.7a1 1 0 0 1-1.41 0z"/></svg>
            </span>
            <span v-else class="toc-arrow toc-arrow-leaf"></span>
            <span class="toc-text">{{ item.text }}</span>
          </div>
        </div>
        <div class="empty-state" v-else>
          <p>当前文档无标题</p>
        </div>
      </div>

      <div v-if="store.sidebarPanel === 'search'" class="sidebar-panel">
        <div class="panel-header">
          <span>搜索</span>
          <div class="panel-header-actions">
            <button class="panel-action-btn" @click="doSearch" title="搜索 (Enter)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </button>
          </div>
        </div>
        <div class="search-box">
          <input
            ref="searchInputEl"
            v-model="searchInput"
            type="text"
            placeholder="搜索…  (↑/↓ 切换 · Enter 下一个 · Esc 退出)"
            class="search-input"
            @keydown.enter.prevent="onSearchEnter"
            @keydown.down.prevent="onResultNav(1)"
            @keydown.up.prevent="onResultNav(-1)"
            @keydown.esc="onSearchEsc"
          />
          <select v-model="searchScope" class="search-scope" @change="onScopeChange">
            <option value="file">文件内</option>
            <option value="open">打开的文件</option>
            <option value="project">跨文件</option>
          </select>
        </div>
        <div class="search-meta" v-if="hasSearched">
          <template v-if="searchResults.length > 0">找到 {{ searchResults.length }} 个匹配</template>
          <template v-else>无匹配项</template>
        </div>
        <div class="search-results" v-if="groupedResults.length > 0">
          <div v-for="group in groupedResults" :key="group.label" class="search-group">
            <div class="search-group-header" :title="group.label">
              <span class="search-group-name">{{ group.label }}</span>
              <span class="search-group-count">{{ group.items.length }}</span>
            </div>
            <div
              v-for="item in group.items"
              :key="item._idx"
              class="search-result-item"
              :class="{ active: item._idx === activeResultIndex }"
              @click="navigateToResult(item, true)"
            >
              <span class="line-num">{{ item.line }}</span>
              <span class="line-content" v-html="highlightMatch(item.lineContent, item.matches)"></span>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="sidebar-splitter" @mousedown="startSplitDrag"></div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { useEditorStore } from '@/stores/editorStore'
import { setSearchQuery, SearchQuery } from '@codemirror/search'
import FileTree from './FileTree.vue'

const store = useEditorStore()
const searchInput = ref('')
const searchScope = ref('file')
const searchResults = ref([])
const searchInputEl = ref(null)
const activeResultIndex = ref(0)
const hasSearched = ref(false)

// 输入清空时同步清除预览区搜索高亮
watch(searchInput, (val) => {
  if (!val) {
    store.searchHighlightTerm = ''
    searchResults.value = []
    hasSearched.value = false
  }
})

// 搜索结果变化：重置当前高亮项
watch(searchResults, () => { activeResultIndex.value = 0 })

// Ctrl+F / 菜单 / 命令面板发起的「聚焦搜索框」请求：预置范围并聚焦
watch(() => store.searchFocusRequest, () => {
  if (store.searchActivateScope && ['file', 'open', 'project'].includes(store.searchActivateScope)) {
    searchScope.value = store.searchActivateScope
  }
  nextTick(() => {
    const el = searchInputEl.value
    // 若搜索框为空且编辑器有选区，预填选区首行文本（选中即搜）
    if (el && !searchInput.value) {
      const view = window.editorRef
      if (view) {
        const sel = view.state.selection.main
        if (!sel.empty) {
          const raw = view.state.sliceDoc(sel.from, sel.to).trim()
          const firstLine = raw.split(/\r?\n/)[0].trim()
          if (firstLine) searchInput.value = firstLine
        }
      }
    }
    if (el) {
      el.focus()
      if (searchInput.value) el.select()
    }
    // 预填后若已有词，立即执行一次搜索，结果即时可见
    if (searchInput.value) doSearch()
  })
})

// 右键菜单等处发起的搜索请求：填入搜索词与范围后立即执行
watch(() => store.searchRequest, async (req) => {
  if (!req || !req.term) return
  store.sidebarPanel = 'search'
  store.sidebarVisible = true
  searchInput.value = req.term
  searchScope.value = req.scope || 'file'
  await nextTick()
  doSearch()
  store.searchRequest = null
})

// 按文件分组展示搜索结果（文件内范围无 tabId，relativePath 为文件名；跨文件为路径）
const groupedResults = computed(() => {
  const map = new Map()
  searchResults.value.forEach((r, idx) => {
    const key = r.relativePath || r.file || '(未知文件)'
    if (!map.has(key)) map.set(key, { label: key, items: [] })
    map.get(key).items.push({ ...r, _idx: idx })
  })
  return Array.from(map.values())
})

// Enter：无结果时执行搜索；已有结果时跳转到当前高亮项
function onSearchEnter() {
  if (searchResults.value.length === 0) {
    doSearch()
    return
  }
  navigateToResult(searchResults.value[activeResultIndex.value], false)
}

// ↑/↓：在结果间移动并实时跳转（编辑区 + 预览区同步高亮），不抢夺输入框焦点
function onResultNav(dir) {
  const n = searchResults.value.length
  if (n === 0) { doSearch(); return }
  activeResultIndex.value = (activeResultIndex.value + dir + n) % n
  navigateToResult(searchResults.value[activeResultIndex.value], false)
}

function onSearchEsc() {
  searchInputEl.value?.blur()
}

function onScopeChange() {
  if (searchInput.value.trim()) doSearch()
}

const hasTabs = computed(() => store.tabs.length > 0)
const hasFileTree = computed(() => store.fileTree.length > 0)

// 未打开文件夹时，侧栏列出已打开的文件（可右键重命名/删除/定位）
const openFileNodes = computed(() => {
  return store.tabs
    .filter(t => t.filePath)
    .map(t => ({
      name: t.fileName,
      path: t.filePath,
      type: 'file',
      ext: (t.fileName.match(/\.[^.]+$/) || [''])[0].toLowerCase()
    }))
})

const projectRootName = computed(() => {
  if (!store.projectRoot) return ''
  return store.projectRoot.split(/[\\/]/).pop()
})

// ── 主题切换 ──
const sunIcon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.05" y2="7.05"/><line x1="16.95" y1="16.95" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.05" y2="16.95"/><line x1="16.95" y1="7.05" x2="19.07" y2="4.93"/></svg>'
const moonIcon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>'

const settingsIcon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>'

const resolvedTheme = computed(() => {
  if (store.settings.theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return store.settings.theme
})

const themeIcon = computed(() => {
  return resolvedTheme.value === 'dark' ? sunIcon : moonIcon
})

const themeTooltip = computed(() => {
  const map = { light: '浅色', dark: '深色', system: `跟随系统（当前${resolvedTheme.value === 'dark' ? '深色' : '浅色'}）` }
  const next = resolvedTheme.value === 'dark' ? '浅色' : '深色'
  return `当前：${map[store.settings.theme] || '浅色'}，点击切换到${next}`
})

// 侧栏图标直接翻转明暗，避免经过“跟随系统”时系统恰为同一模式、图标看起来没反应
function cycleTheme() {
  store.settings.theme = resolvedTheme.value === 'dark' ? 'light' : 'dark'
}

function increaseFontSize() {
  const s = store.settings
  s.editorFontSize = Math.min(32, s.editorFontSize + 1)
  s.previewFontSize = Math.min(32, s.previewFontSize + 1)
}

function decreaseFontSize() {
  const s = store.settings
  s.editorFontSize = Math.max(10, s.editorFontSize - 1)
  s.previewFontSize = Math.max(10, s.previewFontSize - 1)
}

async function onNewFile() {
  if (!store.projectRoot) return
  const name = await window.api?.showInputBox({ title: '新建文件', label: '文件名：', value: 'untitled.md' })
  if (!name) return
  const sep = store.projectRoot.includes('/') ? '/' : '\\'
  const filePath = store.projectRoot + sep + name
  const exists = await window.api?.exists(filePath)
  if (exists) {
    alert('文件已存在')
    return
  }
  const result = await window.api?.createFile(filePath)
  if (result?.success) {
    await refreshTree()
  }
}

async function onNewFolder() {
  if (!store.projectRoot) return
  const name = await window.api?.showInputBox({ title: '新建文件夹', label: '文件夹名：', value: 'new-folder' })
  if (!name) return
  const sep = store.projectRoot.includes('/') ? '/' : '\\'
  const dirPath = store.projectRoot + sep + name
  const exists = await window.api?.exists(dirPath)
  if (exists) {
    alert('文件夹已存在')
    return
  }
  const result = await window.api?.createDirectory(dirPath)
  if (result?.success) {
    await refreshTree()
  }
}

async function refreshTree() {
  if (!store.projectRoot) return
  const result = await window.api?.readDirectory(store.projectRoot)
  if (result?.success) {
    store.applyExpandedToTree(result.tree)
    store.fileTree = result.tree
  }
}

function startSplitDrag(e) {
  e.preventDefault()
  const startX = e.clientX
  const startWidth = store.sidebarWidth

  function onMove(ev) {
    let w = startWidth + (ev.clientX - startX)
    w = Math.max(120, Math.min(500, w))
    store.sidebarWidth = w
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

const panels = [
  { id: 'filetree', label: '资源管理器', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/></svg>' },
  { id: 'recent', label: '最近打开', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>' },
  { id: 'toc', label: '目录', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><circle cx="5" cy="6" r="1.2" fill="currentColor"/><circle cx="5" cy="12" r="1.2" fill="currentColor"/><circle cx="5" cy="18" r="1.2" fill="currentColor"/></svg>' },
  { id: 'search', label: '搜索', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>' }
]

const tocItems = computed(() => {
  if (!store.activeTab) return []
  const lines = store.content.split('\n')
  const items = []
  lines.forEach((line, idx) => {
    const match = line.match(/^(#{1,6})\s+(.+)$/)
    if (match) {
      items.push({
        level: match[1].length,
        text: match[2].trim(),
        line: idx + 1
      })
    }
  })
  return items
})

const activeTocLine = computed(() => store.currentTocLine || 0)

// ── 目录树折叠/展开 ──
// 折叠状态：按标题行号记录（行号在文档内唯一）
const collapsedTocLines = ref(new Set())

// 在扁平标题列表上标注 hasChildren/collapsed，并过滤掉被折叠祖先隐藏的项
const tocTreeItems = computed(() => {
  const items = tocItems.value
  const result = []
  const stack = [] // 祖先栈：{ level, line }
  for (let i = 0; i < items.length; i++) {
    const it = items[i]
    // 弹出同级或更深（非祖先）的项，栈内只保留 level 更小的真正祖先
    while (stack.length && stack[stack.length - 1].level >= it.level) stack.pop()
    const hidden = stack.some(a => collapsedTocLines.value.has(a.line))
    const next = items[i + 1]
    const hasChildren = !!(next && next.level > it.level)
    const collapsed = collapsedTocLines.value.has(it.line)
    if (!hidden) result.push({ ...it, hasChildren, collapsed })
    stack.push({ level: it.level, line: it.line })
  }
  return result
})

function toggleTocCollapsed(line) {
  const s = new Set(collapsedTocLines.value)
  if (s.has(line)) s.delete(line)
  else s.add(line)
  collapsedTocLines.value = s
}

function tocExpandAll() {
  collapsedTocLines.value = new Set()
}

function tocCollapseAll() {
  const items = tocItems.value
  const s = new Set()
  for (let i = 0; i < items.length; i++) {
    const next = items[i + 1]
    if (next && next.level > items[i].level) s.add(items[i].line)
  }
  collapsedTocLines.value = s
}

// 去除 markdown 行内标记，得到纯文本（TOC 的 item.text 含原始标记，需与渲染后 textContent 对齐）
function stripMarkdown(s) {
  return s
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .trim()
}

function jumpToLine(line) {
  const editor = window.editorRef
  if (editor) {
    try {
      const pos = editor.state.doc.line(line).from
      editor.dispatch({
        selection: { anchor: pos },
        // x:'nearest' 在命中内容需要左右滑动（水平滚动）时也把它带入可视区
        scrollIntoView: { y: 'start', x: 'nearest' }
      })
      editor.focus()
    } catch {}
  }
}

// 预览视图跳转：优先通过源码行号精确定位，失败时回退到文本匹配
function scrollToPreviewHeading(item) {
  const previewScroll = document.querySelector('.preview-scroll')
  if (!previewScroll) return

  const byLine = previewScroll.querySelector(`[data-source-line="${item.line}"]`)
  if (byLine) {
    const rect = byLine.getBoundingClientRect()
    const containerRect = previewScroll.getBoundingClientRect()
    previewScroll.scrollTop += (rect.top - containerRect.top) - 8
    byLine.classList.add('toc-flash')
    setTimeout(() => byLine.classList.remove('toc-flash'), 1200)
    return
  }

  // fallback：按标题级别+文本匹配
  const tag = 'h' + item.level
  const headings = previewScroll.querySelectorAll(tag)
  const targetText = stripMarkdown(item.text)
  let found = null
  for (const h of headings) {
    if (h.textContent.trim() === targetText) { found = h; break }
  }
  if (!found) {
    for (const h of headings) {
      const ht = h.textContent.trim()
      if (ht && (ht.includes(targetText) || targetText.includes(ht))) { found = h; break }
    }
  }
  if (found) {
    const rect = found.getBoundingClientRect()
    const containerRect = previewScroll.getBoundingClientRect()
    previewScroll.scrollTop += (rect.top - containerRect.top) - 8
    found.classList.add('toc-flash')
    setTimeout(() => found.classList.remove('toc-flash'), 1200)
  }
}

function onTocItemClick(item) {
  jumpToLine(item.line)
  scrollToPreviewHeading(item)
}

async function openFolder() {
  const folderPath = await window.api?.openFolderDialog()
  if (folderPath) {
    const result = await window.api?.readDirectory(folderPath)
    if (result?.success) {
      store.collapseAllPaths()
      store.fileTree = result.tree
      store.setProjectRoot(folderPath)
      store.expandPath(folderPath)
    }
  }
}

async function openRecentFile(filePath) {
  if (!filePath) return
  const ext = filePath.toLowerCase().match(/\.([^.]+)$/)?.[1] || ''
  const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'ico', 'avif']
  if (imageExts.includes(ext)) {
    await window.api?.openPath(filePath)
    return
  }
  const result = await window.api?.readFile(filePath)
  if (result?.success) {
    const fileName = filePath.split(/[\\/]/).pop()
    store.addTab(filePath, result.content, fileName)
    store.addRecentFile(filePath)
  }
}

async function openRecentFolder(folderPath) {
  if (!folderPath) return
  const result = await window.api?.readDirectory(folderPath)
  if (result?.success) {
    store.collapseAllPaths()
    store.fileTree = result.tree
    store.setProjectRoot(folderPath)
    store.expandPath(folderPath)
  }
}

function clearRecent() {
  if (confirm('确定清空所有最近打开记录吗？')) {
    store.recentFiles = []
    store.recentFolders = []
    window.api?.setSettings({ recentFiles: [], recentFolders: [] })
  }
}

function toggleRootExpand() {
  if (store.projectRoot) {
    store.togglePathExpanded(store.projectRoot)
  }
}

// 展开全部 / 折叠全部（折叠后保留项目根可见）
function expandAll() {
  store.expandAllPaths()
}

function collapseAll() {
  store.collapseAllPaths()
  if (store.projectRoot) store.expandPath(store.projectRoot)
}

async function doSearch() {
  if (!searchInput.value.trim()) return
  hasSearched.value = true

  // 预览区搜索词高亮（三种范围都生效）
  store.searchHighlightTerm = searchInput.value

  const term = searchInput.value
  const lowerTerm = term.toLowerCase()

  if (searchScope.value === 'file') {
    // 文件内搜索：扫描当前标签页内容，结果在侧栏列表展示，并同步编辑区高亮
    const tab = store.activeTab
    const results = []
    if (tab) {
      const lines = (tab.content || '').split(/\r?\n/)
      for (let i = 0; i < lines.length; i++) {
        const lowerLine = lines[i].toLowerCase()
        let idx = lowerLine.indexOf(lowerTerm)
        if (idx === -1) continue
        const matches = []
        while (idx !== -1) {
          matches.push({ index: idx, length: term.length })
          idx = lowerLine.indexOf(lowerTerm, idx + term.length)
        }
        results.push({
          tabId: tab.id,
          file: tab.filePath || '',
          relativePath: tab.fileName,
          line: i + 1,
          lineContent: lines[i],
          matches
        })
        if (results.length >= 500) break
      }
    }
    searchResults.value = results
    editorHighlight(term)
  } else if (searchScope.value === 'open') {
    // 打开的文件中搜索：遍历所有已打开标签页的内容（渲染进程内完成，无需 IPC）
    const term = searchInput.value
    const lowerTerm = term.toLowerCase()
    const results = []
    outer: for (const tab of store.tabs) {
      const lines = (tab.content || '').split(/\r?\n/)
      for (let i = 0; i < lines.length; i++) {
        const lowerLine = lines[i].toLowerCase()
        let idx = lowerLine.indexOf(lowerTerm)
        if (idx === -1) continue
        const matches = []
        while (idx !== -1) {
          matches.push({ index: idx, length: term.length })
          idx = lowerLine.indexOf(lowerTerm, idx + term.length)
        }
        results.push({
          tabId: tab.id,
          file: tab.filePath || '',
          relativePath: tab.fileName,
          line: i + 1,
          lineContent: lines[i],
          matches
        })
        if (results.length >= 500) break outer
      }
    }
    searchResults.value = results
  } else {
    if (!store.projectRoot) {
      await openFolder()
    }
    if (store.projectRoot) {
      const result = await window.api?.searchInProject(store.projectRoot, searchInput.value)
      if (result?.success) {
        searchResults.value = result.results
      }
    }
  }
}

// 编辑区（CodeMirror）同步高亮搜索词：setSearchQuery 即可高亮全文件匹配
// （search() 扩展已注册，无需打开搜索面板，也不会抢夺焦点）
function editorHighlight(term) {
  if (!term) return
  const view = window.editorRef
  if (!view) return
  view.dispatch({
    effects: setSearchQuery.of(new SearchQuery({ search: term, caseSensitive: false }))
  })
}

// 在目标行内选中匹配文本，使编辑区当前命中更明显
function selectMatchInLine(line, term, focus) {
  const view = window.editorRef
  if (!view || !term) return
  try {
    const l = view.state.doc.line(line)
    const idx = l.text.toLowerCase().indexOf(term.toLowerCase())
    if (idx >= 0) {
      view.dispatch({
        selection: { anchor: l.from + idx, head: l.from + idx + term.length },
        // x:'nearest' 保证命中词即便在水平滚动范围外也能滚入可视区
        scrollIntoView: { y: 'center', x: 'nearest' }
      })
    } else {
      view.dispatch({ selection: { anchor: l.from }, scrollIntoView: { y: 'center', x: 'nearest' } })
    }
    if (focus) view.focus()
  } catch {}
}

// 预览区水平滚动：把目标行内的搜索命中词带入水平可视区
// （垂直滚动由滚动联动 scrollSyncSource 负责；此处仅补充左右滑动场景）
function scrollPreviewHitIntoView(line) {
  const scroller = document.querySelector('.preview-scroll')
  if (!scroller) return
  const content = scroller.querySelector('.markdown-body') || scroller
  // 定位目标行所在块：data-source-line <= line 的最大者（段落跨多行时取起始行块）
  const blocks = Array.from(content.querySelectorAll('[data-source-line]'))
  let block = null
  for (const b of blocks) {
    const sl = parseInt(b.dataset.sourceLine, 10)
    if (!Number.isFinite(sl)) continue
    if (sl <= line) block = b; else break
  }
  const hit = (block && block.querySelector('mark.search-hit')) || content.querySelector('mark.search-hit')
  if (!hit) return
  const hitRect = hit.getBoundingClientRect()
  const contRect = scroller.getBoundingClientRect()
  if (hitRect.left < contRect.left) {
    scroller.scrollLeft += hitRect.left - contRect.left - 8
  } else if (hitRect.right > contRect.right) {
    scroller.scrollLeft += hitRect.right - contRect.right + 8
  }
}

// 跳转并同步高亮：预览区（mark.search-hit）+ 编辑区（CM 搜索高亮 + 选中命中）
function navigateToResult(result, focusEditor = false) {
  if (searchInput.value) store.searchHighlightTerm = searchInput.value
  editorHighlight(searchInput.value)

  const afterJump = () => {
    // 双 nextTick：等待标签切换/文档更新后定位
    nextTick(() => nextTick(() => {
      jumpToLine(result.line)
      selectMatchInLine(result.line, searchInput.value, focusEditor)
      store.scrollSyncSource = { source: 'editor', line: result.line }
      // 预览区命中词水平滚入可视区（等搜索高亮 mark 渲染完成）
      nextTick(() => scrollPreviewHitIntoView(result.line))
    }))
  }

  if (result.tabId) {
    const tab = store.tabs.find(t => t.id === result.tabId)
    if (tab) {
      store.setActiveTab(result.tabId)
      afterJump()
    }
    return
  }
  window.api?.readFile(result.file).then((res) => {
    if (res.success) {
      store.addTab(result.file, res.content, result.fileName)
      afterJump()
    }
  })
}

function highlightMatch(lineContent, matches) {
  let result = lineContent
  // Escape HTML
  result = result.replace(/</g, '&lt;').replace(/>/g, '&gt;')
  // Wrap matches
  if (matches) {
    for (const m of matches) {
      const before = result.slice(0, m.index)
      const matchText = result.slice(m.index, m.index + m.length)
      const after = result.slice(m.index + m.length)
      result = before + '<mark>' + matchText + '</mark>' + after
    }
  }
  return result
}
</script>

<style scoped>
.panel-sidebar {
  display: flex;
  width: 260px;
  background: var(--bg-sidebar);
  border-right: 1px solid var(--border-color);
  flex-shrink: 0;
  transition: width 0.15s;
  position: relative;
}
.panel-sidebar.collapsed { width: 0 !important; overflow: hidden; min-width: 0; border-right: none; }
.panel-sidebar.collapsed .sidebar-splitter { display: none; }
.sidebar-tabs {
  display: flex;
  flex-direction: column;
  width: 40px;
  padding-top: 4px;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border-color);
  flex-shrink: 0;
  gap: 2px;
}
.sidebar-tabs-spacer {
  flex: 1;
}
.settings-tab,
.theme-toggle-btn {
  margin-bottom: 4px;
}
.font-btn {
  font-weight: 600;
  color: var(--text-muted);
  font-size: 12px;
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 1px;
  letter-spacing: 0.5px;
}
.font-btn .font-label-small {
  font-size: 11px;
}
.font-btn .font-label-large {
  font-size: 14px;
}
.font-btn .font-suffix {
  font-size: 11px;
  font-weight: 400;
  margin-left: 1px;
}
.font-btn:hover { color: var(--accent-color); }
.theme-toggle-btn:hover { color: #f5a623; }
.sidebar-tab {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 38px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  position: relative;
  transition: color 0.15s, background 0.15s;
  border-radius: 4px;
}
.sidebar-tab:hover { color: var(--text-primary); background: var(--hover-bg); }
.sidebar-tab.active { color: var(--accent-color); }
.sidebar-tab.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 8px;
  bottom: 8px;
  width: 2px;
  background: var(--accent-color);
  border-radius: 0 2px 2px 0;
}
.sidebar-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.sidebar-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 10px 6px;
  flex-shrink: 0;
}
.panel-header-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.8px;
}
.project-root-info {
  display: flex;
  align-items: center;
  gap: 5px;
  cursor: pointer;
  min-width: 0;
  flex: 1;
}
.project-root-info:hover {
  opacity: 0.8;
}
.root-arrow {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  color: var(--text-muted);
  transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), color 0.15s;
}
.root-arrow.expanded {
  transform: rotate(90deg);
}
.project-root-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.panel-header-actions {
  display: flex;
  gap: 2px;
  align-items: center;
}
.panel-action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--text-muted);
  border-radius: 4px;
  padding: 0;
  transition: color 0.15s, background 0.15s;
}
.panel-action-btn:hover {
  color: var(--text-primary);
  background: var(--hover-bg);
}
.file-tree-area {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding-bottom: 8px;
}
.open-files-title {
  font-size: 11px;
  color: var(--text-muted);
  padding: 8px 14px 4px;
  letter-spacing: 0.3px;
}
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 32px 20px;
}
.empty-icon {
  opacity: 0.5;
  margin-bottom: 4px;
}
.empty-text {
  color: var(--text-muted);
  font-size: 13px;
  text-align: center;
  line-height: 1.5;
}
.open-folder-btn {
  padding: 7px 20px;
  border: 1px solid var(--border-color);
  background: var(--bg-primary);
  color: var(--accent-color);
  border-radius: 5px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: background 0.15s, border-color 0.15s, box-shadow 0.15s;
}
.open-folder-btn:hover {
  background: var(--hover-bg);
  border-color: var(--accent-color);
  box-shadow: 0 0 0 1px var(--accent-color);
}
.toc-content { flex: 1; overflow-y: auto; padding: 4px 0; }
.toc-item {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px 8px;
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
  white-space: nowrap;
}
.toc-item:hover { color: var(--text-primary); background: var(--hover-bg); }
.toc-item.active { color: var(--accent-color); }
.toc-arrow {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  color: var(--text-muted);
  border-radius: 3px;
  transition: transform 0.15s, color 0.15s, background 0.15s;
}
.toc-arrow:hover { color: var(--text-primary); background: var(--hover-bg); }
.toc-arrow.expanded { transform: rotate(90deg); }
.toc-arrow-leaf { cursor: default; }
.toc-arrow-leaf:hover { background: transparent; }
.toc-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.search-box {
  display: flex;
  gap: 4px;
  padding: 8px;
  border-bottom: 1px solid var(--border-color);
}
.search-input {
  flex: 1;
  padding: 4px 8px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 12px;
}
.search-scope {
  padding: 4px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 12px;
}
.search-results { flex: 1; overflow-y: auto; }
.search-meta {
  padding: 4px 10px;
  font-size: 11px;
  color: var(--text-muted);
  border-bottom: 1px solid var(--border-color);
}
.search-group { margin-bottom: 4px; }
.search-group-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px 2px;
  position: sticky;
  top: 0;
  background: var(--bg-sidebar);
  z-index: 1;
}
.search-group-name {
  flex: 1;
  min-width: 0;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.search-group-count {
  flex-shrink: 0;
  font-size: 10px;
  color: var(--text-muted);
  background: var(--hover-bg);
  border-radius: 8px;
  padding: 0 6px;
  line-height: 16px;
}
.search-result-item {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 3px 10px 3px 12px;
  border-bottom: 1px solid var(--border-color);
  cursor: pointer;
}
.search-result-item:hover { background: var(--hover-bg); }
.search-result-item.active { background: var(--accent-color); }
.search-result-item.active .line-num,
.search-result-item.active .line-content { color: #fff; }
.search-result-item mark { background: #ffd43b; color: inherit; border-radius: 2px; padding: 0 1px; }
.search-result-item.active mark { background: #fff3b0; color: var(--text-primary); }

.recent-content {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}
.recent-section {
  margin-bottom: 8px;
}
.recent-section-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 8px 12px 4px;
}
.recent-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 12px;
  cursor: pointer;
  transition: background 0.1s;
}
.recent-item:hover {
  background: var(--hover-bg);
}
.recent-item-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}
.recent-item-name {
  font-size: 13px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
.recent-item-path {
  font-size: 11px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  margin-top: 1px;
}
.recent-item:hover .recent-item-name {
  color: var(--text-primary);
}
.result-file { font-size: 11px; color: var(--text-muted); margin-bottom: 2px; }
.result-line {
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 3px;
}
.result-line:hover { background: var(--hover-bg); }
.line-num {
  display: inline-block;
  width: 30px;
  font-size: 11px;
  color: var(--text-muted);
  font-family: monospace;
  text-align: right;
  margin-right: 8px;
}
.line-content { font-size: 12px; color: var(--text-primary); }
.sidebar-splitter {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  cursor: col-resize;
  z-index: 20;
  background: transparent;
}
.sidebar-splitter:hover,
.sidebar-splitter:active {
  background: var(--accent-color);
}
</style>

<style>
/* 目录跳转时预览视图标题的高亮闪烁（作用于 .preview-scroll 内的标题，需全局样式） */
@keyframes toc-flash-anim {
  0% { background-color: var(--accent-color, #4a9eff); color: #fff; }
  100% { background-color: transparent; }
}
.markdown-body .toc-flash {
  animation: toc-flash-anim 1.2s ease-out;
  border-radius: 4px;
  padding: 2px 4px;
  margin: -2px -4px;
}
</style>
