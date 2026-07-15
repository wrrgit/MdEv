# 架构设计文档

## 1. 技术选型

| 层级 | 技术 | 版本 | 说明 |
|------|------|------|------|
| 桌面壳 | **Electron** | ^33.0 | 原生窗口、文件系统、菜单栏、IPC |
| UI 框架 | **Vue 3** | ^3.4 | Composition API + `<script setup>` |
| 构建工具 | **Vite 5** | ^5.4 | HMR 极速开发 |
| 状态管理 | **Pinia** | ^2.1 | 全局状态管理 |
| 代码编辑器 | **CodeMirror 6** | ^6.0 | 高性能文本编辑、模块化扩展 |
| Vue 绑定 | **vue-codemirror** | ^6.1 | CodeMirror 6 的 Vue 3 封装 |
| Markdown 解析 | **markdown-it** | ^14.0 | 快速、可扩展的 MD → HTML |
| 数学公式 | **KaTeX** | ^0.16 | LaTeX 公式渲染（通过 markdown-it-texmath） |
| 代码高亮 | **highlight.js** | ^11.9 | 180+ 语言语法着色 |
| 安全过滤 | **DOMPurify** | ^3.0 | XSS 防护 |
| 样式基础 | **github-markdown-css** | ^5.5 | GitHub 风格预览 CSS |
| 图表 | **Mermaid** | ^11.0 | 流程图/时序图/Gantt 图表渲染 |
| 导出辅助 | **html2canvas + jspdf** | latest | PDF/图片导出 |
| ZIP 打包 | **jszip** | ^3.10 | 项目 ZIP 导出 |

## 2. 整体架构

```
┌────────────────────────────────────────────────────────────────────┐
│                        Electron Main Process                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │  Window  │  │   Menu   │  │   IPC    │  │  File Handlers    │  │
│  │ Manager  │  │   Bar    │  │  Router  │  │  (read/write/     │  │
│  │          │  │          │  │          │  │   watch/search)   │  │
│  └──────────┘  └──────────┘  └──────────┘  └───────────────────┘  │
│                               │                                    │
│                     preload.js (contextBridge)                      │
│                               │                                    │
├───────────────────────────────┴────────────────────────────────────┤
│                      Renderer Process (Vue 3)                      │
│                                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │  Pinia   │  │Composables│  │  Vue     │  │   Core Modules    │  │
│  │  Store   │◀─┤  (hooks) │──┤Components│──┤  (markdown-it,    │  │
│  │          │  │          │  │          │  │   CodeMirror, etc) │  │
│  └──────────┘  └──────────┘  └──────────┘  └───────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
```

## 3. 进程模型

### 主进程 (Main Process)
- **electron/main.js**: 窗口创建、应用生命周期、原生菜单
- **electron/ipc/fileHandlers.js**: 文件读写、目录递归扫描、fs.watch 监听
- **electron/ipc/searchHandlers.js**: 跨文件全文搜索（递归目录 + 正则匹配）
- **electron/ipc/exportHandlers.js**: PDF 导出（printToPDF）、图片导出、ZIP 导出
- **electron/ipc/settingsHandlers.js**: 配置文件（electron-store）读写

### 预加载脚本 (Preload)
- **electron/preload.js**: 通过 `contextBridge.exposeInMainWorld` 暴露安全 API
- 所有渲染进程操作文件必须经过 IPC → 主进程 → 文件系统

### 渲染进程 (Renderer)
- 标准 Vue 3 SPA
- 所有文件操作通过 `window.api.*`（preload 暴露的接口）

## 4. 数据流

```
用户输入 ──→ CodeMirror 6 ──→ editorStore.content (Pinia)
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
              useAutoSave      PreviewPane      TocPanel
                 (3s防抖)     (markdown-it)    (heading 提取)
                    │               │               │
                    ▼               ▼               ▼
              IPC write       DOM 渲染          TOC 树渲染
              → fs.writeFile
```

## 5. 组件树

```
App.vue
├── TitleBar.vue              # 标题栏（文件名 + 窗口控制）
├── TabBar.vue                 # 多标签页（拖拽排序、dirty标记）
├── Toolbar.vue                # 工具栏（数据驱动按钮）
├── main-content (flex row)
│   ├── PanelSidebar.vue       # 左侧面板容器
│   │   ├── FileTree.vue       # 工程文件树
│   │   ├── TocPanel.vue       # 目录导航
│   │   └── SearchPanel.vue    # 搜索面板
│   ├── EditorPane.vue         # 中央编辑区（CodeMirror 6）
│   └── PreviewPane.vue        # 右侧预览区
├── StatusBar.vue              # 底栏
└── Overlay Components
    ├── WelcomePage.vue        # 欢迎页
    ├── ExportDialog.vue       # 导出对话框
    ├── SettingsPanel.vue      # 设置面板
    └── FontImportDialog.vue   # 字体导入
```

## 6. Pinia Store 设计

```js
editorStore = {
  // ── 多标签 ──
  tabs: [
    { id, filePath, fileName, content, isDirty, scrollPos, cursorPos }
  ],
  activeTabId: string,

  // ── 项目 ──
  projectRoot: string | null,
  fileTree: TreeNode[],

  // ── 搜索 ──
  searchQuery: string,
  searchResults: SearchResult[],
  searchMode: 'file' | 'global',

  // ── 预览 ──
  viewMode: 'dual' | 'edit' | 'preview',
  scrollSyncEnabled: boolean,

  // ── 设置 ──
  settings: {
    theme: 'system' | 'light' | 'dark',
    editorFontFamily: string,
    editorFontSize: number,
    previewFontFamily: string,
    previewFontSize: number,
    tabSize: number,
    wordWrap: boolean,
    showLineNumbers: boolean,
    autoSaveInterval: number,
    defaultPanelFocus: 'filetree' | 'toc' | 'search',
    recentFilesMax: number,
  },

  // ── 最近文件 ──
  recentFiles: [{ path, pinned, lastOpened }],
  recentFolders: [{ path, pinned, lastOpened }],
}
```

## 7. 关键设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 编辑器引擎 | CodeMirror 6 | 轻量(~200KB)、模块化、Vue 生态好、适合 prose 编辑 |
| 桌面框架 | Electron | 成熟稳定、文件系统 API 丰富、社区庞大 |
| 状态管理 | Pinia | Vue 3 官方推荐、TypeScript 友好、简洁 |
| 主题系统 | CSS 变量 | 运行时切换、无重渲染、易扩展 |
| 快捷键 | CodeMirror keymap + Electron Menu accelerator | 分层可组合 |
| 文件监听 | fs.watch (主进程) | 原生性能、无需第三方轮询 |
