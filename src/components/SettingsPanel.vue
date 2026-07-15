<template>
  <div class="settings-overlay" v-if="store.showSettings" @click.self="close">
    <div class="settings-panel">
      <div class="settings-header">
        <h2>设置</h2>
        <button class="close-btn" @click="close">✕</button>
      </div>

      <div class="settings-body">
        <nav class="settings-nav">
          <button
            v-for="section in sections"
            :key="section.id"
            class="nav-item"
            :class="{ active: activeSection === section.id }"
            @click="activeSection = section.id"
          >{{ section.label }}</button>
        </nav>

        <div class="settings-content">
          <!-- 外观 -->
          <div v-show="activeSection === 'appearance'" class="settings-form">
            <div class="form-group">
              <label>主题模式</label>
              <select v-model="localSettings.theme">
                <option value="system">跟随系统</option>
                <option value="light">浅色</option>
                <option value="dark">深色</option>
              </select>
            </div>
            <div class="form-group">
              <label>编辑器字体</label>
              <select v-model="localSettings.editorFontFamily">
                <option value="'JetBrains Mono', monospace">JetBrains Mono</option>
                <option value="'Cascadia Code', monospace">Cascadia Code</option>
                <option value="'Fira Code', monospace">Fira Code</option>
                <option value="'Source Code Pro', monospace">Source Code Pro</option>
                <option value="'Consolas', monospace">Consolas</option>
                <option value="monospace">系统默认等宽</option>
              </select>
            </div>
            <div class="form-group">
              <label>编辑器字号 ({{ localSettings.editorFontSize }}px)</label>
              <input type="range" v-model.number="localSettings.editorFontSize" min="12" max="32" step="1" />
            </div>
            <div class="form-group">
              <label>预览字体</label>
              <select v-model="localSettings.previewFontFamily">
                <option value="-apple-system, 'Microsoft YaHei', sans-serif">系统默认</option>
                <option value="'Microsoft YaHei', sans-serif">微软雅黑</option>
                <option value="'PingFang SC', sans-serif">苹方</option>
                <option value="'Noto Sans SC', sans-serif">Noto Sans SC</option>
                <option value="'Songti SC', serif">宋体</option>
              </select>
            </div>
            <div class="form-group">
              <label>预览字号 ({{ localSettings.previewFontSize }}px)</label>
              <input type="range" v-model.number="localSettings.previewFontSize" min="12" max="32" step="1" />
            </div>
            <div class="form-group">
              <label>行高 ({{ localSettings.lineHeight }})</label>
              <input type="range" v-model.number="localSettings.lineHeight" min="1.2" max="2.0" step="0.1" />
            </div>
          </div>

          <!-- 编辑器 -->
          <div v-show="activeSection === 'editor'" class="settings-form">
            <div class="form-group">
              <label>Tab 大小</label>
              <select v-model.number="localSettings.tabSize">
                <option :value="2">2</option>
                <option :value="4">4</option>
                <option :value="8">8</option>
              </select>
            </div>
            <div class="form-group">
              <label class="toggle-label">
                <input type="checkbox" v-model="localSettings.wordWrap" />
                <span>自动换行</span>
              </label>
            </div>
            <div class="form-group">
              <label class="toggle-label">
                <input type="checkbox" v-model="localSettings.showLineNumbers" />
                <span>显示行号</span>
              </label>
            </div>
            <div class="form-group">
              <label class="toggle-label">
                <input type="checkbox" v-model="localSettings.highlightActiveLine" />
                <span>活跃行高亮</span>
              </label>
            </div>
            <div class="form-group">
              <label class="toggle-label">
                <input type="checkbox" v-model="localSettings.matchBrackets" />
                <span>括号匹配</span>
              </label>
            </div>
            <div class="form-group">
              <label class="toggle-label">
                <input type="checkbox" v-model="localSettings.codeFolding" />
                <span>代码折叠</span>
              </label>
            </div>
          </div>

          <!-- 预览 -->
          <div v-show="activeSection === 'preview'" class="settings-form">
            <div class="form-group">
              <label class="toggle-label">
                <input type="checkbox" v-model="localSettings.scrollSync" />
                <span>同步滚动</span>
              </label>
            </div>
            <div class="form-group">
              <label>默认视图</label>
              <select v-model="localSettings.viewMode">
                <option value="dual">双栏模式</option>
                <option value="edit">纯编辑模式</option>
                <option value="preview">纯预览模式</option>
              </select>
            </div>
          </div>

          <!-- 文件 -->
          <div v-show="activeSection === 'file'" class="settings-form">
            <div class="form-group">
              <label>自动保存间隔 ({{ localSettings.autoSaveInterval }} 秒)</label>
              <input type="range" v-model.number="localSettings.autoSaveInterval" min="1" max="60" step="1" />
            </div>
            <div class="form-group">
              <label>默认面板焦点</label>
              <select v-model="localSettings.defaultPanelFocus">
                <option value="filetree">文件树</option>
                <option value="toc">目录</option>
                <option value="search">搜索</option>
              </select>
            </div>
            <div class="form-group">
              <label>最近文件最大记录数</label>
              <select v-model.number="localSettings.recentFilesMax">
                <option :value="10">10</option>
                <option :value="20">20</option>
                <option :value="50">50</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div class="settings-footer">
        <button class="btn btn-secondary" @click="close">取消</button>
        <button class="btn btn-primary" @click="saveAndClose">保存</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, watch } from 'vue'
import { useEditorStore } from '@/stores/editorStore'

const store = useEditorStore()
const activeSection = ref('appearance')

const sections = [
  { id: 'appearance', label: '外观' },
  { id: 'editor', label: '编辑器' },
  { id: 'preview', label: '预览' },
  { id: 'file', label: '文件' }
]

const localSettings = reactive({ ...store.settings })

function close() {
  store.showSettings = false
}

function saveAndClose() {
  Object.assign(store.settings, localSettings)
  window.api?.setSettings({ settings: { ...store.settings } })
  close()
}
</script>

<style scoped>
.settings-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(0,0,0,0.4);
  display: flex;
  align-items: center;
  justify-content: center;
}
.settings-panel {
  width: 720px;
  max-height: 80vh;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0,0,0,0.3);
}
.settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  border-bottom: 1px solid var(--border-color);
}
.settings-header h2 { margin: 0; font-size: 18px; }
.close-btn {
  border: none;
  background: transparent;
  font-size: 18px;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
}
.close-btn:hover { background: var(--hover-bg); }
.settings-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}
.settings-nav {
  width: 140px;
  padding: 16px 0;
  border-right: 1px solid var(--border-color);
  flex-shrink: 0;
}
.nav-item {
  display: block;
  width: 100%;
  padding: 8px 20px;
  border: none;
  background: transparent;
  text-align: left;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 13px;
}
.nav-item:hover { color: var(--text-primary); background: var(--hover-bg); }
.nav-item.active { color: var(--accent-color); font-weight: 600; }
.settings-content {
  flex: 1;
  padding: 24px;
  overflow-y: auto;
}
.settings-form { max-width: 400px; }
.form-group { margin-bottom: 20px; }
.form-group label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: 500;
}
.form-group select,
.form-group input[type="text"] {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 13px;
}
.form-group input[type="range"] {
  width: 100%;
  accent-color: var(--accent-color);
}
.toggle-label {
  display: flex !important;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}
.toggle-label input[type="checkbox"] {
  accent-color: var(--accent-color);
}
.settings-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px 24px;
  border-top: 1px solid var(--border-color);
}
.btn {
  padding: 8px 20px;
  border-radius: 6px;
  border: 1px solid var(--border-color);
  cursor: pointer;
  font-size: 13px;
}
.btn-primary { background: var(--accent-color); color: #fff; border-color: var(--accent-color); }
.btn-secondary { background: var(--bg-secondary); color: var(--text-primary); }
.btn-primary:hover { filter: brightness(1.1); }
.btn-secondary:hover { background: var(--hover-bg); }
</style>
