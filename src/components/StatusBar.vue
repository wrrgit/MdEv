<template>
  <div class="status-bar" v-if="store.tabs.length > 0">
    <div class="status-left">
      <span class="status-item" v-if="store.activeTab">
        行 {{ store.cursorLine }}, 列 {{ store.cursorCol }}
      </span>
    </div>
    <div class="status-right">
      <button class="view-mode-btn" @click="cycleViewMode" :title="viewModeLabel">
        {{ viewModeLabel }}
      </button>
      <span class="status-item">UTF-8</span>
      <span class="status-item">Markdown</span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useEditorStore } from '@/stores/editorStore'

const store = useEditorStore()

const viewModeLabels = { dual: '双栏模式', edit: '编辑模式', preview: '预览模式' }
const viewModeLabel = computed(() => viewModeLabels[store.settings.viewMode] || '双栏模式')

function cycleViewMode() {
  const order = ['dual', 'edit', 'preview']
  const idx = order.indexOf(store.settings.viewMode)
  store.settings.viewMode = order[(idx + 1) % order.length]
}
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
