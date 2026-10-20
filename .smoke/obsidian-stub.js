/* 冒烟测试用的 obsidian 模块替身：只实现 main.js 真正用到的那部分 API */
'use strict';

class Component {
  registerEvent() {}
  registerDomEvent(el, type, fn) { if (el && el.addEventListener) el.addEventListener(type, fn); }
  registerInterval() {}
  addChild() {}
  onload() {}
  onunload() {}
}

class Plugin extends Component {
  constructor(app, manifest) { super(); this.app = app; this.manifest = manifest || {}; this._data = null; }
  registerView() {}
  addRibbonIcon() { return document.createElement('div'); }
  addCommand() {}
  addSettingTab() {}
  async loadData() { return this._data; }
  async saveData(d) { this._data = JSON.parse(JSON.stringify(d)); }
}

class ItemView extends Component {
  constructor(leaf) {
    super();
    this.leaf = leaf;
    this.containerEl = document.createElement('div');
    this.containerEl.className = 'workspace-leaf-content';
    this.contentEl = document.createElement('div');
    this.contentEl.className = 'view-content';
    this.containerEl.appendChild(this.contentEl);
  }
  getViewType() { return 'stub'; }
  getDisplayText() { return 'stub'; }
}

class PluginSettingTab {
  constructor(app, plugin) {
    this.app = app;
    this.plugin = plugin;
    this.containerEl = document.createElement('div');
  }
  display() {}
}

class Setting {
  constructor(el) { this.el = el; this.nameEl = document.createElement('div'); }
  setName() { return this; }
  setDesc() { return this; }
  addDropdown(cb) { const st = componentStub(); cb(st); dropdownOptions.push(...st.options); return this; }
  addText(cb) { cb(componentStub()); return this; }
  addSlider(cb) { cb(componentStub()); return this; }
  addToggle(cb) { cb(componentStub()); return this; }
  addButton(cb) { cb(componentStub()); return this; }
}

function componentStub() {
  const s = {};
  for (const m of ['setValue', 'setPlaceholder', 'onChange', 'setLimits', 'setDynamicTooltip',
    'setButtonText', 'onClick', 'setTooltip', 'setCta', 'setDisabled', 'setName', 'setDesc']) {
    s[m] = () => s;
  }
  // addOption 单独实现：记录 (value, label) 供冒烟断言「渲染点是否走了 tr」
  // （英文界面下 label 必须是英文，中文界面下不能是裸 key）
  s.options = [];
  s.addOption = (value, label) => { s.options.push({ value, label: String(label) }); return s; };
  return s;
}

// 全局收集器：Setting 组件每次 addDropdown 时把 option 汇总到这里，
// 冒烟测试据此断言「原生设置页渲染点确实走了 tr」（英文界面不残留中文）。
const dropdownOptions = [];
function resetDropdownOptions() { dropdownOptions.length = 0; }

const notices = [];
class Notice {
  constructor(msg) { notices.push(String(msg)); Notice.last = String(msg); }
}

class MarkdownRenderer {
  static async render(app, md, el) { el.textContent = String(md); }
  static async renderMarkdown(md, el) { el.textContent = String(md); }
}


class TFile {
  constructor(path, stat) {
    this.path = path;
    this.name = path.split('/').pop();
    this.extension = this.name.split('.').pop();
    this.stat = stat || { size: 1024, mtime: Date.now(), ctime: Date.now() };
    const parts = path.split('/');
    parts.pop();
    this.parent = { path: parts.join('/') };
  }
}
class TFolder {
  constructor(path, children) { this.path = path; this.children = children || []; }
}

module.exports = {
  Plugin, ItemView, PluginSettingTab, Setting, Notice, MarkdownRenderer, Component,
  TFile, TFolder, notices, dropdownOptions, resetDropdownOptions
};
