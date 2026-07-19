# 调试经验记录

## 问题：TitleBar 在无文件打开时消失

### 现象
- 打开文件后：左上角有 Logo，右上角有关闭/最小化/最大化按钮
- 无文件打开（首页空状态）：TitleBar 的 Logo 和窗口按钮全部消失

### 根因
`MenuBar.vue` 中的 `.empty-state` 使用了：

```css
.empty-state {
  position: fixed;
  inset: 0;            /* ← top:0; right:0; bottom:0; left:0 */
  background: var(--bg-primary);
  z-index: 5;
}
```

`inset: 0` 使空状态遮罩覆盖**整个视口**，包括 TitleBar 所在区域。TitleBar 虽然设置了 `z-index: 100`，但作为 flex 子节点且没有显式 `position`，其 z-index 未能有效对抗 fixed 定位的全屏遮罩。

### 修复

```css
.empty-state {
  position: fixed;
  top: 66px;   /* TitleBar(36px) + MenuBar(30px) */
  left: 0;
  right: 0;
  bottom: 0;
  ...
}
```

空状态遮罩从 TitleBar 下方开始，不再覆盖标题栏。

### 教训

| 之前犯的错 | 正确做法 |
|------------|----------|
| 反复重建包、验证 asar 文件 | 先用 DevTools 检查 CSS 层叠和渲染 |
| 觉得"代码看起来正确"就以为没问题 | 针对性地检查**特定状态**下的 CSS 表现 |
| 忽略条件渲染的组件（v-if） | 注意 `v-if` 组件只在特定状态出现，其 CSS 可能影响全局布局 |
| 把问题归因于构建/打包流程 | 先排除源码层面的问题，再排查构建 |

### 通用原则

1. **"在 X 状态下正常，Y 状态下异常" → 检查 Y 状态独有的元素和 CSS**
2. **fixed + inset:0 是全屏遮罩，会盖住同级元素，即使 z-index 更高也不可靠**
3. **flex 子节点的 z-index 需要配合 position 才能可靠工作**
4. **先改源码验证，再考虑构建问题**

---

## 问题：工具栏按钮点击无反应

### 现象
- 工具栏按钮正常显示（图标+文字）
- 点击按钮后编辑器无任何变化（加粗、标题、公式等均无效）

### 根因

**vue-codemirror 的 `@ready` 事件传递的是 payload 对象，不是 EditorView 本身。**

vue-codemirror 源码（`component.ts`）：
```javascript
context.emit(EventKey.Ready, {
  state: state.value!,
  view: view.value!,      // ← 这才是 EditorView
  container: container.value!
})
```

我们的代码（修复前）：
```javascript
const onEditorReady = (view) => {   // ← 参数名误导！
  window.editorRef = view            // ← 实际是 { state, view, container }
}
```

导致 `window.editorRef` 是整个 payload 对象。Toolbar 中：
```javascript
const { state, dispatch } = view    // ← dispatch 为 undefined！
```

所有 `dispatch(...)` 调用静默失败，按钮看起来"没反应"。

### 修复

```javascript
const onEditorReady = (payload) => {
  const v = payload.view
  editorView.value = v
  window.editorRef = v
}
```

### 教训

| 之前犯的错 | 正确做法 |
|------------|----------|
| 看到 `@ready="onEditorReady"` 就以为拿到的是 EditorView | **查阅库文档/源码确认事件参数的具体结构** |
| 参数命名为 `view` 就以为是 EditorView | 参数名不能说明类型，要实际打印或查阅文档 |
| 按钮"没反应"就反复重写 switch/case | 先用 `console.log` 确认 `dispatch` 是否存在 |
| 改了多次代码还是不行 | 问题可能在上游（库的事件传递），不在自己的代码 |

### 通用原则

1. **第三方库的事件回调参数 ≠ 你以为的类型**，必须查文档确认
2. **静默失败是最大的陷阱** — `dispatch(...)` 中 `dispatch` 为 `undefined` 时不会报错，只是什么都不发生
3. **调试第一步：`console.log` 关键变量**（`window.editorRef`、`dispatch`、`state`）
4. **参数命名不能代替类型检查** — 即使变量叫 `view`，也可能是 `{ view, state, container }`

---

## 问题：预览区滚动条在默认窗口大小下不显示

### 现象
- 打开长文件，预览区不显示滚动条，内容被裁切
- 将窗口放大后，滚动条才出现
- `overflow-y: scroll` 已设置，理论上滚动条应该始终显示

### 根因分析

**Flex 布局中 `min-height: auto` 阻止 flex 子节点缩小到内容以下。**

CSS flex 子节点默认 `min-height: auto`，即最小高度 = 内容高度。当 `.preview-area`（flex 子节点）的 `min-height: auto` 导致它无法缩小到 `.main-content` 给定的高度时，`.preview-scroll` 就得到了一个等于内容高度的父容器，`overflow-y: scroll` 无内容可滚动，滚动条不渲染。

布局链：
```
.app-container (height: 100%, flex column)
  └─ .main-content (flex: 1, overflow: hidden) ← 有确定高度
       └─ .preview-area (flex: 1, overflow: hidden) ← min-height: auto 阻止缩小
            └─ .preview-pane (height: 100%) ← 100% of .preview-area
                 └─ .preview-scroll (flex: 1, overflow-y: scroll) ← 高度 = 内容高度，无滚动
```

### 尝试的修复

```css
/* App.vue scoped + main.css */
.preview-area {
  display: flex;
  flex-direction: column;   /* 添加：确保纵向布局 */
  overflow: hidden;
  min-height: 0;            /* 关键：允许 flex 子节点缩小 */
}

/* PreviewPane.vue scoped */
.preview-pane {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;            /* 添加 */
}

.preview-scroll {
  flex: 1;
  min-height: 0;            /* 添加：允许滚动容器缩小 */
  overflow-x: scroll;
  overflow-y: scroll;
}
```

### 状态
- [!] **尚未解决** — 修复代码已写入，但验证未通过
- 可能原因：`overflow: hidden` 在 flex 容器上可能影响百分比高度子元素的解析
- 下一步：检查 `overflow: hidden` 是否需要改为 `overflow: visible`，或使用 `contain: size` 替代

### 教训

| 之前犯的错 | 正确做法 |
|------------|----------|
| 只看 `overflow-y: scroll` 就认为滚动条应该显示 | 需要检查整个 flex 高度链是否正确传递 |
| 添加 `min-height: 0` 后期望立即生效 | flex 布局的 `min-height` 修复需要整条链都设置 |
| 忽略 `overflow: hidden` 对 flex 子节点的影响 | `overflow` 属性会影响 flex 布局中百分比高度的解析 |

### 通用原则

1. **Flex 子节点的 `min-height: auto` 是隐藏的陷阱** — 当内容大于容器时，flex 子节点不会自动缩小
2. **滚动条不显示 = 内容没有溢出** — 先检查容器是否获得了约束高度
3. **Flex 高度链** — `min-height: 0` 需要在整条链上设置（父→子→孙）
4. **`overflow: hidden` + flex + `height: 100%`** — 这个组合在不同浏览器中行为可能不同

---

*记录时间：2026-07-12*
