"use strict";

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
      const notImage = /not an image|no file/i.test(String(error?.message || ""));
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

async function applyLocale(locale) {
  await BcaI18n.use(locale);
  renderLocaleOptions();
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
    clearWallpaperError();
    Promise.resolve(BcaTheme.clearWallpaper())
      .then(() => refreshWallpaperState())
      .catch(() => showWallpaperError("浏览器不让存背景图片，可能是空间不够。"));
  });

  // 滑块要「拖着就生效」，所以监听 input 而不是 change（change 要等松手）
  const sliders = [
    ["wallpaperVeil", "veil", formatPercent],
    ["wallpaperBlur", "blur", formatPx],
    ["glassBlur", "glassBlur", formatPx]
  ];
  for (const [id, key, format] of sliders) {
    $(id)?.addEventListener("input", (event) => {
      const value = Number(event.target.value);
      BcaTheme.setAppearance({ [key]: value });
      // setAppearance 会通知 renderAppearance，本行的数值文本在那边一起更新
      writeText($(`${id}Value`), format(value));
    });
  }

  $("glassToggle")?.addEventListener("click", () => {
    BcaTheme.setAppearance({ glass: !BcaTheme.appearance().glass });
  });

  // 1.5.0：数据统计页（与设置页一样是新标签页，随时能关回来）
  $("openStats")?.addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("stats.html") });
  });

  // 1.5.0：宠物挂件开关。挂件自己监听 chrome.storage.local.interfacePet（见 pet.js），
  // 这里只写状态、不需要额外信号；缺省视为开启，与挂件那边的判断保持一致。
  const petToggle = $("petToggle");
  function renderPetToggle(enabled) {
    if (!petToggle) return;
    petToggle.setAttribute("aria-pressed", String(Boolean(enabled)));
    petToggle.classList.toggle("off", !enabled);
  }
  chrome.storage.local.get("interfacePet")
    .then((stored) => renderPetToggle(!stored?.interfacePet || stored.interfacePet.enabled !== false))
    .catch(() => renderPetToggle(true));
  petToggle?.addEventListener("click", () => {
    const enabled = petToggle.getAttribute("aria-pressed") !== "true";
    renderPetToggle(enabled);
    chrome.storage.local.set({ interfacePet: { enabled } }).catch(() => {});
  });

  const search = $("settingsSearch");
  search?.addEventListener("input", (event) => renderSearchResults(event.target.value));
  // 点结果之前会先 blur，所以这里不能用 blur 收起下拉，只能点空白处收
  search?.addEventListener("keydown", (event) => { if (event.key === "Escape") { search.value = ""; renderSearchResults(""); } });
  document.addEventListener("click", (event) => {
    if (!event.target.closest?.(".settings-search")) renderSearchResults("");
  });

  BcaI18n.onChange(() => {
    applyTitle();
    renderLocaleOptions();
    // 翻译换了一批文字，行的索引与面包屑都要跟着重建，否则搜索还是按旧语言匹配
    buildSearchIndex();
    renderCrumb(navGroup);
    renderAppearance();
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
    Promise.resolve(BcaI18n.use(next, { silent: true })).catch(() => {}).then(renderLocaleOptions);
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
