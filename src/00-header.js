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
