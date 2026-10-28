"use strict";
/*
  background.js 与 library.js 里「碰 chrome.* / 文件系统 / 原生消息」的那部分，**真执行**测试。

  分工（三套测试各管一段）：
    test/stability.test.cjs  —— 读文件 + 正则：证明源码里写着某行字（防漂移）
    test/archive-core.test.cjs / test/stats-core.test.cjs —— 纯函数真执行
    test/background.test.cjs —— 本文件：把 background.js 整份丢进 vm 跑起来，
                                配上内存版 chrome.storage 与内存版目录树，
                                真调 readStatsDatabase / writeStatsDatabase /
                                flushStatsPendingRecords / rollbackStatsRecords /
                                withStatsWriteSlot / 归档写锁，以及从 library.js
                                抠出来的 nativeHostRequest 与 maskLocalUserPaths。

  为什么值得单独写：这一块以前只有静态断言盖着。静态断言能证明「写着 canWrite=false」，
  证明不了「读不出来的时候真的一个字节都没写」。1.7.0 的 P0（读库失败 → 空库 → 整份
  重写）就是这么漏过去的。

  运行：node test/background.test.cjs
*/

const assert = require("node:assert");
const harness = require("./harness.cjs");

const isMain = require.main === module;

const { loadBackground, makeChrome, makeDirectoryTree, carveFunction, carveConst, readSource } = harness;

let passed = 0;
let failed = 0;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    if (isMain) process.stdout.write(".");
  } catch (error) {
    failed += 1;
    failures.push({ name, error });
    if (isMain) process.stdout.write("x");
  }
}

/* ---------------- 小工具 ---------------- */

const statsCore = require("../stats-core.js");

/** 造一个带 003database 的根目录；database.json 的内容由 text 决定（null = 不建文件）。 */
function rootWithDatabase(text, extra = {}) {
  const database = {};
  if (text !== null) database[statsCore.DATABASE_FILE_NAME] = text;
  return makeDirectoryTree({
    [statsCore.DATABASE_FOLDER_NAME]: { ...database, ...extra }
  });
}

/** 往 storage.local 里塞一份统计镜像。 */
function chromeWithMirror(mirror) {
  return makeChrome({ localData: mirror ? { bcaStatsMirror: mirror } : {} });
}

const MIRROR = {
  firstSeenAt: "2019-03-04T05:06:07.000Z",
  savedTotal: 4321,
  affinity: 77,
  totalTouch: 210
};

/** 真的 BV 号形状：stats-core 只认 /^BV[0-9A-Za-z]{10}$/，编短了会掉进 title 兜底。 */
const bv = (tail) => `BV1xx411c7m${tail}`;

function record(bvid, at) {
  return { bvid, title: `标题 ${bvid}`, collection: "收藏夹", at };
}

function titleRecord(title, at) {
  return { title, collection: "收藏夹", at };
}

const now = () => Date.now();

/** 1.9.4：saveFavorite 要读 IndexedDB 里的根目录句柄，这里给它一个只会返回 rootHandle 的桩。 */
function makeRootDb(rootHandle) {
  const task = (result) => {
    const request = { result: null, onsuccess: null, onerror: null };
    setImmediate(() => {
      request.result = result;
      if (request.onsuccess) request.onsuccess();
    });
    return request;
  };
  return {
    open() {
      const request = { result: null, onsuccess: null, onerror: null, onupgradeneeded: null };
      setImmediate(() => {
        request.result = {
          transaction: () => ({ objectStore: () => ({ get: () => task(rootHandle) }) }),
          close() {}
        };
        if (request.onsuccess) request.onsuccess();
      });
      return request;
    }
  };
}


/* ---------------- 统计库：读 ---------------- */

async function suite() {
  await test("infoLineValue 把换行与控制符压成空格（1.15.3 · 审查 T-1）", () => {
    const bg = loadBackground();
    const line = bg.__test.infoLineValue;
    assert.equal(line("标题\n第二行"), "标题 第二行", "换行必须压成空格，否则 txt 会多出一行伪装的字段");
    assert.equal(line("a\tb\u0000c\u001fd\u007fe"), "a b c d e", "制表符与 C0/C1 控制符都要压掉");
    assert.equal(line("  两边空白  "), "两边空白");
    assert.equal(line(""), "未知", "空值退回默认占位");
    assert.equal(line(null, "N/A"), "N/A", "自定义兜底也要生效");
  });
  /* ---------------- 1.9.3：收藏时的补资料与去重 ---------------- */

  await test("收藏前按「收藏夹 + BV」索引找已有目录，BV 对得上才复用（1.9.3）", async () => {
    const bvid = bv("A1");
    const favoriteLine = "视频收藏时间：2026年10月08日21时15分00秒.000";
    const infoText = [
      "【基本信息】",
      favoriteLine,
      "信息保存于：2026年10月08日21时15分00秒",
      "所属收藏夹：测试收藏夹",
      "视频标题：老标题",
      "视频链接：https://www.bilibili.com/video/" + bvid,
      "BV号：" + bvid,
      ""
    ].join("\r\n");
    const bg = loadBackground({
      chrome: makeChrome({ localData: { biliVaultBvIndex: { 测试收藏夹: { [bvid]: "2026年10月08日21时15分00秒" } } } })
    });
    const root = makeDirectoryTree({ 测试收藏夹: { "2026年10月08日21时15分00秒": { "视频信息.txt": infoText } } });
    const collectionFolder = await root.getDirectoryHandle("测试收藏夹");
    const existing = await bg.__test.readExistingRecordFolder(collectionFolder, "2026年10月08日21时15分00秒", bvid);
    assert.ok(existing, "索引命中的目录应该复用");
    assert.equal(existing.favoriteLine, favoriteLine);
    assert.equal(await bg.__test.readExistingRecordFolder(collectionFolder, "2026年10月08日21时15分00秒", bv("B2")), null);
    assert.equal(await bg.__test.readExistingRecordFolder(collectionFolder, "", bvid), null);
    assert.equal(await bg.__test.readExistingRecordFolder(collectionFolder, "2026年10月09日00时00分00秒", bvid), null);
  });

  await test("收藏时用接口补真实 UP 主与互动数据，接口失败就退回页面元数据（1.9.3）", async () => {
    const pageMetadata = { bvid: bv("A1"), upName: "推荐位里的名字", upMid: "999", title: "页面标题", pubdate: 1600000000 };
    const fetched = [];
    const fetchOk = async (url) => {
      fetched.push(String(url));
      return {
        ok: true,
        json: async () => ({
          code: 0,
          data: {
            bvid: bv("A1"),
            aid: 123,
            title: "真标题",
            desc: "真简介",
            pubdate: 1700000000,
            duration: 120,
            pic: "https://i0.hdslb.com/bfs/archive/cover.jpg",
            tname: "游戏",
            tname2: "单机游戏",
            owner: { mid: 4925207, name: "真 UP" },
            stat: { view: 100, danmaku: 3, like: 5, coin: 6, favorite: 7, share: 8 }
          }
        })
      };
    };
    const bg = loadBackground({ chrome: makeChrome({ localData: {} }), fetch: fetchOk });
    const merged = await bg.__test.enrichFavoriteMetadata(pageMetadata);
    assert.equal(merged.upName, "真 UP");
    assert.equal(merged.upMid, "4925207");
    assert.deepEqual(merged.stats, { view: 100, danmaku: 3, like: 5, coin: 6, favorite: 7, share: 8 });
    // 1.9.5：收藏时不再请求粉丝数（少一次限速排队），粉丝数交给「更新视频状态」/导入；
    // 1.10.4：不再记分区（接口只回数字 tid，没有名字）。发布时间优先用页面 DOM 抓到的那个。
    assert.equal(merged.upFans, undefined);
    assert.equal(fetched.filter((url) => url.includes("/x/relation/stat")).length, 0, "收藏时不该再请求粉丝数");
    assert.equal(merged.category, undefined, "1.10.4 起不再记分区");
    assert.equal(merged.pubdate, 1600000000, "发布时间优先用页面 DOM 的值");
    assert.equal(merged.description, "真简介");

    const failing = loadBackground({ chrome: makeChrome({ localData: {} }) });
    const fallback = await failing.__test.enrichFavoriteMetadata(pageMetadata);
    assert.equal(fallback.upName, "推荐位里的名字");
    assert.equal(fallback.stats, undefined);
  });


  /* ---------------- 1.9.4：简介、所属收藏夹、已存在就跳过 ---------------- */

  await test("buildInfo 的「所属收藏夹」写收藏夹名，简介只认真简介（1.9.4）", async () => {
    const bg = loadBackground({ chrome: makeChrome({ localData: {} }) });
    const shareText = "测试标题, 视频播放量 157608、弹幕量 746、点赞数 5862、投硬币枚数 166、收藏人数 1127、转发人数 197, 视频作者 某人, 作者简介 简介文字, 相关视频：别的视频标题";
    const build = (title, description) => bg.__test.buildInfo({
      metadata: { title, url: "https://www.bilibili.com/video/" + bv("A1") + "/", bvid: bv("A1"), description, stats: {} },
      favoriteAt: Date.parse("2026-10-24T01:12:36+08:00")
    }, "游戏解说", new Date("2026-10-24T01:12:37+08:00"));
    const lines = (text) => text.split(/\r?\n/);
    const field = (text, name) => lines(text).find((item) => item.startsWith(name)) || "";
    const description = (text) => {
      const all = lines(text);
      const at = all.indexOf("【视频简介】");
      return at < 0 ? "" : all.slice(at + 1).join("\n").trim();
    };

    const real = build("测试标题", "真正的简介第一行\n真正的第二行");
    assert.equal(field(real, "所属收藏夹："), "所属收藏夹：游戏解说");
    assert.equal(description(real), "真正的简介第一行\n真正的第二行");

    assert.equal(description(build("测试标题", shareText)), "无", "分享文案不算简介");
    assert.equal(description(build("测试标题", "测试标题")), "无", "简介就是标题时也不算");
    assert.equal(description(build("测试标题", "")), "未知", "没有简介就记未知");
  });

  await test("本地已有同一条视频就整条跳过：不请求接口、不写盘（1.9.4）", async () => {
    const bvid = bv("A1");
    const infoText = [
      "【基本信息】",
      "视频收藏时间：2026年10月08日21时15分00秒.000",
      "信息保存于：2026年10月08日21时15分00秒",
      "所属收藏夹：测试收藏夹",
      "视频标题：老的标题",
      "视频链接：https://www.bilibili.com/video/" + bvid + "/",
      "BV号：" + bvid,
      "",
      "【视频简介】",
      "老的简介"
    ].join("\r\n");
    const root = await makeDirectoryTree({ 测试收藏夹: { "2026年10月08日21时15分00秒": { "视频信息.txt": infoText, "封面.webp": "PNG" } } });
    const collectionFolder = await root.getDirectoryHandle("测试收藏夹");
    let fetchCalls = 0;
    const bg = loadBackground({
      chrome: makeChrome({ localData: { biliVaultBvIndex: { 测试收藏夹: { [bvid]: "2026年10月08日21时15分00秒" } } } }),
      indexedDB: makeRootDb(root),
      fetch: async () => {
        fetchCalls += 1;
        throw new Error("已经存过就不该再请求接口");
      }
    });
    const result = await bg.__test.saveFavorite({
      metadata: { bvid, url: "https://www.bilibili.com/video/" + bvid + "/", title: "新的标题" },
      folders: [{ name: "测试收藏夹" }],
      favoriteAt: Date.now()
    });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.match(result.message, /已在本地，跳过/);
    assert.equal(fetchCalls, 0, "跳过时不应该请求 B 站接口");
    const recordFolder = await collectionFolder.getDirectoryHandle("2026年10月08日21时15分00秒");
    const text = await (await (await recordFolder.getFileHandle("视频信息.txt")).getFile()).text();
    assert.equal(text, infoText, "跳过的记录不该被改写");
  });

  await test("统计快照丢了可以按现成的 database.json 补发一次（1.9.6）", async () => {

    const day = statsCore.localDayKey(Date.now());

    const dbText = JSON.stringify({

      version: 1,

      schemaVersion: 1,

      createdAt: 1700000000000,

      firstSeenAt: new Date(1700000000000).toISOString(),

      updatedAt: 1700000000000,

      videos: {

        "bvid:BV1aa411c7m1": { at: Date.now(), day, collection: "测试收藏夹", title: "补发用的记录", bvid: "BV1aa411c7m1", aid: 0 }

      },

      totals: { savedTotal: 1 },

      futureDayCount: 0,

      pet: { affinity: 1, day, todayTouch: 1, totalTouch: 1 }

    });

    const root = rootWithDatabase(dbText);

    const bg = loadBackground({ chrome: makeChrome({ localData: {} }), indexedDB: makeRootDb(root) });

    const listener = bg.chrome.__events["runtime.onMessage"].listeners[0];

    const response = await new Promise((resolve) => {

      // 1.14.1（审查 S-2）：后台的 onMessage 现在只信扩展自己人，sender.id 必须是真的
      const ret = listener({ type: "bca-stats-republish" }, { id: bg.chrome.runtime.id }, resolve);

      if (ret !== true) resolve({ ok: false, reason: "sync" });

      setTimeout(() => resolve({ ok: false, reason: "timeout" }), 2000).unref?.();

    });

    assert.equal(response.ok, true, JSON.stringify(response));

    assert.equal(response.rows, 1);

    const stored = await bg.chrome.storage.local.get("bcaStats");

    assert.ok(stored.bcaStats, "应该补发一份 bcaStats 快照");

    assert.equal(stored.bcaStats.videos, 1, "快照里应该记着 1 条视频");

    assert.equal(stored.bcaStats.savedToday, 1);

  });



  await test("新目录第一次读库：给空库、允许写、reason 是 empty", async () => {
    const bg = loadBackground({ chrome: chromeWithMirror(null) });
    const root = rootWithDatabase(null);
    const read = await bg.__test.readStatsDatabase(root);
    assert.equal(read.canWrite, true);
    assert.equal(read.reason, "empty");
    assert.deepEqual(read.database.videos, {});
    assert.equal(statsCore.DATABASE_FILE_NAME in (await root.getDirectoryHandle(statsCore.DATABASE_FOLDER_NAME)).__dump(), true);
  });

  await test("0 字节文件走 empty 出口，但仍然过统计镜像（1.7.19）", async () => {
    const bg = loadBackground({ chrome: chromeWithMirror(MIRROR) });
    const read = await bg.__test.readStatsDatabase(rootWithDatabase(""));
    assert.equal(read.canWrite, true);
    assert.equal(read.reason, "empty");
    // 0 字节正是「1.7.16 之前的就地截断写」被打断时留下的现场，四个只会往前走的数不能归零
    assert.equal(read.database.totals.savedTotal, MIRROR.savedTotal);
    assert.equal(read.database.pet.affinity, MIRROR.affinity);
    assert.equal(read.database.pet.totalTouch, MIRROR.totalTouch);
    assert.equal(Date.parse(read.database.firstSeenAt), Date.parse(MIRROR.firstSeenAt));
  });

  await test("全新安装（没有镜像、没有文件）不会凭空造数", async () => {
    const bg = loadBackground({ chrome: chromeWithMirror(null) });
    const read = await bg.__test.readStatsDatabase(rootWithDatabase(null));
    assert.equal(read.database.totals.savedTotal, 0);
    assert.equal(read.database.pet.affinity, 0);
  });

  await test("读文件抛错 = 拒绝写入（P0 的根因就在这里）", async () => {
    const bg = loadBackground({ chrome: chromeWithMirror(MIRROR) });
    const root = rootWithDatabase(JSON.stringify(statsCore.emptyDatabase(1000)));
    const directory = await root.getDirectoryHandle(statsCore.DATABASE_FOLDER_NAME);
    const file = await directory.getFileHandle(statsCore.DATABASE_FILE_NAME);
    const error = new Error("被别的程序占着"); error.name = "NotReadableError";
    file.__failRead = error;
    const read = await bg.__test.readStatsDatabase(root);
    assert.equal(read.canWrite, false, "读不出来就必须拒绝写入");
    assert.equal(read.reason, "unreadable");
    assert.equal(bg.__test.statsDatabaseWriteBlocked(read).length > 0, true);
    // 镜像顶住了三个不可恢复的字段
    assert.equal(read.database.totals.savedTotal, MIRROR.savedTotal);
  });

  await test("坏 JSON：原文留档成 database.bad.<时间戳>.json，再重建，并且不回退镜像", async () => {
    const bg = loadBackground({ chrome: chromeWithMirror(MIRROR) });
    const root = rootWithDatabase("{这不是 JSON");
    const read = await bg.__test.readStatsDatabase(root);
    assert.equal(read.reason, "corrupt");
    assert.equal(read.canWrite, true);
    assert.equal(read.database.totals.savedTotal, MIRROR.savedTotal, "留档成功也要过镜像");
    const directory = await root.getDirectoryHandle(statsCore.DATABASE_FOLDER_NAME);
    const backups = directory.__list().filter((name) => /^database\.bad\.\d{8}-\d{6}\.json$/.test(name));
    assert.equal(backups.length, 1, `应该有且只有一个时间戳留档，实际：${JSON.stringify(directory.__list())}`);
    assert.equal(directory.__child(backups[0]).__text(), "{这不是 JSON", "留档里必须是原文");
  });

  await test("坏 JSON 留档失败：canWrite=false，且一个字节都不许动原文件", async () => {
    const bg = loadBackground({ chrome: chromeWithMirror(null) });
    const root = rootWithDatabase("{还是坏 JSON");
    const directory = await root.getDirectoryHandle(statsCore.DATABASE_FOLDER_NAME);
    directory.__failCreate = new Error("配额满了");
    const read = await bg.__test.readStatsDatabase(root);
    assert.equal(read.canWrite, false);
    assert.equal(read.reason, "corrupt-unarchived");
    assert.equal(directory.__child(statsCore.DATABASE_FILE_NAME).__text(), "{还是坏 JSON", "原文必须原样留着");
  });

  await test("正常库：读出内容、reason 是 ok、原文一并带出来", async () => {
    const seeded = statsCore.addRecord(statsCore.emptyDatabase(1000), record("BV1xx411c7mD", 1000), 1000);
    const bg = loadBackground({ chrome: chromeWithMirror(null) });
    const read = await bg.__test.readStatsDatabase(rootWithDatabase(JSON.stringify(seeded)));
    assert.equal(read.reason, "ok");
    assert.equal(read.canWrite, true);
    assert.equal(Object.keys(read.database.videos).length, 1);
    assert.equal(read.text, JSON.stringify(seeded));
  });

/* ---------------- 统计库：写 ---------------- */

  await test("库读不出来时 writeStatsDatabase 一个字节都不写（P0 红线）", async () => {
    const before = statsCore.addRecord(statsCore.emptyDatabase(1000), record(bv("O"), 1000), 1000);
    const bg = loadBackground({ chrome: chromeWithMirror(MIRROR) });
    const root = rootWithDatabase(JSON.stringify(before));
    const directory = await root.getDirectoryHandle(statsCore.DATABASE_FOLDER_NAME);
    const file = await directory.getFileHandle(statsCore.DATABASE_FILE_NAME);
    file.__failRead = new Error("读不出来");
    const result = await bg.__test.writeStatsDatabase(root, [record(bv("N"), 2000)]);
    assert.equal(result, null, "拒绝写入时返回 null");
    assert.deepEqual(JSON.parse(file.__text()).videos, before.videos, "磁盘上的库必须一个字节都没变");
    const last = (await bg.chrome.storage.local.get("lastResult")).lastResult;
    assert.ok(last && /读不出来|跳过写入/.test(last.message), `要说清为什么没写：${JSON.stringify(last)}`);
  });

  await test("正常写：内容落盘，新 key 记进 insertedKeys，已有的不记", async () => {
    const seeded = statsCore.addRecord(statsCore.emptyDatabase(1000), record(bv("O"), 1000), 1000);
    const bg = loadBackground({ chrome: chromeWithMirror(null) });
    const root = rootWithDatabase(JSON.stringify(seeded));
    const inserted = [];
    const next = await bg.__test.writeStatsDatabase(root, [record(bv("O"), 1500), record(bv("N"), 2000)], inserted);
    assert.ok(next, "应该写成功");
    assert.deepEqual(inserted, [`bvid:${bv("N")}`], "只有真正新增的 key 才算插入");
    const directory = await root.getDirectoryHandle(statsCore.DATABASE_FOLDER_NAME);
    const onDisk = JSON.parse(directory.__child(statsCore.DATABASE_FILE_NAME).__text());
    assert.equal(`bvid:${bv("N")}` in onDisk.videos, true);
    assert.equal(Object.keys(onDisk.videos).length, 2);
  });

  await test("写成功之后统计镜像跟着更新", async () => {
    const bg = loadBackground({ chrome: chromeWithMirror(null) });
    const root = rootWithDatabase(null);
    await bg.__test.writeStatsDatabase(root, [record(bv("A"), 1000), record(bv("B"), 2000)]);
    const mirror = (await bg.chrome.storage.local.get("bcaStatsMirror")).bcaStatsMirror;
    assert.equal(mirror.savedTotal, 2);
  });

  await test("写失败：记录回到队首，一条都不丢（1.7.10）", async () => {
    const bg = loadBackground({ chrome: chromeWithMirror(null) });
    const root = rootWithDatabase(null);
    bg.__test.statsPendingRecords.push(record(bv("A"), 1000), record(bv("B"), 2000));
    const directory = await root.getDirectoryHandle(statsCore.DATABASE_FOLDER_NAME);
    const file = await directory.getFileHandle(statsCore.DATABASE_FILE_NAME, { create: true });
    file.__failOpen = new Error("磁盘满了");
    const result = await bg.__test.flushStatsPendingRecords(root);
    assert.equal(result, null);
    assert.equal(bg.__test.statsPendingRecords.length, 2, "失败必须整批放回");
    assert.equal(bg.__test.statsPendingRecords[0].bvid, bv("A"), "放回要保持原顺序");
  });

  await test("连写失败到阈值：把提示写进 lastResult（走同一个通道）", async () => {
    const bg = loadBackground({ chrome: chromeWithMirror(null) });
    const root = rootWithDatabase(null);
    const directory = await root.getDirectoryHandle(statsCore.DATABASE_FOLDER_NAME);
    const file = await directory.getFileHandle(statsCore.DATABASE_FILE_NAME, { create: true });
    file.__failOpen = new Error("磁盘满了");
    for (let i = 0; i < 3; i += 1) {
      bg.__test.statsPendingRecords.push(record(bv(String(i)), 1000 + i));
      await bg.__test.flushStatsPendingRecords(root);
    }
    const last = (await bg.chrome.storage.local.get("lastResult")).lastResult;
    assert.ok(last && /写不进去/.test(last.message), `第 3 次失败要报出来：${JSON.stringify(last)}`);
    assert.ok(/连试 3 次/.test(last.message), `要说连试了几次：${last.message}`);
  });

/* ---------------- 统计库：并发与回滚 ---------------- */

  await test("三个写入口串在一条链上：并发写不会互相盖掉（1.7.21）", async () => {
    const bg = loadBackground({ chrome: chromeWithMirror(null) });
    const root = rootWithDatabase(null);
    // 真跑：两个写同时进。没有 withStatsWriteSlot 的话，两边都读到空库，
    // 后写的那个把先写的整份盖掉，最后只剩一条。
    await Promise.all([
      bg.__test.writeStatsDatabase(root, [record(bv("A"), 1000)]),
      bg.__test.writeStatsDatabase(root, [record(bv("B"), 2000)])
    ]);
    const directory = await root.getDirectoryHandle(statsCore.DATABASE_FOLDER_NAME);
    const onDisk = JSON.parse(directory.__child(statsCore.DATABASE_FILE_NAME).__text());
    assert.deepEqual(Object.keys(onDisk.videos).sort(), [`bvid:${bv("A")}`, `bvid:${bv("B")}`], "两条都必须在");
  });

  await test("回滚统计行：撤掉指定的 key，并把累计数一起退回去（1.7.18）", async () => {
    const bg = loadBackground({ chrome: chromeWithMirror(null) });
    const root = rootWithDatabase(null);
    await bg.__test.writeStatsDatabase(root, [record(bv("A"), 1000), record(bv("B"), 2000)]);
    const result = await bg.__test.rollbackStatsRecords(root, [`bvid:${bv("A")}`]);
    assert.equal(result.failed, false);
    assert.equal(result.removed, 1);
    const directory = await root.getDirectoryHandle(statsCore.DATABASE_FOLDER_NAME);
    const onDisk = JSON.parse(directory.__child(statsCore.DATABASE_FILE_NAME).__text());
    assert.deepEqual(Object.keys(onDisk.videos), [`bvid:${bv("B")}`]);
    assert.equal(onDisk.totals.savedTotal, 1, "累计数要跟着退回去，不然统计页会多出不存在的一行");
  });

  await test("回滚时库读不出来：一个字节都不写，如实报 failed", async () => {
    const seeded = statsCore.addRecord(statsCore.emptyDatabase(1000), record(bv("A"), 1000), 1000);
    const bg = loadBackground({ chrome: chromeWithMirror(null) });
    const root = rootWithDatabase(JSON.stringify(seeded));
    const directory = await root.getDirectoryHandle(statsCore.DATABASE_FOLDER_NAME);
    const file = await directory.getFileHandle(statsCore.DATABASE_FILE_NAME);
    file.__failRead = new Error("读不出来");
    const result = await bg.__test.rollbackStatsRecords(root, [`bvid:${bv("A")}`]);
    assert.equal(result.failed, true);
    assert.equal(result.removed, 0);
    const onDisk = JSON.parse(directory.__child(statsCore.DATABASE_FILE_NAME).__text());
    assert.equal(`bvid:${bv("A")}` in onDisk.videos, true, "拒绝写入时原库必须没动");
  });

/* ---------------- 归档写锁（跨上下文） ---------------- */

  await test("归档写锁：写入之后隔着 storage 能看到，按种类分得清，能清掉", async () => {
    const bg = loadBackground({ chrome: chromeWithMirror(null) });
    assert.equal(await bg.__test.archiveWriteLockHeldBy("library"), false);
    await bg.__test.setArchiveWriteLock("library");
    assert.equal(await bg.__test.archiveWriteLockHeldBy("library"), true);
    assert.equal(await bg.__test.archiveWriteLockHeldBy("import"), false, "不同种类要分得开");
    const raw = (await bg.chrome.storage.session.get("archiveWriteLock")).archiveWriteLock;
    assert.equal(raw.kind, "library", "锁必须落在 chrome.storage.session 上，页面和 SW 才看得到同一把");
    await bg.__test.clearArchiveWriteLock("library");
    assert.equal(await bg.__test.archiveWriteLockHeldBy("library"), false);
  });

  await test("归档写锁：超过时限的锁自己失效，不会把写永久挡住", async () => {
    const bg = loadBackground({ chrome: chromeWithMirror(null) });
    // 1.17.8：这里原来写的是 `at`，而判据读的是 `since` —— 锁等于没过期，断言是靠
    // 「反正读不到 since」蒙对的。改成 since 之后才真的在验「陈旧失效」。
    await bg.chrome.storage.session.set({
      archiveWriteLock: { kind: "import", since: Date.now() - 31 * 60 * 1000 }
    });
    assert.equal(await bg.__test.archiveWriteLockHeldBy("import"), false);
  });

  await test("1.17.8：手动收藏也要过归档闸门 —— 别人占着就回绝，自己跑完无论成败都放锁（审查 P2-2）", async () => {
    const bg = loadBackground({ chrome: makeChrome({ localData: { enabled: false } }) });
    // 收藏库正在删 / 搬：立刻回绝，并且不许把别人的锁覆写成自己的。
    await bg.chrome.storage.session.set({ archiveWriteLock: { kind: "library", since: Date.now() } });
    const blocked = await bg.__test.saveFavoriteWithWriteLock({ metadata: {}, folders: [] });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.busyWriteLock, "library");
    assert.match(blocked.message, /删除或搬运/, "被收藏库挡住时要实话实说是谁在忙");
    const stillLibrary = (await bg.chrome.storage.session.get("archiveWriteLock")).archiveWriteLock;
    assert.equal(stillLibrary.kind, "library", "被别人占着时不许动那把锁");
    // 导入占着：文案换成「等导入结束」。
    await bg.chrome.storage.session.set({ archiveWriteLock: { kind: "import", since: Date.now() } });
    const busyImport = await bg.__test.saveFavoriteWithWriteLock({ metadata: {}, folders: [] });
    assert.equal(busyImport.busyWriteLock, "import");
    assert.match(busyImport.message, /导入/);
    // 没人占：这条路径真的跑了一遍（enabled=false 让它立刻返回），锁必须放掉。
    await bg.chrome.storage.session.remove("archiveWriteLock");
    const ran = await bg.__test.saveFavoriteWithWriteLock({ metadata: {}, folders: [] });
    assert.equal(ran.ok, false);
    assert.match(ran.message, /自动归档已关闭/, "没被挡时应该真的走到保存链路里");
    const afterRun = (await bg.chrome.storage.session.get("archiveWriteLock")).archiveWriteLock;
    assert.equal(afterRun, undefined, "跑完必须放锁，不能留给下一轮");
  });

/* ---------------- 原生消息（从 library.js 抠出来真跑） ---------------- */

  function nativeRequest(chrome, options = {}) {
    const source = readSource("library.js");
    const parts = [
      carveConst(source, "NATIVE_HOST_NAME"),
      carveConst(source, "NATIVE_PROTOCOL_VERSION"),
      carveFunction(source, "nativeHostRequest")
    ].join("\n");
    const t = (key, params) => (params
      ? String(key).replace(/\{(\w+)\}/g, (_match, name) => (name in params ? String(params[name]) : `{${name}}`))
      : key);
    // eslint-disable-next-line no-new-func
    const build = new Function("chrome", "BcaI18n", `${parts}\n;return nativeHostRequest;`);
    return { call: build(chrome, { t }), source: parts };
  }

  await test("原生消息：协议号对不上就拒绝，并把「它报几、要几」说清楚（1.7.13）", async () => {
    const chrome = makeChrome({ nativeReplies: [{ ok: true, protocol: 3 }] });
    const { call } = nativeRequest(chrome);
    // 1.10.2（TODO P2-13）：扩展侧协议号升到 4，报 3 的必须是「旧宿主」这条路。
    await assert.rejects(() => call({ action: "get-config" }), /协议版本对不上（它报 3，本插件需要 4）/);
  });

  await test("原生消息：老宿主没有 protocol 字段 → 直说「装的多半是旧版本」（1.7.13）", async () => {
    const chrome = makeChrome({ nativeReplies: [{ ok: true, version: "3.8.0" }] });
    const { call } = nativeRequest(chrome);
    await assert.rejects(() => call({ action: "get-config" }), /没有报告协议版本/);
  });

  await test("原生消息：宿主的 message 原样带出去，不要只剩 native host has exited", async () => {
    const chrome = makeChrome({ nativeReplies: [{ ok: false, message: "找不到下载目录" }] });
    const { call } = nativeRequest(chrome);
    await assert.rejects(() => call({ action: "open-directory" }), /找不到下载目录/);
  });

  await test("原生消息：Chrome 层的 lastError 也要翻译成人话", async () => {
    const chrome = makeChrome({ nativeReplies: [{ __lastError: "Specified native messaging host not found." }] });
    const { call } = nativeRequest(chrome);
    await assert.rejects(() => call({ action: "get-config" }), /Specified native messaging host not found\./);
  });

  await test("原生消息：协议号对上就正常返回，并且真的调了那个宿主名", async () => {
    const chrome = makeChrome({ nativeReplies: [{ ok: true, protocol: 4, downloadBasePath: "D:\\归档" }] });
    const { call } = nativeRequest(chrome);
    const response = await call({ action: "get-config" });
    assert.equal(response.downloadBasePath, "D:\\归档");
    assert.equal(chrome.__nativeCalls.length, 1);
    assert.equal(chrome.__nativeCalls[0].host, "com.bcatch.folder_opener");
    // 1.10.2（TODO P2-13）：宿主先认调用方，所以请求里必须自报扩展 id 与协议号。
    assert.equal(chrome.__nativeCalls[0].message.protocol, 4);
    assert.ok(chrome.__nativeCalls[0].message.extensionId, "请求要带扩展 id");
  });

/* ---------------- 本机路径打码 ---------------- */

  await test("本机路径打码：盘符与分段都盖掉，UNC 与相对路径不动", async () => {
    const bg = loadBackground({ chrome: chromeWithMirror(null) });
    const mask = bg.__test.maskLocalUserPaths;
    assert.equal(
      mask("C:\\Users\\Maxwell\\Desktop\\_测试归档\\000视频下载"),
      "C:\\Users\\<用户>\\Desktop\\_测试归档\\000视频下载",
      "盖的是用户名那一段，剩下的路径要留着 —— 用户看报告还得认得出是哪个目录"
    );
    assert.equal(mask("D:/归档/002同步报告"), "D:/归档/002同步报告", "不是用户目录的原样留着");
    assert.equal(mask("\\\\server\\share\\归档"), "\\\\server\\share\\归档", "网络路径不是本机路径，不该打码");
    assert.equal(mask("归档/子目录"), "归档/子目录", "相对路径不该打码");
    assert.equal(
      mask("已扫描 C:\\a\\b，备用 D:\\c"),
      "已扫描 C:\\a\\b，备用 D:\\c",
      "没有 Users 段就一个字符都不该动"
    );
    assert.equal(
      mask("C:\\Users\\甲\\a 与 C:\\Users\\乙\\b"),
      "C:\\Users\\<用户>\\a 与 C:\\Users\\<用户>\\b",
      "一句话里两处都要盖"
    );
    assert.equal(
      mask("C:\\Documents and Settings\\老王\\桌面"),
      "C:\\Documents and Settings\\<用户>\\桌面",
      "老系统那条路径也要盖"
    );
  });

  await test("本机路径打码：用户自己选的下载根也被整段换掉（1.12.4 / 审查 P2-2）", async () => {
    const bg = loadBackground({ chrome: chromeWithMirror(null) });
    // 系统用户目录之外的自定义盘符路径，靠形状永远匹配不到 —— 只有「记住了」才盖得掉。
    bg.__test.rememberLocalRoot("D:\\我的备份\\000视频下载");
    assert.equal(
      bg.__test.maskLocalUserPaths("打开失败：D:\\我的备份\\000视频下载\\BV1xx"),
      "打开失败：<本地文件夹>\\BV1xx",
      "记住的下载根要整段换掉，剩下的子路径留着",
    );
    assert.equal(
      bg.__test.maskLocalUserPaths("打开失败：D:/我的备份/000视频下载/BV1xx"),
      "打开失败：<本地文件夹>/BV1xx",
      "斜杠写法也要认",
    );
    assert.equal(
      bg.__test.maskLocalUserPaths("E:\\别的目录\\000视频下载"),
      "E:\\别的目录\\000视频下载",
      "没记住的路径一个字符都不该动 —— 插件确实不知道它",
    );
  });

  await test("本机路径打码：macOS / Linux 的用户目录也盖（1.12.4）", async () => {
    const bg = loadBackground({ chrome: chromeWithMirror(null) });
    const mask = bg.__test.maskLocalUserPaths;
    assert.equal(mask("/Users/maxwell/Desktop/归档/000视频下载"), "/Users/<用户>/Desktop/归档/000视频下载");
    assert.equal(mask("/home/maxwell/archive/BV1xx"), "/home/<用户>/archive/BV1xx");
    assert.equal(mask("/var/tmp/归档"), "/var/tmp/归档", "不是用户目录的原样留着");
  });

  await test("本机路径打码：纯函数 maskKnownRoots 只替换登记过的根", async () => {
    const bg = loadBackground({ chrome: chromeWithMirror(null) });
    const roots = new Set(["D:\\归档"]);
    assert.equal(bg.__test.maskKnownRoots("D:\\归档\\a 与 D:/归档/b", roots), "<本地文件夹>\\a 与 <本地文件夹>/b");
    assert.equal(bg.__test.maskKnownRoots("D:\\归档案\\a", roots), "D:\\归档案\\a", "前缀相似但不是同一个根，不该误伤");
  });

  await test("本机路径打码：打码之后不许留下用户名或盘符碎片", async () => {
    const bg = loadBackground({ chrome: chromeWithMirror(null) });
    const masked = bg.__test.maskLocalUserPaths("打开失败：C:\\Users\\Maxwell\\Desktop\\_测试归档\\000视频下载\\BV1xx（没有权限）");
    assert.equal(/Maxwell/.test(masked), false, "用户名不许留下");
    assert.equal(masked.includes("<用户>"), true, "该盖的地方要真的盖了");
    assert.equal(masked.includes("没有权限"), true, "人话部分要留着");
  });

  /* ---- 1.13.5（审查 P1-6）：对比残影的复位要真跑一遍 ---- */

  await test("对比进行中被回收：storage 里的 running 残影要在模块启动时就落回 false（1.13.5 · 审查 P1-6）", async () => {
    const residue = { running: true, text: "正在对比「我的收藏」：第 2/5 页，已读到 60 条", summary: null, at: 1760000000000 };
    const chrome = makeChrome({ localData: { diffState: residue } });
    loadBackground({ chrome });
    // 模块末尾那句 diffReconcileState() 是 fire-and-forget，等它一轮微任务落盘
    await new Promise((resolve) => setTimeout(resolve, 0));
    const after = chrome.storage.local.dump().diffState;
    assert.equal(after.running, false, "残影必须落回 false，否则弹窗的导入/对比/恢复会一直锁着");
    assert.equal(after.text, "", "残影的进度文字也要清掉");
    assert.equal(after.at, residue.at, "原有字段别丢");
  });

  await test("对比真的在内存里跑的时候，复位函数不许动它（1.13.5 · 审查 P1-6）", async () => {
    const chrome = makeChrome({ localData: {} });
    const bg = loadBackground({ chrome });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const running = { running: true, text: "正在对比「我的收藏」…", summary: null, at: 1760000000000 };
    await chrome.storage.local.set({ diffState: running });
    bg.__test.diffRun.active = true;
    assert.deepEqual(await bg.__test.diffReconcileState(), { active: true, reset: false });
    assert.deepEqual(chrome.storage.local.dump().diffState, running, "在跑就别碰");
    bg.__test.diffRun.active = false;
    assert.deepEqual(await bg.__test.diffReconcileState(), { active: false, reset: true }, "标记落回 false 之后才复位");
    assert.equal(chrome.storage.local.dump().diffState.running, false);
  });

  await test("没有 diffState（首次安装 / 从未对比过）也能安全复位（1.13.5 · 审查 P1-6）", async () => {
    const chrome = makeChrome({ localData: {} });
    const bg = loadBackground({ chrome });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(await bg.__test.diffReconcileState(), { active: false, reset: false });
    assert.equal(chrome.storage.local.dump().diffState, undefined, "没有残影就不许凭空造一份");
  });

  test("路径太长时给一句人话，而不是把 NotFoundError 冒出去（1.7.24）", async () => {
    const background = loadBackground();
    const tree = await makeDirectoryTree({ "本地备份": {} });
    const root = await tree.getDirectoryHandle("本地备份");
    const longName = "标题".repeat(60) + " - BV1xx411c7mD";
    const error = new Error("目录不存在");
    error.name = "NotFoundError";
    root.__failCreate = error;
    try {
      await background.__test.createDirectoryOrExplain(root, longName);
      assert.fail("应当抛错");
    } catch (caught) {
      assert.match(caught.message, /建不出/, "不许把 NotFoundError 原样冒出去");
      assert.match(caught.message, /260/, "要点出 Windows 的路径上限");
      assert.match(caught.message, /挪到更浅/, "要给可执行的下一步");
    }
    // 其它错误不许被改写成路径问题
    const typeError = new Error("不是目录");
    typeError.name = "TypeMismatchError";
    root.__failCreate = typeError;
    try {
      await background.__test.createDirectoryOrExplain(root, "x");
      assert.fail("应当抛错");
    } catch (caught) {
      assert.equal(caught.name, "TypeMismatchError", "非 NotFoundError 要原样抛");
    }
  });

  await test("导入日记一开始是四个空篮子，回滚时分别记账（1.15.1 · P2 T-3）", async () => {
    const bg = loadBackground({ chrome: makeChrome({ localData: {} }) });
    const journal = bg.__test.createImportJournal();
    assert.deepEqual(journal, {
      createdCollections: [],
      createdRecords: [],
      modifiedFiles: [],
      addedFiles: []
    });
  });

  await test("回滚导入：删新建记录、还原被改写的文件、删新增文件、清空新建收藏夹（1.15.1 · P2 T-3）", async () => {
    const bg = loadBackground({ chrome: makeChrome({ localData: {} }) });
    const root = makeDirectoryTree({
      收藏夹: {
        "2026年10月25日21时15分00秒": { "视频信息.txt": "本次新建" },
        "保留": { "视频信息.txt": "别动我" },
        "新增.txt": "本次新增",
        "视频信息.txt": "被改写过"
      },
      "空收藏夹": {}
    });
    const collection = await root.getDirectoryHandle("收藏夹");
    const empty = await root.getDirectoryHandle("空收藏夹");
    const journal = bg.__test.createImportJournal();
    journal.createdRecords.push({ collectionHandle: collection, name: "2026年10月25日21时15分00秒" });
    journal.modifiedFiles.push({ directoryHandle: collection, name: "视频信息.txt", text: "还原后的内容" });
    journal.addedFiles.push({ directoryHandle: collection, name: "新增.txt" });
    journal.createdCollections.push({ handle: empty, parentHandle: root, name: "空收藏夹" });

    const result = await bg.__test.rollbackImport(journal);
    assert.equal(result.removedRecords, 1);
    assert.equal(result.restoredFiles, 1);
    assert.equal(result.removedFiles, 1);
    assert.equal(result.removedCollections, 1);
    assert.deepEqual(result.failures, []);

    const dump = root.__dump();
    assert.equal(dump["收藏夹"]["2026年10月25日21时15分00秒"], undefined, "本次新建的记录目录要删掉");
    assert.equal(dump["收藏夹"]["保留"]["视频信息.txt"], "别动我", "不是本次写的东西一律不碰");
    assert.equal(dump["收藏夹"]["新增.txt"], undefined, "本次新增的文件要删掉");
    assert.equal(dump["收藏夹"]["视频信息.txt"], "还原后的内容", "被改写的文件要还原成原文");
    assert.equal(dump["空收藏夹"], undefined, "本次新建的空收藏夹要清掉");
  });

  await test("回滚导入：非空的新建收藏夹留着，失败项要报出来（1.15.1 · P2 T-3）", async () => {
    const bg = loadBackground({ chrome: makeChrome({ localData: {} }) });
    const root = makeDirectoryTree({
      "新收藏夹": { "有条目": { "视频信息.txt": "x" } },
      "要报错的": { "a": {} }
    });
    const broken = await root.getDirectoryHandle("要报错的");
    broken.removeEntry = async () => { throw new Error("磁盘只读"); };
    const created = await root.getDirectoryHandle("新收藏夹");
    const journal = bg.__test.createImportJournal();
    journal.createdRecords.push({ collectionHandle: broken, name: "a" });
    journal.createdCollections.push({ handle: created, parentHandle: root, name: "新收藏夹" });

    const result = await bg.__test.rollbackImport(journal);
    assert.equal(result.removedRecords, 0, "删失败就不能记成功");
    assert.equal(result.removedCollections, 0, "里面有东西，收藏夹不许删");
    assert.equal(result.failures.length, 1, "失败项必须报出来");
    assert.match(result.failures[0], /撤回新建的 a/);
    assert.match(result.failures[0], /磁盘只读/);
    assert.ok(root.__has("新收藏夹"), "非空收藏夹要留着");
  });

  await test("上一轮导入被打断：本次新建的清掉，别人的东西不碰（1.15.8 · 审查 C-14）", async () => {
    const root = makeDirectoryTree({
    "我的收藏": {
      "2026年10月25日21时15分00秒": { "视频信息.txt": "本次新建" },
      "老记录": { "视频信息.txt": "别动我" },
      "子目录": { "新增.txt": "本次新增" }
    },
    "新建的空收藏夹": {},
    "新建的非空收藏夹": { "有条目": {} }
    });
    const leftover = {
      interruptedAt: Date.now(),
      journal: {
        createdRecords: [{ collection: "我的收藏", name: "2026年10月25日21时15分00秒" }],
        addedFiles: [{ collection: "我的收藏", directory: "子目录", name: "新增.txt" }],
        modifiedFiles: [],
        createdCollections: [{ name: "新建的空收藏夹" }, { name: "新建的非空收藏夹" }]
      }
    };
    const bg = loadBackground({
      chrome: makeChrome({ localData: { bcaImportLeftover: leftover } }),
      indexedDB: makeRootDb(root)
    });

    const result = await bg.__test.cleanupLeftoverImport();
    assert.equal(result.ok, true, "全都清掉了才算成功");
    assert.equal(result.removedRecords, 1);
    assert.equal(result.removedFiles, 1);
    assert.equal(result.removedCollections, 1, "只有空的那个新建收藏夹能删");
    assert.deepEqual(result.failures, []);

    const dump = root.__dump();
    assert.equal(dump["我的收藏"]["2026年10月25日21时15分00秒"], undefined, "本轮新建的记录要删掉");
    assert.equal(dump["我的收藏"]["老记录"]["视频信息.txt"], "别动我", "不是本轮写的东西一律不碰");
    assert.equal(dump["我的收藏"]["子目录"]["新增.txt"], undefined, "本轮新增的文件要删掉");
    assert.equal(dump["新建的空收藏夹"], undefined, "空的新建收藏夹要删掉");
    assert.ok(root.__has("新建的非空收藏夹"), "非空的新建收藏夹必须留着");
  });

  await test("清理上一轮导入：删不掉的要说出来，一条都没删成就别把记录当成功（1.15.8 · 审查 C-14）", async () => {
    const root = makeDirectoryTree({ "只读收藏": { "新建记录": {} } });
    const broken = await root.getDirectoryHandle("只读收藏");
    broken.removeEntry = async () => { throw new Error("磁盘只读"); };
    const leftover = {
      interruptedAt: Date.now(),
      journal: { createdRecords: [{ collection: "只读收藏", name: "新建记录" }] }
    };
    const bg = loadBackground({
      chrome: makeChrome({ localData: { bcaImportLeftover: leftover } }),
      indexedDB: makeRootDb(root)
    });

    const result = await bg.__test.cleanupLeftoverImport();
    assert.equal(result.ok, false, "一条都没删成不许报成功");
    assert.equal(result.reason, "failed");
    assert.equal(result.failures.length, 1, "失败项必须报出来");
    assert.match(result.failures[0], /撤回新建的 新建记录/);
    assert.match(result.failures[0], /磁盘只读/);
    assert.ok(root.__has("只读收藏"), "删不掉就保持原样");
  });

  await test("没有留下任何导入记录时，清理直接说「无事可做」（1.15.8 · 审查 C-14）", async () => {
    const bg = loadBackground({ chrome: makeChrome({ localData: {} }) });
    const result = await bg.__test.cleanupLeftoverImport();
    assert.deepEqual(result, { ok: false, reason: "nothing" });
  });

  await test("写失败留下的半截目录：空的删掉，有内容的留着并说明（1.15.1 · P2 T-3）", async () => {
    const bg = loadBackground({ chrome: makeChrome({ localData: {} }) });
    const root = makeDirectoryTree({ "空目录": {}, "有内容": { "封面.jpg": "x" } });

    const emptyError = new Error("保存失败");
    assert.equal(await bg.__test.discardFailedRecord(root, "空目录", emptyError), false);
    assert.equal(root.__has("空目录"), false, "空目录没有信息量，应当删掉");

    const contentError = new Error("保存失败");
    assert.equal(await bg.__test.discardFailedRecord(root, "有内容", contentError), true);
    assert.equal(root.__has("有内容"), true, "已经写进去的内容要留着");
    assert.match(contentError.message, /没有删/, "错误消息要说明东西还在");

    const missingError = new Error("保存失败");
    assert.equal(await bg.__test.discardFailedRecord(root, "根本没有", missingError), false);
    assert.equal(missingError.message, "保存失败", "目录根本不存在时不要瞎改写错误消息");
  });

  await test("换名失败的签名：带错误名、消息截到 200 码点（1.15.1 · P2 T-3）", async () => {
    const bg = loadBackground({ chrome: makeChrome({ localData: {} }) });
    const note = bg.__test.renameFailureNote({ name: "NotAllowedError", message: "x".repeat(500) });
    assert.match(note, /^NotAllowedError：/);
    assert.ok(note.length <= "NotAllowedError：".length + 200, "消息要截断，实际长度 " + note.length);
    assert.equal(bg.__test.renameFailureNote({}), "未知错误：");
  });

  await test("统计留档只留最近几份，别的文件一律不碰（1.15.1 · P2 T-3）", async () => {
    const bg = loadBackground({ chrome: makeChrome({ localData: {} }) });
    const names = ["20260101-000001", "20260102-000002", "20260103-000003", "20260104-000004",
      "20260105-000005", "20260106-000006", "20260107-000007"];
    const tree = { "database.json": "现在这份", "别的说明.txt": "别动" };
    for (const name of names) tree["database.bad." + name + ".json"] = name;
    const root = makeDirectoryTree(tree);

    assert.equal(await bg.__test.trimStatsBackups(root, 5), 2, "7 份留 5 份");
    const left = root.__list().filter((name) => name.startsWith("database.bad.")).sort();
    assert.deepEqual(left, names.slice(2).map((name) => "database.bad." + name + ".json"));
    assert.equal(root.__has("database.json"), true, "正在用的库不许动");
    assert.equal(root.__has("别的说明.txt"), true, "不是留档的文件不许动");
    assert.equal(await bg.__test.trimStatsBackups(root, 5), 0, "没超配额就不删");
  });

  await test("留档时间戳是定长的本地时间 YYYYMMDD-HHMMSS（1.15.1 · P2 T-3）", async () => {
    const bg = loadBackground({ chrome: makeChrome({ localData: {} }) });
    assert.equal(bg.__test.statsBackupTimestamp(new Date(2026, 9, 25, 21, 5, 7)), "20261025-210507");
  });

  await test("保存导入条目：命中风控一个目录都不建，封面没准备好就照原样抛（1.15.1 · P2 T-3）", async () => {
    const bg = loadBackground({ chrome: makeChrome({ localData: {} }) });
    const root = makeDirectoryTree({});
    await assert.rejects(
      () => bg.__test.saveImportedItem(root, { title: "收藏夹" }, { rateLimited: true, coverCandidates: [] }),
      /风控/
    );
    assert.deepEqual(root.__list(), [], "被风控拒绝时不许建目录");
    await assert.rejects(
      () => bg.__test.saveImportedItem(root, { title: "收藏夹" }, {
        coverCandidates: [],
        coverPreparationError: new Error("封面没准备好")
      }),
      /封面没准备好/
    );
  });

  await test("目录建不出来的解释只对「查无此目录」生效（1.15.1 · P2 T-3）", async () => {
    const bg = loadBackground({ chrome: makeChrome({ localData: {} }) });
    const notFound = Object.assign(new Error("x"), { name: "NotFoundError" });
    assert.match(bg.__test.describeDirectoryCreateError(notFound, "收藏夹"), /建不出「收藏夹」/);
    const other = Object.assign(new Error("x"), { name: "NotAllowedError" });
    assert.equal(bg.__test.describeDirectoryCreateError(other, "收藏夹"), "", "别的错误不要瞎解释");
  });

}

/* ---------------- 跑 ---------------- */

module.exports = { get results() { return { passed, failed, failures }; } };

if (isMain) {
  suite().then(() => {
    process.stdout.write("\n\n");
    for (const { name, error } of failures) {
      console.log(`✖ ${name}`);
      console.log(`    ${String(error && error.message || error).split("\n")[0]}`);
      if (error && error.expected !== undefined) {
        console.log(`  期望 ${JSON.stringify(error.expected)} / 实际 ${JSON.stringify(error.actual)}`);
      }
    }
    console.log(`ℹ tests ${passed + failed}`);
    console.log(`ℹ pass ${passed}`);
    console.log(`ℹ fail ${failed}`);
    process.exitCode = failed === 0 ? 0 : 1;
  }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
