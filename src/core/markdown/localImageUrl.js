// 本地图片 URL 的运行时适配层（Electron / Tauri 双栈）。
//
// Electron：parserCore 生成 `mdimg:///<abs>`，主进程用 protocol.handle('mdimg') 读盘返回。
// Tauri 2：Windows WebView2 不支持无 host 的自定义 scheme —— 自定义协议会被映射成
//   `http://<scheme>.localhost/<path>`，与 `mdimg:///D:/...` 不兼容。因此改用官方
//   asset 协议：Windows/Android → http://asset.localhost/<encodeURIComponent(path)>，
//   其他平台 → asset://localhost/<encodeURIComponent(path)>。
//
// 架构约束：parserCore.js 运行在 Web Worker（无 window），无法在生成 URL 时判断运行时。
// 所以 Worker 一律先产出 `mdimg:///`，由主线程 parseMarkdown() 在 DOMPurify 净化之后
// 调用 rewriteLocalImageUrls() 重写（见 parser.js）。Electron 下重写是 no-op，零回归。

const MDIMG_RE = /^mdimg:\/\/\//i
const ASSET_HOST_RE = /^(?:https?:\/\/asset\.localhost|asset:\/\/localhost)\//i

/** 是否运行在 Tauri WebView 中（Worker / 纯浏览器 / Electron 均为 false） */
export function isTauriRuntime() {
  return typeof window !== 'undefined' && !!window.__TAURI__
}

/**
 * 把绝对文件路径转换成当前运行时可加载的本地图片 URL。
 * @param {string} filePath 绝对路径（可含反斜杠）
 */
export function toLocalImageUrl(filePath) {
  const path = String(filePath || '')
  if (!isTauriRuntime()) {
    return 'mdimg:///' + path.replace(/\\/g, '/').replace(/^\/+/, '')
  }

  // 优先走 Tauri 官方实现，跟随其平台规则与后续版本变更
  const convert =
    window.__TAURI__?.core?.convertFileSrc ||
    window.__TAURI_INTERNALS__?.convertFileSrc
  if (typeof convert === 'function') {
    try {
      const url = convert(path)
      if (typeof url === 'string' && url) return url
    } catch {
      // 落到下面的兜底实现
    }
  }

  const encoded = encodeURIComponent(path)
  const isWindows =
    typeof navigator !== 'undefined' && /Windows|Android/i.test(navigator.userAgent)
  return isWindows
    ? `http://asset.localhost/${encoded}`
    : `asset://localhost/${encoded}`
}

/** 判断 URL 是否指向本地文件（mdimg 或 Tauri asset 协议） */
export function isLocalImageUrl(url) {
  const s = String(url || '')
  return MDIMG_RE.test(s) || ASSET_HOST_RE.test(s)
}

/** 从本地图片 URL 还原绝对路径，供 openPath / openLocalFile 使用 */
export function fromLocalImageUrl(url) {
  const s = String(url || '')
  if (MDIMG_RE.test(s)) {
    // 与 Electron 原有实现保持一致（parserCore 未编码路径，decode 是历史兼容行为）
    try {
      return decodeURIComponent(s.replace(/^mdimg:\/\/\/?/i, '')).replace(/^\//, '')
    } catch {
      return s.replace(/^mdimg:\/\/\/?/i, '').replace(/^\//, '')
    }
  }
  const rest = s.replace(ASSET_HOST_RE, '')
  try {
    return decodeURIComponent(rest)
  } catch {
    return rest
  }
}

/**
 * 重写净化后 HTML 中的 `mdimg:///` URL（仅 Tauri 运行时生效）。
 *
 * 必须在 DOMPurify.sanitize 之后调用：mdimg 已在白名单中被保留，而转换出的 asset URL
 * 由本模块从已知路径经 encodeURIComponent 构造，不含引号，不会引入未净化的用户输入。
 *
 * @param {string} html 净化后的 HTML
 */
export function rewriteLocalImageUrls(html) {
  if (!isTauriRuntime() || typeof html !== 'string') return html
  return html.replace(/(["'])mdimg:\/\/\/([^"']+)\1/g, (match, quote, rawPath) => {
    try {
      // parserCore 直接拼接原始路径（未做 encodeURIComponent），只还原 DOMPurify 可能产生的实体转义
      const ampEntity = /\u0026amp;/g
      const path = rawPath.replace(ampEntity, '\u0026')
      const url = toLocalImageUrl(path)
      if (/["']/.test(url)) return match
      return quote + url + quote
    } catch {
      return match
    }
  })
}
