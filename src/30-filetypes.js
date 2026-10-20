/* -------------------------------------------------------------------------
 *  文件类型识别与系统打开（纯函数）
 *  （本片段由 build.js 拼进 main.js，不要单独 require）
 * ------------------------------------------------------------------------- */
/* --------------------------------------------------------- 文件类型识别
 * 预览策略按类型分流：
 *   markdown → 渲染正文
 *   image / audio / video / pdf → 面板内嵌（原生资源协议或 data URL）
 *   text（代码 / 配置 / json / csv…）→ 只读文本
 *   其余 → 「文件信息卡」+ 用外部程序打开 / 打开所在目录
 */
const EXT_IMAGE = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif', 'ico', 'tif', 'tiff']);
const EXT_AUDIO = new Set(['mp3', 'wav', 'm4a', 'flac', 'ogg', 'aac', 'wma', 'opus']);
const EXT_VIDEO = new Set(['mp4', 'webm', 'mov', 'mkv', 'avi', 'm4v', 'ogv']);
const EXT_TEXT = new Set([
  'txt', 'text', 'log', 'json', 'jsonl', 'csv', 'tsv', 'xml', 'yml', 'yaml', 'toml', 'ini', 'conf',
  'env', 'properties', 'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'vue', 'svelte', 'py', 'rb', 'go',
  'rs', 'java', 'kt', 'c', 'h', 'cc', 'cpp', 'hpp', 'cs', 'php', 'swift', 'lua', 'r', 'sql',
  'sh', 'bash', 'zsh', 'bat', 'cmd', 'ps1', 'html', 'htm', 'css', 'scss', 'sass', 'less'
]);
const MIME = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  svg: 'image/svg+xml', bmp: 'image/bmp', avif: 'image/avif', ico: 'image/x-icon', tif: 'image/tiff', tiff: 'image/tiff',
  mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', flac: 'audio/flac', ogg: 'audio/ogg', aac: 'audio/aac',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mkv: 'video/x-matroska',
  pdf: 'application/pdf'
};
const EXT_ICON = {
  pdf: '📕', doc: '📘', docx: '📘', xls: '📗', xlsx: '📗', csv: '📗', ppt: '📙', pptx: '📙',
  zip: '🗜', rar: '🗜', '7z': '🗜', gz: '🗜', tar: '🗜',
  exe: '⚙', msi: '⚙', dmg: '💿', iso: '💿',
  psd: '🎨', ai: '🎨', sketch: '🎨', xmind: '🗺', mindmap: '🗺', canvas: '🗺'
};
const MAX_INLINE = 24 * 1024 * 1024; // 读成 data URL 的上限
const MAX_THUMB = 1.5 * 1024 * 1024;  // 网格缩略图上限
const MAX_TEXT = 256 * 1024;          // 文本预览截断

function extOf(ext) { return String(ext || '').replace(/^\./, '').toLowerCase(); }

function fileKind(ext) {
  const e = extOf(ext);
  if (e === 'md' || e === 'markdown') return 'markdown';
  if (EXT_IMAGE.has(e)) return 'image';
  if (EXT_AUDIO.has(e)) return 'audio';
  if (EXT_VIDEO.has(e)) return 'video';
  if (e === 'pdf') return 'pdf';
  if (EXT_TEXT.has(e)) return 'text';
  return 'other';
}
function kindLabel(kind) {
  return ({
    markdown: tr('ui.279'), image: tr('ft.image'), audio: tr('ft.audio'), video: tr('ft.video'),
    pdf: tr('ft.pdf'), text: tr('ft.text'), other: tr('ui.95')
  })[kind] || tr('ui.95');
}
function iconFor(ext, kind) {
  const k = kind || fileKind(ext);
  if (k === 'markdown') return '📝';
  if (k === 'image') return '🖼';
  if (k === 'audio') return '🎵';
  if (k === 'video') return '🎬';
  if (k === 'text') return '📃';
  return EXT_ICON[extOf(ext)] || '📄';
}
/* 展示用文件名：md 去掉后缀（类型用图标表达），其余保留原样 */
function dispName(n) {
  return fileKind(n.ext) === 'markdown' ? String(n.name).replace(/\.md$/i, '') : n.name;
}
/* 能不能交给 Obsidian 原生视图铺满打开（否则会弹「不支持的文件类型」） */
function canOpenNative(note) {
  if (!note || note.external || !note.file) return false;
  const k = fileKind(note.ext);
  if (k === 'markdown' || k === 'image' || k === 'pdf' || k === 'audio' || k === 'video') return true;
  return extOf(note.ext) === 'canvas';
}
function fmtDateTime(ms) {
  if (!ms) return '—';
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate() + ' ' +
    p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
}

/* 交给系统默认程序 / 在资源管理器中定位（Electron 桌面端） */
function shellOpenPath(abs) {
  if (!abs) { new Notice(tr('misc.noDiskPath')); return false; }
  try {
    const { shell } = require('electron');
    shell.openPath(abs);
    return true;
  } catch (e) {
    new Notice(tr('misc.shellOpenFail', { err: (e && e.message ? e.message : e) }));
    return false;
  }
}
function shellReveal(abs) {
  if (!abs) { new Notice(tr('misc.noDiskPath')); return false; }
  try {
    const { shell } = require('electron');
    shell.showItemInFolder(abs);
    return true;
  } catch (e) {
    new Notice(tr('misc.revealFail', { err: (e && e.message ? e.message : e) }));
    return false;
  }
}
/* 单选组：把同级里其它项的 is-on 清掉 */
function markOn(el) {
  const p = el.parentElement;
  if (p) {
    for (const c of Array.prototype.slice.call(p.children)) c.classList.remove('is-on');
  }
  el.classList.add('is-on');
}
/* 只接受字符串，避免把 null/undefined 拼进样式 */
function asStr(v, fallback) {
  return typeof v === 'string' && v ? v : (fallback || '');
}
