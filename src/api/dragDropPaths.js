// Tauri 拖拽路径队列（纯逻辑，不依赖 DOM/运行时，便于单测）。
//
// 背景：Tauri 2 默认接管文件拖放，HTML5 DataTransfer.files 中的 File 没有 .path。
// 垫片从 webview.onDragDropEvent 拿到真实绝对路径后放入队列：
//   - 若 WebView 仍派发 HTML5 drop，getPathForFile 会按 basename 匹配并「消费」路径；
//   - delay 毫秒后把未被消费的剩余路径交给 dispatch 兜底派发。
// 这样两条通道互斥，不会把同一文件打开两次；HTML5 drop 被完全吞掉时也能工作。

/**
 * @param {object} opts
 * @param {(paths: string[]) => void} opts.dispatch 剩余路径的兜底派发回调
 * @param {number} [opts.delay=250] 等待 HTML5 drop 消费的窗口（ms）
 */
export function createDropPathQueue({ dispatch, delay = 250 }) {
  let pending = []
  let timer = null

  /** 一次原生 drop：重置队列并安排兜底派发 */
  function setPaths(paths) {
    pending = Array.isArray(paths) ? paths.slice() : []
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      const rest = pending.splice(0)
      if (rest.length) dispatch(rest)
    }, delay)
  }

  /**
   * 按 File 的 basename 消费一条路径。
   * @param {{ path?: string, name?: string }} file
   * @returns {string} 绝对路径；未匹配到返回 ''
   */
  function consume(file) {
    if (!file) return ''
    // 兼容仍带 .path 的环境（Electron / 未来 WebView 实现）
    if (file.path) return file.path
    const name = String(file.name || '').toLowerCase()
    if (!name) return ''
    const idx = pending.findIndex(
      (p) => String(p).split(/[\\/]/).pop().toLowerCase() === name
    )
    if (idx === -1) return ''
    const [path] = pending.splice(idx, 1)
    return path
  }

  /** 当前待消费路径（诊断/测试用） */
  function remaining() {
    return pending.slice()
  }

  return { setPaths, consume, remaining }
}
