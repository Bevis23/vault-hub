/* -------------------------------------------------------------------------
 *  插件主体：设置、库发现、索引、资源定位
 *  （本片段由 build.js 拼进 main.js，不要单独 require）
 * ------------------------------------------------------------------------- */
/* ==========================================================================
 *  Plugin
 * ========================================================================== */
class VaultWorkbenchPlugin extends Plugin {
  async onload() {
    await this.loadSettings();
    // 语言要在任何 UI 画出来之前定好（auto = 读 Obsidian 界面语言）
    this.applyLang();

    this.opLog = [];
    this.externalCache = {}; // rootPath -> { ts, files, folderCount }
    this.wallpaperCache = { key: '', url: '' };
    this.dataUrlCache = {};  // absPath -> { ts, url }  外部库文件内联预览用

    this.registerView(VIEW_TYPE, (leaf) => new WorkbenchView(leaf, this));

    this.addRibbonIcon('layout-grid', tr('misc.ribbonTip'), () => this.activateView());

    this.addCommand({
      id: 'open-vault-workbench',
      name: tr('misc.cmdOpen'),
      callback: () => this.activateView()
    });

    this.addCommand({
      id: 'refresh-vault-workbench',
      name: tr('misc.cmdRefresh'),
      callback: () => {
        this.externalCache = {};
        this.refreshViews();
        new Notice(tr('misc.indexRefreshed'));
      }
    });

    // 库变化时自动刷新（防抖 400ms）
    this.debouncedRefresh = debounce(() => this.refreshViews(), 400);
    this.registerEvent(this.app.vault.on('create', this.debouncedRefresh));
    this.registerEvent(this.app.vault.on('delete', this.debouncedRefresh));
    this.registerEvent(this.app.vault.on('rename', this.debouncedRefresh));
    this.registerEvent(this.app.metadataCache.on('resolve', this.debouncedRefresh));

    // 留个引用：切语言时要重画这一页（见 applyLang）
    this.settingTab = new WorkbenchSettingTab(this.app, this);
    this.addSettingTab(this.settingTab);

    this.app.workspace.onLayoutReady(() => {
      // 静默启动，不强行抢占用户的界面
    });
  }

  onunload() {
    this.externalCache = {};
  }

  async loadSettings() {
    const loaded = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded || {});
    this.settings.appearance = Object.assign({}, DEFAULT_SETTINGS.appearance, (loaded || {}).appearance);
    this.settings.vaults = Object.assign({}, DEFAULT_SETTINGS.vaults, (loaded || {}).vaults);
    this.settings.open = Object.assign({}, DEFAULT_SETTINGS.open, (loaded || {}).open);
    // v0.4.0 迁移：默认改成「右侧预览模式」。只要用户没在下拉菜单里手动选过，
    // 就统一落到 panel；手动选过的（migrated=true）保持原样。
    if (!this.settings.open.migrated) {
      this.settings.open.mode = DEFAULT_SETTINGS.open.mode;
    }
    if (!OPEN_MODES.some((m) => m.id === this.settings.open.mode)) {
      this.settings.open.mode = DEFAULT_SETTINGS.open.mode;
    }
    this.settings.view = Object.assign({}, DEFAULT_SETTINGS.view, (loaded || {}).view);
    if (!Array.isArray(this.settings.smartViews)) this.settings.smartViews = [];
    this.settings.editor = Object.assign({}, DEFAULT_SETTINGS.editor, (loaded || {}).editor);
    if (!EDITOR_MODES.some((m) => m.id === this.settings.editor.mode)) {
      this.settings.editor.mode = DEFAULT_SETTINGS.editor.mode;
    }
    this.settings.ui = Object.assign({}, DEFAULT_SETTINGS.ui, (loaded || {}).ui);
    if (!this.settings.ui.lang) this.settings.ui.lang = DEFAULT_SETTINGS.ui.lang;
    if (!this.settings.vaultAppearance || typeof this.settings.vaultAppearance !== 'object') {
      this.settings.vaultAppearance = {};
    }
    // 兼容旧配置：缺字段时回落到默认值
    for (const k of Object.keys(DEFAULT_SETTINGS.appearance)) {
      if (typeof this.settings.appearance[k] === 'undefined') {
        this.settings.appearance[k] = DEFAULT_SETTINGS.appearance[k];
      }
    }
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }

  /* 打开方式：panel（右侧预览·默认） / workbench（工作面板） / native（原生编辑） */
  setOpenMode(mode, quiet) {
    this.settings.open.mode = mode;
    this.settings.open.migrated = true; // 用户自己定的，不再被迁移逻辑覆盖
    this.saveSettings();
    this.refreshViews();
    if (!quiet) new Notice(tr('misc.openMode', { mode: tr('mode.open.' + mode + '.label') }));
  }
  cycleOpenMode() {
    const cur = this.settings.open.mode || DEFAULT_SETTINGS.open.mode;
    const i = OPEN_MODES.findIndex((m) => m.id === cur);
    const next = OPEN_MODES[(i + 1) % OPEN_MODES.length];
    this.setOpenMode(next.id);
  }

  refreshViews() {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      if (leaf.view && leaf.view.render) leaf.view.render();
    }
  }

  /* 语言：auto = 读 Obsidian 界面语言（读不到就中文），也可手动钉成 zh / en。
   * 切换后要把工作台视图、抽屉、原生设置页都重画一遍 ——
   * 只重画视图的话，设置页还会停在旧语言上。 */
  applyLang() {
    const ui = (this.settings && this.settings.ui) || {};
    const want = ui.lang || 'auto';
    let lang = want;
    if (want === 'auto') lang = normLang(detectLang(this.app)) || 'zh';
    setLang(lang);
    this.refreshViews();
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      const v = leaf && leaf.view;
      // render() 只重画文件区 —— 顶栏静态文案和标签页标题要单独同步
      if (v && typeof v.applyStaticLang === 'function') {
        try { v.applyStaticLang(); } catch (e) { /* 忽略 */ }
      }
      if (v && v.drawerOpen && typeof v.renderDrawer === 'function') v.renderDrawer();
    }
    if (this.settingTab && typeof this.settingTab.display === 'function') {
      try { this.settingTab.display(); } catch (e) { /* 忽略 */ }
    }
    return lang;
  }

  async activateView() {
    const ws = this.app.workspace;
    let leaf = ws.getLeavesOfType(VIEW_TYPE)[0];
    if (!leaf) {
      try { leaf = ws.getLeaf('tab'); }
      catch (e) { leaf = ws.getLeaf(true); }
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
    }
    ws.revealLeaf(leaf);
  }

  /* --------------------------------------------------- vault discovery */
  currentVaultPath() {
    try {
      if (this.app.vault.adapter && typeof this.app.vault.adapter.getBasePath === 'function') {
        return this.app.vault.adapter.getBasePath();
      }
    } catch (e) { /* ignore */ }
    return '';
  }

  discoverVaults() {
    const cur = this.currentVaultPath().replace(/\\/g, '/');
    const list = [];
    const seen = new Set();

    const push = (rawPath, source) => {
      const p = String(rawPath || '').replace(/\\/g, '/').replace(/\/+$/, '');
      if (!p || seen.has(p.toLowerCase())) return;
      seen.add(p.toLowerCase());
      const isCur = p.toLowerCase() === cur.toLowerCase();
      list.push({
        id: p,
        name: this.settings.vaults.aliases[p] || baseNameOf(p),
        path: p,
        current: isCur,
        source: source
      });
    };

    // 1) Obsidian 注册过的仓库
    //    配置目录三个系统都不一样（%APPDATA% / ~/Library/Application Support / ~/.config），
    //    统一走 obsidianConfigPath()，不然 mac / Linux 上自动发现直接失效。
    try {
      const cfgPath = obsidianConfigPath();
      if (fs.existsSync(cfgPath)) {
        const raw = readJsonFile(cfgPath, {});
        const vaults = raw.vaults || {};
        if (Array.isArray(vaults)) {
          for (const v of vaults) push(typeof v === 'string' ? v : (v && v.path), 'auto');
        } else {
          for (const k of Object.keys(vaults)) push(vaults[k] && vaults[k].path, 'auto');
        }
      }
    } catch (e) {
      console.error('[vault-workbench] read obsidian.json failed', e);
    }

    // 2) 当前库兜底
    push(cur, 'auto');

    // 3) 全局清单（跨库共享，切到别的库也还能看见这些库）
    try {
      const shared = this.readSharedVaults();
      for (const p of shared.extra) push(p, 'shared');
    } catch (e) { /* 全局清单读不到就算了，不影响本库那份 */ }

    // 4) 本库手动添加的
    for (const p of this.settings.vaults.extra || []) push(p, 'manual');

    // 每个库都带上「工作台装了没 / 是不是真的库」，右键菜单直接读这个，不用再查一次磁盘
    const withWb = list.map((v) => {
      const st = this.workbenchStateOf(v.path);
      return Object.assign({}, v, { wb: st.state, wbVer: st.ver, isVault: looksLikeVault(v.path) });
    });

    // 过滤隐藏
    const hidden = (this.settings.vaults.hidden || []).map((x) => x.toLowerCase());
    return withWb.filter((v) => hidden.indexOf(v.id.toLowerCase()) < 0);
  }

  /* ------------------------------------------------------------- index */
  buildCurrentIndex() {
    const files = this.app.vault.getFiles();
    const list = files.map((f) => {
      let tags = [];
      const cache = this.app.metadataCache.getFileCache(f);
      if (cache) {
        if (cache.tags) for (const t of cache.tags) tags.push(t.tag);
        const fm = cache.frontmatter;
        if (fm && Array.isArray(fm.tags)) {
          for (const t of fm.tags) tags.push('#' + String(t).replace(/^#/, ''));
        }
      }
      tags = tags.filter((t, i) => tags.indexOf(t) === i).slice(0, 8);
      return {
        id: f.path,
        file: f,
        name: f.name,
        relPath: f.path,
        absPath: (this.currentVaultPath() ? pathMod.join(this.currentVaultPath(), f.path) : ''),
        // 库根是 '/'，统一化成 ''，否则根目录下的文件会被算进一个没有名字的文件夹
        folder: normFolder(f.parent ? f.parent.path : ''),
        size: f.stat ? f.stat.size : 0,
        mtime: f.stat ? f.stat.mtime : 0,
        ctime: f.stat ? f.stat.ctime : 0,
        ext: '.' + (f.extension || ''),
        tags: tags,
        external: false
      };
    });
    return { files: list, folders: this.currentFolders() };
  }

  /* 当前库的全部文件夹（含**空文件夹**）。
   * 光靠 getFiles() 反推只能看到「有笔记的文件夹」，空文件夹永远不出现 ——
   * 所以这里直接问库要目录树（getRoot().children 递归），拿不到就回落成空清单。 */
  currentFolders() {
    const out = [];
    try {
      const vault = this.app.vault;
      const root = (typeof vault.getRoot === 'function') ? vault.getRoot() : null;
      if (!root) return out;
      const walk = (folder) => {
        const kids = folder && folder.children;
        if (!kids || typeof kids.length !== 'number') return;
        for (let i = 0; i < kids.length; i++) {
          const c = kids[i];
          if (!c || !c.children) continue;   // TFile 没有 children，只有 TFolder 有
          const p = normFolder(c.path);
          if (!p) continue;
          if (p.split('/').some((seg) => isIgnoredEntry(seg))) continue;
          out.push({ path: p, name: c.name || p.split('/').pop() });
          walk(c);
        }
      };
      walk(root);
    } catch (e) {
      console.error('[vault-workbench] failed reading folder tree', e);
    }
    return out;
  }

  getExternalIndex(rootPath) {
    const cached = this.externalCache[rootPath];
    if (cached && Date.now() - cached.ts < 30000) return cached;
    const res = scanExternalVault(rootPath);
    this.externalCache[rootPath] = Object.assign({ ts: Date.now() }, res);
    return this.externalCache[rootPath];
  }

  indexOf(vaultPath) {
    const cur = this.currentVaultPath().replace(/\\/g, '/');
    if (vaultPath.replace(/\\/g, '/').toLowerCase() === cur.toLowerCase()) {
      const idx = this.buildCurrentIndex();
      return { files: idx.files, folders: idx.folders, external: false };
    }
    const idx = this.getExternalIndex(vaultPath);
    return { files: idx.files, folders: idx.folders || [], external: true };
  }

  /* --------------------------------------------------------- wallpaper */
  // ap 可选：支持"每个库单独配置外观"时传入该库的外观记录
  wallpaperCss(ap) {
    const a = ap || this.settings.appearance;
    const custom = asStr(a.customImage);
    if (!custom) return (WALLPAPERS[a.wallpaper] || WALLPAPERS.none).css;
    // 直接是 data URL（在视图内用文件选择器挑的图片）
    if (/^data:/i.test(custom)) return 'url(' + custom + ') center/cover no-repeat';
    if (this.wallpaperCache.key === custom && this.wallpaperCache.url) {
      return 'url(' + this.wallpaperCache.url + ') center/cover no-repeat';
    }
    try {
      const data = fs.readFileSync(custom);
      const ext = pathMod.extname(custom).slice(1).toLowerCase() || 'png';
      const url = 'data:image/' + ext + ';base64,' + data.toString('base64');
      this.wallpaperCache = { key: custom, url: url };
      return 'url(' + url + ') center/cover no-repeat';
    } catch (e) {
      return (WALLPAPERS[a.wallpaper] || WALLPAPERS.none).css;
    }
  }

  /* ----------------------------------------------- 外部库文件内联预览 */
  /* 当前库走 Obsidian 资源协议；外部库不在 vault 内，只能读成 data URL */
  dataUrlOf(absPath, ext, maxBytes) {
    if (!absPath) return '';
    if (!this.dataUrlCache) this.dataUrlCache = {};
    const hit = this.dataUrlCache[absPath];
    if (hit && Date.now() - hit.ts < 120000) return hit.url;
    const cap = maxBytes || MAX_INLINE;
    try {
      const st = fs.statSync(absPath);
      if (st.size > cap) return '';
      const mime = MIME[extOf(ext)] || 'application/octet-stream';
      const url = 'data:' + mime + ';base64,' + fs.readFileSync(absPath).toString('base64');
      // 简单上限：缓存条目不超过 60 个，避免图片库把内存吃满
      const keys = Object.keys(this.dataUrlCache);
      if (keys.length > 60) delete this.dataUrlCache[keys[0]];
      this.dataUrlCache[absPath] = { ts: Date.now(), url: url };
      return url;
    } catch (e) {
      return '';
    }
  }

  /* ------------------------------------------------------ safety: log */
  logOp(op) {
    op.ts = Date.now();
    this.opLog.unshift(op);
    if (this.opLog.length > 200) this.opLog.pop();
  }
}
