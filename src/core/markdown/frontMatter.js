// YAML Front-matter 提取与渲染（Typora 风格属性表格）
// 预览区把文档头部的 ---\nkey: value\n--- 块渲染为只读属性表格，
// 并用等量空行占位，保证源码行号映射（滚动同步 / TOC 高亮）不偏移

// 提取文档开头的 front-matter 块；无则返回 null
export function extractFrontMatter(src) {
  if (!src || src.charCodeAt(0) !== 0x2d /* '-' */) return null
  const m = src.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/)
  if (!m) return null
  const raw = m[0]
  const lineCount = raw.split('\n').length - 1
  return {
    meta: parseSimpleYaml(m[1]),
    body: src.slice(raw.length),
    // 等量空行占位：保持 token.map 行号与源文件一致
    placeholder: '\n'.repeat(lineCount)
  }
}

// ── 轻量 YAML 子集解析 ──
// 支持：key: value（字符串/数字/布尔/null）、- 列表、一层缩进嵌套对象
// 更复杂的结构（多层嵌套/多行块标量）降级为字符串展示
function parseScalar(v) {
  v = v.trim()
  if (v === '' || v === '~' || /^null$/i.test(v)) return null
  if (/^(true|false)$/i.test(v)) return v.toLowerCase() === 'true'
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v)
  const q = v.match(/^(['"])([\s\S]*)\1$/)
  if (q) return q[2]
  return v
}

function isContentLine(l) {
  return l.trim() !== '' && !l.trim().startsWith('#')
}

function parseBlock(lines, start, indent) {
  // 前瞻判断容器类型：首个内容行以 "- " 开头则为数组
  let container = null
  let i = start
  for (; i < lines.length; i++) {
    const line = lines[i]
    if (!isContentLine(line)) continue
    const ind = line.match(/^ */)[0].length
    if (ind < indent) break
    const text = line.trim()

    if (container === null) {
      container = (text === '-' || text.startsWith('- ')) ? [] : {}
    }

    if (Array.isArray(container)) {
      if (text === '-' || text.startsWith('- ')) {
        container.push(parseScalar(text.slice(1)))
      }
      continue
    }

    const kv = text.match(/^([^:]+):(.*)$/)
    if (!kv) continue
    const key = kv[1].trim()
    const rest = kv[2].trim()
    if (rest !== '') {
      container[key] = parseScalar(rest)
    } else {
      // 值在后续缩进块中
      const child = parseBlock(lines, i + 1, ind + 1)
      container[key] = child.value
      i = child.next - 1
    }
  }
  return { value: container === null ? null : container, next: i }
}

function parseSimpleYaml(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const { value } = parseBlock(lines, 0, 0)
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

// ── 渲染为属性表格 ──
function esc(s) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

function formatValue(v) {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

export function renderFrontMatter(meta) {
  const keys = Object.keys(meta || {})
  if (keys.length === 0) return ''
  const rows = keys.map(k => {
    const v = meta[k]
    let valueHtml
    if (Array.isArray(v) && v.every(x => x === null || typeof x !== 'object')) {
      // tags / categories 等纯量数组渲染为标签
      valueHtml = v.map(x => `<span class="fm-tag">${esc(formatValue(x))}</span>`).join(' ')
    } else {
      valueHtml = `<span class="fm-value">${esc(formatValue(v))}</span>`
    }
    return `<tr><th>${esc(k)}</th><td>${valueHtml}</td></tr>`
  }).join('')
  return `<div class="front-matter" data-source-line="1"><table class="fm-table"><tbody>${rows}</tbody></table></div>`
}
