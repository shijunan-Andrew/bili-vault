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
// P2-8：导入进行中/暂停中的常驻提示条（状态来自 background 写的 storage.local.importState）
const importRunningNotice = document.getElementById("importRunningNotice");
const importRunningText = document.getElementById("importRunningText");
const scanProgress = document.getElementById("scanProgress");
const videoPager = document.getElementById("videoPager");
// 彩蛋入口（分页器下方那一行小字）。外面那层 <p> 负责居中与留白，
// 事件挂在按钮上，切语言时 i18n.apply() 只会改写 textContent，不会重建这个节点。
const retroEntryWrap = document.getElementById("retroEntryWrap");
const retroEntryButton = document.getElementById("retroEntry");
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
const settingsFab = document.getElementById("settingsFab");
const scrollTopFab = document.getElementById("scrollTopFab");
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
const collectionActionProgress = document.getElementById("collectionActionProgress");
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
// 1.7.30（路线图第 2 项）：导出整个归档的元数据
const exportArchiveButton = document.getElementById("exportArchive");
const configFileInput = document.getElementById("configFileInput");
const batchManageButton = document.getElementById("batchManage");
const batchToolbar = document.getElementById("batchToolbar");
const selectedCount = document.getElementById("selectedCount");
const selectVisibleButton = document.getElementById("selectVisible");
const exitBatchButton = document.getElementById("exitBatch");
const moveSelectedButton = document.getElementById("moveSelected");
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

/* 1.7.10（facet-destructive P2-5）：归档侧的写者有两个上下文 —— 后台的导入，和这个页面里的
   删除 / 搬运 / 新建目录。它们各自排队（importRunChain、各区自己的 *InProgress 标志），
   但彼此完全看不见对方，同时写同一批目录时导入会把刚删掉的目录名字写回统计库。
   这里用一个 storage.session 的共享闸门把两边摆到同一张桌上：页面这边三个标志任意一个为真
   就立「library」锁，全部放开才解锁；后台的导入开始时读它，读到就先不开跑。 */
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

function publishLibraryWriteLock() {
  const busy = deleteInProgress || collectionCreateInProgress || videoAddInProgress;
  return busy ? setArchiveWriteLock("library") : clearArchiveWriteLock("library");
}

async function archiveWriteLockedByImport() {
  try {
    const saved = await chrome.storage.session.get(ARCHIVE_WRITE_LOCK_KEY);
    const lock = saved?.[ARCHIVE_WRITE_LOCK_KEY];
    if (!lock || lock.kind !== "import") return false;
    return Date.now() - Number(lock.since || 0) < ARCHIVE_WRITE_LOCK_MAX_AGE_MS;
  } catch (_) { return false; }
}
let selectionMode = false;
let videoFilter = "all";
// 4.6：UP 主 / 标签两个精确筛选，值取自当前范围（纯本地计算，不发请求）
let upFilter = "all";
let tagFilter = "all";
let selectedVideoIds = new Set();
let visibleVideoIds = [];
let pendingCollectionAction = null;
/* 1.7.21（收尾）：批量搬运要有进度与中止。搬运一个视频 = 复制整目录 + 删源，
   几十个能跑上一分钟，原来除了按钮上四个字没有任何反馈，也停不下来。 */
let collectionActionAbort = false;
let collectionActionShownAt = 0;
const COLLECTION_ACTION_PROGRESS_MS = 400;

function showCollectionActionProgress(text, force = false) {
  if (!collectionActionProgress) return;
  const now = Date.now();
  // 和导入进度同一条规矩：播报太快会刷屏读屏软件，400ms 之内的更新丢掉，
  // force 留给「开始」「停下」这类必须立刻看到的节点。
  if (!force && now - collectionActionShownAt < COLLECTION_ACTION_PROGRESS_MS) return;
  collectionActionShownAt = now;
  collectionActionProgress.hidden = false;
  collectionActionProgress.textContent = text;
}

function hideCollectionActionProgress() {
  if (!collectionActionProgress) return;
  collectionActionProgress.hidden = true;
  collectionActionProgress.textContent = "";
  collectionActionShownAt = 0;
}
let collectionOrder = [];
// 1.7.10（facet-storage P2-1）：「确实没保存过顺序」和「这次没读出来」必须分开。
// 旧代码把两者都当成空数组，一次 storage 读失败就静默丢掉用户排好的顺序，
// 之后任何一次拖拽都会把「扫描顺序」当成用户顺序写回磁盘，原顺序再也回不来。
let collectionOrderLoaded = false;
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
// 顶部“本地归档占用”的递归统计状态：防止重复并发扫描，只保留最后一次请求的根目录
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
  // 弹窗改目录时走的也是这条路径；留个信号，让已经开着的另一边（弹窗 / 本页面）跟上
  await chrome.storage.local.set({ rootHandleRevision: Date.now() });
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
  const file = await fileHandle.getFile();
  const url = URL.createObjectURL(file);
  // 缓存条目先持有一份；派生出的 video 对象在 videoFromArchiveRecord 里再加一份
  addCoverRef(url);
  // 1.8.5：顺手把封面字节数带出去 —— 体积统计就不用再为它单独 getFile 一遍
  return { cover: url, coverBytes: file.size };
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

// 「【互动数据】播放量：73798」这类字段名 → video.stats 的键，以及六个中文标签。
// 键清单与标签表全仓只有一份，住在写归档的那一侧（archive-core.js 的冻结 api），
// 这里只引用 —— 以前三个文件各存一份字面量、用了四个名字（library.js 的
// STAT_FIELDS / STAT_LABEL_KEYS、background.js 的 IMPORT_STAT_KEYS / STAT_KEYS），
// 改一处口径要改四处。
const STAT_KEYS = BcaArchiveCore.STAT_KEYS;
const STAT_LABELS = BcaArchiveCore.STAT_LABELS;
// 详情卡片上短标签的键顺序就是 STAT_KEYS 的顺序；文案本体写在 detailStatsHtml()
// 的 t("...") 里：key 必须是字面量，词条工具才扫得到。

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
  for (const [key, label] of Object.entries(STAT_LABELS)) {
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
  // 1.8.5：顺带累加字节数 —— 这个函数本来就要把每个文件过一遍，volume 统计跟着免费拿到
  const result = { hasFiles: false, hasMedia: false, marked: false, bytes: 0 };
  for await (const entry of directory.values()) {
    if (entry.kind === "file") {
      result.hasFiles = true;
      result.hasMedia ||= BcaArchiveCore.isMediaFileName(entry.name);
      result.marked ||= entry.name === DOWNLOAD_MARKER_FILE;
      result.bytes += (await entry.getFile()).size;
    } else if (entry.kind === "directory") {
      const child = await inspectDownloadDirectory(entry);
      result.hasFiles ||= child.hasFiles;
      result.hasMedia ||= child.hasMedia;
      result.marked ||= child.marked;
      result.bytes += child.bytes;
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

/* 1.8.4：下载目录索引的缓存。整棵 000视频下载 树每轮扫描都要递归枚举一遍（每个下载目录
   一次 inspectDownloadDirectory，里面还要往下递归看文件），和读归档记录是同一量级的
   FS 往返，而它只在「下载目录真的变了」时才需要重算。失效方式：
     ① 本页自己删除 / 搬运下载目录后调 invalidateDownloadIndex(rootHandle)；
     ② 手动「刷新」（forceFullScan）与 downloadRevision 变化时强制重算；
     ③ 兜底 TTL —— downloadRevision 这条订阅在 1.3.0 删掉下载功能之后就没人写了。 */
const DOWNLOAD_INDEX_TTL_MS = 2 * 60 * 1000;
const downloadIndexCache = new Map(); // rootKey -> { index, at }

function invalidateDownloadIndex(handle) {
  if (handle) downloadIndexCache.delete(rootCacheKey(handle));
  else downloadIndexCache.clear();
}

/* 1.8.5：读归档记录是这条链路上最贵的一段 —— 每条记录要 2~3 次 FS 往返
   （视频信息.txt 的 getFile + text、封面的 getFile），630 条就是 1500 次左右。
   串行读的时候这些往返完全排着队，所以改成固定 8 路并发：每个 worker 从队列里
   取一条读一条。8 是折中 —— 再高对 File System Access 没什么帮助，反而让
   「同时打开的文件句柄」变多。顺序不靠并发保证：先按收藏夹分组收集，最后各自
   按收藏时间排序，和串行读的结果一致。 */
const SCAN_READ_CONCURRENCY = 8;

/* 1.8.5：把上一次扫描的结果存进 IndexedDB，重开页面先按快照把界面填起来，
   再照常整库校准（读到什么就是什么，快照永远不是最终真相）。
   快照里绝不存 blob: URL —— 它们的生命周期跟着页面走，存下来下次打开就是一串死链；
   封面在命中的那一次现读现造。只存「解析结果 + size/lastModified」，也就是判断
   「这份 txt 还是不是那一份」所需要的全部。 */
const SNAPSHOT_DB_NAME = "bca-archive-snapshot";
const SNAPSHOT_STORE = "records";
const SNAPSHOT_VERSION = 1;
let snapshotDbPromise = null;

function openSnapshotDb() {
  if (snapshotDbPromise) return snapshotDbPromise;
  snapshotDbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("这个环境没有 IndexedDB")); return; }
    const request = indexedDB.open(SNAPSHOT_DB_NAME, SNAPSHOT_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (db.objectStoreNames.contains(SNAPSHOT_STORE)) return;
      const store = db.createObjectStore(SNAPSHOT_STORE, { keyPath: "key" });
      store.createIndex("root", "rootKey");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("打不开快照库"));
  }).catch((error) => { snapshotDbPromise = null; throw error; });
  return snapshotDbPromise;
}

async function snapshotLoad(rootKey) {
  try {
    const db = await openSnapshotDb();
    const entries = await new Promise((resolve, reject) => {
      const request = db.transaction(SNAPSHOT_STORE, "readonly").objectStore(SNAPSHOT_STORE).index("root").getAll(rootKey);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error || new Error("读快照失败"));
    });
    return entries;
  } catch (error) {
    console.warn("读不到上次扫描的快照（这次按整库重读处理）", error);
    return [];
  }
}

async function snapshotSave(rootKey, entries) {
  if (!entries.length) return;
  const nextByKey = new Map(entries.map((entry) => [entry.key, entry]));
  try {
    const db = await openSnapshotDb();
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(SNAPSHOT_STORE, "readwrite");
      const store = transaction.objectStore(SNAPSHOT_STORE);
      /* 1.8.7（P1-4）：**增量写**。以前是「先按 root 删干净、再把这一轮全 put 一遍」——
         10 000 条就是 10 000 次写；而绝大多数条目的 size / lastModified / bytes 根本没变。
         现在顺着旧条目的游标走一趟：没变的不动、变了的 update、消失了的 delete，
         走完再补上这一轮新出现的。读是内存里的索引读，写只发生在真的变了的那几条上。 */
      const seenKeys = new Set();
      const cursorRequest = store.index("root").openCursor(rootKey);
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor) {
          for (const [key, entry] of nextByKey) {
            if (!seenKeys.has(key)) store.put(entry);
          }
          return;
        }
        const current = cursor.value;
        const next = nextByKey.get(current.key);
        if (!next) {
          cursor.delete();
        } else {
          seenKeys.add(current.key);
          const unchanged = next.size === current.size
            && next.lastModified === current.lastModified
            && (Number(next.bytes) || 0) === (Number(current.bytes) || 0);
          if (!unchanged) cursor.update(next);
        }
        cursor.continue();
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("写快照失败"));
      transaction.onabort = () => reject(transaction.error || new Error("写快照被取消"));
    });
  } catch (error) {
    console.warn("这次扫描结果没能存成快照（下次打开仍然是整库重读）", error);
  }
}

// 扫描完把这一轮的结果写成快照（只写「这次真的进了列表」的那些）
function saveScanSnapshot(handle, scannedCollections) {
  if (!handle) return;
  const rootKey = rootCacheKey(handle);
  const cache = archiveCache.get(rootKey);
  if (!cache?.size) return;
  const videoById = new Map();
  for (const collection of scannedCollections || []) {
    for (const video of collection.videos || []) videoById.set(video.id, video);
  }
  const entries = [];
  for (const [cacheName, entry] of cache) {
    const record = entry.record;
    if (!record?.info) continue;
    const video = videoById.get(cacheName);
    if (!video) continue;
    entries.push({
      key: `${rootKey}\u0000${cacheName}`,
      rootKey,
      collection: video.collection,
      directory: video.directory,
      size: entry.size,
      lastModified: entry.lastModified,
      bytes: record.bytes || 0,
      savedAt: record.savedAt || "",
      info: record.info,
      downloaded: video.downloaded === true,
      hasFiles: video.hasDownloadFiles === true,
      downloadDirectoryName: video.downloadDirectoryName || "",
      downloadCollectionName: video.downloadCollectionName || ""
    });
  }
  // 扫描结果是异步写进去的，调用方不等它（界面已经画完了）
  snapshotSave(rootKey, entries);
}

/* 先按快照把界面填起来。任何一步出问题都退回「什么都不画」，由随后的整库扫描兜住。 */
async function paintSnapshot(handle) {
  // 「刷新」按钮就是「别信缓存」，快照也不该抢在它前面把旧结果画出来
  if (forceFullScan) return false;
  const rootKey = rootCacheKey(handle);
  const entries = await snapshotLoad(rootKey);
  if (!entries.length) return false;
  if (rootHandle !== handle) return false;
  const cache = archiveCacheFor(rootKey);
  const previousVideos = new Map();
  const byCollection = new Map();
  for (const entry of entries) {
    if (!entry?.collection || !entry?.directory || !entry?.info) continue;
    const cacheName = `${entry.collection}/${entry.directory}`;
    // 1.8.7（P1-6）：快照里不再存第二份 share —— 它本来就是从 info 原文切出来的，
    // 现算一次比在 IndexedDB 和内存里各存一份便宜得多（老快照没有 share，照样能读）。
    const record = { info: entry.info, share: splitInfoDescription(entry.info), savedAt: entry.savedAt || "", cover: "", bytes: entry.bytes || 0 };
    // 灌进内存缓存：随后的扫描只要 size/lastModified 对得上，就只补封面、不重解析 txt
    if (!cache.has(cacheName)) cache.set(cacheName, { size: entry.size, lastModified: entry.lastModified, record });
    previousVideos.set(cacheName, {
      downloaded: entry.downloaded === true,
      hasDownloadFiles: entry.hasFiles === true,
      downloadDirectoryName: entry.downloadDirectoryName || "",
      downloadCollectionName: entry.downloadCollectionName || "",
      downloadDirectoryHandle: null
    });
    const video = videoFromArchiveRecord(entry.collection, { name: entry.directory }, record, null, previousVideos);
    if (!byCollection.has(entry.collection)) byCollection.set(entry.collection, []);
    byCollection.get(entry.collection).push(video);
  }
  // 1.8.7（P2-9）：快照里本来就有每条记录的 bytes —— 先拿它当种子把「占用体积」填上，
  // 不必等整库扫完，也不必为这一个数字递归整棵树。
  const seededBytes = entries.reduce((sum, entry) => sum + (Number(entry.bytes) || 0), 0);
  // 1.8.7（P1-6）：条目已经转进缓存与 video 对象，这个整库数组不再需要。
  entries.length = 0;
  const scanned = [];
  for (const [name, videos] of byCollection) {
    videos.sort((a, b) => b.timestamp - a.timestamp);
    scanned.push({ name, videos });
  }
  if (!scanned.length) return false;
  scanned.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  releaseVideoCoverRefs();
  collections = applyCollectionOrder(scanned);
  selectedCollection = "*";
  statusDot.classList.add("ready");
  refreshLibraryButton.disabled = false;
  setDynamicText(rootLabel, handle.name);
  if (breadcrumbRoot) setDynamicText(breadcrumbRoot, handle.name);
  welcome.hidden = true;
  library.hidden = false;
  if (retroEntryWrap) retroEntryWrap.hidden = false;
  renderCollections();
  refreshVideoFilterOptions();
  renderVideos();
  // 这条提示会被扫描收尾时的 refreshScanNotice() 换掉
  setScanNotice(BcaI18n.t("已显示上次的 {count} 条记录，正在核对文件…", { count: formatCountText(allVideos().length) }));
  if (seededBytes > 0) updateStorageUsage(handle, { total: seededBytes });
  return true;
}

async function scanDownloadedDirectories(archiveRoot, options = {}) {
  const force = options.force === true;
  const indexCacheKey = rootCacheKey(archiveRoot);
  const cachedIndex = downloadIndexCache.get(indexCacheKey);
  if (!force && cachedIndex && Date.now() - cachedIndex.at < DOWNLOAD_INDEX_TTL_MS) return cachedIndex.index;
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
    let totalBytes = 0;
    for await (const collection of parent.values()) {
      if (collection.kind !== "directory") continue;
      for await (const entry of collection.values()) {
        if (entry.kind !== "directory") continue;
        const identifiers = BcaArchiveCore.identifiersFromDirectoryName(entry.name);
        const contents = await inspectDownloadDirectory(entry);
        totalBytes += contents.bytes;
        if (!identifiers.size || !contents.hasFiles) continue;
        for (const identifier of identifiers) {
          const match = { name: entry.name, collectionName: collection.name, handle: entry, hasFiles: contents.hasFiles, hasMedia: contents.hasMedia, marked: contents.marked };
          keepBestDownloadMatch(index, BcaArchiveCore.downloadIndexKey(collection.name, identifier), match);
          // Older 3.5 downloads lost their source collection and were written under this folder.
          if (collection.name === "未分类收藏") keepBestDownloadMatch(index, `legacy\u0000${identifier}`, match);
        }
      }
    }
    // 1.8.5：整棵下载树的字节数挂在索引上（Map 上带个属性，调用方用它算占用）
    index.bytes = totalBytes;
    downloadIndexCache.set(indexCacheKey, { index, at: Date.now() });
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
/* 1.7.7（P2-4）：封面缓存上限。原来 4000 是按"最多 4000 个视频目录"设的，而页面同时
   最多显示 25 张卡 —— 上限太高等于让整库的 blob: URL 常驻内存。
   1.8.4：上限不再写死 600，而是按「上次扫描到的记录数 + 余量」算（archive-core.js 的
   archiveCacheCapacity()）。写死 600 的后果是：630 条的库正好卡在「顺序扫描 + LRU 逐条
   淘汰」的抖动里 —— 每插入一条就淘汰掉下一条马上要读的条目，命中率实测为 0%。 */
const archiveCacheLimit = new Map(); // rootKey -> 这个根目录的缓存上限

function archiveCacheLimitFor(rootKey) {
  return archiveCacheLimit.get(rootKey) || BcaArchiveCore.archiveCacheCapacity(0);
}

// 扫完一轮就把真实条数记下来，下一轮的容量按它算（删了记录也会跟着缩）
function rememberArchiveCacheLimit(rootKey, recordCount) {
  const next = BcaArchiveCore.archiveCacheCapacity(recordCount);
  archiveCacheLimit.set(rootKey, next);
  const store = archiveCache.get(rootKey);
  if (store) store.cacheLimit = next;
  return next;
}
// 1.7.12（perf PF-4）：上面那条是「每个根目录」的上限，根目录个数本身一直没有上限。
// rootCacheKey 靠 WeakMap 计数发号，而句柄对象一旦不再被引用就会回收 —— 用户重选一次目录
// （选错再选回来、换一个备份文件夹）就是一个新 key，旧 key 的条目要等到关页面才清。
// 给根目录数设个上限：超出就从最久没用的开始整份丢掉，连带 storageUsageCache 与
// lastScanRecordCount 里的同一 key 一起删，别让它们各自留下孤儿条目。
const ARCHIVE_CACHE_MAX_ROOTS = 2;
const archiveCacheOrder = []; // rootKey，最近用过的排在最后
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

// 丢弃一条缓存条目：把它持有的封面 URL 引用交还回去（计数归零才会真的 revoke）
function dropCacheEntry(entry) {
  releaseCoverRef(entry?.record?.cover);
}

// 丢掉一个根目录的全部痕迹：逐条交还封面引用后整表删除，顺带清掉另外两张同键的表
function dropRootCaches(rootKey) {
  const store = archiveCache.get(rootKey);
  if (store) for (const entry of store.values()) dropCacheEntry(entry);
  archiveCache.delete(rootKey);
  storageUsageCache.delete(rootKey);
  lastScanRecordCount.delete(rootKey);
  archiveCacheLimit.delete(rootKey); // 1.8.4：容量与下载索引也按根目录记，别留孤儿
  downloadIndexCache.delete(rootKey);
  const at = archiveCacheOrder.indexOf(rootKey);
  if (at >= 0) archiveCacheOrder.splice(at, 1);
}

function touchArchiveCacheRoot(rootKey) {
  const at = archiveCacheOrder.indexOf(rootKey);
  if (at >= 0) archiveCacheOrder.splice(at, 1);
  archiveCacheOrder.push(rootKey);
  while (archiveCacheOrder.length > ARCHIVE_CACHE_MAX_ROOTS) dropRootCaches(archiveCacheOrder[0]);
}

function archiveCacheFor(rootKey) {
  let store = archiveCache.get(rootKey);
  if (!store) { store = new Map(); store.cacheLimit = archiveCacheLimitFor(rootKey); archiveCache.set(rootKey, store); }
  // "root:none" 是「没有句柄」的占位，不该占一个根目录名额
  if (rootKey !== "root:none") touchArchiveCacheRoot(rootKey);
  return store;
}

// 「刷新」按钮的退路：逐条交还引用后再整表丢弃，不能直接 delete 掉整张表
function clearArchiveCache(handle) {
  dropRootCaches(rootCacheKey(handle));
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
  // 注释想避免的泄漏。改成按 Map 的插入序淘汰**最旧的**（配合 cacheEntryFor 的
  // 「命中即刷新位置」构成 LRU）。
  // 1.8.4：一次淘汰一批（25%），容量按库大小算 —— 逐条淘汰在「集合只比容量大一点」时会
  // 每次都丢掉下一条要读的条目（630 条 / 上限 600 = 命中率 0%，真机复现过）。
  const cacheLimit = store.growing
    ? BcaArchiveCore.archiveCacheCapacity(store.size + 1) // 扫描中：跟着已读条数长，先不淘汰
    : store.cacheLimit || BcaArchiveCore.archiveCacheCapacity(0);
  if (store.size >= cacheLimit) {
    const dropCount = BcaArchiveCore.archiveCacheDropCount(cacheLimit);
    for (let dropIndex = 0; dropIndex < dropCount; dropIndex += 1) {
      const oldestKey = store.keys().next().value;
      if (oldestKey === undefined) break;
      const oldest = store.get(oldestKey);
      store.delete(oldestKey);
      dropCacheEntry(oldest);
    }
  }
  store.set(name, { size, lastModified, record });
}

/* 1.8.6：封面改成「用到才读」。

   扫描 630 条记录，原来要建 630 个 blob: URL；老档案的封面是真 PNG（平均 1.7 MB、
   最大 7.3 MB），整库 219 MB 会一直挂在渲染进程里，只为了屏幕上这一页的几十张。
   现在扫描只记下封面文件句柄（句柄很便宜），卡片/详情真正要显示时才 getFile +
   createObjectURL；读过的最多留 COVER_LAZY_MAX 张，再读就把最旧的交还引用计数。 */

const COVER_LAZY_MAX = 300;
const coverLazyOrder = [];

// 4.9：封面有两代文件名。优先读新的 WebP（小得多），退回老档案的真 PNG。
async function coverEntryFor(recordEntry) {
  const webp = await optionalFileHandle(recordEntry, "封面.webp");
  if (webp) return webp;
  return optionalFileHandle(recordEntry, "封面.png");
}

// 快照渲染出来的 video 没有句柄（IndexedDB 存不了句柄），按 收藏夹/目录名 现取一次
async function resolveCoverEntry(video) {
  if (video.coverEntry) return video.coverEntry;
  if (!rootHandle || !video.collection || !video.directory) return null;
  try {
    const collectionHandle = await rootHandle.getDirectoryHandle(video.collection);
    const recordEntry = await collectionHandle.getDirectoryHandle(video.directory);
    video.coverEntry = await coverEntryFor(recordEntry);
    return video.coverEntry;
  } catch (error) {
    if (error?.name !== "NotFoundError") console.warn("取不到这条记录的封面目录（先显示占位图）", error);
    return null;
  }
}

async function hydrateCover(video) {
  if (!video) return "";
  if (video.cover) return video.cover;
  const entry = await resolveCoverEntry(video);
  if (!entry) return "";
  let result;
  try {
    result = await readCover(entry);
  } catch (error) {
    console.warn("这条记录的封面读不出来（先显示占位图）", error);
    return "";
  }
  // 并发调用（卡片刚补完、详情又开了）：后来者把自己那份交还，用先读到的那张
  if (video.cover) {
    releaseCoverRef(result.cover);
    return video.cover;
  }
  video.cover = result.cover;
  video.coverBytes = result.coverBytes;
  coverLazyOrder.push({ url: result.cover, video });
  while (coverLazyOrder.length > COVER_LAZY_MAX) {
    const oldest = coverLazyOrder.shift();
    if (oldest.video.cover !== oldest.url) continue; // 这条已经换成新 URL 了，别误清
    oldest.video.cover = "";
    releaseCoverRef(oldest.url);
  }
  return result.cover;
}

// 读一条归档记录。命中缓存时只取 File 的元数据（不读正文），未命中才 getFile().text()。
async function readArchiveRecord(collectionName, recordEntry, cache, stats) {
  const cacheName = `${collectionName}/${recordEntry.name}`;
  /* 1.8.6：一条记录目录只枚举一次。原来「探 视频信息.txt、探 封面.webp、探 封面.png」
     是三次 IPC，现在一趟 values() 把名字与存在性全拿到（630 条能省两千次往返）。 */
  const children = [];
  try {
    for await (const child of recordEntry.values()) children.push(child);
  } catch (error) {
    console.warn("读不了这个记录目录（当作不是归档记录）", error);
    return null;
  }
  const infoHandle = children.find((child) => child.kind === "file" && child.name === "视频信息.txt");
  if (!infoHandle) return null;
  const coverEntry = children.find((child) => child.kind === "file" && child.name === "封面.webp")
    || children.find((child) => child.kind === "file" && child.name === "封面.png");
  const meta = await (await infoHandle.getFile());
  const cachedRecord = cacheEntryFor(cache, cacheName, meta.size, meta.lastModified);
  if (cachedRecord && coverEntry) {
    stats.hits += 1;
    // 1.8.5：体积统计复用这一轮已经量到的字节（缓存条目里带着上次的）；
    // 1.8.6：命中缓存连封面文件都不碰，字节省下两次 IPC
    stats.bytes += cachedRecord.bytes || meta.size;
    return Object.assign({}, cachedRecord, { cover: "", coverEntry });
  }
  const raw = await meta.text();
  if (!raw.includes("【基本信息】")) return null;
  const info = parseInfo(raw);
  if (!field(info, "视频标题")) return null;
  // 没有封面就不是一条合法归档，交给上层按「跳过」处理（和 4.5 的行为一致）
  if (!coverEntry) return null;
  // 1.8.6：冷扫只量封面大小（体积统计要准，不然 219 MB 会显示成 7 MB），不建 blob: URL
  const coverBytes = (await coverEntry.getFile()).size;
  const share = splitInfoDescription(info);
  // bytes：这条记录在磁盘上占的字节（视频信息.txt + 封面），体积统计直接用
  const record = { info, share, savedAt: field(info, "信息保存于"), cover: "", coverEntry, coverBytes, bytes: meta.size + coverBytes };
  storeCacheEntry(cache, cacheName, meta.size, meta.lastModified, record);
  stats.reads += 1;
  stats.bytes += record.bytes;
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

/* 1.7.11（facet-security P2-1）：视频链接与 UP 主主页都来自 视频信息.txt，而那份文本的
   源头是页面 / 接口。读侧已经不许伪造字段了（parseInfoFile 只在已知段里认字段、同键首次
   出现优先），这里再从渲染侧收一道：只有 B 站自己的域名才当链接渲染，别的退回纯文本。
   万一以后又裂开一条注入路径，最坏也只是详情页多显示一行字，不会变成「点一下就跳到
   别人站点」的锚点。 */
const BILIBILI_LINK_HOSTS = ["bilibili.com", "b23.tv"];

function bilibiliLink(value) {
  const text = String(value ?? "").trim();
  let parsed;
  try {
    parsed = new URL(text);
  } catch (_) {
    return "";
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return "";
  const host = parsed.hostname.toLowerCase();
  return BILIBILI_LINK_HOSTS.some((suffix) => host === suffix || host.endsWith(`.${suffix}`)) ? text : "";
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
  // 1.8.6：扫描阶段不再持有封面 URL（卡片/详情见到才读，见 hydrateCover）；
  // 这里只把句柄带过去，缓存条目被淘汰也不影响显示。
  // 4.9：搜索比对串在扫描时拼一次就够，不必每敲一个键给每条记录重新 join + toLocaleLowerCase。
  // 字段顺序与取值必须和原来 matchesBaseFilters 里那份完全一致（join 会把 undefined 写成 ""），
  // 否则搜索命中范围会悄悄变。
  const searchIndex = [title, upName, bvid, category, collectionName, share.description, ...tags].join(" ").toLocaleLowerCase();
  return {
    id,
    collection: collectionName,
    directory: recordEntry.name,
    title,
    url: bilibiliLink(url),
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
    upHome: bilibiliLink(field(info, "UP主主页")),
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
    cover: record.cover || "",
    coverEntry: record.coverEntry || null
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
  // 1.8.5：「刷新」按钮会把缓存清空重读（那是唯一的退路），命中数永远是 0 ——
  // 再写「其中 0 条直接复用缓存」看着像缓存坏了。分开说：那一次是「按你的要求整库重读」。
  if (info.total) {
    lines.push(info.forced
      ? BcaI18n.t("已按你的要求整库重读：{count} 条记录，缓存已清空重来。", { count: info.total })
      : BcaI18n.t("本次扫描 {count} 条记录，其中 {reused} 条直接复用缓存。", { count: info.total, reused: info.hits }));
  }
  if (info.issues.length) {
    lines.push(BcaI18n.t("有 {count} 个目录未能读取：{list}", {
      count: info.issues.length,
      list: `${info.issues.slice(0, 4).join("；")}${info.issues.length > 4 ? "；…" : ""}`
    }));
  }
  // 1.7.10（facet-destructive P2-6）：被打断的导入留下的半截目录原来是静默跳过的 ——
  // 它永远躺在磁盘上，收藏库里一个字都不提，用户既不知道它存在，也无从判断该不该删。
  // 1.7.24（facet-compat §3.2）：路径长度以前是「无度量、无提示」，只有真的建不出文件时
  // 才炸出一句英文异常名。这里按「收藏夹段 + 视频目录段」的相对长度报一次。
  if (info.longNames?.length) {
    lines.push(BcaI18n.t("有 {count} 个目录名太长了（收藏夹名加视频目录名超过 {budget} 个字符），拼上本地备份文件夹的路径就可能越过 Windows 的 260 字符上限：{list}", {
      count: info.longNames.length,
      budget: BcaArchiveCore.PATH_SEGMENT_BUDGET_CHARS,
      list: `${info.longNames.slice(0, 3).join("；")}${info.longNames.length > 3 ? "；…" : ""}`
    }));
  }
  if (info.unfinished?.length) {
    lines.push(BcaI18n.t("另有 {count} 个目录没写完（没有 视频信息.txt，多半是上次导入被打断）：{list}", {
      count: info.unfinished.length,
      list: `${info.unfinished.slice(0, 3).join("；")}${info.unfinished.length > 3 ? "；…" : ""}`
    }));
  }
  setScanNotice(lines.join("\n"));
}

/* 1.7.10（facet-destructive P2-6）：区分「目录没写完」和「目录内容有问题」。
   没有 视频信息.txt 的目录就是导入写到一半被打断留下的（写入顺序是先建目录、再写封面、
   最后写 视频信息.txt，所以缺 txt 就等于没写完）。完全空的目录不算 —— 那可能只是用户
   自己刚建的，报出来只会让人困惑。 */
async function isUnfinishedRecord(recordEntry) {
  const infoHandle = await optionalFileHandle(recordEntry, "视频信息.txt");
  if (infoHandle) return false;
  for await (const entry of recordEntry.values()) {
    if (entry.kind === "file" || entry.kind === "directory") return true;
  }
  return false;
}

async function scanRoot(handle, preserveDownloadStatuses = true) {
  const scanned = [];
  const issues = [];
  const unfinished = [];
  // 1.7.24（facet-compat §3.2）：度量。收藏夹段 + 视频目录段合起来超过预算的目录，
  // 拼上根目录与记录目录里的文件名就贴着 Windows 的 260 字符上限了 —— 以前没人提。
  const longNames = [];
  // 1.8.5：这次是不是「刷新」按下来的强制全量重读（提示文案要用）
  const forced = forceFullScan === true;
  const downloadIndex = await scanDownloadedDirectories(handle, { force: forceFullScan });
  const previousVideos = new Map(preserveDownloadStatuses ? allVideos().map((video) => [video.id, video]) : []);
  const timestampPattern = /^\d{4}年\d{1,2}月\d{1,2}日\d{1,2}时\d{1,2}分\d{1,2}秒(?:_\d+)?$/;
  // 强制全量（「刷新」按钮）时先丢掉这个根目录的缓存
  const cacheKey = rootCacheKey(handle);
  if (forceFullScan) clearArchiveCache(handle);
  const cache = archiveCacheFor(cacheKey);
  // 1.8.4：第一次扫一个库时还不知道有多少条，容量会先卡在下限（600）。这时候一边读
  // 一边把上限接到「已读条数 + 余量」上，别在半路上淘汰掉下一条马上要读的条目。
  cache.growing = true;
  // 1.8.4：总数不再靠「把每个收藏夹多枚举一遍」得到（630 条 = 630 次多余往返）。
  // 进度分母先用上次扫描的条数，估少了就跟着 processed 长；真值在读完时收口。
  const knownTotal = lastScanRecordCount.get(cacheKey) || 0;
  const stats = { hits: 0, reads: 0, processed: 0, total: knownTotal, bytes: Number(downloadIndex?.bytes) || 0 };
  // 目录列表本身每次重新枚举，缓存只省文件读取，所以新增/删除目录一定反映得出来
  const collections = [];
  for await (const collectionEntry of handle.values()) {
    if (collectionEntry.kind !== "directory") continue;
    if (!["错误报告", "001错误报告", "002同步报告", "视频下载", "000视频下载", "003database", "004导出"].includes(collectionEntry.name)) {
      collections.push(collectionEntry);
      continue;
    }
    // 1.8.5：体积统计复用扫描。固定目录（报告 / 数据库 / 导出）都是扁平的、文件很少，
    // 顺手量一下；000视频下载 那棵树的字节由下载索引给出（它本来就要递归枚举那一遍）。
    if (collectionEntry.name === "000视频下载" || collectionEntry.name === "视频下载") continue;
    stats.bytes += await directorySize(collectionEntry);
  }
  // 1.7.24 的路径长度度量顺路在读那一遍里做，不再为它单独枚举（1.8.4）。
  const progress = progressNotifier(scanNoticeText, (value) => scanProgressText(value));
  try {
    // 1.8.5：先把「要读哪些记录」列出来，再 8 路并发读 —— 见 SCAN_READ_CONCURRENCY 的注释。
    const jobs = [];
    for (const collectionEntry of collections) {
      const targets = [];
      for await (const recordEntry of collectionEntry.values()) {
        if (recordEntry.kind !== "directory" || !timestampPattern.test(recordEntry.name)) continue;
        const relative = collectionEntry.name.length + 1 + recordEntry.name.length;
        if (relative > BcaArchiveCore.PATH_SEGMENT_BUDGET_CHARS) longNames.push(`${collectionEntry.name}/${recordEntry.name}`);
        targets.push(recordEntry);
      }
      jobs.push({ name: collectionEntry.name, targets, videos: [] });
    }
    const queue = [];
    jobs.forEach((job, jobIndex) => {
      for (const recordEntry of job.targets) queue.push({ jobIndex, recordEntry });
    });
    let cursor = 0;
    const readOne = async () => {
      while (cursor < queue.length) {
        const task = queue[cursor];
        cursor += 1;
        const job = jobs[task.jobIndex];
        const collectionName = job.name;
        const recordEntry = task.recordEntry;
        stats.processed += 1;
        if (stats.total < stats.processed) stats.total = stats.processed;
        if (stats.processed % 8 === 0) progress.update({ done: stats.processed, total: stats.total });
        try {
          const record = await readArchiveRecord(collectionName, recordEntry, cache, stats);
          if (!record) {
            // 1.7.10（P2-6）：读不出内容的目录里，只有「没写完」这一类要单独报出来
            if (await isUnfinishedRecord(recordEntry)) unfinished.push(`${collectionName}/${recordEntry.name}`);
            continue;
          }
          job.videos.push(videoFromArchiveRecord(collectionName, recordEntry, record, downloadIndex, previousVideos));
        } catch (error) {
          issues.push(`${collectionName}/${recordEntry.name}：${error.message || BcaI18n.t("读取失败")}`);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(SCAN_READ_CONCURRENCY, queue.length) }, () => readOne()));
    for (const job of jobs) {
      job.videos.sort((a, b) => b.timestamp - a.timestamp);
      scanned.push({ name: job.name, videos: job.videos });
    }
  } finally {
    cache.growing = false;
    progress.flush();
  }
  scanned.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  // 1.8.4：读完才知道真条数；顺手把下一轮的缓存容量定下来
  stats.total = stats.processed;
  rememberArchiveCacheLimit(cacheKey, stats.total);
  // hits/reads/total 挂在返回值上，界面用它显示「本次命中缓存多少条」
  return { collections: scanned, issues, unfinished, longNames, forced, stats: { hits: stats.hits, reads: stats.reads, total: stats.total, bytes: stats.bytes } };
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

// 判断两组标识符（BV 号 / av 号）有没有交集。background.js 有一份同名同体的副本
// —— service worker 是 ES module，import 不了经典脚本 —— 所以两处的**名字与函数体**
// 由 stability.test.cjs 逐字守着：改一边不改另一边会红。
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
  // 1.7.20（facet-ux P1-3）：窄窗口（≤760px）下 #sidebar 变成横向胶囊行，拖动把手被
  // CSS 隐藏、拖动也没了可发现性 —— 排序在这个区间里对鼠标和键盘都不可达。这里补一条
  // 不依赖拖动的入口：行上按 Alt+↑/↓ 把这一项往前/往后挪一格。判据用 collections
  // （当前渲染顺序），和拖动走的是同一个 reorderCollection，所以「没读到顺序就不落盘」
  // 那条保护同样生效。
  wrapper.addEventListener("keydown", (event) => {
    if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
    const order = collections.map((collection) => collection.name);
    const from = order.indexOf(name);
    if (from < 0) return;
    const to = event.key === "ArrowUp" ? from - 1 : from + 1;
    if (to < 0 || to >= order.length) return;
    event.preventDefault();
    // 往下挪 = 插到下一项的后面；往上挪 = 插到上一项的前面
    reorderCollection(name, order[to], event.key === "ArrowDown");
    focusCollectionRow(name);
  });
}

/* 重画之后把焦点放回同一行 —— 否则按一次 Alt+↓ 焦点就丢了，连按第二下会落空 */
function focusCollectionRow(name) {
  const rows = collectionList ? [...collectionList.querySelectorAll(".collection-row")] : [];
  const target = rows.find((row) => row.dataset.collectionName === name);
  target?.querySelector(".collection-button")?.focus();
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
  // 1.7.10（facet-storage P2-1）：这次没扫到的收藏夹（临时没权限、目录被占用）不能因为
  // 一次拖拽就被挤出顺序表 —— 它们排在看得见的这批后面，彼此的相对次序照旧。
  const visibleNames = new Set(collections.map((collection) => collection.name));
  collectionOrder = [...collections.map((collection) => collection.name), ...collectionOrder.filter((name) => !visibleNames.has(name))];
  clearCollectionDragStyles();
  renderCollections();
  if (!collectionOrderLoaded) {
    // 从来没成功读到磁盘上那份顺序，就不能拿这次的扫描顺序去覆盖它
    showToast(BcaI18n.t("这次没能读到已保存的收藏夹顺序，为避免覆盖它，本次排序只临时生效。"));
    return;
  }
  chrome.storage.local.set({ collectionOrder }).then(() => showToast(BcaI18n.t("收藏夹顺序已保存"))).catch((error) => showToast(BcaI18n.t("保存排序失败：{message}", { message: error?.message || BcaI18n.t("插件存储不可用") })));
}

function applyCollectionOrder(items) {
  const orderIndex = new Map(collectionOrder.map((name, index) => [name, index]));
  items.sort((left, right) => {
    const leftIndex = orderIndex.has(left.name) ? orderIndex.get(left.name) : Number.MAX_SAFE_INTEGER;
    const rightIndex = orderIndex.has(right.name) ? orderIndex.get(right.name) : Number.MAX_SAFE_INTEGER;
    return leftIndex - rightIndex || left.name.localeCompare(right.name, "zh-CN");
  });
  // 1.7.10（facet-storage P2-1）：不能拿「本次扫描结果」整份重写内存里的顺序 ——
  // 这次没扫到的收藏夹会被挤出去，等它们下次出现就排到末尾了。已知顺序里这次没出现的
  // 名字原样保留在后面，相对次序不变；新出现的按扫描顺序接在可见的那批之后。
  const visibleNames = new Set(items.map((collection) => collection.name));
  collectionOrder = [...items.map((collection) => collection.name), ...collectionOrder.filter((name) => !visibleNames.has(name))];
  return items;
}

// 1.7.10（facet-storage P2-1）：只有这次真的读到了才置 collectionOrderLoaded。
// 读失败时调用方不许清空、也不许写回（见启动处的 catch 与 reorderCollection）。
async function restoreCollectionOrder() {
  const saved = await chrome.storage.local.get("collectionOrder");
  collectionOrder = Array.isArray(saved.collectionOrder) ? saved.collectionOrder.filter((name) => typeof name === "string") : [];
  collectionOrderLoaded = true;
}

// 1.7.12（perf PF-3）：过滤本来就只是「隐藏行」，实现却是整表重画 —— 每个字符都把 N 行
// replaceChildren 重建一遍，每行一次 innerHTML 解析 + 一次 querySelector + 一次
// addEventListener + 一段 SVG 串拼接。现在行节点建一次就留着，之后只切 hidden / active；
// 只有「行集合 / 计数 / 当前选中项」变了才重建，而这三种变化都不是逐键发生的。
const collectionRowNodes = new Map(); // collectionKey -> wrapper
let collectionRowsSignature = "";

function collectionRowsFingerprint(rows, allLabel) {
  return `${allLabel}\u0002${selectedCollection}\u0002${rows.map((row) => `${row.key}\u0000${row.name}\u0000${row.count}`).join("\u0001")}`;
}

function buildCollectionRow(row) {
  const wrapper = document.createElement("div");
  wrapper.className = "collection-row";
  const button = document.createElement("button");
  button.className = "collection-button";
  button.type = "button";
  button.dataset.collectionKey = row.key;
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
}

function renderCollections() {
  const total = allVideos().length;
  const query = collectionFilterInput ? collectionFilterInput.value.trim().toLocaleLowerCase() : "";
  const allLabel = BcaI18n.t("全部收藏");
  collectionTotal.textContent = String(collections.length);
  // 过滤只是隐藏行，不动 collections 本身：拖动排序与其它逻辑照旧
  // （「全部收藏」那一行也永远建出来，过滤时切 hidden，不再整个从 DOM 里摘掉）
  const rows = [
    { name: allLabel, key: "*", count: total, glyph: "library" },
    ...collections.map((item) => ({ name: item.name, key: item.name, count: item.videos.length, glyph: "collection" }))
  ];
  const signature = collectionRowsFingerprint(rows, allLabel);
  if (signature !== collectionRowsSignature || collectionRowNodes.size !== rows.length) {
    // 过滤时会被隐藏的行里可能有焦点，重画前先记下，重画后还给同一个收藏夹
    const focusedKey = document.activeElement?.dataset?.collectionKey || "";
    collectionRowNodes.clear();
    collectionList.replaceChildren(...rows.map((row) => {
      const wrapper = buildCollectionRow(row);
      collectionRowNodes.set(row.key, wrapper);
      return wrapper;
    }));
    collectionRowsSignature = signature;
    if (focusedKey) {
      const target = [...collectionList.querySelectorAll(".collection-button")].find((item) => item.dataset.collectionKey === focusedKey);
      if (target) target.focus();
    }
  }
  let visibleCount = 0;
  for (const row of rows) {
    const node = collectionRowNodes.get(row.key);
    if (!node) continue;
    const hit = !query || row.name.toLocaleLowerCase().includes(query);
    node.hidden = !hit;
    if (hit) visibleCount += 1;
    const button = node.firstElementChild;
    if (button) {
      button.classList.toggle("active", selectedCollection === row.key);
      button.setAttribute("aria-current", selectedCollection === row.key ? "page" : "false");
    }
  }
  if (collectionFilterEmpty) collectionFilterEmpty.hidden = !query || visibleCount > 0;
}

function selectedRecords() {
  return allVideos().filter((video) => selectedVideoIds.has(video.id));
}

function updateBatchControls() {
  const records = selectedRecords();
  selectedCount.textContent = BcaI18n.t("已选 {count} 个", { count: formatCountText(records.length) });
  const allVisibleSelected = visibleVideoIds.length > 0 && visibleVideoIds.every((id) => selectedVideoIds.has(id));
  selectVisibleButton.textContent = allVisibleSelected ? BcaI18n.t("取消当前结果选择") : BcaI18n.t("全选当前结果");
  selectVisibleButton.disabled = visibleVideoIds.length === 0;
  moveSelectedButton.disabled = records.length === 0;
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
// 1.7.12（perf PF-2）：比较器里现写 `localeCompare(..., "zh-CN")` 的话，每比较一次就现建
// 一个 collator —— 800 个 UP 主排下来约 7700 次，占了那次 6.78 ms 里的大头。提到模块级复用。
const OPTION_TEXT_COLLATOR = new Intl.Collator("zh-CN");
// 1.8.7（P1-5）：按标题排序的比较器也提到模块级 —— 原来写在比较函数体里，
// 每比较一次就现建一个 collator，整表排下来等于建了上万次。
const TITLE_COLLATOR = new Intl.Collator("zh-CN");
function countByFrequency(values) {
  const counts = new Map();
  for (const value of values) {
    const text = String(value || "").trim();
    if (!text) continue;
    counts.set(text, (counts.get(text) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || OPTION_TEXT_COLLATOR.compare(left[0], right[0]))
    .map(([value, count]) => ({ value, count }));
}

// 选项列表要跟着搜索与 #videoFilter 的筛选结果走，但**不受自己的当前选择影响**——
// 否则一旦选了某个 UP 主，其它 UP 主就从下拉里消失，再也换不回去。
function populateSelectOptions(select, options, allLabel, currentValue) {
  const previous = currentValue ?? select.value;
  /* 1.8.7（P2-8）：选项文案与计数都没变时**不要重建 DOM**。
     重建上千个 <option> 是纯白花：下拉会掉焦点、选中态要重设一遍，滚动位置也可能跳。
     签名里带上「全部」那一项的文案与每个 (计数, 值)，二者任一变化都必须重建。 */
  const signature = [allLabel, ...options.map((item) => `${item.count}\u0000${item.value}`)].join("\u0001");
  if (select.dataset.poolSignature === signature) {
    select.value = options.some((item) => item.value === previous) ? previous : "all";
    return select.value;
  }
  const nodes = [new Option(allLabel, "all")];
  for (const item of options) nodes.push(new Option(`${item.value}（${item.count}）`, item.value));
  select.replaceChildren(...nodes);
  select.dataset.poolSignature = signature;
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
//
// 1.7.12（perf PF-2）：语义没变，但那 0.5~3 秒现在是 6.78 ms（10 000 条 / 12 万标签，
// 含两次全表词频 + 两次全排序，还不含上千个 new Option 的节点成本）—— 仍然比「敲一个
// 字符」该有的代价贵得多。所以搜索那条路多一层按 (收藏范围, #videoFilter, 搜索词)
// 做键的缓存：连着敲、以及退格回到上一个词，都能直接命中。
// 失效很干脆 —— 所有**数据变化**（扫描、删除、搬运、加视频、下载状态、导入配置）
// 走的都是下面这个不带缓存的入口，进来先清空缓存，所以缓存只活在一次数据变更到下一次之间。
const videoFilterPoolCache = new Map(); // 指纹 -> { up, tag }
const VIDEO_FILTER_POOL_CACHE_MAX = 30;

function videoFilterPoolKey() {
  return `${selectedCollection}\u0000${videoFilterSelect.value}\u0000${searchQuery()}`;
}

function buildVideoFilterPool() {
  videoFilter = videoFilterSelect.value;
  const videosForOptions = selectedVideos().filter((video) => matchesBaseFilters(video, searchQuery()));
  return {
    up: countByFrequency(videosForOptions.map((video) => video.upName)),
    tag: countByFrequency(videosForOptions.flatMap((video) => video.tags))
  };
}

function applyVideoFilterPool(pool) {
  if (upFilterSelect) upFilter = populateSelectOptions(upFilterSelect, pool.up, BcaI18n.t("全部 UP 主"), upFilter);
  if (tagFilterSelect) tagFilter = populateSelectOptions(tagFilterSelect, pool.tag, BcaI18n.t("全部标签"), tagFilter);
}

// 数据源或筛选条件变化时走这里（不带缓存，顺手把逐键缓存清掉）
function refreshVideoFilterOptions() {
  videoFilterPoolCache.clear();
  applyVideoFilterPool(buildVideoFilterPool());
}

// 搜索框逐键走这里：同一 (收藏范围, #videoFilter, 搜索词) 只算一次
function refreshVideoFilterOptionsForSearch() {
  const key = videoFilterPoolKey();
  let pool = videoFilterPoolCache.get(key);
  if (!pool) {
    pool = buildVideoFilterPool();
    if (videoFilterPoolCache.size >= VIDEO_FILTER_POOL_CACHE_MAX) videoFilterPoolCache.clear();
    videoFilterPoolCache.set(key, pool);
  }
  applyVideoFilterPool(pool);
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

/* 1.8.6：当前页卡片建好之后再去读封面 —— 一页最多 100 张，翻页才有 IO。
   读完只把占位图换成 <img>，不重画卡片（重画会把焦点、选中状态都弄丢）。 */
function paintPageCovers(pageCards) {
  for (const { card, video } of pageCards) {
    if (video.cover) continue;
    const holder = card.querySelector(".card-cover");
    if (!holder) continue;
    hydrateCover(video).then((url) => {
      if (!url || !card.isConnected) return;
      const fallback = holder.querySelector(".cover-fallback");
      if (!fallback) return;
      const image = document.createElement("img");
      image.src = url;
      image.alt = "";
      image.loading = "lazy";
      fallback.replaceWith(image);
    }).catch(() => {});
  }
}

/* 1.8.7（P1-5）：只取排序后的前 count 条。
   原来每敲一个键就把整表（上万条）sort 一遍，可真正要显示的只有当前页那几十条。
   这里用一个「大小封顶为 count 的最大堆」挑出前 count 名，再对这 count 条排序。
   相等项一律按原数组下标兜底（`|| a - b`），结果与「整表稳定排序后再切页」逐项一致 ——
   稳定排序对相等元素保序，所以下标兜底就是同一份顺序，不会因为换算法就让列表抖动。 */
function selectFirstVideos(list, count, compare) {
  const limit = Math.max(0, Math.min(Number(count) || 0, list.length));
  if (!limit) return [];
  // 要的比一半还多：挑的代价已经不比整排便宜，直接整排
  if (limit * 2 >= list.length) {
    const indexes = list.map((_, index) => index);
    indexes.sort((left, right) => compare(list[left], list[right]) || left - right);
    return indexes.map((index) => list[index]);
  }
  const heap = []; // 最大堆：堆顶是当前「排得最靠后」的那一条（存的是下标）
  const siftUp = (start) => {
    let node = start;
    while (node > 0) {
      const parent = (node - 1) >> 1;
      if (compare(list[heap[node]], list[heap[parent]]) <= 0) break;
      const swap = heap[node]; heap[node] = heap[parent]; heap[parent] = swap;
      node = parent;
    }
  };
  const siftDown = () => {
    let node = 0;
    for (;;) {
      const left = node * 2 + 1;
      const right = left + 1;
      let largest = node;
      if (left < heap.length && compare(list[heap[left]], list[heap[largest]]) > 0) largest = left;
      if (right < heap.length && compare(list[heap[right]], list[heap[largest]]) > 0) largest = right;
      if (largest === node) return;
      const swap = heap[node]; heap[node] = heap[largest]; heap[largest] = swap;
      node = largest;
    }
  };
  for (let index = 0; index < list.length; index += 1) {
    if (heap.length < limit) { heap.push(index); siftUp(heap.length - 1); continue; }
    if (compare(list[index], list[heap[0]]) < 0) { heap[0] = index; siftDown(); }
  }
  heap.sort((left, right) => compare(list[left], list[right]) || left - right);
  return heap.map((index) => list[index]);
}

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
  /* P2-12：筛选值的总数（「共 N 条」用的那个）不再拿 videos 再 filter 一遍 ——
     那一趟在这里顺路数完。两个计数都只来自内存里的记录数组，不碰文件系统。 */
  const matching = [];
  let filterTotal = 0;
  for (const video of videos) {
    if (videoFilter === "invalid" ? video.isInvalid : video.downloaded) filterTotal += 1;
    if (matchesVideoFilters(video, query)) matching.push(video);
  }
  const sort = sortSelect.value;
  /* 4.5：按播放量从高到低。没有播放量数据的排在最后（用 -1 而不是 0，
     否则“0 播放”会和“没有数据”混在一起），同档再按收藏时间倒序。
     1.8.7（P1-5）：比较器只建一份，播放量先算进 Map —— 原来 comparator 里现建
     collator、现读属性，整表排一万条就是一万次现建 + 二十万次属性读取。 */
  const viewsByVideo = sort === "views" ? new Map(matching.map((video) => {
    const value = Number(video.stats?.view);
    return [video, Number.isFinite(value) && value > 0 ? value : -1];
  })) : null;
  const compareVideos = (a, b) => {
    if (sort === "title") return TITLE_COLLATOR.compare(a.title, b.title);
    if (sort === "oldest") return a.timestamp - b.timestamp;
    if (sort === "views") return viewsByVideo.get(b) - viewsByVideo.get(a) || b.timestamp - a.timestamp;
    return b.timestamp - a.timestamp;
  };

  // 分页：网格里只渲染当前页，visibleVideoIds 也跟着当前页走
  pageCount = Math.max(1, Math.ceil(matching.length / pageSize));
  if (currentPage > pageCount) currentPage = pageCount;
  if (currentPage < 1) currentPage = 1;
  const pageStart = (currentPage - 1) * pageSize;
  // 1.8.7（P1-5）：只要「当前页及以前」那一段的前 k 条，不再给整表排序（见 selectFirstVideos）
  const pageVideos = selectFirstVideos(matching, pageStart + pageSize, compareVideos).slice(pageStart, pageStart + pageSize);
  visibleVideoIds = pageVideos.map((video) => video.id);

  const countLabel = videoFilter !== "all"
    ? BcaI18n.t("{shown} / {total} 个{kind}视频", {
        shown: matching.length,
        total: filterTotal,
        kind: videoFilter === "invalid" ? BcaI18n.t("失效") : BcaI18n.t("已下载")
      })
    : query || upFilter !== "all" || tagFilter !== "all" ? BcaI18n.t("{shown} / {total} 个视频", { shown: formatCountText(matching.length), total: formatCountText(videos.length) }) : BcaI18n.t("{count} 个视频", { count: formatCountText(videos.length) });
  const pageLabel = pageCount > 1 ? ` · ${BcaI18n.t("第 {page}/{pages} 页", { page: currentPage, pages: pageCount })}` : "";
  resultSummary.textContent = (selectedCollection === "*" ? BcaI18n.t("{count}，来自 {collections} 个收藏夹", { count: countLabel, collections: formatCountText(collections.length) }) : countLabel) + pageLabel;
  // 1.8.6：先把卡片都建好，再一页一页地补封面（见 paintPageCovers）
  const pageCards = pageVideos.map((video) => {
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
    // ux P2-11：完整时间原来**只**写在 card.title 上 —— title 读屏不播报、也不能键盘聚焦，
    //   读屏用户永远拿不到精确收藏时间。这里换成真正的 <time datetime>，并把完整时间放进
    //   它的 aria-label。卡片是 role=button + tabindex=0，聚焦时计算可访问名会把子元素的
    //   aria-label 一起读出来，所以键盘与读屏都能拿到；title 只留作鼠标悬停的视觉补充。
    const dateText = relativeTime(video.favoriteAt);
    const dateCell = card.querySelector(".card-date");
    if (dateText) {
      const stampText = `${video.favoriteAt}（${compactDate(video.favoriteAt)}）`;
      const raw = String(video.favoriteAt || "");
      const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(raw) ? raw.replace(" ", "T")
        : (/^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "");
      const stamp = document.createElement("time");
      if (iso) stamp.dateTime = iso;
      stamp.textContent = dateText;
      stamp.title = stampText;
      stamp.setAttribute("aria-label", stampText);
      dateCell.textContent = "";
      dateCell.appendChild(stamp);
      card.title = stampText;
    } else {
      dateCell.textContent = dateText;
    }
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
    return { card, video };
  });
  videoGrid.replaceChildren(...pageCards.map((entry) => entry.card));
  paintPageCovers(pageCards);
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
  info.textContent = BcaI18n.t("共 {pages} 页 / {total} 个，跳至", { pages: formatCountText(pageCount), total: formatCountText(total) });

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
  // P2-13：换页也要尊重「减少动态效果」，复用「回到顶部」那一个判断
  // （prefersReducedMotion 定义在本文件后半的 V1.4.1 段落里，是 const；
  //   本函数只在事件里被调用，那时它早已初始化，不会踩 TDZ）。
  videoGrid.scrollIntoView({ block: "start", behavior: prefersReducedMotion() ? "auto" : "smooth" });
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
  } catch (error) {
    // 读不回来就用默认的视图模式与每页数量，界面上看不出来，但得留一条原因。
    console.warn("恢复界面视图设置失败（用默认的列表与每页数量）", error);
  }
}

/* ---------------- 4.6：配置导出 / 导入 ----------------

   只导出「界面偏好」：主题、语言、每页数量、视图模式、收藏夹排序，以及当前这一页的
   筛选偏好。**绝不导出**目录授权句柄（IndexedDB 里的 rootHandle / downloadFolder）、
   任何 B 站数据、任何错误报告内容，也不做除用户点选之外的文件访问。
   1.7.17 起「收藏夹顺序 + 三项筛选」按**个人内容**对待：导出前会列出具体内容并要求确认，
   设置页另外提供只导「外观与档位」的入口，导入侧同样会二次确认。 */
// 1.7.17（facet-privacy P1-2）：配置文件的形状与「带了哪些个人内容」的判断都搬到了
// archive-core.js —— 导出前的提示、导入时的二次确认、设置页的「只导外观与档位」
// 读的是同一份实现，不会再各说各话。
const CONFIG_APP_ID = BcaArchiveCore.CONFIG_APP_ID;
const CONFIG_VERSION = BcaArchiveCore.CONFIG_VERSION;
const CONFIG_NAME = BcaArchiveCore.CONFIG_NAME;

function currentFilterPreferences() {
  return {
    search: searchInput?.value || "",
    videoFilter: videoFilterSelect?.value || "all",
    upFilter,
    tagFilter,
    sort: sortSelect?.value || "newest"
  };
}

/* includePersonal === false 时只带主题 / 语言 / 每页数量 / 视图模式（设置页那个入口用）。 */
function buildConfigPayload(includePersonal = true) {
  return BcaArchiveCore.buildConfigPayload({
    theme: BcaTheme.current(),
    locale: BcaI18n.locale(),
    pageSize,
    viewMode,
    collectionOrder: [...collectionOrder],
    filters: currentFilterPreferences()
  }, { includePersonal });
}

/* 「这份配置里带了哪些你自己的东西」—— 人话版。导出提示与导入确认共用同一份。 */
function configPersonalSummaryText(payload) {
  const fields = BcaArchiveCore.configPersonalFields(payload);
  const parts = [];
  if (fields.collections) parts.push(BcaI18n.t("收藏夹顺序里的 {count} 个收藏夹名", { count: fields.collections }));
  if (fields.search) parts.push(BcaI18n.t("搜索关键词「{text}」", { text: fields.search }));
  if (fields.upFilter) parts.push(BcaI18n.t("UP 主筛选「{text}」", { text: fields.upFilter }));
  if (fields.tagFilter) parts.push(BcaI18n.t("标签筛选「{text}」", { text: fields.tagFilter }));
  // 分隔符不进词典：和 refreshScanNotice 的「；」一样，按项目既有做法保持字面量
  return parts.join("、");
}

function downloadConfigFile(includePersonal = true) {
  try {
    const payload = buildConfigPayload(includePersonal);
    // 1.7.17（facet-privacy P1-2）：导出前先把「里面有什么」摆出来。带了个人内容就必须
    // 过一次确认 —— 配置文件是本项目里唯一「设计上要交给别人」的产物，顺手发出去就等于
    // 把自己的收藏夹清单和检索习惯一起公开。
    const detail = configPersonalSummaryText(payload);
    if (detail && !window.confirm(BcaI18n.t("这份配置会带上你自己的内容：{detail}。发给别人就等于把这些一起公开。确定导出吗？", { detail }))) return;
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
    showToast(includePersonal
      ? BcaI18n.t("配置已导出（含收藏夹顺序与筛选）。")
      : BcaI18n.t("配置已导出（只含外观与档位）。"));
  } catch (error) {
    showToast(BcaI18n.t("导出配置失败：{message}", { message: error?.message || BcaI18n.t("未知错误") }));
  }
}


/* 1.7.30（路线图第 2 项）：把整个归档的元数据导成单个 JSON，写进归档根目录的
   004导出/。载荷组装与校验和在 archive-core.js（纯函数、node 里测得到），
   这里只做「取数据 + 写盘 + 说人话」三件事。
   权威来源是磁盘扫描结果、不是数据库 —— 理由写在 archive-core.js 那段注释里（①）。 */
async function exportArchiveMetadata() {
  if (!rootHandle) { showToast(BcaI18n.t("先选一个本地备份文件夹，再导出归档元数据。")); return; }
  if (await archiveWriteLockedByImport()) { showToast(BcaI18n.t("导入正在跑，等它结束再导出，免得导到一半的数据。")); return; }
  const videos = allVideos();
  if (!videos.length) { showToast(BcaI18n.t("收藏库里还没有记录。先点「刷新」读一遍，再导出。")); return; }
  const exportButton = document.getElementById("exportArchive");
  if (exportButton) exportButton.disabled = true;
  showToast(BcaI18n.t("正在导出归档元数据…"));
  try {
    const statsCore = globalThis.BcaStatsCore;
    const seenKeys = new Set(
      (statsCore ? videos.map((video) => statsCore.videoKey(video)) : []).filter(Boolean)
    );
    let database = null;
    let databaseState = "missing";
    if (statsCore) {
      try {
        const databaseDirectory = await rootHandle.getDirectoryHandle(statsCore.DATABASE_FOLDER_NAME);
        const databaseFile = await databaseDirectory.getFileHandle(statsCore.DATABASE_FILE_NAME);
        const databaseText = await (await databaseFile.getFile()).text();
        const parsed = JSON.parse(databaseText.replace(/^\uFEFF/, ""));
        if (parsed && typeof parsed === "object" && parsed.videos && typeof parsed.videos === "object") {
          database = parsed;
          databaseState = "ok";
        } else {
          databaseState = "broken";
        }
      } catch (error) {
        // 读不到数据库不算导出失败：磁盘上的记录才是权威，缺的只是 stale 对照。
        databaseState = error?.name === "NotFoundError" ? "missing" : "unreadable";
      }
    }
    const built = BcaArchiveCore.buildArchiveExportDocument({
      collections: collections.map((collection) => ({ name: collection.name, videos: collection.videos })),
      database,
      seenKeys,
      databaseState,
      generatedAt: new Date().toISOString(),
      appVersion: String(chrome?.runtime?.getManifest?.()?.version || "")
    });
    const exportDirectory = await rootHandle.getDirectoryHandle(BcaArchiveCore.EXPORT_DIR_NAME, { create: true });
    // 同秒连点两次也不覆盖前一份：撞名就加 -2、-3。
    const baseName = BcaArchiveCore.exportFileName(new Date()).replace(/\.json$/, "");
    let fileName = `${baseName}.json`;
    for (let attempt = 2; attempt < 100; attempt += 1) {
      try {
        await exportDirectory.getFileHandle(fileName);
        fileName = `${baseName}-${attempt}.json`;
      } catch (error) {
        if (error?.name !== "NotFoundError") throw error;
        break;
      }
    }
    const exportFile = await exportDirectory.getFileHandle(fileName, { create: true });
    const writable = await exportFile.createWritable();
    await writable.write(built.text);
    await writable.close();
    showToast(BcaI18n.t("已导出 {count} 条记录到 {file}。校验和 {checksum}…", {
      count: BcaArchiveCore.formatCountText(built.payload.counts.records),
      file: fileName,
      checksum: built.checksum.slice(0, 8)
    }));
    if (built.payload.counts.stale) {
      showToast(BcaI18n.t("另有 {count} 条数据库里多出来的行已标成 stale（磁盘上找不到）。", {
        count: BcaArchiveCore.formatCountText(built.payload.counts.stale)
      }));
    }
  } catch (error) {
    const explained = BcaArchiveCore.describeDirectoryCreateError(error, BcaArchiveCore.EXPORT_DIR_NAME)
      || BcaArchiveCore.describeFileSystemError(error);
    showToast(BcaI18n.t("归档元数据导出失败：{message}", {
      message: explained || error?.message || BcaI18n.t("未知错误")
    }));
  } finally {
    if (exportButton) exportButton.disabled = false;
  }
}

// 1.7.10（facet-storage P2-2）：manifest 里没有 unlimitedStorage，chrome.storage.local
// 是 10MB 硬配额，而配置文件正常只有几 KB。这里给一个 256KB 的闸，免得一次误选
// （例如把导出的归档清单当配置导入）就把插件存储挤到配额边缘。
const MAX_CONFIG_BYTES = 256 * 1024;

// 导入前逐项校验：任何一项不认识就退回默认值，不让坏文件把界面写成空白
function sanitizeConfigPreferences(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  // 1.8.4：文件里到底有没有 filters —— 「只导外观与档位」的文件没有这一项。
  // 没有就必须返回 null（而不是补一套默认值），否则导入会把用户此刻的搜索词、
  // 筛选与排序一起清成默认 —— 那不是这个按钮承诺的事。
  const hasFilters = Boolean(source.filters) && typeof source.filters === "object";
  const filters = hasFilters ? source.filters : {};
  const pageSizeValue = Number(source.pageSize);
  const search = typeof filters.search === "string" ? BcaArchiveCore.sliceCodePoints(filters.search, 200) : "";
  const videoFilterValue = ["all", "invalid", "downloaded"].includes(filters.videoFilter) ? filters.videoFilter : "all";
  const sortValue = ["newest", "oldest", "title", "views"].includes(filters.sort) ? filters.sort : "newest";
  return {
    theme: BcaTheme.isSupported(source.theme) ? source.theme : null,
    locale: BcaI18n.isSupported(source.locale) ? source.locale : null,
    pageSize: PAGE_SIZES.includes(pageSizeValue) ? pageSizeValue : null,
    viewMode: source.viewMode === "list" || source.viewMode === "grid" ? source.viewMode : null,
    // 1.7.10（facet-storage P2-2）：条数封顶不够，每一条也要封顶 —— 500 个超长字符串
    // 一样能把 chrome.storage.local 挤到配额边缘。
    collectionOrder: Array.isArray(source.collectionOrder)
      ? source.collectionOrder.filter((name) => typeof name === "string").slice(0, 500).map((name) => BcaArchiveCore.sliceCodePoints(name, 120))
      : [],
    filters: hasFilters
      ? {
          search,
          videoFilter: videoFilterValue,
          upFilter: typeof filters.upFilter === "string" ? BcaArchiveCore.sliceCodePoints(filters.upFilter, 120) : "all",
          tagFilter: typeof filters.tagFilter === "string" ? BcaArchiveCore.sliceCodePoints(filters.tagFilter, 120) : "all",
          sort: sortValue
        }
      : null
  };
}

async function applyConfigPreferences(preferences, rawOrder) {
  // 主题存 localStorage（theme.js 要同步读它防闪色），所以这里调 BcaTheme.use 而不是写 chrome.storage
  if (preferences.theme) BcaTheme.use(preferences.theme);
  if (preferences.locale) await BcaI18n.use(preferences.locale);
  if (preferences.pageSize) pageSize = preferences.pageSize;
  if (preferences.viewMode) viewMode = preferences.viewMode;
  // 1.7.10（facet-storage P2-2）：写失败原来是空 catch，用户看到「配置已导入。」
  // 却不知道排序根本没存下来。现在每一种「没生效」都收进 warnings，由调用方
  // 如实告诉用户 —— 宁可说「导入成功但有 N 项没生效」，也不能报喜不报忧。
  const warnings = [];
  // 收藏夹排序只在配置里带了排序、且本机确实有这些收藏夹时才写，
  // 否则会把用户现有的顺序覆盖成一份对不上的清单。
  // 1.7.10（P2-2）：只要求「至少一个对得上」不够 —— 对不上的那些照样会被写进去。
  if (rawOrder.length) {
    const known = new Set(collections.map((collection) => collection.name));
    const usable = rawOrder.filter((name) => known.has(name));
    if (!usable.length) {
      warnings.push(BcaI18n.t("配置里的收藏夹顺序在本机一个都对不上，已忽略。"));
    } else if (!collectionOrderLoaded) {
      warnings.push(BcaI18n.t("这次没能读到已保存的收藏夹顺序，为避免覆盖它，配置里的顺序没有写入。"));
    } else {
      collectionOrder = usable;
      try {
        await chrome.storage.local.set({ collectionOrder });
      } catch (error) {
        warnings.push(BcaI18n.t("收藏夹顺序没保存成功：{message}", { message: error?.message || BcaI18n.t("插件存储不可用") }));
      }
    }
  }
  // 1.8.4：文件里没有 filters（例如「只导外观与档位」）时整段跳过 —— 用户此刻的
  // 搜索词、三项筛选与排序保持原样，别被一份不含这些内容的文件清成默认值。
  if (preferences.filters) {
    searchInput.value = preferences.filters.search;
    videoFilterSelect.value = preferences.filters.videoFilter;
    videoFilter = videoFilterSelect.value;
    upFilter = preferences.filters.upFilter;
    tagFilter = preferences.filters.tagFilter;
    sortSelect.value = preferences.filters.sort;
  }
  saveViewSettings();
  applyViewMode();
  resetPaging();
  return warnings;
}

async function importConfigFromText(text) {
  const source = String(text || "");
  // 1.7.10（facet-storage P2-2）：大小闸在解析之前 —— 先量再吃，别把 10MB 的
  // JSON.parse 结果留在内存里。文件选择处还有一道 file.size 的同款检查。
  if (source.length > MAX_CONFIG_BYTES) {
    throw new Error(BcaI18n.t("这个配置文件有 {size}，超过了 {limit}，为了不把插件存储挤爆，没有导入。", {
      size: formatBytes(source.length),
      limit: formatBytes(MAX_CONFIG_BYTES)
    }));
  }
  let payload;
  try {
    // 导出时写了 BOM，这里去掉再解析
    payload = JSON.parse(source.replace(/^\ufeff/, ""));
  } catch (_) {
    throw new Error(BcaI18n.t("这个文件不是合法的 JSON，无法导入。"));
  }
  if (!payload || typeof payload !== "object" || payload.app !== CONFIG_APP_ID) {
    throw new Error(BcaI18n.t("这不是哔哩藏库导出的配置文件。"));
  }
  // 1.7.17（facet-privacy P1-2）：配置里带着收藏夹名 / 筛选关键词时，导入前二次确认。
  // 那是别人（或你自己以前）的检索习惯，不该悄悄覆盖掉当前的排序与筛选。
  const personalDetail = configPersonalSummaryText(payload);
  if (personalDetail && !window.confirm(BcaI18n.t("这份配置里带着收藏夹名与筛选关键词：{detail}。导入会用它们覆盖当前的排序与筛选（本地归档文件不会被改动）。确定导入吗？", { detail: personalDetail }))) {
    return false;
  }
  const preferences = sanitizeConfigPreferences(payload.preferences);
  const rawOrder = Array.isArray(payload.preferences?.collectionOrder) ? preferences.collectionOrder : [];
  // upFilter / tagFilter 指向的 UP 主或标签可能已经不在本地库里，扫描后统一落回「全部」
  const warnings = await applyConfigPreferences(preferences, rawOrder);
  if (rootHandle) await displayRoot(rootHandle, selectedCollection, BcaI18n.t("已导入配置"));
  // 没有根目录时数据源是空的：选项池按空数据源重建一次（与 4.6 的行为一致，会落回「全部」）
  else { renderCollections(); refreshVideoFilterOptions(); renderVideos(); }
  // 1.7.10（facet-storage P2-2）：落回「全部」是 populateSelectOptions 的自愈行为，
  // 界面不会吭声，用户只看到「导入后列表空了」，很容易以为数据被删了。这里补一句。
  // 1.8.4：文件里没有 filters 时这两条「落回全部」的提醒也不成立（我们压根没动筛选）。
  if (preferences.filters && preferences.filters.upFilter !== "all" && upFilter === "all") {
    warnings.push(BcaI18n.t("配置里的 UP 主筛选在本机没有对应项，已落回「全部」。"));
  }
  if (preferences.filters && preferences.filters.tagFilter !== "all" && tagFilter === "all") {
    warnings.push(BcaI18n.t("配置里的标签筛选在本机没有对应项，已落回「全部」。"));
  }
  return warnings;
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

/* 1.7.9（ux P2-5）：这块提示是 role="status"，每次改文本屏幕阅读器都要播报一遍。
   一个收藏夹几百条时后台会一条一条地回进度，原来每次都直接写 textContent ——
   读屏会被刷屏、浏览器也要反复重排这一段。这里按 500ms 节流：状态照收，
   只把「写 DOM」的频率压下来，并且保证最后一次一定落盘（否则会停在 17/20）。 */
const STATUS_PROGRESS_THROTTLE_MS = 500;
let statusProgressShownAt = 0;
let statusProgressTimer = 0;

function flushStatusProgress() {
  statusProgressTimer = 0;
  statusProgressShownAt = Date.now();
  statusConfirmProgress.hidden = false;
  statusConfirmProgress.textContent = statusProgressText(statusProgressState);
}

// 收尾/清空用：立刻落盘，把还挂着的定时器撤掉
function flushStatusProgressNow() {
  if (statusProgressTimer) {
    clearTimeout(statusProgressTimer);
    statusProgressTimer = 0;
  }
  flushStatusProgress();
}

function cancelStatusProgressTimer() {
  if (statusProgressTimer) {
    clearTimeout(statusProgressTimer);
    statusProgressTimer = 0;
  }
}

function resetStatusProgress() {
  cancelStatusProgressTimer();
  statusProgressState = { done: 0, total: 0, title: "" };
}

// 后台的进度文案固定是中文（service worker 不参与多语言），所以只从里面取出
// 已经算好的「3/20」与标题，再用本地语言重新拼一遍；取不到就原样显示。
function statusProgressText(state) {
  const counter = state.done && state.total ? formatProgressCounter(state.done, state.total) : "";
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
  // 节流：距上次写屏不到 500ms 就只挂一个尾随定时器（同一个时刻只有一个）
  const since = Date.now() - statusProgressShownAt;
  if (since >= STATUS_PROGRESS_THROTTLE_MS) {
    flushStatusProgressNow();
  } else if (!statusProgressTimer) {
    statusProgressTimer = setTimeout(flushStatusProgress, STATUS_PROGRESS_THROTTLE_MS - since);
  }
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
  // P2-14：上一批还在后台跑（用户可能按过「不再等待」）时，静默 return 会让
  // 「更新状态」看起来是坏的；如实说一句，并说明这一批结束前开不了新的。
  if (statusRefreshInProgress) {
    showToast(BcaI18n.t("上一批更新还在后台进行，结束后才能发起新的更新。"));
    return;
  }
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
  // 1.7.9（ux P2-5）：这里清空时要撤掉还挂着的节流定时器 —— 否则它会在这个
  // 对话框已经重新打开之后才落盘，把上一次的「17/20」重新写回一行空白提示里。
  cancelStatusProgressTimer();
  statusConfirmProgress.hidden = true;
  statusConfirmProgress.textContent = "";
  statusConfirmGo.disabled = false;
  // 文案与状态一起复位（P2-14：等待后台期间它叫「不再等待」）
  setStatusCancelWaiting(false);
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

/* P2-14：更新状态这一批是后台在跑，界面**拦不住它** —— 消息协议里没有「取消这批更新」，
   加一个要前后台同时上线（这一版不做，也不新增消息类型）。所以按钮不能叫「取消」：
   等待后台期间它如实改叫「不再等待」，点了就关掉对话框，并明说后台仍会继续、
   这一批结束前不能再发起新的更新。看门狗不动：后台真吊死时 60 秒后仍会给一条超时说明。 */
let statusWaitingForBackground = false;

// 文案跟着状态走。data-i18n 一起改掉：切语言时 BcaI18n.apply 会按它重写 textContent，
// 不改就会被切回「取消」；词典里查不到这个新键时 t() 原样返回，显示的仍是中文原文。
function setStatusCancelWaiting(waiting) {
  statusWaitingForBackground = waiting;
  statusConfirmCancel.disabled = false;
  if (waiting) {
    statusConfirmCancel.dataset.i18n = "不再等待";
    statusConfirmCancel.textContent = BcaI18n.t("不再等待");
  } else {
    statusConfirmCancel.dataset.i18n = "取消";
    statusConfirmCancel.textContent = BcaI18n.t("取消");
  }
}

/* 「不再等待」只有一个出口：复位状态 + 关掉对话框 + 如实说明后台还在跑。
   按钮点击与 Esc 都走这里；不在等待状态时是空操作，重复调用安全。 */
function abandonStatusWait() {
  if (!statusWaitingForBackground) return;
  setStatusCancelWaiting(false);
  if (statusConfirm.open) statusConfirm.close();
  showToast(BcaI18n.t("已不再等待：后台仍会继续处理这一批，结束后才能发起新的更新；完成后点右上角的「刷新」查看结果。"));
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
  // P2-14：请求一旦发出去就拦不住了，不能把「取消」禁用着摆样子 —— 改成如实、可点的
  // 「不再等待」（见 setStatusCancelWaiting 的注释）。
  setStatusCancelWaiting(true);
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
    // 后台已经回话：从这一刻起「不再等待」不再成立，剩下的只是本地重新渲染列表
    setStatusCancelWaiting(false);
    statusConfirmCancel.disabled = true;
    if (!result?.ok) throw new Error(result?.message || BcaI18n.t("更新失败。"));
    const summary = targets.length === 1 ? statusDetailText(result) : statusSummaryText(result);
    const remaining = Number(result.remaining) || 0;
    // 1.7.9（ux P2-5）：先撤掉节流里还没落盘的那次进度写入，否则它会在这行之后
    // 才执行，把刚写好的结果摘要又盖回「正在更新视频状态 20/20…」。
    cancelStatusProgressTimer();
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
    setStatusCancelWaiting(false);
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

/* ---------------- P2-8：导入进行中 / 暂停中的提示条 ----------------

   后台（background.js）把导入状态写在 storage.local.importState 上：
   { running, paused, updatedAt, text?, summary?, finishedAt? }，running === true 表示
   正在进行**或**正暂停。收藏库和导入会同时改同一批归档：导入期间在这里移动、
   删除、标记「已下载」，轻则被本轮判成缺失、重则把后台正在写的目录删掉记一条失败。
   所以这里只做「看得见」这件事 —— 不禁用任何按钮、不弹对话框（用户可能就是想边导
   边整理），状态自己在结束时收起。 */
let lastImportState = null;
let importWasRunning = false;

/* 1.7.3：导入在不在跑。导入期间每写一批快照都会触发 bcaStats 变化，自动刷新要知道
   这件事，才能把节奏放慢（见 scheduleArchiveRefresh）。 */
let importIsRunning = false;

function applyImportState(state) {
  const wasRunning = importIsRunning;
  importIsRunning = state?.running === true;
  /* 1.7.5：导入**结束**才收口刷一次列表。之前靠 bcaStats 变化触发，而导入期间每写一批
     快照都会写一次 bcaStats —— 真机上 575 个记录就是一遍遍整树重扫（「正在读取 568/575…」），
     文件系统调用量随记录数线性上升，收益却只是列表早点更新几条。 */
  if (wasRunning && !importIsRunning) scheduleArchiveRefresh();
  if (!importRunningNotice) return;
  lastImportState = state || null;
  const running = state?.running === true;
  // 导入刚结束：归档里可能多出了封面 / 媒体文件，体积缓存作废（条数可能没变）
  if (importWasRunning && !running) invalidateStorageUsageCache();
  importWasRunning = running;
  importRunningNotice.classList.toggle("is-paused", running && state?.paused === true);
  if (!running) { importRunningNotice.hidden = true; return; }
  importRunningText.textContent = state.paused === true
    ? BcaI18n.t("导入已暂停：这期间在收藏库里移动、删除或标记「已下载」可能与它互相影响，建议等它结束后再操作。")
    : BcaI18n.t("导入正在进行：这期间在收藏库里移动、删除或标记「已下载」可能与它互相影响，建议等它结束后再操作。");
  importRunningNotice.hidden = false;
}

async function restoreImportState() {
  if (!importRunningNotice) return;
  try {
    const saved = await chrome.storage.local.get("importState");
    applyImportState(saved?.importState || null);
  } catch (_) {
    // 读不到就不显示：提示条是附加信息，不能因此让页面初始化失败
  }
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
  const cards = STAT_KEYS
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

// 1.7.12（perf PF-7）：报告点名的 `bindCopyButton()` 在本仓库不存在（它把 copyFieldButton
// 与 trapFocus 看成了一个函数，行号也落在别处），当前也没有「同一个 button 被绑两次」的
// 可达路径 —— copyFieldButton 每次都新建节点。但「一次点击复制两遍、弹两个 toast」这类
// 副作用叠加只差一次重构就会回来，所以在绑定这一层加一道幂等闸：同一个元素只认第一次绑定。
const copyBoundElements = new WeakSet();
function bindCopyToClipboard(element, value, successMessage) {
  if (copyBoundElements.has(element)) return element;
  copyBoundElements.add(element);
  element.addEventListener("click", () => copyToClipboard(value, successMessage));
  return element;
}

function copyFieldButton(value, label) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "detail-copy-field";
  button.title = label;
  button.setAttribute("aria-label", BcaI18n.t("{label}：{value}", { label, value }));
  button.innerHTML = `${BcaIcons.svg("copy")}${escapeHtml(label)}`;
  bindCopyToClipboard(button, value, BcaI18n.t("{label}成功", { label }));
  return button;
}

// 1.7.9（ux P2-6）：体积 / 计数 / 进度三处数字格式统一由 archive-core.js 的实现提供
// （library.html 里 archive-core.js 排在 library.js 前面，所以顶层就能取到）。
const formatBytes = BcaArchiveCore.formatBytes;
const formatCountText = BcaArchiveCore.formatCountText;
const formatProgressCounter = BcaArchiveCore.formatProgressCounter;

// 扫描进度文案：两个数也过一遍统一格式化，别在这里裸拼数字
function scanProgressText(value) {
  return BcaI18n.t("正在读取 {done}/{total}…", {
    done: formatCountText(value?.done),
    total: formatCountText(value?.total)
  });
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

/* ---------------- 4.2：顶部“本地归档占用” ---------------- */

/* P2-12：递归累加整个根目录的字节数是纯「后台跑腿」的活，三条约束：
   1) 延后 —— 列表渲染完再排队，交给 requestIdleCallback（没有就退化成 setTimeout），
      不和首屏抢主线程；页面在后台时干脆不打盘，等回到前台再补算；
   2) 单飞 + 合并 —— 同一时刻只跑一次，期间再来请求只记下最新根目录，本轮结束后补算；
   3) 结果缓存 —— 按根目录缓存「字节数 + 档案签名（记录条数/收藏夹数）」，签名没变直接复用。
   扫描那条路（readArchiveRecord / inspectDownloadDirectory）只读 视频信息.txt、只看有没有
   文件，拿不到单个文件的大小，所以没法直接复用它的结果，只能用签名 + 显式作废代替：
   导入结束、下载目录 revision 变化都会作废缓存 —— 那两种情况下条数可能没变，但磁盘上
   确实多出了封面 / 媒体文件。 */
const storageUsageCache = new Map(); // rootKey -> { total, signature }

function archiveSignature() {
  return `${allVideos().length}:${collections.length}`;
}

function invalidateStorageUsageCache() {
  storageUsageCache.clear();
}

// 让出主线程，等浏览器空闲再开始递归（走缓存时也走这里，保证顺序稳定）
function whenIdle() {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback === "function") requestIdleCallback(() => resolve(), { timeout: 1000 });
    else setTimeout(resolve, 0);
  });
}

// 统计放在 displayRoot() 渲染之后异步跑，先出界面再慢慢算。
// 同一时刻只允许一次递归扫描：期间再来请求只记下最新根目录，等本轮结束后补算。
async function updateStorageUsage(handle, options = {}) {
  if (!storageUsage) return;
  if (!handle) { storageUsage.textContent = "—"; return; }
  // 页面在后台：不打盘，回到前台时 visibilitychange 会再调一次
  if (document.hidden) return;
  if (storageUsageRunning) { storageUsageQueuedRoot = handle; return; }
  storageUsageRunning = true;
  storageUsage.textContent = BcaI18n.t("正在计算…");
  try {
    await whenIdle();
    const key = rootCacheKey(handle);
    const signature = archiveSignature();
    const cached = storageUsageCache.get(key);
    // 1.8.5：扫描那一遍已经量到了每条记录里的文件（视频信息.txt + 封面）、下载目录
    // （下载索引本来就要递归枚举那棵树）和几个固定目录 —— 直接拿来用，不再整树递归。
    // 拿不到（比如页面刚打开还没扫过）才退回递归，宁可慢也不给一个编出来的数字。
    const knownTotal = Number(options.total) > 0 ? Number(options.total) : 0;
    let total;
    if (cached && cached.signature === signature) {
      total = cached.total; // 同一份档案：直接复用上次的结果
    } else if (knownTotal) {
      total = knownTotal;
      storageUsageCache.set(key, { total, signature: archiveSignature() });
    } else {
      total = await directorySize(handle);
      storageUsageCache.set(key, { total, signature: archiveSignature() });
    }
    // 统计期间可能已经换了根目录：只给还是当前根目录的那个写结果
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
  // 标签做成链接，点一下跳到 B 站的标签搜索页：看到「哆啦A梦」这种标签，
  // 用户下一步十有八九就是想去 B 站找同类视频。
  // search.bilibili.com 只是普通的链接跳转，不需要 host_permissions
  // （和「在 B 站打开视频」那条同理）；target="_blank" 免得把扩展页本身导航走。
  const tags = video.tags.length
    ? `<div class="detail-tags">${video.tags.map((tag) => `<a class="detail-tag" href="https://search.bilibili.com/all?keyword=${encodeURIComponent(tag)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(BcaI18n.t("在 B 站搜索标签“{tag}”", { tag }))}">${escapeHtml(tag)}</a>`).join("")}</div>`
    : `<p class="detail-empty">${BcaIcons.svg("tag")}${escapeHtml(BcaI18n.t("这个归档没有记录标签"))}</p>`;
  // 封面和标题也是入口：点开一条视频的详情，下一步十有八九就是想去 B 站看它。
  // 失效视频在 B 站已经没有能看的页面（点过去只有 404），所以它们的封面和标题同样改去
  // Bing 搜标题 —— 和下面「全网搜索该视频」那条按钮一个出口，因此不用新增词典键。
  // 归档里没记 URL、又不是失效视频时（老存档、手动加的条目）一律不渲染链接：
  // 宁可点不动，也不能给一个 href="" 的空链接 —— 那会把扩展页自己导航走。
  // 链接都走 target="_blank" + rel="noopener noreferrer"，和上面标签链接、下面
  // 「在 B 站打开视频」同规矩：普通链接跳转，不需要任何额外权限。
  const detailHref = video.isInvalid
    ? `https://www.bing.com/search?q=${encodeURIComponent(video.title || "")}`
    : (video.url || "");
  const detailHrefLabel = escapeHtml(video.isInvalid ? BcaI18n.t("全网搜索该视频") : BcaI18n.t("在 B 站打开视频"));
  const coverHtml = detailHref
    ? `<a class="detail-cover detail-cover-link" href="${escapeHtml(detailHref)}" target="_blank" rel="noopener noreferrer" title="${detailHrefLabel}">${safeCover(video.cover)}</a>`
    : `<div class="detail-cover">${safeCover(video.cover)}</div>`;
  const titleHtml = detailHref
    ? `<a class="detail-title-link" href="${escapeHtml(detailHref)}" target="_blank" rel="noopener noreferrer" title="${detailHrefLabel}"></a>`
    : "";
  detailContent.dataset.videoId = video.id;
  detailContent.innerHTML = `${coverHtml}<span class="detail-collection"></span><h2 class="detail-title">${titleHtml}</h2><p class="detail-bvid"></p>${video.url ? `<a class="button button-primary open-video" target="_blank" rel="noopener noreferrer" href="">${BcaIcons.svg("external")}${escapeHtml(BcaI18n.t("在 B 站打开视频"))}</a>` : ""}${video.isInvalid ? `<a class="button button-quiet search-invalid" target="_blank" rel="noopener noreferrer" href="">${BcaIcons.svg("search")}${escapeHtml(BcaI18n.t("全网搜索该视频"))}</a>` : ""}<section class="detail-management"><h3>${BcaIcons.svg("play")}${escapeHtml(BcaI18n.t("本地视频"))}</h3><div class="detail-primary-actions"><button class="button button-quiet open-download-directory" type="button"${video.hasDownloadFiles ? "" : " hidden"}>${BcaIcons.svg("collection-open")}${escapeHtml(BcaI18n.t("打开目录"))}</button></div><button class="button button-quiet mark-downloaded" type="button"${video.downloaded ? " hidden" : ""}>${BcaIcons.svg("check")}${escapeHtml(BcaI18n.t("将下载到本地的视频放入收藏夹中"))}</button><div class="detail-secondary-actions"><button class="button button-quiet copy-download-path" type="button"${video.hasDownloadFiles ? "" : " hidden"}>${BcaIcons.svg("copy")}${escapeHtml(BcaI18n.t("复制视频目录路径"))}</button></div><p class="download-path-note" role="status" hidden></p><p class="detail-size" hidden></p><h3>${BcaIcons.svg("move")}${escapeHtml(BcaI18n.t("本地收藏管理"))}</h3><button class="button button-primary move-local" type="button">${BcaIcons.svg("move")}${escapeHtml(BcaI18n.t("移动或复制"))}</button><button class="button button-danger delete-local" type="button">${BcaIcons.svg("trash")}${escapeHtml(BcaI18n.t("删除本地归档"))}</button><p class="management-note">${escapeHtml(BcaI18n.t("这些整理操作只影响本地归档，不会更改 B 站账户中的收藏。"))}</p></section>${detailStatsHtml(video.stats)}<div class="detail-refresh"><button class="button button-quiet refresh-status" type="button">${BcaIcons.svg("refresh")}<span>${escapeHtml(BcaI18n.t("更新视频状态"))}</span></button><span class="detail-refresh-note">${escapeHtml(BcaI18n.t("重新解析播放量、点赞、UP 主粉丝数等会变化的数值，只覆盖这些数值，不改动标题、简介和标签"))}</span><p class="detail-refresh-status" role="status" hidden></p></div><h3 class="detail-section-title">${BcaIcons.svg("file")}${escapeHtml(BcaI18n.t("视频信息"))}</h3><dl class="detail-fields">${rows.join("")}</dl><h3 class="detail-section-title">${BcaIcons.svg("tag")}${escapeHtml(BcaI18n.t("标签"))}</h3>${tags}<h3 class="detail-section-title">${BcaIcons.svg("info")}${escapeHtml(BcaI18n.t("视频简介"))}</h3><p class="detail-description"></p><button class="text-button detail-description-toggle" type="button" hidden>${escapeHtml(BcaI18n.t("展开全部简介"))}</button>`;
  detailContent.querySelector(".detail-collection").textContent = video.isInvalid ? `${video.collection} · ${BcaI18n.t("已失效")}` : video.collection;
  detailContent.querySelector(".detail-collection").classList.toggle("invalid", video.isInvalid);
  // 1.8.6：详情封面同样「用到才读」；读完只替换占位图，不重画整个面板
  if (!video.cover) {
    hydrateCover(video).then((url) => {
      if (!url || detailContent.dataset.videoId !== video.id) return;
      const fallback = detailContent.querySelector(".detail-cover .cover-fallback");
      if (!fallback) return;
      const image = document.createElement("img");
      image.src = url;
      image.alt = "";
      fallback.replaceWith(image);
      retainDetailCover(url);
    }).catch(() => {});
  }
  // 标题文字写给链接（封面/标题可点时）或 h2 本身。
  // 只认 .detail-title 会把 <a> 里的文字连同链接一起抹掉，标题就变成空白。
  (detailContent.querySelector(".detail-title-link") || detailContent.querySelector(".detail-title")).textContent = video.title;

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
// 原生宿主的协议号。三处必须一致：这里、native/folder-opener-host.ps1 的
// $protocolVersion、native/folder-opener-launcher.cs 的 LauncherProtocolVersion
// （1.7.13 / facet-native P2-6；test/stability.test.cjs 有断言钉住）。
// 以前版本握手是单向的 —— 宿主每次都报 version，扩展从不看，装了一版对不上的
// 宿主只会表现成「点了没反应」。改帧格式或字段语义时必须同时改这三处。
const NATIVE_PROTOCOL_VERSION = 3;

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
        // 1.7.13（facet-native P2-6）：宿主每条帧都带 protocol，对不上就直说。
        // 老宿主（1.7.12 及以前）没有这个字段 —— 那正是「点了没反应」的最常见原因。
        const protocol = Number(response.protocol);
        if (protocol !== NATIVE_PROTOCOL_VERSION) {
          finish(() => reject(new Error(Number.isFinite(protocol) && response.protocol !== undefined
            ? BcaI18n.t("Windows 原生目录助手的协议版本对不上（它报 {got}，本插件需要 {want}）。请重新运行一次安装脚本。", { got: protocol, want: NATIVE_PROTOCOL_VERSION })
            : BcaI18n.t("Windows 原生目录助手没有报告协议版本，装的多半是旧版本。请重新运行一次安装脚本。"))));
          return;
        }
        finish(() => resolve(response));
      });
    } catch (error) {
      finish(() => reject(error));
    }
  });
}

// 当前「正在看」的那条视频。面板关掉之后一律算没有 —— closeDetail 不会清
// detailContent.dataset.videoId，谁在关掉之后再问一次都会拿到上一条，
// 于是切语言（BcaI18n.onChange → relabelAfterLocaleChange）这种「重画一遍界面」
// 的动作，会把用户早就关掉的详情重新弹出来。
function detailVideo() {
  if (!detailPanel.classList.contains("open")) return null;
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
      ? BcaI18n.t("已复制相对路径：{path}。要复制可直接粘贴的完整路径，请安装 Windows 原生目录助手。", { path: resolved.path })
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
  confirmTitle.textContent = BcaI18n.t("删除本地归档（含封面与视频信息，不进回收站）？");
  confirmMessage.textContent = BcaI18n.t("将删除视频目录“{path}”（含封面与视频信息）。此操作不会更改 B 站账户中的收藏。", { path: `${video.collection}/${video.directory}` });
  confirmDeleteButton.textContent = BcaI18n.t("删除本地文件，不可恢复");
  deleteDownloadsOption.hidden = !video.hasDownloadFiles;
  deleteAssociatedDownloads.checked = false;
  openConfirmBackdrop();
}

function askToDeleteCollection(collection) {
  if (!collection) return;
  pendingDeleteAction = { type: "collection", collection };
  confirmTitle.textContent = BcaI18n.t("删除整个本地归档？");
  confirmMessage.textContent = BcaI18n.t("将永久删除本地归档“{name}”及其全部文件（当前识别到 {count} 个视频；目录里无法识别的文件、你自己放进去的东西也会一起删掉）。此操作只影响本地归档，不会更改 B 站账户中的收藏。", { name: collection.name, count: collection.videos.length });
  confirmDeleteButton.textContent = BcaI18n.t("删除收藏夹");
  deleteDownloadsOption.hidden = !collection.videos.some((video) => video.hasDownloadFiles);
  deleteAssociatedDownloads.checked = false;
  openConfirmBackdrop();
}

function askToDeleteBatch(videos) {
  if (!videos.length) return;
  pendingDeleteAction = { type: "batch", videos };
  confirmTitle.textContent = BcaI18n.t("删除选中的本地归档？");
  confirmMessage.textContent = BcaI18n.t("将永久删除选中的 {count} 个视频目录及其中的封面和视频信息。此操作只影响本地归档，不会更改 B 站账户中的收藏。", { count: videos.length });
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
  confirmTitle.textContent = BcaI18n.t("删除本地归档（含封面与视频信息，不进回收站）？");
  confirmDeleteButton.textContent = BcaI18n.t("删除本地文件，不可恢复");
}

/* 1.7.10（facet-destructive P2-1）：目标里已经有同名文件时**不许静默覆盖**。
   眼下两个调用方都保证目标是刚建出来的新目录（uniqueRecordFolderName 先探过不存在），
   所以这条路径今天走不到；但「复制进一个已经存在的目录」这一步之差，就足以让用户
   自己放进去的同名文件被无声抹掉。宁可少写一个文件、由调用方报出来，也不要悄悄盖掉。
   返回 { copied, skipped } —— skipped 里是「目标已存在、因此没动」的文件名。 */
async function copyDirectoryContents(source, target, result = { copied: 0, skipped: [] }) {
  for await (const [name, entry] of source.entries()) {
    if (entry.kind === "directory") {
      const childTarget = await target.getDirectoryHandle(name, { create: true });
      await copyDirectoryContents(entry, childTarget, result);
      continue;
    }
    // 不带 create 地探一次：找不到会抛 NotFoundError，说明目标里还没有这个名字
    let existing = null;
    try { existing = await target.getFileHandle(name); } catch (_) { existing = null; }
    if (existing) {
      result.skipped.push(name);
      continue;
    }
    const sourceFile = await entry.getFile();
    const targetFile = await target.getFileHandle(name, { create: true });
    const writable = await targetFile.createWritable();
    try {
      await writable.write(sourceFile);
      await writable.close();
      result.copied += 1;
    } catch (error) {
      try { await writable.abort(); } catch (_) {}
      throw error;
    }
  }
  return result;
}

async function updateSavedFolderName(directory, folderName) {
  const infoHandle = await directory.getFileHandle("视频信息.txt");
  const file = await infoHandle.getFile();
  const text = await file.text();
  // 这一行记录的是「这条视频属于哪个 B 站收藏夹」。字段名以前叫「保存文件夹：」，
  // 和用户选的根目录撞名（同一个词指两个完全不同的东西），V1.2.0 起写入方
  // （background.js 的 buildInfo）改成「所属收藏夹：」。
  // 下面的正则是**两种标签都认**、写回一律用新标签：老归档第一次改归属时顺手
  // 迁移掉，不需要单独的迁移脚本。（V1.7.0 之前这里只认旧标签，新文件匹配不到，
  // updated === text 直接 return —— 改了归属却什么都没发生，而且不报错。）
  // 两种标签都不在时（半截文件、或用户手工删过这一行）同样 updated === text → return：
  // 归属没改成，但也不会去重写一个我们没看懂的文件，宁可什么都不做。
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

/* 1.7.0（批次 B / P1）：复制完必须复核一遍，再允许调用方删源。
   copyDirectoryContents 是流式写，既不校验字节也不校验空间 —— 「写了一半就 close 成功」
   这类坏法（磁盘满、配额、被安全软件打断）它自己看不出来，而调用方在全部目标都复制完
   之后就会 removeMovedSource()：源目录没了、目标又是坏的，这条收藏是真没了。
   只比对「名字 + 字节数」，不算哈希（几 MB 的视频文件哈希太贵，字节数已经能拦住截断）。 */
async function diffCopiedDirectory(source, target, prefix = "") {
  const problems = [];
  for await (const [name, entry] of source.entries()) {
    if (entry.kind === "directory") {
      let child = null;
      try {
        child = await target.getDirectoryHandle(name);
      } catch (_) {
        problems.push(`${prefix}${name}/ 没复制过去`);
        continue;
      }
      problems.push(...await diffCopiedDirectory(entry, child, `${prefix}${name}/`));
      continue;
    }
    let sourceSize = -1;
    let targetSize = -1;
    try {
      sourceSize = (await entry.getFile()).size;
    } catch (_) {
      problems.push(`${prefix}${name} 读不出来`);
      continue;
    }
    try {
      targetSize = (await (await target.getFileHandle(name)).getFile()).size;
    } catch (_) {
      problems.push(`${prefix}${name} 没复制过去`);
      continue;
    }
    if (sourceSize !== targetSize) problems.push(`${prefix}${name}：源 ${sourceSize} 字节，目标 ${targetSize} 字节`);
  }
  return problems;
}

async function copyVideoRecord(video, targetName) {
  const sourceCollection = await rootHandle.getDirectoryHandle(video.collection);
  const sourceRecord = await sourceCollection.getDirectoryHandle(video.directory);
  const targetCollection = await rootHandle.getDirectoryHandle(targetName);
  const targetRecordName = await uniqueRecordFolderName(targetCollection, video.directory);
  let targetRecord;
  try {
    targetRecord = await targetCollection.getDirectoryHandle(targetRecordName, { create: true });
  } catch (error) {
    const explained = BcaArchiveCore.describeDirectoryCreateError(error, targetRecordName);
    if (explained) throw new Error(explained);
    throw error;
  }
  try {
    const copyResult = await copyDirectoryContents(sourceRecord, targetRecord);
    // 1.7.10（P2-1）：目标里本来就有同名文件时复制会跳过它们 —— 这绝不能算复制成功
    if (copyResult.skipped.length) {
      throw new Error(`目标目录里已经有同名文件，没有覆盖：${copyResult.skipped.slice(0, 3).join("、")}`);
    }
    // 复核要在 updateSavedFolderName 之前做：那一步会改写目标里的 视频信息.txt（改「所属收藏夹」
    // 那一行），字节数本来就和源不同
    const problems = await diffCopiedDirectory(sourceRecord, targetRecord);
    if (problems.length) throw new Error(`复制校验没通过：${problems.slice(0, 3).join("；")}`);
    if (targetRecordName !== video.directory) await updateSavedFolderName(targetRecord, targetRecordName);
  } catch (error) {
    // 1.7.16：这里的回滚**故意保留**（和 background.js 的 discardFailedRecord 不同）：
    // 这是「复制 / 搬运」刚建出来的目标目录，留下的半份副本会被扫描当成一条记录，
    // 而源目录还在、重试一次就能拿到完整副本，所以半份副本没有任何保留价值。
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
  /* 1.7.11（facet-security P2-3）：这条链路以前不查保留目录名 —— B 站收藏夹真叫
     「001错误报告」时，下载好的视频会被放进插件的错误报告目录里。名单的唯一一份在
     archive-core.js（background.js 那两条链路也用它，SW 里另有一份逐字相同的副本）。 */
  if (BcaArchiveCore.isReservedCollectionName(collectionName)) {
    throw new Error(BcaI18n.t("收藏夹名「{name}」和插件自己用的目录重名，为免写乱本地文件，这次没有保存到本地。", { name: collectionName }));
  }
  // 1.7.24（§3.2）：两段共用一个预算 —— 收藏夹名长的时候，视频目录段自动收窄。
  const directoryName = BcaArchiveCore.videoDirectoryLabel(video, 0, { collectionName });
  // 路径太长时 create:true 抛的是 NotFoundError，跟「父目录没了」同名。
  // describeDirectoryCreateError 把这两种可能讲清楚，并给出「把根目录挪浅」的下一步。
  let collectionHandle;
  let directoryHandle;
  try {
    collectionHandle = await parent.getDirectoryHandle(collectionName, { create: true });
    directoryHandle = await collectionHandle.getDirectoryHandle(directoryName, { create: true });
  } catch (error) {
    const explained = BcaArchiveCore.describeDirectoryCreateError(error, collectionName + "\\" + directoryName);
    if (explained) throw new Error(explained);
    throw error;
  }
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
    BcaArchiveCore.videoDirectoryLabel(video, 0, { collectionName: BcaArchiveCore.safeName(video.collection || "未分类收藏", "未分类收藏", BcaArchiveCore.COLLECTION_NAME_MAX_CHARS) })
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

   没装本地目录打开助手时，绝对路径没有别的来源。用户在 1.3.0 之前的下载页
   填过一次的值仍然保留在这里，读出来拼路径，复制到的就是能直接粘进资源管理器的完整路径。

   1.7.11（facet-privacy P2-2）：这串路径里带 Windows 用户名（`C:\Users\<真名>\...`），
   明文躺在 chrome.storage.local 里，同机任何程序、任何拿到浏览器 profile 的人都能读到。
   下载页 1.3.0 就删了，现在只有 1.3.0 之前留下的老值可能还在 —— 所以这里做一次
   **单向迁移**：读到就把它从 storage 里删掉，只在本次会话的内存里留着用。 */

let downloadRootPathMemory = "";

async function readDownloadRootPath() {
  if (downloadRootPathMemory) return downloadRootPathMemory;
  try {
    const saved = await chrome.storage.local.get("downloadRootPath");
    const value = String(saved?.downloadRootPath || "").trim().replace(/[\\/]+$/, "");
    if (!value) return "";
    downloadRootPathMemory = value;
    // 老值用一次就从磁盘上抹掉，不给它继续明文常驻的机会
    try { await chrome.storage.local.remove("downloadRootPath"); } catch (_) {}
    return value;
  } catch (error) {
    // 读不到就按「没设置过」处理（走默认目录）；这条老值可能还留在 storage 里没抹掉。
    console.warn("读下载根目录失败（按没设置处理）", error);
    return "";
  }
}

async function getWritableDownloadParent({ create = false } = {}) {
  const mode = await readSavedSetting("downloadFolderMode");
  const savedCustom = await readSavedSetting("downloadFolder");
  const isCustom = mode === "custom" || (!mode && Boolean(savedCustom));
  let parent;
  if (isCustom) {
    if (!savedCustom) throw new Error(BcaI18n.t("自选下载目录设置已丢失，请安装 Windows 原生目录助手后重试。"));
    parent = savedCustom;
  } else {
    // 4.9.4：默认下载目录只在真正下载时才被创建，从没下载过的用户根本没有它 ——
    // 「标记为已下载」会因此失败，而报错说的却是"请先选择保存位置"（指错方向）。
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

/* 1.8.7（P2-10）：搬运下载目录是「先复制、校验字节数、再删源」，复制本身是流式写；
   空间不够时 write() 会写到一半才抛错，磁盘上留下半份副本。这里先用
   navigator.storage.estimate() 兜一道，并把「还差多少」直接写进错误文案；
   拿不到 estimate（老浏览器）就不拦 —— 宁可让它照旧走校验那条路。 */
async function ensureCopySpace(bytes, label) {
  const need = Number(bytes) || 0;
  if (!need) return;
  let estimate = null;
  try { estimate = await navigator.storage.estimate(); }
  catch (error) { console.warn("问不到浏览器可用空间（这一次跳过搬运前的空间检查）", error); return; }
  const quota = Number(estimate?.quota) || 0;
  const usage = Number(estimate?.usage) || 0;
  if (!quota) return;
  const available = quota - usage;
  if (available >= need) return;
  throw new Error(`搬运「${label}」需要至少 ${formatBytes(need)}，浏览器报告还能写 ${formatBytes(Math.max(0, available))}，还差 ${formatBytes(need - available)}。先清理一些空间再试。`);
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
      // 1.8.7（P2-10）：复制之前先确认空间够（不够就明确说缺多少，而不是写到一半失败）
      await ensureCopySpace(await directorySize(source.directory), source.directory.name);
      const targetNameOnDisk = await uniqueRecordFolderName(targetCollection, source.directory.name);
      const targetDirectory = await targetCollection.getDirectoryHandle(targetNameOnDisk, { create: true });
      try {
        const copyResult = await copyDirectoryContents(source.directory, targetDirectory);
        // 1.7.10（P2-1）：跳过任何文件都说明「本来就有同名文件」，不能算搬运成功
        if (copyResult.skipped.length) {
          throw new Error(`目标目录里已经有同名文件，没有覆盖：${copyResult.skipped.slice(0, 3).join("、")}`);
        }
        /* 1.7.18（destructive P1-4）：**这一步以前只对归档记录目录做，下载目录没做**。
           copyDirectoryContents 是流式写，既不校验字节也不读回 —— 磁盘满、配额、被安全软件
           或同步盘打断时 write() 照样正常 resolve，于是「复制成功」，而调用方在全部目标复制完
           之后就会把源目录删掉（moveVideoRecordToTargets 里那一轮 removeEntry）。
           下载目录里装的常常是用户自己下载的视频文件，源一删就没有第二份了。
           这里逐文件比字节数（只读元数据，很便宜），不通过就抛错 —— 调用方会删掉刚建的目标目录、
           保留源目录，宁可搬运失败也不能拿坏副本换掉好原件。 */
        const problems = await diffCopiedDirectory(source.directory, targetDirectory);
        if (problems.length) throw new Error(`下载文件复制校验没通过：${problems.slice(0, 3).join("；")}`);
      }
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
  if (matches.length) invalidateDownloadIndex(rootHandle); // 1.8.4：下载索引缓存跟着作废
  return failures;
}

/* 1.4.2（P1-1）：删收藏夹时勾了「同时删除关联的本地下载文件」，原来是无条件
   removeEntry(收藏夹名, { recursive: true }) 删掉 000视频下载/<收藏夹名>。
   那是用户自己的磁盘，而 File System Access 的 removeEntry 不进系统回收站 ——
   万一这个目录里装的是用户自己整理的东西（不是本插件写的那种「标题 - BV号」目录），
   一点下去就永久没了。所以先认一遍里面装的是什么，认不出来就整个不删，把原因报出去：
     · 每一项都得是以 " - BV号" / " - av号" 结尾的子目录（archive-core.js 的命名约定，
       插件写记录、写下载目录、建「请将视频放到这里.txt」都用它）；
     · 出现别的命名、或者直接把文件散在目录里 → 不删，交给用户自己决定。
   空目录按「可删」处理：删掉不损失任何东西。 */
async function collectionDownloadDirectoryLooksManaged(handle) {
  for await (const entry of handle.values()) {
    if (entry.kind !== "directory") return false;
    if (!BcaArchiveCore.identifiersFromDirectoryName(entry.name).size) return false;
  }
  return true;
}

async function removeCollectionDownloadDirectory(downloadParent, collectionName) {
  if (!downloadParent) return [];
  let handle = null;
  try { handle = await downloadParent.getDirectoryHandle(collectionName); }
  catch (error) {
    if (error?.name === "NotFoundError") return [];
    return [`${collectionName}：${error.message}`];
  }
  if (!await collectionDownloadDirectoryLooksManaged(handle)) {
    return [`${collectionName}：目录里有不是本插件写入的内容，为了安全没有删除。`];
  }
  try { await downloadParent.removeEntry(collectionName, { recursive: true }); invalidateDownloadIndex(rootHandle); return []; }
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
    if (downloadTransfer.created.length) invalidateDownloadIndex(rootHandle); // 1.8.4：新下载目录得能被扫到
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
    if (downloadTransfer.sources.length) invalidateDownloadIndex(rootHandle); // 1.8.4：源目录已删，索引要重算
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

/* 同一支视频可能同时躺在好几个收藏夹里 —— 每个收藏夹目录下各有一份归档，BV 号相同。
   V1.2.0 之前这个对话框只勾「你点进来的那个」，用户在别处也存了一份时完全看不出来：
   他看到的界面在说「这支视频只在这一个收藏夹里」。现在把「已经收录这些视频的
   收藏夹」全部标出来，加一枚「已收录」徽标。

   注意徽标只是**说明**，不参与搬运：勾选在这个对话框里的含义是「目标」，
   而真正执行搬运的 moveVideoRecordToTargets 只在 video.collection 不在目标里时
   移走那一个副本，别处的副本它不负责。所以「已收录」的收藏夹不会被默认勾上 ——
   勾了没有效果，却会让用户以为取消勾选能从那里删掉。

   判据是「被选的视频全部都在这一个收藏夹里」。单条视频时它退化成
   「这个收藏夹里有这支视频」，正好是要的效果；批量选 80 条时则自动只在真正重复的
   收藏夹上出现 —— 否则每个收藏夹都至少命中一条，满屏「已收录」等于没有信息。

   没有 BV/av 号的档案（标识键为空）没法和别的目录比对，不参与判断：
   宁可漏标，也不能把不相干的收藏夹标成「已收录」。 */
function collectionsHoldingEveryVideo(videos) {
  const wanted = videos.map((video) => videoIdentifierKeys(video)).filter((keys) => keys.size);
  const held = new Set();
  if (!wanted.length) return held;
  for (const collection of collections) {
    const present = collection.videos.map((video) => videoIdentifierKeys(video));
    if (wanted.every((keys) => present.some((other) => identifiersOverlap(keys, other)))) held.add(collection.name);
  }
  return held;
}

function openCollectionActionDialog(videos, source) {
  if (!rootHandle || !videos.length) return;
  pendingCollectionAction = { videos, source };
  collectionActionTitle.textContent = videos.length === 1 ? BcaI18n.t("移动或复制视频") : BcaI18n.t("移动或复制 {count} 个视频", { count: videos.length });
  collectionActionList.replaceChildren();
  const sourceCollections = new Set(videos.map((video) => video.collection));
  const holdingCollections = collectionsHoldingEveryVideo(videos);
  // 除「点进来的那个」之外，还有几个收藏夹也已经有这份归档 —— 摘要里报个数，
  // 免得用户只盯着列表里的勾，没意识到这支视频在别处还有副本。
  const otherHoldingCount = [...holdingCollections].filter((name) => !sourceCollections.has(name)).length;
  collectionActionSummary.textContent = videos.length === 1
    ? (otherHoldingCount
      ? BcaI18n.t("“{title}”当前位于“{collection}”，另有 {count} 个收藏夹也已收录。", { title: videos[0].title, collection: videos[0].collection, count: otherHoldingCount })
      : BcaI18n.t("“{title}”当前位于“{collection}”。", { title: videos[0].title, collection: videos[0].collection }))
    : BcaI18n.t("为所选的 {count} 个视频选择目标收藏夹。每个视频都会按其原收藏夹分别判断移动或复制。", { count: videos.length });
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
    //
    // 标了「已收录」的其他收藏夹**故意不勾**。勾选在这个对话框里是「目标」的意思，
    // 不是「这里有一份」的意思：而 moveVideoRecordToTargets 只会在
    // video.collection 不在目标里时才移走那一个副本，别处的副本它根本不碰。
    // 把它们默认勾上既不会产生任何效果，又会让用户以为「取消勾选 = 从那里删掉」——
    // 点了没反应却看起来像干了什么，比不显示更糟。它们由徽标负责说明。
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
    } else if (holdingCollections.has(collection.name)) {
      // 不是这支视频的「原收藏夹」，但本地这里也已经有一份 —— 纯提示。
      // 这次操作不会碰它：moveVideoRecordToTargets 只在 video.collection
      // 不在目标里时移走那一个副本，别处的副本它不负责。要清理别处的副本，
      // 得先切到那个收藏夹再操作一次。
      const heldBadge = document.createElement("small");
      heldBadge.className = "collection-source-badge collection-held-badge";
      heldBadge.textContent = BcaI18n.t("已收录");
      name.append(heldBadge);
    }
    const count = document.createElement("small");
    count.className = "collection-action-video-count";
    count.textContent = BcaI18n.t("{count} 个视频", { count: formatCountText(collection.videos.length) });
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
  setArchiveWriteLock("library");
  confirmCollectionActionButton.disabled = true;
  confirmCollectionActionButton.textContent = BcaI18n.t("正在整理…");
  // 1.7.21：跑批期间这个按钮不再禁用 —— 它变成「中止整理」。
  collectionActionAbort = false;
  cancelCollectionActionButton.disabled = false;
  cancelCollectionActionButton.textContent = BcaI18n.t("中止整理");
  showCollectionActionProgress(BcaI18n.t("准备开始…"), true);
  selectAllActionTargetsButton.disabled = true;
  clearActionTargetsButton.disabled = true;
  collectionActionList.querySelectorAll("input").forEach((input) => { input.disabled = true; });
  try {
    const permissionRequest = rootHandle.requestPermission({ mode: "readwrite" });
    if (await permissionRequest !== "granted") throw new Error(BcaI18n.t("没有获得本地目录写入权限。"));
    // 1.7.10（facet-destructive P2-5）：搬运/复制是归档侧最重的写操作（复制整目录再删源），
    // 后台导入正在跑时先不动 —— 导入会把这一批目录的名字和统计写回 003database。
    if (await archiveWriteLockedByImport()) {
      throw new Error(BcaI18n.t("后台正在导入收藏夹，等它跑完再搬 —— 两边同时写同一批目录会留下对不上的记录。"));
    }
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
    let handled = 0;
    for (const video of action.videos) {
      if (collectionActionAbort) break;
      showCollectionActionProgress(BcaI18n.t("正在处理 {done}/{total}：{name}", {
        done: handled + 1, total: action.videos.length, name: video.title
      }));
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
      handled += 1;
    }
    const skippedCount = action.videos.length - handled;
    hideCollectionActionProgress();
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
    // 1.7.18（destructive P1-4）：原来只报个数，用户拿不到是哪个目录，也没法自己去删
    if (downloadCleanupWarnings.length) {
      messages.push(BcaI18n.t("下载文件已复制，但有 {count} 个旧目录未能清理：{first}", { count: downloadCleanupWarnings.length, first: downloadCleanupWarnings[0] }));
    }
    if (failures.length) messages.push(BcaI18n.t("{count} 个失败，仍保留选中：{first}", { count: failures.length, first: failures[0] }));
    if (skippedCount) messages.push(BcaI18n.t("已中止，剩下 {count} 个没有处理", { count: skippedCount }));
    const summary = messages.join("；") || BcaI18n.t("没有需要整理的视频。原视频已保留。");
    const resultTitle = skippedCount
      ? BcaI18n.t("移动或复制已中止")
      : failures.length ? BcaI18n.t("移动或复制部分完成") : BcaI18n.t("移动或复制完成");
    showResultDialog(resultTitle, summary, failures.length ? "error" : "ok");
  } catch (error) {
    showResultDialog(BcaI18n.t("整理失败"), error?.message || BcaI18n.t("本地文件操作失败。"), "error");
  } finally {
    clearArchiveWriteLock("library");
    confirmCollectionActionButton.dataset.busy = "false";
    confirmCollectionActionButton.textContent = BcaI18n.t("确认");
    hideCollectionActionProgress();
    collectionActionAbort = false;
    cancelCollectionActionButton.disabled = false;
    cancelCollectionActionButton.textContent = BcaI18n.t("取消");
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
  publishLibraryWriteLock();
  cancelDeleteButton.disabled = true;
  confirmDeleteButton.disabled = true;
  confirmDeleteButton.textContent = action.type === "collection" ? BcaI18n.t("正在删除收藏夹…") : action.type === "batch" ? BcaI18n.t("正在批量删除…") : BcaI18n.t("正在删除…");
  try {
    const permissionRequest = rootHandle.requestPermission({ mode: "readwrite" });
    if (await permissionRequest !== "granted") throw new Error(BcaI18n.t("没有获得本地目录写入权限。"));
    // 1.7.10（facet-destructive P2-5）：后台正在导入时先别删 —— 导入那边会把这一批目录的
    // 统计写回 003database，删一半的目录名会被它照着写入，留下指向已删目录的幽灵行。
    if (await archiveWriteLockedByImport()) {
      throw new Error(BcaI18n.t("后台正在导入收藏夹，等它跑完再删 —— 两边同时写同一批目录会留下对不上的记录。"));
    }
    const deleteDownloads = deleteAssociatedDownloads.checked;
    const downloadParent = deleteDownloads ? await getWritableDownloadParent() : null;
    /* 1.7.10（facet-destructive P2-3）：不带 create 地调 getWritableDownloadParent 时，
       000视频下载 不存在会返回 null（不是抛错）。原来这一支就是「什么都不做、也什么都
       不说」—— 用户明明勾了「同时删除关联下载」，下载文件一个都没动，结果对话框里没有
       任何交代。下载根目录被改名/移走、或改用自选目录后旧目录留在别处时都会走到这里。
       这不是「确实没有下载文件」，是「这次没法确认」，必须说出来。 */
    const downloadCleanupFailures = [];
    // 1.7.10（facet-destructive P2-3）：「这次没法确认」和「确实没有」要分开说。
    // 1.7.15：这两个数组必须**先声明、再 push**。1.7.10 原先把声明放在下面几行，
    // 于是「勾了同时删除关联下载、但 000视频下载 不在」这条分支一进去就撞 TDZ：
    // ReferenceError: Cannot access 'downloadCleanupNotes' before initialization。
    // 它被下面的 catch 接住，用户看到「删除失败」——而文件其实已经删掉了（更吓人）。
    const downloadCleanupNotes = [];
    if (deleteDownloads && !downloadParent) {
      downloadCleanupNotes.push(BcaI18n.t("没找到下载文件夹（000视频下载），关联的下载文件这次一个都没动。"));
    }
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
      showResultDialog(BcaI18n.t("已删除整个本地归档"), [BcaI18n.t("“{name}”", { name: action.collection.name }), ...downloadCleanupFailures, downloadCleanupSuffix(downloadCleanupFailures.length), ...downloadCleanupNotes, refreshFailureSuffix(refreshError)].filter(Boolean).join("；"), "ok");
    } else if (action.type === "batch") {
      if (!batchResult.failures.length) setSelectionMode(false);
      // 1.7.0（批次 B / P1）：原来失败清单只把**第一条**塞进 3 秒就消失的 toast，
      // 用户拿不到「哪些没删掉、为什么」，下载目录的失败更是只剩一个数字。
      // 现在只要有任何一条失败就改用结果弹窗逐条列出来；全成功才继续用 toast。
      const lines = [];
      if (batchResult.failures.length) {
        lines.push(BcaI18n.t("已删除 {deleted} 个，{failed} 个失败并保留选中。", { deleted: batchResult.deleted, failed: batchResult.failures.length }));
        lines.push(...batchResult.failures);
      } else {
        lines.push(BcaI18n.t("已删除 {count} 个本地视频", { count: batchResult.deleted }));
      }
      if (downloadCleanupFailures.length) {
        lines.push(BcaI18n.t("；{count} 个下载目录未能删除", { count: downloadCleanupFailures.length }));
        lines.push(...downloadCleanupFailures);
      }
      lines.push(...downloadCleanupNotes);
      const suffix = refreshFailureSuffix(refreshError);
      if (batchResult.failures.length || downloadCleanupFailures.length || downloadCleanupNotes.length) {
        showResultDialog(BcaI18n.t("批量删除结果"), lines.join("；") + suffix, batchResult.failures.length ? "error" : "ok");
      } else {
        showToast(lines.join("；") + suffix);
      }
    } else {
      showResultDialog(BcaI18n.t("已删除本地归档"), [BcaI18n.t("本地归档文件已删除。"), ...downloadCleanupFailures, downloadCleanupSuffix(downloadCleanupFailures.length), ...downloadCleanupNotes, refreshFailureSuffix(refreshError)].filter(Boolean).join("；"), "ok");
    }
  } catch (error) {
    showResultDialog(BcaI18n.t("删除失败"), error?.message || BcaI18n.t("本地文件操作失败。"), "error");
  } finally {
    deleteInProgress = false;
    publishLibraryWriteLock();
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
  if (["错误报告", "001错误报告", "002同步报告", "000视频下载", "视频下载", "003database", "004导出"].includes(name)) throw new Error(BcaI18n.t("这是插件保留目录，请换一个名称。"));
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
  publishLibraryWriteLock();
  submitCreateCollectionButton.disabled = true;
  cancelCreateCollectionButton.disabled = true;
  submitCreateCollectionButton.textContent = BcaI18n.t("正在创建…");
  try {
    const permissionRequest = rootHandle.requestPermission({ mode: "readwrite" });
    if (await permissionRequest !== "granted") throw new Error(BcaI18n.t("没有获得本地目录写入权限。"));
    // 1.7.10（facet-destructive P2-5）：后台导入正在跑时不新建目录/搬运 ——
    // 导入那边也在建收藏夹目录、也在数目录，两边同时动会互相覆盖对方的判断。
    if (await archiveWriteLockedByImport()) {
      throw new Error(BcaI18n.t("后台正在导入收藏夹，等它跑完再改 —— 两边同时写同一批目录会留下对不上的记录。"));
    }
    try {
      await rootHandle.getDirectoryHandle(name);
      throw new Error(BcaI18n.t("收藏夹“{name}”已存在。", { name }));
    } catch (error) {
      if (error?.name !== "NotFoundError") throw error;
    }
    await rootHandle.getDirectoryHandle(name, { create: true });
    collectionDialog.close();
    collectionForm.reset();
    await displayRoot(rootHandle, name, BcaI18n.t("已读取"), { allowDuringWrite: true });
    showToast(BcaI18n.t("已新建收藏夹“{name}”", { name }));
  } catch (error) {
    showToast(BcaI18n.t("创建失败：{message}", { message: error?.message || BcaI18n.t("本地文件夹操作失败。") }));
  } finally {
    collectionCreateInProgress = false;
    publishLibraryWriteLock();
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
  publishLibraryWriteLock();
  submitAddVideoButton.disabled = true;
  cancelAddVideoButton.disabled = true;
  submitAddVideoButton.textContent = BcaI18n.t("正在解析并保存…");
  try {
    const permissionRequest = rootHandle.requestPermission({ mode: "readwrite" });
    if (await permissionRequest !== "granted") throw new Error(BcaI18n.t("没有获得本地目录写入权限。"));
    // 1.7.10（facet-destructive P2-5）：后台导入正在跑时不再往归档里加新目录 ——
    // 这条链路会经后台建目录写文件，与导入是两条独立队列，同时动会互相覆盖判断。
    if (await archiveWriteLockedByImport()) {
      throw new Error(BcaI18n.t("后台正在导入收藏夹，等它跑完再加 —— 两边同时写同一批目录会留下对不上的记录。"));
    }
    const result = await chrome.runtime.sendMessage({
      type: "add-manual-video",
      data: { identifier, collections: collectionNames }
    });
    if (!result?.ok) throw new Error(result?.message || BcaI18n.t("B 站视频解析或本地保存失败。"));
    videoDialog.close();
    videoForm.reset();
    const collectionToSelect = collectionNames.includes(selectedCollection) ? selectedCollection : collectionNames[0];
    await displayRoot(rootHandle, collectionToSelect, BcaI18n.t("已读取"), { allowDuringWrite: true });
    showToast(result.message ? BcaI18n.t(result.message) : BcaI18n.t("视频已添加到本地归档"));
  } catch (error) {
    showToast(BcaI18n.t("添加失败：{message}", { message: error?.message || BcaI18n.t("无法解析或保存视频。") }));
  } finally {
    videoAddInProgress = false;
    publishLibraryWriteLock();
    submitAddVideoButton.disabled = false;
    cancelAddVideoButton.disabled = false;
    submitAddVideoButton.textContent = BcaI18n.t("解析并保存");
  }
});

collectionDialog.addEventListener("cancel", (event) => { if (collectionCreateInProgress) event.preventDefault(); });
videoDialog.addEventListener("cancel", (event) => { if (videoAddInProgress) event.preventDefault(); });

/* 1.5.9（P1-10）：把一份文件内容原子地换上去 —— 先写临时文件，再改名顶上。
   起因是 003database/database.json 原来是 createWritable() 就地截断写：写到一半
   页面被关掉、扩展被重载、磁盘满，留下的就是半截 JSON。

   顺序有讲究：
     · 先整份写进临时文件并 close()，此刻**正式文件还是完整的旧内容**，读侧看到的
       只有「旧」和「新」两种状态；
     · 再 removeEntry(正式名) + move(临时名 → 正式名)（同一目录内的 rename）。
       这两步之间有一个正式文件短暂不存在的窗口，但那是「没有」而不是「半截」——
       读侧两个调用点（这里与 background.js 的 readStatsDatabase）对「文件不在了」
       的处理是超集重建，不会像坏 JSON 那样静默丢历史。
     · 这一次写入的临时名带时间戳，两次写入撞在一起时各写各的，不会互相截断。
       （同一目录的并发写者仍然会互相覆盖正式文件 —— 这一层不变量管不了，见测试。）

   move() 在部分 Chromium 上还没有（文件名里的 `*` 也让它过不了仓库里
   stripComments 那类静态扫描，所以这里连注释都不写它的原始形式），
   拿去 try 一下：不可用就退回「把临时文件内容写进正式文件再删掉临时文件」。
   退路版本完成不了原子性（copy 本身仍要就地写一次），但至少临时文件里还留着
   一份完整内容可供人工恢复，比原来的半截 JSON 强。 */
// 1.7.16：最近一次「换名覆盖」失败的签名，只用于诊断（与 background.js 同款）。
let lastRenameFailureNote = "";
function renameFailureNote(error) {
  const name = error?.name || "未知错误";
  const message = BcaArchiveCore.sliceCodePoints(String(error?.message || ""), 200);
  lastRenameFailureNote = `${name}：${message}`;
  return lastRenameFailureNote;
}

// 1.8.0：写「临时文件 + 换名」这条路被中途杀掉时，换名没机会跑，
// `.<名字>.<时间戳>.tmp` 就永远躺在 003database 里（真机留过两个）。
// 每次写入前扫一遍同目录，只删「形状像临时文件 + 超过 10 分钟没动过」的；
// 形状/年龄的规则只在 archive-core.js 一处，这里只负责遍历目录。
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

async function writeFileAtomically(directory, file, text) {
  // 1.8.0：先把同目录里的陈年临时文件清掉，免得数据库目录越用越脏
  await removeStaleTempFiles(directory);
  // 1.8.2：目标还是空的（刚建出来 / 0 字节）就没有「旧内容被截断」的风险，直接就地写。
  // 走临时文件 + 换名在这台机器的 Chrome 155 上一次要多花 7 秒左右（background.js 的
  // writeFile 里量过同一套数字：就地 0.06 秒 / 换名 7.1 秒），所以只对已有内容的文件用原子路径。
  let hasContent = false;
  try {
    hasContent = (await file.getFile()).size > 0;
  } catch (_) {
    hasContent = true; // 读不出大小就别赌，按「已有内容」保守走原子路径
  }
  if (!hasContent) {
    await writeFileInPlace(file, text);
    return;
  }
  const tempName = `.${file.name}.${Date.now().toString(36)}.tmp`;
  const temp = await directory.getFileHandle(tempName, { create: true });
  // 1.7.0（批次 B）：临时文件写成功之后，它就是**唯一完整副本** —— 后面任何一步失败
  // 都不能再把它删掉（老代码在 catch 里无条件 removeEntry(tempName)，就地写失败时
  // 正式文件已经被截断、临时文件是最后一份完整数据，却正好被删掉）。
  let tempReady = false;
  let renameNote = "";
  try {
    const writable = await temp.createWritable();
    await writable.write(text);
    await writable.close();
    tempReady = true;
    if (typeof temp.move === "function") {
      // 1.6.1 修：绝不先删原文件再换名。
      // 原写法是 removeEntry(file.name) → temp.move(file)，而 move() 要的是
      // 「目标目录 + 新文件名」，传一个文件句柄会抛；一旦抛出，原文件已经删掉了、
      // 临时文件又被 catch 清掉，数据库就凭空消失 —— 下一次扫描读不到 previous，
      // 陪伴天数与累计保存数一起归零（用户报的「删掉几个视频后统计回到初始状态」
      // 就是这条）。现在先按规范换名覆盖，失败才退回就地写；任何一步失败原文件都还在。
      try {
        await temp.move(directory, file.name);
        lastRenameFailureNote = "";
        return;
      } catch (moveError) {
        // 1.7.1：换名失败一律退回就地写（与 1.7.0 之前一致）。1.7.0 曾按「不支持 / 其它失败」
        // 分流、把其它失败原样抛出 —— 那会把「原本能写成功的一次写入」变成硬失败（数据库停更、
        // 归档记录被调用方删掉）。现在临时文件在就地写失败时会被保留并写进弹窗状态，
        // 所以「退回就地写」不再等于静默丢数据。
        renameNote = renameFailureNote(moveError);
        console.warn("换名失败，退回就地写。", moveError);
      }
    }
    await writeFileInPlace(file, text);
  } catch (error) {
    // 1.7.14（facet-compat C4）：写不进去的原因翻成人话再往下传，
    // 免得弹窗和日志里只有一句英文异常名。
    const friendly = BcaArchiveCore.describeFileSystemError(error);
    if (friendly) error = new Error(friendly);
    if (!tempReady) {
      // 临时文件自己就没写成功：里面是半截内容，留着只会让人误以为能恢复
      await directory.removeEntry(tempName).catch(() => {});
    } else {
      console.warn(`写入 ${file.name} 失败，临时文件 ${tempName} 里留着一份完整内容，已保留。`, error);
      chrome.storage.local.set({
        lastResult: {
          message: `写入 ${file.name} 失败，已保留临时文件 ${tempName}（里面是完整内容，可手动恢复）。换名失败的原因：${renameNote || "未知"}`,
          createdAt: Date.now()
        }
      }).catch(() => {});
    }
    throw error;
  }
  await directory.removeEntry(tempName).catch(() => {});
}

// 退路专用：move() 不可用时的就地写。临时文件已经写完了，内容就在手上。
// 1.7.14（facet-compat C4）：只读目录 / 磁盘满 / 授权被撤销分别是
// NoModificationAllowedError / QuotaExceededError / NotAllowedError，
// 统一翻成人话再抛（分类表的权威出处是 archive-core.js）。
async function writeFileInPlace(file, text) {
  let writable;
  try {
    writable = await file.createWritable();
    await writable.write(text);
    await writable.close();
  } catch (error) {
    try { await writable?.abort(); } catch (_) {}
    const friendly = BcaArchiveCore.describeFileSystemError(error);
    if (friendly) throw new Error(friendly);
    throw error;
  }
}

/* 1.5.0：把这次扫描的结果同步进本地数据库（003database/database.json）。
   一次完整扫描就是一次权威重建 —— 扫描看得到的才算数（用户删掉的视频不该继续
   留在统计里），所以整份重写，只把旧库的 createdAt 与宠物状态带过来
   （见 stats-core.js 的 databaseFromVideos）。导入时后台写进去的那几行也在归档里，
   扫描一样看得见，两条路径不会互相打架。
   数据库是派生视图，写不进去（只读权限、磁盘满）不影响收藏库本身。

   1.5.9（P1-9）：空库也要写一次。原来 `if (!videos.length) return;` 直接跳过 ——
   用户在收藏库里把视频全删了，数据库却停在上次的非零值，统计页与宠物挂件继续报
   已经删掉的视频数（只能删掉数据库文件才恢复）。「一次完整扫描就是一次权威重建」
   本来就包含「扫到 0 条」这个结果。保留 createdAt 与宠物状态仍由
   stats-core.js 的 databaseFromVideos(videos, { previous }) 负责，空 videos 一样适用，
   所以清空收藏不会把「陪伴了几天」和亲密度归零。

   1.5.9（P1-10）：改名之前整份 JSON 先落在临时文件里，最后一步用 rename 顶上
   （见 writeFileAtomically）。原来的 createWritable→write→close 是截断式就地写，
   写一半被关掉页面/断电就留下半截 JSON；而读侧（这里和 background.js 的
   readStatsDatabase）遇到坏 JSON 是静默重建，等于把历史统计与亲密度清零还不告诉用户。 */

/* 1.7.7（P0-1）：本页发布 bcaStats 的「实质指纹」——只看会真正改变列表/图表内容的字段，
   **不算 updatedAt**（它每次写入都不同，正是那个自我维持环路唯一的燃料）。
   syncStatsDatabase 写之前比它，onChanged 里收到自己的回声也比它。 */
let publishedStatsFingerprint = "";
function publishedStatsFingerprintOf(stats) {
  if (!stats) return "";
  try {
    return JSON.stringify([
      stats.videos,
      stats.days,
      stats.totals,
      stats.firstSeen,
      Array.isArray(stats.collections)
        ? stats.collections.map((item) => `${item?.name}:${item?.count}`).join("|")
        : stats.collections,
      Array.isArray(stats.daily) ? stats.daily.length : 0,
      Array.isArray(stats.dailyRows) ? stats.dailyRows.length : 0,
      stats.topCollection && stats.topCollection.name
    ]);
  } catch (_) { return ""; }
}

/* 1.7.10（facet-storage P2-3）：扫描结果比旧库少到这个比例以下，就认作「这次没扫全」
   而不是「用户删了这么多」。0.7 是经验值：真删视频一般是一条条删，很少一次掉三成；
   而一次收藏夹读失败、一次被取消的扫描，掉的一定远超三成。 */
const STATS_SHRINK_KEEP_RATIO = 0.7;

// 坏库留档用的本地时间戳（与 background.js 的 statsBackupTimestamp 同一个格式）
function statsBackupStamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

async function syncStatsDatabase(handle, options = {}) {
  const core = globalThis.BcaStatsCore;
  if (!handle || !core) return;
  const videos = allVideos();
  try {
    const directory = await handle.getDirectoryHandle(core.DATABASE_FOLDER_NAME, { create: true });
    const file = await directory.getFileHandle(core.DATABASE_FILE_NAME, { create: true });
    let previous = null;
    /* 1.7.10（facet-storage P2-3）：旧库解析失败必须与「旧库不存在」分开。
       下面两道闸门（0 条 / 明显变少）全都基于 previous，previous 为 null 时它们是
       失效的 —— 也就是说，一次 JSON 解析失败就足够把历史统计与亲密度清零，而用户
       只会看到统计页数字变小。坏文件的现场还要先留下来，否则「为什么清零」永远查不出。 */
    let previousBroken = false;
    let previousBytes = 0;
    try {
      const blob = await file.getFile();
      previousBytes = blob.size || 0;
      const text = await blob.text();
      if (text.trim()) previous = JSON.parse(text);
    } catch (_) { previousBroken = true; }
    if (previousBroken && previousBytes > 0) {
      try {
        const brokenText = await (await file.getFile()).text();
        const backup = await directory.getFileHandle(`database.bad.${statsBackupStamp()}.json`, { create: true });
        const writable = await backup.createWritable();
        await writable.write(brokenText);
        await writable.close();
        console.warn("旧数据库解析失败，已另存为 database.bad.<时间戳>.json，下面整份重建。");
      } catch (error) {
        // 连现场都留不下来：宁可不写，也不能把唯一一份证据抹掉
        console.warn("旧数据库解析失败且无法另存现场，跳过本次同步。", error);
        showToast(BcaI18n.t("本地数据库读不出来，这次先不动它，免得把唯一的现场覆盖掉。"));
        return;
      }
    }
    // 1.6.1：扫描到 0 条时不许用空结果覆盖已经有内容的库。
    // 删掉几个视频之后的那次重扫曾经拿空列表整份重建，把陪伴天数与累计保存数一起抹平。
    // 空扫描不是「库里没有东西」的证据，只是这一次没扫到；库里本来就是空的就照常写。
    const previousCount = previous ? Object.keys(previous.videos || {}).length : 0;
    if (!videos.length && previousCount) {
      console.warn("扫描到 0 条记录，保留已有数据库，不用空结果覆盖。");
      return;
    }
    /* 1.7.10（facet-storage P2-3）：「扫到 0 条」只是最极端的一种。收藏夹临时没权限、
       扫描半路被打断，都会得到一个**明显更小**的 videos，原来照样整份重写，统计页
       凭空掉一大截而界面什么都不说。这里按比例再拦一道，并且说清楚怎么强制落库
       （「刷新」按钮走 forceStatsSync，那是用户明确说「我知道，照这次的算」）。 */
    if (!options.forceStatsSync && previousCount && videos.length < previousCount * STATS_SHRINK_KEEP_RATIO) {
      console.warn(`扫描到 ${videos.length} 条，数据库里原有 ${previousCount} 条，保留已有数据库。`);
      showToast(BcaI18n.t("这次只扫到 {scan} 个视频，数据库里原有 {known} 个，已先保留数据库不动。确实删了这些的话，点一次「刷新」就会按这次的重新统计。", {
        scan: formatCountText(videos.length),
        known: formatCountText(previousCount)
      }));
      return;
    }
    const database = core.databaseFromVideos(videos, { previous });
    // 1.5.0：和 background.js 的 publishStatsSnapshot 保持同一形状 —— snapshot() 的
    // days.days 是「库里有几天」的数字，每日明细另算一份 daily 给统计页画柱子。
    const payload = Object.assign(core.snapshot(database), { daily: core.recentDays(database) });
    /* 1.7.7（P0-1）：实质内容没变就一个字节都不写。以前这里每次都写（快照必然带新的
       updatedAt），而本页自己又订阅 bcaStats → 900ms 后再整树重扫 → 再写：不用导入、
       开着收藏库页就每秒一轮（磁盘每秒 ~227KB、storage 每秒一次、SW 永不回收）。 */
    const fingerprint = publishedStatsFingerprintOf(payload);
    if (fingerprint && fingerprint === publishedStatsFingerprint) return;
    await writeFileAtomically(directory, file, JSON.stringify(database));
    publishedStatsFingerprint = fingerprint;
    await chrome.storage.local.set({ bcaStats: payload });
  } catch (error) {
    console.warn("同步本地数据库失败（收藏库不受影响）", error);
  }
}

async function displayRoot(handle, collectionToSelect = "*", toastVerb = BcaI18n.t("已读取"), options = {}) {
  /* V1.4.3：写入路径（添加视频 / 新建收藏夹 / 删除）各有一套 inProgress 标记，
     与扫描互不知情。两轮扫描撞在一起会互相用旧快照覆盖新快照，还会把对方正在
     显示的封面 blob: URL 撤掉 —— 表现是列表少一批记录 + 封面裂图，只能刷新页面恢复。
     所以写入期间一律不重画，只有「自己刚写完、由自己发起的这一次刷新」例外。

     ⚠️ 这个判据里**不能**放 busyNow：所有扫描入口（刷新、选择目录、连接上次目录、
     恢复上次目录）都是先 setBusy(true) 再调 displayRoot，把它写进来等于每次扫描
     都被自己挡在门外 —— V1.4.3 发版时就是这样：选完目录、授权过的老用户进来，
     界面一律停在「尚未选择目录」。写入标记才是这里要挡的东西。 */
  if (!options.allowDuringWrite &&
      (videoAddInProgress || deleteInProgress || collectionCreateInProgress)) return;
  // 封面 blob: URL 现在跟着缓存条目走，这里不再整批 revoke —— 缓存未命中的条目
  // 会在下次扫描时被新 URL 取代，复用中的条目则必须保留原来的 URL。
  const preserveDownloadStatuses = rootHandle === handle;
  rootHandle = handle;
  // 先按上一次的记录数给一行「正在读取 0/43…」，别让界面在这次扫描期间完全没反应
  lastScanInfo = null;
  scanNoticeRefresh = progressNotifier(scanNoticeText, (value) => scanProgressText(value));
  scanNoticeRefresh.update({ done: 0, total: lastScanRecordCount.get(rootCacheKey(handle)) || 0 });
  // 1.8.5：上一次的快照先顶上（毫秒级），随后这次扫描照常整库校准并覆盖它。
  // 快照出任何问题都不影响主流程 —— 大不了就是多等一次整库读取。
  try { await paintSnapshot(handle); }
  catch (error) { console.warn("按上次的快照先渲染失败（这次直接整库读）", error); }
  const result = await scanRoot(handle, preserveDownloadStatuses);
  forceFullScan = false;
  lastScanInfo = {
    hits: result.stats?.hits || 0,
    reads: result.stats?.reads || 0,
    total: result.stats?.total || 0,
    forced: result.forced === true,
    bytes: result.stats?.bytes || 0,
    issues: result.issues,
    // 1.8.4：这条度量 1.7.24 就算出来了，却一直没带回界面 —— 于是 refreshScanNotice()
    // 里那段「目录名太长」的提示永远不会出现。顺手接上。
    longNames: result.longNames || [],
    unfinished: result.unfinished || []
  };
  if (result.stats?.total) lastScanRecordCount.set(rootCacheKey(handle), result.stats.total);
  // 1.8.5：把这一轮结果写成快照，下次打开先把界面填起来（异步，不等）
  saveScanSnapshot(handle, result.collections);
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
  syncDiffButton();
  // 扫描期间的「正在读取 N/M…」在这里收尾，换成缓存命中统计与读取失败清单
  refreshScanNotice();
  welcome.hidden = true;
  library.hidden = false;
  // 彩蛋入口跟着内容一起出现，收在分页器下方（目录还没读进来时不必露出来）
  if (retroEntryWrap) retroEntryWrap.hidden = false;
  renderCollections();
  // 数据源变了：先按新数据重建 UP 主/标签选项池，再渲染列表（顺序与原来 renderVideos 内部一致）
  refreshVideoFilterOptions();
  renderVideos();
  syncDetailDownloadAction();
  // 1.7.3：自动刷新（导入落盘后自己重画列表）不弹「已读取 N 个视频」——
  // 真机上导入期间每写一批就弹一次，很吵。手动刷新照旧提示。
  if (options.silentToast !== true) showToast(BcaI18n.t("{verb} {count} 个视频", { verb: toastVerb, count: formatCountText(allVideos().length) }));
  // 大目录的递归体积统计很慢，放在渲染之后异步跑，不阻塞界面
  // 1.8.5：体积统计直接用这一轮量到的字节，不再为它整树递归一遍
  updateStorageUsage(handle, { total: result.stats?.bytes });
  // 1.5.0：数据库同步也放在渲染之后，同样是「慢活不挡界面」
  syncStatsDatabase(handle, options);
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
   与插件弹窗里的「先看差异」走同一条后台消息，只是这里用本地归档名去匹配远程收藏夹
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
  // P2-10：槽位只有一个。第二次占用以前只是把新的 waiter 放进去，上一次的 await 就
  // 永远不返回（对话框看着卡死、后面的流程再也走不下去）。现在先把上一次 resolve 成
  // 「取消」再换人 —— 先取走槽位再 resolve，重复调用天然安全。
  closeDiffRisky(false);
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

/* 关掉对话框并结算等待者：所有「这次等待已经没有意义」的出口都走这里
   （点取消 / 点照当前档位继续 / 被下一次调用顶掉 / 页面卸载）。
   先取走槽位再 resolve，所以 waiter 恰好被结算一次。 */
function closeDiffRisky(confirm) {
  settleDiffRisky(confirm);
  if (diffRiskyDialog.open) diffRiskyDialog.close();
}

diffRiskyDialog.addEventListener("cancel", () => settleDiffRisky(false));
diffRiskyDialog.addEventListener("close", () => {
  // 已经重新打开（极短时间里又发起了一次对比）说明这条 close 属于上一次，别误杀新的等待
  if (!diffRiskyDialog.open) settleDiffRisky(false);
});
document.getElementById("diffRiskyCancel").addEventListener("click", () => closeDiffRisky(false));
document.getElementById("diffRiskyGo").addEventListener("click", () => closeDiffRisky(true));
/* 页面被卸载 / 进 bfcache（关标签页、整页导航）时，这条等待不可能再有答案了：
   就地结算成「取消」，绝不留一个永远挂着的 await。
   故意**不**监听 visibilitychange —— 这个弹窗本身就在建议用户去插件弹窗里改档位，
   切窗口是预期操作，一 hidden 就取消会把它打断。 */
window.addEventListener("pagehide", () => closeDiffRisky(false));

/* P2-9：「与 B 站对比」必须单飞。真正发起对比的是确认框里的「开始对比」，
   而旧代码禁用的却是列表面板上的入口按钮（diffLibraryButton）—— 于是两次点击能各起
   一条 bca-fav-diff：两条都往同一个 diffDialogBody 里写，慢的那条最后 replaceChildren()
   会把快的那条已经渲染好的结果整块清掉（用户看到空白或对不上的结果）。
   现在点下「开始对比」就置位并禁用入口（含风险档确认那一段等待），成功 / 失败 / 取消
   都在 finally 里复位。 */
const diffConfirmGo = document.getElementById("diffConfirmGo");
let diffInFlight = false;

/* diffLibraryButton 同时受「扫描/刷新中」（setBusy）与「对比进行中」两处控制，
   状态只能由一处算出来 —— 两处各自快照会在交叉时错位（对比中被刷新后按钮恢复成可点，
   或者扫描结束后按钮卡在禁用）。 */
function syncDiffButton() {
  if (!diffLibraryButton) return;
  diffLibraryButton.disabled = busyNow || diffInFlight;
}

function setDiffInFlight(running) {
  diffInFlight = running;
  /* 「开始对比」只受这里控制，按原样记下 / 还回即可 */
  if (diffConfirmGo) {
    if (running) {
      diffConfirmGo.dataset.diffWasDisabled = diffConfirmGo.disabled ? "1" : "0";
      diffConfirmGo.disabled = true;
    } else if (diffConfirmGo.dataset.diffWasDisabled !== undefined) {
      diffConfirmGo.disabled = diffConfirmGo.dataset.diffWasDisabled === "1";
      delete diffConfirmGo.dataset.diffWasDisabled;
    }
  }
  syncDiffButton();
}

async function startDiffWithBilibili() {
  diffConfirm.close(); // 这次点击无论会不会被丢掉，确认框都该收起来
  if (diffInFlight) return; // 已经在对比中：这次点击直接丢掉，绝不起第二条 bca-fav-diff
  setDiffInFlight(true);
  try {
    if (!await confirmLibraryRiskySpeed()) return; // 用户在风险档确认里选了「取消」
    await diffWithBilibili();
  } finally {
    setDiffInFlight(false);
  }
}

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
// 「开始对比」只走 startDiffWithBilibili（单飞、立刻进入对比中都在那里，见 P2-9 的注释）
diffConfirmGo.addEventListener("click", () => { startDiffWithBilibili(); });

// 只允许由 startDiffWithBilibili 调用：单飞保证同一时间只有一条 bca-fav-diff 在跑
async function diffWithBilibili() {
  if (selectedCollection === "*") {
    showToast(BcaI18n.t("请先在左侧选择一个收藏夹，再与 B 站对比。"));
    return;
  }
  diffDialog.showModal();
  diffDialogBody.replaceChildren();
  diffDialogStatus.hidden = false;
  diffDialogStatus.textContent = BcaI18n.t("正在读取 B 站收藏夹列表…");
  try {
    const response = await chrome.runtime.sendMessage({
      type: "bca-fav-diff",
      data: { folderTitles: [selectedCollection] }
    });
    if (!response?.ok) throw new Error(response?.message ? BcaI18n.t(response.message) : BcaI18n.t("对比差异失败。"));
    renderDiffDialog(response);
  } catch (error) {
    diffDialogStatus.textContent = error?.message ? BcaI18n.t(error.message) : BcaI18n.t("对比差异失败。");
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

/* 1.7.7（P0-2）：refreshDownloadStatuses 的最小间隔。切回标签页属于高频动作，
   而整树扫描是上万次 FS 往返；downloadRevision（真正写完下载）用 force 绕过。 */
const DOWNLOAD_STATUS_MIN_INTERVAL_MS = 60 * 1000;
let lastDownloadStatusCheckAt = 0;

async function refreshDownloadStatuses(force = false) {
  if (!rootHandle || downloadStatusCheckRunning) return;
  const now = Date.now();
  if (!force && now - lastDownloadStatusCheckAt < DOWNLOAD_STATUS_MIN_INTERVAL_MS) return;
  lastDownloadStatusCheckAt = now;
  downloadStatusCheckRunning = true;
  try {
    const index = await scanDownloadedDirectories(rootHandle, { force });
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

// 当前是否正在扫描 / 连接目录。syncRootFromStorage 用它避开自己刚写下的那个信号
let busyNow = false;
function setBusy(isBusy, busyKey = "reading") {
  busyNow = isBusy;
  chooseRoot.disabled = isBusy;
  refreshLibraryButton.disabled = isBusy || !rootHandle;
  refreshLibraryButton.classList.toggle("is-loading", isBusy);
  welcomeChoose.disabled = isBusy;
  /* V1.4.3：扫描/刷新期间禁止再发起写入类操作 ——「添加视频」与扫描互踩会丢条目、封面还会裂图。
     禁用时记下原状态，解除时按原样还回去（这个按钮平时由「选中了收藏夹」等条件控制启用，
     不能一律设成可用）。「与 B 站对比」放在 syncDiffButton 里统一算，见那里的注释。 */
  if (addVideoButton) {
    if (isBusy) {
      if (addVideoButton.dataset.busyWasDisabled === undefined) {
        addVideoButton.dataset.busyWasDisabled = addVideoButton.disabled ? "1" : "0";
      }
      addVideoButton.disabled = true;
    } else if (addVideoButton.dataset.busyWasDisabled !== undefined) {
      addVideoButton.disabled = addVideoButton.dataset.busyWasDisabled === "1";
      delete addVideoButton.dataset.busyWasDisabled;
    }
  }
  syncDiffButton();
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
    // 1.7.10（facet-storage P2-3）：用户明确点了「刷新」，就是明确说「按这次的扫描结果算」，
    // 所以这道人工动作要能越过「比旧库少太多就不覆盖」的那道闸门，否则真删了一大批视频的人
    // 会被永久卡在旧数字上。
    await displayRoot(rootHandle, collectionToKeep, BcaI18n.t("已刷新"), { forceStatsSync: true });
  } catch (error) {
    if (error?.name !== "AbortError") showToast(BcaI18n.t("刷新失败：{message}", { message: error?.message || BcaI18n.t("无法读取本地目录。") }));
  } finally { forceFullScan = false; setBusy(false); }
}

/* V1.4.4：选完目录后把插件自己的三个固定目录建出来。
   以前只有弹窗会建 000视频下载，收藏库什么都不建 —— 选一个空文件夹进来，
   目录树是空的，「标记已下载」还会撞上一句指错方向的提示。
   这四个名字必须与 background.js 的 RESERVED_COLLECTION_NAMES 以及本文件里
   扫描时跳过的那份名单一致。创建失败（只读权限、用户拒绝）不影响主流程。
   1.5.0：多了 003database（本地数据库根目录，BcaStatsCore 负责读写它）。 */
const ROOT_STRUCTURE_DIRECTORIES = ["000视频下载", "001错误报告", "002同步报告", "003database"];

async function ensureRootStructure(handle) {
  if (!handle) return;
  for (const name of ROOT_STRUCTURE_DIRECTORIES) {
    try { await handle.getDirectoryHandle(name, { create: true }); } catch (_) { /* 跳过 */ }
  }
}

async function chooseAndScan() {
  if (!window.showDirectoryPicker) { showToast(BcaI18n.t("当前 Chrome 暂不支持本地目录访问，请更新浏览器后重试。")); return; }
  setBusy(true);
  try {
    /* 收藏库这边要建目录（见 ensureRootStructure），所以按读写要权限 ——
       弹窗选择时也是这么要的，两边的授权范围保持一致。 */
    const handle = await window.showDirectoryPicker({ mode: "readwrite" });
    const permission = await handle.requestPermission({ mode: "readwrite" });
    if (permission !== "granted") throw new Error(BcaI18n.t("没有获得此文件夹的写入权限。"));
    await saveHandle(handle);
    await ensureRootStructure(handle);
    await displayRoot(handle);
  } catch (error) {
    if (error?.name !== "AbortError") showToast(error?.message || BcaI18n.t("读取目录失败。"));
  } finally { setBusy(false); }
}

async function continueWithLastRoot() {
  if (!rootHandle) { await chooseAndScan(); return; }
  setBusy(true, "connecting");
  try {
    const permissionRequest = rootHandle.requestPermission({ mode: "readwrite" });
    const permission = await permissionRequest;
    if (permission !== "granted") throw new Error(BcaI18n.t("没有获得上次目录的读取权限。可使用右上角按钮重新选择目录。"));
    await ensureRootStructure(rootHandle);
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

// 1.7.14（facet-compat C6）：句柄在、授权也在，但目录已经不在了（被删除 / 改名 /
// 换了盘符）。以前这种情况下会走到扫描深处才炸，界面上只剩一句英文异常名，
// 或者干脆画出一个空库 —— 用户会以为归档全丢了。
function showRootMissing(name) {
  rootHandle = null;
  setDynamicText(rootLabel, BcaI18n.t("上次目录已失联"));
  updateStorageUsage(null);
  statusDot.classList.remove("ready");
  showWelcomeChooseLabel("choose");
  setDynamicText(welcomeCopy, BcaI18n.t("上次选择的目录“{name}”已经不在了（被删除、改名或换了盘符）。请重新选择本地备份文件夹。", { name }));
  setDynamicText(welcomeFootnote, BcaI18n.t("目录如果只是换了位置，重新选中它就行 —— 归档文件本身不会被改动。"));
  showToast(BcaI18n.t("上次选择的目录“{name}”已经不在了，请重新选择本地备份文件夹。", { name }));
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
      // 1.7.14（facet-compat C6）：授权还在，目录本身却可能已经被删 / 改名 / 换盘。
      // 这里先探一次（只读一个条目），探测失败就别再往下走成「空库」。
      try {
        for await (const _entry of handle.values()) break;
      } catch (error) {
        if (error?.name === "NotFoundError") { showRootMissing(handle.name); return; }
        throw error;
      }
      setBusy(true, "loading-last");
      // 老用户可能只授过只读权限：建目录会失败，但那只影响目录树，不影响读归档
      try { await ensureRootStructure(handle); } catch (_) { /* 忽略 */ }
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

/* 弹窗里换了备份文件夹，把本页面拉回一致。
   句柄就是权威来源（两边读写的是 IndexedDB 里同一个 key），所以这里只负责改界面：
   还没连过目录就按「上次选择的目录」走一遍；已经连着别的目录就换标签并提示刷新；
   名字没变直接返回 —— 保存句柄本身也会写 revision，不能每次都被它带着重扫一遍。 */
async function syncRootFromStorage() {
  if (busyNow) return;
  try {
    const handle = await loadSavedHandle();
    if (!handle) return;
    if (!rootHandle) { await restoreLastRoot(); return; }
    if (handle.name === rootHandle.name) return;
    rootHandle = handle;
    setDynamicText(rootLabel, handle.name);
    if (breadcrumbRoot) setDynamicText(breadcrumbRoot, handle.name);
    statusDot.classList.remove("ready");
    updateStorageUsage(null);
    showToast(BcaI18n.t("备份文件夹已改为“{name}”，点右上角“刷新”重新读取。", { name: handle.name }));
  } catch (_) {
    // 读句柄失败不该把页面搞崩：下次刷新或重开时 restoreLastRoot 还会再试一遍
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
deleteSelectedButton.addEventListener("click", () => askToDeleteBatch(selectedRecords()));
  // 4.5.1：批量更新状态——用勾选的记录，不是当前收藏夹的全部视频
  updateSelectedButton.addEventListener("click", () => openStatusConfirm(selectedRecords(), "batch"));
  statusConfirmGo.addEventListener("click", () => { runStatusRefresh().catch(() => {}); });
  statusConfirmCancel.addEventListener("click", () => {
    // 等待后台时它写的是「不再等待」，这里如实按那个语义走（P2-14）
    if (statusWaitingForBackground) { abandonStatusWait(); return; }
    if (!statusRefreshInProgress) statusConfirm.close();
  });
  statusConfirm.addEventListener("cancel", (event) => {
    // Esc 同样是「不再等待」：等待期间不再把用户锁在模态框里（P2-14 之前这里一律 preventDefault）
    if (statusWaitingForBackground) { abandonStatusWait(); return; }
    if (statusRefreshInProgress) event.preventDefault();
  });
// 4.9：搜索输入加 250ms 防抖。原来每敲一个字符就同步跑一整遍：全量筛选 + 排序 + 重画
// 卡片 + 重建上千个 <option>，10000 条时每次按键要卡 0.5~3 秒。防抖后一次连续输入
// 只在停下来之后跑一次。**语义不变**：停止输入 250ms 后必然渲染一次，最终结果与原来一致。
const SEARCH_DEBOUNCE_MS = 250;
let searchDebounceTimer = 0;

function applySearchNow() {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = 0;
  resetPaging();
  // 1.7.12（perf PF-2）：逐键这条路走带缓存的入口，连着敲 / 退格都不再重跑全表词频
  refreshVideoFilterOptionsForSearch();
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

/* ---------------- V1.3.2：右下角的设置齿轮 ---------------- */

// 4.5.1～V1.3.1 这里是主题与语言两个悬浮球（含各自的菜单、键盘操作与选中态同步），
// V1.3.2 把这三块（含左下角的「使用说明」问号球）合成一个齿轮，点开进独立的设置页，
// 所以整块菜单逻辑连同 THEME_ICONS / themeLabel / renderDockMenus 都删掉了。
// 设置页改完写各自的存储，这一页靠 theme.js 的 storage 事件与下面的
// chrome.storage.onChanged 监听（interfaceLocale）跟上，不需要额外信号。
settingsFab.addEventListener("click", () => {
  // 扩展页面可以直接被扩展自己打开，不需要 web_accessible_resources
  chrome.tabs.create({ url: chrome.runtime.getURL("settings.html") });
});

/* ---------------- 彩蛋：分页器下方那一行小字 → 扩展自带的 2015 怀旧首页 ---------------- */
// V1.5.8 这一行原本开的是项目里一个自制怀旧页，那个页面已经按用户要求删掉了；
// 现在开的是扩展自带的、作者复刻的 2015 年 B 站首页（bili-old-2015/index.html）。
// 它就在扩展自己的目录里，属于扩展页面，扩展开自己的页面不需要 web_accessible_resources。
// 开在新标签里，跟旁边的设置齿轮是同一个做法：收藏库这边正开着某个收藏夹、可能翻到第 N 页，
// 用新页盖掉当前页会让人找不回来。
retroEntryButton?.addEventListener("click", () => {
  /* 1.7.0（批次 C / 打包分面 P1）：这一页**不随发行包装进去** —— pack.ps1 排除了
     bili-old-2015/（那是带 build 工具链的 20MB 源码树，只有源码加载扩展的机器上才有），
     可入口一直挂着。真实用户装的包里点这一行，只会开出浏览器自带的「找不到文件」空白页。
     先探一下这个资源在不在包里：在就照旧开新标签；不在就给一句人话，别甩坏页面。 */
  const retroUrl = chrome.runtime.getURL("bili-old-2015/index.html");
  fetch(retroUrl, { cache: "force-cache" })
    .then((response) => {
      if (!response.ok) throw new Error(String(response.status));
      chrome.tabs.create({ url: retroUrl });
    })
    .catch(() => {
      showResultDialog(
        BcaI18n.t("彩蛋页不在这份安装包里"),
        BcaI18n.t("这一版没有打包 2015 年的怀旧首页；从源码目录加载扩展时才能打开。"),
        "error"
      );
    });
});

// V1.4.1：齿轮上方那个「回到顶部」。收藏库是整页跟着窗口滚的（顶栏是 sticky，
// 没有内部滚动容器），所以直接滚 window 就对了。
// 它只在滚过一段距离以后才出现：停在顶部时按它不会有任何变化，露着反而像坏了。
const SCROLL_TOP_REVEAL_AT = 240;
const prefersReducedMotion = () => {
  try { return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true; }
  catch (_) { return false; }
};
function syncScrollTopFab() {
  const nearTop = window.scrollY < SCROLL_TOP_REVEAL_AT;
  scrollTopFab.classList.toggle("is-hidden", nearTop);
  // 淡出以后不该还能被 Tab 到（.is-hidden 只管鼠标）
  scrollTopFab.tabIndex = nearTop ? -1 : 0;
}
scrollTopFab.addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
});
window.addEventListener("scroll", syncScrollTopFab, { passive: true });
syncScrollTopFab();

// 切语言后要重画所有由 JS 生成的文字
function relabelAfterLocaleChange() {
  renderCollections();
  // 选项池的第一项（全部 UP 主 / 全部标签）是翻译过的文案，切语言要重建一次
  refreshVideoFilterOptions();
  renderVideos();
  renderFailures();
  // 导入提示条的文案是 JS 写进去的，切语言也要跟着换（P2-8）
  applyImportState(lastImportState);
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
/* 1.7.11（facet-privacy P2-7）：剪贴板是同机所有程序都能读的公共位置，而这批内容里
   带的是整批失败视频的标题。原来只回一句「已复制失败清单。」，用户不知道复制走的是什么、
   也不知道它不会自动消失。现在把条数与「含标题」「不会被自动清空」都写在提示里。 */
copyFailuresButton?.addEventListener("click", () => {
  const lines = failureLines();
  copyToClipboard(lines.join("\n"), BcaI18n.t("已复制 {count} 条失败项（含视频标题）。剪贴板不会被自动清空，贴完记得覆盖掉。", { count: formatCountText(lines.length) }));
});
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
  if (confirmCollectionActionButton.dataset.busy === "true") {
    // 1.7.21：跑批期间这个按钮是「中止整理」。不打断当前那一个视频 ——
    // 复制到一半的目录由 moveVideoRecordToTargets 自己收尾，这里只让循环别再往下走。
    collectionActionAbort = true;
    cancelCollectionActionButton.disabled = true;
    cancelCollectionActionButton.textContent = BcaI18n.t("正在停下…");
    showCollectionActionProgress(BcaI18n.t("正在停下，等当前这个视频收尾…"), true);
    return;
  }
  pendingCollectionAction = null;
  collectionActionDialog.close();
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
exportConfigButton?.addEventListener("click", () => downloadConfigFile(true));
// 1.7.17（facet-privacy P1-2）：不含收藏夹顺序与筛选的出口，点了不再弹确认
(document.getElementById("exportConfigSlim"))?.addEventListener("click", () => downloadConfigFile(false));
// 1.7.30（路线图第 2 项）：导出整个归档的元数据（含 schema 版本 + 校验和）
exportArchiveButton?.addEventListener("click", () => { exportArchiveMetadata(); });
importConfigButton?.addEventListener("click", () => {
  configFileInput.value = "";
  configFileInput.click();
});
configFileInput?.addEventListener("change", async () => {
  const file = configFileInput.files?.[0];
  if (!file) return;
  importConfigButton.disabled = true;
  try {
    // 1.7.10（facet-storage P2-2）：先按文件大小拦一道，别把超大文件整个读进内存
    if (file.size > MAX_CONFIG_BYTES) {
      throw new Error(BcaI18n.t("这个配置文件有 {size}，超过了 {limit}，为了不把插件存储挤爆，没有导入。", {
        size: formatBytes(file.size),
        limit: formatBytes(MAX_CONFIG_BYTES)
      }));
    }
    const warnings = await importConfigFromText(await file.text());
    // 1.7.17：二次确认里点了取消 —— 什么都不做，也不报「已导入」
    if (warnings === false) return;
    // 1.7.10（P2-2）：有没生效的项就必须说出来，不能一律报「配置已导入。」
    showToast(warnings?.length
      ? BcaI18n.t("配置已导入，但有 {count} 项没生效：{detail}", { count: warnings.length, detail: warnings.join("；") })
      : BcaI18n.t("配置已导入。"));
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
/* 1.7.2：导入 / 手动收藏 / 补存写完以后，后台会把统计快照 bcaStats 写进 storage。
   收藏库这边原来只订阅 importState / downloadRevision / rootHandleRevision / 语言，
   于是**页面开着的时候新导入的记录不会出现** —— 真机反馈就是「显示导入成功、也落盘了，
   但收藏库页面看不到」。这里补一次防抖刷新：等落盘稳定下来（导入是一批批写的），
   只在页面可见、没有弹窗、没在批量选择 / 保存的时候动列表，避免打断用户手上的操作。 */
let archiveRefreshTimer = 0;
/* 1.7.5：自动刷新的防抖窗口。导入期间不再进来（见下面 storage 监听与 applyImportState），
   所以固定一个小值就够；真机上要避免的是「一次导入扫几十遍」。 */
const ARCHIVE_REFRESH_DELAY_MS = 900;
function scheduleArchiveRefresh() {
  if (archiveRefreshTimer) window.clearTimeout(archiveRefreshTimer);
  // 1.7.3：节流到 4 秒 —— 真机反馈是「每隔几秒就提示一次『已读取 N 个视频』」。
  // 1.7.5：导入期间不再触发这里（见 storage 监听与 applyImportState），所以固定 900ms 就够。
  archiveRefreshTimer = window.setTimeout(async () => {
    archiveRefreshTimer = 0;
    if (!rootHandle) return;
    if (document.visibilityState !== "visible") return;
    if (selectionMode || videoAddInProgress) return;
    if (document.querySelector("dialog[open]")) return;
    const error = await refreshAfterLocalChange(() =>
      displayRoot(rootHandle, selectedCollection, BcaI18n.t("已读取"), { silentToast: true }));
    if (error) console.warn("收藏库自动刷新失败（下次写入时还会再试）", error);
  }, ARCHIVE_REFRESH_DELAY_MS);
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  // 1.7.5：新记录落盘后刷新列表 —— 但**导入期间不刷**（那时每批快照都会写 bcaStats，
  // 575 个记录会被整树重扫一遍又一遍）。导入结束由 applyImportState 统一收口补一次；
  // 手动收藏 / 补存这类单条写入没有导入在跑，仍然会立刻反映到列表上。
  /* 1.7.7（P0-1）：本页自己写的快照会被自己收到。指纹相同就是自己的回声 —— 不重扫。
     这一条与 syncStatsDatabase 的「没变不写」一起把那个每秒一轮的环路彻底断掉；
     后台写进来的（导入 / 手动收藏）实质字段一定变了，照旧刷新。 */
  if (changes.bcaStats) {
    const incomingFingerprint = publishedStatsFingerprintOf(changes.bcaStats.newValue);
    if (incomingFingerprint !== publishedStatsFingerprint && !importIsRunning) scheduleArchiveRefresh();
  }
  // P2-8：后台把导入状态写在 importState 上，订阅它就能在收藏库里给出「导入进行中」的提示
  if (changes.importState) applyImportState(changes.importState.newValue);
  if (changes.downloadRevision && rootHandle) {
    invalidateStorageUsageCache(); // 下载目录变了：体积统计的缓存作废（P2-12）
    refreshDownloadStatuses(true);
  }
  /* 在弹窗里换了备份文件夹：本页面开着的时候不会自己知道，靠这个信号叫醒。
     之前只读一次句柄就再也不看，于是弹窗和收藏库会各显示一个目录名。 */
  if (changes.rootHandleRevision) syncRootFromStorage();
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
window.addEventListener("focus", () => { if (rootHandle) updateStorageUsage(rootHandle); });
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  /* 1.7.7（P0-2）：切回标签页/窗口获焦不再整树重扫 000视频下载。那是文件系统调用
     （几千个目录 = 上万次 Mojo IPC），而"下载目录真的变了"本来就有 downloadRevision
     这个专门信号（见上面的 onChanged）；这里只补一次带缓存的体积统计。 */
  refreshDownloadStatuses();
  /* 1.7.5：切回标签页不再整树重扫视频资料 —— 用户的要求是「浏览行为不算」，
     只有导入新视频 / 删除视频 / 点刷新这类主动行为才重扫（导入结束那一次由
     applyImportState 收口）。页面不可见期间漏掉的刷新会在下次主动行为时补上。 */
  // 在后台被跳过的那次体积统计在这里补上（走缓存，签名没变不会重算，见 P2-12）
  if (rootHandle) updateStorageUsage(rootHandle);
});
// 4.9：这里原来有一个 60 秒的 window.setInterval，只要页面在前台就整树重扫一遍
// 000视频下载。递归扫描是文件系统调用，10000 条记录时相当于每分钟上万次，页面
// 一直开着就在持续打盘，收益却接近于零。**不要再把定时器加回来**：按需触发已经够用——
//   1. 下载页写 chrome.storage.local.downloadRevision 时，上面的 onChanged 会触发（force）；
//   2. 标签页重新可见（visibilitychange → visible）触发一次（受 DOWNLOAD_STATUS_MIN_INTERVAL_MS 节流）。
// 1.7.7（P0-2）：连 window 的 focus 监听也删了 —— 它和 visibilitychange 在真实使用里
// 高度重叠（都是"人回到这个窗口"），等于同一棵树被扫两遍。
// 唯一的行为变化：页面在前台闲置时不会再自动刷新「已下载」状态，切回本页或
// 下载完成后仍然会刷新（写在 AI_HANDOFF 里的「前台定时扫描间隔 60 秒」要一起改掉）。
BcaI18n.init().catch(() => {}).then(() => Promise.all([
  // 1.7.10（facet-storage P2-1）：读不出来就**什么都不做** —— 不清内存里的顺序
  // （启动时本来就是空的），也不置 collectionOrderLoaded，这样后面任何一次拖拽
  // 都不会拿扫描顺序去覆盖磁盘上那份。旧代码在这里写 `collectionOrder = []`，
  // 等于把「读失败」当成「没保存过」。
  restoreCollectionOrder().catch(() => {
    showToast(BcaI18n.t("收藏夹顺序没读出来，本次先按扫描顺序显示；为避免覆盖，这期间不会保存排序。"));
  }),
  restoreViewSettings(),
  restoreImportHint(),
  restoreImportState(),
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
} catch (error) {
  // 侧栏版本号留空不影响任何功能，但「界面版本号不对」正是当初要修的那个问题，
  // 所以失败要留痕，别让它静默地又错一次。
  console.warn("侧栏版本号没取到（这一处会留空）", error);
}
