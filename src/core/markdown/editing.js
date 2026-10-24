// Typora 风格的 Markdown 编辑键位辅助
// 供 EditorPane 的 CodeMirror keymap 调用，全部返回 true 表示已消费按键，false 回退默认行为
import { syntaxTree } from '@codemirror/language'

// 光标是否位于围栏代码块（``` fence）内部
// 注意：不检查缩进代码块（CodeBlock），否则 Tab 缩进的嵌套列表会被误判为代码
export function inFencedCode(view, pos) {
  try {
    const tree = syntaxTree(view.state)
    let node = tree.resolveInner(pos, -1)
    while (node) {
      if (/FencedCode/.test(node.name || '')) return true
      node = node.parent
    }
  } catch {}
  return false
}

// 切换包裹标记：已有标记则移除（再按一次取消），否则包裹选中文本
export function toggleWrap(view, open, close = open, placeholder = '') {
  const { from, to } = view.state.selection.main
  const doc = view.state.doc
  const beforeText = doc.sliceString(Math.max(0, from - open.length), from)
  const afterText = doc.sliceString(to, Math.min(doc.length, to + close.length))

  if (beforeText === open && afterText === close) {
    // 取消包裹
    view.dispatch({
      changes: [
        { from: from - open.length, to: from },
        { from: to, to: to + close.length }
      ],
      selection: { anchor: from - open.length, head: to - open.length }
    })
    return true
  }

  const selected = doc.sliceString(from, to)
  if (selected) {
    view.dispatch({
      changes: { from, to, insert: open + selected + close },
      selection: { anchor: from + open.length, head: to + open.length }
    })
  } else {
    view.dispatch({
      changes: { from, insert: open + placeholder + close },
      selection: { anchor: from + open.length, head: from + open.length + placeholder.length }
    })
  }
  return true
}

// 插入链接 [文本](url)，优先选中 url 部分便于直接输入地址
export function insertLink(view) {
  const { from, to } = view.state.selection.main
  const sel = view.state.sliceDoc(from, to)
  if (sel) {
    const insert = `[${sel}](url)`
    view.dispatch({
      changes: { from, to, insert },
      selection: { anchor: from + sel.length + 3, head: from + sel.length + 6 }
    })
  } else {
    const insert = '[链接文本](url)'
    view.dispatch({
      changes: { from, insert },
      selection: { anchor: from + 7, head: from + 10 }
    })
  }
  return true
}

// 插入围栏代码块，光标落在开栏 ``` 之后（直接输入语言）
export function insertCodeBlock(view) {
  const { from, to } = view.state.selection.main
  const sel = view.state.sliceDoc(from, to)
  if (sel) {
    view.dispatch({
      changes: { from, to, insert: '```\n' + sel + '\n```' },
      selection: { anchor: from + 3 }
    })
  } else {
    view.dispatch({
      changes: { from, insert: '```\n\n```' },
      selection: { anchor: from + 3 }
    })
  }
  return true
}

// 设置标题：level 1-6，同级别再按一次取消，0 = 恢复正文；作用于选区覆盖的所有行
export function setHeading(view, level) {
  const { from, to } = view.state.selection.main
  const doc = view.state.doc
  const firstLine = doc.lineAt(from).number
  const lastLine = doc.lineAt(to).number
  const changes = []

  for (let n = firstLine; n <= lastLine; n++) {
    const line = doc.line(n)
    const m = line.text.match(/^(#{1,6})\s+/)
    if (level === 0) {
      if (m) changes.push({ from: line.from, to: line.from + m[0].length, insert: '' })
    } else if (m) {
      if (m[1].length === level) {
        changes.push({ from: line.from, to: line.from + m[0].length, insert: '' })
      } else {
        changes.push({ from: line.from, to: line.from + m[0].length, insert: '#'.repeat(level) + ' ' })
      }
    } else {
      changes.push({ from: line.from, insert: '#'.repeat(level) + ' ' })
    }
  }

  if (changes.length) view.dispatch({ changes })
  return true
}

// ── 表格辅助 ──
function isTableRow(text) {
  const t = text.trim()
  return t.length >= 2 && t.startsWith('|') && t.endsWith('|') && t.includes('|', 1)
}

function isSeparatorRow(text) {
  return /^\s*\|[\s:|-]+\|\s*$/.test(text) && text.includes('-')
}

// 统计未转义竖线：返回 [位置数组]
function pipePositions(text) {
  const pos = []
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '|' && text[i - 1] !== '\\') pos.push(i)
  }
  return pos
}

// 光标所在单元格序号（0-based，按行首第一个竖线后算第 0 格）
function cellIndex(lineText, col) {
  const pipes = pipePositions(lineText)
  let idx = 0
  for (const p of pipes) {
    if (col <= p) break
    idx++
  }
  return Math.max(0, idx - 1)
}

// 表格内 Enter：跳到下一个数据行同列（跳过分隔行）；表格结束后新建一行
function tableEnter(view, line, from) {
  const doc = view.state.doc
  const pipes = pipePositions(line.text)
  const cells = Math.max(1, pipes.length - 1)
  const col = cellIndex(line.text, from - line.from)

  // 向下查找下一个数据行（跳过分隔行，直到表格结束）
  let target = null
  for (let n = line.number + 1; n <= doc.lines; n++) {
    const ln = doc.line(n)
    if (!isTableRow(ln.text)) break
    if (!isSeparatorRow(ln.text)) { target = ln; break }
  }

  if (target) {
    const targetPipes = pipePositions(target.text)
    const pipe = targetPipes[Math.min(col, targetPipes.length - 2)]
    const anchor = Math.min(target.to, target.from + pipe + 2)
    view.dispatch({ selection: { anchor }, scrollIntoView: true })
    return true
  }

  // 表格末尾 → 在表格最后一行之后新建数据行
  let lastLine = line
  for (let n = line.number + 1; n <= doc.lines; n++) {
    const ln = doc.line(n)
    if (!isTableRow(ln.text)) break
    lastLine = ln
  }
  const row = '|' + '  |'.repeat(cells)
  view.dispatch({
    changes: { from: lastLine.to, insert: '\n' + row },
    selection: { anchor: lastLine.to + 2 },
    scrollIntoView: true
  })
  return true
}

// ── 智能回车：列表/任务列表/引用续写，空项退出；表格行内跳转 ──
export function smartEnter(view) {
  const { state } = view
  const sel = state.selection.main
  if (!sel.empty) return false
  const from = sel.from
  if (inFencedCode(view, from)) return false

  const line = state.doc.lineAt(from)
  const before = line.text.slice(0, from - line.from)

  // 表格行内回车：跳到下一行同列 / 新建行
  if (isTableRow(line.text) && before.includes('|')) {
    return tableEnter(view, line, from)
  }

  // 引用续写：> xxx
  const qm = before.match(/^(\s*>\s?)(.*)$/)
  if (qm) {
    if (qm[2] === '') {
      // 空引用行 → 退出引用
      view.dispatch({ changes: { from: line.from, to: from, insert: '' } })
      return true
    }
    const prefix = qm[1].endsWith(' ') ? qm[1] : qm[1] + ' '
    view.dispatch({
      changes: { from, insert: '\n' + prefix },
      selection: { anchor: from + 1 + prefix.length }
    })
    return true
  }

  // 列表/有序列表/任务列表续写
  const lm = before.match(/^(\s*)([-*+]|\d+[.)])(\s+)((?:\[[ xX]\]\s+)?)(.*)$/)
  if (lm) {
    const [, indent, marker, , task, content] = lm
    if (content === '') {
      // 空列表项 → 退出列表（清除标记）
      view.dispatch({ changes: { from: line.from, to: from, insert: '' } })
      return true
    }
    let nextMarker = marker
    if (/\d/.test(marker)) nextMarker = (parseInt(marker) + 1) + marker.slice(-1)
    const insert = '\n' + indent + nextMarker + ' ' + (task ? '[ ] ' : '')
    view.dispatch({
      changes: { from, insert },
      selection: { anchor: from + insert.length }
    })
    return true
  }

  return false
}

// ── Tab：表格内切换单元格；列表项内缩进（嵌套）──
export function smartTab(view) {
  const { state } = view
  const sel = state.selection.main
  if (!sel.empty) return false
  const line = state.doc.lineAt(sel.from)
  if (inFencedCode(view, sel.from)) return false

  // 表格内 Tab → 下一个单元格
  if (isTableRow(line.text)) {
    const pipes = pipePositions(line.text)
    const col = sel.from - line.from
    for (const p of pipes) {
      if (p >= col) {
        view.dispatch({
          selection: { anchor: Math.min(line.to, line.from + p + 2) },
          scrollIntoView: true
        })
        return true
      }
    }
    // 行尾 → 下一行第一个单元格
    if (state.doc.lines > line.number) {
      const next = state.doc.line(line.number + 1)
      if (isTableRow(next.text)) {
        const nextPipes = pipePositions(next.text)
        view.dispatch({
          selection: { anchor: Math.min(next.to, next.from + nextPipes[0] + 2) },
          scrollIntoView: true
        })
        return true
      }
    }
    return false
  }

  // 列表项内 Tab → 缩进 4 空格（嵌套子列表）
  if (/^\s*([-*+]|\d+[.)])\s/.test(line.text)) {
    view.dispatch({
      changes: { from: line.from, insert: '    ' },
      selection: { anchor: sel.from + 4 }
    })
    return true
  }

  return false
}

// Shift-Tab：表格内前一单元格；列表项反缩进
export function smartShiftTab(view) {
  const { state } = view
  const sel = state.selection.main
  if (!sel.empty) return false
  const line = state.doc.lineAt(sel.from)
  if (inFencedCode(view, sel.from)) return false

  // 表格内 Shift-Tab → 前一个单元格
  if (isTableRow(line.text)) {
    const pipes = pipePositions(line.text)
    const col = sel.from - line.from
    for (let i = pipes.length - 1; i >= 0; i--) {
      if (pipes[i] < col - 1) {
        view.dispatch({
          selection: { anchor: line.from + pipes[i] + 2 },
          scrollIntoView: true
        })
        return true
      }
    }
    return false
  }

  // 列表项 Shift-Tab → 反缩进（最多移除 4 空格）
  if (/^\s+/.test(line.text)) {
    const spaces = line.text.match(/^\s+/)[0]
    const remove = Math.min(spaces.length, 4)
    view.dispatch({
      changes: { from: line.from, to: line.from + remove, insert: '' },
      selection: { anchor: Math.max(line.from, sel.from - remove) }
    })
    return true
  }

  return false
}
