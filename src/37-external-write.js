/* -------------------------------------------------------------------------
 *  外部库的结构改动（纯函数：重命名 / 删除 / 新建 / 跨库复制 + 双链自愈）
 *  （本片段由 build.js 拼进 main.js，不要单独 require）
 *  -------------------------------------------------------------------------
 *  ⚠ 这一段是**全项目风险最高的代码**：它会批量改写用户库里的 .md。
 *  所以函数分成「先算计划、再执行」两步 —— 调用方必须先把计划拿给用户确认，
 *  用户点头了才允许 apply。任何一步失败都要能回滚/看得见。
 *
 *  只动 .md：其它格式（图片、PDF、附件）一律不重写，避免改坏二进制文件。
 * ------------------------------------------------------------------------- */
const LINK_RE = /(!?)\[\[([^\]\n]+)\]\]/g;

/* ---------------------------------------------------------- 双链的拆解 */
/* [[路径#标题|别名]] → { target, heading, alias } */
function splitLink(inner) {
  let rest = String(inner || '');
  let alias = '';
  const pi = rest.indexOf('|');
  if (pi >= 0) { alias = rest.slice(pi + 1); rest = rest.slice(0, pi); }
  let heading = '';
  const hi = rest.indexOf('#');
  if (hi >= 0) { heading = rest.slice(hi + 1); rest = rest.slice(0, hi); }
  return { target: rest.trim(), heading: heading, alias: alias };
}
function rebuildLink(bang, target, heading, alias) {
  let s = String(target || '');
  if (heading) s += '#' + heading;
  if (alias) s += '|' + alias;
  return (bang || '') + '[[' + s + ']]';
}
function stripMd(p) {
  return String(p || '').replace(/\.md$/i, '');
}
/* Obsidian 的匹配规则：
 *   链接里带 / → 按完整路径比；不带 / → 只按文件名比（这也是为什么移动笔记
 *   时，只写 [[笔记名]] 的地方不需要改）。 */
function linkMatches(target, oldRel) {
  const t = stripMd(String(target || '').replace(/\\/g, '/'));
  const o = stripMd(String(oldRel || '').replace(/\\/g, '/'));
  if (!t || !o) return false;
  if (t.indexOf('/') >= 0) return t.toLowerCase() === o.toLowerCase();
  return baseNameOf(t).toLowerCase() === baseNameOf(o).toLowerCase();
}

/* ------------------------------------------------------ 第一步：算计划 */
/* 扫出「哪些文件里、有哪些地方」引用了 oldRel，算出改完之后的样子。
 * 只算不动手。返回 [{ file, absPath, text, next, hits: [{from,to}] }] */
function planLinkRewrite(files, oldRel, newRel, opts) {
  const o = opts || {};
  const plan = [];
  const oldFull = stripMd(String(oldRel || '').replace(/\\/g, '/'));
  const newFull = stripMd(String(newRel || '').replace(/\\/g, '/'));
  const newBase = baseNameOf(newFull);
  const oldBase = baseNameOf(oldFull);
  for (const f of files || []) {
    if (String(f.ext).toLowerCase() !== '.md') continue;   // 只动 Markdown
    let txt = '';
    try { txt = fs.readFileSync(f.absPath, 'utf8'); } catch (e) { continue; }
    if (txt.indexOf('[[') < 0) continue;
    const hits = [];
    LINK_RE.lastIndex = 0;
    const next = txt.replace(LINK_RE, (m, bang, inner) => {
      const p = splitLink(inner);
      const raw = String(p.target || '').replace(/\\/g, '/');
      let nt = null;
      if (raw.indexOf('/') >= 0) {
        const t = stripMd(raw);
        if (t.toLowerCase() === oldFull.toLowerCase()) {
          nt = newFull;                                    // 写全路径的：整段换掉
        } else if (o.folder && t.toLowerCase().indexOf(oldFull.toLowerCase() + '/') === 0) {
          // 文件夹改名：[[旧文件夹/笔记]] → [[新文件夹/笔记]]
          nt = newFull + t.slice(oldFull.length);
        }
      } else if (baseNameOf(stripMd(raw)).toLowerCase() === oldBase.toLowerCase()) {
        nt = newBase;                                      // 只写名字的：换名字
      }
      if (nt === null) return m;
      const to = rebuildLink(bang, nt, p.heading, p.alias);
      // countOnly（删除前统计有多少处引用会变死链）：新旧一样也要记一笔
      if (to !== m || o.countOnly) hits.push({ from: m, to: to });
      return to;
    });
    LINK_RE.lastIndex = 0;
    if (hits.length) plan.push({ file: f.relPath, absPath: f.absPath, text: txt, next: next, hits: hits });
  }
  return plan;
}
function countRefs(plan) {
  let n = 0;
  for (const p of plan) n += p.hits.length;
  return n;
}

/* ------------------------------------------------------ 第二步：执行 */
/* 逐个原子写（临时文件 + rename）。返回 { done: [...], failed: file|null }
 * 中途失败就停 —— 宁可只改了一半让用户看得见，也不要闷头继续。 */
function applyLinkRewrite(plan) {
  const done = [];
  let failed = null;
  for (const p of plan) {
    const tmp = p.absPath + '.vwb-tmp';
    try {
      fs.writeFileSync(tmp, p.next, 'utf8');
      fs.renameSync(tmp, p.absPath);
      done.push(p.file);
    } catch (e) {
      try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch (e2) { /* 清不掉就算了 */ }
      failed = p.file;
      break;
    }
  }
  return { done: done, failed: failed };
}
/* 撤销：把计划反过来执行一次（oldRel / newRel 对调） */
function undoLinkRewrite(plan) {
  const back = plan.map((p) => Object.assign({}, p, { text: p.next, next: p.text }));
  return applyLinkRewrite(back);
}

/* ----------------------------------------------- 外部库的重命名 / 移动 */
function renameInVault(rootPath, oldRel, newRel) {
  const src = pathMod.join(rootPath, oldRel);
  const dst = pathMod.join(rootPath, newRel);
  if (fs.existsSync(dst)) return { ok: false, reason: tr('ui.262') + newRel };
  try {
    fs.mkdirSync(pathMod.dirname(dst), { recursive: true });
    fs.renameSync(src, dst);
    return { ok: true, reason: '' };
  } catch (e) {
    return { ok: false, reason: fsErrorText(e, tr('ui.263')) };
  }
}

/* ------------------------------------------------------- 外部库删除 */
/* 不用系统回收站（不可控），也不用直接删（不可逆）——
 * 挪到库内的 .trash 里，跟 Obsidian 自己的「库内 .trash」策略一致，可恢复。
 *
 * 顺带在 .trash 里留一份映射表（原名 → 原来的路径）：
 * 「回收站」页面要靠它知道某个东西**原来在哪**，不然恢复时只能靠内存里的操作日志，
 * 重启 Obsidian 之后就找不回去了。 */
function trashMapPath(rootPath) {
  return pathMod.join(rootPath, '.trash', '.vwb-trash.json');
}
function readTrashMap(rootPath) {
  const m = readJsonFile(trashMapPath(rootPath), null);
  return (m && typeof m === 'object') ? m : {};
}
function writeTrashMap(rootPath, map) {
  const w = writeJsonFile(trashMapPath(rootPath), map);
  if (!w.ok) console.error('[vault-hub] failed writing trash map', w.err);
  return w.ok;
}

function trashInVault(rootPath, rel) {
  const src = pathMod.join(rootPath, rel);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  let isDir = false;
  try { isDir = fs.statSync(src).isDirectory(); } catch (e) { return { ok: false, dest: '', name: '', reason: tr('ui.264') + rel }; }
  const name = baseNameOf(rel) + '.' + stamp + (isDir ? '.d' : '');
  const dest = pathMod.join(rootPath, '.trash', name);
  try {
    fs.mkdirSync(pathMod.dirname(dest), { recursive: true });
    fs.renameSync(src, dest);
    const map = readTrashMap(rootPath);
    map[name] = { rel: rel, ts: Date.now(), isDir: isDir };
    writeTrashMap(rootPath, map);
    return { ok: true, dest: dest, name: name, reason: '' };
  } catch (e) {
    return { ok: false, dest: '', name: '', reason: fsErrorText(e, tr('ui.265')) };
  }
}

/* 当前库删除专用：Obsidian 的删除策略如果是「系统回收站」或「永久删除」，
 * 库里不会留下任何副本 —— 回收站页面就永远看不到它（用户报的 bug）。
 * 所以删之前先**复制一份**进库内 .trash 并登记映射：不管用户策略是什么，
 * 工作台的回收站都能看到、能还原。返回 {ok, name, dest, reason} */
function trashCopyInVault(rootPath, rel) {
  const src = pathMod.join(rootPath, rel);
  let isDir = false;
  try { isDir = fs.statSync(src).isDirectory(); } catch (e) {
    return { ok: false, name: '', dest: '', reason: tr('ui.264') + rel };
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const name = baseNameOf(rel) + '.' + stamp + (isDir ? '.d' : '');
  const dstRel = pathMod.join('.trash', name);
  const r = isDir ? copyDirAcross(src, rootPath, dstRel) : copyFileAcross(src, rootPath, dstRel);
  if (!r.ok) return { ok: false, name: '', dest: '', reason: r.reason };
  const map = readTrashMap(rootPath);
  map[name] = { rel: rel, ts: Date.now(), isDir: isDir, copy: true };
  writeTrashMap(rootPath, map);
  return { ok: true, name: name, dest: pathMod.join(rootPath, r.rel), reason: '' };
}

/* 列出某个库回收站里的东西（按删除时间倒序） */
/* 只读文件开头 bytes 个字节（卡片摘要用，避免为大文件付全量读取的代价） */
function readHeadAbs(abs, bytes) {
  let fd = null;
  try {
    fd = fs.openSync(abs, 'r');
    const buf = Buffer.alloc(bytes);
    const n = fs.readSync(fd, buf, 0, bytes, 0);
    return buf.toString('utf8', 0, n);
  } finally {
    if (fd != null) { try { fs.closeSync(fd); } catch (e) { /* 忽略 */ } }
  }
}
function listTrash(rootPath) {
  const dir = pathMod.join(rootPath, '.trash');
  if (!fs.existsSync(dir)) return [];
  const map = readTrashMap(rootPath);
  const out = [];
  try {
    for (const en of fs.readdirSync(dir, { withFileTypes: true })) {
      if (isIgnoredEntry(en.name)) continue;
      const m = map[en.name] || {};
      out.push({
        name: en.name,
        rel: m.rel || '',          // 没有记录 → 不是我们删的，恢复不了
        ts: m.ts || 0,
        isDir: !!en.isDirectory(),
        known: !!m.rel
      });
    }
  } catch (e) { return out; }
  out.sort((a, b) => b.ts - a.ts);
  return out;
}
/* 恢复：按映射表挪回原处 */
function restoreFromTrash(rootPath, name) {
  const map = readTrashMap(rootPath);
  const m = map[name];
  if (!m || !m.rel) return { ok: false, reason: tr('ui.266') };
  const r = restoreInVault(pathMod.join(rootPath, '.trash', name), rootPath, m.rel);
  if (r.ok) {
    delete map[name];
    writeTrashMap(rootPath, map);
  }
  return r;
}
/* 彻底删除：不可撤销，所以调用方必须先弹确认 */
function purgeFromTrash(rootPath, name) {
  try {
    fs.rmSync(pathMod.join(rootPath, '.trash', name), { recursive: true, force: true });
    const map = readTrashMap(rootPath);
    delete map[name];
    writeTrashMap(rootPath, map);
    return { ok: true, reason: '' };
  } catch (e) {
    return { ok: false, reason: fsErrorText(e, tr('ui.267')) };
  }
}
function emptyTrash(rootPath) {
  const items = listTrash(rootPath);
  let n = 0;
  for (const it of items) {
    if (purgeFromTrash(rootPath, it.name).ok) n++;
  }
  return { ok: true, count: n, reason: '' };
}
/* 撤销删除：从 .trash 挪回原处 */
function restoreInVault(dest, rootPath, rel) {
  const back = pathMod.join(rootPath, rel);
  try {
    fs.mkdirSync(pathMod.dirname(back), { recursive: true });
    fs.renameSync(dest, back);
    return { ok: true, reason: '' };
  } catch (e) {
    return { ok: false, reason: fsErrorText(e, tr('ui.268')) };
  }
}

/* ------------------------------------------------------- 外部库新建 */
function createNoteInVault(rootPath, rel, content) {
  const dst = pathMod.join(rootPath, rel);
  if (fs.existsSync(dst)) return { ok: false, reason: tr('ui.269') + rel };
  try {
    fs.mkdirSync(pathMod.dirname(dst), { recursive: true });
    const tmp = dst + '.vwb-tmp';
    fs.writeFileSync(tmp, content == null ? '' : content, 'utf8');
    fs.renameSync(tmp, dst);
    return { ok: true, reason: '' };
  } catch (e) {
    return { ok: false, reason: fsErrorText(e, tr('ui.270')) };
  }
}
function createFolderInVault(rootPath, rel) {
  const dst = pathMod.join(rootPath, rel);
  if (fs.existsSync(dst)) return { ok: false, reason: tr('ui.269') + rel };
  try {
    fs.mkdirSync(dst, { recursive: true });
    return { ok: true, reason: '' };
  } catch (e) {
    return { ok: false, reason: fsErrorText(e, tr('ui.271')) };
  }
}

/* ------------------------------------------------------- 跨库复制 */
/* 重名避让：目标已有同名就加序号，绝不覆盖（复制是安全的，覆盖不是） */
function uniqueRelIn(rootPath, rel) {
  const dot = String(rel).lastIndexOf('.');
  const base = dot > 0 ? String(rel).slice(0, dot) : String(rel);
  const ext = dot > 0 ? String(rel).slice(dot) : '';
  let cand = rel;
  let i = 1;
  while (fs.existsSync(pathMod.join(rootPath, cand))) {
    i++;
    cand = base + ' ' + i + ext;
  }
  return cand;
}
function copyFileAcross(srcAbs, dstRoot, dstRel) {
  const rel = uniqueRelIn(dstRoot, dstRel);
  const dst = pathMod.join(dstRoot, rel);
  try {
    fs.mkdirSync(pathMod.dirname(dst), { recursive: true });
    fs.copyFileSync(srcAbs, dst);
    return { ok: true, rel: rel, reason: '' };
  } catch (e) {
    return { ok: false, rel: '', reason: fsErrorText(e, tr('ui.272')) };
  }
}
function copyDirAcross(srcAbs, dstRoot, dstRel) {
  const rel = uniqueRelIn(dstRoot, dstRel);
  const dst = pathMod.join(dstRoot, rel);
  try {
    fs.mkdirSync(dst, { recursive: true });
    const walk = (from, to) => {
      for (const en of fs.readdirSync(from, { withFileTypes: true })) {
        if (isIgnoredEntry(en.name)) continue;
        const sf = pathMod.join(from, en.name);
        const df = pathMod.join(to, en.name);
        if (en.isDirectory()) {
          fs.mkdirSync(df, { recursive: true });
          walk(sf, df);
        } else {
          fs.copyFileSync(sf, df);
        }
      }
    };
    walk(srcAbs, dst);
    return { ok: true, rel: rel, reason: '' };
  } catch (e) {
    return { ok: false, rel: '', reason: fsErrorText(e, tr('ui.272')) };
  }
}
