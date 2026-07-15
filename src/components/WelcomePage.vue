<template>
  <div class="welcome-overlay" v-if="store.showWelcome">
    <div class="welcome-page">
      <div class="welcome-header">
        <h1 class="welcome-title">MdEv</h1>
        <p class="welcome-subtitle">Markdown Editor for Windows</p>
      </div>

      <div class="welcome-actions">
        <button class="welcome-btn primary" @click="newFile">
          <span class="btn-icon">📄</span>
          <span>新建文件</span>
        </button>
        <button class="welcome-btn" @click="openFile">
          <span class="btn-icon">📂</span>
          <span>打开文件</span>
        </button>
        <button class="welcome-btn" @click="openFolder">
          <span class="btn-icon">🗂️</span>
          <span>打开文件夹</span>
        </button>
      </div>

      <div class="welcome-recent" v-if="store.recentFiles.length > 0">
        <h3 class="section-title">最近文件</h3>
        <div
          v-for="file in sortedRecentFiles"
          :key="file.path"
          class="recent-item"
          @click="openRecentFile(file)"
          draggable="true"
        >
          <span class="recent-icon">📝</span>
          <span class="recent-name">{{ file.fileName }}</span>
          <span class="recent-path">{{ file.path }}</span>
          <button
            class="recent-pin"
            :class="{ pinned: file.pinned }"
            @click.stop="togglePin('file', file.path)"
          >📌</button>
        </div>
      </div>

      <div class="welcome-recent" v-if="store.recentFolders.length > 0">
        <h3 class="section-title">最近文件夹</h3>
        <div
          v-for="folder in sortedRecentFolders"
          :key="folder.path"
          class="recent-item"
          @click="openRecentFolder(folder)"
          draggable="true"
        >
          <span class="recent-icon">📁</span>
          <span class="recent-name">{{ folder.folderName }}</span>
          <span class="recent-path">{{ folder.path }}</span>
          <button
            class="recent-pin"
            :class="{ pinned: folder.pinned }"
            @click.stop="togglePin('folder', folder.path)"
          >📌</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useEditorStore } from '@/stores/editorStore'

const store = useEditorStore()

const sortedRecentFiles = computed(() => {
  const files = [...store.recentFiles]
  files.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    return new Date(b.lastOpened) - new Date(a.lastOpened)
  })
  return files
})

const sortedRecentFolders = computed(() => {
  const folders = [...store.recentFolders]
  folders.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    return new Date(b.lastOpened) - new Date(a.lastOpened)
  })
  return folders
})

function newFile() {
  store.addTab(null, '# 未命名文档\n\n开始写作...', '未命名.md')
}

async function openFile() {
  const filePath = await window.api?.openFileDialog()
  if (filePath) {
    const result = await window.api?.readFile(filePath)
    if (result?.success) {
      const fileName = filePath.split(/[\\/]/).pop()
      store.addTab(filePath, result.content, fileName)
      store.addRecentFile(filePath)
    }
  }
}

async function openFolder() {
  const folderPath = await window.api?.openFolderDialog()
  if (folderPath) {
    const result = await window.api?.readDirectory(folderPath)
    if (result?.success) {
      store.fileTree = result.tree
      store.setProjectRoot(folderPath)
    }
  }
}

async function openRecentFile(file) {
  const result = await window.api?.readFile(file.path)
  if (result?.success) {
    store.addTab(file.path, result.content, file.fileName)
    store.addRecentFile(file.path)
  }
}

async function openRecentFolder(folder) {
  const result = await window.api?.readDirectory(folder.path)
  if (result?.success) {
    store.fileTree = result.tree
    store.setProjectRoot(folder.path)
  }
}

function togglePin(type, path) {
  store.toggleRecentPin(type, path)
}
</script>

<style scoped>
.welcome-overlay {
  position: fixed;
  inset: 0;
  z-index: 10;
  background: var(--bg-primary);
  display: flex;
  align-items: center;
  justify-content: center;
}
.welcome-page {
  max-width: 600px;
  width: 100%;
  padding: 40px;
}
.welcome-header {
  text-align: center;
  margin-bottom: 32px;
}
.welcome-title {
  font-size: 42px;
  font-weight: 800;
  color: var(--text-primary);
  margin: 0;
  letter-spacing: -1px;
}
.welcome-subtitle {
  font-size: 14px;
  color: var(--text-muted);
  margin: 8px 0 0;
}
.welcome-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  margin-bottom: 32px;
}
.welcome-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border: 1px solid var(--border-color);
  background: var(--bg-secondary);
  color: var(--text-primary);
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.15s;
}
.welcome-btn:hover { background: var(--hover-bg); border-color: var(--accent-color); }
.welcome-btn.primary { background: var(--accent-color); color: #fff; border-color: var(--accent-color); }
.welcome-btn.primary:hover { filter: brightness(1.1); }
.btn-icon { font-size: 18px; }
.section-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 0 0 8px;
}
.recent-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
}
.recent-item:hover { background: var(--hover-bg); }
.recent-icon { font-size: 14px; }
.recent-name { font-size: 13px; color: var(--text-primary); font-weight: 500; }
.recent-path { font-size: 11px; color: var(--text-muted); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.recent-pin {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 12px;
  opacity: 0.3;
  padding: 2px;
}
.recent-pin:hover, .recent-pin.pinned { opacity: 1; }
</style>
