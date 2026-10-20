/* -------------------------------------------------------------------------
 *  工作台视图 · 设置面板（外观 / 打开方式 / 库管理 / 日志 / 关于）
 *  （本片段由 build.js 拼进 main.js，不要单独 require）
 * ------------------------------------------------------------------------- */
Object.assign(WorkbenchView.prototype, {
  renderDrawer() {
    const el = this.drawerEl;
    if (!el) return;
    el.empty();
    el.className = 'vwb-drawer vwb-glass' + (this.drawerOpen ? ' is-on' : '');
    if (!this.drawerOpen) return;

    const PAGES = [
      ['appearance', tr('drawer.nav.appearance')],
      ['editor', tr('drawer.nav.editor')],
      ['open', tr('drawer.nav.open')],
      ['guide', tr('drawer.nav.guide')],
      ['vaults', tr('drawer.nav.vaults')],
      ['logs', tr('drawer.nav.logs')],
      ['trash', tr('drawer.nav.trash')],
      ['about', tr('drawer.nav.about')]
    ];
    const page = PAGES.some((p) => p[0] === this.drawerPage) ? this.drawerPage : 'appearance';
    this.drawerPage = page;
    const pageName = (PAGES.find((p) => p[0] === page) || PAGES[0])[1];

    const head = el.createDiv({ cls: 'vwb-drawer-head' });
    head.createDiv({ cls: 'vwb-drawer-t', text: tr('drawer.title', { page: pageName }) });
    head.createEl('button', { cls: 'vwb-btn vwb-btn-sm', text: tr('drawer.collapse') })
      .addEventListener('click', () => this.toggleDrawer(false));

    const wrap = el.createDiv({ cls: 'vwb-drawer-wrap' });
    const nav = wrap.createDiv({ cls: 'vwb-drawer-nav' });
    for (const p of PAGES) {
      const it = nav.createDiv({ cls: 'vwb-drawer-nav-i' + (p[0] === page ? ' is-on' : ''), text: p[1] });
      it.addEventListener('click', () => { this.drawerPage = p[0]; this.renderDrawer(); });
    }
    const box = wrap.createDiv({ cls: 'vwb-drawer-body' });
    if (page === 'appearance') this.renderPageAppearance(box);
    else if (page === 'editor') this.renderPageEditor(box);
    else if (page === 'open') this.renderPageOpen(box);
    else if (page === 'guide') this.renderPageGuide(box);
    else if (page === 'vaults') this.renderPageVaults(box);
    else if (page === 'logs') this.renderPageLogs(box);
    else if (page === 'trash') this.renderPageTrash(box);
    else this.renderPageAbout(box);
  },

  /* -------------------------------------------------------- 设置子页：外观 */
  renderPageAppearance(body) {
    const s = this.plugin.settings;
    const ap = this.effectiveAppearance();
    const scopeName = (s.perVaultAppearance && this.selectedVault)
      ? tr('drawer.appearance.scope.per', { name: baseNameOf(this.selectedVault) })
      : tr('drawer.appearance.scope.global');

    /* 风格预设 */
    let sec = body.createDiv({ cls: 'vwb-sec' });
    sec.createEl('h5', { text: tr('drawer.appearance.preset') });
    let chips = sec.createDiv({ cls: 'vwb-chips' });
    for (const key of Object.keys(PRESETS)) {
      const c = chips.createDiv({ cls: 'vwb-chip' + (ap.preset === key ? ' is-on' : ''), text: tr('preset.' + key) });
      c.addEventListener('click', () => {
        markOn(c);
        const p = PRESETS[key];
        this.setApp('preset', key, true);
        this.setApp('blur', p.blur, true);
        this.setApp('dim', p.dim, true);
        if (key === 'mag') this.setApp('density', 'loose', true);
        this.render();       // 密度/预设可能影响网格
        this.renderDrawer(); // 预设会改动滑杆数值，重建一次同步 UI
      });
    }

    /* 工作台壁纸 */
    sec = body.createDiv({ cls: 'vwb-sec' });
    sec.createEl('h5', { text: tr('drawer.appearance.wallpaper') });
    chips = sec.createDiv({ cls: 'vwb-chips' });
    for (const key of Object.keys(WALLPAPERS)) {
      const w = chips.createDiv({
        cls: 'vwb-wp' + ((ap.wallpaper === key && !asStr(ap.customImage)) ? ' is-on' : ''),
        text: tr('wp.' + key)
      });
      w.style.background = key === 'none' ? '#26262a' : WALLPAPERS[key].css;
      w.addEventListener('click', () => {
        markOn(w);
        this.customFileName = '';
        this.setApp('wallpaper', key, true);
        this.setApp('customImage', '', true);
        fileSpan.setText(tr('drawer.appearance.noFile'));
        this.render();
      });
    }

    const rowFile = sec.createDiv({ cls: 'vwb-rowset' });
    rowFile.createEl('span', { cls: 'lb', text: tr('drawer.appearance.custom') });
    const fileBtn = rowFile.createEl('button', { cls: 'vwb-btn vwb-btn-sm', text: tr('drawer.appearance.pick') });
    const fileSpan = rowFile.createEl('span', { cls: 'vwb-file' });
    const curImg = asStr(ap.customImage);
    fileSpan.setText(this.customFileName || (curImg ? (/^data:/i.test(curImg) ? tr('drawer.appearance.loaded') : baseNameOf(curImg)) : tr('drawer.appearance.noFile')));
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.addEventListener('change', () => {
      const f = fileInput.files && fileInput.files[0];
      if (!f) return;
      const realPath = asStr(f.path); // 旧版 Electron 才有，有就用路径（data.json 更干净）
      if (realPath) {
        this.customFileName = f.name;
        this.setApp('wallpaper', 'none', true);
        this.setApp('customImage', realPath, true);
        this.plugin.wallpaperCache = { key: '', url: '' };
        this.render();
        this.renderDrawer();
        new Notice(tr('drawer.appearance.wpApplied'));
        return;
      }
      if (f.size > 8 * 1024 * 1024) {
        new Notice(tr('drawer.appearance.wpTooBig'));
        return;
      }
      if (f.size > 2 * 1024 * 1024) new Notice(tr('drawer.appearance.wpLarge', { size: fmtSize(f.size) }));
      const rd = new FileReader();
      rd.onload = () => {
        this.customFileName = f.name;
        this.setApp('wallpaper', 'none', true);
        this.setApp('customImage', String(rd.result), true);
        this.render();
        this.renderDrawer();
        new Notice(tr('drawer.appearance.wpApplied'));
      };
      rd.readAsDataURL(f);
    });
    fileBtn.addEventListener('click', () => fileInput.click());

    /* 暗化 / 模糊 */
    const rowDim = sec.createDiv({ cls: 'vwb-rowset' });
    rowDim.createEl('span', { cls: 'lb', text: tr('drawer.appearance.dim') });
    const dimIn = rowDim.createEl('input', { type: 'range' });
    dimIn.min = '0'; dimIn.max = '80'; dimIn.step = '5';
    dimIn.value = String(Math.round((typeof ap.dim === 'number' ? ap.dim : 0.25) * 100));
    const dimVal = rowDim.createEl('span', { cls: 'val', text: dimIn.value + '%' });
    dimIn.addEventListener('input', () => {
      dimVal.setText(dimIn.value + '%');
      this.setApp('dim', Number(dimIn.value) / 100, true);
    });

    const rowBlur = sec.createDiv({ cls: 'vwb-rowset' });
    rowBlur.createEl('span', { cls: 'lb', text: tr('drawer.appearance.blur') });
    const blurIn = rowBlur.createEl('input', { type: 'range' });
    blurIn.min = '0'; blurIn.max = '40'; blurIn.step = '1';
    blurIn.value = String(typeof ap.blur === 'number' ? ap.blur : 20);
    const blurVal = rowBlur.createEl('span', { cls: 'val', text: blurIn.value + 'px' });
    blurIn.addEventListener('input', () => {
      blurVal.setText(blurIn.value + 'px');
      this.setApp('blur', Number(blurIn.value), true);
    });
    for (const r of [dimIn, blurIn]) r.addEventListener('keydown', (e) => e.stopPropagation());

    /* 主题色 */
    sec = body.createDiv({ cls: 'vwb-sec' });
    sec.createEl('h5', { text: tr('drawer.appearance.accent') });
    const swRow = sec.createDiv({ cls: 'vwb-chips' });
    const ACCENTS = ['#7f6df2', '#3aa0f0', '#e05561', '#2fb87a', '#e0a03a'];
    for (const c of ACCENTS) {
      const sw = swRow.createDiv({ cls: 'vwb-sw' + (asStr(ap.accent).toLowerCase() === c ? ' is-on' : '') });
      sw.style.background = c;
      sw.addEventListener('click', () => {
        markOn(sw);
        colorIn.value = c;
        this.setApp('accent', c, true);
      });
    }
    const colorIn = swRow.createEl('input', { type: 'color' });
    colorIn.value = /^#[0-9a-f]{6}$/i.test(asStr(ap.accent)) ? ap.accent : '#7f6df2';
    colorIn.addEventListener('input', () => {
      this.setApp('accent', colorIn.value, true);
    });

    /* 布局 */
    sec = body.createDiv({ cls: 'vwb-sec' });
    sec.createEl('h5', { text: tr('drawer.appearance.density') });
    chips = sec.createDiv({ cls: 'vwb-chips' });
    [['tight', tr('common.compact')], ['comfy', tr('common.standard')], ['loose', tr('common.loose')]].forEach((o) => {
      const c = chips.createDiv({ cls: 'vwb-chip' + (ap.density === o[0] ? ' is-on' : ''), text: o[1] });
      c.addEventListener('click', () => { markOn(c); this.setApp('density', o[0]); });
    });

    /* 行为 */
    sec = body.createDiv({ cls: 'vwb-sec' });
    sec.createEl('h5', { text: tr('drawer.appearance.behavior') });
    chips = sec.createDiv({ cls: 'vwb-chips' });
    [['side', tr('common.side')], ['float', tr('common.float')], ['bottom', tr('common.bottom')]].forEach((o) => {
      const c = chips.createDiv({ cls: 'vwb-chip' + (ap.previewPos === o[0] ? ' is-on' : ''), text: o[1] });
      c.addEventListener('click', () => { markOn(c); this.setApp('previewPos', o[0], true); });
    });

    const tgRow = (label, checked, onChange, testid) => {
      const wrap = sec.createEl('label', { cls: 'vwb-tg' });
      if (testid) wrap.setAttribute('data-testid', testid);
      const cb = wrap.createEl('input', { type: 'checkbox' });
      cb.checked = !!checked;
      cb.addEventListener('change', () => onChange(cb.checked));
      wrap.createEl('span', { text: label });
    };
    tgRow(tr('drawer.tg.stats'), ap.showStats, (v) => this.setApp('showStats', v), 'vh-drawer-tg-stats');
    tgRow(tr('drawer.tg.meta'), ap.showMeta, (v) => this.setApp('showMeta', v), 'vh-drawer-tg-meta');
    tgRow(tr('drawer.tg.summary'), ap.showSummary !== false, (v) => this.setApp('showSummary', v), 'vh-drawer-tg-summary');
    tgRow(tr('drawer.tg.pervault'), s.perVaultAppearance, (v) => {
      s.perVaultAppearance = v;
      if (v && this.selectedVault) {
        if (!s.vaultAppearance) s.vaultAppearance = {};
        if (!s.vaultAppearance[this.selectedVault]) {
          s.vaultAppearance[this.selectedVault] = Object.assign({}, s.appearance);
        }
      }
      this.plugin.saveSettings();
      this.applyAppearance();
      this.render();
      this.renderDrawer();
    }, 'vh-drawer-tg-pervault');

    // 界面语言：跟随 Obsidian / 中文 / English（和原生设置页是同一份设置）
    const langRow = sec.createDiv({ cls: 'vwb-langrow' });
    langRow.createEl('span', { text: tr('set.lang.name') });
    const langChips = langRow.createDiv({ cls: 'vwb-chips' });
    [['auto', tr('set.lang.auto')], ['zh', tr('set.lang.zh')], ['en', tr('set.lang.en')]].forEach((o) => {
      const cur = s.ui.lang || 'auto';
      const c = langChips.createDiv({ cls: 'vwb-chip' + (cur === o[0] ? ' is-on' : ''), text: o[1] });
      c.addEventListener('click', async () => {
        if ((s.ui.lang || 'auto') === o[0]) return;
        s.ui.lang = o[0];
        await this.plugin.saveSettings();
        this.plugin.applyLang();   // 会重画视图、抽屉和原生设置页
        new Notice(tr('set.lang.name') + '：' + o[1]);
      });
    });

    const scope = body.createDiv({ cls: 'vwb-scope', text: tr('drawer.appearance.scope', { scope: scopeName }) });
    scope.addEventListener('click', () => new Notice(tr('drawer.appearance.scope', { scope: scopeName })));

    /* 底部 */
    const foot = body.createDiv({ cls: 'vwb-drawer-foot' });
    foot.createEl('button', { cls: 'vwb-btn vwb-btn-pri vwb-drawer-save', text: tr('drawer.appearance.save') })
      .addEventListener('click', () => {
        this.plugin.saveSettings();
        this.applyAppearance();
        this.render();
        new Notice(tr('drawer.appearance.saved'));
      });
    foot.createDiv({ cls: 'vwb-link', text: tr('drawer.appearance.native') })
      .addEventListener('click', () => this.openPluginSettings());
  },

  /* ---------------------------------------------------- 设置子页：打开方式 */
  renderPageOpen(body) {
    const cur = openModeOf(this.plugin.settings.open.mode);
    const sec = body.createDiv({ cls: 'vwb-sec' });
    sec.createEl('h5', { text: tr('drawer.open.title') });
    sec.createDiv({ cls: 'vwb-note', text: tr('drawer.open.note') });

    for (const m of OPEN_MODES) {
      const card = sec.createDiv({ cls: 'vwb-mode' + (m.id === cur.id ? ' is-on' : '') });
      const hd = card.createDiv({ cls: 'vwb-mode-hd' });
      hd.createEl('span', { cls: 'vwb-mode-nm', text: tr('mode.open.' + m.id + '.label') + (m.def ? tr('drawer.open.def') : '') });
      if (m.id === cur.id) hd.createEl('span', { cls: 'vwb-mode-ck', text: tr('drawer.open.using') });
      card.createDiv({ cls: 'vwb-mode-ds', text: tr('mode.open.' + m.id + '.tip') });
      card.setAttribute('title', tr('mode.open.' + m.id + '.tip'));
      card.addEventListener('click', () => {
        this.plugin.setOpenMode(m.id);
        this.renderDrawer();
      });
    }

    const tip = body.createDiv({ cls: 'vwb-note', text: tr('drawer.open.guide') });
    tip.addEventListener('click', () => { this.drawerPage = 'guide'; this.renderDrawer(); });
  },

  /* ---------------------------------------------------- 设置子页：编辑器 */
  renderPageEditor(body) {
    const s = this.plugin.settings;
    if (!s.editor) s.editor = { mode: 'live', syncScroll: true };
    const cur = editorModeOf(s.editor.mode);

    const sec = body.createDiv({ cls: 'vwb-sec' });
    sec.createEl('h5', { text: tr('drawer.editor.title') });
    sec.createDiv({ cls: 'vwb-note', text: tr('drawer.editor.note') });
    for (const m of EDITOR_MODES) {
      const card = sec.createDiv({ cls: 'vwb-mode' + (m.id === cur.id ? ' is-on' : '') });
      const hd = card.createDiv({ cls: 'vwb-mode-hd' });
      hd.createEl('span', { cls: 'vwb-mode-nm', text: tr('mode.editor.' + m.id + '.label') + (m.def ? tr('drawer.open.def') : '') });
      if (m.id === cur.id) hd.createEl('span', { cls: 'vwb-mode-ck', text: tr('drawer.open.using') });
      card.createDiv({ cls: 'vwb-mode-ds', text: tr('mode.editor.' + m.id + '.tip') });
      card.setAttribute('title', tr('mode.editor.' + m.id + '.tip'));
      card.addEventListener('click', () => {
        this.setEditorMode(m.id);
        this.renderDrawer();
      });
    }

    const sec2 = body.createDiv({ cls: 'vwb-sec' });
    sec2.createEl('h5', { text: tr('drawer.editor.split') });
    const tgRow = (label, checked, onChange) => {
      const w = sec2.createEl('label', { cls: 'vwb-tg' });
      const cb = w.createEl('input', { type: 'checkbox' });
      cb.checked = !!checked;
      cb.addEventListener('change', () => onChange(cb.checked));
      w.createEl('span', { text: label });
    };
    tgRow(tr('drawer.editor.sync'), s.editor.syncScroll !== false, (v) => {
      s.editor.syncScroll = v;
      this.plugin.saveSettings();
      if (this.docMode === 'edit') this.buildEditor(this.selectedNote);
    });

    const sec3 = body.createDiv({ cls: 'vwb-sec' });
    sec3.createEl('h5', { text: tr('drawer.editor.scKeys') });
    for (const r of SHORTCUTS.editor) {
      const row = sec3.createDiv({ cls: 'vwb-kv' });
      row.createEl('kbd', { text: tr(r[0]) });
      row.createEl('span', { text: tr(r[1]) });
    }

    const sec4 = body.createDiv({ cls: 'vwb-sec' });
    sec4.createEl('h5', { text: tr('drawer.editor.scPara') });
    for (const r of SHORTCUTS.para) {
      const row = sec4.createDiv({ cls: 'vwb-kv' });
      row.createEl('kbd', { text: tr(r[0]) });
      row.createEl('span', { text: tr(r[1]) });
    }

    const sec5 = body.createDiv({ cls: 'vwb-sec' });
    sec5.createEl('h5', { text: tr('drawer.editor.scCanvas') });
    for (const r of SHORTCUTS.canvas) {
      const row = sec5.createDiv({ cls: 'vwb-kv' });
      row.createEl('kbd', { text: tr(r[0]) });
      row.createEl('span', { text: tr(r[1]) });
    }
    sec5.createDiv({ cls: 'vwb-note', text: tr('drawer.editor.canvasNote') });
  },

  /* -------------------------------------------------- 设置子页：使用说明 */
  renderPageGuide(body) {
    const sec = body.createDiv({ cls: 'vwb-sec' });
    sec.createEl('h5', { text: tr('guide.quick') });
    for (let gi = 1; gi <= 6; gi++) sec.createDiv({ cls: 'vwb-log', text: tr('guide.step' + gi) });

    const sec2 = body.createDiv({ cls: 'vwb-sec' });
    sec2.createEl('h5', { text: tr('guide.feats') });
    for (let gi = 1; gi <= 15; gi++) sec2.createDiv({ cls: 'vwb-log', text: tr('guide.feat' + gi) });


    const sec3 = body.createDiv({ cls: 'vwb-sec' });
    sec3.createEl('h5', { text: tr('ui.193') });
    for (const r of SHORTCUTS.editor) {
      const row = sec3.createDiv({ cls: 'vwb-kv' });
      row.createEl('kbd', { text: tr(r[0]) });
      row.createEl('span', { text: tr(r[1]) });
    }

    const sec3b = body.createDiv({ cls: 'vwb-sec' });
    sec3b.createEl('h5', { text: tr('guide.paraKeys') });
    for (const r of SHORTCUTS.para) {
      const row = sec3b.createDiv({ cls: 'vwb-kv' });
      row.createEl('kbd', { text: tr(r[0]) });
      row.createEl('span', { text: tr(r[1]) });
    }

    const sec3c = body.createDiv({ cls: 'vwb-sec' });
    sec3c.createEl('h5', { text: tr('guide.canvasKeys') });
    for (const r of SHORTCUTS.canvas) {
      const row = sec3c.createDiv({ cls: 'vwb-kv' });
      row.createEl('kbd', { text: tr(r[0]) });
      row.createEl('span', { text: tr(r[1]) });
    }

    const sec3d = body.createDiv({ cls: 'vwb-sec' });
    sec3d.createEl('h5', { text: tr('guide.readCopy') });
    for (const r of SHORTCUTS.read) {
      const row = sec3d.createDiv({ cls: 'vwb-kv' });
      row.createEl('kbd', { text: tr(r[0]) });
      row.createEl('span', { text: tr(r[1]) });
    }

    const sec3e = body.createDiv({ cls: 'vwb-sec' });
    sec3e.createEl('h5', { text: tr('guide.fileKeys') });
    for (const r of SHORTCUTS.files) {
      const row = sec3e.createDiv({ cls: 'vwb-kv' });
      row.createEl('kbd', { text: tr(r[0]) });
      row.createEl('span', { text: tr(r[1]) });
    }

    const sec4 = body.createDiv({ cls: 'vwb-sec' });
    sec4.createEl('h5', { text: tr('guide.navKeys') });
    for (const r of SHORTCUTS.nav) {
      const row = sec4.createDiv({ cls: 'vwb-kv' });
      row.createEl('kbd', { text: tr(r[0]) });
      row.createEl('span', { text: tr(r[1]) });
    }

    const sec5 = body.createDiv({ cls: 'vwb-sec' });
    sec5.createEl('h5', { text: tr('guide.iconTitle') });
    const rows5 = [
      ['👁', tr('guide.icon1')],
      [tr('ui.194'), tr('guide.icon2')],
      ['☰', tr('guide.icon3')],
      ['⤢ / ⤡', tr('guide.icon4')],
      [tr('ui.185'), tr('guide.icon5')]
    ];
    for (const r of rows5) {
      const row = sec5.createDiv({ cls: 'vwb-kv' });
      row.createEl('kbd', { text: tr(r[0]) });
      row.createEl('span', { text: tr(r[1]) });
    }
  },

  /* ---------------------------------------------------- 设置子页：库管理 */
  renderPageVaults(body) {
    const s = this.plugin.settings;
    const sec = body.createDiv({ cls: 'vwb-sec' });
    sec.createEl('h5', { text: tr('ui.195') });
    sec.createDiv({
      cls: 'vwb-note',
      text: tr('ui.196') +
        tr('ui.197') +
        tr('ui.198')
    });

    const list = this.plugin.discoverVaults();
    const hidden = s.vaults.hidden || [];
    const all = list.concat(
      hidden.filter((p) => !list.some((v) => v.id === p))
        .map((p) => ({ id: p, name: baseNameOf(p), path: p, current: false, hidden: true }))
    );
    if (!all.length) sec.createDiv({ cls: 'vwb-cnt', text: tr('ui.199') });

    for (const v of all) {
      const st = (v.wb == null) ? this.plugin.workbenchStateOf(v.path) : { state: v.wb, ver: v.wbVer };
      const row = sec.createDiv({ cls: 'vwb-vrow' + (v.hidden ? ' is-off' : '') });
      row.createDiv({ cls: 'vwb-vrow-nm', text: (v.current ? '● ' : '') + v.name + (v.hidden ? tr('drawer.vaults.hidden') : '') });
      row.createDiv({ cls: 'vwb-vrow-pt', text: v.path });

      const sw = row.createDiv({ cls: 'vwb-chip' + (v.current ? ' is-off' : ' is-on'), text: v.current ? tr('drawer.vaults.current') : tr('drawer.vaults.switch') });
      sw.setAttribute('title', v.current
        ? tr('ui.200')
        : (looksLikeVault(v.path)
          ? tr('ui.201')
          : tr('ui.202')));
      sw.addEventListener('click', () => {
        if (v.hidden) { new Notice(tr('ui.203')); return; }
        this.plugin.switchToVault(v.path);
      });

      const inst = row.createDiv({
        cls: 'vwb-chip' + (v.current || st.state === 'ok' ? '' : ' is-on'),
        text: v.current ? tr('drawer.vaults.installed') : (st.state === 'stale' ? tr('drawer.vaults.update') : (st.state === 'ok' ? tr('drawer.vaults.installed') : tr('drawer.vaults.install')))
      });
      inst.setAttribute('title', v.current || st.state === 'ok'
        ? tr('ui.204')
        : tr('ui.205'));
      inst.addEventListener('click', () => {
        if (v.current || st.state === 'ok') return;
        const d = this.plugin.deployWorkbenchTo(v.path);
        if (!d.ok) new Notice(tr('ui.206') + (d.reason || tr('ui.207')));
        else if (d.changed) {
          new Notice(!d.from
            ? tr('ui.208') + v.name + tr('ui.209')
            : tr('drawer.vaultUpdatedTo', { name: v.name, ver: d.to }), 10000);
        } else {
          new Notice('「' + v.name + tr('ui.211'));
        }
        this.renderDrawer();
        this.renderRail();
      });

      const tg = row.createDiv({ cls: 'vwb-chip' + (v.hidden ? '' : ' is-on'), text: v.hidden ? tr('common.show') : tr('common.hide') });
      tg.addEventListener('click', () => {
        const h = s.vaults.hidden;
        const i = h.indexOf(v.id);
        if (v.hidden) { if (i >= 0) h.splice(i, 1); }
        else if (i < 0) h.push(v.id);
        this.plugin.saveSettings();
        this.plugin.refreshViews();
        this.renderRail();
        this.renderDrawer();
      });
    }

    const sec2 = body.createDiv({ cls: 'vwb-sec' });
    sec2.createEl('h5', { text: tr('drawer.vaults.addTitle') });
    const rowAdd = sec2.createDiv({ cls: 'vwb-rowset' });
    rowAdd.createEl('span', { cls: 'lb', text: tr('common.path') });
    const inAdd = rowAdd.createEl('input', { type: 'text', placeholder: tr('ui.212') });
    inAdd.className = 'vwb-in';
    inAdd.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') this.addExtraVault(inAdd.value);
    });
    const btnAdd = rowAdd.createEl('button', { cls: 'vwb-btn vwb-btn-sm', text: tr('common.add') });
    btnAdd.addEventListener('click', () => this.addExtraVault(inAdd.value));

    if ((s.vaults.extra || []).length) {
      const sec3 = body.createDiv({ cls: 'vwb-sec' });
      sec3.createEl('h5', { text: tr('drawer.vaults.addedTitle') });
      for (const p of s.vaults.extra.slice()) {
        const r = sec3.createDiv({ cls: 'vwb-vrow' });
        r.createDiv({ cls: 'vwb-vrow-pt', text: p });
        const rm = r.createDiv({ cls: 'vwb-chip', text: tr('common.remove') });
        rm.addEventListener('click', () => {
          // 本库设置 + 全局清单一起删，不然切个库它又回来了
          this.plugin.forgetVaultPath(p);
          this.plugin.refreshViews();
          this.renderRail();
          this.renderDrawer();
        });
      }
    }

    const sec4 = body.createDiv({ cls: 'vwb-sec' });
    sec4.createEl('h5', { text: tr('ui.213') });
    sec4.createDiv({
      cls: 'vwb-note',
      text: tr('ui.214') +
        tr('ui.215') + sharedVaultsPath()
    });
  },

  /* 手动添加：写进本库设置的同时也写进全局清单 ——
   * 只写本库的话，切到别的库这个登记就没了（清单跟着库走 = 每次切库都要重加）。 */
  addExtraVault(v) {
    const p = (v || '').trim().replace(/\\/g, '/').replace(/\/+$/, '');
    if (!p || p.length < 3) return;
    const extra = this.plugin.settings.vaults.extra;
    if (extra.indexOf(p) >= 0) { new Notice(tr('ui.216')); return; }
    this.plugin.registerVaultPath(p);
    this.plugin.refreshViews();
    this.renderRail();
    this.renderDrawer();
    new Notice(looksLikeVault(p)
      ? tr('ui.217') + p
      : tr('ui.217') + p + tr('ui.218'), 8000);
  },

  /* -------------------------------------------------- 设置子页：操作日志 */
  renderPageLogs(body) {
    const sec = body.createDiv({ cls: 'vwb-sec' });
    sec.createEl('h5', { text: tr('drawer.logs.title') });
    sec.createDiv({
      cls: 'vwb-note',
      text: tr('ui.219')
    });
    const logs = this.plugin.opLog || [];
    if (!logs.length) {
      sec.createDiv({ cls: 'vwb-cnt', text: tr('drawer.logs.empty') });
    } else {
      for (const op of logs.slice(0, 40)) {
        const row = sec.createDiv({ cls: 'vwb-log' });
        row.createEl('span', {
          text: fmtDate(op.ts) + ' · ' + op.type + ' · ' + (op.path || '')
        });
        if (op.undo) {
          const ub = row.createDiv({ cls: 'vwb-chip', text: tr('common.undo') });
          ub.setAttribute('title', tr('ui.220'));
          ub.addEventListener('click', () => this.undoOp(op));
        }
      }
    }

    const sec2 = body.createDiv({ cls: 'vwb-sec' });
    sec2.createEl('h5', { text: tr('drawer.logs.index') });
    const row = sec2.createDiv({ cls: 'vwb-rowset' });
    row.createEl('span', { cls: 'lb', text: tr('drawer.logs.external') });
    row.createEl('button', { cls: 'vwb-btn vwb-btn-sm', text: tr('common.rescan') })
      .addEventListener('click', () => {
        this.plugin.externalCache = {};
        this.render();
        new Notice(tr('ui.221'));
      });
    // 跨库全文搜索的索引：清掉之后下次搜索会重建（改了很多笔记觉得搜不准时用）
    const row2 = sec2.createDiv({ cls: 'vwb-rowset' });
    row2.createEl('span', { cls: 'lb', text: tr('drawer.logs.searchIdx') });
    row2.createEl('button', { cls: 'vwb-btn vwb-btn-sm', text: tr('common.rebuild') })
      .addEventListener('click', () => {
        this.plugin.clearSearchIndexes();
        this.crossHits = null;
        new Notice(tr('ui.222'));
      });
    sec2.createDiv({
      cls: 'vwb-note',
      text: tr('ui.223') + searchIndexDir() + tr('ui.224')
    });
  },

  /* ---------------------------------------------------- 设置子页：回收站 */
  /* 在别的库里删掉的东西，不用再跑到各自的库里去翻 .trash —— 这里一次看全，
   * 能还原到原位置（原路径记在 .trash 的映射表里，重启也不丢）。 */
  renderPageTrash(body) {
    const sec = body.createDiv({ cls: 'vwb-sec' });
    sec.createEl('h5', { text: tr('drawer.trash.title') });
    sec.createDiv({
      cls: 'vwb-note',
      text: tr('ui.225') +
        tr('ui.226')
    });
    const groups = this.plugin.trashList();
    if (!groups.length) {
      sec.createDiv({ cls: 'vwb-cnt', text: tr('drawer.trash.empty') });
      return;
    }
    for (const g of groups) {
      const box = body.createDiv({ cls: 'vwb-sec' });
      const head = box.createDiv({ cls: 'vwb-trash-h' });
      head.createEl('span', { text: g.vaultName + ' · ' + tr('drawer.trash.items', { n: g.items.length }) });
      const clr = head.createDiv({ cls: 'vwb-chip', text: tr('drawer.trash.clear') });
      clr.setAttribute('title', tr('ui.227'));
      clr.addEventListener('click', () => {
        this.confirmBox({
          title: tr('ui.228') + g.vaultName + tr('ui.229'),
          desc: tr('ui.230') + g.items.length + tr('ui.231'),
          danger: true,
          okText: tr('ui.232'),
          onOk: () => {
            const r = this.plugin.emptyVaultTrash(g.vault);
            new Notice(tr('ui.233') + r.count + tr('ui.234'));
            this.renderDrawer();
            this.render();
          }
        });
      });
      for (const it of g.items) {
        const row = box.createDiv({ cls: 'vwb-trash-i' });
        const main = row.createDiv({ cls: 'vwb-trash-m' });
        main.createDiv({ cls: 'vwb-trash-nm', text: it.isDir ? '📁 ' + it.name : it.name });
        main.createDiv({
          cls: 'vwb-trash-pt',
          text: it.known ? tr('drawer.trash.origin', { path: it.rel }) : tr('drawer.trash.unknown')
        });
        if (it.known) {
          const rb = row.createDiv({ cls: 'vwb-chip is-on', text: tr('drawer.trash.restore') });
          rb.setAttribute('title', tr('drawer.trash.origin', { path: it.rel }));
          rb.addEventListener('click', () => {
            const r = this.plugin.restoreTrashItem(g.vault, it.name);
            new Notice(r.ok ? (tr('ui.235') + it.rel) : r.reason);
            this.renderDrawer();
            this.render();
          });
        } else {
          row.createDiv({ cls: 'vwb-chip is-off', text: tr('drawer.trash.cant') });
        }
        const pb = row.createDiv({ cls: 'vwb-chip', text: tr('drawer.trash.purge') });
        pb.setAttribute('title', tr('ui.236'));
        pb.addEventListener('click', () => {
          this.confirmBox({
            title: tr('ui.237'),
            desc: it.name + tr('ui.238'),
            danger: true,
            okText: tr('ui.93'),
            onOk: () => {
              this.plugin.purgeTrashItem(g.vault, it.name);
              this.renderDrawer();
              this.render();
            }
          });
        });
      }
    }
  },

  /* 撤销一步外部库操作（重命名 / 删除） */
  undoOp(op) {
    if (!op || !op.undo) return;
    this.confirmBox({
      title: tr('ui.239'),
      desc: tr('ui.240') + (op.path || '') + tr('ui.241') + (op.refs ? tr('ui.242') + op.refs + tr('ui.243') : ''),
      okText: tr('drawer.undo'),
      onOk: () => {
        const r = op.undo === 'ext-rename' ? this.plugin.undoExtRename(op) : this.plugin.undoExtDelete(op);
        if (!r.ok) { new Notice(r.reason || tr('ui.244')); return; }
        new Notice(tr('ui.245') + (op.path || ''));
        this.renderDrawer();
        this.render();
      }
    });
  },

  /* ------------------------------------------------------ 设置子页：关于 */
  renderPageAbout(body) {
    const sec = body.createDiv({ cls: 'vwb-sec' });
    sec.createEl('h5', { text: tr('about.title') });
    sec.createDiv({ cls: 'vwb-note', text: tr('about.intro') });
    sec.createDiv({ cls: 'vwb-log', text: tr('about.version', { ver: (this.plugin.manifest && this.plugin.manifest.version ? this.plugin.manifest.version : '-') }) });
    sec.createDiv({ cls: 'vwb-log', text: tr('about.rail') });
    sec.createDiv({ cls: 'vwb-log', text: tr('about.editor') });
    sec.createDiv({ cls: 'vwb-log', text: tr('about.roadmap') });
    body.createDiv({ cls: 'vwb-link', text: tr('drawer.about.guide') })
      .addEventListener('click', () => { this.drawerPage = 'guide'; this.renderDrawer(); });
    body.createDiv({ cls: 'vwb-link', text: tr('ui.246') })
      .addEventListener('click', () => this.openPluginSettings());
  }

  /* ------------------------------------------------------------ render */
});
