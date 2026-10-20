/* -------------------------------------------------------------------------
 *  工作台视图 · 工作台内编辑器 — 浏览器选区 + 块编辑 + 输入 + 命令实现 + 剪贴板
 *  （本片段由 build.js 拼进 main.js，不要单独 require）
 * ------------------------------------------------------------------------- */Object.assign(WorkbenchView.prototype, {
  /* --------------------------------------------------------- 浏览器选区
   * 单画布里的正文是「渲染好的 HTML」而不是输入框，选区归浏览器管。
   * 这两件事全靠它：①拖选中的时候别误判成「点了一下 → 进编辑态」；
   * ②右键菜单里的「复制选中文本」。 */
  domSelection() {
    try {
      const w = (typeof window !== 'undefined') ? window : null;
      if (w && typeof w.getSelection === 'function') return w.getSelection();
      if (typeof getSelection === 'function') return getSelection();
    } catch (e) { /* 忽略 */ }
    return null;
  },

  hasDomSelection() {
    const sel = this.domSelection();
    if (!sel) return false;
    try {
      if (typeof sel.isCollapsed === 'boolean') return !sel.isCollapsed;
      return !!String(sel.toString ? sel.toString() : '').length;
    } catch (e) { return false; }
  },

  domSelectionText() {
    const sel = this.domSelection();
    if (!sel) return '';
    try { return String(sel.toString ? sel.toString() : ''); } catch (e) { return ''; }
  },

  /* 全选正文：单画布 / 阅读态都能用（选区挂到那一块容器上）。
   * 源码 / 双栏模式里正文是 textarea，浏览器选区管不着，返回 false 交给输入框自己全选。 */
  selectAllDoc() {
    const editCanvas = (this.docMode === 'edit' && this.canvasEl) ? this.canvasEl : null;
    if (this.docMode === 'edit' && !editCanvas) return false;
    const host = editCanvas || this.prevBodyEl;
    const sel = this.domSelection();
    if (!host || !sel) return false;
    try {
      if (typeof sel.selectAllChildren === 'function') {
        sel.selectAllChildren(host);
        return true;
      }
    } catch (e) { /* 落到下面的兜底 */ }
    try {
      if (typeof host.focus === 'function') {
        host.setAttribute('tabindex', '-1');
        host.focus();
        if (typeof document !== 'undefined' && document.execCommand) {
          document.execCommand('selectAll');
          return true;
        }
      }
    } catch (e) { /* 忽略 */ }
    return false;
  },

  /* 当前文档的 Markdown 原文（阅读态右键「复制整篇」用） */
  async docRawText() {
    if (this.editorEl) return String(this.editorEl.value == null ? '' : this.editorEl.value);
    const note = this.selectedNote;
    if (!note) return '';
    try {
      return note.external ? fs.readFileSync(note.absPath, 'utf8') : await this.plugin.app.vault.read(note.file);
    } catch (e) {
      return '';
    }
  },

  onBlockClick(e, i) {
    const t = e && e.target;
    if (t && typeof t.closest === 'function' && t.closest('a, input, button, textarea, .vwb-blk-ta')) return;
    // 用户是在「拖选正文」（选完想复制），不是想改这一段 —— 一进编辑态这次选区就没了
    if (this.hasDomSelection()) return;
    if (this.editingBlock === i) return;
    this.editBlock(i).catch(() => { /* 忽略 */ });
  },

  /* 点某一段 → 就地变成 textarea 改源码
   * caret：'end'（默认）/ 'start' / 数字偏移。跨块跳转时用来把光标放在对的位置。 */
  async editBlock(i, caret) {
    if (this.docMode !== 'edit') return null;
    // 上一次重绘 / 提交还没落地就先等 —— 否则刚建好的输入框会被它覆盖掉
    if (this.canvasBusy || this.commitBusy) {
      try {
        await Promise.all([this.canvasBusy, this.commitBusy].filter(Boolean));
      } catch (e) { /* 忽略 */ }
    }
    if (this.editingBlock != null && this.editingBlock !== i) await this.commitBlock();
    const holder = this.blockEls[i];
    const b = this.blocks[i];
    if (!holder || !b) return null;
    this.editingBlock = i;
    holder.empty();
    if (holder.classList) holder.classList.add('is-editing');
    const cls = ['vwb-blk-ta', 'vwb-ta-' + b.type];
    if (b.type === 'heading') cls.push('is-h' + (b.level || 1));
    const ta = holder.createEl('textarea', { cls: cls.join(' ') });
    // 刚新建的段落：占位用的换行不能让用户看见，所以填进去的是空串
    ta.value = b.pending ? String(b.raw == null ? '' : b.raw).replace(/\n/g, '') : b.raw;
    this.blockTa = ta;
    ta.addEventListener('input', () => {
      b.raw = ta.value;
      this.syncCanvasToSource();
      this.autoGrow(ta);
    });
    ta.addEventListener('keydown', (e) => this.onEditorKey(e, ta, true));
    ta.addEventListener('blur', () => this.commitBlock());
    ta.addEventListener('contextmenu', (e) => {
      if (e.preventDefault) e.preventDefault();
      this.showEditorMenu(e, ta, i);
    });
    this.autoGrow(ta);
    try { if (typeof ta.focus === 'function') ta.focus({ preventScroll: true }); } catch (e) { /* 忽略 */ }
    const len = String(ta.value == null ? '' : ta.value).length;
    let pos = len;
    if (caret === 'start') pos = 0;
    else if (typeof caret === 'number') pos = Math.max(0, Math.min(caret, len));
    try { if (ta.setSelectionRange) ta.setSelectionRange(pos, pos); } catch (e) { /* 忽略 */ }
    return ta;
  },

  /* 光标是不是在这一块的第一行 / 最后一行 / 末尾
   * 判断出来才能在「到边」时把焦点交给上/下一段，做出连续文档的手感。 */
  caretAtFirstLine(ta) {
    const v = String(ta && ta.value != null ? ta.value : '');
    const p = this.selRange(ta)[0];
    return v.slice(0, p).indexOf('\n') < 0;
  },

  caretAtLastLine(ta) {
    const v = String(ta && ta.value != null ? ta.value : '');
    const p = this.selRange(ta)[1];
    return v.indexOf('\n', p) < 0;
  },

  caretAtEnd(ta) {
    const v = String(ta && ta.value != null ? ta.value : '');
    const r = this.selRange(ta);
    return r[0] === r[1] && r[0] === v.length;
  },

  /* 焦点交给上/下一段（先把当前这段提交掉；跳过纯空行块，做出连续文档的手感） */
  async moveBlockFocus(delta, caret) {
    const idx = this.editingBlock;
    if (idx == null) return;
    const ta = this.blockTa;
    if (ta && this.blocks[idx]) this.blocks[idx].raw = String(ta.value == null ? '' : ta.value);
    await this.commitBlock();
    const list = this.blocks || [];
    let n = idx + delta;
    while (n >= 0 && n < list.length && list[n].type === 'blank') n += delta;
    if (n < 0 || n >= list.length) return;
    await this.editBlock(n, caret || 'start');
  },

  /* 段尾回车 = 空出新的一段给用户接着写（Typora 的连续书写手感） */
  async splitBlockAfter() {
    const idx = this.editingBlock;
    if (idx == null) return;
    const ta = this.blockTa;
    const b = this.blocks[idx];
    if (!b) return;
    if (ta) b.raw = String(ta.value == null ? '' : ta.value);
    // 收尾时把行尾空白也带走：回车换行写的是「行尾两个空格 + 换行」，不能留在段尾
    b.raw = String(b.raw == null ? '' : b.raw).replace(/\s+$/, '');
    // 连着按回车：上一段还是没写字的空段就让它转正，再往后空一段（不会出现满屏空行）
    if (b.pending && !b.raw.trim()) {
      b.pending = false;
      this.pendingRollback = null;
    }
    const prevSource = String(this.editorEl.value == null ? '' : this.editorEl.value);
    const made = this.makePendingBlocks(this.blocks, idx);
    this.editorEl.value = made.blocks.map((x) => x.raw).join('\n');
    this.pendingRollback = { source: prevSource };
    this.docDirty = true;
    this.syncDocStatus();
    this.scheduleDocSave();
    this.editingBlock = null;
    this.blockTa = null;
    const top = this.canvasEl ? this.canvasEl.scrollTop : 0;
    const target = await this.renderCanvas({ blocks: made.blocks, target: made.target });
    if (this.canvasEl) { try { this.canvasEl.scrollTop = top; } catch (e) { /* 忽略 */ } }
    await this.editBlock(target, 'start');
  },

  /* 段首退格 = 并到上一段（中间隔着空行的，直接跳过空行并到最近的一段） */
  async mergeBlockUp() {
    const idx = this.editingBlock;
    if (idx == null || idx <= 0) return;
    const ta = this.blockTa;
    if (ta && this.blocks[idx]) this.blocks[idx].raw = String(ta.value == null ? '' : ta.value);
    let j = idx - 1;
    while (j > 0 && this.blocks[j].type === 'blank') j--;
    const prev = this.blocks[j];
    const cur = this.blocks[idx];
    if (!prev || !cur || prev === cur || prev.type === 'blank') return;
    const pv = prev.raw.replace(/\s+$/, '');
    const cv = cur.raw.replace(/^\n+/, '');
    let joiner = '\n';
    if (prev.type === 'heading') joiner = '';
    else if (prev.type === 'paragraph' && cur.type === 'paragraph') joiner = ' ';
    prev.raw = pv + joiner + cv;
    const caret = (pv + joiner).length;
    this.blocks.splice(j + 1, idx - j); // 去掉中间的空行块和这一块本身
    this.editorEl.value = this.blocks.map((x) => x.raw).join('\n');
    this.docDirty = true;
    this.syncDocStatus();
    this.scheduleDocSave();
    this.editingBlock = null;
    this.blockTa = null;
    const top = this.canvasEl ? this.canvasEl.scrollTop : 0;
    await this.renderCanvas();
    if (this.canvasEl) { try { this.canvasEl.scrollTop = top; } catch (e) { /* 忽略 */ } }
    await this.editBlock(Math.max(0, j), caret);
  },

  /* 点画布空白（正文下方那片空） = 在文末新建一段 */
  async appendBlockAtEnd() {
    if (this.docMode !== 'edit' || !this.editorEl) return;
    if (this.editingBlock != null) await this.commitBlock();
    const prevSource = String(this.editorEl.value == null ? '' : this.editorEl.value);
    // 文末只要一个前导空行：
    // 最后一个块是空行说明正文已经收尾，直接拿它当分隔符；否则补一个。
    const list = (this.blocks || []).slice();
    const last = list[list.length - 1];
    if (!(last && last.type === 'blank')) {
      list.push({ type: 'blank', raw: '', start: -1, end: -1 });
    }
    list.push({ type: 'paragraph', raw: '', start: -1, end: -1, pending: true });
    const target = list.length - 1;
    this.editorEl.value = list.map((x) => x.raw).join('\n');
    this.pendingRollback = { source: prevSource };
    this.docDirty = true;
    this.syncDocStatus();
    this.scheduleDocSave();
    const got = await this.renderCanvas({ blocks: list, target });
    await this.editBlock(got >= 0 ? got : target, 'start');
  },

  /* 块的 textarea 高度跟着内容长（高度自适应，才不会出现内部滚动条那种「盒子感」） */
  autoGrow(ta) {
    if (!ta || !ta.style) return;
    try {
      const v = String(ta.value == null ? '' : ta.value);
      const w = ta.clientWidth || 640;
      const per = Math.max(16, Math.floor(w / 7.6));
      const lines = v.split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(l.length / per)), 0);
      let lh = 23;
      if (ta.classList && typeof ta.classList.contains === 'function') {
        if (ta.classList.contains('is-h1')) lh = 26;
        else if (ta.classList.contains('is-h2')) lh = 24;
        else if (ta.classList.contains('is-h3')) lh = 23;
      }
      // 真机上直接量「这一行到底多高」，和渲染样式严格对齐（字号随块类型变）
      try {
        if (typeof getComputedStyle === 'function') {
          const cs = getComputedStyle(ta);
          const v = parseFloat(cs && cs.lineHeight);
          if (v && isFinite(v) && v > 0) lh = v;
        }
      } catch (e) { /* 忽略，用兜底行高 */ }
      ta.style.height = Math.max(22, lines * lh + 8) + 'px';
    } catch (e) { /* 忽略 */ }
  },

  /* 块内容 → 源码真源（保存链路只认 textarea.vwb-editor） */
  syncCanvasToSource() {
    if (!this.editorEl || !this.blocks) return;
    this.editorEl.value = this.blocks.map((b) => b.raw).join('\n');
    this.docDirty = true;
    this.syncDocStatus();
    this.scheduleDocSave();
  },

  /* 源码真源被整篇改动了（右键菜单作用在全篇时）—— 画布得跟着重画一遍 */
  async syncCanvasFromSource() {
    if (!this.canvasEl) return;
    const top = this.canvasEl.scrollTop || 0;
    await this.renderCanvas();
    if (this.canvasEl) { try { this.canvasEl.scrollTop = top; } catch (e) { /* 忽略 */ } }
  },

  /* 空出来的新段落一个字都没写（正在写或刚写完就被别的操作打断）→ 把源码还原回去，
   * 免得文件里留下一串没有意义的空行。保存之前、关闭预览之前都要走一遍。 */
  dropEmptyPending() {
    if (!this.pendingRollback || !this.editorEl) return;
    const b = this.editingBlock != null ? this.blocks[this.editingBlock] : null;
    if (b && b.pending && !String(b.raw == null ? '' : b.raw).trim()) {
      this.editorEl.value = this.pendingRollback.source;
      this.docDirty = true;
    }
    this.pendingRollback = null;
  },

  /* 结束这一段：能只重绘一段就只重绘一段，结构变了才整篇重绘 */
  commitBlock() {
    const p = this._commitBlock();
    this.commitBusy = p;
    const clear = () => { if (this.commitBusy === p) this.commitBusy = null; };
    return p.then(clear, clear);
  },

  async _commitBlock() {
    if (this.editingBlock == null) return;
    const idx = this.editingBlock;
    const pend = this.blocks[idx];
    const rollback = this.pendingRollback;
    this.editingBlock = null;
    this.blockTa = null;
    this.pendingRollback = null;
    // 刚空出来的新段一个字都没写就走了 → 撤掉它，源码里不留多余空行
    if (rollback && pend && pend.pending && !String(pend.raw == null ? '' : pend.raw).trim()) {
      this.editorEl.value = rollback.source;
      this.docDirty = true;
      this.syncDocStatus();
      this.scheduleDocSave();
      await this.renderCanvas();
      this.syncCanvasHeadings();
      if (this.outlineOpen) this.renderOutline();
      return;
    }
    const holder = this.blockEls[idx];
    const note = this.selectedNote;
    if (!holder || !note || !this.blocks.length) return;
    const fresh = parseBlocks(this.editorEl ? this.editorEl.value : '');
    const sameShape = fresh.length === this.blocks.length &&
      this.blocks.every((b, k) => k === idx || b.raw === fresh[k].raw);
    this.blocks = fresh;
    if (sameShape && this.blockEls.length === fresh.length && fresh[idx]) {
      await this.renderBlockInto(holder, fresh[idx], note);
    } else {
      const top = this.canvasEl ? this.canvasEl.scrollTop : 0;
      await this.renderCanvas();
      if (this.canvasEl) { try { this.canvasEl.scrollTop = top; } catch (e) { /* 忽略 */ } }
    }
    this.syncCanvasHeadings();
    if (this.outlineOpen) this.renderOutline();
  },

  /* 单画布的大纲：块类型直接就知道标题级别，比从 DOM 反推更准 */
  syncCanvasHeadings() {
    const list = [];
    for (let i = 0; i < this.blocks.length; i++) {
      const b = this.blocks[i];
      if (b.type !== 'heading') continue;
      const holder = this.blockEls[i] || null;
      let el = holder;
      try { if (holder && holder.querySelector) el = holder.querySelector('h' + b.level) || holder; } catch (e) { el = holder; }
      list.push({ level: b.level || 1, text: headingText(b.raw), el, blockIdx: i });
    }
    this.docHeadings = list;
  },

  /* --------------------------------------------------- textarea 输入与按键 */
  onSourceInput(ta) {
    this.docDirty = true;
    this.syncDocStatus();
    this.scheduleDocSave();
    if (this.editorMode() === 'split') { this.scheduleLivePreview(); return; }
    // 单画布：右键菜单作用在全篇时改的是源码真源，画布要跟着重画，
    // 否则用户看到的就是「点了菜单什么都没发生」（源码框在 live 模式是隐藏的）。
    if (this.editorMode() === 'live' && this.docMode === 'edit' && this.canvasEl) {
      this.syncCanvasFromSource();
    }
  },

  /* 任何一处改动之后统一收尾：同步真源 + 标脏 + 自动保存 */
  afterEdit(ta) {
    if (ta === this.editorEl) {
      this.onSourceInput(ta);
      return;
    }
    const idx = this.editingBlock;
    if (idx != null && this.blocks[idx]) this.blocks[idx].raw = String(ta.value == null ? '' : ta.value);
    this.syncCanvasToSource();
    this.autoGrow(ta);
  },

  async onEditorKey(e, ta, isBlock) {
    if (e.stopPropagation) e.stopPropagation();
    const k = String(e.key || '');
    const mod = !!(e.ctrlKey || e.metaKey);
    const shift = !!e.shiftKey;
    const alt = !!e.altKey;

    if (k === 'Escape') {
      if (e.preventDefault) e.preventDefault();
      if (isBlock) await this.commitBlock();
      else this.setDocMode('read');
      return;
    }
    if (mod && !shift && !alt && k.toLowerCase() === 's') {
      if (e.preventDefault) e.preventDefault();
      await this.flushDocSave();
      new Notice(tr('editor.saved'));
      return;
    }
    if (k === 'Tab') {
      if (e.preventDefault) e.preventDefault();
      this.insertText(ta, '  ');
      return;
    }

    /* 单画布的「连续书写」：到本段边界就把焦点交给上/下一段，
     * 不是一块一块地孤立操作。 */
    if (isBlock && !mod && !alt) {
      if (k === 'ArrowUp' && this.caretAtFirstLine(ta)) {
        if (e.preventDefault) e.preventDefault();
        await this.moveBlockFocus(-1, 'end');
        return;
      }
      if (k === 'ArrowDown' && this.caretAtLastLine(ta)) {
        if (e.preventDefault) e.preventDefault();
        await this.moveBlockFocus(1, 'start');
        return;
      }
      if (k === 'Enter') {
        const b = this.blocks[this.editingBlock];
        // 代码块 / 表格 / Front Matter 是「原样内容」，两种回车都只是换行
        const verbatim = b && (b.type === 'code' || b.type === 'table' || b.type === 'frontmatter');
        // Shift + Enter = 完成这一段，紧接着另起新的一段
        if (shift) {
          if (e.preventDefault) e.preventDefault();
          if (verbatim) this.insertText(ta, '\n');
          else await this.splitBlockAfter();
          return;
        }
        // 列表 / 引用：行尾回车自动续一行，空项上回车跳出这块去新建段
        if (b && !verbatim && (b.type === 'list' || b.type === 'quote') && this.caretAtEnd(ta)) {
          const lines = String(ta.value == null ? '' : ta.value).replace(/\n+$/, '').split('\n');
          const lastLine = lines[lines.length - 1] || '';
          const emptyItem = b.type === 'list'
            ? /^\s*(?:[-*+]|\d+[.)])\s*(?:\[\s?\]\s*)?$/.test(lastLine)
            : /^\s*>\s*$/.test(lastLine);
          if (e.preventDefault) e.preventDefault();
          if (emptyItem) {
            lines.pop();
            b.raw = lines.join('\n');
            ta.value = b.raw;
            this.syncCanvasToSource();
            await this.splitBlockAfter();
          } else {
            this.insertContinue(ta, b);
          }
          return;
        }
        // 其余情况：回车只做「换行」，不新建段。
        // 段落 / 标题写 Markdown 硬换行（行尾两个空格），否则渲染出来换行会被吃掉。
        if (e.preventDefault) e.preventDefault();
        this.insertText(ta, verbatim ? '\n' : '  \n');
        return;
      }
      if (k === 'Backspace' && this.editingBlock > 0) {
        const r = this.selRange(ta);
        if (r[0] === 0 && r[1] === 0) {
          if (e.preventDefault) e.preventDefault();
          await this.mergeBlockUp();
          return;
        }
      }
    }
    this.handleFormatKey(e, ta);
  },

  /* 列表 / 引用写到末尾直接回车：自动续一行同类前缀 */
  insertContinue(ta, b) {
    const lines = String(ta.value == null ? '' : ta.value).replace(/\n+$/, '').split('\n');
    const prev = lines[lines.length - 1] || '';
    let cont = '';
    if (b.type === 'quote') {
      const m = /^(\s*>\s?)/.exec(prev);
      cont = m ? m[1] : '> ';
    } else {
      const m = /^(\s*)(?:([-*+])|(\d+)[.)])(\s+\[\s?\]\s+|\s+)?/.exec(prev);
      const task = m && m[4] && m[4].indexOf('[') >= 0 ? '[ ] ' : '';
      if (m && m[2]) cont = m[1] + '- ' + task;
      else if (m && m[3]) cont = m[1] + (parseInt(m[3], 10) + 1) + '. ' + task;
      else cont = '- ';
    }
    this.insertText(ta, '\n' + cont);
  },

  /* 快捷键 → 命令（和右键菜单同一套 applyCmd） */
  handleFormatKey(e, ta) {
    if (!ta) return false;
    const k = String(e.key || '');
    const low = k.toLowerCase();
    const mod = !!(e.ctrlKey || e.metaKey);
    const shift = !!e.shiftKey;
    const alt = !!e.altKey;
    let cmd = null;

    if (alt && shift && (k === '5' || k === '%')) cmd = 'strike';
    if (!cmd && !mod && (!alt || !shift)) return false; // 其余都要带修饰键

    if (!cmd && mod && !alt) {
      if (!shift) {
        cmd = { '1': 'h1', '2': 'h2', '3': 'h3', '4': 'h4', '5': 'h5', '6': 'h6', '0': 'p' }[k] || null;
        if (!cmd) {
          if (low === 'b') cmd = 'bold';
          else if (low === 'i') cmd = 'italic';
          else if (low === 'u') cmd = 'underline';
          else if (low === 'k') cmd = 'link';
          else if (k === '`') cmd = 'code';
          else if (k === '=' || k === '+') cmd = 'hup';
          else if (k === '-' || k === '_') cmd = 'hdn';
          else if (k === '\\') cmd = 'clear';
        }
      } else {
        if (k === '`' || k === '~' || low === 'k') cmd = 'codeblock';
        else if (low === 'h') cmd = 'mark';
        else if (low === 'q') cmd = 'quote';
        else if (low === 'x') cmd = 'task';
        else if (low === 'm') cmd = 'math';
        else if (low === 't') cmd = 'table';
        else if (low === 'v') cmd = 'paste-plain';
        else if (k === '[' || k === '{') cmd = 'ol';
        else if (k === ']' || k === '}') cmd = 'ul';
        else if (k === '-' || k === '_') cmd = 'hr';
      }
    }
    if (!cmd) return false;
    if (e.preventDefault) e.preventDefault();
    this.applyCmd(cmd, ta);
    return true;
  },

  /* --------------------------------------------------------- 命令实现 */
  selRange(T) {
    let s = 0;
    let e = 0;
    const len = String(T && T.value != null ? T.value : '').length;
    try { s = T.selectionStart == null ? len : T.selectionStart; } catch (err) { s = len; }
    try { e = T.selectionEnd == null ? s : T.selectionEnd; } catch (err) { e = s; }
    return [Math.max(0, Math.min(s, len)), Math.max(0, Math.min(e, len))];
  },

  setSel(T, s, e) {
    try { T.selectionStart = s; T.selectionEnd = e; } catch (err) { /* 忽略 */ }
  },

  wrapSel(T, before, after, ph) {
    const r = this.selRange(T);
    const val = String(T.value == null ? '' : T.value);
    const inner = val.slice(r[0], r[1]) || ph || '';
    T.value = val.slice(0, r[0]) + before + inner + after + val.slice(r[1]);
    this.setSel(T, r[0] + before.length, r[0] + before.length + inner.length);
    this.afterEdit(T);
  },

  insertText(T, text) {
    const r = this.selRange(T);
    const val = String(T.value == null ? '' : T.value);
    T.value = val.slice(0, r[0]) + text + val.slice(r[1]);
    this.setSel(T, r[0] + text.length, r[0] + text.length);
    this.afterEdit(T);
  },

  insertBlock(T, text) {
    const r = this.selRange(T);
    const val = String(T.value == null ? '' : T.value);
    const pre = (r[0] > 0 && val.charAt(r[0] - 1) !== '\n') ? '\n\n' : '';
    T.value = val.slice(0, r[0]) + pre + text + '\n' + val.slice(r[1]);
    this.setSel(T, r[0] + pre.length + text.length, r[0] + pre.length + text.length);
    this.afterEdit(T);
  },

  prefixLines(T, prefix, kind) {
    const val = String(T.value == null ? '' : T.value);
    let r = this.selRange(T);
    if (r[0] === r[1]) {
      const s = val.lastIndexOf('\n', Math.max(0, r[0] - 1)) + 1;
      let e = val.indexOf('\n', r[0]);
      if (e < 0) e = val.length;
      r = [s, e];
    }
    const seg = val.slice(r[0], r[1]);
    // 注意顺序：任务列表 - [ ] 必须排在通用列表符之前，否则先被 [-*+]\s+ 吃掉
    const strip = /^(\s*)((?:-\s\[\s?\]\s+|#{1,6}\s+|>\s?|[-*+]\s+|\d+[.)]\s+)?)/;
    const allSame = seg.split('\n').every((l) => {
      const m = strip.exec(l);
      return ((m && m[2]) || '').trim() === String(prefix).trim();
    });
    const out = seg.split('\n').map((l) => {
      const m = strip.exec(l);
      const body = l.slice(m[0].length);
      return allSame && kind !== 'p' ? m[1] + body : m[1] + prefix + body;
    }).join('\n');
    T.value = val.slice(0, r[0]) + out + val.slice(r[1]);
    this.setSel(T, r[0], r[0] + out.length);
    this.afterEdit(T);
  },

  /* 提升 / 降低标题级别（正文 → 一级 → 二级…，降到 0 就回到正文） */
  shiftHeading(T, delta) {
    const val = String(T.value == null ? '' : T.value);
    let r = this.selRange(T);
    if (r[0] === r[1]) {
      const s = val.lastIndexOf('\n', Math.max(0, r[0] - 1)) + 1;
      let e = val.indexOf('\n', r[0]);
      if (e < 0) e = val.length;
      r = [s, e];
    }
    const out = val.slice(r[0], r[1]).split('\n').map((l) => {
      const m = /^(\s*)(#{1,6}\s+)?([\s\S]*)$/.exec(l) || [];
      const indent = m[1] || '';
      const hashes = m[2] ? m[2].replace(/\s+$/, '').length : 0;
      const body = m[3] || '';
      const next = Math.max(0, Math.min(6, hashes + delta));
      return indent + (next ? new Array(next + 1).join('#') + ' ' : '') + body;
    }).join('\n');
    T.value = val.slice(0, r[0]) + out + val.slice(r[1]);
    this.setSel(T, r[0], r[0] + out.length);
    this.afterEdit(T);
  },

  /* 在文件最前面插一段 YAML Front Matter（已有就不重复插） */
  insertFrontmatter(T) {
    const val = String(T.value == null ? '' : T.value);
    if (/^\s*---\s*\n/.test(val)) {
      new Notice(tr('editor.hasFm'));
      return;
    }
    const text = '---\ntitle: \ndate: ' + fmtDateTime(Date.now()).slice(0, 10) + '\ntags: []\n---\n\n';
    T.value = text + val;
    this.setSel(T, 4, 4);
    this.afterEdit(T);
  },

  insertLink(T, external) {
    const r = this.selRange(T);
    const val = String(T.value == null ? '' : T.value);
    const label = val.slice(r[0], r[1]) || (external ? tr('ui.148') : tr('ui.149'));
    const url = external ? 'https://' : '';
    const text = '[' + label + '](' + url + ')';
    T.value = val.slice(0, r[0]) + text + val.slice(r[1]);
    const caret = r[0] + text.length - 1;
    this.setSel(T, caret, caret);
    this.afterEdit(T);
  },

  clearStyle(T) {
    const r = this.selRange(T);
    const val = String(T.value == null ? '' : T.value);
    const clean = val.slice(r[0], r[1]).replace(/\*\*|__|~~|==|`|<\/?u>/g, '');
    T.value = val.slice(0, r[0]) + clean + val.slice(r[1]);
    this.setSel(T, r[0], r[0] + clean.length);
    this.afterEdit(T);
  },

  selectAllText(T) {
    const len = String(T.value == null ? '' : T.value).length;
    this.setSel(T, 0, len);
    try { if (typeof T.focus === 'function') T.focus(); } catch (e) { /* 忽略 */ }
  },

  /* 删除选中内容；没选中就删掉光标后面的一个字符（和 Del 键一致） */
  deleteSelection(T) {
    const r = this.selRange(T);
    const val = String(T.value == null ? '' : T.value);
    if (r[0] === r[1] && r[0] >= val.length) {
      new Notice(tr('editor.noDel'));
      return;
    }
    T.value = val.slice(0, r[0]) + val.slice(r[1] === r[0] ? r[0] + 1 : r[1]);
    this.setSel(T, r[0], r[0]);
    this.afterEdit(T);
  },

  /* 删掉整段（连同紧挨着的一个空行，别在文件里留一串空行） */
  async deleteBlock(idx) {
    if (this.docMode !== 'edit' || !this.editorEl) return;
    if (idx == null) { new Notice(tr('editor.pickBlock')); return; }
    if (this.canvasBusy || this.commitBusy) {
      try { await Promise.all([this.canvasBusy, this.commitBusy].filter(Boolean)); } catch (e) { /* 忽略 */ }
    }
    const list = (this.blocks || []).slice();
    if (!list[idx]) return;
    const kill = [idx];
    if (list[idx + 1] && list[idx + 1].type === 'blank') kill.push(idx + 1);
    else if (list[idx - 1] && list[idx - 1].type === 'blank') kill.push(idx - 1);
    kill.sort((a, b) => b - a).forEach((k) => list.splice(k, 1));
    // 整篇被删光了 → 留一个空段落当落点，别让文件变成「什么都没有」
    if (!list.some((b) => b.type !== 'blank')) {
      list.length = 0;
      list.push({ type: 'paragraph', raw: '', start: -1, end: -1 });
    }
    const target = Math.max(0, Math.min(idx, list.length - 1));
    this.editorEl.value = list.map((x) => x.raw).join('\n');
    this.pendingRollback = null; // 删完不要被「空段回滚」把删掉的内容再拉回来
    this.editingBlock = null;
    this.blockTa = null;
    this.docDirty = true;
    this.syncDocStatus();
    this.scheduleDocSave();
    const top = this.canvasEl ? this.canvasEl.scrollTop : 0;
    await this.renderCanvas({ blocks: list, target });
    if (this.canvasEl) { try { this.canvasEl.scrollTop = top; } catch (e) { /* 忽略 */ } }
    await this.editBlock(target, 'start');
    new Notice(tr('editor.blockDeleted'));
  },

  /* ⚠ 参数名不能叫 t —— 会遮蔽 i18n 的 tr()，里面就没法取文案了（踩过两次） */
  copyText(tx, msg) {
    const s = String(tx == null ? '' : tx);
    if (!s) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(s);
      }
    } catch (e) { /* 忽略 */ }
    new Notice(msg || tr('notice.copied'));
  },

  clipAction(T, action) {
    const r = this.selRange(T);
    const val = String(T.value == null ? '' : T.value);
    const sel = val.slice(r[0], r[1]);
    if (action === 'copy') {
      this.copyText(sel);
      return;
    }
    if (action === 'cut') {
      this.copyText(sel);
      T.value = val.slice(0, r[0]) + val.slice(r[1]);
      this.setSel(T, r[0], r[0]);
      this.afterEdit(T);
      return;
    }
    const nav = (typeof navigator !== 'undefined') ? navigator : null;
    if (nav && nav.clipboard && nav.clipboard.readText) {
      Promise.resolve(nav.clipboard.readText()).then((t) => {
        if (t) this.insertText(T, String(t));
      }).catch(() => new Notice(tr('editor.noClipboard')));
    } else {
      new Notice(tr('editor.noClipboard'));
    }
  },
});
