import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import { resolve } from 'path'
import { copyFileSync, mkdirSync, existsSync, readdirSync } from 'fs'

// 把 preload / 图标 / KaTeX 字体复制进 dist-electron。
// 关键：插件必须同时挂在「electron 子构建」上。vite-plugin-electron 的子构建用
// emptyOutDir 清空 dist-electron，且发生在 renderer 构建之后；若只挂在外层 config
// （renderer build 的 closeBundle），复制的文件会被随后的子构建清空，打进 asar 的
// 包里就没有 preload.cjs → contextBridge 不执行 → window.api 未定义 → 打开文件 /
// 打开文件夹 / 最小化 / 最大化 / 关闭等所有按钮静默失效。
function copyAssetsPlugin() {
  return {
    name: 'copy-preload-and-assets',
    closeBundle() {
      const destDir = resolve(__dirname, 'dist-electron')
      if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true })

      const preloadSrc = resolve(__dirname, 'electron', 'preload.cjs')
      if (!existsSync(preloadSrc)) {
        throw new Error('[mdev] electron/preload.cjs 缺失，无法建立 window.api')
      }
      copyFileSync(preloadSrc, resolve(destDir, 'preload.cjs'))

      const assetsDir = resolve(destDir, 'assets', 'icons')
      if (!existsSync(assetsDir)) mkdirSync(assetsDir, { recursive: true })
      const iconIco = resolve(__dirname, 'assets', 'icons', 'icon.ico')
      const iconPng = resolve(__dirname, 'assets', 'icons', 'icon.png')
      if (existsSync(iconIco)) copyFileSync(iconIco, resolve(assetsDir, 'icon.ico'))
      if (existsSync(iconPng)) copyFileSync(iconPng, resolve(assetsDir, 'icon.png'))

      // 复制 KaTeX 资源（导出 PDF/HTML/图片时把 woff2 字体 base64 inline 进 CSS，
      // 让公式在导出产物里正确渲染。参考业界 markdown-pdf 做法：输出自包含）
      const katexSrc = resolve(__dirname, 'node_modules', 'katex', 'dist')
      const katexDest = resolve(destDir, 'katex')
      if (existsSync(katexSrc)) {
        if (!existsSync(katexDest)) mkdirSync(katexDest, { recursive: true })
        const katexCssSrc = resolve(katexSrc, 'katex.min.css')
        if (existsSync(katexCssSrc)) copyFileSync(katexCssSrc, resolve(katexDest, 'katex.min.css'))
        const fontsSrcDir = resolve(katexSrc, 'fonts')
        const fontsDestDir = resolve(katexDest, 'fonts')
        if (existsSync(fontsSrcDir)) {
          if (!existsSync(fontsDestDir)) mkdirSync(fontsDestDir, { recursive: true })
          const woff2Files = readdirSync(fontsSrcDir).filter(f => f.endsWith('.woff2'))
          for (const f of woff2Files) copyFileSync(resolve(fontsSrcDir, f), resolve(fontsDestDir, f))
        }
      }
      console.log('[mdev] preload.cjs + icons + katex -> dist-electron')
    }
  }
}

export default defineConfig(({ command, mode }) => {
  const isElectron = process.env.ELECTRON === 'true' || mode === 'electron'
  // 默认清空输出目录；沙箱构建环境有批量删除守卫会拦截 >50 文件的 emptyDir，
  // 此时用 MDEV_KEEP_DIST=1 关闭清空以完成构建（不影响用户本机正常打包，
  // 因为该环境变量不设置时默认仍为 true）。
  const emptyOutDir = process.env.MDEV_KEEP_DIST !== '1'

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
            // 子构建结束后再复制一次，避免被它自己的 emptyOutDir 清掉
            plugins: [copyAssetsPlugin()],
            build: {
              outDir: 'dist-electron',
              emptyOutDir,
              minify: process.env.NODE_ENV === 'production',
              rollupOptions: {
                external: ['electron']
              }
            }
          }
        }
      ]),
      renderer(),
      // renderer 构建结束也复制一次（双保险：无论哪个构建最后结束都有产物）
      copyAssetsPlugin()
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
      emptyOutDir,
      rollupOptions: {
        output: {
          manualChunks: {
            'codemirror': [
              'codemirror', '@codemirror/view', '@codemirror/state',
              '@codemirror/language', '@codemirror/commands',
              '@codemirror/search', '@codemirror/autocomplete',
              '@codemirror/lang-markdown', '@codemirror/theme-one-dark',
              '@codemirror/lang-json'
            ],
            'markdown': ['markdown-it', 'markdown-it-anchor', 'markdown-it-task-lists', 'markdown-it-texmath'],
            'vendor': ['vue', 'pinia', 'dompurify']
          }
        }
      }
    }
  }
})
