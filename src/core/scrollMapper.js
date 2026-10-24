// 基于源码行映射的滚动同步（VS Code / MarkText 同款思路）
// 预览区块级元素携带 parser 注入的 data-source-line / data-source-line-end 属性（1 基行号），
// 与编辑器文档行号建立双向插值映射，比百分比同步精确得多。
//
// 映射分三段：
// - 块内部：源码行 [line, endLine] 线性映射到该块的像素高度 [top, bottom]
// - 块之间：上一块的 endLine 线性映射到下一块的 line（跨过块间距）
// - 首块之前 / 末块之后：直接取首块 line / 末块 endLine

// ── 同步锁：程序化滚动后短暂抑制回环事件 ──
// 按方向隔离：滚动预览后只抑制「预览」自身的回环事件，编辑器侧事件照常放行（反之亦然）。
// 旧的全局锁会把主动滚动一方的事件也吞掉——连续拖动/滚轮时对面窗格不断续锁，
// 主动方事件几乎全部被丢弃，表现为联动严重滞后甚至完全失效。
const lockedUntil = { editor: 0, preview: 0 }

export function lockScrollSync(pane = 'preview', ms = 120) {
  if (pane !== 'editor' && pane !== 'preview') pane = 'preview'
  lockedUntil[pane] = Date.now() + ms
}

export function isScrollSyncLocked(pane = 'preview') {
  if (pane !== 'editor' && pane !== 'preview') pane = 'preview'
  return Date.now() < lockedUntil[pane]
}

// ── 锚点收集 ──
// 返回 { anchors: [{line, endLine, top, bottom, tag}], pad }
// anchors 按视觉位置排序；top/bottom 为相对内容区顶部的坐标；
// pad = 内容区顶部相对滚动容器视口的静态偏移（受 padding 影响）。
// 坐标换算：视口顶部对应的内容坐标 y = scrollTop - pad；scrollTop = y + pad。
export function buildAnchors(contentEl, scrollEl) {
  if (!contentEl || !scrollEl) return { anchors: [], pad: 0 }

  const contentRect = contentEl.getBoundingClientRect()
  const scrollRect = scrollEl.getBoundingClientRect()
  const pad = contentRect.top - scrollRect.top + scrollEl.scrollTop

  const anchors = []
  for (const el of contentEl.querySelectorAll('[data-source-line]')) {
    // 容器元素（内部还有带源码行号的块，如 ul > li、blockquote > p、table > tr）
    // 交给内部块处理，避免同一段像素高度被重复映射
    if (el.querySelector('[data-source-line]')) continue
    const line = parseInt(el.dataset.sourceLine, 10)
    if (!Number.isFinite(line)) continue
    const endLine = Math.max(line, parseInt(el.dataset.sourceLineEnd, 10) || line)
    const rect = el.getBoundingClientRect()
    anchors.push({
      line,
      endLine,
      top: rect.top - contentRect.top,
      bottom: rect.bottom - contentRect.top,
      tag: el.tagName.toLowerCase()
    })
  }

  anchors.sort((a, b) => a.top - b.top || a.line - b.line)

  // 同一行存在多个块（如一行多列表格单元格）时，只保留视觉最靠前的一个
  const seen = new Set()
  const deduped = anchors.filter(a => {
    if (seen.has(a.line)) return false
    seen.add(a.line)
    return true
  })

  return { anchors: deduped, pad }
}

// 块在行坐标中的结束位置：
// - 多行块（段落折行、代码块、列表等）止于自身末行
// - 单行块（标题、单行段落、表格行等）占满一个完整行单位，
//   这样块内的像素位置能换算成行内比例，回传给编辑器后仍能继续平滑滚动
function effEnd(a) {
  return a.endLine > a.line ? a.endLine : a.line + 1
}

// 预览区内容坐标 y → 源码行号（1 基浮点数）
export function yToLine(anchors, y) {
  if (!anchors.length) return null
  if (y <= anchors[0].top) return anchors[0].line
  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i]
    const aEnd = effEnd(a)
    const b = anchors[i + 1]
    // 块内部
    if (y < a.bottom || (!b && y <= a.bottom)) {
      const h = a.bottom - a.top
      if (h <= 0) return a.line
      return a.line + (aEnd - a.line) * ((y - a.top) / h)
    }
    if (!b) return aEnd
    // 块间距：上一块末行 → 下一块首行（仅当 y 仍在间距内；否则继续检查下一块）
    if (y < b.top) {
      const gap = b.top - a.bottom
      const dLine = b.line - aEnd
      if (gap > 0 && dLine > 0) return aEnd + dLine * ((y - a.bottom) / gap)
      return b.line
    }
  }
  return anchors[anchors.length - 1].endLine
}

// 源码行号（1 基浮点数）→ 预览区内容坐标 y
export function lineToY(anchors, line) {
  if (!anchors.length) return null
  if (line <= anchors[0].line) return anchors[0].top
  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i]
    const aEnd = effEnd(a)
    const b = anchors[i + 1]
    // 块内部（行号恰为块末边界时归下一块处理，保证贴着下一块顶部）
    if (line < aEnd) {
      return a.top + (a.bottom - a.top) * ((line - a.line) / (aEnd - a.line))
    }
    if (!b) return a.bottom
    // 块间距
    if (line < b.line) {
      const gap = b.top - a.bottom
      const dLine = b.line - aEnd
      if (gap <= 0 || dLine <= 0) return b.top
      return a.bottom + gap * ((line - aEnd) / dLine)
    }
  }
  return anchors[anchors.length - 1].bottom
}

// 当前章节：返回 top <= y 的最后一个标题锚点行号
export function currentHeadingLine(anchors, y) {
  let current = 0
  for (const a of anchors) {
    if (a.tag.length === 2 && a.tag[0] === 'h' && a.top <= y) current = a.line
    else if (a.top > y) break
  }
  return current
}
