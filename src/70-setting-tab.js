/* -------------------------------------------------------------------------
 *  Obsidian 原生设置中心（通用 / 外观 / 库管理 / 安全与日志 / 关于）
 *  （本片段由 build.js 拼进 main.js，不要单独 require）
 * ------------------------------------------------------------------------- */
class WorkbenchSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.sub = 'general';
  }

  display() {
    const el = this.containerEl;
    el.empty();
    el.createEl('h2', { text: tr('set.title') });

    const tabs = el.createDiv({ cls: 'vwb-set-tabs' });
    const pages = [
      ['general', tr('set.tab.general')],
      ['appearance', tr('set.tab.appearance')],
      ['vaults', tr('set.tab.vaults')],
      ['safety', tr('set.tab.safety')],
      ['about', tr('set.tab.about')]
    ];
    for (const p of pages) {
      const t = tabs.createDiv({ cls: 'vwb-set-tab' + (this.sub === p[0] ? ' is-on' : ''), text: p[1] });
      t.addEventListener('click', () => { this.sub = p[0]; this.display(); });
    }

    if (this.sub === 'general') this.renderGeneral(el);
    if (this.sub === 'appearance') this.renderAppearance(el);
    if (this.sub === 'vaults') this.renderVaults(el);
    if (this.sub === 'safety') this.renderSafety(el);
    if (this.sub === 'about') this.renderAbout(el);
  }

  applyNow() {
    this.plugin.saveSettings();
    this.plugin.refreshViews();
  }

  renderGeneral(el) {
    const op = this.plugin.settings.open;

    // 界面语言：跟随 Obsidian / 中文 / English。改完立刻重画所有 UI
    new Setting(el)
      .setName(tr('set.lang.name'))
      .setDesc(tr('set.lang.desc'))
      .addDropdown((d) => {
        d.addOption('auto', tr('set.lang.auto'));
        d.addOption('zh', tr('set.lang.zh'));
        d.addOption('en', tr('set.lang.en'));
        d.setValue(this.plugin.settings.ui.lang || 'auto');
        d.onChange(async (v) => {
          this.plugin.settings.ui.lang = v;
          await this.plugin.saveSettings();
          this.plugin.applyLang();
          new Notice(tr('set.langChanged', {
            lang: (v === 'auto' ? tr('set.lang.auto') : (v === 'en' ? tr('set.lang.en') : tr('set.lang.zh')))
          }));
        });
      });

    new Setting(el)
      .setName(tr('set.open.name'))
      .setDesc(tr('set.open.desc'))
      .addDropdown((d) => {
        for (const m of OPEN_MODES) d.addOption(m.id, tr('mode.open.' + m.id + '.label') + (m.def ? tr('ui.11') : ''));
        d.setValue(openModeOf(op.mode).id);
        d.onChange(async (v) => {
          this.plugin.setOpenMode(v);
          new Notice(tr('set.openUpdated'));
        });
      });

    el.createEl('p', {
      cls: 'setting-item-description',
      text: tr('set.panelNoteLong')
    });
    el.createEl('p', {
      cls: 'setting-item-description',
      text: tr('set.openTipLong')
    });
  }

  renderAppearance(el) {
    const ap = this.plugin.settings.appearance;

    new Setting(el).setName(tr('set.preset.name')).setDesc(tr('set.preset.desc'))
      .addDropdown((d) => {
        for (const key of Object.keys(PRESETS)) d.addOption(key, tr('preset.' + key));
        d.setValue(ap.preset);
        d.onChange(async (v) => {
          const p = PRESETS[v];
          ap.preset = v;
          ap.blur = p.blur;
          ap.dim = p.dim;
          await this.plugin.saveSettings();
          this.display();
          this.plugin.refreshViews();
        });
      });

    new Setting(el).setName(tr('set.wallpaper.name')).setDesc(tr('set.wallpaper.desc'))
      .addDropdown((d) => {
        for (const key of Object.keys(WALLPAPERS)) d.addOption(key, tr('wp.' + key));
        d.setValue(ap.wallpaper);
        d.onChange(async (v) => { ap.wallpaper = v; ap.customImage = ''; this.applyNow(); this.display(); });
      });

    new Setting(el).setName(tr('set.wallpaperPath.name')).setDesc(tr('set.wallpaperPath.desc'))
      .addText((t) => {
        t.setPlaceholder(tr('set.wallpaperPlaceholder'));
        t.setValue(ap.customImage);
        t.onChange(async (v) => {
          ap.customImage = v.trim();
          this.plugin.wallpaperCache = { key: '', url: '' };
          await this.plugin.saveSettings();
        });
      });

    new Setting(el).setName(tr('set.dim.name')).setDesc(tr('set.dim.desc'))
      .addSlider((s) => {
        s.setLimits(0, 0.8, 0.05).setValue(ap.dim).setDynamicTooltip();
        s.onChange(async (v) => { ap.dim = v; this.applyNow(); });
      });

    new Setting(el).setName(tr('set.blur.name')).setDesc(tr('set.blur.desc'))
      .addSlider((s) => {
        s.setLimits(0, 40, 1).setValue(ap.blur).setDynamicTooltip();
        s.onChange(async (v) => { ap.blur = v; this.applyNow(); });
      });

    new Setting(el).setName(tr('set.accent.name')).setDesc(tr('set.accent.desc'))
      .addText((t) => {
        t.setValue(ap.accent);
        t.onChange(async (v) => { ap.accent = v.trim() || '#7f6df2'; this.applyNow(); });
      });

    new Setting(el).setName(tr('set.accentQuick.name')).setDesc(tr('set.accentQuick.desc'))
      .addButton((b) => { b.setButtonText(tr('set.accentPurple')); b.onClick(async () => { ap.accent = '#7f6df2'; this.applyNow(); this.display(); }); })
      .addButton((b) => { b.setButtonText(tr('set.accentBlue')); b.onClick(async () => { ap.accent = '#3aa0f0'; this.applyNow(); this.display(); }); })
      .addButton((b) => { b.setButtonText(tr('set.accentRed')); b.onClick(async () => { ap.accent = '#e05561'; this.applyNow(); this.display(); }); })
      .addButton((b) => { b.setButtonText(tr('set.accentGreen')); b.onClick(async () => { ap.accent = '#2fb87a'; this.applyNow(); this.display(); }); })
      .addButton((b) => { b.setButtonText(tr('set.accentGold')); b.onClick(async () => { ap.accent = '#e0a03a'; this.applyNow(); this.display(); }); });

    new Setting(el).setName(tr('set.density.name')).setDesc(tr('set.density.desc'))
      .addDropdown((d) => {
        d.addOption('tight', tr('set.density.tight')).addOption('comfy', tr('set.density.comfy')).addOption('loose', tr('set.density.loose'));
        d.setValue(ap.density);
        d.onChange(async (v) => { ap.density = v; this.applyNow(); });
      });

    new Setting(el).setName(tr('set.previewPos.name')).setDesc(tr('set.previewPos.desc'))
      .addDropdown((d) => {
        d.addOption('side', tr('set.pos.side')).addOption('float', tr('set.pos.float')).addOption('bottom', tr('set.pos.bottom'));
        d.setValue(ap.previewPos);
        d.onChange(async (v) => { ap.previewPos = v; this.applyNow(); });
      });

    new Setting(el).setName(tr('set.stats.name')).setDesc(tr('set.stats.desc'))
      .addToggle((t) => t.setValue(ap.showStats).onChange(async (v) => { ap.showStats = v; this.applyNow(); }));

    new Setting(el)
      .setName(tr('set.clickSelected.name'))
      .setDesc(tr('set.clickSelected.desc'))
      .addDropdown((d) => d
        .addOption('open', tr('set.click.open'))
        .addOption('deselect', tr('set.click.deselect'))
        .setValue(this.plugin.settings.view.clickSelected || 'open')
        .onChange(async (v) => {
          this.plugin.settings.view.clickSelected = v;
          await this.plugin.saveSettings();
        }));

    new Setting(el).setName(tr('set.meta.name')).setDesc(tr('set.meta.desc'))
      .addToggle((t) => t.setValue(ap.showMeta).onChange(async (v) => { ap.showMeta = v; this.applyNow(); }));

    new Setting(el).setName(tr('set.summary.name')).setDesc(tr('set.summary.desc'))
      .addToggle((t) => t.setValue(ap.showSummary !== false).onChange(async (v) => { ap.showSummary = v; this.applyNow(); }));

    new Setting(el).setName(tr('set.inbox.name')).setDesc(tr('set.inbox.desc'))
      .addText((t) => t.setValue(this.plugin.settings.view.inbox || 'inbox').onChange(async (v) => {
        this.plugin.settings.view.inbox = String(v || '').trim() || 'inbox';
        await this.plugin.saveSettings();
      }));
  }

  renderVaults(el) {
    el.createEl('p', { text: tr('set.vaultsNote'), cls: 'setting-item-description' });

    const list = this.plugin.discoverVaults();
    const all = list.concat(
      (this.plugin.settings.vaults.hidden || []).map((p) => ({ id: p, name: baseNameOf(p), path: p, current: false, source: 'auto', hidden: true }))
    );

    for (const v of all) {
      new Setting(el)
        .setName((v.current ? '● ' : '') + v.name)
        .setDesc(v.path + (v.source === 'manual' ? tr('set.vault.manual') : '') + (v.hidden ? tr('set.vault.hidden') : ''))
        .addToggle((t) => {
          t.setValue(!v.hidden);
          t.setTooltip(tr('set.toggleShow'));
          t.onChange(async (on) => {
            const hidden = this.plugin.settings.vaults.hidden;
            const key = v.id;
            const idx = hidden.indexOf(key);
            if (on && idx >= 0) hidden.splice(idx, 1);
            if (!on && idx < 0) hidden.push(key);
            await this.plugin.saveSettings();
            this.plugin.refreshViews();
            this.display();
          });
        })
        .addText((txt) => {
          txt.setPlaceholder(tr('set.alias'));
          txt.setValue(this.plugin.settings.vaults.aliases[v.id] || '');
          txt.onChange(async (val) => {
            const aliases = this.plugin.settings.vaults.aliases;
            if (val.trim()) aliases[v.id] = val.trim();
            else delete aliases[v.id];
            await this.plugin.saveSettings();
            this.plugin.refreshViews();
          });
        });
    }

    new Setting(el)
      .setName(tr('set.addVault.name'))
      .setDesc(tr('set.addVault.desc'))
      .addText((t) => {
        t.setPlaceholder(tr('ui.212'));
        t.onChange(async (v) => {
          const p = (v || '').trim().replace(/\\/g, '/');
          if (!p || p.length < 3) return;
          const extra = this.plugin.settings.vaults.extra;
          if (extra.indexOf(p) < 0) {
            extra.push(p);
            await this.plugin.saveSettings();
            this.plugin.refreshViews();
            this.display();
            new Notice(tr('ui.217') + p);
          }
        });
      });
  }

  renderSafety(el) {
    el.createEl('p', { text: tr('set.logNote'), cls: 'setting-item-description' });

    new Setting(el).setName(tr('set.reindex.name')).setDesc(tr('set.reindex.desc'))
      .addButton((b) => b.setButtonText(tr('ui.117')).setCta().onClick(async () => {
        this.plugin.externalCache = {};
        this.plugin.refreshViews();
        new Notice(tr('ui.221'));
      }));

    const logBox = el.createDiv({ cls: 'setting-item' });
    logBox.createEl('div', { cls: 'setting-item-info' }).createEl('div', { cls: 'setting-item-name', text: tr('set.logRecent') });
    const body = logBox.createDiv({ cls: 'setting-item-control' });
    if (!this.plugin.opLog.length) {
      body.createEl('div', { cls: 'setting-item-description', text: tr('set.logEmpty') });
    } else {
      for (const op of this.plugin.opLog.slice(0, 20)) {
        body.createEl('div', { cls: 'setting-item-description', text: fmtDate(op.ts) + ' · ' + op.type + ' · ' + (op.path || '') });
      }
    }
  }

  renderAbout(el) {
    const info = el.createEl('div', { cls: 'setting-item' });
    info.createEl('p', { text: tr('set.aboutIntro') });
    info.createEl('p', { text: tr('set.aboutRoadmap') });
    info.createEl('p', { text: tr('set.aboutPlan') });
  }
}
