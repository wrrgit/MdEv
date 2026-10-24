import { watch, onMounted, onUnmounted } from 'vue'
import { useEditorStore } from '@/stores/editorStore'

export function useTheme() {
  const store = useEditorStore()

  function applyTheme(themeMode) {
    const root = document.documentElement

    if (themeMode === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      root.setAttribute('data-theme', prefersDark ? 'dark' : 'light')
    } else {
      root.setAttribute('data-theme', themeMode)
    }
  }

  function initTheme() {
    applyTheme(store.settings.theme)
  }

  function watchThemeChanges() {
    watch(
      () => store.settings.theme,
      (newTheme) => {
        applyTheme(newTheme)
      }
    )
  }

  // Listen for system theme changes
  let mediaQuery = null

  function startSystemThemeListener() {
    mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => {
      if (store.settings.theme === 'system') {
        applyTheme('system')
      }
    }
    mediaQuery.addEventListener('change', handler)
    return () => mediaQuery.removeEventListener('change', handler)
  }

  // Load saved settings on mount
  async function loadSavedSettings() {
    try {
      const data = await window.api?.getSettings()
      if (data?.success) {
        if (data.settings) store.loadSettings(data.settings)
        if (data.recentFiles) store.recentFiles = data.recentFiles
        if (data.recentFolders) store.recentFolders = data.recentFolders
        if (data.session) store.savedSession = data.session
      }
    } catch {
      // Settings not available (browser mode)
    }
  }

  // Save settings when they change
  function watchSettingsChanges() {
    watch(
      () => store.settings,
      (newSettings) => {
        window.api?.setSettings({ settings: { ...newSettings } })
      },
      { deep: true }
    )

    // 注意：不能把 Vue 响应式代理数组直接传给 ipcRenderer——contextBridge 的
    // 结构化克隆不支持 Proxy，会抛 "An object could not be cloned" 导致静默失败，
    // 最近列表永远写不进磁盘。必须先映射成普通对象。
    watch(
      () => store.recentFiles,
      (files) => {
        const plain = (files || []).map(f => ({
          path: f.path,
          fileName: f.fileName,
          pinned: !!f.pinned,
          lastOpened: f.lastOpened
        }))
        window.api?.setSettings({ recentFiles: plain })
      },
      { deep: true }
    )

    watch(
      () => store.recentFolders,
      (folders) => {
        const plain = (folders || []).map(f => ({
          path: f.path,
          folderName: f.folderName,
          pinned: !!f.pinned,
          lastOpened: f.lastOpened
        }))
        window.api?.setSettings({ recentFolders: plain })
      },
      { deep: true }
    )
  }

  // Listen for Electron native theme changes
  function listenForNativeTheme() {
    window.api?.onThemeChanged((mode) => {
      if (store.settings.theme === 'system') {
        applyTheme('system')
      }
    })
  }

  return {
    initTheme,
    watchThemeChanges,
    startSystemThemeListener,
    loadSavedSettings,
    watchSettingsChanges,
    listenForNativeTheme,
    applyTheme
  }
}
