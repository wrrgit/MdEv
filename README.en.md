<div align="center">

# MdEv

**A lightweight, efficient local Markdown editor**

Markdown Editor for Windows — split-pane layout with editor on the left and live preview on the right. Supports project directory management, full-text search, outline navigation, math formulas, diagram rendering, theme customization, and multi-format export.

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://www.apache.org/licenses/LICENSE-2.0)
[![Platform](https://img.shields.io/badge/Platform-Windows-0078D4.svg)](https://github.com/wrrgit/MdEv)
[![Electron](https://img.shields.io/badge/Electron-33-47848F.svg)](https://www.electronjs.org/)
[![Vue](https://img.shields.io/badge/Vue-3-42b883.svg)](https://vuejs.org/)
[![Release](https://img.shields.io/badge/Release-v0.1.0-orange.svg)](https://github.com/wrrgit/MdEv/releases)

English | [简体中文](./README.md)

</div>

---

## Introduction

MdEv is a Windows desktop Markdown editor built with Electron + Vue 3 + CodeMirror 6. It works out of the box, requires no internet connection, and performs all file operations locally — ideal for daily writing, technical documentation, and note-taking.

### Why MdEv?

- **Fully Local** — All file operations happen on your machine. Your data never leaves your computer.
- **WYSIWYG** — Left editor and right preview sync in real time with linked scrolling for a smooth writing experience.
- **Feature-Rich** — Built-in math formulas, syntax highlighting, Mermaid diagrams, outline navigation, and full-text search.
- **Zero Config** — Download and run. No environment setup or internet connection required.

## Screenshots

<div align="center">

![MdEv Welcome Page](./screenshot/搜狗截图20260719214922.png)

![MdEv Main Editor](./screenshot/搜狗截图20260719215030.png)

![MdEv Logo](./logo.png)

</div>

## Features

- **CodeMirror 6 Editor** — Syntax highlighting, search & replace, bracket matching, code folding
- **Live Preview** — markdown-it rendering + KaTeX math formulas + highlight.js code highlighting + Mermaid diagrams
- **Project Management** — Open a folder as a project, browse / create / delete / rename in the file tree
- **Multi-Tab** — Drag-to-reorder, unsaved indicators, context menu
- **Full-Text Search** — In-file search (`Ctrl+F`) + cross-file search (`Ctrl+Shift+F`) with synchronized preview highlighting
- **Outline Navigation** — Auto-extracted heading tree, click to jump to sections, auto-highlight current section on scroll
- **Customizable Themes** — Follow system / light / dark; custom fonts, font size, line height; support for local fonts
- **Auto Save** — Debounced auto-save with real-time status indicator
- **Export** — Export to PDF and HTML with formulas and styles fully preserved
- **Undo / Redo** — Complete edit history
- **Recent Files** — Quick access to recent files / folders, with pinning and drag-to-reorder
- **Word Wrap** — Toggle soft wrap mode for long-form writing

## Download & Install

### Option 1: Direct Download (Recommended)

Go to the [Releases page](https://github.com/wrrgit/MdEv/releases) and download the latest `MdEv-Setup-0.1.0.exe`, then double-click to install.

> A portable version `MdEv 0.1.0.exe` is also available — no installation required, just run it.

### Option 2: Build from Source

For developers or users who want to compile themselves.

#### Prerequisites

- Node.js ≥ 18 (20 LTS recommended)
- npm ≥ 9

#### Steps

```bash
# Clone the repository
git clone https://github.com/wrrgit/MdEv.git
cd MdEv

# Install dependencies
npm install

# Development mode (Electron + Vite HMR)
npm run electron:dev

# Build a Windows installer (NSIS)
npm run make

# Or build a portable version
npm run package
```

Build artifacts are placed in the `release/` directory.

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl + N` | New file |
| `Ctrl + O` | Open file |
| `Ctrl + Shift + O` | Open folder |
| `Ctrl + S` | Save |
| `Ctrl + Shift + S` | Save as |
| `Ctrl + F` | Find in file |
| `Ctrl + Shift + F` | Search across files |
| `Ctrl + G` | Go to line |
| `Ctrl + B` | Toggle sidebar |
| `Ctrl + ,` | Open settings |

## Tech Stack

| Layer | Technology |
|-------|------------|
| Desktop Shell | Electron 33 |
| UI Framework | Vue 3 (Composition API) |
| Build Tool | Vite 5 |
| State Management | Pinia |
| Code Editor | CodeMirror 6 |
| Markdown Parser | markdown-it |
| Math Formulas | KaTeX |
| Code Highlighting | highlight.js |
| Diagram Rendering | Mermaid |
| Security Filter | DOMPurify |
| Base Styles | github-markdown-css |

## Project Structure

```
MdEv/
├── electron/               # Electron main process
│   ├── main.js             # Window management, menu, app lifecycle
│   ├── preload.cjs         # Secure bridge (Context Isolation)
│   └── ipc/                # IPC handlers
│       ├── fileHandlers.js       # File read/write, directory tree, file watching
│       ├── searchHandlers.js     # Cross-file full-text search
│       ├── exportHandlers.js     # PDF / HTML export
│       └── settingsHandlers.js   # Settings persistence, window controls
├── src/                    # Renderer process (Vue 3)
│   ├── components/         # UI components
│   ├── composables/       # Composition functions
│   ├── core/              # Markdown parsing core
│   ├── stores/            # Pinia state management
│   ├── config/            # Toolbar config
│   └── styles/            # CSS variable themes
├── build/                  # App icon resources
├── assets/                 # Icon assets
├── docs/                   # Project documentation
├── package.json
├── vite.config.js
└── README.md
```

## Roadmap

| Version | Goal | Status |
|---------|------|--------|
| v0.1.0 | MVP core editor + preview + basic export | ✅ Released |
| v0.2.0 | Project management enhancements + tab improvements | 🚧 Planning |
| v0.3.0 | Navigation + search experience | 📋 Planned |
| v0.4.0 | Export feature expansion | 📋 Planned |
| v0.5.0 | Personalization settings | 📋 Planned |
| v1.0.0 | Official release | 📋 Planned |

See [ROADMAP.md](./docs/ROADMAP.md) for details.

## Contributing

Issues and Pull Requests are welcome!

Before submitting, please ensure:

1. Follow the [Conventional Commits](https://www.conventionalcommits.org/) specification
2. Keep code style consistent with the existing codebase
3. Update relevant documentation

## License

This project is licensed under the [Apache License 2.0](./LICENSE).

Copyright © 2026 [wrrgit](https://github.com/wrrgit)

---

<div align="center">

If you find this project helpful, please consider giving it a ⭐ Star!

</div>
