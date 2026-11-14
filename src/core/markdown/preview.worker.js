// ── 预览解析 Worker ──
// 在独立线程执行 markdown-it 解析 + 高亮 + KaTeX，避免阻塞主线程输入响应。
// 仅回传「原始 HTML」；净化（DOMPurify）由主线程完成，复用既有的可信配置。

import { renderRawMarkdown } from './parserCore.js'

self.onmessage = async (e) => {
  const { id, content, context } = e.data
  if (!id) return
  try {
    const html = await renderRawMarkdown(content, context || {})
    self.postMessage({ id, html })
  } catch (err) {
    // 解析失败也回传错误，主线程走兜底面（保证预览不空白）
    self.postMessage({ id, error: err && err.message ? err.message : String(err) })
  }
}
