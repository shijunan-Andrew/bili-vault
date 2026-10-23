/* ==========================================================================
   client-errors（1.8.23，TODO P2-9）：扩展页的异常也进「001错误报告」
   --------------------------------------------------------------------------
   logError() 一直只活在 background.js 里，所以收藏库、设置页、统计页、弹窗里
   抛出的异常和被拒的 Promise，只剩一条 console.warn —— 用户看不到，事后也没法查。
   这个文件给每个扩展页装两个全局监听，把「哪个页面 + 消息 + 栈」发给后台，
   由后台的 logClientError() 去重（同一条 24 小时只留一份、合并计数）后落盘。

   约定：
   1. 只在扩展页加载，内容脚本不加载（B 站页面自己的报错跟我们无关）。
   2. 页面靠 <html data-bca-page="…"> 认领自己；没标就不装，免得在测试页里
      也去 chrome.runtime.sendMessage。
   3. 上报失败一律吞掉 —— 上报错误本身不能再制造错误。
   4. 同一页 10 秒内同一条错误只发一次，避免循环报错把消息通道打满。
   ========================================================================== */
(function attachClientErrors(global) {
  "use strict";

  const CLIENT_REPORT_INTERVAL_MS = 10000;
  const MESSAGE_LIMIT = 2000;
  const STACK_LIMIT = 4000;
  const DEPTH_LIMIT = 40;
  const recent = new Map();

  function trim(value, limit) {
    return String(value ?? "").slice(0, limit);
  }

  function pageLabel() {
    try {
      return trim(global.document?.documentElement?.dataset?.bcaPage || "", 40);
    } catch (_) {
      return "";
    }
  }

  function report(error, context) {
    try {
      const page = pageLabel() || "unknown";
      const message = trim(error?.message || error || "未知错误", MESSAGE_LIMIT);
      const stack = trim(error?.stack || context || "", STACK_LIMIT);
      const signature = `${page}\n${message}`;
      const now = Date.now();
      if (now - (recent.get(signature) || 0) < CLIENT_REPORT_INTERVAL_MS) return;
      recent.set(signature, now);
      if (recent.size > DEPTH_LIMIT) recent.clear();
      global.chrome?.runtime?.sendMessage?.(
        { type: "bca-client-error", payload: { page, message, stack } },
        () => { void global.chrome?.runtime?.lastError; }
      );
    } catch (_) {
      // 上报失败不打扰用户
    }
  }

  function install() {
    const page = pageLabel();
    if (!page) return;
    try {
      global.addEventListener("error", (event) => {
        const where = event?.filename ? `${event.filename}:${event.lineno || 0}` : "";
        report(event?.error || event?.message || "脚本错误", where);
      });
      global.addEventListener("unhandledrejection", (event) => {
        report(event?.reason || "未处理的 Promise 拒绝", "");
      });
    } catch (_) {}
  }

  install();
  global.BcaClientErrors = Object.freeze({ report });
})(globalThis);
