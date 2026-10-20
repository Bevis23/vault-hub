/* -------------------------------------------------------------------------
 *  工作台视图 · 预览面板：打开 / 渲染 / 大纲 / 多类型
 *  （本片段由 build.js 拼进 main.js，不要单独 require）
 * ------------------------------------------------------------------------- */
Object.assign(WorkbenchView.prototype, {
  /* 打开文件：按 settings.open.mode 决定落地方式 */
  async openFile(note, opts) {
    const o = opts || {};
    const mode = o.forcePanel
      ? 'panel'
      : (o.forceDoc ? 'workbench' : openModeOf(this.plugin.settings.open.mode).id);
    if (mode === 'native' && canOpenNative(note)) {
      const done = await this.openNative(note);
      if (done) return;
    }
    // workbench = 工作台内铺满（工作面板模式）；panel = 右侧一瞥，不铺满
    await this.openPreview(note, { expand: mode === 'workbench', collapse: mode === 'panel' });
  },

  /* 在 Obsidian 里原生打开（铺满工作区） */
  async openNative(note) {
    if (!canOpenNative(note)) {
      new Notice(note && note.external
        ? tr('preview.noNativeExternal')
        : tr('preview.noNativeType'));
      return false;
    }
    try {
      const ws = this.plugin.app.workspace;
      let leaf = null;
      try { leaf = ws.getLeaf('tab'); } catch (e) { leaf = ws.getLeaf(true); }
      await leaf.openFile(note.file);
      this.plugin.logOp({ type: 'open', path: note.relPath });
      this.selectedNote = note;
      this.render(); // 卡片上留个选中态，回来还知道刚才在看哪个
      return true;
    } catch (e) {
      new Notice(tr('preview.nativeFail', { err: (e && e.message ? e.message : e) }));
      return false;
    }
  },

  /* ----------------------------------------------------------- preview */
  async openPreview(note, opts) {
    const o = opts || {};
    await this.flushDocSave(); // 换文件前先把没写完的内容落盘
    this.selectedNote = note;
    this.prevKind = fileKind(note.ext);
    this.imgZoom = 'fit';
    this.docMode = o.edit ? 'edit' : 'read';
    this.docDirty = false;
    this.prevTitleEl.setText(this.prevKind === 'markdown' ? note.name.replace(/\.md$/i, '') : note.name);
    this.syncDocStatus();
    this.prevEl.addClass('is-on');
    this.buildPreviewFoot(note);
    this.syncDocTools();
    this.docHeadings = [];
    this.toggleOutline(false);
    this.prevBodyEl.empty();
    this.prevBodyEl.createDiv({ cls: 'vwb-empty', text: tr('preview.loading') });
    this.render(); // 选中态高亮

    // 外部库 md：按需抽取标签（首次）
    if (note.external && this.prevKind === 'markdown' && (!note.tags || !note.tags.length)) {
      note.tags = extractTagsFromHead(note.absPath);
    }

    try {
      // 铺满 / 收起要在渲染正文之前定下来：编辑态正文宽度会影响自动高度
      if (o.expand) this.togglePreviewMax(true);
      if (o.collapse) this.togglePreviewMax(false);
      await this.renderDocBody();
    } catch (e) {
      this.prevBodyEl.empty();
      this.prevBodyEl.createDiv({ cls: 'vwb-empty', text: tr('preview.fail', { err: (e && e.message ? e.message : e) }) });
    }
  },

  /* ------------------------------------------- 工作台内：阅读 / 编辑 */
  /* 头部按钮的可见性随类型和模式变 */
  togglePreviewMax(force) {
    this.prevMax = typeof force === 'boolean' ? force : !this.prevMax;
    this.applyAppearance();
    if (this.selectedNote) this.prevEl.addClass('is-on');
    if (this.maxBtn) this.maxBtn.setText(this.prevMax ? '⤡' : '⤢');
    if (this.maxBtn) this.maxBtn.setAttribute('aria-label', this.prevMax ? tr('ui.169') : tr('ui.170'));
  },

  /* 大纲抽屉：列出当前文档标题，点击跳转 */
  toggleOutline(force) {
    this.outlineOpen = typeof force === 'boolean' ? force : !this.outlineOpen;
    // 窄面板塞不下大纲，直接先把文档铺满（对齐原生「编辑 + 大纲」的观感）
    if (this.outlineOpen && !this.prevMax) this.togglePreviewMax(true);
    this.outlineEl.className = 'vwb-outline vwb-glass' + (this.outlineOpen ? ' is-on' : '');
    if (this.outlineOpen) this.renderOutline();
  },

  renderOutline() {
    const box = this.outlineEl;
    box.empty();
    const head = box.createDiv({ cls: 'vwb-outline-head' });
    head.createDiv({ cls: 'vwb-outline-t', text: tr('preview.outline') });
    const x = head.createDiv({ cls: 'vwb-prev-x', text: '✕' });
    x.addEventListener('click', () => this.toggleOutline(false));

    if (!this.docHeadings.length) {
      box.createDiv({ cls: 'vwb-outline-empty', text: tr('preview.noHeadings') });
      return;
    }
    for (const h of this.docHeadings) {
      const it = box.createDiv({ cls: 'vwb-outline-i lv' + h.level });
      it.createEl('span', { cls: 'vwb-outline-lv', text: 'H' + h.level });
      it.createEl('span', { cls: 'vwb-outline-tx', text: h.text });
      it.addEventListener('click', () => {
        if (h.el && typeof h.el.scrollIntoView === 'function') {
          h.el.scrollIntoView({ block: 'start', behavior: 'smooth' });
          return;
        }
        // 纯源码 / 双栏模式没有对应的 DOM，按行号跳
        this.jumpToHeading(h);
      });
    }
  },

  /* 设置面板：左边子页导航（外观 / 打开方式 / 库管理 / 操作日志 / 关于），右边内容 */
  collectHeadings(content, host) {
    const list = [];
    let inFence = false;
    for (const line of String(content).split(/\r?\n/)) {
      if (/^\s*(```|~~~)/.test(line)) { inFence = !inFence; continue; }
      if (inFence) continue;
      const m = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
      if (m) list.push({ level: m[1].length, text: m[2].replace(/[*_`\[\]]/g, '').trim(), el: null });
    }
    let els = [];
    try { els = Array.prototype.slice.call(host.querySelectorAll('h1,h2,h3,h4,h5,h6')); } catch (e) { els = []; }
    if (!els.length) {
      // 极简 DOM 环境不支持逗号选择器时的兜底
      for (let lv = 1; lv <= 6; lv++) {
        for (const e of host.querySelectorAll('h' + lv)) els.push(e);
      }
    }
    for (let i = 0; i < list.length; i++) list[i].el = els[i] || null;
    this.docHeadings = list;
    return list;
  },

  /* 外部库 md 里的相对资源（图片 / 音视频 / PDF）Obsidian 的渲染器解析不了
     —— 它只认「当前库」内的资源，所以 ![](img/1.jpg) / ![[img/1.jpg]] 都会变成「找不到」。
     这里按磁盘路径兜底：把能落地的资源读成 data URL 塞回去。 */
  fixupRenderedContent(host, note) {
    if (!note || !note.absPath || !host) return;
    const dir = pathMod.dirname(note.absPath);

    const resolveLocal = (raw) => {
      let p = String(raw == null ? '' : raw).trim();
      if (!p) return '';
      if (/^(https?:|data:|app:|mailto:|file:)/i.test(p)) return '';
      p = p.split('#')[0].split('?')[0];
      try { p = decodeURIComponent(p); } catch (e) { /* 原样用 */ }
      p = p.replace(/^\.\//, '');
      const abs = pathMod.isAbsolute(p) ? p : pathMod.resolve(dir, p);
      try {
        if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return abs;
      } catch (e) { /* 不存在 */ }
      return '';
    };

    // 1) 已经渲染成 <img> 但 src 是相对路径的
    for (const img of host.querySelectorAll('img')) {
      const src = img.getAttribute('src') || '';
      if (!src || /^(data:|https?:|app:)/i.test(src)) continue;
      const abs = resolveLocal(src);
      if (!abs) continue;
      const url = this.plugin.dataUrlOf(abs, pathMod.extname(abs));
      if (!url) continue;
      img.setAttribute('src', url);
      img.src = url;
    }

    // 2) 未解析的内嵌：Obsidian 会渲染成 .internal-embed.is-unresolved，里面带着目标路径
    for (const em of host.querySelectorAll('.internal-embed')) {
      if (!em.classList || !em.classList.contains('is-unresolved')) continue;
      const rawAttr = em.getAttribute('src') || em.getAttribute('data-src') || '';
      const fromText = ((em.textContent || '').match(/["“”]([^"“”]+)["“”]/) || [])[1];
      const abs = resolveLocal(rawAttr) || resolveLocal(fromText);
      if (!abs) continue;
      const ext = pathMod.extname(abs).toLowerCase();
      const kind = fileKind(ext);
      const url = this.plugin.dataUrlOf(abs, ext);
      if (!url) continue;
      em.empty();
      if (em.removeClass) em.removeClass('is-unresolved');
      if (em.addClass) em.addClass('vwb-embed-fixed');
      if (kind === 'image') {
        em.createEl('img', { cls: 'vwb-img', src: url });
      } else if (kind === 'audio' || kind === 'video') {
        const m = em.createEl(kind, { cls: 'vwb-av' });
        m.setAttribute('controls', 'controls');
        m.src = url;
      } else if (kind === 'pdf') {
        const fr = em.createEl('iframe', { cls: 'vwb-pdf' });
        fr.src = url;
      } else {
        em.createEl('span', { cls: 'vwb-embed-link', text: pathMod.basename(abs) });
      }
    }

    // 3) 内部链接 [[xxx]]：外部库也能点得动（按名字/路径在当前所选库里找）
    for (const a of host.querySelectorAll('a.internal-link')) {
      a.addEventListener('click', (e) => {
        if (e && e.preventDefault) e.preventDefault();
        const target = a.getAttribute('data-href') || a.getAttribute('href') || a.textContent || '';
        if (!this.openByLink(target)) new Notice(tr('preview.linkMissing', { target: target }));
      });
    }
  },

  /* 在当前所选库里按路径 / 文件名找一个笔记并打开 */
  openByLink(target) {
    const t = String(target || '').split('|')[0].split('#')[0].trim();
    if (!t) return false;
    const vault = this.selectedVaultInfo();
    if (!vault) return false;
    const files = this.plugin.indexOf(vault.path).files || [];
    const norm = (s) => String(s || '').replace(/\\/g, '/').toLowerCase();
    const want = norm(t).replace(/\.md$/, '');
    const wantName = want.indexOf('/') >= 0 ? want.split('/').pop() : want;
    const byPath = (n) => norm(n.relPath).replace(/\.md$/, '');
    const hit = files.find((n) => byPath(n) === want)
      || files.find((n) => norm(n.name).replace(/\.md$/, '') === wantName)
      || null;
    if (!hit) return false;
    this.openFile(hit, { forceDoc: true });
    return true;
  },

  /* 预览用资源地址：当前库走 Obsidian 资源协议；外部库读成 data URL（拿不到就返回空） */
  resourceUrl(note, maxBytes) {
    if (!note.external) {
      try {
        const u = this.plugin.app.vault.adapter.getResourcePath(note.relPath);
        if (u) return u;
      } catch (e) { /* 落到下面的兜底 */ }
    }
    return this.plugin.dataUrlOf(note.absPath, note.ext, maxBytes);
  },

  /* 按类型分流渲染预览正文 */
  async renderPreviewBody(note) {
    const kind = this.prevKind;
    const body = this.prevBodyEl;

    /* 1) Markdown：渲染正文（原能力不变） */
    if (kind === 'markdown') {
      let content = '';
      try {
        content = note.external
          ? fs.readFileSync(note.absPath, 'utf8')
          : await this.plugin.app.vault.read(note.file);
      } catch (e) {
        content = tr('ui.138') + e.message;
      }
      body.empty();
      const host = body.createDiv({ cls: 'vwb-doc-inner' });
      try {
        await MarkdownRenderer.render(this.plugin.app, content, host, note.external ? note.absPath : note.relPath, this);
      } catch (e) {
        try {
          await MarkdownRenderer.renderMarkdown(content, host, note.relPath, this);
        } catch (e2) {
          host.setText(content);
        }
      }
      this.collectHeadings(content, host);
      // 外部库：相对图片 / 未解析内嵌 / 内部链接都要自己兜底
      try { this.fixupRenderedContent(host, note); } catch (e) { console.warn('[vault-workbench] fixup failed', e); }
      if (this.outlineOpen) this.renderOutline();
      return;
    }

    /* 2) 纯文本 / 代码 / 配置：直接读出来只读展示 */
    if (kind === 'text') {
      let txt = '';
      let clipped = false;
      try {
        if (note.external) {
          const st = fs.statSync(note.absPath);
          const cap = Math.min(st.size, MAX_TEXT);
          const buf = Buffer.alloc(cap);
          const fd = fs.openSync(note.absPath, 'r');
          const n = fs.readSync(fd, buf, 0, cap, 0);
          fs.closeSync(fd);
          txt = buf.slice(0, n).toString('utf8');
          clipped = st.size > MAX_TEXT;
        } else {
          txt = await this.plugin.app.vault.read(note.file);
          if (txt.length > MAX_TEXT) { txt = txt.slice(0, MAX_TEXT); clipped = true; }
        }
      } catch (e) {
        txt = tr('ui.138') + (e && e.message ? e.message : e);
      }
      if (clipped) txt += tr('ui.171') + fmtSize(MAX_TEXT) + '）';
      body.empty();
      body.createEl('pre', { cls: 'vwb-code', text: txt });
      return;
    }

    /* 3) PDF：当前库交给 Obsidian 原生阅读器；外部库尽力内嵌 + 给系统打开入口 */
    if (kind === 'pdf') {
      await this.renderPdf(note);
      return;
    }

    /* 4) 图片 / 音频 / 视频：面板内嵌 */
    if (kind === 'image' || kind === 'audio' || kind === 'video') {
      const url = this.resourceUrl(note);
      if (!url) { this.renderFileCard(note, kind); return; }
      body.empty();
      this.appendMedia(body, note, kind, url);
      body.createDiv({
        cls: 'vwb-media-tip',
        text: kind === 'image'
          ? tr('preview.imageTip')
          : tr('preview.mediaTip')
      });
      return;
    }

    /* 5) 其他类型：文件信息卡 + 外部打开引导 */
    this.renderFileCard(note, kind);
  },

  /* 生成媒体元素（图片 / 音频 / 视频 / PDF） */
  async renderPdf(note) {
    const body = this.prevBodyEl;
    if (!note.external) {
      body.empty();
      const host = body.createDiv({ cls: 'vwb-embed' });
      try {
        await MarkdownRenderer.render(
          this.plugin.app, '![[' + note.relPath + ']]', host, note.relPath, this
        );
        body.createDiv({ cls: 'vwb-media-tip', text: tr('preview.pdfNativeTip') });
        return;
      } catch (e) {
        body.empty();
      }
    }
    const url = this.resourceUrl(note);
    if (!url) { this.renderFileCard(note, 'pdf'); return; }
    body.empty();
    this.appendMedia(body, note, 'pdf', url);
    body.createDiv({
      cls: 'vwb-media-tip',
      text: tr('preview.pdfTip')
    });
    if (note.external) this.appendQuickActions(body, note);
  },

  /* 内嵌 + 系统打开入口（外部库文件的引导） */
  appendMedia(body, note, kind, url) {
    const wrap = body.createDiv({ cls: 'vwb-media vwb-media-' + kind });
    if (kind === 'image') {
      const img = wrap.createEl('img', { cls: 'vwb-img' });
      img.setAttribute('alt', note.name);
      img.src = url;
      this.bindImageFallback(img, note);
      this.applyImgZoom();
      // 点图也能切 1:1 / 适应（和光标形状一致）
      img.addEventListener('click', () => {
        this.imgZoom = this.imgZoom === 'actual' ? 'fit' : 'actual';
        this.applyImgZoom();
        this.buildPreviewFoot(note);
      });
    } else if (kind === 'pdf') {
      const fr = wrap.createEl('iframe', { cls: 'vwb-pdf' });
      fr.setAttribute('title', note.name);
      fr.src = url;
    } else {
      const m = wrap.createEl(kind, { cls: 'vwb-av' });
      m.setAttribute('controls', 'controls');
      m.src = url;
    }
    return wrap;
  },

  /* PDF 预览：当前库用原生嵌入（和笔记里写 ![[x.pdf]] 同一条链路，最稳） */
  appendQuickActions(container, note) {
    const box = container.createDiv({ cls: 'vwb-quick' });
    const b1 = box.createEl('button', { cls: 'vwb-btn vwb-btn-sm', text: tr('preview.openExternal') });
    b1.addEventListener('click', () => shellOpenPath(note.absPath));
    const b2 = box.createEl('button', { cls: 'vwb-btn vwb-btn-sm', text: tr('preview.openFolder') });
    b2.addEventListener('click', () => shellReveal(note.absPath));
    return box;
  },

  /* 图片加载失败（外部库文件可能被资源协议拒绝）→ 兜底读成 data URL 再试一次 */
  bindImageFallback(img, note) {
    img.addEventListener('error', () => {
      const fb = this.plugin.dataUrlOf(note.absPath, note.ext);
      if (fb && img.src !== fb) {
        img.src = fb;
        return;
      }
      this.renderFileCard(note, 'image');
    });
  },

  applyImgZoom() {
    const img = this.prevBodyEl.querySelector('.vwb-img');
    if (!img) return;
    const actual = this.imgZoom === 'actual';
    img.className = 'vwb-img' + (actual ? ' is-actual' : '');
    // 容器同步切换：适应时裁掉溢出，1:1 时允许在容器内滚动查看
    const wrap = this.prevBodyEl.querySelector('.vwb-media-image');
    if (wrap) wrap.className = 'vwb-media vwb-media-image' + (actual ? ' is-actual' : '');
  },

  /* 文件信息卡：非内嵌类型 / 外部库拿不到资源 —— 引导用系统程序打开 */
  renderFileCard(note, kind) {
    const k = kind || fileKind(note.ext);
    const body = this.prevBodyEl;
    body.empty();
    const abs = note.absPath || '';
    const card = body.createDiv({ cls: 'vwb-fcard' });

    const top = card.createDiv({ cls: 'vwb-fcard-top' });
    top.createDiv({ cls: 'vwb-fcard-ico', text: iconFor(note.ext, k) });
    const info = top.createDiv({ cls: 'vwb-fcard-info' });
    info.createDiv({ cls: 'vwb-fcard-nm', text: note.name });
    info.createDiv({ cls: 'vwb-fcard-path', text: abs || note.relPath || '' });

    const rows = card.createDiv({ cls: 'vwb-fcard-rows' });
    const row = (label, val) => {
      const r = rows.createDiv({ cls: 'vwb-frow' });
      r.createEl('span', { text: label });
      r.createEl('b', { text: val });
    };
    row(tr('ui.172'), kindLabel(k) + (note.ext ? '（' + note.ext + '）' : ''));
    row(tr('ui.173'), fmtSize(note.size || 0));
    row(tr('ui.174'), fmtDateTime(note.mtime));
    row(tr('ui.175'), fmtDateTime(note.ctime));

    const btns = card.createDiv({ cls: 'vwb-fcard-btns' });
    const bOpen = btns.createEl('button', { cls: 'vwb-btn vwb-btn-pri', text: tr('preview.openExternal') });
    bOpen.addEventListener('click', () => shellOpenPath(abs));
    const bDir = btns.createEl('button', { cls: 'vwb-btn', text: tr('preview.openFolder') });
    bDir.addEventListener('click', () => shellReveal(abs));
    if (!note.external && extOf(note.ext) === 'canvas') {
      const bIn = btns.createEl('button', { cls: 'vwb-btn', text: tr('ui.176') });
      bIn.addEventListener('click', () => this.openSelected());
    }

    if (!abs) {
      card.createDiv({ cls: 'vwb-fcard-tip', text: tr('ui.177') });
    } else if (note.external) {
      card.createDiv({ cls: 'vwb-fcard-tip', text: tr('ui.178') + note.ext + tr('ui.179') });
    }
  },

  /* 底栏按钮随文件类型变化 */
  buildPreviewFoot(note) {
    const foot = this.prevFootEl;
    foot.empty();
    const kind = this.prevKind;
    const add = (label, cls, fn) => {
      const b = foot.createEl('button', { cls: 'vwb-btn vwb-btn-sm' + (cls ? ' ' + cls : ''), text: label });
      b.addEventListener('click', fn);
      return b;
    };
    const addInObsidian = (label) => {
      const b = add(label, '', () => this.openSelected());
      b.disabled = !!note.external;
      return b;
    };

    const editable = this.canEdit(note);
    const editing = editable && this.docMode === 'edit';

    if (editing) {
      add(tr('ui.180'), 'vwb-btn-pri', () => this.setDocMode('read'));
      add(tr('ui.181'), '', () => { this.flushDocSave(); new Notice(tr('ui.182')); });
      if (kind === 'markdown') addInObsidian(tr('ui.176'));
      else add(tr('ui.183'), '', () => shellOpenPath(note.absPath));
    } else if (kind === 'markdown') {
      if (editable) add(tr('ui.184'), 'vwb-btn-pri', () => this.setDocMode('edit'));
      addInObsidian(tr('ui.185'));
    } else if (kind === 'image') {
      add(this.imgZoom === 'actual' ? tr('ui.186') : tr('ui.187'), '', () => {
        this.imgZoom = this.imgZoom === 'actual' ? 'fit' : 'actual';
        this.applyImgZoom();
        this.buildPreviewFoot(note);
      });
      add(tr('ui.183'), '', () => shellOpenPath(note.absPath));
    } else if (kind === 'pdf' || kind === 'audio' || kind === 'video') {
      add(tr('ui.188'), 'vwb-btn-pri', () => shellOpenPath(note.absPath));
      addInObsidian(tr('ui.176'));
    } else if (kind === 'text') {
      if (editable) add(tr('ui.184'), 'vwb-btn-pri', () => this.setDocMode('edit'));
      add(tr('ui.183'), '', () => shellOpenPath(note.absPath));
    } else {
      add(tr('ui.188'), 'vwb-btn-pri', () => shellOpenPath(note.absPath));
      add(tr('preview.openFolderMenu'), '', () => shellReveal(note.absPath));
    }

    add(this.prevMax ? tr('ui.189') : tr('ui.190'), '', () => this.togglePreviewMax());
    if (!editing) {
      add(tr('ui.191'), '', () => {
        const p = note.external ? note.absPath : note.relPath;
        if (navigator.clipboard) navigator.clipboard.writeText(p);
        new Notice(tr('ui.192') + p);
      });
    }
    add(tr('ui.75'), '', () => this.closePreview());
  },

  closePreview() {
    const had = !!this.selectedNote;
    if (this.ctxEl) this.closeEditorMenu();
    if (this.docMode === 'edit') {
      this.dropEmptyPending(); // 空出来的新段还没写字就走了：不留占位空行
      this.flushDocSave();
      this.docMode = 'read';
      this.prevBodyEl.className = 'vwb-prev-body vwb-doc';
    }
    this.disposeCanvas();
    this.editorEl = null;
    this.liveEl = null;
    this.canvasEl = null;
    this.selectedNote = null;
    this.toggleOutline(false);
    if (this.prevMax) this.togglePreviewMax(false);
    this.docHeadings = [];
    if (this.prevEl) this.prevEl.removeClass('is-on');
    if (had && this.areaEl) this.render(); // 顺手清掉选中高亮
  }

  /* 「在 Obsidian 中打开」统一走新标签页，保留工作台自身不被顶掉 */
});
