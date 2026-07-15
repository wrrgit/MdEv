<template>
  <div class="tab-bar" v-if="store.tabs.length > 0">
    <div class="tabs-container" ref="tabsContainer">
      <div
        v-for="tab in store.tabs"
        :key="tab.id"
        class="tab"
        :class="{ active: tab.id === store.activeTabId, dirty: tab.isDirty }"
        :draggable="true"
        @click="store.setActiveTab(tab.id)"
        @contextmenu.prevent="showContextMenu($event, tab)"
        @dragstart="onDragStart($event, tab)"
        @dragover.prevent="onDragOver($event, tab)"
        @drop="onDrop($event, tab)"
      >
        <span class="tab-icon">{{ getFileIcon(tab.fileName) }}</span>
        <span class="tab-name">{{ tab.fileName }}</span>
        <span class="tab-dirty-dot" v-if="tab.isDirty"></span>
        <button class="tab-close" @click.stop="store.closeTab(tab.id)" title="关闭">
          <svg width="10" height="10" viewBox="0 0 10 10"><path d="M1 1l8 8M9 1L1 9" stroke="currentColor" stroke-width="1.2"/></svg>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useEditorStore } from '@/stores/editorStore'

const store = useEditorStore()
const tabsContainer = ref(null)
let dragTabId = null

function getFileIcon(fileName) {
  const ext = fileName?.split('.').pop()?.toLowerCase()
  const icons = { md: '📝', markdown: '📝', txt: '📄', json: '📋', js: '📜', ts: '📘', vue: '🟢', css: '🎨', html: '🌐', yml: '⚙️', yaml: '⚙️' }
  return icons[ext] || '📄'
}

function showContextMenu(event, tab) {
  // Native context menu would be handled via IPC
  // For now, basic actions through keyboard shortcuts
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
    if (fromIdx !== -1 && toIdx !== -1) {
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
</style>
