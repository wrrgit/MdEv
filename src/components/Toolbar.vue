<template>
  <div class="toolbar" v-if="store.tabs.length > 0">
    <div
      v-for="(group, gIdx) in toolbarConfig"
      :key="gIdx"
      class="toolbar-group-wrap"
    >
      <button
        class="toolbar-group-btn"
        :class="{ active: openGroup === gIdx }"
        @click.stop="toggleGroup(gIdx)"
        @mouseenter="onGroupHover(gIdx)"
      >
        <span class="group-icon" v-html="group.icon"></span>
        <span class="group-label">{{ group.label }}</span>
        <span class="group-arrow">▾</span>
      </button>
      <div class="toolbar-dropdown" v-if="openGroup === gIdx">
        <button
          v-for="(item, iIdx) in group.items"
          :key="iIdx"
          class="dropdown-item"
          @click.stop="executeItem(item)"
        >
          <span class="item-icon" v-html="item.icon"></span>
          <span class="item-label">{{ item.label }}</span>
          <span class="item-shortcut" v-if="item.shortcut">{{ item.shortcut }}</span>
        </button>
      </div>
    </div>
    <div class="toolbar-inline-group">
      <button class="toolbar-font-btn" @click="decreaseFontSize" title="缩小字体">A-</button>
      <span class="toolbar-font-size">{{ store.settings.editorFontSize }}</span>
      <button class="toolbar-font-btn" @click="increaseFontSize" title="增大字体">A+</button>
      <div class="toolbar-separator"></div>
      <button
        class="toolbar-font-btn"
        :class="{ active: store.settings.scrollSync }"
        @click="toggleScrollSync"
        title="滚动联动"
      >🖇</button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useEditorStore } from '@/stores/editorStore'
import { toolbarConfig } from '@/config/toolbar'
import { EditorView } from '@codemirror/view'

const store = useEditorStore()
const openGroup = ref(null)

function decreaseFontSize() {
  const s = store.settings
  s.editorFontSize = Math.max(10, s.editorFontSize - 1)
  s.previewFontSize = Math.max(10, s.previewFontSize - 1)
}

function increaseFontSize() {
  const s = store.settings
  s.editorFontSize = Math.min(32, s.editorFontSize + 1)
  s.previewFontSize = Math.min(32, s.previewFontSize + 1)
}

function toggleScrollSync() {
  store.settings.scrollSync = !store.settings.scrollSync
}

function toggleGroup(idx) {
  openGroup.value = openGroup.value === idx ? null : idx
}

function onGroupHover(idx) {
  if (openGroup.value !== null) {
    openGroup.value = idx
  }
}

function closeAll() {
  openGroup.value = null
}

onMounted(() => {
  document.addEventListener('click', closeAll)
})
onUnmounted(() => {
  document.removeEventListener('click', closeAll)
})

function getView() {
  if (window.editorRef) return window.editorRef
  const cmEl = document.querySelector('.cm-editor')
  if (cmEl?.cmView?.view) return cmEl.cmView.view
  return null
}

function executeItem(item) {
  closeAll()
  if (typeof item.action === 'function') {
    item.action(store)
    return
  }

  const view = getView()
  if (!view) {
    console.warn('[Toolbar] Editor not ready')
    return
  }

  const { state, dispatch } = view
  const sel = state.selection.main
  const selectedText = state.sliceDoc(sel.from, sel.to)
  const cursor = sel.from

  const insert = (text, selFrom, selTo) => {
    dispatch({
      changes: { from: cursor, to: cursor, insert: text },
      selection: { anchor: cursor + (selFrom || 0), head: cursor + (selTo || 0) }
    })
    view.focus()
  }

  const wrap = (before, after) => {
    const placeholder = '文本'
    if (sel.from === sel.to) {
      dispatch({
        changes: [{ from: sel.from, to: sel.to, insert: before + placeholder + after }],
        selection: { anchor: sel.from + before.length, head: sel.from + before.length + placeholder.length }
      })
    } else {
      dispatch({
        changes: [
          { from: sel.from, to: sel.from, insert: before },
          { from: sel.to, to: sel.to, insert: after }
        ],
        selection: { anchor: sel.from + before.length, head: sel.to + before.length }
      })
    }
    view.focus()
  }

  const toggleLinePrefix = (prefix) => {
    const line = state.doc.lineAt(cursor)
    const lineText = state.sliceDoc(line.from, line.to)
    const trimmed = lineText.trimStart()
    const leadingLen = lineText.length - trimmed.length

    if (prefix === '' && trimmed === '') return
    if (trimmed.startsWith(prefix + ' ')) {
      dispatch({ changes: { from: line.from + leadingLen, to: line.from + leadingLen + prefix.length + 1, insert: '' } })
    } else if (trimmed === prefix) {
      dispatch({ changes: { from: line.from + leadingLen, to: line.from + leadingLen + prefix.length, insert: '' } })
    } else {
      dispatch({ changes: { from: line.from, insert: prefix + ' ' } })
    }
    view.focus()
  }

  switch (item.action) {
    case 'bold': wrap('**', '**'); break
    case 'italic': wrap('*', '*'); break
    case 'strikethrough': wrap('~~', '~~'); break
    case 'underline': wrap('<u>', '</u>'); break
    case 'code': wrap('`', '`'); break
    case 'h1': toggleLinePrefix('#'); break
    case 'h2': toggleLinePrefix('##'); break
    case 'h3': toggleLinePrefix('###'); break
    case 'h4': toggleLinePrefix('####'); break
    case 'h5': toggleLinePrefix('#####'); break
    case 'h6': toggleLinePrefix('######'); break
    case 'paragraph': {
      const line = state.doc.lineAt(cursor)
      const lineText = state.sliceDoc(line.from, line.to)
      const trimmed = lineText.trimStart()
      const leadingLen = lineText.length - trimmed.length
      const headingMatch = trimmed.match(/^#{1,6}\s/)
      if (headingMatch) {
        dispatch({ changes: { from: line.from + leadingLen, to: line.from + leadingLen + headingMatch[0].length, insert: '' } })
      }
      view.focus()
      break
    }
    case 'blockquote': toggleLinePrefix('>'); break
    case 'hr': insert('\n---\n'); break
    case 'ul': toggleLinePrefix('-'); break
    case 'ol': toggleLinePrefix('1.'); break
    case 'task': toggleLinePrefix('- [ ]'); break
    case 'link':
      if (selectedText) { wrap('[', '](url)') }
      else { insert('[链接文本](url)', 1, 4) }
      break
    case 'image':
      if (selectedText) { wrap('![', '](url)') }
      else { insert('![图片描述](url)', 2, 5) }
      break
    case 'table':
      insert('\n| 标题1 | 标题2 | 标题3 |\n|-------|-------|-------|\n| 内容1 | 内容2 | 内容3 |\n')
      break
    case 'codeblock':
      if (selectedText) {
        dispatch({ changes: { from: sel.from, to: sel.to, insert: '```\n' + selectedText + '\n```' } })
      } else {
        insert('```\n\n```', 4, 4)
      }
      break
    case 'math':
      if (selectedText) {
        dispatch({ changes: { from: sel.from, to: sel.to, insert: '$$\n' + selectedText + '\n$$' } })
      } else {
        insert('$$\n\n$$', 4, 4)
      }
      break
    case 'mermaid': insert('```mermaid\ngraph TD\n    A-->B\n```'); break
    case 'undo': dispatch({ effects: EditorView.undo }); view.focus(); break
    case 'redo': dispatch({ effects: EditorView.redo }); view.focus(); break
    case 'toggle-preview': {
      const modes = ['dual', 'edit', 'preview']
      const idx = modes.indexOf(store.settings.viewMode)
      store.settings.viewMode = modes[(idx + 1) % modes.length]
      break
    }
    default: break
  }
}
</script>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  gap: 0;
  padding: 0 4px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}
.toolbar-group-wrap {
  position: relative;
}
.toolbar-group-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 30px;
  padding: 0 10px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 12px;
  transition: all 0.12s;
  white-space: nowrap;
}
.toolbar-group-btn:hover,
.toolbar-group-btn.active {
  background: var(--hover-bg);
  color: var(--text-primary);
}
.group-icon { font-size: 13px; line-height: 1; }
.group-label { font-size: 12px; }
.group-arrow {
  font-size: 10px;
  opacity: 0.5;
  margin-left: 2px;
  transition: transform 0.15s;
}
.toolbar-group-btn.active .group-arrow {
  transform: rotate(180deg);
}
.toolbar-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  min-width: 200px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.15);
  z-index: 200;
  padding: 4px 0;
}
.dropdown-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 32px;
  padding: 0 14px;
  border: none;
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
  font-size: 13px;
  text-align: left;
  transition: background 0.1s;
}
.dropdown-item:hover {
  background: var(--accent-color);
  color: #fff;
}
.dropdown-item:hover .item-shortcut {
  color: rgba(255,255,255,0.7);
}
.item-icon {
  width: 20px;
  text-align: center;
  font-size: 13px;
  flex-shrink: 0;
}
.item-label { flex: 1; }
.item-shortcut {
  font-size: 11px;
  color: var(--text-muted);
  margin-left: auto;
}
.toolbar-inline-group {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-left: 8px;
}
.toolbar-font-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 24px;
  min-width: 28px;
  padding: 0 6px;
  border: 1px solid var(--border-color);
  background: var(--bg-primary);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  border-radius: 3px;
  transition: all 0.12s;
}
.toolbar-font-btn:hover {
  background: var(--hover-bg);
  color: var(--text-primary);
  border-color: var(--accent-color);
}
.toolbar-font-btn:active {
  background: var(--active-bg);
}
.toolbar-font-btn.active {
  background: var(--accent-color);
  color: #fff;
  border-color: var(--accent-color);
}
.toolbar-font-size {
  font-size: 12px;
  color: var(--text-primary);
  min-width: 22px;
  text-align: center;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.toolbar-separator {
  width: 1px;
  height: 16px;
  background: var(--border-color);
  margin: 0 4px;
}
</style>
