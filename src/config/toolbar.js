export const toolbarConfig = [
  {
    icon: '<b>B</b>',
    label: '文字',
    items: [
      { icon: '<b>B</b>', label: '加粗', action: 'bold', shortcut: 'Ctrl+B' },
      { icon: '<i>I</i>', label: '斜体', action: 'italic', shortcut: 'Ctrl+I' },
      { icon: '<s>S</s>', label: '删除线', action: 'strikethrough', shortcut: 'Ctrl+Shift+S' },
      { icon: '<u>U</u>', label: '下划线', action: 'underline', shortcut: 'Ctrl+U' },
      { icon: '<code>`</code>', label: '行内代码', action: 'code', shortcut: 'Ctrl+Shift+`' },
      { separator: true },
      { icon: 'X₂', label: '下标', action: 'subscript' },
      { icon: 'X²', label: '上标', action: 'superscript' },
      { icon: '==H==', label: '高亮', action: 'highlight' }
    ]
  },
  {
    icon: 'H',
    label: '标题',
    items: [
      { icon: 'H1', label: '标题 1', action: 'h1' },
      { icon: 'H2', label: '标题 2', action: 'h2' },
      { icon: 'H3', label: '标题 3', action: 'h3' },
      { icon: 'H4', label: '标题 4', action: 'h4' },
      { icon: 'H5', label: '标题 5', action: 'h5' },
      { icon: 'H6', label: '标题 6', action: 'h6' },
      { separator: true },
      { icon: 'P', label: '正文段落', action: 'paragraph' }
    ]
  },
  {
    icon: '❝',
    label: '段落',
    items: [
      { icon: '❝', label: '引用块', action: 'blockquote' },
      { icon: '—', label: '水平分割线', action: 'hr' },
      { separator: true },
      { icon: '•', label: '无序列表', action: 'ul' },
      { icon: '1.', label: '有序列表', action: 'ol' },
      { icon: '☑', label: '任务列表', action: 'task' },
      { separator: true },
      { icon: '⁽¹⁾', label: '脚注', action: 'footnote' },
      { separator: true },
      { icon: '📝', label: '提示框 (Note)', action: 'admonition-note' },
      { icon: '💡', label: '提示框 (Tip)', action: 'admonition-tip' },
      { icon: '⚠', label: '提示框 (Warning)', action: 'admonition-warning' },
      { icon: '🔴', label: '提示框 (Danger)', action: 'admonition-danger' }
    ]
  },
  {
    icon: '🔗',
    label: '插入',
    items: [
      { icon: '🔗', label: '链接...', action: 'link', shortcut: 'Ctrl+K' },
      { icon: '🖼', label: '本地图片...', action: 'image-local' },
      { icon: '🌐', label: '网络图片...', action: 'image-url' },
      { separator: true },
      { icon: '{ }', label: '代码块', action: 'codeblock' },
      { separator: true },
      { icon: '🔷', label: 'Mermaid 图表', action: 'mermaid' },
      { icon: '🔄', label: '流程图', action: 'flowchart' },
      { icon: '📅', label: '甘特图', action: 'gantt' },
      { icon: '🟢', label: 'PlantUML 图表', action: 'plantuml' }
    ]
  },
  {
    icon: '📊',
    label: '表格',
    items: [
      { icon: '📊', label: '插入表格...', action: 'table' },
      { separator: true },
      { icon: '⬆', label: '上方插入行', action: 'table-add-row-above' },
      { icon: '⬇', label: '下方插入行', action: 'table-add-row-below' },
      { icon: '⬅', label: '左侧插入列', action: 'table-add-col-left' },
      { icon: '➡', label: '右侧插入列', action: 'table-add-col-right' },
      { separator: true },
      { icon: '🗑', label: '删除当前行', action: 'table-delete-row' },
      { icon: '🗑', label: '删除当前列', action: 'table-delete-col' }
    ]
  },
  {
    icon: '∑',
    label: '公式',
    items: [
      { icon: '$', label: '行内公式', action: 'math-inline', shortcut: 'Ctrl+M' },
      { icon: '$$', label: '块级公式', action: 'math-block', shortcut: 'Ctrl+Shift+M' },
      { separator: true },
      { icon: '∑', label: '求和 ∑', action: 'math-sum' },
      { icon: '∫', label: '积分 ∫', action: 'math-integral' },
      { icon: '½', label: '分数', action: 'math-fraction' },
      { icon: '√', label: '根号', action: 'math-sqrt' },
      { icon: 'lim', label: '极限', action: 'math-limit' },
      { icon: '⎈', label: '矩阵', action: 'math-matrix' }
    ]
  },
  {
    icon: '↩',
    label: '操作',
    items: [
      { icon: '↩', label: '撤销', action: 'undo', shortcut: 'Ctrl+Z' },
      { icon: '↪', label: '重做', action: 'redo', shortcut: 'Ctrl+Shift+Z' },
      { separator: true },
      { icon: '👁', label: '切换预览模式', action: 'toggle-preview' }
    ]
  }
]

// 快捷栏配置：直接显示在工具栏右侧的常用操作按钮（无需下拉）
export const quickBarConfig = [
  { icon: '<b>B</b>', label: '加粗', action: 'bold', title: '加粗 (Ctrl+B)' },
  { icon: '<i>I</i>', label: '斜体', action: 'italic', title: '斜体 (Ctrl+I)' },
  { icon: 'H1', label: '标题1', action: 'h1', title: '标题 1' },
  { icon: 'H2', label: '标题2', action: 'h2', title: '标题 2' },
  { icon: '🔗', label: '链接', action: 'link', title: '插入链接 (Ctrl+K)' },
  { icon: '🖼', label: '图片', action: 'image-local', title: '插入本地图片' },
  { icon: '{ }', label: '代码块', action: 'codeblock', title: '代码块' },
  { icon: '📊', label: '表格', action: 'table', title: '插入表格' },
  { icon: '↩', label: '撤销', action: 'undo', title: '撤销 (Ctrl+Z)' },
  { icon: '↪', label: '重做', action: 'redo', title: '重做 (Ctrl+Shift+Z)' }
]
