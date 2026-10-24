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
        // 外部重载触发的内容变化不需要自动保存（内容已与磁盘一致）
        if (store.suppressAutoSave) return

        saveStatus.value = 'unsaved'

        if (saveTimer) clearTimeout(saveTimer)

        const interval = (store.settings.autoSaveInterval || 3) * 1000
        saveTimer = setTimeout(async () => {
          // 自动保存：未命名文档写临时草稿，不弹"另存为"对话框
          await doSave({ silent: true })
        }, interval)
      },
      { deep: true }
    )
  }

  async function doSave({ silent = false } = {}) {
    const tab = store.activeTab
    if (!tab) return { success: false }

    saveStatus.value = 'saving'

    if (tab.filePath) {
      store.markAppSave()
      const result = await window.api?.writeFile(tab.filePath, tab.content)
      if (result?.success) {
        store.markAsSaved()
        saveStatus.value = 'saved'
        return { success: true }
      } else {
        saveStatus.value = 'unsaved'
        return { success: false, error: result?.error }
      }
    }

    // 未命名文档：自动保存静默写入草稿文件
    if (silent) {
      const r = await window.api?.saveDraft(tab.id, tab.content)
      if (r?.success) {
        tab.hasDraft = true
        // 草稿已落盘，清除未保存圆点（关闭时仍按 hasDraft 询问是否保存为正式文件）
        tab.isDirty = false
      }
      saveStatus.value = r?.success ? 'draft' : 'unsaved'
      return { success: !!r?.success, draft: true }
    }

    // 显式保存：弹窗确认路径与文件名
    const filePath = await window.api?.saveFileDialog(tab.fileName)
    if (filePath) {
      store.markAppSave()
      const result = await window.api?.writeFile(filePath, tab.content)
      if (result?.success) {
        tab.filePath = filePath
        const name = filePath.split(/[\\/]/).pop()
        tab.fileName = name
        store.markAsSaved()
        saveStatus.value = 'saved'
        store.addRecentFile(filePath)
        await window.api?.deleteDraft(tab.id)
        tab.hasDraft = false
        return { success: true }
      }
    }
    saveStatus.value = 'unsaved'
    return { success: false }
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
      store.markAppSave()
      const result = await window.api?.writeFile(filePath, tab.content)
      if (result?.success) {
        tab.filePath = filePath
        const name = filePath.split(/[\\/]/).pop()
        tab.fileName = name
        store.markAsSaved()
        saveStatus.value = 'saved'
        store.addRecentFile(filePath)
        await window.api?.deleteDraft(tab.id)
        tab.hasDraft = false
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
