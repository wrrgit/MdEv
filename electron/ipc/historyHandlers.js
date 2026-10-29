// ── 本地文件历史（对标 Obsidian File Recovery / VS Code Timeline）──
// 每次保存时自动快照到 userData/file-history/<hash>/<timestamp>.md，
// 保留最近 30 份；支持列出 / 读取 / 恢复指定快照。
import { app } from 'electron'
import { join } from 'path'
import { createHash } from 'crypto'
import { readFile, writeFile, mkdir, readdir, rm } from 'fs/promises'

const MAX_SNAPSHOTS = 30
const MIN_INTERVAL_MS = 60_000 // 同一文件 1 分钟内不重复快照，避免自动保存刷爆

function historyDirFor(filePath) {
  const hash = createHash('md5').update(filePath.toLowerCase()).digest('hex').slice(0, 16)
  return join(app.getPath('userData'), 'file-history', hash)
}

const lastSnapshotAt = new Map() // filePath -> timestamp

// 保存成功后调用（快照刚写盘的内容）
export async function snapshotFile(filePath, content) {
  try {
    if (!filePath || typeof content !== 'string') return
    // 超大文件（>2MB）跳过快照：避免每次保存都复制一份多 MB 副本，
    // 本地历史对超大文件意义有限且占用大量磁盘。
    if (content.length > 2_000_000) return
    const prev = lastSnapshotAt.get(filePath) || 0
    if (Date.now() - prev < MIN_INTERVAL_MS) return

    const dir = historyDirFor(filePath)
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, `${Date.now()}.md`), content, 'utf-8')
    lastSnapshotAt.set(filePath, Date.now())

    // 只保留最近 MAX_SNAPSHOTS 份
    const files = (await readdir(dir)).filter(f => f.endsWith('.md')).sort()
    if (files.length > MAX_SNAPSHOTS) {
      for (const f of files.slice(0, files.length - MAX_SNAPSHOTS)) {
        await rm(join(dir, f), { force: true })
      }
    }
  } catch {
    // 快照失败不影响主流程
  }
}

export function registerHistoryHandlers(ipcMain) {
  // 列出某文件的快照（时间倒序）
  ipcMain.handle('history:list', async (_, filePath) => {
    try {
      if (!filePath) return { success: false, error: 'no-path' }
      const dir = historyDirFor(filePath)
      if (!existsSnapshots(dir)) return { success: true, snapshots: [] }
      const files = (await readdir(dir)).filter(f => f.endsWith('.md'))
      const snapshots = []
      for (const f of files) {
        const ts = Number(f.replace(/\.md$/, ''))
        if (!Number.isFinite(ts)) continue
        snapshots.push({ ts, name: f })
      }
      snapshots.sort((a, b) => b.ts - a.ts)
      return { success: true, snapshots: snapshots.slice(0, MAX_SNAPSHOTS) }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  // 读取指定快照内容
  ipcMain.handle('history:read', async (_, filePath, ts) => {
    try {
      if (!filePath || !Number.isFinite(ts)) return { success: false, error: 'bad-args' }
      const p = join(historyDirFor(filePath), `${ts}.md`)
      const content = await readFile(p, 'utf-8')
      return { success: true, content, ts }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  // 恢复快照：把内容写回原文件（不生成新快照）
  ipcMain.handle('history:restore', async (_, filePath, ts) => {
    try {
      if (!filePath || !Number.isFinite(ts)) return { success: false, error: 'bad-args' }
      const p = join(historyDirFor(filePath), `${ts}.md`)
      const content = await readFile(p, 'utf-8')
      await writeFile(filePath, content, 'utf-8')
      return { success: true, content }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })
}

// readdir 在目录不存在时抛异常，用同步存在性检查兜一层
import { existsSync } from 'fs'
function existsSnapshots(dir) {
  return existsSync(dir)
}
