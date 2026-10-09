/* ==========================================================================
   icons.js —— 4.0 统一图标集
   3.x 用 ▦ ▤ ▣ ▶ ♫ ↻ ＋ ⌕ ⠿ ✦ 等字符当图标，字重、基线、视觉大小各不相同，
   部分字符在个别系统还会被渲染成 emoji。这里换成同一套 24px 线性 SVG：
   1.7px 描边、圆头圆角、currentColor 上色。

   用法：
   - 静态 HTML：<span data-icon="folder"></span>（DOMContentLoaded 时自动填充）
   - JS 模板串：BcaIcons.svg("download")
   ========================================================================== */
(function attachIcons(global) {
  "use strict";

  const PATHS = {
    library: '<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/>',
    collection: '<path d="M3.5 7.2a2 2 0 0 1 2-2h3.1l1.6 2h8.3a2 2 0 0 1 2 2v7.6a2 2 0 0 1-2 2H5.5a2 2 0 0 1-2-2z"/>',
    "collection-open": '<path d="M3.6 8.2V6.6a2 2 0 0 1 2-2h3l1.6 2h7.3a2 2 0 0 1 2 2v.8"/><path d="M3 10.6h17.6l-1.9 7a2 2 0 0 1-1.9 1.5H6.2a2 2 0 0 1-1.9-1.5z"/>',
    plus: '<path d="M12 5.2v13.6M5.2 12h13.6"/>',
    search: '<circle cx="10.8" cy="10.8" r="6.3"/><path d="m15.6 15.6 4 4"/>',
    refresh: '<path d="M20.4 12a8.4 8.4 0 1 1-2.6-6.1"/><path d="M20.4 4.6v4.6H15.8"/>',
    download: '<path d="M12 4v10.6"/><path d="m7.7 10.5 4.3 4.3 4.3-4.3"/><path d="M4.7 19.3h14.6"/>',
    play: '<path d="M8.2 5.7c0-.8.9-1.3 1.5-.9l8 5.4c.6.4.6 1.3 0 1.7l-8 5.4c-.6.4-1.5-.1-1.5-.9z" fill="currentColor" stroke="none"/>',
    music: '<path d="M9.2 17.6V6.7l8.4-1.5v10.6"/><circle cx="6.5" cy="17.8" r="2.7"/><circle cx="14.9" cy="16" r="2.7"/>',
    danmaku: '<path d="M20.2 11.8c0 3.4-3.7 6.1-8.2 6.1-1 0-1.9-.1-2.8-.4L4.4 19l1.2-3.2a5.7 5.7 0 0 1-1.8-4c0-3.4 3.7-6.1 8.2-6.1s8.2 2.7 8.2 6.1z"/><path d="M8.7 11.8h6.6"/>',
    subtitle: '<rect x="3.5" y="5" width="17" height="14" rx="3.2"/><path d="M7.4 14.3h3.1M13.5 14.3h3.1M7.4 10.4h2.2M12.4 10.4h4.2"/>',
    image: '<rect x="3.5" y="4.5" width="17" height="15" rx="3.2"/><circle cx="8.7" cy="9.7" r="1.6"/><path d="m4.4 17.6 4.4-4.2 3.1 2.9 3.3-3.2 4.4 4.2"/>',
    info: '<circle cx="12" cy="12" r="8.4"/><path d="M12 11.2v5.1M12 7.9v.2"/>',
    external: '<path d="M14 4.6h5.4V10"/><path d="M19.4 4.6 12 12"/><path d="M17.9 14.4v4a2 2 0 0 1-2 2H5.7a2 2 0 0 1-2-2V8.1a2 2 0 0 1 2-2h4"/>',
    copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2.6"/><path d="M15.5 8.5V6.4a2 2 0 0 0-2-2H6.4a2 2 0 0 0-2 2v7.1a2 2 0 0 0 2 2h2.1"/>',
    trash: '<path d="M4.8 6.8h14.4"/><path d="M9.4 6.8V5.4a1.6 1.6 0 0 1 1.6-1.6h2a1.6 1.6 0 0 1 1.6 1.6v1.4"/><path d="M6.7 6.8 7.6 19a1.8 1.8 0 0 0 1.8 1.6h5.2A1.8 1.8 0 0 0 16.4 19l.9-12.2"/><path d="M10.4 10.4v6.2M13.6 10.4v6.2"/>',
    move: '<path d="M4.4 8.7h11.8M13.1 5.4l3.3 3.3-3.3 3.3"/><path d="M19.6 15.3H7.8M10.9 12l-3.3 3.3 3.3 3.3"/>',
    check: '<path d="m5.2 12.6 4.4 4.4L18.8 7.6"/>',
    alert: '<path d="M12 4.6 20.8 19.4H3.2z"/><path d="M12 10v4.1M12 16.8v.2"/>',
    close: '<path d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5"/>',
    grip: '<circle cx="9.2" cy="6.6" r="1.35" fill="currentColor" stroke="none"/><circle cx="14.8" cy="6.6" r="1.35" fill="currentColor" stroke="none"/><circle cx="9.2" cy="12" r="1.35" fill="currentColor" stroke="none"/><circle cx="14.8" cy="12" r="1.35" fill="currentColor" stroke="none"/><circle cx="9.2" cy="17.4" r="1.35" fill="currentColor" stroke="none"/><circle cx="14.8" cy="17.4" r="1.35" fill="currentColor" stroke="none"/>',
    "chevron-down": '<path d="m6.6 9.6 5.4 5.4 5.4-5.4"/>',
    "chevron-right": '<path d="m9.6 6.6 5.4 5.4-5.4 5.4"/>',
    clock: '<circle cx="12" cy="12" r="8.2"/><path d="M12 7.4V12l3.2 2"/>',
    calendar: '<rect x="3.8" y="5.4" width="16.4" height="14.2" rx="3.2"/><path d="M3.8 9.9h16.4M8.4 3.6v3.5M15.6 3.6v3.5"/>',
    user: '<circle cx="12" cy="8.6" r="3.9"/><path d="M4.9 20c.6-3.6 3.6-6 7.1-6s6.5 2.4 7.1 6"/>',
    tag: '<path d="M11.3 3.9H19a1.2 1.2 0 0 1 1.2 1.2v7.7a1.6 1.6 0 0 1-.5 1.1l-6 6a1.6 1.6 0 0 1-2.2 0l-6.4-6.4a1.6 1.6 0 0 1 0-2.2l6-6a1.6 1.6 0 0 1 1.2-.4z"/><circle cx="15.9" cy="8.1" r="1.4"/>',
    link: '<path d="M10.2 13.8a3.7 3.7 0 0 0 5.2 0l2.6-2.6a3.7 3.7 0 0 0-5.2-5.2l-1 1"/><path d="M13.8 10.2a3.7 3.7 0 0 0-5.2 0L6 12.8a3.7 3.7 0 0 0 5.2 5.2l1-1"/>',
    shield: '<path d="M12 3.4 19.3 6v6c0 4.2-3 7.4-7.3 8.6C7.7 19.4 4.7 16.2 4.7 12V6z"/><path d="m9.3 12 2 2 3.5-3.8"/>',
    pause: '<rect x="7" y="5" width="3.7" height="14" rx="1.4" fill="currentColor" stroke="none"/><rect x="13.3" y="5" width="3.7" height="14" rx="1.4" fill="currentColor" stroke="none"/>',
    stop: '<rect x="6.4" y="6.4" width="11.2" height="11.2" rx="2.8"/>',
    sort: '<path d="M7 5.6v12.8M4 15.4 7 18.4l3-3"/><path d="M17 18.4V5.6M14 8.6l3-3 3 3"/>',
    filter: '<path d="M4.2 6.6h15.6M7 12h10M10 17.4h4"/>',
    "arrow-left": '<path d="M19 12H5.4M11 5.6 4.6 12l6.4 6.4"/>',
    "view-list": '<rect x="3.4" y="4.6" width="6.6" height="6.6" rx="2"/><rect x="3.4" y="12.8" width="6.6" height="6.6" rx="2"/><path d="M13.6 6.1h7M13.6 9.4h7M13.6 14.3h7M13.6 17.6h7"/>',
    sparkle: '<path d="M12 3.6 13.9 9l5.4 1.9-5.4 1.9L12 18.2l-1.9-5.4L4.7 10.9 10.1 9z"/>',
    file: '<path d="M6.2 4.7a1.7 1.7 0 0 1 1.7-1.7h5.3l4.6 4.6v11.7a1.7 1.7 0 0 1-1.7 1.7H7.9a1.7 1.7 0 0 1-1.7-1.7z"/><path d="M13.1 3v5.1h5.1"/>',
    folder: '<path d="M3.6 7.4a2 2 0 0 1 2-2h3l1.6 2h8.2a2 2 0 0 1 2 2v7.2a2 2 0 0 1-2 2H5.6a2 2 0 0 1-2-2z"/>',
    drive: '<rect x="3.6" y="5.4" width="16.8" height="5.6" rx="2"/><rect x="3.6" y="13" width="16.8" height="5.6" rx="2"/><path d="M7.2 8.2v.2M7.2 15.8v.2"/>',
    wand: '<path d="m5 19 9.4-9.4"/><path d="M14.4 9.6 17 12.2"/><path d="M13.6 4.2l1 2.2 2.2 1-2.2 1-1 2.2-1-2.2-2.2-1 2.2-1z"/><path d="M19.4 12.6v.2M4.6 6.4v.2"/>',
    // 4.5.1：主题与语言切换用到
    sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 3.2v2.3M12 18.5v2.3M3.2 12h2.3M18.5 12h2.3M5.8 5.8l1.6 1.6M16.6 16.6l1.6 1.6M18.2 5.8l-1.6 1.6M7.4 16.6l-1.6 1.6"/>',
    moon: '<path d="M20.4 13.8A8.5 8.5 0 0 1 10.2 3.6a8.5 8.5 0 1 0 10.2 10.2z"/>',
    monitor: '<rect x="3.4" y="4.8" width="17.2" height="11.6" rx="2.4"/><path d="M9 20h6M12 16.4V20"/>',
    globe: '<circle cx="12" cy="12" r="8.4"/><path d="M3.6 12h16.8"/><path d="M12 3.6c2.3 2.4 3.5 5.3 3.5 8.4S14.3 18 12 20.4c-2.3-2.4-3.5-5.3-3.5-8.4S9.7 6 12 3.6z"/>'
  };

  function svg(name, options) {
    const settings = options || {};
    const body = PATHS[name] || PATHS.info;
    const size = settings.size || "1em";
    const className = settings.className || "icon";
    return `<svg class="${className}" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
  }

  function hydrate(root) {
    const scope = root && typeof root.querySelectorAll === "function" ? root : document;
    scope.querySelectorAll("[data-icon]").forEach((element) => {
      if (element.dataset.iconReady === "1") return;
      const name = element.getAttribute("data-icon");
      if (!name) return;
      element.innerHTML = svg(name, { size: element.getAttribute("data-icon-size") || "1em" });
      element.dataset.iconReady = "1";
    });
  }

  global.BcaIcons = Object.freeze({ svg, hydrate, names: Object.keys(PATHS) });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => hydrate());
  else hydrate();
})(globalThis);
