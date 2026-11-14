// 专注模式 + 打字机模式（对标 Typora）
// 专注模式：仅当前段落保持正常亮度，其余内容淡化
// 打字机模式：光标行始终保持在编辑器视口垂直居中
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

// 缓存：段落范围与可见范围未变时复用 decoration，避免光标段内移动 / 小幅滚动时全量重建
let cacheKey = ''
let cacheDeco = null
const OVERSCAN = 30 // 视口上下额外保有的行数，避免快速滚动时边角未淡化的闪烁

// P5：专注模式 decoration 改为仅构建「视口内（含 overscan）行」的淡化，
// 由 EditorView.decorations 在每次 update（含滚动）时按当前可见范围增量重建，
// 复杂度从全文档 O(N) 降为 O(视口行数)，超大文档下不再卡顿。
// 视口外行虽未被装饰（默认满亮度），但不可见，视觉上与全量淡化完全一致。
function computeViewportDim(view) {
  const state = view.state
  const cursor = state.selection.main.head
  const line = state.doc.lineAt(cursor)
  const { start, end } = paragraphRange(state, line.number)

  const ranges = view.visibleRanges
  if (!ranges || ranges.length === 0) return Decoration.none

  const doc = state.doc
  const fromLine = Math.max(1, doc.lineAt(ranges[0].from).number - OVERSCAN)
  const toLine = Math.min(doc.lines, doc.lineAt(ranges[ranges.length - 1].to).number + OVERSCAN)

  // 段落范围内不淡化（当前段落保持满亮度）；其余可见行淡化
  const key = `${start}:${end}:${fromLine}:${toLine}`
  if (key === cacheKey && cacheDeco) return cacheDeco

  const out = []
  for (let i = fromLine; i <= toLine; i++) {
    if (i < start || i > end) out.push(dimLine.range(doc.line(i).from))
  }
  cacheKey = key
  cacheDeco = Decoration.set(out, true)
  return cacheDeco
}

export const focusModeField = EditorView.decorations.of(view => computeViewportDim(view))

// ── 打字机模式 ──
// 仅在光标移动或输入时居中（scrollIntoView 自身不触发 selection/doc 更新，无循环）
export const typewriterScroll = EditorView.updateListener.of(u => {
  if (!u.selectionSet && !u.docChanged) return
  const head = u.state.selection.main.head
  u.view.dispatch({
    effects: EditorView.scrollIntoView(head, { y: 'center' })
  })
})
