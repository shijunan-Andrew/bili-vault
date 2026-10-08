(() => {
  if (window.__BCA_FAVORITES_IMPORT_LOADED__) return;
  window.__BCA_FAVORITES_IMPORT_LOADED__ = true;
  if (!location.pathname.includes("/favlist")) return;

  function pageUid() {
    return location.pathname.match(/^\/(\d+)\/favlist/)?.[1] || "";
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "bca-list-import-folders") {
      chrome.runtime.sendMessage({ type: "list-bili-favorite-folders", uid: pageUid() }, (response) => {
        const error = chrome.runtime.lastError;
        sendResponse(error ? { ok: false, message: error.message } : response || { ok: false, message: "读取收藏夹失败。" });
      });
      return true;
    }
    if (message?.type === "bca-import-selected-folders") {
      chrome.runtime.sendMessage({ type: "import-bili-favorites", uid: pageUid(), folderIds: message.folderIds }, (response) => {
        const error = chrome.runtime.lastError;
        sendResponse(error ? { ok: false, message: error.message } : response || { ok: false, message: "导入失败。" });
      });
      return true;
    }
  });
})();
