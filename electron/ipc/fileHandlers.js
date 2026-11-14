import { readFile, writeFile, readdir, mkdir, rename, unlink, rm, stat, access, constants, watch } from 'fs/promises'
import { join, extname } from 'path'
import { existsSync } from 'fs'
import { app } from 'electron'
import { snapshotFile } from './historyHandlers.js'

// ── 大文件读取守卫阈值 ──
// 20MB 以上：标记 isLarge，渲染端打开前弹确认（仅编辑模式打开 / 取消）。
// 150MB 以上：整篇读取会撑爆内存，仅读取前 20MB 并标记 truncated（渲染端只读、禁止保存）。
const LARGE_FILE_THRESHOLD = 20 * 1024 * 1024
const FULL_READ_CAP = 150 * 1024 * 1024
const PARTIAL_READ = 20 * 1024 * 1024

const watchedDirs = new Map()

export function registerFileHandlers(ipcMain, mainWindow) {
  ipcMain.handle('file:read', async (_, filePath) => {
    try {
      // 先 stat 取体积，做大文件守卫：超过阈值标记 isLarge（渲染端打开前弹确认）；
      // 超过整读上限则只读取前 PARTIAL_READ 字节并标记 truncated（渲染端只读，禁止保存以免破坏文件）。
      const st = await stat(filePath)
      const size = st.size
      const isLarge = size > LARGE_FILE_THRESHOLD
      let content
      let truncated = false
      let truncatedBytes = size
      if (size > FULL_READ_CAP) {
        const buf = await readFile(filePath, { encoding: 'utf-8', start: 0, end: PARTIAL_READ })
        content = buf
        truncated = true
        truncatedBytes = PARTIAL_READ
      } else {
        content = await readFile(filePath, 'utf-8')
      }
      return { success: true, content, size, isLarge, truncated, truncatedBytes }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('file:write', async (_, filePath, content) => {
    try {
      await writeFile(filePath, content, 'utf-8')
      // 保存成功后自动快照（本地文件历史，静默失败不影响主流程）
      snapshotFile(filePath, content)
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('file:readdir', async (_, dirPath) => {
    try {
      const entries = await readdir(dirPath, { withFileTypes: true })
      const tree = await buildFileTree(entries, dirPath)
      return { success: true, tree }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('file:create', async (_, filePath) => {
    try {
      await writeFile(filePath, '', 'utf-8')
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('file:mkdir', async (_, dirPath) => {
    try {
      await mkdir(dirPath, { recursive: true })
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('file:rename', async (_, oldPath, newPath) => {
    try {
      await rename(oldPath, newPath)
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('file:delete', async (_, targetPath) => {
    try {
      const st = await stat(targetPath)
      if (st.isDirectory()) {
        await rm(targetPath, { recursive: true, force: true })
      } else {
        await unlink(targetPath)
      }
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('file:exists', async (_, targetPath) => {
    try {
      await access(targetPath, constants.F_OK)
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('file:watch', async (_, dirPath) => {
    try {
      if (watchedDirs.has(dirPath)) {
        watchedDirs.get(dirPath).close()
      }
      const watcher = watch(dirPath, { recursive: true }, (eventType, filename) => {
        if (filename && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('file:changed', {
            type: eventType,
            path: join(dirPath, filename)
          })
        }
      })
      watchedDirs.set(dirPath, watcher)
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('file:unwatch', async (_, dirPath) => {
    if (watchedDirs.has(dirPath)) {
      watchedDirs.get(dirPath).close()
      watchedDirs.delete(dirPath)
    }
    return { success: true }
  })

  // ── 未命名文档草稿 ──
  // 自动保存时写入 userData/drafts/<draftId>.md，避免被迫弹出"另存为"对话框；
  // 用户显式保存（Ctrl+S / 菜单保存）时才弹窗确认路径与文件名，成功后删除草稿。
  const draftsDir = join(app.getPath('userData'), 'drafts')

  ipcMain.handle('draft:save', async (_, draftId, content) => {
    try {
      if (!draftId) return { success: false, error: 'no-draft-id' }
      await mkdir(draftsDir, { recursive: true })
      const draftPath = join(draftsDir, `${draftId}.md`)
      await writeFile(draftPath, content ?? '', 'utf-8')
      return { success: true, path: draftPath }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('draft:read', async (_, draftId) => {
    try {
      if (!draftId) return { success: false, error: 'no-draft-id' }
      const draftPath = join(draftsDir, `${draftId}.md`)
      if (!existsSync(draftPath)) return { success: false, error: 'draft-not-found' }
      return { success: true, content: await readFile(draftPath, 'utf-8') }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('draft:delete', async (_, draftId) => {
    try {
      if (!draftId) return { success: true }
      await rm(join(draftsDir, `${draftId}.md`), { force: true })
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })
}

async function buildFileTree(entries, basePath) {
  const items = []
  const dirs = []
  const files = []

  for (const entry of entries) {
    const fullPath = join(basePath, entry.name)
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue

    if (entry.isDirectory()) {
      dirs.push({
        name: entry.name,
        path: fullPath,
        type: 'directory',
        isExpanded: false,
        children: []
      })
    } else if (entry.isFile() && isTextFile(entry.name)) {
      files.push({
        name: entry.name,
        path: fullPath,
        type: 'file',
        ext: extname(entry.name).toLowerCase()
      })
    }
  }

  dirs.sort((a, b) => a.name.localeCompare(b.name))
  files.sort((a, b) => a.name.localeCompare(b.name))

  for (const dir of dirs) {
    try {
      const subEntries = await readdir(dir.path, { withFileTypes: true })
      dir.children = await buildFileTree(subEntries, dir.path)
    } catch {
      dir.children = []
    }
  }

  return [...dirs, ...files]
}

function isTextFile(name) {
  const textExts = ['.md', '.markdown', '.txt', '.json', '.js', '.ts', '.vue',
    '.html', '.css', '.scss', '.yaml', '.yml', '.toml', '.ini', '.cfg',
    '.xml', '.svg', '.sql', '.sh', '.bat', '.ps1', '.py', '.java', '.c',
    '.cpp', '.h', '.hpp', '.rs', '.go', '.rb', '.php', '.swift', '.kt']
  const ext = extname(name).toLowerCase()
  return textExts.includes(ext)
}
