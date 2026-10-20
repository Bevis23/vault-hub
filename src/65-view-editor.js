/* -------------------------------------------------------------------------
 *  工作台视图 · 工作台内编辑器 — 块解析 + 头部权限 + 读写方式 + 编辑器搭建 + 单画布核心
 *    live   → 单画布即时渲染（默认，Typora 手感：点哪改哪，改完即渲染）
 *    split  → 源码 + 实时渲染双栏（滚动同步）
 *    source → 纯源码
 *  textarea.vwb-editor 始终是「源码真源」，保存链路只有一条；
 *  单画布只是它的一层可视化编辑层。
 *  （本片段由 build.js 拼进 main.js，不要单独 require）
 * ------------------------------------------------------------------------- */

/* ---------------------------------------------------------------------------
 * 把 Markdown 源码切成「块」。
 * 每个块记录自己的原始行区间 raw，块与块首尾相接 ——
 * blocks.map(b => b.raw).join('\n') 能 100% 还原原文，所以整篇改写不会丢格式。
 * ------------------------------------------------------------------------- */
function parseBlocks(src) {
  const lines = String(src == null ? '' : src).split('\n');
  const blocks = [];
  const isBlank = (l) => /^\s*$/.test(l);
  const isFence = (l) => /^\s{0,3}(```|~~~)/.test(l);
  const isHeading = (l) => /^\s{0,3}#{1,6}\s/.test(l);
  const isHr = (l) => /^\s{0,3}(?:(?:-\s*){3,}|(?:\*\s*){3,}|(?:_\s*){3,})$/.test(l);
  const isQuote = (l) => /^\s{0,3}>/.test(l);
  const isList = (l) => /^\s{0,3}(?:[-*+]|\d+[.)])\s/.test(l);
  const isTableRow = (l) => /^\s*\|/.test(l);
  const isTableSep = (l) => /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(l) && l.indexOf('-') >= 0;
  const isIndented = (l) => /^(?:\t| {2,})\S/.test(l);
  const push = (type, j, extra) => {
    blocks.push(Object.assign({ type, raw: lines.slice(j[0], j[1]).join('\n'), start: j[0], end: j[1] }, extra || {}));
  };

  let i = 0;
  // 首行是 --- / +++ 时当成 frontmatter 整块保留
  if (lines.length && /^(---|\+\+\+)\s*$/.test(lines[0])) {
    let j = 1;
    while (j < lines.length && !/^(---|\+\+\+)\s*$/.test(lines[j])) j++;
    j = Math.min(j + 1, lines.length);
    push('frontmatter', [0, j]);
    i = j;
  }

  while (i < lines.length) {
    const line = lines[i];

    if (isBlank(line)) {
      let j = i;
      while (j < lines.length && isBlank(lines[j])) j++;
      push('blank', [i, j]);
      i = j;
      continue;
    }
    if (isFence(line)) {
      const mark = line.trim().slice(0, 3);
      let j = i + 1;
      while (j < lines.length && !new RegExp('^\\s*' + mark).test(lines[j])) j++;
      j = Math.min(j + 1, lines.length);
      push('code', [i, j]);
      i = j;
      continue;
    }
    if (isHeading(line)) {
      const m = line.match(/^\s{0,3}(#{1,6})\s/);
      push('heading', [i, i + 1], { level: m ? m[1].length : 1 });
      i += 1;
      continue;
    }
    if (isTableRow(line) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      let j = i + 2;
      while (j < lines.length && isTableRow(lines[j]) && !isBlank(lines[j])) j++;
      push('table', [i, j]);
      i = j;
      continue;
    }
    if (isHr(line)) {
      push('hr', [i, i + 1]);
      i += 1;
      continue;
    }
    if (isQuote(line)) {
      let j = i + 1;
      while (j < lines.length && (isQuote(lines[j]) || isIndented(lines[j]))) j++;
      push('quote', [i, j]);
      i = j;
      continue;
    }
    if (isList(line)) {
      let j = i + 1;
      while (j < lines.length) {
        if (isList(lines[j]) || isIndented(lines[j])) { j++; continue; }
        if (isBlank(lines[j]) && j + 1 < lines.length && (isList(lines[j + 1]) || isIndented(lines[j + 1]))) { j++; continue; }
        break;
      }
      push('list', [i, j]);
      i = j;
      continue;
    }
    // 普通段落：吃到空行或下一个块级语法起始
    let j = i + 1;
    while (j < lines.length) {
      const l = lines[j];
      if (isBlank(l) || isFence(l) || isHeading(l) || isHr(l) || isQuote(l) || isList(l)) break;
      if (isTableRow(l) && j + 1 < lines.length && isTableSep(lines[j + 1])) break;
      j++;
    }
    push('paragraph', [i, j]);
    i = j;
  }
  return blocks;
}

/* 从标题源码里取纯文本（给大纲用） */
function headingText(raw) {
  return String(raw == null ? '' : raw)
    .replace(/^\s*#{1,6}\s*/, '')
    .replace(/\s*#*\s*$/, '')
    .replace(/[*_`\[\]]/g, '')
    .trim();
}

/* 这几条命令作用在「浏览器选区 / 当前文件」上，阅读态没有输入框也能用 */
const READONLY_CMDS = new Set(['copy-sel', 'copy-all', 'select-all-doc', 'copy-path']);

Object.assign(WorkbenchView.prototype, {
  /* ------------------------------------------------- 头部按钮可见性 / 权限 */
  syncDocTools() {
    if (!this.docModeEl) return;
    const editable = this.canEdit(this.selectedNote);
    this.docModeEl.style.display = editable ? '' : 'none';
    this.docModeEl.setText(this.docMode === 'edit' ? tr('editor.read') : tr('editor.edit'));
    if (this.docModeEl.classList && this.docModeEl.classList.toggle) {
      this.docModeEl.classList.toggle('is-on', this.docMode === 'edit');
    }
    // 大纲：markdown 文件在「阅读」和「编辑」两种模式下都能用
    if (this.outlineBtn) {
      const ok = this.prevKind === 'markdown' && (this.docMode === 'read' || this.docMode === 'edit');
      this.outlineBtn.style.display = ok ? '' : 'none';
    }
  },

  canEdit(note) {
    if (!note) return false;
    const k = fileKind(note.ext);
    if (k !== 'markdown' && k !== 'text') return false;
    return note.external ? !!note.absPath : !!note.file;
  },

  /* ------------------------------------------------------- 读写方式（三选一） */
  editorMode() {
    const e = this.plugin.settings.editor || {};
    return editorModeOf(e.mode).id;
  },

  setEditorMode(m) {
    if (!this.plugin.settings.editor) this.plugin.settings.editor = { mode: 'live', syncScroll: true };
    this.plugin.settings.editor.mode = editorModeOf(m).id;
    this.plugin.saveSettings();
    if (this.docMode === 'edit') {
      this.buildEditor(this.selectedNote);
    }
  },

  /* 在阅读态和编辑态之间切换（不离开工作台） */
  setDocMode(mode) {
    const note = this.selectedNote;
    const next = mode || (this.docMode === 'edit' ? 'read' : 'edit');
    if (next === 'edit' && !this.canEdit(note)) {
      new Notice(tr('editor.notEditable'));
      return;
    }
    if (this.docMode === 'edit' && next === 'read') {
      // 源码真源已经在 input 时同步，这里只做收尾清理
      this.dropEmptyPending();
      this.flushDocSave();
      if (this.liveTimer) { clearTimeout(this.liveTimer); this.liveTimer = null; }
      this.closeEditorMenu();
      this.disposeCanvas();
      this.editorEl = null;
      this.liveEl = null;
      this.canvasEl = null;
    }
    this.docMode = next;
    if (next === 'edit') {
      // 编辑态需要横向空间，窄面板先铺满
      if (!this.prevMax) this.togglePreviewMax(true);
      this.toggleOutline(false);
    }
    this.syncDocTools();
    this.syncDocStatus();
    this.buildPreviewFoot(note); // 底栏按钮随阅读/编辑态变
    this.renderDocBody();
  },

  async renderDocBody() {
    const note = this.selectedNote;
    if (!note) return;
    if (this.docMode === 'edit' && this.canEdit(note)) {
      this.prevBodyEl.className = 'vwb-prev-body vwb-doc is-editing';
      return this.buildEditor(note);
    }
    this.prevBodyEl.className = 'vwb-prev-body vwb-doc';
    // 阅读态正文也能右键复制（拖选 → 右键 → 复制选中文本）
    this.bindReadMenu();
    return this.renderPreviewBody(note);
  },

  /* ------------------------------------------------------------- 编辑器搭建 */
  async buildEditor(note) {
    const body = this.prevBodyEl;
    body.empty();
    // 阅读态时 body 是可滚动容器，滚到正文末尾再点「编辑」会把这个滚动位置带过来，
    // 看起来就像「一进编辑就定位到最底部」——先显式归零。
    try { body.scrollTop = 0; } catch (e) { /* 忽略 */ }
    if (this.prevMainEl) { try { this.prevMainEl.scrollTop = 0; } catch (e) { /* 忽略 */ } }
    let text = '';
    try {
      text = note.external
        ? fs.readFileSync(note.absPath, 'utf8')
        : await this.plugin.app.vault.read(note.file);
    } catch (e) {
      body.createDiv({ cls: 'vwb-empty', text: tr('ui.138') + (e && e.message ? e.message : e) });
      return;
    }

    const mode = this.editorMode();
    this.editingBlock = null;
    this.blockTa = null;
    this.blocks = [];
    this.blockEls = [];
    this.canvasEl = null;
    this.liveEl = null;
    this.pendingRollback = null;

    const wrap = body.createDiv({ cls: 'vwb-edit' });
    wrap.setAttribute('data-mode', mode);
    this.editWrapEl = wrap;

    /* 顶栏：书写方式三选一 + 格式菜单 + 提示 */
    const bar = wrap.createDiv({ cls: 'vwb-edit-bar' });
    bar.createDiv({ cls: 'vwb-edit-t', text: tr('ui.139') });
    const chips = bar.createDiv({ cls: 'vwb-chips' });
    for (const m of EDITOR_MODES) {
      const c = chips.createDiv({ cls: 'vwb-chip' + (m.id === mode ? ' is-on' : ''), text: tr(m.chip) });
      c.setAttribute('title', tr(m.label) + '：' + tr(m.tip));
      c.addEventListener('click', () => this.setEditorMode(m.id));
    }
    const fmtBtn = bar.createEl('button', { cls: 'vwb-btn vwb-btn-sm vwb-fmt-btn', text: tr('ui.140') });
    fmtBtn.setAttribute('title', tr('ui.141'));
    // 点按钮不能让正在编辑的那一段失焦：一失焦就提交重绘，菜单命令会落到已经被换掉的输入框上
    fmtBtn.addEventListener('mousedown', (e) => {
      if (e.preventDefault) e.preventDefault();
    });
    fmtBtn.addEventListener('click', (e) => {
      if (e.stopPropagation) e.stopPropagation();
      let x = 20, y = 40;
      try {
        if (fmtBtn.getBoundingClientRect) {
          const r = fmtBtn.getBoundingClientRect();
          x = r.left; y = r.bottom;
        }
      } catch (err) { /* 用兜底坐标 */ }
      // 正在改某一段时，菜单就当作用在这一段上（和右键点它一样）
      this.showEditorMenu({ clientX: x, clientY: y }, null, this.editingBlock == null ? null : this.editingBlock);
    });
    bar.createDiv({
      cls: 'vwb-edit-hint',
      text: mode === 'live'
        ? tr('ui.142')
        : (mode === 'split' ? tr('ui.143') : tr('ui.144'))
    });

    /* 正文区：三种模式共用一行容器（split 是双栏，live/source 是单栏） */
    const main = wrap.createDiv({ cls: 'vwb-edit-main' });

    /* 源码真源：始终存在，保存链路只认它 */
    const ta = main.createEl('textarea', { cls: 'vwb-editor' });
    ta.value = text;
    this.editorEl = ta;
    ta.addEventListener('input', () => this.onSourceInput(ta));
    ta.addEventListener('keydown', (e) => this.onEditorKey(e, ta, false));
    ta.addEventListener('contextmenu', (e) => {
      if (e.preventDefault) e.preventDefault();
      this.showEditorMenu(e, ta);
    });

    if (mode === 'split') {
      this.liveEl = main.createDiv({ cls: 'vwb-live' });
      if (this.plugin.settings.editor.syncScroll !== false) this.bindScrollSync();
      // 首帧必须自己渲染一次：以前只绑了滚动同步、没渲染，
      // 结果右栏一直是空的（看起来就像「双栏只有一栏」）。
      await this.renderLivePreview();
    } else if (mode === 'live') {
      this.canvasEl = main.createDiv({ cls: 'vwb-canvas' });
      // 点画布空白 = 在文末新建一段（Typora 里点正文下方空白也是这个行为）
      this.canvasEl.addEventListener('click', (e) => {
        const t = e && e.target;
        if (t && t !== this.canvasEl) return;
        if (this.hasDomSelection()) return; // 刚拖选完正文，别顺手新建一段
        this.appendBlockAtEnd();
      });
      // 在正文空白处右键 = 对整篇操作（落点由 menuTarget 决定：放到文末）
      this.canvasEl.addEventListener('contextmenu', (e) => {
        const t = e && e.target;
        if (t && t !== this.canvasEl) return;
        if (e.preventDefault) e.preventDefault();
        this.showEditorMenu(e, null);
      });
      await this.renderCanvas();
    } else {
      // 纯源码模式：大纲直接由源码行号推算，点标题能把光标送过去
      this.syncSourceHeadings(text);
    }

    this.syncDocStatus();
    this.resetEditorCaret(ta);
    if (this.outlineOpen) this.renderOutline();
  },

  /* 纯源码 / 双栏模式下的大纲：先按行号记住位置 */
  syncSourceHeadings(text) {
    const list = [];
    for (const b of parseBlocks(text)) {
      if (b.type !== 'heading') continue;
      list.push({ level: b.level || 1, text: headingText(b.raw), el: null, line: b.start });
    }
    this.docHeadings = list;
  },

  /* 没有对应 DOM 时（纯源码 / 双栏），按「第几行」把光标和滚动送过去 */
  jumpToHeading(h) {
    const ta = this.editorEl;
    if (!h || h.line == null || !ta) return;
    const lines = String(ta.value == null ? '' : ta.value).split('\n');
    let off = 0;
    for (let i = 0; i < h.line && i < lines.length; i++) off += lines[i].length + 1;
    try { ta.setSelectionRange(off, off); } catch (e) { /* 忽略 */ }
    try { if (typeof ta.focus === 'function') ta.focus({ preventScroll: true }); } catch (e) { /* 忽略 */ }
    const total = lines.length || 1;
    try { ta.scrollTop = Math.round((h.line / total) * (ta.scrollHeight || 0)); } catch (e) { /* 忽略 */ }
    if (this.liveEl) {
      try { this.liveEl.scrollTop = Math.round((h.line / total) * (this.liveEl.scrollHeight || 0)); } catch (e) { /* 忽略 */ }
    }
  },

  /* 进入编辑不要「定位到文末」：显式把光标和滚动都拉回开头 */
  resetEditorCaret(ta) {
    if (!ta) return;
    try {
      if (typeof ta.focus === 'function') {
        try { ta.focus({ preventScroll: true }); } catch (e) { ta.focus(); }
      }
    } catch (e) { /* 忽略 */ }
    try { if (ta.setSelectionRange) ta.setSelectionRange(0, 0); } catch (e) { /* 忽略 */ }
    try { ta.scrollTop = 0; } catch (e) { /* 忽略 */ }
    if (this.canvasEl) { try { this.canvasEl.scrollTop = 0; } catch (e) { /* 忽略 */ } }
  },

  /* ------------------------------------------- 单画布（即时渲染）核心 */
  /* 卸载单画布上所有块渲染时注册的子组件（离开编辑态 / 整篇重绘前调用） */
  disposeCanvas() {
    for (const holder of this.blockEls || []) {
      if (!holder) continue;
      if (holder._vwbChild && typeof holder._vwbChild.unload === 'function') {
        try { holder._vwbChild.unload(); } catch (e) { /* 忽略 */ }
      }
      holder._vwbChild = null;
    }
    this.blockEls = [];
    this.blocks = [];
    this.editingBlock = null;
    this.blockTa = null;
  },

  /* opt：
   *   blocks → 直接拿这份「块清单」来画（新建空段时用：源码里还没有它，parse 不出来）
   *   target → 画完之后要把哪一块交给 editBlock
   * 返回 target（没给就是 -1）。 */
  async renderCanvas(opt) {
    const canvas = this.canvasEl;
    if (!canvas) return -1;
    const p = this._renderCanvas(canvas, opt || null);
    this.canvasBusy = p;
    const clear = () => { if (this.canvasBusy === p) this.canvasBusy = null; };
    return p.then((t) => { clear(); return t; }, () => { clear(); return -1; });
  },

  async _renderCanvas(canvas, opt) {
    this.disposeCanvas();
    canvas.empty();
    const note = this.selectedNote;
    if (opt && Array.isArray(opt.blocks)) {
      this.blocks = opt.blocks;
    } else {
      this.blocks = parseBlocks(this.editorEl ? this.editorEl.value : '');
    }
    this.blockEls = [];
    this.editingBlock = null;
    for (let i = 0; i < this.blocks.length; i++) {
      const b = this.blocks[i];
      const cls = ['vwb-blk', 'vwb-blk-' + b.type];
      if (b.type === 'blank') cls.push('is-blank');
      if (b.pending) cls.push('is-pending');
      const holder = canvas.createDiv({ cls: cls.join(' ') });
      holder.setAttribute('data-idx', String(i));
      holder.setAttribute('title',
        b.pending ? tr('ui.145')
          : (b.type === 'blank' ? tr('ui.146') : tr('ui.147')));
      this.blockEls.push(holder);
      await this.renderBlockInto(holder, b, note);
      holder.addEventListener('click', (e) => this.onBlockClick(e, i));
      holder.addEventListener('contextmenu', (e) => {
        if (e.preventDefault) e.preventDefault();
        this.showEditorMenu(e, null, i);
      });
    }
    this.syncCanvasHeadings();
    if (this.outlineOpen) this.renderOutline();
    return (opt && typeof opt.target === 'number') ? opt.target : -1;
  },

  /* 新建一段时用的「空段落占位」。
   * Markdown 源码里没有「空段落」，所以 Neighbour 空词组必须自带前后各一个空行，
   * 否则用户一打草稿就会粘到相邻段落里去 —— 这是「新段 Zen 内容与源码不对版」的根源。 */
  makePendingBlocks(list, atIdx) {
    const mk = (type, raw, extra) =>
      Object.assign({ type, raw, start: -1, end: -1 }, extra || {});
    const out = list.slice();
    let at = Math.max(0, Math.min(atIdx + 1, out.length));
    // ① 新段前面得有一个空行把它和上一段分开
    if (!(out[at] && out[at].type === 'blank')) out.splice(at, 0, mk('blank', ''));
    at++;
    // ② 新段本身
    const target = at;
    out.splice(at, 0, mk('paragraph', '', { pending: true }));
    at++;
    // ③ 新段后面也得有一个空行（已经是文末、或者本来就有空行的就不加）
    if (at < out.length && !(out[at] && out[at].type === 'blank')) out.splice(at, 0, mk('blank', ''));
    return { blocks: out, target };
  },

  async renderBlockInto(holder, b, note) {
    if (!holder) return;
    // 每个块一块独立的 Component：重绘前先卸载上一轮，避免 MarkdownRenderer
    // 注册的子组件（图片嵌入 / 内链等）在反复提交后越堆越多。
    if (holder._vwbChild && typeof holder._vwbChild.unload === 'function') {
      try { holder._vwbChild.unload(); } catch (e) { /* 忽略 */ }
    }
    holder._vwbChild = null;
    holder.empty();
    if (holder.classList) holder.classList.remove('is-editing');
    if (b.type === 'blank') {
      holder.createDiv({ cls: 'vwb-blk-gap' });
      return;
    }
    let child = null;
    try {
      child = new Component();
      if (typeof child.load === 'function') child.load();
    } catch (e) { child = null; }
    holder._vwbChild = child;
    const notePath = (note && note.external) ? note.absPath : (note ? note.relPath : '');
    try {
      await MarkdownRenderer.render(this.plugin.app, b.raw, holder, notePath, child || this);
    } catch (e) {
      try { await MarkdownRenderer.renderMarkdown(b.raw, holder, notePath, child || this); }
      catch (e2) { holder.setText(b.raw); }
    }
    try { this.fixupRenderedContent(holder, note); } catch (e) { /* 忽略 */ }
  },

});
