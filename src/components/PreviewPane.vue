<template>
  <div class="preview-pane" v-show="store.tabs.length > 0 && store.settings.viewMode !== 'edit'"
    @contextmenu.prevent="onPreviewContextMenu">
    <div class="preview-scroll" ref="previewScroll" @scroll="onPreviewScroll">
      <div class="markdown-body" :class="{ 'word-wrap-enabled': store.settings.wordWrap }" ref="previewContent" @click="onPreviewClick"></div>
    </div>
    <!-- 超大文件（P3 块级渐进渲染）：已显示部分内容，其余按需加载 -->
    <div v-if="hugeHasMore" class="preview-banner">
      <span class="preview-banner-text">超大文件预览：已显示前 {{ hugeShownLines }} 行（共 {{ hugeTotalLines }} 行），其余按需加载</span>
      <button class="preview-banner-btn" :disabled="hugeAutoLoading" @click="loadNextChunk">加载更多</button>
    </div>
    <!-- 超大文件：编辑中自动刷新已暂停，可手动刷新预览 -->
    <div v-else-if="previewPaused" class="preview-banner">
      <span class="preview-banner-text">超大文件：预览已暂停自动刷新（编辑流畅，预览按需更新）</span>
      <button class="preview-banner-btn" @click="refreshPreview(true)">刷新预览 (Ctrl+Shift+R)</button>
    </div>
    <!-- 渲染中指示（大文件重渲染期间）-->
    <div v-if="isRendering" class="preview-rendering">渲染中…</div>
    <!-- 超大文件截断只读提示（主进程仅读取前 N MB，编辑已禁用以免写回破坏原文件）-->
    <div v-if="activeTabTruncated" class="preview-banner preview-banner-warn">
      <span class="preview-banner-text">文件过大（{{ truncatedLabel }}），预览为部分内容，编辑已禁用</span>
    </div>
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
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useEditorStore } from '@/stores/editorStore'
import { parseMarkdown } from '@/core/markdown/parser'
import { classifyContent, formatBytes } from '@/core/perf'
import { buildAnchors, yToLine, lineToY, currentHeadingLine, lockScrollSync, isScrollSyncLocked } from '@/core/scrollMapper'
import ContextMenu from './ContextMenu.vue'
import { useSelectionMenu } from '@/composables/useSelectionMenu'
import { useOpenFile } from '@/composables/useOpenFile'

const store = useEditorStore()
const { openFile } = useOpenFile()
const previewScroll = ref(null)
const previewContent = ref(null)

// ── P3：预览 DOM 改为手动管理（v-html 已移除）──
// 正常/大文件：整篇 innerHTML 替换；超大文件：分块渐进渲染（首屏块 + 按需加载后续块），
// 始终把预览 DOM 节点数控制在可控范围，避免万行文档的整篇 DOM 卡顿。
let previewHtmlDirty = false

// ── P4：预览渲染缓存（stale-while-revalidate）──
// 切回已渲染过的标签时同步命中缓存瞬时还原（0ms 白屏），再后台异步重渲染以吸纳外部/草稿变更。
// 超大文件仅缓存首屏块（避免缓存随分块无限增长），其余按需加载。
const PREVIEW_CACHE_LIMIT = 12
const previewCache = new Map() // tabId -> html 字符串
function cachePreview(id, html) {
  if (!id || html == null) return
  if (previewCache.has(id)) previewCache.delete(id)
  previewCache.set(id, html)
  while (previewCache.size > PREVIEW_CACHE_LIMIT) {
    previewCache.delete(previewCache.keys().next().value)
  }
}

// ── P3：超大文件块级渐进渲染状态 ──
const HUGE_CHUNK_LINES = 6000 // 每块约 6000 行（拆分点取空行，且不在代码围栏内）
const hugeChunks = ref([])      // [{ text, startLine, endLine }]
const hugeRendered = ref(0)     // 已渲染块数
const hugeAutoLoading = ref(false)
const hugeHasMore = computed(() => fileTier.value === 'huge' && hugeRendered.value > 0 && hugeRendered.value < hugeChunks.value.length)
const hugeShownLines = computed(() => hugeRendered.value > 0 ? hugeChunks.value[hugeRendered.value - 1].endLine : 0)
const hugeTotalLines = computed(() => hugeChunks.value.length ? hugeChunks.value[hugeChunks.value.length - 1].endLine : 0)

// ── P1：超大文件截断只读提示 ──
const activeTabTruncated = computed(() => !!store.activeTab?.truncated)
const truncatedLabel = computed(() => {
  const t = store.activeTab
  if (!t?.truncated || !t.truncatedBytes) return '部分内容'
  return formatBytes(t.truncatedBytes)
})

// ── P0：预览滚动位置按标签保留，切回时恢复（替代原先切标签强制归零）──
const previewScrollMap = new Map()
let pendingRestoreTabId = null
// 恢复滚动期间抑制 onPreviewScroll 的滚动联动推送（避免把恢复的滚动同步回编辑器）
let restoringPreview = false

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
      if (!p || p.closest('script, style, .search-hit, .preview-line-gutter')) return NodeFilter.FILTER_REJECT
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

// ── 预览区源码行号 gutter ──
// 复用 parser 注入的 data-source-line，在每个块级元素起始源码行处渲染行号，
// 与编辑区行号、搜索结果、滚动同步共用同一套 1 基行号约定。
// 行号层随内容滚动、水平滚动时 sticky 钉在左侧，且不参与搜索高亮遍历（已在上方排除）。
function clearLineGutter() {
  const content = previewContent.value
  if (!content) return
  content.classList.remove('has-line-gutter')
  content.querySelector('.preview-line-gutter')?.remove()
}

function buildLineGutter() {
  const content = previewContent.value
  const scroller = previewScroll.value
  clearLineGutter()
  if (!content || !scroller) return
  if (!store.settings.showPreviewLineNumbers) return

  content.classList.add('has-line-gutter')
  const contentRect = content.getBoundingClientRect()
  const anchors = []
  for (const el of content.querySelectorAll('[data-source-line]')) {
    // 容器元素（内部还有带源码行号的块）交给内部块处理，避免重复映射（与滚动同步一致）
    if (el.querySelector('[data-source-line]')) continue
    const line = parseInt(el.dataset.sourceLine, 10)
    if (!Number.isFinite(line)) continue
    const rect = el.getBoundingClientRect()
    anchors.push({ line, top: rect.top - contentRect.top })
  }
  if (!anchors.length) return
  // 同一行存在多个块（如一行多列表格单元格）时，只保留视觉最靠前的一个
  anchors.sort((a, b) => a.top - b.top || a.line - b.line)
  const seen = new Set()
  const deduped = anchors.filter(a => { if (seen.has(a.line)) return false; seen.add(a.line); return true })

  const gutter = document.createElement('div')
  gutter.className = 'preview-line-gutter'
  for (const a of deduped) {
    const span = document.createElement('span')
    span.className = 'plg-num'
    span.textContent = String(a.line)
    span.style.top = a.top + 'px'
    gutter.appendChild(span)
  }
  // 关键：必须插到内容最前面（而非 appendChild 到末尾）。
  // gutter 是 0 尺寸的 sticky 盒子，作为 .plg-num 绝对定位的偏移参照物；
  // 只有锚定在内容顶部时，top:a.top（以内容顶部为 0 基准）的偏移才正确，
  // 否则会被放到内容流底部之下而整片不可见。
  content.insertBefore(gutter, content.firstChild)
}

// 锚点 + 行号层一起重建（字体/缩放/切标签/渲染后均需同步）
function rebuildOverlays() {
  rebuildAnchors()
  buildLineGutter()
}

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
let renderSeq = 0 // P2：渲染序号，仅应用最新一次结果，丢弃 Worker 返回过期的旧渲染
let renderedContent = '' // 已渲染内容快照，用于去重（避免切标签触发的冗余重渲染）

function recomputeTier() {
  const c = store.activeTab ? store.content : ''
  fileTier.value = classifyContent(c).tier
}

// ── P3：预览 DOM 赋值（v-html 已移除，改为手动管理以支持超大文件分块追加）──
// append 模式用 insertAdjacentHTML('beforeend') 而非 innerHTML +=，
// 避免每次追加都把已渲染的上万节点整段序列化再反序列化（O(N²) 卡顿）。
function applyPreviewHtml(html, append = false) {
  const el = previewContent.value
  if (!el) return
  if (append) el.insertAdjacentHTML('beforeend', html)
  else el.innerHTML = html
}

// ── P3：图片懒加载（data-src + IntersectionObserver 视口门控）──
// 大文档含大量图片时，不在视口内的图片延后到靠近视口才真正加载，
// 降低首屏解码/内存峰值（外部 http(s) 与本地 mdimg:// 图片均受益）。
let imageObserver = null
function observeImage(img) {
  if (!imageObserver) {
    const root = previewScroll.value
    imageObserver = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue
        const im = e.target
        const src = im.dataset.src
        if (src) {
          im.src = src
          delete im.dataset.src
        }
        im.classList.remove('lazy-img')
        imageObserver.unobserve(im)
      }
    }, { root, rootMargin: '400px' })
  }
  imageObserver.observe(img)
}
function setupLazyImages() {
  const el = previewContent.value
  if (!el) return
  const scroller = previewScroll.value
  const sr = scroller ? scroller.getBoundingClientRect() : { top: -1e9, bottom: 1e9 }
  const imgs = el.querySelectorAll('img:not([data-lazy-handled])')
  imgs.forEach((img) => {
    img.dataset.lazyHandled = '1'
    const src = img.getAttribute('src')
    if (!src) return
    const r = img.getBoundingClientRect()
    const inView = r.bottom > sr.top - 200 && r.top < sr.bottom + 200
    if (inView) return // 视口内或很近：保持立即加载
    img.dataset.src = src
    img.removeAttribute('src')
    img.classList.add('lazy-img')
    observeImage(img)
  })
}

// ── P3：超大文件分块（在空行处切分，且绝不在代码围栏内部切分）──
function splitIntoChunks(content, targetLines) {
  const lines = content.split('\n')
  const chunks = []
  let inFence = false
  let buf = []
  let bufStart = 1
  let lineNo = 1
  const flush = (endLine) => {
    if (buf.length === 0) return
    chunks.push({ text: buf.join('\n'), startLine: bufStart, endLine })
    buf = []
  }
  for (let i = 0; i < lines.length; i++, lineNo++) {
    const line = lines[i]
    // 跟踪围栏状态：围栏内的空行不能作为切分点
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence
    if (!inFence && line.trim() === '' && buf.length >= targetLines) {
      flush(lineNo - 1)
      bufStart = lineNo // 空行作为下一块起点
      buf = []
      continue
    }
    if (buf.length === 0) bufStart = lineNo
    buf.push(line)
  }
  flush(lineNo - 1)
  if (chunks.length === 0 && content.length > 0) {
    chunks.push({ text: content, startLine: 1, endLine: lines.length })
  }
  return chunks
}

let hugeChunksCache = { key: null, chunks: [] }
function getHugeChunks(content) {
  if (hugeChunksCache.key === content) return hugeChunksCache.chunks
  const chunks = splitIntoChunks(content, HUGE_CHUNK_LINES)
  hugeChunksCache = { key: content, chunks }
  return chunks
}

// 为块还原原始行号（markdown-it token.map 基于解析输入的起始行），避免分块后行号错位
function padChunkLines(chunk) {
  return '\n'.repeat(Math.max(0, chunk.startLine - 1)) + chunk.text
}

function restorePreviewScroll() {
  if (pendingRestoreTabId === store.activeTabId) {
    const el = previewScroll.value
    if (el) {
      restoringPreview = true
      el.scrollTop = previewScrollMap.get(pendingRestoreTabId) ?? 0
      requestAnimationFrame(() => { restoringPreview = false })
    }
    pendingRestoreTabId = null
  }
}

// ── P3：超大文件块级渐进渲染（仅首屏块先渲染，其余按需加载）──
async function renderHugeChunked(mySeq) {
  const ctx = { filePath: store.activeTab?.filePath, projectRoot: store.projectRoot }
  const chunks = getHugeChunks(store.content)
  hugeChunks.value = chunks
  hugeRendered.value = 0
  if (chunks.length === 0) { applyPreviewHtml('', false); return }
  hugeRendered.value = 1
  const html0 = await parseMarkdown(padChunkLines(chunks[0]), ctx)
  if (mySeq !== renderSeq) return
  imageObserver?.disconnect(); imageObserver = null
  applyPreviewHtml(html0, false)
  await nextTick()
  if (mySeq !== renderSeq) return
  setupMermaidLazy(); rebuildOverlays(); applySearchHighlights(); setupLazyImages(); restorePreviewScroll()
  // P4：仅缓存首屏块（超大文件分块无限增长，缓存首屏足以消除切回白屏）
  cachePreview(store.activeTabId, previewContent.value ? previewContent.value.innerHTML : '')
}

// 加载下一块（按钮 / 滚动到底自动触发）
async function loadNextChunk() {
  if (hugeAutoLoading.value) return
  if (hugeRendered.value >= hugeChunks.value.length) return
  const seq = renderSeq // 渲染期间若发生切标签，本次追加作废
  hugeAutoLoading.value = true
  try {
    const ctx = { filePath: store.activeTab?.filePath, projectRoot: store.projectRoot }
    const chunk = hugeChunks.value[hugeRendered.value]
    const html = await parseMarkdown(padChunkLines(chunk), ctx)
    if (seq !== renderSeq) return
    applyPreviewHtml(html, true)
    hugeRendered.value++
    await nextTick()
    if (seq !== renderSeq) return
    setupMermaidLazy(); rebuildOverlays(); applySearchHighlights(); setupLazyImages()
  } finally {
    hugeAutoLoading.value = false
  }
}

// 真正的渲染动作（可被防抖调度或立即调用）
// P2：解析已移至 Web Worker，主线程不再被 markdown-it 阻塞；renderSeq 守卫丢弃过期结果。
// P3：超大文件改为块级渐进渲染（renderHugeChunked），其余整篇渲染。
async function renderNow(force = false) {
  if (!store.activeTab) {
    applyPreviewHtml('', false)
    renderedContent = ''
    previewPaused.value = false
    hugeRendered.value = 0
    hugeChunks.value = []
    return
  }
  // 编辑模式不渲染预览
  if (store.settings.viewMode === 'edit') return
  if (renderTimer) {
    clearTimeout(renderTimer)
    renderTimer = null
  }
  const mySeq = ++renderSeq
  isRendering.value = true
  try {
    if (fileTier.value === 'huge') {
      // P3：超大文件始终先渲染首屏块（有预览、不卡死），其余按需加载；force 不再触发整篇解析
      previewPaused.value = false
      hugeAutoLoading.value = false
      await renderHugeChunked(mySeq)
    } else {
      previewPaused.value = false
      hugeRendered.value = 0
      hugeChunks.value = []
      const html = await parseMarkdown(store.content, {
        filePath: store.activeTab?.filePath,
        projectRoot: store.projectRoot
      })
      if (mySeq !== renderSeq) return
      imageObserver?.disconnect(); imageObserver = null
      applyPreviewHtml(html, false)
      renderedContent = store.content
      await nextTick()
      if (mySeq !== renderSeq) return
      setupMermaidLazy(); rebuildOverlays(); applySearchHighlights(); setupLazyImages(); restorePreviewScroll()
      // P4：缓存整篇 HTML，切回该标签时瞬时还原
      cachePreview(store.activeTabId, previewContent.value ? previewContent.value.innerHTML : '')
    }
  } finally {
    if (mySeq === renderSeq) isRendering.value = false
  }
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
  // 标记待恢复：渲染完成后把预览滚动恢复到该标签上次的位置
  pendingRestoreTabId = store.activeTabId
  recomputeTier()
  // P4：stale-while-revalidate——命中缓存则瞬时还原上次预览（消除切标签白屏），
  // 再后台 renderNow 异步刷新（吸纳外部/草稿变更）。无缓存则直接渲染。
  const cached = previewCache.get(store.activeTabId)
  if (cached != null && store.settings.viewMode !== 'edit') {
    imageObserver?.disconnect(); imageObserver = null
    applyPreviewHtml(cached, false)
    previewPaused.value = false
    hugeRendered.value = 0
    hugeChunks.value = []
    nextTick(() => { rebuildOverlays(); applySearchHighlights(); setupLazyImages(); restorePreviewScroll() })
  }
  renderNow(true)
})

// 视图模式切换：回到非编辑模式时补一次渲染（编辑模式期间跳过了渲染）
watch(() => store.settings.viewMode, () => {
  if (store.settings.viewMode !== 'edit') renderNow(true)
})

// 字体/行高变化会改变预览布局，锚点需要重建
watch(() => [store.settings.previewFontSize, store.settings.previewFontFamily, store.settings.lineHeight], () => {
  nextTick(rebuildOverlays)
})

// 预览行号开关：即时重建/清除行号层
watch(() => store.settings.showPreviewLineNumbers, () => {
  nextTick(buildLineGutter)
})

// 视图模式 / 预览区尺寸变化（窗口 resize、侧栏拖动、切到双栏）都会让文字重新折行，锚点必须重建
watch(() => store.settings.viewMode, () => nextTick(rebuildOverlays))

let resizeObserver = null
function onPreviewKeydown(e) {
  // Ctrl+Shift+R：手动刷新预览（超大文件下强制渲染一次）
  if (e.ctrlKey && e.shiftKey && (e.key === 'R' || e.key === 'r')) {
    e.preventDefault()
    refreshPreview(true)
  }
}
onMounted(() => {
  resizeObserver = new ResizeObserver(() => rebuildOverlays())
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
  if (imageObserver) {
    imageObserver.disconnect()
    imageObserver = null
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
  // 普通滚动联动：目标行对齐视口顶部（两栏逐行对应）。
  // 搜索结果跳转（center）：把命中行放到视口偏上 1/3 处，留出上下安全边距，
  // 避免高亮紧贴顶部工具栏/快捷图标区域或底部状态栏而被裁切。
  const centerOffset = val.center ? Math.max(0, el.clientHeight * 0.34) : 0
  el.scrollTop = Math.max(0, y + cache.pad - centerOffset)
})

watch(() => store.activeTabId, () => {
  nextTick(() => {
    rebuildOverlays()
  })
})

function onPreviewScroll() {
  if (restoringPreview) return
  if (scrollRafPending) return
  scrollRafPending = true
  requestAnimationFrame(() => {
    scrollRafPending = false
    const el = previewScroll.value
    if (!el) return
    // P0：持续记录当前标签滚动位置，切回时恢复
    previewScrollMap.set(store.activeTabId, el.scrollTop)
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
    // P3：超大文件滚动接近底部时自动加载下一块（无需手动点按钮，阅读体验连续）
    if (fileTier.value === 'huge' && hugeHasMore.value) {
      if (el.scrollTop >= el.scrollHeight - el.clientHeight - 160) {
        loadNextChunk()
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

  // 文本类文件：复用统一打开入口（含大文件守卫 / 只读标记 / 最近记录）
  const editableExts = ['md', 'markdown', 'mdown', 'mdx', 'json', 'js', 'ts', 'jsx', 'tsx',
    'css', 'scss', 'less', 'html', 'htm', 'xml', 'yaml', 'yml', 'toml', 'ini', 'txt', 'csv',
    'py', 'java', 'c', 'cpp', 'h', 'go', 'rs', 'rb', 'php', 'sh', 'bash', 'sql', 'lua', 'kt', 'dart']
  if (editableExts.includes(ext)) {
    // 预览区点击链接属于二级打开，跳过确认弹窗直接打开
    await openFile(filePath, { showConfirm: false })
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
.preview-banner-warn {
  background: #e67e22;
}
.preview-banner-warn:hover { background: #e67e22; }
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
  position: relative;
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
/* P3 懒加载图片占位：未进入视口前不加载 src，给一个轻量背景提示，
   加载后由 IntersectionObserver 还原 src 并移除占位样式。 */
.markdown-body img.lazy-img {
  background: var(--hover-bg, #f0f0f0);
  min-height: 12px;
  border-radius: 4px;
}
.markdown-body.word-wrap-enabled .mermaid svg {
  max-width: 100% !important;
  height: auto !important;
}

/* ── 下标、上标、高亮 ── */
.markdown-body sub { font-size: 0.75em; vertical-align: sub; }
.markdown-body sup { font-size: 0.75em; vertical-align: super; }

/* ── 预览区源码行号 gutter ── */
/* 启用行号时给正文让出左侧空间（行号层 sticky 钉在左侧，不参与布局） */
.markdown-body.has-line-gutter {
  padding-left: 56px;
}
/* 行号层：脱离文档流（absolute），锚定到 .markdown-body 的左上角（padding 区内），
   因此数字落在文字左侧的留白区，不再与正文重叠；垂直随内容滚动，水平随内容滚动
   （与各自行保持对齐）。 */
.preview-line-gutter {
  position: absolute;
  top: 0;
  left: 0;
  width: 0;
  height: 0;
  pointer-events: none;
  z-index: 5;
}
.preview-line-gutter .plg-num {
  position: absolute;
  left: 6px;
  width: 38px;
  text-align: right;
  font-family: var(--editor-font-family, monospace);
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-muted);
  user-select: none;
  white-space: nowrap;
}
/* 文档自带标注高亮（==文本==，markdown-it-mark 渲染为 <mark>）。
   仅做柔和荧光底色、不加描边，以与搜索高亮区分。 */
.markdown-body mark:not(.search-hit) {
  background: #fff3b0;
  padding: 0 2px;
  border-radius: 2px;
}

/* ── 搜索词高亮 ──
   加醒目的描边环，与文档手动高亮（纯黄底、无环）明显区分，
   避免误以为非搜索内容被命中。 */
.markdown-body mark.search-hit {
  background: #ffe066;
  color: inherit;
  padding: 0 1px;
  border-radius: 2px;
  box-shadow: 0 0 0 2px #f08c00;
}
html[data-theme='dark'] .markdown-body mark.search-hit {
  background: #a07c00;
  color: #fff;
  box-shadow: 0 0 0 2px #ffd43b;
}
/* 非预览区（如左侧搜索结果列表里的命中片段）也复用同一套搜索高亮样式 */
mark.search-hit {
  background: #ffe066;
  color: inherit;
  padding: 0 1px;
  border-radius: 2px;
  box-shadow: 0 0 0 2px #f08c00;
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
