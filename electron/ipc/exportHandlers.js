import { writeFile } from 'fs/promises'
import { join, basename } from 'path'
import { dialog } from 'electron'

export function registerExportHandlers(ipcMain, mainWindow) {
  ipcMain.handle('export:pdf', async (_, options = {}) => {
    try {
      const { defaultPath = 'export.pdf' } = options

      const result = await dialog.showSaveDialog(mainWindow, {
        defaultPath,
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
      })

      if (result.canceled) return { success: false, canceled: true }

      const pdfData = await mainWindow.webContents.printToPDF({
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

      await writeFile(result.filePath, pdfData)
      return { success: true, filePath: result.filePath }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('export:image', async (_, dataUrl, suggestedPath) => {
    try {
      const result = await dialog.showSaveDialog(mainWindow, {
        defaultPath: suggestedPath || 'export.png',
        filters: [{ name: 'PNG Image', extensions: ['png'] }]
      })

      if (result.canceled) return { success: false, canceled: true }

      const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '')
      const buffer = Buffer.from(base64Data, 'base64')
      await writeFile(result.filePath, buffer)

      return { success: true, filePath: result.filePath }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('export:zip', async (_, rootPath, outputPath, include = ['*']) => {
    try {
      // Dynamic import jszip
      const JSZip = (await import('jszip')).default
      const zip = new JSZip()

      await addToZip(zip, rootPath, rootPath, include)

      const result = await dialog.showSaveDialog(mainWindow, {
        defaultPath: outputPath || `${basename(rootPath)}.zip`,
        filters: [{ name: 'ZIP Archive', extensions: ['zip'] }]
      })

      if (result.canceled) return { success: false, canceled: true }

      const content = await zip.generateAsync({ type: 'nodebuffer' })
      await writeFile(result.filePath, content)

      return { success: true, filePath: result.filePath }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })
}

async function addToZip(zip, basePath, dirPath, include) {
  const { readdir, readFile } = await import('fs/promises')
  const { extname, join } = await import('path')

  const entries = await readdir(dirPath, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name)
    const relativePath = fullPath.startsWith(basePath)
      ? fullPath.slice(basePath.length + 1)
      : entry.name

    if (entry.name.startsWith('.') || entry.name === 'node_modules' ||
        entry.name === 'dist' || entry.name === 'dist-electron' ||
        entry.name === 'release' || entry.name === '.git') continue

    if (entry.isDirectory()) {
      await addToZip(zip, basePath, fullPath, include)
    } else if (entry.isFile()) {
      const content = await readFile(fullPath)
      zip.file(relativePath, content)
    }
  }
}
