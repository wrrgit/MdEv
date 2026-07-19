# MdEv 开发记录

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
