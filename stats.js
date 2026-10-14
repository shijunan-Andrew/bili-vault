/* ==========================================================================
   stats.js —— 数据统计页（1.6.0）

   数据只有一个来路：chrome.storage.local 的 bcaStats（库页扫描完之后由
   publishStatsSnapshot() 写进去，形状见 stats-core.js 的 snapshot()）。
   页面不去碰文件系统 —— 统计页手里没有目录句柄，硬读只会多出一堆权限分支，
   拿不到就照「还没有数据」显示。

   1.6.0 起这一页有了时间维度：
     1) 区间选择器：今天 / 昨天 / 近 7 天 / 近 30 天 / 本月 / 上月 / 自定义区间。
        区间优先问 stats-core.js 的 rangeFor()（本地日边界、两端都含）；
        对端还没交稿时用本文件里的同口径实现兜底 —— 两个形状都必须能画。
     2) 柱状图按所选区间画：区间里每一天都占一个槽，缺的那天补 0（不是跳过），
        所以空白的位置本身也是一条信息。1 天时就是一根「当天」柱。
     3) 点柱子 → 下面的饼图只显示那一天：按当天的 byCollection 画扇形 + 图例
        （名称 / 条数 / 占比）。再点同一根收起；点空白处也收起。
     4) 年份时间轴：快照里有 yearly 才画，没有就整块藏起来。
     5) 四张卡里后两张跟着区间走（区间内新增 / 区间天数），标签里不写死天数。

   逐条记录不在快照里，只有 dailyRows（最近 180 天，缺的天补 0）——
   所以饼图是「区间内每天的 byCollection 相加」，绝对不去猜没有的数据。

   图上的一切都由脚本算：柱子高度按最大值归一化，最大值是 0 时整列都不画高
   （不参与除法），今天那根画成空心好认。不引图表库、不引任何外部地址。
   ========================================================================== */
(function () {
  "use strict";

  const STATS_KEY = "bcaStats";
  /* 图表尺寸：高度固定，宽度取容器实测宽度（所以 resize 时要按新宽度重画一遍） */
  const CHART_HEIGHT = 220;
  const YEAR_CHART_HEIGHT = 200;
  const CHART_MIN_WIDTH = 260;
  /* 上一次量到的宽度：容器被隐藏/窗口最小化时 clientWidth 会是 0，
     这时候沿用上一帧的宽度，免得把图按 260 画完再被 CSS 拉大。 */
  let lastChartWidth = 0;
  const CHART_PAD = { top: 20, right: 8, bottom: 24, left: 34 };
  const CHART_MAX_BAR = 34;
  const CHART_MIN_BAR = 6;
  /* 柱子超过这个数量就不再标数值，免得数字糊成一片 */
  const CHART_VALUE_LABEL_LIMIT = 20;
  /* 横轴上最多标几个日期：再多就抽稀到「最早一根 + 今天 + 每隔几根」 */
  const CHART_LABEL_LIMIT = 8;
  /* 每个横轴日期至少占这么宽（「10-14」这种短标签），窄窗口自动再稀一档 */
  const CHART_LABEL_MIN_GAP = 34;
  const RESIZE_DELAY = 160;
  /* 自定义区间能选多长，由 stats-core.js 的 MAX_RANGE_DAYS 说了算
     （真的算出来在下面 core 之后，叫 MAX_CUSTOM_DAYS）。
     两边各写一个数就会出现「界面能选、核心偷偷截断」这种最难受的组合。 */
  /* 扇形最多单独上色几块，剩下的并成「其他」 —— 图例太长反而看不清 */
  const PIE_MAX_SLICES = 7;
  /* 低于这个占比的收藏夹并成一块「其它收藏夹（不足 3%）」：饼图上那点小扇面
     看不出是谁，图例又多一行。3% 是用户提的数，和「看趋势的柱子」同一个口径。 */
  const PIE_MIN_PERCENT = 3;
  const DAY_MS = 86400000;

  /* 七个预置区间，顺序就是下拉里的顺序（文案由 t() 给，不在这里写死） */
  const RANGE_PRESETS = ["today", "yesterday", "last7", "last30", "thisMonth", "lastMonth"];
  const RANGE_ALL = RANGE_PRESETS.concat(["custom"]);
  /* 「接近一天」的容差：两端都算的 1 天区间正好是 DAY_MS 长 */
  const DAY_TOLERANCE = 120000;

  const core = (typeof BcaStatsCore === "object" && BcaStatsCore) ? BcaStatsCore : null;
  /* 界面侧的天数上限：跟核心对齐（核心没加载时退成十年）。
     1.6.4 之前两边都写死 730 天，比「按年份汇总」那档还紧 ——
     2024→2026 这种两年跨度在日历上直接被红字挡回去，选了也确定不了。 */
  const MAX_CUSTOM_DAYS = Math.max(1, Math.floor(numberOr(core && core.MAX_RANGE_DAYS, 3653)));
  const i18n = (typeof BcaI18n === "object" && BcaI18n) ? BcaI18n : null;
  /* 词典由 i18n.js 管；这里只负责取词，取不到就照中文原文显示 */
  const t = (key, params) => (i18n && typeof i18n.t === "function" ? i18n.t(key, params) : key);

  /* 一次把用到的节点全取出来。id 都在 stats.html 里，脚本里写死便于对照。
     1.6.0 新增的节点也在这里取；某个节点被删掉时下面每一处都按可选处理。 */
  const ui = {
    overview: document.getElementById("statsOverview"),
    rangeCard: document.getElementById("statsRangeCard"),
    chartCard: document.getElementById("statsChartCard"),
    pieCard: document.getElementById("statsPieCard"),
    yearCard: document.getElementById("statsYearCard"),
    topCard: document.getElementById("statsTopCard"),
    empty: document.getElementById("statsEmpty"),
    rangeButton: document.getElementById("statsRangeButton"),
    rangeLabel: document.getElementById("statsRangeLabel"),
    rangeSummary: document.getElementById("statsRangeSummary"),
    rangeMenu: document.getElementById("statsRangeMenu"),
    rangeList: document.getElementById("statsRangeList"),
    calendar: document.getElementById("statsCalendar"),
    calPrev: document.getElementById("statsCalPrev"),
    calNext: document.getElementById("statsCalNext"),
    calPrevYear: document.getElementById("statsCalPrevYear"),
    calNextYear: document.getElementById("statsCalNextYear"),
    calMonthA: document.getElementById("statsCalMonthA"),
    calMonthB: document.getElementById("statsCalMonthB"),
    calGridA: document.getElementById("statsCalGridA"),
    calGridB: document.getElementById("statsCalGridB"),
    calWarn: document.getElementById("statsCalendarWarn"),
    calPicked: document.getElementById("statsCalendarPicked"),
    calApply: document.getElementById("statsCalApply"),
    calReset: document.getElementById("statsCalReset"),
    calToday: document.getElementById("statsCalToday"),
    chart: document.getElementById("statsChart"),
    chartLead: document.getElementById("statsChartLead"),
    chartNote: document.getElementById("statsChartNote"),
    chartBoundaryNote: document.getElementById("statsChartBoundaryNote"),
    chartCaption: document.getElementById("statsChartCaption"),
    chartHint: document.getElementById("statsChartHint"),
    pie: document.getElementById("statsPie"),
    pieLead: document.getElementById("statsPieLead"),
    pieLegend: document.getElementById("statsPieLegend"),
    pieEmpty: document.getElementById("statsPieEmpty"),
    yearChart: document.getElementById("statsYearChart"),
    yearLead: document.getElementById("statsYearLead"),
    yearNote: document.getElementById("statsYearNote"),
    yearPie: document.getElementById("statsYearPie"),
    yearPieLegend: document.getElementById("statsYearPieLegend"),
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
  /* 选中态分成两套：上面「每日新增收藏数」一套、下面「按年份累计」一套。
     1.6.4 之前两张图共用 focusedDay，于是点上面 2025 年那根柱子，下面年份图里 2025
     那根也跟着高亮、下面那张饼图还会被上面的解读顶掉（用户报的「上下两个柱子会关联」）。 */
  let focusedDay = "";   // 「每日新增收藏数」选中的那根柱子（空串就是没选）：逐日是那一天，周/月聚合是那一桶
  let focusedRow = null; // 它对应的数据行 —— 饼图直接用它，不再回头查逐日表（聚合桶查不到）
  let yearFocusDay = "";   // 「按年份累计」自己选中的那一年（和上面那张图互不影响）
  let yearFocusRow = null; // 它对应的年度行 —— 下面那张饼图用它
  let chartRows = new Map();  // 「每日新增收藏数」那张图上：柱子键 → 行
  let yearRows = new Map();   // 「按年份累计」那张图上：柱子键 → 行
  let dayRows = [];      // 归一化后的每天明细（升序）
  let periods = [];      // 每个预置区间的计算结果（下拉与文案都读它）
  let currentRange = null;   // 当前生效的区间

  /* 选择器与日历的界面状态。paged = 用户按过「上月 / 下月」，
     按过之后就不再让视图自己跟着锚点跑（手动翻页优先）。 */
  const picker = { open: false, mode: "preset", view: null, draftFrom: "", draftTo: "", paged: false };
  let preset = "last7";                 // 当前预置；选过自定义就留在 custom
  const custom = { from: "", to: "" };  // 生效的自定义起止（YYYY-MM-DD）

  /* ── 小工具 ─────────────────────────────────────────────────────── */

  function setText(element, text) {
    if (element) element.textContent = text;
    return element;
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
      return num.toLocaleString(i18n ? i18n.locale() : undefined);
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
      return date.toLocaleString(i18n ? i18n.locale() : undefined, {
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

  function isDayKey(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value == null ? "" : value));
  }

  /* ── 日期与区间 ─────────────────────────────────────────────────── */

  function clampInt(value, min, max) {
    const num = Math.round(numberOr(value, min));
    return Math.min(max, Math.max(min, num));
  }

  /* 「今天」按本地时区算：中国用户跨零点时看的是本地日期，不是 UTC */
  function fallbackDayKey(time) {
    const date = new Date(numberOr(time, Date.now()));
    if (Number.isNaN(date.getTime())) return "";
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return date.getFullYear() + "-" + month + "-" + day;
  }

  /* 那一天的 00:00 本地时间（用来一天一天地挪） */
  function fallbackDayStart(key) {
    const parts = String(key == null ? "" : key).split("-");
    if (parts.length !== 3) return NaN;
    const year = Number(parts[0]);
    const month = Number(parts[1]);
    const day = Number(parts[2]);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return NaN;
    const time = new Date(year, month - 1, day).getTime();
    return Number.isFinite(time) ? time : NaN;
  }

  function localDayKey(time) {
    if (core && typeof core.localDayKey === "function") {
      try {
        const key = core.localDayKey(numberOr(time, Date.now()));
        if (isDayKey(key)) return String(key).slice(0, 10);
      } catch (_) { /* 对端实现坏了就走下面的兜底 */ }
    }
    return fallbackDayKey(time);
  }

  function dayStartTime(key) {
    if (core && typeof core.dayKeyToTime === "function") {
      try {
        const time = Number(core.dayKeyToTime(String(key)));
        if (Number.isFinite(time)) return time;
      } catch (_) { /* 同上 */ }
    }
    return fallbackDayStart(key);
  }

  function dayEndTime(key) {
    const start = dayStartTime(key);
    return Number.isFinite(start) ? start + DAY_MS - 1 : NaN;
  }

  function addMonths(time, delta) {
    const date = new Date(time);
    if (Number.isNaN(date.getTime())) return NaN;
    return new Date(date.getFullYear(), date.getMonth() + delta, 1).getTime();
  }

  function monthStartTime(year, month) {
    return new Date(year, month, 1).getTime();
  }

  /* 「N 天前」：今天减掉 N 天，仍然是本地日边界 */
  function dayKeyMinus(days) {
    return localDayKey(Date.now() - days * DAY_MS);
  }

  /* 本文件里的兜底实现：本地日边界、两端都含，口径与 stats-core.rangeFor 对齐。
     preset 认不出来（或数据坏了）时给近 7 天，绝不返回空区间。 */
  function fallbackRange(presetName, now, customIn) {
    const stamp = numberOr(now, Date.now());
    const today = new Date(stamp);
    const dayName = Number.isNaN(today.getTime()) ? localDayKey(Date.now()) : localDayKey(stamp);
    const year = today.getFullYear();
    const month = today.getMonth();
    const picked = { from: "", to: "" };
    if (customIn && typeof customIn === "object") {
      if (isDayKey(customIn.from)) picked.from = String(customIn.from).slice(0, 10);
      if (isDayKey(customIn.to)) picked.to = String(customIn.to).slice(0, 10);
    }
    let from = dayName;
    let to = dayName;
    switch (presetName) {
      case "yesterday":
        from = dayKeyMinus(1);
        to = from;
        break;
      case "last7":
        from = dayKeyMinus(6);
        break;
      case "last30":
        from = dayKeyMinus(29);
        break;
      case "thisMonth":
        from = localDayKey(monthStartTime(year, month));
        break;
      case "lastMonth":
        from = localDayKey(monthStartTime(year, month - 1));
        to = localDayKey(monthStartTime(year, month) - DAY_MS);
        break;
      case "custom":
        /* 起止点反着点也要能用：两头排序一下，缺的那头就贴到另一头上 */
        if (picked.from && picked.to) {
          from = picked.from <= picked.to ? picked.from : picked.to;
          to = picked.from <= picked.to ? picked.to : picked.from;
        } else if (picked.from) {
          from = picked.from;
          to = picked.from;
        } else if (picked.to) {
          from = picked.to;
          to = picked.to;
        }
        break;
      default:
        break;
    }
    return {
      preset: presetName,
      from: dayStartTime(from),
      to: dayEndTime(to),
      days: rangeDays(dayStartTime(from), dayEndTime(to)),
      label: ""
    };
  }

  function rangeDays(fromTime, toTime) {
    if (!Number.isFinite(fromTime) || !Number.isFinite(toTime) || toTime < fromTime) return 1;
    const span = toTime - fromTime - (DAY_MS - 1);
    return Math.max(1, Math.round(span / DAY_MS) + 1);
  }

  /* 对端给了 rangeFor 就先用它，但结果要经得起用：
     两头必须是有限数、from 不晚于 to、days 至少 1。不合格就退回本文件的实现。 */
  function normalizeRange(candidate, presetName, now, customIn) {
    const fallback = () => fallbackRange(presetName, now, customIn);
    if (!candidate || typeof candidate !== "object") return fallback();
    const from = Number(candidate.from);
    const to = Number(candidate.to);
    if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) return fallback();
    const days = numberOr(candidate.days, 0);
    return {
      preset: typeof candidate.preset === "string" && candidate.preset ? candidate.preset : presetName,
      from: from,
      to: to,
      days: days >= 1 ? Math.round(days) : rangeDays(from, to),
      label: typeof candidate.label === "string" ? candidate.label : ""
    };
  }

  function rangePresetOf(range) {
    const name = range && typeof range.preset === "string" ? range.preset : "";
    return RANGE_PRESETS.indexOf(name) >= 0 ? name : "custom";
  }

  /* 当前该用哪一段。now 由调用方给，保证同一次渲染里「今天」是同一个瞬间。 */
  function computeRangeFor(presetName, now, customIn) {
    /* 自定义区间一定要把日键换算成毫秒再交给对端：对端（旧版 stats-core）只认数字边界，
       直接把 "2026-03-28" 递过去会被判成坏区间 → 退成「近 7 天」，
       表现出来就是「点了确定，图还是上一次那 7 根柱子」。 */
    const customArg = (presetName === "custom" && customIn && typeof customIn === "object")
      ? { from: dayStartTime(customIn.from), to: dayEndTime(customIn.to) }
      : customIn;
    if (core && typeof core.rangeFor === "function") {
      try {
        return normalizeRange(core.rangeFor(presetName, now, customArg), presetName, now, customIn);
      } catch (_) { /* 对端实现抛错就整体走兜底 */ }
    }
    return fallbackRange(presetName, now, customIn);
  }

  /* 下拉里每一项：区间名 + 算出来的区间。名字走 t() 的预置文案；
     万一对端将来加了新 preset，它给的 label（动态字符串）也能兜住。 */
  function buildPeriods(now) {
    const list = [];
    RANGE_PRESETS.forEach((name) => {
      const range = computeRangeFor(name, now, null);
      /* 每个预置名都写成 t("字面量")：test/i18n-extract.cjs 只认字面量参数，
         写成 t(表[name]) 的话这些文案永远进不了词典，翻译页面上会露出中文。 */
      let text = name;
      if (name === "today") text = t("今天");
      else if (name === "yesterday") text = t("昨天");
      else if (name === "last7") text = t("近 7 天");
      else if (name === "last30") text = t("近 30 天");
      else if (name === "thisMonth") text = t("本月");
      else if (name === "lastMonth") text = t("上月");
      list.push({ id: name, range: range, text: text || range.label || name });
    });
    const customRange = computeRangeFor("custom", now, custom);
    list.push({
      id: "custom",
      range: customRange,
      text: custom.from && custom.to ? formatSpan(custom.from, custom.to) : t("自定义区间")
    });
    return list;
  }

  function periodOf(name) {
    for (let i = 0; i < periods.length; i += 1) {
      if (periods[i].id === name) return periods[i];
    }
    return null;
  }

  /* 当前生效的那一段（每次渲染都重算：跨过零点后「今天」要跟着走） */
  function activeRange(now) {
    const here = numberOr(now, Date.now());
    periods = buildPeriods(here);
    let chosen = periodOf(preset) || periodOf("last7") || periods[0];
    if (!chosen) return fallbackRange("last7", here, null);
    if (preset === "custom") {
      /* 自定义区间跟着用户选的起止，但边界要按现在这个瞬间重算 */
      chosen.range = computeRangeFor("custom", here, custom);
      chosen.text = custom.from && custom.to ? formatSpan(custom.from, custom.to) : t("自定义区间");
    }
    return chosen.range;
  }

  /* 「2026-10-14 → 2026-10-20」：数字是数据，不进词典；
     中间那个箭头只是排版用的连接符，不是界面文案。 */
  function formatSpan(from, to) {
    if (!isDayKey(from) || !isDayKey(to)) return "";
    return String(from).slice(0, 10) + " → " + String(to).slice(0, 10);
  }

  /* 区间两端换算回本地日期键，页面上要显示给人看的地方都用它 */
  function rangeDayKeys(range) {
    if (!range) return { from: "", to: "" };
    return { from: localDayKey(range.from), to: localDayKey(range.to) };
  }

  /* 区间覆盖的天数：不用对端给的 days（形状不一定对），直接按天边界数 */
  function rangeDayList(range) {
    const keys = [];
    if (!range) return keys;
    const meta = rangeDayKeys(range);
    if (!isDayKey(meta.from) || !isDayKey(meta.to)) return keys;
    let time = dayStartTime(meta.from);
    const last = dayStartTime(meta.to);
    if (!Number.isFinite(time) || !Number.isFinite(last)) return keys;
    let guard = 0;
    while (time <= last && guard < MAX_CUSTOM_DAYS + 2) {
      keys.push(localDayKey(time));
      time = dayStartTime(localDayKey(time + DAY_MS));
      guard += 1;
    }
    return keys;
  }

  /* ── 每天明细（dailyRows） ──────────────────────────────────────── */

  /* 每天明细的归一化：day 认不出的行直接跳过（坏数据不许把整页带崩），
     byCollection 不是对象就当成空对象，count 取不到就按 0。 */
  function normalizeDayRows(snapshot) {
    const raw = snapshot && Array.isArray(snapshot.dailyRows) ? snapshot.dailyRows : [];
    const map = new Map();
    raw.forEach((item) => {
      if (!item || typeof item !== "object") return;
      const day = String(item.day == null ? "" : item.day).slice(0, 10);
      if (!isDayKey(day)) return;
      const count = Math.max(0, numberOr(item.count, 0));
      const by = (item.byCollection && typeof item.byCollection === "object") ? item.byCollection : {};
      const row = map.get(day) || { day: day, count: 0, by: {} };
      row.count += count;
      Object.keys(by).forEach((name) => {
        const value = Math.max(0, numberOr(by[name], 0));
        if (value > 0) row.by[name] = (row.by[name] || 0) + value;
      });
      map.set(day, row);
    });
    return [...map.values()].sort((a, b) => (a.day < b.day ? -1 : (a.day > b.day ? 1 : 0)));
  }

  /* 区间里每一天都出现，缺的那天是一条 0 —— 空档也是信息，不许跳过。 */
  function rowsInRange(range) {
    const keys = rangeDayList(range);
    if (!keys.length) return [];
    const byDay = new Map();
    dayRows.forEach((row) => byDay.set(row.day, row));
    return keys.map((day) => {
      const row = byDay.get(day);
      return (row && row.count > 0) ? row : { day: day, count: 0, by: {} };
    });
  }

  function countInRange(range) {
    if (!range) return 0;
    const from = String(rangeDayKeys(range).from);
    const to = String(rangeDayKeys(range).to);
    if (!isDayKey(from) || !isDayKey(to)) return 0;
    let total = 0;
    dayRows.forEach((row) => {
      if (row.day >= from && row.day <= to) total += row.count;
    });
    return total;
  }

  /* 「这一段里新增了多少」：短区间逐日累加，长区间就拿快照的周 / 月汇总累加。
     逐日明细只有最近 180 天，区间一老就一天都查不到 —— 以前两处都直接用它，
     于是长区间里「区间内新增」和图表那句「共新增 N 个视频」一起恒为 0，
     而柱子上明明有数。口径统一成「图上画出来的那几桶加起来的数」：
     跨到区间外的头尾两桶本来也画在图上了（见 weeklyRows 的取桶规则）。 */
  function rangeTotal(range) {
    const mode = chartModeOf(range);
    if (mode === "day") return countInRange(range);
    return seriesFor(mode, range).reduce((sum, row) => sum + row.count, 0);
  }

  /* 每天的明细：1.6.0 认 dailyRows（带 byCollection）。
     旧快照（对端还没交 dailyRows）退回旧的 daily：柱状图照样能从它画出来，
     只是没有收藏夹构成，所以饼图点不出来 —— 那才是真正的「旧形状」。 */
  function dailySeries(snapshot) {
    if (dayRows.length) return dayRows.map((row) => ({ day: row.day, count: row.count }));
    const value = Array.isArray(snapshot && snapshot.daily) ? snapshot.daily : [];
    const rows = [];
    value.forEach((item) => {
      const day = String((item && item.day) || "").slice(0, 10);
      if (!isDayKey(day)) return;
      rows.push({ day: day, count: Math.max(0, numberOr(item && item.count, 0)) });
    });
    return rows.length ? rows : null;
  }

  /* 旧的 daily 也能画柱状图，但它没有 byCollection、也没有 180 天的底子。
     下载菜里那个区间选择器只对 dailyRows 有意义：对端还没交 dailyRows 时收起它，
     宁可少一块功能，也不摆一个选了没反应的控件。 */
  function hasDayRows(snapshot) {
    return normalizeDayRows(snapshot).length > 0;
  }

  /* days.days 是数字时那只是「库里有几天」，拿来当说明文字用，不画柱子 */
  function daysSpan(snapshot) {
    const value = snapshot && snapshot.days && snapshot.days.days;
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

  /* 字符串哈希：同一个收藏夹在任何一天、任何区间都拿到同一个色号（只用来挑 class） */
  function hashText(text) {
    const source = String(text == null ? "" : text);
    let hash = 0;
    for (let i = 0; i < source.length; i += 1) {
      hash = (hash * 31 + source.charCodeAt(i)) % 100003;
    }
    return hash;
  }

  /* ── 柱状图 ─────────────────────────────────────────────────────── */

  /* ── 轴标签：量宽、短写法、倾角 ─────────────────────────────────── */

  const LABEL_TILT_MIN = 14;
  const LABEL_TILT_MAX = 58;
  const LABEL_GLYPH_FALLBACK = 11;

  function shortDayParts(key) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ""));
    if (!match) return null;
    return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  }

  /* 横轴上的短写法：「1/6–12」（同一个月）或「1/26–2/1」（跨月）。
     完整说法（「1月6日星期一 - 1月12日星期日」）留给提示框和读屏 ——
     横轴一共就那么宽，一格塞 17 个字的后果就是叠字加裁切。 */
  function shortDayPair(fromKey, toKey) {
    const from = shortDayParts(fromKey);
    const to = shortDayParts(toKey);
    if (!from || !to) return "";
    if (from.year === to.year && from.month === to.month) return from.month + "/" + from.day + "–" + to.day;
    return from.month + "/" + from.day + "–" + to.month + "/" + to.day;
  }

  /* 月份标签：「8月」就够了；跨年或第一格才带上年份「2026年8月」。
     整排都写年份会把窄格子撑爆，只有「这一年从哪开始」需要在轴上交代。 */
  function shortMonthLabel(key, previousKey) {
    const current = shortDayParts(key);
    if (!current) return "";
    const previous = shortDayParts(previousKey);
    if (!previous || previous.year !== current.year) return current.year + "年" + current.month + "月";
    return current.month + "月";
  }

  /* 量一串轴标签的真实像素宽度。中日韩字和数字的宽度差一倍，
     按「字数 × 11」估会误判（放得下的被当成放不下，白白斜一排）。
     量不出来就退回估算，保证图一定画得出来。 */
  function measureLabelWidth(svg, text) {
    let width = 0;
    try {
      const probe = appendSvg(svg, "text", { class: "stats-axis-label", x: -9999, y: -9999 });
      probe.textContent = text;
      width = probe.getComputedTextLength();
      if (probe.parentNode) probe.parentNode.removeChild(probe);
    } catch (_) {
      width = 0;
    }
    if (!Number.isFinite(width) || width <= 0) width = String(text).length * LABEL_GLYPH_FALLBACK;
    return width;
  }

  /* 段标签该斜多少度。
     ① 横着不越格：width·cos θ + 6 ≤ slot —— 不然相邻两段的标签叠在一起；
     ② 竖着不出画布：width·sin θ ≤ room —— 斜着排会往下探，底下没地方就被裁。
     以「刚好放得下」（need）为准：能少斜就不多斜；need 太小就抬到下限，
     免得一排标签里有的斜有的不斜；竖直方向放不下时以 room 为准（宁可挤，不能被裁）。 */
  function labelTiltDegrees(width, slot, room) {
    if (!(width > 0) || !(slot > 0) || width + 6 <= slot) return 0;
    const fit = (ratio) => Math.max(0, Math.min(1, ratio));
    const need = Math.acos(fit((slot - 6) / width)) * 180 / Math.PI;
    const fits = Math.asin(fit(room / width)) * 180 / Math.PI;
    const ceiling = Math.min(LABEL_TILT_MAX, fits);
    const floor = Math.min(LABEL_TILT_MIN, ceiling);
    return Math.round(Math.min(ceiling, Math.max(floor, need)) * 10) / 10;
  }

  /**
   * 画一排柱子。rows 里每个元素 { day, count, label? }，一天一根。
   * options.labelMode: "dates" 标到横轴上（天） / "none" 不标（年，图例另有其事）。
   * 返回 { todayMarked, max }，调用方据此决定还提不提「今天那根」。
   */
  function drawChart(host, rows, options) {
    if (!host || !rows || !rows.length) return null;
    const config = options || {};
    const height = config.height || CHART_HEIGHT;
    const labelMode = config.labelMode || "dates";

    /* 按周 / 按月聚合时坐标轴标签又长又少，边距得单独放宽一点 */
    const pad = config.pad || CHART_PAD;
    const dateKey = typeof config.dateKey === "function" ? config.dateKey : (row) => String(row.day);
    const semantic = Boolean(config.semantic);

    const measured = Math.round(host.clientWidth || 0);
    const width = measured > 0 ? Math.max(CHART_MIN_WIDTH, measured) : (lastChartWidth || CHART_MIN_WIDTH);
    lastChartWidth = width;
    const plotWidth = Math.max(1, width - pad.left - pad.right);
    const plotHeight = Math.max(1, height - pad.top - pad.bottom);
    const baseline = pad.top + plotHeight;
    const max = rows.reduce((top, row) => (row.count > top ? row.count : top), 0);
    const slot = plotWidth / rows.length;
    /* 柱子再多也要留一条缝：180 天时算出来的宽度就是 1、2 像素 */
    const barWidth = Math.max(1.5, Math.min(CHART_MAX_BAR, slot * 0.66));
    const showValues = rows.length <= CHART_VALUE_LABEL_LIMIT;
    /* 横轴标签抽稀：柱子多的时候最多标 CHART_LABEL_LIMIT 个 + 最后那个。
       宽度窄的时候还得再稀一点：每个标签按 CHART_LABEL_MIN_GAP 像素算，
       「第一根」和「最后一根」都要标，所以留一个位置给最后一根。 */
    const roomFor = Math.floor(Math.max(1, plotWidth) / CHART_LABEL_MIN_GAP);
    const labelLimit = Math.max(2, Math.min(CHART_LABEL_LIMIT, roomFor));
    const labelStride = Math.max(1, Math.ceil(rows.length / labelLimit));
    /* 全 0：没有「近期最高」，这时候只在基线画一条 0 刻度，
       不摆一排零高度的柱子（零高度的图形不是信息，是噪声）。 */
    const drawBars = max > 0;

    const todayKey = localDayKey(Date.now());
    const todayIndex = todayKey ? rows.findIndex((row) => String(dateKey(row)) === todayKey) : -1;
    /* 没有 localDayKey 就按约定认最后一根；有 key 但对不上（快照过期）就不标。
       config.markIndex 传 null = 这张图跟「今天」无关（年度图），干脆不标；
       传数字 = 调用方自己算好了该标哪一根（周/月汇总图标的是本周/本月）。 */
    const markIndex = config.markIndex === null
      ? -1
      : (Number.isInteger(config.markIndex) ? config.markIndex : (todayIndex >= 0 ? todayIndex : (todayKey ? -1 : rows.length - 1)));

    host.textContent = "";
    const svg = createSvgRoot();
    if (!svg) return null;
    svg.setAttribute("class", "stats-svg");
    svg.setAttribute("viewBox", "0 0 " + width + " " + height);
    /* role 不能再用 img：img 会把整棵子树从无障碍树里摘掉，柱子就没法用键盘聚焦了。
       按周 / 按月聚合时一根柱子代表一整段，是 list 不是 group。 */
    svg.setAttribute("role", semantic ? "list" : "group");
    svg.setAttribute("aria-label", config.ariaLabel || "");

    /* 一段一个标签的图（周 / 月 / 年）：整排先统一算一个倾角。
       按最宽的那条算，看着才齐；横轴上的文字用 row.short（短写法），
       完整的「1月6日星期一 - 1月12日星期日」只进提示框和读屏。 */
    let labelTilt = 0;
    if (labelMode !== "dates") {
      const anchorY = Math.min(baseline + 14, height - 30);
      const room = Math.max(6, height - 8 - anchorY);
      const widest = rows.reduce((top, row) => {
        const text = String(row.short || row.label || dateKey(row) || "");
        return Math.max(top, measureLabelWidth(svg, text));
      }, 0);
      labelTilt = labelTiltDegrees(widest, slot, room);
    }

    /* 只有一根柱子时槽很宽，但柱子不该胖成一块板 */
    const single = rows.length <= 1;

    rows.forEach((row, index) => {
      const center = pad.left + slot * index + slot / 2;
      const key = String(dateKey(row));
      const count = numberOr(row.count, 0);
      /* 柱子的「按列点击」：判定范围是从底到顶的整格矩形，不是那根看得见的细柱子。
         count 为 0 的日子也照样盖一层（此时槽里没有任何可见图形），
         看着像没有，点下去仍然能选中那天。 */
      /* 两张图各有各的选中键：默认看主图的 focusedDay，年份图用 options.isFocused 传自己的进来 */
      const selected = typeof options.isFocused === "function" ? options.isFocused(key) : key === focusedDay;
      const isToday = index === markIndex;
      const barWidth2 = single ? Math.min(barWidth, 64) : barWidth;
      const hitWidth = Math.max(2, slot - 2);
      const barHeight = max > 0 ? Math.max(2, (count / max) * plotHeight) : 0;
      const hitHeight = drawBars ? Math.max(1, baseline - pad.top) : 2;
      const tip = config.ariaLabelFor ? config.ariaLabelFor(row) : t("{day} 这一天新增了 {count} 个视频", { day: key, count: formatCount(count) });

      /* 看得见的柱子先画 */
      if (drawBars && count > 0) {
        appendSvg(svg, "rect", {
          /* 头一桶 / 尾一桶是整周（整月、整年），条数含区间外的记录：
             用虚线描边 + 半透明底标出来，免得用户拿区间天数去反推这根的数字 */
          class: "stats-bar" + (isToday ? " stats-bar-today" : "") + (row.partial ? " stats-bar-partial" : ""),
          x: round2(center - barWidth2 / 2), y: round2(baseline - barHeight),
          width: round2(Math.max(1, barWidth2)), height: round2(Math.max(1, barHeight)),
          rx: round2(Math.min(4, barWidth2 / 2))
        });
      }
      /* 再盖一层整格透明矩形当判定区：从底到顶、整格宽。
         它必须是**最后一个**画的（SVG 没有 z-index，后画的盖在上面），
         否则那根看得见的柱子会顶在它上面把点击吃掉 —— 矮柱子、0 记录的日子
         正是用户说「难点」的那些列，点进来必须都落在这一层上。
         判定层自己不带 data-day，柱子按「同一列里能拿到 data-day 的那一层」找。 */
      const bar = appendSvg(svg, "rect", {
        class: "stats-bar-hit" + (selected ? " stats-bar-active" : ""),
        x: round2(center - hitWidth / 2), y: round2(baseline - hitHeight),
        width: round2(hitWidth), height: round2(hitHeight),
        tabindex: "0",
        role: "button",
        "data-day": key,
        "aria-pressed": selected ? "true" : "false",
        "aria-label": tip
      });
      bar.setAttribute("focusable", "true");
      /* 整格矩形上的原生提示：鼠标停在哪天都能看到确切数字，矮柱子也一样 */
      setText(appendSvg(bar, "title", {}), tip);

      /* max 为 0 时整列不画高：不画一根贴底的假柱子，免得看着像有数据 */
      if (max > 0 && showValues && count > 0 && String(count).length * 8 <= slot) {
        setText(appendSvg(svg, "text", {
          class: "stats-bar-value", x: round2(center),
          y: Math.max(pad.top + 9, round2(baseline - barHeight - 5)), "text-anchor": "middle"
        }), formatCount(count));
      }

      /* 横轴标签：日粒度就是日期，太密隔几根标一个（第一根和最后一根一定标）；
         按周 / 按月是一段一个标签，画不下就斜着放，不抽稀 —— 少一个标签就少一段。 */
      if (labelMode === "dates") {
        const isLast = index === rows.length - 1;
        const strided = index % labelStride === 0;
        /* 最后一根离我够远才画我这个中间日期（按像素算，不看第几根） */
        const apart = (rows.length - 1 - index) * slot >= CHART_LABEL_MIN_GAP;
        if (isLast || (strided && apart)) {
          setText(appendSvg(svg, "text", {
            class: isToday ? "stats-axis-label stats-axis-label-today" : "stats-axis-label",
            x: round2(center), y: height - 6, "text-anchor": "middle"
          }), row.label || key.slice(5));
        }
      } else {
        /* 按年的图可能有几十根柱子：隔几年标一个（第一根和最后一根一定标），
           光靠斜排也摆不下；周 / 月粒度照旧每根都标 —— 少一个标签就少一段。 */
        const yearStride = labelMode === "years"
          ? Math.max(1, Math.ceil(rows.length / CHART_LABEL_LIMIT))
          : 1;
        if (index % yearStride !== 0 && index !== rows.length - 1) return;
        const listed = semantic ? appendSvg(svg, "g", { class: "stats-bar-slot" }) : svg;
        const text = String(row.short || row.label || key);
        /* 斜着排时锚点钉在自己那格的刻度上、text-anchor 改成 end：
           文字只往左上铺，右端永远不越过刻度 —— 最后几根的标签再长也不会甩到画布外，
           这正是以前「右边留白、最后几根没标签」的原因（旋转支点算错了）。
           角度是整排统一的 labelTilt，不这么斜就还是老老实实居中。 */
        const anchorX = round2(center);
        const labelY = round2(Math.min(baseline + 14, height - 30));
        const label = setText(appendSvg(listed, "text", {
          class: isToday ? "stats-axis-label stats-axis-label-today" : "stats-axis-label",
          x: anchorX, y: labelY, "text-anchor": labelTilt > 0 ? "end" : "middle"
        }), text);
        if (semantic) label.setAttribute("role", "listitem");
        if (labelTilt > 0) {
          label.setAttribute("transform", "rotate(" + (-labelTilt) + " " + anchorX + " " + labelY + ")");
        }
        if (semantic) {
          const arrow = appendSvg(listed, "line", {
            class: "stats-axis-tick", x1: anchorX, y1: baseline + 1, x2: anchorX, y2: baseline + 5
          });
          arrow.setAttribute("aria-hidden", "true");
        }
      }
    });

    /* 刻度：顶端一条最大值虚线 + 底端基线，只标最大值和 0 两个数。
       柱子画完再补这两样，好让它们压在柱子底下（画在最上面那层）。 */
    if (max > 0) {
      appendSvg(svg, "line", {
        class: "stats-grid-line",
        x1: pad.left, y1: pad.top, x2: width - pad.right, y2: pad.top
      });
      setText(appendSvg(svg, "text", {
        class: "stats-scale-label", x: pad.left - 6, y: pad.top + 4, "text-anchor": "end"
      }), formatCount(max));
    }
    appendSvg(svg, "line", {
      class: "stats-axis-line",
      x1: pad.left, y1: baseline, x2: width - pad.right, y2: baseline
    });
    setText(appendSvg(svg, "text", {
      class: "stats-scale-label", x: pad.left - 6, y: baseline + 4, "text-anchor": "end"
    }), formatCount(0));

    host.appendChild(svg);
    return { todayMarked: markIndex >= 0, max: max };
  }

  /* ── 饼图 ───────────────────────────────────────────────────────── */

  function piePoint(cx, cy, radius, angle) {
    const rad = (angle - 90) * Math.PI / 180;
    return [round2(cx + radius * Math.cos(rad)), round2(cy + radius * Math.sin(rad))];
  }

  /* 一个整圆用 arc 画不出来（起止点重合），拆成两段半圆：
     只有一个收藏夹时也要画得出来，而不是留一块空白。 */
  function fullCirclePath(cx, cy, radius) {
    const top = piePoint(cx, cy, radius, 0);
    const bottom = piePoint(cx, cy, radius, 180);
    return "M " + top[0] + " " + top[1] +
      " A " + radius + " " + radius + " 0 0 1 " + bottom[0] + " " + bottom[1] +
      " A " + radius + " " + radius + " 0 0 1 " + top[0] + " " + top[1] + " Z";
  }

  function wedgePath(cx, cy, radius, startAngle, endAngle) {
    if (endAngle - startAngle >= 359.9) return fullCirclePath(cx, cy, radius);
    const from = piePoint(cx, cy, radius, startAngle);
    const to = piePoint(cx, cy, radius, endAngle);
    const large = (endAngle - startAngle) > 180 ? 1 : 0;
    return "M " + cx + " " + cy +
      " L " + from[0] + " " + from[1] +
      " A " + radius + " " + radius + " 0 " + large + " 1 " + to[0] + " " + to[1] + " Z";
  }

  /* 饼图分块规则（1.6.5 按用户提议改的）：
     占比 ≥ PIE_MIN_PERCENT 的各自一块，最多 PIE_MAX_SLICES 块
     （调色板 8 档，留一档给「其它」）；剩下的全并成一块「其它」。
     改之前是「最大的 5 个 + 其它」：18 个收藏夹时会把 40% 的量悄没声地塞进
     「其它收藏夹」，用户按图例看还以为收藏夹里就那么几个。
     只剩一个小尾巴时不合并 —— 那一条挂着自己的名字比塞进「其它」有用。
     labels.minor 是「都因为不足 3% 才被并」时用的说法，
     labels.many(n) 是「≥3% 的超过 7 块、多出来的被挤进来」时用的说法。 */
  function mergePieSlices(list, labels) {
    const total = list.reduce((sum, item) => sum + item.count, 0);
    if (list.length <= PIE_MAX_SLICES) return list;
    const keep = [];
    const rest = [];
    list.forEach((item) => {
      const percent = total > 0 ? (item.count / total) * 100 : 0;
      if (percent >= PIE_MIN_PERCENT && keep.length < PIE_MAX_SLICES) keep.push(item);
      else rest.push(item);
    });
    const sumOf = (items) => items.reduce((sum, item) => sum + item.count, 0);
    if (!keep.length) {
      /* 极端情况：每一块都不足 3%（收藏夹特别多）。那就把最大的几块留下来，
         剩下的一律并掉 —— 全是 2% 的细条画出来谁也读不了。 */
      const head = list.slice(0, PIE_MAX_SLICES);
      const tail = list.slice(PIE_MAX_SLICES);
      return head.concat([{ name: labels.many(tail.length), count: sumOf(tail), other: true }]);
    }
    if (rest.length <= 1) return list;
    const allMinor = rest.every((item) => total > 0 && (item.count / total) * 100 < PIE_MIN_PERCENT);
    return keep.concat([{
      name: allMinor ? labels.minor : labels.many(rest.length),
      count: sumOf(rest),
      other: true
    }]);
  }

  function pieLabelsForCollections() {
    return {
      minor: t("其它收藏夹（不足 3%）"),
      many: (count) => t("其它收藏夹（{count} 个）", { count: formatCount(count) })
    };
  }

  function pieLabelsForYears() {
    return {
      minor: t("其它年份"),
      many: (count) => t("其它年份（{count} 个）", { count: formatCount(count) })
    };
  }

  /* 占比取整：按最大余数法分配，保证加起来正好 100%
     （各自四舍五入会凑出 99% / 101%，用户会以为哪里算错了）。
     结果写在每一块自己的 percent 上，饼图提示、图例两处读同一份。 */
  function withPercents(slices, total) {
    const counts = slices.map((slice) => Math.max(0, numberOr(slice.count, 0)));
    const sum = counts.reduce((acc, value) => acc + value, 0) || Math.max(0, numberOr(total, 0));
    const parts = slices.map(() => 0);
    if (sum > 0) {
      const exact = counts.map((count) => (count / sum) * 100);
      let used = 0;
      exact.forEach((value, index) => { parts[index] = Math.floor(value); used += parts[index]; });
      const order = exact
        .map((value, index) => ({ index: index, rest: value - Math.floor(value) }))
        .sort((a, b) => (b.rest - a.rest) || (a.index - b.index));
      let left = 100 - used;
      let cursor = 0;
      while (left > 0 && order.length > 0) {
        parts[order[cursor % order.length].index] += 1;
        left -= 1;
        cursor += 1;
      }
    }
    slices.forEach((slice, index) => { slice.percent = parts[index]; });
    return slices;
  }

  /* 那天每个收藏夹各有多少条：byCollection 相加，名字全是数据、不进词典 */
  function slicesOfDay(row) {
    const list = [];
    if (!row || !row.by) return list;
    Object.keys(row.by).forEach((name) => {
      const count = Math.max(0, numberOr(row.by[name], 0));
      if (count > 0) list.push({ name: name, count: count });
    });
    list.sort((a, b) => (b.count - a.count) || (a.name < b.name ? -1 : 1));
    return mergePieSlices(list, pieLabelsForCollections());
  }

  /* 饼图本体：收藏夹构成和按年份构成共用一份，颜色档位也就跟着一致。
     自定义区间那一列可能翻出几千条，占比文字挨个算一遍没有意义，
     所以走「档位 + 图例」：颜色标明是哪一块，鼠标停上去给确切数字。
     每一块是一个 <g class="stats-slice">，整块（含圆心原点）一起缩放，
     抬起效果在 CSS 里；这里只负责把 transform-origin 钉在圆心上。 */
  function drawPieTo(host, slices, total, options) {
    if (!host) return;
    /* 容器里那个「还没有数据」的占位段落不属于饼图，重画时不能顺手清掉 */
    const placeholder = host.querySelector(".stats-pie-empty");
    host.textContent = "";
    const putBack = () => { if (placeholder) host.appendChild(placeholder); };
    if (!slices.length || total <= 0) { putBack(); return; }
    withPercents(slices, total);
    const config = options || {};
    const size = config.size || 190;
    const cx = round2(size / 2);
    const cy = round2(size / 2);
    const svg = createSvgRoot();
    if (!svg) return;
    svg.setAttribute("class", "stats-pie-svg");
    svg.setAttribute("viewBox", "0 0 " + size + " " + size);
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", config.ariaLabel || t("收藏夹构成"));

    let angle = 0;
    slices.forEach((slice, index) => {
      const span = slice.count / total * 360;
      const group = appendSvg(svg, "g", { class: "stats-slice" });
      /* 色位按「第几块」分配，不按名字哈希：哈希会撞车（用户的年份图四块撞成一个颜色、
         收藏夹图三块只分出两档），相邻两块必须永远不同色 —— 这是饼图能不能读的前提。 */
      const path = appendSvg(group, "path", {
        class: "stats-slice-shape" + (slice.other ? " stats-slice-other" : " stats-slice-" + (index % 8)),
        d: wedgePath(cx, cy, size / 2 - 6, angle, angle + span)
      });
      setText(appendSvg(group, "title", {}), config.labelFor
        ? config.labelFor(slice, total)
        : t("{name}：{count} 个视频，占 {percent}%", {
          name: slice.other ? slice.name : (slice.name || t("未归类收藏")),
          count: formatCount(slice.count),
          percent: formatCount(Number.isFinite(slice.percent) ? slice.percent : 0)
        }));
      /* 悬停「抬起」要绕**圆心**放大：写具体像素，百分比在 SVG 上各家算法不一。
         原点写在 <g> 上（CSS 的 :hover 就落在这个 <g> 上），
         扇形自己只负责几何。 */
      group.style.transformOrigin = cx + "px " + cy + "px";
      angle += span;
    });
    putBack();
    host.appendChild(svg);
  }

  function drawPie(host, slices, total) {
    drawPieTo(host, slices, total, { ariaLabel: t("收藏夹构成") });
  }

  function legendInto(list, slices, total) {
    if (!list) return;
    withPercents(slices, total);
    list.textContent = "";
    slices.forEach((slice, index) => {
      const item = document.createElement("li");
      item.className = "stats-legend-item";
      const mark = document.createElement("span");
      /* 和扇形同一套分配（按第几块），图例色块才对得上 */
      mark.className = "stats-legend-mark" + (slice.other ? " stats-slice-other" : " stats-slice-" + (index % 8));
      const name = document.createElement("span");
      name.className = "stats-legend-name";
      /* 收藏夹名是数据、不进词典；名字是空串时给个说法，别在界面上摆一根横杠 */
      const label = slice.other ? slice.name : (slice.name || t("未归类收藏"));
      name.textContent = label;
      const value = document.createElement("span");
      value.className = "stats-legend-value tnum";
      value.textContent = t("{count} 个视频", { count: formatCount(slice.count) })
        + " · " + formatCount(Number.isFinite(slice.percent) ? slice.percent : 0) + "%";
      /* 名字被 CSS 截断时，整行给个原生提示；读屏也念整句，而不是只念名字 */
      const readout = t("{name}：{count} 个视频，占 {percent}%", {
        name: label, count: formatCount(slice.count),
        percent: formatCount(Number.isFinite(slice.percent) ? slice.percent : 0)
      });
      item.setAttribute("title", readout);
      item.setAttribute("aria-label", readout);
      item.appendChild(mark);
      item.appendChild(name);
      item.appendChild(value);
      list.appendChild(item);
    });
  }

  function renderLegend(slices, total) {
    legendInto(ui.pieLegend, slices, total);
  }

  /* ── 各块渲染 ───────────────────────────────────────────────────── */

  function renderTiles(snapshot, range) {
    const total = rangeTotal(range);
    const days = rangeDayList(range).length;
    setText(ui.videos, formatCount(snapshot.videos));
    /* 后两张跟着所选区间走：区间内新增 / 区间天数，标签里不写死天数 */
    setText(ui.savedToday, formatCount(total));
    setText(ui.savedLast7, formatCount(days));
    setText(ui.collections, formatCount(snapshot.collections));
    return { total: total, days: days };
  }

  function renderRange(range) {
    const meta = rangeDayKeys(range);
    const period = periodOf(preset) || periodOf("last7");
    const name = period ? period.text : t("自定义区间");
    const days = rangeDayList(range).length;
    if (ui.rangeLabel) {
      setText(ui.rangeLabel, t("{name} · 共 {days} 天", { name: name, days: formatCount(days) }));
    }
    if (ui.rangeButton) {
      ui.rangeButton.setAttribute("aria-label", t("时间范围") + " " + formatSpan(meta.from, meta.to));
    }
    /* 日历上是哪两天到哪两天，这里再直白写一遍（数字是数据，不进词典） */
    if (ui.rangeSummary) setText(ui.rangeSummary, formatSpan(meta.from, meta.to));
    renderPickerList();
    return { name: name, days: days };
  }

  /* legacyRows 只在对端还没交 dailyRows 时用：那时候没有区间可筛，
     画的就是快照里那串 daily（最后 14 天左右）。 */
  function renderChart(range, legacyRows) {
    const legacy = Array.isArray(legacyRows) && legacyRows.length ? legacyRows : null;
    /* 区间一长，一天一根柱子就成了一把牙签，也读不出趋势：
       超过 30 天按周、超过 90 天按月、超过一年按年（口径写死在 chartModeOf 一处）。 */
    const mode = legacy ? "day" : chartModeOf(range);
    const rows = legacy || seriesFor(mode, range);
    const total = rows.reduce((sum, row) => sum + row.count, 0);
    /* 没有每天明细（对端还没交 dailyRows）时没有区间可选，柱子也就点不出饼图：
       这时候那句「点一下柱子」的提示不能露出来，免得应了一次没反应。
       有区间选择器就一定有每天明细，提示跟着选择器走。 */
    if (ui.chartHint) show(ui.chartHint, !!ui.rangeCard && !ui.rangeCard.hidden);
    /* 提示只能挂在真画出来的柱子上：柱子没了（全 0 / 没有明细）就一起收掉 */
    if (ui.chartHint && (!rows.length || total <= 0)) show(ui.chartHint, false);

    if (!rows.length) {
      /* 没有每天的明细：不画空图，只留一句说明 */
      if (ui.chart) ui.chart.textContent = "";
      const span = daysSpan(stats);
      setText(ui.chartLead, span > 0
        ? t("数据库里目前共有 {days} 天的记录。", { days: formatCount(span) })
        : t("暂时拿不到每天的明细数据。"));
      setText(ui.chartNote, t("暂时拿不到每天的明细数据。"));
      show(ui.chartNote, true);
      show(ui.chartCaption, false);
      return;
    }

    const days = rangeDayList(range).length;
    if (mode === "year") {
      setText(ui.chartLead, t("已选 {days} 天，按年份汇总，共新增 {count} 个视频。", {
        days: formatCount(days), count: formatCount(total)
      }));
      setText(ui.chartNote, t("这段时间还没有新增收藏。"));
    } else if (mode === "month") {
      setText(ui.chartLead, t("已选 {days} 天，按月汇总，共新增 {count} 个视频。", {
        days: formatCount(days), count: formatCount(total)
      }));
      setText(ui.chartNote, t("这段时间还没有新增收藏。"));
    } else if (mode === "week") {
      setText(ui.chartLead, t("已选 {days} 天，按周汇总，共新增 {count} 个视频。", {
        days: formatCount(days), count: formatCount(total)
      }));
      setText(ui.chartNote, t("这几天还没有新增收藏。"));
    } else {
      setText(ui.chartLead, t("已选 {days} 天，共新增 {count} 个视频。", {
        days: formatCount(legacy ? rows.length : days), count: formatCount(total)
      }));
      setText(ui.chartNote, t("这几天还没有新增收藏。"));
    }
    /* 点柱子时要拿到「这一桶」的完整数据（含每个收藏夹各多少条）。
       桶键是周一或某月 1 号，回头查逐日表查不到，所以在这里留一份索引。 */
    chartRows = new Map(rows.map((row) => [String(row.day), row]));
    const drawn = drawChart(ui.chart, rows, {
      height: mode === "day" ? CHART_HEIGHT : CHART_ROLLUP_HEIGHT,
      pad: mode === "day" ? CHART_PAD : ROLLUP_PAD,
      labelMode: mode === "day" ? "dates" : (mode === "year" ? "years" : "periods"),
      semantic: mode !== "day",
      dateKey: (row) => row.day,
      /* 空心的那根只在逐日模式下画（并在下方用一句话解释）。
         周/月汇总图的最后一格常常正好含今天，套上「空心」会看起来像「这根是空的」；
         汇总图里焦点本来就是那个虚线方格，所以这里直接关掉今天标记。 */
      markIndex: mode === "day" ? undefined : -1,
      ariaLabel: t("每天的新增数量柱状图", { days: formatCount(rows.length) }),
      ariaLabelFor: (row) => (mode === "day"
        ? t("{day} 这一天新增了 {count} 个视频", { day: row.day, count: formatCount(row.count) })
        : t("{day} 新增了 {count} 个视频", { day: row.label || row.day, count: formatCount(row.count) }))
    });
    show(ui.chartNote, total <= 0);
    /* 头尾两根是整周 / 整月 / 整年：它们的条数含区间外的记录，下面那句话把口径说清。
       用户就是拿「已选 744 天」去反推那两根柱子才对不上的。 */
    const boundary = mode !== "day" && rows.some((row) => row.partial);
    if (boundary) {
      setText(ui.chartBoundaryNote, mode === "year"
        ? t("首尾两根是整年，条数包含区间外的记录。")
        : (mode === "month"
          ? t("首尾两根是整月，条数包含区间外的记录。")
          : t("首尾两根是整周，条数包含区间外的记录。")));
    }
    show(ui.chartBoundaryNote, boundary);
    show(ui.chartCaption, mode === "day" && !!(drawn && drawn.todayMarked));
  }

  /* 按周 / 按月的汇总都只能读快照：stats-core.js 交上来的 dailyRows 只有最近 180 天，
     数据库本身又不在这一页手里，所以拿到多少画多少 —— 不拿 0 去凑满整段区间，
     那会凭空造出一段「这段时间没收藏」的假象。
     周是以周一为键的全量汇总，周日这天由这里 +6 天推出来；
     最后一跨周可能还没过完，标签就只写到今天，不预告还没到的日子。 */
  function weeklyRows(range) {
    const raw = stats && Array.isArray(stats.weekly) ? stats.weekly : [];
    const bounds = aggregateBounds(range);
    const today = localDayKey(Date.now());
    const rows = [];
    raw.forEach((item) => {
      const week = String(item && item.week != null ? item.week : "");
      if (!isDayKey(week)) return;
      const end = weekEndKey(week);
      if (week > bounds.to || end < bounds.from) return;
      const last = end < today ? end : today;
      rows.push({
        day: week,
        /* label 给提示框和读屏（完整说法），short 给横轴（放得下才不至于叠字） */
        label: weekText(week) + " - " + weekText(last),
        short: shortDayPair(week, last),
        count: Math.max(0, numberOr(item && item.count, 0)),
        /* 这一桶里每个收藏夹各多少条：点柱子时要拿它拼饼图，所以在源头带下来 */
        by: (item && item.byCollection && typeof item.byCollection === "object") ? item.byCollection : {},
        /* 整周统计：这一跨周跨出了区间（头一桶 / 尾一桶），条数含区间外的记录 */
        partial: week < bounds.from || end > bounds.to,
        kind: "bucket"
      });
    });
    rows.sort((a, b) => (a.day < b.day ? -1 : 1));
    return rows;
  }

  function monthlyRows(range) {
    const raw = stats && Array.isArray(stats.monthly) ? stats.monthly : [];
    const bounds = aggregateBounds(range);
    const rows = [];
    raw.forEach((item) => {
      const month = String(item && item.month != null ? item.month : "");
      if (!/^\d{4}-\d{2}$/.test(month)) return;
      const key = month + "-01";
      const end = monthEndKey(month);
      if (key > bounds.to || end < bounds.from) return;
      const previous = rows.length ? String(rows[rows.length - 1].day) : "";
      rows.push({
        day: key,
        label: monthText(key),
        short: shortMonthLabel(key, previous),
        count: Math.max(0, numberOr(item && item.count, 0)),
        by: (item && item.byCollection && typeof item.byCollection === "object") ? item.byCollection : {},
        /* 整月统计：这一桶跨出了区间（头一桶 / 尾一桶） */
        partial: key < bounds.from || end > bounds.to,
        kind: "bucket"
      });
    });
    rows.sort((a, b) => (a.day < b.day ? -1 : 1));
    return rows;
  }

  /* 按年的汇总同样只读快照（stats-core.js 的 yearlySeries 是全量，不受 180 天窗口限制）。
     区间跨了哪几年就画哪几年：年份桶和区间的先后按「年初 / 年末」两个日键比。
     轴上的字只写年份（和下面「按年份累计」那张图一致），完整说法进提示框和读屏。 */
  function yearlyRows(range) {
    const raw = stats && Array.isArray(stats.yearly) ? stats.yearly : [];
    const bounds = aggregateBounds(range);
    const rows = [];
    raw.forEach((item) => {
      const year = String(item && item.year != null ? item.year : "").slice(0, 4);
      if (!/^\d{4}$/.test(year)) return;
      if (year + "-01-01" > bounds.to || year + "-12-31" < bounds.from) return;
      rows.push({
        day: year,
        label: year,
        short: year,
        count: Math.max(0, numberOr(item && item.count, 0)),
        /* 这一年里每个收藏夹各多少条：点柱子时要拿它拼饼图，所以在源头带下来 */
        by: (item && item.byCollection && typeof item.byCollection === "object") ? item.byCollection : {},
        /* 整年统计：这一桶跨出了区间（头一年 / 尾一年） */
        partial: year + "-01-01" < bounds.from || year + "-12-31" > bounds.to,
        kind: "year"
      });
    });
    rows.sort((a, b) => (a.day < b.day ? -1 : 1));
    return rows;
  }

  function seriesFor(mode, range) {
    if (mode === "year") return yearlyRows(range);
    if (mode === "month") return monthlyRows(range);
    if (mode === "week") return weeklyRows(range);
    return rowsInRange(range);
  }

  /* 区间越长柱子越少，但画布高度不变：这两种粒度都留一样的画布给下面那排标签 */
  /* 聚合图底下得给斜着排的段标签留地方：44 像素只够平躺的短标签，
     一旦斜过来（最长那条要 60 多像素、斜到 50 度上下）就会探出画布被裁掉。 */
  const CHART_ROLLUP_HEIGHT = 266;
  const ROLLUP_PAD = { top: 20, right: 10, bottom: 72, left: 36 };

  /* 0 = 按天，1 = 按周，2 = 按月，3 = 按年。边界按用户口径：
     30 天以内按天（超过一个月一天一根柱子就成牙签了）、90 天以内按周、
     一年以内按月、超过一年按年。 */
  function chartModeOf(range) {
    const days = rangeDayList(range).length;
    if (days > 365) return "year";
    if (days > 90) return "month";
    if (days > 30) return "week";
    return "day";
  }

  /* 「8月4日星期一」：年只在跨年那一周才写出来，免得每个标签都一样长 */
  function weekText(key) {
    const parts = String(key).split("-");
    const month = numberOr(parts[1], 0);
    const day = numberOr(parts[2], 0);
    if (!month || !day) return String(key);
    const date = new Date(Number(parts[0]), month - 1, day);
    return t("{month}月{day}日", { month: formatCount(month), day: formatCount(day) }) + weekdayText(date.getDay() === 0 ? 6 : date.getDay() - 1);
  }

  /* 「2026年8月」 */
  function monthText(key) {
    const parts = String(key).split("-");
    const month = numberOr(parts[1], 0);
    if (!month) return String(key);
    return t("{year}年{month}月", { year: parts[0], month: formatCount(month) });
  }

  /* 周一是键，周日 = 周一 + 6 天：按自然日加成，不用固定毫秒数 */
  function weekEndKey(week) {
    const start = dayStartTime(week);
    if (!Number.isFinite(start)) return week;
    const date = new Date(start);
    return fallbackDayKey(new Date(date.getFullYear(), date.getMonth(), date.getDate() + 6).getTime());
  }

  /* 「2026-08」的月末那天：下月一号往前退一天，同样按自然日算 */
  function monthEndKey(month) {
    const parts = String(month).split("-");
    const year = numberOr(parts[0], 0);
    const index = numberOr(parts[1], 0);
    if (!year || !index) return month + "-01";
    return fallbackDayKey(new Date(year, index, 0).getTime());
  }

  /* 汇总序列（周 / 月）要比对「这段区间」和「这一桶」的先后，
     range.from / range.to 是毫秒（对端 rangeFor 交上来的就是数字），
     拿它当 "YYYY-MM-DD" 字符串切前 7 位会得到 "1774627" 这种鬼东西，
     于是所有桶都被判成「不在区间里」→ 图空白。这里统一换成日键。 */
  function aggregateBounds(range) {
    const fromKey = isDayKey(range && range.from) ? String(range.from) : fallbackDayKey(range && range.from);
    const toKey = isDayKey(range && range.to) ? String(range.to) : fallbackDayKey(range && range.to);
    return { from: fromKey || "0000-00-00", to: toKey || "9999-99-99" };
  }

  function renderPie() {
    /* 由「点柱子时记下的那一行」驱动：逐日就是那一天，周 / 月聚合就是整桶
       （每个收藏夹各多少条已经在源头合并进 row.by），年份图就是那一年的收藏夹构成。
       不再按天回查逐日表 —— 聚合桶的键（周一 / 某月 1 号）在 dailyRows 里未必存在，
       这正是用户报的「聚合后只算桶里第一天」的根因。 */
    const row = focusedRow;
    /* 「这一行还在不在当前这张图上」只能问刚才画完留下的索引：
       拿「桶的键在不在区间的那串日子里」判会误杀 —— 长区间的第一桶是残缺周，
       它的周一在区间开始之前，照原样判就会被当成过期焦点，第一根柱子照样点不出饼图。 */
    const live = !!row && (row.kind === "year"
      ? yearRows.has(String(row.day))
      : chartRows.has(String(row.day)));
    if (!row || !live) {
      focusedDay = "";
      focusedRow = null;
      show(ui.pieCard, false);
      if (ui.pie) ui.pie.textContent = "";
      if (ui.pieLegend) ui.pieLegend.textContent = "";
      /* 收起来的卡片里不留上一回的说明文字：再点开时不至于闪一下旧句 */
      show(ui.pieEmpty, false);
      show(ui.pie, false);
      show(ui.pieLegend, false);
      return;
    }
    const slices = slicesOfDay(row);
    const total = slices.reduce((sum, slice) => sum + slice.count, 0);
    show(ui.pieCard, true);
    setText(ui.pieLead, t("{day}：新增 {count} 个视频", {
      /* 年份桶读出来是「2025年：…」；周 / 月桶的 label 自带完整说法，直接用 */
      day: row.kind === "year" ? String(row.day) + "年" : (row.label || String(row.day)),
      count: formatCount(row.count)
    }));
    drawPie(ui.pie, slices, total);
    renderLegend(slices, total);
    /* 空饼图的说明也得分粒度：年份桶说「这一年」，周 / 月桶说「这几天」 */
    setText(ui.pieEmpty, row.kind === "bucket"
      ? t("这几天还没有新增收藏。")
      : (row.kind === "year" ? t("这段时间还没有新增收藏。") : t("这一天还没有新增收藏。")));
    show(ui.pieEmpty, slices.length === 0);
    show(ui.pie, slices.length > 0);
    show(ui.pieLegend, slices.length > 0);
  }

  /* 老快照兜底：1.6.3 及以前的 yearly 只有 {year, count}，没有 byCollection ——
     真机上表现为「点年份柱子，下面那张饼图说这一段时间没有收藏」。快照要等下一次
     导入 / 扫描才会刷新，所以这里用全量的月度表按年合并出一份收藏夹构成，和新快照
     自己算出来的结果一致（月度表是 stats-core.js 为长区间聚合带出去的全量数据）。 */
  function monthlyYearFallback() {
    const years = new Map();
    const months = stats && Array.isArray(stats.monthly) ? stats.monthly : [];
    months.forEach((item) => {
      const month = String(item && item.month != null ? item.month : "");
      const year = month.slice(0, 4);
      const by = item && item.byCollection;
      if (!/^\d{4}$/.test(year) || !by || typeof by !== "object") return;
      let bucket = years.get(year);
      if (!bucket) {
        bucket = {};
        years.set(year, bucket);
      }
      Object.keys(by).forEach((name) => {
        bucket[name] = numberOr(bucket[name], 0) + numberOr(by[name], 0);
      });
    });
    return years;
  }

  /* 年份时间轴：没有 yearly 就整块隐藏，不留空壳 */
  function renderYears() {
    const raw = stats && Array.isArray(stats.yearly) ? stats.yearly : [];
    const rows = [];
    const monthFallback = monthlyYearFallback();
    raw.forEach((item) => {
      const year = String(item && item.year != null ? item.year : "").slice(0, 4);
      if (!/^\d{4}$/.test(year)) return;
      rows.push({
        day: year,
        label: year,
        count: Math.max(0, numberOr(item && item.count, 0)),
        /* 这一年的收藏夹构成：点年份柱子时要拿它出饼图。
           新快照的 yearly 自带 byCollection；老快照用月度表现算一份（见上面的兜底）。 */
        by: (item && item.byCollection && typeof item.byCollection === "object" && Object.keys(item.byCollection).length)
          ? item.byCollection
          : (monthFallback.get(year) || {}),
        kind: "year"
      });
    });
    if (!rows.length) {
      show(ui.yearCard, false);
      if (ui.yearChart) ui.yearChart.textContent = "";
      yearRows = new Map();
      yearFocusDay = "";
      yearFocusRow = null;
      renderYearPie([]);
      return;
    }
    rows.sort((a, b) => (a.day < b.day ? -1 : 1));
    yearRows = new Map(rows.map((row) => [String(row.day), row]));
    /* 选中的那一年在新快照里没了（换了备份文件夹）就放手，别留一个指向空气的焦点 */
    if (yearFocusDay && !yearRows.has(String(yearFocusDay))) {
      yearFocusDay = "";
      yearFocusRow = null;
    }
    const total = rows.reduce((sum, row) => sum + row.count, 0);
    show(ui.yearCard, true);
    setText(ui.yearLead, t("从 {year} 年至今，共收藏 {count} 个视频。", {
      year: rows[0].day, count: formatCount(total)
    }));
    const drawn = drawChart(ui.yearChart || ui.chart, rows, {
      height: YEAR_CHART_HEIGHT,
      labelMode: "years",
      /* 年度图和「今天」无关：不画空心柱，也不显示下面那句解释 */
      markIndex: null,
      /* 高亮只看年份图自己的选中键：以前共用 focusedDay，上面那张图里选了年份，
         下面这张会跟着亮（用户报的「上下两个柱子会关联」）。 */
      isFocused: (key) => key === yearFocusDay,
      ariaLabel: t("按年份的收藏数量柱状图"),
      /* 年份柱子的读屏措辞不能带「这一天」：用现成的「{day} 新增了 {count} 个视频」
         这条词条，把年份当主语，读出来是「2024 新增了 62 个视频」。 */
      ariaLabelFor: (row) => t("{day} 新增了 {count} 个视频", {
        day: row.label || String(row.day), count: formatCount(row.count)
      })
    });
    setText(ui.yearNote, t("暂无年份数据。"));
    show(ui.yearNote, !drawn);
    /* 「按年份累计」下面再给一张按年份的构成饼图：柱子看趋势，饼图看各年占比 */
    renderYearPie(rows);
  }

  /* 年份构成（各年占比）：跟收藏夹构成共用 drawPieTo，配色档位也就一样，
     名字直接是年份，所以连图例的色块都对得上。 */
  function yearSlices(rows) {
    const list = [];
    rows.forEach((row) => {
      const count = Math.max(0, numberOr(row.count, 0));
      if (count > 0) list.push({ name: row.label || row.day, count: count });
    });
    /* 年份按时间排（轴上的先后就是年份先后），但「留下哪几块」要看占比：
       先按条数挑出够大的，剩下的并进「其它年份」，最后再按时间摆回去。 */
    const byCount = list.slice().sort((a, b) => (b.count - a.count) || (a.name < b.name ? -1 : 1));
    const picked = mergePieSlices(byCount, pieLabelsForYears());
    if (!picked.some((slice) => slice.other)) return list;
    picked.sort((a, b) => (a.other ? 1 : (b.other ? -1 : (a.name < b.name ? -1 : 1))));
    return picked;
  }

  /* 年份构成：用年份图自己的选中键 yearFocusDay —— 点了某一年就出那一年的收藏夹构成
     （和「每日新增收藏数」点柱子的读法完全一样：柱子看趋势，饼图看构成），
     没点、或点的键不是年份时，还是「各年在总数里占多少」。 */
  function renderYearPie(rows) {
    if (!ui.yearPie) return;
    /* 1.6.4：只认年份图自己的选中，而且那一年还得在这次的年度行里（快照换了就自动放手） */
    const focused = yearFocusRow && yearRows.has(String(yearFocusRow.day)) ? yearFocusRow : null;
    const yearRow = focused && focused.kind === "year" ? focused : null;
    const slices = yearRow ? slicesOfDay(yearRow) : yearSlices(rows);
    const total = slices.reduce((sum, slice) => sum + slice.count, 0);
    drawPieTo(ui.yearPie, slices, total, {
      ariaLabel: yearRow ? t("收藏夹构成") : t("按年份的收藏占比饼图"),
      labelFor: (slice) => t("{name}：{count} 个视频，占 {percent}%", {
        name: slice.other ? slice.name : (slice.name || t("未归类收藏")),
        count: formatCount(slice.count),
        percent: formatCount(Number.isFinite(slice.percent) ? slice.percent : 0)
      })
    });
    legendInto(ui.yearPieLegend, slices, total);
    /* 饼图上头那句小标题：选了年份就说清是哪一年，没选还是「各年份的收藏构成」 */
    const caption = ui.yearPie.querySelector(".stats-pie-empty");
    if (caption) {
      setText(caption, yearRow
        ? t("{day}：新增 {count} 个视频", { day: yearRow.day + "年", count: formatCount(yearRow.count) })
        : t("各年份的收藏构成"));
    }
    show(ui.yearPie, slices.length > 0);
    show(ui.yearPieLegend, slices.length > 0);
  }

  function renderTop(snapshot) {
    /* 「近期」统一成近 7 天（stats-core.js 的 RECENT_WINDOW_DAYS），
       与柱状图最右边 7 根柱子是同一个口径 —— 都是按视频条数、按天分桶。 */
    const windowDays = formatCount(numberOr(core && core.RECENT_WINDOW_DAYS, 0) || 7);
    setText(ui.topLead, t("按最近 {days} 天保存的数量排序。", { days: windowDays }));

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
      setText(ui.topCount, t("近 {days} 天保存 {count} 个视频", { days: windowDays, count: formatCount(recent) }));
    } else if (total > 0) {
      /* 近 7 天一条没存：那就报它一共多少，别让人以为这夹子是空的 */
      setText(ui.topCount, t("近 {days} 天没有新增，一共 {count} 个视频", { days: windowDays, count: formatCount(total) }));
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
    document.title = t("哔哩藏库 · 数据统计");
    const snapshot = stats;
    const empty = isEmptySnapshot(snapshot);

    if (empty) {
      /* 数据被清空 / 还没导入：把上面画过的图、展开的下拉、选中的柱子一起收掉 */
      dayRows = [];
      focusedDay = "";
      focusedRow = null;
      closePicker();
      show(ui.empty, true);
      show(ui.overview, false);
      show(ui.rangeCard, false);
      show(ui.chartCard, false);
      show(ui.pieCard, false);
      show(ui.yearCard, false);
      show(ui.topCard, false);
      if (ui.chart) ui.chart.textContent = "";
      if (ui.pie) ui.pie.textContent = "";
      if (ui.yearChart) ui.yearChart.textContent = "";
      if (ui.yearPie) ui.yearPie.textContent = "";
      if (ui.pieLegend) ui.pieLegend.textContent = "";
      if (ui.yearPieLegend) ui.yearPieLegend.textContent = "";
      show(ui.yearPie, false);
      show(ui.yearPieLegend, false);
      setText(ui.chartLead, "");
      setText(ui.pieLead, "");
      setText(ui.yearLead, "");
      setText(ui.topLead, "");
      setText(ui.topName, "—");
      setText(ui.topCount, "—");
      show(ui.chartNote, false);
      show(ui.chartCaption, false);
      show(ui.pieEmpty, false);
      show(ui.yearNote, false);
      setText(ui.updatedValue, "");
      show(ui.updated, false);
      return;
    }

    dayRows = normalizeDayRows(snapshot);
    const rows = dailySeries(snapshot);
    const range = activeRange(Date.now());
    /* 「能不能选区间」只看有没有 dailyRows：只有旧的 daily 时快照里没有
       180 天的底子，区间选了也筛不出东西，那就退回旧的四张卡 + 那 14 根柱子。 */
    const selectable = hasDayRows(snapshot);
    if (!selectable) { focusedDay = ""; focusedRow = null; }

    show(ui.empty, false);
    show(ui.overview, true);
    show(ui.rangeCard, selectable);
    show(ui.chartCard, true);
    show(ui.topCard, true);

    if (selectable) renderRange(range);
    if (selectable) renderTiles(snapshot, range);
    else renderTilesLegacy(snapshot);
    /* 没有每天明细时 rows 就是快照里那串 daily：柱状图照样画，只是不能点 */
    renderChart(range, selectable ? null : rows);
    if (selectable) renderPie();
    renderYears();
    renderTop(snapshot);
    renderUpdated(snapshot);
    /* 语言切换后柱子上那些 title / aria-label 得跟着换（图标是脚本塞的，也补一次） */
    if (typeof BcaIcons === "object" && BcaIcons && typeof BcaIcons.hydrate === "function") {
      try { BcaIcons.hydrate(ui.rangeCard); } catch (_) { /* 图标补不上就补不上 */ }
    }
  }

  /* 旧快照（没有 dailyRows）时的四张卡：还是「今日新增 / 近 7 天新增」那两口径 */
  function renderTilesLegacy(snapshot) {
    setText(ui.videos, formatCount(snapshot.videos));
    setText(ui.savedToday, formatCount(snapshot.savedToday));
    setText(ui.savedLast7, formatCount(snapshot.savedLast7));
    setText(ui.collections, formatCount(snapshot.collections));
  }

  /* ── 区间选择器 ─────────────────────────────────────────────────── */

  /* 列表项由脚本生成：文案全是 t() 字面量，节点里不写 data-i18n 属性
     （那些属性是给静态标记用的，动态节点挂了反而会被 i18n 的扫描漏掉）。 */
  function renderPickerList() {
    const list = ui.rangeList;
    if (!list) return;
    list.textContent = "";
    periods.forEach((period) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "stats-picker-option";
      item.setAttribute("role", "option");
      item.setAttribute("data-range", period.id);
      const active = preset === period.id;
      item.setAttribute("aria-selected", active ? "true" : "false");
      item.textContent = period.text;
      list.appendChild(item);
    });
  }

  function openPicker() {
    picker.open = true;
    picker.mode = preset === "custom" ? "custom" : "preset";
    /* 先前选过的自定义区间也要重新夹一遍：收藏夹最早那条之前的日子不该再选得中 */
    picker.draftFrom = clampDay(custom.from);
    picker.draftTo = clampDay(custom.to);
    /* 每次打开都从「贴着锚点的那一屏」开始，上次的手动翻页不带过来 */
    picker.paged = false;
    picker.view = calendarView();
    show(ui.rangeMenu, true);
    show(ui.calendar, picker.mode === "custom");
    if (ui.rangeButton) ui.rangeButton.setAttribute("aria-expanded", "true");
    renderCalendar();
  }

  function closePicker() {
    if (!picker.open) {
      show(ui.rangeMenu, false);
      if (ui.rangeButton) ui.rangeButton.setAttribute("aria-expanded", "false");
      return;
    }
    picker.open = false;
    picker.mode = "preset";
    show(ui.rangeMenu, false);
    show(ui.calendar, false);
    if (ui.rangeButton) {
      ui.rangeButton.setAttribute("aria-expanded", "false");
      ui.rangeButton.focus();
    }
  }

  function monthText(time) {
    const date = new Date(time);
    if (Number.isNaN(date.getTime())) return "";
    return date.getFullYear() + " 年 " + (date.getMonth() + 1) + " 月";
  }

  /* 两个月并排：左边是 view 那个月，右边是它的下个月。
     今天之后的日子不给点（未来还没有数据可看）。 */
  function renderCalendar() {
    /* 用户没按「上月 / 下月」翻过页，视图就跟着锚点走：
       点一天之后，那一屏会挪到「点的那天」所在的两个月，而不是原地不动。 */
    if (!picker.paged) picker.view = calendarView();
    if (!picker.view || !Number.isFinite(picker.view)) {
      const now = new Date();
      picker.view = monthStartTime(now.getFullYear(), now.getMonth());
    }
    const todayKey = localDayKey(Date.now());
    const bounds = calendarBounds();
    const from = picker.draftFrom;
    const to = picker.draftTo;
    const low = from && to ? (from <= to ? from : to) : (from || to);
    const high = from && to ? (from <= to ? to : from) : (from || to);

    /* 屏幕上永远是两个月（HTML 里就两张表，#statsCalGridA / B）。
       起止跨度很大时**不**去补第三个月：那两张表是固定的，
       多出来的月份只会互相覆盖，看着像「点了没反应」—— 跨月靠「上月 / 下月」翻。
       这一条是「点一下就退出」那个 bug 的真正根因：以前这里按跨度铺 2–12 个月，
       点完起点视图一跳，右格就被别的月份顶掉了，第二下点在屏幕上根本不存在的日子上。 */
    for (let index = 0; index < 2; index += 1) {
      const monthTime = addMonths(picker.view, index);
      const month = new Date(monthTime);
      const grid = index === 0 ? ui.calGridA : ui.calGridB;
      const label = index === 0 ? ui.calMonthA : ui.calMonthB;
      setText(label, monthText(monthTime));
      if (!grid) continue;
      grid.textContent = "";
      for (let weekday = 0; weekday < 7; weekday += 1) {
        const head = document.createElement("span");
        head.className = "stats-calendar-wd";
        head.textContent = weekdayText(weekday);
        grid.appendChild(head);
      }
      const lead = (month.getDay() + 6) % 7;   // 周一开头
      const total = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
      for (let blank = 0; blank < lead; blank += 1) {
        const pad = document.createElement("span");
        pad.className = "stats-calendar-blank";
        grid.appendChild(pad);
      }
      for (let day = 1; day <= total; day += 1) {
        const key = fallbackDayKey(new Date(month.getFullYear(), month.getMonth(), day).getTime());
        const cell = document.createElement("button");
        const outside = (bounds.earliest && key < bounds.earliest) || key > bounds.latest;
        cell.type = "button";
        cell.className = "stats-calendar-day";
        cell.textContent = String(day);
        cell.setAttribute("data-day", key);
        if (key === low) cell.classList.add("stats-calendar-edge");
        if (key === high) cell.classList.add("stats-calendar-edge");
        if (low && high && key > low && key < high) cell.classList.add("stats-calendar-in");
        if (key === todayKey) cell.classList.add("stats-calendar-today");
        if (outside) {
          /* 收藏夹里最早那条之前 / 今天之后：禁用而不是藏起来，日历的格子数才稳定 */
          cell.disabled = true;
          cell.setAttribute("aria-disabled", "true");
        }
        cell.setAttribute("aria-label", key);
        cell.setAttribute("aria-pressed", (key === low || key === high) ? "true" : "false");
        grid.appendChild(cell);
      }
    }
    setText(ui.calPicked, (low && high)
      ? t("已选 {from} 至 {to}，共 {days} 天。", {
        from: low, to: high,
        days: formatCount(rangeDays(dayStartTime(low), dayEndTime(high)))
      })
      : t("点一天定起点，再点一天定终点。"));
    show(ui.calWarn, false);
  }

  /* 星期几的写法交给词典。1.6.1 改：原来是一条带占位符的「星期{name}」，而传进去的
     {name} 是中文的「一…日」—— 英文界面里会漏出汉字。改成七条独立词条，并且每一句
     都写成 t("…") 字面量（塞进数组或拼字符串，抽取器就看不见了）。 */
  function weekdayText(index) {
    switch (((index % 7) + 7) % 7) {
      case 0: return t("星期一");
      case 1: return t("星期二");
      case 2: return t("星期三");
      case 3: return t("星期四");
      case 4: return t("星期五");
      case 5: return t("星期六");
      default: return t("星期日");
    }
  }

  /* 时间范围选择器里「当前贴着哪一天」。1.6.1 加的：跨月选起止的时候，
     屏幕上的两个月是动的 —— 只盯 picker.view 的话，
     点一个不在这两个月里的日子会「点完什么都没变」，看着就像点一下就把菜单关掉了。
     吸附规则：
       已经点过起止 → 贴住**起点**那边（这样正在选的那两天一直在屏幕上，
                      再改起点也不用翻页；终点在右边那格里，一样点得着）；
       只点了起点   → 贴住新的那一天（第二下点哪，那一屏就挪到那个月）；
       还没点       → 贴今天。 */
  function pickerAnchor() {
    const today = localDayKey(Date.now());
    if (isDayKey(picker.draftFrom)) return { key: picker.draftFrom, how: "from" };
    if (isDayKey(picker.draftTo)) return { key: picker.draftTo, how: "to" };
    return { key: isDayKey(today) ? today : "", how: "today" };
  }

  /* 两个月这一屏该从哪个月开始铺：默认正好落在锚点那一天上，
     点哪一天的瞬间就能看见自己点的那天（不是「两个月之后」）。 */
  function calendarView() {
    const anchor = pickerAnchor();
    const time = dayStartTime(anchor.key);
    if (Number.isFinite(time)) {
      const date = new Date(time);
      const month = monthStartTime(date.getFullYear(), date.getMonth());
      if (Number.isFinite(month)) return clampCalendarView(month);
    }
    return clampCalendarView(defaultCalendarView());
  }

  /* 日历默认从哪个月开始铺。
     右边那格是「后一个月」，所以起始月取「今天所在月」和「区间起点所在月」里更晚的那个：
     平时翻开就是「上个月 + 这个月」（两个月都点得动，跨月选最快），
     区间起点在更早的月份时再跟着起点走，不然用户得自己翻回去。
     今天之后的日子一律禁用，未来那个月翻出来全是灰的，没有意义。 */
  function defaultCalendarView() {
    const now = new Date();
    const here = monthStartTime(now.getFullYear(), now.getMonth());
    let anchor = custom.from;
    if (!isDayKey(anchor)) anchor = localDayKey(Date.now());
    const start = dayStartTime(anchor);
    if (!Number.isFinite(start)) return here;
    const date = new Date(start);
    const month = monthStartTime(date.getFullYear(), date.getMonth());
    if (!Number.isFinite(month)) return here;
    return month > here ? month : here;
  }

  /* 翻页的两头都封住：左边不早于收藏夹最早那条所在的月，
     右边不晚于今天所在的月（再往后翻全是灰格子）。 */
  function clampCalendarView(time) {
    if (!Number.isFinite(time)) return time;
    const now = new Date();
    const here = monthStartTime(now.getFullYear(), now.getMonth());
    if (time > here) return here;
    const bounds = calendarBounds();
    if (!bounds.earliest) return time;
    const start = dayStartTime(bounds.earliest);
    if (!Number.isFinite(start)) return time;
    const date = new Date(start);
    const floor = monthStartTime(date.getFullYear(), date.getMonth());
    if (!Number.isFinite(floor)) return time;
    return time < floor ? floor : time;
  }

  /* ── 可选范围 ───────────────────────────────────────────────────── */

  /* 自定义区间能选到哪：下界是收藏夹里最早的那条收藏，上界永远是今天。
     这两个值由 stats-core.js 的 snapshot() 交上来（earliest 可能没有），
     拿不到就按「不限」处理 —— 少一个下界总比整块日历点不动好。 */
  function calendarBounds() {
    const latest = localDayKey(Date.now());
    let earliest = "";
    if (stats && isDayKey(stats.earliest)) earliest = String(stats.earliest);
    else if (stats && isDayKey(stats.days && stats.days.since)) earliest = String(stats.days.since);
    if (earliest && earliest > latest) earliest = latest;
    return { earliest: earliest, latest: latest };
  }

  function clampDay(key) {
    if (!isDayKey(key)) return "";
    const bounds = calendarBounds();
    if (bounds.earliest && key < bounds.earliest) return bounds.earliest;
    if (key > bounds.latest) return bounds.latest;
    return key;
  }

  function pickDay(key) {
    if (!isDayKey(key)) return;
    const bounds = calendarBounds();
    /* 置灰的格子本来就点不动；键盘 / 脚本绕过 disabled 也得拦住 */
    if (bounds.earliest && key < bounds.earliest) return;
    if (key > bounds.latest) return;
    if (!picker.draftFrom || (picker.draftFrom && picker.draftTo)) {
      /* 第一下定起点，同时把上一次的终点清掉 */
      picker.draftFrom = key;
      picker.draftTo = "";
    } else {
      /* 第二下定终点：反着点也认，渲染时按大小归一 */
      picker.draftTo = key;
    }
    renderCalendar();
  }

  function applyCustom() {
    const from = clampDay(picker.draftFrom);
    const to = clampDay(picker.draftTo || picker.draftFrom);
    if (!isDayKey(from) || !isDayKey(to)) return;
    const low = from <= to ? from : to;
    const high = from <= to ? to : from;
    const days = rangeDays(dayStartTime(low), dayEndTime(high));
    if (days > MAX_CUSTOM_DAYS) {
      /* 上限跟核心一致，真踩到就明说，不偷偷截断 */
      setText(ui.calWarn, t("最长的自定义区间是 {years} 年，请把范围缩小一点。", {
        years: formatCount(Math.max(1, Math.floor(MAX_CUSTOM_DAYS / 365)))
      }));
      show(ui.calWarn, true);
      return;
    }
    custom.from = low;
    custom.to = high;
    preset = "custom";
    focusedDay = "";
    focusedRow = null;
    closePicker();
    render();
  }

  function choosePreset(name) {
    if (RANGE_ALL.indexOf(name) < 0) return;
    if (name === "custom") {
      /* 日历、清空、确定都长在下拉面板里面，所以点「自定义区间」
         必须自己把面板打开 —— 只切 picker.mode 不 openPicker 的话，
         面板还带着 hidden，整块日历（连同确定按钮）都显示不出来。 */
      if (!picker.open) openPicker();
      picker.mode = "custom";
      /* 日历翻到贴着锚点的那一屏（今天所在月，或已选起点那天的月份） */
      picker.paged = false;
      picker.view = calendarView();
      show(ui.calendar, true);
      renderCalendar();
      return;
    }
    preset = name;
    focusedDay = "";
    focusedRow = null;
    closePicker();
    render();
  }

  function bindPicker() {
    if (ui.rangeButton) {
      ui.rangeButton.addEventListener("click", () => {
        if (picker.open) closePicker();
        else openPicker();
      });
    }
    if (ui.rangeList) {
      ui.rangeList.addEventListener("click", (event) => {
        const target = event.target instanceof Element ? event.target.closest("[data-range]") : null;
        if (!target) return;
        choosePreset(target.getAttribute("data-range"));
      });
    }
    if (ui.calendar) {
      ui.calendar.addEventListener("click", (event) => {
        const target = event.target instanceof Element ? event.target.closest("[data-day]") : null;
        if (!target || target.disabled) return;
        pickDay(target.getAttribute("data-day"));
      });
    }
    if (ui.calPrev) {
      ui.calPrev.addEventListener("click", () => {
        /* 手动翻页后视图就不再自动跟着锚点跑 */
        picker.paged = true;
        picker.view = clampCalendarView(addMonths(picker.view, -1));
        renderCalendar();
      });
    }
    if (ui.calNext) {
      ui.calNext.addEventListener("click", () => {
        const next = addMonths(picker.view, 1);
        /* 右边那个月已经是本月或更晚就不再往后翻（再翻全是未来） */
        const now = new Date();
        const limit = monthStartTime(now.getFullYear(), now.getMonth());
        if (!Number.isFinite(next) || next > limit) return;
        picker.paged = true;
        picker.view = next;
        renderCalendar();
      });
    }
    /* 「回到今天」：只把日历窗口翻回今天那两个月的窗口，草稿选中一个字都不动。
       用户按它是想「跳回去看看今天」，不是想把刚选的起止清掉 —— 1.6.2 里
       顺手把 draftFrom/draftTo 落成今天，等于把用户上一步的动作抹了，被复测抓了出来。
       窗口锚点平时是跟着 draftFrom 跑的（renderCalendar 里 !paged 时会重算 view），
       所以这里得按「手动翻页」把 paged 立起来，否则重画完又跳回选中的那一天，
       就又变回用户报过的「按回到今天却跳到我选的第一天」。 */
    if (ui.calToday) {
      ui.calToday.addEventListener("click", () => {
        const now = new Date();
        picker.paged = true;
        picker.view = clampCalendarView(monthStartTime(now.getFullYear(), now.getMonth()));
        show(ui.calWarn, false);
        renderCalendar();
      });
    }
    /* 「上一年的同一个月」：一年 12 个月，直接减 12 个月 —— 3 月 31 日这类日子
       由 addMonths 自己夹到当月最后一天，不会溢出到下个月。 */
    if (ui.calPrevYear) {
      ui.calPrevYear.addEventListener("click", () => {
        picker.paged = true;
        picker.view = clampCalendarView(addMonths(picker.view, -12));
        renderCalendar();
      });
    }
    if (ui.calNextYear) {
      ui.calNextYear.addEventListener("click", () => {
        const next = addMonths(picker.view, 12);
        const now = new Date();
        const limit = monthStartTime(now.getFullYear(), now.getMonth());
        /* 右边那个月已经是本月或更晚就不再往后翻（再翻全是未来） */
        if (!Number.isFinite(next) || next > limit) return;
        picker.paged = true;
        picker.view = next;
        renderCalendar();
      });
    }
    if (ui.calApply) ui.calApply.addEventListener("click", applyCustom);
    if (ui.calReset) {
      ui.calReset.addEventListener("click", () => {
        picker.draftFrom = "";
        picker.draftTo = "";
        renderCalendar();
      });
    }
    /* Esc 关掉下拉；点外面也关掉（点在自己身上不算外面） */
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || !picker.open) return;
      closePicker();
    });
    /* 点外面关掉。判「里外」用事件路径而不是当前 DOM 树：
       日历每点一下就重画一遍格子，刚被点中的那个按钮在事件冒泡到这里时
       已经从文档里摘下来了（contains 变 false），照原样判就会被当成「点了外面」
       —— 这正是用户报的「点一个日期就退出、选不了完整起止」的根因。 */
    document.addEventListener("click", (event) => {
      if (!picker.open) return;
      const path = typeof event.composedPath === "function" ? event.composedPath() : [];
      if (ui.rangeCard && (path.indexOf(ui.rangeCard) >= 0 || (event.target instanceof Node && ui.rangeCard.contains(event.target)))) return;
      closePicker();
    });
  }

  /* ── 图表交互 ───────────────────────────────────────────────────── */

  /* 点在图上：找到「这一列」的判定层（带 data-day 的那一层）。
     柱子与判定层都在最外层，判定层是后画的那一层，所以正常情况下点到的就是它；
     兜底再往上找一层，免得将来有人把柱子包进 <g> 里之后这里悄悄失灵。 */
  function barFromEvent(event, element) {
    const target = event.target;
    if (!(target instanceof Element)) return null;
    let bar = target.closest("[data-day]");
    if (!bar && target.parentElement) bar = target.parentElement.closest("[data-day]");
    if (!bar || !element || !element.contains(bar)) return null;
    return bar;
  }

  /* 选中 / 收起某一根柱子：再点同一根收起，点空白处也收起。
     行由调用方按「图表 → 索引」查好传进来（逐日 / 周 / 月一张图，年份一张图）。
     target 区分是哪张图：两张图的选中态各记各的，点上面不影响下面。 */
  function toggleBar(key, row, target) {
    if (!key) return;
    if (target === "year") {
      yearFocusDay = yearFocusDay === key ? "" : key;
      yearFocusRow = yearFocusDay ? (row || null) : null;
    } else {
      focusedDay = focusedDay === key ? "" : key;
      focusedRow = focusedDay ? (row || null) : null;
    }
    render();
  }

  /* 两张图共用一套绑定：柱子是按钮（Enter / 空格触发），左右方向键在柱子之间走。
     行索引必须现查现取：renderChart / renderYears 每次都是**另换一个新 Map**，
     启动时把 Map 本身传进来，闭包里那份就永远停在初始的空 Map 上 ——
     点柱子查不到行 → focusedRow 恒为 null → 饼图卡片永远不出现。
     这正是真机复测里「点任意柱子和年份柱子都不出饼图」的根因。 */
  function bindBarChart(element, lookupOf, target) {
    if (!element) return;
    const rowOf = (key) => {
      const map = typeof lookupOf === "function" ? lookupOf() : lookupOf;
      return map && typeof map.get === "function" ? map.get(String(key)) : undefined;
    };
    /* 收起时只动「这张图」的选中键，另一张图不受影响 */
    const collapse = () => {
      if (target === "year") {
        if (!yearFocusDay) return;
        yearFocusDay = "";
        yearFocusRow = null;
      } else {
        if (!focusedDay) return;
        focusedDay = "";
        focusedRow = null;
      }
      render();
    };
    element.addEventListener("click", (event) => {
      const bar = barFromEvent(event, element);
      if (!bar) {
        /* 点在图上但不是柱子上：收起饼图 */
        collapse();
        return;
      }
      const key = bar.getAttribute("data-day");
      toggleBar(key, rowOf(key), target);
    });
    element.addEventListener("keydown", (event) => {
      const bar = barFromEvent(event, element);
      if (!bar) return;
      const key = event.key;
      if (key === "Enter" || key === " " || key === "Spacebar") {
        event.preventDefault();
        const day = bar.getAttribute("data-day");
        toggleBar(day, rowOf(day), target);
        return;
      }
      if (key !== "ArrowLeft" && key !== "ArrowRight") return;
      const bars = [...element.querySelectorAll("rect[data-day]")];
      const index = bars.indexOf(bar);
      const next = bars[index + (key === "ArrowRight" ? 1 : -1)];
      if (!next) return;
      event.preventDefault();
      next.focus();
    });
  }

  function bindChart() {
    bindBarChart(ui.chart, () => chartRows, "main");
    /* 「按年份累计」那张图以前完全没绑：柱子是按钮、能聚焦，点了却什么都不发生
       —— 用户报的「按年份累计点柱子不出饼图」就是这里。
       对端没给独立容器时 renderYears 会退回 ui.chart，那种情况下不能再绑一次。 */
    if (ui.yearChart && ui.yearChart !== ui.chart) bindBarChart(ui.yearChart, () => yearRows, "year");
  }

  /* ── 事件 ───────────────────────────────────────────────────────── */

  /* 「返回设置」：本页是新开的一个标签，先试着关掉它（回到原来那个设置页标签）。
     浏览器不允许脚本关掉非脚本打开的标签，window.close() 会静默失败，
     所以兜底查一次当前标签再导航过去 —— 绝不把按钮做成 <a href>。 */
  /* 「返回设置」：把这个标签页本身导航回设置页 —— 1.6.4 起不再先试 window.close()。
     本页是设置页用 chrome.tabs.create 打开的，window.close() 真的关得掉，
     关掉之后用户落到「底下原来那个标签」，看着就像「这个按钮只是把页面关了」
     （设置页的「返回收藏库」也是同一个坑，V1.4.1 已经踩过一次）。
     拿不到当前标签时就地导航，绝不把人卡住。 */
  function bindBack() {
    const button = document.getElementById("statsBack");
    if (!button) return;
    button.addEventListener("click", () => {
      const url = chrome.runtime.getURL("settings.html");
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
    });
  }

  /* 窗口宽度变了（贴靠、改窗口大小）柱子就重画一遍：宽度是实测的，
     不重画的话 SVG 会被拉伸，字号也跟着变形。
     只重画 SVG 那几张：四张卡的数字、下拉的文案跟宽度没关系，
     跟着重画一遍只会把已经画好的东西再擦一次。 */
  function bindResize() {
    window.addEventListener("resize", () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        if (!loaded || isEmptySnapshot(stats)) return;
        /* 只重画跟着宽度走的那几张 SVG：卡片的显示/隐藏和文案都不受窗口宽度影响 */
        const range = activeRange(Date.now());
        renderChart(range);
        renderPie();
        renderYears();
      }, RESIZE_DELAY);
    });
  }

  /* 语言切换立刻生效：i18n.js 自己只负责静态那批 [data-i18n]，
     脚本填进去的正文得在它换完词典之后再画一遍。 */
  function watchStorage() {
    if (!chrome.storage || !chrome.storage.onChanged) return;
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !changes) return;
      const localeChanged = Boolean(changes[i18n ? i18n.STORAGE_KEY : "bcaLocale"]);
      const next = changes[i18n ? i18n.STORAGE_KEY : "bcaLocale"]?.newValue;
      const statsChanged = Boolean(changes[STATS_KEY]);
      if (!localeChanged && !statsChanged) return;
      const ready = (localeChanged && i18n) ? i18n.use(next, { silent: true }) : Promise.resolve();
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
    bindPicker();
    bindChart();
    watchStorage();
    try {
      if (i18n && typeof i18n.init === "function") await i18n.init();   // 读不到就按默认语言显示，别把整页拖死
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
