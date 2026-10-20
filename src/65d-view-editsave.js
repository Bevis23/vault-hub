/* -------------------------------------------------------------------------
 *  工作台视图 · 工作台内编辑器 — 双栏滚动同步 + 实时渲染 + 保存
 *  （本片段由 build.js 拼进 main.js，不要单独 require）
 * ------------------------------------------------------------------------- */
Object.assign(WorkbenchView.prototype, {
  /* ---------------------------------------------------- 双栏滚动同步 */
  bindScrollSync() {
    const ta = this.editorEl;
    const live = this.liveEl;
    if (!ta || !live || !ta.addEventListener) return;
    let lock = false;
    const link = (src, dst) => {
      src.addEventListener('scroll', () => {
        if (lock) return;
        lock = true;
        try {
          const sr = (src.scrollHeight || 0) - (src.clientHeight || 0);
          const dr = (dst.scrollHeight || 0) - (dst.clientHeight || 0);
          if (sr > 0 && dr > 0 && typeof dst.scrollTop === 'number') {
            dst.scrollTop = Math.round((src.scrollTop / sr) * dr);
          }
        } catch (e) { /* 忽略 */ }
        setTimeout(() => { lock = false; }, 80);
      });
    };
    link(ta, live);
    link(live, ta);
  },

  /* ------------------------------------------------------- 实时渲染（split） */
  scheduleLivePreview(wait) {
    if (this.liveTimer) clearTimeout(this.liveTimer);
    this.liveTimer = setTimeout(() => { this.renderLivePreview(); }, typeof wait === 'number' ? wait : 350);
  },

  async renderLivePreview() {
    const live = this.liveEl;
    const ta = this.editorEl;
    if (!live || !ta) return;
    const txt = String(ta.value == null ? '' : ta.value);
    live.empty();
    if (txt.length > 200 * 1024) {
      live.createDiv({ cls: 'vwb-empty', text: tr('ui.162') });
      return;
    }
    if (!txt.trim()) {
      live.createDiv({ cls: 'vwb-empty', text: tr('ui.163') });
      return;
    }
    const note = this.selectedNote;
    const host = live.createDiv({ cls: 'vwb-doc-inner' });
    if (note && fileKind(note.ext) === 'text') {
      host.createEl('pre', { cls: 'vwb-code', text: txt });
      return;
    }
    const notePath = (note && note.external) ? note.absPath : (note ? note.relPath : '');
    try {
      await MarkdownRenderer.render(this.plugin.app, txt, host, notePath, this);
    } catch (e) {
      try { await MarkdownRenderer.renderMarkdown(txt, host, notePath, this); }
      catch (e2) { host.setText(txt); }
    }
    try { this.fixupRenderedContent(host, note); } catch (e) { /* 忽略 */ }
    // 双栏模式下大纲也要能用：把源码里的标题和渲染出来的标题对上号
    try {
      this.collectHeadings(txt, host);
      if (this.outlineOpen) this.renderOutline();
    } catch (e) { /* 忽略 */ }
  },

  /* ------------------------------------------------------------- 保存 */
  scheduleDocSave() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flushDocSave(), 800);
  },

  async flushDocSave() {
    if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null; }
    const note = this.selectedNote;
    if (!this.docDirty || !note || !this.editorEl) return;
    const text = this.editorEl.value;
    this.docDirty = false;
    try {
      if (note.external) {
        // 外部库：先写临时文件再改名，避免写一半崩掉把原文弄丢
        const tmp = note.absPath + '.vwb-tmp';
        try {
          fs.writeFileSync(tmp, text, 'utf8');
          fs.renameSync(tmp, note.absPath);
        } catch (e) {
          try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch (e2) { /* 清不掉就算了 */ }
          throw e;
        }
        note.size = Buffer.byteLength(text, 'utf8');
        note.mtime = Date.now();
        this.plugin.externalCache = {}; // 外部库缓存作废，回来能看到新时间
        if (!this.warnedExternalWrite) {
          this.warnedExternalWrite = true;
          new Notice(tr('editor.wroteExternal', { path: note.relPath }));
        }
      } else {
        await this.plugin.app.vault.modify(note.file, text);
      }
      this.plugin.logOp({ type: 'modify', path: note.relPath });
    } catch (e) {
      this.docDirty = true;
      // 外部库是直接写磁盘的，权限 / 只读盘 / 网盘占用这些错要说得明白，
      // 不然换台机器只看到一句英文的 EACCES，根本不知道该怎么办。
      new Notice(note.external
        ? fsErrorText(e, tr('ui.164') + note.relPath)
        : (tr('ui.165') + (e && e.message ? e.message : e)));
    }
    this.syncDocStatus();
  },

  /* 元信息行兼做保存状态提示；阅读态的标签是可点击的 chips（点击=按标签筛选） */
  syncDocStatus() {
    const n = this.selectedNote;
    const el = this.prevMetaEl;
    if (!n || !el) return;
    try { el.empty(); } catch (e) { /* 忽略 */ }
    const base = kindLabel(this.prevKind) + ' · ' + (n.folder || tr('ui.166')) + ' · ' +
      fmtSize(n.size || 0) + ' · ' + fmtDate(n.mtime);
    el.createEl('span', { text: base });
    if (this.docMode === 'edit') {
      el.createEl('span', { text: ' · ' + (this.docDirty ? tr('ui.167') : tr('ui.168')) });
    } else if (n.tags && n.tags.length) {
      el.createEl('span', { text: ' · ' });
      for (const t of n.tags.slice(0, 3)) {
        const chip = el.createEl('span', { cls: 'vwb-card-tag vwb-tag-click', text: t });
        chip.setAttribute('title', tr('ui.19'));
        chip.addEventListener('click', (e) => {
          if (e && e.stopPropagation) e.stopPropagation();
          this.searchByTag(t);
        });
      }
    }
  }
});
