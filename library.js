const DB_NAME = "bili-fav-archiver";
const DB_STORE = "settings";

// 4.3 安全加固：本地收藏库不应被任何页面嵌套。
// 虽然已从 manifest 移除 web_accessible_resources，这里再做一层兜底，
// 避免将来有人重新开放它时被点击劫持（在透明 iframe 上盖诱导按钮）。
if (window.top !== window.self) {
  document.body.textContent = BcaI18n.t("本地收藏库需要在独立标签页中打开，请不要把它嵌入其他页面。");
  throw new Error(BcaI18n.t("本地收藏库不允许被嵌入其他页面。"));
}

const collectionList = document.getElementById("collectionList");
const collectionTotal = document.getElementById("collectionTotal");
const rootLabel = document.getElementById("rootLabel");
const storageUsage = document.getElementById("storageUsage");
const statusDot = document.querySelector(".status-dot");
const chooseRoot = document.getElementById("chooseRoot");
const refreshLibraryButton = document.getElementById("refreshLibrary");
const welcomeChoose = document.getElementById("welcomeChoose");
const welcome = document.getElementById("welcome");
const welcomeCopy = document.querySelector(".welcome-copy");
const welcomeFootnote = document.querySelector(".welcome-footnote");
const library = document.getElementById("library");
const currentCollection = document.getElementById("currentCollection");
const pageTitle = document.getElementById("pageTitle");
const resultSummary = document.getElementById("resultSummary");
const scanNotice = document.getElementById("scanNotice");
const importHint = document.getElementById("importHint");
const dismissImportHintButton = document.getElementById("dismissImportHint");
const scanProgress = document.getElementById("scanProgress");
const videoPager = document.getElementById("videoPager");
const viewGridButton = document.getElementById("viewGrid");
const viewListButton = document.getElementById("viewList");

const safetyNotice = document.getElementById("safetyNotice");
const videoGrid = document.getElementById("videoGrid");
const searchInput = document.getElementById("searchInput");
const sortSelect = document.getElementById("sortSelect");
const themeSelect = document.getElementById("themeSelect");
const localeSelect = document.getElementById("localeSelect");
const emptySearch = document.getElementById("emptySearch");
const clearSearch = document.getElementById("clearSearch");
const detailBackdrop = document.getElementById("detailBackdrop");
const detailPanel = document.getElementById("detailPanel");
const detailContent = document.getElementById("detailContent");
const closeDetailButton = document.getElementById("closeDetail");
const confirmBackdrop = document.getElementById("confirmBackdrop");
const confirmTitle = document.getElementById("confirmTitle");
const confirmMessage = document.getElementById("confirmMessage");
const deleteDownloadsOption = document.getElementById("deleteDownloadsOption");
const deleteAssociatedDownloads = document.getElementById("deleteAssociatedDownloads");
const cancelDeleteButton = document.getElementById("cancelDelete");
const confirmDeleteButton = document.getElementById("confirmDelete");
const toast = document.getElementById("toast");
const createCollectionButton = document.getElementById("createCollection");
const addVideoButton = document.getElementById("addVideo");
const collectionDialog = document.getElementById("collectionDialog");
const collectionForm = document.getElementById("collectionForm");
const collectionNameInput = document.getElementById("collectionName");
const cancelCreateCollectionButton = document.getElementById("cancelCreateCollection");
const submitCreateCollectionButton = document.getElementById("submitCreateCollection");
const videoDialog = document.getElementById("videoDialog");
const videoForm = document.getElementById("videoForm");
const videoIdentifierInput = document.getElementById("videoIdentifier");
const videoTargetOptions = document.getElementById("videoTargetOptions");
const cancelAddVideoButton = document.getElementById("cancelAddVideo");
const submitAddVideoButton = document.getElementById("submitAddVideo");
const collectionActionDialog = document.getElementById("collectionActionDialog");
const collectionActionTitle = document.getElementById("collectionActionTitle");
const collectionActionSummary = document.getElementById("collectionActionSummary");
const collectionActionList = document.getElementById("collectionActionList");
const collectionActionCount = document.getElementById("collectionActionCount");
const cancelCollectionActionButton = document.getElementById("cancelCollectionAction");
const confirmCollectionActionButton = document.getElementById("confirmCollectionAction");
const selectAllActionTargetsButton = document.getElementById("selectAllActionTargets");
const clearActionTargetsButton = document.getElementById("clearActionTargets");
const videoFilterSelect = document.getElementById("videoFilter");
const batchManageButton = document.getElementById("batchManage");
const batchToolbar = document.getElementById("batchToolbar");
const selectedCount = document.getElementById("selectedCount");
const selectVisibleButton = document.getElementById("selectVisible");
const exitBatchButton = document.getElementById("exitBatch");
const moveSelectedButton = document.getElementById("moveSelected");
const downloadSelectedButton = document.getElementById("downloadSelected");
const deleteSelectedButton = document.getElementById("deleteSelected");

let rootHandle = null;
let collections = [];
let selectedCollection = "*";
let coverUrls = [];
let toastTimer = 0;
let pendingDeleteAction = null;
let deleteInProgress = false;
let collectionCreateInProgress = false;
let videoAddInProgress = false;
let selectionMode = false;
let videoFilter = "all";
let selectedVideoIds = new Set();
let visibleVideoIds = [];
let pendingCollectionAction = null;
let collectionOrder = [];
let draggedCollectionName = "";
let downloadStatusCheckRunning = false;
let lastSelectedVideoId = "";
// 分页与视图（4.1）：默认每页 24 个，网格显示；两项都会记住
const PAGE_SIZES = [24, 48, 96];
let pageSize = PAGE_SIZES[0];
let currentPage = 1;
let pageCount = 1;
let viewMode = "grid";
let statusRefreshInProgress = false;
// 顶部“本地收藏夹占用”的递归统计状态：防止重复并发扫描，只保留最后一次请求的根目录
let storageUsageRunning = false;
let storageUsageQueuedRoot = null;

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(DB_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error(BcaI18n.t("无法读取已保存的目录设置。")));
  });
}

async function saveHandle(handle) {
  const db = await openDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      tx.objectStore(DB_STORE).put(handle, "rootHandle");
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error(BcaI18n.t("保存目录授权失败。")));
    });
  } finally { db.close(); }
}

async function loadSavedHandle() {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(DB_STORE, "readonly").objectStore(DB_STORE).get("rootHandle");
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error(BcaI18n.t("无法读取上次选择的目录。")));
    });
  } finally { db.close(); }
}

async function readSavedSetting(key) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(DB_STORE, "readonly").objectStore(DB_STORE).get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error(BcaI18n.t("无法读取本地目录设置。")));
    });
  } finally { db.close(); }
}

// 这些纯函数放在 archive-core.js，可以直接单元测试
const parseInfo = BcaArchiveCore.parseInfoFile;
const descriptionFromInfo = BcaArchiveCore.descriptionFromInfo;
const tagsFromInfo = BcaArchiveCore.tagsFromInfo;
const pageSequence = BcaArchiveCore.pageSequence;

async function optionalFileHandle(directory, name) {
  try { return await directory.getFileHandle(name); }
  catch (error) {
    if (error?.name === "NotFoundError") return null;
    throw error;
  }
}

async function readCover(fileHandle) {
  const url = URL.createObjectURL(await fileHandle.getFile());
  coverUrls.push(url);
  return url;
}

function field(info, key) { return info.fields[key] || ""; }

// “未知 / 无 / -”这类占位值等于没有数据，不能当成内容显示
function realField(info, key) {
  const value = field(info, key);
  return value && !BcaArchiveCore.isPlaceholderValue(value) ? value : "";
}

/* ---------------- 4.2：互动数据与分享文案 ---------------- */

// 「【互动数据】播放量：73798」这类字段名 → video.stats 的键
const STAT_FIELDS = {
  view: "播放量",
  danmaku: "弹幕量",
  like: "点赞数",
  coin: "投硬币枚数",
  favorite: "收藏人数",
  share: "转发人数"
};

// 详情卡片上短标签的键顺序，与 STAT_FIELDS 一致。
// 文案本体写在 detailStatsHtml() 的 t("...") 里：key 必须是字面量，词条工具才扫得到。
const STAT_LABEL_KEYS = ["view", "danmaku", "like", "coin", "favorite", "share"];

// 老档案的简介里混着 B 站分享文案（“<简介>, 视频播放量 71953、弹幕量 82、…, 相关视频：…”）。
// 展示前交给 archive-core.js 砍掉分享文案，顺便用它解析出的统计给老档案兜底；
// 4.2 起写入的【互动数据】区块优先级更高（见 statsFromInfo）。
function splitInfoDescription(info) {
  const raw = descriptionFromInfo(info);
  const split = BcaArchiveCore.splitShareText?.(raw);
  return { description: split?.description ?? raw, stats: split?.stats || {} };
}

function statsFromInfo(info, fallbackStats = {}) {
  const stats = {};
  for (const [key, label] of Object.entries(STAT_FIELDS)) {
    const value = realField(info, label) || String(fallbackStats[key] || "");
    if (value) stats[key] = value;
  }
  return stats;
}

async function inspectDownloadDirectory(directory) {
  const result = { hasFiles: false, hasMedia: false };
  for await (const entry of directory.values()) {
    if (entry.kind === "file") {
      result.hasFiles = true;
      result.hasMedia ||= BcaArchiveCore.isMediaFileName(entry.name);
    } else if (entry.kind === "directory") {
      const child = await inspectDownloadDirectory(entry);
      result.hasFiles ||= child.hasFiles;
      result.hasMedia ||= child.hasMedia;
    }
  }
  return result;
}

async function getDownloadParentHandle(archiveRoot) {
  const mode = await readSavedSetting("downloadFolderMode");
  const savedCustom = await readSavedSetting("downloadFolder");
  const isCustom = mode === "custom" || (!mode && Boolean(savedCustom));
  if (isCustom) return savedCustom;
  try { return await archiveRoot.getDirectoryHandle("000视频下载"); }
  catch (error) {
    if (error?.name === "NotFoundError") return null;
    throw error;
  }
}

function keepBestDownloadMatch(index, key, candidate) {
  const current = index.get(key);
  if (!current || (!current.hasMedia && candidate.hasMedia) || (!current.hasFiles && candidate.hasFiles)) index.set(key, candidate);
}

async function scanDownloadedDirectories(archiveRoot) {
  let parent;
  try { parent = await getDownloadParentHandle(archiveRoot); }
  catch (_) { return null; }
  if (!parent) return new Map();
  try {
    const permission = await parent.queryPermission({ mode: "read" });
    if (permission !== "granted") return null;
    const index = new Map();
    for await (const collection of parent.values()) {
      if (collection.kind !== "directory") continue;
      for await (const entry of collection.values()) {
        if (entry.kind !== "directory") continue;
        const identifiers = BcaArchiveCore.identifiersFromDirectoryName(entry.name);
        const contents = await inspectDownloadDirectory(entry);
        if (!identifiers.size || !contents.hasFiles) continue;
        for (const identifier of identifiers) {
          const match = { name: entry.name, collectionName: collection.name, handle: entry, hasFiles: contents.hasFiles, hasMedia: contents.hasMedia };
          keepBestDownloadMatch(index, BcaArchiveCore.downloadIndexKey(collection.name, identifier), match);
          // Older 3.5 downloads lost their source collection and were written under this folder.
          if (collection.name === "未分类收藏") keepBestDownloadMatch(index, `legacy\u0000${identifier}`, match);
        }
      }
    }
    return index;
  } catch (_) { return null; }
}

function matchDownloadedDirectory(video, index) {
  return BcaArchiveCore.findDownloadMatch(video.collection || "", videoIdentifierKeys(video), index);
}

async function scanRoot(handle, preserveDownloadStatuses = true) {
  const scanned = [];
  const issues = [];
  const downloadIndex = await scanDownloadedDirectories(handle);
  const previousVideos = new Map(preserveDownloadStatuses ? allVideos().map((video) => [video.id, video]) : []);
  const timestampPattern = /^\d{4}年\d{1,2}月\d{1,2}日\d{1,2}时\d{1,2}分\d{1,2}秒(?:_\d+)?$/;
  for await (const collectionEntry of handle.values()) {
    if (collectionEntry.kind !== "directory" || ["错误报告", "001错误报告", "视频下载", "000视频下载"].includes(collectionEntry.name)) continue;
    const videos = [];
    for await (const recordEntry of collectionEntry.values()) {
      if (recordEntry.kind !== "directory" || !timestampPattern.test(recordEntry.name)) continue;
      try {
        const infoHandle = await optionalFileHandle(recordEntry, "视频信息.txt");
        const coverHandle = await optionalFileHandle(recordEntry, "封面.png");
        if (!infoHandle || !coverHandle) continue;
        const raw = await (await infoHandle.getFile()).text();
        if (!raw.includes("【基本信息】")) continue;
        const info = parseInfo(raw);
        if (!field(info, "视频标题")) continue;
        const share = splitInfoDescription(info);
        const cover = await readCover(coverHandle);
        const url = field(info, "视频链接");
        const title = field(info, "视频标题") || recordEntry.name;
        const date = field(info, "视频收藏时间") || recordEntry.name;
        const bvid = field(info, "BV号");
        const aid = field(info, "av号");
        const id = `${collectionEntry.name}/${recordEntry.name}`;
        const previous = previousVideos.get(id);
        const downloadState = BcaArchiveCore.downloadStateFromIndex(collectionEntry.name, videoIdentifierKeys({ bvid, aid }), downloadIndex, previous);
        videos.push({
          id,
          collection: collectionEntry.name,
          directory: recordEntry.name,
          title,
          url: /^https?:\/\//i.test(url) ? url : "",
          bvid,
          aid,
          downloaded: downloadState.downloaded,
          hasDownloadFiles: downloadState.hasFiles,
          downloadDirectoryName: downloadState.name,
          downloadCollectionName: downloadState.collectionName,
          downloadDirectoryHandle: downloadState.handle,
          isInvalid: /失效/.test(field(info, "视频状态")) || ["已失效视频", "该视频已失效"].includes(title),
          upName: field(info, "UP主昵称"),
          upMid: field(info, "UP主UID"),
          upHome: field(info, "UP主主页"),
          upFans: realField(info, "UP主粉丝数"),
          favoriteAt: date,
          savedAt: field(info, "信息保存于"),
          timestamp: parseDate(date, recordEntry.name),
          category: field(info, "分区"),
          duration: field(info, "视频时长"),
          publishDate: field(info, "视频发布时间"),
          description: share.description,
          stats: statsFromInfo(info, share.stats),
          tags: tagsFromInfo(info),
          info,
          cover
        });
      } catch (error) {
        issues.push(`${collectionEntry.name}/${recordEntry.name}：${error.message || BcaI18n.t("读取失败")}`);
      }
    }
    videos.sort((a, b) => b.timestamp - a.timestamp);
    scanned.push({ name: collectionEntry.name, videos });
  }
  scanned.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  return { collections: scanned, issues };
}

function parseDate(value, fallback) {
  const text = `${value} ${fallback}`;
  const match = text.match(/(\d{4})年(\d{1,2})月(\d{1,2})日(?:\s*(\d{1,2})时(\d{1,2})分(\d{1,2})秒)?/);
  if (match) return new Date(+match[1], +match[2] - 1, +match[3], +(match[4] || 0), +(match[5] || 0), +(match[6] || 0)).getTime();
  const fallbackMatch = fallback.match(/(\d{4})-(\d{2})-(\d{2})[T_ ]?(\d{2})?-?(\d{2})?-?(\d{2})?/);
  return fallbackMatch ? new Date(+fallbackMatch[1], +fallbackMatch[2] - 1, +fallbackMatch[3], +(fallbackMatch[4] || 0), +(fallbackMatch[5] || 0), +(fallbackMatch[6] || 0)).getTime() : 0;
}

function allVideos() { return collections.flatMap((collection) => collection.videos); }
function selectedVideos() { return selectedCollection === "*" ? allVideos() : collections.find((item) => item.name === selectedCollection)?.videos || []; }

const LIBRARY_BV_TABLE = "FcwAPNKTMug3GV5Lj7EJnHpWsx4tb8haYeviqBz6rkCy12mUSDQX9RdoZf";
function libraryBvidToAid(bvid) {
  const text = String(bvid || "").trim();
  if (!/^BV[0-9A-Za-z]{10}$/.test(text)) return "";
  const chars = text.split("");
  [chars[3], chars[9]] = [chars[9], chars[3]];
  [chars[4], chars[7]] = [chars[7], chars[4]];
  let value = 0n;
  for (const char of chars.slice(3, 11)) {
    const digit = LIBRARY_BV_TABLE.indexOf(char);
    if (digit < 0) return "";
    value = value * 58n + BigInt(digit);
  }
  return String((value & 2251799813685247n) ^ 23442827791579n);
}

function videoIdentifierKeys(video) {
  const bvid = String(video?.bvid || "").trim();
  const aid = String(video?.aid || "").trim().replace(/^av/i, "") || libraryBvidToAid(bvid);
  return new Set([bvid && bvid !== "未知" ? `bvid:${bvid}` : "", aid && aid !== "未知" ? `aid:${aid}` : ""].filter(Boolean));
}

function identifiersOverlap(left, right) {
  for (const key of right) if (left.has(key)) return true;
  return false;
}

function selectedTargetNames(container) {
  return [...container.querySelectorAll('input[type="checkbox"]:checked')].map((input) => input.value);
}

function renderTargetChoices(container, chosenNames = []) {
  const chosen = new Set(chosenNames);
  const labels = collections.map((collection) => {
    const label = document.createElement("label");
    label.className = "target-checkbox-option";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = collection.name;
    checkbox.checked = chosen.has(collection.name);
    const name = document.createElement("span");
    name.textContent = collection.name;
    label.append(checkbox, name);
    return label;
  });
  container.replaceChildren(...labels);
}

function installCollectionDrag(wrapper, name) {
  wrapper.draggable = true;
  wrapper.dataset.collectionName = name;
  wrapper.addEventListener("dragstart", (event) => {
    if (event.target.closest(".collection-delete")) { event.preventDefault(); return; }
    draggedCollectionName = name;
    wrapper.classList.add("dragging");
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", name);
    }
  });
  wrapper.addEventListener("dragover", (event) => {
    if (!draggedCollectionName || draggedCollectionName === name) return;
    event.preventDefault();
    const after = isDroppedAfter(event, wrapper);
    wrapper.classList.toggle("drop-after", after);
    wrapper.classList.toggle("drop-before", !after);
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
  });
  wrapper.addEventListener("dragleave", () => wrapper.classList.remove("drop-before", "drop-after"));
  wrapper.addEventListener("drop", (event) => {
    if (!draggedCollectionName || draggedCollectionName === name) return;
    event.preventDefault();
    const after = isDroppedAfter(event, wrapper);
    reorderCollection(draggedCollectionName, name, after);
  });
  wrapper.addEventListener("dragend", clearCollectionDragStyles);
}

function isDroppedAfter(event, wrapper) {
  const rect = wrapper.getBoundingClientRect();
  if (getComputedStyle(collectionList).display === "flex") return event.clientX > rect.left + rect.width / 2;
  return event.clientY > rect.top + rect.height / 2;
}

function clearCollectionDragStyles() {
  draggedCollectionName = "";
  collectionList.querySelectorAll(".collection-row").forEach((row) => row.classList.remove("dragging", "drop-before", "drop-after"));
}

function reorderCollection(sourceName, targetName, afterTarget) {
  const reordered = [...collections];
  const sourceIndex = reordered.findIndex((collection) => collection.name === sourceName);
  if (sourceIndex < 0) return clearCollectionDragStyles();
  const [source] = reordered.splice(sourceIndex, 1);
  const targetIndex = reordered.findIndex((collection) => collection.name === targetName);
  if (targetIndex < 0) return clearCollectionDragStyles();
  reordered.splice(targetIndex + (afterTarget ? 1 : 0), 0, source);
  collections = reordered;
  collectionOrder = collections.map((collection) => collection.name);
  clearCollectionDragStyles();
  renderCollections();
  chrome.storage.local.set({ collectionOrder }).then(() => showToast(BcaI18n.t("收藏夹顺序已保存"))).catch((error) => showToast(BcaI18n.t("保存排序失败：{message}", { message: error?.message || BcaI18n.t("插件存储不可用") })));
}

function applyCollectionOrder(items) {
  const orderIndex = new Map(collectionOrder.map((name, index) => [name, index]));
  items.sort((left, right) => {
    const leftIndex = orderIndex.has(left.name) ? orderIndex.get(left.name) : Number.MAX_SAFE_INTEGER;
    const rightIndex = orderIndex.has(right.name) ? orderIndex.get(right.name) : Number.MAX_SAFE_INTEGER;
    return leftIndex - rightIndex || left.name.localeCompare(right.name, "zh-CN");
  });
  collectionOrder = items.map((collection) => collection.name);
  return items;
}

async function restoreCollectionOrder() {
  const saved = await chrome.storage.local.get("collectionOrder");
  collectionOrder = Array.isArray(saved.collectionOrder) ? saved.collectionOrder.filter((name) => typeof name === "string") : [];
}

function renderCollections() {
  const total = allVideos().length;
  collectionTotal.textContent = String(collections.length);
  const rows = [{ name: BcaI18n.t("全部收藏"), key: "*", count: total, glyph: "library" }, ...collections.map((item) => ({ name: item.name, key: item.name, count: item.videos.length, glyph: "collection" }))];
  collectionList.replaceChildren(...rows.map((row) => {
    const wrapper = document.createElement("div");
    wrapper.className = "collection-row";
    const button = document.createElement("button");
    button.className = `collection-button${selectedCollection === row.key ? " active" : ""}`;
    button.type = "button";
    button.setAttribute("aria-current", selectedCollection === row.key ? "page" : "false");
    button.innerHTML = `<span class="collection-glyph" aria-hidden="true">${BcaIcons.svg(row.glyph)}</span><span class="collection-name"></span>${row.key === "*" ? "" : `<span class="collection-drag-handle" title="${escapeHtml(BcaI18n.t("按住拖动调整顺序"))}" aria-hidden="true">${BcaIcons.svg("grip")}</span>`}<span class="collection-count tnum">${row.count}</span>`;
    button.querySelector(".collection-name").textContent = row.name;
    button.addEventListener("click", () => {
      if (selectedCollection !== row.key) selectedVideoIds.clear();
      selectedCollection = row.key;
      resetPaging();
      closeDetail();
      renderCollections();
      renderVideos();
    });
    wrapper.append(button);
    if (row.key !== "*") {
      wrapper.classList.add("collection-row-draggable");
      installCollectionDrag(wrapper, row.name);
      const deleteButton = document.createElement("button");
      deleteButton.className = "collection-delete";
      deleteButton.type = "button";
      deleteButton.innerHTML = BcaIcons.svg("close");
      deleteButton.title = BcaI18n.t("删除收藏夹“{name}”", { name: row.name });
      deleteButton.setAttribute("aria-label", BcaI18n.t("删除收藏夹 {name}", { name: row.name }));
      deleteButton.addEventListener("click", (event) => {
        event.stopPropagation();
        askToDeleteCollection(collections.find((collection) => collection.name === row.name));
      });
      wrapper.append(deleteButton);
    }
    return wrapper;
  }));
}

function selectedRecords() {
  return allVideos().filter((video) => selectedVideoIds.has(video.id));
}

function updateBatchControls() {
  const records = selectedRecords();
  selectedCount.textContent = BcaI18n.t("已选 {count} 个", { count: records.length });
  const allVisibleSelected = visibleVideoIds.length > 0 && visibleVideoIds.every((id) => selectedVideoIds.has(id));
  selectVisibleButton.textContent = allVisibleSelected ? BcaI18n.t("取消当前结果选择") : BcaI18n.t("全选当前结果");
  selectVisibleButton.disabled = visibleVideoIds.length === 0;
  moveSelectedButton.disabled = records.length === 0;
  downloadSelectedButton.disabled = records.length === 0;
  deleteSelectedButton.disabled = records.length === 0;
}

// 「批量管理 / 完成」两段文案都写在 HTML 里（各自带 data-i18n），这里只切换显示哪一个，
// 这样切语言时全局 apply() 能把它们一起翻掉，JS 里也不会再出现中文原文。
function showBatchManageLabel() {
  batchManageButton.querySelectorAll("[data-label]").forEach((label) => {
    label.hidden = label.dataset.label !== (selectionMode ? "done" : "manage");
  });
}

function setSelectionMode(enabled) {
  selectionMode = enabled;
  library.classList.toggle("batch-mode", selectionMode);
  batchToolbar.hidden = !selectionMode;
  batchManageButton.classList.toggle("button-primary", selectionMode);
  batchManageButton.classList.toggle("button-quiet", !selectionMode);
  showBatchManageLabel();
  batchManageButton.setAttribute("aria-pressed", String(selectionMode));
  if (!selectionMode) { selectedVideoIds.clear(); lastSelectedVideoId = ""; }
  renderVideos();
}

function setVideoSelected(videoId, isSelected) {
  if (isSelected) selectedVideoIds.add(videoId);
  else selectedVideoIds.delete(videoId);
  const card = [...videoGrid.querySelectorAll(".video-card")].find((item) => item.dataset.videoId === videoId);
  if (card) {
    card.classList.toggle("selected", isSelected);
    const checkbox = card.querySelector(".card-select");
    if (checkbox) checkbox.checked = isSelected;
  }
  updateBatchControls();
}

function toggleVisibleSelection() {
  const allVisibleSelected = visibleVideoIds.length > 0 && visibleVideoIds.every((id) => selectedVideoIds.has(id));
  for (const id of visibleVideoIds) {
    if (allVisibleSelected) selectedVideoIds.delete(id);
    else selectedVideoIds.add(id);
  }
  for (const card of videoGrid.querySelectorAll(".video-card")) {
    const isSelected = selectedVideoIds.has(card.dataset.videoId);
    card.classList.toggle("selected", isSelected);
    const checkbox = card.querySelector(".card-select");
    if (checkbox) checkbox.checked = isSelected;
  }
  updateBatchControls();
}

function safeCover(cover) {
  const url = String(cover || "");
  // 4.3：封面地址只允许代码自己产生的 blob: URL 与内联图片，
  // 其它一律退回占位图。否则将来若把外部字符串直接塞进来就是一个 HTML 注入点。
  if (!/^(?:blob:|data:image\/)/i.test(url)) return `<div class="cover-fallback" aria-label="${escapeHtml(BcaI18n.t("没有封面"))}"></div>`;
  return `<img src="${escapeHtml(url)}" alt="" loading="lazy">`;
}

function renderVideos() {
  const collectionName = selectedCollection === "*" ? BcaI18n.t("全部收藏") : selectedCollection;
  currentCollection.textContent = collectionName;
  pageTitle.textContent = collectionName;
  const videos = selectedVideos();
  batchManageButton.disabled = videos.length === 0;
  addVideoButton.disabled = selectedCollection === "*";
  addVideoButton.title = selectedCollection === "*" ? BcaI18n.t("请先选择一个收藏夹") : BcaI18n.t("添加视频到“{name}”", { name: selectedCollection });
  videoFilter = videoFilterSelect.value;
  const query = searchInput.value.trim().toLocaleLowerCase();
  const matching = videos.filter((video) => (videoFilter === "all" || (videoFilter === "invalid" && video.isInvalid) || (videoFilter === "downloaded" && video.downloaded)) && (!query || [video.title, video.upName, video.bvid, video.category, video.collection, video.description, ...video.tags].join(" ").toLocaleLowerCase().includes(query)));
  const sort = sortSelect.value;
  // 4.5：按播放量从高到低。没有播放量数据的排在最后（用 -1 而不是 0，
  // 否则“0 播放”会和“没有数据”混在一起），同档再按收藏时间倒序。
  const viewsOf = (video) => {
    const value = Number(video.stats?.view);
    return Number.isFinite(value) && value > 0 ? value : -1;
  };
  matching.sort((a, b) => {
    if (sort === "title") return a.title.localeCompare(b.title, "zh-CN");
    if (sort === "oldest") return a.timestamp - b.timestamp;
    if (sort === "views") return viewsOf(b) - viewsOf(a) || b.timestamp - a.timestamp;
    return b.timestamp - a.timestamp;
  });

  // 分页：网格里只渲染当前页，visibleVideoIds 也跟着当前页走
  pageCount = Math.max(1, Math.ceil(matching.length / pageSize));
  if (currentPage > pageCount) currentPage = pageCount;
  if (currentPage < 1) currentPage = 1;
  const pageStart = (currentPage - 1) * pageSize;
  const pageVideos = matching.slice(pageStart, pageStart + pageSize);
  visibleVideoIds = pageVideos.map((video) => video.id);

  const countLabel = videoFilter !== "all"
    ? BcaI18n.t("{shown} / {total} 个{kind}视频", {
        shown: matching.length,
        total: videos.filter((video) => videoFilter === "invalid" ? video.isInvalid : video.downloaded).length,
        kind: videoFilter === "invalid" ? BcaI18n.t("失效") : BcaI18n.t("已下载")
      })
    : query ? BcaI18n.t("{shown} / {total} 个视频", { shown: matching.length, total: videos.length }) : BcaI18n.t("{count} 个视频", { count: videos.length });
  const pageLabel = pageCount > 1 ? ` · ${BcaI18n.t("第 {page}/{pages} 页", { page: currentPage, pages: pageCount })}` : "";
  resultSummary.textContent = (selectedCollection === "*" ? BcaI18n.t("{count}，来自 {collections} 个收藏夹", { count: countLabel, collections: collections.length }) : countLabel) + pageLabel;
  videoGrid.replaceChildren(...pageVideos.map((video) => {
    const card = document.createElement("article");
    card.className = "video-card";
    card.classList.toggle("invalid-video", video.isInvalid);
    card.classList.toggle("downloaded-video", video.downloaded);
    card.dataset.videoId = video.id;
    card.classList.toggle("selected", selectedVideoIds.has(video.id));
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", selectionMode ? BcaI18n.t("选择视频：{title}", { title: video.title }) : BcaI18n.t("查看视频：{title}", { title: video.title }));
    card.innerHTML = `<div class="card-cover">${safeCover(video.cover)}<span class="invalid-badge">${escapeHtml(BcaI18n.t("已失效"))}</span><span class="downloaded-badge"${video.downloaded ? "" : " hidden"}>${BcaIcons.svg("check")}${escapeHtml(BcaI18n.t("已下载"))}</span><span class="cover-badge"></span><span class="cover-views tnum" hidden></span><input class="card-select" type="checkbox" aria-label="${escapeHtml(BcaI18n.t("选择视频"))}"></div><div class="card-body"><div class="card-title"></div><div class="card-meta"><span class="card-up"></span><span class="card-date tnum"></span></div></div>`;
    const checkbox = card.querySelector(".card-select");
    checkbox.checked = selectedVideoIds.has(video.id);
    checkbox.addEventListener("click", (event) => event.stopPropagation());
    checkbox.addEventListener("change", () => setVideoSelected(video.id, checkbox.checked));
    card.querySelector(".cover-badge").textContent = video.collection;
    // 4.5：播放量放在封面右下角，没有数据的记录不显示
    const viewsBadge = card.querySelector(".cover-views");
    const viewsText = formatCount(video.stats?.view);
    if (viewsText) {
      viewsBadge.textContent = `${viewsText} ${BcaI18n.t("播放")}`;
      viewsBadge.hidden = false;
    }
    card.querySelector(".card-title").innerHTML = highlightMatches(video.title, query);
    card.querySelector(".card-up").textContent = video.upName || video.bvid || BcaI18n.t("本地收藏视频");
    card.querySelector(".card-date").textContent = compactDate(video.favoriteAt);
    card.addEventListener("click", (event) => {
      if (!selectionMode) { openDetail(video); return; }
      if (event.shiftKey) { selectVideoRange(video.id); return; }
      lastSelectedVideoId = video.id;
      setVideoSelected(video.id, !selectedVideoIds.has(video.id));
    });
    card.addEventListener("keydown", (event) => {
      if (event.target !== card || (event.key !== "Enter" && event.key !== " ")) return;
      event.preventDefault();
      if (selectionMode) setVideoSelected(video.id, !selectedVideoIds.has(video.id));
      else openDetail(video);
    });
    return card;
  }));
  emptySearch.hidden = matching.length > 0 || videos.length === 0;
  if (!matching.length && videos.length) {
    emptySearch.querySelector("h2").textContent = videoFilter === "invalid" ? BcaI18n.t("没有已失效视频") : videoFilter === "downloaded" ? BcaI18n.t("没有已下载视频") : BcaI18n.t("没有找到相关视频");
    emptySearch.querySelector("p").textContent = videoFilter === "invalid" ? BcaI18n.t("当前收藏范围内没有检测到失效视频。") : videoFilter === "downloaded" ? BcaI18n.t("当前收藏范围内没有已下载的视频。") : BcaI18n.t("试试其他标题、UP 主名称或 BV 号。");
    clearSearch.hidden = videoFilter !== "all" && !query;
  } else {
    clearSearch.hidden = false;
  }
  videoGrid.hidden = videos.length === 0;
  if (!videos.length) {
    videoGrid.hidden = false;
    const emptyTitle = selectedCollection === "*" ? BcaI18n.t("本地收藏库里还没有视频") : BcaI18n.t("这个收藏夹里还没有视频");
    const emptyCopy = selectedCollection === "*" ? BcaI18n.t("选择一个收藏夹，或新建收藏夹并添加视频。") : BcaI18n.t("点击右上角“添加视频”，输入 B 站网址、BV 号或 av 号。");
    videoGrid.innerHTML = `<div class="empty-search" style="grid-column:1/-1"><div class="empty-search-icon">${BcaIcons.svg("collection")}</div><h2>${escapeHtml(emptyTitle)}</h2><p>${escapeHtml(emptyCopy)}</p></div>`;
  }
  renderPager(matching.length);
  updateBatchControls();
}

/* ---------------- 4.1：分页与视图切换 ---------------- */

function renderPager(total) {
  if (!videoPager) return;
  videoPager.hidden = total === 0;
  if (!total) { videoPager.replaceChildren(); return; }

  const nodes = [];
  const step = (label, target, disabled) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "pager-step";
    button.textContent = label;
    button.disabled = disabled;
    if (!disabled) button.addEventListener("click", () => goToPage(target));
    return button;
  };
  nodes.push(step(BcaI18n.t("上一页"), currentPage - 1, currentPage <= 1));

  for (const entry of pageSequence(currentPage, pageCount)) {
    if (entry === "gap") {
      const gap = document.createElement("span");
      gap.className = "pager-gap";
      gap.textContent = "…";
      nodes.push(gap);
      continue;
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = `pager-page tnum${entry === currentPage ? " current" : ""}`;
    button.textContent = String(entry);
    button.setAttribute("aria-label", BcaI18n.t("第 {page} 页", { page: entry }));
    if (entry === currentPage) button.setAttribute("aria-current", "page");
    button.addEventListener("click", () => goToPage(entry));
    nodes.push(button);
  }

  nodes.push(step(BcaI18n.t("下一页"), currentPage + 1, currentPage >= pageCount));

  const info = document.createElement("span");
  info.className = "pager-info tnum";
  info.textContent = BcaI18n.t("共 {pages} 页 / {total} 个，跳至", { pages: pageCount, total });

  const jump = document.createElement("input");
  jump.type = "number";
  jump.className = "pager-jump tnum";
  jump.min = "1";
  jump.max = String(pageCount);
  jump.value = String(currentPage);
  jump.setAttribute("aria-label", BcaI18n.t("跳转到指定页"));
  const applyJump = () => {
    const wanted = Number(jump.value);
    if (!Number.isFinite(wanted) || wanted < 1) { jump.value = String(currentPage); return; }
    goToPage(wanted);
  };
  jump.addEventListener("change", applyJump);
  jump.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    applyJump();
  });

  const pageSuffix = document.createElement("span");
  pageSuffix.className = "pager-info";
  pageSuffix.textContent = BcaI18n.t("页");

  const sizeLabel = document.createElement("label");
  sizeLabel.className = "pager-size";
  sizeLabel.append(document.createTextNode(BcaI18n.t("每页")));
  const sizeSelect = document.createElement("select");
  sizeSelect.setAttribute("aria-label", BcaI18n.t("每页显示数量"));
  for (const value of PAGE_SIZES) sizeSelect.add(new Option(BcaI18n.t("{count} 个", { count: value }), String(value)));
  sizeSelect.value = String(pageSize);
  sizeSelect.addEventListener("change", () => {
    pageSize = Number(sizeSelect.value) || PAGE_SIZES[0];
    resetPaging();
    saveViewSettings();
    renderVideos();
  });
  sizeLabel.append(sizeSelect);

  videoPager.replaceChildren(...nodes, info, jump, pageSuffix, sizeLabel);
}

// 页码序列由 archive-core.js 的 pageSequence 提供（见文件顶部的解构）

function goToPage(page) {
  const next = Math.min(Math.max(1, Math.round(Number(page) || 1)), Math.max(1, pageCount));
  if (next === currentPage) return;
  currentPage = next;
  renderVideos();
  videoGrid.scrollIntoView({ block: "start", behavior: "smooth" });
}

function resetPaging() {
  currentPage = 1;
}

function applyViewMode() {
  if (!videoGrid) return;
  videoGrid.classList.toggle("list-view", viewMode === "list");
  if (viewGridButton) {
    viewGridButton.classList.toggle("active", viewMode === "grid");
    viewGridButton.setAttribute("aria-pressed", String(viewMode === "grid"));
  }
  if (viewListButton) {
    viewListButton.classList.toggle("active", viewMode === "list");
    viewListButton.setAttribute("aria-pressed", String(viewMode === "list"));
  }
}

function setViewMode(mode) {
  const next = mode === "list" ? "list" : "grid";
  if (next === viewMode) return;
  viewMode = next;
  applyViewMode();
  saveViewSettings();
  renderVideos();
}

function saveViewSettings() {
  chrome.storage.local.set({ libraryViewMode: viewMode, libraryPageSize: pageSize }).catch(() => {});
}

async function restoreViewSettings() {
  try {
    const saved = await chrome.storage.local.get(["libraryViewMode", "libraryPageSize"]);
    if (saved.libraryViewMode === "list" || saved.libraryViewMode === "grid") viewMode = saved.libraryViewMode;
    const size = Number(saved.libraryPageSize);
    if (PAGE_SIZES.includes(size)) pageSize = size;
  } catch (_) {}
}

/* ---------------- 4.4：更新视频状态 ---------------- */

// 4.5：「更新视频状态」从页面标题栏移到视频详情里，一次只刷新当前这一条，
// 避免批量刷一堆接口触发风控。statusRefreshInProgress 期间禁用按钮。
function refreshTargetOf(video) {
  return video?.bvid || video?.aid ? { collection: video.collection, directory: video.directory } : null;
}

async function refreshOneVideoStatus(video) {
  if (statusRefreshInProgress) return;
  const target = refreshTargetOf(video);
  if (!target) { showToast(BcaI18n.t("这条记录没有 BV/av 号，无法更新状态。")); return; }
  const button = detailContent.querySelector(".refresh-status");
  const status = detailContent.querySelector(".detail-refresh-status");
  const setBusy = (busy) => {
    statusRefreshInProgress = busy;
    if (button) button.disabled = busy;
    if (status) status.hidden = !busy && !status.textContent;
  };
  setBusy(true);
  if (status) { status.hidden = false; status.textContent = BcaI18n.t("正在请求 B 站接口…"); }
  try {
    const permission = await rootHandle.requestPermission({ mode: "readwrite" });
    if (permission !== "granted") throw new Error(BcaI18n.t("没有获得本地目录写入权限。"));
    const result = await chrome.runtime.sendMessage({ type: "bca-refresh-video-stats", data: { targets: [target], limit: 1 } });
    if (!result?.ok) throw new Error(result?.message || BcaI18n.t("更新失败。"));
    const detail = result.markedInvalid
      ? BcaI18n.t("解析发现这条视频已失效：已保留原有资料，只标记为已失效。")
      : result.updated
        ? BcaI18n.t("已更新播放量、点赞、粉丝数等数值。")
        : BcaI18n.t("接口返回的数据与本地一致，没有需要改写的内容。");
    if (status) { status.hidden = false; status.textContent = detail; }
    await displayRoot(rootHandle, selectedCollection, BcaI18n.t("已刷新"));
    const refreshed = allVideos().find((item) => item.id === video.id);
    if (refreshed) {
      openDetail(refreshed);
      const again = detailContent.querySelector(".detail-refresh-status");
      if (again) { again.hidden = false; again.textContent = detail; }
    }
  } catch (error) {
    if (status) { status.hidden = false; status.textContent = BcaI18n.t("更新失败：{message}", { message: error?.message || BcaI18n.t("未知错误") }); }
  } finally {
    statusRefreshInProgress = false;
    if (button) button.disabled = false;
  }
}
/* ---------------- 使用须知（4.4.1：可折叠，但不允许永久关闭） ---------------- */
// 以前用 safetyNoticeDismissed 记住“不再显示”，4.4.1 起必须常驻，
// 因此这里只清掉可能残留的旧标记，不再读写它。
async function clearLegacySafetyDismissed() {
  try { await chrome.storage.local.remove("safetyNoticeDismissed"); } catch (_) {}
}



// 提示条默认 hidden（避免存储读取前闪一下），只有没被关过才显示
async function restoreImportHint() {
  if (!importHint) return;
  let dismissed = false;
  try {
    const saved = await chrome.storage.local.get("importHintDismissed");
    dismissed = saved?.importHintDismissed === true;
  } catch (_) {}
  importHint.hidden = dismissed;
}

function dismissImportHint() {
  if (importHint) importHint.hidden = true;
  chrome.storage.local.set({ importHintDismissed: true }).catch(() => {});
}

function compactDate(value) {
  const match = value.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  return match ? `${match[1]}.${String(match[2]).padStart(2, "0")}.${String(match[3]).padStart(2, "0")}` : value;
}

// extra 用来在值后面追加徽标等附加内容（例如 UP 主那一行的粉丝数）
// label 由调用方翻译好再传进来（key 必须是字面量，所以不在这个函数里翻）
function addField(rows, label, value, extra = "") { if (value && value !== "未知") rows.push(`<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}${extra}</dd>`); }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]); }

// 带 data-i18n 的静态文案元素一旦被 JS 写上动态内容（目录名、按当时语言拼好的句子），
// 必须先摘掉标记：否则切语言时 apply() 会把它们覆盖回占位文案。
function setDynamicText(element, text) {
  if (!element) return;
  element.removeAttribute("data-i18n");
  element.textContent = text;
}

// 数字单位是**语言相关**的：中文用 万 / 亿，英文用 K / M / B。
// 不能拿 t("{value} 万") 当模板硬拼——中文先除以 1 万得到 7.4，
// 英文那边再补成 "{value}0K" 就成了 7.40K，比真实值小十倍。
// 所以按语言各自换算。
function formatCount(value) {
  const text = String(value ?? "").trim();
  const number = Number(text.replace(/[,\s]/g, ""));
  if (!text || !Number.isFinite(number)) return text;
  if (BcaI18n.locale() === "en") {
    // 阈值取「四舍五入后会进位到 1000.0」的位置，否则 999999999 会显示成 1000.0M
    if (number >= 999950000) return `${(number / 1e9).toFixed(1)}B`;
    if (number >= 999950) return `${(number / 1e6).toFixed(1)}M`;
    if (number >= 1000) return `${(number / 1e3).toFixed(1)}K`;
    return text;
  }
  const wan = BcaI18n.locale() === "zh-TW" ? "萬" : "万";
  const yi = BcaI18n.locale() === "zh-TW" ? "億" : "亿";
  if (number >= 99995000) return `${(number / 100000000).toFixed(1)} ${yi}`;
  if (number >= 10000) return `${(number / 10000).toFixed(1)} ${wan}`;
  return text;
}

// 互动数据卡片行：一个值都没有（老档案还没写【互动数据】）时整块不渲染，避免一排“未知”
function detailStatsHtml(stats) {
  // 每次渲染现翻一次，切语言后重画详情就会跟着变
  const labels = {
    view: BcaI18n.t("播放量"),
    danmaku: BcaI18n.t("弹幕"),
    like: BcaI18n.t("点赞"),
    coin: BcaI18n.t("投币"),
    favorite: BcaI18n.t("收藏"),
    share: BcaI18n.t("转发")
  };
  const cards = STAT_LABEL_KEYS
    .map((key) => ({ label: labels[key], value: formatCount(stats?.[key]) }))
    .filter((item) => item.value)
    .map((item) => `<div class="detail-stat"><span class="detail-stat-value tnum">${escapeHtml(item.value)}</span><span class="detail-stat-label">${escapeHtml(item.label)}</span></div>`);
  return cards.length ? `<div class="detail-stats">${cards.join("")}</div>` : "";
}

// 搜索命中时高亮卡片标题里的关键词（先转义再插入 <mark>，避免标题里的尖括号被当成标签）
function highlightMatches(text, query) {
  const source = String(text ?? "");
  if (!query) return escapeHtml(source);
  const lower = source.toLocaleLowerCase();
  let cursor = 0;
  let html = "";
  while (cursor < source.length) {
    const found = lower.indexOf(query, cursor);
    if (found < 0) break;
    html += `${escapeHtml(source.slice(cursor, found))}<mark>${escapeHtml(source.slice(found, found + query.length))}</mark>`;
    cursor = found + query.length;
  }
  return html + escapeHtml(source.slice(cursor));
}

function selectVideoRange(videoId) {
  const anchor = visibleVideoIds.indexOf(lastSelectedVideoId);
  const target = visibleVideoIds.indexOf(videoId);
  if (anchor < 0 || target < 0) { lastSelectedVideoId = videoId; setVideoSelected(videoId, true); return; }
  const [from, to] = anchor <= target ? [anchor, target] : [target, anchor];
  for (let index = from; index <= to; index += 1) setVideoSelected(visibleVideoIds[index], true);
  lastSelectedVideoId = videoId;
}

function selectAllVisible() {
  for (const id of visibleVideoIds) selectedVideoIds.add(id);
  for (const card of videoGrid.querySelectorAll(".video-card")) {
    const isSelected = selectedVideoIds.has(card.dataset.videoId);
    card.classList.toggle("selected", isSelected);
    const checkbox = card.querySelector(".card-select");
    if (checkbox) checkbox.checked = isSelected;
  }
  updateBatchControls();
}

async function copyToClipboard(text, successMessage) {
  try {
    await navigator.clipboard.writeText(text);
    showToast(successMessage || BcaI18n.t("已复制。"));
  } catch (error) {
    showToast(BcaI18n.t("复制失败：{message}", { message: error?.message || BcaI18n.t("浏览器拒绝了剪贴板访问") }));
  }
}

function copyFieldButton(value, label) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "detail-copy-field";
  button.title = label;
  button.setAttribute("aria-label", BcaI18n.t("{label}：{value}", { label, value }));
  button.innerHTML = `${BcaIcons.svg("copy")}${escapeHtml(label)}`;
  button.addEventListener("click", () => copyToClipboard(value, BcaI18n.t("{label}成功", { label })));
  return button;
}

// B / KB / MB / GB，KB 及以上保留 2 位小数（顶部占用和详情里的下载体积共用）
function formatBytes(value) {
  const bytes = Number(value) || 0;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

// 递归累加整个根目录的文件大小，包含 000视频下载、001错误报告 等所有子目录
async function directorySize(directory) {
  let total = 0;
  for await (const entry of directory.values()) {
    if (entry.kind === "directory") total += await directorySize(entry);
    else total += (await entry.getFile()).size;
  }
  return total;
}

/* ---------------- 4.2：顶部“本地收藏夹占用” ---------------- */

// 统计放在 displayRoot() 渲染之后异步跑，先出界面再慢慢算。
// 同一时刻只允许一次递归扫描：期间再来请求只记下最新根目录，等本轮结束后补算。
async function updateStorageUsage(handle) {
  if (!storageUsage) return;
  if (!handle) { storageUsage.textContent = "—"; return; }
  if (storageUsageRunning) { storageUsageQueuedRoot = handle; return; }
  storageUsageRunning = true;
  storageUsage.textContent = BcaI18n.t("正在计算…");
  try {
    const total = await directorySize(handle);
    if (rootHandle === handle) storageUsage.textContent = formatBytes(total);
  } catch (_) {
    if (rootHandle === handle) storageUsage.textContent = BcaI18n.t("统计失败");
  } finally {
    storageUsageRunning = false;
    const queued = storageUsageQueuedRoot;
    storageUsageQueuedRoot = null;
    if (queued && queued !== handle) updateStorageUsage(queued);
  }
}

// 详情页顺带统计本地下载体积；只读，失败就安静隐藏。
async function showDownloadSize(video) {
  const target = detailContent.querySelector(".detail-size");
  if (!target || !video.hasDownloadFiles || !video.downloadDirectoryHandle) return;
  target.hidden = false;
  target.textContent = BcaI18n.t("正在统计本地文件…");
  try {
    const total = await directorySize(video.downloadDirectoryHandle);
    if (detailContent.dataset.videoId !== video.id) return;
    target.innerHTML = `${BcaIcons.svg("drive")}${escapeHtml(BcaI18n.t("本地已下载"))} <span class="tnum">${formatBytes(total)}</span>`;
  } catch (_) {
    target.hidden = true;
  }
}

function openDownloadInterface(videos) {
  if (!videos.length) return;
  const items = videos.map((video) => ({
    title: video.title || "未知", bvid: video.bvid || "", aid: video.aid || "",
    url: video.url || "", collection: video.collection || ""
  }));
  const tab = window.open("about:blank", "_blank");
  if (!tab) { showToast(BcaI18n.t("浏览器拦截了下载页面，请允许本地收藏库打开新标签页。")); return; }
  const queueId = crypto.randomUUID();
  const storageKey = `bcaDownloadQueue:${queueId}`;
  chrome.storage.session.set({ [storageKey]: items }).then(() => {
    if (tab.closed) return chrome.storage.session.remove(storageKey);
    const target = new URL(chrome.runtime.getURL("download.html"));
    target.searchParams.set("queueId", queueId);
    tab.location.href = target.href;
  }).catch((error) => {
    try { tab.close(); } catch (_) {}
    showToast(BcaI18n.t("无法传递下载队列：{message}", { message: error?.message || BcaI18n.t("插件临时存储不可用") }));
  });
}

function openDetail(video) {
  detailPanel.classList.toggle("invalid-video", video.isInvalid);
  const rows = [];
  addField(rows, BcaI18n.t("收藏时间"), video.favoriteAt);
  addField(rows, BcaI18n.t("信息保存于"), video.savedAt);
  // 粉丝数按原值显示（例如“粉丝 12345”），不套用统计卡片的万/亿缩写
  addField(rows, BcaI18n.t("UP 主"), video.upName, video.upFans ? `<span class="detail-up-fans">${escapeHtml(BcaI18n.t("粉丝"))} <span class="tnum">${escapeHtml(video.upFans)}</span></span>` : "");
  addField(rows, BcaI18n.t("UP 主 UID"), video.upMid);
  if (video.upHome && /^https?:\/\//i.test(video.upHome)) rows.push(`<dt>${escapeHtml(BcaI18n.t("UP 主主页"))}</dt><dd><a class="detail-profile-link" href="${escapeHtml(video.upHome)}" target="_blank" rel="noopener noreferrer">${escapeHtml(BcaI18n.t("打开 UP 主主页"))} ${BcaIcons.svg("external")}</a></dd>`);
  addField(rows, BcaI18n.t("分区"), video.category);
  addField(rows, BcaI18n.t("视频时长"), video.duration);
  addField(rows, BcaI18n.t("发布时间"), video.publishDate);
  addField(rows, BcaI18n.t("BV 号"), video.bvid);
  addField(rows, BcaI18n.t("av 号"), video.aid);
  addField(rows, BcaI18n.t("归档目录"), video.directory);
  // 注意：空标签占位符不能再用 .detail-description —— 它和真正的简介元素同名时，
  // 下面的 querySelector(".detail-description") 会取到占位符，把简介写进“标签”里。
  const tags = video.tags.length
    ? `<div class="detail-tags">${video.tags.map((tag) => `<span class="detail-tag">${escapeHtml(tag)}</span>`).join("")}</div>`
    : `<p class="detail-empty">${BcaIcons.svg("tag")}${escapeHtml(BcaI18n.t("这个归档没有记录标签"))}</p>`;
  detailContent.dataset.videoId = video.id;
  detailContent.innerHTML = `<div class="detail-cover">${safeCover(video.cover)}</div><span class="detail-collection"></span><h2 class="detail-title"></h2><p class="detail-bvid"></p>${video.url ? `<a class="button button-primary open-video" target="_blank" rel="noopener noreferrer" href="">${BcaIcons.svg("external")}${escapeHtml(BcaI18n.t("在 B 站打开视频"))}</a>` : ""}<section class="detail-management"><h3>${BcaIcons.svg("play")}${escapeHtml(BcaI18n.t("本地视频"))}</h3><div class="detail-primary-actions"><button class="button button-download download-local" type="button">${BcaIcons.svg("download")}${escapeHtml(BcaI18n.t("下载视频"))}</button><button class="button button-quiet open-download-directory" type="button"${video.hasDownloadFiles ? "" : " hidden"}>${BcaIcons.svg("collection-open")}${escapeHtml(BcaI18n.t("打开目录"))}</button></div><div class="detail-secondary-actions"><button class="button button-quiet copy-download-path" type="button"${video.hasDownloadFiles ? "" : " hidden"}>${BcaIcons.svg("copy")}${escapeHtml(BcaI18n.t("复制视频目录路径"))}</button></div><p class="download-path-note" role="status" hidden></p><p class="detail-size" hidden></p><h3>${BcaIcons.svg("move")}${escapeHtml(BcaI18n.t("本地收藏管理"))}</h3><button class="button button-primary move-local" type="button">${BcaIcons.svg("move")}${escapeHtml(BcaI18n.t("移动或复制"))}</button><button class="button button-danger delete-local" type="button">${BcaIcons.svg("trash")}${escapeHtml(BcaI18n.t("删除本地归档"))}</button><p class="management-note">${escapeHtml(BcaI18n.t("这些整理操作只影响本地归档，不会更改 B 站账户中的收藏。"))}</p></section>${detailStatsHtml(video.stats)}<div class="detail-refresh"><button class="button button-quiet refresh-status" type="button">${BcaIcons.svg("refresh")}<span>${escapeHtml(BcaI18n.t("更新视频状态"))}</span></button><span class="detail-refresh-note">${escapeHtml(BcaI18n.t("重新解析播放量、点赞、UP 主粉丝数等会变化的数值，只覆盖这些数值，不改动标题、简介和标签"))}</span><p class="detail-refresh-status" role="status" hidden></p></div><h3 class="detail-section-title">${BcaIcons.svg("file")}${escapeHtml(BcaI18n.t("视频信息"))}</h3><dl class="detail-fields">${rows.join("")}</dl><h3 class="detail-section-title">${BcaIcons.svg("tag")}${escapeHtml(BcaI18n.t("标签"))}</h3>${tags}<h3 class="detail-section-title">${BcaIcons.svg("info")}${escapeHtml(BcaI18n.t("视频简介"))}</h3><p class="detail-description"></p><button class="text-button detail-description-toggle" type="button" hidden>${escapeHtml(BcaI18n.t("展开全部简介"))}</button>`;
  detailContent.querySelector(".detail-collection").textContent = video.isInvalid ? `${video.collection} · ${BcaI18n.t("已失效")}` : video.collection;
  detailContent.querySelector(".detail-collection").classList.toggle("invalid", video.isInvalid);
  detailContent.querySelector(".detail-title").textContent = video.title;

  // 头部改成可一键复制的字段，避免手动选中 BV 号
  const bvidField = detailContent.querySelector(".detail-bvid");
  bvidField.replaceChildren();
  const bvidLabel = document.createElement("span");
  bvidLabel.className = "tnum";
  bvidLabel.textContent = video.bvid ? BcaI18n.t("BV号 {bvid}", { bvid: video.bvid }) : BcaI18n.t("本地归档");
  bvidField.append(bvidLabel);
  if (video.bvid) bvidField.append(copyFieldButton(video.bvid, BcaI18n.t("复制 BV 号")));
  if (video.url) bvidField.append(copyFieldButton(video.url, BcaI18n.t("复制视频链接")));

  const description = detailContent.querySelector(".detail-description");
  if (video.description) {
    description.textContent = video.description;
  } else {
    description.className = "detail-empty";
    description.innerHTML = `${BcaIcons.svg("info")}${escapeHtml(BcaI18n.t("这个归档没有记录简介"))}`;
  }
  const descriptionToggle = detailContent.querySelector(".detail-description-toggle");
  if ((video.description || "").length > 160) {
    description.classList.add("clamped");
    descriptionToggle.hidden = false;
    descriptionToggle.addEventListener("click", () => {
      const clamped = description.classList.toggle("clamped");
      descriptionToggle.textContent = clamped ? BcaI18n.t("展开全部简介") : BcaI18n.t("收起简介");
    });
  }

  const link = detailContent.querySelector(".open-video");
  if (link) link.href = video.url;
  const moveButton = detailContent.querySelector(".move-local");
  moveButton.addEventListener("click", () => openCollectionActionDialog([video], "detail"));
  detailContent.querySelector(".refresh-status").addEventListener("click", () => refreshOneVideoStatus(video));
  detailContent.querySelector(".download-local").addEventListener("click", () => openDownloadInterface([video]));
  detailContent.querySelector(".open-download-directory").addEventListener("click", () => openDownloadDirectory(video));
  detailContent.querySelector(".copy-download-path").addEventListener("click", () => copyDownloadPath(video));
  detailContent.querySelector(".delete-local").addEventListener("click", () => askToDeleteVideo(video));
  showDownloadSize(video).catch(() => {});
  detailPanel.classList.add("open");
  detailPanel.setAttribute("aria-hidden", "false");
  detailBackdrop.hidden = false;
  document.body.style.overflow = "hidden";
  closeDetailButton.focus();
}

const NATIVE_HOST_NAME = "com.bcatch.folder_opener";

// 原生助手（宿主启动器）以 Native Messaging 帧协议应答。失败时它会回一条
// { ok: false, message } 的响应，这里把 message 原样带出去，避免只看到
// Chrome 的 “native host has exited” 而不知道真正原因。
function nativeHostRequest(message) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback) => { if (!settled) { settled = true; callback(); } };
    try {
      chrome.runtime.sendNativeMessage(NATIVE_HOST_NAME, message, (response) => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) {
          finish(() => reject(new Error(runtimeError.message ? BcaI18n.t(runtimeError.message) : BcaI18n.t("Chrome 无法启动 Windows 原生目录助手。"))));
          return;
        }
        if (!response) { finish(() => reject(new Error(BcaI18n.t("Windows 原生目录助手没有返回结果。")))); return; }
        if (!response.ok) { finish(() => reject(new Error(response.message ? BcaI18n.t(response.message) : BcaI18n.t("Windows 原生目录助手未能完成请求。")))); return; }
        finish(() => resolve(response));
      });
    } catch (error) {
      finish(() => reject(error));
    }
  });
}

function detailVideo() {
  return allVideos().find((video) => video.id === detailContent.dataset.videoId) || null;
}

function setDownloadPathNote(text, isError = false) {
  const note = detailContent.querySelector(".download-path-note");
  if (!note) return;
  note.hidden = !text;
  note.textContent = text || "";
  note.classList.toggle("error", Boolean(text) && isError);
}

function downloadPathParts(video) {
  return {
    collection: String(video?.downloadCollectionName || ""),
    directory: String(video?.downloadDirectoryName || "")
  };
}

// 优先向原生助手要真实绝对路径；助手不可用时退回相对路径，
// 这样即使没装助手也能手动在资源管理器里打开。
async function resolveDownloadPath(video) {
  const { collection, directory } = downloadPathParts(video);
  if (!directory) return { path: "", source: "none" };
  try {
    const response = await nativeHostRequest({ action: "resolve-directory", collectionName: collection, directoryName: directory });
    if (response.targetPath) return { path: response.targetPath, source: "host" };
  } catch (_) {}
  return { path: BcaArchiveCore.downloadPathLabel(collection, directory), source: "relative" };
}

async function openDownloadDirectory(video) {
  if (!video.hasDownloadFiles || !video.downloadDirectoryName) return;
  const { collection, directory } = downloadPathParts(video);
  setDownloadPathNote(BcaI18n.t("正在连接 Windows 原生目录助手…"));
  try {
    const response = await nativeHostRequest({ action: "open-directory", collectionName: collection, directoryName: directory });
    setDownloadPathNote(response.targetPath ? BcaI18n.t("已打开：{path}", { path: response.targetPath }) : "");
    showToast(BcaI18n.t("已在文件资源管理器中打开视频目录。"));
  } catch (error) {
    const fallback = await resolveDownloadPath(video).catch(() => ({ path: "", source: "none" }));
    const lines = [BcaI18n.t("无法打开本地视频目录：{message}", { message: error.message })];
    if (fallback.path) {
      lines.push(fallback.source === "host"
        ? BcaI18n.t("视频目录：{path}", { path: fallback.path })
        : BcaI18n.t("视频目录（相对下载根目录）：{path}", { path: BcaArchiveCore.joinDownloadPath(BcaI18n.t("下载根目录"), collection, directory) }));
    }
    lines.push(BcaI18n.t("若尚未安装原生助手：运行插件目录中的 install-native-folder-opener.bat，填入本插件当前的扩展程序 ID 和下载目录；安装后需要在 chrome://extensions 重新加载插件并完全重启 Chrome。"));
    lines.push(BcaI18n.t("可以点击上面的“复制视频目录路径”手动在资源管理器地址栏粘贴打开。"));
    setDownloadPathNote(lines.join("\n"), true);
    showToast(BcaI18n.t("无法打开本地视频目录，详情见视频详情页。"));
  }
}

async function copyDownloadPath(video) {
  if (!video.downloadDirectoryName) { showToast(BcaI18n.t("这条记录没有可用的下载目录信息。")); return; }
  const resolved = await resolveDownloadPath(video);
  if (!resolved.path) { showToast(BcaI18n.t("这条记录没有可用的下载目录信息。")); return; }
  try {
    await navigator.clipboard.writeText(resolved.path);
    setDownloadPathNote(resolved.source === "host"
      ? BcaI18n.t("已复制完整路径：{path}", { path: resolved.path })
      : BcaI18n.t("已复制相对路径：{path}（完整路径 = 下载根目录\\{path}）", { path: resolved.path }));
    showToast(BcaI18n.t("已复制视频目录路径。"));
  } catch (error) {
    setDownloadPathNote(BcaI18n.t("复制失败，请手动记录：{path}", { path: resolved.path }), true);
    showToast(BcaI18n.t("复制路径失败：{message}", { message: error?.message || BcaI18n.t("浏览器拒绝了剪贴板访问") }));
  }
}

function closeDetail() {
  if (deleteInProgress) return;
  closeDeleteConfirmation();
  detailPanel.classList.remove("open");
  detailPanel.classList.remove("invalid-video");
  detailPanel.setAttribute("aria-hidden", "true");
  detailBackdrop.hidden = true;
  document.body.style.overflow = "";
}

function askToDeleteVideo(video) {
  pendingDeleteAction = { type: "video", video };
  confirmTitle.textContent = BcaI18n.t("删除本地归档？");
  confirmMessage.textContent = BcaI18n.t("将删除本地目录“{path}”及其中的封面和视频信息。B 站账户里的收藏不会改变。", { path: `${video.collection}/${video.directory}` });
  confirmDeleteButton.textContent = BcaI18n.t("删除本地文件");
  deleteDownloadsOption.hidden = !video.hasDownloadFiles;
  deleteAssociatedDownloads.checked = false;
  confirmBackdrop.hidden = false;
  confirmDeleteButton.focus();
}

function askToDeleteCollection(collection) {
  if (!collection) return;
  pendingDeleteAction = { type: "collection", collection };
  confirmTitle.textContent = BcaI18n.t("删除整个本地收藏夹？");
  confirmMessage.textContent = BcaI18n.t("将永久删除本地收藏夹“{name}”及其全部文件（当前识别到 {count} 个视频）。此操作只影响本地归档，不会更改 B 站账户中的收藏。", { name: collection.name, count: collection.videos.length });
  confirmDeleteButton.textContent = BcaI18n.t("删除收藏夹");
  deleteDownloadsOption.hidden = !collection.videos.some((video) => video.hasDownloadFiles);
  deleteAssociatedDownloads.checked = false;
  confirmBackdrop.hidden = false;
  confirmDeleteButton.focus();
}

function askToDeleteBatch(videos) {
  if (!videos.length) return;
  pendingDeleteAction = { type: "batch", videos };
  confirmTitle.textContent = BcaI18n.t("删除选中的本地归档？");
  confirmMessage.textContent = BcaI18n.t("将永久删除选中的 {count} 个视频目录及其中的封面和视频信息。此操作只影响本地文件，不会更改 B 站账户中的收藏。", { count: videos.length });
  confirmDeleteButton.textContent = BcaI18n.t("删除 {count} 个视频", { count: videos.length });
  deleteDownloadsOption.hidden = !videos.some((video) => video.hasDownloadFiles);
  deleteAssociatedDownloads.checked = false;
  confirmBackdrop.hidden = false;
  confirmDeleteButton.focus();
}

function closeDeleteConfirmation() {
  if (deleteInProgress) return;
  confirmBackdrop.hidden = true;
  deleteDownloadsOption.hidden = true;
  deleteAssociatedDownloads.checked = false;
  pendingDeleteAction = null;
  confirmTitle.textContent = BcaI18n.t("删除本地归档？");
  confirmDeleteButton.textContent = BcaI18n.t("删除本地文件");
}

async function copyDirectoryContents(source, target) {
  for await (const [name, entry] of source.entries()) {
    if (entry.kind === "directory") {
      const childTarget = await target.getDirectoryHandle(name, { create: true });
      await copyDirectoryContents(entry, childTarget);
      continue;
    }
    const sourceFile = await entry.getFile();
    const targetFile = await target.getFileHandle(name, { create: true });
    const writable = await targetFile.createWritable();
    try {
      await writable.write(sourceFile);
      await writable.close();
    } catch (error) {
      try { await writable.abort(); } catch (_) {}
      throw error;
    }
  }
}

async function updateSavedFolderName(directory, folderName) {
  const infoHandle = await directory.getFileHandle("视频信息.txt");
  const file = await infoHandle.getFile();
  const text = await file.text();
  const updated = text.replace(/^保存文件夹[：:].*$/m, `保存文件夹：${folderName}`);
  if (updated === text) return;
  const writable = await infoHandle.createWritable();
  try {
    await writable.write(updated);
    await writable.close();
  } catch (error) {
    try { await writable.abort(); } catch (_) {}
    throw error;
  }
}

async function uniqueRecordFolderName(parent, originalName) {
  const match = originalName.match(/^(.*?)(?:_(\d+))?$/);
  const stem = match?.[1] || originalName;
  let suffix = match?.[2] ? Number(match[2]) + 1 : 2;
  let candidate = originalName;
  while (true) {
    try {
      await parent.getDirectoryHandle(candidate);
      candidate = `${stem}_${suffix++}`;
    } catch (error) {
      if (error?.name === "NotFoundError") return candidate;
      if (error?.name === "TypeMismatchError") {
        candidate = `${stem}_${suffix++}`;
        continue;
      }
      throw error;
    }
  }
}

async function copyVideoRecord(video, targetName) {
  const sourceCollection = await rootHandle.getDirectoryHandle(video.collection);
  const targetCollection = await rootHandle.getDirectoryHandle(targetName);
  const targetRecordName = await uniqueRecordFolderName(targetCollection, video.directory);
  const targetRecord = await targetCollection.getDirectoryHandle(targetRecordName, { create: true });
  try {
    await copyDirectoryContents(await sourceCollection.getDirectoryHandle(video.directory), targetRecord);
    if (targetRecordName !== video.directory) await updateSavedFolderName(targetRecord, targetRecordName);
  } catch (error) {
    await targetCollection.removeEntry(targetRecordName, { recursive: true }).catch(() => {});
    throw error;
  }
  return { targetCollection, targetRecordName };
}

async function removeMovedSource(video) {
  const sourceCollection = await rootHandle.getDirectoryHandle(video.collection);
  await sourceCollection.removeEntry(video.directory, { recursive: true });
}

async function getWritableDownloadParent() {
  const mode = await readSavedSetting("downloadFolderMode");
  const savedCustom = await readSavedSetting("downloadFolder");
  const isCustom = mode === "custom" || (!mode && Boolean(savedCustom));
  let parent;
  if (isCustom) {
    if (!savedCustom) throw new Error(BcaI18n.t("自选下载目录设置已丢失，请先在下载页重新选择目录。"));
    parent = savedCustom;
  } else {
    try { parent = await rootHandle.getDirectoryHandle("000视频下载"); }
    catch (error) { if (error?.name === "NotFoundError") return null; throw error; }
  }
  let permission = await parent.queryPermission({ mode: "readwrite" });
  if (permission !== "granted") permission = await parent.requestPermission({ mode: "readwrite" });
  if (permission !== "granted") throw new Error(BcaI18n.t("没有获得下载目录写入权限；收藏视频已保留，下载文件未整理。"));
  return parent;
}

async function listVideoDownloadDirectories(downloadParent, video) {
  if (!downloadParent) return [];
  const wanted = videoIdentifierKeys(video);
  if (!wanted.size) return [];
  const collectionNames = [...new Set([video.collection, "未分类收藏"].filter(Boolean))];
  const matches = [];
  for (const collectionName of collectionNames) {
    let collectionHandle;
    try { collectionHandle = await downloadParent.getDirectoryHandle(collectionName); }
    catch (error) { if (error?.name === "NotFoundError") continue; throw error; }
    for await (const entry of collectionHandle.values()) {
      if (entry.kind !== "directory") continue;
      const identifiers = BcaArchiveCore.identifiersFromDirectoryName(entry.name);
      if (!identifiersOverlap(wanted, identifiers)) continue;
      const contents = await inspectDownloadDirectory(entry);
      if (contents.hasFiles) matches.push({ collectionName, collectionHandle, directory: entry, hasMedia: contents.hasMedia });
    }
  }
  return matches;
}

async function copyDownloadDirectories(downloadParent, video, targetNames) {
  const sources = await listVideoDownloadDirectories(downloadParent, video);
  if (!sources.length) return { sources, created: [] };
  const wanted = videoIdentifierKeys(video);
  const created = [];
  try {
    for (const targetName of targetNames) {
      if (targetName === video.collection) continue;
      const targetCollection = await downloadParent.getDirectoryHandle(targetName, { create: true });
      let alreadyPresent = false;
      for await (const entry of targetCollection.values()) {
        if (entry.kind !== "directory") continue;
        if (identifiersOverlap(wanted, BcaArchiveCore.identifiersFromDirectoryName(entry.name)) && (await inspectDownloadDirectory(entry)).hasFiles) {
          alreadyPresent = true;
          break;
        }
      }
      if (alreadyPresent) continue;
      const source = sources.find((item) => item.collectionName !== targetName) || sources[0];
      const targetNameOnDisk = await uniqueRecordFolderName(targetCollection, source.directory.name);
      const targetDirectory = await targetCollection.getDirectoryHandle(targetNameOnDisk, { create: true });
      try { await copyDirectoryContents(source.directory, targetDirectory); }
      catch (error) {
        await targetCollection.removeEntry(targetNameOnDisk, { recursive: true }).catch(() => {});
        throw error;
      }
      created.push({ collection: targetCollection, name: targetNameOnDisk });
    }
    return { sources, created };
  } catch (error) {
    for (const entry of created.reverse()) await entry.collection.removeEntry(entry.name, { recursive: true }).catch(() => {});
    throw error;
  }
}

async function removeVideoDownloadDirectories(downloadParent, video) {
  const matches = await listVideoDownloadDirectories(downloadParent, video);
  const failures = [];
  for (const match of matches) {
    try { await match.collectionHandle.removeEntry(match.directory.name, { recursive: true }); }
    catch (error) { failures.push(`${match.collectionName}/${match.directory.name}：${error.message}`); }
  }
  return failures;
}

async function removeCollectionDownloadDirectory(downloadParent, collectionName) {
  if (!downloadParent) return [];
  try { await downloadParent.removeEntry(collectionName, { recursive: true }); return []; }
  catch (error) {
    if (error?.name === "NotFoundError") return [];
    return [`${collectionName}：${error.message}`];
  }
}

function collectionAlreadyHasVideo(targetName, video) {
  const target = collections.find((collection) => collection.name === targetName);
  if (!target) return false;
  const wanted = videoIdentifierKeys(video);
  return target.videos.some((existing) => existing.id !== video.id && identifiersOverlap(videoIdentifierKeys(existing), wanted));
}

async function moveVideoRecordToTargets(video, targetNames, duplicateSets = null, downloadParent = null) {
  const targets = [...new Set(targetNames)].filter((name) => collections.some((collection) => collection.name === name));
  const copyTargets = targets.filter((name) => name !== video.collection);
  if (!copyTargets.length) return { moved: false, alreadyInTargets: true };
  const wantedKeys = videoIdentifierKeys(video);
  const duplicateTargets = copyTargets.filter((name) => {
    const known = duplicateSets?.get(name);
    return known ? identifiersOverlap(known, wantedKeys) : collectionAlreadyHasVideo(name, video);
  });
  const missingTargets = copyTargets.filter((name) => !duplicateTargets.includes(name));
  if (!missingTargets.length) return { moved: false, duplicate: true, duplicateTargets };

  const created = [];
  let downloadTransfer = { sources: [], created: [] };
  try {
    for (const targetName of missingTargets) {
      const result = await copyVideoRecord(video, targetName);
      created.push({ name: targetName, ...result });
      if (duplicateSets?.has(targetName)) wantedKeys.forEach((key) => duplicateSets.get(targetName).add(key));
    }
    downloadTransfer = await copyDownloadDirectories(downloadParent, video, targets);
    if (!targets.includes(video.collection)) await removeMovedSource(video);
  } catch (error) {
    for (const entry of downloadTransfer.created.reverse()) await entry.collection.removeEntry(entry.name, { recursive: true }).catch(() => {});
    for (const entry of created.reverse()) {
      await entry.targetCollection.removeEntry(entry.targetRecordName, { recursive: true }).catch(() => {});
      if (duplicateSets?.has(entry.name)) {
        const set = duplicateSets.get(entry.name);
        wantedKeys.forEach((key) => set.delete(key));
      }
    }
    throw error;
  }
  let downloadCleanupFailures = [];
  if (!targets.includes(video.collection)) {
    for (const source of downloadTransfer.sources) {
      try { await source.collectionHandle.removeEntry(source.directory.name, { recursive: true }); }
      catch (error) { downloadCleanupFailures.push(`${source.collectionName}/${source.directory.name}：${error.message}`); }
    }
  }
  return { moved: !targets.includes(video.collection), copied: missingTargets.length, duplicateTargets, downloadCleanupFailures };
}

function selectedActionTargetNames() {
  return [...collectionActionList.querySelectorAll('input[type="checkbox"]:checked')].map((input) => input.value);
}

function updateCollectionActionSelection() {
  const names = selectedActionTargetNames();
  collectionActionCount.textContent = BcaI18n.t("已选 {count} 个收藏夹", { count: names.length });
  confirmCollectionActionButton.disabled = names.length === 0 || confirmCollectionActionButton.dataset.busy === "true";
}

function openCollectionActionDialog(videos, source) {
  if (!rootHandle || !videos.length) return;
  pendingCollectionAction = { videos, source };
  collectionActionTitle.textContent = videos.length === 1 ? BcaI18n.t("移动或复制视频") : BcaI18n.t("移动或复制 {count} 个视频", { count: videos.length });
  collectionActionSummary.textContent = videos.length === 1
    ? BcaI18n.t("“{title}”当前位于“{collection}”。", { title: videos[0].title, collection: videos[0].collection })
    : BcaI18n.t("为所选的 {count} 个视频选择目标收藏夹。每个视频都会按其原收藏夹分别判断移动或复制。", { count: videos.length });
  collectionActionList.replaceChildren();
  const sourceCollections = new Set(videos.map((video) => video.collection));
  if (!collections.length) {
    const empty = document.createElement("p");
    empty.className = "collection-action-empty";
    empty.textContent = BcaI18n.t("本地收藏库中还没有收藏夹。");
    collectionActionList.append(empty);
  }
  for (const collection of collections) {
    const row = document.createElement("label");
    row.className = "collection-action-row";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = collection.name;
    checkbox.addEventListener("change", updateCollectionActionSelection);
    const icon = document.createElement("span");
    icon.className = "collection-action-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.innerHTML = BcaIcons.svg("collection");
    const name = document.createElement("span");
    name.className = "collection-action-name";
    name.textContent = collection.name;
    if (sourceCollections.has(collection.name)) {
      const sourceBadge = document.createElement("small");
      sourceBadge.className = "collection-source-badge";
      sourceBadge.textContent = BcaI18n.t("原收藏夹");
      name.append(sourceBadge);
    }
    const count = document.createElement("small");
    count.className = "collection-action-video-count";
    count.textContent = BcaI18n.t("{count} 个视频", { count: collection.videos.length });
    row.append(checkbox, icon, name, count);
    collectionActionList.append(row);
  }
  confirmCollectionActionButton.dataset.busy = "false";
  confirmCollectionActionButton.textContent = BcaI18n.t("确认");
  cancelCollectionActionButton.disabled = false;
  updateCollectionActionSelection();
  collectionActionDialog.showModal();
}

async function confirmCollectionAction() {
  const action = pendingCollectionAction;
  if (!action || confirmCollectionActionButton.dataset.busy === "true") return;
  const targetNames = selectedActionTargetNames();
  if (!targetNames.length) { showToast(BcaI18n.t("请选择一个或多个收藏夹。")); return; }
  confirmCollectionActionButton.dataset.busy = "true";
  confirmCollectionActionButton.disabled = true;
  confirmCollectionActionButton.textContent = BcaI18n.t("正在整理…");
  cancelCollectionActionButton.disabled = true;
  selectAllActionTargetsButton.disabled = true;
  clearActionTargetsButton.disabled = true;
  collectionActionList.querySelectorAll("input").forEach((input) => { input.disabled = true; });
  try {
    const permissionRequest = rootHandle.requestPermission({ mode: "readwrite" });
    if (await permissionRequest !== "granted") throw new Error(BcaI18n.t("没有获得本地目录写入权限。"));
    const downloadParent = action.videos.some((video) => video.hasDownloadFiles) ? await getWritableDownloadParent() : null;
    const duplicateSets = new Map(targetNames.map((name) => [
      name,
      new Set(allVideos().filter((video) => video.collection === name).flatMap((video) => Array.from(videoIdentifierKeys(video))))
    ]));
    let moved = 0;
    let copied = 0;
    let duplicates = 0;
    let alreadyThere = 0;
    const downloadCleanupWarnings = [];
    const failures = [];
    const remainingIds = new Set();
    for (const video of action.videos) {
      try {
        const result = await moveVideoRecordToTargets(video, targetNames, duplicateSets, downloadParent);
        duplicates += result.duplicateTargets?.length || 0;
        downloadCleanupWarnings.push(...(result.downloadCleanupFailures || []));
        if (result.duplicate) remainingIds.add(video.id);
        else if (result.alreadyInTargets) { alreadyThere += 1; remainingIds.add(video.id); }
        else if (result.moved) moved += 1;
        else if (result.copied) copied += 1;
        else remainingIds.add(video.id);
      } catch (error) {
        failures.push(BcaI18n.t("{name}：{message}", { name: video.title, message: error?.message || BcaI18n.t("本地文件操作失败") }));
        remainingIds.add(video.id);
      }
    }
    pendingCollectionAction = null;
    collectionActionDialog.close();
    if (moved || copied) {
      if (action.source === "detail") closeDetail();
      else if (moved && targetNames.length === 1) selectedCollection = targetNames[0];
      selectedVideoIds = remainingIds;
      await displayRoot(rootHandle, selectedCollection);
      if (action.source === "batch" && remainingIds.size === 0) setSelectionMode(false);
      else if (action.source === "batch") updateBatchControls();
    }
    const messages = [];
    if (moved) messages.push(BcaI18n.t("已移动 {count} 个视频", { count: moved }));
    if (copied) messages.push(BcaI18n.t("已复制 {count} 个视频", { count: copied }));
    if (duplicates) messages.push(BcaI18n.t("重复项 {count} 个，已跳过", { count: duplicates }));
    if (alreadyThere) messages.push(BcaI18n.t("{count} 个视频已在所选收藏夹中", { count: alreadyThere }));
    if (downloadCleanupWarnings.length) messages.push(BcaI18n.t("下载文件已复制，但有 {count} 个旧目录未能清理", { count: downloadCleanupWarnings.length }));
    if (failures.length) messages.push(BcaI18n.t("{count} 个失败，仍保留选中：{first}", { count: failures.length, first: failures[0] }));
    showToast(messages.join("；") || BcaI18n.t("没有需要整理的视频。原视频已保留。"));
  } catch (error) {
    showToast(BcaI18n.t("整理失败：{message}", { message: error?.message || BcaI18n.t("本地文件操作失败。") }));
  } finally {
    confirmCollectionActionButton.dataset.busy = "false";
    confirmCollectionActionButton.textContent = BcaI18n.t("确认");
    cancelCollectionActionButton.disabled = false;
    selectAllActionTargetsButton.disabled = false;
    clearActionTargetsButton.disabled = false;
    collectionActionList.querySelectorAll("input").forEach((input) => { input.disabled = false; });
    updateCollectionActionSelection();
  }
}

// “；N 个下载目录未能删除”这半句在几个 toast 里都出现，抽出来保证词条只有一条
function downloadCleanupSuffix(count) {
  return count ? BcaI18n.t("；{count} 个下载目录未能删除", { count }) : "";
}

async function confirmPendingDelete() {
  const action = pendingDeleteAction;
  if (!action) return;
  deleteInProgress = true;
  cancelDeleteButton.disabled = true;
  confirmDeleteButton.disabled = true;
  confirmDeleteButton.textContent = action.type === "collection" ? BcaI18n.t("正在删除收藏夹…") : action.type === "batch" ? BcaI18n.t("正在批量删除…") : BcaI18n.t("正在删除…");
  try {
    const permissionRequest = rootHandle.requestPermission({ mode: "readwrite" });
    if (await permissionRequest !== "granted") throw new Error(BcaI18n.t("没有获得本地目录写入权限。"));
    const deleteDownloads = deleteAssociatedDownloads.checked;
    const downloadParent = deleteDownloads ? await getWritableDownloadParent() : null;
    const downloadCleanupFailures = [];
    let batchResult = null;
    if (action.type === "collection") {
      await rootHandle.removeEntry(action.collection.name, { recursive: true });
      if (selectedCollection === action.collection.name) selectedCollection = "*";
      if (deleteDownloads && downloadParent) {
        downloadCleanupFailures.push(...await removeCollectionDownloadDirectory(downloadParent, action.collection.name));
        for (const video of action.collection.videos) downloadCleanupFailures.push(...await removeVideoDownloadDirectories(downloadParent, video));
      }
    } else if (action.type === "batch") {
      let deleted = 0;
      const failures = [];
      for (const video of action.videos) {
        try {
          const collectionHandle = await rootHandle.getDirectoryHandle(video.collection);
          await collectionHandle.removeEntry(video.directory, { recursive: true });
          if (deleteDownloads && downloadParent) downloadCleanupFailures.push(...await removeVideoDownloadDirectories(downloadParent, video));
          selectedVideoIds.delete(video.id);
          deleted += 1;
        } catch (error) {
          failures.push(BcaI18n.t("{name}：{message}", { name: video.title, message: error?.message || BcaI18n.t("删除失败") }));
        }
      }
      batchResult = { deleted, failures };
    } else {
      const video = action.video;
      const collectionHandle = await rootHandle.getDirectoryHandle(video.collection);
      await collectionHandle.removeEntry(video.directory, { recursive: true });
      if (deleteDownloads && downloadParent) downloadCleanupFailures.push(...await removeVideoDownloadDirectories(downloadParent, video));
    }
    deleteInProgress = false;
    closeDeleteConfirmation();
    closeDetail();
    await displayRoot(rootHandle, selectedCollection);
    if (action.type === "collection") {
      showToast(BcaI18n.t("已删除本地收藏夹“{name}”", { name: action.collection.name }) + downloadCleanupSuffix(downloadCleanupFailures.length));
    } else if (action.type === "batch") {
      if (!batchResult.failures.length) setSelectionMode(false);
      showToast(batchResult.failures.length
        ? BcaI18n.t("已删除 {deleted} 个，{failed} 个失败并保留选中。{first}", { deleted: batchResult.deleted, failed: batchResult.failures.length, first: batchResult.failures[0] })
        : BcaI18n.t("已删除 {count} 个本地视频", { count: batchResult.deleted }) + downloadCleanupSuffix(downloadCleanupFailures.length));
    } else {
      showToast(BcaI18n.t("已删除本地归档") + downloadCleanupSuffix(downloadCleanupFailures.length));
    }
  } catch (error) {
    showToast(BcaI18n.t("删除失败：{message}", { message: error?.message || BcaI18n.t("本地文件操作失败。") }));
  } finally {
    deleteInProgress = false;
    cancelDeleteButton.disabled = false;
    confirmDeleteButton.disabled = false;
    confirmDeleteButton.textContent = action.type === "collection" ? BcaI18n.t("删除收藏夹") : action.type === "batch" ? BcaI18n.t("删除 {count} 个视频", { count: action.videos.length }) : BcaI18n.t("删除本地文件");
  }
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3000);
}

function validateCollectionName(rawName) {
  const name = String(rawName || "").trim();
  if (!name) throw new Error(BcaI18n.t("请输入收藏夹名称。"));
  if (name.length > 120) throw new Error(BcaI18n.t("收藏夹名称不能超过 120 个字符。"));
  if (/[<>:"/\\|?*\u0000-\u001f]/.test(name) || /[. ]$/.test(name)) {
    throw new Error(BcaI18n.t("名称包含本地文件夹不支持的字符，或以点号、空格结尾。"));
  }
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(name)) {
    throw new Error(BcaI18n.t("这个名称是 Windows 保留名称，请换一个名称。"));
  }
  if (["错误报告", "001错误报告", "000视频下载", "视频下载"].includes(name)) throw new Error(BcaI18n.t("这是插件保留目录，请换一个名称。"));
  return name;
}

function openCreateCollectionDialog() {
  if (!rootHandle || library.hidden) { showToast(BcaI18n.t("请先打开本地收藏根目录。")); return; }
  collectionNameInput.value = "";
  collectionDialog.showModal();
  collectionNameInput.focus();
}

function openAddVideoDialog() {
  if (!rootHandle || selectedCollection === "*") { showToast(BcaI18n.t("请先选择一个收藏夹。")); return; }
  renderTargetChoices(videoTargetOptions, [selectedCollection]);
  videoIdentifierInput.value = "";
  videoDialog.showModal();
  videoIdentifierInput.focus();
}

collectionForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (collectionCreateInProgress || !rootHandle) return;
  let name;
  try { name = validateCollectionName(collectionNameInput.value); }
  catch (error) { showToast(error.message); collectionNameInput.focus(); return; }
  collectionCreateInProgress = true;
  submitCreateCollectionButton.disabled = true;
  cancelCreateCollectionButton.disabled = true;
  submitCreateCollectionButton.textContent = BcaI18n.t("正在创建…");
  try {
    const permissionRequest = rootHandle.requestPermission({ mode: "readwrite" });
    if (await permissionRequest !== "granted") throw new Error(BcaI18n.t("没有获得本地目录写入权限。"));
    try {
      await rootHandle.getDirectoryHandle(name);
      throw new Error(BcaI18n.t("收藏夹“{name}”已存在。", { name }));
    } catch (error) {
      if (error?.name !== "NotFoundError") throw error;
    }
    await rootHandle.getDirectoryHandle(name, { create: true });
    collectionDialog.close();
    collectionForm.reset();
    await displayRoot(rootHandle, name);
    showToast(BcaI18n.t("已新建收藏夹“{name}”", { name }));
  } catch (error) {
    showToast(BcaI18n.t("创建失败：{message}", { message: error?.message || BcaI18n.t("本地文件夹操作失败。") }));
  } finally {
    collectionCreateInProgress = false;
    submitCreateCollectionButton.disabled = false;
    cancelCreateCollectionButton.disabled = false;
    submitCreateCollectionButton.textContent = BcaI18n.t("创建收藏夹");
  }
});

videoForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (videoAddInProgress || !rootHandle || selectedCollection === "*") return;
  const identifier = videoIdentifierInput.value.trim();
  const collectionNames = selectedTargetNames(videoTargetOptions);
  if (!collectionNames.length) { showToast(BcaI18n.t("请选择一个或多个目标收藏夹。")); return; }
  videoAddInProgress = true;
  submitAddVideoButton.disabled = true;
  cancelAddVideoButton.disabled = true;
  submitAddVideoButton.textContent = BcaI18n.t("正在解析并保存…");
  try {
    const permissionRequest = rootHandle.requestPermission({ mode: "readwrite" });
    if (await permissionRequest !== "granted") throw new Error(BcaI18n.t("没有获得本地目录写入权限。"));
    const result = await chrome.runtime.sendMessage({
      type: "add-manual-video",
      data: { identifier, collections: collectionNames }
    });
    if (!result?.ok) throw new Error(result?.message || BcaI18n.t("B 站视频解析或本地保存失败。"));
    videoDialog.close();
    videoForm.reset();
    const collectionToSelect = collectionNames.includes(selectedCollection) ? selectedCollection : collectionNames[0];
    await displayRoot(rootHandle, collectionToSelect);
    showToast(result.message ? BcaI18n.t(result.message) : BcaI18n.t("视频已添加到本地收藏夹"));
  } catch (error) {
    showToast(BcaI18n.t("添加失败：{message}", { message: error?.message || BcaI18n.t("无法解析或保存视频。") }));
  } finally {
    videoAddInProgress = false;
    submitAddVideoButton.disabled = false;
    cancelAddVideoButton.disabled = false;
    submitAddVideoButton.textContent = BcaI18n.t("解析并保存");
  }
});

collectionDialog.addEventListener("cancel", (event) => { if (collectionCreateInProgress) event.preventDefault(); });
videoDialog.addEventListener("cancel", (event) => { if (videoAddInProgress) event.preventDefault(); });

async function displayRoot(handle, collectionToSelect = "*", toastVerb = BcaI18n.t("已读取")) {
  for (const url of coverUrls) URL.revokeObjectURL(url);
  coverUrls = [];
  const preserveDownloadStatuses = rootHandle === handle;
  rootHandle = handle;
  const result = await scanRoot(handle, preserveDownloadStatuses);
  collections = applyCollectionOrder(result.collections);
  const existingVideoIds = new Set(allVideos().map((video) => video.id));
  for (const id of selectedVideoIds) if (!existingVideoIds.has(id)) selectedVideoIds.delete(id);
  selectedCollection = collectionToSelect === "*" || result.collections.some((collection) => collection.name === collectionToSelect) ? collectionToSelect : "*";
  setDynamicText(rootLabel, handle.name);
  statusDot.classList.add("ready");
  refreshLibraryButton.disabled = false;
  scanNotice.hidden = result.issues.length === 0;
  scanNotice.textContent = result.issues.length ? BcaI18n.t("有 {count} 个目录未能读取：{list}", { count: result.issues.length, list: `${result.issues.slice(0, 4).join("；")}${result.issues.length > 4 ? "；…" : ""}` }) : "";
  welcome.hidden = true;
  library.hidden = false;
  renderCollections();
  renderVideos();
  syncDetailDownloadAction();
  showToast(BcaI18n.t("{verb} {count} 个视频", { verb: toastVerb, count: allVideos().length }));
  // 大目录的递归体积统计很慢，放在渲染之后异步跑，不阻塞界面
  updateStorageUsage(handle);
}

function syncDetailDownloadAction() {
  const button = detailContent.querySelector(".open-download-directory");
  if (!button) return;
  const video = detailVideo();
  const hasDownloadFiles = Boolean(video?.hasDownloadFiles);
  button.hidden = !hasDownloadFiles;
  const copyButton = detailContent.querySelector(".copy-download-path");
  if (copyButton) copyButton.hidden = !hasDownloadFiles;
  if (!hasDownloadFiles) setDownloadPathNote("");
}

async function refreshDownloadStatuses() {
  if (!rootHandle || downloadStatusCheckRunning) return;
  downloadStatusCheckRunning = true;
  try {
    const index = await scanDownloadedDirectories(rootHandle);
    // A denied custom-folder permission means the status is unknown, not that files vanished.
    if (!index) return;
    let changed = false;
    for (const video of allVideos()) {
      const match = matchDownloadedDirectory(video, index);
      const downloaded = Boolean(match?.hasMedia);
      const hasDownloadFiles = Boolean(match?.hasFiles);
      if (video.downloaded !== downloaded || video.hasDownloadFiles !== hasDownloadFiles || video.downloadDirectoryName !== (match?.name || "") || video.downloadCollectionName !== (match?.collectionName || "")) changed = true;
      video.downloaded = downloaded;
      video.hasDownloadFiles = hasDownloadFiles;
      video.downloadDirectoryName = match?.name || "";
      video.downloadCollectionName = match?.collectionName || "";
      video.downloadDirectoryHandle = match?.handle || null;
    }
    if (changed) renderVideos();
    syncDetailDownloadAction();
  } finally { downloadStatusCheckRunning = false; }
}

// chooseRoot 的文案（选择根目录 + 四种扫描中的提示）全部写在 HTML 里，
// 每段各自带 data-i18n，这里只切换显示哪一段；busyKey 传的是 HTML 里的 ASCII 键名。
function showChooseRootLabel(busyKey = "idle") {
  chooseRoot.querySelectorAll("[data-busy-label]").forEach((label) => {
    label.hidden = label.dataset.busyLabel !== busyKey;
  });
  const icon = chooseRoot.querySelector(".choose-root-icon");
  if (icon) icon.hidden = busyKey !== "idle";
}

function setBusy(isBusy, busyKey = "reading") {
  chooseRoot.disabled = isBusy;
  refreshLibraryButton.disabled = isBusy || !rootHandle;
  refreshLibraryButton.classList.toggle("is-loading", isBusy);
  welcomeChoose.disabled = isBusy;
  // 大目录扫描时给一条进度提示，而不是只有按钮文字变化
  scanProgress.hidden = !isBusy;
  showChooseRootLabel(isBusy ? busyKey : "idle");
}

async function refreshCurrentRoot() {
  if (!rootHandle) { showToast(BcaI18n.t("请先选择本地收藏根目录。")); return; }
  const collectionToKeep = selectedCollection;
  setBusy(true, "refreshing");
  try {
    const permissionRequest = rootHandle.requestPermission({ mode: "read" });
    if (await permissionRequest !== "granted") throw new Error(BcaI18n.t("没有获得本地目录读取权限。"));
    await displayRoot(rootHandle, collectionToKeep, BcaI18n.t("已刷新"));
  } catch (error) {
    if (error?.name !== "AbortError") showToast(BcaI18n.t("刷新失败：{message}", { message: error?.message || BcaI18n.t("无法读取本地目录。") }));
  } finally { setBusy(false); }
}

async function chooseAndScan() {
  if (!window.showDirectoryPicker) { showToast(BcaI18n.t("当前 Chrome 暂不支持本地目录访问，请更新浏览器后重试。")); return; }
  setBusy(true);
  try {
    const handle = await window.showDirectoryPicker({ mode: "read" });
    const permission = await handle.requestPermission({ mode: "read" });
    if (permission !== "granted") throw new Error(BcaI18n.t("未获得读取目录的权限。"));
    await saveHandle(handle);
    await displayRoot(handle);
  } catch (error) {
    if (error?.name !== "AbortError") showToast(error?.message || BcaI18n.t("读取目录失败。"));
  } finally { setBusy(false); }
}

async function continueWithLastRoot() {
  if (!rootHandle) { await chooseAndScan(); return; }
  setBusy(true, "connecting");
  try {
    const permissionRequest = rootHandle.requestPermission({ mode: "read" });
    const permission = await permissionRequest;
    if (permission !== "granted") throw new Error(BcaI18n.t("没有获得上次目录的读取权限。可使用右上角按钮重新选择目录。"));
    await displayRoot(rootHandle);
  } catch (error) {
    if (error?.name !== "AbortError") showToast(error?.message || BcaI18n.t("连接上次目录失败。"));
  } finally { setBusy(false); }
}

// welcomeChoose 的两段文案都写在 HTML 里，这里只切换显示哪一段（箭头图标固定在右边）
function showWelcomeChooseLabel(mode) {
  welcomeChoose.querySelectorAll("[data-label]").forEach((label) => {
    label.hidden = label.dataset.label !== mode;
  });
}

async function restoreLastRoot() {
  try {
    const handle = await loadSavedHandle();
    if (!handle) return;
    rootHandle = handle;
    setDynamicText(rootLabel, handle.name);
    setDynamicText(welcomeCopy, BcaI18n.t("已找到上次选择的目录“{name}”。正在检查访问权限。", { name: handle.name }));
    const permission = await handle.queryPermission({ mode: "read" });
    if (permission === "granted") {
      setBusy(true, "loading-last");
      try { await displayRoot(handle); }
      finally { setBusy(false); }
      return;
    }
    showWelcomeChooseLabel("authorize");
    setDynamicText(welcomeCopy, BcaI18n.t("上次选择的目录是“{name}”。点击继续并按提示授权，无需重新选择路径。", { name: handle.name }));
    setDynamicText(welcomeFootnote, BcaI18n.t("如果目录已移动或删除，再使用右上角按钮选择新位置。"));
  } catch (error) {
    rootHandle = null;
    setDynamicText(rootLabel, BcaI18n.t("上次目录无法访问"));
    updateStorageUsage(null);
    statusDot.classList.remove("ready");
    setDynamicText(welcomeCopy, BcaI18n.t("上次选择的目录暂时无法访问，请重新选择收藏根目录。"));
    showWelcomeChooseLabel("choose");
    showToast(error?.message || BcaI18n.t("无法连接上次选择的目录。"));
  }
}

chooseRoot.addEventListener("click", chooseAndScan);
refreshLibraryButton.addEventListener("click", refreshCurrentRoot);
welcomeChoose.addEventListener("click", () => rootHandle ? continueWithLastRoot() : chooseAndScan());
createCollectionButton.addEventListener("click", openCreateCollectionDialog);
addVideoButton.addEventListener("click", openAddVideoDialog);
batchManageButton.addEventListener("click", () => setSelectionMode(!selectionMode));
selectVisibleButton.addEventListener("click", toggleVisibleSelection);
exitBatchButton.addEventListener("click", () => setSelectionMode(false));
moveSelectedButton.addEventListener("click", () => openCollectionActionDialog(selectedRecords(), "batch"));
downloadSelectedButton.addEventListener("click", () => openDownloadInterface(selectedRecords()));
deleteSelectedButton.addEventListener("click", () => askToDeleteBatch(selectedRecords()));
searchInput.addEventListener("input", () => { resetPaging(); renderVideos(); });
sortSelect.addEventListener("change", () => { resetPaging(); renderVideos(); });

/* ---------------- 4.5：主题与语言切换 ---------------- */

// 主题标签必须写成字面量：词条工具靠扫描 t("...") 取词，
// 从 theme.js 的对象里取 label 会扫不到，那三个词就永远不会被翻译。
function themeLabel(id) {
  if (id === "light") return BcaI18n.t("白天");
  if (id === "dark") return BcaI18n.t("夜晚");
  return BcaI18n.t("跟随系统");
}
function renderThemeOptions() {
  themeSelect.replaceChildren(...BcaTheme.modes().map((item) => {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = themeLabel(item.id);
    return option;
  }));
  themeSelect.value = BcaTheme.current();
}
renderThemeOptions();
themeSelect.addEventListener("change", () => BcaTheme.use(themeSelect.value));

localeSelect.replaceChildren(...BcaI18n.locales().map((item) => {
  const option = document.createElement("option");
  option.value = item.id;
  // 语言名用各自的写法，不翻译
  option.textContent = item.label;
  return option;
}));
localeSelect.value = BcaI18n.locale();
localeSelect.addEventListener("change", async () => {
  await BcaI18n.use(localeSelect.value);
});

// 切语言后要重画所有由 JS 生成的文字
function relabelAfterLocaleChange() {
  localeSelect.value = BcaI18n.locale();
  renderThemeOptions();
  renderCollections();
  renderVideos();
  const current = detailVideo();
  if (current) openDetail(current);
}
BcaI18n.onChange(() => relabelAfterLocaleChange());
videoFilterSelect.addEventListener("change", () => { resetPaging(); renderVideos(); });
clearSearch.addEventListener("click", () => { searchInput.value = ""; resetPaging(); renderVideos(); searchInput.focus(); });
viewGridButton?.addEventListener("click", () => setViewMode("grid"));
viewListButton?.addEventListener("click", () => setViewMode("list"));


// 4.4：更新状态时的进度回报
chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== "bca-status-progress") return;
  const status = detailContent.querySelector(".detail-refresh-status");
  if (status && statusRefreshInProgress) { status.hidden = false; status.textContent = message.text ? BcaI18n.t(message.text) : BcaI18n.t("正在更新…"); }
});
dismissImportHintButton?.addEventListener("click", dismissImportHint);
closeDetailButton.addEventListener("click", closeDetail);
detailBackdrop.addEventListener("click", closeDetail);
cancelDeleteButton.addEventListener("click", closeDeleteConfirmation);
confirmDeleteButton.addEventListener("click", confirmPendingDelete);
cancelCreateCollectionButton.addEventListener("click", () => collectionDialog.close());
cancelAddVideoButton.addEventListener("click", () => videoDialog.close());
cancelCollectionActionButton.addEventListener("click", () => {
  if (confirmCollectionActionButton.dataset.busy !== "true") {
    pendingCollectionAction = null;
    collectionActionDialog.close();
  }
});
collectionActionDialog.addEventListener("cancel", (event) => {
  if (confirmCollectionActionButton.dataset.busy === "true") {
    event.preventDefault();
    return;
  }
  pendingCollectionAction = null;
});
confirmCollectionActionButton.addEventListener("click", confirmCollectionAction);
selectAllActionTargetsButton.addEventListener("click", () => {
  collectionActionList.querySelectorAll('input[type="checkbox"]').forEach((input) => { input.checked = true; });
  updateCollectionActionSelection();
});
clearActionTargetsButton.addEventListener("click", () => {
  collectionActionList.querySelectorAll('input[type="checkbox"]').forEach((input) => { input.checked = false; });
  updateCollectionActionSelection();
});
confirmBackdrop.addEventListener("click", (event) => {
  if (event.target === confirmBackdrop && !deleteInProgress) closeDeleteConfirmation();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (!confirmBackdrop.hidden) {
      if (!deleteInProgress) closeDeleteConfirmation();
      return;
    }
    closeDetail();
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k" && !library.hidden) { event.preventDefault(); searchInput.focus(); }
  // 批量模式下支持 Ctrl/⌘ + A 全选当前结果（非批量模式不拦截浏览器默认行为）
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a" && selectionMode) {
    const typing = event.target instanceof HTMLElement && ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName);
    if (!typing) { event.preventDefault(); selectAllVisible(); }
  }
});
window.addEventListener("beforeunload", () => coverUrls.forEach(URL.revokeObjectURL));
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  if (changes.downloadRevision && rootHandle) refreshDownloadStatuses();
  // 4.5：在弹窗或下载页改了语言时，已经打开的收藏库也要跟上
  const next = changes[BcaI18n.STORAGE_KEY]?.newValue;
  if (BcaI18n.isSupported(next) && next !== BcaI18n.locale()) BcaI18n.use(next, { silent: true });
});
window.addEventListener("focus", refreshDownloadStatuses);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") refreshDownloadStatuses();
});
window.setInterval(() => {
  if (!library.hidden && document.visibilityState === "visible") refreshDownloadStatuses();
}, 60000);
BcaI18n.init().catch(() => {}).then(() => Promise.all([
  restoreCollectionOrder().catch(() => { collectionOrder = []; }),
  restoreViewSettings(),
  restoreImportHint(),
  clearLegacySafetyDismissed()
])).finally(() => {
  applyViewMode();
  restoreLastRoot();
});

// 侧栏版本号从 manifest 读取，避免再次出现“界面写着 3.6、实际是 3.7”的错位
try {
  const sideVersion = document.getElementById("sideVersion");
  if (sideVersion) sideVersion.textContent = chrome.runtime.getManifest().version;
} catch (_) {}
