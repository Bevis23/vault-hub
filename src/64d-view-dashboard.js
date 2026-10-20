/* -------------------------------------------------------------------------
 *  工作台视图 · 仪表盘入口 + 标签面板
 *  （本片段由 build.js 拼进 main.js，不要单独 require）
 * ------------------------------------------------------------------------- */
Object.assign(WorkbenchView.prototype, {
  /* ---------------------------------------------------- 仪表盘四个入口
   * 卡片只是「给文件列表设置条件」的入口，条件之间按 AND 叠加（搜索 / 文件夹 / 标签 / 本周）。
   * 只有「笔记总数」是重置入口 —— 它会把所有条件清空。 */
  clearAllFilters() {
    this.query = '';
    if (this.searchEl) this.searchEl.value = '';
    this.tagFilter = [];
    this.weekOnly = false;
    this.tagPanelOpen = false;
    this.crossHits = null;
    if (this.multiSel && this.multiSel.size) this.multiSel.clear();
    this.syncSearchUI();
  },

  dashAll() {
    this.clearAllFilters();
    this.folderPath = '';
    this.hist = [];
    this.histIdx = -1;
    this.render();
  },

  dashWeek() {
    this.weekOnly = true;
    this.tagPanelOpen = false;
    this.sort = 'mtime';
    this.plugin.settings.view.sort = this.sort;
    this.plugin.saveSettings();
    this.render();
  },

  /* 收集箱：库根目录下名为 inbox 的文件夹（不缓存 —— 它要实时反映文件夹存不存在） */
  inboxInfo() {
    const name = String((this.plugin.settings.view.inbox || 'inbox') || 'inbox').replace(/\/+$/, '');
    let exists = false;
    for (const f of (this.indexFolders || [])) {
      const p = normFolder(f && f.path != null ? f.path : f);
      if (p && p === name) { exists = true; break; }
    }
    return { name: name, exists: exists };
  },

  dashInbox() {
    const info = this.inboxInfo();
    if (!info.exists) {
      this.createFolder(info.name);   // 库根目录建一个收集箱
      return;
    }
    this.folderPath = info.name;
    this.hist = [];
    this.histIdx = -1;
    this.render();
  },

  toggleTagPanel() {
    this.tagPanelOpen = !this.tagPanelOpen;
    this.render();
  },

  /* 已选标签提示条：每个标签带 × 可单独移除，右侧「清除」 */
  renderTagBar() {
    const bar = this.areaEl.createDiv({ cls: 'vwb-tagbar vwb-glass' });
    bar.createEl('span', { cls: 'vwb-tagbar-t', text: tr('ui.51') });
    for (const t of this.tagFilter) {
      const chip = bar.createEl('span', { cls: 'vwb-card-tag', text: '#' + t });
      chip.setAttribute('title', tr('ui.52'));
      chip.addEventListener('click', (e) => {
        if (e && e.stopPropagation) e.stopPropagation();
        this.tagFilter = this.tagFilter.filter((x) => x !== t);
        this.render();
      });
    }
    const clear = bar.createEl('span', { cls: 'vwb-tagbar-x', text: tr('ui.53') });
    clear.addEventListener('click', (e) => {
      if (e && e.stopPropagation) e.stopPropagation();
      this.tagFilter = [];
      this.render();
    });
  },

  /* 标签列表面板：列表式（本期不做标签云）。标题 + 搜索框 + 标签行（#名 + 计数） */
  renderTagPanel(notes) {
    const s = this.computeStats(notes);
    const head = this.areaEl.createDiv({ cls: 'vwb-tagpanel' });
    const hd = head.createDiv({ cls: 'vwb-tagpanel-hd' });
    hd.createEl('span', { cls: 'vwb-tagpanel-t', text: tr('ui.54') });
    hd.createEl('span', { cls: 'vwb-tagpanel-sort', text: tr('ui.55') });
    const close = hd.createEl('span', { cls: 'vwb-tagpanel-x', text: '✕' });
    close.setAttribute('title', tr('ui.56'));
    close.addEventListener('click', () => { this.tagPanelOpen = false; this.render(); });

    const box = head.createDiv({ cls: 'vwb-tagpanel-search' });
    const input = box.createEl('input', { type: 'text', value: this.tagQuery || '' });
    input.className = 'vwb-in';
    input.placeholder = tr('ui.57');
    input.addEventListener('input', () => {
      this.tagQuery = String(input.value || '');
      this.renderTagList(head, s.tags);
    });
    input.addEventListener('keydown', (e) => {
      if (e && e.stopPropagation) e.stopPropagation();   // 别让 Obsidian 抢走输入
    });
    this.renderTagList(head, s.tags);
  },

  renderTagList(head, tags) {
    let listEl = null;
    if (typeof head.querySelector === 'function') listEl = head.querySelector('.vwb-tagpanel-list');
    if (listEl) { try { listEl.remove(); } catch (e) { /* 忽略 */ } }
    const list = head.createDiv({ cls: 'vwb-tagpanel-list' });
    const q = String(this.tagQuery || '').trim().toLowerCase();
    const shown = (tags || []).filter((t) => !q || t[0].toLowerCase().indexOf(q) >= 0);
    if (!shown.length) {
      list.createDiv({ cls: 'vwb-empty', text: q ? tr('ui.58') : tr('ui.59') });
      return;
    }
    for (const [name, count] of shown) {
      const row = list.createDiv({
        cls: 'vwb-tagrow' + (this.tagFilter.indexOf(name) >= 0 ? ' is-on' : '')
      });
      row.createEl('span', { cls: 'vwb-tagrow-n', text: '#' + name });
      row.createEl('span', { cls: 'vwb-tagrow-c', text: String(count) + tr('ui.133') });
      row.setAttribute('title', tr('ui.60'));
      row.addEventListener('click', (e) => {
        if (e && e.stopPropagation) e.stopPropagation();
        const add = !!(e && (e.ctrlKey || e.metaKey));
        if (add) {
          this.tagFilter = this.tagFilter.indexOf(name) >= 0
            ? this.tagFilter.filter((x) => x !== name)
            : this.tagFilter.concat([name]);
        } else {
          this.tagFilter = this.tagFilter.length === 1 && this.tagFilter[0] === name ? [] : [name];
        }
        this.render();
      });
    }
  },

  /* 按标签筛选：搜索框填入 #标签 并过滤文件区（卡片 / 预览面板的标签 chips 共用）。
   * 标签是当前库的概念，强制切回「当前库」范围（跨库全文索引里没有标签字段）。 */
  searchByTag(tag) {
    const name = String(tag || '').trim().replace(/^#+/, '').trim();
    if (!name) return;
    this.query = '#' + name;
    if (this.searchScope !== 'current') {
      this.searchScope = 'current';
      this.crossHits = null;
    }
    if (this.searchEl) this.searchEl.value = this.query;
    this.syncSearchUI();
    if (this.multiSel && this.multiSel.size) this.multiSel.clear();
    this.render();
    new Notice(tr('notice.filteredByTag', { tag: this.query }));
  },
});
