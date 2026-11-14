// ── 预览解析 Worker 客户端 ──
// 使用 Vite 的 `?worker` 导入：Vite 会把 worker（及其依赖 markdown-it/katex/highlight.js）打包成
// 自包含的 classic worker，在 dev（http）与生产（file://）下都能稳定加载，规避 ES module worker
// 在 file:// 下的限制。单例 Worker + 请求/响应 id 关联。
// 兜底：Worker 不可用 / 加载失败 / 超时未响应时，回落主线程 renderRawMarkdown，保证功能不中断、不挂起。

import PreviewWorker from './preview.worker.js?worker'
import { renderRawMarkdown } from './parserCore.js'

let worker = null
let seq = 0
const pending = new Map() // id -> { resolve, reject, timer }

function getWorker() {
  if (worker) return worker
  try {
    worker = new PreviewWorker()
    worker.onmessage = (e) => {
      const { id, html, error } = e.data || {}
      if (id == null) return
      const p = pending.get(id)
      if (!p) return
      clearTimeout(p.timer)
      pending.delete(id)
      if (error) p.reject(new Error(error))
      else p.resolve(html)
    }
    worker.onerror = (e) => {
      // Worker 整体报错（含模块加载失败）：作废 worker，reject 所有挂起请求，
      // 后续请求经 getWorker() 返回 null 回落主线程，避免 Promise 永远挂起。
      worker = null
      const err = new Error(e?.message || 'preview worker error')
      for (const { reject } of pending.values()) reject(err)
      pending.clear()
    }
  } catch (e) {
    worker = null
  }
  return worker
}

// 渲染原始 HTML（未净化）。优先 Worker；失败 / 超时则回落主线程。
export function renderInWorker(content, context) {
  const w = getWorker()
  if (!w) {
    return renderRawMarkdown(content, context).catch((err) => { throw err })
  }
  const id = ++seq
  return new Promise((resolve, reject) => {
    const entry = { resolve, reject }
    // 看门狗：file:// 等环境下 Worker 静默失效时不响应，超时后回落主线程，绝不永久挂起
    entry.timer = setTimeout(() => {
      if (pending.get(id) === entry) {
        pending.delete(id)
        renderRawMarkdown(content, context).then(resolve, reject)
      }
    }, 8000)
    pending.set(id, entry)
    try {
      w.postMessage({ id, content, context })
    } catch (err) {
      clearTimeout(entry.timer)
      pending.delete(id)
      // postMessage 失败（结构化克隆异常等）→ 立即回落主线程
      renderRawMarkdown(content, context).then(resolve, reject)
    }
  })
}
