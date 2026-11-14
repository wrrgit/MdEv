<template>
  <div v-if="visible" class="lf-modal-mask" @click.self="$emit('cancel')">
    <div class="lf-modal" role="dialog" aria-modal="true">
      <div class="lf-modal-icon">⚠</div>
      <h3 class="lf-modal-title">大文件确认</h3>
      <p class="lf-modal-file">{{ fileName }}</p>
      <p class="lf-modal-info">
        文件大小为 <strong>{{ sizeText }}</strong>，已开启「大文件模式」。
        <template v-if="truncatedText">
          <br />{{ truncatedText }}，编辑将受限。
        </template>
      </p>
      <p class="lf-modal-desc">
        大文件模式下：编辑器关闭语法高亮与自动换行、预览暂停自动刷新（可手动刷新），以保证流畅打开与编辑。
      </p>
      <div class="lf-modal-actions">
        <button class="lf-btn lf-btn-primary" @click="$emit('confirm')">仅编辑模式打开</button>
        <button class="lf-btn" @click="$emit('cancel')">取消</button>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  visible: { type: Boolean, default: false },
  fileName: { type: String, default: '' },
  sizeText: { type: String, default: '' },
  truncatedText: { type: String, default: '' }
})
defineEmits(['confirm', 'cancel'])
</script>

<style scoped>
.lf-modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.lf-modal {
  width: 420px;
  max-width: calc(100vw - 32px);
  background: var(--bg-primary, #fff);
  border: 1px solid var(--border-color, #ddd);
  border-radius: 10px;
  padding: 24px 24px 20px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.28);
}
.lf-modal-icon {
  font-size: 28px;
  color: #e67e22;
  text-align: center;
  line-height: 1;
}
.lf-modal-title {
  margin: 10px 0 6px;
  font-size: 17px;
  font-weight: 700;
  text-align: center;
  color: var(--text-primary, #222);
}
.lf-modal-file {
  margin: 0 0 10px;
  text-align: center;
  font-size: 13px;
  word-break: break-all;
  color: var(--text-secondary, #555);
}
.lf-modal-info {
  margin: 0 0 8px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-primary, #333);
}
.lf-modal-desc {
  margin: 0 0 18px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-muted, #888);
}
.lf-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
.lf-btn {
  padding: 7px 16px;
  border: 1px solid var(--border-color, #ccc);
  border-radius: 6px;
  background: var(--bg-secondary, #f3f3f3);
  color: var(--text-primary, #333);
  font-size: 13px;
  cursor: pointer;
}
.lf-btn:hover { background: var(--hover-bg, #e8e8e8); }
.lf-btn-primary {
  background: var(--accent-color, #0366d6);
  border-color: var(--accent-color, #0366d6);
  color: #fff;
}
.lf-btn-primary:hover { filter: brightness(1.06); }
</style>
