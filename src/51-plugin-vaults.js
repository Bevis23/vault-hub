/* -------------------------------------------------------------------------
 *  插件：跨库清单 / 自部署 / 切换库
 *  （本片段由 build.js 拼进 main.js，不要单独 require）
 *  -------------------------------------------------------------------------
 *  为什么要有这一段：
 *    Obsidian 的插件天然按库隔离 —— 别的库没有这个文件，切过去就没有工作台。
 *    所以「切换库」不能只是丢一个链接，得先把工作台自己装过去。
 *    顺序固定：先部署 → 再切。反了就会切到一个没有工作台的裸库。
 * ------------------------------------------------------------------------- */
Object.assign(VaultWorkbenchPlugin.prototype, {
  /* 本插件自己的绝对路径（manifest.dir 是相对于库根的，这里补成绝对路径） */
  pluginDirAbs() {
    const base = this.currentVaultPath();
    if (!base || !this.manifest || !this.manifest.dir) return '';
    return pathMod.resolve(base, this.manifest.dir);
  },

  /* ---------------------------------------------------- 跨库共享的清单 */
  readObsidianConfig() {
    return readJsonFile(obsidianConfigPath(), {});
  },
  readSharedVaults() {
    const d = readJsonFile(sharedVaultsPath(), {});
    return {
      extra: Array.isArray(d.extra) ? d.extra : [],
      aliases: (d.aliases && typeof d.aliases === 'object') ? d.aliases : {},
      hidden: Array.isArray(d.hidden) ? d.hidden : []
    };
  },
  writeSharedVaults(data) {
    const w = writeJsonFile(sharedVaultsPath(), data);
    if (!w.ok) console.error('[vault-hub] failed writing global vault list', w.err);
    return w.ok;
  },
  /* 登记一个库：本库设置 + 全局清单各写一份。
   * 只写本库的话，切到别的库这个登记就没了 —— 全局清单才是跨库的那份。 */
  registerVaultPath(p) {
    const np = String(p || '').replace(/\\/g, '/').replace(/\/+$/, '');
    if (!np) return false;
    const s = this.settings.vaults;
    if (s.extra.indexOf(np) < 0) s.extra.push(np);
    const shared = this.readSharedVaults();
    if (shared.extra.indexOf(np) < 0) shared.extra.push(np);
    this.writeSharedVaults(shared);
    this.saveSettings();
    return true;
  },
  forgetVaultPath(p) {
    const np = String(p || '').replace(/\\/g, '/').replace(/\/+$/, '');
    const s = this.settings.vaults;
    let i = s.extra.indexOf(np);
    if (i >= 0) s.extra.splice(i, 1);
    const shared = this.readSharedVaults();
    i = shared.extra.indexOf(np);
    if (i >= 0) shared.extra.splice(i, 1);
    this.writeSharedVaults(shared);
    this.saveSettings();
  },

  /* ------------------------------------------------------ 工作台装了没 */
  /* self（就是当前库）/ ok（装了且够新）/ stale（装了但版本更老）/ none（没装） */
  workbenchStateOf(vaultPath) {
    const p = String(vaultPath || '').replace(/\\/g, '/').replace(/\/+$/, '');
    const cur = this.currentVaultPath().replace(/\\/g, '/').replace(/\/+$/, '');
    if (p && p.toLowerCase() === cur.toLowerCase()) return { state: 'self', ver: (this.manifest && this.manifest.version) || '' };
    const id = (this.manifest && this.manifest.id) || '';
    const ver = id ? workbenchVersionIn(p, id) : '';
    if (!ver) return { state: 'none', ver: '' };
    const mine = (this.manifest && this.manifest.version) || '';
    if (mine && cmpVer(ver, mine) < 0) return { state: 'stale', ver: ver };
    return { state: 'ok', ver: ver };
  },

  /* -------------------------------------------------------------- 自部署 */
  /* 把工作台装进另一个库。返回 { ok, changed, reason, from, to } */
  deployWorkbenchTo(vaultPath) {
    const p = String(vaultPath || '').replace(/\\/g, '/').replace(/\/+$/, '');
    if (!p) return { ok: false, changed: false, reason: tr('notice.noTargetPath'), from: '', to: '' };
    if (!looksLikeVault(p)) {
      return {
        ok: false, changed: false, from: '', to: '',
        reason: tr('ui.257') +
          tr('ui.258')
      };
    }
    const st = this.workbenchStateOf(p);
    if (st.state === 'self') return { ok: true, changed: false, reason: '', from: st.ver, to: st.ver };
    if (isCloudSyncedPath(p)) {
      new Notice(tr('switch.cloudHint', { name: baseNameOf(p) }));
    }
    return deployWorkbenchToVault({
      pluginId: (this.manifest && this.manifest.id) || '',
      srcDir: this.pluginDirAbs(),
      vaultPath: p,
      settings: this.settings
    });
  },

  /* -------------------------------------------------------------- 切库 */
  /* 先自部署 → 再切。返回 { ok, reason } —— 部署失败就绝不切，
   * 否则用户会掉进一个没有工作台的库，还得手动切回来。 */
  switchToVault(vaultPath) {
    const p = String(vaultPath || '').replace(/\\/g, '/').replace(/\/+$/, '');
    if (!p) { new Notice(tr('switch.noPath')); return { ok: false, reason: 'no path' }; }
    const cur = this.currentVaultPath().replace(/\\/g, '/').replace(/\/+$/, '');
    if (p.toLowerCase() === cur.toLowerCase()) {
      new Notice(tr('switch.alreadyIn', { name: baseNameOf(p) }));
      return { ok: true, reason: '' };
    }
    if (!looksLikeVault(p)) {
      new Notice(tr('switch.notVault', { name: baseNameOf(p) }) +
        tr('switch.notVaultFix'), 12000);
      return { ok: false, reason: tr('notice.notVaultShort') };
    }

    const d = this.deployWorkbenchTo(p);
    if (!d.ok) {
      new Notice(tr('switch.installFail', { reason: d.reason }));
      return { ok: false, reason: d.reason };
    }
    if (d.changed) {
      if (!d.from) {
        new Notice((d.to ? tr('switch.installedVer', { name: baseNameOf(p), ver: d.to }) : tr('switch.installed', { name: baseNameOf(p) })) +
          tr('switch.restrictedHint'), 12000);
      } else {
        new Notice(tr('switch.updated', { name: baseNameOf(p), from: d.from, to: d.to }), 8000);
      }
    }

    const uri = vaultOpenUri(p);
    const opened = openExternalUri(uri);
    if (!opened) {
      new Notice(tr('switch.jumpFail', { uri: uri }));
      return { ok: false, reason: tr('notice.jumpFailShort') };
    }
    new Notice(tr('switch.switching', { name: baseNameOf(p) }), 10000);
    this.logOp({ type: 'switch-vault', path: p });
    return { ok: true, reason: '' };
  },

  vaultUriOf(vaultPath) {
    return vaultOpenUri(String(vaultPath || '').replace(/\\/g, '/').replace(/\/+$/, ''));
  }
});
