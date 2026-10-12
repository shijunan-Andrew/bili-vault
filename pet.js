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

   V1.5.2 的三件事（用户原话见需求书）：
   a) 素材：pet-cat.png 重做成「逻辑分辨率 48 × 无量化」的 RGBA 帧表（图另说，
      这里只关心它的几何：每格 48×48，6 列 × 5 行，CSS 的 background-size 仍是
      600% / 500%）。所以尺寸档只取 48 的整数倍 —— 非整数倍会让像素画出现
      粗细不匀的格子，这是「糊」的另一种形态。
   b) 交互：拖动 / 右键菜单 / 尺寸档 / 位置持久化（都落在 interfacePet 里）。
   c) 状态机：待机时在「眨眼 / 向右走 / 向左走 / 坐姿 / 睡觉」之间随机切换，
      眨眼权重最高 —— 这是用户最在意的一条，所以权重表写在 WEIGHTS 里、一眼能改。

   状态与 CSS 的分工：JS 只管「现在是哪个状态、要不要挪位置」，把状态名写成
   data-bca-state，换帧动画全部由 pet.css 按属性选择器接。这样时序（JS 的
   定时器）和观感（CSS 的关键帧）各管一头，不会互相踩。
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
  const WEIGHTS = { blink: 60, sit: 20, walk: 15, sleep: 5 };

  // 待机延时：下一件事发生前等多久
  const PAUSE_MIN = 1400;
  const PAUSE_MAX = 5200;
  const SLEEP_MIN = 9000;
  const SLEEP_MAX = 16000;
  // 眨眼：一次眨眼动画的总时长（CSS 的 bca-pet-blink 也是这个值，两边必须一致，
  // 否则「眨眼结束」的回调会在动画还在跑时就切状态）。
  const BLINK_MS = 1500;
  // 坐姿停顿：挑一个坐姿帧定住一会儿（row3 那组坐姿，与 row0 的待机帧略不同）
  const SIT_MIN = 2600;
  const SIT_MAX = 5200;
  // 一次连续行走（含往返）的总时长上限，避免宠物一直走个不停
  const WALK_MIN = 1600;
  const WALK_MAX = 3600;
  // 步伐速度（px/秒）与「撞到边界后停顿回头」的时长
  const WALK_SPEED = 46;
  const TURN_MS = 420;
  const WALK_STEP_MAX_MS = 9000;
  const EDGE_PAD = 8;        // 离视口边缘留一点，别贴着边
  const DRAG_THRESHOLD = 4;  // 位移超过它才算拖动，否则算点击（用户第 2 条）

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
  let segTimer = null;
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

  // 往右走：25% 起走，12.5% 一格（8 格），末格回到 0% 收尾 —— 与视觉顺序一致。
  // 往左走（row2，镜像行）正好相反，所以 CSS 里是从 100% 往 0% 倒着走。
  const COL_STOPS_6 = ["25%", "37.5%", "50%", "62.5%", "75%", "87.5%", "0%"];

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

  // 停止换帧动画：位移做过渡时必须把 steps() 逐帧动画收起来，否则过渡会一格一格地跳。
  function frostSprite() {
    if (sprite) sprite.style.animation = "none";
  }

  function thawSprite() {
    if (sprite) sprite.style.animation = "";
  }

  function setState(name) {
    if (state === name) return;
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

  function clearSegment() {
    if (segTimer) { global.clearTimeout(segTimer); segTimer = null; }
  }

  function after(ms, fn) {
    clearTimer();
    timer = global.setTimeout(() => { timer = null; fn(); }, ms);
  }

  function stateReady() {
    return visible && !reduced && !dragging;
  }

  // 一次眨眼：CSS 播 bca-pet-blink（1.5s，眼睛在最后 200ms 才合上），
  // 播完就切回坐姿。间隔是随机的，所以看起来是「过几秒眨一下」。
  function blink() {
    setState("blink");
    after(BLINK_MS, () => { setState("sit"); schedule(); });
  }
  function sitStill() {
    setState("sit");
    after(randInt(SIT_MIN, SIT_MAX), schedule);
  }

  function sleep() {
    setState("sleep");
    after(randInt(SLEEP_MIN, SLEEP_MAX), () => { setState("sit"); schedule(); });
  }

  // 走一段：从当前位置走到这一段的终点。撞到边界就停下换向 —— 绝不越界。
  // 位移交给 CSS 的 transition（linear，时长按距离算），JS 只管「这一步走多久」。
  function walkStep(direction, budget) {
    const range = warpRange();
    const step = Math.min(budget, randInt(WALK_MIN, WALK_MAX));
    const span = direction > 0 ? -petX : (petX - range.max);   // direction>0 = 往右
    const distance = Math.min(span, step * WALK_SPEED / 1000);
    const duration = clamp(Math.round(distance / WALK_SPEED * 1000), 180, WALK_STEP_MAX_MS);

    setState(direction > 0 ? "walkRight" : "walkLeft");
    const target = clamp(petX + direction * distance, range.max, 0);
    frostSprite();          // 位移这一段不换帧，别让像素画在过渡里抖
    container.style.transition = "transform " + duration + "ms linear";
    petX = target;
    applyTransform(true);

    clearSegment();
    segTimer = global.setTimeout(() => {
      segTimer = null;
      // 这一步到点时宠物可能已经被藏起来 / 被拖住 / 系统要求减弱动画了：
      // 清定时器是主路径，这里再挡一道，别让老定时器去改已经不该动的位置。
      if (!stateReady()) return;
      // 到点了：夹一次边界（窗口在走的过程中被改小也安全），再决定下一步
      const now = warpRange();
      petX = clamp(petX, now.max, 0);
      applyTransform(false);
      thawSprite();
      setState("sit");
      persistPosition();

      const hitLeft = petX <= now.max + 0.5;
      const hitRight = petX >= -0.5;
      const remaining = step - duration;
      if (remaining > 260) {
        if (hitLeft || hitRight) {
          // 停在边界上：等 TURN_MS 再回头，剩下的时间从新的方向起算
          setState("sit");
          after(TURN_MS, () => {
            if (!stateReady()) return;
            walkStep(hitLeft ? 1 : -1, remaining - TURN_MS);
          });
        } else {
          walkStep(direction, remaining);
        }
      } else {
        schedule();
      }
    }, duration + 30);
  }

  function walk() {
    const range = warpRange();
    // 空间不够（窗口很窄 / 尺寸档很大）就不走了，直接坐一会儿
    if (-range.max < petSize * 0.6) { sitStill(); return; }
    walkStep(Math.random() < 0.5 ? 1 : -1, randInt(WALK_MIN, WALK_MAX));
  }

  // 权重表：眨眼最高（用户第 5 条）。「暂停走动」只把行走那一档的权重让掉，
  // 剩下的按比例重新归一，所以暂停以后眨眼依旧是最频繁的那个动作。
  function schedule() {
    if (!stateReady()) return;
    const walkWeight = paused ? 0 : WEIGHTS.walk;
    const total = WEIGHTS.blink + WEIGHTS.sit + walkWeight + WEIGHTS.sleep;
    const roll = Math.random() * total;
    if (roll < WEIGHTS.blink) { blink(); return; }
    if (roll < WEIGHTS.blink + WEIGHTS.sit) { sitStill(); return; }
    if (roll < WEIGHTS.blink + WEIGHTS.sit + walkWeight) { walk(); return; }
    sleep();
  }

  // 非待机原因（拖拽、隐藏、减少动态、暂停走动）→ 先坐好，别把定时器留在半路
  function settle() {
    clearTimer();
    clearSegment();
    // 先撤掉在飞的 transition 再定位：不走这一步的话，下一次 syncPosition() 写进去的
    // 目标值会继续按旧过渡滑过去，看起来就是「松手以后猫自己又溜走了」。
    if (container) container.style.transition = "none";
    thawSprite();
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

  function onPointerDown(event) {
    if (!visible || event.button !== 0) return;
    if (dragging) return;  // 已经有一根指头在拖了，后来的忽略
    hideMenu();
    dragging = true;
    dragPointerId = event.pointerId;
    moved = false;
    dragStartX = event.clientX;
    dragStartY = event.clientY;
    dragOriginX = petX;
    dragOriginY = petY;
    if (button) {
      button.classList.add(PRESS_CLASS);
      // 指针捕获：手滑出宠物外面也不会丢事件（触屏同样适用）
      try { button.setPointerCapture(event.pointerId); } catch (_) {}
    }
    // 按住就停下：停掉状态机与行走过渡，但不冻结逐帧动画 ——
    // frostSprite() 是给「位移过渡」用的（位移时换帧会一格格跳），拖动是跟手更新，
    // 冻结反而会把坐姿定格在走路那一帧上，看起来像没了脚。
    clearTimer();
    clearSegment();
    if (container) container.style.transition = "none";
    setState("sit");
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

  function renderMenu() {
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
        renderMenu();
      }
    ));

    menu.appendChild(menuItem(translate("重置位置"), false, () => {
      petXPct = PET_DEFAULTS.x;
      petYPct = null;
      petX = 0;
      petY = 0;
      syncPosition();
      persistPosition();
      clampBubble();
    }));

    menu.appendChild(menuItem(translate("隐藏宠物"), false, () => {
      writeConfig({ enabled: false });
      configEnabled = false;
      applyVisibility();
    }));

    menu.hidden = false;
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
    renderMenu();
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

  async function boot() {
    if (!doc.body) return;
    build();
    try {
      global.chrome.storage.onChanged.addListener(onStorageChanged);
    } catch (_) {}
    // 重新 boot 前先把自己停干净：把在飞的 transition 收回来（否则它会在几秒后
    // 继续往旧目标滑，画面和 JS 记的位置就对不上了），再把状态机链标成未启动。
    clearTimer();
    clearSegment();
    if (container) container.style.transition = "none";
    running = false;
    const config = await readConfig();
    configEnabled = config.enabled;
    paused = config.paused;
    petXPct = config.x;
    petYPct = config.y;
    petSize = config.size;
    applyBox();
    stats = await readStats();
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
      // 只在测试页里看：可用范围与「停靠时的右边缘」，用来判断边界是不是按预期算的
      maxLeft: lastRange ? Math.round(lastRange.max) : null,
      yMax: lastRange ? Math.round(lastRange.yMax) : null,
      dockBottom: container ? parseFloat(global.getComputedStyle(container).bottom) || 0 : null
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
