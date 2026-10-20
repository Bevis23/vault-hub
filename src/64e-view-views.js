/* -------------------------------------------------------------------------
 *  工作台视图 · 拖拽 + 智能视图菜单
 *  （本片段由 build.js 拼进 main.js，不要单独 require）
 * ------------------------------------------------------------------------- */
Object.assign(WorkbenchView.prototype, {
  /* 让卡片 / 行可以被拖 */
  bindDrag(el, item, kind) {
    if (!el) return;
    el.setAttribute('draggable', 'true');
    el.addEventListener('dragstart', (e) => this.onItemDragStart(e, item, kind));
    el.addEventListener('dragend', () => this.onItemDragEnd());
  },

  /* 文件夹作为投放目标 */
  bindDropTarget(el, item, kind) {
    if (!el || kind !== 'folder') return;
    el.addEventListener('dragover', (e) => this.onFolderDragOver(e, el));
    el.addEventListener('dragleave', () => this.onFolderDragLeave(el));
    el.addEventListener('drop', (e) => this.onFolderDrop(e, item));
  },

  onItemDragStart(e, item, kind) {
    if (!e || !e.dataTransfer) return;
    const inSelection = this.isMulti(kind, item);
    const items = (inSelection && this.multiSel && this.multiSel.size)
      ? Array.from(this.multiSel.values())
      : [{ kind: kind, item: item }];
    this._dragItems = items;
    try {
      e.dataTransfer.setData('text/plain', this.selKey(kind, item));
      e.dataTransfer.effectAllowed = 'move';
    } catch (e2) { /* 忽略 */ }
    if (this.areaEl) this.areaEl.addClass('is-dragging');
  },

  onItemDragEnd() {
    this._dragItems = null;
    if (this.areaEl) this.areaEl.removeClass('is-dragging');
    try {
      for (const el of this.itemEls || []) el.removeClass('is-dragover');
    } catch (e) { /* 忽略 */ }
  },

  onFolderDragOver(e, el) {
    if (e && e.preventDefault) e.preventDefault();
    if (e && e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    try { el.addClass('is-dragover'); } catch (e2) { /* 忽略 */ }
  },

  onFolderDragLeave(el) {
    try { el.removeClass('is-dragover'); } catch (e2) { /* 忽略 */ }
  },

  async onFolderDrop(e, folderItem) {
    if (e && e.preventDefault) e.preventDefault();
    if (e && e.stopPropagation) e.stopPropagation();
    const items = this._dragItems;
    this._dragItems = null;
    if (this.areaEl) this.areaEl.removeClass('is-dragging');
    try { for (const el of this.itemEls || []) el.removeClass('is-dragover'); } catch (e2) { /* 忽略 */ }
    if (!items || !items.length) return;
    const target = folderItem.path;
    // 不能拖到自己和自己的子文件夹里
    const valid = items.filter((x) => {
      if (x.kind !== 'file' && x.kind !== 'folder') return false;
      const rel = x.kind === 'folder' ? x.item.path : x.item.relPath;
      if (rel === target) return false;
      if (x.kind === 'folder' && target.indexOf(rel + '/') === 0) return false;
      return true;
    });
    if (!valid.length) return;
    await this.moveItemsTo(valid, target);
  },

  /* 智能视图：保存 / 应用筛选条件的命名入口 */
  showViewsMenu(ev) {
    this.closeViewsMenu();
    if (!this.mainEl) return;
    const host = this.contentEl.createDiv({ cls: 'vwb-views vwb-glass' });
    this.viewsEl = host;
    host.addEventListener('mousedown', (e) => { if (e && e.stopPropagation) e.stopPropagation(); });
    const views = this.plugin.settings.smartViews || [];
    host.createDiv({ cls: 'vwb-views-t', text: tr('ui.62') });
    const list = host.createDiv({ cls: 'vwb-views-list' });
    if (!views.length) {
      list.createDiv({ cls: 'vwb-views-empty', text: tr('views.empty') });
    }
    views.forEach((v, i) => {
      const row = list.createDiv({ cls: 'vwb-views-i' });
      row.createEl('span', { cls: 'vwb-folder', text: v.name });
      const desc = [
        v.query ? tr('views.searchTagQ', { q: v.query }) : '',
        v.scope === 'all' ? tr('ui.63') : '',
        { mtime: tr('ui.64'), name: tr('ui.65'), size: tr('ui.66') }[v.sort] || ''
      ].filter(Boolean).join(' · ');
      if (desc) row.createEl('span', { cls: 'vwb-views-d', text: desc });
      row.setAttribute('title', tr('ui.67'));
      row.addEventListener('click', (e) => {
        if (e && e.stopPropagation) e.stopPropagation();
        this.applySmartView(v);
      });
      const del = row.createEl('span', { cls: 'vwb-views-x', text: '✕' });
      del.setAttribute('title', tr('ui.68'));
      del.addEventListener('click', (e) => {
        if (e && e.stopPropagation) e.stopPropagation();
        views.splice(i, 1);
        this.plugin.saveSettings();
        this.closeViewsMenu();
        new Notice(tr('ui.69') + v.name);
      });
    });
    const foot = host.createDiv({ cls: 'vwb-views-f' });
    foot.createEl('button', { cls: 'vwb-btn vwb-btn-sm vwb-btn-pri', text: tr('ui.70') })
      .addEventListener('click', () => {
        this.closeViewsMenu();
        this.promptText({
          title: tr('ui.71'),
          placeholder: tr('ui.72'),
          okText: tr('ui.73'),
          onOk: (name) => {
            if (!name) return;
            views.push({
              name: name,
              query: this.query || '',
              sort: this.sort || 'mtime',
              scope: this.searchScope || 'current',
              folder: this.folderPath || ''
            });
            this.plugin.saveSettings();
            new Notice(tr('ui.74') + name);
          }
        });
      });
    foot.createEl('button', { cls: 'vwb-btn vwb-btn-sm', text: tr('ui.75') })
      .addEventListener('click', () => this.closeViewsMenu());
    // 定位：贴按钮下方
    try {
      const r = (ev && ev.target && ev.target.getBoundingClientRect) ? ev.target.getBoundingClientRect() : null;
      const rootR = this.contentEl.getBoundingClientRect();
      if (r && rootR) {
        host.style.position = 'absolute';
        host.style.left = (r.left - rootR.left) + 'px';
        host.style.top = (r.bottom - rootR.top + 4) + 'px';
      }
    } catch (e) { /* 忽略 */ }
  },

  closeViewsMenu() {
    const el = this.viewsEl;
    this.viewsEl = null;
    this.closeDialog(el);
  },

  applySmartView(v) {
    if (!v) return;
    this.closeViewsMenu();
    this.query = String(v.query || '');
    this.sort = v.sort || 'mtime';
    this.searchScope = v.scope || 'current';
    this.crossHits = null;
    this.folderPath = String(v.folder || '');
    if (this.searchEl) this.searchEl.value = this.query;
    this.syncSearchUI();
    this.multiSel.clear();
    this.render();
    new Notice(tr('ui.76') + v.name);
  },
});
