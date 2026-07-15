<template>
  <div class="editor-pane" ref="editorContainer" v-show="store.tabs.length > 0">
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
    />
  </div>
</template>

<script setup>
import { ref, computed, shallowRef, onMounted, onUnmounted } from 'vue'
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

const onEditorReady = (payload) => {
  const v = payload.view
  editorView.value = v
  window.editorRef = v
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

  if (store.settings.wordWrap) {
    exts.push(EditorView.lineWrapping)
  }

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
</style>
<style>
.editor-pane .cm-scroller::-webkit-scrollbar-thumb {
  min-width: var(--editor-scroll-min-width, 40px);
}
</style>
