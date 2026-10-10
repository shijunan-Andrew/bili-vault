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
const lastResultBrief = document.getElementById("lastResultBrief");
const importConfirm = document.getElementById("importConfirm");
const importConfirmDetail = document.getElementById("importConfirmDetail");
const updateRecentButton = document.getElementById("updateRecent");
const updateRecentDialog = document.getElementById("updateRecentDialog");
const updateRecentDetail = document.getElementById("updateRecentDetail");
const speedGroup = document.getElementById("speedGroup");
const speedHint = document.getElementById("speedHint");
const speedWarnDialog = document.getElementById("speedWarnDialog");
const riskyWarnDialog = document.getElementById("riskyWarnDialog");
const riskyWarnText = document.getElementById("riskyWarnText");
const doneDialog = document.getElementById("doneDialog");
const doneDialogText = document.getElementById("doneDialogText");
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
const diffFoldersButton = document.getElementById("diffFolders");
const diffResult = document.getElementById("diffResult");
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

/* 当前在跑哪种操作。进度区的标题和按钮都按它来 ——
   「差异对比」没有暂停/取消（它是只读的短任务），
   以前会把导入那套按钮照搬过来，点了也没用。 */
let activeOperation = "import";

// 必须写成一串字面量调用：项目约定 t() 的键必须是字面量，
// 用 OPERATION_TITLES[x] 这种取值提取器扫不到，翻译会静默缺失（这个坑踩过两次了）。
function operationTitle(operation, paused) {
  if (paused) {
    if (operation === "update") return BcaI18n.t("更新已暂停");
    return BcaI18n.t("导入已暂停");
  }
  if (operation === "diff") return BcaI18n.t("正在对比差异");
  if (operation === "update") return BcaI18n.t("正在更新收藏夹");
  return BcaI18n.t("正在导入收藏夹");
}

function renderImportControl() {
  const isDiff = activeOperation === "diff";
  // 对比是只读的短任务，没有暂停/取消的概念 —— 按钮整个不显示
  importControl.hidden = !importBusy || isDiff;
  importControlHint.hidden = !importBusy || isDiff || cancelArmed;
  importProgressView.classList.toggle("paused", importPaused && !isDiff);
  importProgressTitle.textContent = operationTitle(activeOperation, importPaused && !isDiff);
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
  diffFoldersButton.disabled = importBusy || selected === 0;
  updateRecentButton.disabled = importBusy || selected === 0;
  diffFoldersButton.textContent = selected ? BcaI18n.t("先看差异（{count} 个）", { count: selected }) : BcaI18n.t("先看差异");
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

/* V1.1.0：先看差异。
   只对比收藏夹列表（40 条/请求），不抓详情（1.25 条/秒）—— 这是它能"1~2 分钟出结果"的唯一原因。
   完整列表（可能几百条）写进 归档根目录/002同步报告/，弹窗里只显示摘要。 */
/* 请求速度。
   与 background.js 的 REQUEST_SPEEDS 一一对应 —— 那边决定实际节奏，这边只负责让用户选。
   切到「较高」或「高」必须先弹提醒：使用须知第一条就是请求过密会触发风控。 */
const REQUEST_SPEED_ORDER = ["lower", "standard", "higher", "high"];
const REQUEST_SPEED_RISKY = new Set(["higher", "high"]);
// 必须用字面量调用 BcaI18n.t("…")：项目约定键必须是字面量，
// 否则 i18n-extract 扫不到、翻译会静默缺失（这里第一版就踩了一次）。
function speedHintFor(value) {
  if (value === "lower") return BcaI18n.t("分批读取：每读 8 次停 6 秒，最接近人翻页的节奏。大收藏夹建议用这个。");
  if (value === "standard") return BcaI18n.t("默认。每次请求间隔 0.8 秒，与详情抓取同一节奏。");
  if (value === "higher") return BcaI18n.t("每次请求间隔 0.4 秒。请控制单次勾选的总量。");
  if (value === "high") return BcaI18n.t("每次请求间隔 0.2 秒。风控风险明显，只建议对小收藏夹做小批量操作。");
  return "";
}
let currentSpeed = "lower";   // 与 background.js 的 DEFAULT_REQUEST_SPEED 一致
let pendingSpeed = "";

function renderSpeed() {
  speedGroup.querySelectorAll("button").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.speedValue === currentSpeed));
  });
  speedHint.textContent = speedHintFor(currentSpeed);
  speedHint.classList.toggle("danger", REQUEST_SPEED_RISKY.has(currentSpeed));
}

function applySpeed(value) {
  if (!REQUEST_SPEED_ORDER.includes(value)) return;
  currentSpeed = value;
  renderSpeed();
  chrome.storage.local.set({ requestSpeed: value }).catch(() => {});
}

speedGroup.querySelectorAll("button").forEach((button) => {
  button.addEventListener("click", () => {
    const value = button.dataset.speedValue;
    if (value === currentSpeed) return;
    // 切到更快的档位先提醒；取消就保持原样，不写入
    if (REQUEST_SPEED_RISKY.has(value)) {
      pendingSpeed = value;
      speedWarnDialog.showModal();
      return;
    }
    applySpeed(value);
  });
});
document.getElementById("speedWarnCancel").addEventListener("click", () => {
  pendingSpeed = "";
  speedWarnDialog.close();
});
document.getElementById("speedWarnGo").addEventListener("click", () => {
  speedWarnDialog.close();
  if (pendingSpeed) applySpeed(pendingSpeed);
  pendingSpeed = "";
});

/* 折叠摘要只显示首行：完整内容在展开后的 lastResult 里。
   最近状态那一块在导入很多记录后会变得很长，所以整块改成可折叠。 */
function setLastResultText(value) {
  const full = String(value || "");
  lastResult.textContent = full;
  const firstLine = full.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)[0] || "";
  lastResultBrief.textContent = firstLine || BcaI18n.t("暂无保存记录");
}

/* V1.1.3：点「开始导入」先弹确认框。
   导入是逐条解析 + 写盘的慢操作（2800 条约 30 分钟），误点代价很高，所以先问一句。 */
function openImportConfirm() {
  if (importBusy) return;
  const selected = importFolderList.querySelectorAll('input[type="checkbox"]:checked').length;
  if (!selected) return;
  importConfirmDetail.textContent = BcaI18n.t("将要导入 {count} 个收藏夹。", { count: selected })
    + " " + requestEstimateText();
  importConfirm.showModal();
}

async function startDiff() {
  if (importBusy) return;
  const folderIds = [...importFolderList.querySelectorAll('input[type="checkbox"]:checked')].map((input) => input.value);
  if (!folderIds.length) return;
  if (!rootHandle) {
    importStatus.textContent = BcaI18n.t("请先选择本地保存文件夹。");
    importStatus.classList.add("error");
    return;
  }
  importBusy = true;
  activeOperation = "diff";
  importStatus.textContent = "";
  importStatus.classList.remove("error");
  diffResult.hidden = true;
  // 差异对比要读完整列表，动手前把请求量告诉用户
  importProgressText.textContent = requestEstimateText() || BcaI18n.t("正在读取 B 站收藏夹列表…");
  updateImportSelection();   // 标题由 renderImportControl 按 activeOperation 设置
  try {
    const response = await chrome.runtime.sendMessage({ type: "bca-fav-diff", data: { folderIds } });
    if (!response?.ok) throw new Error(response?.message ? BcaI18n.t(response.message) : BcaI18n.t("对比差异失败。"));
    renderDiffResult(response);
    const diffs = Array.isArray(response.diffs) ? response.diffs : [];
    const sum = (key) => diffs.reduce((n, d) => n + (d[key]?.length || 0), 0);
    const diffDone = BcaI18n.t("对比完成：新增 {added}、线上已移除 {removed}、新失效 {invalid}、恢复 {recovered}。",
      { added: sum("added"), removed: sum("removed"), invalid: sum("newlyInvalid"), recovered: sum("recovered") });
    importStatus.textContent = diffDone;
    showDoneDialog(diffDone);
    if (response.reportPath) importStatus.textContent += " " + BcaI18n.t("报告：{path}", { path: response.reportPath });
  } catch (error) {
    importStatus.textContent = error?.message ? BcaI18n.t(error.message) : BcaI18n.t("对比差异失败。");
    importStatus.classList.add("error");
  } finally {
    importBusy = false;
    updateImportSelection();
  }
}

function renderDiffResult(response) {
  const diffs = Array.isArray(response?.diffs) ? response.diffs : [];
  diffResult.replaceChildren();
  // 全部用 textContent 拼，不碰 innerHTML —— 收藏夹名与视频标题都是用户数据
  for (const diff of diffs) {
    const line = document.createElement("p");
    line.className = "diff-line";
    const name = document.createElement("strong");
    // 恢复自 storage 的摘要里，四个差异项是数字不是数组 —— 两种形状都要认
    const count = (value) => Array.isArray(value) ? value.length : (Number(value) || 0);
    diff = { ...diff, added: count(diff.added), removed: count(diff.removed),
      newlyInvalid: count(diff.newlyInvalid), recovered: count(diff.recovered) };
    name.textContent = `「${diff.folderTitle}」`;
    // 光看「新增 2720」看不出所以然，所以把两边的条数一起摆出来
    line.append(name, document.createTextNode(
      BcaI18n.t("线上 {remote} / 本地 {local}：新增 {added} / 线上已移除 {removed} / 新失效 {invalid} / 恢复 {recovered}",
        { remote: diff.remoteFetched || 0, local: diff.localTotal || 0,
          added: diff.added?.length || 0, removed: diff.removed?.length || 0,
          invalid: diff.newlyInvalid?.length || 0, recovered: diff.recovered?.length || 0 })));
    if (!diff.collectionExists) {
      const note = document.createElement("small");
      note.className = "diff-warn";
      note.textContent = BcaI18n.t("本地还没有这个收藏夹，所以全部算作新增。");
      line.append(note);
    }
    if (diff.incomplete) {
      const warn = document.createElement("small");
      warn.className = "diff-warn";
      warn.textContent = BcaI18n.t("本次读取可能不完整，结果仅供参考");
      line.append(warn);
    }
    diffResult.append(line);
  }
  diffResult.hidden = diffs.length === 0;
}

/* V1.1.4：「开始更新」——只同步最近 N 天新收藏的视频。
   经常用手机刷到就收藏的用户，为这几天的新增跑一次全量导入（2800 条约 30 分钟）没有意义。
   过滤在后台按收藏时间做，这里只负责让用户选时间窗。 */
/* 估算这次要发多少次请求，让用户自己决定值不值得。
   README「使用须知」第一条就是"请求过密可能触发风控"，但在此之前界面从不告诉用户
   一次操作要发多少次 —— 用户没法判断。列表按 40 条一次请求算。 */
function estimateListRequests() {
  const checked = [...importFolderList.querySelectorAll('input[type="checkbox"]:checked')];
  const total = checked.reduce((sum, input) => {
    const folder = importFolders.find((item) => String(item.id) === String(input.value));
    const count = Number(folder?.count) || 0;
    return sum + Math.max(1, Math.ceil(count / 40));
  }, 0);
  return { folders: checked.length, requests: total };
}

/* 动手前的第二次把关：档位偏快 + 勾选总量偏大时再劝一次。
   单看某一项都不算危险（快档跑小收藏夹、低档跑大收藏夹都还行），
   但"快档 × 大收藏夹"正好是最容易触发风控的组合。 */
const RISKY_TOTAL_ITEMS = 500;
const SPEED_LABELS = { lower: "较低", standard: "标准", higher: "较高", high: "高" };
let riskyConfirmResolve = null;

function selectedItemTotal() {
  return [...importFolderList.querySelectorAll('input[type="checkbox"]:checked')].reduce((sum, input) => {
    const folder = importFolders.find((item) => String(item.id) === String(input.value));
    return sum + (Number(folder?.count) || 0);
  }, 0);
}

// 需要提醒时返回说明文字，否则返回空串
function riskySpeedWarning() {
  if (!REQUEST_SPEED_RISKY.has(currentSpeed)) return "";
  const total = selectedItemTotal();
  if (total <= RISKY_TOTAL_ITEMS) return "";
  return BcaI18n.t("当前是「{speed}」档，而勾选内容共约 {total} 条。建议改用「较低」档位再开始。",
    { speed: SPEED_LABELS[currentSpeed] || "", total });
}

// 三个入口共用：需要提醒就弹窗等用户选，返回 true 表示可以继续
function confirmRiskySpeed() {
  const warning = riskySpeedWarning();
  if (!warning) return Promise.resolve(true);
  riskyWarnText.textContent = warning;
  riskyWarnDialog.showModal();
  return new Promise((resolve) => { riskyConfirmResolve = resolve; });
}

/* 完成提示弹窗。
   以前只在「最近状态」里写一行小字，勾了很多收藏夹、跑了很久之后很容易看漏。 */
function showDoneDialog(text) {
  doneDialogText.textContent = text;
  doneDialog.showModal();
}

function requestEstimateText() {
  const { folders, requests } = estimateListRequests();
  if (!requests) return "";
  return BcaI18n.t("预计要读取 {requests} 次收藏夹列表（{folders} 个收藏夹，每次 40 条）。", { requests, folders });
}

function openUpdateRecent() {
  if (importBusy) return;
  const selected = importFolderList.querySelectorAll('input[type="checkbox"]:checked').length;
  if (!selected) return;
  updateRecentDetail.textContent = BcaI18n.t("将要更新 {count} 个收藏夹。", { count: selected })
    + " " + requestEstimateText();
  updateRecentDialog.showModal();
}

async function startImport(options = {}) {
  if (importBusy) return;
  activeOperation = options.recentDays ? "update" : "import";
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
    const payload = { type: "bca-import-selected-folders", folderIds };
    if (options.recentDays) payload.recentDays = options.recentDays;
    const response = await sendTabMessage(tab.id, payload);
    if (response?.cancelled) {
      importStatus.classList.add("error");
      importStatus.textContent = response.message ? BcaI18n.t(response.message) : BcaI18n.t("导入已取消，本次改动已回滚。");
      return;
    }
    if (!response?.ok) throw new Error(response?.message ? BcaI18n.t(response.message) : BcaI18n.t("导入失败。"));
    importStatus.classList.remove("error");
    const doneText = response.message ? BcaI18n.t(response.message) : BcaI18n.t("导入/更新完成：新导入 {imported} 个，更新 {refreshed} 个。", { imported: response.imported || 0, refreshed: response.refreshed || 0 });
    importStatus.textContent = doneText;
    showDoneDialog(doneText);
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
    setLastResultText(firstLine || BcaI18n.t("已完成"));
    const paths = [...String(status.lastResult.path || "").split(/\r?\n/), ...messageLines].filter(Boolean);
    resultPath.textContent = paths.join("\n");
    resultDetailsSummary.textContent = paths.length > 1 ? BcaI18n.t("查看保存位置（{count} 条）", { count: paths.length }) : BcaI18n.t("查看保存位置");
    resultDetails.hidden = paths.length === 0;
  } else {
    setLastResultText(BcaI18n.t("暂无保存记录"));
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
      setLastResultText(permissionNotice);
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
    setLastResultText(error?.message ? BcaI18n.t(error.message) : BcaI18n.t("无法更新插件状态。"));
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
startImportButton.addEventListener("click", openImportConfirm);
updateRecentButton.addEventListener("click", openUpdateRecent);
document.getElementById("updateRecentCancel").addEventListener("click", () => updateRecentDialog.close());
document.getElementById("updateRecentGo").addEventListener("click", () => {
  const picked = updateRecentDialog.querySelector('input[name="updateRange"]:checked');
  const days = Number(picked?.value) || 3;
  updateRecentDialog.close();
  confirmRiskySpeed().then((ok) => { if (ok) startImport({ recentDays: days }); });
});
document.getElementById("importConfirmCancel").addEventListener("click", () => importConfirm.close());
document.getElementById("importConfirmGo").addEventListener("click", async () => {
  importConfirm.close();
  if (!await confirmRiskySpeed()) return;
  startImport();
});
document.getElementById("riskyWarnCancel").addEventListener("click", () => {
  riskyWarnDialog.close();
  if (riskyConfirmResolve) riskyConfirmResolve(false);
  riskyConfirmResolve = null;
});
document.getElementById("riskyWarnLower").addEventListener("click", () => {
  riskyWarnDialog.close();
  applySpeed("lower");
  if (riskyConfirmResolve) riskyConfirmResolve(true);
  riskyConfirmResolve = null;
});
document.getElementById("riskyWarnGo").addEventListener("click", () => {
  riskyWarnDialog.close();
  if (riskyConfirmResolve) riskyConfirmResolve(true);
  riskyConfirmResolve = null;
});
document.getElementById("doneDialogClose").addEventListener("click", () => doneDialog.close());
// 三个入口都要过这一关：开始导入、开始更新、先看差异
diffFoldersButton.addEventListener("click", () => {
  confirmRiskySpeed().then((ok) => { if (ok) startDiff(); });
});
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
  if (message?.type === "bca-diff-progress") { importProgressText.textContent = message.text || ""; return; }
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
    setLastResultText(error?.message ? BcaI18n.t(error.message) : BcaI18n.t("无法读取插件状态。"));
  });
  // 读回上次选择的速度（与 background.js 共用同一份 storage.local）。
  // 用 then 而不是 await —— 这块初始化代码不在 async 函数里。
  // 差异对比的结果存在 storage 里 —— 上次切走弹窗、这次回来要能接着看到
  chrome.storage.local.get("diffState").then((saved) => {
    const state = saved?.diffState;
    if (!state) return;
    if (state.running) {
      activeOperation = "diff";
      importProgressText.textContent = state.text || BcaI18n.t("正在读取 B 站收藏夹列表…");
      importBusy = true;
      updateImportSelection();
      return;
    }
    if (state.summary) {
      renderDiffResult({ diffs: state.summary.folders, reportPath: state.summary.reportPath });
      // 跑完之后才切回来的情况：结果要弹一下，不能只在「最近状态」里留一行
      const folders = state.summary.folders || [];
      const total = (key) => folders.reduce((n, f) => n + (Number(f[key]) || 0), 0);
      showDoneDialog(BcaI18n.t("对比完成：新增 {added}、线上已移除 {removed}、新失效 {invalid}、恢复 {recovered}。",
        { added: total("added"), removed: total("removed"), invalid: total("newlyInvalid"), recovered: total("recovered") }));
    }
  }).catch(() => {});
  chrome.storage.local.get("requestSpeed").then((saved) => {
    currentSpeed = REQUEST_SPEED_ORDER.includes(saved?.requestSpeed) ? saved.requestSpeed : "lower";
    renderSpeed();
  }).catch(() => renderSpeed());
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
