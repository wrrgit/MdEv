<template>
  <div class="status-bar" v-if="store.tabs.length > 0">
    <div class="status-left">
      <span class="status-item" v-if="store.activeTab">
        行 {{ store.cursorLine }}, 列 {{ store.cursorCol }}
      </span>
    </div>
    <div class="status-right">
      <span class="status-item save-status" :class="saveStatus.class">
        {{ saveStatus.text }}
      </span>
      <span class="status-item">UTF-8</span>
      <span class="status-item">Markdown</span>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useEditorStore } from '@/stores/editorStore'

const store = useEditorStore()
const saveStatus = ref({ text: '✅ 已保存', class: 'saved' })
</script>

<style scoped>
.status-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 24px;
  padding: 0 12px;
  background: var(--bg-secondary);
  border-top: 1px solid var(--border-color);
  font-size: 11px;
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
</style>
