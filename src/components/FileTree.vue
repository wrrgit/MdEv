<template>
  <div class="file-tree">
    <div
      v-for="(node, index) in nodes"
      :key="node.path"
      class="tree-node"
      :class="{ selected: node.path === selectedPath }"
    >
      <div
        class="tree-node-content"
        @click="onNodeClick(node)"
        @contextmenu.prevent="onContextMenu($event, node)"
        @mouseenter="hoveredPath = node.path"
        @mouseleave="hoveredPath = null"
      >
        <div class="tree-indent">
          <span
            v-for="i in depth"
            :key="i"
            class="indent-guide"
          ></span>
        </div>
        <span
          v-if="node.type === 'directory'"
          class="tree-arrow"
          :class="{ collapsed: !isExpanded(node) }"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M5.7 13.7a1 1 0 0 1 0-1.4L9.58 8 5.7 3.7a1 1 0 0 1 1.4-1.4l4.59 4.58a1 1 0 0 1 0 1.41L7.12 12.7a1 1 0 0 1-1.41 0z"/>
          </svg>
        </span>
        <span v-else class="tree-arrow-placeholder"></span>
        <span class="tree-icon" v-html="getNodeIcon(node)"></span>
        <span class="tree-name" :title="node.name">{{ node.name }}</span>
        <div v-if="node.type === 'directory' && hoveredPath === node.path" class="tree-node-actions">
          <button class="tree-action-btn" @click.stop="onNewFile(node)" title="新建文件">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M12 7H9V4a1 1 0 00-2 0v3H4a1 1 0 000 2h3v3a1 1 0 002 0V9h3a1 1 0 000-2z"/></svg>
          </button>
          <button class="tree-action-btn" @click.stop="onNewFolder(node)" title="新建文件夹">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M1.5 2.5h4.3l1.2 1.5H14a1 1 0 011 1v8a1 1 0 01-1 1H2a1 1 0 01-1-1V3a.5.5 0 01.5-.5zm8.5 5h-2v2H7v-2H5V6h2V4h1v2h2v1z"/></svg>
          </button>
        </div>
      </div>
      <div v-if="node.type === 'directory' && isExpanded(node) && node.children && node.children.length > 0" class="tree-children">
        <FileTree :nodes="node.children" :depth="depth + 1" />
      </div>
      <div v-if="node.type === 'directory' && isExpanded(node) && node.children && node.children.length === 0" class="tree-empty">
        <div class="tree-node-content tree-empty-content">
          <div class="tree-indent">
            <span v-for="i in depth + 1" :key="i" class="indent-guide"></span>
          </div>
          <span class="tree-arrow-placeholder"></span>
          <span class="empty-label">空文件夹</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useEditorStore } from '@/stores/editorStore'

const props = defineProps({
  nodes: { type: Array, default: () => [] },
  depth: { type: Number, default: 0 }
})

const store = useEditorStore()
const selectedPath = ref(null)
const hoveredPath = ref(null)

function isExpanded(node) {
  return store.isPathExpanded(node.path)
}

const FOLDER_CLOSED_SVG = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
  <path d="M1.5 2.5h4.3l1.2 1.5h7.5v9.5H1.5V2.5z" fill="var(--icon-folder-fill, #dcb67a)" stroke="var(--icon-folder-stroke, #c0925a)" stroke-width="0.8"/>
  <path d="M1.5 5h13l-1.5 8.5H3L1.5 5z" fill="var(--icon-folder-fill, #dcb67a)" stroke="var(--icon-folder-stroke, #c0925a)" stroke-width="0.8"/>
</svg>`

const FOLDER_OPEN_SVG = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
  <path d="M1 3h4.5L7 4.5h7.5v2H1V3z" fill="var(--icon-folder-fill, #dcb67a)" stroke="var(--icon-folder-stroke, #c0925a)" stroke-width="0.8"/>
  <path d="M1 6.5h13.5L13 13.5H2.5L1 6.5z" fill="var(--icon-folder-open-fill, #e8c988)" stroke="var(--icon-folder-stroke, #c0925a)" stroke-width="0.8"/>
</svg>`

function getNodeIcon(node) {
  if (node.type === 'directory') {
    return isExpanded(node) ? FOLDER_OPEN_SVG : FOLDER_CLOSED_SVG
  }
  const ext = node.ext || ''
  const iconMap = {
    '.md': 'var(--icon-md, #519aba)',
    '.markdown': 'var(--icon-md, #519aba)',
    '.txt': 'var(--icon-text, #8b949e)',
    '.json': 'var(--icon-json, #cbcb41)',
    '.js': 'var(--icon-js, #cbcb41)',
    '.ts': 'var(--icon-ts, #3178c6)',
    '.vue': 'var(--icon-vue, #42b883)',
    '.css': 'var(--icon-css, #563d7c)',
    '.html': 'var(--icon-html, #e34c26)',
    '.py': 'var(--icon-py, #3572a5)',
    '.yml': 'var(--icon-yaml, #cb171e)',
    '.yaml': 'var(--icon-yaml, #cb171e)',
    '.xml': 'var(--icon-xml, #e44d26)',
    '.sh': 'var(--icon-shell, #89e051)',
    '.bash': 'var(--icon-shell, #89e051)',
  }
  const color = iconMap[ext] || 'var(--icon-file, #8b949e)'
  const letter = getFileLetter(ext)
  return `<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M3 1h7l3 3v11H3V1z" fill="${color}" opacity="0.18"/>
    <path d="M3 1h7l3 3v11H3V1z" stroke="${color}" stroke-width="0.9" stroke-linejoin="round"/>
    <path d="M10 1v3h3" stroke="${color}" stroke-width="0.9" stroke-linejoin="round"/>
    <text x="8" y="11.5" text-anchor="middle" font-size="5.5" font-weight="600" font-family="system-ui, sans-serif" fill="${color}">${letter}</text>
  </svg>`
}

function getFileLetter(ext) {
  const map = {
    '.md': 'M', '.markdown': 'M', '.txt': 'T', '.json': '{}',
    '.js': 'JS', '.ts': 'TS', '.vue': 'V', '.css': '#',
    '.html': '</>', '.py': 'Py', '.yml': 'Y', '.yaml': 'Y',
    '.xml': 'X', '.sh': '$', '.bash': '$',
  }
  return map[ext] || '#'
}

async function onNodeClick(node) {
  if (node.type === 'directory') {
    store.togglePathExpanded(node.path)
    return
  }
  selectedPath.value = node.path
  const result = await window.api?.readFile(node.path)
  if (result && result.success) {
    const existing = store.tabs.find(t => t.filePath === node.path)
    if (existing) {
      store.setActiveTab(existing.id)
    } else {
      store.addTab(node.path, result.content, node.name)
    }
    store.addRecentFile(node.path)
  }
}

async function onNewFile(parentNode) {
  const name = await window.api?.showInputBox({ title: '新建文件', label: '文件名：', value: 'untitled.md' })
  if (!name) return
  const sep = parentNode.path.includes('/') ? '/' : '\\'
  const filePath = parentNode.path + sep + name
  const exists = await window.api?.exists(filePath)
  if (exists) {
    alert('文件已存在')
    return
  }
  const result = await window.api?.createFile(filePath)
  if (result?.success) {
    store.expandPath(parentNode.path)
    await refreshTree()
  }
}

async function onNewFolder(parentNode) {
  const name = await window.api?.showInputBox({ title: '新建文件夹', label: '文件夹名：', value: 'new-folder' })
  if (!name) return
  const sep = parentNode.path.includes('/') ? '/' : '\\'
  const dirPath = parentNode.path + sep + name
  const exists = await window.api?.exists(dirPath)
  if (exists) {
    alert('文件夹已存在')
    return
  }
  const result = await window.api?.createDirectory(dirPath)
  if (result?.success) {
    store.expandPath(parentNode.path)
    await refreshTree()
  }
}

async function refreshTree() {
  if (!store.projectRoot) return
  const result = await window.api?.readDirectory(store.projectRoot)
  if (result?.success) {
    store.applyExpandedToTree(result.tree)
    store.fileTree = result.tree
  }
}

function onContextMenu(event, node) {
}
</script>

<style scoped>
.file-tree {
  font-size: 13px;
  line-height: 1;
  user-select: none;
}

.tree-node-content {
  display: flex;
  align-items: center;
  height: 26px;
  padding-right: 8px;
  cursor: pointer;
  border-radius: 4px;
  margin: 0 6px;
  transition: background-color 0.12s ease;
  position: relative;
}

.tree-node-content:hover {
  background: var(--tree-hover-bg, rgba(56, 58, 64, 0.12));
}

.tree-node.selected > .tree-node-content {
  background: var(--tree-selected-bg, rgba(3, 102, 214, 0.14));
}

.tree-node.selected > .tree-node-content:hover {
  background: var(--tree-selected-hover-bg, rgba(3, 102, 214, 0.2));
}

.tree-indent {
  display: flex;
  flex-shrink: 0;
}

.indent-guide {
  width: 16px;
  height: 26px;
  position: relative;
  flex-shrink: 0;
}

.indent-guide::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 7px;
  width: 1px;
  background: var(--tree-indent-guide, var(--border-color));
  opacity: 0.4;
  transition: opacity 0.15s;
}

.tree-node-content:hover .indent-guide::before {
  opacity: 0.8;
}

.tree-arrow {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  color: var(--text-muted);
  transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), color 0.15s;
  border-radius: 3px;
}

.tree-arrow.collapsed {
  transform: rotate(-90deg);
}

.tree-arrow-placeholder {
  width: 18px;
  flex-shrink: 0;
}

.tree-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  margin-right: 6px;
  flex-shrink: 0;
}

.tree-icon :deep(svg) {
  display: block;
}

.tree-name {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 13px;
  line-height: 26px;
  color: var(--text-primary);
}

.tree-node.selected > .tree-node-content .tree-name {
  font-weight: 500;
}

.tree-node-actions {
  display: flex;
  align-items: center;
  gap: 1px;
  margin-left: auto;
  flex-shrink: 0;
}

.tree-action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--text-muted);
  border-radius: 3px;
  padding: 0;
  transition: color 0.12s, background 0.12s;
}

.tree-action-btn:hover {
  color: var(--text-primary);
  background: var(--active-bg);
}

.tree-children {
  overflow: hidden;
}

.tree-empty {
  opacity: 0.45;
}

.tree-empty-content {
  cursor: default;
}

.tree-empty-content:hover {
  background: transparent !important;
}

.empty-label {
  font-size: 12px;
  color: var(--text-muted);
  font-style: italic;
  line-height: 26px;
}
</style>

<style>
[data-theme="dark"] {
  --icon-folder-fill: #8b7b58;
  --icon-folder-stroke: #6e6040;
  --icon-folder-open-fill: #7a6c4e;
  --icon-md: #519aba;
  --icon-json: #cbcb41;
  --icon-js: #f0d04a;
  --icon-ts: #3178c6;
  --icon-vue: #42b883;
  --icon-css: #9370db;
  --icon-html: #e34c26;
  --icon-py: #519aba;
  --icon-yaml: #e44d26;
  --icon-xml: #e44d26;
  --icon-shell: #89e051;
  --icon-text: #8b949e;
  --icon-file: #8b949e;
  --tree-selected-bg: rgba(88, 166, 255, 0.14);
  --tree-selected-hover-bg: rgba(88, 166, 255, 0.22);
  --tree-selected-fg: #c9d1d9;
  --tree-indent-guide: #30363d;
  --tree-hover-bg: rgba(88, 166, 255, 0.08);
}

[data-theme="light"],
:root {
  --icon-folder-fill: #dcb67a;
  --icon-folder-stroke: #c0925a;
  --icon-folder-open-fill: #e8c988;
  --icon-md: #519aba;
  --icon-json: #cbcb41;
  --icon-js: #cbcb41;
  --icon-ts: #3178c6;
  --icon-vue: #42b883;
  --icon-css: #563d7c;
  --icon-html: #e34c26;
  --icon-py: #3572a5;
  --icon-yaml: #cb171e;
  --icon-xml: #e44d26;
  --icon-shell: #89e051;
  --icon-text: #8b949e;
  --icon-file: #8b949e;
  --tree-selected-bg: rgba(3, 102, 214, 0.14);
  --tree-selected-hover-bg: rgba(3, 102, 214, 0.2);
  --tree-selected-fg: #24292e;
  --tree-indent-guide: #e1e4e8;
  --tree-hover-bg: rgba(56, 58, 64, 0.1);
}
</style>
