// 关闭标签前的未保存确认
// 未命名文档（自动保存到草稿、但从未 Ctrl+S 落盘）关闭时询问：保存 / 不保存 / 取消
import { useEditorStore } from '@/stores/editorStore'

export function useTabClose() {
  const store = useEditorStore()

  async function requestCloseTab(tabId) {
    const tab = store.tabs.find(t => t.id === tabId)
    if (!tab) return

    if (!tab.filePath && tab.hasDraft) {
      const choice = await window.api?.confirmUnsaved(tab.fileName)
      if (choice === 'cancel' || !choice) return

      if (choice === 'save') {
        const filePath = await window.api?.saveFileDialog(tab.fileName)
        // 用户在保存对话框里取消 → 中止关闭
        if (!filePath) return
        store.markAppSave()
        const r = await window.api?.writeFile(filePath, tab.content)
        if (!r?.success) return
        store.addRecentFile(filePath)
        await window.api?.deleteDraft(tabId)
        store.markAsSaved()
        tab.filePath = filePath
        tab.fileName = filePath.split(/[\\/]/).pop()
        tab.hasDraft = false
      } else {
        await window.api?.deleteDraft(tabId)
      }
    }

    store.closeTab(tabId)
  }

  return { requestCloseTab }
}
