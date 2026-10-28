"use strict";

// 1.9.0：回收站是独立页，同样不允许被嵌进 iframe（判据在 i18n.js）。
BcaI18n.guardTopFrame("回收站需要在独立标签页中打开，请不要把它嵌入其他页面。", "回收站不允许被嵌入其他页面。");

/* 回收站页（1.9.0）
 *
 * 数据面全部由 archive-tools.js 提供：listRecycled 读 005回收站 下的
 * <时间戳>/<收藏夹>/<记录目录>，restoreRecycled 挪回原收藏夹，deleteRecycled / purgeRecycler
 * 彻底删掉。本文件只负责：把一条回收站条目画成卡片、多选、把用户的选择交给上面三个动作。
 *
 * 卡片刻意**不能点开**：这里展示的是已经删掉的档案，点开没有可做的事；
 * 能做的只有「恢复」和「彻底删除」。因此整张卡片是选择开关，虚线框与提示语都写明这一点。
 */

const RECYCLE_SELECT_LIMIT = 200; // 一次最多操作这么多条，跟收藏库的批量上限一个量级
const COVER_HYDRATE_CONCURRENCY = 4;

const grid = document.getElementById("recycleGrid");
const emptyBox = document.getElementById("recycleEmpty");
const noRootBox = document.getElementById("recycleNoRoot");
const chooseRootButton = document.getElementById("recycleChooseRoot");
const summary = document.getElementById("recycleSummary");
const statusLine = document.getElementById("recycleStatus");
const errorLine = document.getElementById("recycleError");
const backButton = document.getElementById("recycleBack");
const selectAllButton = document.getElementById("recycleSelectAll");
const restoreButton = document.getElementById("recycleRestore");
const deleteButton = document.getElementById("recycleDeleteSelected");
const purgeButton = document.getElementById("recyclePurge");

const selectedPaths = new Set();
let entries = [];
let busy = false;
/* 1.10.13（R-2）：是否已经读到过回收站内容。false 时摘要保持隐藏，
   避免和状态行的「正在读取回收站…」重复同一句。 */
let summaryReady = false;
// 1.10.16（R-3）：没选文件夹时给不同的空态，别拿「回收站是空的」糊弄。
let rootMissing = false;
let coverUrls = [];

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function showStatus(text) {
  if (!statusLine || !errorLine) return;
  errorLine.textContent = "";
  errorLine.hidden = true;
  statusLine.textContent = text;
  statusLine.hidden = !text;
}

function showError(text) {
  if (!statusLine || !errorLine) return;
  statusLine.textContent = "";
  statusLine.hidden = true;
  errorLine.textContent = text;
  errorLine.hidden = !text;
}

function setBusy(next) {
  busy = next;
  for (const button of [selectAllButton, restoreButton, deleteButton, purgeButton]) {
    if (button) button.disabled = next;
  }
  if (!next) renderSelectionState();
}

function formatDeletedAt(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function entryKey(entry) {
  return entry.path;
}

function selectedEntries() {
  return entries.filter((entry) => selectedPaths.has(entryKey(entry)));
}

function renderSelectionState() {
  const count = selectedEntries().length;
  if (restoreButton) restoreButton.disabled = busy || count === 0;
  if (deleteButton) deleteButton.disabled = busy || count === 0;
  if (purgeButton) purgeButton.disabled = busy || entries.length === 0;
  if (selectAllButton) {
    selectAllButton.textContent = count > 0 && count === entries.length
      ? BcaI18n.t("取消全选")
      : BcaI18n.t("全选");
  }
}

function updateSummary() {
  if (!summary) return;
  /* 1.10.13（R-2）：读到数据之后摘要才有意义。读之前、读失败都保持隐藏，
     免得和状态行的「正在读取回收站…」重复（错误由 #recycleError 说）。 */
  if (!summaryReady) {
    summary.hidden = true;
    return;
  }
  summary.hidden = false;
  if (!entries.length) {
    summary.textContent = BcaI18n.t("回收站里现在是空的。");
    return;
  }
  const bytes = entries.reduce((total, entry) => total + Number(entry.record?.bytes || 0), 0);
  summary.textContent = BcaI18n.t("共 {count} 项，约 {size}；30 天后自动清理。", {
    count: BcaArchiveCore.formatCountText(entries.length),
    size: BcaArchiveTools.formatMegabytes(bytes)
  });
}

function coverMarkup(cover) {
  const url = String(cover || "");
  if (!/^(?:blob:|data:image\/)/i.test(url)) {
    return `<div class="cover-fallback" aria-hidden="true"></div>`;
  }
  return `<img src="${escapeHtml(url)}" alt="" loading="lazy">`;
}

function buildCard(entry) {
  const record = entry.record || null;
  const title = BcaArchiveTools.field(record?.info, "视频标题") || entry.directory;
  const upName = BcaArchiveTools.field(record?.info, "UP主昵称");
  const card = document.createElement("article");
  card.className = "video-card";
  card.setAttribute("role", "listitem");
  card.dataset.entryKey = entry.path;
  card.innerHTML = `<div class="card-cover">${coverMarkup("")}${record?.info && BcaArchiveTools.isInvalidRecord(record) ? `<span class="invalid-badge">${escapeHtml(BcaI18n.t("已失效"))}</span>` : ""}<span class="cover-badge"></span><input class="card-select" type="checkbox" aria-label="${escapeHtml(BcaI18n.t("选择这条记录"))}"></div><div class="card-body"><div class="card-title"></div><div class="card-meta"><span class="card-up"></span><span class="card-date tnum"></span></div><div class="card-deleted"></div></div>`;
  card.querySelector(".cover-badge").textContent = entry.collection;
  card.querySelector(".card-title").textContent = title;
  card.querySelector(".card-up").textContent = upName || BcaI18n.t("UP 主未知");
  card.querySelector(".card-date").textContent = formatDeletedAt(entry.deletedAt);
  card.querySelector(".card-deleted").textContent = BcaI18n.t("删于 {path}", { path: entry.path.replace(/^005回收站\//, "") });
  const checkbox = card.querySelector(".card-select");
  checkbox.checked = selectedPaths.has(entryKey(entry));
  checkbox.addEventListener("click", (event) => event.stopPropagation());
  checkbox.addEventListener("change", () => toggleEntry(entry, checkbox.checked));
  card.addEventListener("click", () => toggleEntry(entry, !selectedPaths.has(entryKey(entry))));
  // 不可点开，但键盘仍然要能多选：Space/Enter 切换选择。
  card.tabIndex = 0;
  card.addEventListener("keydown", (event) => {
    if (event.target !== card) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    toggleEntry(entry, !selectedPaths.has(entryKey(entry)));
  });
  return card;
}

function toggleEntry(entry, selected) {
  const key = entryKey(entry);
  if (selected) {
    if (selectedPaths.size >= RECYCLE_SELECT_LIMIT) {
      showError(BcaI18n.t("一次最多操作 {count} 条，先取消一些再选。", { count: String(RECYCLE_SELECT_LIMIT) }));
      return;
    }
    selectedPaths.add(key);
  } else {
    selectedPaths.delete(key);
  }
  const card = grid?.querySelector(`[data-entry-key="${CSS.escape(key)}"]`);
  if (card) {
    card.classList.toggle("selected", selected);
    const checkbox = card.querySelector(".card-select");
    if (checkbox) checkbox.checked = selected;
  }
  renderSelectionState();
}

function releaseCovers() {
  for (const url of coverUrls) {
    try {
      URL.revokeObjectURL(url);
    } catch (_) {
      // 释放失败没有副作用，下一次加载还会重建
    }
  }
  coverUrls = [];
}

/* 封面是懒读的：listRecycled 只给出 coverEntry 句柄，等卡片真出现在页面上再取 Blob。
   一次最多 4 个并发，避免几百条回收站记录同时打开文件。 */
async function hydrateCovers() {
  const targets = entries.filter((entry) => entry.record?.coverEntry);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(COVER_HYDRATE_CONCURRENCY, targets.length) }, async () => {
    while (cursor < targets.length) {
      const index = cursor;
      cursor += 1;
      const entry = targets[index];
      try {
        const file = await entry.record.coverEntry.getFile();
        const url = URL.createObjectURL(file);
        coverUrls.push(url);
        const card = grid?.querySelector(`[data-entry-key="${CSS.escape(entryKey(entry))}"] .card-cover`);
        if (card) card.innerHTML = `<div class="cover-fallback" aria-hidden="true"></div>`.replace(/<div class="cover-fallback" aria-hidden="true"><\/div>/, coverMarkup(url));
      } catch (error) {
        console.warn("回收站里的封面读不出来（用占位图代替）", error);
      }
    }
  });
  await Promise.all(runners);
}

function renderEntries() {
  releaseCovers();
  if (!grid) return;
  grid.replaceChildren();
  for (const entry of entries) grid.appendChild(buildCard(entry));
  if (emptyBox) emptyBox.hidden = entries.length > 0 || rootMissing;
  if (noRootBox) noRootBox.hidden = !rootMissing;
  updateSummary();
  renderSelectionState();
  hydrateCovers();
}

/* 1.17.14（审查 P3-5）：回收站也会真动归档目录 —— 恢复是把记录挪回收藏夹，彻底删除是删目录。
   可它既不看 archiveWriteLock、也不立锁：导入跑到一半点「恢复」，最坏会恢复进一个正在被扫描的
   收藏夹。这里让回收站也领一把 { kind: "recycle" }：先查别人、再立自己、跑完放掉。
   下面三个函数与 library.js 里的同名实现**逐字相同**（回收站页没法 import 收藏库那份），
   stability 有一条断言把两份文本比着钉住 —— 改一边就必须改另一边。 */
const ARCHIVE_WRITE_LOCK_KEY = "archiveWriteLock";
// 超过这个岁数的锁当作陈旧遗留（浏览器/页面崩在写入中间），不能把人永久挡在门外
const ARCHIVE_WRITE_LOCK_MAX_AGE_MS = 30 * 60 * 1000;

async function setArchiveWriteLock(kind) {
  try {
    await chrome.storage.session.set({ [ARCHIVE_WRITE_LOCK_KEY]: { kind, since: Date.now() } });
  } catch (error) {
    // 锁没立起来：这一次的跨上下文互斥退化成「各写各的」，统计库可能留下对不上的行。
    console.warn("归档写锁没立起来（这一次的跨上下文互斥失效）", error);
  }
}

// 只清自己那一把：别人后写进来的锁不能被顺手抹掉
async function clearArchiveWriteLock(kind) {
  try {
    const saved = await chrome.storage.session.get(ARCHIVE_WRITE_LOCK_KEY);
    const lock = saved?.[ARCHIVE_WRITE_LOCK_KEY];
    if (!lock || !kind || lock.kind === kind) await chrome.storage.session.remove(ARCHIVE_WRITE_LOCK_KEY);
  } catch (error) {
    // 没清掉：这把锁会挡下一次操作，30 分钟后才算陈旧遗留自动失效。
    console.warn("归档写锁没清掉（下一轮操作可能被它挡住，30 分钟后才自动失效）", error);
  }
}

async function archiveWriteLockHeldByOthers(kind) {
  try {
    const saved = await chrome.storage.session.get(ARCHIVE_WRITE_LOCK_KEY);
    const lock = saved?.[ARCHIVE_WRITE_LOCK_KEY];
    if (!lock || lock.kind === kind) return "";
    return Date.now() - Number(lock.since || 0) < ARCHIVE_WRITE_LOCK_MAX_AGE_MS ? String(lock.kind || "") : "";
  } catch (_) { return ""; }
}

// 闸门被别人占着时怎么说：说清是谁在忙（其余情况按收藏库兜底）
function recycleLockBusyMessage(holder) {
  if (holder === "import") return BcaI18n.t("正在导入收藏夹，等导入结束再动回收站。");
  if (holder === "save") return BcaI18n.t("后台正在保存一条收藏，等它做完再动回收站。");
  return BcaI18n.t("收藏库正在改动归档（删除 / 搬运 / 新建目录），等它做完再动回收站。");
}

// 先查别人、再立自己（setArchiveWriteLock 是无条件覆写，立完再查就查不到别人了）
async function claimRecycleWriteLock() {
  const holder = await archiveWriteLockHeldByOthers("recycle");
  if (holder) throw new Error(recycleLockBusyMessage(holder));
  await setArchiveWriteLock("recycle");
}

// 无论成败都放掉；只清自己那一把（clearArchiveWriteLock 内部比 kind）
async function releaseRecycleWriteLock() {
  await clearArchiveWriteLock("recycle");
}

async function loadRoot() {
  const handle = await BcaArchiveTools.loadRootHandle();
  if (!handle) {
    // 1.10.16（R-3）：标记一下，好让空态知道「是没选文件夹」而不是「回收站真的是空的」。
    const error = new Error(BcaI18n.t("先选一个本地备份文件夹，再打开回收站。"));
    error.noRoot = true;
    throw error;
  }
  const granted = await BcaArchiveTools.ensureRootPermission(handle, "readwrite");
  if (!granted) throw new Error(BcaI18n.t("没有获得本地备份文件夹的写入权限。"));
  return handle;
}

async function reload() {
  try {
    summaryReady = false;
    showStatus(BcaI18n.t("正在读取回收站…"));
    const handle = await loadRoot();
    entries = await BcaArchiveTools.listRecycled(handle);
    rootMissing = false;
    summaryReady = true;
    for (const entry of [...selectedPaths]) {
      if (!entries.some((item) => entryKey(item) === entry)) selectedPaths.delete(entry);
    }
    renderEntries();
    showStatus("");
  } catch (error) {
    entries = [];
    selectedPaths.clear();
    rootMissing = error?.noRoot === true;
    summaryReady = false;
    if (summary) summary.hidden = true;
    renderEntries();
    if (rootMissing) {
      // 还没选文件夹不是「出错」，是一步还没做的事；空态里已经写清楚下一步，
      // 再顶一条红字只会让人以为回收站坏了。
      showStatus("");
      return;
    }
    showError(BcaI18n.t("读回收站失败：{message}", { message: error?.message || BcaI18n.t("未知错误") }));
  }
}

async function restoreSelected() {
  const chosen = selectedEntries();
  if (!chosen.length || busy) return;
  try {
    setBusy(true);
    showStatus(BcaI18n.t("正在恢复 {count} 项…", { count: String(chosen.length) }));
    await claimRecycleWriteLock();
    const handle = await loadRoot();
    const result = await BcaArchiveTools.restoreRecycled(handle, chosen, (entry) => {
      showStatus(BcaI18n.t("恢复到「{collection}/{directory}」…", { collection: entry.collection, directory: entry.directory }));
    });
    selectedPaths.clear();
    await reload();
    if (result.failures.length) {
      showError(BcaI18n.t("恢复了 {done} 项，{failed} 项没恢复：{detail}", {
        done: String(result.restored.length),
        failed: String(result.failures.length),
        detail: BcaArchiveTools.reportListLine(result.failures).join(" ")
      }));
    } else {
      showStatus(BcaI18n.t("已恢复 {count} 项，放回原来的收藏夹。", { count: String(result.restored.length) }));
    }
  } catch (error) {
    showError(BcaI18n.t("恢复失败：{message}", { message: error?.message || BcaI18n.t("未知错误") }));
  } finally {
    setBusy(false);
    await releaseRecycleWriteLock();
  }
}

async function deleteSelected() {
  const chosen = selectedEntries();
  if (!chosen.length || busy) return;
  const ok = window.confirm(BcaI18n.t("这次操作不可逆：会把选中的 {count} 项彻底删掉，不会进系统回收站，也找不回来。确定吗？", {
    count: String(chosen.length)
  }));
  if (!ok) return;
  try {
    setBusy(true);
    showStatus(BcaI18n.t("正在彻底删除 {count} 项…", { count: String(chosen.length) }));
    await claimRecycleWriteLock();
    const handle = await loadRoot();
    const result = await BcaArchiveTools.deleteRecycled(handle, chosen, (entry) => {
      showStatus(BcaI18n.t("彻底删除「{collection}/{directory}」…", { collection: entry.collection, directory: entry.directory }));
    });
    selectedPaths.clear();
    await reload();
    if (result.failures.length) {
      showError(BcaI18n.t("删掉了 {done} 项，{failed} 项没删掉：{detail}", {
        done: String(result.removed),
        failed: String(result.failures.length),
        detail: BcaArchiveTools.reportListLine(result.failures).join(" ")
      }));
    } else {
      showStatus(BcaI18n.t("已彻底删除 {count} 项。", { count: String(result.removed) }));
    }
  } catch (error) {
    showError(BcaI18n.t("彻底删除失败：{message}", { message: error?.message || BcaI18n.t("未知错误") }));
  } finally {
    setBusy(false);
    await releaseRecycleWriteLock();
  }
}

async function purgeAll() {
  if (busy || !entries.length) return;
  const ok = window.confirm(BcaI18n.t("这次操作不可逆：会把回收站里的 {count} 项全部彻底删掉，不会进系统回收站，也找不回来。确定吗？", {
    count: String(entries.length)
  }));
  if (!ok) return;
  try {
    setBusy(true);
    showStatus(BcaI18n.t("正在清空回收站…"));
    await claimRecycleWriteLock();
    const handle = await loadRoot();
    const result = await BcaArchiveTools.purgeRecycler(handle);
    selectedPaths.clear();
    await reload();
    if (result.failures.length) {
      showError(BcaI18n.t("清空了 {done} 项，{failed} 项没删掉：{detail}", {
        done: String(result.removed),
        failed: String(result.failures.length),
        detail: BcaArchiveTools.reportListLine(result.failures).join(" ")
      }));
    } else {
      showStatus(BcaI18n.t("已清空回收站，彻底删掉 {count} 项。", { count: String(result.removed) }));
    }
  } catch (error) {
    showError(BcaI18n.t("清空回收站失败：{message}", { message: error?.message || BcaI18n.t("未知错误") }));
  } finally {
    setBusy(false);
    await releaseRecycleWriteLock();
  }
}

function goLibrary() {
  try {
    chrome.tabs.getCurrent((tab) => {
      if (tab && tab.id !== undefined) {
        chrome.tabs.update(tab.id, { url: chrome.runtime.getURL("library.html") });
        return;
      }
      window.location.href = chrome.runtime.getURL("library.html");
    });
  } catch (_) {
    window.location.href = "library.html";
  }
}

function goBack() {
  try {
    chrome.tabs.getCurrent((tab) => {
      if (tab && tab.id !== undefined) {
        chrome.tabs.update(tab.id, { url: chrome.runtime.getURL("settings.html") });
        return;
      }
      window.location.href = chrome.runtime.getURL("settings.html");
    });
  } catch (_) {
    window.location.href = "settings.html";
  }
}

backButton?.addEventListener("click", goBack);
chooseRootButton?.addEventListener("click", goLibrary);
selectAllButton?.addEventListener("click", () => {
  if (selectedPaths.size === entries.length) {
    selectedPaths.clear();
    for (const entry of entries) selectedPaths.delete(entryKey(entry));
  } else {
    selectedPaths.clear();
    for (const entry of entries) selectedPaths.add(entryKey(entry));
  }
  for (const card of grid?.querySelectorAll(".video-card") || []) {
    const selected = selectedPaths.has(card.dataset.entryKey);
    card.classList.toggle("selected", selected);
    const checkbox = card.querySelector(".card-select");
    if (checkbox) checkbox.checked = selected;
  }
  renderSelectionState();
});
restoreButton?.addEventListener("click", restoreSelected);
deleteButton?.addEventListener("click", deleteSelected);
purgeButton?.addEventListener("click", purgeAll);
window.addEventListener("pagehide", releaseCovers);

// pages.test 要能直接驱动这几条（不让测试点系统 confirm）。
globalThis.BcaRecycle = Object.freeze({
  reload,
  restoreSelected,
  deleteSelected,
  purgeAll,
  entryKey,
  selectedEntries
});

reload();
