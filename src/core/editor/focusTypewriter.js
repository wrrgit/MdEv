// 专注模式 + 打字机模式（对标 Typora）
// 专注模式：仅当前段落保持正常亮度，其余内容淡化
// 打字机模式：光标行始终保持在编辑器视口垂直居中
import { StateField } from '@codemirror/state'
import { EditorView, Decoration } from '@codemirror/view'

// ── 专注模式 ──
const dimLine = Decoration.line({ class: 'cm-focus-dim' })

// 光标所在段落的行范围（段落以空行为边界）
function paragraphRange(state, lineNumber) {
  let start = lineNumber
  while (start > 1 && state.doc.line(start - 1).text.trim() !== '') start--
  let end = lineNumber
  while (end < state.doc.lines && state.doc.line(end + 1).text.trim() !== '') end++
  return { start, end }
}

// 缓存：段落范围与文档行数未变时复用 decoration，避免光标段内移动时全量重建
let cacheKey = ''
let cacheDeco = null

function computeDimDecorations(state) {
  const cursor = state.selection.main.head
  const line = state.doc.lineAt(cursor)
  const { start, end } = paragraphRange(state, line.number)
  const key = `${start}:${end}:${state.doc.lines}`
  if (key === cacheKey && cacheDeco) return cacheDeco

  const ranges = []
  for (let i = 1; i <= state.doc.lines; i++) {
    if (i < start || i > end) ranges.push(dimLine.range(state.doc.line(i).from))
  }
  cacheKey = key
  cacheDeco = Decoration.set(ranges, true)
  return cacheDeco
}

export const focusModeField = StateField.define({
  create(state) { return computeDimDecorations(state) },
  update(deco, tr) {
    if (tr.docChanged || tr.selection) return computeDimDecorations(tr.state)
    return deco
  },
  provide: f => EditorView.decorations.from(f)
})

// ── 打字机模式 ──
// 仅在光标移动或输入时居中（scrollIntoView 自身不触发 selection/doc 更新，无循环）
export const typewriterScroll = EditorView.updateListener.of(u => {
  if (!u.selectionSet && !u.docChanged) return
  const head = u.state.selection.main.head
  u.view.dispatch({
    effects: EditorView.scrollIntoView(head, { y: 'center' })
  })
})
