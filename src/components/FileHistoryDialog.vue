<template>
  <teleport to="body">
    <div v-if="store.showHistory" class="fh-overlay" @click.self="close">
      <div class="fh-panel">
        <div class="fh-header">
          <h2>文件历史</h2>
          <span class="fh-file" :title="filePath">{{ fileName }}</span>
          <button class="fh-close" @click="close">✕</button>
        </div>

        <div class="fh-body">
          <div class="fh-list">
            <div v-if="!filePath" class="fh-empty">当前没有已保存到磁盘的文件</div>
            <div v-else-if="loading" class="fh-empty">加载中…</div>
            <div v-else-if="snapshots.length === 0" class="fh-empty">
              暂无快照<br /><small>保存文件后会自动生成快照（每分钟最多一份）</small>
            </div>
            <div
              v-for="s in snapshots"
              :key="s.ts"
              class="fh-item"
              :class="{ active: selected?.ts === s.ts }"
              @click="select(s)"
            >
              <span class="fh-time">{{ formatTime(s.ts) }}</span>
              <span class="fh-size">{{ formatSize(s.size) }}</span>
            </div>
          </div>

          <div class="fh-preview">
            <template v-if="previewContent !== null">
              <pre class="fh-content">{{ previewContent }}</pre>
              <div class="fh-actions">
                <button class="btn btn-secondary" @click="openInFolder">打开快照目录</button>
                <button class="btn btn-primary" :disabled="restoring" @click="restore">
                  {{ restoring ? '恢复中…' : '恢复此版本' }}
                </button>
              </div>
            </template>
            <div v-else class="fh-empty">选择左侧快照查看内容</div>
          </div>
        </div>
      </div>
    </div>
  </teleport>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useEditorStore } from '@/stores/editorStore'

const store = useEditorStore()

const snapshots = ref([])
const selected = ref(null)
const previewContent = ref(null)
const loading = ref(false)
const restoring = ref(false)

const filePath = computed(() => store.activeTab?.filePath || '')
const fileName = computed(() => store.activeTab?.fileName || '')

function formatTime(ts) {
  const d = new Date(ts)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

function formatSize(n) {
  if (n == null) return ''
  if (n < 1024) return `${n} B`
  return `${(n / 1024).toFixed(1)} KB`
}

async function loadList() {
  snapshots.value = []
  selected.value = null
  previewContent.value = null
  if (!filePath.value) return
  loading.value = true
  try {
    const r = await window.api?.listHistory(filePath.value)
    if (r?.success) snapshots.value = r.snapshots
  } finally {
    loading.value = false
  }
}

async function select(s) {
  selected.value = s
  previewContent.value = null
  const r = await window.api?.readHistory(filePath.value, s.ts)
  if (r?.success) {
    previewContent.value = r.content
    // 列表接口未带 size，读取时回填
    s.size = r.content.length
  } else {
    previewContent.value = `读取失败：${r?.error || '未知错误'}`
  }
}

async function restore() {
  if (!selected.value || !filePath.value) return
  restoring.value = true
  try {
    const r = await window.api?.restoreHistory(filePath.value, selected.value.ts)
    if (r?.success) {
      const tab = store.activeTab
      if (tab) {
        // 内容来自磁盘，短暂抑制自动保存回写
        store.suppressAutoSave = true
        tab.content = r.content
        tab.isDirty = false
        setTimeout(() => { store.suppressAutoSave = false }, 0)
      }
      store.notifyFileChange(`已恢复 ${fileName.value} 到 ${formatTime(selected.value.ts)}`)
      close()
    }
  } finally {
    restoring.value = false
  }
}

function openInFolder() {
  if (selected.value && filePath.value) {
    window.api?.showItemInFolder(filePath.value)
  }
}

function close() {
  store.showHistory = false
}

watch(() => store.showHistory, (v) => {
  if (v) loadList()
})
</script>

<style scoped>
.fh-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
}
.fh-panel {
  width: 760px;
  height: 520px;
  max-width: calc(100vw - 48px);
  max-height: calc(100vh - 48px);
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}
.fh-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 20px;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}
.fh-header h2 { margin: 0; font-size: 16px; }
.fh-file {
  flex: 1;
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.fh-close {
  border: none;
  background: transparent;
  font-size: 16px;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
}
.fh-close:hover { background: var(--hover-bg); }
.fh-body {
  display: flex;
  flex: 1;
  min-height: 0;
}
.fh-list {
  width: 240px;
  border-right: 1px solid var(--border-color);
  overflow-y: auto;
  flex-shrink: 0;
  padding: 6px;
}
.fh-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  color: var(--text-secondary);
}
.fh-item:hover { background: var(--hover-bg); }
.fh-item.active {
  background: var(--hover-bg);
  color: var(--accent-color);
  font-weight: 600;
}
.fh-size { font-size: 11px; color: var(--text-muted); }
.fh-preview {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.fh-content {
  flex: 1;
  margin: 0;
  padding: 14px 16px;
  overflow: auto;
  font-size: 12px;
  line-height: 1.5;
  font-family: 'Consolas', monospace;
  color: var(--text-secondary);
  white-space: pre-wrap;
  word-break: break-word;
}
.fh-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--border-color);
  flex-shrink: 0;
}
.fh-empty {
  padding: 32px 16px;
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.8;
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.fh-empty small { font-size: 11px; }
.btn {
  padding: 7px 16px;
  border-radius: 6px;
  border: 1px solid var(--border-color);
  cursor: pointer;
  font-size: 13px;
}
.btn-primary { background: var(--accent-color); color: #fff; border-color: var(--accent-color); }
.btn-primary:disabled { opacity: 0.6; cursor: default; }
.btn-secondary { background: var(--bg-secondary); color: var(--text-primary); }
.btn-primary:hover:not(:disabled) { filter: brightness(1.1); }
.btn-secondary:hover { background: var(--hover-bg); }
</style>
