/* -------------------------------------------------------------------------
 *  工作台视图 · 文件夹列表 + 回收站 + 打开入口 + 新建菜单
 *  （本片段由 build.js 拼进 main.js，不要单独 require）
 * ------------------------------------------------------------------------- */
Object.assign(WorkbenchView.prototype, {
  /* 当前库里有哪几层文件夹（含中间层），给「移动到…」当选项 */
  vaultFolderList() {
    const vault = this.selectedVaultInfo();
    if (!vault) return [''];
    const set = new Set(['']);
    for (const n of (this.plugin.indexOf(vault.path).files || [])) {
      const f = String(n.folder || '');
      if (!f) continue;
      let acc = '';
      for (const seg of f.split('/')) { acc = acc ? acc + '/' + seg : seg; set.add(acc); }
    }
    return Array.from(set).sort((a, b) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b, 'zh')));
  },

  async batchMoveTo(dir) {
    this.closeMovePicker();
    await this.moveItemsTo(this.batchItems(), dir);
  },

  /* 批量移动 / 拖拽归档的核心实现：把 items 移动到 target 文件夹下
   * items: [{ kind, item }]；dir 是目标文件夹路径（空字符串 = 库根） */
  async moveItemsTo(items, dir) {
    const app = this.plugin.app;
    const vault = this.selectedVaultInfo();
    const external = !!(vault && this.plugin.indexOf(vault.path).external);
    const root = vault ? vault.path : '';
    let moved = 0;
    let skipped = 0;
    for (const x of items) {
      const isFolder = x.kind === 'folder';
      const rel = isFolder ? x.item.path : x.item.relPath;
      const name = baseNameOf(rel);
      const dest = dir ? dir + '/' + name : name;
      // 已经在目标位置、或者想把文件夹搬进它自己里面 —— 跳过
      if (dest === rel) { skipped++; continue; }
      if (isFolder && dir && (dir === rel || dir.indexOf(rel + '/') === 0)) { skipped++; continue; }
      if (external) {
        // 外部库：走我们自己的重命名通道（挪文件 + 把引用它的双链改掉）
        if (fs.existsSync(pathMod.join(root, dest))) { skipped++; continue; }
        const r = this.plugin.applyExtRename(root, rel, dest, isFolder);
        if (r.ok) moved++; else skipped++;
        continue;
      }
      const file = (app && app.vault && app.vault.getAbstractFileByPath)
        ? app.vault.getAbstractFileByPath(rel) : null;
      if (!file) { skipped++; continue; }
      try {
        if (app.vault.getAbstractFileByPath(dest)) { skipped++; continue; }
        if (app.fileManager && typeof app.fileManager.renameFile === 'function') {
          await app.fileManager.renameFile(file, dest); // 库内双链会一并更新
        } else {
          await app.vault.rename(file, dest);
        }
        this.plugin.logOp({ type: 'move', path: rel, to: dest });
        moved++;
      } catch (e) {
        skipped++;
      }
    }
    if (this.selectedNote && this.multiSel && this.multiSel.size) {
      const hit = items.find((x) => x.kind === 'file' && x.item.relPath === this.selectedNote.relPath);
      if (hit) this.closePreview();
    }
    if (this.multiSel) this.multiSel.clear();
    this.batchDelArm = false;
    this.render();
    new Notice(tr('notice.moved', { n: moved }) + (skipped ? tr('notice.movedSkipped', { n: skipped }) : ''));
  },

  async batchDelete() {
    const items = this.batchItems();
    const vault = this.selectedVaultInfo();
    // ⚠️ 外部库的东西不在 app.vault 里（getAbstractFileByPath 只认当前打开的库）——
    // 之前批量删除没分流，选 3 项只删掉 1 项就是这个原因。
    const external = !!(vault && this.plugin.indexOf(vault.path).external);
    let done = 0;
    let failed = 0;
    let reason = '';
    for (const x of items) {
      const isFolder = x.kind === 'folder';
      const rel = isFolder ? x.item.path : x.item.relPath;
      if (external) {
        const r = this.plugin.extDelete(vault.path, rel, isFolder);
        if (r.ok) done++;
        else { failed++; reason = reason || r.reason; }
      } else {
        const r = await this.deleteOneLocal(rel, isFolder, true);
        if (r.ok) done++;
        else { failed++; reason = reason || r.reason; }
      }
    }
    const sel = this.selectedNote;
    if (sel && items.some((x) => (x.kind === 'folder'
      ? String(sel.relPath).indexOf(x.item.path + '/') === 0
      : sel.relPath === x.item.relPath))) {
      this.closePreview();
    }
    this.multiSel.clear();
    this.selAnchor = -1;
    this.batchDelArm = false;
    this.render();
    new Notice(tr('notice.deleted', { n: done }) + (failed ? tr('notice.deletedFail', { n: failed }) : '') + tr('notice.deletedHint'));
  },

  absPathOf(rel) {
    if (!rel) return '';
    const vault = this.selectedVaultInfo();
    if (!vault) return rel;
    return String(vault.path).replace(/\\/g, '/') + '/' + rel;
  },

  copyPathToClipboard(p) {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(p);
      }
    } catch (e) { /* 忽略 */ }
    new Notice(tr('ui.77') + p);
  },

  async runItemCmd(id, item, kind) {
    this.closeEditorMenu();
    if (!item) return;
    const isFolder = kind === 'folder';
    const rel = isFolder ? (item.path || '') : item.relPath;
    const abs = isFolder ? this.absPathOf(rel) : (item.absPath || this.absPathOf(rel));
    // 右键时被点的这一项在不在多选集合里？在且集合大于 1 → 这些命令批量作用于已选项
    const inSelection = this.isMulti(kind, item);
    const bulk = inSelection && this.multiSel && this.multiSel.size > 1;
    switch (id) {
      case 'switch-vault': this.switchToSelectedVault(); return;
      case 'enter': this.goTo(item.path); return;
      case 'new-note': this.createNote(item.path); return;
      case 'new-note-wb': this.createNote(item.path, { native: false }); return;
      case 'new-note-native': this.createNote(item.path, { native: true }); return;
      case 'open': await this.openFile(item); return;
      case 'open-panel': await this.openFile(item, { forcePanel: true }); return;
      case 'open-native': await this.openNative(item); return;
      case 'copy-path': {
        if (bulk) { this.batchCopyPath(); return; }
        this.copyPathToClipboard(abs || rel); return;
      }
      case 'copy-path-uri': {
        if (bulk) {
          const lines = this.batchItems().map((x) => this.obsidianUri(x.kind === 'folder' ? x.item.path : x.item.relPath));
          this.copyText(lines.join('\n'), tr('notice.copiedUris', { n: lines.length }));
        } else {
          this.copyText(this.obsidianUri(rel), tr('ui.78'));
        }
        return;
      }
      case 'copy-path-rel': {
        if (bulk) {
          const lines = this.batchItems().map((x) => x.kind === 'folder' ? x.item.path : x.item.relPath);
          this.copyText(lines.join('\n'), tr('notice.copiedRel', { n: lines.length }));
        } else {
          this.copyPathToClipboard(rel);
        }
        return;
      }
      case 'copy-path-abs': {
        if (bulk) {
          const lines = this.batchItems().map((x) => x.kind === 'folder'
            ? this.absPathOf(x.item.path)
            : (x.item.absPath || this.absPathOf(x.item.relPath)));
          this.copyText(lines.join('\n'), tr('notice.copiedAbs', { n: lines.length }));
        } else {
          this.copyPathToClipboard(abs);
        }
        return;
      }
      case 'move-to': {
        // 批量时移动整个已选集合；单选时只移动这一项
        this.showMovePicker(bulk ? null : [{ kind: kind, item: item }]);
        return;
      }
      case 'duplicate': {
        if (bulk) { this.batchDuplicate(); return; }
        await this.duplicateItem(item, kind); return;
      }
      case 'copy-uri': this.copyText(this.obsidianUri(rel), tr('ui.79')); return;
      case 'copy-wikilink': {
        if (bulk) { this.batchCopyLinks(); return; }
        const links = this.wikiLinksFor(item, kind);
        if (!links.length) { new Notice(tr('ui.80')); return; }
        this.copyText(links.join('\n'), links.length > 1
          ? tr('notice.copiedLinks', { n: links.length })
          : tr('ui.81'));
        return;
      }
      case 'reveal': shellReveal(abs || rel); return;
      case 'rename': await this.renameVaultItem(rel, isFolder); return;
      case 'delete': {
        if (bulk) {
          // 多选时右键删除 = 走批量删除的二次确认流程（顶部操作条出现「确认删除 N 项」）
          this.batchDelArm = true;
          this.closeEditorMenu();
          this.render();
          return;
        }
        await this.deleteVaultItem(rel, isFolder); return;
      }
      default: return;
    }
  },

  /* 重命名：当前库交给 Obsidian 自己的弹窗；别的库由工作台自己改（双链自己修） */
  async renameVaultItem(rel, isFolder) {
    const vault = this.selectedVaultInfo();
    if (vault && this.plugin.indexOf(vault.path).external) {
      await this.extRenameItem(vault, rel, isFolder);
      return;
    }
    const app = this.plugin.app;
    const file = (app && app.vault && app.vault.getAbstractFileByPath)
      ? app.vault.getAbstractFileByPath(rel) : null;
    if (!file) { new Notice(tr('ui.82')); return; }
    const fm = app.fileManager;
    if (fm && typeof fm.promptForFileRename === 'function') {
      try {
        await fm.promptForFileRename(file);
        this.plugin.logOp({ type: 'rename', path: rel });
        this.render();
        return;
      } catch (e) {
        new Notice(tr('ui.83') + (e && e.message ? e.message : e));
        return;
      }
    }
    new Notice(isFolder
      ? tr('ui.84')
      : tr('ui.85'));
  },

  /* 别的库的重命名：先算引用、弹确认，再改（引用由工作台自己重写） */
  async extRenameItem(vault, rel, isFolder) {
    if (!this.plugin.vaultWritable(vault.path)) {
      new Notice(tr('ui.86'));
      return;
    }
    const cur = baseNameOf(rel);
    const dir = parentOf(rel);
    this.promptText({
      title: isFolder ? tr('ui.87') : tr('ui.88'),
      desc: tr('dialog.renameExternal', { vault: vault.name }),
      value: cur,
      okText: tr('ui.89'),
      onOk: (name) => {
        if (!name || name === cur) return;
        const ext = isFolder ? '' : (pathMod.extname(rel) || '.md');
        const newRel = (dir ? dir + '/' : '') + name + ext;
        const p = this.plugin.planExtRename(vault.path, rel, newRel, isFolder);
        this.confirmBox({
          title: tr('ui.90'),
          desc: '「' + rel + '」→「' + newRel + '」\n' + (p.refs
            ? tr('dialog.refsLineN', { n: p.files, m: p.refs })
            : tr('ui.91')),
          okText: tr('dialog.renameOk') + (p.refs ? tr('dialog.renameRefsParen', { n: p.refs }) : ''),
          onOk: () => {
            const r = this.plugin.applyExtRename(vault.path, rel, newRel, isFolder);
            if (!r.ok) { new Notice(r.reason); return; }
            new Notice(tr('dialog.renamedRefs') + (r.refs ? tr('dialog.renamedLinksCn', { n: r.refs }) : '') +
              (r.reason ? '（' + r.reason + '）' : ''), 8000);
            this.render();
          }
        });
      }
    });
  },

  /* 别的库的删除：挪到该库的 .trash 里（可恢复），不是直接删 */
  async extDeleteItem(vault, rel, isFolder) {
    if (!this.plugin.vaultWritable(vault.path)) {
      new Notice(tr('ui.86'));
      return;
    }
    const p = this.plugin.planExtRename(vault.path, rel, rel, isFolder);
    this.confirmBox({
      title: tr('ui.93') + (isFolder ? tr('ui.94') : tr('ui.95')),
      desc: tr('dialog.deleteExternal', { name: rel, vault: vault.name }) + (p.refs
        ? tr('dialog.deadLinks', { n: p.refs })
        : tr('dialog.refsNone')),
      danger: true,
      okText: tr('ui.93'),
      onOk: () => {
        const r = this.plugin.extDelete(vault.path, rel, isFolder);
        if (!r.ok) { new Notice(r.reason); return; }
        new Notice(tr('dialog.deletedTrashInVault', { vault: vault.name }), 8000);
        const sel = this.selectedNote;
        if (sel && (isFolder ? String(sel.relPath).indexOf(rel + '/') === 0 : sel.relPath === rel)) {
          this.closePreview();
        }
        this.render();
      }
    });
  },

  /* Obsidian 的删除策略：local（库内 .trash）/ system（系统回收站）/ none（永久删）。
   * 这是非公开配置，读不到就当 'none' —— 宁可多留一份副本，也不能让用户找不回来。 */
  vaultTrashOption() {
    const app = this.plugin.app;
    try {
      const v = app && app.vault;
      if (v && typeof v.getConfig === 'function') return String(v.getConfig('trashOption') || '');
      if (v && v.config) return String(v.config.trashOption || '');
    } catch (e) { /* 忽略 */ }
    return '';
  },

  /* 删除**当前库**里的一项（quiet=true 时不弹单条提示，给批量删除复用）。
   * 关键：用户如果把 Obsidian 设成「系统回收站 / 永久删除」，库里根本不会留副本 ——
   * 工作台的回收站页面就永远看不到它。所以只要不是 local 策略，删之前先自留一份。
   * 返回 {ok, reason}。 */
  async deleteOneLocal(rel, isFolder, quiet) {
    const app = this.plugin.app;
    const file = (app && app.vault && app.vault.getAbstractFileByPath)
      ? app.vault.getAbstractFileByPath(rel) : null;
    if (!file) return { ok: false, reason: tr('ui.96') };
    const root = this.plugin.currentVaultPath();
    const opt = this.vaultTrashOption();
    if (opt !== 'local') {
      const c = trashCopyInVault(root, rel);
      if (!c.ok && !quiet) new Notice(tr('ui.97') + c.reason, 6000);
    }
    try {
      const fm = app.fileManager;
      const trashDir = pathMod.join(root, '.trash');
      const listDir = () => (fs.existsSync(trashDir) ? fs.readdirSync(trashDir) : []);
      const before = listDir();
      if (fm && typeof fm.trashFile === 'function') await fm.trashFile(file);
      else if (app.vault.trash) await app.vault.trash(file, true); // 旧版 API：丢进系统回收站
      else await app.vault.delete(file);
      // Obsidian 自己把它放进了库内 .trash → 登记映射（放宽到 added.length >= 1，
      // 旧代码只在恰好 1 个新增时登记，Obsidian 顺带写了别的东西就记不上）
      if (opt === 'local') {
        const added = listDir().filter((x) => before.indexOf(x) < 0 && !isIgnoredEntry(x));
        if (added.length) {
          const map = readTrashMap(root);
          for (const nm of added) map[nm] = { rel: rel, ts: Date.now(), isDir: !!isFolder };
          writeTrashMap(root, map);
        }
      }
      const sel = this.selectedNote;
      if (sel && (isFolder
        ? String(sel.relPath).indexOf(rel + '/') === 0
        : sel.relPath === rel)) {
        this.closePreview();
      }
      this.plugin.logOp({ type: 'delete', path: rel });
      if (!quiet) new Notice(tr('dialog.deletedRecycle').replace('：（', '：' + rel + '（'));
      return { ok: true, reason: '' };
    } catch (e) {
      const reason = (e && e.message) ? e.message : String(e);
      if (!quiet) new Notice(tr('ui.98') + reason);
      return { ok: false, reason: reason };
    }
  },

  /* 删除：外部库走我们自己的 .trash，当前库走 Obsidian 的通道 */
  async deleteVaultItem(rel, isFolder) {
    const vault = this.selectedVaultInfo();
    if (vault && this.plugin.indexOf(vault.path).external) {
      await this.extDeleteItem(vault, rel, isFolder);
    } else {
      const r = await this.deleteOneLocal(rel, isFolder, false);
      if (!r.ok) new Notice(r.reason);
    }
    this.render();
  },

  /* 创建副本：原名 + " 1"（重名自动递增）。当前库走 Obsidian 的 copy，外部库我们自己复制 */
  async duplicateItem(item, kind) {
    const vault = this.selectedVaultInfo();
    if (!vault) return;
    const isFolder = kind === 'folder';
    const rel = isFolder ? item.path : item.relPath;
    const external = this.plugin.indexOf(vault.path).external;
    if (external) {
      const abs = (x) => pathMod.join(vault.path, x);
      let newRel = dupRel(rel, 1);
      let n = 1;
      while (fs.existsSync(abs(newRel))) { n++; newRel = dupRel(rel, n); }
      const r = isFolder
        ? copyDirAcross(abs(rel), vault.path, newRel)
        : copyFileAcross(abs(rel), vault.path, newRel);
      if (r.ok) {
        this.plugin.externalCache = {};
        this.plugin.logOp({ type: 'duplicate', path: rel, to: r.rel });
        new Notice(tr('ui.99') + r.rel);
      } else {
        new Notice(tr('ui.100') + r.reason);
      }
      this.render();
      return;
    }
    const app = this.plugin.app;
    const file = app.vault.getAbstractFileByPath(rel);
    if (!file) { new Notice(tr('ui.101')); return; }
    let newRel = dupRel(rel, 1);
    let n = 1;
    while (app.vault.getAbstractFileByPath(newRel)) { n++; newRel = dupRel(rel, n); }
    try {
      await app.vault.copy(file, newRel);
      this.plugin.logOp({ type: 'duplicate', path: rel, to: newRel });
      new Notice(tr('ui.99') + newRel);
    } catch (e) {
      new Notice(tr('ui.100') + (e && e.message ? e.message : e));
    }
    this.render();
  },

  batchDuplicate() {
    const items = this.batchItems();
    for (const x of items) this.duplicateItem(x.item, x.kind);
  },

  /* ------------------------------------------------------- 打开文件的入口
   * 默认行为由 settings.open.mode 决定：
   *   native → 铺满的原生标签页（Obsidian 完整能力：编辑 / 阅读 / 大纲 / 双链 / 插件）
   *   panel  → 工作台内面板预览（可再点「⤢」铺满内容区）
   * 外部库文件不是当前 vault 的 TFile，无法原生打开，自动回落面板。
   */
  async openSelected() {
    const n = this.selectedNote;
    if (!n) return false;
    return this.openNative(n);
  },

  /* 外部库做不了的事：别只说「只读」，要告诉用户下一步按哪里。
   * 切库会把工作台一起装过去，所以切过去照样能继续用。 */
  externalBlockNotice(action) {
    const v = this.selectedVaultInfo();
    const nm = v ? v.name : tr('ui.102');
    new Notice(
      tr('dialog.switchToDo', { action: action, name: nm }) +
      tr('ui.103'),
      12000
    );
  },

  /* 切到选中的外部库去（文件区右键 / 工具条都能触发） */
  switchToSelectedVault() {
    const v = this.selectedVaultInfo();
    if (!v) { new Notice(tr('ui.104')); return; }
    if (!v.current && this.plugin.indexOf(v.path).external) {
      this.plugin.switchToVault(v.path);
      return;
    }
    new Notice(tr('dialog.alreadyInName', { name: v.name }));
  },

  /* 新建笔记：folder 传了就建在那个文件夹里（文件区右键「在这里新建笔记」），
   * 不传就建在当前所在目录。
   * opts.native = true → 建好用 Obsidian 原生编辑器在新标签页打开；
   * 否则（默认）直接在工作台里铺满打开、并进编辑态，光标就在正文里。 */
  async createNote(folder, opts) {
    const o = opts || {};
    const vault = this.selectedVaultInfo();
    if (!vault) return;
    if (this.plugin.indexOf(vault.path).external) {
      await this.extCreateNote(vault, folder, o);
      return;
    }
    const dir = typeof folder === 'string' ? folder : this.folderPath;
    const prefix = dir ? dir + '/' : '';
    let name = tr('ui.105');
    let target = prefix + name + '.md';
    let i = 1;
    while (this.plugin.app.vault.getAbstractFileByPath(target)) {
      i++;
      target = prefix + name + ' ' + i + '.md';
    }
    try {
      const file = await this.plugin.app.vault.create(target, '');
      this.plugin.logOp({ type: 'create', path: target });
      if (o.native) {
        // 交给 Obsidian 自己开标签页（官方编辑器、双链补全、编辑类插件都在）
        let leaf = null;
        try { leaf = this.plugin.app.workspace.getLeaf('tab'); } catch (e) { leaf = this.plugin.app.workspace.getLeaf(true); }
        await leaf.openFile(file);
        this.render();
        return;
      }
      // 工作台内：立刻铺满打开 + 进编辑态
      await this.openPreview(this.noteOf(file, target), { expand: true, edit: true });
      this.render();
    } catch (e) {
      new Notice(tr('ui.106') + (e && e.message ? e.message : e));
    }
  },

  /* 别的库里新建笔记：直接写到磁盘上（不经过 Obsidian，所以没有双链补全这类能力） */
  async extCreateNote(vault, folder, opts) {
    const o = opts || {};
    if (!this.plugin.vaultWritable(vault.path)) {
      new Notice(tr('ui.86'));
      return;
    }
    const dir = typeof folder === 'string' ? folder : this.folderPath;
    this.promptText({
      title: tr('dialog.newNoteInVault', { name: vault.name }),
      desc: (dir ? tr('ui.107') + dir + ' · ' : tr('ui.108')) + tr('ui.109'),
      value: tr('ui.105'),
      okText: tr('ui.110'),
      onOk: async (name) => {
        if (!name) return;
        const rel = (dir ? dir + '/' : '') + String(name).replace(/\.md$/i, '') + '.md';
        const r = this.plugin.extCreateNote(vault.path, rel, '');
        if (!r.ok) { new Notice(r.reason); return; }
        this.render();
        const idx = this.plugin.indexOf(vault.path);
        const note = (idx.files || []).filter((f) => f.relPath === rel)[0];
        if (note && !o.native) await this.openPreview(note, { expand: true, edit: true });
        else new Notice(tr('dialog.newNoteCreated') + ' (' + rel + ')');
      }
    });
  },

  /* 别的库里新建文件夹 */
  async extCreateFolder(vault, dir) {
    if (!this.plugin.vaultWritable(vault.path)) {
      new Notice(tr('ui.86'));
      return;
    }
    const base = typeof dir === 'string' ? dir : this.folderPath;
    this.promptText({
      title: tr('dialog.newFolderInVault', { name: vault.name }),
      value: tr('ui.113'),
      okText: tr('ui.110'),
      onOk: (name) => {
        if (!name) return;
        const rel = (base ? base + '/' : '') + name;
        const r = this.plugin.extCreateFolder(vault.path, rel);
        if (!r.ok) { new Notice(r.reason); return; }
        new Notice(tr('ui.114') + rel);
        this.render();
      }
    });
  },

  /* 新建文件夹：和新建笔记一样落在当前目录（工具条下拉里的第二项） */
  async createFolder(dir) {
    const vault = this.selectedVaultInfo();
    if (!vault) return;
    if (this.plugin.indexOf(vault.path).external) {
      await this.extCreateFolder(vault, dir);
      return;
    }
    const base = typeof dir === 'string' ? dir : this.folderPath;
    let name = tr('ui.113');
    let target = base ? base + '/' + name : name;
    let i = 1;
    while (this.plugin.app.vault.getAbstractFileByPath(target)) {
      i++;
      target = (base ? base + '/' + name + ' ' + i : name + ' ' + i);
    }
    try {
      await this.plugin.app.vault.createFolder(target);
      this.plugin.logOp({ type: 'create-folder', path: target });
      new Notice(tr('ui.114') + target);
      this.render();
    } catch (e) {
      new Notice(tr('ui.115') + (e && e.message ? e.message : e));
    }
  },

  /* 工具条「＋ 新建」下拉：新建文件（默认在工作台内编辑）/ 新建文件夹 */
  renderNewMenu() {
    const pop = this.newMenuPopEl;
    if (!pop) return;
    pop.empty();
    pop.className = 'vwb-menu-pop vwb-newmenu-pop vwb-glass' + (this.newMenuOpen ? ' is-on' : '');
    const dir = this.folderPath || '';
    pop.createDiv({ cls: 'vwb-newmenu-hd', text: dir ? tr('ui.111') + dir : tr('ui.112') });
    for (const it of NEW_MENU) {
      const row = pop.createDiv({ cls: 'vwb-menu-i' });
      const hd = row.createDiv({ cls: 'vwb-menu-i-hd' });
      // ⚠ 常量表在模块加载时求值，语言切换后不会重算 ——
      // 所以 UI 文案必须在这里取（词典 key = editorMenu.<id>），不能写进常量表
      const nm = tr('editorMenu.' + it.id) || it.label;
      hd.createEl('span', { cls: 'vwb-menu-i-nm', text: it.ico + ' ' + nm });
      row.createDiv({ cls: 'vwb-menu-i-ds', text: tr(it.tip) });
      row.setAttribute('title', tr(it.tip));
      row.addEventListener('click', (e) => {
        if (e && e.stopPropagation) e.stopPropagation();
        this.newMenuOpen = false;
        this.renderNewMenu();
        this.render();
        if (it.id === 'new-file') this.createNote();
        else this.createFolder();
      });
    }
    if (this.newMenuOpen) this.placeNewMenu();
  },

  /* 「＋ 新建」弹层的位置：默认贴按钮右边缘（CSS 里的 right:0），
   * 主区放不下就往左夹 —— 保证整块都在主区里，不会冲出右边界被裁掉一半。
   * 只认按钮和主区的 rect：不要拿弹层自己的 rect，那会随宽度变化来回抖。 */
  placeNewMenu() {
    const pop = this.newMenuPopEl;
    const wrap = this.newMenuWrapEl;
    if (!pop || !wrap || !this.mainEl) return;
    if (typeof wrap.getBoundingClientRect !== 'function') return;
    try {
      const mr = this.mainEl.getBoundingClientRect();
      const br = wrap.getBoundingClientRect();
      if (!mr || !br || !mr.width || !br.width) return; // 量不到就沿用 CSS 默认
      const pad = 8;
      const w = Math.max(180, Math.min(268, mr.width - pad * 2));
      pop.style.width = w + 'px';
      pop.style.right = 'auto';
      const wrapLeft = br.left - mr.left;
      // 右边缘超出主区多少，就往左推多少；但最多推到左边留出 pad
      const overflow = wrapLeft + w - (mr.width - pad);
      const limit = Math.max(0, wrapLeft - pad);
      pop.style.left = (overflow > 0 ? -Math.min(overflow, limit) : 0) + 'px';
    } catch (e) { /* 忽略：沿用 CSS 默认位置 */ }
  },

  /* 刚建出来的文件要变成视图内部认的 note 结构（和 buildCurrentIndex 对齐） */
  noteOf(file, relPath) {
    const vault = this.selectedVaultInfo();
    const root = vault ? String(vault.path).replace(/\\/g, '/') : '';
    const segs = String(relPath).split('/');
    const name = segs.pop();
    const folder = (file && file.parent && file.parent.path != null) ? file.parent.path : segs.join('/');
    const ext = name.indexOf('.') >= 0 ? '.' + name.split('.').pop().toLowerCase() : '';
    return {
      id: relPath,
      file: file,
      name: name,
      relPath: relPath,
      absPath: root ? root + '/' + relPath : '',
      folder: folder,
      size: 0,
      mtime: Date.now(),
      ctime: Date.now(),
      ext: ext,
      tags: [],
      external: false
    };
  }
});
