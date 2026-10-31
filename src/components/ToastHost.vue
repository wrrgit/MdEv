<template>
  <teleport to="body">
    <div class="toast-host">
      <transition-group name="toast" tag="div">
        <div
          v-for="t in toasts"
          :key="t.id"
          class="toast"
          :class="'toast-' + t.type"
          @click="dismiss(t.id)"
        >{{ t.message }}</div>
      </transition-group>
    </div>
  </teleport>
</template>

<script setup>
import { useToast } from '@/composables/useToast'

const { toasts, dismiss } = useToast()
</script>

<style scoped>
.toast-host {
  position: fixed;
  right: 24px;
  bottom: 52px;
  z-index: 9000;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
  pointer-events: none;
}
.toast {
  pointer-events: auto;
  min-width: 160px;
  max-width: 320px;
  padding: 10px 16px;
  background: var(--bg-primary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-left: 3px solid var(--accent-color);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.22);
  font-size: 13px;
  line-height: 1.4;
  cursor: pointer;
  user-select: none;
}
.toast-info { border-left-color: var(--accent-color); }
.toast-success { border-left-color: #2e9e5b; }
.toast-warning { border-left-color: #e78333; }
.toast-error { border-left-color: #c0392b; }

.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.toast-enter-from {
  opacity: 0;
  transform: translateY(12px);
}
.toast-leave-to {
  opacity: 0;
  transform: translateX(20px);
}
</style>
