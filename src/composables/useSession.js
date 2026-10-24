// 会话恢复：退出前记录打开的标签（仅元数据，不存正文），下次启动并发读回内容
// 性能取舍：文件正文不写入会话，运行时并行读取（上限 30 个标签），避免大文件拖慢启动
import { watch } from 'vue'
import { useEditorStore } from '@/stores/editorStore'

const MAX_RESTORE_TABS = 30
const PERSIST_DELAY = 800

export function useSession() {
  const store = useEditorStore()
  let timer = null

  function snapshot() {
    if (store.restoringSession) return
    window.api?.setSettings({
      session: {
        tabs: store.tabs.map(t => ({
          filePath: t.filePath,
          fileName: t.fileName,
          draftId: t.filePath ? null : t.id,
          hasDraft: !!t.hasDraft
        })),
        activeIndex: Math.max(0, store.tabs.findIndex(t => t.id === store.activeTabId)),
        projectRoot: store.projectRoot
      }
    })
  }

  // 防抖持久化：输入时 isDirty 变化频繁，合并写入
  function startPersistSession() {
    const schedule = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(snapshot, PERSIST_DELAY)
    }
    watch(() => store.tabs.map(t => `${t.id}|${t.filePath}|${t.fileName}|${t.hasDraft}`), schedule)
    watch(() => store.activeTabId, schedule)
    watch(() => store.projectRoot, schedule)
    // 关闭窗口前立即落盘，避免防抖未触发
    window.addEventListener('beforeunload', () => {
      if (timer) clearTimeout(timer)
      snapshot()
    })
  }

  // 返回是否有标签被恢复
  async function restoreSession() {
    const s = store.savedSession
    if (!s) return false
    store.restoringSession = true
    try {
      // 项目根目录（同时恢复文件树）
      if (s.projectRoot) {
        const r = await window.api?.readDirectory(s.projectRoot)
        if (r?.success) {
          store.collapseAllPaths()
          store.fileTree = r.tree
          store.setProjectRoot(s.projectRoot)
          store.expandPath(s.projectRoot)
        }
      }

      const items = (s.tabs || []).slice(0, MAX_RESTORE_TABS)
      const loaded = await Promise.all(items.map(async (it) => {
        if (it.filePath) {
          const r = await window.api?.readFile(it.filePath)
          return r?.success ? { ...it, content: r.content } : null
        }
        if (it.draftId) {
          const r = await window.api?.readDraft(it.draftId)
          if (r?.success && typeof r.content === 'string') return { ...it, content: r.content }
          return null
        }
        return null
      }))

      let missing = 0
      const ids = []
      loaded.forEach((it) => {
        if (!it) { missing++; return }
        if (it.filePath) {
          ids.push(store.addTab(it.filePath, it.content, it.fileName))
        } else {
          ids.push(store.restoreTab({ id: it.draftId, fileName: it.fileName, content: it.content, hasDraft: !!it.hasDraft }))
        }
      })

      // 还原上次的活动标签
      const targetId = ids[s.activeIndex ?? 0]
      if (targetId) store.setActiveTab(targetId)

      if (missing > 0) {
        store.notifyFileChange(`已跳过 ${missing} 个无法恢复的文件（可能已移动或删除）`)
      }
      return true
    } finally {
      store.restoringSession = false
    }
  }

  return { startPersistSession, restoreSession }
}
