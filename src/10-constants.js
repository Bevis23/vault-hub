/* -------------------------------------------------------------------------
 *  常量：壁纸 / 预设 / 默认设置 / 打开方式
 *  （本片段由 build.js 拼进 main.js，不要单独 require）
 * ------------------------------------------------------------------------- */
const WALLPAPERS = {
  none: { label: '无', css: 'transparent' },
  starry: { label: '星夜', css: 'linear-gradient(135deg,#20234a,#7f6df2 70%,#c58bf5)' },
  bamboo: { label: '竹林', css: 'linear-gradient(135deg,#12332b,#2fb87a 70%,#a8e6c1)' },
  paper: { label: '纸张', css: 'linear-gradient(135deg,#3a2f22,#c99a5b 70%,#f0d7ac)' },
  ocean: { label: '深海', css: 'linear-gradient(135deg,#1d2a44,#3aa0f0 70%,#9bd2ff)' }
};

const PRESETS = {
  glass: { label: '毛玻璃', blur: 20, dim: 0.25, glass: 0.07 },
  minimal: { label: '极简暗', blur: 6, dim: 0, glass: 0.045 },
  mag: { label: '杂志卡片', blur: 26, dim: 0.38, glass: 0.1 },
  contrast: { label: '高对比', blur: 4, dim: 0.5, glass: 0.13 }
};

const DEFAULT_SETTINGS = {
  appearance: {
    preset: 'glass',
    wallpaper: 'starry',
    customImage: '',
    dim: 0.25,
    blur: 20,
    accent: '#7f6df2',
    density: 'comfy',
    previewPos: 'side',
    showStats: true,
    showMeta: true,
    /* 卡片显示内容摘要（笔记卡前两行），关掉回到轻卡 */
    showSummary: true
  },
  perVaultAppearance: false,
  vaultAppearance: {},
  vaults: {
    hidden: [],
    aliases: {},
    extra: []
  },
  /* 打开行为（三选一，见 OPEN_MODES）：
   *   panel     → 右侧预览模式（默认）：点文件在右侧面板预览，不铺满、不跳标签
   *   workbench → 工作面板模式：点文件在工作台里铺满打开（阅读 / 编辑都在工作台内完成）
   *   native    → 原生编辑模式：点文件在 Obsidian 中新开标签页，用官方编辑器打开
   */
  open: {
    mode: 'panel',
    migrated: false
  },
  view: {
    mode: 'grid',
    sort: 'mtime',
    /* 多选状态下点击一个已选项时做什么：
     *   open     → 打开它并清空选择（Windows 习惯，默认）
     *   deselect → 只取消选中它，保留其余选择 */
    clickSelected: 'open',
    /* 收集箱文件夹名（库根目录下这一层，统计时不递归子文件夹） */
    inbox: 'inbox'
  },
  /* 智能视图：保存的筛选器入口（{name, query, sort, scope, folder}） */
  smartViews: [],
  /* 工作台内编辑器（见 EDITOR_MODES）：
   *   live   → 单画布即时渲染（默认）：正文就是渲染后的样子，点哪改哪
   *   split  → 源码 + 实时渲染双栏，滚动位置同步
   *   source → 纯 Markdown 源码
   */
  editor: {
    mode: 'live',
    syncScroll: true
  },
  ui: {
    railCollapsed: false, // 左侧 obsidian库导航 是否收起
    /* 界面语言：auto = 跟随 Obsidian，也可手动钉成 zh / en */
    lang: 'auto'
  }
};

/* 打开方式：id 存进设置，label 是下拉菜单里的名字，tip 是 hover 说明 */
const OPEN_MODES = [
  {
    id: 'panel',
    label: 'mode.open.panel.label',
    def: true,
    chip: 'mode.open.panel.chip',
    tip: 'mode.open.panel.tip'
  },
  {
    id: 'workbench',
    label: 'mode.open.workbench.label',
    def: false,
    chip: 'mode.open.workbench.chip',
    tip: 'mode.open.workbench.tip'
  },
  {
    id: 'native',
    label: 'mode.open.native.label',
    def: false,
    chip: 'mode.open.native.chip',
    tip: 'mode.open.native.tip'
  }
];
function openModeOf(id) {
  return OPEN_MODES.find((m) => m.id === id) || OPEN_MODES[0];
}

/* 工作台内编辑器的三种书写方式（设置与编辑器顶栏共用） */
const EDITOR_MODES = [
  {
    id: 'live',
    label: 'mode.editor.live.label',
    def: true,
    chip: 'mode.editor.live.chip',
    tip: 'mode.editor.live.tip'
  },
  {
    id: 'split',
    label: 'mode.editor.split.label',
    def: false,
    chip: 'mode.editor.split.chip',
    tip: 'mode.editor.split.tip'
  },
  {
    id: 'source',
    label: 'mode.editor.source.label',
    def: false,
    chip: 'mode.editor.source.chip',
    tip: 'mode.editor.source.tip'
  }
];
function editorModeOf(id) {
  return EDITOR_MODES.find((m) => m.id === id) || EDITOR_MODES[0];
}

/* 编辑器右键菜单 / 顶栏「Aa 格式」下拉共用的命令表
 * hint 就是「快捷键」列里显示的按键，菜单项与快捷键走同一条 applyCmd。 */
const EDITOR_MENU = [
  /* needSelection：只有画布 / 输入框里真的选中了东西才显示这一项；
   * needBlock：只有在某一段上右键（能定位到块）时才显示。 */
  { group: [
    { id: 'copy-sel', label: '复制选中文本', hint: 'Ctrl+C', ico: '⧉', needSelection: true },
    { id: 'copy-block', label: '复制这一段的原文', ico: '¶', needBlock: true },
    { id: 'copy-all', label: '复制整篇 Markdown', ico: '▤' },
    { id: 'select-all', label: '全选', hint: 'Ctrl+A', ico: '▭' }
  ] },
  { group: [
    { id: 'link', label: '新增链接', hint: 'Ctrl+K', ico: '🔗' },
    { id: 'extlink', label: '新增外部链接', ico: '↗' }
  ] },
  { group: [
    { id: 'format', label: '文本格式', ico: '🖌', sub: [
      { id: 'bold', label: '加粗', hint: 'Ctrl+B' },
      { id: 'italic', label: '斜体', hint: 'Ctrl+I' },
      { id: 'underline', label: '下划线', hint: 'Ctrl+U' },
      { id: 'strike', label: '删除线', hint: 'Alt+Shift+5' },
      { id: 'code', label: '行内代码', hint: 'Ctrl+`' },
      { id: 'mark', label: '高亮', hint: 'Ctrl+Shift+H' },
      { id: 'clear', label: '清除样式', hint: 'Ctrl+\\' }
    ] },
    { id: 'para', label: '段落设置', ico: '¶', sub: [
      { id: 'p', label: '正文', hint: 'Ctrl+0' },
      { id: 'h1', label: '一级标题', hint: 'Ctrl+1' },
      { id: 'h2', label: '二级标题', hint: 'Ctrl+2' },
      { id: 'h3', label: '三级标题', hint: 'Ctrl+3' },
      { id: 'h4', label: '四级标题', hint: 'Ctrl+4' },
      { id: 'h5', label: '五级标题', hint: 'Ctrl+5' },
      { id: 'h6', label: '六级标题', hint: 'Ctrl+6' },
      { id: 'hup', label: '提升标题级别', hint: 'Ctrl+=' },
      { id: 'hdn', label: '降低标题级别', hint: 'Ctrl+−' },
      { id: 'quote', label: '引用', hint: 'Ctrl+Shift+Q' },
      { id: 'ul', label: '无序列表', hint: 'Ctrl+Shift+]' },
      { id: 'ol', label: '有序列表', hint: 'Ctrl+Shift+[' },
      { id: 'task', label: '任务列表', hint: 'Ctrl+Shift+X' }
    ] },
    { id: 'insert', label: '插入', ico: '➕', sub: [
      { id: 'table', label: '表格', hint: 'Ctrl+Shift+T' },
      { id: 'hr', label: '水平分割线', hint: 'Ctrl+Shift+−' },
      { id: 'codeblock', label: '代码块', hint: 'Ctrl+Shift+K' },
      { id: 'math', label: '公式块', hint: 'Ctrl+Shift+M' },
      { id: 'toc', label: '内容目录', hint: '[TOC]' },
      { id: 'frontmatter', label: 'YAML Front Matter' },
      { id: 'footnote', label: '脚注' },
      { id: 'date', label: '当前日期' },
      { id: 'image', label: '图片' }
    ] }
  ] },
  { group: [
    { id: 'cut', label: '剪切', hint: 'Ctrl+X', ico: '✂' },
    { id: 'copy', label: '复制', hint: 'Ctrl+C', ico: '⧉' },
    { id: 'paste', label: '粘贴', hint: 'Ctrl+V', ico: '📋' },
    { id: 'paste-plain', label: '以纯文本形式粘贴', hint: 'Ctrl+Shift+V', ico: '📄' },
    { id: 'del-sel', label: '删除选中内容', hint: 'Del', ico: '⌫' }
  ] },
  /* needBlock：只有「能定位到某一段」时才显示（整篇级右键、没在任何一段里时不显示） */
  { group: [
    { id: 'del-block', label: '删除这一段', ico: '🗑', needBlock: true, danger: true }
  ] }
];

/* 阅读态（渲染好的正文）里点右键的菜单。
 * 阅读态没有「输入框」可操作，只有浏览器选区 —— 所以这里只做「读」的事。 */
const READ_MENU = [
  { group: [
    { id: 'copy-sel', label: '复制选中文本', hint: 'Ctrl+C', ico: '⧉', needSelection: true }
  ] },
  { group: [
    { id: 'select-all-doc', label: '全选正文', hint: 'Ctrl+A', ico: '▭' },
    { id: 'copy-all', label: '复制整篇 Markdown', ico: '▤' },
    { id: 'copy-path', label: '复制文件路径', ico: '📁' }
  ] }
];

/* 工具条「＋ 新建」下拉：建文件 / 建文件夹。默认都落在当前所在目录。 */
const NEW_MENU = [
  { id: 'new-file', label: '新建文件', ico: '📄', tip: 'editorMenu.new-file.tip' },
  { id: 'new-folder', label: '新建文件夹', ico: '📁', tip: 'editorMenu.new-folder.tip' }
];

/* 快捷键速查表（设置页「使用说明 / 编辑器」与编辑器提示共用） */
const SHORTCUTS = {
  editor: [
    ['Ctrl + B', 'sc.editor.1'],
    ['Ctrl + I', 'sc.editor.2'],
    ['Ctrl + U', 'sc.editor.3'],
    ['Ctrl + `', 'sc.editor.4'],
    ['Alt + Shift + 5', 'sc.editor.5'],
    ['Ctrl + Shift + H', 'sc.editor.6'],
    ['Ctrl + K', 'sc.editor.7'],
    ['Ctrl + \\', 'sc.editor.8'],
    ['Ctrl + S', 'sc.editor.9'],
    ['Tab', 'sc.editor.10'],
    ['Esc', 'sc.editor.11']
  ],
  para: [
    ['Ctrl + 1 ~ 6', 'sc.para.1'],
    ['Ctrl + 0', 'sc.para.2'],
    ['Ctrl + = / −', 'sc.para.3'],
    ['Ctrl + Shift + Q', 'sc.para.4'],
    ['Ctrl + Shift + [', 'sc.para.5'],
    ['Ctrl + Shift + ]', 'sc.para.6'],
    ['Ctrl + Shift + X', 'sc.para.7'],
    ['Ctrl + Shift + K', 'sc.para.8'],
    ['Ctrl + Shift + M', 'sc.para.9'],
    ['Ctrl + Shift + T', 'sc.para.10']
  ],
  nav: [
    ['Alt + ←', 'sc.nav.1'],
    ['Alt + →', 'sc.nav.2'],
    ['Alt + ↑', 'sc.nav.3'],
    ['Backspace', 'sc.nav.4'],
    ['Esc', 'sc.nav.5']
  ],
  files: [
    ['点文件 / 文件夹', 'sc.files.1'],
    ['Ctrl / ⌘ + 点', 'sc.files.2'],
    ['Shift + 点', 'sc.files.3'],
    ['点空白处', 'sc.files.4'],
    ['多选后', 'sc.files.5'],
    ['右键任意一项', 'sc.files.6']
  ],
  read: [
    ['鼠标拖选', 'sc.read.1'],
    ['Ctrl + A', 'sc.read.2'],
    ['在正文里点右键', 'sc.read.3']
  ],
  canvas: [
    ['点任意一段', 'sc.canvas.1'],
    ['鼠标拖选', 'sc.canvas.2'],
    ['↑ / ↓', 'sc.canvas.3'],
    ['Enter', 'sc.canvas.4'],
    ['Shift + Enter', 'sc.canvas.5'],
    ['Enter（列表 / 引用）', 'sc.canvas.6'],
    ['Enter（代码块 / 表格 / Front Matter）', 'sc.canvas.7'],
    ['Del', 'sc.canvas.8'],
    ['Backspace', 'sc.canvas.9'],
    ['点画布空白', 'sc.canvas.10'],
    ['点右键 / Aa 格式', 'sc.canvas.11'],
    ['Esc', 'sc.canvas.12']
  ]
};
