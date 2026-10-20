/* -------------------------------------------------------------------------
 *  工作台视图 · 左侧 obsidian库导航
 *  （本片段由 build.js 拼进 main.js，不要单独 require）
 * ------------------------------------------------------------------------- */
Object.assign(WorkbenchView.prototype, {
  renderRail() {
    const el = this.railEl;
    if (!el) return;
    el.empty();
    const collapsed = !!(this.plugin.settings.ui && this.plugin.settings.ui.railCollapsed);
    el.className = 'vwb-rail vwb-layer' + (collapsed ? ' is-collapsed' : '');

    // 标题行 + 展开 / 收缩
    const head = el.createDiv({ cls: 'vwb-rail-head' });
    head.createEl('h4', { cls: 'vwb-rail-t', text: tr('rail.title') });
    const tg = head.createDiv({
      cls: 'vwb-rail-tg',
      text: collapsed ? tr('rail.expand') : tr('rail.collapse')
    });
    tg.setAttribute('title', collapsed ? tr('rail.expand.tip') : tr('rail.collapse.tip'));
    tg.addEventListener('click', () => this.toggleRail());
    if (collapsed) {
      // 收起态：标题行只留一个图标按钮
      const ic = el.createDiv({ cls: 'vwb-rail-ic' });
      ic.createEl('span', { text: '🗄' });
      ic.setAttribute('title', tr('rail.collapsed.tip'));
    }

    const vaults = this.plugin.discoverVaults();
    if (!vaults.length) {
      el.createDiv({ cls: 'vwb-cnt', text: tr('rail.none') });
    }
    for (const v of vaults) {
      const item = el.createDiv({ cls: 'vwb-vault' + (v.id === this.selectedVault ? ' is-on' : '') });
      // 侧栏宽度有限，长库名会被 ellipsis 截断 —— hover 显示完整库名
      item.setAttribute('title', v.name);
      const dot = item.createDiv({ cls: 'vwb-dot' });
      dot.style.background = v.current ? 'var(--vwb-acc)' : 'var(--text-faint)';
      dot.style.color = dot.style.background;
      item.createDiv({ cls: 'vwb-vault-name', text: v.name });
      if (v.current) {
        item.createDiv({ cls: 'vwb-badge', text: tr('rail.badge.current') });
      } else if (v.isVault === false) {
        const b = item.createDiv({ cls: 'vwb-badge', text: tr('rail.badge.folder') });
        b.setAttribute('title', tr('rail.badge.folder.tip'));
      } else if (v.wb === 'none') {
        const b = item.createDiv({ cls: 'vwb-badge is-warn', text: tr('rail.badge.none') });
        b.setAttribute('title', tr('rail.badge.none.tip'));
      } else if (v.wb === 'stale') {
        const b = item.createDiv({ cls: 'vwb-badge is-warn', text: tr('rail.badge.stale') });
        b.setAttribute('title', tr('rail.badge.stale.tip', { ver: v.wbVer || '?' }));
      }
      item.addEventListener('click', () => this.selectVault(v.id));
      /* 右键：切库 / 装工作台 / 复制路径 / 显示 / 隐藏 */
      item.addEventListener('contextmenu', (e) => {
        if (e && e.preventDefault) e.preventDefault();
        if (e && e.stopPropagation) e.stopPropagation();
        this.showVaultMenu(e, v);
      });
    }
    if (!collapsed) {
      const tip = el.createDiv({ cls: 'vwb-rail-tip', text: tr('rail.tip') });
      tip.setAttribute('title', tr('rail.tip.title'));
    }
    const foot = el.createDiv({ cls: 'vwb-rail-foot' });
    // 「设置」入口：打开带子页的设置面板（外观 / 打开方式 / 库管理 / 日志 / 关于）
    const setBtn = foot.createDiv({ cls: 'vwb-mini' + (this.drawerOpen ? ' is-on' : '') });
    setBtn.createEl('span', { cls: 'vwb-mini-ic', text: '⚙' });
    setBtn.createEl('span', { cls: 'vwb-mini-tx', text: tr('rail.settings') });
    setBtn.setAttribute('title', tr('rail.settings.tip'));
    setBtn.addEventListener('click', () => this.toggleDrawer());

    const reBtn = foot.createDiv({ cls: 'vwb-mini' });
    reBtn.createEl('span', { cls: 'vwb-mini-ic', text: '↻' });
    reBtn.createEl('span', { cls: 'vwb-mini-tx', text: tr('rail.rediscover') });
    reBtn.setAttribute('title', tr('rail.rediscover.tip'));
    reBtn.addEventListener('click', () => { this.renderRail(); new Notice(tr('rail.rediscovered')); });
  },

  /* 左侧导航 展开 / 收缩（默认展开，状态记进设置） */
  toggleRail(force) {
    if (!this.plugin.settings.ui) this.plugin.settings.ui = Object.assign({}, DEFAULT_SETTINGS.ui);
    const collapsed = typeof force === 'boolean' ? force : !this.plugin.settings.ui.railCollapsed;
    this.plugin.settings.ui.railCollapsed = collapsed;
    this.plugin.saveSettings();
    this.renderRail();
  },

  openPluginSettings() {
    const app = this.plugin.app;
    if (app.setting && typeof app.setting.open === 'function') {
      app.setting.open();
      if (typeof app.setting.openTabById === 'function') app.setting.openTabById('vault-hub');
    } else {
      new Notice(tr('rail.openSettingsTip'));
    }
  },

  selectVault(id) {
    if (this.selectedVault === id) return;
    this.selectedVault = id;
    this.folderPath = '';
    this.resetHist();
    this.query = '';
    this.crossHits = null;   // 换了库，上一次跨库搜索的结果就作废了
    if (this.searchEl) this.searchEl.value = '';
    this.tagsRequested = false;
    this.closePreview();
    this.syncSearchUI();
    this.renderRail();
    this.render();
    if (this.drawerOpen) this.renderDrawer();
  },

  /* ---------------------------------------------------- 库：右键菜单 */
  /* 菜单挂在 this.contentEl（整个视图根）上，不挂在侧栏里：
   * .vwb-rail 有 overflow-y:auto 而且是 backdrop-filter 的层叠上下文，
   * 菜单放进去会被裁掉、还会点不动（v0.9.1 踩过的坑）。 */
  showVaultMenu(ev, v) {
    if (!v) return;
    const host = this.openCtxMenu(this.contentEl);
    if (!host) return;
    const x = Number(ev && ev.clientX) || 0;
    const y = Number(ev && ev.clientY) || 0;
    this.renderCtxGroups(host, this.vaultMenuGroups(v), {
      onPick: (id) => { this.closeEditorMenu(); this.runVaultCmd(id, v); }
    });
    this.placeMenu(host, x, y, this.contentEl);
    try { host.style.visibility = ''; } catch (e) { /* 忽略 */ }
  },

  vaultMenuGroups(v) {
    const cur = !!v.current;
    // 只是个普通文件夹（比如导入的笔记目录）就切不过去 —— 先在 Obsidian 里把它变成库
    const realVault = looksLikeVault(v.path);
    const notVaultWhy = tr('rail.notVault');
    let installLabel = tr('rail.menu.install');
    let installOk = !cur && realVault;
    let installWhy = realVault ? '' : notVaultWhy;
    if (v.wb === 'ok') {
      installLabel = tr('rail.menu.installOk', { ver: v.wbVer || '' });
      installOk = false;
      installWhy = tr('rail.menu.installOkWhy');
    } else if (v.wb === 'stale') {
      installLabel = tr('rail.menu.update', { ver: v.wbVer || '?' });
    }
    const groups = [];
    groups.push({ items: [
      {
        id: 'switch',
        label: cur ? tr('rail.menu.switchCur') : tr('rail.menu.switch'),
        ico: '⇄',
        disabled: cur || !realVault,
        why: cur ? tr('rail.menu.switchWhy') : (realVault ? '' : notVaultWhy)
      },
      { id: 'install', label: installLabel, ico: '⬇', disabled: !installOk, why: installWhy }
    ] });
    groups.push({ items: [
      { id: 'browse', label: tr('rail.menu.browse'), ico: '👁' },
      { id: 'refresh', label: tr('rail.menu.refresh'), ico: '↻' }
    ] });
    groups.push({ items: [
      { id: 'copy-uri', label: tr('rail.menu.copyUri'), ico: '🔗' },
      { id: 'copy-path', label: tr('menu.copyPath'), ico: '⧉' },
      { id: 'reveal', label: tr('rail.menu.reveal'), ico: '🗂' }
    ] });
    groups.push({ items: [
      { id: 'hide', label: tr('rail.menu.hide'), ico: '🚫', disabled: cur, why: tr('rail.menu.hideWhy') }
    ] });
    return groups;
  },

  runVaultCmd(id, v) {
    switch (id) {
      case 'switch': {
        const r = this.plugin.switchToVault(v.path);
        if (r && !r.ok) this.renderRail();
        return;
      }
      case 'install': {
        const d = this.plugin.deployWorkbenchTo(v.path);
        if (!d.ok) { new Notice(tr('rail.installFail', { reason: d.reason || tr('common.unknown') })); }
        else if (d.changed) {
          new Notice(!d.from
            ? tr('rail.installed', { name: v.name })
            : tr('rail.updated', { name: v.name, ver: d.to }), 10000);
        } else {
          new Notice(tr('rail.alreadyNew', { name: v.name }));
        }
        this.renderRail();
        return;
      }
      case 'browse': this.selectVault(v.id); return;
      case 'refresh': {
        delete this.plugin.externalCache[v.id];
        this.render();
        new Notice(tr('rail.refreshed', { name: v.name }));
        return;
      }
      case 'copy-uri': this.copyText(this.plugin.vaultUriOf(v.path), tr('rail.copiedUri')); return;
      case 'copy-path': this.copyText(v.path, tr('notice.copied')); return;
      case 'reveal': shellReveal(v.path); return;
      case 'hide': {
        const h = this.plugin.settings.vaults.hidden;
        if (h.indexOf(v.id) < 0) h.push(v.id);
        this.plugin.saveSettings();
        this.renderRail();
        new Notice(tr('rail.hidden', { name: v.name }));
        return;
      }
      default: return;
    }
  }

  /* ------------------------------------------- 目录历史：前进 / 后退 / 上一级
   * 进下一层、点面包屑、点上一级都会记一笔，之后就能用 Alt+← / Alt+→
   * （或工具条上的 ⇦ ⇨）在目录之间来回走。
   */
});
