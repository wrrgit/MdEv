import { ref } from 'vue'
import { useEditorStore } from '@/stores/editorStore'

export function useExport() {
  const store = useEditorStore()
  const isExporting = ref(false)
  const exportProgress = ref('')

  async function exportPdf(options = {}) {
    isExporting.value = true
    exportProgress.value = '正在生成 PDF...'

    try {
      document.documentElement.classList.add('print-export')

      const result = await window.api?.exportPdf({
        pageSize: options.pageSize || 'A4',
        ...options
      })

      document.documentElement.classList.remove('print-export')

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
      document.documentElement.classList.remove('print-export')
      exportProgress.value = '导出失败: ' + err.message
      return { success: false, error: err.message }
    } finally {
      isExporting.value = false
    }
  }

  async function exportImage(options = {}) {
    isExporting.value = true
    exportProgress.value = '正在生成图片...'

    try {
      const previewEl = document.querySelector('.markdown-body')
      if (!previewEl) {
        exportProgress.value = '预览区不可用'
        return { success: false, error: 'Preview not available' }
      }

      const html2canvas = (await import('html2canvas')).default

      // Capture preview area
      const canvas = await html2canvas(previewEl, {
        backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--bg-primary').trim() || '#ffffff',
        scale: options.scale || 2,
        useCORS: true,
        logging: false
      })

      const dataUrl = canvas.toDataURL('image/png')
      const defaultName = store.activeTab?.fileName?.replace(/\.md$/, '') + '.png' || 'export.png'

      const result = await window.api?.exportImage(dataUrl, defaultName)
      if (result?.success) {
        exportProgress.value = '图片导出成功'
        return { success: true, filePath: result.filePath }
      } else {
        exportProgress.value = '已取消'
        return { success: false, canceled: true }
      }
    } catch (err) {
      exportProgress.value = '导出失败: ' + err.message
      return { success: false, error: err.message }
    } finally {
      isExporting.value = false
    }
  }

  async function exportZip(options = {}) {
    isExporting.value = true
    exportProgress.value = '正在打包...'

    try {
      const defaultName = store.projectRoot?.split(/[\\/]/).pop() + '.zip' || 'project.zip'

      const result = await window.api?.exportZip(
        store.projectRoot,
        defaultName,
        options.include || ['*']
      )

      if (result?.success) {
        exportProgress.value = 'ZIP 导出成功'
        return { success: true, filePath: result.filePath }
      } else {
        exportProgress.value = '已取消'
        return { success: false, canceled: true }
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
    exportImage,
    exportZip
  }
}
