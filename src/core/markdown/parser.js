import MarkdownIt from 'markdown-it'
import markdownItAnchor from 'markdown-it-anchor'
import markdownItTaskLists from 'markdown-it-task-lists'
import markdownItTexMath from 'markdown-it-texmath'
import markdownItSub from 'markdown-it-sub'
import markdownItSup from 'markdown-it-sup'
import markdownItMark from 'markdown-it-mark'
import markdownItFootnote from 'markdown-it-footnote'
import markdownItContainer from 'markdown-it-container'
import DOMPurify from 'dompurify'
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
import { extractFrontMatter, renderFrontMatter } from './frontMatter'
import 'highlight.js/styles/github.css'

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

let katexModule = null

async function loadKatex() {
  if (katexModule) return katexModule
  katexModule = (await import('katex')).default
  return katexModule
}

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

  // 下标、上标、高亮
  md.use(markdownItSub)
  md.use(markdownItSup)
  md.use(markdownItMark)

  // 脚注
  md.use(markdownItFootnote)

  // Admonition / Callout 容器
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

  // 注入源码行号（fence / container 等规则此刻已注册）
  injectSourceLine(md)

  return md
}

// ── 源码行号注入：为块级元素添加 data-source-line，用于滚动同步与 TOC 高亮 ──
// 两条路径：
// 1. 返回原始 HTML 的 renderer 规则（fence / html_block / container / texmath）→ 正则注入
// 2. renderToken 默认路径的块级 token（*_open / hr）→ attrSet（幂等，可重复调用）
function injectSourceLine(md) {
  const SL = 'data-source-line'

  for (const name of Object.keys(md.renderer.rules)) {
    const orig = md.renderer.rules[name]
    if (!orig || orig._slWrapped) continue
    const wrapped = (tokens, idx, options, env, self) => {
      const token = tokens[idx]
      const out = orig(tokens, idx, options, env, self)
      if (token && token.map && typeof out === 'string' && out.startsWith('<')) {
        return out.replace(/^<([a-zA-Z][\w-]*)/, `<$1 ${SL}="${token.map[0]}"`)
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
        token.attrSet(SL, String(token.map[0]))
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
  const katex = await loadKatex()
  await import('katex/dist/katex.min.css')
  md.use(markdownItTexMath, {
    engine: katex,
    delimiters: ['dollars'],
    katexOptions: { throwOnError: false, output: 'html' }
  })
  // texmath 注册 math_block renderer 规则在首次注入之后，需再注入一次（幂等）
  injectSourceLine(md)
  mdKatexReady = true
}

// ── 解析相对图片路径为 file:// 绝对路径 ──
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
    // 跳过已经是绝对 URL 的路径
    if (/^(https?:|file:|data:)/i.test(path.trim())) return match
    // 解析相对路径
    const abs = resolvePathStr(basePath, path.trim())
    if (!abs) return match
    // 转换为 mdimg:// URL (自定义协议，由主进程处理)
    const fileUrl = 'mdimg:///' + abs.replace(/^\/+/, '').replace(/\\/g, '/')
    return `![${alt}](${fileUrl})`
  })
}

export async function parseMarkdown(content, context = {}) {
  if (!content) return '<p style="color: var(--text-muted);">开始写作...</p>'

  try {
    const parser = createMarkdownParser()

    // 解析相对图片路径
    let processed = resolveImagePaths(content, context)

    // 提取 YAML front-matter：预览渲染为属性表格，等量空行占位保持行号映射
    const fm = extractFrontMatter(processed)
    if (fm) processed = fm.placeholder + fm.body

    const hasLatex = /\$[^$]+\$|\$\$[^$]+\$\$/.test(processed)
    if (hasLatex) {
      await ensureKatexPlugin()
    }

    let html = parser.render(processed)

    if (fm) html = renderFrontMatter(fm.meta) + html

    html = DOMPurify.sanitize(html, {
      ADD_TAGS: ['math', 'semantics', 'annotation', 'mrow', 'mi', 'mo', 'mn', 'msup', 'msub', 'mfrac', 'msqrt', 'mover', 'munder', 'mtable', 'mtr', 'mtd', 'details', 'summary'],
      ADD_ATTR: ['xmlns', 'data-*', 'aria-*', 'loading', 'class', 'src', 'alt', 'title'],
      // 放行自定义 mdimg:// 本地图片协议（默认白名单不含它，src 会被剥掉导致图片不显示）
      ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|callto|sms|cid|xmpp|matrix|ftp|ftps|mdimg|data|blob):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i
    })

    return html
  } catch (err) {
    return `<p style="color: #e74c3c;">渲染错误: ${err.message}</p>`
  }
}
