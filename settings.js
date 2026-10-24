"use strict";

// 1.8.22（old-p3 security P3-2）：不允许被别的页面嵌进 iframe 做点击劫持（判据在 i18n.js）。
BcaI18n.guardTopFrame("这个页面需要在独立标签页中打开，请不要把它嵌入其他页面。", "页面不允许被嵌入其他页面。");

/* 设置页：外观、语言、使用说明。
   主题与外观走 BcaTheme（localStorage 是权威、chrome.storage 是给内容脚本看的镜像，
   背景图单独存在 IndexedDB 的 Blob 里），语言走 BcaI18n
   （chrome.storage.local[interfaceLocale]）。两个都是改完立即生效，并且留在本页 ——
   设置页不关自己。

   版面是「左导航 + 顶栏 + 分组卡里一行一项」：导航和搜索都只是**滚动 + 高亮**，
   绝不 hide 任何一行 —— 「只有自定义才显示」那几组本来就在切 hidden，
   两套显隐逻辑叠在一起必然打架（搜索到一行、点过去，结果那行是隐藏的）。 */

const themeButtons = [...document.querySelectorAll(".segmented button[data-theme-value]")];
const localeButtons = [...document.querySelectorAll(".segmented button[data-locale]")];
const localeStatus = document.getElementById("localeStatus");

/* ------------------------------------------------------------------ *
 * 主题
 * ------------------------------------------------------------------ */

// 选中态只改 aria-pressed、不写文字：切完语言后写死的文字会把译文盖回中文。
// 本页真正需要改字的只有面包屑、滑块读数、动态生成的搜索结果和错误提示，
// 它们统一走 writeText()。
function renderThemeOptions() {
  for (const button of themeButtons) {
    button.setAttribute("aria-pressed", String(button.dataset.themeValue === BcaTheme.current()));
  }
  renderAppearance();
  renderCrumb(navGroup);
}

/* ------------------------------------------------------------------ *
 * 外观（背景图 + 滑块 + 毛玻璃）
 * ------------------------------------------------------------------ */

const $ = (id) => document.getElementById(id);
const setVisible = (element, visible) => { if (element) element.hidden = !visible; };
// 这些地方的文字是算出来的（面包屑、滑块读数、搜索结果、错误提示），data-i18n 管不到，
// 只能自己写。约定的写入口只有一个：整段替换子节点，而不是往 textContent 里赋值 ——
// 后者会把元素里的子节点（比如图标）一起抹掉，库里已经踩过这个坑（见 library.js 的扫描提示）。
const writeText = (element, text) => { if (element) element.replaceChildren(document.createTextNode(text)); };
// 滑块的数值文本是「80%」「24px」这类，不走 data-i18n（语言无关）
const formatPercent = (value) => `${value}%`;
const formatPx = (value) => `${value}px`;

// 有没有存过背景图。IndexedDB 里只存了「当前这一张」，所以「读得到 Blob」就等于
// 「设过背景图」，不需要另外维护一个标志位。
let hasWallpaper = false;

// 只有一条错误提示的坑位：两条失败原因共用一个，所以在这里换文案
let wallpaperErrorKey = "这张图片读不出来，换一张试试。";

function showWallpaperError(key) {
  wallpaperErrorKey = key;
  writeText($("wallpaperError"), BcaI18n.t(key));
  setVisible($("wallpaperErrorRow"), true);
}

function clearWallpaperError() {
  setVisible($("wallpaperErrorRow"), false);
}

// 1.7.9（ux P2-4）：操作成功也要有落地反馈。原来「移除背景图片」点完界面纹丝不动
// （按钮自己藏起来而已），用户没法确认到底生效没有。这里给一句 role="status" 的话，
// 4 秒后自己收起 —— 提示是「已经发生的事」，不需要用户手动关掉。
let wallpaperStatusTimer = 0;
const WALLPAPER_STATUS_MS = 4000;

function showWallpaperStatus(key) {
  const box = $("wallpaperStatus");
  if (!box) return;
  writeText(box, BcaI18n.t(key));
  setVisible(box, true);
  if (wallpaperStatusTimer) clearTimeout(wallpaperStatusTimer);
  wallpaperStatusTimer = setTimeout(() => {
    wallpaperStatusTimer = 0;
    setVisible(box, false);
  }, WALLPAPER_STATUS_MS);
}

function clearWallpaperStatus() {
  if (wallpaperStatusTimer) {
    clearTimeout(wallpaperStatusTimer);
    wallpaperStatusTimer = 0;
  }
  const box = $("wallpaperStatus");
  if (box) {
    setVisible(box, false);
    writeText(box, "");
  }
}

/* 1.7.11（facet-privacy P2-3）：「与 B 站对比」为了不用每次重开收藏夹页，把用户自己的
   B 站 UID 缓存在 chrome.storage.local 的 lastImportUid 里 —— 只进不出，既没有失效期
   也没有清除入口。这里给一个明确的「忘记」按钮：清完下次对比会重新引导一次，功能不受影响。 */
let forgetUidStatusTimer = 0;
const FORGET_UID_STATUS_MS = 4000;

function showForgetUidStatus(key) {
  const box = $("forgetUidStatus");
  if (!box) return;
  writeText(box, BcaI18n.t(key));
  setVisible(box, true);
  if (forgetUidStatusTimer) clearTimeout(forgetUidStatusTimer);
  forgetUidStatusTimer = setTimeout(() => {
    forgetUidStatusTimer = 0;
    setVisible(box, false);
  }, FORGET_UID_STATUS_MS);
}

async function forgetRememberedUid() {
  try {
    await chrome.storage.local.remove("lastImportUid");
    showForgetUidStatus("已忘记记住的 B 站 UID，下次对比会重新问你一次。");
  } catch (error) {
    showForgetUidStatus(`没能清掉：${error?.message || BcaI18n.t("插件存储不可用")}`);
  }
}

/* 1.7.17（facet-privacy P1-1）：卸载扩展时 Chrome 只删扩展自己，不会碰原生消息宿主。
   残留 = 注册表项 + %LOCALAPPDATA%\BcaFolderOpener（settings.json 里有扩展 ID 和下载目录路径）。
   这条命令和仓库里的 uninstall-native-folder-opener.ps1 做的是同一件事，但用户不需要手上
   还留着安装包；两边的浏览器清单由 test/stability.test.cjs 的守卫断言保持同步。 */
const NATIVE_CLEANUP_VENDORS = [
  "Google\\Chrome",
  "Google\\Chrome Beta",
  "Google\\Chrome Dev",
  "Google\\Chrome SxS",
  "Microsoft\\Edge",
  "BraveSoftware\\Brave-Browser",
  "Vivaldi",
  "Chromium"
];

function nativeCleanupCommand() {
  const paths = NATIVE_CLEANUP_VENDORS.map((vendor) => `"HKCU:\\Software\\${vendor}\\NativeMessagingHosts\\com.bcatch.folder_opener"`);
  paths.push('"$env:LOCALAPPDATA\\BcaFolderOpener"');
  return `Remove-Item -LiteralPath @(${paths.join(", ")}) -Recurse -Force -ErrorAction SilentlyContinue`;
}

function showNativeCleanupStatus(text) {
  const box = $("nativeCleanupStatus");
  if (!box) return;
  writeText(box, text);
  setVisible(box, true);
}

async function copyNativeCleanupCommand() {
  const command = nativeCleanupCommand();
  try {
    await navigator.clipboard.writeText(command);
    showNativeCleanupStatus(BcaI18n.t("已复制。粘到 PowerShell 里回车即可完成清理。"));
  } catch (_) {
    // 剪贴板被拒（例如页面不在前台）时退回「让用户自己复制」，不能只报一句失败
    window.prompt(BcaI18n.t("自动复制没成功，手动复制下面这条命令："), command);
  }
}

// 「自定义」才显示背景图那一组；毛玻璃是全局效果，但强度滑块只在开关打开时才有意义
function renderAppearance() {
  const custom = BcaTheme.current() === "custom";
  const appearance = BcaTheme.appearance();
  setVisible($("wallpaperRow"), custom);
  setVisible($("wallpaperVeilRow"), custom);
  setVisible($("wallpaperBlurRow"), custom);
  if (!custom) clearWallpaperError();

  const choose = $("wallpaperChoose");
  writeText(choose, BcaI18n.t(hasWallpaper ? "更换背景图片" : "选择背景图片"));
  setVisible($("wallpaperRemove"), custom && hasWallpaper);

  const veil = $("wallpaperVeil");
  if (veil) {
    veil.value = String(appearance.veil);
    writeText($("wallpaperVeilValue"), formatPercent(appearance.veil));
  }
  const blur = $("wallpaperBlur");
  if (blur) {
    blur.value = String(appearance.blur);
    writeText($("wallpaperBlurValue"), formatPx(appearance.blur));
  }
  const glass = $("glassToggle");
  if (glass) {
    glass.setAttribute("aria-pressed", String(Boolean(appearance.glass)));
    // 视觉是 .off 类画的（照 popup.css 的约定），只改 aria-pressed 的话，
    // 「上次已经开着毛玻璃」的用户再打开设置页，会看到一个显示为「关」的开关。
    glass.classList.toggle("off", !appearance.glass);
  }
  setVisible($("glassBlurRow"), Boolean(appearance.glass));
  const glassBlur = $("glassBlur");
  if (glassBlur) {
    glassBlur.value = String(appearance.glassBlur);
    writeText($("glassBlurValue"), formatPx(appearance.glassBlur));
  }
}

// 背景图存进去以后才知道「现在有图了」：BcaTheme 没有暴露这个状态，
// 所以启动和每次换图后都自己读一次 Blob 来对齐
function refreshWallpaperState() {
  return Promise.resolve(BcaTheme.loadWallpaper())
    .then((blob) => { hasWallpaper = Boolean(blob); renderAppearance(); })
    .catch(() => {});
}

function selectWallpaperFile(file) {
  clearWallpaperError();
  return Promise.resolve(BcaTheme.saveWallpaper(file))
    .then(() => refreshWallpaperState())
    .catch((error) => {
      // 非图片会被 theme.js 直接 reject；存储写不进去（配额、无痕）是另一种原因，
      // 两者的提示不一样，别把「存不下」说成「这不是图片」
      const notImage = /not an image|no file|image decode failed/i.test(String(error?.message || ""));
      showWallpaperError(notImage ? "这张图片读不出来，换一张试试。" : "浏览器不让存背景图片，可能是空间不够。");
    });
}

/* ------------------------------------------------------------------ *
 * 语言
 * ------------------------------------------------------------------ */

function renderLocaleOptions() {
  for (const button of localeButtons) {
    button.setAttribute("aria-pressed", String(button.dataset.locale === BcaI18n.locale()));
  }
}

// <title> 不在 apply() 的管辖范围里（data-i18n-title 改的是元素的 title 属性），只能手写
function applyTitle() {
  document.title = BcaI18n.t("哔哩藏库 · 设置");
}

// 1.7.14（facet-compat C5）：词典没取回来时 i18n 会静默退回中文原文，用户点了
// 「繁體中文 / English」却什么都没变，只能自己猜。这里把原因摊开说，并给出可做的事。
function showLocaleFailure() {
  if (!localeStatus) return;
  const failure = BcaI18n.loadFailure?.();
  if (!failure) {
    localeStatus.hidden = true;
    writeText(localeStatus, "");
    return;
  }
  writeText(localeStatus, BcaI18n.t("界面文字没能切换成 {locale}：词典没读出来（{reason}）。界面暂时按中文原文显示，重新加载设置页或重启浏览器再试一次。", {
    locale: failure.locale,
    reason: failure.reason
  }));
  localeStatus.hidden = false;
}

async function applyLocale(locale) {
  await BcaI18n.use(locale);
  renderLocaleOptions();
  showLocaleFailure();
}

/* ------------------------------------------------------------------ *
 * 左导航与面包屑：跟着滚动走
 * ------------------------------------------------------------------ */

// 导航项和分组都从 DOM 里现取，不做第二份硬编码清单 ——
// 以后加一个分组只要写一段 HTML，导航、面包屑、搜索会一起跟上
const navItems = [...document.querySelectorAll("#settingsNav [data-group]")];
const cards = [...document.querySelectorAll(".settings-main .settings-card[data-group]")];
let navGroup = navItems[0]?.dataset.group || cards[0]?.dataset.group || "";

function groupLabel(id) {
  // 分组名既是卡片标题也是导航文字，取卡片里那个 h2 的 data-i18n 当键，
  // 这样多语言下拿到的就是当前语言的写法
  const heading = cards.find((card) => card.dataset.group === id)?.querySelector("h2");
  return heading?.dataset.i18n || heading?.textContent?.trim() || "";
}

function renderCrumb(id) {
  const crumb = $("crumbGroup");
  if (!crumb || !id) return;
  crumb.dataset.i18n = groupLabel(id);
  writeText(crumb, BcaI18n.t(groupLabel(id)));
}

function setNavGroup(id) {
  if (!id || id === navGroup) return;
  navGroup = id;
  for (const item of navItems) item.setAttribute("aria-current", String(item.dataset.group === id));
  renderCrumb(id);
}

// 顶栏是 sticky 的，scrollIntoView() 会把目标顶到视口最上面、正好被顶栏压住，
// 所以自己算偏移。这里用窗口滚动而不是容器滚动：将来正文改成内部滚动也不用改这段。
// 偏移量直接读 CSS 里那个 --topbar-h，顶栏一旦改高度，滚动留白和下面观察区用的
// rootMargin 会一起跟上，不会留下一个悄悄错位的魔数。
function topbarHeight() {
  const value = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--topbar-h"));
  return Number.isFinite(value) ? value : 56;
}

function observeGroups() {
  if (!cards.length) return;
  const observer = new IntersectionObserver((entries) => {
    // 只认「正在越过顶栏往下滚」的卡片，取最靠上的那一张当当前分组
    const visible = entries
      .filter((entry) => entry.isIntersecting)
      .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
    if (visible[0]) setNavGroup(visible[0].target.dataset.group);
  }, { rootMargin: `-${topbarHeight() + 32}px 0px -55% 0px`, threshold: 0 });
  for (const card of cards) observer.observe(card);
}

function scrollToTarget(element) {
  const offset = topbarHeight() + 32; // 顶栏高度 + 一点呼吸位
  const top = window.scrollY + element.getBoundingClientRect().top - offset;
  window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
}

function flashRow(row) {
  row.classList.add("row-flash");
  setTimeout(() => row.classList.remove("row-flash"), 1500);
}

// V1.5.4：挂件右键菜单的「宠物设置」用 settings.html#pet 打开本页，这里负责把那一组
// 滚进视口并高亮。hash 里的名字就是 <section data-group="..."> 的那个值，所以
// pet.js 里拼的 URL 和 settings.html 的 data-group 是一对，改一边就得改另一边。
// 高亮比搜索命中那一行长一点（2.6s）：搜索是「点完就在眼前」，这是**新开一个标签页**，
// 还要等加载 + 滚动动画，1.5s 太容易在用户看见之前就消失了。
function flashGroup(card) {
  card.classList.add("group-flash");
  setTimeout(() => card.classList.remove("group-flash"), 2600);
}

function focusGroupFromHash() {
  let name = "";
  try {
    name = decodeURIComponent(String(window.location.hash || "").replace(/^#/, ""));
  } catch (_) {
    name = "";
  }
  if (!name) return false;
  const card = cards.find((candidate) => candidate.dataset.group === name);
  if (!card) return false;
  // 先把导航与面包屑切过去：滚动动画要几百毫秒，不等 observer 自己发现
  setNavGroup(name);
  // 不用浏览器自带的锚点跳转（那个不躲顶栏），走搜索用的同一套偏移计算
  scrollToTarget(card);
  flashGroup(card);
  return true;
}

function focusRow(row) {
  // 先把输入框的焦点收掉：切换语言后 apply() 会重写所有 data-i18n 节点，
  // 焦点留在那里容易让人以为下拉还开着
  $("settingsSearch")?.blur();
  scrollToTarget(row);
  flashRow(row);
}

/* ------------------------------------------------------------------ *
 * 搜索：行标题 + 副说明做多词 AND 匹配
 * ------------------------------------------------------------------ */

const MAX_RESULTS = 8;
// 行与所在的卡片一次性建好索引：搜索每次按键都要比对全部行，
// 每次现查 closest() 太浪费，而且行的文字不会变（翻译改的是文本，索引跟着重建即可）
let searchRows = [];

function buildSearchIndex() {
  searchRows = [...document.querySelectorAll(".settings-main .setting-row")].map((row) => {
    const card = row.closest(".settings-card[data-group]");
    const group = card?.dataset.group || "";
    const title = row.querySelector(".setting-row-title")?.textContent?.replace(/\s+/g, " ").trim() || "";
    const desc = row.querySelector(".setting-row-desc")?.textContent?.replace(/\s+/g, " ").trim() || "";
    return { row, group, title, desc, haystack: `${title} ${desc} ${groupLabel(group)}`.toLocaleLowerCase() };
  }).filter((item) => item.title || item.desc);
}

// 多词 AND：每个词都要在这行的标题 / 副说明 / 分组名里出现过。
// 命中不止一条时按「相关度」排：标题命中 > 副说明命中，标题命中里再优先前缀命中 ——
// 搜「毛玻璃」时用户想找的是那一行的主开关，不是下面的强度滑块。
function matchRows(query) {
  const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const scored = [];
  searchRows.forEach((item, index) => {
    if (!words.every((word) => item.haystack.includes(word))) return;
    const title = item.title.toLocaleLowerCase();
    const score = words.every((word) => title.startsWith(word)) ? 0
      : words.every((word) => title.includes(word)) ? 1 : 2;
    scored.push({ item, score, index });
  });
  return scored
    .sort((a, b) => (a.score - b.score) || (a.index - b.index))
    .slice(0, MAX_RESULTS)
    .map((entry) => entry.item);
}

function renderSearchResults(query) {
  const box = $("searchResults");
  if (!box) return;
  if (!query.trim()) { box.hidden = true; box.replaceChildren(); return; }

  const matches = matchRows(query);
  box.replaceChildren();
  if (!matches.length) {
    const empty = document.createElement("p");
    empty.className = "search-none";
    writeText(empty, BcaI18n.t("没有找到相关的设置。"));
    box.append(empty);
  } else {
    for (const item of matches) {
      const hit = document.createElement("button");
      hit.type = "button";
      hit.className = "search-hit";
      hit.setAttribute("role", "option");
      const title = document.createElement("span");
      title.className = "search-hit-title";
      writeText(title, item.title);
      const group = document.createElement("span");
      group.className = "search-hit-group";
      writeText(group, groupLabel(item.group));
      hit.append(title, group);
      hit.addEventListener("click", () => {
        const input = $("settingsSearch");
        if (input) input.value = "";
        renderSearchResults("");
        focusRow(item.row);
      });
      box.append(hit);
    }
  }
  box.hidden = false;
}

function wireNav() {
  for (const item of navItems) {
    item.addEventListener("click", () => {
      const card = cards.find((candidate) => candidate.dataset.group === item.dataset.group);
      if (card) { setNavGroup(item.dataset.group); scrollToTarget(card); }
    });
  }
  // 键盘 / 触摸屏没有 hover：点击导航先标记当前分组，滚动后再由 observer 校正
  for (const item of cards) item.setAttribute("data-scroll-anchor", "1");
}

/* ------------------------------------------------------------------ *
 * 导入与导出 / 归档维护（1.9.0）
 *
 * 这几项原来是收藏库左上角的按钮（library.js）。搬到这里的原因：它们改的是「设置」
 * 或者维护动作，不是「看视频」；而且回收站要能一页一页地挑，塞不进收藏库的侧栏。
 *
 * 单一权威的切分：
 *   · 配置文件长什么样、哪些字段算个人内容 —— archive-core.js（buildConfigPayload /
 *     configPersonalFields），不再有第二份字面量；
 *   · 扫盘、回收站、把一条记录映射成界面卡片要的 video —— archive-tools.js；
 *   · 本文件只做「读设置 → 拼 payload → 写盘 / 反向套用」这些接线。
 * ------------------------------------------------------------------ */

const CONFIG_MAX_BYTES = 256 * 1024;
const CONFIG_PAGE_SIZES = [25, 50, 100];
const CONFIG_VIEW_MODES = ["grid", "list"];
const CONFIG_FILTER_SORTS = ["newest", "oldest", "title", "views"];
const CONFIG_FILTER_VIDEOS = ["all", "invalid", "downloaded"];

// 1.9.0：状态行只显示最近一次动作的结果，下一次动作直接覆盖 —— 不挂自动消失的定时器，
// 因为导入/导出都可能是「点完去倒杯水」的长度，回来时结果还在才算真的告诉过用户。
const transferRow = { status: "transferStatus", error: "transferError" };
const maintenanceRow = { status: "maintenanceStatus", error: "maintenanceError" };

function showRowMessage(row, text, isError = false) {
  const status = $(row.status);
  const error = $(row.error);
  if (isError) {
    writeText(status, "");
    setVisible(status, false);
    writeText(error, text);
    setVisible(error, Boolean(text));
    return;
  }
  writeText(error, "");
  setVisible(error, false);
  writeText(status, text);
  setVisible(status, Boolean(text));
}

function showTransferMessage(text, isError = false) {
  showRowMessage(transferRow, text, isError);
}

function flashTransfer(text, isError = false) {
  showTransferMessage(text, isError);
}

function showMaintenanceMessage(text, isError = false) {
  showRowMessage(maintenanceRow, text, isError);
}

// chrome.storage.local 在这几个页面上两种用法都见过（Promise / 回调），统一包一层，
// 免得某个测试桩只实现了一种就炸。失败一律当「没读到」，调用方有兜底。
function readStoredSettings(keys) {
  return new Promise((resolve) => {
    try {
      const result = chrome.storage.local.get(keys, (data) => resolve(data || {}));
      if (result && typeof result.then === "function") {
        result.then((data) => resolve(data || {})).catch(() => resolve({}));
      }
    } catch (_) {
      resolve({});
    }
  });
}

function writeStoredSettings(patch) {
  return new Promise((resolve, reject) => {
    try {
      const result = chrome.storage.local.set(patch, () => {
        const failure = chrome.runtime.lastError;
        if (failure) reject(new Error(failure.message));
        else resolve();
      });
      if (result && typeof result.then === "function") {
        result.then(() => resolve()).catch(reject);
      }
    } catch (error) {
      reject(error);
    }
  });
}

function humanTimestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function formatKilobytes(bytes) {
  return `${Math.max(1, Math.ceil(Number(bytes || 0) / 1024))} KB`;
}

/* 导出的偏好从「收藏库写在 storage 里的那一份」读，不猜 DOM：
   设置页没有「每页数量 / 视图模式」的控件，收藏库才是这些值的主人。 */
async function currentConfigPreferences() {
  const stored = await readStoredSettings(["libraryPageSize", "libraryViewMode", "collectionOrder", "libraryFilters"]);
  const filters = stored.libraryFilters && typeof stored.libraryFilters === "object" ? stored.libraryFilters : null;
  return {
    theme: BcaTheme.current(),
    locale: BcaI18n.locale(),
    pageSize: CONFIG_PAGE_SIZES.includes(stored.libraryPageSize) ? stored.libraryPageSize : 25,
    viewMode: CONFIG_VIEW_MODES.includes(stored.libraryViewMode) ? stored.libraryViewMode : "grid",
    collectionOrder: Array.isArray(stored.collectionOrder) ? stored.collectionOrder.filter((name) => typeof name === "string") : [],
    filters: filters
      ? {
          search: typeof filters.search === "string" ? filters.search : "",
          videoFilter: CONFIG_FILTER_VIDEOS.includes(filters.videoFilter) ? filters.videoFilter : "all",
          upFilter: typeof filters.upFilter === "string" ? filters.upFilter : "all",
          tagFilter: typeof filters.tagFilter === "string" ? filters.tagFilter : "all",
          sort: CONFIG_FILTER_SORTS.includes(filters.sort) ? filters.sort : "newest"
        }
      : null
  };
}

function configPersonalSummary(payload) {
  const fields = BcaArchiveCore.configPersonalFields(payload);
  const parts = [];
  if (fields.collections) {
    parts.push(BcaI18n.t("收藏夹顺序里的 {count} 个收藏夹名", { count: String(fields.collections) }));
  }
  if (fields.search) parts.push(BcaI18n.t("搜索关键词「{text}」", { text: fields.search }));
  if (fields.upFilter) parts.push(BcaI18n.t("UP 主筛选「{text}」", { text: fields.upFilter }));
  if (fields.tagFilter) parts.push(BcaI18n.t("标签筛选「{text}」", { text: fields.tagFilter }));
  return parts.join("、");
}

async function downloadConfigFile(includePersonal) {
  try {
    const preferences = await currentConfigPreferences();
    const payload = BcaArchiveCore.buildConfigPayload(preferences, { includePersonal });
    if (includePersonal) {
      const detail = configPersonalSummary(payload);
      if (detail) {
        const ok = window.confirm(BcaI18n.t("这份配置会带上你自己的内容：{detail}。发给别人就等于把这些一起公开。确定导出吗？", { detail }));
        if (!ok) return;
      }
    }
    const text = `\ufeff${JSON.stringify(payload, null, 2)}\n`;
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `bili-vault-config-${new Date().toISOString().slice(0, 10)}.json`;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
    const revokeTimer = setTimeout(() => URL.revokeObjectURL(url), 10000);
    window.addEventListener("pagehide", () => {
      clearTimeout(revokeTimer);
      URL.revokeObjectURL(url);
    }, { once: true });
    flashTransfer(BcaI18n.t(includePersonal ? "配置已导出（含收藏夹顺序与筛选）。" : "配置已导出（只含外观与档位）。"));
  } catch (error) {
    flashTransfer(BcaI18n.t("导出配置失败：{message}", { message: error?.message || BcaI18n.t("未知错误") }), true);
  }
}

/* 导入侧的封顶必须和导出侧一致（archive-core 的 normalizeConfigPreferences），
   否则「本机导出的文件在另一台机器上被判成非法」这种错会很难查。 */
function sanitizeImportedPreferences(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const filters = source.filters && typeof source.filters === "object" ? source.filters : null;
  return {
    theme: BcaTheme.isSupported(source.theme) ? source.theme : null,
    locale: BcaI18n.isSupported(source.locale) ? source.locale : null,
    pageSize: CONFIG_PAGE_SIZES.includes(source.pageSize) ? source.pageSize : null,
    viewMode: CONFIG_VIEW_MODES.includes(source.viewMode) ? source.viewMode : null,
    collectionOrder: Array.isArray(source.collectionOrder)
      ? source.collectionOrder.filter((name) => typeof name === "string").slice(0, 500).map((name) => BcaArchiveCore.sliceCodePoints(name, 120))
      : null,
    filters: filters
      ? {
          search: BcaArchiveCore.sliceCodePoints(filters.search, 200),
          videoFilter: CONFIG_FILTER_VIDEOS.includes(filters.videoFilter) ? filters.videoFilter : "all",
          upFilter: BcaArchiveCore.sliceCodePoints(filters.upFilter || "all", 120) || "all",
          tagFilter: BcaArchiveCore.sliceCodePoints(filters.tagFilter || "all", 120) || "all",
          sort: CONFIG_FILTER_SORTS.includes(filters.sort) ? filters.sort : "newest"
        }
      : null
  };
}

async function applyImportedPreferences(preferences) {
  if (preferences.theme) BcaTheme.use(preferences.theme);
  if (preferences.locale) {
    await BcaI18n.use(preferences.locale, { silent: true });
    applyTitle();
    renderLocaleOptions();
    buildSearchIndex();
  }
  const patch = {};
  if (preferences.pageSize) patch.libraryPageSize = preferences.pageSize;
  if (preferences.viewMode) patch.libraryViewMode = preferences.viewMode;
  if (preferences.collectionOrder) patch.collectionOrder = preferences.collectionOrder;
  // 筛选落回 libraryFilters：收藏库那边有 storage.onChanged 监听，导完不用重开收藏库。
  if (preferences.filters) patch.libraryFilters = preferences.filters;
  if (Object.keys(patch).length) await writeStoredSettings(patch);
  renderThemeOptions();
  renderLocaleOptions();
}

async function importConfigText(rawText) {
  const source = String(rawText || "");
  if (source.length > CONFIG_MAX_BYTES) {
    throw new Error(BcaI18n.t("这个配置文件有 {size}，超过了 {limit}，为了不把插件存储挤爆，没有导入。", {
      size: formatKilobytes(source.length),
      limit: formatKilobytes(CONFIG_MAX_BYTES)
    }));
  }
  let payload = null;
  try {
    payload = JSON.parse(source.replace(/^\uFEFF/, ""));
  } catch (_) {
    throw new Error(BcaI18n.t("这个文件不是合法的 JSON，无法导入。"));
  }
  if (!payload || payload.app !== BcaArchiveCore.CONFIG_APP_ID) {
    throw new Error(BcaI18n.t("这不是哔哩藏库导出的配置文件。"));
  }
  if (BcaArchiveCore.configHasPersonalData(payload)) {
    const ok = window.confirm(BcaI18n.t("这份配置里有你自己的内容（收藏夹顺序或筛选）。导入会覆盖本机的对应设置，确定导入吗？"));
    if (!ok) return false;
  }
  await applyImportedPreferences(sanitizeImportedPreferences(payload.preferences));
  return true;
}

async function handleConfigFileInput(input) {
  const file = input?.files?.[0];
  // 同一个文件连着选两次时 change 不会再触发，每次处理完都清掉。
  if (input) input.value = "";
  if (!file) return;
  try {
    const imported = await importConfigText(await file.text());
    if (imported) flashTransfer(BcaI18n.t("配置已导入。"));
  } catch (error) {
    flashTransfer(BcaI18n.t("导入配置失败：{message}", { message: error?.message || BcaI18n.t("未知错误") }), true);
  }
}

/* 归档元数据：只读扫盘 → archive-core 拼文档 + 校验和 → 写 004导出/。
   「数据库」只当 stale 对照，读不到不算失败（磁盘才是权威，1.7.30 的取舍）。 */
/* 后台正在导入时，归档目录也在被写：这时候扫出来的只是一半。
   闸门跟收藏库共用一把（storage.session 里的 archiveWriteLock，超过 30 分钟算陈旧）。 */
const ARCHIVE_WRITE_LOCK_KEY = "archiveWriteLock";
const ARCHIVE_WRITE_LOCK_MAX_AGE_MS = 30 * 60 * 1000;

async function importIsRunning() {
  try {
    const saved = await chrome.storage.session.get(ARCHIVE_WRITE_LOCK_KEY);
    const lock = saved?.[ARCHIVE_WRITE_LOCK_KEY];
    if (!lock || lock.kind !== "import") return false;
    return Date.now() - Number(lock.since || 0) < ARCHIVE_WRITE_LOCK_MAX_AGE_MS;
  } catch (_) {
    return false;
  }
}

async function exportArchiveMetadata() {
  try {
    const handle = await BcaArchiveTools.loadRootHandle();
    if (!handle) throw new Error(BcaI18n.t("先选一个本地备份文件夹，再导出归档元数据。"));
    const granted = await BcaArchiveTools.ensureRootPermission(handle, "readwrite");
    if (!granted) throw new Error(BcaI18n.t("没有获得本地备份文件夹的写入权限。"));
    if (await importIsRunning()) throw new Error(BcaI18n.t("导入正在跑，等它结束再试。"));
    showMaintenanceMessage(BcaI18n.t("正在导出归档元数据…"));
    const scan = await BcaArchiveTools.scanArchive(handle);
    const collections = scan.collections.map((collection) => ({
      name: collection.name,
      videos: collection.records.map(({ directory, record }) => BcaArchiveTools.recordToVideo(collection.name, { name: directory }, record))
    }));
    const videos = collections.flatMap((collection) => collection.videos);
    if (!videos.length) throw new Error(BcaI18n.t("收藏库里还没有记录。先点「刷新」读一遍，再导出。"));
    const statsCore = globalThis.BcaStatsCore;
    const seenKeys = new Set(statsCore ? videos.map((video) => statsCore.videoKey(video)).filter(Boolean) : []);
    let database = null;
    let databaseState = "missing";
    if (statsCore) {
      try {
        const databaseDirectory = await handle.getDirectoryHandle(statsCore.DATABASE_FOLDER_NAME);
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
        databaseState = BcaArchiveCore.isMissingError(error) ? "missing" : "unreadable";
      }
    }
    const built = BcaArchiveCore.buildArchiveExportDocument({
      collections,
      database,
      seenKeys,
      databaseState,
      generatedAt: new Date().toISOString(),
      appVersion: String(chrome?.runtime?.getManifest?.()?.version || "")
    });
    const exportDirectory = await handle.getDirectoryHandle(BcaArchiveCore.EXPORT_DIR_NAME, { create: true });
    // 同秒连点两次也不覆盖前一份：撞名就加 -2、-3。
    const baseName = BcaArchiveCore.exportFileName(new Date()).replace(/\.json$/, "");
    let fileName = `${baseName}.json`;
    for (let attempt = 2; attempt < 100; attempt += 1) {
      try {
        await exportDirectory.getFileHandle(fileName);
        fileName = `${baseName}-${attempt}.json`;
      } catch (error) {
        if (!BcaArchiveCore.isMissingError(error)) throw error;
        break;
      }
    }
    const exportFile = await exportDirectory.getFileHandle(fileName, { create: true });
    const writable = await exportFile.createWritable();
    await writable.write(built.text);
    await writable.close();
    // 004导出 只留最近 5 份（1.8.8 的门槛，10k 条一份约 8 MB）。清理失败不影响这次导出。
    try {
      const exportNames = [];
      for await (const entry of exportDirectory.values()) exportNames.push(entry.name);
      for (const name of BcaArchiveCore.exportPruneList(exportNames)) {
        try {
          await exportDirectory.removeEntry(name);
        } catch (error) {
          console.warn(`旧导出文件删不掉（留着不影响这次导出）：${name}`, error);
        }
      }
    } catch (error) {
      console.warn("清理旧导出文件失败（不影响这次导出）", error);
    }
    showMaintenanceMessage(BcaI18n.t("已导出 {count} 条记录到 {file}。", {
      count: BcaArchiveCore.formatCountText(built.payload.counts.records),
      file: fileName
    }));
  } catch (error) {
    showMaintenanceMessage(BcaI18n.t("导出归档元数据失败：{message}", { message: error?.message || BcaI18n.t("本地文件操作失败。") }), true);
  }
}

/* ------------------------------------------------------------------ *
 * 1.10.1（P1-6）：导出归档清单（Markdown）
 * 和「导出归档元数据」同一条路子：只读归档，只往 004导出/ 写一个 .md。
 * 正文不翻译 —— 清单是要贴进笔记软件给人看的文档，跟错误报告、视频信息.txt 一个口径。
 * ------------------------------------------------------------------ */
const markdownRow = { status: "exportMarkdownStatus", error: "exportMarkdownError" };

function showMarkdownMessage(text, isError = false) {
  showRowMessage(markdownRow, text, isError);
}

// 「还没选文件夹」「导入正在跑」这几种不是故障，是让用户照做的一句话；
// 它们不该被套上「导出清单失败：」的壳 —— 用户看到的应该就是下一步该做什么。
const INSTRUCTION_HINTS = [
  "先选一个本地备份文件夹，再导出清单。",
  "先选一个本地备份文件夹，再做完整度巡检。",
  "没有获得本地备份文件夹的写入权限。",
  "导入正在跑，等它结束再试。"
];

function isInstructionMessage(message) {
  return INSTRUCTION_HINTS.some((hint) => message === BcaI18n.t(hint));
}

async function exportMarkdownInventory() {
  const button = $("settingsExportMarkdown");
  if (button) button.disabled = true;
  try {
    const handle = await BcaArchiveTools.loadRootHandle();
    if (!handle) throw new Error(BcaI18n.t("先选一个本地备份文件夹，再导出清单。"));
    const granted = await BcaArchiveTools.ensureRootPermission(handle, "readwrite");
    if (!granted) throw new Error(BcaI18n.t("没有获得本地备份文件夹的写入权限。"));
    if (await importIsRunning()) throw new Error(BcaI18n.t("导入正在跑，等它结束再试。"));
    showMarkdownMessage(BcaI18n.t("正在读归档…"));
    const scan = await BcaArchiveTools.scanArchive(handle);
    const collections = scan.collections.map((collection) => ({
      name: collection.name,
      videos: collection.records.map(({ directory, record }) => (
        BcaArchiveTools.recordToVideo(collection.name, { name: directory }, record)
      ))
    }));
    const built = BcaArchiveCore.buildMarkdownInventory(collections, { generatedAt: humanTimestamp() });
    const exportDirectory = await handle.getDirectoryHandle(BcaArchiveCore.EXPORT_DIR_NAME, { create: true });
    // 同秒连点两次也不覆盖前一份：撞名就加 -2、-3。
    const baseName = BcaArchiveCore.markdownFileName(new Date()).replace(/\.md$/, "");
    let fileName = `${baseName}.md`;
    for (let attempt = 2; attempt < 100; attempt += 1) {
      try {
        await exportDirectory.getFileHandle(fileName);
        fileName = `${baseName}-${attempt}.md`;
      } catch (error) {
        if (!BcaArchiveCore.isMissingError(error)) throw error;
        break;
      }
    }
    const exportFile = await exportDirectory.getFileHandle(fileName, { create: true });
    const writable = await exportFile.createWritable();
    await writable.write(built.text);
    await writable.close();
    // 清单只留最近 5 份；清理失败不影响这次导出。
    try {
      const names = [];
      for await (const entry of exportDirectory.values()) names.push(entry.name);
      for (const name of BcaArchiveCore.markdownPruneList(names)) {
        try {
          await exportDirectory.removeEntry(name);
        } catch (error) {
          console.warn(`旧清单删不掉（留着不影响这次导出）：${name}`, error);
        }
      }
    } catch (error) {
      console.warn("清理旧清单失败（不影响这次导出）", error);
    }
    showMarkdownMessage(BcaI18n.t("已导出 {count} 条记录到 {file}。", {
      count: BcaArchiveCore.formatCountText(built.records),
      file: fileName
    }));
    return fileName;
  } catch (error) {
    const message = error?.message || BcaI18n.t("本地文件操作失败。");
    if (isInstructionMessage(message)) showMarkdownMessage(message);
    else showMarkdownMessage(BcaI18n.t("导出清单失败：{message}", { message }), true);
    return "";
  } finally {
    if (button) button.disabled = false;
  }
}

/* ------------------------------------------------------------------ *
 * 1.10.1（P1-5）：完整度巡检 + 就地补全
 * 巡检只读：scanArchive({ diagnostics: true }) 的判定在 archive-core.integritySummary()，
 * 这里只负责把它说成人话。补全不新写请求逻辑 —— 走「更新视频数据」那条队列
 * （bca-refresh-video-stats：每条一次请求、按后台限速跑、补完写回视频信息.txt），
 * 一批 20 条、一次最多 3 批，剩下的留给用户再点一次：一个按钮点下去在后台跑几千条
 * 请求不合适，而且用户得能随时停下。
 * ------------------------------------------------------------------ */
const integrityRow = { status: "integrityStatus", error: "integrityError" };
const INTEGRITY_FILL_BATCH = 20;
const INTEGRITY_FILL_BATCHES = 3;
let integrityFillable = [];

function showIntegrityMessage(text, isError = false) {
  showRowMessage(integrityRow, text, isError);
}

function integritySummaryText(summary) {
  return BcaI18n.t("扫完 {count} 条记录：{stats} 条缺互动数据、{cover} 条缺封面、{description} 条缺简介，读不出来的目录 {broken} 个。", {
    count: BcaArchiveCore.formatCountText(summary.records),
    stats: BcaArchiveCore.formatCountText(summary.missingStats),
    cover: BcaArchiveCore.formatCountText(summary.missingCover),
    description: BcaArchiveCore.formatCountText(summary.missingDescription),
    broken: BcaArchiveCore.formatCountText(summary.missingText + summary.brokenText + summary.tempFiles)
  });
}

// 「补全互动数据」按钮只在真的有东西可补时出现：没有可补的就别摆一个点了没反应的按钮。
function syncIntegrityFillButton() {
  const button = $("fillMissingStats");
  if (!button) return;
  button.hidden = integrityFillable.length === 0;
  if (!button.hidden) {
    button.title = BcaI18n.t("缺互动数据的 {count} 条会分批补，一次最多 {batch} 条。", {
      count: BcaArchiveCore.formatCountText(integrityFillable.length),
      batch: BcaArchiveCore.formatCountText(INTEGRITY_FILL_BATCH * INTEGRITY_FILL_BATCHES)
    });
  }
}

async function scanIntegrity(options = {}) {
  const button = $("runIntegrityCheck");
  if (button) button.disabled = true;
  try {
    const handle = await BcaArchiveTools.loadRootHandle();
    if (!handle) throw new Error(BcaI18n.t("先选一个本地备份文件夹，再做完整度巡检。"));
    const granted = await BcaArchiveTools.ensureRootPermission(handle, "readwrite");
    if (!granted) throw new Error(BcaI18n.t("没有获得本地备份文件夹的写入权限。"));
    if (await importIsRunning()) throw new Error(BcaI18n.t("导入正在跑，等它结束再试。"));
    if (!options.silent) showIntegrityMessage(BcaI18n.t("正在读归档…"));
    const scan = await BcaArchiveTools.scanArchive(handle, { diagnostics: true });
    const collections = scan.collections.map((collection) => ({
      name: collection.name,
      videos: collection.records.map(({ directory, record }) => (
        BcaArchiveTools.recordToVideo(collection.name, { name: directory }, record)
      ))
    }));
    const summary = BcaArchiveCore.integritySummary({ collections, diagnostics: scan.diagnostics });
    integrityFillable = summary.fillable;
    syncIntegrityFillButton();
    if (!options.silent) showIntegrityMessage(integritySummaryText(summary));
    return summary;
  } catch (error) {
    integrityFillable = [];
    syncIntegrityFillButton();
    if (!options.silent) {
      const message = error?.message || BcaI18n.t("本地文件操作失败。");
      if (isInstructionMessage(message)) showIntegrityMessage(message);
      else showIntegrityMessage(BcaI18n.t("完整度巡检失败：{message}", { message }), true);
    }
    return null;
  } finally {
    if (button) button.disabled = false;
  }
}

async function fillMissingStats() {
  if (!integrityFillable.length) {
    showIntegrityMessage(BcaI18n.t("没有缺互动数据的记录，不用补。"));
    return { updated: 0, failed: 0, remaining: 0 };
  }
  const button = $("fillMissingStats");
  const batchSize = INTEGRITY_FILL_BATCH * INTEGRITY_FILL_BATCHES;
  const picked = integrityFillable.slice(0, batchSize);
  if (button) button.disabled = true;
  let updated = 0;
  let failed = 0;
  try {
    for (let index = 0; index < picked.length; index += INTEGRITY_FILL_BATCH) {
      const batch = picked.slice(index, index + INTEGRITY_FILL_BATCH);
      showIntegrityMessage(BcaI18n.t("正在补互动数据：第 {done}/{total} 条…", {
        done: BcaArchiveCore.formatCountText(index),
        total: BcaArchiveCore.formatCountText(picked.length)
      }));
      const response = await new Promise((resolve) => {
        const timer = window.setTimeout(() => resolve({ ok: false, reason: "timeout" }), 120000);
        try {
          chrome.runtime.sendMessage({
            type: "bca-refresh-video-stats",
            targets: batch.map((video) => ({ collection: video.collection, directory: video.directory })),
            limit: batch.length
          }, (reply) => {
            window.clearTimeout(timer);
            resolve(reply || { ok: false, reason: "no-response" });
          });
        } catch (error) {
          window.clearTimeout(timer);
          resolve({ ok: false, reason: "no-runtime" });
        }
      });
      if (response && response.ok) {
        updated += Number(response.updated) || 0;
        failed += Number(response.failed) || 0;
      } else {
        // 一批失败就把这一批整批算失败：不假装它们补上了。
        failed += batch.length;
        if (response && (response.reason === "no-runtime" || response.reason === "no-response")) break;
      }
    }
    const after = await scanIntegrity({ silent: true });
    const remaining = after ? after.missingStats : Math.max(0, integrityFillable.length);
    if (!after) {
      integrityFillable = [];
      syncIntegrityFillButton();
    }
    if (failed) {
      showIntegrityMessage(BcaI18n.t("补了 {updated} 条，{failed} 条没补上；现在还剩 {remaining} 条缺互动数据。", {
        updated: BcaArchiveCore.formatCountText(updated),
        failed: BcaArchiveCore.formatCountText(failed),
        remaining: BcaArchiveCore.formatCountText(remaining)
      }), true);
    } else {
      showIntegrityMessage(BcaI18n.t("补了 {updated} 条；现在还剩 {remaining} 条缺互动数据。", {
        updated: BcaArchiveCore.formatCountText(updated),
        remaining: BcaArchiveCore.formatCountText(remaining)
      }));
    }
    return { updated, failed, remaining };
  } catch (error) {
    showIntegrityMessage(BcaI18n.t("补互动数据失败：{message}", { message: error?.message || BcaI18n.t("本地文件操作失败。") }), true);
    return { updated, failed, remaining: integrityFillable.length };
  } finally {
    if (button) button.disabled = false;
    syncIntegrityFillButton();
  }
}

/* 归档体检：只读扫一遍，把「扫描时被悄悄跳过的东西」写成 Markdown。
   报告的小节与措辞和收藏库时代一致 —— 两份格式必须能互相替代，用户手里的旧报告还得看得懂。 */
async function writeHealthReport() {
  try {
    const handle = await BcaArchiveTools.loadRootHandle();
    if (!handle) throw new Error(BcaI18n.t("先选择本地备份文件夹，再做归档体检。"));
    const granted = await BcaArchiveTools.ensureRootPermission(handle, "readwrite");
    if (!granted) throw new Error(BcaI18n.t("没有获得本地备份文件夹的写入权限。"));
    if (await importIsRunning()) throw new Error(BcaI18n.t("导入正在跑，等它结束再试。"));
    showMaintenanceMessage(BcaI18n.t("正在做归档体检：重新读一遍归档…"));
    const result = await BcaArchiveTools.scanArchive(handle, { diagnostics: true });
    const diagnostics = result.diagnostics || { missingText: [], missingCover: [], brokenText: [], tempFiles: [] };
    const videos = result.collections.flatMap((collection) => collection.records.map(({ directory, record }) => (
      BcaArchiveTools.recordToVideo(collection.name, { name: directory }, record)
    )));
    const invalid = videos.filter((video) => video.isInvalid);
    const unknownIds = videos.filter((video) => (!video.bvid || video.bvid === "未知") && (!video.aid || video.aid === "未知"));
    const problems = result.issues.length + result.unfinished.length + diagnostics.missingText.length
      + diagnostics.missingCover.length + diagnostics.brokenText.length + result.longNames.length + diagnostics.tempFiles.length;
    const lines = [
      `# ${BcaI18n.t("归档体检报告")}`,
      "",
      `- ${BcaI18n.t("生成时间")}：${humanTimestamp()}`,
      `- ${BcaI18n.t("本地备份文件夹")}：${handle.name}`,
      `- ${BcaI18n.t("收藏夹")}：${result.collections.length}`,
      `- ${BcaI18n.t("归档记录")}：${videos.length}`,
      `- ${BcaI18n.t("估算占用")}：${BcaArchiveTools.formatMegabytes(result.bytes)}`,
      `- ${BcaI18n.t("已失效视频")}：${invalid.length}`,
      `- ${BcaI18n.t("认不出 BV/av 号的记录")}：${unknownIds.length}`,
      "",
      `## ${BcaI18n.t("需要看一眼")}（${problems}）`,
      "",
      `### ${BcaI18n.t("读不出来的目录（{count}）", { count: result.issues.length })}`,
      ...BcaArchiveTools.reportListLine(result.issues),
      "",
      `### ${BcaI18n.t("没写完的目录（{count}）", { count: result.unfinished.length })}`,
      `> ${BcaI18n.t("没有 视频信息.txt，多半是上次导入被打断；可点扫描提示条上的「清理这些没写完的目录」。")}`,
      ...BcaArchiveTools.reportListLine(result.unfinished),
      "",
      `### ${BcaI18n.t("有 视频信息.txt 但缺封面的目录（{count}）", { count: diagnostics.missingCover.length })}`,
      ...BcaArchiveTools.reportListLine(diagnostics.missingCover),
      "",
      `### ${BcaI18n.t("视频信息.txt 缺【基本信息】或标题（{count}）", { count: diagnostics.brokenText.length })}`,
      ...BcaArchiveTools.reportListLine(diagnostics.brokenText),
      "",
      `### ${BcaI18n.t("只有骨架、还没有 视频信息.txt 的目录（{count}）", { count: diagnostics.missingText.length })}`,
      ...BcaArchiveTools.reportListLine(diagnostics.missingText),
      "",
      `### ${BcaI18n.t("目录名太长（{count}）", { count: result.longNames.length })}`,
      `> ${BcaI18n.t("收藏夹 / 记录目录合起来超过 168 字符时，Windows 上再拼文件名可能超 260 的上限。")}`,
      ...BcaArchiveTools.reportListLine(result.longNames),
      "",
      `### ${BcaI18n.t("写盘留下的临时文件（{count}）", { count: diagnostics.tempFiles.length })}`,
      `> ${BcaI18n.t("点号开头的 .tmp 是覆盖写盘时的中间件，正常会在写完后换名；留在这里说明那次写入没走完。")}`,
      ...BcaArchiveTools.reportListLine(diagnostics.tempFiles),
      "",
      `## ${BcaI18n.t("结论")}`,
      problems
        ? `- ${BcaI18n.t("共 {count} 项需要处理，见上面各节。", { count: problems })}`
        : `- ${BcaI18n.t("没发现需要处理的问题。")}`,
      ""
    ];
    const name = `体检-${BcaArchiveTools.recycleStamp()}.md`;
    const directory = await BcaArchiveTools.subdirectoryHandle(handle, BcaArchiveTools.HEALTH_DIR_NAME);
    const fileHandle = await directory.getFileHandle(name, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(lines.join("\r\n"));
    await writable.close();
    const path = `${BcaArchiveTools.HEALTH_DIR_NAME}/${name}`;
    showMaintenanceMessage(BcaI18n.t("报告写在 {path}。需要看一眼的地方有 {count} 处，明细都在报告里。", {
      path,
      count: problems
    }), problems > 0);
  } catch (error) {
    showMaintenanceMessage(BcaI18n.t("归档体检失败：{message}", { message: error?.message || BcaI18n.t("本地文件操作失败。") }), true);
  }
}

function openRecyclePage() {
  try {
    chrome.tabs.create({ url: chrome.runtime.getURL("recycle.html") });
  } catch (error) {
    showMaintenanceMessage(BcaI18n.t("打不开回收站页：{message}", { message: error?.message || BcaI18n.t("未知错误") }), true);
  }
}

/* ------------------------------------------------------------------ *
 * 1.10.0（TODO P0-1）：重建统计库
 * ------------------------------------------------------------------ */

const rebuildStatsRow = { status: "rebuildStatsStatus", error: "rebuildStatsError" };

function showRebuildStatsMessage(text, isError = false) {
  showRowMessage(rebuildStatsRow, text, isError);
}

// 后台把「为什么没写成」编成码回来，这里翻成人话（和统计页那条「重新读取统计库」同一套码）。
function rebuildStatsFailureText(response) {
  const reason = (response && response.reason) || "unknown";
  if (reason === "no-root" || reason === "no-permission") return BcaI18n.t("还没有选择本地备份文件夹，先在收藏库里选一次。");
  if (reason === "unreadable") return BcaI18n.t("统计库这次读不出来，稍后再试。");
  if (reason === "write-failed" || reason === "bad-payload") return BcaI18n.t("写统计库失败，稍后再试。");
  if (reason === "timeout" || reason === "no-response" || reason === "no-runtime") return BcaI18n.t("后台没有回应，稍后再试。");
  return BcaI18n.t("重建统计库失败：{message}", { message: reason });
}

/* 按本地归档把统计库整个重算一遍。
   取根与扫盘完全照 exportArchiveMetadata 那条路：只读归档，写盘只碰 003database。
   真正的写库交给后台（bca-stats-commit + stampBackup）—— 页面只做「读 + 构建」，
   ARCHITECTURE 里「统计库只有一个写者」那条不破。
   previous 故意不传：后台 commit 会再套一次 applyStatsMirror，
   firstSeenAt / 累计保存 / 亲密度不会因为这次重建被归零。 */
async function rebuildStatsDatabase() {
  try {
    const statsCore = globalThis.BcaStatsCore;
    if (!statsCore) throw new Error(BcaI18n.t("统计模块没加载出来，刷新这一页再试。"));
    const handle = await BcaArchiveTools.loadRootHandle();
    if (!handle) throw new Error(BcaI18n.t("先选择本地备份文件夹，再重建统计库。"));
    const granted = await BcaArchiveTools.ensureRootPermission(handle, "readwrite");
    if (!granted) throw new Error(BcaI18n.t("没有获得本地备份文件夹的写入权限。"));
    if (await importIsRunning()) throw new Error(BcaI18n.t("导入正在跑，等它结束再试。"));
    // 重建会按归档里数出来的条数覆盖「总数」这类累计数字，属于不可逆的覆盖 —— 先问一句。
    const confirmed = window.confirm(BcaI18n.t("会按本地归档重算统计库（总数、每日新增、收藏夹排行、宠物记录），并把现在这份库另存成一份带时间戳的副本。视频文件夹一个都不动。要开始吗？"));
    if (!confirmed) return false;
    showRebuildStatsMessage(BcaI18n.t("正在读归档…"));
    const scan = await BcaArchiveTools.scanArchive(handle);
    const videos = scan.collections.flatMap((collection) => collection.records.map(({ directory, record }) => (
      BcaArchiveTools.recordToVideo(collection.name, { name: directory }, record)
    )));
    showRebuildStatsMessage(BcaI18n.t("正在重建统计库…"));
    const database = statsCore.databaseFromVideos(videos, {});
    const response = await new Promise((resolve) => {
      // 后台在扩展重载的瞬间可能收不到回调：别让按钮和状态行一直停着
      const timer = window.setTimeout(() => resolve({ ok: false, reason: "timeout" }), 15000);
      try {
        chrome.runtime.sendMessage({ type: "bca-stats-commit", database, stampBackup: true }, (reply) => {
          window.clearTimeout(timer);
          void chrome.runtime.lastError;
          resolve(reply || { ok: false, reason: "no-response" });
        });
      } catch (_) {
        window.clearTimeout(timer);
        resolve({ ok: false, reason: "no-runtime" });
      }
    });
    if (!response || !response.ok) throw new Error(rebuildStatsFailureText(response));
    const count = BcaArchiveCore.formatCountText(videos.length);
    showRebuildStatsMessage(response.backup
      ? BcaI18n.t("已按归档重建统计库：{count} 条记录；现在这份库已另存为 {backup}。", { count, backup: response.backup })
      : BcaI18n.t("已按归档重建统计库：{count} 条记录。", { count }));
    return true;
  } catch (error) {
    showRebuildStatsMessage(error?.message || BcaI18n.t("重建统计库失败。"), true);
    return false;
  }
}

/* ------------------------------------------------------------------ *
 * 1.10.0（TODO P0-3）：最近出错 + 复制诊断信息
 * ------------------------------------------------------------------ */

// 最近失败记录由后台 rememberFailureEntry() 写（最多 3 条，新的在前），这里只读不改。
function recentFailureItems(data) {
  const list = Array.isArray(data?.recentFailures) ? data.recentFailures : [];
  return list.filter((item) => item && typeof item === "object" && typeof item.summary === "string");
}

function recentFailureLine(item, index) {
  const at = Number(item.at) || Date.now();
  return `${index + 1}. ${String(item.operation || BcaI18n.t("未知操作"))}（${humanTimestamp(new Date(at))}）：${String(item.summary || "")}`;
}

async function renderRecentErrors() {
  const data = await readStoredSettings(["recentFailures"]);
  const items = recentFailureItems(data);
  const list = $("recentErrorList");
  const status = $("recentErrorStatus");
  if (!items.length) {
    if (list) list.replaceChildren();
    setVisible(list, false);
    writeText(status, BcaI18n.t("最近没有记录到失败。"));
    setVisible(status, true);
    return items;
  }
  if (list) {
    list.replaceChildren();
    for (const item of items) {
      const row = document.createElement("li");
      row.className = "recent-error-item";
      const head = document.createElement("div");
      head.className = "recent-error-head";
      const operation = document.createElement("span");
      operation.className = "recent-error-operation";
      writeText(operation, String(item.operation || BcaI18n.t("未知操作")));
      const time = document.createElement("span");
      time.className = "recent-error-time";
      writeText(time, humanTimestamp(new Date(Number(item.at) || Date.now())));
      head.append(operation, time);
      const summary = document.createElement("p");
      summary.className = "recent-error-summary";
      writeText(summary, String(item.summary || ""));
      row.append(head, summary);
      list.append(row);
    }
  }
  setVisible(list, true);
  writeText(status, "");
  setVisible(status, false);
  return items;
}

/* 「复制诊断信息」：版本 + 库记录数 + 三条摘要。
   摘要由后台入库前就打码（maskLocalUserPaths），这里不再加工；
   路径这件事宁可漏打也不能重复打 —— 打两次会把相对标签也吃掉。 */
async function copyDiagnostics() {
  const data = await readStoredSettings(["recentFailures", "bcaStats"]);
  const items = recentFailureItems(data);
  const stats = data?.bcaStats && typeof data.bcaStats === "object" ? data.bcaStats : {};
  const version = String(chrome?.runtime?.getManifest?.()?.version || "").trim();
  const lines = [
    `${BcaI18n.t("哔哩藏库 · 诊断信息")}`,
    `${BcaI18n.t("插件版本")}：${version || "-"}`,
    `${BcaI18n.t("界面语言")}：${BcaI18n.locale()}`,
    `${BcaI18n.t("归档记录")}：${Number(stats.videos) || 0}`,
    `${BcaI18n.t("收藏夹")}：${Number(stats.collections) || 0}`,
    `${BcaI18n.t("最近出错")}（${items.length}）：`
  ];
  if (!items.length) lines.push(BcaI18n.t("最近没有记录到失败。"));
  else items.forEach((item, index) => lines.push(recentFailureLine(item, index)));
  const text = lines.join("\n");
  try {
    await navigator.clipboard.writeText(text);
    writeText($("recentErrorStatus"), BcaI18n.t("已复制，可以直接贴出来。"));
    setVisible($("recentErrorStatus"), true);
  } catch (_) {
    // 剪贴板被拒（页面不在前台）时退回「让用户自己复制」，不能只报一句失败
    window.prompt(BcaI18n.t("复制失败，请手动选中下面的文字："), text);
  }
  return text;
}

function wireTransferAndMaintenance() {
  $("settingsExportConfig")?.addEventListener("click", () => { downloadConfigFile(true); });
  $("settingsExportConfigSlim")?.addEventListener("click", () => { downloadConfigFile(false); });
  $("settingsImportConfig")?.addEventListener("click", () => {
    const input = $("settingsConfigFileInput");
    if (input) input.click();
  });
  $("settingsConfigFileInput")?.addEventListener("change", () => { handleConfigFileInput($("settingsConfigFileInput")); });
  $("settingsExportMarkdown")?.addEventListener("click", () => {
    exportMarkdownInventory();
  });

  $("runIntegrityCheck")?.addEventListener("click", () => {
    scanIntegrity();
  });

  $("fillMissingStats")?.addEventListener("click", () => {
    fillMissingStats();
  });

  $("settingsExportArchive")?.addEventListener("click", () => { exportArchiveMetadata(); });
  $("settingsHealthCheck")?.addEventListener("click", () => { writeHealthReport(); });
  $("settingsOpenRecycle")?.addEventListener("click", openRecyclePage);
  // 1.10.0：统计库随时能重建；「最近出错」随时能刷新、能复制诊断信息。
  $("rebuildStats")?.addEventListener("click", () => { rebuildStatsDatabase(); });
  $("refreshRecentErrors")?.addEventListener("click", () => { renderRecentErrors(); });
  $("copyDiagnostics")?.addEventListener("click", () => { copyDiagnostics(); });
}

// 供 pages.test 直接驱动（收藏库时代的测试调的是 importConfigFromText，搬家后名字保持一致）。
globalThis.BcaSettingsTransfer = Object.freeze({
  importConfigText,
  downloadConfigFile,
  currentConfigPreferences,
  exportArchiveMetadata,
  exportMarkdownInventory,
  scanIntegrity,
  fillMissingStats,
  writeHealthReport,
  rebuildStatsDatabase,
  renderRecentErrors,
  copyDiagnostics
});

wireTransferAndMaintenance();

/* ------------------------------------------------------------------ *
 * 启动
 * ------------------------------------------------------------------ */

async function boot() {
  await BcaI18n.init().catch(() => {});
  applyTitle();
  renderThemeOptions();
  renderLocaleOptions();
  buildSearchIndex();
  observeGroups();
  wireNav();
  // 带 #pet 打开（挂件右键菜单的「宠物设置」）就直接落到那一组；认不出的 hash 什么都不做。
  focusGroupFromHash();
  // 页面已经开着时再点一次「宠物设置」（#pet 重复跳过来）交给浏览器自己处理：
  // chrome.tabs.create 每次都是新标签页，这里补一条 hashchange 只是顺手。
  window.addEventListener("hashchange", focusGroupFromHash);

  // 主题：BcaTheme.use 自己会写 localStorage、镜像到 chrome.storage 并通知监听者，
  // 别的页面改主题时 theme.js 的 storage 事件也会走到这里，所以只挂一个 onChange 就够
  BcaTheme.onChange(renderThemeOptions);
  for (const button of themeButtons) {
    button.addEventListener("click", () => BcaTheme.use(button.dataset.themeValue));
  }

  BcaTheme.onAppearanceChange(renderAppearance);

  // 背景图是异步的（IndexedDB），启动时先读一次，决定按钮文案与「移除」是否出现
  refreshWallpaperState();

  $("wallpaperChoose")?.addEventListener("click", () => $("wallpaperFile")?.click());
  const fileInput = $("wallpaperFile");
  fileInput?.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    // 同一个文件连选两次时 change 不会再触发，所以每次处理完都把选择清掉
    fileInput.value = "";
    if (file) selectWallpaperFile(file);
  });
  $("wallpaperRemove")?.addEventListener("click", () => {
    // 1.7.9（ux P2-4）：先问一句。移除是「删掉存着的那张图」，本地原图要是已经不在，
    // 就再也回不到这张背景了 —— 这种不可逆操作不能点一下就算。
    // 用原生 confirm 而不是自建对话框：设置页没有对话框组件（收藏库那套在 library.js 里，
    // 两边是各自独立的页面），为一句确认搬一整套 DOM + 焦点管理不划算。
    if (!window.confirm(BcaI18n.t("移除后要重新选图才能恢复，确定移除背景图片吗？"))) return;
    clearWallpaperError();
    clearWallpaperStatus();
    Promise.resolve(BcaTheme.clearWallpaper())
      .then(() => {
        refreshWallpaperState();
        showWallpaperStatus("背景图已移除");
      })
      .catch(() => showWallpaperError("浏览器不让存背景图片，可能是空间不够。"));
  });

  // 1.7.11（facet-privacy P2-3）：缓存的 B 站 UID 要有一个能反悔的入口
  $("forgetUid")?.addEventListener("click", () => { forgetRememberedUid(); });
  $("copyNativeCleanup")?.addEventListener("click", () => { copyNativeCleanupCommand(); });

  // 滑块要「拖着就生效」，所以监听 input 而不是 change（change 要等松手）
  // 1.8.12：滑杆是 input 事件逐帧来的。以前每帧都写一次 localStorage + chrome.storage，
  // 别的扩展页收到 storage 事件就整页重绘毛玻璃 —— 低端机上拖一下就掉帧。
  // 现在攒 120ms 合并写一次；松手（change）立刻落最后一次，不会「拖到 60% 松手却停在 55%」。
  const APPEARANCE_WRITE_DELAY_MS = 120;
  let appearanceWriteTimer = 0;
  let pendingAppearance = null;
  function flushAppearanceWrite() {
    if (appearanceWriteTimer) {
      clearTimeout(appearanceWriteTimer);
      appearanceWriteTimer = 0;
    }
    if (!pendingAppearance) return;
    const patch = pendingAppearance;
    pendingAppearance = null;
    BcaTheme.setAppearance(patch);
  }
  function scheduleAppearanceWrite(patch) {
    pendingAppearance = Object.assign(pendingAppearance || {}, patch);
    if (appearanceWriteTimer) return;
    appearanceWriteTimer = setTimeout(flushAppearanceWrite, APPEARANCE_WRITE_DELAY_MS);
  }

  const sliders = [
    ["wallpaperVeil", "veil", formatPercent],
    ["wallpaperBlur", "blur", formatPx],
    ["glassBlur", "glassBlur", formatPx]
  ];
  for (const [id, key, format] of sliders) {
    $(id)?.addEventListener("input", (event) => {
      const value = Number(event.target.value);
      // 拖动中先攒着，数值文本仍然是即时的（用户看的是这一行）
      scheduleAppearanceWrite({ [key]: value });
      // setAppearance 会通知 renderAppearance，本行的数值文本在那边一起更新
      writeText($(`${id}Value`), format(value));
    });
    // 松手（键盘松开 / 点击轨道）立刻落最后一次，别让节流吞掉终点值
    $(id)?.addEventListener("change", flushAppearanceWrite);
  }

  $("glassToggle")?.addEventListener("click", () => {
    BcaTheme.setAppearance({ glass: !BcaTheme.appearance().glass });
  });

  // 1.5.0：数据统计页（与设置页一样是新标签页，随时能关回来）
  $("openStats")?.addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("stats.html") });
  });

  // 1.5.2：宠物挂件。挂件自己监听 chrome.storage.local.interfacePet（见 pet.js），
  // 这里只写状态、不需要额外信号；缺省视为开启，与挂件那边的判断保持一致。
  //
  // interfacePet 从 1.5.2 起是个对象：{ enabled, size, x, y, paused }。设置页只改
  // enabled 与 size 两项，x / y / paused 由挂件自己维护 —— 所以下面每次写盘都是
  // 「读现有的、合上自己那一项、整份写回」，绝不能整份覆盖：覆盖会把位置和
  // 「暂停走动」一起抹掉。缺字段的旧数据也要能读（size 缺失就按默认档）。
  //
  // V1.5.4：默认档 144 → 96。三处必须一致：pet.js 的 SIZE_DEFAULT、这里的
  // PET_SIZE_DEFAULT、pet.css 里 --bca-pet-size 的初值（选项表本来就是同一份）。
  const PET_SIZE_DEFAULT = 96;
  const PET_SIZE_OPTIONS = [96, 144, 192, 240];

  // 写盘前比较（V1.5.4「144 和 96 之间疯狂闪动」的另一半）：值没变就一个字节都不写。
  // 同一个档位点第二下、位置本来就在默认位，都不该产生一次 chrome.storage 写入 ——
  // 每一次写入都会在挂件那边触发 onChanged（写入方自己的页面里也会触发）。
  function petConfigEquals(current, next) {
    for (const key of Object.keys(next)) {
      // size 可能以数字 / 字符串两种形态存着，比数值；其余字段直接比
      if (key === "size") {
        if (Number(current[key]) !== Number(next[key])) return false;
      } else if (current[key] !== next[key]) {
        return false;
      }
    }
    return true;
  }

  const petToggle = $("petToggle");
  const petSizeButtons = [...document.querySelectorAll("#petSizeGroup button[data-pet-size]")];

  function renderPetToggle(enabled) {
    if (!petToggle) return;
    petToggle.setAttribute("aria-pressed", String(Boolean(enabled)));
    petToggle.classList.toggle("off", !enabled);
  }

  function renderPetSizes(size) {
    for (const button of petSizeButtons) {
      button.setAttribute("aria-pressed", String(Number(button.dataset.petSize) === size));
    }
  }

  function applyPetConfig(raw) {
    const config = raw && typeof raw === "object" ? raw : {};
    renderPetToggle(config.enabled !== false);
    const size = PET_SIZE_OPTIONS.indexOf(Number(config.size)) >= 0 ? Number(config.size) : PET_SIZE_DEFAULT;
    renderPetSizes(size);
  }

  // V1.5.3 修：这里原来定义的是 `writePetConfig(patch)`，而三个调用点写的是
  // `patchPetConfig(updater)` —— 名字对不上，`patchPetConfig` 在文件里根本没有定义。
  // 后果：设置页的「宠物开关 / 尺寸档 / 重置位置」一点就抛 ReferenceError，三项全写不进去
  // （这也是「大小、位置刷新后不保持」的一个成因）。现在统一成回调式：先把现存的整份读出来，
  // 交给调用方改它那一项，再整份写回 —— 位置 / 尺寸 / 暂停走动原样带过去，绝不整份覆盖。
  function patchPetConfig(updater) {
    return chrome.storage.local.get("interfacePet")
      .catch(() => ({}))
      .then((stored) => {
        const current = stored && typeof stored.interfacePet === "object" ? stored.interfacePet : {};
        return updater(current);
      })
      .catch(() => {});
  }

  chrome.storage.local.get("interfacePet")
    .then((stored) => applyPetConfig(stored?.interfacePet))
    .catch(() => applyPetConfig(null));

  petToggle?.addEventListener("click", () => {
    const enabled = petToggle.getAttribute("aria-pressed") !== "true";
    renderPetToggle(enabled);
    // 1.5.9：只写一次盘，而且必须是「读现有的 → 合上自己这一项 → 整份写回」。
    // 原来先按老形状 set({ interfacePet: { enabled } }) 再 set 整份：第一写会把
    // size / x / y / paused 一起抹掉，挂件当场按默认 96 重排（在 96 与 144 之间闪一下，
    // 位置还被挪回屏幕水平正中）。与下面的尺寸档/重置位置保持同一套写法。
    patchPetConfig((current) => {
      const next = Object.assign({}, current, { enabled });
      if (petConfigEquals(current, next)) return undefined; // 值没变 = 不写盘
      return chrome.storage.local.set({ interfacePet: next });
    });
  });

  // 尺寸档与挂件右键菜单是同一份状态：两边都改 x / y / paused 之外的那一项
  for (const button of petSizeButtons) {
    button.addEventListener("click", () => {
      const size = Number(button.dataset.petSize);
      renderPetSizes(size);
      // 换档以后挂件会按新尺寸把位置夹回视口内，所以不用在这里动 x / y
      patchPetConfig((current) => {
        const next = Object.assign({}, current, { size });
        if (petConfigEquals(current, next)) return undefined; // 点的就是当前档 = 不写
        return chrome.storage.local.set({ interfacePet: next });
      });
    });
  }

  $("petResetPosition")?.addEventListener("click", () => {
    // x = 0 才是停靠位（右下角），y 置 null = 交回挂件自己算默认高度
    // （不写死，免得换尺寸档之后对不上）
    patchPetConfig((current) => {
      const next = Object.assign({}, current, { x: 0, y: null });
      if (petConfigEquals(current, next)) return undefined; // 已经在默认位 = 不写
      return chrome.storage.local.set({ interfacePet: next });
    });
  });

  const search = $("settingsSearch");
  search?.addEventListener("input", (event) => renderSearchResults(event.target.value));
  // 点结果之前会先 blur，所以这里不能用 blur 收起下拉，只能点空白处收
  search?.addEventListener("keydown", (event) => { if (event.key === "Escape") { search.value = ""; renderSearchResults(""); } });
  // 1.7.9（ux P2-7）：收藏库那边 Ctrl/⌘+K 能聚焦搜索框，设置页也有搜索框却不认这个键 ——
  //   同一个插件里同一个快捷键两种行为，用户只能靠猜。这里补齐；提示用的 <kbd> 在 settings.html
  //   的 .settings-search 里，快捷键语义由 input 的 aria-keyshortcuts 表达。
  document.addEventListener("keydown", (event) => {
    if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k") return;
    if (!search) return;
    event.preventDefault();
    search.focus();
    search.select();
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest?.(".settings-search")) renderSearchResults("");
  });

  // 1.10.0（TODO P0-3）：启动时把「最近出错」面板填上（i18n 已就绪，文案才是当前语言）
  renderRecentErrors().catch(() => {});

  BcaI18n.onChange(() => {
    applyTitle();
    renderLocaleOptions();
    // 翻译换了一批文字，行的索引与面包屑都要跟着重建，否则搜索还是按旧语言匹配
    buildSearchIndex();
    renderCrumb(navGroup);
    renderAppearance();
    // 1.10.0：面板里的操作名与状态行也是算出来的，换语言要重画一次
    renderRecentErrors();
    // 正在报的错也要换成当前语言（它没挂 data-i18n，apply() 管不到）
    if (!$("wallpaperErrorRow")?.hidden) showWallpaperError(wallpaperErrorKey);
  });
  for (const button of localeButtons) {
    button.addEventListener("click", () => { applyLocale(button.dataset.locale).catch(() => {}); });
  }

  // 弹窗里改了语言也要跟上（i18n.js 自己没有 storage 监听）。
  // chrome.storage.onChanged 在写入方自己的页面里也会触发，所以这里必须认一下
  // 「这就是我刚写的」：BcaI18n.use() 是先换 current 再写存储的，值一样就什么都不做。
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    const next = changes[BcaI18n.STORAGE_KEY]?.newValue;
    if (!BcaI18n.isSupported(next) || next === BcaI18n.locale()) return;
    Promise.resolve(BcaI18n.use(next, { silent: true })).catch(() => {}).then(() => { renderLocaleOptions(); showLocaleFailure(); });
  });

  // 1.8.10：别的扩展页换图/删图后这里要跟着刷新状态，否则按钮还写着「移除背景图片」，
  // 点下去却提示「还没有背景图」。theme.js 那边用同一个键广播。
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes[BcaTheme.WALLPAPER_REVISION_KEY]) return;
    refreshWallpaperState();
  });

  // V1.4.1：「返回收藏库」改成把这个标签页本身导航回去，不再先 window.close()。
  // 关标签页只在「上一个被激活的标签恰好是收藏库」时才看起来正确 —— 用户可能是从书签、
  // 地址栏或别的扩展页进来的，关掉之后落在哪个标签上就不一定了（真机上报过这个问题：
  // 点了「返回收藏库」只是把设置页关掉，人留在了原来的页面上）。
  document.getElementById("settingsBack")?.addEventListener("click", () => {
    const url = chrome.runtime.getURL("library.html");
    chrome.tabs.getCurrent((tab) => {
      // 非标签上下文里拿不到 tab（理论上不会发生），退回就地导航，别把人卡住
      if (tab && tab.id !== undefined) chrome.tabs.update(tab.id, { url });
      else window.location.href = url;
    });
  });
}

boot().catch(() => {});
