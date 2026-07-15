import hljs from 'highlight.js'
import 'highlight.js/styles/github.css'

export function setupHighlighter() {
  // Register custom languages if needed
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
