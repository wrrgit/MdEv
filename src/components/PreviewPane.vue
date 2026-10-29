<template>
  <div class="preview-pane" v-show="store.tabs.length > 0 && store.settings.viewMode !== 'edit'"
    @contextmenu.prevent="onPreviewContextMenu">
    <div class="preview-scroll" ref="previewScroll" @scroll="onPreviewScroll">
      <div class="markdown-body" :class="{ 'word-wrap-enabled': store.settings.wordWrap }" v-html="renderedHtml" ref="previewContent" @click="onPreviewClick"></div>
    </div>
    <!-- 超大文件：自动刷新已暂停，编辑不影响编辑器流畅度，需手动刷新预览 -->
    <div v-if="previewPaused" class="preview-banner">
      <span class="preview-banner-text">超大文件：预览已暂停自动刷新（编辑流畅，预览按需更新）</span>
      <button class="preview-banner-btn" @click="refreshPreview(true)">刷新预览 (Ctrl+Shift+R)</button>
    </div>
    <!-- 渲染中指示（大文件重渲染期间）-->
    <div v-if="isRendering" class="preview-rendering">渲染中…</div>
    <!-- 选中文本右键菜单：复制 / 文内搜索 / 在打开的文件中搜索 -->
    <ContextMenu
      :visible="menuVisible"
      :x="menuX"
      :y="menuY"
      :items="items"
      @close="close"
      @select="onSelect"
    />
  </div>
</template>

<script setup>
import { ref, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useEditorStore } from '@/stores/editorStore'
import { parseMarkdown } from '@/core/markdown/parser'
import { classifyContent } from '@/core/perf'
import { buildAnchors, yToLine, lineToY, currentHeadingLine, lockScrollSync, isScrollSyncLocked } from '@/core/scrollMapper'
import ContextMenu from './ContextMenu.vue'
import { useSelectionMenu } from '@/composables/useSelectionMenu'

const store = useEditorStore()
const previewScroll = ref(null)
const previewContent = ref(null)
const renderedHtml = ref('')

// ── 选中文本右键菜单 ──
const { menuVisible, menuX, menuY, items, open: openMenu, close, onSelect } = useSelectionMenu(store)

function onPreviewContextMenu(e) {
  const text = window.getSelection?.()?.toString() || ''
  openMenu(e, text)
}

// ── 源码行映射锚点缓存（每次渲染后重建）──
let anchorCache = null // { anchors, pad }
let scrollRafPending = false

function rebuildAnchors() {
  const content = previewContent.value
  const scroller = previewScroll.value
  anchorCache = content && scroller ? buildAnchors(content, scroller) : null
}

// ── 预览区搜索词高亮 ──
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function clearSearchHighlights() {
  const content = previewContent.value
  if (!content) return
  for (const mark of content.querySelectorAll('mark.search-hit')) {
    const parent = mark.parentNode
    if (!parent) continue
    parent.replaceChild(document.createTextNode(mark.textContent), mark)
    parent.normalize()
  }
}

function applySearchHighlights() {
  const content = previewContent.value
  const term = store.searchHighlightTerm
  if (!content) return
  clearSearchHighlights()
  if (!term || term.length < 1) return

  const rx = new RegExp(escapeRegExp(term), 'gi')
  const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT
      const p = node.parentElement
      if (!p || p.closest('script, style, .search-hit')) return NodeFilter.FILTER_REJECT
      return NodeFilter.FILTER_ACCEPT
    }
  })
  const nodes = []
  while (walker.nextNode()) nodes.push(walker.currentNode)

  for (const node of nodes) {
    const text = node.nodeValue
    rx.lastIndex = 0
    if (!rx.test(text)) continue
    const frag = document.createDocumentFragment()
    let lastIdx = 0
    rx.lastIndex = 0
    let m
    while ((m = rx.exec(text)) !== null) {
      if (m.index > lastIdx) frag.appendChild(document.createTextNode(text.slice(lastIdx, m.index)))
      const mark = document.createElement('mark')
      mark.className = 'search-hit'
      mark.textContent = m[0]
      frag.appendChild(mark)
      lastIdx = m.index + m[0].length
      if (m[0].length === 0) rx.lastIndex++
    }
    if (lastIdx < text.length) frag.appendChild(document.createTextNode(text.slice(lastIdx)))
    node.parentNode.replaceChild(frag, node)
  }
}

watch(() => store.searchHighlightTerm, () => {
  nextTick(applySearchHighlights)
})

// ── 大文件分级预览刷新（对标 VS Code / Obsidian 大文件策略）──
// 当前每次按键都会全文 markdown-it 解析 + 重建 DOM，对大文件会卡死主线程。
// 改为：
//  - normal：120ms 防抖（合并快速输入），兼顾实时性与流畅度；
//  - large ：400ms 防抖（>60 万字符或 >2 万行），降低重渲染频率；
//  - huge  ：停止自动刷新，仅在打开 / 手动刷新（Ctrl+Shift+R）时渲染，
//            编辑期间编辑器保持流畅，预览按需更新。
//  - 编辑模式（viewMode==='edit'）下完全跳过预览渲染，省 CPU。
const fileTier = ref('normal')
const isRendering = ref(false)
const previewPaused = ref(false)
let renderTimer = null
let renderedContent = '' // 已渲染内容快照，用于去重（避免切标签触发的冗余重渲染）

function recomputeTier() {
  const c = store.activeTab ? store.content : ''
  fileTier.value = classifyContent(c).tier
}

// 真正的渲染动作（可被防抖调度或立即调用）
function renderNow(force = false) {
  if (!store.activeTab) {
    renderedHtml.value = ''
    renderedContent = ''
    previewPaused.value = false
    return
  }
  // 编辑模式不渲染预览
  if (store.settings.viewMode === 'edit') return
  // 超大文件：非强制（手动刷新）时不自动刷新
  if (fileTier.value === 'huge' && !force) {
    previewPaused.value = true
    return
  }
  previewPaused.value = false
  if (renderTimer) {
    clearTimeout(renderTimer)
    renderTimer = null
  }
  isRendering.value = true
  parseMarkdown(store.content, {
    filePath: store.activeTab?.filePath,
    projectRoot: store.projectRoot
  })
    .then((html) => {
      renderedHtml.value = html
      renderedContent = store.content
    })
    .then(() => nextTick())
    .then(() => {
      setupMermaidLazy()
      rebuildAnchors()
      applySearchHighlights()
    })
    .finally(() => {
      isRendering.value = false
    })
}

// 按键输入等高频变更：按分级策略防抖调度
function scheduleRender() {
  if (!store.activeTab) return
  if (store.settings.viewMode === 'edit') return
  recomputeTier()
  if (fileTier.value === 'huge') {
    previewPaused.value = true
    return
  }
  const delay = fileTier.value === 'large' ? 400 : 120
  if (renderTimer) clearTimeout(renderTimer)
  renderTimer = setTimeout(() => {
    renderTimer = null
    // 内容自上次渲染后未变化（如切标签后触发的冗余调度）则跳过
    if (store.content === renderedContent) return
    renderNow(false)
  }, delay)
}

// 手动刷新（按钮 / Ctrl+Shift+R）：即使是超大文件也强制渲染一次
function refreshPreview(force = true) {
  renderNow(force)
}

// 内容变化 → 防抖调度（不立即渲染）
watch(() => store.content, scheduleRender)

// 切换标签 → 立即按当前分级渲染（保证打开即见内容）
watch(() => store.activeTabId, () => {
  recomputeTier()
  renderNow(true)
})

// 视图模式切换：回到非编辑模式时补一次渲染（编辑模式期间跳过了渲染）
watch(() => store.settings.viewMode, () => {
  if (store.settings.viewMode !== 'edit') renderNow(true)
})

// 字体/行高变化会改变预览布局，锚点需要重建
watch(() => [store.settings.previewFontSize, store.settings.previewFontFamily, store.settings.lineHeight], () => {
  nextTick(rebuildAnchors)
})

// 视图模式 / 预览区尺寸变化（窗口 resize、侧栏拖动、切到双栏）都会让文字重新折行，锚点必须重建
watch(() => store.settings.viewMode, () => nextTick(rebuildAnchors))

let resizeObserver = null
function onPreviewKeydown(e) {
  // Ctrl+Shift+R：手动刷新预览（超大文件下强制渲染一次）
  if (e.ctrlKey && e.shiftKey && (e.key === 'R' || e.key === 'r')) {
    e.preventDefault()
    refreshPreview(true)
  }
}
onMounted(() => {
  resizeObserver = new ResizeObserver(() => rebuildAnchors())
  if (previewScroll.value) resizeObserver.observe(previewScroll.value)
  if (previewContent.value) resizeObserver.observe(previewContent.value)
  // 首屏渲染（DOM 就绪后）：超大文件不强制渲染，保持打开瞬间流畅（显示横幅，按需刷新）
  nextTick(() => {
    recomputeTier()
    renderNow(false)
  })
  window.addEventListener('keydown', onPreviewKeydown)
})
onUnmounted(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  if (mermaidObserver) {
    mermaidObserver.disconnect()
    mermaidObserver = null
  }
  window.removeEventListener('keydown', onPreviewKeydown)
})

watch(() => store.scrollSyncSource, (val) => {
  if (!val || val.source === 'preview' || !store.settings.scrollSync) return
  if (store.settings.viewMode === 'edit') return
  const el = previewScroll.value
  let cache = anchorCache
  // 自愈：编辑器驱动同步时锚点缺失，现场重建一次再换算
  if ((!cache || cache.anchors.length === 0) && el) {
    rebuildAnchors()
    cache = anchorCache
  }
  if (!el || !cache || cache.anchors.length === 0) return
  lockScrollSync('preview')
  // 编辑区已到底：预览区也跟到底，避免文档末尾左右错位
  if (val.atBottom) {
    el.scrollTop = el.scrollHeight - el.clientHeight
    return
  }
  const y = lineToY(cache.anchors, val.line)
  if (y == null) return
  el.scrollTop = Math.max(0, y + cache.pad)
})

watch(() => store.activeTabId, () => {
  nextTick(() => {
    if (previewScroll.value) previewScroll.value.scrollTop = 0
    rebuildAnchors()
  })
})

function onPreviewScroll() {
  if (scrollRafPending) return
  scrollRafPending = true
  requestAnimationFrame(() => {
    scrollRafPending = false
    const el = previewScroll.value
    let cache = anchorCache
    // 自愈：锚点缓存缺失（如启动时序、隐藏期间重建）导致联动失效时，现场重建一次
    if ((!cache || cache.anchors.length === 0) && el) {
      rebuildAnchors()
      cache = anchorCache
    }
    if (!el || !cache || cache.anchors.length === 0) return
    const y = el.scrollTop - cache.pad
    // TOC 当前章节高亮（不依赖滚动同步开关）
    const h = currentHeadingLine(cache.anchors, y)
    if (h) store.currentTocLine = h
    if (!store.settings.scrollSync || isScrollSyncLocked('preview')) return
    const line = yToLine(cache.anchors, y)
    if (line != null) {
      // 传递 1 基浮点行号，保留块内比例，避免取整造成的半行错位
      store.scrollSyncSource = {
        source: 'preview',
        line: Math.max(1, line),
        atBottom: el.scrollTop >= el.scrollHeight - el.clientHeight - 2
      }
    }
  })
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

  // 页内锚点（[TOC] 目录跳转）：滚动到对应标题
  if (href.startsWith('#')) {
    e.preventDefault()
    const target = previewContent.value?.querySelector(
      '#' + CSS.escape(decodeURIComponent(href.slice(1)))
    )
    if (target) {
      const sc = previewScroll.value
      const top = target.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop
      sc.scrollTo({ top: Math.max(0, top - 16), behavior: 'smooth' })
    }
    return
  }

  // 外部链接：交给系统浏览器
  if (/^(https?:|mailto:)/i.test(href)) return

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

// ── Mermaid 懒渲染：仅渲染视口内（含预渲染边距）的图表，其余滚动进入视口时再渲染 ──
// 文档含大量 Mermaid 图时，一次全量渲染会长时间阻塞主线程；改为按需渲染。
let mermaidCounter = 0
let mermaidObserver = null

async function renderOneMermaid(block) {
  if (!block || block.dataset.mermaidDone) return
  block.dataset.mermaidDone = '1'
  try {
    const mermaid = (await import('mermaid')).default
    mermaid.initialize({ startOnLoad: false, theme: 'default' })
    const id = 'mermaid-' + (++mermaidCounter)
    const { svg } = await mermaid.render(id, block.textContent)
    block.innerHTML = svg
  } catch {
    block.innerHTML = '<p style="color:red">Mermaid 渲染错误</p>'
  }
}

function setupMermaidLazy() {
  const el = previewScroll.value
  if (!el) return
  const blocks = Array.from(el.querySelectorAll('.mermaid'))
  if (blocks.length === 0) return
  if (mermaidObserver) {
    mermaidObserver.disconnect()
    mermaidObserver = null
  }
  const sr = el.getBoundingClientRect()
  for (const block of blocks) {
    const r = block.getBoundingClientRect()
    const inView = r.top < sr.bottom + 300 && r.bottom > sr.top - 300
    if (inView) {
      renderOneMermaid(block)
    } else {
      if (!mermaidObserver) {
        mermaidObserver = new IntersectionObserver((entries) => {
          for (const e of entries) {
            if (e.isIntersecting) {
              renderOneMermaid(e.target)
              mermaidObserver.unobserve(e.target)
            }
          }
        }, { root: el, rootMargin: '300px' })
      }
      mermaidObserver.observe(block)
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
  position: relative;
}
.preview-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
.preview-banner {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 14px;
  background: var(--accent-color, #0366d6);
  color: #fff;
  font-size: 13px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
}
.preview-banner-text { opacity: 0.95; }
.preview-banner-btn {
  flex-shrink: 0;
  padding: 4px 12px;
  border: 1px solid rgba(255, 255, 255, 0.6);
  border-radius: 5px;
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  cursor: pointer;
  font-size: 13px;
  white-space: nowrap;
}
.preview-banner-btn:hover { background: rgba(255, 255, 255, 0.24); }
.preview-rendering {
  position: absolute;
  right: 12px;
  bottom: 12px;
  z-index: 20;
  padding: 4px 12px;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  font-size: 12px;
  pointer-events: none;
  animation: preview-fade 0.2s ease-in;
}
@keyframes preview-fade {
  from { opacity: 0; }
  to { opacity: 1; }
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

/* ── 搜索词高亮 ── */
.markdown-body mark.search-hit {
  background: #ffd43b;
  color: inherit;
  padding: 0 1px;
  border-radius: 2px;
}
html[data-theme='dark'] .markdown-body mark.search-hit {
  background: #a07c00;
  color: #fff;
}

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

/* ── [TOC] 目录块 ── */
.markdown-body .md-toc {
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-secondary);
  padding: 12px 20px;
  margin: 0 0 20px;
}
.markdown-body .md-toc .md-toc-title {
  font-weight: 700;
  font-size: 15px;
  margin: 0 0 8px;
  color: var(--text-primary);
}
.markdown-body .md-toc ul {
  padding-left: 18px;
  margin: 2px 0;
  list-style: disc;
}
.markdown-body .md-toc li { margin: 2px 0; }
.markdown-body .md-toc a {
  color: var(--accent-color);
  text-decoration: none;
}
.markdown-body .md-toc a:hover { text-decoration: underline; }

/* ── PlantUML ── */
.markdown-body .plantuml-container { margin: 12px 0; text-align: center; }
.markdown-body .plantuml-diagram { max-width: 100%; height: auto; border: 1px solid var(--border-color); border-radius: 4px; }
.markdown-body .plantuml-source { margin-top: 4px; text-align: left; }
.markdown-body .plantuml-source summary { cursor: pointer; font-size: 12px; color: var(--text-muted); }

/* ── YAML Front-matter（Typora 风格属性表格）── */
.markdown-body .front-matter {
  margin: 0 0 20px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  overflow: hidden;
  background: var(--bg-secondary);
}
.markdown-body .fm-table {
  width: 100%;
  border-collapse: collapse;
  margin: 0 !important;
  font-size: 13px;
}
.markdown-body .fm-table tr { background: transparent !important; }
.markdown-body .fm-table th {
  width: 140px;
  padding: 6px 12px;
  text-align: left;
  font-weight: 600;
  color: var(--text-secondary);
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  vertical-align: top;
  white-space: nowrap;
}
.markdown-body .fm-table td {
  padding: 6px 12px;
  border-bottom: 1px solid var(--border-color);
  color: var(--text-primary);
  word-break: break-word;
}
.markdown-body .fm-table tr:last-child th,
.markdown-body .fm-table tr:last-child td { border-bottom: none; }
.markdown-body .fm-tag {
  display: inline-block;
  padding: 1px 8px;
  margin: 1px 2px;
  font-size: 12px;
  border-radius: 10px;
  background: var(--accent-color);
  color: #fff;
  opacity: 0.85;
}
.markdown-body .fm-value { font-family: inherit; }
.markdown-body .plantuml-source summary:hover { color: var(--text-secondary); }
.markdown-body .plantuml-source pre { margin-top: 4px; }
</style>
