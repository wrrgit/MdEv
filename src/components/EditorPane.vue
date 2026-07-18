<template>
  <div class="editor-pane" :class="{ 'word-wrap': store.settings.wordWrap }" ref="editorContainer" v-show="store.tabs.length > 0">
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
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightSpecialChars, drawSelection, rectangularSelection } from '@codemirror/view'
import { EditorState, Compartment, StateEffect } from '@codemirror/state'
import { defaultHighlightStyle, syntaxHighlighting, indentOnInput, bracketMatching, foldGutter, indentUnit } from '@codemirror/language'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { oneDark } from '@codemirror/theme-one-dark'

const store = useEditorStore()
const editorContainer = ref(null)
const editorView = shallowRef(null)
let isSyncing = false

const onEditorReady = (payload) => {
  const v = payload.view
  editorView.value = v
  window.editorRef = v
  window.editorStore = store
  updateCursorPos(v)
  // vue-codemirror 创建 EditorView 时使用默认 basicSetup，不会应用我们传入的 extensions，
  // 因此 wordWrapCompartment 必须在此通过 appendConfig 注册，并立即套用当前换行设置。
  // 之前的方案（compartment.of 放 baseExtensions / :key 重建）均因此机制而失效。
  v.dispatch({
    effects: StateEffect.appendConfig.of(
      wordWrapCompartment.of(store.settings.wordWrap ? EditorView.lineWrapping : [])
    )
  })
  // 诊断：检查 lineWrapping 是否真正生效
  setTimeout(() => {
    try {
      const ed = document.querySelector('.cm-editor')
      const ct = document.querySelector('.cm-content')
      const sc = document.querySelector('.cm-scroller')
      window.__wwDebug = {
        wordWrapSetting: store.settings.wordWrap,
        editorClasses: ed ? ed.className : 'NOT_FOUND',
        contentClasses: ct ? ct.className : 'NOT_FOUND',
        contentWhiteSpace: ct ? getComputedStyle(ct).whiteSpace : 'n/a',
        contentOverflowWrap: ct ? getComputedStyle(ct).overflowWrap : 'n/a',
        scrollerOverflowX: sc ? getComputedStyle(sc).overflowX : 'n/a'
      }
      console.log('[WW-DEBUG]', JSON.stringify(window.__wwDebug))
    } catch (e) {
      window.__wwDebug = { error: String(e) }
    }
  }, 300)
}

const onEditorUpdate = (payload) => {
  const v = payload.view
  updateCursorPos(v)
  if (!isSyncing && store.settings.scrollSync) {
    const scroller = v.scrollDOM
    if (scroller) {
      const maxScroll = scroller.scrollHeight - scroller.clientHeight
      if (maxScroll > 0) {
        isSyncing = true
        store.scrollSyncSource = { source: 'editor', percent: scroller.scrollTop / maxScroll }
        nextTick(() => { isSyncing = false })
      }
    }
  }
}

watch(() => store.scrollSyncSource, (val) => {
  if (!val || val.source === 'editor' || !store.settings.scrollSync) return
  const v = editorView.value
  if (!v) return
  const scroller = v.scrollDOM
  if (!scroller) return
  const maxScroll = scroller.scrollHeight - scroller.clientHeight
  if (maxScroll <= 0) return
  isSyncing = true
  scroller.scrollTop = maxScroll * val.percent
  nextTick(() => { isSyncing = false })
})

function updateCursorPos(view) {
  if (!view) return
  const pos = view.state.selection.main.head
  const line = view.state.doc.lineAt(pos)
  store.cursorLine = line.number
  store.cursorCol = pos - line.from + 1
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
    ...closeBracketsKeymap
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
