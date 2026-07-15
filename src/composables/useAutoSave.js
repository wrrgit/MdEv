import { watch, ref } from 'vue'
import { useEditorStore } from '@/stores/editorStore'

export function useAutoSave() {
  const store = useEditorStore()
  const saveStatus = ref('saved')
  let saveTimer = null

  function startAutoSave() {
    watch(
      () => store.activeTab?.content,
      (newContent, oldContent) => {
        if (newContent === oldContent) return
        if (!store.activeTab) return

        saveStatus.value = 'unsaved'

        if (saveTimer) clearTimeout(saveTimer)

        const interval = (store.settings.autoSaveInterval || 3) * 1000
        saveTimer = setTimeout(async () => {
          await doSave()
        }, interval)
      },
      { deep: true }
    )
  }

  async function doSave() {
    const tab = store.activeTab
    if (!tab) return { success: false }

    saveStatus.value = 'saving'

    if (tab.filePath) {
      const result = await window.api?.writeFile(tab.filePath, tab.content)
      if (result?.success) {
        store.markAsSaved()
        saveStatus.value = 'saved'
        return { success: true }
      } else {
        saveStatus.value = 'unsaved'
        return { success: false, error: result?.error }
      }
    } else {
      // No file path - need "Save As"
      const filePath = await window.api?.saveFileDialog(tab.fileName)
      if (filePath) {
        const result = await window.api?.writeFile(filePath, tab.content)
        if (result?.success) {
          tab.filePath = filePath
          const name = filePath.split(/[\\/]/).pop()
          tab.fileName = name
          store.markAsSaved()
          saveStatus.value = 'saved'
          store.addRecentFile(filePath)
          return { success: true }
        }
      }
      saveStatus.value = 'unsaved'
      return { success: false }
    }
  }

  async function saveNow() {
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
    return await doSave()
  }

  async function saveAs() {
    const tab = store.activeTab
    if (!tab) return

    const filePath = await window.api?.saveFileDialog(tab.fileName)
    if (filePath) {
      const result = await window.api?.writeFile(filePath, tab.content)
      if (result?.success) {
        tab.filePath = filePath
        const name = filePath.split(/[\\/]/).pop()
        tab.fileName = name
        store.markAsSaved()
        saveStatus.value = 'saved'
        store.addRecentFile(filePath)
        return { success: true }
      }
    }
    return { success: false }
  }

  function stopAutoSave() {
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
  }

  return {
    saveStatus,
    startAutoSave,
    stopAutoSave,
    saveNow,
    saveAs
  }
}
