/* -------------------------------------------------------------------------
 *  工作台视图 · 目录导航：前进 / 后退 / 上一级 / 搜索
 *  （本片段由 build.js 拼进 main.js，不要单独 require）
 * ------------------------------------------------------------------------- */
Object.assign(WorkbenchView.prototype, {
  resetHist() {
    this.hist = [this.folderPath || ''];
    this.histIdx = 0;
  },
  pushHist(path) {
    if (!Array.isArray(this.hist) || !this.hist.length) this.resetHist();
    if (this.hist[this.histIdx] === path) return;
    // 正好是「前进」的下一站 —— 直接往前走，不新增记录
    if (this.hist[this.histIdx + 1] === path) { this.histIdx++; return; }
    // 走到新分支时丢掉原来的「前进」记录
    if (this.histIdx < this.hist.length - 1) this.hist.length = this.histIdx + 1;
    this.hist.push(path);
    if (this.hist.length > 60) this.hist.shift();
    this.histIdx = this.hist.length - 1;
  },
  /* 统一的目录跳转入口（面包屑 / 文件夹卡片 / 上一级都走这里） */
  goTo(path) {
    path = path || '';
    this.query = '';
    if (this.searchEl) this.searchEl.value = '';
    this.syncSearchUI();
    this.pushHist(path);
    this.folderPath = path;
    this.render();
  },
  canBack() { return Array.isArray(this.hist) && this.histIdx > 0; },
  canFwd() { return Array.isArray(this.hist) && this.histIdx < this.hist.length - 1; },
  goBack() {
    if (!this.canBack()) { new Notice(tr('notice.navStart')); return; }
    this.histIdx--;
    this.folderPath = this.hist[this.histIdx];
    this.query = '';
    if (this.searchEl) this.searchEl.value = '';
    this.syncSearchUI();
    this.render();
  },
  goFwd() {
    if (!this.canFwd()) { new Notice(tr('notice.navEnd')); return; }
    this.histIdx++;
    this.folderPath = this.hist[this.histIdx];
    this.query = '';
    if (this.searchEl) this.searchEl.value = '';
    this.syncSearchUI();
    this.render();
  },
  /* 返回上一级：如果上一级正是「后退」的那一站就直接后退，
   * 这样再按 Alt+→ 能前进回刚才的子目录；否则当作一次新的跳转记进历史。
   */
  goUp() {
    if (!this.folderPath) return;
    const segs = this.folderPath.split('/');
    segs.pop();
    const parent = segs.join('/');
    if (this.canBack() && this.hist[this.histIdx - 1] === parent) { this.goBack(); return; }
    this.goTo(parent);
  },

  syncSearchUI() {
    if (!this.searchClearEl) return;
    const has = !!(this.searchEl && this.searchEl.value);
    this.searchClearEl.className = 'vwb-search-x' + (has ? ' is-on' : '');
  },

  clearSearch(doRender) {
    this.query = '';
    this.crossHits = null;
    if (this.searchEl) this.searchEl.value = '';
    this.syncSearchUI();
    if (doRender) this.render();
  },

  selectedVaultInfo() {
    const list = this.plugin.discoverVaults();
    return list.find((v) => v.id === this.selectedVault) || list[0] || null;
  },

  /* 仪表盘四个卡片的全部数字（只统计当前选中的库）。
   * 笔记口径 = .md / .canvas / .excalidraw（含 .excalidraw.md），附件不计入笔记。
   * 结果按「库 + 文件数 + 最大 mtime」缓存：文件变了才重算，避免上千条时每次渲染都全量遍历。 */
  computeStats(notes) {
    const vault = this.selectedVaultInfo();
    const root = vault ? vault.path : '';
    let maxMt = 0;
    const foldersSeen = new Set();
    for (const n of notes) {
      if ((n.mtime || 0) > maxMt) maxMt = n.mtime || 0;
      foldersSeen.add(normFolder(n.folder));
    }
    // key 里带上「涉及多少不同文件夹」：文件移进/移出收集箱时 mtime 不变、
    // 总数也不变，只有文件夹分布会变 —— 否则收集箱数字不会实时更新
    const key = root + '|' + notes.length + '|' + maxMt + '|' +
      foldersSeen.size + '|' + ((this.indexFolders || []).length);
    if (this.dashCache && this.dashCache.key === key) return this.dashCache.value;
    const weekAgo = Date.now() - 7 * 86400000;
    let mdN = 0, canvasN = 0, excaliN = 0, week = 0;
    const tagCount = new Map();
    for (const n of notes) {
      const nm = String(n.name || '');
      const ext = String(n.ext || '').toLowerCase();
      const isExcali = nm.toLowerCase().endsWith('.excalidraw.md') || ext === '.excalidraw';
      const isNote = ext === '.md' || ext === '.canvas' || ext === '.excalidraw';
      if (!isNote) continue;
      if (isExcali) excaliN++;
      else if (ext === '.canvas') canvasN++;
      else mdN++;
      if ((n.mtime || 0) > weekAgo) week++;
      for (const t of (n.tags || [])) {
        const k = String(t || '').trim().replace(/^#+/, '');
        if (!k) continue;
        tagCount.set(k, (tagCount.get(k) || 0) + 1);
      }
    }
    // 收集箱：库根目录下名为 inbox 的文件夹的**第一层**（不递归）
    const inboxName = (this.plugin.settings.view.inbox || 'inbox').replace(/\/+$/, '');
    let inboxExists = false;
    let inboxCount = 0;
    for (const f of (this.indexFolders || [])) {
      const p = normFolder(f && f.path != null ? f.path : f);
      if (p && p === inboxName) { inboxExists = true; break; }
    }
    if (inboxExists) {
      for (const n of notes) {
        if (normFolder(n.folder) === inboxName) inboxCount++;
      }
    }
    const tagSorted = Array.from(tagCount.entries())
      .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0], 'zh'));
    const value = {
      total: mdN + canvasN + excaliN,
      md: mdN, canvas: canvasN, excali: excaliN,
      week: week,
      inboxExists: inboxExists,
      inbox: inboxCount,
      inboxName: inboxName,
      tagTotal: tagSorted.length,
      tagTop: tagSorted.slice(0, 3),
      tags: tagSorted
    };
    this.dashCache = { key: key, value: value };
    return value;
  }

});
