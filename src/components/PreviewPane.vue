<template>
  <div class="preview-pane" v-show="store.tabs.length > 0 && store.settings.viewMode !== 'edit'">
    <div class="preview-toolbar">
      <span class="preview-title">预览</span>
      <button class="preview-btn" @click="exportImage" title="导出为图片">🖼</button>
      <button class="preview-btn" @click="exportPdf" title="导出为 PDF">📄</button>
    </div>
    <div class="preview-scroll" ref="previewScroll" @scroll="onPreviewScroll">
      <div class="markdown-body" v-html="renderedHtml" ref="previewContent"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { useEditorStore } from '@/stores/editorStore'
import { parseMarkdown } from '@/core/markdown/parser'

const store = useEditorStore()
const previewScroll = ref(null)
const previewContent = ref(null)

const renderedHtml = computed(() => {
  if (!store.activeTab) return ''
  return parseMarkdown(store.content)
})

// Sync scroll: editor → preview
const editorScrollHandler = (editorScrollPercent) => {
  if (!previewScroll.value || !store.settings.scrollSync) return
  const maxScroll = previewScroll.value.scrollHeight - previewScroll.value.clientHeight
  previewScroll.value.scrollTop = maxScroll * editorScrollPercent
}

// Listen for editor scroll events
watch(() => store.activeTabId, () => {
  nextTick(() => {
    if (previewScroll.value) previewScroll.value.scrollTop = 0
  })
})

function onPreviewScroll() {
  // Could emit scroll percent for bidirectional sync
}

function exportImage() {
  store.showExport = true
  store.exportFormat = 'image'
}

function exportPdf() {
  store.showExport = true
  store.exportFormat = 'pdf'
}

// Expose for parent to call
defineExpose({ editorScrollHandler })
</script>

<style scoped>
.preview-pane {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  background: var(--bg-primary);
}
.preview-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 12px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}
.preview-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  flex: 1;
}
.preview-btn {
  border: none;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 14px;
}
.preview-btn:hover { background: var(--hover-bg); }
.preview-scroll {
  flex: 1;
  min-height: 0;
  overflow: scroll;
}
.markdown-body {
  padding: 24px 32px;
  font-size: var(--preview-font-size);
  font-family: var(--preview-font-family);
  line-height: var(--line-height);
}
</style>
<style>
.preview-scroll::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}
.preview-scroll::-webkit-scrollbar-track {
  background: var(--hover-bg);
  border-radius: 5px;
}
.preview-scroll::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb);
  border-radius: 5px;
  border: 2px solid var(--hover-bg);
}
.preview-scroll::-webkit-scrollbar-thumb:hover {
  background: var(--text-muted);
}
.preview-scroll::-webkit-scrollbar-corner {
  background: var(--hover-bg);
}

.markdown-body {
  word-wrap: normal !important;
  overflow-wrap: normal !important;
}
.markdown-body pre {
  overflow-x: auto !important;
  word-wrap: normal !important;
}
.markdown-body table {
  overflow-x: auto !important;
}
</style>
