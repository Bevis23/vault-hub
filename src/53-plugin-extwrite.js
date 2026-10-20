/* -------------------------------------------------------------------------
 *  插件：别的库的结构操作（重命名 / 删除 / 新建）+ 跨库复制
 *  （本片段由 build.js 拼进 main.js，不要单独 require）
 *  -------------------------------------------------------------------------
 *  铁律（这是全项目最容易闯祸的地方）：
 *   1. **先算计划再动手** —— 引用自愈先算出「要改哪些文件的哪些处」，交给 UI 确认
 *   2. **只动 .md** —— 图片 / PDF / 附件一律不重写
 *   3. **每步都进操作日志** —— 重命名与删除都留了回滚需要的信息
 *   4. **失败就停** —— 引用改到一半出错，剩下的不再继续，并告诉用户改了几篇
 * ------------------------------------------------------------------------- */
Object.assign(VaultWorkbenchPlugin.prototype, {
  /* 该库是不是可写（只读盘 / 没权限都会写不动） */
  vaultWritable(vaultPath) {
    const p = String(vaultPath || '');
    if (!p || !looksLikeVault(p)) return false;
    try {
      fs.accessSync(p, fs.constants ? fs.constants.W_OK : 2);
      return true;
    } catch (e) {
      return false;
    }
  },

  /* ------------------------------------------------------- 重命名 / 移动 */
  /* 先算引用计划（不写盘），交给 UI 弹确认；确认后调 applyExtRename */
  planExtRename(vaultPath, oldRel, newRel, isFolder) {
    const files = (this.indexOf(vaultPath).files || []);
    const plan = planLinkRewrite(files, oldRel, newRel, { folder: !!isFolder });
    return { plan: plan, refs: countRefs(plan), files: plan.length };
  },

  applyExtRename(vaultPath, oldRel, newRel, isFolder) {
    const r = renameInVault(vaultPath, oldRel, newRel);
    if (!r.ok) return { ok: false, reason: r.reason, refs: 0, files: 0 };
    // 文件已经改名成功，接下来把引用它的地方改掉
    const plan = planLinkRewrite((this.indexOf(vaultPath).files || []), oldRel, newRel, { folder: !!isFolder });
    const done = applyLinkRewrite(plan);
    this.externalCache = {};
    this.searchIdxCache = {};
    this.logOp({
      type: 'ext-rename',
      path: oldRel + ' → ' + newRel,
      vault: vaultPath,
      from: oldRel,
      to: newRel,
      refs: countRefs(plan),
      undo: 'ext-rename'
    });
    return {
      ok: true,
      reason: done.failed ? tr('notice.refPartial', { name: done.failed, n: done.done.length }) : '',
      refs: countRefs(plan),
      files: done.done.length
    };
  },

  /* 撤销重命名：文件改回原名 + 引用反向重写一次 */
  undoExtRename(op) {
    if (!op || !op.vault) return { ok: false, reason: tr('notice.undoNoVault') };
    const back = renameInVault(op.vault, op.to, op.from);
    if (!back.ok) return { ok: false, reason: back.reason };
    const plan = planLinkRewrite((this.indexOf(op.vault).files || []), op.to, op.from);
    applyLinkRewrite(plan);
    this.externalCache = {};
    this.searchIdxCache = {};
    return { ok: true, reason: '' };
  },

  /* ------------------------------------------------------------- 删除 */
  extDelete(vaultPath, rel, isFolder) {
    const files = (this.indexOf(vaultPath).files || []);
    // 谁引用了它（只统计，不改）—— 删除会把这些引用变成死链，所以要提前告诉用户
    const refs = planLinkRewrite(files, rel, rel, { folder: !!isFolder, countOnly: true });
    const r = trashInVault(vaultPath, rel);
    if (!r.ok) return { ok: false, reason: r.reason, refs: countRefs(refs) };
    this.externalCache = {};
    this.searchIdxCache = {};
    this.logOp({
      type: 'ext-delete',
      path: rel,
      vault: vaultPath,
      to: r.dest,
      refs: countRefs(refs),
      undo: 'ext-delete'
    });
    return { ok: true, reason: '', refs: countRefs(refs), dest: r.dest };
  },

  undoExtDelete(op) {
    if (!op || !op.vault || !op.to) return { ok: false, reason: tr('notice.undoIncomplete') };
    const r = restoreInVault(op.to, op.vault, op.path);
    this.externalCache = {};
    return r;
  },

  /* ------------------------------------------------------------- 新建 */
  extCreateNote(vaultPath, rel, content) {
    const r = createNoteInVault(vaultPath, rel, content == null ? '' : content);
    if (r.ok) {
      this.externalCache = {};
      this.logOp({ type: 'ext-create', path: rel, vault: vaultPath });
    }
    return r;
  },
  extCreateFolder(vaultPath, rel) {
    const r = createFolderInVault(vaultPath, rel);
    if (r.ok) {
      this.externalCache = {};
      this.logOp({ type: 'ext-create-folder', path: rel, vault: vaultPath });
    }
    return r;
  },

  /* ------------------------------------------------------------- 回收站 */
  /* 所有库的回收站合起来看：不用再跑到各自的库里去翻 .trash */
  trashList(opts) {
    const o = opts || {};
    const vaults = o.vaults || this.discoverVaults();
    const out = [];
    for (const v of vaults) {
      if (v.isVault === false) continue;
      const items = listTrash(v.path);
      if (items.length) out.push({ vault: v.path, vaultName: v.name, current: !!v.current, items: items });
    }
    return out;
  },
  restoreTrashItem(vaultPath, name) {
    const r = restoreFromTrash(vaultPath, name);
    if (r.ok) { this.externalCache = {}; this.searchIdxCache = {}; }
    return r;
  },
  purgeTrashItem(vaultPath, name) {
    return purgeFromTrash(vaultPath, name);
  },
  emptyVaultTrash(vaultPath) {
    return emptyTrash(vaultPath);
  },

  /* --------------------------------------------------------- 跨库复制 */
  /* 只复制，不移动 —— 原件留在原库，副本的链接指不过去也不影响原库。
   * items: [{ relPath, absPath, kind }]（kind: 'file' | 'folder'） */
  copyAcrossVault(items, dstVault, dstFolder) {
    const dst = String(dstVault || '');
    if (!dst) return { ok: false, done: [], reason: tr('notice.noTargetVault') };
    if (!this.vaultWritable(dst)) {
      return { ok: false, done: [], reason: tr('notice.targetReadonly') };
    }
    const folder = String(dstFolder || '');
    const done = [];
    let reason = '';
    for (const it of items || []) {
      const srcAbs = it.absPath || pathMod.join(this.currentVaultPath(), it.relPath);
      const dstRel = (folder ? folder + '/' : '') + baseNameOf(it.relPath);
      const r = it.kind === 'folder'
        ? copyDirAcross(srcAbs, dst, dstRel)
        : copyFileAcross(srcAbs, dst, dstRel);
      if (r.ok) done.push({ from: it.relPath, to: r.rel });
      else reason = reason || r.reason;
    }
    this.externalCache = {};
    this.logOp({
      type: 'copy-across',
      path: done.map((d) => d.to).join(', '),
      vault: dst,
      count: done.length
    });
    return { ok: done.length > 0, done: done, reason: reason };
  }
});
