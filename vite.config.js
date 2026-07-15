import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import { resolve } from 'path'
import { copyFileSync, mkdirSync, existsSync } from 'fs'

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
        name: 'copy-preload',
        closeBundle() {
          const src = resolve(__dirname, 'electron', 'preload.cjs')
          const destDir = resolve(__dirname, 'dist-electron')
          if (!existsSync(destDir)) {
            mkdirSync(destDir, { recursive: true })
          }
          const dest = resolve(destDir, 'preload.cjs')
          if (existsSync(src)) {
            copyFileSync(src, dest)
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
