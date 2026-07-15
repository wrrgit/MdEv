import { readdir, readFile } from 'fs/promises'
import { join, extname } from 'path'

export function registerSearchHandlers(ipcMain) {
  ipcMain.handle('search:project', async (_, rootPath, query, options = {}) => {
    try {
      const results = []
      const { caseSensitive = false, wholeWord = false, regex = false, includeExt = ['.md', '.markdown'] } = options

      let searchRegex
      if (regex) {
        searchRegex = new RegExp(query, caseSensitive ? 'g' : 'gi')
      } else {
        const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const pattern = wholeWord ? `\\b${escaped}\\b` : escaped
        searchRegex = new RegExp(pattern, caseSensitive ? 'g' : 'gi')
      }

      await searchDirectory(rootPath, rootPath, searchRegex, includeExt, results)

      return { success: true, results }
    } catch (err) {
      return { success: false, error: err.message, results: [] }
    }
  })
}

async function searchDirectory(basePath, dirPath, regex, includeExt, results) {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name)
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue

      if (entry.isDirectory()) {
        await searchDirectory(basePath, fullPath, regex, includeExt, results)
      } else if (entry.isFile()) {
        const ext = extname(entry.name).toLowerCase()
        if (!includeExt.includes(ext)) continue

        try {
          const content = await readFile(fullPath, 'utf-8')
          const lines = content.split('\n')
          let match

          for (let i = 0; i < lines.length; i++) {
            regex.lastIndex = 0
            const lineMatches = []
            while ((match = regex.exec(lines[i])) !== null) {
              lineMatches.push({
                index: match.index,
                length: match[0].length,
                text: match[0]
              })
            }

            if (lineMatches.length > 0) {
              results.push({
                file: fullPath,
                relativePath: fullPath.startsWith(basePath)
                  ? fullPath.slice(basePath.length + 1)
                  : fullPath,
                fileName: entry.name,
                line: i + 1,
                lineContent: lines[i].trim(),
                matches: lineMatches
              })
            }
          }
        } catch {
          // Skip files we can't read
        }
      }
    }
  } catch {
    // Skip directories we can't read
  }
}
