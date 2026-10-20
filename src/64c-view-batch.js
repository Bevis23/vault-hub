/* -------------------------------------------------------------------------
 *  工作台视图 · 多选 + 批量操作（复制/移动/标签/重命名）
 *  （本片段由 build.js 拼进 main.js，不要单独 require）
 * ------------------------------------------------------------------------- */
Object.assign(WorkbenchView.prototype, {
  /* --------------------------------------------------------------- 多选
   * Ctrl/⌘ + 点 = 加/减一项；Shift + 点 = 从上次那个连到这一个；普通点击 = 取消多选并打开。
   * 选中项存在 view.multiSel（Map）里，渲染时按 key 找回来。 */
  selKey(kind, item) {
    return (kind === 'folder' ? 'd:' : 'f:') + (kind === 'folder' ? item.path : item.relPath);
  },

  pushOrder(kind, item) {
    if (!this.flatOrder) this.flatOrder = [];
    this.flatOrder.push({ kind: kind, item: item });
  },

  isMulti(kind, item) {
    if (!this.multiSel || !this.multiSel.size || !item) return false;
    return this.multiSel.has(this.selKey(kind, item));
  },

  onItemClick(e, item, kind) {
    const mod = !!(e && (e.ctrlKey || e.metaKey));
    const shift = !!(e && e.shiftKey);
    if (mod) { this.toggleMulti(item, kind); return; }
    if (shift) { this.rangeMulti(item, kind); return; }
    // 普通点击已选项：按设置决定「打开并清空选择」还是「只取消这一项」
    if (this.multiSel && this.multiSel.size) {
      if (this.isMulti(kind, item) &&
          (this.plugin.settings.view.clickSelected || 'open') === 'deselect') {
        this.toggleMulti(item, kind);   // 只取消它，保留其余选择
        return;
      }
      // 其余情况：退出多选（接下来这次点击自己会重画列表，不用在这儿多渲染一次）
      this.multiSel.clear();
      this.selAnchor = -1;
      this.batchDelArm = false;
    }
    if (kind === 'folder') this.goTo(item.path);
    else this.openFile(item);
  },

  toggleMulti(item, kind) {
    if (!this.multiSel) this.multiSel = new Map();
    const key = this.selKey(kind, item);
    if (this.multiSel.has(key)) {
      this.multiSel.delete(key);
    } else {
      this.multiSel.set(key, { kind: kind, item: item });
      this.selAnchor = (this.flatOrder || []).findIndex((x) => this.selKey(x.kind, x.item) === key);
    }
    if (!this.multiSel.size) this.batchDelArm = false;
    this.afterMultiChange();
  },

  rangeMulti(item, kind) {
    const key = this.selKey(kind, item);
    const order = this.flatOrder || [];
    const to = order.findIndex((x) => this.selKey(x.kind, x.item) === key);
    if (to < 0) return;
    if (!this.multiSel) this.multiSel = new Map();
    let from = this.selAnchor;
    if (from < 0 || from >= order.length) {
      // 没有锚点（之前没点过任何东西）时：**只选当前这一项**，并把它记为锚。
      // 以前是「从头选到这儿」—— 用户只想要第 5、6 项，结果 1-4 全进来了，很诡异
      this.multiSel.set(key, { kind: kind, item: item });
      this.selAnchor = to;
      this.batchDelArm = false;
      this.afterMultiChange();
      return;
    }
    const a = Math.min(from, to);
    const b = Math.max(from, to);
    for (let i = a; i <= b; i++) {
      const x = order[i];
      this.multiSel.set(this.selKey(x.kind, x.item), { kind: x.kind, item: x.item });
    }
    this.selAnchor = to;
    this.afterMultiChange();
  },

  /* 多选变了要重画一遍 —— 但别把用户滚到一半的列表位置弄没了 */
  afterMultiChange() {
    this.batchDelArm = false;
    const top = this.bodyEl ? this.bodyEl.scrollTop : 0;
    this.render();
    if (this.bodyEl) { try { this.bodyEl.scrollTop = top; } catch (e) { /* 忽略 */ } }
  },

  clearMulti() {
    if (this.multiSel) this.multiSel.clear();
    this.selAnchor = -1;
    this.batchDelArm = false;
    this.render();
  },

  batchItems() {
    return this.multiSel ? Array.from(this.multiSel.values()) : [];
  },

  /* 多选操作条：钉在文件区最上面
   * ⚠ 它挂在 areaEl 内部，而 areaEl 绑了 mousedown 做框选。如果不阻止冒泡，
   * 点击这些按钮会触发框选流程，松开时选择被清空、按钮重建，click 事件就丢了 ——
   * 这就是「批量条按钮点了没反应」的根因。 */
  renderBatchBar() {
    const items = this.batchItems();
    const bar = this.areaEl.createDiv({ cls: 'vwb-batch vwb-glass' });
    bar.addEventListener('mousedown', (e) => { if (e && e.stopPropagation) e.stopPropagation(); });
    bar.addEventListener('click', (e) => { if (e && e.stopPropagation) e.stopPropagation(); });
    bar.createDiv({ cls: 'vwb-batch-n', text: tr('batch.selected', { n: items.length }) });
    const btn = (label, fn, extraCls) => {
      const b = bar.createEl('button', { cls: 'vwb-btn vwb-btn-sm' + (extraCls ? ' ' + extraCls : ''), text: label });
      b.addEventListener('click', (e) => {
        if (e && e.stopPropagation) e.stopPropagation();
        fn();
      });
      return b;
    };
    btn(tr('batch.copyPath'), () => this.batchCopyPath());
    btn(tr('batch.copyLinks'), () => this.batchCopyLinks());
    btn(tr('batch.tag'), () => this.batchTagPrompt());
    btn(tr('batch.rename'), () => this.batchRenamePrompt());
    btn(tr('batch.moveTo'), () => this.showMovePicker());
    btn(tr('batch.copyTo'), () => this.showCopyPicker());
    if (this.batchDelArm) {
      btn(tr('batch.deleteConfirm', { n: items.length }), () => this.batchDelete(), 'is-danger');
      btn(tr('common.cancel'), () => { this.batchDelArm = false; this.render(); });
    } else {
      btn(tr('batch.delete'), () => { this.batchDelArm = true; this.render(); });
    }
    btn(tr('batch.clear'), () => this.clearMulti());
  },

  batchCopyPath() {
    const items = this.batchItems();
    const lines = items.map((x) => x.kind === 'folder'
      ? this.absPathOf(x.item.path)
      : (x.item.absPath || this.absPathOf(x.item.relPath)));
    this.copyText(lines.join('\n'), tr('notice.copiedPaths', { n: lines.length }));
  },

  batchCopyLinks() {
    const items = this.batchItems();
    const lines = [];
    for (const x of items) {
      for (const l of this.wikiLinksFor(x.item, x.kind)) lines.push(l);
    }
    if (!lines.length) { new Notice(tr('ui.28')); return; }
    this.copyText(lines.join('\n'), tr('notice.copiedLinks', { n: lines.length }));
  },

  /* 批量打标：输入标签 → 合并进每篇笔记的 frontmatter（不覆盖已有标签） */
  batchTagPrompt() {
    const items = this.batchItems();
    const mdItems = items.filter((x) => x.kind === 'folder' || fileKind(x.item.ext) === 'markdown');
    if (!mdItems.length) { new Notice(tr('ui.29')); return; }
    this.promptText({
      title: tr('ui.30') + mdItems.length + tr('ui.31'),
      desc: tr('ui.32'),
      placeholder: tr('ui.33'),
      okText: tr('ui.34'),
      onOk: (text) => this.batchTag(mdItems, parseTags(text))
    });
  },

  async batchTag(items, tags) {
    if (!tags.length) { new Notice(tr('ui.35')); return; }
    const vault = this.selectedVaultInfo();
    const external = !!(vault && this.plugin.indexOf(vault.path).external);
    let done = 0, failed = 0, skipped = 0;
    for (const x of items) {
      if (x.kind === 'folder') {
        // 文件夹：打它下面所有 .md
        const prefix = String(x.item.path || '') + '/';
        const sub = (this.plugin.indexOf(vault.path).files || [])
          .filter((n2) => String(n2.relPath).indexOf(prefix) === 0 && fileKind(n2.ext) === 'markdown');
        for (const n2 of sub) {
          const r = await this.tagOneFile(n2, tags, external, vault);
          if (r === 'ok') done++; else if (r === 'skip') skipped++; else failed++;
        }
        continue;
      }
      const r = await this.tagOneFile(x.item, tags, external, vault);
      if (r === 'ok') done++; else if (r === 'skip') skipped++; else failed++;
    }
    this.plugin.externalCache = {};
    if (this.plugin.searchIdxCache) this.plugin.searchIdxCache = {};
    this.render();
    new Notice(tr('notice.tagged', { n: done }) +
      (skipped ? tr('notice.skipNotes', { n: skipped }) : '') +
      (failed ? tr('notice.failNotes', { n: failed }) : ''));
  },

  async tagOneFile(n, tags, external, vault) {
    try {
      let old;
      let write;
      if (external) {
        const abs = n.absPath || pathMod.join(vault.path, n.relPath);
        old = fs.readFileSync(abs, 'utf8');
        write = (c) => { fs.writeFileSync(abs, c); };
      } else {
        const app = this.plugin.app;
        const file = app.vault.getAbstractFileByPath(n.relPath);
        if (!file) return 'fail';
        old = await app.vault.read(file);
        write = async (c) => { await app.vault.modify(file, c); };
      }
      const next = addTagsToContent(old, tags);
      if (next == null || next === old) return 'skip';
      await write(next);
      this.plugin.logOp({ type: 'tag', path: n.relPath, tags: tags.join(', ') });
      return 'ok';
    } catch (e) {
      return 'fail';
    }
  },

  /* 批量重命名：前缀 / 查找替换 两种模式 */
  batchRenamePrompt() {
    const items = this.batchItems();
    if (!items.length) return;
    const host = this.contentEl.createDiv({ cls: 'vwb-dlg vwb-glass' });
    host.createDiv({ cls: 'vwb-dlg-t', text: tr('ui.36') + items.length + tr('ui.234') });
    let mode = 'prefix';
    const modeRow = host.createDiv({ cls: 'vwb-dlg-modes' });
    const mkMode = (id, label) => {
      const chip = modeRow.createDiv({ cls: 'vwb-mode' + (id === mode ? ' is-on' : ''), text: label });
      chip.addEventListener('click', () => {
        mode = id;
        for (const c of modeRow.children) {
          try { c.classList.toggle('is-on', c === chip); } catch (e) { /* 忽略 */ }
        }
        findIn.style.display = id === 'replace' ? '' : 'none';
        input.placeholder = id === 'prefix' ? tr('ui.37') : tr('ui.38');
      });
    };
    mkMode('prefix', tr('ui.39'));
    mkMode('replace', tr('ui.40'));
    const findIn = host.createEl('input', { type: 'text' });
    findIn.className = 'vwb-in';
    findIn.placeholder = tr('ui.41');
    findIn.style.display = 'none';
    const input = host.createEl('input', { type: 'text' });
    input.className = 'vwb-in';
    input.placeholder = tr('ui.37');
    const foot = host.createDiv({ cls: 'vwb-dlg-f' });
    foot.createEl('button', { cls: 'vwb-btn vwb-btn-sm vwb-btn-pri', text: tr('ui.42') })
      .addEventListener('click', () => {
        const v1 = String(findIn.value || '').trim();
        const v2 = String(input.value || '');
        this.closeDialog(host);
        if (mode === 'replace' && !v1) { new Notice(tr('ui.43')); return; }
        this.batchRename(items, mode, v1, v2);
      });
    foot.createEl('button', { cls: 'vwb-btn vwb-btn-sm', text: tr('ui.44') })
      .addEventListener('click', () => this.closeDialog(host));
    setTimeout(() => { try { input.focus(); } catch (e) { /* 忽略 */ } }, 30);
  },

  async batchRename(items, mode, arg1, arg2) {
    const vault = this.selectedVaultInfo();
    const external = !!(vault && this.plugin.indexOf(vault.path).external);
    const app = this.plugin.app;
    let done = 0, skipped = 0, failed = 0;
    for (const x of items) {
      const isFolder = x.kind === 'folder';
      const rel = isFolder ? x.item.path : x.item.relPath;
      const name = baseNameOf(rel);
      const dir = rel.indexOf('/') >= 0 ? rel.slice(0, rel.lastIndexOf('/')) : '';
      let newName;
      if (mode === 'prefix') {
        newName = String(arg2 || '') + name;
      } else {
        if (!arg1 || name.indexOf(arg1) < 0) { skipped++; continue; }
        newName = name.split(arg1).join(arg2);
      }
      if (!newName || newName === name) { skipped++; continue; }
      const dest = dir ? dir + '/' + newName : newName;
      if (external) {
        if (fs.existsSync(pathMod.join(vault.path, dest))) { skipped++; continue; }
        const r = this.plugin.applyExtRename(vault.path, rel, dest, isFolder);
        if (r.ok) done++; else failed++;
        continue;
      }
      const file = app.vault.getAbstractFileByPath(rel);
      if (!file) { skipped++; continue; }
      try {
        if (app.vault.getAbstractFileByPath(dest)) { skipped++; continue; }
        if (app.fileManager && typeof app.fileManager.renameFile === 'function') {
          await app.fileManager.renameFile(file, dest); // 双链一并更新
        } else {
          await app.vault.rename(file, dest);
        }
        this.plugin.logOp({ type: 'rename', path: rel, to: dest });
        done++;
      } catch (e) {
        failed++;
      }
    }
    this.render();
    new Notice(tr('notice.renamed', { n: done }) +
      (skipped ? tr('notice.skipItems', { n: skipped }) : '') +
      (failed ? tr('notice.failItems', { n: failed }) : ''));
  },

  /* 移动到…：浮层里列全库的文件夹，点一个就把选中的项都搬过去。
   * 走 Obsidian 的 renameFile，所以库内已有的双链会跟着更新。
   * items 可传入（右键单文件移动时用）；不传 = 移动当前已选集合。 */
  showMovePicker(items) {
    this.closeMovePicker();
    if (!this.mainEl) return;
    const list = items || this.batchItems();
    if (!list.length) return;
    const host = this.mainEl.createDiv({ cls: 'vwb-move vwb-glass' });
    this.moveEl = host;
    host.createDiv({ cls: 'vwb-move-t', text: tr('ui.45') + list.length + tr('ui.46') });
    const lst = host.createDiv({ cls: 'vwb-move-list' });
    const cur = this.folderPath || '';
    for (const f of this.vaultFolderList()) {
      const row = lst.createDiv({ cls: 'vwb-move-i' + (f ? '' : ' is-root') + (f === cur ? ' is-cur' : '') });
      row.createEl('span', { cls: 'vwb-folder', text: f ? '📁 ' + baseNameOf(f) : tr('ui.47') });
      if (f) row.createEl('span', { cls: 'vwb-move-path', text: f });
      row.addEventListener('click', (e) => {
        if (e && e.stopPropagation) e.stopPropagation();
        this.closeMovePicker();
        this.moveItemsTo(list, f);
      });
    }
    const foot = host.createDiv({ cls: 'vwb-move-foot' });
    foot.createEl('button', { cls: 'vwb-btn vwb-btn-sm', text: tr('ui.44') })
      .addEventListener('click', () => this.closeMovePicker());
  },

  /* 复制到别的库：只复制不移动 —— 原件留在原库，所以不会造成跨库断链
   * （这是「跨库移动」的安全替代方案，移动我们永远不做） */
  showCopyPicker() {
    this.closeMovePicker();
    if (!this.mainEl) return;
    const items = this.batchItems();
    if (!items.length) return;
    const host = this.mainEl.createDiv({ cls: 'vwb-move vwb-glass' });
    this.moveEl = host;
    host.createDiv({ cls: 'vwb-move-t', text: tr('ui.45') + items.length + tr('ui.48') });
    const list = host.createDiv({ cls: 'vwb-move-list' });
    const targets = this.plugin.discoverVaults()
      .filter((v) => !v.current && v.isVault !== false);
    if (!targets.length) {
      list.createDiv({ cls: 'vwb-move-i', text: tr('ui.49') });
    }
    for (const v of targets) {
      const row = list.createDiv({ cls: 'vwb-move-i' });
      row.createEl('span', { cls: 'vwb-folder', text: '🗄 ' + v.name });
      row.createEl('span', { cls: 'vwb-move-path', text: v.path });
      row.addEventListener('click', (e) => {
        if (e && e.stopPropagation) e.stopPropagation();
        this.batchCopyTo(v);
      });
    }
    const foot = host.createDiv({ cls: 'vwb-move-foot' });
    foot.createEl('button', { cls: 'vwb-btn vwb-btn-sm', text: tr('ui.44') })
      .addEventListener('click', () => this.closeMovePicker());
  },

  batchCopyTo(v) {
    this.closeMovePicker();
    const items = this.batchItems().map((x) => ({
      relPath: x.kind === 'folder' ? x.item.path : x.item.relPath,
      absPath: x.kind === 'folder' ? this.absPathOf(x.item.path) : (x.item.absPath || this.absPathOf(x.item.relPath)),
      kind: x.kind
    }));
    this.confirmBox({
      title: tr('picker.copyToTitle', { name: v.name }),
      desc: tr('picker.copyToDesc', { n: items.length }),
      okText: tr('picker.copyN', { n: items.length }),
      onOk: () => {
        const r = this.plugin.copyAcrossVault(items, v.path, '');
        if (!r.ok || !r.done.length) { new Notice(r.reason || tr('notice.copyNone')); return; }
        new Notice(tr('notice.copiedTo', { n: r.done.length, name: v.name }) +
          (r.reason ? '（' + r.reason + '）' : ''), 8000);
        this.clearMulti();
        this.render();
      }
    });
  },

  closeMovePicker() {
    const el = this.moveEl;
    this.moveEl = null;
    if (!el) return;
    try {
      if (typeof el.remove === 'function') el.remove();
      else if (el.parentElement) el.parentElement.removeChild(el);
    } catch (e) { /* 忽略 */ }
  },
});
