// 1.5.0：本地数据库（`003database/database.json`）的纯逻辑。
//
// 与 archive-core.js 一样，这个文件**不碰任何浏览器 API**（没有 chrome、没有 DOM），
// 所以后台 service worker、收藏库页面、数据统计页可以共用同一份实现，
// 单元测试也能直接在 node 里跑（见 test/stats-core.test.cjs）。
//
// 数据库只存「一条视频一条记录」这一种事实（videos 表），其余全是派生出来的：
// 总数、今日、近 7 天、按收藏夹排行、图表的每日柱……都由 snapshot()/recentDays()
// 现算。这样不会出现「汇总字段和明细对不上」的老问题。
(function attachStatsCore(global) {
  "use strict";

  const DATABASE_FOLDER_NAME = "003database";
  const DATABASE_FILE_NAME = "database.json";
  const DATABASE_VERSION = 1;
  // 「近期」的窗口：宠物那句「你近期保存最多的收藏夹是」与排行榜的「近期」列都用它。
  // 1.5.9：窗口统一成近 7 天（原来 30 天，用户报「显示近 30 天 15 个、我实际有 84 个」）。
  // 这样「近期」列、宠物那句「你近期保存最多的收藏夹是」与柱状图/近 7 天新增同一个口径。
  const RECENT_WINDOW_DAYS = 7;
  // 数据统计页的默认柱状图天数。
  const DAILY_CHART_DAYS = 14;
  // 快照里那份「按天紧凑表」（dailyRows）覆盖的天数。180 天 ≈ 半年，
  // 足够统计页做「上月 / 近 30 天 / 近半年」这类区间，又不至于把快照撑大。
  const DAILY_ROWS_DAYS = 180;
  // 日期区间的天数上限（约两年）。既挡住 `new Date(...)` 的越界年份，
  // 也挡住界面上一次要画几万个柱子。
  const MAX_RANGE_DAYS = 730;
  // 宠物台词条数（index 由 touchPet 返回，具体文案在界面侧，后台不碰 i18n）。
  const PET_LINE_COUNT = 4;
  // 同一天最多把亲密度加这么多次 —— 防止「一直点一直涨」。
  const PET_DAILY_TOUCH_LIMIT = 20;
  const MAX_AFFINITY = 9999;
  const DAY_MS = 24 * 60 * 60 * 1000;

  function numberOr(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  // 区间的毫秒边界专用：空值 / 空串一律当「没给」。
  // 不能直接用 numberOr，因为 Number(null) === 0 —— 那样 `null` 会变成一个合法的
  // 1970-01-01 区间，而不是「这个区间是坏的」。0 本身仍然是合法时间戳（1970 年）。
  // 另外要认 "2026-03-28" 这种日键：界面上的日历格子就是日键，rangeFor("custom") 拿到
  // 的 from/to 直接是日键。不认的话 Number("2026-03-28") 是 NaN，自定义区间会整个变成
  // null，界面上就成了「点了确定但图还是上一次的」——这条是自定义区间一直不生效的根因。
  // 只认形状严格的日键（错一个字符都不猜），认不出照旧返回 NaN。
  function timeOr(value) {
    if (value === null || value === undefined || value === "") return NaN;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
    return dayKeyToTime(value);
  }

  // 一律用**本地时间**分天：用户看到的「今日」就是挂钟上的今日，不是 UTC 的。
  function localDayKey(value) {
    const time = numberOr(value, NaN);
    const date = Number.isFinite(time) ? new Date(time) : new Date();
    if (Number.isNaN(date.getTime())) return "";
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  }

  // "2026-10-12" → 当天 00:00 的本地毫秒时间戳。
  function dayKeyToTime(key) {
    const match = String(key || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return NaN;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    const time = date.getTime();
    return Number.isFinite(time) ? time : NaN;
  }

  // 视频信息.txt 里的「视频收藏时间」写作 2025年06月13日00时15分40秒
  // （有的带 .000，有的年月日与时分秒之间有空格），归档目录名也是这个形状。
  // 解析不出来就返回 NaN —— 调用方自己决定怎么回退，不要在这里瞎猜一个时间。
  function parseFavoriteTime(text) {
    const raw = String(text || "");
    const match = raw.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日(?:\s*(\d{1,2})\s*时\s*(\d{1,2})\s*分\s*(\d{1,2})\s*秒)?/);
    if (match) {
      const date = new Date(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3]),
        Number(match[4] || 0),
        Number(match[5] || 0),
        Number(match[6] || 0)
      );
      const time = date.getTime();
      if (Number.isFinite(time)) return time;
    }
    const iso = raw.match(/\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?/);
    if (iso) {
      const time = Date.parse(iso[0].replace(" ", "T"));
      if (Number.isFinite(time)) return time;
    }
    return NaN;
  }

  // 一条记录的身份：优先 BV 号，其次 av 号；两者都没有就用「收藏夹 + 标题」兜底。
  // 这样重复导入同一条视频不会在数据库里变成两行。
  function videoKey(record = {}) {
    const source = record && typeof record === "object" ? record : {};
    const bvid = String(source.bvid || "").trim();
    if (/^BV[0-9A-Za-z]{10}$/.test(bvid)) return `bvid:${bvid}`;
    const aid = String(source.aid || "").trim().replace(/^av/i, "");
    if (/^\d+$/.test(aid)) return `aid:${aid}`;
    const title = String(source.title || "").trim();
    if (!title) return "";
    return `title:${String(source.collection || "")}\u0000${title}`;
  }

  function emptyDatabase(now = Date.now()) {
    const time = numberOr(now, Date.now());
    return {
      version: DATABASE_VERSION,
      createdAt: new Date(time).toISOString(),
      firstSeenAt: new Date(time).toISOString(),
      updatedAt: new Date(time).toISOString(),
      videos: {},
      totals: { savedTotal: 0 },
      pet: { affinity: 0, day: localDayKey(time), todayTouch: 0, totalTouch: 0 }
    };
  }

  function normalizeEntry(raw) {
    if (!raw || typeof raw !== "object") return null;
    const at = numberOr(raw.at, numberOr(dayKeyToTime(raw.day), NaN));
    if (!Number.isFinite(at)) return null;
    return {
      at,
      day: /^\d{4}-\d{2}-\d{2}$/.test(String(raw.day || "")) ? String(raw.day) : localDayKey(at),
      collection: String(raw.collection || ""),
      title: String(raw.title || ""),
      bvid: String(raw.bvid || ""),
      aid: String(raw.aid || "")
    };
  }

  function normalizePet(raw, now) {
    const pet = raw && typeof raw === "object" ? raw : {};
    return {
      affinity: Math.max(0, Math.min(MAX_AFFINITY, numberOr(pet.affinity, 0))),
      day: /^\d{4}-\d{2}-\d{2}$/.test(String(pet.day || "")) ? String(pet.day) : localDayKey(now),
      todayTouch: Math.max(0, numberOr(pet.todayTouch, 0)),
      totalTouch: Math.max(0, numberOr(pet.totalTouch, 0))
    };
  }

  // 读到的东西可能是手改坏的、旧版本的、或者干脆不是 JSON 解析出来的对象。
  // 这里只做「尽力保住能认的字段」，绝不抛异常。
  function normalizeDatabase(raw, now = Date.now()) {
    const time = numberOr(now, Date.now());
    const database = emptyDatabase(time);
    if (!raw || typeof raw !== "object") return database;
    database.version = numberOr(raw.version, DATABASE_VERSION);
    const createdAt = Date.parse(String(raw.createdAt || ""));
    if (Number.isFinite(createdAt)) database.createdAt = new Date(createdAt).toISOString();
    const updatedAt = Date.parse(String(raw.updatedAt || ""));
    if (Number.isFinite(updatedAt)) database.updatedAt = new Date(updatedAt).toISOString();
    const videos = raw.videos && typeof raw.videos === "object" ? raw.videos : {};
    for (const [key, entry] of Object.entries(videos)) {
      if (!key) continue;
      const normalized = normalizeEntry(entry);
      if (normalized) database.videos[key] = normalized;
    }
    // 首次启用时间：老库没这个字段时退到 createdAt（数据库文件诞生的那一刻，
    // 也就是用户第一次导入 / 第一次存档，比「最早一条收藏」小得多）。
    const firstSeenAt = Date.parse(String(raw.firstSeenAt || ""));
    const createdTime = Date.parse(String(database.createdAt || ""));
    database.firstSeenAt = new Date(
      Number.isFinite(firstSeenAt) ? firstSeenAt : (Number.isFinite(createdTime) ? createdTime : time)
    ).toISOString();
    // 累计保存数只增不减：字段缺失（老库升级上来）时拿现有条数当起点，
    // 免得刚升级就让用户看到「帮你保存了 0 个视频」。
    const savedTotal = numberOr(raw.totals && raw.totals.savedTotal, NaN);
    const known = Object.keys(database.videos).length;
    database.totals = { savedTotal: Number.isFinite(savedTotal) ? Math.max(known, Math.floor(savedTotal)) : known };
    database.pet = normalizePet(raw.pet, time);
    return database;
  }

  // 把一条归档记录（收藏库扫描出来的 video，或后台刚写完的那一条）并进数据库。
  // 同一条视频已经存在时：保留**最早的收藏时间**（收藏时间不会变），但收藏夹/标题跟着最新走
  // —— 「移到另一个收藏夹」之后排行榜要反映新位置。
  function addRecord(database, record, now = Date.now()) {
    if (!database || typeof database !== "object") return database;
    const key = videoKey(record);
    if (!key) return database;
    const time = numberOr(record.at, NaN);
    const at = Number.isFinite(time) ? time : numberOr(now, Date.now());
    const existing = database.videos[key];
    if (existing) {
      existing.at = Math.min(numberOr(existing.at, at), at);
      existing.day = localDayKey(existing.at);
      existing.collection = String(record.collection || existing.collection || "");
      existing.title = String(record.title || existing.title || "");
      existing.bvid = String(record.bvid || existing.bvid || "");
      existing.aid = String(record.aid || existing.aid || "");
    } else {
      database.videos[key] = {
        at,
        day: localDayKey(at),
        collection: String(record.collection || ""),
        title: String(record.title || ""),
        bvid: String(record.bvid || ""),
        aid: String(record.aid || "")
      };
      // 累计保存数：只有「新的一条入库」才 +1，同一条重扫 / 改收藏夹都不加，所以它单调递增、
      // 删视频也不会回退（用户要的正是「自首次启用以来的累计」）。
      if (!database.totals || typeof database.totals !== "object") database.totals = { savedTotal: 0 };
      database.totals.savedTotal = Math.max(0, numberOr(database.totals.savedTotal, 0)) + 1;
    }
    database.updatedAt = new Date(numberOr(now, Date.now())).toISOString();
    return database;
  }

  // 收藏库扫描出来的 video → 数据库一条记录。
  // video.date 是「视频收藏时间」原文，取不到时 library.js 已经回退成目录名（也是这个格式）。
  function recordFromVideo(video = {}, now = Date.now()) {
    const source = video && typeof video === "object" ? video : {};
    const favoriteAt = parseFavoriteTime(source.date || source.directory || "");
    return {
      key: videoKey(source),
      collection: source.collection || "",
      title: source.title || "",
      bvid: source.bvid || "",
      aid: source.aid || "",
      at: Number.isFinite(favoriteAt) ? favoriteAt : numberOr(now, Date.now())
    };
  }

  // 用一次完整扫描重建数据库。previous 传进来时保留它的 createdAt 与宠物状态
  // —— 重建的是「视频明细」，不该把亲密度清掉。
  function databaseFromVideos(videos = [], options = {}) {
    const now = numberOr(options.now, Date.now());
    const previous = options.previous ? normalizeDatabase(options.previous, now) : null;
    const database = emptyDatabase(now);
    if (previous) {
      database.createdAt = previous.createdAt;
      database.firstSeenAt = previous.firstSeenAt;
      database.pet = previous.pet;
    }
    for (const video of videos || []) addRecord(database, recordFromVideo(video, now), now);
    // 整份重建会把每条都当「新插入」，所以累计数只能取「重建出来的条数」与「重建前的峰值」
    // 里更大的那个 —— 一旦重建就把历史累计抹平，用户删过的那些就白算了。
    database.totals.savedTotal = Math.max(
      numberOr(database.totals && database.totals.savedTotal, 0),
      previous ? numberOr(previous.totals && previous.totals.savedTotal, 0) : 0
    );
    database.updatedAt = new Date(now).toISOString();
    return database;
  }

  // 数据库里的条目数明显少于刚扫描到的记录数 —— 说明这份库是旧的（第一次升级到 1.5.0
  // 时就是 0 条），收藏库会在扫描完成后回填一次。
  function needsRebuild(database, recordCount) {
    const total = Object.keys((database && database.videos) || {}).length;
    return total < Math.max(0, numberOr(recordCount, 0));
  }

  function entriesOf(database) {
    const videos = (database && database.videos) || {};
    return Object.values(videos).filter((entry) => entry && Number.isFinite(numberOr(entry.at, NaN)));
  }

  // 某天 00:00:00.000 的本地毫秒时间戳。与 localDayKey / dayKeyToTime 同一套本地日口径。
  function dayStartTime(year, month, day) {
    return new Date(year, month, day).getTime();
  }

  // 从 endTime 那天往回数 count 天的 day key 列表，升序。
  // 注意不能用 `time - offset * 86400000`：少数时区（澳大利亚 Lord Howe 的夏令时只挪半小时）
  // 会让 dayKeyToTime 得到的「午夜」和真实午夜差一截，固定毫秒步进每天漂半小时，
  // 攒够几天就会整天错位。用日期构造一天一天地走，则任何时区都对。
  function localDayList(endTime, count) {
    const total = Math.max(0, Math.floor(numberOr(count, 0)));
    const days = [];
    for (let offset = total - 1; offset >= 0; offset -= 1) {
      const day = localDayKey(dayStartTime(endTime.getFullYear(), endTime.getMonth(), endTime.getDate() - offset));
      if (!day) continue;
      days.push(day);
    }
    return days;
  }

  function dayStartOf(time) {
    const date = new Date(numberOr(time, NaN));
    if (Number.isNaN(date.getTime())) return NaN;
    return dayStartTime(date.getFullYear(), date.getMonth(), date.getDate());
  }

  // 结束日的 23:59:59.999。用「下一天 00:00 减 1 毫秒」而不是加 86399999，
  // 夏令时那天才不会偏一小时。
  function dayEndOf(time) {
    const start = dayStartOf(time);
    if (!Number.isFinite(start)) return NaN;
    const date = new Date(start);
    return dayStartTime(date.getFullYear(), date.getMonth(), date.getDate() + 1) - 1;
  }

  // 区间最多跨 MAX_RANGE_DAYS 个「日历日」。用日期构造递增，越界（undefined）时停手，
  // 免得遇到 275760 年那种会变成 NaN 的年份。
  function clampSpan(fromStart, toEnd) {
    if (!Number.isFinite(fromStart) || !Number.isFinite(toEnd)) return { from: fromStart, to: toEnd };
    const end = new Date(toEnd);
    let limit = dayStartTime(end.getFullYear(), end.getMonth(), end.getDate());
    for (let i = 1; i < MAX_RANGE_DAYS; i += 1) {
      const start = dayStartTime(end.getFullYear(), end.getMonth(), end.getDate() - i);
      if (!Number.isFinite(start)) break;
      limit = start;
    }
    return { from: Math.max(fromStart, limit), to: toEnd };
  }

  // 两个**本地日**之间隔了几天（含头含尾）。夏令时那两天不相等，所以用 UTC 归一化再相减。
  function dayCountBetween(from, to) {
    const first = new Date(from);
    const last = new Date(to);
    if (Number.isNaN(first.getTime()) || Number.isNaN(last.getTime())) return NaN;
    const firstUtc = Date.UTC(first.getFullYear(), first.getMonth(), first.getDate());
    const lastUtc = Date.UTC(last.getFullYear(), last.getMonth(), last.getDate());
    return Math.floor((lastUtc - firstUtc) / DAY_MS) + 1;
  }

  // 统计页能选的区间。键是给程序用的预设名，值是给界面兜底用的中文名
  // （界面自己会走 i18n，这里的 label 只在词典缺项时垫底）。
  const RANGE_PRESETS = {
    today: "今天",
    yesterday: "昨天",
    last7: "近 7 天",
    last30: "近 30 天",
    thisMonth: "本月",
    lastMonth: "上个月",
    custom: "自定义"
  };

  function hasPreset(name) {
    return typeof name === "string" && Object.prototype.hasOwnProperty.call(RANGE_PRESETS, name);
  }

  function rangeObject(preset, from, to, label) {
    const days = dayCountBetween(from, to);
    if (!Number.isFinite(days) || days < 1) return null;
    return { preset, from, to, days, label: label || RANGE_PRESETS[preset] || RANGE_PRESETS.custom };
  }

  // 把两个毫秒值收敛成「整日区间」：from 落到当天 00:00:00.000、to 落到当天 23:59:59.999，
  // 两端都含。from > to（或认不出的值）返回 null —— 宁可不画，也不要画出一段反向的区间。
  function normalizeDayRange(fromValue, toValue, preset = "custom") {
    const fromTime = timeOr(fromValue);
    const toTime = timeOr(toValue);
    if (!Number.isFinite(fromTime) || !Number.isFinite(toTime)) return null;
    const fromStart = dayStartOf(fromTime);
    const toEnd = dayEndOf(toTime);
    if (!Number.isFinite(fromStart) || !Number.isFinite(toEnd) || fromStart > toEnd) return null;
    const clamped = clampSpan(fromStart, toEnd);
    return rangeObject(preset, clamped.from, clamped.to);
  }

  // 近 days 天（含今天）。days 被夹到 1 ~ MAX_RANGE_DAYS，坏输入退成「今天」。
  // preset 只是给返回值贴的标签：last7 / last30 也走这里，但它们要报自己的名字。
  function rangeFromDays(days, now = Date.now(), preset = "custom") {
    const time = new Date(timeOr(now));
    const safe = Number.isNaN(time.getTime()) ? new Date() : time;
    const span = Math.max(1, Math.min(MAX_RANGE_DAYS, Math.floor(numberOr(days, 1))));
    const start = dayStartTime(safe.getFullYear(), safe.getMonth(), safe.getDate() - (span - 1));
    const end = dayStartTime(safe.getFullYear(), safe.getMonth(), safe.getDate() + 1) - 1;
    return rangeObject(hasPreset(preset) ? preset : "custom", start, end);
  }

  // 预设区间 → 具体的毫秒边界。`now` 一律由调用方传进来（测试里是固定值），
  // 这样「今天」是哪一天是确定的，不受函数内部读时钟影响。
  function rangeFor(preset, now = Date.now(), custom = null) {
    // 认不出的 now（含 null：Number(null) 是 0，那不是「现在」）退成真实的当下，
    // 而不是把用户送到 1970 年去。
    const time = timeOr(now);
    const today = new Date(Number.isFinite(time) ? time : Date.now());
    const safe = Number.isNaN(today.getTime()) ? new Date() : today;
    const timeMs = safe.getTime();
    const year = safe.getFullYear();
    const month = safe.getMonth();
    const day = safe.getDate();
    const name = hasPreset(preset) ? preset : "custom";
    if (name === "custom") {
      const source = custom && typeof custom === "object" ? custom : {};
      return normalizeDayRange(source.from, source.to, "custom");
    }
    if (name === "today") return rangeObject(name, dayStartTime(year, month, day), dayEndOf(timeMs));
    if (name === "yesterday") return rangeObject(name, dayStartTime(year, month, day - 1), dayEndOf(dayStartTime(year, month, day) - 1));
    if (name === "last7") return rangeFromDays(7, timeMs, name);
    if (name === "last30") return rangeFromDays(30, timeMs, name);
    if (name === "thisMonth") {
      return rangeObject(name, dayStartTime(year, month, 1), dayEndOf(timeMs));
    }
    // 上个月：1 号 00:00 ~ 月末 23:59:59.999。month - 1 为负时 Date 会自动退到去年 12 月。
    return rangeObject(name, dayStartTime(year, month - 1, 1), dayEndOf(dayStartTime(year, month, 0)));
  }

  // 按天分桶，桶里顺手记下收藏夹构成（点柱子看当天饼图就靠它）。
  // 分天用条目自己的 `day` 字段，与 recentDays / collectionRows 同一口径；
  // 老库缺 `day` 时现算 localDayKey(entry.at)。
  function bucketByDay(database) {
    const buckets = new Map();
    for (const entry of entriesOf(database)) {
      const day = entry.day || localDayKey(entry.at);
      if (!day) continue;
      let bucket = buckets.get(day);
      if (!bucket) {
        bucket = { count: 0, byCollection: new Map() };
        buckets.set(day, bucket);
      }
      const name = entry.collection || "未分类收藏";
      bucket.count += 1;
      bucket.byCollection.set(name, numberOr(bucket.byCollection.get(name), 0) + 1);
    }
    return buckets;
  }

  // 区间内**每一天都出现**（没记录的那天补 0），按时间升序。
  // 图表要的是连续的柱子，缺天不补就会出现「10-05 挨着 10-07」这种假相邻。
  function seriesInRange(database, range) {
    const from = timeOr(range && range.from);
    const to = timeOr(range && range.to);
    if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) return [];
    const buckets = bucketByDay(database);
    const rows = [];
    // 用日期构造逐日推进（而不是 from + i * DAY_MS），夏令时那天也不会错位。
    let cursor = from;
    for (let guard = 0; guard <= MAX_RANGE_DAYS && cursor <= to; guard += 1) {
      const day = localDayKey(cursor);
      if (!day) break;
      const bucket = buckets.get(day);
      rows.push({ day, count: bucket ? bucket.count : 0 });
      const date = new Date(cursor);
      cursor = dayStartTime(date.getFullYear(), date.getMonth(), date.getDate() + 1);
    }
    return rows;
  }

  // 区间内的总收藏数。等于 seriesInRange 各柱之和（统计页顶上的大数字）。
  function totalInRange(database, range) {
    const from = timeOr(range && range.from);
    const to = timeOr(range && range.to);
    if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) return 0;
    let total = 0;
    for (const entry of entriesOf(database)) {
      if (entry.at >= from && entry.at <= to) total += 1;
    }
    return total;
  }

  // 区间内的收藏夹构成（饼图）。count 降序，同数按名字本地化排序（"zh-CN" 才排得出中文顺序）。
  // count 为 0 的收藏夹**不出现** —— 空空一个「0 条」的扇区既没信息量又挤占图例。
  function collectionBreakdown(database, range) {
    const from = timeOr(range && range.from);
    const to = timeOr(range && range.to);
    if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) return [];
    const counts = new Map();
    for (const entry of entriesOf(database)) {
      if (entry.at < from || entry.at > to) continue;
      const name = entry.collection || "未分类收藏";
      counts.set(name, numberOr(counts.get(name), 0) + 1);
    }
    return Array.from(counts.entries())
      .filter(([, count]) => count > 0)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh-CN"));
  }

  // 某一天所属那一周的周一。用「当天是星期几」回退，不做毫秒减法：
  // 夏令时那天少/多一小时的话，`time - 3 * DAY_MS` 会落到周日 23:00。
  // 做法与 localDayList 一致 —— 先按日运算，再取那天的 00:00。
  function weekStartOf(time) {
    const date = new Date(numberOr(time, NaN));
    if (Number.isNaN(date.getTime())) return NaN;
    return dayStartTime(date.getFullYear(), date.getMonth(), date.getDate() - ((date.getDay() + 6) % 7));
  }

  // 周一那天的日期键。"2026-08-03"
  function weekKeyOf(time) {
    const monday = weekStartOf(time);
    return Number.isFinite(monday) ? localDayKey(monday) : "";
  }

  // 一个自然月一个 key："2026-08"。月份从 1 起算（和界面上「8 月」一致）。
  function monthKeyOf(time) {
    const date = new Date(numberOr(time, NaN));
    if (Number.isNaN(date.getTime())) return "";
    return date.getFullYear() + "-" + pad2(date.getMonth() + 1);
  }

  // 按月分桶（全量，不受 dailyRows 那 180 天窗口限制）。
  // byCollection 用 Map：和 bucketByDay 同一形状，后续序列化时再过滤。
  function bucketByMonth(database) {
    const buckets = new Map();
    for (const entry of entriesOf(database)) {
      const month = monthKeyOf(entry.at);
      if (!month) continue;
      let bucket = buckets.get(month);
      if (!bucket) {
        bucket = { count: 0, byCollection: new Map() };
        buckets.set(month, bucket);
      }
      const name = entry.collection || "未分类收藏";
      bucket.count += 1;
      bucket.byCollection.set(name, numberOr(bucket.byCollection.get(name), 0) + 1);
    }
    return buckets;
  }

  // 按自然周（周一~周日）汇总，只列**有记录**的周，升序。
  // 长区间的柱子用它：730 天 ≈ 105 根柱子，逐日渲染会挤成一片。
  function weeklySeries(database) {
    const buckets = new Map();
    for (const entry of entriesOf(database)) {
      const week = weekKeyOf(entry.at);
      if (!week) continue;
      let bucket = buckets.get(week);
      if (!bucket) {
        bucket = { count: 0, byCollection: new Map() };
        buckets.set(week, bucket);
      }
      const name = entry.collection || "未分类收藏";
      bucket.count += 1;
      bucket.byCollection.set(name, numberOr(bucket.byCollection.get(name), 0) + 1);
    }
    return Array.from(buckets.entries())
      .map(([week, bucket]) => ({ week, count: bucket.count, byCollection: byCollectionObject(bucket.byCollection) }))
      .sort((a, b) => (a.week < b.week ? -1 : (a.week > b.week ? 1 : 0)));
  }

  // 按自然月汇总，只列**有记录**的月，升序。
  // 与 yearlySeries 同一口味（空月份不出现）—— 统计页要用它补满区间里的空月，
  // 补 0 是界面的事，这里不替它编。
  function monthlySeries(database) {
    return Array.from(bucketByMonth(database).entries())
      .map(([month, bucket]) => ({ month, count: bucket.count, byCollection: byCollectionObject(bucket.byCollection) }))
      .sort((a, b) => (a.month < b.month ? -1 : (a.month > b.month ? 1 : 0)));
  }

  // Map<string, number> → 只留非零项的普通对象（快照要 JSON 序列化后进 chrome.storage）。
  function byCollectionObject(source) {
    const out = {};
    for (const [name, count] of source) {
      if (count > 0) out[name] = count;
    }
    return out;
  }

  // 按年份汇总，升序、只列有记录的年份（年份时间轴上不该出现空年份）。
  function yearlySeries(database) {
    const counts = new Map();
    for (const entry of entriesOf(database)) {
      const year = new Date(entry.at).getFullYear();
      if (!Number.isFinite(year)) continue;
      counts.set(year, numberOr(counts.get(year), 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([year, count]) => ({ year, count }))
      .sort((a, b) => a.year - b.year);
  }

  // 界面与宠物要的那一小包数字。所有字段都是现算的，没有缓存。
  function snapshot(database, now = Date.now()) {
    const time = numberOr(now, Date.now());
    const today = localDayKey(time);
    const todayTime = dayKeyToTime(today);
    // 三个「近 N 天」的口径都从同一份按天列表上切，免得各算各的又被固定毫秒步进带偏
    // （见 localDayList 的注释）。RECENT_WINDOW_DAYS 目前正好是 7，所以近 7 天与
    // 「近期」是同一段；哪天有人改回 30，两个起点会各自跟着变。
    const todayDate = new Date(todayTime);
    const recentDayList = localDayList(todayDate, RECENT_WINDOW_DAYS);
    const last7From = dayKeyToTime(recentDayList[0]);
    const recentTime = last7From;
    const entries = entriesOf(database);
    const buckets = bucketByDay(database);
    const dailyRows = dailyRowsFrom(buckets, localDayList(todayDate, DAILY_ROWS_DAYS));
    const collections = new Set();
    const recentByCollection = new Map();
    const totalByCollection = new Map();
    let savedToday = 0;
    let savedLast7 = 0;
    let firstAt = Infinity;
    for (const entry of entries) {
      const at = numberOr(entry.at, NaN);
      const name = entry.collection || "未分类收藏";
      collections.add(name);
      totalByCollection.set(name, numberOr(totalByCollection.get(name), 0) + 1);
      if (at < firstAt) firstAt = at;
      if (entry.day === today) savedToday += 1;
      if (at >= last7From) savedLast7 += 1;
      if (at >= recentTime) recentByCollection.set(name, numberOr(recentByCollection.get(name), 0) + 1);
    }
    let topCollection = null;
    const pool = recentByCollection.size ? recentByCollection : totalByCollection;
    for (const [name, count] of pool) {
      if (!topCollection || count > topCollection.count) {
        topCollection = { name, count, recent: numberOr(recentByCollection.get(name), 0) };
      }
    }
    const sinceTime = Number.isFinite(firstAt) ? firstAt : numberOr(Date.parse(String((database && database.createdAt) || "")), time);
    const since = localDayKey(sinceTime);
    // 用「本地日之间隔几天」来算，而不是 (todayTime - sinceTime) / DAY_MS：
    // 两个端点各自的 UTC 偏移可能不同，少数时区（Lord Howe 夏令时只挪半小时）
    // 天天累加半小时，攒几天就会少数一天。dayCountBetween 归一化到 UTC 再相减，任何时区都对。
    const days = Math.max(1, numberOr(dayCountBetween(dayStartOf(sinceTime), dayStartOf(time)), NaN) || 1);
    // 陪伴天数：从**插件首次启用**算起（firstSeenAt），不是从最早一条收藏算起。
    // days 那一项仍然是「库里有几天记录」，被统计页的文案和测试钉着，不动它。
    const firstSeenTime = numberOr(
      Date.parse(String((database && database.firstSeenAt) || "")),
      numberOr(Date.parse(String((database && database.createdAt) || "")), time)
    );
    const firstSeen = localDayKey(firstSeenTime);
    const firstSeenDays = Math.max(1, numberOr(dayCountBetween(dayStartOf(firstSeenTime), dayStartOf(time)), NaN) || 1);
    return {
      version: DATABASE_VERSION,
      updatedAt: time,
      videos: entries.length,
      collections: collections.size,
      savedToday,
      savedLast7,
      topCollection,
      savedTotal: Math.max(entries.length, numberOr(database && database.totals && database.totals.savedTotal, 0)),
      firstSeen: { since: firstSeen, days: firstSeenDays },
      days: { since, days },
      pet: normalizePet(database && database.pet, time),
      dailyRows,
      // 按自然周（周一~周日）的全量汇总：31 天 ~ 半年之间的区间按它画。
      // 和 monthly / yearly 一个道理 —— 统计页手里只有快照，拿不到数据库本体，
      // 想按周聚合就只能由这里带出去。只列有记录的周。
      weekly: weeklySeries(database),
      // 按自然月的全量汇总：长区间（> 半年）的柱子按它画。
      // dailyRows 只有最近 180 天，730 天的区间在它上面根本取不到逐日数据，
      // 所以这份月度表必须由这里带出去（和 dailyRows 一个道理：统计页读不到数据库本体）。
      monthly: monthlySeries(database),
      // 年份时间轴。跟着快照走，统计页就不必为了「按年看」再去碰数据库。
      yearly: yearlySeries(database),
      // 收藏夹里最早一条收藏的日期（YYYY-MM-DD），空库是 null。
      // 自定义区间的下界：比这更早的日子在日历上置灰，选也选不动。
      earliest: Number.isFinite(firstAt) ? localDayKey(firstAt) : null
    };
  }

  // 快照里的「按天紧凑表」：最近 DAILY_ROWS_DAYS 天，每天 { day, count, byCollection }，
  // 缺的天补 { day, count: 0, byCollection: {} }。
  //
  // 它必须由 snapshot() 带出去：数据库本体在用户的备份文件夹（FSA）里，
  // 统计页根本读不到，它只有 chrome.storage.local.bcaStats 这一份快照
  // （background.js 的 publishStatsSnapshot 与 library.js 的 syncStatsDatabase 发的就是
  // `Object.assign(snapshot(database), { daily: recentDays(database) })`）。
  // 所以统计页要「任意区间 + 点柱子看当天构成」，这份按天表只能是快照的一部分 ——
  // 放进 snapshot() 之后那两个写入方原样发布即可，一行都不用改。
  //
  // `byCollection` 只写非零项：180 天 × 十几个收藏夹，逐天把每个收藏夹都写一遍
  // 会让键名重复几千次，而这份快照是要 JSON 序列化后进 chrome.storage.local 的
  // （用户设备上还有配额）。空的天写成 {} 也一样能让界面区分「0 条」与「没有这项」。
  function dailyRowsFrom(buckets, dayList) {
    return dayList.map((day) => {
      const bucket = buckets.get(day);
      const byCollection = {};
      if (bucket) {
        for (const [name, count] of bucket.byCollection) {
          if (count > 0) byCollection[name] = count;
        }
      }
      return { day, count: bucket ? bucket.count : 0, byCollection };
    });
  }

  // 最近 days 天的每日柱：从最早到最近，缺的日子补 0（图表要连续）。
  function recentDays(database, days = DAILY_CHART_DAYS, now = Date.now()) {
    const total = Math.max(1, Math.min(120, numberOr(days, DAILY_CHART_DAYS)));
    const time = numberOr(now, Date.now());
    const todayTime = dayKeyToTime(localDayKey(time));
    const buckets = new Map();
    for (const entry of entriesOf(database)) {
      const day = entry.day || localDayKey(entry.at);
      buckets.set(day, numberOr(buckets.get(day), 0) + 1);
    }
    const rows = [];
    for (const day of localDayList(new Date(todayTime), total)) {
      rows.push({ day, count: numberOr(buckets.get(day), 0) });
    }
    return rows;
  }

  // 收藏夹排行榜：总数降序，同数按最近收藏时间降序（近期活跃的排前面）。
  function collectionRows(database, now = Date.now()) {
    const time = numberOr(now, Date.now());
    const todayTime = dayKeyToTime(localDayKey(time));
    // 「近期」起点同样按天走，不用 todayTime - (N-1) * DAY_MS（理由见 localDayList）。
    const recentTime = dayKeyToTime(localDayList(new Date(todayTime), RECENT_WINDOW_DAYS)[0]);
    const rows = new Map();
    for (const entry of entriesOf(database)) {
      const name = entry.collection || "未分类收藏";
      const row = rows.get(name) || { name, videos: 0, recent: 0, lastAt: 0 };
      row.videos += 1;
      if (entry.at >= recentTime) row.recent += 1;
      if (entry.at > row.lastAt) row.lastAt = entry.at;
      rows.set(name, row);
    }
    return Array.from(rows.values()).sort((a, b) => b.videos - a.videos || b.lastAt - a.lastAt || a.name.localeCompare(b.name));
  }

  // 摸一下宠物：加亲密度（每天封顶），并给出这次该说第几句台词。
  // 台词本身不在这里 —— 后台 service worker 里没有 i18n，只回一个下标，界面侧再翻译。
  function touchPet(database, now = Date.now()) {
    const time = numberOr(now, Date.now());
    const today = localDayKey(time);
    const pet = normalizePet(database && database.pet, time);
    if (pet.day !== today) {
      pet.day = today;
      pet.todayTouch = 0;
    }
    pet.totalTouch += 1;
    const capped = pet.todayTouch >= PET_DAILY_TOUCH_LIMIT;
    if (!capped) {
      pet.todayTouch += 1;
      pet.affinity = Math.min(MAX_AFFINITY, pet.affinity + 1);
    }
    if (database && typeof database === "object") {
      database.pet = pet;
      database.updatedAt = new Date(time).toISOString();
    }
    return {
      index: (pet.affinity + pet.totalTouch) % PET_LINE_COUNT,
      affinity: pet.affinity,
      todayTouch: pet.todayTouch,
      totalTouch: pet.totalTouch,
      capped
    };
  }

  const api = {
    DATABASE_FOLDER_NAME,
    DATABASE_FILE_NAME,
    DATABASE_VERSION,
    RECENT_WINDOW_DAYS,
    DAILY_CHART_DAYS,
    DAILY_ROWS_DAYS,
    MAX_RANGE_DAYS,
    PET_LINE_COUNT,
    PET_DAILY_TOUCH_LIMIT,
    // 区间选择：预设表 + 预设 → 毫秒边界。界面按 RANGE_PRESETS 的键渲染下拉框。
    RANGE_PRESETS,
    rangeFor,
    rangeFromDays,
    // 区间聚合：柱状图（seriesInRange）、大数字（totalInRange）、饼图（collectionBreakdown）。
    seriesInRange,
    totalInRange,
    collectionBreakdown,
    yearlySeries,
    // 长区间的聚合：按自然周（周一~周日）与按自然月。
    // monthlySeries 是全量的 —— dailyRows 只有 180 天，长区间拿不到逐日数据，
    // 统计页的「按月聚合」柱子只能靠它（快照里的 monthly 也是它）。
    weeklySeries,
    monthlySeries,
    weekStartOf,
    weekKeyOf,
    monthKeyOf,
    localDayKey,
    dayKeyToTime,
    parseFavoriteTime,
    videoKey,
    emptyDatabase,
    normalizeDatabase,
    addRecord,
    recordFromVideo,
    databaseFromVideos,
    needsRebuild,
    snapshot,
    recentDays,
    collectionRows,
    touchPet
  };

  global.BcaStatsCore = api;

  // 与 archive-core.js 一样，末尾留一个 CommonJS 出口：
  // test/stats-core.test.cjs 才能 require 进来真的调用这些函数。
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
