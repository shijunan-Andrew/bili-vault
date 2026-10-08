const DB_NAME = "bili-fav-archiver";
const DB_STORE = "settings";

const folderName = document.getElementById("folderName");
const chooseButton = document.getElementById("chooseFolder");
const reauthorizeButton = document.getElementById("reauthorizeFolder");
const permissionHint = document.getElementById("permissionHint");
const lastResult = document.getElementById("lastResult");
const lastError = document.getElementById("lastError");
const errorText = document.getElementById("errorText");
const reportPath = document.getElementById("reportPath");
const downloadButton = document.getElementById("downloadReport");
let errorReport = "";
let rootHandle = null;
let permissionNotice = "";

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(DB_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("无法保存目录设置。"));
  });
}

async function saveRootHandle(handle) {
  const db = await openDb();
  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(DB_STORE, "readwrite");
      transaction.objectStore(DB_STORE).put(handle, "rootHandle");
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error("保存目录授权失败。"));
    });
  } finally {
    db.close();
  }
}

async function loadRootHandle() {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(DB_STORE, "readonly").objectStore(DB_STORE).get("rootHandle");
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error("无法读取已选保存目录。"));
    });
  } finally {
    db.close();
  }
}

async function refreshStatus() {
  const status = await chrome.runtime.sendMessage({ type: "get-status" });
  rootHandle = await loadRootHandle().catch(() => null);
  folderName.textContent = status.baseFolderName || "尚未选择文件夹";
  if (status.lastResult) {
    lastResult.textContent = `${status.lastResult.message || "已完成"}\n${status.lastResult.path || ""}`;
  } else {
    lastResult.textContent = "暂无保存记录";
  }
  if (status.lastError?.report) {
    errorReport = status.lastError.report;
    errorText.textContent = errorReport;
    reportPath.textContent = status.lastError.reportPath ? `本地报告：${status.lastError.reportPath}` : "报告暂存在插件中，可下载到本地。";
    lastError.hidden = false;
  } else {
    lastError.hidden = true;
    errorReport = "";
  }
  const authorizationExpired = Boolean(status.lastError?.report?.includes("写入授权已失效"));
  const alreadyReauthorized = status.authorizedErrorAt === status.lastError?.createdAt;
  const canRecover = authorizationExpired && rootHandle && !alreadyReauthorized;
  reauthorizeButton.hidden = !canRecover;
  permissionHint.hidden = !canRecover;
  if (canRecover) {
    reauthorizeButton.textContent = status.pendingFavorite ? "重新授权并补存刚才的视频" : "重新授权保存位置";
    permissionHint.textContent = permissionNotice || (status.pendingFavorite
      ? "点击后按 Chrome 提示允许访问，插件会接着保存这条视频。"
      : "点击后按 Chrome 提示允许访问；然后需要重新收藏刚才的视频。");
  }
}

chooseButton.addEventListener("click", async () => {
  chooseButton.disabled = true;
  chooseButton.textContent = "正在选择…";
  try {
    if (!window.showDirectoryPicker) throw new Error("当前 Chrome 不支持选择本地文件夹，请更新 Chrome 后重试。");
    const handle = await window.showDirectoryPicker({ mode: "readwrite" });
    const permission = await handle.requestPermission({ mode: "readwrite" });
    if (permission !== "granted") throw new Error("没有获得此文件夹的写入权限。");
    await saveRootHandle(handle);
    rootHandle = handle;
    const currentStatus = await chrome.runtime.sendMessage({ type: "get-status" });
    await chrome.storage.local.set({ baseFolderName: handle.name, authorizedErrorAt: currentStatus.lastError?.createdAt || null });
    folderName.textContent = handle.name;
    await refreshStatus();
  } catch (error) {
    if (error?.name !== "AbortError") {
      folderName.textContent = error?.message || "选择文件夹失败。";
    }
  } finally {
    chooseButton.disabled = false;
    chooseButton.textContent = "选择保存文件夹";
  }
});

reauthorizeButton.addEventListener("click", async () => {
  if (!rootHandle) return;
  reauthorizeButton.disabled = true;
  reauthorizeButton.textContent = "正在请求授权…";
  try {
    // Invoke permission prompting directly from the click handler.
    const permissionRequest = rootHandle.requestPermission({ mode: "readwrite" });
    const permission = await permissionRequest;
    if (permission !== "granted") throw new Error("没有获得保存目录的写入权限。请允许访问，或重新选择保存文件夹。");
    permissionNotice = "";

    const status = await chrome.runtime.sendMessage({ type: "get-status" });
    if (status.pendingFavorite) {
      reauthorizeButton.textContent = "正在补存视频…";
      const result = await chrome.runtime.sendMessage({ type: "retry-pending-favorite" });
      if (!result?.ok) throw new Error(result?.message || "授权已恢复，但视频补存失败。请查看最近错误信息。");
    } else {
      await chrome.storage.local.set({
        lastResult: { message: "保存目录授权已恢复，请重新收藏刚才的视频。", createdAt: Date.now() },
        authorizedErrorAt: status.lastError?.createdAt || null
      });
    }
    await refreshStatus();
  } catch (error) {
    if (error?.name !== "AbortError") {
      lastResult.textContent = error?.message || "重新授权失败。";
      permissionNotice = error?.message || "重新授权失败。";
      permissionHint.hidden = false;
      permissionHint.textContent = permissionNotice;
    }
  } finally {
    reauthorizeButton.disabled = false;
    await refreshStatus().catch(() => {});
  }
});

downloadButton.addEventListener("click", () => {
  if (!errorReport) return;
  const blob = new Blob([errorReport], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `B站收藏归档错误报告_${new Date().toISOString().replace(/[:.]/g, "-")}.txt`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
});

chrome.storage.onChanged.addListener(() => refreshStatus().catch(() => {}));
refreshStatus().catch((error) => {
  lastResult.textContent = error?.message || "无法读取插件状态。";
});
