import { ref, watch, onUnmounted } from 'vue'
import { useEditorStore } from '@/stores/editorStore'

export function useScrollSync() {
  const store = useEditorStore()
  const editorScrollPercent = ref(0)
  const previewScrollPercent = ref(0)
  let isSyncing = false

  function onEditorScroll(percent) {
    if (isSyncing || !store.settings.scrollSync) return
    isSyncing = true
    editorScrollPercent.value = percent
    // Preview pane will read this value and scroll accordingly
    isSyncing = false
  }

  function onPreviewScroll(percent) {
    if (isSyncing || !store.settings.scrollSync) return
    isSyncing = true
    previewScrollPercent.value = percent
    // Editor will read this value and scroll accordingly
    isSyncing = false
  }

  function stopSync() {
    isSyncing = false
  }

  return {
    editorScrollPercent,
    previewScrollPercent,
    onEditorScroll,
    onPreviewScroll,
    stopSync
  }
}
