// ── Markdown 解析核心（无 DOM 依赖，可在 Web Worker 中运行）──
// 对标 VS Code / Monaco：重活（markdown-it 解析 + 高亮 + KaTeX）搬进 Worker，主线程只做 UI 与净化。
// 本模块只产出「原始 HTML」（含 mdimg:// 协议、data-source-line 行号、KaTeX/高亮结果），
// 不含 DOMPurify 净化（净化留在主线程，复用既有的可信配置）。
// 主线程 parser.js 与 preview.worker.js 均复用本模块，避免重复实现并保持一致。

import MarkdownIt from 'markdown-it'
import markdownItAnchor from 'markdown-it-anchor'
import markdownItTaskLists from 'markdown-it-task-lists'
import markdownItTexMath from 'markdown-it-texmath'
import markdownItSub from 'markdown-it-sub'
import markdownItSup from 'markdown-it-sup'
import markdownItMark from 'markdown-it-mark'
import markdownItFootnote from 'markdown-it-footnote'
import markdownItContainer from 'markdown-it-container'
import markdownItDeflist from 'markdown-it-deflist'
import * as emojiPkg from 'markdown-it-emoji'
import hljs from 'highlight.js/lib/core'
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import python from 'highlight.js/lib/languages/python'
import java from 'highlight.js/lib/languages/java'
import c from 'highlight.js/lib/languages/c'
import cpp from 'highlight.js/lib/languages/cpp'
import css from 'highlight.js/lib/languages/css'
import xml from 'highlight.js/lib/languages/xml'
import json from 'highlight.js/lib/languages/json'
import bash from 'highlight.js/lib/languages/bash'
import sql from 'highlight.js/lib/languages/sql'
import yaml from 'highlight.js/lib/languages/yaml'
import mdLang from 'highlight.js/lib/languages/markdown'
import diff from 'highlight.js/lib/languages/diff'
import shell from 'highlight.js/lib/languages/shell'
import go from 'highlight.js/lib/languages/go'
import rust from 'highlight.js/lib/languages/rust'
import kotlin from 'highlight.js/lib/languages/kotlin'
import dart from 'highlight.js/lib/languages/dart'
import lua from 'highlight.js/lib/languages/lua'
import ini from 'highlight.js/lib/languages/ini'
import dockerfile from 'highlight.js/lib/languages/dockerfile'
import plaintext from 'highlight.js/lib/languages/plaintext'
import plantumlEncoder from 'plantuml-encoder'
import katex from 'katex'
import { extractFrontMatter, renderFrontMatter } from './frontMatter'

hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('js', javascript)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('ts', typescript)
hljs.registerLanguage('python', python)
hljs.registerLanguage('py', python)
hljs.registerLanguage('java', java)
hljs.registerLanguage('c', c)
hljs.registerLanguage('cpp', cpp)
hljs.registerLanguage('c++', cpp)
hljs.registerLanguage('css', css)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('html', xml)
hljs.registerLanguage('svg', xml)
hljs.registerLanguage('json', json)
hljs.registerLanguage('bash', bash)
hljs.registerLanguage('sh', bash)
hljs.registerLanguage('sql', sql)
hljs.registerLanguage('yaml', yaml)
hljs.registerLanguage('yml', yaml)
hljs.registerLanguage('markdown', mdLang)
hljs.registerLanguage('md', mdLang)
hljs.registerLanguage('diff', diff)
hljs.registerLanguage('shell', shell)
hljs.registerLanguage('go', go)
hljs.registerLanguage('rust', rust)
hljs.registerLanguage('kotlin', kotlin)
hljs.registerLanguage('dart', dart)
hljs.registerLanguage('lua', lua)
hljs.registerLanguage('ini', ini)
hljs.registerLanguage('toml', ini)
hljs.registerLanguage('dockerfile', dockerfile)
hljs.registerLanguage('plaintext', plaintext)
hljs.registerLanguage('text', plaintext)

let md = null
let mdKatexReady = false

function createMarkdownParser() {
  if (md) return md

  md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
    breaks: true,
    langPrefix: 'language-',
    highlight: function (str, lang) {
      if (lang === 'mermaid') {
        return `<div class="mermaid">${str}</div>`
      }
      if (lang === 'plantuml') {
        try {
          const encoded = plantumlEncoder.encode(str)
          return `<div class="plantuml-container"><img src="https://www.plantuml.com/plantuml/svg/${encoded}" alt="PlantUML diagram" class="plantuml-diagram" loading="lazy" /><details class="plantuml-source"><summary>PlantUML 源码</summary><pre><code>${md.utils.escapeHtml(str)}</code></pre></details></div>`
        } catch {
          return `<pre class="hljs"><code class="language-plantuml">${md.utils.escapeHtml(str)}</code></pre>`
        }
      }
      if (lang && hljs.getLanguage(lang)) {
        try {
          const highlighted = hljs.highlight(str, { language: lang, ignoreIllegals: true }).value
          return `<pre class="hljs"><code class="language-${lang}">${highlighted}</code></pre>`
        } catch (__) {}
      }
      return `<pre class="hljs"><code>${md.utils.escapeHtml(str)}</code></pre>`
    }
  })

  md.use(markdownItAnchor, {
    permalink: false,
    level: [1, 2, 3, 4, 5, 6],
    slugify: (s) => s.toLowerCase().replace(/[\s]+/g, '-').replace(/[^\w\u4e00-\u9fa5-]/g, '')
  })

  md.use(markdownItTaskLists, { enabled: true, label: true })
  md.use(markdownItSub)
  md.use(markdownItSup)
  md.use(markdownItMark)
  md.use(markdownItFootnote)

  const emojiPlugin = emojiPkg.full || emojiPkg.light || emojiPkg.bare
  if (emojiPlugin) md.use(emojiPlugin)

  md.use(markdownItDeflist)

  md.use(markdownItContainer, 'note', {
    render(tokens, idx) {
      if (tokens[idx].nesting === 1) {
        return '<div class="admonition admonition-note"><p class="admonition-title">📝 Note</p>\n'
      } else {
        return '</div>\n'
      }
    }
  })
  md.use(markdownItContainer, 'tip', {
    render(tokens, idx) {
      if (tokens[idx].nesting === 1) {
        return '<div class="admonition admonition-tip"><p class="admonition-title">💡 Tip</p>\n'
      } else {
        return '</div>\n'
      }
    }
  })
  md.use(markdownItContainer, 'warning', {
    render(tokens, idx) {
      if (tokens[idx].nesting === 1) {
        return '<div class="admonition admonition-warning"><p class="admonition-title">⚠ Warning</p>\n'
      } else {
        return '</div>\n'
      }
    }
  })
  md.use(markdownItContainer, 'danger', {
    render(tokens, idx) {
      if (tokens[idx].nesting === 1) {
        return '<div class="admonition admonition-danger"><p class="admonition-title">🔴 Danger</p>\n'
      } else {
        return '</div>\n'
      }
    }
  })

  injectSourceLine(md)
  injectTocRule(md)

  return md
}

// ── [TOC] 目录块 ──
function injectTocRule(md) {
  md.core.ruler.push('mdev_toc', (state) => {
    const tocIdx = state.tokens.findIndex(
      (t) => t.type === 'paragraph_open' &&
        state.tokens[state.tokens.indexOf(t) + 1]?.type === 'inline' &&
        /^\[toc\]$/i.test(state.tokens[state.tokens.indexOf(t) + 1].content.trim())
    )
    if (tocIdx === -1) return

    const headings = []
    for (let i = 0; i < state.tokens.length; i++) {
      const t = state.tokens[i]
      if (t.type === 'heading_open') {
        const inline = state.tokens[i + 1]
        if (inline?.type === 'inline') {
          headings.push({
            level: Number(t.tag.slice(1)),
            id: t.attrGet('id') || '',
            text: inline.content
          })
        }
      }
    }

    let html = '<nav class="md-toc"><p class="md-toc-title">目录</p>\n<ul>\n'
    let prev = 0
    for (const h of headings) {
      while (prev < h.level) { html += '<ul>\n'; prev++ }
      while (prev > h.level) { html += '</ul>\n'; prev-- }
      html += `<li><a href="#${h.id}">${md.utils.escapeHtml(h.text)}</a></li>\n`
    }
    while (prev > 0) { html += '</ul>\n'; prev-- }
    html += '</ul>\n</nav>\n'

    const inlineTok = state.tokens[tocIdx + 1]
    const tocToken = new state.Token('html_block', '', 0)
    tocToken.content = html
    tocToken.map = inlineTok.map || state.tokens[tocIdx].map
    state.tokens.splice(tocIdx, 3, tocToken)
  })
}

// ── 源码行号注入：data-source-line / data-source-line-end ──
function injectSourceLine(md) {
  const SL = 'data-source-line'
  const SLE = 'data-source-line-end'

  for (const name of Object.keys(md.renderer.rules)) {
    const orig = md.renderer.rules[name]
    if (!orig || orig._slWrapped) continue
    const wrapped = (tokens, idx, options, env, self) => {
      const token = tokens[idx]
      const out = orig(tokens, idx, options, env, self)
      if (token && token.map && typeof out === 'string' && out.startsWith('<')) {
        return out.replace(/^<([a-zA-Z][\w-]*)/, `<$1 ${SL}="${token.map[0] + 1}" ${SLE}="${token.map[1]}"`)
      }
      return out
    }
    wrapped._slWrapped = true
    md.renderer.rules[name] = wrapped
  }

  const origRenderToken = md.renderer.renderToken
  if (!origRenderToken._slWrapped) {
    const wrappedRenderToken = function (tokens, idx, options) {
      const token = tokens[idx]
      if (token && token.map && token.map.length > 0) {
        token.attrSet(SL, String(token.map[0] + 1))
        token.attrSet(SLE, String(token.map[1]))
      }
      return origRenderToken.call(this, tokens, idx, options)
    }
    wrappedRenderToken._slWrapped = true
    md.renderer.renderToken = wrappedRenderToken
  }
}

async function ensureKatexPlugin() {
  if (mdKatexReady) return
  if (!md) createMarkdownParser()
  // 注意：worker 内不能 import CSS（无 DOM），katex 样式由主线程 parser.js 静态引入，
  // 这里仅挂载 texmath 引擎（renderToString 产出 HTML 字符串，无需 DOM）。
  md.use(markdownItTexMath, {
    engine: katex,
    delimiters: ['dollars'],
    katexOptions: { throwOnError: false, output: 'html' }
  })
  // texmath 注册 math_block renderer 规则在首次注入之后，需再注入一次（幂等）
  injectSourceLine(md)
  mdKatexReady = true
}

// ── 解析相对图片路径为 file:// 绝对路径（mdimg:// 自定义协议）──
function resolvePathStr(base, relative) {
  const norm = (p) => p.replace(/\\/g, '/').replace(/\/+$/, '')
  const baseParts = norm(base).split('/')
  const relParts = norm(relative).split('/')
  for (const part of relParts) {
    if (part === '.' || part === '') continue
    if (part === '..') { baseParts.pop(); continue }
    baseParts.push(part)
  }
  return baseParts.join('/')
}

function resolveImagePaths(content, context) {
  const basePath = context?.filePath
    ? context.filePath.replace(/[\\/][^\\/]+$/, '')
    : context?.projectRoot || ''
  if (!basePath) return content

  return content.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, path) => {
    if (/^(https?:|file:|data:)/i.test(path.trim())) return match
    const abs = resolvePathStr(basePath, path.trim())
    if (!abs) return match
    const fileUrl = 'mdimg:///' + abs.replace(/^\/+/, '').replace(/\\/g, '/')
    return `![${alt}](${fileUrl})`
  })
}

// ── 纯解析：返回「原始 HTML」（未净化），可在 Worker 中调用 ──
export async function renderRawMarkdown(content, context = {}) {
  if (!content) return ''

  const parser = createMarkdownParser()
  let processed = resolveImagePaths(content, context)

  const fm = extractFrontMatter(processed)
  if (fm) processed = fm.placeholder + fm.body

  const hasLatex = /\$[^$]+\$|\$\$[^$]+\$\$/.test(processed)
  if (hasLatex) {
    await ensureKatexPlugin()
  }

  let html = parser.render(processed)
  if (fm) html = renderFrontMatter(fm.meta) + html
  return html
}
