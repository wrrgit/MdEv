# MdEv → Tauri 迁移可行性评估与功能点迁移清单

> 评估日期：2026-11-15 · 目标：判断是否把桌面端从 Electron 换成 Tauri 2，并给出按功能点的迁移清单与工作量拆解。
> 配套文档：`docs/performance-optimization-plan.md`（前端性能计划，独立于本迁移）。

---

## 0. 结论速览（TL;DR）

- **可行，但这是后端原生层的全量重写，不是重构。** 前端（Vue3 + CodeMirror6 + markdown-it + DOMPurify + KaTeX + mermaid）是纯 Web 技术栈，可原样跑进 Tauri 的 WebView，**零改动**；真正的改动集中在「Rust 后端 + IPC 边界 + 打包 + 少数 Electron 专属特性」。
- **性能上 Tauri 赢在体积 / 内存 / 启动，但救不了前端 JS 层的卡顿。** 那份性能计划里的 P0–P3（切标签丢状态、预览整篇同步渲染、大文件滚动）全是 WebView 内 JavaScript 的问题，Tauri 的 Rust 后端不会让 JS 跑更快。换 Tauri ≠ 免做前端性能优化。
- **最大风险点 = 导出（PDF / PNG）。** Electron 用隐藏 `BrowserWindow` + `printToPDF()` / `capturePage()`，Tauri 2 没有 1:1 等价物，需要研究替代方案（见 §4.1）。
- **第二大改动面 = 自定义 HTML 弹窗 + `mdimg://` 图片协议。** 前者建议顺手改成应用内 Vue 弹窗（更干净），后者用 Tauri 的 asset 协议替换（更干净）。
- **预估工作量：6–10 周（单人）。** 其中导出专项占 1–2 周且风险最高，建议先做 spike 验证三件最难的事（文件 I/O 边界、导出、图片协议）再决定全量迁移。

> **复审（2026-11-15 第二次修订）**：① 前端性能计划 **P0–P5 已全部完成并随 v0.8.0 安装版发布**，迁移时整段继承、无需重做（增量影响见 §4.6）；② 契约面按当前代码重新实证为 **19 文件 / 136 处调用 / 45 个 API**（§1.1 已刷新）；③ 本机环境实测：WebView2 ✅、Node ✅、**Rust 工具链 ❌ 未装**，是 spike 编译运行的唯一硬前置（§8 环境就绪度）；④ 实施已启动：`tauri-spike` 分支 + `src-tauri/` 脚手架已落地。

---

## 1. 现状耦合清点（必须重建的契约面）

MdEv 与 Electron 的耦合**全部**经由 `electron/preload.cjs` 暴露的 `window.api.*`。2026-11-15 复审实证：**渲染端 19 个文件、136 处调用，preload 暴露 45 个 API**（下方为当前快照，行号随代码演进会漂移，以方法名为准）。两个对迁移有利的事实：

1. **大量调用使用可选链 `window.api?.x`**（容错设计）：Tauri 适配层可以增量实现——先覆盖高频 API，未实现的能力优雅降级而非崩溃。
2. **调用形态统一为 `await window.api.xxx(...)`**：只需把这些调用点收拢到一个适配模块（如 `src/api/index.js`），再按运行时分流 Electron/Tauri 实现，核心编辑器/预览逻辑（parser.js / EditorPane / PreviewPane 的渲染主体）一行不用动。

### 1.1 渲染端调用点（2026-11-15 grep 实证，19 文件）

| 文件 | 调用的 API |
|---|---|
| `src/App.vue` | watchDirectory / unwatchDirectory / readFile / readDirectory / onFileChanged / getPathForFile / openFileDialog / openPath / openFolderDialog / copyHtmlToClipboard / onOpenFile / onMenuEvent / removeMenuListener / setSettings |
| `src/components/MenuBar.vue` | openExternal / openFileDialog / openPath / readFile / readDirectory / writeFile / saveFileDialog / deleteDraft / setSettings / closeWindow |
| `src/components/Toolbar.vue` | showFormDialog / openImageDialog / showTableDialog |
| `src/components/WelcomePage.vue` | openFileDialog / readFile / openFolderDialog / readDirectory |
| `src/components/FileTree.vue` | readFile / showInputBox / exists / createFile / createDirectory / readDirectory / showItemInFolder / rename / delete |
| `src/components/PanelSidebar.vue` | showInputBox / exists / createFile |
| `src/components/EditorPane.vue` | getPathForFile / copyImageFile / saveClipboardImage |
| `src/components/PreviewPane.vue` | openPath / resolvePath |
| `src/components/TitleBar.vue` | minimizeWindow / maximizeWindow / closeWindow |
| `src/components/StatusBar.vue`、`SettingsPanel.vue` | setSettings |
| `src/components/QuickOpen.vue` | readFile |
| `src/components/FileHistoryDialog.vue` | listHistory(82) / readHistory(92) / restoreHistory(106) / showItemInFolder(126) |
| `src/composables/useAutoSave.js` | writeFile / saveDraft / deleteDraft / saveFileDialog |
| `src/composables/useOpenFile.js`（P1 新增） | readFile / openPath |
| `src/composables/useSession.js` | setSettings / readDirectory / readFile / readDraft |
| `src/composables/useTabClose.js` | confirmUnsaved / saveFileDialog / writeFile / deleteDraft |
| `src/composables/useTheme.js` | getSettings / setSettings / onThemeChanged |
| `src/composables/useExport.js` | exportPdf / exportHtml / exportPng |

### 1.2 主进程 / 预加载实现（electron/）

| 文件 | 注册的处理器 / 功能（行号） |
|---|---|
| `electron/preload.cjs` | 暴露全部 `window.api.*`（文件/草稿/图片/历史/剪贴板/监听/打开文件/对话框/Shell/搜索/导出/设置/主题/窗口控制/菜单事件） |
| `electron/main.js` | `mdimg://` 特权协议注册(28) + 处理(~607) / 单实例锁(55–67) / 原生菜单(248+) / 各类对话框 `openFile(326)` `openFolder(339)` `saveFile(346)` `openImage(357)` `showTableDialog(368)` `confirmUnsaved(435)` `showInputBox(449)` `showFormDialog(509)` / Shell `openPath(588)` `showItemInFolder(594)` `openExternal(601)` / `file:resolvePath(607)` / 窗口 bounds 持久化 |
| `electron/ipc/fileHandlers.js` | `file:read(17)` `file:write(41)` `file:readdir(52)` `file:create(62)` `file:mkdir(71)` `file:rename(80)` `file:delete(89)` `file:exists(103)` `file:watch(112)` `file:unwatch(132)` / 草稿 `draft:save(145)` `draft:read(157)` `draft:delete(168)`。**P1 增：`file:read` 内建大文件守卫**——stat → >20MB 标记 `isLarge` → >150MB 只读前 20MB 并标记 `truncated`，返回 `{content,size,isLarge,truncated,truncatedBytes}`。该语义必须随迁移复刻进 Rust command（见 §4.6） |
| `electron/ipc/historyHandlers.js` | `history:list(48)` `history:read(68)` `history:restore(80)` |
| `electron/ipc/imageHandlers.js` | `image:saveClipboardImage(25)` `image:copyImageFile(43)` |
| `electron/ipc/searchHandlers.js` | `search:project(5)` |
| `electron/ipc/exportHandlers.js` | `export:pdf(304, 内 `printToPDF` 274)` `export:html(334)` `export:png(358, 内 `capturePage` 228)` / KaTeX 字体内联 / 暗色 CSS |
| `electron/ipc/settingsHandlers.js` | **electron-store** `settings:get(51)` `settings:set(64)` / `theme:getNative(92)` / `window:minimize/maximize/close/isMaximized(106–125)` / `nativeTheme` 监听广播 `theme:changed` |

> 关键事实：所有渲染端调用都是 `await window.api.xxx(...)` 形式。**只需把这些调用点改为 Tauri 的 `invoke('cmd', {...})` 或插件 API，核心编辑器 / 预览逻辑（parser.js / EditorPane / PreviewPane 的渲染主体）一行都不用动。**

---

## 2. 性能对比（基于公开实测，2025–2026）

| 指标 | Electron（现 MdEv） | Tauri 2 | 说明 |
|---|---|---|---|
| 安装包体积 | ~120MB+（已含 Chromium） | 3–10MB | 小 15–30 倍 |
| 空闲内存 | 200–400MB | 30–60MB | 省 3–5 倍 |
| 冷启动 | 1.5–3s | 0.4–1s | 快数倍 |
| 后端语言 | Node.js（打包进应用） | Rust | 无 GC、原生线程、文件 I/O 可放后台线程 |
| 渲染引擎 | 自带 Chromium | 系统 WebView | **Win=WebView2(Blink)，mac=WKWebKit，Linux=WebKitGTK** |

**关键点**
- **MdEv 主战场是 Windows → Tauri 用 WebView2（即 Chromium/Blink）**，与 Electron 同内核，CSS/JS 行为几乎一致；CodeMirror6 / markdown-it / KaTeX / mermaid 表现等同，渲染一致性风险极低。
- macOS WKWebView（Safari/WebKit）在 `backdrop-filter`、个别新 CSS 选择器上有差异；Linux WebKitGTK 版本偏旧——非 Windows 目标需单独 QA。
- **Tauri 真正改善的是**：文件 I/O 与工程搜索移到 Rust 后台线程（大文件 / 全目录检索更顺）、内存余量更大（多文件更稳，利好性能计划里「开 30 文件内存有上限」基线）、启动更快、安全默认（CSP + capability 权限，无 `require` 暴露面）。

> ⚠️ **再次强调**：Tauri 不加速 WebView 内的 JS。性能计划 `docs/performance-optimization-plan.md` 的 P0–P3 全是前端活，Tauri 下照样要做，且优先级不变。

---

## 3. 功能点迁移清单（逐条：Electron 实现 → Tauri 替代 → 可行性 → 工作量）

| # | 功能 | Electron 实现（file:line） | Tauri 替代 | 可行性 | 工作量 |
|---|---|---|---|---|---|
| 1 | 文件读 / 写 | `file:read/write`（`fileHandlers.js:10,19`） | Rust command + `std::fs` / `tauri-plugin-fs` | ✅ 直译 | S |
| 2 | 列目录 / 建文件 / 建文件夹 | `file:readdir/create/mkdir`（30,40,49） | plugin-fs | ✅ | S |
| 3 | 重命名 / 删除 / 存在性 | `file:rename/delete/exists`（58,67,81） | plugin-fs | ✅ | S |
| 4 | 解析相对路径 | `file:resolvePath`（`main.js:607`） | Rust `path::absolute` | ✅ | S |
| 5 | 未命名草稿自动保存 | `draft:save/read/delete`（123,135,146） | plugin-store 或 `std::fs` 草稿目录 | ✅ | S |
| 6 | 外部变更监听 | `file:watch/unwatch`（90,110） | `tauri-plugin-fs` watch / `notify` crate | ✅ | M |
| 7 | 文件历史快照 | `history:list/read/restore`（48,68,80） | Rust 读写快照目录 + command | ✅ | S |
| 8 | 剪贴板图 / 复制文件 | `image:saveClipboardImage/copyImageFile`（25,43） | Rust 文件复制 + `tauri-plugin-clipboard`（剪贴板图需系统 API） | ⚠️ 剪贴板图中等 | M |
| 9 | 复制到剪贴板（HTML） | `clipboard:writeHtml`（`main.js:317`） | `tauri-plugin-clipboard-manager` | ✅ | S |
| 10 | 打开 / 在文件夹显示 / 外链 | `shell:openPath/showItemInFolder/openExternal`（588,594,601） | `tauri-plugin-shell` | ✅ | S |
| 11 | 工程内搜索 | `search:project`（`searchHandlers.js:5`） | Rust command（globwalk/ignore + regex）或保留前端 | ✅ 建议 Rust | M |
| 12 | 设置持久化 | **electron-store**（`settingsHandlers.js:9`） | `tauri-plugin-store`（schema 平移） | ✅ 换库 | S |
| 13 | 原生主题跟随 | `nativeTheme`（`settingsHandlers.js:92,96`） | 渲染端 `matchMedia('(prefers-color-scheme: dark)')` 监听（更简） | ✅ 且更优 | S |
| 14 | 窗口控制 | `window:minimize/maximize/close/isMaximized`（106–125） | `getCurrentWindow()` + `onResized` | ✅ | S |
| 15 | 原生菜单 | `Menu.buildFromTemplate`（`main.js:248+`） | `tauri::menu` + `onMenuEvent` | ✅ | M |
| 16 | 单实例锁 / 文件关联打开 | `requestSingleInstanceLock`（55–67）+ `app:open-file` | `tauri-plugin-single-instance` + 文件关联 `RunEvent::Opened` | ✅ | M |
| 17 | 本地图片协议 `mdimg://` | 自定义特权 scheme（`main.js:28,607`；`parser.js:317`；`PreviewPane.vue:384,416`） | `convertFileSrc()` → asset 协议（`http://asset.localhost/...`），**重写 parser + PreviewPane 两处 URL 生成/识别** | ✅ 且更干净 | M |
| 18 | 通用对话框（打开/保存/图片） | `dialog:openFile/openFolder/saveFile/openImage`（326,339,346,357） | `tauri-plugin-dialog` | ✅ | S |
| 19 | 确认未保存弹窗 | `dialog:confirmUnsaved`（435） | `tauri-plugin-dialog` 或 **应用内 Vue 弹窗** | ✅ 建议改 Vue | S |
| 20 | 输入 / 表单 / 表格弹窗 | `showInputBox/showFormDialog/showTableDialog`（449,509,368） | **建议改为应用内 Vue 弹窗**（Electron 现用裸 `BrowserWindow` + `data:` HTML，本就脆弱） | ✅ 且更优 | M |
| 21 | **导出 PDF** | 隐藏窗口 `printToPDF()`（`exportHandlers.js:274,304`） | **无 1:1**（见 §4.1） | ⚠️ **高风险** | L |
| 22 | **导出 PNG** | 隐藏窗口 `capturePage()`（`exportHandlers.js:228,358`） | `webview.capture_snapshot()`（需全页处理）或 `html2canvas` 前端 | ⚠️ 中风险 | M |
| 23 | 导出 HTML | `export:html`（334） | Rust 写文件（HTML 字符串已在渲染端生成） | ✅ | S |
| 24 | 前端渲染层 | CodeMirror6 + Vue + markdown-it | 完全复用 | ✅ 零改动 | — |
| 25 | 拖拽取文件路径 | `getPathForFile` via `webUtils`（`preload.cjs` / `EditorPane.vue:256`） | `drop` 事件 payload 直接含 `path`（Tauri ≥2.1 支持 `onDragDropEvent`） | ✅ 更简 | S |

图例：S=小（≤0.5d） M=中（0.5–2d） L=大（>2d，含研究）

---

## 4. 关键风险点与应对

### 4.1 导出 PDF（最高风险）
Electron 的 `webContents.printToPDF()` 是 Chromium 原生能力，Tauri 2 没有直接等价。可选路径：

| 方案 | 做法 | 保真度 | 代价 |
|---|---|---|---|
| A. 渲染端 `window.print()` | 隐藏 Webview 加载导出 HTML，`window.print()` 让用户选「另存为 PDF」 | 高 | 需手动操作，丧失自动化；受系统打印对话框限制 |
| B. Rust + headless Chrome | 用 `headless_chrome` crate 走 CDP `Page.printToPDF`（最接近现状） | 高 | 需本机有 Chrome 或随包捆绑（增体积），维护重 |
| C. Rust PDF crate | `printpdf` / `genpdf` 直接画 | 低 | 无法还原 HTML/CSS/KaTeX/mermaid 版式，不可取 |
| D. 社区 `tauri-plugin-print` | 封装 WebView 打印 | 中 | 依赖维护状态，Windows 下仍走系统打印 |

**建议**：先用 B 做 spike（若本机/打包机有 Chrome，CDP 路线最稳）；若不可接受，降级到 A（保留一键导出但多一步系统对话框）。**这是决定「能否全量迁移」的开关项——必须在 spike 阶段验证。**

### 4.2 导出 PNG（中风险）
Tauri 2 提供 `webview.capture_snapshot()` 截图当前视口。难点在「整页长图」：需先测量内容高度并把 webview 窗口 resize 到全高（或滚动拼接）。可行，但需处理超大文档（>16384px 高度限制，现状 `exportHandlers.js:192` 已有限制逻辑，需平移）。也可直接用前端 `html2canvas` 借 KaTeX/mermaid 已渲染的 DOM，反而更省事——但这又落回 JS 层。

### 4.3 `mdimg://` 图片协议（必改，但更优）
现状：主进程注册特权 scheme，渲染端 `parser.js:317` 把本地图转 `mdimg:///abs/path`，`PreviewPane.vue:384/416` 解析回路径。Tauri 改法：用 `convertFileSrc(absPath)`（Tauri v2 返回 `http://asset.localhost/...`），**只需改 parser.js 生成处 + PreviewPane 两处识别处**，且天然带 CSP 白名单，比自建 scheme 更规范。

### 4.4 自定义 HTML 弹窗（建议改造，顺手优化）
`showInputBox/showFormDialog/showTableDialog` 当前是裸 `BrowserWindow` + `data:` URL + `require('electron')`（见 `main.js:368/449/509`）。这些本就脆弱（contextIsolation 关闭、跨窗口 ipc）。**建议迁移时直接改成应用内 Vue 弹窗组件**，既消除 3 个 IPC 通道，又统一交互风格、去依赖。属于「迁移红利」。

### 4.5 权限模型变化（配置成本，安全收益）
Electron 用 `contextBridge` 一次性暴露全部 API；Tauri 2 用 **capability 权限文件** 声明每个 command / 插件允许的作用域。初期需为每个窗口配 `capabilities/*.json`，但换来默认安全的攻击面（无 `require`、无 XSS→RCE 路径）。

---

### 4.6 复审：P0–P5 性能优化完成后的增量影响（2026-11-15）

前端性能计划已全部落地（提交链 `d8cb362→1e6f9e0`，v0.8.0 安装版已发布）。逐项核验对迁移结论的影响：

| P0–P5 产出 | 迁移影响 |
|---|---|
| P0 多文件状态保留 / P4 LRU + 预览缓存 | **纯前端，零影响**。EditorState / 缓存均在 WebView 内存中，Tauri 下行为一致 |
| P1 大文件读取守卫（`fileHandlers.js`） | **必须随 `file:read` 一起移植进 Rust command**：stat → 20MB 阈值 → 150MB 截断只读前 20MB，返回结构 `{content,size,isLarge,truncated,truncatedBytes}` 语义不变。这是 Rust 端第一个要写对的业务逻辑 |
| P1 前端侧 `useOpenFile.js` / `LargeFileConfirmModal.vue` | 纯前端，零影响 |
| P2 Web Worker 解析（parserCore / preview.worker / previewClient） | **Tauri WebView2 下照常工作**（Vite `?worker` 打包为经典 worker、无 Node/Electron 依赖，已验证 worker 包自包含）。主线程 DOMPurify 净化流程不变 |
| P3 分块渲染 + 图片懒加载 | 纯前端，零影响。懒加载对 asset 协议同样生效（`mdimg://` → `convertFileSrc` 的替换点不变） |
| P5 专注模式视口 decoration | 纯前端（CM6 扩展），零影响 |

**净结论：P0–P5 不改变迁移面与工作量估算，反而抬高迁移后基线**——性能计划全是 WebView 内 JS 活，Tauri 只换底不换脑，全部成果直接继承。唯一新增动作：Rust `file:read` command 需复刻大文件守卫语义（约半天）。

---

## 5. 工作量拆解（分阶段，单人估算）

| 阶段 | 内容 | 关键交付 | 估时 | 风险 |
|---|---|---|---|---|
| **P0 Spike** | 脚手架：Tauri 2 + Vite/Vue 打通；验证「文件读 + 窗口控制 + mdimg 替换 + 导出（PDF/PNG 选路）」四件事能跑通 | 可行性结论 + 最小可运行 demo | 3–5d | 导出选路不定 → **已启动（2026-11-15）：`tauri-spike` 分支脚手架已落地，待 Rust 工具链安装后编译跑通**（§8） |
| **P1 后端契约** | 用 Rust 重建 §3 中 #1–#12、#23、#25（文件/草稿/历史/图片/Shell/搜索/设置/主题/窗口/拖拽） | 全部 `invoke()` 可用 | 1–2 周 | 低 |
| **P2 外壳** | #14–#16 窗口控制 + 原生菜单 + 单实例 + 文件关联 | 菜单/单实例/主题跟随 | 3–5d | 低 |
| **P3 图片协议** | #17 `mdimg://` → asset 协议（parser + PreviewPane） | 本地图正常显示 | 1–2d | 低 |
| **P4 弹窗改造** | #18–#20 对话框 + 把输入/表单/表格/确认弹窗改应用内 Vue 组件 | 去掉 4 个裸窗口通道 | 3–5d | 低（含 UI） |
| **P5 导出** | #21–#22 PDF（选路实现）+ PNG（snapshot/resize） | 三种导出等价 | 1–2 周 | **高** |
| **P6 打包发布** | Tauri bundler（Windows NSIS/MSI via WiX）、Authenticode + minisign 双签名、跨 WebView QA（WebView2 主测；mac/linux 抽测） | 可下载安装包 | 1 周 | 中（签名/QA） |
| **P7 切换** | 独立分支合并 / 或并行维护；复测性能基线 | 发布候选 | 2–3d | 低 |

**总计：约 6–10 周（单人）。** 导出专项（P5）与签名/QA（P6）是主要不确定来源；若 P0 Spike 选定导出方案 B 且打包机具备 Chrome，则落在 6–7 周下端；若导出降级到 A 或需捆绑 Chromium，则贴近 10 周。

---

## 6. 建议路径（不迎合，从工程与体验出发）

1. **先做 P0 Spike（独立分支 `tauri-spike`），不做全量迁移决策。** 验证四件事：①Rust 文件 I/O 边界跑通 Vue 调用；②窗口控制 + 菜单 + 单实例；③`mdimg→asset` 图片显示；④导出的 PDF/PNG 选哪条路能达标。**导出选路结论出来前，不要投入 P1–P7。**
2. **Tauri 与前端性能计划并行不悖、互不替代。** 性能计划 `docs/performance-optimization-plan.md` 的 P0–P3 是 WebView 内 JS 活，Tauri 下照样要做。可先在当前 Electron 分支把前端性能做完，Tauri 只负责「换底」。
3. **若目标是发行体积 / 内存 / 启动 / 安全 / 未来移动端 → Tauri 值得**，且 Windows 主战场渲染一致性风险低，迁移红利明确（更小的包、asset 协议、应用内弹窗、默认安全）。
4. **若团队短期只想解决卡顿、或人力紧张 → 不建议现在换**，优先推进前端性能计划，Tauri 作为期权保留。
5. **迁移红利顺手拿**：自定义 HTML 弹窗改 Vue 组件、asset 协议替换自建 scheme、主题跟随改用 `matchMedia`——这些即便不换 Tauri 也值得在 Electron 端先做，降低后续迁移面。

---

## 7. 验收与回滚

**验收基线（迁移后对比 Electron 版）**
- 安装包 ≤ 15MB；冷启动 < 1s；开 30 文件空闲内存显著低于现版。
- 全部现有功能等价：文件树/编辑/预览/搜索/历史/导出（PDF/HTML/PNG 三种）/设置/主题/单实例打开。
- 性能计划 P0–P3 在 Tauri 下仍达成（切 20 文件 < 50ms 状态完整、5MB 主线程任务 < 100ms 等）。

**回滚**
- `tauri-spike` 独立分支，不与 `master` 混；若 P0/P5 任一硬阻塞，丢弃分支、保留 Electron 主线，无回滚成本。
- 即便全量迁移后，Electron 代码（`electron/` 目录）在 git 历史中完整保留，可随时 checkout 回退。

---

## 8. 环境就绪度与实施状态（本机实测 2026-11-15）

| 项 | 状态 | 说明 |
|---|---|---|
| WebView2 Runtime | ✅ 157.0.4341.46 | Tauri on Windows 的渲染内核已就绪 |
| Node.js | ✅ v22.22.2 | 前端构建可用 |
| Rust / Cargo | ✅ 1.100.0 (stable msvc) | 2026-11-15 已装（`rustup` + `x86_64-pc-windows-msvc`） |
| MSVC Build Tools | ✅ 14.50.35717 | 已补装「使用 C++ 的桌面开发」工作负载 + WinSDK 10.0.26100（VS Installer `--quiet` 静默补装；注意清理宿主注入的大小写重复 `https_proxy/HTTPS_PROXY` 变量，否则安装器 .NET 字典崩溃） |
| 沙箱 GUI | ❌ 无图形会话 | **本环境无法真正打开 WebView2 窗口**；Rust 编译/配置校验可在此完成，但四步清单的「运行时」验证需在用户桌面端 `npx tauri dev` 执行 |

**实施状态**
- ✅ 已完成：`tauri-spike` 分支建立；`src-tauri/` 脚手架（Cargo.toml / tauri.conf.json / capabilities / Rust commands 含 P1 大文件守卫语义 / `spike-ui/` 验证页）；契约面复审（§1.1）。
- ✅ **Rust 端编译通过（2026-11-15）**：`cargo build` 干净产出 `target/debug/mdev.exe`（13.8MB），证明 FFI 契约、`tauri.conf.json` 配置、权限校验、6 个自定义命令（`greet`/`read_text_file`/`write_text_file`/`list_dir`/`exists`/`resolve_path`）、图标嵌入全部合法。
- ⏳ 阻塞项（边界）：本沙箱无 GUI，**无法在此打开窗口跑四步清单**；需用户在桌面端 `npx @tauri-apps/cli dev` 验收。
- **四步验证清单（spike 验收标准，桌面端执行）**：
  1. **文件 I/O**：spike 页输入任意本地 .md 路径 → `invoke('read_text_file')` 返回内容 + `isLarge/truncated` 标记正确（拿 >20MB 文件验证守卫语义）。
  2. **asset 协议图片**：输入本地图路径 → `convertFileSrc` 后 `<img>` 正常显示（替代 `mdimg://` 的可行性）。
  3. **对话框**：`window.__TAURI__.dialog.open()` 选文件/文件夹正常。
  4. **导出选路（§4.1）**：确认本机 Chrome → CDP `Page.printToPDF` 方案 B 可行性；不可行则评估方案 A。**此项结论决定是否全量迁移。**
- **桌面端跑法**：`git checkout tauri-spike` → `cd src-tauri` → `npx @tauri-apps/cli dev`（首次会从 npm 拉 CLI；`tauri.conf.json` 无 `devUrl`，Tauri 2 会直接静态托管 `frontendDist=../spike-ui`，无需另起 dev server）。
