const DB_NAME = "bili-fav-archiver";
const DB_STORE = "settings";

const collectionList = document.getElementById("collectionList");
const collectionTotal = document.getElementById("collectionTotal");
const rootLabel = document.getElementById("rootLabel");
const statusDot = document.querySelector(".status-dot");
const chooseRoot = document.getElementById("chooseRoot");
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
const invalidOnlyButton = document.getElementById("invalidOnly");
const batchManageButton = document.getElementById("batchManage");
const batchToolbar = document.getElementById("batchToolbar");
const selectedCount = document.getElementById("selectedCount");
const selectVisibleButton = document.getElementById("selectVisible");
const exitBatchButton = document.getElementById("exitBatch");
const batchTargetPicker = document.getElementById("batchTargetPicker");
const batchTargetSummary = document.getElementById("batchTargetSummary");
const batchTargetOptions = document.getElementById("batchTargetOptions");
const moveSelectedButton = document.getElementById("moveSelected");
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
let showInvalidOnly = false;
let selectedVideoIds = new Set();
let visibleVideoIds = [];

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

async function scanRoot(handle) {
  const scanned = [];
  const issues = [];
  const timestampPattern = /^\d{4}年\d{1,2}月\d{1,2}日\d{1,2}时\d{1,2}分\d{1,2}秒(?:_\d+)?$/;
  for await (const collectionEntry of handle.values()) {
    if (collectionEntry.kind !== "directory" || collectionEntry.name === "错误报告") continue;
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
        videos.push({
          id: `${collectionEntry.name}/${recordEntry.name}`,
          collection: collectionEntry.name,
          directory: recordEntry.name,
          title,
          url: /^https?:\/\//i.test(url) ? url : "",
          bvid: field(info, "BV号"),
          aid: field(info, "av号"),
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
    button.innerHTML = `<span class="collection-glyph" aria-hidden="true">${row.glyph}</span><span class="collection-name"></span><span class="collection-count">${row.count}</span>`;
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
  renderBatchTargets();
}

function renderBatchTargets() {
  const previouslySelected = selectedTargetNames(batchTargetOptions).filter((name) => collections.some((collection) => collection.name === name));
  renderTargetChoices(batchTargetOptions, previouslySelected);
  batchTargetSummary.textContent = previouslySelected.length ? `已选 ${previouslySelected.length} 个收藏夹` : "选择目标收藏夹…";
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
  const targets = selectedTargetNames(batchTargetOptions);
  moveSelectedButton.disabled = records.length === 0 || targets.length === 0;
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
  if (!selectionMode) {
    batchTargetPicker.open = false;
    renderTargetChoices(batchTargetOptions, []);
    batchTargetSummary.textContent = "选择目标收藏夹…";
  }
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
  invalidOnlyButton.setAttribute("aria-pressed", String(showInvalidOnly));
  invalidOnlyButton.textContent = showInvalidOnly ? "显示全部视频" : "只显示已失效";
  const query = searchInput.value.trim().toLocaleLowerCase();
  const matching = videos.filter((video) => (!showInvalidOnly || video.isInvalid) && (!query || [video.title, video.upName, video.bvid, video.category, video.collection, video.description, ...video.tags].join(" ").toLocaleLowerCase().includes(query)));
  visibleVideoIds = matching.map((video) => video.id);
  const sort = sortSelect.value;
  matching.sort((a, b) => sort === "title" ? a.title.localeCompare(b.title, "zh-CN") : sort === "oldest" ? a.timestamp - b.timestamp : b.timestamp - a.timestamp);
  const countLabel = showInvalidOnly
    ? `${matching.length} / ${videos.filter((video) => video.isInvalid).length} 个失效视频`
    : query ? `${matching.length} / ${videos.length} 个视频` : `${videos.length} 个视频`;
  resultSummary.textContent = selectedCollection === "*" ? `${countLabel}，来自 ${collections.length} 个收藏夹` : countLabel;
  videoGrid.replaceChildren(...matching.map((video) => {
    const card = document.createElement("article");
    card.className = "video-card";
    card.classList.toggle("invalid-video", video.isInvalid);
    card.dataset.videoId = video.id;
    card.classList.toggle("selected", selectedVideoIds.has(video.id));
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", selectionMode ? `选择视频：${video.title}` : `查看视频：${video.title}`);
    card.innerHTML = `<div class="card-cover">${safeCover(video.cover)}<span class="invalid-badge">已失效</span><span class="cover-badge"></span><input class="card-select" type="checkbox" aria-label="选择视频"></div><div class="card-body"><div class="card-title"></div><div class="card-meta"><span class="card-up"></span><span class="card-date"></span></div></div>`;
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
    emptySearch.querySelector("h2").textContent = showInvalidOnly ? "没有已失效视频" : "没有找到相关视频";
    emptySearch.querySelector("p").textContent = showInvalidOnly ? "当前收藏范围内没有检测到失效视频。" : "试试其他标题、UP 主名称或 BV 号。";
    clearSearch.hidden = showInvalidOnly && !query;
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

function openDetail(video) {
  detailPanel.classList.toggle("invalid-video", video.isInvalid);
  const rows = [];
  addField(rows, "收藏时间", video.favoriteAt);
  addField(rows, "信息保存于", video.savedAt);
  addField(rows, "UP 主", video.upName);
  addField(rows, "UP 主 UID", video.upMid);
  addField(rows, "UP 主主页", video.upHome);
  addField(rows, "分区", video.category);
  addField(rows, "视频时长", video.duration);
  addField(rows, "发布时间", video.publishDate);
  addField(rows, "BV 号", video.bvid);
  addField(rows, "av 号", video.aid);
  addField(rows, "归档目录", video.directory);
  const tags = video.tags.length ? `<div class="detail-tags">${video.tags.map((tag) => `<span class="detail-tag">${escapeHtml(tag)}</span>`).join("")}</div>` : '<p class="detail-description">暂无标签</p>';
  detailContent.innerHTML = `<div class="detail-cover">${safeCover(video.cover)}</div><span class="detail-collection"></span><h2 class="detail-title"></h2><p class="detail-bvid"></p>${video.url ? '<a class="button button-primary open-video" target="_blank" rel="noopener noreferrer" href="">在 B 站打开视频 <span>↗</span></a>' : ""}<section class="detail-management"><h3>本地收藏管理</h3><label class="move-label" for="moveTarget">移动到另一个收藏夹</label><div class="move-controls"><select id="moveTarget" class="move-target" aria-label="目标收藏夹"><option value="">选择目标收藏夹</option></select><button class="button button-primary move-local" type="button">移动</button></div><button class="button button-danger delete-local" type="button">删除本地归档</button><p class="management-note">这些操作只整理本地归档文件，不会更改 B 站账户中的收藏。</p></section><h3 class="detail-section-title">视频信息</h3><dl class="detail-fields">${rows.join("")}</dl><h3 class="detail-section-title">标签</h3>${tags}<h3 class="detail-section-title">视频简介</h3><p class="detail-description"></p>`;
  detailContent.querySelector(".detail-collection").textContent = video.isInvalid ? `${video.collection} · 已失效` : video.collection;
  detailContent.querySelector(".detail-collection").classList.toggle("invalid", video.isInvalid);
  detailContent.querySelector(".detail-title").textContent = video.title;
  detailContent.querySelector(".detail-bvid").textContent = video.bvid ? `BV号 ${video.bvid}` : "本地归档";
  detailContent.querySelector(".detail-description").textContent = video.description || "暂无简介";
  const link = detailContent.querySelector(".open-video");
  if (link) link.href = video.url;
  const targetSelect = detailContent.querySelector("#moveTarget");
  const moveButton = detailContent.querySelector(".move-local");
  const otherCollections = collections.filter((collection) => collection.name !== video.collection);
  for (const collection of otherCollections) {
    const option = document.createElement("option");
    option.value = collection.name;
    option.textContent = collection.name;
    targetSelect.append(option);
  }
  if (!otherCollections.length) {
    targetSelect.options[0].textContent = "暂无其他收藏夹";
    targetSelect.disabled = true;
    moveButton.disabled = true;
  }
  moveButton.addEventListener("click", () => moveVideoToCollection(video, targetSelect.value, moveButton));
  detailContent.querySelector(".delete-local").addEventListener("click", () => askToDeleteVideo(video));
  detailPanel.classList.add("open");
  detailPanel.setAttribute("aria-hidden", "false");
  detailBackdrop.hidden = false;
  document.body.style.overflow = "hidden";
  closeDetailButton.focus();
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
  confirmBackdrop.hidden = false;
  confirmDeleteButton.focus();
}

function askToDeleteCollection(collection) {
  if (!collection) return;
  pendingDeleteAction = { type: "collection", collection };
  confirmTitle.textContent = "删除整个本地收藏夹？";
  confirmMessage.textContent = `将永久删除本地收藏夹“${collection.name}”及其全部文件（当前识别到 ${collection.videos.length} 个视频）。此操作只影响本地归档，不会更改 B 站账户中的收藏。`;
  confirmDeleteButton.textContent = "删除收藏夹";
  confirmBackdrop.hidden = false;
  confirmDeleteButton.focus();
}

function askToDeleteBatch(videos) {
  if (!videos.length) return;
  pendingDeleteAction = { type: "batch", videos };
  confirmTitle.textContent = "删除选中的本地归档？";
  confirmMessage.textContent = `将永久删除选中的 ${videos.length} 个视频目录及其中的封面和视频信息。此操作只影响本地文件，不会更改 B 站账户中的收藏。`;
  confirmDeleteButton.textContent = `删除 ${videos.length} 个视频`;
  confirmBackdrop.hidden = false;
  confirmDeleteButton.focus();
}

function closeDeleteConfirmation() {
  if (deleteInProgress) return;
  confirmBackdrop.hidden = true;
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

function collectionAlreadyHasVideo(targetName, video) {
  const target = collections.find((collection) => collection.name === targetName);
  if (!target) return false;
  const wanted = videoIdentifierKeys(video);
  return target.videos.some((existing) => existing.id !== video.id && identifiersOverlap(videoIdentifierKeys(existing), wanted));
}

async function moveVideoRecordToTargets(video, targetNames, duplicateSets = null) {
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
  try {
    for (const targetName of missingTargets) {
      const result = await copyVideoRecord(video, targetName);
      created.push({ name: targetName, ...result });
      if (duplicateSets?.has(targetName)) wantedKeys.forEach((key) => duplicateSets.get(targetName).add(key));
    }
    if (!targets.includes(video.collection)) await removeMovedSource(video);
  } catch (error) {
    for (const entry of created.reverse()) {
      await entry.targetCollection.removeEntry(entry.targetRecordName, { recursive: true }).catch(() => {});
      if (duplicateSets?.has(entry.name)) {
        const set = duplicateSets.get(entry.name);
        wantedKeys.forEach((key) => set.delete(key));
      }
    }
    throw error;
  }
  return { moved: !targets.includes(video.collection), copied: missingTargets.length, duplicateTargets };
}

async function moveVideoToCollection(video, targetName, button) {
  if (!targetName || targetName === video.collection) { showToast("请选择另一个收藏夹。"); return; }
  button.disabled = true;
  button.textContent = "移动中…";
  try {
    const permissionRequest = rootHandle.requestPermission({ mode: "readwrite" });
    if (await permissionRequest !== "granted") throw new Error("没有获得本地目录写入权限。");
    const result = await moveVideoRecordToTargets(video, [targetName]);
    if (result.duplicate) {
      showToast(`已存在相同视频，未移动到“${targetName}”。`);
      return;
    }
    closeDetail();
    await displayRoot(rootHandle, targetName);
    showToast(`已移动到“${targetName}”`);
  } catch (error) {
    await displayRoot(rootHandle, selectedCollection).catch(() => {});
    showToast(`移动失败：${error?.message || "本地文件操作失败。"}`);
  } finally {
    button.disabled = false;
    button.textContent = "移动";
  }
}

async function moveSelectedVideos() {
  const records = selectedRecords();
  const targetNames = selectedTargetNames(batchTargetOptions);
  if (!records.length) { showToast("请先选择视频。"); return; }
  if (!targetNames.length) { showToast("请选择一个或多个目标收藏夹。"); return; }
  const duplicateSets = new Map(targetNames.map((name) => [
    name,
    new Set(allVideos().filter((video) => video.collection === name).flatMap((video) => Array.from(videoIdentifierKeys(video))))
  ]));
  moveSelectedButton.disabled = true;
  moveSelectedButton.textContent = "移动中…";
  try {
    const permissionRequest = rootHandle.requestPermission({ mode: "readwrite" });
    if (await permissionRequest !== "granted") throw new Error("没有获得本地目录写入权限。");
    let moved = 0;
    let duplicates = 0;
    let alreadyThere = 0;
    const failures = [];
    for (const video of records) {
      try {
        const result = await moveVideoRecordToTargets(video, targetNames, duplicateSets);
        if (result.duplicate) duplicates += result.duplicateTargets?.length || 1;
        else if (result.alreadyInTargets) alreadyThere += 1;
        else if (result.moved || result.copied) {
          duplicates += result.duplicateTargets?.length || 0;
          moved += 1;
          selectedVideoIds.delete(video.id);
        }
      } catch (error) {
        failures.push({ id: video.id, message: `${video.title}：${error?.message || "移动失败"}` });
      }
    }
    if (moved || duplicates || failures.length) {
      selectedVideoIds = new Set([...records.filter((video) => video.collection && selectedVideoIds.has(video.id)).map((video) => video.id), ...failures.map((failure) => failure.id)]);
      if (!failures.length && !duplicates && targetNames.length === 1 && selectedCollection !== "*" && selectedCollection !== records[0]?.collection && collections.some((entry) => entry.name === targetNames[0])) selectedCollection = targetNames[0];
      await displayRoot(rootHandle, selectedCollection);
      if (!failures.length && !duplicates) setSelectionMode(false);
      const messages = [];
      if (moved) messages.push(`已处理 ${moved} 个视频`);
      if (duplicates) messages.push(`已存在相同视频 ${duplicates} 个目标，已跳过`);
      if (alreadyThere) messages.push(`${alreadyThere} 个视频已在目标收藏夹中`);
      if (failures.length) messages.push(`${failures.length} 个失败并保留选中：${failures[0].message}`);
      showToast(messages.join("；") || "没有可移动的视频。");
    } else {
      showToast("所选视频已经都在目标收藏夹中。");
    }
  } catch (error) {
    showToast(`批量移动失败：${error?.message || "本地文件操作失败。"}`);
  } finally {
    moveSelectedButton.textContent = "移动";
    updateBatchControls();
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
    let batchResult = null;
    if (action.type === "collection") {
      await rootHandle.removeEntry(action.collection.name, { recursive: true });
      if (selectedCollection === action.collection.name) selectedCollection = "*";
    } else if (action.type === "batch") {
      let deleted = 0;
      const failures = [];
      for (const video of action.videos) {
        try {
          const collectionHandle = await rootHandle.getDirectoryHandle(video.collection);
          await collectionHandle.removeEntry(video.directory, { recursive: true });
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
    }
    deleteInProgress = false;
    closeDeleteConfirmation();
    closeDetail();
    await displayRoot(rootHandle, selectedCollection);
    if (action.type === "collection") {
      showToast(`已删除本地收藏夹“${action.collection.name}”`);
    } else if (action.type === "batch") {
      if (!batchResult.failures.length) setSelectionMode(false);
      showToast(batchResult.failures.length
        ? `已删除 ${batchResult.deleted} 个，${batchResult.failures.length} 个失败并保留选中。${batchResult.failures[0]}`
        : `已删除 ${batchResult.deleted} 个本地视频`);
    } else {
      showToast("已删除本地归档");
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
  if (name === "错误报告") throw new Error("“错误报告”是插件保留目录，请换一个名称。");
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

async function displayRoot(handle, collectionToSelect = "*") {
  for (const url of coverUrls) URL.revokeObjectURL(url);
  coverUrls = [];
  rootHandle = handle;
  const result = await scanRoot(handle);
  collections = result.collections;
  const existingVideoIds = new Set(allVideos().map((video) => video.id));
  for (const id of selectedVideoIds) if (!existingVideoIds.has(id)) selectedVideoIds.delete(id);
  selectedCollection = collectionToSelect === "*" || result.collections.some((collection) => collection.name === collectionToSelect) ? collectionToSelect : "*";
  rootLabel.textContent = handle.name;
  statusDot.classList.add("ready");
  scanNotice.hidden = result.issues.length === 0;
  scanNotice.textContent = result.issues.length ? `有 ${result.issues.length} 个目录未能读取：${result.issues.slice(0, 4).join("；")}${result.issues.length > 4 ? "；…" : ""}` : "";
  welcome.hidden = true;
  library.hidden = false;
  renderCollections();
  renderVideos();
  showToast(`已读取 ${allVideos().length} 个视频`);
}

function setBusy(isBusy, buttonText = "正在读取…") {
  chooseRoot.disabled = isBusy;
  welcomeChoose.disabled = isBusy;
  if (isBusy) chooseRoot.textContent = buttonText;
  else chooseRoot.innerHTML = '<span aria-hidden="true">＋</span> 选择收藏根目录';
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
welcomeChoose.addEventListener("click", () => rootHandle ? continueWithLastRoot() : chooseAndScan());
createCollectionButton.addEventListener("click", openCreateCollectionDialog);
addVideoButton.addEventListener("click", openAddVideoDialog);
batchManageButton.addEventListener("click", () => setSelectionMode(!selectionMode));
selectVisibleButton.addEventListener("click", toggleVisibleSelection);
exitBatchButton.addEventListener("click", () => setSelectionMode(false));
batchTargetOptions.addEventListener("change", () => {
  const selected = selectedTargetNames(batchTargetOptions);
  batchTargetSummary.textContent = selected.length ? `已选 ${selected.length} 个收藏夹` : "选择目标收藏夹…";
  updateBatchControls();
});
moveSelectedButton.addEventListener("click", moveSelectedVideos);
deleteSelectedButton.addEventListener("click", () => askToDeleteBatch(selectedRecords()));
searchInput.addEventListener("input", renderVideos);
sortSelect.addEventListener("change", renderVideos);
invalidOnlyButton.addEventListener("click", () => { showInvalidOnly = !showInvalidOnly; renderVideos(); });
clearSearch.addEventListener("click", () => { searchInput.value = ""; renderVideos(); searchInput.focus(); });
closeDetailButton.addEventListener("click", closeDetail);
detailBackdrop.addEventListener("click", closeDetail);
cancelDeleteButton.addEventListener("click", closeDeleteConfirmation);
confirmDeleteButton.addEventListener("click", confirmPendingDelete);
cancelCreateCollectionButton.addEventListener("click", () => collectionDialog.close());
cancelAddVideoButton.addEventListener("click", () => videoDialog.close());
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
restoreLastRoot();
