# 预览视图滚动条修复记录

## 日期
2026-07-15

## 问题描述
- 预览视图上下滚动条只在窗口扩大后才显示，小窗口时不显示
- 预览视图左右滚动条一直不显示

## 根本原因

### 1. 上下滚动条不显示（主因）
`.preview-pane` 使用 `height: 100%` 设置高度。在嵌套 flex 布局中：

```
.preview-area (flex子项, overflow:hidden, flex-direction:column)
  └── .preview-pane (height:100%)          ← 问题所在
        └── .preview-scroll (flex:1, overflow:scroll)
              └── .markdown-body
```

`height: 100%` 需要父元素有明确的高度值才能解析。但 `.preview-area` 的高度由 flex 算法决定，不是显式设定的，导致 `height: 100%` 解析异常 → `.preview-pane` 高度不受约束 → `.preview-scroll` 也无法获得约束高度 → 内容直接撑大容器而非溢出 → 滚动条不出现。

窗口扩大后，某些情况下约束偶然生效，滚动条才显示。

**修复**：将 `.preview-pane` 的 `height: 100%` 改为 `flex: 1; min-height: 0`，让 flex 算法直接分配约束高度。

### 2. 左右滚动条不显示（次因）
`github-markdown-css` 给 `.markdown-body` 设置了 `word-wrap: break-word`，所有文字自动换行，永远不会产生水平溢出，因此水平滚动条始终不触发。

**修复**：用 `word-wrap: normal !important; overflow-wrap: normal !important` 覆盖，允许长文本水平溢出触发滚动条。

## 修改文件清单

### 1. src/components/PreviewPane.vue

| 位置 | 修改前 | 修改后 | 说明 |
|------|--------|--------|------|
| `.preview-pane` | `height: 100%` | `flex: 1; min-height: 0` | 核心修复：flex布局正确约束高度 |
| `.preview-pane` | `border-left: 1px solid var(--border-color)` | 删除 | 移除与父级`.preview-area`重复的左边框 |
| `.preview-scroll` | `overflow-x: scroll; overflow-y: scroll` | `overflow: scroll` | 简化写法，效果相同 |
| `.markdown-body` (scoped) | `min-width: max-content` | 删除 | 不再需要，word-wrap覆盖即可 |
| 新增 (非scoped) | - | `.markdown-body { word-wrap: normal !important; overflow-wrap: normal !important }` | 覆盖github-markdown-css的自动换行 |
| 新增 (非scoped) | - | `.markdown-body pre { overflow-x: auto !important; word-wrap: normal !important }` | 代码块保留独立水平滚动 |
| 新增 (非scoped) | - | `.markdown-body table { overflow-x: auto !important }` | 表格保留独立水平滚动 |

### 2. src/App.vue
无实质性改动，`.preview-area` 保持 `overflow: hidden` 约束高度。

### 3. src/styles/main.css
无实质性改动，`.preview-area` 保持 `overflow: hidden`。

## 技术要点

### flex布局中 `height: 100%` vs `flex: 1; min-height: 0`

- `height: 100%`：依赖父元素的显式高度，在flex布局中可能无法正确解析
- `flex: 1`：直接参与flex算法分配，获得约束高度
- `min-height: 0`：允许flex子项缩小到小于内容高度，这是overflow生效的关键

### 嵌套flex布局的overflow原则

要让内部滚动容器正常工作，从最外层到滚动容器的每一层flex容器都需要：
1. `overflow: hidden`（非滚动层）或 `overflow: scroll/auto`（滚动层）
2. `min-height: 0`（允许缩小）
3. 不使用 `height: 100%`，改用 `flex: 1`
