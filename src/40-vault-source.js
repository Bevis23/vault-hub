/* -------------------------------------------------------------------------
 *  外部库磁盘扫描与索引（纯函数）
 *  （本片段由 build.js 拼进 main.js，不要单独 require）
 * ------------------------------------------------------------------------- */
/* ---------------------------------------------------- external vault scan */
const EXCLUDE_DIRS = new Set(['.obsidian', '.git', 'node_modules', '.trash', '.cache']);
/* Obsidian 会忽略所有点开头的文件 / 文件夹（.obsidian 是它自己的配置目录）——
 * 外部库扫描要跟它保持一致，不然工作台里会多出一堆 Obsidian 里根本看不到的东西 */
function isIgnoredEntry(name) {
  const n = String(name || '');
  return !n || n.charAt(0) === '.' || EXCLUDE_DIRS.has(n);
}

function scanExternalVault(rootPath) {
  const files = [];
  const folderCount = {};
  const folders = [];   // 全部子目录（**含空文件夹**）：光靠文件反推，空文件夹永远看不见
  try {
    const walk = (dir, rel) => {
      let entries = [];
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
      for (const en of entries) {
        if (isIgnoredEntry(en.name)) continue;
        if (en.isDirectory()) {
          const sub = rel ? rel + '/' + en.name : en.name;
          folders.push({ path: sub, name: en.name });
          walk(pathMod.join(dir, en.name), sub);
        } else if (en.isFile()) {
          const relPath = rel ? rel + '/' + en.name : en.name;
          let st = null;
          try { st = fs.statSync(pathMod.join(dir, en.name)); } catch (e) { continue; }
          const folder = rel || '';
          folderCount[folder] = (folderCount[folder] || 0) + 1;
          const ext = pathMod.extname(en.name).toLowerCase();
          files.push({
            id: rootPath + '::' + relPath,
            name: baseNameOf(en.name),
            relPath: relPath,
            absPath: pathMod.join(dir, en.name),
            folder: folder,
            size: st.size,
            mtime: st.mtimeMs,
            ctime: st.birthtimeMs || st.ctimeMs,
            ext: ext,
            tags: [],
            external: true
          });
        }
      }
    };
    walk(rootPath, '');
  } catch (e) {
    console.error('[vault-workbench] scan failed', e);
  }
  return { files: files, folders: folders, folderCount: folderCount };
}

function extractTagsFromHead(absPath) {
  try {
    const buf = Buffer.alloc(4096);
    const fd = fs.openSync(absPath, 'r');
    const read = fs.readSync(fd, buf, 0, 4096, 0);
    fs.closeSync(fd);
    const head = buf.slice(0, read).toString('utf8');
    const tags = [];
    const fm = head.match(/^---\r?\n([\s\S]*?)\r?\n?---/);
    if (fm) {
      const body = fm[1];
      const inline = body.match(/^tags?:\s*\[(.*)\]/im);
      if (inline) {
        for (const t of inline[1].split(',')) {
          const v = t.trim().replace(/^['"]|['"]$/g, '').replace(/^#/, '');
          if (v) tags.push('#' + v);
        }
      }
      const list = body.match(/^tags?:\s*\n((?:\s*-\s*.+\n?)+)/im);
      if (list) {
        for (const line of list[1].split('\n')) {
          const m = line.match(/^\s*-\s*(.+)$/);
          if (m) tags.push('#' + m[1].trim().replace(/^#/, ''));
        }
      }
    }
    const inlineTags = head.match(/(^|\s)#([\w一-龥\-/]+)/g);
    if (inlineTags) {
      for (const t of inlineTags) {
        const v = t.trim();
        if (v.indexOf('#') === 0 && !tags.some((x) => x.toLowerCase() === v.toLowerCase())) tags.push(v);
      }
    }
    return tags.slice(0, 8);
  } catch (e) {
    return [];
  }
}
