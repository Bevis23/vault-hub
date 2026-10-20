/* -------------------------------------------------------------------------
 *  通用小工具（纯函数，无副作用）
 *  （本片段由 build.js 拼进 main.js，不要单独 require）
 * ------------------------------------------------------------------------- */
/* ------------------------------------------------------------------ utils */
function fmtSize(b) {
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1024 / 1024).toFixed(1) + ' MB';
}
function fmtDate(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
function debounce(fn, wait) {
  let t = null;
  return function () {
    const args = arguments;
    if (t) clearTimeout(t);
    t = setTimeout(() => { t = null; fn.apply(null, args); }, wait);
  };
}
function baseNameOf(p) {
  const parts = p.replace(/\\/g, '/').split('/');
  return parts.pop() || '';
}
function parentOf(p) {
  const parts = p.split('/');
  parts.pop();
  return parts.join('/');
}
/* 文件夹路径统一化：**库根一律是空字符串**。
 * Obsidian 里库根的 TFolder.path 是 '/'，根目录下的文件 parent.path 也是 '/'
 * —— 直接拿去按 '/' 切段会切出一个「没有名字的文件夹」（见 v0.9.2 的踩坑）。 */
function normFolder(p) {
  const s = String(p == null ? '' : p).replace(/\\/g, '/');
  if (!s || s === '/') return '';
  return s.replace(/^\/+/, '').replace(/\/+$/, '');
}
/* 文件夹「N 篇」的展示文案：空文件夹要说清楚是空的，别写「0 篇」让人以为坏了 */
function folderMeta(f, sel) {
  const base = (f && f.count) ? f.count + tr('ui.133') : tr('ui.132');
  return base + (sel ? tr('ui.134') : '');
}
function humanSizeCount(files) {
  return files.reduce((s, f) => s + (f.size || 0), 0);
}
/* 副本的相对路径：原名后面加 " 1"（Obsidian 习惯），n 可递增避免重名 */
function dupRel(rel, n) {
  const idx = String(rel || '').lastIndexOf('/');
  const dir = idx >= 0 ? rel.slice(0, idx + 1) : '';
  const name = idx >= 0 ? rel.slice(idx + 1) : rel;
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  return dir + stem + ' ' + (n || 1) + ext;
}
/* 解析标签输入：逗号 / 空格 / 中文分隔符都行，去掉 # 前缀，去重 */
function parseTags(text) {
  const out = [];
  const seen = new Set();
  for (const part of String(text || '').split(/[,，、;；\s]+/)) {
    const s = String(part || '').trim().replace(/^#+/, '');
    if (s && !seen.has(s)) { seen.add(s); out.push(s); }
  }
  return out;
}
/* YAML 标签值：含特殊字符或空格时加双引号 */
function yamlTag(t) {
  const s = String(t || '');
  return (/[:#\[\]{},&*?]|^[-!%@`]/.test(s) || /\s/.test(s)) ? '"' + s.replace(/"/g, '\\"') + '"' : s;
}
function mergeTags(cur, want) {
  const out = [];
  const seen = new Set();
  for (const t of [].concat(cur || [], want || [])) {
    const s = String(t || '').trim();
    if (s && !seen.has(s)) { seen.add(s); out.push(s); }
  }
  return out;
}
/* 把 tags 合并进 Markdown 的 frontmatter（没有就建一个），不覆盖已有标签。
 * 兼容两种写法：tags: [a, b]（行内数组）和 tags: 后跟 - 列表（块式）。
 * 返回新内容；没有有效标签时返回 null。 */
function addTagsToContent(content, tags) {
  const want = mergeTags([], tags);
  if (!want.length) return null;
  const text = String(content == null ? '' : content);
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/);
  if (!m) {
    const fm = '---\ntags:\n' + want.map((t) => '  - ' + yamlTag(t)).join('\n') + '\n---\n\n';
    return fm + text;
  }
  const lines = m[1].split(/\r?\n/);
  const body = text.slice(m[0].length);
  const tagIdx = lines.findIndex((l) => /^\s*tags\s*:/.test(l));
  if (tagIdx < 0) {
    lines.push('tags:');
    for (const t of want) lines.push('  - ' + yamlTag(t));
    return '---\n' + lines.join('\n') + '\n---' + body;
  }
  const head = lines[tagIdx];
  const inline = head.match(/^(.*?:)\s*\[(.*)\]\s*$/);
  if (inline) {
    const cur = inline[2].split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    const merged = mergeTags(cur, want);
    lines[tagIdx] = inline[1] + ' [' + merged.map(yamlTag).join(', ') + ']';
    return '---\n' + lines.join('\n') + '\n---' + body;
  }
  // 块式列表（或空值）：收集它后面的 - 行，合并重写
  let end = tagIdx + 1;
  const items = [];
  while (end < lines.length && /^\s*-\s+/.test(lines[end])) {
    items.push(lines[end].replace(/^\s*-\s+/, '').trim().replace(/^["']|["']$/g, ''));
    end++;
  }
  const merged = mergeTags(items, want);
  const block = [head].concat(merged.map((t) => '  - ' + yamlTag(t)));
  lines.splice(tagIdx, end - tagIdx, ...block);
  return '---\n' + lines.join('\n') + '\n---' + body;
}
