const DB_NAME = "bili-fav-archiver";
// 4.9.4：默认下载目录名（与下载页、归档布局保持一致）
const DOWNLOAD_FOLDER_NAME = "000视频下载";
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
const recoverInvalidCheckbox = document.getElementById("recoverInvalid");
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
// 4.5.1：主题 / 语言改成分段控件，按钮直接写在 popup.html 里
const themeButtons = [...document.querySelectorAll(".segmented button[data-theme-value]")];
const localeButtons = [...document.querySelectorAll(".segmented button[data-locale]")];
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


/* ---------------- 4.7：版本号渠道前缀 ---------------- */

// 测试版显示 beta4.7、正式版显示 V1.0.0。
// library.js 里有一份同样的实现，改动时两边必须同步（测试会比对两份输出）。
const RELEASE_CHANNEL = "release";

function displayVersion(raw) {
  const version = String(raw || "");
  if (!version) return "";
  if (RELEASE_CHANNEL === "beta") return `beta${version.replace(/\.0$/, "")}`;
  return `V${version}`;
}

function renderImportControl() {
  importControl.hidden = !importBusy;
  importControlHint.hidden = !importBusy || cancelArmed;
  importProgressView.classList.toggle("paused", importPaused);
  importProgressTitle.textContent = importPaused ? BcaI18n.t("导入已暂停") : BcaI18n.t("正在导入收藏夹");
  pauseImportButton.textContent = importPaused ? BcaI18n.t("继续导入") : BcaI18n.t("暂停导入");
  if (!cancelArmed) {
    cancelImportButton.textContent = BcaI18n.t("取消导入");
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
  // result.message 来自后台，显示时才翻译（查不到就原样显示中文）
  if (!result?.ok) throw new Error(result?.message ? BcaI18n.t(result.message) : BcaI18n.t("操作失败。"));
  return result;
}

// 4.4.1：失效视频恢复改为默认开启。只有用户明确关掉（存成 false）才不勾选。
async function restoreRecoverInvalid() {
  try {
    const saved = await chrome.storage.local.get("recoverInvalidVideos");
    recoverInvalidCheckbox.checked = saved?.recoverInvalidVideos !== false;
  } catch (_) {
    recoverInvalidCheckbox.checked = true;
  }
}

recoverInvalidCheckbox.addEventListener("change", () => {
  chrome.storage.local.set({ recoverInvalidVideos: recoverInvalidCheckbox.checked }).catch(() => {});
});

function queryCurrentTab() {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) return reject(new Error(runtimeError.message));
      if (!tabs?.[0]?.id) return reject(new Error(BcaI18n.t("无法读取当前标签页。")));
      resolve(tabs[0]);
    });
  });
}

function sendTabMessage(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) return reject(new Error(BcaI18n.t("请先打开并刷新 B 站个人空间的收藏夹页面，再试一次。")));
      resolve(response || { ok: false, message: BcaI18n.t("页面没有返回结果。") });
    });
  });
}

function renderImportFolders(emptyMessage) {
  importFolderList.replaceChildren();
  if (!importFolders.length) {
    // 传进来的可能是 background / Chrome 的运行时文案，原样显示；本地兜底才过 t()
    importFolderList.textContent = emptyMessage || BcaI18n.t("没有找到可导入的收藏夹。");
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
    name.textContent = folder.title || BcaI18n.t("未命名收藏夹");
    const count = document.createElement("small");
    count.className = "import-folder-count";
    count.textContent = folder.count ? BcaI18n.t("{count} 个", { count: folder.count }) : "";
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
  if (recoverInvalidCheckbox) recoverInvalidCheckbox.disabled = importBusy;
  refreshImportFoldersButton.disabled = importBusy;
  selectAllImportFoldersButton.disabled = importBusy;
  clearImportFoldersButton.disabled = importBusy;
  const selected = importFolderList.querySelectorAll('input[type="checkbox"]:checked').length;
  importSelectedCount.textContent = BcaI18n.t("已选 {count} 个", { count: selected });
  startImportButton.disabled = importBusy || selected === 0;
  startImportButton.textContent = selected ? BcaI18n.t("开始导入（{count} 个收藏夹）", { count: selected }) : BcaI18n.t("开始导入");
  renderImportControl();
}

async function loadImportFolders() {
  importStatus.classList.remove("error");
  importStatus.textContent = BcaI18n.t("正在读取 B 站收藏夹…");
  refreshImportFoldersButton.disabled = true;
  try {
    const tab = await queryCurrentTab();
    const response = await sendTabMessage(tab.id, { type: "bca-list-import-folders" });
    if (!response?.ok) throw new Error(response?.message ? BcaI18n.t(response.message) : BcaI18n.t("读取收藏夹失败。"));
    importFolders = Array.isArray(response.folders) ? response.folders : [];
    renderImportFolders();
    // 只有在确实读到收藏夹（即当前是 B 站收藏夹页）时才自动展开导入面板
    if (importFolders.length && importCard) importCard.open = true;
    importStatus.textContent = importFolders.length ? BcaI18n.t("已读取 {count} 个收藏夹。", { count: importFolders.length }) : BcaI18n.t("当前账号没有可导入的收藏夹。");
  } catch (error) {
    importFolders = [];
    renderImportFolders(error?.message || BcaI18n.t("请在 B 站个人空间的收藏夹页面打开插件。"));
    importStatus.textContent = error?.message ? BcaI18n.t(error.message) : BcaI18n.t("读取收藏夹失败。");
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
    importStatus.textContent = BcaI18n.t("请先选择本地保存文件夹。");
    importStatus.classList.add("error");
    return;
  }
  importBusy = true;
  importPaused = false;
  disarmCancel();
  importStatus.textContent = "";
  updateImportSelection();
  importStatus.classList.remove("error");
  importProgressText.textContent = BcaI18n.t("正在请求本地目录权限…");
  try {
    const permission = await rootHandle.requestPermission({ mode: "readwrite" });
    if (permission !== "granted") throw new Error(BcaI18n.t("未获得本地保存文件夹的写入权限，请重新选择保存文件夹后重试。"));
    const tab = await queryCurrentTab();
    const response = await sendTabMessage(tab.id, { type: "bca-import-selected-folders", folderIds });
    if (response?.cancelled) {
      importStatus.classList.add("error");
      importStatus.textContent = response.message ? BcaI18n.t(response.message) : BcaI18n.t("导入已取消，本次改动已回滚。");
      return;
    }
    if (!response?.ok) throw new Error(response?.message ? BcaI18n.t(response.message) : BcaI18n.t("导入失败。"));
    importStatus.classList.remove("error");
    importStatus.textContent = response.message ? BcaI18n.t(response.message) : BcaI18n.t("导入/更新完成：新导入 {imported} 个，更新 {refreshed} 个。", { imported: response.imported || 0, refreshed: response.refreshed || 0 });
    if (response.reportPath) importStatus.textContent += ` ${BcaI18n.t("错误报告：{path}", { path: response.reportPath })}`;
  } catch (error) {
    importStatus.textContent = error?.message ? BcaI18n.t(error.message) : BcaI18n.t("导入失败。");
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
  toggleButton.setAttribute("aria-label", enabled ? BcaI18n.t("关闭自动归档") : BcaI18n.t("开启自动归档"));
  enabledLabel.textContent = enabled ? BcaI18n.t("自动归档已开启") : BcaI18n.t("自动归档已关闭");
  enabledHint.textContent = enabled
    ? BcaI18n.t("收藏成功后自动保存视频资料")
    : BcaI18n.t("新收藏不会自动归档，本地收藏库仍可使用");
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
    request.onerror = () => reject(request.error || new Error(BcaI18n.t("无法保存目录设置。")));
  });
}

async function saveRootHandle(handle) {
  const db = await openDb();
  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(DB_STORE, "readwrite");
      transaction.objectStore(DB_STORE).put(handle, "rootHandle");
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error(BcaI18n.t("保存目录授权失败。")));
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
      request.onerror = () => reject(request.error || new Error(BcaI18n.t("无法读取已选保存目录。")));
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
    // importState.text 由 background 写，不是 .message 透传口，按原文显示
    if (state.text) importProgressText.textContent = state.text;
  }
  folderName.textContent = status.baseFolderName || BcaI18n.t("尚未选择文件夹");
  folderName.classList.toggle("unselected", !status.baseFolderName);
  if (status.lastResult) {
    // status.lastResult.message 来自 background：首行当摘要，其余行当路径
    const messageLines = String(status.lastResult.message || "").split(/\r?\n/).filter(Boolean);
    const firstLine = messageLines.shift();
    lastResult.textContent = firstLine || BcaI18n.t("已完成");
    const paths = [...String(status.lastResult.path || "").split(/\r?\n/), ...messageLines].filter(Boolean);
    resultPath.textContent = paths.join("\n");
    resultDetailsSummary.textContent = paths.length > 1 ? BcaI18n.t("查看保存位置（{count} 条）", { count: paths.length }) : BcaI18n.t("查看保存位置");
    resultDetails.hidden = paths.length === 0;
  } else {
    lastResult.textContent = BcaI18n.t("暂无保存记录");
    resultDetails.hidden = true;
    resultPath.textContent = "";
  }
  if (status.lastError?.report) {
    errorReport = status.lastError.report;
    errorText.textContent = errorReport;
    reportPath.textContent = status.lastError.reportPath
      ? BcaI18n.t("本地报告：{path}", { path: status.lastError.reportPath })
      : BcaI18n.t("报告暂存在插件中，可下载到本地。");
    lastError.hidden = false;
  } else {
    lastError.hidden = true;
    errorReport = "";
  }
  // 注意：这两个 includes 匹配的是 background 写的中文原文，不能翻译
  const authorizationExpired = Boolean(status.lastError?.report?.includes("写入授权已失效"));
  const alreadyReauthorized = status.authorizedErrorAt === status.lastError?.createdAt;
  const canRecover = authorizationExpired && rootHandle && !alreadyReauthorized;
  reauthorizeButton.hidden = !canRecover;
  permissionHint.hidden = !canRecover;
  if (canRecover) {
    reauthorizeButton.textContent = status.pendingFavorite ? BcaI18n.t("重新授权并补存刚才的视频") : BcaI18n.t("重新授权保存位置");
    // permissionNotice 里已经是可直接显示的文案
    permissionHint.textContent = permissionNotice || (status.pendingFavorite
      ? BcaI18n.t("点击后按 Chrome 提示允许访问，插件会接着保存这条视频。")
      : BcaI18n.t("点击后按 Chrome 提示允许访问；然后需要重新收藏刚才的视频。"));
  }
}

chooseButton.addEventListener("click", async () => {
  chooseButton.disabled = true;
  chooseButton.textContent = BcaI18n.t("正在选择…");
  try {
    if (!window.showDirectoryPicker) throw new Error(BcaI18n.t("当前 Chrome 不支持选择本地文件夹，请更新 Chrome 后重试。"));
    const handle = await window.showDirectoryPicker({ mode: "readwrite" });
    const permission = await handle.requestPermission({ mode: "readwrite" });
    if (permission !== "granted") throw new Error(BcaI18n.t("没有获得此文件夹的写入权限。"));
    await saveRootHandle(handle);
    rootHandle = handle;
    // 4.9.4：顺手把默认下载目录建出来。「标记为已下载」需要它，而从没下载过的用户
    // 根本没有这个文件夹，会卡在一句指错方向的「还没有下载目录」上。
    // 这里一定是 readwrite 权限（上面刚 requestPermission 过），失败也不影响主流程。
    try { await handle.getDirectoryHandle(DOWNLOAD_FOLDER_NAME, { create: true }); } catch (_) {}
    const currentStatus = await chrome.runtime.sendMessage({ type: "get-status" });
    await chrome.storage.local.set({ baseFolderName: handle.name, authorizedErrorAt: currentStatus.lastError?.createdAt || null });
    folderName.textContent = handle.name;
    await refreshStatus();
  } catch (error) {
    if (error?.name !== "AbortError") {
      folderName.textContent = error?.message ? BcaI18n.t(error.message) : BcaI18n.t("选择文件夹失败。");
    }
  } finally {
    chooseButton.disabled = false;
    chooseButton.textContent = BcaI18n.t("选择保存文件夹");
  }
});

reauthorizeButton.addEventListener("click", async () => {
  if (!rootHandle) return;
  reauthorizeButton.disabled = true;
  reauthorizeButton.textContent = BcaI18n.t("正在请求授权…");
  try {
    // Invoke permission prompting directly from the click handler.
    const permissionRequest = rootHandle.requestPermission({ mode: "readwrite" });
    const permission = await permissionRequest;
    if (permission !== "granted") throw new Error(BcaI18n.t("没有获得保存目录的写入权限。请允许访问，或重新选择保存文件夹。"));
    permissionNotice = "";

    const status = await chrome.runtime.sendMessage({ type: "get-status" });
    if (status.pendingFavorite) {
      reauthorizeButton.textContent = BcaI18n.t("正在补存视频…");
      const result = await chrome.runtime.sendMessage({ type: "retry-pending-favorite" });
      if (!result?.ok) throw new Error(result?.message ? BcaI18n.t(result.message) : BcaI18n.t("授权已恢复，但视频补存失败。请查看最近错误信息。"));
    } else {
      await chrome.storage.local.set({
        lastResult: { message: BcaI18n.t("保存目录授权已恢复，请重新收藏刚才的视频。"), createdAt: Date.now() },
        authorizedErrorAt: status.lastError?.createdAt || null
      });
    }
    await refreshStatus();
  } catch (error) {
    if (error?.name !== "AbortError") {
      // 存的就是可直接显示的文案（本地兜底已经过 t()）
      permissionNotice = error?.message || BcaI18n.t("重新授权失败。");
      lastResult.textContent = permissionNotice;
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
    lastResult.textContent = error?.message ? BcaI18n.t(error.message) : BcaI18n.t("无法更新插件状态。");
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
    importStatus.textContent = error?.message ? BcaI18n.t(error.message) : BcaI18n.t("操作失败。");
    importStatus.classList.add("error");
    pauseImportButton.disabled = false;
  }
});
cancelImportButton.addEventListener("click", async () => {
  if (!cancelArmed) {
    cancelArmed = true;
    cancelImportButton.textContent = BcaI18n.t("确认取消并回滚");
    cancelImportButton.classList.add("danger");
    importControlHint.hidden = true;
    window.clearTimeout(cancelArmTimer);
    cancelArmTimer = window.setTimeout(disarmCancel, 5000);
    return;
  }
  window.clearTimeout(cancelArmTimer);
  cancelImportButton.disabled = true;
  pauseImportButton.disabled = true;
  cancelImportButton.textContent = BcaI18n.t("正在取消…");
  importProgressText.textContent = BcaI18n.t("正在删除本次新建的目录并还原被更新的记录…");
  try {
    await sendImportControl("cancel");
  } catch (error) {
    importStatus.textContent = error?.message ? BcaI18n.t(error.message) : BcaI18n.t("取消失败。");
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
  importProgressText.textContent = message.text ? BcaI18n.t(message.text) : BcaI18n.t("正在导入…");
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes.enabled) renderEnabledState(changes.enabled.newValue !== false);
  if (areaName === "local" && changes.importState) {
    const state = changes.importState.newValue || {};
    importPaused = Boolean(state.paused);
    if (state.running) {
      importBusy = true;
      updateImportSelection();
      // importState.text / summary 由 background 写，按原文显示
      if (state.text) importProgressText.textContent = state.text;
    } else if (importBusy) {
      // 导入结束（完成或取消）：回到收藏夹选择视图，并把结果显示出来
      importBusy = false;
      disarmCancel();
      updateImportSelection();
      importStatus.classList.remove("error");
      importStatus.textContent = state.summary || BcaI18n.t("导入已结束。");
      if (state.summary?.includes("取消")) importStatus.classList.add("error");
    }
  }
  refreshStatus().catch(() => {});
});

/* ---------------- 4.5：主题与语言切换 ---------------- */

// 主题名走 data-i18n（由 BcaI18n.apply 翻译），语言名是各语言的自称、不翻译。
// 这里只切选中态，绝不写 textContent：写死文字会把切语言后的译文盖回中文。
function renderThemeOptions() {
  for (const button of themeButtons) {
    button.setAttribute("aria-pressed", String(button.dataset.themeValue === BcaTheme.current()));
  }
}

function renderLocaleOptions() {
  for (const button of localeButtons) {
    button.setAttribute("aria-pressed", String(button.dataset.locale === BcaI18n.locale()));
  }
}

// 切换语言：静态节点由 BcaI18n.use() 自己 apply，动态内容在这里重画
async function applyLocale(locale) {
  const checkedIds = new Set([...importFolderList.querySelectorAll('input[type="checkbox"]:checked')].map((input) => input.value));
  await BcaI18n.use(locale);
  renderLocaleOptions();
  renderEnabledState(extensionEnabled);
  renderImportControl();
  if (!importBusy && importFolders.length) {
    // 重画列表会重建复选框，先记下勾选状态再还原
    renderImportFolders();
    importFolderList.querySelectorAll('input[type="checkbox"]').forEach((input) => { input.checked = checkedIds.has(input.value); });
  }
  updateImportSelection();
  await refreshStatus().catch(() => {});
}

async function boot() {
  // 第一次渲染之前初始化，避免先闪一下中文
  await BcaI18n.init();
  // 主题已经在 head 里由 theme.js 定好；这里先让控件反映现状，再绑定切换
  renderThemeOptions();
  BcaTheme.onChange(renderThemeOptions);
  for (const button of themeButtons) {
    button.addEventListener("click", () => BcaTheme.use(button.dataset.themeValue));
  }
  renderLocaleOptions();
  for (const button of localeButtons) {
    button.addEventListener("click", () => { applyLocale(button.dataset.locale).catch(() => {}); });
  }
  refreshEnabledState().catch(() => renderEnabledState(true));
  restoreRecoverInvalid().catch(() => {});
  loadImportFolders();
  refreshStatus().catch((error) => {
    lastResult.textContent = error?.message ? BcaI18n.t(error.message) : BcaI18n.t("无法读取插件状态。");
  });
  /* ---------------- 4.8：顶部开源横幅 ---------------- */

// 与 library.js 的 PROJECT_REPO_URL 保持一致
const PROJECT_REPO_URL = "https://github.com/shijunan-Andrew/bili-vault";
const GITHUB_BANNER_KEY = "popupGithubBannerDismissed";

async function restoreGithubBanner() {
  const banner = document.getElementById("githubBanner");
  if (!banner) return;
  let dismissed = false;
  try {
    const saved = await chrome.storage.local.get(GITHUB_BANNER_KEY);
    dismissed = saved?.[GITHUB_BANNER_KEY] === true;
  } catch (_) {}
  if (dismissed) return;
  const link = document.getElementById("githubBannerLink");
  if (link) link.href = PROJECT_REPO_URL;
  banner.hidden = false;
}

function dismissGithubBanner() {
  const banner = document.getElementById("githubBanner");
  if (banner) banner.hidden = true;
  chrome.storage.local.set({ [GITHUB_BANNER_KEY]: true }).catch(() => {});
}

if (popupVersion) popupVersion.textContent = BcaI18n.t("版本 {version}", { version: displayVersion(chrome.runtime.getManifest().version) });
  // 4.8：顶部开源横幅（关闭状态记在 chrome.storage，下次不再出现）
  restoreGithubBanner();
  document.getElementById("dismissGithubBanner")?.addEventListener("click", dismissGithubBanner);
}

boot().catch(() => {});
