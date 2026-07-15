import { computed } from 'vue'
import { useEditorStore } from '@/stores/editorStore'

export function useToc() {
  const store = useEditorStore()

  const tocItems = computed(() => {
    if (!store.activeTab) return []

    const lines = store.content.split('\n')
    const items = []

    lines.forEach((line, index) => {
      const match = line.match(/^(#{1,6})\s+(.+)$/)
      if (match) {
        items.push({
          level: match[1].length,
          text: match[2].trim(),
          line: index + 1
        })
      }
    })

    return items
  })

  function jumpToHeading(line) {
    const editor = window.editorRef?.editorView
    if (!editor) return

    try {
      const docLine = editor.state.doc.line(line)
      editor.dispatch({
        selection: { anchor: docLine.from },
        scrollIntoView: true
      })
      editor.focus()
    } catch {
      // Line might not exist
    }
  }

  return {
    tocItems,
    jumpToHeading
  }
}
