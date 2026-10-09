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
  const stats = metadata.stats || {};
  const hasStats = IMPORT_STAT_KEYS.some((key) => !importIsPlaceholder(stats[key]));
  const fansText = importIsPlaceholder(metadata.upFans) ? "未知" : String(metadata.upFans);
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
    `UP主粉丝数：${fansText}`,
    `UP主主页：${upHome}`,
    ""
  ];
  // 互动数据单独成段，不再和简介挤在一起（只有确实抓到时才写）
  if (hasStats) {
    lines.push("【互动数据】");
    for (const key of IMPORT_STAT_KEYS) {
      const value = stats[key];
      lines.push(`${IMPORT_STAT_LABELS[key]}：${importIsPlaceholder(value) ? "未知" : String(value)}`);
    }
    lines.push("");
  }
  lines.push(
    "【标签】",
    tags,
    "",
    "【视频简介】",
    description,
    ""
  );
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
  const collectionNames = [...new Set((Array.isArray(data?.collections) ? data.collections : [data?.collection])
    .map((value) => String(value || "").trim()).filter(Boolean))];
  let metadata = {};
  try {
    if (!collectionNames.length) throw new Error("请至少选择一个目标收藏夹。");
    if (collectionNames.some((name) => safeSegment(name) !== name || ["错误报告", "001错误报告", "000视频下载"].includes(name))) throw new Error("目标收藏夹名称无效，请重新选择收藏夹。");
    const root = await getRootHandle();
    if (!root) throw new Error("尚未设置本地收藏根目录，请先选择收藏根目录。");
    await ensureWritePermission(root);
    const identifier = parseManualVideoIdentifier(data?.identifier);
    metadata = await fetchManualVideoMetadata(identifier);
    const keys = new Set(importIdentifierKeys(metadata));
    if (!keys.size) throw new Error("B 站解析结果缺少 BV/av 号，无法安全检查重复视频。");
    const pending = [];
    const duplicates = [];
    const failures = [];
    for (const name of collectionNames) {
      try {
        const collection = await root.getDirectoryHandle(name);
        const existing = await readExistingImportIdentifiers(collection);
        if (identifiersIntersect(existing, keys)) duplicates.push(name);
        else pending.push({ name, collection });
      } catch (error) {
        failures.push({ name, message: error?.message || "无法读取目标收藏夹。" });
      }
    }
    const savedCollections = [];
    const savedPaths = [];
    if (pending.length) {
      const cover = await loadCoverPng(metadata.cover);
      const favoriteAt = new Date();
      for (const target of pending) {
        const record = await uniqueTimeFolder(target.collection, timestampFolder(favoriteAt));
        try {
          const info = buildInfo({ metadata, favoriteAt: favoriteAt.getTime() }, record.name, new Date());
          await writeFile(record, "视频信息.txt", info);
          await writeFile(record, "封面.png", cover);
          savedCollections.push(target.name);
          savedPaths.push(`${root.name}/${target.name}/${record.name}`);
        } catch (error) {
          await target.collection.removeEntry(record.name, { recursive: true }).catch(() => {});
          failures.push({ name: target.name, message: error?.message || "保存视频信息失败。" });
        }
      }
    }

    let reportPath = "";
    if (failures.length) {
      const message = failures.map((item) => `${item.name}：${item.message}`).join("；");
      const saved = await logError(new Error(`部分目标收藏夹保存失败：${message}`), {
        metadata, folders: failures.map((item) => ({ name: item.name }))
      });
      reportPath = saved.reportPath || "";
    }
    const messageParts = [];
    if (savedCollections.length) messageParts.push(`已添加到 ${savedCollections.length} 个收藏夹`);
    if (duplicates.length) messageParts.push(`已存在相同视频，跳过 ${duplicates.length} 个收藏夹`);
    if (failures.length) messageParts.push(`${failures.length} 个收藏夹保存失败`);
    const message = messageParts.join("；") || "已存在相同视频，未重复添加。";
    await chrome.storage.local.set({
      lastResult: { message: `“${metadata.title}”：${message}`, path: savedPaths.slice(0, 10).join("\n"), createdAt: Date.now() },
      ...(failures.length ? { lastError: { reportPath, createdAt: Date.now(), report: message } } : { lastError: null })
    });
    const ok = !failures.length || savedCollections.length > 0 || duplicates.length > 0;
    return { ok, message, paths: savedPaths, added: savedCollections, skipped: duplicates, failed: failures, reportPath };
  } catch (error) {
    const saved = await logError(error, { metadata, folders: collectionNames.map((name) => ({ name })) });
    await chrome.storage.local.set({ lastResult: { message: `添加失败：${error?.message || "未知错误"}`, createdAt: Date.now() } });
    return { ok: false, message: error?.message || "添加视频失败。", details: saved.reportPath };
  }
}

function identifiersIntersect(left, right) {
  for (const key of right) if (left.has(key)) return true;
  return false;
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
    const directory = await root.getDirectoryHandle("001错误报告", { create: true });
    const filename = `${timestampFolder(new Date())}_${Date.now()}_错误报告.txt`;
    await writeFile(directory, filename, text);
    return `${root.name}/001错误报告/${filename}`;
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
  // 收藏夹接口的 intro 常常是 B 站分享文案，统计信息挤在简介里；这里先拆开，
  // 真正的简介后面还会用 /x/web-interface/view 的 desc 覆盖（如果有的话）
  const shareSplit = splitShareText(String(media.intro || media.desc || "").replace(/\r\n?/g, "\n").trim());
  return {
    title: title || "已失效视频",
    originalTitle: title,
    bvid,
    aid,
    link,
    cover: normalizeUrl(media.cover || media.pic || ""),
    description: shareSplit.description,
    shareStats: shareSplit.stats,
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
      // 4.2：失效视频的跨页扫描也可能很久，这里也要能响应暂停/取消
      await importWaitIfPaused();
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
    await importWaitIfPaused();
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

/* ==========================================================================
   4.2：导入/更新的完整重构
   与 4.1beta 的区别：
   - 每条视频都抓一次完整资料（标签、简介、发布时间、分区、互动数据、UP 主粉丝数），
     不再只补“缺失”的字段；
   - 支持暂停 / 继续 / 取消，取消时回滚本次新建的目录与被改写的文件，
     导入前就在本地收藏夹里的内容保持不动；
   - 本地没有同名收藏夹时全量导入，已有同名收藏夹时补齐缺失视频，
     并按新格式刷新数据不完整的旧记录。
   ========================================================================== */

// 归档里字段缺失会写成这些占位值，判断“数据是否完整”时一律当成空
const IMPORT_PLACEHOLDER_VALUES = new Set(["", "无", "未知", "-", "--", "—", "暂无", "/", "N/A", "n/a", "null", "undefined"]);

const IMPORT_STAT_KEYS = ["view", "danmaku", "like", "coin", "favorite", "share"];
const IMPORT_STAT_LABELS = { view: "播放量", danmaku: "弹幕量", like: "点赞数", coin: "投硬币枚数", favorite: "收藏人数", share: "转发人数" };
const IMPORT_DETAIL_CONCURRENCY = 2;   // 详情抓取并发
const IMPORT_DETAIL_DELAY_MS = 350;    // 详情抓取间隔，给 B 站接口留余地

function importIsPlaceholder(value) {
  return IMPORT_PLACEHOLDER_VALUES.has(importClean(value));
}

function importTagNames(tagData) {
  if (!Array.isArray(tagData)) return [];
  return [...new Set(tagData.map((tag) => importClean(tag?.tag_name || tag?.name)).filter(Boolean))];
}

/* ---------- B 站分享文案拆分（与 archive-core.js 的实现等价，测试会比对两者） ---------- */

const SHARE_STATS_PATTERN = /视频播放量\s*([\d.]+)\s*[、,]?\s*弹幕量\s*([\d.]+)/;

function parseShareStats(text) {
  const source = String(text ?? "");
  const stats = {};
  const patterns = {
    view: /视频播放量\s*([\d.]+)/,
    danmaku: /弹幕量\s*([\d.]+)/,
    like: /点赞数\s*([\d.]+)/,
    coin: /投硬币枚数\s*([\d.]+)/,
    favorite: /收藏人数\s*([\d.]+)/,
    share: /转发人数\s*([\d.]+)/
  };
  for (const [key, pattern] of Object.entries(patterns)) {
    const match = source.match(pattern);
    if (match) stats[key] = match[1];
  }
  return stats;
}

function splitShareText(text) {
  const source = String(text ?? "");
  const match = source.match(SHARE_STATS_PATTERN);
  if (!match) return { description: source.trim(), stats: parseShareStats(source), isShareText: false };
  const cut = source.slice(0, match.index).replace(/[\s,，、]+$/, "").trim();
  return { description: cut, stats: parseShareStats(source), isShareText: true };
}

/* ---------- 运行控制：暂停 / 继续 / 取消 ---------- */

let importRun = { active: false, paused: false, cancelled: false, waiters: [] };
let importState = { running: false, paused: false, text: "", startedAt: 0, finishedAt: 0, summary: "" };
let upFansCache = new Map();
let importStatePublishAt = 0;

function importThrowIfCancelled() {
  if (!importRun.cancelled) return;
  const error = new Error("导入已取消。");
  error.name = "ImportCancelled";
  throw error;
}

// 暂停时挂起；继续或取消都会唤醒
async function importWaitIfPaused() {
  importThrowIfCancelled();
  while (importRun.paused && !importRun.cancelled) {
    await new Promise((resolve) => importRun.waiters.push(resolve));
  }
  importThrowIfCancelled();
}

function importReleaseWaiters() {
  const waiters = importRun.waiters;
  importRun.waiters = [];
  waiters.forEach((resolve) => resolve());
}

// 进度更新很密集，写 storage 要节流；关键状态变化用 force 立即落盘
function publishImportState(patch, force = false) {
  importState = { ...importState, ...patch };
  const now = Date.now();
  if (!force && now - importStatePublishAt < 500) return;
  importStatePublishAt = now;
  chrome.storage.local.set({ importState }).catch(() => {});
}

function importProgress(text) {
  publishImportState({ text });
  sendImportProgress(text);
}

/* ---------- 回滚日志：取消时把本次改动全部撤销 ---------- */

function createImportJournal() {
  return { createdCollections: [], createdRecords: [], modifiedFiles: [] };
}

async function rollbackImport(journal) {
  let removedRecords = 0;
  let restoredFiles = 0;
  let removedCollections = 0;
  // 先删本次新建的记录目录，再把被改写的文件还原，最后清掉本次新建的空收藏夹
  for (const entry of [...journal.createdRecords].reverse()) {
    try { await entry.collectionHandle.removeEntry(entry.name, { recursive: true }); removedRecords += 1; } catch (_) {}
  }
  for (const entry of [...journal.modifiedFiles].reverse()) {
    try { await writeFile(entry.directoryHandle, entry.name, entry.text); restoredFiles += 1; } catch (_) {}
  }
  for (const entry of [...journal.createdCollections].reverse()) {
    try {
      let empty = true;
      for await (const child of entry.handle.values()) { void child; empty = false; break; }
      if (!empty) continue;
      await entry.parentHandle.removeEntry(entry.name, { recursive: true });
      removedCollections += 1;
    } catch (_) {}
  }
  return { removedRecords, restoredFiles, removedCollections };
}

/* ---------- 已有记录的读取与“是否需要刷新”判断 ---------- */

// 既返回去重用的标识符，也返回每条记录的原文，供“更新”模式判断哪些记录要按新格式重写
async function readExistingImportRecords(collection) {
  const identifiers = new Set();
  const records = new Map();
  for await (const entry of collection.values()) {
    if (entry.kind !== "directory") continue;
    let text = "";
    try {
      const file = await entry.getFileHandle("视频信息.txt");
      text = await (await file.getFile()).text();
    } catch (_) { continue; }
    const bvid = text.match(/^BV号：(.+)$/m)?.[1]?.trim();
    const aid = text.match(/^av号：(.+)$/m)?.[1]?.trim().replace(/^av/i, "");
    const keys = [];
    if (bvid && bvid !== "未知") {
      keys.push(`bvid:${bvid}`);
      const derived = importBvToAid(bvid);
      if (derived) keys.push(`aid:${derived}`);
    }
    if (aid && aid !== "未知") {
      keys.push(`aid:${aid}`);
      const derived = importAidToBv(aid);
      if (derived) keys.push(`bvid:${derived}`);
    }
    if (!keys.length) continue;
    const record = { directory: entry.name, text };
    for (const key of keys) {
      identifiers.add(key);
      if (!records.has(key)) records.set(key, record);
    }
  }
  return { identifiers, records };
}

// 缺新字段（粉丝数、互动数据）或标签/简介/发布时间还是占位值时，更新模式会重写它
function recordNeedsRefresh(record) {
  const text = String(record?.text || "");
  if (!text) return false;
  const tagsLine = text.match(/【标签】[^\n]*\n([^\n]*)/)?.[1]?.trim() || "";
  const description = (text.match(/【视频简介】[^\n]*\n([\s\S]*)$/)?.[1] || "").trim();
  const pubdate = text.match(/^视频发布时间：(.+)$/m)?.[1]?.trim() || "";
  return importIsPlaceholder(tagsLine)
    || importIsPlaceholder(description)
    || importIsPlaceholder(pubdate)
    || !/^UP主粉丝数：/m.test(text)
    || !/【互动数据】/.test(text);
}

function parseChineseDateTime(text) {
  const match = String(text).match(/(\d{4})年(\d{1,2})月(\d{1,2})日\s*(\d{1,2})时(\d{1,2})分(\d{1,2})秒/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6]));
}

// 用最新资料按新格式重写已有记录，保留原来的收藏时间与目录名；原文进回滚日志
async function refreshImportedRecord(collection, record, item, journal) {
  const directory = await collection.getDirectoryHandle(record.directory);
  const infoHandle = await directory.getFileHandle("视频信息.txt");
  const original = await (await infoHandle.getFile()).text();
  const favoriteAtText = original.match(/^视频收藏时间：(.+)$/m)?.[1]?.trim() || "";
  const favoriteTimeUnknown = importIsPlaceholder(favoriteAtText);
  const parsed = favoriteTimeUnknown ? null : parseChineseDateTime(favoriteAtText);
  const favoriteAt = parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date();
  const metadata = importMetadata(item, null);
  metadata.favoriteTimeUnknown = favoriteTimeUnknown;
  const text = buildInfo({ metadata, favoriteAt: favoriteAt.getTime() }, record.directory, new Date());
  if (text === original) return false;
  journal.modifiedFiles.push({ directoryHandle: directory, name: "视频信息.txt", text: original });
  await writeFile(directory, "视频信息.txt", text);
  return true;
}

/* ---------- 视频详情抓取 ---------- */

async function fetchUpFans(mid, tabId = null) {
  const key = String(mid || "").trim();
  if (!/^\d+$/.test(key)) return "";
  if (upFansCache.has(key)) return upFansCache.get(key);
  let fans = "";
  try {
    const data = await biliImportApiGet("/x/relation/stat", { vmid: key }, 9000, tabId);
    if (data && Number.isFinite(Number(data.follower))) fans = String(Number(data.follower));
  } catch (_) { fans = ""; }
  upFansCache.set(key, fans);
  return fans;
}

// 一条视频的完整资料：简介、发布时间、分区、时长、UP 主、互动数据、标签、粉丝数
async function fetchVideoDetail(item, tabId = null) {
  const detail = { stats: {}, errors: [] };
  const query = item.bvid ? { bvid: item.bvid } : (item.aid ? { aid: String(item.aid).replace(/^av/i, "") } : null);
  if (query) {
    try {
      const data = await biliImportApiGet("/x/web-interface/view", query, 12000, tabId);
      if (data) {
        if (data.bvid) detail.bvid = String(data.bvid);
        if (data.aid) detail.aid = String(data.aid);
        if (data.title) detail.title = importClean(data.title);
        if (data.desc) detail.description = String(data.desc).trim();
        if (Number(data.pubdate) > 0) detail.pubdate = Number(data.pubdate);
        if (Number(data.duration) > 0) detail.duration = Number(data.duration);
        if (data.tname) detail.category = importClean(data.tname);
        if (data.pic) detail.cover = normalizeUrl(data.pic);
        if (data.owner?.name) detail.upName = importClean(data.owner.name);
        if (data.owner?.mid) detail.upMid = String(data.owner.mid);
        const stat = data.stat || {};
        for (const key of IMPORT_STAT_KEYS) {
          if (stat[key] !== undefined && stat[key] !== null) detail.stats[key] = stat[key];
        }
      }
    } catch (error) {
      detail.errors.push(`视频资料接口：${error.message}`);
    }
  }
  if (detail.upMid) {
    const fans = await fetchUpFans(detail.upMid, tabId);
    if (fans) detail.upFans = fans;
  }
  const tagKey = detail.bvid || item.bvid;
  if (tagKey) {
    try {
      const tags = importTagNames(await biliImportApiGet("/x/tag/archive/tags", { bvid: tagKey }, 9000, tabId));
      if (tags.length) detail.tags = tags;
    } catch (error) {
      detail.errors.push(`标签接口：${error.message}`);
    }
  }
  return detail;
}

function applyVideoDetail(item, detail) {
  if (!detail) return;
  if (detail.bvid) item.bvid = detail.bvid;
  if (detail.aid) item.aid = detail.aid;
  if (detail.title && importUsefulTitle(detail.title)) item.title = detail.title;
  if (detail.cover) item.cover = detail.cover;
  if (detail.upName) item.author = detail.upName;
  if (detail.upMid) item.authorMid = detail.upMid;
  if (detail.upFans) item.upFans = detail.upFans;
  if (detail.category) item.category = detail.category;
  if (Number(detail.pubdate) > 0) item.pubdate = Number(detail.pubdate);
  if (Number(detail.duration) > 0) item.duration = Number(detail.duration);
  if (detail.description) item.description = detail.description;
  if (Array.isArray(detail.tags) && detail.tags.length) item.tags = detail.tags;
  if (detail.stats && Object.keys(detail.stats).length) item.stats = { ...(item.stats || {}), ...detail.stats };
  if (detail.errors?.length) item.enrichErrors = [...(item.enrichErrors || []), ...detail.errors];
}

async function fetchImportDetails(items, folder, tabId) {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(IMPORT_DETAIL_CONCURRENCY, items.length) }, async () => {
    while (cursor < items.length) {
      await importWaitIfPaused();
      const item = items[cursor];
      cursor += 1;
      importProgress(`正在读取「${folder.title}」的视频资料：${cursor}/${items.length}`);
      try {
        applyVideoDetail(item, await fetchVideoDetail(item, tabId));
      } catch (error) {
        if (error?.name === "ImportCancelled") throw error;
        item.enrichErrors = [...(item.enrichErrors || []), error.message];
      }
      await importDelay(IMPORT_DETAIL_DELAY_MS);
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
      if (bvid && bvid !== "未知") {
        identifiers.add(`bvid:${bvid}`);
        const derivedAid = importBvToAid(bvid);
        if (derivedAid) identifiers.add(`aid:${derivedAid}`);
      }
      if (aid && aid !== "未知") {
        identifiers.add(`aid:${aid}`);
        const derivedBvid = importAidToBv(aid);
        if (derivedBvid) identifiers.add(`bvid:${derivedBvid}`);
      }
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
    upFans: item.upFans || "",
    stats: item.stats || {},
    category: item.category || "未知",
    duration: Number(item.duration) || 0,
    pubdate: Number(item.pubdate) || 0,
    tags: item.tags.length ? item.tags : ["未知"],
    imported: true,
    invalid: item.isInvalid,
    recoverySummary: item.isInvalid
      ? (sources.length ? `已从${sources.join("、")}找回部分资料（${recoveredFields} 项）` : "未能找回资料，缺失项以“未知”标记")
      : (sources.length ? `收藏夹资料 + ${sources.join("、")}` : "收藏夹资料")
  };
}

function importIdentifierKeys(item) {
  const normalizedBvid = String(item.bvid || "").trim();
  const normalizedAid = String(item.aid || "").trim().replace(/^av/i, "");
  const aid = normalizedAid || (item.bvid ? importBvToAid(item.bvid) : "");
  return [
    normalizedBvid && normalizedBvid !== "未知" ? `bvid:${normalizedBvid}` : "",
    aid && aid !== "未知" ? `aid:${aid}` : ""
  ].filter(Boolean);
}

async function saveImportedItem(root, folder, item, journal = null) {
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
  // 先登记再写，取消时才能把这个目录一起清掉
  journal?.createdRecords.push({ collectionHandle: collection, name: record.name });
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

  importRun = { active: true, paused: false, cancelled: false, waiters: [] };
  upFansCache = new Map();
  const journal = createImportJournal();
  publishImportState({ running: true, paused: false, startedAt: Date.now(), finishedAt: 0, text: "正在准备导入…", summary: "" }, true);

  let imported = 0, refreshed = 0, skipped = 0, failed = 0, total = 0, hasIssues = false;
  let cancelled = false;
  const savedPaths = [];
  const folderNotes = [];

  try {
    const allFolders = await listBiliFavoriteFolders(data?.uid, tabId);
    const folders = allFolders.filter((folder) => selectedIds.has(String(folder.id)));
    if (!folders.length) throw new Error("所选收藏夹已不存在或没有读取权限，请刷新列表后重试。");

    for (let folderIndex = 0; folderIndex < folders.length; folderIndex += 1) {
      await importWaitIfPaused();
      const folder = folders[folderIndex];
      const folderLog = [];
      if (["错误报告", "001错误报告", "视频下载", "000视频下载"].includes(safeSegment(folder.title))) {
        failed += 1;
        hasIssues = true;
        reportLines.push("", `收藏夹：${folder.title}`, "收藏夹名称与插件保留目录冲突，已跳过。请先在 B 站重命名该收藏夹后重试。");
        continue;
      }

      importProgress(`正在读取「${folder.title}」（${folderIndex + 1}/${folders.length}）…`);
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
        await importWaitIfPaused();
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

      // 本地没有同名收藏夹 → 整体新建、全量导入；已有同名收藏夹 → 只补缺失的视频，
      // 并把数据不完整（缺粉丝数/互动数据、标签简介还是占位值）的旧记录按新格式刷新
      let collection;
      let collectionExisted = true;
      const collectionName = safeSegment(folder.title);
      try {
        collection = await root.getDirectoryHandle(collectionName);
      } catch (error) {
        if (error?.name !== "NotFoundError") throw error;
        collectionExisted = false;
        collection = await root.getDirectoryHandle(collectionName, { create: true });
        journal.createdCollections.push({ parentHandle: root, handle: collection, name: collectionName });
      }
      if (!collectionExisted) folderNotes.push(`「${folder.title}」本地没有同名收藏夹，本次按全量导入处理。`);

      const existing = await readExistingImportRecords(collection);
      const pendingItems = [];
      const refreshTargets = [];
      for (const item of allItems) {
        const keys = importIdentifierKeys(item);
        const matched = keys.find((key) => existing.identifiers.has(key));
        if (!matched) {
          keys.forEach((key) => existing.identifiers.add(key));
          pendingItems.push(item);
          continue;
        }
        skipped += 1;
        const record = existing.records.get(matched);
        if (record && recordNeedsRefresh(record)) refreshTargets.push({ item, record });
      }

      // 失效视频先走原有的恢复流程（APP 收藏夹 / 稍后再看 / 观看历史）
      try { await enrichImportedInvalidVideos(pendingItems, folder, tabId); }
      catch (error) {
        if (error?.name === "ImportCancelled") throw error;
        folderLog.push(`失效视频恢复流程异常：${error.message}`);
      }
      for (const item of pendingItems) {
        for (const message of item.recoveryErrors || []) {
          if (!folderLog.includes(message)) folderLog.push(message);
        }
      }

      // 4.2：每条视频都抓一次完整资料（标签 / 简介 / 发布时间 / 分区 / 互动数据 / UP 主粉丝数）
      const detailTargets = [...pendingItems, ...refreshTargets.map((entry) => entry.item)];
      if (detailTargets.length) await fetchImportDetails(detailTargets, folder, tabId);

      // 更新模式：按新格式重写数据不完整的旧记录（原文进回滚日志）
      for (const entry of refreshTargets) {
        await importWaitIfPaused();
        try {
          if (await refreshImportedRecord(collection, entry.record, entry.item, journal)) refreshed += 1;
        } catch (error) {
          if (error?.name === "ImportCancelled") throw error;
          failed += 1;
          folderLog.push(`${entry.item.title || entry.record.directory}：刷新失败：${error.message}`);
        }
      }

      for (let offset = 0; offset < pendingItems.length; offset += 12) {
        await importWaitIfPaused();
        const batch = pendingItems.slice(offset, offset + 12);
        importProgress(`正在准备「${folder.title}」的封面：${Math.min(offset + batch.length, pendingItems.length)}/${pendingItems.length}`);
        await importRunLimited(batch, 4, async (item) => {
          item.coverCandidates = [
            ...item.coverCandidates,
            ...(item.cover ? [{ url: item.cover, source: "收藏夹接口" }] : [])
          ];
          try { item.preparedCover = await loadImportCover(item.coverCandidates, item.isInvalid); }
          catch (error) { item.coverPreparationError = error; }
        });
        for (let index = 0; index < batch.length; index += 1) {
          await importWaitIfPaused();
          const item = batch[index];
          importProgress(`正在导入「${folder.title}」：${offset + index + 1}/${pendingItems.length}（已保存 ${imported} 个）`);
          try {
            const result = await saveImportedItem(root, folder, item, journal);
            imported += 1;
            savedPaths.push(result.path);
          } catch (error) {
            if (error?.name === "ImportCancelled") throw error;
            failed += 1;
            folderLog.push(`${item.title || "未知"} (${item.bvid || item.aid || "无编号"})：${error.message}`);
          }
        }
      }

      for (const item of pendingItems) {
        for (const message of item.enrichErrors || []) {
          if (!folderLog.includes(message)) folderLog.push(message);
        }
      }
      if (folderLog.length) reportLines.push("", `收藏夹：${folder.title}`, ...folderLog.slice(0, 500));
      if (folderLog.length) hasIssues = true;
    }
  } catch (error) {
    if (error?.name === "ImportCancelled") {
      cancelled = true;
    } else {
      importRun.active = false;
      importRun.paused = false;
      publishImportState({ running: false, paused: false, finishedAt: Date.now() }, true);
      throw error;
    }
  }

  let rollback = { removedRecords: 0, restoredFiles: 0, removedCollections: 0 };
  if (cancelled) {
    publishImportState({ text: "正在取消并回滚本次导入…" });
    rollback = await rollbackImport(journal);
  }
  importRun.active = false;
  importRun.paused = false;

  const finishedAt = Date.now();
  if (cancelled) {
    const summary = `导入已取消：已回滚本次新建的 ${rollback.removedRecords} 个视频目录`
      + `${rollback.removedCollections ? `、${rollback.removedCollections} 个新建收藏夹` : ""}`
      + `${rollback.restoredFiles ? `，并还原了 ${rollback.restoredFiles} 个被更新的视频信息.txt` : ""}。导入前的本地内容没有被改动。`;
    publishImportState({ running: false, paused: false, finishedAt, text: summary, summary }, true);
    await chrome.storage.local.set({ lastResult: { message: summary, createdAt: finishedAt } });
    return { ok: false, cancelled: true, message: summary, imported: 0, refreshed: 0, skipped, failed, total, reportPath: "" };
  }

  reportLines.push("", `完成时间：${formatChineseDateTime(new Date(), true)}`,
    `读取视频：${total}`, `新导入：${imported}`, `更新记录：${refreshed}`, `已存在跳过：${skipped}`, `失败：${failed}`);
  if (folderNotes.length) reportLines.push("", "备注：", ...folderNotes);
  let reportPath = "";
  if (failed || hasIssues || reportLines.some((line) => line.includes("失败"))) {
    reportPath = await persistErrorReport(reportLines.join("\n"));
    await chrome.storage.local.set({ lastError: { report: reportLines.join("\n").slice(0, 16000), reportPath, createdAt: Date.now() } });
  }
  const message = `导入/更新完成：新导入 ${imported} 个，更新 ${refreshed} 个，已存在跳过 ${skipped} 个，失败 ${failed} 个。`;
  const pathText = savedPaths.slice(0, 10).join("\n");
  await chrome.storage.local.set({ lastResult: { message, path: pathText, createdAt: Date.now() }, ...(failed || hasIssues ? {} : { lastError: null }) });
  publishImportState({ running: false, paused: false, finishedAt, text: message, summary: message }, true);
  return { ok: true, message, imported, refreshed, skipped, failed, total, reportPath };
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

const DOWNLOAD_WBI_MIXIN_ORDER = [46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52];
let downloadWbiKey = "";
let downloadWbiExpiresAt = 0;

function downloadMd5(text) {
  const bytes = new TextEncoder().encode(String(text));
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  new DataView(padded.buffer).setBigUint64(paddedLength - 8, BigInt(bytes.length) * 8n, true);
  const shifts = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
  const constants = Array.from({ length: 64 }, (_, index) => Math.floor(Math.abs(Math.sin(index + 1)) * 0x100000000) >>> 0);
  const rotate = (value, amount) => (value << amount) | (value >>> (32 - amount));
  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  for (let offset = 0; offset < paddedLength; offset += 64) {
    const words = new Uint32Array(16);
    const view = new DataView(padded.buffer, offset, 64);
    for (let index = 0; index < 16; index += 1) words[index] = view.getUint32(index * 4, true);
    let a = a0, b = b0, c = c0, d = d0;
    for (let index = 0; index < 64; index += 1) {
      let f, g, shift;
      if (index < 16) { f = (b & c) | (~b & d); g = index; shift = shifts[index % 4]; }
      else if (index < 32) { f = (d & b) | (~d & c); g = (5 * index + 1) % 16; shift = shifts[4 + (index % 4)]; }
      else if (index < 48) { f = b ^ c ^ d; g = (3 * index + 5) % 16; shift = shifts[8 + (index % 4)]; }
      else { f = c ^ (b | ~d); g = (7 * index) % 16; shift = shifts[12 + (index % 4)]; }
      const next = d;
      d = c;
      c = b;
      b = (b + rotate((a + f + constants[index] + words[g]) >>> 0, shift)) >>> 0;
      a = next;
    }
    a0 = (a0 + a) >>> 0; b0 = (b0 + b) >>> 0; c0 = (c0 + c) >>> 0; d0 = (d0 + d) >>> 0;
  }
  return [a0, b0, c0, d0].map((word) => [0, 8, 16, 24].map((shift) => ((word >>> shift) & 255).toString(16).padStart(2, "0")).join("")).join("");
}

async function getDownloadWbiKey() {
  if (downloadWbiKey && Date.now() < downloadWbiExpiresAt) return downloadWbiKey;
  const response = await fetch("https://api.bilibili.com/x/web-interface/nav", { credentials: "include", cache: "no-store" });
  const payload = await response.json();
  const images = payload?.data?.wbi_img;
  const img = images?.img_url?.split("/").pop()?.split(".")[0] || "";
  const sub = images?.sub_url?.split("/").pop()?.split(".")[0] || "";
  const raw = `${img}${sub}`;
  if (payload?.code !== 0 || raw.length < 64) throw new Error("无法读取 B 站视频解析密钥，请刷新页面后重试。");
  downloadWbiKey = DOWNLOAD_WBI_MIXIN_ORDER.map((index) => raw[index] || "").join("").slice(0, 32);
  downloadWbiExpiresAt = Date.now() + 10 * 60 * 1000;
  return downloadWbiKey;
}

async function biliDownloadApi(path, params, signed = false) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null && value !== "") query.set(key, String(value).replace(/[!'()*]/g, ""));
  }
  if (signed) {
    const mixinKey = await getDownloadWbiKey();
    const wts = Math.floor(Date.now() / 1000);
    query.set("wts", String(wts));
    const signatureText = [...query.entries()].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join("&") + mixinKey;
    query.set("w_rid", downloadMd5(signatureText));
  }
  const response = await fetch(`https://api.bilibili.com${path}?${query}`, { credentials: "include", cache: "no-store" });
  if (!response.ok) throw new Error(`B 站接口请求失败：HTTP ${response.status}`);
  const payload = await response.json();
  if (payload?.code !== 0) throw new Error(payload?.message || `B 站接口错误 ${payload?.code ?? "未知"}`);
  return payload.data;
}

async function getDownloadVideo(input) {
  const identifier = parseManualVideoIdentifier(input);
  let video;
  try {
    video = await biliDownloadApi("/x/web-interface/view", identifier);
  } catch (error) {
    try { video = await biliDownloadApi("/x/web-interface/view", identifier, true); }
    catch (_) { throw error; }
  }
  if (!video?.cid || !video?.title) throw new Error("B 站没有返回可下载的视频信息。");
  const pages = (Array.isArray(video.pages) && video.pages.length ? video.pages : [{ cid: video.cid, page: 1, part: video.title, duration: video.duration }])
    .map((page) => ({ cid: Number(page.cid), page: Number(page.page) || 1, part: page.part || `第 ${page.page || 1} P`, duration: Number(page.duration) || 0 }))
    .filter((page) => page.cid);
  return {
    bvid: video.bvid || identifier.bvid || "",
    aid: String(video.aid || identifier.aid || ""),
    cid: Number(video.cid),
    title: video.title,
    cover: normalizeUrl(video.pic),
    description: video.desc || "",
    owner: video.owner?.name || "未知",
    duration: Number(video.duration) || 0,
    pages
  };
}

async function getDownloadPlayurl(message) {
  const params = {
    ...(message.bvid ? { bvid: message.bvid } : { avid: String(message.aid || "").replace(/^av/i, "") }),
    cid: Number(message.cid), qn: Number(message.quality) || 0,
    fnval: message.format === "mp4" ? 1 : 16 | 2048,
    fnver: 0, fourk: 1, platform: "html5", high_quality: 1
  };
  return biliDownloadApi("/x/player/wbi/playurl", params, true);
}

async function getDownloadSubtitles(message) {
  const params = { bvid: message.bvid, cid: Number(message.cid) };
  try {
    return (await biliDownloadApi("/x/player/v2", params)).subtitle?.subtitles || [];
  } catch (_) {
    return (await biliDownloadApi("/x/player/v2", params, true)).subtitle?.subtitles || [];
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "bca-download-parse") {
    getDownloadVideo(message.identifier).then((video) => sendResponse({ ok: true, video })).catch((error) => sendResponse({ ok: false, message: error?.message || "视频解析失败。" }));
    return true;
  }
  if (message?.type === "bca-download-playurl") {
    getDownloadPlayurl(message).then((data) => sendResponse({ ok: true, data })).catch((error) => sendResponse({ ok: false, message: error?.message || "读取视频流失败。" }));
    return true;
  }
  if (message?.type === "bca-download-subtitles") {
    getDownloadSubtitles(message).then((subtitles) => sendResponse({ ok: true, subtitles })).catch((error) => sendResponse({ ok: false, message: error?.message || "读取字幕失败。" }));
    return true;
  }
  if (message?.type === "bca-import-control") {
    const action = String(message.action || "");
    if (!importRun.active) { sendResponse({ ok: false, message: "当前没有正在进行的导入。" }); return true; }
    if (action === "pause") {
      importRun.paused = true;
      publishImportState({ paused: true, text: "导入已暂停，可继续或取消。" }, true);
    } else if (action === "resume") {
      importRun.paused = false;
      publishImportState({ paused: false }, true);
      importReleaseWaiters();
    } else if (action === "cancel") {
      importRun.cancelled = true;
      importRun.paused = false;
      publishImportState({ paused: false, text: "正在取消并回滚本次导入…" }, true);
      importReleaseWaiters();
    } else {
      sendResponse({ ok: false, message: "不支持的操作。" });
      return true;
    }
    sendResponse({ ok: true, paused: importRun.paused, cancelled: importRun.cancelled });
    return true;
  }
  if (message?.type === "bca-import-state") {
    sendResponse({ ok: true, importState });
    return true;
  }
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
    chrome.storage.local.get(["baseFolderName", "lastResult", "lastError", "pendingFavorite", "authorizedErrorAt"]).then((status) => {
      sendResponse({ ...status, importState });
    });
    return true;
  }
});
