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

/* ───────────────────────── 数据库增删 ───────────────────────── */

test("emptyDatabase 的形状固定", () => {
  const database = core.emptyDatabase(NOW);
  assert.equal(database.version, core.DATABASE_VERSION);
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
      video({ bvid: "BV1CCCCCCCCC", date: "2026年10月01日10时00分00秒", collection: "蜡笔小新" }), // 近 30 天
      video({ bvid: "BV1DDDDDDDDD", date: "2026年03月01日10时00分00秒", collection: "dds" }) // 很久以前
    ],
    { now: NOW }
  );
}

test("snapshot 的总数、今日、近 7 天、收藏夹数都对得上", () => {
  const snapshot = core.snapshot(sampleDatabase(), NOW);
  assert.equal(snapshot.videos, 5);
  assert.equal(snapshot.collections, 3);
  assert.equal(snapshot.savedToday, 2);
  assert.equal(snapshot.savedLast7, 3); // 10-12 两条 + 10-10 一条（近 7 天 = 10-06 起）
  assert.equal(snapshot.updatedAt, NOW);
});

test("snapshot 的「近期收藏最多的收藏夹」按近 30 天算，并列时取先出现的", () => {
  const snapshot = core.snapshot(sampleDatabase(), NOW);
  assert.ok(snapshot.topCollection);
  assert.equal(snapshot.topCollection.name, "哆啦a梦");
  assert.equal(snapshot.topCollection.recent, 3);
  assert.equal(snapshot.topCollection.count, 3);
});

test("近 30 天一条都没有时，排行榜退回全时段，不会给 null", () => {
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
