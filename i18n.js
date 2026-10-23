/* ==========================================================================
   BcaI18n（4.5）：界面多语言
   --------------------------------------------------------------------------
   设计要点：
   1. **用中文原文当 key**。简体中文不需要任何词典文件——查不到就原样返回，
      所以 zh-CN 是零成本的“原文语言”。locales/zh-TW.json 与 locales/en.json
      只存需要改写的条目。
   2. 词典是纯 JSON，页面和 service worker 都能 fetch（background 是模块化 worker，
      没法加载经典脚本，但 fetch 自己的扩展资源没问题）。
   3. 只翻译界面文字。视频标题、UP 主名、简介、标签、文件名等固有名称一律不碰——
      它们本来就不经过 t()。
   4. key 必须是字面量。测试会扫描全部 t("...") 与 data-i18n，确保词典没有漏条目。
   ========================================================================== */
(function attachI18n(global) {
  "use strict";

  const LOCALES = Object.freeze([
    { id: "zh-CN", label: "简体中文" },
    { id: "zh-TW", label: "繁體中文" },
    { id: "en", label: "English" }
  ]);
  const DEFAULT_LOCALE = "zh-CN";
  const STORAGE_KEY = "interfaceLocale";

  let current = DEFAULT_LOCALE;
  let table = Object.create(null);
  let loading = null;
  const listeners = new Set();

  function isSupported(locale) {
    return LOCALES.some((item) => item.id === locale);
  }

  // 查不到就返回原文，再把 {name} 之类的占位符替换掉
  function t(text, params) {
    const key = String(text ?? "");
    let out = Object.prototype.hasOwnProperty.call(table, key) ? String(table[key]) : key;
    if (params) {
      for (const name of Object.keys(params)) {
        out = out.split(`{${name}}`).join(String(params[name]));
      }
    }
    return out;
  }

  // 1.7.14（facet-compat C5）：词典取不回来时原来只有一个 `catch (_) { return 空词典 }`，
  // 界面会永久停在中文，用户和排查的人都不知道发生过什么（内容脚本那条
  // runtime.sendMessage 更是连超时都没有，后台没起来时会永远挂着）。
  // 现在：① 请求带超时；② 失败记成 lastFailure + 一条 console.warn；
  //       ③ 设置页据此给一句看得见的说明。
  const LOCALE_REQUEST_TIMEOUT_MS = 3000;
  let lastFailure = null;

  // 设置页用它决定要不要给一句看得见的说明
  function loadFailure() { return lastFailure; }

  function noteFailure(locale, reason) {
    lastFailure = Object.freeze({ locale, reason: String(reason), at: Date.now() });
    try { console.warn(`[哔哩藏库] ${locale} 词典没取到（${reason}），界面暂时按中文原文显示。`); } catch (_) {}
  }

  function withTimeout(promise, ms) {
    let timer = 0;
    const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve(null), ms); });
    return Promise.race([promise, timeout]).then(
      (value) => { clearTimeout(timer); return value; },
      (error) => { clearTimeout(timer); throw error; }
    );
  }

  async function loadTable(locale) {
    if (locale === DEFAULT_LOCALE) return Object.create(null);
    try {
      // 内容脚本跑在网页里：从网页上下文 fetch 扩展资源**必须**声明
      // web_accessible_resources，而 4.3 起我们故意不把任何扩展页暴露给网页
      // （否则 B 站页面能把收藏库嵌进 iframe 做点击劫持）。
      // 所以内容脚本改由后台代取词典——service worker 读自己的资源不受此限。
      if (!inExtensionPage()) {
        const response = await withTimeout(
          chrome.runtime.sendMessage({ type: "bca-locale", locale }),
          LOCALE_REQUEST_TIMEOUT_MS
        );
        const dictionary = response?.ok ? response.dictionary : null;
        if (!dictionary || typeof dictionary !== "object" || !Object.keys(dictionary).length) {
          noteFailure(locale, response ? "后台回的词典是空的" : `后台 ${LOCALE_REQUEST_TIMEOUT_MS} 毫秒内没有回应`);
          return Object.create(null);
        }
        return Object.assign(Object.create(null), dictionary);
      }
      const response = await fetch(chrome.runtime.getURL(`locales/${locale}.json`));
      if (!response.ok) {
        noteFailure(locale, `读词典文件失败（HTTP ${response.status}）`);
        return Object.create(null);
      }
      const payload = await response.json();
      if (!payload || typeof payload !== "object" || !Object.keys(payload).length) {
        noteFailure(locale, "词典文件是空的");
        return Object.create(null);
      }
      return Object.assign(Object.create(null), payload);
    } catch (error) {
      // 词典缺失或损坏时退回原文，不能让整个界面打不开 —— 但这次要留下痕迹
      noteFailure(locale, error?.message || String(error));
      return Object.create(null);
    }
  }

  // 1.8.22（old-p3 security P3-1）：data-i18n-html 以前是 innerHTML = t(...)。
  // 词表是我们自己写的，但这是扩展里唯一「字符串 → HTML」的入口：将来任何一处文案
  // 被改坏（或词典文件被意外注入）都会在扩展页里执行脚本。这里改成白名单渲染 ——
  // 只留少量行内标签与 http(s) 链接，其余元素拆掉、属性清掉。
  const I18N_HTML_TAGS = new Set(["A", "SPAN", "B", "STRONG", "EM", "BR", "CODE"]);
  const I18N_HTML_LINK_PROTOCOLS = new Set(["http:", "https:"]);
  function sanitizeI18nHtml(markup) {
    const holder = document.createElement("div");
    holder.innerHTML = String(markup ?? "");
    const clean = (parent) => {
      let index = 0;
      while (index < parent.childNodes.length) {
        const node = parent.childNodes[index];
        if (node.nodeType === 3) { index += 1; continue; }
        if (node.nodeType !== 1) { parent.removeChild(node); continue; }
        if (!I18N_HTML_TAGS.has(node.tagName)) {
          // 不允许的标签：拆掉外壳，把里面的文字留下（不整段丢，免得文案缺字）
          const children = [...node.childNodes];
          for (const child of children) parent.insertBefore(child, node);
          parent.removeChild(node);
          continue;
        }
        const isLink = node.tagName === "A";
        // 真浏览器是 NamedNodeMap，测试用小 dom 是 Map —— 两种都取得到名字
        const attributeNames = node.attributes instanceof Map
          ? [...node.attributes.keys()]
          : [...node.attributes].map((attribute) => attribute.name);
        for (const attributeName of attributeNames) {
          const name = String(attributeName).toLowerCase();
          if (isLink && name === "href") {
            let protocol = "";
            try { protocol = new URL(node.getAttribute("href"), global.location?.href || "about:blank").protocol; } catch (_) {}
            if (!I18N_HTML_LINK_PROTOCOLS.has(protocol)) node.removeAttribute("href");
            continue;
          }
          if (isLink && (name === "title" || name === "target" || name === "rel")) continue;
          node.removeAttribute(name);
        }
        if (isLink) {
          node.setAttribute("target", "_blank");
          node.setAttribute("rel", "noopener noreferrer");
        }
        clean(node);
        index += 1;
      }
    };
    clean(holder);
    return [...holder.childNodes];
  }

  // 1.8.22（old-p3 security P3-2）：反嵌入兜底以前只有 library.js 顶部一份。
  // 设置页 / 统计页 / 教程页 / 弹窗同样能被别的页面嵌进 iframe 里做点击劫持，
  // 所以判据收口到这里，各扩展页在脚本开头调一次（措辞由调用方给）。
  function guardTopFrame(message, errorMessage) {
    let embedded = false;
    try { embedded = global.top !== global.self; } catch (_) { embedded = true; }
    if (!embedded) return;
    const text = t(String(message || ""));
    if (document.body) document.body.textContent = text;
    else document.documentElement.textContent = text;
    throw new Error(t(String(errorMessage || message || "")));
  }

  // 把标记过的静态节点翻译一遍。
  // data-i18n 用 textContent（只给纯文本节点用，带图标的请套一层 span）；
  // data-i18n-html 允许内嵌标签（例如「使用须知」里的 DownKyi 链接），走白名单渲染。
  function apply(root = document) {
    if (!root?.querySelectorAll) return;
    root.querySelectorAll("[data-i18n]").forEach((element) => {
      element.textContent = t(element.dataset.i18n);
    });
    root.querySelectorAll("[data-i18n-html]").forEach((element) => {
      element.replaceChildren(...sanitizeI18nHtml(t(element.dataset.i18nHtml)));
    });
    root.querySelectorAll("[data-i18n-title]").forEach((element) => {
      element.title = t(element.dataset.i18nTitle);
    });
    root.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
      element.placeholder = t(element.dataset.i18nPlaceholder);
    });
    root.querySelectorAll("[data-i18n-aria]").forEach((element) => {
      element.setAttribute("aria-label", t(element.dataset.i18nAria));
    });
  }

  // 内容脚本跑在 B 站页面里：绝不能顺手翻译宿主页面，也不能改它的 lang
  function inExtensionPage() {
    try { return global.location?.protocol === "chrome-extension:"; } catch (_) { return false; }
  }

  async function use(locale, options = {}) {
    const next = isSupported(locale) ? locale : DEFAULT_LOCALE;
    // 同一个语言重复切换时复用上一次的加载，避免闪烁
    if (!loading || current !== next) loading = loadTable(next);
    table = await loading;
    current = next;
    // 切到中文是天生不需要词典的；切到别的语言却拿到空表，说明 lastFailure 还成立
    if (next === DEFAULT_LOCALE || Object.keys(table).length) lastFailure = null;
    if (inExtensionPage()) {
      try { document.documentElement.lang = next; } catch (_) {}
      apply(document);
    } else if (options.root) {
      apply(options.root);
    }
    if (!options.silent) {
      try { await chrome.storage.local.set({ [STORAGE_KEY]: next }); } catch (_) {}
    }
    listeners.forEach((listener) => {
      try { listener(next); } catch (_) {}
    });
    return next;
  }

  // 各页面在第一次渲染之前调用，保证不会先闪一下中文。
  // 内容脚本传入 root，只翻译自己插入的那块 DOM。
  async function init(options = {}) {
    let saved = DEFAULT_LOCALE;
    try {
      const stored = await chrome.storage.local.get(STORAGE_KEY);
      if (isSupported(stored?.[STORAGE_KEY])) saved = stored[STORAGE_KEY];
    } catch (_) {}
    return use(saved, Object.assign({ silent: true }, options));
  }

  function locale() { return current; }
  function onChange(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  global.BcaI18n = Object.freeze({
    t, use, init, apply, guardTopFrame, locale, onChange, isSupported, loadFailure, STORAGE_KEY
  });
})(globalThis);
