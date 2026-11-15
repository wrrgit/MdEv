// Tauri 侧模态对话框宿主（P4）。
//
// 垫片是 main.js 的静态 import，早于主 Vue app 创建，因此这里用独立的 createApp
// 挂载 TauriDialog.vue；弹窗关闭后 unmount 并移除容器，不污染主应用组件树。
// 独立 app 不继承主应用的 provide/inject，但项目主题变量定义在 :root 与
// [data-theme="dark"] 上，挂在 body 下的弹窗同样能继承，明暗主题自动跟随。

import { createApp } from 'vue'
import TauriDialog from '../components/TauriDialog.vue'

/**
 * @param {{ title?: string, fields?: Array, buttons?: Array }} options
 * @returns {Promise<{ action: string, value: Record<string, string> | null }>}
 */
export function showModal({ title, fields = [], buttons = [] }) {
  return new Promise((resolve) => {
    if (typeof document === 'undefined' || !document.body) {
      resolve({ action: 'cancel', value: null })
      return
    }

    const host = document.createElement('div')
    document.body.appendChild(host)
    let app = null
    let settled = false

    function finish(result) {
      if (settled) return
      settled = true
      resolve(result)
      // 不在组件事件回调中同步卸载自身，避免打断当前渲染
      queueMicrotask(() => {
        try {
          app?.unmount()
        } catch {
          // 卸载失败也要移除容器
        }
        if (host.parentNode) host.parentNode.removeChild(host)
      })
    }

    try {
      app = createApp(TauriDialog, { title, fields, buttons, onResolve: finish })
      app.mount(host)
    } catch (err) {
      console.error('[MdEv] 对话框挂载失败', err)
      finish({ action: 'cancel', value: null })
    }
  })
}
