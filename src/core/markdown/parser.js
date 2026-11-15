// ── 主线程 Markdown 解析入口（预览 / 导出共用）──
// 解析重活委托给 Web Worker（previewClient → preview.worker），主线程仅做：
//   1) 接收 Worker 回传的原始 HTML；
//   2) 用 DOMPurify 净化（可信配置，与历史行为一致）；
//   3) 兜底：Worker 不可用时回落到主线程 renderRawMarkdown + 净化，保证功能不中断。
// katex 样式在此静态引入，确保即便解析发生在 Worker，公式也能正确排版。

import DOMPurify from 'dompurify'
import 'katex/dist/katex.min.css'
import { renderInWorker } from './previewClient'
import { renderRawMarkdown } from './parserCore'
import { rewriteLocalImageUrls } from './localImageUrl'
import { sanitizeHtmlInChunks } from './sanitizeChunks.js'

const SANITIZE_CONFIG = {
  ADD_TAGS: ['math', 'semantics', 'annotation', 'mrow', 'mi', 'mo', 'mn', 'msup', 'msub', 'mfrac', 'msqrt', 'mover', 'munder', 'mtable', 'mtr', 'mtd', 'details', 'summary'],
  ADD_ATTR: ['xmlns', 'data-*', 'aria-*', 'loading', 'class', 'src', 'alt', 'title'],
  // 放行自定义 mdimg:// 本地图片协议（默认白名单不含它，src 会被剥掉导致图片不显示）
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|callto|sms|cid|xmpp|matrix|ftp|ftps|mdimg|data|blob):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i
}

export async function parseMarkdown(content, context = {}) {
  if (!content) return '<p style="color: var(--text-muted);">开始写作...</p>'

  try {
    let raw
    try {
      raw = await renderInWorker(content, context)
    } catch {
      // Worker 不可用（极端环境）：回落主线程解析
      raw = await renderRawMarkdown(content, context)
    }
    // 大文件分帧净化：整篇 DOMPurify.sanitize 会连续占用主线程近 1 秒，
    // 导致「渲染中…」假死；切成完整块片段后逐段净化、段间让出主线程。
    const clean = await sanitizeHtmlInChunks(raw, SANITIZE_CONFIG, {
      chunkChars: 96_000,
      sanitize: (html, config) => DOMPurify.sanitize(html, config)
    })
    // Tauri 下把 Worker 产出的 mdimg:/// 重写为 asset 协议 URL；Electron 下为 no-op
    return rewriteLocalImageUrls(clean)
  } catch (err) {
    return `<p style="color: #e74c3c;">渲染错误: ${err.message}</p>`
  }
}
