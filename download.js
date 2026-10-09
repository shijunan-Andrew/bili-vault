const DB_NAME = "bili-fav-archiver";
const DB_STORE = "settings";
const $ = (id) => document.getElementById(id);

const queueList = $("queueList");
const queueEmpty = $("queueEmpty");
const queueCount = $("queueCount");
const addVideoForm = $("addVideoForm");
const videoInput = $("videoInput");
const parseVideoButton = $("parseVideoButton");
const chooseDownloadFolder = $("chooseDownloadFolder");
const useDefaultDownloadFolder = $("useDefaultDownloadFolder");
const downloadFolderName = $("downloadFolderName");
const downloadFolderHelp = $("downloadFolderHelp");
const folderPermissionHint = $("folderPermissionHint");
const qualitySelect = $("qualitySelect");
const formatSelect = $("formatSelect");
const codecSelect = $("codecSelect");
const audioQualitySelect = $("audioQualitySelect");
const includeVideo = $("includeVideo");
const includeAudio = $("includeAudio");
const includeDanmaku = $("includeDanmaku");
const includeSubtitle = $("includeSubtitle");
const includeCover = $("includeCover");
const includeInfo = $("includeInfo");
const audioOption = $("audioOption");
const audioQualitySetting = $("audioQualitySetting");
const formatNote = $("formatNote");
const startDownload = $("startDownload");
const downloadActions = document.querySelector(".download-actions");
const pauseDownload = $("pauseDownload");
const cancelDownload = $("cancelDownload");
const progressSummary = $("progressSummary");
const progressBadge = $("progressBadge");
const overallProgress = $("overallProgress");
const progressCurrent = $("progressCurrent");
const progressFiles = $("progressFiles");
const downloadLog = $("downloadLog");

let downloadFolder = null;
let downloadFolderMode = "default";
let archiveRootHandle = null;
let queue = [];
let running = false;
let paused = false;
let pauseWaiter = null;
let cancelController = null;
let savedFileCount = 0;
let failedCount = 0;
let plannedTasks = 0;
let completedTasks = 0;
let downloadErrors = [];
let activeDownloadContext = null;

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(DB_STORE)) request.result.createObjectStore(DB_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("无法读取下载目录设置。"));
  });
}

async function folderSetting(action, value, key = "downloadFolder") {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(DB_STORE, action === "get" ? "readonly" : "readwrite");
      const store = transaction.objectStore(DB_STORE);
      const request = action === "get" ? store.get(key) : action === "delete" ? store.delete(key) : store.put(value, key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error("保存下载目录失败。"));
    });
  } finally { db.close(); }
}

function runtimeMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) return reject(new Error(runtimeError.message));
      if (!response?.ok) return reject(new Error(response?.message || "扩展未能完成请求。"));
      resolve(response);
    });
  });
}

function safeName(value, fallback = "未知", maxLength = 100) {
  let name = String(value || "").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/[. ]+$/g, "").trim();
  if (!name || name === "." || name === "..") name = fallback;
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(name)) name = `_${name}`;
  return name.slice(0, maxLength);
}

function displayBytes(value) {
  const bytes = Number(value) || 0;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function setBadge(text, state = "idle") {
  progressBadge.textContent = text;
  progressBadge.className = `progress-badge ${state}`;
}

function addLog(message, type = "info") {
  if (downloadLog.querySelector(".log-placeholder")) downloadLog.replaceChildren();
  const entry = document.createElement("div");
  entry.className = `log-entry ${type}`;
  entry.textContent = message;
  downloadLog.append(entry);
  downloadLog.scrollTop = downloadLog.scrollHeight;
}

function updateProgress() {
  const percent = plannedTasks ? Math.min(100, Math.round(completedTasks / plannedTasks * 100)) : 0;
  overallProgress.style.width = `${percent}%`;
  progressFiles.textContent = `已保存 ${savedFileCount} 个文件`;
}

function updateStartButton() {
  const hasDestination = downloadFolderMode === "custom" ? Boolean(downloadFolder) : Boolean(archiveRootHandle);
  startDownload.disabled = running || !hasDestination || !queue.some((item) => item.video);
}

function setQueueBusy(busy) {
  parseVideoButton.disabled = busy;
  videoInput.disabled = busy;
  queueList.querySelectorAll("button,select").forEach((element) => { element.disabled = busy; });
  chooseDownloadFolder.disabled = busy;
  useDefaultDownloadFolder.disabled = busy;
  document.querySelectorAll(".settings-panel select, .settings-panel input").forEach((element) => { element.disabled = busy; });
  if (!busy) setFormatUi();
  updateStartButton();
}

function releasePauseWaiter() {
  if (!pauseWaiter) return;
  const resume = pauseWaiter;
  pauseWaiter = null;
  resume();
}

async function waitWhilePaused() {
  while (paused && !cancelController?.signal.aborted) {
    await new Promise((resolve) => { pauseWaiter = resolve; });
  }
  if (cancelController?.signal.aborted) throw new DOMException("用户取消下载", "AbortError");
}

function setPaused(value) {
  paused = value;
  pauseDownload.textContent = paused ? "继续下载" : "暂停下载";
  setBadge(paused ? "已暂停" : "下载中", paused ? "paused" : "active");
  progressSummary.textContent = paused ? "下载已暂停，可继续或取消" : "下载继续进行中";
  if (!paused) releasePauseWaiter();
}

function cancelCurrentDownload() {
  if (!running || !cancelController) return;
  paused = false;
  releasePauseWaiter();
  cancelController.abort();
  progressCurrent.textContent = "正在取消并清理本次下载文件…";
  cancelDownload.disabled = true;
  pauseDownload.disabled = true;
}

function pageLabel(page) {
  const title = page.part || `第 ${page.page || 1} P`;
  return `P${page.page || 1} · ${title}`;
}

function renderQueue() {
  queueCount.textContent = `${queue.length} 个视频`;
  queueEmpty.hidden = queue.length > 0;
  queueList.replaceChildren();
  queue.forEach((item, index) => {
    const row = document.createElement("article");
    row.className = "queue-item";
    const number = document.createElement("div");
    number.className = "queue-index";
    number.textContent = String(index + 1).padStart(2, "0");
    const copy = document.createElement("div");
    copy.className = "queue-copy";
    const title = document.createElement("div");
    title.className = "queue-title";
    title.textContent = item.video?.title || item.error || "正在解析视频…";
    const meta = document.createElement("div");
    meta.className = "queue-meta";
    meta.textContent = item.video ? `${item.video.owner || "未知 UP 主"}${item.video.bvid ? ` · ${item.video.bvid}` : ""} · ${item.video.pages.length} P` : (item.error ? "解析失败" : "读取 B 站视频信息");
    copy.append(title, meta);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "queue-remove";
    remove.title = "移出队列";
    remove.setAttribute("aria-label", "移出队列");
    remove.textContent = "×";
    remove.addEventListener("click", () => {
      queue = queue.filter((entry) => entry.id !== item.id);
      renderQueue();
      refreshQualityOptions();
    });
    row.append(number, copy);
    if (item.video) {
      const pageSelect = document.createElement("select");
      pageSelect.className = "queue-page";
      pageSelect.setAttribute("aria-label", "选择下载分 P");
      pageSelect.add(new Option("全部分 P", "all"));
      item.video.pages.forEach((page) => pageSelect.add(new Option(pageLabel(page), String(page.cid))));
      pageSelect.value = item.pageSelection || "all";
      pageSelect.addEventListener("change", () => { item.pageSelection = pageSelect.value; refreshQualityOptions(); });
      row.append(pageSelect);
    }
    row.append(remove);
    queueList.append(row);
  });
  updateStartButton();
}

function normalizeIdentifier(item) {
  return item.url || item.bvid || (item.aid ? `av${String(item.aid).replace(/^av/i, "")}` : "");
}

async function parseAndAdd(identifier, sourceItem = {}) {
  const input = String(identifier || "").trim();
  if (!input) throw new Error("请粘贴 B 站视频网址、BV 号或 av 号。");
  const item = { id: crypto.randomUUID(), video: null, pageSelection: "all", error: "" };
  queue.push(item);
  renderQueue();
  try {
    const response = await runtimeMessage({ type: "bca-download-parse", identifier: input });
    item.video = BcaArchiveCore.withSourceCollection(response.video, sourceItem);
    item.pageSelection = response.video.pages.length > 1 ? "all" : String(response.video.pages[0]?.cid || "all");
    addLog(`已解析：${response.video.title}${response.video.bvid ? `（${response.video.bvid}）` : ""}`, "success");
  } catch (error) {
    item.error = error.message;
    addLog(`解析失败：${input} · ${error.message}`, "error");
    throw error;
  } finally {
    renderQueue();
  }
  return item;
}

function selectedPages(item) {
  if (item.pageSelection === "all") return item.video.pages;
  const selected = item.video.pages.find((page) => String(page.cid) === item.pageSelection);
  return selected ? [selected] : item.video.pages.slice(0, 1);
}

async function loadPlayurl(video, page, quality = 0) {
  const response = await runtimeMessage({
    type: "bca-download-playurl", bvid: video.bvid, aid: video.aid,
    cid: page.cid, quality, format: formatSelect.value
  });
  return response.data;
}

function fillQualities(data) {
  const current = qualitySelect.value;
  const qualities = Array.isArray(data?.accept_quality) && data.accept_quality.length ? data.accept_quality : [127, 120, 116, 112, 80, 64, 32, 16, 8];
  const labels = Array.isArray(data?.accept_description) ? data.accept_description : [];
  const entries = [{ value: "0", label: "自动（最高可用）" }];
  qualities.forEach((quality, index) => {
    if (quality === 0 || entries.some((entry) => entry.value === String(quality))) return;
    entries.push({ value: String(quality), label: labels[index] || `${quality}P` });
  });
  qualitySelect.replaceChildren(...entries.map((entry) => new Option(entry.label, entry.value)));
  if ([...qualitySelect.options].some((option) => option.value === current)) qualitySelect.value = current;
}

async function refreshQualityOptions() {
  const firstItem = queue.find((entry) => entry.video);
  const page = firstItem && selectedPages(firstItem)[0];
  if (!page) return;
  qualitySelect.disabled = true;
  try {
    const data = await loadPlayurl(firstItem.video, page, 0);
    fillQualities(data);
  } catch (error) {
    addLog(`读取可用清晰度失败：${error.message}`, "error");
  } finally { qualitySelect.disabled = false; }
}

function setFormatUi() {
  const mp4 = formatSelect.value === "mp4";
  includeAudio.disabled = mp4;
  audioQualitySelect.disabled = mp4;
  audioOption.classList.toggle("disabled-option", mp4);
  audioQualitySetting.classList.toggle("disabled-setting", mp4);
  const checked = includeAudio.checked;
  audioOption.querySelector("small").textContent = mp4 ? "MP4 已包含音频" : "DASH 音轨单独保存";
  formatNote.textContent = mp4
    ? "MP4 为音视频合并的单文件模式，可用清晰度受 B 站接口限制。"
    : "DASH 会分别保存视频与音频流（.m4s），浏览器扩展不会调用 DownKyi 的 FFmpeg 合并，因此不会生成合并后的 MP4。";
  if (mp4 && !checked) includeAudio.checked = true;
}

async function chooseFolder() {
  if (!window.showDirectoryPicker) { addLog("当前浏览器不支持本地目录访问，请使用新版 Chrome。", "error"); return; }
  try {
    const handle = await window.showDirectoryPicker({ mode: "readwrite" });
    const permission = await handle.requestPermission({ mode: "readwrite" });
    if (permission !== "granted") throw new Error("没有获得此目录的写入授权。");
    downloadFolder = handle;
    await folderSetting("put", handle);
    downloadFolderMode = "custom";
    await folderSetting("put", downloadFolderMode, "downloadFolderMode");
    downloadFolderName.textContent = handle.name;
    downloadFolderHelp.textContent = "当前使用自选目录；下载完成后，本地收藏库会同步显示下载状态。";
    folderPermissionHint.hidden = true;
    addLog(`下载目录已选择：${handle.name}`, "success");
    updateStartButton();
  } catch (error) {
    if (error?.name !== "AbortError") addLog(`选择目录失败：${error.message}`, "error");
  }
}

async function useDefaultFolder() {
  try {
    downloadFolderMode = "default";
    downloadFolder = null;
    await folderSetting("put", "default", "downloadFolderMode");
    archiveRootHandle = await folderSetting("get", null, "rootHandle");
    downloadFolderName.textContent = archiveRootHandle ? `${archiveRootHandle.name} / 000视频下载（默认）` : "本地收藏根目录 / 000视频下载（默认）";
    downloadFolderHelp.textContent = "开始下载时会在本地收藏根目录下自动创建“000视频下载”文件夹，并按收藏夹分目录保存。";
    folderPermissionHint.hidden = Boolean(archiveRootHandle);
    if (!archiveRootHandle) folderPermissionHint.textContent = "请先在插件弹窗中设置本地收藏根目录，或选择一个自定义下载目录。";
    addLog("已切换到本地收藏根目录下的默认下载位置。", "success");
    updateStartButton();
  } catch (error) {
    folderPermissionHint.hidden = false;
    folderPermissionHint.textContent = `切换默认目录失败：${error.message}`;
  }
}

async function restoreFolder() {
  try {
    archiveRootHandle = await folderSetting("get", null, "rootHandle");
    const storedMode = await folderSetting("get", null, "downloadFolderMode");
    const storedFolder = await folderSetting("get");
    // 3.1 的版本只保存了 downloadFolder；将已有选择视为用户主动设置的自定义位置。
    downloadFolderMode = storedMode || (storedFolder ? "custom" : "default");
    if (downloadFolderMode === "custom") {
      downloadFolder = storedFolder;
      if (!downloadFolder) throw new Error("上次选择的下载目录已丢失，请重新选择目录或恢复默认位置。");
      downloadFolderName.textContent = downloadFolder.name || "上次选择的目录";
      downloadFolderHelp.textContent = "当前使用自选目录；下载完成后，本地收藏库会同步显示下载状态。";
      const permission = await downloadFolder.queryPermission({ mode: "readwrite" });
      folderPermissionHint.hidden = permission === "granted";
      if (permission !== "granted") folderPermissionHint.textContent = "上次目录需要重新授权；点击“选择目录”并重新选中它。";
    } else {
      downloadFolderMode = "default";
      downloadFolder = null;
      downloadFolderName.textContent = archiveRootHandle ? `${archiveRootHandle.name} / 000视频下载（默认）` : "本地收藏根目录 / 000视频下载（默认）";
      downloadFolderHelp.textContent = "开始下载时会在本地收藏根目录下自动创建“000视频下载”文件夹，并按收藏夹分目录保存。";
      folderPermissionHint.hidden = Boolean(archiveRootHandle);
      if (!archiveRootHandle) folderPermissionHint.textContent = "请先在插件弹窗中设置本地收藏根目录，或选择一个自定义下载目录。";
    }
    updateStartButton();
  } catch (error) {
    folderPermissionHint.hidden = false;
    folderPermissionHint.textContent = `无法读取上次目录：${error.message}`;
  }
}

async function getWritableDirectory(parent, name) {
  const base = safeName(name);
  for (let suffix = 1; suffix < 1000; suffix += 1) {
    const candidate = suffix === 1 ? base : `${base} (${suffix})`;
    try {
      await parent.getDirectoryHandle(candidate);
    } catch (error) {
      if (error?.name !== "NotFoundError") throw error;
      return parent.getDirectoryHandle(candidate, { create: true });
    }
  }
  throw new Error("无法创建唯一的视频目录。 ");
}

async function findOrCreateVideoDirectory(parent, video, index) {
  const preferredName = videoDirectoryLabel(video, index);
  const wanted = new Set();
  const bvid = String(video.bvid || "").trim();
  const aid = String(video.aid || "").trim().replace(/^av/i, "");
  if (bvid) wanted.add(`bvid:${bvid}`);
  if (aid) wanted.add(`aid:${aid}`);
  let match = null;
  let exact = null;
  for await (const entry of parent.values()) {
    if (entry.kind !== "directory") continue;
    if (entry.name === preferredName) exact = entry;
    const existingIds = BcaArchiveCore.identifiersFromDirectoryName(entry.name);
    if ([...wanted].some((identifier) => existingIds.has(identifier))) { match = entry; break; }
  }
  if (!match && !wanted.size) match = exact;
  if (match) return { directory: match, created: false };
  return { directory: await getWritableDirectory(parent, preferredName), created: true };
}

function videoDirectoryLabel(video, index) {
  const rawBvid = String(video.bvid || "").trim();
  const rawAid = String(video.aid || "").trim().replace(/^av/i, "");
  const suffix = /^BV[0-9A-Za-z]{10}$/.test(rawBvid) ? rawBvid : /^\d+$/.test(rawAid) ? `av${rawAid}` : `视频${index + 1}`;
  const tail = ` - ${suffix}`;
  const title = safeName(video.title, "未知").slice(0, Math.max(1, 100 - tail.length));
  return `${title}${tail}`;
}

async function resolveDownloadFolder() {
  if (downloadFolderMode === "custom") {
    if (!downloadFolder) throw new Error("请先选择下载目录。");
    return downloadFolder;
  }
  if (!archiveRootHandle) archiveRootHandle = await folderSetting("get", null, "rootHandle");
  if (!archiveRootHandle) throw new Error("请先在插件弹窗中设置本地收藏根目录，或选择一个自定义下载目录。");
  const permission = await archiveRootHandle.requestPermission({ mode: "readwrite" });
  if (permission !== "granted") throw new Error("未获得本地收藏根目录的写入权限，请在插件弹窗中重新授权。");
  // 使用固定目录名；已有目录时复用，不生成编号副本。
  return archiveRootHandle.getDirectoryHandle("000视频下载", { create: true });
}

function fetchOptions(signal) {
  return { credentials: "include", cache: "no-store", referrer: "https://www.bilibili.com/", referrerPolicy: "strict-origin-when-cross-origin", signal };
}

async function writeResponseToFile(directory, fileName, response, onProgress) {
  if (!response.ok) throw new Error(`下载请求失败：HTTP ${response.status}`);
  if (!response.body) throw new Error("浏览器没有提供可读取的数据流。 ");
  const file = await directory.getFileHandle(fileName, { create: true });
  const writable = await file.createWritable();
  const reader = response.body.getReader();
  const total = Number(response.headers.get("content-length")) || 0;
  let received = 0;
  try {
    while (true) {
      await waitWhilePaused();
      const { done, value } = await reader.read();
      if (done) break;
      await waitWhilePaused();
      await writable.write(value);
      received += value.byteLength;
      onProgress?.(received, total);
    }
    await writable.close();
  } catch (error) {
    try { await reader.cancel(); } catch (_) {}
    try { await writable.abort(); } catch (_) {}
    throw error;
  }
  savedFileCount += 1;
  updateProgress();
  return received;
}

async function downloadUrl(directory, fileName, url) {
  if (!/^https?:\/\//i.test(String(url || ""))) throw new Error("B 站没有提供有效的下载地址。 ");
  progressCurrent.textContent = `正在下载 ${fileName}`;
  const response = await fetch(url, fetchOptions(cancelController.signal));
  const bytes = await writeResponseToFile(directory, fileName, response, (received, total) => {
    progressCurrent.textContent = total ? `正在下载 ${fileName} · ${displayBytes(received)} / ${displayBytes(total)}` : `正在下载 ${fileName} · ${displayBytes(received)}`;
  });
  addLog(`已保存 ${fileName}（${displayBytes(bytes)}）`, "success");
}

async function downloadText(directory, fileName, text, type = "text/plain;charset=utf-8") {
  const file = await directory.getFileHandle(fileName, { create: true });
  const writable = await file.createWritable();
  await writable.write(new Blob(["\uFEFF", text], { type }));
  await writable.close();
  savedFileCount += 1;
  updateProgress();
  addLog(`已保存 ${fileName}`, "success");
}

function imageExtension(response) {
  const type = (response.headers.get("content-type") || "").toLowerCase();
  if (type.includes("png")) return "png";
  if (type.includes("webp")) return "webp";
  if (type.includes("avif")) return "avif";
  return "jpg";
}

async function fetchCover(directory, video) {
  if (!video.cover) throw new Error("没有可用的封面地址。 ");
  const response = await fetch(video.cover, { ...fetchOptions(cancelController.signal), credentials: "omit" });
  const extension = imageExtension(response);
  await writeResponseToFile(directory, `封面.${extension}`, response);
}

function formatSrtTime(seconds) {
  const millis = Math.max(0, Math.round((Number(seconds) || 0) * 1000));
  const hours = Math.floor(millis / 3600000);
  const minutes = Math.floor((millis % 3600000) / 60000);
  const secs = Math.floor((millis % 60000) / 1000);
  const fraction = millis % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(fraction).padStart(3, "0")}`;
}

function makeSrt(cues) {
  return cues.map((cue, index) => `${index + 1}\n${formatSrtTime(cue.from)} --> ${formatSrtTime(cue.to)}\n${String(cue.content || "").replace(/\r?\n/g, " ")}\n`).join("\n");
}

async function downloadSubtitles(directory, video, page, baseName) {
  const response = await runtimeMessage({ type: "bca-download-subtitles", bvid: video.bvid, aid: video.aid, cid: page.cid });
  const subtitles = response.subtitles || [];
  if (!subtitles.length) throw new Error("B 站没有提供字幕。 ");
  let saved = 0;
  for (let index = 0; index < subtitles.length; index += 1) {
    const subtitle = subtitles[index];
    const url = String(subtitle.subtitle_url || subtitle.url || "").startsWith("//") ? `https:${subtitle.subtitle_url || subtitle.url}` : String(subtitle.subtitle_url || subtitle.url || "");
    if (!url) continue;
    const responseData = await fetch(url, { ...fetchOptions(cancelController.signal), credentials: "omit" });
    if (!responseData.ok) throw new Error(`字幕下载失败：HTTP ${responseData.status}`);
    const payload = await responseData.json();
    if (!Array.isArray(payload.body)) continue;
    const lang = safeName(subtitle.lan_doc || subtitle.lan || `字幕${index + 1}`, `字幕${index + 1}`);
    await downloadText(directory, `${baseName}_${lang}.srt`, makeSrt(payload.body), "application/x-subrip;charset=utf-8");
    saved += 1;
  }
  if (!saved) throw new Error("字幕接口没有返回可转换的字幕内容。 ");
}

function codecMatches(candidate, preference) {
  const codec = String(candidate.codecs || candidate.codec || "").toLowerCase();
  const id = Number(candidate.codecid || candidate.id);
  if (preference === "avc") return id === 7 || codec.includes("avc") || codec.includes("h264");
  if (preference === "hevc") return id === 12 || codec.includes("hev") || codec.includes("h265");
  if (preference === "av1") return id === 13 || codec.includes("av01") || codec.includes("av1");
  return true;
}

function chooseDashVideo(data, requestedQuality) {
  const available = [...(data?.dash?.video || [])];
  if (!available.length) throw new Error("B 站没有提供 DASH 视频流；可尝试切换到 MP4。 ");
  let candidates = available;
  const preference = codecSelect.value;
  if (preference !== "auto") {
    const matching = candidates.filter((candidate) => codecMatches(candidate, preference));
    if (matching.length) candidates = matching;
    else addLog(`当前清晰度没有所选 ${preference.toUpperCase()} 编码，使用 B 站返回的其他编码。`, "info");
  } else {
    const avc = candidates.filter((candidate) => codecMatches(candidate, "avc"));
    if (avc.length) candidates = avc;
  }
  const quality = Number(requestedQuality) || 0;
  return candidates.find((candidate) => Number(candidate.id) === quality) || candidates.sort((left, right) => Number(right.id) - Number(left.id))[0];
}

function chooseDashAudio(data) {
  const available = [...(data?.dash?.audio || [])];
  if (!available.length) throw new Error("B 站没有提供 DASH 音频流。 ");
  const selected = Number(audioQualitySelect.value) || 0;
  return available.find((candidate) => Number(candidate.id) === selected)
    || available.sort((left, right) => Number(right.bandwidth || 0) - Number(left.bandwidth || 0))[0];
}

async function downloadDashStream(directory, filename, stream) {
  const url = stream?.baseUrl || stream?.base_url || stream?.backupUrl?.[0] || stream?.backup_url?.[0];
  if (!url) throw new Error("B 站没有返回有效的 DASH 流地址。 ");
  await downloadUrl(directory, filename, url);
}

async function fetchDanmaku(directory, page, baseName) {
  const url = `https://api.bilibili.com/x/v1/dm/list.so?oid=${encodeURIComponent(page.cid)}`;
  const response = await fetch(url, fetchOptions(cancelController.signal));
  if (!response.ok) throw new Error(`弹幕下载失败：HTTP ${response.status}`);
  const xml = await response.text();
  if (!xml.trim()) throw new Error("弹幕内容为空。 ");
  await downloadText(directory, `${baseName}_弹幕.xml`, xml, "application/xml;charset=utf-8");
}

function buildInfo(video, page, format, qualityData) {
  const quality = qualityData?.quality ? `${qualityData.quality}P` : (qualitySelect.selectedOptions[0]?.textContent || "自动");
  const lines = [
    "【视频信息】", `标题：${video.title || "未知"}`, `视频链接：${video.bvid ? `https://www.bilibili.com/video/${video.bvid}/` : video.aid ? `https://www.bilibili.com/video/av${video.aid}/` : "未知"}`,
    `BV号：${video.bvid || "未知"}`, `av号：${video.aid ? `av${String(video.aid).replace(/^av/i, "")}` : "未知"}`, `UP主：${video.owner || "未知"}`,
    `分P：${pageLabel(page)}`, `CID：${page.cid || "未知"}`, `时长（秒）：${page.duration || video.duration || "未知"}`,
    `本次下载：${new Date().toLocaleString("zh-CN")}`, `清晰度：${quality}`, `格式：${format === "mp4" ? "MP4 单文件" : "DASH 音视频分轨"}`,
    "", "【视频简介】", video.description || "未知", ""
  ];
  return lines.join("\n");
}

function taskCountForCurrentSettings(pageCount) {
  let perPage = 0;
  if (includeVideo.checked) perPage += 1;
  if (formatSelect.value === "dash" && includeAudio.checked) perPage += 1;
  if (includeDanmaku.checked) perPage += 1;
  if (includeSubtitle.checked) perPage += 1;
  if (includeCover.checked) perPage += 1;
  if (includeInfo.checked) perPage += 1;
  return perPage * pageCount;
}

async function runAsset(label, operation) {
  progressCurrent.textContent = label;
  try { await waitWhilePaused(); await operation(); }
  catch (error) {
    if (error?.name === "AbortError") throw error;
    failedCount += 1;
    downloadErrors.push({ ...activeDownloadContext, task: label, message: error?.message || String(error), time: new Date().toISOString() });
    addLog(`${label}：${error.message}`, "error");
  } finally {
    completedTasks += 1;
    updateProgress();
  }
}

function recordDownloadFailure(context, error) {
  downloadErrors.push({ ...context, message: error?.message || String(error), time: new Date().toISOString() });
}

async function persistDownloadErrorReport() {
  if (!downloadErrors.length) return;
  try {
    const root = archiveRootHandle || await folderSetting("get", null, "rootHandle");
    if (!root) throw new Error("尚未设置本地收藏根目录");
    let permission = await root.queryPermission({ mode: "readwrite" });
    if (permission !== "granted") permission = await root.requestPermission({ mode: "readwrite" });
    if (permission !== "granted") throw new Error("没有获得错误报告目录的写入权限");
    const reportDirectory = await root.getDirectoryHandle("001错误报告", { create: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const file = await reportDirectory.getFileHandle(`下载错误报告_${stamp}.txt`, { create: true });
    const lines = ["B站视频下载错误报告", `生成时间：${new Date().toLocaleString("zh-CN")}`, `错误数：${downloadErrors.length}`, ""];
    downloadErrors.forEach((entry, index) => {
      lines.push(`${index + 1}. ${entry.title || "未知视频"}`);
      if (entry.collection) lines.push(`收藏夹：${entry.collection}`);
      if (entry.bvid) lines.push(`BV号：${entry.bvid}`);
      if (entry.aid) lines.push(`av号：${entry.aid}`);
      if (entry.page) lines.push(`分P：${entry.page}`);
      if (entry.task) lines.push(`任务：${entry.task}`);
      lines.push(`时间：${entry.time || new Date().toISOString()}`, `错误：${entry.message || "未知错误"}`, "");
    });
    const writable = await file.createWritable();
    await writable.write(new Blob(["\uFEFF", lines.join("\n")], { type: "text/plain;charset=utf-8" }));
    await writable.close();
    addLog(`错误报告已保存到 001错误报告/${file.name}`, "success");
  } catch (error) {
    addLog(`未能写入本地错误报告：${error?.message || "写入失败"}`, "error");
  }
}

async function processPage(item, page, directory, index, pageCount) {
  const video = item.video;
  const baseName = safeName(video.pages.length > 1 ? `${video.title} - P${String(page.page).padStart(2, "0")}` : video.title);
  let playurl = null;
  const getPlayurl = async () => {
    const cacheKey = `${video.bvid}:${page.cid}:${formatSelect.value}:${qualitySelect.value}`;
    if (item.playurlCache?.key === cacheKey) return item.playurlCache.data;
    const data = await loadPlayurl(video, page, Number(qualitySelect.value) || 0);
    item.playurlCache = { key: cacheKey, data };
    return data;
  };
  let playurlError = null;
  const ensurePlayurl = async () => {
    if (playurl) return playurl;
    if (playurlError) throw playurlError;
    try { playurl = await getPlayurl(); return playurl; }
    catch (error) { playurlError = error; throw error; }
  };
  const needStream = includeVideo.checked || (formatSelect.value === "dash" && includeAudio.checked);
  if (needStream) {
    try { await ensurePlayurl(); }
    catch (error) {
      playurlError = error;
      addLog(`读取“${video.title}”${pageCount > 1 ? ` ${pageLabel(page)}` : ""}的下载流失败：${error.message}`, "error");
    }
  }
  if (includeVideo.checked) {
    await runAsset(`视频 ${index}/${pageCount}`, async () => {
      await ensurePlayurl();
      if (formatSelect.value === "mp4") {
        const durls = Array.isArray(playurl.durl) ? playurl.durl : [];
        if (!durls.length) throw new Error("B 站没有提供 MP4 单文件流；请尝试 DASH 格式。 ");
        for (let part = 0; part < durls.length; part += 1) {
          const suffix = durls.length > 1 ? `_片段${String(part + 1).padStart(2, "0")}` : "";
          await downloadUrl(directory, `${baseName}${suffix}.mp4`, durls[part].url || durls[part].backup_url?.[0]);
        }
      } else {
        const chosen = chooseDashVideo(playurl, Number(qualitySelect.value) || playurl.quality);
        await downloadDashStream(directory, `${baseName}_视频.m4s`, chosen);
      }
    });
  }
  if (formatSelect.value === "dash" && includeAudio.checked) {
    await runAsset(`音频 ${index}/${pageCount}`, async () => {
      await ensurePlayurl();
      const chosen = chooseDashAudio(playurl);
      await downloadDashStream(directory, `${baseName}_音频.m4s`, chosen);
    });
  }
  if (includeDanmaku.checked) await runAsset(`弹幕 ${index}/${pageCount}`, () => fetchDanmaku(directory, page, baseName));
  if (includeSubtitle.checked) await runAsset(`字幕 ${index}/${pageCount}`, () => downloadSubtitles(directory, video, page, baseName));
  if (includeCover.checked) await runAsset(`封面 ${index}/${pageCount}`, () => fetchCover(directory, video));
  if (includeInfo.checked) await runAsset(`信息 ${index}/${pageCount}`, () => downloadText(directory, `${baseName}_视频信息.txt`, buildInfo(video, page, formatSelect.value, playurl), "text/plain;charset=utf-8"));
}

async function start() {
  if (running) return;
  const validItems = queue.filter((item) => item.video);
  if (!validItems.length) return;
  try {
    downloadFolder = await resolveDownloadFolder();
    const permission = await downloadFolder.requestPermission({ mode: "readwrite" });
    if (permission !== "granted") throw new Error("没有获得保存目录的写入权限，请重新授权或重新选择目录。");
    downloadFolderName.textContent = downloadFolderMode === "default"
      ? `${archiveRootHandle.name} / 000视频下载（默认）`
      : downloadFolder.name;
    folderPermissionHint.hidden = true;
  } catch (error) { folderPermissionHint.hidden = false; addLog(error.message, "error"); return; }
  const pagesToDownload = validItems.flatMap((item) => selectedPages(item).map((page) => ({ item, page })));
  if (!pagesToDownload.length) { addLog("队列中没有可下载的分 P。", "error"); return; }
  if (!includeVideo.checked && !(formatSelect.value === "dash" && includeAudio.checked) && !includeDanmaku.checked && !includeSubtitle.checked && !includeCover.checked && !includeInfo.checked) {
    addLog("至少选择一种下载内容。", "error"); return;
  }

  running = true;
  paused = false;
  cancelController = new AbortController();
  savedFileCount = 0;
  failedCount = 0;
  downloadErrors = [];
  activeDownloadContext = null;
  completedTasks = 0;
  plannedTasks = taskCountForCurrentSettings(pagesToDownload.length);
  updateProgress();
  setBadge("下载中", "active");
  progressSummary.textContent = `准备下载 ${validItems.length} 个视频，共 ${pagesToDownload.length} 个分 P`;
  progressCurrent.textContent = "正在创建下载目录";
  startDownload.disabled = true;
  downloadActions.hidden = false;
  cancelDownload.disabled = false;
  pauseDownload.disabled = false;
  pauseDownload.textContent = "暂停下载";
  setQueueBusy(true);
  addLog(`开始下载：${validItems.length} 个视频 / ${pagesToDownload.length} 个分 P`, "info");
  try {
    const folderCache = new Map();
    const failedFolders = new Set();
    const total = pagesToDownload.length;
    for (let index = 0; index < total; index += 1) {
      try { await waitWhilePaused(); }
      catch (error) { if (error?.name === "AbortError") break; throw error; }
      if (cancelController.signal.aborted) break;
      const { item, page } = pagesToDownload[index];
      const video = item.video;
      if (failedFolders.has(item.id)) continue;
      let folderInfo = folderCache.get(item.id);
      if (!folderInfo) {
        try {
          const collectionName = safeName(video.collection || "未分类收藏", "未分类收藏", 120);
          const collectionDirectory = await downloadFolder.getDirectoryHandle(collectionName, { create: true });
          const directoryInfo = await findOrCreateVideoDirectory(collectionDirectory, video, index);
          folderInfo = { collectionDirectory, directory: directoryInfo.directory, collectionName, created: directoryInfo.created };
          folderCache.set(item.id, folderInfo);
          addLog(`保存位置：${downloadFolder.name}/${collectionName}/${directoryInfo.directory.name}`, "info");
        } catch (error) {
          const skippedTasks = taskCountForCurrentSettings(selectedPages(item).length);
          failedCount += skippedTasks;
          recordDownloadFailure({ title: video.title, collection: video.collection, bvid: video.bvid, aid: video.aid, time: new Date().toISOString() }, error);
          completedTasks += skippedTasks;
          failedFolders.add(item.id);
          addLog(`无法创建“${video.title}”的目录：${error.message}`, "error");
          continue;
        }
      }
      progressSummary.textContent = `正在处理 ${index + 1}/${total} · ${video.title}`;
      activeDownloadContext = { title: video.title, collection: video.collection, bvid: video.bvid, aid: video.aid, page: pageLabel(page) };
      addLog(`开始处理：${video.title} · ${pageLabel(page)}`, "info");
      try { await processPage(item, page, folderInfo.directory, index + 1, total); }
      catch (error) {
        if (error?.name === "AbortError") break;
        failedCount += 1;
        recordDownloadFailure({ ...activeDownloadContext, time: new Date().toISOString() }, error);
        addLog(`处理失败：${video.title} · ${error.message}`, "error");
      }
    }
    const cancelled = cancelController.signal.aborted;
    if (cancelled) {
      const allDirectories = [...folderCache.values()];
      const createdDirectories = allDirectories.filter((folderInfo) => folderInfo.created);
      const preservedDirectories = allDirectories.length - createdDirectories.length;
      let removedDirectories = 0;
      for (const folderInfo of createdDirectories) {
        try {
          await folderInfo.collectionDirectory.removeEntry(folderInfo.directory.name, { recursive: true });
          removedDirectories += 1;
          addLog(`已清理本次下载目录：${folderInfo.collectionName}/${folderInfo.directory.name}`, "success");
        } catch (error) {
          addLog(`未能清理“${folderInfo.collectionName}/${folderInfo.directory.name}”：${error.message}`, "error");
        }
      }
      setBadge("已取消", "error");
      progressSummary.textContent = allDirectories.length === 0
        ? "已取消 · 尚未处理视频目录"
        : createdDirectories.length === 0
          ? `已取消 · 已保留 ${preservedDirectories} 个原有目录及其中的文件`
          : `已取消 · 清理本次新建目录 ${removedDirectories}/${createdDirectories.length} 个${preservedDirectories ? `，保留 ${preservedDirectories} 个原有目录` : ""}`;
      addLog(`下载已取消，已清理 ${removedDirectories}/${createdDirectories.length} 个本次创建的目录${preservedDirectories ? `；保留 ${preservedDirectories} 个原有目录及其中的文件` : ""}。`, removedDirectories === createdDirectories.length ? "success" : "error");
    } else if (failedCount) {
      setBadge("部分完成", "error");
      progressSummary.textContent = `完成 · ${savedFileCount} 个文件成功，${failedCount} 项失败`;
      addLog(`处理结束：保存 ${savedFileCount} 个文件，${failedCount} 项失败。`, "error");
    } else {
      setBadge("已完成", "done");
      progressSummary.textContent = `下载完成 · 已保存 ${savedFileCount} 个文件`;
      addLog(`下载完成：已保存 ${savedFileCount} 个文件。`, "success");
    }
    await persistDownloadErrorReport();
    if (!cancelled) { completedTasks = plannedTasks; updateProgress(); }
  } finally {
    if (savedFileCount > 0 || cancelController?.signal.aborted) {
      try { await chrome.storage.local.set({ downloadRevision: crypto.randomUUID() }); }
      catch (error) { addLog(`已保存文件，但收藏库状态同步失败：${error.message}`, "error"); }
    }
    running = false;
    paused = false;
    cancelController = null;
    downloadActions.hidden = true;
    cancelDownload.disabled = false;
    pauseDownload.disabled = false;
    setQueueBusy(false);
  }
}

addVideoForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (running) return;
  const input = videoInput.value.trim();
  if (!input) return;
  parseVideoButton.textContent = "正在解析…";
  setQueueBusy(true);
  try {
    await parseAndAdd(input);
    videoInput.value = "";
    await refreshQualityOptions();
  } catch (error) {
    // 错误已经记入进度区，输入框保留方便修正。
  } finally {
    parseVideoButton.textContent = "解析并添加";
    setQueueBusy(false);
  }
});

chooseDownloadFolder.addEventListener("click", chooseFolder);
useDefaultDownloadFolder.addEventListener("click", useDefaultFolder);
formatSelect.addEventListener("change", () => { setFormatUi(); refreshQualityOptions(); });
qualitySelect.addEventListener("change", () => { queue.forEach((item) => { item.playurlCache = null; }); });
startDownload.addEventListener("click", start);
pauseDownload.addEventListener("click", () => { if (running) setPaused(!paused); });
cancelDownload.addEventListener("click", cancelCurrentDownload);

async function initialize() {
  setFormatUi();
  await restoreFolder();
  const params = new URLSearchParams(location.search);
  let initialItems = [];
  const queueId = params.get("queueId");
  try {
    if (queueId && /^[0-9a-f-]{36}$/i.test(queueId)) {
      const storageKey = `bcaDownloadQueue:${queueId}`;
      const stored = await chrome.storage.session.get(storageKey);
      initialItems = stored[storageKey] || [];
      await chrome.storage.session.remove(storageKey);
    } else if (params.has("items")) {
      // Keep compatibility with links created by older 3.5 pages.
      initialItems = JSON.parse(params.get("items") || "[]");
    }
  } catch (_) { addLog("无法读取来自本地收藏库的视频队列。", "error"); }
  if (Array.isArray(initialItems) && initialItems.length) {
    progressSummary.textContent = `正在解析 ${initialItems.length} 个视频`;
    let cursor = 0;
    const workers = Array.from({ length: Math.min(4, initialItems.length) }, async () => {
      while (cursor < initialItems.length) {
        const item = initialItems[cursor++];
        try { await parseAndAdd(normalizeIdentifier(item), item); }
        catch (_) { /* Keep failed queue entries visible for inspection. */ }
      }
    });
    await Promise.all(workers);
    progressSummary.textContent = queue.some((item) => item.video) ? "视频解析完成，可选择设置并开始下载" : "视频解析失败，请检查登录状态或视频编号";
    await refreshQualityOptions();
  }
  updateStartButton();
}

initialize().catch((error) => addLog(`下载页初始化失败：${error.message}`, "error"));
