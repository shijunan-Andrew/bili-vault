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

  async function loadTable(locale) {
    if (locale === DEFAULT_LOCALE) return Object.create(null);
    try {
      // 内容脚本跑在网页里：从网页上下文 fetch 扩展资源**必须**声明
      // web_accessible_resources，而 4.3 起我们故意不把任何扩展页暴露给网页
      // （否则 B 站页面能把收藏库嵌进 iframe 做点击劫持）。
      // 所以内容脚本改由后台代取词典——service worker 读自己的资源不受此限。
      if (!inExtensionPage()) {
        const response = await chrome.runtime.sendMessage({ type: "bca-locale", locale });
        const dictionary = response?.ok ? response.dictionary : null;
        return dictionary && typeof dictionary === "object"
          ? Object.assign(Object.create(null), dictionary)
          : Object.create(null);
      }
      const response = await fetch(chrome.runtime.getURL(`locales/${locale}.json`));
      if (!response.ok) return Object.create(null);
      const payload = await response.json();
      return payload && typeof payload === "object" ? Object.assign(Object.create(null), payload) : Object.create(null);
    } catch (_) {
      // 词典缺失或损坏时退回原文，不能让整个界面打不开
      return Object.create(null);
    }
  }

  // 把标记过的静态节点翻译一遍。
  // data-i18n 用 textContent（只给纯文本节点用，带图标的请套一层 span）；
  // data-i18n-html 允许内嵌标签（例如「使用须知」里的 DownKyi 链接）。
  function apply(root = document) {
    if (!root?.querySelectorAll) return;
    root.querySelectorAll("[data-i18n]").forEach((element) => {
      element.textContent = t(element.dataset.i18n);
    });
    root.querySelectorAll("[data-i18n-html]").forEach((element) => {
      element.innerHTML = t(element.dataset.i18nHtml);
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
  function locales() { return LOCALES.slice(); }
  function onChange(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  global.BcaI18n = Object.freeze({
    t, use, init, apply, locale, locales, onChange, isSupported,
    LOCALES, DEFAULT_LOCALE, STORAGE_KEY
  });
})(globalThis);
