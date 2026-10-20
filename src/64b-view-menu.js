/* -------------------------------------------------------------------------
 *  工作台视图 · 文件 / 文件夹右键菜单 + 跨库搜索 + 链接双链
 *  （本片段由 build.js 拼进 main.js，不要单独 require）
 * ------------------------------------------------------------------------- */
Object.assign(WorkbenchView.prototype, {
  /* ------------------------------------------------- 文件 / 文件夹 右键菜单
   * 列表和网格共用一套：点哪一项就在哪一项上弹，命令作用在那一项上。
   * 菜单项由 itemMenuGroups() 按当前项类型 + 是否外部库动态生成；
   * 画菜单的活儿和编辑器菜单共用 renderCtxGroups（子菜单、置灰、分隔线都一致）。 */
  showItemMenu(ev, item, kind) {
    if (!item) return;
    // ⚠ 挂在 contentEl（视图根）而不是 mainEl：mainEl 是 .vwb-layer（z-index:1，
    // 自成层叠上下文），里面的弹层 z-index 再大也会被设置抽屉（z-index:40）整层压住
    const host = this.openCtxMenu(this.contentEl);
    if (!host) return;
    const x = Number(ev && ev.clientX) || 0;
    const y = Number(ev && ev.clientY) || 0;

    this.renderCtxGroups(host, this.itemMenuGroups(item, kind), {
      onPick: (id) => this.runItemCmd(id, item, kind)
    });

    this.placeMenu(host, x, y, this.contentEl);
    try { host.style.visibility = ''; } catch (e) { /* 忽略 */ }
  },

  /* 菜单项：文件夹和文件各一套，最后一组是删除（外部库只让编辑正文，这些都置灰） */
  itemMenuGroups(item, kind) {
    const vault = this.selectedVaultInfo();
    const external = !!(vault && this.plugin.indexOf(vault.path).external);
    // 外部库现在能改结构了（重命名的双链由工作台自己改），只有「复制链接」仍然不行：
    // 跨库的 obsidian:// 链接指向的是当前库的路径，粘到别处跳不到别的库的那篇
    const noLink = tr('menu.why.noLink');
    const noWrite = external && vault ? tr('menu.why.noWrite') : '';
    const blockNew = external && !(vault && this.plugin.vaultWritable(vault.path));
    const isFolder = kind === 'folder';
    // 右键时被点的这一项，是否在已有框选/多选集合里？在 → 菜单命令作用于全部已选项（Windows 习惯）
    const inSelection = this.isMulti(kind, item);
    const bulk = inSelection && this.multiSel && this.multiSel.size > 1;
    const bulkN = bulk ? this.multiSel.size : 0;
    const groups = [];

    // 在外部库里直接给一条「切过去」的快捷通道，不用再去找导航里是哪个库
    if (external && vault) {
      groups.push({ items: [
        { id: 'switch-vault', label: tr('menu.switchVault', { name: vault.name }), ico: '⇄' }
      ] });
    }

    if (isFolder) {
      groups.push({ items: [
        { id: 'enter', label: tr('menu.enter'), ico: '↳' },
        { id: 'new-note', label: tr('menu.newHere'), ico: '＋', disabled: blockNew, why: noWrite, sub: [
          { id: 'new-note-wb', label: tr('menu.newHere.wb') },
          { id: 'new-note-native', label: tr('menu.newHere.native') }
        ] }
      ] });
    } else {
      groups.push({ items: [
        { id: 'open', label: tr('menu.open'), ico: '↗' },
        { id: 'open-panel', label: tr('menu.openPanel'), ico: '👁' },
        { id: 'open-native', label: tr('menu.openNative'), ico: '🗂', disabled: !canOpenNative(item), why: tr('menu.why.noNative') }
      ] });
    }

    groups.push({ items: [
      { id: 'copy-uri', label: isFolder ? tr('menu.copyUri.folder') : tr('menu.copyUri.file'), ico: '🔗', disabled: external, why: noLink },
      { id: 'copy-wikilink', label: bulk
        ? tr('menu.copyWikilink.multi', { n: bulkN })
        : (isFolder ? tr('menu.copyWikilink.folder') : tr('menu.copyWikilink')), ico: '⛓', disabled: external, why: noLink },
      { id: 'copy-path', label: tr('menu.copyPath'), ico: '⧉', sub: [
        { id: 'copy-path-uri', label: tr('menu.copyPath.uri') },
        { id: 'copy-path-rel', label: tr('menu.copyPath.rel') },
        { id: 'copy-path-abs', label: tr('menu.copyPath.abs') }
      ] }
    ] });

    groups.push({ items: [
      { id: 'move-to', label: isFolder ? tr('menu.moveTo.folder') : tr('menu.moveTo.file'), ico: '⇥', disabled: blockNew, why: noWrite },
      { id: 'duplicate', label: tr('menu.duplicate'), ico: '⧉', disabled: blockNew, why: noWrite },
      { id: 'rename', label: isFolder ? tr('menu.renameFolder') : tr('menu.rename'), ico: '✎', disabled: blockNew, why: noWrite },
      { id: 'reveal', label: tr('menu.reveal'), ico: '🗂' }
    ] });

    groups.push({ items: [
      { id: 'delete', label: bulk ? tr('menu.delete.multi', { n: bulkN }) : (isFolder ? tr('menu.delete.folder') : tr('menu.delete.file')), ico: '🗑', danger: true, disabled: blockNew, why: noWrite }
    ] });
    return groups;
  },

  /* ------------------------------------------------- 跨库全文搜索的结果 */
  /* 结果按 query 缓存：边打字边搜时不会每次都重建索引 */
  crossSearchHits() {
    const q = String(this.query || '').trim();
    if (!q) return [];
    if (this.crossHits && this.crossHitsQ === q) return this.crossHits;
    const hits = this.plugin.searchAllVaults(q, { limit: 200 });
    this.crossHitsQ = q;
    this.crossHits = hits;
    return hits;
  },

  renderCrossHits() {
    const q = String(this.query || '').trim();
    const hits = this.crossSearchHits();
    if (!hits.length) {
      this.areaEl.createDiv({ cls: 'vwb-empty', text: tr('empty.crossNone', { q: q }) });
      return;
    }
    const head = this.areaEl.createDiv({ cls: 'vwb-xhit-head' });
    head.createEl('span', { text: tr('cross.hits', { n: hits.length }) });
    head.createEl('span', { cls: 'vwb-xhit-q', text: '「' + q + '」' });
    for (const h of hits) this.renderCrossHitRow(this.areaEl, h);
  },

  renderCrossHitRow(box, h) {
    const row = box.createDiv({ cls: 'vwb-xhit' });
    const v = row.createDiv({ cls: 'vwb-xhit-v' + (h.current ? ' is-cur' : '') });
    v.createEl('span', { text: h.current ? tr('ui.21') : h.vaultName });
    const main = row.createDiv({ cls: 'vwb-xhit-m' });
    main.createDiv({ cls: 'vwb-xhit-nm', text: h.name });
    main.createDiv({ cls: 'vwb-xhit-pt', text: h.relPath });
    // 片段里的关键词高亮：逐段拼元素，不用 innerHTML（笔记内容不能当 HTML 解析）
    const sn = main.createDiv({ cls: 'vwb-xhit-sn' });
    if (h.byName) sn.createEl('span', { cls: 'vwb-xhit-byname', text: tr('ui.20') });
    else this.appendHighlight(sn, h.snippet, this.query);
    row.setAttribute('title',
      (h.current ? tr('cross.curVaultCell') : h.vaultName) + ' · ' + h.relPath +
      (h.current ? '' : tr('cross.curVaultTip')));
    row.addEventListener('click', () => this.openCrossHit(h));
    row.addEventListener('contextmenu', (e) => {
      if (e && e.preventDefault) e.preventDefault();
      if (e && e.stopPropagation) e.stopPropagation();
      this.showCrossHitMenu(e, h);
    });
  },

  /* 把命中的词包一层 <mark>：按出现位置切片，重叠的跳过 */
  appendHighlight(el, text, query) {
    const t = String(text || '');
    const terms = searchTermsOf(query);
    if (!terms.length || !t) { el.setText(t); return; }
    const low = t.toLowerCase();
    const marks = [];
    for (const term of terms) {
      let from = 0;
      for (;;) {
        const p = low.indexOf(term, from);
        if (p < 0) break;
        marks.push([p, p + term.length]);
        from = p + term.length;
      }
    }
    if (!marks.length) { el.setText(t); return; }
    marks.sort((a, b) => a[0] - b[0]);
    let cur = 0;
    for (const m of marks) {
      if (m[0] < cur) continue;
      if (m[0] > cur) el.createEl('span', { text: t.slice(cur, m[0]) });
      el.createEl('mark', { text: t.slice(m[0], m[1]) });
      cur = m[1];
    }
    if (cur < t.length) el.createEl('span', { text: t.slice(cur) });
  },

  async openCrossHit(h) {
    const idx = this.plugin.indexOf(h.vault);
    const note = (idx.files || []).filter((f) => f.relPath === h.relPath)[0];
    if (!note) { new Notice(tr('ui.23')); return; }
    await this.openPreview(note, { expand: true });
  },

  showCrossHitMenu(ev, h) {
    const host = this.openCtxMenu(this.contentEl);
    if (!host) return;
    const x = Number(ev && ev.clientX) || 0;
    const y = Number(ev && ev.clientY) || 0;
    this.renderCtxGroups(host, [{ items: [
      { id: 'open', label: tr('ui.24'), ico: '↗' },
      { id: 'switch', label: tr('menu.switchVaultCell', { name: h.vaultName }), ico: '⇄',
        disabled: !!h.current, why: tr('ui.25') },
      { id: 'copy-path', label: tr('ui.26'), ico: '⧉' }
    ] }], {
      onPick: (id) => {
        this.closeEditorMenu();
        if (id === 'open') this.openCrossHit(h);
        else if (id === 'switch') this.plugin.switchToVault(h.vault);
        else if (id === 'copy-path') {
          this.copyText(pathMod.join(h.vault, h.relPath), tr('ui.27'));
        }
      }
    });
    this.placeMenu(host, x, y, this.contentEl);
    try { host.style.visibility = ''; } catch (e) { /* 忽略 */ }
  },

  /* ----------------------------------------------------------- 链接 / 双链
   * Obsidian 协议链接（obsidian://open?vault=…&file=…）：文件和文件夹都能用，
   * 粘到微信 / 邮件里，在装了 Obsidian 的机器上点一下就能跳过去。 */
  obsidianUri(rel) {
    const vault = this.selectedVaultInfo();
    const vname = vault ? baseNameOf(vault.path) : '';
    const file = String(rel || '').replace(/\\/g, '/').replace(/\.md$/i, '');
    return 'obsidian://open?vault=' + encodeURIComponent(vname) + '&file=' + encodeURIComponent(file);
  },

  /* 内部双链 [[路径]]（md 去掉后缀，Obsidian 的链接就是这么写的） */
  wikiLinkOf(rel) {
    return '[[' + String(rel || '').replace(/\\/g, '/').replace(/\.md$/i, '') + ']]';
  },

  /* 文件夹：把它下面所有笔记的双链都列出来（每行一条），批量做索引 / 目录时很顺手 */
  wikiLinksFor(item, kind) {
    if (kind !== 'folder') return [this.wikiLinkOf(item.relPath)];
    const vault = this.selectedVaultInfo();
    if (!vault) return [];
    const prefix = String(item.path || '') + '/';
    return (this.plugin.indexOf(vault.path).files || [])
      .filter((n) => fileKind(n.ext) === 'markdown' && String(n.relPath).indexOf(prefix) === 0)
      .map((n) => n.relPath)
      .sort((a, b) => a.localeCompare(b, 'zh'))
      .map((p) => this.wikiLinkOf(p));
  },
});
