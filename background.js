const DB_NAME = "bili-fav-archiver";
const DB_STORE = "settings";
let saveQueue = Promise.resolve();

async function updateActionIcon(enabled) {
  const imageData = {};
  for (const size of [16, 32, 48, 128]) {
    const canvas = new OffscreenCanvas(size, size);
    const context = canvas.getContext("2d");
    const radius = size * 0.22;
    context.beginPath();
    context.moveTo(radius, 1);
    context.arcTo(size - 1, 1, size - 1, radius, radius);
    context.arcTo(size - 1, size - 1, size - radius, size - 1, radius);
    context.arcTo(1, size - 1, 1, size - radius, radius);
    context.arcTo(1, 1, radius, 1, radius);
    context.closePath();
    context.fillStyle = enabled ? "#00a1d6" : "#9ba2ac";
    context.fill();
    context.fillStyle = "#ffffff";
    context.font = `bold ${Math.round(size * 0.62)}px Arial, sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("B", size / 2, size / 2 + size * 0.03);
    imageData[size] = context.getImageData(0, 0, size, size);
  }
  await chrome.action.setIcon({ imageData });
}

async function initializeActionIcon() {
  const settings = await chrome.storage.local.get("enabled");
  const enabled = settings.enabled !== false;
  if (settings.enabled === undefined) await chrome.storage.local.set({ enabled: true });
  await updateActionIcon(enabled);
}

chrome.runtime.onInstalled.addListener(() => initializeActionIcon().catch((error) => console.warn("更新扩展图标失败", error)));
chrome.runtime.onStartup.addListener(() => initializeActionIcon().catch((error) => console.warn("更新扩展图标失败", error)));
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes.enabled) {
    updateActionIcon(changes.enabled.newValue !== false).catch((error) => console.warn("更新扩展图标失败", error));
  }
});
initializeActionIcon().catch((error) => console.warn("初始化扩展图标失败", error));

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(DB_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("无法打开插件设置数据库。"));
  });
}

async function getRootHandle() {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(DB_STORE, "readonly").objectStore(DB_STORE).get("rootHandle");
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error("读取保存目录失败。"));
    });
  } finally {
    db.close();
  }
}

function localDateParts(date) {
  return {
    year: date.getFullYear(), month: String(date.getMonth() + 1).padStart(2, "0"), day: String(date.getDate()).padStart(2, "0"),
    hour: String(date.getHours()).padStart(2, "0"), minute: String(date.getMinutes()).padStart(2, "0"),
    second: String(date.getSeconds()).padStart(2, "0"), millisecond: String(date.getMilliseconds()).padStart(3, "0")
  };
}

function timestampFolder(date) {
  const p = localDateParts(date);
  return `${p.year}年${p.month}月${p.day}日${p.hour}时${p.minute}分${p.second}秒`;
}

function formatDateTime(date) {
  const p = localDateParts(date);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

function formatChineseDateTime(date, withMilliseconds = false) {
  const p = localDateParts(date);
  return `${p.year}年${p.month}月${p.day}日 ${p.hour}时${p.minute}分${p.second}秒${withMilliseconds ? `.${p.millisecond}` : ""}`;
}

function safeSegment(input, fallback = "未命名收藏夹") {
  let value = String(input || "").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/[. ]+$/g, "").trim();
  if (!value || value === "." || value === "..") value = fallback;
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(value)) value = `_${value}`;
  return value.slice(0, 120);
}

function normalizeUrl(value) {
  if (!value) return "";
  return String(value).startsWith("//") ? `https:${value}` : String(value);
}

function formatDuration(seconds) {
  const total = Math.max(0, Number(seconds) || 0);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}` : `${minutes}:${String(secs).padStart(2, "0")}`;
}

function formatPublishDate(value) {
  const numeric = Number(value) || 0;
  if (!numeric) return "未知";
  const date = new Date(numeric > 1e12 ? numeric : numeric * 1000);
  if (Number.isNaN(date.getTime())) return "未知";
  const week = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"][date.getDay()];
  return `${formatDateTime(date)} ${week}`;
}

async function ensureWritePermission(handle) {
  const permission = await handle.queryPermission({ mode: "readwrite" });
  if (permission !== "granted") {
    throw new Error("所选文件夹的写入授权已失效。请点击插件图标中的“重新授权保存位置”，允许访问后重试。 ");
  }
}

async function uniqueTimeFolder(parent, name) {
  let candidate = name;
  let suffix = 2;
  while (true) {
    try {
      await parent.getDirectoryHandle(candidate);
      candidate = `${name}_${suffix++}`;
    } catch (error) {
      if (error?.name !== "NotFoundError") throw error;
      return parent.getDirectoryHandle(candidate, { create: true });
    }
  }
}

async function writeFile(directory, name, content) {
  const file = await directory.getFileHandle(name, { create: true });
  const writable = await file.createWritable();
  try {
    await writable.write(content);
    await writable.close();
  } catch (error) {
    try { await writable.abort(); } catch (_) {}
    throw error;
  }
}

async function loadCoverPng(url) {
  const normalized = normalizeUrl(url);
  if (!normalized) throw new Error("网页没有提供封面地址。");
  const response = await fetch(normalized, { credentials: "omit", cache: "no-store" });
  if (!response.ok) throw new Error(`封面下载失败：HTTP ${response.status}`);
  const source = await response.blob();
  const bitmap = await createImageBitmap(source);
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("无法创建封面转换画布。");
    context.drawImage(bitmap, 0, 0);
    return await canvas.convertToBlob({ type: "image/png" });
  } finally {
    bitmap.close();
  }
}

function buildInfo(data, folderName, savedAt) {
  const metadata = data.metadata || {};
  const favoriteAt = new Date(Number(data.favoriteAt) || Date.now());
  const tags = Array.isArray(metadata.tags) && metadata.tags.length ? metadata.tags.join("、") : "无";
  const title = metadata.title || "未知";
  const videoUrl = metadata.url || "未知";
  const bvid = metadata.bvid || (videoUrl.match(/\bBV[\w]+/i)?.[0] || "未知");
  const aid = metadata.aid ? `av${String(metadata.aid).replace(/^av/i, "")}` : "未知";
  const upMid = metadata.upMid || "未知";
  const upName = metadata.upName || "未知";
  const upHome = metadata.upMid ? `https://space.bilibili.com/${metadata.upMid}` : "未知";
  const description = String(metadata.description || "未知").replace(/\r\n/g, "\n");
  return [
    "【基本信息】",
    `视频收藏时间：${formatChineseDateTime(favoriteAt, true)}`,
    `信息保存于：${formatDateTime(savedAt)}`,
    `保存文件夹：${folderName}`,
    `视频标题：${title}`,
    `视频链接：${videoUrl}`,
    `BV号：${bvid}`,
    `av号：${aid}`,
    `分区：${metadata.category || "未知"}`,
    `视频时长：${formatDuration(metadata.duration)}`,
    `视频发布时间：${formatPublishDate(metadata.pubdate)}`,
    "",
    "【UP主】",
    `UP主昵称：${upName}`,
    `UP主UID：${upMid}`,
    `UP主主页：${upHome}`,
    "",
    "【标签】",
    tags,
    "",
    "【视频简介】",
    description,
    ""
  ].join("\n");
}

function reportText(error, context = {}) {
  const now = new Date();
  const metadata = context.metadata || {};
  return [
    "B站收藏信息归档错误报告",
    `发生时间：${formatChineseDateTime(now, true)}`,
    `错误：${error?.message || String(error)}`,
    `视频标题：${metadata.title || "未知"}`,
    `视频链接：${metadata.url || "未知"}`,
    `收藏夹：${(context.folders || []).map((folder) => folder.name || folder.id).join("、") || "未知"}`,
    `详细信息：${error?.stack || "无"}`,
    ""
  ].join("\n").slice(0, 16000);
}

async function persistErrorReport(text) {
  try {
    const root = await getRootHandle();
    if (!root || await root.queryPermission({ mode: "readwrite" }) !== "granted") return "";
    const directory = await root.getDirectoryHandle("错误报告", { create: true });
    const filename = `${timestampFolder(new Date())}_${Date.now()}_错误报告.txt`;
    await writeFile(directory, filename, text);
    return `${root.name}/错误报告/${filename}`;
  } catch (_) {
    return "";
  }
}

async function logError(error, context = {}) {
  const report = reportText(error, context);
  const reportPath = await persistErrorReport(report);
  await chrome.storage.local.set({ lastError: { report, reportPath, createdAt: Date.now() }, authorizedErrorAt: null });
  return { report, reportPath };
}

async function saveFavorite(data) {
  const metadata = data?.metadata || {};
  const folders = Array.isArray(data?.folders) ? data.folders : [];
  const settings = await chrome.storage.local.get("enabled");
  if (settings.enabled === false) return { ok: false, message: "自动归档已关闭，本次收藏未保存到本地。" };
  try {
    if (!folders.length || folders.some((folder) => !folder?.name)) {
      throw new Error("无法从 B 站读取本次收藏夹的实际名称。请保持收藏夹列表已加载后重试。 ");
    }
    const root = await getRootHandle();
    if (!root) throw new Error("尚未设置本地保存文件夹。请点击插件图标并选择一个保存目录。 ");
    await ensureWritePermission(root);

    const favoriteAt = new Date(Number(data.favoriteAt) || Date.now());
    const dateFolderName = timestampFolder(favoriteAt);
    const savedAt = new Date();
    const savedFolders = [];
    for (const folder of folders) {
      const collectionFolder = await root.getDirectoryHandle(safeSegment(folder.name), { create: true });
      const recordFolder = await uniqueTimeFolder(collectionFolder, dateFolderName);
      const info = buildInfo({ ...data, metadata }, recordFolder.name, savedAt);
      await writeFile(recordFolder, "视频信息.txt", info);
      const cover = await loadCoverPng(metadata.cover);
      await writeFile(recordFolder, "封面.png", cover);
      savedFolders.push(`${root.name}/${safeSegment(folder.name)}/${recordFolder.name}`);
    }

    const message = `已保存到 ${savedFolders.length} 个收藏夹。`;
    await chrome.storage.local.set({ lastResult: { message, path: savedFolders.join("\n"), createdAt: Date.now() }, lastError: null, pendingFavorite: null });
    return { ok: true, message, path: savedFolders.join("\n") };
  } catch (error) {
    if (error?.message?.includes("写入授权已失效")) {
      await chrome.storage.local.set({ pendingFavorite: data });
    }
    const saved = await logError(error, { metadata, folders });
    await chrome.storage.local.set({ lastResult: { message: `保存失败：${error?.message || "未知错误"}`, createdAt: Date.now() } });
    return {
      ok: false,
      message: error?.message || "保存失败。",
      details: saved.reportPath ? `错误报告已保存：${saved.reportPath}` : "错误报告保存在插件中；点击插件图标可查看并下载。"
    };
  }
}

function saveFavoriteInOrder(data) {
  const task = saveQueue.then(() => saveFavorite(data));
  saveQueue = task.catch(() => undefined);
  return task;
}

async function recordFavoriteError(data) {
  const error = new Error(data?.message || "B站收藏操作失败。");
  const saved = await logError(error, { metadata: data?.metadata || {} });
  return {
    ok: false,
    message: error.message,
    details: saved.reportPath ? `错误报告已保存：${saved.reportPath}` : "错误报告保存在插件中；点击插件图标可查看并下载。",
    reportPath: saved.reportPath
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "save-favorite") {
    saveFavoriteInOrder(message.data).then(sendResponse).catch((error) => sendResponse({ ok: false, message: error.message }));
    return true;
  }
  if (message?.type === "record-favorite-error") {
    recordFavoriteError(message.data).then(sendResponse).catch((error) => sendResponse({ ok: false, message: error.message }));
    return true;
  }
  if (message?.type === "retry-pending-favorite") {
    chrome.storage.local.get("pendingFavorite").then(({ pendingFavorite }) => {
      if (!pendingFavorite) return sendResponse({ ok: false, message: "没有可补存的视频，请回到 B 站重新收藏一次。" });
      return saveFavoriteInOrder(pendingFavorite).then(sendResponse);
    }).catch((error) => sendResponse({ ok: false, message: error.message || "读取待补存视频失败。" }));
    return true;
  }
  if (message?.type === "get-status") {
    chrome.storage.local.get(["baseFolderName", "lastResult", "lastError", "pendingFavorite", "authorizedErrorAt"]).then(sendResponse);
    return true;
  }
});
