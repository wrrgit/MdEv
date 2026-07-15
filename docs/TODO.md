# 实施计划

## 图例
- [x] 已完成
- [ ] 待完成
- [!] 已知 Bug / 阻塞中
- [~] 部分完成

---

## Step 1: 项目初始化脚手架 ✅
**核心产出**: package.json, vite.config.js, 依赖安装, 基础目录结构
- [x] 创建 package.json
- [x] 配置 vite.config.js (vue 插件 + electron 插件)
- [x] 安装所有依赖
- [x] 创建目录结构 (electron/ src/ src/components/ src/composables/ etc.)
- [x] 创建 index.html 入口
- [x] 创建 src/main.js Vue 入口
- [x] 配置 electron-builder 打包脚本

## Step 2: Electron 主进程 ✅
**核心产出**: electron/main.js, electron/preload.cjs
- [x] 窗口创建 + 大小/位置记忆 (保存到 userData/window-bounds.json，首次打开 3/5 屏幕)
- [x] 无边框窗口 (frame: false) + 自定义标题栏
- [x] 原生菜单栏（文件/编辑/视图/帮助）— 隐藏在无边框窗口中
- [x] preload.cjs contextBridge API (CJS 格式，因 Electron require() 加载)
- [x] IPC 通道注册框架
- [x] 开发模式与生产模式区分

## Step 3: IPC 文件/目录操作 ✅
**核心产出**: electron/ipc/fileHandlers.js, electron/ipc/searchHandlers.js
- [x] 文件读写 (readFile / writeFile)
- [x] 目录递归扫描 (readDirectory recursive)
- [x] fs.watch 文件变更监听
- [x] 文件系统操作 (mkdir / rename / unlink)
- [x] dialog 调用 (openFile / openDirectory / saveDialog)
- [x] 跨文件全文搜索 (递归遍历 + 正则匹配)

## Step 4: 主布局 + 多标签页 ✅
**核心产出**: App.vue, TabBar.vue, editorStore.js
- [x] App.vue 主布局 (flex column + flex row 三栏)
- [x] Pinia editorStore 定义
- [x] TabBar 组件（标签渲染、切换、关闭）
- [x] 标签拖拽排序
- [x] 右键菜单（关闭/关闭其他/关闭右侧/复制路径）
- [x] 标签未保存标记 (●)

## Step 5: CodeMirror 6 编辑器组件 ✅
**核心产出**: EditorPane.vue
- [x] CodeMirror 6 集成（vue-codemirror）
- [x] Markdown 语言 + 语法高亮
- [x] 搜索扩展 (@codemirror/search)
- [x] 快捷键扩展（Ctrl+B/I/S 等）
- [x] 主题（浅色/深色）— EditorView.theme + oneDark
- [x] 编辑器设置项绑定（字体/字号/Tab/换行等）
- [x] 双向绑定 → editorStore.activeTab.content
- [x] @ready 事件正确提取 payload.view → window.editorRef

## Step 6: 实时预览组件 ✅ (预览滚动条 Bug 未修)
**核心产出**: PreviewPane.vue, core/markdown/parser.js
- [x] markdown-it 配置 + 插件注册
- [x] KaTeX 数学公式渲染
- [x] highlight.js 代码高亮
- [x] Mermaid 图表渲染
- [x] DOMPurify XSS 过滤
- [x] 150ms 防抖更新
- [x] 同步滚动（编辑 → 预览）
- [x] 预览视图模式切换（双栏/纯编辑/纯预览）
- [!] **预览区滚动条在默认窗口大小下不显示** — 需要 `min-height: 0` 修复 flex 链尚未生效

## Step 7: 工具栏 ✅
**核心产出**: Toolbar.vue, config/toolbar.js
- [x] 数据驱动的按钮配置（下拉菜单样式）
- [x] 文字样式（B/I/S/U/Code）
- [x] 标题（H1-H6）
- [x] 段落（引用/水平线/换行）
- [x] 列表（无序/有序/任务）
- [x] 插入（链接/图片/表格/代码块/公式/Mermaid）
- [x] 撤销/重做
- [x] 预览模式切换
- [x] EditorView 正确绑定（dispatch/state/selection）

## Step 8: 左侧面板 ✅
**核心产出**: PanelSidebar.vue, FileTree.vue, useSearch.js, useToc.js
- [x] PanelSidebar 面板容器（可拖拽宽度 120-500px）
- [x] FileTree 组件 + IPC 通信（点击打开文件）
- [x] 目录导航 (TOC) 面板
- [x] 搜索面板（文件内 + 跨文件搜索）

## Step 9: 自动保存 + 欢迎页 + 最近文件 ✅
**核心产出**: useAutoSave.js, WelcomePage.vue
- [x] 防抖自动保存（3 秒）
- [x] 保存状态指示
- [x] 欢迎页（空状态居中 Logo + 操作按钮）
- [x] 最近文件/文件夹持久化
- [x] 置顶 + 拖拽排序（欢迎页列表）

## Step 10: 设置面板 + 主题系统 ✅
**核心产出**: SettingsPanel.vue, useTheme.js
- [x] 设置面板 UI（表单渲染）
- [x] 设置持久化（IPC → electron-store）
- [x] 主题切换（系统/浅色/深色）
- [x] CSS 变量注入
- [x] 字体预设 + 字号/行高调节
- [x] 编辑器设置（Tab/换行/行号等）

## Step 11: 导出功能 ✅ (导出预览滚动条 Bug 未修)
**核心产出**: ExportDialog.vue, electron/ipc/exportHandlers.js, useExport.js
- [x] PDF 导出（printToPDF + 滚动条隐藏 class）
- [x] 图片导出（html2canvas → PNG）
- [x] ZIP 导出（jszip）
- [x] 导出对话框 UI
- [ ] 导出进度指示（基本 UI 已有，需完善）

## Step 12: 打包 Windows 安装包 ~
**核心产出**: electron-builder 配置
- [x] electron-builder 配置（NSIS + portable）
- [~] 应用图标（占位图标，需替换）
- [!] **打包需管理员权限** — winCodeSign 包含 macOS 符号链接
- [ ] 自动更新预留

---

## 已知 Bug

### 1. 预览区滚动条在默认窗口大小下不显示
- **现象**: 打开长文件，预览区不显示滚动条；窗口放大后才出现
- **尝试修复**: 已添加 `flex-direction: column` + `min-height: 0` 到 `.preview-area`、`.preview-pane`、`.preview-scroll`
- **未解决**: 修复尚未生效，flex 高度链的 `min-height: 0` 似乎没有正确传递
- **下一步**: 检查 flex 布局中 `overflow: hidden` 对百分比高度子元素的影响

### 2. 导出 PDF 中滚动条可见
- **现象**: 导出的 PDF 中预览区滚动条出现在右侧
- **尝试修复**: 已添加 `.print-export` CSS class，在导出时临时隐藏滚动条
- **待验证**: 需要实际测试 PDF 导出效果

### 3. NSIS 打包需要管理员权限
- **现象**: `npm run make` 失败，因 winCodeSign 中的 macOS 符号链接
- **解决方案**: 启用 Windows 开发人员模式，或使用管理员 PowerShell
