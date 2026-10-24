import { ref } from 'vue'

const ICON_COPY = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>'
const ICON_SEARCH_FILE = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>'
const ICON_SEARCH_OPEN = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z"/><circle cx="11.5" cy="12.5" r="2.5"/><line x1="13.4" y1="14.4" x2="15.5" y2="16.5"/></svg>'

// 复制文本：优先 Clipboard API，失败时降级到隐藏 textarea + execCommand
async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return
    }
  } catch {}
  const ta = document.createElement('textarea')
  ta.value = text
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  try { document.execCommand('copy') } catch {}
  document.body.removeChild(ta)
}

// 选中文本右键菜单（编辑区 / 预览区共用）：复制、文内搜索、在打开的文件中搜索
export function useSelectionMenu(store) {
  const menuVisible = ref(false)
  const menuX = ref(0)
  const menuY = ref(0)
  let menuText = ''

  // 搜索词：多行选区取第一行，截断过长文本
  function searchTerm(text) {
    const t = text.trim()
    if (!t) return ''
    const firstLine = t.split(/\r?\n/)[0].trim()
    return firstLine.length > 100 ? firstLine.slice(0, 100) : firstLine
  }

  function open(e, text) {
    if (!text || !text.trim()) return false
    menuText = text
    menuX.value = e.clientX
    menuY.value = e.clientY
    menuVisible.value = true
    return true
  }

  function close() {
    menuVisible.value = false
  }

  function onSelect(item) {
    if (!item || typeof item.action !== 'function') return
    item.action(menuText)
  }

  const items = [
    {
      label: '复制',
      icon: ICON_COPY,
      action: (text) => { copyText(text) }
    },
    { separator: true },
    {
      label: '文内搜索',
      icon: ICON_SEARCH_FILE,
      action: (text) => {
        const term = searchTerm(text)
        if (term) store.searchRequest = { term, scope: 'file' }
      }
    },
    {
      label: '在打开的文件中搜索',
      icon: ICON_SEARCH_OPEN,
      action: (text) => {
        const term = searchTerm(text)
        if (term) store.searchRequest = { term, scope: 'open' }
      }
    }
  ]

  return { menuVisible, menuX, menuY, items, open, close, onSelect }
}
