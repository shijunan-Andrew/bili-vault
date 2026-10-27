/* ==========================================================================
   dock.js —— 右下角浮标（1.17.2）
   设置页 / 数据统计页 / 回收站页三个页面共用：上面一个「回到顶部」，
   下面一个「回到收藏库」（圆形，中间是插件自己的 logo）。
   收藏库那一页不引这个文件 —— 它右下角是「设置齿轮 + 回到顶部」，
   而且那边的显隐逻辑跟页面渲染绑在一起，写在 library.js 里。

   约定：
   - 只碰 DOM 与 window，不读不写任何存储，不发起网络请求；
   - 「回到顶部」只在滚下去以后出现：停在顶部时按它什么都不会发生，露着反而像坏了；
   - 尊重「减少动态效果」：系统开了 reduced-motion 就直接跳，不做平滑滚动。
   ========================================================================== */
(function attachDock(global) {
  "use strict";

  // 和 library.js 的 SCROLL_TOP_REVEAL_AT 取同一个阈值：同一类按钮，露出的时机该一致。
  const SCROLL_TOP_REVEAL_AT = 240;

  function prefersReducedMotion() {
    try {
      return global.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
    } catch (error) {
      console.warn("判断「减少动态效果」失败（按不做动效处理）", error);
      return true;
    }
  }

  function scrollTopNow() {
    return global.scrollY || global.document.documentElement?.scrollTop || 0;
  }

  function init() {
    const fab = global.document.getElementById("scrollTopFab");
    if (!fab) return;

    const sync = () => {
      const nearTop = scrollTopNow() < SCROLL_TOP_REVEAL_AT;
      fab.classList.toggle("is-hidden", nearTop);
      fab.tabIndex = nearTop ? -1 : 0;
    };

    fab.addEventListener("click", () => {
      global.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
    });

    global.addEventListener("scroll", sync, { passive: true });
    sync();
  }

  if (global.document.readyState === "loading") {
    global.document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  global.BcaDock = { init, SCROLL_TOP_REVEAL_AT };
})(globalThis);
