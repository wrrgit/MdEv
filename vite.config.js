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
