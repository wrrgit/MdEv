import { ref } from 'vue'
import { useEditorStore } from '@/stores/editorStore'

export function useSearch() {
  const store = useEditorStore()
  const query = ref('')
  const results = ref([])
  const isSearching = ref(false)
  const scope = ref('file')

  async function search() {
    if (!query.value.trim()) {
      results.value = []
      return
    }

    isSearching.value = true

    if (scope.value === 'file') {
      // File search is handled by CodeMirror's built-in search
      // Just trigger it via the editor
      const editor = window.editorRef?.editorView
      if (editor) {
        editor.dispatch({
          effects: EditorView.scrollIntoView(editor.state.selection.main.head)
        })
      }
      results.value = []
    } else {
      // Cross-file search via IPC
      if (!store.projectRoot) {
        results.value = []
        isSearching.value = false
        return
      }

      try {
        const result = await window.api?.searchInProject(
          store.projectRoot,
          query.value,
          { caseSensitive: false, wholeWord: false }
        )
        if (result?.success) {
          results.value = result.results
        }
      } catch (err) {
        results.value = []
      }
    }

    isSearching.value = false
  }

  function clearSearch() {
    query.value = ''
    results.value = []
  }

  return {
    query,
    results,
    isSearching,
    scope,
    search,
    clearSearch
  }
}
