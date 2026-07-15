# MdEv — Markdown Editor for Windows

一款本地 Windows 桌面端的 Markdown 编辑器，左编辑右预览双栏布局，支持工程目录管理、全文搜索、目录导航、数学公式、图表渲染、主题个性化及多种格式导出。

## 特性

- ✏️ **CodeMirror 6** 编辑器 — 语法高亮、搜索替换、括号匹配、代码折叠
- 👁️ **实时预览** — markdown-it 渲染 + KaTeX 公式 + highlight.js 代码高亮 + Mermaid 图表
- 📂 **工程目录管理** — 打开整个文件夹作为项目，文件树浏览/新建/删除/重命名
- 📑 **多标签页** — 拖拽排序、未保存标记、右键菜单
- 🔍 **全文搜索** — 文件内搜索 (Ctrl+F) + 跨文件搜索 (Ctrl+Shift+F)，预览区同步高亮
- 🧭 **目录导航** — 自动提取标题树，点击跳转章节，滚动自动高亮
- 🎨 **个性化主题** — 跟随系统/浅色/深色；自定义字体、字号、行高；支持导入本地字体
- 💾 **自动保存** — 3 秒防抖自动写盘，状态栏实时显示保存状态
- 📤 **导出分享** — 导出为 PDF、PNG 图片、ZIP 项目包
- ⏪ **撤销/重做** — 完整编辑历史
- 📁 **最近文件** — 最近文件/文件夹快速访问，支持置顶和拖拽排序

## 快速开始

### 环境要求
- Node.js ≥ 18（推荐 20 LTS）
- npm ≥ 9

### 安装与运行

```bash
# 克隆仓库
git clone <repo-url>
cd MdEv

# 安装依赖
npm install

# 开发模式
npm run dev

# 生产构建
npm run build

# 预览构建产物
npm run preview
```

### 桌面应用

```bash
# 开发模式（Electron + Vite HMR）
npm run electron:dev

# 构建桌面应用
npm run build:electron

# 打包为 Windows 安装包
npm run make
```

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面壳 | Electron |
| UI 框架 | Vue 3 (Composition API) |
| 构建工具 | Vite |
| 状态管理 | Pinia |
| 代码编辑器 | CodeMirror 6 |
| Markdown 解析 | markdown-it |
| 数学公式 | KaTeX |
| 代码高亮 | highlight.js |
| 图表渲染 | Mermaid |
| 安全过滤 | DOMPurify |
| 样式 | github-markdown-css |
| 导出 | html2canvas + jsPDF + jszip |

## 项目结构

```
MdEv/
├── electron/           # Electron 主进程
│   ├── main.js         # 窗口管理、菜单
│   ├── preload.cjs     # 安全桥接 (CJS 格式)
│   └── ipc/            # IPC 处理器 (file/search/export/settings)
├── src/                # 渲染进程 (Vue 3)
│   ├── components/     # 12 个组件 (TitleBar/MenuBar/TabBar/Toolbar/EditorPane/PreviewPane/...)
│   ├── composables/    # 6 个组合式函数 (useTheme/useAutoSave/useExport/...)
│   ├── core/           # 核心逻辑 (markdown 解析)
│   ├── stores/         # Pinia 状态 (editorStore.js)
│   ├── config/         # 工具栏配置
│   └── styles/         # CSS 变量主题
├── docs/               # 文档 (架构/功能/TODO/ROADMAP/构建指南)
├── package.json
├── vite.config.js
└── README.md
```

## 版本规划

参见 [ROADMAP.md](docs/ROADMAP.md)

- **v0.1.0** — MVP 核心编辑器+预览
- **v0.2.0** — 工程管理+多标签
- **v0.3.0** — 导航+搜索
- **v0.4.0** — 导出功能
- **v0.5.0** — 个性化设置
- **v1.0.0** — 正式发布

## 贡献

欢迎提交 Issue 和 Pull Request！

提交前请确保：
1. 遵循 [Conventional Commits](https://www.conventionalcommits.org/) 规范
2. 通过现有测试：`npm run test`
3. 更新相关文档

## 许可

MIT License
