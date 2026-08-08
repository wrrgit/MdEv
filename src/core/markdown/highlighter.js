import hljs from 'highlight.js/lib/core'
import 'highlight.js/styles/github.css'

export function setupHighlighter() {
  return hljs
}

export function highlightCode(code, language) {
  if (language && hljs.getLanguage(language)) {
    try {
      return hljs.highlight(code, { language, ignoreIllegals: true }).value
    } catch {
      return null
    }
  }
  return null
}

export { hljs }
