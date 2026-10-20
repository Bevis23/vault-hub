/* -------------------------------------------------------------------------
 *  跨库全文搜索：索引与检索（纯函数，只依赖 fs / path）
 *  （本片段由 build.js 拼进 main.js，不要单独 require）
 *  -------------------------------------------------------------------------
 *  设计要点
 *   1. 索引落盘在 workbenchHome()/index/ ，重启不重扫（(mtime,size) 指纹增量）
 *   2. 索引里存的是「去 Markdown 语法后的纯文本」，且每篇截断到 3000 字 ——
 *      既够拼出命中片段，又不会让索引文件涨到几百 MB
 *   3. 检索是**大小写不敏感的子串匹配**，中文不分词（先做对，再谈快）
 * ------------------------------------------------------------------------- */
const SEARCH_EXT = new Set(['.md', '.markdown', '.txt']);
const SEARCH_MAX_TEXT = 3000;      // 每篇最多存多少纯文本
const SEARCH_INDEX_VERSION = 1;

function searchIndexDir() {
  return pathMod.join(workbenchHome(), 'index');
}
/* 索引用库路径的哈希命名：Windows 路径里的 `:` `\` 不能做文件名，中文也可能出问题 */
function hashOf(s) {
  let h = 0;
  const str = String(s || '');
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}
function searchIndexPath(rootPath) {
  return pathMod.join(searchIndexDir(), 'idx-' + hashOf(String(rootPath || '').toLowerCase()) + '.json');
}
function isSearchable(ext) {
  return SEARCH_EXT.has(String(ext || '').toLowerCase());
}

/* --------------------------------------------------- Markdown → 纯文本 */
/* 目标：抽掉「写法」，留下「内容」——
 * 标题井号、引用箭头、列表符号、加粗星号、链接的 URL 这些都不该进索引，
 * 否则搜 "http" 会命中每一篇，搜 "#" 会命中所有标题。 */
/* 卡片内容摘要：去 frontmatter 和 Markdown 语法，压成一行纯文本后截断 */
function excerptOf(src, len) {
  const plain = mdToPlainText(src).replace(/\s+/g, ' ').trim();
  const n = len || 120;
  return plain.length > n ? plain.slice(0, n) + '…' : plain;
}
function mdToPlainText(src) {
  let t = String(src || '');
  t = t.replace(/^﻿/, '');                                  // BOM
  t = t.replace(/^---\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)\r?\n?/, ''); // frontmatter
  t = t.replace(/```[\s\S]*?(?:```|$)/g, ' ');              // 代码块
  t = t.replace(/^ {4,}[^\n]*/gm, ' ');                     // 缩进代码块
  t = t.replace(/`([^`\n]*)`/g, '$1');                      // 行内代码留内容
  t = t.replace(/!\[\[[^\]]*\]\]/g, ' ');                   // 嵌入
  t = t.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2');      // [[路径|别名]] → 别名
  t = t.replace(/\[\[([^\]]+)\]\]/g, '$1');                 // [[路径]] → 路径
  t = t.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');           // 图片留 alt
  t = t.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');            // 链接留文字、丢 URL
  t = t.replace(/<[^>\n]+>/g, ' ');                         // HTML 标签
  t = t.replace(/^\s{0,3}#{1,6}\s+/gm, '');                 // 标题符号
  t = t.replace(/^\s{0,3}>\s?/gm, '');                      // 引用
  t = t.replace(/^\s{0,3}[-*+]\s+/gm, '');                  // 列表符号
  t = t.replace(/^\s{0,3}\d+\.\s+/gm, '');                  // 有序列表
  t = t.replace(/\*\*([^*]+)\*\*/g, '$1');                  // 加粗
  t = t.replace(/__([^_]+)__/g, '$1');
  t = t.replace(/([*_])([^*_\n]+)\1/g, '$2');               // 斜体
  t = t.replace(/~~([^~]+)~~/g, '$1');                      // 删除线
  t = t.replace(/==([^=]+)==/g, '$1');                      // 高亮
  t = t.replace(/^\s*\|.*\|\s*$/gm, (m) => m.replace(/\|/g, ' ')); // 表格竖线
  t = t.replace(/^\s*[-=:|\s]{3,}$/gm, ' ');                // 分隔线 / 表头分隔
  t = t.replace(/%%[\s\S]*?%%/g, ' ');                      // 评论
  t = t.replace(/[ \t]+/g, ' ');
  t = t.replace(/\n{2,}/g, '\n');
  t = t.trim();
  return t.slice(0, SEARCH_MAX_TEXT);
}

/* ------------------------------------------------------------- 索引 IO */
function loadSearchIndex(rootPath) {
  const p = searchIndexPath(rootPath);
  const idx = readJsonFile(p, null);
  if (!idx || idx.version !== SEARCH_INDEX_VERSION || !idx.entries) return null;
  return idx;
}
function saveSearchIndex(rootPath, idx) {
  const w = writeJsonFile(searchIndexPath(rootPath), idx);
  if (!w.ok) console.error('[vault-hub] failed writing search index', w.err);
  return w.ok;
}
function newSearchIndex(rootPath) {
  return { version: SEARCH_INDEX_VERSION, root: String(rootPath || ''), builtAt: 0, entries: {} };
}

/* 增量刷新：(mtime, size) 没变就不重读文件 —— 这是「二次启动 < 0.5 秒」的关键。
 * files 来自 scanExternalVault / buildCurrentIndex，需要 absPath / relPath / mtime / size / ext。
 * 返回 { idx, rebuilt, read } */
function refreshSearchIndex(rootPath, files) {
  let idx = loadSearchIndex(rootPath);
  if (!idx) idx = newSearchIndex(rootPath);
  const seen = {};
  let read = 0;
  for (const f of files || []) {
    if (!isSearchable(f.ext)) continue;
    seen[f.relPath] = 1;
    const old = idx.entries[f.relPath];
    if (old && old.mtime === f.mtime && old.size === f.size) continue;
    let raw = '';
    try { raw = fs.readFileSync(f.absPath, 'utf8'); } catch (e) { continue; }
    idx.entries[f.relPath] = { mtime: f.mtime, size: f.size, text: mdToPlainText(raw) };
    read++;
  }
  // 清掉已经不在库里的条目
  let dropped = 0;
  for (const k of Object.keys(idx.entries)) {
    if (!seen[k]) { delete idx.entries[k]; dropped++; }
  }
  if (read || dropped || !idx.builtAt) {
    idx.builtAt = Date.now();
    saveSearchIndex(rootPath, idx);
  }
  return { idx: idx, read: read, dropped: dropped };
}

/* ------------------------------------------------------------- 检索 */
function searchTermsOf(query) {
  return String(query || '').toLowerCase().split(/\s+/).filter((s) => s.length > 0);
}
/* 空格分开的词按 AND 处理（每个词都要出现） */
function matchText(text, terms) {
  const t = String(text || '').toLowerCase();
  let first = -1;
  for (const term of terms) {
    const p = t.indexOf(term);
    if (p < 0) return -1;
    if (first < 0 || p < first) first = p;
  }
  return first < 0 ? 0 : first;
}
/* 命中片段：前后各留一点上下文，看得出来是不是自己要找的那篇 */
function snippetOf(text, term, pad) {
  const t = String(text || '');
  const p = t.toLowerCase().indexOf(String(term || '').toLowerCase());
  const w = pad || 40;
  if (p < 0) return t.slice(0, w * 2);
  const from = Math.max(0, p - w);
  const to = Math.min(t.length, p + String(term || '').length + w);
  return (from > 0 ? '…' : '') +
    t.slice(from, to).replace(/\s*\n\s*/g, ' ') +
    (to < t.length ? '…' : '');
}
/* 在一个库的索引里搜。返回 [{ relPath, snippet, at }] */
function searchIndex(idx, terms, limit, pad) {
  const out = [];
  if (!idx || !idx.entries || !terms.length) return out;
  const cap = limit || 200;
  for (const rel of Object.keys(idx.entries)) {
    const e = idx.entries[rel];
    const at = matchText(e.text, terms);
    if (at < 0) continue;
    out.push({ relPath: rel, snippet: snippetOf(e.text, terms[0], pad), at: at });
    if (out.length >= cap) break;
  }
  out.sort((a, b) => a.at - b.at);
  return out;
}
