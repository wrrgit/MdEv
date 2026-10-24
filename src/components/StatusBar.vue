<template>
  <div class="status-bar" v-if="store.tabs.length > 0">
    <div class="status-left">
      <span class="status-item" v-if="store.activeTab">
        行 {{ store.cursorLine }}, 列 {{ store.cursorCol }}
      </span>
      <span class="status-item stat-item" v-if="docStats.chars > 0" title="字数统计（CJK 字符 + 西文单词）">
        {{ docStats.chars }} 字 · {{ docStats.lines }} 行 · 约 {{ docStats.readMin }} 分钟
      </span>
      <span class="status-item stat-item selected" v-if="selectionChars > 0">
        已选 {{ selectionChars }} 字
      </span>
    </div>
    <div class="status-right">
      <span class="status-item file-notice" v-if="store.fileChangeNotice">{{ store.fileChangeNotice }}</span>
      <button class="view-mode-btn" @click="cycleViewMode" :title="viewModeLabel">
        {{ viewModeLabel }}
      </button>
      <span class="status-item">UTF-8</span>
      <span class="status-item">Markdown</span>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch, onUnmounted } from 'vue'
import { useEditorStore } from '@/stores/editorStore'

const store = useEditorStore()

const viewModeLabels = { dual: '双栏模式', edit: '编辑模式', preview: '预览模式' }
const viewModeLabel = computed(() => viewModeLabels[store.settings.viewMode] || '双栏模式')

function cycleViewMode() {
  const order = ['dual', 'edit', 'preview']
  const idx = order.indexOf(store.settings.viewMode)
  store.settings.viewMode = order[(idx + 1) % order.length]
}

// ── 字数统计（对标 Typora：CJK 字符 + 西文单词）──
function countChars(text) {
  if (!text) return 0
  const cjk = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g) || []).length
  const latinWords = (text.match(/[A-Za-z0-9]+(?:['\u2019-][A-Za-z0-9]+)*/g) || []).length
  return cjk + latinWords
}

const docStats = ref({ chars: 0, lines: 0, readMin: 0 })
let statsTimer = null

// 全文统计做 300ms 防抖，避免大文档每次按键重算
watch(() => store.content, (val) => {
  clearTimeout(statsTimer)
  statsTimer = setTimeout(() => {
    const chars = countChars(val)
    docStats.value = {
      chars,
      lines: val ? val.split('\n').length : 0,
      readMin: chars > 0 ? Math.max(1, Math.ceil(chars / 400)) : 0
    }
  }, 300)
}, { immediate: true })

onUnmounted(() => clearTimeout(statsTimer))

const selectionChars = computed(() => countChars(store.selectionText))
</script>

<style scoped>
.status-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 32px;
  padding: 4px 12px;
  background: var(--bg-secondary);
  border-top: 1px solid var(--border-color);
  font-size: 16px;
  color: var(--text-muted);
  flex-shrink: 0;
}
.status-left, .status-right {
  display: flex;
  align-items: center;
  gap: 16px;
}
.status-item.saved { color: var(--text-muted); }
.status-item.saving { color: var(--accent-color); }
.status-item.unsaved { color: #e78333; }
.stat-item.selected { color: var(--accent-color); }
.status-item.file-notice {
  color: var(--accent-color);
  font-size: 13px;
  animation: notice-fade 0.3s ease-in;
}
@keyframes notice-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}
.view-mode-btn {
  background: transparent;
  border: none;
  color: var(--accent-color);
  cursor: pointer;
  font-size: 16px;
  font-weight: 500;
  font-family: -apple-system, 'Microsoft YaHei', 'PingFang SC', sans-serif;
  padding: 2px 6px;
  letter-spacing: 0.5px;
  transition: color 0.12s;
  white-space: nowrap;
}
.view-mode-btn:hover {
  color: var(--text-primary);
}
</style>
