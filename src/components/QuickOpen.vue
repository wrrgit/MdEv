<template>
  <teleport to="body">
    <div v-if="store.showQuickOpen" class="qo-overlay" @click="close">
      <div class="qo-panel" @click.stop>
        <div class="qo-input-wrap">
          <input
            ref="inputRef"
            v-model="query"
            class="qo-input"
            placeholder="按文件名搜索…（↑↓ 选择，Enter 打开，Esc 关闭）"
            @keydown="onKeydown"
          />
        </div>
        <div class="qo-list" ref="listRef">
          <div v-if="filtered.length === 0" class="qo-empty">无匹配文件</div>
          <div
            v-for="(item, i) in filtered"
            :key="item.path"
            class="qo-item"
            :class="{ active: i === activeIndex }"
            @click="openFile(item)"
            @mouseenter="activeIndex = i"
          >
            <span class="qo-icon" v-html="fileIcon"></span>
            <span class="qo-text">
              <span class="qo-name" v-html="highlight(item.name, item.nameIdx)"></span>
              <span class="qo-path" v-html="highlight(item.rel, item.relIdx)"></span>
            </span>
            <span v-if="item.recent" class="qo-badge">最近</span>
          </div>
        </div>
      </div>
    </div>
  </teleport>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { useEditorStore } from '@/stores/editorStore'

const store = useEditorStore()
const query = ref('')
const activeIndex = ref(0)
const inputRef = ref(null)
const listRef = ref(null)

const fileIcon = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
  <path d="M3 1h7l3 3v11H3V1z" fill="var(--icon-md, #519aba)" opacity="0.18"/>
  <path d="M3 1h7l3 3v11H3V1z" stroke="var(--icon-md, #519aba)" stroke-width="0.9" stroke-linejoin="round"/>
  <path d="M10 1v3h3" stroke="var(--icon-md, #519aba)" stroke-width="0.9" stroke-linejoin="round"/>
</svg>`

// ── 项目文件扁平化 ──
const allFiles = computed(() => {
  const out = []
  const walk = (nodes) => {
    for (const n of nodes) {
      if (n.type === 'directory') walk(n.children || [])
      else out.push({ name: n.name, path: n.path })
    }
  }
  walk(store.fileTree)
  return out
})

function relOf(p) {
  const root = store.projectRoot || ''
  if (root && (p.startsWith(root + '\\') || p.startsWith(root + '/'))) {
    return p.slice(root.length + 1)
  }
  return p
}

// ── 模糊匹配（子序列 + 评分：连续匹配、词首加分）──
function fuzzyMatch(q, text) {
  const ql = q.toLowerCase()
  const tl = text.toLowerCase()
  let qi = 0
  let score = 0
  let lastMatch = -2
  const indices = []
  for (let ti = 0; ti < tl.length && qi < ql.length; ti++) {
    if (tl[ti] === ql[qi]) {
      indices.push(ti)
      if (lastMatch === ti - 1) score += 5
      if (ti === 0 || text[ti - 1] === '/' || text[ti - 1] === '\\') score += 3
      score += 1
      lastMatch = ti
      qi++
    }
  }
  return qi === ql.length ? { score, indices } : null
}

const filtered = computed(() => {
  const q = query.value.trim()
  const hasProject = !!store.projectRoot
  if (!q) {
    // 无查询：最近文件（项目内）优先，不足用项目文件补齐；未打开项目时列出全部最近文件
    const inProject = new Set(allFiles.value.map(f => f.path))
    const recentSource = hasProject
      ? store.recentFiles.filter(f => inProject.has(f.path))
      : store.recentFiles
    const recent = recentSource
      .map(f => ({ name: f.fileName, path: f.path, rel: relOf(f.path), recent: true }))
    if (!hasProject) return recent.slice(0, 15)
    if (recent.length >= 10) return recent.slice(0, 10)
    const rest = allFiles.value
      .filter(f => !recent.some(r => r.path === f.path))
      .slice(0, 10 - recent.length)
      .map(f => ({ ...f, rel: relOf(f.path) }))
    return [...recent, ...rest]
  }
  // 有查询：项目文件优先；未打开项目时退化为最近文件模糊搜索
  const pool = hasProject
    ? allFiles.value
    : store.recentFiles.map(f => ({ name: f.fileName, path: f.path }))
  const scored = []
  for (const f of pool) {
    const rel = relOf(f.path)
    const mn = fuzzyMatch(q, f.name)
    const mr = fuzzyMatch(q, rel)
    if (!mn && !mr) continue
    // 文件名匹配权重高于路径匹配
    const score = (mn ? mn.score * 2 : 0) + (mr ? mr.score : 0)
    scored.push({ ...f, rel, score, nameIdx: mn?.indices, relIdx: mr?.indices })
  }
  scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
  return scored.slice(0, 15)
})

// ── 高亮（转义 + 包裹匹配字符）──
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

function highlight(text, indices) {
  if (!indices || indices.length === 0) return escapeHtml(text)
  const set = new Set(indices)
  let out = ''
  for (let i = 0; i < text.length; i++) {
    const ch = escapeHtml(text[i])
    out += set.has(i) ? `<span class="hl">${ch}</span>` : ch
  }
  return out
}

function close() {
  store.showQuickOpen = false
}

async function openFile(item) {
  if (!item) return
  close()
  const result = await window.api?.readFile(item.path)
  if (result?.success) {
    store.addTab(item.path, result.content, item.name)
    store.addRecentFile(item.path)
  }
}

function scrollActiveIntoView() {
  nextTick(() => {
    const el = listRef.value?.querySelector('.qo-item.active')
    el?.scrollIntoView({ block: 'nearest' })
  })
}

function onKeydown(e) {
  const len = filtered.value.length
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    if (len > 0) activeIndex.value = (activeIndex.value + 1) % len
    scrollActiveIntoView()
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    if (len > 0) activeIndex.value = (activeIndex.value - 1 + len) % len
    scrollActiveIntoView()
  } else if (e.key === 'Enter') {
    e.preventDefault()
    openFile(filtered.value[activeIndex.value])
  } else if (e.key === 'Escape') {
    e.preventDefault()
    close()
  }
}

watch(query, () => { activeIndex.value = 0 })

watch(filtered, (list) => {
  if (activeIndex.value >= list.length) activeIndex.value = Math.max(0, list.length - 1)
})

watch(() => store.showQuickOpen, (v) => {
  if (v) {
    query.value = ''
    activeIndex.value = 0
    nextTick(() => inputRef.value?.focus())
  }
})
</script>

<style scoped>
.qo-overlay {
  position: fixed;
  inset: 0;
  z-index: 9000;
  background: rgba(0, 0, 0, 0.28);
  display: flex;
  justify-content: center;
  align-items: flex-start;
}

.qo-panel {
  margin-top: 80px;
  width: 560px;
  max-width: calc(100vw - 48px);
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.28);
  overflow: hidden;
}

.qo-input-wrap {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-color);
}

.qo-input {
  width: 100%;
  height: 30px;
  border: none;
  outline: none;
  background: transparent;
  color: var(--text-primary);
  font-size: 14px;
}

.qo-input::placeholder {
  color: var(--text-muted);
}

.qo-list {
  max-height: 380px;
  overflow-y: auto;
  padding: 4px 0;
}

.qo-empty {
  padding: 20px;
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
}

.qo-item {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 40px;
  padding: 0 12px;
  cursor: pointer;
}

.qo-item.active {
  background: var(--hover-bg);
}

.qo-icon {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.qo-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
  line-height: 1.3;
}

.qo-name {
  font-size: 13px;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.qo-path {
  font-size: 11px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.qo-badge {
  flex-shrink: 0;
  font-size: 10px;
  color: var(--accent-color);
  border: 1px solid var(--accent-color);
  border-radius: 3px;
  padding: 1px 4px;
  opacity: 0.8;
}

.qo-item :deep(.hl) {
  color: var(--accent-color);
  font-weight: 600;
}
</style>
