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
const confirmMessage = document.getElementById("confirmMessage");
const cancelDeleteButton = document.getElementById("cancelDelete");
const confirmDeleteButton = document.getElementById("confirmDelete");
const toast = document.getElementById("toast");

let rootHandle = null;
let collections = [];
let selectedCollection = "*";
let coverUrls = [];
let toastTimer = 0;
let pendingDeleteVideo = null;
let deleteInProgress = false;

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
    if (videos.length) scanned.push({ name: collectionEntry.name, videos });
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

function renderCollections() {
  const total = allVideos().length;
  collectionTotal.textContent = String(collections.length);
  const rows = [{ name: "全部收藏", key: "*", count: total, glyph: "▦" }, ...collections.map((item, index) => ({ name: item.name, key: item.name, count: item.videos.length, glyph: ["▤", "▣", "▧", "▥"][index % 4] }))];
  collectionList.replaceChildren(...rows.map((row) => {
    const button = document.createElement("button");
    button.className = `collection-button${selectedCollection === row.key ? " active" : ""}`;
    button.type = "button";
    button.setAttribute("aria-current", selectedCollection === row.key ? "page" : "false");
    button.innerHTML = `<span class="collection-glyph" aria-hidden="true">${row.glyph}</span><span class="collection-name"></span><span class="collection-count">${row.count}</span>`;
    button.querySelector(".collection-name").textContent = row.name;
    button.addEventListener("click", () => { selectedCollection = row.key; closeDetail(); renderCollections(); renderVideos(); });
    return button;
  }));
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
  const query = searchInput.value.trim().toLocaleLowerCase();
  const matching = videos.filter((video) => !query || [video.title, video.upName, video.bvid, video.category, video.collection, video.description, ...video.tags].join(" ").toLocaleLowerCase().includes(query));
  const sort = sortSelect.value;
  matching.sort((a, b) => sort === "title" ? a.title.localeCompare(b.title, "zh-CN") : sort === "oldest" ? a.timestamp - b.timestamp : b.timestamp - a.timestamp);
  const countLabel = query ? `${matching.length} / ${videos.length} 个视频` : `${videos.length} 个视频`;
  resultSummary.textContent = selectedCollection === "*" ? `${countLabel}，来自 ${collections.length} 个收藏夹` : countLabel;
  videoGrid.replaceChildren(...matching.map((video) => {
    const card = document.createElement("article");
    card.className = "video-card";
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `查看视频：${video.title}`);
    card.innerHTML = `<div class="card-cover">${safeCover(video.cover)}<span class="cover-badge"></span></div><div class="card-body"><div class="card-title"></div><div class="card-meta"><span class="card-up"></span><span class="card-date"></span></div></div>`;
    card.querySelector(".cover-badge").textContent = video.collection;
    card.querySelector(".card-title").textContent = video.title;
    card.querySelector(".card-up").textContent = video.upName || video.bvid || "本地收藏视频";
    card.querySelector(".card-date").textContent = compactDate(video.favoriteAt);
    card.addEventListener("click", () => openDetail(video));
    card.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openDetail(video); } });
    return card;
  }));
  emptySearch.hidden = matching.length > 0 || videos.length === 0;
  videoGrid.hidden = videos.length === 0;
  if (!videos.length) {
    videoGrid.hidden = false;
    videoGrid.innerHTML = '<div class="empty-search" style="grid-column:1/-1"><div class="empty-search-icon">▤</div><h2>这个收藏夹里还没有归档视频</h2><p>在 B 站完成收藏后，插件会将视频资料保存到本地目录。</p></div>';
  }
}

function compactDate(value) {
  const match = value.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  return match ? `${match[1]}.${String(match[2]).padStart(2, "0")}.${String(match[3]).padStart(2, "0")}` : value;
}

function addField(rows, label, value) { if (value && value !== "未知") rows.push(`<dt>${label}</dt><dd>${escapeHtml(value)}</dd>`); }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]); }

function openDetail(video) {
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
  detailContent.querySelector(".detail-collection").textContent = video.collection;
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
  detailPanel.setAttribute("aria-hidden", "true");
  detailBackdrop.hidden = true;
  document.body.style.overflow = "";
}

function askToDeleteVideo(video) {
  pendingDeleteVideo = video;
  confirmMessage.textContent = `将删除本地目录“${video.collection}/${video.directory}”及其中的封面和视频信息。B 站账户里的收藏不会改变。`;
  confirmBackdrop.hidden = false;
  confirmDeleteButton.focus();
}

function closeDeleteConfirmation() {
  if (deleteInProgress) return;
  confirmBackdrop.hidden = true;
  pendingDeleteVideo = null;
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

async function moveVideoToCollection(video, targetName, button) {
  if (!targetName || targetName === video.collection) { showToast("请选择另一个收藏夹。"); return; }
  button.disabled = true;
  button.textContent = "移动中…";
  try {
    const permissionRequest = rootHandle.requestPermission({ mode: "readwrite" });
    if (await permissionRequest !== "granted") throw new Error("没有获得本地目录写入权限。");
    const sourceCollection = await rootHandle.getDirectoryHandle(video.collection);
    const targetCollection = await rootHandle.getDirectoryHandle(targetName, { create: true });
    const targetRecordName = await uniqueRecordFolderName(targetCollection, video.directory);
    const targetRecord = await targetCollection.getDirectoryHandle(targetRecordName, { create: true });
    try {
      await copyDirectoryContents(await sourceCollection.getDirectoryHandle(video.directory), targetRecord);
      if (targetRecordName !== video.directory) await updateSavedFolderName(targetRecord, targetRecordName);
    } catch (error) {
      await targetCollection.removeEntry(targetRecordName, { recursive: true }).catch(() => {});
      throw error;
    }
    try {
      await sourceCollection.removeEntry(video.directory, { recursive: true });
    } catch (error) {
      closeDetail();
      await displayRoot(rootHandle);
      throw new Error(`目标收藏夹中已写入副本，但原目录未能删除，页面已重新读取。${error?.message || ""}`);
    }
    closeDetail();
    await displayRoot(rootHandle);
    showToast(`已移动到“${targetName}”`);
  } catch (error) {
    showToast(`移动失败：${error?.message || "本地文件操作失败。"}`);
  } finally {
    button.disabled = false;
    button.textContent = "移动";
  }
}

async function deletePendingVideo() {
  const video = pendingDeleteVideo;
  if (!video) return;
  deleteInProgress = true;
  cancelDeleteButton.disabled = true;
  confirmDeleteButton.disabled = true;
  confirmDeleteButton.textContent = "正在删除…";
  try {
    const permissionRequest = rootHandle.requestPermission({ mode: "readwrite" });
    if (await permissionRequest !== "granted") throw new Error("没有获得本地目录写入权限。");
    const collectionHandle = await rootHandle.getDirectoryHandle(video.collection);
    await collectionHandle.removeEntry(video.directory, { recursive: true });
    if (video.cover) {
      URL.revokeObjectURL(video.cover);
      coverUrls = coverUrls.filter((url) => url !== video.cover);
    }
    deleteInProgress = false;
    closeDeleteConfirmation();
    closeDetail();
    await displayRoot(rootHandle);
    showToast("已删除本地归档");
  } catch (error) {
    showToast(`删除失败：${error?.message || "本地文件操作失败。"}`);
  } finally {
    deleteInProgress = false;
    cancelDeleteButton.disabled = false;
    confirmDeleteButton.disabled = false;
    confirmDeleteButton.textContent = "删除本地文件";
  }
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3000);
}

async function displayRoot(handle) {
  for (const url of coverUrls) URL.revokeObjectURL(url);
  coverUrls = [];
  rootHandle = handle;
  const result = await scanRoot(handle);
  collections = result.collections;
  selectedCollection = "*";
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
searchInput.addEventListener("input", renderVideos);
sortSelect.addEventListener("change", renderVideos);
clearSearch.addEventListener("click", () => { searchInput.value = ""; renderVideos(); searchInput.focus(); });
closeDetailButton.addEventListener("click", closeDetail);
detailBackdrop.addEventListener("click", closeDetail);
cancelDeleteButton.addEventListener("click", closeDeleteConfirmation);
confirmDeleteButton.addEventListener("click", deletePendingVideo);
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
