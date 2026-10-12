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
  const RECENT_WINDOW_DAYS = 30;
  // 数据统计页的默认柱状图天数。
  const DAILY_CHART_DAYS = 14;
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
      updatedAt: new Date(time).toISOString(),
      videos: {},
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
      database.pet = previous.pet;
    }
    for (const video of videos || []) addRecord(database, recordFromVideo(video, now), now);
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

  // 界面与宠物要的那一小包数字。所有字段都是现算的，没有缓存。
  function snapshot(database, now = Date.now()) {
    const time = numberOr(now, Date.now());
    const today = localDayKey(time);
    const todayTime = dayKeyToTime(today);
    const last7Time = todayTime - 6 * DAY_MS;
    const recentTime = todayTime - (RECENT_WINDOW_DAYS - 1) * DAY_MS;
    const entries = entriesOf(database);
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
      if (at >= last7Time) savedLast7 += 1;
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
    const sinceDayTime = dayKeyToTime(since);
    const days = Number.isFinite(sinceDayTime) ? Math.max(1, Math.floor((todayTime - sinceDayTime) / DAY_MS) + 1) : 1;
    return {
      version: DATABASE_VERSION,
      updatedAt: time,
      videos: entries.length,
      collections: collections.size,
      savedToday,
      savedLast7,
      topCollection,
      days: { since, days },
      pet: normalizePet(database && database.pet, time)
    };
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
    for (let offset = total - 1; offset >= 0; offset -= 1) {
      const day = localDayKey(todayTime - offset * DAY_MS);
      rows.push({ day, count: numberOr(buckets.get(day), 0) });
    }
    return rows;
  }

  // 收藏夹排行榜：总数降序，同数按最近收藏时间降序（近期活跃的排前面）。
  function collectionRows(database, now = Date.now()) {
    const time = numberOr(now, Date.now());
    const todayTime = dayKeyToTime(localDayKey(time));
    const recentTime = todayTime - (RECENT_WINDOW_DAYS - 1) * DAY_MS;
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
    PET_LINE_COUNT,
    PET_DAILY_TOUCH_LIMIT,
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
