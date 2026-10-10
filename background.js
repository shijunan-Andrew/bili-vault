const DB_NAME = "bili-fav-archiver";
const DB_STORE = "settings";
let saveQueue = Promise.resolve();

// 4.9：background.js 是模块化 service worker，加载不了 i18n.js（红线第 5 条：不引远程代码，
// 也没有 web_accessible_resources），所以后台进程里本来没有 BcaI18n。这里做一次存在性兜底：
// 将来后台若真能拿到词典就自动生效，拿不到就原样返回中文（界面侧按原文显示，见 AI_HANDOFF
// 的「已知限制」）。占位符替换与 i18n.js 的 t() 完全一致，否则形如「请在约 {minutes} 分钟后重试」
// 的文案会把 {minutes} 原样显示给用户。新增的界面文案一律写成 BcaI18n.t("字面量")，
// key 必须是字面量，方便词条工具以后把 background.js 纳入扫描。
const BcaI18n = globalThis.BcaI18n || {
  t(text, params) {
    let out = String(text);
    if (params) {
      for (const name of Object.keys(params)) out = out.split(`{${name}}`).join(String(params[name]));
    }
    return out;
  }
};

/* ---------- 封面体积（4.6） ----------
   实测用户归档：137 张「封面.png」= 221.4 MB，均值 1.6 MB、最大 7 MB——根因是
   这里以前按"原图尺寸 + PNG"输出。10000 条视频光封面就要读十几 GB，归档和收藏库
   都会被拖垮。现在统一按 16:9 居中裁剪后缩到 320×180、输出 WebP（quality 0.8），
   单张约 15 KB。两条约定：
  1. 4.9 起文件名是「封面.webp」（老档案的 封面.png 原样保留、不迁移、不重下）；
        新导入的一律按新规则写；
     2. 函数名沿用 loadCoverPng（历史原因），它现在的输出是 WebP；三个调用点都只把
        结果写进「封面.png」，没有别的用途（addManualVideo / saveFavorite / loadImportCover）。 */
const COVER_FILE_NAME = "封面.webp";
// 4.9：读取与存在性检查要同时认旧名字。老档案里的封面是真 PNG，不迁移、不重下，
// 所以目录里可能只有 封面.png；两个都没有才算真的缺封面。
const COVER_FILE_NAMES = ["封面.png", COVER_FILE_NAME];
const COVER_WIDTH = 320;
const COVER_HEIGHT = 180;
const COVER_MIME_TYPE = "image/webp";
const COVER_QUALITY = 0.8;

// 4.5.1：工具栏图标的观感对齐网页/弹窗里的 logo——更大的圆角比例、
// 竖直渐变、大尺寸下加一圈白色高光。关闭自动归档时整体转灰（保持原有行为）。
async function updateActionIcon(enabled) {
  const imageData = {};
  for (const size of [16, 32, 48, 128]) {
    const canvas = new OffscreenCanvas(size, size);
    const context = canvas.getContext("2d");
    const inset = Math.max(1, size * 0.045);
    const box = size - inset * 2;
    const radius = box * 0.235;

    const gradient = context.createLinearGradient(0, inset, 0, inset + box);
    if (enabled) {
      gradient.addColorStop(0, "#38c1ea");
      gradient.addColorStop(0.52, "#00a1d6");
      gradient.addColorStop(1, "#0089b8");
    } else {
      gradient.addColorStop(0, "#aab1ba");
      gradient.addColorStop(1, "#8d949e");
    }

    context.beginPath();
    context.moveTo(inset + radius, inset);
    context.arcTo(inset + box, inset, inset + box, inset + radius, radius);
    context.arcTo(inset + box, inset + box, inset + radius, inset + box, radius);
    context.arcTo(inset, inset + box, inset, inset + radius, radius);
    context.arcTo(inset, inset, inset + radius, inset, radius);
    context.closePath();
    context.fillStyle = gradient;
    context.fill();

    // 16px 下加高光只会糊成一团，从 32px 起才画
    if (size >= 32) {
      context.strokeStyle = "rgba(255, 255, 255, 0.34)";
      context.lineWidth = Math.max(1, size * 0.03);
      context.stroke();
    }

    context.fillStyle = "#ffffff";   // 彩色底上的白字，不随主题变
    context.font = `800 ${Math.round(box * 0.66)}px "Segoe UI", system-ui, Arial, sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("B", size / 2, size / 2 + box * 0.035);

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

chrome.runtime.onInstalled.addListener(() => {
  initializeActionIcon().catch((error) => console.warn("更新扩展图标失败", error));
  // 4.9：安装 / 更新 / 重新加载扩展之后不可能还有导入在跑，
  // 本地残留的 importState.running=true 要立刻复位，别让界面锁死
  importReconcileState().catch((error) => console.warn("复位导入状态失败", error));
});
chrome.runtime.onStartup.addListener(() => {
  initializeActionIcon().catch((error) => console.warn("更新扩展图标失败", error));
  // 4.9：浏览器重新启动时 chrome.storage.session 已被清空，只剩 local 里的 running 残影，
  // 这里立刻复位并写明"上次导入已中断"
  importReconcileState().catch((error) => console.warn("复位导入状态失败", error));
});
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

// 按 CSS object-fit: cover 的语义取源图中心最大的 16:9 区域，避免拉伸变形
function coverSourceRect(width, height) {
  const targetRatio = COVER_WIDTH / COVER_HEIGHT;
  const sourceRatio = width / height;
  if (!Number.isFinite(sourceRatio) || sourceRatio <= 0) return { x: 0, y: 0, width, height };
  if (sourceRatio > targetRatio) {
    const cropWidth = Math.max(1, Math.round(height * targetRatio));
    return { x: Math.max(0, Math.round((width - cropWidth) / 2)), y: 0, width: cropWidth, height };
  }
  const cropHeight = Math.max(1, Math.round(width / targetRatio));
  return { x: 0, y: Math.max(0, Math.round((height - cropHeight) / 2)), width, height: cropHeight };
}

async function loadCoverPng(url) {
  const normalized = normalizeUrl(url);
  if (!normalized) throw new Error("网页没有提供封面地址。");
  const response = await fetch(normalized, { credentials: "omit", cache: "no-store" });
  if (!response.ok) throw new Error(`封面下载失败：HTTP ${response.status}`);
  const source = await response.blob();
  const bitmap = await createImageBitmap(source);
  try {
    const canvas = new OffscreenCanvas(COVER_WIDTH, COVER_HEIGHT);
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("无法创建封面转换画布。");
    const rect = coverSourceRect(bitmap.width, bitmap.height);
    context.drawImage(bitmap, rect.x, rect.y, rect.width, rect.height, 0, 0, COVER_WIDTH, COVER_HEIGHT);
    return await canvas.convertToBlob({ type: COVER_MIME_TYPE, quality: COVER_QUALITY });
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
    if (collectionNames.some((name) => safeSegment(name) !== name || ["错误报告", "001错误报告", "002同步报告", "000视频下载"].includes(name))) throw new Error("目标收藏夹名称无效，请重新选择收藏夹。");
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
          // 4.9：和导入链路一致——先写封面、后写 视频信息.txt，让 txt 成为"这条记录写完了"的完成标记
          await writeFile(record, COVER_FILE_NAME, cover);
          await writeFile(record, "视频信息.txt", info);
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

// 4.3：错误报告里会带本地目录路径、视频链接和堆栈，提醒用户不要外发
const ERROR_REPORT_NOTICE = "提示：本报告包含本地目录路径与视频链接，仅供自己排查使用，请勿公开分享。";

function reportText(error, context = {}) {
  const now = new Date();
  const metadata = context.metadata || {};
  return [
    "哔哩藏库错误报告",
    ERROR_REPORT_NOTICE,
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
    // 统一在落盘前补上提示行，避免各调用方漏写
    const body = String(text || "").includes(ERROR_REPORT_NOTICE) ? text : `${text}\n\n${ERROR_REPORT_NOTICE}\n`;
    await writeFile(directory, filename, body);
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
      try {
        // 4.9：先封面、后 txt（txt 即完成标记），失败时把整个目录清掉，不留半截记录
        const cover = await loadCoverPng(metadata.cover);
        await writeFile(recordFolder, COVER_FILE_NAME, cover);
        await writeFile(recordFolder, "视频信息.txt", info);
      } catch (error) {
        await collectionFolder.removeEntry(recordFolder.name, { recursive: true }).catch(() => {});
        throw error;
      }
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

/* ---------- 4.6：风控（限流）识别 ----------
   B 站在限流时返回 HTTP 412，或者带这些接口错误码。以前只有"更新视频状态"看 apiCode，
   导入链路完全不看：若 B 站开始限流，每条视频的详情/标签都失败，导入仍然会把
   "标签、简介、发布时间全是未知"的记录当成成功写下去（5000 条假成功）。
   这里统一打上 rateLimited 标记，让整条导入链能识别并熔断。 */
const IMPORT_RATE_LIMIT_CODES = new Set([-412, -352]);

function importRateLimitError(message, status) {
  const error = new Error(message);
  error.rateLimited = true;
  if (status !== undefined) error.httpStatus = status;
  return error;
}

function importIsRateLimitedError(error) {
  if (error?.rateLimited === true) return true;
  // 「页面代取」那条路只能把消息当字符串传回来，HTTP 412 会以 "HTTP 412" 的形式出现
  return /HTTP 412\b/.test(String(error?.message || ""));
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
  // 唯一的出网口 —— 所有 B 站请求都在这里排队限速，见 biliThrottleWait 的说明
  await biliThrottleWait();
  const url = new URL(path, "https://api.bilibili.com");
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, value);
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let status;
    let payload;
    if (Number.isInteger(tabId) && importPageProxyFailures < IMPORT_PAGE_PROXY_FAILURE_LIMIT) {
      try {
        ({ status, payload } = await biliImportPageApiGet(tabId, url.toString(), timeoutMs));
        importPageProxyFailures = 0;
      } catch (pageError) {
        importPageProxyFailures += 1;
        // 4.9.1：页面代取失败一律退回后台直连 —— 不要因为消息里有 "HTTP 412" 就断定风控。
        // B 站对「页面上下文」发出的请求本来就会返回 412（响应体不是 JSON，favorites-import.js
        // 会把它转成「B站接口没有返回有效数据（HTTP 412）。」），而退回后台直连通常是成功的。
        // 4.9 曾在这里直接抛风控、不再退回，把原本能成功的导入判成「连续命中风控」而中止整轮
        // —— 实测：同一账号同一时刻，旧版本导入 128 条全部成功，4.9 却在 4 秒内中止。
        // 风控判定只以「后台直连自己的响应」为准（见下面 response.status === 412 那处）。
        //
        // 回退本身也是一次真实请求，必须再领一张限速票 ——
        // 否则"一次调用两张票"会让实际速率翻倍，限速器就形同虚设。
        await biliThrottleWait();
        const response = await fetch(url.toString(), { credentials: "include", cache: "no-store", signal: controller.signal });
        status = response.status;
        try { payload = await response.json(); }
        catch (_) {
          if (response.status === 412) throw importRateLimitError("触发 B 站风控（HTTP 412），请稍后重试。", 412);
          throw new Error(`B站接口没有返回有效数据（HTTP ${response.status}）。`);
        }
      }
    } else {
      const response = await fetch(url.toString(), { credentials: "include", cache: "no-store", signal: controller.signal });
      status = response.status;
      try { payload = await response.json(); }
      catch (_) {
        if (response.status === 412) throw importRateLimitError("触发 B 站风控（HTTP 412），请稍后重试。", 412);
        throw new Error(`B站接口没有返回有效数据（HTTP ${response.status}）。`);
      }
    }
    if (status === 412) throw importRateLimitError("触发 B 站风控（HTTP 412），请稍后重试。", status);
    if (status < 200 || status >= 300) throw new Error(`B站接口请求失败：HTTP ${status}`);
    if (payload.code !== 0) {
      // 4.4：带上接口错误码，调用方才能区分“视频已失效”（明确错误码）
      // 与“网络不通”（应保持原样、不能误判成失效）
      const rateLimited = IMPORT_RATE_LIMIT_CODES.has(Number(payload.code));
      const apiError = new Error(rateLimited
        ? `触发 B 站风控（接口错误码 ${payload.code}），请稍后重试。`
        : (payload.message || `B站接口返回错误码 ${payload.code ?? "未知"}`));
      apiError.rateLimited = rateLimited;
      apiError.apiCode = payload.code;
      throw apiError;
    }
    return payload.data || {};
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("B站接口请求超时。");
    throw error;
  } finally {
    clearTimeout(timer);
    // 4.9：每次接口请求结束都顺手保活一次（内部按 20 秒节流）。
    // MV3 的 service worker 在约 30 秒没有扩展 API 调用时会被回收，
    // 而一次 biliImportApiGet 最坏情况要跑「页面代取 15 秒 + 后台直连 15 秒」。
    void keepServiceWorkerAlive("api");
  }
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

/* 收藏夹列表缓存。

   典型用法是"先看差异 → 再更新/导入"，两次读的是同一份列表：
   默认收藏夹 2804 条 → 每次 71 个请求。缓存 5 分钟能把这一对从 142 次降到 71 次，
   而列表内容在几分钟内基本不会变。

   只缓存**列表**，不缓存详情 —— 详情是真正耗时的部分（1.25 秒/条），
   而且详情本来就要求拿到最新数据。 */
const IMPORT_LIST_CACHE_TTL_MS = 5 * 60 * 1000;
let importListCache = new Map();

function importListCacheRead(folderId, page) {
  const entry = importListCache.get(String(folderId));
  if (!entry) return null;
  if (Date.now() - entry.at > IMPORT_LIST_CACHE_TTL_MS) {
    importListCache.delete(String(folderId));
    return null;
  }
  return entry.pages.get(page) || null;
}

function importListCacheWrite(folderId, page, value) {
  const key = String(folderId);
  const entry = importListCache.get(key);
  if (entry && Date.now() - entry.at <= IMPORT_LIST_CACHE_TTL_MS) {
    entry.pages.set(page, value);
    return;
  }
  importListCache.set(key, { at: Date.now(), pages: new Map([[page, value]]) });
}

/* 注意：导入**不需要**作废这个缓存。
   项目全程只有 GET，导入只写本地磁盘，改不了 B 站那边的收藏夹列表，
   所以"刚导入完的列表"和缓存里的仍然是同一份。之前真的写盘后清了一次，
   反而把后面几个收藏夹的缓存也一起清了，缓存等于白加。 */

async function fetchImportFavoritePage(folder, page, tabId = null) {
  const cached = importListCacheRead(folder.id, page);
  if (cached) return cached;
  const data = await biliImportApiGet("/x/v3/fav/resource/list", {
    media_id: folder.id, pn: page, ps: IMPORT_FAVORITE_PAGE_SIZE, keyword: "", order: "mtime", type: 0, tid: 0, platform: "web"
  }, 15000, tabId);
  const medias = Array.isArray(data.medias) ? data.medias : [];
  const result = {
    items: medias.map((media) => normalizeImportMedia(media, folder)),
    total: Number(data.info?.media_count || data.media_count || data.total || 0),
    hasMore: data.has_more === undefined ? (page * IMPORT_FAVORITE_PAGE_SIZE < Number(data.info?.media_count || data.media_count || data.total || 0)) : !!data.has_more
  };
  importListCacheWrite(folder.id, page, result);
  return result;
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

  const maxPasses = IMPORT_RECOVERY_MAX_PASSES;
  let recoveryRequests = 0;
  let budgetExhausted = false;
  for (let pass = 1; pass <= maxPasses; pass += 1) {
    let page = 1;
    let passFailed = false;
    for (; page <= 100; page += 1) {
      if (recoveryRequests >= IMPORT_RECOVERY_MAX_REQUESTS) {
        budgetExhausted = true;
        recoveryErrors.push(`APP收藏夹接口：已达到本次恢复的请求上限 ${IMPORT_RECOVERY_MAX_REQUESTS} 次，停止扫描；未找到的失效视频保持原样。`);
        break;
      }
      // 4.2：失效视频的跨页扫描也可能很久，这里也要能响应暂停/取消
      await importWaitIfPaused();
      let payload = null;
      let lastError = null;
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        recoveryRequests += 1;
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
    if (!missing.length || budgetExhausted) break;
    if (passFailed) recoveryErrors.push(`APP收藏夹接口：第 ${pass} 轮扫描在第 ${page} 页中断，剩余 ${missing.length} 个失效视频将继续重试。`);
    if (pass < maxPasses) await importDelay(1200);
  }
  return [...recordsByKey.values()];
}

async function fetchImportHistory(wantedBvids, recoveryErrors = [], tabId = null) {
  const wanted = new Set(wantedBvids.filter(Boolean));
  const found = new Map();
  let cursor = { max: 0, view_at: 0, business: "" };
  for (let page = 0; page < IMPORT_HISTORY_MAX_REQUESTS && wanted.size; page += 1) {
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
    } catch (error) {
      if (importIsRateLimitedError(error)) item.rateLimited = true;
      recoveryErrors.push(`${item.title || item.bvid}：视频资料接口：${error.message}`);
    }
    try {
      if (!item.tags.length) {
        const tagData = await biliImportApiGet("/x/tag/archive/tags", { bvid: item.bvid }, 9000, tabId);
        if (Array.isArray(tagData)) item.tags = tagData.map((tag) => importClean(tag.tag_name)).filter(Boolean);
        if (item.tags.length) item.recoverySources.add("视频标签接口");
      }
    } catch (error) {
      if (importIsRateLimitedError(error)) item.rateLimited = true;
      recoveryErrors.push(`${item.title || item.bvid}：标签接口：${error.message}`);
    }
    // 4.9：这段恢复流程是并发 3 的，计数只能算近似值，但足以在真正被限流时熔断
    importRateLimitStreak = item.rateLimited ? importRateLimitStreak + 1 : 0;
    importCheckRateLimitAbort();
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
      // 取消与风控中止必须穿透出去；其余错误按"这一条失败"处理
      try { await worker(current); } catch (error) { importRethrowIfAbort(error); }
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
// 4.3 安全加固：把导入的请求密度降到保守档。
// 之前是并发 2、间隔 350ms（约 5.7 请求/秒），对 B 站接口偏激进，也更容易触发风控。
// 现在并发 1、间隔 800ms（约 1.2 请求/秒）。嫌慢可以调这两个值，但不要调回 350ms。
const IMPORT_DETAIL_CONCURRENCY = 1;
const IMPORT_DETAIL_DELAY_MS = 800;

// 收藏夹资源接口固定 40 条/页（见 fetchImportFavoritePage 的 ps 参数）
const IMPORT_FAVORITE_PAGE_SIZE = 40;
// 4.9：分页硬上限的来历——接口拿不到 total 时只能靠 has_more 兜底，
// 万一 has_more 一直是 true 就会无限翻页，所以给一个上限：1000 页 × 40 条 = 40000 条。
// 它不再是"静默截断"：翻页结束后会和接口自报的 total 对账，少掉的部分写进报告并计入失败。
const IMPORT_MAX_PAGES = 1000;
// 4.9：单页失败不再放弃剩余所有页（以前第 2 页起任一页失败就 break 整轮），
// 只有连续这么多页都失败才终止读取该收藏夹
const IMPORT_MAX_CONSECUTIVE_PAGE_FAILURES = 3;
// 4.9：风控熔断。B 站限流返回 HTTP 412 / 接口错误码 -412 / -352。
// 若每条视频的详情与标签请求都失败，旧逻辑仍会把"标签、简介、发布时间全是未知"的记录
// 当成导入成功写下去——5000 条假成功比直接失败更糟。连续这么多条命中就中止整轮导入。
const IMPORT_RATE_LIMIT_ABORT_THRESHOLD = 5;
const IMPORT_RATE_LIMIT_COOLDOWN_MINUTES = 30;

function importRateLimitAbortError() {
  const error = new Error(BcaI18n.t("触发 B 站风控，已停止导入。请在约 {minutes} 分钟后重试；已写入本地的记录是完整的，重新导入会跳过它们。", { minutes: IMPORT_RATE_LIMIT_COOLDOWN_MINUTES }));
  error.name = "ImportRateLimited";
  error.rateLimitStreak = importRateLimitStreak;
  return error;
}

// 连续限流达到阈值就中止；调用点覆盖详情抓取、分页读取与逐条保存
function importCheckRateLimitAbort() {
  if (importRateLimitStreak < IMPORT_RATE_LIMIT_ABORT_THRESHOLD) return;
  throw importRateLimitAbortError();
}

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

/* ---------- 更新易变字段（4.4） ----------
   与 archive-core.js 的 patchVolatileFields 等价：service worker 无法 require 经典脚本，
   所以这里保留一份实现，测试会逐个输入比对两边输出必须一致。
   只覆盖 UP主粉丝数、互动数据、缺失的发布时间与失效标记，其余内容逐字不动。 */

const SECTION_HEADING_PATTERN = /^【.+?】\s*$/;

function statsSectionLines(stats) {
  return ["【互动数据】", ...IMPORT_STAT_KEYS.map((key) => `${IMPORT_STAT_LABELS[key]}：${importIsPlaceholder(stats?.[key]) ? "未知" : String(stats[key])}`)];
}

function patchVolatileFields(text, options = {}) {
  const source = String(text ?? "");
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const lines = source.split(/\r?\n/);

  const fieldIndex = (key) => lines.findIndex((line) => line.startsWith(`${key}：`));
  const setField = (key, value) => {
    const index = fieldIndex(key);
    if (index < 0) return false;
    lines[index] = `${key}：${value}`;
    return true;
  };

  if (!importIsPlaceholder(options.upFans)) {
    // 老档案没有「UP主粉丝数」这一行，要补在 UID 后面
    if (!setField("UP主粉丝数", String(options.upFans))) {
      const anchor = fieldIndex("UP主UID") >= 0 ? fieldIndex("UP主UID") : fieldIndex("UP主昵称");
      if (anchor >= 0) lines.splice(anchor + 1, 0, `UP主粉丝数：${options.upFans}`);
    }
  }

  // 发布时间只补空缺
  if (options.pubdateText) {
    const current = (lines[fieldIndex("视频发布时间")] || "").replace(/^视频发布时间：/, "");
    if (importIsPlaceholder(current)) setField("视频发布时间", String(options.pubdateText));
  }

  if (options.stats && Object.keys(options.stats).length) {
    const block = statsSectionLines(options.stats);
    const headingIndex = lines.findIndex((line) => line.trim() === "【互动数据】");
    if (headingIndex >= 0) {
      let end = headingIndex + 1;
      while (end < lines.length && !SECTION_HEADING_PATTERN.test(lines[end].trim())) end += 1;
      lines.splice(headingIndex, end - headingIndex, ...block, "");
    } else {
      const tagIndex = lines.findIndex((line) => line.trim() === "【标签】");
      lines.splice(tagIndex >= 0 ? tagIndex : lines.length, 0, ...block, "");
    }
  }

  if (options.videoStatus) {
    if (!setField("视频状态", String(options.videoStatus))) {
      const linkIndex = fieldIndex("视频链接");
      if (linkIndex >= 0) lines.splice(linkIndex + 1, 0, `视频状态：${options.videoStatus}`);
    }
  }

  return lines.join(newline);
}

/* ---------- 4.4：更新视频状态 ---------- */

const STATUS_INVALID_MARKER = "已失效视频（更新状态时检测到）";

function sendStatusProgress(text) {
  chrome.runtime.sendMessage({ type: "bca-status-progress", text }, () => { void chrome.runtime.lastError; });
}

// 重新解析一条归档：刷新易变数值；如果视频已失效，则不改动原数据，只写入失效标记
async function refreshOneArchiveStatus(root, target, tabId) {
  const collection = await root.getDirectoryHandle(safeSegment(target.collection));
  const directory = await collection.getDirectoryHandle(String(target.directory || ""));
  const fileHandle = await directory.getFileHandle("视频信息.txt");
  const text = await (await fileHandle.getFile()).text();

  const bvid = text.match(/^BV号：(.+)$/m)?.[1]?.trim() || "";
  const aid = text.match(/^av号：(.+)$/m)?.[1]?.trim().replace(/^av/i, "") || "";
  if (!/^BV[0-9A-Za-z]{10}$/.test(bvid) && !/^\d+$/.test(aid)) throw new Error("这条归档没有可用的 BV/av 号。");

  let view = null;
  let invalid = false;
  try {
    view = await biliImportApiGet("/x/web-interface/view", bvid ? { bvid } : { aid }, 12000, tabId);
  } catch (error) {
    // 4.9：风控错误码（-412 / -352）也带 apiCode，但它说明"被限流"而不是"视频失效"，
    // 必须先排掉，否则一次限流会把整批还能看的视频错标成「已失效视频」。
    if (importIsRateLimitedError(error)) throw error;
    // 接口明确返回错误码（如 -404 / 62002）说明视频已失效；
    // 网络或超时错误则保持原样，不误判成失效。
    if (typeof error?.apiCode === "number") invalid = true;
    else throw error;
  }

  if (invalid) {
    // 已经标记过失效的就不再改写：导入时写的「已失效视频（已尝试恢复）」比
    // 「更新状态时检测到」更具体，重复改写只会丢信息、还多做一次无谓的写入
    if (/^视频状态：.*失效/m.test(text)) return "unchanged";
    const patched = patchVolatileFields(text, { videoStatus: STATUS_INVALID_MARKER });
    if (patched === text) return "unchanged";
    await writeFile(directory, "视频信息.txt", patched);
    return "invalid";
  }

  const stats = {};
  const stat = view?.stat || {};
  for (const key of IMPORT_STAT_KEYS) {
    if (stat[key] !== undefined && stat[key] !== null) stats[key] = stat[key];
  }
  const mid = String(view?.owner?.mid || "");
  const upFans = mid ? await fetchUpFans(mid, tabId) : "";

  // 之前被本功能标记过失效、现在又能正常访问的，把标记清掉
  const currentStatus = (text.match(/^视频状态：(.+)$/m)?.[1] || "").trim();
  const patched = patchVolatileFields(text, {
    upFans,
    stats,
    pubdateText: Number(view?.pubdate) > 0 ? formatPublishDate(view.pubdate) : "",
    videoStatus: currentStatus === STATUS_INVALID_MARKER ? "正常" : undefined
  });
  if (patched === text) return "unchanged";
  await writeFile(directory, "视频信息.txt", patched);
  return "updated";
}

async function refreshVideoStatus(data, tabId = null) {
  const root = await getRootHandle();
  if (!root) throw new Error("尚未设置本地保存文件夹，请先在插件中选择保存目录。");
  await ensureWritePermission(root);
  const targets = (Array.isArray(data?.targets) ? data.targets : []).filter((target) => target?.collection && target?.directory);
  if (!targets.length) throw new Error("没有需要更新的记录。");
  const limit = Math.max(1, Math.min(Number(data?.limit) || 20, 80));
  const queue = targets.slice(0, limit);
  upFansCache = new Map();
  const failures = [];
  let updated = 0, markedInvalid = 0, unchanged = 0, failed = 0, cursor = 0;
  const runners = Array.from({ length: Math.min(IMPORT_DETAIL_CONCURRENCY, queue.length) }, async () => {
    while (cursor < queue.length) {
      const index = cursor;
      const target = queue[cursor];
      cursor += 1;
      sendStatusProgress(`正在更新视频状态 ${index + 1}/${queue.length}：${target.directory}`);
      try {
        const result = await refreshOneArchiveStatus(root, target, tabId);
        if (result === "updated") updated += 1;
        else if (result === "invalid") markedInvalid += 1;
        else unchanged += 1;
      } catch (error) {
        failed += 1;
        failures.push(`${target.collection}/${target.directory}：${error?.message || "更新失败"}`);
      }
      await importDelay(IMPORT_DETAIL_DELAY_MS);
    }
  });
  await Promise.all(runners);

  let reportPath = "";
  if (failures.length) {
    reportPath = await persistErrorReport([
      "B站收藏归档状态更新报告",
      `时间：${formatChineseDateTime(new Date(), true)}`,
      `处理 ${queue.length} 条：更新 ${updated}，新标记失效 ${markedInvalid}，无变化 ${unchanged}，失败 ${failed}`,
      "",
      ...failures.slice(0, 200)
    ].join("\n"));
  }
  return {
    ok: true,
    processed: queue.length,
    updated,
    markedInvalid,
    unchanged,
    failed,
    remaining: Math.max(0, targets.length - queue.length),
    reportPath,
    message: `本次处理 ${queue.length} 条：更新 ${updated} 条，新标记失效 ${markedInvalid} 条，无变化 ${unchanged} 条，失败 ${failed} 条。`
  };
}

/* ---------- 运行控制：暂停 / 继续 / 取消 ---------- */

let importRun = { active: false, paused: false, cancelled: false, waiters: [] };
let importState = { running: false, paused: false, text: "", startedAt: 0, finishedAt: 0, summary: "" };
let upFansCache = new Map();
let importStatePublishAt = 0;

/* ==========================================================================
   4.6：保活 / 断点 / 恢复
   --------------------------------------------------------------------------
   MV3 的 service worker 在"没有任何扩展 API 调用或事件"约 30 秒后就会被回收。
   导入是长任务（10000 条约 2.5~3 小时），中间有大量 await，暂停时更是完全静默：
   一旦被回收，importRun 与整条 Promise 链一起消失，暂停中的等待者永远不会被唤醒，
   而 chrome.storage.local 里的 importState.running 还留着 true —— 界面据此认为
   "导入还在进行"，用户既不能继续也不能取消。所以这里做三件事：
     1. keepServiceWorkerAlive()：显式保活（以前只有 publishImportState 写 storage
        的副作用，暂停态与超长 await 段都失去保护）；
     2. publishImportRun()：把 importRun 的关键字段（active/paused/cancelled/进度游标/
        已处理数）与回滚日志写进 chrome.storage.session，服务重启后能重建"上次跑到哪"；
     3. importReconcileState() / importRecoverInterruptedImport()：发现"storage 说在跑、
        后台其实没有活动导入"时强制复位并落盘，同时明确告诉用户发生了什么。
   ========================================================================== */

const IMPORT_RUN_SESSION_KEY = "bcaImportRun";                  // 正在进行的导入（断点 + 回滚日志）
const IMPORT_INTERRUPTED_SESSION_KEY = "bcaInterruptedImport";  // 被回收打断、仍可回滚的那一次
// 必须明显小于 30 秒的回收阈值，留出一次请求的最长耗时（15 秒）的余量
const IMPORT_KEEPALIVE_INTERVAL_MS = 20000;
const IMPORT_RUN_PUBLISH_INTERVAL_MS = 5000;                    // 断点落盘节流
// local 里的 importState 超过这么久没更新，才认定它是"被回收前的残影"。
// 正常跑着的时候每 500ms 就会刷一次 updatedAt，所以 90 秒足够区分
// "刚刚正常结束还没落盘" 与 "进程早就没了"。
const IMPORT_STALE_STATE_MS = 90000;
// chrome.storage.session 默认配额 10MB。被改写的 视频信息.txt 原文只保留这么多字节，
// 超出后只记名字：回滚时这类文件无法还原内容，会在结果里如实报出来。
const IMPORT_JOURNAL_TEXT_BUDGET_BYTES = 2 * 1024 * 1024;

// 连续命中风控的条目数（连续 N 条都撞限流就中止整轮导入，阈值常量见导入区块）
let importRateLimitStreak = 0;
let importKeepAliveAt = 0;
let importRunPublishAt = 0;
let importRunPublishChain = Promise.resolve();
let importRunSnapshot = null;

// 调一次真实的扩展 API。MV3 只在"扩展 API 调用 / 事件"时才重置空闲回收计时器，
// 纯 Promise、await、setTimeout 都不算——这是保活的唯一手段。
async function keepServiceWorkerAlive(reason = "import") {
  const now = Date.now();
  if (now - importKeepAliveAt < IMPORT_KEEPALIVE_INTERVAL_MS) return;
  importKeepAliveAt = now;
  try {
    await chrome.runtime.getPlatformInfo();
  } catch (error) {
    // 进程正在被回收时任何 API 都可能失败，这里不能抛——等待循环还要靠它继续
    console.warn("导入保活调用失败（后台可能正被回收）", reason, error);
  }
}

function importThrowIfCancelled() {
  if (!importRun.cancelled) return;
  const error = new Error("导入已取消。");
  error.name = "ImportCancelled";
  throw error;
}

// 取消与风控中止都要穿透到最外层，不能被当成"单条失败"吞掉
function importRethrowIfAbort(error) {
  if (error?.name === "ImportCancelled" || error?.name === "ImportRateLimited") throw error;
}

// 暂停时挂起；继续或取消都会唤醒。
// 4.9：每轮先保活、再最多等 20 秒——这样暂停期间也一直有扩展 API 调用，
// service worker 不会被回收（以前这里只 await 一个 Promise，暂停超过 30 秒就被回收）。
async function importWaitIfPaused() {
  importThrowIfCancelled();
  while (importRun.paused && !importRun.cancelled) {
    await keepServiceWorkerAlive("paused");
    await new Promise((resolve) => {
      // 没人唤醒时最多等 20 秒就回到循环顶部再保活一次；超时后要把自己从
      // waiters 里摘掉，否则长时间暂停会一直往里堆已经失效的等待者
      const wake = () => { clearTimeout(timer); resolve(); };
      const timer = setTimeout(() => {
        const index = importRun.waiters.indexOf(wake);
        if (index >= 0) importRun.waiters.splice(index, 1);
        resolve();
      }, IMPORT_KEEPALIVE_INTERVAL_MS);
      importRun.waiters.push(wake);
    });
  }
  importThrowIfCancelled();
}

function importReleaseWaiters() {
  const waiters = importRun.waiters;
  importRun.waiters = [];
  waiters.forEach((resolve) => resolve());
}

/* ---------- 断点与回滚日志的跨进程持久化 ---------- */

// 只保留能序列化的部分：FileSystemDirectoryHandle 不能进 storage，
// 所以回滚日志里只存收藏夹名 / 目录名 / 文件名（handle.name 是稳定的），
// 回滚时按名字重新取句柄。
function importJournalSnapshot(journal) {
  let textBudget = IMPORT_JOURNAL_TEXT_BUDGET_BYTES;
  return {
    createdCollections: [...(journal?.createdCollections || [])].map((entry) => entry.name),
    createdRecords: [...(journal?.createdRecords || [])].map((entry) => ({
      collection: entry.collectionHandle?.name || "",
      name: entry.name
    })),
    addedFiles: [...(journal?.addedFiles || [])].map((entry) => ({
      collection: entry.collectionHandle?.name || "",
      directory: entry.directoryHandle?.name || "",
      name: entry.name
    })),
    modifiedFiles: [...(journal?.modifiedFiles || [])].map((entry) => {
      const text = String(entry.text ?? "");
      const keepText = text.length <= textBudget;
      if (keepText) textBudget -= text.length;
      return {
        collection: entry.collectionHandle?.name || "",
        directory: entry.directoryHandle?.name || "",
        name: entry.name,
        text: keepText ? text : "",
        textUnavailable: !keepText
      };
    })
  };
}

function writeImportRunSnapshot() {
  const snapshot = importRunSnapshot;
  if (!snapshot) return Promise.resolve();
  // 串行化写入，避免慢写覆盖快写
  importRunPublishChain = importRunPublishChain
    .then(() => chrome.storage.session.set({ [IMPORT_RUN_SESSION_KEY]: snapshot }))
    .catch(() => {});
  return importRunPublishChain;
}

function resetImportRunSnapshot(journal) {
  importRunSnapshot = {
    active: true, paused: false, cancelled: false,
    startedAt: importState.startedAt || Date.now(), updatedAt: Date.now(),
    rateLimitStreak: 0, text: importState.text || "",
    cursor: { folder: "", page: 0, saved: 0, folderTotal: 0 },
    counts: { imported: 0, refreshed: 0, skipped: 0, failed: 0, total: 0 },
    journal: importJournalSnapshot(journal)
  };
  importRunPublishAt = 0;
  return writeImportRunSnapshot();
}

// journal / cursor / counts 都是 importBiliFavorites 里的局部量，这里显式传入，
// 避免再维护一份影子状态；不传的字段沿用上一次的快照（暂停、取消时只改 active/paused）。
function publishImportRun({ journal = null, cursor = null, counts = null, force = false } = {}) {
  if (!importRunSnapshot) return;
  const now = Date.now();
  const throttled = !force && now - importRunPublishAt < IMPORT_RUN_PUBLISH_INTERVAL_MS;
  importRunSnapshot = {
    ...importRunSnapshot,
    active: importRun.active,
    paused: importRun.paused,
    cancelled: importRun.cancelled,
    updatedAt: now,
    rateLimitStreak: importRateLimitStreak,
    ...(importState.text ? { text: importState.text } : {}),
    // 节流窗口内不重新序列化回滚日志：那是 O(日志长度) 的操作，
    // 每保存一条视频做一遍会让 10000 条的导入退化成 O(n²)
    ...(throttled || !journal ? {} : { journal: importJournalSnapshot(journal) }),
    ...(cursor ? { cursor: { ...importRunSnapshot.cursor, ...cursor } } : {}),
    ...(counts ? { counts: { ...counts } } : {})
  };
  if (throttled) return;
  importRunPublishAt = now;
  void writeImportRunSnapshot();
}

async function readImportRunSnapshot() {
  try {
    const stored = await chrome.storage.session.get(IMPORT_RUN_SESSION_KEY);
    return stored?.[IMPORT_RUN_SESSION_KEY] || null;
  } catch (_) {
    return null;
  }
}

async function clearImportRunSnapshot() {
  importRunSnapshot = null;
  importRunPublishAt = 0;
  // 排进同一条写入链：否则排队中的快照可能在 remove 之后落地，留下"幽灵活动记录"
  importRunPublishChain = importRunPublishChain
    .then(() => chrome.storage.session.remove(IMPORT_RUN_SESSION_KEY))
    .catch(() => {});
  await importRunPublishChain;
}

// 被回收打断的那次要挪到独立键：新导入只写活动键，于是这份可回滚日志
// 不会被下一次导入覆盖，直到用户回滚或又一次被打断。
async function markImportRunInterrupted(snapshot) {
  try {
    await chrome.storage.session.set({
      [IMPORT_INTERRUPTED_SESSION_KEY]: { ...(snapshot || {}), active: false, interruptedAt: Date.now() }
    });
    await chrome.storage.session.remove(IMPORT_RUN_SESSION_KEY);
  } catch (_) {}
}

function importInterruptedSummary(snapshot) {
  const cursor = snapshot?.cursor || {};
  const counts = snapshot?.counts || {};
  const parts = [];
  if (cursor.folder) parts.push(`停在「${cursor.folder}」第 ${Number(cursor.page) || 1} 页`);
  if (Number(cursor.saved) > 0) parts.push(`该收藏夹已写入 ${Number(cursor.saved)} 条`);
  const created = snapshot?.journal?.createdRecords?.length || 0;
  if (created) parts.push(`本次共新建 ${created} 个视频目录（回滚日志已保存在本次浏览器会话中）`);
  if (Number(counts.imported) > 0) parts.push(`累计新导入 ${Number(counts.imported)} 条`);
  return parts.join("；");
}

// 统一的"中断说明"：复位状态 + 文案落盘（local.importState 与 lastResult 都写）
async function importAnnounceInterruption(snapshot) {
  const detail = importInterruptedSummary(snapshot);
  const notice = BcaI18n.t("上次导入已中断（浏览器被关闭、扩展被重载或后台被回收，导入没有继续）。已写入本地的记录保持原样，重新导入会跳过它们。");
  const text = detail ? `${notice}（${detail}）` : notice;
  // 最后一次导入活动时间：比它更新的结果（例如中断之后又自动归档了一条视频）不能被盖掉
  const activityAt = Number(snapshot?.updatedAt) || Number(snapshot?.startedAt) || 0;
  importState = { ...importState, running: false, paused: false, finishedAt: Date.now(), updatedAt: Date.now(), text, summary: text, interrupted: true };
  await chrome.storage.local.set({ importState }).catch(() => {});
  const stored = await chrome.storage.local.get("lastResult").catch(() => ({}));
  if ((Number(stored?.lastResult?.createdAt) || 0) <= activityAt) {
    await chrome.storage.local.set({ lastResult: { message: text, createdAt: Date.now() } }).catch(() => {});
  }
  return { text, detail, activityAt };
}

// "后台现在真的有导入在跑"只认内存里的 importRun.active。
// chrome.storage.local 里的 importState.running 可能是被回收前留下的残影：
// 这时必须强制复位并落盘，否则界面会一直以为导入还在进行。
// 判据有两条，避免把"刚刚正常结束"误判成中断：
//   1. session 里还有 active 的断点 → 铁证，导入进程死在半路；
//   2. 只有 local 的 running=true 时，看这份状态是不是已经很久没更新过
//      （浏览器重开后 chrome.storage.session 会被清空，只剩 local 里的残影）。
async function importReconcileState() {
  if (importRun.active) return { active: true, reset: false };
  const stored = await chrome.storage.local.get("importState").catch(() => ({}));
  const storedState = stored?.importState || null;
  const leftover = await readImportRunSnapshot();
  const orphan = leftover?.active === true;
  const staleRunning = storedState?.running === true
    && (!Number(storedState?.updatedAt) || Date.now() - Number(storedState.updatedAt) > IMPORT_STALE_STATE_MS);
  if (!orphan && !staleRunning) return { active: false, reset: false };
  await importAnnounceInterruption(leftover);
  await markImportRunInterrupted(leftover);
  return { active: false, reset: true };
}

// service worker 每次启动都会重新求值这个模块：此刻内存里的 importRun 一定是空的，
// 所以 session 里 active 的记录只可能来自"上一次被回收打断的导入"。
async function importRecoverInterruptedImport() {
  if (importRun.active) return false;
  const snapshot = await readImportRunSnapshot();
  if (!snapshot?.active) return false;
  if (importRun.active) return false;                 // 期间已经启动了新导入，别动它
  const current = await readImportRunSnapshot();      // 二次确认：快照没被新导入替换掉
  if (current?.startedAt !== snapshot.startedAt) return false;
  await markImportRunInterrupted(snapshot);
  const { text, detail } = await importAnnounceInterruption(snapshot);
  // 有断点才写报告文件：报告里能写清"停在哪个收藏夹第几页、已经写了多少"
  const report = [
    "B站收藏导入中断报告",
    ERROR_REPORT_NOTICE,
    `发生时间：${formatChineseDateTime(new Date(), true)}`,
    "中断原因：service worker 被回收（浏览器被关闭、扩展被重载或后台空闲回收），导入没有继续。",
    `断点：${detail || "未知"}`,
    "已写入的目录都包含封面与视频信息.txt，是完整记录；重新导入会按 BV/av 号跳过它们。",
    ""
  ].join("\n");
  const reportPath = await persistErrorReport(report);
  await chrome.storage.local.set({
    lastError: { report: report.slice(0, 16000), reportPath, createdAt: Date.now() }
  }).catch(() => {});
  return true;
}

// 进度更新很密集，写 storage 要节流；关键状态变化用 force 立即落盘
function publishImportState(patch, force = false) {
  importState = { ...importState, ...patch, updatedAt: Date.now() };
  const now = Date.now();
  if (!force && now - importStatePublishAt < 500) return;
  importStatePublishAt = now;
  // active 是"这一次是否真的有活动导入"的即时答案（由 get-status / bca-import-probe 填），
  // 只在内存和响应里有效，不落盘——落盘就会变成下一个需要探活复位的"残影"。
  const { active: _active, ...persisted } = importState;
  chrome.storage.local.set({ importState: persisted }).catch(() => {});
}

function importProgress(text) {
  publishImportState({ text });
  sendImportProgress(text);
}

/* ---------- 回滚日志：取消时把本次改动全部撤销 ----------
   4.6：日志同时会按"只有名字"的形式写进 chrome.storage.session（见 importJournalSnapshot），
   这样 service worker 被回收、浏览器被杀之后，仍能按名字重新取句柄回滚
   （句柄本身不能序列化，所以进不了 storage）。addedFiles 记录的是"这次新补的封面"：
   旧版本留下的半截目录被补上封面后，如果用户取消，这张封面也要跟着撤销。 */

function createImportJournal() {
  return { createdCollections: [], createdRecords: [], modifiedFiles: [], addedFiles: [] };
}

async function rollbackImport(journal) {
  let removedRecords = 0;
  let restoredFiles = 0;
  let removedCollections = 0;
  let removedFiles = 0;
  // 先删本次新建的记录目录，再把被改写的文件还原，最后清掉本次新建的空收藏夹
  for (const entry of [...journal.createdRecords].reverse()) {
    try { await entry.collectionHandle.removeEntry(entry.name, { recursive: true }); removedRecords += 1; } catch (_) {}
  }
  for (const entry of [...journal.modifiedFiles].reverse()) {
    try { await writeFile(entry.directoryHandle, entry.name, entry.text); restoredFiles += 1; } catch (_) {}
  }
  for (const entry of [...journal.addedFiles].reverse()) {
    try { await entry.directoryHandle.removeEntry(entry.name); removedFiles += 1; } catch (_) {}
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
  return { removedRecords, restoredFiles, removedCollections, removedFiles };
}

// 回滚"被回收打断的那一次导入"：句柄进不了 storage，所以按存下来的名字重新取。
async function rollbackInterruptedImport() {
  const stored = await chrome.storage.session.get(IMPORT_INTERRUPTED_SESSION_KEY).catch(() => null);
  const snapshot = stored?.[IMPORT_INTERRUPTED_SESSION_KEY];
  if (!snapshot?.journal) return { ok: false, message: BcaI18n.t("没有找到可回滚的上次中断记录。") };
  const root = await getRootHandle();
  if (!root) return { ok: false, message: BcaI18n.t("尚未设置本地保存文件夹，无法回滚。") };
  if (await root.queryPermission({ mode: "readwrite" }) !== "granted") {
    return { ok: false, message: BcaI18n.t("保存位置的写入授权已失效，请先在插件里重新授权保存位置，然后重试回滚。") };
  }
  const journal = { createdCollections: [], createdRecords: [], modifiedFiles: [], addedFiles: [] };
  for (const name of snapshot.journal.createdCollections || []) {
    try { journal.createdCollections.push({ parentHandle: root, handle: await root.getDirectoryHandle(name), name }); }
    catch (_) { /* 目录已经不在了：没什么可删的 */ }
  }
  for (const entry of snapshot.journal.createdRecords || []) {
    try { journal.createdRecords.push({ collectionHandle: await root.getDirectoryHandle(entry.collection), name: entry.name }); }
    catch (_) {}
  }
  for (const entry of snapshot.journal.addedFiles || []) {
    try {
      const collection = await root.getDirectoryHandle(entry.collection);
      journal.addedFiles.push({ directoryHandle: await collection.getDirectoryHandle(entry.directory), name: entry.name });
    } catch (_) {}
  }
  const unavailable = [];
  for (const entry of snapshot.journal.modifiedFiles || []) {
    if (entry.textUnavailable) { unavailable.push(`${entry.collection}/${entry.directory}`); continue; }
    try {
      const collection = await root.getDirectoryHandle(entry.collection);
      journal.modifiedFiles.push({
        directoryHandle: await collection.getDirectoryHandle(entry.directory), name: entry.name, text: String(entry.text ?? "")
      });
    } catch (_) {}
  }
  const result = await rollbackImport(journal);
  await chrome.storage.session.remove(IMPORT_INTERRUPTED_SESSION_KEY).catch(() => {});
  const message = `已回滚上次中断的导入：删除 ${result.removedRecords} 个新建的视频目录`
    + `${result.removedCollections ? `、${result.removedCollections} 个新建收藏夹` : ""}`
    + `${result.restoredFiles ? `，还原了 ${result.restoredFiles} 个被改写的视频信息.txt` : ""}`
    + `${result.removedFiles ? `，移除了 ${result.removedFiles} 张新补的封面` : ""}。`
    + `${unavailable.length ? `有 ${unavailable.length} 个文件的原文当时没能存下，未能还原。` : ""}`;
  return { ok: true, message, ...result, unavailable: unavailable.length };
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
    || !/【互动数据】/.test(text)
    // 4.9：目录里没有封面同样算"不完整"。coverMissing 由 importRecordNeedsRefresh()
    // 在本函数的文本判据都通过之后才去查一次盘并缓存在 record 上，正常记录不额外付 IO。
    // 背景：旧版本是"先写 视频信息.txt、后写 封面.png"，中途被杀就会留下只有 txt 的半截目录，
    // 以前它被判成"已存在、跳过"，这条视频就永远没有封面（收藏库还会把它当不完整记录隐藏）。
    || record?.coverMissing === true;
}

// 查一次"这条记录的目录里到底有没有封面"，结果缓存在 record 上（同一次导入只查一次）
async function recordMissingCover(collection, record) {
  if (!record) return false;
  if (typeof record.coverMissing === "boolean") return record.coverMissing;
  try {
    const directory = await collection.getDirectoryHandle(record.directory);
    // 两个名字都认：老档案只有 封面.png，4.9 之后写的是 封面.webp
    let found = false;
    for (const name of COVER_FILE_NAMES) {
      try { await directory.getFileHandle(name); found = true; break; } catch (_) {}
    }
    if (!found) throw new Error("缺少封面文件");
    record.coverMissing = false;
  } catch (_) {
    record.coverMissing = true;
  }
  return record.coverMissing;
}

async function importRecordNeedsRefresh(collection, record) {
  if (!record) return false;
  if (recordNeedsRefresh(record)) return true;   // 文本判据已经说要刷新，不必再查封面
  if (record.coverMissing === undefined) await recordMissingCover(collection, record);
  return recordNeedsRefresh(record);             // 复判：coverMissing 也是判据之一
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
  // 4.9：封面缺失也要补齐（library.js 把"没有封面"的记录当成不完整记录直接跳过，
  // 用户在收藏库里根本看不到它）。coverMissing 还没算过就在这里补算一次——
  // 只有"需要刷新"的记录会走这条路径，正常记录不受影响。
  if (record.coverMissing === undefined) await recordMissingCover(collection, record);
  let touched = false;
  if (record.coverMissing) {
    // 抓不到真封面时会写入"封面暂不可恢复"占位图——和导入链路保持一致：
    // library.js 把没有封面的记录当成不完整记录直接跳过，宁可先写占位图让记录可见。
    const cover = await loadImportCover([
      ...(item.coverCandidates || []),
      ...(item.cover ? [{ url: item.cover, source: "收藏夹接口" }] : [])
    ], item.isInvalid);
    // 先写封面、后写 txt：txt 始终是"这条记录写完了"的完成标记
    journal?.addedFiles.push({ collectionHandle: collection, directoryHandle: directory, name: COVER_FILE_NAME });
    await writeFile(directory, COVER_FILE_NAME, cover.blob);
    record.coverMissing = false;
    touched = true;
  }
  if (text !== original) {
    journal.modifiedFiles.push({ collectionHandle: collection, directoryHandle: directory, name: "视频信息.txt", text: original });
    await writeFile(directory, "视频信息.txt", text);
    touched = true;
  }
  return touched;
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
  // 已知失效的条目不再请求视频资料接口（必定返回“稿件不可见”），
  // 标签接口仍试一次：稿件不可见时标签有时还能取到。
  const knownInvalid = item.isInvalid === true;
  if (query && !knownInvalid) {
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
      // 4.9：限流要能被导入链路识别（见 importCheckRateLimitAbort / saveImportedItem）
      if (importIsRateLimitedError(error)) detail.rateLimited = true;
      // 失效视频的“稿件不可见/啥都木有”属于预期结果，不该当成导入错误写进报告
      if (!knownInvalid) detail.errors.push(`视频资料接口：${error.message}`);
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
      if (importIsRateLimitedError(error)) detail.rateLimited = true;
      if (!knownInvalid) detail.errors.push(`标签接口：${error.message}`);
    }
  }
  return detail;
}

function applyVideoDetail(item, detail) {
  if (!detail) return;
  if (detail.rateLimited) item.rateLimited = true;
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
        importRethrowIfAbort(error);
        item.enrichErrors = [...(item.enrichErrors || []), error.message];
      }
      // 4.9：连续多少条撞上风控。IMPORT_DETAIL_CONCURRENCY 固定为 1，
      // 所以这个计数就是"连续的条目数"；一旦到阈值立刻中止，不再白跑几小时。
      importRateLimitStreak = item.rateLimited ? importRateLimitStreak + 1 : 0;
      importCheckRateLimitAbort();
      await importDelay(IMPORT_DETAIL_DELAY_MS);
    }
  });
  await Promise.all(runners);
}


function importedUnknownCover() {
  // 与真实封面同一尺寸、同一格式（320×180 WebP），收藏库列表里不会大图小图混排
  const canvas = new OffscreenCanvas(COVER_WIDTH, COVER_HEIGHT);
  const context = canvas.getContext("2d");
  context.fillStyle = "#e8edf2";
  context.fillRect(0, 0, COVER_WIDTH, COVER_HEIGHT);
  context.fillStyle = "#00a1d6";
  context.beginPath();
  context.roundRect(125, 44, 70, 70, 13);
  context.fill();
  context.fillStyle = "#fff";
  context.font = "bold 52px sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("B", 160, 80);
  context.fillStyle = "#69727c";
  context.font = "16px sans-serif";
  context.fillText("封面暂不可恢复", 160, 138);
  return canvas.convertToBlob({ type: COVER_MIME_TYPE, quality: COVER_QUALITY });
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

/* 收藏时间统一成毫秒。
   B 站列表接口的 fav_time 是【秒】，而项目里其它来源可能是毫秒。
   本文件已有两处用 `> 1e12 ? x : x * 1000` 做这个判断（见 favoriteTimeMs 的调用方与 buildInfo 那一段），
   这里抽出来共用 —— V1.1.4 第一版的「最近 N 天」过滤忘了转换，
   拿 Date.now() 的毫秒去比 fav_time 的秒，条件永远为假，
   2720 条一条都没命中（真机报告："限定最近 3 天：2720 条中命中 0 条"）。 */
function favoriteTimeMs(value) {
  const raw = Number(value) || 0;
  if (!raw) return 0;
  return raw > 1e12 ? raw : raw * 1000;
}

/* 「最近 N 天」过滤。纯函数，方便真跑测试。
   recentDays 为 0 或负数时不过滤（等同全量）。
   读不到收藏时间的条目一律保留 —— 宁可多处理一条，也不要漏掉。 */
function importWithinRecentDays(items, recentDays, now = Date.now()) {
  const list = Array.isArray(items) ? items : [];
  const days = Math.max(0, Number(recentDays) || 0);
  if (!days) return list;
  const cutoff = now - days * 86400000;
  return list.filter((item) => {
    const at = favoriteTimeMs(item?.favoriteAt);
    return !at || at >= cutoff;
  });
}

/* 这一页是不是整页都早于时间窗起点（用于「最近 N 天」提前收工）。
   只看拿到收藏时间的条目；一条时间都读不到就返回 false，宁可多翻一页。 */
function importPageEntirelyBefore(items, cutoffMs) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length || !cutoffMs) return false;
  let seen = 0;
  for (const item of list) {
    const at = favoriteTimeMs(item?.favoriteAt);
    if (!at) return false;
    if (at >= cutoffMs) return false;
    seen += 1;
  }
  return seen > 0;
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
  // 4.9：命中风控的条目直接拒绝落盘。写文件这里是唯一入口，再挡一道，
  // 免得以后多出别的调用点，写出"标签/简介/发布时间全是未知"的残缺记录。
  if (item?.rateLimited) throw importRateLimitAbortError();
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
    // 4.9：先写封面、后写「视频信息.txt」——txt 就是"这条记录写完了"的完成标记。
    // 以前是反过来的，进程在两步之间被杀（浏览器被杀 / SW 回收）就会留下只有 txt、
    // 没有封面的半截目录，下次导入把它当成有效记录跳过，这条视频就永远没有封面。
    await writeFile(record, COVER_FILE_NAME, cover.blob);
    await writeFile(record, "视频信息.txt", buildInfo({ metadata, favoriteAt: favoriteAt.getTime() }, record.name, new Date()));
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
  const reportLines = ["B站收藏夹本地导入报告", ERROR_REPORT_NOTICE, `开始时间：${formatChineseDateTime(new Date(), true)}`];
  // 4.9.1：中止时要把"当前这一轮收藏夹"还没渲染的日志补进报告。
  // folderLog 原本只在每轮循环末尾渲染，而风控是在保存阶段抛出的、抛在渲染之前，
  // 用户于是只看到一个没有解释的「失败：N」。取消分支不写报告，所以只需在这里补。
  let activeFolderTitle = "";
  let activeFolderLog = [];
  const root = await getRootHandle();
  if (!root) throw new Error("尚未设置本地保存文件夹，请先在插件中选择保存目录。");
  await ensureWritePermission(root);
  if (!selectedIds.size) throw new Error("请至少勾选一个 B 站收藏夹。");

  importRun = { active: true, paused: false, cancelled: false, waiters: [] };
  upFansCache = new Map();
  // 4.4.1：失效视频恢复默认开启（它需要伪造成官方 APP 客户端请求 APP 接口，
  // 是合规上最勉强的一环，因此保留开关让用户能关掉；只有明确存成 false 才关闭）
  const settings = await chrome.storage.local.get("recoverInvalidVideos").catch(() => ({}));
  const recoverInvalidVideos = settings?.recoverInvalidVideos !== false;
  const journal = createImportJournal();
  importRateLimitStreak = 0;
  publishImportState({ running: true, paused: false, startedAt: Date.now(), finishedAt: 0, text: "正在准备导入…", summary: "", interrupted: false, rateLimited: false }, true);
  // 断点落盘：ImportRun 的关键字段（active/paused/cancelled/游标/计数）与回滚日志
  // 写进 chrome.storage.session，SW 被回收后还能知道"上次跑到哪、写了哪些目录"
  resetImportRunSnapshot(journal);

  let imported = 0, refreshed = 0, skipped = 0, failed = 0, total = 0, hasIssues = false;
  let cancelled = false;
  let rateLimited = null;
  const savedPaths = [];
  const folderNotes = [];
  const missingNotes = [];
  // 4.9.2：接口自报总数与实际返回数不一致时的说明。这不是失败（B 站的 media_count 会把
  // 接口不返回的条目也算进去），但必须让用户看到 —— 4.9.1 为了避免误报改成完全静默，
  // 结果用户看到「B 站 239、本地 230」时无从判断到底丢没丢，只能来问。
  const coverageNotes = [];

  try {
    const allFolders = await listBiliFavoriteFolders(data?.uid, tabId);
    const folders = allFolders.filter((folder) => selectedIds.has(String(folder.id)));
    if (!folders.length) throw new Error("所选收藏夹已不存在或没有读取权限，请刷新列表后重试。");

    for (let folderIndex = 0; folderIndex < folders.length; folderIndex += 1) {
      await importWaitIfPaused();
      const folder = folders[folderIndex];
      const folderLog = [];
    activeFolderTitle = folder.title;
    activeFolderLog = folderLog;
      if (["错误报告", "001错误报告", "002同步报告", "视频下载", "000视频下载"].includes(safeSegment(folder.title))) {
        failed += 1;
        hasIssues = true;
        reportLines.push("", `收藏夹：${folder.title}`, "收藏夹名称与插件保留目录冲突，已跳过。请先在 B 站重命名该收藏夹后重试。");
        continue;
      }
      publishImportRun({ journal, force: true, cursor: { folder: folder.title, page: 1, saved: 0, folderTotal: 0 }, counts: { imported, refreshed, skipped, failed, total } });

      importProgress(`正在读取「${folder.title}」（${folderIndex + 1}/${folders.length}）…`);
      // 第 1 页读不到就整轮跳过这个收藏夹，代价太大：一次偶发的 412 会让用户以为功能坏了
      // （真机上就发生过 —— 错误报告只有一行"读取第 1 页失败"，用户完全无从判断是风控还是 bug）。
      // 这里退避重试：读超时、连接抖动这类瞬时问题能救回来。
      // 真正的风控需要更长时间才能恢复，重试救不了，但至少报告里会写明"已重试 3 次"，
      // 用户能区分"偶发失败"和"被限流了"。
      let first = null;
      let firstError = null;
      for (let attempt = 1; attempt <= IMPORT_FIRST_PAGE_ATTEMPTS; attempt += 1) {
        try {
          first = await fetchImportFavoritePage(folder, 1, tabId);
          firstError = null;
          break;
        } catch (error) {
          importRethrowIfAbort(error);
          firstError = error;
          if (attempt < IMPORT_FIRST_PAGE_ATTEMPTS) {
            importProgress(`「${folder.title}」第 1 页读取失败，第 ${attempt + 1}/${IMPORT_FIRST_PAGE_ATTEMPTS} 次尝试…`);
            await importDelay(attempt * 1500);
          }
        }
      }
      if (!first) {
        failed += 1;
        hasIssues = true;
        reportLines.push("", `收藏夹：${folder.title}`,
          `读取第 1 页失败（已重试 ${IMPORT_FIRST_PAGE_ATTEMPTS} 次）：${firstError?.message || "未知错误"}`);
        if (importIsRateLimitedError(firstError)) {
          reportLines.push("这通常是短时间请求过多触发的限流。等几分钟再试；如果反复出现，可以先只用「开始更新」缩小范围。");
        }
        continue;
      }
      const allItems = [...first.items];
      // 接口自报的总数；没有它时只能靠 has_more 兜底，也就无法对账
      const expectedTotal = Number(first.total) || 0;
      const pageLimit = expectedTotal
        ? Math.ceil(expectedTotal / IMPORT_FAVORITE_PAGE_SIZE)
        : (first.hasMore || first.items.length === IMPORT_FAVORITE_PAGE_SIZE ? IMPORT_MAX_PAGES : 1);
      const maxPages = Math.min(Math.max(pageLimit, 1), IMPORT_MAX_PAGES);
      let consecutivePageFailures = 0;
      let pageLoopStoppedEarly = false;
      // 4.9.1：是否读到了自然末尾（本页不满一页，或接口明说没有下一页）。
      // 只有"没读到末尾"才可能是真缺口——见下面 missingCount 处的说明。
      let sawLastPage = false;
      // V1.1.6：「最近 N 天」提前收工。
      // 列表是按 order=mtime（收藏时间）倒序返回的（见 fetchImportFavoritePage），
      // 所以一旦某页里【最新】的条目都早于窗口起点，后面的只会更早，没必要再翻。
      // 上一版是先拉全 71 页再过滤 —— 请求量跟全量导入一模一样，
      // 「只同步最近 3 天」在服务端看来毫无区别，用户连跑几次就触发了风控。
      // 要求连续两页都整页早于窗口，容忍个别顺序错乱的条目：
      // 早停错了会漏掉新视频，那比多翻几页严重得多。
      const windowCutoff = Math.max(0, Number(data?.recentDays) || 0) > 0
        ? Date.now() - Math.max(0, Number(data?.recentDays) || 0) * 86400000
        : 0;
      let olderPagesSeen = 0;
      let windowStoppedEarly = false;
      for (let page = 2; page <= maxPages; page += 1) {
        await importWaitIfPaused();
        await keepServiceWorkerAlive("page");
        try {
          const result = await fetchImportFavoritePage(folder, page, tabId);
          allItems.push(...result.items);
          consecutivePageFailures = 0;
          if (result.hasMore === false || result.items.length < IMPORT_FAVORITE_PAGE_SIZE) sawLastPage = true;
          publishImportRun({ journal, cursor: { folder: folder.title, page } });
          if (windowCutoff && importPageEntirelyBefore(result.items, windowCutoff)) {
            olderPagesSeen += 1;
            if (olderPagesSeen >= 2) { windowStoppedEarly = true; sawLastPage = true; break; }
          } else {
            olderPagesSeen = 0;
          }
          if (!result.items.length || (!expectedTotal && !result.hasMore)) { pageLoopStoppedEarly = true; break; }
        } catch (error) {
          importRethrowIfAbort(error);
          // 4.9：单页失败不再直接放弃剩余所有页，累积失败、跳过去继续读；
          // 只有连续若干页都失败才终止（以前第 2 页起任一页失败就 break 整轮）
          consecutivePageFailures += 1;
          failed += 1;
          folderLog.push(`读取第 ${page} 页失败（已跳过该页，继续读取）：${error.message}`);
          if (consecutivePageFailures >= IMPORT_MAX_CONSECUTIVE_PAGE_FAILURES) {
            pageLoopStoppedEarly = true;
            folderLog.push(`连续 ${consecutivePageFailures} 页读取失败，已停止读取该收藏夹的剩余页面。`);
            break;
          }
          continue;
        }
        // V1.1.6：以前是 4 页连发再停 150ms（约 4 请求/秒）。真机上跑几次就触发了风控，
        // 改成每页之间都停一下 —— 71 页从约 18 秒变成约 30 秒，代价很小，稳得多。
        await importDelay(IMPORT_PAGE_DELAY_MS);
      }
      // V1.1.4：「开始更新」只处理最近 N 天收藏的条目。
      // 经常用手机刷到就收藏的用户，为了同步这几天的新增去跑一次 39 分钟的全量没有意义。
      // 注意：下面的对账（missingCount）仍然按 allItems 算 —— 那问的是"分页有没有读全"，
      // 与"这次要写哪几条"是两件事，混在一起会把过滤掉的数量误报成缺失。
      const recentDays = Math.max(0, Number(data?.recentDays) || 0);
      const scopedItems = importWithinRecentDays(allItems, recentDays);
      if (recentDays > 0) {
        folderNotes.push(`「${folder.title}」按最近 ${recentDays} 天过滤：线上 ${allItems.length} 条里命中 ${scopedItems.length} 条。`);
        folderLog.push(`限定最近 ${recentDays} 天：${allItems.length} 条中命中 ${scopedItems.length} 条，其余未处理。`);
        folderLog.push(windowStoppedEarly
          ? "（列表按收藏时间倒序返回，翻到整页都早于窗口起点后提前收工，分页请求数远少于全量导入。）"
          : "（本次翻完了全部分页，没有提前收工。）");
        // 命中 0 条时把收藏时间的范围也写出来 —— 上一版正是因为单位搞错导致全被过滤掉，
        // 而报告只写"命中 0 条"，看不出是"确实没有"还是"判据写错了"。
        if (!scopedItems.length && allItems.length) {
          const times = allItems.map((item) => favoriteTimeMs(item?.favoriteAt)).filter(Boolean);
          if (times.length) {
            const newest = new Date(Math.max(...times));
            const oldest = new Date(Math.min(...times));
            folderLog.push(`（线上条目里最新的收藏时间是 ${formatChineseDateTime(newest)}，最早是 ${formatChineseDateTime(oldest)}。`
              + "如果最新时间也在窗口之外，那命中 0 条就是对的。）");
          }
        }
      }
      total += scopedItems.length;
      // 4.9：对账。分页上限（1000 页）或接口异常都可能漏掉尾部，以前没有这一步，
      // 报告会写"读取 40000、新导入 40000、失败 0"，看起来完全成功。缺多少就说多少。
      const missingCount = Math.max(0, expectedTotal - allItems.length);
      // 4.9.1：B 站的 media_count 把"已失效视频"也算进总数，而列表接口不返回它们的内容，
      // 所以"读完了却比总数少"是接口口径差异，不是分页失败。只有没读到自然末尾
      // （撞上分页上限、或连续多页失败）才可能是真缺口。4.9 把前者也计入 failed，
      // 会凭空报出「失败：25」这种数字，用户完全无从判断。
      if (missingCount > 0 && !sawLastPage) {
        failed += missingCount;
        hasIssues = true;
        // 报告与回给界面的消息里都要写明缺口，不能只写"失败 N 个"
        missingNotes.push(`「${folder.title}」预期 ${expectedTotal} 条，实际拉取 ${allItems.length} 条，缺失 ${missingCount} 条`);
        folderLog.push(`分页未取全：预期 ${expectedTotal} 条，实际拉取 ${allItems.length} 条，缺失 ${missingCount} 条（已计入失败）。`
          + (maxPages === IMPORT_MAX_PAGES && !pageLoopStoppedEarly
            ? `已达单次分页上限 ${IMPORT_MAX_PAGES} 页，请重新导入以继续补齐；已写入的记录会被跳过。`
            : "请重新导入以补齐缺失的部分；已写入的记录会被跳过。"));
      } else if (missingCount > 0) {
        coverageNotes.push(`「${folder.title}」接口自报 ${expectedTotal} 条、实际返回 ${allItems.length} 条，差额 ${missingCount} 条`);
      }
      publishImportRun({ journal, force: true, cursor: { folder: folder.title, page: maxPages }, counts: { imported, refreshed, skipped, failed, total } });
      scopedItems.forEach((item) => {
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
      for (const item of scopedItems) {
        const keys = importIdentifierKeys(item);
        const matched = keys.find((key) => existing.identifiers.has(key));
        if (!matched) {
          keys.forEach((key) => existing.identifiers.add(key));
          pendingItems.push(item);
          continue;
        }
        skipped += 1;
        const record = existing.records.get(matched);
        // 4.9：除了文本判据，还要看"目录里有没有封面"（半截目录）。这个查盘只在
        // 文本判据说"完整"时才发生，正常路径不多付 IO。
        if (record && await importRecordNeedsRefresh(collection, record)) refreshTargets.push({ item, record });
      }
      publishImportRun({ journal, force: true, cursor: { folder: folder.title, page: maxPages }, counts: { imported, refreshed, skipped, failed, total } });

      // 失效视频先走原有的恢复流程（APP 收藏夹 / 稍后再看 / 观看历史）。
      // 4.4.1：这条路径会伪造成官方 iOS 客户端请求 APP 接口，默认开启，
      // 用户可以在插件弹窗里取消勾选（recoverInvalidVideos=false）来关闭。
      if (recoverInvalidVideos) {
        try { await enrichImportedInvalidVideos(pendingItems, folder, tabId); }
        catch (error) {
          importRethrowIfAbort(error);
          folderLog.push(`失效视频恢复流程异常：${error.message}`);
        }
        for (const item of pendingItems) {
          for (const message of item.recoveryErrors || []) {
            if (!folderLog.includes(message)) folderLog.push(message);
          }
        }
      } else if (pendingItems.some((item) => item.isInvalid)) {
        folderNotes.push(`「${folder.title}」有失效视频，但「尝试恢复失效视频」未开启，已按“未知”保存。可在插件弹窗的导入面板中开启后重新导入。`);
      }

      // 4.2：每条视频都抓一次完整资料（标签 / 简介 / 发布时间 / 分区 / 互动数据 / UP 主粉丝数）
      const detailTargets = [...pendingItems, ...refreshTargets.map((entry) => entry.item)];
      if (detailTargets.length) await fetchImportDetails(detailTargets, folder, tabId);

      // 更新模式：按新格式重写数据不完整的旧记录（原文进回滚日志）
      for (const entry of refreshTargets) {
        await importWaitIfPaused();
        if (entry.item.rateLimited) {
          // 4.9：详情抓取撞上风控时绝不能重写旧记录——重写会用"未知"覆盖档案里
          // 已经有的标签、简介和互动数据，属于不可逆的数据损失。
          importRateLimitStreak += 1;
          failed += 1;
          folderLog.push(`${entry.item.title || entry.record.directory}：触发 B 站风控，已跳过刷新（避免用“未知”覆盖原记录）。`);
          importCheckRateLimitAbort();
          continue;
        }
        importRateLimitStreak = 0;
        try {
          if (await refreshImportedRecord(collection, entry.record, entry.item, journal)) refreshed += 1;
        } catch (error) {
          importRethrowIfAbort(error);
          failed += 1;
          folderLog.push(`${entry.item.title || entry.record.directory}：刷新失败：${error.message}`);
        }
      }

      for (let offset = 0; offset < pendingItems.length; offset += 12) {
        await importWaitIfPaused();
        await keepServiceWorkerAlive("cover");
        const batch = pendingItems.slice(offset, offset + 12);
        importProgress(`正在准备「${folder.title}」的封面：${Math.min(offset + batch.length, pendingItems.length)}/${pendingItems.length}`);
        await importRunLimited(batch, 4, async (item) => {
          // 命中风控的条目不会再落盘，不必为它下载封面
          if (item.rateLimited) return;
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
          // 4.9：这条视频的详情请求撞上了风控 → 不落盘，否则会写出标签/简介/发布时间
          // 全是"未知"的残缺记录，报告里还显示成功。连续多条就中止整轮导入。
          if (item.rateLimited) {
            importRateLimitStreak += 1;
            failed += 1;
            folderLog.push(`${item.title || "未知"} (${item.bvid || item.aid || "无编号"})：触发 B 站风控，本次未写入本地（避免残缺记录）。`);
            importCheckRateLimitAbort();
            continue;
          }
          importRateLimitStreak = 0;
          try {
            const result = await saveImportedItem(root, folder, item, journal);
            imported += 1;
            savedPaths.push(result.path);
            publishImportRun({ journal, cursor: { folder: folder.title, saved: offset + index + 1, folderTotal: pendingItems.length }, counts: { imported, refreshed, skipped, failed, total } });
          } catch (error) {
            importRethrowIfAbort(error);
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
      if (folderLog.length) {
        reportLines.push("", `收藏夹：${folder.title}`, ...folderLog.slice(0, 500));
        hasIssues = true;
        folderLog.length = 0;   // 已渲染，别让中止路径再渲一遍
      }
      publishImportRun({ journal, force: true, cursor: { folder: folder.title, saved: pendingItems.length, folderTotal: pendingItems.length }, counts: { imported, refreshed, skipped, failed, total } });
    }
  } catch (error) {
    if (error?.name === "ImportCancelled") {
      cancelled = true;
    } else if (error?.name === "ImportRateLimited") {
      // 4.9：触发风控 → 停下来，但不回滚：已经写好的目录都是完整记录，重跑会跳过它们
      rateLimited = error;
    } else {
      importRun.active = false;
      importRun.paused = false;
      publishImportState({ running: false, paused: false, finishedAt: Date.now() }, true);
      await clearImportRunSnapshot();
      throw error;
    }
  }

  let rollback = { removedRecords: 0, restoredFiles: 0, removedCollections: 0, removedFiles: 0 };
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
    await clearImportRunSnapshot();
    publishImportState({ running: false, paused: false, finishedAt, text: summary, summary }, true);
    await chrome.storage.local.set({ lastResult: { message: summary, createdAt: finishedAt } });
    return { ok: false, cancelled: true, message: summary, imported: 0, refreshed: 0, skipped, failed, total, reportPath: "" };
  }

  // 4.9.1：中止时补渲当前收藏夹的日志
  const flushActiveFolderLog = () => {
    if (activeFolderLog.length) {
      reportLines.push("", `收藏夹：${activeFolderTitle}`, ...activeFolderLog.slice(0, 500));
      activeFolderLog.length = 0;
    }
  };

  if (rateLimited) {
    flushActiveFolderLog();
    // 风控中止：把"停在哪、已经写了多少、等多久再试"讲清楚，并留一份报告
    const message = `${rateLimited.message}（本次：读取 ${total} 条，新导入 ${imported} 条，更新 ${refreshed} 条，跳过 ${skipped} 条，失败 ${failed} 条）`
      + (missingNotes.length ? `分页缺口：${missingNotes.join("；")}。` : "");
    reportLines.push("", `中止时间：${formatChineseDateTime(new Date(), true)}`,
      "中止原因：连续命中 B 站风控（HTTP 412 / 接口错误码 -412 / -352）。",
      `重试建议：等待约 ${IMPORT_RATE_LIMIT_COOLDOWN_MINUTES} 分钟后再导入；重新导入会按 BV/av 号跳过已写入的记录。`,
      "本次已写入的目录都包含封面与视频信息.txt，是完整记录，不需要删除。",
      `读取视频：${total}`, `新导入：${imported}`, `更新记录：${refreshed}`, `已存在跳过：${skipped}`, `失败：${failed}`);
    if (folderNotes.length) reportLines.push("", "备注：", ...folderNotes);
    const reportPath = await persistErrorReport(reportLines.join("\n"));
    await chrome.storage.local.set({
      lastError: { report: reportLines.join("\n").slice(0, 16000), reportPath, createdAt: finishedAt },
      lastResult: { message, createdAt: finishedAt }
    });
    publishImportState({ running: false, paused: false, finishedAt, text: message, summary: message, rateLimited: true }, true);
    await clearImportRunSnapshot();
    return { ok: false, rateLimited: true, message, imported, refreshed, skipped, failed, total, reportPath };
  }

  reportLines.push("", `完成时间：${formatChineseDateTime(new Date(), true)}`,
    `读取视频：${total}`, `新导入：${imported}`, `更新记录：${refreshed}`, `已存在跳过：${skipped}`, `失败：${failed}`);
  if (missingNotes.length) reportLines.push("", "分页缺口：", ...missingNotes);
  if (coverageNotes.length) {
    reportLines.push("", "接口口径说明（不是失败）：", ...coverageNotes,
      "说明：B 站收藏夹里的视频被删除后会留下占位空槽 —— 它计入收藏夹总数，但没有内容，接口也不会返回。",
      "所以「接口自报数 − 实际返回数」通常等于这些空槽的数量，不表示导入有遗漏。");
  }
  if (folderNotes.length) reportLines.push("", "备注：", ...folderNotes);
  let reportPath = "";
  if (failed || hasIssues || reportLines.some((line) => line.includes("失败"))) {
    reportPath = await persistErrorReport(reportLines.join("\n"));
    await chrome.storage.local.set({ lastError: { report: reportLines.join("\n").slice(0, 16000), reportPath, createdAt: Date.now() } });
  }
  // 分页缺口必须同时出现在回给界面的消息里，否则界面只会显示"失败 N 个"
  const message = `导入/更新完成：新导入 ${imported} 个，更新 ${refreshed} 个，已存在跳过 ${skipped} 个，失败 ${failed} 个。`
    + (missingNotes.length ? `分页未取全：${missingNotes.join("；")}。` : "")
    // 4.9.2：差额如实报出来，用户才能对照 B 站页面自行核对
    + (coverageNotes.length ? `（${coverageNotes.join("；")}。差额是 B 站收藏夹里的占位空槽：视频被删除后会留下空位，它计入总数但没有内容、接口也不返回，不是导入遗漏。）` : "");
  const pathText = savedPaths.slice(0, 10).join("\n");
  await chrome.storage.local.set({ lastResult: { message, path: pathText, createdAt: Date.now() }, ...(failed || hasIssues ? {} : { lastError: null }) });
  await clearImportRunSnapshot();
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

/* ---------- V1.1.0：线上与本地的差异报告 ----------

   动机：导入会静默跳过已存在的记录，用户看不到 B 站那边变了什么；
   而"再跑一次导入"对 2799 条的收藏夹要 39 分钟，代价太高。

   **关键：差异只需要列表接口，绝不调详情接口。**
   列表是 40 条/请求，详情是 1.25 条/秒。2799 条约 70 次请求（1~2 分钟），
   而全量导入要 39 分钟 —— 相差 20 倍以上。
   这个功能成立的前提就是这一条：**任何情况下都不要在这里调 fetchVideoDetail**，
   一旦调了它就不再"便宜"，也就失去了存在的意义。 */

const DIFF_REPORT_DIR = "002同步报告";

// 第 1 页失败时的重试次数。只影响"整个收藏夹读不读得到"，不影响分页节奏。
const IMPORT_FIRST_PAGE_ATTEMPTS = 3;

// 翻页之间的间隔。以前是每 4 页才停 150ms（约 4 请求/秒），
// 71 页的收藏夹连跑几次就把风控招来了。现在每页都停 ——
// 71 页从约 18 秒变成约 30 秒，换来的是不再被限流。
const IMPORT_PAGE_DELAY_MS = 220;   // 额外的一层；实际节奏由 BILI_MIN_REQUEST_INTERVAL_MS 决定

/* ---------- 全局出网限速（所有 B 站接口调用都必须过这里） ----------

   README 的「使用须知」第一条就是：
     「请勿滥用：插件会代替你请求 B 站接口，请求过密可能触发风控，
       导致 IP 或账号被临时限制。请分批、低速使用。」

   但在 V1.1.6 之前，这个约定只靠**每个调用点自己记得加延迟** ——
   于是一个新写的功能（「最近 N 天」先拉全 71 页再过滤）就把用户扫进了风控，
   停了好一会儿没法继续开发。靠人记的规则迟早会被忘掉。

   所以把限速放进**唯一的出网口** biliImportApiGet() 里：
   不管谁调用、调用多少次，两次请求之间都至少隔 BILI_MIN_REQUEST_INTERVAL_MS。
   新增功能即使完全不写延迟，也不可能快过这个下限。

   修改这个常量前先想清楚：它同时决定了"最快能多快"和"多久会被限流"。 */
/* 两次请求之间的最小间隔。为什么是 800ms：

   项目里早就为详情抓取定了 IMPORT_DETAIL_DELAY_MS = 800（1.25 条/秒），
   那是对着同一个接口的同一套风控拍的。列表接口没有任何理由比它快 2.5 倍 ——
   之前写的 320ms 是凭手感定的，站不住脚。

   代价：默认收藏夹 2804 条 = 71 页，从约 23 秒变成约 57 秒。
   换来的是速率降到 1.25 次/秒，与详情一致；而且 57 秒仍在
   "2800 条约 1~2 分钟"这个对用户的承诺之内。

   想调快就改这一个数 —— 但改之前先想清楚：
   320ms 那次真机风控，就是"觉得快一点没关系"的代价。 */
/* 请求速度档位。用户可在插件弹窗里选，存在 chrome.storage.local.requestSpeed。

   「较低」是唯一真正像人的一档：不只慢，还会**分批** —— 读 8 次停 6 秒，
   模拟人翻几页、看到感兴趣的内容会停下来。其余三档只是把间隔拉长/缩短。

   数值直接决定被风控的概率。改之前先读 AI_HANDOFF 合规红线第 8 条。 */
const REQUEST_SPEEDS = {
  lower:    { intervalMs: 1200, batchSize: 8, pauseMs: 6000 },
  standard: { intervalMs: 800,  batchSize: 0, pauseMs: 0 },
  higher:   { intervalMs: 400,  batchSize: 0, pauseMs: 0 },
  high:     { intervalMs: 200,  batchSize: 0, pauseMs: 0 }
};
// 默认「较低」：大收藏夹是常态，而"较低"是唯一带分批停顿、真正安全的档位。
// 「标准」仍然是可选项，但不再是开箱即用的值 —— 让安全的那一档成为默认。
const DEFAULT_REQUEST_SPEED = "lower";
// 「标准」档的间隔。测试与文档引用它，实际节奏由 REQUEST_SPEEDS 决定
const BILI_MIN_REQUEST_INTERVAL_MS = REQUEST_SPEEDS[DEFAULT_REQUEST_SPEED].intervalMs;

let requestSpeed = REQUEST_SPEEDS[DEFAULT_REQUEST_SPEED];
let requestSpeedId = DEFAULT_REQUEST_SPEED;
function applyRequestSpeed(id) {
  if (!REQUEST_SPEEDS[id]) return;
  requestSpeedId = id;
  requestSpeed = REQUEST_SPEEDS[id];
}
// service worker 里不每次请求都读 storage，缓存一份并监听变化
chrome.storage.local.get("requestSpeed")
  .then((saved) => applyRequestSpeed(saved?.requestSpeed || DEFAULT_REQUEST_SPEED))
  .catch(() => {});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.requestSpeed) applyRequestSpeed(changes.requestSpeed.newValue);
});

/* 页面代取连续失败多少次之后，本轮就不再尝试它。

   B 站对「页面上下文」发出的请求本来就常常返回 412（见 biliImportApiGet 里的注释），
   所以每次都先试一遍页面代取，等于**每次请求都发两遍** —— 真机上 412 恰恰是最常见的情况。
   超过这个次数就只走后台直连，请求量直接减半。service worker 重启后自动复位。 */
const IMPORT_PAGE_PROXY_FAILURE_LIMIT = 3;
let importPageProxyFailures = 0;

/* 失效视频恢复（手机端收藏夹扫描）与观看历史的请求预算。

   这两个是项目里最大的请求放大器，而且**默认开启**：
     · 恢复：原来是 4 轮 × 100 页 × 每页 3 次重试 = 最多 1200 次请求
     · 历史：最多 80 页
   配合"页面代取失败会再发一次"，最坏能到 2400 次 —— 一个收藏夹就能把账号送进风控。
   现在各自有一个硬预算，用完就停，并在报告里写清楚还剩多少没恢复。 */
const IMPORT_RECOVERY_MAX_REQUESTS = 120;
const IMPORT_RECOVERY_MAX_PASSES = 2;
const IMPORT_HISTORY_MAX_REQUESTS = 40;
let biliRequestSlotAt = 0;
let biliRequestCount = 0;

// 预约一个不早于"上次预约 + 最小间隔"的时间点再往下走。
// 先占坑再等待，所以并发调用也会被排成有间隔的一串，而不是同时冲出去。
async function biliThrottleWait() {
  const speed = requestSpeed;
  const slot = Math.max(Date.now(), biliRequestSlotAt + speed.intervalMs);
  biliRequestSlotAt = slot;
  const wait = slot - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  // 分批档位：每读 batchSize 次停 pauseMs —— 模拟人翻几页、停下来看一会儿
  if (speed.batchSize > 0) {
    biliRequestCount += 1;
    if (biliRequestCount % speed.batchSize === 0) {
      biliRequestSlotAt = Date.now() + speed.pauseMs;
      await new Promise((resolve) => setTimeout(resolve, speed.pauseMs));
    }
  }
}

// 从 视频信息.txt 原文取「视频状态」行。归档里写的是「正常」或「已失效视频（已尝试恢复）」。
function localRecordIsInvalid(text) {
  const status = String(text || "").match(/^视频状态：(.+)$/m)?.[1]?.trim() || "";
  return status.includes("失效");
}

function localRecordTitle(text) {
  return String(text || "").match(/^视频标题：(.+)$/m)?.[1]?.trim() || "";
}

// readExistingImportRecords 返回的是「标识符 → 记录」，同一条记录会同时有 bvid 与 aid
// 两个键。这里按目录名归并回「一条记录 + 它的全部键」，否则删除项会被算重。
function groupLocalImportRecords(existing) {
  const byDirectory = new Map();
  for (const [key, record] of existing?.records || []) {
    if (!record?.directory) continue;
    if (!byDirectory.has(record.directory)) byDirectory.set(record.directory, { record, keys: [] });
    byDirectory.get(record.directory).keys.push(key);
  }
  return [...byDirectory.values()].map(({ record, keys }) => ({
    directory: record.directory,
    title: localRecordTitle(record.text) || record.directory,
    invalid: localRecordIsInvalid(record.text),
    keys
  }));
}

/* 纯函数：给「线上条目」与「本地记录」，算出四项差异。
   刻意不碰 DOM、不碰 chrome API、不发请求 —— 这样 test/stability.test.cjs 的
   loadBackgroundFunctions 能把它抽出来真跑，而不是只能正则匹配源码。

   入参形状：
     remoteItems : [{ bvid, aid, title, invalid, keys: ["bvid:..","aid:.."] }]
     localRecords: [{ directory, title, invalid, keys: [...] }] */
function computeFavoriteDiff(remoteItems, localRecords) {
  const remote = Array.isArray(remoteItems) ? remoteItems : [];
  const local = Array.isArray(localRecords) ? localRecords : [];

  // 用 Map 而不是每轮 find，2799 条时是 O(n) 与 O(n²) 的差别
  const remoteByKey = new Map();
  for (const item of remote) {
    for (const key of item.keys || []) if (!remoteByKey.has(key)) remoteByKey.set(key, item);
  }
  const localKeys = new Set();
  for (const record of local) for (const key of record.keys || []) localKeys.add(key);

  const added = [];
  for (const item of remote) {
    if (!(item.keys || []).some((key) => localKeys.has(key))) {
      added.push({ bvid: item.bvid || "", aid: item.aid || "", title: item.title || "", invalid: item.invalid === true });
    }
  }

  const removed = [];
  const newlyInvalid = [];
  const recovered = [];
  let unchanged = 0;
  for (const record of local) {
    const match = (record.keys || []).map((key) => remoteByKey.get(key)).find(Boolean);
    if (!match) {
      removed.push({ directory: record.directory || "", title: record.title || "" });
      continue;
    }
    // 本地失效、线上正常 = 视频回来了（少见但真实存在）；反之是新失效
    if (match.invalid === true && !record.invalid) {
      newlyInvalid.push({ directory: record.directory || "", title: record.title || "", bvid: match.bvid || "" });
    } else if (match.invalid !== true && record.invalid) {
      recovered.push({ directory: record.directory || "", title: record.title || "", bvid: match.bvid || "" });
    } else {
      unchanged += 1;
    }
  }

  return { added, removed, newlyInvalid, recovered, unchanged };
}

// 把一条线上条目转成纯函数要的形状
function diffRemoteEntry(item) {
  return {
    bvid: item?.bvid || "",
    aid: item?.aid || "",
    title: item?.title || "",
    invalid: item?.isInvalid === true,
    keys: importIdentifierKeys(item || {})
  };
}

/* 只拉列表，不抓详情。返回 {items, expectedTotal, sawLastPage, failedPages}。
   分页策略与导入保持一致，但不参与导入的暂停/取消状态机（它很短，跑完就完）。 */
async function fetchFavoriteListOnly(folder, tabId, onProgress) {
  const first = await fetchImportFavoritePage(folder, 1, tabId);
  const items = [...first.items];
  const expectedTotal = Number(first.total) || 0;
  const pageLimit = expectedTotal
    ? Math.ceil(expectedTotal / IMPORT_FAVORITE_PAGE_SIZE)
    : (first.hasMore || first.items.length === IMPORT_FAVORITE_PAGE_SIZE ? IMPORT_MAX_PAGES : 1);
  const maxPages = Math.min(Math.max(pageLimit, 1), IMPORT_MAX_PAGES);
  let sawLastPage = first.items.length < IMPORT_FAVORITE_PAGE_SIZE;
  let failedPages = 0;
  let consecutiveFailures = 0;
  onProgress?.({ folder: folder.title, page: 1, maxPages, count: items.length });

  for (let page = 2; page <= maxPages; page += 1) {
    await keepServiceWorkerAlive("diff");
    try {
      const result = await fetchImportFavoritePage(folder, page, tabId);
      items.push(...result.items);
      consecutiveFailures = 0;
      if (result.hasMore === false || result.items.length < IMPORT_FAVORITE_PAGE_SIZE) sawLastPage = true;
      onProgress?.({ folder: folder.title, page, maxPages, count: items.length });
      if (!result.items.length) break;
    } catch (error) {
      importRethrowIfAbort(error);
      // 与导入同一策略：单页失败跳过去继续，连续多页失败才停
      consecutiveFailures += 1;
      failedPages += 1;
      if (consecutiveFailures >= IMPORT_MAX_CONSECUTIVE_PAGE_FAILURES) break;
    }
    // 与导入同一节奏，见 IMPORT_PAGE_DELAY_MS 的说明
    await importDelay(IMPORT_PAGE_DELAY_MS);
  }
  return { items, expectedTotal, sawLastPage, failedPages };
}

async function diffFavoriteCollection(root, folder, tabId, onProgress) {
  const list = await fetchFavoriteListOnly(folder, tabId, onProgress);

  const collectionName = safeSegment(folder.title);
  let existing = { identifiers: new Set(), records: new Map() };
  let collectionExists = true;
  try {
    const collection = await root.getDirectoryHandle(collectionName);
    existing = await readExistingImportRecords(collection);
  } catch (error) {
    if (error?.name !== "NotFoundError") throw error;
    collectionExists = false;
  }

  const localRecords = groupLocalImportRecords(existing);
  const diff = computeFavoriteDiff(list.items.map(diffRemoteEntry), localRecords);
  return {
    folderId: folder.id,
    folderTitle: folder.title,
    collectionName,
    collectionExists,
    remoteTotal: list.expectedTotal || list.items.length,
    remoteFetched: list.items.length,
    localTotal: localRecords.length,
    // 没读到自然末尾、或有页失败 → 结果可能不全，报告里要说清楚
    incomplete: !list.sawLastPage || list.failedPages > 0,
    failedPages: list.failedPages,
    ...diff
  };
}

/* 报告正文。纯函数，只有拼字符串。 */
function buildDiffReportText(diffs, generatedAt) {
  const list = Array.isArray(diffs) ? diffs : [];
  const sum = (key) => list.reduce((total, diff) => total + (diff[key]?.length || 0), 0);
  const lines = [
    "B站收藏夹同步差异报告",
    ERROR_REPORT_NOTICE,
    `生成时间：${generatedAt}`,
    "",
    "说明：本报告只对比「收藏夹列表」，不抓取每条视频的详情，所以很快（2800 条约 1~2 分钟）。",
    "「线上已移除」= 本地有、但 B 站收藏夹列表里已经没有了（通常是你在 B 站取消了收藏）。",
    "B 站收藏夹里的占位空槽既不在线上列表、也不在本地，所以不会出现在这里。",
    "",
    `本次对比了 ${list.length} 个收藏夹：新增 ${sum("added")}、线上已移除 ${sum("removed")}、新失效 ${sum("newlyInvalid")}、恢复 ${sum("recovered")}。`
  ];

  for (const diff of list) {
    lines.push("", "─".repeat(40), `收藏夹：${diff.folderTitle}`);
    lines.push(`线上 ${diff.remoteTotal} 条（实际读到 ${diff.remoteFetched} 条）／本地 ${diff.localTotal} 条`);
    // 4.9.1 的教训：B 站的 media_count 把"已失效视频"留下的空位也算进总数，
    // 而列表接口不返回它们的内容。差额是接口口径差异，**不是读取失败** ——
    // 不写清楚，用户看到 2804 与 2720 只会怀疑漏读了 84 条。
    // 只有在确实读到自然末尾时才敢这么说（没读全时由下面的 incomplete 分支负责）。
    const remoteGap = Math.max(0, diff.remoteTotal - diff.remoteFetched);
    if (remoteGap > 0 && !diff.incomplete) {
      lines.push(`接口自报 ${diff.remoteTotal} 条、实际返回 ${diff.remoteFetched} 条，差额 ${remoteGap} 条是 B 站的占位空槽`
        + "（视频被删后在收藏夹里留下的空位，接口不返回它们的内容），不是读取失败。");
    }
    if (diff.incomplete) {
      lines.push(`⚠ 本次读取可能不完整${diff.failedPages ? `（有 ${diff.failedPages} 页失败）` : "（没读到最后一页）"}，下面的差异请酌情参考。`);
    }
    if (!diff.collectionExists) lines.push("本地没有同名收藏夹，因此本地全部算作「新增」。");

    const section = (title, items, render) => {
      if (!items.length) return;
      lines.push("", `【${title}】${items.length} 条`);
      for (const item of items.slice(0, 500)) lines.push(`  ${render(item)}`);
      if (items.length > 500) lines.push(`  …还有 ${items.length - 500} 条，未全部列出`);
    };
    section("新增（线上有、本地没有）", diff.added, (x) => `${x.title || "(无标题)"}${x.invalid ? "［已失效］" : ""}${x.bvid ? `  https://www.bilibili.com/video/${x.bvid}/` : ""}`);
    section("线上已移除（本地有、线上没有了）", diff.removed, (x) => `${x.title || "(无标题)"}  [${x.directory}]`);
    section("新失效（本地还是正常，线上已失效）", diff.newlyInvalid, (x) => `${x.title || "(无标题)"}  [${x.directory}]`);
    section("已恢复（本地标记失效，线上正常了）", diff.recovered, (x) => `${x.title || "(无标题)"}  [${x.directory}]`);
    if (!diff.added.length && !diff.removed.length && !diff.newlyInvalid.length && !diff.recovered.length) {
      lines.push("", "四项差异都是 0 —— 本地与线上完全一致。");
    }
  }
  lines.push("");
  return lines.join("\n");
}

// 写进 002同步报告/。失败不抛错，返回空串由调用方处理。
async function persistDiffReport(text) {
  try {
    const root = await getRootHandle();
    if (!root || await root.queryPermission({ mode: "readwrite" }) !== "granted") return "";
    const directory = await root.getDirectoryHandle(DIFF_REPORT_DIR, { create: true });
    const filename = `${timestampFolder(new Date())}_${Date.now()}_同步差异报告.txt`;
    await writeFile(directory, filename, text);
    return `${root.name}/${DIFF_REPORT_DIR}/${filename}`;
  } catch (_) {
    return "";
  }
}

let diffStatePublishAt = 0;

function publishDiffState(patch) {
  const next = { ...diffState, ...patch };
  diffState = next;
  chrome.storage.local.set({ diffState: next }).catch(() => {});
}

function publishDiffProgress(text) {
  // 进度刷新限流，别把 storage 写爆
  const now = Date.now();
  if (now - diffStatePublishAt < 500) return;
  diffStatePublishAt = now;
  publishDiffState({ running: true, text });
}

let diffState = { running: false, text: "", summary: null, at: 0 };

function sendDiffProgress(text) {
  publishDiffProgress(text);
  chrome.runtime.sendMessage({ type: "bca-diff-progress", text }, () => { void chrome.runtime.lastError; });
}

/* 差异对比需要一个 B 站 UID（收藏夹列表接口按 up_mid 取）。
   弹窗在收藏夹页上，能直接拿到；收藏库（独立扩展页）拿不到，所以：
     1) 调用方给了 uid → 用它，并记下来
     2) 没给 → 找一个已打开的收藏夹页，连 uid 带 tabId 一起用（页面代取更稳）
     3) 还没有 → 用上次记下的 uid，走后台直连
     4) 都没有 → 明确告诉用户先打开一次收藏夹页 */
async function resolveDiffUid(uid, tabId) {
  const given = importClean(uid);
  if (/^\d+$/.test(given)) {
    await chrome.storage.local.set({ lastImportUid: given });
    return { uid: given, tabId };
  }
  // manifest 里没有 tabs 权限，这个查询可能直接抛错或返回没有 url 的标签页；
  // 都当成"找不到"处理，退回下面用缓存 uid 走后台直连。
  try {
    const tabs = await chrome.tabs.query({ url: "https://space.bilibili.com/*/favlist*" });
    for (const tab of tabs) {
      const found = String(tab?.url || "").match(/^https:\/\/space\.bilibili\.com\/(\d+)\/favlist/)?.[1] || "";
      if (found) {
        await chrome.storage.local.set({ lastImportUid: found });
        return { uid: found, tabId: tab.id ?? null };
      }
    }
  } catch (_) { /* 没有 tabs 权限，正常情况，走缓存 */ }
  const saved = await chrome.storage.local.get("lastImportUid");
  const cached = importClean(saved?.lastImportUid);
  if (/^\d+$/.test(cached)) return { uid: cached, tabId: null };
  throw new Error("对比差异需要知道你的 B 站 UID。请先打开一次自己的 B 站收藏夹页面。");
}

async function diffBiliFavorites(data, tabId = null) {
  publishDiffState({ running: true, text: BcaI18n.t("正在读取 B 站收藏夹列表…"), summary: null, at: Date.now() });
  try {
    return await diffBiliFavoritesInner(data, tabId);
  } catch (error) {
    publishDiffState({ running: false, text: "", at: Date.now(), summary: null });
    throw error;
  }
}

async function diffBiliFavoritesInner(data, tabId = null) {
  const folderIds = new Set((Array.isArray(data?.folderIds) ? data.folderIds : []).map(String));
  const resolved = await resolveDiffUid(data?.uid, tabId);
  const folders = await listBiliFavoriteFolders(resolved.uid, resolved.tabId);
  // 收藏库（独立扩展页）手上只有本地收藏夹名，没有远程 media_id，所以也支持按名字匹配。
  // 本地目录名与 B 站收藏夹名本来就要求一致（导入就是按名字建目录的）。
  const titles = new Set((Array.isArray(data?.folderTitles) ? data.folderTitles : []).map(String));
  const picked = folderIds.size
    ? folders.filter((folder) => folderIds.has(String(folder.id)))
    : titles.size
      ? folders.filter((folder) => titles.has(folder.title))
      : folders;
  if (!picked.length) throw new Error("没有找到要对比的收藏夹。如果本地收藏夹改过名，请先在 B 站核对名称。");

  const root = await getRootHandle();
  if (!root) throw new Error("还没有设置本地保存位置，无法与本地对比。");

  const diffs = [];
  for (const folder of picked) {
    sendDiffProgress(`正在对比「${folder.title}」…`);
    diffs.push(await diffFavoriteCollection(root, folder, resolved.tabId, (progress) => {
      sendDiffProgress(`正在对比「${progress.folder}」：第 ${progress.page}/${progress.maxPages} 页，已读到 ${progress.count} 条`);
    }));
  }

  const report = buildDiffReportText(diffs, formatChineseDateTime(new Date(), true));
  // 写文件失败不影响结果展示，reportPath 会是空串
  const reportPath = data?.writeReport === false ? "" : await persistDiffReport(report);
  // 只留摘要：完整列表在报告文件里，界面上本来也只显示摘要
  publishDiffState({
    running: false,
    text: "",
    at: Date.now(),
    summary: {
      // 结果会留在 storage 里供弹窗恢复；这个标记表示"完成弹窗还没给用户看过"。
      // 用户点掉弹窗后由 popup 置为 true —— 否则每次打开插件都会重放一遍
      // （真机上就是这样：点「知道了」再打开，弹窗又出来了）。
      acknowledged: false,
      reportPath,
      folders: diffs.map((d) => ({
        folderTitle: d.folderTitle, remoteFetched: d.remoteFetched, localTotal: d.localTotal,
        collectionExists: d.collectionExists, incomplete: d.incomplete,
        added: d.added.length, removed: d.removed.length,
        newlyInvalid: d.newlyInvalid.length, recovered: d.recovered.length
      }))
    }
  });
  return { ok: true, diffs, report, reportPath };
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
  if (message?.type === "bca-locale") {
    // 4.5：内容脚本跑在网页里，fetch 扩展资源需要 web_accessible_resources，
    // 而 4.3 起我们不把任何扩展资源暴露给网页。所以由后台代读词典：
    // service worker 读自己的资源不受同源限制。
    const locale = String(message.locale || "");
    if (!/^(zh-TW|en)$/.test(locale)) { sendResponse({ ok: false }); return true; }
    fetch(chrome.runtime.getURL(`locales/${locale}.json`))
      .then((response) => (response.ok ? response.json() : null))
      .then((dictionary) => sendResponse({ ok: Boolean(dictionary), dictionary }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }  if (message?.type === "bca-open-library") {
    // 4.3：由后台打开本地收藏库，这样 library.html 不必作为 web_accessible_resource
    // 暴露给任何网页（否则 B 站页面可以把它嵌进 iframe 做点击劫持）
    chrome.tabs.create({ url: chrome.runtime.getURL("library.html") })
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, message: error?.message || "无法打开本地收藏库。" }));
    return true;
  }
  if (message?.type === "bca-refresh-video-stats") {
    // 与保存/导入共用串行队列，避免同时改写同一批归档文件
    const task = saveQueue.then(() => refreshVideoStatus(message.data, sender?.tab?.id ?? null));
    saveQueue = task.catch(() => undefined);
    task.then(sendResponse).catch((error) => sendResponse({ ok: false, message: error?.message || "更新视频状态失败。" }));
    return true;
  }
  if (message?.type === "bca-import-control") {
    const action = String(message.action || "");
    if (!importRun.active) {
      // 4.9：后台没有活动导入时，storage 里的 running 可能还是被回收前的残影。
      // 顺手复位并把"上次导入已中断"讲清楚，而不是只回一句"没有正在进行的导入"。
      importReconcileState()
        .then((result) => sendResponse({
          ok: false,
          reset: result.reset,
          message: result.reset
            ? BcaI18n.t("上次导入已中断，无法继续或取消。已写入本地的记录保持原样，请重新发起导入。")
            : "当前没有正在进行的导入。"
        }))
        .catch(() => sendResponse({ ok: false, message: "当前没有正在进行的导入。" }));
      return true;
    }
    if (action === "pause") {
      importRun.paused = true;
      publishImportState({ paused: true, text: "导入已暂停，可继续或取消。" }, true);
      publishImportRun({ force: true });
    } else if (action === "resume") {
      importRun.paused = false;
      publishImportState({ paused: false }, true);
      publishImportRun({ force: true });
      importReleaseWaiters();
    } else if (action === "cancel") {
      importRun.cancelled = true;
      importRun.paused = false;
      publishImportState({ paused: false, text: "正在取消并回滚本次导入…" }, true);
      // 取消本身也要落一次断点：万一回滚途中又被回收，日志还在
      publishImportRun({ force: true });
      importReleaseWaiters();
    } else {
      sendResponse({ ok: false, message: "不支持的操作。" });
      return true;
    }
    sendResponse({ ok: true, paused: importRun.paused, cancelled: importRun.cancelled });
    return true;
  }
  if (message?.type === "bca-import-probe") {
    // 4.9：界面按 importState 恢复进度之前先探活。只有后台真的有活动导入
    // （内存里的 importRun.active）才算"在跑"；否则强制复位 importState.running
    // 并落盘，同时把"上次导入已中断"写进文案，避免界面永久锁死在导入中。
    importReconcileState()
      .then((result) => sendResponse({ ok: true, active: importRun.active, reset: result.reset, importState }))
      .catch(() => sendResponse({ ok: true, active: importRun.active, reset: false, importState }));
    return true;
  }
  if (message?.type === "bca-import-rollback-recovered") {
    // 4.9：回滚"被回收打断的那一次导入"。回滚日志只存了名字，这里按名字重新取句柄。
    rollbackInterruptedImport()
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ ok: false, message: error?.message || "回滚上次中断的导入失败。" }));
    return true;
  }
  if (message?.type === "bca-import-state") {
    importReconcileState()
      .then(() => { importState = { ...importState, active: importRun.active }; sendResponse({ ok: true, importState }); })
      .catch(() => sendResponse({ ok: true, importState }));
    return true;
  }
  if (message?.type === "bca-fav-diff") {
    // V1.1.0：只拉收藏夹列表做差异对比，不抓详情，所以很快。
    // 弹窗与收藏库都用这一条消息（收藏库拿不到 uid，见 resolveDiffUid）。
    diffBiliFavorites(message.data || message, sender?.tab?.id ?? null)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, message: error?.message || "对比差异失败。" }));
    return true;
  }
  if (message?.type === "list-bili-favorite-folders") {
    // 顺手记住 UID：收藏库（独立扩展页）没有 B 站标签页，对比差异时要靠这份缓存
    if (/^\d+$/.test(String(message.uid || ""))) chrome.storage.local.set({ lastImportUid: String(message.uid) });
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
    // 4.9：弹窗每次打开都会走这里恢复进度，所以先探活/复位，再把状态回给界面。
    // 注意：respond 的那一行是既有契约（测试会比对），保持原样。
    importReconcileState()
      .catch(() => {})
      .then(() => { importState = { ...importState, active: importRun.active }; })
      .then(() => chrome.storage.local.get(["baseFolderName", "lastResult", "lastError", "pendingFavorite", "authorizedErrorAt"]))
      .then((status) => {
        sendResponse({ ...status, importState });
      })
      // 兜底：storage 读取失败也要应答，否则弹窗的 sendMessage 会一直挂着
      .catch(() => sendResponse({ importState }));
    return true;
  }
});

// 4.9：service worker 启动时检查"未完成的导入记录"。模块每次启动都会重新求值，
// 所以此刻内存里的 importRun 必定是空的——session 里那份 active 快照只可能来自
// 上一次被回收（浏览器被杀 / 扩展被重载 / 后台空闲回收）打断的导入。
// 发现之后：复位 importState.running、留一份带提示行的中断报告、把回滚日志挪到独立键，
// 并明确告知用户"发生了中断、断点在哪、已写入的内容仍然有效"。
importRecoverInterruptedImport().catch((error) => console.warn("检查未完成的导入记录失败", error));
