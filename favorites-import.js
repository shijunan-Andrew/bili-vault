(() => {
  if (window.__BCA_FAVORITES_IMPORT_LOADED__) return;
  window.__BCA_FAVORITES_IMPORT_LOADED__ = true;
  if (!location.pathname.includes("/favlist")) return;

  // 1.7.14（facet-compat C5）：这两条 runtime.sendMessage 原来是「后台不回来就永远不回来」，
  // B 站页面上的导入面板会一直转圈。加一个超时兜底，到点回一句人话。
  const FAVORITES_MESSAGE_TIMEOUT_MS = 15000;

  function pageUid() {
    return location.pathname.match(/^\/(\d+)\/favlist/)?.[1] || "";
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // 1.8.22（old-p3 security P3-3）：只接受本扩展自己发来的消息。
    if (!sender || sender.id !== chrome.runtime.id) return;
    if (message?.type === "bca-page-api-get") {
      let url;
      try { url = new URL(message.url); }
      catch (_) { sendResponse({ ok: false, message: "接口地址无效。" }); return; }
      if (url.protocol !== "https:" || url.hostname !== "api.bilibili.com") {
        sendResponse({ ok: false, message: "只允许请求 B 站官方接口。" });
        return;
      }
      const controller = new AbortController();
      const timeout = Math.max(1000, Math.min(Number(message.timeoutMs) || 15000, 30000));
      const timer = setTimeout(() => controller.abort(), timeout);
      fetch(url.toString(), { credentials: "include", cache: "no-store", signal: controller.signal })
        .then(async (response) => {
          let payload;
          try { payload = await response.json(); }
          catch (_) { throw new Error(`B站接口没有返回有效数据（HTTP ${response.status}）。`); }
          sendResponse({ ok: true, status: response.status, payload });
        })
        .catch((error) => sendResponse({ ok: false, message: error?.name === "AbortError" ? "B站接口请求超时。" : error?.message || "B站页面请求接口失败。" }))
        .finally(() => clearTimeout(timer));
      return true;
    }
    if (message?.type === "bca-list-import-folders") {
      let answered = false;
      const answer = (payload) => {
        if (answered) return;
        answered = true;
        clearTimeout(timer);
        try { sendResponse(payload); } catch (_) {}
      };
      const timer = setTimeout(() => answer({ ok: false, message: "后台没有回应（超过 15 秒）。请重新加载 B 站页面或重启浏览器再试一次。" }), FAVORITES_MESSAGE_TIMEOUT_MS);
      chrome.runtime.sendMessage({ type: "list-bili-favorite-folders", uid: pageUid() }, (response) => {
        const error = chrome.runtime.lastError;
        answer(error ? { ok: false, message: error.message } : response || { ok: false, message: "读取收藏夹失败。" });
      });
      return true;
    }
    if (message?.type === "bca-import-selected-folders") {
      // recentDays 只在「同步最近收藏」时带上；limit 只在「最多导入 N 条」时带上；都不传就是全量导入
      const payload = { type: "import-bili-favorites", uid: pageUid(), folderIds: message.folderIds };
      if (message.recentDays) payload.recentDays = message.recentDays;
      if (message.limit) payload.limit = message.limit;
      // P1-7：继续上次导入时把断点原样带下去（收藏夹名 + 页号）
      if (message.resume && typeof message.resume === "object") payload.resume = message.resume;
      let answered = false;
      const answer = (payload) => {
        if (answered) return;
        answered = true;
        clearTimeout(timer);
        try { sendResponse(payload); } catch (_) {}
      };
      const timer = setTimeout(() => answer({ ok: false, message: "后台没有回应（超过 15 秒）。请重新加载 B 站页面或重启浏览器再试一次。" }), FAVORITES_MESSAGE_TIMEOUT_MS);
      chrome.runtime.sendMessage(payload, (response) => {
        const error = chrome.runtime.lastError;
        answer(error ? { ok: false, message: error.message } : response || { ok: false, message: "导入失败。" });
      });
      return true;
    }
  });
})();
