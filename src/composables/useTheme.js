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

    watch(
      () => store.recentFiles,
      (files) => {
        window.api?.setSettings({ recentFiles: files })
      },
      { deep: true }
    )

    watch(
      () => store.recentFolders,
      (folders) => {
        window.api?.setSettings({ recentFolders: folders })
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
