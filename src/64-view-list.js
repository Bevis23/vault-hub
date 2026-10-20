/* -------------------------------------------------------------------------
 *  工作台视图 · 核心：render 工具条 + 排序分区 + 文件夹树 + 卡片渲染
 *  （本片段由 build.js 拼进 main.js，不要单独 require）
 * ------------------------------------------------------------------------- */
Object.assign(WorkbenchView.prototype, {
  render() {
    if (!this.areaEl) return;
    // 应用外观变量（全局或本库独立配置）
    this.applyAppearance();
    const ap = this.effectiveAppearance();

    const vault = this.selectedVaultInfo();
    if (!vault) return;

    const idx = this.plugin.indexOf(vault.path);
    let notes = idx.files || [];
    // 库里的权威目录清单（含空文件夹）：partitionNotes 靠它把空文件夹也摆出来
    this.indexFolders = idx.folders || [];

    // 搜索：#标签 / tag:标签 = 精确按标签过滤；普通词 = 文件名+标签的子串匹配
    if (this.query) {
      const raw = String(this.query).trim();
      const tagM = raw.match(/^(?:tag\s*:|#)\s*#?(.+)$/i);
      if (tagM) {
        const want = tagM[1].trim().toLowerCase();
        notes = notes.filter((n) => (n.tags || [])
          .some((t) => String(t).toLowerCase().replace(/^#+/, '') === want));
      } else {
        const q = raw.toLowerCase();
        notes = notes.filter((n) => (n.name.toLowerCase().indexOf(q) >= 0) || (n.tags || []).join(' ').toLowerCase().indexOf(q) >= 0);
      }
    }

    // 仪表盘的两个筛选条件：与搜索 / 文件夹为 AND 叠加
    if (this.weekOnly) {
      const wk = Date.now() - 7 * 86400000;
      notes = notes.filter((n) => (n.mtime || 0) > wk);
    }
    if (this.tagFilter && this.tagFilter.length) {
      notes = notes.filter((n) => {
        const ts = (n.tags || []).map((t) => String(t).toLowerCase().replace(/^#+/, ''));
        return this.tagFilter.every((f) => ts.indexOf(String(f).toLowerCase()) >= 0);
      });
    }

    // 仪表盘：四个可点击的概览卡片（只统计当前库；在库根层且没搜索时显示）
    if (ap.showStats && !this.query && !this.folderPath) {
      const s = this.computeStats(notes);
      this.statsEl.style.display = 'grid';
      this.statsEl.empty();
      const mkCard = (cls, num, label, sub, tip, onPick) => {
        const box = this.statsEl.createDiv({ cls: 'vwb-stat vwb-glass vwb-dash-card ' + cls });
        box.createDiv({ cls: 'vwb-stat-v', text: num });
        box.createDiv({ cls: 'vwb-stat-k', text: label });
        box.createDiv({ cls: 'vwb-stat-d', text: sub });
        box.setAttribute('title', tip);
        box.addEventListener('click', onPick);
        return box;
      };
      mkCard('', String(s.total), tr('dash.total'),
        tr('dash.mdLine', { md: s.md, canvas: s.canvas, excali: s.excali }),
        tr('dash.total.tip'),
        () => this.dashAll());
      mkCard('', String(s.week), tr('dash.week'), tr('dash.week.sub'),
        tr('dash.week.tip'),
        () => this.dashWeek());
      mkCard(s.inboxExists ? 'vwb-stat-warn' : 'is-unset',
        s.inboxExists ? String(s.inbox) : tr('dash.inbox.unset'), tr('dash.inbox'),
        s.inboxExists ? tr('dash.inbox.sub', { name: s.inboxName }) : tr('dash.inbox.create', { name: s.inboxName }),
        s.inboxExists ? tr('dash.inbox.tip') : tr('dash.inbox.createTip', { name: s.inboxName }),
        () => this.dashInbox());
      mkCard('', String(s.tagTotal), tr('dash.tags'),
        s.tagTop.length ? s.tagTop.map((x) => '#' + x[0] + '(' + x[1] + ')').join(' ') : tr('dash.tags.none'),
        tr('dash.tags.tip'),
        () => this.toggleTagPanel());
    } else {
      this.statsEl.style.display = 'none';
    }

    // 工具条
    this.barEl.empty();

    // 前进 / 后退：和浏览器一样在目录之间来回走（Alt+← / Alt+→）
    const mkNav = (cls, txt, on, enabled, tip) => {
      const b = this.barEl.createDiv({ cls: 'vwb-nav' + (enabled ? '' : ' is-off') });
      b.createEl('span', { cls: cls, text: txt });
      b.setAttribute('title', tip);
      if (enabled) b.addEventListener('click', on);
      return b;
    };
    mkNav('', '⇦', () => this.goBack(), this.canBack(), tr('ui.1'));
    mkNav('', '⇨', () => this.goFwd(), this.canFwd(), tr('ui.2'));
    // 「上一级」：钻取后随时可回退
    if (this.folderPath && !this.query) {
      const up = this.barEl.createDiv({ cls: 'vwb-crumb-up' });
      up.createEl('span', { text: tr('ui.3') });
      up.addEventListener('click', () => this.goUp());
    }

    const crumb = this.barEl.createDiv({ cls: 'vwb-crumb' });
    const mkCrumb = (label, level, isCur) => {
      const el = crumb.createDiv({ cls: 'vwb-crumb-p' + (isCur ? ' is-cur' : '') });
      el.createEl('span', { text: label });
      if (!isCur) {
        el.addEventListener('click', () => this.goTo(level));
      }
      return el;
    };
    if (this.query) {
      mkCrumb(vault.name, '', false);
      crumb.createEl('i', { text: '/' });
      const sc = crumb.createDiv({ cls: 'vwb-crumb-p is-cur' });
      sc.createEl('span', { text: tr('ui.4') + this.query });
      sc.addEventListener('click', () => this.clearSearch(true));
    } else {
      const segs = this.folderPath ? this.folderPath.split('/') : [];
      mkCrumb(vault.name, '', segs.length === 0);
      let acc = '';
      for (const seg of segs) {
        acc = acc ? acc + '/' + seg : seg;
        crumb.createEl('i', { text: '/' });
        mkCrumb(seg, acc, acc === this.folderPath);
      }
    }

    /* 搜索范围：当前库（文件名 / 标签） / 所有库（全文）
     * 跨库要建索引，所以两个范围分开，默认不动就只搜当前库，浏览体验不受影响。 */
    const scopeBtn = this.barEl.createDiv({
      cls: 'vwb-tab vwb-scope' + (this.searchScope === 'all' ? ' is-on' : '')
    });
    scopeBtn.createEl('span', { text: this.searchScope === 'all' ? tr('ui.6') : tr('ui.7') });
    scopeBtn.setAttribute('title', this.searchScope === 'all'
      ? tr('scope.all.tip')
      : tr('scope.current.tip'));
    scopeBtn.addEventListener('click', () => {
      this.searchScope = this.searchScope === 'all' ? 'current' : 'all';
      this.crossHits = null;
      this.syncSearchUI();
      this.render();
      new Notice(this.searchScope === 'all'
        ? tr('ui.8')
        : tr('ui.9'));
    });

    const gTab = this.barEl.createDiv({ cls: 'vwb-tab' + (this.mode === 'grid' ? ' is-on' : ''), text: tr('bar.grid') });
    gTab.addEventListener('click', () => { this.mode = 'grid'; this.plugin.settings.view.mode = 'grid'; this.plugin.saveSettings(); this.render(); });
    const lTab = this.barEl.createDiv({ cls: 'vwb-tab' + (this.mode === 'list' ? ' is-on' : ''), text: tr('bar.list') });
    lTab.addEventListener('click', () => { this.mode = 'list'; this.plugin.settings.view.mode = 'list'; this.plugin.saveSettings(); this.render(); });

    // 列表模式专用：全部展开 / 全部收缩
    if (this.mode === 'list') {
      const allOpen = this.expandedFolders && this.expandedFolders.size > 0;
      const xTab = this.barEl.createDiv({ cls: 'vwb-tab', text: allOpen ? tr('bar.collapseAll') : tr('bar.expandAll') });
      xTab.setAttribute('title', allOpen ? tr('bar.collapseAll.tip') : tr('bar.expandAll.tip'));
      xTab.addEventListener('click', () => { allOpen ? this.collapseAllFolders() : this.expandAllFolders(); });
    }

    // 智能视图：保存 / 应用筛选器入口
    const svBtn = this.barEl.createDiv({ cls: 'vwb-tab', text: tr('bar.views') });
    svBtn.setAttribute('title', tr('bar.views.tip'));
    svBtn.addEventListener('click', (e) => {
      if (e && e.stopPropagation) e.stopPropagation();
      this.showViewsMenu(e);
    });

    // 打开方式切换：下拉菜单三选一（右侧预览 / 工作面板 / 原生编辑）
    const curMode = openModeOf(this.plugin.settings.open.mode);
    const oWrap = this.barEl.createDiv({ cls: 'vwb-menu vwb-openmode' });
    const oBtn = oWrap.createDiv({ cls: 'vwb-tab is-on vwb-menu-btn' });
    oBtn.createEl('span', { cls: 'vwb-menu-btn-t', text: tr('ui.10') });
    oBtn.createEl('span', { cls: 'vwb-menu-btn-cur', text: tr(curMode.chip) });
    oBtn.createEl('span', { cls: 'vwb-menu-caret', text: '▾' });
    oBtn.setAttribute('title', tr('tip.openModeCur', { label: tr(curMode.label), tip: tr(curMode.tip) }));
    oBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.openMenuOpen = !this.openMenuOpen;
      this.render();
    });
    const oPop = oWrap.createDiv({ cls: 'vwb-menu-pop vwb-glass' + (this.openMenuOpen ? ' is-on' : '') });
    for (const m of OPEN_MODES) {
      const it = oPop.createDiv({ cls: 'vwb-menu-i' + (m.id === curMode.id ? ' is-on' : '') });
      const hd = it.createDiv({ cls: 'vwb-menu-i-hd' });
      hd.createEl('span', { cls: 'vwb-menu-i-nm', text: tr(m.label) + (m.def ? tr('ui.11') : '') });
      if (m.id === curMode.id) hd.createEl('span', { cls: 'vwb-menu-i-ck', text: '✓' });
      it.createDiv({ cls: 'vwb-menu-i-ds', text: tr(m.tip) });
      it.setAttribute('title', tr(m.tip));
      it.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openMenuOpen = false;
        if (m.id !== curMode.id) this.plugin.setOpenMode(m.id);
        else this.render();
      });
    }

    this.barEl.createDiv({ cls: 'vwb-spacer' });
    const sel = this.barEl.createEl('select');
    [
      ['mtime', tr('ui.12')],
      ['name', tr('ui.13')],
      ['size', tr('ui.14')]
    ].forEach((o) => sel.createEl('option', { value: o[0], text: o[1] }));
    sel.value = this.sort;
    sel.addEventListener('change', () => { this.sort = sel.value; this.plugin.settings.view.sort = this.sort; this.plugin.saveSettings(); this.render(); });

    // 列表内容
    this.areaEl.empty();
    this.flatOrder = []; // 本屏的渲染顺序：Shift 连选要按它取区间
    this.itemEls = [];   // 本屏的条目元素：鼠标框选要按它们的实际位置算命中
    const cmp = this.noteCmp();
    // 多选状态下，操作条永远钉在文件区最上面
    if (this.multiSel && this.multiSel.size) this.renderBatchBar();
    // 已选标签提示条（标签筛选开启时）
    if (this.tagFilter && this.tagFilter.length) this.renderTagBar();
    // 标签列表面板：点「标签库」卡片后，文件区换成标签列表
    if (this.tagPanelOpen) {
      this.renderTagPanel(notes);
      this.bindAreaGestures();
      this.hintEl.setText('');
      this.hintEl.style.display = 'none';
      return;
    }

    // 跨库全文搜索：结果就是一张跨库的命中清单，不是文件树
    if (this.query && this.searchScope === 'all') {
      this.renderCrossHits();
      this.bindAreaGestures();
      this.hintEl.setText('');
      this.hintEl.style.display = 'none';
      return;
    }

    // 搜索 / 仪表盘筛选命中：**平铺**，不按文件夹分组 ——
    // 否则匹配到的笔记会藏在子文件夹卡片里，用户点了筛选却看不见结果
    const flatView = !!this.query || !!this.weekOnly ||
      !!(this.tagFilter && this.tagFilter.length);
    if (flatView) {
      const hits = notes.slice().sort(cmp);
      if (!hits.length) {
        this.areaEl.createDiv({
          cls: 'vwb-empty',
          text: this.weekOnly ? tr('empty.weekNone') : tr('empty.noMatch')
        });
      }
      if (this.mode === 'grid') {
        const grid = this.areaEl.createDiv({ cls: 'vwb-grid ' + ap.density });
        for (const n of hits) this.renderCard(grid, n);
      } else {
        for (const n of hits) this.renderFileRow(this.areaEl, n, 0);
      }
      this.bindAreaGestures();
      this.hintEl.setText('');
      this.hintEl.style.display = 'none';
      return;
    }

    if (this.mode === 'grid') {
      const { folders, files } = this.partitionNotes(notes, this.folderPath);
      folders.sort((a, b) => a.name.localeCompare(b.name, 'zh'));
      files.sort(cmp);
      if (!folders.length && !files.length) {
        this.areaEl.createDiv({ cls: 'vwb-empty', text: tr('empty.folderEmpty') });
      }
      if (folders.length) {
        const grid = this.areaEl.createDiv({ cls: 'vwb-grid ' + ap.density });
        for (const f of folders) this.renderFolderCard(grid, f);
      }
      if (files.length) {
        const grid = this.areaEl.createDiv({ cls: 'vwb-grid ' + ap.density + (folders.length ? ' vwb-mt' : '') });
        grid.style.marginTop = folders.length ? '12px' : '0';
        for (const n of files) this.renderCard(grid, n);
      }
    } else {
      // 列表模式：文件夹前面的 ▸ 点一下就地展开，直接看里面有什么；点名字才进下一级
      const any = this.renderTreeRows(this.areaEl, notes, this.folderPath, 0);
      if (!any) this.areaEl.createDiv({ cls: 'vwb-empty', text: tr('empty.folderEmpty') });
    }

    this.bindAreaGestures();
    // 操作说明统一收进「设置 → 使用说明」，文件区底部不再堆一长串文案
    this.hintEl.setText('');
    this.hintEl.style.display = 'none';
  },

  /* -------------------------------------------- 文件区手势：框选 + 空白右键
   * 绑在 areaEl 上（每次 render 都会重建，所以标记 _vwbGesture 只绑一次）。
   * 左键在空白处拖一下 = 框选；右键在空白处 = 弹出这一屏能做的事。 */
  bindAreaGestures() {
    const area = this.areaEl;
    if (!area || area._vwbGesture) return;
    area._vwbGesture = true;
    area.addEventListener('mousedown', (e) => this.onAreaMouseDown(e));
    area.addEventListener('contextmenu', (e) => {
      if (this.itemElOf(e && e.target)) return;   // 点在条目上 → 交给条目自己的菜单
      if (e && e.preventDefault) e.preventDefault();
      if (e && e.stopPropagation) e.stopPropagation();
      this.showBlankMenu(e);
    });
  },

  /* 框选：拖出一个框，松手时把框里的项选上。
   * 移动不到 6px 就当成「点了一下空白」= 清空选择，避免手抖误选。
   * 选框挂在视图根上用**相对坐标**：挂 mainEl 用 fixed 的话，
   * 祖先的 backdrop-filter 会让 fixed 变成相对定位，框就画歪了（v0.9.1 踩过同类坑）。 */
  onAreaMouseDown(e) {
    if (!e || e.button !== 0) return;                     // 只管左键
    if (e.ctrlKey || e.metaKey || e.shiftKey) return;     // 这两个是 Ctrl / Shift 多选，不抢
    // 点在批量操作条 / 弹层内部 → 不要启动框选，也不要清空选择
    let node = e && e.target;
    while (node && node !== this.areaEl) {
      try {
        if (node.classList && node.classList.contains('vwb-batch')) return;
      } catch (e2) { /* 忽略 */ }
      node = node.parentElement;
    }
    if (this.itemElOf(e.target)) return;                  // 点在条目上 → 交给条目
    const doc = (typeof document !== 'undefined') ? document : null;
    if (!doc || typeof doc.addEventListener !== 'function') return;
    const root = this.contentEl;
    let rootLeft = 0;
    let rootTop = 0;
    try {
      const rr = root.getBoundingClientRect();
      if (rr) { rootLeft = rr.left || 0; rootTop = rr.top || 0; }
    } catch (e0) { /* 忽略 */ }
    const sxC = Number(e.clientX) || 0;   // 视口坐标（给命中判定用，元素 rect 也是视口系）
    const syC = Number(e.clientY) || 0;
    const sx = sxC - rootLeft;            // 相对坐标（给选框定位用）
    const sy = syC - rootTop;
    let box = null;
    let moved = false;
    const onMove = (ev) => {
      const xC = Number(ev.clientX) || 0;
      const yC = Number(ev.clientY) || 0;
      const x = xC - rootLeft;
      const y = yC - rootTop;
      if (!moved && Math.abs(x - sx) < 6 && Math.abs(y - sy) < 6) return;
      if (!moved) { moved = true; box = root.createDiv({ cls: 'vwb-marquee' }); }
      const r = this.rectOf(sx, sy, x, y);
      try {
        box.style.left = r.left + 'px';
        box.style.top = r.top + 'px';
        box.style.width = (r.right - r.left) + 'px';
        box.style.height = (r.bottom - r.top) + 'px';
      } catch (e2) { /* 忽略 */ }
      // 拖的过程中就实时高亮框里的项 —— 不用等松手才知道选了谁
      const hits = this.hitsInRect(this.rectOf(sxC, syC, xC, yC));
      for (const el of this.itemEls || []) {
        if (!el || !el._vwbItem) continue;
        const on = hits.some((h) => h.key === el._vwbItem.key);
        try { el.classList.toggle('is-multi', on); } catch (e3) { /* 忽略 */ }
      }
    };
    const onUp = (ev) => {
      try { doc.removeEventListener('mousemove', onMove); } catch (e2) { /* 忽略 */ }
      try { doc.removeEventListener('mouseup', onUp); } catch (e2) { /* 忽略 */ }
      if (box) this.closeDialog(box);
      if (!moved) {
        // 只是点了一下空白 → 清空选择（和点文件一样的手感）
        if (this.multiSel && this.multiSel.size) { this.clearMulti(); this.render(); }
        return;
      }
      this.selectByRect(this.rectOf(sxC, syC, Number(ev.clientX) || 0, Number(ev.clientY) || 0),
        !!(ev && (ev.ctrlKey || ev.metaKey)));
    };
    doc.addEventListener('mousemove', onMove);
    doc.addEventListener('mouseup', onUp);
  },

  rectOf(x1, y1, x2, y2) {
    return {
      left: Math.min(x1, x2), top: Math.min(y1, y2),
      right: Math.max(x1, x2), bottom: Math.max(y1, y2)
    };
  },

  /* 哪些条目落在框里（按元素的实际位置算，网格和列表都适用） */
  hitsInRect(rect) {
    const out = [];
    for (const el of this.itemEls || []) {
      if (!el || !el._vwbItem) continue;
      let r = null;
      try { r = el.getBoundingClientRect(); } catch (e) { continue; }
      if (!r) continue;
      const miss = r.right < rect.left || r.left > rect.right ||
        r.bottom < rect.top || r.top > rect.bottom;
      if (!miss) out.push(el._vwbItem);
    }
    return out;
  },

  selectByRect(rect, additive) {
    const hits = this.hitsInRect(rect);
    if (!this.multiSel) this.multiSel = new Map();
    if (!additive) { this.multiSel.clear(); this.selAnchor = -1; }
    for (const h of hits) this.multiSel.set(h.key, { kind: h.kind, item: h.item });
    if (hits.length) {
      this.selAnchor = (this.flatOrder || [])
        .findIndex((x) => this.selKey(x.kind, x.item) === hits[0].key);
    }
    this.afterMultiChange();
  },

  /* ---------------------------------------------------- 空白处右键菜单 */
  blankMenuGroups() {
    const vault = this.selectedVaultInfo();
    const external = !!(vault && this.plugin.indexOf(vault.path).external);
    const writable = !(external && !(vault && this.plugin.vaultWritable(vault.path)));
    const noWrite = external && !writable ? tr('menu.why.noWrite') : '';
    const hasSel = !!(this.multiSel && this.multiSel.size);
    return [
      { items: [
        { id: 'new-note', label: tr('blank.newNote') + '…', ico: '＋', disabled: !writable, why: noWrite },
        { id: 'new-folder', label: tr('blank.newFolder') + '…', ico: '📁', disabled: !writable, why: noWrite }
      ] },
      { items: [
        { id: 'select-all', label: tr('blank.selectAll'), ico: '☑' },
        { id: 'clear-sel', label: tr('batch.clear'), ico: '✕', disabled: !hasSel, why: tr('blank.why.noSel') }
      ] },
      { items: [
        { id: 'switch-view', label: this.mode === 'grid' ? tr('blank.toListView') : tr('blank.toGridView'),
          ico: this.mode === 'grid' ? '☰' : '▦' },
        { id: 'refresh', label: tr('blank.rescanVault'), ico: '↻' }
      ] },
      { items: [
        { id: 'appearance', label: tr('blank.appearance') + '…', ico: '🎨' }
      ] }
    ];
  },

  showBlankMenu(ev) {
    const host = this.openCtxMenu(this.contentEl);
    if (!host) return;
    const x = Number(ev && ev.clientX) || 0;
    const y = Number(ev && ev.clientY) || 0;
    this.renderCtxGroups(host, this.blankMenuGroups(), {
      onPick: (id) => { this.closeEditorMenu(); this.runBlankCmd(id); }
    });
    this.placeMenu(host, x, y, this.contentEl);
    try { host.style.visibility = ''; } catch (e) { /* 忽略 */ }
  },

  runBlankCmd(id) {
    const vault = this.selectedVaultInfo();
    switch (id) {
      case 'new-note': this.createNote(this.folderPath); return;
      case 'new-folder': this.createFolder(this.folderPath); return;
      case 'select-all': {
        if (!this.multiSel) this.multiSel = new Map();
        for (const x of this.flatOrder || []) {
          this.multiSel.set(this.selKey(x.kind, x.item), { kind: x.kind, item: x.item });
        }
        this.afterMultiChange();
        return;
      }
      case 'clear-sel': this.clearMulti(); this.render(); return;
      case 'switch-view': {
        this.mode = this.mode === 'grid' ? 'list' : 'grid';
        this.plugin.settings.view.mode = this.mode;
        this.plugin.saveSettings();
        this.render();
        return;
      }
      case 'refresh': {
        if (vault) delete this.plugin.externalCache[vault.path];
        this.render();
        new Notice(tr('notice.rescannedVault', { name: (vault ? vault.name : '') }));
        return;
      }
      case 'appearance': this.drawerPage = 'appearance'; this.toggleDrawer(true); return;
      default: return;
    }
  },

  /* 排序比较器（文件夹 / 文件共用，跟着工具条上的「排序:」走） */
  noteCmp() {
    return (a, b) => {
      if (this.sort === 'name') return a.name.localeCompare(b.name, 'zh');
      if (this.sort === 'size') return (b.size || 0) - (a.size || 0);
      return (b.mtime || 0) - (a.mtime || 0);
    };
  },

  /* 把一个目录下的笔记拆成「直属子文件夹」和「本层文件」。
   * folders 是库里的权威目录清单（含**空文件夹**）—— 光从笔记反推的话，空文件夹永远不出现。
   * 文件夹的 count = 它整棵子树里的笔记数（和以前一致），一条都没有就是空文件夹。 */
  partitionNotes(notes, prefix, folders) {
    const p = normFolder(prefix);
    const all = folders || this.indexFolders || [];
    const map = new Map();
    const files = [];
    const weekAgo = Date.now() - 7 * 86400000;
    const ensure = (path) => {
      let it = map.get(path);
      if (!it) {
        it = { name: path.split('/').pop(), path: path, count: 0, latest: null, week: 0 };
        map.set(path, it);
      }
      return it;
    };

    for (const n of notes) {
      const f = normFolder(n.folder);
      if (f === p) { files.push(n); continue; }
      if (p && f.indexOf(p + '/') !== 0) continue;    // 不在当前目录底下
      const rel = p ? f.slice(p.length + 1) : f;
      if (!rel) { files.push(n); continue; }
      const it = ensure(p ? p + '/' + rel.split('/')[0] : rel.split('/')[0]);
      it.count++;
      if (!it.latest || (n.mtime || 0) > (it.latest.mtime || 0)) it.latest = n;
      if ((n.mtime || 0) > weekAgo) it.week++;
    }

    // 权威清单里的「本层直属子文件夹」：有笔记的上面已经数过了，这里补的是空文件夹
    for (let i = 0; i < all.length; i++) {
      const raw = all[i];
      const fp = normFolder(raw && raw.path != null ? raw.path : raw);
      if (!fp) continue;
      if (p && fp.indexOf(p + '/') !== 0) continue;
      const rel = p ? fp.slice(p.length + 1) : fp;
      if (!rel || rel.indexOf('/') >= 0) continue;    // 只算本层，深层等钻进去再说
      ensure(fp);
    }

    return { folders: Array.from(map.values()), files: files };
  },

  /* 列表模式：全部展开当前目录下（含子层）的所有文件夹 */
  expandAllFolders() {
    if (!this.expandedFolders) this.expandedFolders = new Set();
    const prefix = normFolder(this.folderPath);
    for (const f of (this.indexFolders || [])) {
      const fp = normFolder(f && f.path != null ? f.path : f);
      if (!fp) continue;
      if (prefix && fp !== prefix && fp.indexOf(prefix + '/') !== 0) continue;
      if (fp !== prefix) this.expandedFolders.add(fp);
    }
    this.render();
  },

  /* 列表模式：全部收缩 */
  collapseAllFolders() {
    const prefix = normFolder(this.folderPath);
    if (!this.expandedFolders) { this.render(); return; }
    if (!prefix) {
      this.expandedFolders.clear();
    } else {
      for (const fp of Array.from(this.expandedFolders)) {
        if (fp === prefix || fp.indexOf(prefix + '/') === 0) this.expandedFolders.delete(fp);
      }
    }
    this.render();
  },

  /* 文件夹就地展开 / 收起（列表模式下点 ▸ / ▾） */
  toggleFolderExpand(path) {
    if (!this.expandedFolders) this.expandedFolders = new Set();
    if (this.expandedFolders.has(path)) this.expandedFolders.delete(path);
    else this.expandedFolders.add(path);
    // 展开只是「看一眼」，别把用户滚到一半的列表位置弄没了
    const top = this.bodyEl ? this.bodyEl.scrollTop : 0;
    this.render();
    if (this.bodyEl) { try { this.bodyEl.scrollTop = top; } catch (e) { /* 忽略 */ } }
  },

  /* 列表模式的递归渲染：先文件夹（展开的紧跟着渲染它的子层），再本层文件 */
  renderTreeRows(container, notes, prefix, depth) {
    const { folders, files } = this.partitionNotes(notes, prefix);
    folders.sort((a, b) => a.name.localeCompare(b.name, 'zh'));
    let any = false;

    for (const f of folders) {
      any = true;
      const open = this.expandedFolders && this.expandedFolders.has(f.path);
      const sel = this.isMulti('folder', f);
      const row = container.createDiv({ cls: 'vwb-row vwb-glass' + (depth ? ' is-child' : '') + (sel ? ' is-multi' : '') });
      if (depth) row.style.paddingLeft = (13 + depth * 20) + 'px';
      row.setAttribute('data-path', f.path);
      row.setAttribute('title', f.path);

      const caret = row.createEl('span', { cls: 'vwb-caret' + (open ? ' is-open' : ''), text: open ? '▾' : '▸' });
      caret.setAttribute('title', open ? tr('ui.15') : tr('ui.16'));
      caret.addEventListener('click', (e) => {
        if (e && e.stopPropagation) e.stopPropagation();
        this.toggleFolderExpand(f.path);
      });

      const nm = row.createDiv({ cls: 'vwb-row-nm' });
      nm.createEl('span', { cls: 'vwb-folder', text: f.name });
      row.createDiv({ cls: 'vwb-row-mt', text: folderMeta(f, sel) });
      if (!f.count) row.addClass('is-empty');
      this.pushOrder('folder', f);
      this.bindDrag(row, f, 'folder');
      this.bindDropTarget(row, f, 'folder');
      row.addEventListener('click', (e) => this.onItemClick(e, f, 'folder'));
      row.addEventListener('contextmenu', (e) => {
        if (e && e.preventDefault) e.preventDefault();
        this.showItemMenu(e, f, 'folder');
      });

      if (open) {
        // 空文件夹展开后啥也没有，给一句说明，别让人以为点了没反应
        if (!f.count) {
          const tip = container.createDiv({ cls: 'vwb-row-tip' + (depth ? ' is-child' : '') });
          if (depth) tip.style.paddingLeft = (13 + (depth + 1) * 20) + 'px';
          tip.setText(tr('empty.folderEmptySub'));
        } else {
          this.renderTreeRows(container, notes, f.path, depth + 1);
        }
      }
    }

    const list = files.slice().sort(this.noteCmp());
    for (const n of list) {
      any = true;
      this.renderFileRow(container, n, depth);
    }
    return any;
  },

  /* 列表模式的一行文件 */
  renderFileRow(container, n, depth) {
    const ap = this.effectiveAppearance();
    const kind = fileKind(n.ext);
    const sel = this.isMulti('file', n);
    const row = container.createDiv({
      cls: 'vwb-row vwb-glass' + ((this.isSelected(n) || sel) ? ' is-sel' : '') +
        (sel ? ' is-multi' : '') + (depth ? ' is-child' : '')
    });
    if (depth) row.style.paddingLeft = (13 + depth * 20) + 'px';
    row.setAttribute('data-path', n.relPath);
    this.pushOrder('file', n);
    row.createEl('span', { cls: 'vwb-ico', text: iconFor(n.ext, kind) });
    row.createDiv({ cls: 'vwb-row-nm', text: dispName(n) });
    if (ap.showMeta) row.createDiv({ cls: 'vwb-row-mt', text: (kind === 'markdown' ? '' : kindLabel(kind) + ' · ') + fmtDate(n.mtime) + ' · ' + fmtSize(n.size || 0) });
    const eye = row.createDiv({ cls: 'vwb-card-eye', text: '👁' });
    eye.setAttribute('aria-label', tr('ui.17'));
    eye.addEventListener('click', (e) => {
      if (e && e.stopPropagation) e.stopPropagation();
      this.openFile(n, { forcePanel: true });
    });
    this.bindDrag(row, n, 'file');
    row.addEventListener('click', (e) => this.onItemClick(e, n, 'file'));
    row.addEventListener('contextmenu', (e) => {
      if (e && e.preventDefault) e.preventDefault();
      if (e && e.stopPropagation) e.stopPropagation();
      this.showItemMenu(e, n, 'file');
    });
    return this.markItem(row, 'file', n);
  },

  isSelected(n) {
    return !!(this.selectedNote && this.selectedNote.id === n.id);
  },

  /* 网格模式的文件夹卡片（右键 = 文件夹菜单） */
  renderFolderCard(grid, f) {
    const sel = this.isMulti('folder', f);
    const card = grid.createDiv({ cls: 'vwb-card vwb-glass' + (sel ? ' is-multi' : '') + (f.count ? '' : ' is-empty') });
    card.setAttribute('data-path', f.path);
    const fnm = card.createDiv({ cls: 'vwb-card-nm' });
    fnm.createEl('span', { cls: 'vwb-ico', text: '📁' });
    fnm.createEl('span', { cls: 'vwb-folder', text: f.name });
    // 笔记数挪到右上角小字；「最近一篇」替掉原来的静态 meta —— 文件夹变成有脉搏的入口
    fnm.createEl('span', { cls: 'vwb-card-cnt', text: (f.count ? f.count + tr('ui.133') : tr('ui.132')) + (sel ? tr('ui.134') : '') });
    if (f.latest) card.createDiv({ cls: 'vwb-card-mt vwb-card-latest', text: tr('common.recentNote', { name: dispName(f.latest) }) });
    if (f.count && f.week > 0) {
      // 活跃度条：本周修改数 / 总数
      const act = card.createDiv({ cls: 'vwb-folder-act' });
      act.setAttribute('title', tr('ui.18') + f.week + tr('ui.133'));
      const bar = act.createEl('i');
      bar.style.width = Math.max(6, Math.min(100, Math.round(f.week / f.count * 100))) + '%';
    }
    this.pushOrder('folder', f);
    this.bindDrag(card, f, 'folder');
    this.bindDropTarget(card, f, 'folder');
    card.addEventListener('click', (e) => this.onItemClick(e, f, 'folder'));
    card.addEventListener('contextmenu', (e) => {
      if (e && e.preventDefault) e.preventDefault();
      if (e && e.stopPropagation) e.stopPropagation();
      this.showItemMenu(e, f, 'folder');
    });
    return this.markItem(card, 'folder', f);
  },

  renderCard(grid, n) {
    const ap = this.effectiveAppearance();
    const kind = fileKind(n.ext);
    const sel = this.isMulti('file', n);
    const card = grid.createDiv({ cls: 'vwb-card vwb-glass' + ((this.isSelected(n) || sel) ? ' is-sel' : '') + (sel ? ' is-multi' : '') });
    this.pushOrder('file', n);

    // 图片：卡片顶部给缩略图（外部库大图不读盘，避免内存炸）
    if (kind === 'image') {
      const thumb = card.createDiv({ cls: 'vwb-card-thumb' });
      const url = n.external
        ? this.plugin.dataUrlOf(n.absPath, n.ext, MAX_THUMB)
        : this.resourceUrl(n);
      if (url) {
        const im = thumb.createEl('img');
        im.setAttribute('loading', 'lazy');
        im.setAttribute('alt', n.name);
        im.src = url;
      } else {
        thumb.createEl('span', { text: '🖼' });
      }
    }

    const nm = card.createDiv({ cls: 'vwb-card-nm' });
    nm.createEl('span', { cls: 'vwb-ico', text: iconFor(n.ext, kind) });
    // 名称拆成「基础名 + 浅色后缀」：一眼看出类型，又不抢名字的注意力
    const full = n.name || baseNameOf(n.relPath);
    const dot = String(full).lastIndexOf('.');
    const stem = dot > 0 ? full.slice(0, dot) : full;
    const suffix = dot > 0 ? full.slice(dot) : '';
    nm.createEl('span', { cls: 'vwb-nm-t', text: stem });
    if (suffix) nm.createEl('span', { cls: 'vwb-nm-ext', text: suffix });

    // 内容摘要：异步填充（卡片先出来，摘要随后到）
    if (ap.showSummary && kind === 'markdown') this.fillCardSummary(card, n);

    if (ap.showMeta) {
      const mt = card.createDiv({ cls: 'vwb-card-mt' });
      if (n.tags && n.tags.length) {
        for (const t of n.tags.slice(0, 2)) {
          const chip = mt.createEl('span', { cls: 'vwb-card-tag', text: t });
          chip.setAttribute('title', tr('ui.19'));
          chip.addEventListener('click', (e) => {
            if (e && e.stopPropagation) e.stopPropagation();
            this.searchByTag(t);
          });
        }
      } else {
        mt.createEl('span', { text: kind === 'markdown' ? tr('common.noTags') : kindLabel(kind) });
      }
      mt.createEl('span', { text: fmtDate(n.mtime) });
    }
    // 右上角「只看一眼」：强制走面板预览，不影响默认打开方式
    const eye = card.createDiv({ cls: 'vwb-card-eye', text: '👁' });
    eye.setAttribute('aria-label', tr('ui.17'));
    eye.addEventListener('click', (e) => {
      if (e && e.stopPropagation) e.stopPropagation();
      this.openFile(n, { forcePanel: true });
    });
    this.bindDrag(card, n, 'file');
    card.addEventListener('click', (e) => this.onItemClick(e, n, 'file'));
    card.addEventListener('contextmenu', (e) => {
      if (e && e.preventDefault) e.preventDefault();
      if (e && e.stopPropagation) e.stopPropagation();
      this.showItemMenu(e, n, 'file');
    });
    return this.markItem(card, 'file', n);
  },

  /* 卡片摘要：异步读文件头 → 纯文本截断 → 填进卡片。
   * 按 (relPath, mtime) 缓存，同一次滚动不会重复读盘。 */
  fillCardSummary(card, n) {
    if (!card || !n) return;
    const key = (n.external ? 'x:' : 'c:') + n.relPath + ':' + (n.mtime || 0);
    if (!this.summaryCache) this.summaryCache = new Map();
    const hit = this.summaryCache.get(key);
    if (hit) { this.applyCardSummary(card, hit); return; }
    (async () => {
      try {
        let text = '';
        if (n.external) {
          text = readHeadAbs(n.absPath || '', 4096);
        } else {
          const f = this.plugin.app.vault.getAbstractFileByPath(n.relPath);
          if (!f) return;
          text = await this.plugin.app.vault.read(f);
        }
        const ex = excerptOf(text, 120);
        this.summaryCache.set(key, ex);
        this.applyCardSummary(card, ex);
      } catch (e) { /* 读不到就算了，卡片照样能用 */ }
    })();
  },

  applyCardSummary(card, text) {
    if (!card || !text) return;
    try {
      if (!card.parentElement) return;   // 卡片已经被重绘掉了
      let el = null;
      if (typeof card.querySelector === 'function') el = card.querySelector('.vwb-card-sum');
      if (!el) el = card.createDiv({ cls: 'vwb-card-sum' });
      el.setText(text);
    } catch (e) { /* 忽略 */ }
  },

  /* 给条目元素留个标记：框选要按它算命中，空白右键要靠它判断「点的是不是条目」 */
  markItem(el, kind, item) {    if (!el) return el;
    el._vwbItem = { kind: kind, item: item, key: this.selKey(kind, item) };
    if (!this.itemEls) this.itemEls = [];
    this.itemEls.push(el);
    return el;
  },
  /* 顺着 DOM 往上找：这个节点是不是在某个条目里面 */
  itemElOf(node) {
    let n = node;
    while (n) {
      if (n._vwbItem) return n;
      n = n.parentElement;
    }
    return null;
  },
});
