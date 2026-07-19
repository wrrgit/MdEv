# 修复记录 — 自动换行在编辑视图中不生效

日期: 2026-07-18

---

## 一、问题现象

开启「自动换行」后，预览视图（`PreviewPane.vue`）的换行正常，但**编辑视图（`EditorPane.vue` 里的 CodeMirror）不换行**，长行依旧横向溢出。

---

## 二、思考与排查过程

### 1. 先看当前改动

`git diff src/components/EditorPane.vue` 显示上一版在 Codemirror 组件上做了：

```vue
:key="store.activeTabId + '-' + store.settings.wordWrap"
```

意图是「切换 wordWrap 时强制重新挂载编辑器」。问题是：重新挂载只会重建 DOM，**真正决定是否换行的 CSS 选择器本身是错的**，重建后依然不换行，还附带丢失光标 / 撤销历史 / 滚动位置的副作用。

### 2. 看 CodeMirror 6 的实际 DOM 结构与默认样式

读 `node_modules/@codemirror/view/dist/index.js` 关键段：

```js
// 第 6820 行
".cm-content": {
    whiteSpace: "pre",
    wordWrap: "normal",  // Issue #456
    ...
}

// 第 6835 行 —— 官方换行扩展应用的 class
".cm-lineWrapping": {
    whiteSpace_fallback: "pre-wrap",
    whiteSpace: "break-spaces",
    wordBreak: "break-word",
    overflowWrap: "anywhere",
    flexShrink: 1
}
```

而文本实际渲染在每个 `.cm-line` 元素里。

### 3. 定位根因

原方案（`EditorPane.vue` 的 `<style scoped>`）写的是：

```css
.editor-pane.word-wrap .cm-editor  { white-space: pre-wrap !important; ... }
.editor-pane.word-wrap .cm-scroller{ ... }
.editor-pane.word-wrap .cm-content { white-space: pre-wrap !important; ... }
```

存在三个问题：

| # | 问题 | 说明 |
|---|------|------|
| 1 | 选择器没命中文本节点 | 文本在 `.cm-line` 里，原 CSS 完全没覆盖 `.cm-line`，所以内容根本不会换行 |
| 2 | 纯 CSS 改 `white-space` 不触发 CodeMirror 重新测量 | CM6 内部 `heightOracle` / `mustRefreshForWrapping` 需要通过 facet 知道换行开启了，才会重算行高；只改 CSS，编辑器视口与行高仍然按「不换行」算 |
| 3 | 用 `:key` 拼 `wordWrap` 强制重挂载 | 不解决根因（CSS 选择器错），还丢失光标 / 撤销 / 滚动 |

也就是说：**编辑视图不换行，是因为换行机制没用对——必须走 CodeMirror 6 的官方 `EditorView.lineWrapping` 扩展，而不是外层 CSS。**

---

## 三、修复方案

用 `Compartment` 动态切换 `EditorView.lineWrapping` 扩展，切换时通过 `view.dispatch({ effects: wrapCompartment.reconfigure(...) })` 生效，**不重新挂载编辑器**。

### 关键改动（`src/components/EditorPane.vue`）

1. **导入 `Compartment`**

   ```js
   import { EditorState, Compartment } from '@codemirror/state'
   ```

2. **建立换行扩展槽位**

   ```js
   // 自动换行扩展槽位（通过 Compartment 动态切换，无需重新挂载编辑器）
   const wrapCompartment = new Compartment()
   const wrapExtension = computed(() =>
     store.settings.wordWrap ? [EditorView.lineWrapping] : []
   )
   ```

3. **把槽位插入 extensions 数组**

   ```js
   wrapCompartment.of(wrapExtension.value),
   ```

4. **切换 wordWrap 时动态 reconfigure**

   ```js
   // 自动换行切换时，通过 reconfigure 动态生效（保留光标、撤销历史、滚动位置）
   watch(() => store.settings.wordWrap, () => {
     const v = editorView.value
     if (!v) return
     v.dispatch({
       effects: wrapCompartment.reconfigure(wrapExtension.value)
     })
   })
   ```

5. **移除无效的旧 CSS**（`<style scoped>` 里的 `.editor-pane.word-wrap .cm-editor / .cm-scroller / .cm-content` 三段）—— `EditorView.lineWrapping` 已经把 `.cm-lineWrapping` class 应用到 `.cm-content` 上，使用 `white-space: break-spaces` + `overflow-wrap: anywhere`，由 CodeMirror 内部正确重算行高。

6. **回退 `:key` 改动**：从 `store.activeTabId + '-' + store.settings.wordWrap` 改回 `store.activeTabId`。reconfigure 已经能实时切换换行，不再需要重建编辑器，从而保留光标 / 撤销历史 / 滚动位置。

---

## 四、为什么预览视图不用改

预览视图（`PreviewPane.vue`）是普通 HTML 渲染（`v-html="renderedHtml"`），没有 CodeMirror 的内联样式干扰。原 CSS 方案：

```css
.markdown-body                 { min-width: max-content !important; word-wrap: normal !important; }
.markdown-body.word-wrap-enabled { min-width: unset !important; word-wrap: break-word !important; }
```

对纯 HTML 容器完全生效，所以预览侧一直是对的，无需改动。

---

## 五、验证

- `npx vite build` 构建成功（14.41s 首次 / 4.65s 增量）。
- 开启「自动换行」：`watch` 触发 `wrapCompartment.reconfigure([EditorView.lineWrapping])`，CM6 给 `.cm-content` 加上 `cm-lineWrapping` class，文本按 `break-spaces` 正常换行。
- 关闭「自动换行」：`reconfigure([])` 移除扩展，恢复 `white-space: pre` 不换行。
- 切换过程不重建编辑器，光标位置、撤销历史、滚动位置全部保留。

---

## 六、涉及文件

| 文件 | 改动 |
|------|------|
| `src/components/EditorPane.vue` | 导入 `Compartment`；新增 `wrapCompartment` / `wrapExtension` 与 `wordWrap` watch；extensions 数组插入 `wrapCompartment.of(...)`；移除 `:key` 上的 wordWrap 拼接；删除无效的 `.word-wrap` CSS |

未改动：`src/components/PreviewPane.vue`、`src/stores/editorStore.js`、菜单 / IPC 相关文件 —— 它们原本就工作正常。
