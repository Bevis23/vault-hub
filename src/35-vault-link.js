/* -------------------------------------------------------------------------
 *  跨机器可移植 + 库切换（纯函数：只用 fs / path，不碰 DOM 与 Obsidian 对象）
 *  （本片段由 build.js 拼进 main.js，不要单独 require）
 * ------------------------------------------------------------------------- */
/* ------------------------------------------------------------ 平台目录 */
/* Obsidian 的全局配置目录三个系统都不一样：
 *   Windows → %APPDATA%/obsidian
 *   macOS   → ~/Library/Application Support/obsidian
 *   Linux   → ~/.config/obsidian
 * 以前写死 APPDATA，mac / Linux 用户读不到 obsidian.json，
 * 库导航里就只剩当前库 —— 可移植性的第一件事就是这里。 */
function appDataDir() {
  if (process.platform === 'darwin') return pathMod.join(os.homedir(), 'Library', 'Application Support');
  if (process.platform === 'win32') {
    return process.env.APPDATA || pathMod.join(os.homedir(), 'AppData', 'Roaming');
  }
  return process.env.XDG_CONFIG_HOME || pathMod.join(os.homedir(), '.config');
}
function obsidianConfigPath() {
  return pathMod.join(appDataDir(), 'obsidian', 'obsidian.json');
}
/* 工作台自己的全局目录：放「跨库共享的库清单」，
 * 这样在 A 库里登记过的库，切到 B 库也还在导航里（库清单不再跟着库各自一份）。 */
function workbenchHome() {
  return pathMod.join(appDataDir(), 'vault-hub');
}
function sharedVaultsPath() {
  return pathMod.join(workbenchHome(), 'vaults.json');
}

/* ------------------------------------------------------------- JSON IO */
function readJsonFile(p, fallback) {
  try {
    if (!fs.existsSync(p)) return fallback;
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    return (raw && typeof raw === 'object') ? raw : fallback;
  } catch (e) {
    return fallback;
  }
}
/* 原子写：先写 .tmp 再改名，写一半崩掉不会留半个坏文件。
 * 返回 { ok, err } —— 别的地方好判断要不要提示用户。 */
function writeJsonFile(p, obj) {
  try {
    const dir = pathMod.dirname(p);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmp = p + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8');
    fs.renameSync(tmp, p);
    return { ok: true, err: null };
  } catch (e) {
    return { ok: false, err: e };
  }
}

/* 机器不同，磁盘错误也不同：权限 / 只读盘 / 网盘占用要分开说，
 * 不然别人电脑上只看到一句 "EACCES: permission denied"，根本不知道该怎么办。 */
function fsErrorText(e, what) {
  const code = (e && e.code) || '';
  if (code === 'EACCES' || code === 'EPERM') {
    return what + tr('ui.247');
  }
  if (code === 'EROFS') return what + tr('ui.248');
  if (code === 'ENOENT') return what + tr('ui.249');
  if (code === 'ENOSPC') return what + tr('ui.250');
  if (code === 'EBUSY') return what + tr('ui.251');
  if (code === 'EISDIR') return what + tr('ui.252');
  if (code === 'EXDEV') return what + tr('ui.253');
  // 认不出的错误：有 message 说 message，没有就把错误码带上（总比 [object Object] 强）
  const msg = (e && e.message) ? e.message : (code || String(e));
  return what + '：' + msg;
}

/* --------------------------------------------------------------- 版本号 */
function parseVer(v) {
  const seg = String(v || '').split(/[.\-+]/);
  const out = [];
  for (const s of seg) {
    const n = parseInt(s, 10);
    out.push(isNaN(n) ? 0 : n);
  }
  while (out.length < 3) out.push(0);
  return out.slice(0, 4);
}
/* 1 → a 比 b 新，0 → 同版本，-1 → a 更老。0.10.0 > 0.9.2 这种也吃得准 */
function cmpVer(a, b) {
  const x = parseVer(a);
  const y = parseVer(b);
  for (let i = 0; i < 3; i++) {
    if (x[i] > y[i]) return 1;
    if (x[i] < y[i]) return -1;
  }
  return 0;
}

/* ------------------------------------------------------- 切库的链接 */
/* 用 path（分隔符统一成 /，逐段编码，中文和空格都安全），不用 vault=库名：
 *   1. 同名文件夹在两个盘符下很常见，?vault=名字 会跳错库；
 *   2. 名字对不上时 Obsidian 会在默认位置「新建」一个空库 —— 那才是真事故。
 * 逐段编码而不是整体 encodeURIComponent，是为了让 / 保持可读（Obsidian 认得出）。 */
function vaultOpenUri(vaultPath) {
  const p = String(vaultPath || '').replace(/\\/g, '/').replace(/\/+$/, '');
  if (!p) return '';
  const enc = p.split('/').map((s) => encodeURIComponent(s)).join('/');
  return 'obsidian://open?path=' + enc;
}
/* 优先用 Electron 的 shell（不会在 Obsidian 里留下空白窗口），
 * 拿不到就回落 window.open。 */
function openExternalUri(uri) {
  if (!uri) return false;
  try {
    const electron = require('electron');
    if (electron && electron.shell && typeof electron.shell.openExternal === 'function') {
      electron.shell.openExternal(uri);
      return true;
    }
  } catch (e) { /* 插件环境里拿不到 electron 就走下面的兜底 */ }
  try {
    if (typeof window !== 'undefined' && typeof window.open === 'function') {
      window.open(uri);
      return true;
    }
  } catch (e) { /* ignore */ }
  return false;
}

/* --------------------------------------------------------- 库的身份判断 */
function looksLikeVault(p) {
  const s = String(p || '');
  // 空路径别去查 —— path.join('', '.obsidian') 会变成相对路径，查到的是别的地方
  if (!s) return false;
  try { return fs.existsSync(pathMod.join(s, '.obsidian')); } catch (e) { return false; }
}
/* 云同步目录：不禁用，但写之前提醒一声 —— 同步盘上的库被别的设备改着，
 * 两边同时写会吵架。只是提示，不拦用户。 */
const CLOUD_MARKS = [
  'dropbox', 'icloud', 'onedrive', tr('ui.254'), 'nutstore',
  'google drive', 'mega', 'pcloud', 'syncthing', 'box sync',
  tr('ui.255'), 'verysync', 'seafile', 'jianguoyun'
];
function isCloudSyncedPath(p) {
  const s = String(p || '').toLowerCase();
  if (!s) return false;
  for (const m of CLOUD_MARKS) {
    if (s.indexOf(m) >= 0) return true;
  }
  return false;
}

/* ------------------------------------------------------------ 自部署 */
/* 把「本插件自己」装进另一个库 —— 切过去之后那个库也有工作台。
 * 纯函数：源文件目录 / 目标库根 / 插件 id 都由调用方给，这里只做文件操作。
 * 返回 { ok, changed, reason, from, to }
 *   changed=false 且 ok=true → 目标已经是同版本或更新，什么都不用做 */
function deployWorkbenchToVault(opts) {
  const o = opts || {};
  const pluginId = o.pluginId;
  const srcDir = o.srcDir;
  const vaultPath = String(o.vaultPath || '').replace(/\\/g, '/').replace(/\/+$/, '');
  const res = { ok: false, changed: false, reason: '', from: '', to: '' };
  if (!pluginId || !srcDir || !vaultPath) {
    res.reason = tr('ui.256');
    return res;
  }
  /* 目标必须已经是 Obsidian 库：否则我们会在一个普通文件夹里凭空造出 .obsidian，
   * 再让 obsidian://open 把它变成一个新库 —— 那是真的事故，不是便利。 */
  if (!looksLikeVault(vaultPath)) {
    res.reason = tr('ui.257') +
      tr('ui.258');
    return res;
  }
  let srcVer = '';
  try {
    srcVer = (readJsonFile(pathMod.join(srcDir, 'manifest.json'), {})).version || '';
  } catch (e) {
    res.reason = fsErrorText(e, tr('ui.259'));
    return res;
  }
  if (!srcVer) { res.reason = tr('ui.260'); return res; }

  const dstDir = pathMod.join(vaultPath, '.obsidian', 'plugins', pluginId);
  const dstVer = workbenchVersionIn(vaultPath, pluginId);
  res.from = dstVer;
  res.to = srcVer;
  if (dstVer && cmpVer(dstVer, srcVer) >= 0) {
    // 那边已经是同版本或更新 → 别动它，免得把用户的新版覆盖成旧版
    res.ok = true;
    res.changed = false;
    return res;
  }

  try {
    if (!fs.existsSync(dstDir)) fs.mkdirSync(dstDir, { recursive: true });
    for (const f of ['main.js', 'manifest.json', 'styles.css']) {
      const src = pathMod.join(srcDir, f);
      if (!fs.existsSync(src)) continue;
      fs.copyFileSync(src, pathMod.join(dstDir, f));
    }
    // 第一次装才把设置带过去：库导航、外观、打开方式与这边一致；
    // 已经在用的库保持它自己的设置，不覆盖。
    const dstData = pathMod.join(dstDir, 'data.json');
    if (!fs.existsSync(dstData) && o.settings) writeJsonFile(dstData, o.settings);
    const en = enablePluginInVault(vaultPath, pluginId);
    if (en && !en.ok && en.err) {
      res.reason = fsErrorText(en.err, tr('notice.pluginListWrite', { path: vaultPath }));
      return res;
    }
    res.ok = true;
    res.changed = true;
  } catch (e) {
    res.reason = fsErrorText(e, tr('notice.deployWrite', { path: vaultPath }));
  }
  return res;
}

/* 把插件 id 写进目标库的 community-plugins.json（Obsidian 把它当作「已启用」清单）。
 * 新版本 Obsidian 写的是数组，老版本是对象 —— 两种都认。 */
function enablePluginInVault(vaultPath, pluginId) {
  const p = pathMod.join(vaultPath, '.obsidian', 'community-plugins.json');
  let cur = null;
  try {
    if (fs.existsSync(p)) {
      try { cur = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { cur = null; }
    }
  } catch (e) { cur = null; }
  let next = null;
  if (Array.isArray(cur)) {
    if (cur.indexOf(pluginId) >= 0) return { ok: true, err: null, changed: false };
    next = cur.concat([pluginId]);
  } else if (cur && typeof cur === 'object') {
    if (cur[pluginId]) return { ok: true, err: null, changed: false };
    next = Object.assign({}, cur);
    next[pluginId] = true;
  } else {
    next = [pluginId];
  }
  const w = writeJsonFile(p, next);
  return { ok: w.ok, err: w.err, changed: w.ok };
}

/* 目标库里装的工作台版本（没装 → 空串） */
function workbenchVersionIn(vaultPath, pluginId) {
  try {
    const p = pathMod.join(vaultPath, '.obsidian', 'plugins', pluginId, 'manifest.json');
    if (!fs.existsSync(p)) return '';
    return (readJsonFile(p, {})).version || '';
  } catch (e) {
    return '';
  }
}
