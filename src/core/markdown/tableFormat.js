// ── Markdown 表格源码格式化（对标 Typora / VS Code Markdown 表格对齐）──
// 找到光标所在的连续表格块，按显示宽度（CJK 记 2）对齐每列的管道符。

// 字符显示宽度：CJK / 全角标点 / Hangul 记 2，其余记 1
function displayWidth(str) {
  let w = 0
  for (const ch of str) {
    w += /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE6F\uFF00-\uFF60\uFFE0-\uFFE6\u3000-\u303F]/.test(ch) ? 2 : 1
  }
  return w
}

// 按未转义的 | 拆分单元格（\| 视为字面量）
function splitRow(line) {
  const cells = []
  let cur = ''
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '\\' && line[i + 1] === '|') { cur += '\\|'; i++; continue }
    if (ch === '|') { cells.push(cur); cur = ''; continue }
    cur += ch
  }
  cells.push(cur)
  return cells
}

function isTableLine(line) {
  return /^\s*\|.*\|\s*$/.test(line)
}

// 分隔行：| --- | :---: | ...
function isSepRow(cells) {
  if (cells.length === 0) return false
  const body = cells.filter((c, i) => !(i === 0 && c.trim() === '') && !(i === cells.length - 1 && c.trim() === ''))
  return body.length > 0 && body.every(c => /^\s*:?-{1,}:?\s*$/.test(c))
}

// 解析一行表格为 { cells, hasLeadPipe, hasTailPipe }
function parseRow(line) {
  const hasLeadPipe = /^\s*\|/.test(line)
  const hasTailPipe = /\|\s*$/.test(line)
  const cells = splitRow(line.trim())
  if (hasLeadPipe && cells[0].trim() === '') cells.shift()
  if (hasTailPipe && cells[cells.length - 1].trim() === '') cells.pop()
  return { cells, hasLeadPipe, hasTailPipe }
}

function padCell(text, width, align) {
  const dw = displayWidth(text)
  const total = Math.max(width, dw)
  const pad = total - dw
  if (align === 'left') return text + ' '.repeat(pad)
  if (align === 'right') return ' '.repeat(pad) + text
  if (align === 'center') {
    const l = Math.floor(pad / 2)
    return ' '.repeat(l) + text + ' '.repeat(pad - l)
  }
  return text + ' '.repeat(pad)
}

/**
 * 格式化光标所在（或指定的）表格块
 * @param {EditorView} view CodeMirror 6 视图
 * @returns {boolean} 是否发生了格式化
 */
export function formatTableAtCursor(view) {
  const doc = view.state.doc
  const cursorLine = doc.lineAt(view.state.selection.main.head).number

  // 光标必须在表格内
  if (!isTableLine(doc.line(cursorLine).text)) return false

  // 向上/向下收集连续表格行
  let first = cursorLine
  while (first > 1 && isTableLine(doc.line(first - 1).text)) first--
  let last = cursorLine
  while (last < doc.lines && isTableLine(doc.line(last + 1).text)) last++

  const lines = []
  for (let n = first; n <= last; n++) lines.push(doc.line(n))

  const rows = lines.map(l => ({ ...parseRow(l.text), line: l }))
  const colCount = Math.max(...rows.map(r => r.cells.length))

  // 分隔行确定对齐方式
  const sepRowIdx = rows.findIndex(r => isSepRow(r.cells))
  if (sepRowIdx === -1) return false // 不含分隔行的不算完整表格

  const aligns = []
  const sepCells = rows[sepRowIdx].cells
  for (let c = 0; c < colCount; c++) {
    const cell = (sepCells[c] || '').trim()
    const left = cell.startsWith(':')
    const right = cell.endsWith(':') && cell.length > (left ? 1 : 0)
    aligns.push(left && right ? 'center' : right ? 'right' : 'left')
  }

  // 计算每列显示宽度（分隔行按最短合法形式 :--- / ---: / :---:）
  const widths = new Array(colCount).fill(0)
  const cellTexts = rows.map(r => r.cells.map(c => c.trim()))
  for (let c = 0; c < colCount; c++) {
    let w = 3 // 分隔行最短为 ---
    if (aligns[c] !== 'left') w = 4 // :--- 或 ---:
    for (const texts of cellTexts) {
      if (c < texts.length) w = Math.max(w, displayWidth(texts[c]))
    }
    widths[c] = w
  }

  // 重新拼行
  const changes = []
  rows.forEach((row, i) => {
    const parts = []
    for (let c = 0; c < colCount; c++) {
      let cell = cellTexts[i][c] ?? ''
      if (i === sepRowIdx) {
        // 重建分隔行：宽度对齐 + 保留对齐冒号
        const left = aligns[c] !== 'right'
        const right = aligns[c] !== 'left'
        let dash = '-'.repeat(widths[c])
        if (left && right) dash = ':' + '-'.repeat(Math.max(1, widths[c] - 2)) + ':'
        else if (left) dash = ':' + '-'.repeat(widths[c] - 1)
        else if (right) dash = '-'.repeat(widths[c] - 1) + ':'
        cell = dash
      } else {
        cell = padCell(cell, widths[c], aligns[c])
      }
      parts.push(cell)
    }
    const lead = row.hasLeadPipe ? '| ' : ''
    const tail = row.hasTailPipe ? ' |' : ''
    const text = lead + parts.join(' | ') + tail
    if (text !== row.line.text) {
      changes.push({ from: row.line.from, to: row.line.to, insert: text })
    }
  })

  if (changes.length === 0) return false
  view.dispatch({ changes })
  view.focus()
  return true
}
