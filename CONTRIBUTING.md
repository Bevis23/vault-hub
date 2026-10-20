# 贡献指南

感谢你想让 Vault Workbench 变得更好。这篇文档讲清楚怎么把代码跑起来、代码怎么组织、以及 PR 的期望。

## 先把环境跑起来

**不需要 `npm install`** —— 这个插件是免构建的纯 CommonJS。

```bash
git clone <本仓库地址>
cd vault-workbench

# 1. 构建：把 src/ 拼成根目录的 main.js
node build.js

# 2. 同步到你的 Obsidian 库里自测
export VWB_VAULT_DIR="/你的库/.obsidian/plugins/vault-workbench"
bash sync.sh          # Windows 也可以双击 sync.bat

# 3. 在 Obsidian 里 Ctrl + R 重载
```

> 不想每次 export？复制一份 `.dev-local.sh`（已在 `.gitignore` 里）并在里面填上你的库路径，
> `sync.sh` 会自动读取它。

## 改代码的铁律

**不要直接编辑根目录的 `main.js`！** 它是由 `build.js` 生成的，下次构建就会被覆盖。

- 改代码 → 改 `src/` 下对应的片段
- 改完 → `node build.js`
- 提交 → `main.js` 一起提交（市场发布需要它在仓库根目录）

## 源码怎么组织

`src/` 下的文件按**文件名字典序**拼接，所以文件名带数字前缀来固定顺序：

| 片段 | 放什么 |
| --- | --- |
| `00-header.js` | `require` 声明、`VIEW_TYPE` |
| `10-constants.js` | 壁纸、预设、`DEFAULT_SETTINGS`、`OPEN_MODES` |
| `20-utils.js` | 纯函数小工具（`fmtSize`、`debounce`、`parentOf`…） |
| `30-filetypes.js` | 扩展名 → 类型映射、图标、系统打开 |
| `35-vault-link.js` | 跨机器可移植 + 库切换的**纯函数**（平台目录、原子 JSON、fs 错误文案、版本号、切库链接、自部署） |
| `40-vault-source.js` | 外部库磁盘扫描 |
| `50-plugin.js` | `class VaultWorkbenchPlugin`：设置、库发现、索引、资源定位 |
| `51-plugin-vaults.js` | 跨库清单 / 自部署 / 切换库（用 `Object.assign(VaultWorkbenchPlugin.prototype, {…})` 挂上去，**必须排在 50 之后**） |
| `60-view-core.js` | `class WorkbenchView` 本体：生命周期、布局、键盘 |
| `61`–`67-view-*.js` | 视图的各个职责模块，用 `Object.assign(WorkbenchView.prototype, {…})` 挂上去 |
| `70-setting-tab.js` | Obsidian 原生设置中心 |
| `99-footer.js` | `module.exports` |

### 想加一个新功能，该动哪里？

| 你的需求 | 建议位置 |
| --- | --- |
| 加一种文件类型的预览 | `30-filetypes.js`（类型识别）+ `66-view-preview.js`（渲染分支） |
| 加一个设置项 | `10-constants.js`（默认值）+ `67-view-settings.js`（面板）+ `70-setting-tab.js`（原生设置页） |
| 加一个工具条按钮 | `64-view-list.js` |
| 加一个快捷键 | `60-view-core.js` 的 `onKeyDown` |
| 加一整个新模块 | 新建 `src/68-view-xxx.js`，用 `Object.assign` 挂到 `WorkbenchView.prototype` |

**约定**：视图上的方法都挂在 prototype 上（不是 class 体内），这样不同功能改不同文件，PR 不容易冲突。

## 测试

```bash
node .smoke/smoke.js
```

`.smoke/` 是一套**零依赖**的测试替身（极简 DOM + `obsidian` 模块替身），在 Node 里跑**真实的插件代码**，
目前 201 条断言。它覆盖：布局、钻取与回退、搜索、预览开关、设置面板、切库、多类型预览、
工作台内编辑、外部库资源兜底、原生设置页。

**改了功能就补断言**。测试是最好的回归保险，也是这个仓库目前最值钱的东西之一。

跑测试前的自检：

```bash
node build.js && node --check main.js && node .smoke/smoke.js
```

## 代码风格

- 纯 ES2018+ CommonJS，**不要引入 ESM、TypeScript、打包器**（免构建是这个项目的核心特性）
- 2 空格缩进、分号、字符串统一单引号
- 只用 Obsidian 官方 API；需要 `fs` / `path` / `electron` 的地方集中在 `30`、`35`、`40` 片段，方便降级与测试
- **任何「库之外的路径」都不许写死**：当前库路径走 `app.vault.adapter.getBasePath()`，
  Obsidian 配置目录走 `obsidianConfigPath()`（否则 mac / Linux 用户直接失效）。改到这类代码时，
  冒烟测试的 [21] 段就是验收标准
- 面向用户的文案用**中文**（快捷键、模式名等保留英文符号）
- 新增设置项必须在 `DEFAULT_SETTINGS` 里给默认值，并在 `loadSettings` 里能兼容旧配置缺失的情况

## 提交与 PR

- Commit message 用简洁的祈使句，例如 `fix: 外部库相对图片解析`、`feat: 支持大纲折叠`
  - `feat:` 新功能 · `fix:` 修 bug · `docs:` 文档 · `refactor:` 重构 · `test:` 测试 · `chore:` 杂项
- 一个 PR 只做一件事，别把重构和功能改动混在一起
- PR 描述里说明：**改了什么 / 为什么改 / 怎么验证**（贴一下 `node .smoke/smoke.js` 的结果）
- 改动涉及 UI 的话，附一张截图

## 发版（维护者）

1. 更新 `manifest.json` 的 `version`
2. 在 `CHANGELOG.md` 顶部加一节（Added / Changed / Fixed）
3. 在 `versions.json` 里加上 `"新版本号": "最低 Obsidian 版本"`
4. `node build.js && node .smoke/smoke.js`
5. 提交并打 GitHub Release：**tag 必须完全等于 manifest 里的版本号，不带 `v` 前缀**
6. Release 附件上传 `main.js`、`manifest.json`、`styles.css` 三个文件
7. 到 [community.obsidian.md](https://community.obsidian.md) 提交 / 更新插件

## 提 Issue

- Bug：Obsidian 版本、系统、插件版本、复现步骤、控制台报错（`Ctrl + Shift + I`）
- 新功能：说清楚你想解决什么场景，而不只是「加个 XX 按钮」
- 提之前先搜一下现有 Issue，避免重复
