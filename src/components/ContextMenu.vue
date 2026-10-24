<template>
  <teleport to="body">
    <div
      v-if="visible"
      class="ctx-menu-overlay"
      @click="close"
      @contextmenu.prevent="close"
    >
      <div
        class="ctx-menu"
        :style="{ left: posX + 'px', top: posY + 'px' }"
        @click.stop
      >
        <template v-for="(item, i) in items" :key="i">
          <div v-if="item.separator" class="ctx-separator"></div>
          <div
            v-else
            class="ctx-item"
            :class="{ danger: item.danger }"
            @click="onSelect(item)"
          >
            <span v-if="item.icon" class="ctx-icon" v-html="item.icon"></span>
            <span class="ctx-label">{{ item.label }}</span>
          </div>
        </template>
      </div>
    </div>
  </teleport>
</template>

<script setup>
import { computed, watch, onBeforeUnmount } from 'vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  x: { type: Number, default: 0 },
  y: { type: Number, default: 0 },
  items: { type: Array, default: () => [] }
})

const emit = defineEmits(['close', 'select'])

const MENU_WIDTH = 200

// 防止菜单超出窗口右下边界
const posX = computed(() => Math.min(props.x, window.innerWidth - MENU_WIDTH - 8))
const posY = computed(() => {
  const estHeight = props.items.length * 30 + 12
  return Math.min(props.y, window.innerHeight - estHeight - 8)
})

function close() {
  emit('close')
}

function onSelect(item) {
  emit('select', item)
  close()
}

function onKeydown(e) {
  if (e.key === 'Escape') close()
}

watch(() => props.visible, (v) => {
  if (v) {
    document.addEventListener('keydown', onKeydown)
  } else {
    document.removeEventListener('keydown', onKeydown)
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
})
</script>

<style scoped>
.ctx-menu-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
}

.ctx-menu {
  position: fixed;
  min-width: 180px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
  padding: 4px 0;
  font-size: 13px;
  user-select: none;
}

.ctx-item {
  display: flex;
  align-items: center;
  height: 30px;
  padding: 0 12px;
  cursor: pointer;
  color: var(--text-primary);
  transition: background-color 0.1s ease;
}

.ctx-item:hover {
  background: var(--hover-bg);
}

.ctx-item.danger {
  color: #d73a49;
}

.ctx-icon {
  display: flex;
  align-items: center;
  width: 16px;
  height: 16px;
  margin-right: 8px;
  flex-shrink: 0;
}

.ctx-label {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ctx-separator {
  height: 1px;
  margin: 4px 8px;
  background: var(--border-color);
}
</style>
