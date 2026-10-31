import { ref } from 'vue'

// 模块级单例：所有组件共享同一条 toast 队列
const toasts = ref([])
let seq = 0

export function useToast() {
  function show(message, options = {}) {
    const id = ++seq
    const type = options.type || 'info'
    const duration = options.duration ?? 2600
    toasts.value.push({ id, message, type })
    if (duration > 0) {
      setTimeout(() => dismiss(id), duration)
    }
    return id
  }

  function dismiss(id) {
    const idx = toasts.value.findIndex(t => t.id === id)
    if (idx !== -1) toasts.value.splice(idx, 1)
  }

  function clear() {
    toasts.value = []
  }

  return { toasts, show, dismiss, clear }
}
