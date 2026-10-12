/* ==========================================================================
   宠物挂件（BcaPet）
   --------------------------------------------------------------------------
   形态参考 DeepSeek-Balance-Whale-Widget（MeteorNOX）：「右下角常驻挂件 + 点击序列
   气泡 + 按压 Q 弹」。代码全部重写，没有引用它的任何文件、素材或代码。
   （那个仓库的代码是 MIT，但 assets/ 下的美术素材不在 MIT 覆盖范围内、不授予再许可，
     所以宠物是按这个形态自己做的，也不内联任何图形：姿态画在随包发布的位图精灵
     pet-cat.png 里（6 列 × 5 行的帧表），CSS 只负责「露哪一格」。）

   约定：
   1. 这一页的数据都由别处算好、写进 chrome.storage.local，本文件只做消费：
        interfacePet : { enabled: boolean }        缺失视为 true（显示）
        bcaStats     : 统计快照，字段见 bubbleLines()
      自己再算一遍的话，两个地方的口径早晚会对不上。
   2. 颜色 / 圆角 / 阴影 / 字号 / 间距全部走 theme.css 的令牌，见 pet.css；
      宠物自身的颜色画在 pet-cat.png 里，CSS 不参与上色。
   3. 不发网络请求、不加权限、不引入外部资源：图形是随包发布的位图精灵，
      动画是 CSS 的 steps() 逐帧（见 pet.css 的 .bca-pet-sprite / @keyframes bca-pet-idle）。
   4. 自启，library.js 一个字都不用改。外层容器 #bcaPet，气泡 #bcaPetBubble，
      宠物本体是 <button type="button" aria-label="宠物">。
   ========================================================================== */
(function attachPet(global) {
  "use strict";

  const doc = global.document;
  if (!doc) return;

  const ROOT_ID = "bcaPet";
  const BUBBLE_ID = "bcaPetBubble";
  const PET_CLASS = "bca-pet";
  const BUBBLE_CLASS = "bca-pet-bubble";
  const TEXT_CLASS = "bca-pet-bubble-text";
  const HIDDEN_CLASS = "is-hidden";
  const POP_CLASS = "is-popping";

  const PET_KEY = "interfacePet";
  const STATS_KEY = "bcaStats";
  const TOUCH_MESSAGE = "bca-pet-touch";

  // 宠物本体 = 一格位图精灵。pet-cat.png 是 6 列 × 5 行的帧表，这里只放一个空壳，
  // 「露哪一格、多久换一帧」全在 pet.css 的 .bca-pet-sprite / @keyframes bca-pet-idle 里。
  // 换动作（行走 / 睡觉那几行）也是改 CSS，不用动这个文件。
  const PET_SPRITE = '<span class="' + PET_CLASS + '-sprite" aria-hidden="true"></span>';

  /* ------------------------------ 状态 ------------------------------ */

  let container = null;
  let button = null;
  let bubble = null;
  let bubbleText = null;

  let configEnabled = true;
  let statsLoaded = false;
  let stats = null;
  let visible = false;
  let lineIndex = 0;      // 下一次点开要显示第几条
  let ready = false;      // 是否已经装配过一次（build 只做一次）

  /* ------------------------------ 工具 ------------------------------ */

  function translate(text, params) {
    try {
      const i18n = global.BcaI18n;
      if (i18n && typeof i18n.t === "function") {
        return params ? i18n.t(text, params) : i18n.t(text);
      }
    } catch (_) {
      // 词典坏了也不能让挂件整个不显示
    }
    return text;
  }

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]
  ));

  /* ------------------------------ 数据 ------------------------------ */

  async function readConfig() {
    try {
      const stored = await global.chrome.storage.local.get(PET_KEY);
      const config = stored ? stored[PET_KEY] : null;
      return !config || config.enabled !== false;
    } catch (_) {
      return true;
    }
  }

  // 契约字段一个都不能少，缺了就按 0 / 空处理；只有整个对象缺失才算「还没有数据」。
  async function readStats() {
    try {
      const stored = await global.chrome.storage.local.get(STATS_KEY);
      const value = stored ? stored[STATS_KEY] : null;
      return value && typeof value === "object" ? value : null;
    } catch (_) {
      return null;
    }
  }

  // 4 条轮播台词。t() 的 key 必须写成字面量（i18n 的提取工具只认字面量）。
  function bubbleLines(data) {
    if (!data) return [translate("还没有数据，导入一次收藏夹就能看到统计了。")];
    const days = data.days || {};
    const top = data.topCollection || null;
    return [
      translate("已陪伴你 {days} 天", { days: Number(days.days) || 0 }),
      translate("帮你保存了 {count} 个视频", { count: Number(data.videos) || 0 }),
      translate("今日新增收藏视频 {count} 个", { count: Number(data.savedToday) || 0 }),
      translate("你近期保存最多的收藏夹是 {name}", { name: top && top.name ? String(top.name) : "—" })
    ];
  }

  /* ------------------------------ 气泡 ------------------------------ */

  function hideBubble() {
    if (!bubble) return;
    bubble.hidden = true;
    if (button) button.setAttribute("aria-expanded", "false");
  }

  function showBubble(text) {
    if (!bubble || !bubbleText) return;
    bubbleText.textContent = text;
    bubble.hidden = false;
    if (button) button.setAttribute("aria-expanded", "true");
  }

  function dismissBubble() {
    lineIndex = 0;
    hideBubble();
    // 键盘用户收起后焦点得有个去处；已经用鼠标点走焦点时不抢回来
    if (visible && button && doc.activeElement === doc.body) button.focus();
  }

  // 第 5 次点击（4 条都看过以后）收起；收起后再点从头开始。
  function advanceBubble(lines) {
    if (bubble && !bubble.hidden && lineIndex >= lines.length) {
      dismissBubble();
      return false;
    }
    showBubble(lines[lineIndex % lines.length]);
    lineIndex += 1;
    return true;
  }

  function pop() {
    if (!button) return;
    button.classList.remove(POP_CLASS);
    void button.offsetWidth; // 强制回流：连点也能重新播一次「Q 弹」
    button.classList.add(POP_CLASS);
  }

  /* ------------------------------ 交互 ------------------------------ */

  // 后台回的临时台词：优先于 4 条序列，只显示一次。
  let tempLine = "";

  function applyTempLine(line) {
    if (!line || !visible) return;
    if (bubble && !bubble.hidden) {
      showBubble(line);
    } else {
      tempLine = line; // 气泡收着，攒到下次点开展示
    }
  }

  // 后台只回一个下标（service worker 里没有词典，它不碰 i18n），台词在这里翻。
  // 1.5.0：原先约定后台直接回 line 文案，落地时改成 lineIndex。
  // 这四句必须写成一条条 translate("…") 调用 —— i18n 抽取器只认调用点，
  // 塞进数组字面量它看不见，词典里就会缺这四句（缺了不报错，只是切语言不生效）。
  const TOUCH_LINE_COUNT = 4;

  function touchLine(index) {
    switch (index % TOUCH_LINE_COUNT) {
      case 0: return translate("摸摸头～");
      case 1: return translate("今天也要记得备份哦");
      case 2: return translate("收藏得越多，我越有精神");
      default: return translate("又见面啦");
    }
  }

  // 后台回的临时台词是「顺手的彩蛋」，不是这一下的主流程：
  // 所以先判掉 lastError（没接听方 / 上下文失效都会走这里），再看有没有 lineIndex。
  function onTouchReply(response) {
    try {
      if (global.chrome.runtime.lastError) return;
      if (!response || !response.ok) return;
      const index = Number(response.lineIndex);
      if (!Number.isInteger(index) || index < 0) return;
      applyTempLine(touchLine(index));
    } catch (_) {}
  }

  function onPetClick(event) {
    event.stopPropagation(); // 否则会被下面那条「点空白处收起」当场关掉
    pop();

    // 气泡先动：有后台攒的临时台词就先放它，否则接着轮播 4 条
    const lines = bubbleLines(stats);
    if (tempLine) {
      const line = tempLine;
      tempLine = "";
      showBubble(line);
    } else {
      advanceBubble(lines);
    }

    // 每一下都报给后台（它负责记录摸摸头、算亲密度、可能回一条临时台词）。
    // 这是 fire-and-forget：拿不到回复、后台没起来、扩展上下文失效，
    // 都不该报错、更不该影响气泡这一下的观感，所以整体裹 try/catch。
    try {
      global.chrome.runtime.sendMessage({ type: TOUCH_MESSAGE }, onTouchReply);
    } catch (_) {}
  }

  function onDocumentClick() {
    hideBubble();
  }

  function onKeydown(event) {
    if (event.key === "Escape" && bubble && !bubble.hidden) dismissBubble();
  }

  function onStorageChanged(changes, areaName) {
    if (areaName !== "local" || !changes) return;
    if (changes[PET_KEY]) {
      const config = changes[PET_KEY].newValue;
      configEnabled = !config || config.enabled !== false;
      applyVisibility();
    }
    if (changes[STATS_KEY]) {
      const next = changes[STATS_KEY].newValue;
      stats = next && typeof next === "object" ? next : null;
      refresh();
    }
    // 切语言：无障碍名与已经显示出来的气泡都要跟着换（BcaI18n.apply 只认 data-i18n*）
    if (changes[BcaI18n.STORAGE_KEY]) {
      if (button) button.setAttribute("aria-label", translate("宠物"));
      refresh();
    }
  }

  /* ------------------------------ 显隐 ------------------------------ */

  function applyVisibility() {
    visible = statsLoaded && configEnabled;
    if (container) container.classList.toggle(HIDDEN_CLASS, !visible);
    if (button) button.tabIndex = visible ? 0 : -1;
    if (!visible) {
      lineIndex = 0;
      tempLine = "";
      hideBubble();
    }
  }

  /* ------------------------------ 装配 ------------------------------ */

  function build() {
    if (ready || doc.getElementById(ROOT_ID)) return;
    ready = true;

    container = doc.createElement("div");
    container.id = ROOT_ID;
    container.className = "bca-pet-dock";

    bubble = doc.createElement("div");
    bubble.id = BUBBLE_ID;
    bubble.className = BUBBLE_CLASS;
    bubble.setAttribute("role", "status");
    bubble.setAttribute("aria-live", "polite");
    bubble.hidden = true;
    bubbleText = doc.createElement("p");
    bubbleText.className = TEXT_CLASS;
    bubble.appendChild(bubbleText);

    button = doc.createElement("button");
    button.type = "button";
    button.className = PET_CLASS;
    // 无障碍名就用「宠物」这条词条本身（走 translate()，切语言时会跟着变）
    button.setAttribute("aria-label", translate("宠物"));
    button.setAttribute("aria-expanded", "false");
    button.innerHTML = PET_SPRITE;

    container.appendChild(bubble);
    container.appendChild(button);
    doc.body.appendChild(container);

    button.addEventListener("click", onPetClick);
    doc.addEventListener("click", onDocumentClick);
    doc.addEventListener("keydown", onKeydown);
  }

  async function boot() {
    if (!doc.body) return;
    build();
    try {
      global.chrome.storage.onChanged.addListener(onStorageChanged);
    } catch (_) {}
    configEnabled = await readConfig();
    stats = await readStats();
    statsLoaded = true;
    applyVisibility();
  }

  // 统计变了、语言切了都走这里：只重画气泡内容（气泡开着的时候），不动显隐与动画状态
  async function refresh() {
    if (!statsLoaded) return;
    stats = await readStats();
    if (!visible || !bubble || bubble.hidden) return;
    const lines = bubbleLines(stats);
    showBubble(lines[lineIndex % lines.length]);
  }

  function start() {
    if (!doc.body) return;
    boot();
  }

  // 自启。脚本是页面里最后一个（在 library.js 之后），DOM 通常已经就绪；没就绪就等一次。
  if (doc.readyState === "loading") {
    doc.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }

  global.BcaPet = { boot: boot, refresh: refresh };
})(globalThis);
