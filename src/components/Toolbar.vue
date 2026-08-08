<template>
  <div class="toolbar" v-if="store.tabs.length > 0" @mouseleave="closeAll">
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
        <template v-for="(item, iIdx) in group.items" :key="iIdx">
          <div class="dropdown-separator" v-if="item.separator"></div>
          <button
            v-else
            class="dropdown-item"
            @click.stop="executeItem(item)"
          >
            <span class="item-icon" v-html="item.icon"></span>
            <span class="item-label">{{ item.label }}</span>
            <span class="item-shortcut" v-if="item.shortcut">{{ item.shortcut }}</span>
          </button>
        </template>
      </div>
    </div>
    <div class="toolbar-separator"></div>
    <!-- 快捷按钮栏 -->
    <div class="quick-bar">
      <button
        v-for="(item, qIdx) in quickBarConfig"
        :key="qIdx"
        class="quick-btn"
        :title="item.title"
        @click.stop="executeQuickItem(item)"
      >
        <span v-html="item.icon"></span>
      </button>
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
import { toolbarConfig, quickBarConfig } from '@/config/toolbar'
import { EditorView } from '@codemirror/view'
import { undo as cmUndo, redo as cmRedo } from '@codemirror/commands'

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

// 快捷按钮直接执行对应 action
async function executeQuickItem(item) {
  // 复用 executeItem 的 switch 逻辑，构造一个伪 item 传入
  const fakeItem = { action: item.action, icon: item.icon, label: item.label }
  await executeItem(fakeItem)
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

function computeRelativePath(basePath, targetPath) {
  const norm = (p) => p.replace(/\\/g, '/').replace(/\/+$/, '')
  const baseParts = norm(basePath).split('/')
  const targetParts = norm(targetPath).split('/')
  let i = 0
  while (i < baseParts.length && i < targetParts.length &&
    baseParts[i].toLowerCase() === targetParts[i].toLowerCase()) i++
  const up = baseParts.length - i
  const rest = targetParts.slice(i)
  const parts = []
  for (let j = 0; j < up; j++) parts.push('..')
  parts.push(...rest)
  return parts.join('/')
}

// ── 表格操作辅助函数 ──
function parseTableCells(lineText) {
  let text = lineText.trim()
  if (text.startsWith('|')) text = text.slice(1)
  if (text.endsWith('|')) text = text.slice(0, -1)
  return text.split('|').map(c => c.trim())
}

function rebuildTableRow(cells) {
  return '| ' + cells.map(c => c || '   ').join(' | ') + ' |'
}

function getTableAtCursor(view) {
  const state = view.state
  const cursor = state.selection.main.head
  const line = state.doc.lineAt(cursor)
  const lineText = state.sliceDoc(line.from, line.to)
  if (!lineText.trim().startsWith('|')) return null

  let startLine = line.number
  while (startLine > 1) {
    const prev = state.doc.line(startLine - 1)
    if (!state.sliceDoc(prev.from, prev.to).trim().startsWith('|')) break
    startLine--
  }
  let endLine = line.number
  while (endLine < state.doc.lines) {
    const next = state.doc.line(endLine + 1)
    if (!state.sliceDoc(next.from, next.to).trim().startsWith('|')) break
    endLine++
  }
  if (endLine - startLine < 1) return null

  const rows = []
  for (let i = startLine; i <= endLine; i++) {
    const l = state.doc.line(i)
    rows.push(parseTableCells(state.sliceDoc(l.from, l.to)))
  }
  let sepIdx = -1
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].length > 0 && rows[i].every(c => /^[-:]+$/.test(c.trim()))) { sepIdx = i; break }
  }
  if (sepIdx === -1) return null

  const curRow = line.number - startLine
  let curCol = 0
  for (let i = 0; i < lineText.length; i++) {
    if (i >= (cursor - line.from)) break
    if (lineText[i] === '|') curCol++
  }
  curCol = Math.max(0, Math.min(curCol - 1, rows[0].length - 1))

  return {
    rows, sepIdx, curRow, curCol,
    numCols: rows[0].length,
    tableFrom: state.doc.line(startLine).from,
    tableTo: state.doc.line(endLine).to
  }
}

function applyTableChange(view, table, newRows, newCursorRow) {
  const newText = newRows.map(r => rebuildTableRow(r)).join('\n')
  view.dispatch({
    changes: { from: table.tableFrom, to: table.tableTo, insert: newText }
  })
  if (newCursorRow !== undefined && newCursorRow >= 0 && newCursorRow < newRows.length) {
    const lines = newText.split('\n')
    let offset = 0
    for (let i = 0; i < newCursorRow; i++) offset += lines[i].length + 1
    view.dispatch({ selection: { anchor: table.tableFrom + offset + 2 } })
  }
  view.focus()
}

async function executeItem(item) {
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

  const insertFormulaTemplate = (latex) => {
    if (selectedText) {
      dispatch({ changes: { from: sel.from, to: sel.to, insert: '$$\n' + latex + '\n$$' } })
    } else {
      const text = '$$\n' + latex + '\n$$'
      insert(text, 3, 3 + latex.length)
    }
  }

  switch (item.action) {
    case 'bold': wrap('**', '**'); break
    case 'italic': wrap('*', '*'); break
    case 'strikethrough': wrap('~~', '~~'); break
    case 'underline': wrap('<u>', '</u>'); break
    case 'code': wrap('`', '`'); break
    case 'subscript': wrap('~', '~'); break
    case 'superscript': wrap('^', '^'); break
    case 'highlight': wrap('==', '=='); break
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
    case 'footnote': {
      const docText = state.doc.toString()
      let maxId = 0
      const re = /\[\^(\d+)\]/g
      let m
      while ((m = re.exec(docText)) !== null) {
        maxId = Math.max(maxId, parseInt(m[1]))
      }
      const fnId = maxId + 1
      const refText = `[^${fnId}]`
      const lastLine = state.doc.line(state.doc.lines)
      const defText = `\n\n[^${fnId}]: 脚注内容`
      dispatch({
        changes: [
          { from: sel.from, to: sel.to, insert: refText },
          { from: lastLine.to, insert: defText }
        ],
        selection: { anchor: lastLine.to + defText.length - 4 }
      })
      view.focus()
      break
    }
    case 'link': {
      const linkResult = await window.api?.showFormDialog({
        title: '插入链接',
        fields: [
          { name: 'text', label: '链接描述', value: selectedText, placeholder: '链接显示文本' },
          { name: 'url', label: '链接地址', value: '', placeholder: 'https://' }
        ]
      })
      if (!linkResult) { view.focus(); break }
      const linkText = linkResult.text || '链接文本'
      const linkUrl = linkResult.url || 'https://'
      dispatch({ changes: { from: sel.from, to: sel.to, insert: `[${linkText}](${linkUrl})` } })
      view.focus()
      break
    }
    case 'image-local': {
      const imagePath = await window.api?.openImageDialog()
      if (!imagePath) { view.focus(); break }
      const basePath = store.activeTab?.filePath
        ? store.activeTab.filePath.replace(/[\\/][^\\/]+$/, '')
        : store.projectRoot || ''
      const relPath = basePath ? computeRelativePath(basePath, imagePath) : imagePath
      const fileName = imagePath.split(/[\\/]/).pop().replace(/\.[^.]+$/, '')
      insert(`![${fileName}](${relPath})`, 2, 2 + fileName.length)
      break
    }
    case 'image-url': {
      const imgResult = await window.api?.showFormDialog({
        title: '插入网络图片',
        fields: [
          { name: 'alt', label: '图片描述', value: selectedText, placeholder: '图片替代文字' },
          { name: 'url', label: '图片地址', value: '', placeholder: 'https://' }
        ]
      })
      if (!imgResult) { view.focus(); break }
      const imgAlt = imgResult.alt || '图片描述'
      const imgUrl = imgResult.url || 'https://'
      dispatch({ changes: { from: sel.from, to: sel.to, insert: `![${imgAlt}](${imgUrl})` } })
      view.focus()
      break
    }
    case 'table': {
      const result = await window.api?.showTableDialog()
      if (!result) { view.focus(); break }
      const { rows, cols } = result
      let table = '\n'
      table += '| ' + Array.from({ length: cols }, (_, i) => '列' + (i + 1)).join(' | ') + ' |\n'
      table += '| ' + Array(cols).fill('---').join(' | ') + ' |\n'
      for (let r = 0; r < rows; r++) {
        table += '| ' + Array(cols).fill('   ').join(' | ') + ' |\n'
      }
      insert(table)
      break
    }
    case 'table-add-row-above': {
      const t = getTableAtCursor(view)
      if (!t) { view.focus(); break }
      const newRow = Array(t.numCols).fill('')
      const newRows = [...t.rows]
      newRows.splice(t.curRow, 0, newRow)
      applyTableChange(view, t, newRows, t.curRow)
      break
    }
    case 'table-add-row-below': {
      const t = getTableAtCursor(view)
      if (!t) { view.focus(); break }
      const newRow = Array(t.numCols).fill('')
      const newRows = [...t.rows]
      const insertAfter = t.curRow < t.sepIdx ? t.sepIdx : t.curRow
      newRows.splice(insertAfter + 1, 0, newRow)
      applyTableChange(view, t, newRows, insertAfter + 1)
      break
    }
    case 'table-delete-row': {
      const t = getTableAtCursor(view)
      if (!t || t.rows.length <= 2) { view.focus(); break }
      const newRows = t.rows.filter((_, i) => i !== t.curRow)
      applyTableChange(view, t, newRows)
      break
    }
    case 'table-add-col-left': {
      const t = getTableAtCursor(view)
      if (!t) { view.focus(); break }
      const newRows = t.rows.map((row, i) => {
        const newRow = [...row]
        newRow.splice(t.curCol, 0, i === t.sepIdx ? '---' : '')
        return newRow
      })
      applyTableChange(view, t, newRows)
      break
    }
    case 'table-add-col-right': {
      const t = getTableAtCursor(view)
      if (!t) { view.focus(); break }
      const newRows = t.rows.map((row, i) => {
        const newRow = [...row]
        newRow.splice(t.curCol + 1, 0, i === t.sepIdx ? '---' : '')
        return newRow
      })
      applyTableChange(view, t, newRows)
      break
    }
    case 'table-delete-col': {
      const t = getTableAtCursor(view)
      if (!t || t.numCols <= 1) { view.focus(); break }
      const newRows = t.rows.map(row => {
        const newRow = [...row]
        newRow.splice(t.curCol, 1)
        return newRow
      })
      applyTableChange(view, t, newRows)
      break
    }
    case 'codeblock':
      if (selectedText) {
        dispatch({ changes: { from: sel.from, to: sel.to, insert: '```\n' + selectedText + '\n```' } })
      } else {
        insert('```\n\n```', 4, 4)
      }
      break
    case 'math-inline':
      if (selectedText) { wrap('$', '$') }
      else { insert('$E=mc^2$', 1, 6) }
      break
    case 'math-block':
      if (selectedText) {
        dispatch({ changes: { from: sel.from, to: sel.to, insert: '$$\n' + selectedText + '\n$$' } })
      } else {
        insert('$$\n\n$$', 4, 4)
      }
      break
    case 'math-sum': insertFormulaTemplate('\\sum_{i=1}^{n} x_i'); break
    case 'math-integral': insertFormulaTemplate('\\int_{a}^{b} f(x)\\,dx'); break
    case 'math-fraction': insertFormulaTemplate('\\frac{a}{b}'); break
    case 'math-sqrt': insertFormulaTemplate('\\sqrt{x}'); break
    case 'math-limit': insertFormulaTemplate('\\lim_{x \\to \\infty} f(x)'); break
    case 'math-matrix': insertFormulaTemplate('\\begin{pmatrix}\na & b \\\\\nc & d\n\\end{pmatrix}'); break
    case 'mermaid': insert('```mermaid\ngraph TD\n    A-->B\n```'); break
    case 'flowchart': insert('```mermaid\nflowchart LR\n    A[开始] --> B{条件判断}\n    B -->|是| C[执行操作]\n    B -->|否| D[跳过]\n    C --> E[结束]\n    D --> E\n```'); break
    case 'gantt': insert('```mermaid\ngantt\n    title 项目计划\n    dateFormat  YYYY-MM-DD\n    section 设计阶段\n    需求分析    :a1, 2024-01-01, 7d\n    原型设计    :after a1, 5d\n    section 开发阶段\n    前端开发    :2024-01-15, 14d\n    后端开发    :2024-01-15, 14d\n    section 测试上线\n    测试         :2024-02-01, 7d\n    上线         :after 测试, 2d\n```'); break
    case 'plantuml':
      insert('\n```plantuml\n@startuml\nAlice -> Bob: Hello\nBob --> Alice: Hi!\n@enduml\n```\n')
      break
    case 'admonition-note': insert('\n::: note\n\n:::\n', 10, 10); break
    case 'admonition-tip': insert('\n::: tip\n\n:::\n', 9, 9); break
    case 'admonition-warning': insert('\n::: warning\n\n:::\n', 13, 13); break
    case 'admonition-danger': insert('\n::: danger\n\n:::\n', 12, 12); break
    case 'undo': cmUndo(view); view.focus(); break
    case 'redo': cmRedo(view); view.focus(); break
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
  max-height: calc(100vh - 120px);
  overflow-y: auto;
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
.dropdown-separator {
  height: 1px;
  background: var(--border-color);
  margin: 4px 8px;
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
.quick-bar {
  display: flex;
  align-items: center;
  gap: 0;
  margin-left: 4px;
}
.quick-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 26px;
  padding: 0 6px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 13px;
  border-radius: 4px;
  transition: all 0.12s;
}
.quick-btn:hover {
  background: var(--hover-bg);
  color: var(--text-primary);
}
.quick-btn:active {
  background: var(--active-bg);
}
</style>
