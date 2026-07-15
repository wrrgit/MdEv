export const toolbarConfig = [
  {
    icon: '<b>B</b>',
    label: '文字',
    items: [
      { icon: '<b>B</b>', label: '加粗', action: 'bold', shortcut: 'Ctrl+B' },
      { icon: '<i>I</i>', label: '斜体', action: 'italic', shortcut: 'Ctrl+I' },
      { icon: '<s>S</s>', label: '删除线', action: 'strikethrough', shortcut: 'Ctrl+Shift+S' },
      { icon: '<u>U</u>', label: '下划线', action: 'underline', shortcut: 'Ctrl+U' },
      { icon: '<code>`</code>', label: '行内代码', action: 'code', shortcut: 'Ctrl+Shift+`' }
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
      { icon: 'P', label: '正文段落', action: 'paragraph' }
    ]
  },
  {
    icon: '❝',
    label: '段落',
    items: [
      { icon: '❝', label: '引用块', action: 'blockquote' },
      { icon: '—', label: '水平分割线', action: 'hr' },
      { icon: '•', label: '无序列表', action: 'ul' },
      { icon: '1.', label: '有序列表', action: 'ol' },
      { icon: '☑', label: '任务列表', action: 'task' }
    ]
  },
  {
    icon: '🔗',
    label: '插入',
    items: [
      { icon: '🔗', label: '链接', action: 'link', shortcut: 'Ctrl+K' },
      { icon: '🖼', label: '图片', action: 'image' },
      { icon: '📊', label: '表格', action: 'table' },
      { icon: '{ }', label: '代码块', action: 'codeblock' },
      { icon: '∑', label: '数学公式', action: 'math' },
      { icon: '🔷', label: 'Mermaid 图表', action: 'mermaid' }
    ]
  },
  {
    icon: '↩',
    label: '操作',
    items: [
      { icon: '↩', label: '撤销', action: 'undo', shortcut: 'Ctrl+Z' },
      { icon: '↪', label: '重做', action: 'redo', shortcut: 'Ctrl+Shift+Z' },
      { icon: '👁', label: '切换预览模式', action: 'toggle-preview' }
    ]
  }
]
