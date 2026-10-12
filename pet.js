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
      「坐下 / 站起来」各是一段**一次性**的 CSS transform 动画（.is-sit-down / .is-sit-up）
      ——两边都不碰对方的属性（换帧只动 background-position，坐姿只动 transform）。
   4. 自启，library.js 一个字都不用改。外层容器 #bcaPet，气泡 #bcaPetBubble，
      宠物本体是 <button type="button" aria-label="宠物">。

   V1.5.4 的状态机（走路暂时移除，只剩眨眼 / 坐下 / 睡觉三个动作）：
   ┌────────────┬──────────────────────┬───────────┬────────────────┬──────────────┐
   │ 阶段       │ 触发                 │ 时长      │ 露哪一格       │ 位移 / 过渡  │
   ├────────────┼──────────────────────┼───────────┼────────────────┼──────────────┤
   │ 待机 blink │ 每轮循环的起点        │ 4–8s 窗口 │ row0 第1格     │ 不动         │
   │            │ 窗口内随机眨 1–3 次   │ 每次180ms │ 眨眼=第2格     │              │
   │ sitDown    │ 待机窗口走完          │ 360ms     │ row0 第1格     │ 压一下：     │
   │            │                      │（CSS 动画）│ 静止           │ 2px / 2%     │
   │ hold       │ 坐下过渡结束          │ 4–8s      │ row3 第1–4 帧  │ 落座后 none  │
   │ sleep      │ 保持结束（过了不应期）│ 10–30s    │ row4 第1–4 帧  │ none         │
   │ standUp    │ 睡够时长 / 被点醒     │ 360ms     │ row0 第1格     │ 弹一下：     │
   │            │                      │（CSS 动画）│ 静止           │ 2px / 2%     │
   └────────────┴──────────────────────┴───────────┴────────────────┴──────────────┘
   顺序是**写死的**，没有随机轮盘：待机 → 坐下 → 保持 → 睡觉 → 站起来 → 待机 ……
   眨眼不再是独立一档，而是待机窗口里的高频小动作（用户第 1 条只留三个动作）。
   「坐下 / 站起来」在精灵表里**没有中间过渡帧**，所以只用 ≤2% 的缩放 + 2px 的整体位移
   表达那一下：动画是**一次性**的，段尾自动回到 transform: none（fill 默认 none），
   于是 sitDown / hold / sleep 的**稳定形态一律不带 transform**。
   时长来自 --bca-sit-ms（JS 写、CSS 读，和 --bca-blink-ms 一个规矩）。
   注意「保持坐姿」不再画 row0 第 1 格：那一格就是待机格，保持相位画它 = 一动不动；
   现在保持相位画 row3 的四帧真坐姿（见 pet.css 的 .is-sit-hold），
   避开 row3 的第 5、6 格 —— 那两格实测非透明像素为 0（空格）。
   走路（row1/row2）整段移除：位移、rAF、步态常量、撞边回头一概没有了，
   猫永远停在用户放下的位置，水平方向一个像素都不动。
   气泡自己会走：出现后 5s 自动收起，每次点击重新计时（用户第 4 条）。

   状态与 CSS 的分工：JS 管「现在是哪个阶段、要不要挪位置」，
   把状态名写成 data-bca-state（sit / blink / sleep / drag），换帧由 pet.css 按属性
   选择器接；坐姿相关的是按钮上的三个类 —— .is-sit-down（坐下那一下）、
   .is-sit-up（站起来那一下）、.is-sit-hold（保持相位换成 row3 的真坐姿），
   动画也全在 CSS，两边都不碰对方的属性。
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
  // 「坐下去 / 站起来」这两下：加在按钮上，pet.css 各接一段**一次性**动画
  // （压一下 bca-pet-sit-down / 弹一下 bca-pet-sit-up，时长都是 --bca-sit-ms）。
  // V1.5.4 这里是一段常驻 transform + transition，而 .is-sit-down 从 sitDown 一直挂到
  // standUp（最长 31s+），于是整段坐姿都是「同一格被永久压扁 6%」——这就是用户报的
  // 「坐下一张被压缩的静止图」。现在两个类各自只在它那一段里存在，动画段尾自动回到
  // transform: none（animation-fill-mode 默认 none），任何相位的稳定形态都不带 transform。
  const SIT_CLASS = "is-sit-down";
  const RISE_CLASS = "is-sit-up";
  // 「保持坐姿」换帧用：加在按钮上，pet.css 把精灵切到 row3 那组**真坐姿帧**。
  // 为什么用「另一个类」而不再往 data-bca-state 里加一个值：那个属性是**所有落点**的
  // 唯一事实来源（坐下做完、拖动松手、暂停走动、重置位置都写它），多一个值就意味着
  // 每一条落点路径都得记得写对，漏一条就会「坐着的时候拖一下、猫就变回站姿」。
  // 类不一样：它只由相位切换开合，上面那些落点路径谁都不用知道它存在。
  // 注意特异性 —— pet.css 那边用 :where() 把它压回 (0,2,0)，与 sit / drag / sleep 同级，
  // 靠源码顺序定胜负；直接写 .bca-pet.is-sit-hold 会是 (0,3,0)，反过来压过睡觉那条。
  const HOLD_CLASS = "is-sit-hold";
  const STATE_ATTR = "data-bca-state";

  const PET_KEY = "interfacePet";
  const STATS_KEY = "bcaStats";
  const TOUCH_MESSAGE = "bca-pet-touch";

  // 状态机自救时的日志前缀。统一在这里写死，方便真机按前缀过滤控制台。
  const LOG_TAG = "[哔哩藏库]";

  // 宠物本体 = 一格位图精灵。pet-cat.png 是 6 列 × 5 行的帧表，这里只放一个空壳，
  // 「露哪一格、多久换一帧」全在 pet.css 的 .bca-pet-sprite / @keyframes 里。
  const PET_SPRITE = '<span class="' + PET_CLASS + '-sprite" aria-hidden="true"></span>';

  /* ------------------------------ 常量表 ------------------------------ */

  // 尺寸档只取 48 的整数倍：精灵的逻辑格是 48px，整数倍放大才不会有粗细不匀的格子。
  // 96/144/192/240 = 2x/3x/4x/5x。默认档 96（V1.5.4 用户指定，原来默认 144）。
  // SIZE_DEFAULT 只用于「storage 里真的没有 size」这一种情况（首次安装 / 整份被覆盖）；
  // 已经存着的尺寸永远优先，不许被默认档顶替 —— 那是「144 和 96 之间疯狂闪动」的成因之一。
  const SIZES = [96, 144, 192, 240];
  const SIZE_DEFAULT = 96;

  // —— 时序：一轮**固定顺序**循环 = 待机(4–8s) → 坐下(360ms) → 保持(4–8s) →
  // 睡觉(10–30s) → 站起来(360ms) → 待机 …… 没有权重轮盘了，下面每个常量都直接
  // 决定时长，改时长只要改这些数字。
  const IDLE_MIN = 4000;          // 待机 / 眨眼窗口：4–8s
  const IDLE_MAX = 8000;
  const SIT_HOLD_MIN = 4000;      // 坐下之后保持坐姿：4–8s
  const SIT_HOLD_MAX = 8000;
  const SLEEP_MIN = 10000;        // 睡觉 10–30s（用户第 2 条，每次随机）
  const SLEEP_MAX = 30000;
  // 眨眼：一次性的快速动作，总时长必须落在 120–180ms（用户第 5 条）。
  // 这个值同时写进 CSS（--bca-blink-ms）与状态机回调，两边不会各算各的。
  const BLINK_MS = 140;           // 闭合时长：140ms 动画 + 40ms 归位 = 180ms（用户第 5 条 120–180ms）
  const BLINK_SETTLE_MS = 40;     // 回调比动画晚一点点，别让动画还在跑就切走
  // 待机窗口里两次眨眼之间隔多久。眨眼不再是「轮盘抽中的一档」，而是窗口内的高频小动作，
  // 一个窗口眨 1–3 次 —— 场面上仍然是最常见的动作（用户第 5 条）。
  const BLINK_GAP_MIN = 1200;
  const BLINK_GAP_MAX = 2600;
  // 坐下 / 站起来各是一段**一次性**的 CSS transform 动画（用户要求 300–400ms），
  // 这里写进 --bca-sit-ms：状态机用它算「这一段什么时候结束」，CSS 用它当动画时长，
  // 一个值两处用。动画段尾自己回到 transform: none，所以它同时也是「稳定形态」的保证。
  const SIT_MS = 360;
  // 刚被吵醒后的不应期（用户第 3 条）：这段时间内即使走到「睡觉」那一步也先坐一会儿，
  // 免得刚醒就立刻又睡。
  const WAKE_REFRACTORY_MIN = 8000;
  const WAKE_REFRACTORY_MAX = 15000;
  // 气泡自动收起（用户第 4 条）：出现后 5s 自己收，每次点击重新计时。
  const BUBBLE_MS = 5000;
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
  let petYPct = null;             // 0% = 停靠高度；正数 = 往上（1 = 贴着视口顶）；
                                  // 负数 = 往下（-1 = 贴着视口底）；null = 还没拖过，
                                  // 就用 CSS 的停靠高度（停靠高度改了它也自动跟着走）
  let paused = false;             // 走路移除后这个字段**暂时没有作用**，只做兼容保留：
                                  // interfacePet 里的旧值原样读进来、原样报给 snapshot()，
                                  // normalizeConfig 也照旧给默认值。等走路回来再接上。

  let petX = 0;                   // 当前横向位移（px，负值 = 向左；0 = 停靠位）
  let petY = 0;                   // 当前纵向位移（px，**正值向下**；0 = 停靠高度）
  // 上面这两个量的符号必须和「拖动时指针往哪走」一致，否则猫会朝反方向跑。
  // 横向：指针往左 = dx 为负 = petX 更小 = 矩形更靠左 ✓（transform 直接写 petX）
  // 纵向：指针往下 = dy 为正 = petY 更大 = 矩形更靠下 ✓（transform 直接写 petY，
  //       因为 CSS 的 translateY 正方向本来就是向下）
  // V1.5.1 这里正好写反了（往下拖猫反而往上跑），V1.5.2 修的就是这个。
  // 注意 petY 的正负和 petYPct 的正负是**相反**的（见上面那条注释与 pctToY），
  // 因为比例是给人看的「往上多少」，而 px 是给 transform 用的「往下多少」。

  // 状态机的把手：state = CSS 认的那个状态名（sit / blink / sleep / drag），
  // phase = 固定顺序循环走到了哪一段（idle / sitDown / hold / sleep / standUp），
  // timer = 下一个转换（唤醒 / 气泡之外只有这一个定时器，任何转换都会把它顶掉）。
  let state = "sit";
  let phase = "idle";
  let timer = null;
  let timerDueAt = 0;             // timer 到点的时刻（只给 snapshot() 报剩余时间，不参与逻辑）
  let popTimer = null;
  let bubbleTimer = null;
  let bubbleDueAt = 0;            // 气泡自动收起的时刻（同上，只用于报数）
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

  // 状态机自负盈亏的日志：链断了、相位回调抛错都从这里出声。前缀固定成 [哔哩藏库]，
  // 时间戳用挂件自己的单调时钟（performance.now），和相位时长是同一个基准。
  // 自身绝不许抛 —— 日志再重要也不能变成第二个故障点。
  function warn(message, error) {
    try {
      const detail = error && (error.stack || error.message) ? " " + (error.stack || error.message) : "";
      if (global.console && typeof global.console.warn === "function") {
        global.console.warn(LOG_TAG + " " + message + detail);
      }
    } catch (_) {}
  }

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]
  ));

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
  const randInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
  // pick() 随权重轮盘一起去掉了（V1.5.4）：固定顺序循环里没有「从候选里抽一个」这一步，
  // 唯一的随机是每段时长（randInt）。

  // —— 帧表几何（用户钉死的行含义，不许改）——
  //   row0 坐姿（第 1/3 格睁眼、第 2/4 格闭眼，眨眼用）/ row1 向右走 6 帧 /
  //   row2 向左走 6 帧 / row3 坐姿变体 4 帧 / row4 睡觉 4 帧。
  // 每格 48×48 逻辑像素；row0 / row3 / row4 只有前 4 格有像素，第 5、6 格是全透明的空格。
  // V1.5.4 把走路整段拿掉之后，这里**不再有帧表常量**：坐姿 / 睡觉 / 眨眼各露哪一格
  // 全在 pet.css（.bca-pet-sprite 的 background-position 与三个 @keyframes），
  // JS 一个字都不写，所以也不会有「JS 与 CSS 各算各的、算错列宽」这种事。
  //
  // background-position 的百分比**不是「第几格」**：它是「图上的 p 点对齐容器的 p 点」，
  // 位移 = p × (容器宽 − 图宽) = p × (1 − 6) × 格宽 = −5p 格。所以第 c 列要写
  // c/(6−1)×100% = 0/20/40/60/80/100%，行位是 0/25/50/75/100%。
  // V1.5.2 的走路关键帧写成 12.5% 一档（那是 4 列图的公式），落到 6 列图上每一帧都停在
  // 两格之间的接缝上 —— 屏幕上就是整只猫横着滑，即用户报的「走路是直接平移」。
  // 走路没了，但这条算术仍然是改 pet.css 时唯一要盯的东西。

  /* ------------------------------ 数据 ------------------------------ */

  // 尺寸档合法性只有这一个判据：所有「拿到一个 size」的地方都先过它。
  function isValidSize(value) {
    return SIZES.indexOf(Number(value)) >= 0;
  }

  // fallbackSize 只给「storage 变化」那条路用（见 onStorageChanged）：它把当前尺寸传进来，
  // 于是不带 size 的局部写不会把尺寸打回默认档。boot / readConfig 不传第二参数 —— 首次
  // 安装缺 size 就该用 SIZE_DEFAULT，这和「已经存着 96 却被顶回 144」是两回事。
  function normalizeConfig(raw, fallbackSize) {
    const config = raw && typeof raw === "object" ? raw : {};
    const size = isValidSize(config.size)
      ? Number(config.size)
      : (isValidSize(fallbackSize) ? Number(fallbackSize) : SIZE_DEFAULT);
    const x = typeof config.x === "number" && isFinite(config.x) ? clamp(config.x, 0, 1) : PET_DEFAULTS.x;
    // 纵向比例是**双向**的：正 = 往上（1 = 贴视口顶），负 = 往下（-1 = 贴视口底）。
    // V1.5.3 只认 0–1，往下的比例（负数）会被 clamp 成 0，等于把「拖到最下面一点」的
    // 位置丢掉；改成 -1–1 之后两个方向都能存。
    const y = typeof config.y === "number" && isFinite(config.y) ? clamp(config.y, -1, 1) : null;
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
  //
  // 写盘前先逐项比较（V1.5.4「144 和 96 之间疯狂闪动」的直接解药）：值没变就一个字节都不写。
  // chrome.storage.onChanged 在**写入方自己的页面里也会触发**，所以「每收到一次回声就再写一次」
  // 会把一次点击放大成每秒几十次写入、每秒十几次改尺寸 —— 两边都这样就是这个死循环。
  function patchChangesNothing(current, patch) {
    const base = current && typeof current === "object" ? current : {};
    for (const key of Object.keys(patch)) {
      // size 可能以数字 / 字符串两种形态存着，比数值；其余字段直接比
      if (key === "size") {
        if (Number(base[key]) !== Number(patch[key])) return false;
      } else if (base[key] !== patch[key]) {
        return false;
      }
    }
    return true;
  }

  function writeConfig(patch) {
    try {
      const stored = global.chrome.storage.local.get(PET_KEY);
      return Promise.resolve(stored)
        .then((value) => {
          const current = value ? value[PET_KEY] : null;
          if (patchChangesNothing(current, patch)) return undefined; // 相等 = 直接 return，不写盘
          const next = Object.assign({}, current, patch);
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
    clearBubbleTimer();
    // 收起 = 这一轮看完了，轮播指针必须一起归零。
    // V1.5.4 起气泡会自己收（5s 闹钟 / 点别处），如果只收不清指针，
    // 指针会停在 4（= 已经超出四句），下一次点击 showBubble 之后紧接着的一下
    // 就会被 advanceBubble 当成「第 5 下」立刻收掉 —— 用户看到的是一闪就没。
    lineIndex = 0;
    if (!bubble) return;
    bubble.hidden = true;
    if (button) button.setAttribute("aria-expanded", "false");
  }

  // —— 气泡自动收起（用户第 4 条）——
  // V1.5.3 只有「点满 4 句」这一条收起路径（advanceBubble 里 lineIndex >= lines.length），
  // 所以一旦用户不再点，气泡就一直挂在屏幕上 —— 这就是用户报的「气泡不会自动消失」。
  // 现在出现时起一个 5s 的闹钟，每次点击（= 每次 showBubble）重新计时。
  function clearBubbleTimer() {
    if (bubbleTimer) {
      global.clearTimeout(bubbleTimer);
      bubbleTimer = null;
    }
    bubbleDueAt = 0;
  }

  // 注意：自动收起是**行为**不是动画，prefers-reduced-motion 下照样要收
  //（契约要求 reduce 时「状态仍按时间推进」，只是别做动画）。
  function armBubbleTimer() {
    clearBubbleTimer();
    if (!bubble) return;
    bubbleDueAt = nowMs() + BUBBLE_MS;
    bubbleTimer = global.setTimeout(() => {
      bubbleTimer = null;
      bubbleDueAt = 0;
      hideBubble();
    }, BUBBLE_MS);
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
    armBubbleTimer();
  }

  function dismissBubble() {
    // 轮播指针（lineIndex）由 hideBubble() 统一归零，这里只管收起来 + 还焦点
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

  // 换帧现在**全在 pet.css**：JS 只把状态名写成 data-bca-state，坐/睡/眨各露哪一格
  // 由属性选择器接。V1.5.3 里那套「JS 按走过的距离写行内 background-position」随走路
  // 一起删掉了（原来的 setFrame / clearFrame / frameCol），于是再也不会有「行内那一格
  // 压住 CSS」的问题，帧表算术只剩 pet.css 一处。
  function setState(name) {
    if (state === name) return;
    state = name;
    if (button) button.setAttribute(STATE_ATTR, name);
  }

  // 坐姿：往按钮上加 / 摘 .is-sit-down。它现在只负责「坐下去那一下」的一次性动画
  // （pet.css 的 bca-pet-sit-down，段尾自动回 none），不再是常驻的压扁形态。
  // 站起来那一下走 .is-sit-up（bca-pet-sit-up），两个方向各一段，互不覆盖。
  // 精灵表里没有真的过渡帧，也不伪造 —— 骨架的下降感只允许 ≤2% 的缩放 / 极轻位移。
  function setPose(down) {
    if (!button) return;
    button.classList.toggle(SIT_CLASS, Boolean(down));
  }

  function setRising(on) {
    if (!button) return;
    button.classList.toggle(RISE_CLASS, Boolean(on));
  }

  // 「保持坐姿」用 row3 那组真坐姿帧（pet.css 的 .is-sit-hold 规则 + @keyframes bca-pet-hold）。
  // 只在 hold 相位开着：睡觉要回 row4、站起来要回 row0，都靠摘掉这个类。
  // 它同时也是「拖了一下猫」之后能坐回去的原因 —— 落点路径写 data-bca-state="sit"
  // 的时候这个类还在，于是画出来的仍然是 row3 那张坐姿，不会闪回站姿。
  function setHolding(on) {
    if (!button) return;
    button.classList.toggle(HOLD_CLASS, Boolean(on));
  }

  // 当前实际画出来的那一格（给 snapshot() 用）。
  // background-size 是 600% 500%：整张 6 列 × 5 行的表被拉到元素宽高的 6× / 5×，
  // 于是**屏幕上的一格正好等于元素自身那么大** —— 位移 ÷ 元素边长就是格号。
  // computed value 在 Chromium 里可能是解析后的位移（"-144px"），也可能是百分比原样
  // （"20%"），两种都得认：百分比按 CSS 的规则换成位移 p × (元素边长 − 图边长)
  // = p × (1 − 格数) × 元素边长。
  // （V1.5.4 之前这里写的是「位移 ÷ (元素宽 ÷ 列数)」，等于把 20% 的位移又乘了 6 ——
  //   1 列会报成 6 列，只是当时没人拿它当证据，所以一直没被发现。）
  function frameOf(element) {
    if (!element) return null;
    const style = global.getComputedStyle(element);
    const parts = (style.backgroundPosition || "").trim().split(/\s+/);
    if (parts.length < 2) return null;
    const box = element.getBoundingClientRect();
    const side = [box.width, box.height];
    if (!side[0] || !side[1]) return null;
    const axis = (text, index, cells) => {
      const raw = text.trim();
      const value = parseFloat(raw);
      if (!isFinite(value)) return null;
      const offset = /%$/.test(raw) ? (value / 100) * (1 - cells) * side[index] : value;
      return Math.round(Math.abs(offset) / side[index]);
    };
    return { col: axis(parts[0], 0, 6), row: axis(parts[1], 1, 5) };
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
  // 负值 = 往左，范围 [range.max, 0]。
  // 纵向是**双段**的（用户第 5 条）：petY 是「距停靠高度的带符号偏移」，
  // 范围 [range.yMin, range.yMax]，且 yMin ≤ 0 ≤ yMax —— 正 = 往下、负 = 往上。
  // 比例同构且**方向相反**：petYPct 正 = 往上（1 = 视口顶）、负 = 往下（-1 = 视口底）、
  // 0 = 停靠高度（V1.5.3 的比例注释就是这么写的，只是当时 toPx 拿 yMax 去乘正数，
  // 往上的那一半永远算不出来 —— 于是「只能停在最下面」）。两个函数互为精确反函数。
  function pctToY(pct, range) {
    const value = pct === null || pct === undefined ? 0 : Number(pct);
    if (!isFinite(value) || value === 0) return 0;
    return value > 0 ? value * range.yMin : -value * range.yMax;
  }

  // 反函数：像素 → 比例。0 必定映射回 0（「停在停靠高度」这件事要能精确表达一次）。
  function yToPct(y, range) {
    if (!y) return 0;
    if (y < 0) return range.yMin === 0 ? 0 : clamp(y / range.yMin, 0, 1);
    return range.yMax === 0 ? 0 : -clamp(y / range.yMax, 0, 1);
  }

  function toPx() {
    const range = warpRange();
    petX = clamp(range.max * petXPct, range.max, 0);
    petY = pctToY(petYPct, range);
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

  // 可用空间：横向一段 + 纵向两段，全部从**实时**的视口与渲染位置现算。
  //
  // 纵向的坑（用户报的「拖动时只能在网页最下方移动、拖不到上面」的根因）：
  //   停靠高度是 CSS 的 bottom（52px），petY 是相对它的带符号偏移：往下只剩
  //   bottom - EDGE_PAD = 44px 的余地。V1.5.3 只算了这一段（yMax = 44px），
  //   而 onPointerMove 把 petY 夹在 [0, yMax] —— 往上拖时 dy 是负的，一夹就回到 0，
  //   猫永远停在最下面那 44px 里，屏幕上就是「只能在最下方挪、拖不到上面」。
  //   当时那个 yMin 算的是同一段 44px（min(bottom - EDGE_PAD, vh - EDGE_PAD - petSize)
  //   里左边那个恒小），而且没有任何地方读它，是个死变量。
  //   现在：yMin = 「顶边留 EDGE_PAD」能到的最高处，是个负值（144px 档在 956px 高的
  //   视口里是 -752px），yMax 还是那 44px，拖动范围 [yMin, yMax]，两个方向都真实可用。
  function warpRange() {
    if (!container || !button) return { max: 0, yMax: 0, yMin: 0 };
    // max 是负数：从停靠位往左最多能挪多少（左边缘停在 EDGE_PAD 上）
    const max = Math.min(0, EDGE_PAD + petSize - dockRight());
    // 纵向：CSS 的 bottom 就是「猫的下边缘离视口底的距离」，停靠时是 52px（与右下角浮标对齐）。
    // petY 是在这个停靠高度之上的偏移，所以：
    //   往下最多还能走 bottom - EDGE_PAD（再往下底边就贴死屏幕边了）；
    //   往上最多走到顶边留 EDGE_PAD，即 -(vh - EDGE_PAD - petSize - bottom)。
    // 两条都必须**减掉停靠位自身占的 bottom**：少减这一项就会把猫顶到屏幕外面去
    //（V1.5.3 的注释正是踩过这个，实测 2115×956 视口里少减一次就多出 752px，
    // 猫被推到 top=1512，屏幕外 700px —— 用户报的「拖着拖着猫跑到屏幕外」）。
    const vh = viewport().h;
    const bottom = parseFloat(global.getComputedStyle(container).bottom) || 0;
    const yMax = Math.max(0, bottom - EDGE_PAD);
    const yMin = -Math.max(0, vh - EDGE_PAD - petSize - bottom);
    return { max: max, yMax: yMax, yMin: yMin };
  }

  // 按视口比例存，读回来再夹一次：换分辨率 / 换尺寸档之后也绝不会跑到屏幕外。
  function syncPosition() {
    toPx();
    applyTransform(false);
  }

  // 按视口比例存：换分辨率回来还能落在「同一个相对位置」。
  // 读回来时 syncPosition() 会再夹一次边界，所以老数据 / 极端窗口也不会跑到屏幕外。
  // y = 0 表示停在停靠高度，正数表示往上（1 = 贴着视口顶），负数表示往下（-1 = 贴着视口底）。
  function persistPosition() {
    const range = warpRange();
    petXPct = range.max === 0 ? 0 : clamp(petX / range.max, 0, 1);
    // y 要区分「拖到停靠高度（写 0）」和「从没拖过 / 刚重置过（写 null）」：
    // null 是「跟着 CSS 的停靠高度走」这个活语义，写死成 0 之后，以后 CSS 的
    // bottom 一改、或者换尺寸档时可用空间变了，猫就再也不会回到正确的停靠高
    // 度了。这里直接沿用 petYPct 当前值（拖动与夹取都会同步它），不再从 petY
    // 反算 —— 从 petY 反算永远算不出 null，等于每次落盘都把重置抹掉。
    if (petYPct !== null) {
      petYPct = yToPct(petY, range);
    }
    writeConfig({ x: round4(petXPct), y: petYPct === null ? null : round4(petYPct), size: petSize });
  }

  const round4 = (value) => Math.round(value * 10000) / 10000;

  // —— 尺寸只有一条**写入者**路径：用户操作（点某一档）——
  // applySize：只改「显示」（尺寸变量 + 盒子 + 位置夹取 + 气泡 + 菜单），**绝不落盘**。
  //   给 onStorageChanged 用：storage 是别人写的，回写就等于和设置页互相回声。
  // setSize：用户点了某一档。改完显示再落盘；值没变（同一个档按第二下）就什么都不做。
  function applySize(next) {
    if (!isValidSize(next)) return false; // 认不出来的值保持现状，不用默认档顶替
    const size = Number(next);
    if (size === petSize) return false;
    petSize = size;
    applyBox();
    // 换档之后可用空间变了：先把比例换算成新的 px，再夹一次边界
    syncPosition();
    clampBubble();
    renderMenu();
    return true;
  }

  function setSize(next) {
    if (!applySize(next)) return;
    persistPosition();
  }

  /* ------------------------------ 状态机 ------------------------------ */

  // 所有 clearTimeout 都从这里走：定时器 API 被换掉 / 上下文失效时它也会抛，
  // 抛在 clearTimer 里同样能把这条链弄断（clearTimer 后面就没人接棒了）。
  function stopTimer(handle) {
    try {
      return global.clearTimeout(handle);
    } catch (error) {
      warn("清除定时器失败", error);
      return null;
    }
  }

  function clearTimer() {
    if (timer) {
      stopTimer(timer);
      timer = null;
    }
    timerDueAt = 0;
  }

  // —— V1.5.5（真机「卡在坐姿那一帧」的修复）——
  // 这一条链以前只有一处保险：定时器回调自己负责把下一段排上。回调里任何一个异常
  // （i18n 没了、元素被换成 null、某个 API 抛错……）都会让下一段**再也不排**，
  // 猫就永久停在当前那一帧 —— 真机报的「坐下的动画卡在这一帧」正是这个形态。
  // 另一个同形态的坑：相位入口函数先 set phase、再 if (!stateReady()) return，
  // 于是「没排定时器」和「排了定时器」在外部看不出区别，running 还停在 true，
  // 之后连 applyVisibility() 都不会再启动循环。
  //
  // 所以这一版把「链是不是活着」变成**可观测的事实**，并且让链自己会重排：
  //   - chainGen  ：每次定时器被换掉 / 被停掉就 +1，老回调据此判断自己是不是被顶掉了；
  //   - liveGen   ：真正到点执行的那一个回调的代号。回调跑完（不管抛没抛）如果
  //                 liveGen 没变，说明它**没有**排下一段 → 兜底重排 / 重启，永不悬空；
  //   - rearmTimer：兜底定时器本体（只重排状态机，不自己往下走相位）；
  //   - chainLive()：timer 还在 = 链活着。applyVisibility() 用它代替原来那个
  //                 「running 是不是 false」的间接判断。
  // 这一层只碰定时器，不改任何相位时长，也不碰 prefers-reduced-motion：
  // reduce 只管「不播动画」，状态机照旧按时间推进（见 stateReady 的注释）。
  let chainGen = 0;
  let liveGen = -1;

  function chainLive() {
    return Boolean(timer);
  }

  function phaseGuard(name, fn) {
    return function guardedPhase() {
      const phaseBefore = phase;
      let entered = false;
      try {
        entered = true;
        fn();
      } catch (error) {
        warn("相位回调抛错（" + name + "）", error);
      }
      // 「有没有接班」= 排了定时器，或者把相位换成了别的（enterHold → enterSleep 是后者）。
      // 两样都没有 = 这条链在这里断掉了。两种来路：
      //   1) entered 还是 false —— 之前那几行（比如 state 名都没算出来）就抛了；
      //   2) fn 里第一个动作就是 stateReady() && return —— 猫正被拖着 / 正被藏着。
      // 不管哪种，都保证链继续：能推进就按 200ms 重排同一个入口，不能推进（相位没变
      // 说明连入口都没进去）就整个重启回待机，绝不停在这一帧上等天亮。
      if (chainLive() || phase !== phaseBefore) return;
      if (!stateReady()) { ensureChain(); return; }
      if (entered) {
        warn("相位「" + name + "」没有排下一段，重新从待机开始");
        startChain();
        return;
      }
      ensureChain();
    };
  }

  // 兜底重排：链断了以后唯一的自救入口。它**只重排状态机**（回到当前相位入口），
  // 不自己往下走相位 —— 时长的账仍然只由各个 enter* 说了算。
  // 起点 200ms 起、失败一次翻一倍（上限 3.2s 之后就一直按 3.2s 问），
  // 所以「暂时不能推进」（正被拖着 / 正被藏着）不会变成忙等，
  // 「永远推不动」（某个入口每次都抛）也会一直问下去，绝不停在那一帧上。
  const REARM_MS = 200;
  const REARM_MAX_MS = 3200;
  let rearmTimer = null;
  let rearmDueAt = 0;
  let rearmMs = REARM_MS;

  function clearRearm() {
    if (rearmTimer) { stopTimer(rearmTimer); rearmTimer = null; }
    rearmDueAt = 0;
  }

  function ensureChain() {
    clearRearm();
    if (chainLive()) return;
    if (!visible) return;
    const delay = rearmMs;
    rearmMs = Math.min(rearmMs * 2, REARM_MAX_MS);
    // 退避只用来「少问几次」，不改变任何相位时长（相位时长只由 enter* 决定）。
    timerDueAt = nowMs() + delay;
    rearmDueAt = timerDueAt;
    let fired = false;
    const handle = schedule(delay, () => {
      fired = true;
      rearmTimer = null;
      rearmDueAt = 0;
      timerDueAt = 0;
      if (chainLive()) { rearmMs = REARM_MS; return; }   // 别的路径已经把链接上了
      if (!stateReady()) return;                          // 再等一拍（不重置退避）
      phaseEntry(phase)();
      // 还是没接上 → 直接回待机重启。这一步让「入口每次都抛」也能停在
      // 「至少还在按节奏动」而不是「永久冻住」。
      if (chainLive() || phase !== "idle") rearmMs = REARM_MS;
      if (!chainLive()) startChain();
    });
    // 只在「确实排上了、而且期间没有别的路径又排了一次」的情况下登记定时器句柄。
    // schedule() 抛过时它内部已经叫过 ensureChain（那次会重新算退避），这里绝不能覆盖；
    // 否则 rearmTimer 会指向一个不存在的假定时器，「链还活着」就成了谎话。
    if (handle && !fired && !rearmTimer) rearmTimer = handle;
  }

  // 排一个定时器，并且**保证不抛**。phase 回调里任何一个 global.setTimeout 抛了都会让
  // 这条链当场断掉（回调已经跑完、没有下一个定时器、也没有别的入口会再来），这正是
  // 「卡在某一帧」的形态之一。所以这里兜住异常并立刻把兜底重排叫起来。
  // 注意：schedule 只负责「排上」，不负责相位时长 —— 时长永远由调用方的 enter* 决定。
  function schedule(ms, fn) {
    try {
      return global.setTimeout(fn, ms);
    } catch (error) {
      warn("排定时器失败", error);
      ensureChain();
      return null;
    }
  }

  function after(ms, fn) {
    clearTimer();
    clearRearm();
    chainGen += 1;
    const gen = chainGen;
    timerDueAt = nowMs() + ms;
    const handle = schedule(ms, () => {
      timer = null;
      timerDueAt = 0;
      liveGen = gen;
      const safe = typeof fn === "function" ? fn : function () {};
      try {
        safe();
      } catch (error) {
        warn("相位定时器回调抛错", error);
      }
      // 回调没排下一段（哪怕它抛了）→ 兜底接管，绝不把链悬在半空。
      if (liveGen === gen && !chainLive()) ensureChain();
    });
    // schedule() 失败（定时器 API 本身抛）时它已经把兜底排上了；这里只记「有没有排上」。
    if (handle) timer = handle;
  }

  function stateReady() {
    // 这里**故意没有** !reduced：prefers-reduced-motion 只管「不播动画」（pet.css 把
    // transition / 关键帧一起关掉），状态机本身必须照常按时间推进 —— 用户第 5 条要的
    // 就是「reduce 下状态在走、画面不动」。把 reduced 写进这个判断，猫会被彻底冻死。
    return visible && !dragging;
  }

  // —— 固定顺序循环（用户第 2 条）——
  //   待机(4–8s) → 坐下(360ms) → 保持(4–8s) → 睡觉(10–30s) → 站起来(360ms) → 待机 ……
  // 没有权重轮盘、没有随机抽签：唯一的随机是每一段的时长。眨眼不再单独占一档，
  // 它是待机窗口里的小动作（一个窗口眨 1–3 次），所以场面上它依然最常见。
  //
  // 两个时间戳管住「不该发生的事」：
  //   blinkReadyAt —— 两次眨眼之间至少隔开，防止连眨（第二道防线；第一道在 pet.css
  //                   的关键帧里：一次闭合只出现一格闭眼帧）；
  //   sleepReadyAt —— 被吵醒后的不应期。在这之前即使走到「睡觉」那一步也先多坐一会儿
  //                   （用户第 3 条：刚醒不能立刻又睡）。
  let blinkReadyAt = 0;
  let sleepReadyAt = 0;

  // 眨眼 = 一次闭合：140ms 动画 + 40ms 归位 = 180ms（用户第 5 条 120–180ms）。
  // 落点固定回 sit（row0 第 1 格），首尾都是这一格，所以不会有跳变。
  // next = 眨完接着干什么，由待机窗口传进来。
  function blink(next) {
    if (nowMs() < blinkReadyAt) { if (next) next(); return; }
    setState("blink");
    blinkReadyAt = nowMs() + BLINK_MS + BLINK_SETTLE_MS + 200;
    after(BLINK_MS + BLINK_SETTLE_MS, () => {
      setState("sit");
      if (next) next();
    });
  }

  // 待机窗口：循环的起点，也是「眨眼」的地盘。窗口 4–8s，里面眨 1–3 次，窗口走完就坐下。
  // eager = 刚从睡梦里被叫醒，那就先赶紧眨一下眼（用户第 3 条要的「醒来 → 眨眼」）。
  function enterIdle(eager) {
    if (!stateReady()) return;
    phase = "idle";
    setPose(false);
    setRising(false);
    setHolding(false);
    setState("sit");
    const startedAt = nowMs();
    const windowMs = randInt(IDLE_MIN, IDLE_MAX);
    let left = randInt(1, 3);
    const nextTick = () => {
      // 这里**不能** return 了事：这个函数是待机窗口的唯一推手，它一停窗口就永远走不到
      // 坐下。以前这里写的是 `if (!stateReady()) return;` —— 拖着猫的时候待机窗口的最后
      // 一拍正好落在拖拽里，链就断在这里，「坐姿那一帧」从此不动。
      // 现在照旧直接返回：链的存活由定时器那一层兜底（见 after() 的注释）。
      if (!stateReady()) return;
      // 留给这一次眨眼的时间：太紧就不眨了，宁可提前坐下 —— 窗口长度必须守得住。
      const room = windowMs - (nowMs() - startedAt) - (BLINK_MS + BLINK_SETTLE_MS + 200);
      if (left <= 0 || room < 200) {
        // 窗口走完了 → 换乘坐下。换乘成功（phase 已变或定时器已排）就算接班；
        // 没换乘成功（比如刚看的那一瞬猫被拖住了）也一样，外层的兜底会把下一拍排上。
        enterSitDown();
        return;
      }
      const gap = eager ? 120 : Math.min(randInt(BLINK_GAP_MIN, BLINK_GAP_MAX), room);
      eager = false;
      after(gap, () => {
        left -= 1;
        blink(nextTick);
      });
    };
    nextTick();
  }

  // 坐下：画的是 row0 第 1 格（setState("sit")），同时起一段一次性的「压一下」
  // （.is-sit-down → pet.css 的 bca-pet-sit-down，时长就是 SIT_MS）。
  // 动画段尾自己回到 transform: none，所以「保持」的稳定形态不带任何 transform。
  function enterSitDown() {
    if (!stateReady()) return;
    phase = "sitDown";
    setState("sit");
    setHolding(false);
    setRising(false);
    setPose(true);
    after(SIT_MS, enterHold);
  }

  // 保持坐姿：坐下之后先坐一会儿（4–8s），然后再往睡觉走。
  // 这一段才是屏幕上真正「坐着」的样子：状态机写下的 data-bca-state="hold"
  // 就是 pet.css 切到 row3 那四帧真坐姿的开关（不需要额外的类）。
  // V1.5.4 这里什么都不做，于是整个保持相位都画 row0 第 1 格（= 待机那一格），
  // 再叠上一直没摘掉的 .is-sit-down 压扁，就是「坐下只有一张被压缩的静止图」。
  function enterHold() {
    if (!stateReady()) return;
    phase = "hold";
    setRising(false);
    setHolding(true);
    after(randInt(SIT_HOLD_MIN, SIT_HOLD_MAX), enterSleep);
  }

  // 睡觉：10–30s（用户第 2 条），睡够了自己站起来。
  // 不应期内不许睡：先多坐一会儿，等不应期过去再回来问一次（用户第 3 条）。
  function enterSleep() {
    if (!stateReady()) return;
    const wait = sleepReadyAt - nowMs();
    if (wait > 0) {
      // 这一趟没进睡，相位仍然是 hold —— 坐姿类得留着，否则这几秒会闪回 row0 那一格。
      phase = "hold";
      setHolding(true);
      after(wait + 60, enterSleep);
      return;
    }
    phase = "sleep";
    setState("sleep");
    // row4 由 pet.css 的 [data-bca-state="sleep"] 那条规则负责，坐姿类必须摘掉。
    setHolding(false);
    after(randInt(SLEEP_MIN, SLEEP_MAX), () => standUp(false));
  }

  // 站起来 = 先起一段一次性的「弹一下」（.is-sit-up → bca-pet-sit-up），段尾自动回 none；
  // SIT_MS 之后回待机，待机入口再把这个类摘掉。
  // eager 会一路传进待机窗口：被叫醒时要把那一下眨眼尽快补上。
  function standUp(eager) {
    if (!stateReady()) return;
    phase = "standUp";
    setState("sit");
    setPose(false);
    setHolding(false);
    setRising(true);
    after(SIT_MS, () => enterIdle(Boolean(eager)));
  }

  // 相位 → 入口。兜底重排要知道「回到哪一段」，全靠这张表。
  // 每个入口外面都包着一层 phaseGuard（try/catch + 断链自救），所以这里被谁调用
  // 都不会把异常漏出去，也不会让链悬空。
  const PHASE_ENTRY = {
    idle: () => enterIdle(false),
    sitDown: () => enterSitDown(),
    hold: () => enterHold(),
    sleep: () => enterSleep(),
    standUp: () => standUp(false)
  };

  function phaseEntry(name) {
    const entry = PHASE_ENTRY[name] || PHASE_ENTRY.idle;
    return phaseGuard(name, entry);
  }

  // 重新启动整条链（只有一条链）。任何「猫该动、链却没了」的场合都走这里：
  // 拖动松手、菜单动作、重新显示、以及兜底发现某个入口反复接不上班时。
  function startChain() {
    clearTimer();
    clearRearm();
    chainGen += 1;
    rearmMs = REARM_MS;
    phase = "idle";
    if (!stateReady()) return;
    phaseEntry("idle")();
  }

  // —— 走路（V1.5.4 暂时移除，用户第 1 条）——
  // 这里原本是 stepPx / rafId / stopWalk / walkLoop / walk 五个东西：由 JS 用
  // requestAnimationFrame 推 transform 做位移，并按「已走距离 ÷ 每帧距离」算帧号，
  // 撞到边界就停 TURN_MS 再回头（配套常量 FRAME_MS / STEP_RATIO / WALK_RAMP_MS /
  // MIN_RAMP / TURN_MS 一起删掉了）。现在没有任何水平位移，宠物的 x 永远等于停靠位，
  // 「动画在跑、位置匀速滑」这一类 bug 也就没有立足之地。
  // 要恢复走路：从 git 历史里把这段取回来，再把 enterIdle 的下一跳改成权重轮盘；
  // 注意它当时是唯一会写行内 background-position 的地方（setFrame / clearFrame 也删了）。

  // 非待机原因（拖拽、隐藏、任何菜单动作、以及必要时的重启）→ 先坐好，别把定时器
  // 留在半路。这也是「任何菜单动作都不会让宠物消失」的兜底：落点永远是 sit
  //（row0 第 1 格，一定有线像素），只坐不动，绝不写 enabled。
  // 彻底停下来的情形由 stateReady() 兜住：它返回 false 时这里连循环都不会重启。
  function settle() {
    clearTimer();
    clearRearm();
    // 先撤掉在飞的 transition 再定位：不走这一步的话，下一次 syncPosition() 写进去的
    // 目标值会继续按旧过渡滑过去，看起来就是「松手以后猫自己又溜走了」。
    if (container) container.style.transition = "none";
    setState("sit");
    syncPosition();
    // 重新从「待机」起步走一遍固定顺序循环（enterIdle 会把坐姿类摘掉 = 站起来）。
    // V1.5.5：这里改用 startChain()，它不依赖 running 那个「以前启动过没有」的旧标记 ——
    // 那个标记一旦和事实脱节（链其实已经死了，标记还是 true），猫就再也不会动。
    startChain();
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

    // 用户第 3 条：点在正在睡觉的猫身上 = 唤醒它。站起来（播一次 .is-sit-up 的
    // 「弹一下」，360ms）之后马上眨一下眼，再回到正常循环。不应期在 onPointerDown 里就已经设好了
    // （sleepReadyAt），所以它绝不会醒过来立刻又睡。
    if (wakeOnClick) {
      wakeOnClick = false;
      standUp(true);
    }

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
      // 这条监听**只读不写**（V1.5.4）：storage 是别人改的，回写就是从这条回声里再发一次回声。
      // 第二参数 = 当前尺寸：设置页那条「只写 enabled」的局部写不带 size，不许被当成
      // 「回到默认档 144」——那一跳正是用户报的「144 和 96 之间疯狂闪动」。
      const config = normalizeConfig(changes[PET_KEY].newValue, petSize);
      configEnabled = config.enabled;
      paused = config.paused;
      if (config.size !== petSize) applySize(config.size);
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
  // 按下去的那一刻猫在睡觉（phase === "sleep"）→ 这一下松开后的 click 要唤醒它。
  // 记在这里而不是 click 里，是因为「按的时候它睡没睡」只有那一刻知道。
  let wakeOnClick = false;

  // 「猫现在真正画在哪」：拖动必须以此为基准，**不能**拿 petX / petY 当基准。
  // 别的路径（换尺寸档、窗口 resize、状态切换里的 syncPosition）都会让 .bca-pet-dock
  // 用 CSS transition 滑过去，而那段时间里 petX 是**过渡的目标值**，和屏幕上的位置差着
  // 几十像素。拿目标值算 dragOrigin，指针一动猫就会先「跳」到目标位置 —— 这正是用户
  // 报的「一拖动它就跳走 / 像消失了一样」。行走的 rAF 已经没了，但换尺寸 / resize
  // 照样会制造这段差值，所以这一层保留。
  // 纵向夹 [yMin, yMax]：yMin 是负数（往上），写成 [0, yMax] 就是用户报的
  // 「只在最下方能动」。
  function renderedPx() {
    const range = warpRange();
    if (!container) return { x: petX, y: petY };
    const style = global.getComputedStyle(container);
    const matched = style.transform && style.transform !== "none" ? style.transform.match(/matrix\(([^)]+)\)/i) : null;
    if (!matched) return { x: clamp(petX, range.max, 0), y: clamp(petY, range.yMin, range.yMax) };
    const parts = matched[1].split(",").map((part) => parseFloat(part));
    if (parts.length < 6 || !isFinite(parts[4]) || !isFinite(parts[5])) return { x: petX, y: petY };
    return { x: clamp(parts[4], range.max, 0), y: clamp(parts[5], range.yMin, range.yMax) };
  }

  function onPointerDown(event) {
    if (!visible || event.button !== 0) return;
    if (dragging) return;  // 已经有一根指头在拖了，后来的忽略
    hideMenu();
    // 用户第 4 条：拖动时把气泡的自动收起计时器清掉 —— 拖着猫的时候气泡不该
    // 半路自己消失。松手时（onPointerUp）如果气泡还开着，就从那一刻重新计 5 秒。
    clearBubbleTimer();
    dragging = true;
    dragPointerId = event.pointerId;
    moved = false;
    dragStartX = event.clientX;
    dragStartY = event.clientY;
    // 用户第 3 条：这是「碰了正在睡觉的猫」。两件事都要在这里做（而不是在 click 里）：
    //   1) 记下这一下松开后的 click 要唤醒它（wakeOnClick）；
    //   2) 立刻设上不应期 —— 就算用户是**把它拖走**（那一下没有 click），也算被吵醒，
    //      同样不许刚醒就再睡回去。
    wakeOnClick = false;
    if (phase === "sleep") {
      sleepReadyAt = nowMs() + randInt(WAKE_REFRACTORY_MIN, WAKE_REFRACTORY_MAX);
      wakeOnClick = true;
    }
    // 先把状态机停掉：定时器还挂着的话，下一拍就会把猫从冻住的位置上再挪走。
    clearTimer();
    clearRearm();
    // 把「现在画在哪」冻成 JS 的坐标。顺序是「先写 petX/petY，再撤过渡」——
    // 反过来的话，指定值与渲染值不等，撤掉过渡的那一瞬猫会直接跳到过渡目标上。
    const frozen = renderedPx();
    const range = warpRange();
    petX = frozen.x;
    petY = frozen.y;
    petXPct = range.max === 0 ? 0 : clamp(petX / range.max, 0, 1);
    if (petYPct !== null) petYPct = yToPct(petY, range);
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
    // 纵向的夹取范围是 [yMin, yMax]（yMin 是负数 = 允许往上拖到视口顶）——
    // V1.5.3 这里写的是 [0, yMax]，往上拖（dy 为负）会被夹回 0，正是用户报的
    // 「拖不到上面，只能在最下方移动」。用户第 5 条要求的「用实时视口尺寸算」也在
    // warpRange() 里：每一动都按当前视口重算，resize 之后拖动不会跑到屏幕外。
    petX = clamp(dragOriginX + dx, range.max, 0);
    petY = clamp(dragOriginY + dy, range.yMin, range.yMax);
    // 拖过就再也不是「停靠高度」了：把比例跟着更新（正 = 往上、负 = 往下、0 = 停靠）。
    // 不在这里更新的话，persistPosition() 会按 petYPct 里的旧值落盘，
    // 位置就只在这一次拖动的画面上是对的、刷新之后弹回原处。
    petYPct = yToPct(petY, range);
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
    // 拖动期间气泡的计时器是清着的（见 onPointerDown）：松手时气泡还开着就重新计时，
    // 否则拖完这一下之后就再没人收它了。
    if (bubble && !bubble.hidden) armBubbleTimer();
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
    if (nowMs() - lastDragEnd < CLICK_AFTER_DRAG_MS) {
      // 拖动余波：这一下不算点击，也别让它去唤醒睡觉的猫（pointerdown 里记的账要销掉）
      wakeOnClick = false;
      event.stopPropagation();
      event.preventDefault();
      return;
    }
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

    menu.appendChild(menuItem(translate("重置位置"), false, () => {
      // 与设置页的「重置位置」保持同一个语义：x = 0 就是右下角停靠位
      // （PET_DEFAULTS.x 只用于「从没存过位置」的首次安装），y = null 交回 CSS 的停靠高度。
      petXPct = 0;
      petYPct = null;
      petX = 0;
      petY = 0;
      settle();          // 先停掉在飞的定时器，否则它下一拍就把猫又挪走
      persistPosition();
      clampBubble();
    }));

    menu.appendChild(menuItem(translate("隐藏宠物"), false, () => {
      writeConfig({ enabled: false });
      configEnabled = false;
      applyVisibility();
    }));

    // V1.5.4：右键直接进设置页的宠物分组。settings.js 认 URL 上的 #pet(settings.html#pet)。
    // 「宠物设置」这个词条还没进 locales/（本次改动不许动词典），所以按 i18n 提取器认不出的
    // 写法给字面量：\u 转义 + 中文注释。等价的中文原文 = 宠物设置。
    menu.appendChild(menuItem(translate("宠物设置"), false, () => {
      try {
        global.chrome.tabs.create({ url: global.chrome.runtime.getURL("settings.html") + "#pet" });
      } catch (error) {
        warn("打开设置页失败", error);
      }
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

  // 状态机只能有一条链。V1.5.5：判断「有没有链」不再看这个标记，而是看
  // chainLive()（定时器在不在）。标记只留作兼容，别再用它当门。
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
      // 醒来 / 重新显示 = 从固定循环的起点（待机）重新开始。
      // V1.5.5：判据从「running 是不是 false」改成「链是不是真的还在」。
      // running 是「启动过没有」的历史标记，链断了它不知道；chainLive() 是事实。
      // 宠物是**停靠挂件**，这个分支只在 boot / 重新显示时走到，不会打断正常循环。
      if (!chainLive()) { running = true; startChain(); }
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
    // 同理，坐/站那一下的时长也只有这一个源：JS 等 SIT_MS 之后才进「保持」，
    // CSS 用 --bca-sit-ms 做那 360ms 的「压一下 / 弹一下」。两边不一致就会出现
    // 「动画还在跑、状态已经切走」（正是 V1.5.2 眨眼那个 bug 的形态）。
    container.style.setProperty("--bca-sit-ms", SIT_MS + "ms");
    state = "idle";
    phase = "idle";
    setPose(false);
    setRising(false);
    setHolding(false);
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
        // 只记录，**不动状态机**：降低动效是「别播动画」，不是「别过日子」。
        // 之前这里在 reduced 时调 settle()（把状态链掐断），猫会永远停在坐姿。
        reduced = query.matches;
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
    if (container) container.style.transition = "none";
    running = false;
    clearRearm();
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
    phase = "idle";
    setPose(false);
    setRising(false);
    setHolding(false);
    setState("sit");
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
    const live = container ? warpRange() : null;
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
      // V1.5.4：走路没了，改报状态机的两个新维度。
      //   phase   —— 固定循环走到哪一段（idle / sitDown / hold / sleep / standUp）
      //   pose    —— 猫有没有「坐下」（= 外壳上有没有 .is-sit-down）
      //   离下一次动作还有多久用 stateWait 看，验收时序全靠这三项。
      phase: phase,
      // V1.5.5：链是不是真的活着（定时器在不在），以及兜底重排还要等多久。
      // 「卡在某一帧」这种故障光看 phase 是看不出来的（相位没变、也没有待办定时器），
      // 有了 chainLive 就能一眼分辨「停住了」和「正在等下一段」。
      chainLive: chainLive(),
      rearmWait: Math.max(0, Math.round((rearmDueAt || 0) - nowMs())),
      // .is-sit-down 挂在按钮上（pet.css 的 `.bca-pet.is-sit-down .bca-pet-sprite`），
      // 所以这里必须读按钮 —— 读容器会永远是 false。
      // 注意它的含义是「这一轮在坐着的整段时间里」（sitDown + hold + sleep 都为 true），
      // 不是「这一刻正在播坐下那一下的动画」。
      pose: button ? button.classList.contains(SIT_CLASS) : null,
      // 保持相位专用的坐姿类：为 true 时 pet.css 画的是 row3 那组真坐姿。
      // 「坐下只有一张被压缩的静止图」那类故障，看这个比看 phase 更直接。
      holding: button ? button.classList.contains(HOLD_CLASS) : null,
      stateWait: Math.max(0, Math.round((timerDueAt || 0) - nowMs())),
      // 气泡自动收起的剩余毫秒（0 = 没挂计时器）。用户第 4 条的「5 秒自动收起」
      // 只能靠这个字段量，光看 bubble: true 分不清「该收了没」。
      bubbleWait: Math.max(0, Math.round((bubbleDueAt || 0) - nowMs())),
      // 唤醒不应期还剩多久（从睡着被点醒那一刻起算，用户第 3 条）
      sleepWait: Math.max(0, Math.round(sleepReadyAt - nowMs())),
      // 当前实际渲染的帧：背景图横向偏移 ÷ 一格宽度 = 列号，纵向同理。
      // V1.5.4 起没有任何地方写行内 background-position，所以这里一律读计算值，
      // 「内联帧」这个用来抓残留行走帧的字段也就没意义了。
      frame: frameOf(sprite),
      // 只在测试页里看：按**当前视口**算出来的可用范围（左边界是负的，因为往右是负方向）
      maxLeft: live ? Math.round(live.max) : null,
      yMin: live ? Math.round(live.yMin) : null,
      yMax: live ? Math.round(live.yMax) : null,
      dockBottom: container ? parseFloat(global.getComputedStyle(container).bottom) || 0 : null,
      // 可见性的硬指标：外壳的 rect 与 sprite 背景图是否真的画出了像素。
      // 「宠物是不是消失了」只有量这个才说得清（display / 尺寸 / 是否在视口内）。
      rect: container ? (() => {
        const box = container.getBoundingClientRect();
        return { left: Math.round(box.left), top: Math.round(box.top), w: Math.round(box.width), h: Math.round(box.height) };
      })() : null,
      spriteRect: sprite ? (() => {
        const box = sprite.getBoundingClientRect();
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
