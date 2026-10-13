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
   1.4.0：新增第四种外观「自定义」——底色仍按白天算，另外在页面背后铺一张用户选的
   本地图片，可以调遮罩透明度与模糊强度；再给一个「毛玻璃」开关（强度见 theme.css）。
   图片不走 chrome.storage（可能撞 10MB 配额），单独存 IndexedDB 的 Blob。
   「自定义」= data-theme="light" + data-appearance="custom"，这样所有原本按
   深色写的规则都不用动：弹窗也就自动是白天色（弹窗不铺背景图、不做玻璃）。
   ========================================================================== */
(function attachTheme(global) {
  "use strict";

  const STORAGE_KEY = "interfaceTheme";
  // 4.6：内容脚本读的是 chrome.storage.local 里同一个键（见下方 mirrorToStorage）
  // 只留 id：这四行原来各带一个中文 label，全仓没有任何地方读过它 ——
  // 设置页那四个按钮的文案是 settings.html 自己写的（带 data-i18n）。
  // 留在这里的中文既翻不了（locales/ 的词条键是 HTML 里的原文）又是误导，
  // 让人以为改这里就能改设置页文案。
  const MODES = Object.freeze([
    { id: "system" },
    { id: "light" },
    { id: "dark" },
    { id: "custom" }
  ]);
  const DEFAULT_MODE = "system";

  // 1.4.0：自定义外观。整份存成一个 JSON 字符串，localStorage 与 chrome.storage 各一份
  // （理由同主题：localStorage 管同源页面之间的即时同步，chrome.storage 管镜像与补救）。
  const APPEARANCE_KEY = "interfaceAppearance";
  const DEFAULT_APPEARANCE = Object.freeze({
    veil: 50,        // 背景遮罩透明度 0-100：越大越像蒙了一层雾
    blur: 0,         // 背景模糊强度 0-40（px）
    glass: false,    // 毛玻璃开关：默认关——它对低配机器有真实成本
    glassBlur: 16    // 毛玻璃模糊强度 1-20（px，与参考实现的取值范围一致）
  });
  // 图片单独放 IndexedDB：一张手机照片动辄三五 MB，chrome.storage.local 默认只有 10MB，
  // 而且它和「收藏库用哪个目录」这种小设置挤在同一个配额里，不合适。
  const WALLPAPER_DB = "bili-vault-appearance";
  const WALLPAPER_STORE = "wallpaper";
  const WALLPAPER_KEY = "current";

  // 浏览器工具栏取色：<meta name="theme-color"> 只能用字面量，吃不到 CSS 变量，
  // 所以在这里按解析出来的主题同步。
  // 下面这两个色值是「最后兜底」，真值以 theme.css 的 :root --bg 为准：
  // 以前这里是同一份字面量的第三个副本，改了 --bg 不会连带。
  const THEME_COLORS = { light: "#f2f5f9", dark: "#0f1216" };

  const media = global.matchMedia ? global.matchMedia("(prefers-color-scheme: dark)") : null;
  let mode = DEFAULT_MODE;
  let appearance = { ...DEFAULT_APPEARANCE };
  let wallpaperLayer = null;
  let wallpaperUrl = "";
  const listeners = new Set();
  const appearanceListeners = new Set();

  function isSupported(value) {
    return MODES.some((item) => item.id === value);
  }

  function systemPrefersDark() {
    return Boolean(media?.matches);
  }

  // <meta name="theme-color"> 的取值：先读 theme.css 里真正的 --bg（计算值，
  // 已经按 data-theme 解析过），读不到才用 THEME_COLORS 里的字面量兜底。
  // 之所以能读：theme.css 的 <link> 在 <script> 之前，此刻样式表已生效；
  // 之所以要读：改 --bg 时这里不会跟着漂，也不会反过来把字面量写死成第二份真值。
  // 注意读的是元素上的 --bg 而不是 :root 的 —— 两者在本仓是同一个值，
  // 但元素上的那份一定是「当前真的在用的」。
  function themeColor(tone) {
    try {
      const value = global.getComputedStyle?.(document.documentElement)?.getPropertyValue("--bg");
      if (value && value.trim()) return value.trim();
    } catch (_) {}
    return THEME_COLORS[tone] || THEME_COLORS.light;
  }

  // 「自定义」的底色就是白天：弹窗、提示卡、内容脚本都不铺背景图。
  function resolved() {
    if (mode === "custom") return "light";
    return mode === "system" ? (systemPrefersDark() ? "dark" : "light") : mode;
  }

  // ---------- 自定义外观 ----------

  function clamp(value, min, max, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, Math.round(number)));
  }

  function normalizeAppearance(source) {
    const raw = source && typeof source === "object" ? source : {};
    return {
      veil: clamp(raw.veil, 0, 100, DEFAULT_APPEARANCE.veil),
      blur: clamp(raw.blur, 0, 40, DEFAULT_APPEARANCE.blur),
      glass: Boolean(raw.glass),
      glassBlur: clamp(raw.glassBlur, 1, 20, DEFAULT_APPEARANCE.glassBlur)
    };
  }

  function readAppearanceLocal() {
    try {
      const raw = global.localStorage?.getItem(APPEARANCE_KEY);
      if (!raw) return null;
      return normalizeAppearance(JSON.parse(raw));
    } catch (_) {
      return null;
    }
  }

  function writeAppearanceLocal(value) {
    try { global.localStorage?.setItem(APPEARANCE_KEY, JSON.stringify(value)); } catch (_) {}
  }

  // 把外观换算成 CSS 变量。颜色与尺寸都留在这里算，CSS 只负责用。
  function paintAppearance() {
    const root = document.documentElement;
    root.dataset.appearance = mode === "custom" ? "custom" : "plain";
    root.classList.toggle("bca-glass", Boolean(appearance.glass));
    // 遮罩是「浅色雾」而不是黑幕：页面底色本来就是浅的，压一层白雾既压得住花哨的照片，
    // 又不会把整页拖进深色（整页变暗会让后面的白卡片看着是浮起来的）。上限 92%：
    // 盖死就完全看不见照片了，那还不如不设背景。
    root.style.setProperty("--bca-wallpaper-veil", `rgba(242, 245, 249, ${((appearance.veil / 100) * 0.92).toFixed(3)})`);
    root.style.setProperty("--bca-wallpaper-blur", `${appearance.blur}px`);
    root.style.setProperty("--bca-glass-blur", `${appearance.glassBlur}px`);
  }

  function notifyAppearance() {
    appearanceListeners.forEach((listener) => {
      try { listener(appearance); } catch (_) {}
    });
  }

  function setAppearance(patch, options = {}) {
    appearance = normalizeAppearance({ ...appearance, ...(patch || {}) });
    paintAppearance();
    if (!options.silent) {
      writeAppearanceLocal(appearance);
      mirrorToStorage(APPEARANCE_KEY, JSON.stringify(appearance));
    }
    notifyAppearance();
    return appearance;
  }

  // ---------- 背景图（IndexedDB 里的 Blob） ----------

  function openWallpaperDb() {
    return new Promise((resolve, reject) => {
      if (!global.indexedDB) { reject(new Error("no indexedDB")); return; }
      const request = global.indexedDB.open(WALLPAPER_DB, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(WALLPAPER_STORE)) db.createObjectStore(WALLPAPER_STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("open failed"));
    });
  }

  function withWallpaperStore(mode_, run) {
    return openWallpaperDb().then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction(WALLPAPER_STORE, mode_);
      const store = tx.objectStore(WALLPAPER_STORE);
      let result;
      try { result = run(store); } catch (error) { reject(error); return; }
      tx.oncomplete = () => { db.close(); resolve(result?.result ?? null); };
      tx.onerror = () => { db.close(); reject(tx.error || new Error("tx failed")); };
      tx.onabort = () => { db.close(); reject(tx.error || new Error("tx aborted")); };
    }));
  }

  function readWallpaperBlob() {
    return withWallpaperStore("readonly", (store) => store.get(WALLPAPER_KEY));
  }

  // 页面背后那一层。只在真的要用到的时候插：弹窗由页面自己声明
  // data-wallpaper-scope="popup" 排除掉，它不铺背景图。
  function ensureWallpaperLayer() {
    if (document.documentElement.dataset.wallpaperScope === "popup") return null;
    if (wallpaperLayer && wallpaperLayer.isConnected) return wallpaperLayer;
    if (!document.body) return null;
    wallpaperLayer = document.createElement("div");
    wallpaperLayer.className = "bca-wallpaper";
    wallpaperLayer.setAttribute("aria-hidden", "true");
    document.body.insertBefore(wallpaperLayer, document.body.firstChild);
    return wallpaperLayer;
  }

  function applyWallpaperUrl(blob) {
    if (wallpaperUrl) {
      try { URL.revokeObjectURL(wallpaperUrl); } catch (_) {}
      wallpaperUrl = "";
    }
    const root = document.documentElement;
    if (!blob) {
      root.removeAttribute("data-wallpaper");
      root.style.removeProperty("--bca-wallpaper-image");
      return;
    }
    wallpaperUrl = URL.createObjectURL(blob);
    ensureWallpaperLayer();
    root.style.setProperty("--bca-wallpaper-image", `url("${wallpaperUrl}")`);
    root.dataset.wallpaper = "on";
  }

  // 读一次就画上。失败（没有图 / IndexedDB 不可用）时静默保持纯色背景，
  // 背景图从来不是「能用」的前提。
  function loadWallpaper() {
    if (!global.indexedDB) return Promise.resolve(null);
    return readWallpaperBlob()
      .then((blob) => { applyWallpaperUrl(blob); return blob; })
      .catch(() => null);
  }

  // 存之前先压一道：一张手机原图动辄五千万像素，铺满屏根本看不出差别，却要占十几 MB。
  // 长边超过 2560 就等比缩小，再按 webp 0.92 重编码（webp 留得住透明通道，体积比 png 小得多）。
  // 任何一步不支持或失败都原样存原图——压不动不该挡住用户设背景。
  function prepareWallpaper(file) {
    if (!file || typeof file.type !== "string" || !file.type.startsWith("image/")) {
      return Promise.reject(new Error("not an image"));
    }
    const MAX_EDGE = 2560;
    const BYPASS_BYTES = 1.5 * 1024 * 1024;
    if (typeof global.createImageBitmap !== "function") return Promise.resolve(file);
    return global.createImageBitmap(file)
      .then((bitmap) => {
        // 从这里开始到 toBlob 走完，bitmap 由本函数负责释放（每一条出口都要 close）：
        // 解码出来的是原始像素，一张 5000 万像素的图占着内存不放，多试两次就卡机器。
        try {
          const edge = Math.max(bitmap.width, bitmap.height);
          const scale = edge > MAX_EDGE ? MAX_EDGE / edge : 1;
          if (scale === 1 && file.size <= BYPASS_BYTES) { bitmap.close?.(); return file; }
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(bitmap.width * scale));
          canvas.height = Math.max(1, Math.round(bitmap.height * scale));
          const context = canvas.getContext("2d");
          if (!context) { bitmap.close?.(); return file; }
          context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
          bitmap.close?.();
          return new Promise((resolve) => {
            canvas.toBlob((blob) => resolve(blob || file), "image/webp", 0.92);
          });
        } catch (error) {
          // 原来这里是「.catch(() => file)」——canvas 分配失败 / drawImage 抛错时
          // 上面三次 close 全被跳过，bitmap 就这么漏了。统一在这里收口。
          bitmap.close?.();
          return file;
        }
      });
  }

  // V1.4.1：背景图存在 IndexedDB 的 Blob 里，localStorage 那条同步通道看不见它 ——
  // 「设置页选了图，已经开着的收藏库要按刷新才变」就是这么来的。这里在 chrome.storage
  // 放一个时间戳当信号：存图 / 删图时写一次，别的扩展页面收到就重新读一遍 Blob。
  const WALLPAPER_REVISION_KEY = "interfaceWallpaperRevision";

  function announceWallpaperChange() {
    try { global.chrome?.storage?.local?.set({ [WALLPAPER_REVISION_KEY]: Date.now() }); } catch (_) {}
  }

  function saveWallpaper(file) {
    if (!file) return Promise.reject(new Error("no file"));
    return prepareWallpaper(file)
      .then((prepared) => withWallpaperStore("readwrite", (store) => store.put(prepared, WALLPAPER_KEY))
        .then(() => { applyWallpaperUrl(prepared); announceWallpaperChange(); return prepared; }));
  }

  function clearWallpaper() {
    return withWallpaperStore("readwrite", (store) => store.delete(WALLPAPER_KEY))
      .then(() => { applyWallpaperUrl(null); announceWallpaperChange(); return true; });
  }

  // ---------- 主题本体 ----------

  // 不给 data-theme 时由 theme.css 的媒体查询接管；给了就覆盖系统设置
  function paint() {
    const root = document.documentElement;
    if (mode === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", resolved());
    root.dataset.themeResolved = resolved();
    const meta = document.querySelector?.('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", themeColor(resolved()));
    paintAppearance();
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
  function mirrorToStorage(key, value) {
    try {
      const area = global.chrome?.storage?.local;
      if (typeof area?.set !== "function") return;
      const result = area.set({ [key]: value });
      if (result && typeof result.catch === "function") result.catch(() => {});
    } catch (_) {}
  }

  function readFromStorage(key) {
    try {
      const area = global.chrome?.storage?.local;
      if (typeof area?.get !== "function") return null;
      const result = area.get(key);
      if (!result || typeof result.then !== "function") return null;
      return result
        .then((items) => items?.[key] ?? null)
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
  // 1.4.0：外观那几个数值走同一套对账逻辑，图片本身在 IndexedDB 里，不需要对账。
  function reconcile() {
    const stored = readFromStorage(STORAGE_KEY);
    if (stored) {
      stored.then((value) => {
        // 等待期间别的扩展页面可能刚写过 localStorage，所以这里重新读一次
        const local = readLocalRaw();
        if (isSupported(local)) {
          if (local !== value) mirrorToStorage(STORAGE_KEY, local);
          return;
        }
        if (!isSupported(value)) return;
        use(value, { silent: true });
        writeLocal(value);
      }).catch(() => {});
    }
    const storedAppearance = readFromStorage(APPEARANCE_KEY);
    if (storedAppearance) {
      storedAppearance.then((raw) => {
        if (!raw) return;
        // 等待期间别的扩展页面可能刚写过 localStorage，所以这里重新读一次
        // （主题那一支一直是这么做的，外观这一支原来在 361 行提前取好值，
        //  结果 367 行会拿**旧值**去 mirrorToStorage，把用户刚改的覆盖掉）。
        const local = readAppearanceLocal();
        if (local) {
          if (JSON.stringify(local) !== raw) mirrorToStorage(APPEARANCE_KEY, JSON.stringify(local));
          return;
        }
        let parsed = null;
        try { parsed = JSON.parse(raw); } catch (_) { parsed = null; }
        if (!parsed) return;
        setAppearance(parsed, { silent: true });
        writeAppearanceLocal(appearance);
      }).catch(() => {});
    }
  }

  function use(next, options = {}) {
    mode = isSupported(next) ? next : DEFAULT_MODE;
    paint();
    if (!options.silent) {
      // 一次主题变更要同时落两份：localStorage 管扩展页面的同步首帧，
      // chrome.storage 管内容脚本（B 站页面上的提示卡）。
      writeLocal(mode);
      mirrorToStorage(STORAGE_KEY, mode);
    }
    listeners.forEach((listener) => {
      try { listener(mode); } catch (_) {}
    });
    return mode;
  }

  // 同步生效：head 里调用时立刻把 data-theme 挂好
  // 句柄存在模块作用域：boot() 只该跑一次，但真被调第二次时得能把上一次挂的
  // 监听摘掉，否则同一次系统换肤会被 paint 好几遍。
  let booted = false;
  let mediaChangeHandler = null;
  let storageHandler = null;

  function boot() {
    if (booted) return;
    booted = true;
    appearance = normalizeAppearance(readAppearanceLocal());
    use(readStored(), { silent: true });
    // 首帧已经画完，这里再和 chrome.storage 对一次账（异步，不挡渲染）
    reconcile();
    // 背景图是异步的（IndexedDB），所以晚一点再铺；铺之前页面就是纯色，不会闪白
    const startWallpaper = () => { if (mode === "custom") loadWallpaper(); };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startWallpaper);
    else startWallpaper();
    if (media?.addEventListener) {
      media.removeEventListener?.("change", mediaChangeHandler);
      mediaChangeHandler = () => { if (mode === "system") paint(); };
      media.addEventListener("change", mediaChangeHandler);
    }
    // 同源的其它扩展页面改了主题时跟着变（localStorage 的 storage 事件只在
    // 「别的」文档里触发，所以这里不会自我循环）
    storageHandler = (event) => {
      try {
        if (event.key === APPEARANCE_KEY) {
          const next = readAppearanceLocal();
          // 键被清掉（storage 被清空）时不拿默认值盖掉正在用的外观；
          // 真读到值才重画。原来这里是无条件 normalizeAppearance(null) → 默认外观。
          if (!next) return;
          const wasCustom = mode === "custom";
          appearance = next;
          paintAppearance();
          notifyAppearance();
          // 这里**不**读 IndexedDB。外观 JSON 里没有图片（图是另一个 Blob），
          // 设置页的三个滑杆是 input 事件逐帧写 -> 跨文档 storage 事件，
          // 在这儿 loadWallpaper 就是「拖一下滑杆，别的页面每帧建一次 objectURL」。
          // 换图另有 WALLPAPER_REVISION_KEY 通道（见下面 onChanged），这里只负责重画。
          // 唯一的例外：外观顺手把主题切成自定义时，背景图得补上（只有这一帧会走）。
          if (mode === "custom" && !wasCustom) loadWallpaper();
          return;
        }
        if (event.key && event.key !== STORAGE_KEY) return;
        const previous = mode;
        use(readStored(), { silent: true });
        // 同理：只有「刚变成自定义」这一帧才需要重新读图。
        if (mode === "custom" && previous !== "custom") loadWallpaper();
      } catch (_) {}
    };
    global.removeEventListener?.("storage", storageHandler);
    global.addEventListener?.("storage", storageHandler);
    // V1.4.1：背景图的跨页同步。setAppearance 走 localStorage 就能通知到别的页面，
    // 但图片本体在 IndexedDB 里 —— 存图 / 删图时写一个时间戳到 chrome.storage，
    // 别的页面（正在开着的收藏库）收到就重新读一次，不用用户手动刷新。
    // 滑杆那一侧不走这条路：外观 JSON 变了不等于图变了。
    try {
      global.chrome?.storage?.onChanged?.addListener((changes, areaName) => {
        if (areaName !== "local" || !changes[WALLPAPER_REVISION_KEY]) return;
        if (mode === "custom") loadWallpaper();
      });
    } catch (_) {}
  }

  function current() { return mode; }
  function modes() { return MODES.slice(); }
  function onChange(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }
  function getAppearance() { return { ...appearance }; }
  function onAppearanceChange(listener) {
    appearanceListeners.add(listener);
    return () => appearanceListeners.delete(listener);
  }

  const api = Object.freeze({
    boot, use, current, modes, resolved, onChange, isSupported,
    STORAGE_KEY, DEFAULT_MODE, MODES,
    APPEARANCE_KEY, DEFAULT_APPEARANCE,
    appearance: getAppearance, setAppearance, onAppearanceChange,
    loadWallpaper, prepareWallpaper, saveWallpaper, clearWallpaper
  });
  global.BcaTheme = api;
  // 立即应用，别等 DOMContentLoaded
  boot();
})(globalThis);
