// Tauri 客户端导出（方案 E）的纯逻辑层：与 DOM/画布解耦，便于单测。
// 对应 Electron 隐藏窗口 printToPDF()/capturePage() 的返回契约：
//   { success: true, filePath } | { success: false, canceled: true } | { success: false, error }

const PT_PER_INCH = 72

/** 英寸 → pt；非法值回退到默认值，0 是合法边距 */
export function inchesToPt(value, fallbackInches) {
  const n = Number(value ?? fallbackInches)
  return Number.isFinite(n) ? n * PT_PER_INCH : fallbackInches * PT_PER_INCH
}

/**
 * 计算 PDF 每页应绘制的整图偏移（jsPDF 通过重复 addImage + 负 y 实现分页）。
 * @param {{canvasWidth:number, canvasHeight:number, pageWidth:number, pageHeight:number,
 *          margins:{top:number,right:number,bottom:number,left:number}}} spec
 */
export function computePdfPages({ canvasWidth, canvasHeight, pageWidth, pageHeight, margins }) {
  const { top, right, bottom, left } = margins
  const availW = Math.max(1, pageWidth - left - right)
  const availH = Math.max(1, pageHeight - top - bottom)
  const w = canvasWidth > 0 ? canvasWidth : 1
  const h = canvasHeight > 0 ? canvasHeight : 1
  const drawW = availW
  const drawH = (h * drawW) / w

  const pages = []
  let offset = 0
  // guard 防止极端尺寸导致无限循环
  while (offset > -drawH && pages.length < 1000) {
    pages.push({ y: top + offset, newPage: pages.length > 0 })
    offset -= availH
  }
  return { drawW, drawH, pages }
}

/** 透传 save_blob 的返回（取消 / 写盘失败 / filePath 都不能被吞掉） */
export function normalizeExportResult(result) {
  if (result && typeof result === 'object' && typeof result.success === 'boolean') {
    return result
  }
  return { success: false, error: 'Invalid save_blob result' }
}

/** 纯数字补 px；'100%' / '20em' 等带单位值原样保留（无单位 CSS 长度会被浏览器拒绝） */
export function toCssSize(value, fallbackPx) {
  if (value == null || value === '') return `${fallbackPx}px`
  const s = String(value).trim()
  return /^\d+(\.\d+)?$/.test(s) ? `${s}px` : s
}

/**
 * html2canvas 的 onclone 回调：真实容器在屏幕外（避免闪现），克隆文档里恢复正常布局，
 * 并把 SVG（mermaid 等）转成 data URL <img> 提升保真度；失败时保留原 SVG。
 */
export function prepareClonedExport(doc) {
  const el = doc.querySelector('.mdev-export-container')
  if (el) {
    el.style.position = 'static'
    el.style.left = 'auto'
    el.style.top = 'auto'
  }
  if (typeof XMLSerializer === 'undefined' || !doc.querySelectorAll) return
  doc.querySelectorAll('svg').forEach((svg) => {
    try {
      const xml = new XMLSerializer().serializeToString(svg)
      const img = doc.createElement('img')
      img.setAttribute('src', 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml))
      img.style.width = toCssSize(svg.getAttribute('width'), svg.clientWidth || 300)
      img.style.height = toCssSize(svg.getAttribute('height'), svg.clientHeight || 150)
      img.style.maxWidth = '100%'
      svg.parentNode?.replaceChild(img, svg)
    } catch {
      // 保留原 SVG，不让单个节点拖垮整次导出
    }
  })
}

/** html2canvas 选项：缩放钳制、跨域图片、等待图片、离屏克隆修正 */
export function buildHtml2CanvasOptions(backgroundColor, scale) {
  const s = Number(scale)
  return {
    backgroundColor,
    scale: Number.isFinite(s) ? Math.max(1, Math.min(4, s)) : 2,
    useCORS: true,
    allowTaint: false,
    logging: false,
    imageTimeout: 15000,
    onclone: prepareClonedExport
  }
}
