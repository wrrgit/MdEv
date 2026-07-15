import { readFile, writeFile, readdir, mkdir, rename, unlink, access, constants, watch } from 'fs/promises'
import { join, relative, extname, basename } from 'path'
import { existsSync } from 'fs'

const watchedDirs = new Map()

export function registerFileHandlers(ipcMain, mainWindow) {
  ipcMain.handle('file:read', async (_, filePath) => {
    try {
      const content = await readFile(filePath, 'utf-8')
      return { success: true, content }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('file:write', async (_, filePath, content) => {
    try {
      await writeFile(filePath, content, 'utf-8')
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
      await unlink(targetPath)
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
