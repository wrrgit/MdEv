// ── 大文件 HTML 分帧净化 ──
//
// 背景：markdown-it 解析已移到 Web Worker，但 DOMPurify.sanitize 仍在主线程同步执行。
// 实测 0.9MB HTML 的整篇净化会连续占用主线程约 0.7–1.1s（jsdom 基准，浏览器略快），
// 期间 UI 完全冻结 —— 这正是打开 ~1MB 文档时「渲染中…」一直挂着的根因。
//
// 方案：把 Worker 产出的 HTML 按「顶层闭合块」边界切成若干完整片段，逐段净化，
// 段间把主线程还给浏览器（setTimeout 0）。总耗时略有增加，但每次阻塞从 ~1s 降到
// ~100ms 以内，界面可响应、加载指示能正常显示。
//
// 切分只在「标签栈为空」且已越过阈值时进行，因此不会把 <pre> / <table> / <math> /
// <div> 等容器从中间切开，也不会让 DOMPurify 为孤立片段补出多余的闭合标签。

const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr'
])
const TAG_RE = /<\/?([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*>/g

/**
 * 把 HTML 切成完整片段数组（纯函数，无 DOM 依赖）。
 * @param {string} html 待净化的原始 HTML
 * @param {number} maxChars 单个片段的目标字符数上限
 * @returns {string[]} 片段数组；空输入返回 []，找不到安全切点时返回 [html]
 */
export function splitHtmlIntoChunks(html, maxChars = 96_000) {
  if (typeof html !== 'string' || html.length === 0) return []
  const limit = Number.isFinite(maxChars) && maxChars > 0 ? Math.floor(maxChars) : 96_000
  if (html.length <= limit) return [html]

  const chunks = []
  const stack = []
  let chunkStart = 0
  TAG_RE.lastIndex = 0
  let m
  while ((m = TAG_RE.exec(html)) !== null) {
    const raw = m[0]
    const tag = m[1].toLowerCase()
    const isClose = raw[1] === '/'
    const isSelfClose = /\/\s*>$/.test(raw) || VOID_TAGS.has(tag)

    if (isClose) {
      // 遇闭合标签时弹到最近的同名开标签；不匹配的闭合标签直接忽略（DOMPurify 会处理）
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i] === tag) {
          stack.length = i
          break
        }
      }
    } else if (!isSelfClose) {
      stack.push(tag)
    }

    const end = TAG_RE.lastIndex
    if (stack.length === 0 && end - chunkStart >= limit) {
      chunks.push(html.slice(chunkStart, end))
      chunkStart = end
    }
  }
  if (chunkStart < html.length) chunks.push(html.slice(chunkStart))
  return chunks
}

function defaultYield() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

/**
 * 分帧净化 HTML。单片段时走一次同步净化（零额外开销）；多片段时段间让出主线程。
 * 依赖注入 sanitize / yieldFn，使净化策略与切分策略都可以在 Node 里确定性单测。
 * @returns {Promise<string>} 净化后的 HTML
 */
export async function sanitizeHtmlInChunks(html, config, options = {}) {
  const {
    chunkChars = 96_000,
    sanitize,
    yieldFn = defaultYield
  } = options
  if (typeof sanitize !== 'function') {
    throw new TypeError('sanitizeHtmlInChunks requires a sanitize(html, config) function')
  }
  const chunks = splitHtmlIntoChunks(html, chunkChars)
  if (chunks.length <= 1) return sanitize(html, config)

  const out = []
  for (let i = 0; i < chunks.length; i++) {
    out.push(sanitize(chunks[i], config))
    if (i < chunks.length - 1) await yieldFn()
  }
  return out.join('')
}
