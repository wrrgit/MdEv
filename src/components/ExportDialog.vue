<template>
  <div class="export-overlay" v-if="store.showExport" @click.self="close">
    <div class="export-dialog">
      <div class="export-header">
        <h2>导出</h2>
        <button class="close-btn" @click="close">✕</button>
      </div>

      <div class="export-body">
        <div class="export-options">
          <div class="export-type">
            <button
              class="type-btn"
              :class="{ active: exportType === 'pdf' }"
              @click="exportType = 'pdf'"
            >
              <span class="type-icon">📄</span>
              <span>PDF</span>
            </button>
            <button
              class="type-btn"
              :class="{ active: exportType === 'html' }"
              @click="exportType = 'html'"
            >
              <span class="type-icon">🌐</span>
              <span>HTML</span>
            </button>
          </div>

          <div class="export-settings">
            <div v-if="exportType === 'pdf'" class="pdf-settings">
              <div class="form-group">
                <label>纸张大小</label>
                <select v-model="pdfOptions.pageSize">
                  <option value="A4">A4</option>
                  <option value="Letter">Letter</option>
                  <option value="A3">A3</option>
                </select>
              </div>
              <div class="form-group">
                <label>边距 (inch)</label>
                <div class="row">
                  <input type="number" v-model.number="pdfOptions.marginTop" step="0.1" min="0" max="2" placeholder="上" />
                  <input type="number" v-model.number="pdfOptions.marginBottom" step="0.1" min="0" max="2" placeholder="下" />
                  <input type="number" v-model.number="pdfOptions.marginLeft" step="0.1" min="0" max="2" placeholder="左" />
                  <input type="number" v-model.number="pdfOptions.marginRight" step="0.1" min="0" max="2" placeholder="右" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="export-preview">
          <span class="preview-label">预览内容</span>
          <div class="preview-content">
            <div class="markdown-body" v-html="previewHtml"></div>
          </div>
        </div>
      </div>

      <div class="export-status" v-if="exportStatus">
        {{ exportStatus }}
      </div>

      <div class="export-footer">
        <button class="btn btn-secondary" @click="close">取消</button>
        <button class="btn btn-primary" @click="doExport" :disabled="isExporting">
          {{ isExporting ? '导出中...' : `导出 ${exportType.toUpperCase()}` }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useEditorStore } from '@/stores/editorStore'
import { useExport } from '@/composables/useExport'
import { parseMarkdown } from '@/core/markdown/parser'

const store = useEditorStore()
const { isExporting, exportProgress, exportPdf, exportHtml } = useExport()

const exportType = ref(store.exportFormat || 'pdf')
const exportStatus = ref('')

const pdfOptions = ref({
  pageSize: 'A4',
  marginTop: 0.75,
  marginBottom: 0.75,
  marginLeft: 0.75,
  marginRight: 0.75
})

const previewHtml = computed(() => {
  return parseMarkdown(store.activeTab?.content || '')
})

async function doExport() {
  exportStatus.value = ''

  let result
  switch (exportType.value) {
    case 'pdf':
      result = await exportPdf(pdfOptions.value)
      break
    case 'html':
      result = await exportHtml()
      break
  }

  if (result?.success) {
    exportStatus.value = `✅ 导出成功: ${result.filePath}`
  } else if (result?.canceled) {
    exportStatus.value = '已取消'
  } else {
    exportStatus.value = `❌ 导出失败: ${result?.error || '未知错误'}`
  }
}

function close() {
  store.showExport = false
}
</script>

<style scoped>
.export-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(0,0,0,0.4);
  display: flex;
  align-items: center;
  justify-content: center;
}
.export-dialog {
  width: 740px;
  max-height: 85vh;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0,0,0,0.3);
}
.export-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  border-bottom: 1px solid var(--border-color);
}
.export-header h2 { margin: 0; font-size: 18px; }
.close-btn {
  border: none; background: transparent;
  font-size: 18px; color: var(--text-muted);
  cursor: pointer; padding: 4px 8px; border-radius: 4px;
}
.close-btn:hover { background: var(--hover-bg); }
.export-body {
  display: flex;
  gap: 24px;
  padding: 24px;
  overflow: hidden;
  flex: 1;
}
.export-options { width: 300px; flex-shrink: 0; }
.export-type {
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
}
.type-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 12px 8px;
  border: 2px solid var(--border-color);
  background: var(--bg-secondary);
  border-radius: 8px;
  cursor: pointer;
  font-size: 12px;
  color: var(--text-secondary);
  transition: all 0.15s;
}
.type-btn:hover { border-color: var(--accent-color); color: var(--text-primary); }
.type-btn.active { border-color: var(--accent-color); color: var(--accent-color); background: var(--accent-color)10; }
.type-icon { font-size: 24px; }
.export-settings { }
.form-group { margin-bottom: 16px; }
.form-group label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: 500;
}
.form-group select,
.form-group input[type="number"] {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 13px;
}
.row { display: flex; gap: 8px; }
.row input { width: 60px; text-align: center; }
.export-preview {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.preview-label {
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 8px;
}
.preview-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-primary);
}
.export-status {
  padding: 8px 24px;
  font-size: 13px;
  color: var(--text-secondary);
  border-top: 1px solid var(--border-color);
}
.export-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px 24px;
  border-top: 1px solid var(--border-color);
}
.btn {
  padding: 8px 20px;
  border-radius: 6px;
  border: 1px solid var(--border-color);
  cursor: pointer;
  font-size: 13px;
}
.btn-primary { background: var(--accent-color); color: #fff; border-color: var(--accent-color); }
.btn-secondary { background: var(--bg-secondary); color: var(--text-primary); }
.btn:disabled { opacity: 0.6; cursor: not-allowed; }
</style>
