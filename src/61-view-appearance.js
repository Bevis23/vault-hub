/* -------------------------------------------------------------------------
 *  工作台视图 · 外观（含每库独立配置）
 *  （本片段由 build.js 拼进 main.js，不要单独 require）
 * ------------------------------------------------------------------------- */
Object.assign(WorkbenchView.prototype, {
  apRecord() {
    const s = this.plugin.settings;
    if (s.perVaultAppearance && this.selectedVault) {
      if (!s.vaultAppearance || typeof s.vaultAppearance !== 'object') s.vaultAppearance = {};
      if (!s.vaultAppearance[this.selectedVault]) {
        s.vaultAppearance[this.selectedVault] = Object.assign({}, s.appearance);
      }
      return s.vaultAppearance[this.selectedVault];
    }
    return s.appearance;
  },

  effectiveAppearance() {
    const s = this.plugin.settings;
    const base = Object.assign({}, s.appearance);
    if (s.perVaultAppearance && s.vaultAppearance && this.selectedVault) {
      const own = s.vaultAppearance[this.selectedVault];
      if (own) Object.assign(base, own);
    }
    return base;
  },

  // silent=true 时不重排内容区（拖滑杆时用，避免卡顿）
  setApp(key, value, silent) {
    const rec = this.apRecord();
    rec[key] = value;
    this.plugin.saveSettings();
    this.applyAppearance();
    if (!silent) this.render();
  },

  applyAppearance() {
    const ap = this.effectiveAppearance();
    const root = this.contentEl;
    root.style.setProperty('--vwb-acc', asStr(ap.accent, '#7f6df2'));
    root.style.setProperty('--vwb-dim', String(typeof ap.dim === 'number' ? ap.dim : 0.25));
    root.style.setProperty('--vwb-blur', (typeof ap.blur === 'number' ? ap.blur : 20) + 'px');
    const pg = PRESETS[ap.preset] ? PRESETS[ap.preset].glass : 0.07;
    root.style.setProperty('--vwb-glass', 'rgba(255,255,255,' + pg + ')');
    if (this.bgEl) this.bgEl.style.background = this.plugin.wallpaperCss(ap);
    if (this.prevEl) {
      // 铺满模式下不吃「侧滑/悬浮/底部」的位置类，直接覆盖整个内容区
      this.prevEl.className = 'vwb-prev vwb-glass' +
        (this.prevMax ? ' is-max' : (ap.previewPos === 'side' ? '' : ' ' + ap.previewPos)) +
        (this.selectedNote ? ' is-on' : '');
    }
  }
});
