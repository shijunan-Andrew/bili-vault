"use strict";
/*
  最小 DOM —— 给 library.js / popup.js / content.js 这类「要真 DOM 才能加载」的页面脚本用。

  为什么要有它：test/background.test.cjs 已经把 background.js 整份丢进 vm 真跑了，但那套壳
  只有 chrome.*，没有 document。收藏库 / 弹窗 / 内容脚本这三份的主战场就是 DOM —— 静态断言
  能证明「源码里写着 element.hidden = true」，证明不了「点了那个按钮之后它真的被设成了 true」。

  这里不是 jsdom 的替代品，只实现这些脚本真的用到的那一小块：
    - 真解析页面 HTML（不是手搭元素树），所以「HTML 改了 id、JS 没跟着改」这种漂移能被抓到
    - 选择器引擎只支持 #id / .class / tag / [attr] / [attr=v] / 后代 / > / 逗号，够用就行
    - 事件有捕获与冒泡、composedPath()、preventDefault / stopPropagation
    - 表单控件的 value / checked / selected，hidden / disabled / open 这类反射属性
  用不到的（布局、CSS 计算、渲染）一律给零值，别指望它算尺寸。

  运行环境：CommonJS，无依赖。
*/

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const harness = require("./harness.cjs");

const projectRoot = harness.projectRoot;
const readSource = harness.readSource;

const VOID_TAGS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr"
]);
const RAW_TEXT_TAGS = new Set(["script", "style"]);

/* ------------------------------------------------------------------ */
/* 元素                                                                */
/* ------------------------------------------------------------------ */

let nodeSeq = 0;

/* 元素（或它的任意祖先）带 hidden 就当作没有布局盒子。 */
function isDisplayed(element) {
  for (let node = element; node && node.nodeType === 1; node = node.parentElement) {
    if (node.hidden) return false;
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* MutationObserver                                                    */
/*                                                                     */
/* 真实现，不是空壳：content.js 的 waitForSuccessfulClose 全靠它判断收藏 */
/* 弹层关没关（关上了才发消息），空壳会让那条路径永远走不到。          */
/* ------------------------------------------------------------------ */

const liveObservers = new Set();
/* MutationObserver 的回调抛错在真浏览器里是「未捕获错误」，不会静默。这里也不能吞：
   吞掉的话 content.js 的收藏链路一炸，测试还照样绿。收集起来给用例断言。 */
const observerErrors = [];

function takeObserverErrors() {
  const out = observerErrors.slice();
  observerErrors.length = 0;
  return out;
}

class DomMutationObserver {
  constructor(callback) {
    this.callback = callback;
    this.watched = [];
  }

  observe(target, options = {}) {
    this.watched.push({ target, options });
    liveObservers.add(this);
  }

  disconnect() {
    this.watched = [];
    liveObservers.delete(this);
  }

  takeRecords() { return []; }
}

function notifyMutation(target, record) {
  if (!liveObservers.size) return;
  for (const observer of [...liveObservers]) {
    for (const watched of observer.watched) {
      const root = watched.target;
      const inScope = watched.options.subtree
        ? root === target || (typeof root.contains === "function" && root.contains(target))
        : root === target;
      if (!inScope) continue;
      if (record.type === "attributes" && Array.isArray(watched.options.attributeFilter)
        && !watched.options.attributeFilter.includes(record.attributeName)) continue;
      try { observer.callback([record], observer); } catch (error) {
        observerErrors.push(error);
      }
      break;
    }
  }
}

class DomNode {  constructor(document, nodeType, nodeName) {
    this.ownerDocument = document;
    this.nodeType = nodeType;
    this.nodeName = nodeName;
    this.parentNode = null;
    this.childNodes = [];
    this.__id = (nodeSeq += 1);
  }

  get parentElement() {
    return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null;
  }

  get children() {
    return this.childNodes.filter((node) => node.nodeType === 1);
  }

  get childElementCount() { return this.children.length; }

  get firstChild() { return this.childNodes[0] || null; }
  get lastChild() { return this.childNodes[this.childNodes.length - 1] || null; }

  get nextSibling() {
    const siblings = this.parentNode ? this.parentNode.childNodes : [];
    return siblings[siblings.indexOf(this) + 1] || null;
  }

  get previousSibling() {
    const siblings = this.parentNode ? this.parentNode.childNodes : [];
    return siblings[siblings.indexOf(this) - 1] || null;
  }

  appendChild(node) {
    if (node.parentNode) node.parentNode.removeChild(node);
    node.parentNode = this;
    this.childNodes.push(node);
    notifyMutation(this, { type: "childList", target: this, addedNodes: [node], removedNodes: [] });
    return node;
  }

  insertBefore(node, reference) {
    if (node.parentNode) node.parentNode.removeChild(node);
    const at = reference ? this.childNodes.indexOf(reference) : -1;
    node.parentNode = this;
    if (at < 0) this.childNodes.push(node);
    else this.childNodes.splice(at, 0, node);
    notifyMutation(this, { type: "childList", target: this, addedNodes: [node], removedNodes: [] });
    return node;
  }

  removeChild(node) {
    const at = this.childNodes.indexOf(node);
    if (at < 0) throw new Error("removeChild: 不是自己的孩子");
    this.childNodes.splice(at, 1);
    node.parentNode = null;
    notifyMutation(this, { type: "childList", target: this, addedNodes: [], removedNodes: [node] });
    return node;
  }

  replaceChildren(...nodes) {
    for (const child of this.childNodes.slice()) this.removeChild(child);
    for (const node of nodes) this.appendChild(typeof node === "string" ? this.ownerDocument.createTextNode(node) : node);
  }

  append(...nodes) {
    for (const node of nodes) this.appendChild(typeof node === "string" ? this.ownerDocument.createTextNode(node) : node);
  }

  prepend(...nodes) {
    const first = this.firstChild;
    for (const node of nodes) this.insertBefore(typeof node === "string" ? this.ownerDocument.createTextNode(node) : node, first);
  }

  get textContent() {
    if (this.nodeType === 3) return this.data;
    return this.childNodes.map((node) => node.textContent).join("");
  }

  set textContent(value) {
    this.replaceChildren(this.ownerDocument.createTextNode(String(value == null ? "" : value)));
  }

  contains(node) {
    if (!node) return false;
    if (node === this) return true;
    return this.childNodes.some((child) => child.contains && child.contains(node));
  }

  get isConnected() {
    let node = this;
    while (node.parentNode) node = node.parentNode;
    return node.nodeType === 9;
  }
}

class DomText extends DomNode {
  constructor(document, data) {
    super(document, 3, "#text");
    this.data = String(data);
  }

  get nodeValue() { return this.data; }
  set nodeValue(value) { this.data = String(value); }
  get textContent() { return this.data; }
  set textContent(value) { this.data = String(value); }
}

class DomClassList {
  constructor(element) { this.element = element; }

  get __tokens() {
    return String(this.element.getAttribute("class") || "").split(/\s+/).filter(Boolean);
  }

  __write(tokens) {
    const value = [...new Set(tokens)].join(" ");
    if (value) this.element.setAttribute("class", value);
    else this.element.removeAttribute("class");
  }

  get value() { return this.__tokens.join(" "); }
  get length() { return this.__tokens.length; }
  contains(token) { return this.__tokens.includes(token); }
  add(...tokens) { this.__write([...this.__tokens, ...tokens]); }
  remove(...tokens) { this.__write(this.__tokens.filter((t) => !tokens.includes(t))); }
  toggle(token, force) {
    const has = this.contains(token);
    const want = force === undefined ? !has : Boolean(force);
    if (want) this.add(token); else this.remove(token);
    return want;
  }
  item(index) { return this.__tokens[index] || null; }
  [Symbol.iterator]() { return this.__tokens[Symbol.iterator](); }
}

class DomStyle {
  constructor() { this.__props = new Map(); }

  setProperty(name, value) { this.__props.set(String(name), String(value)); }
  getPropertyValue(name) { return this.__props.get(String(name)) || ""; }
  removeProperty(name) { const had = this.__props.get(String(name)) || ""; this.__props.delete(String(name)); return had; }
  get cssText() { return [...this.__props].map(([k, v]) => `${k}: ${v}`).join("; "); }
  set cssText(value) {
    this.__props.clear();
    for (const piece of String(value).split(";")) {
      const at = piece.indexOf(":");
      if (at > 0) this.__props.set(piece.slice(0, at).trim(), piece.slice(at + 1).trim());
    }
  }
}

const EVENT_TYPES = {
  click: "MouseEvent", dblclick: "MouseEvent", mousedown: "MouseEvent", mouseup: "MouseEvent",
  mousemove: "MouseEvent", mouseover: "MouseEvent", mouseout: "MouseEvent", mouseenter: "MouseEvent",
  mouseleave: "MouseEvent", contextmenu: "MouseEvent",
  keydown: "KeyboardEvent", keyup: "KeyboardEvent", keypress: "KeyboardEvent",
  input: "Event", change: "Event", submit: "Event", focus: "Event", blur: "Event",
  load: "Event", scroll: "Event", dragstart: "Event", drop: "Event"
};

class DomEvent {
  constructor(type, init = {}) {
    this.type = type;
    Object.assign(this, init);
    this.bubbles = init.bubbles !== false;
    this.cancelable = init.cancelable !== false;
    this.composed = init.composed !== false;
    this.defaultPrevented = false;
    this.target = null;
    this.currentTarget = null;
    this.__stopped = false;
    this.__stoppedImmediate = false;
    this.timeStamp = Date.now();
  }

  preventDefault() { this.defaultPrevented = true; }
  stopPropagation() { this.__stopped = true; }
  stopImmediatePropagation() { this.__stopped = true; this.__stoppedImmediate = true; }
  composedPath() {
    const path = [];
    let node = this.target;
    while (node) { path.push(node); node = node.parentNode; }
    return path;
  }
  get isTrusted() { return this.__isTrusted === true; }
}

function makeEventClass(name, base = DomEvent) {
  return class extends base { constructor(type, init) { super(type, init); this.constructorName = name; } };
}

const DomMouseEvent = makeEventClass("MouseEvent");
const DomKeyboardEvent = makeEventClass("KeyboardEvent");
const DomCustomEvent = makeEventClass("CustomEvent");

class DomElement extends DomNode {
  constructor(document, tagName) {
    super(document, 1, String(tagName).toUpperCase());
    this.tagName = String(tagName).toUpperCase();
    this.localName = String(tagName).toLowerCase();
    this.attributes = new Map();
    this.classList = new DomClassList(this);
    this.style = new DomStyle();
    this.__listeners = new Map();
    this.__value = "";
    this.__checked = false;
    this.__selected = false;
    this.__dataset = null;
  }

  get id() { return this.getAttribute("id") || ""; }
  set id(value) { this.setAttribute("id", value); }
  get className() { return this.getAttribute("class") || ""; }
  set className(value) { this.setAttribute("class", value); }
  get title() { return this.getAttribute("title") || ""; }
  set title(value) { this.setAttribute("title", value == null ? "" : String(value)); }
  get role() { return this.getAttribute("role") || ""; }
  set role(value) { this.setAttribute("role", value); }
  get htmlFor() { return this.getAttribute("for") || ""; }
  set htmlFor(value) { this.setAttribute("for", value); }
  get type() { return this.getAttribute("type") || ""; }
  set type(value) { this.setAttribute("type", value); }
  get name() { return this.getAttribute("name") || ""; }
  set name(value) { this.setAttribute("name", value); }

  get hidden() { return this.hasAttribute("hidden"); }
  set hidden(value) { if (value) this.setAttribute("hidden", ""); else this.removeAttribute("hidden"); }

  get disabled() { return this.hasAttribute("disabled"); }
  set disabled(value) { if (value) this.setAttribute("disabled", ""); else this.removeAttribute("disabled"); }

  get open() { return this.hasAttribute("open"); }
  set open(value) { if (value) this.setAttribute("open", ""); else this.removeAttribute("open"); }

  get value() { return this.__value !== "" ? this.__value : (this.getAttribute("value") || ""); }
  set value(next) { this.__value = String(next == null ? "" : next); }

  get checked() { return this.hasAttribute("checked"); }
  set checked(value) { if (value) this.setAttribute("checked", ""); else this.removeAttribute("checked"); }

  get selected() { return this.hasAttribute("selected"); }
  set selected(value) { if (value) this.setAttribute("selected", ""); else this.removeAttribute("selected"); }

  get indeterminate() { return this.hasAttribute("indeterminate"); }
  set indeterminate(value) { if (value) this.setAttribute("indeterminate", ""); else this.removeAttribute("indeterminate"); }

  get dataset() {
    if (!this.__dataset) {
      const element = this;
      this.__dataset = new Proxy({}, {
        get: (_, key) => {
          const attr = `data-${String(key).replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
          const raw = element.getAttribute(attr);
          return raw === null || raw === undefined ? undefined : raw;
        },
        set: (_, key, value) => {
          const attr = `data-${String(key).replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
          element.setAttribute(attr, value == null ? "" : String(value));
          return true;
        },
        has: (_, key) => element.hasAttribute(`data-${String(key).replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`),
        deleteProperty: (_, key) => {
          element.removeAttribute(`data-${String(key).replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`);
          return true;
        },
        ownKeys: () => element.__attributeNames().filter((n) => n.startsWith("data-")).map((n) => n.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())),
        getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true })
      });
    }
    return this.__dataset;
  }

  __attributeNames() { return [...this.attributes.keys()]; }

  getAttribute(name) {
    const key = String(name).toLowerCase();
    return this.attributes.has(key) ? this.attributes.get(key) : null;
  }

  setAttribute(name, value) {
    this.attributes.set(String(name).toLowerCase(), value == null ? "" : String(value));
    notifyMutation(this, { type: "attributes", target: this, attributeName: String(name).toLowerCase() });
  }

  removeAttribute(name) {
    this.attributes.delete(String(name).toLowerCase());
    notifyMutation(this, { type: "attributes", target: this, attributeName: String(name).toLowerCase() });
  }

  hasAttribute(name) { return this.attributes.has(String(name).toLowerCase()); }

  getAttributeNames() { return [...this.attributes.keys()]; }

  /* ---- 选择器 ---- */

  matches(selector) { return matchesSelector(this, selector); }

  closest(selector) {
    let node = this;
    while (node && node.nodeType === 1) {
      if (matchesSelector(node, selector)) return node;
      node = node.parentNode;
    }
    return null;
  }

  querySelector(selector) {
    const found = querySelectorAll(this, selector);
    return found.length ? found[0] : null;
  }

  querySelectorAll(selector) { return querySelectorAll(this, selector); }

  getElementsByTagName(tag) {
    const want = String(tag).toUpperCase();
    return descendants(this).filter((node) => want === "*" || node.tagName === want);
  }

  getElementsByClassName(name) {
    return descendants(this).filter((node) => node.classList.contains(name));
  }

  /* ---- 事件 ---- */

  addEventListener(type, handler, options) {
    if (typeof handler !== "function") return;
    const list = this.__listeners.get(type) || [];
    const capture = typeof options === "boolean" ? options : Boolean(options && options.capture);
    list.push({ handler, capture, once: Boolean(options && options.once) });
    this.__listeners.set(type, list);
  }

  removeEventListener(type, handler, options) {
    const list = this.__listeners.get(type);
    if (!list) return;
    const capture = typeof options === "boolean" ? options : Boolean(options && options.capture);
    const at = list.findIndex((entry) => entry.handler === handler && entry.capture === capture);
    if (at >= 0) list.splice(at, 1);
  }

  dispatchEvent(event) {
    event.target = event.target || this;
    /* 路径不能出现同一个节点两次：document.documentElement.parentNode 就是
       document，不去重的话捕获阶段会把 document 上的监听器跑两遍。 */
    const path = [];
    let node = this;
    while (node) { if (!path.includes(node)) path.push(node); node = node.parentNode; }
    if (this.ownerDocument && !path.includes(this.ownerDocument)) path.push(this.ownerDocument);
    const run = (current, phase) => {
      const list = (current.__listeners && current.__listeners.get(event.type)) || [];
      for (const entry of list.slice()) {
        if (phase === "capture" && !entry.capture) continue;
        if (phase === "bubble" && entry.capture) continue;
        if (entry.once) current.removeEventListener(event.type, entry.handler, { capture: entry.capture });
        event.currentTarget = current;
        entry.handler.call(current, event);
        if (event.__stoppedImmediate) return false;
      }
      return true;
    };
    for (const current of path.slice().reverse()) { if (!run(current, "capture")) return !event.defaultPrevented; if (event.__stopped) return !event.defaultPrevented; }
    for (const current of path) { if (!run(current, "bubble")) break; if (event.__stopped) break; }
    // 默认动作：checkbox 点一下就翻转
    if (event.type === "click" && this.localName === "input" && this.getAttribute("type") === "checkbox" && !event.defaultPrevented) {
      this.checked = !this.checked;
    }
    event.currentTarget = null;
    return !event.defaultPrevented;
  }

  /* <select>.add(option)：真 DOM 里这个方法是 HTMLSelectElement 的，返回 undefined
     也不影响调用方；这里返回 this 只是方便链式写。 */
  add(node, reference) {
    if (reference) this.insertBefore(node, reference);
    else this.append(node);
    return this;
  }

  /* <select>.options：真 DOM 里是「全部 <option>（含 <optgroup> 里的）」，类型是
     HTMLOptionsCollection、可当数组用。1.17.0 起 popup 的导入数量下拉要靠它
     按 value 找回上次选的那一项 —— 少了它，Array.from(select.options) 直接抛错，
     被 .catch() 吞掉之后下拉会一直停在默认档。 */
  get options() {
    if (this.localName !== "select") return undefined;
    return descendants(this).filter((node) => node.localName === "option");
  }

  click() {
    // 真浏览器里 element.click() 造出来的是**合成事件**（isTrusted = false）。
    // 想让被测代码走「真用户点的」那条路，用 fireUserEvent()。
    const event = new DomMouseEvent("click", { bubbles: true, cancelable: true });
    this.dispatchEvent(event);
    return !event.defaultPrevented;
  }

  /* <dialog>：真实现里显示与否看 open 属性，不看 hidden。 */
  showModal() { this.open = true; }
  show() { this.open = true; }
  close(returnValue) { if (returnValue !== undefined) this.returnValue = returnValue; this.open = false; }

  focus() { this.ownerDocument.activeElement = this; this.dispatchEvent(new DomEvent("focus", { bubbles: false })); }
  blur() { if (this.ownerDocument.activeElement === this) this.ownerDocument.activeElement = this.ownerDocument.body; this.dispatchEvent(new DomEvent("blur", { bubbles: false })); }
  select() {}
  scrollIntoView() {}
  setPointerCapture() {}
  releasePointerCapture() {}
  /* 影子 DOM：content.js 的「正在归档视频…」提示卡就挂在 shadow root 里
     （mode: "closed"）。真实现，不是空壳 —— 空壳会让整条提示路径静默走空，
     测试却照样绿。open 的才写 element.shadowRoot，跟浏览器一致。 */
  attachShadow(init = {}) {
    if (this.__shadowRoot) throw new Error("attachShadow: 这个元素已经有影子根了");
    const root = new DomShadowRoot(this, init.mode === "open" ? "open" : "closed");
    this.__shadowRoot = root;
    if (root.mode === "open") this.shadowRoot = root;
    return root;
  }

  /* 没有排版引擎，但「可见元素有非零盒子」这条语义必须保住：content.js 的
     visible() 就是靠 rect.width/height > 0 判「这个弹层是不是真在页面上」。
     隐藏的（自己或任意祖先带 hidden / 断连）返回全 0，跟真实浏览器一致。
     单个元素可以用 element.__box = { width, height } 改尺寸。 */
  getBoundingClientRect() {
    if (!this.isConnected || !isDisplayed(this)) {
      return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 };
    }
    const box = this.__box || { width: 120, height: 24 };
    return { top: 0, left: 0, right: box.width, bottom: box.height, width: box.width, height: box.height, x: 0, y: 0 };
  }
  get offsetWidth() { return this.getBoundingClientRect().width; }
  get offsetHeight() { return this.getBoundingClientRect().height; }
  get offsetParent() { return isDisplayed(this) ? (this.parentElement || null) : null; }
  /* library.js 的 focusableWithin 靠 getClientRects().length 判断"有没有布局盒子"，
     没有这个方法 trapFocus 一调用就抛 TypeError。隐藏的（自己或祖先带 hidden）
     返回空数组，跟真实浏览器一致。 */
  getClientRects() { return isDisplayed(this) ? [this.getBoundingClientRect()] : []; }
  get firstElementChild() { return this.children[0] || null; }

  /* tabIndex 是真反射的：`el.tabIndex = 0` 会写进 tabindex 属性，反向也一样
     （library.js 给卡片设的就是 `card.tabIndex = 0`）。 */
  get tabIndex() {
    const raw = this.getAttribute("tabindex");
    if (raw === null) return this.localName === "button" || this.localName === "a" ? 0 : -1;
    const parsed = Number.parseInt(raw, 10);
    return Number.isNaN(parsed) ? -1 : parsed;
  }
  set tabIndex(value) { this.setAttribute("tabindex", String(Number(value) | 0)); }
  get scrollTop() { return 0; }
  set scrollTop(_value) {}
  get scrollHeight() { return 0; }

  cloneNode(deep = false) {
    const copy = this.ownerDocument.createElement(this.localName);
    for (const name of this.__attributeNames()) copy.setAttribute(name, this.getAttribute(name));
    copy.__value = this.__value;
    if (deep) for (const child of this.childNodes) copy.appendChild(child.nodeType === 3 ? new DomText(this.ownerDocument, child.data) : child.cloneNode(true));
    return copy;
  }

  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  before(...nodes) { if (!this.parentNode) return; for (const node of nodes) this.parentNode.insertBefore(typeof node === "string" ? this.ownerDocument.createTextNode(node) : node, this); }
  after(...nodes) {
    if (!this.parentNode) return;
    let reference = this.nextSibling;
    for (const node of nodes) { this.parentNode.insertBefore(typeof node === "string" ? this.ownerDocument.createTextNode(node) : node, reference); }
  }

  get innerHTML() { return serializeChildren(this); }
  set innerHTML(html) { this.replaceChildren(); parseInto(this.ownerDocument, this, String(html)); }

  get outerHTML() { return serializeElement(this); }

  get textContent() { return this.childNodes.map((node) => node.textContent).join(""); }
  set textContent(value) { this.replaceChildren(this.ownerDocument.createTextNode(String(value == null ? "" : value))); }

  get innerText() { return this.textContent; }
  set innerText(value) { this.textContent = value; }
}

/* ------------------------------------------------------------------ */
/* 选择器引擎                                                          */
/* ------------------------------------------------------------------ */

function parseCompound(text) {
  const compound = { tag: null, id: null, classes: [], attrs: [], nots: [], checked: false };
  /* :not(...) 先单独抠掉——library.js 的 FOCUSABLE_SELECTOR 就靠它
     （`button:not([disabled]), [tabindex]:not([tabindex="-1"])`），
     不认的话 trapFocus 一调用就炸。只支持一层、不含括号的 :not。 */
  const withoutNot = String(text).replace(/:not\(([^()]*)\)/g, (_all, inner) => {
    if (inner.trim()) compound.nots.push(inner.trim());
    return "";
  });
  /* 1.16.8：`:checked` 也只有这一处在用（popup.js 挑「已勾选的收藏夹」靠它）。
     不认的话「导入进行中」那条渲染路径一跑就抛「不认识的简单选择器」——
     这也说明这条路径此前从没被页面级测试走到过。 */
  const rest = withoutNot.replace(/:checked/g, () => {
    compound.checked = true;
    return "";
  });
  const pattern = /([#.]?)([A-Za-z0-9_\-\u00a0-\uffff]+)|\[([^\]]+)\]/g;
  let match;
  let consumed = "";
  while ((match = pattern.exec(rest))) {
    consumed += match[0];
    if (match[0].startsWith("[")) {
      const body = match[3];
      const at = body.indexOf("=");
      if (at < 0) compound.attrs.push({ name: body.trim().toLowerCase(), value: null });
      else {
        const name = body.slice(0, at).trim().toLowerCase();
        let value = body.slice(at + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
        compound.attrs.push({ name, value });
      }
    } else if (match[1] === "#") compound.id = match[2];
    else if (match[1] === ".") compound.classes.push(match[2]);
    else compound.tag = match[2].toLowerCase();
  }
  if (consumed !== rest.replace(/[\s>+~]/g, "")) throw new Error(`不认识的简单选择器：${text}`);
  return compound;
}

function parseSelector(selector) {
  return String(selector).split(",").map((group) => {
    const parts = [];
    const tokens = group.trim().split(/\s+/).filter(Boolean);
    let pending = " ";
    for (const token of tokens) {
      if (token === ">") { pending = ">"; continue; }
      parts.push({ combinator: parts.length === 0 ? " " : pending, compound: parseCompound(token) });
      pending = " ";
    }
    if (!parts.length) throw new Error(`空选择器：${selector}`);
    return parts;
  });
}

function matchesCompound(element, compound) {
  if (element.nodeType !== 1) return false;
  if (compound.tag && element.localName !== compound.tag) return false;
  if (compound.id && element.id !== compound.id) return false;
  for (const name of compound.classes) if (!element.classList.contains(name)) return false;
  for (const attr of compound.attrs) {
    if (!element.hasAttribute(attr.name)) return false;
    if (attr.value !== null && element.getAttribute(attr.name) !== attr.value) return false;
  }
  for (const inner of compound.nots || []) if (matchesSelector(element, inner)) return false;
  if (compound.checked && element.checked !== true) return false;
  return true;
}

function matchesParts(element, parts, index) {
  if (!matchesCompound(element, parts[index].compound)) return false;
  if (index === 0) return true;
  const combinator = parts[index].combinator;
  if (combinator === ">") return element.parentElement ? matchesParts(element.parentElement, parts, index - 1) : false;
  let parent = element.parentElement;
  while (parent) { if (matchesParts(parent, parts, index - 1)) return true; parent = parent.parentElement; }
  return false;
}

function matchesSelector(element, selector) {
  return parseSelector(selector).some((parts) => matchesParts(element, parts, parts.length - 1));
}

function descendants(root) {
  const out = [];
  const walk = (node) => { for (const child of node.childNodes) { if (child.nodeType === 1) { out.push(child); walk(child); } } };
  walk(root);
  return out;
}

function querySelectorAll(root, selector) {
  const groups = parseSelector(selector);
  return descendants(root).filter((element) => groups.some((parts) => matchesParts(element, parts, parts.length - 1)));
}

/* ------------------------------------------------------------------ */
/* HTML 解析                                                           */
/* ------------------------------------------------------------------ */

function findTagEnd(html, start) {
  let quote = null;
  for (let i = start + 1; i < html.length; i += 1) {
    const ch = html[i];
    if (quote) { if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === ">") return i;
  }
  return html.length;
}

function parseAttributes(element, text) {
  const pattern = /([^\s=/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]*)))?/g;
  let match;
  while ((match = pattern.exec(text))) {
    const name = match[1].toLowerCase();
    const value = match[2] !== undefined ? match[2] : match[3] !== undefined ? match[3] : match[4] !== undefined ? match[4] : "";
    element.setAttribute(name, value);
  }
}

function parseInto(document, root, html) {
  const stack = [root];
  let i = 0;
  const top = () => stack[stack.length - 1];
  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt < 0) { const text = html.slice(i); if (text.trim()) top().appendChild(new DomText(document, text)); break; }
    if (lt > i) { const text = html.slice(i, lt); if (text.trim()) top().appendChild(new DomText(document, text)); }
    if (html.startsWith("<!--", lt)) { const end = html.indexOf("-->", lt); i = end < 0 ? html.length : end + 3; continue; }
    if (html.startsWith("<!", lt) || html.startsWith("<?", lt)) { const end = findTagEnd(html, lt); i = end + 1; continue; }
    if (html.startsWith("</", lt)) {
      const end = findTagEnd(html, lt);
      const name = html.slice(lt + 2, end).trim().toLowerCase();
      for (let k = stack.length - 1; k > 0; k -= 1) if (stack[k].localName === name) { stack.length = k; break; }
      i = end + 1;
      continue;
    }
    const end = findTagEnd(html, lt);
    const raw = html.slice(lt + 1, end);
    const selfClose = raw.trimEnd().endsWith("/");
    const body = selfClose ? raw.trimEnd().slice(0, -1) : raw;
    const nameMatch = /^([A-Za-z][^\s/>]*)/.exec(body);
    if (!nameMatch) { i = end + 1; continue; }
    const tag = nameMatch[1].toLowerCase();
    const element = document.createElement(tag);
    parseAttributes(element, body.slice(nameMatch[1].length));
    top().appendChild(element);
    i = end + 1;
    if (RAW_TEXT_TAGS.has(tag)) {
      const close = html.toLowerCase().indexOf(`</${tag}`, i);
      const text = close < 0 ? html.slice(i) : html.slice(i, close);
      if (text) element.appendChild(new DomText(document, text));
      i = close < 0 ? html.length : html.toLowerCase().indexOf(">", close) + 1;
      continue;
    }
    if (!VOID_TAGS.has(tag) && !selfClose) stack.push(element);
  }
}

function escapeAttr(value) { return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;"); }

function serializeElement(element) {
  const attrs = element.__attributeNames().map((name) => {
    const value = element.getAttribute(name);
    return value === "" ? ` ${name}` : ` ${name}="${escapeAttr(value)}"`;
  }).join("");
  if (VOID_TAGS.has(element.localName)) return `<${element.localName}${attrs}>`;
  return `<${element.localName}${attrs}>${serializeChildren(element)}</${element.localName}>`;
}

function serializeChildren(element) {
  return element.childNodes.map((node) => (node.nodeType === 3 ? node.data : serializeElement(node))).join("");
}

/* ------------------------------------------------------------------ */
/* document / window                                                   */
/* ------------------------------------------------------------------ */

/* 页面代码里 `new Option(...)` 是拿不到 document 的（真 DOM 里它绑在当前窗口上），
   所以这里记一份"最近一次 createDom 建出来的文档"给它用。 */
let activeDocument = null;

/* 影子根：nodeType 11（DocumentFragment），能 querySelector/append/innerHTML，
   只是不参与 document.querySelector 的树遍历 —— 跟真浏览器一致。 */
class DomShadowRoot extends DomElement {
  constructor(host, mode) {
    super(host.ownerDocument, "#shadow-root");
    this.nodeType = 11;
    this.host = host;
    this.mode = mode;
  }
}

/* <select> 里的 <option>：library.js / settings.js 都是 `new Option(text, value)`
   造好再 select.add(...) 或 replaceChildren(...) 挂上去，所以得有个真构造器。
   注意 DomNode 的构造器第一个参数是 document，不能用 `super("option")`。 */
class DomOption extends DomElement {
  constructor(text = "", value = "", defaultSelected = false, selected = false) {
    super(activeDocument, "option");
    this.value = String(value);
    this.textContent = String(text);
    if (defaultSelected || selected) this.setAttribute("selected", "");
  }
}

class DomDocument extends DomNode {
  constructor() {
    super(null, 9, "#document");
    this.ownerDocument = this;
    this.activeElement = null;
    this.readyState = "complete";
    this.visibilityState = "visible";
    this.title = "";
    this.__listeners = new Map();
  }

  get hidden() { return this.visibilityState === "hidden"; }

  get documentElement() { return this.childNodes.find((node) => node.nodeType === 1 && node.localName === "html") || null; }
  get head() { const root = this.documentElement; return root ? root.children.find((node) => node.localName === "head") || null : null; }
  get body() { const root = this.documentElement; return root ? root.children.find((node) => node.localName === "body") || null : null; }

  createElement(tag) { return new DomElement(this, tag); }
  createElementNS(_ns, tag) { return new DomElement(this, tag); }
  createTextNode(data) { return new DomText(this, data); }
  createDocumentFragment() { const fragment = new DomElement(this, "#fragment"); fragment.nodeType = 11; return fragment; }

  getElementById(id) { return descendants(this).find((element) => element.id === id) || null; }
  querySelector(selector) { const found = querySelectorAll(this, selector); return found.length ? found[0] : null; }
  querySelectorAll(selector) { return querySelectorAll(this, selector); }
  getElementsByTagName(tag) { const want = String(tag).toUpperCase(); return descendants(this).filter((node) => want === "*" || node.tagName === want); }

  addEventListener(type, handler, options) { DomElement.prototype.addEventListener.call(this, type, handler, options); }
  removeEventListener(type, handler, options) { DomElement.prototype.removeEventListener.call(this, type, handler, options); }
  dispatchEvent(event) { return DomElement.prototype.dispatchEvent.call(this, event); }
  contains(node) { return DomNode.prototype.contains.call(this, node); }
  elementFromPoint() { return null; }
  getSelection() { return { rangeCount: 0, toString: () => "", removeAllRanges() {}, addRange() {} }; }
}

function makeStyleMap() { return new Map(); }

function createDom(html) {
  const document = new DomDocument();
  activeDocument = document;
  parseInto(document, document, html);
  const styleMap = makeStyleMap();
  const warnings = [];
  const blobs = [];

  const computeStyle = (element) => ({
    getPropertyValue: (name) => {
      const key = `${element.__id}|${name}`;
      if (styleMap.has(key)) return styleMap.get(key);
      return (element.style && element.style.getPropertyValue(name)) || "";
    },
    setProperty: (name, value) => styleMap.set(`${element.__id}|${name}`, value),
    removeProperty: (name) => styleMap.delete(`${element.__id}|${name}`),
    cssText: ""
  });

  const windowEvents = new Map();
  const windowObject = {
    document,
    innerWidth: 1280,
    innerHeight: 900,
    scrollX: 0,
    scrollY: 0,
    devicePixelRatio: 1,
    location: { href: "chrome-extension://test-extension-id/library.html", search: "", hash: "", protocol: "chrome-extension:", reload() {}, assign() {}, replace() {} },
    history: { replaceState() {}, pushState() {}, back() {}, length: 1 },
    navigator: {
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36",
      language: "zh-CN",
      languages: ["zh-CN", "zh"],
      platform: "Win32",
      clipboard: { writeText: async () => {}, readText: async () => "" },
      storage: { persist: async () => true, persisted: async () => false, estimate: async () => ({ usage: 0, quota: 0 }) }
    },
    localStorage: (() => {
      const map = new Map();
      return {
        getItem: (key) => (map.has(String(key)) ? map.get(String(key)) : null),
        setItem: (key, value) => map.set(String(key), String(value)),
        removeItem: (key) => map.delete(String(key)),
        clear: () => map.clear(),
        key: (index) => [...map.keys()][index] || null,
        get length() { return map.size; }
      };
    })(),
    performance: { now: () => Date.now() },
    console: { log() {}, warn: (...a) => warnings.push(a.map(String).join(" ")), error: (...a) => warnings.push(a.map(String).join(" ")), info() {}, debug() {} },
    setTimeout, clearTimeout, queueMicrotask, structuredClone,
    /* setInterval 一律 unref：宠物挂件与轮询会留下永不清理的定时器，
       不 unref 的话测试进程永远不退出。 */
    setInterval: (...args) => { const id = setInterval(...args); if (id && typeof id.unref === "function") id.unref(); return id; },
    clearInterval,
    /* requestAnimationFrame 有预算：宠物动画是自我续帧的，直接接 setTimeout 会变成死循环。
       用完后回调只入队不再执行，测试需要更多帧就把 __frameBudget 调大。 */
    requestAnimationFrame: (fn) => {
      const id = setTimeout(() => {
        if (windowObject.__frameBudget <= 0) { windowObject.__droppedFrames += 1; return; }
        windowObject.__frameBudget -= 1;
        fn(Date.now());
      }, 0);
      return id;
    },
    cancelAnimationFrame: (id) => clearTimeout(id),
    matchMedia: (query) => ({
      matches: false, media: String(query),
      addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null
    }),
    getComputedStyle: (element) => computeStyle(element),
    scrollTo() {}, scrollBy() {},
    alert: (...a) => warnings.push(`alert:${a.join(" ")}`),
    confirm: () => true,
    prompt: () => null,
    showDirectoryPicker: async () => { throw new Error("showDirectoryPicker 没有打桩"); },
    addEventListener(type, handler) {
      const list = windowEvents.get(type) || [];
      list.push({ handler });
      windowEvents.set(type, list);
    },
    removeEventListener(type, handler) {
      const list = windowEvents.get(type) || [];
      const at = list.findIndex((entry) => entry.handler === handler);
      if (at >= 0) list.splice(at, 1);
    },
    dispatch(type, event) {
      for (const entry of (windowEvents.get(type) || []).slice()) entry.handler.call(windowObject, event || new DomEvent(type));
    },
    __windowEvents: windowEvents,
    __styleMap: styleMap,
    __warnings: warnings,
    __frameBudget: 240,
    __droppedFrames: 0
  };

  windowObject.window = windowObject;
  windowObject.self = windowObject;
  windowObject.top = windowObject;
  windowObject.parent = windowObject;
  windowObject.frames = windowObject;
  windowObject.globalThis = windowObject;
  windowObject.document = document;

  windowObject.URL = class extends URL {};
  windowObject.URL.createObjectURL = (blob) => { blobs.push(blob); return `blob:test/${blobs.length}`; };
  windowObject.URL.revokeObjectURL = () => {};
  windowObject.Blob = class Blob { constructor(parts, options) { this.parts = parts; this.type = (options && options.type) || ""; this.size = parts.reduce((sum, p) => sum + String(p).length, 0); } };
  windowObject.File = class File extends windowObject.Blob { constructor(parts, name, options) { super(parts, options); this.name = name; this.lastModified = Date.now(); } async text() { return this.parts.join(""); } };
  windowObject.FileReader = class FileReader {
    readAsText(file) { this.result = file && file.parts ? file.parts.join("") : ""; if (this.onload) setTimeout(() => this.onload(), 0); }
    readAsDataURL() { this.result = "data:,"; if (this.onload) setTimeout(() => this.onload(), 0); }
    abort() {}
  };
  windowObject.Image = class Image { constructor() { this.onload = null; this.onerror = null; } set src(_v) { if (this.onerror) setTimeout(() => this.onerror(new Error("图片没打桩")), 0); } };
  windowObject.Event = DomEvent;
  windowObject.CustomEvent = DomCustomEvent;
  windowObject.MouseEvent = DomMouseEvent;
  windowObject.KeyboardEvent = DomKeyboardEvent;
  windowObject.DOMException = class DOMException extends Error { constructor(message, name) { super(message); this.name = name || "Error"; } };
  windowObject.IntersectionObserver = class { constructor(cb) { this.callback = cb; } observe() {} unobserve() {} disconnect() {} };
  windowObject.ResizeObserver = class { constructor(cb) { this.callback = cb; } observe() {} unobserve() {} disconnect() {} };
  windowObject.MutationObserver = DomMutationObserver;
  windowObject.AbortController = AbortController;
  windowObject.fetch = async () => { throw new Error("fetch 没有打桩"); };

  /* 页面脚本会写 `x instanceof Element`（content.js 就是），所以这些类名得挂上去，
     而且要跟解析出来的元素是同一批类，不然 instanceof 恒为 false。 */
  windowObject.Node = DomNode;
  windowObject.Element = DomElement;
  windowObject.HTMLElement = DomElement;
  windowObject.HTMLDialogElement = DomElement;
  windowObject.HTMLInputElement = DomElement;
  windowObject.HTMLButtonElement = DomElement;
  windowObject.HTMLSelectElement = DomElement;
  windowObject.HTMLOptionElement = DomOption;
  windowObject.DocumentFragment = DomElement;
  windowObject.Option = DomOption;
  windowObject.Text = DomText;
  windowObject.EventTarget = DomNode;
  windowObject.window = windowObject;
  windowObject.self = windowObject;
  windowObject.__fireUserEvent = fireUserEvent;

  return { document, window: windowObject };
}

/** 派发一个「用户真的做了这个动作」的事件（isTrusted = true）。 */
function fireUserEvent(target, type, init = {}) {
  const EventClass = EVENT_TYPES[type] === "KeyboardEvent" ? DomKeyboardEvent
    : EVENT_TYPES[type] === "MouseEvent" || type === "click" ? DomMouseEvent : DomEvent;
  const event = new EventClass(type, { bubbles: true, cancelable: true, ...init });
  event.__isTrusted = true;
  target.dispatchEvent(event);
  return event;
}

/* ------------------------------------------------------------------ */
/* 加载整页                                                            */
/* ------------------------------------------------------------------ */

/** 从 HTML 里按出现顺序取出 `<script src="...">`。 */
function scriptSources(html) {
  const out = [];
  const pattern = /<script\b[^>]*\bsrc\s*=\s*"([^"]+)"[^>]*>/gi;
  let match;
  while ((match = pattern.exec(html))) out.push(match[1]);
  return out;
}

/**
 * 把一整页跑起来。
 *   htmlFile  —— 相对仓库根，例如 "library.html"
 *   scripts   —— 覆盖默认（默认取 HTML 里的 <script src>，按顺序）
 *   chrome    —— 覆盖默认（默认 harness.makeChrome()）
 *   globals   —— 额外注入的全局
 * 返回 { window, document, chrome, warnings, run() }
 */
function loadPage(options = {}) {
  const htmlFile = options.htmlFile;
  const html = options.html !== undefined ? options.html : readSource(htmlFile);
  const { document, window: windowObject } = createDom(html);
  const chrome = options.chrome || harness.makeChrome(options.chromeOptions || {});
  const warnings = windowObject.__warnings;

  const sandbox = windowObject;
  sandbox.chrome = chrome;
  for (const [key, value] of Object.entries(options.globals || {})) sandbox[key] = value;

  const context = vm.createContext(sandbox);
  const sources = options.scripts || scriptSources(html);
  const ran = [];
  const run = (file) => {
    const code = readSource(file);
    vm.runInContext(code, context, { filename: file });
    ran.push(file);
  };
  for (const file of sources) {
    if ((options.skip || []).includes(file)) continue;
    if (!fs.existsSync(path.join(projectRoot, file))) continue;
    run(file);
  }

  return { window: sandbox, document, chrome, warnings, run, ran, context, sandbox };
}

/** 造一个只带内容的页面（给 content.js 这类注入脚本用）。 */
function loadFragment(options = {}) {
  const html = options.html || "<!DOCTYPE html><html><head></head><body></body></html>";
  const { document, window: windowObject } = createDom(html);
  const chrome = options.chrome || harness.makeChrome(options.chromeOptions || {});
  const warnings = windowObject.__warnings;
  const sandbox = windowObject;
  sandbox.chrome = chrome;
  sandbox.location = options.location || { href: "https://www.bilibili.com/video/BV1xx411c7mD", origin: "https://www.bilibili.com", pathname: "/video/BV1xx411c7mD", search: "", hash: "" };
  for (const [key, value] of Object.entries(options.globals || {})) sandbox[key] = value;
  const context = vm.createContext(sandbox);
  for (const file of options.scripts || []) {
    vm.runInContext(readSource(file), context, { filename: file });
  }
  return { window: sandbox, document, chrome, warnings, context, sandbox };
}

module.exports = {
  createDom,
  loadPage,
  loadFragment,
  scriptSources,
  fireUserEvent,
  observerErrors,
  takeObserverErrors,
  // 直接暴露给"只想搭个小树"的用例
  parseInto,
  matchesSelector,
  querySelectorAll,
  descendants,
  DomNode,
  DomElement,
  DomText,
  DomEvent,
  DomCustomEvent,
  DomMouseEvent,
  DomKeyboardEvent
};
