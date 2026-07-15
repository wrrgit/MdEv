<template>
  <div class="title-bar" @dblclick="toggleMaximize">
    <div class="title-bar-drag">
      <span class="app-logo">
        <svg width="18" height="18" viewBox="0 0 64 64" fill="none" class="logo-svg">
          <rect x="4" y="4" width="56" height="56" rx="12" stroke="currentColor" stroke-width="4" fill="none"/>
          <path d="M18 22h28M18 32h20M18 42h24" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
        </svg>
      </span>
      <span class="file-name">{{ currentFileName }}</span>
    </div>
    <div class="window-controls">
      <button class="win-btn minimize" @click="minimize" title="最小化">
        <svg width="12" height="12" viewBox="0 0 12 12"><rect y="5" width="12" height="1.5" fill="currentColor"/></svg>
      </button>
      <button class="win-btn maximize" @click="toggleMaximize" title="最大化">
        <svg width="12" height="12" viewBox="0 0 12 12"><rect x="1" y="1" width="10" height="10" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>
      </button>
      <button class="win-btn close" @click="closeWindow" title="关闭">
        <svg width="12" height="12" viewBox="0 0 12 12"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" stroke-width="1.5"/></svg>
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useEditorStore } from '@/stores/editorStore'

const store = useEditorStore()

const currentFileName = computed(() => {
  const tab = store.activeTab
  if (!tab) return ''
  return tab.isDirty ? `${tab.fileName} ●` : tab.fileName
})

const minimize = () => window.api?.minimizeWindow()
const toggleMaximize = () => window.api?.maximizeWindow()
const closeWindow = () => window.api?.closeWindow()
</script>

<style scoped>
.title-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 36px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  user-select: none;
  flex-shrink: 0;
}
.title-bar-drag {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-left: 16px;
  flex: 1;
  height: 100%;
  -webkit-app-region: drag;
}
.app-logo {
  display: flex;
  align-items: center;
  color: var(--accent-color);
}
.logo-svg {
  display: block;
}
.file-name {
  font-size: 12px;
  color: var(--text-secondary);
  max-width: 400px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.window-controls {
  display: flex;
  height: 100%;
  -webkit-app-region: no-drag;
  margin-left: auto;
}
.window-controls { opacity: 0.85; }
.win-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 100%;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: background 0.15s;
}
.win-btn:hover { background: var(--hover-bg); color: var(--text-primary); }
.win-btn.close { color: #e81123; }
.win-btn.close:hover { background: #e81123; color: #fff; }
</style>
