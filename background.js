// 1.5.0：本地数据库（`003database/database.json`）的纯逻辑直接复用 stats-core.js ——
// background.js 是模块化 service worker（manifest 里 "type": "module"），
// 静态 import 一个经典脚本是合法的：它执行时把 BcaStatsCore 挂在 globalThis 上，
// 所以后台、收藏库页面、数据统计页用的是同一份实现，不会各写一套。
import "./stats-core.js";
// 1.7.33：视频信息里的易变字段（UP主粉丝数 / 互动数据 / 发布时间 / 失效标记）全仓只有一份实现，
// 就在 archive-core.js 里。这里以前抄了一份副本，靠行为用例逐个输入比对两边输出 ——
// 改一边不会红，是交接文档里自认的最后一个双份实现。现在和上面 stats-core.js 同一套做法：
// service worker 是模块，静态 import 一个经典脚本是合法的，它把 BcaArchiveCore 挂在 globalThis 上。
import "./archive-core.js";

const DB_NAME = "bili-fav-archiver";
const DB_STORE = "settings";
const BcaStatsCore = globalThis.BcaStatsCore;
const BcaArchiveCore = globalThis.BcaArchiveCore;
let saveQueue = Promise.resolve();

// 4.9：后台是模块化 service worker。i18n.js 虽然是经典脚本、静态 import 得了，但它的词条是
// 异步取的（i18n.js 自己走 chrome.runtime 向 SW 要词典，后台里那条路是循环），所以后台进程里
// 拿不到同步词典。这里做一次存在性兜底：
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
   实测归档：上百张「封面.png」就有 200 MB 以上，均值 1.6 MB、最大 7 MB——根因是
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
// 4.9.x：封面候选全部失败时会写一张「封面暂不可恢复」的占位图。占位图必须留下痕迹，
// 否则下次导入只会看到"目录里有封面文件"而判定封面完好，这条记录就永远不会再尝试补真封面。
// 所以占位图对应在「视频信息.txt」里写一行这个标记；导入侧的刷新判定认它，收藏库侧不受影响
//（library.js 只读自己认识的字段，多这一行既不会让它跳过记录，也不会覆盖用户数据）。
const COVER_PENDING_LINE = "封面状态：待补全（当前为占位图）";
const COVER_WIDTH = 320;
const COVER_HEIGHT = 180;
const COVER_MIME_TYPE = "image/webp";
const COVER_QUALITY = 0.8;
/* V1.4.3（P2-15 / P2-17）：封面下载曾经是唯一一条不限速、不带超时、并发 4 的出网路径，
   而且直接用上游给的地址（页面给的 og:image、本地旧记录、候选列表都可能带脏值）。
   现在两件事一起收紧：域名只允许 B 站图床，且必须走限速与超时。
   白名单只放这两个图床域名，1.3.0 删掉的那三条视频流域名权限一律不许加回来
   （见 AI_HANDOFF 红线第 4 条，那里写清了是哪三条）。
   1.7.11（facet-privacy P2-1）：这份名单必须和 manifest.json 的 host_permissions 一致 ——
   原来这里还写着 `.bilibili.com`，而 manifest 只授权了 `*.hdslb.com` 与 `api.bilibili.com`，
   于是「代码白名单放行、Chrome 层拦截」，用户看到的是「封面恢复不了」，排查时又以为域名
   不在白名单里。现在照着 manifest 拆成两栏：后缀栏对应 `*.hdslb.com`（含裸域名），
   精确栏对应 `api.bilibili.com`（B 站接口自己回的图床地址）。
   **以后要加域名，必须同步改 manifest.json 的 host_permissions**（有守卫断言钉住两者一致）。 */
const COVER_HOST_SUFFIXES = [".hdslb.com"];
const COVER_EXACT_HOSTS = ["hdslb.com", "api.bilibili.com"];
const COVER_FETCH_TIMEOUT_MS = 20000;

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

/* ---------- 活动角标（4.9.x） ----------
   导入 / 更新、对比差异、更新视频状态这类要跑几分钟的批量活动结束时，在图标右下角点一个
   角标，用户切走了页面也能一眼看到"跑完了、成了还是砸了"。口径：

   1. 亮：活动**结束**时亮，成功与失败都亮 —— 成功绿、失败红（失败含被取消、风控中止、
      以及"跑完了但有条目失败"）；
   2. 灭：用户打开弹窗（说明结果已经看到）时灭，下一次活动开始时也灭（不留上一轮的结果）；
   3. 角标与图标是两件事：chrome.action 的 setIcon 与 setBadge* 互不影响，改角标的代码
      一行都不许碰 updateActionIcon，反之亦然（自动归档开关只走 setIcon 那条路）。

   文字最多 4 个字符：成功用「✓」（与参考图一致，Windows 上由 Segoe UI 回退链渲染），
   失败用「!」。万一某台机器把「✓」渲染成豆腐块，只需把 BADGE_SUCCESS_TEXT 改成 "1"，
   别处不用动。文字与底色永远成对写，而且方向相反：亮的时候先写底色再写文字（免得"旧底色 +
   新文字"——绿底上顶个「!」看着像成功）；灭的时候先清文字再复位底色（免得"新底色 + 旧文字"）。
   两个方向的中转帧看上去都还是旧的那一副，不会闪出第三种状态。 */
const BADGE_SUCCESS_TEXT = "✓";
const BADGE_FAILURE_TEXT = "!";
const BADGE_SUCCESS_COLOR = "#2e9e5b";
const BADGE_FAILURE_COLOR = "#c0392b";
// 全透明：清空时连底色一起复位，不会残留"没文字但有底色"的半截状态
const BADGE_CLEAR_COLOR = [0, 0, 0, 0];

// 角标绝不能反过来影响活动本身：这里的每一次调用都吞掉异常（setBadge* 在旧内核上
// 可能直接抛，或返回 rejected promise），调用方在导入的收尾路径上，不能因为它炸掉。
function paintActivityBadge(success) {
  try {
    const action = chrome.action;
    if (!action) return;
    Promise.resolve(action.setBadgeBackgroundColor({ color: success ? BADGE_SUCCESS_COLOR : BADGE_FAILURE_COLOR })).catch(() => {});
    Promise.resolve(action.setBadgeText({ text: success ? BADGE_SUCCESS_TEXT : BADGE_FAILURE_TEXT })).catch(() => {});
  } catch (_) {}
}

function clearActivityBadge() {
  try {
    const action = chrome.action;
    if (!action) return;
    Promise.resolve(action.setBadgeText({ text: "" })).catch(() => {});
    Promise.resolve(action.setBadgeBackgroundColor({ color: BADGE_CLEAR_COLOR })).catch(() => {});
  } catch (_) {}
}

// 活动开始：先灭掉上一轮的结果。必须在任何 await 之前调用，否则上一轮的颜色会挂到新一轮跑起来之后
function markActivityStarted() {
  clearActivityBadge();
}

// 活动结束：result.ok === false（失败 / 取消 / 风控中止）或有个别条目失败 → 红，其余 → 绿。
// 传 null（catch 分支）也是红。判据只看结果对象，不猜活动类型。
function markActivityFinished(result) {
  const success = Boolean(result) && result.ok !== false && !(Number(result.failed) > 0);
  paintActivityBadge(success);
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

/* 1.7.10（facet-destructive P2-2）：目录名还有一道「字节」闸。
   service worker 是 ES module、import 不了经典脚本，所以与 archive-core.js 的
   utf8ByteLength / truncateToBytes 各留一份逐字相同的副本（稳定性测试守着两份）。
   字符上限照旧（收藏夹名 120），字节上限 200 —— 一个汉字 3 字节，120 汉字 = 360
   字节会越过 NTFS 的 255 字节分量上限，建目录直接抛错。 */
const MAX_SEGMENT_BYTES = 200;

/* 1.7.24（facet-compat §3.2）：与 archive-core.js 的路径预算常量逐字相同的一份。
   service worker 是 ES module、import 不了经典脚本，所以只能各留一份（稳定性测试守着）。
   两个单段上限刻意保持 120 / 100：磁盘上已有的收藏夹目录名要能原样读回来。 */
const WINDOWS_PATH_LIMIT_CHARS = 260;
const PATH_SEGMENT_BUDGET_CHARS = 168;
const COLLECTION_NAME_MAX_CHARS = 120;
const RECORD_NAME_MAX_CHARS = 100;

// 1.8.21（facet-compat §3.3）：判据只留 archive-core.js 那一份，这里起个同名短别名，
// 好让上面那句「两份逐字相同」的文案能两边一模一样地对上。
const isMissingError = (error) => BcaArchiveCore.isMissingError(error);

// 见 archive-core.js 的 describeDirectoryCreateError：同一句文案，两份逐字相同。
function describeDirectoryCreateError(error, name) {
  if (!isMissingError(error)) return "";
  return "建不出「" + name + "」这个目录：要么上级目录已经不在了，要么拼出来的完整路径超过了"
    + " Windows 的 " + WINDOWS_PATH_LIMIT_CHARS + " 个字符上限。把本地备份文件夹挪到更浅的"
    + "位置（例如 D:\\备份），或把收藏夹名 / 视频标题改短，再试一次。";
}

async function createDirectoryOrExplain(parent, name) {
  try {
    return await parent.getDirectoryHandle(name, { create: true });
  } catch (error) {
    const explained = describeDirectoryCreateError(error, name);
    if (explained) throw new Error(explained);
    throw error;
  }
}

function utf8ByteLength(text) {
  let bytes = 0;
  for (const char of String(text || "")) {
    const code = char.codePointAt(0);
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
}

function truncateToBytes(text, maxBytes) {
  const source = String(text || "");
  if (maxBytes <= 0) return "";
  if (utf8ByteLength(source) <= maxBytes) return source;
  let used = 0;
  let result = "";
  for (const char of source) {
    const size = utf8ByteLength(char);
    if (used + size > maxBytes) break;
    used += size;
    result += char;
  }
  return result;
}

/* 1.7.29（facet-compat §3.4）：按**码点**截字符，不能按 UTF-16 码元。
   name.slice(0, 120) 数的是码元，一个 emoji 占 2 个码元 —— 正好在第 120 个码元处
   落刀时会把代理对劈成两半，留下一个孤立代理；写进目录名后 Windows 把它变成 "?"。
   本文件下面的 truncateToBytes 是按码点走的，但它只管字节数，管不到「先按字符切」这一步。 */
function sliceCodePoints(value, maxChars) {
  const source = String(value == null ? "" : value);
  const limit = Number(maxChars);
  if (!Number.isFinite(limit) || limit < 0) return source;
  const chars = Array.from(source);
  return chars.length <= limit ? source : chars.slice(0, Math.floor(limit)).join("");
}

function safeSegment(input, fallback = "未命名收藏夹") {
  let value = String(input || "").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/[. ]+$/g, "").trim();
  if (!value || value === "." || value === "..") value = fallback;
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(value)) value = `_${value}`;
  return truncateToBytes(sliceCodePoints(value, COLLECTION_NAME_MAX_CHARS), MAX_SEGMENT_BYTES);
}

/* V1.4.3（P2-3）：这几个目录名保留给插件自己用，收藏夹不许占用。
   原来这份名单在两个地方各写一遍（手动添加、导入），自动归档那条链路漏了 ——
   B 站收藏夹真叫「001错误报告」时，视频会被写进错误报告目录里。
   1.7.11（facet-security P2-3）：权威名单现在在 archive-core.js 的
   `RESERVED_COLLECTION_NAMES` / `isReservedCollectionName()` 里（收藏库那条
   「把下载好的视频放进收藏夹」链路原本完全不查名单）。SW 是 ES module，拿不到经典脚本，
   所以这里保留一份**逐字相同**的副本，由 test/stability.test.cjs 的守卫断言逐项比对。 */
const RESERVED_COLLECTION_NAMES = new Set([
  "错误报告",
  "001错误报告",
  "002同步报告",
  "视频下载",
  "000视频下载",
  // 1.5.0：本地数据库根目录（003database），收藏夹不许占用
  "003database",
  // 1.7.30：归档元数据导出目录（004导出），收藏夹不许占用
  "004导出",
  "005回收站",
  "006报告"
]);

function collectionNameIsReserved(name) {
  return RESERVED_COLLECTION_NAMES.has(safeSegment(name));
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
  /* 1.8.22（old-p3 compat L239）决定不改：星期几是 视频信息.txt 里「视频发布时间」的既定格式，
     写中文是档案的一部分（跟 BV 号、时长一样不进词典），读档与逐字节比对都依赖它。
     它不属于界面文案，所以不需要跟着界面语言变。 */
  const week = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"][date.getDay()];
  return `${formatDateTime(date)} ${week}`;
}

/* 1.7.14（facet-compat C4）：文件系统错误分类。权威表和 archive-core.js 里那份
   逐字相同 —— service worker 是 ES module，拿不到经典脚本，只能各留一份，
   由 test/stability.test.cjs 的守卫断言逐项比对。 */
const FILE_SYSTEM_ERROR_HINTS = Object.freeze({
  NotAllowedError: "写入授权已失效，请在插件图标里点“重新授权本地备份文件夹”，允许访问后重试。",
  NoModificationAllowedError: "目标文件夹不可写（只读、被系统保护，或同步盘临时锁定）。请换一个本地文件夹再试。",
  QuotaExceededError: "磁盘空间不足，写不进去了。清出一些空间或换一个本地文件夹再试。",
  InvalidModificationError: "目标文件夹不允许这样改动，请换一个本地文件夹再试。"
});

function describeFileSystemError(error) {
  const name = String(error?.name || "");
  const hint = FILE_SYSTEM_ERROR_HINTS[name];
  if (!hint) return "";
  const detail = String(error?.message || "").trim();
  return detail ? `${hint}（${name}：${detail}）` : `${hint}（${name}）`;
}

async function ensureWritePermission(handle) {
  let permission;
  try {
    permission = await handle.queryPermission({ mode: "readwrite" });
  } catch (error) {
    // 1.7.14（facet-compat C4）：句柄自己失效（目录被删/改名/换盘）时
    // queryPermission 就会抛，以前这里直接冒泡英文原文。
    throw new Error(describeFileSystemError(error) || `打不开所选文件夹（${error?.name || "未知错误"}），请重新选择本地备份文件夹。`);
  }
  if (permission !== "granted") {
    throw new Error("所选文件夹的写入授权已失效。请点击插件图标中的“重新授权本地备份文件夹”，允许访问后重试。");
  }
  // 1.7.14（facet-compat C6）：授权还在，但目录本身可能已经被删 / 改名 / 换盘。
  // 句柄存在不代表目标还在 —— 以前要等到很深的某一步才炸出一句英文异常名，
  // 用户完全不知道是「目录没了」还是「插件坏了」。这里顺手探一次（只读一个条目）。
  try {
    for await (const _entry of handle.values()) break;
  } catch (error) {
    if (BcaArchiveCore.isMissingError(error)) {
      throw new Error("上次选择的本地备份文件夹已经不在了（被删除、改名或换了盘符）。请重新选择本地备份文件夹。");
    }
    const friendly = describeFileSystemError(error);
    if (friendly) throw new Error(friendly);
    throw error;
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
      // 1.4.2（P1-6）：同名位置上是一个**文件**时，getDirectoryHandle 抛的是
      // TypeMismatchError，不是 NotFoundError。原来会当成致命错误抛出去，整次保存
      // 直接失败；这里跟"目录已存在"一样处理：换个后缀继续试，绝不去动用户那个文件。
      // （create:true 自己也可能撞上刚出现的同名文件，所以那一层也兜一次。）
      if (error?.name !== "NotFoundError" && error?.name !== "TypeMismatchError") throw error;
      try {
        return await parent.getDirectoryHandle(candidate, { create: true });
      } catch (inner) {
        if (inner?.name !== "TypeMismatchError") {
          // 1.7.24（§3.2）：create:true 还抛 NotFoundError，多半是完整路径越过了
          // Windows 的 260 字符上限 —— 以前这里直接把异常名冒出去。
          const explained = describeDirectoryCreateError(inner, candidate);
          if (explained) throw new Error(explained);
          throw inner;
        }
        candidate = `${name}_${suffix++}`;
      }
    }
  }
}

/* 1.7.0（批次 B / P1）：归档正文（`视频信息.txt` 等）原来是 createWritable 就地截断写 ——
   写一半被关页面 / 断电 / 磁盘满，留下的就是半截文本，而读侧把「读不到视频信息」当成
   「这条记录没有视频」静默跳过（等于这条收藏凭空消失，用户只看到视频没了）。
   database.json 在 1.5.9 已经改成「先写临时文件、再换名」，这里补齐同一条规矩：
   临时文件写完整 → move 覆盖；move 不可用才退回就地写；失败且临时文件已经写完整时必须
   留着它 —— 那是唯一一份完整内容。 */
// 1.7.16：最近一次「换名覆盖」失败的签名（错误名 + 消息），只用于诊断，不参与控制流。
// 1.7.0 栽的那一跤，根子就是失败原因没人记下来 —— 事后只能靠猜。
let lastRenameFailureNote = "";
function renameFailureNote(error) {
  const name = error?.name || "未知错误";
  const message = sliceCodePoints(String(error?.message || ""), 200);
  lastRenameFailureNote = `${name}：${message}`;
  return lastRenameFailureNote;
}

/* 1.7.16（destructive P1-1）：写失败时要不要把这个刚建出来的目录删掉。
   这个目录是本次调用刚建的，回滚它本身没错 —— 但里面很可能已经落了东西（封面先写成功、
   正文写失败是最常见的一种），删掉就等于把现场和已经下载好的封面一起抹掉，用户既看不到
   出了什么事、也没法重试。所以：里面有内容就留着（收藏库的「另有 N 个目录没写完」会把
   它报出来，用户能自己去清理），完全是空的才删 —— 空目录没有任何信息量，只会堆垃圾。
   保留时顺手把这件事写进错误消息，否则用户只会看到一句「保存失败」，不知道东西还在。 */
async function discardFailedRecord(parent, name, error) {
  let kept = false;
  try {
    const record = await parent.getDirectoryHandle(name);
    for await (const _entry of record.values()) { kept = true; break; }
    if (!kept) await parent.removeEntry(name, { recursive: true }).catch(() => {});
  } catch (_) {
    kept = false;
  }
  if (kept && error && typeof error === "object") {
    try {
      error.message = `${error.message}（已经写进去的内容留在「${name}」里，没有删，可以重试或自己清理）`;
    } catch (_) {}
  }
  return kept;
}

// 1.8.0：写「临时文件 + 换名」这条路被中途杀掉时，换名没机会跑，
// `.<名字>.<时间戳>.tmp` 就躺在目录里再没人管（真机在 003database 里留过两个）。
// 每次写入前扫一遍同目录，只删「形状像临时文件 + 超过 10 分钟没动过」的 ——
// 刚创建的那个正在写，不会被误删；形状/年龄的规则只在 archive-core.js 一处。
async function removeStaleTempFiles(directory) {
  try {
    for await (const entry of directory.values()) {
      if (entry.kind !== "file") continue;
      if (!BcaArchiveCore.isTempFileName(entry.name)) continue;
      let lastModified = 0;
      try {
        lastModified = (await entry.getFile()).lastModified;
      } catch (_) {
        continue; // 取不到修改时间就当它不老，宁可不删
      }
      if (!BcaArchiveCore.isStaleTempFile(lastModified, Date.now())) continue;
      await directory.removeEntry(entry.name);
    }
  } catch (_) {
    // 清陈年临时文件是顺手做的事（三档）：失败绝不能影响这次真正的写入
  }
}

// 1.8.2：目标文件在不在 —— 新建与覆盖要走不同的写盘路径（理由见 writeFile 里那条注释）。
async function fileExists(directory, name) {
  try {
    await directory.getFileHandle(name);
    return true;
  } catch (_) {
    return false;
  }
}

async function writeFile(directory, name, content) {
  /* 1.7.1 曾在这里**完整退回** 1.7.0 之前的就地写，理由是「1.7.0 一上原子写，手动收藏和
     导入就都存不进本地」。1.7.16 重新上原子写，因为那条理由已经被真机探针推翻：
     在 service worker 里 `temp.move(directory, name)` 是**能用**的，连覆盖一个已存在的
     文件也能用（探针见 b_catch/move-probe.js 与 move-probe2.js）。
     真正压垮 1.7.0 的是它的兜底条件：
       const unsupported = moveError && (moveError.name === "NotSupportedError" || moveError.name === "TypeError");
       if (!unsupported) throw moveError;
     「换名被拒」在真机上报的是 NoModificationAllowedError（目标正被别的进程或另一个
     writable 占用；Windows 上重命名覆盖一个被打开的文件本来就会失败，同步盘 / 杀毒 /
     索引器都会造成这种情况，所以它是间歇性的），不在那份名单里，于是它**没有**退回就地写、
     直接把异常抛给了调用方，调用方又把整条记录目录删掉 —— 用户看到的就是
     「提示正在保存，然后本地归档里什么都没有」。
     现在：换名失败一律退回就地写，只把错误名记下来备查；就地写也失败时，临时文件
     （完整内容）保留并把两条原因一起报出去。 */
  // 1.8.0：先把同目录里的陈年临时文件清掉，免得目录越用越脏
  await removeStaleTempFiles(directory);
  // 1.8.2（真机量出来的）：归档时每个记录目录都是刚建出来的，封面与视频信息.txt 全是
  // 全新文件 —— 这时候「临时文件 + move() 换名」是纯开销。同一份 11 KB 封面：就地写
  // 0.06 秒，绕一圈临时文件 7.1 秒（Chrome 155 上换名覆盖要 7 秒左右；1.6 用的是就地写，
  // 所以当年一秒内就能完成）。原子性只在「覆盖一个已经存在的文件」时才有意义，所以：
  // 新文件直接就地写，已存在的文件才走下面那条「临时文件 + 换名」。
  if (!(await fileExists(directory, name))) {
    const fresh = await directory.getFileHandle(name, { create: true });
    let freshWritable;
    try {
      freshWritable = await fresh.createWritable();
      await freshWritable.write(content);
      await freshWritable.close();
    } catch (error) {
      try { await freshWritable?.abort(); } catch (_) {
        // 三档：abort 只是清理，它自己失败没有下一步可做，也不该盖住上面真正的错误
      }
      const friendlyFresh = describeFileSystemError(error);
      if (friendlyFresh) throw new Error(friendlyFresh);
      throw error;
    }
    return;
  }
  const tempName = `.${name}.${Date.now().toString(36)}.tmp`;
  let temp = null;
  let tempReady = false;
  let renameNote = "";
  try {
    temp = await directory.getFileHandle(tempName, { create: true });
    const writable = await temp.createWritable();
    await writable.write(content);
    await writable.close();
    tempReady = true;
  } catch (error) {
    // 临时文件自己都没写成功：正式文件一个字节都没动过，直接把原因抛上去
    const friendly = describeFileSystemError(error);
    if (friendly) throw new Error(friendly);
    throw error;
  }

  if (typeof temp.move === "function") {
    try {
      await temp.move(directory, name);
      lastRenameFailureNote = "";
      return; // 换名成功：正式文件是原子替换过来的，不存在写一半的中间态
    } catch (error) {
      renameNote = renameFailureNote(error);
      console.warn(`换名覆盖 ${name} 失败，退回就地写。`, error);
    }
  } else {
    renameNote = renameFailureNote(new Error("本机没有 FileSystemFileHandle.move()"));
  }

  // 退回就地写
  // 1.7.14（facet-compat C4）：createWritable() 原来在 try 之外，所以只读目录
  // （NoModificationAllowedError）、磁盘满（QuotaExceededError）、授权被半路撤销
  // （NotAllowedError）三种最常见的环境问题全都冒泡成英文原文。
  let writable;
  try {
    const file = await directory.getFileHandle(name, { create: true });
    writable = await file.createWritable();
    await writable.write(content);
    await writable.close();
  } catch (error) {
    try { await writable?.abort(); } catch (_) {}
    if (tempReady) {
      // 就地写也失败：临时文件是最后一份完整内容，必须留着并说出来
      console.warn(`写 ${name} 失败，临时文件 ${tempName} 里留着一份完整内容，已保留。`, error);
      chrome.storage.local.set({
        lastResult: {
          message: `写 ${name} 失败，已保留临时文件 ${tempName}（里面是完整内容，可手动恢复）。换名失败的原因：${renameNote || "未知"}`,
          createdAt: Date.now()
        }
      }).catch(() => {});
    } else {
      await directory.removeEntry(tempName).catch(() => {});
    }
    const friendly = describeFileSystemError(error);
    const reason = friendly || error?.message || "写入失败";
    throw new Error(renameNote ? `${reason}（换名覆盖也没成功：${renameNote}）` : reason);
  }
  // 就地写成功：临时文件没用了
  await directory.removeEntry(tempName).catch(() => {});
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

// V1.4.3（P2-17）：只向白名单里的域名取封面，绝不向任意域名发请求。
// V1.4.5：B 站接口回的 pic 是 **http 协议的 i0.hdslb.com**（老式明文地址），而 manifest 只给了
//   hdslb.com 域名下 https 的权限 —— 原来这里只认 https，于是接口来的封面候选全被挡掉；
//   收藏夹页面开着时还有一个从页面抓到的 https 候选顶着，页面一关（或导入中途关掉）就整批
//   变成「封面暂不可恢复」。所以这里接受 http，但取之前统一升到 https（这些域名的 https 都在）。
//   返回「可以拿去 fetch 的地址」，不允许就返回空串。
//   注意：这条注释里不能出现块注释开始符，仓库里的 stripComments 是正则实现，会把它当注释开头，
//   把后面整个文件都吃掉（V1.4.5 真栽过：两条依赖 background.js 的测试直接报"匹配不上"）。
function coverFetchUrl(rawUrl) {
  try {
    const parsed = new URL(normalizeUrl(rawUrl));
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return "";
    const host = parsed.hostname.toLowerCase();
    if (!COVER_EXACT_HOSTS.includes(host) && !COVER_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) return "";
    if (parsed.protocol === "http:") parsed.protocol = "https:";
    return parsed.href;
  } catch (_) {
    return "";
  }
}

async function loadCoverPng(url) {
  const normalized = normalizeUrl(url);
  if (!normalized) throw new Error("网页没有提供封面地址。");
  // V1.4.3（P2-17）：不在白名单里的封面地址直接跳过，绝不向任意域名发请求
  const coverUrl = coverFetchUrl(normalized);
  if (!coverUrl) throw new Error("封面地址不在允许的域名里，已跳过。");
  // V1.4.3（P2-15）：封面下载也要限速，并且必须带超时 —— 一次连接卡住会让整批
  // Promise.all 不返回（进度冻结），取消也要等这批。
  // 超时从「真正开始发请求」那一刻起算：排限速队列的时间不算进去（默认档一次最多等 7 秒左右，
  // 但不该把等待时间算进网络超时里）。
  await biliThrottleWait();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), COVER_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(coverUrl, { credentials: "omit", cache: "no-store", signal: controller.signal });
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
  } finally {
    clearTimeout(timer);
  }
}

/* 1.7.11（facet-security P2-1）：单行字段一律不许带换行与控制符。
   标题 / 收藏夹名 / 链接 / UP 名这些都可能原样来自页面或接口，上传者能往自己的标题或
   简介里塞任意多行；这些值以前只是 `\r\n → \n` 归一就写进 视频信息.txt，
   于是一行 `视频链接：https://evil.example` 就能在解析时覆盖真实字段。
   读侧（archive-core.js 的 parseInfoFile）另有两道闸，这里从写侧先掐死。
   简介是**多行字段**，故意不走这个函数。 */
function infoLineValue(value, fallback = "未知") {
  const text = String(value ?? "").replace(/[\r\n\t\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  return text || fallback;
}

function buildInfo(data, folderName, savedAt) {
  const metadata = data.metadata || {};
  const favoriteAt = new Date(Number(data.favoriteAt) || Date.now());
  const favoriteAtText = metadata.imported && metadata.favoriteTimeUnknown
    ? "未知"
    : formatChineseDateTime(favoriteAt, true);
  const tags = Array.isArray(metadata.tags) && metadata.tags.length
    ? metadata.tags.map((tag) => infoLineValue(tag, "")).filter(Boolean).join("、") || (metadata.imported ? "未知" : "无")
    : (metadata.imported ? "未知" : "无");
  const title = infoLineValue(metadata.title);
  const videoUrl = infoLineValue(metadata.url);
  const bvid = infoLineValue(metadata.bvid || (String(metadata.url || "").match(/\bBV[\w]+/i)?.[0] || "未知"));
  const aid = metadata.aid ? `av${String(metadata.aid).replace(/^av/i, "")}` : "未知";
  const upMid = infoLineValue(metadata.upMid);
  const upName = infoLineValue(metadata.upName);
  const upHome = metadata.upMid ? `https://space.bilibili.com/${importIsPlaceholder(metadata.upMid) ? "" : String(metadata.upMid).replace(/[^0-9]/g, "")}` : "未知";
  const description = String(metadata.description || "未知").replace(/\r\n/g, "\n");
  const stats = metadata.stats || {};
  const hasStats = STAT_KEYS.some((key) => !importIsPlaceholder(stats[key]));
  const fansText = importIsPlaceholder(metadata.upFans) ? "未知" : String(metadata.upFans);
  const lines = [
    "【基本信息】",
    `视频收藏时间：${favoriteAtText}`,
    `信息保存于：${formatDateTime(savedAt)}`,
    `所属收藏夹：${infoLineValue(folderName)}`,
    `视频标题：${title}`,
    `视频链接：${videoUrl}`,
    `BV号：${bvid}`,
    `av号：${aid}`,
    `分区：${infoLineValue(metadata.category)}`,
    `视频时长：${metadata.imported && !(Number(metadata.duration) > 0) ? "未知" : formatDuration(metadata.duration)}`,
    `视频发布时间：${formatPublishDate(metadata.pubdate)}`,
    // 封面候选全失败时这里会留下「待补全」标记，让后续导入还能重新尝试补真封面（见 COVER_PENDING_LINE）
    ...(metadata.coverMissing ? [COVER_PENDING_LINE] : []),
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
    for (const key of STAT_KEYS) {
      const value = stats[key];
      lines.push(`${STAT_LABELS[key]}：${importIsPlaceholder(value) ? "未知" : String(value)}`);
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
    // 失效原因**只在确实失效时**写，有效视频一个字节都不动（老存档的文件不会被这次改动污染）。
    // 老存档没有这一行，读回时按「已失效」兜底显示，绝不能显示「未知」。
    const attrReason = metadata.invalid ? importAttrReason(metadata.attr) : "";
    if (attrReason) lines.splice(8, 0, `失效原因：${attrReason}`);
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

/* 1.5.1（P0-1）：这里原来是两处裸 fetch —— 不领限速票、也没有超时，
   是「所有 B 站请求都必须走 biliImportApiGet」这条红线唯一的例外（见 :3378 的说明）。
   现在两条请求都走统一出口：
     · 限速：biliImportApiGet 一进来就 biliThrottleWait()，先占坑再等待，
       并发调用会被排成有间隔的一串（:938）；
     · 超时：它带 AbortController，超时抛「B站接口请求超时。」（:943 / :996）——
       所以这条链路不可能再出现"永远挂住的 await"。这一点对手动添加也重要：
       addManualVideo 是排在 saveQueue（串行队列）上跑的，一个永不 resolve 的请求
       会把整条队列占死，之后的收藏、导入全部跟着卡住。
   复用是否真的可行，两个语义都核对过：
     · credentials / cache：出网口的两处 fetch 用的就是 { credentials: "include",
       cache: "no-store" }（:964 / :973），与这里原来写的完全一致；
     · 返回体：出网口返回 payload.data，非 0 错误码、非 2xx、412 风控都在内部抛错
       （:981-:996），等价于原来手写的「code !== 0 就抛」，且风控与普通失败还能区分开。
   唯一的取舍：不再走「页面代取」，固定传 tabId = null 走后台直连。手动添加是从弹窗发起的，
   手上没有 B 站标签页 id，也就不为了省一次请求去引入对 sender.tab 的依赖。 */
async function fetchManualVideoMetadata(identifier) {
  // 1.8.22（old-p3 privacy P3-2）：手动添加视频走的是后台 service worker 直接 GET，
  // 没有页面 Referer、Cookie 也不带 —— 与「在 B 站页面里点收藏」的抓包指纹不同，
  // 这是浏览器扩展的既定实现，不是请求伪装，保留现状并在此说明。
  const video = await biliImportApiGet("/x/web-interface/view", identifier, 15000);
  if (!video || !video.title || !video.pic) throw new Error("B 站返回的视频资料不完整，缺少标题或封面。");
  let tags = [];
  try {
    const tagData = await biliImportApiGet("/x/web-interface/view/detail/tag", { aid: video.aid }, 10000);
    if (Array.isArray(tagData)) tags = tagData.map((tag) => tag.tag_name).filter(Boolean);
  } catch (error) {
    // L14：标签接口是"能拿到就更好"，失败不该让整条视频解析失败 —— 所以照旧吞掉。
    // 但原来是个空 catch，连一行日志都不留：真机上标签集体丢失时无从判断
    // 是"这个视频本来没标签"还是"标签接口挂了"。
    console.warn("读取视频标签失败（不影响视频信息）", error);
  }
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
    if (collectionNames.some((name) => safeSegment(name) !== name || collectionNameIsReserved(name))) throw new Error("目标收藏夹名称无效，请重新选择收藏夹。");
    const root = await getRootHandle();
    if (!root) throw new Error("尚未设置本地备份文件夹，请先选择本地备份文件夹。");
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
        if (identifiersOverlap(existing, keys)) duplicates.push(name);
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
          await discardFailedRecord(target.collection, record.name, error);
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
    // 4.9.x：视频此刻已经写进磁盘了，这里只是"记录最近一次结果"的收尾。
    // 它一旦抛错就会被下面的 catch 接住、把结果改写成「添加失败」——用户重新添加一次，
    // 又会因为"已存在"被跳过，等于白跑。所以收尾必须自己兜住异常。
    try {
      await chrome.storage.local.set({
        lastResult: { message: `“${metadata.title}”：${message}`, path: maskLocalUserPaths(savedPaths.slice(0, 10).join("\n")), createdAt: Date.now() },
        // S3：这一支会把上面 logError 写的 lastError 整个覆盖掉，所以 needsReauth 必须自己补上 ——
        // 覆盖掉布尔值就等于把「重新授权」按钮又抹掉了，而这里恰恰会撞上授权失效
        // （writeFile 落盘时才发现权限被回收）。判据与 logError 保持一致，走同一个 helper。
        ...(failures.length ? { lastError: { reportPath: reportPath ? storageReportLabel(reportPath) : "", createdAt: Date.now(), report: maskLocalUserPaths(message), needsReauth: failures.some((item) => needsReauthFromError(item.message)) } } : { lastError: null })
      });
    } catch (storageError) {
      console.warn("写入最近结果失败（视频已经保存成功）", storageError);
    }
    const ok = !failures.length || savedCollections.length > 0 || duplicates.length > 0;
    return { ok, message, paths: savedPaths, added: savedCollections, skipped: duplicates, failed: failures, reportPath: reportPath ? storageReportLabel(reportPath) : "" };
  } catch (error) {
    const saved = await logError(error, { metadata, folders: collectionNames.map((name) => ({ name })) });
    await chrome.storage.local.set({ lastResult: { message: `添加失败：${error?.message || "未知错误"}`, createdAt: Date.now() } });
    // 1.8.21（PRV-P2-4）：回给页面的只能是「末两段」相对标签 —— 绝对路径里带着用户名，
    // 而这条 details 会原样显示在 B 站页面的通知里。报告正文留在插件里，点图标能看能下载。
    return {
      ok: false,
      message: error?.message || "添加视频失败。",
      details: saved.reportPath
        ? `错误报告已保存：${storageReportLabel(saved.reportPath)}`
        : "错误报告保存在插件中；点击插件图标可查看并下载。"
    };
  }
}

// 判断两组标识符（BV 号 / av 号）有没有交集。library.js 有一份同名同体的副本
// —— 页面与 service worker 拿不到彼此的脚本（SW 是 ES module，import 不了经典脚本）——
// 两处的**名字与函数体**由 stability.test.cjs 逐字守着，改一边必须同时改另一边。
function identifiersOverlap(left, right) {
  for (const key of right) if (left.has(key)) return true;
  return false;
}

function addManualVideoInOrder(data) {
  return enqueueSaveTask(() => addManualVideo(data));
}

// 4.3：错误报告里会带本地目录路径、视频链接和堆栈，提醒用户不要外发
const ERROR_REPORT_NOTICE = "提示：本报告包含本地目录路径与视频链接，仅供自己排查使用，请勿公开分享。";

/* 1.7.11（facet-privacy P2-2 / P2-4）：报告正文（也含 lastResult.path）里那串绝对路径
   带着 Windows 用户名 —— `C:\Users\<真名>\Desktop\...`。它原来原样进了 chrome.storage.local，
   同机任何程序、任何拿到浏览器 profile 的人都能读到，顺着就能推出机主的现实身份。
   报告文件本身该留就留（排障要用），但**进 storage 和给网页看的那一份**必须先把
   用户目录名抹掉。文件系统访问 API 不给我们根目录的绝对路径，所以没法做「前缀替换成
   <备份目录>」那套，这里直接按 Windows 用户目录的形状打码。 */
/* 用 new RegExp 而不是正则字面量：test/stability.test.cjs 里的 stripComments 是手写词法
   扫描器，它在正则的字符类里碰到 `[\\/]` 会提前收尾、把后面的代码当成字符串，结果注释
   再也剥不掉 —— 几条「死代码不许回来」的断言就会误报。字符串形式绕开这个坑。 */
const USER_DIR_PATTERN = new RegExp("([A-Za-z]:[\\\\/]Users[\\\\/])[^\\\\/\\r\\n\"'<>|]+", "gi");
const LEGACY_USER_DIR_PATTERN = new RegExp("([A-Za-z]:[\\\\/]Documents and Settings[\\\\/])[^\\\\/\\r\\n\"'<>|]+", "gi");
const PATH_SPLIT_PATTERN = new RegExp("[\\\\/]+");

function maskLocalUserPaths(text) {
  return String(text ?? "")
    .replace(USER_DIR_PATTERN, "$1<用户>")
    .replace(LEGACY_USER_DIR_PATTERN, "$1<用户>");
}

// 存进 storage 的报告路径只留归档内的相对位置（「001错误报告/xxx_错误报告.txt」），
// 用户目录名一并打码 —— 显示给用户看的信息量不变，机器上留的明文少一截。
function storageReportLabel(path) {
  const parts = maskLocalUserPaths(path).split(PATH_SPLIT_PATTERN).filter(Boolean);
  return parts.slice(-2).join("/");
}

function reportText(error, context = {}) {
  const now = new Date();
  const metadata = context.metadata || {};
  // 1.8.22（old-p3 security P3-5）：报告正文里的 C:\Users\<用户名> 一律打码。
  // 错误堆栈对用户排查仍然够用（盘符之后的路段都保留），但不再把账号名写进
  // 会被复制、被贴给别人的文本里。落盘那一份也走这里。
  const text = [
    "哔哩藏库错误报告",
    ERROR_REPORT_NOTICE,
    `发生时间：${formatChineseDateTime(now, true)}`,
    `错误：${error?.message || String(error)}`,
    `错误类型：${error?.name || "未知"}`,
    ...(lastRenameFailureNote ? [`最近一次换名覆盖失败：${lastRenameFailureNote}`] : []),
    `视频标题：${metadata.title || "未知"}`,
    `视频链接：${metadata.url || "未知"}`,
    `收藏夹：${(context.folders || []).map((folder) => folder.name || folder.id).join("、") || "未知"}`,
    `详细信息：${error?.stack || "无"}`,
    ""
  ].join("\n").slice(0, 16000);
  return maskLocalUserPaths(text);
}

// V1.4.3（P2-19）：报告目录原来只增不减 —— 每次失败都新建一份，用户又没有清理入口。
// 写完新报告后按文件名里的时间戳保留最新 N 份，多出来的删掉（删不掉就算了，下次再试）。
const REPORT_KEEP_FILES = 50;

async function trimReportDirectory(directory, keep, suffix) {
  const entries = [];
  try {
    for await (const entry of directory.values()) {
      if (entry.kind !== "file" || !entry.name.endsWith(suffix)) continue;
      const stamp = Number((entry.name.match(/_(\d{10,})_/) || [])[1] || 0);
      entries.push({ name: entry.name, stamp });
    }
  } catch (error) {
    // 1.8.22（old-p3 destructive P3-1）：原来这里静默返回 0，报告目录就只会涨不会清；
    // 至少留一条日志，出问题（权限、网络盘掉线）时能查。
    console.warn("读错误报告目录失败（这次不清理旧报告，下次写报告时再试）", error);
    return 0;
  }
  if (entries.length <= keep) return 0;
  entries.sort((a, b) => b.stamp - a.stamp || b.name.localeCompare(a.name));
  let removed = 0;
  let failed = 0;
  for (const stale of entries.slice(keep)) {
    try {
      await directory.removeEntry(stale.name);
      removed += 1;
    } catch (error) {
      // 留着它不致命：下次写报告时还会再试一遍。但「一直删不掉」要让日志里看得见。
      failed += 1;
      if (failed === 1) console.warn("清理旧错误报告失败（不致命，下次写报告时会再试）", error);
    }
  }
  if (failed) console.warn(`有 ${failed} 份旧错误报告这次没删掉；数量超过 ${keep} 份时每次写报告都会再试`);
  return removed;
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
    await trimReportDirectory(directory, REPORT_KEEP_FILES, "错误报告.txt");
    return `${root.name}/001错误报告/${filename}`;
  } catch (error) {
    // 1.8.22（old-p3 destructive P3-1）：写报告本身是尽力而为（失败不能盖掉原始错误），
    // 但静默返回 "" 会让「报告写着写着没了」完全无从排查 —— 补一条二档日志。
    console.warn("写错误报告失败（这次失败只留在 lastError 里，没有落盘）", error);
    return "";
  }
}

// S3：判断一个错误是不是"本地备份文件夹的写入授权失效"。
// 以前这个判断散在三个调用点各写一遍字符串匹配，popup 那边也得跟着匹配后台的文案 ——
// 文案一改，「重新授权」按钮就静默消失（用户只看到报错，找不到能救回来的入口）。
// 现在统一在这里判断一次，结果以结构化的 lastError.needsReauth 布尔值传给界面；
// 字符串匹配保留，只作为给日志/报告用的兜底。
function needsReauthFromError(error) {
  return String(error?.message || error || "").includes("写入授权已失效");
}

async function logError(error, context = {}) {
  const report = reportText(error, context);
  const reportPath = await persistErrorReport(report);
  // 4.9.x：这里必须是"尽力而为"。原来裸 await 没有任何保护，storage 一抛错就会顺着
  // 调用链传出去：saveFavorite / addManualVideo 会被改写成"保存失败"，而
  // import-bili-favorites 的处理器更糟 —— 它在 await logError 之后才 sendResponse，
  // 一旦抛在这里，调用方永远收不到回应（弹窗一直转圈）。
  try {
    await chrome.storage.local.set({ lastError: { report: maskLocalUserPaths(report), reportPath: storageReportLabel(reportPath), createdAt: Date.now(), needsReauth: needsReauthFromError(error) }, authorizedErrorAt: null });
  } catch (storageError) {
    console.warn("写入错误报告失败（报告正文仍会返回给调用方）", storageError);
  }
  return { report, reportPath };
}

async function saveFavorite(data) {
  const metadata = data?.metadata || {};
  const folders = Array.isArray(data?.folders) ? data.folders : [];
  const settings = await chrome.storage.local.get("enabled");
  if (settings.enabled === false) return { ok: false, message: "自动归档已关闭，本次收藏未保存到本地。" };
  try {
    if (!folders.length || folders.some((folder) => !folder?.name)) {
      throw new Error("无法从 B 站读取本次收藏夹的实际名称。请保持收藏夹列表已加载后重试。");
    }
    const root = await getRootHandle();
    if (!root) throw new Error("尚未设置本地备份文件夹。请点击插件图标并选择本地备份文件夹。");
    await ensureWritePermission(root);

    const favoriteAt = new Date(Number(data.favoriteAt) || Date.now());
    const dateFolderName = timestampFolder(favoriteAt);
    const savedAt = new Date();
    // 1.8.0：封面只取一次。原来它在下面的收藏夹循环里，选 5 个收藏夹就把同一张封面
    // 下载 + 缩放 + 编码 5 遍（fetch 还带 cache: "no-store"，等于每次都重新走网络），
    // 每遍都要排一次限速队列；真机上 5 个收藏夹里的 封面.webp 是同一份 11046 字节。
    // 放在建目录之前：拿不到封面就整次失败，磁盘上一个半截目录都不留。
    const cover = await loadCoverPng(metadata.cover);
    // 1.8.0：收藏夹之间并行落盘。每个收藏夹内部仍然严格「先封面、后 txt」——
    // txt 是完成标记（4.9 协议），这个顺序不能动；但收藏夹彼此独立，串行跑等于
    // 把每个文件的落盘等待乘上收藏夹数量。真机对照：5 个收藏夹串行 68 秒
    // （Chrome 155 上每次文件提交约 7 秒），并行之后只等最慢的那一个。
    // 名字重复时只留第一个：并行写同一个目录会互相抢时间戳后缀。
    const uniqueFolders = [];
    const seenNames = new Set();
    for (const folder of folders) {
      const folderName = safeSegment(folder.name);
      if (seenNames.has(folderName)) continue;
      seenNames.add(folderName);
      uniqueFolders.push({ name: folderName });
    }
    const settled = await Promise.allSettled(uniqueFolders.map(async (folder) => {
      const folderName = folder.name;
      // V1.4.3（P2-3）：自动归档这条链路原来漏了保留目录名的检查 ——
      // 收藏夹真叫「001错误报告」时，视频会被写进报告目录里。
      if (collectionNameIsReserved(folderName)) {
        throw new Error(`收藏夹名「${folderName}」和插件自己用的目录重名，为免写乱本地文件，这次没有保存到本地。`);
      }
      const collectionFolder = await createDirectoryOrExplain(root, folderName);
      const recordFolder = await uniqueTimeFolder(collectionFolder, dateFolderName);
      try {
        // 4.9：先封面、后 txt（txt 即完成标记），失败时把整个目录清掉，不留半截记录
        await writeFile(recordFolder, COVER_FILE_NAME, cover);
        // buildInfo 也必须在这个 try 内：它一旦抛错，目录已经建出来了，
        // 下面的 catch 负责把这个空目录清掉（否则每失败一次就留一个空目录）
        await writeFile(recordFolder, "视频信息.txt", buildInfo({ ...data, metadata }, recordFolder.name, savedAt));
      } catch (error) {
        // 4.9.x：目录是上面 getDirectoryHandle(create:true) 刚建出来的，buildInfo 抛错时它已经在磁盘上了。
        // 1.7.16（destructive P1-1）：改成「有内容就留、空目录才删」—— 见 discardFailedRecord。
        await discardFailedRecord(collectionFolder, recordFolder.name, error);
        throw error;
      }
      return `${root.name}/${folderName}/${recordFolder.name}`;
    }));
    // allSettled 保持 uniqueFolders 的顺序，路径排列仍然与用户在收藏夹弹窗里的选择一致
    const savedFolders = [];
    const failures = [];
    settled.forEach((item, index) => {
      if (item.status === "fulfilled") savedFolders.push(item.value);
      else failures.push({ name: uniqueFolders[index].name, error: item.reason });
    });
    if (!savedFolders.length) throw failures[0]?.error || new Error("这次没有保存到任何收藏夹。");

    // 1.8.0：部分成功必须如实说 —— 磁盘上确实写进去了，整次报「归档失败」是假红灯
    // （用户报过「弹归档失败，但其实已经保存」）。把没成的收藏夹名字和原因摆出来。
    if (failures.length) {
      const failure = failures[0];
      await logError(failure.error, { metadata, folders });
      const partialMessage = `已保存到 ${savedFolders.length} 个收藏夹；另有 ${failures.length} 个没保存（${failures.map((item) => item.name).join("、")}）：${failure.error?.message || "未知错误"}`;
      try {
        await chrome.storage.local.set({ lastResult: { message: partialMessage, path: maskLocalUserPaths(savedFolders.join("\n")), createdAt: Date.now() }, lastError: null, pendingFavorite: null });
      } catch (storageError) {
        console.warn("写入最近结果失败（收藏已经保存成功）", storageError);
      }
      return { ok: true, partial: true, message: partialMessage, path: savedFolders.join("\n") };
    }

    const message = `已保存到 ${savedFolders.length} 个收藏夹。`;
    // 4.9.x：这时视频已经落盘（封面 + 视频信息.txt 都写完了），下面只是收尾。
    // 原来它裸 await 在同一个 try 里：storage 一抛错就被 catch 改写成「保存失败」，
    // 而磁盘上其实已经有一份完整记录。收尾必须自己兜住异常，不许改写已成功的结果。
    try {
      await chrome.storage.local.set({ lastResult: { message, path: maskLocalUserPaths(savedFolders.join("\n")), createdAt: Date.now() }, lastError: null, pendingFavorite: null });
    } catch (storageError) {
      console.warn("写入最近结果失败（收藏已经保存成功）", storageError);
    }
    return { ok: true, message, path: savedFolders.join("\n") };
  } catch (error) {
    // 1.8.21（补-1）：这条登记是「授权恢复后补存」的唯一凭据，写不进去就等于把用户
    // 这次收藏丢了 —— 所以失败要显式说出来。以前这里裸 await，一抛就把整条回应吞掉。
    let pendingRegistered = true;
    if (error?.message?.includes("写入授权已失效")) {
      // safeLocalSet 不抛错，只回 true/false：这里按返回值判「补存登记」有没有写成
      const registered = await safeLocalSet({ pendingFavorite: data }, "补存登记");
      if (!registered) {
        pendingRegistered = false;
        console.warn("登记补存失败（授权恢复后不会自动重试这条视频）");
      }
    }
    const retryHint = pendingRegistered ? "" : "；补存登记也没写成，请回 B 站重新收藏这条视频。";
    const saved = await logError(error, { metadata, folders });
    try {
      await chrome.storage.local.set({ lastResult: { message: `保存失败：${error?.message || "未知错误"}${retryHint}`, createdAt: Date.now() } });
    } catch (storageError) {
      console.warn("写入最近结果失败（这次保存本来就失败了）", storageError);
    }
    return {
      ok: false,
      message: error?.message || "保存失败。",
      details: (saved.reportPath ? `错误报告已保存：${storageReportLabel(saved.reportPath)}` : "错误报告保存在插件中；点击插件图标可查看并下载。")
        + (pendingRegistered ? "" : " 补存登记也没写成，请回 B 站重新收藏这条视频。")
    };
  }
}

// 1.8.0：把「排队等待」和「任务本身」拆成两根 promise。
// 4.9.x 那个期限（withQueueDeadline）本来是为了「导入暂停时队列停几个小时、排在后面的
// 请求既不执行也不报错」加的，可它当时拿到的是**整个任务**：一次归档 5 个收藏夹在真机上
// 要 60 多秒（Chrome 155 每次文件提交约 7 秒），必然撞上 30 秒期限 —— 界面收到
// 「本地队列正忙……这次没有执行」，而队列里那一份照常跑完、文件真的写进了磁盘。
// 现在期限只管 turn（等前面那些任务跑完）：超时就把这一棒**作废**，任务自己会跳过，
// 那句「这次没有执行」才不是假话；任务本体不再有上限。
const SAVE_TASK_ABANDONED = Symbol("save-task-abandoned");

function enqueueSaveTask(run) {
  const previous = saveQueue;
  let abandoned = false;
  const turn = previous.then(() => undefined, () => undefined);
  const task = turn.then(() => (abandoned ? SAVE_TASK_ABANDONED : run()));
  saveQueue = task.then(() => undefined, () => undefined);
  return {
    turn,
    task,
    abandon: () => {
      abandoned = true;
    }
  };
}

function saveFavoriteInOrder(data) {
  return enqueueSaveTask(() => saveFavorite(data));
}

// 4.9.x：给"排在串行队列后面"的非归档请求一个有上限的等待。
// 导入暂停时 saveQueue 会停在 importWaitIfPaused 上（可以停几个小时），排在后面的请求
// 永远不会被执行、也不会报错。这里超时只放弃**等待**：队列里那一个仍然会照常跑完，
// 只是界面能立刻收到一句解释，不至于永久停在"更新中"。
const WITH_QUEUE_DEADLINE_EXPIRED = Symbol("queue-deadline-expired");

async function withQueueDeadline(queue, timeoutMs, label) {
  let timer = null;
  const expired = new Promise((resolve) => {
    timer = setTimeout(() => resolve(WITH_QUEUE_DEADLINE_EXPIRED), timeoutMs);
  });
  try {
    return await Promise.race([queue, expired]);
  } catch (error) {
    throw new Error(error?.message || `${label}失败。`);
  } finally {
    clearTimeout(timer);
  }
}

// 1.4.2（P1-3）：导入进行中（尤其是暂停时）saveQueue 可能停几个小时，排在后面的
// 「这次收藏」「手动添加」「补存」会一直等到导入结束，界面就永久停在「保存中」。
// 给它们同一套上限：超时如实回 busy，让界面当场讲清楚"现在没做、等导入结束后重试"。
// 1.8.0：超时作废的是**这一棒**（见 enqueueSaveTask），所以队列里不会再有「界面说没执行、
// 磁盘上却写进去了」的那种假红灯。
/* 1.7.3：导入要跑几分钟，用户多半已经切走页面、弹窗也关了 —— 只把结果写进 storage
   等于没有提示（真机反馈：「导入结束后不显示已完成的弹窗，要点开插件才看到」）。
   这里补一条系统通知：成功、失败各一条。通知失败不影响导入结果，所以整段都吞异常。 */
function notifyImportOutcome(title, message) {
  try {
    if (!chrome.notifications || typeof chrome.notifications.create !== "function") return;
    const pending = chrome.notifications.create("", {
      type: "basic",
      iconUrl: "icon-128.png",
      title,
      message: String(message || "").slice(0, 300),
      silent: false
    });
    if (pending && typeof pending.catch === "function") pending.catch(() => {});
  } catch (error) {
    console.warn("系统通知发送失败（不影响导入结果）", error);
  }
}

async function runInSaveQueueWithDeadline(handle, label) {
  const waited = await withQueueDeadline(handle.turn, IMPORT_QUEUE_WAIT_TIMEOUT_MS, label);
  if (waited === WITH_QUEUE_DEADLINE_EXPIRED) {
    // 只放弃等待：把这一棒作废，任务自己会跳过，所以下面这句「这次没有执行」是真的
    handle.abandon();
    return {
      ok: false,
      busy: true,
      message: "本地队列正忙（很可能有一轮导入正在暂停或进行中），这次没有执行。等导入结束或取消后再试一次就好。"
    };
  }
  try {
    return await handle.task;
  } catch (error) {
    throw new Error(error?.message || `${label}失败。`);
  }
}
const IMPORT_INVALID_TITLES = new Set(["已失效视频", "该视频已失效"]);
const IMPORT_BV_TABLE = "FcwAPNKTMug3GV5Lj7EJnHpWsx4tb8haYeviqBz6rkCy12mUSDQX9RdoZf";
// attr → 「失效原因」文案。0 是「有效」，不在表里（importAttrReason 返回空串，调用方据此不写这一行）。
// 表外的取值**不猜成「其他」**——「其他」是 attr=1 的确切含义，把「版权原因」显示成「其他」
// 等于撒谎；宁可原样写出枚举值，至少还留着线索。
const IMPORT_ATTR_LABELS = { 1: "其他", 2: "版权原因", 3: "违规内容", 5: "视频已失效", 9: "UP主自行删除", 11: "已锁定" };

function importClean(value) { return String(value ?? "").replace(/\s+/g, " ").trim(); }
function importIsInvalidTitle(value) { return IMPORT_INVALID_TITLES.has(importClean(value)); }
// 收藏夹接口的 attr 是「删除原因」枚举：0 表示有效，非 0 都是失效。
// 取值表（与 bili-recovery 的 ATTR_LABELS、summary.js 一致）：
//   1 其他、2 版权原因、3 违规内容、5 视频已失效、9 UP主自行删除、11 已锁定。
// 实测 250 条有效视频 attr 全为 0，32 条失效视频 attr 全非 0（只有 1 和 9 两种），一一对应。
// 注意：1 和 9 都是奇数纯属巧合，别当位标志去判最低位 —— 那样 attr=2（版权原因）会漏判。
function importAttrIsInvalid(value) { return Number(value || 0) !== 0; }
// 一行写完是**故意的**：test 的 loadBackgroundFunctions 是按 `^}` 抠函数体的，
// 这里插一个多行函数会改变相邻函数被抠出来的边界，把 IMPORT_ATTR_LABELS 卷进两段代码里，
// 触发 "Identifier 'IMPORT_ATTR_LABELS' has already been declared"。
function importAttrReason(value) { const code = Number(value || 0); return code ? (IMPORT_ATTR_LABELS[code] || `原因(${code})`) : ""; }
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
   这里统一打上 rateLimited 标记，让整条导入链能识别并熔断。
   1.4.2（P1-8）：补上 -509 / -799 —— B 站"请求过于频繁"用的就是这两个码，
   只认 -412/-352 时它们会被当成普通失败，于是照样写出残缺记录、也照样继续打接口。 */
const IMPORT_RATE_LIMIT_CODES = new Set([-412, -352, -509, -799]);

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
  /* V1.4.3：后台侧必须自己带一个兜底超时。内容脚本那边（favorites-import.js）的超时只在
     消息送达时才生效；用户把收藏夹标签页关掉/刷新掉之后，回调可能再也不会触发，
     于是详情抓取（并发 = 1）的那个 await 永远挂着 —— 整轮导入卡死，点取消也没用，
     只能重载扩展。这里给消息回调加一层保险，晚一点（+2s）就按失败返回、退回后台直连。 */
  const guardMs = Math.max(1000, (Number(timeoutMs) || 15000) + 2000);
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };
    const timer = setTimeout(() => {
      finish(reject, new Error("B 站收藏夹页面没有响应（可能已关闭或正在刷新）。"));
    }, guardMs);
    chrome.tabs.sendMessage(tabId, { type: "bca-page-api-get", url, timeoutMs }, (response) => {
      const error = chrome.runtime.lastError;
      if (error) return finish(reject, new Error(error.message || "无法从 B 站收藏夹页面请求接口。"));
      if (!response) return finish(reject, new Error("B 站收藏夹页面没有响应接口请求。"));
      if (!response.ok) return finish(reject, new Error(response.message || "B 站页面接口请求失败。"));
      finish(resolve, { status: response.status, payload: response.payload });
    });
  });
}

async function biliImportApiGet(path, params = {}, timeoutMs = 15000, tabId = null) {
  // 唯一的出网口 —— 所有 B 站请求都在这里排队限速，见 biliThrottleWait 的说明
  await biliThrottleWait();
  const url = new URL(path, "https://api.bilibili.com");
  /* 1.7.11（facet-security P2-2）：这是全插件唯一带 cookie 的请求出口
     （下面 fetch 用 credentials: "include"），但以前从不校验解析出来的地址还在不在
     api.bilibili.com。今天 16 个调用点的 path 全是字面量，所以没有可利用路径 —— 但这是
     「下一行编辑就可能踩中」的纵深缺陷：只要将来有人传入 `//evil.example/x` 这种
     protocol-relative 形式的 path（URL 构造函数会把主机整个换掉），就会变成带着用户的
     B 站 cookie 访问任意主机。**这个断言不能删。** */
  if (url.origin !== "https://api.bilibili.com") {
    throw new Error("接口地址不在允许的域名里。");
  }
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
    isInvalid: media.is_invalid === true || importAttrIsInvalid(media.attr) || importIsInvalidTitle(title),
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
   上千条的收藏夹 → 每次几十个请求。缓存 5 分钟能把这一对请求数减半，
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
  // 1.4.2（P1-8）：撞风控时用它一次性跳出「页循环 + 轮次循环」，不再往下加压
  let rateLimitedAbort = false;
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
          // 1.4.2（P1-8）：撞上风控就别再重试了。原来这里不看错误类型连打三次，
          // 外面还有 3 轮翻页，等于在限流时继续加压。
          if (error?.rateLimited) break;
          if (attempt < 3) await importDelay(500 * attempt);
        }
      }
      if (!payload) {
        passFailed = true;
        if (lastError?.rateLimited) {
          rateLimitedAbort = true;
          recoveryErrors.push(`APP收藏夹接口：触发 B 站风控，已停止恢复扫描（${lastError?.message || "请求被拦截"}）；已经找到的失效视频照常写进记录，剩下的保持原样，过一会儿重新导入即可。`);
          break;
        }
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
    if (!missing.length || budgetExhausted || rateLimitedAbort) break;
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

  // 1.5.1（P1-13）：这里原来写死并发 3，绕过了 IMPORT_DETAIL_CONCURRENCY = 1（见 :1434）——
  // 等于「详情/恢复接口串行」这条安全线在这一段完全没生效：3 个 worker 各自连续打
  // 「视频资料 + 标签」两个接口，请求密度是主流程的 3 倍，而这段恰恰是失效视频恢复，
  // 本来就被风控盯得最紧（IMPORT_RECOVERY_MAX_REQUESTS 就是为它加的预算）。
  // 现在改成用常量：改并发只需要动 :1434 一处，不会再出现第二个真相。
  await importRunLimited(invalid, IMPORT_DETAIL_CONCURRENCY, async (item) => {
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
    // 4.9：这段恢复流程现在跟主流程一致、并发 IMPORT_DETAIL_CONCURRENCY（=1，见 :1434）。
    // 计数仍是近似值（一条可能打两次接口），但足以在真正被限流时熔断。
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
     导入前就在本地归档里的内容保持不动；
   - 本地没有同名收藏夹时全量导入，已有同名收藏夹时补齐缺失视频，
     并按新格式刷新数据不完整的旧记录。
   ========================================================================== */

// 归档里字段缺失会写成这些占位值，判断“数据是否完整”时一律当成空
const IMPORT_PLACEHOLDER_VALUES = new Set(["", "无", "未知", "-", "--", "—", "暂无", "/", "N/A", "n/a", "null", "undefined"]);

// 「占位」其实有两种，对「这条记录要不要再抓一次」来说意义完全相反（V1.2.8 区分）：
//   ① 符号类（`-` `--` `—` `/`）：B 站这段内容本来就是空的，接口就回一个破折号。
//      再抓一百次也还是同一个符号，刷新它除了白写一遍文件，没有任何意义。
//   ② 词类（`无` `未知` `暂无` `N/A` `null` …）：多半是上一次没取到（接口抽风、字段缺失），
//      值得下次导入时再试一次。
// 判断「记录该不该刷新」时只认 ②（见 importPlaceholderWorthRetry）；「这段文字算不算占位」
// 仍旧用 importIsPlaceholder 全量判断 —— 写文件、判收藏时间那些地方要的就是原来的含义。
const IMPORT_SYMBOL_PLACEHOLDER_VALUES = new Set(["-", "--", "—", "/"]);

const STAT_KEYS = ["view", "danmaku", "like", "coin", "favorite", "share"];
const STAT_LABELS = { view: "播放量", danmaku: "弹幕量", like: "点赞数", coin: "投硬币枚数", favorite: "收藏人数", share: "转发人数" };
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

// 「再抓一次有可能把它填回来吗」—— 只有词类占位值得重试，纯符号不值得。
// 别拿它去替换 importIsPlaceholder：下面 refreshImportedRecord 里
// `importIsPlaceholder(favoriteAtText)` 判的是「这个时间能不能解析」，纯符号也必须算占位，
// 否则一条收藏时间写着 `-` 的记录会被改写成"现在"。
function importPlaceholderWorthRetry(value) {
  const text = importClean(value);
  if (!IMPORT_PLACEHOLDER_VALUES.has(text)) return false;
  return !IMPORT_SYMBOL_PLACEHOLDER_VALUES.has(text);
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
   patchVolatileFields 与它的助手 statsSectionLines 现在只有一份，在 archive-core.js 里
   （1.7.33 合并：这里以前抄了一份副本，改一边不会红）。调用时走 BcaArchiveCore。
   它只覆盖 UP主粉丝数、互动数据、缺失的发布时间与失效标记，其余内容逐字不动。 */

/* ---------- 4.4：更新视频状态 ---------- */

const STATUS_INVALID_MARKER = "已失效视频（更新状态时检测到）";

/* 1.8.21（perf P2-8）：批量更新状态时一批最多 80 条，原来每条都 sendMessage 一次，
   接收端每条都要重新 querySelector 一遍进度行（DOM 写本身已有 500ms 节流，消息没有）。
   这里给 1500ms 窗口，窗口内只记住最后一条文案，收尾时补发，界面不会停在中途。 */
const STATUS_PROGRESS_BROADCAST_MS = 1500;
let statusProgressBroadcastAt = 0;
let statusProgressPending = "";

function sendStatusProgress(text, force = false) {
  const now = Date.now();
  if (!force && now - statusProgressBroadcastAt < STATUS_PROGRESS_BROADCAST_MS) {
    statusProgressPending = text;
    return;
  }
  statusProgressBroadcastAt = now;
  statusProgressPending = "";
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
    const patched = BcaArchiveCore.patchVolatileFields(text, { videoStatus: STATUS_INVALID_MARKER });
    if (patched === text) return "unchanged";
    await writeFile(directory, "视频信息.txt", patched);
    return "invalid";
  }

  // 1.8.3：只把接口真回了的字段放进来 —— patchVolatileFields 现在只更新这里出现的键，
  // 没回的字段保持原值，不会被写成「未知」。
  const stats = {};
  const stat = view?.stat || {};
  for (const key of STAT_KEYS) {
    if (stat[key] !== undefined && stat[key] !== null) stats[key] = stat[key];
  }
  const mid = String(view?.owner?.mid || "");
  // 1.8.6：这条路径是用户主动要最新数字，绕过 upFansStore 的记忆（fresh）
  const upFans = mid ? await fetchUpFans(mid, tabId, { fresh: true }) : "";

  // 之前被本功能标记过失效、现在又能正常访问的，把标记清掉
  const currentStatus = (text.match(/^视频状态：(.+)$/m)?.[1] || "").trim();
  const patched = BcaArchiveCore.patchVolatileFields(text, {
    upFans,
    stats,
    pubdateText: Number(view?.pubdate) > 0 ? formatPublishDate(view.pubdate) : "",
    videoStatus: currentStatus === STATUS_INVALID_MARKER ? "正常" : undefined
  });
  if (patched === text) return "unchanged";
  await writeFile(directory, "视频信息.txt", patched);
  return "updated";
}

/* 4.9.x 角标：与导入同样收口在一层薄包装里。inner 的收尾有四条 ——
     ① 没设本地文件夹 → throw　② 授权失效 → throw　③ 没有要更新的记录 → throw
     ④ 跑完 → return ok:true（failed 是"其中多少条没更成"）
   再加上写错误报告那一句自己抛错、连 return 都走不到的情况，全部由包装层兜住。 */
async function refreshVideoStatus(data, tabId = null) {
  markActivityStarted();
  try {
    const result = await refreshVideoStatusInner(data, tabId);
    markActivityFinished(result);
    return result;
  } catch (error) {
    markActivityFinished(null);
    throw error;
  }
}

async function refreshVideoStatusInner(data, tabId = null) {
  const root = await getRootHandle();
  if (!root) throw new Error("尚未设置本地备份文件夹，请先在插件中选择本地备份文件夹。");
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
  // 节流窗可能刚好吞掉最后一条；补发一次，别让进度行停在「37/80」
  if (statusProgressPending) sendStatusProgress(statusProgressPending, true);

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
    // 1.8.21（PRV-P2-4）：这个字段会被 library.js 拼进「完整报告」再进剪贴板，只回相对标签。
    reportPath: reportPath ? storageReportLabel(reportPath) : "",
    message: `本次处理 ${queue.length} 条：更新 ${updated} 条，新标记失效 ${markedInvalid} 条，无变化 ${unchanged} 条，失败 ${failed} 条。`
  };
}

/* ---------- 运行控制：暂停 / 继续 / 取消 ---------- */

let importRun = { active: false, paused: false, cancelled: false, waiters: [] };
// 4.9.x：已经排进队列、但还没真正开始的那一轮导入。claimImportRun 是在任务出队时才执行的，
// 单靠 importRun.active 挡不住"按钮连点两次"（第二次点击时第一轮还在队列里等着，
// 全局 active 仍是 false）。这个计数在收到消息的同步代码里就 +1，所以第二次点击必被拒。
let importPending = 0;
let importState = { running: false, paused: false, text: "", startedAt: 0, finishedAt: 0, summary: "" };
let upFansCache = new Map();

/* 1.8.6（P0-2）：UP 主粉丝数按 mid 记住。

   一条视频要 4 次请求，其中一次专为「UP主粉丝数」。同一轮导入里同一个 UP 主只问一次
   （upFansCache），可 service worker 一被回收，下一轮又从头问一遍 —— 一个 200 条的
   收藏夹常常只有十几个 UP 主，等于每轮白打一百多次请求。这里连「粉丝数 + 记录时间」
   一起存进扩展存储（7 天过期）：同一 UP 主 7 天内只问一次，命中就整条跳过那次请求。
   用户主动点「更新视频状态」要的是最新数字，走 fresh 参数绕过这份记忆。 */
const UP_FANS_STORAGE_KEY = "bcaUpFans";
const UP_FANS_TTL_MS = 7 * 24 * 60 * 60 * 1000;   // 7 天
const UP_FANS_MAX_ENTRIES = 2000;                  // 只记最近的，别让存储无限长
let upFansStore = null;        // Map<mid, { fans, at }>；null = 还没从存储读出来
let upFansStoreDirty = false;
let upFansPersistTimer = 0;

async function loadUpFansStore() {
  if (upFansStore) return upFansStore;
  upFansStore = new Map();
  try {
    const saved = await chrome.storage.local.get(UP_FANS_STORAGE_KEY);
    const stored = saved?.[UP_FANS_STORAGE_KEY];
    if (stored && typeof stored === "object") {
      for (const [mid, entry] of Object.entries(stored)) {
        const fans = String(entry?.fans || "");
        const at = Number(entry?.at) || 0;
        if (/^\d+$/.test(mid) && fans && Date.now() - at < UP_FANS_TTL_MS) upFansStore.set(mid, { fans, at });
      }
    }
  } catch (error) {
    console.warn("读不到记住的 UP 主粉丝数（这一轮按没记住处理）", error);
  }
  return upFansStore;
}

// 攒一下再写：一轮导入里几十个 UP 主，不必每问一个就写一次存储
function scheduleUpFansPersist() {
  if (upFansPersistTimer) return;
  upFansPersistTimer = setTimeout(() => {
    upFansPersistTimer = 0;
    persistUpFansStore().catch((error) => {
      console.warn("记住的 UP 主粉丝数没能存下来（下次再问一遍）", error);
    });
  }, 2000);
}

async function persistUpFansStore() {
  if (!upFansStoreDirty || !upFansStore) return;
  upFansStoreDirty = false;
  // 只留最近 UP_FANS_MAX_ENTRIES 个（Map 保持插入序，最旧的先丢）
  while (upFansStore.size > UP_FANS_MAX_ENTRIES) {
    upFansStore.delete(upFansStore.keys().next().value);
  }
  const payload = {};
  for (const [mid, entry] of upFansStore) payload[mid] = entry;
  await chrome.storage.local.set({ [UP_FANS_STORAGE_KEY]: payload });
}

async function rememberedUpFans(mid) {
  const store = await loadUpFansStore();
  const entry = store.get(mid);
  if (!entry) return "";
  if (Date.now() - entry.at >= UP_FANS_TTL_MS) {
    store.delete(mid);
    upFansStoreDirty = true;
    return "";
  }
  return entry.fans;
}

function rememberUpFans(mid, fans) {
  if (!fans || !upFansStore) return;
  upFansStore.set(mid, { fans, at: Date.now() });
  upFansStoreDirty = true;
  scheduleUpFansPersist();
}
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

const IMPORT_RUN_SESSION_KEY = "bcaImportRun";
/* P1-7（2026-10 审阅）：中断后要能「接着上次跑」，所以把断点里那句「停在哪」
   缩小成一条极小的记录放进 local —— 它只含收藏夹名、页号、三个计数与收藏夹 id，
   不含回滚日志、不含视频正文，重启浏览器后照样能读到（session 里的会被清掉）。 */
const IMPORT_RESUME_KEY = "bcaImportResume";                  // 正在进行的导入（断点 + 回滚日志）
// 必须明显小于 30 秒的回收阈值，留出一次请求的最长耗时（15 秒）的余量
const IMPORT_KEEPALIVE_INTERVAL_MS = 20000;
const IMPORT_RUN_PUBLISH_INTERVAL_MS = 15000;                   // 断点落盘节流（1.7.7：5000 → 15000，会话快照最多 2MB，别每 5 秒序列化一次）
// 4.9.x：串行队列（saveQueue）的等待上限。导入暂停时队列会一直停在 importWaitIfPaused 上，
// 排在它后面的请求原本会永久挂着、既不执行也不报错（收藏库的「更新视频状态」因此
// 永远显示"更新中"）。超过这个时长就明确回一句"队列被占用"，而不是无限等待。
// 取 30 秒是刻意的：service worker 的空闲回收阈值就是约 30 秒。
const IMPORT_QUEUE_WAIT_TIMEOUT_MS = 30000;
// V1.4.3（P2-6）：以前这里还有一个 IMPORT_STALE_STATE_MS = 90000，用来判断
// local 里的 importState 是不是"被回收前的残影"。现在判据换成了 session 里有没有
// active 快照（见 importReconcileState），残影可以立刻复位，不必再等 90 秒。
// 快照只记名字。回滚真正用的原文在内存 journal 里（`entry.text`），快照里那份正文副本
// 从来没有人读 —— 1.8.21（perf P2-2）把原先最多 1MB 的「没人读的副本」整段删掉：
// 它既占 chrome.storage.session 配额，又让人误以为中断后还能靠快照还原内容。

// 连续命中风控的条目数（连续 N 条都撞限流就中止整轮导入，阈值常量见导入区块）
let importRateLimitStreak = 0;
let importKeepAliveAt = 0;
let importRunPublishAt = 0;
// 1.8.7（P2-7）：上一次真正写进 session 的内容指纹（不含 updatedAt），内容没变就不重复写
let importRunPublishedMeasured = "";
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

/* 1.7.2：把一份"要排队等"的任务裹上保活。
   手动收藏 / 添加视频 / 补存都要排在串行队列后面等 —— 队列里那一个可能是几分钟的导入
   （暂停时更久）。MV3 只认"扩展 API 调用 / 事件"来重置空闲回收，纯 Promise、await、
   setTimeout 都不算，所以等待期间必须自己定期调一次 API。不保活的后果在真机上已经出现：
   提示卡停在「正在归档视频…」，service worker 被回收、回调永远不来、文件也没落盘。 */
async function withKeepAlive(task, reason) {
  let stopped = false;
  let timer = 0;
  const tick = () => {
    if (stopped) return;
    // keepServiceWorkerAlive 自带节流：这里按半个间隔轮询，正好让它每轮放行一次
    keepServiceWorkerAlive(`${reason}-wait`).finally(() => {
      if (!stopped) timer = setTimeout(tick, Math.max(1000, Math.floor(IMPORT_KEEPALIVE_INTERVAL_MS / 2)));
    });
  };
  timer = setTimeout(tick, Math.max(1000, Math.floor(IMPORT_KEEPALIVE_INTERVAL_MS / 2)));
  try {
    return await task;
  } finally {
    stopped = true;
    clearTimeout(timer);
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
    modifiedFiles: [...(journal?.modifiedFiles || [])].map((entry) => ({
      collection: entry.collectionHandle?.name || "",
      directory: entry.directoryHandle?.name || "",
      name: entry.name
    }))
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

function resetImportRunSnapshot(journal, folderIds = []) {
  importRunSnapshot = {
    active: true, paused: false, cancelled: false,
    folderIds: (Array.isArray(folderIds) ? folderIds : []).map(String),
    startedAt: importState.startedAt || Date.now(), updatedAt: Date.now(),
    rateLimitStreak: 0, text: importState.text || "",
    cursor: { folder: "", page: 0, saved: 0, folderTotal: 0 },
    counts: { imported: 0, refreshed: 0, skipped: 0, failed: 0, total: 0 },
    journal: importJournalSnapshot(journal)
  };
  importRunPublishAt = 0;
  importRunPublishedMeasured = "";
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
  /* 1.8.7（P2-7）：force 只该用在「阶段真的变了」的地方，可它每次都是
     storage.session.set —— 而写 session 会重置 service worker 的空闲计时器。
     这里再加一道「内容没变就别写」：把 updatedAt 抹成 0 之后比指纹，
     指纹一样说明除了时间戳什么都没变，这一笔写下去没有任何人能看到区别。 */
  const measured = JSON.stringify({ ...importRunSnapshot, updatedAt: 0 });
  if (measured === importRunPublishedMeasured) return;
  importRunPublishedMeasured = measured;
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
  importRunPublishedMeasured = "";
  // 排进同一条写入链：否则排队中的快照可能在 remove 之后落地，留下"幽灵活动记录"
  importRunPublishChain = importRunPublishChain
    .then(() => chrome.storage.session.remove(IMPORT_RUN_SESSION_KEY))
    .catch(() => {});
  await importRunPublishChain;
}

// P1-7：把「上次停在哪」写成一条可跨重启的小记录（只有收藏夹名 / 页号 / 计数 / 收藏夹 id）
async function writeImportResume(snapshot) {
  const cursor = snapshot?.cursor || {};
  const counts = snapshot?.counts || {};
  const folder = String(cursor.folder || "");
  if (!folder) return;
  const folderIds = Array.isArray(snapshot?.folderIds) ? snapshot.folderIds : [];
  const record = {
    folder,
    page: Math.max(1, Number(cursor.page) || 1),
    saved: Math.max(0, Number(cursor.saved) || 0),
    imported: Math.max(0, Number(counts.imported) || 0),
    total: Math.max(0, Number(counts.total) || 0),
    folderIds,
    at: Date.now()
  };
  try {
    await chrome.storage.local.set({ [IMPORT_RESUME_KEY]: record });
  } catch (error) {
    console.warn("断点记录没写进去（这次中断后不会出现「继续上次导入」）", error);
  }
}

async function clearImportResume() {
  try {
    await chrome.storage.local.remove(IMPORT_RESUME_KEY);
  } catch (error) {
    console.warn("断点记录没清掉（下次可能提示一个已经过期的「继续上次导入」）", error);
  }
}

/* V1.4.2：这一轮导入"已经跑到底了"，只是还没把 session 键删掉。
   三种收尾（成功 / 取消 / 风控中止）都必须先走这里，再删键。

   不这样做的后果是一个很难发现、但很严重的窗口：
   importRun.active 在收尾一开始就被置成 false，而快照落盘、写报告、写 lastResult 这些 await
   还要跑几百毫秒到几秒 —— 浏览器正好在这几百毫秒里被关掉，session 里留下的就是一份 active:true 的快照。
   下次启动时它会被当成「被回收打断的那一轮」，而它其实**整轮都成功了**。
   最坏的结果是：有人照着「可回滚」的提示点一下，把整轮几万条归档递归删掉。

   先把 active:false 写进 session，再删键：中间被打断时留下的也是一份"已完成"的快照，
   不会被误判成中断。（键仍然要删，否则下一次的孤儿判定会看到一份旧记录。） */
async function finishImportRunSnapshot() {
  // 1.7.10（P2-5）：这一轮结束了，把跨上下文闸门放掉。放在最前面，保证任何一条返回路径
  // 都会经过它（下面第一行就可能提前 return）。
  await clearArchiveWriteLock("import");
  if (!importRunSnapshot) return clearImportRunSnapshot();
  importRunSnapshot = {
    ...importRunSnapshot, active: false, paused: false, finished: true, finishedAt: Date.now()
  };
  importRunPublishAt = Date.now();
  try {
    await writeImportRunSnapshot();
  } catch (error) {
    // 收尾快照写不进去：中断记录会停在上一轮的状态（不会误判成可回滚，但会不准）。
    console.warn("收尾快照没写进去（中断记录可能停在上一轮）", error);
  }
  return clearImportRunSnapshot();
}

function importInterruptedSummary(snapshot) {
  const cursor = snapshot?.cursor || {};
  const counts = snapshot?.counts || {};
  const parts = [];
  if (cursor.folder) parts.push(`停在「${cursor.folder}」第 ${Number(cursor.page) || 1} 页`);
  if (Number(cursor.saved) > 0) parts.push(`该收藏夹已写入 ${Number(cursor.saved)} 条`);
  const created = snapshot?.journal?.createdRecords?.length || 0;
  // V1.4.2：这里原来写「（回滚日志已保存在本次浏览器会话中）」。那是句空头承诺：
  // 回滚入口没有任何界面调用它，而且日志只在 session 里、浏览器一重启就没了。
  // 现在改成陈述事实——中断时写进去的记录本身就是完整的。
  if (created) parts.push(`本次共新建 ${created} 个视频目录，它们都是完整记录，重新导入会跳过`);
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
  // P1-7：写一份跨重启的断点，让弹窗能给出「继续上次导入」
  await writeImportResume(snapshot);
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
  // V1.4.2：快照还在、但 active 不是 true —— 上一轮已经跑到收尾了（成功 / 取消 / 风控中止都会这样），
  // 只是删键之前进程没了。它不是"中断的那一轮"：不能宣告中断，更不能把整轮日志留成可回滚的一份。
  // 这里只把界面状态复位，然后清掉这份快照。
  if (leftover && leftover.active !== true) {
    await clearImportRunSnapshot();
    if (storedState?.running === true) {
      importState = { ...importState, running: false, paused: false, updatedAt: Date.now() };
      await chrome.storage.local.set({ importState }).catch(() => {});
    }
    return { active: false, reset: false };
  }
  const orphan = leftover?.active === true;
  // V1.4.3（P2-6）：浏览器重启后 chrome.storage.session 会被清空，只剩 local 里一份
  // running:true 的残影。原来要等 updatedAt 超过 IMPORT_STALE_STATE_MS（90 秒）才复位，
  // 这 90 秒里弹窗照旧显示"导入中"、暂停/取消按钮都在，点了却只回"当前没有正在进行的导入"。
  // 其实判据可以更紧：内存里的 importRun.active 才是"这一轮真的在跑"（上面刚判过），
  // 而 session 里没有 active 快照就说明上一轮的进程已经没了 —— 立刻复位，不必等 90 秒。
  if (!orphan) {
    if (storedState?.running === true) {
      importState = { ...importState, running: false, paused: false, updatedAt: Date.now() };
      await chrome.storage.local.set({ importState }).catch(() => {});
    }
    return { active: false, reset: false };
  }
  await importAnnounceInterruption(leftover);
  // V1.4.2：以前这里还会把这份快照挪到 bcaInterruptedImport 键上留作"可回滚"的一份，
  // 但没有任何界面会去回滚它（见 importInterruptedSummary 上方的说明），所以不再留。
  await clearImportRunSnapshot();
  return { active: false, reset: true };
}

// service worker 每次启动都会重新求值这个模块：此刻内存里的 importRun 一定是空的，
// 所以 session 里 active 的记录只可能来自"上一次被回收打断的导入"。
async function importRecoverInterruptedImport() {
  if (importRun.active) return false;
  const snapshot = await readImportRunSnapshot();
  if (!snapshot) return false;
  // V1.4.2：收尾阶段被回收留下的快照（active 已经是 false）—— 它代表的是一轮已经跑完的导入，
  // 清掉就好，绝不能当成中断的那一轮。
  if (snapshot.active !== true) { await clearImportRunSnapshot(); return false; }
  if (importRun.active) return false;                 // 期间已经启动了新导入，别动它
  const current = await readImportRunSnapshot();      // 二次确认：快照没被新导入替换掉
  if (current?.startedAt !== snapshot.startedAt) return false;
  // V1.4.2：不再把快照挪到 bcaInterruptedImport（那个键没有任何读者了），
  // 但中断报告文件照写 —— 用户需要知道停在哪、已经写了多少。
  await clearImportRunSnapshot();
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
    // needsReauth 恒为 false：中断报告是"service worker 被回收"，与文件夹授权无关。
    // 显式写出来是为了让这个字段在每条 lastError 上都存在，前台不必区分"旧数据"和"这次没失效"。
    lastError: { report: maskLocalUserPaths(report.slice(0, 16000)), reportPath: storageReportLabel(reportPath), createdAt: Date.now(), needsReauth: false }
  }).catch(() => {});
  return true;
}

let importStatePublishedText = "";

/* 1.7.12（perf PF-5）：进度文案逐条变，指纹挡不住「每条都想写」，所以节流窗口本身也要放宽。
   500 ms → 1500 ms 之后，一轮 3000 条的导入最多写 1/3 的次数；running / paused / finishedAt
   这些关键状态本来就走 force=true 立即落盘，不会被这个窗口推迟。
   报告里「更长远的做法」（text 挪去 chrome.storage.session、local 只留小字段）没有采纳：
   popup.js:504 / popup.js:972（onChanged）与 library.js:2229 都是从 storage.local 读整包，
   拆成两处读会多出一条只在写入端成立的约定，收益（KB 级 → 字节级）不抵这份耦合。 */
const IMPORT_STATE_PUBLISH_INTERVAL_MS = 1500;

// 进度更新很密集，写 storage 要节流；关键状态变化用 force 立即落盘
function publishImportState(patch, force = false) {
  importState = { ...importState, ...patch, updatedAt: Date.now() };
  const now = Date.now();
  if (!force && now - importStatePublishAt < IMPORT_STATE_PUBLISH_INTERVAL_MS) return;
  // active 是"这一次是否真的有活动导入"的即时答案（由 get-status / bca-import-probe 填），
  // 只在内存和响应里有效，不落盘——落盘就会变成下一个需要探活复位的"残影"。
  const { active: _active, ...persisted } = importState;
  /* 1.7.7（P1-3）：内容没变就不写、也不广播。导入期间原来是每 500ms 一次
     chrome.storage.local.set —— 每次写入都会重置 service worker 的 30 秒空闲计时器，
     SW 于是整轮导入都回收不了（而 text/running/paused 实际几十秒才变一次）。 */
  const text = JSON.stringify(persisted);
  if (text === importStatePublishedText) return;
  importStatePublishedText = text;
  importStatePublishAt = now;
  chrome.storage.local.set({ importState: persisted }).catch(() => {});
}

/* 1.8.21（perf P1-3）：广播也要节流。逐条导入时每条都会 importProgress()，而它是
   chrome.runtime.sendMessage —— 接收端每次都要重新走一遍 i18n 与 DOM 更新。storage 侧
   1.8.7 已按 1500ms 节流，这里给广播一个 500ms 的窗口：窗口内只更新本地状态，不发消息；
   阶段边界与每个收藏夹的最后一条传 force，保证界面不会停在一个过期的数字上。 */
const IMPORT_PROGRESS_BROADCAST_MS = 500;
let importProgressBroadcastAt = 0;

function importProgress(text, force = false) {
  publishImportState({ text });
  const now = Date.now();
  if (!force && now - importProgressBroadcastAt < IMPORT_PROGRESS_BROADCAST_MS) return;
  importProgressBroadcastAt = now;
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
  /* 1.7.0（批次 B / P1）：四个还原循环原来全是 `catch (_) {}` —— 还原失败没有任何记录，
     界面照旧宣告「导入前的本地内容没有被改动」。这里逐条记下来，交给调用方写进终态文案
     （用户至少知道「有几项没还原回去、分别是哪些」）。 */
  const failures = [];
  const noteFailure = (what, error) => {
    failures.push(`${what}：${(error && error.message) || error || "未知错误"}`);
  };
  // 先删本次新建的记录目录，再把被改写的文件还原，最后清掉本次新建的空收藏夹
  /* 1.8.22（old-p3 destructive P3-3）：回滚上千个目录时原来全程只有一句「正在取消并回滚」，
     界面看着像卡死。这里按「已处理 / 总数」报进度（publishImportState 自带 1.5 秒节流，
     不会把 storage 打满），并顺带保活 —— 纯本地长循环不加保活，SW 可能被回收。 */
  const totalSteps = journal.createdRecords.length + journal.modifiedFiles.length
    + journal.addedFiles.length + journal.createdCollections.length;
  let doneSteps = 0;
  const stepRollback = async () => {
    doneSteps += 1;
    if (doneSteps % 25 === 0 || doneSteps === totalSteps) {
      publishImportState({ text: `正在回滚本次导入：已处理 ${doneSteps}/${totalSteps} 项…` });
    }
    await keepServiceWorkerAlive("rollback");
  };
  for (const entry of [...journal.createdRecords].reverse()) {
    await stepRollback();
    try { await entry.collectionHandle.removeEntry(entry.name, { recursive: true }); removedRecords += 1; }
    catch (error) { noteFailure(`撤回新建的 ${entry.name}`, error); }
  }
  for (const entry of [...journal.modifiedFiles].reverse()) {
    await stepRollback();
    try { await writeFile(entry.directoryHandle, entry.name, entry.text); restoredFiles += 1; }
    catch (error) { noteFailure(`还原 ${entry.name}`, error); }
  }
  for (const entry of [...journal.addedFiles].reverse()) {
    await stepRollback();
    try { await entry.directoryHandle.removeEntry(entry.name); removedFiles += 1; }
    catch (error) { noteFailure(`删除新增的 ${entry.name}`, error); }
  }
  for (const entry of [...journal.createdCollections].reverse()) {
    await stepRollback();
    try {
      let empty = true;
      for await (const child of entry.handle.values()) { void child; empty = false; break; }
      if (!empty) continue;
      await entry.parentHandle.removeEntry(entry.name, { recursive: true });
      removedCollections += 1;
    } catch (error) { noteFailure(`删除空收藏夹 ${entry.name}`, error); }
  }
  return { removedRecords, restoredFiles, removedCollections, removedFiles, failures };
}

/* V1.4.2：删掉了 rollbackInterruptedImport()。
   它原本是「回滚被回收打断的那一次导入」，但没有任何界面调用它（全仓只有一条
   bca-import-rollback-recovered 消息分支，而那条分支自己也没有调用者），
   但用户会被明确告知「回滚日志已保存在本次浏览器会话中」——等于承诺了一个点不到的功能。
   而且它还是 P0 的引信：整轮成功导入被误判成中断时，点一下就会把整轮归档递归删光。

   中断的那一轮不需要回滚：已经写进去的每条记录都带封面与视频信息.txt，是完整记录，
   重新导入会按 BV/av 号跳过它们。取消（用户主动）仍然会回滚，那条路走的是 rollbackImport。 */

/* ---------- 已有记录的读取与“是否需要刷新”判断 ---------- */

// 既返回去重用的标识符，也返回每条记录的原文，供“更新”模式判断哪些记录要按新格式重写
async function readExistingImportRecords(collection) {
  const identifiers = new Set();
  const records = new Map();
  for await (const entry of collection.values()) {
    if (entry.kind !== "directory") continue;
    // 1.4.2（P1-4）：这个循环只读本地文件、一次网络请求都没有，几千条记录读下来
    // 中间可以静默好几分钟 —— MV3 只在"扩展 API 调用/事件"时重置空闲回收计时器，
    // 纯 await 不算。所以每圈都叫一次（函数内部按 20 秒节流，不会真打满）。
    await keepServiceWorkerAlive("scan");
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
  // V1.2.8：这里用 importPlaceholderWorthRetry 而不是 importIsPlaceholder。
  // 起因是真机上的反馈 —— 一个 6 条的收藏夹，明明只有 3 条资料不完整，却每次导入都报
  // 「更新 3」。查下来是那 3 条的 B 站简介本来就是空的、接口回的就是一个 `-`：占位不假，
  // 但"再抓一次"改变不了任何东西，于是每导入一次就白写一遍文件、计数也永远停在 3。
  // 现在只有「词类占位」（未知/无/暂无…，多半是上次没取到）才当"不完整、值得重试"。
  return importPlaceholderWorthRetry(tagsLine)
    || importPlaceholderWorthRetry(description)
    || importPlaceholderWorthRetry(pubdate)
    || !/^UP主粉丝数：/m.test(text)
    || !/【互动数据】/.test(text)
    // 4.9.x：写入端在封面候选全失败时会写 COVER_PENDING_LINE 占位标记，
    // 这里必须认它。否则"目录里有一张占位图"会被当成封面完好，这条记录永远不会再补真封面。
    || text.includes(COVER_PENDING_LINE)
    // 4.9：目录里没有封面同样算"不完整"。coverMissing 由 importRecordNeedsRefresh()
    // 在本函数的文本判据都通过之后才去查一次盘并缓存在 record 上，正常记录不额外付 IO。
    // 背景：旧版本是"先写 视频信息.txt、后写 封面.png"，中途被杀就会留下只有 txt 的半截目录，
    // 以前它被判成"已存在、跳过"，这条视频就永远没有封面（收藏库还会把它当不完整记录隐藏）。
    || record?.coverMissing === true;
}

// 查一次"这条记录的目录里到底有没有封面"，结果缓存在 record 上（同一次导入只查一次）
// 1.8.6（P0-2）：只缺粉丝数吗？—— 给文本补一行假的「UP主粉丝数」，如果这样
// recordNeedsRefresh 就不再要求刷新，说明缺的确实只有它（判断仍然只有 recordNeedsRefresh 一处）。
function recordNeedsFansOnly(record) {
  const text = String(record?.text || "");
  if (!text) return false;
  if (/^UP主粉丝数：/m.test(text)) return false;
  return !recordNeedsRefresh({ text: text + "\nUP主粉丝数：0" });
}

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

// 「信息保存于：…」是 buildInfo 用 savedAt 现写的时间戳（见 background.js 里那一行模板），
// 每次运行都不一样。比对"这条记录的内容有没有真的变化"之前必须先把它抹掉，否则文件永远"变了"：
// 每导入一次就给这些记录重写一遍时间戳，用户看到的就是"明明没变，却每次都报更新 N"。
function importStableInfoText(text) {
  return String(text || "").replace(/^信息保存于：.*$/m, "");
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
  // coverMissing 还没算过就在这里补算一次——只有"需要刷新"的记录会走这条路径，正常记录不受影响。
  if (record.coverMissing === undefined) await recordMissingCover(collection, record);
  let cover = null;
  if (record.coverMissing) {
    // 抓不到真封面时会写入"封面暂不可恢复"占位图——和导入链路保持一致：
    // library.js 把没有封面的记录当成不完整记录直接跳过，宁可先写占位图让记录可见。
    // 但占位图必须留下标记（见 COVER_PENDING_LINE），否则这条记录会被当成封面完好、永不再补。
    cover = await loadImportCover([
      ...(item.coverCandidates || []),
      ...(item.cover ? [{ url: item.cover, source: "收藏夹接口" }] : [])
    ], item.isInvalid);
    noteCoverOutcome(cover);
  }
  const metadata = importMetadata(item, cover);
  metadata.favoriteTimeUnknown = favoriteTimeUnknown;
  // 标记按"这次实际拿到了什么"决定去留：拿到真封面就清掉旧的待补标记，
  // 仍然只有占位图（或本来就缺封面但这次也没补上）就继续保留待补标记。
  metadata.coverMissing = cover ? cover.placeholder === true : record.coverMissing === true;
  // 1.8.3（存档完好性）：整篇重建的结果先过一道「不许降级」合并。
  // 资料接口 / 标签接口任一失败时，重建出来的是一堆「未知」——直接写下去就是把真实的
  // 简介、标签、发布时间、分区、时长、互动数据换成占位符，而且导入跑完之后没有退路。
  const rebuiltText = buildInfo({ metadata, favoriteAt: favoriteAt.getTime() }, record.directory, new Date());
  const refreshedText = BcaArchiveCore.mergeInfoText(original, rebuiltText);
  let touched = false;
  if (cover) {
    // 先写封面、后写 txt：txt 始终是"这条记录写完了"的完成标记
    journal?.addedFiles.push({ collectionHandle: collection, directoryHandle: directory, name: COVER_FILE_NAME });
    await writeFile(directory, COVER_FILE_NAME, cover.blob);
    record.coverMissing = false;
    touched = true;
  }
  // V1.2.8：只认"真变化"。除「信息保存于」那一行以外完全一样，就不动文件、也不算更新 ——
  // 时间戳停在上一次资料真正变化的时候，比"每次摸一下都算一次更新"诚实。
  // 真变化（B 站补了简介、播放量涨了、封面补上了）照旧写。
  if (importStableInfoText(refreshedText) !== importStableInfoText(original)) {
    journal.modifiedFiles.push({ collectionHandle: collection, directoryHandle: directory, name: "视频信息.txt", text: original });
    await writeFile(directory, "视频信息.txt", refreshedText);
    touched = true;
  }
  return touched;
}

/* ---------- 视频详情抓取 ---------- */

async function fetchUpFans(mid, tabId = null, options = {}) {
  const key = String(mid || "").trim();
  if (!/^\d+$/.test(key)) return "";
  if (upFansCache.has(key)) return upFansCache.get(key);
  // 1.8.6：7 天内问过就直接用记住的，这一次 /x/relation/stat 整个省掉。
  // options.fresh（「更新视频状态」那条用户主动路径）绕过它，取的是当下的数字。
  if (options.fresh !== true) {
    const remembered = await rememberedUpFans(key);
    if (remembered) {
      upFansCache.set(key, remembered);
      return remembered;
    }
  }
  let fans = "";
  try {
    const data = await biliImportApiGet("/x/relation/stat", { vmid: key }, 9000, tabId);
    if (data && Number.isFinite(Number(data.follower))) fans = String(Number(data.follower));
  } catch (_) { fans = ""; }
  upFansCache.set(key, fans);
  rememberUpFans(key, fans);
  return fans;
}

// 一条视频的完整资料：简介、发布时间、分区、时长、UP 主、互动数据、标签、粉丝数
async function fetchVideoDetail(item, tabId = null) {
  const detail = { stats: {}, errors: [] };
  /* 1.8.6（P0-2）：这条记录只缺「UP主粉丝数」时，只补 /x/relation/stat 这一下 ——
     view 与 tags 都不打（4 次请求里省掉 2 次）。刷新写盘仍然过 mergeInfoText，
     没抓到的简介/标签不会被写成「未知」（1.8.3 的保证）。 */
  if (item.fansOnly === true && item.authorMid) {
    const fans = await fetchUpFans(item.authorMid, tabId);
    if (fans) detail.upFans = fans;
    return detail;
  }
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
        for (const key of STAT_KEYS) {
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
  const failures = [];
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
      return { blob, source: candidate.source, placeholder: false, failures, candidateCount: unique.length };
    } catch (error) {
      // V1.4.6：封面失败原来是完全静默的（这里 catch 掉就没了），真机上出现「整批封面变占位图」
      // 时报告里一个字都没有，只能靠猜。现在把候选地址和原因留下来，报告里会写一行。
      failures.push({ url: candidate.url, reason: error?.message || String(error) });
      console.warn("[哔哩藏库] 封面候选失败：", candidate.url, error?.message || error);
    }
  }
  // 走到这里说明所有候选都失败了：返回的是一张「封面暂不可恢复」占位图。
  // placeholder 必须传出去 —— 调用方要据此在 视频信息.txt 里写 COVER_PENDING_LINE，
  // 否则占位图会被当成真封面，这条记录再也不会尝试补图。
  return { blob: await importedUnknownCover(), source: "未知", placeholder: true, failures, candidateCount: unique.length };
}

/* V1.4.6：把「封面为什么没取到」累积起来，一个收藏夹收尾时写进报告一行。

   之前 loadImportCover 把每个候选的异常都吞掉，用户遇到的「导入完封面全是占位图」在报告里
   没有任何痕迹 —— 只能靠读代码猜。现在区分三种情况：候选地址压根没拿到、候选全被域名白名单
   跳过、以及每个候选各自的失败原因（HTTP 状态 / 超时 / 解码失败…）。 */
const importCoverFailures = [];
function noteCoverOutcome(cover) {
  if (!cover || cover.placeholder !== true) return;
  const failures = Array.isArray(cover.failures) ? cover.failures : [];
  if (failures.length) {
    for (const failure of failures) importCoverFailures.push(failure);
    return;
  }
  importCoverFailures.push({
    url: "",
    reason: cover.candidateCount ? "候选地址全部被跳过（域名不在白名单里）" : "没有拿到封面候选地址"
  });
}

function importCoverFailureLine() {
  if (!importCoverFailures.length) return "";
  const counts = new Map();
  for (const failure of importCoverFailures) counts.set(failure.reason, (counts.get(failure.reason) || 0) + 1);
  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
  const reasons = [...counts.entries()].sort((left, right) => right[1] - left[1]).slice(0, 3)
    .map(([reason, count]) => `${reason}（${count} 次）`).join("；");
  const sample = importCoverFailures.find((failure) => failure.url)?.url || "";
  importCoverFailures.length = 0;
  return `封面没取到 ${total} 次：${reasons}${sample ? `；例：${sample}` : ""}`;
}

async function readExistingImportIdentifiers(collection) {
  const identifiers = new Set();
  for await (const entry of collection.values()) {
    if (entry.kind !== "directory") continue;
    // 1.4.2（P1-4）：同上，纯本地读取的循环也要保活（内部按 20 秒节流）
    await keepServiceWorkerAlive("scan");
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
    } catch (error) {
      // 这一条读不出来就当它不存在：那条记录可能被当成新视频再导入一次。
      console.warn("读已有归档的 BV / av 号失败（那条记录可能被重复导入）", error);
    }
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
    // 封面是占位图（候选全失败）时记下来：buildInfo 据此写 COVER_PENDING_LINE，
    // 后续导入才会重新尝试给这条记录补真封面
    coverMissing: cover?.placeholder === true,
    // 「失效原因」要靠它才写得进 视频信息.txt：buildInfo 读的是 metadata.attr，
    // 而 metadata 是这个函数现造的 —— 不在这里带一手，原因就永远只停在内存里。
    attr: Number(item.attr || 0),
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
   上千条一条都没命中（真机报告里写着「限定最近 3 天：命中 0 条」）。 */
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

/* 这条解析结果够不够格覆盖本地已有的记录。

   为什么不能直接用 importUsefulTitle：
     · 上面的流程里有这么一句
         if (!item.isInvalid && !importUsefulTitle(item.title)) item.title = "未知";
       标题不可用时会被**换成「未知」**，而「未知」是"非空、且不在已知失效标题名单里"，
       于是 importUsefulTitle("未知") 返回 true —— 守卫反而认为"信息可用"，把它放过去。
     · 真机上的完整链条：
         标题不可用 → item.title = "未知" → 守卫放行 → refreshImportedRecord
         → importMetadata → buildInfo 整篇重建 → 本地标题被写成「未知」
       V1.1.20 只挡 isInvalid、V1.1.21 改用 importUsefulTitle，两次都栽在同一个地方。

   所以这里明确把「未知」判成不可信：**占位符不是数据**。 */
function importItemIsTrustworthy(item) {
  if (item?.isInvalid) return false;
  const title = importClean(item?.title);
  return !!title && title !== "未知" && importUsefulTitle(title);
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

/* ---------- 1.5.0：本地数据库（003database/database.json） ----------
   纯逻辑在 stats-core.js（顶部 import）。数据库只记「一条视频一条记录」，
   统计全部现算 —— 所以这里只做两件事：把刚存下的记录追加进去、把算好的快照
   塞进 chrome.storage.local.bcaStats 给宠物挂件和数据统计页读。
   数据库坏了、没权限、写不进去都不影响归档本身 —— 归档才是这个插件的正事。 */
const statsPendingRecords = [];
/* 1.8.6（P0-3）：统计库改成「攒够一批再写」。

   原来每个收藏夹跑完就 flush 一次，而一次 flush 是「读整个 database.json →
   JSON.parse → normalizeDatabase(全库) → JSON.stringify(全库) → 整份写回」。
   十几条的小收藏夹也要把几百 KB 的库读写一遍，一轮导入下来几十次。
   现在攒够 200 条或过了 30 秒才落一次，导入收尾再补一次；被取消的最多丢这最后一批
   —— 统计库是派生数据，重新扫描收藏库就能补回来（归档文件本身不受影响）。 */
const STATS_FLUSH_EVERY_RECORDS = 200;
const STATS_FLUSH_EVERY_MS = 30 * 1000;
let statsPendingSince = 0;

function statsFlushDue() {
  if (!statsPendingRecords.length) return false;
  if (!statsPendingSince) statsPendingSince = Date.now();
  return statsPendingRecords.length >= STATS_FLUSH_EVERY_RECORDS
    || Date.now() - statsPendingSince >= STATS_FLUSH_EVERY_MS;
}

// 1.5.1（P1-12）：坏库留档的文件名前缀。
// File System Access API 没有 rename，所以「改名留档」只能拆成两步：先把原文原样写进
// 这个文件，成功之后才删掉原文件（见 archiveBrokenStatsDatabase / readStatsDatabase）。
// 1.7.10（facet-destructive P2-4）：原来是固定名 database.bad.json —— 坏文件通常只坏一次，
// 但「第二次损坏把第一次的现场整份覆盖掉」是真的会丢证据，而坏在哪正是要查的东西。
// 改成带本地时间戳，并且只保留最近 STATS_DATABASE_KEEP_BACKUPS 份，和错误报告目录的
// REPORT_KEEP_FILES 同一个思路：不会在用户的备份目录里慢慢攒垃圾。
const STATS_DATABASE_BACKUP_PREFIX = "database.bad.";
const STATS_DATABASE_KEEP_BACKUPS = 5;

// 本地时间戳，定长：YYYYMMDD-HHMMSS。定长才能直接按文件名排序定新旧。
function statsBackupTimestamp(date = new Date()) {
  const p = localDateParts(date);
  return `${p.year}${p.month}${p.day}-${p.hour}${p.minute}${p.second}`;
}

// 只留最近 keep 份留档，其余删掉。失败的删除不致命：下次留档时还会再试一遍。
async function trimStatsBackups(directory, keep) {
  let names = [];
  try {
    for await (const entry of directory.values()) {
      if (entry.kind !== "file") continue;
      if (!entry.name.startsWith(STATS_DATABASE_BACKUP_PREFIX) || !entry.name.endsWith(".json")) continue;
      names.push(entry.name);
    }
  } catch (_) {
    return 0;
  }
  if (names.length <= keep) return 0;
  names = names.sort();
  let removed = 0;
  for (const stale of names.slice(0, names.length - keep)) {
    try {
      await directory.removeEntry(stale);
      removed += 1;
    } catch (_) {
      // 留着它不致命
    }
  }
  return removed;
}

// 把损坏的库原文留档，返回留档文件名；写不进去就返回空串（调用方据此决定别删原文件）。
// 写的是**原文**，一个字节都不加工：留档的意义就是事后能拿它去查"到底是哪一步写坏的"，
// 重新序列化一遍会把证据洗掉。
async function archiveBrokenStatsDatabase(directory, text) {
  const stamp = statsBackupTimestamp();
  // 同一秒里第二次损坏不能覆盖第一份现场，所以先探在不在，在就换后缀。
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const suffix = attempt === 0 ? "" : `-${attempt + 1}`;
    const name = `${STATS_DATABASE_BACKUP_PREFIX}${stamp}${suffix}.json`;
    let exists = true;
    try {
      await directory.getFileHandle(name);
    } catch (_) {
      exists = false;
    }
    if (exists) continue;
    try {
      const backup = await directory.getFileHandle(name, { create: true });
      const writable = await backup.createWritable();
      await writable.write(text);
      await writable.close();
      await trimStatsBackups(directory, STATS_DATABASE_KEEP_BACKUPS);
      return name;
    } catch (error) {
      console.warn("本地数据库损坏，且留档副本写入失败：原文件保持不动。", error);
      return "";
    }
  }
  console.warn("本地数据库损坏，但同一时间戳的留档名已占满 100 个，放弃留档：原文件保持不动。");
  return "";
}

/* ---------- 1.7.0（批次 A / P0）：读不到库时绝不允许整份重写 ----------
   1.5.1 只处理了「文件能读、JSON 坏」这一种：留档 → 删坏文件 → 重建空库。
   另一种一直没管：getFile().text() 直接失败（权限刚被撤、文件被安全软件占着、
   同步盘正在替换）。那时拿到的是一份**空库**，而调用方（writeStatsDatabase /
   touchPetInDatabase）会在这份空库上追加本轮记录再整份写回去 —— 用户的历史统计与
   宠物亲密度就这样无声归零，连留档都没有。现在：
   1. readStatsDatabase 明确回报 canWrite（能不能安全落盘）；
   2. 两个写入口共用 statsDatabaseWriteBlocked() 这道守卫，读不可信就一个字节都不写，
      只把这件事写进弹窗状态与图标角标；
   3. 三个不可恢复的字段（firstSeenAt / totals.savedTotal / pet 的两个计数器）在
      chrome.storage.local 留一份镜像，读不到库时用它兜底，保证「陪伴天数」「累计保存」
      「亲密度」不会因为一次读失败而清零；
   4. 每次成功改写正文之前，把**上一版**原文轮转存成 database.bak.json。
      File System Access 没有 rename，所以顺序是「先写副本、成功后再重写正文」——
   副本永远比正文早一个版本，中间任何一步断电都不会把唯一一份数据弄丢。 */
// 1.8.10：键与判据、合并算法都搬进 stats-core.js（收藏库页要用同一份），这里只引用。
const STATS_MIRROR_KEY = BcaStatsCore.STATS_MIRROR_KEY;
const STATS_PREVIOUS_DATABASE_NAME = "database.bak.json";

/* 1.8.10：这三个函数搬进了 stats-core.js —— 收藏库页的 syncStatsDatabase 也要用同一套
   判据（原来页面侧完全没有这层保护，坏文件一来就把亲密度与累计保存清零）。这里只留别名。 */
const statsMirrorNumber = BcaStatsCore.statsMirrorNumber;
const statsMirrorOf = BcaStatsCore.statsMirrorOf;
const applyStatsMirror = BcaStatsCore.applyStatsMirror;

// 读得到的镜像；读不到返回 null —— 不能把「storage 里还没有」当成「镜像是 0」，
// 否则第一次读失败就会把刚起步的用户数据顶成 0（虽然 0 也顶不掉什么，但语义要分清）
async function readStatsMirror() {
  try {
    const stored = await chrome.storage.local.get(STATS_MIRROR_KEY);
    const mirror = stored && stored[STATS_MIRROR_KEY];
    return mirror && typeof mirror === "object" ? mirror : null;
  } catch (_) {
    return null;
  }
}

/* P0-3（2026-10 审阅）：storage 写入原来全是裸 set + `.catch(() => {})` ——
   配额满、扩展更新、磁盘异常时静默丢数据。这里给「关键路径」统一一个兜底：
   失败重试一次，仍失败就 console.warn + 把原因写进 lastStorageError（弹窗会显示）。
   普通的一次性写入（界面偏好之类）不必都换过来 —— 那些丢了不影响数据完整性，
   全换反而把每处调用点都读得更吵。 */
const STORAGE_WRITE_RETRY_MS = 200;

async function rememberStorageError(label, error) {
  try {
    await chrome.storage.local.set({
      lastStorageError: {
        label: String(label || "本地存储"),
        message: String(error?.message || error || "未知错误"),
        at: Date.now()
      }
    });
  } catch (_) {
    // 兜底本身也写不进去：这时候只剩控制台，不要再套一层递归
  }
}

async function safeLocalSet(patch, label) {
  try {
    await chrome.storage.local.set(patch);
    return true;
  } catch (error) {
    try {
      await new Promise((resolve) => setTimeout(resolve, STORAGE_WRITE_RETRY_MS));
      await chrome.storage.local.set(patch);
      return true;
    } catch (retryError) {
      console.warn(`写入${label || "本地存储"}失败（重试一次仍失败，界面可能看不到最新数据）`, retryError);
      await rememberStorageError(label, retryError);
      return false;
    }
  }
}

// 统计快照单独一份：`chrome.storage.local.set({ bcaStats: … })` 这个字面量被
// test/stability.test.cjs 钉着（页面与宠物都靠它读），所以重试逻辑必须包着同一行。
async function setBcaStatsSnapshot(stats) {
  try {
    await chrome.storage.local.set({ bcaStats: stats });
  } catch (error) {
    try {
      await new Promise((resolve) => setTimeout(resolve, STORAGE_WRITE_RETRY_MS));
      await chrome.storage.local.set({ bcaStats: stats });
    } catch (retryError) {
      console.warn("统计快照写不进去（界面数字会停在上一版）", retryError);
      await rememberStorageError("统计快照", retryError);
      throw retryError;
    }
  }
}

// 只在真的变了的时候才写 storage：读库比写库频繁（扫描、摸头、每次导入批次），
// 镜像没变就不该多写一次
async function syncStatsMirror(database) {
  const next = statsMirrorOf(database);
  const current = await readStatsMirror();
  if (current && JSON.stringify(current) === JSON.stringify(next)) return next;
  const written = await safeLocalSet({ [STATS_MIRROR_KEY]: next }, "统计镜像");
  if (!written) console.warn("统计镜像写不进去（统计页会停在上一版数字）");
  return next;
}

// 两个写入口共用：能写返回空串，不能写返回一句给用户看的话
function statsDatabaseWriteBlocked(read) {
  if (read && read.canWrite) return "";
  return `本地数据库这次读不出来（${BcaStatsCore.DATABASE_FOLDER_NAME}/${BcaStatsCore.DATABASE_FILE_NAME}），`
    + "已经跳过写入，避免覆盖你原来的记录；历史统计暂时按下限显示。";
}

function reportStatsWriteBlocked(message) {
  paintActivityBadge(false);
  chrome.storage.local.set({
    lastResult: { message, createdAt: Date.now() }
  }).catch(() => {});
}

/* 改写正文之前把上一版原文留一份 database.bak.json。只在原文读得出来且非空时做；
   写不进去不拦正文 —— 备份是加分项，不是前置条件。
   1.7.7（P1-2）：加了时间闸。以前每次改写正文都整份复制一份 .bak，而"摸一次宠物"
   （1000 条 = 227KB）也会走这条路 —— 连点十次就是 2.3MB 白写。现在至少隔
   STATS_BAK_MIN_INTERVAL_MS 才轮转一次，仍然满足"备份比正文早一版"。 */
const STATS_BAK_MIN_INTERVAL_MS = 10 * 60 * 1000;
let statsBakArchivedAt = 0;
async function archivePreviousStatsDatabase(read) {
  if (!read || !read.directory || !read.text || !read.text.trim()) return "";
  const now = Date.now();
  if (now - statsBakArchivedAt < STATS_BAK_MIN_INTERVAL_MS) return "";
  try {
    const handle = await read.directory.getFileHandle(STATS_PREVIOUS_DATABASE_NAME, { create: true });
    const writable = await handle.createWritable();
    await writable.write(read.text);
    await writable.close();
    statsBakArchivedAt = now;
    return STATS_PREVIOUS_DATABASE_NAME;
  } catch (error) {
    console.warn("上一版数据库备份写入失败（正文照写）。", error);
    return "";
  }
}

/* 1.8.19：archiveBroken 为 false 时只读不归档，也不宣称「重建空库」——
   收藏库页已经留过档了，它手里还有一份用镜像补好的重建结果；
   后台这时再归档一次只会多留一份一模一样的坏文件。 */
async function readStatsDatabase(root, options = {}) {
  const archiveBroken = options.archiveBroken !== false;
  const directory = await root.getDirectoryHandle(BcaStatsCore.DATABASE_FOLDER_NAME, { create: true });
  let file = await directory.getFileHandle(BcaStatsCore.DATABASE_FILE_NAME, { create: true });
  let text = "";
  const result = (database, canWrite, reason, raw) => ({
    directory,
    file,
    database,
    canWrite,
    reason,
    text: raw || ""
  });
  try {
    text = await (await file.getFile()).text();
  } catch (error) {
    // 读不出来（权限刚被撤、文件被别的程序占着、同步盘正在替换）——**不能**当成空库交出去：
    // 调用方会在这份空库上整份重写，历史统计与亲密度直接归零（批次 A 的 P0）。
    // 这里用镜像兜住三个不可恢复的字段，并明确告诉调用方「这次不许写」。
    console.warn(
      `本地数据库读取失败（${BcaStatsCore.DATABASE_FOLDER_NAME}/${BcaStatsCore.DATABASE_FILE_NAME}），本次拒绝写入，只发布快照。`,
      error
    );
    const mirror = await readStatsMirror();
    return result(applyStatsMirror(BcaStatsCore.emptyDatabase(), mirror), false, "unreadable");
  }
  // 空文件 = 还没写过的新库，不是损坏，不该触发留档（能安全落盘）
  // 1.7.19：空文件也是「库读不出来」的一种 —— 1.7.16 之前的就地截断写一旦半途中断，
  // 留下的正是 0 字节文件（而不是坏 JSON）。以前这里直接交空库，那几个「只会往前走」
  // 的数（firstSeenAt / savedTotal / 亲密度 / 摸头次数）就跟着归零。
  // 镜像里有就顶回来；全新安装时镜像不存在，applyStatsMirror 原样返回，不会凭空造数。
  if (!text.trim()) {
    const mirror = await readStatsMirror();
    return result(applyStatsMirror(BcaStatsCore.emptyDatabase(), mirror), true, "empty");
  }
  try {
    const database = BcaStatsCore.normalizeDatabase(JSON.parse(text));
    await syncStatsMirror(database);
    return result(database, true, "ok", text);
  } catch (error) {
    // 1.5.1（P1-12）：这里以前是个空 catch，坏库被下面整份重写成空库 —— 历史统计与宠物
    // 亲密度无声归零，用户只看到"数据没了"，事后连坏在哪都查不了（原文已经没了）。
    // 现在：先把原文留档成 database.bad.<时间戳>.json，留档成功才删原文件，然后才重建空库，
    // 并且把这件事同时写进控制台和弹窗「最近状态」（lastResult）——
    // 用户看到的是"数据没了但原文还在 003database/数据库留档文件"，而不是无声归零。
    const backupName = archiveBroken ? await archiveBrokenStatsDatabase(directory, text) : "";
    if (backupName) {
      try {
        await directory.removeEntry(BcaStatsCore.DATABASE_FILE_NAME);
      } catch (removeError) {
        // 删不掉也无所谓：留档已经拿到手，下面拿到的句柄会把原文件整份重写
        console.warn("本地数据库留档成功，但删除坏文件失败（接下来会整份重写它）。", removeError);
      }
      try {
        file = await directory.getFileHandle(BcaStatsCore.DATABASE_FILE_NAME, { create: true });
      } catch (reopenError) {
        // 拿不回新句柄就沿用旧的：它指向的仍是同一个路径，重写照样能落盘
        console.warn("本地数据库重建文件句柄失败，沿用旧句柄继续。", reopenError);
      }
    }
    const trace = !archiveBroken
      ? "本次的坏原文由收藏库页留档，后台只负责把它算好的那一份写进去。"
      : backupName
        ? `原文已留档为 ${BcaStatsCore.DATABASE_FOLDER_NAME}/${backupName}，并重建空库。`
        : "留档副本写入失败，原文件未改动，本次仍会整份重写它（历史统计可能丢失）。";
    console.warn(`本地数据库解析失败（${error?.message || error}）：${trace}`);
    chrome.storage.local.set({
      lastResult: { message: `本地数据库损坏：${trace}`, createdAt: Date.now() }
    }).catch((storageError) => console.warn("写入「本地数据库损坏」提示失败（页面可能看不到这条说明）", storageError));
    // 1.7.0：留档失败时连原文都没保住 —— 这一份空库绝不能落盘（canWrite=false），
    // 否则就是把用户唯一的那份坏文件也覆盖掉，事后无从恢复
    if (!backupName) {
      const mirror = await readStatsMirror();
      return result(applyStatsMirror(BcaStatsCore.emptyDatabase(), mirror), false, "corrupt-unarchived", text);
    }
    // 1.7.19：留档成功 ≠ 历史找得回来。原文虽然存进了 database.bad.<时间戳>.json，
    // 但那只是一份坏文件；镜像里才是「上一次还能读出来时」的累计值。这条分支以前
    // 直接把空库交出去，等于刚留完档就把还能救的数字扔掉，和上面「读不出来」那条
    // 分支要的是同一个补法。
    const mirror = await readStatsMirror();
    return result(applyStatsMirror(BcaStatsCore.emptyDatabase(), mirror), true, "corrupt", "");
  }
}

let statsSnapshotPublished = "";

async function publishStatsSnapshot(database) {
  // 1.5.0：snapshot() 里的 days.days 是「库里有几天」这个数字（宠物要用它数「陪伴了几天」），
  // 每日明细得另外算 —— 统计页要画最近 14 天的柱子，所以顺手带上一份 daily。
  const stats = Object.assign(BcaStatsCore.snapshot(database), {
    daily: BcaStatsCore.recentDays(database)
  });
  /* 1.8.21（perf P1-2）：内容没变就不写。一次导入里每个收藏夹都会提交一次库，而快照里
     的 videos/records 可能一个字都没变（全是已存在记录被跳过的那种轮次）—— 每份快照
     ~KB 级，写一次就触发一遍 popup/library 的 onChanged 重渲染。指纹挡掉的是纯噪声。 */
  const fingerprint = JSON.stringify(stats);
  if (fingerprint === statsSnapshotPublished) return stats;
  statsSnapshotPublished = fingerprint;
  await setBcaStatsSnapshot(stats);
  return stats;
}

/* 1.7.18（destructive P1-3）：insertedKeys 传进来时，顺手记下「这一批里哪些行是新建的」。
   取消导入的回滚只该撤掉这些行 —— 本轮之前就在库里的行是本轮之前的数据，
   撤掉它等于替用户删了旧记录。判定必须在 addRecord **之前**做，加完就分不出新旧了。 */
/* 1.7.21（收尾）：统计库的三个写入口都是「读 → 改 → 整份写回」。
   service worker 是单线程，但每个 await 之间都会让出控制权 —— 宠物挂件点一下可能
   正好落在导入收尾的「读」与「写」之间，后写的那个就把前一个的改动整份盖掉了。
   这里用一条 promise 链把三个入口串起来：谁先拿到槽谁先跑完，其余排队。
   链只包真正读写的三个函数，调用方（flushStatsPendingRecords / rollbackImport
   / 消息处理）不包 —— 槽里再进槽会自己等自己。 */
let statsWriteChain = Promise.resolve();
function withStatsWriteSlot(task) {
  // 1.8.10：内存链只串本上下文，跨上下文交给 Web Locks（与收藏库页同一把锁名）
  const run = statsWriteChain.then(
    () => BcaStatsCore.withStatsDatabaseLock(task),
    () => BcaStatsCore.withStatsDatabaseLock(task)
  );
  statsWriteChain = run.then(() => undefined, () => undefined);
  return run;
}

async function writeStatsDatabase(root, records, insertedKeys = null) {
  return withStatsWriteSlot(() => writeStatsDatabaseInner(root, records, insertedKeys));
}

/* 1.8.10：三个写入口共用同一条提交路径 —— 先留上一版、再整份写、写完读回自检，
   自检不过就用 database.bak.json 顶回去。原来「archivePrevious + createWritable +
   write + close + syncStatsMirror + publishStatsSnapshot」这六步在
   writeStatsDatabaseInner / touchPetInDatabaseInner / rollbackStatsRecordsInner
   里各抄了一遍，自检与回滚只能一处一处加，迟早漏一处。 */
/* 1.8.19：只清「点号开头 + .tmp 结尾 + 超过 10 分钟」的文件，判据在 archive-core 里，
   与 writeFile 用的是同一套。 */
async function cleanStatsTempFiles(root) {
  try {
    const directory = await root.getDirectoryHandle(BcaStatsCore.DATABASE_FOLDER_NAME, { create: false });
    await removeStaleTempFiles(directory);
  } catch (_) {
    // 三档：清陈年残骸是顺手做的事，目录还不存在或权限刚变都不该影响这次写库。
  }
}

async function commitStatsDatabase(root, read, database) {
  await archivePreviousStatsDatabase(read);
  const text = JSON.stringify(database);
  const writable = await read.file.createWritable();
  await writable.write(text);
  await writable.close();
  if (!(await statsDatabaseContentMatches(read.file, text))) {
    await restoreStatsDatabaseBackup(root, read.file);
    return false;
  }
  await syncStatsMirror(database);
  /* 1.8.22（old-p3 storage P3-4）：库文件与镜像都已经写成功，快照只是给界面用的次要副本 ——
     它写失败（配额 / 上下文失效）不能让调用方以为「这次写库失败」，否则归档写进去了却报失败。 */
  try {
    await publishStatsSnapshot(database);
  } catch (error) {
    console.warn("统计快照发布失败（库文件已写成功，界面数字下次提交会补上）", error);
  }
  return true;
}

/* 写完立刻读回来自检：createWritable 的提交本身是原子的，但「写成功、内容却不是
   我们要的那份」这类事故从 write()/close() 的返回上一点都看不出来（历史上就出过
   半份 JSON）。文本逐字节比对最省事，也最不容易骗人。 */
async function statsDatabaseContentMatches(file, expectedText) {
  try {
    const text = await (await file.getFile()).text();
    if (text === expectedText) return true;
    console.warn(`本地数据库写完自检不一致（写进去 ${expectedText.length} 字节，读回来 ${text.length} 字节）`);
    return false;
  } catch (error) {
    console.warn("本地数据库写完自检读不回来", error);
    return false;
  }
}

/* 自检没过：用上一版顶回去。顶不回去也不能把现场抹掉 —— 备份与 .bad 都在盘上，
   下一次打开收藏库会走「坏库 → 留档 → 重建」那条路，而不是静默变成空库。 */
async function restoreStatsDatabaseBackup(root, file) {
  try {
    const directory = await root.getDirectoryHandle(BcaStatsCore.DATABASE_FOLDER_NAME);
    const backup = await directory.getFileHandle(STATS_PREVIOUS_DATABASE_NAME);
    const text = await (await backup.getFile()).text();
    const writable = await file.createWritable();
    await writable.write(text);
    await writable.close();
    console.warn("本地数据库写完自检没通过，已用 database.bak.json 顶回上一版");
    return true;
  } catch (error) {
    console.warn("本地数据库写完自检没通过，顶回上一版也失败了", error);
    return false;
  }
}

/* 1.8.17：收藏库页不再自己写库 —— 它只做「读 + 构建」，把整份结果交回这里统一提交。
   页面侧那条路是「临时文件 + move() 换名」，本机实测 7.1 秒（同一份 145 KB 库，
   就地写只要几毫秒）；换名完成时页面还会顺便写一份 bcaStats，回声再触发一次没必要的
   重扫与重绘。现在写者只有这一个：备份、就地写、写完自检、失败用 database.bak.json
   顶回，全在同一条 commitStatsDatabase 上。 */
async function commitStatsDatabaseFromPage(payload) {
  const root = await getRootHandle().catch(() => null);
  if (!root) return { ok: false, reason: "no-root" };
  const permission = await root.queryPermission({ mode: "readwrite" }).catch(() => "denied");
  if (permission !== "granted") return { ok: false, reason: "no-permission" };
  const incoming = payload && payload.database;
  if (!incoming || typeof incoming !== "object") return { ok: false, declined: true, reason: "bad-payload" };
  // 页面构建期间这边可能又写过（摸宠物、导入收尾）：只前进的标量取新的那一份，
  // 别让一次「顺带同步」把亲密度与累计保存往回拨。
  return withStatsWriteSlot(async () => {
    /* 1.8.19：页面已经把坏原文留档了，它手里那份「用镜像补好的重建结果」就是唯一
       该落盘的版本：后台不用再归档一遍，也不该把这次提交当成「读不到库」拦下来。 */
    const pageReplacedBroken = payload?.pageArchivedBroken === true;
    const read = await readStatsDatabase(root, { archiveBroken: !pageReplacedBroken });
    const blocked = statsDatabaseWriteBlocked(read) && !pageReplacedBroken;
    if (blocked) {
      // 读不到库就一个字节都不写 —— 页面那份是「按扫描结果重建」的，拿它盖未知现场不安全。
      // 1.8.19：也不发布空库快照 —— 页面手上有一份补好的，先发空库只会让统计页闪一下 0。
      console.warn(blocked);
      reportStatsWriteBlocked(blocked);
      /* 1.8.18：declined 是「我知道该怎么写，但这一份不能写」。页面看到它就不许再退回
         自己那条「临时文件 + 换名」的路 —— 那条路一次 7 秒，换名完还会写一份 bcaStats
         把自己的回声打回来，白闪就是这么来的；更要紧的是它会把读不出来的旧库盖掉。 */
      return { ok: false, declined: true, reason: "unreadable" };
    }
    /* 1.8.19：顺手清掉同目录里超过 10 分钟的点号临时文件。1.8.17 之后页面不再自己写库，
       「写前清理」那条路就再也没人走，崩一次留下的 .database.json.xxxx.tmp 会一直躺着。 */
    await cleanStatsTempFiles(root);
    const database = BcaStatsCore.applyStatsMirror(incoming, BcaStatsCore.statsMirrorOf(read.database));
    if (!(await commitStatsDatabase(root, read, database))) return { ok: false, declined: true, reason: "write-failed" };
    return { ok: true };
  }).catch((error) => ({ ok: false, reason: error?.message || "commit-failed" }));
}

async function writeStatsDatabaseInner(root, records, insertedKeys = null) {
  if (!root || !records.length) return null;
  try {
    const read = await readStatsDatabase(root);
    const blocked = statsDatabaseWriteBlocked(read);
    if (blocked) {
      // 批次 A（P0）：读不到库就一个字节都不写 —— 宁可这一批统计不入库（归档本身不受影响），
      // 也不能拿一份空库盖掉用户的历史。快照照发，至少让界面显示兜住下限的数字。
      console.warn(blocked);
      reportStatsWriteBlocked(blocked);
      // 1.8.22（old-p3 storage P3-4）：这一支只发快照、不写库；快照失败也不该让整批统计变成失败。
      await publishStatsSnapshot(read.database).catch((error) => {
        console.warn("统计快照发布失败（这次没写库，界面继续显示上一份）", error);
      });
      return null;
    }
    let next = read.database;
    for (const record of records) {
      if (insertedKeys) {
        const key = record?.key || BcaStatsCore.videoKey(record);
        if (key && !(next.videos && Object.prototype.hasOwnProperty.call(next.videos, key))) insertedKeys.push(key);
      }
      next = BcaStatsCore.addRecord(next, record);
    }
    if (!(await commitStatsDatabase(root, read, next))) return null;
    return next;
  } catch (error) {
    console.warn("写入本地数据库失败（归档不受影响）", error);
    return null;
  }
}

/* 1.7.10（facet-storage P2-4）：队列不能「先清再写」。
   原来 `statsPendingRecords.splice(...)` 在 await 之前就把队列清空了，写失败这一批的
   统计行永远不会重试 —— 归档文件本身是完整的（下一次收藏库扫描能重建回来），
   但 totals.savedTotal 这个单调计数补不回来，用户只看到「统计页少了刚导入的一批」。
   现在失败就把整批放回队首，下一轮接着写；连续失败到 STATS_WRITE_NOTICE_AFTER 次
   才升级成用户可见的提示（走 lastResult，与「读不出库」同一个通道），之后每隔
   STATS_WRITE_NOTICE_INTERVAL 次再提醒一次，免得刷屏。
   队列有上限：库里确实写不进去时不能无限攒内存。超了从最旧的丢，并把丢掉的条数
   报出来 —— 这些记录靠下一次全量扫描还能重建。 */
const STATS_WRITE_NOTICE_AFTER = 3;
const STATS_WRITE_NOTICE_INTERVAL = 10;
const STATS_PENDING_MAX_RECORDS = 20000;
let statsWriteFailureStreak = 0;

function reportStatsWriteFailure() {
  reportStatsWriteBlocked(
    `本地数据库这次写不进去（已连试 ${statsWriteFailureStreak} 次）。归档文件本身是完整的，`
    + "下次打开收藏库重新扫描就能把统计补回来；要是一直这样，检查 003database 文件夹能不能写。"
  );
}

// 把待写队列落一次盘。成功返回新库，失败返回 null（且队列原样留着）。
async function flushStatsPendingRecords(root, insertedKeys = null) {
  if (!statsPendingRecords.length) return null;
  const batch = statsPendingRecords.splice(0, statsPendingRecords.length);
  const database = await writeStatsDatabase(root, batch, insertedKeys);
  if (database) {
    statsWriteFailureStreak = 0;
    return database;
  }
  // 失败：整批放回队首（这一批比新来的先写，顺序不能反）
  statsPendingRecords.unshift(...batch);
  statsWriteFailureStreak += 1;
  const overThreshold = statsWriteFailureStreak - STATS_WRITE_NOTICE_AFTER;
  if (statsWriteFailureStreak === STATS_WRITE_NOTICE_AFTER
    || (overThreshold > 0 && overThreshold % STATS_WRITE_NOTICE_INTERVAL === 0)) {
    reportStatsWriteFailure();
  }
  if (statsPendingRecords.length > STATS_PENDING_MAX_RECORDS) {
    const dropped = statsPendingRecords.length - STATS_PENDING_MAX_RECORDS;
    statsPendingRecords.splice(0, dropped);
    reportStatsWriteBlocked(
      `本地数据库连续写不进去，已丢掉最早排队的 ${dropped} 条统计记录`
      + `（队列最多留 ${STATS_PENDING_MAX_RECORDS} 条）。归档文件不受影响，重新扫描收藏库就能补回来。`
    );
  }
  return null;
}

/* 1.7.18（destructive P1-3）：取消导入时，统计行必须跟着文件一起回滚。
   每个收藏夹收尾都会把统计落一次盘（见 importBiliFavoritesInner 里的 flushStatsPendingRecords），
   而取消可能发生在**下一个**收藏夹中途 —— 那时库里已经有本次导入新建的那几百行，
   而 rollbackImport 只删目录、一行统计都不动（writeStatsDatabase 只有加法，没有减法）。
   留着的话，弹窗与宠物挂件会一直报一个磁盘上并不存在的「已归档总数」，
   用户要等到打开收藏库页触发一次全量扫描才会被纠正。
   返回 { removed, failed }：removed 是真正撤掉的行数，failed 表示「该撤但没撤成」。 */
async function rollbackStatsRecords(root, keys) {
  return withStatsWriteSlot(() => rollbackStatsRecordsInner(root, keys));
}

async function rollbackStatsRecordsInner(root, keys) {
  if (!root || !keys.length) return { removed: 0, failed: false };
  try {
    const read = await readStatsDatabase(root);
    // 库读不出来时一个字节都别写 —— 和 writeStatsDatabase 同一条红线
    if (statsDatabaseWriteBlocked(read)) return { removed: 0, failed: true };
    const removed = BcaStatsCore.removeRecords(read.database, keys);
    if (!removed) return { removed: 0, failed: false };
    if (!(await commitStatsDatabase(root, read, read.database))) return { removed: 0, failed: true };
    return { removed, failed: false };
  } catch (error) {
    console.warn("回滚统计行失败（归档已回滚，统计会由下次全量扫描纠正）", error);
    return { removed: 0, failed: true };
  }
}

/* 一条刚存好的归档记录 → 数据库里的一行。时间用的就是写进 视频信息.txt 的那一串
   （认不出来时 stats-core 会退回"现在"，与收藏库重新扫描时的口径一致）。 */
function statsRecordForItem(item, collectionName, favoriteAtText) {
  return BcaStatsCore.recordFromVideo({
    bvid: item?.bvid || "",
    aid: item?.aid || "",
    title: item?.title || "",
    collection: collectionName || "",
    date: favoriteAtText || ""
  });
}

/* 宠物被摸一下：亲密度 +1（同一天有上限），写回数据库，再把新快照发出去。
   台词不在这里 —— service worker 里没有词典，只回一个下标，由界面侧翻译。 */
async function touchPetInDatabase() {
  return withStatsWriteSlot(() => touchPetInDatabaseInner());
}

/* 1.8.11：封顶之后再摸，只有 totalTouch 在涨 —— 为它整库重写（1k~1w 条）不划算。
   一分钟合一次；这段时间里 SW 被回收最多丢几十次计数，比「摸一下写 143KB」划算。 */
const PET_CAPPED_WRITE_MS = 60 * 1000;
let petCappedWriteAt = 0;
// 1.8.12：这一分钟里不落盘，但台词下标要照常往前 —— 计一下攒了几次，交给 petLineIndex 补上。
let petDeferredTouches = 0;
/* 1.8.21（perf P1-2）：封顶后这一分钟里不落盘，但旧写法仍然**先把整库读出来**才判 capped
   —— 1k~1w 条记录的 parse 只为丢弃，结果被原样扔掉。这里把上次写成功时的宠物状态留在内存里，
   窗口内的触摸直接按它回话，一次库读都不做。 */
let petCappedSnapshot = null;

async function touchPetInDatabaseInner() {
  const root = await getRootHandle().catch(() => null);
  if (!root) return { ok: false };
  const permission = await root.queryPermission({ mode: "readwrite" }).catch(() => "denied");
  if (permission !== "granted") return { ok: false };
  // 窗口内：不读库，按上次落盘的宠物状态 + 攒下的次数回话（capped 之后只有 totalTouch 在涨）
  if (petCappedSnapshot && Date.now() - petCappedWriteAt < PET_CAPPED_WRITE_MS) {
    petDeferredTouches += 1;
    const totalTouch = petCappedSnapshot.totalTouch + 1;
    return {
      ok: true,
      lineIndex: BcaStatsCore.petLineIndex(totalTouch, petDeferredTouches),
      affinity: petCappedSnapshot.affinity,
      todayTouch: petCappedSnapshot.todayTouch,
      totalTouch,
      capped: true,
      deferred: true
    };
  }
  const read = await readStatsDatabase(root);
  const blocked = statsDatabaseWriteBlocked(read);
  if (blocked) {
    // 批次 A（P0）：宠物挂件点一下就能走到这条路径 —— 读不到库时绝不整份重写
    console.warn(blocked);
    reportStatsWriteBlocked(blocked);
    return { ok: false, blocked: true, lineIndex: null };
  }
  const touched = BcaStatsCore.touchPet(read.database);
  if (!(await commitStatsDatabase(root, read, read.database))) return { ok: false };
  petCappedWriteAt = touched.capped ? Date.now() : 0;
  // capped 时才需要这份内存态：窗口内不再读库，靠它回话；非 capped 的写清掉，下次照常读。
  petCappedSnapshot = touched.capped
    ? { totalTouch: touched.totalTouch, todayTouch: touched.todayTouch, affinity: touched.affinity }
    : null;
  petDeferredTouches = 0;
  return {
    ok: true,
    lineIndex: touched.index,
    affinity: touched.affinity,
    todayTouch: touched.todayTouch,
    totalTouch: touched.totalTouch,
    capped: touched.capped
  };
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
  noteCoverOutcome(cover);
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
    // 1.7.16（destructive P1-1）：不无条件删 —— 见 discardFailedRecord。
    await discardFailedRecord(collection, record.name, error);
    throw error;
  }
  // 1.5.0：把「这条记录写在目录名/视频信息.txt 里的收藏时间」一并交回去，
  // 数据库那一行要用同一个口径的时间（口径不一致会出现「档案里是 6 月、统计算今天」）。
  const favoriteAtText = metadata.imported && favoriteTimeUnknown ? "未知" : formatChineseDateTime(favoriteAt, true);
  return { path: `${root.name}/${collectionName}/${record.name}`, favoriteAtText };
}

function sendImportProgress(text) {
  chrome.runtime.sendMessage({ type: "bca-import-progress", text }, () => { void chrome.runtime.lastError; });
}

/* 4.9.x 角标：importBiliFavoritesInner 的收尾路径有六条 ——
     ① claimImportRun 拿不到占位（重入）→ throw
     ② 取根目录 / 查授权 / 查勾选失败 → throw
     ③ 主流程里任意一个 throw（被 3043 那段 catch 原样抛出）
     ④ 取消（ImportCancelled）→ return ok:false + cancelled
     ⑤ 风控中止（ImportRateLimited）→ return ok:false + rateLimited
     ⑥ 正常完成 → return ok:true
   逐条挂角标的话，将来任何一条新加的 return / throw 都会漏掉 —— 包括"收尾阶段自己炸了"
   （回滚、写报告、storage.set 抛错）这种连 return 都走不到的路径。所以这里用一层薄包装
   把"开始 / 结束"各收在一处：不管 inner 走哪条路出去，角标都跟着。inner 的行为一个字没改。
   注意：只有包装层碰角标，importBiliFavoritesInOrder 里那句出队调用与出队逻辑原样保留
   （测试会逐字比对那两行，所以那边一个字都不能动）。 */
async function importBiliFavorites(data, tabId = null) {
  markActivityStarted();
  try {
    const result = await importBiliFavoritesInner(data, tabId);
    markActivityFinished(result);
    return result;
  } catch (error) {
    markActivityFinished(null);
    throw error;
  }
}

async function importBiliFavoritesInner(data, tabId = null) {
  const selectedIds = new Set((Array.isArray(data?.folderIds) ? data.folderIds : []).map(String));
  // 报告里必须写明**产生它的插件版本**。
  // 排查一个"改了却没生效"的问题时，最耗时的就是分不清"代码不对"和"跑的还是旧代码" ——
  // 真机上为此来回折腾了三轮。有了这一行，看一眼就知道。
  const reportVersion = (() => {
    try { return chrome.runtime.getManifest().version; } catch (_) { return "未知"; }
  })();
  const reportLines = ["B站收藏夹本地导入报告", `插件版本：${reportVersion}`, ERROR_REPORT_NOTICE, `开始时间：${formatChineseDateTime(new Date(), true)}`];
  // 4.9.1：中止时要把"当前这一轮收藏夹"还没渲染的日志补进报告。
  // folderLog 原本只在每轮循环末尾渲染，而风控是在保存阶段抛出的、抛在渲染之前，
  // 用户于是只看到一个没有解释的「失败：N」。取消分支不写报告，所以只需在这里补。
  let activeFolderTitle = "";
  let activeFolderLog = [];
  // 4.9.x：占住这一轮导入。importRun 在这条 await 之前就已经置位，所以"按钮点两次"
  // 不会再有中间窗口期：第二次请求会被 claimImportRun 直接拒掉，而不是排一轮在队列里，
  // 更不会把取消信号打到另一个对象上（见 importBiliFavoritesInOrder 的注释）。
  const run = claimImportRun();
  if (!run) throw new Error("已经有一轮导入正在进行，请先等它结束或取消它。");
  /* 1.7.10（facet-destructive P2-5）：本地收藏库正在删 / 搬 / 新建目录时不开始这一轮 ——
     两边同时写同一批归档目录，导入会把刚删掉的目录名字写回统计库。
     注意这个 await 必须放在 claimImportRun() **之后**：挪到前面就等于在「置位」之前
     又开了一个窗口，连点两次又能钻进来（见上面 4.9.x 那段注释）。 */
  if (await archiveWriteLockHeldBy("library")) {
    run.active = false;
    run.cancelled = false;
    publishImportState({ running: false, paused: false, finishedAt: Date.now() }, true);
    await clearImportRunSnapshot();
    throw new Error("本地收藏库正在改动归档（删除 / 搬运 / 新建目录），等它做完再导入。");
  }
  // 占位成功、且收藏库那边没在写：把「导入进行中」摆到跨上下文闸门上。
  // 放在这里而不是 claimImportRun 里 —— 那个函数是纯粹的占位判断，测试会把它单独抠出来跑。
  setArchiveWriteLock("import");
  // root 必须声明在函数作用域：这一轮导入从头到尾都要用它（建收藏夹目录、写视频目录、
  // 落盘错误报告）。原来写成 try 块里的 `const root`，try 一结束 root 就没了 ——
  // 导入走到「建收藏夹目录」那一步直接 ReferenceError: root is not defined。
  // 语法完全没问题，`node --check` 查不出来，只有真跑到那一行才炸。
  let root;
  try {
    root = await getRootHandle();
    if (!root) throw new Error("尚未设置本地备份文件夹，请先在插件中选择本地备份文件夹。");
    await ensureWritePermission(root);
    if (!selectedIds.size) throw new Error("请至少勾选一个 B 站收藏夹。");
  } catch (error) {
    // 置位之后、主流程之前就失败（没选文件夹 / 没授权 / 读不到根目录），
    // 这里必须把占位放掉，否则界面会永久停在"导入中"。
    run.active = false;
    run.cancelled = false;
    publishImportState({ running: false, paused: false, finishedAt: Date.now() }, true);
    await clearImportRunSnapshot();
    throw error;
  }
  const importRun = run;   // 这一轮固定引用自己那份运行状态，后面一律用它（不再用全局变量）
  upFansCache = new Map();
  // 4.4.1：失效视频恢复默认开启（它需要伪造成官方 APP 客户端请求 APP 接口，
  // 是合规上最勉强的一环，因此保留开关让用户能关掉；只有明确存成 false 才关闭）
  const settings = await chrome.storage.local.get("recoverInvalidVideos").catch(() => ({}));
  // 默认开启：这个开关会去 APP 接口 / 稍后再看 / 观看历史里**拼凑失效视频的信息**
  // （封面、标题等），真机上确实找得回来。
  // 注意别和"把失效视频恢复成正常状态"混为一谈 —— 那是另一回事，一般也做不到。
  // 必须与 popup.js 的默认值保持一致，否则界面显示与实际行为会不一致。
  const recoverInvalidVideos = settings?.recoverInvalidVideos !== false;
  const journal = createImportJournal();
  // 1.7.18（destructive P1-3）：本轮导入真正**新建**的统计行 key。取消时按这份名单做减法。
  const importStatsKeys = [];
  importRateLimitStreak = 0;
  publishImportState({ running: true, paused: false, startedAt: Date.now(), finishedAt: 0, text: "正在准备导入…", summary: "", interrupted: false, rateLimited: false }, true);
  // 断点落盘：ImportRun 的关键字段（active/paused/cancelled/游标/计数）与回滚日志
  // 写进 chrome.storage.session，SW 被回收后还能知道"上次跑到哪、写了哪些目录"
  resetImportRunSnapshot(journal, data?.folderIds);

  let imported = 0, refreshed = 0, skipped = 0, failed = 0, total = 0, hasIssues = false;
  // 1.8.8：「最多导入 N 条」用到的两个状态。limitReached 一旦为真，后面的收藏夹
  // 连列表都不去读（读页也要发请求）；limitedCount 记因为上限而没导入的新视频条数。
  // 1.8.8：本次最多导入多少条**新**视频（0 = 不限，也就是「全部」）。
  // 必须声明在收藏夹循环之外 —— 收尾的完成消息与报告也要用它（上一版误放在循环里，
  // 循环外引用就抛 ReferenceError：数据已经存好了，界面却弹「导入失败」。）
  const importLimit = Math.max(0, Number(data?.limit) || 0);
  let limitReached = false;
  let limitedCount = 0;
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

    /* P1-7：上次被打断时记下的断点。只在「这次是继续」时才用；找不到那个收藏夹
       （改名 / 取消勾选 / 换了账号）就从第一个收藏夹从头导 —— 宁可多跑一遍，
       也不能因为对不上就整轮不干活。断点本身不带任何视频正文，只是「停在哪」。 */
    const resume = data?.resume && typeof data.resume === "object" ? data.resume : null;
    let startFolderIndex = 0;
    if (resume) {
      const wanted = String(resume.folder || "");
      const foundIndex = wanted ? folders.findIndex((folder) => folder.title === wanted) : -1;
      const startPage = Math.max(1, Number(resume.page) || 1);
      if (foundIndex >= 0) {
        startFolderIndex = foundIndex;
        const line = `继续上次导入：从「${folders[foundIndex].title}」第 ${startPage} 页往后接着跑，它前面的收藏夹上次已经处理过。`;
        reportLines.push("", line);
        folderNotes.push(line);
        importProgress(line, true);
      } else {
        const line = "上次停在的收藏夹这次没找到（可能改名或这次没勾选），这一轮从第一个收藏夹重新开始。";
        reportLines.push("", line);
        folderNotes.push(line);
        importProgress(line, true);
      }
    }
    // 断点只对「这一次继续」有效：真跑起来就把它清掉，免得下次再提示一条过期的
    await clearImportResume();

    for (let folderIndex = startFolderIndex; folderIndex < folders.length; folderIndex += 1) {
      await importWaitIfPaused();
      const folder = folders[folderIndex];
      const folderLog = [];
    activeFolderTitle = folder.title;
    activeFolderLog = folderLog;
      if (collectionNameIsReserved(folder.title)) {
        failed += 1;
        hasIssues = true;
        reportLines.push("", `收藏夹：${folder.title}`, "收藏夹名称与插件保留目录冲突，已跳过。请先在 B 站重命名该收藏夹后重试。");
        continue;
      }
      // 1.8.8：上一个收藏夹就把这次的额度用完了 —— 这里直接收工，不再读它的列表。
      if (limitReached) break;
      publishImportRun({ journal, force: true, cursor: { folder: folder.title, page: 1, saved: 0, folderTotal: 0 }, counts: { imported, refreshed, skipped, failed, total } });

      importProgress(`正在读取「${folder.title}」（${folderIndex + 1}/${folders.length}）…`, true);
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
            importProgress(`「${folder.title}」第 1 页读取失败，第 ${attempt + 1}/${IMPORT_FIRST_PAGE_ATTEMPTS} 次尝试…`, true);
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
          reportLines.push("这通常是短时间请求过多触发的限流。等几分钟再试；如果反复出现，可以先只用「同步最近收藏」缩小范围。");
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
      // V1.1.4：「同步最近收藏」只处理最近 N 天收藏的条目。
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
      // 1.8.7（P2-7）：这里原来也 force 一次，cursor/counts 与下面「可信度检查」之后那次完全一样，删掉
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
        if (!BcaArchiveCore.isMissingError(error)) throw error;
        collectionExisted = false;
        collection = await createDirectoryOrExplain(root, collectionName);
        journal.createdCollections.push({ parentHandle: root, handle: collection, name: collectionName });
      }
      if (!collectionExisted) folderNotes.push(`「${folder.title}」本地没有同名收藏夹，本次按全量导入处理。`);

      const existing = await readExistingImportRecords(collection);
      const pendingItems = [];
      const refreshTargets = [];
      let protectedCount = 0;   // 本地已有备份、因而被丢弃的降级条目数
      for (const item of scopedItems) {
        const keys = importIdentifierKeys(item);
        const matched = keys.find((key) => existing.identifiers.has(key));
        if (!matched) {
          keys.forEach((key) => existing.identifiers.add(key));
          pendingItems.push(item);
          continue;
        }
        skipped += 1;
        // **本地已有这条记录时，只有"解析到的信息确实可用"才允许刷新。**
        //
        // 判据不能只看 item.isInvalid。真机上那条失效视频的 media.is_invalid 并不是 true：
        // 接口返回的标题既不是「已失效视频」这类已知占位（不在 IMPORT_INVALID_TITLES 里），
        // 也不是可用标题，于是上面那句 `if (!item.isInvalid && !importUsefulTitle(...))`
        // 把它的 item.title 改成了「未知」—— 然后这条"未知"就把本地完好的标题覆盖了。
        // V1.1.20 只挡了 item.isInvalid，正好漏掉这一条，用户复现后才发现。
        //
        // 所以判据交给 importItemIsTrustworthy：失效、标题空、标题是「未知」，
        // 三种都算不可信（见那个函数的注释 —— 前两版就是在这里连栽两次的）。
        // 本地没有的（pendingItems 那条分支）不受影响 —— 该存还是要存。
        // 想用降级信息覆盖，只有手动点「更新视频状态」那一条路。
        if (!importItemIsTrustworthy(item)) {
          protectedCount += 1;
          continue;
        }
        const record = existing.records.get(matched);
        // 4.9：除了文本判据，还要看"目录里有没有封面"（半截目录）。这个查盘只在
        // 文本判据说"完整"时才发生，正常路径不多付 IO。
        if (record && await importRecordNeedsRefresh(collection, record)) {
          // 1.8.6（P0-2）：只缺粉丝数的旧记录，只补那一次请求
          if (recordNeedsFansOnly(record)) item.fansOnly = true;
          refreshTargets.push({ item, record });
        }
      }
      // 1.8.8：本次只写 N 条新视频。裁剪放在「抓详情 / 下封面」之前 ——
      // 额度用完的那些条目不该再花任何一次 B 站请求。
      if (importLimit > 0) {
        const remaining = Math.max(0, importLimit - imported);
        if (pendingItems.length > remaining) {
          limitedCount += pendingItems.length - remaining;
          pendingItems.length = remaining;
          limitReached = true;
          folderNotes.push(`「${folder.title}」按本次上限（${importLimit} 条）截断：还有 ${limitedCount} 条新视频没导入，再点一次「开始导入」会接着补。`);
        } else if (imported + pendingItems.length >= importLimit) {
          limitReached = true;
        }
      }
      // 无论有没有拦到都记一行：这一行能证明「守卫确实跑过了」。
      // 上一轮的报告里连备注都没有，我分不清是"守卫没生效"还是"根本没走到这里"。
      folderLog.push(`信息可信度检查：匹配到本地已有记录 ${skipped} 条，其中 ${protectedCount} 条解析结果不可信（失效/标题取不到），已保留原记录。`);
      if (protectedCount > 0) {
        folderNotes.push(`「${folder.title}」有 ${protectedCount} 条解析结果不可用（已失效或标题取不到），本地已有备份，按规则保留了原记录、没有被覆盖。`);
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
      // 1.8.8：额度用完就只收工，不再顺手刷新旧记录（那也是成片的请求）。
      for (const entry of limitReached ? [] : refreshTargets) {
        await importWaitIfPaused();
        // 1.4.2（P1-4）：这条循环只重写本地文件、不联网，几千条时中间能静默很久，
        // 不保活就会被 MV3 的空闲回收掐断（内部按 20 秒节流）
        await keepServiceWorkerAlive("refresh");
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
        importProgress(`正在准备「${folder.title}」的封面：${Math.min(offset + batch.length, pendingItems.length)}/${pendingItems.length}`, true);
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
          // 最后一条强制发出去：节流窗可能刚好吞掉它，界面会停在一个旧的「x/y」上
          importProgress(`正在导入「${folder.title}」：${offset + index + 1}/${pendingItems.length}（已保存 ${imported} 个）`,
            offset + index + 1 === pendingItems.length);
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
            // 1.5.0：数据库那一行跟着归档走 —— 这条已经落盘了才记
            statsPendingRecords.push(statsRecordForItem(item, folder.title, result.favoriteAtText));
            if (!statsPendingSince) statsPendingSince = Date.now();
            publishImportRun({ journal, cursor: { folder: folder.title, saved: offset + index + 1, folderTotal: pendingItems.length }, counts: { imported, refreshed, skipped, failed, total } });
          } catch (error) {
            importRethrowIfAbort(error);
            failed += 1;
            folderLog.push(`${item.title || "未知"} (${item.bvid || item.aid || "无编号"})：${error.message}`);
          }
        }
      }

      const coverFailureLine = importCoverFailureLine();
      if (coverFailureLine) folderLog.push(coverFailureLine);

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
      // 1.5.0：一个收藏夹跑完就把数据库落一次盘（中途被取消也只丢最后这一小段）
      // 1.7.10（P2-4）：改走 flushStatsPendingRecords —— 写失败会把整批放回队列重试
      // 1.8.6（P0-3）：但每次落盘都是「读全库 → 改 → 整份写回」，十几条的小收藏夹也照做
      //   一遍太亏。改成攒够 200 条或 30 秒才落（收尾再补一次，见下面那句 force）。
      if (statsFlushDue()) {
        await flushStatsPendingRecords(root, importStatsKeys);
        statsPendingSince = statsPendingRecords.length ? Date.now() : 0;
      }
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

  let rollback = { removedRecords: 0, restoredFiles: 0, removedCollections: 0, removedFiles: 0, failures: [] };
  let statsRollback = { removed: 0, failed: false };
  if (cancelled) {
    // 1.8.22（old-p3 destructive P3-3）：取消与回滚分成两段说 —— 先「取消中」（收尾当前这一条），
    // 再由 rollbackImport 里的「已处理 n/总数」接手，不再用一句文案盖住两段。
    publishImportState({ text: "正在取消本次导入（收尾当前这一条）…" });
    rollback = await rollbackImport(journal);
    // 1.7.18（destructive P1-3）：文件回滚完再回滚统计 —— 顺序不能反，
    // 否则统计行先没了、目录却因为回滚失败还留着，就成了「磁盘上有、统计里没有」。
    statsRollback = await rollbackStatsRecords(root, importStatsKeys);
  }
  importRun.active = false;
  importRun.paused = false;

  const finishedAt = Date.now();
  if (cancelled) {
    // 1.7.0（批次 B）：回滚里任何一条失败都要说出来 —— 原来无论还原成没成都宣告
    // 「导入前的本地内容没有被改动」，用户会以为回滚是干净的
    const rollbackFailures = rollback.failures || [];
    const rollbackNote = rollbackFailures.length
      ? `有 ${rollbackFailures.length} 项没能还原：${rollbackFailures.slice(0, 5).join("；")}${rollbackFailures.length > 5 ? "；…" : ""}。`
      : "导入前的本地内容没有被改动。";
    /* 1.7.18（destructive P1-3）：原来这里只说文件 —— 统计库其实被留高了一块，
       而这句话让人以为「取消 = 一切复原」。现在把统计那一半也如实写出来。 */
    const statsNote = statsRollback.failed
      ? "统计库里对应的一行这次没能撤掉，下次打开收藏库重新扫描会纠正。"
      : statsRollback.removed
        ? `并从统计库里撤掉了对应的 ${statsRollback.removed} 行。`
        : "";
    const summary = `导入已取消：已回滚本次新建的 ${rollback.removedRecords} 个视频目录`
      + `${rollback.removedCollections ? `、${rollback.removedCollections} 个新建收藏夹` : ""}`
      + `${rollback.restoredFiles ? `，并还原了 ${rollback.restoredFiles} 个被更新的视频信息.txt` : ""}。`
      + statsNote + rollbackNote;
    await finishImportRunSnapshot();
    publishImportState({ running: false, paused: false, finishedAt, text: summary, summary }, true);
    // 有还原失败就带上 failed 标记：弹窗打开时会把「最近状态」展开，不让人漏看
    await chrome.storage.local.set({
      lastResult: { message: summary, createdAt: finishedAt, failed: rollbackFailures.length > 0 }
    });
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
      // needsReauth 恒为 false：风控中止与文件夹授权无关。
      // 显式写出来是为了让这个字段在每条 lastError 上都存在，前台不必区分"旧数据"和"这次没失效"。
      lastError: { report: maskLocalUserPaths(reportLines.join("\n").slice(0, 16000)), reportPath: storageReportLabel(reportPath), createdAt: finishedAt, needsReauth: false },
      lastResult: { message, createdAt: finishedAt }
    });
    publishImportState({ running: false, paused: false, finishedAt, text: message, summary: message, rateLimited: true }, true);
    await finishImportRunSnapshot();
    return { ok: false, rateLimited: true, message, imported, refreshed, skipped, failed, total, reportPath: reportPath ? storageReportLabel(reportPath) : "" };
  }

  reportLines.push("", `完成时间：${formatChineseDateTime(new Date(), true)}`,
    `读取视频：${total}`, `新导入：${imported}`, `更新记录：${refreshed}`, `已存在跳过：${skipped}`, `失败：${failed}`);
  if (limitReached) {
    reportLines.push("", `本次按上限：最多 ${importLimit} 条，已写入 ${imported} 条`
      + (limitedCount > 0 ? `，另有 ${limitedCount} 条新视频未导入（再点一次「开始导入」接着补）` : ""));
  }
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
    const report = reportLines.join("\n").slice(0, 16000);
    // S3：导入失败也可能是"写到一半写入授权失效"（ensureWritePermission 在任务开始时查过，
    // 但授权可能中途被回收）。报告正文里会带这句原文，这里顺手把它翻译成布尔值，
    // 前台的「重新授权」按钮就不必再依赖中文文案。
    await chrome.storage.local.set({ lastError: { report: maskLocalUserPaths(report), reportPath: storageReportLabel(reportPath), createdAt: Date.now(), needsReauth: needsReauthFromError(report) } });
  }
  // 分页缺口必须同时出现在回给界面的消息里，否则界面只会显示"失败 N 个"
  // 1.8.8：撞上「最多导入 N 条」时要说清楚，否则用户会以为「还有一半没导」是失败
  const limitText = limitReached
    ? `本次按上限导入：最多 ${importLimit} 条，已写入 ${imported} 条`
      + (limitedCount > 0 ? `，另有 ${limitedCount} 条新视频留到下次（再点一次「开始导入」就接着补）。` : "。")
    : "";
  const message = `导入/更新完成：新导入 ${imported} 个，更新 ${refreshed} 个，已存在跳过 ${skipped} 个，失败 ${failed} 个。`
    + (missingNotes.length ? `分页未取全：${missingNotes.join("；")}。` : "")
    // 4.9.2：差额如实报出来，用户才能对照 B 站页面自行核对
    + (coverageNotes.length ? `（${coverageNotes.join("；")}。差额是 B 站收藏夹里的占位空槽：视频被删除后会留下空位，它计入总数但没有内容、接口也不返回，不是导入遗漏。）` : "")
    + limitText;
  const pathText = savedPaths.slice(0, 10).join("\n");
  // 1.8.6（P0-3）：收尾把最后不足一批的统计记录补落一次 —— 阈值批处理不能把尾巴留在内存里
  if (statsPendingRecords.length) {
    await flushStatsPendingRecords(root, importStatsKeys);
    statsPendingSince = 0;
  }
  await chrome.storage.local.set({ lastResult: { message, path: pathText, createdAt: Date.now() }, ...(failed || hasIssues ? {} : { lastError: null }) });
  await finishImportRunSnapshot();
  publishImportState({ running: false, paused: false, finishedAt, text: message, summary: message }, true);
  return { ok: true, message, imported, refreshed, skipped, failed, total, reportPath: reportPath ? storageReportLabel(reportPath) : "", limitReached, limitedCount };
}

// 4.9.x：占住"当前这一轮导入"。claimImportRun 必须在任何 await 之前调用 ——
// 排进 saveQueue 之后才轮到这里，中间那段"等队列""读根目录""查授权"全是 await，
// 正是"按钮点两次"能钻进去的窗口：第二次会再排一轮，等第一轮结束就接着跑第二轮，
// 而且会让取消信号打到另一个对象上（旧代码在函数体里 `importRun = {...}` 整个换对象，
// 第一轮闭包握着的还是新对象，照样跑到底）。现在：pending 计数在消息进来的同步代码里
// 就 +1，出队时再由这里置位，两处合起来把重复发起挡死；运行状态也只有一份对象。
// 返回 null 表示已经有一轮在跑（或已在队列里等着）。
function claimImportRun() {
  if (importRun.active || importPending > 0) return null;
  const run = { active: true, paused: false, cancelled: false, waiters: [] };
  importRun = run;
  return run;
}

/* 1.7.10（facet-destructive P2-5）：importRunChain / importRunPublishChain 只保证「同一队列
   里顺序执行」，那叫排队、不叫互斥；而收藏库页面里的删除 / 搬运 / 新建目录是另一套完全
   独立的写者，service worker 根本看不到。两边同时写同一批归档目录时，导入会把刚删掉的
   目录名字写回统计库、搬运会复制到一半被扫描读走。
   这里放一把跨上下文的闸门：storage.session 对扩展页面与 SW 都可见，浏览器重启自动清空，
   正好是「这次会话内的互斥」这个语义。
     · 后台导入期间写 { kind: "import", since }，结束时清掉；
     · 收藏库要动归档之前先读它，导入在跑就先不动，并如实告诉用户；
     · 反过来收藏库动手期间也写 { kind: "library" }，导入开始时同样要读它。 */
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

async function archiveWriteLockHeldBy(kind) {
  try {
    const saved = await chrome.storage.session.get(ARCHIVE_WRITE_LOCK_KEY);
    const lock = saved?.[ARCHIVE_WRITE_LOCK_KEY];
    if (!lock || lock.kind !== kind) return false;
    return Date.now() - Number(lock.since || 0) < ARCHIVE_WRITE_LOCK_MAX_AGE_MS;
  } catch (_) { return false; }
}

function importBiliFavoritesInOrder(data, tabId = null) {
  // 4.9.x：「队列里压着一轮导入」这笔账必须在**出队时**放掉，不能等到跑完。
  // claimImportRun 会看 importPending，而调用方在同步代码里刚替这一轮记过 +1 ——
  // 如果这笔账一直记到任务结束，出队后第一件事就是把自己判成「已经有一轮正在进行」，
  // 于是每一轮导入都当场失败。真机表现：一导入（或更新）就提示「已经有一轮导入正在进行」，
  // 而对比差异、下载这些不走这条队列的链路完全正常。
  // 出队和 claimImportRun 之间不能有 await：importBiliFavorites 里 claimImportRun 是在
  // 任何 await 之前调的（见那里的注释），两处合起来才没有连点能钻的窗口期。
  const task = saveQueue.then(() => {
    importPending = Math.max(0, importPending - 1);
    return importBiliFavorites(data, tabId);
  });
  const queued = task.catch(() => undefined);
  saveQueue = queued;
  // 1.5.1（P0-2）：这笔账以前是"只加不减就永久锁死"的结构 —— 减 1 只发生在"任务真正出队"
  // 那一行。一旦任务没走到出队（service worker 在排队期间被回收、调用方在入队前就抛了、
  // 或者上一次留下的死链把队列卡住），importPending 就永久停在 ≥1，而
  // claimImportRun()（:3303）与消息入口（:3960）都拿它当"有一轮在跑"：
  // 之后**任何**导入都会被回「已经有一轮导入正在进行，请先等它结束或取消它。」，
  // 用户看不到任何在跑的任务，也没有任何路径能把这笔账清掉（只能重装扩展）。
  // 这里的自愈：这一段链子自己保证"跑完即归零"——
  //   · 任务 settle（成功 / 失败 / 被取消都算）后再兜一次，把计数清干净；
  //   · 只在"这一轮仍是队尾"时清（saveQueue === queued），所以不会误伤排在后面的任务；
  //   · 正常路径下出队时那一次减 1 已经把 importPending 归零，这里的 Math.max 落在 0 上，
  //     是空操作 —— 连点第二次仍然必被 (:3960) 拒掉（第一次点击时这一轮还没 settle）。
  // 刻意不做"按时间判定陈旧"的启发式：importPending 只在"排着队、还没开始跑"这段非零，
  // 而队列完全可能被一轮暂停中的导入合法地占用几小时（见 IMPORT_QUEUE_WAIT_TIMEOUT_MS 的说明），
  // 用超时去清账会把真正的排队误判成陈旧。
  const settlePending = () => {
    if (saveQueue !== queued) return;
    importPending = Math.max(0, importPending - 1);
  };
  task.then(settlePending, settlePending);
  return task;
}

async function recordFavoriteError(data) {
  const error = new Error(data?.message || "B站收藏操作失败。");
  const saved = await logError(error, { metadata: data?.metadata || {} });
  return {
    ok: false,
    message: error.message,
    details: saved.reportPath ? `错误报告已保存：${storageReportLabel(saved.reportPath)}` : "错误报告保存在插件中；点击插件图标可查看并下载。",
    // 1.8.21（PRV-P2-4）：同 addManualVideo —— 回给页面的只留末两段相对标签。
    reportPath: saved.reportPath ? storageReportLabel(saved.reportPath) : ""
  };
}

/* ---------- V1.1.0：线上与本地的差异报告 ----------

   动机：导入会静默跳过已存在的记录，用户看不到 B 站那边变了什么；
   而"再跑一次导入"对上千条的收藏夹要几十分钟，代价太高。

   **关键：差异只需要列表接口，绝不调详情接口。**
   列表是 40 条/请求，详情是 1.25 条/秒。上千条约几十次请求（1~2 分钟），
   而全量导入要几十分钟 —— 相差一个数量级以上。
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
/* 两次请求之间的最小间隔 = 用户当前选的那一档（见下面的 REQUEST_SPEEDS）。
   默认「较低」是 1200ms，还会每读 8 次停 6 秒。

   这里以前写死过一个数：最早是 320ms（凭手感定的，比详情抓取快 2.5 倍，
   真机上吃过一次风控），后来对齐到详情抓取的 800ms。现在改成跟着档位走 ——
   档位是用户自己的选择，不该在代码里再写死一个默认值。

   想改节奏只有两条路：调 REQUEST_SPEEDS 里的数值，或让用户换档。
   改数值之前先想清楚：320ms 那次真机风控，就是"觉得快一点没关系"的代价。 */
/* 请求速度档位。用户可在插件弹窗里选，存在 chrome.storage.session.requestSpeed。
   用 session 而不是 local：**关掉浏览器就回到默认的「较低」** ——
   用户要求不要沿用上一次的选择。快档是一次性的决定，不该在不经意间被继承下来。

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
chrome.storage.session.get("requestSpeed")
  .then((saved) => applyRequestSpeed(saved?.requestSpeed || DEFAULT_REQUEST_SPEED))
  .catch(() => {});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "session" && changes.requestSpeed) applyRequestSpeed(changes.requestSpeed.newValue);
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

  // 用 Map 而不是每轮 find，上千条时是 O(n) 与 O(n²) 的差别
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
    if (!BcaArchiveCore.isMissingError(error)) throw error;
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
    "说明：本报告只对比「收藏夹列表」，不抓取每条视频的详情，所以很快（1000 条约 1 分钟）。",
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
    // 不写清楚，用户看到「接口自报 1000、实际返回 950」只会怀疑漏读了 50 条。
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
    // V1.4.3（P2-19）：和错误报告一样只增不减，同样保留最新 N 份
    await trimReportDirectory(directory, REPORT_KEEP_FILES, "同步差异报告.txt");
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
     4) 都没有 → 让用户先做一次导入，插件会在那一步记住 UID（V1.4.3 P2-18：
        原来这里写的是「请先打开一次 B 站收藏夹页面」，但 tabs.query 这条路在
        manifest 没有 tabs 权限时拿不到 url，照做也没用 —— 换成真的能做到的说法） */
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
  throw new Error("对比差异需要知道你的 B 站 UID，插件还没有记过。请在 B 站收藏夹页面打开插件并开始一次导入（这一步会记住 UID），再回收藏库重试。");
}

async function diffBiliFavorites(data, tabId = null) {
  // 对比差异的收尾只有两条：inner 正常返回 = 成功（有几处差异不代表失败，那正是这次要的结果），
  // inner 抛错 = 失败（UID 没记过、没设本地文件夹、读列表失败都从这里出去）
  markActivityStarted();
  publishDiffState({ running: true, text: BcaI18n.t("正在读取 B 站收藏夹列表…"), summary: null, at: Date.now() });
  try {
    const result = await diffBiliFavoritesInner(data, tabId);
    markActivityFinished(result);
    return result;
  } catch (error) {
    publishDiffState({ running: false, text: "", at: Date.now(), summary: null });
    markActivityFinished(null);
    throw error;
  }
}

async function diffBiliFavoritesInner(data, tabId = null) {
  const folderIds = new Set((Array.isArray(data?.folderIds) ? data.folderIds : []).map(String));
  const resolved = await resolveDiffUid(data?.uid, tabId);
  const folders = await listBiliFavoriteFolders(resolved.uid, resolved.tabId);
  // 收藏库（独立扩展页）手上只有本地归档名，没有远程 media_id，所以也支持按名字匹配。
  // 本地目录名与 B 站收藏夹名本来就要求一致（导入就是按名字建目录的）。
  const titles = new Set((Array.isArray(data?.folderTitles) ? data.folderTitles : []).map(String));
  const picked = folderIds.size
    ? folders.filter((folder) => folderIds.has(String(folder.id)))
    : titles.size
      ? folders.filter((folder) => titles.has(folder.title))
      : folders;
  if (!picked.length) throw new Error("没有找到要对比的收藏夹。如果本地归档改过名，请先在 B 站核对名称。");

  const root = await getRootHandle();
  if (!root) throw new Error("还没有设置本地备份文件夹，无法与本地对比。");

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
  // 1.8.21（PRV-P2-4）：页面只显示/复用「末两段」相对标签，绝对路径不出后台。
  const reportLabel = reportPath ? storageReportLabel(reportPath) : "";
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
      reportPath: reportLabel,
      folders: diffs.map((d) => ({
        folderTitle: d.folderTitle, remoteFetched: d.remoteFetched, localTotal: d.localTotal,
        collectionExists: d.collectionExists, incomplete: d.incomplete,
        added: d.added.length, removed: d.removed.length,
        newlyInvalid: d.newlyInvalid.length, recovered: d.recovered.length
      }))
    }
  });
  return { ok: true, diffs, report, reportPath: reportLabel };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
    // 与保存/导入共用串行队列，避免同时改写同一批归档文件。
    // 但导入暂停时队列会永久停住，所以这里给等待加一个上限（见 withQueueDeadline）：
    // 超时就把"队列正忙"如实回报给界面，不再让它永远显示"更新中"。
    const task = saveQueue.then(() => refreshVideoStatus(message.data, sender?.tab?.id ?? null));
    saveQueue = task.catch(() => undefined);
    withQueueDeadline(task, IMPORT_QUEUE_WAIT_TIMEOUT_MS, "更新视频状态")
      .then((result) => {
        if (result === WITH_QUEUE_DEADLINE_EXPIRED) {
          sendResponse({
            ok: false,
            busy: true,
            message: "本地队列正忙（很可能有导入正在暂停或进行中），这次不再等它了。状态更新已经排在队列里，导入继续或结束后仍会写回本地文件，届时刷新收藏库就能看到。"
          });
          return;
        }
        sendResponse(result);
      })
      .catch((error) => sendResponse({ ok: false, message: error?.message || "更新视频状态失败。" }));
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
      publishImportState({ paused: false, text: "正在取消本次导入（已写入的部分会回滚）…" }, true);
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
  if (message?.type === "bca-import-state") {
    importReconcileState()
      .then(() => { importState = { ...importState, active: importRun.active }; sendResponse({ ok: true, importState }); })
      .catch(() => sendResponse({ ok: true, importState }));
    return true;
  }
  if (message?.type === "bca-fav-counts") {
    // 只取收藏夹列表的条数，不读任何视频 —— 让界面在动手前能准确判断风险
    (async () => {
      const resolved = await resolveDiffUid(message?.uid, sender?.tab?.id ?? null);
      const folders = await listBiliFavoriteFolders(resolved.uid, resolved.tabId);
      const wanted = new Set((Array.isArray(message?.titles) ? message.titles : []).map(String));
      const picked = wanted.size ? folders.filter((folder) => wanted.has(folder.title)) : folders;
      const counts = {};
      for (const folder of picked) counts[folder.title] = Number(folder.count) || 0;
      return { ok: true, counts, speed: requestSpeedId };
    })()
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, message: error?.message || "读取收藏夹条数失败。" }));
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
  if (message?.type === "bca-stats-commit") {
    // 1.8.17：收藏库页把「读 + 构建」的结果交回来提交（它自己不再写库）。
    commitStatsDatabaseFromPage(message)
      .then((result) => sendResponse(result))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (message?.type === "bca-pet-touch") {
    // 1.5.0：宠物挂件摸一下。没选目录 / 没权限时回 ok:false，界面侧照旧显示轮播台词。
    touchPetInDatabase().then((result) => sendResponse(result)).catch(() => sendResponse({ ok: false }));
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
    const reportImportFailure = async (error) => {
      const folders = Array.isArray(message.folderIds) ? message.folderIds.map((id) => ({ id, name: id })) : [];
      const saved = await logError(error, { folders });
      const failureText = `导入失败：${error?.message || "未知错误"}。打开插件可以看「最近状态」与错误报告。`;
      await chrome.storage.local.set({
        // 1.7.0（批次 B / P1）：失败的终态要能被弹窗认出来并展开（见 popup.js 的 refreshStatus），
        // 否则用户关掉弹窗就再也看不到「这一轮导入其实失败了」
        lastResult: { message: `导入失败：${error?.message || "未知错误"}`, createdAt: Date.now(), failed: true },
        // 1.7.20（facet-ux P1-1）：成功有 importDone、失败没有 —— 这条不对称让「关掉弹窗
        // 等结果」那条路只会对成功生效。失败时用户既没有完成对话框，也没有 importDone
        // 可补弹，只剩工具栏上一个红色 !（对读屏完全不可达）。这里补成对称的。
        importDone: { text: failureText, acknowledged: false, failed: true, at: Date.now() }
      });
      notifyImportOutcome("导入失败", `这一轮没有跑完：${error?.message || "未知错误"}。打开插件可以看「最近状态」与错误报告。`);
      // 1.8.21（PRV-P2-4）：只回末两段相对标签，绝对路径不进页面。
      sendResponse({ ok: false, message: error?.message || "导入失败。", reportPath: saved.reportPath ? storageReportLabel(saved.reportPath) : "" });
    };
    // 4.9.x：连点第二次必须在**同步代码里**就挡掉。真正的任务要等 saveQueue 空了才跑，
    // 那段等待期里 importRun.active 还是 false，只看它挡不住第二次；但放进来排队也不行 ——
    // 后一轮出队时会把前一轮判成「已经有一轮正在进行」（见 importBiliFavoritesInOrder
    // 的注释）。所以先查「有排队或有在跑」，被拒就直接回，什么都不入队。
    if (importPending > 0 || importRun.active) {
      reportImportFailure(new Error("已经有一轮导入正在进行，请先等它结束或取消它。"));
      return true;
    }
    // 入队前同步记账：任务要等 saveQueue 空了才真正开始，这段等待期里
    // importRun.active 还是 false，全靠这笔账挡住连点。出队时会由
    // importBiliFavoritesInOrder 把这笔账放掉 —— 不能记到任务结束，否则会挡住自己。
    // 1.5.1（P0-2）：记账与入队必须成对。这两行之间只有同步代码，但真在这里抛了异常
    // （saveQueue 被换成了非 thenable 之类），这笔账就再也没人放掉，之后每一轮导入都会被
    // 上面那道 (:3960) 的判断拒掉，用户只能重装扩展 —— 所以同步失败时当场把账退回。
    importPending += 1;
    let importTask;
    try {
      // 换行是刻意的：入队这一行必须自己起一行 —— test/stability.test.cjs 用
      // /^\s*importBiliFavoritesInOrder\(/m 钉住「先查 → 再记账 → 再入队」的顺序，
      // 把调用挪到 `importTask =` 后面会让那条断言看不到它（真机上正是这个顺序出的问题）。
      importTask =
        importBiliFavoritesInOrder(message.data || message, sender?.tab?.id ?? null);
    } catch (error) {
      importPending = Math.max(0, importPending - 1);
      reportImportFailure(error);
      return true;
    }
    importTask.then((result) => {
      // 落盘一份完成提示：导入要跑几分钟，用户多半已经切走页面、弹窗也关了，
      // 只在 sendMessage 回调里弹的话这次提示就永远看不到了。
      if (result?.ok !== false) {
        const text = result?.message || `导入/更新完成：新导入 ${result?.imported || 0} 个，更新 ${result?.refreshed || 0} 个。`;
        chrome.storage.local.set({ importDone: { text, acknowledged: false, at: Date.now() } }).catch(() => {});
        // 1.7.3：弹窗多半已经关了，补一条系统通知（见 notifyImportOutcome）
        notifyImportOutcome("导入完成", text);
      }
      sendResponse(result);
    }).catch(reportImportFailure);
    return true;
  }
  if (message?.type === "save-favorite") {
    // 1.7.3：导入正在跑（或已有一轮导入在排队）时不再让这次收藏干等 —— 等下去既可能碰上
    // service worker 被回收，用户也只能看着「正在归档视频…」。直接回一句能照做的话：
    // 「目前正在导入收藏夹，归档未完成，请等收藏夹导入结束后再尝试保存。」
    // 1.7.4：判据补上 importState.running —— 它是三个里最耐得住 SW 回收的一个（内存态，
    // 且启动时会按 session 里的记录复位，不会留下长期为真的残影）。
    if (importRun.active || importPending > 0 || importState.running) {
      sendResponse({ ok: false, busyImport: true });
      return true;
    }
    // 兜底文案不能省：抛出来的不一定是 Error（比如 reject 一个字符串），
    // 那时 error.message 是 undefined，前端的 BcaI18n.t(undefined) 会显示成一片空白。
    // 1.4.2（P1-3）：导入占着串行队列时这次收藏会一直等下去，所以给它加等待上限；超时就把
    // 这条记成 pendingFavorite 并把原因写进 lastResult —— 弹窗「最近状态」能直接看到，
    // 走「重新授权」那条路时也会顺手补存，用户不必回到 B 站重新收藏一次。
    withKeepAlive(runInSaveQueueWithDeadline(saveFavoriteInOrder(message.data), "保存收藏"), "保存收藏")
      .then((result) => {
        if (result?.busy) {
          chrome.storage.local.set({
            pendingFavorite: message.data,
            lastResult: { message: result.message, createdAt: Date.now() }
          }).catch(() => {});
        }
        sendResponse(result);
      })
      .catch((error) => sendResponse({ ok: false, message: error?.message || "保存收藏失败。" }));
    return true;
  }
  if (message?.type === "add-manual-video") {
    // 1.7.2：等待期间保活（见 withKeepAlive）—— 队列里可能是几分钟的导入
    withKeepAlive(runInSaveQueueWithDeadline(addManualVideoInOrder(message.data), "添加视频"), "添加视频")
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, message: error?.message || "添加视频失败。" }));
    return true;
  }
  if (message?.type === "record-favorite-error") {
    recordFavoriteError(message.data).then(sendResponse).catch((error) => sendResponse({ ok: false, message: error?.message || "记录收藏失败。" }));
    return true;
  }
  if (message?.type === "retry-pending-favorite") {
    chrome.storage.local.get("pendingFavorite").then(({ pendingFavorite }) => {
      if (!pendingFavorite) return sendResponse({ ok: false, message: "没有可补存的视频，请回到 B 站重新收藏一次。" });
      return withKeepAlive(runInSaveQueueWithDeadline(saveFavoriteInOrder(pendingFavorite), "补存视频"), "补存视频").then(sendResponse);
    }).catch((error) => sendResponse({ ok: false, message: error.message || "读取待补存视频失败。" }));
    return true;
  }
  if (message?.type === "bca-badge-clear") {
    // 用户打开了弹窗 = 结果已经摆在他眼前，角标退休（文字与底色一起复位，不留半截状态）。
    // 由插件页发消息、后台来写：角标状态和图标状态都只有后台一个写入口，语义不会分叉。
    // 同步应答，不让弹窗为了一个角标去等异步收尾。
    clearActivityBadge();
    sendResponse({ ok: true });
    return true;
  }
  if (message?.type === "get-status") {
    // 4.9：弹窗每次打开都会走这里恢复进度，所以先探活/复位，再把状态回给界面。
    // 注意：respond 的那一行是既有契约（测试会比对），保持原样。
    importReconcileState()
      .catch(() => {})
      .then(() => { importState = { ...importState, active: importRun.active }; })
      .then(() => chrome.storage.local.get(["lastResult", "lastError", "pendingFavorite", "authorizedErrorAt", "lastStorageError"]))
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
