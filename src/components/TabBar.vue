<template>
  <div class="tab-bar" v-if="store.tabs.length > 0">
    <div class="tabs-container" ref="tabsContainer">
      <div
        v-for="tab in store.tabs"
        :key="tab.id"
        class="tab"
        :class="{ active: tab.id === store.activeTabId, dirty: tab.isDirty, pinned: tab.pinned }"
        :draggable="true"
        :title="tab.pinned ? '已固定（右键取消固定）' : tab.fileName"
        @click="store.setActiveTab(tab.id)"
        @contextmenu.prevent="showContextMenu($event, tab)"
        @dragstart="onDragStart($event, tab)"
        @dragover.prevent="onDragOver($event, tab)"
        @drop="onDrop($event, tab)"
        @click.middle.prevent="requestCloseTab(tab.id)"
      >
        <span class="tab-icon">{{ getFileIcon(tab.fileName) }}</span>
        <span class="tab-name">{{ tab.fileName }}</span>
        <span class="tab-dirty-dot" v-if="tab.isDirty"></span>
        <span v-if="tab.pinned" class="tab-pin" title="已固定">📌</span>
        <button v-else class="tab-close" @click.stop="requestCloseTab(tab.id)" title="关闭">
          <svg width="10" height="10" viewBox="0 0 10 10"><path d="M1 1l8 8M9 1L1 9" stroke="currentColor" stroke-width="1.2"/></svg>
        </button>
      </div>
    </div>
    <!-- 标签右键菜单：关闭 / 固定 / 关闭其他 / 关闭右侧 / 复制路径 -->
    <ContextMenu
      :visible="menuVisible"
      :x="menuX"
      :y="menuY"
      :items="menuItems"
      @close="menuVisible = false"
      @select="onMenuSelect"
    />
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useEditorStore } from '@/stores/editorStore'
import { useTabClose } from '@/composables/useTabClose'
import ContextMenu from './ContextMenu.vue'

const store = useEditorStore()
const { requestCloseTab } = useTabClose()
const tabsContainer = ref(null)
let dragTabId = null

// ── 右键菜单 ──
const menuVisible = ref(false)
const menuX = ref(0)
const menuY = ref(0)
let menuTab = null

const ICON_CLOSE = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>'
const ICON_PIN = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg>'
const ICON_COPY = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>'

function showContextMenu(event, tab) {
  menuTab = tab
  menuX.value = event.clientX
  menuY.value = event.clientY
  menuVisible.value = true
}

const menuItems = [
  { label: '关闭标签', icon: ICON_CLOSE, action: (t) => requestCloseTab(t.id) },
  { label: '固定标签', icon: ICON_PIN, action: (t) => store.togglePinTab(t.id) },
  { separator: true },
  { label: '关闭其他标签页', action: (t) => store.closeOtherTabs(t.id) },
  { label: '关闭右侧标签页', action: (t) => store.closeRightTabs(t.id) },
  { separator: true },
  { label: '复制文件路径', icon: ICON_COPY, action: (t) => { if (t.filePath) navigator.clipboard?.writeText(t.filePath) } }
]

function onMenuSelect(item) {
  if (!item?.action || !menuTab) return
  item.action(menuTab)
  menuTab = null
}

function getFileIcon(fileName) {
  const ext = fileName?.split('.').pop()?.toLowerCase()
  const icons = { md: '📝', markdown: '📝', txt: '📄', json: '📋', js: '📜', ts: '📘', vue: '🟢', css: '🎨', html: '🌐', yml: '⚙️', yaml: '⚙️' }
  return icons[ext] || '📄'
}

function onDragStart(event, tab) {
  dragTabId = tab.id
  event.dataTransfer.effectAllowed = 'move'
}

function onDragOver(event, tab) {
  event.dataTransfer.dropEffect = 'move'
}

function onDrop(event, tab) {
  if (dragTabId && dragTabId !== tab.id) {
    const tabs = [...store.tabs]
    const fromIdx = tabs.findIndex(t => t.id === dragTabId)
    const toIdx = tabs.findIndex(t => t.id === tab.id)
    // 固定标签只能与固定标签换位，避免拖乱 pin 分区
    if (fromIdx !== -1 && toIdx !== -1 && tabs[fromIdx].pinned === tabs[toIdx].pinned) {
      const [moved] = tabs.splice(fromIdx, 1)
      tabs.splice(toIdx, 0, moved)
      store.updateTabOrder(tabs)
    }
  }
  dragTabId = null
}
</script>

<style scoped>
.tab-bar {
  display: flex;
  align-items: center;
  height: 32px;
  background: var(--bg-tabs);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}
.tabs-container {
  display: flex;
  align-items: center;
  height: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  flex: 1;
}
.tab {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 100%;
  padding: 0 12px;
  font-size: 12px;
  color: var(--text-secondary);
  border-right: 1px solid var(--border-color);
  cursor: pointer;
  white-space: nowrap;
  user-select: none;
  position: relative;
  transition: background 0.15s;
}
.tab:hover { background: var(--hover-bg); }
.tab.active {
  color: var(--text-primary);
  background: var(--bg-primary);
  border-bottom: 2px solid var(--accent-color);
}
.tab-icon { font-size: 13px; }
.tab-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  border-radius: 3px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s;
}
.tab:hover .tab-close { opacity: 1; }
.tab-close:hover { background: var(--hover-bg); color: var(--text-primary); }
.tab-dirty-dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  background: var(--accent-color);
  flex-shrink: 0;
}
.tab-pin {
  font-size: 10px;
  flex-shrink: 0;
  opacity: 0.85;
}
.tab.pinned {
  font-style: italic;
}
.tab.pinned.active {
  border-bottom-color: var(--text-muted);
}
@keyframes tab-flash {
  from { background: var(--hover-bg); }
  to { background: transparent; }
}
</style>
