// ── 文件打开统一入口 + 大文件守卫 ──
// 对标 VS Code 的「大文件模式」：超过阈值（20MB）弹出确认框，避免误开巨文件卡死主线程。
// 模块级单例：App.vue 负责挂载确认弹窗，EditorPane / PreviewPane 复用 openFile 逻辑。
//
// 设计要点：
// - 所有用户主动打开（对话框 / 拖拽 / 最近文件 / 文件关联）统一走 openFile，避免守卫逻辑散落各调用点。
// - 超大文件（>150MB）主进程只读取前 20MB（truncated），渲染端标记为只读、禁止保存，避免写回破坏原文件。
// - 外部变更自动重载（App.vue onExternalFileChange）不弹确认，属后台静默行为。

import { ref, computed } from 'vue'
import { useEditorStore } from '@/stores/editorStore'
import { formatBytes } from '@/core/perf'

const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'ico', 'avif']

function fileNameOf(p) {
  return p ? p.split(/[\\/]/).pop() : ''
}

// 确认弹窗状态（模块级单例，跨组件共享）
const showLargeConfirm = ref(false)
const pendingFile = ref(null) // { path, fileName, size, truncated, truncatedBytes, content }

async function readFileRaw(filePath) {
  return await window.api.readFile(filePath)
}

// 真正把文件落进标签页（写入 content + 标记大文件只读 + 刷新最近记录）
function finalizeOpen(filePath, result) {
  const store = useEditorStore()
  const id = store.addTab(filePath, result.content, fileNameOf(filePath))
  const tab = store.tabs.find(t => t.id === id)
  if (tab) {
    if (result.isLarge || result.truncated) {
      tab.isLargeFile = true
      if (result.truncated) tab.truncatedBytes = result.truncatedBytes
    }
  }
  store.addRecentFile(filePath)
}

// 打开文件（统一入口）。showConfirm=false 用于二级打开（如预览区点击链接），跳过确认直接打开。
async function openFile(filePath, { showConfirm = true } = {}) {
  if (!filePath) return
  const store = useEditorStore()
  const ext = filePath.toLowerCase().match(/\.([^.]+)$/)?.[1] || ''
  if (IMAGE_EXTS.includes(ext)) {
    await window.api.openPath(filePath)
    return
  }
  const result = await readFileRaw(filePath)
  if (!result?.success) {
    store.notifyFileChange('打开失败：' + (result?.error || '未知错误'))
    return
  }
  const isLarge = result.isLarge || result.truncated
  if (isLarge && showConfirm) {
    pendingFile.value = {
      path: filePath,
      fileName: fileNameOf(filePath),
      size: result.size,
      truncated: result.truncated,
      truncatedBytes: result.truncatedBytes,
      content: result.content
    }
    showLargeConfirm.value = true
    return
  }
  finalizeOpen(filePath, result)
}

function confirmLargeOpen() {
  const p = pendingFile.value
  showLargeConfirm.value = false
  if (p) {
    finalizeOpen(p.path, {
      success: true,
      content: p.content,
      size: p.size,
      isLarge: true,
      truncated: p.truncated,
      truncatedBytes: p.truncatedBytes
    })
  }
  pendingFile.value = null
}

function cancelLargeOpen() {
  showLargeConfirm.value = false
  pendingFile.value = null
}

const largeFileSizeText = computed(() => pendingFile.value ? formatBytes(pendingFile.value.size) : '')
const truncatedText = computed(() => {
  const p = pendingFile.value
  if (!p || !p.truncated) return ''
  return `仅读取前 ${formatBytes(p.truncatedBytes)}（文件共 ${formatBytes(p.size)}）`
})

export function useOpenFile() {
  return {
    openFile,
    confirmLargeOpen,
    cancelLargeOpen,
    showLargeConfirm,
    pendingFile,
    largeFileSizeText,
    truncatedText
  }
}
