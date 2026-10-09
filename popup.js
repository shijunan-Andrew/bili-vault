const DB_NAME = "bili-fav-archiver";
const DB_STORE = "settings";

const folderName = document.getElementById("folderName");
const chooseButton = document.getElementById("chooseFolder");
const toggleButton = document.getElementById("toggleEnabled");
const enabledLabel = document.getElementById("enabledLabel");
const enabledHint = document.getElementById("enabledHint");
const brandIcon = document.getElementById("brandIcon");
const reauthorizeButton = document.getElementById("reauthorizeFolder");
const permissionHint = document.getElementById("permissionHint");
const lastResult = document.getElementById("lastResult");
const lastError = document.getElementById("lastError");
const errorText = document.getElementById("errorText");
const reportPath = document.getElementById("reportPath");
const downloadButton = document.getElementById("downloadReport");
const importSelectionView = document.getElementById("importSelectionView");
const importProgressView = document.getElementById("importProgressView");
const importProgressText = document.getElementById("importProgressText");
const importProgressTitle = document.getElementById("importProgressTitle");
const importControl = document.getElementById("importControl");
const importControlHint = document.getElementById("importControlHint");
const pauseImportButton = document.getElementById("pauseImport");
const cancelImportButton = document.getElementById("cancelImport");
const importFolderList = document.getElementById("importFolderList");
const importCard = document.getElementById("importCard");
const importStatus = document.getElementById("importStatus");
const startImportButton = document.getElementById("startImport");
const refreshImportFoldersButton = document.getElementById("refreshImportFolders");
const selectAllImportFoldersButton = document.getElementById("selectAllImportFolders");
const clearImportFoldersButton = document.getElementById("clearImportFolders");
const importSelectedCount = document.getElementById("importSelectedCount");
const importPanelHeading = document.getElementById("importPanelHeading");
const resultDetails = document.getElementById("resultDetails");
const resultDetailsSummary = document.getElementById("resultDetailsSummary");
const resultPath = document.getElementById("resultPath");
const popupVersion = document.getElementById("popupVersion");
let errorReport = "";
let rootHandle = null;
let permissionNotice = "";
let extensionEnabled = true;
let importFolders = [];
let importBusy = false;
// 4.2：导入过程的暂停 / 取消。重开弹窗时会从后台的 importState 恢复。
let importPaused = false;
let cancelArmed = false;
let cancelArmTimer = 0;

function renderImportControl() {
  importControl.hidden = !importBusy;
  importControlHint.hidden = !importBusy || cancelArmed;
  importProgressView.classList.toggle("paused", importPaused);
  importProgressTitle.textContent = importPaused ? "导入已暂停" : "正在导入收藏夹";
  pauseImportButton.textContent = importPaused ? "继续导入" : "暂停导入";
  if (!cancelArmed) {
    cancelImportButton.textContent = "取消导入";
    cancelImportButton.classList.remove("danger");
  }
  pauseImportButton.disabled = false;
  cancelImportButton.disabled = false;
}

function disarmCancel() {
  cancelArmed = false;
  window.clearTimeout(cancelArmTimer);
  cancelImportButton.classList.remove("danger");
  renderImportControl();
}

async function sendImportControl(action) {
  const result = await chrome.runtime.sendMessage({ type: "bca-import-control", action });
  if (!result?.ok) throw new Error(result?.message || "操作失败。");
  return result;
}

function queryCurrentTab() {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) return reject(new Error(runtimeError.message));
      if (!tabs?.[0]?.id) return reject(new Error("无法读取当前标签页。"));
      resolve(tabs[0]);
    });
  });
}

function sendTabMessage(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) return reject(new Error("请先打开并刷新 B 站个人空间的收藏夹页面，再试一次。"));
      resolve(response || { ok: false, message: "页面没有返回结果。" });
    });
  });
}

function renderImportFolders(emptyMessage = "没有找到可导入的收藏夹。") {
  importFolderList.replaceChildren();
  if (!importFolders.length) {
    importFolderList.textContent = emptyMessage;
    startImportButton.disabled = true;
    return;
  }
  for (const folder of importFolders) {
    const label = document.createElement("label");
    label.className = "import-folder-row";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = String(folder.id);
    checkbox.checked = false;
    checkbox.addEventListener("change", updateImportSelection);
    const name = document.createElement("span");
    name.textContent = folder.title || "未命名收藏夹";
    const count = document.createElement("small");
    count.className = "import-folder-count";
    count.textContent = folder.count ? `${folder.count} 个` : "";
    label.append(checkbox, name, count);
    importFolderList.append(label);
  }
  updateImportSelection();
}

function updateImportSelection() {
  importPanelHeading.hidden = importBusy;
  importSelectionView.hidden = importBusy;
  importProgressView.hidden = !importBusy;
  // 导入进行中时把折叠面板强制展开，避免进度被收起后看不到
  if (importBusy && importCard) importCard.open = true;
  importFolderList.querySelectorAll('input[type="checkbox"]').forEach((input) => { input.disabled = importBusy; });
  refreshImportFoldersButton.disabled = importBusy;
  selectAllImportFoldersButton.disabled = importBusy;
  clearImportFoldersButton.disabled = importBusy;
  const selected = importFolderList.querySelectorAll('input[type="checkbox"]:checked').length;
  importSelectedCount.textContent = `已选 ${selected} 个`;
  startImportButton.disabled = importBusy || selected === 0;
  startImportButton.textContent = selected ? `开始导入（${selected} 个收藏夹）` : "开始导入";
  renderImportControl();
}

async function loadImportFolders() {
  importStatus.classList.remove("error");
  importStatus.textContent = "正在读取 B 站收藏夹…";
  refreshImportFoldersButton.disabled = true;
  try {
    const tab = await queryCurrentTab();
    const response = await sendTabMessage(tab.id, { type: "bca-list-import-folders" });
    if (!response?.ok) throw new Error(response?.message || "读取收藏夹失败。");
    importFolders = Array.isArray(response.folders) ? response.folders : [];
    renderImportFolders();
    // 只有在确实读到收藏夹（即当前是 B 站收藏夹页）时才自动展开导入面板
    if (importFolders.length && importCard) importCard.open = true;
    importStatus.textContent = importFolders.length ? `已读取 ${importFolders.length} 个收藏夹。` : "当前账号没有可导入的收藏夹。";
  } catch (error) {
    importFolders = [];
    renderImportFolders(error?.message || "请在 B 站个人空间的收藏夹页面打开插件。");
    importStatus.textContent = error?.message || "读取收藏夹失败。";
    importStatus.classList.add("error");
  } finally {
    refreshImportFoldersButton.disabled = false;
    updateImportSelection();
  }
}

async function startImport() {
  if (importBusy) return;
  const folderIds = [...importFolderList.querySelectorAll('input[type="checkbox"]:checked')].map((input) => input.value);
  if (!folderIds.length) return;
  if (!rootHandle) {
    importStatus.textContent = "请先选择本地保存文件夹。";
    importStatus.classList.add("error");
    return;
  }
  importBusy = true;
  importPaused = false;
  disarmCancel();
  importStatus.textContent = "";
  updateImportSelection();
  importStatus.classList.remove("error");
  importProgressText.textContent = "正在请求本地目录权限…";
  try {
    const permission = await rootHandle.requestPermission({ mode: "readwrite" });
    if (permission !== "granted") throw new Error("未获得本地保存文件夹的写入权限，请重新选择保存文件夹后重试。");
    const tab = await queryCurrentTab();
    const response = await sendTabMessage(tab.id, { type: "bca-import-selected-folders", folderIds });
    if (response?.cancelled) {
      importStatus.classList.add("error");
      importStatus.textContent = response.message || "导入已取消，本次改动已回滚。";
      return;
    }
    if (!response?.ok) throw new Error(response?.message || "导入失败。");
    importStatus.classList.remove("error");
    importStatus.textContent = response.message || `导入/更新完成：新导入 ${response.imported || 0} 个，更新 ${response.refreshed || 0} 个。`;
    if (response.reportPath) importStatus.textContent += ` 错误报告：${response.reportPath}`;
  } catch (error) {
    importStatus.textContent = error?.message || "导入失败。";
    importStatus.classList.add("error");
  } finally {
    importBusy = false;
    importPaused = false;
    updateImportSelection();
  }
}

function renderEnabledState(enabled) {
  extensionEnabled = enabled;
  brandIcon.classList.toggle("disabled", !enabled);
  toggleButton.classList.toggle("off", !enabled);
  toggleButton.setAttribute("aria-pressed", String(enabled));
  toggleButton.setAttribute("aria-label", enabled ? "关闭自动归档" : "开启自动归档");
  enabledLabel.textContent = enabled ? "自动归档已开启" : "自动归档已关闭";
  enabledHint.textContent = enabled
    ? "收藏成功后自动保存视频资料"
    : "新收藏不会自动归档，本地收藏库仍可使用";
}

async function refreshEnabledState() {
  const { enabled } = await chrome.storage.local.get("enabled");
  renderEnabledState(enabled !== false);
}

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
  // 4.2：弹窗可能在导入进行中被关闭又打开，这里按后台状态恢复进度与按钮
  const state = status.importState || {};
  if (state.running) {
    importPaused = Boolean(state.paused);
    importBusy = true;
    updateImportSelection();
    if (state.text) importProgressText.textContent = state.text;
  }
  folderName.textContent = status.baseFolderName || "尚未选择文件夹";
  folderName.classList.toggle("unselected", !status.baseFolderName);
  if (status.lastResult) {
    const messageLines = String(status.lastResult.message || "已完成").split(/\r?\n/).filter(Boolean);
    lastResult.textContent = messageLines.shift() || "已完成";
    const paths = [...String(status.lastResult.path || "").split(/\r?\n/), ...messageLines].filter(Boolean);
    resultPath.textContent = paths.join("\n");
    resultDetailsSummary.textContent = paths.length > 1 ? `查看保存位置（${paths.length} 条）` : "查看保存位置";
    resultDetails.hidden = paths.length === 0;
  } else {
    lastResult.textContent = "暂无保存记录";
    resultDetails.hidden = true;
    resultPath.textContent = "";
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

toggleButton.addEventListener("click", async () => {
  toggleButton.disabled = true;
  const nextEnabled = !extensionEnabled;
  renderEnabledState(nextEnabled);
  try {
    await chrome.storage.local.set({ enabled: nextEnabled });
  } catch (error) {
    renderEnabledState(!nextEnabled);
    lastResult.textContent = error?.message || "无法更新插件状态。";
  } finally {
    toggleButton.disabled = false;
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

refreshImportFoldersButton.addEventListener("click", loadImportFolders);
startImportButton.addEventListener("click", startImport);
pauseImportButton.addEventListener("click", async () => {
  pauseImportButton.disabled = true;
  try {
    const result = await sendImportControl(importPaused ? "resume" : "pause");
    importPaused = Boolean(result.paused);
    renderImportControl();
  } catch (error) {
    importStatus.textContent = error?.message || "操作失败。";
    importStatus.classList.add("error");
    pauseImportButton.disabled = false;
  }
});
cancelImportButton.addEventListener("click", async () => {
  if (!cancelArmed) {
    cancelArmed = true;
    cancelImportButton.textContent = "确认取消并回滚";
    cancelImportButton.classList.add("danger");
    importControlHint.hidden = true;
    window.clearTimeout(cancelArmTimer);
    cancelArmTimer = window.setTimeout(disarmCancel, 5000);
    return;
  }
  window.clearTimeout(cancelArmTimer);
  cancelImportButton.disabled = true;
  pauseImportButton.disabled = true;
  cancelImportButton.textContent = "正在取消…";
  importProgressText.textContent = "正在删除本次新建的目录并还原被更新的记录…";
  try {
    await sendImportControl("cancel");
  } catch (error) {
    importStatus.textContent = error?.message || "取消失败。";
    importStatus.classList.add("error");
    disarmCancel();
  }
});
selectAllImportFoldersButton.addEventListener("click", () => {
  importFolderList.querySelectorAll('input[type="checkbox"]').forEach((input) => { input.checked = true; });
  updateImportSelection();
});
clearImportFoldersButton.addEventListener("click", () => {
  importFolderList.querySelectorAll('input[type="checkbox"]').forEach((input) => { input.checked = false; });
  updateImportSelection();
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== "bca-import-progress") return;
  importProgressText.textContent = message.text || "正在导入…";
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes.enabled) renderEnabledState(changes.enabled.newValue !== false);
  if (areaName === "local" && changes.importState) {
    const state = changes.importState.newValue || {};
    importPaused = Boolean(state.paused);
    if (state.running) {
      importBusy = true;
      updateImportSelection();
      if (state.text) importProgressText.textContent = state.text;
    } else if (importBusy) {
      // 导入结束（完成或取消）：回到收藏夹选择视图，并把结果显示出来
      importBusy = false;
      disarmCancel();
      updateImportSelection();
      importStatus.classList.remove("error");
      importStatus.textContent = state.summary || "导入已结束。";
      if (state.summary?.includes("取消")) importStatus.classList.add("error");
    }
  }
  refreshStatus().catch(() => {});
});
refreshEnabledState().catch(() => renderEnabledState(true));
loadImportFolders();
refreshStatus().catch((error) => {
  lastResult.textContent = error?.message || "无法读取插件状态。";
});
if (popupVersion) popupVersion.textContent = `版本 ${chrome.runtime.getManifest().version}`;
