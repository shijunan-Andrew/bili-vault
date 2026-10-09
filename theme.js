/* ==========================================================================
   BcaTheme（4.5）：白天 / 夜晚 / 跟随系统
   --------------------------------------------------------------------------
   放进 <head> 同步执行，避免先渲染成浅色再跳成深色。
   因此用 localStorage 而不是 chrome.storage——localStorage 是同步的，
   而三个扩展页面同源（chrome-extension://<id>），可以共享同一个键。
   深色令牌本身在 theme.css 里，这里只负责挂 data-theme。
   4.6：localStorage 那一份必须保留——同步读取是防闪色的关键；同时把主题镜像到
   chrome.storage.local，因为内容脚本跑在 B 站页面里，读到的是宿主的 localStorage，
   只能从 chrome.storage 取扩展的这一份。
   ========================================================================== */
(function attachTheme(global) {
  "use strict";

  const STORAGE_KEY = "interfaceTheme";
  // 4.6：内容脚本读的是 chrome.storage.local 里同一个键（见下方 mirrorToStorage）
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

  function readLocalRaw() {
    try {
      return global.localStorage?.getItem(STORAGE_KEY) ?? null;
    } catch (_) {
      return null;
    }
  }

  function readStored() {
    const value = readLocalRaw();
    return isSupported(value) ? value : DEFAULT_MODE;
  }

  function writeLocal(value) {
    try { global.localStorage?.setItem(STORAGE_KEY, value); } catch (_) {}
  }

  // 4.6：把主题镜像一份到 chrome.storage.local，供跑在 B 站页面里的内容脚本读取
  // （内容脚本读到的是宿主的 localStorage，拿不到扩展这一份）。
  // chrome.storage 在某些上下文里可能不可用，整条路都静默容忍：镜像失败只是
  // B 站提示卡的配色不同步，绝不能影响页面本身。
  function mirrorToStorage(value) {
    try {
      const area = global.chrome?.storage?.local;
      if (typeof area?.set !== "function") return;
      const result = area.set({ [STORAGE_KEY]: value });
      if (result && typeof result.catch === "function") result.catch(() => {});
    } catch (_) {}
  }

  function readFromStorage() {
    try {
      const area = global.chrome?.storage?.local;
      if (typeof area?.get !== "function") return null;
      const result = area.get(STORAGE_KEY);
      if (!result || typeof result.then !== "function") return null;
      return result
        .then((items) => (isSupported(items?.[STORAGE_KEY]) ? items[STORAGE_KEY] : null))
        .catch(() => null);
    } catch (_) {
      return null;
    }
  }

  // 启动校正（4.6）。boot() 必须同步画完首帧、不能 await，所以先按 localStorage 画，
  // 拿到 chrome.storage 之后再校正一次：
  //   1. localStorage 有合法值 → 以它为准；chrome.storage 里没有或不一样时补写镜像
  //      （4.5 → 4.6 升级时 storage 还是空的，靠这一步补上）。
  //   2. localStorage 为空或非法（换了浏览器配置文件、清了站点数据）→ 采用
  //      chrome.storage 里已有的值，并回写 localStorage，下次启动就能同步读到。
  // 两种情况下 DEFAULT_MODE 都不会盖掉用户真正选过的主题。
  function reconcile() {
    const stored = readFromStorage();
    if (!stored) return;
    stored.then((value) => {
      // 等待期间别的扩展页面可能刚写过 localStorage，所以这里重新读一次
      const local = readLocalRaw();
      if (isSupported(local)) {
        if (local !== value) mirrorToStorage(local);
        return;
      }
      if (!isSupported(value)) return;
      use(value, { silent: true });
      writeLocal(value);
    }).catch(() => {});
  }

  function use(next, options = {}) {
    mode = isSupported(next) ? next : DEFAULT_MODE;
    paint();
    if (!options.silent) {
      // 一次主题变更要同时落两份：localStorage 管扩展页面的同步首帧，
      // chrome.storage 管内容脚本（B 站页面上的提示卡）。
      writeLocal(mode);
      mirrorToStorage(mode);
    }
    listeners.forEach((listener) => {
      try { listener(mode); } catch (_) {}
    });
    return mode;
  }

  // 同步生效：head 里调用时立刻把 data-theme 挂好
  function boot() {
    use(readStored(), { silent: true });
    // 首帧已经画完，这里再和 chrome.storage 对一次账（异步，不挡渲染）
    reconcile();
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
