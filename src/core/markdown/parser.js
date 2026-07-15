import MarkdownIt from 'markdown-it'
import markdownItAnchor from 'markdown-it-anchor'
import markdownItTaskLists from 'markdown-it-task-lists'
import markdownItTexMath from 'markdown-it-texmath'
import DOMPurify from 'dompurify'
import hljs from 'highlight.js'
import katex from 'katex'
import 'katex/dist/katex.min.css'

let md = null

function createMarkdownParser() {
  if (md) return md

  md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
    breaks: false,
    langPrefix: 'language-',
    highlight: function (str, lang) {
      if (lang === 'mermaid') {
        return `<div class="mermaid">${str}</div>`
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

  md.use(markdownItTexMath, {
    engine: katex,
    delimiters: ['dollars'],
    katexOptions: { throwOnError: false, output: 'html' }
  })

  return md
}

function preprocessMermaid(content) {
  // Mermaid blocks are handled in the highlight function
  return content
}

export function parseMarkdown(content) {
  if (!content) return '<p style="color: var(--text-muted);">开始写作...</p>'

  try {
    const parser = createMarkdownParser()
    const processed = preprocessMermaid(content)
    let html = parser.render(processed)

    // Sanitize HTML
    html = DOMPurify.sanitize(html, {
      ADD_TAGS: ['math', 'semantics', 'annotation', 'mrow', 'mi', 'mo', 'mn', 'msup', 'msub', 'mfrac', 'msqrt', 'mover', 'munder', 'mtable', 'mtr', 'mtd'],
      ADD_ATTR: ['xmlns', 'data-*', 'aria-*']
    })

    return html
  } catch (err) {
    return `<p style="color: #e74c3c;">渲染错误: ${err.message}</p>`
  }
}
