<template>
  <div class="status-bar" v-if="store.tabs.length > 0">
    <div class="status-left">
      <span class="status-item" v-if="store.activeTab">
        行 {{ store.cursorLine }}, 列 {{ store.cursorCol }}
      </span>
      <span
        class="status-item stat-item clickable"
        v-if="docStats.chars > 0"
        title="字数统计（点击查看详情）"
        @click.stop="showStatsDetail = !showStatsDetail"
      >
        {{ docStats.chars }} 字 · {{ docStats.lines }} 行 · 约 {{ docStats.readMin }} 分钟
      </span>
      <span class="status-item" v-if="fileSizeText">{{ fileSizeText }}</span>
      <span class="status-item large-badge" v-if="fileTier === 'large'">大文件</span>
      <span class="status-item huge-badge" v-if="fileTier === 'huge'">超大文件</span>
      <span class="status-item stat-item selected" v-if="selectionChars > 0">
        已选 {{ selectionChars }} 字
      </span>
    </div>
    <div class="status-right">
      <span class="status-item file-notice" v-if="store.fileChangeNotice">{{ store.fileChangeNotice }}</span>
      <button
        class="mode-toggle-btn"
        :class="{ active: store.settings.focusMode }"
        @click="store.settings.focusMode = !store.settings.focusMode"
        title="专注模式：淡化当前段落以外的内容"
      >专注</button>
      <button
        class="mode-toggle-btn"
        :class="{ active: store.settings.typewriterMode }"
        @click="store.settings.typewriterMode = !store.settings.typewriterMode"
        title="打字机模式：光标行保持垂直居中"
      >打字机</button>
      <button class="view-mode-btn" @click="cycleViewMode" :title="viewModeLabel">
        {{ viewModeLabel }}
      </button>
      <span class="status-item">UTF-8</span>
      <span class="status-item">Markdown</span>
    </div>
  </div>
  <!-- 字数统计详情弹层（对标 Obsidian 字数详情） -->
  <teleport to="body">
    <div v-if="showStatsDetail" class="stats-mask" @click="showStatsDetail = false">
      <div class="stats-popover" :style="popoverStyle" @click.stop>
        <div class="stats-row"><span>字数（CJK 字符 + 西文单词）</span><b>{{ detail.chars }}</b></div>
        <div class="stats-row"><span>字符数（不含空格）</span><b>{{ detail.charsNoSpace }}</b></div>
        <div class="stats-row"><span>字符数（含空格）</span><b>{{ detail.charsWithSpace }}</b></div>
        <div class="stats-row"><span>段落数</span><b>{{ detail.paragraphs }}</b></div>
        <div class="stats-row"><span>行数</span><b>{{ detail.lines }}</b></div>
        <div class="stats-row"><span>预计阅读时长</span><b>约 {{ detail.readMin }} 分钟</b></div>
      </div>
    </div>
  </teleport>
</template>

<script setup>
import { computed, ref, watch, onUnmounted } from 'vue'
import { useEditorStore } from '@/stores/editorStore'
import { classifyContent, byteSize, formatBytes } from '@/core/perf'

const store = useEditorStore()

const viewModeLabels = { dual: '双栏模式', edit: '编辑模式', preview: '预览模式' }
const viewModeLabel = computed(() => viewModeLabels[store.settings.viewMode] || '双栏模式')

function cycleViewMode() {
  const order = ['dual', 'edit', 'preview']
  const idx = order.indexOf(store.settings.viewMode)
  store.settings.viewMode = order[(idx + 1) % order.length]
}

// ── 字数统计（对标 Typora：CJK 字符 + 西文单词）──
function countChars(text) {
  if (!text) return 0
  const cjk = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g) || []).length
  const latinWords = (text.match(/[A-Za-z0-9]+(?:['\u2019-][A-Za-z0-9]+)*/g) || []).length
  return cjk + latinWords
}

const docStats = ref({ chars: 0, lines: 0, readMin: 0 })
const fileSizeText = ref('')
const fileTier = ref('normal')
let statsTimer = null

// 全文统计做 300ms 防抖，避免大文档每次按键重算
let lastRawContent = ''
watch(() => store.content, (val) => {
  clearTimeout(statsTimer)
  statsTimer = setTimeout(() => {
    lastRawContent = val || ''
    const chars = countChars(val)
    docStats.value = {
      chars,
      lines: val ? val.split('\n').length : 0,
      readMin: chars > 0 ? Math.max(1, Math.ceil(chars / 400)) : 0
    }
    fileSizeText.value = formatBytes(byteSize(val))
    fileTier.value = classifyContent(val).tier
  }, 300)
}, { immediate: true })

onUnmounted(() => clearTimeout(statsTimer))

const selectionChars = computed(() => countChars(store.selectionText))

// ── 字数统计详情弹层 ──
const showStatsDetail = ref(false)
const popoverStyle = ref({})
const detail = ref({ chars: 0, charsNoSpace: 0, charsWithSpace: 0, paragraphs: 0, lines: 0, readMin: 0 })

// 弹层定位到统计项上方（左对齐）
function positionPopover() {
  const el = document.querySelector('.stat-item.clickable')
  if (!el) return
  const r = el.getBoundingClientRect()
  popoverStyle.value = { left: r.left + 'px' }
}

watch(showStatsDetail, (v) => { if (v) positionPopover() })

// 详情随全文统计一起防抖更新
watch(docStats, () => {
  const val = lastRawContent
  const noSpace = (val.replace(/\s/g, '') || '').length
  detail.value = {
    chars: docStats.value.chars,
    charsNoSpace: noSpace,
    charsWithSpace: (val || '').length,
    paragraphs: val ? val.split(/\n\s*\n/).filter(p => p.trim()).length : 0,
    lines: docStats.value.lines,
    readMin: docStats.value.readMin
  }
})
</script>

<style scoped>
.status-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 32px;
  padding: 4px 12px;
  background: var(--bg-secondary);
  border-top: 1px solid var(--border-color);
  font-size: 16px;
  color: var(--text-muted);
  flex-shrink: 0;
}
.status-left, .status-right {
  display: flex;
  align-items: center;
  gap: 16px;
}
.status-item.saved { color: var(--text-muted); }
.status-item.saving { color: var(--accent-color); }
.status-item.unsaved { color: #e78333; }
.status-item.large-badge { color: #b7791f; font-weight: 600; }
.status-item.huge-badge { color: #c0392b; font-weight: 600; }
.stat-item.selected { color: var(--accent-color); }
.stat-item.clickable { cursor: pointer; }
.stat-item.clickable:hover { color: var(--accent-color); }
.stats-mask {
  position: fixed;
  inset: 0;
  z-index: 8000;
}
.stats-popover {
  position: fixed;
  bottom: 44px;
  min-width: 280px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.22);
  padding: 12px 16px;
  font-size: 13px;
}
.stats-row {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  padding: 4px 0;
  color: var(--text-secondary);
}
.stats-row b { color: var(--text-primary); font-weight: 600; }
.status-item.file-notice {
  color: var(--accent-color);
  font-size: 13px;
  animation: notice-fade 0.3s ease-in;
}
@keyframes notice-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}
.view-mode-btn {
  background: transparent;
  border: none;
  color: var(--accent-color);
  cursor: pointer;
  font-size: 16px;
  font-weight: 500;
  font-family: -apple-system, 'Microsoft YaHei', 'PingFang SC', sans-serif;
  padding: 2px 6px;
  letter-spacing: 0.5px;
  transition: color 0.12s;
  white-space: nowrap;
}
.view-mode-btn:hover {
  color: var(--text-primary);
}
.mode-toggle-btn {
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 13px;
  font-family: -apple-system, 'Microsoft YaHei', 'PingFang SC', sans-serif;
  padding: 2px 6px;
  border-radius: 4px;
  white-space: nowrap;
  transition: color 0.12s, background-color 0.12s;
}
.mode-toggle-btn:hover {
  color: var(--text-primary);
  background: var(--hover-bg);
}
.mode-toggle-btn.active {
  color: var(--accent-color);
  font-weight: 600;
}
</style>
