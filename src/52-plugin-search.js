/* -------------------------------------------------------------------------
 *  插件：跨库全文搜索
 *  （本片段由 build.js 拼进 main.js，不要单独 require）
 *  -------------------------------------------------------------------------
 *  当前库与外部库走同一套：抽纯文本 → 落盘索引 → 子串检索。
 *  索引是懒建的：只有真的按「所有库」搜了才建，浏览时完全不受影响。
 * ------------------------------------------------------------------------- */
Object.assign(VaultWorkbenchPlugin.prototype, {
  /* 某个库参与搜索的文件清单（复用已有的索引，不重复扫盘） */
  searchableFilesOf(vaultPath) {
    const idx = this.indexOf(vaultPath);
    return (idx.files || []).filter((f) => isSearchable(f.ext));
  },

  /* 拿到（必要时先建好）某个库的搜索索引。
   * 带 5 秒内存缓存：边打字边搜时不会每次都去读一遍索引文件。 */
  ensureSearchIndex(vaultPath) {
    if (!this.searchIdxCache) this.searchIdxCache = {};
    const hit = this.searchIdxCache[vaultPath];
    if (hit && Date.now() - hit.ts < 5000) return hit.idx;
    const files = this.searchableFilesOf(vaultPath);
    const r = refreshSearchIndex(vaultPath, files);
    this.searchIdxCache[vaultPath] = { ts: Date.now(), idx: r.idx };
    return r.idx;
  },

  /* 跨库搜索：query 为空时返回空数组（UI 不该调）
   * 搜两样东西，结果合并去重：
   *   1. 正文（走索引，只有 md / txt）
   *   2. 文件名 / 路径 / 标签（**所有文件都算**——否则「30天渗透.pdf」这种
   *      名字里带关键词的 PDF / 图片在跨库模式反而搜不到，比当前库模式还少）
   * 返回 [{ vault, vaultName, relPath, name, snippet, at, byName }] */
  searchAllVaults(query, opts) {
    const o = opts || {};
    const terms = searchTermsOf(query);
    if (!terms.length) return [];
    const vaults = o.vaults || this.discoverVaults();
    const limit = o.limit || 200;
    const out = [];
    const seen = {};
    for (const v of vaults) {
      // 1) 正文命中
      let idx = null;
      try { idx = this.ensureSearchIndex(v.path); } catch (e) {
        console.error('[vault-workbench] failed building index', v.path, e);
      }
      if (idx) {
        for (const h of searchIndex(idx, terms, limit, 40)) {
          const key = v.path + '::' + h.relPath;
          if (seen[key]) continue;
          seen[key] = 1;
          out.push({
            vault: v.path,
            vaultName: v.name,
            current: !!v.current,
            relPath: h.relPath,
            name: baseNameOf(h.relPath),
            folder: parentOf(h.relPath),
            snippet: h.snippet,
            at: h.at,
            byName: false
          });
        }
      }
      // 2) 文件名 / 路径 / 标签命中（所有文件，含 PDF、图片等不进正文的）
      const files = this.indexOf(v.path).files || [];
      for (const f of files) {
        const key = v.path + '::' + f.relPath;
        if (seen[key]) continue;
        const hay = (f.relPath + ' ' + (f.tags || []).join(' ')).toLowerCase();
        let at = -1;
        let ok = true;
        for (const t of terms) {
          const p = hay.indexOf(t);
          if (p < 0) { ok = false; break; }
          if (at < 0 || p < at) at = p;
        }
        if (!ok) continue;
        seen[key] = 1;
        out.push({
          vault: v.path,
          vaultName: v.name,
          current: !!v.current,
          relPath: f.relPath,
          name: f.name,
          folder: f.folder,
          snippet: '',
          at: at,
          byName: true
        });
      }
    }
    // 当前库的命中排前面，其余按命中位置
    out.sort((a, b) => (a.current === b.current ? a.at - b.at : (a.current ? -1 : 1)));
    return out.slice(0, limit);
  },

  /* 清掉全部搜索索引（设置页「重建索引」用） */
  clearSearchIndexes() {
    this.searchIdxCache = {};
    try {
      const dir = searchIndexDir();
      if (!fs.existsSync(dir)) return true;
      for (const f of fs.readdirSync(dir)) {
        try { fs.unlinkSync(pathMod.join(dir, f)); } catch (e) { /* 清不掉就算了 */ }
      }
      return true;
    } catch (e) {
      console.error('[vault-workbench] failed clearing index', e);
      return false;
    }
  },

  /* 跨库最近文件：把各库的笔记按修改时间聚合（P0-3） */
  recentAcrossVaults(limit, opts) {
    const o = opts || {};
    const cap = limit || 50;
    const vaults = o.vaults || this.discoverVaults();
    const out = [];
    for (const v of vaults) {
      const idx = this.indexOf(v.path);
      for (const f of idx.files || []) {
        if (!isSearchable(f.ext)) continue;
        out.push({
          vault: v.path,
          vaultName: v.name,
          current: !!v.current,
          relPath: f.relPath,
          name: f.name,
          folder: f.folder,
          mtime: f.mtime,
          ext: f.ext,
          external: !!f.external
        });
      }
    }
    out.sort((a, b) => b.mtime - a.mtime);
    return out.slice(0, cap);
  }
});
