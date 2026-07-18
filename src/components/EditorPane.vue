<template>
  <div class="editor-pane" :class="{ 'word-wrap': store.settings.wordWrap }" ref="editorContainer" v-show="store.tabs.length > 0">
    <Codemirror
      v-if="store.activeTab"
      :key="store.activeTabId"
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
import { EditorState } from '@codemirror/state'
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
  updateCursorPos(v)
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

const cmExtensions = computed(() => {
  const exts = [
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
    ]),
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

  return exts
})

const extensions = computed(() => cmExtensions.value)

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
.editor-pane.word-wrap .cm-editor {
  white-space: pre-wrap !important;
  word-break: break-word !important;
  overflow-wrap: break-word !important;
}
.editor-pane.word-wrap .cm-scroller {
  overflow-wrap: break-word !important;
  word-break: break-word !important;
}
.editor-pane.word-wrap .cm-content {
  white-space: pre-wrap !important;
  overflow-wrap: break-word !important;
  word-break: break-word !important;
}
</style>
<style>
.editor-pane .cm-scroller::-webkit-scrollbar-thumb {
  min-width: var(--editor-scroll-min-width, 40px);
}
</style>
