/* -------------------------------------------------------------------------
 *  工作台视图 · 工作台内编辑器 — 命令分发 + 编辑器右键菜单
 *  （本片段由 build.js 拼进 main.js，不要单独 require）
 * ------------------------------------------------------------------------- */Object.assign(WorkbenchView.prototype, {
  /* ta：命令落在哪个输入框上；ctx：右键菜单的上下文（「删除这一段」要知道是哪一段） */
  applyCmd(id, ta, ctx) {
    const T = ta || this.pickEditorTarget();
    // 少数命令只跟「浏览器选区 / 当前文件」打交道，不需要落在某个输入框上
    if (!T && !READONLY_CMDS.has(id)) return;
    switch (id) {
      case 'bold': this.wrapSel(T, '**', '**', tr('ui.150')); break;
      case 'italic': this.wrapSel(T, '*', '*', tr('ui.151')); break;
      case 'underline': this.wrapSel(T, '<u>', '</u>', tr('ui.152')); break;
      case 'strike': this.wrapSel(T, '~~', '~~', tr('ui.153')); break;
      case 'code': this.wrapSel(T, '`', '`', tr('ui.154')); break;
      case 'mark': this.wrapSel(T, '==', '==', tr('ui.155')); break;
      case 'clear': this.clearStyle(T); break;
      case 'link': this.insertLink(T, false); break;
      case 'extlink': this.insertLink(T, true); break;
      case 'p': this.prefixLines(T, '', 'p'); break;
      case 'h1': this.prefixLines(T, '# ', 'h1'); break;
      case 'h2': this.prefixLines(T, '## ', 'h2'); break;
      case 'h3': this.prefixLines(T, '### ', 'h3'); break;
      case 'h4': this.prefixLines(T, '#### ', 'h4'); break;
      case 'h5': this.prefixLines(T, '##### ', 'h5'); break;
      case 'h6': this.prefixLines(T, '###### ', 'h6'); break;
      case 'hup': this.shiftHeading(T, 1); break;
      case 'hdn': this.shiftHeading(T, -1); break;
      case 'quote': this.prefixLines(T, '> ', 'quote'); break;
      case 'ul': this.prefixLines(T, '- ', 'ul'); break;
      case 'ol': this.prefixLines(T, '1. ', 'ol'); break;
      case 'task': this.prefixLines(T, '- [ ] ', 'task'); break;
      case 'table': this.insertBlock(T, tr('ui.156')); break;
      case 'hr': this.insertBlock(T, '---'); break;
      case 'codeblock': this.insertBlock(T, tr('ui.157')); break;
      case 'math': this.insertBlock(T, '$$\n\n$$'); break;
      case 'toc': this.insertBlock(T, '[TOC]'); break;
      case 'frontmatter': this.insertFrontmatter(T); break;
      case 'footnote': this.insertBlock(T, tr('ui.158')); break;
      case 'date': this.insertBlock(T, fmtDateTime(Date.now()).slice(0, 10)); break;
      case 'image': this.wrapSel(T, '![', tr('ui.159'), tr('ui.160')); break;
      case 'cut': this.clipAction(T, 'cut'); break;
      case 'copy': this.clipAction(T, 'copy'); break;
      case 'paste':
      case 'paste-plain': this.clipAction(T, 'paste'); break;
      case 'del-sel': this.deleteSelection(T); break;
      /* 单画布里选中的正文归浏览器管，输入框里的选区归 textarea 管 —— 两边都试一次 */
      case 'copy-sel': {
        const picked = this.domSelectionText();
        if (picked.trim()) { this.copyText(picked); break; }
        if (T) this.clipAction(T, 'copy');
        break;
      }
      case 'copy-block': {
        const c = ctx || {};
        const idx = (c.blockIdx != null) ? c.blockIdx : this.editingBlock;
        const b = (idx != null) ? (this.blocks || [])[idx] : null;
        if (b) this.copyText(b.raw);
        else if (T) this.copyText(String(T.value == null ? '' : T.value));
        break;
      }
      case 'copy-all': {
        const whole = (T && T === this.editorEl && this.editorEl) ? this.editorEl.value : '';
        if (whole) this.copyText(whole);
        else Promise.resolve(this.docRawText()).then((t) => this.copyText(t));
        break;
      }
      case 'copy-path': {
        const n = this.selectedNote;
        if (!n) break;
        this.copyText(n.external ? n.absPath : n.relPath);
        break;
      }
      case 'select-all-doc':
        if (!this.selectAllDoc()) new Notice(tr('editor.noSelectAll'));
        break;
      case 'del-block': {
        const c = ctx || {};
        const idx = (c.blockIdx != null) ? c.blockIdx : this.editingBlock;
        this.deleteBlock(idx);
        break;
      }
      case 'select-all': {
        // 单画布 / 阅读态：「全选」指的是「把看得见的正文都选上」，走浏览器选区；
        // 源码 / 双栏模式才落在输入框上。
        if ((!T || T === this.editorEl) && this.selectAllDoc()) break;
        if (T) this.selectAllText(T);
        break;
      }
      default: break;
    }
  },

  pickEditorTarget() {
    if (this.blockTa && this.editingBlock != null) return this.blockTa;
    return this.editorEl;
  },

  /* --------------------------------------------------------- 右键菜单
   * 三处菜单（编辑器 / 阅读态 / 文件区）长得一样，渲染逻辑共用一份。
   * groups 两种写法都认：{group:[…]}（常量表里手写的）与 {items:[…]}（按当前项动态生成的）。
   * 命令怎么执行由 onPick 决定，这里只管画。 */
  /* 菜单项文案：优先走词典（key = editorMenu.<id>），词典没有就沿用常量表里写的 label。
   * 这样 EDITOR_MENU / READ_MENU / NEW_MENU 三张表不用改结构就能双语。 */
  menuLabelOf(it, useId) {
    if (!it || !it.id || !useId) return (it && it.label) || '';
    const v = tr('editorMenu.' + it.id);
    return (v !== 'editorMenu.' + it.id) ? v : (it.label || '');
  },

  renderCtxGroups(host, groups, opts) {
    const o = opts || {};
    const hasSel = this.hasDomSelection();
    for (const g of groups || []) {
      const items = (g.items || g.group || []).filter((it) => {
        if (it.needBlock && o.blockIdx == null) return false;
        if (it.needSelection && !hasSel) return false;
        return true;
      });
      // 整个分组的项都被过滤掉了就别画这个分组，否则会留下一条空的分隔线
      if (!items.length) continue;
      const gEl = host.createDiv({ cls: 'vwb-ctx-g' });
      for (const it of items) {
        const row = gEl.createDiv({
          cls: 'vwb-ctx-i' + (it.sub ? ' has-sub' : '') +
            (it.danger ? ' is-danger' : '') + (it.disabled ? ' is-off' : '')
        });
        row.createEl('span', { cls: 'vwb-ctx-ic', text: it.ico || '' });
        row.createEl('span', { cls: 'vwb-ctx-lb', text: this.menuLabelOf(it, o.editorMenu) });
        if (it.hint) row.createEl('span', { cls: 'vwb-ctx-key', text: it.hint });
        if (it.disabled) {
          row.setAttribute('title', it.why || tr('ui.161'));
          continue;
        }
        if (it.sub) {
          row.createEl('span', { cls: 'vwb-ctx-ar', text: '›' });
          const sub = row.createDiv({ cls: 'vwb-ctx-sub vwb-glass' });
          for (const s of it.sub) {
            const sr = sub.createDiv({ cls: 'vwb-ctx-i' });
            sr.createEl('span', { cls: 'vwb-ctx-lb', text: this.menuLabelOf(s, o.editorMenu) });
            if (s.hint) sr.createEl('span', { cls: 'vwb-ctx-key', text: s.hint });
            sr.addEventListener('mousedown', (e) => { if (e.preventDefault) e.preventDefault(); });
            sr.addEventListener('click', (e) => {
              if (e.stopPropagation) e.stopPropagation();
              o.onPick(s.id);
            });
          }
        } else {
          row.addEventListener('mousedown', (e) => { if (e.preventDefault) e.preventDefault(); });
          row.addEventListener('click', (e) => {
            if (e.stopPropagation) e.stopPropagation();
            o.onPick(it.id);
          });
        }
      }
    }
  },

  /* 弹菜单的通用前半段：先按 0,0 画出来（量得到真实尺寸），最后再摆位置。
   * container 决定菜单挂在谁身上（预览面板 / 主区），定位边界要跟着它走。 */
  openCtxMenu(container) {
    this.closeEditorMenu();
    const host = container || this.prevEl;
    if (!host) return null;
    const el = host.createDiv({ cls: 'vwb-ctx vwb-glass' });
    this.ctxEl = el;
    try {
      el.style.left = '0px';
      el.style.top = '0px';
      el.style.visibility = 'hidden';
    } catch (e) { /* 忽略 */ }
    return el;
  },

  showEditorMenu(ev, ta, blockIdx) {
    const host = this.openCtxMenu();
    if (!host) return;
    const x = Number(ev && ev.clientX) || 0;
    const y = Number(ev && ev.clientY) || 0;

    // 命令要作用在「哪一段」上：菜单一弹出就得定下来，之后焦点怎么变都不受影响
    const effBlock = (blockIdx != null) ? blockIdx : this.editingBlock;
    const owned = (effBlock != null && this.editingBlock === effBlock) ? this.blockTa : null;
    const ctx = {
      ta: ta || owned,
      blockIdx: (effBlock != null ? effBlock : null),
      live: this.editorMode() === 'live'
    };

    this.renderCtxGroups(host, EDITOR_MENU, { editorMenu: true,
      blockIdx: ctx.blockIdx,
      onPick: (id) => this.runEditorCmd(id, ctx)
    });

    // 关键：点菜单不能让正在编辑的那一段失焦。
    // 一失焦就触发 blur → commitBlock → 那一段的输入框被重绘换掉，
    // 而命令还落在已经脱离文档的旧输入框上 —— 表现出来就是「右键菜单点了没反应」。
    host.addEventListener('mousedown', (e) => {
      if (e.preventDefault) e.preventDefault();
    });
    this.placeMenu(host, x, y, this.prevEl);
    try { host.style.visibility = ''; } catch (e) { /* 忽略 */ }
  },

  /* 阅读态右键：没有输入框，只做「读」的事（复制选中 / 全选 / 复制整篇 / 复制路径） */
  showReadMenu(ev) {
    const host = this.openCtxMenu();
    if (!host) return;
    const x = Number(ev && ev.clientX) || 0;
    const y = Number(ev && ev.clientY) || 0;
    this.renderCtxGroups(host, READ_MENU, { editorMenu: true,
      onPick: (id) => { this.closeEditorMenu(); this.applyCmd(id, null, null); }
    });
    // 同编辑器菜单：别让点菜单把正文里的选区弄丢
    host.addEventListener('mousedown', (e) => {
      if (e.preventDefault) e.preventDefault();
    });
    this.placeMenu(host, x, y, this.prevEl);
    try { host.style.visibility = ''; } catch (e) { /* 忽略 */ }
  },

  /* 阅读态正文绑一次右键（正文容器不会随渲染被换掉，所以只绑一次） */
  bindReadMenu() {
    const body = this.prevBodyEl;
    if (!body || body._vwbReadMenu) return;
    body._vwbReadMenu = true;
    body.addEventListener('contextmenu', (e) => {
      if (this.docMode === 'edit') return; // 编辑态由画布 / 输入框自己处理
      const t = e && e.target;
      if (t && typeof t.closest === 'function' && t.closest('.vwb-ctx, .vwb-edit, input, textarea, .vwb-embed, iframe')) return;
      if (e.preventDefault) e.preventDefault();
      if (e.stopPropagation) e.stopPropagation();
      this.showReadMenu(e);
    });
  },

  /* 把菜单摆到鼠标位置，并保证它整块都在面板里：
   *   右边够宽 → 原地不动，子菜单朝右开
   *   右边不够但左边够 → 根菜单原地不动，子菜单改朝左开（is-flip）
   *   两边都不够（面板很窄）→ 子菜单「就地展开」（is-flat），同时把根菜单挪进面板
   *   下边放不下 → 向上翻；高度实在装不下 → 限高 + 内部滚动
   * 功能越加越多时这里不用再改。
   * bounds 决定「菜单该待在哪个盒子里」：编辑器右键菜单在预览面板里，
   * 文件区右键菜单在主区里 —— 两边各自的边界不一样，所以要能传进来。 */
  placeMenu(host, x, y, bounds) {
    const prev = bounds || this.prevEl;
    let bl = 0;
    let bt = 0;
    let bw = 0;
    let bh = 0;
    try {
      const r = prev && prev.getBoundingClientRect ? prev.getBoundingClientRect() : null;
      if (r) { bl = r.left || 0; bt = r.top || 0; bw = r.width || 0; bh = r.height || 0; }
    } catch (e) { /* 忽略 */ }
    if (!bw) bw = (prev && prev.clientWidth) || 0;
    if (!bh) bh = (prev && prev.clientHeight) || 0;
    if (!bw) bw = 420;
    if (!bh) bh = 640;

    const mw = host.offsetWidth || 224;   // 菜单自身宽
    const mh = host.offsetHeight || 340;  // 菜单自身高
    const subRoom = 186;                  // 子菜单还要往旁边占的宽度
    const needW = mw + subRoom;
    const pad = 6;

    let left = x - bl;
    let top = y - bt;
    let flip = false;
    // 面板比「根菜单 + 子菜单」还窄时，怎么摆都放不下 → 直接就让子菜单就地展开
    let flat = (bw < needW + pad * 2);

    if (!flat) {
      const rightRoom = bw - pad - left;
      if (rightRoom >= needW) {
        /* 右边什么都放得下，不折腾 */
      } else if (left >= subRoom + pad) {
        flip = true; // 左边够放子菜单 → 子菜单朝左开
      } else {
        left = Math.max(pad, bw - pad - needW); // 往右挪，给「根 + 子菜单」腾地方
      }
    }

    // 下面放不下 → 向上翻
    if (top + mh > bh - pad) top = top - mh;

    left = Math.max(pad, Math.min(left, Math.max(pad, bw - mw - pad)));
    top = Math.max(pad, Math.min(top, Math.max(pad, bh - mh - pad)));

    try {
      host.style.left = Math.round(left) + 'px';
      host.style.top = Math.round(top) + 'px';
    } catch (e) { /* 忽略 */ }
    if (flip && host.classList) host.classList.add('is-flip');

    // 高度装不下 → 限高 + 内部滚动；此时子菜单必须就地展开，否则会被 overflow 裁掉
    if (mh > bh - 16) {
      try {
        host.style.maxHeight = Math.max(160, Math.round(bh - 24)) + 'px';
        host.style.overflowY = 'auto';
      } catch (e) { /* 忽略 */ }
      flat = true;
    }
    if (flat && host.classList) host.classList.add('is-flat');
  },

  async runEditorCmd(id, ctx) {
    this.closeEditorMenu();
    const c = ctx || {};
    // 「复制」类命令不需要「先进入编辑态」——
    // 尤其是「复制选中文本」：一带进编辑态，用户刚拖选出来的选区就没了。
    if (id === 'copy-sel' && this.domSelectionText().trim()) {
      this.applyCmd(id, null, c);
      return;
    }
    if (id === 'copy-block') {
      const idx = (c.blockIdx != null) ? c.blockIdx : this.editingBlock;
      const b = (idx != null) ? (this.blocks || [])[idx] : null;
      if (b) { this.copyText(b.raw); return; }
    }
    if (id === 'copy-all') { this.applyCmd(id, null, c); return; }
    const T = await this.menuTarget(c);
    if (!T && !READONLY_CMDS.has(id)) return;
    // 菜单点击会抢走焦点，先把焦点和光标还回去，选区才对得上
    try { if (T && typeof T.focus === 'function') T.focus({ preventScroll: true }); } catch (e) { /* 忽略 */ }
    this.applyCmd(id, T, c);
  },

  /* 右键命令该作用在哪个输入框上 —— 这里最容易出错：
   * 单画布模式下源码框是隐藏的（display:none），命令若落到它身上，改了也看不见，
   * 用户看到的就是「右键菜单全都失灵」。所以：
   *   在某一块上右键   → 让这一段进入编辑态，命令作用在它的输入框上（画布立刻跟着变）
   *   画布空白 / 顶栏「Aa 格式」且当前没在编辑任何一段 → 作用在整篇源码上，
   *                     并把光标放到文末当落点，执行完再重画整张画布。
   * 另外，菜单弹出之后到点击之间，那一段有可能已经被提交重绘过（输入框被换掉），
   * 所以这里要确认 ctx.ta 还是「当前活着的那个输入框」，否则重新把这一段带进编辑态。 */
  async menuTarget(ctx) {
    const c = ctx || {};
    const stillAlive = (el) => !!el && (el === this.editorEl || el === this.blockTa);
    if (c.ta && stillAlive(c.ta)) return c.ta;
    if (c.live && c.blockIdx != null) {
      const ta = await this.editBlock(c.blockIdx, 'end');
      if (ta) return ta;
    }
    const ta = this.editorEl;
    if (!ta) return null;
    if (this.editingBlock == null) {
      const len = String(ta.value == null ? '' : ta.value).length;
      this.setSel(ta, len, len);
    }
    return ta;
  },

  closeEditorMenu() {
    const el = this.ctxEl;
    this.ctxEl = null;
    if (!el) return;
    try {
      if (typeof el.remove === 'function') el.remove();
      else if (el.parentElement) el.parentElement.removeChild(el);
    } catch (e) { /* 忽略 */ }
  },
});
