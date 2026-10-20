# Vault Workbench · 架构与开发笔记

> 面向开发者。**给用户看的介绍在 [README.md](../README.md)，版本记录在 [CHANGELOG.md](../CHANGELOG.md)。**

多库管理工作台插件。当前库走 Obsidian 原生 API，其他仓库通过磁盘只读扫描。

## 怎么跑到 Obsidian 里

- 改 `src/` 下的片段 → `node build.js`（拼成根目录 `main.js`）→ 同步 → 在 Obsidian 里按 `Ctrl+R`
- 一条龙：`bash sync.sh`（Windows 可双击 `sync.bat`），它会自动先 build 再同步
- 同步目标目录通过环境变量 `VWB_VAULT_DIR` 指定；也可以写进 `.dev-local.sh`（已 gitignore，不会泄露你的库路径）
- 首次启用：Obsidian 设置 → 第三方插件 → 关闭「安全模式」→ 找到 **Vault Workbench 库管理工作台** 并开启
- 打开工作台：左侧 ribbon 的「布局网格」图标，或命令面板搜「打开库管理工作台」

> 采用**免构建方案**（纯 CommonJS + `require`），不需要 `npm install`。

## 源码结构

发布时只有 `main.js / manifest.json / styles.css` 三个文件（Obsidian 市场的要求，插件目录里不会有子目录），
所以源码在 `src/` 下按职责拆成多文件，发布前用 `build.js` **按文件名字典序拼接**成单文件。

```
src/
  00-header.js          模块入口：require 声明 + VIEW_TYPE
  10-constants.js       壁纸 / 预设 / DEFAULT_SETTINGS / OPEN_MODES
  20-utils.js           纯函数小工具（fmtSize / debounce / parentOf / asStr…）
  30-filetypes.js       扩展名 → 类型识别、图标、系统打开
  35-vault-link.js      跨机器可移植 + 库切换（平台目录 / 原子 JSON / fs 错误文案 / 自部署 / 切库链接）
  40-vault-source.js    外部库磁盘扫描 + 标签提取
  50-plugin.js          class VaultWorkbenchPlugin：设置 / 库发现 / 索引 / 资源定位
  51-plugin-vaults.js   跨库清单 / 自部署 / 切换库（Object.assign 到 Plugin 原型）
  60-view-core.js       class WorkbenchView 本体：生命周期 / 布局 / 键盘
  61-view-appearance.js 外观（含每库独立配置）
  62-view-rail.js       左侧 obsidian库导航
  63-view-nav.js        目录前进后退 / 搜索
  64-view-list.js       工具条 + 文件区核心（render + 排序分区 + 文件夹树 + 卡片）
  64b-view-menu.js       文件 / 文件夹右键菜单 + 跨库搜索 + 链接双链
  64c-view-batch.js      多选 + 批量操作（复制/移动/标签/重命名）
  64d-view-dashboard.js  仪表盘入口 + 标签面板
  64e-view-views.js      拖拽 + 智能视图菜单
  64f-view-io.js         文件夹列表 + 回收站 + 打开入口 + 新建菜单
  65-view-editor.js      编辑器核心（块解析 + 头部权限 + 读写方式 + 编辑器搭建 + 单画布）
  65b-view-editcmds.js   浏览器选区 + 块编辑 + 输入 + 命令实现 + 剪贴板
  65c-view-editmenu.js   命令分发 + 编辑器右键菜单
  65d-view-editsave.js   双栏滚动同步 + 实时渲染 + 保存
  66-view-preview.js    预览面板：打开 / 渲染 / 大纲 / 多类型
  67-view-settings.js   设置面板七个子页
  70-setting-tab.js     Obsidian 原生设置中心
  99-footer.js          导出
```

**关键约定**：`WorkbenchView` 的方法不写在 class 体内，而是用
`Object.assign(WorkbenchView.prototype, {…})` 按模块挂上去。
好处是每个功能一个文件，多人改不同功能时 PR 不会打架（这也是从 v0.4.0 单文件 2700 行拆出来的原因）。

> 拆分粒度约定（2026-10-16 定）：单个 view 片段**超过 ~800 行就按功能域拆**，
> 每个片段都是独立完整的 `Object.assign(WorkbenchView.prototype, {…})` 块。
> 拆分的切点必须是**方法的注释块起点**（`/* --- … */`），绝不能切断方法体。
> `65-view-editor.js` 顶层的 `parseBlocks` / `headingText` / `READONLY_CMDS`
> 是文件级函数/常量，必须留在该系列的第一个片段里。

## v0.1.0 已实现

| 模块 | 内容 |
| --- | --- |
| 库自动发现 | 读 `%APPDATA%\obsidian\obsidian.json`，所有已注册仓库自动出现，当前库标「当前」；支持隐藏 / 别名 / 手动添加 |
| 浏览 | 文件夹卡片钻取、面包屑导航、网格 / 列表视图、三种排序 |
| 预览 | 点击文件默认在 Obsidian 里铺满原生打开（可切面板预览，见 v0.2.0）；面板位置可切换（侧滑 / 悬浮 / 底部） |
| 搜索 | 当前库文件名 + 标签匹配（防抖 200ms） |
| 新建 | 在当前所选文件夹新建 Markdown 并原生打开，写入操作日志 |
| 统计卡 | 笔记总数 / 本周修改 / 待整理数 / 附件体积 |
| 设置中心 | 子页：通用 · 外观 · 库管理 · 安全与日志 · 关于 |
| 外观 | 毛玻璃预设、5 套壁纸 + 自定义本地图片、暗化与模糊滑杆、主题色与快速选色、布局密度 |
| 外部库 | 磁盘只读扫描（30 秒缓存），预取 frontmatter 标签；MVP 阶段禁写 |

## v0.1.1 修复（2026-10-14）

| 问题 | 根因 | 修法 |
| --- | --- | --- |
| 进下一层后回不去上一层 | 面包屑只有中间段绑了点击，库名那一段没有处理函数；也没有「返回」入口 | 面包屑每段都可点（含库名=回根层）；新增「← 上一级」按钮 `goUp()` |
| 预览文章长条溢出界面 | `.vwb-prev` 是 `.vwb-main`（纵向 flex 列）的子项，`flex:0 0 310px` 在列方向变成高度基准，且整条 flex 链缺 `min-height:0`，正文一长就被撑到屏幕外 | 主区拆成 `topbar + .vwb-content`，`.vwb-content` 为横向 flex；预览成为真正的并排侧栏，面板与正文各自 `min-height:0` + 内部滚动；悬浮/底部模式改为在内容行内绝对定位 |
| 打开文章后没有关闭按钮 | 关闭按钮在预览底栏，被上面的溢出顶到屏幕外 | 预览头部常驻 ✕ 关闭按钮；底栏「关闭」保留；新增 Esc 关闭 |
| 搜索框没有清除按钮 | 原本就没有 | 输入框内嵌 ✕（有内容才显示），点击或按 Esc 清空 |
| 点设置跳去 Obsidian 原生设置页 | 直接调了 `app.setting.openTabById()` | 改为视图内「外观设置」抽屉（预设 / 壁纸 / 自定义图片 / 暗化 / 模糊 / 主题色 / 布局 / 行为 / 保存并应用），原生设置页入口收进抽屉底部链接 |

顺带：选中文件在列表里有高亮、预览标题去掉 `.md` 后缀、`每个库单独配置外观` 开关真正落地（`settings.vaultAppearance`）、搜索框内按键不再被 Obsidian 全局快捷键抢走。

## v0.10.0 切换库：先自部署，再跳（2026-10-14）

### 问题

用户有多库工作流（一个项目一个库），工作台只装在其中一个库里。
想切到别的库做事，切过去那个库没有插件文件 → 没有工作台 → 等于把用户的多库习惯打回原点。

### 关键认知

「切库」不是 UI 问题，是**插件在那个库里有没有运行**的问题：

- Obsidian **没有**接口能把另一个库挂进当前窗口（一个窗口 = 一个库实例）
- 官方支持的是 `obsidian://` 协议链接，它会让应用跳转到那个库（已有窗口就聚焦，没有就新开）
- 所以正确顺序是：**先把自己写进目标库 → 再跳转**。反了就会掉进一个没有工作台的裸库

### 自部署的四步（`35-vault-link.js` 的 `deployWorkbenchToVault`）

1. 读自己的 `manifest.json` 拿版本号；读目标的版本（没有 = 没装过）
2. **版本门槛**：目标 ≥ 源 → 什么都不做（别把用户的新版刷成我们的旧版）
3. 复制 `main.js` / `manifest.json` / `styles.css`；首次装再把 `data.json`（设置）带过去，
   让那边的库导航 / 外观 / 打开方式和这边一致
4. 把插件 id 登记进目标的 `community-plugins.json`（这个文件在 Obsidian 里就是「已启用」清单）

`community-plugins.json` 有**两种格式**：新版本 Obsidian 写数组，老版本写对象
（`{"dataview": true}`）。两种都认，且登记时不动原来的项。

### 跳转链接为什么用路径不用库名

`obsidian://open?vault=库名` 有两个坑：**同名文件夹在不同盘符下会跳错库**；
名字对不上时 Obsidian 还会在默认位置**新建一个空库**。
所以统一用 `?path=`，并且 **逐段 `encodeURIComponent` 而不是整体编码** ——
斜杠保留可读（Obsidian 认得出），中文和空格照常编码。Windows 的反斜杠先换成 `/`。

### 可移植性（发布给别人用之前必须过的关）

| 以前 | 现在 |
| --- | --- |
| 写死 `%APPDATA%/obsidian/obsidian.json` | `appDataDir()` 按 `process.platform` 取：Windows `%APPDATA%` / mac `~/Library/Application Support` / Linux `~/.config` |
| 库清单只存在本库的 `data.json` | 同时写一份到全局 `vault-workbench/vaults.json`（切到别的库登记还在） |
| 磁盘错误直接抛英文 `EACCES` | `fsErrorText()` 按 code 分类成权限 / 只读盘 / 路径不存在 / 空间不足 / 被占用 |
| 版本号按字符串比（0.10 < 0.9） | `cmpVer()` 按段数值比 |

### 顺序保证（最容易写错的地方）

`switchToVault()` 里**部署失败就直接 return，绝不跳转**。宁可让用户留在原地看到原因，
也不要让他掉进一个没有工作台的库、还得手动切回来。

### 外部库权限模型跟着明确了

能读、能改**已有文件**的正文（原子写：临时文件 + rename）；
**动不了库结构**（新建 / 重命名 / 删除）—— 这些交给那个库自己的 Obsidian 做，
所以提示语从「外部库只读」改成「右键库导航 → 切换到此库」，并给一条直通车菜单项。

## v0.9.2 空文件夹与库根路径（2026-10-14）

用户报：「文件夹里一个笔记都没有时，这个文件夹在工作台里不出现；库根下那几个文件也不出现，
但 Obsidian 原生文件树里看得到。」——两个 bug 叠在一起，第二个还把第一个的现象掩盖了一部分。

### 1. 文件夹是「反推」出来的，所以空文件夹永远反推不出来

`partitionNotes()` 原来只做一件事：遍历**笔记清单**，拿每条笔记的 `folder` 按 `/` 切段，
第一段就是「本层子文件夹」。没有笔记 → 没有段 → 这个文件夹在文件区根本不存在。
（外部库的 `scanExternalVault()` 也只把「包含文件的目录」记进 `folderCount`，同样漏空目录。）

修法：**文件夹不再靠推，直接问库要目录树**。

| 来源 | 拿法 |
| --- | --- |
| 当前库 | `app.vault.getRoot()` → 递归 `children`（TFolder 有 `children`，TFile 没有，用它区分） |
| 外部库 | `scanExternalVault()` 递归时顺手把每个子目录 push 进 `folders`（含空目录） |

- `indexOf()` 的返回值从 `{files}` 扩成 `{files, folders}`，视图在 `render()` 里存到 `this.indexFolders`。
- `partitionNotes(notes, prefix, folders)`：先用笔记数出每个文件夹的 `count`（**整棵子树**的笔记数，
  语义和以前一致），再把权威清单里的**本层直属子目录**补进去（`count` 保持 0 → 空文件夹）。
- 计数仍然是「子树的笔记数」而不是「直系文件数」，所以卡片上的「N 篇」含义没变；
  只有 0 篇的会显示成**空文件夹**（`folderMeta()`），列表模式展开时给一行「（这个文件夹是空的）」，
  不然点了 ▸ 什么都没发生，看起来像坏了。

### 2. 库根是 `/`，不是 `''` —— 根目录下的文件全被塞进一个「没有名字的文件夹」

Obsidian 里库根的 `TFolder.path` 是 `'/'`，根目录下文件的 `parent.path` 也是 `'/'`。
`folder: f.parent.path` 于是得到 `'/'`，再按 `/` 切段 → 第一段是空字符串 →
文件区里凭空多出一个**名字为空**的文件夹卡片，只显示「N 篇」，点进去又回到根……
而那 N 个根目录文件就此从列表里消失（用户截图里的「5 篇」就是这个）。

修法：统一走 `normFolder(p)`（`'/'` 和 `''` 都归成空字符串），在两处收口：

1. `buildCurrentIndex()` 里算 `folder` 时归一化（写入即正确）；
2. `partitionNotes()` 读 `n.folder` 时**再归一化一次** —— 外部库扫描、旧缓存、手写数据都能兜住。

> ⚠️ 铁律：**任何「按 `/` 切段的路径比较」都要先过 `normFolder()`**。
> Obsidian 的库根同时存在 `'/'` 和 `''` 两种写法，混着用一定会切出空段。

### 测试

- `node .smoke/smoke.js` → **450 断言全通过**（v0.9.2 新增 [19] / [20] 两段共 23 条）。
- 测试替身照 Obsidian 的真实形状补了两处，否则这个坑测不出来：
  `vault.getRoot()` 返回目录树（`children` 递归，含 `00-收集箱`、`01-学习/1.3-空目录` 两个空文件夹），
  且 `mkFile` 的**根目录文件 `parent.path` 用 `'/'`**（原来写的是 `''`，正好把 bug 藏住了）。
- 反向验证过：把两处归一化都摘掉，[19] 里「根目录 .md 作为文件出现」「没有无名文件夹卡片」两条立刻变红，
  失败信息里能看到那个只有「1 篇」的空名字卡片 —— 和用户截图同型。
- 拿用户真实库核对过：根目录正好 5 个 `.md`（`_索引 / 标签体系 / 分类体系 / 知识管理系统 / dashboard`）
  = 截图里那张「5 篇」的无名卡片；另有 4 个空目录（`00-收集箱 / 03-生活 / 99-归档资料 / 新建文件夹`）
  一个都没显示 —— 和上面的诊断完全对上。

### 附：外部库扫描也顺带对齐了 Obsidian 的忽略规则

`scanExternalVault()` 原来只按 `EXCLUDE_DIRS` 排除几个目录名，点开头的文件 / 文件夹（`.workbuddy`、
`.dashboard-backup`、`.knowledge-root`…）都会照单列出。Obsidian 自己**忽略一切点开头的东西**，
两边看起来于是完全不一样。现在统一走 `isIgnoredEntry(name)`（点开头 → 跳过），当前库那侧也用它兜一层。

## v0.9.1 工具条下拉的层叠与定位（2026-10-14）

用户报：「＋ 新建」下拉**超出边界、被遮挡、而且点了不能成功创建**。三句话其实是**一个根因 + 一个附带问题**。

### 1. 遮挡与「点不动」是同一件事：工具条没有层叠上下文

- `.vwb-topbar` 上挂了 `backdrop-filter: blur(...)`。`backdrop-filter` 会生成层叠上下文，但它自己的
  `z-index` 是 `auto`；而兄弟节点 `.vwb-content` 是 `position: relative`，**排在它后面**。
  按 CSS 绘制顺序（定位元素、z-index auto 的一层按 DOM 顺序），整个内容行会画在工具条子树的上面。
- 于是工具条里的下拉弹层尽管自己 `z-index: 70`，也只在**工具条这个层叠上下文内部**称王，
  对外还是被 `.vwb-content` 整体压住。
- 关键推论：**绘画顺序 = 命中测试顺序**。被盖住的不只是视觉，点击也落在下面那层的元素上
  —— 点「新建文件」等于点在文件区的空白上，所以「什么都没发生」。这就是「不能成功创建」的真相，
  创建逻辑本身没坏。
- 修法：`.vwb-topbar { position: relative; z-index: 30; }`。弹层 70、右键菜单 45、抽屉 40 都在它之上；
  而且预览面板（`.vwb-prev.is-max/.float/.bottom`）全是 `absolute` 且挂在 `.vwb-content` 里，
  **几何上永远压不到工具条**，所以抬高工具条不会带来反效果。

> 教训：**只要一个元素用了 `filter` / `backdrop-filter` / `transform` / `will-change`，它就成了层叠上下文**，
> 里面再大的 `z-index` 也出不去。视图里出现「弹层被下面的内容盖住 / 点不动」，先查祖先有没有这类属性。

### 2. 弹出方向：左对齐必然冲出右边界

- `.vwb-menu-pop` 原本 `left: 0`（贴着按钮左边缘往右展开），可「＋ 新建」在工具条右半边，
  306/268px 宽的弹层一定越过主区右边界，被 `.vwb-main` 的 `overflow: hidden` 裁掉半截。
- 改成 `.vwb-newmenu-pop { left: auto; right: 0 }` —— 贴按钮**右边缘**向左展开。
- 但不能只靠 CSS：`max-width` 的百分比参照物是**按钮**（`.vwb-menu` 是定位基准）而不是主区，
  算出来没意义。所以加 `placeNewMenu()`：拿**按钮和主区**的 rect 算「右边缘超出多少」，
  用 `left: -Npx` 把弹层左推，最多推到左边留出 8px。
  **不要读弹层自己的 rect**——它的宽度会随我们的设置变化，读两次会来回抖。
- 窗口 `resize` 时重算一次（`registerDomEvent(window, 'resize', …)`）。

### 3. 测试怎么守住这类「纯 CSS」问题

JS 单测抓不到层叠上下文。做法是两条腿：
- 行为断言：把 `mainEl` / `newMenuWrapEl` 的 `getBoundingClientRect` 打成桩，
  直接断言 `placeNewMenu()` 算出来的 `left/width` 让弹层**整块落在主区里**（窄主区 / 宽主区各一遍）。
- CSS 文本守卫：读 `styles.css`，断言 `.vwb-topbar` 里确实有 `position: relative` + `z-index: n>0`，
  以及 `.vwb-newmenu-pop` 是 `right: 0; left: auto`。规则被人改回去就会红。

---

## v0.9.0 拖选复制 / 复制链接与双链 / 批量多选 / 新建方式可选（2026-10-14）

三个诉求：①文件区右键加「复制文件夹链接 / 内部双链」，再顺手做个**批量处理**（多选后一起操作）
②右键「新建笔记」和工具条「＋ 新建」都要**能选**（工作台内 / Obsidian 原生；新建文件 / 新建文件夹）
③即时渲染和阅读模式下**鼠标拖选 + 复制**都不可用。

### 1. 拖选与复制：为什么「点一下就把选区吃掉了」

- 单画布的每一块都挂着 `click → editBlock(i)`，而**拖选正文的终点也是一次 click**
  （鼠标按下拖过去再松开，浏览器照样发 click）。所以拖完选区 = 立刻进编辑态 = 选区被 textarea 顶掉，
  表现就是「拖不动 / 拖完就没了」。
- **修法**：`onBlockClick()` 开头加一道闸 —— `hasDomSelection()` 为真就直接 return，**不动 `editingBlock`**。
  清空选区后点击照常进编辑。判据用 `window.getSelection()` 的 `toString().trim()`，不依赖具体 DOM 结构。
- 阅读态完全是另一条路：之前 `renderPreviewBody()` 只渲染、**没绑任何右键**，而 Obsidian 工作区对
  自定义视图里的文本有 `user-select: none` 的继承影响，所以「复制」连菜单入口都没有。
  补上 `.vwb-prev-body.vwb-doc { user-select: text }` + 阅读态右键菜单 `showReadMenu()`
  （复制选中文本 / 全选正文 / 复制整篇 Markdown / 复制文件路径）。
- 菜单项按选区**动态过滤**：没选区就不渲染「复制选中文本」，而且**整组被滤光时不画分组**，
  否则会留一条空分隔线（`renderCtxGroups()` 里统一处理）。

### 2. 复制链接 / 双链：两种链接各有用途

- `obsidianUri(rel)` → `obsidian://open?vault=<库名>&file=<路径>`。库名取的是**库文件夹名**
  （Obsidian 协议靠这个定位库），路径去掉 `.md` 后缀、斜杠统一成 `/`，两处都 `encodeURIComponent`。
- `wikiLinkOf(rel)` → `[[路径]]`。**文件夹**上用 `wikiLinksFor()` 把这个文件夹下面所有 Markdown
  笔记递归列出来，**每行一条**，做索引页 / 目录时直接粘。
- 外部库这两项置灰：笔记不在当前库里，复制过去也跳不了。

### 3. 批量多选：`Ctrl` + 点 / `Shift` + 点 + 操作条

- 选中项存 `view.multiSel`（`Map`，key 是 `f:<relPath>` / `d:<path>`，value 是 `{kind,item}`，渲染时按 key 找回），
  另存 `view.flatOrder`（按渲染顺序压进去的扁平列表，`Shift` 连选取区间用）。
- `onItemClick(e,item,kind)` 统一分流：`Ctrl/⌘` → `toggleMulti`；`Shift` → `rangeMulti`；
  普通点击 → 先 `clearMulti` 再按原逻辑打开。**点击处理器全部改成走这一个入口**，网格卡片和列表行共用。
- 操作条 `renderBatchBar()` 钉在文件区顶部（`position: sticky`），`renderBatch` 之后 `render()` 会带上它。
- **移动走 `app.fileManager.renameFile()`，不是自己挪文件**：这样库内已有的 `[[双链]]` 会被 Obsidian
  一并更新。搬进自己内部（`dest.indexOf(rel + '/') === 0`）和目标相同的情况自动跳过。
- 删除做**两段确认**（`batchDelArm`）：第一下只把按钮变成「确认删除 N 项」，避免手滑一次清空一片。

### 4. 新建方式可选

- 右键「在这里新建笔记」变成二级菜单，`createNote(folder, {native:true})` 决定落点：
  工作台内 = `openPreview(..., {expand:true, edit:true})`；原生 = `workspace.getLeaf('tab').openFile(file)`。
- 工具条「＋ 新建」原来是单个按钮，改成 `renderNewMenu()` 渲染的下拉（`新建文件` / `新建文件夹`），
  和「打开方式切换」共用 `.vwb-menu` 样式；新建文件夹走 `vault.createFolder()`（老版本 Obsidian 没有这个
  API，已回落提示）。

---

## v0.8.0 回车语义反转 + 右键菜单真正可用 + 文件区右键 / 展开（2026-10-14）

用户五个问题：①编辑器右键菜单**还是没有「删除」** ②「回车才是换行、`Shift+Enter` 才是完成这一段」
（因为换行比新建段用得多）③即时渲染下**右键功能依旧不能用** ④文件 / 文件夹**没有右键菜单** ⑤列表模式希望
能点 `▸` 就地看文件夹里有什么，也能点名字进下一级。

### 1. 「右键点了没反应」的真正根因：`mousedown` 抢焦点

v0.7.0 修的是「命令落到隐藏的源码框」，但**还有第二条路**没堵住：

- 单画布的块输入框上挂着 `blur → commitBlock()`；
- 菜单项是个普通 `div`，**在浏览器里点一个不可聚焦元素会先把当前焦点元素 blur 掉**（`mousedown` 的默认行为）；
- 于是顺序变成：`mousedown`（输入框失焦）→ `commitBlock()` 提交并**重绘那一段**（输入框被换掉）→
  `click` 才触发 `runEditorCmd()` → 命令落在一个**已经脱离文档的 textarea** 上；
- `afterEdit()` 里 `this.editingBlock` 已经是 `null`，改动既不进 `blocks` 也不进源码 → **静默丢弃**，
  界面上什么都没发生。用户看到的就是「右键菜单一个都不起作用」。

**修法（两层）**：
1. 菜单容器挂 `mousedown → preventDefault()`，从源头不让正在编辑的那一段失焦；
   顶栏「Aa 格式」按钮同样处理，并且**把当前 `editingBlock` 当作 blockIdx 传进菜单**（在改哪一段就作用在哪一段）。
2. `menuTarget(ctx)` 不再无条件信任 `ctx.ta`：只认「还活着的输入框」（`=== this.editorEl || === this.blockTa`），
   否则回落到 `editBlock(blockIdx)` 把这一段重新带进编辑态。**即使第一层漏了（别的插件抢焦点、快捷键触发等），
   第二层也能兜住。**

### 2. 回车语义反转：回车 = 换行，`Shift+Enter` = 完成这一段

- 理由（用户给的）：写笔记时**换行比新建段用得多**，所以把「高频动作」给不受修饰键的回车。
- 新规则（`onEditorKey` 里只有这一处判断）：
  | 情况 | 行为 |
  | --- | --- |
  | `Enter`（段落 / 标题） | 插入 `'  \n'`：Markdown 硬换行，**渲染出来真的看得见换行** |
  | `Shift + Enter` | `splitBlockAfter()`：完成这一段，紧接着新建一段（保留 v0.7.0 的前后空行 slot 与空段回滚） |
  | `Enter`（列表 / 引用行尾） | `insertContinue()` 自动续前缀；最后一行是空项则跳出这块去新建段 |
  | `Enter` / `Shift + Enter`（代码块 / 表格 / Front Matter） | 都只插入普通 `'\n'`，不动块本身（原样内容） |
- 为什么不插普通 `'\n'`：Markdown 会把段落内的软换行渲染成一个空格 —— 用户按了回车却「看不出换行」，
  等于没换行。所以段落 / 标题一律写硬换行，代价是源码里会出现行尾空格（已写进 README「已知限制」）。
- 连带修：`splitBlockAfter()` / `mergeBlockUp()` 收尾时把**行尾空白**一起 `\s+$` 去掉，
  否则硬换行留下的两个空格会粘在段尾。

### 3. 右键菜单加「删除」

- `EDITOR_MENU` 剪贴板组加 `del-sel`（删除选中内容，等同 `Del`）；末尾单独一组 `del-block`（删除这一段）。
- `del-block` 带 `needBlock: true`：**定位不到具体某段时（整篇级右键）整组不渲染**，
  免得出现一条点了没用的菜单项（也顺手修掉了「分组被过滤光却留下一条空分隔线」的观感问题）。
- `deleteBlock(idx)`：连**紧挨着的一个空行**一起删（不留一串空行）→ 全删空时留一个空段落当落点 →
  改完源码真源、标脏、自动保存、重画画布，并把光标放到相邻那一段上。
- `applyCmd(id, ta, ctx)` 多了第三参 `ctx`：**「删除这一段」必须知道是哪一段**，
  而 `applyCmd` 是菜单与快捷键共用的唯一执行口，所以上下文只能从这里带进去。
- `deleteBlock` 顺手清掉 `pendingRollback`：否则「空段回滚」会把刚删掉的内容又拉回来。

### 4. 文件区右键菜单（列表 + 网格共用）

- `showItemMenu(ev, item, kind)` 复用编辑器的 `placeMenu()`，但**边界容器换成 `this.mainEl`**
  —— 所以 `placeMenu(host, x, y, bounds)` 加了 `bounds` 参数（编辑器传 `prevEl`，文件区传 `mainEl`）。
- 菜单项由 `itemMenuGroups(item, kind)` 按「文件夹 / 文件 × 当前库 / 外部库」动态生成；
  不可用的项**置灰并写明原因**（外部库只读 / 没有原生视图）。
- 重命名走 `app.fileManager.promptForFileRename(file)`、删除走 `app.fileManager.trashFile(file)`：
  **交给 Obsidian 自己处理**，这样库内双链更新和用户的回收站策略都还在（旧版 API 依次回落到
  `vault.trash(file, true)` → `vault.delete(file)`）。
- 菜单项也挂 `mousedown → preventDefault()`：不让点菜单时行上的 `click` 顺手把文件打开。

### 5. 列表模式就地展开文件夹

- 列表渲染重构成**递归**的 `renderTreeRows(container, notes, prefix, depth)`：
  先渲染本层文件夹（展开的紧接着递归渲染它的子层），再渲染本层文件 —— 天然是标准树序。
- `partitionNotes(notes, prefix)` 从原来的 render 内联代码提出来，目录钻取与递归展开共用同一套拆分逻辑。
- 展开状态存在 `view.expandedFolders`（`Set`），只影响列表模式；网格模式保持「卡片 = 进目录」。
- 交互分工：**点 `▸` = 就地展开 / 收起，点名字 = 进下一级**（用户明确要的两种用法并存）。

### 测试
`node .smoke/smoke.js` → **371 断言全通过**。
- `.smoke/dom-shim.js` 的 `fire()` 现在如实记录 `defaultPrevented` —— 否则「点菜单不能让输入框失焦」这条断言根本没法写。
- 新增/改写断言：回车只换行（光标处 / 段尾 / 代码块）、`Shift+Enter` 完成这一段并新建、
  菜单拦下 `mousedown`、**菜单弹出后那一段被重绘过命令依然生效**（直接对着上面那个 bug 断言）、
  「删除这一段」与「删除选中内容」、整篇级右键不显示「删除这一段」、
  列表 `▸` 展开 / 递归展开 / 收起 / 点名字进目录、文件夹与文件菜单的项与动作、外部库置灰。

---

## v0.7.0 回车分工 + 新建段落 + 右键命令落点（2026-10-14）

用户三个反馈：①即时渲染下右键**所有功能都不能用** ②新建的段总是**段内有两行** ③**段尾回车不新建段、变成换行**，
并顺带要求「把这块的功能逻辑重新审视一遍」。

### 1. 右键命令落到了隐藏的源码框（功能「全都失灵」）
- **根因**：`showEditorMenu()` 里 `target = ta || (blockIdx != null ? this.pickEditorTarget() : this.editorEl)`，
  没在编辑态时 `pickEditorTarget()` 返回的是整篇源码框；而 live 模式下 `.vwb-editor` 是 **`display:none`**。
  命令确实执行了、源码也改了，但画布不会重画 → 用户看到的就是"右键菜单一个都不起作用"。
  更隐蔽的一处：画布空白右键时 handler 直接把 `pickEditorTarget()` 当成 ta 传进去，
  连「把光标放到合理落点」的机会都没有（插入的内容会出现在文件开头）。
- **修法**：
  - 菜单弹出时先把「作用目标上下文」定下来 `{ ta, blockIdx, live }`，之后焦点怎么变都不受影响；
  - 新增 `menuTarget(ctx)`：块上右键 → `await editBlock(blockIdx)` 让那一段先进入编辑态，命令作用在它的输入框上
    （`editBlock` 顺势改成 async 并返回创建出来的 textarea）；
  - 画布空白 / 顶栏「Aa 格式」且当前没编辑任何一段 → 作用在整篇源码，先把光标放到文末当落点；
  - `onSourceInput()` 里补一句：live 模式下源码真源被整篇改动 → `syncCanvasFromSource()` 重画整张画布。
    **这是「改了要能看见」的最后一块拼图。**

### 2. 新建的段落总是「两行高」
- **根因**：`splitBlockAfter()` 只是把当前段尾部补成 `'\n\n'`，交给 `parseBlocks` 后新位置出来的是
  **空行块（type='blank'）**，它的 raw 本身就是换行符 → 编辑它时 textarea 里天然多一行（看起来像两行空框）。
  而且这条路的后果更严重：用户一打字，新建的段落会**直接粘到相邻段落**上，因为源码里没有它自己的分隔空行。
- **修法**：新增 `makePendingBlocks(list, atIdx)` —— 插入一个新段落占位时，**前后各带一个空行 slot**：
  `[上一段] [空行] [新段 pending] [空行] [下一段]`。
  `join('\n')` 之后源码恰好是 `<上一段>\n\n<新段>\n\n<下一段>`，用户写进去的内容不会粘连。
- 关键细节：这种 pending 段**不能交给 `parseBlocks`**（空段落不是 Markdown 里的实体，一 parse 就变回空行块），
  所以 `renderCanvas(opt)` 加了 `opt.blocks` 通道，允许直接用内存里的块清单渲染。
- **回滚机制**：新段一个字没写就 blur → `_commitBlock()` 检测到 `pending && 内容为空`，
  用事先记录的 `pendingRollback.source` 还原源码并整篇重画，避免留下满屏空行。
  连着按回车时当前 pending 段先「转正」（`pending=false; pendingRollback=null`），才会再往后空一段 —— 不会无限堆空行。

### 3. 回车 / 换行分工
原来只有「段尾回车且块类型是 paragraph/heading」才拦，落在列表、代码块上就被静默放过 —— 用户感觉随机。
现在规则写死在一处：

| 情况 | 行为 |
| --- | --- |
| `Enter`（段尾） | 空出新的一段（`splitBlockAfter`）；列表 / 引用先判断最后一行是否为「空项」，是则跳出这一块去新建段，否则 `insertContinue()` 自动续一行同类前缀 |
| `Enter`（段中间） | 段内软换行，不拦 |
| `Shift + Enter` | 段内硬换行：插入 `'  \n'`（行尾两个空格是 Markdown 硬换行语法，保证渲染看得见） |
| 代码块 / 表格 / Front Matter 里 `Enter` | 只换行，不新建段 |

`insertContinue()` 会按上一行推导前缀：有序列表自动递增序号、任务列表自动补 `[ ]`、引用补 `>`。

### 测试
`node .smoke/smoke.js` → **328 断言全通过**。新增 [10e]：三种回车、新段落不带多余换行、
新段与前後段落不粘连、空新段回滚、列表续行 / 跳出、代码块只换行、右键命令落在右击的那一段、
画布空白右键作用在整篇并把分隔线重解析出来。

### 其他
- 删掉了 `settle()`：它的职责（等异步重绘 / 提交落地）已经并进 `editBlock()`，留着是死代码。
- `editBlock` 改 async 后，所有调用点都要 `await`（`moveBlockFocus` / `mergeBlockUp` / `splitBlockAfter` /
  `appendBlockEnd` / `menuTarget`）；`onBlockClick` 里顺手 `.catch()` 防止 unhandled rejection。

---

## v0.6.0 连续书写 + 右键菜单重构（2026-10-14）

三个问题（3 张截图 + 1 张 Typora 菜单参考）：

### 问题 1 · 双栏分屏只有一栏
- **根因**：`buildEditor()` 里 `mode === 'split'` 只做了 `createDiv('.vwb-live')` + `bindScrollSync()`，
  **从来没渲染过首帧** —— 滚动同步绑好了，右栏一直是空的，看起来就像「双栏只有左边」。
- **修法**：把 `scheduleLivePreview()` 的内联 `run()` 抽成独立的 `renderLivePreview()`，
  进双栏时直接 `await this.renderLivePreview()`。顺手给它加了空文件 / 大文件的占位提示。

### 问题 2 · 右键菜单跑到左边 + 显示不全 + 以后会越来越长
- **根因**：`showEditorMenu()` 里写死了 `host.style.left = Math.max(8, Math.min(x, 120))`。
  这个 clamp 本意是「别超出左边」，实际把 `left` 永远夹在 ≤120px —— 菜单永远出现在面板左侧、
  又因为没有高度避让，长菜单直接伸出窗口底部。
- **修法**：新增 `placeMenu(host, x, y)`，**先按 0,0 渲染拿真实尺寸（`offsetWidth/offsetHeight`），再决定落点**：
  1. 右边能同时放「根菜单 + 子菜单」（`needW = mw + 186`）→ 原地不动，子菜单朝右开；
  2. 右边不够、但左边够放子菜单（`left >= subRoom + pad`）→ 根菜单原地不动，加 `is-flip`，
     子菜单改成 `right: calc(100% - 4px)` 朝左开；
  3. 两边都不够 → 把根菜单往右挪到 `bw - pad - needW`，给子菜单腾出右侧空间；
  4. `bw < needW + 12`（面板根本没那么宽）→ 直接 `is-flat`，子菜单**就地展开**；
  5. `top + mh > 面板高` → 向上翻；最后统一 clamp 进面板；
  6. 高度仍然装不下 → `max-height` + `overflow-y:auto`，并强制 `is-flat`。
  第 4 / 6 步很关键：根菜单一旦 `overflow:auto` 就会裁掉绝对定位的子菜单，功能越加越多必然踩到；
  就地展开用的是 `position: static` + `flex: 1 0 100%` + 父行 `flex-wrap: wrap`，让子菜单换行铺满一行。
- 菜单内容按用户给的 Typora 参考扩充：段落设置加五 / 六级标题与升降级，插入加 `[TOC]` 与 YAML Front Matter。
- 快捷键同步扩到 Typora 那套：`Ctrl+1~6` / `Ctrl+0` / `Ctrl+=` / `Ctrl+−` / `Ctrl+Shift+Q/[ /]/X/K/M/T/H`。
  行内代码从 `Ctrl+Shift+`` 挪到 `Ctrl+``（`Ctrl+Shift+`` 与 `Ctrl+Shift+K` 都给代码块）。
  ⚠️ 块 textarea 的 keydown 里 `stopPropagation()` 是必需的，否则 Obsidian 全局快捷键会抢走 `Ctrl+1~6`。

### 问题 3 · 「即时渲染」一块一块的，不像 Typora
用户要的是「没有一块一块」的连续书写感。在「插件无法实例化 CodeMirror」的前提下，
从**视觉**和**操作**两头把块边界磨掉：

- **视觉**：`.vwb-blk` 去掉边框与编辑态底色，hover 只留 7% 的极淡底色提示可点；
  `.vwb-blk-ta` 改用 `var(--font-text)`（原来是等宽）+ `font-size: inherit`，
  再按块类型加 `vwb-ta-*` / `is-h1..h6` 类，**字号对齐渲染出来的标题级别**（1.618em / 1.462em / 1.318em…）。
  点进一段几乎看不出「换了个输入框」，只是 Markdown 记号浮出来。
- **操作**：新增跨块导航 —— `↑/↓` 在段首 / 段尾时交给上 / 下一段（`caretAtFirstLine/LastLine` 判断，
  跳过纯空行块）、段尾 `Enter` 新建段（`splitBlockAfter`）、段首 `Backspace` 并到上一段（`mergeBlockUp`）、
  点画布空白在文末新建（`appendBlockAtEnd`）。
- `autoGrow()` 改成优先读 `getComputedStyle(ta).lineHeight`，块高度跟着真实行高走，不会出现内部滚动条。

### 踩坑：失焦提交与点击的竞态（这次最容易漏的）
单画布是「点块 → 变 textarea → 失焦 → 提交并重绘」。浏览器里 `blur` 先于 `click` 触发，
而 `_commitBlock()` 是 async 的：它已经把 `editingBlock` 置空、正在 `await renderCanvas()`，
此时新的 `click` 进来建好 textarea，**接着旧提交的循环会把整个画布重绘一遍，把新输入框冲掉**。
- 修法：`renderCanvas()` / `commitBlock()` 都改成「薄包装 + `_xxx()` 内部实现」，
  把 Promise 存进 `this.canvasBusy` / `this.commitBusy`；`editBlock()` 先等这两个落地（`settle()`）再动 DOM。

### 测试
`node .smoke/smoke.js` → **307 断言全通过**。新增 [10c]（双栏首帧渲染 + 菜单位置 / 左右翻转 / 上下翻转 /
限高滚动 + 8 个新快捷键）、[10d]（连续书写：↑↓ 跨段 / 段尾回车 / 段首退格 / 点空白新建）。
DOM 替身没动 —— `getBoundingClientRect()` 返回全 0，正好逼出「必须用 clientWidth/Height 兜底」这条路径。

---

## v0.5.0 工作台内编辑器升级 + 说明收进设置（2026-10-14）

用户反馈四条，核心是「工作台里写 Markdown 缺功能，要 Typora 那种手感」：

| 问题 | 改动 |
| --- | --- |
| **① 文件区底部那堆说明不美观** | 底部提示条内容清空并 `display:none`；说明与快捷键统一搬进设置面板的**「使用说明」子页**（快速上手 / 编辑器能力 / 编辑快捷键 / 目录快捷键 / 小图标对照），并新增**「编辑器」子页**（默认书写方式 + 滚动同步开关 + 快捷键速查）。设置子页从 5 个变 7 个 |
| **② 一进编辑就定位到最底部 + 双栏两边不同步** | 见下方「编辑器架构」 |
| **③ 编辑器缺功能、只有阅读模式有大纲** | 新增**右键格式菜单** + **编辑快捷键**；大纲按钮在编辑态也显示 |
| **④ 要 Typora 那种体验** | 新增**单画布即时渲染**作为默认书写方式，双栏降为可选项 |

### 编辑器架构（65-view-editor.js）

核心设计：**`textarea.vwb-editor` 始终是「源码真源」**，保存链路（`docDirty` → 自动保存
→ 外部库原子写）一行没改；单画布只是它的一层可视化编辑层。这样三种书写方式共用一套保存逻辑。

**块模型 `parseBlocks(src)`**——把源码按块级语法切成 `[{type, raw, start, end, level?}]`，
块与块首尾相接，`blocks.map(b => b.raw).join('\n')` 能 **100% 还原原文**，
所以整篇改写不会破坏格式。识别：frontmatter / 围栏代码块 / 标题 / 表格 / 分隔线 / 引用 / 列表 / 段落 / 空白。

**单画布（live，默认）**：逐块调 `MarkdownRenderer.render` 渲染进各自的 `.vwb-blk`，
块 ↔ DOM 一一对应（比「整篇渲染再猜对应关系」可靠得多）。
点某块 → `editBlock(i)` 把该块换成 `.vwb-blk-ta` 输入框；输入时 `syncCanvasToSource()` 重组源码；
失焦 / `Esc` → `commitBlock()`。
`commitBlock` 有个优化：重新解析后**若块结构没变，只重绘这一段**（常见情况），
结构变了才整篇重绘并恢复滚动位置。

**双栏（split）**：源码 + `.vwb-live` 实时渲染，`bindScrollSync()` 按滚动比例双向同步（带 80ms 锁防回环）。

**纯源码（source）**：只有 textarea。大纲由 `syncSourceHeadings()` 按行号推算，
点条目标 `jumpToHeading()` 把光标和滚动送过去。

**「一进编辑就到底部」的根因**：阅读态时 `.vwb-prev-body` 是 `overflow:auto` 滚动容器，
滚到正文末尾再点「编辑」时，切到 `overflow:hidden` 会**保留原 scrollTop**，
视觉上就是「一进去就在最底部」。修法：`buildEditor()` 开头显式把 `prevBodyEl / prevMainEl`
滚动归零，`resetEditorCaret()` 再把光标 `setSelectionRange(0,0)`。

**右键菜单**：`showEditorMenu()` 按 `EDITOR_MENU`（常量表）生成，
支持三级子菜单（文本格式 / 段落设置 / 插入）；菜单项和快捷键**共用同一套 `applyCmd()`**，
所以「菜单点加粗」和「Ctrl+B」走的是同一条代码路径。

**快捷键**：`handleFormatKey()` 把 `Ctrl+B/I/U/K`、`Ctrl+Shift+\``、`Alt+Shift+5`、`Ctrl+\`
映射成命令 id 再交给 `applyCmd()`。块 textarea 在 `onEditorKey()` 里 `stopPropagation()`，
避免被 Obsidian 全局快捷键抢走。

冒烟测试同步扩到 **264 断言**（新增 [10b] 单画布点哪改哪 + 右键菜单 + 7 个快捷键 + 三种书写方式切换 + 编辑态大纲、[16] 说明与快捷键收进设置）。
（→ 该组断言在 v0.6.0 继续扩充，见上一节）

## v0.4.0 导航控制 + 打开方式下拉 + 设置面板（2026-10-14）

四个反馈一次做完：

| 问题 | 改动 |
| --- | --- |
| **① 左上角要能展开 / 收缩** | 左侧标题改成 **`obsidian库导航`**，右侧新增「⤡ 收缩 / ⤢ 展开」按钮。**默认展开**，收起态只留库圆点 + 底部图标（宽度 184px → 52px），状态存 `settings.ui.railCollapsed`，重载后保持 |
| **② 三种模式改成下拉菜单** | 工具条单按钮循环 → **「打开方式切换」下拉菜单**：`右侧预览模式（默认）` / `工作面板模式` / `原生编辑模式`。每项都有 `title` hover 提示 + 菜单内功能说明，当前项打 ✓。**默认改为「右侧预览模式」**（`open.mode = 'panel'`），旧配置只要用户没手动选过就统一迁移过来 |
| **③ 目录前进 / 后退快捷键** | 新增目录历史栈（`hist / histIdx`）：进下一层、点面包屑、点「上一级」都记一笔。`Alt+←` 后退、`Alt+→` 前进、`Alt+↑` 上一级（文件列表里 `Backspace` 同上一级）。工具条同步加了 ⇦ ⇨ 两个按钮（带快捷键提示）。走到新分支会清掉旧的「前进」记录；「上一级」如果正是后退的那一站就直接后退，这样还能再前进回去 |
| **④ 左下改成「设置」且带子页** | 「⚙ 外观设置」→「⚙ **设置**」，打开的是**带子页导航的设置面板**：`外观` / `打开方式` / `库管理` / `操作日志` / `关于`，点子页切换（抽屉从 340px 加宽到 440px，左 96px 导航 + 右内容）。「打开方式」子页里三张模式卡可直接切换，「库管理」可隐藏/显示库与手动添加路径 |

冒烟测试同步扩到 **201 断言**（新增 [13] 库导航展开收缩、[14] 目录前进后退、[15] 设置面板子页）。

**同一次改动：源码从单文件拆成 `src/` 多模块。** 背景是要开源 + 上市场，而
`main.js` 已经 2700 行、`WorkbenchView` 一个类 1835 行 70+ 方法（典型 God Object）——
**所有人改同一个文件，PR 必冲突**，外部贡献者会直接劝退。

约束：Obsidian 市场要求 release 附件就是 `main.js / manifest.json / styles.css` 三个文件，
插件目录里不会有 `src/`，所以**不能运行时 `require('./lib/x.js')`**。

于是方案是：**开发时多文件（`src/`），发布时拼成单文件（`build.js`）**。
`build.js` 不是打包器 —— 不转语法、不解析依赖、不压缩，只按文件名字典序拼接，
所以「免构建、不需要 npm」这个特性完整保留。

`WorkbenchView` 用 `Object.assign(WorkbenchView.prototype, {…})` 按职责拆成 8 个片段，
方法体一行没改。验证手段：改动前后按「方法名 → 方法体」抽字典比对，
94 个方法键集合一致、内容逐字一致 → 确认纯搬运零回归。

## v0.3.0 工作台内阅读 + 编辑（2026-10-14）

用户追问：「编辑这块一定得跳转吗？…就算依旧在我的工作台里工作，真的不行吗？tab 到新标签，我的工作台意义如何？」
另外报了一个真 bug：外部库 md 里的图片渲染成「找不到 "img/1.jpg"」。

| 改动 | 说明 |
| --- | --- |
| **修复外部库 md 的相对资源** | 图 1 的「找不到 "img/1.jpg"」根因：`MarkdownRenderer` 只在**当前库**里解析资源，外部库文件不在 vault 内，`![](img/1.jpg)` 与 `![[img/1.jpg]]` 都解析失败。新增 `fixupRenderedContent()`：渲染后扫描 `<img>` 与 `.internal-embed.is-unresolved`，把相对路径按 md 所在目录解析成磁盘绝对路径、读成 data URL 塞回去（外链、找不到的都不动）。顺带让 `[[内部链接]]` 也能点（按路径/文件名在当前所选库里找并打开） |
| **工作台内编辑** | 文档头部新增「编辑 / 阅读」切换（`setDocMode()`）。编辑态 = **源码 + 实时渲染并排**（`.vwb-edit`），窄面板自动先铺满；停止输入 0.8 秒自动保存，`Ctrl+S` 立即保存，`Esc` 回阅读；`Tab` 插入两个空格；元信息行兼做保存状态（未保存… / 已保存 ✓） |
| **默认打开方式改回「工作台内」** | `open.mode`：`workbench`（默认，工作台内铺满）/ `native`（Obsidian 新标签原生）/ `panel`（右侧一瞥）。工具条开关三态循环，设置中心「通用」子页同步。v0.2.0 存过 `native` 的用户会自动迁移回来（除非自己改过） |
| 写入安全 | 外部库文件用「临时文件 + rename」原子写入，避免写一半崩掉丢原文；首次写外部库会提示一次；`onClose` 时兜底 `flushDocSave()` |

关于「能力不打折」：Obsidian 的编辑器（CodeMirror 6 实时预览、双链自动补全、插件扩展）只能存在于它自己的 `MarkdownView` 里，插件没法在自定义视图中实例化一个真的。所以工作台内给的是**源码 + 实时渲染并排**这套务实方案，需要满血编辑器时一键 `↗ 在 Obsidian 中打开`。

## v0.2.0 打开方式：铺满 + 原生（2026-10-14）

用户反馈：文档预览只有一小条（尤其「底部」布局），而且 Markdown 只能读不能编辑、没有大纲 ——
「核心需求就是整个工作区的 markdown 和原本的 Obsidian 一样，该有的功能都有」。

| 改动 | 说明 |
| --- | --- |
| **默认打开方式改为「铺满 · 原生标签页」** | 点文件走 `WorkspaceLeaf.openFile()`，在 Obsidian 里以真正的原生视图铺满工作区。Markdown = 原生编辑器（实时预览 / 快捷键 / 双链 / 所有插件）+ 核心插件「大纲」；图片 = 原生图片视图（可缩放）；PDF = 原生阅读器；音视频 = 原生播放器；画布 = 原生画布。用 `getLeaf('tab')` 新开标签，**不会顶掉工作台自身**（v0.3.0 起默认改为「工作台内」，此项退为可选） |
| 面板预览保留为可选 | 文件区工具条新增开关 `⤢ 打开：铺满 ⇄ ▭ 打开：面板`；设置中心新增「通用」子页（点击文件的默认行为），改完立即生效并落盘 |
| 只想瞄一眼 | 卡片/列表行右侧新增 👁 按钮 → 强制走面板预览，不改默认行为、不打断当前标签 |
| 面板可铺满 | 预览头部与底栏新增 `⤢ 铺满工作区 / ⤡ 还原面板`：面板从右侧栏变为覆盖整个内容区，排版切到阅读视图规格（正文 820px 居中、标题 25/20/17px、行距 1.85） |
| 大纲 | 预览头部 `☰` 打开大纲抽屉（解析标题层级，跳过代码块；点标题平滑跳转）。窄面板放大纲会自动先铺满，避免正文被挤成一条。大纲与正文**并排**（新增 `.vwb-prev-main` 行容器），不遮挡头部按钮 |
| Esc 层级 | 依次退：外观抽屉 → 大纲 → 铺满 → 关闭预览 |
| 类型兜底 | 只有 Obsidian 有原生视图的类型（md / 图片 / pdf / 音视频 / 画布）才走原生，其余（txt / json / docx / 外部库文件）自动回落面板预览，避免弹「不支持的文件类型」 |

`canOpenNative()` 是这条分流规则的唯一判据。

## v0.1.2 多类型文件预览（2026-10-14）

原来看非 md 文件只会显示「非 Markdown 文件（.png），暂不支持正文预览」。现在预览面板按文件类型分流：

| 类型 | 预览方式 |
| --- | --- |
| `.md` | 渲染正文（原能力不变） |
| 图片 `png/jpg/jpeg/gif/webp/svg/bmp/avif/ico/tif` | 面板内嵌 `<img>`；**当前库**走 `adapter.getResourcePath()` 资源协议，**外部库**读成 data URL（`error` 时兜底再读一次）；底栏「实际大小 / 适应窗口」一键切 1:1 与自适应 |
| PDF | **当前库**用 Obsidian 原生嵌入 `![[x.pdf]]`（与笔记内嵌入同一条链路，最稳），渲染失败自动退回 `iframe` + 资源协议；**外部库**用 data URL 内嵌 + 下方给「↗ 用外部程序打开 / 🗂 打开文件目录」引导，拿不到资源则显示文件信息卡 |
| 音频 / 视频 | 内嵌 `<audio controls>` / `<video controls>` |
| 文本 / 代码 / 配置（txt/json/csv/xml/log/js/ts/py/… 共 60+ 后缀） | 直读只读展示为 `<pre>`，超过 256 KB 截断并提示 |
| 其他（docx / xlsx / zip / exe / psd / canvas…） | **文件信息卡**：类型图标 + 文件名 + 磁盘绝对路径 + 文件类型 / 大小 / 修改时间 / 创建时间 四行属性 + 「↗ 用外部程序打开」「🗂 打开文件目录」按钮（对照用户给的截图那种引导方式） |

其他细节：

- 底栏按钮改为**按类型动态生成**（md 仍是 编辑/复制路径/关闭 三个）
- 网格卡片里图片文件带**缩略图**（外部库超 1.5 MB 不读盘，避免内存吃紧）；所有卡片/列表行名字前加类型图标
- 预览元信息行首显示类型（如「图片 · kcah · 1.0 MB · 2026-05-19」）
- 系统调用走 `require('electron').shell.openPath / showItemInFolder`，取不到路径时给明确提示
- data URL 有 60 条上限 + 2 分钟 TTL 的缓存，避免反复读盘

## 怎么自测（免装依赖）

```bash
node build.js && node --check main.js && node .smoke/smoke.js
```

`.smoke/` 里是一个极简 DOM 替身 + `obsidian` 模块替身，能在 Node 里直接跑真实插件代码，
覆盖：布局结构 / 钻取与回退 / 搜索清除 / 预览开关 / 外观抽屉 / 切库 / 多类型预览（图片·PDF·音视频·文本·文件卡）/ 打开方式·铺满·大纲 / **工作台内编辑与外部库资源兜底** / 库导航展开收缩 / 目录前进后退 / 设置面板子页 / **单画布即时渲染 · 右键菜单 · 编辑快捷键 · 三种书写方式** / 说明与快捷键收进设置 / **双栏首帧渲染 · 菜单边界翻转与滚动 · 连续书写** / **回车分工 · 新建段落 · 右键命令落点** / 原生设置页不回归（328 断言）。
改完代码先跑它，再 `bash sync.sh` → Obsidian 里 `Ctrl+R`。

**重构时的验证手法**（v0.4.0 拆文件就是这么验的）：把改动前后两个 `main.js` 按
「方法名 → 方法体」抽成字典做比对，只要键集合一致、方法体逐字一致，就说明是纯搬运、零回归。
比 diff 行级对比靠谱，因为方法换了位置也会让 diff 显示成一大片改动。

## 数据层设计（后续功能都基于它）

统一 Note 结构：`id / name / relPath / absPath / folder / size / mtime / ctime / ext / tags[] / external`

- 当前库：`app.vault.getFiles()` + `metadataCache`（标签、frontmatter），监听 create/delete/rename/resolve 自动刷新
- 外部库：`fs.readdirSync` 递归扫描，排除 `.obsidian`、`.git`、`node_modules`、`.trash`；标签按需从前 4KB 解析

## 待办 / 路线图

**第二批**：收集箱消化模式 · 批量移动 / 打标 / 重命名 · 拖拽归档 · 智能视图（可保存筛选器）
**第三批**：归档建议 · 规则引擎 · 体检报告 · 统计热力图 · 跨库聚合搜索
**第四批（可选）**：跨库移动（含链接改写）· 外部库内自建笔记 / 重命名（自带链接自愈）· 知识地图 · AI 自动打标

## 已知限制

- 外部库可以改**已有文件**的正文（原子写），但**动不了库结构**：新建 / 重命名 / 删除
  会提示「切换到此库」—— 这些操作的链接自愈要靠 Obsidian 自己，跨库搬文件目前不做（防 `[[双链]]` 断裂）
- 切库依赖 `obsidian://` 协议与 Node 文件读写，**仅桌面端**
- 目标库第一次进要手动关一次「受限模式」（该开关不落在库文件里，任何插件都无法预置）
- 自定义壁纸用 data URL 载入，超大图片（>5MB）可能拖慢渲染
- 外部库全文搜索尚未实现（当前只匹配文件名与标签）
- 外部库文件面板内嵌依赖 data URL，单文件上限 24 MB（缩略图 1.5 MB）、PDF 内嵌受 Obsidian 是否启用 Chromium 阅读器影响，失败时以「用外部程序打开」兜底
- `用外部程序打开 / 打开文件目录` 依赖 Electron，桌面端可用；移动端只能复制路径
- 工作台内编辑器是自研的，不是 CodeMirror：没有双链自动补全、没有 Obsidian 编辑类插件扩展；
  单画布按「块」粒度编辑（点进一段看到的是这一段的 Markdown 源码，不是逐字符所见即所得；
  v0.6.0 已经把块边框去掉、字号对齐渲染样式，并加了 ↑↓ 跨段 / 回车新建段 / 退格合并段，
  视觉与手感上接近连续文档，但本质仍是块级）；
  块内渲染的待办复选框点击行为沿用 Obsidian 默认，可能与工作台内编辑同时触发写盘，谨慎使用
