import { clipboard } from 'electron'
import { join, extname } from 'path'
import { writeFile, mkdir, copyFile } from 'fs/promises'
import { existsSync } from 'fs'

// 生成 image-YYYYMMDD-HHmmss-mmm.ext 形式的唯一文件名
function timestampName(ext) {
  const d = new Date()
  const p = (n, l = 2) => String(n).padStart(l, '0')
  const date = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`
  const time = `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  return `image-${date}-${time}-${p(d.getMilliseconds(), 3)}.${ext}`
}

export function registerImageHandlers(ipcMain) {
  // 保存系统剪贴板图片（截图/复制的纯图片）到 basePath/assets/
  ipcMain.handle('image:saveClipboardImage', async (_, basePath) => {
    try {
      if (!basePath) return { success: false, error: 'no-base-path' }
      const image = clipboard.readImage()
      if (image.isEmpty()) return { success: false, error: 'clipboard-empty' }
      const dir = join(basePath, 'assets')
      await mkdir(dir, { recursive: true })
      const name = timestampName('png')
      const abs = join(dir, name)
      await writeFile(abs, image.toPNG())
      return { success: true, path: abs, relativePath: `assets/${name}` }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  // 复制磁盘上的图片文件到 basePath/assets/（保留原扩展名）
  ipcMain.handle('image:copyImageFile', async (_, srcPath, basePath) => {
    try {
      if (!srcPath || !basePath) return { success: false, error: 'no-path' }
      if (!existsSync(srcPath)) return { success: false, error: 'file-not-found' }
      const dir = join(basePath, 'assets')
      await mkdir(dir, { recursive: true })
      const ext = (extname(srcPath) || '.png').replace('.', '').toLowerCase()
      const name = timestampName(ext)
      const abs = join(dir, name)
      await copyFile(srcPath, abs)
      return { success: true, path: abs, relativePath: `assets/${name}` }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })
}
