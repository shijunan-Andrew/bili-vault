/* ==========================================================================
   BcaTheme（4.5）：白天 / 夜晚 / 跟随系统
   --------------------------------------------------------------------------
   放进 <head> 同步执行，避免先渲染成浅色再跳成深色。
   因此用 localStorage 而不是 chrome.storage——localStorage 是同步的，
   而三个扩展页面同源（chrome-extension://<id>），可以共享同一个键。
   深色令牌本身在 theme.css 里，这里只负责挂 data-theme。
   ========================================================================== */
(function attachTheme(global) {
  "use strict";

  const STORAGE_KEY = "interfaceTheme";
  const MODES = Object.freeze([
    { id: "system", label: "跟随系统" },
    { id: "light", label: "白天" },
    { id: "dark", label: "夜晚" }
  ]);
  const DEFAULT_MODE = "system";

  // 浏览器工具栏取色：<meta name="theme-color"> 只能用字面量，吃不到 CSS 变量，
  // 所以在这里按解析出来的主题同步。
  const THEME_COLORS = { light: "#f2f5f9", dark: "#0f1216" };

  const media = global.matchMedia ? global.matchMedia("(prefers-color-scheme: dark)") : null;
  let mode = DEFAULT_MODE;
  const listeners = new Set();

  function isSupported(value) {
    return MODES.some((item) => item.id === value);
  }

  function systemPrefersDark() {
    return Boolean(media?.matches);
  }

  function resolved() {
    return mode === "system" ? (systemPrefersDark() ? "dark" : "light") : mode;
  }

  // 不给 data-theme 时由 theme.css 的媒体查询接管；给了就覆盖系统设置
  function paint() {
    const root = document.documentElement;
    if (mode === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", mode);
    const now = resolved();
    root.dataset.themeResolved = now;
    const meta = document.querySelector?.('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", THEME_COLORS[now] || THEME_COLORS.light);
  }

  function readStored() {
    try {
      const value = global.localStorage?.getItem(STORAGE_KEY);
      return isSupported(value) ? value : DEFAULT_MODE;
    } catch (_) {
      return DEFAULT_MODE;
    }
  }

  function use(next, options = {}) {
    mode = isSupported(next) ? next : DEFAULT_MODE;
    paint();
    if (!options.silent) {
      try { global.localStorage?.setItem(STORAGE_KEY, mode); } catch (_) {}
    }
    listeners.forEach((listener) => {
      try { listener(mode); } catch (_) {}
    });
    return mode;
  }

  // 同步生效：head 里调用时立刻把 data-theme 挂好
  function boot() {
    use(readStored(), { silent: true });
    if (media?.addEventListener) media.addEventListener("change", () => { if (mode === "system") paint(); });
    // 同源的其它扩展页面改了主题时跟着变（localStorage 的 storage 事件只在
    // 「别的」文档里触发，所以这里不会自我循环）
    global.addEventListener?.("storage", (event) => {
      if (event.key && event.key !== STORAGE_KEY) return;
      use(readStored(), { silent: true });
    });
  }

  function current() { return mode; }
  function modes() { return MODES.slice(); }
  function onChange(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  const api = Object.freeze({ boot, use, current, modes, resolved, onChange, isSupported, STORAGE_KEY, DEFAULT_MODE, MODES });
  global.BcaTheme = api;
  // 立即应用，别等 DOMContentLoaded
  boot();
})(globalThis);
