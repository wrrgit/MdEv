# MdEv 构建指南

## 产物位置

| 产物 | 路径 | 说明 |
|------|------|------|
| 解压版 | `release/win-unpacked/MdEv.exe` | 双击直接运行，无需安装 |
| 便携版 ZIP | `release/MdEv-Portable.zip` | 解压后运行 MdEv.exe |
| NSIS 安装包 | `release/MdEv Setup x.x.x.exe` | 需管理员权限运行 `npm run make` |

## 构建命令

```bash
# 1. 浏览器开发模式（热更新）
npm run dev

# 2. Electron 开发模式
npm run electron:dev

# 3. 构建生产版本
npm run build

# 4. 构建 Electron 版本（含渲染进程 + 主进程）
npm run build:electron

# 5. 打包便携版（解压目录）
npm run package

# 6. 打包 NSIS 安装包（需管理员权限）
#    以管理员身份打开 PowerShell，然后运行：
npm run make
```

## 管理员权限说明

打包 NSIS 安装包和便携版时需要解压 `winCodeSign` 工具包，
其中包含 macOS 符号链接，在 Windows 上创建符号链接需要
**管理员权限**或启用**开发人员模式**。

### 启用开发人员模式（推荐）
1. 打开 设置 → 隐私和安全性 → 开发人员选项
2. 开启"开发人员模式"
3. 重新运行 `npm run make`

### 使用管理员 PowerShell
1. 右键 PowerShell → 以管理员身份运行
2. 切换到项目目录
3. 运行 `npm run make`
