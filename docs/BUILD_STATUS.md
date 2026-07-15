# MdEv — 构建状态与功能清单

## 项目信息

| 项目 | 值 |
|------|-----|
| 名称 | MdEv (Markdown Editor for Windows) |
| 版本 | 0.1.0 |
| 技术栈 | Electron 33 + Vue 3 + Vite 5 + CodeMirror 6 + markdown-it + KaTeX |
| 构建通过 | ✅ `vite build` 成功 |
| 最后更新 | 2026-07-12 |

## 已实现功能清单

### 编辑器 (EditorPane)
- [x] CodeMirror 6 集成，Vue 3 双向绑定
- [x] Markdown 语法高亮 (`@codemirror/lang-markdown`)
- [x] 行号显示、活跃行高亮
- [x] 括号匹配、自动闭合
- [x] 代码折叠（折叠 Gutter）
- [x] 搜索与替换 (Ctrl+F, `@codemirror/search`)
- [x] 选中同词高亮
- [x] 自动缩进（列表续缩进）
- [x] 深色主题支持 (oneDark)
- [x] ResizeObserver 动态设置滚动最小宽度

### 实时预览 (PreviewPane)
- [x] markdown-it 实时解析 → HTML 渲染 (150ms 防抖)
- [x] KaTeX 数学公式 (`$...$` / `$$...$$`)
- [x] highlight.js 代码高亮 (180+ 语言)
- [x] Mermaid 图表渲染
- [x] DOMPurify XSS 过滤
- [x] GitHub 风格 CSS (github-markdown-css)
- [x] 编辑→预览单向同步滚动
- [x] 视图模式切换（双栏/纯编辑/纯预览）
- [!] **滚动条在默认窗口大小下不显示** (flex 高度链问题)

### 工具栏 (Toolbar)
- [x] 下拉菜单样式（文字/标题/段落/插入/操作 五组）
- [x] 文字样式：加粗/斜体/删除线/下划线/行内代码
- [x] 标题：H1-H6
- [x] 段落：引用/水平线/换行
- [x] 列表：无序/有序/任务列表
- [x] 插入：链接/图片/表格/代码块/数学公式/Mermaid
- [x] 操作：撤销/重做/预览切换
- [x] EditorView 正确绑定 (`window.editorRef = payload.view`)

### 多标签页 (TabBar)
- [x] 新建/关闭标签
- [x] 拖拽排序 (HTML5 Drag & Drop)
- [x] 未保存标记 (●)
- [x] 右键菜单（关闭/关闭其他/关闭右侧/复制路径/在资源管理器中显示）
- [x] 标签溢出滚动（左右箭头 + 滚轮）
- [x] 标签最大宽度 + 缩略文件名

### 工程栏 (PanelSidebar)
- [x] 可拖拽宽度 (120-500px)
- [x] 文件树 (FileTree)：递归目录、展开/折叠、点击打开
- [x] 目录导航 (TOC)：heading 提取、点击跳转
- [x] 搜索面板：文件内 + 跨文件搜索

### 自动保存 (AutoSave)
- [x] 3 秒防抖自动保存
- [x] 保存状态指示（已保存/保存中/未保存）
- [x] 手动保存 + 另存为

### 主题系统 (Theme)
- [x] 跟随系统 / 浅色 / 深色
- [x] CSS 变量体系（20+ 变量）
- [x] 字体预设 + 字号调节
- [x] 行高调节

### 设置面板 (SettingsPanel)
- [x] 外观：主题/字体/字号/行高
- [x] 编辑器：Tab/换行/行号/高亮/折叠
- [x] 预览：同步滚动/默认视图
- [x] 文件：自动保存间隔/面板焦点/最近文件数

### 欢迎页 (WelcomePage)
- [x] 空状态居中 Logo + 三个操作按钮
- [x] 最近文件列表（置顶/排序）
- [x] 最近文件夹列表（置顶/排序）

### 导出 (ExportDialog)
- [x] PDF 导出 (`printToPDF` + 滚动条隐藏 class)
- [x] 图片导出 (`html2canvas` → PNG，可选缩放)
- [x] ZIP 项目导出 (`jszip`)
- [x] 导出对话框 UI

### Electron 集成
- [x] 无边框窗口 + 自定义标题栏 (TitleBar.vue)
- [x] 窗口大小/位置记忆 (userData/window-bounds.json)
- [x] 原生菜单栏（隐藏在无边框窗口中）
- [x] IPC 通信层 (preload.cjs contextBridge)
- [x] 文件系统：读写/遍历/监听
- [x] 跨文件搜索
- [x] 设置持久化 (electron-store)
- [x] 原生主题监听

## 项目结构

```
MdEv/
├── docs/                      # 文档
│   ├── ARCHITECTURE.md        # 架构设计
│   ├── FEATURES.md            # 功能设计
│   ├── TODO.md                # 实施计划（含已知 Bug）
│   ├── ROADMAP.md             # 版本规划
│   ├── BUILD_GUIDE.md         # 构建指南
│   └── BUILD_STATUS.md        # 本文件
├── electron/                  # Electron 主进程
│   ├── main.js                # 窗口/菜单/IPC 注册
│   ├── preload.cjs            # 安全桥接 (CJS 格式)
│   └── ipc/                   # IPC 处理器 x4
├── src/                       # 渲染进程 (Vue 3)
│   ├── components/            # 12 个组件
│   ├── composables/           # 6 个组合式函数
│   ├── core/markdown/         # 解析引擎
│   ├── stores/                # Pinia 状态 (editorStore.js)
│   ├── config/                # 工具栏配置
│   └── styles/                # CSS 变量主题
├── dist/                      # Vite 构建产物
├── dist-electron/             # Electron 构建产物
├── index.html
├── package.json
├── vite.config.js
└── README.md
```

## 运行命令

```bash
npm run dev              # 浏览器模式开发
npm run electron:dev     # Electron 模式开发
npm run build            # 构建 web 版本
npm run build:electron   # 构建 Electron 版本
npm run make             # 打包 Windows 安装包 (需管理员权限)
npm run package          # 打包 Windows 便携版 (需管理员权限)
```

## 已知 Bug

| # | 严重度 | 描述 | 状态 |
|---|--------|------|------|
| 1 | 高 | 预览区滚动条在默认窗口大小下不显示 | 尝试修复中 (flex min-height:0) |
| 2 | 中 | 导出 PDF 中滚动条可能可见 | 已添加 .print-export class，待验证 |
| 3 | 低 | NSIS 打包需管理员权限 (winCodeSign 符号链接) | 已有 workaround (开发人员模式) |

## 关键技术决策与踩坑

| 问题 | 根因 | 解决方案 |
|------|------|----------|
| TitleBar 空状态消失 | `.empty-state` 用 `inset: 0` 覆盖全屏 | 改为 `top: 66px` |
| 工具栏按钮无反应 | `@ready` 传 payload 对象，非 EditorView | `payload.view` 解包 |
| preload 加载失败 | `.js` 文件被 Vite 作为 ESM 处理 | 改名 `.cjs`，用 `require()` 语法 |
| 预览滚动条不显示 | flex 子节点 `min-height: auto` 阻止缩小 | 添加 `min-height: 0` (待验证) |
