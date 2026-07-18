# AGENTS.md — 项目开发约定

## 构建打包规范

### 打包前必须清理旧产物

Vite 增量构建不会自动删除 `dist/` 和 `dist-electron/` 中的旧 chunk 文件，导致产物中混杂过时文件。

**打包流程：先清理全部旧产物，再构建，再打包 exe**

```bash
# 正确做法：先删旧产物再构建再打包
Remove-Item -Recurse -Force dist, dist-electron, release
npm run build:electron
npx electron-builder --win portable   # 或 npm run package / npm run make

# 错误做法：直接增量打包（会残留旧文件）
npm run build:electron
# 错误做法：只清 dist 不清 release（exe 仍是旧的）
Remove-Item -Recurse -Force dist, dist-electron
npm run build:electron
```

注意：`npm run build:electron` 只生成 `dist/` 和 `dist-electron/`，不生成 exe。
要生成 exe 需要额外执行 `npx electron-builder --win portable`（便携包）或 `npm run make`（安装包）。
清理时必须同时删除 `release/` 目录，否则打包出的 exe 可能是旧构建的产物。

### 构建产物路径

- 前端页面：`dist/`
- Electron 主进程：`dist-electron/`
- Windows 便携包：`release\MdEv 0.1.0.exe`（`--win portable`）
- Windows 安装包：`release\`（`npm run make` 生成 nsis 安装包）
- 解压即用目录：`release\win-unpacked\`
