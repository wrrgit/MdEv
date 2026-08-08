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
            v-else-if="item.submenu"
            class="menu-command has-submenu"
            @click.stop
            @mouseenter="clearSubmenuTimer(); openSubmenu = item.label"
            @mouseleave="closeSubmenuDelayed"
          >
            <span class="cmd-label">{{ item.label }}</span>
            <span class="cmd-arrow">▸</span>
            <div class="submenu" v-if="openSubmenu === item.label">
              <template v-for="(sub, si) in item.submenu" :key="si">
                <div class="menu-divider" v-if="sub.separator"></div>
                <div
                  v-else
                  class="submenu-command"
                  :class="{ disabled: sub.disabled, 'has-sublabel': sub.sublabel }"
                  :title="sub.title || sub.label"
                  @click.stop="execute(sub)"
                >
                  <div class="submenu-text">
                    <span class="cmd-label">{{ sub.label }}</span>
                    <span class="submenu-sublabel" v-if="sub.sublabel">{{ sub.sublabel }}</span>
                  </div>
                </div>
              </template>
            </div>
          </div>
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
        <p class="about-version">v0.2.0</p>
        <p class="about-desc">Markdown Editor for Windows</p>
        <p class="about-tech">基于 Electron + Vue 3 + CodeMirror 6</p>
        <a href="https://github.com/wrrgit/MdEv" class="about-github" @click.prevent="openGithub">
          <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.012 8.012 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
          <span>GitHub</span>
        </a>
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
import { EditorView } from '@codemirror/view'
import { undo as cmUndo, redo as cmRedo } from '@codemirror/commands'

const store = useEditorStore()
const openMenu = ref(null)
const openSubmenu = ref(null)
let submenuTimer = null

function toggleMenu(label) {
  openMenu.value = openMenu.value === label ? null : label
  openSubmenu.value = null
}

function onMenuHover(label) {
  if (openMenu.value) {
    openMenu.value = label
    openSubmenu.value = null
  }
}

function closeSubmenuDelayed() {
  submenuTimer = setTimeout(() => {
    openSubmenu.value = null
  }, 150)
}

function clearSubmenuTimer() {
  if (submenuTimer) {
    clearTimeout(submenuTimer)
    submenuTimer = null
  }
}

function closeAllMenus() {
  openMenu.value = null
  openSubmenu.value = null
  clearSubmenuTimer()
}

function closeAbout() {
  store.showAbout = false
}

function openGithub() {
  window.api?.openExternal('https://github.com/wrrgit/MdEv')
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
      } else {
        console.error('Failed to read file:', result?.error)
      }
    }
  } catch (e) {
    console.error('openFile error:', e)
  }
}

async function openFolderAction(folderPath) {
  try {
    if (!folderPath) {
      folderPath = await window.api?.openFolderDialog()
    }
    if (folderPath) {
      const result = await window.api?.readDirectory(folderPath)
      if (result?.success) {
        store.collapseAllPaths()
        store.fileTree = result.tree
        store.setProjectRoot(folderPath)
        store.expandPath(folderPath)
      }
    }
  } catch (e) {
    console.error('openFolder error:', e)
  }
}

function newFileAction() {
  store.addTab(null, '', '未命名.md')
}

async function openRecentFileAction(filePath) {
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

function getView() {
  return window.editorRef || null
}

const recentFilesSubmenu = computed(() => {
  if (store.recentFiles.length === 0) {
    return [{ label: '(暂无最近文件)', disabled: true }]
  }
  const items = store.recentFiles.slice(0, 10).map(f => ({
    label: f.fileName,
    sublabel: f.path,
    title: f.path,
    action: () => openRecentFileAction(f.path)
  }))
  items.push({ separator: true })
  items.push({
    label: '清空最近文件',
    action: () => {
      if (confirm('确定清空最近文件列表吗？')) {
        store.recentFiles = []
        window.api?.setSettings({ recentFiles: [] })
      }
    }
  })
  return items
})

const recentFoldersSubmenu = computed(() => {
  if (store.recentFolders.length === 0) {
    return [{ label: '(暂无最近文件夹)', disabled: true }]
  }
  return store.recentFolders.slice(0, 10).map(f => ({
    label: f.folderName,
    sublabel: f.path,
    title: f.path,
    action: () => openFolderAction(f.path)
  }))
})

const menus = computed(() => [
  {
    label: '文件',
    items: [
      { label: '新建文件', shortcut: 'Ctrl+N', action: newFileAction },
      { label: '打开文件...', shortcut: 'Ctrl+O', action: openFileAction },
      { label: '打开文件夹...', shortcut: 'Ctrl+Shift+O', action: openFolderAction },
      { label: '最近打开文件', submenu: recentFilesSubmenu.value },
      { label: '最近打开文件夹', submenu: recentFoldersSubmenu.value },
      { separator: true },
      { label: '保存', shortcut: 'Ctrl+S', action: saveAction },
      { label: '另存为...', shortcut: 'Ctrl+Shift+S', action: saveAsAction },
      { separator: true },
      { label: '导出 PDF...', action: () => { store.exportFormat = 'pdf'; store.showExport = true } },
      { label: '导出 HTML...', action: () => { store.exportFormat = 'html'; store.showExport = true } },
      { separator: true },
      { label: '退出', action: () => window.api?.closeWindow() }
    ]
  },
  {
    label: '编辑',
    items: [
      { label: '撤销', shortcut: 'Ctrl+Z', action: () => { const v = getView(); if (v) { cmUndo(v); v.focus() } } },
      { label: '重做', shortcut: 'Ctrl+Y', action: () => { const v = getView(); if (v) { cmRedo(v); v.focus() } } },
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
.menu-command.has-submenu {
  position: relative;
  padding-right: 32px;
}
.cmd-arrow {
  position: absolute;
  right: 12px;
  font-size: 12px;
  color: var(--text-muted);
}
.menu-command.has-submenu:hover .cmd-arrow {
  color: rgba(255,255,255,0.8);
}
.submenu {
  position: absolute;
  top: -4px;
  left: 100%;
  min-width: 240px;
  max-width: 400px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.15);
  z-index: 201;
  padding: 4px 0;
  max-height: 60vh;
  overflow-y: auto;
}
.submenu-command {
  display: flex;
  align-items: center;
  padding: 6px 16px;
  font-size: 13px;
  color: var(--text-primary);
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  min-width: 0;
}
.submenu-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}
.submenu-text .cmd-label {
  overflow: hidden;
  text-overflow: ellipsis;
}
.submenu-sublabel {
  font-size: 11px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 1px;
}
.submenu-command.has-sublabel {
  padding-top: 5px;
  padding-bottom: 5px;
}
.submenu-command:hover .submenu-sublabel {
  color: rgba(255,255,255,0.6);
}
.submenu-command:hover {
  background: var(--accent-color);
  color: #fff;
}
.submenu-command.disabled {
  color: var(--text-muted);
  cursor: default;
}
.submenu-command.disabled:hover {
  background: transparent;
  color: var(--text-muted);
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
.about-github {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin: 0 0 20px;
  padding: 8px 20px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  color: var(--text-primary);
  text-decoration: none;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.15s;
}
.about-github:hover {
  background: var(--hover-bg);
  border-color: var(--accent-color);
  color: var(--accent-color);
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
