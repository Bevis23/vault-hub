/* Vault Workbench 冒烟测试
   在极简 DOM 替身里跑真实插件代码：布局 / 钻取回退 / 搜索清除 / 预览开关 / 外观抽屉
   用法： node .smoke/smoke.js
*/
'use strict';

const path = require('path');
const Module = require('module');

/* ---- require('obsidian') -> 替身 ---- */
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === 'obsidian') return path.join(__dirname, 'obsidian-stub.js');
  return origResolve.call(this, request, ...rest);
};

/* ---- 全局 DOM ---- */
const { El, documentShim, fire, selectAll } = require('./dom-shim.js');
/* Obsidian 替身：直接按路径 require，和 main.js 里 require('obsidian') 拿到的是同一个实例，
 * 这样替身里收集的 notices 在测试里也读得到。 */
const stubMod = require('./obsidian-stub.js');
global.document = documentShim;
global.HTMLElement = El;
global.Node = El;
global.FileReader = function () { this.readAsDataURL = () => {}; };
Object.defineProperty(global, 'navigator', {
  value: { clipboard: { writeText() {} } },
  configurable: true
});

/* ---- window.getSelection 替身：单画布/阅读态的「拖选 → 复制」靠它 ----
 * Node 里没法真的拖鼠标，就给一个可编程的选区对象；
 * 断言的重点是「选了正文之后点击不该掉进编辑态」「右键能复制走选区」。 */
const domSel = {
  isCollapsed: true,
  _t: '',
  toString() { return this._t; },
  selectAllChildren() { this.isCollapsed = false; },
  collapse() { this.isCollapsed = true; this._t = ''; }
};
global.window = { getSelection: () => domSel };
global.getSelection = global.window.getSelection;
const setSel = (t) => { domSel._t = String(t || ''); domSel.isCollapsed = !domSel._t; };

/* ---- 被测代码 ---- */
const mod = require('../main.js');
const { WorkbenchView, WorkbenchSettingTab } = mod;

/* ---- App 替身 ---- */
const VAULT = 'D:/fake/MyVault';
const mkFile = (p, extra) => {
  const parts = p.split('/');
  const name = parts.pop();
  const ext = name.indexOf('.') >= 0 ? '.' + name.split('.').pop() : '';
  // 库根在 Obsidian 里是 '/'（不是 ''）—— 这里必须照实模拟，
  // 否则「根目录下的文件被算进一个没有名字的文件夹」这个坑测不出来。
  const parentPath = parts.length ? parts.join('/') : '/';
  return {
    id: p,
    path: p,
    name,
    ext,
    file: { path: p, name },
    relPath: p,
    absPath: VAULT + '/' + p,
    folder: parts.join('/'),
    parent: { path: parentPath },
    extension: ext.replace('.', ''),
    external: false,
    tags: (extra && extra.tags) || [],
    stat: {
      size: (extra && extra.size) || 4096,
      mtime: (extra && extra.mtime) || Date.now(),
      ctime: Date.now()
    },
    __tags: (extra && extra.tags) || null
  };
};
const FILES = [
  mkFile('五步学习闭环.md', { tags: ['#学习方法'], mtime: Date.now() - 1000 }),
  mkFile('01-学习/1.1-学习方法论/五步学习闭环 【管理-方法】.md', { tags: ['#学习方法'] }),
  mkFile('01-学习/1.1-学习方法论/费曼检验.md'),
  mkFile('01-学习/1.2-工具链/Excalidraw 上手.md', { tags: ['#工具'] }),
  mkFile('02-工作/周报模板.md'),
  mkFile('90-专题研究/综述笔记.md'),
  mkFile('assets/图.png', { size: 200000 })
];
/* 一个笔记都没有的文件夹：Obsidian 里看得到、光靠文件清单却推不出来 */
const EMPTY_FOLDERS = ['00-收集箱', '01-学习/1.3-空目录'];
/* 按 Obsidian 的形状造目录树：TFolder 有 children，TFile 没有 */
function buildVaultTree() {
  const root = { path: '/', name: '', children: [] };
  const ensure = (dir) => {
    let cur = root;
    let acc = '';
    for (const seg of String(dir || '').split('/').filter(Boolean)) {
      acc = acc ? acc + '/' + seg : seg;
      let nxt = cur.children.filter((c) => c.children && c.path === acc)[0];
      if (!nxt) { nxt = { path: acc, name: seg, children: [] }; cur.children.push(nxt); }
      cur = nxt;
    }
    return cur;
  };
  for (const d of EMPTY_FOLDERS) ensure(d);
  for (const f of FILES) ensure(f.folder).children.push({ path: f.path, name: f.name });
  return root;
}
const app = {
  vault: {
    adapter: {
      getBasePath: () => VAULT,
      getResourcePath: (relPath) => 'app://stub/' + encodeURIComponent(relPath)
    },
    getFiles: () => FILES,
    // 目录树：空文件夹只有从这里才看得到（getFiles() 里没有它们）
    getRoot: () => buildVaultTree(),
    on: () => ({ id: 'e' }),
    // 默认都查不到（createNote 的「不重名」循环靠这个退出）；测试里按需塞 app.__abs
    getAbstractFileByPath: (p) => (app.__abs && app.__abs[p]) ||
      ((app.__createdSet || {})[p]) || null,
    create: async (p) => {
      app.__created = p;
      app.__createdSet = Object.assign(app.__createdSet || {}, { [p]: true });
      return {
        path: p,
        name: String(p).split('/').pop(),
        extension: String(p).split('.').pop(),
        parent: { path: String(p).split('/').slice(0, -1).join('/') }
      };
    },
    // 新建文件夹：顺带让它进目录树，这样「建完立刻可见」能端到端测出来
    createFolder: async (p) => {
      app.__createdFolder = p;
      EMPTY_FOLDERS.push(p);
      return { path: p, name: String(p).split('/').pop(), children: [] };
    },
    read: async () => '# 测试标题\n\n正文内容'
  },
  fileManager: {
    promptForFileRename: async (f) => { app.__renamed = f && f.path; },
    trashFile: async (f) => { app.__trashed = f && f.path; },
    renameFile: async (f, dest) => {
      app.__movedAll = (app.__movedAll || []).concat([[f && f.path, dest]]);
      app.__moved = [f && f.path, dest];
    }
  },
  metadataCache: {
    getFileCache: (f) => (f.__tags ? { tags: f.__tags.map((t) => ({ tag: t })), frontmatter: null } : null),
    on: () => ({ id: 'e' })
  },
  workspace: {
    getLeavesOfType: () => [],
    getLeaf: () => ({ openFile: async (f) => { app.__openedNative = f && f.path; } }),
    onLayoutReady: (cb) => cb && cb(),
    revealLeaf: () => {}
  },
  setting: { open() {}, openTabById() {} }
};

const fails = [];
function ok(cond, msg) {
  if (cond) console.log('  PASS  ' + msg);
  else { fails.push(msg); console.log('  FAIL  ' + msg); }
}
const click = (el) => fire(el, 'click');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const find = (root, sel, text) =>
  selectAll(root, sel).find((e) => (text === undefined ? true : e.textContent.indexOf(text) >= 0));

(async function run() {
  const plugin = new mod(app, {
    id: 'vault-hub',
    name: 'Vault Workbench 库管理工作台',
    version: '0.10.0',
    dir: '.obsidian/plugins/vault-hub'
  });
  await plugin.loadSettings();
  plugin.externalCache = {};
  plugin.wallpaperCache = { key: '', url: '' };
  plugin.dataUrlCache = {};
  plugin.opLog = [];
  // 隔离：只测一个假库，不读真实磁盘
  plugin.currentVaultPath = () => VAULT;
  plugin.discoverVaults = () => [{ id: VAULT, name: 'MyVault', path: VAULT, current: true, source: 'auto' }];

  const view = new WorkbenchView({}, plugin);
  await view.onOpen();

  console.log('\n[1] 布局结构');
  ok(!!view.contentEl.querySelector('.vwb-rail'), '左侧库导航渲染');
  ok(!!view.contentEl.querySelector('.vwb-content'), '存在内容行 .vwb-content');
  ok(view.prevEl.parentElement === view.contentRowEl, '预览面板挂在内容行里（不再被纵向挤压/溢出）');
  ok(view.prevEl.parentElement !== view.mainEl, '预览面板已脱离 .vwb-main 纵向流');
  ok(view.contentRowEl.parentElement === view.mainEl, '内容行是主区子节点');
  ok(!!view.searchClearEl && !view.searchClearEl.classList.contains('is-on'), '搜索清空按钮默认隐藏');

  console.log('\n[2] 根层列表');
  const cards = view.contentEl.querySelectorAll('.vwb-area .vwb-card');
  ok(cards.length > 0, '根层出现文件夹卡片（' + cards.length + ' 张）');

  console.log('\n[3] 钻取 + 回退（问题 1）');
  const f1 = find(view.contentEl, '.vwb-area .vwb-card', '01-学习');
  ok(!!f1, '找到 01-学习 文件夹卡片');
  click(f1);
  ok(view.folderPath === '01-学习', '点文件夹进入下一层 folderPath=' + view.folderPath);
  ok(!!view.barEl.querySelector('.vwb-crumb-up'), '出现「← 上一级」按钮');
  ok(view.barEl.querySelectorAll('.vwb-crumb-p').length === 2, '面包屑 2 段（库名 / 01-学习）');

  const f2 = find(view.contentEl, '.vwb-area .vwb-card', '1.1');
  click(f2);
  ok(view.folderPath === '01-学习/1.1-学习方法论', '再进一层 folderPath=' + view.folderPath);
  ok(view.barEl.querySelectorAll('.vwb-crumb-p').length === 3, '面包屑 3 段');

  click(view.barEl.querySelectorAll('.vwb-crumb-p')[1]);
  ok(view.folderPath === '01-学习', '点面包屑中间段回退到 ' + view.folderPath);
  click(view.barEl.querySelectorAll('.vwb-crumb-p')[0]);
  ok(view.folderPath === '', '点库名回根层');

  click(find(view.contentEl, '.vwb-area .vwb-card', '01-学习'));
  click(view.barEl.querySelector('.vwb-crumb-up'));
  ok(view.folderPath === '', '「← 上一级」回根层');

  click(find(view.contentEl, '.vwb-area .vwb-card', '01-学习'));
  click(find(view.contentEl, '.vwb-area .vwb-card', '1.1'));
  click(view.barEl.querySelector('.vwb-crumb-up'));
  ok(view.folderPath === '01-学习', '「← 上一级」只退一层（' + view.folderPath + '）');

  console.log('\n[4] 搜索 + 清除（问题 4）');
  click(view.barEl.querySelectorAll('.vwb-crumb-p')[0]);
  view.searchEl.value = '五步';
  fire(view.searchEl, 'input');
  await sleep(320);
  ok(view.query === '五步', '搜索词生效 query=' + view.query);
  ok(view.searchClearEl.classList.contains('is-on'), '输入后出现清空按钮');
  ok(view.contentEl.querySelectorAll('.vwb-area .vwb-card').length >= 2, '搜索命中多条');
  click(view.searchClearEl);
  ok(view.query === '' && view.searchEl.value === '', '点 ✕ 清空搜索词');
  ok(!view.searchClearEl.classList.contains('is-on'), '清空后按钮隐藏');
  view.searchEl.value = '五步';
  fire(view.searchEl, 'input');
  await sleep(320);
  fire(view.searchEl, 'keydown', { key: 'Escape' });
  ok(view.query === '' && view.searchEl.value === '', '搜索框内按 Esc 也能清空');

  console.log('\n[5] 预览开关（问题 2 / 3）');
  const note = mkFile('01-学习/1.1-学习方法论/五步学习闭环.md', { tags: ['#学习方法'] });
  await view.openPreview(note);
  ok(view.prevEl.classList.contains('is-on'), '预览面板打开');
  ok(!!view.prevEl.querySelector('.vwb-prev-close'), '预览头部有 ✕ 关闭按钮');
  ok(view.prevEl.querySelector('.vwb-prev-t').textContent === '五步学习闭环', '标题去掉 .md 后缀');
  ok(view.prevEl.querySelector('.vwb-prev-body').textContent.indexOf('测试标题') >= 0, '正文已渲染');
  ok(view.prevEl.querySelectorAll('.vwb-prev-foot button').length === 5, '底栏：编辑/原生打开/铺满/复制路径/关闭 五按钮');
  ok(view.prevEl.classList.contains('vwb-glass'), '预览仍是玻璃面板');
  click(view.prevEl.querySelector('.vwb-prev-close'));
  ok(!view.prevEl.classList.contains('is-on'), '点 ✕ 关闭预览');
  await view.openPreview(note);
  fire(document, 'keydown', { key: 'Escape' });
  ok(!view.prevEl.classList.contains('is-on'), 'Esc 关闭预览');

  console.log('\n[6] 设置面板（v0.4.0 问题 4：左下「设置」+ 子页）');
  view.toggleDrawer(true);
  ok(view.drawerEl.classList.contains('is-on'), '设置面板打开（不再跳 Obsidian 原生设置）');
  ok(view.drawerEl.textContent.indexOf('设置 · 外观') >= 0, '标题带当前子页名「设置 · 外观」');
  ok(!!view.drawerEl.querySelector('.vwb-drawer-head button'), '有「收起」按钮');
  const navNames = Array.from(view.drawerEl.querySelectorAll('.vwb-drawer-nav-i')).map((n) => n.textContent);
  ok(navNames.join('|') === '外观|编辑器|打开方式|使用说明|库管理|操作日志|回收站|关于', '子页导航齐全：' + navNames.join(' / '));
  ok(!!view.drawerEl.querySelector('.vwb-drawer-wrap .vwb-drawer-body'), '右侧内容区在子页导航旁边');
  const secTitles = Array.from(view.drawerEl.querySelectorAll('.vwb-sec > h5')).map((h) => h.textContent);
  ok(secTitles.join('|') === '风格预设|工作台壁纸|主题色|布局|行为', '外观子页分区齐全：' + secTitles.join(' / '));
  ok(view.drawerEl.querySelectorAll('.vwb-wp').length === 5, '5 套壁纸色块');
  ok(view.drawerEl.querySelectorAll('.vwb-sw').length === 5, '5 个主题色圆点');
  ok(view.drawerEl.querySelectorAll('.vwb-tg').length === 4, '4 个行为开关（含内容摘要）');
  ok(!!view.drawerEl.querySelector('.vwb-drawer-save'), '有「保存并应用」按钮');
  ok(view.railEl.textContent.indexOf('设置') >= 0 && view.railEl.textContent.indexOf('外观设置') < 0,
    '左下入口改名为「设置」（不再是「外观设置」）');

  click(find(view.drawerEl, '.vwb-wp', '竹林'));
  ok(plugin.settings.appearance.wallpaper === 'bamboo', '点壁纸写入设置');
  ok(view.bgEl.style.background.indexOf('2fb87a') >= 0, '背景层同步切换');

  click(view.drawerEl.querySelectorAll('.vwb-sw')[1]);
  ok(plugin.settings.appearance.accent === '#3aa0f0', '主题色写入设置');
  ok(view.contentEl.style.getPropertyValue('--vwb-acc') === '#3aa0f0', 'CSS 变量同步');

  click(find(view.drawerEl, '.vwb-chip', '紧凑'));
  ok(plugin.settings.appearance.density === 'tight', '布局密度写入设置');
  ok(!!view.contentEl.querySelector('.vwb-grid.tight'), '网格套用 tight 密度');

  const dimIn = view.drawerEl.querySelectorAll('.vwb-rowset input[type=range]')[0];
  dimIn.value = '40';
  fire(dimIn, 'input');
  ok(plugin.settings.appearance.dim === 0.4, '暗化滑杆写入设置');
  ok(view.contentEl.style.getPropertyValue('--vwb-dim') === '0.4', '暗化变量实时生效');

  click(find(view.drawerEl, '.vwb-chip', '悬浮'));
  await view.openPreview(note);
  ok(view.prevEl.classList.contains('float'), '预览位置切到「悬浮」');
  ok(view.prevEl.classList.contains('is-on'), '切位置后预览依然打开');

  // 按稳定 testid 取开关（i18n 之后不能再按位置/中文文本定位）
  const tgInput = (id) => view.drawerEl.querySelector('.vwb-tg[data-testid=' + id + '] input[type=checkbox]');
  const cbs0 = tgInput('vh-drawer-tg-stats');
  cbs0.checked = false;
  fire(cbs0, 'change');
  ok(plugin.settings.appearance.showStats === false, '关闭统计卡开关生效');
  ok(view.statsEl.style.display === 'none', '统计卡立即隐藏');

  const cbsPv = tgInput('vh-drawer-tg-pervault');
  cbsPv.checked = true;
  fire(cbsPv, 'change');
  ok(plugin.settings.perVaultAppearance === true, '开启「每个库单独配置外观」');
  ok(!!plugin.settings.vaultAppearance[VAULT], '为该库建立独立外观记录');

  click(view.drawerEl.querySelector('.vwb-drawer-save'));
  ok(!!plugin._data, '保存并应用已写入 data.json');
  ok(!!view.drawerEl.querySelector('.vwb-link'), '抽屉内有通往原生设置页的入口');

  click(view.drawerEl.querySelector('.vwb-drawer-head button'));
  ok(!view.drawerEl.classList.contains('is-on'), '点「收起」关闭抽屉');
  view.toggleDrawer(true);
  fire(document, 'keydown', { key: 'Escape' });
  ok(!view.drawerEl.classList.contains('is-on'), 'Esc 关闭抽屉');

  console.log('\n[7] 切换库不炸');
  plugin.discoverVaults = () => [
    { id: VAULT, name: 'MyVault', path: VAULT, current: true, source: 'auto' },
    { id: VAULT + '-2', name: '有道云笔记', path: VAULT + '-2', current: false, source: 'auto' }
  ];
  view.renderRail();
  click(view.railEl.querySelectorAll('.vwb-vault')[1]);
  ok(view.selectedVault === VAULT + '-2', '切到第二个库');
  ok(view.folderPath === '' && view.query === '', '切换库后清空层级与搜索');

  console.log('\n[8] 多类型预览（图片 / PDF / 文本 / 其它）');
  const fsm = require('fs');
  view.selectedVault = VAULT; // 回到当前库（[7] 切到了外部库）
  view.folderPath = '';
  view.render();
  const tmpDir = path.join(__dirname, 'tmp');
  if (!fsm.existsSync(tmpDir)) fsm.mkdirSync(tmpDir, { recursive: true });
  const pngPath = path.join(tmpDir, 'tiny.png');
  // 1x1 透明 PNG
  fsm.writeFileSync(pngPath, Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AARAAK/wH/9c0AAAAASUVORK5CYII=',
    'base64'
  ));
  const txtPath = path.join(tmpDir, 'note.json');
  fsm.writeFileSync(txtPath, '{"hello":"world"}');

  const extNote = (abs, name, ext, extra) => Object.assign({
    id: abs, name, ext, relPath: name, absPath: abs, folder: 'kcah',
    external: true, tags: [], size: 1024, mtime: Date.now(), ctime: Date.now()
  }, extra || {});
  const inVaultNote = (p, name, ext, extra) => Object.assign({
    id: p, name, ext, relPath: p, absPath: VAULT + '/' + p, folder: 'kcah',
    external: false, tags: [], file: { path: p }, size: 1024, mtime: Date.now(), ctime: Date.now()
  }, extra || {});

  // 图片（当前库）→ 走 Obsidian 资源协议内嵌
  const imgIn = inVaultNote('assets/图.png', '图.png', '.png', { size: 200000 });
  await view.openPreview(imgIn);
  ok(!!view.prevBodyEl.querySelector('.vwb-media-image .vwb-img'), '当前库图片内嵌为 <img>');
  ok(view.prevBodyEl.querySelector('.vwb-img').src.indexOf('app://stub/') === 0,
    '当前库图片走 Obsidian 资源协议');
  ok(view.prevMetaEl.textContent.indexOf('图片') === 0, '元信息标注「图片」类型');
  ok(view.prevFootEl.querySelectorAll('button').length === 5, '图片底栏 5 个按钮');
  click(view.prevFootEl.querySelectorAll('button')[0]);
  ok(view.imgZoom === 'actual' && view.prevBodyEl.querySelector('.vwb-img').className.indexOf('is-actual') >= 0,
    '「实际大小」切换生效');
  click(view.prevFootEl.querySelectorAll('button')[0]);
  ok(view.imgZoom === 'fit' && view.prevBodyEl.querySelector('.vwb-img').className.indexOf('is-actual') < 0,
    '再点切回「适应窗口」');
  click(view.prevBodyEl.querySelector('.vwb-img'));
  ok(view.imgZoom === 'actual' && view.prevBodyEl.querySelector('.vwb-media-image').className.indexOf('is-actual') >= 0,
    '点图片本身也能切 1:1（容器同步）');
  click(view.prevBodyEl.querySelector('.vwb-img'));
  ok(view.imgZoom === 'fit', '再点图片回到适应窗口');

  // 图片（外部库）→ 读成 data URL
  const imgOut = extNote(pngPath, '渗透导图.png', '.png', { size: fsm.statSync(pngPath).size });
  await view.openPreview(imgOut);
  const im2 = view.prevBodyEl.querySelector('.vwb-img');
  ok(!!im2, '外部库图片也能内嵌');
  ok(im2 && im2.src.indexOf('data:image/png;base64,') === 0, '外部库图片兜底读成 data URL');

  // PDF（当前库）→ 走 Obsidian 原生嵌入
  const pdfIn = inVaultNote('kcah/30天渗透.pdf', '30天渗透.pdf', '.pdf', { size: 15 * 1024 * 1024 });
  await view.openPreview(pdfIn);
  ok(!!view.prevBodyEl.querySelector('.vwb-embed'), '当前库 PDF 用原生嵌入容器');
  ok(view.prevBodyEl.textContent.indexOf('![[kcah/30天渗透.pdf]]') >= 0, '嵌入语法指向该 PDF');
  ok(view.prevFootEl.querySelectorAll('button')[0].textContent.indexOf('用外部程序打开') >= 0,
    'PDF 底栏主操作是「用外部程序打开」');

  // 原生嵌入失败 → 退回资源协议 iframe
  const stubMd = require('./obsidian-stub.js').MarkdownRenderer;
  const origRender = stubMd.render;
  stubMd.render = () => { throw new Error('embed unsupported'); };
  await view.openPreview(pdfIn);
  ok(!!view.prevBodyEl.querySelector('.vwb-media-pdf iframe.vwb-pdf'), '原生嵌入失败时退回 iframe 内嵌');
  ok(view.prevBodyEl.querySelector('.vwb-pdf').src.indexOf('30') >= 0, 'iframe 指向该 PDF 资源');
  stubMd.render = origRender;

  // PDF（外部库，真实文件）→ data URL 内嵌 + 系统打开引导
  const pdfReal = path.join(tmpDir, 'fake.pdf');
  fsm.writeFileSync(pdfReal, '%PDF-1.4\n%fake\n');
  const pdfOut2 = extNote(pdfReal, '30天渗透.pdf', '.pdf', { size: fsm.statSync(pdfReal).size });
  await view.openPreview(pdfOut2);
  ok(!!view.prevBodyEl.querySelector('.vwb-media-pdf iframe.vwb-pdf'), '外部库 PDF 尽力内嵌');
  ok(view.prevBodyEl.querySelector('.vwb-pdf').src.indexOf('data:application/pdf;base64,') === 0,
    '外部库 PDF 用 data URL');
  ok(view.prevBodyEl.querySelectorAll('.vwb-quick .vwb-btn').length === 2, '内嵌下方给出「外部打开 / 打开目录」引导');

  // PDF（外部库，拿不到资源）→ 文件信息卡
  const pdfOut = extNote('D:/fake/有道/kcah/30天渗透.pdf', '30天渗透.pdf', '.pdf', { size: 15 * 1024 * 1024 });
  await view.openPreview(pdfOut);
  ok(!!view.prevBodyEl.querySelector('.vwb-fcard'), '外部库 PDF 拿不到资源时降级为文件信息卡');
  ok(view.prevBodyEl.querySelectorAll('.vwb-fcard-btns .vwb-btn').length === 2,
    '信息卡给「用外部程序打开 / 打开文件目录」两个入口');
  ok(view.prevBodyEl.querySelector('.vwb-fcard-path').textContent.indexOf('D:/fake') === 0, '信息卡显示磁盘路径');
  ok(view.prevBodyEl.querySelectorAll('.vwb-frow').length === 4, '信息卡列出类型/大小/修改/创建 4 行');

  // 文本类 → 只读 <pre>
  const txtNote = extNote(txtPath, 'note.json', '.json', { size: fsm.statSync(txtPath).size });
  await view.openPreview(txtNote);
  ok(!!view.prevBodyEl.querySelector('pre.vwb-code'), '文本类直接只读展示为 <pre>');
  ok(view.prevBodyEl.querySelector('.vwb-code').textContent.indexOf('hello') >= 0, '读到真实文件内容');

  // 其它类型（docx）→ 文件信息卡
  const docxNote = extNote('D:/fake/有道/kcah/报告.docx', '报告.docx', '.docx', { size: 34567 });
  await view.openPreview(docxNote);
  ok(!!view.prevBodyEl.querySelector('.vwb-fcard'), '其它类型（docx）走文件信息卡');
  ok(view.prevBodyEl.textContent.indexOf('外部库文件') >= 0, '明确提示外部库不支持内嵌');
  ok(view.prevFootEl.querySelectorAll('button').length === 5, '信息卡底栏 5 个按钮');

  // 音频 → 内嵌播放器
  const mp3In = inVaultNote('kcah/a.mp3', 'a.mp3', '.mp3');
  await view.openPreview(mp3In);
  ok(!!view.prevBodyEl.querySelector('audio.vwb-av'), '当前库音频内嵌 <audio controls>');

  // 网格缩略图
  view.folderPath = 'assets';
  view.render();
  ok(!!view.contentEl.querySelector('.vwb-card-thumb img'), '图片在网格卡片上带缩略图');
  ok(!!view.contentEl.querySelector('.vwb-card .vwb-ico'), '卡片名前面有类型图标');
  view.folderPath = '';
  view.render();

  console.log('\n[9] 铺满 / 大纲 / 打开方式');

  // 默认「铺满」：点当前库文件走原生标签页
  let opened = null;
  const leafCalls = [];
  app.workspace.getLeaf = (t) => {
    leafCalls.push(t);
    return { openFile: async (f) => { opened = f; } };
  };
  plugin.settings.open.mode = 'native';
  await view.openFile(inVaultNote('kcah/x.md', 'x.md', '.md'));
  ok(!!opened, '「铺满」模式下点文件 = 原生打开');
  ok(leafCalls[leafCalls.length - 1] === 'tab', '用新标签页打开，不顶掉工作台自身');

  // 外部库文件回落面板
  opened = null;
  await view.openFile(extNote('D:/fake/外/v.md', 'v.md', '.md'));
  ok(!opened, '外部库文件不会走原生打开');
  ok(view.prevEl.classList.contains('is-on'), '外部库文件自动回落到面板预览');

  // Obsidian 没有原生视图的类型也不硬塞原生
  opened = null;
  await view.openFile(inVaultNote('kcah/报告.docx', '报告.docx', '.docx'));
  ok(!opened, 'docx 这类没有原生视图的不走原生打开');
  ok(!!view.prevBodyEl.querySelector('.vwb-fcard'), 'docx 回落面板的文件信息卡');

  // 面板铺满
  view.togglePreviewMax(true);
  ok(view.prevEl.classList.contains('is-max'), '⤢ 铺满后覆盖整个内容区');
  ok(!view.prevEl.classList.contains('bottom') && !view.prevEl.classList.contains('float'),
    '铺满时不再叠加悬浮/底部位置类');
  ok(view.prevEl.classList.contains('is-on'), '铺满后预览依然打开');
  fire(document, 'keydown', { key: 'Escape' });
  ok(!view.prevMax && view.prevEl.classList.contains('is-on'), 'Esc 先退出铺满、不关预览');
  fire(document, 'keydown', { key: 'Escape' });
  ok(!view.prevEl.classList.contains('is-on'), '再按 Esc 关闭预览');

  // 大纲
  const omd = inVaultNote('kcah/outline.md', 'outline.md', '.md');
  app.vault.read = async () => '# 一、标题A\n\n正文\n\n## 子节B\n\n```\n# 代码里的不算标题\n```\n\n### 更深C\n';
  await view.openPreview(omd);
  ok(view.docHeadings.length === 3, '大纲解析出 3 个标题（跳过代码块），实际 ' + view.docHeadings.length);
  ok(view.docHeadings[0].level === 1 && view.docHeadings[2].level === 3, '记录了标题层级 H1/H2/H3');
  ok(view.outlineBtn.style.display !== 'none', 'md 文件显示大纲按钮');
  click(view.outlineBtn);
  ok(view.outlineEl.classList.contains('is-on'), '点 ☰ 打开大纲抽屉');
  ok(view.prevMax, '窄面板放大纲时自动铺满，避免正文被挤成一条');
  ok(view.outlineEl.parentElement === view.prevBodyEl.parentElement, '大纲与正文并排（同属 .vwb-prev-main）');
  ok(view.outlineEl.parentElement !== view.prevEl, '大纲不再压在头部按钮上');
  ok(view.outlineEl.querySelectorAll('.vwb-outline-i').length === 3, '大纲列出 3 条');
  ok(view.outlineEl.textContent.indexOf('一、标题A') >= 0, '大纲显示标题文字');
  fire(document, 'keydown', { key: 'Escape' });
  ok(!view.outlineOpen && view.prevEl.classList.contains('is-on'), 'Esc 先关大纲、保留预览');
  click(view.outlineBtn);
  click(view.outlineEl.querySelector('.vwb-prev-x'));
  ok(!view.outlineOpen, '点抽屉里的 ✕ 也能关大纲');

  await view.openPreview(inVaultNote('assets/图.png', '图.png', '.png'));
  ok(view.outlineBtn.style.display === 'none', '非 md 预览隐藏大纲按钮');

  // 工具条「打开方式切换」下拉菜单
  view.render();
  ok(!!view.barEl.querySelector('.vwb-openmode .vwb-menu-btn'), '工具条上有「打开方式切换」按钮');
  console.log('[DBG] btn=', JSON.stringify(view.barEl.querySelector('.vwb-openmode .vwb-menu-btn-t').textContent), 'html=', (view.barEl.querySelector('.vwb-openmode .vwb-menu-btn-t').textContent||'').length);
  ok(view.barEl.querySelector('.vwb-openmode .vwb-menu-btn-t').textContent === '打开方式切换', '按钮名就是「打开方式切换」');
  click(view.barEl.querySelector('.vwb-openmode .vwb-menu-btn'));
  view.render();
  const items = Array.from(view.barEl.querySelectorAll('.vwb-menu-pop .vwb-menu-i'));
  ok(items.length === 3, '下拉里正好 3 种模式');
  const itemNames = items.map((i) => i.querySelector('.vwb-menu-i-nm').textContent);
  ok(itemNames[0] === '右侧预览模式（默认）', '第一项标了「（默认）」：' + itemNames[0]);
  ok(itemNames.join('|') === '右侧预览模式（默认）|工作面板|原生编辑', '三模式命名：' + itemNames.join(' / '));
  ok(items.every((i) => !!i.getAttribute('title')), '每项都有 hover 提示（title）');
  ok(items.every((i) => !!i.querySelector('.vwb-menu-i-ds')), '每项都有功能说明文字');
  click(items[1]);
  ok(plugin.settings.open.mode === 'workbench', '选「工作面板模式」→ workbench');
  click(view.barEl.querySelector('.vwb-openmode .vwb-menu-btn'));
  view.render();
  click(view.barEl.querySelectorAll('.vwb-menu-pop .vwb-menu-i')[2]);
  ok(plugin.settings.open.mode === 'native', '选「原生编辑模式」→ native');
  click(view.barEl.querySelector('.vwb-openmode .vwb-menu-btn'));
  view.render();
  click(view.barEl.querySelectorAll('.vwb-menu-pop .vwb-menu-i')[0]);
  ok(plugin.settings.open.mode === 'panel', '选「右侧预览模式」→ panel');
  plugin.settings.open.mode = 'workbench';
  view.render();

  // 三种打开方式的实际落地
  await view.openFile(inVaultNote('kcah/w.md', 'w.md', '.md'));
  ok(view.prevMax, '「工作台内」模式点文件 = 铺满');
  plugin.settings.open.mode = 'panel';
  await view.openFile(inVaultNote('kcah/w2.md', 'w2.md', '.md'));
  ok(!view.prevMax, '「右侧一瞥」模式点文件不铺满');
  plugin.settings.open.mode = 'native';
  await view.openFile(inVaultNote('kcah/w3.md', 'w3.md', '.md'));
  ok(!!opened, '「新标签原生」模式点文件走 Obsidian 原生视图');
  plugin.settings.open.mode = 'workbench';

  // 卡片眼睛按钮：强制面板预览
  opened = null;
  view.folderPath = 'assets';
  view.render();
  ok(!!view.contentEl.querySelector('.vwb-card .vwb-card-eye'), '卡片右上角有 👁 按钮');
  click(view.contentEl.querySelector('.vwb-card .vwb-card-eye'));
  ok(!opened, '点 👁 不走原生打开');
  ok(view.prevEl.classList.contains('is-on'), '点 👁 强制面板预览（不受铺满设置影响）');
  view.folderPath = '';
  view.render();

  console.log('\n[10] 工作台内阅读 / 编辑');
  const enote = inVaultNote('kcah/edit.md', 'edit.md', '.md', { size: 20 });
  let saved = null;
  let docText = '# 原内容\n';
  app.vault.modify = async (f, txt) => { saved = txt; docText = txt; };
  app.vault.read = async () => docText;
  await view.openPreview(enote);
  ok(view.docModeEl.style.display !== 'none', 'md 文档头部有「编辑」入口');
  ok(view.docModeEl.textContent === '编辑', '按钮当前显示「编辑」');
  ok(view.docMode === 'read', '默认是阅读态');

  click(view.docModeEl);
  await sleep(30);
  ok(view.docMode === 'edit', '点「编辑」切到工作台内编辑');
  ok(view.prevMax, '编辑态自动铺满，源码与实时渲染才排得下');
  ok(!!view.prevBodyEl.querySelector('textarea.vwb-editor'), '出现工作台内编辑器');
  ok(view.prevBodyEl.querySelector('.vwb-editor').value.indexOf('原内容') >= 0, '编辑器已载入文件内容');
  ok(!!view.prevBodyEl.querySelector('.vwb-canvas'), '默认是「单画布即时渲染」（.vwb-canvas）');
  ok(!view.prevBodyEl.querySelector('.vwb-live'), '单画布下没有双栏的实时渲染栏');
  ok(view.prevBodyEl.querySelectorAll('.vwb-canvas .vwb-blk').length >= 1, '正文被切成可点的块');
  ok(!!view.prevBodyEl.querySelector('.vwb-edit-bar'), '编辑器顶栏有书写方式切换');
  ok(view.prevBodyEl.querySelectorAll('.vwb-edit-bar .vwb-chip').length === 3, '顶栏正好 3 种书写方式');
  ok(view.prevBodyEl.querySelectorAll('.vwb-canvas .vwb-blk').length === 2, '「# 原内容 + 空行」切成 2 块');
  ok(view.docModeEl.textContent === '阅读', '按钮变成「阅读」（再点回阅读态）');
  ok(view.prevMetaEl.textContent.indexOf('已保存') >= 0, '状态栏显示「已保存」');
  ok(view.prevFootEl.querySelectorAll('button').length === 5, '编辑态底栏 5 个按钮');
  ok(view.prevFootEl.textContent.indexOf('保存') >= 0, '编辑态底栏有「保存」');

  // 输入 → 标脏 → 自动保存
  const ta = view.prevBodyEl.querySelector('.vwb-editor');
  ta.value = '# 改过了\n';
  fire(ta, 'input');
  ok(view.docDirty, '输入后标记为未保存');
  ok(view.prevMetaEl.textContent.indexOf('未保存') >= 0, '状态栏提示未保存');
  await sleep(1200);
  ok(!view.docDirty, '停止输入后自动保存');
  ok(saved === '# 改过了\n', '内容写回 vault.modify');

  // Ctrl+S 立即保存
  ta.value = '# 又改了\n';
  fire(ta, 'input');
  fire(ta, 'keydown', { key: 's', ctrlKey: true });
  ok(saved === '# 又改了\n', 'Ctrl+S 立即保存');

  // Tab 缩进
  ta.value = 'ab';
  ta.selectionStart = 1;
  ta.selectionEnd = 1;
  fire(ta, 'keydown', { key: 'Tab' });
  ok(ta.value === 'a  b', 'Tab 插入两个空格，实际 ' + JSON.stringify(ta.value));

  // Esc 回阅读
  ta.value = '# 最新内容\n';
  fire(ta, 'input');
  fire(ta, 'keydown', { key: 'Escape' });
  await sleep(40);
  ok(view.docMode === 'read', 'Esc 回到阅读态');
  ok(!view.prevBodyEl.querySelector('.vwb-editor'), '阅读态不再有编辑器');
  ok(view.prevBodyEl.textContent.indexOf('最新内容') >= 0, '回到阅读态后按最新内容重新渲染');
  ok(saved === '# 最新内容\n', 'Esc 前把未保存内容落盘');

  console.log('\n[10b] 单画布点哪改哪 + 右键菜单 + 快捷键（v0.5.0）');
  click(view.docModeEl);
  await sleep(40);
  ok(view.editorMode() === 'live', '默认书写方式是「即时渲染」');
  // 进入编辑不应该定位到文末
  ok(view.editorEl.scrollTop === 0, '进入编辑时光标/滚动在开头（不再跳到文末）');
  ok(view.editorEl.selectionStart === 0 && view.editorEl.selectionEnd === 0, '光标落在开头');

  const blk0 = view.prevBodyEl.querySelectorAll('.vwb-canvas .vwb-blk')[0];
  ok(!!blk0, '画布上有可点的块');
  click(blk0);
  await sleep(10);
  ok(view.editingBlock === 0, '点第一段 → 就地编辑这一段');
  const bta = view.prevBodyEl.querySelector('.vwb-blk-ta');
  ok(!!bta, '这一段变成源码输入框（Typora 式点哪改哪）');
  ok(bta.value.indexOf('最新内容') >= 0, '输入框里是这一段的 Markdown 源码');

  bta.value = '# 就地改过\n';
  bta.selectionStart = bta.value.length;
  bta.selectionEnd = bta.value.length;
  fire(bta, 'input');
  ok(view.editorEl.value.indexOf('就地改过') >= 0, '块里的改动同步进源码真源');
  ok(view.docDirty, '块改动同样标脏（走同一条保存链路）');

  // 右键菜单
  fire(bta, 'contextmenu', { clientX: 10, clientY: 10 });
  ok(!!view.prevEl.querySelector('.vwb-ctx'), '正文里点右键弹出上下文菜单');
  const menuLabels = Array.from(view.prevEl.querySelectorAll('.vwb-ctx-lb')).map((n) => n.textContent);
  ok(menuLabels.indexOf('新增链接') >= 0 && menuLabels.indexOf('文本格式') >= 0 &&
    menuLabels.indexOf('段落设置') >= 0 && menuLabels.indexOf('插入') >= 0,
    '菜单含 链接 / 文本格式 / 段落设置 / 插入');
  ok(menuLabels.indexOf('剪切') >= 0 && menuLabels.indexOf('复制') >= 0 && menuLabels.indexOf('粘贴') >= 0,
    '菜单含 剪切 / 复制 / 粘贴');
  const keys = Array.from(view.prevEl.querySelectorAll('.vwb-ctx-key')).map((n) => n.textContent);
  ok(keys.indexOf('Ctrl+B') >= 0 && keys.indexOf('Ctrl+K') >= 0 && keys.indexOf('Ctrl+U') >= 0,
    '菜单里标注了快捷键：' + keys.join(' / '));
  const subText = Array.from(view.prevEl.querySelectorAll('.vwb-ctx-sub')).map((s) => s.textContent).join('|');
  ok(subText.indexOf('加粗') >= 0 && subText.indexOf('下划线') >= 0, '「文本格式」子菜单有加粗 / 下划线');
  ok(subText.indexOf('一级标题') >= 0 && subText.indexOf('任务列表') >= 0, '「段落设置」子菜单有标题 / 任务列表');
  ok(subText.indexOf('表格') >= 0 && subText.indexOf('公式块') >= 0, '「插入」子菜单有表格 / 公式块');
  view.closeEditorMenu();
  ok(!view.prevEl.querySelector('.vwb-ctx'), 'Esc / 点空白可关掉右键菜单');

  // 快捷键（和右键菜单同一套命令）
  const tryKey = (val, s, e, ev) => {
    bta.value = val;
    bta.selectionStart = s;
    bta.selectionEnd = e;
    fire(bta, 'keydown', ev);
    return bta.value;
  };
  ok(tryKey('abc', 0, 3, { key: 'b', ctrlKey: true }) === '**abc**', 'Ctrl+B 加粗');
  ok(tryKey('abc', 0, 3, { key: 'i', ctrlKey: true }) === '*abc*', 'Ctrl+I 斜体');
  ok(tryKey('abc', 0, 3, { key: 'u', ctrlKey: true }) === '<u>abc</u>', 'Ctrl+U 下划线');
  ok(tryKey('abc', 0, 3, { key: '5', altKey: true, shiftKey: true }) === '~~abc~~', 'Alt+Shift+5 删除线');
  ok(tryKey('abc', 0, 3, { key: '`', ctrlKey: true }) === '`abc`', 'Ctrl+` 行内代码');
  ok(tryKey('abc', 0, 0, { key: 'k', ctrlKey: true, shiftKey: true }).indexOf('```') >= 0, 'Ctrl+Shift+K 代码块');
  ok(tryKey('abc', 0, 3, { key: 'k', ctrlKey: true }).indexOf('[abc](') === 0, 'Ctrl+K 超链接');
  ok(tryKey('**abc**', 0, 7, { key: '\\', ctrlKey: true }) === 'abc', 'Ctrl+\\ 清除样式');

  // 提交这一段
  bta.value = '# 就地改过';
  fire(bta, 'input');
  fire(bta, 'blur');
  await sleep(40);
  ok(view.editingBlock === null, '失焦后结束这一段编辑');
  ok(!view.prevBodyEl.querySelector('.vwb-blk-ta'), '源码输入框收起、恢复渲染样式');
  ok(view.prevBodyEl.textContent.indexOf('就地改过') >= 0, '这一段按新内容重新渲染');
  ok(view.editorEl.value === '# 就地改过\n', '源码真源同步正确，实际 ' + JSON.stringify(view.editorEl.value));

  // 单画布下焦点不在输入框时，Ctrl+S 也能保存
  const srcBefore = view.editorEl.value;
  view.editorEl.value = srcBefore + '\n\n新加一段\n';
  view.docDirty = true;
  fire(document, 'keydown', { key: 's', ctrlKey: true });
  ok(saved === view.editorEl.value, '单画布下 Ctrl+S 立即保存');

  // 编辑态也能用大纲
  ok(view.outlineBtn.style.display !== 'none', '编辑态大纲按钮也能用（不再只有阅读模式有）');
  click(view.outlineBtn);
  ok(view.outlineOpen, '编辑态点开大纲');
  ok(view.docHeadings.length >= 1, '单画布大纲列出标题（' + view.docHeadings.length + ' 个）');
  ok(!!view.outlineEl.querySelector('.vwb-outline-i'), '大纲条目在编辑态可点');
  click(view.outlineEl.querySelector('.vwb-outline-i'));
  ok(true, '点大纲条目跳转不报错');
  view.toggleOutline(false);

  // 三种书写方式来回切
  view.setEditorMode('split');
  await sleep(50);
  ok(view.editorMode() === 'split', '切到「双栏分屏」');
  ok(view.prevBodyEl.querySelector('.vwb-edit').getAttribute('data-mode') === 'split', '容器标记 data-mode=split');
  const liveEl = view.prevBodyEl.querySelector('.vwb-live');
  ok(!!liveEl, '双栏模式出现实时渲染栏');
  liveEl.scrollTop = 0;
  view.editorEl.scrollTop = 400;
  fire(view.editorEl, 'scroll');
  ok(liveEl.scrollTop > 0, '滚动源码 → 右侧渲染跟着滚（滚动同步）');

  view.setEditorMode('source');
  await sleep(40);
  ok(view.editorMode() === 'source', '切到「纯源码」');
  ok(!view.prevBodyEl.querySelector('.vwb-canvas'), '纯源码模式没有画布');
  ok(!view.prevBodyEl.querySelector('.vwb-live'), '纯源码模式没有实时渲染栏');
  ok(view.docHeadings.length >= 1, '纯源码模式大纲同样列得出标题');
  view.toggleOutline(true);
  const oiSrc = view.outlineEl.querySelector('.vwb-outline-i');
  ok(!!oiSrc, '纯源码模式大纲有条目可点');
  click(oiSrc);
  ok(view.editorEl.selectionStart >= 0, '点大纲把光标送到对应行（不报错）');
  view.toggleOutline(false);

  view.setEditorMode('live');
  await sleep(50);
  ok(view.editorMode() === 'live', '切回「即时渲染」');
  ok(!!view.prevBodyEl.querySelector('.vwb-canvas'), '画布回来了');

  click(view.docModeEl);
  await sleep(40);
  ok(view.docMode === 'read', '回到阅读态');
  plugin.settings.editor.mode = 'live';

  // 非可编辑类型不给编辑入口
  await view.openPreview(inVaultNote('assets/图.png', '图.png', '.png'));
  ok(view.docModeEl.style.display === 'none', '图片预览隐藏「编辑」入口');

  console.log('\n[10c] 双栏首帧就有渲染 + 右键菜单位置 / 翻转 / 滚动（v0.6.0）');
  docText = '# 标题\n\n正文一段\n';
  await view.openPreview(enote);
  click(view.docModeEl);
  await sleep(40);
  view.setEditorMode('split');
  await sleep(60);
  const livePane = view.prevBodyEl.querySelector('.vwb-live');
  ok(!!livePane, '双栏模式有右栏');
  ok(!!livePane.querySelector('.vwb-doc-inner'), '右栏首帧就渲染出内容（不再空白一片 —— 图 1 的 bug）');
  ok(livePane.textContent.indexOf('正文一段') >= 0, '右栏渲染的就是正文内容');
  view.setEditorMode('live');
  await sleep(50);

  // 右键菜单：贴着鼠标，且整块留在面板里
  const cblk = view.prevBodyEl.querySelectorAll('.vwb-canvas .vwb-blk')[0];
  ok(!!cblk, '画布上有块');
  view.prevEl.clientHeight = 400;
  view.prevEl.clientWidth = 600;
  const ctxOf = () => view.prevEl.querySelector('.vwb-ctx');
  fire(cblk, 'contextmenu', { clientX: 20, clientY: 20 });
  ok(!!ctxOf(), '块上点右键弹出菜单');
  ok(String(ctxOf().style.left) === '20px' && String(ctxOf().style.top) === '20px',
    '菜单出现在鼠标位置（' + ctxOf().style.left + ',' + ctxOf().style.top + '）');
  ok(!ctxOf().classList.contains('is-flip'), '左边空间够 → 子菜单朝右开');
  view.closeEditorMenu();

  fire(cblk, 'contextmenu', { clientX: 580, clientY: 380 });
  const ctxR = ctxOf();
  ok(parseInt(ctxR.style.left, 10) + 224 <= 600, '靠右下角右键不再被裁掉：自动左移');
  ok(parseInt(ctxR.style.top, 10) + 340 <= 400, '下方放不下 → 菜单向上翻');
  ok(ctxR.classList.contains('is-flip'), '右边展不开 → 子菜单改朝左开');
  const subLabels = Array.from(ctxR.querySelectorAll('.vwb-ctx-sub')).map((s) => s.textContent).join('|');
  ok(subLabels.indexOf('五级标题') >= 0 && subLabels.indexOf('提升标题级别') >= 0,
    '段落子菜单补齐了五 / 六级标题与升降级');
  ok(subLabels.indexOf('内容目录') >= 0 && subLabels.indexOf('YAML Front Matter') >= 0,
    '插入子菜单补齐了目录 / Front Matter');
  view.closeEditorMenu();

  // 面板很矮 → 限高 + 内部滚动（功能再变多也不会被切掉）
  view.prevEl.clientHeight = 300;
  fire(cblk, 'contextmenu', { clientX: 30, clientY: 30 });
  const ctxS = ctxOf();
  ok(ctxS.classList.contains('is-flat'), '装不下 → 菜单限高 + 子菜单就地展开');
  ok(String(ctxS.style.maxHeight).indexOf('px') > 0, '菜单设了 max-height（' + ctxS.style.maxHeight + '）');
  ok(String(ctxS.style.overflowY) === 'auto', '菜单内部可以上下滚动选择');
  view.closeEditorMenu();
  view.prevEl.clientHeight = 400;

  // 面板太窄、根菜单 + 子菜单怎么摆都放不下 → 子菜单直接就地展开
  view.prevEl.clientWidth = 300;
  view.prevEl.clientHeight = 600;
  fire(cblk, 'contextmenu', { clientX: 250, clientY: 100 });
  const ctxN = ctxOf();
  ok(ctxN.classList.contains('is-flat'), '面板很窄 → 子菜单就地展开，不会跑到面板外');
  ok(parseInt(ctxN.style.left, 10) + 224 <= 300, '根菜单被挪进面板内（left=' + ctxN.style.left + '）');
  view.closeEditorMenu();
  view.prevEl.clientWidth = 600;
  view.prevEl.clientHeight = 400;

  // 新快捷键（和菜单同一套命令）
  view.editBlock(0, 'end');
  const kta = view.prevBodyEl.querySelector('.vwb-blk-ta');
  const tryKey2 = (val, s, e, ev) => {
    kta.value = val;
    kta.selectionStart = s;
    kta.selectionEnd = e;
    fire(kta, 'keydown', ev);
    return kta.value;
  };
  ok(tryKey2('abc', 0, 0, { key: '1', ctrlKey: true }) === '# abc', 'Ctrl+1 一级标题');
  ok(tryKey2('abc', 0, 0, { key: '0', ctrlKey: true }) === 'abc', 'Ctrl+0 变回正文');
  ok(tryKey2('abc', 0, 0, { key: '=', ctrlKey: true }) === '# abc', 'Ctrl+= 提升标题级别');
  ok(tryKey2('# abc', 0, 0, { key: '-', ctrlKey: true }) === 'abc', 'Ctrl+- 降低标题级别');
  ok(tryKey2('abc', 0, 0, { key: 'q', ctrlKey: true, shiftKey: true }) === '> abc', 'Ctrl+Shift+Q 引用');
  ok(tryKey2('abc', 0, 0, { key: ']', ctrlKey: true, shiftKey: true }) === '- abc', 'Ctrl+Shift+] 无序列表');
  ok(tryKey2('abc', 0, 0, { key: 'x', ctrlKey: true, shiftKey: true }) === '- [ ] abc', 'Ctrl+Shift+X 任务列表');
  ok(tryKey2('abc', 0, 3, { key: 'h', ctrlKey: true, shiftKey: true }) === '==abc==', 'Ctrl+Shift+H 高亮');
  fire(kta, 'blur');
  await sleep(40);

  console.log('\n[10d] 即时渲染：连续书写，不再「一块一块」（v0.6.0 问题 3）');
  docText = '第一段\n\n第二段\n';
  view.setEditorMode('live');
  await sleep(60);
  view.editorEl.value = '第一段\n\n第二段\n';
  await view.renderCanvas();
  ok(view.blocks.length === 4, '切出 4 块（段 / 空行 / 段 / 尾空行），实际 ' + view.blocks.length);

  view.editBlock(0, 'end');
  const ct0 = view.prevBodyEl.querySelector('.vwb-blk-ta');
  ok(!!ct0, '点第一段就地编辑');
  ok(ct0.classList.contains('vwb-ta-paragraph'), '块输入框按类型带样式类（字体跟渲染一致，看不出「盒子」）');
  fire(ct0, 'keydown', { key: 'ArrowDown' });
  await sleep(50);
  ok(view.editingBlock === 2, '段尾按 ↓ → 直接落到下一段（跳过空行），实际 ' + view.editingBlock);

  const ct2 = view.prevBodyEl.querySelector('.vwb-blk-ta');
  fire(ct2, 'keydown', { key: 'ArrowUp' });
  await sleep(50);
  ok(view.editingBlock === 0, '段首按 ↑ → 回到上一段，实际 ' + view.editingBlock);

  // 段尾 Enter = 只在本段里换行；Shift+Enter 才是「完成这一段 + 新建下一段」
  const ct0b = view.prevBodyEl.querySelector('.vwb-blk-ta');
  ct0b.value = '第一段';
  ct0b.selectionStart = ct0b.selectionEnd = 3;
  fire(ct0b, 'input');
  fire(ct0b, 'keydown', { key: 'Enter' });
  ok(ct0b.value === '第一段  \n', '段尾回车只换行、不新建段，实际 ' + JSON.stringify(ct0b.value));
  ok(view.blocks.length === 4, '回车之后块数不变（还是 4 块）');

  ct0b.value = '第一段';
  ct0b.selectionStart = ct0b.selectionEnd = 3;
  fire(ct0b, 'input');
  fire(ct0b, 'keydown', { key: 'Enter', shiftKey: true });
  await sleep(60);
  ok(view.editingBlock != null, 'Shift+Enter → 完成这一段并新建下一段，光标落在新段上');
  ok(view.editorEl.value.indexOf('第一段\n\n\n') === 0, '源码里多出一个空段，实际 ' +
    JSON.stringify(view.editorEl.value.slice(0, 12)));

  // 段首退格 = 并到上一段
  docText = '甲\n\n乙\n';
  view.editorEl.value = '甲\n\n乙\n';
  await view.renderCanvas();
  view.editBlock(2, 'start');
  const bt2 = view.prevBodyEl.querySelector('.vwb-blk-ta');
  ok(bt2.value === '乙', '第三块是「乙」');
  fire(bt2, 'keydown', { key: 'Backspace' });
  await sleep(60);
  ok(view.editorEl.value === '甲 乙\n', '段首退格把这一段并进上一段，实际 ' + JSON.stringify(view.editorEl.value));

  // 点画布空白 = 文末新建一段
  docText = '甲';
  view.editorEl.value = '甲';
  await view.renderCanvas();
  const before = view.blocks.length;
  fire(view.canvasEl, 'click');
  await sleep(60);
  ok(view.blocks.length > before, '点画布空白 → 文末多出一段（' + before + ' → ' + view.blocks.length + '）');
  ok(view.editorEl.value === '甲\n\n', '源码末尾补出空段，实际 ' + JSON.stringify(view.editorEl.value));
  ok(view.editingBlock === view.blocks.length - 1, '并且光标已经在最后那一段上');
  fire(view.prevBodyEl.querySelector('.vwb-blk-ta'), 'blur');
  await sleep(40);

  // 画布不再有「盒子感」的视觉标记（靠 hover 才提示可点）
  ok(view.canvasEl, '画布还在');
  click(view.docModeEl);
  await sleep(40);
  ok(view.docMode === 'read', '回到阅读态（连续书写测试收尾）');

  console.log('\n[10e] 回车 = 换行 / Shift+Enter = 完成这一段 / 右键命令落点 / 删除（v0.8.0）');
  plugin.settings.editor.mode = 'live';
  click(view.docModeEl); // 重新进编辑态（[10d] 收尾时回到了阅读态）
  await sleep(60);
  ok(view.docMode === 'edit' && !!view.editorEl && !!view.canvasEl, '重新进入「即时渲染」编辑态');
  const taOf = () => view.prevBodyEl.querySelector('.vwb-blk-ta');
  const setSrc = async (s) => {
    docText = s;
    view.editorEl.value = s;
    await view.renderCanvas();
  };

  // —— Enter：只在本段里换行（写 Markdown 硬换行，渲染出来看得见）
  await setSrc('甲\n\n乙\n');
  await view.editBlock(0, 'end');
  let t1 = taOf();
  t1.value = '甲一甲二';
  t1.selectionStart = t1.selectionEnd = 2;
  fire(t1, 'input');
  const cntBefore = view.blocks.length;
  fire(t1, 'keydown', { key: 'Enter' });
  ok(t1.value === '甲一  \n甲二', '光标处回车 = 换行（行尾两个空格），实际 ' + JSON.stringify(t1.value));
  ok(view.blocks.length === cntBefore && view.editingBlock === 0,
    '回车不新建段（' + cntBefore + ' → ' + view.blocks.length + '）');
  t1.selectionStart = t1.selectionEnd = t1.value.length;
  fire(t1, 'keydown', { key: 'Enter' });
  ok(t1.value === '甲一  \n甲二  \n', '段尾回车同样只换行，实际 ' + JSON.stringify(t1.value));
  ok(view.blocks.length === cntBefore, '段尾回车也没多出块');

  // —— Shift + Enter：完成这一段，紧接着另起新的一段
  t1.value = '甲一\n甲二';
  t1.selectionStart = t1.selectionEnd = t1.value.length;
  fire(t1, 'input');
  fire(t1, 'keydown', { key: 'Enter', shiftKey: true });
  await sleep(60);
  const tNew = taOf();
  ok(view.editingBlock > 0, 'Shift+Enter → 光标进新的一段，实际 ' + view.editingBlock);
  ok(!!tNew && tNew.value === '', '新段是空输入框（不再自带两行），实际 ' + JSON.stringify(tNew && tNew.value));
  ok(!/\n/.test(String(tNew && tNew.value)), '新段里没有多余换行');
  ok(view.editorEl.value.indexOf('甲一\n甲二\n\n\n') === 0, '源码里多出一个空段，实际 ' +
    JSON.stringify(view.editorEl.value.slice(0, 14)));

  tNew.value = '新内容';
  fire(tNew, 'input');
  await sleep(30);
  ok(view.editorEl.value === '甲一\n甲二\n\n新内容\n\n乙\n',
    '新段自带前后空行，不会粘到相邻段落上：' + JSON.stringify(view.editorEl.value));

  // 新段一个字没写就走 → 源码回滚干净
  await setSrc('甲\n\n乙\n');
  await view.editBlock(0, 'end');
  t1 = taOf();
  t1.value = '甲';
  t1.selectionStart = t1.selectionEnd = 1;
  fire(t1, 'input');
  fire(t1, 'keydown', { key: 'Enter', shiftKey: true });
  await sleep(60);
  await view.commitBlock();
  ok(view.editorEl.value === '甲\n\n乙\n',
    '空新段没写字就离开 → 源码恢复原样不留空行，实际 ' + JSON.stringify(view.editorEl.value));

  // —— 列表：末尾回车自动续一行，空项回车跳出列表
  await setSrc('- 一\n- 二\n');
  await view.editBlock(0, 'end');
  const lt = taOf();
  lt.selectionStart = lt.selectionEnd = lt.value.length;
  fire(lt, 'keydown', { key: 'Enter' });
  ok(lt.value === '- 一\n- 二\n- ', '列表末尾回车自动续一行，实际 ' + JSON.stringify(lt.value));
  fire(lt, 'keydown', { key: 'Enter' });
  await sleep(60);
  ok(view.editorEl.value.indexOf('- 一\n- 二\n\n') === 0,
    '空列表项再回车 → 跳出列表新建段，实际 ' + JSON.stringify(view.editorEl.value.slice(0, 14)));
  await view.commitBlock();

  // —— 代码块 / 表格 / Front Matter 是「原样内容」：两种回车都只换行
  await setSrc('```\ncode\n```\n');
  await view.editBlock(0, 'end');
  let cbTa = taOf();
  cbTa.selectionStart = cbTa.selectionEnd = cbTa.value.length;
  const cbBefore = view.blocks.length;
  fire(cbTa, 'keydown', { key: 'Enter' });
  await sleep(40);
  ok(view.blocks.length === cbBefore && view.editingBlock === 0, '代码块里回车只换行、不新建段');
  ok(cbTa.value === '```\ncode\n```\n', '代码块回车写的是普通换行（不写行尾空格），实际 ' + JSON.stringify(cbTa.value));
  cbTa = taOf();
  cbTa.selectionStart = cbTa.selectionEnd = cbTa.value.length;
  fire(cbTa, 'keydown', { key: 'Enter', shiftKey: true });
  ok(view.blocks.length === cbBefore && view.editingBlock === 0, '代码块里 Shift+Enter 也只是换行');
  await view.commitBlock();

  // —— 右键命令作用在「右键点的那一段」上（不是隐藏的源码框）
  await setSrc('甲\n\n乙\n');
  const blkB = view.prevBodyEl.querySelectorAll('.vwb-canvas .vwb-blk')[2];
  fire(blkB, 'contextmenu', { clientX: 30, clientY: 30 });
  const menuB = view.prevEl.querySelector('.vwb-ctx');
  ok(!!menuB, '在第三段上右键弹出菜单');
  const boldRow = Array.from(menuB.querySelectorAll('.vwb-ctx-sub .vwb-ctx-i'))
    .find((n) => n.textContent.indexOf('加粗') >= 0);
  ok(!!boldRow, '子菜单里有「加粗」');
  click(boldRow);
  await sleep(70);
  ok(view.editingBlock === 2, '右键命令把右击的那一段带进编辑态，实际 ' + view.editingBlock);
  const tB = taOf();
  ok(!!tB && tB.value.indexOf('**') >= 0, '加粗真的作用在「乙」这一段上，实际 ' + JSON.stringify(tB && tB.value));
  ok(view.editorEl.value.indexOf('**') >= 0, '改动同步进源码真源');
  await view.commitBlock();
  ok(String(view.canvasEl.textContent).indexOf('乙') >= 0, '画布重新渲染出这一段');

  // —— 菜单不能抢走焦点：点菜单项时 mousedown 必须被拦下。
  // 不拦的话正在编辑的那一段会先 blur → 提交重绘 → 输入框被换掉，命令就落到废掉的输入框上了。
  await setSrc('甲\n\n乙\n');
  fire(blkB, 'contextmenu', { clientX: 30, clientY: 30 });
  const menuX = view.prevEl.querySelector('.vwb-ctx');
  ok(!!menuX, '菜单弹出');
  ok(fire(menuX, 'mousedown').defaultPrevented === true,
    '菜单拦下 mousedown → 正在编辑的那一段不会失焦（这就是「右键点了没反应」的根因）');

  // 就算那一段真的先被提交重绘（输入框作废），命令也要落到「重新打开的那一段」上
  const deadTa = await view.editBlock(2, 'end');
  fire(deadTa, 'input');
  view.showEditorMenu({ clientX: 30, clientY: 30 }, deadTa, 2);
  const menuY = view.prevEl.querySelector('.vwb-ctx');
  const boldRow2 = Array.from(menuY.querySelectorAll('.vwb-ctx-sub .vwb-ctx-i'))
    .find((n) => n.textContent.indexOf('加粗') >= 0);
  await view.commitBlock(); // 模拟失焦提交：deadTa 已经脱离文档
  click(boldRow2);
  await sleep(80);
  const tB2 = taOf();
  ok(view.editingBlock === 2 && !!tB2 && tB2.value.indexOf('**') >= 0,
    '菜单弹出后那一段被重绘过，命令仍然生效（自动重新带进编辑态），实际 ' + JSON.stringify(tB2 && tB2.value));
  await view.commitBlock();

  // —— 菜单里的「删除」（v0.8.0 新增）
  await setSrc('甲\n\n乙\n\n丙\n');
  fire(view.prevBodyEl.querySelectorAll('.vwb-canvas .vwb-blk')[4], 'contextmenu', { clientX: 30, clientY: 30 });
  const menuD = view.prevEl.querySelector('.vwb-ctx');
  const rowOf = (menu, text) =>
    Array.from(menu.querySelectorAll('.vwb-ctx-i')).find((n) => n.textContent.indexOf(text) >= 0);
  ok(!!rowOf(menuD, '删除选中内容'), '菜单里有「删除选中内容」');
  ok(!!rowOf(menuD, '删除这一段'), '菜单里有「删除这一段」');
  click(rowOf(menuD, '删除这一段'));
  await sleep(90);
  ok(view.editorEl.value.indexOf('丙') < 0,
    '「删除这一段」把那一段从源码里删掉，实际 ' + JSON.stringify(view.editorEl.value));
  ok(view.editorEl.value.indexOf('乙') >= 0, '别的段落不受影响');
  ok(view.editorEl.value === '甲\n\n乙\n', '删除时顺手带走紧邻的空行，不留一串空行');
  ok(view.editingBlock != null, '删完把光标放到相邻那一段，接着就能写');

  // 删除选中内容：只删选中的字
  await setSrc('甲\n\n乙\n');
  const dsTa = await view.editBlock(0, 'end');
  dsTa.value = '甲乙丙';
  dsTa.selectionStart = 1;
  dsTa.selectionEnd = 2;
  fire(dsTa, 'input');
  view.showEditorMenu({ clientX: 30, clientY: 30 }, dsTa, 0);
  click(rowOf(view.prevEl.querySelector('.vwb-ctx'), '删除选中内容'));
  await sleep(40);
  ok(taOf().value === '甲丙', '「删除选中内容」只删选中的字，实际 ' + JSON.stringify(taOf() && taOf().value));
  await view.commitBlock();

  // 画布空白处右键 → 作用在整篇源码，并且画布会跟着重画
  await setSrc('甲\n');
  fire(view.canvasEl, 'contextmenu', { clientX: 40, clientY: 40 });
  const menu2 = view.prevEl.querySelector('.vwb-ctx');
  ok(!rowOf(menu2, '删除这一段'),
    '整篇级右键不显示「删除这一段」（定位不到具体某段，显示了也没法用）');
  const hrRow = Array.from(menu2.querySelectorAll('.vwb-ctx-sub .vwb-ctx-i'))
    .find((n) => n.textContent.indexOf('水平分割线') >= 0);
  ok(!!hrRow, '画布空白处右键，菜单里有「插入 → 水平分割线」');
  click(hrRow);
  await sleep(70);
  ok(view.editorEl.value.indexOf('\n---') >= 0,
    '整篇级命令写进了源码真源，实际 ' + JSON.stringify(view.editorEl.value));
  ok(view.blocks.some((b) => b.type === 'hr'), '画布重解析出了分隔线块（不是「点了没反应」）');

  // 正在写新段落时被别的操作打断 → 不把占位空行存进文件
  await setSrc('甲\n');
  await view.editBlock(0, 'end');
  const pendTa = taOf();
  pendTa.value = '甲';
  fire(pendTa, 'input');
  fire(pendTa, 'keydown', { key: 'Enter', shiftKey: true });
  await sleep(60);
  await view.closePreview();
  await sleep(60);
  ok(saved === '甲\n',
    '正在写新段落时关掉预览 → 文件里不留占位空行，实际 ' + JSON.stringify(saved));
  view.openPreview(enote);
  await sleep(40);

  console.log('\n[11] 外部库 md 的相对资源兜底');
  const extDir = path.join(tmpDir, 'ext');
  if (!fsm.existsSync(extDir)) fsm.mkdirSync(extDir, { recursive: true });
  const pngBuf = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AARAAK/wH/9c0AAAAASUVORK5CYII=',
    'base64'
  );
  fsm.writeFileSync(path.join(extDir, 'img1.png'), pngBuf);
  fsm.writeFileSync(path.join(extDir, 'pic2.png'), pngBuf);

  const host = new El('div');
  const relImg = host.createEl('img');
  relImg.setAttribute('src', 'img1.png');
  const missImg = host.createEl('img');
  missImg.setAttribute('src', '不存在.png');
  const emb = host.createDiv({ cls: 'internal-embed is-unresolved' });
  emb.setAttribute('src', 'pic2.png');
  const extImg = host.createEl('img');
  extImg.setAttribute('src', 'https://example.com/x.png');
  const link = host.createEl('a', { cls: 'internal-link' });
  link.setAttribute('data-href', '周报模板');

  view.fixupRenderedContent(host, extNote(path.join(extDir, 'a.md'), 'a.md', '.md'));
  ok(host.querySelector('img').getAttribute('src').indexOf('data:image/png;base64,') === 0,
    '相对路径图片兜底成 data URL（这就是图 1「找不到」的修法）');
  ok(!!host.querySelectorAll('.internal-embed')[0].querySelector('img'), '未解析的 ![[pic2.png]] 被换成真图片');
  ok(!host.querySelectorAll('.internal-embed')[0].classList.contains('is-unresolved'), '清掉 is-unresolved 标记');
  ok(extImg.getAttribute('src').indexOf('https://') === 0, '外链图片不动它');
  ok(missImg.getAttribute('src') === '不存在.png', '找不到的资源保持原样（不假装成功）');
  click(link);
  await sleep(30);
  ok(view.selectedNote && view.selectedNote.name === '周报模板.md',
    '内部链接 [[周报模板]] 能在当前库里找到并打开');
  await view.closePreview();

  console.log('\n[13] obsidian库导航 展开 / 收缩（v0.4.0 问题 1）');
  ok(view.railEl.textContent.indexOf('obsidian库导航') >= 0, '标题改成「obsidian库导航」');
  ok(!view.railEl.classList.contains('is-collapsed'), '默认展开');
  const tgBtn0 = view.railEl.querySelector('.vwb-rail-tg');
  ok(!!tgBtn0, '标题行有展开 / 收缩按钮');
  ok(tgBtn0.textContent.indexOf('收缩') >= 0, '展开态按钮写「收缩」');
  click(tgBtn0);
  ok(view.railEl.classList.contains('is-collapsed'), '点「收缩」收起');
  ok(plugin.settings.ui.railCollapsed === true, '收起状态写进设置（重载后保持）');
  const tgBtn1 = view.railEl.querySelector('.vwb-rail-tg');
  ok(tgBtn1.textContent.indexOf('展开') >= 0, '收起态按钮写「展开」');
  ok(!!view.railEl.querySelector('.vwb-rail-ic'), '收起态留一个库图标');
  click(tgBtn1);
  ok(!view.railEl.classList.contains('is-collapsed'), '再点「展开」回来');

  console.log('\n[14] 目录前进 / 后退（v0.4.0 问题 3）');
  view.goTo('');
  view.resetHist();
  ok(!view.canBack() && !view.canFwd(), '初始没有前进 / 后退记录');
  view.goTo('A');
  view.goTo('A/B');
  ok(view.folderPath === 'A/B', 'goTo 进下一层');
  ok(view.canBack() && !view.canFwd(), '有后退、没前进');
  fire(document, 'keydown', { key: 'ArrowLeft', altKey: true });
  ok(view.folderPath === 'A', 'Alt + ← 后退');
  ok(view.canFwd(), '后退之后有前进了');
  fire(document, 'keydown', { key: 'ArrowRight', altKey: true });
  ok(view.folderPath === 'A/B', 'Alt + → 前进');
  fire(document, 'keydown', { key: 'ArrowUp', altKey: true });
  ok(view.folderPath === 'A', 'Alt + ↑ 上一级');
  fire(document, 'keydown', { key: 'Backspace' });
  ok(view.folderPath === '', '文件列表里按 Backspace = 上一级');

  view.render();
  const navs = Array.from(view.barEl.querySelectorAll('.vwb-nav'));
  ok(navs.length === 2, '工具条有 ⇦ ⇨ 两个按钮');
  ok(navs[0].textContent === '⇦' && navs[1].textContent === '⇨', '顺序是后退、前进');
  ok(!!navs[0].getAttribute('title') && navs[0].getAttribute('title').indexOf('Alt') >= 0,
    '按钮 hover 提示里写了快捷键');

  view.resetHist();
  view.goTo('A');
  view.goTo('A/B');
  click(view.barEl.querySelectorAll('.vwb-nav')[0]);
  ok(view.folderPath === 'A', '点 ⇦ 后退');
  click(view.barEl.querySelectorAll('.vwb-nav')[1]);
  ok(view.folderPath === 'A/B', '点 ⇨ 前进');

  // 点「上一级」也进历史，之后还能前进回去
  view.resetHist();
  view.goTo('A');
  view.goTo('A/B');
  view.goUp();
  ok(view.folderPath === 'A', '点「上一级」回到 A');
  view.goFwd();
  ok(view.folderPath === 'A/B', '上一级之后还能前进回 A/B');
  // 走到新分支会丢掉旧的「前进」记录
  view.goBack();
  view.goTo('C');
  ok(!view.canFwd(), '去了新的分支后，旧的「前进」记录被清掉');
  view.goTo('');

  console.log('\n[15] 设置面板子页可点开查看（v0.4.0 问题 4）');
  view.drawerOpen = true;
  view.drawerPage = 'appearance';
  view.renderDrawer();
  const navOf = (name) =>
    Array.from(view.drawerEl.querySelectorAll('.vwb-drawer-nav-i')).find((n) => n.textContent === name);
  click(navOf('打开方式'));
  ok(view.drawerPage === 'open', '点「打开方式」子页');
  ok(view.drawerEl.textContent.indexOf('设置 · 打开方式') >= 0, '标题跟着子页变');
  ok(view.drawerEl.querySelectorAll('.vwb-mode').length === 3, '打开方式子页有 3 个模式卡');
  ok(view.drawerEl.textContent.indexOf('右侧预览模式（默认）') >= 0, '默认模式标了「（默认）」');
  click(view.drawerEl.querySelectorAll('.vwb-mode')[1]);
  ok(plugin.settings.open.mode === 'workbench', '在设置里直接切到工作面板模式');
  click(navOf('外观'));
  ok(view.drawerPage === 'appearance', '再点回「外观」子页');
  click(navOf('库管理'));
  ok(view.drawerPage === 'vaults', '点「库管理」子页');
  ok(view.drawerEl.textContent.indexOf('手动添加文件夹') >= 0, '库管理子页有手动添加入口');
  click(navOf('操作日志'));
  ok(view.drawerPage === 'logs', '点「操作日志」子页');
  click(navOf('关于'));
  ok(view.drawerPage === 'about', '点「关于」子页');
  ok(view.drawerEl.textContent.indexOf('Vault Hub') >= 0, '关于子页有插件说明');
  view.drawerPage = 'appearance';
  view.toggleDrawer(false);
  plugin.settings.open.mode = 'panel';

  console.log('\n[16] 说明 / 快捷键收进设置（v0.5.0 问题 1）');
  view.drawerOpen = true;
  view.drawerPage = 'guide';
  view.renderDrawer();
  ok(view.drawerEl.textContent.indexOf('设置 · 使用说明') >= 0, '有「使用说明」子页');
  ok(view.drawerEl.textContent.indexOf('快速上手') >= 0, '说明页有「快速上手」');
  const guideKv = Array.from(view.drawerEl.querySelectorAll('.vwb-kv kbd')).map((k) => k.textContent);
  ok(guideKv.indexOf('Ctrl + B') >= 0 && guideKv.indexOf('Ctrl + K') >= 0, '说明页列了编辑快捷键');
  ok(guideKv.indexOf('Alt + ←') >= 0 && guideKv.indexOf('Backspace') >= 0, '说明页列了目录快捷键');
  ok(guideKv.indexOf('Ctrl + 1 ~ 6') >= 0, '说明页列了段落 / 标题快捷键（Typora 那套）');
  ok(guideKv.indexOf('点画布空白') >= 0, '说明页讲了连续书写');
  ok(view.drawerEl.textContent.indexOf('右键菜单') >= 0, '说明页讲了右键菜单');
  click(navOf('编辑器'));
  ok(view.drawerPage === 'editor', '点「编辑器」子页');
  ok(view.drawerEl.querySelectorAll('.vwb-mode').length === 3, '编辑器页有 3 种书写方式可选');
  ok(view.drawerEl.textContent.indexOf('即时渲染（默认）') >= 0, '默认书写方式标了「（默认）」');
  click(view.drawerEl.querySelectorAll('.vwb-mode')[1]);
  ok(plugin.settings.editor.mode === 'split', '在设置里切到双栏分屏');
  click(view.drawerEl.querySelectorAll('.vwb-mode')[0]);
  ok(plugin.settings.editor.mode === 'live', '切回即时渲染');
  view.drawerPage = 'appearance';
  view.toggleDrawer(false);

  // 文件区底部不再堆长文案
  view.render();
  ok(view.hintEl.textContent === '', '文件区底部不再堆操作说明（红框里那堆）');
  ok(view.hintEl.style.display === 'none', '底部提示条已隐藏');

  console.log('\n[17] 文件区右键菜单 + 列表模式「就地展开」（v0.8.0 问题 4 / 5）');
  await view.closePreview();
  view.expandedFolders = new Set();
  view.mode = 'list';
  view.goTo('');
  ok(view.areaEl && !!view.areaEl.querySelector('.vwb-row'), '列表模式渲染出文件区行');

  // —— 点 ▸ 就地看文件夹里有什么；点名字才进下一级
  const rowOf1 = (t) => find(view.areaEl, '.vwb-row', t);
  ok(!!rowOf1('01-学习'), '有「01-学习」文件夹行');
  const c1 = rowOf1('01-学习').querySelector('.vwb-caret');
  ok(!!c1 && c1.textContent === '▸', '文件夹行前面有 ▸ 展开按钮');
  click(c1);
  ok(view.folderPath === '', '点 ▸ 只是就地展开，不会进入这个目录');
  ok(view.expandedFolders.has('01-学习'), '展开状态记下来了');
  ok(!!rowOf1('1.1-学习方法论'), '展开后直接看到里面的子文件夹');
  ok(rowOf1('1.1-学习方法论').classList.contains('is-child'), '子层缩进显示（is-child）');
  click(rowOf1('1.1-学习方法论').querySelector('.vwb-caret'));
  ok(!!rowOf1('费曼检验'), '再展开一层 → 看到里面的笔记（递归展开）');
  click(rowOf1('01-学习').querySelector('.vwb-caret'));
  ok(!view.expandedFolders.has('01-学习'), '再点一次收起');
  ok(!rowOf1('1.1-学习方法论'), '收起后子层不再显示');
  click(rowOf1('01-学习'));
  ok(view.folderPath === '01-学习', '点文件夹名字才是进下一级');

  // —— 右键菜单：文件夹
  let copiedPath = '';
  Object.defineProperty(global, 'navigator', {
    value: { clipboard: { writeText: (t) => { copiedPath = t; } } },
    configurable: true
  });
  app.__abs = {
    '01-学习': { path: '01-学习', name: '01-学习' },
    '02-工作/周报模板.md': { path: '02-工作/周报模板.md', name: '周报模板.md' }
  };
  view.goTo('');
  const menuOf = () => view.contentEl.querySelector('.vwb-ctx');
  const mi = (m, t) => Array.from(m.querySelectorAll('.vwb-ctx-i'))
    .find((n) => n.textContent.indexOf(t) >= 0);
  const menuOn = (el) => fire(el, 'contextmenu', { clientX: 40, clientY: 40 });

  menuOn(rowOf1('01-学习'));
  let fm = menuOf();
  ok(!!fm, '文件夹行右键弹出菜单（挂在主区里，不会被列表裁掉）');
  ok(!!mi(fm, '进入这个文件夹') && !!mi(fm, '在这里新建笔记'), '文件夹菜单：进入 / 在这里新建笔记');
  ok(!!mi(fm, '重命名文件夹') && !!mi(fm, '删除文件夹'), '文件夹菜单：重命名 / 删除');
  click(mi(fm, '复制路径'));
  await sleep(20);
  // ⚠ textContent 是递归的：has-sub 行的文本包含整个子菜单，得用子选择器精确定位子项
  const subAbs = Array.from(fm.querySelectorAll('.vwb-ctx-sub .vwb-ctx-i'))
    .find((n) => n.textContent.indexOf('绝对路径') >= 0);
  ok(!!subAbs, '「复制路径」展开子菜单（URI / 相对路径 / 绝对路径）');
  click(subAbs);
  await sleep(20);
  ok(copiedPath === VAULT + '/01-学习', '子菜单「绝对路径」复制的是完整磁盘路径，实际 ' + copiedPath);

  menuOn(rowOf1('01-学习'));
  click(mi(menuOf(), '重命名文件夹'));
  await sleep(30);
  ok(app.__renamed === '01-学习', '「重命名」交给 Obsidian 自己的重命名弹窗（会一并处理库内链接）');

  menuOn(rowOf1('01-学习'));
  click(mi(menuOf(), '删除文件夹'));
  await sleep(30);
  ok(app.__trashed === '01-学习', '「删除文件夹」走 Obsidian 的删除通道（按用户的回收站设置走）');

  // —— 右键菜单：文件
  view.goTo('02-工作');
  const fileRow = rowOf1('周报模板');
  ok(!!fileRow, '进入 02-工作 后看到文件行');
  menuOn(fileRow);
  fm = menuOf();
  ok(!!mi(fm, '在右侧面板预览') && !!mi(fm, '在 Obsidian 中打开'), '文件菜单：面板预览 / 在 Obsidian 中打开');
  ok(!!mi(fm, '复制路径') && !!mi(fm, '在资源管理器中显示'), '文件菜单：复制路径 / 在资源管理器中显示');
  click(mi(fm, '删除文件'));
  await sleep(30);
  ok(app.__trashed === '02-工作/周报模板.md', '「删除文件」触发删除，实际 ' + app.__trashed);

  // —— 网格模式下也一样能右键（文件夹卡片 / 文件卡片）
  view.mode = 'grid';
  view.goTo('');
  menuOn(find(view.areaEl, '.vwb-card', '02-工作'));
  ok(!!menuOf(), '网格模式的文件夹卡片也能右键');
  view.goTo('02-工作');
  menuOn(find(view.areaEl, '.vwb-card', '周报模板'));
  ok(!!menuOf(), '网格模式的文件卡片也能右键');
  view.closeEditorMenu();
  view.mode = plugin.settings.view.mode; // 还原成设置里的默认视图
  view.goTo('');

  // —— 外部库只读：重命名 / 删除 / 新建都置灰
  const realDiscover = plugin.discoverVaults;
  const realIndex = plugin.indexOf;
  plugin.discoverVaults = () => [{ id: VAULT, name: 'MyVault', path: VAULT, current: false, source: 'auto' }];
  plugin.indexOf = () => ({ files: FILES, external: true });
  const groups = view.itemMenuGroups(FILES[0], 'file');
  const flat = groups.reduce((a, g) => a.concat(g.items), []);
  ok(flat.filter((i) => i.id === 'rename' || i.id === 'delete').every((i) => i.disabled),
    '外部库的文件：重命名 / 删除都置灰');
  const fgroups = view.itemMenuGroups({ name: '01-学习', path: '01-学习', count: 2 }, 'folder');
  const fflat = fgroups.reduce((a, g) => a.concat(g.items), []);
  ok(fflat.filter((i) => i.id === 'rename' || i.id === 'delete' || i.id === 'new-note').every((i) => i.disabled),
    '外部库的文件夹：新建 / 重命名 / 删除都置灰（外部库只读）');
  plugin.discoverVaults = realDiscover;
  plugin.indexOf = realIndex;

  console.log('\n[18] 拖选复制 / 复制链接双链 / 批量多选 / 新建下拉（v0.9.0）');

  let copied = '';
  Object.defineProperty(global, 'navigator', {
    value: { clipboard: { writeText: (t) => { copied = String(t); } } },
    configurable: true
  });

  // —— 问题 3①：单画布里拖选正文，点击不该把它变成「要编辑这一段」
  const docNote = FILES.find((f) => f.relPath === '五步学习闭环.md');
  plugin.settings.editor.mode = 'live';
  docText = '# 测试标题\n\n正文内容';
  await view.openPreview(docNote, { expand: true });
  view.setDocMode('edit');
  await sleep(80);
  ok(view.docMode === 'edit' && !!view.canvasEl, '进入即时渲染编辑态');
  const blkA = view.blockEls[0];
  ok(!!blkA, '画布渲染出第一块');

  setSel('一段被拖选出来的正文');
  view.onBlockClick({ target: blkA }, 0);
  await sleep(40);
  ok(view.editingBlock === null, '有选区时点击不会被当成「要编辑这一段」（选区保住了）');
  setSel('');
  view.onBlockClick({ target: blkA }, 0);
  await sleep(60);
  ok(view.editingBlock === 0, '没选区时点击照常进入这一段编辑');
  await view.commitBlock();

  // —— 问题 3②：「复制选中文本」优先用浏览器选区，且不会顺手进编辑态
  copied = '';
  setSel('要被复制的文字');
  await view.runEditorCmd('copy-sel', { ta: null, blockIdx: 0, live: true });
  ok(copied === '要被复制的文字', '「复制选中文本」把画布选区复制走，实际 ' + JSON.stringify(copied));
  ok(view.editingBlock === null, '复制选区不会顺手把这一段带进编辑态');

  setSel('');
  copied = '';
  await view.runEditorCmd('copy-block', { blockIdx: 0 });
  ok(copied === '# 测试标题', '「复制这一段的原文」给的是这一段的 Markdown，实际 ' + JSON.stringify(copied));

  copied = '';
  await view.runEditorCmd('copy-all', {});
  await sleep(20);
  ok(copied === '# 测试标题\n\n正文内容', '「复制整篇 Markdown」拿到源码真源，实际 ' + JSON.stringify(copied));

  // —— 问题 3③：阅读态也要能复制
  view.setDocMode('read');
  await sleep(60);
  ok(view.docMode === 'read' && !view.editorEl, '回到阅读态');
  const bodyEl = view.prevBodyEl;
  setSel('');
  fire(bodyEl, 'contextmenu', { clientX: 20, clientY: 20 });
  let rmenu = view.prevEl.querySelector('.vwb-ctx');
  ok(!!rmenu, '阅读态正文右键弹出菜单');
  ok(!find(rmenu, '.vwb-ctx-i', '复制选中文本'), '没选区时「复制选中文本」自动隐藏（不留空分隔线）');
  view.closeEditorMenu();

  setSel('正文里选中的一句话');
  fire(bodyEl, 'contextmenu', { clientX: 20, clientY: 20 });
  rmenu = view.prevEl.querySelector('.vwb-ctx');
  ok(!!find(rmenu, '.vwb-ctx-i', '复制选中文本'), '有选区时出现「复制选中文本」');
  copied = '';
  click(find(rmenu, '.vwb-ctx-i', '复制选中文本'));
  await sleep(20);
  ok(copied === '正文里选中的一句话', '阅读态把选中的正文复制走');

  setSel('');
  fire(bodyEl, 'contextmenu', { clientX: 20, clientY: 20 });
  rmenu = view.prevEl.querySelector('.vwb-ctx');
  copied = '';
  click(find(rmenu, '.vwb-ctx-i', '复制整篇 Markdown'));
  await sleep(30);
  ok(copied === '# 测试标题\n\n正文内容', '阅读态「复制整篇 Markdown」可用');
  fire(bodyEl, 'contextmenu', { clientX: 20, clientY: 20 });
  rmenu = view.prevEl.querySelector('.vwb-ctx');
  copied = '';
  click(find(rmenu, '.vwb-ctx-i', '复制文件路径'));
  await sleep(20);
  ok(copied === '五步学习闭环.md', '阅读态「复制文件路径」可用，实际 ' + copied);
  view.closeEditorMenu();
  await view.closePreview();

  // —— 问题 1①：右键复制 Obsidian 链接 / 内部双链
  view.mode = 'list';
  view.goTo('');
  const rowIn = (t) => find(view.areaEl, '.vwb-row', t);
  menuOn(rowIn('01-学习'));
  copied = '';
  click(mi(menuOf(), '复制文件夹链接'));
  await sleep(20);
  ok(copied.indexOf('obsidian://open?vault=MyVault&file=') === 0,
    '「复制文件夹链接」给的是 obsidian:// 协议链接，实际 ' + copied);

  menuOn(rowIn('01-学习'));
  copied = '';
  click(mi(menuOf(), '复制内部双链（含子笔记）'));
  await sleep(20);
  const linkLines = copied.split('\n');
  ok(linkLines.length === 3 && linkLines.indexOf('[[01-学习/1.2-工具链/Excalidraw 上手]]') >= 0,
    '「复制内部双链」把文件夹里 3 篇笔记的双链都列出来，实际 ' + JSON.stringify(copied));

  view.goTo('02-工作');
  menuOn(rowIn('周报模板'));
  copied = '';
  click(mi(menuOf(), '复制内部双链'));
  await sleep(20);
  ok(copied === '[[02-工作/周报模板]]', '文件的「复制内部双链」给的是 [[路径]]，实际 ' + copied);
  view.goTo('');

  // —— 问题 2①：右键「在这里新建笔记」变成二级菜单，两种落点
  menuOn(rowIn('01-学习'));
  const nnParent = mi(menuOf(), '在这里新建笔记');
  ok(nnParent.classList.contains('has-sub'), '「在这里新建笔记」现在带子菜单');
  const nnSub = nnParent.querySelector('.vwb-ctx-sub');
  const nnSubItems = Array.from(nnSub.querySelectorAll('.vwb-ctx-i'));
  ok(nnSubItems.length === 2, '子菜单两项');
  ok(nnSubItems.map((n) => n.textContent).join('|').indexOf('在工作台内编辑') >= 0,
    '子菜单第 1 项 = 在工作台内新建');
  ok(nnSubItems.map((n) => n.textContent).join('|').indexOf('Obsidian 原生编辑器') >= 0,
    '子菜单第 2 项 = 用 Obsidian 原生编辑器新建');

  app.__created = null;
  click(nnSubItems[0]);
  await sleep(80);
  ok(app.__created === '01-学习/未命名.md', '「在工作台内编辑」建在右击的那个文件夹里，实际 ' + app.__created);
  ok(view.docMode === 'edit' && !!view.selectedNote && view.selectedNote.relPath === '01-学习/未命名.md',
    '建完直接在工作台内进编辑态');

  view.goTo('');
  menuOn(rowIn('01-学习'));
  const nnSub2 = mi(menuOf(), '在这里新建笔记').querySelector('.vwb-ctx-sub');
  const natRow = Array.from(nnSub2.querySelectorAll('.vwb-ctx-i'))
    .find((n) => n.textContent.indexOf('Obsidian 原生编辑器') >= 0);
  app.workspace.getLeaf = () => ({
    openFile: async (f) => { app.__openedNative = f && f.path; }
  });
  app.__created = null;
  app.__openedNative = null;
  click(natRow);
  await sleep(60);
  ok(app.__created === '01-学习/未命名 2.md', '「用 Obsidian 原生编辑器」同样落在那个文件夹，实际 ' + app.__created);
  ok(app.__openedNative === '01-学习/未命名 2.md', '建完交给 Obsidian 打开（不是工作台内编辑态）');
  await view.closePreview();

  // —— 问题 2②：工具条「＋ 新建」下拉 = 新建文件 / 新建文件夹
  const nBtn = find(view.mainEl, '.vwb-newmenu .vwb-menu-btn');
  ok(!!nBtn, '工具条上有「＋ 新建」按钮');
  const nPop = () => view.mainEl.querySelector('.vwb-newmenu-pop');
  const openNewMenu = () => {
    if (!nPop().classList.contains('is-on')) click(nBtn);
    return nPop();
  };
  let nPopEl = openNewMenu();
  ok(nPopEl.classList.contains('is-on'), '点一下展开「＋ 新建」下拉');
  const nLabels = Array.from(nPopEl.querySelectorAll('.vwb-menu-i')).map((n) => n.textContent).join('|');
  ok(nLabels.indexOf('新建文件') >= 0 && nLabels.indexOf('新建文件夹') >= 0,
    '下拉里是「新建文件 / 新建文件夹」，实际 ' + nLabels);

  view.folderPath = '02-工作';
  view.renderNewMenu();
  app.__createdFolder = null;
  click(Array.from(nPop().querySelectorAll('.vwb-menu-i')).find((n) => n.textContent.indexOf('新建文件夹') >= 0));
  await sleep(40);
  ok(app.__createdFolder === '02-工作/新建文件夹', '「新建文件夹」建在当前所在目录，实际 ' + app.__createdFolder);
  ok(!view.newMenuOpen, '选完自动收起下拉');

  view.folderPath = '';
  openNewMenu();
  app.__created = null;
  click(Array.from(nPop().querySelectorAll('.vwb-menu-i')).find((n) => n.textContent.indexOf('新建文件') >= 0));
  await sleep(80);
  ok(app.__created === '未命名.md', '「新建文件」建在当前目录（这里是库根），实际 ' + app.__created);
  await view.closePreview();

  // —— 「＋ 新建」下拉：不能冲出主区右边界（冲出去会被裁掉，下面的文件区还会接走点击）
  view.folderPath = '';
  view.newMenuOpen = true;
  view.renderNewMenu();
  const rectOf = (el, r) => { el.getBoundingClientRect = () => r; };
  rectOf(view.mainEl, { left: 300, right: 560, top: 0, bottom: 520, width: 260, height: 520 });
  rectOf(view.newMenuWrapEl, { left: 480, right: 552, top: 20, bottom: 48, width: 72, height: 28 });
  view.placeNewMenu();
  const npEl = view.newMenuPopEl;
  const px = (v) => Number(String(v).replace('px', ''));
  const npW = px(npEl.style.width);
  const npLeft = px(npEl.style.left);
  ok(npEl.style.right === 'auto', '窄主区下改成用 left 定位（不再固定贴右边）');
  ok(npW === 244, '弹层宽度收进主区（260 - 两侧 8px 内边距），实际 ' + npW);
  ok(480 + npLeft >= 300 + 8 - 0.5 && 480 + npLeft + npW <= 560 - 8 + 0.5,
    '弹层整块留在主区里（左 ' + (480 + npLeft) + ' 右 ' + (480 + npLeft + npW) + '，主区 308~552）');

  rectOf(view.mainEl, { left: 300, right: 1200, top: 0, bottom: 520, width: 900, height: 520 });
  view.placeNewMenu();
  ok(px(view.newMenuPopEl.style.width) === 268 && px(view.newMenuPopEl.style.left) === 0,
    '主区够宽时回到默认：268 宽、贴按钮右边缘（left:0）');

  // 工具条必须压在内容行之上 —— 否则弹层被统计卡 / 文件卡盖住，点击也会被下面那层接走
  const cssText = require('fs').readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
  const topbarCss = (cssText.match(/\.vwb-topbar\s*\{[\s\S]*?\}/g) || []).pop() || '';
  ok(/position:\s*relative/.test(topbarCss) && /z-index:\s*[1-9]/.test(topbarCss),
    '工具条自带层叠上下文（position: relative + z-index），下拉才盖得住文件区');
  const newPopCss = (cssText.match(/\.vwb-newmenu-pop\s*\{[\s\S]*?\}/g) || []).pop() || '';
  ok(/right:\s*0/.test(newPopCss) && /left:\s*auto/.test(newPopCss),
    '「＋ 新建」弹层默认贴按钮右边缘展开，不往右冲出主区');
  view.newMenuOpen = false;
  view.renderNewMenu();

  // —— 问题 1②：Ctrl / Shift 多选 + 批量操作条
  view.goTo('01-学习');
  let rowsNow = view.areaEl.querySelectorAll('.vwb-row');
  fire(rowsNow[0], 'click', { ctrlKey: true });
  await sleep(30);
  ok(view.multiSel.size === 1, 'Ctrl + 点 = 加进多选，实际 ' + view.multiSel.size);
  ok(view.folderPath === '01-学习', 'Ctrl + 点不会顺手进目录');
  ok(!!view.areaEl.querySelector('.vwb-batch'), '文件区顶部出现批量操作条');
  rowsNow = view.areaEl.querySelectorAll('.vwb-row');
  fire(rowsNow[1], 'click', { ctrlKey: true });
  await sleep(30);
  ok(view.multiSel.size === 2, '再加一项 → 多选 2 项');
  ok(!!find(view.areaEl, '.vwb-batch-n', '已选 2 项'), '操作条上的计数跟着走');

  view.clearMulti();
  await sleep(30);
  ok(view.multiSel.size === 0 && !view.areaEl.querySelector('.vwb-batch'), '「清空选择」把操作条收掉');

  /* 取行要按名字取，不要按下标 —— 库里有空文件夹时下标会整体挪位 */
  const rowNamed = (t) => Array.from(view.areaEl.querySelectorAll('.vwb-row'))
    .filter((n) => n.textContent.indexOf(t) >= 0)[0];

  view.goTo('');
  fire(rowNamed('01-学习'), 'click', { ctrlKey: true });
  await sleep(30);
  fire(rowNamed('90-专题研究'), 'click', { shiftKey: true });
  await sleep(30);
  ok(view.multiSel.size === 3, 'Shift + 点一次连选 3 项，实际 ' + view.multiSel.size);

  copied = '';
  click(find(view.areaEl, '.vwb-batch .vwb-btn', '复制路径'));
  await sleep(30);
  const batchPaths = copied.split('\n');
  ok(batchPaths.length === 3, '批量「复制路径」一次给 3 条，实际 ' + batchPaths.length);
  ok(batchPaths.every((p) => p.indexOf(VAULT + '/') === 0), '每条都是完整磁盘路径');

  // —— 批量移动：浮层列出全库文件夹，走 renameFile（库内双链会一并更新）
  app.__abs = {
    '01-学习': { path: '01-学习' },
    '02-工作': { path: '02-工作' },
    '90-专题研究': { path: '90-专题研究' }
  };
  click(find(view.areaEl, '.vwb-batch .vwb-btn', '移动…'));
  await sleep(30);
  const mv = view.mainEl.querySelector('.vwb-move');
  ok(!!mv, '「移动…」弹出文件夹选择浮层');
  const mvLabels = Array.from(mv.querySelectorAll('.vwb-move-i')).map((n) => n.textContent).join('|');
  ok(mvLabels.indexOf('库根目录') >= 0 && mvLabels.indexOf('1.1-学习方法论') >= 0, '浮层里列全了库里的文件夹');
  app.__movedAll = [];
  click(Array.from(mv.querySelectorAll('.vwb-move-i')).find((n) => n.textContent.indexOf('02-工作') >= 0));
  await sleep(60);
  const movedTo = (app.__movedAll || []).map((x) => x[1]);
  ok(movedTo.indexOf('02-工作/01-学习') >= 0 && movedTo.indexOf('02-工作/90-专题研究') >= 0,
    '批量移动走 Obsidian 的 renameFile，实际 ' + JSON.stringify(movedTo));
  ok(movedTo.indexOf('02-工作/02-工作') < 0, '不会把文件夹搬进它自己里面（自动跳过）');
  ok(view.multiSel.size === 0 && !view.mainEl.querySelector('.vwb-move'), '移动完自动收摊：清空多选、关掉浮层');

  // —— 批量删除：先按一下「删除」，再确认
  app.__abs = { '01-学习': { path: '01-学习' } };
  view.goTo('');
  fire(rowNamed('01-学习'), 'click', { ctrlKey: true });
  await sleep(30);
  click(find(view.areaEl, '.vwb-batch .vwb-btn', '删除'));
  await sleep(30);
  ok(view.batchDelArm, '批量删除要按两下：第一下只是进入待确认态');
  const confirmBtn = Array.from(view.areaEl.querySelectorAll('.vwb-batch .vwb-btn'))
    .find((n) => n.textContent.indexOf('确认删除') >= 0);
  ok(!!confirmBtn, '按钮变成「确认删除 N 项」');
  app.__trashed = null;
  click(confirmBtn);
  await sleep(60);
  ok(app.__trashed === '01-学习', '再点一下才真的删，实际 ' + app.__trashed);
  ok(view.multiSel.size === 0, '删完自动清空多选');
  view.goTo('');

  console.log('\n[19] 空文件夹 / 根目录文件归属（v0.9.2）');
  app.__abs = null;
  view.mode = 'grid';
  view.goTo('');
  view.render();
  const cardsNow = () => Array.from(view.areaEl.querySelectorAll('.vwb-card'));
  const cardTexts = () => cardsNow().map((n) => n.textContent);
  const cardByText = (t) => cardsNow().filter((n) => n.textContent.indexOf(t) >= 0)[0];

  ok(cardTexts().length > 0 && cardTexts().join('|').indexOf('00-收集箱') >= 0,
    '笔记数为 0 的空文件夹也出现在文件区（以前完全不出现），实际 ' + JSON.stringify(cardTexts()));
  ok(cardByText('00-收集箱').textContent.indexOf('空文件夹') >= 0,
    '空文件夹标注「空文件夹」而不是「0 篇」，实际 ' + cardByText('00-收集箱').textContent);
  ok(!!cardByText('五步学习闭环'),
    '库根下的 .md 作为文件出现（以前被塞进一个没有名字的文件夹），实际 ' + JSON.stringify(cardTexts()));
  ok(!cardsNow().some((n) => n.getAttribute('data-path') === '' ||
    (n.querySelector('.vwb-card-nm') && !n.querySelector('.vwb-card-nm').textContent)),
  '没有「没有名字」的文件夹卡片（库根 "/" 不是文件夹名）');

  view.goTo('01-学习');
  ok(cardByText('1.3-空目录') !== undefined, '进到 01-学习 里，空的子文件夹也在（1.3-空目录）');
  ok(!!cardByText('1.1-学习方法论'), '有笔记的文件夹照旧按「N 篇」显示');

  view.goTo('01-学习/1.3-空目录');
  ok(!!find(view.areaEl, '.vwb-empty', '这个文件夹是空的'), '钻进空文件夹给一句「这个文件夹是空的」');

  // —— 列表模式：展开空文件夹不能看起来像「点了没反应」
  view.mode = 'list';
  view.goTo('');
  view.render();
  ok(rowNamed('00-收集箱').textContent.indexOf('空文件夹') >= 0, '列表行上也写「空文件夹」');
  click(rowNamed('00-收集箱').querySelector('.vwb-caret'));
  await sleep(30);
  ok(view.folderPath === '', '展开只是看一眼，不会进目录');
  ok(!!find(view.areaEl, '.vwb-row-tip', '这个文件夹是空的'),
    '展开空文件夹时给一行「（这个文件夹是空的）」');

  // —— 空文件夹上右键：菜单照旧可用，新建笔记落在它里面
  view.mode = 'grid';
  view.goTo('');
  view.render();
  fire(cardByText('00-收集箱'), 'contextmenu', { clientX: 20, clientY: 20 });
  const emptyMenu = view.contentEl.querySelector('.vwb-ctx');
  ok(!!emptyMenu, '空文件夹上右键也能弹菜单');
  const newNoteSub = Array.from(emptyMenu.querySelectorAll('.vwb-ctx-sub .vwb-ctx-i'))
    .filter((n) => n.textContent.indexOf('在工作台内编辑') >= 0)[0];
  ok(!!newNoteSub, '菜单里有「在这里新建笔记 → 在工作台内编辑」');
  app.__created = null;
  click(newNoteSub);
  await sleep(40);
  ok(app.__created === '00-收集箱/未命名.md',
    '在空文件夹里新建笔记落在它里面，实际 ' + app.__created);
  app.__createdSet = null;

  // —— 新建文件夹：建完立刻看得见（以前建完在文件区根本找不到它）
  app.__createdFolder = null;
  view.goTo('');
  await view.createFolder();
  await sleep(20);
  ok(app.__createdFolder === '新建文件夹', '新建文件夹落在当前目录（库根），实际 ' + app.__createdFolder);
  view.render();
  ok(cardTexts().join('|').indexOf('新建文件夹') >= 0,
    '刚建出来的空文件夹立刻出现在文件区，实际 ' + JSON.stringify(cardTexts()));

  console.log('\n[20] 外部库扫描：空目录 / 点开头的条目（v0.9.2）');
  const extRoot = path.join(tmpDir, 'ext2');
  const mkdirIn = (rel) => {
    const d = path.join(extRoot, rel);
    if (!fsm.existsSync(d)) fsm.mkdirSync(d, { recursive: true });
  };
  mkdirIn('visible');
  mkdirIn('空目录');
  mkdirIn('visible/深层空目录');
  mkdirIn('.hidden');
  fsm.writeFileSync(path.join(extRoot, 'visible', 'b.md'), '# b');
  fsm.writeFileSync(path.join(extRoot, '.hidden', 'a.md'), '# a');
  fsm.writeFileSync(path.join(extRoot, '根笔记.md'), '# 根');
  plugin.externalCache = {};
  const extIdx = plugin.getExternalIndex(extRoot);
  const extPaths = extIdx.files.map((f) => f.relPath);
  ok(extPaths.indexOf('visible/b.md') >= 0 && extPaths.indexOf('根笔记.md') >= 0,
    '外部库正常列出笔记，实际 ' + JSON.stringify(extPaths));
  ok(extPaths.indexOf('.hidden/a.md') < 0, '点开头的目录不扫（Obsidian 自己也忽略它们）');
  const extFolderPaths = extIdx.folders.map((f) => f.path);
  ok(extFolderPaths.indexOf('空目录') >= 0 && extFolderPaths.indexOf('visible/深层空目录') >= 0,
    '外部库的空目录也进文件夹清单（以前只收「有文件的目录」），实际 ' + JSON.stringify(extFolderPaths));
  ok(extFolderPaths.indexOf('.hidden') < 0, '点开头的目录不进清单');

  const extPart = view.partitionNotes(extIdx.files, '', extIdx.folders);
  const extEmpty = extPart.folders.filter((f) => f.path === '空目录')[0];
  ok(!!extEmpty && extEmpty.count === 0, '外部库的空文件夹 count=0（渲染成「空文件夹」），实际 ' + JSON.stringify(extEmpty));
  const extVisible = extPart.folders.filter((f) => f.path === 'visible')[0];
  ok(!!extVisible && extVisible.count === 1, '「N 篇」仍然算整棵子树，实际 ' + JSON.stringify(extVisible));
  ok(!extPart.files.some((f) => f.relPath === 'visible/b.md'), '子目录里的笔记不会混进本层文件列表');
  ok(extPart.files.length === 1 && extPart.files[0].relPath === '根笔记.md',
    '外部库根目录下的笔记算「本层文件」，实际 ' + JSON.stringify(extPart.files.map((f) => f.relPath)));

  console.log('\n[21] 库切换与跨机器可移植（v0.10.0）');
  const H = mod.helpers;
  const nrm = (p) => String(p).replace(/\\/g, '/');
  const noticeTail = () => stubMod.notices[stubMod.notices.length - 1] || '';

  // 1) 平台目录：不写死 %APPDATA%，mac / Linux 也找得到 obsidian.json
  ok(!!H.appDataDir(), '配置目录按系统取，拿得到：' + H.appDataDir());
  ok(nrm(H.obsidianConfigPath()).indexOf('obsidian/obsidian.json') > 0,
    'obsidian.json = 配置目录 + obsidian/obsidian.json，实际 ' + H.obsidianConfigPath());
  ok(nrm(H.sharedVaultsPath()).indexOf('vault-hub/vaults.json') > 0,
    '全局库清单路径，实际 ' + H.sharedVaultsPath());

  // 2) 版本号：0.10.0 必须比 0.9.2 新（按字符串比会翻车）
  ok(H.cmpVer('0.10.0', '0.9.2') === 1, '版本号 0.10.0 > 0.9.2（不是按字符串比）');
  ok(H.cmpVer('0.9.2', '0.10.0') === -1, '0.9.2 < 0.10.0');
  ok(H.cmpVer('0.9.2', '0.9.2') === 0, '同版本相等');
  ok(H.cmpVer('1.0.0', '0.99.0') === 1, '1.0.0 > 0.99.0');

  // 3) 切库链接：用路径不用库名
  const uriWin = H.vaultOpenUri('D:\\我的库\\工作 库');
  ok(uriWin.indexOf('obsidian://open?path=') === 0, '切库链接用 path，实际 ' + uriWin);
  ok(uriWin.indexOf('vault=') < 0, '不用 ?vault= 库名（同名文件夹会跳错库 / 凭空建空库）');
  ok(uriWin.indexOf('\\') < 0, '反斜杠统一成 /，实际 ' + uriWin);
  ok(uriWin.indexOf('%') > 0, '中文 / 空格都编码过，实际 ' + uriWin);
  const uriMac = H.vaultOpenUri('/Users/me/My Vault');
  ok(uriMac.indexOf('/Users/me/My%20Vault') > 0,
    'mac 路径只编码空格、斜杠保留可读，实际 ' + uriMac);
  ok(H.vaultOpenUri('') === '', '空路径不给链接');

  // 4) 磁盘错误要说人话（换台机器大概率就是权限 / 只读盘）
  ok(H.fsErrorText({ code: 'EACCES' }, '写库').indexOf('权限') > 0, 'EACCES → 提示没有权限');
  ok(H.fsErrorText({ code: 'EROFS' }, '写库').indexOf('只读') > 0, 'EROFS → 提示只读');
  ok(H.fsErrorText({ code: 'ENOENT' }, '写库').indexOf('不存在') > 0, 'ENOENT → 提示路径不存在');
  ok(H.fsErrorText({ code: 'WAT' }, '写库').indexOf('WAT') > 0, '认不出的错误至少把原文带上');
  ok(H.isCloudSyncedPath('C:/Users/x/Dropbox/笔记'), '认得出 Dropbox 目录');
  ok(!H.isCloudSyncedPath('D:/Obsidian/主库'), '普通目录不算云同步');

  // 5) 自部署：把工作台装进另一个库
  const dep = path.join(tmpDir, 'deploy');
  fsm.rmSync(dep, { recursive: true, force: true });
  const srcDir = path.join(dep, 'src');
  const tgt = path.join(dep, '目标库');
  fsm.mkdirSync(srcDir, { recursive: true });
  fsm.mkdirSync(path.join(tgt, '.obsidian'), { recursive: true });
  fsm.writeFileSync(path.join(srcDir, 'main.js'), '// main');
  fsm.writeFileSync(path.join(srcDir, 'styles.css'), '/* css */');
  const setSrcVer = (v) => fsm.writeFileSync(
    path.join(srcDir, 'manifest.json'),
    JSON.stringify({ id: 'vault-hub', version: v })
  );
  setSrcVer('0.10.0');
  const deployOpts = (vaultPath) => ({
    pluginId: 'vault-hub', srcDir, vaultPath, settings: { view: { mode: 'grid' } }
  });

  const d1 = H.deployWorkbenchToVault(deployOpts(tgt));
  ok(d1.ok && d1.changed, '首次自部署成功，实际 ' + JSON.stringify(d1));
  const tgtPlug = path.join(tgt, '.obsidian', 'plugins', 'vault-hub');
  ok(fsm.existsSync(path.join(tgtPlug, 'main.js')), 'main.js 复制进目标库了');
  ok(fsm.existsSync(path.join(tgtPlug, 'styles.css')), 'styles.css 也过去了');
  ok(fsm.existsSync(path.join(tgtPlug, 'data.json')), '第一次装把设置也带过去（库导航 / 外观一致）');
  const cpl1 = H.readJsonFile(path.join(tgt, '.obsidian', 'community-plugins.json'), null);
  ok(Array.isArray(cpl1) && cpl1.indexOf('vault-hub') >= 0,
    '目标库的插件清单里登记了工作台，实际 ' + JSON.stringify(cpl1));

  const d2 = H.deployWorkbenchToVault(deployOpts(tgt));
  ok(d2.ok && !d2.changed, '同版本再装一次：什么都不动，实际 ' + JSON.stringify(d2));

  setSrcVer('0.10.1');
  const d3 = H.deployWorkbenchToVault(deployOpts(tgt));
  ok(d3.ok && d3.changed && d3.from === '0.10.0' && d3.to === '0.10.1',
    '源端更新后会把目标库升上来，实际 ' + JSON.stringify(d3));

  // 目标库比源端还新 → 绝不把新版覆盖成旧版
  fsm.writeFileSync(path.join(tgtPlug, 'manifest.json'),
    JSON.stringify({ id: 'vault-hub', version: '0.11.0' }));
  const d4 = H.deployWorkbenchToVault(deployOpts(tgt));
  ok(d4.ok && !d4.changed, '目标库版本更新 → 不覆盖，实际 ' + JSON.stringify(d4));

  // 老版本 Obsidian 的插件清单是对象格式，别把它弄坏
  const tgt2 = path.join(dep, '老格式库');
  fsm.mkdirSync(path.join(tgt2, '.obsidian'), { recursive: true });
  fsm.writeFileSync(path.join(tgt2, '.obsidian', 'community-plugins.json'),
    JSON.stringify({ dataview: true }));
  H.enablePluginInVault(tgt2, 'vault-hub');
  const cpl2 = H.readJsonFile(path.join(tgt2, '.obsidian', 'community-plugins.json'), null);
  ok(cpl2 && cpl2.dataview === true && cpl2['vault-hub'] === true,
    '对象格式清单：加进去又不破坏原有项，实际 ' + JSON.stringify(cpl2));
  H.enablePluginInVault(tgt2, 'vault-hub');
  const cpl3 = H.readJsonFile(path.join(tgt2, '.obsidian', 'community-plugins.json'), null);
  ok(cpl3 && Object.keys(cpl3).length === 2, '重复登记不会产生重复项，实际 ' + JSON.stringify(cpl3));

  const notVault = path.join(dep, '随便一个文件夹');
  fsm.mkdirSync(notVault, { recursive: true });
  const d5 = H.deployWorkbenchToVault(deployOpts(notVault));
  ok(!d5.ok && d5.reason.indexOf('.obsidian') >= 0,
    '不是 Obsidian 库的文件夹不让装，实际 ' + d5.reason);

  // 6) 插件侧的库状态
  ok(plugin.workbenchStateOf(VAULT).state === 'self', '当前库 = self');
  ok(plugin.workbenchStateOf(path.join(dep, '没装的库')).state === 'none', '没装的库 = none');
  ok(plugin.workbenchStateOf(tgt).state === 'ok', '装好的库 = ok');
  const tgt3 = path.join(dep, '旧版库');
  fsm.mkdirSync(path.join(tgt3, '.obsidian', 'plugins', 'vault-hub'), { recursive: true });
  fsm.writeFileSync(path.join(tgt3, '.obsidian', 'plugins', 'vault-hub', 'manifest.json'),
    JSON.stringify({ id: 'vault-hub', version: '0.8.0' }));
  ok(plugin.workbenchStateOf(tgt3).state === 'stale', '版本更老的库 = stale（切过去时会顺手更新）');

  // 7) 切库顺序：先装后切。这里切不动（Node 里没有窗口），但必须已经装好了
  //    把当前库临时换成一个真·临时库，这样「本插件自己的目录」是真实存在的
  const tgt4 = path.join(dep, '待切库');
  fsm.mkdirSync(path.join(tgt4, '.obsidian'), { recursive: true });
  const homeVault = path.join(dep, '我的当前库');
  const homePlug = path.join(homeVault, '.obsidian', 'plugins', 'vault-hub');
  fsm.mkdirSync(homePlug, { recursive: true });
  for (const f of ['main.js', 'manifest.json', 'styles.css']) {
    fsm.copyFileSync(path.join(srcDir, f), path.join(homePlug, f));
  }
  const savedCurPath = plugin.currentVaultPath;
  plugin.currentVaultPath = () => homeVault;
  const sw = plugin.switchToVault(tgt4);
  ok(fsm.existsSync(path.join(tgt4, '.obsidian', 'plugins', 'vault-hub', 'main.js')),
    '先部署：跳转之前目标库里已经有工作台了');
  ok(sw.ok === false && sw.reason === '跳转失败',
    '跳转失败就不假装成功，实际 ' + JSON.stringify(sw));
  ok(plugin.switchToVault(homeVault).ok === true, '切到自己所在的库：直接成功，不做无谓动作');
  plugin.currentVaultPath = savedCurPath;

  // 8) 手动添加的库：本库设置 + 全局清单各一份
  const regPath = path.join(dep, '共享登记的库');
  plugin.registerVaultPath(regPath);
  ok(plugin.settings.vaults.extra.indexOf(nrm(regPath)) >= 0, '登记写进本库设置');
  const shared1 = H.readJsonFile(H.sharedVaultsPath(), {});
  ok((shared1.extra || []).indexOf(nrm(regPath)) >= 0, '登记同时写进全局清单（切到别的库也还在）');
  plugin.forgetVaultPath(regPath);
  ok(plugin.settings.vaults.extra.indexOf(nrm(regPath)) < 0, '移除：本库设置里删掉');
  const shared2 = H.readJsonFile(H.sharedVaultsPath(), {});
  ok((shared2.extra || []).indexOf(nrm(regPath)) < 0, '移除：全局清单里也删掉（不然切个库它又回来）');

  // 9) 库导航右键菜单
  const grpOf = (v) => view.vaultMenuGroups(v);
  const pickId = (g, id) => g[0].items.filter((i) => i.id === id)[0];
  ok(pickId(grpOf({ current: true, path: VAULT, name: 'MyVault', wb: 'self' }), 'switch').disabled,
    '当前库的「切换到此库」是灰的');
  ok(!pickId(grpOf({ current: false, path: tgt, name: '目标库', wb: 'none' }), 'switch').disabled,
    '别的库可以切过去');
  ok(pickId(grpOf({ current: false, path: tgt, name: '目标库', wb: 'none' }), 'install')
    .label.indexOf('装到') >= 0, '没装的库：按钮是「把工作台装到这个库」');
  ok(pickId(grpOf({ current: false, path: tgt3, name: '旧版库', wb: 'stale', wbVer: '0.8.0' }), 'install')
    .label.indexOf('更新') >= 0, '旧版的库：按钮是「更新」');
  ok(pickId(grpOf({ current: false, path: tgt, name: '好库', wb: 'ok', wbVer: '9.9.9' }), 'install').disabled,
    '已是最新 → 「装工作台」置灰');
  // 只是个普通文件夹（导入的笔记目录之类）→ 不许切、也不许装，别凭空造出一个库
  const plain = { current: false, path: path.join(dep, '只是个文件夹'), name: '导入目录', wb: 'none' };
  ok(pickId(grpOf(plain), 'switch').disabled, '普通文件夹 → 「切换到此库」置灰（不凭空造库）');
  ok(pickId(grpOf(plain), 'install').disabled, '普通文件夹 → 「装工作台」也置灰');
  ok(pickId(grpOf(plain), 'switch').why.indexOf('.obsidian') >= 0,
    '置灰原因说清楚怎么修，实际 ' + pickId(grpOf(plain), 'switch').why);

  // 10) 侧栏：没装 / 旧版的库要有标记
  const savedDiscover = plugin.discoverVaults;
  const savedSel = view.selectedVault;
  plugin.discoverVaults = () => [
    { id: VAULT, name: 'MyVault', path: VAULT, current: true, wb: 'self', isVault: true },
    { id: tgt, name: '没装的库', path: path.join(dep, '没装的库'), current: false, wb: 'none', isVault: true },
    { id: tgt3, name: '旧版库', path: tgt3, current: false, wb: 'stale', wbVer: '0.8.0', isVault: true },
    { id: path.join(dep, '只是个文件夹'), name: '导入目录', path: path.join(dep, '只是个文件夹'),
      current: false, wb: 'none', isVault: false }
  ];
  view.renderRail();
  const badgeText = selectAll(view.railEl, '.vwb-badge').map((e) => e.textContent);
  ok(badgeText.indexOf('未装') >= 0, '侧栏给没装工作台的库标「未装」，实际 ' + JSON.stringify(badgeText));
  ok(badgeText.indexOf('旧版') >= 0, '侧栏给旧版工作台的库标「旧版」，实际 ' + JSON.stringify(badgeText));
  ok(badgeText.indexOf('文件夹') >= 0,
    '侧栏把「只是个文件夹」的条目标「文件夹」（不是库，切不过去），实际 ' + JSON.stringify(badgeText));

  // 11) 外部库做不了的事：提示改成「切过去就能做」
  const ext3 = path.join(dep, '外部库');
  fsm.mkdirSync(path.join(ext3, '.obsidian'), { recursive: true }); // 让它成为一个真正的库（可写）
  plugin.discoverVaults = () => [{ id: ext3, name: '外部库', path: ext3, current: false, wb: 'none' }];
  view.selectedVault = ext3;
  app.__created = null;
  await view.createNote();
  ok(!app.__created, '在外部库里点新建：不会直接建出来（要先让你填名字）');
  // v0.12 起外部库可以改结构了：不再提示「切过去」，而是弹输入框
  const dlg = selectAll(view.contentEl, '.vwb-dlg');
  ok(dlg.length === 1, '弹出输入浮层让你填名字，实际弹了 ' + dlg.length + ' 个');
  ok(view.contentEl.textContent.indexOf('新建笔记') >= 0, '浮层标题说明是在别的库里新建');
  view.closeDialog(dlg[0]);
  // 菜单项不再置灰（重命名 / 删除 / 新建都解锁了）
  const extMenu = view.itemMenuGroups({ relPath: 'a.md', name: 'a.md', ext: '.md' }, 'file');
  const extItems = [].concat.apply([], extMenu.map((g) => g.items));
  ok(!extItems.filter((i) => i.id === 'rename')[0].disabled, '别的库里「重命名」不再是灰的');
  ok(!extItems.filter((i) => i.id === 'delete')[0].disabled, '别的库里「删除」不再是灰的');
  ok(extItems.filter((i) => i.id === 'switch-vault')[0], '外部库的文件菜单里还有「切换到此库」直通车');
  // 「复制 Obsidian 链接」仍然是灰的：跨库的 obsidian:// 链接跳不到别的库的那篇
  ok(extItems.filter((i) => i.id === 'copy-uri')[0].disabled, '「复制链接」仍然置灰（跨库链接跳不过去）');
  plugin.discoverVaults = savedDiscover;
  view.selectedVault = savedSel;
  view.renderRail();

  console.log('\n[22] 跨库全文搜索（v0.11.0）');
  const sdir = path.join(tmpDir, 'search');
  fsm.rmSync(sdir, { recursive: true, force: true });
  const vA = path.join(sdir, '库A');
  const vB = path.join(sdir, '库B');
  fsm.mkdirSync(path.join(vA, 'sub'), { recursive: true });
  fsm.mkdirSync(vB, { recursive: true });
  fsm.writeFileSync(path.join(vA, 'a1.md'),
    '---\ntags: [x]\n---\n\n# 标题\n\n这是**独一无二的关键词** Alpha。\n\n```js\nconst Alpha = 1;\n```\n');
  fsm.writeFileSync(path.join(vA, 'sub', 'a2.md'), '普普通通的内容，没有那个词');
  fsm.writeFileSync(path.join(vB, 'b1.md'), '另一篇里也有 Alpha 这个词');
  fsm.writeFileSync(path.join(vB, 'b2.txt'), 'Alpha 也在纯文本里');
  fsm.writeFileSync(path.join(vB, 'Alpha渗透.pdf'), 'pdf 内容');
  fsm.writeFileSync(path.join(vB, '图.png'), 'not text');
  fsm.writeFileSync(path.join(vA, 'Alpha笔记.md'), '文件名和正文里都有 Alpha');

  // 1) Markdown → 纯文本：只留内容，不留写法
  const plainTxt = H.mdToPlainText(fsm.readFileSync(path.join(vA, 'a1.md'), 'utf8'));
  ok(plainTxt.indexOf('tags') < 0, '纯文本里没有 frontmatter（搜 tags 不该命中每篇）');
  ok(plainTxt.indexOf('const Alpha') < 0, '纯文本里没有代码块（搜代码不该命中正文）');
  ok(plainTxt.indexOf('**') < 0, '加粗星号去掉了，实际 ' + JSON.stringify(plainTxt));
  ok(plainTxt.indexOf('独一无二的关键词') >= 0, '正文内容保留下来了');
  ok(plainTxt.indexOf('# 标题') < 0 && plainTxt.indexOf('标题') >= 0, '标题符号去掉、文字保留');
  ok(H.mdToPlainText('[[路径/笔记|别名]]').indexOf('别名') >= 0, '[[路径|别名]] 取别名');
  ok(H.mdToPlainText('[文字](http://x.com/a)').indexOf('http') < 0, 'Markdown 链接丢掉 URL、留文字');
  ok(!H.isSearchable('.png') && H.isSearchable('.md') && H.isSearchable('.txt'),
    '只有 md / txt 进索引，图片不进');

  // 2) 索引：首次建 → 增量复用 → 删除失效条目
  const filesA = (plugin.indexOf(vA).files || []).filter((f) => H.isSearchable(f.ext));
  ok(filesA.length === 3, '库A 有 3 篇可索引的文本，实际 ' + filesA.length);
  const r1 = H.refreshSearchIndex(vA, filesA);
  ok(r1.read === 3, '首次建索引读了 3 篇，实际 ' + r1.read);
  const r2 = H.refreshSearchIndex(vA, filesA);
  ok(r2.read === 0, '指纹没变 → 一个文件都不重读（这是二次启动快的关键），实际 ' + r2.read);
  ok(!!H.loadSearchIndex(vA), '索引落盘了，能读回来');
  ok(H.searchIndexPath(vA).indexOf('idx-') >= 0, '索引用路径哈希命名（Windows 路径不能当文件名）');
  const r3 = H.refreshSearchIndex(vA, filesA.slice(0, 1));
  ok(r3.dropped === 2, '库里少了的文件会从索引里删掉，实际 ' + r3.dropped);

  // 3) 检索：大小写不敏感 + 多词 AND + 片段
  ok(H.matchText('Hello Alpha World', ['alpha']) >= 0, '大小写不敏感');
  ok(H.matchText('有 Alpha', ['alpha', '独一无二的']) < 0, '多词是 AND：缺一个就不算命中');
  ok(H.searchTermsOf('  Alpha   Beta ').length === 2, '查询按空格切成词');
  const idxA = H.refreshSearchIndex(vA, filesA).idx;
  ok(H.searchIndex(idxA, ['alpha']).length === 2, '库A 正文里搜到 2 篇，实际 ' + H.searchIndex(idxA, ['alpha']).length);
  ok(H.searchIndex(idxA, ['alpha', '独一无二的']).length === 1, '多词 AND 也命中');
  ok(H.searchIndex(idxA, ['不存在的词']).length === 0, '搜不到就是搜不到');
  const sn = H.snippetOf('前面一堆文字中间是Alpha后面还有一堆文字', 'alpha', 5);
  ok(sn.indexOf('Alpha') >= 0 && sn.indexOf('…') >= 0, '片段带上下文和省略号，实际 ' + sn);

  // 4) 跨库：两个库一起搜
  const fakeVaults = [
    { id: vA, name: '库A', path: vA, current: false, wb: 'none' },
    { id: vB, name: '库B', path: vB, current: false, wb: 'none' }
  ];
  const hitsAll = plugin.searchAllVaults('Alpha', { vaults: fakeVaults });
  ok(hitsAll.length === 5, '两个库一共命中 5 篇（正文 4 + PDF 文件名 1），实际 ' + hitsAll.length);
  ok(hitsAll.filter((h) => h.byName).length === 1, '其中 1 条是 PDF 靠文件名命中的');
  ok(hitsAll.some((h) => h.vaultName === '库A') && hitsAll.some((h) => h.vaultName === '库B'),
    '结果里两个库都有，实际 ' + JSON.stringify(hitsAll.map((h) => h.vaultName)));
  ok(hitsAll.filter((h) => !h.byName).every((h) => h.snippet && h.snippet.length > 0),
    '正文命中的每条都带片段');
  ok(hitsAll.every((h) => h.relPath && h.vault), '每条结果都能定位到「哪个库的哪篇」');
  ok(plugin.searchAllVaults('', { vaults: fakeVaults }).length === 0, '空查询直接返回空');
  const hitsAgain = plugin.searchAllVaults('Alpha', { vaults: fakeVaults });
  ok(hitsAgain.length === hitsAll.length, '再搜一次结果一致（走的是索引，不是重扫）');

  // 文件名匹配：PDF / 图片这类不进正文的文件，名字里有关键词也要能搜到 ——
  // 否则「30天渗透.pdf」在当前库能搜到、切到所有库反而消失（真踩过的坑）
  const byPdf = plugin.searchAllVaults('渗透', { vaults: fakeVaults });
  ok(byPdf.length === 1 && byPdf[0].byName === true && byPdf[0].relPath === 'Alpha渗透.pdf',
    'PDF 靠文件名也能命中（byName），实际 ' + JSON.stringify(byPdf.map((h) => h.relPath)));
  const dedup = plugin.searchAllVaults('Alpha笔记', { vaults: fakeVaults });
  ok(dedup.length === 1,
    '文件名和正文都命中同一篇 → 只出一条不重复，实际 ' + dedup.length);

  // 5) 跨库最近文件
  const recent = plugin.recentAcrossVaults(10, { vaults: fakeVaults });
  ok(recent.length === 5, '跨库最近文件聚到 5 条（图片不算），实际 ' + recent.length);
  ok(recent.every((f, i) => i === 0 || recent[i - 1].mtime >= f.mtime), '按修改时间倒序');

  // 6) UI：范围切换 + 结果渲染 + 关键词高亮
  const savedDisc3 = plugin.discoverVaults;
  const savedSel3 = view.selectedVault;
  const savedScope = view.searchScope;
  plugin.discoverVaults = () => fakeVaults;
  view.selectedVault = vA;
  view.searchScope = 'current';
  view.render();
  ok(selectAll(view.barEl, '.vwb-scope').length === 1, '工具条上有「搜索范围」切换');
  ok(selectAll(view.barEl, '.vwb-scope')[0].textContent.indexOf('当前库') >= 0, '默认是「当前库」');
  view.searchScope = 'all';
  view.query = 'Alpha';
  view.crossHits = null;
  view.render();
  const hitRows = selectAll(view.areaEl, '.vwb-xhit');
  ok(hitRows.length === 5, '跨库模式渲染出 5 条结果，实际 ' + hitRows.length);
  ok(view.areaEl.textContent.indexOf('库A') >= 0 && view.areaEl.textContent.indexOf('库B') >= 0,
    '结果行上标了是哪个库');
  ok(selectAll(view.areaEl, 'mark').length > 0, '命中的关键词有高亮');
  view.query = '';
  view.crossHits = null;
  view.searchScope = savedScope;
  view.selectedVault = savedSel3;
  plugin.discoverVaults = savedDisc3;
  view.render();

  // 7) 清索引
  ok(plugin.clearSearchIndexes(), '能清掉全部索引');
  ok(!H.loadSearchIndex(vA), '清完就读不到索引了（下次会重建）');

  console.log('\n[23] 别的库的结构操作 + 跨库复制（v0.12.0）');
  const wdir = path.join(tmpDir, 'extwrite');
  fsm.rmSync(wdir, { recursive: true, force: true });
  const wv = path.join(wdir, '资料库');
  fsm.mkdirSync(path.join(wv, '.obsidian'), { recursive: true });
  fsm.mkdirSync(path.join(wv, '笔记'), { recursive: true });
  // 四种引用写法都指向「笔记/旧名.md」
  fsm.writeFileSync(path.join(wv, '笔记', '旧名.md'), '# 正文\n');
  fsm.writeFileSync(path.join(wv, '引用-A.md'), '只写名字：[[旧名]]\n');
  fsm.writeFileSync(path.join(wv, '引用-B.md'), '写全路径：[[笔记/旧名]]\n');
  fsm.writeFileSync(path.join(wv, '引用-C.md'), '带别名：[[笔记/旧名|看看这篇]]\n');
  fsm.writeFileSync(path.join(wv, '引用-D.md'), '带标题：[[笔记/旧名#正文]]\n');
  fsm.writeFileSync(path.join(wv, '引用-E.md'), '嵌入：![[旧名]]\n');
  fsm.writeFileSync(path.join(wv, '没引用.md'), '跟它没关系\n');
  fsm.writeFileSync(path.join(wv, '图.png'), 'binary');

  const wfiles = plugin.indexOf(wv).files;
  // 1) 先算计划：不动手
  const plan = H.planLinkRewrite(wfiles, '笔记/旧名.md', '笔记/新名.md');
  ok(H.countRefs(plan) === 5, '4 种写法 + 嵌入 = 5 处引用，实际 ' + H.countRefs(plan));
  ok(plan.length === 5, '分布在 5 篇笔记里，实际 ' + plan.length);
  ok(!fsm.existsSync(path.join(wv, '笔记', '新名.md')), '只算计划时一个文件都没动');

  // 2) 链接重写：四种写法都要改对，只改名字的 / 写全路径的 / 带别名的 / 带标题的 / 嵌入的
  const rw = H.applyLinkRewrite(plan);
  ok(!rw.failed && rw.done.length === 5, '5 篇引用全部改好，实际 ' + JSON.stringify(rw));
  ok(fsm.readFileSync(path.join(wv, '引用-A.md'), 'utf8').indexOf('[[新名]]') >= 0,
    '只写名字的 → 名字跟着改');
  ok(fsm.readFileSync(path.join(wv, '引用-B.md'), 'utf8').indexOf('[[笔记/新名]]') >= 0,
    '写全路径的 → 路径跟着改');
  ok(fsm.readFileSync(path.join(wv, '引用-C.md'), 'utf8').indexOf('[[笔记/新名|看看这篇]]') >= 0,
    '带别名的 → 别名保留、目标改掉');
  ok(fsm.readFileSync(path.join(wv, '引用-D.md'), 'utf8').indexOf('[[笔记/新名#正文]]') >= 0,
    '带标题的 → 标题保留、目标改掉');
  ok(fsm.readFileSync(path.join(wv, '引用-E.md'), 'utf8').indexOf('![[新名]]') >= 0,
    '嵌入的 → 也跟着改');
  ok(fsm.readFileSync(path.join(wv, '没引用.md'), 'utf8').indexOf('旧名') < 0,
    '没引用的笔记一个字都没动');
  ok(fsm.readFileSync(path.join(wv, '图.png'), 'utf8') === 'binary', '非 md 的文件不碰');

  // 3) 撤销：反向重写一次
  const undone = H.undoLinkRewrite(plan);
  ok(!undone.failed, '撤销：反向重写一遍');
  ok(fsm.readFileSync(path.join(wv, '引用-A.md'), 'utf8').indexOf('[[旧名]]') >= 0,
    '撤销后回到原来的写法');

  // 4) 重命名（文件真的改名 + 引用自愈）
  const p2 = plugin.planExtRename(wv, '笔记/旧名.md', '笔记/新名.md');
  ok(p2.refs === 5, '插件层也算到 5 处引用，实际 ' + p2.refs);
  const rn = plugin.applyExtRename(wv, '笔记/旧名.md', '笔记/新名.md');
  ok(rn.ok && rn.refs === 5, '重命名成功并改了 5 处引用，实际 ' + JSON.stringify(rn));
  ok(fsm.existsSync(path.join(wv, '笔记', '新名.md')), '文件本身改名了');
  ok(fsm.readFileSync(path.join(wv, '引用-A.md'), 'utf8').indexOf('[[新名]]') >= 0, '引用也跟上');
  const undoRn = plugin.undoExtRename({ vault: wv, from: '笔记/旧名.md', to: '笔记/新名.md' });
  ok(undoRn.ok && fsm.existsSync(path.join(wv, '笔记', '旧名.md')), '重命名可以撤销');

  // 5) 文件夹改名：[[旧文件夹/笔记]] 也要跟着改
  plugin.externalCache = {};   // 刚往磁盘加了文件，缓存得作废
  fsm.mkdirSync(path.join(wv, '旧文件夹'), { recursive: true });
  fsm.writeFileSync(path.join(wv, '旧文件夹', '甲.md'), '# 甲');
  fsm.writeFileSync(path.join(wv, '指向文件夹.md'), '[[旧文件夹/甲]]\n');
  const pf = plugin.planExtRename(wv, '旧文件夹', '新文件夹', true);
  ok(pf.refs === 1, '文件夹改名也算到了引用，实际 ' + pf.refs);
  plugin.applyExtRename(wv, '旧文件夹', '新文件夹', true);
  ok(fsm.readFileSync(path.join(wv, '指向文件夹.md'), 'utf8').indexOf('[[新文件夹/甲]]') >= 0,
    '文件夹改名后，[[旧文件夹/甲]] 变成 [[新文件夹/甲]]');

  // 6) 删除：进库内 .trash，可恢复，不是直接删
  const del = plugin.extDelete(wv, '没引用.md');
  ok(del.ok, '删除成功');
  ok(!fsm.existsSync(path.join(wv, '没引用.md')), '原位置没了');
  ok(fsm.existsSync(del.dest) && del.dest.indexOf('.trash') >= 0, '挪进了库内的 .trash，实际 ' + del.dest);
  const undel = plugin.undoExtDelete({ vault: wv, path: '没引用.md', to: del.dest });
  ok(undel.ok && fsm.existsSync(path.join(wv, '没引用.md')), '删除可以撤销（从 .trash 挪回来）');

  // 7) 有引用时删除会统计出来（提醒用户会留死链）
  const delRef = plugin.extDelete(wv, '笔记/旧名.md');
  ok(delRef.ok && delRef.refs === 5,
    '删一个有引用的笔记：统计出 5 处引用（提示会变死链），实际 ' + JSON.stringify(delRef));
  plugin.undoExtDelete({ vault: wv, path: '笔记/旧名.md', to: delRef.dest });

  // 8) 新建
  const cn = plugin.extCreateNote(wv, '笔记/新建的.md', '# 新');
  ok(cn.ok && fsm.readFileSync(path.join(wv, '笔记', '新建的.md'), 'utf8') === '# 新', '在别的库里新建笔记');
  ok(!plugin.extCreateNote(wv, '笔记/新建的.md', 'x').ok, '同名不会覆盖');
  const cf = plugin.extCreateFolder(wv, '新建文件夹');
  ok(cf.ok && fsm.existsSync(path.join(wv, '新建文件夹')), '在别的库里新建文件夹');

  // 9) 跨库复制：原件必须还在
  const cv = path.join(wdir, '目标库');
  fsm.mkdirSync(path.join(cv, '.obsidian'), { recursive: true });
  const copyItems = [
    { relPath: '笔记/新建的.md', absPath: path.join(wv, '笔记', '新建的.md'), kind: 'file' },
    { relPath: '图.png', absPath: path.join(wv, '图.png'), kind: 'file' }
  ];
  const cp = plugin.copyAcrossVault(copyItems, cv, '');
  ok(cp.ok && cp.done.length === 2, '复制 2 项到别的库，实际 ' + JSON.stringify(cp));
  ok(fsm.existsSync(path.join(wv, '笔记', '新建的.md')) && fsm.existsSync(path.join(wv, '图.png')),
    '★ 原件留在原库不动（这是「只复制不移动」的核心保证）');
  ok(fsm.existsSync(path.join(cv, '新建的.md')) && fsm.existsSync(path.join(cv, '图.png')),
    '副本在目标库里');
  const cp2 = plugin.copyAcrossVault(copyItems, cv, '');
  ok(cp2.done[0].to === '新建的 2.md', '同名自动加序号，绝不覆盖，实际 ' + cp2.done[0].to);
  const badCp = plugin.copyAcrossVault(copyItems, path.join(wdir, '不存在的库'), '');
  ok(!badCp.ok, '复制到不可写的目标库 → 报错而不是闷头失败');

  // 10) 权限判断
  ok(plugin.vaultWritable(wv), '真正的库且可写 → true');
  ok(!plugin.vaultWritable(path.join(wdir, '不是库')), '不是库 → false（绝不在普通文件夹里写）');

  console.log('\n[24] 回收站页面 + 文件区框选 / 空白右键（v0.12.1）');
  // 1) 回收站：删掉的东西能查到、能还原到**原来的路径**
  const tv = path.join(tmpDir, 'trashvault');
  fsm.rmSync(tv, { recursive: true, force: true });
  fsm.mkdirSync(path.join(tv, '.obsidian'), { recursive: true });
  fsm.mkdirSync(path.join(tv, '深层', '更深层'), { recursive: true });
  fsm.writeFileSync(path.join(tv, '深层', '更深层', '要删的.md'), '# 内容');
  plugin.externalCache = {};
  const tDel = plugin.extDelete(tv, '深层/更深层/要删的.md');
  ok(tDel.ok, '删除成功');
  const tvList = [{ id: tv, name: '回收站测试库', path: tv, current: false, wb: 'none', isVault: true }];
  const tList = plugin.trashList({ vaults: tvList }).filter((g) => g.vault === tv)[0];
  ok(!!tList && tList.items.length === 1, '回收站里查得到这一项，实际 ' + JSON.stringify(tList && tList.items.length));
  ok(tList.items[0].rel === '深层/更深层/要删的.md', '记住了**原来的路径**（不是只记了个名字）');
  ok(tList.items[0].known === true, '标记为 known（是工作台删的，可以还原）');
  // 关键：不靠内存里的日志，而是靠 .trash 里的映射表 —— 重启后照样能还原
  const mapFile = path.join(tv, '.trash', '.vwb-trash.json');
  ok(fsm.existsSync(mapFile), '映射表落在磁盘上（重启 Obsidian 之后也还在）');
  const tRestore = plugin.restoreTrashItem(tv, tList.items[0].name);
  ok(tRestore.ok && fsm.existsSync(path.join(tv, '深层', '更深层', '要删的.md')),
    '★ 还原到了原来的多层目录里，不是丢在库根目录');
  ok(plugin.trashList({ vaults: tvList }).filter((g) => g.vault === tv).length === 0, '还原之后回收站空了');
  // 不是工作台删的东西：看得到，但不乱猜位置
  fsm.mkdirSync(path.join(tv, '.trash'), { recursive: true });
  fsm.writeFileSync(path.join(tv, '.trash', '别人放的.md'), 'x');
  const alien = plugin.trashList({ vaults: tvList }).filter((g) => g.vault === tv)[0];
  ok(alien.items[0].known === false && alien.items[0].rel === '',
    '不是工作台删的东西：看得到但不知道原路径');
  ok(!plugin.restoreTrashItem(tv, '别人放的.md').ok, '这种不能乱还原（会拒绝）');
  ok(plugin.purgeTrashItem(tv, '别人放的.md').ok, '可以彻底删除');

  // 2) 鼠标框选：按元素实际位置算命中
  const savedDisc4 = plugin.discoverVaults;
  const savedSel4 = view.selectedVault;
  plugin.discoverVaults = () => [{ id: VAULT, name: 'MyVault', path: VAULT, current: true, wb: 'self', isVault: true }];
  view.selectedVault = VAULT;
  view.query = '';
  view.mode = 'grid';
  view.render();
  const boxItems = view.itemEls || [];
  ok(boxItems.length > 1, '文件区渲染出多个条目，实际 ' + boxItems.length);
  // 给每个条目摆一个假的位置：前两个在 (0,0)-(50,50)，其余在下面很远。
  // ⚠ 每次 render 都会重建元素、假坐标会丢，所以每次操作前都要重新摆一次
  const layout = () => {
    (view.itemEls || []).forEach((el, i) => {
      el.__rect = i < 2
        ? { left: 0, top: 0, right: 50, bottom: 50, width: 50, height: 50 }
        : { left: 0, top: 900, right: 50, bottom: 950, width: 50, height: 50 };
    });
  };
  layout();
  const hits = view.hitsInRect(view.rectOf(0, 0, 60, 60));
  ok(hits.length === 2, '框住左上角 → 只命中那 2 个，实际 ' + hits.length);
  ok(view.hitsInRect(view.rectOf(0, 800, 200, 1000)).length === boxItems.length - 2,
    '框住下面 → 命中其余的，实际 ' + view.hitsInRect(view.rectOf(0, 800, 200, 1000)).length);
  ok(view.hitsInRect(view.rectOf(500, 500, 600, 600)).length === 0, '框在空白处 → 一个都不中');
  view.selectByRect(view.rectOf(0, 0, 60, 60), false);
  ok(view.multiSel.size === 2, '框选后选中 2 项，实际 ' + view.multiSel.size);
  layout();
  view.selectByRect(view.rectOf(0, 800, 200, 1000), true);
  ok(view.multiSel.size === boxItems.length, '按住 Ctrl 再框 → 追加而不是替换，实际 ' + view.multiSel.size);
  layout();
  view.selectByRect(view.rectOf(0, 0, 60, 60), false);
  ok(view.multiSel.size === 2, '不按 Ctrl 框 → 替换掉原来的选择，实际 ' + view.multiSel.size);
  ok(view.areaEl.textContent.indexOf('已选 2 项') >= 0,
    '顶部出现批量操作条，实际 ' + JSON.stringify(view.areaEl.textContent.slice(0, 20)));

  // 3) 空白处右键菜单
  view.clearMulti();
  view.render();
  const blankGroups = view.blankMenuGroups();
  const blankItems = [].concat.apply([], blankGroups.map((g) => g.items));
  ok(blankItems.filter((i) => i.id === 'new-note')[0], '空白菜单里有「新建笔记」');
  ok(blankItems.filter((i) => i.id === 'new-folder')[0], '空白菜单里有「新建文件夹」');
  ok(blankItems.filter((i) => i.id === 'select-all')[0], '空白菜单里有「选中本屏全部」');
  ok(blankItems.filter((i) => i.id === 'clear-sel')[0].disabled, '没选东西时「清空选择」是灰的');
  ok(blankItems.filter((i) => i.id === 'appearance')[0], '空白菜单里有「外观设置」');
  // 真的跑一遍：空白处右键能弹出菜单
  fire(view.areaEl, 'contextmenu', { clientX: 5, clientY: 5 });
  ok(view.ctxEl && view.contentEl.textContent.indexOf('新建笔记') >= 0, '空白处右键真的弹出了菜单');
  view.closeEditorMenu();
  // 「选中本屏全部」真的能选上
  view.runBlankCmd('select-all');
  ok(view.multiSel.size > 0 && view.multiSel.size === (view.flatOrder || []).length,
    '「选中本屏全部」把本屏都选上了，实际 ' + view.multiSel.size);
  view.clearMulti();
  view.render();
  view.selectedVault = savedSel4;
  plugin.discoverVaults = savedDisc4;

  console.log('\n[25] 批量删除 / 回收站的两个真实 bug（v0.13.0 修）');

  // ---- bug 1：外部库批量删除只删掉 1 项（旧代码拿当前库的索引去查别的库）
  const bv = path.join(tmpDir, 'batchvault');
  fsm.rmSync(bv, { recursive: true, force: true });
  fsm.mkdirSync(path.join(bv, '.obsidian'), { recursive: true });
  ['甲.md', '乙.md', '丙.md'].forEach((n) => fsm.writeFileSync(path.join(bv, n), '# ' + n));
  plugin.externalCache = {};
  const bvList = [{ id: bv, name: '批量库', path: bv, current: false, wb: 'none', isVault: true }];
  const savedDisc5 = plugin.discoverVaults;
  plugin.discoverVaults = () => bvList;
  view.selectedVault = bv;
  view.multiSel = new Map();
  ['甲.md', '乙.md', '丙.md'].forEach((n) => {
    view.multiSel.set('f:' + n, { kind: 'file', item: { relPath: n, name: n, folder: '', ext: '.md' } });
  });
  await view.batchDelete();
  const bTrash = plugin.trashList({ vaults: bvList }).filter((g) => g.vault === bv)[0];
  ok(!!bTrash && bTrash.items.length === 3,
    '★ 外部库批量删除 3 项 → 回收站里 3 项都在，实际 ' + (bTrash ? bTrash.items.length : 0));
  ok(['甲.md', '乙.md', '丙.md'].every((n) => !fsm.existsSync(path.join(bv, n))),
    '三个文件都真的离开了原位置（不是只删掉第一个）');

  // ---- bug 2：当前库删了，回收站页面却看不到（用户把 Obsidian 设成「系统回收站」）
  const curV2 = path.join(tmpDir, 'curvault');
  fsm.rmSync(curV2, { recursive: true, force: true });
  fsm.mkdirSync(path.join(curV2, '.obsidian'), { recursive: true });
  fsm.writeFileSync(path.join(curV2, '要删的.md'), '# 内容');
  const savedBase = app.vault.adapter.getBasePath;
  const savedTrashFile = app.fileManager.trashFile;
  // ⚠ 测试开头（183 行）把 currentVaultPath 钉死成了假路径 D:/fake/MyVault，
  // 这里要指向真目录，否则副本会写到不存在的盘符上
  const savedCur5 = plugin.currentVaultPath;
  app.vault.adapter.getBasePath = () => curV2;
  plugin.currentVaultPath = () => curV2;
  app.fileManager.trashFile = async () => {};      // 模拟「系统回收站」：库里不留任何东西
  app.vault.getConfig = () => 'system';
  app.__abs = { '要删的.md': { path: '要删的.md' } };
  const curDel2 = await view.deleteOneLocal('要删的.md', false, true);
  ok(curDel2.ok, '当前库删除成功：' + curDel2.reason);
  const curMapA = H.readTrashMap(curV2);
  const curNamesA = Object.keys(curMapA);
  ok(curNamesA.length === 1 && curMapA[curNamesA[0]].rel === '要删的.md',
    '★ 选了「系统回收站」也留了副本并记住原路径，实际 ' + JSON.stringify(curMapA));
  ok(curNamesA.length === 1 && fsm.existsSync(path.join(curV2, '.trash', curNamesA[0])), '副本真的落在磁盘上');

  // Obsidian 自己会放进库内 .trash 时（local）：只登记映射，不重复留副本
  fsm.writeFileSync(path.join(curV2, '第二篇.md'), '# 内容2');
  app.vault.getConfig = () => 'local';
  app.fileManager.trashFile = async (f) => {
    fsm.mkdirSync(path.join(curV2, '.trash'), { recursive: true });
    fsm.writeFileSync(path.join(curV2, '.trash', f.path), 'x');
  };
  app.__abs = { '第二篇.md': { path: '第二篇.md' } };
  await view.deleteOneLocal('第二篇.md', false, true);
  const curMapB = H.readTrashMap(curV2);
  ok(!!curMapB['第二篇.md'] && curMapB['第二篇.md'].rel === '第二篇.md',
    'local 策略下：Obsidian 放进 .trash 的那份被登记了（回收站页面看得到），实际 ' + JSON.stringify(curMapB));

  plugin.discoverVaults = savedDisc5;
  app.vault.adapter.getBasePath = savedBase;
  app.fileManager.trashFile = savedTrashFile;
  plugin.currentVaultPath = savedCur5;
  delete app.vault.getConfig;
  app.__abs = null;
  view.selectedVault = VAULT;

  console.log('\n[26] 右键菜单的批量感知（v0.13.0 修）');
  // 选中两项后右键其中一项，菜单里的「删除」应变成「删除 2 项」，
  // 执行后进入批量删除确认态 —— 而不是只删掉被右键的那一个
  view.query = '';
  view.mode = 'grid';
  view.render();
  const mf1 = FILES[0]; // 五步学习闭环.md
  const mf2 = FILES[4]; // 02-工作/周报模板.md
  view.multiSel = new Map();
  view.multiSel.set('f:' + mf1.path, { kind: 'file', item: mf1 });
  view.multiSel.set('f:' + mf2.path, { kind: 'file', item: mf2 });
  const rMenuB = view.itemMenuGroups(mf1, 'file');
  const rDelB = rMenuB.flatMap((g) => g.items).find((i) => i.id === 'delete');
  ok(rDelB && rDelB.label.indexOf('删除 2 项') >= 0,
    '选中 2 项后右键，删除菜单项变成「删除 2 项」，实际：' + (rDelB && rDelB.label));
  await view.runItemCmd('delete', mf1, 'file');
  ok(view.multiSel.size === 2 && view.batchDelArm,
    '★ 右键「删除 2 项」后进入批量确认态，没有只删一个，size=' + view.multiSel.size + ' arm=' + view.batchDelArm);
  view.clearMulti();
  view.render();

  console.log('\n[27] 打标 / 点击已选项行为 / 智能视图（v0.13.0 新功能）');

  // 1) addTagsToContent：三种 frontmatter 形态都要会合并
  const tagR1 = H.addTagsToContent('# 正文', ['学习']);
  ok(tagR1 && tagR1.indexOf('tags:') >= 0 && tagR1.indexOf('- 学习') >= 0 && tagR1.indexOf('# 正文') >= 0,
    '无 frontmatter 时新建一个，正文保留');
  const tagR2 = H.addTagsToContent('---\ntags: [a, b]\n---\n# x', ['b', 'c']);
  ok(tagR2 && tagR2.indexOf('[a, b, c]') >= 0, '行内数组：去重合并，实际 ' + tagR2.split('\n')[1]);
  const tagR3 = H.addTagsToContent('---\ntags:\n  - a\n---\n# x', ['c']);
  ok(tagR3 && tagR3.indexOf('- a') >= 0 && tagR3.indexOf('- c') >= 0, '块式列表：追加不覆盖');
  const tagR4 = H.addTagsToContent('---\ntitle: x\n---\n# y', ['t1']);
  ok(tagR4 && tagR4.indexOf('title: x') >= 0 && tagR4.indexOf('- t1') >= 0, 'frontmatter 里没 tags 字段：追加到末尾');
  ok(H.parseTags('#a, b ，c  d') + '' === 'a,b,c,d', 'parseTags 多种分隔符 + 去 # 前缀');

  // 2) clickSelected='deselect'：点已选项 = 只取消它
  plugin.settings.view.clickSelected = 'deselect';
  view.render();
  const ck1 = FILES[0], ck2 = FILES[4];
  view.multiSel = new Map();
  view.multiSel.set('f:' + ck1.path, { kind: 'file', item: ck1 });
  view.multiSel.set('f:' + ck2.path, { kind: 'file', item: ck2 });
  view.onItemClick({}, ck1, 'file');
  ok(view.multiSel.size === 1 && !view.multiSel.has('f:' + ck1.path) && view.multiSel.has('f:' + ck2.path),
    '★ deselect 模式：点已选项只取消它，另一项还在，size=' + view.multiSel.size);
  plugin.settings.view.clickSelected = 'open';
  view.multiSel = new Map();
  view.multiSel.set('f:' + ck1.path, { kind: 'file', item: ck1 });
  view.multiSel.set('f:' + ck2.path, { kind: 'file', item: ck2 });
  view.onItemClick({}, ck1, 'file');
  ok(view.multiSel.size === 0, 'open 模式：点已选项清空选择并打开，size=' + view.multiSel.size);

  // 3) 智能视图：保存 → 应用
  if (!Array.isArray(plugin.settings.smartViews)) plugin.settings.smartViews = [];
  plugin.settings.smartViews.length = 0;
  view.query = '五步';
  view.sort = 'name';
  view.searchScope = 'current';
  view.folderPath = '01-学习';
  plugin.settings.smartViews.push({
    name: '测试视图', query: view.query, sort: view.sort,
    scope: view.searchScope, folder: view.folderPath
  });
  view.query = '';
  view.sort = 'mtime';
  view.folderPath = '';
  view.applySmartView(plugin.settings.smartViews[0]);
  ok(view.query === '五步' && view.sort === 'name' && view.folderPath === '01-学习',
    '★ 智能视图应用后恢复 query/sort/folder，实际 q=' + view.query + ' sort=' + view.sort);
  plugin.settings.smartViews.length = 0;
  view.query = '';
  view.syncSearchUI();
  view.render();

  console.log('\n[28] 标签筛选语法（v0.13.0）');
  view.selectedVault = VAULT;
  view.folderPath = '';
  const fileItemsOf = () => (view.itemEls || []).filter((el) => el._vwbItem && el._vwbItem.kind === 'file');
  view.query = '#学习方法';
  view.render();
  ok(fileItemsOf().length === 2, '★ #标签 精确筛选：只显示带该标签的 2 篇，实际 ' + fileItemsOf().length);
  view.query = 'tag:工具';
  view.render();
  ok(fileItemsOf().length === 1, 'tag: 前缀同样生效，实际 ' + fileItemsOf().length);
  view.query = '五步';
  view.render();
  ok(fileItemsOf().length >= 2, '普通词仍是子串匹配（文件名），实际 ' + fileItemsOf().length);
  view.query = '';
  view.syncSearchUI();
  view.render();

  console.log('\n[29] 仪表盘四卡片概览区（v0.13.0）');
  view.selectedVault = VAULT;
  view.query = '';
  view.folderPath = '';
  view.tagFilter = [];
  view.weekOnly = false;
  view.tagPanelOpen = false;
  view.dashCache = null;
  view.render();
  const dashCards = Array.from(view.statsEl.children || []);
  ok(dashCards.length === 4, '★ 仪表盘渲染 4 张等宽卡片，实际 ' + dashCards.length);
  const dashText = view.statsEl.textContent || '';
  ok(dashText.indexOf('笔记总数') >= 0 && dashText.indexOf('本周修改') >= 0 &&
     dashText.indexOf('收集箱') >= 0 && dashText.indexOf('标签库') >= 0,
    '四张卡片文案：笔记总数 / 本周修改 / 收集箱 / 标签库');
  const dst = view.computeStats(plugin.indexOf(VAULT).files);
  ok(dst.total === 6 && dst.md === 6 && dst.canvas === 0,
    '★ 笔记口径 = .md/.canvas/.excalidraw，附件不计入，实际 total=' + dst.total);
  ok(dst.tagTotal >= 2 && dst.tagTop.length >= 1, '标签库：统计出标签与前 3 名，实际 ' + dst.tagTotal);

  view.dashWeek();
  ok(view.weekOnly && view.sort === 'mtime', '★ 点「本周修改」：设 weekOnly + 按修改时间倒序');
  view.dashAll();
  ok(!view.weekOnly && view.query === '' && view.tagFilter.length === 0,
    '★ 点「笔记总数」：清空所有筛选（唯一会清条件的卡片）');
  view.toggleTagPanel();
  ok(view.tagPanelOpen && (view.areaEl.textContent || '').indexOf('全部标签') >= 0,
    '★ 点「标签库」：文件区换成标签列表面板');
  view.toggleTagPanel();

  view.tagFilter = ['学习方法'];
  view.render();
  ok(fileItemsOf().length === 2, '标签筛选：#学习方法 → 2 篇，实际 ' + fileItemsOf().length);
  view.tagFilter = ['学习方法', '工具'];
  view.render();
  ok(fileItemsOf().length === 0, '★ 多标签 AND 取交集（无交集=0），实际 ' + fileItemsOf().length);
  view.tagFilter = [];
  view.render();

  EMPTY_FOLDERS.push('inbox');
  plugin.externalCache = {};
  view.folderPath = '';
  view.render();
  view.dashInbox();
  ok(view.folderPath === 'inbox', '★ 点「收集箱」进入 inbox 目录，实际 ' + view.folderPath);
  const inbStats = view.computeStats(plugin.indexOf(VAULT).files);
  ok(inbStats.inboxExists === true, 'inbox 存在时卡片显示计数而非「未设置」');
  view.folderPath = '';
  view.tagFilter = [];
  view.render();

  console.log('\n[30] i18n 地基（v0.13.0 双语化 · 批 1）');
  // t() 的三条铁律：插值、英文缺失回落中文、全缺返回 key 本身
  H.setLang('zh');
  ok(H.t('common.ok') === '确定', 't() 取中文：' + H.t('common.ok'));
  ok(H.t('common.items', { n: 3 }) === '3 项', 't() 插值：' + H.t('common.items', { n: 3 }));
  ok(H.t('no.such.key') === 'no.such.key', '★ key 缺失时返回 key 本身（肉眼可定位漏翻项）');
  H.setLang('en');
  // 动态注入一个只在中文侧的 key，验证「英文缺失 → 回落中文」这条回退链
  H.I18N_ZH['test.fallback'] = '回退样本';
  ok(H.t('test.fallback') === '回退样本', '★ 英文缺失 → 自动回落中文（不会出现半中半英）');
  delete H.I18N_ZH['test.fallback'];
  ok(H.t('common.ok') === 'OK', '★ 英文已有 → 显示英文，实际 ' + H.t('common.ok'));
  H.setLang('zh');
  ok(H.normLang('zh-TW') === 'zh' && H.normLang('en-US') === 'en' && H.normLang('fr') === '',
    'normLang：zh* → zh，en* → en，其他 → 空');
  // 英文侧不得出现中文侧没有的孤儿 key（批 5 填满英文后，这条会自动变成「完全一致」）
  const zhKeys = Object.keys(H.I18N_ZH);
  const enKeys = Object.keys(H.I18N_EN);
  const orphan = enKeys.filter((k) => !(k in H.I18N_ZH));
  ok(orphan.length === 0, '英文侧没有中文侧不存在的孤儿 key' + (orphan.length ? '：' + orphan.join(',') : ''));
  console.log('   [i18n] 中文 key ' + zhKeys.length + ' 条，英文已覆盖 ' + enKeys.length + ' 条（' +
    Math.round(enKeys.length / Math.max(1, zhKeys.length) * 100) + '%）');
  const testEl = new El('div');
  H.tid(testEl, 'vh-test-x');
  ok(testEl.getAttribute('data-testid') === 'vh-test-x', 'tid() 打得上 data-testid');

  // ★ 常量表的 id 必须在字典里查得到 —— 否则界面上直接显示 'preset.minimal' 这种裸 key
  // （v0.13.0 真踩过：PRESETS 的键是 minimal/contrast，字典却写成 preset.dark/preset.high）
  const missKey = (prefix, ids) => ids.filter((id) => {
    const k = prefix + id;
    return !(k in H.I18N_ZH) || !(k in H.I18N_EN);
  });
  const menuIds = [];
  for (const g of H.EDITOR_MENU) for (const it of g.group) { menuIds.push(it.id); for (const s of (it.sub || [])) menuIds.push(s.id); }
  for (const g of H.READ_MENU) for (const it of g.group) { menuIds.push(it.id); for (const s of (it.sub || [])) menuIds.push(s.id); }
  for (const it of H.NEW_MENU) menuIds.push(it.id);
  const mMenu = missKey('editorMenu.', menuIds);
  ok(mMenu.length === 0, '★ 编辑器/阅读/新建菜单每一项 id 都有字典条目' +
    (mMenu.length ? '，缺：' + mMenu.join(',') : '（共 ' + menuIds.length + ' 项）'));
  const mPre = missKey('preset.', Object.keys(H.PRESETS));
  ok(mPre.length === 0, '★ 每种风格预设都有字典条目' + (mPre.length ? '，缺：' + mPre.join(',') : ''));
  const mWp = missKey('wp.', Object.keys(H.WALLPAPERS));
  ok(mWp.length === 0, '★ 每种壁纸都有字典条目' + (mWp.length ? '，缺：' + mWp.join(',') : ''));
  // 打开方式 / 书写方式的键是 <prefix>.<id>.label / .tip / .chip 三条
  const missMode = (prefix, modes) => modes.reduce((acc, m) => acc.concat(
    missKey(prefix + m.id + '.', ['label', 'tip', 'chip'])), []);
  const mOm = missMode('mode.open.', H.OPEN_MODES);
  ok(mOm.length === 0, '★ 每种打开方式都有 label + tip + chip' + (mOm.length ? '，缺：' + mOm.join(',') : ''));
  const mEm = missMode('mode.editor.', H.EDITOR_MODES);
  ok(mEm.length === 0, '★ 每种书写方式都有 label + tip + chip' + (mEm.length ? '，缺：' + mEm.join(',') : ''));

  console.log('\n[12] 原生设置页不回归');
  const tab = new WorkbenchSettingTab(app, plugin);
  for (const sub of ['general', 'appearance', 'vaults', 'safety', 'about']) {
    tab.sub = sub;
    try { tab.display(); ok(true, '设置子页 ' + sub + ' 渲染无异常'); }
    catch (e) { ok(false, '设置子页 ' + sub + ' 抛错: ' + e.message); }
  }

  console.log('\n[12b] 原生设置页渲染点走 tr（英文界面不残留中文 / 不露裸 key）');
  // 中文界面：打开方式 / 预设 / 壁纸三个下拉的 option 必须是中文（且不能是裸 key）
  H.setLang('zh');
  stubMod.resetDropdownOptions();
  tab.sub = 'general';
  tab.display();
  const zhOpts = stubMod.dropdownOptions.slice();
  const zhCjk = zhOpts.filter((o) => /[一-龥]/.test(o.label));
  ok(zhCjk.length > 0, '中文界面下拉有中文文案');
  ok(!zhOpts.some((o) => /^mode\.|^preset\.|^wp\.|^editorMenu\./.test(o.label)),
    '中文界面下拉不露裸 key（' + zhOpts.map((o) => o.label).join(', ') + '）');
  // 英文界面：打开方式 / 预设 / 壁纸三个下拉的 option 必须是英文（不能残留中文）
  H.setLang('en');
  stubMod.resetDropdownOptions();
  tab.sub = 'appearance';
  tab.display();
  const enOpts = stubMod.dropdownOptions.slice();
  ok(enOpts.length > 0, '英文界面 appearance 下拉有选项');
  const enCjk = enOpts.filter((o) => /[一-龥]/.test(o.label));
  ok(enCjk.length === 0, '英文界面 appearance 下拉无中文残留' + (enCjk.length ? '：' + enCjk.map((o) => o.label).join(', ') : ''));
  // 打开方式下拉（在 general 子页）英文下也必须显示英文 label
  // （语言下拉里的「中文 / English」是本族语展示，不算漏翻，故只盯 mode.open.* 三项）
  stubMod.resetDropdownOptions();
  tab.sub = 'general';
  tab.display();
  const enGeneral = stubMod.dropdownOptions.slice();
  const openLabels = enGeneral.map((o) => o.label);
  ok(openLabels.some((l) => l.indexOf('Preview panel') === 0), '英文界面打开方式含 Preview panel');
  ok(openLabels.indexOf('Panel') >= 0, '英文界面打开方式含 Panel');
  ok(openLabels.indexOf('Native editor') >= 0, '英文界面打开方式含 Native editor');
  ok(!openLabels.some((l) => /右侧预览模式|工作面板|原生编辑/.test(l)), '英文界面打开方式无中文残留');
  H.setLang('zh');

  console.log('\n[12c] 切语言后静态文案同步（applyStaticLang）+ 库项 hover 全名');
  // 中文基线（占位符用 property 读：createEl 设置的 attribute 和后续 property 赋值在 DOM 替身里不同步）
  view.applyStaticLang();
  const zhPh = view.searchEl.placeholder;
  const zhNew = view.newBtnEl.textContent;
  const zhRefresh = view.refreshBtnEl.textContent;
  ok(zhPh === '搜索：文件名 / 标签 / 正文…', '中文搜索占位：' + zhPh);
  ok(zhNew.indexOf('新建') >= 0, '中文＋新建按钮：' + zhNew);
  // 切英文后同步，占位符和按钮必须跟着变
  H.setLang('en');
  view.applyStaticLang();
  const enPh = view.searchEl.placeholder;
  const enNew = view.newBtnEl.textContent;
  const enRefresh = view.refreshBtnEl.textContent;
  ok(enPh !== zhPh && /[a-zA-Z]/.test(enPh), '英文搜索占位已同步：' + enPh);
  ok(enNew !== zhNew && /[a-zA-Z]/.test(enNew), '英文＋新建按钮已同步：' + enNew);
  ok(enRefresh !== zhRefresh && /[a-zA-Z]/.test(enRefresh), '英文刷新按钮已同步：' + enRefresh);
  H.setLang('zh');
  view.applyStaticLang();
  ok(view.searchEl.placeholder === zhPh, '切回中文占位复原');
  // 侧栏库项：hover 必须能看到完整库名（长名 ellipsis 截断的兜底）
  const vaultItem = view.contentEl.querySelector('.vwb-rail .vwb-vault');
  ok(!!vaultItem && !!vaultItem.getAttribute('title'),
    '库项带 title（悬停可看完整库名）');

  console.log('\n' + (fails.length
    ? '✗ 失败 ' + fails.length + ' 项：\n - ' + fails.join('\n - ')
    : '✓ 全部通过（' + '共 0 失败' + '）'));
  process.exit(fails.length ? 1 : 0);
})().catch((e) => {
  console.error('\n运行时异常：', e);
  process.exit(2);
});
