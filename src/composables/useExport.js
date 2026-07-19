import { ref } from 'vue'
import { useEditorStore } from '@/stores/editorStore'
import { parseMarkdown } from '@/core/markdown/parser'

export function useExport() {
  const store = useEditorStore()
  const isExporting = ref(false)
  const exportProgress = ref('')

  // 把当前 tab 的 markdown 渲染成已净化的 HTML（含代码高亮、katex 公式）
  // 注意：必须传渲染后的 HTML，而非原始 markdown 文本，否则导出内容是源码而非渲染结果
  function getRenderedHtml() {
    const content = store.activeTab?.content || ''
    if (!content) return ''
    return parseMarkdown(content)
  }

  function getBaseName() {
    return store.activeTab?.fileName?.replace(/\.md$/i, '') || 'export'
  }

  async function exportPdf(options = {}) {
    isExporting.value = true
    exportProgress.value = '正在生成 PDF...'

    try {
      const content = getRenderedHtml()
      if (!content) {
        exportProgress.value = '没有内容可导出'
        return { success: false, error: 'No content to export' }
      }

      const result = await window.api?.exportPdf({
        pageSize: options.pageSize || 'A4',
        marginTop: options.marginTop || 0.75,
        marginBottom: options.marginBottom || 0.75,
        marginLeft: options.marginLeft || 0.75,
        marginRight: options.marginRight || 0.75,
        defaultPath: getBaseName() + '.pdf',
        content,
        theme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
      })

      if (result?.success) {
        exportProgress.value = 'PDF 导出成功'
        return { success: true, filePath: result.filePath }
      } else if (result?.canceled) {
        exportProgress.value = '已取消'
        return { success: false, canceled: true }
      } else {
        exportProgress.value = '导出失败: ' + (result?.error || '未知错误')
        return { success: false, error: result?.error }
      }
    } catch (err) {
      exportProgress.value = '导出失败: ' + err.message
      return { success: false, error: err.message }
    } finally {
      isExporting.value = false
    }
  }

  async function exportHtml(options = {}) {
    isExporting.value = true
    exportProgress.value = '正在生成 HTML...'

    try {
      const content = getRenderedHtml()
      if (!content) {
        exportProgress.value = '没有内容可导出'
        return { success: false, error: 'No content to export' }
      }

      const result = await window.api?.exportHtml({
        defaultPath: getBaseName() + '.html',
        content,
        theme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
      })

      if (result?.success) {
        exportProgress.value = 'HTML 导出成功'
        return { success: true, filePath: result.filePath }
      } else if (result?.canceled) {
        exportProgress.value = '已取消'
        return { success: false, canceled: true }
      } else {
        exportProgress.value = '导出失败: ' + (result?.error || '未知错误')
        return { success: false, error: result?.error }
      }
    } catch (err) {
      exportProgress.value = '导出失败: ' + err.message
      return { success: false, error: err.message }
    } finally {
      isExporting.value = false
    }
  }

  return {
    isExporting,
    exportProgress,
    exportPdf,
    exportHtml
  }
}
