/* ==========================================================================
 *  Vault Workbench · 库管理工作台
 *
 *  ⚠ 本文件由 build.js 从 src/ 拼接生成，请不要直接编辑。
 *    要改代码请改 src/ 下对应的片段，然后跑：node build.js
 *
 *  片段顺序：00-header.js → 05-i18n.js → 10-constants.js → 20-utils.js → 30-filetypes.js → 35-vault-link.js → 36-search-index.js → 37-external-write.js → 40-vault-source.js → 50-plugin.js → 51-plugin-vaults.js → 52-plugin-search.js → 53-plugin-extwrite.js → 60-view-core.js → 61-view-appearance.js → 62-view-rail.js → 63-view-nav.js → 64-view-list.js → 64b-view-menu.js → 64c-view-batch.js → 64d-view-dashboard.js → 64e-view-views.js → 64f-view-io.js → 65-view-editor.js → 65b-view-editcmds.js → 65c-view-editmenu.js → 65d-view-editsave.js → 66-view-preview.js → 67-view-settings.js → 68-view-dialog.js → 70-setting-tab.js → 99-footer.js
 * ========================================================================== */

/* -------------------------------------------------------------------------
 *  Vault Workbench · 多库工作台 —— 模块入口（require + 视图类型）
 *  （本片段由 build.js 拼进 main.js，不要单独 require）
 * ------------------------------------------------------------------------- */
'use strict';

/*
 * Vault Workbench · 多库工作台
 * 免构建版本：纯 CommonJS，改完直接重载 Obsidian 即可生效。
 *
 * 架构：双通道数据层
 *   当前库  → Obsidian API（vault / metadataCache / workspace）：全部权限
 *   其他库  → Node fs 磁盘扫描：可以读、可以改已有文件的正文（原子写），
 *             新建 / 重命名 / 删除这些要动库结构的操作留给 Obsidian 自己，
 *             所以要切到那个库去做 —— 库导航右键「切换到此库」会先把
 *             工作台自己装进目标库，再跳过去，切过去照样有工作台。
 * 两者产出统一的 Note/Folder 索引，所有视图共用。
 *
 * 可移植性：一切「库外的路径」都不写死 ——
 *   Obsidian 全局配置目录、工作台全局目录都按系统取（见 35-vault-link.js）。
 */

const obsidian = require('obsidian');
const fs = require('fs');
const pathMod = require('path');
const os = require('os');

const {
  Plugin, ItemView, PluginSettingTab, Setting, Notice, MarkdownRenderer, TFile, TFolder, Component
} = obsidian;

const VIEW_TYPE = 'vault-workbench-view';

/* -------------------------------------------------------------------------
 *  i18n 词典（中英双语）
 *  （本片段由 build.js 拼进 main.js，不要单独 require）
 *  -------------------------------------------------------------------------
 *  为什么单独一个文件、而且叫 05-：
 *   build.js 按**文件名字典序**拼接，05- 排在 00-header.js 之后、10-constants.js 之前，
 *   所以 10-constants.js 里的常量表（菜单 / 模式 / 壁纸）也能直接用 tr()。
 *
 *  三条铁律（改这个文件时必须遵守）：
 *   1. 值一律用单引号，**值内不得出现单引号和换行**（长文案用 + 连）——
 *      build.js 是纯文本拼接，一个坏引号会让整个 main.js 语法崩掉
 *   2. 英文缺失时自动回落中文（见 t），所以永远不会出现半中半英的界面；
 *      中文也缺就显示 key 本身，肉眼一眼能看出是哪个 key 漏了
 *   3. 术语以 docs/术语表.md 为准，尤其这三条不能翻错：
 *      其他库 = Other vault ／ 工作面板 = Panel（不是 workspace）／ 即时渲染 = Live preview
 *
 *  key 命名：点分层级「域.对象.动作」
 *   域 = common / dlg / notice / empty / menu / editorMenu / set / drawer
 *        / rail / dash / mode / preview / editor / preview2（详见下面分组）
 * ------------------------------------------------------------------------- */

/* 中文：UI 上显示给用户的话，短句是第一原则（菜单 ≤12 字、提示 ≤20 字） */
const I18N_ZH = {
  /* ---- 通用 ---- */
  'common.ok': '确定',
  'common.cancel': '取消',
  'common.confirm': '确认',
  'common.close': '关闭',
  'common.clear': '清除',
  'common.delete': '删除',
  'common.rename': '重命名',
  'common.open': '打开',
  'common.copy': '复制',
  'common.move': '移动',
  'common.more': '更多',
  'common.folder': '文件夹',
  'common.file': '文件',
  'common.note': '笔记',
  'common.notes': '篇',
  'common.vault': '库',
  'common.currentVault': '当前库',
  'common.otherVault': '其他库',
  'common.workbench': '工作台',
  'common.root': '库根目录',
  'common.emptyFolder': '空文件夹',
  'common.selected': '已选',
  'common.items': '{n} 项',
  'common.unknown': '未知',
  'common.compact': '紧凑',
  'common.standard': '标准',
  'common.loose': '宽松',
  'common.side': '侧滑',
  'common.float': '悬浮',
  'common.bottom': '底部',
  'common.current': '当前',
  'common.switch': '切换',
  'common.show': '显示',
  'common.hide': '隐藏',
  'common.add': '添加',
  'common.remove': '移除',
  'common.path': '路径',
  'common.undo': '撤销',
  'common.noTags': '无标签',
  'common.recentNote': '最近：{name}',
  'common.installed': '已装',
  'common.rebuild': '重建',
  'common.rescan': '刷新索引',

  /* ---- 弹窗 ---- */
  'dlg.ok': '确定',
  'dlg.cancel': '取消',

  /* ---- 设置项（两套设置页共用）---- */
  'set.lang.name': '界面语言',
  'set.lang.desc': '跟随 Obsidian 界面语言，或手动指定',
  'set.lang.auto': '跟随 Obsidian',
  'set.lang.zh': '中文',
  'set.lang.en': 'English',

  /* ---- 仪表盘 ---- */
  'dash.total': '笔记总数',
  'dash.mdLine': 'MD {md} · Canvas {canvas} · Excalidraw {excali}',
  'dash.total.tip': '点击清空所有筛选，展示当前库全部笔记',
  'dash.week': '本周修改',
  'dash.week.sub': '近 7 天有变动',
  'dash.week.tip': '点击筛选出近 7 天改过的笔记（按修改时间倒序）',
  'dash.inbox': '收集箱',
  'dash.inbox.sub': '点击进入 {name}',
  'dash.inbox.create': '一键创建 {name}',
  'dash.inbox.tip': '进入收集箱目录',
  'dash.inbox.createTip': '在当前库根目录创建 {name} 文件夹',
  'dash.inbox.unset': '未设置',
  'dash.tags': '标签库',
  'dash.tags.tip': '点击查看当前库的全部标签',
  'dash.tags.none': '暂无标签',

  /* ---- 设置抽屉 ---- */
  'drawer.title': '设置 · {page}',
  'drawer.collapse': '收起',
  'drawer.nav.appearance': '外观',
  'drawer.nav.editor': '编辑器',
  'drawer.nav.open': '打开方式',
  'drawer.nav.guide': '使用说明',
  'drawer.nav.vaults': '库管理',
  'drawer.nav.logs': '操作日志',
  'drawer.nav.trash': '回收站',
  'drawer.nav.about': '关于',
  'drawer.appearance.preset': '风格预设',
  'drawer.appearance.wallpaper': '工作台壁纸',
  'drawer.appearance.custom': '自定义',
  'drawer.appearance.pick': '选择文件',
  'drawer.appearance.noFile': '未选择任何文件',
  'drawer.appearance.loaded': '已载入自定义图片',
  'drawer.appearance.dim': '暗化',
  'drawer.appearance.blur': '模糊',
  'drawer.appearance.accent': '主题色',
  'drawer.appearance.density': '布局',
  'drawer.appearance.behavior': '行为',
  'drawer.appearance.scope': '当前编辑范围：{scope}',
  'drawer.appearance.scope.global': '全局统一外观',
  'drawer.appearance.scope.per': '{name} 单独配置',
  'drawer.appearance.save': '保存并应用',
  'drawer.appearance.saved': '外观已保存并应用',
  'drawer.appearance.native': '在 Obsidian 原生设置页中打开本插件 →',
  'drawer.appearance.wpApplied': '已应用自定义壁纸',
  'drawer.appearance.wpTooBig': '图片超过 8MB，请换一张小一点的（否则拖慢渲染）',
  'drawer.appearance.wpLarge': '图片较大（{size}），可能拖慢渲染',
  'drawer.tg.stats': '根层显示统计卡',
  'drawer.tg.meta': '卡片显示标签与日期',
  'drawer.tg.summary': '卡片显示内容摘要',
  'drawer.tg.pervault': '每个库单独配置外观',
  'drawer.open.title': '点文件的默认行为',
  'drawer.open.note': '三种模式随时可切，文件区工具条上的「打开方式切换」下拉就是同一个开关。',
  'drawer.open.using': '✓ 使用中',
  'drawer.open.def': '（默认）',
  'drawer.open.guide': '想找快捷键和操作说明？见左侧「使用说明」。',
  'drawer.editor.title': '默认书写方式',
  'drawer.editor.note': '在文档右上角点「编辑」后，正文默认以哪种方式打开。编辑器顶栏随时能切，不用回设置。',
  'drawer.editor.split': '双栏分屏',
  'drawer.editor.sync': '源码与预览滚动位置同步',
  'drawer.editor.scKeys': '编辑快捷键',
  'drawer.editor.scPara': '段落与标题',
  'drawer.editor.scCanvas': '在正文里怎么操作（连续书写）',
  'drawer.editor.canvasNote': '在正文里点右键（或编辑器顶栏「Aa 格式」）可以调出完整菜单：文本格式 / 段落设置 / 插入 / 剪切复制粘贴 / 删除（含「删除这一段」）。',
  'drawer.vaults.title': 'Obsidian 库',
  'drawer.vaults.none': '没有发现任何库',
  'drawer.vaults.current': '当前',
  'drawer.vaults.switch': '切换',
  'drawer.vaults.installed': '已装',
  'drawer.vaults.update': '更新',
  'drawer.vaults.install': '装工作台',
  'drawer.vaults.show': '显示',
  'drawer.vaults.hide': '隐藏',
  'drawer.vaults.hidden': '（已隐藏）',
  'drawer.vaults.addTitle': '手动添加文件夹',
  'drawer.vaults.path': '路径',
  'drawer.vaults.add': '添加',
  'drawer.vaults.addedTitle': '手动添加的库',
  'drawer.vaults.remove': '移除',
  'drawer.vaults.where': '库清单存在哪',
  'drawer.logs.title': '操作日志',
  'drawer.logs.empty': '暂无记录',
  'drawer.logs.undo': '撤销',
  'drawer.logs.index': '索引',
  'drawer.logs.external': '其他库',
  'drawer.logs.reindex': '刷新索引',
  'drawer.logs.searchIdx': '搜索索引',
  'drawer.logs.rebuild': '重建',
  'drawer.trash.title': '回收站',
  'drawer.trash.empty': '回收站是空的',
  'drawer.trash.items': '{n} 项',
  'drawer.trash.clear': '清空',
  'drawer.trash.origin': '原来在：{path}',
  'drawer.trash.unknown': '不知道原来在哪（不是工作台删的）',
  'drawer.trash.restore': '还原',
  'drawer.trash.cant': '无法还原',
  'drawer.trash.purge': '彻底删除',
  'drawer.about.guide': '快捷键与操作说明见左侧「使用说明」',

  /* ---- 打开方式 / 编辑器模式（术语表定死的英文）---- */
  'mode.open.panel.label': '右侧预览模式',
  'mode.open.panel.tip': '点文件在右侧面板预览，不铺满、不跳标签',
  'mode.open.workbench.label': '工作面板',
  'mode.open.workbench.tip': '在工作台里铺满打开，可直接阅读 / 编辑 / 看大纲',
  'mode.open.native.label': '原生编辑',
  'mode.open.native.tip': '在 Obsidian 中新开标签页用官方编辑器打开',
  'mode.editor.live.label': '即时渲染',
  'mode.editor.live.tip': '单画布即时渲染：正文就是渲染后的样子，点哪改哪',
  'mode.editor.split.label': '双栏分屏',
  'mode.editor.split.tip': '源码 + 实时渲染双栏，滚动位置同步',
  'mode.editor.source.label': '纯源码',
  'mode.editor.source.tip': '直接编辑 Markdown 源码',
  /* chip：工具条 / 编辑器顶栏上的短标签（带图标），术语见术语表 */
  'mode.open.panel.chip': '▭ 右侧预览',
  'mode.open.workbench.chip': '⤢ 工作面板',
  'mode.open.native.chip': '🗂 原生编辑',
  'mode.editor.live.chip': '◉ 即时渲染',
  'mode.editor.split.chip': '▥ 双栏分屏',
  'mode.editor.source.chip': '▤ 纯源码',

  /* ---- 壁纸 / 预设 ---- */
  'wp.none': '无',
  'wp.starry': '星夜',
  'wp.bamboo': '竹林',
  'wp.paper': '纸张',
  'wp.ocean': '深海',
  'preset.glass': '毛玻璃',
  'preset.minimal': '极简暗',
  'preset.mag': '杂志卡片',
  'preset.contrast': '高对比',

  /* ---- 工具条 ---- */
  'bar.grid': '▦ 网格',
  'bar.list': '☰ 列表',
  'bar.expandAll': '⤢ 全部展开',
  'bar.collapseAll': '⤡ 全部收缩',
  'bar.expandAll.tip': '展开当前目录下的所有文件夹',
  'bar.collapseAll.tip': '收起所有展开的文件夹',
  'bar.views': '🔖 视图',
  'bar.views.tip': '保存 / 应用智能视图（搜索条件 + 排序 + 范围）',
  'bar.openMode': '打开方式切换',
  'bar.sort.mtime': '排序：修改时间',
  'bar.sort.name': '排序：名称',
  'bar.sort.size': '排序：大小',
  'bar.up': '← 上一级',
  'bar.back': '后退到上一个目录（Alt + ←）',
  'bar.fwd': '前进到下一个目录（Alt + →）',

  /* ---- 批量操作条 ---- */
  'batch.selected': '已选 {n} 项',
  'batch.copyPath': '复制路径',
  'batch.copyLinks': '复制内部双链',
  'batch.tag': '打标签…',
  'batch.rename': '重命名…',
  'batch.moveTo': '移动…',
  'batch.copyTo': '复制到…',
  'batch.delete': '删除',
  'batch.deleteConfirm': '确认删除 {n} 项',
  'batch.clear': '清空选择',

  /* ---- 右键菜单：文件 / 文件夹 ---- */
  'menu.switchVault': '切换到此库（{name}）',
  'menu.enter': '进入这个文件夹',
  'menu.newHere': '在这里新建笔记',
  'menu.newHere.wb': '在工作台内编辑（默认）',
  'menu.newHere.native': '用 Obsidian 原生编辑器打开',
  'menu.open': '打开（按当前打开方式）',
  'menu.openPanel': '在右侧面板预览',
  'menu.openNative': '在 Obsidian 中打开',
  'menu.copyUri.file': '复制 Obsidian 链接',
  'menu.copyUri.folder': '复制文件夹链接',
  'menu.copyWikilink': '复制内部双链',
  'menu.copyWikilink.folder': '复制内部双链（含子笔记）',
  'menu.copyWikilink.multi': '复制 {n} 项的内部双链',
  'menu.copyPath': '复制路径',
  'menu.copyPath.multi': '复制 {n} 个路径',
  'menu.copyPath.uri': 'Obsidian URI',
  'menu.copyPath.rel': '基于库的相对路径',
  'menu.copyPath.abs': '绝对路径',
  'menu.moveTo.file': '移动文件到…',
  'menu.moveTo.folder': '移动文件夹到…',
  'menu.duplicate': '创建副本',
  'menu.rename': '重命名…',
  'menu.renameFolder': '重命名文件夹…',
  'menu.reveal': '在资源管理器中显示',
  'menu.delete.file': '删除文件',
  'menu.delete.folder': '删除文件夹',
  'menu.delete.multi': '删除 {n} 项',
  'menu.why.noLink': '其他库的笔记不在当前库里，切到那个库复制的链接才跳得过去',
  'menu.why.noWrite': '这个库不可写（只读盘或没有权限）',
  'menu.why.noNative': '这个文件类型没有原生视图',

  /* ---- 空白右键菜单 ---- */
  'blank.newNote': '新建笔记',
  'blank.newFolder': '新建文件夹',
  'blank.selectAll': '选中本屏全部',
  'blank.switchView': '切换视图',
  'blank.rescan': '重新扫描',
  'blank.appearance': '外观设置',
  'blank.toListView': '切成列表视图',
  'blank.toGridView': '切成网格视图',
  'blank.rescanVault': '重新扫描这个库',
  'blank.why.noSel': '现在没有选中任何东西',

  /* ---- 空态 ---- */
  'empty.noMatch': '没有匹配的文件',
  'empty.weekNone': '近 7 天没有修改的笔记',
  'empty.folderEmpty': '这个文件夹是空的',
  'empty.folderEmptySub': '（这个文件夹是空的）',
  'empty.crossNone': '所有库里都没找到「{q}」',

  /* ---- 高频提示 ---- */
  'notice.copied': '已复制',
  'notice.copiedPath': '已复制路径：{path}',
  'notice.copiedPaths': '已复制 {n} 条路径',
  'notice.copiedLinks': '已复制 {n} 条内部双链',
  'notice.copiedUri': '已复制 Obsidian URI',
  'notice.copiedUris': '已复制 {n} 个 URI',
  'notice.copiedRel': '已复制 {n} 条相对路径',
  'notice.copiedAbs': '已复制 {n} 条绝对路径',
  'notice.moved': '已移动 {n} 项',
  'notice.movedSkipped': '，跳过 {n} 项（已在目标里 / 重名）',
  'notice.deleted': '已删除 {n} 项',
  'notice.deletedFail': '，{n} 项失败',
  'notice.deletedHint': '（回收站里还能找回）',
  'notice.tagged': '打标完成：{n} 篇',
  'notice.renamed': '重命名完成：{n} 项',
  'notice.searchAll': '搜索范围：所有库（全文）',
  'notice.searchCurrent': '搜索范围：当前库（文件名 / 标签）',

  /* ---- 左侧库导航 ---- */
  'rail.title': 'obsidian库导航',
  'rail.expand': '⤢ 展开',
  'rail.collapse': '⤡ 收缩',
  'rail.expand.tip': '展开 obsidian库导航',
  'rail.collapse.tip': '收缩 obsidian库导航（只留图标）',
  'rail.collapsed.tip': 'obsidian库导航（已收缩）—— 点上方 展开',
  'rail.none': '未发现仓库，可在设置中手动添加',
  'rail.badge.current': '当前',
  'rail.badge.folder': '文件夹',
  'rail.badge.folder.tip': '这不是一个 Obsidian 库（里面没有 .obsidian），只能在这边浏览；想切过去就先在 Obsidian 里「打开文件夹作为仓库」',
  'rail.badge.none': '未装',
  'rail.badge.none.tip': '这个库还没装工作台 —— 右键「切换到此库」会先把它装好再切过去',
  'rail.badge.stale': '旧版',
  'rail.badge.stale.tip': '这个库里的工作台是 v{ver}，右键「切换到此库」会顺手更新',
  'rail.tip': '右键库 → 切换到此库',
  'rail.tip.title': '切过去之前会先把工作台装进那个库，所以切过去照样有工作台',
  'rail.settings': '设置',
  'rail.settings.tip': '打开设置（外观 / 打开方式 / 库管理 / 操作日志 / 关于）',
  'rail.rediscover': '重新发现',
  'rail.rediscover.tip': '重新扫描本机 Obsidian 库',
  'rail.rediscovered': '已重新扫描仓库',
  'rail.openSettingsTip': '请到 设置 → 第三方插件 → Vault Workbench 打开设置',
  'rail.menu.switch': '切换到此库',
  'rail.menu.switchCur': '这就是当前库',
  'rail.menu.switchWhy': '已经在这个库里了',
  'rail.menu.install': '把工作台装到这个库',
  'rail.menu.installOk': '工作台已是最新（v{ver}）',
  'rail.menu.installOkWhy': '这个库里的工作台已经是最新的了',
  'rail.menu.update': '更新这个库的工作台（v{ver} → 最新）',
  'rail.menu.browse': '在这边浏览（不切库）',
  'rail.menu.refresh': '重新扫描这个库',
  'rail.menu.copyUri': '复制 Obsidian 库链接',
  'rail.menu.reveal': '在资源管理器中显示',
  'rail.menu.hide': '在导航里隐藏',
  'rail.menu.hideWhy': '当前库不能隐藏（工作台就跑在它上面）',
  'rail.notVault': '这个文件夹还不是一个 Obsidian 库（没有 .obsidian）：先在 Obsidian 里「打开文件夹作为仓库」',
  'rail.installFail': '没装上：{reason}',
  'rail.installed': '已把工作台装进「{name}」；第一次进这个库要在 设置 → 第三方插件 关掉受限模式一次。',
  'rail.updated': '已把「{name}」里的工作台更新到 v{ver}',
  'rail.alreadyNew': '「{name}」里的工作台已经是新版了，没动它',
  'rail.refreshed': '已重新扫描：{name}',
  'rail.copiedUri': '已复制 Obsidian 库链接',
  'rail.hidden': '已隐藏：{name}',

  /* ---- 使用说明（长段落）---- */
  'guide.quick': '快速上手',
  'guide.feats': '编辑器里能做什么',
  'guide.step1': '① 左侧「obsidian库导航」选一个库，点标题右边的「⤡ 收缩 / ⤢ 展开」可以折叠它。',
  'guide.step2': '② 点文件夹卡片进下一层；列表模式下点文件夹前面的 ▸ 可以就地展开、直接看里面有什么。文件或文件夹上点右键有打开 / 重命名 / 复制路径 / 删除等操作。左上「← 上一级」、面包屑任意一段都能回退，工具条 ⇦ ⇨ 或 Alt + ← / → 在目录间前进后退。',
  'guide.step3': '③ 点文件 = 按「打开方式切换」里选的模式打开（默认「右侧预览模式」，只在右栏看一眼）。',
  'guide.step4': '④ 在预览面板右上角：编辑 ⇄ 阅读 · ☰ 大纲 · ⤢ 铺满 · ✕ 关闭。',
  'guide.step5': '⑤ 编辑态默认是「即时渲染」单画布：正文就是渲染后的样子，点任意一段就地改；↑ / ↓ 跨段、回车只换行、Shift + Enter 才另起一段、段首退格并到上一段。',
  'guide.step6': '⑥ 在这个库里右键左边任意一个库 →「切换到此库」：会先把工作台装进那个库（没有的话）再切过去，切过去照样有工作台。其他库能改正文，但新建 / 重命名 / 删除要切过去才能做。',
  'guide.feat1': '点哪改哪：单画布模式下点一段就地编辑，改完立刻回到渲染样式，段与段之间没有「盒子」边界，读起来是一整篇。',
  'guide.feat2': '连续书写：↑ / ↓ 在段首 / 段尾自动跳上 / 下一段；Shift + Enter 完成这一段并另起新的一段；段首退格并进上一段；点正文下方空白在文末接着写。',
  'guide.feat3': '回车 / 换行分工：Enter = 在本段里换行（段落 / 标题写的是 Markdown 硬换行，渲染出来看得见换行）；Shift + Enter = 完成这一段，紧接着新建一段。代码块 / 表格 / Front Matter 是原样内容，两种回车都只是换行。列表 / 引用写到末尾 Enter 会自动续一行，在空列表项上再按 Enter 跳出列表。',
  'guide.feat4': '右键菜单：正文里点右键（或顶栏「Aa 格式」）调出「文本格式 / 段落设置 / 插入 / 剪切复制粘贴 / 删除」。菜单里的命令作用在「右键点的那一段」上（会先把那一段带进编辑态）；在正文空白处且没在编辑任何一段时则作用于整篇。',
  'guide.feat5': '文件区右键菜单：文件上右键有「打开 / 面板预览 / 在 Obsidian 中打开 / 复制 Obsidian 链接 / 复制内部双链 / 复制路径 / 重命名 / 在资源管理器中显示 / 删除文件」，文件夹上右键多一个「在这里新建笔记」（还能选「在工作台内编辑」还是「用 Obsidian 原生编辑器打开」）。删除走 Obsidian 自己的删除通道（按你在「设置 → 文件与链接」里选的回收站策略走，能找回）。在其他库里，重命名 / 删除 / 新建 / 复制链接是灰的 —— 要做这些就在左边库导航右键那个库 → 切换到此库，切过去全权限。',
  'guide.feat6': '空文件夹也会列出来（文件夹清单直接读库的目录树，不靠笔记反推），标注为「空文件夹」，列表模式展开时给一行「（这个文件夹是空的）」；库根目录下的文件按「文件」正常铺在文件区。',
  'guide.feat7': '复制出去还能跳回来：「复制 Obsidian 链接」给的是 obsidian://open?vault=…&file=… ，粘到微信 / 邮件里，在装了 Obsidian 的机器上点一下就跳过去；「复制内部双链」给的是 [[路径]]，粘回 Obsidian 就是一条能点的双链。在文件夹上复制双链，会把它下面所有笔记的双链每行一条全列出来。',
  'guide.feat8': '批量处理：Ctrl / ⌘ + 点 加一项、Shift + 点 连选一片，文件区顶部出现操作条 —— 复制路径（完整磁盘路径）/ 复制内部双链 / 移动…（走 Obsidian 的 renameFile，库内双链会跟着更新）/ 删除（要按两下确认）/ 清空选择。',
  'guide.feat9': '拖选与复制：即时渲染和阅读模式下，正文都能像网页一样用鼠标拖选，Ctrl + C 直接复制走；有选区时点这一段不会被当成「要编辑这一段」。阅读态在正文上点右键也有菜单：复制选中文本 / 全选正文 / 复制整篇 Markdown / 复制文件路径。',
  'guide.feat10': '大纲：阅读和编辑两种模式下都能用，点标题直接跳过去。',
  'guide.feat11': '自动保存：停止输入 0.8 秒落盘，Ctrl + S 立即保存；其他库文件直接写回磁盘原文件。',
  'guide.feat12': '跨库搜索：工具条上点「📍 当前库」切成「🌐 所有库」，搜的就是全部库的正文（文件名 / 标签 / 内容都算）；结果左边标着是哪个库，下面是命中片段、关键词高亮；点一下直接在工作台里打开，不用切库。多个词用空格分开（两个词都要出现）。索引是本机建的，第一次按范围切换时会慢一点，之后就快了。',
  'guide.feat13': '框选与空白右键：文件区空白处按住左键拖一下就能框选（按住 Ctrl / ⌘ 是追加，不按就是替换），点一下空白清空选择；空白处点右键有新建笔记 / 新建文件夹 / 选中本屏全部 / 切换视图 / 重新扫描 / 外观设置。原来的 Ctrl + 点 加选、Shift + 点 连选照旧。',
  'guide.feat14': '回收站：在别的库里删掉的东西都进「设置 → 回收站」，记着原来的路径，还原就回到原处（重启 Obsidian 也不丢）；也能在那儿彻底删除或清空某个库的回收站（都要再确认一次）。',
  'guide.feat15': '三种书写方式：◉ 即时渲染（默认）/ ▥ 双栏分屏（滚动同步）/ ▤ 纯源码。',
  'guide.iconTitle': '文件区小图标',
  'guide.paraKeys': '段落与标题快捷键',
  'guide.canvasKeys': '正文里的连续书写',
  'guide.readCopy': '阅读模式下怎么复制',
  'guide.fileKeys': '文件区与批量处理',
  'guide.navKeys': '目录与窗口快捷键',
  'guide.icon1': '卡片右上角：只看一眼（右侧面板预览），不影响默认打开方式',
  'guide.icon2': '预览面板右上角：进入 / 退出工作台内编辑',
  'guide.icon3': '预览面板右上角：大纲',
  'guide.icon4': '预览面板右上角：铺满整个工作区 / 还原',
  'guide.icon5': '不想在工作台里改，跳回 Obsidian 原生编辑器',

  /* ---- 关于页 ---- */
  'about.title': 'Vault Workbench · 多库工作台',
  'about.intro': '多库管理工作台。当前库走 Obsidian 原生 API（完整编辑能力），其他仓库通过磁盘扫描：可以读、可以改已有文件的正文（原子写），动不了库结构（新建 / 重命名 / 删除）—— 这些在左边库导航右键那个库 → 切换到此库 就能做，切过去照样有工作台。',
  'about.version': '版本：{ver}',
  'about.rail': '左侧「obsidian库导航」可展开 / 收缩；工具条「打开方式切换」可在右侧预览 / 工作面板 / 原生编辑之间切换。',
  'about.editor': '工作台内编辑器默认为「即时渲染」单画布：点哪改哪、改完即渲染；也可切成双栏分屏或纯源码。正文里点右键可调出完整格式菜单。',
  'about.roadmap': '路线图：收集箱消化模式 → 批量整理 → 规则引擎与体检报告 → 统计热力图 → 跨库搜索。',

  /* ---- 编辑器菜单（EDTOR_MENU / READ_MENU / NEW_MENU 的 id 即 key）---- */
  'editorMenu.copy-sel': '复制选中文本',
  'editorMenu.copy-block': '复制这一段的原文',
  'editorMenu.copy-all': '复制整篇 Markdown',
  'editorMenu.select-all': '全选',
  'editorMenu.select-all-doc': '全选正文',
  'editorMenu.copy-path': '复制文件路径',
  'editorMenu.link': '新增链接',
  'editorMenu.extlink': '新增外部链接',
  'editorMenu.format': '文本格式',
  'editorMenu.para': '段落设置',
  'editorMenu.insert': '插入',
  'editorMenu.cut': '剪切',
  'editorMenu.copy': '复制',
  'editorMenu.paste': '粘贴',
  'editorMenu.paste-plain': '以纯文本形式粘贴',
  'editorMenu.del-sel': '删除选中内容',
  'editorMenu.del-block': '删除这一段',
  'editorMenu.bold': '加粗',
  'editorMenu.italic': '斜体',
  'editorMenu.underline': '下划线',
  'editorMenu.strike': '删除线',
  'editorMenu.code': '行内代码',
  'editorMenu.mark': '高亮',
  'editorMenu.clear': '清除样式',
  'editorMenu.p': '正文',
  'editorMenu.h1': '一级标题',
  'editorMenu.h2': '二级标题',
  'editorMenu.h3': '三级标题',
  'editorMenu.h4': '四级标题',
  'editorMenu.h5': '五级标题',
  'editorMenu.h6': '六级标题',
  'editorMenu.hup': '提升标题级别',
  'editorMenu.hdn': '降低标题级别',
  'editorMenu.quote': '引用',
  'editorMenu.ul': '无序列表',
  'editorMenu.ol': '有序列表',
  'editorMenu.task': '任务列表',
  'editorMenu.table': '表格',
  'editorMenu.hr': '水平分割线',
  'editorMenu.codeblock': '代码块',
  'editorMenu.math': '公式块',
  'editorMenu.toc': '内容目录',
  'editorMenu.frontmatter': 'YAML Front Matter',
  'editorMenu.footnote': '脚注',
  'editorMenu.date': '当前日期',
  'editorMenu.image': '图片',
  'editorMenu.new-file': '新建文件',
  'editorMenu.new-file.tip': '在当前目录新建一个空笔记，并直接在工作台里编辑',
  'editorMenu.new-folder': '新建文件夹',
  'editorMenu.new-folder.tip': '在当前目录新建一个子文件夹',

  /* ---- 插件级文案（ribbon / 命令 / 视图标题 / 预览头）---- */
  'misc.ribbonTip': '多库工作台',
  'misc.viewTitle': '多库工作台',
  'misc.cmdOpen': '打开多库工作台',
  'misc.cmdRefresh': '刷新库索引',
  'preview.edit': '编辑',
  'preview.editTip': '切换编辑模式',
  'preview.outlineTip': '大纲',
  'preview.closeTip': '关闭预览',

  /* ---- 文件类型 ---- */
  'ft.image': '图片',
  'ft.audio': '音频',
  'ft.video': '视频',
  'ft.pdf': 'PDF 文档',
  'ft.text': '文本',

  /* ---- 提示语（Notice / 操作结果 reason）---- */
  'notice.navStart': '已经是最早的位置了',
  'notice.navEnd': '后面没有更多位置了',
  'notice.pluginListWrite': '写不进 {path} 的插件清单',
  'notice.deployWrite': '写不进 {path}',
  'notice.noTargetPath': '没有目标库路径',
  'notice.notVaultShort': '不是库',
  'notice.jumpFailShort': '跳转失败',
  'notice.refPartial': '引用改到「{name}」时出错了，只改好了 {n} 篇',
  'notice.undoNoVault': '这条记录没有库信息，撤不了',
  'notice.undoIncomplete': '这条记录不完整，撤不了',
  'notice.noTargetVault': '没有目标库',
  'notice.targetReadonly': '目标库不可写（只读盘或没有权限）',

  'editor.edit': '编辑',
  'editor.read': '阅读',
  'editor.outline': '大纲',
  'editor.rename': '点击重命名这个文件',
  'editor.format': 'Aa 格式',
  'editor.saved': '已保存',
  'editor.unsaved': '未保存…',
  'editor.notEditable': '这个文件不支持在工作台内编辑',
  'editor.hasFm': '文件开头已经有一段 YAML Front Matter 了',
  'editor.noDel': '光标已经在这一段的末尾，没有可删的内容',
  'editor.pickBlock': '先点一下要删的那一段，再用「删除这一段」',
  'editor.blockDeleted': '已删除这一段',
  'editor.noClipboard': '这个环境读不到剪贴板，直接用 Ctrl+V 吧',
  'editor.noSelectAll': '这个环境不支持全选，直接用 Ctrl+A 吧',
  'editor.wroteExternal': '已写回其他库文件：{path}',

  /* ---- Obsidian 原生设置中心 ---- */
  'set.open.name': '点击文件的默认行为',
  'set.open.desc': '右侧预览：点文件在右侧面板预览，不铺满、不跳标签（默认，适合快速翻找）；工作面板：在工作台里铺满打开，可直接阅读 / 编辑 / 看大纲；原生编辑：在 Obsidian 中新开标签页用官方编辑器打开。任何模式下都能用卡片上的 👁 强制预览，或用「↗ 在 Obsidian 中打开」跳原生。',
  'set.preset.name': '风格预设',
  'set.preset.desc': '一键打包应用壁纸强度与面板通透度',
  'set.wallpaper.name': '工作台壁纸',
  'set.wallpaper.desc': '仅作用于插件工作台区域',
  'set.wallpaperPath.name': '自定义壁纸路径',
  'set.wallpaperPath.desc': '填入本地图片绝对路径，留空则用上方预设',
  'set.dim.name': '壁纸暗化程度',
  'set.dim.desc': '数值越高，壁纸越暗、文字越清晰',
  'set.blur.name': '面板模糊度',
  'set.blur.desc': '毛玻璃效果强度，0 为完全透明面板',
  'set.accent.name': '主题色',
  'set.accent.desc': '强调色，用于选中态、按钮与高亮',
  'set.accentQuick.name': '快速选色',
  'set.accentQuick.desc': '预设强调色',
  'set.density.name': '布局密度',
  'set.density.desc': '控制卡片间距与网格列宽',
  'set.previewPos.name': '预览位置',
  'set.previewPos.desc': '文件预览面板出现的位置',
  'set.stats.name': '显示统计卡',
  'set.stats.desc': '库根层显示笔记数 / 本周修改 / 待整理 / 附件体积',
  'set.clickSelected.name': '点击已选项时',
  'set.clickSelected.desc': '多选状态下，直接点击一个已选中的条目时做什么',
  'set.meta.name': '卡片显示元信息',
  'set.meta.desc': '显示标签与修改日期',
  'set.summary.name': '卡片显示内容摘要',
  'set.summary.desc': '笔记卡名字下方显示两行正文摘要（关掉回到轻卡）',
  'set.inbox.name': '收集箱文件夹名',
  'set.inbox.desc': '库根目录下这一层的文件夹，仪表盘「收集箱」卡片按它统计（只数第一层）',
  'set.vault.manual': ' · 手动添加',
  'set.vault.hidden': ' · 已隐藏',
  'set.addVault.name': '手动添加仓库 / 文件夹',
  'set.addVault.desc': '填入绝对路径后回车或失焦即生效',
  'set.reindex.name': '刷新其他库索引',
  'set.reindex.desc': '重新扫描非当前库的磁盘内容',

  'preview.noNativeExternal': '其他库文件不在当前库内，无法原生打开 —— 已改用面板预览',
  'preview.noNativeType': '这个类型 Obsidian 没有原生视图 —— 已改用面板预览',
  'preview.nativeFail': '原生打开失败，改用面板预览：{err}',
  'preview.loading': '正在加载…',
  'preview.fail': '预览失败：{err}',
  'preview.outline': '大纲',
  'preview.noHeadings': '这个文件里没有标题（# 开头的小节）',
  'preview.linkMissing': '找不到链接目标：{target}',
  'preview.imageTip': '底栏「实际大小」可切换 1:1 查看；「↗ 外部打开」交给系统图片查看器。',
  'preview.mediaTip': '看不了 / 想全屏？用底栏「↗ 外部打开」走系统默认程序。',
  'preview.pdfNativeTip': 'PDF 由 Obsidian 原生阅读器渲染；看不了就用底栏「用外部程序打开」。',
  'preview.pdfTip': '若上方一片空白，说明当前环境不支持内嵌 PDF —— 点下面的按钮用系统阅读器打开即可。',
  'preview.openExternal': '↗ 用外部程序打开',
  'preview.openFolder': '🗂 打开文件目录',
  'preview.close': '✕',

  'ui.1': '后退到上一个目录（Alt + ←）',
  'ui.2': '前进到下一个目录（Alt + →）',
  'ui.3': '← 上一级',
  'ui.4': '搜索：',
  'ui.5': '搜索：文件名 / 标签 / 正文…',
  'ui.6': '🌐 所有库',
  'ui.7': '📍 当前库',
  'ui.8': '搜索范围：所有库（全文）',
  'ui.9': '搜索范围：当前库（文件名 / 标签）',
  'ui.10': '打开方式切换',
  'ui.11': '（默认）',
  'ui.12': '排序：修改时间',
  'ui.13': '排序：名称',
  'ui.14': '排序：大小',
  'ui.15': '收起这一层',
  'ui.16': '点这里看看文件夹里有什么',
  'ui.17': '面板预览',
  'ui.18': '本周改了 ',
  'ui.19': '筛选同标签的笔记',
  'ui.20': '按文件名 / 标签匹配',
  'ui.21': '当前',
  'ui.22': '右键可以切到这个库',
  'ui.23': '这个文件已经不在库里了',
  'ui.24': '打开',
  'ui.25': '已经在当前库里了',
  'ui.26': '复制完整路径',
  'ui.27': '已复制路径',
  'ui.28': '这些文件夹里没有 Markdown 笔记，没东西可引用',
  'ui.29': '选中的项里没有 Markdown 笔记可以打标',
  'ui.30': '给 ',
  'ui.31': ' 项打标签',
  'ui.32': '多个标签用逗号或空格分隔，会合并进每篇笔记的 frontmatter，不覆盖已有标签。',
  'ui.33': '例如：学习, 待读',
  'ui.34': '写入',
  'ui.35': '没输入有效标签',
  'ui.36': '批量重命名 ',
  'ui.37': '前缀，如：2026-',
  'ui.38': '替换为',
  'ui.39': '加前缀',
  'ui.40': '查找替换',
  'ui.41': '查找',
  'ui.42': '执行',
  'ui.43': '查找内容不能为空',
  'ui.44': '取消',
  'ui.45': '把选中的 ',
  'ui.46': ' 项移动到…',
  'ui.47': '🏠 库根目录',
  'ui.48': ' 项复制到…',
  'ui.49': '没有发现别的库（先在 Obsidian 里打开过才会被登记）',
  'ui.50': '一项都没复制成功',
  'ui.51': '当前筛选：',
  'ui.52': '移除这个标签',
  'ui.53': '清除',
  'ui.54': '当前库 · 全部标签',
  'ui.55': '按笔记数降序',
  'ui.56': '关闭标签面板',
  'ui.57': '过滤标签…',
  'ui.58': '没有匹配的标签',
  'ui.59': '当前库笔记还没有任何标签',
  'ui.60': '单击筛选；Ctrl / ⌘ + 单击多选（取交集）',
  'ui.61': '（点搜索框的 ✕ 清除）',
  'ui.62': '智能视图',
  'ui.63': '所有库',
  'ui.64': '按修改时间',
  'ui.65': '按名称',
  'ui.66': '按大小',
  'ui.67': '点击应用这个视图',
  'ui.68': '删除这个视图',
  'ui.69': '已删除视图：',
  'ui.70': '＋ 保存当前视图',
  'ui.71': '保存当前视图为',
  'ui.72': '例如：最近改过的、带 #todo 的',
  'ui.73': '保存',
  'ui.74': '已保存视图：',
  'ui.75': '关闭',
  'ui.76': '已应用视图：',
  'ui.77': '已复制路径：',
  'ui.78': '已复制 Obsidian URI',
  'ui.79': '已复制 Obsidian 链接',
  'ui.80': '这个文件夹里没有 Markdown 笔记，没东西可引用',
  'ui.81': '已复制内部双链',
  'ui.82': '找不到这个条目，可能已经被移动或重命名过了',
  'ui.83': '重命名失败：',
  'ui.84': '当前 Obsidian 版本没有提供重命名弹窗，请在左侧文件列表里重命名文件夹',
  'ui.85': '当前 Obsidian 版本没有提供重命名弹窗，请在左侧文件列表里重命名',
  'ui.86': '这个库不可写（只读盘或没有权限）',
  'ui.87': '重命名文件夹',
  'ui.88': '重命名',
  'ui.89': '下一步',
  'ui.90': '确认重命名',
  'ui.91': '这个库里没有笔记引用它',
  'ui.92': '已重命名',
  'ui.93': '删除',
  'ui.94': '文件夹',
  'ui.95': '文件',
  'ui.96': '找不到这个条目，可能已经被删掉了',
  'ui.97': '没能在回收站里留一份副本：',
  'ui.98': '删除失败：',
  'ui.99': '已创建副本：',
  'ui.100': '创建副本失败：',
  'ui.101': '找不到这个条目',
  'ui.102': '那个库',
  'ui.103': '在左边库导航里右键它 → 切换到此库（会自动把工作台装过去）',
  'ui.104': '没有选中库',
  'ui.105': '未命名',
  'ui.106': '新建失败：',
  'ui.107': '位置：',
  'ui.108': '位置：库根目录 · ',
  'ui.109': '直接写到磁盘上',
  'ui.110': '新建',
  'ui.111': '新建到：',
  'ui.112': '新建到：库根目录',
  'ui.113': '新建文件夹',
  'ui.114': '已新建文件夹：',
  'ui.115': '新建文件夹失败：',
  'ui.116': '新建笔记',
  'ui.117': '刷新',
  'ui.118': '重新扫描',
  'ui.119': '重新扫描这个库',
  'ui.120': '选中本屏全部',
  'ui.121': '清空选择',
  'ui.122': '切成列表视图',
  'ui.123': '切成网格视图',
  'ui.124': '外观设置…',
  'ui.125': '新建文件夹…',
  'ui.126': '新建笔记…',
  'ui.127': '现在没有选中任何东西',
  'ui.128': '没有匹配的文件',
  'ui.129': '近 7 天没有修改的笔记',
  'ui.130': '这个文件夹是空的',
  'ui.131': '（这个文件夹是空的）',
  'ui.132': '空文件夹',
  'ui.133': ' 篇',
  'ui.134': ' · 已选',
  'ui.135': '无标签',
  'ui.136': '最近：',
  'ui.137': '取消删除',
  'ui.138': '读取失败：',
  'ui.139': '书写方式',
  'ui.140': 'Aa 格式',
  'ui.141': '文本格式 / 段落设置 / 插入 / 剪贴板 / 删除（正文里点右键也是这个菜单）',
  'ui.142': '点哪改哪 · ↑↓ 跨段 · 回车换行 · Shift+Enter 另起一段',
  'ui.143': '左写源码 · 右侧实时渲染（滚动同步）',
  'ui.144': '纯源码模式',
  'ui.145': '新的一段，直接开始写',
  'ui.146': '点这里插入内容',
  'ui.147': '点这一段就地编辑',
  'ui.148': '链接文字',
  'ui.149': '笔记名',
  'ui.150': '粗体',
  'ui.151': '斜体',
  'ui.152': '下划线',
  'ui.153': '删除线',
  'ui.154': '代码',
  'ui.155': '高亮',
  'ui.156': '| 列 1 | 列 2 |\n| --- | --- |\n| 内容 | 内容 |',
  'ui.157': '```\n代码\n```',
  'ui.158': '[^1]: 注释内容',
  'ui.159': '](图片路径)',
  'ui.160': '图片说明',
  'ui.161': '当前不可用',
  'ui.162': '文件较大，实时预览已关闭（保存不受影响）',
  'ui.163': '左边写点什么，这里会跟着渲染出来',
  'ui.164': '写回外部库失败：',
  'ui.165': '保存失败：',
  'ui.166': '根目录',
  'ui.167': '未保存…',
  'ui.168': '已保存 ✓',
  'ui.169': '还原面板',
  'ui.170': '铺满工作区',
  'ui.171': '\n\n…（文件较大，仅预览前 ',
  'ui.172': '文件类型',
  'ui.173': '文件大小',
  'ui.174': '修改时间',
  'ui.175': '创建时间',
  'ui.176': '在 Obsidian 中打开',
  'ui.177': '当前环境取不到该文件的磁盘路径，无法调用系统程序。',
  'ui.178': '外部库文件（',
  'ui.179': '）不支持面板内嵌，已为你准备好系统打开入口。',
  'ui.180': '✓ 完成（回阅读）',
  'ui.181': '💾 保存',
  'ui.182': '已保存',
  'ui.183': '↗ 外部打开',
  'ui.184': '✎ 编辑',
  'ui.185': '↗ 在 Obsidian 中打开',
  'ui.186': '适应窗口',
  'ui.187': '实际大小',
  'ui.188': '↗ 用外部程序打开',
  'ui.189': '⤡ 还原面板',
  'ui.190': '⤢ 铺满工作区',
  'ui.191': '复制路径',
  'ui.192': '已复制：',
  'ui.193': '编辑快捷键',
  'ui.194': '✎ / 阅读',
  'ui.195': 'Obsidian 库',
  'ui.196': '自动读取 Obsidian 的仓库清单；可在这里隐藏不常看的库。',
  'ui.197': '「切换」会先把工作台自己装进那个库（没有的话）再切过去，所以切过去照样有工作台 —— ',
  'ui.198': '第一次进某个库要在 设置 → 第三方插件 关掉受限模式一次，这是 Obsidian 的安全设计。',
  'ui.199': '没有发现任何库',
  'ui.200': '这个库就是当前库',
  'ui.201': '切到这个库（会先装好工作台）',
  'ui.202': '这个文件夹还不是一个 Obsidian 库（没有 .obsidian）：先在 Obsidian 里「打开文件夹作为仓库」',
  'ui.203': '先取消隐藏，再切换到这个库',
  'ui.204': '这个库里的工作台已经是最新的',
  'ui.205': '把工作台装进这个库（不动它的设置）',
  'ui.206': '没装上：',
  'ui.207': '未知原因',
  'ui.208': '已把工作台装进「',
  'ui.209': '」；第一次进这个库要关掉受限模式一次。',
  'ui.210': '」里的工作台更新到 v',
  'ui.211': '」里的工作台已经是新版了',
  'ui.212': 'D:\\Obsidian\\某个库',
  'ui.213': '库清单存在哪',
  'ui.214': '手动添加的库同时记两处：本库设置里一份（跟着这个库走），',
  'ui.215': '本机全局一份（切到别的库也还能看见）：',
  'ui.216': '这个路径已经在列表里了',
  'ui.217': '已添加：',
  'ui.218': '（这个文件夹里没有 .obsidian，不像一个 Obsidian 库）',
  'ui.219': '在别的库里做的重命名 / 删除都留了痕，而且**可以撤销**（带「撤销」按钮的那些）。',
  'ui.220': '把这一步改回去（改动的双链也会一起还原）',
  'ui.221': '外部库索引已刷新',
  'ui.222': '搜索索引已清空，下次跨库搜索时会重建',
  'ui.223': '跨库搜索用的索引存在本机 ',
  'ui.224': '，只在你按「🌐 所有库」搜索时才建。',
  'ui.225': '在别的库里删除的文件会先挪到那个库的 .trash 里，这里能一次看全、还原到原位置。',
  'ui.226': '（当前库的删除走 Obsidian 自己的通道，由你在「设置 → 文件与链接」里选的策略决定。）',
  'ui.227': '彻底删除这个库回收站里的全部内容（不可恢复）',
  'ui.228': '清空「',
  'ui.229': '」的回收站？',
  'ui.230': '彻底删掉 ',
  'ui.231': ' 项，**不可恢复**。',
  'ui.232': '清空',
  'ui.233': '已清空 ',
  'ui.234': ' 项',
  'ui.235': '已还原：',
  'ui.236': '不可恢复',
  'ui.237': '彻底删除？',
  'ui.238': ' 会被真的删掉，**不可恢复**。',
  'ui.239': '撤销这一步？',
  'ui.240': '把「',
  'ui.241': '」改回去',
  'ui.242': '（连带 ',
  'ui.243': ' 处双链一起还原）',
  'ui.244': '撤销失败',
  'ui.245': '已撤销：',
  'ui.246': '在 Obsidian 原生设置页中打开本插件 →',

  'misc.indexRefreshed': '库索引已刷新',
  'misc.openMode': '打开方式：{mode}',
  'misc.noDiskPath': '拿不到该文件的磁盘路径',
  'misc.shellOpenFail': '调用系统程序失败：{err}',
  'misc.revealFail': '打开目录失败：{err}',
  'misc.saved': '已保存',
  'misc.refreshed': '已刷新',
  'misc.ok': '确定',
  'misc.cancel': '取消',
  'misc.confirmTitle': '确认',

  'sc.editor.1': '加粗',
  'sc.editor.2': '斜体',
  'sc.editor.3': '下划线',
  'sc.editor.4': '行内代码',
  'sc.editor.5': '删除线',
  'sc.editor.6': '高亮',
  'sc.editor.7': '超链接',
  'sc.editor.8': '清除样式',
  'sc.editor.9': '立即保存',
  'sc.editor.10': '缩进两个空格',
  'sc.editor.11': '提交这一段 / 回到阅读',
  'sc.para.1': '一到六级标题',
  'sc.para.2': '变回正文',
  'sc.para.3': '提升 / 降低标题级别',
  'sc.para.4': '引用',
  'sc.para.5': '有序列表',
  'sc.para.6': '无序列表',
  'sc.para.7': '任务列表',
  'sc.para.8': '代码块',
  'sc.para.9': '公式块',
  'sc.para.10': '表格',
  'sc.nav.1': '后退到上一个目录',
  'sc.nav.2': '前进到下一个目录',
  'sc.nav.3': '回到上一级',
  'sc.nav.4': '回到上一级（文件列表里）',
  'sc.nav.5': '关抽屉 / 退出铺满 / 关右键菜单 / 关预览',
  'sc.files.1': '按当前「打开方式」打开；文件夹则是进下一级',
  'sc.files.2': '把这一个加进多选（再点一次取消）',
  'sc.files.3': '从上次点的那个到这一个，整段多选',
  'sc.files.4': '清空多选',
  'sc.files.5': '文件区顶部出现操作条：复制路径 / 复制内部双链 / 移动 / 删除',
  'sc.files.6': '打开 / 重命名 / 复制 Obsidian 链接 / 复制内部双链 / 复制路径 / 删除',
  'sc.read.1': '像网页一样直接选正文，选完 Ctrl+C 复制走',
  'sc.read.2': '全选正文',
  'sc.read.3': '复制选中文本 / 全选正文 / 复制整篇 Markdown / 复制路径',
  'sc.canvas.1': '就地编辑这一段',
  'sc.canvas.2': '在渲染好的正文里直接拖选，选完 Ctrl+C 就能复制（不会误进编辑态）',
  'sc.canvas.3': '在段首 / 段尾时跳到上一段 / 下一段',
  'sc.canvas.4': '在本段里换行（段落 / 标题写 Markdown 硬换行，渲染出来看得见）',
  'sc.canvas.5': '完成这一段，紧接着另起新的一段',
  'sc.canvas.6': '行尾回车自动续一行；空项上回车跳出列表',
  'sc.canvas.7': '只换行，不动块本身',
  'sc.canvas.8': '删除选中内容（没选中就删光标后面一个字符）',
  'sc.canvas.9': '在段首退格 = 并到上一段',
  'sc.canvas.10': '在文末新建一段',
  'sc.canvas.11': '复制选中 / 文本格式 / 段落设置 / 插入 / 剪贴板 / 删除',
  'sc.canvas.12': '提交这一段，回到渲染',

  'ui.247': '：没有权限（机器上的权限 / 安全软件拦住了，换个普通文件夹再试）',
  'ui.248': '：这个位置是只读的（只读盘 / 受保护的目录）',
  'ui.249': '：路径不存在，库可能被移动或删掉了',
  'ui.250': '：磁盘空间不足',
  'ui.251': '：文件正被别的程序占用',
  'ui.252': '：这是个文件夹，不是文件',
  'ui.253': '：跨磁盘移动失败',
  'ui.254': '坚果云',
  'ui.255': '微力同步',
  'ui.256': '缺少插件 id / 源目录 / 目标库路径',
  'ui.257': '这个文件夹还不是一个 Obsidian 库（里面没有 .obsidian）',
  'ui.258': ' —— 先在 Obsidian 里「打开文件夹作为仓库」，再切过来',
  'ui.259': '读不到自己的 manifest.json',
  'ui.260': '读不到自己的版本号',
  'ui.261': '写入失败：',
  'ui.262': '目标已经存在了：',
  'ui.263': '重命名失败',
  'ui.264': '找不到：',
  'ui.265': '删除失败',
  'ui.266': '不知道它原来在哪（不是工作台删的，不能乱猜）',
  'ui.267': '彻底删除失败',
  'ui.268': '撤销删除失败',
  'ui.269': '已经存在了：',
  'ui.270': '新建失败',
  'ui.271': '新建文件夹失败',
  'ui.272': '复制失败',
  'ui.273': '这个类型没有原生视图',
  'ui.274': '图片 / PDF / 音视频等附件体积',
  'ui.275': '文件',
  'ui.276': '文件夹',
  'ui.277': '画布',
  'ui.278': '思维导图',
  'ui.279': 'Markdown',

  'notice.skipNotes': '，跳过 {n} 篇',
  'notice.failNotes': '，失败 {n} 篇',
  'notice.skipItems': '，跳过 {n} 项（已在目标里 / 重名）',
  'notice.failItems': '，{n} 项失败',
  'notice.copyNone': '一项都没复制成功',
  'notice.copiedTo': '已复制 {n} 项到「{name}」',
  'notice.filteredByTag': '已按标签筛选：{tag}（点搜索框的 ✕ 清除）',
  'picker.copyToTitle': '复制到「{name}」',
  'picker.copyToDesc': '复制 {n} 项到这个库的根目录（同名会自动加序号，绝不覆盖）。原件留在原处不动 —— 复制不会造成跨库断链，这也是我们不做「跨库移动」的原因。',
  'picker.copyN': '复制 {n} 项',
  'cross.hits': '所有库 · 命中 {n} 篇',
  'views.empty': '还没有保存的视图 —— 设好搜索 / 排序后点下方「保存当前」',
  'scope.all.tip': '正在跨库全文搜索（第一次为每个库建索引时会稍慢）\n点击回到只搜当前库',
  'scope.current.tip': '只搜当前库的文件名与标签\n点击切成「所有库」—— 搜全部库的正文，不用切窗口',
  'set.title': 'Vault Workbench · 多库工作台',
  'set.tab.general': '通用',
  'set.tab.appearance': '外观',
  'set.tab.vaults': '库管理',
  'set.tab.safety': '安全与日志',
  'set.tab.about': '关于',
  'set.langChanged': '界面语言：{lang}',
  'set.openUpdated': '打开方式已更新',
  'set.panelNote': '工作面板模式下编辑：文档右上角「编辑」切到编辑器。默认是「即时渲染」单画布——正文以渲染后的样式铺开，点任意一段就地改。',
  'set.openTip': '提示：文件区工具条上的「打开方式切换」下拉可以随时切换，也可以在工作台左下角「设置 → 打开方式 / 编辑器」里改。',
  'set.accentPurple': '紫',
  'set.accentBlue': '蓝',
  'set.accentRed': '红',
  'set.accentGreen': '绿',
  'set.accentGold': '金',
  'set.density.tight': '紧凑',
  'set.density.comfy': '标准',
  'set.density.loose': '宽松',
  'set.pos.side': '侧滑',
  'set.pos.float': '悬浮',
  'set.pos.bottom': '底部',
  'set.click.open': '打开它（并清空选择，Windows 习惯）',
  'set.click.deselect': '只取消选中它（保留其余选择）',
  'set.vaultsNote': '这里列出 Obsidian 已注册的仓库（自动读取 obsidian.json），可隐藏或改名；也可手动添加未注册的文件夹。',
  'set.toggleShow': '显示 / 隐藏',
  'set.alias': '别名',
  'set.logNote': '当前仅记录新建、重命名、删除等写操作；带「撤销」按钮的都能回退。',
  'set.logRecent': '操作日志（最近 20 条）',
  'set.logEmpty': '暂无记录',
  'set.aboutIntro': 'Vault Workbench —— 多库工作台。当前库走 Obsidian 原生 API（完整编辑能力），其他仓库通过磁盘扫描：可以读、可以改已有文件的正文（原子写）；新建 / 重命名 / 删除要切到那个库去做 —— 在左侧库导航右键目标库 → 切换到此库，会先把工作台装过去再切，切过去照样有工作台。',
  'set.aboutRoadmap': '路线图：收集箱消化模式 → 批量整理 → 规则引擎与体检报告 → 统计热力图 → 跨库搜索。',
  'set.aboutPlan': '设置中心的分页结构已预留，后续新功能都往这里挂。',
  'set.wallpaperHint': 'D:\\图片\\wallpaper.jpg',
  'dialog.renameExternal': '这是「{vault}」里的条目，改完会把这个库里引用它的双链一起改掉（只改 .md）',
  'dialog.renameTitle': '重命名「{name}」',
  'dialog.renameOk': '重命名',
  'dialog.renameNext': '下一步',
  'dialog.renameConfirm': '确认重命名',
  'dialog.refsCount': '这个库里有 {n} 篇笔记引用它，共 {m} 处，会一并改掉',
  'dialog.refsNone': '这个库里没有笔记引用它',
  'dialog.renameAndRefs': '重命名（并改 {n} 处引用）',
  'dialog.renamedRefs': '已重命名，顺带更新了 {n} 处双链',
  'dialog.deleteExternal': '「{name}」会挪到 {vault} 的 .trash 里（可以到操作日志撤销）\n',
  'dialog.deadLinks': '⚠ 这个库里有 {n} 处引用会变成死链',
  'dialog.deletedTrash': '已删除：（在 {vault}/.trash 里，操作日志可撤销）',
  'dialog.deletedRecycle': '已删除：（在 设置 → 回收站 里能看到、能还原）',
  'dialog.needSwitch': '「{from}」要切到「{to}」才能做 —— ',
  'dialog.newNoteIn': '在「{name}」里新建笔记',
  'dialog.newNoteLocal': '已新建：（这个库不在当前 Obsidian 里，用工作台内编辑）',
  'dialog.newFolderIn': '在「{name}」里新建文件夹',
  'tip.openModeCur': '当前：{label} —— {tip}\n点击展开三种模式',
  'notice.rescanned': '已重新扫描：{name}',
  'switch.vaultCur': '当前库\n右键可以切到这个库',
  'menu.switchVaultTo': '切换到此库（{name}）',
  'views.searchTag': '搜「{q}」',
  'dialog.refsLine': '这个库里有 {n} 篇笔记引用它，共 {m} 处，会一并改掉',
  'dialog.renameRefsN': '（并改 {n} 处引用）',
  'dialog.renamedLinks': '，顺带更新了 {n} 处双链',
  'dialog.deletedTrashPath': '已删除：（在 {vault}/.trash 里，操作日志可撤销）',
  'dialog.switchNeeded': '「{from}」要切到「{to}」才能做 —— ',
  'dialog.alreadyInVault': '已经在「{name}」里了',
  'dialog.newNoteTitle': '在「{name}」里新建笔记',
  'dialog.newNoteDone': '已新建：（这个库不在当前 Obsidian 里，用工作台内编辑）',
  'dialog.newFolderTitle': '在「{name}」里新建文件夹',
  'notice.rescannedVault': '已重新扫描：{name}',
  'cross.curVaultCell': '当前库',
  'cross.curVaultTip': '\n右键可以切到这个库',
  'menu.switchVaultCell': '切换到此库（{name}）',
  'views.searchTagQ': '搜「{q}」',
  'dialog.refsLineN': '这个库里有 {n} 篇笔记引用它，共 {m} 处，会一并改掉',
  'dialog.renameRefsParen': '（并改 {n} 处引用）',
  'dialog.renamedLinksCn': '，顺带更新了 {n} 处双链',
  'dialog.deletedTrashInVault': '已删除：（在 {vault}/.trash 里，操作日志可撤销）',
  'dialog.switchToDo': '「{action}」要切到「{name}」才能做 —— ',
  'dialog.alreadyInName': '已经在「{name}」里了',
  'dialog.newNoteInVault': '在「{name}」里新建笔记',
  'dialog.newNoteCreated': '已新建：（这个库不在当前 Obsidian 里，用工作台内编辑）',
  'dialog.newFolderInVault': '在「{name}」里新建文件夹',
  'preview.openFolderMenu': '🗂 打开文件目录',
  'drawer.vaultUpdatedTo': '已把「{name}」里的工作台更新到 v{ver}',
  'drawer.undo': '撤销',
  'dlg.okText': '确定',
  'set.panelNoteLong': '工作面板模式下编辑：文档右上角「编辑」切到编辑器。默认是「即时渲染」单画布——正文以渲染后的样式铺开，点任意一段就地改成源码、改完立刻回到渲染样式，段与段之间没有「盒子」边界；↑↓ 跨段，段尾回车空出新的一段、Shift+Enter 在本段里换行、写到列表 / 引用末尾会自动续一行、段首退格并到上一段。顶栏可切「双栏分屏」（源码 + 实时渲染，滚动同步）或「纯源码」。正文里点右键有完整格式菜单（命令作用在右键点的那一段上），Ctrl+B / I / U / K、Ctrl+1~6 标题、Ctrl+Shift+Q 引用等快捷键照常用；停止输入 0.8 秒自动保存，Ctrl+S 立即保存，Esc 回阅读。外部库文件会直接写回磁盘上的原文件。',
  'set.openTipLong': '提示：文件区工具条上的「打开方式切换」下拉可以随时切换，也可以在工作台左下角「设置 → 打开方式 / 编辑器」里改。目录导航支持 Alt+← 后退 / Alt+→ 前进 / Alt+↑ 上一级。完整快捷键见「设置 → 使用说明」。',
  'set.wallpaperPlaceholder': 'D:\\图片\\wallpaper.jpg',
  '点文件 / 文件夹': '点文件 / 文件夹',
  'Ctrl / ⌘ + 点': 'Ctrl / ⌘ + 点',
  'Shift + 点': 'Shift + 点',
  '点空白处': '点空白处',
  '多选后': '多选后',
  '右键任意一项': '右键任意一项',
  '鼠标拖选': '鼠标拖选',
  '在正文里点右键': '在正文里点右键',
  '点任意一段': '点任意一段',
  'Enter（列表 / 引用）': 'Enter（列表 / 引用）',
  'Enter（代码块 / 表格 / Front Matter）': 'Enter（代码块 / 表格 / Front Matter）',
  '点画布空白': '点画布空白',
  '点右键 / Aa 格式': '点右键 / Aa 格式',
  'bar.new': '+ 新建',
  'bar.new.tip': '在当前目录新建文件（直接在工作台里编辑）或新建文件夹',
  'switch.notVaultFix': ' —— 先在 Obsidian 里「打开文件夹作为仓库」，才能切过去',
  'switch.restrictedHint': '；第一次进这个库要在 设置 → 第三方插件 关掉受限模式一次。',
  'switch.cloudHint': '提示：{name} 在云同步目录里，切过去改的时候注意别和别的设备同时改',
  'switch.noPath': '这个库没有路径信息',
  'switch.alreadyIn': '已经在 {name} 里了',
  'switch.notVault': '「{name}」还不是一个 Obsidian 库（里面没有 .obsidian）',
  'switch.installFail': '没能装好工作台：{reason}',
  'switch.installed': '已把工作台装进「{name}」',
  'switch.installedVer': '已把工作台装进「{name}」（v{ver}）',
  'switch.updated': '已把「{name}」里的工作台从 v{from} 更新到 v{to}',
  'switch.jumpFail': '自动跳转失败，手动打开这个链接：{uri}',
  'switch.switching': '正在切换到：{name}（那个库若在别的窗口里开着，切过去按 Ctrl+R 重载一次）',


};

/* 英文：抽屉设置 + 模式/壁纸/预设已覆盖；guide 页长说明与文件区文案在后续批次补齐 */
const I18N_EN = {
  'common.ok': 'OK',
  'common.cancel': 'Cancel',
  'common.confirm': 'Confirm',
  'common.close': 'Close',
  'common.clear': 'Clear',
  'common.delete': 'Delete',
  'common.rename': 'Rename',
  'common.open': 'Open',
  'common.copy': 'Copy',
  'common.move': 'Move',
  'common.folder': 'Folder',
  'common.file': 'File',
  'common.note': 'note',
  'common.notes': 'notes',
  'common.vault': 'Vault',
  'common.currentVault': 'Current vault',
  'common.otherVault': 'Other vault',
  'common.workbench': 'Workbench',
  'common.root': 'Vault root',
  'common.emptyFolder': 'Empty folder',
  'common.selected': 'selected',
  'common.items': '{n} items',
  'common.compact': 'Compact',
  'common.standard': 'Standard',
  'common.loose': 'Loose',
  'common.side': 'Slide',
  'common.float': 'Float',
  'common.bottom': 'Bottom',
  'common.current': 'Current',
  'common.switch': 'Switch',
  'common.show': 'Show',
  'common.hide': 'Hide',
  'common.add': 'Add',
  'common.remove': 'Remove',
  'common.path': 'Path',
  'common.undo': 'Undo',
  'common.noTags': 'No tags',
  'common.recentNote': 'Latest: {name}',
  'common.installed': 'Installed',
  'common.rebuild': 'Rebuild',
  'common.rescan': 'Rescan',
  'common.more': 'More',
  'common.unknown': 'Unknown',

  'dlg.ok': 'OK',
  'dlg.cancel': 'Cancel',

  'set.lang.name': 'Interface language',
  'set.lang.desc': 'Follow Obsidian, or pick manually',
  'set.lang.auto': 'Follow Obsidian',
  'set.lang.zh': '中文',
  'set.lang.en': 'English',

  'dash.total': 'Notes',
  'dash.mdLine': 'MD {md} · Canvas {canvas} · Excalidraw {excali}',
  'dash.total.tip': 'Click to clear all filters and show every note in this vault',
  'dash.week': 'Changed this week',
  'dash.week.sub': 'Modified in last 7 days',
  'dash.week.tip': 'Click to filter notes changed in the last 7 days (newest first)',
  'dash.inbox': 'Inbox',
  'dash.inbox.sub': 'Click to open {name}',
  'dash.inbox.create': 'Create {name}',
  'dash.inbox.tip': 'Open the inbox folder',
  'dash.inbox.createTip': 'Create the {name} folder at the vault root',
  'dash.inbox.unset': 'Not set',
  'dash.tags': 'Tags',
  'dash.tags.tip': 'Click to browse all tags in this vault',
  'dash.tags.none': 'No tags yet',

  'drawer.title': 'Settings · {page}',
  'drawer.collapse': 'Collapse',
  'drawer.nav.appearance': 'Appearance',
  'drawer.nav.editor': 'Editor',
  'drawer.nav.open': 'Open with',
  'drawer.nav.guide': 'Usage',
  'drawer.nav.vaults': 'Manage vaults',
  'drawer.nav.logs': 'Activity log',
  'drawer.nav.trash': 'Trash',
  'drawer.nav.about': 'About',
  'drawer.appearance.preset': 'Preset',
  'drawer.appearance.wallpaper': 'Workbench wallpaper',
  'drawer.appearance.custom': 'Custom',
  'drawer.appearance.pick': 'Choose file',
  'drawer.appearance.noFile': 'No file chosen',
  'drawer.appearance.loaded': 'Custom image loaded',
  'drawer.appearance.dim': 'Dim',
  'drawer.appearance.blur': 'Blur',
  'drawer.appearance.accent': 'Accent color',
  'drawer.appearance.density': 'Density',
  'drawer.appearance.behavior': 'Behavior',
  'drawer.appearance.scope': 'Editing scope: {scope}',
  'drawer.appearance.scope.global': 'Global appearance',
  'drawer.appearance.scope.per': 'Custom for {name}',
  'drawer.appearance.save': 'Save & apply',
  'drawer.appearance.saved': 'Appearance saved and applied',
  'drawer.appearance.native': 'Open this plugin in Obsidian settings →',
  'drawer.appearance.wpApplied': 'Custom wallpaper applied',
  'drawer.appearance.wpTooBig': 'Image is over 8MB — pick a smaller one (it slows rendering)',
  'drawer.appearance.wpLarge': 'Large image ({size}) may slow rendering',
  'drawer.tg.stats': 'Show stats cards at root',
  'drawer.tg.meta': 'Show tags & dates on cards',
  'drawer.tg.summary': 'Show note excerpts on cards',
  'drawer.tg.pervault': 'Per-vault appearance',
  'drawer.open.title': 'What clicking a file does',
  'drawer.open.note': 'Switch anytime — the “Open with” dropdown on the toolbar is the same switch.',
  'drawer.open.using': '✓ In use',
  'drawer.open.def': ' (default)',
  'drawer.open.guide': 'Shortcuts and usage: see “Usage” on the left.',
  'drawer.editor.title': 'Default writing mode',
  'drawer.editor.note': 'Which mode opens when you hit “Edit” on a document. You can switch in the editor toolbar anytime.',
  'drawer.editor.split': 'Split panes',
  'drawer.editor.sync': 'Sync scroll between source and preview',
  'drawer.editor.scKeys': 'Editing shortcuts',
  'drawer.editor.scPara': 'Paragraphs & headings',
  'drawer.editor.scCanvas': 'Writing in the canvas (continuous)',
  'drawer.editor.canvasNote': 'Right-click in the text (or the “Aa” button) for the full menu: formatting / paragraphs / insert / cut-copy-paste / delete.',
  'drawer.vaults.title': 'Obsidian vaults',
  'drawer.vaults.none': 'No vaults found',
  'drawer.vaults.current': 'Current',
  'drawer.vaults.switch': 'Switch',
  'drawer.vaults.installed': 'Installed',
  'drawer.vaults.update': 'Update',
  'drawer.vaults.install': 'Install',
  'drawer.vaults.show': 'Show',
  'drawer.vaults.hide': 'Hide',
  'drawer.vaults.hidden': ' (hidden)',
  'drawer.vaults.addTitle': 'Add folder manually',
  'drawer.vaults.path': 'Path',
  'drawer.vaults.add': 'Add',
  'drawer.vaults.addedTitle': 'Manually added vaults',
  'drawer.vaults.remove': 'Remove',
  'drawer.vaults.where': 'Where the vault list lives',
  'drawer.logs.title': 'Activity log',
  'drawer.logs.empty': 'Nothing yet',
  'drawer.logs.undo': 'Undo',
  'drawer.logs.index': 'Indexes',
  'drawer.logs.external': 'Other vaults',
  'drawer.logs.reindex': 'Rescan',
  'drawer.logs.searchIdx': 'Search index',
  'drawer.logs.rebuild': 'Rebuild',
  'drawer.trash.title': 'Trash',
  'drawer.trash.empty': 'Trash is empty',
  'drawer.trash.items': '{n} items',
  'drawer.trash.clear': 'Empty',
  'drawer.trash.origin': 'Was at: {path}',
  'drawer.trash.unknown': 'Original location unknown (not deleted by the workbench)',
  'drawer.trash.restore': 'Restore',
  'drawer.trash.cant': 'Cannot restore',
  'drawer.trash.purge': 'Delete forever',
  'drawer.about.guide': 'Shortcuts and usage: see “Usage” on the left',

  'mode.open.panel.label': 'Preview panel',
  'mode.open.panel.tip': 'Preview files in the right panel — no tab switching',
  'mode.open.workbench.label': 'Panel',
  'mode.open.workbench.tip': 'Open full-width inside the workbench: read / edit / outline',
  'mode.open.native.label': 'Native editor',
  'mode.open.native.tip': 'Open in a new Obsidian tab with the official editor',
  'mode.editor.live.label': 'Live preview',
  'mode.editor.live.tip': 'Single canvas: rendered text, click any block to edit',
  'mode.editor.split.label': 'Split',
  'mode.editor.split.tip': 'Source + live preview side by side, scroll synced',
  'mode.editor.source.label': 'Source',
  'mode.editor.source.tip': 'Edit the Markdown source directly',
  'mode.open.panel.chip': '▭ Preview',
  'mode.open.workbench.chip': '⤢ Panel',
  'mode.open.native.chip': '🗂 Native',
  'mode.editor.live.chip': '◉ Live',
  'mode.editor.split.chip': '▥ Split',
  'mode.editor.source.chip': '▤ Source',

  'wp.none': 'None',
  'wp.starry': 'Starry',
  'wp.bamboo': 'Bamboo',
  'wp.paper': 'Paper',
  'wp.ocean': 'Ocean',
  'preset.glass': 'Glass',
  'preset.minimal': 'Dark minimal',
  'preset.mag': 'Magazine',
  'preset.contrast': 'High contrast',

  'bar.grid': '▦ Grid',
  'bar.list': '☰ List',
  'bar.expandAll': '⤢ Expand all',
  'bar.collapseAll': '⤡ Collapse all',
  'bar.expandAll.tip': 'Expand every folder under the current one',
  'bar.collapseAll.tip': 'Collapse all expanded folders',
  'bar.views': '🔖 Views',
  'bar.views.tip': 'Save or apply smart views (search + sort + scope)',
  'bar.openMode': 'Open with',
  'bar.sort.mtime': 'Sort: modified',
  'bar.sort.name': 'Sort: name',
  'bar.sort.size': 'Sort: size',
  'bar.up': '← Up one level',
  'bar.back': 'Back to previous folder (Alt + ←)',
  'bar.fwd': 'Forward to next folder (Alt + →)',

  'batch.selected': '{n} selected',
  'batch.copyPath': 'Copy paths',
  'batch.copyLinks': 'Copy wiki links',
  'batch.tag': 'Add tags…',
  'batch.rename': 'Rename…',
  'batch.moveTo': 'Move to…',
  'batch.copyTo': 'Copy to…',
  'batch.delete': 'Delete',
  'batch.deleteConfirm': 'Delete {n} items',
  'batch.clear': 'Clear selection',

  'menu.switchVault': 'Switch to this vault ({name})',
  'menu.enter': 'Open this folder',
  'menu.newHere': 'New note here',
  'menu.newHere.wb': 'Edit in the workbench (default)',
  'menu.newHere.native': 'Open in the Obsidian editor',
  'menu.open': 'Open (current mode)',
  'menu.openPanel': 'Preview in right panel',
  'menu.openNative': 'Open in Obsidian',
  'menu.copyUri.file': 'Copy Obsidian link',
  'menu.copyUri.folder': 'Copy folder link',
  'menu.copyWikilink': 'Copy wiki link',
  'menu.copyWikilink.folder': 'Copy wiki links (incl. sub-notes)',
  'menu.copyWikilink.multi': 'Copy wiki links for {n} items',
  'menu.copyPath': 'Copy path',
  'menu.copyPath.multi': 'Copy {n} paths',
  'menu.copyPath.uri': 'Obsidian URI',
  'menu.copyPath.rel': 'Vault-relative path',
  'menu.copyPath.abs': 'Absolute path',
  'menu.moveTo.file': 'Move file to…',
  'menu.moveTo.folder': 'Move folder to…',
  'menu.duplicate': 'Duplicate',
  'menu.rename': 'Rename…',
  'menu.renameFolder': 'Rename folder…',
  'menu.reveal': 'Reveal in Explorer',
  'menu.delete.file': 'Delete file',
  'menu.delete.folder': 'Delete folder',
  'menu.delete.multi': 'Delete {n} items',
  'menu.why.noLink': 'Notes in other vaults are not in this vault — switch there to copy a working link',
  'menu.why.noWrite': 'This vault is read-only (no write permission)',
  'menu.why.noNative': 'This file type has no native view',

  'blank.newNote': 'New note',
  'blank.newFolder': 'New folder',
  'blank.selectAll': 'Select all on screen',
  'blank.switchView': 'Switch view',
  'blank.rescan': 'Rescan',
  'blank.appearance': 'Appearance settings',
  'blank.toListView': 'Switch to list view',
  'blank.toGridView': 'Switch to grid view',
  'blank.rescanVault': 'Rescan this vault',
  'blank.why.noSel': 'Nothing is selected right now',

  'empty.noMatch': 'No matching files',
  'empty.weekNone': 'No notes changed in the last 7 days',
  'empty.folderEmpty': 'This folder is empty',
  'empty.folderEmptySub': '(This folder is empty)',
  'empty.crossNone': 'Nothing found for “{q}” in any vault',

  'notice.copied': 'Copied',
  'notice.copiedPath': 'Copied path: {path}',
  'notice.copiedPaths': 'Copied {n} paths',
  'notice.copiedLinks': 'Copied {n} wiki links',
  'notice.copiedUri': 'Copied Obsidian URI',
  'notice.copiedUris': 'Copied {n} URIs',
  'notice.copiedRel': 'Copied {n} relative paths',
  'notice.copiedAbs': 'Copied {n} absolute paths',
  'notice.moved': 'Moved {n} items',
  'notice.movedSkipped': ', skipped {n} (already in target / duplicate name)',
  'notice.deleted': 'Deleted {n} items',
  'notice.deletedFail': ', {n} failed',
  'notice.deletedHint': ' (still recoverable from trash)',
  'notice.tagged': 'Tagged {n} notes',
  'notice.renamed': 'Renamed {n} items',
  'notice.searchAll': 'Scope: all vaults (full text)',
  'notice.searchCurrent': 'Scope: current vault (name / tags)',

  'rail.title': 'Vaults',
  'rail.expand': '⤢ Expand',
  'rail.collapse': '⤡ Collapse',
  'rail.expand.tip': 'Expand the vault sidebar',
  'rail.collapse.tip': 'Collapse the vault sidebar (icons only)',
  'rail.collapsed.tip': 'Vaults (collapsed) — click Expand above',
  'rail.none': 'No vaults found — add one manually in settings',
  'rail.badge.current': 'Current',
  'rail.badge.folder': 'Folder',
  'rail.badge.folder.tip': 'Not an Obsidian vault (no .obsidian inside) — browse only; use “Open folder as vault” in Obsidian first to switch to it',
  'rail.badge.none': 'Not installed',
  'rail.badge.none.tip': 'The workbench is not installed here — “Switch to this vault” installs it first, then switches',
  'rail.badge.stale': 'Outdated',
  'rail.badge.stale.tip': 'This vault has v{ver} — “Switch to this vault” updates it along the way',
  'rail.tip': 'Right-click a vault → Switch to this vault',
  'rail.tip.title': 'The workbench is installed into that vault first, so it works right after switching',
  'rail.settings': 'Settings',
  'rail.settings.tip': 'Open settings (appearance / open with / vaults / log / about)',
  'rail.rediscover': 'Rediscover',
  'rail.rediscover.tip': 'Rescan the Obsidian vaults on this machine',
  'rail.rediscovered': 'Vaults rescanned',
  'rail.openSettingsTip': 'Open Settings → Community plugins → Vault Workbench',
  'rail.menu.switch': 'Switch to this vault',
  'rail.menu.switchCur': 'This is the current vault',
  'rail.menu.switchWhy': 'You are already in this vault',
  'rail.menu.install': 'Install the workbench here',
  'rail.menu.installOk': 'Workbench is up to date (v{ver})',
  'rail.menu.installOkWhy': 'The workbench in this vault is already the latest',
  'rail.menu.update': 'Update the workbench here (v{ver} → latest)',
  'rail.menu.browse': 'Browse here (stay in current vault)',
  'rail.menu.refresh': 'Rescan this vault',
  'rail.menu.copyUri': 'Copy Obsidian vault link',
  'rail.menu.reveal': 'Reveal in Explorer',
  'rail.menu.hide': 'Hide in sidebar',
  'rail.menu.hideWhy': 'The current vault cannot be hidden (the workbench runs on it)',
  'rail.notVault': 'This folder is not an Obsidian vault yet (no .obsidian) — use “Open folder as vault” in Obsidian first',
  'rail.installFail': 'Install failed: {reason}',
  'rail.installed': 'Installed the workbench into “{name}” — the first time you enter it, turn off Restricted mode once (Settings → Community plugins).',
  'rail.updated': 'Updated the workbench in “{name}” to v{ver}',
  'rail.alreadyNew': 'The workbench in “{name}” is already up to date — nothing changed',
  'rail.refreshed': 'Rescanned: {name}',
  'rail.copiedUri': 'Copied Obsidian vault link',
  'rail.hidden': 'Hidden: {name}',

  'guide.quick': 'Getting started',
  'guide.feats': 'What the editor can do',
  'guide.step1': '① Pick a vault in the sidebar. Use the expand / collapse button next to the title to fold it.',
  'guide.step2': '② Click a folder card to go deeper; in list view, click the ▸ in front of a folder to expand it in place and see what is inside. Right-click a file or folder for open / rename / copy path / delete. “← Up one level” and any breadcrumb segment take you back; the ⇦ ⇨ buttons or Alt + ← / → move through your history.',
  'guide.step3': '③ Clicking a file opens it with the mode chosen in “Open with” (default: preview in the right panel, just a quick look).',
  'guide.step4': '④ Top-right of the preview: edit ⇄ read · ☰ outline · ⤢ maximize · ✕ close.',
  'guide.step5': '⑤ Editing defaults to live preview on a single canvas: the text is rendered, click any block to edit in place; ↑ / ↓ move between blocks, Enter only adds a line break, Shift + Enter starts a new block, Backspace at the start merges into the previous block.',
  'guide.step6': '⑥ Right-click any vault in the sidebar → “Switch to this vault”: the workbench is installed into that vault first if needed, then you switch — the workbench is there too. In other vaults you can edit note bodies; create / rename / delete need you to switch there first.',
  'guide.feat1': 'Click to edit: in live preview, click a block to edit it right there; it snaps back to rendered style as soon as you are done. No boxes between blocks — it reads as one continuous note.',
  'guide.feat2': 'Continuous writing: ↑ / ↓ jump to the previous / next block at block boundaries; Shift + Enter finishes the block and starts a new one; Backspace at the start merges up; click the empty space below the text to keep writing at the end.',
  'guide.feat3': 'Enter vs line break: Enter inserts a line break inside the block (for paragraphs and headings this is a Markdown hard break, so the break is visible when rendered); Shift + Enter finishes the block and creates the next one. Code blocks / tables / front matter are taken as-is, both keys just insert a newline. In lists and quotes, Enter at the end continues the list; Enter on an empty item leaves the list.',
  'guide.feat4': 'Right-click menu: in the text (or via “Aa” in the toolbar) you get formatting / paragraph / insert / cut-copy-paste / delete. Commands apply to the block you right-clicked (it is brought into edit mode first); on empty space with nothing being edited, they apply to the whole note.',
  'guide.feat5': 'File area menu: right-click a file for open / preview in panel / open in Obsidian / copy Obsidian link / copy wiki link / copy path / rename / reveal in Explorer / delete. Folders add “New note here” (choose to edit in the workbench or open the Obsidian editor). Deletion goes through Obsidian itself, following the trash policy in Settings → Files & Links, so it is recoverable. In other vaults, rename / delete / create / copy link are greyed out — right-click that vault in the sidebar and switch to it for full access.',
  'guide.feat6': 'Empty folders are listed too (the folder list reads the vault tree directly, it is not inferred from notes) and marked “Empty folder”; expanding one in list view shows “(This folder is empty)”. Files at the vault root are listed as files.',
  'guide.feat7': 'Links that still work outside: “Copy Obsidian link” gives obsidian://open?vault=…&file=… — paste it into chat or mail and it opens on a machine with Obsidian. “Copy wiki link” gives [[path]] which becomes a clickable link back in Obsidian. On a folder, it lists one wiki link per line for every note underneath.',
  'guide.feat8': 'Batch actions: Ctrl / ⌘ + click adds an item, Shift + click selects a range — a toolbar appears at the top: copy paths (full disk paths) / copy wiki links / move… (via Obsidian renameFile, so wiki links update) / delete (needs a second click) / clear selection.',
  'guide.feat9': 'Drag-select and copy: in live preview and read mode you can select text with the mouse like on a web page and hit Ctrl + C; with a selection, clicking the block is not treated as “edit this block”. Right-clicking in read mode also has a menu: copy selected text / select all / copy whole Markdown / copy file path.',
  'guide.feat10': 'Outline: available in both read and edit mode — click a heading to jump to it.',
  'guide.feat11': 'Auto-save: 0.8s after you stop typing, or Ctrl + S to save now. Files in other vaults are written straight back to disk.',
  'guide.feat12': 'Cross-vault search: click “📍 current vault” on the toolbar to switch to “🌐 all vaults” and you search the body text of every vault (name, tags and content). Each result is tagged with its vault, shows the matching snippet with the keyword highlighted, and opens right here — no switching. Separate words with a space (all words must appear). The index is built locally; the first switch is slower, then it is fast.',
  'guide.feat13': 'Rubber-band select and blank right-click: drag with the left button on empty space in the file area to box-select (hold Ctrl / ⌘ to add, otherwise it replaces); click empty space to clear. Right-clicking empty space gives new note / new folder / select all on screen / switch view / rescan / appearance settings. Ctrl + click and Shift + click still work as before.',
  'guide.feat14': 'Trash: things deleted in other vaults show up in Settings → Trash with their original path, so restoring puts them back (survives an Obsidian restart). You can also delete them permanently or empty a vault trash there (both ask again).',
  'guide.feat15': 'Three writing modes: ◉ live preview (default) / ▥ split panes (scroll synced) / ▤ plain source.',
  'guide.iconTitle': 'Small icons in the file area',
  'guide.paraKeys': 'Paragraph & heading shortcuts',
  'guide.canvasKeys': 'Continuous writing in the canvas',
  'guide.readCopy': 'Copying in read mode',
  'guide.fileKeys': 'File area & batch actions',
  'guide.navKeys': 'Folder & window shortcuts',
  'guide.icon1': 'Top-right of a card: quick look (preview in the right panel) — does not change your default open mode',
  'guide.icon2': 'Top-right of the preview: enter / leave workbench editing',
  'guide.icon3': 'Top-right of the preview: outline',
  'guide.icon4': 'Top-right of the preview: fill the whole workspace / restore',
  'guide.icon5': 'Rather not edit here — jump back to the Obsidian editor',

  'about.title': 'Vault Workbench · multi-vault workbench',
  'about.intro': 'A workbench for managing many vaults. The current vault uses the Obsidian API (full editing), other vaults are read from disk: you can read them and edit the body of existing files (atomic writes), but not change their structure (create / rename / delete) — right-click that vault in the sidebar and switch to it for that; the workbench comes with you.',
  'about.version': 'Version: {ver}',
  'about.rail': 'The vault sidebar can be expanded / collapsed; “Open with” on the toolbar switches between preview panel / workbench panel / native editor.',
  'about.editor': 'The built-in editor defaults to live preview on a single canvas: click to edit, rendered as you go. You can switch to split panes or plain source. Right-click in the text for the full formatting menu.',
  'about.roadmap': 'Roadmap: inbox triage → batch organize → rules engine & health report → activity heatmap → cross-vault search.',

  'editorMenu.copy-sel': 'Copy selected text',
  'editorMenu.copy-block': 'Copy this block source',
  'editorMenu.copy-all': 'Copy whole Markdown',
  'editorMenu.select-all': 'Select all',
  'editorMenu.select-all-doc': 'Select all text',
  'editorMenu.copy-path': 'Copy file path',
  'editorMenu.link': 'Insert link',
  'editorMenu.extlink': 'Insert external link',
  'editorMenu.format': 'Formatting',
  'editorMenu.para': 'Paragraph',
  'editorMenu.insert': 'Insert',
  'editorMenu.cut': 'Cut',
  'editorMenu.copy': 'Copy',
  'editorMenu.paste': 'Paste',
  'editorMenu.paste-plain': 'Paste as plain text',
  'editorMenu.del-sel': 'Delete selection',
  'editorMenu.del-block': 'Delete this block',
  'editorMenu.bold': 'Bold',
  'editorMenu.italic': 'Italic',
  'editorMenu.underline': 'Underline',
  'editorMenu.strike': 'Strikethrough',
  'editorMenu.code': 'Inline code',
  'editorMenu.mark': 'Highlight',
  'editorMenu.clear': 'Clear formatting',
  'editorMenu.p': 'Body text',
  'editorMenu.h1': 'Heading 1',
  'editorMenu.h2': 'Heading 2',
  'editorMenu.h3': 'Heading 3',
  'editorMenu.h4': 'Heading 4',
  'editorMenu.h5': 'Heading 5',
  'editorMenu.h6': 'Heading 6',
  'editorMenu.hup': 'Promote heading',
  'editorMenu.hdn': 'Demote heading',
  'editorMenu.quote': 'Quote',
  'editorMenu.ul': 'Bulleted list',
  'editorMenu.ol': 'Numbered list',
  'editorMenu.task': 'Task list',
  'editorMenu.table': 'Table',
  'editorMenu.hr': 'Horizontal rule',
  'editorMenu.codeblock': 'Code block',
  'editorMenu.math': 'Math block',
  'editorMenu.toc': 'Table of contents',
  'editorMenu.frontmatter': 'YAML front matter',
  'editorMenu.footnote': 'Footnote',
  'editorMenu.date': 'Current date',
  'editorMenu.image': 'Image',
  'editorMenu.new-file': 'New file',
  'editorMenu.new-file.tip': 'Create an empty note in the current folder and edit it right here',
  'editorMenu.new-folder': 'New folder',
  'editorMenu.new-folder.tip': 'Create a subfolder in the current folder',

  'misc.ribbonTip': 'Vault Workbench',
  'misc.viewTitle': 'Vault Workbench',
  'misc.cmdOpen': 'Open Vault Workbench',
  'misc.cmdRefresh': 'Refresh vault index',
  'preview.edit': 'Edit',
  'preview.editTip': 'Toggle edit mode',
  'preview.outlineTip': 'Outline',
  'preview.closeTip': 'Close preview',

  'ft.image': 'Image',
  'ft.audio': 'Audio',
  'ft.video': 'Video',
  'ft.pdf': 'PDF document',
  'ft.text': 'Text',

  'notice.navStart': 'Already at the earliest position',
  'notice.navEnd': 'Nothing further ahead',
  'notice.pluginListWrite': 'Cannot write to the plugin list of {path}',
  'notice.deployWrite': 'Cannot write to {path}',
  'notice.noTargetPath': 'No target vault path',
  'notice.notVaultShort': 'Not a vault',
  'notice.jumpFailShort': 'Jump failed',
  'notice.refPartial': 'Failed rewriting links for "{name}"; only {n} notes were updated',
  'notice.undoNoVault': 'This record has no vault information; cannot undo',
  'notice.undoIncomplete': 'This record is incomplete; cannot undo',
  'notice.noTargetVault': 'No target vault',
  'notice.targetReadonly': 'Target vault is not writable (read-only disk or no permission)',

  'editor.edit': 'Edit',
  'editor.read': 'Read',
  'editor.outline': 'Outline',
  'editor.rename': 'Click to rename this file',
  'editor.format': 'Aa format',
  'editor.saved': 'Saved',
  'editor.unsaved': 'Unsaved…',
  'editor.notEditable': 'This file cannot be edited in the workbench',
  'editor.hasFm': 'There is already a YAML front matter block at the top',
  'editor.noDel': 'The cursor is already at the end of this block — nothing to delete',
  'editor.pickBlock': 'Click the block you want to delete first, then use “Delete this block”',
  'editor.blockDeleted': 'Block deleted',
  'editor.noClipboard': 'Clipboard unavailable here — just use Ctrl+V',
  'editor.noSelectAll': 'Select-all unavailable here — just use Ctrl+A',
  'editor.wroteExternal': 'Wrote back to the other vault: {path}',

  'set.open.name': 'What clicking a file does',
  'set.open.desc': 'Preview panel: opens in the right panel, no tab switching (default, good for skimming). Panel: opens full-width in the workbench, ready to read / edit / outline. Native editor: opens a new tab in the official Obsidian editor. In any mode you can force a preview with the 👁 on a card, or jump to the native editor with the ↗ button.',
  'set.preset.name': 'Preset',
  'set.preset.desc': 'Apply wallpaper strength and panel opacity in one click',
  'set.wallpaper.name': 'Workbench wallpaper',
  'set.wallpaper.desc': 'Affects the workbench area only',
  'set.wallpaperPath.name': 'Custom wallpaper path',
  'set.wallpaperPath.desc': 'Absolute path to a local image; leave empty to use the presets above',
  'set.dim.name': 'Wallpaper dimming',
  'set.dim.desc': 'Higher = darker wallpaper, clearer text',
  'set.blur.name': 'Panel blur',
  'set.blur.desc': 'Frosted-glass strength; 0 means fully transparent panels',
  'set.accent.name': 'Accent color',
  'set.accent.desc': 'Used for selection, buttons and highlights',
  'set.accentQuick.name': 'Quick colors',
  'set.accentQuick.desc': 'Preset accent colors',
  'set.density.name': 'Layout density',
  'set.density.desc': 'Controls card spacing and grid column width',
  'set.previewPos.name': 'Preview position',
  'set.previewPos.desc': 'Where the file preview panel appears',
  'set.stats.name': 'Show stats cards',
  'set.stats.desc': 'Show note count / changed this week / inbox / attachment size at the vault root',
  'set.clickSelected.name': 'Clicking a selected item',
  'set.clickSelected.desc': 'What happens when you click an item that is already selected',
  'set.meta.name': 'Show card metadata',
  'set.meta.desc': 'Show tags and modified date',
  'set.summary.name': 'Show note excerpts on cards',
  'set.summary.desc': 'Two lines of body text under the note name (turn off for lighter cards)',
  'set.inbox.name': 'Inbox folder name',
  'set.inbox.desc': 'The folder at the vault root counted by the Inbox card (top level only)',
  'set.vault.manual': ' · added manually',
  'set.vault.hidden': ' · hidden',
  'set.addVault.name': 'Add vault / folder manually',
  'set.addVault.desc': 'Type an absolute path, then press Enter or click away',
  'set.reindex.name': 'Rescan other vaults',
  'set.reindex.desc': 'Re-read the vaults on disk that are not the current one',

  'preview.noNativeExternal': 'Files in other vaults are not in this vault, so they cannot open natively — previewing in the panel instead',
  'preview.noNativeType': 'Obsidian has no native view for this type — previewing in the panel instead',
  'preview.nativeFail': 'Native open failed, previewing in the panel instead: {err}',
  'preview.loading': 'Loading…',
  'preview.fail': 'Preview failed: {err}',
  'preview.outline': 'Outline',
  'preview.noHeadings': 'No headings in this file (lines starting with #)',
  'preview.linkMissing': 'Link target not found: {target}',
  'preview.imageTip': 'Use “Actual size” in the footer for 1:1, or “↗ Open externally” for your system viewer.',
  'preview.mediaTip': 'Cannot play it or want full screen? Use “↗ Open externally” in the footer.',
  'preview.pdfNativeTip': 'PDFs render with the Obsidian reader; if that fails, use “Open with external app” in the footer.',
  'preview.pdfTip': 'If the area above is blank, this environment cannot embed PDFs — use the button below to open it in your system reader.',
  'preview.openExternal': '↗ Open with external app',
  'preview.openFolder': '🗂 Open containing folder',
  'preview.close': '✕',

  'ui.1': 'Back to the previous folder (Alt + ←)',
  'ui.2': 'Forward to the next folder (Alt + →)',
  'ui.3': '← Up one level',
  'ui.4': 'Search: ',
  'ui.5': 'Search: name / tags / content…',
  'ui.6': '🌐 All vaults',
  'ui.7': '📍 Current vault',
  'ui.8': 'Scope: all vaults (full text)',
  'ui.9': 'Scope: current vault (name / tags)',
  'ui.10': 'Open with',
  'ui.11': ' (default)',
  'ui.12': 'Sort: modified',
  'ui.13': 'Sort: name',
  'ui.14': 'Sort: size',
  'ui.15': 'Collapse this level',
  'ui.16': 'Click to peek inside this folder',
  'ui.17': 'Panel preview',
  'ui.18': 'Changed this week: ',
  'ui.19': 'Filter notes with the same tag',
  'ui.20': 'Matches name / tags',
  'ui.21': 'Current',
  'ui.22': 'Right-click to switch to this vault',
  'ui.23': 'This file is no longer in the vault',
  'ui.24': 'Open',
  'ui.25': 'Already in the current vault',
  'ui.26': 'Copy full path',
  'ui.27': 'Copied path',
  'ui.28': 'No Markdown notes in these folders — nothing to link',
  'ui.29': 'No Markdown notes among the selected items',
  'ui.30': 'Tag ',
  'ui.31': ' items',
  'ui.32': 'Separate tags with commas or spaces. They are merged into each note frontmatter without overwriting existing tags.',
  'ui.33': 'e.g. study, to-read',
  'ui.34': 'Apply',
  'ui.35': 'No valid tags entered',
  'ui.36': 'Batch rename ',
  'ui.37': 'Prefix, e.g. 2026-',
  'ui.38': 'Replace with',
  'ui.39': 'Add prefix',
  'ui.40': 'Find & replace',
  'ui.41': 'Find',
  'ui.42': 'Run',
  'ui.43': 'The find text cannot be empty',
  'ui.44': 'Cancel',
  'ui.45': 'Move ',
  'ui.46': ' items to…',
  'ui.47': '🏠 Vault root',
  'ui.48': ' items to…',
  'ui.49': 'No other vaults found (a vault must be opened in Obsidian at least once)',
  'ui.50': 'Nothing was copied',
  'ui.51': 'Filtering by: ',
  'ui.52': 'Remove this tag',
  'ui.53': 'Clear',
  'ui.54': 'Current vault · all tags',
  'ui.55': 'Sorted by note count',
  'ui.56': 'Close the tag panel',
  'ui.57': 'Filter tags…',
  'ui.58': 'No matching tags',
  'ui.59': 'No tags in this vault yet',
  'ui.60': 'Click to filter; Ctrl / ⌘ + click to select several (intersection)',
  'ui.61': ' (clear it with the ✕ in the search box)',
  'ui.62': 'Smart views',
  'ui.63': 'All vaults',
  'ui.64': 'by modified date',
  'ui.65': 'by name',
  'ui.66': 'by size',
  'ui.67': 'Click to apply this view',
  'ui.68': 'Delete this view',
  'ui.69': 'View deleted: ',
  'ui.70': '＋ Save current view',
  'ui.71': 'Save the current view as',
  'ui.72': 'e.g. recently changed, has #todo',
  'ui.73': 'Save',
  'ui.74': 'View saved: ',
  'ui.75': 'Close',
  'ui.76': 'View applied: ',
  'ui.77': 'Copied path: ',
  'ui.78': 'Copied Obsidian URI',
  'ui.79': 'Copied Obsidian link',
  'ui.80': 'No Markdown notes in this folder — nothing to link',
  'ui.81': 'Copied wiki link',
  'ui.82': 'Item not found — it may have been moved or renamed',
  'ui.83': 'Rename failed: ',
  'ui.84': 'This Obsidian version has no rename dialog — rename the folder in the file explorer instead',
  'ui.85': 'This Obsidian version has no rename dialog — rename it in the file explorer instead',
  'ui.86': 'This vault is read-only (no write permission)',
  'ui.87': 'Rename folder',
  'ui.88': 'Rename',
  'ui.89': 'Next',
  'ui.90': 'Confirm rename',
  'ui.91': 'No notes in this vault reference it',
  'ui.92': 'Renamed',
  'ui.93': 'Delete',
  'ui.94': 'Folder',
  'ui.95': 'File',
  'ui.96': 'Item not found — it may have been deleted',
  'ui.97': 'Could not leave a copy in the trash: ',
  'ui.98': 'Delete failed: ',
  'ui.99': 'Duplicate created: ',
  'ui.100': 'Could not create the duplicate: ',
  'ui.101': 'Item not found',
  'ui.102': 'that vault',
  'ui.103': 'Right-click it in the vault sidebar → Switch to this vault (the workbench is installed automatically)',
  'ui.104': 'No vault selected',
  'ui.105': 'Untitled',
  'ui.106': 'Could not create: ',
  'ui.107': 'Location: ',
  'ui.108': 'Location: vault root · ',
  'ui.109': 'Written straight to disk',
  'ui.110': 'Create',
  'ui.111': 'Creating in: ',
  'ui.112': 'Creating in: vault root',
  'ui.113': 'New folder',
  'ui.114': 'Folder created: ',
  'ui.115': 'Could not create the folder: ',
  'ui.116': 'New note',
  'ui.117': 'Refresh',
  'ui.118': 'Rescan',
  'ui.119': 'Rescan this vault',
  'ui.120': 'Select all on screen',
  'ui.121': 'Clear selection',
  'ui.122': 'Switch to list view',
  'ui.123': 'Switch to grid view',
  'ui.124': 'Appearance settings…',
  'ui.125': 'New folder…',
  'ui.126': 'New note…',
  'ui.127': 'Nothing is selected right now',
  'ui.128': 'No matching files',
  'ui.129': 'No notes changed in the last 7 days',
  'ui.130': 'This folder is empty',
  'ui.131': '(This folder is empty)',
  'ui.132': 'Empty folder',
  'ui.133': ' notes',
  'ui.134': ' · selected',
  'ui.135': 'No tags',
  'ui.136': 'Latest: ',
  'ui.137': 'Cancel delete',
  'ui.138': 'Read failed: ',
  'ui.139': 'Writing mode',
  'ui.140': 'Aa format',
  'ui.141': 'Formatting / paragraph / insert / clipboard / delete (same menu as right-clicking in the text)',
  'ui.142': 'Click to edit · ↑↓ blocks · Enter = line break · Shift+Enter = new block',
  'ui.143': 'Source on the left · live preview on the right (scroll synced)',
  'ui.144': 'Source mode',
  'ui.145': 'New block — start typing',
  'ui.146': 'Click to insert content',
  'ui.147': 'Click this block to edit in place',
  'ui.148': 'link text',
  'ui.149': 'note name',
  'ui.150': 'Bold',
  'ui.151': 'Italic',
  'ui.152': 'Underline',
  'ui.153': 'Strikethrough',
  'ui.154': 'Code',
  'ui.155': 'Highlight',
  'ui.156': '| Column 1 | Column 2 |\n| --- | --- |\n| text | text |',
  'ui.157': '```\ncode\n```',
  'ui.158': '[^1]: footnote text',
  'ui.159': '](image-path)',
  'ui.160': 'caption',
  'ui.161': 'Not available right now',
  'ui.162': 'Large file — live preview is off (saving still works)',
  'ui.163': 'Type on the left and it renders here',
  'ui.164': 'Could not write back to the other vault: ',
  'ui.165': 'Save failed: ',
  'ui.166': 'Root',
  'ui.167': 'Unsaved…',
  'ui.168': 'Saved ✓',
  'ui.169': 'Restore panel',
  'ui.170': 'Fill workspace',
  'ui.171': '\n\n… (large file, showing the first ',
  'ui.172': 'Type',
  'ui.173': 'Size',
  'ui.174': 'Modified',
  'ui.175': 'Created',
  'ui.176': 'Open in Obsidian',
  'ui.177': 'This environment cannot resolve the file path, so the system app cannot be launched.',
  'ui.178': 'File in another vault (',
  'ui.179': ') cannot be embedded here — use the system open button below.',
  'ui.180': '✓ Done (back to reading)',
  'ui.181': '💾 Save',
  'ui.182': 'Saved',
  'ui.183': '↗ Open externally',
  'ui.184': '✎ Edit',
  'ui.185': '↗ Open in Obsidian',
  'ui.186': 'Fit',
  'ui.187': 'Actual size',
  'ui.188': '↗ Open with external app',
  'ui.189': '⤡ Restore panel',
  'ui.190': '⤢ Fill workspace',
  'ui.191': 'Copy path',
  'ui.192': 'Copied: ',
  'ui.193': 'Editing shortcuts',
  'ui.194': '✎ / Read',
  'ui.195': 'Obsidian vaults',
  'ui.196': 'Reads the Obsidian vault list automatically; hide the ones you rarely use here.',
  'ui.197': '“Switch” installs the workbench into that vault first if needed, so it works right after switching — ',
  'ui.198': 'the first time you enter a vault, turn off Restricted mode once (Settings → Community plugins). This is Obsidian\'\'s own safety design.',
  'ui.199': 'No vaults found',
  'ui.200': 'This is the current vault',
  'ui.201': 'Switch to this vault (installs the workbench first)',
  'ui.202': 'This folder is not an Obsidian vault yet (no .obsidian): use “Open folder as vault” in Obsidian first',
  'ui.203': 'Unhide it first, then switch to it',
  'ui.204': 'The workbench in this vault is up to date',
  'ui.205': 'Install the workbench here (your settings are untouched)',
  'ui.206': 'Install failed: ',
  'ui.207': 'unknown reason',
  'ui.208': 'Installed the workbench into “',
  'ui.209': '”; the first time you enter it, turn off Restricted mode once.',
  'ui.210': '” updated to v',
  'ui.211': '” already has the latest workbench',
  'ui.212': 'D:\\Obsidian\\my-vault',
  'ui.213': 'Where the vault list lives',
  'ui.214': 'Manually added vaults are stored twice: once in this vault\'\'s settings (travels with the vault), ',
  'ui.215': 'and once globally on this machine (so you still see them after switching): ',
  'ui.216': 'That path is already in the list',
  'ui.217': 'Added: ',
  'ui.218': ' (no .obsidian inside — does not look like an Obsidian vault)',
  'ui.219': 'Renames and deletes done in other vaults are logged and **can be undone** (the ones with an Undo button).',
  'ui.220': 'Revert this step (wiki links it changed are restored too)',
  'ui.221': 'Other-vault index refreshed',
  'ui.222': 'Search index cleared — it rebuilds on the next cross-vault search',
  'ui.223': 'The cross-vault search index lives on this machine at ',
  'ui.224': ', built only when you search with “🌐 All vaults”.',
  'ui.225': 'Files deleted in other vaults are moved into that vault\'\'s .trash — see them all here and restore to the original location.',
  'ui.226': '(Deleting in the current vault goes through Obsidian itself, following the policy in Settings → Files & Links.)',
  'ui.227': 'Delete everything in this vault trash (cannot be undone)',
  'ui.228': 'Empty the trash of “',
  'ui.229': '”?',
  'ui.230': 'Permanently delete ',
  'ui.231': ' items. **This cannot be undone.**',
  'ui.232': 'Empty',
  'ui.233': 'Emptied ',
  'ui.234': ' items',
  'ui.235': 'Restored: ',
  'ui.236': 'Cannot be undone',
  'ui.237': 'Delete permanently?',
  'ui.238': ' will really be deleted — **this cannot be undone**.',
  'ui.239': 'Undo this step?',
  'ui.240': 'Revert “',
  'ui.241': '”',
  'ui.242': ' (along with ',
  'ui.243': ' wiki links)',
  'ui.244': 'Undo failed',
  'ui.245': 'Undone: ',
  'ui.246': 'Open this plugin in Obsidian settings →',

  'ui.247': ': no permission (blocked by system permissions or security software — try a normal folder)',
  'ui.248': ': this location is read-only (read-only drive or protected folder)',
  'ui.249': ': path not found — the vault may have been moved or deleted',
  'ui.250': ': not enough disk space',
  'ui.251': ': the file is locked by another program',
  'ui.252': ': this is a folder, not a file',
  'ui.253': ': cross-drive move failed',
  'ui.254': 'Nutstore',
  'ui.255': 'Verysync',
  'ui.256': 'Missing plugin id / source directory / target vault path',
  'ui.257': 'This folder is not an Obsidian vault yet (no .obsidian inside)',
  'ui.258': ' — use “Open folder as vault” in Obsidian first, then switch',
  'ui.259': 'Cannot read its own manifest.json',
  'ui.260': 'Cannot read its own version',
  'ui.261': 'Write failed: ',
  'ui.262': 'Target already exists: ',
  'ui.263': 'Rename failed',
  'ui.264': 'Not found: ',
  'ui.265': 'Delete failed',
  'ui.266': 'Original location unknown (not deleted by the workbench — will not guess)',
  'ui.267': 'Permanent delete failed',
  'ui.268': 'Undo delete failed',
  'ui.269': 'Already exists: ',
  'ui.270': 'Create failed',
  'ui.271': 'Create folder failed',
  'ui.272': 'Copy failed',
  'ui.273': 'No native view for this type',
  'ui.274': 'Attachment size (images / PDF / media)',
  'ui.275': 'File',
  'ui.276': 'Folder',
  'ui.277': 'Canvas',
  'ui.278': 'Excalidraw',
  'ui.279': 'Markdown',

  'misc.indexRefreshed': 'Vault index refreshed',
  'misc.openMode': 'Open with: {mode}',
  'misc.noDiskPath': 'Cannot resolve the disk path for this file',
  'misc.shellOpenFail': 'Could not launch the system app: {err}',
  'misc.revealFail': 'Could not open the folder: {err}',
  'misc.saved': 'Saved',
  'misc.refreshed': 'Refreshed',
  'misc.ok': 'OK',
  'misc.cancel': 'Cancel',
  'misc.confirmTitle': 'Confirm',

  'notice.skipNotes': ', skipped {n}',
  'notice.failNotes': ', {n} failed',
  'notice.skipItems': ', skipped {n} (already there / name clash)',
  'notice.failItems': ', {n} failed',
  'notice.copyNone': 'Nothing was copied',
  'notice.copiedTo': 'Copied {n} items to “{name}”',
  'notice.filteredByTag': 'Filtering by tag: {tag} (clear it with the ✕ in the search box)',
  'picker.copyToTitle': 'Copy to “{name}”',
  'picker.copyToDesc': 'Copy {n} items to the root of this vault (duplicate names get a number, nothing is overwritten). The originals stay put — copying never breaks cross-vault links, which is why we do not do “cross-vault move”.',
  'picker.copyN': 'Copy {n} items',
  'cross.hits': 'All vaults · {n} hits',
  'views.empty': 'No saved views yet — set a search / sort, then click Save current below',
  'scope.all.tip': 'Searching full text across all vaults (first run builds an index per vault and is slower)\nClick to search the current vault only',
  'scope.current.tip': 'Searches names and tags in the current vault only\nClick to switch to “All vaults” — full text of every vault, no window swapping',
  'set.title': 'Vault Workbench · multi-vault workbench',
  'set.tab.general': 'General',
  'set.tab.appearance': 'Appearance',
  'set.tab.vaults': 'Manage vaults',
  'set.tab.safety': 'Safety & log',
  'set.tab.about': 'About',
  'set.langChanged': 'Interface language: {lang}',
  'set.openUpdated': 'Open mode updated',
  'set.panelNote': 'Editing in Panel mode: use “Edit” at the top right of the document to enter the editor. Default is live preview on a single canvas — the text is rendered and you click any block to edit it.',
  'set.openTip': 'Tip: the “Open with” dropdown on the file toolbar switches any time, or use Settings → Open with / Editor in the bottom-left of the workbench.',
  'set.accentPurple': 'Purple',
  'set.accentBlue': 'Blue',
  'set.accentRed': 'Red',
  'set.accentGreen': 'Green',
  'set.accentGold': 'Gold',
  'set.density.tight': 'Compact',
  'set.density.comfy': 'Standard',
  'set.density.loose': 'Loose',
  'set.pos.side': 'Slide',
  'set.pos.float': 'Float',
  'set.pos.bottom': 'Bottom',
  'set.click.open': 'Open it (and clear the selection — Windows habit)',
  'set.click.deselect': 'Only deselect it (keep the rest selected)',
  'set.vaultsNote': 'Lists the Obsidian vaults registered on this machine (read from obsidian.json); hide or rename them here, or add unregistered folders manually.',
  'set.toggleShow': 'Show / hide',
  'set.alias': 'Alias',
  'set.logNote': 'Currently logs write operations such as create, rename and delete; anything with an Undo button can be reverted.',
  'set.logRecent': 'Activity log (latest 20)',
  'set.logEmpty': 'Nothing yet',
  'set.aboutIntro': 'Vault Workbench — a multi-vault workbench. The current vault uses the Obsidian API (full editing); other vaults are read from disk: you can read them and edit the body of existing files (atomic writes). Creating / renaming / deleting needs you to switch into that vault — right-click the target vault in the sidebar → Switch to this vault; the workbench is installed there first, so it is available after switching.',
  'set.aboutRoadmap': 'Roadmap: inbox triage → batch organize → rules engine & health report → activity heatmap → cross-vault search.',
  'set.aboutPlan': 'The settings page structure is reserved — future features will slot in here.',
  'set.wallpaperHint': 'D:\\images\\wallpaper.jpg',
  'dialog.renameExternal': 'This item lives in “{vault}” — renaming also fixes the wiki links that reference it in that vault (.md only)',
  'dialog.renameTitle': 'Rename “{name}”',
  'dialog.renameOk': 'Rename',
  'dialog.renameNext': 'Next',
  'dialog.renameConfirm': 'Confirm rename',
  'dialog.refsCount': '{n} notes in this vault reference it, {m} links in total — all will be updated',
  'dialog.refsNone': 'No notes in this vault reference it',
  'dialog.renameAndRefs': 'Rename (and fix {n} references)',
  'dialog.renamedRefs': 'Renamed and updated {n} wiki links',
  'dialog.deleteExternal': '“{name}” will be moved to the .trash of {vault} (undoable from the activity log)\n',
  'dialog.deadLinks': '⚠ {n} references in this vault will become dead links',
  'dialog.deletedTrash': 'Deleted: (in {vault}/.trash — undoable from the activity log)',
  'dialog.deletedRecycle': 'Deleted: (find it in Settings → Trash, restorable)',
  'dialog.needSwitch': '“{from}” needs you to switch to “{to}” first — ',
  'dialog.newNoteIn': 'New note in “{name}”',
  'dialog.newNoteLocal': 'Created: (this vault is not open in Obsidian, using the workbench editor)',
  'dialog.newFolderIn': 'New folder in “{name}”',
  'tip.openModeCur': 'Current: {label} — {tip}\nClick to see all three modes',
  'notice.rescanned': 'Rescanned: {name}',
  'switch.vaultCur': 'Current vault\nRight-click to switch to this vault',
  'menu.switchVaultTo': 'Switch to this vault ({name})',
  'views.searchTag': 'Search “{q}”',
  'dialog.refsLine': '{n} notes reference it in this vault, {m} links in total — all will be updated',
  'dialog.renameRefsN': ' (and fix {n} references)',
  'dialog.renamedLinks': ' and updated {n} wiki links',
  'dialog.deletedTrashPath': 'Deleted: (in {vault}/.trash — undoable from the activity log)',
  'dialog.switchNeeded': '“{from}” needs you to switch to “{to}” first — ',
  'dialog.alreadyInVault': 'Already in “{name}”',
  'dialog.newNoteTitle': 'New note in “{name}”',
  'dialog.newNoteDone': 'Created: (this vault is not open in Obsidian, using the workbench editor)',
  'dialog.newFolderTitle': 'New folder in “{name}”',
  'notice.rescannedVault': 'Rescanned: {name}',
  'cross.curVaultCell': 'Current vault',
  'cross.curVaultTip': '\nRight-click to switch to this vault',
  'menu.switchVaultCell': 'Switch to this vault ({name})',
  'views.searchTagQ': 'Search “{q}”',
  'dialog.refsLineN': '{n} notes reference it in this vault, {m} links in total — all will be updated',
  'dialog.renameRefsParen': ' (and fix {n} references)',
  'dialog.renamedLinksCn': ' and updated {n} wiki links',
  'dialog.deletedTrashInVault': 'Deleted: (in {vault}/.trash — undoable from the activity log)',
  'dialog.switchToDo': '“{action}” needs you to switch to “{name}” first — ',
  'dialog.alreadyInName': 'Already in “{name}”',
  'dialog.newNoteInVault': 'New note in “{name}”',
  'dialog.newNoteCreated': 'Created: (this vault is not open in Obsidian, using the workbench editor)',
  'dialog.newFolderInVault': 'New folder in “{name}”',
  'preview.openFolderMenu': '🗂 Open containing folder',
  'drawer.vaultUpdatedTo': 'Updated the workbench in “{name}” to v{ver}',
  'drawer.undo': 'Undo',
  'dlg.okText': 'OK',
  'set.panelNoteLong': 'Editing in Panel mode: use “Edit” at the top right of the document to enter the editor. Default is live preview on a single canvas — the text is rendered and you click any block to edit it in place (no boxes between blocks). ↑↓ moves between blocks; Enter at the end of a block creates a new one, Shift+Enter breaks the line inside the block, Enter at the end of a list or quote continues it, and Backspace at the start merges into the previous block. The toolbar switches to Split (source + live preview, scroll synced) or Source. Right-click in the text for the full formatting menu (commands apply to the block you right-clicked); Ctrl+B / I / U / K, Ctrl+1-6 for headings, Ctrl+Shift+Q for quotes all work. Saving happens 0.8s after you stop typing, or Ctrl+S, and Esc goes back to reading. Files in other vaults are written straight back to disk.',
  'set.openTipLong': 'Tip: the “Open with” dropdown on the file toolbar switches any time, or use Settings → Open with / Editor in the bottom-left of the workbench. Alt+← / Alt+→ move back and forward, Alt+↑ goes up one level. See Settings → Usage for all shortcuts.',
  'set.wallpaperPlaceholder': 'D:\\images\\wallpaper.jpg',
  '点文件 / 文件夹': 'Click a file / folder',
  'Ctrl / ⌘ + 点': 'Ctrl / ⌘ + click',
  'Shift + 点': 'Shift + click',
  '点空白处': 'Click empty space',
  '多选后': 'After selecting several',
  '右键任意一项': 'Right-click any item',
  '鼠标拖选': 'Drag to select',
  '在正文里点右键': 'Right-click in the text',
  '点任意一段': 'Click any block',
  'Enter（列表 / 引用）': 'Enter (list / quote)',
  'Enter（代码块 / 表格 / Front Matter）': 'Enter (code block / table / front matter)',
  '点画布空白': 'Click empty canvas',
  '点右键 / Aa 格式': 'Right-click / Aa menu',
  'bar.new': '+ New',
  'bar.new.tip': 'Create a file (edited right here in the workbench) or a folder in the current folder',
  'switch.notVaultFix': ' — use “Open folder as vault” in Obsidian first',
  'switch.restrictedHint': '. The first time you enter it, turn off Restricted mode once (Settings → Community plugins)',
  'switch.cloudHint': 'Heads up: {name} is in a cloud-synced folder — avoid editing it on two devices at once',
  'switch.noPath': 'This vault has no path information',
  'switch.alreadyIn': 'You are already in {name}',
  'switch.notVault': '“{name}” is not an Obsidian vault yet (no .obsidian inside)',
  'switch.installFail': 'Could not install the workbench: {reason}',
  'switch.installed': 'Installed the workbench into “{name}”',
  'switch.installedVer': 'Installed the workbench into “{name}” (v{ver})',
  'switch.updated': 'Updated the workbench in “{name}” from v{from} to v{to}',
  'switch.jumpFail': 'Could not jump automatically — open this link manually: {uri}',
  'switch.switching': 'Switching to: {name} (if that vault is open in another window, press Ctrl+R there)',

  'sc.editor.1': 'Bold',
  'sc.editor.2': 'Italic',
  'sc.editor.3': 'Underline',
  'sc.editor.4': 'Inline code',
  'sc.editor.5': 'Strikethrough',
  'sc.editor.6': 'Highlight',
  'sc.editor.7': 'Link',
  'sc.editor.8': 'Clear formatting',
  'sc.editor.9': 'Save now',
  'sc.editor.10': 'Indent two spaces',
  'sc.editor.11': 'Commit this block / back to reading',
  'sc.para.1': 'Headings 1-6',
  'sc.para.2': 'Back to body text',
  'sc.para.3': 'Promote / demote heading',
  'sc.para.4': 'Quote',
  'sc.para.5': 'Numbered list',
  'sc.para.6': 'Bulleted list',
  'sc.para.7': 'Task list',
  'sc.para.8': 'Code block',
  'sc.para.9': 'Math block',
  'sc.para.10': 'Table',
  'sc.nav.1': 'Back to previous folder',
  'sc.nav.2': 'Forward to next folder',
  'sc.nav.3': 'Up one level',
  'sc.nav.4': 'Up one level (in the file list)',
  'sc.nav.5': 'Close drawer / exit fullscreen / close menu / close preview',
  'sc.files.1': 'Open with the current mode; folders go one level deeper',
  'sc.files.2': 'Add to selection (click again to remove)',
  'sc.files.3': 'Select the range from the last click to this one',
  'sc.files.4': 'Clear selection',
  'sc.files.5': 'A toolbar appears: copy paths / copy wiki links / move / delete',
  'sc.files.6': 'Open / rename / copy Obsidian link / copy wiki links / copy path / delete',
  'sc.read.1': 'Select text like on a web page, then Ctrl+C',
  'sc.read.2': 'Select all text',
  'sc.read.3': 'Copy selected text / select all / copy whole Markdown / copy path',
  'sc.canvas.1': 'Edit this block in place',
  'sc.canvas.2': 'Drag-select in the rendered text, then Ctrl+C (does not enter edit mode)',
  'sc.canvas.3': 'At block boundaries, jump to the previous / next block',
  'sc.canvas.4': 'Line break inside the block (Markdown hard break, visible when rendered)',
  'sc.canvas.5': 'Finish this block and start a new one',
  'sc.canvas.6': 'Enter at the end continues the list; Enter on an empty item leaves it',
  'sc.canvas.7': 'Line break only, does not touch the block',
  'sc.canvas.8': 'Delete selection (or the character after the cursor)',
  'sc.canvas.9': 'Backspace at block start merges into the previous block',
  'sc.canvas.10': 'Start a new block at the end',
  'sc.canvas.11': 'Copy selection / formatting / paragraph / insert / clipboard / delete',
  'sc.canvas.12': 'Commit this block and return to rendering'
};

const I18N_DICT = { zh: I18N_ZH, en: I18N_EN };

let I18N_LANG = 'zh';

function setLang(l) {
  I18N_LANG = (l === 'en' || l === 'zh') ? l : 'zh';
  return I18N_LANG;
}
function getLang() { return I18N_LANG; }

/* 取文案：英文缺 → 回落中文 → 都缺 → 返回 key 本身（便于肉眼定位漏翻项）
 * ⚠ 函数名叫 tr 而不是 t —— t 太容易被局部变量（e.target 之类）遮蔽，踩过三次 */
function tr(key, vars) {
  const dict = I18N_DICT[I18N_LANG] || I18N_ZH;
  let s = dict[key];
  if (s == null) s = I18N_ZH[key];
  if (s == null) return key;
  if (vars) {
    s = String(s).replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m));
  }
  return s;
}

/* 给元素打测试标记：冒烟断言靠它定位，不再依赖中文文本（切英文时断言不会失效） */
function tid(el, id) {
  if (el && typeof el.setAttribute === 'function') el.setAttribute('data-testid', id);
  return el;
}

/* Obsidian 界面语言：非公开 API，三级兜底，全程 try/catch
 * （冒烟测试里 window / navigator 都是替身，任何一级都可能不存在） */
function detectLang(app) {
  try {
    const w = (typeof window !== 'undefined') ? window : null;
    const ls = w && w.localStorage;
    if (ls && typeof ls.getItem === 'function') {
      const v = ls.getItem('language');           // Obsidian 把界面语言存在这里
      if (v) return v;
    }
  } catch (e) { /* 忽略 */ }
  try {
    if (app && app.vault && typeof app.vault.getConfig === 'function') {
      const c = app.vault.getConfig('language');
      if (c) return c;
    }
  } catch (e) { /* 忽略 */ }
  try {
    const nav = (typeof navigator !== 'undefined') ? navigator : null;
    if (nav && nav.language) return nav.language;
  } catch (e) { /* 忽略 */ }
  return '';
}

/* 归一成 zh / en；既不是中文也不是英文时返回空串（调用方兜底成 zh） */
function normLang(s) {
  const v = String(s || '').toLowerCase();
  if (v.indexOf('zh') === 0) return 'zh';
  if (v.indexOf('en') === 0) return 'en';
  return '';
}

/* -------------------------------------------------------------------------
 *  常量：壁纸 / 预设 / 默认设置 / 打开方式
 *  （本片段由 build.js 拼进 main.js，不要单独 require）
 * ------------------------------------------------------------------------- */
const WALLPAPERS = {
  none: { label: '无', css: 'transparent' },
  starry: { label: '星夜', css: 'linear-gradient(135deg,#20234a,#7f6df2 70%,#c58bf5)' },
  bamboo: { label: '竹林', css: 'linear-gradient(135deg,#12332b,#2fb87a 70%,#a8e6c1)' },
  paper: { label: '纸张', css: 'linear-gradient(135deg,#3a2f22,#c99a5b 70%,#f0d7ac)' },
  ocean: { label: '深海', css: 'linear-gradient(135deg,#1d2a44,#3aa0f0 70%,#9bd2ff)' }
};

const PRESETS = {
  glass: { label: '毛玻璃', blur: 20, dim: 0.25, glass: 0.07 },
  minimal: { label: '极简暗', blur: 6, dim: 0, glass: 0.045 },
  mag: { label: '杂志卡片', blur: 26, dim: 0.38, glass: 0.1 },
  contrast: { label: '高对比', blur: 4, dim: 0.5, glass: 0.13 }
};

const DEFAULT_SETTINGS = {
  appearance: {
    preset: 'glass',
    wallpaper: 'starry',
    customImage: '',
    dim: 0.25,
    blur: 20,
    accent: '#7f6df2',
    density: 'comfy',
    previewPos: 'side',
    showStats: true,
    showMeta: true,
    /* 卡片显示内容摘要（笔记卡前两行），关掉回到轻卡 */
    showSummary: true
  },
  perVaultAppearance: false,
  vaultAppearance: {},
  vaults: {
    hidden: [],
    aliases: {},
    extra: []
  },
  /* 打开行为（三选一，见 OPEN_MODES）：
   *   panel     → 右侧预览模式（默认）：点文件在右侧面板预览，不铺满、不跳标签
   *   workbench → 工作面板模式：点文件在工作台里铺满打开（阅读 / 编辑都在工作台内完成）
   *   native    → 原生编辑模式：点文件在 Obsidian 中新开标签页，用官方编辑器打开
   */
  open: {
    mode: 'panel',
    migrated: false
  },
  view: {
    mode: 'grid',
    sort: 'mtime',
    /* 多选状态下点击一个已选项时做什么：
     *   open     → 打开它并清空选择（Windows 习惯，默认）
     *   deselect → 只取消选中它，保留其余选择 */
    clickSelected: 'open',
    /* 收集箱文件夹名（库根目录下这一层，统计时不递归子文件夹） */
    inbox: 'inbox'
  },
  /* 智能视图：保存的筛选器入口（{name, query, sort, scope, folder}） */
  smartViews: [],
  /* 工作台内编辑器（见 EDITOR_MODES）：
   *   live   → 单画布即时渲染（默认）：正文就是渲染后的样子，点哪改哪
   *   split  → 源码 + 实时渲染双栏，滚动位置同步
   *   source → 纯 Markdown 源码
   */
  editor: {
    mode: 'live',
    syncScroll: true
  },
  ui: {
    railCollapsed: false, // 左侧 obsidian库导航 是否收起
    /* 界面语言：auto = 跟随 Obsidian，也可手动钉成 zh / en */
    lang: 'auto'
  }
};

/* 打开方式：id 存进设置，label 是下拉菜单里的名字，tip 是 hover 说明 */
const OPEN_MODES = [
  {
    id: 'panel',
    label: 'mode.open.panel.label',
    def: true,
    chip: 'mode.open.panel.chip',
    tip: 'mode.open.panel.tip'
  },
  {
    id: 'workbench',
    label: 'mode.open.workbench.label',
    def: false,
    chip: 'mode.open.workbench.chip',
    tip: 'mode.open.workbench.tip'
  },
  {
    id: 'native',
    label: 'mode.open.native.label',
    def: false,
    chip: 'mode.open.native.chip',
    tip: 'mode.open.native.tip'
  }
];
function openModeOf(id) {
  return OPEN_MODES.find((m) => m.id === id) || OPEN_MODES[0];
}

/* 工作台内编辑器的三种书写方式（设置与编辑器顶栏共用） */
const EDITOR_MODES = [
  {
    id: 'live',
    label: 'mode.editor.live.label',
    def: true,
    chip: 'mode.editor.live.chip',
    tip: 'mode.editor.live.tip'
  },
  {
    id: 'split',
    label: 'mode.editor.split.label',
    def: false,
    chip: 'mode.editor.split.chip',
    tip: 'mode.editor.split.tip'
  },
  {
    id: 'source',
    label: 'mode.editor.source.label',
    def: false,
    chip: 'mode.editor.source.chip',
    tip: 'mode.editor.source.tip'
  }
];
function editorModeOf(id) {
  return EDITOR_MODES.find((m) => m.id === id) || EDITOR_MODES[0];
}

/* 编辑器右键菜单 / 顶栏「Aa 格式」下拉共用的命令表
 * hint 就是「快捷键」列里显示的按键，菜单项与快捷键走同一条 applyCmd。 */
const EDITOR_MENU = [
  /* needSelection：只有画布 / 输入框里真的选中了东西才显示这一项；
   * needBlock：只有在某一段上右键（能定位到块）时才显示。 */
  { group: [
    { id: 'copy-sel', label: '复制选中文本', hint: 'Ctrl+C', ico: '⧉', needSelection: true },
    { id: 'copy-block', label: '复制这一段的原文', ico: '¶', needBlock: true },
    { id: 'copy-all', label: '复制整篇 Markdown', ico: '▤' },
    { id: 'select-all', label: '全选', hint: 'Ctrl+A', ico: '▭' }
  ] },
  { group: [
    { id: 'link', label: '新增链接', hint: 'Ctrl+K', ico: '🔗' },
    { id: 'extlink', label: '新增外部链接', ico: '↗' }
  ] },
  { group: [
    { id: 'format', label: '文本格式', ico: '🖌', sub: [
      { id: 'bold', label: '加粗', hint: 'Ctrl+B' },
      { id: 'italic', label: '斜体', hint: 'Ctrl+I' },
      { id: 'underline', label: '下划线', hint: 'Ctrl+U' },
      { id: 'strike', label: '删除线', hint: 'Alt+Shift+5' },
      { id: 'code', label: '行内代码', hint: 'Ctrl+`' },
      { id: 'mark', label: '高亮', hint: 'Ctrl+Shift+H' },
      { id: 'clear', label: '清除样式', hint: 'Ctrl+\\' }
    ] },
    { id: 'para', label: '段落设置', ico: '¶', sub: [
      { id: 'p', label: '正文', hint: 'Ctrl+0' },
      { id: 'h1', label: '一级标题', hint: 'Ctrl+1' },
      { id: 'h2', label: '二级标题', hint: 'Ctrl+2' },
      { id: 'h3', label: '三级标题', hint: 'Ctrl+3' },
      { id: 'h4', label: '四级标题', hint: 'Ctrl+4' },
      { id: 'h5', label: '五级标题', hint: 'Ctrl+5' },
      { id: 'h6', label: '六级标题', hint: 'Ctrl+6' },
      { id: 'hup', label: '提升标题级别', hint: 'Ctrl+=' },
      { id: 'hdn', label: '降低标题级别', hint: 'Ctrl+−' },
      { id: 'quote', label: '引用', hint: 'Ctrl+Shift+Q' },
      { id: 'ul', label: '无序列表', hint: 'Ctrl+Shift+]' },
      { id: 'ol', label: '有序列表', hint: 'Ctrl+Shift+[' },
      { id: 'task', label: '任务列表', hint: 'Ctrl+Shift+X' }
    ] },
    { id: 'insert', label: '插入', ico: '➕', sub: [
      { id: 'table', label: '表格', hint: 'Ctrl+Shift+T' },
      { id: 'hr', label: '水平分割线', hint: 'Ctrl+Shift+−' },
      { id: 'codeblock', label: '代码块', hint: 'Ctrl+Shift+K' },
      { id: 'math', label: '公式块', hint: 'Ctrl+Shift+M' },
      { id: 'toc', label: '内容目录', hint: '[TOC]' },
      { id: 'frontmatter', label: 'YAML Front Matter' },
      { id: 'footnote', label: '脚注' },
      { id: 'date', label: '当前日期' },
      { id: 'image', label: '图片' }
    ] }
  ] },
  { group: [
    { id: 'cut', label: '剪切', hint: 'Ctrl+X', ico: '✂' },
    { id: 'copy', label: '复制', hint: 'Ctrl+C', ico: '⧉' },
    { id: 'paste', label: '粘贴', hint: 'Ctrl+V', ico: '📋' },
    { id: 'paste-plain', label: '以纯文本形式粘贴', hint: 'Ctrl+Shift+V', ico: '📄' },
    { id: 'del-sel', label: '删除选中内容', hint: 'Del', ico: '⌫' }
  ] },
  /* needBlock：只有「能定位到某一段」时才显示（整篇级右键、没在任何一段里时不显示） */
  { group: [
    { id: 'del-block', label: '删除这一段', ico: '🗑', needBlock: true, danger: true }
  ] }
];

/* 阅读态（渲染好的正文）里点右键的菜单。
 * 阅读态没有「输入框」可操作，只有浏览器选区 —— 所以这里只做「读」的事。 */
const READ_MENU = [
  { group: [
    { id: 'copy-sel', label: '复制选中文本', hint: 'Ctrl+C', ico: '⧉', needSelection: true }
  ] },
  { group: [
    { id: 'select-all-doc', label: '全选正文', hint: 'Ctrl+A', ico: '▭' },
    { id: 'copy-all', label: '复制整篇 Markdown', ico: '▤' },
    { id: 'copy-path', label: '复制文件路径', ico: '📁' }
  ] }
];

/* 工具条「＋ 新建」下拉：建文件 / 建文件夹。默认都落在当前所在目录。 */
const NEW_MENU = [
  { id: 'new-file', label: '新建文件', ico: '📄', tip: 'editorMenu.new-file.tip' },
  { id: 'new-folder', label: '新建文件夹', ico: '📁', tip: 'editorMenu.new-folder.tip' }
];

/* 快捷键速查表（设置页「使用说明 / 编辑器」与编辑器提示共用） */
const SHORTCUTS = {
  editor: [
    ['Ctrl + B', 'sc.editor.1'],
    ['Ctrl + I', 'sc.editor.2'],
    ['Ctrl + U', 'sc.editor.3'],
    ['Ctrl + `', 'sc.editor.4'],
    ['Alt + Shift + 5', 'sc.editor.5'],
    ['Ctrl + Shift + H', 'sc.editor.6'],
    ['Ctrl + K', 'sc.editor.7'],
    ['Ctrl + \\', 'sc.editor.8'],
    ['Ctrl + S', 'sc.editor.9'],
    ['Tab', 'sc.editor.10'],
    ['Esc', 'sc.editor.11']
  ],
  para: [
    ['Ctrl + 1 ~ 6', 'sc.para.1'],
    ['Ctrl + 0', 'sc.para.2'],
    ['Ctrl + = / −', 'sc.para.3'],
    ['Ctrl + Shift + Q', 'sc.para.4'],
    ['Ctrl + Shift + [', 'sc.para.5'],
    ['Ctrl + Shift + ]', 'sc.para.6'],
    ['Ctrl + Shift + X', 'sc.para.7'],
    ['Ctrl + Shift + K', 'sc.para.8'],
    ['Ctrl + Shift + M', 'sc.para.9'],
    ['Ctrl + Shift + T', 'sc.para.10']
  ],
  nav: [
    ['Alt + ←', 'sc.nav.1'],
    ['Alt + →', 'sc.nav.2'],
    ['Alt + ↑', 'sc.nav.3'],
    ['Backspace', 'sc.nav.4'],
    ['Esc', 'sc.nav.5']
  ],
  files: [
    ['点文件 / 文件夹', 'sc.files.1'],
    ['Ctrl / ⌘ + 点', 'sc.files.2'],
    ['Shift + 点', 'sc.files.3'],
    ['点空白处', 'sc.files.4'],
    ['多选后', 'sc.files.5'],
    ['右键任意一项', 'sc.files.6']
  ],
  read: [
    ['鼠标拖选', 'sc.read.1'],
    ['Ctrl + A', 'sc.read.2'],
    ['在正文里点右键', 'sc.read.3']
  ],
  canvas: [
    ['点任意一段', 'sc.canvas.1'],
    ['鼠标拖选', 'sc.canvas.2'],
    ['↑ / ↓', 'sc.canvas.3'],
    ['Enter', 'sc.canvas.4'],
    ['Shift + Enter', 'sc.canvas.5'],
    ['Enter（列表 / 引用）', 'sc.canvas.6'],
    ['Enter（代码块 / 表格 / Front Matter）', 'sc.canvas.7'],
    ['Del', 'sc.canvas.8'],
    ['Backspace', 'sc.canvas.9'],
    ['点画布空白', 'sc.canvas.10'],
    ['点右键 / Aa 格式', 'sc.canvas.11'],
    ['Esc', 'sc.canvas.12']
  ]
};

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
  return pathMod.join(appDataDir(), 'vault-workbench');
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
  if (!w.ok) console.error('[vault-workbench] failed writing search index', w.err);
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
  if (!w.ok) console.error('[vault-workbench] failed writing trash map', w.err);
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

/* -------------------------------------------------------------------------
 *  插件主体：设置、库发现、索引、资源定位
 *  （本片段由 build.js 拼进 main.js，不要单独 require）
 * ------------------------------------------------------------------------- */
/* ==========================================================================
 *  Plugin
 * ========================================================================== */
class VaultWorkbenchPlugin extends Plugin {
  async onload() {
    await this.loadSettings();
    // 语言要在任何 UI 画出来之前定好（auto = 读 Obsidian 界面语言）
    this.applyLang();

    this.opLog = [];
    this.externalCache = {}; // rootPath -> { ts, files, folderCount }
    this.wallpaperCache = { key: '', url: '' };
    this.dataUrlCache = {};  // absPath -> { ts, url }  外部库文件内联预览用

    this.registerView(VIEW_TYPE, (leaf) => new WorkbenchView(leaf, this));

    this.addRibbonIcon('layout-grid', tr('misc.ribbonTip'), () => this.activateView());

    this.addCommand({
      id: 'open-vault-workbench',
      name: tr('misc.cmdOpen'),
      callback: () => this.activateView()
    });

    this.addCommand({
      id: 'refresh-vault-workbench',
      name: tr('misc.cmdRefresh'),
      callback: () => {
        this.externalCache = {};
        this.refreshViews();
        new Notice(tr('misc.indexRefreshed'));
      }
    });

    // 库变化时自动刷新（防抖 400ms）
    this.debouncedRefresh = debounce(() => this.refreshViews(), 400);
    this.registerEvent(this.app.vault.on('create', this.debouncedRefresh));
    this.registerEvent(this.app.vault.on('delete', this.debouncedRefresh));
    this.registerEvent(this.app.vault.on('rename', this.debouncedRefresh));
    this.registerEvent(this.app.metadataCache.on('resolve', this.debouncedRefresh));

    // 留个引用：切语言时要重画这一页（见 applyLang）
    this.settingTab = new WorkbenchSettingTab(this.app, this);
    this.addSettingTab(this.settingTab);

    this.app.workspace.onLayoutReady(() => {
      // 静默启动，不强行抢占用户的界面
    });
  }

  onunload() {
    this.externalCache = {};
  }

  async loadSettings() {
    const loaded = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded || {});
    this.settings.appearance = Object.assign({}, DEFAULT_SETTINGS.appearance, (loaded || {}).appearance);
    this.settings.vaults = Object.assign({}, DEFAULT_SETTINGS.vaults, (loaded || {}).vaults);
    this.settings.open = Object.assign({}, DEFAULT_SETTINGS.open, (loaded || {}).open);
    // v0.4.0 迁移：默认改成「右侧预览模式」。只要用户没在下拉菜单里手动选过，
    // 就统一落到 panel；手动选过的（migrated=true）保持原样。
    if (!this.settings.open.migrated) {
      this.settings.open.mode = DEFAULT_SETTINGS.open.mode;
    }
    if (!OPEN_MODES.some((m) => m.id === this.settings.open.mode)) {
      this.settings.open.mode = DEFAULT_SETTINGS.open.mode;
    }
    this.settings.view = Object.assign({}, DEFAULT_SETTINGS.view, (loaded || {}).view);
    if (!Array.isArray(this.settings.smartViews)) this.settings.smartViews = [];
    this.settings.editor = Object.assign({}, DEFAULT_SETTINGS.editor, (loaded || {}).editor);
    if (!EDITOR_MODES.some((m) => m.id === this.settings.editor.mode)) {
      this.settings.editor.mode = DEFAULT_SETTINGS.editor.mode;
    }
    this.settings.ui = Object.assign({}, DEFAULT_SETTINGS.ui, (loaded || {}).ui);
    if (!this.settings.ui.lang) this.settings.ui.lang = DEFAULT_SETTINGS.ui.lang;
    if (!this.settings.vaultAppearance || typeof this.settings.vaultAppearance !== 'object') {
      this.settings.vaultAppearance = {};
    }
    // 兼容旧配置：缺字段时回落到默认值
    for (const k of Object.keys(DEFAULT_SETTINGS.appearance)) {
      if (typeof this.settings.appearance[k] === 'undefined') {
        this.settings.appearance[k] = DEFAULT_SETTINGS.appearance[k];
      }
    }
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }

  /* 打开方式：panel（右侧预览·默认） / workbench（工作面板） / native（原生编辑） */
  setOpenMode(mode, quiet) {
    this.settings.open.mode = mode;
    this.settings.open.migrated = true; // 用户自己定的，不再被迁移逻辑覆盖
    this.saveSettings();
    this.refreshViews();
    if (!quiet) new Notice(tr('misc.openMode', { mode: tr('mode.open.' + mode + '.label') }));
  }
  cycleOpenMode() {
    const cur = this.settings.open.mode || DEFAULT_SETTINGS.open.mode;
    const i = OPEN_MODES.findIndex((m) => m.id === cur);
    const next = OPEN_MODES[(i + 1) % OPEN_MODES.length];
    this.setOpenMode(next.id);
  }

  refreshViews() {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      if (leaf.view && leaf.view.render) leaf.view.render();
    }
  }

  /* 语言：auto = 读 Obsidian 界面语言（读不到就中文），也可手动钉成 zh / en。
   * 切换后要把工作台视图、抽屉、原生设置页都重画一遍 ——
   * 只重画视图的话，设置页还会停在旧语言上。 */
  applyLang() {
    const ui = (this.settings && this.settings.ui) || {};
    const want = ui.lang || 'auto';
    let lang = want;
    if (want === 'auto') lang = normLang(detectLang(this.app)) || 'zh';
    setLang(lang);
    this.refreshViews();
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      const v = leaf && leaf.view;
      // render() 只重画文件区 —— 顶栏静态文案和标签页标题要单独同步
      if (v && typeof v.applyStaticLang === 'function') {
        try { v.applyStaticLang(); } catch (e) { /* 忽略 */ }
      }
      if (v && v.drawerOpen && typeof v.renderDrawer === 'function') v.renderDrawer();
    }
    if (this.settingTab && typeof this.settingTab.display === 'function') {
      try { this.settingTab.display(); } catch (e) { /* 忽略 */ }
    }
    return lang;
  }

  async activateView() {
    const ws = this.app.workspace;
    let leaf = ws.getLeavesOfType(VIEW_TYPE)[0];
    if (!leaf) {
      try { leaf = ws.getLeaf('tab'); }
      catch (e) { leaf = ws.getLeaf(true); }
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
    }
    ws.revealLeaf(leaf);
  }

  /* --------------------------------------------------- vault discovery */
  currentVaultPath() {
    try {
      if (this.app.vault.adapter && typeof this.app.vault.adapter.getBasePath === 'function') {
        return this.app.vault.adapter.getBasePath();
      }
    } catch (e) { /* ignore */ }
    return '';
  }

  discoverVaults() {
    const cur = this.currentVaultPath().replace(/\\/g, '/');
    const list = [];
    const seen = new Set();

    const push = (rawPath, source) => {
      const p = String(rawPath || '').replace(/\\/g, '/').replace(/\/+$/, '');
      if (!p || seen.has(p.toLowerCase())) return;
      seen.add(p.toLowerCase());
      const isCur = p.toLowerCase() === cur.toLowerCase();
      list.push({
        id: p,
        name: this.settings.vaults.aliases[p] || baseNameOf(p),
        path: p,
        current: isCur,
        source: source
      });
    };

    // 1) Obsidian 注册过的仓库
    //    配置目录三个系统都不一样（%APPDATA% / ~/Library/Application Support / ~/.config），
    //    统一走 obsidianConfigPath()，不然 mac / Linux 上自动发现直接失效。
    try {
      const cfgPath = obsidianConfigPath();
      if (fs.existsSync(cfgPath)) {
        const raw = readJsonFile(cfgPath, {});
        const vaults = raw.vaults || {};
        if (Array.isArray(vaults)) {
          for (const v of vaults) push(typeof v === 'string' ? v : (v && v.path), 'auto');
        } else {
          for (const k of Object.keys(vaults)) push(vaults[k] && vaults[k].path, 'auto');
        }
      }
    } catch (e) {
      console.error('[vault-workbench] read obsidian.json failed', e);
    }

    // 2) 当前库兜底
    push(cur, 'auto');

    // 3) 全局清单（跨库共享，切到别的库也还能看见这些库）
    try {
      const shared = this.readSharedVaults();
      for (const p of shared.extra) push(p, 'shared');
    } catch (e) { /* 全局清单读不到就算了，不影响本库那份 */ }

    // 4) 本库手动添加的
    for (const p of this.settings.vaults.extra || []) push(p, 'manual');

    // 每个库都带上「工作台装了没 / 是不是真的库」，右键菜单直接读这个，不用再查一次磁盘
    const withWb = list.map((v) => {
      const st = this.workbenchStateOf(v.path);
      return Object.assign({}, v, { wb: st.state, wbVer: st.ver, isVault: looksLikeVault(v.path) });
    });

    // 过滤隐藏
    const hidden = (this.settings.vaults.hidden || []).map((x) => x.toLowerCase());
    return withWb.filter((v) => hidden.indexOf(v.id.toLowerCase()) < 0);
  }

  /* ------------------------------------------------------------- index */
  buildCurrentIndex() {
    const files = this.app.vault.getFiles();
    const list = files.map((f) => {
      let tags = [];
      const cache = this.app.metadataCache.getFileCache(f);
      if (cache) {
        if (cache.tags) for (const t of cache.tags) tags.push(t.tag);
        const fm = cache.frontmatter;
        if (fm && Array.isArray(fm.tags)) {
          for (const t of fm.tags) tags.push('#' + String(t).replace(/^#/, ''));
        }
      }
      tags = tags.filter((t, i) => tags.indexOf(t) === i).slice(0, 8);
      return {
        id: f.path,
        file: f,
        name: f.name,
        relPath: f.path,
        absPath: (this.currentVaultPath() ? pathMod.join(this.currentVaultPath(), f.path) : ''),
        // 库根是 '/'，统一化成 ''，否则根目录下的文件会被算进一个没有名字的文件夹
        folder: normFolder(f.parent ? f.parent.path : ''),
        size: f.stat ? f.stat.size : 0,
        mtime: f.stat ? f.stat.mtime : 0,
        ctime: f.stat ? f.stat.ctime : 0,
        ext: '.' + (f.extension || ''),
        tags: tags,
        external: false
      };
    });
    return { files: list, folders: this.currentFolders() };
  }

  /* 当前库的全部文件夹（含**空文件夹**）。
   * 光靠 getFiles() 反推只能看到「有笔记的文件夹」，空文件夹永远不出现 ——
   * 所以这里直接问库要目录树（getRoot().children 递归），拿不到就回落成空清单。 */
  currentFolders() {
    const out = [];
    try {
      const vault = this.app.vault;
      const root = (typeof vault.getRoot === 'function') ? vault.getRoot() : null;
      if (!root) return out;
      const walk = (folder) => {
        const kids = folder && folder.children;
        if (!kids || typeof kids.length !== 'number') return;
        for (let i = 0; i < kids.length; i++) {
          const c = kids[i];
          if (!c || !c.children) continue;   // TFile 没有 children，只有 TFolder 有
          const p = normFolder(c.path);
          if (!p) continue;
          if (p.split('/').some((seg) => isIgnoredEntry(seg))) continue;
          out.push({ path: p, name: c.name || p.split('/').pop() });
          walk(c);
        }
      };
      walk(root);
    } catch (e) {
      console.error('[vault-workbench] failed reading folder tree', e);
    }
    return out;
  }

  getExternalIndex(rootPath) {
    const cached = this.externalCache[rootPath];
    if (cached && Date.now() - cached.ts < 30000) return cached;
    const res = scanExternalVault(rootPath);
    this.externalCache[rootPath] = Object.assign({ ts: Date.now() }, res);
    return this.externalCache[rootPath];
  }

  indexOf(vaultPath) {
    const cur = this.currentVaultPath().replace(/\\/g, '/');
    if (vaultPath.replace(/\\/g, '/').toLowerCase() === cur.toLowerCase()) {
      const idx = this.buildCurrentIndex();
      return { files: idx.files, folders: idx.folders, external: false };
    }
    const idx = this.getExternalIndex(vaultPath);
    return { files: idx.files, folders: idx.folders || [], external: true };
  }

  /* --------------------------------------------------------- wallpaper */
  // ap 可选：支持"每个库单独配置外观"时传入该库的外观记录
  wallpaperCss(ap) {
    const a = ap || this.settings.appearance;
    const custom = asStr(a.customImage);
    if (!custom) return (WALLPAPERS[a.wallpaper] || WALLPAPERS.none).css;
    // 直接是 data URL（在视图内用文件选择器挑的图片）
    if (/^data:/i.test(custom)) return 'url(' + custom + ') center/cover no-repeat';
    if (this.wallpaperCache.key === custom && this.wallpaperCache.url) {
      return 'url(' + this.wallpaperCache.url + ') center/cover no-repeat';
    }
    try {
      const data = fs.readFileSync(custom);
      const ext = pathMod.extname(custom).slice(1).toLowerCase() || 'png';
      const url = 'data:image/' + ext + ';base64,' + data.toString('base64');
      this.wallpaperCache = { key: custom, url: url };
      return 'url(' + url + ') center/cover no-repeat';
    } catch (e) {
      return (WALLPAPERS[a.wallpaper] || WALLPAPERS.none).css;
    }
  }

  /* ----------------------------------------------- 外部库文件内联预览 */
  /* 当前库走 Obsidian 资源协议；外部库不在 vault 内，只能读成 data URL */
  dataUrlOf(absPath, ext, maxBytes) {
    if (!absPath) return '';
    if (!this.dataUrlCache) this.dataUrlCache = {};
    const hit = this.dataUrlCache[absPath];
    if (hit && Date.now() - hit.ts < 120000) return hit.url;
    const cap = maxBytes || MAX_INLINE;
    try {
      const st = fs.statSync(absPath);
      if (st.size > cap) return '';
      const mime = MIME[extOf(ext)] || 'application/octet-stream';
      const url = 'data:' + mime + ';base64,' + fs.readFileSync(absPath).toString('base64');
      // 简单上限：缓存条目不超过 60 个，避免图片库把内存吃满
      const keys = Object.keys(this.dataUrlCache);
      if (keys.length > 60) delete this.dataUrlCache[keys[0]];
      this.dataUrlCache[absPath] = { ts: Date.now(), url: url };
      return url;
    } catch (e) {
      return '';
    }
  }

  /* ------------------------------------------------------ safety: log */
  logOp(op) {
    op.ts = Date.now();
    this.opLog.unshift(op);
    if (this.opLog.length > 200) this.opLog.pop();
  }
}

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
    if (!w.ok) console.error('[vault-workbench] failed writing global vault list', w.err);
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

/* -------------------------------------------------------------------------
 *  工作台视图 · 核心：生命周期 / 布局 / 键盘
 *  （本片段由 build.js 拼进 main.js，不要单独 require）
 * ------------------------------------------------------------------------- */
class WorkbenchView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.selectedVault = null;
    this.folderPath = '';
    this.mode = plugin.settings.view.mode || 'grid';
    this.sort = plugin.settings.view.sort || 'mtime';
    this.query = '';
    this.searchScope = 'current';    // current = 只搜当前库；all = 跨库全文搜索
    this.crossHits = null;           // 上一次跨库搜索的结果（渲染用，避免重复建索引）
    this.tagsRequested = false;
    this.selectedNote = null;
    this.drawerOpen = false;
    this.drawerPage = 'appearance';   // 设置面板当前子页
    this.openMenuOpen = false;        // 「打开方式切换」下拉是否展开
    this.hist = [];                   // 目录历史（前进 / 后退）
    this.histIdx = -1;
    this.expandedFolders = new Set(); // 列表模式下就地展开的文件夹（点 ▸ 看里面有什么）
    this.multiSel = new Map();        // 文件区多选（key → {kind, item}），批量操作靠它
    this.selAnchor = -1;              // Shift 连选的起点（在 flatOrder 里的下标）
    this.batchDelArm = false;         // 批量删除的二次确认是否已按下
    this.tagFilter = [];              // 仪表盘：已选标签（AND 交集筛选）
    this.weekOnly = false;            // 仪表盘：只看近 7 天修改的
    this.tagPanelOpen = false;        // 仪表盘：文件区是否换成标签列表面板
    this.tagQuery = '';               // 标签面板里的过滤词
    this.dashCache = null;            // 仪表盘数字缓存（库+文件数+最大 mtime 为 key）
    this.moveEl = null;               // 「移动到…」浮层
    this.newMenuOpen = false;         // 工具条「＋ 新建」下拉是否展开
    this.customFileName = '';
    this.prevKind = 'markdown'; // 当前预览的文件类型
    this.imgZoom = 'fit';       // 图片预览：fit（适应） / actual（实际大小）
    this.prevMax = false;       // 预览面板是否铺满整个内容区
    this.outlineOpen = false;   // 大纲抽屉
    this.docHeadings = [];      // 当前文档的标题列表（供大纲跳转）
    this.docMode = 'read';      // 文档模式：read（渲染阅读） / edit（工作台内编辑）
    this.docDirty = false;      // 编辑器里有未保存内容
    this.saveTimer = null;
    this.liveTimer = null;
    this.blocks = [];           // 单画布：解析出来的 Markdown 块
    this.blockEls = [];         // 与 blocks 同索引的 DOM
    this.editingBlock = null;   // 正在就地编辑的块索引
    this.blockTa = null;        // 该块的 textarea
    this.canvasEl = null;       // 单画布容器
    this.liveEl = null;         // 双栏模式的实时渲染栏
    this.ctxEl = null;          // 右键菜单
    this.commitBusy = null;     // 正在进行的「提交这一段」
    this.canvasBusy = null;     // 正在进行的单画布重绘
  }

  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return tr('misc.viewTitle'); }
  getIcon() { return 'layout-grid'; }

  async onOpen() {
    const vaults = this.plugin.discoverVaults();
    const cur = vaults.find((v) => v.current) || vaults[0];
    this.selectedVault = cur ? cur.id : null;
    this.resetHist();
    this.buildLayout();
    this.registerDomEvent(document, 'keydown', (e) => this.onKeyDown(e));
    // 点空白处收起「打开方式切换」下拉
    this.registerDomEvent(document, 'click', (e) => this.onDocClick(e));
    // 窗口大小变了，开着的「＋ 新建」下拉要重新贴一次边（它是按主区宽度算位置的）
    this.registerDomEvent(window, 'resize', () => { if (this.newMenuOpen) this.placeNewMenu(); });
  }

  async onClose() {
    try { await this.flushDocSave(); } catch (e) { /* 关闭时尽力保存 */ }
  }

  /* 键盘：Esc 逐层退出；Alt+← / Alt+→ 目录前进后退；Alt+↑ 上一级 */
  onKeyDown(e) {
    // ⚠ 变量名不能叫 t —— 会遮蔽 i18n 的全局 tr()，这个函数里要取文案
    const tgt = e.target;
    const typing = !!(tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable));

    if (e.key === 'Escape') {
      if (typing) return;
      if (this.ctxEl) { this.closeEditorMenu(); return; }
      if (this.moveEl) { this.closeMovePicker(); return; }
      if (this.newMenuOpen) { this.newMenuOpen = false; this.renderNewMenu(); this.render(); return; }
      if (this.openMenuOpen) { this.openMenuOpen = false; this.render(); return; }
      if (this.multiSel && this.multiSel.size) { this.clearMulti(); return; }
      if (this.drawerOpen) { this.toggleDrawer(false); return; }
      if (this.outlineOpen) { this.toggleOutline(false); return; }
      if (this.prevMax) { this.togglePreviewMax(false); return; }
      if (this.selectedNote) this.closePreview();
      return;
    }
    if (typing) return;

    // 编辑态：焦点不在任何输入框时（例如单画布刚进来），Ctrl+S 也要能保存
    if (this.docMode === 'edit' && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey &&
      String(e.key).toLowerCase() === 's') {
      if (e.preventDefault) e.preventDefault();
      this.flushDocSave();
      new Notice(tr('misc.saved'));
      return;
    }

    // 目录前进 / 后退（Alt+← / Alt+→，Ctrl+Alt+← / → 亦可）
    if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      if (e.preventDefault) e.preventDefault();
      if (e.stopPropagation) e.stopPropagation();
      if (e.key === 'ArrowLeft') this.goBack(); else this.goFwd();
      return;
    }
    // 上一级
    if (e.altKey && e.key === 'ArrowUp') {
      if (e.preventDefault) e.preventDefault();
      if (e.stopPropagation) e.stopPropagation();
      this.goUp();
      return;
    }
    // 文件列表里按退格 = 上一级（输入框里不会走到这里）
    if (e.key === 'Backspace' && this.folderPath && !this.query) {
      if (e.preventDefault) e.preventDefault();
      this.goUp();
    }
  }

  /* 点空白处：收起下拉菜单 / 右键菜单 / 移动浮层 */
  onDocClick(e) {
    let dirty = false;
    const t = e && e.target;
    const within = (sel) => !!(t && typeof t.closest === 'function' && t.closest(sel));
    if (this.ctxEl) {
      if (!within('.vwb-ctx')) { this.closeEditorMenu(); dirty = true; }
    }
    if (this.moveEl) {
      if (!within('.vwb-move')) this.closeMovePicker();
    }
    if (this.newMenuOpen) {
      if (!within('.vwb-newmenu')) {
        this.newMenuOpen = false;
        this.renderNewMenu();
      }
    }
    if (this.openMenuOpen) {
      if (!within('.vwb-menu')) {
        this.openMenuOpen = false;
        this.render();
      }
    } else if (dirty) {
      // 右键菜单本来浮在预览面板上，关掉不需要重绘列表
    }
  }

  buildLayout() {
    const root = this.contentEl;
    root.empty();
    root.addClass('vwb-root');
    // 让 Obsidian 的 view-content 变成有确定高度的弹性列，避免内容把视图撑出屏幕
    if (root.parentElement) root.parentElement.addClass('vwb-host');

    this.bgEl = root.createDiv({ cls: 'vwb-bg' });

    // 左：库导航
    this.railEl = root.createDiv({ cls: 'vwb-rail vwb-layer' });
    this.renderRail();

    // 主区
    this.mainEl = root.createDiv({ cls: 'vwb-main vwb-layer' });

    const top = this.mainEl.createDiv({ cls: 'vwb-topbar' });
    const search = top.createDiv({ cls: 'vwb-search' });
    this.searchEl = search.createEl('input', { type: 'text', placeholder: tr('ui.5') });
    this.searchClearEl = search.createDiv({ cls: 'vwb-search-x', text: '✕' });
    this.searchClearEl.addEventListener('click', () => this.clearSearch(true));
    this.searchEl.addEventListener('keydown', (e) => {
      // 打字时不让 Obsidian 全局快捷键抢走按键
      e.stopPropagation();
      if (e.key === 'Escape') this.clearSearch(true);
    });
    // 跨库搜索要建索引，比只搜文件名重一点，所以防抖放宽到 320ms
    this.searchEl.addEventListener('input', debounce(() => {
      this.query = this.searchEl.value.trim();
      this.folderPath = '';
      this.syncSearchUI();
      this.render();
    }, 320));
    // 「＋ 新建」：下拉二选一 —— 新建文件（默认就在工作台里编辑）/ 新建文件夹
    const nWrap = top.createDiv({ cls: 'vwb-menu vwb-newmenu' });
    this.newMenuWrapEl = nWrap;
    const nBtn = nWrap.createDiv({ cls: 'vwb-btn vwb-btn-pri vwb-menu-btn', text: tr('bar.new') });
    this.newBtnEl = nBtn;   // 切语言后要同步按钮文案（见 applyStaticLang）
    nBtn.setAttribute('title', tr('bar.new.tip'));
    nBtn.addEventListener('click', (e) => {
      if (e && e.stopPropagation) e.stopPropagation();
      this.newMenuOpen = !this.newMenuOpen;
      this.openMenuOpen = false;
      this.renderNewMenu();
      this.render();
    });
    this.newMenuPopEl = nWrap.createDiv({ cls: 'vwb-menu-pop vwb-newmenu-pop vwb-glass' });
    this.renderNewMenu();
    const rfBtn = top.createEl('button', { cls: 'vwb-btn', text: tr('ui.117') });
    this.refreshBtnEl = rfBtn;   // 切语言后要同步按钮文案
    rfBtn.addEventListener('click', () => {
      this.plugin.externalCache = {};
      this.render();
      new Notice(tr('misc.refreshed'));
    });

    // 内容行：文件区 + 预览面板并排，两边各自滚动（互不挤压、不会溢出屏幕）
    this.contentRowEl = this.mainEl.createDiv({ cls: 'vwb-content' });

    this.bodyEl = this.contentRowEl.createDiv({ cls: 'vwb-body' });
    this.statsEl = this.bodyEl.createDiv({ cls: 'vwb-stats' });
    this.barEl = this.bodyEl.createDiv({ cls: 'vwb-bar' });
    this.areaEl = this.bodyEl.createDiv({ cls: 'vwb-area' });
    this.hintEl = this.bodyEl.createDiv({ cls: 'vwb-hint' });

    // 预览面板
    this.prevEl = this.contentRowEl.createDiv({ cls: 'vwb-prev vwb-glass' });
    const ph = this.prevEl.createDiv({ cls: 'vwb-prev-head' });
    const pht = ph.createDiv({ cls: 'vwb-prev-hd-txt' });
    this.prevTitleEl = pht.createDiv({ cls: 'vwb-prev-t' });
    // 点文件名直接重命名（Windows 习惯：标题就是入口）
    this.prevTitleEl.setAttribute('title', tr('editor.rename'));
    this.prevTitleEl.addEventListener('click', () => {
      const n = this.selectedNote;
      if (!n || !n.relPath) return;
      this.renameVaultItem(n.relPath, false);
    });
    this.prevMetaEl = pht.createDiv({ cls: 'vwb-prev-m' });
    const pTools = ph.createDiv({ cls: 'vwb-prev-tools' });
    // 阅读 / 编辑 切换（工作台内直接改，不跳标签）
    this.docModeEl = pTools.createDiv({ cls: 'vwb-prev-x vwb-docmode', text: tr('preview.edit') });
    this.docModeEl.setAttribute('aria-label', tr('preview.editTip'));
    this.docModeEl.addEventListener('click', () => this.setDocMode());
    this.outlineBtn = pTools.createDiv({ cls: 'vwb-prev-x', text: '☰' });
    this.outlineBtn.setAttribute('aria-label', tr('preview.outlineTip'));
    this.outlineBtn.addEventListener('click', () => this.toggleOutline());
    this.maxBtn = pTools.createDiv({ cls: 'vwb-prev-x', text: '⤢' });
    this.maxBtn.setAttribute('aria-label', tr('ui.170'));
    this.maxBtn.addEventListener('click', () => this.togglePreviewMax());
    const pClose = pTools.createDiv({ cls: 'vwb-prev-x vwb-prev-close', text: '✕' });
    pClose.setAttribute('aria-label', tr('preview.closeTip'));
    pClose.addEventListener('click', () => this.closePreview());
    this.prevMainEl = this.prevEl.createDiv({ cls: 'vwb-prev-main' });
    this.prevBodyEl = this.prevMainEl.createDiv({ cls: 'vwb-prev-body vwb-doc' });
    // 大纲抽屉（点标题可跳转）—— 与正文并排，不遮挡头部按钮
    this.outlineEl = this.prevMainEl.createDiv({ cls: 'vwb-outline vwb-glass' });
    this.prevFootEl = this.prevEl.createDiv({ cls: 'vwb-prev-foot' });

    // 外观设置抽屉（覆盖在视图右侧，替代原来的「跳去 Obsidian 原生设置」）
    this.drawerEl = root.createDiv({ cls: 'vwb-drawer vwb-glass' });

    this.syncSearchUI();
    this.render();
    this.renderDrawer();
  }

  /* ------------------------------------------------- 切语言后的静态文案同步
   * buildLayout() 只在视图打开时跑一次，顶栏（搜索占位 / ＋新建 / 刷新）、
   * 预览头按钮的提示文案、标签页标题都是那时写死的；
   * render() 只重画文件区和工具条，不碰这些 —— 所以切语言后要在这里补一遍。 */
  applyStaticLang() {
    if (this.searchEl) this.searchEl.placeholder = tr('ui.5');
    if (this.newBtnEl) {
      this.newBtnEl.setText(tr('bar.new'));
      this.newBtnEl.setAttribute('title', tr('bar.new.tip'));
    }
    if (this.refreshBtnEl) this.refreshBtnEl.setText(tr('ui.117'));
    if (this.prevTitleEl) this.prevTitleEl.setAttribute('title', tr('editor.rename'));
    if (this.docModeEl) {
      this.docModeEl.setText(this.docMode === 'edit' ? tr('editor.read') : tr('editor.edit'));
      this.docModeEl.setAttribute('aria-label', tr('preview.editTip'));
    }
    if (this.outlineBtn) this.outlineBtn.setAttribute('aria-label', tr('preview.outlineTip'));
    if (this.maxBtn) this.maxBtn.setAttribute('aria-label', tr('ui.170'));
    // 标签页标题：Obsidian 缓存了 getDisplayText() 的结果，切语言不会自动重取，
    // 直接改 tab 头的标题元素（非公开属性，try/catch 兜底旧版）
    try {
      const t = this.leaf && this.leaf.tabHeaderInnerTitleEl;
      if (t && typeof t.setText === 'function') t.setText(tr('misc.viewTitle'));
    } catch (e) { /* 旧版 API 没有就跳过，重开视图后自然正确 */ }
  }

  /* Esc / 抽屉开关 */
  toggleDrawer(force) {
    this.drawerOpen = typeof force === 'boolean' ? force : !this.drawerOpen;
    this.renderDrawer();
    this.renderRail();
  }

  /* ------------------------------------------------------ 外观（含每库独立） */
}

/* -------------------------------------------------------------------------
 *  工作台视图 · 外观（含每库独立配置）
 *  （本片段由 build.js 拼进 main.js，不要单独 require）
 * ------------------------------------------------------------------------- */
Object.assign(WorkbenchView.prototype, {
  apRecord() {
    const s = this.plugin.settings;
    if (s.perVaultAppearance && this.selectedVault) {
      if (!s.vaultAppearance || typeof s.vaultAppearance !== 'object') s.vaultAppearance = {};
      if (!s.vaultAppearance[this.selectedVault]) {
        s.vaultAppearance[this.selectedVault] = Object.assign({}, s.appearance);
      }
      return s.vaultAppearance[this.selectedVault];
    }
    return s.appearance;
  },

  effectiveAppearance() {
    const s = this.plugin.settings;
    const base = Object.assign({}, s.appearance);
    if (s.perVaultAppearance && s.vaultAppearance && this.selectedVault) {
      const own = s.vaultAppearance[this.selectedVault];
      if (own) Object.assign(base, own);
    }
    return base;
  },

  // silent=true 时不重排内容区（拖滑杆时用，避免卡顿）
  setApp(key, value, silent) {
    const rec = this.apRecord();
    rec[key] = value;
    this.plugin.saveSettings();
    this.applyAppearance();
    if (!silent) this.render();
  },

  applyAppearance() {
    const ap = this.effectiveAppearance();
    const root = this.contentEl;
    root.style.setProperty('--vwb-acc', asStr(ap.accent, '#7f6df2'));
    root.style.setProperty('--vwb-dim', String(typeof ap.dim === 'number' ? ap.dim : 0.25));
    root.style.setProperty('--vwb-blur', (typeof ap.blur === 'number' ? ap.blur : 20) + 'px');
    const pg = PRESETS[ap.preset] ? PRESETS[ap.preset].glass : 0.07;
    root.style.setProperty('--vwb-glass', 'rgba(255,255,255,' + pg + ')');
    if (this.bgEl) this.bgEl.style.background = this.plugin.wallpaperCss(ap);
    if (this.prevEl) {
      // 铺满模式下不吃「侧滑/悬浮/底部」的位置类，直接覆盖整个内容区
      this.prevEl.className = 'vwb-prev vwb-glass' +
        (this.prevMax ? ' is-max' : (ap.previewPos === 'side' ? '' : ' ' + ap.previewPos)) +
        (this.selectedNote ? ' is-on' : '');
    }
  }
});

/* -------------------------------------------------------------------------
 *  工作台视图 · 左侧 obsidian库导航
 *  （本片段由 build.js 拼进 main.js，不要单独 require）
 * ------------------------------------------------------------------------- */
Object.assign(WorkbenchView.prototype, {
  renderRail() {
    const el = this.railEl;
    if (!el) return;
    el.empty();
    const collapsed = !!(this.plugin.settings.ui && this.plugin.settings.ui.railCollapsed);
    el.className = 'vwb-rail vwb-layer' + (collapsed ? ' is-collapsed' : '');

    // 标题行 + 展开 / 收缩
    const head = el.createDiv({ cls: 'vwb-rail-head' });
    head.createEl('h4', { cls: 'vwb-rail-t', text: tr('rail.title') });
    const tg = head.createDiv({
      cls: 'vwb-rail-tg',
      text: collapsed ? tr('rail.expand') : tr('rail.collapse')
    });
    tg.setAttribute('title', collapsed ? tr('rail.expand.tip') : tr('rail.collapse.tip'));
    tg.addEventListener('click', () => this.toggleRail());
    if (collapsed) {
      // 收起态：标题行只留一个图标按钮
      const ic = el.createDiv({ cls: 'vwb-rail-ic' });
      ic.createEl('span', { text: '🗄' });
      ic.setAttribute('title', tr('rail.collapsed.tip'));
    }

    const vaults = this.plugin.discoverVaults();
    if (!vaults.length) {
      el.createDiv({ cls: 'vwb-cnt', text: tr('rail.none') });
    }
    for (const v of vaults) {
      const item = el.createDiv({ cls: 'vwb-vault' + (v.id === this.selectedVault ? ' is-on' : '') });
      // 侧栏宽度有限，长库名会被 ellipsis 截断 —— hover 显示完整库名
      item.setAttribute('title', v.name);
      const dot = item.createDiv({ cls: 'vwb-dot' });
      dot.style.background = v.current ? 'var(--vwb-acc)' : 'var(--text-faint)';
      dot.style.color = dot.style.background;
      item.createDiv({ cls: 'vwb-vault-name', text: v.name });
      if (v.current) {
        item.createDiv({ cls: 'vwb-badge', text: tr('rail.badge.current') });
      } else if (v.isVault === false) {
        const b = item.createDiv({ cls: 'vwb-badge', text: tr('rail.badge.folder') });
        b.setAttribute('title', tr('rail.badge.folder.tip'));
      } else if (v.wb === 'none') {
        const b = item.createDiv({ cls: 'vwb-badge is-warn', text: tr('rail.badge.none') });
        b.setAttribute('title', tr('rail.badge.none.tip'));
      } else if (v.wb === 'stale') {
        const b = item.createDiv({ cls: 'vwb-badge is-warn', text: tr('rail.badge.stale') });
        b.setAttribute('title', tr('rail.badge.stale.tip', { ver: v.wbVer || '?' }));
      }
      item.addEventListener('click', () => this.selectVault(v.id));
      /* 右键：切库 / 装工作台 / 复制路径 / 显示 / 隐藏 */
      item.addEventListener('contextmenu', (e) => {
        if (e && e.preventDefault) e.preventDefault();
        if (e && e.stopPropagation) e.stopPropagation();
        this.showVaultMenu(e, v);
      });
    }
    if (!collapsed) {
      const tip = el.createDiv({ cls: 'vwb-rail-tip', text: tr('rail.tip') });
      tip.setAttribute('title', tr('rail.tip.title'));
    }
    const foot = el.createDiv({ cls: 'vwb-rail-foot' });
    // 「设置」入口：打开带子页的设置面板（外观 / 打开方式 / 库管理 / 日志 / 关于）
    const setBtn = foot.createDiv({ cls: 'vwb-mini' + (this.drawerOpen ? ' is-on' : '') });
    setBtn.createEl('span', { cls: 'vwb-mini-ic', text: '⚙' });
    setBtn.createEl('span', { cls: 'vwb-mini-tx', text: tr('rail.settings') });
    setBtn.setAttribute('title', tr('rail.settings.tip'));
    setBtn.addEventListener('click', () => this.toggleDrawer());

    const reBtn = foot.createDiv({ cls: 'vwb-mini' });
    reBtn.createEl('span', { cls: 'vwb-mini-ic', text: '↻' });
    reBtn.createEl('span', { cls: 'vwb-mini-tx', text: tr('rail.rediscover') });
    reBtn.setAttribute('title', tr('rail.rediscover.tip'));
    reBtn.addEventListener('click', () => { this.renderRail(); new Notice(tr('rail.rediscovered')); });
  },

  /* 左侧导航 展开 / 收缩（默认展开，状态记进设置） */
  toggleRail(force) {
    if (!this.plugin.settings.ui) this.plugin.settings.ui = Object.assign({}, DEFAULT_SETTINGS.ui);
    const collapsed = typeof force === 'boolean' ? force : !this.plugin.settings.ui.railCollapsed;
    this.plugin.settings.ui.railCollapsed = collapsed;
    this.plugin.saveSettings();
    this.renderRail();
  },

  openPluginSettings() {
    const app = this.plugin.app;
    if (app.setting && typeof app.setting.open === 'function') {
      app.setting.open();
      if (typeof app.setting.openTabById === 'function') app.setting.openTabById('vault-workbench');
    } else {
      new Notice(tr('rail.openSettingsTip'));
    }
  },

  selectVault(id) {
    if (this.selectedVault === id) return;
    this.selectedVault = id;
    this.folderPath = '';
    this.resetHist();
    this.query = '';
    this.crossHits = null;   // 换了库，上一次跨库搜索的结果就作废了
    if (this.searchEl) this.searchEl.value = '';
    this.tagsRequested = false;
    this.closePreview();
    this.syncSearchUI();
    this.renderRail();
    this.render();
    if (this.drawerOpen) this.renderDrawer();
  },

  /* ---------------------------------------------------- 库：右键菜单 */
  /* 菜单挂在 this.contentEl（整个视图根）上，不挂在侧栏里：
   * .vwb-rail 有 overflow-y:auto 而且是 backdrop-filter 的层叠上下文，
   * 菜单放进去会被裁掉、还会点不动（v0.9.1 踩过的坑）。 */
  showVaultMenu(ev, v) {
    if (!v) return;
    const host = this.openCtxMenu(this.contentEl);
    if (!host) return;
    const x = Number(ev && ev.clientX) || 0;
    const y = Number(ev && ev.clientY) || 0;
    this.renderCtxGroups(host, this.vaultMenuGroups(v), {
      onPick: (id) => { this.closeEditorMenu(); this.runVaultCmd(id, v); }
    });
    this.placeMenu(host, x, y, this.contentEl);
    try { host.style.visibility = ''; } catch (e) { /* 忽略 */ }
  },

  vaultMenuGroups(v) {
    const cur = !!v.current;
    // 只是个普通文件夹（比如导入的笔记目录）就切不过去 —— 先在 Obsidian 里把它变成库
    const realVault = looksLikeVault(v.path);
    const notVaultWhy = tr('rail.notVault');
    let installLabel = tr('rail.menu.install');
    let installOk = !cur && realVault;
    let installWhy = realVault ? '' : notVaultWhy;
    if (v.wb === 'ok') {
      installLabel = tr('rail.menu.installOk', { ver: v.wbVer || '' });
      installOk = false;
      installWhy = tr('rail.menu.installOkWhy');
    } else if (v.wb === 'stale') {
      installLabel = tr('rail.menu.update', { ver: v.wbVer || '?' });
    }
    const groups = [];
    groups.push({ items: [
      {
        id: 'switch',
        label: cur ? tr('rail.menu.switchCur') : tr('rail.menu.switch'),
        ico: '⇄',
        disabled: cur || !realVault,
        why: cur ? tr('rail.menu.switchWhy') : (realVault ? '' : notVaultWhy)
      },
      { id: 'install', label: installLabel, ico: '⬇', disabled: !installOk, why: installWhy }
    ] });
    groups.push({ items: [
      { id: 'browse', label: tr('rail.menu.browse'), ico: '👁' },
      { id: 'refresh', label: tr('rail.menu.refresh'), ico: '↻' }
    ] });
    groups.push({ items: [
      { id: 'copy-uri', label: tr('rail.menu.copyUri'), ico: '🔗' },
      { id: 'copy-path', label: tr('menu.copyPath'), ico: '⧉' },
      { id: 'reveal', label: tr('rail.menu.reveal'), ico: '🗂' }
    ] });
    groups.push({ items: [
      { id: 'hide', label: tr('rail.menu.hide'), ico: '🚫', disabled: cur, why: tr('rail.menu.hideWhy') }
    ] });
    return groups;
  },

  runVaultCmd(id, v) {
    switch (id) {
      case 'switch': {
        const r = this.plugin.switchToVault(v.path);
        if (r && !r.ok) this.renderRail();
        return;
      }
      case 'install': {
        const d = this.plugin.deployWorkbenchTo(v.path);
        if (!d.ok) { new Notice(tr('rail.installFail', { reason: d.reason || tr('common.unknown') })); }
        else if (d.changed) {
          new Notice(!d.from
            ? tr('rail.installed', { name: v.name })
            : tr('rail.updated', { name: v.name, ver: d.to }), 10000);
        } else {
          new Notice(tr('rail.alreadyNew', { name: v.name }));
        }
        this.renderRail();
        return;
      }
      case 'browse': this.selectVault(v.id); return;
      case 'refresh': {
        delete this.plugin.externalCache[v.id];
        this.render();
        new Notice(tr('rail.refreshed', { name: v.name }));
        return;
      }
      case 'copy-uri': this.copyText(this.plugin.vaultUriOf(v.path), tr('rail.copiedUri')); return;
      case 'copy-path': this.copyText(v.path, tr('notice.copied')); return;
      case 'reveal': shellReveal(v.path); return;
      case 'hide': {
        const h = this.plugin.settings.vaults.hidden;
        if (h.indexOf(v.id) < 0) h.push(v.id);
        this.plugin.saveSettings();
        this.renderRail();
        new Notice(tr('rail.hidden', { name: v.name }));
        return;
      }
      default: return;
    }
  }

  /* ------------------------------------------- 目录历史：前进 / 后退 / 上一级
   * 进下一层、点面包屑、点上一级都会记一笔，之后就能用 Alt+← / Alt+→
   * （或工具条上的 ⇦ ⇨）在目录之间来回走。
   */
});

/* -------------------------------------------------------------------------
 *  工作台视图 · 目录导航：前进 / 后退 / 上一级 / 搜索
 *  （本片段由 build.js 拼进 main.js，不要单独 require）
 * ------------------------------------------------------------------------- */
Object.assign(WorkbenchView.prototype, {
  resetHist() {
    this.hist = [this.folderPath || ''];
    this.histIdx = 0;
  },
  pushHist(path) {
    if (!Array.isArray(this.hist) || !this.hist.length) this.resetHist();
    if (this.hist[this.histIdx] === path) return;
    // 正好是「前进」的下一站 —— 直接往前走，不新增记录
    if (this.hist[this.histIdx + 1] === path) { this.histIdx++; return; }
    // 走到新分支时丢掉原来的「前进」记录
    if (this.histIdx < this.hist.length - 1) this.hist.length = this.histIdx + 1;
    this.hist.push(path);
    if (this.hist.length > 60) this.hist.shift();
    this.histIdx = this.hist.length - 1;
  },
  /* 统一的目录跳转入口（面包屑 / 文件夹卡片 / 上一级都走这里） */
  goTo(path) {
    path = path || '';
    this.query = '';
    if (this.searchEl) this.searchEl.value = '';
    this.syncSearchUI();
    this.pushHist(path);
    this.folderPath = path;
    this.render();
  },
  canBack() { return Array.isArray(this.hist) && this.histIdx > 0; },
  canFwd() { return Array.isArray(this.hist) && this.histIdx < this.hist.length - 1; },
  goBack() {
    if (!this.canBack()) { new Notice(tr('notice.navStart')); return; }
    this.histIdx--;
    this.folderPath = this.hist[this.histIdx];
    this.query = '';
    if (this.searchEl) this.searchEl.value = '';
    this.syncSearchUI();
    this.render();
  },
  goFwd() {
    if (!this.canFwd()) { new Notice(tr('notice.navEnd')); return; }
    this.histIdx++;
    this.folderPath = this.hist[this.histIdx];
    this.query = '';
    if (this.searchEl) this.searchEl.value = '';
    this.syncSearchUI();
    this.render();
  },
  /* 返回上一级：如果上一级正是「后退」的那一站就直接后退，
   * 这样再按 Alt+→ 能前进回刚才的子目录；否则当作一次新的跳转记进历史。
   */
  goUp() {
    if (!this.folderPath) return;
    const segs = this.folderPath.split('/');
    segs.pop();
    const parent = segs.join('/');
    if (this.canBack() && this.hist[this.histIdx - 1] === parent) { this.goBack(); return; }
    this.goTo(parent);
  },

  syncSearchUI() {
    if (!this.searchClearEl) return;
    const has = !!(this.searchEl && this.searchEl.value);
    this.searchClearEl.className = 'vwb-search-x' + (has ? ' is-on' : '');
  },

  clearSearch(doRender) {
    this.query = '';
    this.crossHits = null;
    if (this.searchEl) this.searchEl.value = '';
    this.syncSearchUI();
    if (doRender) this.render();
  },

  selectedVaultInfo() {
    const list = this.plugin.discoverVaults();
    return list.find((v) => v.id === this.selectedVault) || list[0] || null;
  },

  /* 仪表盘四个卡片的全部数字（只统计当前选中的库）。
   * 笔记口径 = .md / .canvas / .excalidraw（含 .excalidraw.md），附件不计入笔记。
   * 结果按「库 + 文件数 + 最大 mtime」缓存：文件变了才重算，避免上千条时每次渲染都全量遍历。 */
  computeStats(notes) {
    const vault = this.selectedVaultInfo();
    const root = vault ? vault.path : '';
    let maxMt = 0;
    const foldersSeen = new Set();
    for (const n of notes) {
      if ((n.mtime || 0) > maxMt) maxMt = n.mtime || 0;
      foldersSeen.add(normFolder(n.folder));
    }
    // key 里带上「涉及多少不同文件夹」：文件移进/移出收集箱时 mtime 不变、
    // 总数也不变，只有文件夹分布会变 —— 否则收集箱数字不会实时更新
    const key = root + '|' + notes.length + '|' + maxMt + '|' +
      foldersSeen.size + '|' + ((this.indexFolders || []).length);
    if (this.dashCache && this.dashCache.key === key) return this.dashCache.value;
    const weekAgo = Date.now() - 7 * 86400000;
    let mdN = 0, canvasN = 0, excaliN = 0, week = 0;
    const tagCount = new Map();
    for (const n of notes) {
      const nm = String(n.name || '');
      const ext = String(n.ext || '').toLowerCase();
      const isExcali = nm.toLowerCase().endsWith('.excalidraw.md') || ext === '.excalidraw';
      const isNote = ext === '.md' || ext === '.canvas' || ext === '.excalidraw';
      if (!isNote) continue;
      if (isExcali) excaliN++;
      else if (ext === '.canvas') canvasN++;
      else mdN++;
      if ((n.mtime || 0) > weekAgo) week++;
      for (const t of (n.tags || [])) {
        const k = String(t || '').trim().replace(/^#+/, '');
        if (!k) continue;
        tagCount.set(k, (tagCount.get(k) || 0) + 1);
      }
    }
    // 收集箱：库根目录下名为 inbox 的文件夹的**第一层**（不递归）
    const inboxName = (this.plugin.settings.view.inbox || 'inbox').replace(/\/+$/, '');
    let inboxExists = false;
    let inboxCount = 0;
    for (const f of (this.indexFolders || [])) {
      const p = normFolder(f && f.path != null ? f.path : f);
      if (p && p === inboxName) { inboxExists = true; break; }
    }
    if (inboxExists) {
      for (const n of notes) {
        if (normFolder(n.folder) === inboxName) inboxCount++;
      }
    }
    const tagSorted = Array.from(tagCount.entries())
      .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0], 'zh'));
    const value = {
      total: mdN + canvasN + excaliN,
      md: mdN, canvas: canvasN, excali: excaliN,
      week: week,
      inboxExists: inboxExists,
      inbox: inboxCount,
      inboxName: inboxName,
      tagTotal: tagSorted.length,
      tagTop: tagSorted.slice(0, 3),
      tags: tagSorted
    };
    this.dashCache = { key: key, value: value };
    return value;
  }

});

/* -------------------------------------------------------------------------
 *  工作台视图 · 核心：render 工具条 + 排序分区 + 文件夹树 + 卡片渲染
 *  （本片段由 build.js 拼进 main.js，不要单独 require）
 * ------------------------------------------------------------------------- */
Object.assign(WorkbenchView.prototype, {
  render() {
    if (!this.areaEl) return;
    // 应用外观变量（全局或本库独立配置）
    this.applyAppearance();
    const ap = this.effectiveAppearance();

    const vault = this.selectedVaultInfo();
    if (!vault) return;

    const idx = this.plugin.indexOf(vault.path);
    let notes = idx.files || [];
    // 库里的权威目录清单（含空文件夹）：partitionNotes 靠它把空文件夹也摆出来
    this.indexFolders = idx.folders || [];

    // 搜索：#标签 / tag:标签 = 精确按标签过滤；普通词 = 文件名+标签的子串匹配
    if (this.query) {
      const raw = String(this.query).trim();
      const tagM = raw.match(/^(?:tag\s*:|#)\s*#?(.+)$/i);
      if (tagM) {
        const want = tagM[1].trim().toLowerCase();
        notes = notes.filter((n) => (n.tags || [])
          .some((t) => String(t).toLowerCase().replace(/^#+/, '') === want));
      } else {
        const q = raw.toLowerCase();
        notes = notes.filter((n) => (n.name.toLowerCase().indexOf(q) >= 0) || (n.tags || []).join(' ').toLowerCase().indexOf(q) >= 0);
      }
    }

    // 仪表盘的两个筛选条件：与搜索 / 文件夹为 AND 叠加
    if (this.weekOnly) {
      const wk = Date.now() - 7 * 86400000;
      notes = notes.filter((n) => (n.mtime || 0) > wk);
    }
    if (this.tagFilter && this.tagFilter.length) {
      notes = notes.filter((n) => {
        const ts = (n.tags || []).map((t) => String(t).toLowerCase().replace(/^#+/, ''));
        return this.tagFilter.every((f) => ts.indexOf(String(f).toLowerCase()) >= 0);
      });
    }

    // 仪表盘：四个可点击的概览卡片（只统计当前库；在库根层且没搜索时显示）
    if (ap.showStats && !this.query && !this.folderPath) {
      const s = this.computeStats(notes);
      this.statsEl.style.display = 'grid';
      this.statsEl.empty();
      const mkCard = (cls, num, label, sub, tip, onPick) => {
        const box = this.statsEl.createDiv({ cls: 'vwb-stat vwb-glass vwb-dash-card ' + cls });
        box.createDiv({ cls: 'vwb-stat-v', text: num });
        box.createDiv({ cls: 'vwb-stat-k', text: label });
        box.createDiv({ cls: 'vwb-stat-d', text: sub });
        box.setAttribute('title', tip);
        box.addEventListener('click', onPick);
        return box;
      };
      mkCard('', String(s.total), tr('dash.total'),
        tr('dash.mdLine', { md: s.md, canvas: s.canvas, excali: s.excali }),
        tr('dash.total.tip'),
        () => this.dashAll());
      mkCard('', String(s.week), tr('dash.week'), tr('dash.week.sub'),
        tr('dash.week.tip'),
        () => this.dashWeek());
      mkCard(s.inboxExists ? 'vwb-stat-warn' : 'is-unset',
        s.inboxExists ? String(s.inbox) : tr('dash.inbox.unset'), tr('dash.inbox'),
        s.inboxExists ? tr('dash.inbox.sub', { name: s.inboxName }) : tr('dash.inbox.create', { name: s.inboxName }),
        s.inboxExists ? tr('dash.inbox.tip') : tr('dash.inbox.createTip', { name: s.inboxName }),
        () => this.dashInbox());
      mkCard('', String(s.tagTotal), tr('dash.tags'),
        s.tagTop.length ? s.tagTop.map((x) => '#' + x[0] + '(' + x[1] + ')').join(' ') : tr('dash.tags.none'),
        tr('dash.tags.tip'),
        () => this.toggleTagPanel());
    } else {
      this.statsEl.style.display = 'none';
    }

    // 工具条
    this.barEl.empty();

    // 前进 / 后退：和浏览器一样在目录之间来回走（Alt+← / Alt+→）
    const mkNav = (cls, txt, on, enabled, tip) => {
      const b = this.barEl.createDiv({ cls: 'vwb-nav' + (enabled ? '' : ' is-off') });
      b.createEl('span', { cls: cls, text: txt });
      b.setAttribute('title', tip);
      if (enabled) b.addEventListener('click', on);
      return b;
    };
    mkNav('', '⇦', () => this.goBack(), this.canBack(), tr('ui.1'));
    mkNav('', '⇨', () => this.goFwd(), this.canFwd(), tr('ui.2'));
    // 「上一级」：钻取后随时可回退
    if (this.folderPath && !this.query) {
      const up = this.barEl.createDiv({ cls: 'vwb-crumb-up' });
      up.createEl('span', { text: tr('ui.3') });
      up.addEventListener('click', () => this.goUp());
    }

    const crumb = this.barEl.createDiv({ cls: 'vwb-crumb' });
    const mkCrumb = (label, level, isCur) => {
      const el = crumb.createDiv({ cls: 'vwb-crumb-p' + (isCur ? ' is-cur' : '') });
      el.createEl('span', { text: label });
      if (!isCur) {
        el.addEventListener('click', () => this.goTo(level));
      }
      return el;
    };
    if (this.query) {
      mkCrumb(vault.name, '', false);
      crumb.createEl('i', { text: '/' });
      const sc = crumb.createDiv({ cls: 'vwb-crumb-p is-cur' });
      sc.createEl('span', { text: tr('ui.4') + this.query });
      sc.addEventListener('click', () => this.clearSearch(true));
    } else {
      const segs = this.folderPath ? this.folderPath.split('/') : [];
      mkCrumb(vault.name, '', segs.length === 0);
      let acc = '';
      for (const seg of segs) {
        acc = acc ? acc + '/' + seg : seg;
        crumb.createEl('i', { text: '/' });
        mkCrumb(seg, acc, acc === this.folderPath);
      }
    }

    /* 搜索范围：当前库（文件名 / 标签） / 所有库（全文）
     * 跨库要建索引，所以两个范围分开，默认不动就只搜当前库，浏览体验不受影响。 */
    const scopeBtn = this.barEl.createDiv({
      cls: 'vwb-tab vwb-scope' + (this.searchScope === 'all' ? ' is-on' : '')
    });
    scopeBtn.createEl('span', { text: this.searchScope === 'all' ? tr('ui.6') : tr('ui.7') });
    scopeBtn.setAttribute('title', this.searchScope === 'all'
      ? tr('scope.all.tip')
      : tr('scope.current.tip'));
    scopeBtn.addEventListener('click', () => {
      this.searchScope = this.searchScope === 'all' ? 'current' : 'all';
      this.crossHits = null;
      this.syncSearchUI();
      this.render();
      new Notice(this.searchScope === 'all'
        ? tr('ui.8')
        : tr('ui.9'));
    });

    const gTab = this.barEl.createDiv({ cls: 'vwb-tab' + (this.mode === 'grid' ? ' is-on' : ''), text: tr('bar.grid') });
    gTab.addEventListener('click', () => { this.mode = 'grid'; this.plugin.settings.view.mode = 'grid'; this.plugin.saveSettings(); this.render(); });
    const lTab = this.barEl.createDiv({ cls: 'vwb-tab' + (this.mode === 'list' ? ' is-on' : ''), text: tr('bar.list') });
    lTab.addEventListener('click', () => { this.mode = 'list'; this.plugin.settings.view.mode = 'list'; this.plugin.saveSettings(); this.render(); });

    // 列表模式专用：全部展开 / 全部收缩
    if (this.mode === 'list') {
      const allOpen = this.expandedFolders && this.expandedFolders.size > 0;
      const xTab = this.barEl.createDiv({ cls: 'vwb-tab', text: allOpen ? tr('bar.collapseAll') : tr('bar.expandAll') });
      xTab.setAttribute('title', allOpen ? tr('bar.collapseAll.tip') : tr('bar.expandAll.tip'));
      xTab.addEventListener('click', () => { allOpen ? this.collapseAllFolders() : this.expandAllFolders(); });
    }

    // 智能视图：保存 / 应用筛选器入口
    const svBtn = this.barEl.createDiv({ cls: 'vwb-tab', text: tr('bar.views') });
    svBtn.setAttribute('title', tr('bar.views.tip'));
    svBtn.addEventListener('click', (e) => {
      if (e && e.stopPropagation) e.stopPropagation();
      this.showViewsMenu(e);
    });

    // 打开方式切换：下拉菜单三选一（右侧预览 / 工作面板 / 原生编辑）
    const curMode = openModeOf(this.plugin.settings.open.mode);
    const oWrap = this.barEl.createDiv({ cls: 'vwb-menu vwb-openmode' });
    const oBtn = oWrap.createDiv({ cls: 'vwb-tab is-on vwb-menu-btn' });
    oBtn.createEl('span', { cls: 'vwb-menu-btn-t', text: tr('ui.10') });
    oBtn.createEl('span', { cls: 'vwb-menu-btn-cur', text: tr(curMode.chip) });
    oBtn.createEl('span', { cls: 'vwb-menu-caret', text: '▾' });
    oBtn.setAttribute('title', tr('tip.openModeCur', { label: tr(curMode.label), tip: tr(curMode.tip) }));
    oBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.openMenuOpen = !this.openMenuOpen;
      this.render();
    });
    const oPop = oWrap.createDiv({ cls: 'vwb-menu-pop vwb-glass' + (this.openMenuOpen ? ' is-on' : '') });
    for (const m of OPEN_MODES) {
      const it = oPop.createDiv({ cls: 'vwb-menu-i' + (m.id === curMode.id ? ' is-on' : '') });
      const hd = it.createDiv({ cls: 'vwb-menu-i-hd' });
      hd.createEl('span', { cls: 'vwb-menu-i-nm', text: tr(m.label) + (m.def ? tr('ui.11') : '') });
      if (m.id === curMode.id) hd.createEl('span', { cls: 'vwb-menu-i-ck', text: '✓' });
      it.createDiv({ cls: 'vwb-menu-i-ds', text: tr(m.tip) });
      it.setAttribute('title', tr(m.tip));
      it.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openMenuOpen = false;
        if (m.id !== curMode.id) this.plugin.setOpenMode(m.id);
        else this.render();
      });
    }

    this.barEl.createDiv({ cls: 'vwb-spacer' });
    const sel = this.barEl.createEl('select');
    [
      ['mtime', tr('ui.12')],
      ['name', tr('ui.13')],
      ['size', tr('ui.14')]
    ].forEach((o) => sel.createEl('option', { value: o[0], text: o[1] }));
    sel.value = this.sort;
    sel.addEventListener('change', () => { this.sort = sel.value; this.plugin.settings.view.sort = this.sort; this.plugin.saveSettings(); this.render(); });

    // 列表内容
    this.areaEl.empty();
    this.flatOrder = []; // 本屏的渲染顺序：Shift 连选要按它取区间
    this.itemEls = [];   // 本屏的条目元素：鼠标框选要按它们的实际位置算命中
    const cmp = this.noteCmp();
    // 多选状态下，操作条永远钉在文件区最上面
    if (this.multiSel && this.multiSel.size) this.renderBatchBar();
    // 已选标签提示条（标签筛选开启时）
    if (this.tagFilter && this.tagFilter.length) this.renderTagBar();
    // 标签列表面板：点「标签库」卡片后，文件区换成标签列表
    if (this.tagPanelOpen) {
      this.renderTagPanel(notes);
      this.bindAreaGestures();
      this.hintEl.setText('');
      this.hintEl.style.display = 'none';
      return;
    }

    // 跨库全文搜索：结果就是一张跨库的命中清单，不是文件树
    if (this.query && this.searchScope === 'all') {
      this.renderCrossHits();
      this.bindAreaGestures();
      this.hintEl.setText('');
      this.hintEl.style.display = 'none';
      return;
    }

    // 搜索 / 仪表盘筛选命中：**平铺**，不按文件夹分组 ——
    // 否则匹配到的笔记会藏在子文件夹卡片里，用户点了筛选却看不见结果
    const flatView = !!this.query || !!this.weekOnly ||
      !!(this.tagFilter && this.tagFilter.length);
    if (flatView) {
      const hits = notes.slice().sort(cmp);
      if (!hits.length) {
        this.areaEl.createDiv({
          cls: 'vwb-empty',
          text: this.weekOnly ? tr('empty.weekNone') : tr('empty.noMatch')
        });
      }
      if (this.mode === 'grid') {
        const grid = this.areaEl.createDiv({ cls: 'vwb-grid ' + ap.density });
        for (const n of hits) this.renderCard(grid, n);
      } else {
        for (const n of hits) this.renderFileRow(this.areaEl, n, 0);
      }
      this.bindAreaGestures();
      this.hintEl.setText('');
      this.hintEl.style.display = 'none';
      return;
    }

    if (this.mode === 'grid') {
      const { folders, files } = this.partitionNotes(notes, this.folderPath);
      folders.sort((a, b) => a.name.localeCompare(b.name, 'zh'));
      files.sort(cmp);
      if (!folders.length && !files.length) {
        this.areaEl.createDiv({ cls: 'vwb-empty', text: tr('empty.folderEmpty') });
      }
      if (folders.length) {
        const grid = this.areaEl.createDiv({ cls: 'vwb-grid ' + ap.density });
        for (const f of folders) this.renderFolderCard(grid, f);
      }
      if (files.length) {
        const grid = this.areaEl.createDiv({ cls: 'vwb-grid ' + ap.density + (folders.length ? ' vwb-mt' : '') });
        grid.style.marginTop = folders.length ? '12px' : '0';
        for (const n of files) this.renderCard(grid, n);
      }
    } else {
      // 列表模式：文件夹前面的 ▸ 点一下就地展开，直接看里面有什么；点名字才进下一级
      const any = this.renderTreeRows(this.areaEl, notes, this.folderPath, 0);
      if (!any) this.areaEl.createDiv({ cls: 'vwb-empty', text: tr('empty.folderEmpty') });
    }

    this.bindAreaGestures();
    // 操作说明统一收进「设置 → 使用说明」，文件区底部不再堆一长串文案
    this.hintEl.setText('');
    this.hintEl.style.display = 'none';
  },

  /* -------------------------------------------- 文件区手势：框选 + 空白右键
   * 绑在 areaEl 上（每次 render 都会重建，所以标记 _vwbGesture 只绑一次）。
   * 左键在空白处拖一下 = 框选；右键在空白处 = 弹出这一屏能做的事。 */
  bindAreaGestures() {
    const area = this.areaEl;
    if (!area || area._vwbGesture) return;
    area._vwbGesture = true;
    area.addEventListener('mousedown', (e) => this.onAreaMouseDown(e));
    area.addEventListener('contextmenu', (e) => {
      if (this.itemElOf(e && e.target)) return;   // 点在条目上 → 交给条目自己的菜单
      if (e && e.preventDefault) e.preventDefault();
      if (e && e.stopPropagation) e.stopPropagation();
      this.showBlankMenu(e);
    });
  },

  /* 框选：拖出一个框，松手时把框里的项选上。
   * 移动不到 6px 就当成「点了一下空白」= 清空选择，避免手抖误选。
   * 选框挂在视图根上用**相对坐标**：挂 mainEl 用 fixed 的话，
   * 祖先的 backdrop-filter 会让 fixed 变成相对定位，框就画歪了（v0.9.1 踩过同类坑）。 */
  onAreaMouseDown(e) {
    if (!e || e.button !== 0) return;                     // 只管左键
    if (e.ctrlKey || e.metaKey || e.shiftKey) return;     // 这两个是 Ctrl / Shift 多选，不抢
    // 点在批量操作条 / 弹层内部 → 不要启动框选，也不要清空选择
    let node = e && e.target;
    while (node && node !== this.areaEl) {
      try {
        if (node.classList && node.classList.contains('vwb-batch')) return;
      } catch (e2) { /* 忽略 */ }
      node = node.parentElement;
    }
    if (this.itemElOf(e.target)) return;                  // 点在条目上 → 交给条目
    const doc = (typeof document !== 'undefined') ? document : null;
    if (!doc || typeof doc.addEventListener !== 'function') return;
    const root = this.contentEl;
    let rootLeft = 0;
    let rootTop = 0;
    try {
      const rr = root.getBoundingClientRect();
      if (rr) { rootLeft = rr.left || 0; rootTop = rr.top || 0; }
    } catch (e0) { /* 忽略 */ }
    const sxC = Number(e.clientX) || 0;   // 视口坐标（给命中判定用，元素 rect 也是视口系）
    const syC = Number(e.clientY) || 0;
    const sx = sxC - rootLeft;            // 相对坐标（给选框定位用）
    const sy = syC - rootTop;
    let box = null;
    let moved = false;
    const onMove = (ev) => {
      const xC = Number(ev.clientX) || 0;
      const yC = Number(ev.clientY) || 0;
      const x = xC - rootLeft;
      const y = yC - rootTop;
      if (!moved && Math.abs(x - sx) < 6 && Math.abs(y - sy) < 6) return;
      if (!moved) { moved = true; box = root.createDiv({ cls: 'vwb-marquee' }); }
      const r = this.rectOf(sx, sy, x, y);
      try {
        box.style.left = r.left + 'px';
        box.style.top = r.top + 'px';
        box.style.width = (r.right - r.left) + 'px';
        box.style.height = (r.bottom - r.top) + 'px';
      } catch (e2) { /* 忽略 */ }
      // 拖的过程中就实时高亮框里的项 —— 不用等松手才知道选了谁
      const hits = this.hitsInRect(this.rectOf(sxC, syC, xC, yC));
      for (const el of this.itemEls || []) {
        if (!el || !el._vwbItem) continue;
        const on = hits.some((h) => h.key === el._vwbItem.key);
        try { el.classList.toggle('is-multi', on); } catch (e3) { /* 忽略 */ }
      }
    };
    const onUp = (ev) => {
      try { doc.removeEventListener('mousemove', onMove); } catch (e2) { /* 忽略 */ }
      try { doc.removeEventListener('mouseup', onUp); } catch (e2) { /* 忽略 */ }
      if (box) this.closeDialog(box);
      if (!moved) {
        // 只是点了一下空白 → 清空选择（和点文件一样的手感）
        if (this.multiSel && this.multiSel.size) { this.clearMulti(); this.render(); }
        return;
      }
      this.selectByRect(this.rectOf(sxC, syC, Number(ev.clientX) || 0, Number(ev.clientY) || 0),
        !!(ev && (ev.ctrlKey || ev.metaKey)));
    };
    doc.addEventListener('mousemove', onMove);
    doc.addEventListener('mouseup', onUp);
  },

  rectOf(x1, y1, x2, y2) {
    return {
      left: Math.min(x1, x2), top: Math.min(y1, y2),
      right: Math.max(x1, x2), bottom: Math.max(y1, y2)
    };
  },

  /* 哪些条目落在框里（按元素的实际位置算，网格和列表都适用） */
  hitsInRect(rect) {
    const out = [];
    for (const el of this.itemEls || []) {
      if (!el || !el._vwbItem) continue;
      let r = null;
      try { r = el.getBoundingClientRect(); } catch (e) { continue; }
      if (!r) continue;
      const miss = r.right < rect.left || r.left > rect.right ||
        r.bottom < rect.top || r.top > rect.bottom;
      if (!miss) out.push(el._vwbItem);
    }
    return out;
  },

  selectByRect(rect, additive) {
    const hits = this.hitsInRect(rect);
    if (!this.multiSel) this.multiSel = new Map();
    if (!additive) { this.multiSel.clear(); this.selAnchor = -1; }
    for (const h of hits) this.multiSel.set(h.key, { kind: h.kind, item: h.item });
    if (hits.length) {
      this.selAnchor = (this.flatOrder || [])
        .findIndex((x) => this.selKey(x.kind, x.item) === hits[0].key);
    }
    this.afterMultiChange();
  },

  /* ---------------------------------------------------- 空白处右键菜单 */
  blankMenuGroups() {
    const vault = this.selectedVaultInfo();
    const external = !!(vault && this.plugin.indexOf(vault.path).external);
    const writable = !(external && !(vault && this.plugin.vaultWritable(vault.path)));
    const noWrite = external && !writable ? tr('menu.why.noWrite') : '';
    const hasSel = !!(this.multiSel && this.multiSel.size);
    return [
      { items: [
        { id: 'new-note', label: tr('blank.newNote') + '…', ico: '＋', disabled: !writable, why: noWrite },
        { id: 'new-folder', label: tr('blank.newFolder') + '…', ico: '📁', disabled: !writable, why: noWrite }
      ] },
      { items: [
        { id: 'select-all', label: tr('blank.selectAll'), ico: '☑' },
        { id: 'clear-sel', label: tr('batch.clear'), ico: '✕', disabled: !hasSel, why: tr('blank.why.noSel') }
      ] },
      { items: [
        { id: 'switch-view', label: this.mode === 'grid' ? tr('blank.toListView') : tr('blank.toGridView'),
          ico: this.mode === 'grid' ? '☰' : '▦' },
        { id: 'refresh', label: tr('blank.rescanVault'), ico: '↻' }
      ] },
      { items: [
        { id: 'appearance', label: tr('blank.appearance') + '…', ico: '🎨' }
      ] }
    ];
  },

  showBlankMenu(ev) {
    const host = this.openCtxMenu(this.contentEl);
    if (!host) return;
    const x = Number(ev && ev.clientX) || 0;
    const y = Number(ev && ev.clientY) || 0;
    this.renderCtxGroups(host, this.blankMenuGroups(), {
      onPick: (id) => { this.closeEditorMenu(); this.runBlankCmd(id); }
    });
    this.placeMenu(host, x, y, this.contentEl);
    try { host.style.visibility = ''; } catch (e) { /* 忽略 */ }
  },

  runBlankCmd(id) {
    const vault = this.selectedVaultInfo();
    switch (id) {
      case 'new-note': this.createNote(this.folderPath); return;
      case 'new-folder': this.createFolder(this.folderPath); return;
      case 'select-all': {
        if (!this.multiSel) this.multiSel = new Map();
        for (const x of this.flatOrder || []) {
          this.multiSel.set(this.selKey(x.kind, x.item), { kind: x.kind, item: x.item });
        }
        this.afterMultiChange();
        return;
      }
      case 'clear-sel': this.clearMulti(); this.render(); return;
      case 'switch-view': {
        this.mode = this.mode === 'grid' ? 'list' : 'grid';
        this.plugin.settings.view.mode = this.mode;
        this.plugin.saveSettings();
        this.render();
        return;
      }
      case 'refresh': {
        if (vault) delete this.plugin.externalCache[vault.path];
        this.render();
        new Notice(tr('notice.rescannedVault', { name: (vault ? vault.name : '') }));
        return;
      }
      case 'appearance': this.drawerPage = 'appearance'; this.toggleDrawer(true); return;
      default: return;
    }
  },

  /* 排序比较器（文件夹 / 文件共用，跟着工具条上的「排序:」走） */
  noteCmp() {
    return (a, b) => {
      if (this.sort === 'name') return a.name.localeCompare(b.name, 'zh');
      if (this.sort === 'size') return (b.size || 0) - (a.size || 0);
      return (b.mtime || 0) - (a.mtime || 0);
    };
  },

  /* 把一个目录下的笔记拆成「直属子文件夹」和「本层文件」。
   * folders 是库里的权威目录清单（含**空文件夹**）—— 光从笔记反推的话，空文件夹永远不出现。
   * 文件夹的 count = 它整棵子树里的笔记数（和以前一致），一条都没有就是空文件夹。 */
  partitionNotes(notes, prefix, folders) {
    const p = normFolder(prefix);
    const all = folders || this.indexFolders || [];
    const map = new Map();
    const files = [];
    const weekAgo = Date.now() - 7 * 86400000;
    const ensure = (path) => {
      let it = map.get(path);
      if (!it) {
        it = { name: path.split('/').pop(), path: path, count: 0, latest: null, week: 0 };
        map.set(path, it);
      }
      return it;
    };

    for (const n of notes) {
      const f = normFolder(n.folder);
      if (f === p) { files.push(n); continue; }
      if (p && f.indexOf(p + '/') !== 0) continue;    // 不在当前目录底下
      const rel = p ? f.slice(p.length + 1) : f;
      if (!rel) { files.push(n); continue; }
      const it = ensure(p ? p + '/' + rel.split('/')[0] : rel.split('/')[0]);
      it.count++;
      if (!it.latest || (n.mtime || 0) > (it.latest.mtime || 0)) it.latest = n;
      if ((n.mtime || 0) > weekAgo) it.week++;
    }

    // 权威清单里的「本层直属子文件夹」：有笔记的上面已经数过了，这里补的是空文件夹
    for (let i = 0; i < all.length; i++) {
      const raw = all[i];
      const fp = normFolder(raw && raw.path != null ? raw.path : raw);
      if (!fp) continue;
      if (p && fp.indexOf(p + '/') !== 0) continue;
      const rel = p ? fp.slice(p.length + 1) : fp;
      if (!rel || rel.indexOf('/') >= 0) continue;    // 只算本层，深层等钻进去再说
      ensure(fp);
    }

    return { folders: Array.from(map.values()), files: files };
  },

  /* 列表模式：全部展开当前目录下（含子层）的所有文件夹 */
  expandAllFolders() {
    if (!this.expandedFolders) this.expandedFolders = new Set();
    const prefix = normFolder(this.folderPath);
    for (const f of (this.indexFolders || [])) {
      const fp = normFolder(f && f.path != null ? f.path : f);
      if (!fp) continue;
      if (prefix && fp !== prefix && fp.indexOf(prefix + '/') !== 0) continue;
      if (fp !== prefix) this.expandedFolders.add(fp);
    }
    this.render();
  },

  /* 列表模式：全部收缩 */
  collapseAllFolders() {
    const prefix = normFolder(this.folderPath);
    if (!this.expandedFolders) { this.render(); return; }
    if (!prefix) {
      this.expandedFolders.clear();
    } else {
      for (const fp of Array.from(this.expandedFolders)) {
        if (fp === prefix || fp.indexOf(prefix + '/') === 0) this.expandedFolders.delete(fp);
      }
    }
    this.render();
  },

  /* 文件夹就地展开 / 收起（列表模式下点 ▸ / ▾） */
  toggleFolderExpand(path) {
    if (!this.expandedFolders) this.expandedFolders = new Set();
    if (this.expandedFolders.has(path)) this.expandedFolders.delete(path);
    else this.expandedFolders.add(path);
    // 展开只是「看一眼」，别把用户滚到一半的列表位置弄没了
    const top = this.bodyEl ? this.bodyEl.scrollTop : 0;
    this.render();
    if (this.bodyEl) { try { this.bodyEl.scrollTop = top; } catch (e) { /* 忽略 */ } }
  },

  /* 列表模式的递归渲染：先文件夹（展开的紧跟着渲染它的子层），再本层文件 */
  renderTreeRows(container, notes, prefix, depth) {
    const { folders, files } = this.partitionNotes(notes, prefix);
    folders.sort((a, b) => a.name.localeCompare(b.name, 'zh'));
    let any = false;

    for (const f of folders) {
      any = true;
      const open = this.expandedFolders && this.expandedFolders.has(f.path);
      const sel = this.isMulti('folder', f);
      const row = container.createDiv({ cls: 'vwb-row vwb-glass' + (depth ? ' is-child' : '') + (sel ? ' is-multi' : '') });
      if (depth) row.style.paddingLeft = (13 + depth * 20) + 'px';
      row.setAttribute('data-path', f.path);
      row.setAttribute('title', f.path);

      const caret = row.createEl('span', { cls: 'vwb-caret' + (open ? ' is-open' : ''), text: open ? '▾' : '▸' });
      caret.setAttribute('title', open ? tr('ui.15') : tr('ui.16'));
      caret.addEventListener('click', (e) => {
        if (e && e.stopPropagation) e.stopPropagation();
        this.toggleFolderExpand(f.path);
      });

      const nm = row.createDiv({ cls: 'vwb-row-nm' });
      nm.createEl('span', { cls: 'vwb-folder', text: f.name });
      row.createDiv({ cls: 'vwb-row-mt', text: folderMeta(f, sel) });
      if (!f.count) row.addClass('is-empty');
      this.pushOrder('folder', f);
      this.bindDrag(row, f, 'folder');
      this.bindDropTarget(row, f, 'folder');
      row.addEventListener('click', (e) => this.onItemClick(e, f, 'folder'));
      row.addEventListener('contextmenu', (e) => {
        if (e && e.preventDefault) e.preventDefault();
        this.showItemMenu(e, f, 'folder');
      });

      if (open) {
        // 空文件夹展开后啥也没有，给一句说明，别让人以为点了没反应
        if (!f.count) {
          const tip = container.createDiv({ cls: 'vwb-row-tip' + (depth ? ' is-child' : '') });
          if (depth) tip.style.paddingLeft = (13 + (depth + 1) * 20) + 'px';
          tip.setText(tr('empty.folderEmptySub'));
        } else {
          this.renderTreeRows(container, notes, f.path, depth + 1);
        }
      }
    }

    const list = files.slice().sort(this.noteCmp());
    for (const n of list) {
      any = true;
      this.renderFileRow(container, n, depth);
    }
    return any;
  },

  /* 列表模式的一行文件 */
  renderFileRow(container, n, depth) {
    const ap = this.effectiveAppearance();
    const kind = fileKind(n.ext);
    const sel = this.isMulti('file', n);
    const row = container.createDiv({
      cls: 'vwb-row vwb-glass' + ((this.isSelected(n) || sel) ? ' is-sel' : '') +
        (sel ? ' is-multi' : '') + (depth ? ' is-child' : '')
    });
    if (depth) row.style.paddingLeft = (13 + depth * 20) + 'px';
    row.setAttribute('data-path', n.relPath);
    this.pushOrder('file', n);
    row.createEl('span', { cls: 'vwb-ico', text: iconFor(n.ext, kind) });
    row.createDiv({ cls: 'vwb-row-nm', text: dispName(n) });
    if (ap.showMeta) row.createDiv({ cls: 'vwb-row-mt', text: (kind === 'markdown' ? '' : kindLabel(kind) + ' · ') + fmtDate(n.mtime) + ' · ' + fmtSize(n.size || 0) });
    const eye = row.createDiv({ cls: 'vwb-card-eye', text: '👁' });
    eye.setAttribute('aria-label', tr('ui.17'));
    eye.addEventListener('click', (e) => {
      if (e && e.stopPropagation) e.stopPropagation();
      this.openFile(n, { forcePanel: true });
    });
    this.bindDrag(row, n, 'file');
    row.addEventListener('click', (e) => this.onItemClick(e, n, 'file'));
    row.addEventListener('contextmenu', (e) => {
      if (e && e.preventDefault) e.preventDefault();
      if (e && e.stopPropagation) e.stopPropagation();
      this.showItemMenu(e, n, 'file');
    });
    return this.markItem(row, 'file', n);
  },

  isSelected(n) {
    return !!(this.selectedNote && this.selectedNote.id === n.id);
  },

  /* 网格模式的文件夹卡片（右键 = 文件夹菜单） */
  renderFolderCard(grid, f) {
    const sel = this.isMulti('folder', f);
    const card = grid.createDiv({ cls: 'vwb-card vwb-glass' + (sel ? ' is-multi' : '') + (f.count ? '' : ' is-empty') });
    card.setAttribute('data-path', f.path);
    const fnm = card.createDiv({ cls: 'vwb-card-nm' });
    fnm.createEl('span', { cls: 'vwb-ico', text: '📁' });
    fnm.createEl('span', { cls: 'vwb-folder', text: f.name });
    // 笔记数挪到右上角小字；「最近一篇」替掉原来的静态 meta —— 文件夹变成有脉搏的入口
    fnm.createEl('span', { cls: 'vwb-card-cnt', text: (f.count ? f.count + tr('ui.133') : tr('ui.132')) + (sel ? tr('ui.134') : '') });
    if (f.latest) card.createDiv({ cls: 'vwb-card-mt vwb-card-latest', text: tr('common.recentNote', { name: dispName(f.latest) }) });
    if (f.count && f.week > 0) {
      // 活跃度条：本周修改数 / 总数
      const act = card.createDiv({ cls: 'vwb-folder-act' });
      act.setAttribute('title', tr('ui.18') + f.week + tr('ui.133'));
      const bar = act.createEl('i');
      bar.style.width = Math.max(6, Math.min(100, Math.round(f.week / f.count * 100))) + '%';
    }
    this.pushOrder('folder', f);
    this.bindDrag(card, f, 'folder');
    this.bindDropTarget(card, f, 'folder');
    card.addEventListener('click', (e) => this.onItemClick(e, f, 'folder'));
    card.addEventListener('contextmenu', (e) => {
      if (e && e.preventDefault) e.preventDefault();
      if (e && e.stopPropagation) e.stopPropagation();
      this.showItemMenu(e, f, 'folder');
    });
    return this.markItem(card, 'folder', f);
  },

  renderCard(grid, n) {
    const ap = this.effectiveAppearance();
    const kind = fileKind(n.ext);
    const sel = this.isMulti('file', n);
    const card = grid.createDiv({ cls: 'vwb-card vwb-glass' + ((this.isSelected(n) || sel) ? ' is-sel' : '') + (sel ? ' is-multi' : '') });
    this.pushOrder('file', n);

    // 图片：卡片顶部给缩略图（外部库大图不读盘，避免内存炸）
    if (kind === 'image') {
      const thumb = card.createDiv({ cls: 'vwb-card-thumb' });
      const url = n.external
        ? this.plugin.dataUrlOf(n.absPath, n.ext, MAX_THUMB)
        : this.resourceUrl(n);
      if (url) {
        const im = thumb.createEl('img');
        im.setAttribute('loading', 'lazy');
        im.setAttribute('alt', n.name);
        im.src = url;
      } else {
        thumb.createEl('span', { text: '🖼' });
      }
    }

    const nm = card.createDiv({ cls: 'vwb-card-nm' });
    nm.createEl('span', { cls: 'vwb-ico', text: iconFor(n.ext, kind) });
    // 名称拆成「基础名 + 浅色后缀」：一眼看出类型，又不抢名字的注意力
    const full = n.name || baseNameOf(n.relPath);
    const dot = String(full).lastIndexOf('.');
    const stem = dot > 0 ? full.slice(0, dot) : full;
    const suffix = dot > 0 ? full.slice(dot) : '';
    nm.createEl('span', { cls: 'vwb-nm-t', text: stem });
    if (suffix) nm.createEl('span', { cls: 'vwb-nm-ext', text: suffix });

    // 内容摘要：异步填充（卡片先出来，摘要随后到）
    if (ap.showSummary && kind === 'markdown') this.fillCardSummary(card, n);

    if (ap.showMeta) {
      const mt = card.createDiv({ cls: 'vwb-card-mt' });
      if (n.tags && n.tags.length) {
        for (const t of n.tags.slice(0, 2)) {
          const chip = mt.createEl('span', { cls: 'vwb-card-tag', text: t });
          chip.setAttribute('title', tr('ui.19'));
          chip.addEventListener('click', (e) => {
            if (e && e.stopPropagation) e.stopPropagation();
            this.searchByTag(t);
          });
        }
      } else {
        mt.createEl('span', { text: kind === 'markdown' ? tr('common.noTags') : kindLabel(kind) });
      }
      mt.createEl('span', { text: fmtDate(n.mtime) });
    }
    // 右上角「只看一眼」：强制走面板预览，不影响默认打开方式
    const eye = card.createDiv({ cls: 'vwb-card-eye', text: '👁' });
    eye.setAttribute('aria-label', tr('ui.17'));
    eye.addEventListener('click', (e) => {
      if (e && e.stopPropagation) e.stopPropagation();
      this.openFile(n, { forcePanel: true });
    });
    this.bindDrag(card, n, 'file');
    card.addEventListener('click', (e) => this.onItemClick(e, n, 'file'));
    card.addEventListener('contextmenu', (e) => {
      if (e && e.preventDefault) e.preventDefault();
      if (e && e.stopPropagation) e.stopPropagation();
      this.showItemMenu(e, n, 'file');
    });
    return this.markItem(card, 'file', n);
  },

  /* 卡片摘要：异步读文件头 → 纯文本截断 → 填进卡片。
   * 按 (relPath, mtime) 缓存，同一次滚动不会重复读盘。 */
  fillCardSummary(card, n) {
    if (!card || !n) return;
    const key = (n.external ? 'x:' : 'c:') + n.relPath + ':' + (n.mtime || 0);
    if (!this.summaryCache) this.summaryCache = new Map();
    const hit = this.summaryCache.get(key);
    if (hit) { this.applyCardSummary(card, hit); return; }
    (async () => {
      try {
        let text = '';
        if (n.external) {
          text = readHeadAbs(n.absPath || '', 4096);
        } else {
          const f = this.plugin.app.vault.getAbstractFileByPath(n.relPath);
          if (!f) return;
          text = await this.plugin.app.vault.read(f);
        }
        const ex = excerptOf(text, 120);
        this.summaryCache.set(key, ex);
        this.applyCardSummary(card, ex);
      } catch (e) { /* 读不到就算了，卡片照样能用 */ }
    })();
  },

  applyCardSummary(card, text) {
    if (!card || !text) return;
    try {
      if (!card.parentElement) return;   // 卡片已经被重绘掉了
      let el = null;
      if (typeof card.querySelector === 'function') el = card.querySelector('.vwb-card-sum');
      if (!el) el = card.createDiv({ cls: 'vwb-card-sum' });
      el.setText(text);
    } catch (e) { /* 忽略 */ }
  },

  /* 给条目元素留个标记：框选要按它算命中，空白右键要靠它判断「点的是不是条目」 */
  markItem(el, kind, item) {    if (!el) return el;
    el._vwbItem = { kind: kind, item: item, key: this.selKey(kind, item) };
    if (!this.itemEls) this.itemEls = [];
    this.itemEls.push(el);
    return el;
  },
  /* 顺着 DOM 往上找：这个节点是不是在某个条目里面 */
  itemElOf(node) {
    let n = node;
    while (n) {
      if (n._vwbItem) return n;
      n = n.parentElement;
    }
    return null;
  },
});

/* -------------------------------------------------------------------------
 *  工作台视图 · 文件 / 文件夹右键菜单 + 跨库搜索 + 链接双链
 *  （本片段由 build.js 拼进 main.js，不要单独 require）
 * ------------------------------------------------------------------------- */
Object.assign(WorkbenchView.prototype, {
  /* ------------------------------------------------- 文件 / 文件夹 右键菜单
   * 列表和网格共用一套：点哪一项就在哪一项上弹，命令作用在那一项上。
   * 菜单项由 itemMenuGroups() 按当前项类型 + 是否外部库动态生成；
   * 画菜单的活儿和编辑器菜单共用 renderCtxGroups（子菜单、置灰、分隔线都一致）。 */
  showItemMenu(ev, item, kind) {
    if (!item) return;
    // ⚠ 挂在 contentEl（视图根）而不是 mainEl：mainEl 是 .vwb-layer（z-index:1，
    // 自成层叠上下文），里面的弹层 z-index 再大也会被设置抽屉（z-index:40）整层压住
    const host = this.openCtxMenu(this.contentEl);
    if (!host) return;
    const x = Number(ev && ev.clientX) || 0;
    const y = Number(ev && ev.clientY) || 0;

    this.renderCtxGroups(host, this.itemMenuGroups(item, kind), {
      onPick: (id) => this.runItemCmd(id, item, kind)
    });

    this.placeMenu(host, x, y, this.contentEl);
    try { host.style.visibility = ''; } catch (e) { /* 忽略 */ }
  },

  /* 菜单项：文件夹和文件各一套，最后一组是删除（外部库只让编辑正文，这些都置灰） */
  itemMenuGroups(item, kind) {
    const vault = this.selectedVaultInfo();
    const external = !!(vault && this.plugin.indexOf(vault.path).external);
    // 外部库现在能改结构了（重命名的双链由工作台自己改），只有「复制链接」仍然不行：
    // 跨库的 obsidian:// 链接指向的是当前库的路径，粘到别处跳不到别的库的那篇
    const noLink = tr('menu.why.noLink');
    const noWrite = external && vault ? tr('menu.why.noWrite') : '';
    const blockNew = external && !(vault && this.plugin.vaultWritable(vault.path));
    const isFolder = kind === 'folder';
    // 右键时被点的这一项，是否在已有框选/多选集合里？在 → 菜单命令作用于全部已选项（Windows 习惯）
    const inSelection = this.isMulti(kind, item);
    const bulk = inSelection && this.multiSel && this.multiSel.size > 1;
    const bulkN = bulk ? this.multiSel.size : 0;
    const groups = [];

    // 在外部库里直接给一条「切过去」的快捷通道，不用再去找导航里是哪个库
    if (external && vault) {
      groups.push({ items: [
        { id: 'switch-vault', label: tr('menu.switchVault', { name: vault.name }), ico: '⇄' }
      ] });
    }

    if (isFolder) {
      groups.push({ items: [
        { id: 'enter', label: tr('menu.enter'), ico: '↳' },
        { id: 'new-note', label: tr('menu.newHere'), ico: '＋', disabled: blockNew, why: noWrite, sub: [
          { id: 'new-note-wb', label: tr('menu.newHere.wb') },
          { id: 'new-note-native', label: tr('menu.newHere.native') }
        ] }
      ] });
    } else {
      groups.push({ items: [
        { id: 'open', label: tr('menu.open'), ico: '↗' },
        { id: 'open-panel', label: tr('menu.openPanel'), ico: '👁' },
        { id: 'open-native', label: tr('menu.openNative'), ico: '🗂', disabled: !canOpenNative(item), why: tr('menu.why.noNative') }
      ] });
    }

    groups.push({ items: [
      { id: 'copy-uri', label: isFolder ? tr('menu.copyUri.folder') : tr('menu.copyUri.file'), ico: '🔗', disabled: external, why: noLink },
      { id: 'copy-wikilink', label: bulk
        ? tr('menu.copyWikilink.multi', { n: bulkN })
        : (isFolder ? tr('menu.copyWikilink.folder') : tr('menu.copyWikilink')), ico: '⛓', disabled: external, why: noLink },
      { id: 'copy-path', label: tr('menu.copyPath'), ico: '⧉', sub: [
        { id: 'copy-path-uri', label: tr('menu.copyPath.uri') },
        { id: 'copy-path-rel', label: tr('menu.copyPath.rel') },
        { id: 'copy-path-abs', label: tr('menu.copyPath.abs') }
      ] }
    ] });

    groups.push({ items: [
      { id: 'move-to', label: isFolder ? tr('menu.moveTo.folder') : tr('menu.moveTo.file'), ico: '⇥', disabled: blockNew, why: noWrite },
      { id: 'duplicate', label: tr('menu.duplicate'), ico: '⧉', disabled: blockNew, why: noWrite },
      { id: 'rename', label: isFolder ? tr('menu.renameFolder') : tr('menu.rename'), ico: '✎', disabled: blockNew, why: noWrite },
      { id: 'reveal', label: tr('menu.reveal'), ico: '🗂' }
    ] });

    groups.push({ items: [
      { id: 'delete', label: bulk ? tr('menu.delete.multi', { n: bulkN }) : (isFolder ? tr('menu.delete.folder') : tr('menu.delete.file')), ico: '🗑', danger: true, disabled: blockNew, why: noWrite }
    ] });
    return groups;
  },

  /* ------------------------------------------------- 跨库全文搜索的结果 */
  /* 结果按 query 缓存：边打字边搜时不会每次都重建索引 */
  crossSearchHits() {
    const q = String(this.query || '').trim();
    if (!q) return [];
    if (this.crossHits && this.crossHitsQ === q) return this.crossHits;
    const hits = this.plugin.searchAllVaults(q, { limit: 200 });
    this.crossHitsQ = q;
    this.crossHits = hits;
    return hits;
  },

  renderCrossHits() {
    const q = String(this.query || '').trim();
    const hits = this.crossSearchHits();
    if (!hits.length) {
      this.areaEl.createDiv({ cls: 'vwb-empty', text: tr('empty.crossNone', { q: q }) });
      return;
    }
    const head = this.areaEl.createDiv({ cls: 'vwb-xhit-head' });
    head.createEl('span', { text: tr('cross.hits', { n: hits.length }) });
    head.createEl('span', { cls: 'vwb-xhit-q', text: '「' + q + '」' });
    for (const h of hits) this.renderCrossHitRow(this.areaEl, h);
  },

  renderCrossHitRow(box, h) {
    const row = box.createDiv({ cls: 'vwb-xhit' });
    const v = row.createDiv({ cls: 'vwb-xhit-v' + (h.current ? ' is-cur' : '') });
    v.createEl('span', { text: h.current ? tr('ui.21') : h.vaultName });
    const main = row.createDiv({ cls: 'vwb-xhit-m' });
    main.createDiv({ cls: 'vwb-xhit-nm', text: h.name });
    main.createDiv({ cls: 'vwb-xhit-pt', text: h.relPath });
    // 片段里的关键词高亮：逐段拼元素，不用 innerHTML（笔记内容不能当 HTML 解析）
    const sn = main.createDiv({ cls: 'vwb-xhit-sn' });
    if (h.byName) sn.createEl('span', { cls: 'vwb-xhit-byname', text: tr('ui.20') });
    else this.appendHighlight(sn, h.snippet, this.query);
    row.setAttribute('title',
      (h.current ? tr('cross.curVaultCell') : h.vaultName) + ' · ' + h.relPath +
      (h.current ? '' : tr('cross.curVaultTip')));
    row.addEventListener('click', () => this.openCrossHit(h));
    row.addEventListener('contextmenu', (e) => {
      if (e && e.preventDefault) e.preventDefault();
      if (e && e.stopPropagation) e.stopPropagation();
      this.showCrossHitMenu(e, h);
    });
  },

  /* 把命中的词包一层 <mark>：按出现位置切片，重叠的跳过 */
  appendHighlight(el, text, query) {
    const t = String(text || '');
    const terms = searchTermsOf(query);
    if (!terms.length || !t) { el.setText(t); return; }
    const low = t.toLowerCase();
    const marks = [];
    for (const term of terms) {
      let from = 0;
      for (;;) {
        const p = low.indexOf(term, from);
        if (p < 0) break;
        marks.push([p, p + term.length]);
        from = p + term.length;
      }
    }
    if (!marks.length) { el.setText(t); return; }
    marks.sort((a, b) => a[0] - b[0]);
    let cur = 0;
    for (const m of marks) {
      if (m[0] < cur) continue;
      if (m[0] > cur) el.createEl('span', { text: t.slice(cur, m[0]) });
      el.createEl('mark', { text: t.slice(m[0], m[1]) });
      cur = m[1];
    }
    if (cur < t.length) el.createEl('span', { text: t.slice(cur) });
  },

  async openCrossHit(h) {
    const idx = this.plugin.indexOf(h.vault);
    const note = (idx.files || []).filter((f) => f.relPath === h.relPath)[0];
    if (!note) { new Notice(tr('ui.23')); return; }
    await this.openPreview(note, { expand: true });
  },

  showCrossHitMenu(ev, h) {
    const host = this.openCtxMenu(this.contentEl);
    if (!host) return;
    const x = Number(ev && ev.clientX) || 0;
    const y = Number(ev && ev.clientY) || 0;
    this.renderCtxGroups(host, [{ items: [
      { id: 'open', label: tr('ui.24'), ico: '↗' },
      { id: 'switch', label: tr('menu.switchVaultCell', { name: h.vaultName }), ico: '⇄',
        disabled: !!h.current, why: tr('ui.25') },
      { id: 'copy-path', label: tr('ui.26'), ico: '⧉' }
    ] }], {
      onPick: (id) => {
        this.closeEditorMenu();
        if (id === 'open') this.openCrossHit(h);
        else if (id === 'switch') this.plugin.switchToVault(h.vault);
        else if (id === 'copy-path') {
          this.copyText(pathMod.join(h.vault, h.relPath), tr('ui.27'));
        }
      }
    });
    this.placeMenu(host, x, y, this.contentEl);
    try { host.style.visibility = ''; } catch (e) { /* 忽略 */ }
  },

  /* ----------------------------------------------------------- 链接 / 双链
   * Obsidian 协议链接（obsidian://open?vault=…&file=…）：文件和文件夹都能用，
   * 粘到微信 / 邮件里，在装了 Obsidian 的机器上点一下就能跳过去。 */
  obsidianUri(rel) {
    const vault = this.selectedVaultInfo();
    const vname = vault ? baseNameOf(vault.path) : '';
    const file = String(rel || '').replace(/\\/g, '/').replace(/\.md$/i, '');
    return 'obsidian://open?vault=' + encodeURIComponent(vname) + '&file=' + encodeURIComponent(file);
  },

  /* 内部双链 [[路径]]（md 去掉后缀，Obsidian 的链接就是这么写的） */
  wikiLinkOf(rel) {
    return '[[' + String(rel || '').replace(/\\/g, '/').replace(/\.md$/i, '') + ']]';
  },

  /* 文件夹：把它下面所有笔记的双链都列出来（每行一条），批量做索引 / 目录时很顺手 */
  wikiLinksFor(item, kind) {
    if (kind !== 'folder') return [this.wikiLinkOf(item.relPath)];
    const vault = this.selectedVaultInfo();
    if (!vault) return [];
    const prefix = String(item.path || '') + '/';
    return (this.plugin.indexOf(vault.path).files || [])
      .filter((n) => fileKind(n.ext) === 'markdown' && String(n.relPath).indexOf(prefix) === 0)
      .map((n) => n.relPath)
      .sort((a, b) => a.localeCompare(b, 'zh'))
      .map((p) => this.wikiLinkOf(p));
  },
});

/* -------------------------------------------------------------------------
 *  工作台视图 · 多选 + 批量操作（复制/移动/标签/重命名）
 *  （本片段由 build.js 拼进 main.js，不要单独 require）
 * ------------------------------------------------------------------------- */
Object.assign(WorkbenchView.prototype, {
  /* --------------------------------------------------------------- 多选
   * Ctrl/⌘ + 点 = 加/减一项；Shift + 点 = 从上次那个连到这一个；普通点击 = 取消多选并打开。
   * 选中项存在 view.multiSel（Map）里，渲染时按 key 找回来。 */
  selKey(kind, item) {
    return (kind === 'folder' ? 'd:' : 'f:') + (kind === 'folder' ? item.path : item.relPath);
  },

  pushOrder(kind, item) {
    if (!this.flatOrder) this.flatOrder = [];
    this.flatOrder.push({ kind: kind, item: item });
  },

  isMulti(kind, item) {
    if (!this.multiSel || !this.multiSel.size || !item) return false;
    return this.multiSel.has(this.selKey(kind, item));
  },

  onItemClick(e, item, kind) {
    const mod = !!(e && (e.ctrlKey || e.metaKey));
    const shift = !!(e && e.shiftKey);
    if (mod) { this.toggleMulti(item, kind); return; }
    if (shift) { this.rangeMulti(item, kind); return; }
    // 普通点击已选项：按设置决定「打开并清空选择」还是「只取消这一项」
    if (this.multiSel && this.multiSel.size) {
      if (this.isMulti(kind, item) &&
          (this.plugin.settings.view.clickSelected || 'open') === 'deselect') {
        this.toggleMulti(item, kind);   // 只取消它，保留其余选择
        return;
      }
      // 其余情况：退出多选（接下来这次点击自己会重画列表，不用在这儿多渲染一次）
      this.multiSel.clear();
      this.selAnchor = -1;
      this.batchDelArm = false;
    }
    if (kind === 'folder') this.goTo(item.path);
    else this.openFile(item);
  },

  toggleMulti(item, kind) {
    if (!this.multiSel) this.multiSel = new Map();
    const key = this.selKey(kind, item);
    if (this.multiSel.has(key)) {
      this.multiSel.delete(key);
    } else {
      this.multiSel.set(key, { kind: kind, item: item });
      this.selAnchor = (this.flatOrder || []).findIndex((x) => this.selKey(x.kind, x.item) === key);
    }
    if (!this.multiSel.size) this.batchDelArm = false;
    this.afterMultiChange();
  },

  rangeMulti(item, kind) {
    const key = this.selKey(kind, item);
    const order = this.flatOrder || [];
    const to = order.findIndex((x) => this.selKey(x.kind, x.item) === key);
    if (to < 0) return;
    if (!this.multiSel) this.multiSel = new Map();
    let from = this.selAnchor;
    if (from < 0 || from >= order.length) {
      // 没有锚点（之前没点过任何东西）时：**只选当前这一项**，并把它记为锚。
      // 以前是「从头选到这儿」—— 用户只想要第 5、6 项，结果 1-4 全进来了，很诡异
      this.multiSel.set(key, { kind: kind, item: item });
      this.selAnchor = to;
      this.batchDelArm = false;
      this.afterMultiChange();
      return;
    }
    const a = Math.min(from, to);
    const b = Math.max(from, to);
    for (let i = a; i <= b; i++) {
      const x = order[i];
      this.multiSel.set(this.selKey(x.kind, x.item), { kind: x.kind, item: x.item });
    }
    this.selAnchor = to;
    this.afterMultiChange();
  },

  /* 多选变了要重画一遍 —— 但别把用户滚到一半的列表位置弄没了 */
  afterMultiChange() {
    this.batchDelArm = false;
    const top = this.bodyEl ? this.bodyEl.scrollTop : 0;
    this.render();
    if (this.bodyEl) { try { this.bodyEl.scrollTop = top; } catch (e) { /* 忽略 */ } }
  },

  clearMulti() {
    if (this.multiSel) this.multiSel.clear();
    this.selAnchor = -1;
    this.batchDelArm = false;
    this.render();
  },

  batchItems() {
    return this.multiSel ? Array.from(this.multiSel.values()) : [];
  },

  /* 多选操作条：钉在文件区最上面
   * ⚠ 它挂在 areaEl 内部，而 areaEl 绑了 mousedown 做框选。如果不阻止冒泡，
   * 点击这些按钮会触发框选流程，松开时选择被清空、按钮重建，click 事件就丢了 ——
   * 这就是「批量条按钮点了没反应」的根因。 */
  renderBatchBar() {
    const items = this.batchItems();
    const bar = this.areaEl.createDiv({ cls: 'vwb-batch vwb-glass' });
    bar.addEventListener('mousedown', (e) => { if (e && e.stopPropagation) e.stopPropagation(); });
    bar.addEventListener('click', (e) => { if (e && e.stopPropagation) e.stopPropagation(); });
    bar.createDiv({ cls: 'vwb-batch-n', text: tr('batch.selected', { n: items.length }) });
    const btn = (label, fn, extraCls) => {
      const b = bar.createEl('button', { cls: 'vwb-btn vwb-btn-sm' + (extraCls ? ' ' + extraCls : ''), text: label });
      b.addEventListener('click', (e) => {
        if (e && e.stopPropagation) e.stopPropagation();
        fn();
      });
      return b;
    };
    btn(tr('batch.copyPath'), () => this.batchCopyPath());
    btn(tr('batch.copyLinks'), () => this.batchCopyLinks());
    btn(tr('batch.tag'), () => this.batchTagPrompt());
    btn(tr('batch.rename'), () => this.batchRenamePrompt());
    btn(tr('batch.moveTo'), () => this.showMovePicker());
    btn(tr('batch.copyTo'), () => this.showCopyPicker());
    if (this.batchDelArm) {
      btn(tr('batch.deleteConfirm', { n: items.length }), () => this.batchDelete(), 'is-danger');
      btn(tr('common.cancel'), () => { this.batchDelArm = false; this.render(); });
    } else {
      btn(tr('batch.delete'), () => { this.batchDelArm = true; this.render(); });
    }
    btn(tr('batch.clear'), () => this.clearMulti());
  },

  batchCopyPath() {
    const items = this.batchItems();
    const lines = items.map((x) => x.kind === 'folder'
      ? this.absPathOf(x.item.path)
      : (x.item.absPath || this.absPathOf(x.item.relPath)));
    this.copyText(lines.join('\n'), tr('notice.copiedPaths', { n: lines.length }));
  },

  batchCopyLinks() {
    const items = this.batchItems();
    const lines = [];
    for (const x of items) {
      for (const l of this.wikiLinksFor(x.item, x.kind)) lines.push(l);
    }
    if (!lines.length) { new Notice(tr('ui.28')); return; }
    this.copyText(lines.join('\n'), tr('notice.copiedLinks', { n: lines.length }));
  },

  /* 批量打标：输入标签 → 合并进每篇笔记的 frontmatter（不覆盖已有标签） */
  batchTagPrompt() {
    const items = this.batchItems();
    const mdItems = items.filter((x) => x.kind === 'folder' || fileKind(x.item.ext) === 'markdown');
    if (!mdItems.length) { new Notice(tr('ui.29')); return; }
    this.promptText({
      title: tr('ui.30') + mdItems.length + tr('ui.31'),
      desc: tr('ui.32'),
      placeholder: tr('ui.33'),
      okText: tr('ui.34'),
      onOk: (text) => this.batchTag(mdItems, parseTags(text))
    });
  },

  async batchTag(items, tags) {
    if (!tags.length) { new Notice(tr('ui.35')); return; }
    const vault = this.selectedVaultInfo();
    const external = !!(vault && this.plugin.indexOf(vault.path).external);
    let done = 0, failed = 0, skipped = 0;
    for (const x of items) {
      if (x.kind === 'folder') {
        // 文件夹：打它下面所有 .md
        const prefix = String(x.item.path || '') + '/';
        const sub = (this.plugin.indexOf(vault.path).files || [])
          .filter((n2) => String(n2.relPath).indexOf(prefix) === 0 && fileKind(n2.ext) === 'markdown');
        for (const n2 of sub) {
          const r = await this.tagOneFile(n2, tags, external, vault);
          if (r === 'ok') done++; else if (r === 'skip') skipped++; else failed++;
        }
        continue;
      }
      const r = await this.tagOneFile(x.item, tags, external, vault);
      if (r === 'ok') done++; else if (r === 'skip') skipped++; else failed++;
    }
    this.plugin.externalCache = {};
    if (this.plugin.searchIdxCache) this.plugin.searchIdxCache = {};
    this.render();
    new Notice(tr('notice.tagged', { n: done }) +
      (skipped ? tr('notice.skipNotes', { n: skipped }) : '') +
      (failed ? tr('notice.failNotes', { n: failed }) : ''));
  },

  async tagOneFile(n, tags, external, vault) {
    try {
      let old;
      let write;
      if (external) {
        const abs = n.absPath || pathMod.join(vault.path, n.relPath);
        old = fs.readFileSync(abs, 'utf8');
        write = (c) => { fs.writeFileSync(abs, c); };
      } else {
        const app = this.plugin.app;
        const file = app.vault.getAbstractFileByPath(n.relPath);
        if (!file) return 'fail';
        old = await app.vault.read(file);
        write = async (c) => { await app.vault.modify(file, c); };
      }
      const next = addTagsToContent(old, tags);
      if (next == null || next === old) return 'skip';
      await write(next);
      this.plugin.logOp({ type: 'tag', path: n.relPath, tags: tags.join(', ') });
      return 'ok';
    } catch (e) {
      return 'fail';
    }
  },

  /* 批量重命名：前缀 / 查找替换 两种模式 */
  batchRenamePrompt() {
    const items = this.batchItems();
    if (!items.length) return;
    const host = this.contentEl.createDiv({ cls: 'vwb-dlg vwb-glass' });
    host.createDiv({ cls: 'vwb-dlg-t', text: tr('ui.36') + items.length + tr('ui.234') });
    let mode = 'prefix';
    const modeRow = host.createDiv({ cls: 'vwb-dlg-modes' });
    const mkMode = (id, label) => {
      const chip = modeRow.createDiv({ cls: 'vwb-mode' + (id === mode ? ' is-on' : ''), text: label });
      chip.addEventListener('click', () => {
        mode = id;
        for (const c of modeRow.children) {
          try { c.classList.toggle('is-on', c === chip); } catch (e) { /* 忽略 */ }
        }
        findIn.style.display = id === 'replace' ? '' : 'none';
        input.placeholder = id === 'prefix' ? tr('ui.37') : tr('ui.38');
      });
    };
    mkMode('prefix', tr('ui.39'));
    mkMode('replace', tr('ui.40'));
    const findIn = host.createEl('input', { type: 'text' });
    findIn.className = 'vwb-in';
    findIn.placeholder = tr('ui.41');
    findIn.style.display = 'none';
    const input = host.createEl('input', { type: 'text' });
    input.className = 'vwb-in';
    input.placeholder = tr('ui.37');
    const foot = host.createDiv({ cls: 'vwb-dlg-f' });
    foot.createEl('button', { cls: 'vwb-btn vwb-btn-sm vwb-btn-pri', text: tr('ui.42') })
      .addEventListener('click', () => {
        const v1 = String(findIn.value || '').trim();
        const v2 = String(input.value || '');
        this.closeDialog(host);
        if (mode === 'replace' && !v1) { new Notice(tr('ui.43')); return; }
        this.batchRename(items, mode, v1, v2);
      });
    foot.createEl('button', { cls: 'vwb-btn vwb-btn-sm', text: tr('ui.44') })
      .addEventListener('click', () => this.closeDialog(host));
    setTimeout(() => { try { input.focus(); } catch (e) { /* 忽略 */ } }, 30);
  },

  async batchRename(items, mode, arg1, arg2) {
    const vault = this.selectedVaultInfo();
    const external = !!(vault && this.plugin.indexOf(vault.path).external);
    const app = this.plugin.app;
    let done = 0, skipped = 0, failed = 0;
    for (const x of items) {
      const isFolder = x.kind === 'folder';
      const rel = isFolder ? x.item.path : x.item.relPath;
      const name = baseNameOf(rel);
      const dir = rel.indexOf('/') >= 0 ? rel.slice(0, rel.lastIndexOf('/')) : '';
      let newName;
      if (mode === 'prefix') {
        newName = String(arg2 || '') + name;
      } else {
        if (!arg1 || name.indexOf(arg1) < 0) { skipped++; continue; }
        newName = name.split(arg1).join(arg2);
      }
      if (!newName || newName === name) { skipped++; continue; }
      const dest = dir ? dir + '/' + newName : newName;
      if (external) {
        if (fs.existsSync(pathMod.join(vault.path, dest))) { skipped++; continue; }
        const r = this.plugin.applyExtRename(vault.path, rel, dest, isFolder);
        if (r.ok) done++; else failed++;
        continue;
      }
      const file = app.vault.getAbstractFileByPath(rel);
      if (!file) { skipped++; continue; }
      try {
        if (app.vault.getAbstractFileByPath(dest)) { skipped++; continue; }
        if (app.fileManager && typeof app.fileManager.renameFile === 'function') {
          await app.fileManager.renameFile(file, dest); // 双链一并更新
        } else {
          await app.vault.rename(file, dest);
        }
        this.plugin.logOp({ type: 'rename', path: rel, to: dest });
        done++;
      } catch (e) {
        failed++;
      }
    }
    this.render();
    new Notice(tr('notice.renamed', { n: done }) +
      (skipped ? tr('notice.skipItems', { n: skipped }) : '') +
      (failed ? tr('notice.failItems', { n: failed }) : ''));
  },

  /* 移动到…：浮层里列全库的文件夹，点一个就把选中的项都搬过去。
   * 走 Obsidian 的 renameFile，所以库内已有的双链会跟着更新。
   * items 可传入（右键单文件移动时用）；不传 = 移动当前已选集合。 */
  showMovePicker(items) {
    this.closeMovePicker();
    if (!this.mainEl) return;
    const list = items || this.batchItems();
    if (!list.length) return;
    const host = this.mainEl.createDiv({ cls: 'vwb-move vwb-glass' });
    this.moveEl = host;
    host.createDiv({ cls: 'vwb-move-t', text: tr('ui.45') + list.length + tr('ui.46') });
    const lst = host.createDiv({ cls: 'vwb-move-list' });
    const cur = this.folderPath || '';
    for (const f of this.vaultFolderList()) {
      const row = lst.createDiv({ cls: 'vwb-move-i' + (f ? '' : ' is-root') + (f === cur ? ' is-cur' : '') });
      row.createEl('span', { cls: 'vwb-folder', text: f ? '📁 ' + baseNameOf(f) : tr('ui.47') });
      if (f) row.createEl('span', { cls: 'vwb-move-path', text: f });
      row.addEventListener('click', (e) => {
        if (e && e.stopPropagation) e.stopPropagation();
        this.closeMovePicker();
        this.moveItemsTo(list, f);
      });
    }
    const foot = host.createDiv({ cls: 'vwb-move-foot' });
    foot.createEl('button', { cls: 'vwb-btn vwb-btn-sm', text: tr('ui.44') })
      .addEventListener('click', () => this.closeMovePicker());
  },

  /* 复制到别的库：只复制不移动 —— 原件留在原库，所以不会造成跨库断链
   * （这是「跨库移动」的安全替代方案，移动我们永远不做） */
  showCopyPicker() {
    this.closeMovePicker();
    if (!this.mainEl) return;
    const items = this.batchItems();
    if (!items.length) return;
    const host = this.mainEl.createDiv({ cls: 'vwb-move vwb-glass' });
    this.moveEl = host;
    host.createDiv({ cls: 'vwb-move-t', text: tr('ui.45') + items.length + tr('ui.48') });
    const list = host.createDiv({ cls: 'vwb-move-list' });
    const targets = this.plugin.discoverVaults()
      .filter((v) => !v.current && v.isVault !== false);
    if (!targets.length) {
      list.createDiv({ cls: 'vwb-move-i', text: tr('ui.49') });
    }
    for (const v of targets) {
      const row = list.createDiv({ cls: 'vwb-move-i' });
      row.createEl('span', { cls: 'vwb-folder', text: '🗄 ' + v.name });
      row.createEl('span', { cls: 'vwb-move-path', text: v.path });
      row.addEventListener('click', (e) => {
        if (e && e.stopPropagation) e.stopPropagation();
        this.batchCopyTo(v);
      });
    }
    const foot = host.createDiv({ cls: 'vwb-move-foot' });
    foot.createEl('button', { cls: 'vwb-btn vwb-btn-sm', text: tr('ui.44') })
      .addEventListener('click', () => this.closeMovePicker());
  },

  batchCopyTo(v) {
    this.closeMovePicker();
    const items = this.batchItems().map((x) => ({
      relPath: x.kind === 'folder' ? x.item.path : x.item.relPath,
      absPath: x.kind === 'folder' ? this.absPathOf(x.item.path) : (x.item.absPath || this.absPathOf(x.item.relPath)),
      kind: x.kind
    }));
    this.confirmBox({
      title: tr('picker.copyToTitle', { name: v.name }),
      desc: tr('picker.copyToDesc', { n: items.length }),
      okText: tr('picker.copyN', { n: items.length }),
      onOk: () => {
        const r = this.plugin.copyAcrossVault(items, v.path, '');
        if (!r.ok || !r.done.length) { new Notice(r.reason || tr('notice.copyNone')); return; }
        new Notice(tr('notice.copiedTo', { n: r.done.length, name: v.name }) +
          (r.reason ? '（' + r.reason + '）' : ''), 8000);
        this.clearMulti();
        this.render();
      }
    });
  },

  closeMovePicker() {
    const el = this.moveEl;
    this.moveEl = null;
    if (!el) return;
    try {
      if (typeof el.remove === 'function') el.remove();
      else if (el.parentElement) el.parentElement.removeChild(el);
    } catch (e) { /* 忽略 */ }
  },
});

/* -------------------------------------------------------------------------
 *  工作台视图 · 仪表盘入口 + 标签面板
 *  （本片段由 build.js 拼进 main.js，不要单独 require）
 * ------------------------------------------------------------------------- */
Object.assign(WorkbenchView.prototype, {
  /* ---------------------------------------------------- 仪表盘四个入口
   * 卡片只是「给文件列表设置条件」的入口，条件之间按 AND 叠加（搜索 / 文件夹 / 标签 / 本周）。
   * 只有「笔记总数」是重置入口 —— 它会把所有条件清空。 */
  clearAllFilters() {
    this.query = '';
    if (this.searchEl) this.searchEl.value = '';
    this.tagFilter = [];
    this.weekOnly = false;
    this.tagPanelOpen = false;
    this.crossHits = null;
    if (this.multiSel && this.multiSel.size) this.multiSel.clear();
    this.syncSearchUI();
  },

  dashAll() {
    this.clearAllFilters();
    this.folderPath = '';
    this.hist = [];
    this.histIdx = -1;
    this.render();
  },

  dashWeek() {
    this.weekOnly = true;
    this.tagPanelOpen = false;
    this.sort = 'mtime';
    this.plugin.settings.view.sort = this.sort;
    this.plugin.saveSettings();
    this.render();
  },

  /* 收集箱：库根目录下名为 inbox 的文件夹（不缓存 —— 它要实时反映文件夹存不存在） */
  inboxInfo() {
    const name = String((this.plugin.settings.view.inbox || 'inbox') || 'inbox').replace(/\/+$/, '');
    let exists = false;
    for (const f of (this.indexFolders || [])) {
      const p = normFolder(f && f.path != null ? f.path : f);
      if (p && p === name) { exists = true; break; }
    }
    return { name: name, exists: exists };
  },

  dashInbox() {
    const info = this.inboxInfo();
    if (!info.exists) {
      this.createFolder(info.name);   // 库根目录建一个收集箱
      return;
    }
    this.folderPath = info.name;
    this.hist = [];
    this.histIdx = -1;
    this.render();
  },

  toggleTagPanel() {
    this.tagPanelOpen = !this.tagPanelOpen;
    this.render();
  },

  /* 已选标签提示条：每个标签带 × 可单独移除，右侧「清除」 */
  renderTagBar() {
    const bar = this.areaEl.createDiv({ cls: 'vwb-tagbar vwb-glass' });
    bar.createEl('span', { cls: 'vwb-tagbar-t', text: tr('ui.51') });
    for (const t of this.tagFilter) {
      const chip = bar.createEl('span', { cls: 'vwb-card-tag', text: '#' + t });
      chip.setAttribute('title', tr('ui.52'));
      chip.addEventListener('click', (e) => {
        if (e && e.stopPropagation) e.stopPropagation();
        this.tagFilter = this.tagFilter.filter((x) => x !== t);
        this.render();
      });
    }
    const clear = bar.createEl('span', { cls: 'vwb-tagbar-x', text: tr('ui.53') });
    clear.addEventListener('click', (e) => {
      if (e && e.stopPropagation) e.stopPropagation();
      this.tagFilter = [];
      this.render();
    });
  },

  /* 标签列表面板：列表式（本期不做标签云）。标题 + 搜索框 + 标签行（#名 + 计数） */
  renderTagPanel(notes) {
    const s = this.computeStats(notes);
    const head = this.areaEl.createDiv({ cls: 'vwb-tagpanel' });
    const hd = head.createDiv({ cls: 'vwb-tagpanel-hd' });
    hd.createEl('span', { cls: 'vwb-tagpanel-t', text: tr('ui.54') });
    hd.createEl('span', { cls: 'vwb-tagpanel-sort', text: tr('ui.55') });
    const close = hd.createEl('span', { cls: 'vwb-tagpanel-x', text: '✕' });
    close.setAttribute('title', tr('ui.56'));
    close.addEventListener('click', () => { this.tagPanelOpen = false; this.render(); });

    const box = head.createDiv({ cls: 'vwb-tagpanel-search' });
    const input = box.createEl('input', { type: 'text', value: this.tagQuery || '' });
    input.className = 'vwb-in';
    input.placeholder = tr('ui.57');
    input.addEventListener('input', () => {
      this.tagQuery = String(input.value || '');
      this.renderTagList(head, s.tags);
    });
    input.addEventListener('keydown', (e) => {
      if (e && e.stopPropagation) e.stopPropagation();   // 别让 Obsidian 抢走输入
    });
    this.renderTagList(head, s.tags);
  },

  renderTagList(head, tags) {
    let listEl = null;
    if (typeof head.querySelector === 'function') listEl = head.querySelector('.vwb-tagpanel-list');
    if (listEl) { try { listEl.remove(); } catch (e) { /* 忽略 */ } }
    const list = head.createDiv({ cls: 'vwb-tagpanel-list' });
    const q = String(this.tagQuery || '').trim().toLowerCase();
    const shown = (tags || []).filter((t) => !q || t[0].toLowerCase().indexOf(q) >= 0);
    if (!shown.length) {
      list.createDiv({ cls: 'vwb-empty', text: q ? tr('ui.58') : tr('ui.59') });
      return;
    }
    for (const [name, count] of shown) {
      const row = list.createDiv({
        cls: 'vwb-tagrow' + (this.tagFilter.indexOf(name) >= 0 ? ' is-on' : '')
      });
      row.createEl('span', { cls: 'vwb-tagrow-n', text: '#' + name });
      row.createEl('span', { cls: 'vwb-tagrow-c', text: String(count) + tr('ui.133') });
      row.setAttribute('title', tr('ui.60'));
      row.addEventListener('click', (e) => {
        if (e && e.stopPropagation) e.stopPropagation();
        const add = !!(e && (e.ctrlKey || e.metaKey));
        if (add) {
          this.tagFilter = this.tagFilter.indexOf(name) >= 0
            ? this.tagFilter.filter((x) => x !== name)
            : this.tagFilter.concat([name]);
        } else {
          this.tagFilter = this.tagFilter.length === 1 && this.tagFilter[0] === name ? [] : [name];
        }
        this.render();
      });
    }
  },

  /* 按标签筛选：搜索框填入 #标签 并过滤文件区（卡片 / 预览面板的标签 chips 共用）。
   * 标签是当前库的概念，强制切回「当前库」范围（跨库全文索引里没有标签字段）。 */
  searchByTag(tag) {
    const name = String(tag || '').trim().replace(/^#+/, '').trim();
    if (!name) return;
    this.query = '#' + name;
    if (this.searchScope !== 'current') {
      this.searchScope = 'current';
      this.crossHits = null;
    }
    if (this.searchEl) this.searchEl.value = this.query;
    this.syncSearchUI();
    if (this.multiSel && this.multiSel.size) this.multiSel.clear();
    this.render();
    new Notice(tr('notice.filteredByTag', { tag: this.query }));
  },
});

/* -------------------------------------------------------------------------
 *  工作台视图 · 拖拽 + 智能视图菜单
 *  （本片段由 build.js 拼进 main.js，不要单独 require）
 * ------------------------------------------------------------------------- */
Object.assign(WorkbenchView.prototype, {
  /* 让卡片 / 行可以被拖 */
  bindDrag(el, item, kind) {
    if (!el) return;
    el.setAttribute('draggable', 'true');
    el.addEventListener('dragstart', (e) => this.onItemDragStart(e, item, kind));
    el.addEventListener('dragend', () => this.onItemDragEnd());
  },

  /* 文件夹作为投放目标 */
  bindDropTarget(el, item, kind) {
    if (!el || kind !== 'folder') return;
    el.addEventListener('dragover', (e) => this.onFolderDragOver(e, el));
    el.addEventListener('dragleave', () => this.onFolderDragLeave(el));
    el.addEventListener('drop', (e) => this.onFolderDrop(e, item));
  },

  onItemDragStart(e, item, kind) {
    if (!e || !e.dataTransfer) return;
    const inSelection = this.isMulti(kind, item);
    const items = (inSelection && this.multiSel && this.multiSel.size)
      ? Array.from(this.multiSel.values())
      : [{ kind: kind, item: item }];
    this._dragItems = items;
    try {
      e.dataTransfer.setData('text/plain', this.selKey(kind, item));
      e.dataTransfer.effectAllowed = 'move';
    } catch (e2) { /* 忽略 */ }
    if (this.areaEl) this.areaEl.addClass('is-dragging');
  },

  onItemDragEnd() {
    this._dragItems = null;
    if (this.areaEl) this.areaEl.removeClass('is-dragging');
    try {
      for (const el of this.itemEls || []) el.removeClass('is-dragover');
    } catch (e) { /* 忽略 */ }
  },

  onFolderDragOver(e, el) {
    if (e && e.preventDefault) e.preventDefault();
    if (e && e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    try { el.addClass('is-dragover'); } catch (e2) { /* 忽略 */ }
  },

  onFolderDragLeave(el) {
    try { el.removeClass('is-dragover'); } catch (e2) { /* 忽略 */ }
  },

  async onFolderDrop(e, folderItem) {
    if (e && e.preventDefault) e.preventDefault();
    if (e && e.stopPropagation) e.stopPropagation();
    const items = this._dragItems;
    this._dragItems = null;
    if (this.areaEl) this.areaEl.removeClass('is-dragging');
    try { for (const el of this.itemEls || []) el.removeClass('is-dragover'); } catch (e2) { /* 忽略 */ }
    if (!items || !items.length) return;
    const target = folderItem.path;
    // 不能拖到自己和自己的子文件夹里
    const valid = items.filter((x) => {
      if (x.kind !== 'file' && x.kind !== 'folder') return false;
      const rel = x.kind === 'folder' ? x.item.path : x.item.relPath;
      if (rel === target) return false;
      if (x.kind === 'folder' && target.indexOf(rel + '/') === 0) return false;
      return true;
    });
    if (!valid.length) return;
    await this.moveItemsTo(valid, target);
  },

  /* 智能视图：保存 / 应用筛选条件的命名入口 */
  showViewsMenu(ev) {
    this.closeViewsMenu();
    if (!this.mainEl) return;
    const host = this.contentEl.createDiv({ cls: 'vwb-views vwb-glass' });
    this.viewsEl = host;
    host.addEventListener('mousedown', (e) => { if (e && e.stopPropagation) e.stopPropagation(); });
    const views = this.plugin.settings.smartViews || [];
    host.createDiv({ cls: 'vwb-views-t', text: tr('ui.62') });
    const list = host.createDiv({ cls: 'vwb-views-list' });
    if (!views.length) {
      list.createDiv({ cls: 'vwb-views-empty', text: tr('views.empty') });
    }
    views.forEach((v, i) => {
      const row = list.createDiv({ cls: 'vwb-views-i' });
      row.createEl('span', { cls: 'vwb-folder', text: v.name });
      const desc = [
        v.query ? tr('views.searchTagQ', { q: v.query }) : '',
        v.scope === 'all' ? tr('ui.63') : '',
        { mtime: tr('ui.64'), name: tr('ui.65'), size: tr('ui.66') }[v.sort] || ''
      ].filter(Boolean).join(' · ');
      if (desc) row.createEl('span', { cls: 'vwb-views-d', text: desc });
      row.setAttribute('title', tr('ui.67'));
      row.addEventListener('click', (e) => {
        if (e && e.stopPropagation) e.stopPropagation();
        this.applySmartView(v);
      });
      const del = row.createEl('span', { cls: 'vwb-views-x', text: '✕' });
      del.setAttribute('title', tr('ui.68'));
      del.addEventListener('click', (e) => {
        if (e && e.stopPropagation) e.stopPropagation();
        views.splice(i, 1);
        this.plugin.saveSettings();
        this.closeViewsMenu();
        new Notice(tr('ui.69') + v.name);
      });
    });
    const foot = host.createDiv({ cls: 'vwb-views-f' });
    foot.createEl('button', { cls: 'vwb-btn vwb-btn-sm vwb-btn-pri', text: tr('ui.70') })
      .addEventListener('click', () => {
        this.closeViewsMenu();
        this.promptText({
          title: tr('ui.71'),
          placeholder: tr('ui.72'),
          okText: tr('ui.73'),
          onOk: (name) => {
            if (!name) return;
            views.push({
              name: name,
              query: this.query || '',
              sort: this.sort || 'mtime',
              scope: this.searchScope || 'current',
              folder: this.folderPath || ''
            });
            this.plugin.saveSettings();
            new Notice(tr('ui.74') + name);
          }
        });
      });
    foot.createEl('button', { cls: 'vwb-btn vwb-btn-sm', text: tr('ui.75') })
      .addEventListener('click', () => this.closeViewsMenu());
    // 定位：贴按钮下方
    try {
      const r = (ev && ev.target && ev.target.getBoundingClientRect) ? ev.target.getBoundingClientRect() : null;
      const rootR = this.contentEl.getBoundingClientRect();
      if (r && rootR) {
        host.style.position = 'absolute';
        host.style.left = (r.left - rootR.left) + 'px';
        host.style.top = (r.bottom - rootR.top + 4) + 'px';
      }
    } catch (e) { /* 忽略 */ }
  },

  closeViewsMenu() {
    const el = this.viewsEl;
    this.viewsEl = null;
    this.closeDialog(el);
  },

  applySmartView(v) {
    if (!v) return;
    this.closeViewsMenu();
    this.query = String(v.query || '');
    this.sort = v.sort || 'mtime';
    this.searchScope = v.scope || 'current';
    this.crossHits = null;
    this.folderPath = String(v.folder || '');
    if (this.searchEl) this.searchEl.value = this.query;
    this.syncSearchUI();
    this.multiSel.clear();
    this.render();
    new Notice(tr('ui.76') + v.name);
  },
});

/* -------------------------------------------------------------------------
 *  工作台视图 · 文件夹列表 + 回收站 + 打开入口 + 新建菜单
 *  （本片段由 build.js 拼进 main.js，不要单独 require）
 * ------------------------------------------------------------------------- */
Object.assign(WorkbenchView.prototype, {
  /* 当前库里有哪几层文件夹（含中间层），给「移动到…」当选项 */
  vaultFolderList() {
    const vault = this.selectedVaultInfo();
    if (!vault) return [''];
    const set = new Set(['']);
    for (const n of (this.plugin.indexOf(vault.path).files || [])) {
      const f = String(n.folder || '');
      if (!f) continue;
      let acc = '';
      for (const seg of f.split('/')) { acc = acc ? acc + '/' + seg : seg; set.add(acc); }
    }
    return Array.from(set).sort((a, b) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b, 'zh')));
  },

  async batchMoveTo(dir) {
    this.closeMovePicker();
    await this.moveItemsTo(this.batchItems(), dir);
  },

  /* 批量移动 / 拖拽归档的核心实现：把 items 移动到 target 文件夹下
   * items: [{ kind, item }]；dir 是目标文件夹路径（空字符串 = 库根） */
  async moveItemsTo(items, dir) {
    const app = this.plugin.app;
    const vault = this.selectedVaultInfo();
    const external = !!(vault && this.plugin.indexOf(vault.path).external);
    const root = vault ? vault.path : '';
    let moved = 0;
    let skipped = 0;
    for (const x of items) {
      const isFolder = x.kind === 'folder';
      const rel = isFolder ? x.item.path : x.item.relPath;
      const name = baseNameOf(rel);
      const dest = dir ? dir + '/' + name : name;
      // 已经在目标位置、或者想把文件夹搬进它自己里面 —— 跳过
      if (dest === rel) { skipped++; continue; }
      if (isFolder && dir && (dir === rel || dir.indexOf(rel + '/') === 0)) { skipped++; continue; }
      if (external) {
        // 外部库：走我们自己的重命名通道（挪文件 + 把引用它的双链改掉）
        if (fs.existsSync(pathMod.join(root, dest))) { skipped++; continue; }
        const r = this.plugin.applyExtRename(root, rel, dest, isFolder);
        if (r.ok) moved++; else skipped++;
        continue;
      }
      const file = (app && app.vault && app.vault.getAbstractFileByPath)
        ? app.vault.getAbstractFileByPath(rel) : null;
      if (!file) { skipped++; continue; }
      try {
        if (app.vault.getAbstractFileByPath(dest)) { skipped++; continue; }
        if (app.fileManager && typeof app.fileManager.renameFile === 'function') {
          await app.fileManager.renameFile(file, dest); // 库内双链会一并更新
        } else {
          await app.vault.rename(file, dest);
        }
        this.plugin.logOp({ type: 'move', path: rel, to: dest });
        moved++;
      } catch (e) {
        skipped++;
      }
    }
    if (this.selectedNote && this.multiSel && this.multiSel.size) {
      const hit = items.find((x) => x.kind === 'file' && x.item.relPath === this.selectedNote.relPath);
      if (hit) this.closePreview();
    }
    if (this.multiSel) this.multiSel.clear();
    this.batchDelArm = false;
    this.render();
    new Notice(tr('notice.moved', { n: moved }) + (skipped ? tr('notice.movedSkipped', { n: skipped }) : ''));
  },

  async batchDelete() {
    const items = this.batchItems();
    const vault = this.selectedVaultInfo();
    // ⚠️ 外部库的东西不在 app.vault 里（getAbstractFileByPath 只认当前打开的库）——
    // 之前批量删除没分流，选 3 项只删掉 1 项就是这个原因。
    const external = !!(vault && this.plugin.indexOf(vault.path).external);
    let done = 0;
    let failed = 0;
    let reason = '';
    for (const x of items) {
      const isFolder = x.kind === 'folder';
      const rel = isFolder ? x.item.path : x.item.relPath;
      if (external) {
        const r = this.plugin.extDelete(vault.path, rel, isFolder);
        if (r.ok) done++;
        else { failed++; reason = reason || r.reason; }
      } else {
        const r = await this.deleteOneLocal(rel, isFolder, true);
        if (r.ok) done++;
        else { failed++; reason = reason || r.reason; }
      }
    }
    const sel = this.selectedNote;
    if (sel && items.some((x) => (x.kind === 'folder'
      ? String(sel.relPath).indexOf(x.item.path + '/') === 0
      : sel.relPath === x.item.relPath))) {
      this.closePreview();
    }
    this.multiSel.clear();
    this.selAnchor = -1;
    this.batchDelArm = false;
    this.render();
    new Notice(tr('notice.deleted', { n: done }) + (failed ? tr('notice.deletedFail', { n: failed }) : '') + tr('notice.deletedHint'));
  },

  absPathOf(rel) {
    if (!rel) return '';
    const vault = this.selectedVaultInfo();
    if (!vault) return rel;
    return String(vault.path).replace(/\\/g, '/') + '/' + rel;
  },

  copyPathToClipboard(p) {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(p);
      }
    } catch (e) { /* 忽略 */ }
    new Notice(tr('ui.77') + p);
  },

  async runItemCmd(id, item, kind) {
    this.closeEditorMenu();
    if (!item) return;
    const isFolder = kind === 'folder';
    const rel = isFolder ? (item.path || '') : item.relPath;
    const abs = isFolder ? this.absPathOf(rel) : (item.absPath || this.absPathOf(rel));
    // 右键时被点的这一项在不在多选集合里？在且集合大于 1 → 这些命令批量作用于已选项
    const inSelection = this.isMulti(kind, item);
    const bulk = inSelection && this.multiSel && this.multiSel.size > 1;
    switch (id) {
      case 'switch-vault': this.switchToSelectedVault(); return;
      case 'enter': this.goTo(item.path); return;
      case 'new-note': this.createNote(item.path); return;
      case 'new-note-wb': this.createNote(item.path, { native: false }); return;
      case 'new-note-native': this.createNote(item.path, { native: true }); return;
      case 'open': await this.openFile(item); return;
      case 'open-panel': await this.openFile(item, { forcePanel: true }); return;
      case 'open-native': await this.openNative(item); return;
      case 'copy-path': {
        if (bulk) { this.batchCopyPath(); return; }
        this.copyPathToClipboard(abs || rel); return;
      }
      case 'copy-path-uri': {
        if (bulk) {
          const lines = this.batchItems().map((x) => this.obsidianUri(x.kind === 'folder' ? x.item.path : x.item.relPath));
          this.copyText(lines.join('\n'), tr('notice.copiedUris', { n: lines.length }));
        } else {
          this.copyText(this.obsidianUri(rel), tr('ui.78'));
        }
        return;
      }
      case 'copy-path-rel': {
        if (bulk) {
          const lines = this.batchItems().map((x) => x.kind === 'folder' ? x.item.path : x.item.relPath);
          this.copyText(lines.join('\n'), tr('notice.copiedRel', { n: lines.length }));
        } else {
          this.copyPathToClipboard(rel);
        }
        return;
      }
      case 'copy-path-abs': {
        if (bulk) {
          const lines = this.batchItems().map((x) => x.kind === 'folder'
            ? this.absPathOf(x.item.path)
            : (x.item.absPath || this.absPathOf(x.item.relPath)));
          this.copyText(lines.join('\n'), tr('notice.copiedAbs', { n: lines.length }));
        } else {
          this.copyPathToClipboard(abs);
        }
        return;
      }
      case 'move-to': {
        // 批量时移动整个已选集合；单选时只移动这一项
        this.showMovePicker(bulk ? null : [{ kind: kind, item: item }]);
        return;
      }
      case 'duplicate': {
        if (bulk) { this.batchDuplicate(); return; }
        await this.duplicateItem(item, kind); return;
      }
      case 'copy-uri': this.copyText(this.obsidianUri(rel), tr('ui.79')); return;
      case 'copy-wikilink': {
        if (bulk) { this.batchCopyLinks(); return; }
        const links = this.wikiLinksFor(item, kind);
        if (!links.length) { new Notice(tr('ui.80')); return; }
        this.copyText(links.join('\n'), links.length > 1
          ? tr('notice.copiedLinks', { n: links.length })
          : tr('ui.81'));
        return;
      }
      case 'reveal': shellReveal(abs || rel); return;
      case 'rename': await this.renameVaultItem(rel, isFolder); return;
      case 'delete': {
        if (bulk) {
          // 多选时右键删除 = 走批量删除的二次确认流程（顶部操作条出现「确认删除 N 项」）
          this.batchDelArm = true;
          this.closeEditorMenu();
          this.render();
          return;
        }
        await this.deleteVaultItem(rel, isFolder); return;
      }
      default: return;
    }
  },

  /* 重命名：当前库交给 Obsidian 自己的弹窗；别的库由工作台自己改（双链自己修） */
  async renameVaultItem(rel, isFolder) {
    const vault = this.selectedVaultInfo();
    if (vault && this.plugin.indexOf(vault.path).external) {
      await this.extRenameItem(vault, rel, isFolder);
      return;
    }
    const app = this.plugin.app;
    const file = (app && app.vault && app.vault.getAbstractFileByPath)
      ? app.vault.getAbstractFileByPath(rel) : null;
    if (!file) { new Notice(tr('ui.82')); return; }
    const fm = app.fileManager;
    if (fm && typeof fm.promptForFileRename === 'function') {
      try {
        await fm.promptForFileRename(file);
        this.plugin.logOp({ type: 'rename', path: rel });
        this.render();
        return;
      } catch (e) {
        new Notice(tr('ui.83') + (e && e.message ? e.message : e));
        return;
      }
    }
    new Notice(isFolder
      ? tr('ui.84')
      : tr('ui.85'));
  },

  /* 别的库的重命名：先算引用、弹确认，再改（引用由工作台自己重写） */
  async extRenameItem(vault, rel, isFolder) {
    if (!this.plugin.vaultWritable(vault.path)) {
      new Notice(tr('ui.86'));
      return;
    }
    const cur = baseNameOf(rel);
    const dir = parentOf(rel);
    this.promptText({
      title: isFolder ? tr('ui.87') : tr('ui.88'),
      desc: tr('dialog.renameExternal', { vault: vault.name }),
      value: cur,
      okText: tr('ui.89'),
      onOk: (name) => {
        if (!name || name === cur) return;
        const ext = isFolder ? '' : (pathMod.extname(rel) || '.md');
        const newRel = (dir ? dir + '/' : '') + name + ext;
        const p = this.plugin.planExtRename(vault.path, rel, newRel, isFolder);
        this.confirmBox({
          title: tr('ui.90'),
          desc: '「' + rel + '」→「' + newRel + '」\n' + (p.refs
            ? tr('dialog.refsLineN', { n: p.files, m: p.refs })
            : tr('ui.91')),
          okText: tr('dialog.renameOk') + (p.refs ? tr('dialog.renameRefsParen', { n: p.refs }) : ''),
          onOk: () => {
            const r = this.plugin.applyExtRename(vault.path, rel, newRel, isFolder);
            if (!r.ok) { new Notice(r.reason); return; }
            new Notice(tr('dialog.renamedRefs') + (r.refs ? tr('dialog.renamedLinksCn', { n: r.refs }) : '') +
              (r.reason ? '（' + r.reason + '）' : ''), 8000);
            this.render();
          }
        });
      }
    });
  },

  /* 别的库的删除：挪到该库的 .trash 里（可恢复），不是直接删 */
  async extDeleteItem(vault, rel, isFolder) {
    if (!this.plugin.vaultWritable(vault.path)) {
      new Notice(tr('ui.86'));
      return;
    }
    const p = this.plugin.planExtRename(vault.path, rel, rel, isFolder);
    this.confirmBox({
      title: tr('ui.93') + (isFolder ? tr('ui.94') : tr('ui.95')),
      desc: tr('dialog.deleteExternal', { name: rel, vault: vault.name }) + (p.refs
        ? tr('dialog.deadLinks', { n: p.refs })
        : tr('dialog.refsNone')),
      danger: true,
      okText: tr('ui.93'),
      onOk: () => {
        const r = this.plugin.extDelete(vault.path, rel, isFolder);
        if (!r.ok) { new Notice(r.reason); return; }
        new Notice(tr('dialog.deletedTrashInVault', { vault: vault.name }), 8000);
        const sel = this.selectedNote;
        if (sel && (isFolder ? String(sel.relPath).indexOf(rel + '/') === 0 : sel.relPath === rel)) {
          this.closePreview();
        }
        this.render();
      }
    });
  },

  /* Obsidian 的删除策略：local（库内 .trash）/ system（系统回收站）/ none（永久删）。
   * 这是非公开配置，读不到就当 'none' —— 宁可多留一份副本，也不能让用户找不回来。 */
  vaultTrashOption() {
    const app = this.plugin.app;
    try {
      const v = app && app.vault;
      if (v && typeof v.getConfig === 'function') return String(v.getConfig('trashOption') || '');
      if (v && v.config) return String(v.config.trashOption || '');
    } catch (e) { /* 忽略 */ }
    return '';
  },

  /* 删除**当前库**里的一项（quiet=true 时不弹单条提示，给批量删除复用）。
   * 关键：用户如果把 Obsidian 设成「系统回收站 / 永久删除」，库里根本不会留副本 ——
   * 工作台的回收站页面就永远看不到它。所以只要不是 local 策略，删之前先自留一份。
   * 返回 {ok, reason}。 */
  async deleteOneLocal(rel, isFolder, quiet) {
    const app = this.plugin.app;
    const file = (app && app.vault && app.vault.getAbstractFileByPath)
      ? app.vault.getAbstractFileByPath(rel) : null;
    if (!file) return { ok: false, reason: tr('ui.96') };
    const root = this.plugin.currentVaultPath();
    const opt = this.vaultTrashOption();
    if (opt !== 'local') {
      const c = trashCopyInVault(root, rel);
      if (!c.ok && !quiet) new Notice(tr('ui.97') + c.reason, 6000);
    }
    try {
      const fm = app.fileManager;
      const trashDir = pathMod.join(root, '.trash');
      const listDir = () => (fs.existsSync(trashDir) ? fs.readdirSync(trashDir) : []);
      const before = listDir();
      if (fm && typeof fm.trashFile === 'function') await fm.trashFile(file);
      else if (app.vault.trash) await app.vault.trash(file, true); // 旧版 API：丢进系统回收站
      else await app.vault.delete(file);
      // Obsidian 自己把它放进了库内 .trash → 登记映射（放宽到 added.length >= 1，
      // 旧代码只在恰好 1 个新增时登记，Obsidian 顺带写了别的东西就记不上）
      if (opt === 'local') {
        const added = listDir().filter((x) => before.indexOf(x) < 0 && !isIgnoredEntry(x));
        if (added.length) {
          const map = readTrashMap(root);
          for (const nm of added) map[nm] = { rel: rel, ts: Date.now(), isDir: !!isFolder };
          writeTrashMap(root, map);
        }
      }
      const sel = this.selectedNote;
      if (sel && (isFolder
        ? String(sel.relPath).indexOf(rel + '/') === 0
        : sel.relPath === rel)) {
        this.closePreview();
      }
      this.plugin.logOp({ type: 'delete', path: rel });
      if (!quiet) new Notice(tr('dialog.deletedRecycle').replace('：（', '：' + rel + '（'));
      return { ok: true, reason: '' };
    } catch (e) {
      const reason = (e && e.message) ? e.message : String(e);
      if (!quiet) new Notice(tr('ui.98') + reason);
      return { ok: false, reason: reason };
    }
  },

  /* 删除：外部库走我们自己的 .trash，当前库走 Obsidian 的通道 */
  async deleteVaultItem(rel, isFolder) {
    const vault = this.selectedVaultInfo();
    if (vault && this.plugin.indexOf(vault.path).external) {
      await this.extDeleteItem(vault, rel, isFolder);
    } else {
      const r = await this.deleteOneLocal(rel, isFolder, false);
      if (!r.ok) new Notice(r.reason);
    }
    this.render();
  },

  /* 创建副本：原名 + " 1"（重名自动递增）。当前库走 Obsidian 的 copy，外部库我们自己复制 */
  async duplicateItem(item, kind) {
    const vault = this.selectedVaultInfo();
    if (!vault) return;
    const isFolder = kind === 'folder';
    const rel = isFolder ? item.path : item.relPath;
    const external = this.plugin.indexOf(vault.path).external;
    if (external) {
      const abs = (x) => pathMod.join(vault.path, x);
      let newRel = dupRel(rel, 1);
      let n = 1;
      while (fs.existsSync(abs(newRel))) { n++; newRel = dupRel(rel, n); }
      const r = isFolder
        ? copyDirAcross(abs(rel), vault.path, newRel)
        : copyFileAcross(abs(rel), vault.path, newRel);
      if (r.ok) {
        this.plugin.externalCache = {};
        this.plugin.logOp({ type: 'duplicate', path: rel, to: r.rel });
        new Notice(tr('ui.99') + r.rel);
      } else {
        new Notice(tr('ui.100') + r.reason);
      }
      this.render();
      return;
    }
    const app = this.plugin.app;
    const file = app.vault.getAbstractFileByPath(rel);
    if (!file) { new Notice(tr('ui.101')); return; }
    let newRel = dupRel(rel, 1);
    let n = 1;
    while (app.vault.getAbstractFileByPath(newRel)) { n++; newRel = dupRel(rel, n); }
    try {
      await app.vault.copy(file, newRel);
      this.plugin.logOp({ type: 'duplicate', path: rel, to: newRel });
      new Notice(tr('ui.99') + newRel);
    } catch (e) {
      new Notice(tr('ui.100') + (e && e.message ? e.message : e));
    }
    this.render();
  },

  batchDuplicate() {
    const items = this.batchItems();
    for (const x of items) this.duplicateItem(x.item, x.kind);
  },

  /* ------------------------------------------------------- 打开文件的入口
   * 默认行为由 settings.open.mode 决定：
   *   native → 铺满的原生标签页（Obsidian 完整能力：编辑 / 阅读 / 大纲 / 双链 / 插件）
   *   panel  → 工作台内面板预览（可再点「⤢」铺满内容区）
   * 外部库文件不是当前 vault 的 TFile，无法原生打开，自动回落面板。
   */
  async openSelected() {
    const n = this.selectedNote;
    if (!n) return false;
    return this.openNative(n);
  },

  /* 外部库做不了的事：别只说「只读」，要告诉用户下一步按哪里。
   * 切库会把工作台一起装过去，所以切过去照样能继续用。 */
  externalBlockNotice(action) {
    const v = this.selectedVaultInfo();
    const nm = v ? v.name : tr('ui.102');
    new Notice(
      tr('dialog.switchToDo', { action: action, name: nm }) +
      tr('ui.103'),
      12000
    );
  },

  /* 切到选中的外部库去（文件区右键 / 工具条都能触发） */
  switchToSelectedVault() {
    const v = this.selectedVaultInfo();
    if (!v) { new Notice(tr('ui.104')); return; }
    if (!v.current && this.plugin.indexOf(v.path).external) {
      this.plugin.switchToVault(v.path);
      return;
    }
    new Notice(tr('dialog.alreadyInName', { name: v.name }));
  },

  /* 新建笔记：folder 传了就建在那个文件夹里（文件区右键「在这里新建笔记」），
   * 不传就建在当前所在目录。
   * opts.native = true → 建好用 Obsidian 原生编辑器在新标签页打开；
   * 否则（默认）直接在工作台里铺满打开、并进编辑态，光标就在正文里。 */
  async createNote(folder, opts) {
    const o = opts || {};
    const vault = this.selectedVaultInfo();
    if (!vault) return;
    if (this.plugin.indexOf(vault.path).external) {
      await this.extCreateNote(vault, folder, o);
      return;
    }
    const dir = typeof folder === 'string' ? folder : this.folderPath;
    const prefix = dir ? dir + '/' : '';
    let name = tr('ui.105');
    let target = prefix + name + '.md';
    let i = 1;
    while (this.plugin.app.vault.getAbstractFileByPath(target)) {
      i++;
      target = prefix + name + ' ' + i + '.md';
    }
    try {
      const file = await this.plugin.app.vault.create(target, '');
      this.plugin.logOp({ type: 'create', path: target });
      if (o.native) {
        // 交给 Obsidian 自己开标签页（官方编辑器、双链补全、编辑类插件都在）
        let leaf = null;
        try { leaf = this.plugin.app.workspace.getLeaf('tab'); } catch (e) { leaf = this.plugin.app.workspace.getLeaf(true); }
        await leaf.openFile(file);
        this.render();
        return;
      }
      // 工作台内：立刻铺满打开 + 进编辑态
      await this.openPreview(this.noteOf(file, target), { expand: true, edit: true });
      this.render();
    } catch (e) {
      new Notice(tr('ui.106') + (e && e.message ? e.message : e));
    }
  },

  /* 别的库里新建笔记：直接写到磁盘上（不经过 Obsidian，所以没有双链补全这类能力） */
  async extCreateNote(vault, folder, opts) {
    const o = opts || {};
    if (!this.plugin.vaultWritable(vault.path)) {
      new Notice(tr('ui.86'));
      return;
    }
    const dir = typeof folder === 'string' ? folder : this.folderPath;
    this.promptText({
      title: tr('dialog.newNoteInVault', { name: vault.name }),
      desc: (dir ? tr('ui.107') + dir + ' · ' : tr('ui.108')) + tr('ui.109'),
      value: tr('ui.105'),
      okText: tr('ui.110'),
      onOk: async (name) => {
        if (!name) return;
        const rel = (dir ? dir + '/' : '') + String(name).replace(/\.md$/i, '') + '.md';
        const r = this.plugin.extCreateNote(vault.path, rel, '');
        if (!r.ok) { new Notice(r.reason); return; }
        this.render();
        const idx = this.plugin.indexOf(vault.path);
        const note = (idx.files || []).filter((f) => f.relPath === rel)[0];
        if (note && !o.native) await this.openPreview(note, { expand: true, edit: true });
        else new Notice(tr('dialog.newNoteCreated') + ' (' + rel + ')');
      }
    });
  },

  /* 别的库里新建文件夹 */
  async extCreateFolder(vault, dir) {
    if (!this.plugin.vaultWritable(vault.path)) {
      new Notice(tr('ui.86'));
      return;
    }
    const base = typeof dir === 'string' ? dir : this.folderPath;
    this.promptText({
      title: tr('dialog.newFolderInVault', { name: vault.name }),
      value: tr('ui.113'),
      okText: tr('ui.110'),
      onOk: (name) => {
        if (!name) return;
        const rel = (base ? base + '/' : '') + name;
        const r = this.plugin.extCreateFolder(vault.path, rel);
        if (!r.ok) { new Notice(r.reason); return; }
        new Notice(tr('ui.114') + rel);
        this.render();
      }
    });
  },

  /* 新建文件夹：和新建笔记一样落在当前目录（工具条下拉里的第二项） */
  async createFolder(dir) {
    const vault = this.selectedVaultInfo();
    if (!vault) return;
    if (this.plugin.indexOf(vault.path).external) {
      await this.extCreateFolder(vault, dir);
      return;
    }
    const base = typeof dir === 'string' ? dir : this.folderPath;
    let name = tr('ui.113');
    let target = base ? base + '/' + name : name;
    let i = 1;
    while (this.plugin.app.vault.getAbstractFileByPath(target)) {
      i++;
      target = (base ? base + '/' + name + ' ' + i : name + ' ' + i);
    }
    try {
      await this.plugin.app.vault.createFolder(target);
      this.plugin.logOp({ type: 'create-folder', path: target });
      new Notice(tr('ui.114') + target);
      this.render();
    } catch (e) {
      new Notice(tr('ui.115') + (e && e.message ? e.message : e));
    }
  },

  /* 工具条「＋ 新建」下拉：新建文件（默认在工作台内编辑）/ 新建文件夹 */
  renderNewMenu() {
    const pop = this.newMenuPopEl;
    if (!pop) return;
    pop.empty();
    pop.className = 'vwb-menu-pop vwb-newmenu-pop vwb-glass' + (this.newMenuOpen ? ' is-on' : '');
    const dir = this.folderPath || '';
    pop.createDiv({ cls: 'vwb-newmenu-hd', text: dir ? tr('ui.111') + dir : tr('ui.112') });
    for (const it of NEW_MENU) {
      const row = pop.createDiv({ cls: 'vwb-menu-i' });
      const hd = row.createDiv({ cls: 'vwb-menu-i-hd' });
      // ⚠ 常量表在模块加载时求值，语言切换后不会重算 ——
      // 所以 UI 文案必须在这里取（词典 key = editorMenu.<id>），不能写进常量表
      const nm = tr('editorMenu.' + it.id) || it.label;
      hd.createEl('span', { cls: 'vwb-menu-i-nm', text: it.ico + ' ' + nm });
      row.createDiv({ cls: 'vwb-menu-i-ds', text: tr(it.tip) });
      row.setAttribute('title', tr(it.tip));
      row.addEventListener('click', (e) => {
        if (e && e.stopPropagation) e.stopPropagation();
        this.newMenuOpen = false;
        this.renderNewMenu();
        this.render();
        if (it.id === 'new-file') this.createNote();
        else this.createFolder();
      });
    }
    if (this.newMenuOpen) this.placeNewMenu();
  },

  /* 「＋ 新建」弹层的位置：默认贴按钮右边缘（CSS 里的 right:0），
   * 主区放不下就往左夹 —— 保证整块都在主区里，不会冲出右边界被裁掉一半。
   * 只认按钮和主区的 rect：不要拿弹层自己的 rect，那会随宽度变化来回抖。 */
  placeNewMenu() {
    const pop = this.newMenuPopEl;
    const wrap = this.newMenuWrapEl;
    if (!pop || !wrap || !this.mainEl) return;
    if (typeof wrap.getBoundingClientRect !== 'function') return;
    try {
      const mr = this.mainEl.getBoundingClientRect();
      const br = wrap.getBoundingClientRect();
      if (!mr || !br || !mr.width || !br.width) return; // 量不到就沿用 CSS 默认
      const pad = 8;
      const w = Math.max(180, Math.min(268, mr.width - pad * 2));
      pop.style.width = w + 'px';
      pop.style.right = 'auto';
      const wrapLeft = br.left - mr.left;
      // 右边缘超出主区多少，就往左推多少；但最多推到左边留出 pad
      const overflow = wrapLeft + w - (mr.width - pad);
      const limit = Math.max(0, wrapLeft - pad);
      pop.style.left = (overflow > 0 ? -Math.min(overflow, limit) : 0) + 'px';
    } catch (e) { /* 忽略：沿用 CSS 默认位置 */ }
  },

  /* 刚建出来的文件要变成视图内部认的 note 结构（和 buildCurrentIndex 对齐） */
  noteOf(file, relPath) {
    const vault = this.selectedVaultInfo();
    const root = vault ? String(vault.path).replace(/\\/g, '/') : '';
    const segs = String(relPath).split('/');
    const name = segs.pop();
    const folder = (file && file.parent && file.parent.path != null) ? file.parent.path : segs.join('/');
    const ext = name.indexOf('.') >= 0 ? '.' + name.split('.').pop().toLowerCase() : '';
    return {
      id: relPath,
      file: file,
      name: name,
      relPath: relPath,
      absPath: root ? root + '/' + relPath : '',
      folder: folder,
      size: 0,
      mtime: Date.now(),
      ctime: Date.now(),
      ext: ext,
      tags: [],
      external: false
    };
  }
});

/* -------------------------------------------------------------------------
 *  工作台视图 · 工作台内编辑器 — 块解析 + 头部权限 + 读写方式 + 编辑器搭建 + 单画布核心
 *    live   → 单画布即时渲染（默认，Typora 手感：点哪改哪，改完即渲染）
 *    split  → 源码 + 实时渲染双栏（滚动同步）
 *    source → 纯源码
 *  textarea.vwb-editor 始终是「源码真源」，保存链路只有一条；
 *  单画布只是它的一层可视化编辑层。
 *  （本片段由 build.js 拼进 main.js，不要单独 require）
 * ------------------------------------------------------------------------- */

/* ---------------------------------------------------------------------------
 * 把 Markdown 源码切成「块」。
 * 每个块记录自己的原始行区间 raw，块与块首尾相接 ——
 * blocks.map(b => b.raw).join('\n') 能 100% 还原原文，所以整篇改写不会丢格式。
 * ------------------------------------------------------------------------- */
function parseBlocks(src) {
  const lines = String(src == null ? '' : src).split('\n');
  const blocks = [];
  const isBlank = (l) => /^\s*$/.test(l);
  const isFence = (l) => /^\s{0,3}(```|~~~)/.test(l);
  const isHeading = (l) => /^\s{0,3}#{1,6}\s/.test(l);
  const isHr = (l) => /^\s{0,3}(?:(?:-\s*){3,}|(?:\*\s*){3,}|(?:_\s*){3,})$/.test(l);
  const isQuote = (l) => /^\s{0,3}>/.test(l);
  const isList = (l) => /^\s{0,3}(?:[-*+]|\d+[.)])\s/.test(l);
  const isTableRow = (l) => /^\s*\|/.test(l);
  const isTableSep = (l) => /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(l) && l.indexOf('-') >= 0;
  const isIndented = (l) => /^(?:\t| {2,})\S/.test(l);
  const push = (type, j, extra) => {
    blocks.push(Object.assign({ type, raw: lines.slice(j[0], j[1]).join('\n'), start: j[0], end: j[1] }, extra || {}));
  };

  let i = 0;
  // 首行是 --- / +++ 时当成 frontmatter 整块保留
  if (lines.length && /^(---|\+\+\+)\s*$/.test(lines[0])) {
    let j = 1;
    while (j < lines.length && !/^(---|\+\+\+)\s*$/.test(lines[j])) j++;
    j = Math.min(j + 1, lines.length);
    push('frontmatter', [0, j]);
    i = j;
  }

  while (i < lines.length) {
    const line = lines[i];

    if (isBlank(line)) {
      let j = i;
      while (j < lines.length && isBlank(lines[j])) j++;
      push('blank', [i, j]);
      i = j;
      continue;
    }
    if (isFence(line)) {
      const mark = line.trim().slice(0, 3);
      let j = i + 1;
      while (j < lines.length && !new RegExp('^\\s*' + mark).test(lines[j])) j++;
      j = Math.min(j + 1, lines.length);
      push('code', [i, j]);
      i = j;
      continue;
    }
    if (isHeading(line)) {
      const m = line.match(/^\s{0,3}(#{1,6})\s/);
      push('heading', [i, i + 1], { level: m ? m[1].length : 1 });
      i += 1;
      continue;
    }
    if (isTableRow(line) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      let j = i + 2;
      while (j < lines.length && isTableRow(lines[j]) && !isBlank(lines[j])) j++;
      push('table', [i, j]);
      i = j;
      continue;
    }
    if (isHr(line)) {
      push('hr', [i, i + 1]);
      i += 1;
      continue;
    }
    if (isQuote(line)) {
      let j = i + 1;
      while (j < lines.length && (isQuote(lines[j]) || isIndented(lines[j]))) j++;
      push('quote', [i, j]);
      i = j;
      continue;
    }
    if (isList(line)) {
      let j = i + 1;
      while (j < lines.length) {
        if (isList(lines[j]) || isIndented(lines[j])) { j++; continue; }
        if (isBlank(lines[j]) && j + 1 < lines.length && (isList(lines[j + 1]) || isIndented(lines[j + 1]))) { j++; continue; }
        break;
      }
      push('list', [i, j]);
      i = j;
      continue;
    }
    // 普通段落：吃到空行或下一个块级语法起始
    let j = i + 1;
    while (j < lines.length) {
      const l = lines[j];
      if (isBlank(l) || isFence(l) || isHeading(l) || isHr(l) || isQuote(l) || isList(l)) break;
      if (isTableRow(l) && j + 1 < lines.length && isTableSep(lines[j + 1])) break;
      j++;
    }
    push('paragraph', [i, j]);
    i = j;
  }
  return blocks;
}

/* 从标题源码里取纯文本（给大纲用） */
function headingText(raw) {
  return String(raw == null ? '' : raw)
    .replace(/^\s*#{1,6}\s*/, '')
    .replace(/\s*#*\s*$/, '')
    .replace(/[*_`\[\]]/g, '')
    .trim();
}

/* 这几条命令作用在「浏览器选区 / 当前文件」上，阅读态没有输入框也能用 */
const READONLY_CMDS = new Set(['copy-sel', 'copy-all', 'select-all-doc', 'copy-path']);

Object.assign(WorkbenchView.prototype, {
  /* ------------------------------------------------- 头部按钮可见性 / 权限 */
  syncDocTools() {
    if (!this.docModeEl) return;
    const editable = this.canEdit(this.selectedNote);
    this.docModeEl.style.display = editable ? '' : 'none';
    this.docModeEl.setText(this.docMode === 'edit' ? tr('editor.read') : tr('editor.edit'));
    if (this.docModeEl.classList && this.docModeEl.classList.toggle) {
      this.docModeEl.classList.toggle('is-on', this.docMode === 'edit');
    }
    // 大纲：markdown 文件在「阅读」和「编辑」两种模式下都能用
    if (this.outlineBtn) {
      const ok = this.prevKind === 'markdown' && (this.docMode === 'read' || this.docMode === 'edit');
      this.outlineBtn.style.display = ok ? '' : 'none';
    }
  },

  canEdit(note) {
    if (!note) return false;
    const k = fileKind(note.ext);
    if (k !== 'markdown' && k !== 'text') return false;
    return note.external ? !!note.absPath : !!note.file;
  },

  /* ------------------------------------------------------- 读写方式（三选一） */
  editorMode() {
    const e = this.plugin.settings.editor || {};
    return editorModeOf(e.mode).id;
  },

  setEditorMode(m) {
    if (!this.plugin.settings.editor) this.plugin.settings.editor = { mode: 'live', syncScroll: true };
    this.plugin.settings.editor.mode = editorModeOf(m).id;
    this.plugin.saveSettings();
    if (this.docMode === 'edit') {
      this.buildEditor(this.selectedNote);
    }
  },

  /* 在阅读态和编辑态之间切换（不离开工作台） */
  setDocMode(mode) {
    const note = this.selectedNote;
    const next = mode || (this.docMode === 'edit' ? 'read' : 'edit');
    if (next === 'edit' && !this.canEdit(note)) {
      new Notice(tr('editor.notEditable'));
      return;
    }
    if (this.docMode === 'edit' && next === 'read') {
      // 源码真源已经在 input 时同步，这里只做收尾清理
      this.dropEmptyPending();
      this.flushDocSave();
      if (this.liveTimer) { clearTimeout(this.liveTimer); this.liveTimer = null; }
      this.closeEditorMenu();
      this.disposeCanvas();
      this.editorEl = null;
      this.liveEl = null;
      this.canvasEl = null;
    }
    this.docMode = next;
    if (next === 'edit') {
      // 编辑态需要横向空间，窄面板先铺满
      if (!this.prevMax) this.togglePreviewMax(true);
      this.toggleOutline(false);
    }
    this.syncDocTools();
    this.syncDocStatus();
    this.buildPreviewFoot(note); // 底栏按钮随阅读/编辑态变
    this.renderDocBody();
  },

  async renderDocBody() {
    const note = this.selectedNote;
    if (!note) return;
    if (this.docMode === 'edit' && this.canEdit(note)) {
      this.prevBodyEl.className = 'vwb-prev-body vwb-doc is-editing';
      return this.buildEditor(note);
    }
    this.prevBodyEl.className = 'vwb-prev-body vwb-doc';
    // 阅读态正文也能右键复制（拖选 → 右键 → 复制选中文本）
    this.bindReadMenu();
    return this.renderPreviewBody(note);
  },

  /* ------------------------------------------------------------- 编辑器搭建 */
  async buildEditor(note) {
    const body = this.prevBodyEl;
    body.empty();
    // 阅读态时 body 是可滚动容器，滚到正文末尾再点「编辑」会把这个滚动位置带过来，
    // 看起来就像「一进编辑就定位到最底部」——先显式归零。
    try { body.scrollTop = 0; } catch (e) { /* 忽略 */ }
    if (this.prevMainEl) { try { this.prevMainEl.scrollTop = 0; } catch (e) { /* 忽略 */ } }
    let text = '';
    try {
      text = note.external
        ? fs.readFileSync(note.absPath, 'utf8')
        : await this.plugin.app.vault.read(note.file);
    } catch (e) {
      body.createDiv({ cls: 'vwb-empty', text: tr('ui.138') + (e && e.message ? e.message : e) });
      return;
    }

    const mode = this.editorMode();
    this.editingBlock = null;
    this.blockTa = null;
    this.blocks = [];
    this.blockEls = [];
    this.canvasEl = null;
    this.liveEl = null;
    this.pendingRollback = null;

    const wrap = body.createDiv({ cls: 'vwb-edit' });
    wrap.setAttribute('data-mode', mode);
    this.editWrapEl = wrap;

    /* 顶栏：书写方式三选一 + 格式菜单 + 提示 */
    const bar = wrap.createDiv({ cls: 'vwb-edit-bar' });
    bar.createDiv({ cls: 'vwb-edit-t', text: tr('ui.139') });
    const chips = bar.createDiv({ cls: 'vwb-chips' });
    for (const m of EDITOR_MODES) {
      const c = chips.createDiv({ cls: 'vwb-chip' + (m.id === mode ? ' is-on' : ''), text: tr(m.chip) });
      c.setAttribute('title', tr(m.label) + '：' + tr(m.tip));
      c.addEventListener('click', () => this.setEditorMode(m.id));
    }
    const fmtBtn = bar.createEl('button', { cls: 'vwb-btn vwb-btn-sm vwb-fmt-btn', text: tr('ui.140') });
    fmtBtn.setAttribute('title', tr('ui.141'));
    // 点按钮不能让正在编辑的那一段失焦：一失焦就提交重绘，菜单命令会落到已经被换掉的输入框上
    fmtBtn.addEventListener('mousedown', (e) => {
      if (e.preventDefault) e.preventDefault();
    });
    fmtBtn.addEventListener('click', (e) => {
      if (e.stopPropagation) e.stopPropagation();
      let x = 20, y = 40;
      try {
        if (fmtBtn.getBoundingClientRect) {
          const r = fmtBtn.getBoundingClientRect();
          x = r.left; y = r.bottom;
        }
      } catch (err) { /* 用兜底坐标 */ }
      // 正在改某一段时，菜单就当作用在这一段上（和右键点它一样）
      this.showEditorMenu({ clientX: x, clientY: y }, null, this.editingBlock == null ? null : this.editingBlock);
    });
    bar.createDiv({
      cls: 'vwb-edit-hint',
      text: mode === 'live'
        ? tr('ui.142')
        : (mode === 'split' ? tr('ui.143') : tr('ui.144'))
    });

    /* 正文区：三种模式共用一行容器（split 是双栏，live/source 是单栏） */
    const main = wrap.createDiv({ cls: 'vwb-edit-main' });

    /* 源码真源：始终存在，保存链路只认它 */
    const ta = main.createEl('textarea', { cls: 'vwb-editor' });
    ta.value = text;
    this.editorEl = ta;
    ta.addEventListener('input', () => this.onSourceInput(ta));
    ta.addEventListener('keydown', (e) => this.onEditorKey(e, ta, false));
    ta.addEventListener('contextmenu', (e) => {
      if (e.preventDefault) e.preventDefault();
      this.showEditorMenu(e, ta);
    });

    if (mode === 'split') {
      this.liveEl = main.createDiv({ cls: 'vwb-live' });
      if (this.plugin.settings.editor.syncScroll !== false) this.bindScrollSync();
      // 首帧必须自己渲染一次：以前只绑了滚动同步、没渲染，
      // 结果右栏一直是空的（看起来就像「双栏只有一栏」）。
      await this.renderLivePreview();
    } else if (mode === 'live') {
      this.canvasEl = main.createDiv({ cls: 'vwb-canvas' });
      // 点画布空白 = 在文末新建一段（Typora 里点正文下方空白也是这个行为）
      this.canvasEl.addEventListener('click', (e) => {
        const t = e && e.target;
        if (t && t !== this.canvasEl) return;
        if (this.hasDomSelection()) return; // 刚拖选完正文，别顺手新建一段
        this.appendBlockAtEnd();
      });
      // 在正文空白处右键 = 对整篇操作（落点由 menuTarget 决定：放到文末）
      this.canvasEl.addEventListener('contextmenu', (e) => {
        const t = e && e.target;
        if (t && t !== this.canvasEl) return;
        if (e.preventDefault) e.preventDefault();
        this.showEditorMenu(e, null);
      });
      await this.renderCanvas();
    } else {
      // 纯源码模式：大纲直接由源码行号推算，点标题能把光标送过去
      this.syncSourceHeadings(text);
    }

    this.syncDocStatus();
    this.resetEditorCaret(ta);
    if (this.outlineOpen) this.renderOutline();
  },

  /* 纯源码 / 双栏模式下的大纲：先按行号记住位置 */
  syncSourceHeadings(text) {
    const list = [];
    for (const b of parseBlocks(text)) {
      if (b.type !== 'heading') continue;
      list.push({ level: b.level || 1, text: headingText(b.raw), el: null, line: b.start });
    }
    this.docHeadings = list;
  },

  /* 没有对应 DOM 时（纯源码 / 双栏），按「第几行」把光标和滚动送过去 */
  jumpToHeading(h) {
    const ta = this.editorEl;
    if (!h || h.line == null || !ta) return;
    const lines = String(ta.value == null ? '' : ta.value).split('\n');
    let off = 0;
    for (let i = 0; i < h.line && i < lines.length; i++) off += lines[i].length + 1;
    try { ta.setSelectionRange(off, off); } catch (e) { /* 忽略 */ }
    try { if (typeof ta.focus === 'function') ta.focus({ preventScroll: true }); } catch (e) { /* 忽略 */ }
    const total = lines.length || 1;
    try { ta.scrollTop = Math.round((h.line / total) * (ta.scrollHeight || 0)); } catch (e) { /* 忽略 */ }
    if (this.liveEl) {
      try { this.liveEl.scrollTop = Math.round((h.line / total) * (this.liveEl.scrollHeight || 0)); } catch (e) { /* 忽略 */ }
    }
  },

  /* 进入编辑不要「定位到文末」：显式把光标和滚动都拉回开头 */
  resetEditorCaret(ta) {
    if (!ta) return;
    try {
      if (typeof ta.focus === 'function') {
        try { ta.focus({ preventScroll: true }); } catch (e) { ta.focus(); }
      }
    } catch (e) { /* 忽略 */ }
    try { if (ta.setSelectionRange) ta.setSelectionRange(0, 0); } catch (e) { /* 忽略 */ }
    try { ta.scrollTop = 0; } catch (e) { /* 忽略 */ }
    if (this.canvasEl) { try { this.canvasEl.scrollTop = 0; } catch (e) { /* 忽略 */ } }
  },

  /* ------------------------------------------- 单画布（即时渲染）核心 */
  /* 卸载单画布上所有块渲染时注册的子组件（离开编辑态 / 整篇重绘前调用） */
  disposeCanvas() {
    for (const holder of this.blockEls || []) {
      if (!holder) continue;
      if (holder._vwbChild && typeof holder._vwbChild.unload === 'function') {
        try { holder._vwbChild.unload(); } catch (e) { /* 忽略 */ }
      }
      holder._vwbChild = null;
    }
    this.blockEls = [];
    this.blocks = [];
    this.editingBlock = null;
    this.blockTa = null;
  },

  /* opt：
   *   blocks → 直接拿这份「块清单」来画（新建空段时用：源码里还没有它，parse 不出来）
   *   target → 画完之后要把哪一块交给 editBlock
   * 返回 target（没给就是 -1）。 */
  async renderCanvas(opt) {
    const canvas = this.canvasEl;
    if (!canvas) return -1;
    const p = this._renderCanvas(canvas, opt || null);
    this.canvasBusy = p;
    const clear = () => { if (this.canvasBusy === p) this.canvasBusy = null; };
    return p.then((t) => { clear(); return t; }, () => { clear(); return -1; });
  },

  async _renderCanvas(canvas, opt) {
    this.disposeCanvas();
    canvas.empty();
    const note = this.selectedNote;
    if (opt && Array.isArray(opt.blocks)) {
      this.blocks = opt.blocks;
    } else {
      this.blocks = parseBlocks(this.editorEl ? this.editorEl.value : '');
    }
    this.blockEls = [];
    this.editingBlock = null;
    for (let i = 0; i < this.blocks.length; i++) {
      const b = this.blocks[i];
      const cls = ['vwb-blk', 'vwb-blk-' + b.type];
      if (b.type === 'blank') cls.push('is-blank');
      if (b.pending) cls.push('is-pending');
      const holder = canvas.createDiv({ cls: cls.join(' ') });
      holder.setAttribute('data-idx', String(i));
      holder.setAttribute('title',
        b.pending ? tr('ui.145')
          : (b.type === 'blank' ? tr('ui.146') : tr('ui.147')));
      this.blockEls.push(holder);
      await this.renderBlockInto(holder, b, note);
      holder.addEventListener('click', (e) => this.onBlockClick(e, i));
      holder.addEventListener('contextmenu', (e) => {
        if (e.preventDefault) e.preventDefault();
        this.showEditorMenu(e, null, i);
      });
    }
    this.syncCanvasHeadings();
    if (this.outlineOpen) this.renderOutline();
    return (opt && typeof opt.target === 'number') ? opt.target : -1;
  },

  /* 新建一段时用的「空段落占位」。
   * Markdown 源码里没有「空段落」，所以 Neighbour 空词组必须自带前后各一个空行，
   * 否则用户一打草稿就会粘到相邻段落里去 —— 这是「新段 Zen 内容与源码不对版」的根源。 */
  makePendingBlocks(list, atIdx) {
    const mk = (type, raw, extra) =>
      Object.assign({ type, raw, start: -1, end: -1 }, extra || {});
    const out = list.slice();
    let at = Math.max(0, Math.min(atIdx + 1, out.length));
    // ① 新段前面得有一个空行把它和上一段分开
    if (!(out[at] && out[at].type === 'blank')) out.splice(at, 0, mk('blank', ''));
    at++;
    // ② 新段本身
    const target = at;
    out.splice(at, 0, mk('paragraph', '', { pending: true }));
    at++;
    // ③ 新段后面也得有一个空行（已经是文末、或者本来就有空行的就不加）
    if (at < out.length && !(out[at] && out[at].type === 'blank')) out.splice(at, 0, mk('blank', ''));
    return { blocks: out, target };
  },

  async renderBlockInto(holder, b, note) {
    if (!holder) return;
    // 每个块一块独立的 Component：重绘前先卸载上一轮，避免 MarkdownRenderer
    // 注册的子组件（图片嵌入 / 内链等）在反复提交后越堆越多。
    if (holder._vwbChild && typeof holder._vwbChild.unload === 'function') {
      try { holder._vwbChild.unload(); } catch (e) { /* 忽略 */ }
    }
    holder._vwbChild = null;
    holder.empty();
    if (holder.classList) holder.classList.remove('is-editing');
    if (b.type === 'blank') {
      holder.createDiv({ cls: 'vwb-blk-gap' });
      return;
    }
    let child = null;
    try {
      child = new Component();
      if (typeof child.load === 'function') child.load();
    } catch (e) { child = null; }
    holder._vwbChild = child;
    const notePath = (note && note.external) ? note.absPath : (note ? note.relPath : '');
    try {
      await MarkdownRenderer.render(this.plugin.app, b.raw, holder, notePath, child || this);
    } catch (e) {
      try { await MarkdownRenderer.renderMarkdown(b.raw, holder, notePath, child || this); }
      catch (e2) { holder.setText(b.raw); }
    }
    try { this.fixupRenderedContent(holder, note); } catch (e) { /* 忽略 */ }
  },

});

/* -------------------------------------------------------------------------
 *  工作台视图 · 工作台内编辑器 — 浏览器选区 + 块编辑 + 输入 + 命令实现 + 剪贴板
 *  （本片段由 build.js 拼进 main.js，不要单独 require）
 * ------------------------------------------------------------------------- */Object.assign(WorkbenchView.prototype, {
  /* --------------------------------------------------------- 浏览器选区
   * 单画布里的正文是「渲染好的 HTML」而不是输入框，选区归浏览器管。
   * 这两件事全靠它：①拖选中的时候别误判成「点了一下 → 进编辑态」；
   * ②右键菜单里的「复制选中文本」。 */
  domSelection() {
    try {
      const w = (typeof window !== 'undefined') ? window : null;
      if (w && typeof w.getSelection === 'function') return w.getSelection();
      if (typeof getSelection === 'function') return getSelection();
    } catch (e) { /* 忽略 */ }
    return null;
  },

  hasDomSelection() {
    const sel = this.domSelection();
    if (!sel) return false;
    try {
      if (typeof sel.isCollapsed === 'boolean') return !sel.isCollapsed;
      return !!String(sel.toString ? sel.toString() : '').length;
    } catch (e) { return false; }
  },

  domSelectionText() {
    const sel = this.domSelection();
    if (!sel) return '';
    try { return String(sel.toString ? sel.toString() : ''); } catch (e) { return ''; }
  },

  /* 全选正文：单画布 / 阅读态都能用（选区挂到那一块容器上）。
   * 源码 / 双栏模式里正文是 textarea，浏览器选区管不着，返回 false 交给输入框自己全选。 */
  selectAllDoc() {
    const editCanvas = (this.docMode === 'edit' && this.canvasEl) ? this.canvasEl : null;
    if (this.docMode === 'edit' && !editCanvas) return false;
    const host = editCanvas || this.prevBodyEl;
    const sel = this.domSelection();
    if (!host || !sel) return false;
    try {
      if (typeof sel.selectAllChildren === 'function') {
        sel.selectAllChildren(host);
        return true;
      }
    } catch (e) { /* 落到下面的兜底 */ }
    try {
      if (typeof host.focus === 'function') {
        host.setAttribute('tabindex', '-1');
        host.focus();
        if (typeof document !== 'undefined' && document.execCommand) {
          document.execCommand('selectAll');
          return true;
        }
      }
    } catch (e) { /* 忽略 */ }
    return false;
  },

  /* 当前文档的 Markdown 原文（阅读态右键「复制整篇」用） */
  async docRawText() {
    if (this.editorEl) return String(this.editorEl.value == null ? '' : this.editorEl.value);
    const note = this.selectedNote;
    if (!note) return '';
    try {
      return note.external ? fs.readFileSync(note.absPath, 'utf8') : await this.plugin.app.vault.read(note.file);
    } catch (e) {
      return '';
    }
  },

  onBlockClick(e, i) {
    const t = e && e.target;
    if (t && typeof t.closest === 'function' && t.closest('a, input, button, textarea, .vwb-blk-ta')) return;
    // 用户是在「拖选正文」（选完想复制），不是想改这一段 —— 一进编辑态这次选区就没了
    if (this.hasDomSelection()) return;
    if (this.editingBlock === i) return;
    this.editBlock(i).catch(() => { /* 忽略 */ });
  },

  /* 点某一段 → 就地变成 textarea 改源码
   * caret：'end'（默认）/ 'start' / 数字偏移。跨块跳转时用来把光标放在对的位置。 */
  async editBlock(i, caret) {
    if (this.docMode !== 'edit') return null;
    // 上一次重绘 / 提交还没落地就先等 —— 否则刚建好的输入框会被它覆盖掉
    if (this.canvasBusy || this.commitBusy) {
      try {
        await Promise.all([this.canvasBusy, this.commitBusy].filter(Boolean));
      } catch (e) { /* 忽略 */ }
    }
    if (this.editingBlock != null && this.editingBlock !== i) await this.commitBlock();
    const holder = this.blockEls[i];
    const b = this.blocks[i];
    if (!holder || !b) return null;
    this.editingBlock = i;
    holder.empty();
    if (holder.classList) holder.classList.add('is-editing');
    const cls = ['vwb-blk-ta', 'vwb-ta-' + b.type];
    if (b.type === 'heading') cls.push('is-h' + (b.level || 1));
    const ta = holder.createEl('textarea', { cls: cls.join(' ') });
    // 刚新建的段落：占位用的换行不能让用户看见，所以填进去的是空串
    ta.value = b.pending ? String(b.raw == null ? '' : b.raw).replace(/\n/g, '') : b.raw;
    this.blockTa = ta;
    ta.addEventListener('input', () => {
      b.raw = ta.value;
      this.syncCanvasToSource();
      this.autoGrow(ta);
    });
    ta.addEventListener('keydown', (e) => this.onEditorKey(e, ta, true));
    ta.addEventListener('blur', () => this.commitBlock());
    ta.addEventListener('contextmenu', (e) => {
      if (e.preventDefault) e.preventDefault();
      this.showEditorMenu(e, ta, i);
    });
    this.autoGrow(ta);
    try { if (typeof ta.focus === 'function') ta.focus({ preventScroll: true }); } catch (e) { /* 忽略 */ }
    const len = String(ta.value == null ? '' : ta.value).length;
    let pos = len;
    if (caret === 'start') pos = 0;
    else if (typeof caret === 'number') pos = Math.max(0, Math.min(caret, len));
    try { if (ta.setSelectionRange) ta.setSelectionRange(pos, pos); } catch (e) { /* 忽略 */ }
    return ta;
  },

  /* 光标是不是在这一块的第一行 / 最后一行 / 末尾
   * 判断出来才能在「到边」时把焦点交给上/下一段，做出连续文档的手感。 */
  caretAtFirstLine(ta) {
    const v = String(ta && ta.value != null ? ta.value : '');
    const p = this.selRange(ta)[0];
    return v.slice(0, p).indexOf('\n') < 0;
  },

  caretAtLastLine(ta) {
    const v = String(ta && ta.value != null ? ta.value : '');
    const p = this.selRange(ta)[1];
    return v.indexOf('\n', p) < 0;
  },

  caretAtEnd(ta) {
    const v = String(ta && ta.value != null ? ta.value : '');
    const r = this.selRange(ta);
    return r[0] === r[1] && r[0] === v.length;
  },

  /* 焦点交给上/下一段（先把当前这段提交掉；跳过纯空行块，做出连续文档的手感） */
  async moveBlockFocus(delta, caret) {
    const idx = this.editingBlock;
    if (idx == null) return;
    const ta = this.blockTa;
    if (ta && this.blocks[idx]) this.blocks[idx].raw = String(ta.value == null ? '' : ta.value);
    await this.commitBlock();
    const list = this.blocks || [];
    let n = idx + delta;
    while (n >= 0 && n < list.length && list[n].type === 'blank') n += delta;
    if (n < 0 || n >= list.length) return;
    await this.editBlock(n, caret || 'start');
  },

  /* 段尾回车 = 空出新的一段给用户接着写（Typora 的连续书写手感） */
  async splitBlockAfter() {
    const idx = this.editingBlock;
    if (idx == null) return;
    const ta = this.blockTa;
    const b = this.blocks[idx];
    if (!b) return;
    if (ta) b.raw = String(ta.value == null ? '' : ta.value);
    // 收尾时把行尾空白也带走：回车换行写的是「行尾两个空格 + 换行」，不能留在段尾
    b.raw = String(b.raw == null ? '' : b.raw).replace(/\s+$/, '');
    // 连着按回车：上一段还是没写字的空段就让它转正，再往后空一段（不会出现满屏空行）
    if (b.pending && !b.raw.trim()) {
      b.pending = false;
      this.pendingRollback = null;
    }
    const prevSource = String(this.editorEl.value == null ? '' : this.editorEl.value);
    const made = this.makePendingBlocks(this.blocks, idx);
    this.editorEl.value = made.blocks.map((x) => x.raw).join('\n');
    this.pendingRollback = { source: prevSource };
    this.docDirty = true;
    this.syncDocStatus();
    this.scheduleDocSave();
    this.editingBlock = null;
    this.blockTa = null;
    const top = this.canvasEl ? this.canvasEl.scrollTop : 0;
    const target = await this.renderCanvas({ blocks: made.blocks, target: made.target });
    if (this.canvasEl) { try { this.canvasEl.scrollTop = top; } catch (e) { /* 忽略 */ } }
    await this.editBlock(target, 'start');
  },

  /* 段首退格 = 并到上一段（中间隔着空行的，直接跳过空行并到最近的一段） */
  async mergeBlockUp() {
    const idx = this.editingBlock;
    if (idx == null || idx <= 0) return;
    const ta = this.blockTa;
    if (ta && this.blocks[idx]) this.blocks[idx].raw = String(ta.value == null ? '' : ta.value);
    let j = idx - 1;
    while (j > 0 && this.blocks[j].type === 'blank') j--;
    const prev = this.blocks[j];
    const cur = this.blocks[idx];
    if (!prev || !cur || prev === cur || prev.type === 'blank') return;
    const pv = prev.raw.replace(/\s+$/, '');
    const cv = cur.raw.replace(/^\n+/, '');
    let joiner = '\n';
    if (prev.type === 'heading') joiner = '';
    else if (prev.type === 'paragraph' && cur.type === 'paragraph') joiner = ' ';
    prev.raw = pv + joiner + cv;
    const caret = (pv + joiner).length;
    this.blocks.splice(j + 1, idx - j); // 去掉中间的空行块和这一块本身
    this.editorEl.value = this.blocks.map((x) => x.raw).join('\n');
    this.docDirty = true;
    this.syncDocStatus();
    this.scheduleDocSave();
    this.editingBlock = null;
    this.blockTa = null;
    const top = this.canvasEl ? this.canvasEl.scrollTop : 0;
    await this.renderCanvas();
    if (this.canvasEl) { try { this.canvasEl.scrollTop = top; } catch (e) { /* 忽略 */ } }
    await this.editBlock(Math.max(0, j), caret);
  },

  /* 点画布空白（正文下方那片空） = 在文末新建一段 */
  async appendBlockAtEnd() {
    if (this.docMode !== 'edit' || !this.editorEl) return;
    if (this.editingBlock != null) await this.commitBlock();
    const prevSource = String(this.editorEl.value == null ? '' : this.editorEl.value);
    // 文末只要一个前导空行：
    // 最后一个块是空行说明正文已经收尾，直接拿它当分隔符；否则补一个。
    const list = (this.blocks || []).slice();
    const last = list[list.length - 1];
    if (!(last && last.type === 'blank')) {
      list.push({ type: 'blank', raw: '', start: -1, end: -1 });
    }
    list.push({ type: 'paragraph', raw: '', start: -1, end: -1, pending: true });
    const target = list.length - 1;
    this.editorEl.value = list.map((x) => x.raw).join('\n');
    this.pendingRollback = { source: prevSource };
    this.docDirty = true;
    this.syncDocStatus();
    this.scheduleDocSave();
    const got = await this.renderCanvas({ blocks: list, target });
    await this.editBlock(got >= 0 ? got : target, 'start');
  },

  /* 块的 textarea 高度跟着内容长（高度自适应，才不会出现内部滚动条那种「盒子感」） */
  autoGrow(ta) {
    if (!ta || !ta.style) return;
    try {
      const v = String(ta.value == null ? '' : ta.value);
      const w = ta.clientWidth || 640;
      const per = Math.max(16, Math.floor(w / 7.6));
      const lines = v.split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(l.length / per)), 0);
      let lh = 23;
      if (ta.classList && typeof ta.classList.contains === 'function') {
        if (ta.classList.contains('is-h1')) lh = 26;
        else if (ta.classList.contains('is-h2')) lh = 24;
        else if (ta.classList.contains('is-h3')) lh = 23;
      }
      // 真机上直接量「这一行到底多高」，和渲染样式严格对齐（字号随块类型变）
      try {
        if (typeof getComputedStyle === 'function') {
          const cs = getComputedStyle(ta);
          const v = parseFloat(cs && cs.lineHeight);
          if (v && isFinite(v) && v > 0) lh = v;
        }
      } catch (e) { /* 忽略，用兜底行高 */ }
      ta.style.height = Math.max(22, lines * lh + 8) + 'px';
    } catch (e) { /* 忽略 */ }
  },

  /* 块内容 → 源码真源（保存链路只认 textarea.vwb-editor） */
  syncCanvasToSource() {
    if (!this.editorEl || !this.blocks) return;
    this.editorEl.value = this.blocks.map((b) => b.raw).join('\n');
    this.docDirty = true;
    this.syncDocStatus();
    this.scheduleDocSave();
  },

  /* 源码真源被整篇改动了（右键菜单作用在全篇时）—— 画布得跟着重画一遍 */
  async syncCanvasFromSource() {
    if (!this.canvasEl) return;
    const top = this.canvasEl.scrollTop || 0;
    await this.renderCanvas();
    if (this.canvasEl) { try { this.canvasEl.scrollTop = top; } catch (e) { /* 忽略 */ } }
  },

  /* 空出来的新段落一个字都没写（正在写或刚写完就被别的操作打断）→ 把源码还原回去，
   * 免得文件里留下一串没有意义的空行。保存之前、关闭预览之前都要走一遍。 */
  dropEmptyPending() {
    if (!this.pendingRollback || !this.editorEl) return;
    const b = this.editingBlock != null ? this.blocks[this.editingBlock] : null;
    if (b && b.pending && !String(b.raw == null ? '' : b.raw).trim()) {
      this.editorEl.value = this.pendingRollback.source;
      this.docDirty = true;
    }
    this.pendingRollback = null;
  },

  /* 结束这一段：能只重绘一段就只重绘一段，结构变了才整篇重绘 */
  commitBlock() {
    const p = this._commitBlock();
    this.commitBusy = p;
    const clear = () => { if (this.commitBusy === p) this.commitBusy = null; };
    return p.then(clear, clear);
  },

  async _commitBlock() {
    if (this.editingBlock == null) return;
    const idx = this.editingBlock;
    const pend = this.blocks[idx];
    const rollback = this.pendingRollback;
    this.editingBlock = null;
    this.blockTa = null;
    this.pendingRollback = null;
    // 刚空出来的新段一个字都没写就走了 → 撤掉它，源码里不留多余空行
    if (rollback && pend && pend.pending && !String(pend.raw == null ? '' : pend.raw).trim()) {
      this.editorEl.value = rollback.source;
      this.docDirty = true;
      this.syncDocStatus();
      this.scheduleDocSave();
      await this.renderCanvas();
      this.syncCanvasHeadings();
      if (this.outlineOpen) this.renderOutline();
      return;
    }
    const holder = this.blockEls[idx];
    const note = this.selectedNote;
    if (!holder || !note || !this.blocks.length) return;
    const fresh = parseBlocks(this.editorEl ? this.editorEl.value : '');
    const sameShape = fresh.length === this.blocks.length &&
      this.blocks.every((b, k) => k === idx || b.raw === fresh[k].raw);
    this.blocks = fresh;
    if (sameShape && this.blockEls.length === fresh.length && fresh[idx]) {
      await this.renderBlockInto(holder, fresh[idx], note);
    } else {
      const top = this.canvasEl ? this.canvasEl.scrollTop : 0;
      await this.renderCanvas();
      if (this.canvasEl) { try { this.canvasEl.scrollTop = top; } catch (e) { /* 忽略 */ } }
    }
    this.syncCanvasHeadings();
    if (this.outlineOpen) this.renderOutline();
  },

  /* 单画布的大纲：块类型直接就知道标题级别，比从 DOM 反推更准 */
  syncCanvasHeadings() {
    const list = [];
    for (let i = 0; i < this.blocks.length; i++) {
      const b = this.blocks[i];
      if (b.type !== 'heading') continue;
      const holder = this.blockEls[i] || null;
      let el = holder;
      try { if (holder && holder.querySelector) el = holder.querySelector('h' + b.level) || holder; } catch (e) { el = holder; }
      list.push({ level: b.level || 1, text: headingText(b.raw), el, blockIdx: i });
    }
    this.docHeadings = list;
  },

  /* --------------------------------------------------- textarea 输入与按键 */
  onSourceInput(ta) {
    this.docDirty = true;
    this.syncDocStatus();
    this.scheduleDocSave();
    if (this.editorMode() === 'split') { this.scheduleLivePreview(); return; }
    // 单画布：右键菜单作用在全篇时改的是源码真源，画布要跟着重画，
    // 否则用户看到的就是「点了菜单什么都没发生」（源码框在 live 模式是隐藏的）。
    if (this.editorMode() === 'live' && this.docMode === 'edit' && this.canvasEl) {
      this.syncCanvasFromSource();
    }
  },

  /* 任何一处改动之后统一收尾：同步真源 + 标脏 + 自动保存 */
  afterEdit(ta) {
    if (ta === this.editorEl) {
      this.onSourceInput(ta);
      return;
    }
    const idx = this.editingBlock;
    if (idx != null && this.blocks[idx]) this.blocks[idx].raw = String(ta.value == null ? '' : ta.value);
    this.syncCanvasToSource();
    this.autoGrow(ta);
  },

  async onEditorKey(e, ta, isBlock) {
    if (e.stopPropagation) e.stopPropagation();
    const k = String(e.key || '');
    const mod = !!(e.ctrlKey || e.metaKey);
    const shift = !!e.shiftKey;
    const alt = !!e.altKey;

    if (k === 'Escape') {
      if (e.preventDefault) e.preventDefault();
      if (isBlock) await this.commitBlock();
      else this.setDocMode('read');
      return;
    }
    if (mod && !shift && !alt && k.toLowerCase() === 's') {
      if (e.preventDefault) e.preventDefault();
      await this.flushDocSave();
      new Notice(tr('editor.saved'));
      return;
    }
    if (k === 'Tab') {
      if (e.preventDefault) e.preventDefault();
      this.insertText(ta, '  ');
      return;
    }

    /* 单画布的「连续书写」：到本段边界就把焦点交给上/下一段，
     * 不是一块一块地孤立操作。 */
    if (isBlock && !mod && !alt) {
      if (k === 'ArrowUp' && this.caretAtFirstLine(ta)) {
        if (e.preventDefault) e.preventDefault();
        await this.moveBlockFocus(-1, 'end');
        return;
      }
      if (k === 'ArrowDown' && this.caretAtLastLine(ta)) {
        if (e.preventDefault) e.preventDefault();
        await this.moveBlockFocus(1, 'start');
        return;
      }
      if (k === 'Enter') {
        const b = this.blocks[this.editingBlock];
        // 代码块 / 表格 / Front Matter 是「原样内容」，两种回车都只是换行
        const verbatim = b && (b.type === 'code' || b.type === 'table' || b.type === 'frontmatter');
        // Shift + Enter = 完成这一段，紧接着另起新的一段
        if (shift) {
          if (e.preventDefault) e.preventDefault();
          if (verbatim) this.insertText(ta, '\n');
          else await this.splitBlockAfter();
          return;
        }
        // 列表 / 引用：行尾回车自动续一行，空项上回车跳出这块去新建段
        if (b && !verbatim && (b.type === 'list' || b.type === 'quote') && this.caretAtEnd(ta)) {
          const lines = String(ta.value == null ? '' : ta.value).replace(/\n+$/, '').split('\n');
          const lastLine = lines[lines.length - 1] || '';
          const emptyItem = b.type === 'list'
            ? /^\s*(?:[-*+]|\d+[.)])\s*(?:\[\s?\]\s*)?$/.test(lastLine)
            : /^\s*>\s*$/.test(lastLine);
          if (e.preventDefault) e.preventDefault();
          if (emptyItem) {
            lines.pop();
            b.raw = lines.join('\n');
            ta.value = b.raw;
            this.syncCanvasToSource();
            await this.splitBlockAfter();
          } else {
            this.insertContinue(ta, b);
          }
          return;
        }
        // 其余情况：回车只做「换行」，不新建段。
        // 段落 / 标题写 Markdown 硬换行（行尾两个空格），否则渲染出来换行会被吃掉。
        if (e.preventDefault) e.preventDefault();
        this.insertText(ta, verbatim ? '\n' : '  \n');
        return;
      }
      if (k === 'Backspace' && this.editingBlock > 0) {
        const r = this.selRange(ta);
        if (r[0] === 0 && r[1] === 0) {
          if (e.preventDefault) e.preventDefault();
          await this.mergeBlockUp();
          return;
        }
      }
    }
    this.handleFormatKey(e, ta);
  },

  /* 列表 / 引用写到末尾直接回车：自动续一行同类前缀 */
  insertContinue(ta, b) {
    const lines = String(ta.value == null ? '' : ta.value).replace(/\n+$/, '').split('\n');
    const prev = lines[lines.length - 1] || '';
    let cont = '';
    if (b.type === 'quote') {
      const m = /^(\s*>\s?)/.exec(prev);
      cont = m ? m[1] : '> ';
    } else {
      const m = /^(\s*)(?:([-*+])|(\d+)[.)])(\s+\[\s?\]\s+|\s+)?/.exec(prev);
      const task = m && m[4] && m[4].indexOf('[') >= 0 ? '[ ] ' : '';
      if (m && m[2]) cont = m[1] + '- ' + task;
      else if (m && m[3]) cont = m[1] + (parseInt(m[3], 10) + 1) + '. ' + task;
      else cont = '- ';
    }
    this.insertText(ta, '\n' + cont);
  },

  /* 快捷键 → 命令（和右键菜单同一套 applyCmd） */
  handleFormatKey(e, ta) {
    if (!ta) return false;
    const k = String(e.key || '');
    const low = k.toLowerCase();
    const mod = !!(e.ctrlKey || e.metaKey);
    const shift = !!e.shiftKey;
    const alt = !!e.altKey;
    let cmd = null;

    if (alt && shift && (k === '5' || k === '%')) cmd = 'strike';
    if (!cmd && !mod && (!alt || !shift)) return false; // 其余都要带修饰键

    if (!cmd && mod && !alt) {
      if (!shift) {
        cmd = { '1': 'h1', '2': 'h2', '3': 'h3', '4': 'h4', '5': 'h5', '6': 'h6', '0': 'p' }[k] || null;
        if (!cmd) {
          if (low === 'b') cmd = 'bold';
          else if (low === 'i') cmd = 'italic';
          else if (low === 'u') cmd = 'underline';
          else if (low === 'k') cmd = 'link';
          else if (k === '`') cmd = 'code';
          else if (k === '=' || k === '+') cmd = 'hup';
          else if (k === '-' || k === '_') cmd = 'hdn';
          else if (k === '\\') cmd = 'clear';
        }
      } else {
        if (k === '`' || k === '~' || low === 'k') cmd = 'codeblock';
        else if (low === 'h') cmd = 'mark';
        else if (low === 'q') cmd = 'quote';
        else if (low === 'x') cmd = 'task';
        else if (low === 'm') cmd = 'math';
        else if (low === 't') cmd = 'table';
        else if (low === 'v') cmd = 'paste-plain';
        else if (k === '[' || k === '{') cmd = 'ol';
        else if (k === ']' || k === '}') cmd = 'ul';
        else if (k === '-' || k === '_') cmd = 'hr';
      }
    }
    if (!cmd) return false;
    if (e.preventDefault) e.preventDefault();
    this.applyCmd(cmd, ta);
    return true;
  },

  /* --------------------------------------------------------- 命令实现 */
  selRange(T) {
    let s = 0;
    let e = 0;
    const len = String(T && T.value != null ? T.value : '').length;
    try { s = T.selectionStart == null ? len : T.selectionStart; } catch (err) { s = len; }
    try { e = T.selectionEnd == null ? s : T.selectionEnd; } catch (err) { e = s; }
    return [Math.max(0, Math.min(s, len)), Math.max(0, Math.min(e, len))];
  },

  setSel(T, s, e) {
    try { T.selectionStart = s; T.selectionEnd = e; } catch (err) { /* 忽略 */ }
  },

  wrapSel(T, before, after, ph) {
    const r = this.selRange(T);
    const val = String(T.value == null ? '' : T.value);
    const inner = val.slice(r[0], r[1]) || ph || '';
    T.value = val.slice(0, r[0]) + before + inner + after + val.slice(r[1]);
    this.setSel(T, r[0] + before.length, r[0] + before.length + inner.length);
    this.afterEdit(T);
  },

  insertText(T, text) {
    const r = this.selRange(T);
    const val = String(T.value == null ? '' : T.value);
    T.value = val.slice(0, r[0]) + text + val.slice(r[1]);
    this.setSel(T, r[0] + text.length, r[0] + text.length);
    this.afterEdit(T);
  },

  insertBlock(T, text) {
    const r = this.selRange(T);
    const val = String(T.value == null ? '' : T.value);
    const pre = (r[0] > 0 && val.charAt(r[0] - 1) !== '\n') ? '\n\n' : '';
    T.value = val.slice(0, r[0]) + pre + text + '\n' + val.slice(r[1]);
    this.setSel(T, r[0] + pre.length + text.length, r[0] + pre.length + text.length);
    this.afterEdit(T);
  },

  prefixLines(T, prefix, kind) {
    const val = String(T.value == null ? '' : T.value);
    let r = this.selRange(T);
    if (r[0] === r[1]) {
      const s = val.lastIndexOf('\n', Math.max(0, r[0] - 1)) + 1;
      let e = val.indexOf('\n', r[0]);
      if (e < 0) e = val.length;
      r = [s, e];
    }
    const seg = val.slice(r[0], r[1]);
    // 注意顺序：任务列表 - [ ] 必须排在通用列表符之前，否则先被 [-*+]\s+ 吃掉
    const strip = /^(\s*)((?:-\s\[\s?\]\s+|#{1,6}\s+|>\s?|[-*+]\s+|\d+[.)]\s+)?)/;
    const allSame = seg.split('\n').every((l) => {
      const m = strip.exec(l);
      return ((m && m[2]) || '').trim() === String(prefix).trim();
    });
    const out = seg.split('\n').map((l) => {
      const m = strip.exec(l);
      const body = l.slice(m[0].length);
      return allSame && kind !== 'p' ? m[1] + body : m[1] + prefix + body;
    }).join('\n');
    T.value = val.slice(0, r[0]) + out + val.slice(r[1]);
    this.setSel(T, r[0], r[0] + out.length);
    this.afterEdit(T);
  },

  /* 提升 / 降低标题级别（正文 → 一级 → 二级…，降到 0 就回到正文） */
  shiftHeading(T, delta) {
    const val = String(T.value == null ? '' : T.value);
    let r = this.selRange(T);
    if (r[0] === r[1]) {
      const s = val.lastIndexOf('\n', Math.max(0, r[0] - 1)) + 1;
      let e = val.indexOf('\n', r[0]);
      if (e < 0) e = val.length;
      r = [s, e];
    }
    const out = val.slice(r[0], r[1]).split('\n').map((l) => {
      const m = /^(\s*)(#{1,6}\s+)?([\s\S]*)$/.exec(l) || [];
      const indent = m[1] || '';
      const hashes = m[2] ? m[2].replace(/\s+$/, '').length : 0;
      const body = m[3] || '';
      const next = Math.max(0, Math.min(6, hashes + delta));
      return indent + (next ? new Array(next + 1).join('#') + ' ' : '') + body;
    }).join('\n');
    T.value = val.slice(0, r[0]) + out + val.slice(r[1]);
    this.setSel(T, r[0], r[0] + out.length);
    this.afterEdit(T);
  },

  /* 在文件最前面插一段 YAML Front Matter（已有就不重复插） */
  insertFrontmatter(T) {
    const val = String(T.value == null ? '' : T.value);
    if (/^\s*---\s*\n/.test(val)) {
      new Notice(tr('editor.hasFm'));
      return;
    }
    const text = '---\ntitle: \ndate: ' + fmtDateTime(Date.now()).slice(0, 10) + '\ntags: []\n---\n\n';
    T.value = text + val;
    this.setSel(T, 4, 4);
    this.afterEdit(T);
  },

  insertLink(T, external) {
    const r = this.selRange(T);
    const val = String(T.value == null ? '' : T.value);
    const label = val.slice(r[0], r[1]) || (external ? tr('ui.148') : tr('ui.149'));
    const url = external ? 'https://' : '';
    const text = '[' + label + '](' + url + ')';
    T.value = val.slice(0, r[0]) + text + val.slice(r[1]);
    const caret = r[0] + text.length - 1;
    this.setSel(T, caret, caret);
    this.afterEdit(T);
  },

  clearStyle(T) {
    const r = this.selRange(T);
    const val = String(T.value == null ? '' : T.value);
    const clean = val.slice(r[0], r[1]).replace(/\*\*|__|~~|==|`|<\/?u>/g, '');
    T.value = val.slice(0, r[0]) + clean + val.slice(r[1]);
    this.setSel(T, r[0], r[0] + clean.length);
    this.afterEdit(T);
  },

  selectAllText(T) {
    const len = String(T.value == null ? '' : T.value).length;
    this.setSel(T, 0, len);
    try { if (typeof T.focus === 'function') T.focus(); } catch (e) { /* 忽略 */ }
  },

  /* 删除选中内容；没选中就删掉光标后面的一个字符（和 Del 键一致） */
  deleteSelection(T) {
    const r = this.selRange(T);
    const val = String(T.value == null ? '' : T.value);
    if (r[0] === r[1] && r[0] >= val.length) {
      new Notice(tr('editor.noDel'));
      return;
    }
    T.value = val.slice(0, r[0]) + val.slice(r[1] === r[0] ? r[0] + 1 : r[1]);
    this.setSel(T, r[0], r[0]);
    this.afterEdit(T);
  },

  /* 删掉整段（连同紧挨着的一个空行，别在文件里留一串空行） */
  async deleteBlock(idx) {
    if (this.docMode !== 'edit' || !this.editorEl) return;
    if (idx == null) { new Notice(tr('editor.pickBlock')); return; }
    if (this.canvasBusy || this.commitBusy) {
      try { await Promise.all([this.canvasBusy, this.commitBusy].filter(Boolean)); } catch (e) { /* 忽略 */ }
    }
    const list = (this.blocks || []).slice();
    if (!list[idx]) return;
    const kill = [idx];
    if (list[idx + 1] && list[idx + 1].type === 'blank') kill.push(idx + 1);
    else if (list[idx - 1] && list[idx - 1].type === 'blank') kill.push(idx - 1);
    kill.sort((a, b) => b - a).forEach((k) => list.splice(k, 1));
    // 整篇被删光了 → 留一个空段落当落点，别让文件变成「什么都没有」
    if (!list.some((b) => b.type !== 'blank')) {
      list.length = 0;
      list.push({ type: 'paragraph', raw: '', start: -1, end: -1 });
    }
    const target = Math.max(0, Math.min(idx, list.length - 1));
    this.editorEl.value = list.map((x) => x.raw).join('\n');
    this.pendingRollback = null; // 删完不要被「空段回滚」把删掉的内容再拉回来
    this.editingBlock = null;
    this.blockTa = null;
    this.docDirty = true;
    this.syncDocStatus();
    this.scheduleDocSave();
    const top = this.canvasEl ? this.canvasEl.scrollTop : 0;
    await this.renderCanvas({ blocks: list, target });
    if (this.canvasEl) { try { this.canvasEl.scrollTop = top; } catch (e) { /* 忽略 */ } }
    await this.editBlock(target, 'start');
    new Notice(tr('editor.blockDeleted'));
  },

  /* ⚠ 参数名不能叫 t —— 会遮蔽 i18n 的 tr()，里面就没法取文案了（踩过两次） */
  copyText(tx, msg) {
    const s = String(tx == null ? '' : tx);
    if (!s) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(s);
      }
    } catch (e) { /* 忽略 */ }
    new Notice(msg || tr('notice.copied'));
  },

  clipAction(T, action) {
    const r = this.selRange(T);
    const val = String(T.value == null ? '' : T.value);
    const sel = val.slice(r[0], r[1]);
    if (action === 'copy') {
      this.copyText(sel);
      return;
    }
    if (action === 'cut') {
      this.copyText(sel);
      T.value = val.slice(0, r[0]) + val.slice(r[1]);
      this.setSel(T, r[0], r[0]);
      this.afterEdit(T);
      return;
    }
    const nav = (typeof navigator !== 'undefined') ? navigator : null;
    if (nav && nav.clipboard && nav.clipboard.readText) {
      Promise.resolve(nav.clipboard.readText()).then((t) => {
        if (t) this.insertText(T, String(t));
      }).catch(() => new Notice(tr('editor.noClipboard')));
    } else {
      new Notice(tr('editor.noClipboard'));
    }
  },
});

/* -------------------------------------------------------------------------
 *  工作台视图 · 工作台内编辑器 — 命令分发 + 编辑器右键菜单
 *  （本片段由 build.js 拼进 main.js，不要单独 require）
 * ------------------------------------------------------------------------- */Object.assign(WorkbenchView.prototype, {
  /* ta：命令落在哪个输入框上；ctx：右键菜单的上下文（「删除这一段」要知道是哪一段） */
  applyCmd(id, ta, ctx) {
    const T = ta || this.pickEditorTarget();
    // 少数命令只跟「浏览器选区 / 当前文件」打交道，不需要落在某个输入框上
    if (!T && !READONLY_CMDS.has(id)) return;
    switch (id) {
      case 'bold': this.wrapSel(T, '**', '**', tr('ui.150')); break;
      case 'italic': this.wrapSel(T, '*', '*', tr('ui.151')); break;
      case 'underline': this.wrapSel(T, '<u>', '</u>', tr('ui.152')); break;
      case 'strike': this.wrapSel(T, '~~', '~~', tr('ui.153')); break;
      case 'code': this.wrapSel(T, '`', '`', tr('ui.154')); break;
      case 'mark': this.wrapSel(T, '==', '==', tr('ui.155')); break;
      case 'clear': this.clearStyle(T); break;
      case 'link': this.insertLink(T, false); break;
      case 'extlink': this.insertLink(T, true); break;
      case 'p': this.prefixLines(T, '', 'p'); break;
      case 'h1': this.prefixLines(T, '# ', 'h1'); break;
      case 'h2': this.prefixLines(T, '## ', 'h2'); break;
      case 'h3': this.prefixLines(T, '### ', 'h3'); break;
      case 'h4': this.prefixLines(T, '#### ', 'h4'); break;
      case 'h5': this.prefixLines(T, '##### ', 'h5'); break;
      case 'h6': this.prefixLines(T, '###### ', 'h6'); break;
      case 'hup': this.shiftHeading(T, 1); break;
      case 'hdn': this.shiftHeading(T, -1); break;
      case 'quote': this.prefixLines(T, '> ', 'quote'); break;
      case 'ul': this.prefixLines(T, '- ', 'ul'); break;
      case 'ol': this.prefixLines(T, '1. ', 'ol'); break;
      case 'task': this.prefixLines(T, '- [ ] ', 'task'); break;
      case 'table': this.insertBlock(T, tr('ui.156')); break;
      case 'hr': this.insertBlock(T, '---'); break;
      case 'codeblock': this.insertBlock(T, tr('ui.157')); break;
      case 'math': this.insertBlock(T, '$$\n\n$$'); break;
      case 'toc': this.insertBlock(T, '[TOC]'); break;
      case 'frontmatter': this.insertFrontmatter(T); break;
      case 'footnote': this.insertBlock(T, tr('ui.158')); break;
      case 'date': this.insertBlock(T, fmtDateTime(Date.now()).slice(0, 10)); break;
      case 'image': this.wrapSel(T, '![', tr('ui.159'), tr('ui.160')); break;
      case 'cut': this.clipAction(T, 'cut'); break;
      case 'copy': this.clipAction(T, 'copy'); break;
      case 'paste':
      case 'paste-plain': this.clipAction(T, 'paste'); break;
      case 'del-sel': this.deleteSelection(T); break;
      /* 单画布里选中的正文归浏览器管，输入框里的选区归 textarea 管 —— 两边都试一次 */
      case 'copy-sel': {
        const picked = this.domSelectionText();
        if (picked.trim()) { this.copyText(picked); break; }
        if (T) this.clipAction(T, 'copy');
        break;
      }
      case 'copy-block': {
        const c = ctx || {};
        const idx = (c.blockIdx != null) ? c.blockIdx : this.editingBlock;
        const b = (idx != null) ? (this.blocks || [])[idx] : null;
        if (b) this.copyText(b.raw);
        else if (T) this.copyText(String(T.value == null ? '' : T.value));
        break;
      }
      case 'copy-all': {
        const whole = (T && T === this.editorEl && this.editorEl) ? this.editorEl.value : '';
        if (whole) this.copyText(whole);
        else Promise.resolve(this.docRawText()).then((t) => this.copyText(t));
        break;
      }
      case 'copy-path': {
        const n = this.selectedNote;
        if (!n) break;
        this.copyText(n.external ? n.absPath : n.relPath);
        break;
      }
      case 'select-all-doc':
        if (!this.selectAllDoc()) new Notice(tr('editor.noSelectAll'));
        break;
      case 'del-block': {
        const c = ctx || {};
        const idx = (c.blockIdx != null) ? c.blockIdx : this.editingBlock;
        this.deleteBlock(idx);
        break;
      }
      case 'select-all': {
        // 单画布 / 阅读态：「全选」指的是「把看得见的正文都选上」，走浏览器选区；
        // 源码 / 双栏模式才落在输入框上。
        if ((!T || T === this.editorEl) && this.selectAllDoc()) break;
        if (T) this.selectAllText(T);
        break;
      }
      default: break;
    }
  },

  pickEditorTarget() {
    if (this.blockTa && this.editingBlock != null) return this.blockTa;
    return this.editorEl;
  },

  /* --------------------------------------------------------- 右键菜单
   * 三处菜单（编辑器 / 阅读态 / 文件区）长得一样，渲染逻辑共用一份。
   * groups 两种写法都认：{group:[…]}（常量表里手写的）与 {items:[…]}（按当前项动态生成的）。
   * 命令怎么执行由 onPick 决定，这里只管画。 */
  /* 菜单项文案：优先走词典（key = editorMenu.<id>），词典没有就沿用常量表里写的 label。
   * 这样 EDITOR_MENU / READ_MENU / NEW_MENU 三张表不用改结构就能双语。 */
  menuLabelOf(it, useId) {
    if (!it || !it.id || !useId) return (it && it.label) || '';
    const v = tr('editorMenu.' + it.id);
    return (v !== 'editorMenu.' + it.id) ? v : (it.label || '');
  },

  renderCtxGroups(host, groups, opts) {
    const o = opts || {};
    const hasSel = this.hasDomSelection();
    for (const g of groups || []) {
      const items = (g.items || g.group || []).filter((it) => {
        if (it.needBlock && o.blockIdx == null) return false;
        if (it.needSelection && !hasSel) return false;
        return true;
      });
      // 整个分组的项都被过滤掉了就别画这个分组，否则会留下一条空的分隔线
      if (!items.length) continue;
      const gEl = host.createDiv({ cls: 'vwb-ctx-g' });
      for (const it of items) {
        const row = gEl.createDiv({
          cls: 'vwb-ctx-i' + (it.sub ? ' has-sub' : '') +
            (it.danger ? ' is-danger' : '') + (it.disabled ? ' is-off' : '')
        });
        row.createEl('span', { cls: 'vwb-ctx-ic', text: it.ico || '' });
        row.createEl('span', { cls: 'vwb-ctx-lb', text: this.menuLabelOf(it, o.editorMenu) });
        if (it.hint) row.createEl('span', { cls: 'vwb-ctx-key', text: it.hint });
        if (it.disabled) {
          row.setAttribute('title', it.why || tr('ui.161'));
          continue;
        }
        if (it.sub) {
          row.createEl('span', { cls: 'vwb-ctx-ar', text: '›' });
          const sub = row.createDiv({ cls: 'vwb-ctx-sub vwb-glass' });
          for (const s of it.sub) {
            const sr = sub.createDiv({ cls: 'vwb-ctx-i' });
            sr.createEl('span', { cls: 'vwb-ctx-lb', text: this.menuLabelOf(s, o.editorMenu) });
            if (s.hint) sr.createEl('span', { cls: 'vwb-ctx-key', text: s.hint });
            sr.addEventListener('mousedown', (e) => { if (e.preventDefault) e.preventDefault(); });
            sr.addEventListener('click', (e) => {
              if (e.stopPropagation) e.stopPropagation();
              o.onPick(s.id);
            });
          }
        } else {
          row.addEventListener('mousedown', (e) => { if (e.preventDefault) e.preventDefault(); });
          row.addEventListener('click', (e) => {
            if (e.stopPropagation) e.stopPropagation();
            o.onPick(it.id);
          });
        }
      }
    }
  },

  /* 弹菜单的通用前半段：先按 0,0 画出来（量得到真实尺寸），最后再摆位置。
   * container 决定菜单挂在谁身上（预览面板 / 主区），定位边界要跟着它走。 */
  openCtxMenu(container) {
    this.closeEditorMenu();
    const host = container || this.prevEl;
    if (!host) return null;
    const el = host.createDiv({ cls: 'vwb-ctx vwb-glass' });
    this.ctxEl = el;
    try {
      el.style.left = '0px';
      el.style.top = '0px';
      el.style.visibility = 'hidden';
    } catch (e) { /* 忽略 */ }
    return el;
  },

  showEditorMenu(ev, ta, blockIdx) {
    const host = this.openCtxMenu();
    if (!host) return;
    const x = Number(ev && ev.clientX) || 0;
    const y = Number(ev && ev.clientY) || 0;

    // 命令要作用在「哪一段」上：菜单一弹出就得定下来，之后焦点怎么变都不受影响
    const effBlock = (blockIdx != null) ? blockIdx : this.editingBlock;
    const owned = (effBlock != null && this.editingBlock === effBlock) ? this.blockTa : null;
    const ctx = {
      ta: ta || owned,
      blockIdx: (effBlock != null ? effBlock : null),
      live: this.editorMode() === 'live'
    };

    this.renderCtxGroups(host, EDITOR_MENU, { editorMenu: true,
      blockIdx: ctx.blockIdx,
      onPick: (id) => this.runEditorCmd(id, ctx)
    });

    // 关键：点菜单不能让正在编辑的那一段失焦。
    // 一失焦就触发 blur → commitBlock → 那一段的输入框被重绘换掉，
    // 而命令还落在已经脱离文档的旧输入框上 —— 表现出来就是「右键菜单点了没反应」。
    host.addEventListener('mousedown', (e) => {
      if (e.preventDefault) e.preventDefault();
    });
    this.placeMenu(host, x, y, this.prevEl);
    try { host.style.visibility = ''; } catch (e) { /* 忽略 */ }
  },

  /* 阅读态右键：没有输入框，只做「读」的事（复制选中 / 全选 / 复制整篇 / 复制路径） */
  showReadMenu(ev) {
    const host = this.openCtxMenu();
    if (!host) return;
    const x = Number(ev && ev.clientX) || 0;
    const y = Number(ev && ev.clientY) || 0;
    this.renderCtxGroups(host, READ_MENU, { editorMenu: true,
      onPick: (id) => { this.closeEditorMenu(); this.applyCmd(id, null, null); }
    });
    // 同编辑器菜单：别让点菜单把正文里的选区弄丢
    host.addEventListener('mousedown', (e) => {
      if (e.preventDefault) e.preventDefault();
    });
    this.placeMenu(host, x, y, this.prevEl);
    try { host.style.visibility = ''; } catch (e) { /* 忽略 */ }
  },

  /* 阅读态正文绑一次右键（正文容器不会随渲染被换掉，所以只绑一次） */
  bindReadMenu() {
    const body = this.prevBodyEl;
    if (!body || body._vwbReadMenu) return;
    body._vwbReadMenu = true;
    body.addEventListener('contextmenu', (e) => {
      if (this.docMode === 'edit') return; // 编辑态由画布 / 输入框自己处理
      const t = e && e.target;
      if (t && typeof t.closest === 'function' && t.closest('.vwb-ctx, .vwb-edit, input, textarea, .vwb-embed, iframe')) return;
      if (e.preventDefault) e.preventDefault();
      if (e.stopPropagation) e.stopPropagation();
      this.showReadMenu(e);
    });
  },

  /* 把菜单摆到鼠标位置，并保证它整块都在面板里：
   *   右边够宽 → 原地不动，子菜单朝右开
   *   右边不够但左边够 → 根菜单原地不动，子菜单改朝左开（is-flip）
   *   两边都不够（面板很窄）→ 子菜单「就地展开」（is-flat），同时把根菜单挪进面板
   *   下边放不下 → 向上翻；高度实在装不下 → 限高 + 内部滚动
   * 功能越加越多时这里不用再改。
   * bounds 决定「菜单该待在哪个盒子里」：编辑器右键菜单在预览面板里，
   * 文件区右键菜单在主区里 —— 两边各自的边界不一样，所以要能传进来。 */
  placeMenu(host, x, y, bounds) {
    const prev = bounds || this.prevEl;
    let bl = 0;
    let bt = 0;
    let bw = 0;
    let bh = 0;
    try {
      const r = prev && prev.getBoundingClientRect ? prev.getBoundingClientRect() : null;
      if (r) { bl = r.left || 0; bt = r.top || 0; bw = r.width || 0; bh = r.height || 0; }
    } catch (e) { /* 忽略 */ }
    if (!bw) bw = (prev && prev.clientWidth) || 0;
    if (!bh) bh = (prev && prev.clientHeight) || 0;
    if (!bw) bw = 420;
    if (!bh) bh = 640;

    const mw = host.offsetWidth || 224;   // 菜单自身宽
    const mh = host.offsetHeight || 340;  // 菜单自身高
    const subRoom = 186;                  // 子菜单还要往旁边占的宽度
    const needW = mw + subRoom;
    const pad = 6;

    let left = x - bl;
    let top = y - bt;
    let flip = false;
    // 面板比「根菜单 + 子菜单」还窄时，怎么摆都放不下 → 直接就让子菜单就地展开
    let flat = (bw < needW + pad * 2);

    if (!flat) {
      const rightRoom = bw - pad - left;
      if (rightRoom >= needW) {
        /* 右边什么都放得下，不折腾 */
      } else if (left >= subRoom + pad) {
        flip = true; // 左边够放子菜单 → 子菜单朝左开
      } else {
        left = Math.max(pad, bw - pad - needW); // 往右挪，给「根 + 子菜单」腾地方
      }
    }

    // 下面放不下 → 向上翻
    if (top + mh > bh - pad) top = top - mh;

    left = Math.max(pad, Math.min(left, Math.max(pad, bw - mw - pad)));
    top = Math.max(pad, Math.min(top, Math.max(pad, bh - mh - pad)));

    try {
      host.style.left = Math.round(left) + 'px';
      host.style.top = Math.round(top) + 'px';
    } catch (e) { /* 忽略 */ }
    if (flip && host.classList) host.classList.add('is-flip');

    // 高度装不下 → 限高 + 内部滚动；此时子菜单必须就地展开，否则会被 overflow 裁掉
    if (mh > bh - 16) {
      try {
        host.style.maxHeight = Math.max(160, Math.round(bh - 24)) + 'px';
        host.style.overflowY = 'auto';
      } catch (e) { /* 忽略 */ }
      flat = true;
    }
    if (flat && host.classList) host.classList.add('is-flat');
  },

  async runEditorCmd(id, ctx) {
    this.closeEditorMenu();
    const c = ctx || {};
    // 「复制」类命令不需要「先进入编辑态」——
    // 尤其是「复制选中文本」：一带进编辑态，用户刚拖选出来的选区就没了。
    if (id === 'copy-sel' && this.domSelectionText().trim()) {
      this.applyCmd(id, null, c);
      return;
    }
    if (id === 'copy-block') {
      const idx = (c.blockIdx != null) ? c.blockIdx : this.editingBlock;
      const b = (idx != null) ? (this.blocks || [])[idx] : null;
      if (b) { this.copyText(b.raw); return; }
    }
    if (id === 'copy-all') { this.applyCmd(id, null, c); return; }
    const T = await this.menuTarget(c);
    if (!T && !READONLY_CMDS.has(id)) return;
    // 菜单点击会抢走焦点，先把焦点和光标还回去，选区才对得上
    try { if (T && typeof T.focus === 'function') T.focus({ preventScroll: true }); } catch (e) { /* 忽略 */ }
    this.applyCmd(id, T, c);
  },

  /* 右键命令该作用在哪个输入框上 —— 这里最容易出错：
   * 单画布模式下源码框是隐藏的（display:none），命令若落到它身上，改了也看不见，
   * 用户看到的就是「右键菜单全都失灵」。所以：
   *   在某一块上右键   → 让这一段进入编辑态，命令作用在它的输入框上（画布立刻跟着变）
   *   画布空白 / 顶栏「Aa 格式」且当前没在编辑任何一段 → 作用在整篇源码上，
   *                     并把光标放到文末当落点，执行完再重画整张画布。
   * 另外，菜单弹出之后到点击之间，那一段有可能已经被提交重绘过（输入框被换掉），
   * 所以这里要确认 ctx.ta 还是「当前活着的那个输入框」，否则重新把这一段带进编辑态。 */
  async menuTarget(ctx) {
    const c = ctx || {};
    const stillAlive = (el) => !!el && (el === this.editorEl || el === this.blockTa);
    if (c.ta && stillAlive(c.ta)) return c.ta;
    if (c.live && c.blockIdx != null) {
      const ta = await this.editBlock(c.blockIdx, 'end');
      if (ta) return ta;
    }
    const ta = this.editorEl;
    if (!ta) return null;
    if (this.editingBlock == null) {
      const len = String(ta.value == null ? '' : ta.value).length;
      this.setSel(ta, len, len);
    }
    return ta;
  },

  closeEditorMenu() {
    const el = this.ctxEl;
    this.ctxEl = null;
    if (!el) return;
    try {
      if (typeof el.remove === 'function') el.remove();
      else if (el.parentElement) el.parentElement.removeChild(el);
    } catch (e) { /* 忽略 */ }
  },
});

/* -------------------------------------------------------------------------
 *  工作台视图 · 工作台内编辑器 — 双栏滚动同步 + 实时渲染 + 保存
 *  （本片段由 build.js 拼进 main.js，不要单独 require）
 * ------------------------------------------------------------------------- */
Object.assign(WorkbenchView.prototype, {
  /* ---------------------------------------------------- 双栏滚动同步 */
  bindScrollSync() {
    const ta = this.editorEl;
    const live = this.liveEl;
    if (!ta || !live || !ta.addEventListener) return;
    let lock = false;
    const link = (src, dst) => {
      src.addEventListener('scroll', () => {
        if (lock) return;
        lock = true;
        try {
          const sr = (src.scrollHeight || 0) - (src.clientHeight || 0);
          const dr = (dst.scrollHeight || 0) - (dst.clientHeight || 0);
          if (sr > 0 && dr > 0 && typeof dst.scrollTop === 'number') {
            dst.scrollTop = Math.round((src.scrollTop / sr) * dr);
          }
        } catch (e) { /* 忽略 */ }
        setTimeout(() => { lock = false; }, 80);
      });
    };
    link(ta, live);
    link(live, ta);
  },

  /* ------------------------------------------------------- 实时渲染（split） */
  scheduleLivePreview(wait) {
    if (this.liveTimer) clearTimeout(this.liveTimer);
    this.liveTimer = setTimeout(() => { this.renderLivePreview(); }, typeof wait === 'number' ? wait : 350);
  },

  async renderLivePreview() {
    const live = this.liveEl;
    const ta = this.editorEl;
    if (!live || !ta) return;
    const txt = String(ta.value == null ? '' : ta.value);
    live.empty();
    if (txt.length > 200 * 1024) {
      live.createDiv({ cls: 'vwb-empty', text: tr('ui.162') });
      return;
    }
    if (!txt.trim()) {
      live.createDiv({ cls: 'vwb-empty', text: tr('ui.163') });
      return;
    }
    const note = this.selectedNote;
    const host = live.createDiv({ cls: 'vwb-doc-inner' });
    if (note && fileKind(note.ext) === 'text') {
      host.createEl('pre', { cls: 'vwb-code', text: txt });
      return;
    }
    const notePath = (note && note.external) ? note.absPath : (note ? note.relPath : '');
    try {
      await MarkdownRenderer.render(this.plugin.app, txt, host, notePath, this);
    } catch (e) {
      try { await MarkdownRenderer.renderMarkdown(txt, host, notePath, this); }
      catch (e2) { host.setText(txt); }
    }
    try { this.fixupRenderedContent(host, note); } catch (e) { /* 忽略 */ }
    // 双栏模式下大纲也要能用：把源码里的标题和渲染出来的标题对上号
    try {
      this.collectHeadings(txt, host);
      if (this.outlineOpen) this.renderOutline();
    } catch (e) { /* 忽略 */ }
  },

  /* ------------------------------------------------------------- 保存 */
  scheduleDocSave() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flushDocSave(), 800);
  },

  async flushDocSave() {
    if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null; }
    const note = this.selectedNote;
    if (!this.docDirty || !note || !this.editorEl) return;
    const text = this.editorEl.value;
    this.docDirty = false;
    try {
      if (note.external) {
        // 外部库：先写临时文件再改名，避免写一半崩掉把原文弄丢
        const tmp = note.absPath + '.vwb-tmp';
        try {
          fs.writeFileSync(tmp, text, 'utf8');
          fs.renameSync(tmp, note.absPath);
        } catch (e) {
          try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch (e2) { /* 清不掉就算了 */ }
          throw e;
        }
        note.size = Buffer.byteLength(text, 'utf8');
        note.mtime = Date.now();
        this.plugin.externalCache = {}; // 外部库缓存作废，回来能看到新时间
        if (!this.warnedExternalWrite) {
          this.warnedExternalWrite = true;
          new Notice(tr('editor.wroteExternal', { path: note.relPath }));
        }
      } else {
        await this.plugin.app.vault.modify(note.file, text);
      }
      this.plugin.logOp({ type: 'modify', path: note.relPath });
    } catch (e) {
      this.docDirty = true;
      // 外部库是直接写磁盘的，权限 / 只读盘 / 网盘占用这些错要说得明白，
      // 不然换台机器只看到一句英文的 EACCES，根本不知道该怎么办。
      new Notice(note.external
        ? fsErrorText(e, tr('ui.164') + note.relPath)
        : (tr('ui.165') + (e && e.message ? e.message : e)));
    }
    this.syncDocStatus();
  },

  /* 元信息行兼做保存状态提示；阅读态的标签是可点击的 chips（点击=按标签筛选） */
  syncDocStatus() {
    const n = this.selectedNote;
    const el = this.prevMetaEl;
    if (!n || !el) return;
    try { el.empty(); } catch (e) { /* 忽略 */ }
    const base = kindLabel(this.prevKind) + ' · ' + (n.folder || tr('ui.166')) + ' · ' +
      fmtSize(n.size || 0) + ' · ' + fmtDate(n.mtime);
    el.createEl('span', { text: base });
    if (this.docMode === 'edit') {
      el.createEl('span', { text: ' · ' + (this.docDirty ? tr('ui.167') : tr('ui.168')) });
    } else if (n.tags && n.tags.length) {
      el.createEl('span', { text: ' · ' });
      for (const t of n.tags.slice(0, 3)) {
        const chip = el.createEl('span', { cls: 'vwb-card-tag vwb-tag-click', text: t });
        chip.setAttribute('title', tr('ui.19'));
        chip.addEventListener('click', (e) => {
          if (e && e.stopPropagation) e.stopPropagation();
          this.searchByTag(t);
        });
      }
    }
  }
});

/* -------------------------------------------------------------------------
 *  工作台视图 · 预览面板：打开 / 渲染 / 大纲 / 多类型
 *  （本片段由 build.js 拼进 main.js，不要单独 require）
 * ------------------------------------------------------------------------- */
Object.assign(WorkbenchView.prototype, {
  /* 打开文件：按 settings.open.mode 决定落地方式 */
  async openFile(note, opts) {
    const o = opts || {};
    const mode = o.forcePanel
      ? 'panel'
      : (o.forceDoc ? 'workbench' : openModeOf(this.plugin.settings.open.mode).id);
    if (mode === 'native' && canOpenNative(note)) {
      const done = await this.openNative(note);
      if (done) return;
    }
    // workbench = 工作台内铺满（工作面板模式）；panel = 右侧一瞥，不铺满
    await this.openPreview(note, { expand: mode === 'workbench', collapse: mode === 'panel' });
  },

  /* 在 Obsidian 里原生打开（铺满工作区） */
  async openNative(note) {
    if (!canOpenNative(note)) {
      new Notice(note && note.external
        ? tr('preview.noNativeExternal')
        : tr('preview.noNativeType'));
      return false;
    }
    try {
      const ws = this.plugin.app.workspace;
      let leaf = null;
      try { leaf = ws.getLeaf('tab'); } catch (e) { leaf = ws.getLeaf(true); }
      await leaf.openFile(note.file);
      this.plugin.logOp({ type: 'open', path: note.relPath });
      this.selectedNote = note;
      this.render(); // 卡片上留个选中态，回来还知道刚才在看哪个
      return true;
    } catch (e) {
      new Notice(tr('preview.nativeFail', { err: (e && e.message ? e.message : e) }));
      return false;
    }
  },

  /* ----------------------------------------------------------- preview */
  async openPreview(note, opts) {
    const o = opts || {};
    await this.flushDocSave(); // 换文件前先把没写完的内容落盘
    this.selectedNote = note;
    this.prevKind = fileKind(note.ext);
    this.imgZoom = 'fit';
    this.docMode = o.edit ? 'edit' : 'read';
    this.docDirty = false;
    this.prevTitleEl.setText(this.prevKind === 'markdown' ? note.name.replace(/\.md$/i, '') : note.name);
    this.syncDocStatus();
    this.prevEl.addClass('is-on');
    this.buildPreviewFoot(note);
    this.syncDocTools();
    this.docHeadings = [];
    this.toggleOutline(false);
    this.prevBodyEl.empty();
    this.prevBodyEl.createDiv({ cls: 'vwb-empty', text: tr('preview.loading') });
    this.render(); // 选中态高亮

    // 外部库 md：按需抽取标签（首次）
    if (note.external && this.prevKind === 'markdown' && (!note.tags || !note.tags.length)) {
      note.tags = extractTagsFromHead(note.absPath);
    }

    try {
      // 铺满 / 收起要在渲染正文之前定下来：编辑态正文宽度会影响自动高度
      if (o.expand) this.togglePreviewMax(true);
      if (o.collapse) this.togglePreviewMax(false);
      await this.renderDocBody();
    } catch (e) {
      this.prevBodyEl.empty();
      this.prevBodyEl.createDiv({ cls: 'vwb-empty', text: tr('preview.fail', { err: (e && e.message ? e.message : e) }) });
    }
  },

  /* ------------------------------------------- 工作台内：阅读 / 编辑 */
  /* 头部按钮的可见性随类型和模式变 */
  togglePreviewMax(force) {
    this.prevMax = typeof force === 'boolean' ? force : !this.prevMax;
    this.applyAppearance();
    if (this.selectedNote) this.prevEl.addClass('is-on');
    if (this.maxBtn) this.maxBtn.setText(this.prevMax ? '⤡' : '⤢');
    if (this.maxBtn) this.maxBtn.setAttribute('aria-label', this.prevMax ? tr('ui.169') : tr('ui.170'));
  },

  /* 大纲抽屉：列出当前文档标题，点击跳转 */
  toggleOutline(force) {
    this.outlineOpen = typeof force === 'boolean' ? force : !this.outlineOpen;
    // 窄面板塞不下大纲，直接先把文档铺满（对齐原生「编辑 + 大纲」的观感）
    if (this.outlineOpen && !this.prevMax) this.togglePreviewMax(true);
    this.outlineEl.className = 'vwb-outline vwb-glass' + (this.outlineOpen ? ' is-on' : '');
    if (this.outlineOpen) this.renderOutline();
  },

  renderOutline() {
    const box = this.outlineEl;
    box.empty();
    const head = box.createDiv({ cls: 'vwb-outline-head' });
    head.createDiv({ cls: 'vwb-outline-t', text: tr('preview.outline') });
    const x = head.createDiv({ cls: 'vwb-prev-x', text: '✕' });
    x.addEventListener('click', () => this.toggleOutline(false));

    if (!this.docHeadings.length) {
      box.createDiv({ cls: 'vwb-outline-empty', text: tr('preview.noHeadings') });
      return;
    }
    for (const h of this.docHeadings) {
      const it = box.createDiv({ cls: 'vwb-outline-i lv' + h.level });
      it.createEl('span', { cls: 'vwb-outline-lv', text: 'H' + h.level });
      it.createEl('span', { cls: 'vwb-outline-tx', text: h.text });
      it.addEventListener('click', () => {
        if (h.el && typeof h.el.scrollIntoView === 'function') {
          h.el.scrollIntoView({ block: 'start', behavior: 'smooth' });
          return;
        }
        // 纯源码 / 双栏模式没有对应的 DOM，按行号跳
        this.jumpToHeading(h);
      });
    }
  },

  /* 设置面板：左边子页导航（外观 / 打开方式 / 库管理 / 操作日志 / 关于），右边内容 */
  collectHeadings(content, host) {
    const list = [];
    let inFence = false;
    for (const line of String(content).split(/\r?\n/)) {
      if (/^\s*(```|~~~)/.test(line)) { inFence = !inFence; continue; }
      if (inFence) continue;
      const m = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
      if (m) list.push({ level: m[1].length, text: m[2].replace(/[*_`\[\]]/g, '').trim(), el: null });
    }
    let els = [];
    try { els = Array.prototype.slice.call(host.querySelectorAll('h1,h2,h3,h4,h5,h6')); } catch (e) { els = []; }
    if (!els.length) {
      // 极简 DOM 环境不支持逗号选择器时的兜底
      for (let lv = 1; lv <= 6; lv++) {
        for (const e of host.querySelectorAll('h' + lv)) els.push(e);
      }
    }
    for (let i = 0; i < list.length; i++) list[i].el = els[i] || null;
    this.docHeadings = list;
    return list;
  },

  /* 外部库 md 里的相对资源（图片 / 音视频 / PDF）Obsidian 的渲染器解析不了
     —— 它只认「当前库」内的资源，所以 ![](img/1.jpg) / ![[img/1.jpg]] 都会变成「找不到」。
     这里按磁盘路径兜底：把能落地的资源读成 data URL 塞回去。 */
  fixupRenderedContent(host, note) {
    if (!note || !note.absPath || !host) return;
    const dir = pathMod.dirname(note.absPath);

    const resolveLocal = (raw) => {
      let p = String(raw == null ? '' : raw).trim();
      if (!p) return '';
      if (/^(https?:|data:|app:|mailto:|file:)/i.test(p)) return '';
      p = p.split('#')[0].split('?')[0];
      try { p = decodeURIComponent(p); } catch (e) { /* 原样用 */ }
      p = p.replace(/^\.\//, '');
      const abs = pathMod.isAbsolute(p) ? p : pathMod.resolve(dir, p);
      try {
        if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return abs;
      } catch (e) { /* 不存在 */ }
      return '';
    };

    // 1) 已经渲染成 <img> 但 src 是相对路径的
    for (const img of host.querySelectorAll('img')) {
      const src = img.getAttribute('src') || '';
      if (!src || /^(data:|https?:|app:)/i.test(src)) continue;
      const abs = resolveLocal(src);
      if (!abs) continue;
      const url = this.plugin.dataUrlOf(abs, pathMod.extname(abs));
      if (!url) continue;
      img.setAttribute('src', url);
      img.src = url;
    }

    // 2) 未解析的内嵌：Obsidian 会渲染成 .internal-embed.is-unresolved，里面带着目标路径
    for (const em of host.querySelectorAll('.internal-embed')) {
      if (!em.classList || !em.classList.contains('is-unresolved')) continue;
      const rawAttr = em.getAttribute('src') || em.getAttribute('data-src') || '';
      const fromText = ((em.textContent || '').match(/["“”]([^"“”]+)["“”]/) || [])[1];
      const abs = resolveLocal(rawAttr) || resolveLocal(fromText);
      if (!abs) continue;
      const ext = pathMod.extname(abs).toLowerCase();
      const kind = fileKind(ext);
      const url = this.plugin.dataUrlOf(abs, ext);
      if (!url) continue;
      em.empty();
      if (em.removeClass) em.removeClass('is-unresolved');
      if (em.addClass) em.addClass('vwb-embed-fixed');
      if (kind === 'image') {
        em.createEl('img', { cls: 'vwb-img', src: url });
      } else if (kind === 'audio' || kind === 'video') {
        const m = em.createEl(kind, { cls: 'vwb-av' });
        m.setAttribute('controls', 'controls');
        m.src = url;
      } else if (kind === 'pdf') {
        const fr = em.createEl('iframe', { cls: 'vwb-pdf' });
        fr.src = url;
      } else {
        em.createEl('span', { cls: 'vwb-embed-link', text: pathMod.basename(abs) });
      }
    }

    // 3) 内部链接 [[xxx]]：外部库也能点得动（按名字/路径在当前所选库里找）
    for (const a of host.querySelectorAll('a.internal-link')) {
      a.addEventListener('click', (e) => {
        if (e && e.preventDefault) e.preventDefault();
        const target = a.getAttribute('data-href') || a.getAttribute('href') || a.textContent || '';
        if (!this.openByLink(target)) new Notice(tr('preview.linkMissing', { target: target }));
      });
    }
  },

  /* 在当前所选库里按路径 / 文件名找一个笔记并打开 */
  openByLink(target) {
    const t = String(target || '').split('|')[0].split('#')[0].trim();
    if (!t) return false;
    const vault = this.selectedVaultInfo();
    if (!vault) return false;
    const files = this.plugin.indexOf(vault.path).files || [];
    const norm = (s) => String(s || '').replace(/\\/g, '/').toLowerCase();
    const want = norm(t).replace(/\.md$/, '');
    const wantName = want.indexOf('/') >= 0 ? want.split('/').pop() : want;
    const byPath = (n) => norm(n.relPath).replace(/\.md$/, '');
    const hit = files.find((n) => byPath(n) === want)
      || files.find((n) => norm(n.name).replace(/\.md$/, '') === wantName)
      || null;
    if (!hit) return false;
    this.openFile(hit, { forceDoc: true });
    return true;
  },

  /* 预览用资源地址：当前库走 Obsidian 资源协议；外部库读成 data URL（拿不到就返回空） */
  resourceUrl(note, maxBytes) {
    if (!note.external) {
      try {
        const u = this.plugin.app.vault.adapter.getResourcePath(note.relPath);
        if (u) return u;
      } catch (e) { /* 落到下面的兜底 */ }
    }
    return this.plugin.dataUrlOf(note.absPath, note.ext, maxBytes);
  },

  /* 按类型分流渲染预览正文 */
  async renderPreviewBody(note) {
    const kind = this.prevKind;
    const body = this.prevBodyEl;

    /* 1) Markdown：渲染正文（原能力不变） */
    if (kind === 'markdown') {
      let content = '';
      try {
        content = note.external
          ? fs.readFileSync(note.absPath, 'utf8')
          : await this.plugin.app.vault.read(note.file);
      } catch (e) {
        content = tr('ui.138') + e.message;
      }
      body.empty();
      const host = body.createDiv({ cls: 'vwb-doc-inner' });
      try {
        await MarkdownRenderer.render(this.plugin.app, content, host, note.external ? note.absPath : note.relPath, this);
      } catch (e) {
        try {
          await MarkdownRenderer.renderMarkdown(content, host, note.relPath, this);
        } catch (e2) {
          host.setText(content);
        }
      }
      this.collectHeadings(content, host);
      // 外部库：相对图片 / 未解析内嵌 / 内部链接都要自己兜底
      try { this.fixupRenderedContent(host, note); } catch (e) { console.warn('[vault-workbench] fixup failed', e); }
      if (this.outlineOpen) this.renderOutline();
      return;
    }

    /* 2) 纯文本 / 代码 / 配置：直接读出来只读展示 */
    if (kind === 'text') {
      let txt = '';
      let clipped = false;
      try {
        if (note.external) {
          const st = fs.statSync(note.absPath);
          const cap = Math.min(st.size, MAX_TEXT);
          const buf = Buffer.alloc(cap);
          const fd = fs.openSync(note.absPath, 'r');
          const n = fs.readSync(fd, buf, 0, cap, 0);
          fs.closeSync(fd);
          txt = buf.slice(0, n).toString('utf8');
          clipped = st.size > MAX_TEXT;
        } else {
          txt = await this.plugin.app.vault.read(note.file);
          if (txt.length > MAX_TEXT) { txt = txt.slice(0, MAX_TEXT); clipped = true; }
        }
      } catch (e) {
        txt = tr('ui.138') + (e && e.message ? e.message : e);
      }
      if (clipped) txt += tr('ui.171') + fmtSize(MAX_TEXT) + '）';
      body.empty();
      body.createEl('pre', { cls: 'vwb-code', text: txt });
      return;
    }

    /* 3) PDF：当前库交给 Obsidian 原生阅读器；外部库尽力内嵌 + 给系统打开入口 */
    if (kind === 'pdf') {
      await this.renderPdf(note);
      return;
    }

    /* 4) 图片 / 音频 / 视频：面板内嵌 */
    if (kind === 'image' || kind === 'audio' || kind === 'video') {
      const url = this.resourceUrl(note);
      if (!url) { this.renderFileCard(note, kind); return; }
      body.empty();
      this.appendMedia(body, note, kind, url);
      body.createDiv({
        cls: 'vwb-media-tip',
        text: kind === 'image'
          ? tr('preview.imageTip')
          : tr('preview.mediaTip')
      });
      return;
    }

    /* 5) 其他类型：文件信息卡 + 外部打开引导 */
    this.renderFileCard(note, kind);
  },

  /* 生成媒体元素（图片 / 音频 / 视频 / PDF） */
  async renderPdf(note) {
    const body = this.prevBodyEl;
    if (!note.external) {
      body.empty();
      const host = body.createDiv({ cls: 'vwb-embed' });
      try {
        await MarkdownRenderer.render(
          this.plugin.app, '![[' + note.relPath + ']]', host, note.relPath, this
        );
        body.createDiv({ cls: 'vwb-media-tip', text: tr('preview.pdfNativeTip') });
        return;
      } catch (e) {
        body.empty();
      }
    }
    const url = this.resourceUrl(note);
    if (!url) { this.renderFileCard(note, 'pdf'); return; }
    body.empty();
    this.appendMedia(body, note, 'pdf', url);
    body.createDiv({
      cls: 'vwb-media-tip',
      text: tr('preview.pdfTip')
    });
    if (note.external) this.appendQuickActions(body, note);
  },

  /* 内嵌 + 系统打开入口（外部库文件的引导） */
  appendMedia(body, note, kind, url) {
    const wrap = body.createDiv({ cls: 'vwb-media vwb-media-' + kind });
    if (kind === 'image') {
      const img = wrap.createEl('img', { cls: 'vwb-img' });
      img.setAttribute('alt', note.name);
      img.src = url;
      this.bindImageFallback(img, note);
      this.applyImgZoom();
      // 点图也能切 1:1 / 适应（和光标形状一致）
      img.addEventListener('click', () => {
        this.imgZoom = this.imgZoom === 'actual' ? 'fit' : 'actual';
        this.applyImgZoom();
        this.buildPreviewFoot(note);
      });
    } else if (kind === 'pdf') {
      const fr = wrap.createEl('iframe', { cls: 'vwb-pdf' });
      fr.setAttribute('title', note.name);
      fr.src = url;
    } else {
      const m = wrap.createEl(kind, { cls: 'vwb-av' });
      m.setAttribute('controls', 'controls');
      m.src = url;
    }
    return wrap;
  },

  /* PDF 预览：当前库用原生嵌入（和笔记里写 ![[x.pdf]] 同一条链路，最稳） */
  appendQuickActions(container, note) {
    const box = container.createDiv({ cls: 'vwb-quick' });
    const b1 = box.createEl('button', { cls: 'vwb-btn vwb-btn-sm', text: tr('preview.openExternal') });
    b1.addEventListener('click', () => shellOpenPath(note.absPath));
    const b2 = box.createEl('button', { cls: 'vwb-btn vwb-btn-sm', text: tr('preview.openFolder') });
    b2.addEventListener('click', () => shellReveal(note.absPath));
    return box;
  },

  /* 图片加载失败（外部库文件可能被资源协议拒绝）→ 兜底读成 data URL 再试一次 */
  bindImageFallback(img, note) {
    img.addEventListener('error', () => {
      const fb = this.plugin.dataUrlOf(note.absPath, note.ext);
      if (fb && img.src !== fb) {
        img.src = fb;
        return;
      }
      this.renderFileCard(note, 'image');
    });
  },

  applyImgZoom() {
    const img = this.prevBodyEl.querySelector('.vwb-img');
    if (!img) return;
    const actual = this.imgZoom === 'actual';
    img.className = 'vwb-img' + (actual ? ' is-actual' : '');
    // 容器同步切换：适应时裁掉溢出，1:1 时允许在容器内滚动查看
    const wrap = this.prevBodyEl.querySelector('.vwb-media-image');
    if (wrap) wrap.className = 'vwb-media vwb-media-image' + (actual ? ' is-actual' : '');
  },

  /* 文件信息卡：非内嵌类型 / 外部库拿不到资源 —— 引导用系统程序打开 */
  renderFileCard(note, kind) {
    const k = kind || fileKind(note.ext);
    const body = this.prevBodyEl;
    body.empty();
    const abs = note.absPath || '';
    const card = body.createDiv({ cls: 'vwb-fcard' });

    const top = card.createDiv({ cls: 'vwb-fcard-top' });
    top.createDiv({ cls: 'vwb-fcard-ico', text: iconFor(note.ext, k) });
    const info = top.createDiv({ cls: 'vwb-fcard-info' });
    info.createDiv({ cls: 'vwb-fcard-nm', text: note.name });
    info.createDiv({ cls: 'vwb-fcard-path', text: abs || note.relPath || '' });

    const rows = card.createDiv({ cls: 'vwb-fcard-rows' });
    const row = (label, val) => {
      const r = rows.createDiv({ cls: 'vwb-frow' });
      r.createEl('span', { text: label });
      r.createEl('b', { text: val });
    };
    row(tr('ui.172'), kindLabel(k) + (note.ext ? '（' + note.ext + '）' : ''));
    row(tr('ui.173'), fmtSize(note.size || 0));
    row(tr('ui.174'), fmtDateTime(note.mtime));
    row(tr('ui.175'), fmtDateTime(note.ctime));

    const btns = card.createDiv({ cls: 'vwb-fcard-btns' });
    const bOpen = btns.createEl('button', { cls: 'vwb-btn vwb-btn-pri', text: tr('preview.openExternal') });
    bOpen.addEventListener('click', () => shellOpenPath(abs));
    const bDir = btns.createEl('button', { cls: 'vwb-btn', text: tr('preview.openFolder') });
    bDir.addEventListener('click', () => shellReveal(abs));
    if (!note.external && extOf(note.ext) === 'canvas') {
      const bIn = btns.createEl('button', { cls: 'vwb-btn', text: tr('ui.176') });
      bIn.addEventListener('click', () => this.openSelected());
    }

    if (!abs) {
      card.createDiv({ cls: 'vwb-fcard-tip', text: tr('ui.177') });
    } else if (note.external) {
      card.createDiv({ cls: 'vwb-fcard-tip', text: tr('ui.178') + note.ext + tr('ui.179') });
    }
  },

  /* 底栏按钮随文件类型变化 */
  buildPreviewFoot(note) {
    const foot = this.prevFootEl;
    foot.empty();
    const kind = this.prevKind;
    const add = (label, cls, fn) => {
      const b = foot.createEl('button', { cls: 'vwb-btn vwb-btn-sm' + (cls ? ' ' + cls : ''), text: label });
      b.addEventListener('click', fn);
      return b;
    };
    const addInObsidian = (label) => {
      const b = add(label, '', () => this.openSelected());
      b.disabled = !!note.external;
      return b;
    };

    const editable = this.canEdit(note);
    const editing = editable && this.docMode === 'edit';

    if (editing) {
      add(tr('ui.180'), 'vwb-btn-pri', () => this.setDocMode('read'));
      add(tr('ui.181'), '', () => { this.flushDocSave(); new Notice(tr('ui.182')); });
      if (kind === 'markdown') addInObsidian(tr('ui.176'));
      else add(tr('ui.183'), '', () => shellOpenPath(note.absPath));
    } else if (kind === 'markdown') {
      if (editable) add(tr('ui.184'), 'vwb-btn-pri', () => this.setDocMode('edit'));
      addInObsidian(tr('ui.185'));
    } else if (kind === 'image') {
      add(this.imgZoom === 'actual' ? tr('ui.186') : tr('ui.187'), '', () => {
        this.imgZoom = this.imgZoom === 'actual' ? 'fit' : 'actual';
        this.applyImgZoom();
        this.buildPreviewFoot(note);
      });
      add(tr('ui.183'), '', () => shellOpenPath(note.absPath));
    } else if (kind === 'pdf' || kind === 'audio' || kind === 'video') {
      add(tr('ui.188'), 'vwb-btn-pri', () => shellOpenPath(note.absPath));
      addInObsidian(tr('ui.176'));
    } else if (kind === 'text') {
      if (editable) add(tr('ui.184'), 'vwb-btn-pri', () => this.setDocMode('edit'));
      add(tr('ui.183'), '', () => shellOpenPath(note.absPath));
    } else {
      add(tr('ui.188'), 'vwb-btn-pri', () => shellOpenPath(note.absPath));
      add(tr('preview.openFolderMenu'), '', () => shellReveal(note.absPath));
    }

    add(this.prevMax ? tr('ui.189') : tr('ui.190'), '', () => this.togglePreviewMax());
    if (!editing) {
      add(tr('ui.191'), '', () => {
        const p = note.external ? note.absPath : note.relPath;
        if (navigator.clipboard) navigator.clipboard.writeText(p);
        new Notice(tr('ui.192') + p);
      });
    }
    add(tr('ui.75'), '', () => this.closePreview());
  },

  closePreview() {
    const had = !!this.selectedNote;
    if (this.ctxEl) this.closeEditorMenu();
    if (this.docMode === 'edit') {
      this.dropEmptyPending(); // 空出来的新段还没写字就走了：不留占位空行
      this.flushDocSave();
      this.docMode = 'read';
      this.prevBodyEl.className = 'vwb-prev-body vwb-doc';
    }
    this.disposeCanvas();
    this.editorEl = null;
    this.liveEl = null;
    this.canvasEl = null;
    this.selectedNote = null;
    this.toggleOutline(false);
    if (this.prevMax) this.togglePreviewMax(false);
    this.docHeadings = [];
    if (this.prevEl) this.prevEl.removeClass('is-on');
    if (had && this.areaEl) this.render(); // 顺手清掉选中高亮
  }

  /* 「在 Obsidian 中打开」统一走新标签页，保留工作台自身不被顶掉 */
});

/* -------------------------------------------------------------------------
 *  工作台视图 · 设置面板（外观 / 打开方式 / 库管理 / 日志 / 关于）
 *  （本片段由 build.js 拼进 main.js，不要单独 require）
 * ------------------------------------------------------------------------- */
Object.assign(WorkbenchView.prototype, {
  renderDrawer() {
    const el = this.drawerEl;
    if (!el) return;
    el.empty();
    el.className = 'vwb-drawer vwb-glass' + (this.drawerOpen ? ' is-on' : '');
    if (!this.drawerOpen) return;

    const PAGES = [
      ['appearance', tr('drawer.nav.appearance')],
      ['editor', tr('drawer.nav.editor')],
      ['open', tr('drawer.nav.open')],
      ['guide', tr('drawer.nav.guide')],
      ['vaults', tr('drawer.nav.vaults')],
      ['logs', tr('drawer.nav.logs')],
      ['trash', tr('drawer.nav.trash')],
      ['about', tr('drawer.nav.about')]
    ];
    const page = PAGES.some((p) => p[0] === this.drawerPage) ? this.drawerPage : 'appearance';
    this.drawerPage = page;
    const pageName = (PAGES.find((p) => p[0] === page) || PAGES[0])[1];

    const head = el.createDiv({ cls: 'vwb-drawer-head' });
    head.createDiv({ cls: 'vwb-drawer-t', text: tr('drawer.title', { page: pageName }) });
    head.createEl('button', { cls: 'vwb-btn vwb-btn-sm', text: tr('drawer.collapse') })
      .addEventListener('click', () => this.toggleDrawer(false));

    const wrap = el.createDiv({ cls: 'vwb-drawer-wrap' });
    const nav = wrap.createDiv({ cls: 'vwb-drawer-nav' });
    for (const p of PAGES) {
      const it = nav.createDiv({ cls: 'vwb-drawer-nav-i' + (p[0] === page ? ' is-on' : ''), text: p[1] });
      it.addEventListener('click', () => { this.drawerPage = p[0]; this.renderDrawer(); });
    }
    const box = wrap.createDiv({ cls: 'vwb-drawer-body' });
    if (page === 'appearance') this.renderPageAppearance(box);
    else if (page === 'editor') this.renderPageEditor(box);
    else if (page === 'open') this.renderPageOpen(box);
    else if (page === 'guide') this.renderPageGuide(box);
    else if (page === 'vaults') this.renderPageVaults(box);
    else if (page === 'logs') this.renderPageLogs(box);
    else if (page === 'trash') this.renderPageTrash(box);
    else this.renderPageAbout(box);
  },

  /* -------------------------------------------------------- 设置子页：外观 */
  renderPageAppearance(body) {
    const s = this.plugin.settings;
    const ap = this.effectiveAppearance();
    const scopeName = (s.perVaultAppearance && this.selectedVault)
      ? tr('drawer.appearance.scope.per', { name: baseNameOf(this.selectedVault) })
      : tr('drawer.appearance.scope.global');

    /* 风格预设 */
    let sec = body.createDiv({ cls: 'vwb-sec' });
    sec.createEl('h5', { text: tr('drawer.appearance.preset') });
    let chips = sec.createDiv({ cls: 'vwb-chips' });
    for (const key of Object.keys(PRESETS)) {
      const c = chips.createDiv({ cls: 'vwb-chip' + (ap.preset === key ? ' is-on' : ''), text: tr('preset.' + key) });
      c.addEventListener('click', () => {
        markOn(c);
        const p = PRESETS[key];
        this.setApp('preset', key, true);
        this.setApp('blur', p.blur, true);
        this.setApp('dim', p.dim, true);
        if (key === 'mag') this.setApp('density', 'loose', true);
        this.render();       // 密度/预设可能影响网格
        this.renderDrawer(); // 预设会改动滑杆数值，重建一次同步 UI
      });
    }

    /* 工作台壁纸 */
    sec = body.createDiv({ cls: 'vwb-sec' });
    sec.createEl('h5', { text: tr('drawer.appearance.wallpaper') });
    chips = sec.createDiv({ cls: 'vwb-chips' });
    for (const key of Object.keys(WALLPAPERS)) {
      const w = chips.createDiv({
        cls: 'vwb-wp' + ((ap.wallpaper === key && !asStr(ap.customImage)) ? ' is-on' : ''),
        text: tr('wp.' + key)
      });
      w.style.background = key === 'none' ? '#26262a' : WALLPAPERS[key].css;
      w.addEventListener('click', () => {
        markOn(w);
        this.customFileName = '';
        this.setApp('wallpaper', key, true);
        this.setApp('customImage', '', true);
        fileSpan.setText(tr('drawer.appearance.noFile'));
        this.render();
      });
    }

    const rowFile = sec.createDiv({ cls: 'vwb-rowset' });
    rowFile.createEl('span', { cls: 'lb', text: tr('drawer.appearance.custom') });
    const fileBtn = rowFile.createEl('button', { cls: 'vwb-btn vwb-btn-sm', text: tr('drawer.appearance.pick') });
    const fileSpan = rowFile.createEl('span', { cls: 'vwb-file' });
    const curImg = asStr(ap.customImage);
    fileSpan.setText(this.customFileName || (curImg ? (/^data:/i.test(curImg) ? tr('drawer.appearance.loaded') : baseNameOf(curImg)) : tr('drawer.appearance.noFile')));
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.addEventListener('change', () => {
      const f = fileInput.files && fileInput.files[0];
      if (!f) return;
      const realPath = asStr(f.path); // 旧版 Electron 才有，有就用路径（data.json 更干净）
      if (realPath) {
        this.customFileName = f.name;
        this.setApp('wallpaper', 'none', true);
        this.setApp('customImage', realPath, true);
        this.plugin.wallpaperCache = { key: '', url: '' };
        this.render();
        this.renderDrawer();
        new Notice(tr('drawer.appearance.wpApplied'));
        return;
      }
      if (f.size > 8 * 1024 * 1024) {
        new Notice(tr('drawer.appearance.wpTooBig'));
        return;
      }
      if (f.size > 2 * 1024 * 1024) new Notice(tr('drawer.appearance.wpLarge', { size: fmtSize(f.size) }));
      const rd = new FileReader();
      rd.onload = () => {
        this.customFileName = f.name;
        this.setApp('wallpaper', 'none', true);
        this.setApp('customImage', String(rd.result), true);
        this.render();
        this.renderDrawer();
        new Notice(tr('drawer.appearance.wpApplied'));
      };
      rd.readAsDataURL(f);
    });
    fileBtn.addEventListener('click', () => fileInput.click());

    /* 暗化 / 模糊 */
    const rowDim = sec.createDiv({ cls: 'vwb-rowset' });
    rowDim.createEl('span', { cls: 'lb', text: tr('drawer.appearance.dim') });
    const dimIn = rowDim.createEl('input', { type: 'range' });
    dimIn.min = '0'; dimIn.max = '80'; dimIn.step = '5';
    dimIn.value = String(Math.round((typeof ap.dim === 'number' ? ap.dim : 0.25) * 100));
    const dimVal = rowDim.createEl('span', { cls: 'val', text: dimIn.value + '%' });
    dimIn.addEventListener('input', () => {
      dimVal.setText(dimIn.value + '%');
      this.setApp('dim', Number(dimIn.value) / 100, true);
    });

    const rowBlur = sec.createDiv({ cls: 'vwb-rowset' });
    rowBlur.createEl('span', { cls: 'lb', text: tr('drawer.appearance.blur') });
    const blurIn = rowBlur.createEl('input', { type: 'range' });
    blurIn.min = '0'; blurIn.max = '40'; blurIn.step = '1';
    blurIn.value = String(typeof ap.blur === 'number' ? ap.blur : 20);
    const blurVal = rowBlur.createEl('span', { cls: 'val', text: blurIn.value + 'px' });
    blurIn.addEventListener('input', () => {
      blurVal.setText(blurIn.value + 'px');
      this.setApp('blur', Number(blurIn.value), true);
    });
    for (const r of [dimIn, blurIn]) r.addEventListener('keydown', (e) => e.stopPropagation());

    /* 主题色 */
    sec = body.createDiv({ cls: 'vwb-sec' });
    sec.createEl('h5', { text: tr('drawer.appearance.accent') });
    const swRow = sec.createDiv({ cls: 'vwb-chips' });
    const ACCENTS = ['#7f6df2', '#3aa0f0', '#e05561', '#2fb87a', '#e0a03a'];
    for (const c of ACCENTS) {
      const sw = swRow.createDiv({ cls: 'vwb-sw' + (asStr(ap.accent).toLowerCase() === c ? ' is-on' : '') });
      sw.style.background = c;
      sw.addEventListener('click', () => {
        markOn(sw);
        colorIn.value = c;
        this.setApp('accent', c, true);
      });
    }
    const colorIn = swRow.createEl('input', { type: 'color' });
    colorIn.value = /^#[0-9a-f]{6}$/i.test(asStr(ap.accent)) ? ap.accent : '#7f6df2';
    colorIn.addEventListener('input', () => {
      this.setApp('accent', colorIn.value, true);
    });

    /* 布局 */
    sec = body.createDiv({ cls: 'vwb-sec' });
    sec.createEl('h5', { text: tr('drawer.appearance.density') });
    chips = sec.createDiv({ cls: 'vwb-chips' });
    [['tight', tr('common.compact')], ['comfy', tr('common.standard')], ['loose', tr('common.loose')]].forEach((o) => {
      const c = chips.createDiv({ cls: 'vwb-chip' + (ap.density === o[0] ? ' is-on' : ''), text: o[1] });
      c.addEventListener('click', () => { markOn(c); this.setApp('density', o[0]); });
    });

    /* 行为 */
    sec = body.createDiv({ cls: 'vwb-sec' });
    sec.createEl('h5', { text: tr('drawer.appearance.behavior') });
    chips = sec.createDiv({ cls: 'vwb-chips' });
    [['side', tr('common.side')], ['float', tr('common.float')], ['bottom', tr('common.bottom')]].forEach((o) => {
      const c = chips.createDiv({ cls: 'vwb-chip' + (ap.previewPos === o[0] ? ' is-on' : ''), text: o[1] });
      c.addEventListener('click', () => { markOn(c); this.setApp('previewPos', o[0], true); });
    });

    const tgRow = (label, checked, onChange, testid) => {
      const wrap = sec.createEl('label', { cls: 'vwb-tg' });
      if (testid) wrap.setAttribute('data-testid', testid);
      const cb = wrap.createEl('input', { type: 'checkbox' });
      cb.checked = !!checked;
      cb.addEventListener('change', () => onChange(cb.checked));
      wrap.createEl('span', { text: label });
    };
    tgRow(tr('drawer.tg.stats'), ap.showStats, (v) => this.setApp('showStats', v), 'vh-drawer-tg-stats');
    tgRow(tr('drawer.tg.meta'), ap.showMeta, (v) => this.setApp('showMeta', v), 'vh-drawer-tg-meta');
    tgRow(tr('drawer.tg.summary'), ap.showSummary !== false, (v) => this.setApp('showSummary', v), 'vh-drawer-tg-summary');
    tgRow(tr('drawer.tg.pervault'), s.perVaultAppearance, (v) => {
      s.perVaultAppearance = v;
      if (v && this.selectedVault) {
        if (!s.vaultAppearance) s.vaultAppearance = {};
        if (!s.vaultAppearance[this.selectedVault]) {
          s.vaultAppearance[this.selectedVault] = Object.assign({}, s.appearance);
        }
      }
      this.plugin.saveSettings();
      this.applyAppearance();
      this.render();
      this.renderDrawer();
    }, 'vh-drawer-tg-pervault');

    // 界面语言：跟随 Obsidian / 中文 / English（和原生设置页是同一份设置）
    const langRow = sec.createDiv({ cls: 'vwb-langrow' });
    langRow.createEl('span', { text: tr('set.lang.name') });
    const langChips = langRow.createDiv({ cls: 'vwb-chips' });
    [['auto', tr('set.lang.auto')], ['zh', tr('set.lang.zh')], ['en', tr('set.lang.en')]].forEach((o) => {
      const cur = s.ui.lang || 'auto';
      const c = langChips.createDiv({ cls: 'vwb-chip' + (cur === o[0] ? ' is-on' : ''), text: o[1] });
      c.addEventListener('click', async () => {
        if ((s.ui.lang || 'auto') === o[0]) return;
        s.ui.lang = o[0];
        await this.plugin.saveSettings();
        this.plugin.applyLang();   // 会重画视图、抽屉和原生设置页
        new Notice(tr('set.lang.name') + '：' + o[1]);
      });
    });

    const scope = body.createDiv({ cls: 'vwb-scope', text: tr('drawer.appearance.scope', { scope: scopeName }) });
    scope.addEventListener('click', () => new Notice(tr('drawer.appearance.scope', { scope: scopeName })));

    /* 底部 */
    const foot = body.createDiv({ cls: 'vwb-drawer-foot' });
    foot.createEl('button', { cls: 'vwb-btn vwb-btn-pri vwb-drawer-save', text: tr('drawer.appearance.save') })
      .addEventListener('click', () => {
        this.plugin.saveSettings();
        this.applyAppearance();
        this.render();
        new Notice(tr('drawer.appearance.saved'));
      });
    foot.createDiv({ cls: 'vwb-link', text: tr('drawer.appearance.native') })
      .addEventListener('click', () => this.openPluginSettings());
  },

  /* ---------------------------------------------------- 设置子页：打开方式 */
  renderPageOpen(body) {
    const cur = openModeOf(this.plugin.settings.open.mode);
    const sec = body.createDiv({ cls: 'vwb-sec' });
    sec.createEl('h5', { text: tr('drawer.open.title') });
    sec.createDiv({ cls: 'vwb-note', text: tr('drawer.open.note') });

    for (const m of OPEN_MODES) {
      const card = sec.createDiv({ cls: 'vwb-mode' + (m.id === cur.id ? ' is-on' : '') });
      const hd = card.createDiv({ cls: 'vwb-mode-hd' });
      hd.createEl('span', { cls: 'vwb-mode-nm', text: tr('mode.open.' + m.id + '.label') + (m.def ? tr('drawer.open.def') : '') });
      if (m.id === cur.id) hd.createEl('span', { cls: 'vwb-mode-ck', text: tr('drawer.open.using') });
      card.createDiv({ cls: 'vwb-mode-ds', text: tr('mode.open.' + m.id + '.tip') });
      card.setAttribute('title', tr('mode.open.' + m.id + '.tip'));
      card.addEventListener('click', () => {
        this.plugin.setOpenMode(m.id);
        this.renderDrawer();
      });
    }

    const tip = body.createDiv({ cls: 'vwb-note', text: tr('drawer.open.guide') });
    tip.addEventListener('click', () => { this.drawerPage = 'guide'; this.renderDrawer(); });
  },

  /* ---------------------------------------------------- 设置子页：编辑器 */
  renderPageEditor(body) {
    const s = this.plugin.settings;
    if (!s.editor) s.editor = { mode: 'live', syncScroll: true };
    const cur = editorModeOf(s.editor.mode);

    const sec = body.createDiv({ cls: 'vwb-sec' });
    sec.createEl('h5', { text: tr('drawer.editor.title') });
    sec.createDiv({ cls: 'vwb-note', text: tr('drawer.editor.note') });
    for (const m of EDITOR_MODES) {
      const card = sec.createDiv({ cls: 'vwb-mode' + (m.id === cur.id ? ' is-on' : '') });
      const hd = card.createDiv({ cls: 'vwb-mode-hd' });
      hd.createEl('span', { cls: 'vwb-mode-nm', text: tr('mode.editor.' + m.id + '.label') + (m.def ? tr('drawer.open.def') : '') });
      if (m.id === cur.id) hd.createEl('span', { cls: 'vwb-mode-ck', text: tr('drawer.open.using') });
      card.createDiv({ cls: 'vwb-mode-ds', text: tr('mode.editor.' + m.id + '.tip') });
      card.setAttribute('title', tr('mode.editor.' + m.id + '.tip'));
      card.addEventListener('click', () => {
        this.setEditorMode(m.id);
        this.renderDrawer();
      });
    }

    const sec2 = body.createDiv({ cls: 'vwb-sec' });
    sec2.createEl('h5', { text: tr('drawer.editor.split') });
    const tgRow = (label, checked, onChange) => {
      const w = sec2.createEl('label', { cls: 'vwb-tg' });
      const cb = w.createEl('input', { type: 'checkbox' });
      cb.checked = !!checked;
      cb.addEventListener('change', () => onChange(cb.checked));
      w.createEl('span', { text: label });
    };
    tgRow(tr('drawer.editor.sync'), s.editor.syncScroll !== false, (v) => {
      s.editor.syncScroll = v;
      this.plugin.saveSettings();
      if (this.docMode === 'edit') this.buildEditor(this.selectedNote);
    });

    const sec3 = body.createDiv({ cls: 'vwb-sec' });
    sec3.createEl('h5', { text: tr('drawer.editor.scKeys') });
    for (const r of SHORTCUTS.editor) {
      const row = sec3.createDiv({ cls: 'vwb-kv' });
      row.createEl('kbd', { text: tr(r[0]) });
      row.createEl('span', { text: tr(r[1]) });
    }

    const sec4 = body.createDiv({ cls: 'vwb-sec' });
    sec4.createEl('h5', { text: tr('drawer.editor.scPara') });
    for (const r of SHORTCUTS.para) {
      const row = sec4.createDiv({ cls: 'vwb-kv' });
      row.createEl('kbd', { text: tr(r[0]) });
      row.createEl('span', { text: tr(r[1]) });
    }

    const sec5 = body.createDiv({ cls: 'vwb-sec' });
    sec5.createEl('h5', { text: tr('drawer.editor.scCanvas') });
    for (const r of SHORTCUTS.canvas) {
      const row = sec5.createDiv({ cls: 'vwb-kv' });
      row.createEl('kbd', { text: tr(r[0]) });
      row.createEl('span', { text: tr(r[1]) });
    }
    sec5.createDiv({ cls: 'vwb-note', text: tr('drawer.editor.canvasNote') });
  },

  /* -------------------------------------------------- 设置子页：使用说明 */
  renderPageGuide(body) {
    const sec = body.createDiv({ cls: 'vwb-sec' });
    sec.createEl('h5', { text: tr('guide.quick') });
    for (let gi = 1; gi <= 6; gi++) sec.createDiv({ cls: 'vwb-log', text: tr('guide.step' + gi) });

    const sec2 = body.createDiv({ cls: 'vwb-sec' });
    sec2.createEl('h5', { text: tr('guide.feats') });
    for (let gi = 1; gi <= 15; gi++) sec2.createDiv({ cls: 'vwb-log', text: tr('guide.feat' + gi) });


    const sec3 = body.createDiv({ cls: 'vwb-sec' });
    sec3.createEl('h5', { text: tr('ui.193') });
    for (const r of SHORTCUTS.editor) {
      const row = sec3.createDiv({ cls: 'vwb-kv' });
      row.createEl('kbd', { text: tr(r[0]) });
      row.createEl('span', { text: tr(r[1]) });
    }

    const sec3b = body.createDiv({ cls: 'vwb-sec' });
    sec3b.createEl('h5', { text: tr('guide.paraKeys') });
    for (const r of SHORTCUTS.para) {
      const row = sec3b.createDiv({ cls: 'vwb-kv' });
      row.createEl('kbd', { text: tr(r[0]) });
      row.createEl('span', { text: tr(r[1]) });
    }

    const sec3c = body.createDiv({ cls: 'vwb-sec' });
    sec3c.createEl('h5', { text: tr('guide.canvasKeys') });
    for (const r of SHORTCUTS.canvas) {
      const row = sec3c.createDiv({ cls: 'vwb-kv' });
      row.createEl('kbd', { text: tr(r[0]) });
      row.createEl('span', { text: tr(r[1]) });
    }

    const sec3d = body.createDiv({ cls: 'vwb-sec' });
    sec3d.createEl('h5', { text: tr('guide.readCopy') });
    for (const r of SHORTCUTS.read) {
      const row = sec3d.createDiv({ cls: 'vwb-kv' });
      row.createEl('kbd', { text: tr(r[0]) });
      row.createEl('span', { text: tr(r[1]) });
    }

    const sec3e = body.createDiv({ cls: 'vwb-sec' });
    sec3e.createEl('h5', { text: tr('guide.fileKeys') });
    for (const r of SHORTCUTS.files) {
      const row = sec3e.createDiv({ cls: 'vwb-kv' });
      row.createEl('kbd', { text: tr(r[0]) });
      row.createEl('span', { text: tr(r[1]) });
    }

    const sec4 = body.createDiv({ cls: 'vwb-sec' });
    sec4.createEl('h5', { text: tr('guide.navKeys') });
    for (const r of SHORTCUTS.nav) {
      const row = sec4.createDiv({ cls: 'vwb-kv' });
      row.createEl('kbd', { text: tr(r[0]) });
      row.createEl('span', { text: tr(r[1]) });
    }

    const sec5 = body.createDiv({ cls: 'vwb-sec' });
    sec5.createEl('h5', { text: tr('guide.iconTitle') });
    const rows5 = [
      ['👁', tr('guide.icon1')],
      [tr('ui.194'), tr('guide.icon2')],
      ['☰', tr('guide.icon3')],
      ['⤢ / ⤡', tr('guide.icon4')],
      [tr('ui.185'), tr('guide.icon5')]
    ];
    for (const r of rows5) {
      const row = sec5.createDiv({ cls: 'vwb-kv' });
      row.createEl('kbd', { text: tr(r[0]) });
      row.createEl('span', { text: tr(r[1]) });
    }
  },

  /* ---------------------------------------------------- 设置子页：库管理 */
  renderPageVaults(body) {
    const s = this.plugin.settings;
    const sec = body.createDiv({ cls: 'vwb-sec' });
    sec.createEl('h5', { text: tr('ui.195') });
    sec.createDiv({
      cls: 'vwb-note',
      text: tr('ui.196') +
        tr('ui.197') +
        tr('ui.198')
    });

    const list = this.plugin.discoverVaults();
    const hidden = s.vaults.hidden || [];
    const all = list.concat(
      hidden.filter((p) => !list.some((v) => v.id === p))
        .map((p) => ({ id: p, name: baseNameOf(p), path: p, current: false, hidden: true }))
    );
    if (!all.length) sec.createDiv({ cls: 'vwb-cnt', text: tr('ui.199') });

    for (const v of all) {
      const st = (v.wb == null) ? this.plugin.workbenchStateOf(v.path) : { state: v.wb, ver: v.wbVer };
      const row = sec.createDiv({ cls: 'vwb-vrow' + (v.hidden ? ' is-off' : '') });
      row.createDiv({ cls: 'vwb-vrow-nm', text: (v.current ? '● ' : '') + v.name + (v.hidden ? tr('drawer.vaults.hidden') : '') });
      row.createDiv({ cls: 'vwb-vrow-pt', text: v.path });

      const sw = row.createDiv({ cls: 'vwb-chip' + (v.current ? ' is-off' : ' is-on'), text: v.current ? tr('drawer.vaults.current') : tr('drawer.vaults.switch') });
      sw.setAttribute('title', v.current
        ? tr('ui.200')
        : (looksLikeVault(v.path)
          ? tr('ui.201')
          : tr('ui.202')));
      sw.addEventListener('click', () => {
        if (v.hidden) { new Notice(tr('ui.203')); return; }
        this.plugin.switchToVault(v.path);
      });

      const inst = row.createDiv({
        cls: 'vwb-chip' + (v.current || st.state === 'ok' ? '' : ' is-on'),
        text: v.current ? tr('drawer.vaults.installed') : (st.state === 'stale' ? tr('drawer.vaults.update') : (st.state === 'ok' ? tr('drawer.vaults.installed') : tr('drawer.vaults.install')))
      });
      inst.setAttribute('title', v.current || st.state === 'ok'
        ? tr('ui.204')
        : tr('ui.205'));
      inst.addEventListener('click', () => {
        if (v.current || st.state === 'ok') return;
        const d = this.plugin.deployWorkbenchTo(v.path);
        if (!d.ok) new Notice(tr('ui.206') + (d.reason || tr('ui.207')));
        else if (d.changed) {
          new Notice(!d.from
            ? tr('ui.208') + v.name + tr('ui.209')
            : tr('drawer.vaultUpdatedTo', { name: v.name, ver: d.to }), 10000);
        } else {
          new Notice('「' + v.name + tr('ui.211'));
        }
        this.renderDrawer();
        this.renderRail();
      });

      const tg = row.createDiv({ cls: 'vwb-chip' + (v.hidden ? '' : ' is-on'), text: v.hidden ? tr('common.show') : tr('common.hide') });
      tg.addEventListener('click', () => {
        const h = s.vaults.hidden;
        const i = h.indexOf(v.id);
        if (v.hidden) { if (i >= 0) h.splice(i, 1); }
        else if (i < 0) h.push(v.id);
        this.plugin.saveSettings();
        this.plugin.refreshViews();
        this.renderRail();
        this.renderDrawer();
      });
    }

    const sec2 = body.createDiv({ cls: 'vwb-sec' });
    sec2.createEl('h5', { text: tr('drawer.vaults.addTitle') });
    const rowAdd = sec2.createDiv({ cls: 'vwb-rowset' });
    rowAdd.createEl('span', { cls: 'lb', text: tr('common.path') });
    const inAdd = rowAdd.createEl('input', { type: 'text', placeholder: tr('ui.212') });
    inAdd.className = 'vwb-in';
    inAdd.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') this.addExtraVault(inAdd.value);
    });
    const btnAdd = rowAdd.createEl('button', { cls: 'vwb-btn vwb-btn-sm', text: tr('common.add') });
    btnAdd.addEventListener('click', () => this.addExtraVault(inAdd.value));

    if ((s.vaults.extra || []).length) {
      const sec3 = body.createDiv({ cls: 'vwb-sec' });
      sec3.createEl('h5', { text: tr('drawer.vaults.addedTitle') });
      for (const p of s.vaults.extra.slice()) {
        const r = sec3.createDiv({ cls: 'vwb-vrow' });
        r.createDiv({ cls: 'vwb-vrow-pt', text: p });
        const rm = r.createDiv({ cls: 'vwb-chip', text: tr('common.remove') });
        rm.addEventListener('click', () => {
          // 本库设置 + 全局清单一起删，不然切个库它又回来了
          this.plugin.forgetVaultPath(p);
          this.plugin.refreshViews();
          this.renderRail();
          this.renderDrawer();
        });
      }
    }

    const sec4 = body.createDiv({ cls: 'vwb-sec' });
    sec4.createEl('h5', { text: tr('ui.213') });
    sec4.createDiv({
      cls: 'vwb-note',
      text: tr('ui.214') +
        tr('ui.215') + sharedVaultsPath()
    });
  },

  /* 手动添加：写进本库设置的同时也写进全局清单 ——
   * 只写本库的话，切到别的库这个登记就没了（清单跟着库走 = 每次切库都要重加）。 */
  addExtraVault(v) {
    const p = (v || '').trim().replace(/\\/g, '/').replace(/\/+$/, '');
    if (!p || p.length < 3) return;
    const extra = this.plugin.settings.vaults.extra;
    if (extra.indexOf(p) >= 0) { new Notice(tr('ui.216')); return; }
    this.plugin.registerVaultPath(p);
    this.plugin.refreshViews();
    this.renderRail();
    this.renderDrawer();
    new Notice(looksLikeVault(p)
      ? tr('ui.217') + p
      : tr('ui.217') + p + tr('ui.218'), 8000);
  },

  /* -------------------------------------------------- 设置子页：操作日志 */
  renderPageLogs(body) {
    const sec = body.createDiv({ cls: 'vwb-sec' });
    sec.createEl('h5', { text: tr('drawer.logs.title') });
    sec.createDiv({
      cls: 'vwb-note',
      text: tr('ui.219')
    });
    const logs = this.plugin.opLog || [];
    if (!logs.length) {
      sec.createDiv({ cls: 'vwb-cnt', text: tr('drawer.logs.empty') });
    } else {
      for (const op of logs.slice(0, 40)) {
        const row = sec.createDiv({ cls: 'vwb-log' });
        row.createEl('span', {
          text: fmtDate(op.ts) + ' · ' + op.type + ' · ' + (op.path || '')
        });
        if (op.undo) {
          const ub = row.createDiv({ cls: 'vwb-chip', text: tr('common.undo') });
          ub.setAttribute('title', tr('ui.220'));
          ub.addEventListener('click', () => this.undoOp(op));
        }
      }
    }

    const sec2 = body.createDiv({ cls: 'vwb-sec' });
    sec2.createEl('h5', { text: tr('drawer.logs.index') });
    const row = sec2.createDiv({ cls: 'vwb-rowset' });
    row.createEl('span', { cls: 'lb', text: tr('drawer.logs.external') });
    row.createEl('button', { cls: 'vwb-btn vwb-btn-sm', text: tr('common.rescan') })
      .addEventListener('click', () => {
        this.plugin.externalCache = {};
        this.render();
        new Notice(tr('ui.221'));
      });
    // 跨库全文搜索的索引：清掉之后下次搜索会重建（改了很多笔记觉得搜不准时用）
    const row2 = sec2.createDiv({ cls: 'vwb-rowset' });
    row2.createEl('span', { cls: 'lb', text: tr('drawer.logs.searchIdx') });
    row2.createEl('button', { cls: 'vwb-btn vwb-btn-sm', text: tr('common.rebuild') })
      .addEventListener('click', () => {
        this.plugin.clearSearchIndexes();
        this.crossHits = null;
        new Notice(tr('ui.222'));
      });
    sec2.createDiv({
      cls: 'vwb-note',
      text: tr('ui.223') + searchIndexDir() + tr('ui.224')
    });
  },

  /* ---------------------------------------------------- 设置子页：回收站 */
  /* 在别的库里删掉的东西，不用再跑到各自的库里去翻 .trash —— 这里一次看全，
   * 能还原到原位置（原路径记在 .trash 的映射表里，重启也不丢）。 */
  renderPageTrash(body) {
    const sec = body.createDiv({ cls: 'vwb-sec' });
    sec.createEl('h5', { text: tr('drawer.trash.title') });
    sec.createDiv({
      cls: 'vwb-note',
      text: tr('ui.225') +
        tr('ui.226')
    });
    const groups = this.plugin.trashList();
    if (!groups.length) {
      sec.createDiv({ cls: 'vwb-cnt', text: tr('drawer.trash.empty') });
      return;
    }
    for (const g of groups) {
      const box = body.createDiv({ cls: 'vwb-sec' });
      const head = box.createDiv({ cls: 'vwb-trash-h' });
      head.createEl('span', { text: g.vaultName + ' · ' + tr('drawer.trash.items', { n: g.items.length }) });
      const clr = head.createDiv({ cls: 'vwb-chip', text: tr('drawer.trash.clear') });
      clr.setAttribute('title', tr('ui.227'));
      clr.addEventListener('click', () => {
        this.confirmBox({
          title: tr('ui.228') + g.vaultName + tr('ui.229'),
          desc: tr('ui.230') + g.items.length + tr('ui.231'),
          danger: true,
          okText: tr('ui.232'),
          onOk: () => {
            const r = this.plugin.emptyVaultTrash(g.vault);
            new Notice(tr('ui.233') + r.count + tr('ui.234'));
            this.renderDrawer();
            this.render();
          }
        });
      });
      for (const it of g.items) {
        const row = box.createDiv({ cls: 'vwb-trash-i' });
        const main = row.createDiv({ cls: 'vwb-trash-m' });
        main.createDiv({ cls: 'vwb-trash-nm', text: it.isDir ? '📁 ' + it.name : it.name });
        main.createDiv({
          cls: 'vwb-trash-pt',
          text: it.known ? tr('drawer.trash.origin', { path: it.rel }) : tr('drawer.trash.unknown')
        });
        if (it.known) {
          const rb = row.createDiv({ cls: 'vwb-chip is-on', text: tr('drawer.trash.restore') });
          rb.setAttribute('title', tr('drawer.trash.origin', { path: it.rel }));
          rb.addEventListener('click', () => {
            const r = this.plugin.restoreTrashItem(g.vault, it.name);
            new Notice(r.ok ? (tr('ui.235') + it.rel) : r.reason);
            this.renderDrawer();
            this.render();
          });
        } else {
          row.createDiv({ cls: 'vwb-chip is-off', text: tr('drawer.trash.cant') });
        }
        const pb = row.createDiv({ cls: 'vwb-chip', text: tr('drawer.trash.purge') });
        pb.setAttribute('title', tr('ui.236'));
        pb.addEventListener('click', () => {
          this.confirmBox({
            title: tr('ui.237'),
            desc: it.name + tr('ui.238'),
            danger: true,
            okText: tr('ui.93'),
            onOk: () => {
              this.plugin.purgeTrashItem(g.vault, it.name);
              this.renderDrawer();
              this.render();
            }
          });
        });
      }
    }
  },

  /* 撤销一步外部库操作（重命名 / 删除） */
  undoOp(op) {
    if (!op || !op.undo) return;
    this.confirmBox({
      title: tr('ui.239'),
      desc: tr('ui.240') + (op.path || '') + tr('ui.241') + (op.refs ? tr('ui.242') + op.refs + tr('ui.243') : ''),
      okText: tr('drawer.undo'),
      onOk: () => {
        const r = op.undo === 'ext-rename' ? this.plugin.undoExtRename(op) : this.plugin.undoExtDelete(op);
        if (!r.ok) { new Notice(r.reason || tr('ui.244')); return; }
        new Notice(tr('ui.245') + (op.path || ''));
        this.renderDrawer();
        this.render();
      }
    });
  },

  /* ------------------------------------------------------ 设置子页：关于 */
  renderPageAbout(body) {
    const sec = body.createDiv({ cls: 'vwb-sec' });
    sec.createEl('h5', { text: tr('about.title') });
    sec.createDiv({ cls: 'vwb-note', text: tr('about.intro') });
    sec.createDiv({ cls: 'vwb-log', text: tr('about.version', { ver: (this.plugin.manifest && this.plugin.manifest.version ? this.plugin.manifest.version : '-') }) });
    sec.createDiv({ cls: 'vwb-log', text: tr('about.rail') });
    sec.createDiv({ cls: 'vwb-log', text: tr('about.editor') });
    sec.createDiv({ cls: 'vwb-log', text: tr('about.roadmap') });
    body.createDiv({ cls: 'vwb-link', text: tr('drawer.about.guide') })
      .addEventListener('click', () => { this.drawerPage = 'guide'; this.renderDrawer(); });
    body.createDiv({ cls: 'vwb-link', text: tr('ui.246') })
      .addEventListener('click', () => this.openPluginSettings());
  }

  /* ------------------------------------------------------------ render */
});

/* -------------------------------------------------------------------------
 *  工作台视图 · 两个通用浮层（输入 / 确认）
 *  （本片段由 build.js 拼进 main.js，不要单独 require）
 *  -------------------------------------------------------------------------
 *  为什么自己写而不用 Obsidian 的 Modal：
 *   1. 风格要和工作台一致（毛玻璃）
 *   2. 冒烟测试里要能「点得到」—— 用 DOM 构建，测试替身也能跑
 *   3. 只需要「一句话输入」和「是 / 否」，Modal 太重
 * ------------------------------------------------------------------------- */
Object.assign(WorkbenchView.prototype, {
  closeDialog(el) {
    if (!el) return;
    try {
      if (typeof el.remove === 'function') el.remove();
      else if (el.parentElement) el.parentElement.removeChild(el);
    } catch (e) { /* 忽略 */ }
  },

  /* 一句话输入：重命名、新建笔记、新建文件夹都用它 */
  promptText(opts) {
    const o = opts || {};
    // ⚠ 挂在视图根（contentEl）：挂 mainEl 的话会被 .vwb-layer 的 z-index:1
    // 锁进自己的层叠上下文，设置抽屉（z-index:40）一打开就把浮层整层压住
    const host = this.contentEl.createDiv({ cls: 'vwb-dlg vwb-glass' });
    host.createDiv({ cls: 'vwb-dlg-t', text: o.title || '' });
    if (o.desc) host.createDiv({ cls: 'vwb-dlg-d', text: o.desc });
    const input = host.createEl('input', { type: 'text', value: o.value || '' });
    input.className = 'vwb-in';
    if (o.placeholder) input.placeholder = o.placeholder;
    const foot = host.createDiv({ cls: 'vwb-dlg-f' });
    const okBtn = foot.createEl('button', {
      cls: 'vwb-btn vwb-btn-sm vwb-btn-pri', text: o.okText || tr('misc.ok')
    });
    foot.createEl('button', { cls: 'vwb-btn vwb-btn-sm', text: tr('misc.cancel') })
      .addEventListener('click', () => {
        this.closeDialog(host);
        if (o.onCancel) o.onCancel();
      });
    const submit = () => {
      const v = String(input.value || '').trim();
      this.closeDialog(host);
      if (o.onOk) o.onOk(v);
    };
    okBtn.addEventListener('click', submit);
    input.addEventListener('keydown', (e) => {
      // 别让 Obsidian 的全局快捷键把输入抢走
      if (e && e.stopPropagation) e.stopPropagation();
      if (e.key === 'Enter') submit();
      else if (e.key === 'Escape') {
        this.closeDialog(host);
        if (o.onCancel) o.onCancel();
      }
    });
    setTimeout(() => { try { input.focus(); } catch (e) { /* 忽略 */ } }, 30);
    return host;
  },

  /* 确认框：所有不可逆操作前都要过它一次 */
  confirmBox(opts) {
    const o = opts || {};
    const host = this.contentEl.createDiv({ cls: 'vwb-dlg vwb-glass' });
    host.createDiv({ cls: 'vwb-dlg-t', text: o.title || tr('misc.confirmTitle') });
    if (o.desc) host.createDiv({ cls: 'vwb-dlg-d', text: o.desc });
    const foot = host.createDiv({ cls: 'vwb-dlg-f' });
    const okBtn = foot.createEl('button', {
      cls: 'vwb-btn vwb-btn-sm' + (o.danger ? ' is-danger' : ' vwb-btn-pri'),
      text: o.okText || tr('dlg.okText')
    });
    foot.createEl('button', { cls: 'vwb-btn vwb-btn-sm', text: tr('misc.cancel') })
      .addEventListener('click', () => {
        this.closeDialog(host);
        if (o.onCancel) o.onCancel();
      });
    okBtn.addEventListener('click', () => {
      this.closeDialog(host);
      if (o.onOk) o.onOk();
    });
    return host;
  }
});

/* -------------------------------------------------------------------------
 *  Obsidian 原生设置中心（通用 / 外观 / 库管理 / 安全与日志 / 关于）
 *  （本片段由 build.js 拼进 main.js，不要单独 require）
 * ------------------------------------------------------------------------- */
class WorkbenchSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.sub = 'general';
  }

  display() {
    const el = this.containerEl;
    el.empty();
    el.createEl('h2', { text: tr('set.title') });

    const tabs = el.createDiv({ cls: 'vwb-set-tabs' });
    const pages = [
      ['general', tr('set.tab.general')],
      ['appearance', tr('set.tab.appearance')],
      ['vaults', tr('set.tab.vaults')],
      ['safety', tr('set.tab.safety')],
      ['about', tr('set.tab.about')]
    ];
    for (const p of pages) {
      const t = tabs.createDiv({ cls: 'vwb-set-tab' + (this.sub === p[0] ? ' is-on' : ''), text: p[1] });
      t.addEventListener('click', () => { this.sub = p[0]; this.display(); });
    }

    if (this.sub === 'general') this.renderGeneral(el);
    if (this.sub === 'appearance') this.renderAppearance(el);
    if (this.sub === 'vaults') this.renderVaults(el);
    if (this.sub === 'safety') this.renderSafety(el);
    if (this.sub === 'about') this.renderAbout(el);
  }

  applyNow() {
    this.plugin.saveSettings();
    this.plugin.refreshViews();
  }

  renderGeneral(el) {
    const op = this.plugin.settings.open;

    // 界面语言：跟随 Obsidian / 中文 / English。改完立刻重画所有 UI
    new Setting(el)
      .setName(tr('set.lang.name'))
      .setDesc(tr('set.lang.desc'))
      .addDropdown((d) => {
        d.addOption('auto', tr('set.lang.auto'));
        d.addOption('zh', tr('set.lang.zh'));
        d.addOption('en', tr('set.lang.en'));
        d.setValue(this.plugin.settings.ui.lang || 'auto');
        d.onChange(async (v) => {
          this.plugin.settings.ui.lang = v;
          await this.plugin.saveSettings();
          this.plugin.applyLang();
          new Notice(tr('set.langChanged', {
            lang: (v === 'auto' ? tr('set.lang.auto') : (v === 'en' ? tr('set.lang.en') : tr('set.lang.zh')))
          }));
        });
      });

    new Setting(el)
      .setName(tr('set.open.name'))
      .setDesc(tr('set.open.desc'))
      .addDropdown((d) => {
        for (const m of OPEN_MODES) d.addOption(m.id, tr('mode.open.' + m.id + '.label') + (m.def ? tr('ui.11') : ''));
        d.setValue(openModeOf(op.mode).id);
        d.onChange(async (v) => {
          this.plugin.setOpenMode(v);
          new Notice(tr('set.openUpdated'));
        });
      });

    el.createEl('p', {
      cls: 'setting-item-description',
      text: tr('set.panelNoteLong')
    });
    el.createEl('p', {
      cls: 'setting-item-description',
      text: tr('set.openTipLong')
    });
  }

  renderAppearance(el) {
    const ap = this.plugin.settings.appearance;

    new Setting(el).setName(tr('set.preset.name')).setDesc(tr('set.preset.desc'))
      .addDropdown((d) => {
        for (const key of Object.keys(PRESETS)) d.addOption(key, tr('preset.' + key));
        d.setValue(ap.preset);
        d.onChange(async (v) => {
          const p = PRESETS[v];
          ap.preset = v;
          ap.blur = p.blur;
          ap.dim = p.dim;
          await this.plugin.saveSettings();
          this.display();
          this.plugin.refreshViews();
        });
      });

    new Setting(el).setName(tr('set.wallpaper.name')).setDesc(tr('set.wallpaper.desc'))
      .addDropdown((d) => {
        for (const key of Object.keys(WALLPAPERS)) d.addOption(key, tr('wp.' + key));
        d.setValue(ap.wallpaper);
        d.onChange(async (v) => { ap.wallpaper = v; ap.customImage = ''; this.applyNow(); this.display(); });
      });

    new Setting(el).setName(tr('set.wallpaperPath.name')).setDesc(tr('set.wallpaperPath.desc'))
      .addText((t) => {
        t.setPlaceholder(tr('set.wallpaperPlaceholder'));
        t.setValue(ap.customImage);
        t.onChange(async (v) => {
          ap.customImage = v.trim();
          this.plugin.wallpaperCache = { key: '', url: '' };
          await this.plugin.saveSettings();
        });
      });

    new Setting(el).setName(tr('set.dim.name')).setDesc(tr('set.dim.desc'))
      .addSlider((s) => {
        s.setLimits(0, 0.8, 0.05).setValue(ap.dim).setDynamicTooltip();
        s.onChange(async (v) => { ap.dim = v; this.applyNow(); });
      });

    new Setting(el).setName(tr('set.blur.name')).setDesc(tr('set.blur.desc'))
      .addSlider((s) => {
        s.setLimits(0, 40, 1).setValue(ap.blur).setDynamicTooltip();
        s.onChange(async (v) => { ap.blur = v; this.applyNow(); });
      });

    new Setting(el).setName(tr('set.accent.name')).setDesc(tr('set.accent.desc'))
      .addText((t) => {
        t.setValue(ap.accent);
        t.onChange(async (v) => { ap.accent = v.trim() || '#7f6df2'; this.applyNow(); });
      });

    new Setting(el).setName(tr('set.accentQuick.name')).setDesc(tr('set.accentQuick.desc'))
      .addButton((b) => { b.setButtonText(tr('set.accentPurple')); b.onClick(async () => { ap.accent = '#7f6df2'; this.applyNow(); this.display(); }); })
      .addButton((b) => { b.setButtonText(tr('set.accentBlue')); b.onClick(async () => { ap.accent = '#3aa0f0'; this.applyNow(); this.display(); }); })
      .addButton((b) => { b.setButtonText(tr('set.accentRed')); b.onClick(async () => { ap.accent = '#e05561'; this.applyNow(); this.display(); }); })
      .addButton((b) => { b.setButtonText(tr('set.accentGreen')); b.onClick(async () => { ap.accent = '#2fb87a'; this.applyNow(); this.display(); }); })
      .addButton((b) => { b.setButtonText(tr('set.accentGold')); b.onClick(async () => { ap.accent = '#e0a03a'; this.applyNow(); this.display(); }); });

    new Setting(el).setName(tr('set.density.name')).setDesc(tr('set.density.desc'))
      .addDropdown((d) => {
        d.addOption('tight', tr('set.density.tight')).addOption('comfy', tr('set.density.comfy')).addOption('loose', tr('set.density.loose'));
        d.setValue(ap.density);
        d.onChange(async (v) => { ap.density = v; this.applyNow(); });
      });

    new Setting(el).setName(tr('set.previewPos.name')).setDesc(tr('set.previewPos.desc'))
      .addDropdown((d) => {
        d.addOption('side', tr('set.pos.side')).addOption('float', tr('set.pos.float')).addOption('bottom', tr('set.pos.bottom'));
        d.setValue(ap.previewPos);
        d.onChange(async (v) => { ap.previewPos = v; this.applyNow(); });
      });

    new Setting(el).setName(tr('set.stats.name')).setDesc(tr('set.stats.desc'))
      .addToggle((t) => t.setValue(ap.showStats).onChange(async (v) => { ap.showStats = v; this.applyNow(); }));

    new Setting(el)
      .setName(tr('set.clickSelected.name'))
      .setDesc(tr('set.clickSelected.desc'))
      .addDropdown((d) => d
        .addOption('open', tr('set.click.open'))
        .addOption('deselect', tr('set.click.deselect'))
        .setValue(this.plugin.settings.view.clickSelected || 'open')
        .onChange(async (v) => {
          this.plugin.settings.view.clickSelected = v;
          await this.plugin.saveSettings();
        }));

    new Setting(el).setName(tr('set.meta.name')).setDesc(tr('set.meta.desc'))
      .addToggle((t) => t.setValue(ap.showMeta).onChange(async (v) => { ap.showMeta = v; this.applyNow(); }));

    new Setting(el).setName(tr('set.summary.name')).setDesc(tr('set.summary.desc'))
      .addToggle((t) => t.setValue(ap.showSummary !== false).onChange(async (v) => { ap.showSummary = v; this.applyNow(); }));

    new Setting(el).setName(tr('set.inbox.name')).setDesc(tr('set.inbox.desc'))
      .addText((t) => t.setValue(this.plugin.settings.view.inbox || 'inbox').onChange(async (v) => {
        this.plugin.settings.view.inbox = String(v || '').trim() || 'inbox';
        await this.plugin.saveSettings();
      }));
  }

  renderVaults(el) {
    el.createEl('p', { text: tr('set.vaultsNote'), cls: 'setting-item-description' });

    const list = this.plugin.discoverVaults();
    const all = list.concat(
      (this.plugin.settings.vaults.hidden || []).map((p) => ({ id: p, name: baseNameOf(p), path: p, current: false, source: 'auto', hidden: true }))
    );

    for (const v of all) {
      new Setting(el)
        .setName((v.current ? '● ' : '') + v.name)
        .setDesc(v.path + (v.source === 'manual' ? tr('set.vault.manual') : '') + (v.hidden ? tr('set.vault.hidden') : ''))
        .addToggle((t) => {
          t.setValue(!v.hidden);
          t.setTooltip(tr('set.toggleShow'));
          t.onChange(async (on) => {
            const hidden = this.plugin.settings.vaults.hidden;
            const key = v.id;
            const idx = hidden.indexOf(key);
            if (on && idx >= 0) hidden.splice(idx, 1);
            if (!on && idx < 0) hidden.push(key);
            await this.plugin.saveSettings();
            this.plugin.refreshViews();
            this.display();
          });
        })
        .addText((txt) => {
          txt.setPlaceholder(tr('set.alias'));
          txt.setValue(this.plugin.settings.vaults.aliases[v.id] || '');
          txt.onChange(async (val) => {
            const aliases = this.plugin.settings.vaults.aliases;
            if (val.trim()) aliases[v.id] = val.trim();
            else delete aliases[v.id];
            await this.plugin.saveSettings();
            this.plugin.refreshViews();
          });
        });
    }

    new Setting(el)
      .setName(tr('set.addVault.name'))
      .setDesc(tr('set.addVault.desc'))
      .addText((t) => {
        t.setPlaceholder(tr('ui.212'));
        t.onChange(async (v) => {
          const p = (v || '').trim().replace(/\\/g, '/');
          if (!p || p.length < 3) return;
          const extra = this.plugin.settings.vaults.extra;
          if (extra.indexOf(p) < 0) {
            extra.push(p);
            await this.plugin.saveSettings();
            this.plugin.refreshViews();
            this.display();
            new Notice(tr('ui.217') + p);
          }
        });
      });
  }

  renderSafety(el) {
    el.createEl('p', { text: tr('set.logNote'), cls: 'setting-item-description' });

    new Setting(el).setName(tr('set.reindex.name')).setDesc(tr('set.reindex.desc'))
      .addButton((b) => b.setButtonText(tr('ui.117')).setCta().onClick(async () => {
        this.plugin.externalCache = {};
        this.plugin.refreshViews();
        new Notice(tr('ui.221'));
      }));

    const logBox = el.createDiv({ cls: 'setting-item' });
    logBox.createEl('div', { cls: 'setting-item-info' }).createEl('div', { cls: 'setting-item-name', text: tr('set.logRecent') });
    const body = logBox.createDiv({ cls: 'setting-item-control' });
    if (!this.plugin.opLog.length) {
      body.createEl('div', { cls: 'setting-item-description', text: tr('set.logEmpty') });
    } else {
      for (const op of this.plugin.opLog.slice(0, 20)) {
        body.createEl('div', { cls: 'setting-item-description', text: fmtDate(op.ts) + ' · ' + op.type + ' · ' + (op.path || '') });
      }
    }
  }

  renderAbout(el) {
    const info = el.createEl('div', { cls: 'setting-item' });
    info.createEl('p', { text: tr('set.aboutIntro') });
    info.createEl('p', { text: tr('set.aboutRoadmap') });
    info.createEl('p', { text: tr('set.aboutPlan') });
  }
}

/* -------------------------------------------------------------------------
 *  导出
 *  （本片段由 build.js 拼进 main.js，不要单独 require）
 * ------------------------------------------------------------------------- */
module.exports = VaultWorkbenchPlugin;
// 供本地冒烟测试引用（Obsidian 只关心默认导出，附加属性无副作用）
module.exports.VaultWorkbenchPlugin = VaultWorkbenchPlugin;
module.exports.WorkbenchView = WorkbenchView;
module.exports.WorkbenchSettingTab = WorkbenchSettingTab;
/* 库切换 / 可移植性的纯函数，冒烟测试直接对它们下断言
 * （Obsidian 侧只认默认导出，附加属性没有副作用） */
module.exports.helpers = {
  /* i18n（冒烟测试要断言 zh / en 两侧 key 集合完全一致） */
  tr, t: tr, setLang, getLang, tid, normLang, detectLang, I18N_ZH, I18N_EN, I18N_DICT,
  appDataDir, obsidianConfigPath, workbenchHome, sharedVaultsPath,
  readJsonFile, writeJsonFile, fsErrorText, cmpVer,
  vaultOpenUri, isCloudSyncedPath, looksLikeVault,
  deployWorkbenchToVault, enablePluginInVault, workbenchVersionIn,
  /* 跨库全文搜索（冒烟测试直接对它们下断言） */
  mdToPlainText, refreshSearchIndex, loadSearchIndex, saveSearchIndex, newSearchIndex,
  searchIndexPath, searchIndexDir, searchTermsOf, matchText, snippetOf, searchIndex, isSearchable,
  /* 外部库的结构改动（先算计划再执行，测试直接对这两步下断言） */
  planLinkRewrite, countRefs, applyLinkRewrite, undoLinkRewrite,
  renameInVault, trashInVault, restoreInVault, createNoteInVault, createFolderInVault,
  copyFileAcross, copyDirAcross, uniqueRelIn, readHeadAbs,
  /* 回收站映射（当前库删除也要能被回收站看到，见 deleteOneLocal） */
  trashCopyInVault, readTrashMap, writeTrashMap, listTrash,
  /* 批量打标（frontmatter 合并，测试直接对纯函数下断言） */
  addTagsToContent, parseTags, mergeTags,
  /* 常量表（冒烟要断言「常量里每个 id 在字典里都查得到」，
     否则会像 preset.dark / preset.minimal 那样键名对不上、界面直接显示 key） */
  PRESETS, WALLPAPERS, EDITOR_MENU, READ_MENU, NEW_MENU, OPEN_MODES, EDITOR_MODES
};
