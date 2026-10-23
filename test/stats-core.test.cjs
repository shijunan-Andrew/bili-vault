"use strict";
/*
  stats-core.js 的**真执行**单元测试（1.5.0 的本地数据库）。

  与 test/stability.test.cjs 的分工和 archive-core 那套一样：
    那个是「读文件 + 正则匹配」，证明源码里有没有这行字；
    这个把 stats-core.js require 进来真的调用，证明喂它输入、它吐什么。

  运行：node test/stats-core.test.cjs
*/

const assert = require("node:assert");
const core = require("../stats-core.js");

const isMain = require.main === module;

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed += 1;
    if (isMain) process.stdout.write(".");
  } catch (error) {
    failed += 1;
    failures.push({ name, error });
    if (isMain) process.stdout.write("x");
  }
}

// 固定一个「现在」：2026-10-12 14:00（本地时间）。测试要跨天判断，绝不能用真实的 Date.now()。
const NOW = new Date(2026, 9, 12, 14, 0, 0).getTime();
const DAY = 24 * 60 * 60 * 1000;

function at(year, month, day, hour = 12, minute = 0) {
  return new Date(year, month - 1, day, hour, minute, 0).getTime();
}

function video(overrides = {}) {
  return Object.assign(
    {
      collection: "哆啦a梦",
      title: "【哆啦A梦】童年版（1-100）",
      bvid: "BV1Z9c7zAEbj",
      aid: "av1754496003",
      date: "2026年10月12日09时30分00秒"
    },
    overrides
  );
}

/* ───────────────────────── 时间解析 ─────────────────────────
   归档里的时间是中文格式，解析错了整张图表的日期都会错位。 */

test("parseFavoriteTime 认 视频信息.txt 的原样格式", () => {
  assert.equal(core.parseFavoriteTime("2025年06月13日00时15分40秒.000"), at(2025, 6, 13, 0, 15) + 40000);
  assert.equal(core.parseFavoriteTime("2026年10月12日01时45分29秒"), at(2026, 10, 12, 1, 45) + 29000);
});

test("parseFavoriteTime 认年月日与时分秒之间有空格、以及没有时分秒的目录名", () => {
  assert.equal(core.parseFavoriteTime("2026年10月12日 01时45分29秒"), at(2026, 10, 12, 1, 45) + 29000);
  assert.equal(core.parseFavoriteTime("2026年10月12日"), at(2026, 10, 12, 0, 0));
});

test("parseFavoriteTime 认不出就返回 NaN，不瞎猜", () => {
  assert.ok(Number.isNaN(core.parseFavoriteTime("")));
  assert.ok(Number.isNaN(core.parseFavoriteTime("未知")));
  assert.ok(Number.isNaN(core.parseFavoriteTime("2026/10/12")));
  assert.ok(Number.isNaN(core.parseFavoriteTime(null)));
});

test("parseFavoriteTime 顺手认 ISO 形状（备份/导入配置里可能出现）", () => {
  assert.equal(core.parseFavoriteTime("2026-10-12 01:45:29"), at(2026, 10, 12, 1, 45) + 29000);
});

test("localDayKey 用本地时间分天，dayKeyToTime 是它的逆运算", () => {
  assert.equal(core.localDayKey(NOW), "2026-10-12");
  assert.equal(core.localDayKey(at(2026, 1, 1, 0, 0)), "2026-01-01");
  assert.equal(core.dayKeyToTime("2026-10-12"), at(2026, 10, 12, 0, 0));
  assert.ok(Number.isNaN(core.dayKeyToTime("2026-10")));
  assert.ok(Number.isNaN(core.dayKeyToTime("")));
});

/* ───────────────────────── 记录身份 ─────────────────────────
   重复导入不能把同一条视频算两次。 */

test("videoKey 优先 BV 号，其次 av 号，都没有才用标题兜底", () => {
  assert.equal(core.videoKey({ bvid: "BV1Z9c7zAEbj" }), "bvid:BV1Z9c7zAEbj");
  assert.equal(core.videoKey({ aid: "av1754496003" }), "aid:1754496003");
  assert.equal(core.videoKey({ aid: "1754496003" }), "aid:1754496003");
  assert.equal(core.videoKey({ collection: "蜡笔小新", title: "某视频" }), "title:蜡笔小新\u0000某视频");
});

test("videoKey 非法 BV 号不当身份用，空标题返回空串", () => {
  assert.equal(core.videoKey({ bvid: "BV123", title: "x", collection: "c" }), "title:c\u0000x");
  assert.equal(core.videoKey({}), "");
});

/* ─────────────────── 1.8.24（P3-13）：schema 版本与迁移 ─────────────────── */

test("migrateDatabase 把没有 schemaVersion 的老库抬到 v1", () => {
  const legacy = { version: 1, videos: {}, totals: { savedTotal: 0 } };
  const migrated = core.migrateDatabase(legacy, NOW);
  assert.equal(migrated.schemaVersion, core.DATABASE_SCHEMA_VERSION);
  assert.equal(migrated.version, 1);
  assert.equal(legacy.schemaVersion, undefined, "不能原地改调用方传进来的对象");
});

test("migrateDatabase 对垃圾输入与未来版本返回 null", () => {
  assert.equal(core.migrateDatabase(null, NOW), null);
  assert.equal(core.migrateDatabase("nope", NOW), null);
  assert.equal(core.migrateDatabase({ schemaVersion: 99 }, NOW), null);
  assert.equal(core.migrateDatabase({ version: 2 }, NOW), null);
});

test("normalizeDatabase 保留 schemaVersion，老库补成当前版本", () => {
  assert.equal(core.normalizeDatabase({}, NOW).schemaVersion, core.DATABASE_SCHEMA_VERSION);
  assert.equal(core.normalizeDatabase({ schemaVersion: 1 }, NOW).schemaVersion, 1);
  assert.equal(core.normalizeDatabase(null, NOW).schemaVersion, core.DATABASE_SCHEMA_VERSION);
});

/* ───────────────────────── 数据库增删 ───────────────────────── */

test("emptyDatabase 的形状固定", () => {
  const database = core.emptyDatabase(NOW);
  assert.equal(database.version, core.DATABASE_VERSION);
  assert.equal(database.schemaVersion, core.DATABASE_SCHEMA_VERSION);
  assert.deepEqual(database.videos, {});
  assert.deepEqual(database.pet, { affinity: 0, day: "2026-10-12", todayTouch: 0, totalTouch: 0 });
  assert.equal(new Date(database.createdAt).getTime(), NOW);
});

test("addRecord 加一条，字段按归档里的原样留住", () => {
  const database = core.emptyDatabase(NOW);
  core.addRecord(database, core.recordFromVideo(video(), NOW), NOW);
  const entry = database.videos["bvid:BV1Z9c7zAEbj"];
  assert.ok(entry);
  assert.equal(entry.collection, "哆啦a梦");
  assert.equal(entry.title, "【哆啦A梦】童年版（1-100）");
  assert.equal(entry.day, "2026-10-12");
  assert.equal(entry.at, at(2026, 10, 12, 9, 30));
});

test("addRecord 同一条视频再来一次不新增行，保留最早的收藏时间", () => {
  const database = core.emptyDatabase(NOW);
  core.addRecord(database, core.recordFromVideo(video(), NOW), NOW);
  core.addRecord(
    database,
    core.recordFromVideo(video({ date: "2026年10月20日08时00分00秒", collection: "dds" }), NOW),
    NOW
  );
  assert.equal(Object.keys(database.videos).length, 1);
  const entry = database.videos["bvid:BV1Z9c7zAEbj"];
  // 收藏时间取更早的那次；收藏夹跟着最新走（「移到另一个收藏夹」之后排行榜要反映新位置）
  assert.equal(entry.at, at(2026, 10, 12, 9, 30));
  assert.equal(entry.collection, "dds");
});

test("recordFromVideo 用「视频收藏时间」分天，目录名只在时间缺失时兜底（1.9.2）", () => {
  /* 搬运/补档、或者重新收藏一条早就归档过的视频时，目录名沿用旧的时间戳，
     而卡片上显示的是 视频信息.txt 里的「视频收藏时间」。统计分天必须跟卡片一致，
     否则「今日新增」会比用户看到的少（1.9.2 修的就是这个）。 */
  const scanVideo = {
    collection: "默认收藏夹",
    title: "搬运回来的老视频",
    bvid: "BV1aa411c7m1",
    directory: "2026年10月08日21时15分00秒",
    favoriteAt: "2026年10月12日09时30分00秒"
  };
  const record = core.recordFromVideo(scanVideo, NOW);
  assert.equal(record.at, at(2026, 10, 12, 9, 30), "要按收藏时间分天，不能按目录名");
  assert.equal(core.localDayKey(record.at), "2026-10-12");

  const unknownFavorite = core.recordFromVideo({ ...scanVideo, favoriteAt: "未知" }, NOW);
  assert.equal(unknownFavorite.at, at(2026, 10, 8, 21, 15), "收藏时间认不出来时退回目录名");

  const explicitDate = core.recordFromVideo(
    { ...scanVideo, date: "2026年09月30日08时00分00秒", favoriteAt: "2026年10月12日09时30分00秒" },
    NOW
  );
  assert.equal(explicitDate.at, at(2026, 9, 30, 8, 0), "老调用方显式给的 date 仍然优先");
});
test("addRecord 没有时间就用 now，不会写出 NaN", () => {
  const database = core.emptyDatabase(NOW);
  core.addRecord(database, { bvid: "BV1Z9c7zAEbj", title: "x", collection: "c" }, NOW);
  const entry = database.videos["bvid:BV1Z9c7zAEbj"];
  assert.equal(entry.at, NOW);
  assert.equal(entry.day, "2026-10-12");
});

test("addRecord 不认识的记录直接忽略", () => {
  const database = core.emptyDatabase(NOW);
  core.addRecord(database, {}, NOW);
  core.addRecord(database, null, NOW);
  assert.equal(Object.keys(database.videos).length, 0);
});

test("databaseFromVideos 用一次扫描重建，并且保留宠物与出生时间", () => {
  const previous = core.emptyDatabase(at(2026, 10, 1, 10, 0));
  previous.pet = { affinity: 42, day: "2026-10-11", todayTouch: 3, totalTouch: 50 };
  const database = core.databaseFromVideos(
    [
      video(),
      video({ bvid: "BV1AAAAAAAAA", title: "另一个", date: "2026年10月11日10时00分00秒" }),
      video({ bvid: "BV1BBBBBBBBB", title: "第三个", collection: "dds", date: "2026年09月01日10时00分00秒" })
    ],
    { now: NOW, previous }
  );
  assert.equal(Object.keys(database.videos).length, 3);
  assert.equal(database.pet.affinity, 42);
  assert.equal(new Date(database.createdAt).getTime(), at(2026, 10, 1, 10, 0));
});

test("needsRebuild 只在条数不够时说要重建", () => {
  const database = core.databaseFromVideos([video(), video({ bvid: "BV1AAAAAAAAA" })], { now: NOW });
  assert.equal(core.needsRebuild(database, 2), false);
  assert.equal(core.needsRebuild(database, 1), false);
  assert.equal(core.needsRebuild(database, 5), true);
  assert.equal(core.needsRebuild(core.emptyDatabase(NOW), 1), true);
  assert.equal(core.needsRebuild(core.emptyDatabase(NOW), 0), false);
});

/* ───────────────────────── 统计口径 ─────────────────────────
   这几个数字会直接显示给用户看，也算错了最容易发现。 */

function sampleDatabase() {
  return core.databaseFromVideos(
    [
      video({ date: "2026年10月12日09时30分00秒" }), // 今天
      video({ bvid: "BV1AAAAAAAAA", date: "2026年10月12日08时00分00秒" }), // 今天
      video({ bvid: "BV1BBBBBBBBB", date: "2026年10月10日10时00分00秒" }), // 近 7 天
      video({ bvid: "BV1CCCCCCCCC", date: "2026年10月01日10时00分00秒", collection: "蜡笔小新" }), // last30 区间内、近 7 天窗口外
      video({ bvid: "BV1DDDDDDDDD", date: "2026年03月01日10时00分00秒", collection: "dds" }) // 很久以前
    ],
    { now: NOW }
  );
}

// 专门喂给区间 API 的库：跨了 10 月 / 9 月 / 8 月 / 1 月与 2025 年，
// 这样「今天 / 昨天 / 近 7 天 / 近 30 天 / 本月 / 上个月」六个区间预设的边界都能真的被走到。
// （这是区间预设 last7 / last30，与排行榜的「近期」窗口是两回事 —— 后者看 RECENT_WINDOW_DAYS，现在是 7。）
// 10-13 那条是**未来日期**（本地的明天）—— 数据库里本来不该有，用来证明区间右边界是闭的：
// 今天区间的 to 是 23:59:59.999，明天那条不该被算进来。
function rangeDatabase() {
  return core.databaseFromVideos(
    [
      video({ date: "2026年10月12日09时30分00秒", collection: "哆啦a梦" }), // 今天
      video({ bvid: "BV1AAAAAAAAA", date: "2026年10月12日08时00分00秒", collection: "蜡笔小新" }), // 今天
      video({ bvid: "BV1BBBBBBBBB", date: "2026年10月11日10时00分00秒", collection: "哆啦a梦" }), // 昨天
      video({ bvid: "BV1CCCCCCCCC", date: "2026年10月01日10时00分00秒", collection: "蜡笔小新" }), // last30 区间内、本月
      video({ bvid: "BV1DDDDDDDDD", date: "2026年09月30日23时59分59秒", collection: "dds" }), // 上个月最后一天
      video({ bvid: "BV1EEEEEEEEE", date: "2026年09月15日10时00分00秒", collection: "dds" }), // 上个月
      video({ bvid: "BV1FFFFFFFFFF", date: "2026年08月05日10时00分00秒", collection: "dds" }), // 更早
      video({ bvid: "BV1GGGGGGGGG", date: "2026年01月01日10时00分00秒", collection: "dds" }), // 今年
      video({ bvid: "BV1HHHHHHHHH", date: "2025年12月31日10时00分00秒", collection: "哆啦a梦" }), // 去年
      video({ bvid: "BV1IIIIIIIII", date: "2026年10月13日08时00分00秒", collection: "哆啦a梦" }) // 明天（不该落进今天）
    ],
    { now: NOW }
  );
}

test("RANGE_PRESETS 七个预设齐全，label 都是中文", () => {
  assert.deepEqual(Object.keys(core.RANGE_PRESETS), ["today", "yesterday", "last7", "last30", "thisMonth", "lastMonth", "custom"]);
  for (const label of Object.values(core.RANGE_PRESETS)) {
    assert.ok(typeof label === "string" && label.length > 0);
    assert.ok(/[\u4e00-\u9fa5]/.test(label), `label 该是中文：${label}`);
  }
});

test("rangeFor 的 today / yesterday 是一整天的闭区间（明天那条不算进今天）", () => {
  const today = core.rangeFor("today", NOW);
  assert.equal(today.preset, "today");
  assert.equal(today.from, at(2026, 10, 12, 0, 0));
  assert.equal(today.to, at(2026, 10, 12, 23, 59) + 59999);
  assert.equal(today.days, 1);
  assert.equal(today.label, "今天");
  // 闭区间：23:59:59.999 那一刻的收藏算今天，明天 08:00 不算
  assert.equal(core.totalInRange(rangeDatabase(), today), 2);

  const yesterday = core.rangeFor("yesterday", NOW);
  assert.equal(yesterday.from, at(2026, 10, 11, 0, 0));
  assert.equal(yesterday.to, at(2026, 10, 11, 23, 59) + 59999);
  assert.equal(yesterday.days, 1);
  assert.equal(core.totalInRange(rangeDatabase(), yesterday), 1);
  // 今天 00:00 减 1 毫秒 = 昨天 23:59:59.999，两段严丝合缝、不重叠
  assert.equal(yesterday.to + 1, today.from);
});

test("rangeFor 的 last7 / last30 含今天、长度分别 7 与 30 天", () => {
  const last7 = core.rangeFor("last7", NOW);
  assert.equal(last7.preset, "last7");
  assert.equal(last7.days, 7);
  assert.equal(last7.from, at(2026, 10, 6, 0, 0));
  assert.equal(last7.to, at(2026, 10, 12, 23, 59) + 59999);
  assert.equal(last7.label, "近 7 天");
  assert.equal(core.seriesInRange(rangeDatabase(), last7).length, 7);
  // 10-06 起：10-12 两条 + 10-11 一条 + 10-01 那条在窗口外
  assert.equal(core.totalInRange(rangeDatabase(), last7), 3);

  const last30 = core.rangeFor("last30", NOW);
  assert.equal(last30.preset, "last30");
  assert.equal(last30.days, 30);
  assert.equal(last30.from, at(2026, 9, 13, 0, 0));
  assert.equal(last30.label, "近 30 天");
  assert.equal(core.seriesInRange(rangeDatabase(), last30).length, 30);
  // 09-13 起：10-12×2 + 10-11 + 10-01 + 09-30 + 09-15 = 6（08-05 那条出界）
  assert.equal(core.totalInRange(rangeDatabase(), last30), 6);
});

test("rangeFor 的 thisMonth 从 1 号算到今天，不把本月的未来算进来", () => {
  const range = core.rangeFor("thisMonth", NOW);
  assert.equal(range.preset, "thisMonth");
  assert.equal(range.from, at(2026, 10, 1, 0, 0));
  assert.equal(range.to, at(2026, 10, 12, 23, 59) + 59999);
  assert.equal(range.days, 12);
  assert.equal(range.label, "本月");
  assert.equal(core.totalInRange(rangeDatabase(), range), 4); // 10-12×2 + 10-11 + 10-01
});

test("rangeFor 的 lastMonth 是整月，跨年与 2 月这种短月都对", () => {
  const range = core.rangeFor("lastMonth", NOW);
  assert.equal(range.preset, "lastMonth");
  assert.equal(range.from, at(2026, 9, 1, 0, 0));
  assert.equal(range.to, at(2026, 9, 30, 23, 59) + 59999);
  assert.equal(range.days, 30);
  assert.equal(range.label, "上个月");
  assert.equal(core.totalInRange(rangeDatabase(), range), 2); // 09-30 + 09-15

  // 1 月的「上个月」要退到去年 12 月
  const january = core.rangeFor("lastMonth", at(2027, 1, 15, 10, 0));
  assert.equal(january.from, at(2026, 12, 1, 0, 0));
  assert.equal(january.to, at(2026, 12, 31, 23, 59) + 59999);
  assert.equal(january.days, 31);

  // 3 月的「上个月」是 2 月，天数要跟着闰年走
  const leap = core.rangeFor("lastMonth", at(2024, 3, 10, 10, 0));
  assert.equal(leap.days, 29); // 2024 是闰年
  const common = core.rangeFor("lastMonth", at(2025, 3, 10, 10, 0));
  assert.equal(common.days, 28);
});

test("rangeFor 的 custom 自动归一成整日，坏输入返回 null 而不是抛", () => {
  // 给两个「半天」的时间点：from 该落到当天 00:00，to 该升到当天 23:59:59.999
  const range = core.rangeFor("custom", NOW, { from: at(2026, 10, 1, 15, 30), to: at(2026, 10, 3, 6, 0) });
  assert.equal(range.preset, "custom");
  assert.equal(range.from, at(2026, 10, 1, 0, 0));
  assert.equal(range.to, at(2026, 10, 3, 23, 59) + 59999);
  assert.equal(range.days, 3);
  assert.equal(range.label, "自定义");

  // 同一天给两次也至少是 1 天，不会变成 0
  assert.equal(core.rangeFor("custom", NOW, { from: at(2026, 10, 1, 15, 0), to: at(2026, 10, 1, 16, 0) }).days, 1);

  assert.equal(core.rangeFor("custom", NOW, { from: at(2026, 10, 3, 0, 0), to: at(2026, 10, 1, 0, 0) }), null, "反向区间该是 null");
  assert.equal(core.rangeFor("custom", NOW, {}), null);
  assert.equal(core.rangeFor("custom", NOW, { from: "x", to: "y" }), null);
  assert.equal(core.rangeFor("custom", NOW, null), null);
  // 天数超过上限时夹住 from，但右端仍然停在结束日
  const huge = core.rangeFor("custom", NOW, { from: at(2016, 1, 1, 0, 0), to: at(2026, 10, 12, 0, 0) });
  assert.ok(huge);
  assert.equal(huge.days, core.MAX_RANGE_DAYS);
  assert.equal(huge.to, at(2026, 10, 12, 23, 59) + 59999);
  // 不认识的预设名退回 custom 的语义（拿 custom 参数算），而不是抛
  assert.equal(core.rangeFor("nope", NOW, { from: at(2026, 10, 1, 0, 0), to: at(2026, 10, 2, 0, 0) }).preset, "custom");
});

test("rangeFor 的 custom 也认「2026-03-28」这种日键（日历交上来的就是日键）", () => {
  /* 统计页的日历格子挂的是 YYYY-MM-DD，确定时把这两个日键原样交给 rangeFor。
     早先 timeOr 只认 Number()，Number("2026-03-28") 是 NaN → 整个区间变成 null →
     统计页退回「近 7 天」，用户看到的就是「自定义区间点了确定没反应」。
     这一条钉住「日键也能算」。 */
  const range = core.rangeFor("custom", NOW, { from: "2026-03-28", to: "2026-10-14" });
  assert.ok(range, "日键形状的 custom 不能是 null");
  assert.equal(range.from, at(2026, 3, 28, 0, 0));
  assert.equal(range.to, at(2026, 10, 14, 23, 59) + 59999);
  assert.equal(range.days, 201);
  assert.equal(range.preset, "custom");
  // 同一天的日键至少 1 天
  assert.equal(core.rangeFor("custom", NOW, { from: "2026-10-14", to: "2026-10-14" }).days, 1);
  // 日键与毫秒混着给也行
  assert.equal(core.rangeFor("custom", NOW, { from: "2026-10-01", to: at(2026, 10, 3, 6, 0) }).days, 3);
  // 形状不对的字符串照旧是坏输入，不许瞎猜（2026/03/28 不是日键）
  assert.equal(core.rangeFor("custom", NOW, { from: "2026/03/28", to: "2026/10/14" }), null);
  assert.equal(core.rangeFor("custom", NOW, { from: "2026-3-8", to: "2026-10-14" }), null);
  assert.equal(core.rangeFor("custom", NOW, { from: "", to: "" }), null);
  // 日键区间也能直接喂给区间 API（内部同样走 timeOr）
  assert.equal(core.totalInRange(rangeDatabase(), range), 8);
});

test("rangeFromDays 是 rangeFor 的等价小助手，天数被夹在 1 ~ MAX_RANGE_DAYS", () => {
  const last7 = core.rangeFromDays(7, NOW);
  assert.equal(last7.from, core.rangeFor("last7", NOW).from);
  assert.equal(last7.to, core.rangeFor("last7", NOW).to);
  assert.equal(core.rangeFromDays(1, NOW).days, 1);
  assert.equal(core.rangeFromDays(0, NOW).days, 1);
  assert.equal(core.rangeFromDays(-5, NOW).days, 1);
  assert.equal(core.rangeFromDays("x", NOW).days, 1);
  assert.equal(core.rangeFromDays(99999, NOW).days, core.MAX_RANGE_DAYS);
});

test("seriesInRange 每天都出现、缺的日子补 0、按时间升序", () => {
  const rows = core.seriesInRange(rangeDatabase(), core.rangeFor("last7", NOW));
  assert.equal(rows.length, 7);
  assert.deepEqual(rows.map((row) => row.day), [
    "2026-10-06",
    "2026-10-07",
    "2026-10-08",
    "2026-10-09",
    "2026-10-10",
    "2026-10-11",
    "2026-10-12"
  ]);
  assert.deepEqual(rows.map((row) => row.count), [0, 0, 0, 0, 0, 1, 2]);
  assert.equal(rows.reduce((sum, row) => sum + row.count, 0), core.totalInRange(rangeDatabase(), core.rangeFor("last7", NOW)));
});

test("seriesInRange 只认 range.from ~ range.to 之间，两端都含", () => {
  const database = core.databaseFromVideos(
    [
      video({ bvid: "BV1AAAAAAAAA", date: "2026年10月10日00时00分00秒" }),
      video({ bvid: "BV1BBBBBBBBB", date: "2026年10月11日23时59分59秒" }),
      video({ bvid: "BV1CCCCCCCCC", date: "2026年10月12日00时00分00秒" })
    ],
    { now: NOW }
  );
  // 手工造一个 [10-10 00:00, 10-11 23:59:59.999] 的区间：边界上那两条都要算进来
  const rows = core.seriesInRange(database, {
    from: at(2026, 10, 10, 0, 0),
    to: at(2026, 10, 11, 23, 59) + 59999
  });
  assert.deepEqual(rows, [
    { day: "2026-10-10", count: 1 },
    { day: "2026-10-11", count: 1 }
  ]);
  assert.equal(core.totalInRange(database, { from: at(2026, 10, 10, 0, 0), to: at(2026, 10, 11, 23, 59) + 59999 }), 2);
});

test("collectionBreakdown 按 count 降序、同数按中文名排序、零条的不出现", () => {
  const breakdown = core.collectionBreakdown(rangeDatabase(), core.rangeFor("thisMonth", NOW));
  assert.deepEqual(breakdown, [
    { name: "哆啦a梦", count: 2 },
    { name: "蜡笔小新", count: 2 },
    { name: "dds", count: 0 }
  ].filter((row) => row.count > 0));
  // 同数（都是 2）时按 zh-CN 排：哆啦a梦 在 蜡笔小新 前面
  assert.deepEqual(breakdown.map((row) => row.name), ["哆啦a梦", "蜡笔小新"]);
  assert.ok(!breakdown.some((row) => row.count === 0), "count 为 0 的收藏夹不该出现在饼图里");

  // dds 在这个区间里一条都没有（09-30 / 09-15 都在本月之外）→ 整条不出现
  assert.ok(!breakdown.some((row) => row.name === "dds"));
  const wide = core.collectionBreakdown(rangeDatabase(), core.rangeFor("lastMonth", NOW));
  assert.deepEqual(wide.map((row) => row.name), ["dds"]);
  assert.equal(wide[0].count, 2);

  // 区间里一条都没有 → 空数组（界面画空饼图，而不是画一堆 0）
  assert.deepEqual(core.collectionBreakdown(rangeDatabase(), core.rangeFor("custom", NOW, { from: at(2000, 1, 1, 0, 0), to: at(2000, 1, 2, 0, 0) })), []);
});

test("collectionBreakdown 把缺收藏夹的条目归到「未分类收藏」", () => {
  const database = core.databaseFromVideos(
    [video({ bvid: "BV1AAAAAAAAA", collection: "", date: "2026年10月12日10时00分00秒" })],
    { now: NOW }
  );
  const breakdown = core.collectionBreakdown(database, core.rangeFor("today", NOW));
  assert.deepEqual(breakdown, [{ name: "未分类收藏", count: 1 }]);
});

test("yearlySeries 按年升序、只列有记录的年份", () => {
  const rows = core.yearlySeries(rangeDatabase());
  assert.deepEqual(rows.map((row) => ({ year: row.year, count: row.count })), [
    { year: 2025, count: 1 },
    { year: 2026, count: 9 }
  ]);
  // 1.6.4：每年都要带 byCollection —— 统计页点年份柱子要画「那一年的收藏夹构成」，
  // 只给 count 的话饼图是空的（真机上就是这么发现的：柱子有数、饼图说没有收藏）。
  for (const row of rows) {
    const sum = Object.values(row.byCollection || {}).reduce((total, value) => total + value, 0);
    assert.equal(sum, row.count, `${row.year} 年的收藏夹构成之和应等于该年总数`);
  }
  // 2024 一条都没有 → 那年整年不出现（时间轴上不留空年份）
  assert.ok(!rows.some((row) => row.year === 2024));
  for (let i = 1; i < rows.length; i += 1) assert.ok(rows[i].year > rows[i - 1].year);
});

test("snapshot 带上 dailyRows：覆盖 DAILY_ROWS_DAYS 天、升序、缺天补 0", () => {
  const snapshot = core.snapshot(rangeDatabase(), NOW);
  assert.equal(core.DAILY_ROWS_DAYS, 180);
  assert.equal(snapshot.dailyRows.length, core.DAILY_ROWS_DAYS);
  assert.equal(snapshot.dailyRows[snapshot.dailyRows.length - 1].day, "2026-10-12"); // 最后一行是今天
  // 第一行 = 179 天前。用日历构造算这个期望值，不能用 at(2026,10,12) - 179 * DAY：
  // 在澳大利亚 Lord Howe（UTC+10:30，夏令时只挪半小时）这种地方，
  // 从午夜减固定毫秒数会掉到前一天，期望值自己就先错了。
  const firstDay = new Date(at(2026, 10, 12, 0, 0));
  const expectedFirst = core.localDayKey(
    new Date(firstDay.getFullYear(), firstDay.getMonth(), firstDay.getDate() - (core.DAILY_ROWS_DAYS - 1)).getTime()
  );
  assert.equal(snapshot.dailyRows[0].day, expectedFirst);
  assert.equal(snapshot.dailyRows[0].day, "2026-04-16"); // 本机是 UTC+8 时的具体值，顺便钉一下
  for (let i = 1; i < snapshot.dailyRows.length; i += 1) {
    assert.ok(snapshot.dailyRows[i].day > snapshot.dailyRows[i - 1].day, "dailyRows 必须按天升序");
  }
  const todayRow = snapshot.dailyRows[snapshot.dailyRows.length - 1];
  assert.deepEqual(todayRow, { day: "2026-10-12", count: 2, byCollection: { 哆啦a梦: 1, 蜡笔小新: 1 } });
  // 明天那条（10-13）在窗口外；窗口外的条目一条都不该混进来
  assert.ok(!snapshot.dailyRows.some((row) => row.day === "2026-10-13"));
  // 180 天 × 0 条的那么多天里，抽查两天确认补的是干净的 0
  const empty = snapshot.dailyRows.find((row) => row.day === "2026-07-01");
  assert.deepEqual(empty, { day: "2026-07-01", count: 0, byCollection: {} });
});

test("dailyRows 的 byCollection 只写非零项，且 count 等于各项之和", () => {
  const snapshot = core.snapshot(rangeDatabase(), NOW);
  const rows = snapshot.dailyRows.filter((row) => row.count > 0);
  assert.deepEqual(rows.map((row) => row.day), [
    "2026-08-05",
    "2026-09-15",
    "2026-09-30",
    "2026-10-01",
    "2026-10-11",
    "2026-10-12"
  ]);
  for (const row of snapshot.dailyRows) {
    const parts = Object.values(row.byCollection);
    assert.equal(parts.reduce((sum, count) => sum + count, 0), row.count, `${row.day} 的分项之和该等于 count`);
    for (const count of parts) assert.ok(count > 0, `${row.day} 的 byCollection 不该出现 0 值项`);
  }
  // 空天的 byCollection 是 {}：界面据此区分「那天 0 条」而不是「那天没算」
  const emptyRow = snapshot.dailyRows.find((row) => row.day === "2026-07-01");
  assert.equal(Object.keys(emptyRow.byCollection).length, 0);
});

test("snapshot 连着 yearly: yearlySeries(database)", () => {
  const snapshot = core.snapshot(rangeDatabase(), NOW);
  assert.deepEqual(snapshot.yearly, core.yearlySeries(rangeDatabase()));
  assert.deepEqual(snapshot.yearly.map((row) => ({ year: row.year, count: row.count })), [
    { year: 2025, count: 1 },
    { year: 2026, count: 9 }
  ]);
  assert.deepEqual(core.snapshot(core.emptyDatabase(NOW), NOW).yearly, []);
  assert.equal(core.snapshot(core.emptyDatabase(NOW), NOW).dailyRows.length, core.DAILY_ROWS_DAYS);
});

/* ───────────────────────── 长区间的聚合（1.6.1） ─────────────────────────
   自定义区间超过 31 天按自然周（周一~周日）画柱子、超过半年按自然月画。
   dailyRows 只有 180 天，所以月度那份必须是全量的 —— 这四条钉住这两件事。 */

test("weekStartOf / weekKeyOf 对齐到周一（周日属于上一周，跨月也认）", () => {
  // 2026-08-05 是星期三 → 那一周的周一是 08-03
  assert.equal(core.weekStartOf(at(2026, 8, 5, 10, 0)), core.dayKeyToTime("2026-08-03"));
  assert.equal(core.weekKeyOf(at(2026, 8, 5, 10, 0)), "2026-08-03");
  // 周一自己就是周一
  assert.equal(core.weekKeyOf(at(2026, 8, 3, 0, 0)), "2026-08-03");
  // 星期日算在它前面那个周一那一周里，不能跳到下一周
  assert.equal(core.weekKeyOf(at(2026, 8, 9, 23, 30)), "2026-08-03");
  // 跨月：2026-10-01 是星期四 → 周一是 09-28
  assert.equal(core.weekKeyOf(at(2026, 10, 1, 10, 0)), "2026-09-28");
  // 跨年：2026-01-01 是星期四 → 周一是 2025-12-29
  assert.equal(core.weekKeyOf(at(2026, 1, 1, 10, 0)), "2025-12-29");
  // 坏输入不抛
  assert.ok(Number.isNaN(core.weekStartOf(NaN)));
  assert.equal(core.weekKeyOf("坏时间"), "");
});

test("weekStartOf 用日历回退而不是减毫秒（夏令时那天不能落到前一天）", () => {
  // 每天都该落在当天 00:00：本机是 UTC+8 时 08-05 的周日那一格会是 08-03 00:00。
  // 用 at(...) - 2 * DAY 去减的话，在夏令时切换那天会得到前一天的 23:00。
  const monday = core.weekStartOf(at(2026, 8, 5, 10, 0));
  const date = new Date(monday);
  assert.equal(date.getHours(), 0);
  assert.equal(date.getMinutes(), 0);
  assert.equal(core.localDayKey(monday), "2026-08-03");
});

test("weeklySeries 按自然周聚合、只列有记录的周、升序", () => {
  const rows = core.weeklySeries(rangeDatabase());
  assert.deepEqual(rows.map((row) => row.week), [
    "2025-12-29",   // 2025-12-31（周三）
    "2026-08-03",   // 2026-08-05（周三）
    "2026-09-14",   // 2026-09-15（周二）
    "2026-09-28",   // 2026-09-30（周三）
    "2026-10-05",   // 2026-10-01（周四）
    "2026-10-12"    // 10-11（周日）/ 10-12（周一）/ 10-13（周二）都落在这一周
  ]);
  for (let i = 1; i < rows.length; i += 1) {
    assert.ok(rows[i].week > rows[i - 1].week, "weeklySeries 必须按周升序");
  }
  // 「周一~周日」是同一桶：10-11（周日）与 10-12（周一）分属两周，
  // 但 10-12 和 10-13 要落在一起
  const week = rows.find((row) => row.week === "2026-10-12");
  assert.equal(week.count, 3);
  // 每一桶的 count 必须等于它 byCollection 各项之和，且不出现 0 值项
  for (const row of rows) {
    const parts = Object.values(row.byCollection);
    assert.equal(parts.reduce((sum, count) => sum + count, 0), row.count, `${row.week} 的分项之和该等于 count`);
    for (const count of parts) assert.ok(count > 0, `${row.week} 的 byCollection 不该出现 0 值项`);
  }
  // 空库：一根柱子都没有（不编空周）
  assert.deepEqual(core.weeklySeries(core.emptyDatabase(NOW)), []);
  // 坏输入不抛
  assert.deepEqual(core.weeklySeries(null), []);
});

test("monthlySeries 是全量的：180 天窗口外的月份也要算进来", () => {
  // rangeDatabase 里有 2025-12-31 与 2026-01-01 两条 —— 都在 dailyRows 那 180 天之外。
  // 月度汇总要是跟着 dailyRows 走，这两条就会凭空消失（去年的柱子整根不见）。
  const rows = core.monthlySeries(rangeDatabase());
  assert.deepEqual(rows.map((row) => row.month), ["2025-12", "2026-01", "2026-08", "2026-09", "2026-10"]);
  assert.deepEqual(rows.map((row) => row.count), [1, 1, 1, 2, 5]);
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  assert.equal(total, core.yearlySeries(rangeDatabase()).reduce((sum, row) => sum + row.count, 0));
  for (const row of rows) {
    const parts = Object.values(row.byCollection);
    assert.equal(parts.reduce((sum, count) => sum + count, 0), row.count, `${row.month} 的分项之和该等于 count`);
  }
  assert.deepEqual(core.monthlySeries(core.emptyDatabase(NOW)), []);
  assert.deepEqual(core.monthlySeries(null), []);
});

test("monthKeyOf 补零、认月份从 1 起算", () => {
  assert.equal(core.monthKeyOf(at(2026, 8, 5, 10, 0)), "2026-08");
  assert.equal(core.monthKeyOf(at(2026, 10, 1, 0, 0)), "2026-10");
  assert.equal(core.monthKeyOf(at(2025, 12, 31, 10, 0)), "2025-12");
  assert.equal(core.monthKeyOf("坏时间"), "");
});

test("snapshot 带上 monthly（全量月度）与 earliest（最早一条收藏的日期）", () => {
  const snapshot = core.snapshot(rangeDatabase(), NOW);
  assert.deepEqual(snapshot.monthly, core.monthlySeries(rangeDatabase()));
  // 最早一是 2025-12-31（不是 firstSeen —— 那个看 firstSeenAt）
  assert.equal(snapshot.earliest, "2025-12-31");
  assert.ok(snapshot.earliest <= snapshot.dailyRows[0].day, "earliest 必须不晚于 dailyRows 的第一天");
  // 空库：没有最早日期这种东西，给 null（界面据此把下界放开到 730 天）
  assert.equal(core.snapshot(core.emptyDatabase(NOW), NOW).earliest, null);
  assert.deepEqual(core.snapshot(core.emptyDatabase(NOW), NOW).monthly, []);
});

test("大库（5000 条 / 20 个收藏夹）的 snapshot 序列化后仍然只有几十 KB", () => {
  const videos = [];
  for (let i = 0; i < 5000; i += 1) {
    // 覆盖 180 天（含窗口外的更早日期），每 5 条换一个收藏夹 → 20 个收藏夹
    videos.push(
      video({
        bvid: `BV1${String(i).padStart(9, "0")}`,
        collection: `收藏夹${i % 20}`,
        date: `2026年${String(1 + (i % 9)).padStart(2, "0")}月${String(1 + (i % 28)).padStart(2, "0")}日10时00分00秒`
      })
    );
  }
  const database = core.databaseFromVideos(videos, { now: NOW });
  const text = JSON.stringify(core.snapshot(database, NOW));
  const snapshot = core.snapshot(database, NOW);
  assert.equal(snapshot.videos, 5000);
  assert.equal(snapshot.collections, 20);
  assert.equal(snapshot.dailyRows.length, core.DAILY_ROWS_DAYS);
  // 这份快照要 JSON 序列化后存进 chrome.storage.local，用户的设备上还有配额。
  // 80 KB 是「180 天 × 20 个收藏夹只写非零项」应该落在的量级；
  // 哪天有人图省事把每个收藏夹逐天都写一遍，这里立刻会红。
  assert.ok(text.length < 80 * 1024, `快照序列化后 ${text.length} 字节，超了 80 KB`);
  // 大库也要能走通区间 API，不能只是「没抛」
  assert.equal(core.totalInRange(database, core.rangeFor("last30", NOW)), core.seriesInRange(database, core.rangeFor("last30", NOW)).reduce((sum, row) => sum + row.count, 0));
  // 新增的按月全量表（长区间柱子用）同样要守配额：9 个月 × 20 个收藏夹
  // 只写非零项，实测约 2 KB —— 逐月把每个月都写一遍才是会炸的那种写法。
  const monthlyText = JSON.stringify(snapshot.monthly);
  assert.equal(snapshot.monthly.length, 9);
  assert.equal(snapshot.monthly[0].month, "2026-01");
  assert.equal(snapshot.monthly[snapshot.monthly.length - 1].month, "2026-09");
  assert.ok(monthlyText.length < 12 * 1024, `月度汇总序列化后 ${monthlyText.length} 字节，超了 12 KB`);
  // 一份快照的总量：月度和 dailyRows 都在里面，还是十几 KB（原来 ~16.5 KB）
  assert.ok(text.length < 40 * 1024, `快照序列化后 ${text.length} 字节，超了 40 KB`);
});

// 一份「字段缺胳膊少腿」的库：不是 databaseFromVideos 造出来的，专门喂给坏输入用例。
function weakDatabase() {
  return { version: 1, videos: {}, pet: {} };
}

test("区间 API 拿坏输入一律安全，不抛", () => {
  const useless = [weakDatabase(), null, undefined, "nope", 42, { videos: "不是对象" }, { videos: {} }];
  for (const database of useless) {
    // 空库 + 合法区间：柱子仍然要给满（每天 0 条），图表才画得出一条平的基线
    const series = core.seriesInRange(database, core.rangeFor("today", NOW));
    assert.equal(series.length, 1);
    assert.equal(series[0].count, 0);
    assert.deepEqual(core.collectionBreakdown(database, core.rangeFor("today", NOW)), []);
    assert.deepEqual(core.yearlySeries(database), []);
    assert.equal(core.totalInRange(database, core.rangeFor("today", NOW)), 0);
  }
  // at 是坏值时不能抛、也不能把条目当「今天」：normalizeEntry 认不出就直接丢掉。
  const broken = { videos: { "bvid:BV1AAAAAAAAA": { at: "坏时间", collection: "x" } } };
  assert.equal(core.totalInRange(broken, core.rangeFor("today", NOW)), 0);
  assert.equal(core.collectionBreakdown(broken, core.rangeFor("today", NOW)).length, 0);
  assert.deepEqual(core.seriesInRange(broken, core.rangeFor("today", NOW)), [{ day: "2026-10-12", count: 0 }]);
  // 「at: 2026」是个能认的数字（= 1970-01-01 前后那 2 秒），该落在 1970 那一年附近而不是今年。
  // 这里不写死年份：UTC+8 是 1970、UTC-5 是 1969，写死就成了只在一个时区成立的断言。
  const tiny = { videos: { "bvid:BV1AAAAAAAAA": { at: 2026, collection: "x" } } };
  const tinyYears = core.yearlySeries(tiny);
  assert.equal(tinyYears.length, 1);
  assert.equal(tinyYears[0].count, 1);
  assert.ok(tinyYears[0].year < 1971, `epoch 附近的毫秒不该被算成今年：${tinyYears[0].year}`);
  assert.equal(core.totalInRange(tiny, core.rangeFor("today", NOW)), 0);
  // range 本身是坏的：空数组而不是抛
  const ranges = [
    null,
    undefined,
    {},
    { from: "x", to: "y" },
    { from: NaN, to: NaN },
    { from: at(2026, 10, 3, 0, 0), to: at(2026, 10, 1, 0, 0) }, // 反向
    { from: Infinity, to: Infinity }
  ];
  for (const range of ranges) {
    assert.deepEqual(core.seriesInRange(rangeDatabase(), range), [], `seriesInRange(${JSON.stringify(range)})`);
    assert.deepEqual(core.collectionBreakdown(rangeDatabase(), range), [], `collectionBreakdown(${JSON.stringify(range)})`);
    assert.equal(core.totalInRange(rangeDatabase(), range), 0, `totalInRange(${JSON.stringify(range)})`);
  }
  // rangeFor 自己也不能被坏 now 弄崩
  for (const now of [null, undefined, "x", NaN, {}, new Date("坏日期")]) {
    const range = core.rangeFor("today", now);
    assert.ok(range && Number.isFinite(range.from) && Number.isFinite(range.to), "坏 now 也要给得出区间");
    assert.equal(range.days, 1);
  }
  assert.ok(core.rangeFor("lastMonth", new Date("坏日期")).days >= 28, "坏 now 时上个月也该是个整月");
});

test("缺 day 字段的老库条目照样能进 dailyRows 与区间 API", () => {
  const database = core.databaseFromVideos([video({ date: "2026年10月12日09时30分00秒" })], { now: NOW });
  // 模拟老库：只有 at 没有 day
  for (const entry of Object.values(database.videos)) delete entry.day;
  const today = core.localDayKey(at(2026, 10, 12, 9, 30));
  const snapshot = core.snapshot(database, NOW);
  const row = snapshot.dailyRows.find((item) => item.day === today);
  assert.equal(row.count, 1);
  assert.deepEqual(row.byCollection, { 哆啦a梦: 1 });
  assert.equal(core.totalInRange(database, core.rangeFor("today", NOW)), 1);
  assert.deepEqual(core.seriesInRange(database, core.rangeFor("today", NOW)), [{ day: today, count: 1 }]);
});

/* ───────────────────────── 统计口径 ─────────────────────────
   这几个数字会直接显示给用户看，也算错了最容易发现。 */

test("snapshot 的总数、今日、近 7 天、收藏夹数都对得上", () => {
  const snapshot = core.snapshot(sampleDatabase(), NOW);
  assert.equal(snapshot.videos, 5);
  assert.equal(snapshot.collections, 3);
  assert.equal(snapshot.savedToday, 2);
  assert.equal(snapshot.savedLast7, 3); // 10-12 两条 + 10-10 一条（近 7 天 = 10-06 起）
  assert.equal(snapshot.updatedAt, NOW);
});

test("snapshot 的「近期收藏最多的收藏夹」按近 7 天算，并列时取先出现的", () => {
  const snapshot = core.snapshot(sampleDatabase(), NOW);
  assert.ok(snapshot.topCollection);
  assert.equal(snapshot.topCollection.name, "哆啦a梦");
  assert.equal(snapshot.topCollection.recent, 3);
  assert.equal(snapshot.topCollection.count, 3);
});

test("近 7 天一条都没有时，排行榜退回全时段，不会给 null", () => {
  const database = core.databaseFromVideos([video({ date: "2020年01月01日10时00分00秒" })], { now: NOW });
  const snapshot = core.snapshot(database, NOW);
  assert.equal(snapshot.savedLast7, 0);
  assert.equal(snapshot.savedToday, 0);
  assert.equal(snapshot.topCollection.name, "哆啦a梦");
  assert.equal(snapshot.topCollection.recent, 0);
});

test("空数据库的 snapshot 不为 null，也不出现 NaN", () => {
  const snapshot = core.snapshot(core.emptyDatabase(NOW), NOW);
  assert.equal(snapshot.videos, 0);
  assert.equal(snapshot.collections, 0);
  assert.equal(snapshot.topCollection, null);
  assert.equal(snapshot.days.days, 1);
  assert.equal(snapshot.days.since, "2026-10-12");
  assert.ok(Number.isFinite(snapshot.updatedAt));
});

test("days 从最早一条收藏算起，至少 1 天", () => {
  const database = core.databaseFromVideos([video({ date: "2026年10月01日10时00分00秒" })], { now: NOW });
  assert.equal(core.snapshot(database, NOW).days.since, "2026-10-01");
  assert.equal(core.snapshot(database, NOW).days.days, 12);
  assert.equal(core.snapshot(core.emptyDatabase(NOW), NOW).days.days, 1);
});

test("recentDays 给满 n 天、缺的日子补 0、最后一天是今天", () => {
  const rows = core.recentDays(sampleDatabase(), 14, NOW);
  assert.equal(rows.length, 14);
  assert.equal(rows[0].day, "2026-09-29");
  assert.equal(rows[rows.length - 1].day, "2026-10-12");
  assert.equal(rows[rows.length - 1].count, 2);
  assert.equal(rows[rows.length - 3].day, "2026-10-10");
  assert.equal(rows[rows.length - 3].count, 1);
  assert.equal(rows[0].count, 0);
  // 窗口是 09-29 ~ 10-12，所以 10-01 那条也在里面：2 + 1 + 1 = 4
  assert.equal(rows.reduce((sum, row) => sum + row.count, 0), 4);
});

test("recentDays 的天数被夹在 1~120 之间", () => {
  assert.equal(core.recentDays(sampleDatabase(), 0, NOW).length, 1);
  assert.equal(core.recentDays(sampleDatabase(), 9999, NOW).length, 120);
});

test("collectionRows 按总数降序，同数按最近收藏时间降序", () => {
  const rows = core.collectionRows(sampleDatabase(), NOW);
  // dds 与 蜡笔小新 都是 1 条，蜡笔小新的最近收藏（10-01）比 dds（03-01）新，所以排在前面
  assert.deepEqual(rows.map((row) => row.name), ["哆啦a梦", "蜡笔小新", "dds"]);
  assert.equal(rows[0].videos, 3);
  assert.equal(rows[0].recent, 3);
  assert.equal(rows[2].videos, 1);
  assert.equal(rows[2].lastAt, at(2026, 3, 1, 10, 0));
});

test("collectionRows 把缺收藏夹的条目归到「未分类收藏」", () => {
  const database = core.databaseFromVideos([video({ collection: "" })], { now: NOW });
  const rows = core.collectionRows(database, NOW);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, "未分类收藏");
});

test("跨天推进不能靠加固定毫秒数：夏令时那两天也要给出对的日期", () => {
  // 2026-03-08 与 2026-11-01 是美国夏令时的切换日；这几天在 America/New_York 下
  // 只有 23 小时 / 有 25 小时。如果实现里写 from + i * 86400000，这里就会缺一天或重一天。
  // 本机不在那个时区也没关系：这条用例证明的是「日期由日历构造逐日推进」这个实现方式。
  const database = core.databaseFromVideos(
    [
      video({ bvid: "BV1AAAAAAAAA", date: "2026年03月07日10时00分00秒" }),
      video({ bvid: "BV1BBBBBBBBB", date: "2026年03月08日10时00分00秒" }),
      video({ bvid: "BV1CCCCCCCCC", date: "2026年03月10日10时00分00秒" })
    ],
    { now: NOW }
  );
  const range = core.rangeFor("custom", NOW, { from: at(2026, 3, 7, 0, 0), to: at(2026, 3, 10, 0, 0) });
  assert.equal(range.days, 4);
  const rows = core.seriesInRange(database, range);
  assert.deepEqual(rows.map((row) => row.day), ["2026-03-07", "2026-03-08", "2026-03-09", "2026-03-10"]);
  assert.deepEqual(rows.map((row) => row.count), [1, 1, 0, 1]);
});

test("跨年与年界那几天：去年最后一天、今年第一天各归各的区间", () => {
  const database = core.databaseFromVideos(
    [
      video({ bvid: "BV1AAAAAAAAA", date: "2026年12月31日23时00分00秒", collection: "跨年" }),
      video({ bvid: "BV1BBBBBBBBB", date: "2027年01月01日00时30分00秒", collection: "跨年" })
    ],
    { now: at(2027, 1, 2, 10, 0) }
  );
  assert.deepEqual(core.yearlySeries(database).map((row) => ({ year: row.year, count: row.count })), [
    { year: 2026, count: 1 },
    { year: 2027, count: 1 }
  ]);
  // 「今天」是 2027-01-02：两条都在昨天或更早，今天该是 0
  const today = core.rangeFor("today", at(2027, 1, 2, 10, 0));
  assert.equal(core.totalInRange(database, today), 0);
  // 昨天（2027-01-01）只算 00:30 那条，23:00 那条属于今天之前
  assert.equal(core.totalInRange(database, core.rangeFor("yesterday", at(2027, 1, 2, 10, 0))), 1);
  // 12-31 那条归 2026 年，1-1 那条归 2027 年 —— 区间端点跨年不错位
  const lastMonth = core.rangeFor("lastMonth", at(2027, 1, 2, 10, 0));
  assert.equal(core.totalInRange(database, lastMonth), 1);
  assert.equal(lastMonth.days, 31); // 2026 年 12 月
});

/* ───────────────────────── 宠物 ───────────────────────── */

test("touchPet 加亲密度并给出 0~3 的台词下标", () => {
  const database = core.emptyDatabase(NOW);
  const first = core.touchPet(database, NOW);
  assert.equal(first.affinity, 1);
  assert.equal(first.todayTouch, 1);
  assert.equal(first.totalTouch, 1);
  assert.ok(first.index >= 0 && first.index < core.PET_LINE_COUNT);
  assert.equal(first.capped, false);
  assert.equal(database.pet.affinity, 1);
});

test("touchPet 同一天超过上限就不再涨亲密度，但仍然返回台词", () => {
  const database = core.emptyDatabase(NOW);
  let last = null;
  for (let i = 0; i < core.PET_DAILY_TOUCH_LIMIT + 5; i += 1) last = core.touchPet(database, NOW);
  assert.equal(database.pet.affinity, core.PET_DAILY_TOUCH_LIMIT);
  assert.equal(database.pet.todayTouch, core.PET_DAILY_TOUCH_LIMIT);
  assert.equal(database.pet.totalTouch, core.PET_DAILY_TOUCH_LIMIT + 5);
  assert.equal(last.capped, true);
  assert.ok(last.index >= 0 && last.index < core.PET_LINE_COUNT);
});

test("touchPet 跨天重置当天的次数，亲密度不清零", () => {
  const database = core.emptyDatabase(NOW);
  core.touchPet(database, NOW);
  core.touchPet(database, NOW);
  const tomorrow = core.touchPet(database, NOW + DAY);
  assert.equal(tomorrow.affinity, 3);
  assert.equal(tomorrow.todayTouch, 1);
  assert.equal(database.pet.day, "2026-10-13");
});

test("touchPet 拿坏数据也能跑，不会抛", () => {
  const database = { version: 1, videos: {}, pet: { affinity: "x", todayTouch: -5, day: 7 } };
  const result = core.touchPet(database, NOW);
  assert.equal(result.affinity, 1);
  assert.equal(result.todayTouch, 1);
});

/* ───────────────────────── 容错 ─────────────────────────
   数据库文件是用户能直接看到、也可能手改的文件，读坏了不能崩。 */

test("normalizeDatabase 对垃圾输入返回空库", () => {
  assert.equal(Object.keys(core.normalizeDatabase(null, NOW).videos).length, 0);
  assert.equal(Object.keys(core.normalizeDatabase("nope", NOW).videos).length, 0);
  assert.equal(Object.keys(core.normalizeDatabase(42, NOW).videos).length, 0);
});

test("normalizeDatabase 丢掉认不出的条目，保住能认的", () => {
  const database = core.normalizeDatabase(
    {
      version: 1,
      videos: {
        "bvid:BV1Z9c7zAEbj": { at: at(2026, 10, 12, 9, 30), collection: "哆啦a梦", title: "t" },
        "bvid:BV1BADBADBAD": { collection: "x" },
        "": { at: NOW }
      }
    },
    NOW
  );
  assert.deepEqual(Object.keys(database.videos), ["bvid:BV1Z9c7zAEbj"]);
  assert.equal(database.videos["bvid:BV1Z9c7zAEbj"].day, "2026-10-12");
});

test("normalizeDatabase 修复越界的宠物数值", () => {
  const database = core.normalizeDatabase({ pet: { affinity: -3, todayTouch: "x", totalTouch: 1e9 } }, NOW);
  assert.equal(database.pet.affinity, 0);
  assert.equal(database.pet.todayTouch, 0);
  assert.equal(database.pet.totalTouch, 1e9);
  assert.equal(database.pet.day, "2026-10-12");
});

test("normalizeDatabase 只认 day 没有 at 的条目也能救回来", () => {
  const database = core.normalizeDatabase({ videos: { "bvid:BV1Z9c7zAEbj": { day: "2026-10-12", collection: "c" } } }, NOW);
  const entry = database.videos["bvid:BV1Z9c7zAEbj"];
  assert.ok(entry);
  assert.equal(entry.at, at(2026, 10, 12, 0, 0));
  assert.equal(entry.day, "2026-10-12");
});

/* ───────────────────────── 汇总 ───────────────────────── */

// ---- 1.7.18（destructive P1-3）：回滚用的减法 ---------------------------------

test("removeRecords 只删名单里的行，并把累计数一起退回去", () => {
  let db = core.emptyDatabase(1000);
  db = core.addRecord(db, { bvid: "BV1xx411c7mD", title: "甲", collection: "收藏夹A", at: 1000 }, 1000);
  db = core.addRecord(db, { bvid: "BV1xx411c7mE", title: "乙", collection: "收藏夹A", at: 2000 }, 2000);
  assert.equal(Object.keys(db.videos).length, 2);
  assert.equal(db.totals.savedTotal, 2);

  const removed = core.removeRecords(db, ["bvid:BV1xx411c7mD"]);
  assert.equal(removed, 1, "撤掉一行");
  assert.equal(Object.keys(db.videos).length, 1);
  assert.equal(db.totals.savedTotal, 1, "累计数要跟着退回去，否则弹窗与宠物挂件一直报高");
  assert.equal(db.videos["bvid:BV1xx411c7mE"].title, "乙", "名单外的行不许动");
});

test("removeRecords 对不存在的 key 与脏输入都不炸、也不会把累计数减成负数", () => {
  let db = core.emptyDatabase(1000);
  db = core.addRecord(db, { bvid: "BV1xx411c7mD", title: "甲", collection: "C", at: 1000 }, 1000);
  assert.equal(core.removeRecords(db, ["bvid:不存在", "", null, 42]), 0);
  assert.equal(db.totals.savedTotal, 1);

  // 同一条撤两次：第二次什么都不做，累计数不许变负
  assert.equal(core.removeRecords(db, ["bvid:BV1xx411c7mD"]), 1);
  assert.equal(core.removeRecords(db, ["bvid:BV1xx411c7mD"]), 0);
  assert.equal(db.totals.savedTotal, 0);

  assert.equal(core.removeRecords(null, ["bvid:x"]), 0);
  assert.equal(core.removeRecords({}, ["bvid:x"]), 0);
  assert.equal(core.removeRecords(db, null), 0);
});

test("removeRecords 认得 addRecord 用过的三种 key（BV / av / 标题+收藏夹）", () => {
  let db = core.emptyDatabase(1000);
  db = core.addRecord(db, { bvid: "BV1xx411c7mD", title: "甲", collection: "C", at: 1000 }, 1000);
  db = core.addRecord(db, { aid: "av12345", title: "乙", collection: "C", at: 1000 }, 1000);
  db = core.addRecord(db, { title: "丙", collection: "C", at: 1000 }, 1000);
  assert.equal(Object.keys(db.videos).length, 3);
  assert.equal(core.videoKey({ bvid: "BV1xx411c7mD" }), "bvid:BV1xx411c7mD");
  assert.equal(core.videoKey({ aid: "av12345" }), "aid:12345");
  assert.equal(core.videoKey({ title: "丙", collection: "C" }), "title:C\u0000丙");
  const keys = Object.keys(db.videos);
  assert.equal(core.removeRecords(db, keys), 3);
  assert.equal(Object.keys(db.videos).length, 0);
  assert.equal(db.totals.savedTotal, 0);
});

test("非法日键不许被 JS 悄悄滚动（1.8.11）", () => {
  assert.ok(Number.isFinite(core.dayKeyToTime("2026-02-28")), "正常日键仍然要认");
  assert.ok(Number.isNaN(core.dayKeyToTime("2026-02-30")), "2 月没有 30 号");
  assert.ok(Number.isNaN(core.dayKeyToTime("2026-13-01")), "13 月不存在");
  assert.ok(Number.isNaN(core.dayKeyToTime("2026-04-31")), "4 月没有 31 号");
  assert.ok(Number.isNaN(core.dayKeyToTime("2026-00-00")), "0 月 0 日不存在");
  /* 闰年 2-29 要认：2024 是闰年 */
  assert.ok(Number.isFinite(core.dayKeyToTime("2024-02-29")), "闰年 2 月 29 日合法");
  assert.ok(Number.isNaN(core.dayKeyToTime("2025-02-29")), "平年没有 2 月 29 日");
});

test("removeRecords：老 key 删不掉时按 bvid / 标题再认一次（1.8.11）", () => {
  /* 目录名时代的老 key 是 title:收藏夹\u0000标题，新 key 是 bvid:… —— 换过算法之后
     交叉删除必须还能删掉，否则「删了视频，统计里还留着」。 */
  const left = core.emptyDatabase(1000);
  left.videos["title:C\u0000甲"] = { title: "甲", collection: "C", bvid: "BV1xx411c7mD", at: 1000 };
  left.totals.savedTotal = 1;
  assert.equal(core.removeRecords(left, ["bvid:BV1xx411c7mD"]), 1, "按 bvid 删老 title 行");
  assert.deepEqual(Object.keys(left.videos), []);

  const right = core.emptyDatabase(1000);
  right.videos["bvid:BV1xx411c7mD"] = { title: "甲", collection: "C", bvid: "BV1xx411c7mD", at: 1000 };
  right.totals.savedTotal = 1;
  assert.equal(core.removeRecords(right, ["title:C\u0000甲"]), 1, "按标题删 bvid 行");
  assert.deepEqual(Object.keys(right.videos), []);

  const unrelated = core.emptyDatabase(1000);
  unrelated.videos["bvid:BV1zz411c7mD"] = { title: "乙", collection: "C", bvid: "BV1zz411c7mD", at: 1000 };
  assert.equal(core.removeRecords(unrelated, ["bvid:BV1xx411c7mD"]), 0, "别的视频不能被误删");
});

test("脏时间戳不占总数以外的空位：未来的夹到今天，非正的直接丢（1.8.12）", () => {
  const now = new Date(2026, 9, 22, 12, 0, 0).getTime();
  const db = core.emptyDatabase(now);
  core.addRecord(db, { bvid: "BV1aa411c7d1", collection: "默认收藏夹", title: "未来的", at: now + 400 * 86400000 }, now);
  core.addRecord(db, { bvid: "BV1aa411c7d2", collection: "默认收藏夹", title: "脏的", at: 1e300 }, now);
  const row = db.videos["bvid:BV1aa411c7d1"];
  assert.equal(row.at, now, "未来的收藏时间要夹到现在");
  assert.equal(row.day, core.localDayKey(now), "夹完之后必须落在今天这一格");
  assert.equal(db.futureDayCount, 2, "两次都该记进 futureDayCount");
  const snap = core.snapshot(db, now);
  assert.equal(snap.videos, 2, "两条都要进总数");
  assert.equal(snap.savedToday, 2, "也要进「今天」那一格，不能只进总数");
  assert.equal(snap.futureDayCount, 2, "快照要把这个数带出去");
  const dropped = core.normalizeDatabase({ videos: { "bvid:BV1aa411c7d3": { at: 0 } } }, now);
  assert.equal(Object.keys(dropped.videos).length, 0, "非正时间戳的行留着没有意义");
});

test("台词下标不会卡住：封顶后延后写盘的那一分钟里也要继续往前走（1.8.12）", () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6].map((n) => core.petLineIndex(n)), [0, 1, 2, 3, 0, 1], "每摸一下换一句");
  assert.deepEqual([1, 2, 3].map((o) => core.petLineIndex(21, o)), [1, 2, 3], "延后写盘时靠 offset 继续走，不能原地踏步");
  assert.equal(core.petLineIndex(0), 0, "没摸过也不许算出负数");
  const now = new Date(2026, 9, 22, 12, 0, 0).getTime();
  const db = core.emptyDatabase(now);
  const indexes = [];
  for (let i = 0; i < 6; i += 1) indexes.push(core.touchPet(db, now).index);
  assert.deepEqual(indexes, [0, 1, 2, 3, 0, 1], "touchPet 自己也要轮着走");
});

if (isMain) {
  process.stdout.write("\n\n");
  for (const { name, error } of failures) {
    console.log(`✖ ${name}`);
    console.log(`    ${error.message.split("\n")[0]}`);
    if (error.expected !== undefined) {
      console.log(`  期望 ${JSON.stringify(error.expected)} / 实际 ${JSON.stringify(error.actual)}`);
    }
  }
  console.log(`ℹ tests ${passed + failed}`);
  console.log(`ℹ pass ${passed}`);
  console.log(`ℹ fail ${failed}`);
  process.exitCode = failed === 0 ? 0 : 1;
}

module.exports = {
  get results() {
    return { passed, failed, failures };
  }
};
