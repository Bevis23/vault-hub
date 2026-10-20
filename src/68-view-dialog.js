/* -------------------------------------------------------------------------
 *  工作台视图 · 两个通用浮层（输入 / 确认）
 *  （本片段由 build.js 拼进 main.js，不要单独 require）
 *  -------------------------------------------------------------------------
 *  为什么自己写而不用 Obsidian 的 Modal：
 *   1. 风格要和工作台一致（毛玻璃）
 *   2. 冒烟测试里要能「点得到」—— 用 DOM 构建，测试替身也能跑
 *   3. 只需要「一句话输入」和「是 / 否」，Modal 太重
 * ------------------------------------------------------------------------- */
Object.assign(WorkbenchView.prototype, {
  closeDialog(el) {
    if (!el) return;
    try {
      if (typeof el.remove === 'function') el.remove();
      else if (el.parentElement) el.parentElement.removeChild(el);
    } catch (e) { /* 忽略 */ }
  },

  /* 一句话输入：重命名、新建笔记、新建文件夹都用它 */
  promptText(opts) {
    const o = opts || {};
    // ⚠ 挂在视图根（contentEl）：挂 mainEl 的话会被 .vwb-layer 的 z-index:1
    // 锁进自己的层叠上下文，设置抽屉（z-index:40）一打开就把浮层整层压住
    const host = this.contentEl.createDiv({ cls: 'vwb-dlg vwb-glass' });
    host.createDiv({ cls: 'vwb-dlg-t', text: o.title || '' });
    if (o.desc) host.createDiv({ cls: 'vwb-dlg-d', text: o.desc });
    const input = host.createEl('input', { type: 'text', value: o.value || '' });
    input.className = 'vwb-in';
    if (o.placeholder) input.placeholder = o.placeholder;
    const foot = host.createDiv({ cls: 'vwb-dlg-f' });
    const okBtn = foot.createEl('button', {
      cls: 'vwb-btn vwb-btn-sm vwb-btn-pri', text: o.okText || tr('misc.ok')
    });
    foot.createEl('button', { cls: 'vwb-btn vwb-btn-sm', text: tr('misc.cancel') })
      .addEventListener('click', () => {
        this.closeDialog(host);
        if (o.onCancel) o.onCancel();
      });
    const submit = () => {
      const v = String(input.value || '').trim();
      this.closeDialog(host);
      if (o.onOk) o.onOk(v);
    };
    okBtn.addEventListener('click', submit);
    input.addEventListener('keydown', (e) => {
      // 别让 Obsidian 的全局快捷键把输入抢走
      if (e && e.stopPropagation) e.stopPropagation();
      if (e.key === 'Enter') submit();
      else if (e.key === 'Escape') {
        this.closeDialog(host);
        if (o.onCancel) o.onCancel();
      }
    });
    setTimeout(() => { try { input.focus(); } catch (e) { /* 忽略 */ } }, 30);
    return host;
  },

  /* 确认框：所有不可逆操作前都要过它一次 */
  confirmBox(opts) {
    const o = opts || {};
    const host = this.contentEl.createDiv({ cls: 'vwb-dlg vwb-glass' });
    host.createDiv({ cls: 'vwb-dlg-t', text: o.title || tr('misc.confirmTitle') });
    if (o.desc) host.createDiv({ cls: 'vwb-dlg-d', text: o.desc });
    const foot = host.createDiv({ cls: 'vwb-dlg-f' });
    const okBtn = foot.createEl('button', {
      cls: 'vwb-btn vwb-btn-sm' + (o.danger ? ' is-danger' : ' vwb-btn-pri'),
      text: o.okText || tr('dlg.okText')
    });
    foot.createEl('button', { cls: 'vwb-btn vwb-btn-sm', text: tr('misc.cancel') })
      .addEventListener('click', () => {
        this.closeDialog(host);
        if (o.onCancel) o.onCancel();
      });
    okBtn.addEventListener('click', () => {
      this.closeDialog(host);
      if (o.onOk) o.onOk();
    });
    return host;
  }
});
