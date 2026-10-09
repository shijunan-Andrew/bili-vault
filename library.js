const DB_NAME = "bili-fav-archiver";
const DB_STORE = "settings";

const collectionList = document.getElementById("collectionList");
const collectionTotal = document.getElementById("collectionTotal");
const rootLabel = document.getElementById("rootLabel");
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
const videoGrid = document.getElementById("videoGrid");
const searchInput = document.getElementById("searchInput");
const sortSelect = document.getElementById("sortSelect");
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

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(DB_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("无法读取已保存的目录设置。"));
  });
}

async function saveHandle(handle) {
  const db = await openDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      tx.objectStore(DB_STORE).put(handle, "rootHandle");
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error("保存目录授权失败。"));
    });
  } finally { db.close(); }
}

async function loadSavedHandle() {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(DB_STORE, "readonly").objectStore(DB_STORE).get("rootHandle");
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error("无法读取上次选择的目录。"));
    });
  } finally { db.close(); }
}

async function readSavedSetting(key) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(DB_STORE, "readonly").objectStore(DB_STORE).get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error("无法读取本地目录设置。"));
    });
  } finally { db.close(); }
}

function parseInfo(text) {
  const fields = {};
  const sections = {};
  let section = "基本信息";
  for (const line of text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").split("\n")) {
    const heading = line.match(/^【(.+?)】\s*$/);
    if (heading) { section = heading[1]; sections[section] ||= []; continue; }
    if (section === "视频简介") {
      if (line.trim()) sections[section].push(line);
      continue;
    }
    if (section === "标签") {
      if (line.trim() && !["无", "未知"].includes(line.trim())) {
        sections[section].push(...line.split(/[、,，]/).map((tag) => tag.trim()).filter(Boolean));
      }
      continue;
    }
    const divider = line.indexOf("：") >= 0 ? line.indexOf("：") : line.indexOf(":");
    if (divider > 0) {
      const key = line.slice(0, divider).trim();
      const value = line.slice(divider + 1).trim();
      if (key) fields[key] = value;
    } else if (line.trim()) {
      sections[section] ||= [];
      sections[section].push(line.trim());
    }
  }
  return { fields, sections, raw: text };
}

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
          favoriteAt: date,
          savedAt: field(info, "信息保存于"),
          timestamp: parseDate(date, recordEntry.name),
          category: field(info, "分区"),
          duration: field(info, "视频时长"),
          publishDate: field(info, "视频发布时间"),
          description: info.sections["视频简介"]?.join("\n") || field(info, "视频简介") || "",
          tags: info.sections["标签"] || [],
          info,
          cover
        });
      } catch (error) {
        issues.push(`${collectionEntry.name}/${recordEntry.name}：${error.message || "读取失败"}`);
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
  chrome.storage.local.set({ collectionOrder }).then(() => showToast("收藏夹顺序已保存")).catch((error) => showToast(`保存排序失败：${error?.message || "插件存储不可用"}`));
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
  const rows = [{ name: "全部收藏", key: "*", count: total, glyph: "▦" }, ...collections.map((item, index) => ({ name: item.name, key: item.name, count: item.videos.length, glyph: ["▤", "▣", "▧", "▥"][index % 4] }))];
  collectionList.replaceChildren(...rows.map((row) => {
    const wrapper = document.createElement("div");
    wrapper.className = "collection-row";
    const button = document.createElement("button");
    button.className = `collection-button${selectedCollection === row.key ? " active" : ""}`;
    button.type = "button";
    button.setAttribute("aria-current", selectedCollection === row.key ? "page" : "false");
    button.innerHTML = `<span class="collection-glyph" aria-hidden="true">${row.glyph}</span><span class="collection-name"></span>${row.key === "*" ? "" : '<span class="collection-drag-handle" title="按住拖动调整顺序" aria-hidden="true">⠿</span>'}<span class="collection-count">${row.count}</span>`;
    button.querySelector(".collection-name").textContent = row.name;
    button.addEventListener("click", () => {
      if (selectedCollection !== row.key) selectedVideoIds.clear();
      selectedCollection = row.key;
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
      deleteButton.textContent = "×";
      deleteButton.title = `删除收藏夹“${row.name}”`;
      deleteButton.setAttribute("aria-label", `删除收藏夹 ${row.name}`);
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
  selectedCount.textContent = `已选 ${records.length} 个`;
  const allVisibleSelected = visibleVideoIds.length > 0 && visibleVideoIds.every((id) => selectedVideoIds.has(id));
  selectVisibleButton.textContent = allVisibleSelected ? "取消当前结果选择" : "全选当前结果";
  selectVisibleButton.disabled = visibleVideoIds.length === 0;
  moveSelectedButton.disabled = records.length === 0;
  downloadSelectedButton.disabled = records.length === 0;
  deleteSelectedButton.disabled = records.length === 0;
}

function setSelectionMode(enabled) {
  selectionMode = enabled;
  library.classList.toggle("batch-mode", selectionMode);
  batchToolbar.hidden = !selectionMode;
  batchManageButton.classList.toggle("button-primary", selectionMode);
  batchManageButton.classList.toggle("button-quiet", !selectionMode);
  batchManageButton.textContent = selectionMode ? "完成" : "批量管理";
  batchManageButton.setAttribute("aria-pressed", String(selectionMode));
  if (!selectionMode) selectedVideoIds.clear();
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
  if (!cover) return '<div class="cover-fallback" aria-label="没有封面"></div>';
  return `<img src="${cover}" alt="" loading="lazy">`;
}

function renderVideos() {
  const collectionName = selectedCollection === "*" ? "全部收藏" : selectedCollection;
  currentCollection.textContent = collectionName;
  pageTitle.textContent = collectionName;
  const videos = selectedVideos();
  batchManageButton.disabled = videos.length === 0;
  addVideoButton.disabled = selectedCollection === "*";
  addVideoButton.title = selectedCollection === "*" ? "请先选择一个收藏夹" : `添加视频到“${selectedCollection}”`;
  videoFilter = videoFilterSelect.value;
  const query = searchInput.value.trim().toLocaleLowerCase();
  const matching = videos.filter((video) => (videoFilter === "all" || (videoFilter === "invalid" && video.isInvalid) || (videoFilter === "downloaded" && video.downloaded)) && (!query || [video.title, video.upName, video.bvid, video.category, video.collection, video.description, ...video.tags].join(" ").toLocaleLowerCase().includes(query)));
  visibleVideoIds = matching.map((video) => video.id);
  const sort = sortSelect.value;
  matching.sort((a, b) => sort === "title" ? a.title.localeCompare(b.title, "zh-CN") : sort === "oldest" ? a.timestamp - b.timestamp : b.timestamp - a.timestamp);
  const countLabel = videoFilter !== "all"
    ? `${matching.length} / ${videos.filter((video) => videoFilter === "invalid" ? video.isInvalid : video.downloaded).length} 个${videoFilter === "invalid" ? "失效" : "已下载"}视频`
    : query ? `${matching.length} / ${videos.length} 个视频` : `${videos.length} 个视频`;
  resultSummary.textContent = selectedCollection === "*" ? `${countLabel}，来自 ${collections.length} 个收藏夹` : countLabel;
  videoGrid.replaceChildren(...matching.map((video) => {
    const card = document.createElement("article");
    card.className = "video-card";
    card.classList.toggle("invalid-video", video.isInvalid);
    card.classList.toggle("downloaded-video", video.downloaded);
    card.dataset.videoId = video.id;
    card.classList.toggle("selected", selectedVideoIds.has(video.id));
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", selectionMode ? `选择视频：${video.title}` : `查看视频：${video.title}`);
    card.innerHTML = `<div class="card-cover">${safeCover(video.cover)}<span class="invalid-badge">已失效</span><span class="downloaded-badge"${video.downloaded ? "" : " hidden"}>已下载</span><span class="cover-badge"></span><input class="card-select" type="checkbox" aria-label="选择视频"></div><div class="card-body"><div class="card-title"></div><div class="card-meta"><span class="card-up"></span><span class="card-date"></span></div></div>`;
    const checkbox = card.querySelector(".card-select");
    checkbox.checked = selectedVideoIds.has(video.id);
    checkbox.addEventListener("click", (event) => event.stopPropagation());
    checkbox.addEventListener("change", () => setVideoSelected(video.id, checkbox.checked));
    card.querySelector(".cover-badge").textContent = video.collection;
    card.querySelector(".card-title").textContent = video.title;
    card.querySelector(".card-up").textContent = video.upName || video.bvid || "本地收藏视频";
    card.querySelector(".card-date").textContent = compactDate(video.favoriteAt);
    card.addEventListener("click", () => selectionMode ? setVideoSelected(video.id, !selectedVideoIds.has(video.id)) : openDetail(video));
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
    emptySearch.querySelector("h2").textContent = videoFilter === "invalid" ? "没有已失效视频" : videoFilter === "downloaded" ? "没有已下载视频" : "没有找到相关视频";
    emptySearch.querySelector("p").textContent = videoFilter === "invalid" ? "当前收藏范围内没有检测到失效视频。" : videoFilter === "downloaded" ? "当前收藏范围内没有已下载的视频。" : "试试其他标题、UP 主名称或 BV 号。";
    clearSearch.hidden = videoFilter !== "all" && !query;
  } else {
    clearSearch.hidden = false;
  }
  videoGrid.hidden = videos.length === 0;
  if (!videos.length) {
    videoGrid.hidden = false;
    const emptyTitle = selectedCollection === "*" ? "本地收藏库里还没有视频" : "这个收藏夹里还没有视频";
    const emptyCopy = selectedCollection === "*" ? "选择一个收藏夹，或新建收藏夹并添加视频。" : "点击右上角“添加视频”，输入 B 站网址、BV 号或 av 号。";
    videoGrid.innerHTML = `<div class="empty-search" style="grid-column:1/-1"><div class="empty-search-icon">▤</div><h2>${emptyTitle}</h2><p>${emptyCopy}</p></div>`;
  }
  updateBatchControls();
}

function compactDate(value) {
  const match = value.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  return match ? `${match[1]}.${String(match[2]).padStart(2, "0")}.${String(match[3]).padStart(2, "0")}` : value;
}

function addField(rows, label, value) { if (value && value !== "未知") rows.push(`<dt>${label}</dt><dd>${escapeHtml(value)}</dd>`); }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]); }

function openDownloadInterface(videos) {
  if (!videos.length) return;
  const items = videos.map((video) => ({
    title: video.title || "未知", bvid: video.bvid || "", aid: video.aid || "",
    url: video.url || "", collection: video.collection || ""
  }));
  const tab = window.open("about:blank", "_blank");
  if (!tab) { showToast("浏览器拦截了下载页面，请允许本地收藏库打开新标签页。"); return; }
  const queueId = crypto.randomUUID();
  const storageKey = `bcaDownloadQueue:${queueId}`;
  chrome.storage.session.set({ [storageKey]: items }).then(() => {
    if (tab.closed) return chrome.storage.session.remove(storageKey);
    const target = new URL(chrome.runtime.getURL("download.html"));
    target.searchParams.set("queueId", queueId);
    tab.location.href = target.href;
  }).catch((error) => {
    try { tab.close(); } catch (_) {}
    showToast(`无法传递下载队列：${error?.message || "插件临时存储不可用"}`);
  });
}

function openDetail(video) {
  detailPanel.classList.toggle("invalid-video", video.isInvalid);
  const rows = [];
  addField(rows, "收藏时间", video.favoriteAt);
  addField(rows, "信息保存于", video.savedAt);
  addField(rows, "UP 主", video.upName);
  addField(rows, "UP 主 UID", video.upMid);
  if (video.upHome && /^https?:\/\//i.test(video.upHome)) rows.push(`<dt>UP 主主页</dt><dd><a class="detail-profile-link" href="${escapeHtml(video.upHome)}" target="_blank" rel="noopener noreferrer">打开 UP 主主页 ↗</a></dd>`);
  addField(rows, "分区", video.category);
  addField(rows, "视频时长", video.duration);
  addField(rows, "发布时间", video.publishDate);
  addField(rows, "BV 号", video.bvid);
  addField(rows, "av 号", video.aid);
  addField(rows, "归档目录", video.directory);
  const tags = video.tags.length ? `<div class="detail-tags">${video.tags.map((tag) => `<span class="detail-tag">${escapeHtml(tag)}</span>`).join("")}</div>` : '<p class="detail-description">暂无标签</p>';
  detailContent.dataset.videoId = video.id;
  detailContent.innerHTML = `<div class="detail-cover">${safeCover(video.cover)}</div><span class="detail-collection"></span><h2 class="detail-title"></h2><p class="detail-bvid"></p>${video.url ? '<a class="button button-primary open-video" target="_blank" rel="noopener noreferrer" href="">在 B 站打开视频 <span>↗</span></a>' : ""}<section class="detail-management"><h3>本地视频</h3><button class="button button-download download-local" type="button">下载视频</button><button class="button button-quiet open-download-directory" type="button"${video.hasDownloadFiles ? "" : " hidden"}>打开本地视频目录</button><button class="button button-quiet copy-download-path" type="button"${video.hasDownloadFiles ? "" : " hidden"}>复制视频目录路径</button><p class="download-path-note" role="status" hidden></p><h3>本地收藏管理</h3><button class="button button-primary move-local" type="button">移动或复制</button><button class="button button-danger delete-local" type="button">删除本地归档</button><p class="management-note">这些整理操作只影响本地归档，不会更改 B 站账户中的收藏。</p></section><h3 class="detail-section-title">视频信息</h3><dl class="detail-fields">${rows.join("")}</dl><h3 class="detail-section-title">标签</h3>${tags}<h3 class="detail-section-title">视频简介</h3><p class="detail-description"></p>`;
  detailContent.querySelector(".detail-collection").textContent = video.isInvalid ? `${video.collection} · 已失效` : video.collection;
  detailContent.querySelector(".detail-collection").classList.toggle("invalid", video.isInvalid);
  detailContent.querySelector(".detail-title").textContent = video.title;
  detailContent.querySelector(".detail-bvid").textContent = video.bvid ? `BV号 ${video.bvid}` : "本地归档";
  detailContent.querySelector(".detail-description").textContent = video.description || "暂无简介";
  const link = detailContent.querySelector(".open-video");
  if (link) link.href = video.url;
  const moveButton = detailContent.querySelector(".move-local");
  moveButton.addEventListener("click", () => openCollectionActionDialog([video], "detail"));
  detailContent.querySelector(".download-local").addEventListener("click", () => openDownloadInterface([video]));
  detailContent.querySelector(".open-download-directory").addEventListener("click", () => openDownloadDirectory(video));
  detailContent.querySelector(".copy-download-path").addEventListener("click", () => copyDownloadPath(video));
  detailContent.querySelector(".delete-local").addEventListener("click", () => askToDeleteVideo(video));
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
          finish(() => reject(new Error(runtimeError.message || "Chrome 无法启动 Windows 原生目录助手。")));
          return;
        }
        if (!response) { finish(() => reject(new Error("Windows 原生目录助手没有返回结果。"))); return; }
        if (!response.ok) { finish(() => reject(new Error(response.message || "Windows 原生目录助手未能完成请求。"))); return; }
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
  setDownloadPathNote("正在连接 Windows 原生目录助手…");
  try {
    const response = await nativeHostRequest({ action: "open-directory", collectionName: collection, directoryName: directory });
    setDownloadPathNote(response.targetPath ? `已打开：${response.targetPath}` : "");
    showToast("已在文件资源管理器中打开视频目录。");
  } catch (error) {
    const fallback = await resolveDownloadPath(video).catch(() => ({ path: "", source: "none" }));
    const lines = [`无法打开本地视频目录：${error.message}`];
    if (fallback.path) {
      lines.push(fallback.source === "host"
        ? `视频目录：${fallback.path}`
        : `视频目录（相对下载根目录）：${BcaArchiveCore.joinDownloadPath("下载根目录", collection, directory)}`);
    }
    lines.push("若尚未安装原生助手：运行插件目录中的 install-native-folder-opener.bat，填入本插件当前的扩展程序 ID 和下载目录；安装后需要在 chrome://extensions 重新加载插件并完全重启 Chrome。");
    lines.push("可以点击上面的“复制视频目录路径”手动在资源管理器地址栏粘贴打开。");
    setDownloadPathNote(lines.join("\n"), true);
    showToast("无法打开本地视频目录，详情见视频详情页。");
  }
}

async function copyDownloadPath(video) {
  if (!video.downloadDirectoryName) { showToast("这条记录没有可用的下载目录信息。"); return; }
  const resolved = await resolveDownloadPath(video);
  if (!resolved.path) { showToast("这条记录没有可用的下载目录信息。"); return; }
  try {
    await navigator.clipboard.writeText(resolved.path);
    setDownloadPathNote(resolved.source === "host"
      ? `已复制完整路径：${resolved.path}`
      : `已复制相对路径：${resolved.path}（完整路径 = 下载根目录\\${resolved.path}）`);
    showToast("已复制视频目录路径。");
  } catch (error) {
    setDownloadPathNote(`复制失败，请手动记录：${resolved.path}`, true);
    showToast(`复制路径失败：${error?.message || "浏览器拒绝了剪贴板访问"}`);
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
  confirmTitle.textContent = "删除本地归档？";
  confirmMessage.textContent = `将删除本地目录“${video.collection}/${video.directory}”及其中的封面和视频信息。B 站账户里的收藏不会改变。`;
  confirmDeleteButton.textContent = "删除本地文件";
  deleteDownloadsOption.hidden = !video.hasDownloadFiles;
  deleteAssociatedDownloads.checked = false;
  confirmBackdrop.hidden = false;
  confirmDeleteButton.focus();
}

function askToDeleteCollection(collection) {
  if (!collection) return;
  pendingDeleteAction = { type: "collection", collection };
  confirmTitle.textContent = "删除整个本地收藏夹？";
  confirmMessage.textContent = `将永久删除本地收藏夹“${collection.name}”及其全部文件（当前识别到 ${collection.videos.length} 个视频）。此操作只影响本地归档，不会更改 B 站账户中的收藏。`;
  confirmDeleteButton.textContent = "删除收藏夹";
  deleteDownloadsOption.hidden = !collection.videos.some((video) => video.hasDownloadFiles);
  deleteAssociatedDownloads.checked = false;
  confirmBackdrop.hidden = false;
  confirmDeleteButton.focus();
}

function askToDeleteBatch(videos) {
  if (!videos.length) return;
  pendingDeleteAction = { type: "batch", videos };
  confirmTitle.textContent = "删除选中的本地归档？";
  confirmMessage.textContent = `将永久删除选中的 ${videos.length} 个视频目录及其中的封面和视频信息。此操作只影响本地文件，不会更改 B 站账户中的收藏。`;
  confirmDeleteButton.textContent = `删除 ${videos.length} 个视频`;
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
  confirmTitle.textContent = "删除本地归档？";
  confirmDeleteButton.textContent = "删除本地文件";
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
    if (!savedCustom) throw new Error("自选下载目录设置已丢失，请先在下载页重新选择目录。");
    parent = savedCustom;
  } else {
    try { parent = await rootHandle.getDirectoryHandle("000视频下载"); }
    catch (error) { if (error?.name === "NotFoundError") return null; throw error; }
  }
  let permission = await parent.queryPermission({ mode: "readwrite" });
  if (permission !== "granted") permission = await parent.requestPermission({ mode: "readwrite" });
  if (permission !== "granted") throw new Error("没有获得下载目录写入权限；收藏视频已保留，下载文件未整理。");
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
  collectionActionCount.textContent = `已选 ${names.length} 个收藏夹`;
  confirmCollectionActionButton.disabled = names.length === 0 || confirmCollectionActionButton.dataset.busy === "true";
}

function openCollectionActionDialog(videos, source) {
  if (!rootHandle || !videos.length) return;
  pendingCollectionAction = { videos, source };
  collectionActionTitle.textContent = videos.length === 1 ? "移动或复制视频" : `移动或复制 ${videos.length} 个视频`;
  collectionActionSummary.textContent = videos.length === 1
    ? `“${videos[0].title}”当前位于“${videos[0].collection}”。`
    : `为所选的 ${videos.length} 个视频选择目标收藏夹。每个视频都会按其原收藏夹分别判断移动或复制。`;
  collectionActionList.replaceChildren();
  const sourceCollections = new Set(videos.map((video) => video.collection));
  if (!collections.length) {
    const empty = document.createElement("p");
    empty.className = "collection-action-empty";
    empty.textContent = "本地收藏库中还没有收藏夹。";
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
    icon.textContent = "▰";
    const name = document.createElement("span");
    name.className = "collection-action-name";
    name.textContent = collection.name;
    if (sourceCollections.has(collection.name)) {
      const sourceBadge = document.createElement("small");
      sourceBadge.className = "collection-source-badge";
      sourceBadge.textContent = "原收藏夹";
      name.append(sourceBadge);
    }
    const count = document.createElement("small");
    count.className = "collection-action-video-count";
    count.textContent = `${collection.videos.length} 个视频`;
    row.append(checkbox, icon, name, count);
    collectionActionList.append(row);
  }
  confirmCollectionActionButton.dataset.busy = "false";
  confirmCollectionActionButton.textContent = "确认";
  cancelCollectionActionButton.disabled = false;
  updateCollectionActionSelection();
  collectionActionDialog.showModal();
}

async function confirmCollectionAction() {
  const action = pendingCollectionAction;
  if (!action || confirmCollectionActionButton.dataset.busy === "true") return;
  const targetNames = selectedActionTargetNames();
  if (!targetNames.length) { showToast("请选择一个或多个收藏夹。"); return; }
  confirmCollectionActionButton.dataset.busy = "true";
  confirmCollectionActionButton.disabled = true;
  confirmCollectionActionButton.textContent = "正在整理…";
  cancelCollectionActionButton.disabled = true;
  selectAllActionTargetsButton.disabled = true;
  clearActionTargetsButton.disabled = true;
  collectionActionList.querySelectorAll("input").forEach((input) => { input.disabled = true; });
  try {
    const permissionRequest = rootHandle.requestPermission({ mode: "readwrite" });
    if (await permissionRequest !== "granted") throw new Error("没有获得本地目录写入权限。");
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
        failures.push(`${video.title}：${error?.message || "本地文件操作失败"}`);
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
    if (moved) messages.push(`已移动 ${moved} 个视频`);
    if (copied) messages.push(`已复制 ${copied} 个视频`);
    if (duplicates) messages.push(`重复项 ${duplicates} 个，已跳过`);
    if (alreadyThere) messages.push(`${alreadyThere} 个视频已在所选收藏夹中`);
    if (downloadCleanupWarnings.length) messages.push(`下载文件已复制，但有 ${downloadCleanupWarnings.length} 个旧目录未能清理`);
    if (failures.length) messages.push(`${failures.length} 个失败，仍保留选中：${failures[0]}`);
    showToast(messages.join("；") || "没有需要整理的视频。原视频已保留。");
  } catch (error) {
    showToast(`整理失败：${error?.message || "本地文件操作失败。"}`);
  } finally {
    confirmCollectionActionButton.dataset.busy = "false";
    confirmCollectionActionButton.textContent = "确认";
    cancelCollectionActionButton.disabled = false;
    selectAllActionTargetsButton.disabled = false;
    clearActionTargetsButton.disabled = false;
    collectionActionList.querySelectorAll("input").forEach((input) => { input.disabled = false; });
    updateCollectionActionSelection();
  }
}

async function confirmPendingDelete() {
  const action = pendingDeleteAction;
  if (!action) return;
  deleteInProgress = true;
  cancelDeleteButton.disabled = true;
  confirmDeleteButton.disabled = true;
  confirmDeleteButton.textContent = action.type === "collection" ? "正在删除收藏夹…" : action.type === "batch" ? "正在批量删除…" : "正在删除…";
  try {
    const permissionRequest = rootHandle.requestPermission({ mode: "readwrite" });
    if (await permissionRequest !== "granted") throw new Error("没有获得本地目录写入权限。");
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
          failures.push(`${video.title}：${error?.message || "删除失败"}`);
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
      showToast(`已删除本地收藏夹“${action.collection.name}”${downloadCleanupFailures.length ? `；${downloadCleanupFailures.length} 个下载目录未能删除` : ""}`);
    } else if (action.type === "batch") {
      if (!batchResult.failures.length) setSelectionMode(false);
      showToast(batchResult.failures.length
        ? `已删除 ${batchResult.deleted} 个，${batchResult.failures.length} 个失败并保留选中。${batchResult.failures[0]}`
        : `已删除 ${batchResult.deleted} 个本地视频${downloadCleanupFailures.length ? `；${downloadCleanupFailures.length} 个下载目录未能删除` : ""}`);
    } else {
      showToast(downloadCleanupFailures.length ? `已删除本地归档；${downloadCleanupFailures.length} 个下载目录未能删除` : "已删除本地归档");
    }
  } catch (error) {
    showToast(`删除失败：${error?.message || "本地文件操作失败。"}`);
  } finally {
    deleteInProgress = false;
    cancelDeleteButton.disabled = false;
    confirmDeleteButton.disabled = false;
    confirmDeleteButton.textContent = action.type === "collection" ? "删除收藏夹" : action.type === "batch" ? `删除 ${action.videos.length} 个视频` : "删除本地文件";
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
  if (!name) throw new Error("请输入收藏夹名称。");
  if (name.length > 120) throw new Error("收藏夹名称不能超过 120 个字符。");
  if (/[<>:"/\\|?*\u0000-\u001f]/.test(name) || /[. ]$/.test(name)) {
    throw new Error("名称包含本地文件夹不支持的字符，或以点号、空格结尾。");
  }
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(name)) {
    throw new Error("这个名称是 Windows 保留名称，请换一个名称。");
  }
  if (["错误报告", "001错误报告", "000视频下载", "视频下载"].includes(name)) throw new Error("这是插件保留目录，请换一个名称。");
  return name;
}

function openCreateCollectionDialog() {
  if (!rootHandle || library.hidden) { showToast("请先打开本地收藏根目录。"); return; }
  collectionNameInput.value = "";
  collectionDialog.showModal();
  collectionNameInput.focus();
}

function openAddVideoDialog() {
  if (!rootHandle || selectedCollection === "*") { showToast("请先选择一个收藏夹。"); return; }
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
  submitCreateCollectionButton.textContent = "正在创建…";
  try {
    const permissionRequest = rootHandle.requestPermission({ mode: "readwrite" });
    if (await permissionRequest !== "granted") throw new Error("没有获得本地目录写入权限。");
    try {
      await rootHandle.getDirectoryHandle(name);
      throw new Error(`收藏夹“${name}”已存在。`);
    } catch (error) {
      if (error?.name !== "NotFoundError") throw error;
    }
    await rootHandle.getDirectoryHandle(name, { create: true });
    collectionDialog.close();
    collectionForm.reset();
    await displayRoot(rootHandle, name);
    showToast(`已新建收藏夹“${name}”`);
  } catch (error) {
    showToast(`创建失败：${error?.message || "本地文件夹操作失败。"}`);
  } finally {
    collectionCreateInProgress = false;
    submitCreateCollectionButton.disabled = false;
    cancelCreateCollectionButton.disabled = false;
    submitCreateCollectionButton.textContent = "创建收藏夹";
  }
});

videoForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (videoAddInProgress || !rootHandle || selectedCollection === "*") return;
  const identifier = videoIdentifierInput.value.trim();
  const collectionNames = selectedTargetNames(videoTargetOptions);
  if (!collectionNames.length) { showToast("请选择一个或多个目标收藏夹。"); return; }
  videoAddInProgress = true;
  submitAddVideoButton.disabled = true;
  cancelAddVideoButton.disabled = true;
  submitAddVideoButton.textContent = "正在解析并保存…";
  try {
    const permissionRequest = rootHandle.requestPermission({ mode: "readwrite" });
    if (await permissionRequest !== "granted") throw new Error("没有获得本地目录写入权限。");
    const result = await chrome.runtime.sendMessage({
      type: "add-manual-video",
      data: { identifier, collections: collectionNames }
    });
    if (!result?.ok) throw new Error(result?.message || "B 站视频解析或本地保存失败。");
    videoDialog.close();
    videoForm.reset();
    const collectionToSelect = collectionNames.includes(selectedCollection) ? selectedCollection : collectionNames[0];
    await displayRoot(rootHandle, collectionToSelect);
    showToast(result.message || "视频已添加到本地收藏夹");
  } catch (error) {
    showToast(`添加失败：${error?.message || "无法解析或保存视频。"}`);
  } finally {
    videoAddInProgress = false;
    submitAddVideoButton.disabled = false;
    cancelAddVideoButton.disabled = false;
    submitAddVideoButton.textContent = "解析并保存";
  }
});

collectionDialog.addEventListener("cancel", (event) => { if (collectionCreateInProgress) event.preventDefault(); });
videoDialog.addEventListener("cancel", (event) => { if (videoAddInProgress) event.preventDefault(); });

async function displayRoot(handle, collectionToSelect = "*", toastVerb = "已读取") {
  for (const url of coverUrls) URL.revokeObjectURL(url);
  coverUrls = [];
  const preserveDownloadStatuses = rootHandle === handle;
  rootHandle = handle;
  const result = await scanRoot(handle, preserveDownloadStatuses);
  collections = applyCollectionOrder(result.collections);
  const existingVideoIds = new Set(allVideos().map((video) => video.id));
  for (const id of selectedVideoIds) if (!existingVideoIds.has(id)) selectedVideoIds.delete(id);
  selectedCollection = collectionToSelect === "*" || result.collections.some((collection) => collection.name === collectionToSelect) ? collectionToSelect : "*";
  rootLabel.textContent = handle.name;
  statusDot.classList.add("ready");
  refreshLibraryButton.disabled = false;
  scanNotice.hidden = result.issues.length === 0;
  scanNotice.textContent = result.issues.length ? `有 ${result.issues.length} 个目录未能读取：${result.issues.slice(0, 4).join("；")}${result.issues.length > 4 ? "；…" : ""}` : "";
  welcome.hidden = true;
  library.hidden = false;
  renderCollections();
  renderVideos();
  syncDetailDownloadAction();
  showToast(`${toastVerb} ${allVideos().length} 个视频`);
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

function setBusy(isBusy, buttonText = "正在读取…") {
  chooseRoot.disabled = isBusy;
  refreshLibraryButton.disabled = isBusy || !rootHandle;
  refreshLibraryButton.classList.toggle("is-loading", isBusy);
  welcomeChoose.disabled = isBusy;
  if (isBusy) chooseRoot.textContent = buttonText;
  else chooseRoot.innerHTML = '<span aria-hidden="true">＋</span> 选择收藏根目录';
}

async function refreshCurrentRoot() {
  if (!rootHandle) { showToast("请先选择本地收藏根目录。"); return; }
  const collectionToKeep = selectedCollection;
  setBusy(true, "正在刷新…");
  try {
    const permissionRequest = rootHandle.requestPermission({ mode: "read" });
    if (await permissionRequest !== "granted") throw new Error("没有获得本地目录读取权限。");
    await displayRoot(rootHandle, collectionToKeep, "已刷新");
  } catch (error) {
    if (error?.name !== "AbortError") showToast(`刷新失败：${error?.message || "无法读取本地目录。"}`);
  } finally { setBusy(false); }
}

async function chooseAndScan() {
  if (!window.showDirectoryPicker) { showToast("当前 Chrome 暂不支持本地目录访问，请更新浏览器后重试。"); return; }
  setBusy(true);
  try {
    const handle = await window.showDirectoryPicker({ mode: "read" });
    const permission = await handle.requestPermission({ mode: "read" });
    if (permission !== "granted") throw new Error("未获得读取目录的权限。");
    await saveHandle(handle);
    await displayRoot(handle);
  } catch (error) {
    if (error?.name !== "AbortError") showToast(error?.message || "读取目录失败。");
  } finally { setBusy(false); }
}

async function continueWithLastRoot() {
  if (!rootHandle) { await chooseAndScan(); return; }
  setBusy(true, "正在连接上次目录…");
  try {
    const permissionRequest = rootHandle.requestPermission({ mode: "read" });
    const permission = await permissionRequest;
    if (permission !== "granted") throw new Error("没有获得上次目录的读取权限。可使用右上角按钮重新选择目录。");
    await displayRoot(rootHandle);
  } catch (error) {
    if (error?.name !== "AbortError") showToast(error?.message || "连接上次目录失败。");
  } finally { setBusy(false); }
}

async function restoreLastRoot() {
  try {
    const handle = await loadSavedHandle();
    if (!handle) return;
    rootHandle = handle;
    rootLabel.textContent = handle.name;
    welcomeCopy.textContent = `已找到上次选择的目录“${handle.name}”。正在检查访问权限。`;
    const permission = await handle.queryPermission({ mode: "read" });
    if (permission === "granted") {
      setBusy(true, "正在读取上次目录…");
      try { await displayRoot(handle); }
      finally { setBusy(false); }
      return;
    }
    welcomeChoose.innerHTML = '授权并继续使用上次目录 <span>→</span>';
    welcomeCopy.textContent = `上次选择的目录是“${handle.name}”。点击继续并按提示授权，无需重新选择路径。`;
    welcomeFootnote.textContent = "如果目录已移动或删除，再使用右上角按钮选择新位置。";
  } catch (error) {
    rootHandle = null;
    rootLabel.textContent = "上次目录无法访问";
    statusDot.classList.remove("ready");
    welcomeCopy.textContent = "上次选择的目录暂时无法访问，请重新选择收藏根目录。";
    welcomeChoose.innerHTML = '选择本地收藏目录 <span>→</span>';
    showToast(error?.message || "无法连接上次选择的目录。");
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
searchInput.addEventListener("input", renderVideos);
sortSelect.addEventListener("change", renderVideos);
videoFilterSelect.addEventListener("change", renderVideos);
clearSearch.addEventListener("click", () => { searchInput.value = ""; renderVideos(); searchInput.focus(); });
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
});
window.addEventListener("beforeunload", () => coverUrls.forEach(URL.revokeObjectURL));
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes.downloadRevision && rootHandle) refreshDownloadStatuses();
});
window.addEventListener("focus", refreshDownloadStatuses);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") refreshDownloadStatuses();
});
window.setInterval(() => {
  if (!library.hidden && document.visibilityState === "visible") refreshDownloadStatuses();
}, 60000);
restoreCollectionOrder().catch(() => { collectionOrder = []; }).finally(() => restoreLastRoot());
