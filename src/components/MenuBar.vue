<template>
  <div class="menu-bar" @mouseleave="closeAllMenus">
    <div
      v-for="menu in menus"
      :key="menu.label"
      class="menu-item"
      @click.stop="toggleMenu(menu.label)"
      @mouseenter="onMenuHover(menu.label)"
    >
      <span class="menu-label">{{ menu.label }}</span>
      <div class="menu-dropdown" v-if="openMenu === menu.label">
        <template v-for="(item, i) in menu.items" :key="i">
          <div class="menu-divider" v-if="item.separator"></div>
          <div
            v-else
            class="menu-command"
            :class="{ disabled: item.disabled, checked: item.checked }"
            @click.stop="execute(item)"
          >
            <span class="cmd-label">{{ item.label }}</span>
            <span class="cmd-shortcut" v-if="item.shortcut">{{ item.shortcut }}</span>
            <span class="cmd-check" v-if="item.checked">✓</span>
          </div>
        </template>
      </div>
    </div>
    <div class="about-dialog" v-if="store.showAbout" @click.self="closeAbout">
      <div class="about-box">
        <h1 class="about-title">MdEv</h1>
        <p class="about-version">v0.1.0</p>
        <p class="about-desc">Markdown Editor for Windows</p>
        <p class="about-tech">基于 Electron + Vue 3 + CodeMirror 6</p>
        <button class="about-btn" @click="closeAbout">确定</button>
      </div>
    </div>
  </div>
  <div class="empty-state" v-if="store.tabs.length === 0 && store.fileTree.length === 0">
    <div class="empty-content">
      <div class="empty-logo">
        <img src="@/assets/logo.png" alt="MdEv" width="64" height="64" />
      </div>
      <h2>MdEv</h2>
      <p class="empty-sub">Markdown Editor for Windows</p>
      <div class="empty-actions">
        <button class="empty-btn" @click="openFileAction">
          <span>📄 打开文件</span>
        </button>
        <button class="empty-btn" @click="openFolderAction">
          <span>📁 打开文件夹</span>
        </button>
        <button class="empty-btn" @click="newFileAction">
          <span>📄 新建文件</span>
        </button>
      </div>
      <p class="empty-hint">使用顶部菜单栏开始编辑</p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useEditorStore } from '@/stores/editorStore'
import { undo, redo } from '@codemirror/commands'

const store = useEditorStore()
const openMenu = ref(null)

function toggleMenu(label) {
  openMenu.value = openMenu.value === label ? null : label
}

function onMenuHover(label) {
  if (openMenu.value) {
    openMenu.value = label
  }
}

function closeAllMenus() {
  openMenu.value = null
}

function closeAbout() {
  store.showAbout = false
}

onMounted(() => {
  document.addEventListener('click', closeAllMenus)
})

onUnmounted(() => {
  document.removeEventListener('click', closeAllMenus)
})

async function openFileAction() {
  try {
    const filePath = await window.api?.openFileDialog()
    if (filePath) {
      const result = await window.api?.readFile(filePath)
      if (result?.success) {
        const fileName = filePath.split(/[\\/]/).pop()
        store.addTab(filePath, result.content, fileName)
        store.addRecentFile(filePath)
      } else {
        console.error('Failed to read file:', result?.error)
      }
    }
  } catch (e) {
    console.error('openFile error:', e)
  }
}

async function openFolderAction() {
  try {
    const folderPath = await window.api?.openFolderDialog()
    if (folderPath) {
      const result = await window.api?.readDirectory(folderPath)
      if (result?.success) {
        store.fileTree = result.tree
        store.setProjectRoot(folderPath)
      }
    }
  } catch (e) {
    console.error('openFolder error:', e)
  }
}

function newFileAction() {
  store.addTab(null, '', '未命名.md')
}

async function saveAction() {
  try {
    const tab = store.activeTab
    if (!tab) return
    if (tab.filePath) {
      const r = await window.api?.writeFile(tab.filePath, tab.content)
      if (r?.success) store.markAsSaved()
    } else {
      const p = await window.api?.saveFileDialog('未命名.md')
      if (p) {
        const r = await window.api?.writeFile(p, tab.content)
        if (r?.success) {
          tab.filePath = p
          tab.fileName = p.split(/[\\/]/).pop()
          store.markAsSaved()
          store.addRecentFile(p)
        }
      }
    }
  } catch (e) {
    console.error('save error:', e)
  }
}

async function saveAsAction() {
  try {
    const tab = store.activeTab
    if (!tab) return
    const p = await window.api?.saveFileDialog(tab.fileName)
    if (p) {
      const r = await window.api?.writeFile(p, tab.content)
      if (r?.success) {
        tab.filePath = p
        tab.fileName = p.split(/[\\/]/).pop()
        store.markAsSaved()
        store.addRecentFile(p)
      }
    }
  } catch (e) {
    console.error('saveAs error:', e)
  }
}

function getView(view) {
  return window.editorRef?.editorView || view
}

const menus = computed(() => [
  {
    label: '文件',
    items: [
      { label: '新建文件', shortcut: 'Ctrl+N', action: newFileAction },
      { label: '打开文件...', shortcut: 'Ctrl+O', action: openFileAction },
      { label: '打开文件夹...', shortcut: 'Ctrl+Shift+O', action: openFolderAction },
      { separator: true },
      { label: '保存', shortcut: 'Ctrl+S', action: saveAction },
      { label: '另存为...', shortcut: 'Ctrl+Shift+S', action: saveAsAction },
      { separator: true },
      { label: '导出 PDF...', action: () => { store.exportFormat = 'pdf'; store.showExport = true } },
      { label: '导出图片...', action: () => { store.exportFormat = 'image'; store.showExport = true } },
      { label: '导出 HTML...', action: () => { store.exportFormat = 'html'; store.showExport = true } },
      { separator: true },
      { label: '退出', action: () => window.api?.closeWindow() }
    ]
  },
  {
    label: '编辑',
    items: [
      { label: '撤销', shortcut: 'Ctrl+Z', action: () => { const v = getView(); if (v) undo(v) } },
      { label: '重做', shortcut: 'Ctrl+Y', action: () => { const v = getView(); if (v) redo(v) } },
      { separator: true },
      { label: '剪切', shortcut: 'Ctrl+X', action: () => document.execCommand('cut') },
      { label: '复制', shortcut: 'Ctrl+C', action: () => document.execCommand('copy') },
      { label: '粘贴', shortcut: 'Ctrl+V', action: () => document.execCommand('paste') },
      { separator: true },
      { label: '查找', shortcut: 'Ctrl+F', action: () => { store.sidebarPanel = 'search'; store.sidebarVisible = true } },
      { label: '跨文件搜索', shortcut: 'Ctrl+Shift+F', action: () => { store.sidebarPanel = 'search'; store.sidebarVisible = true } },
      { separator: true },
      {
        label: '跳转到行...', shortcut: 'Ctrl+G', action: () => {
          const v = getView()
          if (!v) return
          const line = prompt('跳转到行号:')
          if (line) {
            const n = parseInt(line)
            if (n > 0 && n <= v.state.doc.lines) {
              const b = v.state.doc.line(n)
              v.dispatch({ selection: { anchor: b.from } })
              v.focus()
            }
          }
        }
      }
    ]
  },
  {
    label: '显示',
    items: [
      { label: '文件树', action: () => { store.sidebarPanel = 'filetree'; store.sidebarVisible = true } },
      { label: '搜索', action: () => { store.sidebarPanel = 'search'; store.sidebarVisible = true } },
      { separator: true },
      { label: '双栏模式', checked: store.settings.viewMode === 'dual', action: () => { store.settings.viewMode = 'dual' } },
      { label: '纯编辑模式', checked: store.settings.viewMode === 'edit', action: () => { store.settings.viewMode = 'edit' } },
      { label: '纯预览模式', checked: store.settings.viewMode === 'preview', action: () => { store.settings.viewMode = 'preview' } },
      { separator: true },
      { label: '切换侧栏', shortcut: 'Ctrl+B', action: () => { store.sidebarVisible = !store.sidebarVisible } },
      { label: '滚动同步', checked: store.settings.scrollSync, action: () => { store.settings.scrollSync = !store.settings.scrollSync } },
      { separator: true },
      { label: '自动换行', checked: store.settings.wordWrap, action: () => { store.settings.wordWrap = !store.settings.wordWrap; window.api?.setSettings({ settings: { ...store.settings } }) } }
    ]
  },
  {
    label: '设置',
    items: [
      { label: '打开设置...', shortcut: 'Ctrl+,', action: () => { store.showSettings = true } }
    ]
  },
  {
    label: '关于',
    items: [
      { label: '关于 MdEv', action: () => { store.showAbout = true } }
    ]
  }
])

function execute(item) {
  if (item.disabled) return
  try {
    item.action()
  } catch (e) {
    console.error('Menu action error:', e)
  }
  closeAllMenus()
}
</script>

<style scoped>
.menu-bar {
  display: flex;
  align-items: center;
  height: 30px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
  user-select: none;
  position: relative;
  z-index: 50;
}
.menu-item {
  position: relative;
  height: 100%;
}
.menu-label {
  display: flex;
  align-items: center;
  height: 100%;
  padding: 0 12px;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  white-space: nowrap;
}
.menu-item:hover .menu-label,
.menu-item .menu-label:hover {
  background: var(--hover-bg);
  color: var(--text-primary);
}
.menu-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  min-width: 220px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.15);
  z-index: 200;
  padding: 4px 0;
}
.menu-command {
  display: flex;
  align-items: center;
  padding: 6px 16px;
  font-size: 13px;
  color: var(--text-primary);
  cursor: pointer;
  white-space: nowrap;
  gap: 16px;
}
.menu-command:hover {
  background: var(--accent-color);
  color: #fff;
}
.menu-command.disabled {
  color: var(--text-muted);
  cursor: default;
}
.menu-command.disabled:hover {
  background: transparent;
  color: var(--text-muted);
}
.cmd-label { flex: 1; }
.cmd-shortcut {
  font-size: 12px;
  color: var(--text-muted);
  margin-left: auto;
}
.menu-command:hover .cmd-shortcut {
  color: rgba(255,255,255,0.7);
}
.cmd-check {
  font-size: 12px;
  color: var(--accent-color);
}
.menu-command:hover .cmd-check {
  color: #fff;
}
.menu-divider {
  height: 1px;
  background: var(--border-color);
  margin: 4px 8px;
}
.about-dialog {
  position: fixed;
  inset: 0;
  z-index: 300;
  background: rgba(0,0,0,0.4);
  display: flex;
  align-items: center;
  justify-content: center;
}
.about-box {
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 32px 40px;
  text-align: center;
  box-shadow: 0 8px 32px rgba(0,0,0,0.3);
  min-width: 300px;
}
.about-title {
  font-size: 28px;
  font-weight: 800;
  color: var(--accent-color);
  margin: 0 0 4px;
}
.about-version {
  font-size: 14px;
  color: var(--text-muted);
  margin: 0 0 16px;
}
.about-desc {
  font-size: 15px;
  color: var(--text-primary);
  margin: 0 0 8px;
}
.about-tech {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 0 0 20px;
}
.about-btn {
  padding: 8px 32px;
  border: none;
  background: var(--accent-color);
  color: #fff;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
}
.about-btn:hover {
  filter: brightness(1.1);
}
.empty-state {
  position: fixed;
  top: 66px;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-primary);
  z-index: 5;
}
.empty-content {
  text-align: center;
}
.empty-content h2 {
  font-size: 36px;
  font-weight: 800;
  margin: 0 0 4px;
  letter-spacing: -1px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
.empty-sub {
  font-size: 14px;
  color: var(--text-muted);
  margin: 0 0 28px;
}
.empty-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  margin-bottom: 16px;
}
.empty-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 24px;
  border: 1px solid var(--border-color);
  background: var(--bg-secondary);
  color: var(--text-primary);
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.15s;
}
.empty-btn:hover {
  background: var(--hover-bg);
  border-color: var(--accent-color);
}
.empty-btn.primary {
  background: var(--accent-color);
  color: #fff;
  border-color: var(--accent-color);
}
.empty-btn.primary:hover {
  filter: brightness(1.1);
}
.empty-hint {
  font-size: 12px;
  color: var(--text-muted);
}
</style>
