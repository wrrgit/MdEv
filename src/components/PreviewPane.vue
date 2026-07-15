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
let isSyncing = false

const renderedHtml = computed(() => {
  if (!store.activeTab) return ''
  return parseMarkdown(store.content)
})

watch(() => store.scrollSyncSource, (val) => {
  if (!val || val.source === 'preview' || !store.settings.scrollSync) return
  if (!previewScroll.value) return
  const el = previewScroll.value
  const maxScroll = el.scrollHeight - el.clientHeight
  if (maxScroll <= 0) return
  isSyncing = true
  el.scrollTop = maxScroll * val.percent
  nextTick(() => { isSyncing = false })
})

watch(() => store.activeTabId, () => {
  nextTick(() => {
    if (previewScroll.value) previewScroll.value.scrollTop = 0
  })
})

function onPreviewScroll() {
  if (isSyncing || !store.settings.scrollSync) return
  const el = previewScroll.value
  if (!el) return
  const maxScroll = el.scrollHeight - el.clientHeight
  if (maxScroll <= 0) return
  isSyncing = true
  store.scrollSyncSource = { source: 'preview', percent: el.scrollTop / maxScroll }
  nextTick(() => { isSyncing = false })
}

function exportImage() {
  store.showExport = true
  store.exportFormat = 'image'
}

function exportPdf() {
  store.showExport = true
  store.exportFormat = 'pdf'
}
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
  width: 14px;
  height: 14px;
}
.preview-scroll::-webkit-scrollbar-track {
  background: var(--hover-bg);
  border-radius: 7px;
  border: 3px solid var(--bg-primary);
}
.preview-scroll::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb);
  border-radius: 7px;
  border: 3px solid var(--hover-bg);
  min-height: 60px;
  min-width: 60px;
}
.preview-scroll::-webkit-scrollbar-thumb:hover {
  background: var(--text-muted);
}
.preview-scroll::-webkit-scrollbar-corner {
  background: var(--bg-primary);
}

.markdown-body {
  min-width: max-content !important;
  word-wrap: normal !important;
  overflow-wrap: normal !important;
}
.markdown-body pre {
  overflow: visible !important;
}
.markdown-body table {
  overflow: visible !important;
}
</style>
