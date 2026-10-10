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
const breadcrumbRoot = document.getElementById("breadcrumbRoot");
const storageUsage = document.getElementById("storageUsage");
const statusDot = document.querySelector(".status-dot");
const chooseRoot = document.getElementById("chooseRoot");
const refreshLibraryButton = document.getElementById("refreshLibrary");
const diffLibraryButton = document.getElementById("diffLibrary");
const diffDialog = document.getElementById("diffDialog");
const diffDialogStatus = document.getElementById("diffDialogStatus");
const diffDialogBody = document.getElementById("diffDialogBody");
const diffConfirm = document.getElementById("diffConfirm");
const diffConfirmDetail = document.getElementById("diffConfirmDetail");
const diffRiskyDialog = document.getElementById("diffRiskyDialog");
const resultDialog = document.getElementById("resultDialog");
const resultDialogTitle = document.getElementById("resultDialogTitle");
const resultDialogText = document.getElementById("resultDialogText");
const resultDialogIcon = document.getElementById("resultDialogIcon");
const resultDialogTutorial = document.getElementById("resultDialogTutorial");
const diffRiskyText = document.getElementById("diffRiskyText");
const welcomeChoose = document.getElementById("welcomeChoose");
const welcome = document.getElementById("welcome");
const welcomeCopy = document.querySelector(".welcome-copy");
const welcomeFootnote = document.querySelector(".welcome-footnote");
const library = document.getElementById("library");
const currentCollection = document.getElementById("currentCollection");
const pageTitle = document.getElementById("pageTitle");
const resultSummary = document.getElementById("resultSummary");
const scanNotice = document.getElementById("scanNotice");
const scanNoticeText = document.getElementById("scanNoticeText");
const dismissScanNoticeButton = document.getElementById("dismissScanNotice");
const importHint = document.getElementById("importHint");
const dismissImportHintButton = document.getElementById("dismissImportHint");
const scanProgress = document.getElementById("scanProgress");
const videoPager = document.getElementById("videoPager");
const viewGridButton = document.getElementById("viewGrid");
const viewListButton = document.getElementById("viewList");

const safetyNotice = document.getElementById("safetyNotice");
const markDownloadedDialog = document.getElementById("markDownloadedDialog");
const markDownloadedPath = document.getElementById("markDownloadedPath");
const markDownloadedStatus = document.getElementById("markDownloadedStatus");
const markDownloadedGo = document.getElementById("markDownloadedGo");
const markDownloadedCancel = document.getElementById("markDownloadedCancel");
const githubBanner = document.getElementById("githubBanner");
const githubBannerLink = document.getElementById("githubBannerLink");
const dismissGithubBannerButton = document.getElementById("dismissGithubBanner");
const videoGrid = document.getElementById("videoGrid");
const searchInput = document.getElementById("searchInput");
const sortSelect = document.getElementById("sortSelect");
const themeBall = document.getElementById("themeBall");
const themeBallIcon = document.getElementById("themeBallIcon");
const themeMenu = document.getElementById("themeMenu");
const localeBall = document.getElementById("localeBall");
const localeMenu = document.getElementById("localeMenu");
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
const upFilterSelect = document.getElementById("upFilter");
const tagFilterSelect = document.getElementById("tagFilter");
const collectionFilterInput = document.getElementById("collectionFilter");
const collectionFilterEmpty = document.getElementById("collectionFilterEmpty");
const failurePanel = document.getElementById("failurePanel");
const failureList = document.getElementById("failureList");
const toggleFailuresButton = document.getElementById("toggleFailures");
const copyFailuresButton = document.getElementById("copyFailures");
const clearFailuresButton = document.getElementById("clearFailures");
const exportConfigButton = document.getElementById("exportConfig");
const importConfigButton = document.getElementById("importConfig");
const configFileInput = document.getElementById("configFileInput");
const batchManageButton = document.getElementById("batchManage");
const batchToolbar = document.getElementById("batchToolbar");
const selectedCount = document.getElementById("selectedCount");
const selectVisibleButton = document.getElementById("selectVisible");
const exitBatchButton = document.getElementById("exitBatch");
const moveSelectedButton = document.getElementById("moveSelected");
const downloadSelectedButton = document.getElementById("downloadSelected");
const updateSelectedButton = document.getElementById("updateSelected");
const statusConfirm = document.getElementById("statusConfirm");
const statusConfirmCount = document.getElementById("statusConfirmCount");
const statusConfirmMore = document.getElementById("statusConfirmMore");
const statusConfirmProgress = document.getElementById("statusConfirmProgress");
const statusConfirmCancel = document.getElementById("statusConfirmCancel");
const statusConfirmGo = document.getElementById("statusConfirmGo");
const deleteSelectedButton = document.getElementById("deleteSelected");

let rootHandle = null;
let collections = [];
let selectedCollection = "*";
let toastTimer = 0;
let pendingDeleteAction = null;
let deleteInProgress = false;
let collectionCreateInProgress = false;
let videoAddInProgress = false;
let selectionMode = false;
let videoFilter = "all";
// 4.6：UP 主 / 标签两个精确筛选，值取自当前范围（纯本地计算，不发请求）
let upFilter = "all";
let tagFilter = "all";
let selectedVideoIds = new Set();
let visibleVideoIds = [];
let pendingCollectionAction = null;
let collectionOrder = [];
let draggedCollectionName = "";
let downloadStatusCheckRunning = false;
let lastSelectedVideoId = "";
// 分页与视图（4.1）：默认每页 24 个，网格显示；两项都会记住
// 4.8.1：一行正好 5 个，24/48/96 会让最后一行缺一个，改成 5 的整数倍
const PAGE_SIZES = [25, 50, 100];
let pageSize = PAGE_SIZES[0];
let currentPage = 1;
let pageCount = 1;
let viewMode = "grid";
let statusRefreshInProgress = false;
// 顶部“本地收藏夹占用”的递归统计状态：防止重复并发扫描，只保留最后一次请求的根目录
let storageUsageRunning = false;
let storageUsageQueuedRoot = null;
// 4.6：上一次扫描的统计（进度、缓存命中）与当前是否强制全量
let lastScanInfo = null;
let scanNoticeRefresh = null;
let forceFullScan = false;
// 4.6：最近一次「更新视频状态」的失败项（内存态，刷新页面即清空）
let refreshFailures = [];
let failuresExpanded = false;
// 4.6：非 <dialog> 浮层的焦点陷阱栈，保证 Tab 不会跑到浮层外面
const focusTraps = [];

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
      tx.onerror = () => reject(tx.error || new Error(BcaI18n.t("本地备份文件夹授权失败。")));
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

/* ---------------- 4.9：封面 blob: URL 的引用计数 ----------------

   一个封面 URL 会被两处引用：① 扫描缓存里的条目（record.cover）；
   ② 由这条记录派生出来的 video 对象（卡片和详情面板的 <img> 直接用它）。
   所以「淘汰缓存条目就 revoke」是不对的：条目被淘汰时，正在显示的卡片可能还在用同一个
   URL（卡片封面带 loading="lazy"，没滚到的还没开始取），revoke 之后就会变成裂图。
   这里改成引用计数：谁都不用了（计数归零）才 revoke。

   同一个 URL 会不会被两条缓存记录引用？不会。每条记录的封面都只来自它自己那一次
   readCover() → URL.createObjectURL()，一次调用产出一个唯一 URL；命中缓存时
   readArchiveRecord 复用同一个 record 对象（Object.assign 出来的副本只是共享同一个
   字符串，不会新建 URL）。因此这里不需要额外的「已 revoke」Set：URL 只可能在计数
   归零的那一次被 revoke，随后立刻从表里删掉，重复调用会被 has() 直接挡下。 */
const coverRefCounts = new Map();

function addCoverRef(url) {
  if (!url || !String(url).startsWith("blob:")) return;
  coverRefCounts.set(url, (coverRefCounts.get(url) || 0) + 1);
}

function releaseCoverRef(url) {
  if (!url || !coverRefCounts.has(url)) return;
  const left = coverRefCounts.get(url) - 1;
  if (left > 0) { coverRefCounts.set(url, left); return; }
  coverRefCounts.delete(url);
  URL.revokeObjectURL(url);
}

// 页面卸载兜底：表里剩下的就是全部还没 revoke 的 URL
function revokeAllCoverRefs() {
  for (const url of coverRefCounts.keys()) URL.revokeObjectURL(url);
  coverRefCounts.clear();
}

// 封面 blob: URL 由扫描缓存持有（见 readArchiveRecord），引用计数归零时才 revoke
async function readCover(fileHandle) {
  const url = URL.createObjectURL(await fileHandle.getFile());
  // 缓存条目先持有一份；派生出的 video 对象在 videoFromArchiveRecord 里再加一份
  addCoverRef(url);
  return url;
}

function field(info, key) { return info.fields[key] || ""; }

// “未知 / 无 / -”这类占位值等于没有数据，不能当成内容显示
function realField(info, key) {
  const value = field(info, key);
  return value && !BcaArchiveCore.isPlaceholderValue(value) ? value : "";
}

// 存档里的「失效原因」→ 界面文案。返回空串表示这条记录没写原因（老存档，或「更新视频状态」
// 自己标的失效）——调用方按「已失效」兜底，绝不能显示「未知」：「未知」等于什么都没说，
// 而「已失效」至少是确定的事实。
// 按值 switch 而不是查表：BcaI18n.t() 的 key 必须是字面量（测试会扫），切语言后每次渲染现翻。
function invalidReasonText(reason) {
  const text = String(reason || "").trim();
  if (!text) return "";
  switch (text) {
    case "其他": return BcaI18n.t("其他");
    case "版权原因": return BcaI18n.t("版权原因");
    case "违规内容": return BcaI18n.t("违规内容");
    case "视频已失效": return BcaI18n.t("视频已失效");
    case "UP主自行删除": return BcaI18n.t("UP主自行删除");
    case "已锁定": return BcaI18n.t("已锁定");
    // 表外的值（将来 B 站新增枚举）原样显示，不吞掉、也不冒充「其他」
    default: return text;
  }
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

// 4.8：「已下载？点击标记」会在视频目录里放一个说明文件。有它在，目录就不是空的，
// 扫描能正常识别；文件内容也顺便告诉用户下一步该做什么。
const DOWNLOAD_MARKER_FILE = "请将视频放到这里.txt";
const DOWNLOAD_MARKER_TEXT = "请将别的地方下载的视频复制或移动到此处";

async function inspectDownloadDirectory(directory) {
  const result = { hasFiles: false, hasMedia: false, marked: false };
  for await (const entry of directory.values()) {
    if (entry.kind === "file") {
      result.hasFiles = true;
      result.hasMedia ||= BcaArchiveCore.isMediaFileName(entry.name);
      result.marked ||= entry.name === DOWNLOAD_MARKER_FILE;
    } else if (entry.kind === "directory") {
      const child = await inspectDownloadDirectory(entry);
      result.hasFiles ||= child.hasFiles;
      result.hasMedia ||= child.hasMedia;
      result.marked ||= child.marked;
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
  // 4.9：**下载根目录不存在 ≠ 下载目录是空的**。原来这里返回空 Map，调用方会当成
  // 「确实一个下载文件都没有」，于是把所有视频的「已下载」标记清掉、hasDownloadFiles
  // 变假（「删除本地归档」里的「同时删除关联下载」会跟着一起永久隐藏）。
  // 用户把 000视频下载 改名/移走、或自选下载目录的句柄丢了，都会走到这里；那只是
  // 一次「状态未知」，和权限被拒一样返回 null，由调用方保留已知状态：
  //   · refreshDownloadStatuses 拿到 null 直接 return，一个标记都不动；
  //   · scanRoot 把 null 传给 downloadStateFromIndex，它退回 previous 里的旧状态。
  // 首次使用（还没建 000视频下载）不受影响：那时 previous 本来就是空的，
  // downloadStateFromIndex 返回 downloaded:false / hasFiles:false，界面和以前一模一样。
  if (!parent) return null;
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
          const match = { name: entry.name, collectionName: collection.name, handle: entry, hasFiles: contents.hasFiles, hasMedia: contents.hasMedia, marked: contents.marked };
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

/* ---------------- 4.6：增量扫描（按 lastModified + size 的缓存） ----------------

   每次进页面重读全部 视频信息.txt 在大目录上很慢，所以按「文件 lastModified + size」做一层缓存：
   命中就复用上次解析出来的记录（含已生成的封面 blob: URL），未命中才真的读文件。
   几条硬要求：
   1. 缓存**按根目录区分**——用 WeakMap 给每个目录句柄发一个自增 id 当键前缀，换目录必然失效；
   2. 任何一个文件的 lastModified 或 size 变了就重新读那一个文件，不做整体复用；
   3. 目录列表本身**每次重新枚举**，所以新增/删除目录一定反映得出来（缓存只省文件读取）；
   4. 「刷新」按钮走强制全量（clearArchiveCache），缓存出问题时永远有退路；
   5. 读取失败（权限被撤、文件被占用）不写进缓存，避免把一次偶发失败固化下来。
   缓存只在内存里，页面关掉就没了，不写 localStorage / chrome.storage。 */
const ARCHIVE_CACHE_MAX_PER_ROOT = 4000;
const archiveCache = new Map();        // rootKey -> Map<"收藏夹/目录", entry>
const lastScanRecordCount = new Map(); // rootKey -> 上次扫描的记录数，用于先给一行 0/N
const rootKeyIds = new WeakMap();
let rootKeySeq = 0;

function rootCacheKey(handle) {
  if (!handle) return "root:none";
  let id = rootKeyIds.get(handle);
  if (!id) { id = `root:${++rootKeySeq}`; rootKeyIds.set(handle, id); }
  return id;
}

function archiveCacheFor(rootKey) {
  let store = archiveCache.get(rootKey);
  if (!store) { store = new Map(); archiveCache.set(rootKey, store); }
  return store;
}

// 丢弃一条缓存条目：把它持有的封面 URL 引用交还回去（计数归零才会真的 revoke）
function dropCacheEntry(entry) {
  releaseCoverRef(entry?.record?.cover);
}

// 「刷新」按钮的退路：逐条交还引用后再整表丢弃，不能直接 delete 掉整张表
function clearArchiveCache(handle) {
  const key = rootCacheKey(handle);
  const store = archiveCache.get(key);
  if (store) for (const entry of store.values()) dropCacheEntry(entry);
  archiveCache.delete(key);
}

function cacheEntryFor(store, name, size, lastModified) {
  const entry = store.get(name);
  if (!entry || entry.size !== size || entry.lastModified !== lastModified) return null;
  // 命中就算「刚用过」：Map 保持插入序，把它挪到末尾，扫描到后面时不会被当成最旧的淘汰
  store.delete(name);
  store.set(name, entry);
  return entry.record;
}

function storeCacheEntry(store, name, size, lastModified, record) {
  // 文件内容变了：旧条目作废，它持有的封面 URL 也一并交还（这条记录已被新纪录取代）
  const existing = store.get(name);
  if (existing) { store.delete(name); dropCacheEntry(existing); }
  // 4.9：这里原来是 store.clear()，有两个问题：① 4000 条以上的库每轮扫描都会从零重读，
  // 缓存等于没有；② 被清掉的条目再也没人 revoke 它们的封面 blob: URL —— 正是下面那句
  // 注释想避免的泄漏。改成按 Map 的插入序淘汰**最旧的一条**（配合 cacheEntryFor 的
  // 「命中即刷新位置」构成 LRU）。上限仍然是 ARCHIVE_CACHE_MAX_PER_ROOT。
  if (store.size >= ARCHIVE_CACHE_MAX_PER_ROOT) {
    const oldestKey = store.keys().next().value;
    if (oldestKey !== undefined) {
      const oldest = store.get(oldestKey);
      store.delete(oldestKey);
      dropCacheEntry(oldest);
    }
  }
  store.set(name, { size, lastModified, record });
}

// 命中缓存时必须复用同一个 blob: URL：重复 createObjectURL 会不断泄漏内存
async function recordCover(recordEntry, cachedRecord) {
  if (cachedRecord) return cachedRecord.cover || "";
  // 4.9：封面有两代文件名。优先读新的 WebP（小得多），退回老档案的真 PNG。
  let coverHandle = await optionalFileHandle(recordEntry, "封面.webp");
  if (!coverHandle) coverHandle = await optionalFileHandle(recordEntry, "封面.png");
  if (!coverHandle) return "";
  return readCover(coverHandle);
}

// 读一条归档记录。命中缓存时只取 File 的元数据（不读正文），未命中才 getFile().text()。
async function readArchiveRecord(collectionName, recordEntry, cache, stats) {
  const cacheName = `${collectionName}/${recordEntry.name}`;
  const infoHandle = await optionalFileHandle(recordEntry, "视频信息.txt");
  if (!infoHandle) return null;
  const meta = await (await infoHandle.getFile());
  const cachedRecord = cacheEntryFor(cache, cacheName, meta.size, meta.lastModified);
  if (cachedRecord) {
    const cover = await recordCover(recordEntry, cachedRecord);
    if (cover) {
      stats.hits += 1;
      return Object.assign({}, cachedRecord, { cover });
    }
  }
  const raw = await meta.text();
  if (!raw.includes("【基本信息】")) return null;
  const info = parseInfo(raw);
  if (!field(info, "视频标题")) return null;
  const cover = await recordCover(recordEntry, null);
  // 没有封面就不是一条合法归档，交给上层按「跳过」处理（和 4.5 的行为一致）
  if (!cover) return null;
  const share = splitInfoDescription(info);
  const record = { info, share, savedAt: field(info, "信息保存于"), cover };
  storeCacheEntry(cache, cacheName, meta.size, meta.lastModified, record);
  stats.reads += 1;
  return record;
}

// collections 被整批替换时，上一批 video 对象持有的封面 URL 要交还引用计数。
// 只在扫描成功、确定要换掉 collections 之前调用；扫描失败时旧对象还在显示，不能交还。
function releaseVideoCoverRefs() {
  for (const video of allVideos()) releaseCoverRef(video.cover);
}

// 详情面板是唯一能在 collections 被换掉之后还留在页面上的 DOM（刷新按钮、扫描完成后
// 它不会自动关闭），所以它显示的那张封面要单独记一笔引用：换集合时不会被 revoke，
// 关掉详情、或换成另一个视频时才交还。没有这一笔，「刷新时详情面板还开着」就可能
// 把面板里那张（可能还没加载完的 loading="lazy"）封面 revoke 成裂图。
let detailCoverUrl = "";

function retainDetailCover(url) {
  if (url === detailCoverUrl) return;
  releaseDetailCover();
  if (!url) return;
  detailCoverUrl = url;
  addCoverRef(url);
}

function releaseDetailCover() {
  if (!detailCoverUrl) return;
  releaseCoverRef(detailCoverUrl);
  detailCoverUrl = "";
}

function videoFromArchiveRecord(collectionName, recordEntry, record, downloadIndex, previousVideos) {
  const info = record.info;
  const share = record.share;
  const url = field(info, "视频链接");
  const title = field(info, "视频标题") || recordEntry.name;
  const date = field(info, "视频收藏时间") || recordEntry.name;
  const bvid = field(info, "BV号");
  const aid = field(info, "av号");
  const upName = field(info, "UP主昵称");
  const category = field(info, "分区");
  const tags = tagsFromInfo(info);
  const id = `${collectionName}/${recordEntry.name}`;
  const previous = previousVideos.get(id);
  const downloadState = BcaArchiveCore.downloadStateFromIndex(collectionName, videoIdentifierKeys({ bvid, aid }), downloadIndex, previous);
  // 这条 video 也会持有封面 URL：缓存条目即使被淘汰，只要它还在显示就不能 revoke
  addCoverRef(record.cover);
  // 4.9：搜索比对串在扫描时拼一次就够，不必每敲一个键给每条记录重新 join + toLocaleLowerCase。
  // 字段顺序与取值必须和原来 matchesBaseFilters 里那份完全一致（join 会把 undefined 写成 ""），
  // 否则搜索命中范围会悄悄变。
  const searchIndex = [title, upName, bvid, category, collectionName, share.description, ...tags].join(" ").toLocaleLowerCase();
  return {
    id,
    collection: collectionName,
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
    // 老存档没有「失效原因」这一行，读回来是空串，不是「未知」
    invalidReason: invalidReasonText(field(info, "失效原因")),
    upName,
    upMid: field(info, "UP主UID"),
    upHome: field(info, "UP主主页"),
    upFans: realField(info, "UP主粉丝数"),
    favoriteAt: date,
    savedAt: record.savedAt,
    timestamp: parseDate(date, recordEntry.name),
    category,
    duration: field(info, "视频时长"),
    publishDate: field(info, "视频发布时间"),
    description: share.description,
    stats: statsFromInfo(info, share.stats),
    tags,
    searchIndex,
    info,
    cover: record.cover
  };
}

/* ---------------- 4.6：扫描进度提示（DOM 写入按帧合并，避免每条记录都触发重排） ---------------- */

  // 4.9.3：**element 必须是只放文字的节点**（例如 <span>），不能用带子元素的容器 ——
  // 这里是用 textContent 写的，会把容器的子节点整个抹掉。scanNotice 就踩过这个坑：
  // 它自 4.8.3 起装了文字 span 和关闭按钮，被本函数清空过一次之后就再也显示不出文字了。
function progressNotifier(element, render) {
  if (!element) return { update() {}, flush() {}, stop() {} };
  let frame = 0;
  let hasValue = false;
  let value = null;
  const cancel = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  };
  const paint = () => {
    frame = 0;
    if (!hasValue) return;
    element.textContent = render(value);
  };
  return {
    update(next) { value = next; hasValue = true; if (!frame) frame = requestAnimationFrame(paint); },
    flush() { cancel(); if (hasValue) element.textContent = render(value); },
    stop() { cancel(); hasValue = false; }
  };
}

// 4.8.3：通知可关闭。关掉后记住当时那段文字，下次扫描结果一样就保持隐藏，
// 结果变了（比如这次命中了缓存、上次没有）才重新出现——既不烦人，也不丢掉新信息。
let dismissedScanNotice = "";

function setScanNotice(text) {
  if (!scanNotice) return;
  const value = text || "";
  scanNoticeText.textContent = value;
  scanNotice.hidden = !value || value === dismissedScanNotice;
}

// displayRoot() 收尾时把「读取进度 + 缓存命中 + 读取失败」拼成一条提示
function refreshScanNotice() {
  if (scanNoticeRefresh) { scanNoticeRefresh.flush(); scanNoticeRefresh.stop(); scanNoticeRefresh = null; }
  const info = lastScanInfo;
  if (!info) return;
  const lines = [];
  if (info.total) lines.push(BcaI18n.t("本次扫描 {count} 条记录，其中 {reused} 条直接复用缓存。", { count: info.total, reused: info.hits }));
  if (info.issues.length) {
    lines.push(BcaI18n.t("有 {count} 个目录未能读取：{list}", {
      count: info.issues.length,
      list: `${info.issues.slice(0, 4).join("；")}${info.issues.length > 4 ? "；…" : ""}`
    }));
  }
  setScanNotice(lines.join("\n"));
}

async function scanRoot(handle, preserveDownloadStatuses = true) {
  const scanned = [];
  const issues = [];
  const downloadIndex = await scanDownloadedDirectories(handle);
  const previousVideos = new Map(preserveDownloadStatuses ? allVideos().map((video) => [video.id, video]) : []);
  const timestampPattern = /^\d{4}年\d{1,2}月\d{1,2}日\d{1,2}时\d{1,2}分\d{1,2}秒(?:_\d+)?$/;
  // 强制全量（「刷新」按钮）时先丢掉这个根目录的缓存
  const cacheKey = rootCacheKey(handle);
  if (forceFullScan) clearArchiveCache(handle);
  const cache = archiveCacheFor(cacheKey);
  const stats = { hits: 0, reads: 0, processed: 0, total: 0 };
  // 目录列表本身每次重新枚举，缓存只省文件读取，所以新增/删除目录一定反映得出来
  const collections = [];
  for await (const collectionEntry of handle.values()) {
    if (collectionEntry.kind !== "directory" || ["错误报告", "001错误报告", "002同步报告", "视频下载", "000视频下载"].includes(collectionEntry.name)) continue;
    collections.push(collectionEntry);
  }
  for (const collectionEntry of collections) {
    const records = [];
    for await (const recordEntry of collectionEntry.values()) {
      if (recordEntry.kind === "directory" && timestampPattern.test(recordEntry.name)) records.push(recordEntry);
    }
    stats.total += records.length;
  }
  const progress = progressNotifier(scanNoticeText, (value) => BcaI18n.t("正在读取 {done}/{total}…", value));
  try {
    for (const collectionEntry of collections) {
      const videos = [];
      for await (const recordEntry of collectionEntry.values()) {
        if (recordEntry.kind !== "directory" || !timestampPattern.test(recordEntry.name)) continue;
        stats.processed += 1;
        if (stats.processed % 8 === 0) progress.update({ done: stats.processed, total: stats.total });
        try {
          const record = await readArchiveRecord(collectionEntry.name, recordEntry, cache, stats);
          if (!record) continue;
          videos.push(videoFromArchiveRecord(collectionEntry.name, recordEntry, record, downloadIndex, previousVideos));
        } catch (error) {
          issues.push(`${collectionEntry.name}/${recordEntry.name}：${error.message || BcaI18n.t("读取失败")}`);
        }
      }
      videos.sort((a, b) => b.timestamp - a.timestamp);
      scanned.push({ name: collectionEntry.name, videos });
    }
  } finally {
    progress.flush();
  }
  scanned.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  // hits/reads/total 挂在返回值上，界面用它显示「本次命中缓存多少条」
  return { collections: scanned, issues, stats: { hits: stats.hits, reads: stats.reads, total: stats.total } };
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
  const query = collectionFilterInput ? collectionFilterInput.value.trim().toLocaleLowerCase() : "";
  const visible = query ? collections.filter((item) => item.name.toLocaleLowerCase().includes(query)) : collections;
  const allLabel = BcaI18n.t("全部收藏");
  const showAllRow = !query || allLabel.toLocaleLowerCase().includes(query);
  collectionTotal.textContent = String(collections.length);
  if (collectionFilterEmpty) collectionFilterEmpty.hidden = !query || visible.length > 0 || showAllRow;
  // 过滤只是隐藏行，不动 collections 本身：拖动排序与其它逻辑照旧
  const rows = [
    ...(showAllRow ? [{ name: allLabel, key: "*", count: total, glyph: "library" }] : []),
    ...visible.map((item) => ({ name: item.name, key: item.name, count: item.videos.length, glyph: "collection" }))
  ];
  // 过滤时会被隐藏的行里可能有焦点，重画前先记下，重画后还给同一个收藏夹
  const focusedKey = document.activeElement?.dataset?.collectionKey || "";
  collectionList.replaceChildren(...rows.map((row) => {
    const wrapper = document.createElement("div");
    wrapper.className = "collection-row";
    const button = document.createElement("button");
    button.className = `collection-button${selectedCollection === row.key ? " active" : ""}`;
    button.type = "button";
    button.dataset.collectionKey = row.key;
    button.setAttribute("aria-current", selectedCollection === row.key ? "page" : "false");
    button.innerHTML = `<span class="collection-glyph" aria-hidden="true">${BcaIcons.svg(row.glyph)}</span><span class="collection-name"></span>${row.key === "*" ? "" : `<span class="collection-drag-handle" title="${escapeHtml(BcaI18n.t("按住拖动调整顺序"))}" aria-hidden="true">${BcaIcons.svg("grip")}</span>`}<span class="collection-count tnum">${row.count}</span>`;
    button.querySelector(".collection-name").textContent = row.name;
    button.addEventListener("click", () => {
      if (selectedCollection !== row.key) selectedVideoIds.clear();
      selectedCollection = row.key;
      resetPaging();
      closeDetail();
      renderCollections();
      // 切换收藏范围 = 换数据源，选项池要跟着换
      refreshVideoFilterOptions();
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
  if (focusedKey) {
    const target = [...collectionList.querySelectorAll(".collection-button")].find((item) => item.dataset.collectionKey === focusedKey);
    if (target) target.focus();
  }
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
    // 没有 BV/av 号的记录没法更新，按可更新的条数判断
    updateSelectedButton.disabled = !records.some(canRefreshStatus);
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

/* ---------------- 4.6：UP 主 / 标签 精确筛选（纯本地，不发任何请求） ---------------- */

// 出现次数从多到少，同数量按字典序；用于两个下拉的选项顺序
function countByFrequency(values) {
  const counts = new Map();
  for (const value of values) {
    const text = String(value || "").trim();
    if (!text) continue;
    counts.set(text, (counts.get(text) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "zh-CN"))
    .map(([value, count]) => ({ value, count }));
}

// 选项列表要跟着搜索与 #videoFilter 的筛选结果走，但**不受自己的当前选择影响**——
// 否则一旦选了某个 UP 主，其它 UP 主就从下拉里消失，再也换不回去。
function populateSelectOptions(select, options, allLabel, currentValue) {
  const previous = currentValue ?? select.value;
  const nodes = [new Option(allLabel, "all")];
  for (const item of options) nodes.push(new Option(`${item.value}（${item.count}）`, item.value));
  select.replaceChildren(...nodes);
  select.value = options.some((item) => item.value === previous) ? previous : "all";
  return select.value;
}

function syncVideoFilterOptions(videosForOptions) {
  if (upFilterSelect) upFilter = populateSelectOptions(upFilterSelect, countByFrequency(videosForOptions.map((video) => video.upName)), BcaI18n.t("全部 UP 主"), upFilter);
  if (tagFilterSelect) tagFilter = populateSelectOptions(tagFilterSelect, countByFrequency(videosForOptions.flatMap((video) => video.tags)), BcaI18n.t("全部标签"), tagFilter);
}

// 4.9：选项池**只在数据源或筛选条件变化时**重算，不再挂在 renderVideos 上。
// renderVideos 要为翻页、切视图、勾选、改每页数量等一堆操作服务，而选项池每次都要做
// 词频统计 + 全排序 + 重建上千个 <option>；原来它跟着 renderVideos 跑，等于每敲一个
// 字符都重建一次（10000 条时每次按键 0.5~3 秒）。语义没有变：池子仍然按
// 「当前收藏范围 + #videoFilter + 搜索词」算，仍然**不受 upFilter / tagFilter 自身影响**。
function refreshVideoFilterOptions() {
  // 与 renderVideos 一致：筛选值以 <select> 当前值为准
  videoFilter = videoFilterSelect.value;
  syncVideoFilterOptions(selectedVideos().filter((video) => matchesBaseFilters(video, searchQuery())));
}

function legacySearchIndex(video) {
  return [video.title, video.upName, video.bvid, video.category, video.collection, video.description, ...video.tags].join(" ").toLocaleLowerCase();
}

// 筛选值以外的条件（搜索 + #videoFilter），用来算下拉选项池
function matchesBaseFilters(video, query) {
  if (videoFilter === "invalid" && !video.isInvalid) return false;
  if (videoFilter === "downloaded" && !video.downloaded) return false;
  if (!query) return true;
  // searchIndex 是扫描时预拼好的同一份串；万一没有（老对象）就现拼，宁可慢也不能搜不到
  return (video.searchIndex ?? legacySearchIndex(video)).includes(query);
}

function matchesVideoFilters(video, query) {
  if (!matchesBaseFilters(video, query)) return false;
  if (upFilter !== "all" && video.upName !== upFilter) return false;
  // 标签精确到「整条标签」，不做子串匹配
  if (tagFilter !== "all" && !video.tags.includes(tagFilter)) return false;
  return true;
}

// 搜索框当前的关键词（小写）。下拉选项池与 renderVideos 必须用同一份，
// 否则「按搜索结果收窄选项」的语义就会和列表对不上。
function searchQuery() { return searchInput.value.trim().toLocaleLowerCase(); }

function renderVideos() {
  const collectionName = selectedCollection === "*" ? BcaI18n.t("全部收藏") : selectedCollection;
  currentCollection.textContent = collectionName;
  pageTitle.textContent = collectionName;
  const videos = selectedVideos();
  batchManageButton.disabled = videos.length === 0;
  addVideoButton.disabled = selectedCollection === "*";
  addVideoButton.title = selectedCollection === "*" ? BcaI18n.t("请先选择一个收藏夹") : BcaI18n.t("添加视频到“{name}”", { name: selectedCollection });
  videoFilter = videoFilterSelect.value;
  const query = searchQuery();
  // 选项池已移到 refreshVideoFilterOptions()：只在数据源/筛选条件变化时重建（见那里的注释）
  const matching = videos.filter((video) => matchesVideoFilters(video, query));
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
    : query || upFilter !== "all" || tagFilter !== "all" ? BcaI18n.t("{shown} / {total} 个视频", { shown: matching.length, total: videos.length }) : BcaI18n.t("{count} 个视频", { count: videos.length });
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
    // 失效视频的副标题位置改说原因：有原因就「已失效 · UP主自行删除」，
    // 老存档没写原因就只显示「已失效」。有效视频一个字都不变。
    card.querySelector(".card-up").textContent = video.isInvalid
      ? (video.invalidReason ? `${BcaI18n.t("已失效")} · ${video.invalidReason}` : BcaI18n.t("已失效"))
      : (video.upName || video.bvid || BcaI18n.t("本地收藏视频"));
    // 4.6：卡片上显示相对时间，完整时间放到 title 上（详情面板保持原样）
    const dateText = relativeTime(video.favoriteAt);
    const dateCell = card.querySelector(".card-date");
    dateCell.textContent = dateText;
    if (dateText) card.title = `${video.favoriteAt}（${compactDate(video.favoriteAt)}）`;
    card.addEventListener("click", (event) => {
      if (!selectionMode) { openDetail(video, card); return; }
      if (event.shiftKey) { selectVideoRange(video.id); return; }
      lastSelectedVideoId = video.id;
      setVideoSelected(video.id, !selectedVideoIds.has(video.id));
    });
    card.addEventListener("keydown", (event) => {
      if (event.target !== card) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        if (selectionMode) setVideoSelected(video.id, !selectedVideoIds.has(video.id));
        else openDetail(video, card);
        return;
      }
      // 4.6：方向键在卡片间移动焦点。左右按顺序走，上下按当前列数跳行；
      // 输入框/下拉框里的事件不会走到这里（event.target !== card）。
      if (!ARROW_KEYS.has(event.key)) return;
      if (moveCardFocus(event.key)) event.preventDefault();
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

// 4.6：卡片方向键导航。网格列数是自适应的（auto-fill），所以从实际布局算：
// 统计与第一张卡片同一 offsetTop 的卡片数就是列数；竖列视图自然是 1 列。
const ARROW_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"]);

function moveCardFocus(key) {
  const cards = [...videoGrid.querySelectorAll(".video-card")];
  if (cards.length < 2) return false;
  const current = cards.indexOf(document.activeElement);
  if (current < 0) return false;
  const top = cards[0].offsetTop;
  let columns = 0;
  while (columns < cards.length && cards[columns].offsetTop === top) columns += 1;
  if (columns < 1) columns = 1;
  let target = current;
  if (key === "ArrowLeft") target = current - 1;
  else if (key === "ArrowRight") target = current + 1;
  else if (key === "ArrowUp") target = current - columns;
  else if (key === "ArrowDown") target = current + columns;
  else if (key === "Home") target = 0;
  else if (key === "End") target = cards.length - 1;
  if (target < 0 || target >= cards.length || target === current) return false;
  cards[target].focus();
  cards[target].scrollIntoView({ block: "nearest" });
  return true;
}

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

/* ---------------- 4.6：配置导出 / 导入 ----------------

   只导出「界面偏好」：主题、语言、每页数量、视图模式、收藏夹排序，以及当前这一页的
   筛选偏好。**绝不导出**目录授权句柄（IndexedDB 里的 rootHandle / downloadFolder）、
   任何 B 站数据、任何错误报告内容，也不做除用户点选之外的文件访问。 */
const CONFIG_APP_ID = "bili-vault/library-settings";
const CONFIG_VERSION = 1;
// 配置文件的显示名：里面是给机器/人读的英文标识，不进词典（不是界面文字）
const CONFIG_NAME = "Bili Vault · library settings";

function currentFilterPreferences() {
  return {
    search: searchInput?.value || "",
    videoFilter: videoFilterSelect?.value || "all",
    upFilter,
    tagFilter,
    sort: sortSelect?.value || "newest"
  };
}

function buildConfigPayload() {
  return {
    app: CONFIG_APP_ID,
    version: CONFIG_VERSION,
    name: CONFIG_NAME,
    exportedAt: new Date().toISOString(),
    preferences: {
      theme: BcaTheme.current(),
      locale: BcaI18n.locale(),
      pageSize,
      viewMode,
      collectionOrder: [...collectionOrder],
      filters: currentFilterPreferences()
    }
  };
}

function downloadConfigFile() {
  try {
    const payload = buildConfigPayload();
    // 带 BOM，Windows 记事本打开也不会乱码
    const blob = new Blob([`\ufeff${JSON.stringify(payload, null, 2)}\n`], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `bili-vault-config-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    showToast(BcaI18n.t("配置已导出。"));
  } catch (error) {
    showToast(BcaI18n.t("导出配置失败：{message}", { message: error?.message || BcaI18n.t("未知错误") }));
  }
}

// 导入前逐项校验：任何一项不认识就退回默认值，不让坏文件把界面写成空白
function sanitizeConfigPreferences(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const filters = source.filters && typeof source.filters === "object" ? source.filters : {};
  const pageSizeValue = Number(source.pageSize);
  const search = typeof filters.search === "string" ? filters.search.slice(0, 200) : "";
  const videoFilterValue = ["all", "invalid", "downloaded"].includes(filters.videoFilter) ? filters.videoFilter : "all";
  const sortValue = ["newest", "oldest", "title", "views"].includes(filters.sort) ? filters.sort : "newest";
  return {
    theme: BcaTheme.isSupported(source.theme) ? source.theme : null,
    locale: BcaI18n.isSupported(source.locale) ? source.locale : null,
    pageSize: PAGE_SIZES.includes(pageSizeValue) ? pageSizeValue : null,
    viewMode: source.viewMode === "list" || source.viewMode === "grid" ? source.viewMode : null,
    collectionOrder: Array.isArray(source.collectionOrder) ? source.collectionOrder.filter((name) => typeof name === "string").slice(0, 500) : [],
    filters: {
      search,
      videoFilter: videoFilterValue,
      upFilter: typeof filters.upFilter === "string" ? filters.upFilter : "all",
      tagFilter: typeof filters.tagFilter === "string" ? filters.tagFilter : "all",
      sort: sortValue
    }
  };
}

async function applyConfigPreferences(preferences, rawOrder) {
  // 主题存 localStorage（theme.js 要同步读它防闪色），所以这里调 BcaTheme.use 而不是写 chrome.storage
  if (preferences.theme) BcaTheme.use(preferences.theme);
  if (preferences.locale) await BcaI18n.use(preferences.locale);
  if (preferences.pageSize) pageSize = preferences.pageSize;
  if (preferences.viewMode) viewMode = preferences.viewMode;
  // 收藏夹排序只在配置里带了排序、且本机确实有这些收藏夹时才写，
  // 否则会把用户现有的顺序覆盖成一份对不上的清单
  if (rawOrder.length && collections.some((collection) => rawOrder.includes(collection.name))) {
    collectionOrder = rawOrder;
    try { await chrome.storage.local.set({ collectionOrder }); } catch (_) {}
  }
  searchInput.value = preferences.filters.search;
  videoFilterSelect.value = preferences.filters.videoFilter;
  videoFilter = videoFilterSelect.value;
  upFilter = preferences.filters.upFilter;
  tagFilter = preferences.filters.tagFilter;
  sortSelect.value = preferences.filters.sort;
  saveViewSettings();
  applyViewMode();
  resetPaging();
}

async function importConfigFromText(text) {
  let payload;
  try {
    // 导出时写了 BOM，这里去掉再解析
    payload = JSON.parse(String(text || "").replace(/^\ufeff/, ""));
  } catch (_) {
    throw new Error(BcaI18n.t("这个文件不是合法的 JSON，无法导入。"));
  }
  if (!payload || typeof payload !== "object" || payload.app !== CONFIG_APP_ID) {
    throw new Error(BcaI18n.t("这不是哔哩藏库导出的配置文件。"));
  }
  const preferences = sanitizeConfigPreferences(payload.preferences);
  const rawOrder = Array.isArray(payload.preferences?.collectionOrder) ? preferences.collectionOrder : [];
  // upFilter / tagFilter 指向的 UP 主或标签可能已经不在本地库里，扫描后统一落回「全部」
  await applyConfigPreferences(preferences, rawOrder);
  if (rootHandle) await displayRoot(rootHandle, selectedCollection, BcaI18n.t("已导入配置"));
  // 没有根目录时数据源是空的：选项池按空数据源重建一次（与 4.6 的行为一致，会落回「全部」）
  else { renderCollections(); refreshVideoFilterOptions(); renderVideos(); }
}


/* ---------------- 4.4：更新视频状态 ---------------- */

// 4.5：「更新视频状态」从页面标题栏移到视频详情里，一次只刷新当前这一条，
// 避免批量刷一堆接口触发风控。statusRefreshInProgress 期间禁用按钮。
function refreshTargetOf(video) {
  return video?.bvid || video?.aid ? { collection: video.collection, directory: video.directory } : null;
}

// 4.5.1：单条与批量都先过一遍确认对话框，把「别频繁刷接口」讲清楚
const STATUS_BATCH_LIMIT = 80;
let statusPendingTargets = [];
let statusPendingSource = "detail";
let statusShowingResult = false;
// 4.6：后台每条都会回一次 bca-status-progress，这里记住「第几条」好拼成本地化的 N/M
let statusProgressState = { done: 0, total: 0, title: "" };

function resetStatusProgress() {
  statusProgressState = { done: 0, total: 0, title: "" };
}

// 后台的进度文案固定是中文（service worker 不参与多语言），所以只从里面取出
// 已经算好的「3/20」与标题，再用本地语言重新拼一遍；取不到就原样显示。
function statusProgressText(state) {
  const counter = state.done && state.total ? `${state.done}/${state.total}` : "";
  if (!counter) return state.title || "";
  return state.title
    ? BcaI18n.t("正在更新视频状态 {counter}：{title}", { counter, title: state.title })
    : BcaI18n.t("正在更新视频状态 {counter}…", { counter });
}

function applyStatusProgress(message) {
  const text = String(message?.text || "");
  const match = text.match(/(\d+)\s*\/\s*(\d+)/);
  if (match) {
    statusProgressState.done = Number(match[1]);
    statusProgressState.total = Number(match[2]);
    const rest = text.slice((match.index || 0) + match[0].length).replace(/^[\s：:]+/, "").trim();
    if (rest) statusProgressState.title = rest;
  } else if (text) {
    statusProgressState.title = text;
  }
  statusConfirmProgress.hidden = false;
  statusConfirmProgress.textContent = statusProgressText(statusProgressState);
}

/* ---------------- 4.6：最近一次失败的记录 ----------------

   以前失败要去 001错误报告/*.txt 里翻。这里把 bca-refresh-video-stats 的返回值
   收成一份可读清单（有 failures 数组就用它，没有就退回 reportPath 提示）。
   **不修改 background.js**：两种返回结构都兼容。 */
function normalizeFailureEntry(entry) {
  if (entry && typeof entry === "object") {
    const collection = String(entry.collection || entry.collectionName || "").trim();
    const directory = String(entry.directory || entry.directoryName || "").trim();
    const name = String(entry.name || entry.title || entry.path || `${collection}/${directory}`.replace(/^\/+|\/+$/g, "")).trim();
    const message = String(entry.message || entry.error || entry.reason || "").trim();
    return { name, message, text: message ? `${name}：${message}` : name };
  }
  const text = String(entry || "").trim();
  const [name, ...rest] = text.split(/[：:]/);
  return { name: name.trim(), message: rest.join("：").trim(), text };
}

function setRefreshFailures(entries, reportPath = "") {
  const stamp = Date.now();
  const seen = new Set();
  refreshFailures = [];
  for (const entry of entries) {
    const failure = normalizeFailureEntry(entry);
    if (!failure.text || seen.has(failure.text)) continue;
    seen.add(failure.text);
    refreshFailures.push({ ...failure, reportPath: String(reportPath || ""), at: stamp });
  }
  renderFailures();
}

// 后台没有回 failures 数组时至少还有报告文件路径，用它给个提示（不改 background.js）
function lastReportPath() {
  return refreshFailures.find((failure) => failure.reportPath)?.reportPath || "";
}

function failureLines() {
  const lines = refreshFailures.map((failure) => failure.text);
  const reportPath = lastReportPath();
  if (reportPath) lines.push(BcaI18n.t("完整报告：{path}", { path: reportPath }));
  return lines;
}

function renderFailures() {
  if (!failurePanel) return;
  // 只看「最近一次」：清空或下一次成功刷新后入口就消失
  const hasEntries = refreshFailures.length > 0;
  const reportPath = lastReportPath();
  failurePanel.hidden = !hasEntries && !reportPath;
  if (failurePanel.hidden) return;
  const rows = refreshFailures.map((failure) => {
    const row = document.createElement("div");
    row.className = "failure-row";
    row.setAttribute("role", "listitem");
    const path = document.createElement("span");
    path.className = "failure-row-path";
    path.textContent = failure.name;
    row.append(path);
    if (failure.message) {
      const message = document.createElement("span");
      message.className = "failure-row-message";
      message.textContent = failure.message;
      row.append(message);
    }
    return row;
  });
  failureList.replaceChildren(...rows);
  if (reportPath) {
    const note = document.createElement("p");
    note.className = "failure-note";
    note.textContent = BcaI18n.t("完整报告：{path}", { path: reportPath });
    failureList.append(note);
  }
  // 少于三条时不值得再折叠一层，直接摊开（列表本身仍可滚动）
  const collapsible = refreshFailures.length >= 3;
  failureList.hidden = collapsible && !failuresExpanded;
  toggleFailuresButton.hidden = !collapsible;
  toggleFailuresButton.setAttribute("aria-expanded", String(failuresExpanded));
  toggleFailuresButton.textContent = failuresExpanded ? BcaI18n.t("收起") : BcaI18n.t("查看详情");
  clearFailuresButton.hidden = refreshFailures.length < 1;
  copyFailuresButton.hidden = !hasEntries && !reportPath;
}

function clearRefreshFailures() {
  refreshFailures = [];
  failuresExpanded = false;
  renderFailures();
}

function statusDetailText(result) {
  if (result.markedInvalid) return BcaI18n.t("解析发现已失效：已保留原有资料，只标记为已失效。");
  if (result.updated) return BcaI18n.t("已更新播放量、点赞、粉丝数等数值。");
  return BcaI18n.t("接口返回的数据与本地一致，没有需要改写的内容。");
}

function statusSummaryText(result) {
  return BcaI18n.t("本次处理 {processed} 条：更新 {updated} 条，新标记失效 {markedInvalid} 条，无变化 {unchanged} 条，失败 {failed} 条。", {
    processed: result.processed,
    updated: result.updated,
    markedInvalid: result.markedInvalid,
    unchanged: result.unchanged,
    failed: result.failed
  });
}

function canRefreshStatus(video) {
  return Boolean(video?.bvid || video?.aid);
}

function openStatusConfirm(videos, source) {
  if (statusRefreshInProgress) return;
  const targets = videos.map(refreshTargetOf).filter(Boolean);
  if (!targets.length) {
    showToast(source === "batch" ? BcaI18n.t("所选的记录都没有 BV/av 号，无法更新状态。") : BcaI18n.t("这条记录没有 BV/av 号，无法更新状态。"));
    return;
  }
  statusPendingTargets = targets;
  statusPendingSource = source;
  statusShowingResult = false;
  resetStatusProgress();
  const capped = Math.min(targets.length, STATUS_BATCH_LIMIT);
  statusConfirmCount.textContent = BcaI18n.t("本次将更新 {count} 条记录。", { count: capped });
  statusConfirmMore.hidden = targets.length <= capped;
  if (targets.length > capped) {
    statusConfirmMore.textContent = BcaI18n.t("所选较多，本次只处理前 {count} 条；完成后可以再点一次继续。", { count: capped });
  }
  statusConfirmProgress.hidden = true;
  statusConfirmProgress.textContent = "";
  statusConfirmGo.disabled = false;
  statusConfirmCancel.disabled = false;
  statusConfirmGo.textContent = BcaI18n.t("开始更新");
  statusConfirm.showModal();
}

/* 4.4 起后台每处理一条视频就回一条 bca-status-progress，看门狗据此判断"它还活着"：
   连续 STATUS_REFRESH_IDLE_TIMEOUT_MS 没有任何回报，就认定后台被回收或接口吊死。
   没有它的时候，刷新期间「取消」是禁用的、Esc 被 preventDefault，
   后台一挂用户面对的就是一个所有按钮都点不动的模态框，只能刷新整页。
   单条最坏耗时 ≈ 页面代理 15s + 直连 15s + 800ms 间隔 ≈ 31s，所以 60s 不会误杀正常任务。 */
const STATUS_REFRESH_IDLE_TIMEOUT_MS = 60000;
let statusWatchdogTimer = 0;
let statusWatchdogExpire = null;

function disarmStatusRefreshWatchdog() {
  clearTimeout(statusWatchdogTimer);
  statusWatchdogTimer = 0;
  statusWatchdogExpire = null;
}

// 收到一条进度就把看门狗往后推：只有"连续静默"才算卡住
function feedStatusRefreshWatchdog() {
  if (!statusWatchdogExpire) return;
  clearTimeout(statusWatchdogTimer);
  statusWatchdogTimer = setTimeout(fireStatusRefreshWatchdog, STATUS_REFRESH_IDLE_TIMEOUT_MS);
}

function fireStatusRefreshWatchdog() {
  const expire = statusWatchdogExpire;
  disarmStatusRefreshWatchdog();
  if (expire) expire();
}

/* 带看门狗的 sendMessage。超时不是"后台回了失败"，所以单独标一个 TimeoutError，
   文案里也说清楚部分记录可能已经更新，别让用户以为整批白跑了。 */
function sendMessageWatched(message, timeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      disarmStatusRefreshWatchdog();
      callback();
    };
    statusWatchdogExpire = () => {
      const error = new Error(BcaI18n.t("后台 {seconds} 秒没有响应，已停止等待；部分记录可能已经更新，可先点右上角的「刷新」查看，或点「重试」继续。", { seconds: Math.round(timeoutMs / 1000) }));
      error.name = "TimeoutError";
      finish(() => reject(error));
    };
    statusWatchdogTimer = setTimeout(fireStatusRefreshWatchdog, timeoutMs);
    try {
      chrome.runtime.sendMessage(message, (response) => {
        const runtimeError = chrome.runtime.lastError;
        finish(() => runtimeError ? reject(new Error(runtimeError.message)) : resolve(response));
      });
    } catch (error) {
      finish(() => reject(error));
    }
  });
}

async function runStatusRefresh() {
  if (statusRefreshInProgress || !statusPendingTargets.length) return;
  // 已经出结果时，这个按钮变成「完成」
  if (statusShowingResult) { statusConfirm.close(); return; }
  const targets = statusPendingTargets;
  const source = statusPendingSource;
  const anchorId = source === "detail" ? detailVideo()?.id : null;
  const detailButton = detailContent.querySelector(".refresh-status");
  statusRefreshInProgress = true;
  statusConfirmGo.disabled = true;
  statusConfirmCancel.disabled = true;
  statusConfirmGo.textContent = BcaI18n.t("正在更新…");
  resetStatusProgress();
  statusConfirmProgress.hidden = false;
  statusConfirmProgress.textContent = BcaI18n.t("正在请求 B 站接口，请勿关闭页面…");
  if (detailButton) detailButton.disabled = true;
  try {
    const permission = await rootHandle.requestPermission({ mode: "readwrite" });
    if (permission !== "granted") throw new Error(BcaI18n.t("没有获得本地目录写入权限。"));
    const result = await sendMessageWatched({
      type: "bca-refresh-video-stats",
      data: { targets, limit: STATUS_BATCH_LIMIT }
    }, STATUS_REFRESH_IDLE_TIMEOUT_MS);
    if (!result?.ok) throw new Error(result?.message || BcaI18n.t("更新失败。"));
    const summary = targets.length === 1 ? statusDetailText(result) : statusSummaryText(result);
    const remaining = Number(result.remaining) || 0;
    statusConfirmProgress.textContent = summary + (remaining ? BcaI18n.t("还有 {count} 条没处理，可以再点一次继续。", { count: remaining }) : "");
    // 有失败就列出来；后台只回 reportPath 时也能用它提示，不用去翻 001错误报告
    const failures = Array.isArray(result.failures) ? result.failures : [];
    if (failures.length || result.reportPath) setRefreshFailures(failures, result.reportPath || "");
    else clearRefreshFailures();
    statusShowingResult = true;
    statusConfirmGo.textContent = BcaI18n.t("完成");
    // 到这里后台已经把状态写进文件了，下面的刷新只是界面收尾。
    // 它失败绝不能再被下面的 catch 改写成「更新失败」——那样用户会对着
    // 已经更新好的数据再点一次「重试」，白打一轮 B 站接口。
    const refreshError = await refreshAfterLocalChange(async () => {
      await displayRoot(rootHandle, selectedCollection, BcaI18n.t("已刷新"));
      if (anchorId) {
        const refreshed = allVideos().find((item) => item.id === anchorId);
        if (refreshed) {
          // displayRoot 已经重画过页面，这里再开详情不要再叠一层焦点陷阱
          openDetail(refreshed, null, { trap: false });
          const again = detailContent.querySelector(".detail-refresh-status");
          if (again) { again.hidden = false; again.textContent = summary; }
        }
      }
    });
    if (refreshError) {
      statusConfirmProgress.textContent += refreshFailureSuffix(refreshError);
      showToast(BcaI18n.t("已更新，但列表刷新失败，请手动点右上角的「刷新」。"));
    }
  } catch (error) {
    statusConfirmProgress.textContent = BcaI18n.t("更新失败：{message}", { message: error?.message || BcaI18n.t("未知错误") });
    statusConfirmGo.textContent = BcaI18n.t("重试");
    setRefreshFailures([{ name: source === "batch" ? BcaI18n.t("批量更新视频状态") : (detailVideo()?.title || BcaI18n.t("更新视频状态")), message: error?.message || BcaI18n.t("未知错误") }]);
  } finally {
    // 看门狗必须在这里收掉，否则下一批刷新会被上一批的定时器提前打断
    disarmStatusRefreshWatchdog();
    statusRefreshInProgress = false;
    statusConfirmGo.disabled = false;
    statusConfirmCancel.disabled = false;
    if (detailButton) detailButton.disabled = false;
  }
}
/* ---------------- 4.5.2：GitHub 开源横幅 ---------------- */


// 4.7：界面上的版本号带渠道前缀——测试版 beta4.7、正式版 V1.0.0。
// popup.js 里有一份同样的实现，改动时两边必须同步（测试会比对两份输出）。
const RELEASE_CHANNEL = "release";

function displayVersion(raw) {
  const version = String(raw || "");
  if (!version) return "";
  if (RELEASE_CHANNEL === "beta") return `beta${version.replace(/\.0$/, "")}`;
  return `V${version}`;
}

// 轨道只有两份文字时，宽屏上右边会空一大块；而系统开了「减少动画」后
// 动画会被压成跑一次就弹回原位，看着像坏了。这里按容器宽度补足份数，
// 并保证前后两半严格等宽，位移 50% 才能无缝衔接。
function buildBannerMarquee() {
  const track = githubBannerLink?.querySelector(".banner-scroll");
  const seed = track?.querySelector(".banner-run");
  if (!track || !seed || !githubBanner) return;
  const measure = seed.cloneNode(true);
  track.replaceChildren(measure);
  const unitWidth = measure.getBoundingClientRect().width || 260;
  const need = Math.max(1, Math.ceil(githubBanner.clientWidth / Math.max(unitWidth, 1)));
  const half = Array.from({ length: need }, (_, index) => {
    const node = seed.cloneNode(true);
    if (index > 0) node.setAttribute("aria-hidden", "true");
    return node;
  });
  const second = half.map((node) => {
    const copy = node.cloneNode(true);
    copy.setAttribute("aria-hidden", "true");
    return copy;
  });
  track.replaceChildren(...half, ...second);
  // 速度恒定：大约每秒 60px，短则不少于 14 秒
  track.style.animationDuration = `${Math.max(14, Math.round((unitWidth * need) / 60))}s`;
  // 克隆出来的图标节点还没被填充过，这里补一次
  if (globalThis.BcaIcons?.hydrate) BcaIcons.hydrate(githubBanner);
}

// 正式开源后只改这一处
const PROJECT_REPO_URL = "https://github.com/shijunan-Andrew/bili-vault";

async function restoreGithubBanner() {
  if (!githubBanner) return;
  let dismissed = false;
  try {
    const saved = await chrome.storage.local.get("githubBannerDismissed");
    dismissed = saved?.githubBannerDismissed === true;
  } catch (_) {}
  if (dismissed) return;
  githubBannerLink.href = PROJECT_REPO_URL;
  githubBanner.hidden = false;
  // 侧栏/顶栏/主区靠这个 class 一起下移，见 library.css 的 --banner-h
  document.documentElement.classList.add("banner-visible");
  buildBannerMarquee();
}

function dismissGithubBanner() {
  if (!githubBanner) return;
  githubBanner.hidden = true;
  document.documentElement.classList.remove("banner-visible");
  chrome.storage.local.set({ githubBannerDismissed: true }).catch(() => {});
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

// 4.6：卡片上的日期改成相对时间（今天 / 昨天 / 3 天前 / 2 个月前 / 2025.03），
// 完整时间放在卡片 title 上；详情面板仍用 视频收藏时间 原文。
// 按「自然日」而不是 24 小时算，所以今天 00:30 与昨天 23:30 差 1 天而不是 0 天。
function startOfDay(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function relativeDayLabel(date) {
  const today = startOfDay(new Date());
  const target = startOfDay(date);
  if (!target) return "";
  const days = Math.round((today.getTime() - target.getTime()) / 86400000);
  if (days <= 0) return BcaI18n.t("今天");
  if (days === 1) return BcaI18n.t("昨天");
  if (days < 30) return BcaI18n.t("{count} 天前", { count: days });
  return BcaI18n.t("{count} 个月前", { count: Math.max(1, Math.round(days / 30)) });
}

// 卡片上的相对时间：今天 / 昨天 / N 天前 / N 个月前 / 超过一年时只到月份（2025.03）
function relativeTime(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const match = text.match(/(\d{4})年(\d{1,2})月(\d{1,2})日(?:\s*(\d{1,2})时(\d{1,2})分(\d{1,2})秒)?/);
  // 不是归档里的中文时间格式（异常值）就退回 2026.10.09，至少不显示空白
  if (!match) return compactDate(text);
  const date = new Date(+match[1], +match[2] - 1, +match[3], +(match[4] || 0), +(match[5] || 0), +(match[6] || 0));
  const days = Math.round((startOfDay(new Date()).getTime() - startOfDay(date).getTime()) / 86400000);
  if (days >= 365) return `${match[1]}.${String(match[2]).padStart(2, "0")}`;
  return relativeDayLabel(date);
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

/* ---------------- 4.6：非 <dialog> 浮层的焦点陷阱 ----------------

   showModal() 的 <dialog> 浏览器自带焦点限制，不用管；
   但 #confirmBackdrop 与详情面板是普通 div 浮层，不补的话 Tab 会跑到背后的页面上。
   这里做一个最小的陷阱栈：打开时把焦点移进去、Tab 循环限制在浮层内、关闭后还给触发它的元素。 */
const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

function focusableWithin(container) {
  if (!container) return [];
  return [...container.querySelectorAll(FOCUSABLE_SELECTOR)].filter((element) => {
    if (element.hidden) return false;
    if (element.closest("[hidden]")) return false;
    // 没有布局盒子的元素（display:none）也拿不到焦点
    return element.offsetWidth > 0 || element.offsetHeight > 0 || element.getClientRects().length > 0;
  });
}

function trapFocus(container, preferred, restoreTo) {
  if (!container || focusTraps.some((trap) => trap.container === container)) return;
  const trap = { container, restoreTo: restoreTo || document.activeElement, keydown: null };
  focusTraps.push(trap);
  const first = preferred && !preferred.hidden && preferred.offsetParent !== null ? preferred : (focusableWithin(container)[0] || container);
  if (first === container && !container.hasAttribute("tabindex")) container.setAttribute("tabindex", "-1");
  try { first.focus(); } catch (_) {}
  trap.keydown = (event) => {
    if (event.key !== "Tab" || focusTraps[focusTraps.length - 1] !== trap) return;
    const items = focusableWithin(trap.container);
    if (!items.length) { event.preventDefault(); return; }
    const index = items.indexOf(document.activeElement);
    // 焦点已经跑出浮层时，Tab 也拉回列表里，而不是放它继续往外走
    if (index < 0) {
      event.preventDefault();
      (event.shiftKey ? items[items.length - 1] : items[0]).focus();
      return;
    }
    if (event.shiftKey && index === 0) { event.preventDefault(); items[items.length - 1].focus(); }
    else if (!event.shiftKey && index === items.length - 1) { event.preventDefault(); items[0].focus(); }
  };
  container.addEventListener("keydown", trap.keydown);
}

function releaseFocusTrap(container) {
  const index = focusTraps.findIndex((trap) => trap.container === container);
  if (index < 0) return;
  const [trap] = focusTraps.splice(index, 1);
  if (trap.keydown) container.removeEventListener("keydown", trap.keydown);
  const restoreTo = trap.restoreTo;
  if (restoreTo && document.contains(restoreTo) && typeof restoreTo.focus === "function") {
    try { restoreTo.focus(); } catch (_) {}
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

// restoreTo：关闭后焦点还给它（通常是触发它的那张卡片）；
// options.trap = false 用于「重画后重新打开同一个详情」，避免叠加第二层焦点陷阱。
function openDetail(video, restoreTo, options = {}) {
  // 面板里那张封面由引用计数单独保一份，见 retainDetailCover 的注释
  retainDetailCover(video.cover);
  detailPanel.classList.toggle("invalid-video", video.isInvalid);
  const rows = [];
  addField(rows, BcaI18n.t("收藏时间"), video.favoriteAt);
  addField(rows, BcaI18n.t("信息保存于"), video.savedAt);
  // 失效视频多一行原因；老归档没写这一行时显示「已失效」，不能显示「未知」
  if (video.isInvalid) addField(rows, BcaI18n.t("失效原因"), video.invalidReason || BcaI18n.t("已失效"));
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
  detailContent.innerHTML = `<div class="detail-cover">${safeCover(video.cover)}</div><span class="detail-collection"></span><h2 class="detail-title"></h2><p class="detail-bvid"></p>${video.url ? `<a class="button button-primary open-video" target="_blank" rel="noopener noreferrer" href="">${BcaIcons.svg("external")}${escapeHtml(BcaI18n.t("在 B 站打开视频"))}</a>` : ""}${video.isInvalid ? `<a class="button button-quiet search-invalid" target="_blank" rel="noopener noreferrer" href="">${BcaIcons.svg("search")}${escapeHtml(BcaI18n.t("全网搜索该视频"))}</a>` : ""}<section class="detail-management"><h3>${BcaIcons.svg("play")}${escapeHtml(BcaI18n.t("本地视频"))}</h3><div class="detail-primary-actions"><button class="button button-download download-local" type="button">${BcaIcons.svg("download")}${escapeHtml(BcaI18n.t("下载视频"))}</button><button class="button button-quiet open-download-directory" type="button"${video.hasDownloadFiles ? "" : " hidden"}>${BcaIcons.svg("collection-open")}${escapeHtml(BcaI18n.t("打开目录"))}</button></div><button class="button button-quiet mark-downloaded" type="button"${video.downloaded ? " hidden" : ""}>${BcaIcons.svg("check")}${escapeHtml(BcaI18n.t("已下载？点击标记"))}</button><div class="detail-secondary-actions"><button class="button button-quiet copy-download-path" type="button"${video.hasDownloadFiles ? "" : " hidden"}>${BcaIcons.svg("copy")}${escapeHtml(BcaI18n.t("复制视频目录路径"))}</button></div><p class="download-path-note" role="status" hidden></p><p class="detail-size" hidden></p><h3>${BcaIcons.svg("move")}${escapeHtml(BcaI18n.t("本地收藏管理"))}</h3><button class="button button-primary move-local" type="button">${BcaIcons.svg("move")}${escapeHtml(BcaI18n.t("移动或复制"))}</button><button class="button button-danger delete-local" type="button">${BcaIcons.svg("trash")}${escapeHtml(BcaI18n.t("删除本地归档"))}</button><p class="management-note">${escapeHtml(BcaI18n.t("这些整理操作只影响本地归档，不会更改 B 站账户中的收藏。"))}</p></section>${detailStatsHtml(video.stats)}<div class="detail-refresh"><button class="button button-quiet refresh-status" type="button">${BcaIcons.svg("refresh")}<span>${escapeHtml(BcaI18n.t("更新视频状态"))}</span></button><span class="detail-refresh-note">${escapeHtml(BcaI18n.t("重新解析播放量、点赞、UP 主粉丝数等会变化的数值，只覆盖这些数值，不改动标题、简介和标签"))}</span><p class="detail-refresh-status" role="status" hidden></p></div><h3 class="detail-section-title">${BcaIcons.svg("file")}${escapeHtml(BcaI18n.t("视频信息"))}</h3><dl class="detail-fields">${rows.join("")}</dl><h3 class="detail-section-title">${BcaIcons.svg("tag")}${escapeHtml(BcaI18n.t("标签"))}</h3>${tags}<h3 class="detail-section-title">${BcaIcons.svg("info")}${escapeHtml(BcaI18n.t("视频简介"))}</h3><p class="detail-description"></p><button class="text-button detail-description-toggle" type="button" hidden>${escapeHtml(BcaI18n.t("展开全部简介"))}</button>`;
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
  // 4.8：失效视频在 B 站已经没有可看的页面，给一个站外搜索的出口
  const searchInvalidLink = detailContent.querySelector(".search-invalid");
  if (searchInvalidLink) {
    searchInvalidLink.href = `https://www.bing.com/search?q=${encodeURIComponent(video.title || "")}`;
  }
  const markDownloadedButton = detailContent.querySelector(".mark-downloaded");
  if (markDownloadedButton) markDownloadedButton.addEventListener("click", () => openMarkDownloadedDialog(video));
  const moveButton = detailContent.querySelector(".move-local");
  if (moveButton) moveButton.addEventListener("click", () => openCollectionActionDialog([video], "detail"));
  /* 下面这一串按钮全都来自上面那段超长 innerHTML 模板。模板一改（换个 class 名、
     删掉某个按钮、条件渲染少一个分支）querySelector 就是 null，裸调 addEventListener
     会抛 TypeError，openDetail 从这里断掉：面板停在前面的半成品状态，
     用户看到的就是"点卡片没反应"。所以每一个都先判空再绑。 */
  const refreshStatusButton = detailContent.querySelector(".refresh-status");
  if (refreshStatusButton) refreshStatusButton.addEventListener("click", () => openStatusConfirm([video], "detail"));
  const downloadLocalButton = detailContent.querySelector(".download-local");
  if (downloadLocalButton) downloadLocalButton.addEventListener("click", () => openDownloadInterface([video]));
  const openDirectoryButton = detailContent.querySelector(".open-download-directory");
  if (openDirectoryButton) openDirectoryButton.addEventListener("click", () => openDownloadDirectory(video));
  const copyPathButton = detailContent.querySelector(".copy-download-path");
  if (copyPathButton) copyPathButton.addEventListener("click", () => copyDownloadPath(video));
  const deleteLocalButton = detailContent.querySelector(".delete-local");
  if (deleteLocalButton) deleteLocalButton.addEventListener("click", () => askToDeleteVideo(video));
  showDownloadSize(video).catch(() => {});
  detailPanel.classList.add("open");
  detailPanel.setAttribute("aria-hidden", "false");
  detailBackdrop.hidden = false;
  document.body.style.overflow = "hidden";
  // 详情面板不是 <dialog>，Tab 得自己限制在里面；关闭后焦点回到触发它的卡片
  if (options.trap === false) closeDetailButton.focus();
  else trapFocus(detailPanel, closeDetailButton, restoreTo);
}

const NATIVE_HOST_NAME = "com.bcatch.folder_opener";

// 本地目录打开助手（宿主启动器）以 Native Messaging 帧协议应答。失败时它会回一条
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

// 4.7：help 是一句放在最顶上并加粗的说明（本地目录打开助手未安装时的操作步骤）
function setDownloadPathNote(text, isError = false, help = "") {
  const note = detailContent.querySelector(".download-path-note");
  if (!note) return;
  note.hidden = !text && !help;
  note.textContent = "";
  if (help) {
    const strong = document.createElement("strong");
    strong.className = "download-path-help";
    strong.textContent = help;
    note.append(strong);
  }
  if (text) note.append(document.createTextNode(text));
  note.classList.toggle("error", Boolean(text || help) && isError);
}

function downloadPathParts(video) {
  return {
    collection: String(video?.downloadCollectionName || ""),
    directory: String(video?.downloadDirectoryName || "")
  };
}

// 优先向本地目录打开助手要真实绝对路径；助手不可用时退回相对路径，
// 这样即使没装助手也能手动在资源管理器里打开。
async function resolveDownloadPath(video) {
  const { collection, directory } = downloadPathParts(video);
  if (!directory) return { path: "", source: "none" };
  try {
    const response = await nativeHostRequest({ action: "resolve-directory", collectionName: collection, directoryName: directory });
    if (response.targetPath) return { path: response.targetPath, source: "host" };
  } catch (_) {}
  // 4.8.2：没装本地目录打开助手时，用用户手填的下载根目录拼出绝对路径。
  // File System Access API 出于隐私考虑不暴露绝对路径，manifest 里也没有 downloads 权限，
  // 所以没有这个设置就只能给相对路径。
  const manualRoot = await readDownloadRootPath();
  if (manualRoot) {
    return { path: BcaArchiveCore.joinDownloadPath(manualRoot, collection, directory), source: "manual" };
  }
  return { path: BcaArchiveCore.downloadPathLabel(collection, directory), source: "relative" };
}

async function openDownloadDirectory(video) {
  if (!video.hasDownloadFiles || !video.downloadDirectoryName) return;
  const { collection, directory } = downloadPathParts(video);
  setDownloadPathNote(BcaI18n.t("正在连接 Windows 原生目录助手…"));
  try {
    const response = await nativeHostRequest({ action: "open-directory", collectionName: collection, directoryName: directory });
    setDownloadPathNote(response.targetPath ? BcaI18n.t("已打开：{path}", { path: response.targetPath }) : "");
    showResultDialog(BcaI18n.t("已打开本地视频目录"),
      response.targetPath ? BcaI18n.t("已在文件资源管理器中定位到：{path}", { path: response.targetPath })
        : BcaI18n.t("已在文件资源管理器中打开视频目录。"), "ok");
  } catch (error) {
    const fallback = await resolveDownloadPath(video).catch(() => ({ path: "", source: "none" }));
    const lines = [BcaI18n.t("无法打开本地视频目录：{message}", { message: error.message })];
    if (fallback.path) {
      lines.push(fallback.source === "host"
        ? BcaI18n.t("视频目录：{path}", { path: fallback.path })
        : BcaI18n.t("视频目录（相对下载根目录）：{path}", { path: BcaArchiveCore.joinDownloadPath(BcaI18n.t("下载根目录"), collection, directory) }));
    }
    lines.push(BcaI18n.t("可以点击上面的“复制视频目录路径”手动在资源管理器地址栏粘贴打开。"));
      // 4.7：安装步骤放到最顶上并加粗——这才是用户真正要照做的一步
      const help = BcaI18n.t("若尚未安装本地目录打开助手，请运行插件目录中的 install-native-folder-opener.bat，填入本插件当前的扩展程序 ID 和下载目录（默认为根目录\\000视频下载）；安装后完全重启 Chrome 即可生效，不需要重新加载插件。");
      setDownloadPathNote(lines.join("\n"), true, help);
      // 失败要让用户真的看到 —— 底部 toast 一闪就没了
      // 弹窗里只放安装指引：错误详情、路径、"复制路径"那句话都会占满弹窗，
      // 而用户真正要照做的是安装这一步。其余信息仍在详情页的说明区。
      showResultDialog(BcaI18n.t("无法打开本地视频目录"), help, "error", { tutorial: true });
  }
}

async function copyDownloadPath(video) {
  if (!video.downloadDirectoryName) { showToast(BcaI18n.t("这条记录没有可用的下载目录信息。")); return; }
  const resolved = await resolveDownloadPath(video);
  if (!resolved.path) { showToast(BcaI18n.t("这条记录没有可用的下载目录信息。")); return; }
  try {
    await navigator.clipboard.writeText(resolved.path);
    setDownloadPathNote(resolved.source === "relative"
      ? BcaI18n.t("已复制相对路径：{path}。要复制可直接粘贴的完整路径，请在下载页填写下载根目录的绝对路径，或安装 Windows 原生目录助手。", { path: resolved.path })
      : BcaI18n.t("已复制完整路径：{path}", { path: resolved.path }));
    showToast(BcaI18n.t("已复制视频目录路径。"));
  } catch (error) {
    setDownloadPathNote(BcaI18n.t("复制失败，请手动记录：{path}", { path: resolved.path }), true);
    showToast(BcaI18n.t("复制路径失败：{message}", { message: error?.message || BcaI18n.t("浏览器拒绝了剪贴板访问") }));
  }
}

function closeDetail() {
  if (deleteInProgress) return;
  closeDeleteConfirmation();
  releaseFocusTrap(detailPanel);
  releaseDetailCover();
  detailPanel.classList.remove("open");
  detailPanel.classList.remove("invalid-video");
  detailPanel.setAttribute("aria-hidden", "true");
  detailBackdrop.hidden = true;
  document.body.style.overflow = "";
}

// 确认弹层（#confirmBackdrop）也是普通 div 浮层，四个入口共用一套打开/关闭逻辑
function openConfirmBackdrop() {
  confirmBackdrop.hidden = false;
  trapFocus(confirmBackdrop, confirmDeleteButton, document.activeElement);
}

function askToDeleteVideo(video) {
  pendingDeleteAction = { type: "video", video };
  confirmTitle.textContent = BcaI18n.t("删除本地归档？");
  confirmMessage.textContent = BcaI18n.t("将删除本地目录“{path}”及其中的封面和视频信息。B 站账户里的收藏不会改变。", { path: `${video.collection}/${video.directory}` });
  confirmDeleteButton.textContent = BcaI18n.t("删除本地文件");
  deleteDownloadsOption.hidden = !video.hasDownloadFiles;
  deleteAssociatedDownloads.checked = false;
  openConfirmBackdrop();
}

function askToDeleteCollection(collection) {
  if (!collection) return;
  pendingDeleteAction = { type: "collection", collection };
  confirmTitle.textContent = BcaI18n.t("删除整个本地收藏夹？");
  confirmMessage.textContent = BcaI18n.t("将永久删除本地收藏夹“{name}”及其全部文件（当前识别到 {count} 个视频）。此操作只影响本地归档，不会更改 B 站账户中的收藏。", { name: collection.name, count: collection.videos.length });
  confirmDeleteButton.textContent = BcaI18n.t("删除收藏夹");
  deleteDownloadsOption.hidden = !collection.videos.some((video) => video.hasDownloadFiles);
  deleteAssociatedDownloads.checked = false;
  openConfirmBackdrop();
}

function askToDeleteBatch(videos) {
  if (!videos.length) return;
  pendingDeleteAction = { type: "batch", videos };
  confirmTitle.textContent = BcaI18n.t("删除选中的本地归档？");
  confirmMessage.textContent = BcaI18n.t("将永久删除选中的 {count} 个视频目录及其中的封面和视频信息。此操作只影响本地文件，不会更改 B 站账户中的收藏。", { count: videos.length });
  confirmDeleteButton.textContent = BcaI18n.t("删除 {count} 个视频", { count: videos.length });
  deleteDownloadsOption.hidden = !videos.some((video) => video.hasDownloadFiles);
  deleteAssociatedDownloads.checked = false;
  openConfirmBackdrop();
}

function closeDeleteConfirmation() {
  if (deleteInProgress) return;
  releaseFocusTrap(confirmBackdrop);
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
  // 这一行记录的是「这条视频属于哪个 B 站收藏夹」。字段名以前叫「保存文件夹：」，
  // 和用户选的根目录撞名（同一个词指两个完全不同的东西），V1.2.0 起写入方
  // （background.js 的 buildInfo）改成「所属收藏夹：」。
  // 这里必须同时认两种标签，而且写回要用新标签：
  //   ① 老归档里还是旧标签，正则不认识就 updated === text，直接 return —— 改了收藏夹
  //      归属却什么都没发生，而且没有任何报错；
  //   ② 认出来之后写回新标签，顺手把老文件迁移掉。
  const updated = text.replace(/^(?:保存文件夹|所属收藏夹)[：:].*$/m, `所属收藏夹：${folderName}`);
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

/* ---------------- 4.8：把「在别处下载的」视频标记为已下载 ----------------

   做法：在下载根目录的「收藏夹 / 视频目录」下建一个只有说明文件的文件夹。
   这样安排有三个好处：
   1. 目录里有文件，扫描的 hasFiles 判定天然成立，不必放宽任何既有条件；
   2. 目录名以 " - BV号" 结尾，将来真正下载时 findOrCreateVideoDirectory 能凭
      BV 号认出这个目录并直接复用，不会又建一个副本；
   3. 用户把别处下载好的视频拖进去，它就成了一个完全正常的已下载视频。 */

async function markVideoDownloaded(video) {
  // 4.9.4：传 create —— 用户点的就是「新建文件夹并标记」，没有 000视频下载 就建出来
  const parent = await getWritableDownloadParent({ create: true });
  if (!parent) throw new Error(BcaI18n.t("无法创建默认下载文件夹 000视频下载，请检查本地备份文件夹的写入权限。"));
  const collectionName = BcaArchiveCore.safeName(video.collection || "未分类收藏", "未分类收藏", 120);
  const directoryName = BcaArchiveCore.videoDirectoryLabel(video, 0);
  const collectionHandle = await parent.getDirectoryHandle(collectionName, { create: true });
  const directoryHandle = await collectionHandle.getDirectoryHandle(directoryName, { create: true });
  const markerHandle = await directoryHandle.getFileHandle(DOWNLOAD_MARKER_FILE, { create: true });
  const writable = await markerHandle.createWritable();
  await writable.write(DOWNLOAD_MARKER_TEXT);
  await writable.close();
  // 立刻更新内存状态，不必等下一次整表重扫
  video.downloaded = true;
  video.hasDownloadFiles = true;
  video.downloadDirectoryName = directoryName;
  video.downloadCollectionName = collectionName;
  video.downloadDirectoryHandle = directoryHandle;
  return { collectionName, directoryName };
}

let markDownloadedVideo = null;
let markDownloadedBusy = false;

function openMarkDownloadedDialog(video) {
  markDownloadedVideo = video;
  markDownloadedPath.textContent = BcaArchiveCore.downloadPathLabel(
    BcaArchiveCore.safeName(video.collection || "未分类收藏", "未分类收藏", 120),
    BcaArchiveCore.videoDirectoryLabel(video, 0)
  );
  markDownloadedStatus.hidden = true;
  markDownloadedStatus.textContent = "";
  markDownloadedGo.disabled = false;
  if (!markDownloadedDialog.open) markDownloadedDialog.showModal();
}

async function runMarkDownloaded() {
  if (!markDownloadedVideo || markDownloadedBusy) return;
  markDownloadedBusy = true;
  markDownloadedGo.disabled = true;
  markDownloadedStatus.hidden = false;
  markDownloadedStatus.textContent = BcaI18n.t("正在建立文件夹…");
  try {
    const { directoryName } = await markVideoDownloaded(markDownloadedVideo);
    markDownloadedDialog.close();
    // 文件夹已经真的建好了（副作用完成）：从这里往后的刷新只是界面收尾，
    // 出任何错都不许再报「标记失败」——那样用户会以为没成功而不停重点。
    const refreshError = await refreshAfterLocalChange(() => {
      // 只有「已下载」这个筛选值会参与选项池的计算，其它筛选值下池子不受影响
      if (videoFilter === "downloaded") refreshVideoFilterOptions();
      renderVideos();
      // 详情面板开着、且正是这条视频时，把它重画一遍让「已下载？」按钮消失。
      // 这里必须用 detailVideo()（按 detailContent.dataset.videoId 查当前打开的那条），
      // 曾经写成 currentDetailVideo —— 那个变量根本不存在，于是这行抛 ReferenceError，
      // 被下面的 catch 当成「标记失败」弹出来。而此刻标记其实已经写完了，
      // 所以用户看到的是「提示失败、但文件真的建好了」。
      const openDetailVideo = detailVideo();
      if (openDetailVideo && openDetailVideo.id === markDownloadedVideo.id) openDetail(markDownloadedVideo);
    });
    showResultDialog(BcaI18n.t("已标记为已下载"), BcaI18n.t("文件夹：{name}", { name: directoryName }) + refreshFailureSuffix(refreshError), "ok");
  } catch (error) {
    markDownloadedStatus.textContent = BcaI18n.t("标记失败：{message}", { message: error.message });
    showResultDialog(BcaI18n.t("标记失败"), error.message, "error");
  } finally {
    markDownloadedBusy = false;
    markDownloadedGo.disabled = false;
  }
}

/* ---------------- 4.8.2：手填的下载根目录绝对路径 ----------------

   没装本地目录打开助手时，绝对路径没有别的来源。用户在下载页填一次，
   这里读出来拼路径，复制到的就是能直接粘进资源管理器的完整路径。 */

async function readDownloadRootPath() {
  try {
    const saved = await chrome.storage.local.get("downloadRootPath");
    return String(saved?.downloadRootPath || "").trim().replace(/[\\/]+$/, "");
  } catch (_) { return ""; }
}

async function getWritableDownloadParent({ create = false } = {}) {
  const mode = await readSavedSetting("downloadFolderMode");
  const savedCustom = await readSavedSetting("downloadFolder");
  const isCustom = mode === "custom" || (!mode && Boolean(savedCustom));
  let parent;
  if (isCustom) {
    if (!savedCustom) throw new Error(BcaI18n.t("自选下载目录设置已丢失，请先在下载页重新选择目录。"));
    parent = savedCustom;
  } else {
    // 4.9.4：默认下载目录只在真正下载时才被创建，从没下载过的用户根本没有它 ——
    // 「标记为已下载」会因此失败，而报错说的却是"请先到下载页选择保存位置"（指错方向）。
    // 用户既然点了「新建文件夹并标记」，就是明确要一个下载目录，这里按需建出来。
    if (create) {
      const rootPermission = await rootHandle.requestPermission({ mode: "readwrite" });
      if (rootPermission !== "granted") throw new Error(BcaI18n.t("没有获得本地备份文件夹的写入权限；请在插件弹窗里重新授权本地备份文件夹。"));
    }
    try { parent = await rootHandle.getDirectoryHandle("000视频下载", { create }); }
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
    // 默认勾选「原收藏夹」——勾上 = 保留原件并复制，取消 = 移动。
    // 复制是更安全的那个（移动会把原件从原收藏夹里拿走），所以默认选它。
    checkbox.checked = sourceCollections.has(collection.name);
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
    const summary = messages.join("；") || BcaI18n.t("没有需要整理的视频。原视频已保留。");
    showResultDialog(failures.length ? BcaI18n.t("移动或复制部分完成") : BcaI18n.t("移动或复制完成"), summary,
      failures.length ? "error" : "ok");
  } catch (error) {
    showResultDialog(BcaI18n.t("整理失败"), error?.message || BcaI18n.t("本地文件操作失败。"), "error");
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
    /* 上面的 removeEntry 都已经返回：删除是不可逆的既成事实，确认浮层也关掉了
       （用户就算再点一次也没有入口）。这里只是重画列表，displayRoot 抛错若被下面的
       catch 接住，弹出来的却是「删除失败」，用户只会再点一次「删除」再吃一次同样的错。 */
    const refreshError = await refreshAfterLocalChange(() => displayRoot(rootHandle, selectedCollection));
    if (action.type === "collection") {
      showResultDialog(BcaI18n.t("已删除本地收藏夹"), BcaI18n.t("“{name}”", { name: action.collection.name }) + downloadCleanupSuffix(downloadCleanupFailures.length) + refreshFailureSuffix(refreshError), "ok");
    } else if (action.type === "batch") {
      if (!batchResult.failures.length) setSelectionMode(false);
      showToast((batchResult.failures.length
        ? BcaI18n.t("已删除 {deleted} 个，{failed} 个失败并保留选中。{first}", { deleted: batchResult.deleted, failed: batchResult.failures.length, first: batchResult.failures[0] })
        : BcaI18n.t("已删除 {count} 个本地视频", { count: batchResult.deleted }) + downloadCleanupSuffix(downloadCleanupFailures.length)) + refreshFailureSuffix(refreshError));
    } else {
      showResultDialog(BcaI18n.t("已删除本地归档"), BcaI18n.t("本地归档文件已删除。") + downloadCleanupSuffix(downloadCleanupFailures.length) + refreshFailureSuffix(refreshError), "ok");
    }
  } catch (error) {
    showResultDialog(BcaI18n.t("删除失败"), error?.message || BcaI18n.t("本地文件操作失败。"), "error");
  } finally {
    deleteInProgress = false;
    cancelDeleteButton.disabled = false;
    confirmDeleteButton.disabled = false;
    confirmDeleteButton.textContent = action.type === "collection" ? BcaI18n.t("删除收藏夹") : action.type === "batch" ? BcaI18n.t("删除 {count} 个视频", { count: action.videos.length }) : BcaI18n.t("删除本地文件");
  }
}

/* 副作用完成之后的界面刷新统一走这里。
   删除、标记已下载、更新状态这几件事，只要对应的文件操作已经返回，就算"真的完成了"；
   而收尾的刷新（displayRoot / renderVideos / openDetail）随时可能因为一个选择器改动、
   一条脏数据抛错。它们和副作用原本挤在同一个 try 里，一抛错就被同一个 catch 改写成
   「失败」——磁盘上明明已经完成，用户看到失败提示只会再点一次。
   刷新失败只记一条日志，由调用方在成功提示后面追加半句，绝不覆盖成功结论。 */
async function refreshAfterLocalChange(run) {
  try {
    await run();
    return null;
  } catch (error) {
    console.warn("界面刷新失败（本地改动已经完成）", error);
    // 保证返回真值：调用方只关心"有没有刷新失败"，不看具体是哪个错误
    return error || new Error("refresh failed");
  }
}

// 副作用已完成、只是列表刷新失败时的统一后缀，词条只有一条
function refreshFailureSuffix(error) {
  return error ? BcaI18n.t("；但列表刷新失败，请手动点右上角的「刷新」。") : "";
}

/* 整理类操作的结果弹窗。
   这几件事（已下载标记 / 移动复制 / 删除 / 打开本地目录）失败时代价很大，
   而底部 toast 一闪就没了，用户经常看不到 —— 改成必须点掉的弹窗。
   kind: "ok" 成功、"error" 失败。 */
function showResultDialog(title, text, kind = "ok", options = {}) {
  if (!resultDialog) return;
  /* 同一个 <dialog> 连着 showModal() 会抛 InvalidStateError，而调用点几乎都没接住，
     结果是"本该弹出的失败提示反而不出现"（上一条结果还没点掉，用户以为按钮失灵）。
     已经开着就先关掉再开，等价于把内容换成新的这条。 */
  if (resultDialog.open) resultDialog.close();
  // 教程按钮只在需要"照着做一串步骤"的失败场景出现（目前是打开本地目录失败）。
  // 平时不显示，免得把普通的结果提示撑出多余的选择。
  resultDialogTutorial.hidden = !options.tutorial;
  // 标题由调用方用 BcaI18n.t("字面量") 传进来 —— 这里不能再包一层 t()，
  // 那会把变量当键（项目约定键必须是字面量，这个坑已经踩过好几次）
  resultDialogTitle.textContent = title;
  resultDialogText.textContent = String(text ?? "");
  resultDialogIcon.setAttribute("data-icon", kind === "ok" ? "check" : "alert");
  resultDialog.classList.toggle("result-dialog-error", kind !== "ok");
  resultDialog.showModal();
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
  if (["错误报告", "001错误报告", "002同步报告", "000视频下载", "视频下载"].includes(name)) throw new Error(BcaI18n.t("这是插件保留目录，请换一个名称。"));
  return name;
}

function openCreateCollectionDialog() {
  if (!rootHandle || library.hidden) { showToast(BcaI18n.t("请先选择本地备份文件夹。")); return; }
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
  // 封面 blob: URL 现在跟着缓存条目走，这里不再整批 revoke —— 缓存未命中的条目
  // 会在下次扫描时被新 URL 取代，复用中的条目则必须保留原来的 URL。
  const preserveDownloadStatuses = rootHandle === handle;
  rootHandle = handle;
  // 先按上一次的记录数给一行「正在读取 0/43…」，别让界面在这次扫描期间完全没反应
  lastScanInfo = null;
  scanNoticeRefresh = progressNotifier(scanNoticeText, (value) => BcaI18n.t("正在读取 {done}/{total}…", value));
  scanNoticeRefresh.update({ done: 0, total: lastScanRecordCount.get(rootCacheKey(handle)) || 0 });
  const result = await scanRoot(handle, preserveDownloadStatuses);
  forceFullScan = false;
  lastScanInfo = {
    hits: result.stats?.hits || 0,
    reads: result.stats?.reads || 0,
    total: result.stats?.total || 0,
    issues: result.issues
  };
  if (result.stats?.total) lastScanRecordCount.set(rootCacheKey(handle), result.stats.total);
  // 扫描成功、确定要换掉 collections 了：上一批 video 对象交还它们持有的封面 URL。
  // 放在这里（而不是扫描开始时）是为了让扫描期间的旧卡片继续正常显示封面。
  releaseVideoCoverRefs();
  collections = applyCollectionOrder(result.collections);
  const existingVideoIds = new Set(allVideos().map((video) => video.id));
  for (const id of selectedVideoIds) if (!existingVideoIds.has(id)) selectedVideoIds.delete(id);
  selectedCollection = collectionToSelect === "*" || result.collections.some((collection) => collection.name === collectionToSelect) ? collectionToSelect : "*";
  setDynamicText(rootLabel, handle.name);
    // 面包屑第一段也显示真实根目录名 —— 写死的「本地资料」看不出数据存在哪个文件夹
    if (breadcrumbRoot) setDynamicText(breadcrumbRoot, handle.name);
  statusDot.classList.add("ready");
  refreshLibraryButton.disabled = false;
  diffLibraryButton.disabled = false;
  // 扫描期间的「正在读取 N/M…」在这里收尾，换成缓存命中统计与读取失败清单
  refreshScanNotice();
  welcome.hidden = true;
  library.hidden = false;
  renderCollections();
  // 数据源变了：先按新数据重建 UP 主/标签选项池，再渲染列表（顺序与原来 renderVideos 内部一致）
  refreshVideoFilterOptions();
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

/* V1.1.0：与 B 站对比当前选中的收藏夹。
   与插件弹窗里的「先看差异」走同一条后台消息，只是这里用本地收藏夹名去匹配远程收藏夹
   （收藏库拿不到远程 media_id）。 */
// V1.1.3：点按钮先弹确认框，确认后才真的开始对比。
// （V1.1.0~V1.1.2 这里漏了 addEventListener，按钮点了完全没反应。）
/* 收藏库这边同样要防"快档 × 大收藏夹"。
   档位是全局的（存在 storage.local），但收藏库拿不到线上的确切条数，
   所以用本地该收藏夹的条数做代理 —— 数量级够用来判断风险了。 */
const RISKY_TOTAL_ITEMS = 500;
const RISKY_SPEEDS = new Set(["higher", "high"]);
let diffRiskyResolve = null;

async function confirmLibraryRiskySpeed() {
  // 必须问后台要**线上**的条数。以前用本地条数做代理，本地为空时是 0，
  // 快档跑 700 多条也不会提醒 —— 真机上就是这么漏掉的。
  // 这个查询只读收藏夹列表，通常 1~2 次请求。
  let total = 0;
  let speed = "";
  try {
    const response = await chrome.runtime.sendMessage({
      type: "bca-fav-counts",
      data: { titles: [selectedCollection] }
    });
    if (response?.ok) {
      total = Number(response.counts?.[selectedCollection]) || 0;
      speed = RISKY_SPEEDS.has(response.speed) ? response.speed : "";
    }
  } catch (_) { /* 查不到就不拦，但不能因此假装查过了 */ }
  if (!speed || total <= RISKY_TOTAL_ITEMS) return true;
  const label = speed === "high" ? "高" : "较高";
  diffRiskyText.textContent = BcaI18n.t("当前是「{speed}」档，而这个收藏夹线上有 {total} 条。建议先到插件弹窗里改用「较低」档位。",
    { speed: label, total });
  settleDiffRisky(false); // 上一次的等待先结掉，避免留下悬空的 Promise
  if (diffRiskyDialog.open) diffRiskyDialog.close();
  diffRiskyDialog.showModal();
  return new Promise((resolve) => { diffRiskyResolve = resolve; });
}

/* Promise 的 settle 只有这一个出口。以前只绑了两个按钮的 click，
   按 Esc 关掉对话框时没有任何一处调 resolve：await confirmLibraryRiskySpeed()
   从此永远挂住，「与 B 站对比」按钮点不动，而且只有刷新整页才能恢复。
   cancel（Esc）和 close（任何方式关掉）都兜住；settle 后把槽位置空，重复调用安全。 */
function settleDiffRisky(confirm) {
  const resolve = diffRiskyResolve;
  diffRiskyResolve = null;
  if (resolve) resolve(confirm);
}

diffRiskyDialog.addEventListener("cancel", () => settleDiffRisky(false));
diffRiskyDialog.addEventListener("close", () => {
  // 已经重新打开（极短时间里又发起了一次对比）说明这条 close 属于上一次，别误杀新的等待
  if (!diffRiskyDialog.open) settleDiffRisky(false);
});
document.getElementById("diffRiskyCancel").addEventListener("click", () => {
  settleDiffRisky(false);
  diffRiskyDialog.close();
});
document.getElementById("diffRiskyGo").addEventListener("click", () => {
  settleDiffRisky(true);
  diffRiskyDialog.close();
});

diffLibraryButton.addEventListener("click", () => {
  if (selectedCollection === "*") {
    showToast(BcaI18n.t("请先在左侧选择一个收藏夹，再与 B 站对比。"));
    return;
  }
  diffConfirmDetail.textContent = BcaI18n.t("将对比「{name}」与 B 站上的同名收藏夹。", { name: selectedCollection });
  diffConfirm.showModal();
});
document.getElementById("resultDialogTutorial").addEventListener("click", () => {
  // 扩展页面可以直接被扩展自己打开，不需要 web_accessible_resources
  chrome.tabs.create({ url: chrome.runtime.getURL("tutorial.html") });
  resultDialog.close();
});
document.getElementById("resultDialogClose").addEventListener("click", () => resultDialog.close());
document.getElementById("diffConfirmCancel").addEventListener("click", () => diffConfirm.close());
// 结果对话框的「关闭」按钮。V1.1.0 加这个对话框时同样漏了绑定 ——
// 和 diffLibraryButton 是同一个错误，所以测试里加了一条专门查"对话框里的按钮有没有被引用"。
document.getElementById("diffDialogClose").addEventListener("click", () => diffDialog.close());
document.getElementById("diffConfirmGo").addEventListener("click", async () => {
  diffConfirm.close();
  if (!await confirmLibraryRiskySpeed()) return;
  diffWithBilibili();
});

async function diffWithBilibili() {
  if (selectedCollection === "*") {
    showToast(BcaI18n.t("请先在左侧选择一个收藏夹，再与 B 站对比。"));
    return;
  }
  diffDialog.showModal();
  diffDialogBody.replaceChildren();
  diffDialogStatus.hidden = false;
  diffDialogStatus.textContent = BcaI18n.t("正在读取 B 站收藏夹列表…");
  diffLibraryButton.disabled = true;
  try {
    const response = await chrome.runtime.sendMessage({
      type: "bca-fav-diff",
      data: { folderTitles: [selectedCollection] }
    });
    if (!response?.ok) throw new Error(response?.message ? BcaI18n.t(response.message) : BcaI18n.t("对比差异失败。"));
    renderDiffDialog(response);
  } catch (error) {
    diffDialogStatus.textContent = error?.message ? BcaI18n.t(error.message) : BcaI18n.t("对比差异失败。");
  } finally {
    diffLibraryButton.disabled = false;
  }
}

function renderDiffDialog(response) {
  const diffs = Array.isArray(response?.diffs) ? response.diffs : [];
  diffDialogBody.replaceChildren();
  // 全程 textContent，不碰 innerHTML —— 收藏夹名与视频标题都是用户数据
  for (const diff of diffs) {
    const sum = document.createElement("p");
    sum.className = "diff-summary";
    sum.textContent = BcaI18n.t(
      "「{name}」线上 {remote} 条／本地 {local} 条：新增 {added}、线上已移除 {removed}、新失效 {invalid}、恢复 {recovered}。",
      { name: diff.folderTitle, remote: diff.remoteFetched, local: diff.localTotal,
        added: diff.added?.length || 0, removed: diff.removed?.length || 0,
        invalid: diff.newlyInvalid?.length || 0, recovered: diff.recovered?.length || 0 });
    diffDialogBody.append(sum);

    if (diff.incomplete) {
      const warn = document.createElement("p");
      warn.className = "diff-warning";
      warn.textContent = BcaI18n.t("本次读取可能不完整，结果仅供参考。");
      diffDialogBody.append(warn);
    }

    const groups = [
      [BcaI18n.t("新增（线上有、本地没有）"), diff.added, (x) => x.title || BcaI18n.t("(无标题)")],
      [BcaI18n.t("线上已移除（本地有、线上没有了）"), diff.removed, (x) => x.title || x.directory],
      [BcaI18n.t("新失效（本地还是正常，线上已失效）"), diff.newlyInvalid, (x) => x.title || x.directory],
      [BcaI18n.t("已恢复（本地标记失效，线上正常了）"), diff.recovered, (x) => x.title || x.directory]
    ];
    let any = false;
    for (const [title, items, render] of groups) {
      if (!items?.length) continue;
      any = true;
      const details = document.createElement("details");
      details.className = "diff-group";
      const summary = document.createElement("summary");
      summary.textContent = `${title} ${items.length}`;
      details.append(summary);
      const list = document.createElement("ul");
      list.className = "diff-list";
      for (const item of items.slice(0, 200)) {
        const li = document.createElement("li");
        li.textContent = render(item);
        list.append(li);
      }
      if (items.length > 200) {
        const more = document.createElement("li");
        more.className = "diff-more";
        more.textContent = BcaI18n.t("…还有 {count} 条，完整列表见报告文件。", { count: items.length - 200 });
        list.append(more);
      }
      details.append(list);
      diffDialogBody.append(details);
    }
    if (!any) {
      const same = document.createElement("p");
      same.className = "diff-summary";
      same.textContent = BcaI18n.t("四项差异都是 0 —— 本地与线上完全一致。");
      diffDialogBody.append(same);
    }
    if (response.reportPath) {
      const path = document.createElement("p");
      path.className = "diff-path";
      path.textContent = BcaI18n.t("报告：{path}", { path: response.reportPath });
      diffDialogBody.append(path);
    }
  }
  diffDialogStatus.hidden = true;
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
      const downloaded = BcaArchiveCore.downloadMatchIsDownloaded(match);
      const hasDownloadFiles = Boolean(match?.hasFiles);
      if (video.downloaded !== downloaded || video.hasDownloadFiles !== hasDownloadFiles || video.downloadDirectoryName !== (match?.name || "") || video.downloadCollectionName !== (match?.collectionName || "")) changed = true;
      video.downloaded = downloaded;
      video.hasDownloadFiles = hasDownloadFiles;
      video.downloadDirectoryName = match?.name || "";
      video.downloadCollectionName = match?.collectionName || "";
      video.downloadDirectoryHandle = match?.handle || null;
    }
    // 只有「已下载」这个筛选值会参与选项池的计算，其它筛选值下池子不受影响
    if (changed && videoFilter === "downloaded") refreshVideoFilterOptions();
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
  if (!rootHandle) { showToast(BcaI18n.t("请先选择本地备份文件夹。")); return; }
  const collectionToKeep = selectedCollection;
  setBusy(true, "refreshing");
  // 「刷新」按强制全量走：清掉这个根目录的缓存并重新读所有文件。
  // 增量缓存一旦出问题（文件时间戳被外部工具改写、内容被手工编辑过），这里是退路。
  forceFullScan = true;
  clearArchiveCache(rootHandle);
  try {
    const permissionRequest = rootHandle.requestPermission({ mode: "read" });
    if (await permissionRequest !== "granted") throw new Error(BcaI18n.t("没有获得本地目录读取权限。"));
    await displayRoot(rootHandle, collectionToKeep, BcaI18n.t("已刷新"));
  } catch (error) {
    if (error?.name !== "AbortError") showToast(BcaI18n.t("刷新失败：{message}", { message: error?.message || BcaI18n.t("无法读取本地目录。") }));
  } finally { forceFullScan = false; setBusy(false); }
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
    // 面包屑第一段也显示真实根目录名 —— 写死的「本地资料」看不出数据存在哪个文件夹
    if (breadcrumbRoot) setDynamicText(breadcrumbRoot, handle.name);
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
    setDynamicText(welcomeCopy, BcaI18n.t("上次选择的目录暂时无法访问，请重新选择本地备份文件夹。"));
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
  // 4.5.1：批量更新状态——用勾选的记录，不是当前收藏夹的全部视频
  updateSelectedButton.addEventListener("click", () => openStatusConfirm(selectedRecords(), "batch"));
  statusConfirmGo.addEventListener("click", () => { runStatusRefresh().catch(() => {}); });
  statusConfirmCancel.addEventListener("click", () => { if (!statusRefreshInProgress) statusConfirm.close(); });
  statusConfirm.addEventListener("cancel", (event) => { if (statusRefreshInProgress) event.preventDefault(); });
// 4.9：搜索输入加 250ms 防抖。原来每敲一个字符就同步跑一整遍：全量筛选 + 排序 + 重画
// 卡片 + 重建上千个 <option>，10000 条时每次按键要卡 0.5~3 秒。防抖后一次连续输入
// 只在停下来之后跑一次。**语义不变**：停止输入 250ms 后必然渲染一次，最终结果与原来一致。
const SEARCH_DEBOUNCE_MS = 250;
let searchDebounceTimer = 0;

function applySearchNow() {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = 0;
  resetPaging();
  refreshVideoFilterOptions();
  renderVideos();
}

searchInput.addEventListener("input", () => {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(applySearchNow, SEARCH_DEBOUNCE_MS);
});
sortSelect.addEventListener("change", () => { resetPaging(); renderVideos(); });
dismissGithubBannerButton?.addEventListener("click", dismissGithubBanner);
dismissScanNoticeButton?.addEventListener("click", () => {
  dismissedScanNotice = scanNoticeText?.textContent || "";
  if (scanNotice) scanNotice.hidden = true;
});
markDownloadedGo?.addEventListener("click", runMarkDownloaded);
markDownloadedCancel?.addEventListener("click", () => markDownloadedDialog?.close());
let bannerResizeTimer = 0;
window.addEventListener("resize", () => {
  if (githubBanner?.hidden) return;
  clearTimeout(bannerResizeTimer);
  bannerResizeTimer = setTimeout(buildBannerMarquee, 150);
});

/* ---------------- 4.5.1：主题与语言悬浮球 ---------------- */

// 主题标签必须写成字面量：词条工具靠扫描 t("...") 取词，
// 从 theme.js 的对象里取 label 会扫不到，那三个词就永远不会被翻译。
const THEME_ICONS = { system: "monitor", light: "sun", dark: "moon" };

function themeLabel(id) {
  if (id === "light") return BcaI18n.t("白天");
  if (id === "dark") return BcaI18n.t("夜晚");
  return BcaI18n.t("跟随系统");
}

// 4.6：键盘操作悬浮球菜单——↑↓ 在选项间移动、Home/End 跳首尾、Enter/Space 选中、
// Esc 关闭并把焦点还给球。选中态本来就是 aria-checked，这里不另造状态。
function dockMenuOptions(menu) {
  return [...menu.querySelectorAll('button[role="menuitemradio"]')];
}

function moveDockMenuFocus(menu, key) {
  const options = dockMenuOptions(menu);
  if (!options.length) return false;
  const current = options.indexOf(document.activeElement);
  if (key === "Home") { options[0].focus(); return true; }
  if (key === "End") { options[options.length - 1].focus(); return true; }
  if (key === "ArrowDown") { options[current < 0 ? 0 : (current + 1) % options.length].focus(); return true; }
  if (key === "ArrowUp") { options[current < 0 ? options.length - 1 : (current - 1 + options.length) % options.length].focus(); return true; }
  return false;
}

function activeDockMenu() {
  if (themeMenu && !themeMenu.hidden) return { menu: themeMenu, ball: themeBall };
  if (localeMenu && !localeMenu.hidden) return { menu: localeMenu, ball: localeBall };
  return null;
}

function handleDockMenuKeydown(event) {
  const active = activeDockMenu();
  if (!active) return;
  // 输入框/下拉框里的方向键属于光标与选项，不能被菜单抢走
  if (event.target instanceof HTMLElement && ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName)) return;
  if (event.key === "Escape") { event.preventDefault(); closeDockMenus(); active.ball.focus(); return; }
  if (event.key === "Tab") { closeDockMenus(); return; }
  const option = event.target.closest?.('button[role="menuitemradio"]');
  if ((event.key === "Enter" || event.key === " ") && option && active.menu.contains(option)) {
    event.preventDefault();
    option.click();
    return;
  }
  if (!event.key.startsWith("Arrow") && event.key !== "Home" && event.key !== "End") return;
  if (moveDockMenuFocus(active.menu, event.key)) event.preventDefault();
}

function closeDockMenus(except) {
  for (const [ball, menu] of [[themeBall, themeMenu], [localeBall, localeMenu]]) {
    if (menu === except) continue;
    menu.hidden = true;
    ball.setAttribute("aria-expanded", "false");
  }
}

function toggleDockMenu(ball, menu) {
  const open = menu.hidden;
  closeDockMenus(menu);
  menu.hidden = !open;
  ball.setAttribute("aria-expanded", String(open));
  // 打开后把焦点交给当前选中项（没有就交给第一项），键盘用户不用先 Tab 进去
  if (open) {
    const options = dockMenuOptions(menu);
    const checked = options.find((option) => option.getAttribute("aria-checked") === "true");
    (checked || options[0])?.focus();
  }
}

function buildDockMenu(menu, entries, currentId, onPick) {
  menu.replaceChildren(...entries.map((entry) => {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("role", "menuitemradio");
    button.setAttribute("aria-checked", String(entry.id === currentId));
    button.dataset.value = entry.id;
    button.innerHTML = `${BcaIcons.svg(entry.icon)}<span></span><span class="dock-check">${BcaIcons.svg("check")}</span>`;
    button.querySelector("span").textContent = entry.label;
    button.addEventListener("click", () => {
      onPick(entry.id);
      closeDockMenus();
    });
    return button;
  }));
}

// 选中态就地刷新，不重建按钮：重建会把键盘焦点弄丢（切主题时 onChange 又会重画一次）
function syncDockMenuChecked(menu, currentId) {
  if (!menu) return;
  for (const option of dockMenuOptions(menu)) {
    option.setAttribute("aria-checked", String(option.dataset.value === currentId));
  }
}

function renderDockMenus() {
  buildDockMenu(
    themeMenu,
    BcaTheme.modes().map((item) => ({ id: item.id, icon: THEME_ICONS[item.id] || "monitor", label: themeLabel(item.id) })),
    BcaTheme.current(),
    (id) => BcaTheme.use(id)
  );
  buildDockMenu(
    localeMenu,
    // 语言名用各自的写法，不翻译
    BcaI18n.locales().map((item) => ({ id: item.id, icon: "globe", label: item.label })),
    BcaI18n.locale(),
    (id) => { BcaI18n.use(id).catch(() => {}); }
  );
  // 球的图标跟着当前主题走：跟随系统=显示器、白天=太阳、夜晚=月亮
  themeBallIcon.setAttribute("data-icon", THEME_ICONS[BcaTheme.current()] || "monitor");
  themeBallIcon.dataset.iconReady = "";
  BcaIcons.hydrate(themeBallIcon.parentElement);
  syncDockMenuChecked(themeMenu, BcaTheme.current());
  syncDockMenuChecked(localeMenu, BcaI18n.locale());
}

renderDockMenus();
themeBall.addEventListener("click", (event) => { event.stopPropagation(); toggleDockMenu(themeBall, themeMenu); });
localeBall.addEventListener("click", (event) => { event.stopPropagation(); toggleDockMenu(localeBall, localeMenu); });
themeMenu.addEventListener("click", (event) => event.stopPropagation());
localeMenu.addEventListener("click", (event) => event.stopPropagation());
themeMenu.addEventListener("keydown", handleDockMenuKeydown);
localeMenu.addEventListener("keydown", handleDockMenuKeydown);
// 菜单打开时焦点在菜单里，事件不会冒泡到 document，所以这里只是补一层兜底
document.addEventListener("keydown", handleDockMenuKeydown);
document.addEventListener("click", () => closeDockMenus());
document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeDockMenus(); });

// 主题换成别的页面改的也要跟着更新图标
BcaTheme.onChange(() => {
  themeBallIcon.setAttribute("data-icon", THEME_ICONS[BcaTheme.current()] || "monitor");
  themeBallIcon.dataset.iconReady = "";
  BcaIcons.hydrate(themeBallIcon.parentElement);
  renderDockMenus();
});

// 切语言后要重画所有由 JS 生成的文字
function relabelAfterLocaleChange() {
  renderDockMenus();
  renderCollections();
  // 选项池的第一项（全部 UP 主 / 全部标签）是翻译过的文案，切语言要重建一次
  refreshVideoFilterOptions();
  renderVideos();
  renderFailures();
  const current = detailVideo();
  // 详情重开时不要再叠一层焦点陷阱
  if (current) openDetail(current, null, { trap: false });
}
BcaI18n.onChange(() => relabelAfterLocaleChange());
// #videoFilter 会参与选项池的计算（matchesBaseFilters），所以它变化时要重建选项池
videoFilterSelect.addEventListener("change", () => { resetPaging(); refreshVideoFilterOptions(); renderVideos(); });
clearSearch.addEventListener("click", () => {
  // 清空搜索等于换了筛选条件：取消排队中的防抖，立即按空关键词重算一次
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = 0;
  searchInput.value = "";
  resetPaging();
  refreshVideoFilterOptions();
  renderVideos();
  searchInput.focus();
});
viewGridButton?.addEventListener("click", () => setViewMode("grid"));
viewListButton?.addEventListener("click", () => setViewMode("list"));


// 4.4：更新状态时的进度回报。4.6 起同时把它接到确认框的进度行上（N/M），
// 批量更新时用户不用再盯着详情面板里那一行小字。
chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== "bca-status-progress") return;
  if (!statusRefreshInProgress) return;
  // 有进度就说明后台还活着：把看门狗往后推，正常的长任务不会被误判成卡死
  feedStatusRefreshWatchdog();
  const status = detailContent.querySelector(".detail-refresh-status");
  if (status) { status.hidden = false; status.textContent = message.text ? BcaI18n.t(message.text) : BcaI18n.t("正在更新…"); }
  applyStatusProgress(message);
});
dismissImportHintButton?.addEventListener("click", dismissImportHint);
toggleFailuresButton?.addEventListener("click", () => {
  failuresExpanded = !failuresExpanded;
  renderFailures();
});
copyFailuresButton?.addEventListener("click", () => copyToClipboard(failureLines().join("\n"), BcaI18n.t("已复制失败清单。")));
clearFailuresButton?.addEventListener("click", () => clearRefreshFailures());
collectionFilterInput?.addEventListener("input", () => renderCollections());
collectionFilterInput?.addEventListener("keydown", (event) => { if (event.key === "Escape") { collectionFilterInput.value = ""; renderCollections(); } });
upFilterSelect?.addEventListener("change", () => { upFilter = upFilterSelect.value; resetPaging(); renderVideos(); });
tagFilterSelect?.addEventListener("change", () => { tagFilter = tagFilterSelect.value; resetPaging(); renderVideos(); });
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
exportConfigButton?.addEventListener("click", downloadConfigFile);
importConfigButton?.addEventListener("click", () => {
  configFileInput.value = "";
  configFileInput.click();
});
configFileInput?.addEventListener("change", async () => {
  const file = configFileInput.files?.[0];
  if (!file) return;
  importConfigButton.disabled = true;
  try {
    await importConfigFromText(await file.text());
    showToast(BcaI18n.t("配置已导入。"));
  } catch (error) {
    // 导入失败必须说清楚原因，不能静默
    showToast(BcaI18n.t("导入配置失败：{message}", { message: error?.message || BcaI18n.t("未知错误") }));
  } finally {
    importConfigButton.disabled = false;
    configFileInput.value = "";
  }
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
window.addEventListener("beforeunload", () => {
  // 引用计数表里剩下的就是全部还没 revoke 的封面 URL（含仍被 video 对象持用的）
  revokeAllCoverRefs();
  archiveCache.clear();
});
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  if (changes.downloadRevision && rootHandle) refreshDownloadStatuses();
  // 4.5：在弹窗或下载页改了语言时，已经打开的收藏库也要跟上
  const next = changes[BcaI18n.STORAGE_KEY]?.newValue;
  if (!BcaI18n.isSupported(next) || next === BcaI18n.locale()) return;
  /* BcaI18n.use 是异步的，词典损坏 / 取不到语言文件时会 reject。
     原来这里既不 await 也不 catch，切语言失败是完全静默的：界面留在旧语言，
     用户只会觉得"我切了语言怎么没反应"。失败必须说出来。 */
  try {
    Promise.resolve(BcaI18n.use(next, { silent: true })).catch(reportLocaleSwitchFailure);
  } catch (error) {
    reportLocaleSwitchFailure(error);
  }
});

// 切换语言的失败提示。这里用 t() 取的是当前（旧）语言，失败时这正是对的
function reportLocaleSwitchFailure(error) {
  showToast(BcaI18n.t("切换界面语言失败：{message}", { message: error?.message || BcaI18n.t("未知错误") }));
}
window.addEventListener("focus", refreshDownloadStatuses);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") refreshDownloadStatuses();
});
// 4.9：这里原来有一个 60 秒的 window.setInterval，只要页面在前台就整树重扫一遍
// 000视频下载。递归扫描是文件系统调用，10000 条记录时相当于每分钟上万次，页面
// 一直开着就在持续打盘，收益却接近于零。**不要再把定时器加回来**：按需触发已经够用——
//   1. 下载页写 chrome.storage.local.downloadRevision 时，上面的 onChanged 会触发；
//   2. 窗口重新获得焦点（focus）触发一次；
//   3. 标签页重新可见（visibilitychange → visible）触发一次。
// 唯一的行为变化：页面在前台闲置时不会再自动刷新「已下载」状态，切回本页或
// 下载完成后仍然会刷新（写在 AI_HANDOFF 里的「前台定时扫描间隔 60 秒」要一起改掉）。
BcaI18n.init().catch(() => {}).then(() => Promise.all([
  restoreCollectionOrder().catch(() => { collectionOrder = []; }),
  restoreViewSettings(),
  restoreImportHint(),
  clearLegacySafetyDismissed(),
  restoreGithubBanner()
])).finally(() => {
  applyViewMode();
  restoreLastRoot();
});

// 侧栏版本号从 manifest 读取，避免再次出现“界面写着 3.6、实际是 3.7”的错位
try {
  const sideVersion = document.getElementById("sideVersion");
  if (sideVersion) sideVersion.textContent = displayVersion(chrome.runtime.getManifest().version);
} catch (_) {}
