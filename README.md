<div align="center">

# MdEv

**一款轻量、高效的本地 Markdown 编辑器**

Markdown Editor for Windows — 左编辑右预览双栏布局，支持工程目录管理、全文搜索、目录导航、数学公式、图表渲染、主题个性化及多格式导出。

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://www.apache.org/licenses/LICENSE-2.0)
[![Platform](https://img.shields.io/badge/Platform-Windows-0078D4.svg)](https://github.com/wrrgit/MdEv)
[![Electron](https://img.shields.io/badge/Electron-33-47848F.svg)](https://www.electronjs.org/)
[![Vue](https://img.shields.io/badge/Vue-3-42b883.svg)](https://vuejs.org/)
[![Release](https://img.shields.io/badge/Release-v0.2.0-orange.svg)](https://github.com/wrrgit/MdEv/releases)

[English](./README.en.md) | 简体中文

</div>

---

## 介绍

MdEv 是一款基于 Electron + Vue 3 + CodeMirror 6 构建的 Windows 桌面端 Markdown 编辑器。它开箱即用，无需联网，所有文件操作均在本地完成，适合日常写作、技术文档编写、笔记整理等场景。

### 为什么选择 MdEv？

- **纯本地** — 所有文件操作在本地完成，数据不离开你的电脑，隐私安全有保障
- **所见即所得** — 左编辑右预览实时同步，滚动联动，写作体验流畅
- **功能完备** — 内置数学公式、代码高亮、Mermaid 图表、PlantUML、目录导航、全文搜索
- **开箱即用** — 下载即用，无需配置环境，也无需联网

## 功能特性

### 编辑器

- ✅ **CodeMirror 6 编辑器** — 语法高亮、搜索替换、括号匹配、代码折叠
- ✅ **撤销 / 重做** — 完整编辑历史，工具栏按钮 + 快捷键
- ✅ **自动保存** — 防抖自动写盘，状态栏实时显示保存状态
- ✅ **自动换行** — 可切换软换行模式，单回车即换行（与 Typora 一致）
- ✅ **图片拖拽插入** — 直接拖拽图片到编辑区自动插入 Markdown 语法

### 预览

- ✅ **实时预览** — markdown-it 渲染 + KaTeX 数学公式 + highlight.js 代码高亮
- ✅ **Mermaid 图表** — 流程图、甘特图、时序图等
- ✅ **PlantUML 渲染** — 通过 PlantUML 服务器渲染 UML 图
- ✅ **数学公式** — 行内公式 (`$...$`) + 块级公式 (`$$...$$`)，支持模板快速插入
- ✅ **扩展语法** — 下标、上标、高亮标记、脚注、Admonition (`::: tip` / `::: warning` 等)
- ✅ **本地图片渲染** — 自定义 `mdimg://` 协议，直接显示本地相对路径图片
- ✅ **预览区点击** — 点击本地文件链接可直接用系统程序打开

### 工具栏

- ✅ **丰富工具栏** — 文字 / 标题 / 段落 / 插入 / 表格 / 公式 / 操作，7 大分组下拉菜单
- ✅ **快捷按钮栏** — 10 个常用操作一键直达（加粗 / 斜体 / 标题 / 链接 / 图片 / 代码块 / 表格 / 撤销 / 重做）
- ✅ **表格操作** — 可视化选择行列数插入表格、行/列增删
- ✅ **公式模板** — 行内 / 块级公式模板快速插入，6 种常用数学表达式模板
- ✅ **图片插入** — 文件选择框 + 拖拽插入 + 网络图片 URL 弹窗
- ✅ **链接插入** — 弹窗输入链接描述 + 地址

### 项目管理

- ✅ **工程目录管理** — 打开文件夹，文件树浏览、新建文件 / 文件夹
- ✅ **多标签页** — 拖拽排序、未保存标记、右键菜单关闭
- ✅ **最近打开** — 最近文件 / 文件夹快速访问，文件菜单 + 侧边栏双重入口
- ✅ **默认恢复** — 启动时自动打开上次的文档和文件夹
- ✅ **文件类型支持** — Markdown、JSON、图片（图片用系统查看器打开）

### 导航与搜索

- ✅ **目录导航** — 自动提取标题树，点击跳转章节
- ✅ **全文搜索** — 文件内搜索 (`Ctrl+F`) + 跨文件搜索 (`Ctrl+Shift+F`)
- 📋 TOC 滚动自动高亮当前章节 — 计划中
- 📋 搜索词预览区高亮 — 计划中

### 个性化

- ✅ **主题切换** — 浅色 / 深色 / 跟随系统，侧边栏太阳/月亮图标一键切换
- ✅ **字体设置** — 编辑器 / 预览区独立字体选择，侧边栏 A+/A− 快捷调节字号
- ✅ **设置面板** — 外观 / 编辑器 / 预览 / 文件，4 大分区，齿轮图标入口

### 导出

- ✅ **导出 PDF** — 公式与样式完整保留
- ✅ **导出 HTML** — 独立 HTML 文件，可离线查看
- 📋 PDF 自定义页眉页脚 — 计划中
- 📋 导出进度指示 — 计划中

### 界面

- ✅ **品牌标识** — 标题栏 logo + 软件名称 MdEv
- ✅ **侧边栏图标** — Lucide 风格线条图标，清晰易辨
- ✅ **关于弹窗** — 含 GitHub 仓库链接

## 下载安装

### 方式一：直接下载（推荐普通用户）

前往 [Releases 页面](https://github.com/wrrgit/MdEv/releases) 下载最新版本的 `MdEv-Setup-0.2.0.exe`，双击即可安装运行。

> 也可下载便携版 `MdEv 0.2.0.exe`，无需安装，双击即用。

### 方式二：从源码构建

适合开发者或希望自行编译的用户。

#### 环境要求

- Node.js ≥ 18（推荐 20 LTS）
- npm ≥ 9

#### 步骤

```bash
# 克隆仓库
git clone https://github.com/wrrgit/MdEv.git
cd MdEv

# 安装依赖
npm install

# 开发模式（Electron + Vite HMR）
npm run electron:dev

# 打包为 Windows 安装包（NSIS）
npm run make

# 或打包为便携版（portable）
npm run package
```

打包产物位于 `release/` 目录下。

## 快捷键

| 快捷键                | 功能     |
| ------------------ | ------ |
| `Ctrl + N`         | 新建文件   |
| `Ctrl + O`         | 打开文件   |
| `Ctrl + Shift + O` | 打开文件夹  |
| `Ctrl + S`         | 保存     |
| `Ctrl + Shift + S` | 另存为    |
| `Ctrl + F`         | 文件内查找  |
| `Ctrl + Shift + F` | 跨文件搜索  |
| `Ctrl + G`         | 跳转到行   |
| `Ctrl + B`         | 切换侧栏   |
| `Ctrl + ,`         | 打开设置   |
| `Ctrl + Z`         | 撤销     |
| `Ctrl + Y`         | 重做     |
| `Ctrl + M`         | 插入行内公式 |
| `Ctrl + Shift + M` | 插入块级公式 |

## 技术栈

| 层级          | 技术                                                 |
| ----------- | -------------------------------------------------- |
| 桌面壳         | Electron 33                                        |
| UI 框架       | Vue 3 (Composition API)                            |
| 构建工具        | Vite 5                                             |
| 状态管理        | Pinia                                              |
| 代码编辑器       | CodeMirror 6                                       |
| Markdown 解析 | markdown-it + 插件 (sub/sup/mark/footnote/container) |
| 数学公式        | KaTeX                                              |
| 代码高亮        | highlight.js                                       |
| 图表渲染        | Mermaid                                            |
| UML 渲染      | PlantUML (plantuml-encoder)                        |
| 安全过滤        | DOMPurify                                          |
| 样式基础        | github-markdown-css                                |
| PDF 导出      | jsPDF + html2canvas                                |
| 设置持久化       | electron-store                                     |

## 项目结构

```
MdEv/
├── electron/               # Electron 主进程
│   ├── main.js             # 窗口管理、IPC、自定义协议
│   └── preload.cjs         # 安全桥接（Context Isolation）
├── src/                    # 渲染进程（Vue 3）
│   ├── components/         # UI 组件
│   │   ├── TitleBar.vue          # 自定义标题栏（logo + 软件名）
│   │   ├── MenuBar.vue           # 菜单栏（含最近打开子菜单）
│   │   ├── TabBar.vue            # 标签页
│   │   ├── Toolbar.vue           # 工具栏（7 分组 + 快捷栏）
│   │   ├── FileTree.vue          # 文件树
│   │   ├── EditorPane.vue        # 编辑器面板
│   │   ├── PreviewPane.vue       # 预览面板
│   │   ├── PanelSidebar.vue      # 侧栏（文件树/最近/目录/搜索 + 主题/字体/设置）
│   │   ├── SettingsPanel.vue     # 设置面板
│   │   ├── ExportDialog.vue      # 导出对话框
│   │   ├── StatusBar.vue         # 状态栏
│   │   └── WelcomePage.vue       # 欢迎页
│   ├── composables/       # 组合式函数（导出、主题）
│   ├── core/              # Markdown 解析核心
│   ├── stores/            # Pinia 状态管理
│   ├── config/            # 工具栏配置
│   └── styles/            # CSS 变量主题
├── build/                  # 应用图标资源
├── docs/                   # 项目文档
├── package.json
├── vite.config.js
└── README.md
```

## 版本规划

| 版本     | 目标                                     | 状态     |
| ------ | -------------------------------------- | ------ |
| v0.1.0 | MVP 核心编辑器 + 预览 + 基础导出                  | ✅ 已发布  |
| v0.2.0 | 工具栏增强 + 主题/字体 + 最近文件 + 图片支持 + PlantUML | ✅ 已发布  |
| v0.3.0 | 导航 + 搜索体验优化（TOC 高亮、搜索高亮）               | 📋 计划中 |
| v0.4.0 | 导出功能扩展（PDF 页眉页脚、进度指示）                  | 📋 计划中 |
| v0.5.0 | 打磨优化（快捷键自定义、剪贴板粘贴、大文件性能）               | 📋 计划中 |
| v1.0.0 | 正式发布                                   | 📋 计划中 |

详见 [ROADMAP.md](./docs/ROADMAP.md)。

## 贡献

欢迎提交 Issue 和 Pull Request！

提交前请确保：

1. 遵循 [Conventional Commits](https://www.conventionalcommits.org/) 规范
2. 代码风格与现有代码保持一致
3. 更新相关文档

## 许可证

本项目基于 [Apache License 2.0](./LICENSE) 开源。

Copyright © 2026 [wrrgit](https://github.com/wrrgit)

---

<div align="center">

如果这个项目对你有帮助，欢迎 ⭐ Star 支持！

</div>
