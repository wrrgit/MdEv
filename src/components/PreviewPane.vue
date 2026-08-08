<template>
  <div class="preview-pane" v-show="store.tabs.length > 0 && store.settings.viewMode !== 'edit'">
    <div class="preview-scroll" ref="previewScroll" @scroll="onPreviewScroll">
      <div class="markdown-body" :class="{ 'word-wrap-enabled': store.settings.wordWrap }" v-html="renderedHtml" ref="previewContent" @click="onPreviewClick"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'
import { useEditorStore } from '@/stores/editorStore'
import { parseMarkdown } from '@/core/markdown/parser'

const store = useEditorStore()
const previewScroll = ref(null)
const previewContent = ref(null)
const renderedHtml = ref('')
let isSyncing = false

watch(() => store.content, async () => {
  if (!store.activeTab) {
    renderedHtml.value = ''
    return
  }
  renderedHtml.value = await parseMarkdown(store.content, {
    filePath: store.activeTab?.filePath,
    projectRoot: store.projectRoot
  })
  await nextTick()
  await renderMermaidBlocks()
}, { immediate: true })

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

// ── 点击预览区链接/图片，打开本地文件 ──
async function onPreviewClick(e) {
  // 点击图片：用系统查看器打开
  const img = e.target.closest('img')
  if (img) {
    const src = img.getAttribute('src') || ''
    if (src.startsWith('mdimg://')) {
      e.preventDefault()
      const filePath = decodeURIComponent(src.replace(/^mdimg:\/\/\/?/, '')).replace(/^\//, '')
      await window.api?.openPath(filePath)
    }
    return
  }

  // 点击链接
  const link = e.target.closest('a')
  if (!link) return
  const href = link.getAttribute('href') || ''
  if (!href) return

  // 外部链接和锚点：交给系统浏览器
  if (/^(https?:|mailto:|#)/i.test(href)) return

  // mdimg 协议的链接
  if (href.startsWith('mdimg://')) {
    e.preventDefault()
    const filePath = decodeURIComponent(href.replace(/^mdimg:\/\/\/?/, '')).replace(/^\//, '')
    await openLocalFile(filePath)
    return
  }

  // 相对路径链接
  e.preventDefault()
  const basePath = store.activeTab?.filePath
    ? store.activeTab.filePath.replace(/[\\/][^\\/]+$/, '')
    : store.projectRoot || ''
  const absPath = await window.api?.resolvePath(href, basePath)
  if (absPath) {
    await openLocalFile(absPath)
  }
}

async function openLocalFile(filePath) {
  const ext = filePath.toLowerCase().match(/\.([^.]+)$/)?.[1] || ''

  // 文本类文件：在编辑器新标签打开
  const editableExts = ['md', 'markdown', 'mdown', 'mdx', 'json', 'js', 'ts', 'jsx', 'tsx',
    'css', 'scss', 'less', 'html', 'htm', 'xml', 'yaml', 'yml', 'toml', 'ini', 'txt', 'csv',
    'py', 'java', 'c', 'cpp', 'h', 'go', 'rs', 'rb', 'php', 'sh', 'bash', 'sql', 'lua', 'kt', 'dart']
  if (editableExts.includes(ext)) {
    const result = await window.api?.readFile(filePath)
    if (result?.success) {
      const fileName = filePath.split(/[\\/]/).pop()
      store.addTab(filePath, result.content, fileName)
      store.addRecentFile(filePath)
    }
  } else {
    // 图片/其他文件：用系统默认程序打开
    await window.api?.openPath(filePath)
  }
}

let mermaidCounter = 0
async function renderMermaidBlocks() {
  const el = previewScroll.value
  if (!el) return
  const mermaidEls = el.querySelectorAll('.mermaid')
  if (mermaidEls.length === 0) return
  const mermaid = (await import('mermaid')).default
  mermaid.initialize({ startOnLoad: false, theme: 'default' })
  for (const block of mermaidEls) {
    try {
      const id = 'mermaid-' + (++mermaidCounter)
      const { svg } = await mermaid.render(id, block.textContent)
      block.innerHTML = svg
    } catch {
      block.innerHTML = '<p style="color:red">Mermaid 渲染错误</p>'
    }
  }
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
.preview-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
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
.markdown-body.word-wrap-enabled {
  min-width: unset !important;
  word-wrap: break-word !important;
  overflow-wrap: break-word !important;
  overflow-x: hidden !important;
}
.markdown-body pre {
  overflow: visible !important;
}
.markdown-body table {
  overflow: visible !important;
}
/* 自动换行模式：代码块/表格内部横向滚动，不撑破预览区，避免整体水平滚动条 */
.markdown-body.word-wrap-enabled pre {
  overflow-x: auto !important;
}
.markdown-body.word-wrap-enabled table {
  display: block !important;
  overflow-x: auto !important;
  max-width: 100% !important;
}
/* 自动换行模式：图片/图表按容器宽度缩放，不撑破预览区 */
.markdown-body.word-wrap-enabled img {
  max-width: 100% !important;
}
.markdown-body.word-wrap-enabled .mermaid svg {
  max-width: 100% !important;
  height: auto !important;
}

/* ── 下标、上标、高亮 ── */
.markdown-body sub { font-size: 0.75em; vertical-align: sub; }
.markdown-body sup { font-size: 0.75em; vertical-align: super; }
.markdown-body mark { background: #fff3b0; padding: 0 2px; border-radius: 2px; }

/* ── 脚注 ── */
.markdown-body .footnote { font-size: 0.85em; color: var(--text-secondary); border-top: 1px solid var(--border-color); margin-top: 16px; padding-top: 8px; }
.markdown-body .footnote ol { padding-left: 16px; }
.markdown-body .footnote li { margin-bottom: 4px; }
.markdown-body .footnote-ref { font-size: 0.75em; vertical-align: super; }

/* ── Admonition / Callout ── */
.markdown-body .admonition {
  border-radius: 6px;
  padding: 12px 16px;
  margin: 12px 0;
  border: 1px solid;
  border-left-width: 4px;
}
.markdown-body .admonition .admonition-title {
  font-weight: 700;
  margin-bottom: 8px;
  margin-top: 0;
  font-size: 14px;
}
.markdown-body .admonition > *:last-child { margin-bottom: 0; }
.markdown-body .admonition > *:first-child { margin-top: 0; }
.markdown-body .admonition-note {
  background: #e8f4fd;
  border-color: #2196f3;
}
.markdown-body .admonition-note .admonition-title { color: #1976d2; }
.markdown-body .admonition-tip {
  background: #e8f5e9;
  border-color: #4caf50;
}
.markdown-body .admonition-tip .admonition-title { color: #388e3c; }
.markdown-body .admonition-warning {
  background: #fff3e0;
  border-color: #ff9800;
}
.markdown-body .admonition-warning .admonition-title { color: #f57c00; }
.markdown-body .admonition-danger {
  background: #ffebee;
  border-color: #f44336;
}
.markdown-body .admonition-danger .admonition-title { color: #d32f2f; }

/* ── PlantUML ── */
.markdown-body .plantuml-container { margin: 12px 0; text-align: center; }
.markdown-body .plantuml-diagram { max-width: 100%; height: auto; border: 1px solid var(--border-color); border-radius: 4px; }
.markdown-body .plantuml-source { margin-top: 4px; text-align: left; }
.markdown-body .plantuml-source summary { cursor: pointer; font-size: 12px; color: var(--text-muted); }
.markdown-body .plantuml-source summary:hover { color: var(--text-secondary); }
.markdown-body .plantuml-source pre { margin-top: 4px; }
</style>
