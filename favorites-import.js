(() => {
  if (window.__BCA_FAVORITES_IMPORT_LOADED__) return;
  window.__BCA_FAVORITES_IMPORT_LOADED__ = true;
  if (!location.pathname.includes("/favlist")) return;

  function pageUid() {
    return location.pathname.match(/^\/(\d+)\/favlist/)?.[1] || "";
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
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
      chrome.runtime.sendMessage({ type: "list-bili-favorite-folders", uid: pageUid() }, (response) => {
        const error = chrome.runtime.lastError;
        sendResponse(error ? { ok: false, message: error.message } : response || { ok: false, message: "读取收藏夹失败。" });
      });
      return true;
    }
    if (message?.type === "bca-import-selected-folders") {
      // recentDays 只在「开始更新」时带上；不传就是全量导入
      const payload = { type: "import-bili-favorites", uid: pageUid(), folderIds: message.folderIds };
      if (message.recentDays) payload.recentDays = message.recentDays;
      chrome.runtime.sendMessage(payload, (response) => {
        const error = chrome.runtime.lastError;
        sendResponse(error ? { ok: false, message: error.message } : response || { ok: false, message: "导入失败。" });
      });
      return true;
    }
  });
})();
