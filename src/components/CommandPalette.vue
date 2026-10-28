<template>
  <teleport to="body">
    <div v-if="visible" class="cp-overlay" @click="close">
      <div class="cp-panel" @click.stop>
        <div class="cp-input-wrap">
          <input
            ref="inputRef"
            v-model="query"
            class="cp-input"
            placeholder="输入命令名称…（↑↓ 选择，Enter 执行，Esc 关闭）"
            @keydown="onKeydown"
          />
        </div>
        <div class="cp-list" ref="listRef">
          <div v-if="filtered.length === 0" class="cp-empty">无匹配命令</div>
          <template v-for="(item, i) in filtered" :key="item.id">
            <div
              v-if="item._firstOfSection"
              class="cp-section"
            >{{ item.section }}</div>
            <div
              class="cp-item"
              :class="{ active: i === activeIndex }"
              @click="run(item)"
              @mouseenter="activeIndex = i"
            >
              <span class="cp-title" v-html="highlight(item.title, item.idx)"></span>
              <span v-if="item.hint" class="cp-hint">{{ item.hint }}</span>
            </div>
          </template>
        </div>
      </div>
    </div>
  </teleport>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  commands: { type: Array, default: () => [] }
})
const emit = defineEmits(['close', 'executed'])

const query = ref('')
const activeIndex = ref(0)
const inputRef = ref(null)
const listRef = ref(null)

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
      if (ti === 0 || /[\s:·]/.test(text[ti - 1])) score += 3
      score += 1
      lastMatch = ti
      qi++
    }
  }
  return qi === ql.length ? { score, indices } : null
}

// 拼接可搜索文本：标题 + 关键词别名
function searchableText(cmd) {
  return cmd.title + (cmd.keywords ? ' ' + cmd.keywords : '')
}

const filtered = computed(() => {
  const q = query.value.trim()
  let list
  if (!q) {
    list = props.commands.map(cmd => ({ ...cmd, score: 0, idx: null }))
  } else {
    const scored = []
    for (const cmd of props.commands) {
      const m = fuzzyMatch(q, searchableText(cmd))
      if (!m) continue
      const mt = fuzzyMatch(q, cmd.title)
      // 标题直接命中权重更高
      scored.push({ ...cmd, score: (mt ? mt.score * 2 : 0) + m.score, idx: mt?.indices })
    }
    scored.sort((a, b) => b.score - a.score)
    list = scored
  }
  // 标注每组第一条，用于渲染分组标题
  const seen = new Set()
  return list.map(item => {
    const firstOfSection = !seen.has(item.section)
    seen.add(item.section)
    return { ...item, _firstOfSection: firstOfSection }
  })
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
  emit('close')
}

function run(item) {
  if (!item) return
  close()
  emit('executed', item.id)
  // 延迟执行：等面板关闭后再运行动作（部分动作会抢焦点）
  setTimeout(() => {
    try { item.run?.() } catch (e) { console.error('[CommandPalette]', e) }
  }, 50)
}

function scrollActiveIntoView() {
  nextTick(() => {
    const el = listRef.value?.querySelector('.cp-item.active')
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
    run(filtered.value[activeIndex.value])
  } else if (e.key === 'Escape') {
    e.preventDefault()
    close()
  }
}

watch(query, () => { activeIndex.value = 0 })

watch(filtered, (list) => {
  if (activeIndex.value >= list.length) activeIndex.value = Math.max(0, list.length - 1)
})

watch(() => props.visible, (v) => {
  if (v) {
    query.value = ''
    activeIndex.value = 0
    nextTick(() => inputRef.value?.focus())
  }
})
</script>

<style scoped>
.cp-overlay {
  position: fixed;
  inset: 0;
  z-index: 9000;
  background: rgba(0, 0, 0, 0.28);
  display: flex;
  justify-content: center;
  align-items: flex-start;
}

.cp-panel {
  margin-top: 80px;
  width: 560px;
  max-width: calc(100vw - 48px);
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.28);
  overflow: hidden;
}

.cp-input-wrap {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-color);
}

.cp-input {
  width: 100%;
  height: 30px;
  border: none;
  outline: none;
  background: transparent;
  color: var(--text-primary);
  font-size: 14px;
}

.cp-input::placeholder {
  color: var(--text-muted);
}

.cp-list {
  max-height: 420px;
  overflow-y: auto;
  padding: 4px 0;
}

.cp-empty {
  padding: 20px;
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
}

.cp-section {
  padding: 8px 12px 4px;
  font-size: 11px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.cp-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  height: 34px;
  padding: 0 12px;
  cursor: pointer;
}

.cp-item.active {
  background: var(--hover-bg);
}

.cp-title {
  font-size: 13px;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cp-hint {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--text-muted);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 1px 6px;
  font-family: 'Consolas', monospace;
}

.cp-item :deep(.hl) {
  color: var(--accent-color);
  font-weight: 600;
}
</style>
