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
  const favoriteAtText = metadata.imported && metadata.favoriteTimeUnknown
    ? "未知"
    : formatChineseDateTime(favoriteAt, true);
  const tags = Array.isArray(metadata.tags) && metadata.tags.length ? metadata.tags.join("、") : (metadata.imported ? "未知" : "无");
  const title = metadata.title || "未知";
  const videoUrl = metadata.url || "未知";
  const bvid = metadata.bvid || (videoUrl.match(/\bBV[\w]+/i)?.[0] || "未知");
  const aid = metadata.aid ? `av${String(metadata.aid).replace(/^av/i, "")}` : "未知";
  const upMid = metadata.upMid || "未知";
  const upName = metadata.upName || "未知";
  const upHome = metadata.upMid ? `https://space.bilibili.com/${metadata.upMid}` : "未知";
  const description = String(metadata.description || "未知").replace(/\r\n/g, "\n");
  const lines = [
    "【基本信息】",
    `视频收藏时间：${favoriteAtText}`,
    `信息保存于：${formatDateTime(savedAt)}`,
    `保存文件夹：${folderName}`,
    `视频标题：${title}`,
    `视频链接：${videoUrl}`,
    `BV号：${bvid}`,
    `av号：${aid}`,
    `分区：${metadata.category || "未知"}`,
    `视频时长：${metadata.imported && !(Number(metadata.duration) > 0) ? "未知" : formatDuration(metadata.duration)}`,
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
  ];
  if (metadata.imported) {
    lines.splice(6, 0, `视频状态：${metadata.invalid ? "已失效视频（已尝试恢复）" : "正常"}`);
    lines.splice(7, 0, `恢复情况：${metadata.recoverySummary || "未知"}`);
  }
  return lines.join("\n");
}

function parseManualVideoIdentifier(input) {
  let value = String(input || "").trim();
  if (!value) throw new Error("请先输入 B 站视频网址、BV 号或 av 号。");
  if (/^(?:[\w.-]+\.)?bilibili\.com\//i.test(value)) value = `https://${value}`;
  if (/^https?:\/\//i.test(value)) {
    let url;
    try { url = new URL(value); }
    catch (_) { throw new Error("视频网址格式无效。"); }
    if (!/(^|\.)bilibili\.com$/i.test(url.hostname)) {
      throw new Error("目前只支持 bilibili.com 的视频网址；也可以直接输入 BV 号或 av 号。");
    }
    const pathMatch = url.pathname.match(/\/video\/(BV[0-9A-Za-z]{10}|av\d+)/i);
    value = pathMatch?.[1] || url.searchParams.get("bvid") || url.searchParams.get("aid") || "";
  }
  const bvidMatch = value.match(/BV[0-9A-Za-z]{10}/i);
  if (bvidMatch) return { bvid: `BV${bvidMatch[0].slice(2)}` };
  const aidMatch = value.match(/^(?:av)?(\d+)$/i);
  if (aidMatch && Number(aidMatch[1]) > 0) return { aid: aidMatch[1] };
  throw new Error("无法识别视频编号，请检查网址、BV 号或 av 号是否完整。");
}

async function fetchManualVideoMetadata(identifier) {
  const query = new URLSearchParams(identifier);
  const response = await fetch(`https://api.bilibili.com/x/web-interface/view?${query}`, {
    credentials: "include",
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`读取 B 站视频信息失败：HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.code !== 0 || !payload.data) {
    throw new Error(`B 站未返回视频信息：${payload.message || `错误码 ${payload.code ?? "未知"}`}`);
  }
  const video = payload.data;
  if (!video.title || !video.pic) throw new Error("B 站返回的视频资料不完整，缺少标题或封面。");
  let tags = [];
  try {
    const tagResponse = await fetch(`https://api.bilibili.com/x/web-interface/view/detail/tag?aid=${encodeURIComponent(video.aid)}`, {
      credentials: "include",
      cache: "no-store"
    });
    if (tagResponse.ok) {
      const tagPayload = await tagResponse.json();
      if (tagPayload.code === 0 && Array.isArray(tagPayload.data)) {
        tags = tagPayload.data.map((tag) => tag.tag_name).filter(Boolean);
      }
    }
  } catch (_) {}
  const bvid = video.bvid || identifier.bvid || "";
  return {
    title: video.title,
    url: bvid ? `https://www.bilibili.com/video/${bvid}/` : `https://www.bilibili.com/video/av${video.aid}/`,
    bvid,
    aid: video.aid,
    cover: normalizeUrl(video.pic),
    description: video.desc || "未知",
    upMid: video.owner?.mid,
    upName: video.owner?.name,
    category: video.tname,
    duration: video.duration,
    pubdate: video.pubdate,
    tags
  };
}

async function addManualVideo(data) {
  const collectionName = String(data?.collection || "").trim();
  let metadata = {};
  try {
    if (!collectionName || safeSegment(collectionName) !== collectionName) throw new Error("目标收藏夹名称无效，请重新选择收藏夹。");
    const root = await getRootHandle();
    if (!root) throw new Error("尚未设置本地收藏根目录，请先选择收藏根目录。");
    await ensureWritePermission(root);
    const identifier = parseManualVideoIdentifier(data?.identifier);
    metadata = await fetchManualVideoMetadata(identifier);
    const cover = await loadCoverPng(metadata.cover);
    const collection = await root.getDirectoryHandle(collectionName);
    const favoriteAt = new Date();
    const record = await uniqueTimeFolder(collection, timestampFolder(favoriteAt));
    const savedAt = new Date();
    try {
      const info = buildInfo({ metadata, favoriteAt: favoriteAt.getTime() }, record.name, savedAt);
      await writeFile(record, "视频信息.txt", info);
      await writeFile(record, "封面.png", cover);
    } catch (error) {
      await collection.removeEntry(record.name, { recursive: true }).catch(() => {});
      throw error;
    }
    const path = `${root.name}/${collectionName}/${record.name}`;
    const message = `已添加“${metadata.title}”`;
    await chrome.storage.local.set({ lastResult: { message, path, createdAt: Date.now() }, lastError: null });
    return { ok: true, message, path, collection: collectionName };
  } catch (error) {
    const saved = await logError(error, { metadata, folders: collectionName ? [{ name: collectionName }] : [] });
    await chrome.storage.local.set({ lastResult: { message: `添加失败：${error?.message || "未知错误"}`, createdAt: Date.now() } });
    return { ok: false, message: error?.message || "添加视频失败。", details: saved.reportPath };
  }
}

function addManualVideoInOrder(data) {
  const task = saveQueue.then(() => addManualVideo(data));
  saveQueue = task.catch(() => undefined);
  return task;
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

const IMPORT_INVALID_TITLES = new Set(["已失效视频", "该视频已失效"]);
const IMPORT_BV_TABLE = "FcwAPNKTMug3GV5Lj7EJnHpWsx4tb8haYeviqBz6rkCy12mUSDQX9RdoZf";

function importClean(value) { return String(value ?? "").replace(/\s+/g, " ").trim(); }
function importIsInvalidTitle(value) { return IMPORT_INVALID_TITLES.has(importClean(value)); }
function importUsefulTitle(value) { const text = importClean(value); return !!text && !importIsInvalidTitle(text) && text !== "该合集已失效"; }
function importBvidFromUrl(value) { return importClean(value).match(/\b(BV[0-9A-Za-z]{10})\b/)?.[1] || ""; }
function importAidKey(value) { return importClean(value).replace(/^av/i, ""); }

function importBvToAid(bvid) {
  const text = importClean(bvid);
  if (!/^BV[0-9A-Za-z]{10}$/.test(text)) return "";
  const chars = text.split("");
  [chars[3], chars[9]] = [chars[9], chars[3]];
  [chars[4], chars[7]] = [chars[7], chars[4]];
  const xor = 23442827791579n;
  const mask = 2251799813685247n;
  let value = 0n;
  for (const char of chars.slice(3, 11)) {
    const digit = IMPORT_BV_TABLE.indexOf(char);
    if (digit < 0) return "";
    value = value * 58n + BigInt(digit);
  }
  return String((value & mask) ^ xor);
}

function importAidToBv(aid) {
  const text = importClean(aid);
  if (!/^\d+$/.test(text) || BigInt(text) <= 0n) return "";
  let value = BigInt(text) ^ 23442827791579n;
  const chars = "BV1000000000".split("");
  for (let index = 10; index >= 3; index -= 1) {
    chars[index] = IMPORT_BV_TABLE[Number(value % 58n)];
    value /= 58n;
  }
  [chars[3], chars[9]] = [chars[9], chars[3]];
  [chars[4], chars[7]] = [chars[7], chars[4]];
  return chars.join("");
}

function importLinkParam(value, names) {
  const text = importClean(value);
  if (!text) return "";
  try {
    const parsed = new URL(text.replace(/^bilibili:\/\//, "https://bilibili.local/"));
    for (const name of names) {
      const found = importClean(parsed.searchParams.get(name));
      if (found) return found;
    }
  } catch (_) {}
  for (const name of names) {
    const found = text.match(new RegExp(`[?&]${name}=([^&]+)`))?.[1];
    if (found) {
      try { return decodeURIComponent(found); }
      catch (_) { return found; }
    }
  }
  return "";
}

function biliImportPageApiGet(tabId, url, timeoutMs) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, { type: "bca-page-api-get", url, timeoutMs }, (response) => {
      const error = chrome.runtime.lastError;
      if (error) return reject(new Error(error.message || "无法从 B 站收藏夹页面请求接口。"));
      if (!response) return reject(new Error("B 站收藏夹页面没有响应接口请求。"));
      if (!response.ok) return reject(new Error(response.message || "B 站页面接口请求失败。"));
      resolve({ status: response.status, payload: response.payload });
    });
  });
}

async function biliImportApiGet(path, params = {}, timeoutMs = 15000, tabId = null) {
  const url = new URL(path, "https://api.bilibili.com");
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, value);
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let status;
    let payload;
    if (Number.isInteger(tabId)) {
      try {
        ({ status, payload } = await biliImportPageApiGet(tabId, url.toString(), timeoutMs));
      } catch (_) {
        const response = await fetch(url.toString(), { credentials: "include", cache: "no-store", signal: controller.signal });
        status = response.status;
        try { payload = await response.json(); }
        catch (_) { throw new Error(`B站接口没有返回有效数据（HTTP ${response.status}）。`); }
      }
    } else {
      const response = await fetch(url.toString(), { credentials: "include", cache: "no-store", signal: controller.signal });
      status = response.status;
      try { payload = await response.json(); }
      catch (_) { throw new Error(`B站接口没有返回有效数据（HTTP ${response.status}）。`); }
    }
    if (status < 200 || status >= 300) throw new Error(`B站接口请求失败：HTTP ${status}`);
    if (payload.code !== 0) throw new Error(payload.message || `B站接口返回错误码 ${payload.code ?? "未知"}`);
    return payload.data || {};
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("B站接口请求超时。");
    throw error;
  } finally { clearTimeout(timer); }
}

function importDelay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function listBiliFavoriteFolders(uid, tabId = null) {
  const ownerId = importClean(uid);
  if (!/^\d+$/.test(ownerId)) throw new Error("无法从当前收藏夹页面读取用户 UID，请刷新 B 站收藏夹页后重试。");
  const folders = [];
  let page = 1;
  try {
    while (page <= 50) {
      const data = await biliImportApiGet("/x/v3/fav/folder/created/list", { up_mid: ownerId, ps: 30, pn: page }, 15000, tabId);
      const list = Array.isArray(data.list) ? data.list : [];
      folders.push(...list.map((item) => ({
        id: String(item.id || item.media_id || item.fid || ""),
        title: importClean(item.title || item.name || ""),
        count: String(item.media_count ?? item.count ?? "")
      })).filter((item) => item.id && item.title));
      if (data.has_more === false || list.length < 30) break;
      page += 1;
    }
  } catch (error) {
    if (folders.length) return folders;
    const data = await biliImportApiGet("/x/v3/fav/folder/created/list-all", { up_mid: ownerId }, 15000, tabId);
    const list = Array.isArray(data.list) ? data.list : [];
    folders.push(...list.map((item) => ({
      id: String(item.id || item.media_id || item.fid || ""),
      title: importClean(item.title || item.name || ""),
      count: String(item.media_count ?? item.count ?? "")
    })).filter((item) => item.id && item.title));
    if (!folders.length) throw error;
  }
  return folders;
}

function normalizeImportMedia(media, folder) {
  const upper = media.upper || {};
  const link = media.link || media.uri || "";
  const linkOid = importClean(importLinkParam(link, ["oid"]));
  const linkSourceId = importClean(importLinkParam(link, ["sourceid"]));
  const explicitAid = importClean(media.aid || "");
  const explicitOid = importClean(media.oid || "");
  const mediaId = importClean(media.id || "");
  const bvid = importClean(media.bvid || media.bv_id || importBvidFromUrl(link)) || importAidToBv(explicitAid || explicitOid || linkOid || linkSourceId || mediaId);
  const aidKeys = [...new Set([explicitAid, explicitOid, linkOid, linkSourceId, mediaId].map(importAidKey).filter(Boolean))];
  const aid = explicitAid || explicitOid || linkOid || linkSourceId || mediaId || importBvToAid(bvid);
  const title = importClean(media.title || "");
  return {
    title: title || "已失效视频",
    originalTitle: title,
    bvid,
    aid,
    link,
    cover: normalizeUrl(media.cover || media.pic || ""),
    description: String(media.intro || media.desc || "").replace(/\r\n?/g, "\n").trim(),
    author: importClean(upper.name || media.upper_name || ""),
    authorMid: String(upper.mid || ""),
    category: importClean(media.tname || media.type_name || ""),
    duration: Number(media.duration || 0) || 0,
    pubdate: Number(media.pubtime || media.pubdate || 0) || 0,
    tags: [],
    favoriteAt: Number(media.fav_time || media.ctime || media.mtime || 0) || 0,
    isInvalid: media.is_invalid === true || importIsInvalidTitle(title),
    attr: Number(media.attr || 0),
    aidKeys,
    cid: importClean(media.cid || media.first_cid || media.ugc?.first_cid || ""),
    folder
  };
}

function importMediaKeys(item) {
  return new Set([
    item?.bvid ? `bvid:${item.bvid}` : "",
    ...(item?.aidKeys || []).map((aid) => `aid:${importAidKey(aid)}`),
    item?.aid ? `aid:${importAidKey(item.aid)}` : "",
    item?.cid ? `cid:${item.cid}` : ""
  ].filter(Boolean));
}

function importMobileRecord(record) {
  const upper = record?.upper || {};
  const link = record?.link || record?.uri || "";
  const oid = importClean(record?.oid || "");
  const recordId = importClean(record?.id || "");
  const linkOid = importClean(importLinkParam(link, ["oid"]));
  const linkSourceId = importClean(importLinkParam(link, ["sourceid"]));
  const aid = importClean(record?.aid || oid || recordId || linkOid || linkSourceId);
  const bvid = importClean(record?.bvid || record?.bv_id || importBvidFromUrl(link));
  const bvidFromOid = importAidToBv(importAidKey(oid || aid));
  return {
    oid,
    bvid,
    bvidFromOid,
    aid,
    aidKeys: [...new Set([importClean(record?.aid || ""), oid, recordId, linkOid, linkSourceId].map(importAidKey).filter(Boolean))],
    cid: importClean(record?.cid || record?.first_cid || record?.ugc?.first_cid || ""),
    title: importClean(record?.title || ""),
    cover: normalizeUrl(record?.cover || ""),
    author: importClean(upper.name || ""),
    authorMid: String(upper.mid || ""),
    duration: Number(record?.duration || 0) || 0,
    tags: [...(Array.isArray(record?.tags) ? record.tags : []), ...(Array.isArray(record?.new_tags) ? record.new_tags : []), ...(Array.isArray(record?.tag) ? record.tag : [])]
      .map((tag) => importClean(typeof tag === "string" ? tag : tag?.tag_name || tag?.name || tag?.title)).filter(Boolean),
    invalid: record?.is_invalid === true,
    stats: record?.cnt_info || {}
  };
}

function importMobileKeys(record) {
  return new Set([
    ...(record?.bvid ? [`bvid:${record.bvid}`] : []),
    ...(record?.bvidFromOid ? [`bvid:${record.bvidFromOid}`] : []),
    ...(record?.aidKeys || []).map((aid) => `aid:${importAidKey(aid)}`),
    ...(record?.aid ? [`aid:${importAidKey(record.aid)}`] : []),
    ...(record?.cid ? [`cid:${record.cid}`] : [])
  ]);
}

function importMobileScore(record) {
  return (importUsefulTitle(record?.title) ? 8 : 0) + (record?.cover ? 6 : 0) + (record?.author ? 3 : 0) +
    (record?.duration ? 2 : 0) + (record?.tags?.length ? 1 : 0);
}

function importMobileUnionKey(record) {
  return record?.oid || record?.aid || record?.cid || record?.bvid || record?.bvidFromOid || "";
}

function importMobileHasDisplayData(record) {
  return importUsefulTitle(record?.title) || !!record?.cover || !!record?.author || !!record?.duration || !!record?.tags?.length;
}

function mergeRecoveredValue(item, candidate, source) {
  let changed = false;
  let tagsAdded = false;
  if (importUsefulTitle(candidate.title) && (!importUsefulTitle(item.title) || item.title === "未知")) { item.title = candidate.title; changed = true; }
  if (candidate.cover) {
    const coverCandidate = { url: candidate.cover, source };
    if (source === "收藏夹接口") item.coverCandidates.push(coverCandidate);
    else item.coverCandidates.unshift(coverCandidate);
    if (!item.cover || source !== "收藏夹接口") item.cover = candidate.cover;
  }
  if (candidate.author && !item.author) item.author = candidate.author;
  if (candidate.authorMid && !item.authorMid) item.authorMid = String(candidate.authorMid);
  if (candidate.duration && !item.duration) item.duration = Number(candidate.duration) || 0;
  if (candidate.category && !item.category) item.category = candidate.category;
  if (candidate.pubdate && !item.pubdate) item.pubdate = Number(candidate.pubdate) || 0;
  if (candidate.description && !item.description) item.description = candidate.description;
  if (Array.isArray(candidate.tags) && candidate.tags.length && !item.tags.length) { item.tags = candidate.tags; tagsAdded = true; }
  if (changed || candidate.cover || candidate.author || candidate.authorMid || candidate.duration || candidate.category || candidate.pubdate || candidate.description || tagsAdded) {
    item.recoverySources.add(source);
  }
}

async function fetchImportFavoritePage(folder, page, tabId = null) {
  const data = await biliImportApiGet("/x/v3/fav/resource/list", {
    media_id: folder.id, pn: page, ps: 40, keyword: "", order: "mtime", type: 0, tid: 0, platform: "web"
  }, 15000, tabId);
  const medias = Array.isArray(data.medias) ? data.medias : [];
  return {
    items: medias.map((media) => normalizeImportMedia(media, folder)),
    total: Number(data.info?.media_count || data.media_count || data.total || 0),
    hasMore: data.has_more === undefined ? (page * 40 < Number(data.info?.media_count || data.media_count || data.total || 0)) : !!data.has_more
  };
}

async function fetchMobileRecovery(folder, targets, recoveryErrors = [], tabId = null) {
  const recordsByKey = new Map();
  const keyedTargets = targets.filter((item) => importMediaKeys(item).size);
  if (!keyedTargets.length) return [];

  function missingTargets() {
    const recordKeys = new Set();
    const records = [...recordsByKey.values()];
    for (const record of records) {
      if (!importMobileHasDisplayData(record)) continue;
      importMobileKeys(record).forEach((key) => recordKeys.add(key));
    }
    return keyedTargets.filter((target) => ![...importMediaKeys(target)].some((key) => recordKeys.has(key)));
  }

  const maxPasses = 4;
  for (let pass = 1; pass <= maxPasses; pass += 1) {
    let page = 1;
    let passFailed = false;
    for (; page <= 100; page += 1) {
      let payload = null;
      let lastError = null;
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          payload = await biliImportApiGet("/x/v3/fav/folder/resources", {
            media_id: folder.id, pn: page, platform: "ios", mobi_app: "iphone", build: 89501100
          }, 9000, tabId);
          break;
        } catch (error) {
          lastError = error;
          if (attempt < 3) await importDelay(500 * attempt);
        }
      }
      if (!payload) {
        passFailed = true;
        recoveryErrors.push(`APP收藏夹接口：第 ${page} 页第 ${pass} 轮扫描失败（${lastError?.message || "请求失败"}）；已保留此前成功读取的恢复记录。`);
        break;
      }

      const list = Array.isArray(payload.list) ? payload.list : [];
      for (const rawRecord of list) {
        const record = importMobileRecord(rawRecord);
        const key = importMobileUnionKey(record);
        if (!key) continue;
        const previous = recordsByKey.get(key);
        if (!previous || importMobileScore(record) >= importMobileScore(previous)) recordsByKey.set(key, record);
      }
      if (!payload.has_more || !list.length) break;
      await importDelay(650);
    }

    const missing = missingTargets();
    if (!missing.length) break;
    if (passFailed) recoveryErrors.push(`APP收藏夹接口：第 ${pass} 轮扫描在第 ${page} 页中断，剩余 ${missing.length} 个失效视频将继续重试。`);
    if (pass < maxPasses) await importDelay(1200);
  }
  return [...recordsByKey.values()];
}

async function fetchImportHistory(wantedBvids, recoveryErrors = [], tabId = null) {
  const wanted = new Set(wantedBvids.filter(Boolean));
  const found = new Map();
  let cursor = { max: 0, view_at: 0, business: "" };
  for (let page = 0; page < 80 && wanted.size; page += 1) {
    let data;
    try {
      data = await biliImportApiGet("/x/web-interface/history/cursor", {
        ps: 30, type: "archive", max: cursor.max || 0, view_at: cursor.view_at || 0, business: cursor.business || ""
      }, 15000, tabId);
    } catch (error) { recoveryErrors.push(`观看历史接口：${error.message}`); break; }
    const list = Array.isArray(data.list) ? data.list : [];
    for (const record of list) {
      const bvid = importClean(record?.history?.bvid || record?.bvid || "");
      if (!bvid || !wanted.has(bvid)) continue;
      found.set(bvid, record);
      wanted.delete(bvid);
    }
    const next = data.cursor || {};
    if (!list.length || (next.max === cursor.max && next.view_at === cursor.view_at && next.business === cursor.business)) break;
    cursor = next;
    if (list.length < 30) break;
  }
  return found;
}

async function enrichImportedInvalidVideos(items, folder, tabId = null) {
  const invalid = items.filter((item) => item.isInvalid);
  if (!invalid.length) return;
  const recoveryErrors = [];
  try {
    const mobileRecords = await fetchMobileRecovery(folder, invalid, recoveryErrors, tabId);
    for (const record of mobileRecords) {
      const recordKeys = importMobileKeys(record);
      const item = invalid.find((target) => [...importMediaKeys(target)].some((key) => recordKeys.has(key)));
      if (item) mergeRecoveredValue(item, record, "APP收藏夹接口");
    }
  } catch (error) { recoveryErrors.push(`APP收藏夹接口：${error.message}`); }

  let toView = new Map();
  try {
    const data = await biliImportApiGet("/x/v2/history/toview/web", {}, 15000, tabId);
    for (const record of Array.isArray(data.list) ? data.list : []) {
      if (record?.bvid) toView.set(record.bvid, record);
    }
  } catch (error) { recoveryErrors.push(`稍后再看接口：${error.message}`); }

  const history = await fetchImportHistory(invalid.map((item) => item.bvid), recoveryErrors, tabId);
  for (const item of invalid) {
    const toViewRecord = toView.get(item.bvid);
    if (toViewRecord) mergeRecoveredValue(item, {
      title: toViewRecord.title, cover: toViewRecord.pic, author: toViewRecord.owner?.name,
      authorMid: toViewRecord.owner?.mid, duration: toViewRecord.duration, pubdate: toViewRecord.pubdate
    }, "稍后再看");
    const historyRecord = history.get(item.bvid);
    if (historyRecord) mergeRecoveredValue(item, {
      title: historyRecord.title, cover: historyRecord.cover, author: historyRecord.author_name,
      authorMid: historyRecord.author_mid, duration: historyRecord.duration,
      tags: historyRecord.tag_name ? [historyRecord.tag_name] : []
    }, "观看历史");
  }

  await importRunLimited(invalid, 3, async (item) => {
    if (!item.bvid) return;
    try {
      const data = await biliImportApiGet("/x/web-interface/view", { bvid: item.bvid }, 10000, tabId);
      if (data?.title) mergeRecoveredValue(item, {
        title: data.title, cover: data.pic, author: data.owner?.name, authorMid: data.owner?.mid,
        category: data.tname, duration: data.duration, pubdate: data.pubdate, description: data.desc
      }, "视频资料接口");
    } catch (error) { recoveryErrors.push(`${item.title || item.bvid}：视频资料接口：${error.message}`); }
    try {
      if (!item.tags.length) {
        const tagData = await biliImportApiGet("/x/tag/archive/tags", { bvid: item.bvid }, 9000, tabId);
        if (Array.isArray(tagData)) item.tags = tagData.map((tag) => importClean(tag.tag_name)).filter(Boolean);
        if (item.tags.length) item.recoverySources.add("视频标签接口");
      }
    } catch (error) { recoveryErrors.push(`${item.title || item.bvid}：标签接口：${error.message}`); }
  });
  for (const item of invalid) {
    if (!item.cover && item.coverCandidates.length) item.cover = item.coverCandidates[0].url;
    item.recoveryErrors = recoveryErrors;
  }
}

async function importRunLimited(items, limit, worker) {
  let index = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = items[index++];
      try { await worker(current); } catch (_) {}
    }
  });
  await Promise.all(runners);
}

function importedUnknownCover() {
  const canvas = new OffscreenCanvas(640, 360);
  const context = canvas.getContext("2d");
  context.fillStyle = "#e8edf2";
  context.fillRect(0, 0, 640, 360);
  context.fillStyle = "#00a1d6";
  context.beginPath();
  context.roundRect(250, 92, 140, 140, 26);
  context.fill();
  context.fillStyle = "#fff";
  context.font = "bold 104px sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("B", 320, 165);
  context.fillStyle = "#69727c";
  context.font = "24px sans-serif";
  context.fillText("封面暂不可恢复", 320, 280);
  return canvas.convertToBlob({ type: "image/png" });
}

async function loadImportCover(candidates, invalid) {
  const unique = [];
  for (const candidate of candidates) {
    const url = normalizeUrl(candidate?.url || candidate);
    if (!url || unique.some((entry) => entry.url === url)) continue;
    unique.push({ url, source: candidate?.source || "收藏夹接口" });
  }
  const sourcePriority = { "APP收藏夹接口": 0, "观看历史": 1, "稍后再看": 2, "视频资料接口": 3, "收藏夹接口": 4 };
  unique.sort((left, right) => (sourcePriority[left.source] ?? 5) - (sourcePriority[right.source] ?? 5));
  for (const candidate of unique) {
    try {
      if (invalid && /(?:blank|placeholder|default|sprite|no_cover|nocover)/i.test(candidate.url)) continue;
      const blob = await loadCoverPng(candidate.url);
      if (invalid) {
        const bitmap = await createImageBitmap(blob);
        try {
          const canvas = new OffscreenCanvas(32, 18);
          const context = canvas.getContext("2d", { willReadFrequently: true });
          context.drawImage(bitmap, 0, 0, 32, 18);
          const pixels = context.getImageData(0, 0, 32, 18).data;
          let sum = 0; let square = 0; let saturation = 0;
          for (let index = 0; index < pixels.length; index += 4) {
            const red = pixels[index], green = pixels[index + 1], blue = pixels[index + 2];
            const lum = 0.299 * red + 0.587 * green + 0.114 * blue;
            sum += lum; square += lum * lum;
            const maximum = Math.max(red, green, blue), minimum = Math.min(red, green, blue);
            saturation += maximum ? (maximum - minimum) / maximum : 0;
          }
          const count = pixels.length / 4;
          const mean = sum / count;
          const deviation = Math.sqrt(Math.max(0, square / count - mean * mean));
          const meanSaturation = saturation / count;
          if (mean > 180 && deviation < 8 && meanSaturation < 0.08) continue;
        } finally { bitmap.close(); }
      }
      return { blob, source: candidate.source };
    } catch (_) {}
  }
  return { blob: await importedUnknownCover(), source: "未知" };
}

async function readExistingImportIdentifiers(collection) {
  const identifiers = new Set();
  for await (const entry of collection.values()) {
    if (entry.kind !== "directory") continue;
    try {
      const file = await entry.getFileHandle("视频信息.txt");
      const text = await (await file.getFile()).text();
      const bvid = text.match(/^BV号：(.+)$/m)?.[1]?.trim();
      const aid = text.match(/^av号：(.+)$/m)?.[1]?.trim().replace(/^av/i, "");
      if (bvid && bvid !== "未知") identifiers.add(`bvid:${bvid}`);
      if (aid && aid !== "未知") identifiers.add(`aid:${aid}`);
    } catch (_) {}
  }
  return identifiers;
}

function importMetadata(item, cover) {
  const bvid = item.bvid || "";
  const aid = item.aid || (bvid ? importBvToAid(bvid) : "");
  const title = importUsefulTitle(item.title) ? item.title : "未知";
  const sources = [...item.recoverySources];
  const recoveredFields = [item.title, item.cover, item.author, item.duration, item.category, item.pubdate, item.description]
    .filter((value) => value && value !== "已失效视频").length;
  return {
    title,
    url: bvid ? `https://www.bilibili.com/video/${bvid}/` : aid ? `https://www.bilibili.com/video/av${aid}/` : "未知",
    bvid: bvid || "未知",
    aid: aid || "",
    cover: cover?.source === "未知" ? "" : item.cover,
    description: item.description || "未知",
    upName: item.author || "未知",
    upMid: item.authorMid || "",
    category: item.category || "未知",
    duration: Number(item.duration) || 0,
    pubdate: Number(item.pubdate) || 0,
    tags: item.tags.length ? item.tags : ["未知"],
    imported: true,
    invalid: item.isInvalid,
    recoverySummary: item.isInvalid
      ? (sources.length ? `已从${sources.join("、")}找回部分资料（${recoveredFields} 项）` : "未能找回资料，缺失项以“未知”标记")
      : "收藏夹资料"
  };
}

function importIdentifierKeys(item) {
  const normalizedAid = String(item.aid || "").replace(/^av/i, "");
  return [`bvid:${item.bvid}`, `aid:${normalizedAid}`].filter((key) => !key.endsWith(":"));
}

async function saveImportedItem(root, folder, item) {
  const collectionName = safeSegment(folder.title);
  const collection = await root.getDirectoryHandle(collectionName, { create: true });

  item.coverCandidates = [
    ...item.coverCandidates,
    ...(item.cover ? [{ url: item.cover, source: "收藏夹接口" }] : [])
  ];
  if (item.coverPreparationError) throw item.coverPreparationError;
  const cover = item.preparedCover || await loadImportCover(item.coverCandidates, item.isInvalid);
  const metadata = importMetadata(item, cover);
  const favoriteTimestamp = Number(item.favoriteAt) || 0;
  const parsedFavoriteAt = favoriteTimestamp ? new Date(favoriteTimestamp > 1e12 ? favoriteTimestamp : favoriteTimestamp * 1000) : null;
  const favoriteTimeUnknown = !parsedFavoriteAt || Number.isNaN(parsedFavoriteAt.getTime());
  const favoriteAt = favoriteTimeUnknown ? new Date() : parsedFavoriteAt;
  metadata.favoriteTimeUnknown = favoriteTimeUnknown;
  const record = await uniqueTimeFolder(collection, timestampFolder(favoriteAt));
  try {
    await writeFile(record, "视频信息.txt", buildInfo({ metadata, favoriteAt: favoriteAt.getTime() }, record.name, new Date()));
    await writeFile(record, "封面.png", cover.blob);
  } catch (error) {
    await collection.removeEntry(record.name, { recursive: true }).catch(() => {});
    throw error;
  }
  return { path: `${root.name}/${collectionName}/${record.name}` };
}

function sendImportProgress(text) {
  chrome.runtime.sendMessage({ type: "bca-import-progress", text }, () => { void chrome.runtime.lastError; });
}

async function importBiliFavorites(data, tabId = null) {
  const selectedIds = new Set((Array.isArray(data?.folderIds) ? data.folderIds : []).map(String));
  const reportLines = ["B站收藏夹本地导入报告", `开始时间：${formatChineseDateTime(new Date(), true)}`];
  const root = await getRootHandle();
  if (!root) throw new Error("尚未设置本地保存文件夹，请先在插件中选择保存目录。");
  await ensureWritePermission(root);
  if (!selectedIds.size) throw new Error("请至少勾选一个 B 站收藏夹。");
  const allFolders = await listBiliFavoriteFolders(data?.uid, tabId);
  const folders = allFolders.filter((folder) => selectedIds.has(String(folder.id)));
  if (!folders.length) throw new Error("所选收藏夹已不存在或没有读取权限，请刷新列表后重试。");

  let imported = 0, skipped = 0, failed = 0, total = 0, hasIssues = false;
  const savedPaths = [];
  for (let folderIndex = 0; folderIndex < folders.length; folderIndex += 1) {
    const folder = folders[folderIndex];
    const folderLog = [];
    sendImportProgress(`正在读取 ${folder.title}（${folderIndex + 1}/${folders.length}）…`);
    let first;
    try { first = await fetchImportFavoritePage(folder, 1, tabId); }
    catch (error) {
      failed += 1;
      hasIssues = true;
      reportLines.push("", `收藏夹：${folder.title}`, `读取第 1 页失败：${error.message}`);
      continue;
    }
    const allItems = [...first.items];
    const pageLimit = first.total ? Math.ceil(first.total / 40) : (first.hasMore || first.items.length === 40 ? 1000 : 1);
    for (let page = 2; page <= Math.min(pageLimit, 1000); page += 1) {
      try {
        const result = await fetchImportFavoritePage(folder, page, tabId);
        allItems.push(...result.items);
        if (!result.items.length || (!first.total && !result.hasMore)) break;
      } catch (error) {
        failed += 1;
        folderLog.push(`读取第 ${page} 页失败：${error.message}`);
        break;
      }
      if (page % 4 === 0) await importDelay(150);
    }
    total += allItems.length;
    allItems.forEach((item) => {
      item.coverCandidates = item.cover ? [{ url: item.cover, source: "收藏夹接口" }] : [];
      item.recoverySources = new Set();
      if (!item.isInvalid && !importUsefulTitle(item.title)) item.title = "未知";
    });
    try { await enrichImportedInvalidVideos(allItems, folder, tabId); }
    catch (error) { folderLog.push(`失效视频恢复流程异常：${error.message}`); }
    for (const item of allItems) {
      for (const message of item.recoveryErrors || []) {
        if (!folderLog.includes(message)) folderLog.push(message);
      }
    }

    const collection = await root.getDirectoryHandle(safeSegment(folder.title), { create: true });
    const duplicateSet = await readExistingImportIdentifiers(collection);
    const pendingItems = [];
    for (const item of allItems) {
      const keys = importIdentifierKeys(item);
      if (keys.some((key) => duplicateSet.has(key))) { skipped += 1; continue; }
      keys.forEach((key) => duplicateSet.add(key));
      pendingItems.push(item);
    }
    for (let offset = 0; offset < pendingItems.length; offset += 12) {
      const batch = pendingItems.slice(offset, offset + 12);
      sendImportProgress(`正在准备 ${folder.title} 的封面：${Math.min(offset + batch.length, pendingItems.length)}/${pendingItems.length}`);
      await importRunLimited(batch, 4, async (item) => {
        item.coverCandidates = [
          ...item.coverCandidates,
          ...(item.cover ? [{ url: item.cover, source: "收藏夹接口" }] : [])
        ];
        try { item.preparedCover = await loadImportCover(item.coverCandidates, item.isInvalid); }
        catch (error) { item.coverPreparationError = error; }
      });
      for (let index = 0; index < batch.length; index += 1) {
        const item = batch[index];
        sendImportProgress(`正在导入 ${folder.title}：${offset + index + 1}/${pendingItems.length}（已保存 ${imported} 个）`);
        try {
          const result = await saveImportedItem(root, folder, item);
          imported += 1;
          savedPaths.push(result.path);
        } catch (error) {
          failed += 1;
          folderLog.push(`${item.title || "未知"} (${item.bvid || item.aid || "无编号"})：${error.message}`);
        }
      }
    }
    if (folderLog.length) reportLines.push("", `收藏夹：${folder.title}`, ...folderLog.slice(0, 500));
    if (folderLog.length) hasIssues = true;
  }

  reportLines.push("", `完成时间：${formatChineseDateTime(new Date(), true)}`, `读取视频：${total}`, `新导入：${imported}`, `已存在跳过：${skipped}`, `失败：${failed}`);
  let reportPath = "";
  if (failed || hasIssues || reportLines.some((line) => line.includes("失败：") || line.includes("失败"))) {
    reportPath = await persistErrorReport(reportLines.join("\n"));
    await chrome.storage.local.set({ lastError: { report: reportLines.join("\n").slice(0, 16000), reportPath, createdAt: Date.now() } });
  }
  const message = `导入完成：新导入 ${imported} 个，已存在跳过 ${skipped} 个，失败 ${failed} 个。`;
  const pathText = savedPaths.slice(0, 10).join("\n");
  await chrome.storage.local.set({ lastResult: { message, path: pathText, createdAt: Date.now() }, ...(failed || hasIssues ? {} : { lastError: null }) });
  return { ok: true, message, imported, skipped, failed, total, reportPath };
}

function importBiliFavoritesInOrder(data, tabId = null) {
  const task = saveQueue.then(() => importBiliFavorites(data, tabId));
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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "list-bili-favorite-folders") {
    listBiliFavoriteFolders(message.uid, sender?.tab?.id ?? null).then((folders) => sendResponse({ ok: true, folders }))
      .catch((error) => sendResponse({ ok: false, message: error?.message || "读取收藏夹失败。" }));
    return true;
  }
  if (message?.type === "import-bili-favorites") {
    importBiliFavoritesInOrder(message.data || message, sender?.tab?.id ?? null).then(sendResponse).catch(async (error) => {
      const folders = Array.isArray(message.folderIds) ? message.folderIds.map((id) => ({ id, name: id })) : [];
      const saved = await logError(error, { folders });
      await chrome.storage.local.set({ lastResult: { message: `导入失败：${error?.message || "未知错误"}`, createdAt: Date.now() } });
      sendResponse({ ok: false, message: error?.message || "导入失败。", reportPath: saved.reportPath });
    });
    return true;
  }
  if (message?.type === "save-favorite") {
    saveFavoriteInOrder(message.data).then(sendResponse).catch((error) => sendResponse({ ok: false, message: error.message }));
    return true;
  }
  if (message?.type === "add-manual-video") {
    addManualVideoInOrder(message.data).then(sendResponse).catch((error) => sendResponse({ ok: false, message: error.message || "添加视频失败。" }));
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
