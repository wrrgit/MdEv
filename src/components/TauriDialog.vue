<script setup>
// Tauri 侧通用模态对话框（P4）：替代垫片里用原生 DOM 拼装的硬编码弹窗，
// 复用项目 CSS 变量以跟随明暗主题，并由 dialogHost.js 独立挂载/卸载。
// props / 返回结构与 Electron BrowserWindow HTML 弹窗保持一致：
//   emit('resolve', { action: <button id>, value: { [field.name]: string } | null })
import { reactive, onMounted, nextTick } from 'vue'
import { createFieldValues, buildResult } from '../api/dialogModel.js'

const props = defineProps({
  title: { type: String, default: '' },
  fields: { type: Array, default: () => [] },
  buttons: { type: Array, default: () => [] }
})
const emit = defineEmits(['resolve'])

const values = reactive(createFieldValues(props.fields))

let firstInput = null
function setInputRef(el) {
  if (el && !firstInput) firstInput = el
}

function finish(action) {
  emit('resolve', buildResult(action, values))
}

function onOverlayMousedown(e) {
  if (e.target === e.currentTarget) finish('cancel')
}

onMounted(async () => {
  await nextTick()
  if (!firstInput) return
  firstInput.focus()
  try {
    firstInput.select?.()
  } catch {
    // number 等类型不支持 select()
  }
})
</script>

<template>
  <div class="td-overlay" @mousedown="onOverlayMousedown">
    <div class="td-box" role="dialog" aria-modal="true">
      <div v-if="title" class="td-title">{{ title }}</div>

      <template v-for="(f, i) in fields" :key="i">
        <div v-if="f.type === 'message'" class="td-message">{{ f.value }}</div>
        <template v-else>
          <label v-if="f.label" class="td-label" :for="`td-${i}`">{{ f.label }}</label>
          <input
            :id="`td-${i}`"
            :ref="setInputRef"
            v-model="values[f.name || 'field']"
            class="td-input"
            :type="f.type || 'text'"
            :placeholder="f.placeholder"
            :min="f.min"
            :max="f.max"
          />
        </template>
      </template>

      <div class="td-buttons">
        <button
          v-for="b in buttons"
          :key="b.id"
          type="button"
          :class="b.id === 'cancel' ? 'td-btn td-btn-cancel' : 'td-btn td-btn-primary'"
          @click="finish(b.id)"
        >
          {{ b.label }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.td-overlay {
  position: fixed;
  inset: 0;
  z-index: 99999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
}
.td-box {
  min-width: 320px;
  max-width: 90vw;
  padding: 20px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-primary);
  color: var(--text-primary);
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.25);
  font-size: 13px;
}
.td-title {
  margin-bottom: 14px;
  font-size: 14px;
  font-weight: 600;
}
.td-message {
  margin-bottom: 14px;
  color: var(--text-primary);
}
.td-label {
  display: block;
  margin-bottom: 4px;
  font-size: 12px;
  color: var(--text-secondary);
}
.td-input {
  width: 100%;
  box-sizing: border-box;
  margin-bottom: 14px;
  padding: 6px 10px;
  border: 1px solid var(--border-color);
  border-radius: 5px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 13px;
  outline: none;
}
.td-input:focus {
  border-color: var(--accent-color);
}
.td-buttons {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}
.td-btn {
  padding: 6px 16px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 13px;
}
.td-btn-cancel {
  border: 1px solid var(--border-color);
  background: var(--bg-primary);
  color: var(--text-primary);
}
.td-btn-cancel:hover {
  background: var(--hover-bg);
}
.td-btn-primary {
  border: 1px solid var(--accent-color);
  background: var(--accent-color);
  color: #fff;
}
.td-btn-primary:hover {
  opacity: 0.9;
}
</style>
