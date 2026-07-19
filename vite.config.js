import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import { resolve } from 'path'
import { copyFileSync, mkdirSync, existsSync, readdirSync } from 'fs'

export default defineConfig(({ command, mode }) => {
  const isElectron = process.env.ELECTRON === 'true' || mode === 'electron'

  const plugins = [vue()]

  if (isElectron) {
    plugins.push(
      electron([
        {
          entry: 'electron/main.js',
          onstart(args) {
            if (process.env.NODE_ENV !== 'development') {
              args.startup()
            }
          },
          vite: {
            build: {
              outDir: 'dist-electron',
              minify: process.env.NODE_ENV === 'production',
              rollupOptions: {
                external: ['electron']
              }
            }
          }
        }
      ]),
      renderer(),
      {
        name: 'copy-preload-and-assets',
        closeBundle() {
          const destDir = resolve(__dirname, 'dist-electron')
          if (!existsSync(destDir)) {
            mkdirSync(destDir, { recursive: true })
          }
          const preloadSrc = resolve(__dirname, 'electron', 'preload.cjs')
          if (existsSync(preloadSrc)) {
            copyFileSync(preloadSrc, resolve(destDir, 'preload.cjs'))
          }
          const assetsDir = resolve(destDir, 'assets', 'icons')
          if (!existsSync(assetsDir)) {
            mkdirSync(assetsDir, { recursive: true })
          }
          const iconIco = resolve(__dirname, 'assets', 'icons', 'icon.ico')
          const iconPng = resolve(__dirname, 'assets', 'icons', 'icon.png')
          if (existsSync(iconIco)) {
            copyFileSync(iconIco, resolve(assetsDir, 'icon.ico'))
          }
          if (existsSync(iconPng)) {
            copyFileSync(iconPng, resolve(assetsDir, 'icon.png'))
          }

          // 复制 KaTeX 资源（导出 PDF/HTML/图片时把 woff2 字体 base64 inline 进 CSS，
          // 让公式在导出产物里正确渲染。参考业界 markdown-pdf 做法：输出自包含）
          const katexSrc = resolve(__dirname, 'node_modules', 'katex', 'dist')
          const katexDest = resolve(destDir, 'katex')
          if (existsSync(katexSrc)) {
            if (!existsSync(katexDest)) {
              mkdirSync(katexDest, { recursive: true })
            }
            const katexCssSrc = resolve(katexSrc, 'katex.min.css')
            if (existsSync(katexCssSrc)) {
              copyFileSync(katexCssSrc, resolve(katexDest, 'katex.min.css'))
            }
            const fontsSrcDir = resolve(katexSrc, 'fonts')
            const fontsDestDir = resolve(katexDest, 'fonts')
            if (existsSync(fontsSrcDir)) {
              if (!existsSync(fontsDestDir)) {
                mkdirSync(fontsDestDir, { recursive: true })
              }
              // 只复制 woff2（现代浏览器/PDF 引擎都支持，体积最小）
              const woff2Files = readdirSync(fontsSrcDir).filter(f => f.endsWith('.woff2'))
              for (const f of woff2Files) {
                copyFileSync(resolve(fontsSrcDir, f), resolve(fontsDestDir, f))
              }
            }
          }
        }
      }
    )
  }

  return {
    plugins,
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src')
      }
    },
    server: {
      port: 5173
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true
    }
  }
})
