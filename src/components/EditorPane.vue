<template>
  <div class="editor-pane" :class="{ 'word-wrap': store.settings.wordWrap }" ref="editorContainer" v-show="store.tabs.length > 0"
    @drop="onDrop" @dragover.prevent @dragenter.prevent>
    <Codemirror
      v-if="store.activeTab"
      :model-value="store.content"
      @update:model-value="onContentChange"
      :extensions="extensions"
      :style="{ height: '100%', fontSize: store.settings.editorFontSize + 'px' }"
      :autofocus="true"
      :disabled="false"
      :indent-with-tab="true"
      :tab-size="store.settings.tabSize"
      @ready="onEditorReady"
      @update="onEditorUpdate"
    />
  </div>
</template>

<script setup>
import { ref, computed, shallowRef, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { Codemirror } from 'vue-codemirror'
import { useEditorStore } from '@/stores/editorStore'
import { lockScrollSync, isScrollSyncLocked } from '@/core/scrollMapper'
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightSpecialChars, drawSelection, rectangularSelection } from '@codemirror/view'
import { EditorState, Compartment, StateEffect, Prec } from '@codemirror/state'
import { defaultHighlightStyle, syntaxHighlighting, indentOnInput, bracketMatching, foldGutter, indentUnit } from '@codemirror/language'
import { defaultKeymap, history, historyKeymap, indentWithTab, undo, redo } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { oneDark } from '@codemirror/theme-one-dark'
import { toggleWrap, insertLink, insertCodeBlock, setHeading, smartEnter, smartTab, smartShiftTab } from '@/core/markdown/editing'

const store = useEditorStore()
const editorContainer = ref(null)
const editorView = shallowRef(null)

const onEditorReady = (payload) => {
  const v = payload.view
  editorView.value = v
  window.editorRef = v
  window.editorStore = store
  window.editorUndo = () => { undo(v); v.focus() }
  window.editorRedo = () => { redo(v); v.focus() }
  updateCursorPos(v)
  // vue-codemirror 创建 EditorView 时使用默认 basicSetup，不会应用我们传入的 extensions，
  // 因此 wordWrapCompartment 必须在此通过 appendConfig 注册，并立即套用当前换行设置。
  // 之前的方案（compartment.of 放 baseExtensions / :key 重建）均因此机制而失效。
  v.dispatch({
    effects: StateEffect.appendConfig.of([
      wordWrapCompartment.of(store.settings.wordWrap ? EditorView.lineWrapping : []),
      // Typora 式 Markdown 键位（最高优先级，先于 basicSetup 的默认键位）
      Prec.highest(keymap.of([
        { key: 'Mod-b', run: (view) => toggleWrap(view, '**') },
        { key: 'Mod-i', run: (view) => toggleWrap(view, '*') },
        { key: 'Mod-Shift-`', run: (view) => toggleWrap(view, '`') },
        { key: 'Alt-Shift-5', run: (view) => toggleWrap(view, '~~') },
        { key: 'Mod-k', run: insertLink },
        { key: 'Mod-Shift-K', run: insertCodeBlock },
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
      EditorView.domEventHandlers({ paste: handlePaste })
    ])
  })
  // 源码行映射滚动同步：监听编辑器滚动
  v.scrollDOM.addEventListener('scroll', onEditorScroll, { passive: true })
}

const onEditorUpdate = (payload) => {
  updateCursorPos(payload.view)
}

// ── 源码行映射滚动同步 ──
let editorScrollRaf = false

function onEditorScroll() {
  if (editorScrollRaf) return
  editorScrollRaf = true
  requestAnimationFrame(() => {
    editorScrollRaf = false
    const v = editorView.value
    if (!v || store.settings.viewMode === 'preview') return
    // 视口顶部对应的源码行号
    let topLine = 1
    try {
      const block = v.lineBlockAtHeight(v.scrollDOM.scrollTop + 4)
      topLine = v.state.doc.lineAt(block.from).number
    } catch { return }
    // TOC 当前章节
    const h = lastHeadingLine(v, topLine)
    if (h) store.currentTocLine = h
    if (!store.settings.scrollSync || isScrollSyncLocked()) return
    store.scrollSyncSource = { source: 'editor', line: topLine }
  })
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

watch(() => store.scrollSyncSource, (val) => {
  if (!val || val.source === 'editor' || !store.settings.scrollSync) return
  const v = editorView.value
  if (!v || store.settings.viewMode === 'preview') return
  const line = Math.max(1, Math.min(Math.round(val.line), v.state.doc.lines))
  const pos = v.state.doc.line(line).from
  const coords = v.coordsAtPos(pos)
  if (!coords) return
  const rect = v.scrollDOM.getBoundingClientRect()
  lockScrollSync()
  // 将目标行对齐到编辑器视口顶部
  v.scrollDOM.scrollTop = v.scrollDOM.scrollTop + (coords.top - rect.top)
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
    // Electron: File 对象有 path 属性，包含完整文件路径
    const filePath = file.path
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
    const result = await window.api?.copyImageFile(filePath, basePath)
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
  const result = await window.api?.saveClipboardImage(basePath)
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
  return false
}

const onContentChange = (val) => {
  store.content = val
}

const isDark = computed(() => {
  if (store.settings.theme === 'dark') return true
  if (store.settings.theme === 'light') return false
  return document.documentElement.getAttribute('data-theme') === 'dark'
})

const baseExtensions = [
  lineNumbers(),
  highlightActiveLineGutter(),
  highlightSpecialChars(),
  drawSelection(),
  rectangularSelection(),
  bracketMatching(),
  closeBrackets(),
  indentOnInput(),
  foldGutter(),
  highlightSelectionMatches(),
  syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
  markdown({ base: markdownLanguage }),
  history(),
  indentWithTab,
  keymap.of([
    ...defaultKeymap,
    ...historyKeymap,
    ...searchKeymap,
    ...closeBracketsKeymap,
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

// 自动换行通过 compartment 控制：onEditorReady 时 appendConfig 注册，
// 切换时 reconfigure，不重建编辑器（光标/历史/滚动保留）。
const wordWrapCompartment = new Compartment()

const cmExtensions = computed(() => {
  const exts = [...baseExtensions]

  exts.push(EditorView.theme({
    '&': { backgroundColor: 'var(--bg-editor)' },
    '.cm-scroller': { fontFamily: 'var(--editor-font-family)' },
    '.cm-gutters': { backgroundColor: 'var(--bg-gutter)', borderColor: 'var(--border-color)' },
    '.cm-activeLineGutter': { backgroundColor: 'var(--active-line-bg)' },
    '.cm-activeLine': { backgroundColor: 'var(--active-line-bg)' },
    '.cm-selectionBackground': { backgroundColor: 'var(--selection-bg) !important' },
    '&.cm-focused .cm-selectionBackground': { backgroundColor: 'var(--selection-bg) !important' },
    '.cm-cursor': { borderLeftColor: 'var(--text-primary)' },
    '.cm-foldPlaceholder': { backgroundColor: 'var(--hover-bg)', color: 'var(--text-muted)' }
  }))

  return exts
})

const extensions = computed(() => cmExtensions.value)

// 切换自动换行：通过 compartment.reconfigure 即时切换，不重建编辑器
watch(() => store.settings.wordWrap, (val) => {
  const v = editorView.value
  if (!v) return
  v.dispatch({
    effects: wordWrapCompartment.reconfigure(val ? EditorView.lineWrapping : [])
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
.editor-pane .cm-scroller::-webkit-scrollbar-thumb {
  min-width: var(--editor-scroll-min-width, 40px);
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
