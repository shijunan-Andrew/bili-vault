/* ==========================================================================
   stats.js —— 数据统计页（1.5.0）

   数据只有一个来路：chrome.storage.local 的 bcaStats（库页扫描完之后由
   publishStatsSnapshot() 写进去，形状见 stats-core.js 的 snapshot()）。
   页面不去碰文件系统 —— 统计页手里没有目录句柄，硬读只会多出一堆权限分支，
   拿不到就照「还没有数据」显示。

   三块内容都按「快照里有什么画什么」来：
     1) 四个数字卡：videos / savedToday / savedLast7 / collections；
     2) 柱状图：每天新增。快照里这一项有三种可能的形态（days.days 是数组、
        或另给了 daily / dayRows），脚本按顺序挑第一个能用的；三个都没有就
        只给一句说明，绝不把「库里有几天」这个数字画成柱子（那是假数据）；
     3) 近期保存最多的收藏夹：快照里只有 topCollection 一个，没有整张排行，
        所以这里只展示这一行（含近 30 天保存数），不自己造排行。

   图上的一切都由脚本算：柱子高度按最大值归一化，最大值是 0 时整列都不画高
   （不参与除法），今天的柱子画成空心好认。不引图表库、不引任何外部地址。
   ========================================================================== */
(function () {
  "use strict";

  const STATS_KEY = "bcaStats";
  /* 图表尺寸：高度固定，宽度取容器实测宽度（所以 resize 时要按新宽度重画一遍） */
  const CHART_HEIGHT = 220;
  const CHART_MIN_WIDTH = 260;
  /* 上一次量到的宽度：容器被隐藏/窗口最小化时 clientWidth 会是 0，
     这时候沿用上一帧的宽度，免得把图按 260 画完再被 CSS 拉大。 */
  let lastChartWidth = 0;
  const CHART_PAD = { top: 20, right: 8, bottom: 24, left: 34 };
  const CHART_MAX_BAR = 34;
  const CHART_MIN_BAR = 6;
  /* 柱子超过这个数量就不再标数值，免得数字糊成一片 */
  const CHART_VALUE_LABEL_LIMIT = 20;
  const RESIZE_DELAY = 160;

  const core = (typeof BcaStatsCore === "object" && BcaStatsCore) ? BcaStatsCore : null;

  /* 一次把用到的节点全取出来。id 都在 stats.html 里，脚本里写死便于对照。 */
  const ui = {
    overview: document.getElementById("statsOverview"),
    chartCard: document.getElementById("statsChartCard"),
    topCard: document.getElementById("statsTopCard"),
    empty: document.getElementById("statsEmpty"),
    chart: document.getElementById("statsChart"),
    chartLead: document.getElementById("statsChartLead"),
    chartNote: document.getElementById("statsChartNote"),
    chartCaption: document.getElementById("statsChartCaption"),
    topLead: document.getElementById("statsTopLead"),
    topName: document.getElementById("statsTopName"),
    topCount: document.getElementById("statsTopCount"),
    updated: document.getElementById("statsUpdated"),
    updatedValue: document.getElementById("statsUpdatedValue"),
    videos: document.getElementById("statVideos"),
    savedToday: document.getElementById("statSavedToday"),
    savedLast7: document.getElementById("statSavedLast7"),
    collections: document.getElementById("statCollections")
  };

  let stats = null;      // 当前快照（读不到就是 null）
  let loaded = false;    // 第一次 storage 读完没有
  let resizeTimer = 0;

  /* ── 小工具 ─────────────────────────────────────────────────────── */

  function setText(element, text) {
    if (element) element.textContent = text;
  }

  function show(element, visible) {
    if (element) element.hidden = !visible;
  }

  function numberOr(value, fallback) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  }

  function round2(value) {
    return Math.round(value * 100) / 100;
  }

  /* 大数字按当前语言分组（12,345 / 12.345），出错就退回原样 */
  function formatCount(value) {
    const num = Math.max(0, numberOr(value, 0));
    try {
      return num.toLocaleString(BcaI18n.locale());
    } catch (_) {
      return String(num);
    }
  }

  /* updatedAt 是毫秒时间戳（也可能是 ISO 串，两种都认），本地化显示到分钟 */
  function formatTime(value) {
    const time = typeof value === "number" ? value : Date.parse(String(value == null ? "" : value));
    if (!Number.isFinite(time)) return "";
    const date = new Date(time);
    if (Number.isNaN(date.getTime())) return "";
    try {
      return date.toLocaleString(BcaI18n.locale(), {
        year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit"
      });
    } catch (_) {
      return date.toLocaleString();
    }
  }

  function normalizeSnapshot(raw) {
    return (raw && typeof raw === "object") ? raw : null;
  }

  function isEmptySnapshot(snapshot) {
    return !snapshot || numberOr(snapshot.videos, 0) <= 0;
  }

  /* 每天的明细：数组形态有三种可能，按顺序挑第一个真的能用的 */
  function dailySeries(snapshot) {
    const candidates = [
      snapshot.days && snapshot.days.days,
      snapshot.daily,
      snapshot.dayRows
    ];
    for (let i = 0; i < candidates.length; i += 1) {
      const value = candidates[i];
      if (!Array.isArray(value)) continue;
      const rows = [];
      value.forEach((item) => {
        const day = String((item && item.day) || "").slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return;   // 认不出的行直接跳过
        rows.push({ day: day, count: Math.max(0, numberOr(item && item.count, 0)) });
      });
      if (rows.length) return rows;
    }
    return null;
  }

  /* days.days 是数字时那只是「库里有几天」，拿来当说明文字用，不画柱子 */
  function daysSpan(snapshot) {
    const value = snapshot.days && snapshot.days.days;
    return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
  }

  /* 造根节点 <svg>：交给 HTML 解析器去给命名空间 —— createElement("rect") 出来的
     元素不在 SVG 命名空间里，是画不出来的；而命名空间那串地址没必要手写在源码里
     （这一页不发任何网络请求，图全是本机算出来的）。 */
  function createSvgRoot() {
    const holder = document.createElement("div");
    holder.innerHTML = "<svg></svg>";
    return holder.firstElementChild || null;
  }

  /* 子节点跟着父节点的命名空间走，父是解析器造的那个 <svg> */
  function appendSvg(parent, name, attrs) {
    const node = document.createElementNS(parent.namespaceURI, name);
    Object.keys(attrs).forEach((key) => node.setAttribute(key, String(attrs[key])));
    parent.appendChild(node);
    return node;
  }

  /* ── 柱状图 ─────────────────────────────────────────────────────── */

  /**
   * 画「最近 N 天每天新增」。返回 { todayMarked }，调用方据此决定还提不提「今天那根」。
   * rows 里最后一个元素按约定就是今天（stats-core.recentDays），但要是有 localDayKey
   * 就按真实的今天去认 —— 快照可能是旧的，那天不在这一列里就不瞎标。
   */
  function drawChart(rows) {
    const host = ui.chart;
    if (!host || !rows || !rows.length) return null;

    const measured = Math.round(host.clientWidth || 0);
    const width = measured > 0 ? Math.max(CHART_MIN_WIDTH, measured) : (lastChartWidth || CHART_MIN_WIDTH);
    lastChartWidth = width;
    const plotWidth = Math.max(1, width - CHART_PAD.left - CHART_PAD.right);
    const plotHeight = Math.max(1, CHART_HEIGHT - CHART_PAD.top - CHART_PAD.bottom);
    const baseline = CHART_PAD.top + plotHeight;
    const max = rows.reduce((top, row) => (row.count > top ? row.count : top), 0);
    const slot = plotWidth / rows.length;
    const barWidth = Math.max(CHART_MIN_BAR, Math.min(CHART_MAX_BAR, slot * 0.62));
    const showValues = rows.length <= CHART_VALUE_LABEL_LIMIT;
    const labelStride = Math.max(1, Math.ceil(rows.length / 7));

    const todayKey = core && typeof core.localDayKey === "function" ? core.localDayKey(Date.now()) : "";
    const todayIndex = todayKey ? rows.findIndex((row) => row.day === todayKey) : -1;
    /* 没有 localDayKey 就按约定认最后一根；有 key 但对不上（快照过期）就不标 */
    const markIndex = todayIndex >= 0 ? todayIndex : (todayKey ? -1 : rows.length - 1);

    host.textContent = "";
    const svg = createSvgRoot();
    if (!svg) return null;
    svg.setAttribute("class", "stats-svg");
    svg.setAttribute("viewBox", "0 0 " + width + " " + CHART_HEIGHT);
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", BcaI18n.t("最近 {days} 天每天的收藏数量柱状图", { days: formatCount(rows.length) }));
    host.appendChild(svg);

    /* 刻度：顶端一条最大值虚线 + 底端基线，只标最大值和 0 两个数 */
    if (max > 0) {
      appendSvg(svg, "line", {
        class: "stats-grid-line",
        x1: CHART_PAD.left, y1: CHART_PAD.top, x2: width - CHART_PAD.right, y2: CHART_PAD.top
      });
      setText(appendSvg(svg, "text", {
        class: "stats-scale-label", x: CHART_PAD.left - 6, y: CHART_PAD.top + 4, "text-anchor": "end"
      }), formatCount(max));
    }
    appendSvg(svg, "line", {
      class: "stats-axis-line",
      x1: CHART_PAD.left, y1: baseline, x2: width - CHART_PAD.right, y2: baseline
    });
    setText(appendSvg(svg, "text", {
      class: "stats-scale-label", x: CHART_PAD.left - 6, y: baseline + 4, "text-anchor": "end"
    }), formatCount(0));

    rows.forEach((row, index) => {
      const center = CHART_PAD.left + slot * index + slot / 2;
      /* max 为 0 时高度一律 0：这里不做除法，也就不会出现 NaN */
      const height = max > 0 ? Math.max(2, (row.count / max) * plotHeight) : 0;
      const top = baseline - height;
      const isToday = index === markIndex;
      const bar = appendSvg(svg, "rect", {
        class: isToday ? "stats-bar stats-bar-today" : "stats-bar",
        x: round2(center - barWidth / 2), y: round2(top),
        width: round2(barWidth), height: round2(height),
        rx: round2(Math.min(4, barWidth / 2))
      });
      /* 柱子上的原生提示：鼠标停在哪天都能看到确切数字 */
      setText(appendSvg(bar, "title", {}),
        BcaI18n.t("{day} 这一天新增了 {count} 个视频", { day: row.day, count: formatCount(row.count) }));

      if (showValues && row.count > 0 && String(row.count).length * 8 <= slot) {
        setText(appendSvg(svg, "text", {
          class: "stats-bar-value", x: round2(center),
          y: Math.max(CHART_PAD.top + 9, round2(top - 5)), "text-anchor": "middle"
        }), formatCount(row.count));
      }

      /* 横轴日期：太密就隔几根标一个，最后一根一定标 */
      if (index % labelStride === 0 || index === rows.length - 1) {
        setText(appendSvg(svg, "text", {
          class: isToday ? "stats-axis-label stats-axis-label-today" : "stats-axis-label",
          x: round2(center), y: CHART_HEIGHT - 6, "text-anchor": "middle"
        }), row.day.slice(5));
      }
    });

    return { todayMarked: markIndex >= 0 };
  }

  /* ── 各块渲染 ───────────────────────────────────────────────────── */

  function renderTiles(snapshot) {
    setText(ui.videos, formatCount(snapshot.videos));
    setText(ui.savedToday, formatCount(snapshot.savedToday));
    setText(ui.savedLast7, formatCount(snapshot.savedLast7));
    setText(ui.collections, formatCount(snapshot.collections));
  }

  function renderChart(snapshot) {
    const rows = dailySeries(snapshot);
    if (!rows) {
      /* 没有每天的明细：不画空图，只留一句说明 */
      if (ui.chart) ui.chart.textContent = "";
      const span = daysSpan(snapshot);
      setText(ui.chartLead, span > 0
        ? BcaI18n.t("数据库里目前共有 {days} 天的记录。", { days: formatCount(span) })
        : BcaI18n.t("暂时拿不到每天的明细数据。"));
      setText(ui.chartNote, BcaI18n.t("暂时拿不到每天的明细数据。"));
      show(ui.chartNote, true);
      show(ui.chartCaption, false);
      return;
    }

    const max = rows.reduce((top, row) => (row.count > top ? row.count : top), 0);
    setText(ui.chartLead, BcaI18n.t("最近 {days} 天的每日新增。", { days: formatCount(rows.length) }));
    const drawn = drawChart(rows);
    setText(ui.chartNote, BcaI18n.t("最近这些天还没有新增收藏。"));
    show(ui.chartNote, max <= 0);
    show(ui.chartCaption, max > 0 && !!(drawn && drawn.todayMarked));
  }

  function renderTop(snapshot) {
    const windowDays = formatCount(numberOr(core && core.RECENT_WINDOW_DAYS, 0) || 30);
    setText(ui.topLead, BcaI18n.t("按最近 {days} 天保存的数量排序。", { days: windowDays }));

    const top = snapshot.topCollection;
    if (!top || typeof top !== "object") {
      /* 一条收藏都还没归到收藏夹里（比如全是默认收藏夹）—— 不编数据，直接摆横杠 */
      setText(ui.topName, "—");
      setText(ui.topCount, "—");
      return;
    }
    const name = String(top.name || "");
    const recent = Math.max(0, numberOr(top.recent, 0));
    const total = Math.max(0, numberOr(top.count, 0));
    setText(ui.topName, name || "—");
    if (recent > 0) {
      setText(ui.topCount, BcaI18n.t("近 {days} 天保存 {count} 个视频", { days: windowDays, count: formatCount(recent) }));
    } else if (total > 0) {
      /* 近 30 天一条没存：那就报它一共多少，别让人以为这夹子是空的 */
      setText(ui.topCount, BcaI18n.t("近 {days} 天没有新增，一共 {count} 个视频", { days: windowDays, count: formatCount(total) }));
    } else {
      setText(ui.topCount, "—");
    }
  }

  function renderUpdated(snapshot) {
    const text = formatTime(snapshot && snapshot.updatedAt);
    setText(ui.updatedValue, text);
    show(ui.updated, !!text);
  }

  function render() {
    document.title = BcaI18n.t("哔哩藏库 · 数据统计");
    const snapshot = stats;
    const empty = isEmptySnapshot(snapshot);

    show(ui.empty, empty);
    show(ui.overview, !empty);
    show(ui.chartCard, !empty);
    show(ui.topCard, !empty);

    if (empty) {
      /* 数据被清空 / 还没导入：上一次画的柱子和时间要一起收掉，别留着旧图 */
      if (ui.chart) ui.chart.textContent = "";
      setText(ui.chartLead, "");
      show(ui.chartNote, false);
      show(ui.chartCaption, false);
      setText(ui.updatedValue, "");
      show(ui.updated, false);
      return;
    }

    renderTiles(snapshot);
    renderChart(snapshot);
    renderTop(snapshot);
    renderUpdated(snapshot);
  }

  /* ── 事件 ───────────────────────────────────────────────────────── */

  /* 「返回设置」：本页是新开的一个标签，先试着关掉它（回到原来那个设置页标签）。
     浏览器不允许脚本关掉非脚本打开的标签，window.close() 会静默失败，
     所以兜底查一次当前标签再导航过去 —— 绝不把按钮做成 <a href>。 */
  function bindBack() {
    const button = document.getElementById("statsBack");
    if (!button) return;
    button.addEventListener("click", () => {
      const url = chrome.runtime.getURL("settings.html");
      try {
        window.close();
      } catch (_) { /* 关不掉就走下面的兜底 */ }
      window.setTimeout(() => {
        if (window.closed) return;
        try {
          chrome.tabs.getCurrent((tab) => {
            if (tab && typeof tab.id === "number") {
              chrome.tabs.update(tab.id, { url: url });
            } else {
              window.location.href = url;
            }
          });
        } catch (_) {
          window.location.href = url;
        }
      }, 60);
    });
  }

  /* 窗口宽度变了（贴靠、改窗口大小）柱子就重画一遍：宽度是实测的，
     不重画的话 SVG 会被拉伸，字号也跟着变形。 */
  function bindResize() {
    window.addEventListener("resize", () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        if (loaded && !isEmptySnapshot(stats)) renderChart(stats);
      }, RESIZE_DELAY);
    });
  }

  /* 语言切换立刻生效：i18n.js 自己只负责静态那批 [data-i18n]，
     脚本填进去的正文得在它换完词典之后再画一遍。 */
  function watchStorage() {
    if (!chrome.storage || !chrome.storage.onChanged) return;
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !changes) return;
      const localeChanged = Boolean(changes[BcaI18n.STORAGE_KEY]);
      const next = changes[BcaI18n.STORAGE_KEY]?.newValue;
      const statsChanged = Boolean(changes[STATS_KEY]);
      if (!localeChanged && !statsChanged) return;
      const ready = localeChanged ? BcaI18n.use(next, { silent: true }) : Promise.resolve();
      Promise.resolve(ready)
        .then(() => {
          /* 库页刚扫完 / 刚清空数据：同一次事件里把快照也换掉 */
          if (statsChanged) stats = normalizeSnapshot(changes[STATS_KEY].newValue);
          if (loaded) render();
        })
        .catch(() => {});
    });
  }

  /* ── 启动 ───────────────────────────────────────────────────────── */

  function readStats() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(STATS_KEY, (stored) => {
          resolve(normalizeSnapshot(stored && stored[STATS_KEY]));
        });
      } catch (_) {
        resolve(null);
      }
    });
  }

  async function init() {
    bindBack();
    bindResize();
    watchStorage();
    try {
      await BcaI18n.init();       // 读不到就按默认语言显示，别把整页拖死
    } catch (_) { /* 词典坏了也继续，t() 会原样返回中文原文 */ }
    stats = await readStats();
    loaded = true;
    render();
  }

  function boot() {
    init().catch((error) => {
      console.error("[stats] 数据统计页初始化失败", error);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
