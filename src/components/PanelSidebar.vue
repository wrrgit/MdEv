<template>
  <div class="panel-sidebar" :class="{ collapsed: !hasTabs || !store.sidebarVisible }" :style="{ width: store.sidebarWidth + 'px' }">
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
    </div>
    <div class="sidebar-content">
      <div v-if="store.sidebarPanel === 'filetree'" class="sidebar-panel">
        <div class="panel-header">
          <span>文件</span>
          <button class="panel-action" @click="openFolder" title="打开文件夹">📂</button>
        </div>
        <div class="file-tree" v-if="store.fileTree.length > 0">
          <FileTree :nodes="store.fileTree" :depth="0" />
        </div>
        <div class="empty-state" v-else>
          <p>打开文件夹以浏览文件</p>
          <button class="open-folder-btn" @click="openFolder">打开文件夹</button>
        </div>
      </div>

      <div v-if="store.sidebarPanel === 'toc'" class="sidebar-panel">
        <div class="panel-header">
          <span>目录</span>
        </div>
        <div class="toc-content" v-if="tocItems.length > 0">
          <div
            v-for="item in tocItems"
            :key="item.line"
            class="toc-item"
            :class="{ active: item.line === activeTocLine }"
            :style="{ paddingLeft: (item.level - 1) * 16 + 8 + 'px' }"
            @click="jumpToLine(item.line)"
          >
            {{ item.text }}
          </div>
        </div>
        <div class="empty-state" v-else>
          <p>当前文档无标题</p>
        </div>
      </div>

      <div v-if="store.sidebarPanel === 'search'" class="sidebar-panel">
        <div class="panel-header">
          <span>搜索</span>
        </div>
        <div class="search-box">
          <input
            v-model="searchInput"
            type="text"
            placeholder="搜索..."
            class="search-input"
            @keydown.enter="doSearch"
          />
          <select v-model="searchScope" class="search-scope">
            <option value="file">文件内</option>
            <option value="project">跨文件</option>
          </select>
        </div>
        <div class="search-results" v-if="searchResults.length > 0">
          <div v-for="result in searchResults" :key="result.file + result.line" class="search-result-item">
            <div class="result-file">{{ result.relativePath }}</div>
            <div class="result-line" @click="openResult(result)">
              <span class="line-num">{{ result.line }}</span>
              <span class="line-content" v-html="highlightMatch(result.lineContent, result.matches)"></span>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="sidebar-splitter" @mousedown="startSplitDrag"></div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue'
import { useEditorStore } from '@/stores/editorStore'
import FileTree from './FileTree.vue'

const store = useEditorStore()
const searchInput = ref('')
const searchScope = ref('file')
const searchResults = ref([])

const hasTabs = computed(() => store.tabs.length > 0)

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
  { id: 'filetree', label: '文件', icon: '📁' },
  { id: 'toc', label: '目录', icon: '📑' },
  { id: 'search', label: '搜索', icon: '🔍' }
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

const activeTocLine = computed(() => {
  // Would need cursor position from editor - simplified for now
  return 0
})

function jumpToLine(line) {
  const editor = window.editorRef?.editorView
  if (editor) {
    const pos = editor.state.doc.line(line).from
    editor.dispatch({
      selection: { anchor: pos },
      scrollIntoView: true
    })
    editor.focus()
  }
}

async function openFolder() {
  const folderPath = await window.api?.openFolderDialog()
  if (folderPath) {
    const result = await window.api?.readDirectory(folderPath)
    if (result?.success) {
      store.fileTree = result.tree
      store.setProjectRoot(folderPath)
    }
  }
}

async function doSearch() {
  if (!searchInput.value.trim()) return

  if (searchScope.value === 'file') {
    if (window.editorRef?.editorView) {
      const view = window.editorRef.editorView
      // CM6 search is handled by the search extension
    }
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

function openResult(result) {
  // Open file and jump to line
  window.api?.readFile(result.file).then((res) => {
    if (res.success) {
      store.addTab(result.file, res.content, result.fileName)
      nextTick(() => jumpToLine(result.line))
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
  width: 36px;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border-color);
  flex-shrink: 0;
}
.sidebar-tab {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 16px;
  position: relative;
}
.sidebar-tab:hover { color: var(--text-primary); background: var(--hover-bg); }
.sidebar-tab.active { color: var(--accent-color); }
.sidebar-tab.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 6px;
  bottom: 6px;
  width: 2px;
  background: var(--accent-color);
  border-radius: 0 2px 2px 0;
}
.sidebar-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
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
  padding: 8px 12px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-bottom: 1px solid var(--border-color);
}
.panel-action {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 14px;
  color: var(--text-muted);
  padding: 2px;
}
.panel-action:hover { color: var(--text-primary); }
.file-tree { flex: 1; overflow-y: auto; padding: 4px 0; }
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 20px;
  color: var(--text-muted);
  font-size: 12px;
}
.open-folder-btn {
  padding: 6px 16px;
  border: 1px solid var(--border-color);
  background: var(--bg-primary);
  color: var(--text-primary);
  border-radius: 4px;
  cursor: pointer;
}
.toc-content { flex: 1; overflow-y: auto; padding: 4px 0; }
.toc-item {
  padding: 4px 8px;
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.toc-item:hover { color: var(--text-primary); background: var(--hover-bg); }
.toc-item.active { color: var(--accent-color); }
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
.search-result-item { padding: 4px 8px; border-bottom: 1px solid var(--border-color); }
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
