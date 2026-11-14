# MdEv 性能优化计划：大文件读取 / 大文件滚动渲染 / 多文件并发

> 对标对象：VS Code / Monaco、CodeMirror 6、mdview.io、Typora/Obsidian 类实现
> 适用范围：MdEv（Electron + Vue3 + CodeMirror 6 + markdown-it + DOMPurify）
> 目标：在不牺牲功能的前提下，让 MdEv 在「单文件多 MB / 数万行」与「数十个文件同时打开」两类场景下保持流畅、无卡死、切标签状态不丢。

---

## 一、执行摘要（结论优先）

1. **编辑区不是瓶颈**。CodeMirror 6 原生即行级虚拟滚动，十万行文档 DOM 也只维持视口内几十行，无需自研。真正的短板在**预览渲染**与**多文件状态管理**。
2. **最该先修的体验 bug：多文件切标签丢状态**。当前单 `EditorView` + `:model-value` 绑定，切标签时整篇 `dispatch` 重设 doc，导致 **undo 历史、光标、选区、滚动位置全部丢失**（store 里 `scrollPos`/`cursorPos` 字段声明了但从未回写，见 `stores/editorStore.js`）。这是多文件体验的头号痛点。
3. **预览是主线程杀手**。每次防抖后都是「整篇 markdown-it 同步解析 + DOMPurify + 全量 KaTeX + 全量代码高亮」，整篇 HTML 注入 DOM，**无虚拟滚动、无 Web Worker**。Mermaid 已用 `IntersectionObserver` 懒渲染（做得对），但 KaTeX 与高亮仍是全量。
4. **大文件读取无保护**。主进程 `readFile` 一次性读全量，无文件大小阈值、无「大文件模式」、无打开前确认。
5. **业界共识打法**：per-file 模型 + 懒挂载 + LRU 淘汰（多文件）；Worker 解析 + `requestIdleCallback` 挂载（渲染）；块级虚拟滚动 + 视口门控重内容（大文档预览）；大文件模式降级（读取）。

---

## 二、现状诊断（MdEv 实测，附文件定位）

| 领域 | 当前行为 | 风险点 | 定位 |
|---|---|---|---|
| 文件读取 | 主进程 `readFile(path,'utf-8')` 整文件一次读入，作为单字符串经 IPC 回传 | 多 MB 文件无阈值、无降级、无确认；内存/解析峰值 | `electron/ipc/fileHandlers.js:10-17`、`electron/preload.cjs:5`、调用点 `App.vue:214/291/331/454/470/491`、`PreviewPane.vue:442` |
| 编辑器 | 单 `Codemirror` 实例（`v-if="store.activeTab"`，跨标签保持挂载）；`:model-value=store.content`，切标签整篇 `dispatch` 重设 | **undo/光标/选区/滚动在切标签后全丢**；`updatePerformance` 未启用 | `src/components/EditorPane.vue:5-17,49,353-405`；`stores/editorStore.js:126-134,188-198` |
| 专注模式 | `computeDimDecorations` 对**每一行** `for(1..state.doc.lines)` 构建 `Decoration`，O(N) | 超大文档上首次/周期重建 decoration 开销极高 | `src/components/focusTypewriter.js:23-37,50-56` |
| 预览渲染 | `parseMarkdown` 整篇同步 `parser.render` + `DOMPurify.sanitize`；`v-html` 整串替换 | 主线程阻塞；KaTeX/高亮全量、无视口门控 | `src/core/markdown/parser.js:323-356`；`PreviewPane.vue:5,236-266` |
| 预览防抖 | 分级 `normal`120ms / `large`(>60万字符或>2万行)400ms / `huge` 暂停自动刷新 | 已有分级兜底，但手动刷新/打开仍是整篇主线程同步 | `core/perf.js:14-32`、`PreviewPane.vue:206-209` |
| 预览虚拟滚动 | **无**。整篇 HTML 注入单个 `.markdown-body` div | 万行文档数千 DOM 节点，滚动卡 | 全项目无 `virtual` 依赖 |
| Mermaid | `IntersectionObserver`(rootMargin 300px) 仅渲染视口内图表，块级懒 import | ✅ 业界正确做法，保留 | `PreviewPane.vue:463,473-502` |
| 多文件 | 单 `EditorPane`+`PreviewPane` 实例，无 `keep-alive`、无按 tab `v-for`；inactive 预览不渲染（无后台开销） | 无后台开销是优点；但每次切标签 = 整篇重建 doc + 整篇重渲染预览；多份 `content` 字符串常驻内存线性增长 | `App.vue:9-28`；`stores/editorStore.js:11-18` |
| 缺失能力 | `requestIdleCallback`、**Web Worker**、虚拟滚动、`keep-alive`、`EditorView.updatePerformance` 均未使用 | — | 全局 grep 确认 |

---

## 三、业界主流实现对标洞察

### 3.1 多文件 / 标签（VS Code / Monaco）
- **per-file 模型**：Monaco 每个打开文件有独立 model（文本 + 独立 undo 历史），切标签只 swap model 并**恢复光标与滚动位置**，undo 按文件隔离。
- **懒挂载 + 保留 + LRU 淘汰**：tab 首次访问才挂载，之后保留（`display:none/block` 切换）；但隐藏的编辑器实例占内存（Monaco ~30–50MB/个），故设 **keep-alive 上限（推荐 8 个），超出 LRU 淘汰**，把内存钉死在可控范围。
- **stale-while-revalidate 内容缓存**：切换时先同步命中内存缓存即刻渲染（0ms 白屏），后台再异步校验磁盘/草稿，避免闪烁。
- **后台操作门控**：非激活 tab 的文件监听、光标状态栏、拖拽监听统统挂起。
- **可见性重算**：隐藏 tab 变可见时调 `layout()`/`updateState()`（因 `display:none` 上报零尺寸）。

### 3.2 大文件读取（VS Code / Monaco）
- **大文件模式自动触发**：约 20MB 或 30 万行（部分资料 50MB）时，自动关闭 tokenization、word-wrap、folding、CodeLens、word highlight、sticky scroll，换取流畅。
- **打开前确认**：`workbench.editorLargeFileConfirmation`（MB 阈值）在超大文件前弹确认，避免误开卡死。
- **流式/虚拟文件系统 + 内存映射**：底层 `TextBuffer` 流式读取，非一次性。

### 3.3 大文件滚动渲染
- **编辑器侧**：CodeMirror 6 已原生虚拟滚动（行块 + 高度缓存），无需自研；重点是**别在超大文档上做 O(N) 的全文 decoration**（专注模式陷阱）。
- **预览侧（真正的难点，业界方案）**：
  - **块级虚拟滚动**：mdview.io 将文档切成 ~140KB 块，按行数估算高度撑起滚动条，滚动时二分查找可见块，仅渲染视口 ±overscan（约 50%），DOM 永远只保留 2–3 块 + 两个 spacer。
  - **分块懒解析**：初始化只解析首屏块，其余在 `requestIdleCallback` 后台逐步解析；切块须识别代码围栏/引用/列表上下文，避免切碎不可分块。
  - **重内容视口门控**：KaTeX 排版（大文档 1–2s）、代码高亮、图片（IntersectionObserver 懒加载 `data-src`）均「进入视口才渲染并缓存」。
  - **挂载让出主线程**：Worker 算完 HTML 后，用 `requestIdleCallback` 挂载，用户再次输入则取消合并。
  - **代码块内再虚拟化**：单块超过阈值（如 1000px）时块内也行级虚拟化。

### 3.4 线程模型（VS Code / Monaco）
- **Web Worker 承载重活**：解析、搜索索引、diff、Lint 全搬进 Worker，主线程只做 UI，输入始终响应。
- 进程隔离：渲染进程、扩展宿主、LSP 各自独立，单点阻塞不拖垮整体。

---

## 四、差距 → 优先级排序

| 差距 | 影响面 | 优先级 | 理由（用户体验 + 工程质量） |
|---|---|---|---|
| 切标签丢 undo/光标/滚动 | 多文件日常 | **P0** | 最高频痛点，修复成本低、收益大 |
| 大文件读取无保护/确认 | 偶发但致命 | **P1** | 一次误开大文件即卡死/崩溃 |
| 预览整篇同步渲染 | 大文件 + 长文 | **P2** | 主线程阻塞，打字掉帧 |
| 预览无虚拟滚动 / 重内容全量 | 大文件 | **P3** | 万行 DOM 卡顿 + KaTeX/高亮全量 |
| 多文件内存/切换开销 | 数十文件 | **P4** | 内存线性增长 + 切换闪烁 |
| 专注模式 O(N) decoration / 大文件降级 | 超大文档 | **P5** | 专注模式在巨文档上崩 |

---

## 五、性能优化路线图

### P0 — 多文件状态保留（切标签瞬时恢复）★ 最高性价比
**目标**：切回任一已打开 tab 时，undo 历史、光标、选区、滚动位置原样恢复，零重渲染闪烁。
**方案**：
- 在 store 维护 `Map<tabId, EditorState>`（或完整 CM state）。切出时保存 `view.state` 与 `scrollDOM.scrollTop`；切回时 `view.setState(savedState)` 并恢复 scroll。
- 清理 `editorStore.js` 中从未生效的 `scrollPos`/`cursorPos`，改为真正回写/读取。
- 视情况为预览也保存滚动位置（复用 `PreviewPane` 滚动监听）。
**验收**：打开 20 个文件来回切换，undo/光标/滚动一致；切换 < 50ms。
**风险**：低。`EditorState` 轻量，CM6 官方支持 `setState`。

### P1 — 大文件读取保护
**目标**：大文件不卡死，打开前给用户选择。
**方案**：
- 主进程读取前 `fs.stat` 取 size；超过阈值（建议 **20MB 或 30 万行**）进入「大文件模式」：
  - 弹确认框（参考 `editorLargeFileConfirmation`），选项：仅编辑模式打开 / 取消。
  - 编辑区关闭语法高亮、folding、`word-wrap`、专注模式 decoration；预览降级为「手动刷新 + 提示」。
- 超大文件可仅读前 N MB 预览并提示「文件过大，已截断显示」。
**验收**：拖入 100MB 日志，弹确认且编辑区可流畅滚动；不触发整篇解析。

### P2 — 预览解析移出主线程（Web Worker）
**目标**：markdown-it + DOMPurify 不再阻塞输入。
**方案**：
- 新建 `preview.worker.ts`：`new Worker(new URL('./preview.worker.ts', import.meta.url), {type:'module'})`；主线程 post 源串，worker 内 `markdown-it.render` + `DOMPurify.sanitize` 后回传 HTML（注意：DOMPurify 需在 worker 内用 `createDOMPurify(new WorkerDOM)` 适配，或仅 worker 产 token/HTML 主线程净化）。
- 主线程收到 HTML 后 `requestIdleCallback` 挂载，用户再次输入则取消合并（只保留最新一次渲染）。
- Mermaid 保留主线程（依赖 DOM），KaTeX 可在 worker 预排版或留 P3 视口门控。
**验收**：5MB 文档打字，主线程无 > 100ms 长任务（Performance 面板验证）。
**风险**：markdown-it 插件（texmath 等）须在 worker 上下文可 import；DOM 相关插件需剥离。

### P3 — 预览虚拟滚动 + 重内容视口门控
**目标**：万行文档预览 DOM 节点数恒定，KaTeX/高亮不再全量。
**方案（两档，按阈值切换）**：
- **轻量大文档（< 2MB 或 < 2 万行）**：保持整篇渲染，但把 KaTeX 与代码高亮改为 **IntersectionObserver 视口门控懒渲染 + 结果缓存**（复用 Mermaid 的 IO 模式），图片懒加载 `data-src`。
- **超大文档（> 阈值）**：启用**块级虚拟滚动**——按空行/代码围栏切 ~140KB 块，估算高度撑滚动条，二分找可见块，仅渲染视口 ±overscan；`requestIdleCallback` 后台补解析。
- 注意：虚拟滚动会破坏朴素 Ctrl+F 与滚动联动锚点，故**仅对超大文档启用**，小文档走整篇。
**验收**：10 万行预览滚动帧率稳定；KaTeX 仅在可见块计算。

### P4 — 多文件内存与切换优化
**目标**：数十文件内存可控、切换无白屏。
**方案**：
- 内容 `Map` 缓存（stale-while-revalidate）：切标签同步命中缓存即渲染，后台异步校验磁盘。
- `keep-alive` + **LRU 上限（默认 8）**：最近使用的 8 个 tab 保留 `EditorState`/预览挂载，超出淘汰（仅丢弃保存的状态，content 仍在 store）。
- 非激活 tab 挂起文件监听、光标状态栏、拖拽监听等后台操作。
- 可见性重算：隐藏 tab 变可见时 `view.requestMeasure()`/重算布局。
**验收**：开 30 个文件，内存有上限；最近 8 个切换 0ms，其余冷启 < 300ms。

### P5 — 大文件降级 & 专注模式优化
**目标**：超大文档下专注模式不崩，编辑区自适应降级。
**方案**：
- 专注模式 decoration 改为**仅构建视口内 ±overscan 行**，滚动时增量重建（而非全文 O(N)）。
- 启用 `EditorView.updatePerformance` 降低 update 开销。
- 大文件模式（P1）下默认关 decoration/折叠/高亮。
**验收**：20 万行 + 专注模式，滚动无卡顿。

---

## 六、实施风险与注意事项

1. **Web Worker 边界**：markdown-it 的 DOM 依赖插件（mermaid、部分 HTML 注入）不能进 worker，需剥离或在主线程二次处理。
2. **虚拟滚动的副作用**：朴素 Ctrl+F、滚动联动锚点会失效，必须阈值门控 + 配套改造搜索/联动逻辑（可参考现有 `activateSearch` 的寻行机制）。
3. **LRU 淘汰边界**：需处理「被淘汰 tab 有未保存改动」时禁止淘汰或提示；与自动保存（3s 节流）协同。
4. **Worker 打包**：Vite + Electron 下 worker 需正确 `import.meta.url` 形式，避免被误判为外部资源而打不进 asar。
5. **回归**：P0/P2 改动面大，须回归「小文件正常 undo/预览」与「大文件降级」两条路径。

---

## 七、验收指标（建议纳入 CI/手动基线）

| 场景 | 指标 | 目标 |
|---|---|---|
| 单文件 5MB / 10 万行 | 编辑器滚动 FPS | ≥ 50 |
| 单文件 5MB / 10 万行 | 主线程最长任务 | < 100ms |
| 50k 行文档打字 | 输入到字符上屏延迟 | < 16ms（60fps） |
| 切换 20 个已开文件 | 单次切换耗时 | < 50ms，状态完整 |
| 同时开 30 个文件 | 渲染进程内存 | 有上限（LRU 8），不随文件数线性膨胀 |
| 100MB 日志 | 打开行为 | 弹确认，编辑区可用，不整篇解析 |

---

## 八、建议执行顺序

`P0（状态保留）→ P1（读取保护）→ P2（Worker 解析）→ P3（预览虚拟化/门控）→ P4（多文件内存）→ P5（降级/专注模式）`

P0/P1 成本低、直接消除最痛的体验缺陷，建议随下个版本落地；P2/P3 是重头戏，需单独迭代验证。
