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

/* ---------------- 统计库：读 ---------------- */

async function suite() {

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
    await bg.chrome.storage.session.set({
      archiveWriteLock: { kind: "import", at: Date.now() - 31 * 60 * 1000 }
    });
    assert.equal(await bg.__test.archiveWriteLockHeldBy("import"), false);
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
    const chrome = makeChrome({ nativeReplies: [{ ok: true, protocol: 2 }] });
    const { call } = nativeRequest(chrome);
    await assert.rejects(() => call({ action: "get-config" }), /协议版本对不上（它报 2，本插件需要 3）/);
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
    const chrome = makeChrome({ nativeReplies: [{ ok: true, protocol: 3, downloadBasePath: "D:\\归档" }] });
    const { call } = nativeRequest(chrome);
    const response = await call({ action: "get-config" });
    assert.equal(response.downloadBasePath, "D:\\归档");
    assert.equal(chrome.__nativeCalls.length, 1);
    assert.equal(chrome.__nativeCalls[0].host, "com.bcatch.folder_opener");
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

  await test("本机路径打码：打码之后不许留下用户名或盘符碎片", async () => {
    const bg = loadBackground({ chrome: chromeWithMirror(null) });
    const masked = bg.__test.maskLocalUserPaths("打开失败：C:\\Users\\Maxwell\\Desktop\\_测试归档\\000视频下载\\BV1xx（没有权限）");
    assert.equal(/Maxwell/.test(masked), false, "用户名不许留下");
    assert.equal(masked.includes("<用户>"), true, "该盖的地方要真的盖了");
    assert.equal(masked.includes("没有权限"), true, "人话部分要留着");
  });

}

/* ---------------- 跑 ---------------- */

module.exports = { get results() { return { passed, failed, failures }; } };

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
