<template>
  <div class="file-tree">
    <div
      v-for="node in nodes"
      :key="node.path"
      class="tree-node"
      :class="{ selected: node.path === selectedPath }"
    >
      <div
        class="tree-node-content"
        @click="onNodeClick(node)"
        @contextmenu.prevent="onContextMenu($event, node)"
        :style="{ paddingLeft: paddingLeft + 'px' }"
      >
        <span v-if="node.type === 'directory'" class="tree-arrow" @click.stop="toggleExpand(node)">
          {{ node.isExpanded ? '\u25BC' : '\u25B6' }}
        </span>
        <span class="tree-icon">{{ getNodeIcon(node) }}</span>
        <span class="tree-name">{{ node.name }}</span>
      </div>
      <div v-if="node.type === 'directory' && node.isExpanded && node.children && node.children.length > 0" class="tree-children">
        <FileTree :nodes="node.children" :depth="depth + 1" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useEditorStore } from '@/stores/editorStore'

const props = defineProps({
  nodes: { type: Array, default: () => [] },
  depth: { type: Number, default: 0 }
})

const store = useEditorStore()
const selectedPath = ref(null)

const paddingLeft = computed(() => props.depth * 16 + 8)

function getNodeIcon(node) {
  if (node.type === 'directory') {
    return node.isExpanded ? '\uD83D\uDCC2' : '\uD83D\uDCC1'
  }
  const ext = node.ext || ''
  const icons = {
    '.md': '\uD83D\uDCDD', '.markdown': '\uD83D\uDCDD', '.txt': '\uD83D\uDCC4',
    '.json': '\uD83D\uDCCB', '.js': '\uD83D\uDCDC', '.ts': '\uD83D\uDCD8',
    '.vue': '\uD83D\uDFE2', '.css': '\uD83C\uDFA8', '.html': '\uD83C\uDF10'
  }
  return icons[ext] || '\uD83D\uDCC4'
}

function toggleExpand(node) {
  node.isExpanded = !node.isExpanded
}

async function onNodeClick(node) {
  if (node.type === 'directory') {
    toggleExpand(node)
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

function onContextMenu(event, node) {
  // Simplified - will use native menu via IPC in future
}
</script>

<style scoped>
.tree-node-content {
  cursor: pointer;
}
.tree-node.selected > .tree-node-content {
  background: var(--accent-color);
  color: #fff;
  border-radius: 4px;
}
.tree-node.selected > .tree-node-content:hover {
  filter: brightness(1.15);
}
</style>
