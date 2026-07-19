import { writeFile } from 'fs/promises'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { app, dialog, BrowserWindow } from 'electron'

// 注意：HTML 净化由 renderer 进程的 parseMarkdown() 完成（DOMPurify + 浏览器原生 window），
// main 进程不再二次净化——之前的 sanitizeHtml.js 用 jsdom 造 window，
// 而 jsdom 内部源码引用了 __dirname，在 ESM 打包后（package.json type:module）会抛
// "ReferenceError: __dirname is not defined in ES module scope" 导致 exe 无法启动。

// 代码高亮 token 颜色（github 风格），让导出的代码块有颜色
const hljsCss = `
  .hljs { color: #24292e; }
  .hljs-comment, .hljs-quote { color: #6a737d; font-style: italic; }
  .hljs-keyword, .hljs-selector-tag, .hljs-subst { color: #d73a49; }
  .hljs-string, .hljs-doctag, .hljs-regexp { color: #032f62; }
  .hljs-number, .hljs-literal, .hljs-bullet, .hljs-symbol { color: #005cc5; }
  .hljs-title, .hljs-section, .hljs-name, .hljs-attribute { color: #6f42c1; }
  .hljs-type, .hljs-built_in, .hljs-builtin-name, .hljs-class .hljs-title { color: #005cc5; }
  .hljs-tag { color: #22863a; }
  .hljs-meta { color: #6a737d; }
  .hljs-deletion { color: #b31d28; background: #ffeef0; }
  .hljs-addition { color: #22863a; background: #f0fff4; }
  .hljs-emphasis { font-style: italic; }
  .hljs-strong { font-weight: 700; }
  .hljs-variable, .hljs-template-variable { color: #e36209; }
  .hljs-link { color: #032f62; }
`

const css = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', 'PingFang SC', sans-serif; font-size: 16px; line-height: 1.6; color: #24292e; background: #ffffff; }
  .markdown-body { max-width: 900px; margin: 0 auto; padding: 40px 20px; }
  .markdown-body h1 { font-size: 2em; font-weight: 600; margin: 24px 0 16px; padding-bottom: 8px; border-bottom: 1px solid #e1e4e8; }
  .markdown-body h2 { font-size: 1.5em; font-weight: 600; margin: 24px 0 16px; padding-bottom: 8px; border-bottom: 1px solid #e1e4e8; }
  .markdown-body h3 { font-size: 1.25em; font-weight: 600; margin: 24px 0 8px; }
  .markdown-body h4 { font-size: 1em; font-weight: 600; margin: 24px 0 8px; }
  .markdown-body h5 { font-size: 0.875em; font-weight: 600; margin: 24px 0 8px; }
  .markdown-body h6 { font-size: 0.85em; font-weight: 600; margin: 24px 0 8px; color: #586069; }
  .markdown-body p { margin: 16px 0; }
  .markdown-body a { color: #0366d6; text-decoration: none; }
  .markdown-body a:hover { text-decoration: underline; }
  .markdown-body code { font-family: 'JetBrains Mono', 'Cascadia Code', 'Fira Code', 'Consolas', monospace; font-size: 0.875em; background: #f3f4f6; border-radius: 3px; padding: 0.2em 0.4em; }
  .markdown-body pre { background: #f6f8fa; border: 1px solid #e1e4e8; border-radius: 6px; padding: 16px; overflow: auto; margin: 16px 0; }
  .markdown-body pre code { background: transparent; padding: 0; font-size: 0.875em; line-height: 1.5; }
  .markdown-body blockquote { margin: 16px 0; padding: 0 16px; color: #586069; border-left: 4px solid #e1e4e8; }
  .markdown-body ul, .markdown-body ol { margin: 16px 0; padding-left: 24px; }
  .markdown-body li { margin: 4px 0; }
  .markdown-body table { border-collapse: collapse; margin: 16px 0; width: 100%; }
  .markdown-body th, .markdown-body td { border: 1px solid #e1e4e8; padding: 8px 12px; }
  .markdown-body th { background: #f6f8fa; font-weight: 600; }
  .markdown-body tr:nth-child(2n) { background: #f6f8fa; }
  .markdown-body img { max-width: 100%; display: block; margin: 16px auto; }
  .markdown-body hr { border: 0; border-top: 1px solid #e1e4e8; margin: 24px 0; }
  .markdown-body .task-list-item { list-style: none; }
  .markdown-body .task-list-item input { margin-right: 8px; }
  .markdown-body .mermaid { text-align: center; margin: 16px 0; }
  .katex { font-size: 1.1em !important; }
  .katex-display { overflow-x: auto; overflow-y: hidden; padding: 8px 0; }
  .hljs { background: #f6f8fa !important; }
  ${hljsCss}
`

const darkCss = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', 'PingFang SC', sans-serif; font-size: 16px; line-height: 1.6; color: #c9d1d9; background: #0d1117; }
  .markdown-body { max-width: 900px; margin: 0 auto; padding: 40px 20px; }
  .markdown-body h1 { font-size: 2em; font-weight: 600; margin: 24px 0 16px; padding-bottom: 8px; border-bottom: 1px solid #30363d; }
  .markdown-body h2 { font-size: 1.5em; font-weight: 600; margin: 24px 0 16px; padding-bottom: 8px; border-bottom: 1px solid #30363d; }
  .markdown-body h3 { font-size: 1.25em; font-weight: 600; margin: 24px 0 8px; }
  .markdown-body h4 { font-size: 1em; font-weight: 600; margin: 24px 0 8px; }
  .markdown-body h5 { font-size: 0.875em; font-weight: 600; margin: 24px 0 8px; }
  .markdown-body h6 { font-size: 0.85em; font-weight: 600; margin: 24px 0 8px; color: #8b949e; }
  .markdown-body p { margin: 16px 0; }
  .markdown-body a { color: #58a6ff; text-decoration: none; }
  .markdown-body a:hover { text-decoration: underline; }
  .markdown-body code { font-family: 'JetBrains Mono', 'Cascadia Code', 'Fira Code', 'Consolas', monospace; font-size: 0.875em; background: #1c2128; border-radius: 3px; padding: 0.2em 0.4em; }
  .markdown-body pre { background: #161b22; border: 1px solid #30363d; border-radius: 6px; padding: 16px; overflow: auto; margin: 16px 0; }
  .markdown-body pre code { background: transparent; padding: 0; font-size: 0.875em; line-height: 1.5; }
  .markdown-body blockquote { margin: 16px 0; padding: 0 16px; color: #8b949e; border-left: 4px solid #30363d; }
  .markdown-body ul, .markdown-body ol { margin: 16px 0; padding-left: 24px; }
  .markdown-body li { margin: 4px 0; }
  .markdown-body table { border-collapse: collapse; margin: 16px 0; width: 100%; }
  .markdown-body th, .markdown-body td { border: 1px solid #30363d; padding: 8px 12px; }
  .markdown-body th { background: #1c2128; font-weight: 600; }
  .markdown-body tr:nth-child(2n) { background: #161b22; }
  .markdown-body img { max-width: 100%; display: block; margin: 16px auto; }
  .markdown-body hr { border: 0; border-top: 1px solid #30363d; margin: 24px 0; }
  .markdown-body .task-list-item { list-style: none; }
  .markdown-body .task-list-item input { margin-right: 8px; }
  .markdown-body .mermaid { text-align: center; margin: 16px 0; }
  .katex { font-size: 1.1em !important; }
  .katex-display { overflow-x: auto; overflow-y: hidden; padding: 8px 0; }
  .hljs { background: #161b22 !important; color: #c9d1d9; }
  .hljs-comment, .hljs-quote { color: #8b949e; font-style: italic; }
  .hljs-keyword, .hljs-selector-tag, .hljs-subst { color: #ff7b72; }
  .hljs-string, .hljs-doctag, .hljs-regexp { color: #a5d6ff; }
  .hljs-number, .hljs-literal, .hljs-bullet, .hljs-symbol { color: #79c0ff; }
  .hljs-title, .hljs-section, .hljs-name, .hljs-attribute { color: #d2a8ff; }
  .hljs-type, .hljs-built_in, .hljs-builtin-name { color: #79c0ff; }
  .hljs-tag { color: #7ee787; }
  .hljs-meta { color: #8b949e; }
  .hljs-deletion { color: #ffa198; background: #67060c; }
  .hljs-addition { color: #7ee787; background: #033a16; }
  .hljs-emphasis { font-style: italic; }
  .hljs-strong { font-weight: 700; }
  .hljs-variable, .hljs-template-variable { color: #ffa657; }
  .hljs-link { color: #a5d6ff; }
`

// 读取 katex.min.css，把 woff2 字体 base64 inline 进 CSS，让导出产物完全自包含
// （参考业界 markdown-pdf / vscode-markdown-pdf 做法：字体 inline，公式才能在 PDF/HTML/图片里正确渲染）
let katexCssCache = null
function getKatexCssInlined() {
  if (katexCssCache !== null) return katexCssCache
  try {
    const katexDir = join(app.getAppPath(), 'dist-electron', 'katex')
    const cssPath = join(katexDir, 'katex.min.css')
    const fontsDir = join(katexDir, 'fonts')
    if (!existsSync(cssPath)) {
      console.warn('[export] katex.min.css not found at', cssPath)
      katexCssCache = ''
      return ''
    }
    let css = readFileSync(cssPath, 'utf8')
    // 把 url(fonts/xxx.woff2) 替换成 data:font/woff2;base64,...
    css = css.replace(/url\(fonts\/([^)]+\.woff2)\)/g, (match, fontName) => {
      const fontPath = join(fontsDir, fontName)
      if (!existsSync(fontPath)) return match
      const fontData = readFileSync(fontPath)
      return `url(data:font/woff2;base64,${fontData.toString('base64')})`
    })
    // 去掉 woff/ttf 引用（woff2 已足够，且这些路径在导出产物里无效）
    css = css.replace(/,url\(fonts\/[^)]+\) format\("(?:woff|truetype)"\)/g, '')
    katexCssCache = css
    return css
  } catch (err) {
    console.error('[export] Failed to load katex CSS:', err)
    katexCssCache = ''
    return ''
  }
}

function getExportHTML(contentHtml, options = {}) {
  const isDark = options.theme === 'dark'
  const katexCss = getKatexCssInlined()
  const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>${isDark ? darkCss : css}</style>
  <style>${katexCss}</style>
</head>
<body>
  <div class="markdown-body">${contentHtml}</div>
</body>
</html>`
  return fullHtml
}

// 等待隐藏窗口内资源（图片等）加载完成，再加一个短延迟让布局稳定
function waitForReady(webContents, delayMs = 400) {
  return new Promise((resolve) => {
    webContents.once('did-finish-load', () => {
      // 给图片/字体等异步资源一点加载时间
      setTimeout(resolve, delayMs)
    })
  })
}

export function registerExportHandlers(ipcMain, mainWindow) {
  let exportWindow = null

  async function createExportWindow(html, options = {}) {
    return new Promise((resolve, reject) => {
      exportWindow = new BrowserWindow({
        show: false,
        width: 1200,
        height: 1600,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true
        }
      })

      let settled = false
      const finish = (fn, val) => {
        if (settled) return
        settled = true
        try { fn(val) } catch (e) { reject(e) }
        if (exportWindow && !exportWindow.isDestroyed()) {
          exportWindow.close()
        }
        exportWindow = null
      }

      exportWindow.webContents.on('did-finish-load', async () => {
        try {
          // 等待图片等异步资源加载、布局稳定
          await new Promise(r => setTimeout(r, options.readyDelay || 400))
          const pdfData = await exportWindow.webContents.printToPDF({
            printBackground: true,
            landscape: false,
            pageSize: options.pageSize || 'A4',
            margins: {
              top: options.marginTop || 0.75,
              bottom: options.marginBottom || 0.75,
              left: options.marginLeft || 0.75,
              right: options.marginRight || 0.75
            }
          })
          finish(resolve, pdfData)
        } catch (err) {
          finish(reject, err)
        }
      })

      exportWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
        finish(reject, new Error(`Failed to load: ${errorDescription}`))
      })

      exportWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    })
  }

  ipcMain.handle('export:pdf', async (_, options = {}) => {
    try {
      const { defaultPath = 'export.pdf', content, theme } = options

      if (!content) {
        return { success: false, error: 'No content to export' }
      }

      const result = await dialog.showSaveDialog(mainWindow, {
        defaultPath,
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
      })

      if (result.canceled) return { success: false, canceled: true }

      // content 已是前端 parseMarkdown 渲染+净化的 HTML，直接使用
      const html = getExportHTML(content, { pageSize: options.pageSize || 'A4', theme })
      const pdfData = await createExportWindow(html, options)

      await writeFile(result.filePath, pdfData)
      return { success: true, filePath: result.filePath }
    } catch (err) {
      if (exportWindow && !exportWindow.isDestroyed()) {
        exportWindow.close()
        exportWindow = null
      }
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('export:html', async (_, options = {}) => {
    try {
      const { defaultPath = 'export.html', content, theme } = options

      if (!content) {
        return { success: false, error: 'No content to export' }
      }

      const result = await dialog.showSaveDialog(mainWindow, {
        defaultPath,
        filters: [{ name: 'HTML', extensions: ['html', 'htm'] }]
      })

      if (result.canceled) return { success: false, canceled: true }

      const html = getExportHTML(content, { theme })
      await writeFile(result.filePath, html, 'utf8')

      return { success: true, filePath: result.filePath }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })
}
