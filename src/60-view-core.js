/* -------------------------------------------------------------------------
 *  工作台视图 · 核心：生命周期 / 布局 / 键盘
 *  （本片段由 build.js 拼进 main.js，不要单独 require）
 * ------------------------------------------------------------------------- */
class WorkbenchView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.selectedVault = null;
    this.folderPath = '';
    this.mode = plugin.settings.view.mode || 'grid';
    this.sort = plugin.settings.view.sort || 'mtime';
    this.query = '';
    this.searchScope = 'current';    // current = 只搜当前库；all = 跨库全文搜索
    this.crossHits = null;           // 上一次跨库搜索的结果（渲染用，避免重复建索引）
    this.tagsRequested = false;
    this.selectedNote = null;
    this.drawerOpen = false;
    this.drawerPage = 'appearance';   // 设置面板当前子页
    this.openMenuOpen = false;        // 「打开方式切换」下拉是否展开
    this.hist = [];                   // 目录历史（前进 / 后退）
    this.histIdx = -1;
    this.expandedFolders = new Set(); // 列表模式下就地展开的文件夹（点 ▸ 看里面有什么）
    this.multiSel = new Map();        // 文件区多选（key → {kind, item}），批量操作靠它
    this.selAnchor = -1;              // Shift 连选的起点（在 flatOrder 里的下标）
    this.batchDelArm = false;         // 批量删除的二次确认是否已按下
    this.tagFilter = [];              // 仪表盘：已选标签（AND 交集筛选）
    this.weekOnly = false;            // 仪表盘：只看近 7 天修改的
    this.tagPanelOpen = false;        // 仪表盘：文件区是否换成标签列表面板
    this.tagQuery = '';               // 标签面板里的过滤词
    this.dashCache = null;            // 仪表盘数字缓存（库+文件数+最大 mtime 为 key）
    this.moveEl = null;               // 「移动到…」浮层
    this.newMenuOpen = false;         // 工具条「＋ 新建」下拉是否展开
    this.customFileName = '';
    this.prevKind = 'markdown'; // 当前预览的文件类型
    this.imgZoom = 'fit';       // 图片预览：fit（适应） / actual（实际大小）
    this.prevMax = false;       // 预览面板是否铺满整个内容区
    this.outlineOpen = false;   // 大纲抽屉
    this.docHeadings = [];      // 当前文档的标题列表（供大纲跳转）
    this.docMode = 'read';      // 文档模式：read（渲染阅读） / edit（工作台内编辑）
    this.docDirty = false;      // 编辑器里有未保存内容
    this.saveTimer = null;
    this.liveTimer = null;
    this.blocks = [];           // 单画布：解析出来的 Markdown 块
    this.blockEls = [];         // 与 blocks 同索引的 DOM
    this.editingBlock = null;   // 正在就地编辑的块索引
    this.blockTa = null;        // 该块的 textarea
    this.canvasEl = null;       // 单画布容器
    this.liveEl = null;         // 双栏模式的实时渲染栏
    this.ctxEl = null;          // 右键菜单
    this.commitBusy = null;     // 正在进行的「提交这一段」
    this.canvasBusy = null;     // 正在进行的单画布重绘
  }

  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return tr('misc.viewTitle'); }
  getIcon() { return 'layout-grid'; }

  async onOpen() {
    const vaults = this.plugin.discoverVaults();
    const cur = vaults.find((v) => v.current) || vaults[0];
    this.selectedVault = cur ? cur.id : null;
    this.resetHist();
    this.buildLayout();
    this.registerDomEvent(document, 'keydown', (e) => this.onKeyDown(e));
    // 点空白处收起「打开方式切换」下拉
    this.registerDomEvent(document, 'click', (e) => this.onDocClick(e));
    // 窗口大小变了，开着的「＋ 新建」下拉要重新贴一次边（它是按主区宽度算位置的）
    this.registerDomEvent(window, 'resize', () => { if (this.newMenuOpen) this.placeNewMenu(); });
  }

  async onClose() {
    try { await this.flushDocSave(); } catch (e) { /* 关闭时尽力保存 */ }
  }

  /* 键盘：Esc 逐层退出；Alt+← / Alt+→ 目录前进后退；Alt+↑ 上一级 */
  onKeyDown(e) {
    // ⚠ 变量名不能叫 t —— 会遮蔽 i18n 的全局 tr()，这个函数里要取文案
    const tgt = e.target;
    const typing = !!(tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable));

    if (e.key === 'Escape') {
      if (typing) return;
      if (this.ctxEl) { this.closeEditorMenu(); return; }
      if (this.moveEl) { this.closeMovePicker(); return; }
      if (this.newMenuOpen) { this.newMenuOpen = false; this.renderNewMenu(); this.render(); return; }
      if (this.openMenuOpen) { this.openMenuOpen = false; this.render(); return; }
      if (this.multiSel && this.multiSel.size) { this.clearMulti(); return; }
      if (this.drawerOpen) { this.toggleDrawer(false); return; }
      if (this.outlineOpen) { this.toggleOutline(false); return; }
      if (this.prevMax) { this.togglePreviewMax(false); return; }
      if (this.selectedNote) this.closePreview();
      return;
    }
    if (typing) return;

    // 编辑态：焦点不在任何输入框时（例如单画布刚进来），Ctrl+S 也要能保存
    if (this.docMode === 'edit' && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey &&
      String(e.key).toLowerCase() === 's') {
      if (e.preventDefault) e.preventDefault();
      this.flushDocSave();
      new Notice(tr('misc.saved'));
      return;
    }

    // 目录前进 / 后退（Alt+← / Alt+→，Ctrl+Alt+← / → 亦可）
    if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      if (e.preventDefault) e.preventDefault();
      if (e.stopPropagation) e.stopPropagation();
      if (e.key === 'ArrowLeft') this.goBack(); else this.goFwd();
      return;
    }
    // 上一级
    if (e.altKey && e.key === 'ArrowUp') {
      if (e.preventDefault) e.preventDefault();
      if (e.stopPropagation) e.stopPropagation();
      this.goUp();
      return;
    }
    // 文件列表里按退格 = 上一级（输入框里不会走到这里）
    if (e.key === 'Backspace' && this.folderPath && !this.query) {
      if (e.preventDefault) e.preventDefault();
      this.goUp();
    }
  }

  /* 点空白处：收起下拉菜单 / 右键菜单 / 移动浮层 */
  onDocClick(e) {
    let dirty = false;
    const t = e && e.target;
    const within = (sel) => !!(t && typeof t.closest === 'function' && t.closest(sel));
    if (this.ctxEl) {
      if (!within('.vwb-ctx')) { this.closeEditorMenu(); dirty = true; }
    }
    if (this.moveEl) {
      if (!within('.vwb-move')) this.closeMovePicker();
    }
    if (this.newMenuOpen) {
      if (!within('.vwb-newmenu')) {
        this.newMenuOpen = false;
        this.renderNewMenu();
      }
    }
    if (this.openMenuOpen) {
      if (!within('.vwb-menu')) {
        this.openMenuOpen = false;
        this.render();
      }
    } else if (dirty) {
      // 右键菜单本来浮在预览面板上，关掉不需要重绘列表
    }
  }

  buildLayout() {
    const root = this.contentEl;
    root.empty();
    root.addClass('vwb-root');
    // 让 Obsidian 的 view-content 变成有确定高度的弹性列，避免内容把视图撑出屏幕
    if (root.parentElement) root.parentElement.addClass('vwb-host');

    this.bgEl = root.createDiv({ cls: 'vwb-bg' });

    // 左：库导航
    this.railEl = root.createDiv({ cls: 'vwb-rail vwb-layer' });
    this.renderRail();

    // 主区
    this.mainEl = root.createDiv({ cls: 'vwb-main vwb-layer' });

    const top = this.mainEl.createDiv({ cls: 'vwb-topbar' });
    const search = top.createDiv({ cls: 'vwb-search' });
    this.searchEl = search.createEl('input', { type: 'text', placeholder: tr('ui.5') });
    this.searchClearEl = search.createDiv({ cls: 'vwb-search-x', text: '✕' });
    this.searchClearEl.addEventListener('click', () => this.clearSearch(true));
    this.searchEl.addEventListener('keydown', (e) => {
      // 打字时不让 Obsidian 全局快捷键抢走按键
      e.stopPropagation();
      if (e.key === 'Escape') this.clearSearch(true);
    });
    // 跨库搜索要建索引，比只搜文件名重一点，所以防抖放宽到 320ms
    this.searchEl.addEventListener('input', debounce(() => {
      this.query = this.searchEl.value.trim();
      this.folderPath = '';
      this.syncSearchUI();
      this.render();
    }, 320));
    // 「＋ 新建」：下拉二选一 —— 新建文件（默认就在工作台里编辑）/ 新建文件夹
    const nWrap = top.createDiv({ cls: 'vwb-menu vwb-newmenu' });
    this.newMenuWrapEl = nWrap;
    const nBtn = nWrap.createDiv({ cls: 'vwb-btn vwb-btn-pri vwb-menu-btn', text: tr('bar.new') });
    this.newBtnEl = nBtn;   // 切语言后要同步按钮文案（见 applyStaticLang）
    nBtn.setAttribute('title', tr('bar.new.tip'));
    nBtn.addEventListener('click', (e) => {
      if (e && e.stopPropagation) e.stopPropagation();
      this.newMenuOpen = !this.newMenuOpen;
      this.openMenuOpen = false;
      this.renderNewMenu();
      this.render();
    });
    this.newMenuPopEl = nWrap.createDiv({ cls: 'vwb-menu-pop vwb-newmenu-pop vwb-glass' });
    this.renderNewMenu();
    const rfBtn = top.createEl('button', { cls: 'vwb-btn', text: tr('ui.117') });
    this.refreshBtnEl = rfBtn;   // 切语言后要同步按钮文案
    rfBtn.addEventListener('click', () => {
      this.plugin.externalCache = {};
      this.render();
      new Notice(tr('misc.refreshed'));
    });

    // 内容行：文件区 + 预览面板并排，两边各自滚动（互不挤压、不会溢出屏幕）
    this.contentRowEl = this.mainEl.createDiv({ cls: 'vwb-content' });

    this.bodyEl = this.contentRowEl.createDiv({ cls: 'vwb-body' });
    this.statsEl = this.bodyEl.createDiv({ cls: 'vwb-stats' });
    this.barEl = this.bodyEl.createDiv({ cls: 'vwb-bar' });
    this.areaEl = this.bodyEl.createDiv({ cls: 'vwb-area' });
    this.hintEl = this.bodyEl.createDiv({ cls: 'vwb-hint' });

    // 预览面板
    this.prevEl = this.contentRowEl.createDiv({ cls: 'vwb-prev vwb-glass' });
    const ph = this.prevEl.createDiv({ cls: 'vwb-prev-head' });
    const pht = ph.createDiv({ cls: 'vwb-prev-hd-txt' });
    this.prevTitleEl = pht.createDiv({ cls: 'vwb-prev-t' });
    // 点文件名直接重命名（Windows 习惯：标题就是入口）
    this.prevTitleEl.setAttribute('title', tr('editor.rename'));
    this.prevTitleEl.addEventListener('click', () => {
      const n = this.selectedNote;
      if (!n || !n.relPath) return;
      this.renameVaultItem(n.relPath, false);
    });
    this.prevMetaEl = pht.createDiv({ cls: 'vwb-prev-m' });
    const pTools = ph.createDiv({ cls: 'vwb-prev-tools' });
    // 阅读 / 编辑 切换（工作台内直接改，不跳标签）
    this.docModeEl = pTools.createDiv({ cls: 'vwb-prev-x vwb-docmode', text: tr('preview.edit') });
    this.docModeEl.setAttribute('aria-label', tr('preview.editTip'));
    this.docModeEl.addEventListener('click', () => this.setDocMode());
    this.outlineBtn = pTools.createDiv({ cls: 'vwb-prev-x', text: '☰' });
    this.outlineBtn.setAttribute('aria-label', tr('preview.outlineTip'));
    this.outlineBtn.addEventListener('click', () => this.toggleOutline());
    this.maxBtn = pTools.createDiv({ cls: 'vwb-prev-x', text: '⤢' });
    this.maxBtn.setAttribute('aria-label', tr('ui.170'));
    this.maxBtn.addEventListener('click', () => this.togglePreviewMax());
    const pClose = pTools.createDiv({ cls: 'vwb-prev-x vwb-prev-close', text: '✕' });
    pClose.setAttribute('aria-label', tr('preview.closeTip'));
    pClose.addEventListener('click', () => this.closePreview());
    this.prevMainEl = this.prevEl.createDiv({ cls: 'vwb-prev-main' });
    this.prevBodyEl = this.prevMainEl.createDiv({ cls: 'vwb-prev-body vwb-doc' });
    // 大纲抽屉（点标题可跳转）—— 与正文并排，不遮挡头部按钮
    this.outlineEl = this.prevMainEl.createDiv({ cls: 'vwb-outline vwb-glass' });
    this.prevFootEl = this.prevEl.createDiv({ cls: 'vwb-prev-foot' });

    // 外观设置抽屉（覆盖在视图右侧，替代原来的「跳去 Obsidian 原生设置」）
    this.drawerEl = root.createDiv({ cls: 'vwb-drawer vwb-glass' });

    this.syncSearchUI();
    this.render();
    this.renderDrawer();
  }

  /* ------------------------------------------------- 切语言后的静态文案同步
   * buildLayout() 只在视图打开时跑一次，顶栏（搜索占位 / ＋新建 / 刷新）、
   * 预览头按钮的提示文案、标签页标题都是那时写死的；
   * render() 只重画文件区和工具条，不碰这些 —— 所以切语言后要在这里补一遍。 */
  applyStaticLang() {
    if (this.searchEl) this.searchEl.placeholder = tr('ui.5');
    if (this.newBtnEl) {
      this.newBtnEl.setText(tr('bar.new'));
      this.newBtnEl.setAttribute('title', tr('bar.new.tip'));
    }
    if (this.refreshBtnEl) this.refreshBtnEl.setText(tr('ui.117'));
    if (this.prevTitleEl) this.prevTitleEl.setAttribute('title', tr('editor.rename'));
    if (this.docModeEl) {
      this.docModeEl.setText(this.docMode === 'edit' ? tr('editor.read') : tr('editor.edit'));
      this.docModeEl.setAttribute('aria-label', tr('preview.editTip'));
    }
    if (this.outlineBtn) this.outlineBtn.setAttribute('aria-label', tr('preview.outlineTip'));
    if (this.maxBtn) this.maxBtn.setAttribute('aria-label', tr('ui.170'));
    // 标签页标题：Obsidian 缓存了 getDisplayText() 的结果，切语言不会自动重取，
    // 直接改 tab 头的标题元素（非公开属性，try/catch 兜底旧版）
    try {
      const t = this.leaf && this.leaf.tabHeaderInnerTitleEl;
      if (t && typeof t.setText === 'function') t.setText(tr('misc.viewTitle'));
    } catch (e) { /* 旧版 API 没有就跳过，重开视图后自然正确 */ }
  }

  /* Esc / 抽屉开关 */
  toggleDrawer(force) {
    this.drawerOpen = typeof force === 'boolean' ? force : !this.drawerOpen;
    this.renderDrawer();
    this.renderRail();
  }

  /* ------------------------------------------------------ 外观（含每库独立） */
}
