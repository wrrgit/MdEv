// 基于源码行映射的滚动同步（VS Code / MarkText 同款思路）
// 预览区块级元素携带 parser 注入的 data-source-line 属性，
// 与编辑器文档行号建立双向插值映射，比百分比同步精确得多。

// ── 同步锁：程序化滚动后短暂抑制回环事件 ──
let lockedUntil = 0

export function lockScrollSync(ms = 120) {
  lockedUntil = Date.now() + ms
}

export function isScrollSyncLocked() {
  return Date.now() < lockedUntil
}

// ── 锚点收集 ──
// 返回 { anchors: [{line, top, bottom, tag}], pad }
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
    const line = parseInt(el.dataset.sourceLine, 10)
    if (!Number.isFinite(line)) continue
    const rect = el.getBoundingClientRect()
    anchors.push({
      line,
      top: rect.top - contentRect.top,
      bottom: rect.bottom - contentRect.top,
      tag: el.tagName.toLowerCase()
    })
  }

  anchors.sort((a, b) => a.top - b.top)

  // 同一行存在嵌套元素（如 blockquote 内的段落）时，只保留视觉最靠前的外层
  const seen = new Set()
  const deduped = anchors.filter(a => {
    if (seen.has(a.line)) return false
    seen.add(a.line)
    return true
  })

  return { anchors: deduped, pad }
}

// 预览区内容坐标 y → 源码行号（线性插值，返回浮点行号）
export function yToLine(anchors, y) {
  if (!anchors.length) return null
  if (y <= anchors[0].top) return anchors[0].line
  for (let i = 1; i < anchors.length; i++) {
    if (anchors[i].top > y) {
      const a = anchors[i - 1]
      const b = anchors[i]
      const span = b.top - a.top
      if (span <= 0) return a.line
      return a.line + (b.line - a.line) * ((y - a.top) / span)
    }
  }
  return anchors[anchors.length - 1].line
}

// 源码行号 → 预览区内容坐标 y（线性插值）
export function lineToY(anchors, line) {
  if (!anchors.length) return null
  if (line <= anchors[0].line) return anchors[0].top
  for (let i = 1; i < anchors.length; i++) {
    if (anchors[i].line >= line) {
      const a = anchors[i - 1]
      const b = anchors[i]
      const span = b.line - a.line
      if (span <= 0) return b.top
      return a.top + (b.top - a.top) * ((line - a.line) / span)
    }
  }
  return anchors[anchors.length - 1].top
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
