# MdEv 开发记录

---

## v0.7.0 · 2026-10-25（第二轮）

### 对标业界产品体验增强批次（二）—— 数据安全与标签管理

**新功能**：
- **本地文件历史**（对标 Obsidian File Recovery / VS Code Timeline）：
  - 每次保存自动快照到 `userData/file-history/<hash>/<timestamp>.md`，保留最近 30 份，同一文件 1 分钟内不重复快照（新建 `electron/ipc/historyHandlers.js`，挂接 `file:write`）
  - 「文件历史…」对话框（命令面板入口）：快照列表 + 内容预览 + 一键恢复（新建 `src/components/FileHistoryDialog.vue`）
- **标签固定（pin）**（对标 VS Code）：TabBar 右键菜单（关闭 / 固定 / 关闭其他 / 关闭右侧 / 复制路径），固定标签排最左、防误关、中键点击不关闭、会话恢复保留 pin 状态
- **图片保存目录可配置**（Typora 式资产化）：设置 → 文件 →「图片保存目录」，粘贴/拖入图片存入指定子目录（默认 assets），拒绝 `..` 越权路径
- **复制为 HTML**：命令面板执行，渲染后的 HTML 写入剪贴板（主进程 `clipboard:writeHtml`，纯文本 Markdown 兜底）
- **Ctrl+P 无项目兜底**：未打开文件夹时也可搜索/打开最近文件（Obsidian 快速切换器行为）
- 新增 `docs/BENCHMARK.md`：Typora / Obsidian / MarkText / VS Code / Joplin / Zettlr 完整对标分析

**验证**：清理旧产物 → `npm run build:electron` → `electron-builder --win dir` → 启动 + CDP 渲染层冒烟（App 挂载 / 新设置项 / 无白屏）全部通过。
**环境备注**：WorkBuddy 终端启动 exe 必须先清 `ELECTRON_RUN_AS_NODE`/`NODE_OPTIONS`；本沙箱内 GPU/Chromium 沙箱进程会崩溃（0xC0000005），加 `--no-sandbox --disable-gpu` 可运行，正常桌面环境无需此参数。

---

## 2026-10-25

### 对标业界产品（Typora / Obsidian / VS Code / MarkText）体验增强批次

**新功能**：
- **命令面板**（VS Code 风格）：`Ctrl+Shift+P` 呼出，聚合文件/编辑/格式/插入/视图/主题/导出/应用共 35+ 条命令，支持模糊搜索与键盘导航（新建 `src/components/CommandPalette.vue`，命令注册在 `App.vue`）
- **Markdown 渲染增强**（`src/core/markdown/parser.js`）：
  - Emoji 短代码：`:smile:` → 😄（markdown-it-emoji v3）
  - 定义列表（markdown-it-deflist）
  - `[TOC]` 目录块：渲染为嵌套标题目录，复用 markdown-it-anchor 锚点，点击平滑滚动到对应章节（预览区新增页内锚点跳转处理与 `.md-toc` 样式）
- **智能粘贴链接**（Typora 行为）：选中文本状态下粘贴裸 URL，自动包成 `[选中](url)`（`EditorPane.vue` paste handler）
- **表格源码格式化**：`Shift+Alt+F`（与 VS Code 一致）或命令面板触发，按显示宽度（CJK 记 2）对齐管道符，保留列对齐方式（新建 `src/core/markdown/tableFormat.js`）
- **拖拽文件到窗口打开**：.md 等文本文件直接拖入窗口即打开为标签页（`App.vue` drop 处理）
- **状态栏字数统计详情**：点击状态栏字数弹出详情（字数/字符数含空格与不含空格/段落数/行数/阅读时长），对标 Obsidian
- **preload**：新增 `webUtils.getPathForFile` 桥接，兜住 Electron 32+ 移除 `File.path` 后的图片拖拽与文件拖入

**依赖**：新增 `markdown-it-emoji@3`、`markdown-it-deflist@3`

**验证**：清理旧产物 → `npm run build:electron` → `electron-builder --win dir` → 启动 `D:\mdev-release\win-unpacked\MdEv.exe` 正常运行

---

## 2026-07-19

### 1. 修复 PDF/图片导出内容为截图而非 Markdown 渲染内容

**问题**：
- 导出 PDF 时，输出的是预览区域的截图（html2canvas），而非完整的 Markdown 渲染内容
- 导出图片时同样是截图，且缺少样式、代码高亮、数学公式、Mermaid 图表等

**根本原因**：
- `useExport.js` 中 `exportImage` 使用 `html2canvas` 截取 `.markdown-body` DOM 元素
- `exportPdf` 调用主进程 `printToPDF()` 直接打印当前窗口，包含编辑器/工具栏等 UI 元素
- 两者都依赖渲染进程现有的预览 DOM，无法获取完整的打印样式 CSS

**修复**：
- 新建 `electron/ipc/sanitizeHtml.js`：使用 jsdom + DOMPurify 在主进程安全清洗 HTML
- 重写 `electron/ipc/exportHandlers.js`：
  - 生成包含 GitHub Flavored Markdown 完整样式的独立 HTML 页面（含亮/暗主题、代码高亮、表格、KaTeX、Mermaid 样式）
  - PDF 导出：创建隐藏 `BrowserWindow` 加载 HTML，调用 `printToPDF()` 并支持页边距/纸张大小
  - 图片导出：新增 `export:image:markdown`，创建隐藏窗口渲染 HTML，使用 `capturePage()` 截取 PNG（支持缩放倍率）
  - ZIP 导出保持不变
- 更新 `src/composables/useExport.js`：
  - `exportPdf` 传入 markdown 内容 + 主题，不再依赖 `print-export` CSS 类
  - `exportImage` 调用新的 `exportImageMarkdown` API，直接传 markdown 内容
- 更新 `preload.cjs` 暴露 `exportImageMarkdown`
- `vite.config.js`：electron 构建外部化 `jsdom`、`dompurify`

### 2. 首页 MdEv 标题渐变色适配 Logo 红色配色

**改动**（WelcomePage.vue）：
- `.welcome-title` 从单色 `var(--text-primary)` 改为渐变：`linear-gradient(135deg, #f02c2e 0%, #ff6672 50%, #ff7673 100%)`
- 配色取自 `logo.png` 主色调（深红 #f02c2e、珊瑚红 #ff6672、浅珊瑚 #ff7673）

---

## 2026-07-15

### 1. 预览视图滚动条修复

**问题**：预览视图上下滚动条只在窗口扩大后才显示；左右滚动条一直不显示

**根本原因**：
- `.preview-pane` 用 `height: 100%`，在嵌套 flex 布局中无法正确解析父容器高度 → 滚动容器无高度约束 → 内容撑大不溢出 → 上下滚动条不显示
- `github-markdown-css` 的 `word-wrap: break-word` 让文字自动换行，永远不产生水平溢出 → 左右滚动条不触发
- `pre/table` 各自 `overflow: auto` 不撑大父容器，需改为 `overflow: visible` 由外层统一滚动

**修复**：
- `.preview-pane`：`height: 100%` → `flex: 1; min-height: 0`
- `.markdown-body`：`min-width: max-content !important; word-wrap: normal !important; overflow-wrap: normal !important`
- `.markdown-body pre/table`：`overflow: visible !important`
- 移除 `.preview-pane` 重复的 `border-left`

### 2. 预览视图滚动条样式优化

**改动**（PreviewPane.vue 非scoped `<style>`）：
- 滚动条宽度：10px → 14px
- 滑块最小尺寸：默认 → `min-height: 60px; min-width: 60px`
- 滑块边框：2px → 3px，圆角 5px → 7px
- 轨道：`border: 3px solid var(--bg-primary)` 使滚动条视觉内缩，不贴右边界
- 滚动条角落：背景色改为 `var(--bg-primary)` 融入背景

### 3. 格式栏添加字体控制按钮

**改动**（Toolbar.vue）：
- 在"操作"组右侧添加 `A-` / 字号数字 / `A+` 内联按钮组
- 范围：10~32px，编辑器字号和预览字号同步增减
- 按钮样式：24px高度、1px边框、hover时边框变主题色

### 4. 状态栏行列号修复

**问题**：左下角显示"行 1, 列 1"始终不变

**根本原因**：`cursorLine/cursorCol` 是静态 ref，从未连接 CodeMirror 光标事件

**修复**：
- `editorStore.js`：新增响应式 `cursorLine`/`cursorCol`
- `EditorPane.vue`：通过 `@update` 回调，每次 CodeMirror 更新时计算光标行列写入 store
- `StatusBar.vue`：直接读取 `store.cursorLine`/`store.cursorCol` 显示

### 5. 编辑器↔预览滚动联动

**改动**：
- `editorStore.js`：新增 `scrollSyncSource` ref，记录滚动来源（editor/preview）和百分比
- `EditorPane.vue`：
  - `onEditorUpdate` 时计算 CodeMirror 滚动百分比写入 store（source='editor'）
  - `watch scrollSyncSource`，当来源为 preview 时同步滚动编辑器
- `PreviewPane.vue`：
  - `onPreviewScroll` 时计算滚动百分比写入 store（source='preview'）
  - `watch scrollSyncSource`，当来源为 editor 时同步滚动预览
  - 双方用 `isSyncing` 标记防止循环触发
- `Toolbar.vue`：字体按钮组右侧添加 🖇 滚动联动开关按钮，点击切换 `scrollSync`，激活时高亮
- 删除 PreviewPane 的 `defineExpose({ editorScrollHandler })`，不再需要父组件中转

---

## 待办 / 后续

- [ ] 验证水平滚动条在长代码行、宽表格场景下的实际表现
- [ ] winCodeSign 符号链接权限问题（需管理员权限打包或关闭签名）
- [ ] 保存状态实时更新（StatusBar 的 saveStatus 仍为静态值）
- [ ] 自动保存后 isDirty 状态同步
