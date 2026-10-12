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
        interfacePet : { enabled, size, x, y, paused }  缺失字段各有默认值（见 PET_DEFAULTS）
        bcaStats     : 统计快照，字段见 bubbleLines()
      自己再算一遍的话，两个地方的口径早晚会对不上。
   2. 颜色 / 圆角 / 阴影 / 字号 / 间距全部走 theme.css 的令牌，见 pet.css；
      宠物自身的颜色画在 pet-cat.png 里，CSS 不参与上色。
   3. 不发网络请求、不加权限、不引入外部资源：图形是随包发布的位图精灵，
      换帧是 CSS 的 steps() 逐帧（见 pet.css 的 .bca-pet-sprite 与几个 @keyframes），
      行走是 JS 定时器推 transform（见 beginSegment）——两边都不碰对方的属性。
   4. 自启，library.js 一个字都不用改。外层容器 #bcaPet，气泡 #bcaPetBubble，
      宠物本体是 <button type="button" aria-label="宠物">。

   V1.5.3 的状态机（重做，设计说明见 DESIGN-PET.md，状态表照抄一份在这里）：
   ┌──────────┬──────────────────┬──────┬───────────┬────────────┬──────────────┐
   │ 状态     │ 触发             │ 权重 │ 最短时长  │ 动画（行/格）│ 移动与边界   │
   ├──────────┼──────────────────┼──────┼───────────┼────────────┼──────────────┤
   │ sit      │ 每个动作的落点    │  —   │ 4–8s      │ row0 第1格  │ 不动         │
   │          │ （空隙期）        │      │ (IDLE)    │ 静止        │              │
   │ blink    │ 轮盘             │  46  │ 180ms     │ row0 1→2→1  │ 不动         │
   │          │                  │      │ +不应期3–7s│ 只合一次眼  │              │
   │ sitAlt   │ 轮盘             │  14  │ 4–8s      │ row3 1–4 帧 │ 不动         │
   │ walkRight│ 轮盘             │  34  │ 4–8s      │ row1 1–6 帧 │ 逐帧推进，    │
   │ walkLeft │ （左右各半）      │ 共用 │ 共用      │ row2 6–1 帧 │ 撞边→停→回头 │
   │ sleep    │ 轮盘             │   6  │ 10–18s    │ row4 1–4 帧 │ 不动         │
   └──────────┴──────────────────┴──────┴───────────┴────────────┴──────────────┘
   轮盘四档权重之和 = 100（blink 46 最高，用户第 5 条），改 WEIGHTS 即可。
   「走路 4–8s / 坐姿 4–8s / 睡觉 ≥10s」是用户第 3 条给的硬下限：
   本轮改成「动作 → 坐姿停顿(4–8s) → 动作」，所以两个动作之间最短也有 4s，
   再没有「1 秒一换」；起步/收尾各有 600ms（= 一个步态周期）的加减速过渡。
   走路的节奏定死成一个常量：一个步态周期（6 帧）走一个 48px 逻辑格、每帧 100ms
   → 144px 档每帧 8px、周期 600ms、巡航 80px/s（96px 档 53px/s）。

   状态与 CSS 的分工：JS 管「现在是哪个状态、要不要挪位置、走到第几帧」，
   把状态名写成 data-bca-state，坐/睡/眨的换帧由 pet.css 按属性选择器接，
   **行走的换帧由本文的 walkLoop 按「走过的距离」写行内 background-position** ——
   位移与换帧必须在同一个循环里算，否则「一个步态周期走多少像素」就没人保证了
   （V1.5.2 就是 CSS 管换帧、CSS 过渡管位移，两边各跑各的）。
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
  const MENU_CLASS = "bca-pet-menu";
  const MENU_ITEM_CLASS = "bca-pet-menu-item";
  const MENU_LABEL_CLASS = "bca-pet-menu-label";
  const PRESS_CLASS = "is-pressing";
  const DRAGGING_CLASS = "is-dragging";
  const STATE_ATTR = "data-bca-state";

  const PET_KEY = "interfacePet";
  const STATS_KEY = "bcaStats";
  const TOUCH_MESSAGE = "bca-pet-touch";

  // 宠物本体 = 一格位图精灵。pet-cat.png 是 6 列 × 5 行的帧表，这里只放一个空壳，
  // 「露哪一格、多久换一帧」全在 pet.css 的 .bca-pet-sprite / @keyframes 里。
  const PET_SPRITE = '<span class="' + PET_CLASS + '-sprite" aria-hidden="true"></span>';

  /* ------------------------------ 常量表 ------------------------------ */

  // 尺寸档只取 48 的整数倍：精灵的逻辑格是 48px，整数倍放大才不会有粗细不匀的格子。
  // 96/144/192/240 = 2x/3x/4x/5x。默认 144 而不是 96：用户原话是「比较小，改成维持
  // 原大小」，而原图里猫头就有 203px 宽，96 这一档的猫只有 92px。
  const SIZES = [96, 144, 192, 240];
  const SIZE_DEFAULT = 144;

  // 待机权重（用户第 5 条：眨眼频率最高）。相对权重，改数字即可，不用动逻辑。
  // 四档之和 = 100，读起来就是百分比：blink 46 / sitAlt 14 / walk 34（左右各半）/ sleep 6。
  const WEIGHTS = { blink: 46, sitAlt: 14, walk: 34, sleep: 6 };

  // —— 时序：用户第 3 条给的硬下限（行走 4–8s、坐姿 4–8s、睡觉 ≥10s）。
  // 「动作 → 坐姿停顿 → 动作」这个结构本身就把两个动作之间撑到了 4s 以上，
  // 所以下面每一个常量都必须 ≥ 它对应的下限，改小之前先回读需求。
  const IDLE_MIN = 4000;          // 坐姿停顿（每个动作的落点）：4–8s
  const IDLE_MAX = 8000;
  const SIT_ALT_MIN = 4000;       // 坐姿变体（row3 四帧）也是坐姿，同样 4–8s
  const SIT_ALT_MAX = 8000;
  const WALK_MIN = 4000;          // 一次连续行走（含往返）4–8s
  const WALK_MAX = 8000;
  const SLEEP_MIN = 10000;        // 睡觉 ≥10s
  const SLEEP_MAX = 18000;
  // 眨眼：一次性的快速动作，总时长必须落在 120–180ms（用户第 5 条）。
  // 这个值同时写进 CSS（--bca-blink-ms）与状态机回调，两边不会各算各的。
  const BLINK_MS = 140;           // 闭合时长：140ms 动画 + 40ms 归位 = 180ms（用户第 5 条 120–180ms）
  // 不应期：眨完这一次之后，这几秒内轮盘不再抽到眨眼。这是「连眨两次」的第二道保险
  // （第一道是关键帧里只允许出现一次闭眼格）。
  const BLINK_REFRACTORY_MIN = 3000;
  const BLINK_REFRACTORY_MAX = 7000;
  const BLINK_SETTLE_MS = 40;     // 回调比动画晚一点点，别让动画还在跑就切走

  // —— 行走：位移与换帧由同一个循环算，下面两个常量就是「步态」的全部定义。
  const FRAME_MS = 100;           // 巡航时每帧 100ms → 一个步态周期（6 帧）= 600ms
  const STEP_RATIO = 1;           // 一个步态周期（6 帧）前进几个逻辑格（48px），再按尺寸档缩放
  const WALK_RAMP_MS = 600;       // 起步加速 / 收尾减速各占一个步态周期（过渡，用户第 3 条）
  const MIN_RAMP = 0.35;          // 加减速时的最低速度系数（0 会让最后几帧原地不动）
  const TURN_MS = 420;            // 撞到边界后先停一下再回头
  const EDGE_PAD = 8;             // 离视口边缘留一点，别贴着边
  const DRAG_THRESHOLD = 4;       // 位移超过它才算拖动，否则算点击（用户第 2 条）

  // 读 chrome.storage 的兜底超时：接口不回调时不能让宠物一直不出现
  // （用户底线：enabled === true 时宠物任何时刻都必须可见，所以这里必须 fail-open）。
  const STORAGE_TIMEOUT_MS = 1500;

  const PET_DEFAULTS = { enabled: true, size: SIZE_DEFAULT, x: 0.5, y: null, paused: false };

  // 单调时钟：用 performance.now()（可用时），避免系统时间被改导致时间差算错。
  function nowMs() {
    try {
      if (global.performance && typeof global.performance.now === "function") return global.performance.now();
    } catch (_) {}
    return Date.now();
  }

  /* ------------------------------ 状态 ------------------------------ */

  let container = null;
  let button = null;
  let sprite = null;
  let bubble = null;
  let bubbleText = null;
  let menu = null;

  let configEnabled = true;
  let statsLoaded = false;
  let stats = null;
  let visible = false;
  let lineIndex = 0;      // 下一次点开要显示第几条
  let ready = false;      // 是否已经装配过一次（build 只做一次）

  // 宠物自己的账本（持久化在 interfacePet 里）
  let petSize = SIZE_DEFAULT;
  let petXPct = PET_DEFAULTS.x;   // 0% = 最右（停靠位），100% = 最左
  let petYPct = null;             // 0% = 停靠底边，100% = 视口顶；null = 还没拖过
  let paused = false;

  let petX = 0;                   // 当前横向位移（px，负值 = 向左；0 = 停靠位）
  let petY = 0;                   // 当前纵向位置（px，**正值向下**；0 = 停靠底边）
  // 上面这两个量的符号必须和「拖动时指针往哪走」一致，否则猫会朝反方向跑。
  // 横向：指针往左 = dx 为负 = petX 更小 = 矩形更靠左 ✓（transform 直接写 petX）
  // 纵向：指针往下 = dy 为正 = petY 更大 = 矩形更靠下 ✓（transform 写 -petY，
  //       因为 CSS 的 translateY 正方向是向下，而这里用的是「向上为正」的取负写法）
  // V1.5.1 这里正好写反了（往下拖猫反而往上跑），V1.5.2 修的就是这个。

  // 最近一次算出来的可用范围。只是给 snapshot() 报数用，逻辑一律现算，不读它。
  let lastRange = null;

  // 状态机的两个把手：state = 现在是什么，timer = 下一个转换
  let state = "sit";
  let timer = null;
  let popTimer = null;
  let reduced = false;

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

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
  const randInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
  const pick = (list) => list[Math.floor(Math.random() * list.length)];

  // —— 帧表几何（用户钉死的行含义，不许改）——
  //   row0 坐姿（第 1/3 格睁眼、第 2/4 格闭眼，眨眼用）/ row1 向右走 6 帧 /
  //   row2 向左走 6 帧 / row3 坐姿变体 4 帧 / row4 睡觉 4 帧。
  // 每格 48×48 逻辑像素；row0 / row3 / row4 只有前 4 格有像素，第 5、6 格是全透明的空格。
  //
  // background-position 的百分比**不是「第几格」**：它是「图上的 p 点对齐容器的 p 点」，
  // 位移 = p × (容器宽 − 图宽) = p × (1 − 6) × 格宽 = −5p 格。所以第 c 列要写
  // c/(6−1)×100% = 0/20/40/60/80/100%，行位是 0/25/50/75/100%。
  // V1.5.2 的走路关键帧写成 12.5% 一档（那是 4 列图的公式），落到 6 列图上每一帧都停在
  // 两格之间的接缝上 —— 屏幕上就是整只猫横着滑，即用户报的「走路是直接平移」。
  const COL_PCT = [0, 20, 40, 60, 80, 100];
  const ROW_PCT = { sit: 0, drag: 0, blink: 0, walkRight: 25, walkLeft: 50, sitAlt: 75, sleep: 100 };
  const WALK_FRAMES = 6;
  // row1 / row2 一个步态周期 6 帧；row0 / row3 / row4 只有前 4 格有像素，第 5、6 格
  // （80% / 100%）是全透明的空格 —— 坐 / 睡 / 眨眼用到的格永远落在前 4 格之内。
  const framePos = (rowPct, col) => COL_PCT[col % WALK_FRAMES] + "% " + rowPct + "%";

  /* ------------------------------ 数据 ------------------------------ */

  function normalizeConfig(raw) {
    const config = raw && typeof raw === "object" ? raw : {};
    const size = SIZES.indexOf(Number(config.size)) >= 0 ? Number(config.size) : SIZE_DEFAULT;
    const x = typeof config.x === "number" && isFinite(config.x) ? clamp(config.x, 0, 1) : PET_DEFAULTS.x;
    const y = typeof config.y === "number" && isFinite(config.y) ? clamp(config.y, 0, 1) : null;
    return {
      enabled: config.enabled !== false,
      size: size,
      x: x,
      y: y,
      paused: config.paused === true
    };
  }

  async function readConfig() {
    try {
      const stored = await global.chrome.storage.local.get(PET_KEY);
      return normalizeConfig(stored ? stored[PET_KEY] : null);
    } catch (_) {
      return normalizeConfig(null);
    }
  }

  // 只写自己关心的字段，别的键（enabled 之类）原样留着；merge 语义避免和设置页抢写。
  function writeConfig(patch) {
    try {
      const stored = global.chrome.storage.local.get(PET_KEY);
      return Promise.resolve(stored)
        .then((value) => {
          const next = Object.assign({}, value ? value[PET_KEY] : null, patch);
          return global.chrome.storage.local.set({ [PET_KEY]: next });
        })
        .catch(() => {});
    } catch (_) {
      return Promise.resolve();
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

  function clampBubble() {
    if (!bubble || !container || bubble.hidden) return;
    bubble.style.transform = "";
    const rect = bubble.getBoundingClientRect();
    if (!rect.width) return;
    // 气泡是锚在挂件右上角的，挂件被拖到左边或尺寸调大以后，右对齐会让它探出视口。
    // 这里量完再挪回来 —— 位移写在 transform 上，不碰 right/bottom 的锚点。
    const overflow = EDGE_PAD - rect.left;
    if (overflow > 0) bubble.style.transform = "translateX(" + Math.round(overflow) + "px)";
  }

  function showBubble(text) {
    if (!bubble || !bubbleText) return;
    bubbleText.textContent = text;
    bubble.hidden = false;
    if (button) button.setAttribute("aria-expanded", "true");
    clampBubble();
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

  // 按下的弹性（squash & stretch）：松开时先压扁再回弹。
  // 关键帧挂在 .bca-pet 上，与 .bca-pet-dock 的 translate 是两个元素，互不干扰。
  function pop() {
    if (!button) return;
    button.classList.remove(POP_CLASS);
    button.classList.remove(PRESS_CLASS);
    void button.offsetWidth; // 强制回流：连点也能重新播一次「Q 弹」
    button.classList.add(POP_CLASS);
    if (popTimer) global.clearTimeout(popTimer);
    popTimer = global.setTimeout(() => {
      popTimer = null;
      if (button) button.classList.remove(POP_CLASS);
    }, 460);
  }

  /* ------------------------------ 位置与尺寸 ------------------------------ */

  // 行走的换帧入口：只改 background-position，不碰 animation。
  // col 对 6 取模，走多远都落在有像素的格上（走到第 6 格回到第 1 格）。
  let frameCol = -1;

  function setFrame(stateName, col) {
    if (!sprite) return;
    const index = ((col % WALK_FRAMES) + WALK_FRAMES) % WALK_FRAMES;
    if (index === frameCol && sprite.style.backgroundPosition) return; // 同一格不重复写
    frameCol = index;
    sprite.style.backgroundPosition = framePos(ROW_PCT[stateName] || 0, index);
  }

  // 清掉行内帧，换帧权交回 pet.css 的属性选择器。离开行走状态时必须清，
  // 否则行内那一格会一直压着 CSS，坐姿会被定在走路的一帧上。
  function clearFrame() {
    frameCol = -1;
    if (sprite) sprite.style.backgroundPosition = "";
  }

  function setState(name) {
    if (state === name) return;
    clearFrame();
    state = name;
    if (button) button.setAttribute(STATE_ATTR, name);
  }

  // 把容器尺寸与 transform 一起写下去：此刻的 container 尺寸 = 这一档的边长
  function applyBox() {
    if (!container) return;
    const size = petSize + "px";
    container.style.setProperty("--bca-pet-size", size);
    if (button) button.style.setProperty("--bca-pet-size", size);
  }

  function applyTransform(animate) {
    if (!container) return;
    // 拖拽中用 inline 的 animation: none 压住过渡；这里再显式写一次，保证松手后也干净。
    container.style.transition = animate ? "" : "none";
    // CSS 的 translateY 正方向是向下，petY 的正方向也是向下，所以这里写 +petY。
    // （V1.5.1 写的是 -petY，语义是「正值向上」；那样一来「往下拖」反而把猫拎了起来。）
    container.style.transform = "translate(" + Math.round(petX) + "px, " + Math.round(petY) + "px)";
  }

  // 把比例换算成像素。横向：transform 的 translateX 直接写 petX，所以 0 = 停靠位、
  // 负值 = 往左，范围 [range.max, 0]。纵向：petY 是「距停靠底边的距离」，0 = 停靠位、
  // 正值 = 往下，范围 [0, range.yMax]。
  function toPx() {
    const range = warpRange();
    petX = clamp(range.max * petXPct, range.max, 0);
    // y 为 null = 还没拖过 = 停在停靠底边。存的是比例：0 = 停靠位，1 = 最下（底边留 EDGE_PAD）。
    petY = petYPct === null ? 0 : clamp(petYPct * range.yMax, 0, range.yMax);
    lastRange = range;
    return range;
  }

  // 可用空间的基准用**布局视口**，不用 window.innerWidth/innerHeight。
  // 为什么：Chromium 的 innerHeight 报的是窗口高度，而元素实际能画到的地方是布局视口
  // （documentElement.clientHeight）。两者在窗口被缩放、DevTools 打开、页面出现滚动条时会
  // 差出几十到上百像素。实测差 141px：innerHeight=955、clientHeight=813.5 —— 夹取按 955 算、
  // 猫却只能画到 813.5，于是「拖到底」时猫的下半身留在屏幕外，正是用户报的
  // 「改完分辨率猫跑到屏幕外」的根因。布局视口才是元素真正的边界。
  function viewport() {
    const de = doc.documentElement || {};
    const w = de.clientWidth || global.innerWidth || 0;
    const h = de.clientHeight || global.innerHeight || 0;
    return { w: w, h: h };
  }

  // 每次用之前现算：视口变了、尺寸档变了，可用空间就变了。不用缓存。
  //
  // 关键：停靠位必须从「视口宽度 + CSS 的 right」算出来，**不能**拿 button 的
  // getBoundingClientRect() 反推。因为 rect 是「含当前位移」的，一旦写成
  // rect.right - petX，就等于用上一次的位移去定义这一次的边界：位置每被读一次，
  // 可用范围就漂一点。实测在 1688px 视口下拖动几秒后停靠基准漂了 60px 以上，
  // 猫会慢慢滑出屏幕——这正是「拖着拖着猫就不见了」的成因。
  function dockRight() {
    if (!container) return 0;
    const right = parseFloat(global.getComputedStyle(container).right);
    return viewport().w - (isNaN(right) ? 0 : right);
  }

  function warpRange() {
    if (!container || !button) return { max: 0, yMax: 0, yMin: 0 };
    // max 是负数：从停靠位往左最多能挪多少（左边缘停在 EDGE_PAD 上）
    const max = Math.min(0, EDGE_PAD + petSize - dockRight());
    // 纵向：CSS 的 bottom 就是「猫的下边缘离视口底的距离」，停靠时是 52px（与右下角浮标对齐）。
    // petY 是在这个停靠位之上的偏移，所以：
    //   往下最多还能走 bottom - EDGE_PAD（再往下底边就贴死屏幕边了）；
    //   往上最多走到顶边留 EDGE_PAD。
    // 注意：**不能**写成 vh - EDGE_PAD - petSize - bottom —— 那是「按视口高度直接算出的
    // 最大下移量」，它忽略了停靠位本身已经把猫放在了 bottom 高度上。实测在 2115×956 的
    // 视口里那个写法给出 yMax=752，而停靠位只允许再往下 44px，于是「往下拖到底」把猫
    // 拖到了 top=1512（屏幕外 700px）——正是用户报的「拖着拖着猫跑到屏幕外」。
    const vh = viewport().h;
    const bottom = parseFloat(global.getComputedStyle(container).bottom) || 0;
    const yMin = Math.max(0, Math.min(bottom - EDGE_PAD, vh - EDGE_PAD - petSize));
    const yMax = Math.max(0, bottom - EDGE_PAD);
    return { max: max, yMax: yMax, yMin: yMin };
  }

  // 按视口比例存，读回来再夹一次：换分辨率 / 换尺寸档之后也绝不会跑到屏幕外。
  function syncPosition() {
    toPx();
    applyTransform(false);
  }

  // 按视口比例存：换分辨率回来还能落在「同一个相对位置」。
  // 读回来时 syncPosition() 会再夹一次边界，所以老数据 / 极端窗口也不会跑到屏幕外。
  // y = 0 表示停在停靠底边，y = 1 表示已经走到最下（底边留 EDGE_PAD）。
  function persistPosition() {
    const range = warpRange();
    petXPct = range.max === 0 ? 0 : clamp(petX / range.max, 0, 1);
    // y 要区分「拖到停靠底边（写 0）」和「从没拖过 / 刚重置过（写 null）」：
    // null 是「跟着 CSS 的停靠高度走」这个活语义，写死成 0 之后，以后 CSS 的
    // bottom 一改、或者换尺寸档时可用空间变了，猫就再也不会回到正确的停靠高
    // 度了。这里直接沿用 petYPct 当前值（拖动与夹取都会同步它），不再从 petY
    // 反算 —— 从 petY 反算永远算不出 null，等于每次落盘都把重置抹掉。
    if (petYPct !== null) {
      petYPct = range.yMax === 0 ? 0 : clamp(petY / range.yMax, 0, 1);
    }
    writeConfig({ x: round4(petXPct), y: petYPct === null ? null : round4(petYPct), size: petSize });
  }

  const round4 = (value) => Math.round(value * 10000) / 10000;

  function setSize(next) {
    const size = SIZES.indexOf(Number(next)) >= 0 ? Number(next) : SIZE_DEFAULT;
    petSize = size;
    applyBox();
    // 换档之后可用空间变了：先把比例换算成新的 px，再夹一次边界，最后落盘
    syncPosition();
    persistPosition();
    clampBubble();
    renderMenu();
  }

  /* ------------------------------ 状态机 ------------------------------ */

  function clearTimer() {
    if (timer) { global.clearTimeout(timer); timer = null; }
  }

  function after(ms, fn) {
    clearTimer();
    timer = global.setTimeout(() => { timer = null; fn(); }, ms);
  }

  function stateReady() {
    return visible && !reduced && !dragging;
  }

  // 眨眼：一次调用 = 一次闭合（140ms 动画 + 40ms 归位 = 180ms），眨完进不应期。
  // 「连眨两次」有两道防线：(1) pet.css 的 bca-pet-blink 里只出现一格闭眼帧；
  // (2) 这里的 blinkReadyAt —— 不应期内轮盘抽到眨眼就改成坐一会儿。
  // 落点固定回 sit（row0 第 1 格）：眨眼首尾也都是这一格，所以不会有跳变。
  let blinkReadyAt = 0;

  function blink() {
    setState("blink");
    blinkReadyAt = nowMs() + BLINK_MS + randInt(BLINK_REFRACTORY_MIN, BLINK_REFRACTORY_MAX);
    after(BLINK_MS + BLINK_SETTLE_MS, () => {
      setState("sit");
      idling(IDLE_MIN, IDLE_MAX);
    });
  }

  // 坐姿停顿：每个动作的落点。两个动作之间因此至少隔 IDLE_MIN(4s) —— 这是
  // 「每组动画间隔太短、像瞬移」的结构性修法：不再是「动作 → 立刻动作」。
  function sitStill() {
    setState("sit");
    idling(IDLE_MIN, IDLE_MAX);
  }

  // row3 的四个坐姿变体（pet.css 的 bca-pet-sit，2s 一轮）：停留 4–8s，
  // 至少是 CSS 一轮的两倍，不会在半个循环上被切走。
  function sitAlt() {
    setState("sitAlt");
    idling(SIT_ALT_MIN, SIT_ALT_MAX);
  }

  function sleep() {
    setState("sleep");
    after(randInt(SLEEP_MIN, SLEEP_MAX), () => {
      setState("sit");
      idling(IDLE_MIN, IDLE_MAX);
    });
  }

  // 唯一的「等一会儿再看看干什么」出口：时长一律有下限，杜绝 1 秒一换。
  function idling(min, max) {
    after(randInt(min, max), schedule);
  }

  // 一步能走多远（= 每换一帧走多少像素）。逻辑格 48px × STEP_RATIO × 尺寸档 ÷ 6 帧：
  //   144px 档 → 一周期 48px，每帧 8px；FRAME_MS=100 → 巡航 80px/s。
  //   96px 档  → 一周期 32px，每帧 5.33px；巡航 53px/s。
  // 定死它 = 定死「一个步态周期走多少像素」。「走多远」由时长（WALK_MIN..MAX）决定，
  // 「走多快」是这个常量；帧号 = 已走距离 ÷ stepPx()，动画与位移同源，
  // 所以不可能出现「动画在跑、位置匀速滑」。
  function stepPx() {
    return 48 * STEP_RATIO * (petSize / SIZE_DEFAULT) / WALK_FRAMES;
  }

  let rafId = null;

  function stopWalk() {
    if (rafId !== null) { global.cancelAnimationFrame(rafId); rafId = null; }
  }

  // 走 totalMs 这么久，方向 +1 往右 / -1 往左。位移与换帧都由这一个循环推进：
  //   · 每帧按「已走过的距离 ÷ 每帧距离」算帧号 —— 帧号与位置一一对应；
  //   · 用每帧的实测时间差积分，掉帧不会让猫走慢（夹 64ms：标签页切回来不瞬移）；
  //   · 起步 / 收尾各 WALK_RAMP_MS 的线性加减速（用户第 3 条要的过渡）；
  //   · 撞到边界就停下、按 TURN_MS 回头，把剩余时长交给新方向，绝不越界；
  //   · 期间**不写** CSS transition：位置每帧都是最终值，交给过渡只会拖拍子。
  function walkLoop(direction, totalMs) {
    const started = nowMs();
    let last = started;
    let walked = 0;
    if (container) container.style.transition = "none";
    setState(direction > 0 ? "walkRight" : "walkLeft");

    const stopSitting = () => {
      if (!stateReady()) return;
      persistPosition();
      setState("sit");
      idling(IDLE_MIN, IDLE_MAX);
    };

    const frame = (ts) => {
      const now = typeof ts === "number" ? ts : nowMs();
      const dt = Math.min(64, Math.max(0, now - last));
      last = now;
      // 走到一半被拖住 / 被藏起来 / 系统要求减弱动画：就地停住，别继续挪它
      if (!stateReady()) { rafId = null; clearFrame(); return; }

      const range = warpRange();
      const elapsed = now - started;
      if (elapsed >= totalMs) {
        petX = clamp(petX, range.max, 0);
        applyTransform(false);
        rafId = null;
        clearFrame();
        stopSitting();
        return;
      }

      // 撞到边界：停 TURN_MS 再回头，剩下的时间从新方向起算
      const atEdge = direction > 0 ? petX >= -0.5 : petX <= range.max + 0.5;
      if (atEdge) {
        petX = clamp(petX, range.max, 0);
        applyTransform(false);
        rafId = null;
        clearFrame();
        const rest = totalMs - elapsed;
        after(TURN_MS, () => {
          if (!stateReady()) return;
          // 剩余时间太短就别回头了（回头只剩 1 秒不到会看着像「抖一下」）
          if (rest > TURN_MS + 1200) walkLoop(-direction, rest - TURN_MS);
          else stopSitting();
        });
        return;
      }

      // 速度系数：两端各 WALK_RAMP_MS 线性起落，MIN_RAMP 保证不会原地踏步
      const edgeMs = Math.min(elapsed, totalMs - elapsed);
      const speed = clamp(edgeMs / WALK_RAMP_MS, MIN_RAMP, 1);
      const want = stepPx() * dt / FRAME_MS * speed;
      const span = direction > 0 ? -petX : petX - range.max;
      const delta = Math.min(want, Math.max(0, span));
      petX = clamp(petX + direction * delta, range.max, 0);
      walked += delta;
      setFrame(direction > 0 ? "walkRight" : "walkLeft", Math.floor(walked / stepPx()));
      applyTransform(false);
      rafId = global.requestAnimationFrame(frame);
    };

    stopWalk();
    rafId = global.requestAnimationFrame(frame);
  }

  function walk() {
    const range = warpRange();
    // 空间不够（窗口很窄 / 尺寸档很大）就不走了，直接坐一会儿
    if (-range.max < petSize * 0.6) { sitStill(); return; }
    // 贴着某一边时优先朝有空间的那一侧走，免得一开步就撞墙
    let direction = Math.random() < 0.5 ? 1 : -1;
    if (petX >= -EDGE_PAD * 2) direction = -1;
    else if (petX <= range.max + EDGE_PAD * 2) direction = 1;
    walkLoop(direction, randInt(WALK_MIN, WALK_MAX));
  }

  // 权重轮盘：眨眼最高（用户第 5 条）。
  // 「暂停走动」只把行走那一档的权重让掉，剩下的按比例重新归一 —— 暂停以后眨眼依旧
  // 最频繁，而且**任何一档都不会把宠物藏起来**（藏起来只有菜单里那一条会做）。
  // 不应期内抽到眨眼就改成坐一会儿：sitStill 的下限（4s）大于不应期上限（7s）？
  // 不一定够，但下下轮一定过 —— 无论如何都不会「连眨两次」。
  function schedule() {
    if (!stateReady()) return;
    const walkWeight = paused ? 0 : WEIGHTS.walk;
    const total = WEIGHTS.blink + WEIGHTS.sitAlt + walkWeight + WEIGHTS.sleep;
    const roll = Math.random() * total;
    if (roll < WEIGHTS.blink) {
      if (nowMs() >= blinkReadyAt) blink();
      else sitStill();
      return;
    }
    if (roll < WEIGHTS.blink + WEIGHTS.sitAlt) { sitAlt(); return; }
    if (roll < WEIGHTS.blink + WEIGHTS.sitAlt + walkWeight) { walk(); return; }
    sleep();
  }

  // 非待机原因（拖拽、隐藏、减少动态、暂停走动、任何菜单动作）→ 先坐好，别把
  // 定时器 / rAF 留在半路。这也是「任何菜单动作都不会让宠物消失」的兜底：
  // 落点永远是 sit（row0 第 1 格，一定有线像素），只坐不动，绝不写 enabled。
  function settle() {
    clearTimer();
    stopWalk();
    // 先撤掉在飞的 transition 再定位：不走这一步的话，下一次 syncPosition() 写进去的
    // 目标值会继续按旧过渡滑过去，看起来就是「松手以后猫自己又溜走了」。
    if (container) container.style.transition = "none";
    clearFrame();
    setState("sit");
    syncPosition();
    if (stateReady()) schedule();
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
    hideMenu();
  }

  function onKeydown(event) {
    if (event.key !== "Escape") return;
    if (menu) { hideMenu(); return; }
    if (bubble && !bubble.hidden) dismissBubble();
  }

  function onStorageChanged(changes, areaName) {
    if (areaName !== "local" || !changes) return;
    if (changes[PET_KEY]) {
      const config = normalizeConfig(changes[PET_KEY].newValue);
      configEnabled = config.enabled;
      paused = config.paused;
      if (config.size !== petSize) setSize(config.size);
      applyVisibility();
      renderMenu();
    }
    if (changes[STATS_KEY]) {
      const next = changes[STATS_KEY].newValue;
      stats = next && typeof next === "object" ? next : null;
      refresh();
    }
    // 切语言：无障碍名与已经显示出来的气泡都要跟着换（BcaI18n.apply 只认 data-i18n*）
    if (changes[BcaI18n.STORAGE_KEY]) {
      if (button) button.setAttribute("aria-label", translate("宠物"));
      renderMenu();
      if (bubble && !bubble.hidden) {
        const lines = bubbleLines(stats);
        showBubble(lines[clamp(lineIndex - 1, 0, lines.length - 1)]);
      }
    }
  }

  /* ------------------------------ 拖动 ------------------------------ */

  let dragging = false;
  let dragPointerId = null;       // 只认第一根按下的手指/指针，多点触控时不被第二根搅乱
  let dragStartX = 0;
  let dragStartY = 0;
  let dragOriginX = 0;
  let dragOriginY = 0;
  let moved = false;

  // 「猫现在真正画在哪」：拖动必须以此为基准，**不能**拿 petX / petY 当基准。
  // 别的路径（换尺寸档、窗口 resize、状态切换里的 syncPosition）都会让 .bca-pet-dock
  // 用 CSS transition 滑过去，而那段时间里 petX 是**过渡的目标值**，和屏幕上的位置差着
  // 几十像素。拿目标值算 dragOrigin，指针一动猫就会先「跳」到目标位置 —— 这正是用户
  // 报的「一拖动它就跳走 / 像消失了一样」。行走是 rAF 逐帧写的，本来就是渲染值；
  // matrix 读的是**动画中的实时值**（getComputedStyle 返回当前插值，不是目标值）。
  function renderedPx() {
    const range = lastRange || warpRange();
    if (!container) return { x: petX, y: petY };
    const style = global.getComputedStyle(container);
    const matched = style.transform && style.transform !== "none" ? style.transform.match(/matrix\(([^)]+)\)/i) : null;
    if (!matched) return { x: clamp(petX, range.max, 0), y: clamp(petY, 0, range.yMax) };
    const parts = matched[1].split(",").map((part) => parseFloat(part));
    if (parts.length < 6 || !isFinite(parts[4]) || !isFinite(parts[5])) return { x: petX, y: petY };
    return { x: clamp(parts[4], range.max, 0), y: clamp(parts[5], 0, range.yMax) };
  }

  function onPointerDown(event) {
    if (!visible || event.button !== 0) return;
    if (dragging) return;  // 已经有一根指头在拖了，后来的忽略
    hideMenu();
    dragging = true;
    dragPointerId = event.pointerId;
    moved = false;
    dragStartX = event.clientX;
    dragStartY = event.clientY;
    // 先把状态机与行走停掉：rAF 还挂着的话，下一帧就会把猫从冻住的位置上再挪走
    clearTimer();
    stopWalk();
    // 把「现在画在哪」冻成 JS 的坐标。顺序是「先写 petX/petY，再撤过渡」——
    // 反过来的话，指定值与渲染值不等，撤掉过渡的那一瞬猫会直接跳到过渡目标上。
    const frozen = renderedPx();
    const range = warpRange();
    petX = frozen.x;
    petY = frozen.y;
    petXPct = range.max === 0 ? 0 : clamp(petX / range.max, 0, 1);
    if (petYPct !== null) petYPct = range.yMax === 0 ? 0 : clamp(petY / range.yMax, 0, 1);
    dragOriginX = petX;
    dragOriginY = petY;
    applyTransform(false);   // 撤过渡 + 把冻住的位置写进 DOM（值相等，所以画面不动）
    if (button) {
      button.classList.add(PRESS_CLASS);
      // 指针捕获：手滑出宠物外面也不会丢事件（触屏同样适用）
      try { button.setPointerCapture(event.pointerId); } catch (_) {}
    }
    // 按住就坐下：拖动期间只露 sit（row0 第 1 格，一定有像素），绝不落到空帧上 ——
    // 这是「一拖就消失」的另一半成因。拖动期间状态机被 stateReady() 挡住，不会抢状态。
    setState("drag");
  }

  function onPointerMove(event) {
    if (!dragging) return;
    if (dragPointerId !== null && event.pointerId !== dragPointerId) return;
    const dx = event.clientX - dragStartX;
    const dy = event.clientY - dragStartY;
    if (!moved && Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD) return;
    if (!moved) {
      moved = true;
      if (button) button.classList.add(DRAGGING_CLASS);
      if (container) container.style.transition = "none";
    }
    const range = warpRange();
    // 按住「猫身体」，猫就跟着指针走：dx / dy 分别以「往右 / 往下」为正，
    // 而 petX（translateX）与 petY（正 = 往下）也是同样的方向，所以两个轴都直接相加。
    // 两个减号都曾写错过：横着写减号 = 往左拖猫往右跑；纵向把「正值向上」当基准 =
    // 往下拖猫往天上飘。方向感全靠这一段的符号，改这里之前先想清楚指针往哪走。
    petX = clamp(dragOriginX + dx, range.max, 0);
    petY = clamp(dragOriginY + dy, 0, range.yMax);
    // 拖过就再也不是「停靠高度」了：把比例跟着更新（0 = 停靠底边、1 = 最下）。
    // 不在这里更新的话，persistPosition() 会按 petYPct 里的旧值落盘，
    // 位置就只在这一次拖动的画面上是对的、刷新之后弹回原处。
    petYPct = range.yMax === 0 ? 0 : clamp(petY / range.yMax, 0, 1);
    applyTransform(false);
    clampBubble();
  }

  function onPointerUp(event) {
    if (!dragging) return;
    if (dragPointerId !== null && event.pointerId !== dragPointerId) return;
    dragging = false;
    dragPointerId = null;
    if (button) {
      button.classList.remove(PRESS_CLASS);
      button.classList.remove(DRAGGING_CLASS);
      try { button.releasePointerCapture(event.pointerId); } catch (_) {}
    }
    if (container) container.style.transition = "";
    if (moved) {
      // 拖过就不算点击：把紧接着来的那一次 click 吃掉。
      // 这里记时间戳而不是用一个 setTimeout(0) 复位的布尔量 —— 布尔量和浏览器
      // 派发 click 的时机是赛跑（松开手指后 click 与定时器谁先执行并不保证），
      // 时间戳则只看「多久之前拖过」，不依赖任务顺序。
      lastDragEnd = nowMs();
      persistPosition();
      settle();
      return;
    }
    // 没拖动 = 点击：松开时弹一下（原来是 click 时弹的，现在按在猫身上就有反应）
    syncPosition();
    settle();
  }

  // 拖动结束后这段时间内的 click 都当作拖动的余波，不算点击。
  // 取 250ms：比双击间隔（约 200ms）略长，又短到不会误伤「拖完停一下再点」。
  const CLICK_AFTER_DRAG_MS = 250;
  let lastDragEnd = -Infinity;

  function onButtonClick(event) {
    if (nowMs() - lastDragEnd < CLICK_AFTER_DRAG_MS) { event.stopPropagation(); event.preventDefault(); return; }
    onPetClick(event);
  }

  /* ------------------------------ 右键菜单 ------------------------------ */

  function menuItem(label, active, onPick) {
    const item = doc.createElement("button");
    item.type = "button";
    item.className = MENU_ITEM_CLASS;
    item.setAttribute("aria-pressed", active ? "true" : "false");
    item.textContent = label;
    item.addEventListener("click", (event) => {
      event.stopPropagation();
      onPick();
      hideMenu();
    });
    return item;
  }

  // renderMenu() 只负责把「菜单里的内容」重画一遍。**要不要把菜单打开是调用方的事**：
  // 只有右键（onContextMenu）与菜单里的点击能打开它。1.5.2 这里无条件写
  // `menu.hidden = false`，而 onChanged / setSize / 拖动落盘都会走到这里，于是
  // 「拖一下猫，右键菜单自己弹出来」—— 属于同一类「菜单动作会改变宠物状态」的缺陷。
  function renderMenu(show) {
    if (!menu) return;
    menu.replaceChildren();

    const label = doc.createElement("p");
    label.className = MENU_LABEL_CLASS;
    label.textContent = translate("大小");
    menu.appendChild(label);

    for (const size of SIZES) {
      menu.appendChild(menuItem(size + "px", size === petSize, () => setSize(size)));
    }

    menu.appendChild(menuItem(
      paused ? translate("继续走动") : translate("暂停走动"),
      paused,
      () => {
        paused = !paused;
        writeConfig({ paused: paused });
        if (paused) {
          settle();
        } else {
          schedule();
        }
        renderMenu(true);
      }
    ));

    menu.appendChild(menuItem(translate("重置位置"), false, () => {
      // 与设置页的「重置位置」保持同一个语义：x = 0 就是右下角停靠位
      // （PET_DEFAULTS.x 只用于「从没存过位置」的首次安装），y = null 交回 CSS 的停靠高度。
      petXPct = 0;
      petYPct = null;
      petX = 0;
      petY = 0;
      settle();          // 先停掉在飞的行走（rAF）与定时器，否则它下一帧就把猫又挪走
      persistPosition();
      clampBubble();
    }));

    menu.appendChild(menuItem(translate("隐藏宠物"), false, () => {
      writeConfig({ enabled: false });
      configEnabled = false;
      applyVisibility();
    }));

    if (show) menu.hidden = false;
    clampMenu();
  }

  function clampMenu() {
    if (!menu || menu.hidden) return;
    menu.style.transform = "";
    const rect = menu.getBoundingClientRect();
    if (!rect.width) return;
    const overflow = EDGE_PAD - rect.left;
    if (overflow > 0) menu.style.transform = "translateX(" + Math.round(overflow) + "px)";
  }

  function hideMenu() {
    if (menu) menu.hidden = true;
  }

  function onContextMenu(event) {
    if (!visible) return;
    event.preventDefault();
    event.stopPropagation();
    renderMenu(true);
  }

  /* ------------------------------ 显隐 ------------------------------ */

  // 状态机只能有一条链。schedule() 在每次延时结束时又调一次自己，是自持的；
  // 如果在它还在跑的时候再调一次 schedule()，跑起来的就是两条互不相干的链，
  // 计时器数量翻倍，眨眼和走动会明显变密、还会互相抢状态。
  let running = false;

  function applyVisibility() {
    visible = statsLoaded && configEnabled;
    if (container) container.classList.toggle(HIDDEN_CLASS, !visible);
    if (button) button.tabIndex = visible ? 0 : -1;
    if (!visible) {
      running = false;
      dragging = false;
      lineIndex = 0;
      tempLine = "";
      hideBubble();
      hideMenu();
      settle();
    } else {
      syncPosition();
      if (!running) { running = true; schedule(); }
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

    menu = doc.createElement("div");
    menu.className = MENU_CLASS;
    menu.setAttribute("role", "menu");
    menu.hidden = true;

    button = doc.createElement("button");
    button.type = "button";
    button.className = PET_CLASS;
    // 无障碍名就用「宠物」这条词条本身（走 translate()，切语言时会跟着变）
    button.setAttribute("aria-label", translate("宠物"));
    button.setAttribute("aria-expanded", "false");
    button.innerHTML = PET_SPRITE;
    sprite = button.firstChild;

    container.appendChild(bubble);
    container.appendChild(menu);
    container.appendChild(button);
    doc.body.appendChild(container);

    applyBox();
    // CSS 的眨眼时长与 JS 的 BLINK_MS 共用一个值：两边各写各的就会出现
    // 「动画还在跑、状态已经切走」（V1.5.2 两边都是 1500ms 只是巧合，不是机制）。
    container.style.setProperty("--bca-blink-ms", BLINK_MS + "ms");
    setState("sit");
    button.addEventListener("click", onButtonClick);
    button.addEventListener("contextmenu", onContextMenu);
    button.addEventListener("pointerdown", onPointerDown);
    button.addEventListener("pointermove", onPointerMove);
    button.addEventListener("pointerup", onPointerUp);
    button.addEventListener("pointercancel", onPointerUp);
    doc.addEventListener("click", onDocumentClick);
    doc.addEventListener("keydown", onKeydown);
    global.addEventListener("resize", onViewportChange);
  }

  // 换分辨率 / 改窗口大小：先按比例重算 px，再夹回边界（用户第 6 条要求）
  function onViewportChange() {
    if (!container) return;
    syncPosition();
    clampBubble();
    clampMenu();
  }

  function watchReducedMotion() {
    try {
      const query = global.matchMedia("(prefers-reduced-motion: reduce)");
      reduced = query.matches;
      const onChange = () => {
        reduced = query.matches;
        if (reduced) settle();
        else schedule();
      };
      if (query.addEventListener) query.addEventListener("change", onChange);
      else if (query.addListener) query.addListener(onChange);
    } catch (_) {
      reduced = false;
    }
  }

  // 读盘兜底：chrome.storage 万一不回调（扩展刚启动 / 上下文失效），也不能让宠物
  // 永远不出现 —— 超时就按默认值（enabled = true）先把猫放出来。用户底线：
  // enabled === true 时宠物任何时刻都必须可见，所以这一层必须是 fail-open。
  function withTimeout(promise, ms, fallback) {
    return new Promise((resolve) => {
      let settled = false;
      const done = (value) => { if (!settled) { settled = true; resolve(value); } };
      const handle = global.setTimeout(() => done(fallback), ms);
      Promise.resolve(promise).then(
        (value) => { global.clearTimeout(handle); done(value); },
        () => { global.clearTimeout(handle); done(fallback); }
      );
    });
  }

  async function boot() {
    if (!doc.body) return;
    build();
    try {
      global.chrome.storage.onChanged.addListener(onStorageChanged);
    } catch (_) {}
    // 重新 boot 前先把自己停干净：把在飞的 transition 收回来（否则它会在几秒后
    // 继续往旧目标滑，画面和 JS 记的位置就对不上了），再把状态机链标成未启动。
    clearTimer();
    stopWalk();
    if (container) container.style.transition = "none";
    running = false;
    // 读盘一律带超时兜底：chrome.storage 万一不回调（扩展刚启动 / 上下文失效），
    // 也不能让宠物永远不出现 —— 超时就按默认值（enabled=true）先把猫放出来。
    const config = await withTimeout(readConfig(), STORAGE_TIMEOUT_MS, normalizeConfig(null));
    configEnabled = config.enabled;
    paused = config.paused;
    petXPct = config.x;
    petYPct = config.y;
    petSize = config.size;
    applyBox();
    stats = await withTimeout(readStats(), STORAGE_TIMEOUT_MS, null);
    statsLoaded = true;
    if (button) button.setAttribute(STATE_ATTR, "sit");
    state = "sit";
    applyVisibility();
    watchReducedMotion();
  }

  // 统计变了、语言切了都走这里：只重画气泡内容（气泡开着的时候），不动显隐与动画状态
  async function refresh() {
    if (!statsLoaded) return;
    stats = await readStats();
    if (!visible || !bubble || bubble.hidden) return;
    const lines = bubbleLines(stats);
    showBubble(lines[lineIndex % lines.length]);
  }

  // 只读快照：给「真浏览器里怎么验」用的。挂件的问题（拖动被当成点击、走到边界没停、
  // 换分辨率后跑出屏幕）都发生在几秒的时序里，靠肉眼看动画和猜像素是验不出来的；
  // 有了这个口子，测试页可以隔一段时间采一次样，直接看状态机有没有按预期走。
  // 只读：不改状态、不写盘、不接触 DOM，所以不影响线上行为。
  function snapshot() {
    return {
      state: state,
      size: petSize,
      paused: paused,
      reduced: reduced,
      enabled: configEnabled,
      visible: visible,
      statsLoaded: statsLoaded,
      x: petXPct,
      y: petYPct,
      px: petX,
      py: petY,
      dragging: dragging,
      menuOpen: Boolean(menu && !menu.hidden),
      bubble: Boolean(bubble && !bubble.hidden),
      // 换帧与行走：验收「走路时帧号在变、位置也在同步变」靠这两项 + px
      frame: frameCol,
      walking: rafId !== null,
      blinkWait: Math.max(0, Math.round(blinkReadyAt - nowMs())),
      framePos: sprite ? sprite.style.backgroundPosition : "",
      // 行内帧必须为空才说明当前状态由 CSS 管（坐/睡/眨），不是残留的行走帧
      inlineFrame: Boolean(sprite && sprite.style.backgroundPosition),
      // 只在测试页里看：可用范围与「停靠时的右边缘」，用来判断边界是不是按预期算的
      maxLeft: lastRange ? Math.round(lastRange.max) : null,
      yMax: lastRange ? Math.round(lastRange.yMax) : null,
      dockBottom: container ? parseFloat(global.getComputedStyle(container).bottom) || 0 : null,
      // 可见性的硬指标：外壳的 rect 与 sprite 背景图是否真的画出了像素。
      // 「宠物是不是消失了」只有量这个才说得清（display / 尺寸 / 是否在视口内）。
      rect: container ? (() => {
        const box = container.getBoundingClientRect();
        return { left: Math.round(box.left), top: Math.round(box.top), w: Math.round(box.width), h: Math.round(box.height) };
      })() : null,
      viewport: (() => { const v = viewport(); return { w: Math.round(v.w), h: Math.round(v.h) }; })()
    };
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

  global.BcaPet = { boot: boot, refresh: refresh, snapshot: snapshot };
})(globalThis);
