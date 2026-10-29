// ── 大文件性能分级与格式化工具 ──
// 用于「大文件读取 / 展示 / 渲染 / 打开速度」优化：
// 依据字符数与行数对文档分级，PreviewPane 据此选择不同的预览刷新策略，
// StatusBar 据此展示文件体积与「大文件」标识。
//
// 阈值依据（markdown-it 解析实测，见 docs/large-file-performance.md）：
//   ~168KB(2k 行)  ≈ 12ms
//   ~840KB(10k 行) ≈ 36ms
//   ~4.2MB(50k 行) ≈ 200ms
//   ~17MB(200k 行) ≈ 870ms
// 解析只是预览成本的一部分（另有 DOM 构建 / DOMPurify / Mermaid），
// 因此 live 预览对 >600k 字符或 >2 万行做防抖，对 >5M 字符或 >8 万行切到「手动刷新」。

const LARGE_CHARS = 600_000
const LARGE_LINES = 20_000
const HUGE_CHARS = 5_000_000
const HUGE_LINES = 80_000

// 仅统计字符数与行数（无内存分配），用于热路径（切标签 / 防抖渲染时）。
export function classifyContent(content) {
  if (!content) return { tier: 'normal', charCount: 0, lineCount: 0 }
  const charCount = content.length
  // 超大文件：仅凭字符数快速判定，避免对多 MB 字符串做行数统计（高频按键路径）
  if (charCount > HUGE_CHARS) return { tier: 'huge', charCount, lineCount: 0 }
  let lineCount = 1
  for (let i = 0; i < charCount; i++) {
    if (content.charCodeAt(i) === 10) lineCount++
  }
  let tier = 'normal'
  if (charCount > LARGE_CHARS || lineCount > LARGE_LINES) tier = 'large'
  return { tier, charCount, lineCount }
}

const encoder = (typeof TextEncoder !== 'undefined') ? new TextEncoder() : null

// UTF-8 字节数（用于状态栏展示），仅在防抖后的低频路径调用。
export function byteSize(content) {
  if (!content) return 0
  if (encoder) return encoder.encode(content).length
  return content.length
}

export function formatBytes(bytes) {
  if (!bytes || bytes < 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let v = bytes
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  const fixed = i === 0 ? 0 : v >= 100 ? 0 : v >= 10 ? 1 : 2
  return `${v.toFixed(fixed)} ${units[i]}`
}

export const TIER_LABEL = {
  normal: '',
  large: '大文件',
  huge: '超大文件'
}
