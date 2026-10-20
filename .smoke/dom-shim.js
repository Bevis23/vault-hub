/* 极简 DOM 替身：只覆盖 main.js 用到的 API，用于在 Node 里跑真实插件代码 */
'use strict';

function StyleBag() {}
StyleBag.prototype.setProperty = function (k, v) { this[k] = v; };
StyleBag.prototype.getPropertyValue = function (k) { return this[k] === undefined ? '' : this[k]; };
StyleBag.prototype.removeProperty = function (k) { delete this[k]; };

class El {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.parentElement = null;
    this._cls = new Set();
    this._text = '';
    this._listeners = {};
    this.style = new StyleBag();
    this.attrs = {};
    this.value = '';
    this.disabled = false;
    this.checked = false;
    this.clicked = 0;
    this.scrollTop = 0;
    this.scrollLeft = 0;
    this.clientHeight = 400;
    this.clientWidth = 600;
    this.scrollHeight = 800;
    this.scrollWidth = 600;
    this.selectionStart = 0;
    this.selectionEnd = 0;
    this.focused = false;
  }
  get className() { return Array.from(this._cls).join(' '); }
  set className(v) { this._cls = new Set(String(v).split(/\s+/).filter(Boolean)); }
  get classList() {
    const self = this;
    return {
      add: (...c) => c.forEach((x) => x && self._cls.add(x)),
      remove: (...c) => c.forEach((x) => self._cls.delete(x)),
      contains: (c) => self._cls.has(c),
      toggle: (c, on) => (on ? self._cls.add(c) : self._cls.delete(c))
    };
  }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { this.children = []; this._text = String(v); }
  setText(v) { this.textContent = String(v); }
  addClass(...c) { c.forEach((x) => x && this._cls.add(x)); }
  removeClass(...c) { c.forEach((x) => selfClass(this, x)); }
  toggleClass(c, on) { if (on) this._cls.add(c); else this._cls.delete(c); }
  empty() { this.children = []; this._text = ''; }
  appendChild(c) {
    this.children.push(c);
    c.parentElement = this;
    return c;
  }
  removeChild(c) {
    const i = this.children.indexOf(c);
    if (i >= 0) this.children.splice(i, 1);
    c.parentElement = null;
    return c;
  }
  remove() { if (this.parentElement) this.parentElement.removeChild(this); }
  get firstChild() { return this.children[0] || null; }
  get childNodes() { return this.children.slice(); }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'value') this.value = v; }
  getAttribute(k) { return this.attrs[k]; }
  click() { this.clicked++; fire(this, 'click'); }
  createDiv(o) { const d = new El('div'); applyOpts(d, o); return this.appendChild(d); }
  createEl(tag, o) { const e = new El(tag); applyOpts(e, o); return this.appendChild(e); }
  addEventListener(t, fn) { (this._listeners[t] = this._listeners[t] || []).push(fn); }
  removeEventListener(t, fn) {
    const a = this._listeners[t] || [];
    const i = a.indexOf(fn);
    if (i >= 0) a.splice(i, 1);
  }
  dispatchEvent(ev) { fire(this, ev && ev.type ? ev.type : 'unknown'); return true; }
  querySelector(sel) { return selectAll(this, sel)[0] || null; }
  querySelectorAll(sel) { return selectAll(this, sel); }
  focus() { this.focused = true; }
  blur() { this.focused = false; }
  setSelectionRange(s, e) { this.selectionStart = s; this.selectionEnd = e === undefined ? s : e; }
  scrollIntoView() {}
  /* 测试里可以塞一个假的 __rect 来模拟布局（框选要靠 rect 算交集），
   * 不塞就是全 0 —— 这样框选这类几何相关的逻辑才测得出来。 */
  getBoundingClientRect() {
    return this.__rect || { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
  }
  contains(el) {
    let n = el;
    while (n) { if (n === this) return true; n = n.parentElement; }
    return false;
  }
  closest(sel) {
    const parts = String(sel).split(',').map((s) => s.trim()).filter(Boolean);
    let el = this;
    while (el) {
      for (const p of parts) if (matchesSimple(el, p)) return el;
      el = el.parentElement;
    }
    return null;
  }
}

function selfClass(el, c) { if (c) el._cls.delete(c); }

function applyOpts(el, o) {
  if (!o) return;
  if (o.cls) el.className = o.cls;
  if (o.text !== undefined) el.textContent = String(o.text);
  if (o.type) { el.attrs.type = o.type; el.type = o.type; }
  if (o.placeholder) el.attrs.placeholder = o.placeholder;
  if (o.href) el.attrs.href = o.href;
  if (o.src) { el.attrs.src = o.src; el.src = o.src; }
  if (o.title) el.attrs.title = o.title;
  if (o.alt) el.attrs.alt = o.alt;
  if (o.value !== undefined) el.value = o.value;
}

function fire(el, type, extra) {
  const ev = Object.assign({ type, target: el }, extra || {});
  // 真实浏览器里 preventDefault 会置 defaultPrevented —— 有些修复（例如「点右键菜单
  // 不能让输入框失焦」）只能靠这个断言，所以垫片也得如实记录。
  ev.defaultPrevented = false;
  ev.propagationStopped = false;
  ev.preventDefault = function () { ev.defaultPrevented = true; };
  ev.stopPropagation = function () { ev.propagationStopped = true; };
  const list = (el._listeners[type] || []).slice();
  for (const fn of list) fn(ev);
  return ev;
}

/* ---- 选择器：支持 tag / .cls / tag.cls / [attr=v]，以及后代与 > 组合 ---- */
function matchesSimple(el, sel) {
  const m = sel.match(/^([a-zA-Z0-9]*)((?:\.[\w-]+)*)((?:\[[^\]]+\])*)$/);
  if (!m) return false;
  const tag = m[1];
  const classes = m[2];
  const attrs = m[3];
  if (tag && el.tagName.toLowerCase() !== tag.toLowerCase()) return false;
  for (const c of classes.split('.').filter(Boolean)) if (!el._cls.has(c)) return false;
  const re = /\[([\w-]+)(?:=([^\]]+))?\]/g;
  let a;
  while ((a = re.exec(attrs))) {
    const key = a[1];
    let val = el.attrs[key];
    if (val === undefined && el[key] !== undefined && typeof el[key] !== 'object') val = String(el[key]);
    if (val === undefined) return false;
    if (a[2] !== undefined && val !== String(a[2]).replace(/["']/g, '')) return false;
  }
  return true;
}
function allDescendants(el, out) {
  out = out || [];
  for (const c of el.children) { out.push(c); allDescendants(c, out); }
  return out;
}
function selectAll(root, selector) {
  const raw = String(selector).trim();
  const useChild = raw.indexOf('>') >= 0;
  const parts = useChild ? raw.split('>').map((s) => s.trim()) : raw.split(/\s+/).filter(Boolean);
  let current = allDescendants(root).filter((el) => matchesSimple(el, parts[0]));
  for (let i = 1; i < parts.length; i++) {
    const next = [];
    for (const el of current) {
      const cands = useChild ? el.children : allDescendants(el);
      for (const c of cands) if (matchesSimple(c, parts[i])) next.push(c);
    }
    current = next;
  }
  return current;
}

/* ---- document ---- */
const documentShim = {
  _listeners: {},
  createElement(tag) { return new El(tag); },
  addEventListener(t, fn) { (this._listeners[t] = this._listeners[t] || []).push(fn); },
  removeEventListener(t, fn) {
    const a = this._listeners[t] || [];
    const i = a.indexOf(fn);
    if (i >= 0) a.splice(i, 1);
  },
  dispatchEvent(ev) { fire(this, ev && ev.type ? ev.type : 'unknown'); return true; },
  querySelector(sel) { return selectAll(this.body, sel)[0] || null; },
  querySelectorAll(sel) { return selectAll(this.body, sel); }
};
documentShim.body = new El('body');

module.exports = { El, documentShim, fire, selectAll };
