# 修改记录 — 自动换行 + 打开文件夹修复

日期: 2026-07-18

---

## 1. 菜单栏 "工具" → "显示" + 新增 "自动换行" 功能

**文件:** `src/components/MenuBar.vue:230-242`

- 将菜单项 `label: '工具'` 改为 `label: '显示'`
- 在菜单末尾新增「自动换行」选项，带 ✓ 勾选状态
- 点击时切换 `store.settings.wordWrap` 并通过 `window.api.setSettings()` 持久化

```js
{ label: '自动换行', checked: store.settings.wordWrap, action: () => { store.settings.wordWrap = !store.settings.wordWrap; window.api?.setSettings({ settings: { ...store.settings } }) } }
```

---

## 2. 编辑视图自动换行（CSS 方案）

**文件:** `src/components/EditorPane.vue`

- 第 2 行: 根元素添加动态 class `:class="{ 'word-wrap': store.settings.wordWrap }"`
- 第 157-170 行: 新增 `.word-wrap` 相关 CSS，对 `.cm-editor`、`.cm-scroller`、`.cm-content` 施加 `white-space: pre-wrap` + `word-break: break-word`
- 移除了原有基于 `EditorView.lineWrapping` extension 的方案（vue-codemirror 切换 extension 时 reconfigure 不可靠）

```css
.editor-pane.word-wrap .cm-editor {
  white-space: pre-wrap !important;
  word-break: break-word !important;
  overflow-wrap: break-word !important;
}
.editor-pane.word-wrap .cm-scroller {
  overflow-wrap: break-word !important;
  word-break: break-word !important;
}
.editor-pane.word-wrap .cm-content {
  white-space: pre-wrap !important;
  overflow-wrap: break-word !important;
  word-break: break-word !important;
}
```

---

## 3. 预览视图自动换行

**文件:** `src/components/PreviewPane.vue`

- 第 9 行: `.markdown-body` 元素添加动态 class `:class="{ 'word-wrap-enabled': store.settings.wordWrap }"`
- 第 142-146 行: 新增 `.markdown-body.word-wrap-enabled` CSS，覆盖原有 `word-wrap: normal` 强制样式

```css
.markdown-body.word-wrap-enabled {
  min-width: unset !important;
  word-wrap: break-word !important;
  overflow-wrap: break-word !important;
}
```

---

## 4. 打开文件夹后侧栏不显示 + 欢迎页遮挡修复

### 4a. 欢迎页遮挡

**文件:** `src/components/MenuBar.vue:37`

- 原条件: `v-if="store.tabs.length === 0"`
- 新条件: `v-if="store.tabs.length === 0 && store.fileTree.length === 0"`

打开文件夹后 `store.fileTree` 有数据，欢迎页不再显示，侧栏文件树可见。

### 4b. 侧栏折叠

**文件:** `src/components/PanelSidebar.vue`

- 第 2 行: 原折叠条件 `!hasTabs || !store.sidebarVisible` 改为 `(!hasTabs && !hasFileTree) || !store.sidebarVisible`
- 第 94 行: 新增 `const hasFileTree = computed(() => store.fileTree.length > 0)`

---

## 5. Electron 原生菜单同步（辅助）

### 5a. 主进程菜单

**文件:** `electron/main.js`

- 第 88 行: `setupMenu()` 改为 `async function setupMenu()`，内部 `await getSettingsStore()`
- 第 43 行: `createWindow()` 改为 `async function createWindow()`
- 第 196-206 行: 在视图菜单后新增「显示」菜单，含「自动换行」checkbox，初始状态从持久化设置读取 `settingsStore.get('settings.wordWrap', false)`

### 5b. Preload 通道

**文件:** `electron/preload.cjs:62`

- `validChannels` 数组新增 `'menu:toggle-wordwrap'`

### 5c. 渲染进程事件处理

**文件:** `src/App.vue:168-171`

- 新增 `menu:toggle-wordwrap` 事件监听，切换 `store.settings.wordWrap` 并持久化
- 第 180 行: cleanup channels 数组同步新增 `'menu:toggle-wordwrap'`

### 5d. Settings Store 导出

**文件:** `electron/ipc/settingsHandlers.js`

- 新增 `export async function getSettingsStore()` 供 main.js 导入使用
- `registerSettingsHandlers` 内部 `getStore()` 改为复用 `getSettingsStore()`
- 清理了 `getStore()` 中因重构残留的死代码

---

## 涉及文件汇总

| 文件 | 改动类型 |
|------|----------|
| `src/components/MenuBar.vue` | 菜单重命名 + 新增自动换行 + 欢迎页条件 |
| `src/components/EditorPane.vue` | 编辑器自动换行 CSS |
| `src/components/PreviewPane.vue` | 预览自动换行 CSS |
| `src/components/PanelSidebar.vue` | 侧栏折叠条件 |
| `src/App.vue` | IPC 事件处理 |
| `electron/main.js` | 原生菜单 + async 改造 |
| `electron/preload.cjs` | IPC 通道 |
| `electron/ipc/settingsHandlers.js` | 导出 getSettingsStore |
