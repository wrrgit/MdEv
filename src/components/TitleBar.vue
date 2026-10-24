<template>
  <div class="title-bar" @dblclick="toggleMaximize">
    <div class="title-bar-drag">
      <span class="app-logo">
        <img src="@/assets/logo.png" alt="MdEv" width="24" height="24" class="logo-img" />
      </span>
      <span class="app-name">MdEv</span>
      <span class="title-divider"></span>
      <span v-if="!pathSegments.length" class="file-name">{{ currentFileName }}</span>
      <div v-else class="file-path" :title="currentFilePath">
        <template v-for="(seg, i) in pathSegments" :key="i">
          <span v-if="i > 0" class="path-sep">›</span>
          <span class="path-seg" :class="{ 'path-file': i === pathSegments.length - 1 }">
            {{ seg }}<template v-if="i === pathSegments.length - 1 && isDirty"> ●</template>
          </span>
        </template>
      </div>
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

const currentFilePath = computed(() => store.activeTab?.filePath || '')
const isDirty = computed(() => !!store.activeTab?.isDirty)

// MarkText 风格：路径按层级显示为面包屑，文件名高亮，超长时从左侧截断
const pathSegments = computed(() => {
  if (!currentFilePath.value) return []
  return currentFilePath.value.split(/[\\/]/).filter(Boolean)
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
.logo-img {
  display: block;
}
.app-name {
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.5px;
  color: var(--text-primary);
  background: linear-gradient(135deg, #f56b6b 0%, #ff9a44 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
.title-divider {
  width: 1px;
  height: 14px;
  background: var(--border-color);
  margin: 0 4px;
}
.file-name {
  font-family: var(--ui-font-family, inherit);
  font-size: var(--ui-font-size, 13px);
  color: var(--text-secondary);
  max-width: 400px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.file-path {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  min-width: 0;
  max-width: 60%;
  overflow: hidden;
  font-family: var(--ui-font-family, inherit);
  font-size: var(--ui-font-size, 13px);
  white-space: nowrap;
  direction: ltr;
}
.path-seg {
  flex-shrink: 0;
  color: var(--text-muted);
}
.path-file {
  color: var(--text-primary);
  font-weight: 500;
}
.path-sep {
  flex-shrink: 0;
  color: var(--text-muted);
  opacity: 0.6;
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
