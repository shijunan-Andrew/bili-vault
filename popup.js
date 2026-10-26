// 1.8.22（old-p3 security P3-2）：不允许被别的页面嵌进 iframe 做点击劫持（判据在 i18n.js）。
BcaI18n.guardTopFrame("这个页面需要在独立标签页中打开，请不要把它嵌入其他页面。", "页面不允许被嵌入其他页面。");

const DB_NAME = "bili-fav-archiver";
// 4.9.4：默认下载目录名（与归档布局、已下载标记保持一致）
const DOWNLOAD_FOLDER_NAME = "000视频下载";
// V1.4.4：选完目录时一并建出来的几个固定目录（与 background.js 的保留目录名单、
// library.js 的 ROOT_STRUCTURE_DIRECTORIES 保持一致 —— 几处改动要一起改）
// 1.5.0：多了 003database（本地数据库根目录）
/* 1.11.10：名单只有 archive-core.js 一份（AUXILIARY_DIR_NAMES），这里只引用。
   以前弹窗与收藏库各写一份四名单，004导出 / 005回收站 / 006报告 要等真用到才出现。 */
const ROOT_STRUCTURE_DIRECTORIES = BcaArchiveCore.AUXILIARY_DIR_NAMES;
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
const storageErrorRow = document.getElementById("storageErrorRow");
const storageErrorText = document.getElementById("storageErrorText");
const dismissStorageError = document.getElementById("dismissStorageError");
const importConfirm = document.getElementById("importConfirm");
const importConfirmDetail = document.getElementById("importConfirmDetail");
const updateRecentButton = document.getElementById("updateRecent");
const importLimitSelect = document.getElementById("importLimit");
/* 1.16.5：记住上次选的「每次最多导入多少条」，下次打开原样选中（默认仍是「全部」）。 */
const IMPORT_LIMIT_KEY = "importLimit";
const updateRecentDialog = document.getElementById("updateRecentDialog");
const updateRecentDetail = document.getElementById("updateRecentDetail");
const speedGroup = document.getElementById("speedGroup");
const speedHint = document.getElementById("speedHint");
// 1.14.3（审查 C-3）：写失败时临时借速度提示行说一句，6 秒后回到正常文案。
let speedHintTimer = 0;
const speedWarnDialog = document.getElementById("speedWarnDialog");
const riskyWarnDialog = document.getElementById("riskyWarnDialog");
const riskyWarnText = document.getElementById("riskyWarnText");
const doneDialog = document.getElementById("doneDialog");
const doneDialogText = document.getElementById("doneDialogText");
const doneDialogTitle = document.getElementById("doneDialogTitle");
const diffStartConfirm = document.getElementById("diffStartConfirm");
const diffStartDetail = document.getElementById("diffStartDetail");
const lastError = document.getElementById("lastError");
const errorText = document.getElementById("errorText");
// 1.7.9（ux P2-8）：错误块现在分三层 —— 标题（可编程聚焦）、人话摘要、折叠的报告原文
const errorTitle = document.getElementById("errorTitle");
const errorSummary = document.getElementById("errorSummary");
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
const importWarn = document.getElementById("importWarn");
const startImportButton = document.getElementById("startImport");
/* P1-7：上次导入中断时后台会留一条「停在哪」的小记录（local: bcaImportResume），
   这里把它显示成一行提示 + 一个「继续上次导入」按钮。 */
const resumeImportRow = document.getElementById("resumeImportRow");
const resumeImportText = document.getElementById("resumeImportText");
const resumeImportButton = document.getElementById("resumeImport");
let importResume = null;
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
// 1.7.0（批次 B）：失败结果要能在弹窗里被迫展开（见 refreshStatus）
const statusCard = document.getElementById("statusCard");
const popupVersion = document.getElementById("popupVersion");
// 4.5.1：主题 / 语言改成分段控件，按钮直接写在 popup.html 里
const localeButtons = [...document.querySelectorAll(".segmented button[data-locale]")];
let errorReport = "";
/* 1.16.2：上一次把焦点交给错误标题时用的报告内容（同一份报告不再反复抢焦点）。 */
let lastFocusedReport = "";
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

/* 1.16.4：只有真的在导入时才提示「别切后台」—— 平时一直挂着会被当噪声。 */
function renderImportWarn(running) {
  if (importWarn) importWarn.hidden = !running;
}

function renderImportControl() {
  renderImportWarn(Boolean(importBusy && activeOperation === "import"));
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
    // 默认开启：它确实能把失效视频的封面和标题拼回来（真机上验证过）。
    // 注意别和"把失效视频恢复成正常状态"混为一谈 —— 那是另一回事，也一般做不到。
    recoverInvalidCheckbox.checked = saved?.recoverInvalidVideos !== false;
  } catch (_) {
    recoverInvalidCheckbox.checked = true;
  }
}

recoverInvalidCheckbox.addEventListener("change", () => {
  // 1.14.3（审查 C-3）：写失败就把勾选退回去并说一句，别让界面替存储撒谎
  const wanted = recoverInvalidCheckbox.checked;
  chrome.storage.local.set({ recoverInvalidVideos: wanted }).catch((error) => {
    console.warn("合规开关没写进去（这一次的改动不会生效）", error);
    recoverInvalidCheckbox.checked = !wanted;
    showSpeedSaveError();
  });
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
  // 顺带把总量也显示出来 —— 判断"要不要现在跑"时，条数比个数有用得多
  const totalItems = selectedItemTotal();
  importSelectedCount.textContent = BcaI18n.t("已选 {count} 个", { count: selected })
    + (totalItems ? " · " + BcaI18n.t("共 {total} 条视频", { total: totalItems }) : "");
  startImportButton.disabled = importBusy || selected === 0;
  // P1-7：正在导入时把「继续上次导入」那一行收起（导入中它也没有意义）
  renderResumeImport();
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
  clearTimeout(speedHintTimer);
  speedGroup.querySelectorAll("button").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.speedValue === currentSpeed));
  });
  speedHint.textContent = speedHintFor(currentSpeed);
  speedHint.classList.toggle("danger", REQUEST_SPEED_RISKY.has(currentSpeed));
}

// 1.14.3（审查 C-3）：设置没写进去时必须**当场说出来** —— 否则用户以为改了、其实没改，
// 这正是 AI_HANDOFF 原则 25 说的「给用户看假状态」。提示只借用 6 秒，之后回到正常文案。
function showSpeedSaveError() {
  clearTimeout(speedHintTimer);
  speedHint.textContent = BcaI18n.t("设置没能保存，请再试一次。");
  speedHint.classList.add("danger");
  speedHintTimer = setTimeout(renderSpeed, 6000);
}

function applySpeed(value) {
  if (!REQUEST_SPEED_ORDER.includes(value)) return;
  if (value === currentSpeed) return;
  const previousSpeed = currentSpeed;
  currentSpeed = value;
  renderSpeed();
  // 写 session：关掉浏览器就失效，下次打开回到默认的「较低」
  // 1.14.3（审查 C-3）：写失败要把界面退回去并说一句 —— 运行时用的是后台记的档位，
  // 这一份没写进去，界面显示的就不是真正生效的速度。
  chrome.storage.session.set({ requestSpeed: value }).catch((error) => {
    console.warn("限速档没写进去（这一次的切换不会生效）", error);
    currentSpeed = previousSpeed;
    renderSpeed();
    showSpeedSaveError();
  });
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
   导入是逐条解析 + 写盘的慢操作（1000 条约 10 分钟），误点代价很高，所以先问一句。 */
// 1.8.8：0 表示「全部」；数字表示这次最多导入多少条**新**视频（已有的跳过不占名额）。
function selectedImportLimit() {
  return Math.max(0, Number(importLimitSelect?.value) || 0);
}

function openImportConfirm() {
  if (importBusy) return;
  const selected = importFolderList.querySelectorAll('input[type="checkbox"]:checked').length;
  if (!selected) return;
  const limit = selectedImportLimit();
  importConfirmDetail.textContent = (limit > 0
    ? BcaI18n.t("将要导入 {count} 个收藏夹，本次最多写入 {limit} 条还没保存到本地的新视频。", { count: selected, limit })
    : BcaI18n.t("将要导入 {count} 个收藏夹。", { count: selected }))
    + " " + requestEstimateText();
  importConfirm.showModal();
}

async function startDiff() {
  if (importBusy) return;
  const folderIds = [...importFolderList.querySelectorAll('input[type="checkbox"]:checked')].map((input) => input.value);
  if (!folderIds.length) return;
  if (!rootHandle) {
    importStatus.textContent = BcaI18n.t("请先选择本地备份文件夹。");
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
  for (const rawDiff of diffs) {
    // 恢复自 storage 的摘要里，四个差异项是数字不是数组 —— 两种形状都要认。
    // 注意用新变量：for...of 的循环变量是 const，直接赋值会抛
    // "Assignment to constant variable."（真机上就是这么暴露的）。
    const count = (value) => Array.isArray(value) ? value.length : (Number(value) || 0);
    const diff = { ...rawDiff, added: count(rawDiff.added), removed: count(rawDiff.removed),
      newlyInvalid: count(rawDiff.newlyInvalid), recovered: count(rawDiff.recovered) };
    const line = document.createElement("p");
    line.className = "diff-line";
    const name = document.createElement("strong");
    name.textContent = `「${diff.folderTitle}」`;
    // 光看「新增 1000」看不出所以然，所以把两边的条数一起摆出来
    // 1.5.9：上面 diff 里的四项已经被 count() 归一成**数字**了，这里不能再取 .length
    // （数字没有 length，恒为 0 —— 用户看到的「四个数字永远是 0」就是这个）。
    line.append(name, document.createTextNode(
      BcaI18n.t("线上 {remote} / 本地 {local}：新增 {added} / 线上已移除 {removed} / 新失效 {invalid} / 恢复 {recovered}",
        { remote: diff.remoteFetched || 0, local: diff.localTotal || 0,
          added: Number(diff.added) || 0, removed: Number(diff.removed) || 0,
          invalid: Number(diff.newlyInvalid) || 0, recovered: Number(diff.recovered) || 0 })));
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

/* V1.1.4：「同步最近收藏」——只同步最近 N 天新收藏的视频。
   经常用手机刷到就收藏的用户，为这几天的新增跑一次全量导入（1000 条约 10 分钟）没有意义。
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
   以前只在「最近状态」里写一行小字，勾了很多收藏夹、跑了很久之后很容易看漏。

   两个来源会各自异步恢复上一次的结果（导入完成的 importDone、对比完成的 diffState），
   它们互不知情，可能同时想弹。原生 <dialog> 已经开着时再 showModal() 会抛
   InvalidStateError，而调用点的 .catch(() => {}) 会把它吞掉 —— 用户就永远看不到第二条。
   所以这里排队：开着就先存起来，点掉「知道了」之后接着弹下一条。 */
const pendingDoneDialogs = [];
function showDoneDialog(text, failed = false) {
  if (!doneDialog || !text) return;
  if (doneDialog.open) {
    pendingDoneDialogs.push({ text, failed: Boolean(failed) });
    return;
  }
  // 1.7.20（facet-ux P1-1）：失败也走这条补弹路径，标题得说清「没跑完」，
  // 别让它顶着「已完成」四个字出现。
  if (doneDialogTitle) {
    if (failed) doneDialogTitle.textContent = BcaI18n.t("导入没有完成");
    else doneDialogTitle.textContent = BcaI18n.t("已完成");
  }
  doneDialogText.classList.toggle("error", Boolean(failed));
  doneDialogText.textContent = text;
  doneDialog.showModal();
}
/* 当前这条关掉之后，接着弹排队里的下一条 */
function showNextDoneDialog() {
  if (doneDialog?.open) return;
  const next = pendingDoneDialogs.shift();
  if (!next) return;
  showDoneDialog(next.text, next.failed);
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
  updateRecentDetail.textContent = BcaI18n.t("将要同步 {count} 个收藏夹。", { count: selected })
    + " " + requestEstimateText();
  updateRecentDialog.showModal();
}

/* 导入过程中用户把 B 站收藏夹页面关掉时，弹窗发给页面的那条消息会随着标签页一起断掉。
   后台其实还在跑（1.4.3 起「关掉页面也继续」是有意做的），但这里的 await 会直接失败，
   于是既不显示完成提示、还会写一句「请先打开并刷新收藏夹页面」的假错误。
   所以先问一句后台还在不在跑：在跑就改成等 importDone 落地再提示。 */
async function importStillRunning() {
  try {
    const saved = await chrome.storage.local.get("importState");
    return Boolean(saved?.importState?.running);
  } catch (_) {
    return false;
  }
}

async function readImportResume() {
  try {
    const stored = await chrome.storage.local.get("bcaImportResume");
    return stored?.bcaImportResume || null;
  } catch (_) {
    return null;
  }
}

function renderResumeImport() {
  if (!resumeImportRow) return;
  const resume = importResume;
  const usable = Boolean(resume && resume.folder && !importBusy);
  resumeImportRow.hidden = !usable;
  if (!usable) {
    if (resumeImportText) resumeImportText.textContent = "";
    return;
  }
  if (resumeImportText) {
    resumeImportText.textContent = BcaI18n.t("上次导入停在「{folder}」第 {page} 页（已写入 {saved} 条），可以接着往下跑。", {
      folder: String(resume.folder),
      page: Math.max(1, Number(resume.page) || 1),
      saved: Math.max(0, Number(resume.saved) || 0)
    });
  }
}

async function refreshImportResume() {
  importResume = await readImportResume();
  renderResumeImport();
}

async function startImport(options = {}) {
  if (importBusy) return;
  // P1-7：继续上次导入时，用断点里记着的收藏夹 id，不必让用户重新勾选
  const resume = options.resume && typeof options.resume === "object" ? options.resume : null;
  const resumeIds = resume && Array.isArray(resume.folderIds) ? resume.folderIds.map(String).filter(Boolean) : [];
  activeOperation = options.recentDays ? "update" : "import";
  const folderIds = resume
    ? resumeIds
    : [...importFolderList.querySelectorAll('input[type="checkbox"]:checked')].map((input) => input.value);
  if (!folderIds.length) {
    /* 1.16.3：以前这里直接 return —— 点了「继续上次导入」什么都不会发生（真机反馈「没反应」）。 */
    importStatus.textContent = resume
      ? BcaI18n.t("这条断点里没有记下收藏夹，请在下面重新勾选后再导入。")
      : BcaI18n.t("请先勾选要导入的收藏夹。");
    importStatus.classList.add("error");
    return;
  }
  if (!rootHandle) {
    importStatus.textContent = BcaI18n.t("请先选择本地备份文件夹。");
    importStatus.classList.add("error");
    return;
  }
  importBusy = true;
  importPaused = false;
  disarmCancel();
  importStatus.textContent = "";
  updateImportSelection();
  importStatus.classList.remove("error");
  importProgressText.textContent = BcaI18n.t("正在请求本地备份文件夹权限…");
  const startedAt = Date.now();
  try {
    const permission = await rootHandle.requestPermission({ mode: "readwrite" });
    if (permission !== "granted") throw new Error(BcaI18n.t("未获得本地备份文件夹的写入权限，请重新选择本地备份文件夹后重试。"));
    const tab = await queryCurrentTab();
    const payload = { type: "bca-import-selected-folders", folderIds };
    if (options.recentDays) payload.recentDays = options.recentDays;
    if (options.limit) payload.limit = options.limit;
    if (resume) payload.resume = { folder: String(resume.folder || ""), page: Math.max(1, Number(resume.page) || 1) };
    const response = await sendTabMessage(tab.id, payload);
    if (response?.cancelled) {
      importStatus.classList.add("error");
      importStatus.textContent = response.message ? BcaI18n.t(response.message) : BcaI18n.t("导入已取消，本次改动已回滚。");
      return;
    }
    if (!response?.ok) throw new Error(response?.message ? BcaI18n.t(response.message) : BcaI18n.t("导入失败。"));
    importStatus.classList.remove("error");
    // 断点已经在后台开跑时清掉了；这里把弹窗里的那一行也收起来
    importResume = null;
    renderResumeImport();
    const doneText = response.message ? BcaI18n.t(response.message) : BcaI18n.t("导入/更新完成：新导入 {imported} 个，更新 {refreshed} 个。", { imported: response.imported || 0, refreshed: response.refreshed || 0 });
    importStatus.textContent = doneText;
    showDoneDialog(doneText);
    if (response.reportPath) importStatus.textContent += ` ${BcaI18n.t("错误报告：{path}", { path: response.reportPath })}`;
  } catch (error) {
    // 页面被关掉 ≠ 导入失败：后台还在跑的话，等它把结果写进 importDone 再提示。
    if (await importStillRunning()) {
      awaitingBackgroundImport = startedAt;
      importStatus.classList.remove("error");
      importStatus.textContent = BcaI18n.t("页面已关闭，导入仍在后台继续；完成后这里会提示。");
    } else {
      importStatus.textContent = error?.message ? BcaI18n.t(error.message) : BcaI18n.t("导入失败。");
      importStatus.classList.add("error");
      /* 1.16.3：这一轮根本没跑起来（多半是当前标签页不是收藏夹页），也要响一声出错音。 */
      playImportSound({ failed: true, summary: String(error?.message || "") });
    }
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
    request.onerror = () => reject(request.error || new Error(BcaI18n.t("无法保存本地备份文件夹设置。")));
  });
}

async function saveRootHandle(handle) {
  const db = await openDb();
  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(DB_STORE, "readwrite");
      transaction.objectStore(DB_STORE).put(handle, "rootHandle");
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error(BcaI18n.t("本地备份文件夹授权失败。")));
    });
  } finally {
    db.close();
  }
  // 已经开着的收藏库页面不会知道目录换了：IndexedDB 没有跨页面变更事件，
  // 所以留一个自增时间戳当信号，收藏库监听它再回去读句柄。
  await chrome.storage.local.set({ rootHandleRevision: Date.now() });
}

/* 收藏库里换了备份文件夹时，弹窗这边只把「目录名」这一行拉回来。
   不整页重刷状态：导入进度、上次结果那些不该被一次改名带着重置。 */
async function syncFolderLabelFromHandle() {
  try {
    const handle = await loadRootHandle();
    rootHandle = handle || null;
    const label = rootHandle?.name || "";
    folderName.textContent = label || BcaI18n.t("尚未选择文件夹");
    folderName.classList.toggle("unselected", !label);
  } catch (_) {
    // 读不到就维持现状，下次打开弹窗时 refreshStatus 还会再试
  }
}

async function loadRootHandle() {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(DB_STORE, "readonly").objectStore(DB_STORE).get("rootHandle");
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error(BcaI18n.t("无法读取已选的本地备份文件夹。")));
    });
  } finally {
    db.close();
  }
}

/* 1.7.9（ux P2-8）：把 16000 字的报告压成一句人话。
   报告的开头固定是「B站收藏夹本地导入报告 / 插件版本 / 提示 / 开始时间」，
   真正的那句失败在几十行以后 —— 所以不能取首行，要挑带结论关键词的那一行。
   挑不到就退回一句通用说明（至少比一屏报告原文强）。 */
function errorSummaryText(error) {
  if (error?.needsReauth) return BcaI18n.t("本地归档文件夹的写入授权已失效，需要重新授权。");
  const lines = String(error?.report || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const keyLine = lines.find((line) => /失败|中止|冲突|失效|错误/.test(line));
  if (!keyLine) return BcaI18n.t("最近一次操作没有成功完成，下面是完整报告。");
  return keyLine.length > 120 ? `${keyLine.slice(0, 119)}…` : keyLine;
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
  /* 目录名一律以 IndexedDB 里那个句柄为准。曾经另存一份 baseFolderName 到
     chrome.storage.local，结果收藏库里换了目录、弹窗却还显示上一次的名字 ——
     同一件事存两份，迟早不一致。句柄在上面刚读完，名字就在它身上。 */
  const folderLabel = rootHandle?.name || "";
  folderName.textContent = folderLabel || BcaI18n.t("尚未选择文件夹");
  folderName.classList.toggle("unselected", !folderLabel);
  /* 1.8.23（TODO P0-3）：background 的 safeLocalSet 重试一次仍失败时会把原因写进
     lastStorageError。这里是它唯一的展示位；关掉弹窗也不会自动清，点「知道了」才清。 */
  if (status.lastStorageError) {
    const storageError = status.lastStorageError;
    storageErrorText.textContent = BcaI18n.t("写入「{label}」失败：{message}", {
      label: storageError.label || BcaI18n.t("本地存储"),
      message: storageError.message || BcaI18n.t("未知错误"),
    });
    storageErrorRow.hidden = false;
    if (statusCard) statusCard.open = true;
  } else {
    storageErrorRow.hidden = true;
    storageErrorText.textContent = "";
  }
  if (status.lastResult) {
    /* 1.7.0（批次 B / P1）：失败结果不许默认折叠。活动角标在弹窗打开时就被清掉，
       这张默认收起的卡片是唯一痕迹 —— 用户瞥一眼就关掉弹窗，等于什么都没看到
       （导入跑了几分钟、一条都没归档，界面上却看不出任何异常）。background 在失败
       路径上会带 failed: true。 */
    if (status.lastResult.failed && statusCard) statusCard.open = true;
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
    if (errorSummary) errorSummary.textContent = errorSummaryText(status.lastError);
    reportPath.textContent = status.lastError.reportPath
      ? BcaI18n.t("本地报告：{path}", { path: status.lastError.reportPath })
      : BcaI18n.t("报告暂存在插件中，可下载到本地。");
    lastError.hidden = false;
    /* 1.7.9（ux P2-8）：出过错就必须看得见。卡片默认是收起的（上面只有 lastResult.failed
       才会展开），而「读取失败」「授权失效」这类错误根本不会写 lastResult —— 结果就是
       弹窗打开后一切正常，错误躺在折叠里没人知道。这里和失败结果一样强制展开，
       并把焦点交给错误标题：读屏会读它，键盘用户往下 Tab 就是下载报告。
       tabindex="-1" 让标题可编程聚焦但不占 Tab 位；focus 失败（老 Chrome 不认
       options）也不能连累整个渲染，所以单独包一层。 */
    if (statusCard) statusCard.open = true;
    /* 1.16.2：只有「这一次是新报告」才把焦点交给错误标题，而且不许滚动。
       原来每次 refreshStatus() 都抢焦点 + preventScroll:false，而任何 storage 变化
       （暂停 / 继续 / 取消导入都会写 importState）都会调 refreshStatus()，
       于是点一下按钮，弹窗就瞬间滚到最底部的错误卡。 */
    if (errorReport !== lastFocusedReport) {
      lastFocusedReport = errorReport;
      try {
        errorTitle?.focus({ preventScroll: true });
      } catch {
        errorTitle?.focus();
      }
    }
  } else {
    lastError.hidden = true;
    errorReport = "";
    if (errorSummary) errorSummary.textContent = "";
  }
  // BUG-8：优先用后台给的结构化字段 lastError.needsReauth 判断要不要显示「重新授权」。
  // 以前这里靠 includes 匹配 background 写的中文原文，文案一改（就像这次统一术语）
  // 这个入口会静默消失：用户只看到一句报错，却找不到能救回来的按钮。
  // 下面的字符串匹配只是过渡兜底，等 background.js 写上 needsReauth 之后可以删掉。
  const authorizationExpired = Boolean(status.lastError?.needsReauth)
    || Boolean(status.lastError?.report?.includes("写入授权已失效"));
  const alreadyReauthorized = status.authorizedErrorAt === status.lastError?.createdAt;
  const canRecover = authorizationExpired && rootHandle && !alreadyReauthorized;
  reauthorizeButton.hidden = !canRecover;
  permissionHint.hidden = !canRecover;
  if (canRecover) {
    reauthorizeButton.textContent = status.pendingFavorite ? BcaI18n.t("重新授权并补存刚才的视频") : BcaI18n.t("重新授权本地备份文件夹");
    // permissionNotice 里已经是可直接显示的文案
    permissionHint.textContent = permissionNotice || (status.pendingFavorite
      ? BcaI18n.t("点击后按 Chrome 提示允许访问，插件会接着保存这条视频。")
      : BcaI18n.t("点击后按 Chrome 提示允许访问；然后需要重新收藏刚才的视频。"));
  }
}

dismissStorageError?.addEventListener("click", () => {
  chrome.storage.local.remove("lastStorageError").catch(() => {});
  storageErrorRow.hidden = true;
  storageErrorText.textContent = "";
});

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
    // 4.9.4：顺手把插件自己的固定目录建出来。V1.4.4 起三个都建：
    // 「标记为已下载」需要 000视频下载，错误报告与同步报告要落进另外两个。
    // 空文件夹选进来时也能立刻看出插件认了这个目录。
    // 这里一定是 readwrite 权限（上面刚 requestPermission 过），失败也不影响主流程。
    for (const name of ROOT_STRUCTURE_DIRECTORIES) {
      try { await handle.getDirectoryHandle(name, { create: true }); } catch (_) {}
    }
    const currentStatus = await chrome.runtime.sendMessage({ type: "get-status" });
    await chrome.storage.local.set({ authorizedErrorAt: currentStatus.lastError?.createdAt || null });
    folderName.textContent = handle.name;
    await refreshStatus();
  } catch (error) {
    if (error?.name !== "AbortError") {
      folderName.textContent = error?.message ? BcaI18n.t(error.message) : BcaI18n.t("选择文件夹失败。");
    }
  } finally {
    chooseButton.disabled = false;
    chooseButton.textContent = BcaI18n.t("选择本地备份文件夹");
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
    if (permission !== "granted") throw new Error(BcaI18n.t("没有获得本地备份文件夹的写入权限。请允许访问，或重新选择本地备份文件夹。"));
    permissionNotice = "";

    const status = await chrome.runtime.sendMessage({ type: "get-status" });
    if (status.pendingFavorite) {
      reauthorizeButton.textContent = BcaI18n.t("正在补存视频…");
      const result = await chrome.runtime.sendMessage({ type: "retry-pending-favorite" });
      if (!result?.ok) throw new Error(result?.message ? BcaI18n.t(result.message) : BcaI18n.t("授权已恢复，但视频补存失败。请查看最近错误信息。"));
    } else {
      await chrome.storage.local.set({
        lastResult: { message: BcaI18n.t("本地备份文件夹授权已恢复，请重新收藏刚才的视频。"), createdAt: Date.now() },
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
/* P1-7：断点那一行的按钮直接按上次勾过的收藏夹续跑（不重新勾选、不再问一次速度）。 */
resumeImportButton?.addEventListener("click", () => { startImport({ resume: importResume }); });
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
  startImport({ limit: selectedImportLimit() });
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
/* 按 Esc 关掉同样要把等在 Promise 上的调用点放掉。
   否则「开始导入」「同步最近收藏」「先看差异」会永久挂住：按钮点了没反应，也没有任何报错。
   Esc 等价于「取消」。 */
riskyWarnDialog.addEventListener("cancel", () => {
  if (riskyConfirmResolve) riskyConfirmResolve(false);
  riskyConfirmResolve = null;
});
/* 完成提示被关掉时要做的事。点「知道了」和按 Esc 都走这里 ——
   只绑 click 的话，Esc 关掉不写 acknowledged，下次打开插件会重新弹一遍。 */
function dismissDoneDialog() {
  doneDialog.close();
  // 两类完成提示都标记"已提示过"，否则下次打开插件会重放
  chrome.storage.local.get("importDone").then((saved) => {
    const done = saved?.importDone;
    if (!done || done.acknowledged) return;
    return chrome.storage.local.set({ importDone: { ...done, acknowledged: true } });
  }).catch(() => {});
  chrome.storage.local.get("diffState").then((saved) => {
    const state = saved?.diffState;
    if (!state?.summary || state.summary.acknowledged) return;
    return chrome.storage.local.set({
      diffState: { ...state, summary: { ...state.summary, acknowledged: true } }
    });
  }).catch(() => {});
  // 1.7.20（facet-ux P1-2）：用户真的把结果读掉并关掉了对话框 —— 到这一步才灭角标
  clearBadge();
  // 排队等着的那条（如果有）接着弹
  showNextDoneDialog();
}
document.getElementById("doneDialogClose").addEventListener("click", dismissDoneDialog);
doneDialog.addEventListener("cancel", dismissDoneDialog);
// 与「开始导入」「同步最近收藏」保持一致：点一下先弹确认框，再点一次才真的开始
function openDiffConfirm() {
  if (importBusy) return;
  const selected = importFolderList.querySelectorAll('input[type="checkbox"]:checked').length;
  if (!selected) return;
  diffStartDetail.textContent = BcaI18n.t("将要对比 {count} 个收藏夹。", { count: selected })
    + " " + requestEstimateText();
  diffStartConfirm.showModal();
}

diffFoldersButton.addEventListener("click", openDiffConfirm);
document.getElementById("diffStartCancel").addEventListener("click", () => diffStartConfirm.close());
document.getElementById("diffStartGo").addEventListener("click", () => {
  diffStartConfirm.close();
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

chrome.runtime.onMessage.addListener((message, sender) => {
  // 1.8.22（old-p3 security P3-3）：只接受本扩展自己发来的消息。
  if (!sender || sender.id !== chrome.runtime.id) return;
  if (message?.type === "bca-diff-progress") { importProgressText.textContent = message.text || ""; return; }
  if (message?.type !== "bca-import-progress") return;
  importProgressText.textContent = message.text ? BcaI18n.t(message.text) : BcaI18n.t("正在导入…");
});

/* 收藏夹页面在导入途中被关掉时，只有后台会把结果写进 importDone；
   这里记下「等哪一次导入的结果」，收到就补一次完成提示。 */
let awaitingBackgroundImport = 0;

/* 1.16.0：导入收尾的音效。判据只住在 sound.js 的 importFailed() 里。 */
function playImportSound(state) {
  try {
    globalThis.BcaSound?.playImportResult(state);
  } catch (error) {
    console.warn("导入结束的提示音没播出来（不影响导入结果）", error);
  }
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes.enabled) renderEnabledState(changes.enabled.newValue !== false);
  // 收藏库里换了备份文件夹：把这一行名字同步过来，别让两边显示得不一样
  if (areaName === "local" && changes.rootHandleRevision) syncFolderLabelFromHandle();
  // 页面被关掉之后后台自己跑完的那一轮：结果只写在 importDone 里
  if (areaName === "local" && changes.importDone && awaitingBackgroundImport) {
    const done = changes.importDone.newValue;
    if (done?.text && !done.acknowledged && (!done.at || done.at >= awaitingBackgroundImport)) {
      awaitingBackgroundImport = 0;
      importBusy = false;
      importPaused = false;
      disarmCancel();
      updateImportSelection();
      importStatus.classList.remove("error");
      if (done.failed) importStatus.classList.add("error");
      importStatus.textContent = done.text;
      showDoneDialog(done.text, done.failed);
      playImportSound({ failed: done.failed === true, summary: done.text });
    }
  }
  if (areaName === "local" && (changes.bcaImportResume || changes.importState)) {
    refreshImportResume().catch(() => {});
  }
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
      playImportSound(state);
    }
  }
  refreshStatus().catch(() => {});
});

/* ---------------- 4.5：语言切换（1.4.0 起主题只在设置页改） ---------------- */

// 语言名是各语言的自称、不翻译。这里只切选中态，绝不写 textContent：
// 写死文字会把切语言后的译文盖回中文。
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

/* 1.7.20（facet-ux P1-2）：角标只有一个写入口（后台的 clearActivityBadge），弹窗只能请求它清。
   收口在这里：只有「结果真的呈现出来了」才清 —— 打开了弹窗不等于看到了结果，
   结果可能还没落地（后台还在跑），也可能藏在默认收起的「最近状态」里。 */
function clearBadge() {
  try { chrome.runtime.sendMessage({ type: "bca-badge-clear" }).catch(() => {}); } catch (_) {}
}

async function clearBadgeIfSeen() {
  try {
    const saved = await chrome.storage.local.get("importDone");
    const done = saved?.importDone;
    // 还有一条没读过的完成/失败提示：角标留着，直到用户在对话框上点掉（见 dismissDoneDialog）
    if (done && !done.acknowledged && done.text) return;
  } catch (_) {
    return;
  }
  clearBadge();
}

/* 1.16.5：把上次的导入上限读回来，并在改动时记下 —— 只写 storage，不碰导入逻辑本身。 */
function restoreImportLimit() {
  chrome.storage.local.get(IMPORT_LIMIT_KEY).then((saved) => {
    const value = saved?.[IMPORT_LIMIT_KEY];
    if (value === undefined || value === null || !importLimitSelect) return;
    const text = String(value);
    const option = Array.from(importLimitSelect.options).find((item) => item.value === text);
    if (option) importLimitSelect.value = text;
  }).catch((error) => console.warn("导入上限没读出来（先按默认档）", error));
  importLimitSelect?.addEventListener("change", () => {
    chrome.storage.local.set({ [IMPORT_LIMIT_KEY]: selectedImportLimit() })
      .catch((error) => console.warn("导入上限没记住（下次打开会回到默认档）", error));
  });
}

async function boot() {
  // 1.7.20（facet-ux P1-2）：这里原来一打开弹窗就把角标灭掉，等于假定「打开了 = 看到了」。
  // 结果可能还没落地，也可能藏在默认收起的「最近状态」里 —— 灭掉之后用户既没提示、
  // 也没徽章，结果就进了无痕终态。改成在 boot 末尾按「是否还有未读结果」决定（clearBadgeIfSeen）。
  // 第一次渲染之前初始化，避免先闪一下中文。
  // 1.15.6（审查 C-12）：词典没取到不该让整个弹窗起不来 —— t() 会退回中文原文，
  // 界面上什么都没少，只是没翻译；这里必须继续往下走，不能把 boot 整个抛掉。
  try {
    await BcaI18n.init();
  } catch (error) {
    console.warn("词典没载入（先按中文原文显示）", error);
  }
  // 主题已经在 head 里由 theme.js 定好（弹窗不再提供主题切换，外观统一在设置页改）；
  // 这里只让语言控件反映现状并绑定切换
  renderLocaleOptions();
  for (const button of localeButtons) {
    button.addEventListener("click", () => { applyLocale(button.dataset.locale).catch(() => {}); });
  }
  refreshEnabledState().catch(() => renderEnabledState(true));
  restoreRecoverInvalid().catch(() => {});
  restoreImportLimit();
  loadImportFolders();
  refreshImportResume().catch(() => {});
  refreshStatus().catch((error) => {
    setLastResultText(error?.message ? BcaI18n.t(error.message) : BcaI18n.t("无法读取插件状态。"));
  });
  // 读回上次选择的速度（与 background.js 共用同一份 storage.local）。
  // 用 then 而不是 await —— 这块初始化代码不在 async 函数里。
  // 导入/更新的完成提示也要补弹：导入跑几分钟，弹窗早关了，不补就永远看不到
  chrome.storage.local.get("importDone").then((saved) => {
    const done = saved?.importDone;
    if (!done || done.acknowledged || !done.text) return;
    // 直接显示：这段文案在后台写入时就已经是最终文字（后台没有 i18n），
    // 而且 BcaI18n.t() 的键必须是字面量 —— 传变量会让"键必须是字面量"那条测试失败（已踩过四次）
    showDoneDialog(done.text, done.failed);
  }).catch(() => {});
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
      // 结果面板每次都恢复（还可以再看），但完成弹窗只弹一次 ——
      // 点过「知道了」之后再打开插件不该又冒出来
      renderDiffResult({ diffs: state.summary.folders, reportPath: state.summary.reportPath });
      if (!state.summary.acknowledged) {
        const folders = state.summary.folders || [];
        const total = (key) => folders.reduce((n, f) => n + (Number(f[key]) || 0), 0);
        showDoneDialog(BcaI18n.t("对比完成：新增 {added}、线上已移除 {removed}、新失效 {invalid}、恢复 {recovered}。",
          { added: total("added"), removed: total("removed"), invalid: total("newlyInvalid"), recovered: total("recovered") }));
      }
    }
  }).catch(() => {});
  chrome.storage.session.get("requestSpeed").then((saved) => {
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
  // 1.7.20（facet-ux P1-2）：所有补弹都排完队了，这时才知道结果到底呈现出来没有
  clearBadgeIfSeen();
}

boot().catch(() => {});
