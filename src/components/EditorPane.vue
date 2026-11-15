<template>
  <div class="editor-pane" :class="{ 'word-wrap': store.settings.wordWrap }" ref="editorContainer" v-show="store.tabs.length > 0"
    @drop="onDrop" @dragover.prevent @dragenter.prevent
    @contextmenu.prevent="onEditorContextMenu">
    <Codemirror
      v-if="store.activeTab"
      :model-value="store.content"
      @update:model-value="onContentChange"
      :extensions="extensions"
      :style="{ height: '100%', fontSize: store.settings.editorFontSize + 'px' }"
      :autofocus="true"
      :disabled="!!store.activeTab?.truncated"
      :indent-with-tab="true"
      :tab-size="store.settings.tabSize"
      @ready="onEditorReady"
      @update="onEditorUpdate"
    />
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
import { ref, computed, shallowRef, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { Codemirror } from 'vue-codemirror'
import { useEditorStore } from '@/stores/editorStore'
import { lockScrollSync, isScrollSyncLocked } from '@/core/scrollMapper'
import { EditorView, keymap } from '@codemirror/view'
import { EditorState, Compartment, Prec, EditorSelection } from '@codemirror/state'
import { search } from '@codemirror/search'
import { focusModeField, typewriterScroll } from '@/core/editor/focusTypewriter'
import { indentWithTab, undo, redo } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { oneDark } from '@codemirror/theme-one-dark'
import { toggleWrap, insertLink, insertCodeBlock, setHeading, smartEnter, smartTab, smartShiftTab } from '@/core/markdown/editing'
import { formatTableAtCursor } from '@/core/markdown/tableFormat'
import ContextMenu from './ContextMenu.vue'
import { useSelectionMenu } from '@/composables/useSelectionMenu'

const store = useEditorStore()
const editorContainer = ref(null)
const editorView = shallowRef(null)

// ── P0：多文件状态保留 ──
// 每个标签独立保存完整 EditorState（含 undo 历史 / 光标 / 选区）与滚动位置，
// 切标签时通过 view.setState 恢复，避免整篇重设 doc 导致 undo/光标/滚动丢失。
const editorStates = new Map()
const editorScroll = new Map()
// 切标签过程中抑制 onContentChange（防误标脏）与 onEditorScroll（防误触发滚动联动）
let switchingRef = false

// ── P4：EditorState LRU 上限（默认 8），把多文件内存钉在可控范围 ──
// 超出上限淘汰最久未访问标签的 EditorState（undo 历史 / 光标 / 滚动），但 tab.content 仍在 store，
// 该标签再度切回时由 getOrCreateState 从 content 重建 state（代价：光标归零、undo 清空，属 LRU 权衡）。
// 当前激活标签永不淘汰，避免切回即失效。
const EDITOR_STATE_LIMIT = 8
const lruOrder = []
function touchEditorState(id) {
  if (!id) return
  const i = lruOrder.indexOf(id)
  if (i !== -1) lruOrder.splice(i, 1)
  lruOrder.push(id)
  while (lruOrder.length > EDITOR_STATE_LIMIT) {
    const victim = lruOrder.shift()
    if (victim === store.activeTabId) { lruOrder.push(victim); continue }
    editorStates.delete(victim)
    editorScroll.delete(victim)
  }
}

// ── 选中文本右键菜单 ──
const { menuVisible, menuX, menuY, items, open: openMenu, close, onSelect } = useSelectionMenu(store)

function onEditorContextMenu(e) {
  const v = editorView.value
  if (!v) return
  const sel = v.state.selection.main
  const text = sel.empty ? '' : v.state.sliceDoc(sel.from, sel.to)
  openMenu(e, text)
}

const onEditorReady = (payload) => {
  const v = payload.view
  editorView.value = v
  window.editorRef = v
  window.editorStore = store
  window.editorUndo = () => { undo(v); v.focus() }
  window.editorRedo = () => { redo(v); v.focus() }
  updateCursorPos(v)
  // P0：初始标签的 EditorState 直接捕获（basicSetup + 全部扩展已随 vue-codemirror 注入）。
  // 后续切标签通过 editorStates 中保存的 state 调用 view.setState 恢复，避免整篇重设 doc 丢失
  // undo 历史 / 光标 / 选区 / 滚动。
  if (store.activeTabId) {
    editorStates.set(store.activeTabId, v.state)
    editorScroll.set(store.activeTabId, 0)
    touchEditorState(store.activeTabId)
  }
  // P1：初始标签若为大文件，关闭高亮/换行/专注，避免巨量 tokenize 卡顿
  applyLargeFileMode(v, store.activeTab?.isLargeFile)
  // 源码行映射滚动同步：监听编辑器滚动
  v.scrollDOM.addEventListener('scroll', onEditorScroll, { passive: true })
}

const onEditorUpdate = (payload) => {
  updateCursorPos(payload.view)
}

// ── 源码行映射滚动同步 ──
let editorScrollRaf = false

function onEditorScroll() {
  if (switchingRef) return
  if (editorScrollRaf) return
  editorScrollRaf = true
  requestAnimationFrame(() => {
    editorScrollRaf = false
    const v = editorView.value
    if (!v || store.settings.viewMode === 'preview') return
    const info = viewportLineInfo(v)
    if (!info) return
    // TOC 当前章节
    const h = lastHeadingLine(v, Math.floor(info.line))
    if (h) store.currentTocLine = h
    if (!store.settings.scrollSync || isScrollSyncLocked('editor')) return
    const el = v.scrollDOM
    store.scrollSyncSource = {
      source: 'editor',
      line: info.line,
      atBottom: el.scrollTop >= el.scrollHeight - el.clientHeight - 2
    }
  })
}

// 视口顶部对应的源码位置：1 基浮点行号（整数部分为行号，小数部分为行内比例），
// 同时给出该行块在视口中的实际 y，供反向滚动精确换算。
function viewportLineInfo(v) {
  const scRect = v.scrollDOM.getBoundingClientRect()
  const cdLeft = v.contentDOM.getBoundingClientRect().left + 8
  let pos = null
  try {
    pos = v.posAtCoords({ x: cdLeft, y: scRect.top + 1 }, false)
  } catch { return null }
  if (pos == null) return null
  const info = v.state.doc.lineAt(pos)
  const block = v.lineBlockAt(info.from)
  const h = Math.max(1, block.bottom - block.top)
  const coords = v.coordsAtPos(info.from)
  const y0 = coords ? coords.top - scRect.top : 0
  const frac = coords ? Math.min(1, Math.max(0, -y0 / h)) : 0
  return { line: info.number + frac, blockTop: block.top, blockHeight: h, viewportY: y0 }
}

// 从 fromLine 向上找到最近一个标题行
function lastHeadingLine(v, fromLine) {
  const doc = v.state.doc
  const start = Math.min(fromLine, doc.lines)
  for (let n = start; n >= 1; n--) {
    if (/^#{1,6}\s+\S/.test(doc.line(n).text)) return n
  }
  return 0
}

// 将编辑器滚动到指定源码位置（1 基浮点行号），使该行（含行内比例）对齐视口顶部
function scrollEditorToLine(v, line, atBottom) {
  const el = v.scrollDOM
  lockScrollSync('editor')
  if (atBottom) {
    el.scrollTop = el.scrollHeight - el.clientHeight
    return
  }
  const info = viewportLineInfo(v)
  if (!info) return
  const doc = v.state.doc
  const clamped = Math.max(1, Math.min(doc.lines, line))
  const n = Math.floor(clamped)
  const frac = Math.min(0.999, Math.max(0, clamped - n))
  const block = v.lineBlockAt(doc.line(n).from)
  const h = block.bottom - block.top
  // 目标文档坐标在视口中的位置 = 已知行的视口位置 + 文档坐标差 → 换算成 scrollTop
  const targetViewportY = info.viewportY + (block.top + h * frac - info.blockTop)
  el.scrollTop = Math.max(0, el.scrollTop + targetViewportY)
}

watch(() => store.scrollSyncSource, (val) => {
  if (!val || val.source === 'editor' || !store.settings.scrollSync) return
  const v = editorView.value
  if (!v || store.settings.viewMode === 'preview') return
  scrollEditorToLine(v, val.line, val.atBottom)
})

// ── P0：多文件状态保留（切标签瞬时恢复 undo/光标/选区/滚动）──
function getOrCreateState(tab, view) {
  let st = editorStates.get(tab.id)
  if (st) return st
  // 从当前 view 的 extensions 派生（保留 basicSetup + 全部扩展），仅替换 doc 与初始光标
  st = view.state.update({
    doc: tab.content,
    selection: EditorSelection.cursor(0)
  })
  editorStates.set(tab.id, st)
  editorScroll.set(tab.id, 0)
  touchEditorState(tab.id)
  return st
}

function switchToTab(newTabId, oldTabId) {
  const v = editorView.value
  if (!v || !newTabId) return
  const newTab = store.tabs.find(t => t.id === newTabId)
  if (!newTab) return

  switchingRef = true
  try {
    // 1. 保存切出标签的 state + 滚动
    if (oldTabId && oldTabId !== newTabId) {
      editorStates.set(oldTabId, v.state)
      editorScroll.set(oldTabId, v.scrollDOM.scrollTop)
      touchEditorState(oldTabId)
    }
    // 2. 恢复切入标签的 state（含 undo 历史 / 光标 / 选区）
    const incoming = getOrCreateState(newTab, v)
    if (v.state !== incoming) v.setState(incoming)
    // P1：按当前标签是否大文件，切换高亮/换行/专注（大文件关，避免 tokenize 卡顿）
    applyLargeFileMode(v, newTab.isLargeFile)
    // 3. 刷新状态栏光标/选区信息
    updateCursorPos(v)
    // 保存切换后的最新 state（含大文件降级配置）
    editorStates.set(newTab.id, v.state)
    touchEditorState(newTab.id)
  } finally {
    switchingRef = false
  }
  // 4. 恢复滚动 + 聚焦（双 rAF 击败 focus 自动滚动光标入视口，确保滚动位置原样恢复）
  const top = editorScroll.get(newTabId) || 0
  requestAnimationFrame(() => {
    const vv = editorView.value
    if (!vv) return
    vv.scrollDOM.scrollTop = top
    vv.focus()
    vv.requestMeasure()
    requestAnimationFrame(() => {
      if (editorView.value === vv) vv.scrollDOM.scrollTop = top
    })
  })
}

// ── P1：大文件模式 ──
// 大文件下关闭语法高亮 / 自动换行 / 专注 decoration（basicSetup 的折叠保持开启，因其为惰性按需计算，
// 对巨文档几乎零开销），避免巨量 tokenize / O(N) decoration 造成打开与编辑卡顿。
function applyLargeFileMode(v, isLarge) {
  if (!v) return
  const large = !!isLarge
  v.dispatch({
    effects: [
      languageCompartment.reconfigure(large ? [] : markdownExt),
      wordWrapCompartment.reconfigure((!large && store.settings.wordWrap) ? EditorView.lineWrapping : []),
      focusCompartment.reconfigure((!large && store.settings.focusMode) ? focusModeField : [])
    ]
  })
}

// activeTabId 变化即切换：用 flush:'sync' 保证在 vue-codemirror 的 modelValue 监听器之前保存旧 state，
// 避免其整篇重设 doc 导致旧标签历史/光标/滚动丢失。
watch(() => store.activeTabId, (newId, oldId) => {
  if (!editorView.value) return
  switchToTab(newId, oldId)
}, { flush: 'sync' })

// 标签关闭后清理对应 state/滚动缓存，释放内存（同步清理 LRU 顺序记录）
watch(() => store.tabs.map(t => t.id), (ids) => {
  const set = new Set(ids)
  for (const id of [...editorStates.keys()]) {
    if (!set.has(id)) {
      editorStates.delete(id)
      editorScroll.delete(id)
      const i = lruOrder.indexOf(id)
      if (i !== -1) lruOrder.splice(i, 1)
    }
  }
})

function updateCursorPos(view) {
  if (!view) return
  const pos = view.state.selection.main.head
  const line = view.state.doc.lineAt(pos)
  store.cursorLine = line.number
  store.cursorCol = pos - line.from + 1
  // 选中文本（状态栏选中统计用）
  const sel = view.state.selection.main
  store.selectionText = sel.empty ? '' : view.state.sliceDoc(sel.from, sel.to)
}

// ── 拖拽图片插入 ──
const IMAGE_EXT_RE = /\.(png|jpe?g|gif|bmp|webp|svg|ico|avif)$/i

// 计算图片相对路径（ basePath 为空时返回原路径的 URL 形式）
function computeRelPath(basePath, filePath) {
  let imgPath = filePath.replace(/\\/g, '/')
  if (basePath) {
    const norm = (p) => p.replace(/\\/g, '/').replace(/\/+$/, '')
    const baseParts = norm(basePath).split('/')
    const targetParts = norm(filePath).split('/')
    let i = 0
    while (i < baseParts.length && i < targetParts.length &&
      baseParts[i].toLowerCase() === targetParts[i].toLowerCase()) i++
    const up = baseParts.length - i
    const rest = targetParts.slice(i)
    const parts = []
    for (let j = 0; j < up; j++) parts.push('..')
    parts.push(...rest)
    imgPath = parts.join('/')
  }
  return imgPath
}

// 图片保存目录：当前文件所在目录（fallback 项目根）
function getAssetBasePath() {
  return store.activeTab?.filePath
    ? store.activeTab.filePath.replace(/[\\/][^\\/]+$/, '')
    : store.projectRoot || ''
}

function insertImageMarkdown(view, alt, imgPath) {
  const md = `![${alt}](${imgPath})\n`
  const pos = view.state.selection.main.head
  view.dispatch({
    changes: { from: pos, insert: md },
    selection: { anchor: pos + md.length }
  })
  view.focus()
}

function onDrop(e) {
  const files = e.dataTransfer?.files
  if (!files || files.length === 0) return
  e.preventDefault()

  const v = editorView.value || window.editorRef
  if (!v) return

  const basePath = getAssetBasePath()

  for (const file of files) {
    // Electron 32+ 移除 File.path，统一走 preload 的 webUtils
    const filePath = file.path || window.api?.getPathForFile?.(file) || ''
    if (!filePath) continue
    if (!IMAGE_EXT_RE.test(filePath)) continue

    const fileName = filePath.split(/[\\/]/).pop().replace(/\.[^.]+$/, '')
    const imgPath = computeRelPath(basePath, filePath)
    const pos = v.state.selection.main.head
    v.dispatch({
      changes: { from: pos, insert: `![${fileName}](${imgPath})\n` },
      selection: { anchor: pos + 2, head: pos + 2 + fileName.length }
    })
  }
  v.focus()
}

// ── 剪贴板图片粘贴 ──
// 场景 1：剪贴板携带图片文件（从资源管理器/其他应用复制）→ 复制到 assets 并插入引用
// 场景 2：剪贴板无文本（Win+Shift+S 截图、右键复制图片）→ 主进程读系统剪贴板存 PNG
// 场景 3：纯文本/富文本粘贴 → 放行默认行为
async function copyAndInsertImageFile(view, filePath) {
  const basePath = getAssetBasePath()
  if (basePath) {
    const result = await window.api?.copyImageFile(filePath, basePath, store.settings.assetFolder)
    if (result?.success) {
      const alt = filePath.split(/[\\/]/).pop().replace(/\.[^.]+$/, '')
      insertImageMarkdown(view, alt, result.relativePath)
      return
    }
  }
  // 无可用保存目录（未保存文件且未打开文件夹）：退化为直接引用原文件路径
  insertImageMarkdown(view,
    filePath.split(/[\\/]/).pop().replace(/\.[^.]+$/, ''),
    computeRelPath(basePath, filePath))
}

async function saveAndInsertClipboardImage(view) {
  const basePath = getAssetBasePath()
  if (!basePath) return
  const result = await window.api?.saveClipboardImage(basePath, store.settings.assetFolder)
  if (result?.success) {
    insertImageMarkdown(view, 'image', result.relativePath)
  }
}

function handlePaste(event, view) {
  const cd = event.clipboardData
  if (!cd) return false
  const types = Array.from(cd.types || [])
  const files = Array.from(cd.files || [])
  const imageFile = files.find(f =>
    (f.type && f.type.startsWith('image/')) || IMAGE_EXT_RE.test(f.name || '')
  )
  const hasText = types.includes('text/plain') || types.includes('text/html')

  // 图片文件（Electron 会带磁盘 path）：复制进 assets 后插入相对路径
  if (imageFile && imageFile.path) {
    event.preventDefault()
    copyAndInsertImageFile(view, imageFile.path)
    return true
  }
  // 无任何文本内容：截图/纯图片场景，交给主进程读取系统剪贴板
  if (!hasText) {
    event.preventDefault()
    saveAndInsertClipboardImage(view)
    return true
  }
  // 智能粘贴链接（Typora 行为）：有选中文本时粘贴裸 URL，自动包成 [选中](url)
  const sel = view.state.selection.main
  if (!sel.empty && types.includes('text/plain')) {
    const pasted = (cd.getData('text/plain') || '').trim()
    if (/^(https?:\/\/|www\.)\S+$/i.test(pasted)) {
      event.preventDefault()
      const selText = view.state.sliceDoc(sel.from, sel.to)
      const url = /^https?:\/\//i.test(pasted) ? pasted : 'https://' + pasted
      view.dispatch({
        changes: { from: sel.from, to: sel.to, insert: `[${selText}](${url})` },
        selection: { anchor: sel.from + selText.length + 4 + url.length }
      })
      view.focus()
      return true
    }
  }
  return false
}

const onContentChange = (val) => {
  if (switchingRef) return
  store.content = val
  // P0：持续把当前标签的最新 state 缓存（覆盖外部 setDoc 等场景，如历史快照恢复），
  // 保证切回时恢复到最新内容（含 undo 历史 / 光标 / 选区）。
  if (editorView.value && store.activeTabId) {
    editorStates.set(store.activeTabId, editorView.value.state)
    touchEditorState(store.activeTabId)
  }
}

const isDark = computed(() => {
  if (store.settings.theme === 'dark') return true
  if (store.settings.theme === 'light') return false
  return document.documentElement.getAttribute('data-theme') === 'dark'
})

// 注意：vue-codemirror 默认已注入 basicSetup（行号/历史/默认键位/括号匹配/激活行/自动补全等），
// 这里只补充 basicSetup 之外的扩展，避免重复注册（否则会出现双行号栏等异常）。
// 语言（Markdown 高亮）：大文件模式下 reconfigure 为 [] 关闭高亮，避免巨量 tokenize 卡顿。
// 必须先于 baseExtensions 声明：数组字面量在 setup 求值时即调用 .of()，
// 若声明在后则命中 TDZ（Cannot access 'languageCompartment' before initialization），
// 整个 EditorPane setup 抛错 → 应用挂载失败、按钮无响应。
const languageCompartment = new Compartment()
const markdownExt = markdown({ base: markdownLanguage })
const baseExtensions = [
  // Markdown 语法高亮（basicSetup 不含语言）；大文件模式下由 languageCompartment 关闭
  languageCompartment.of(markdownExt),
  // 搜索高亮扩展：setSearchQuery 即可高亮全文件匹配（不依赖搜索面板是否打开）
  search(),
  // 通用 Tab 缩进：必须包成 keymap.of([...]) 才是合法扩展；
  // 裸放 keybinding 对象会被 CodeMirror 在解析扩展时抛 "Unrecognized extension value"，
  // 进而连累整个 :extensions 数组失效（markdown 高亮/自定义键位/主题等全部不生效）。
  keymap.of([indentWithTab]),
  // 自定义键位：仅补充 basicSetup 没有的（Ctrl-m / Ctrl-Shift-m 公式块）
  keymap.of([
    {
      key: 'Ctrl-m',
      run: (view) => {
        const sel = view.state.selection.main
        const text = view.state.sliceDoc(sel.from, sel.to)
        if (text) {
          view.dispatch({
            changes: [
              { from: sel.from, insert: '$' },
              { from: sel.to, insert: '$' }
            ],
            selection: { anchor: sel.from + 1, head: sel.to + 1 }
          })
        } else {
          view.dispatch({
            changes: { from: sel.from, insert: '$$' },
            selection: { anchor: sel.from + 1 }
          })
        }
        view.focus()
        return true
      }
    },
    {
      key: 'Ctrl-Shift-m',
      run: (view) => {
        const sel = view.state.selection.main
        const text = view.state.sliceDoc(sel.from, sel.to)
        if (text) {
          view.dispatch({ changes: { from: sel.from, to: sel.to, insert: '$$\n' + text + '\n$$' } })
        } else {
          view.dispatch({
            changes: { from: sel.from, insert: '$$\n\n$$' },
            selection: { anchor: sel.from + 4 }
          })
        }
        view.focus()
        return true
      }
    }
  ])
]

// 自动换行 / 专注 / 打字机 通过 compartment 控制，初始配置在此声明；切换时 reconfigure，不重建编辑器。
// 注意：vue-codemirror 会在 basicSetup 之后 appendConfig 注入下方 extensions（等价于原 onEditorReady 里的 appendConfig）。
const wordWrapCompartment = new Compartment()
const focusCompartment = new Compartment()
const typewriterCompartment = new Compartment()

// P0：完整扩展列表（basicSetup 由 vue-codemirror 默认注入，此处为额外扩展）。
// 所有标签共享同一套扩展；切标签时通过 view.setState 恢复各标签独立 state（含 undo 历史 / 光标 / 选区 / 滚动）。
const extensions = [
  ...baseExtensions,
  wordWrapCompartment.of(store.settings.wordWrap ? EditorView.lineWrapping : []),
  focusCompartment.of(store.settings.focusMode ? focusModeField : []),
  typewriterCompartment.of(store.settings.typewriterMode ? typewriterScroll : []),
  // Typora 式 Markdown 键位（最高优先级，先于 basicSetup 的默认键位）
  Prec.highest(keymap.of([
    { key: 'Mod-b', run: (view) => toggleWrap(view, '**') },
    { key: 'Mod-i', run: (view) => toggleWrap(view, '*') },
    { key: 'Mod-Shift-`', run: (view) => toggleWrap(view, '`') },
    { key: 'Alt-Shift-5', run: (view) => toggleWrap(view, '~~') },
    { key: 'Mod-k', run: insertLink },
    { key: 'Mod-Shift-K', run: insertCodeBlock },
    { key: 'Shift-Alt-f', run: formatTableAtCursor },
    { key: 'Mod-1', run: (view) => setHeading(view, 1) },
    { key: 'Mod-2', run: (view) => setHeading(view, 2) },
    { key: 'Mod-3', run: (view) => setHeading(view, 3) },
    { key: 'Mod-4', run: (view) => setHeading(view, 4) },
    { key: 'Mod-5', run: (view) => setHeading(view, 5) },
    { key: 'Mod-6', run: (view) => setHeading(view, 6) },
    { key: 'Mod-0', run: (view) => setHeading(view, 0) },
    { key: 'Enter', run: smartEnter },
    { key: 'Shift-Enter', run: (view) => { view.dispatch(view.state.replaceSelection('\n')); return true } },
    { key: 'Tab', run: smartTab },
    { key: 'Shift-Tab', run: smartShiftTab }
  ])),
  // 剪贴板图片粘贴（截图 → assets 目录 → 插入相对路径引用）
  EditorView.domEventHandlers({ paste: handlePaste }),
  EditorView.theme({
    '&': { backgroundColor: 'var(--bg-editor)' },
    '.cm-scroller': { fontFamily: 'var(--editor-font-family)' },
    '.cm-gutters': { backgroundColor: 'var(--bg-gutter)', borderColor: 'var(--border-color)' },
    '.cm-activeLineGutter': { backgroundColor: 'var(--active-line-bg)' },
    '.cm-activeLine': { backgroundColor: 'var(--active-line-bg)' },
    '.cm-selectionBackground': { backgroundColor: 'var(--selection-bg) !important' },
    '&.cm-focused .cm-selectionBackground': { backgroundColor: 'var(--selection-bg) !important' },
    '.cm-cursor': { borderLeftColor: 'var(--text-primary)' },
    '.cm-foldPlaceholder': { backgroundColor: 'var(--hover-bg)', color: 'var(--text-muted)' }
  })
]

// 切换自动换行：通过 compartment.reconfigure 即时切换，不重建编辑器
watch(() => store.settings.wordWrap, (val) => {
  const v = editorView.value
  if (!v) return
  // P1：大文件模式下强制关闭换行（降级），不被全局设置覆盖
  if (store.activeTab?.isLargeFile) return
  v.dispatch({
    effects: wordWrapCompartment.reconfigure(val ? EditorView.lineWrapping : [])
  })
})

// 专注模式开关
watch(() => store.settings.focusMode, (val) => {
  const v = editorView.value
  if (!v) return
  // P1：大文件模式下强制关闭专注 decoration（降级）
  if (store.activeTab?.isLargeFile) return
  v.dispatch({
    effects: focusCompartment.reconfigure(val ? focusModeField : [])
  })
})

// 打字机模式开关
watch(() => store.settings.typewriterMode, (val) => {
  const v = editorView.value
  if (!v) return
  v.dispatch({
    effects: typewriterCompartment.reconfigure(val ? typewriterScroll : [])
  })
})

let resizeObserver = null
onMounted(() => {
  if (editorContainer.value) {
    const setMinWidth = () => {
      const w = editorContainer.value.clientWidth
      editorContainer.value.style.setProperty('--editor-scroll-min-width', Math.round(w / 3) + 'px')
    }
    setMinWidth()
    resizeObserver = new ResizeObserver(setMinWidth)
    resizeObserver.observe(editorContainer.value)
  }
})
onUnmounted(() => {
  if (resizeObserver) resizeObserver.disconnect()
  try {
    editorView.value?.scrollDOM?.removeEventListener('scroll', onEditorScroll)
  } catch {}
})
</script>

<style scoped>
.editor-pane {
  flex: 1;
  height: 100%;
  overflow: hidden;
  background: var(--bg-editor);
}
</style>
<style>
/* 专注模式：非当前段落淡化（全局样式，作用于 CM6 Decoration 注入的行） */
.cm-focus-dim {
  opacity: 0.35;
  transition: opacity 0.2s ease;
}
.editor-pane .cm-scroller::-webkit-scrollbar-thumb {
  min-width: var(--editor-scroll-min-width, 40px);
}
/* 行号栏配色：CM 基础主题的 &light 规则（#f5f5f5 / #e2f2ff）特异性高于主题里的单类选择器，
   这里用三级选择器压过它，保证深色模式下行号栏不再发白 */
.editor-pane .cm-editor .cm-gutters {
  background-color: var(--bg-gutter);
  color: var(--text-muted);
  border-right-color: var(--border-color);
}
.editor-pane .cm-editor .cm-activeLineGutter {
  background-color: var(--active-line-bg);
  color: var(--text-secondary);
}
/* 自动换行 CSS 兜底：即使 lineWrapping extension 因 vue-codemirror 机制未注入成功，
   也通过 CSS 强制 .cm-content 换行，消除水平滚动条。
   与 EditorView.lineWrapping 的内部 CSS (.cm-lineWrapping) 规则一致，无冲突。 */
.editor-pane.word-wrap .cm-content {
  white-space: pre-wrap !important;
  word-break: break-word !important;
  overflow-wrap: anywhere !important;
}
</style>
