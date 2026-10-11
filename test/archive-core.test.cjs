"use strict";
/*
  archive-core.js 的**真执行**单元测试。

  与 test/stability.test.cjs 的区别：
    那个是「读文件 + 正则匹配」，证明的是「源码里有没有这行字」；
    这个是 require 进来真的调用，证明的是「喂它输入，它吐什么」。

  archive-core.js 末尾本来就写了 CommonJS 导出，所以不需要任何改造：
    if (typeof module !== "undefined" && module.exports) module.exports = api;

  运行：node test/archive-core.test.cjs
*/

const assert = require("node:assert");
const core = require("../archive-core.js");

// 被 stability.test.cjs require 进来时不打印自己的进度条，只把结果交出去
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

/* ───────────────────────── safeName / safeCollectionName ─────────────────────────
   这两个函数决定磁盘上建什么名字。写错的后果是文件建不出来、或者建到别的地方去。 */

test("safeName 替换 Windows 非法字符", () => {
  assert.equal(core.safeName('a/b\\c:d*e?f"g<h>i|j'), "a_b_c_d_e_f_g_h_i_j");
  assert.equal(core.safeName("a\u0000b"), "a_b");           // 控制字符
});

test("safeName 去掉结尾的点和空格（Windows 会静默丢弃，导致名字对不上）", () => {
  assert.equal(core.safeName("abc. "), "abc");
  assert.equal(core.safeName("abc..."), "abc");
  assert.equal(core.safeName("abc   "), "abc");
});

test("safeName 空值走兜底", () => {
  assert.equal(core.safeName(""), "未知");
  assert.equal(core.safeName(null), "未知");
  assert.equal(core.safeName(undefined), "未知");
  assert.equal(core.safeName("   "), "未知");
  assert.equal(core.safeName(".", "兜底"), "兜底");
  assert.equal(core.safeName("..", "兜底"), "兜底");
});

test("safeName 拦住 Windows 保留设备名", () => {
  for (const reserved of ["CON", "con", "PRN", "AUX", "NUL", "COM1", "LPT9"]) {
    assert.equal(core.safeName(reserved), `_${reserved}`, `${reserved} 应该被加下划线`);
  }
  // 只有完整匹配才拦，CON1 / CONX 是合法名字
  assert.equal(core.safeName("CON1"), "CON1");
  assert.equal(core.safeName("CONX"), "CONX");
});

test("safeName 遵守长度上限", () => {
  assert.equal(core.safeName("x".repeat(200)).length, 100);          // 默认 100
  assert.equal(core.safeName("x".repeat(200), "fb", 10).length, 10); // 自定义
  assert.equal(core.safeName("短", "fb", 10), "短");
});

test("safeCollectionName 上限是 120，兜底是未分类收藏", () => {
  assert.equal(core.safeCollectionName("x".repeat(500)).length, 120);
  assert.equal(core.safeCollectionName(""), "未分类收藏");
  assert.equal(core.safeCollectionName("", "别的"), "别的");
});

test("safeCollectionName 的超长兜底值也要被截断", () => {
  // 源码是 return fallback.slice(0, maxLength) —— 兜底值同样受上限约束
  assert.equal(core.safeCollectionName("", "y".repeat(500)).length, 120);
});

/* ───────────────────────── videoDirectoryLabel ─────────────────────────
   规则：<标题> - <BV号|av号|视频N>。这个后缀是「已下载」识别的唯一依据。 */

test("videoDirectoryLabel 用 BV 号", () => {
  assert.equal(core.videoDirectoryLabel({ bvid: "BV1xx411c7mD", title: "标题" }), "标题 - BV1xx411c7mD");
});

test("videoDirectoryLabel 没有 BV 时用 av 号（并去掉 av 前缀再补回来）", () => {
  assert.equal(core.videoDirectoryLabel({ aid: "123", title: "标题" }), "标题 - av123");
  assert.equal(core.videoDirectoryLabel({ aid: "av123", title: "标题" }), "标题 - av123");
  assert.equal(core.videoDirectoryLabel({ aid: 123, title: "标题" }), "标题 - av123");
});

test("videoDirectoryLabel 两者都没有时用序号", () => {
  assert.equal(core.videoDirectoryLabel({ title: "标题" }, 0), "标题 - 视频1");
  assert.equal(core.videoDirectoryLabel({ title: "标题" }, 4), "标题 - 视频5");
});

test("videoDirectoryLabel 拒绝格式不对的 BV 号", () => {
  // BV 必须正好 BV + 10 位
  assert.equal(core.videoDirectoryLabel({ bvid: "BV123", title: "标题" }, 0), "标题 - 视频1");
  assert.equal(core.videoDirectoryLabel({ bvid: "BV1xx411c7mDXX", title: "标题" }, 0), "标题 - 视频1");
});

test("videoDirectoryLabel 总长度不超过 100（长标题要按后缀长度让位）", () => {
  const long = core.videoDirectoryLabel({ bvid: "BV1xx411c7mD", title: "标".repeat(300) });
  assert.equal(long.length, 100, `实际 ${long.length}`);
  assert.ok(long.endsWith(" - BV1xx411c7mD"), "后缀必须完整保留");
});

test("videoDirectoryLabel 的标题也走 safeName（非法字符会变下划线）", () => {
  assert.equal(core.videoDirectoryLabel({ bvid: "BV1xx411c7mD", title: "a/b:c" }), "a_b_c - BV1xx411c7mD");
});

/* ───────────────────────── identifiersFromDirectoryName ─────────────────────────
   反向解析目录名。它认不出来，就会把已下载的视频当成没下载。 */

test("identifiersFromDirectoryName 从后缀认出 BV / av", () => {
  assert.deepEqual([...core.identifiersFromDirectoryName("标题 - BV1xx411c7mD")], ["bvid:BV1xx411c7mD"]);
  assert.deepEqual([...core.identifiersFromDirectoryName("标题 - av123")], ["aid:123"]);
  assert.deepEqual([...core.identifiersFromDirectoryName("标题 - AV123")], ["aid:123"]);
});

test("identifiersFromDirectoryName 容忍重名后缀 (2)", () => {
  assert.deepEqual([...core.identifiersFromDirectoryName("标题 - BV1xx411c7mD (2)")], ["bvid:BV1xx411c7mD"]);
});

test("identifiersFromDirectoryName 只在开头或 ' - ' 之后认，不在词中间认", () => {
  // 这是有意的：避免标题里恰好含 BV 号的片段被误认
  assert.equal(core.identifiersFromDirectoryName("标题BV1xx411c7mD").size, 0);
  assert.equal(core.identifiersFromDirectoryName("BV1xx411c7mD").size, 1); // 整串就是 BV 号则算
});

test("identifiersFromDirectoryName 对垃圾输入返回空集合而不是抛错", () => {
  assert.equal(core.identifiersFromDirectoryName("").size, 0);
  assert.equal(core.identifiersFromDirectoryName(null).size, 0);
  assert.equal(core.identifiersFromDirectoryName("视频1").size, 0);
});

/* ───────────────────────── 「已下载」判据 ─────────────────────────
   4.8.2 在这里出过真 bug：判据被写了两份，切页面时跑的是没改的那份。 */

test("downloadMatchIsDownloaded：媒体文件或手动标记，二者之一即可", () => {
  assert.equal(core.downloadMatchIsDownloaded({ hasMedia: true }), true);
  assert.equal(core.downloadMatchIsDownloaded({ marked: true }), true);
  assert.equal(core.downloadMatchIsDownloaded({ hasMedia: true, marked: false }), true);
});

test("downloadMatchIsDownloaded：只有封面/字幕/信息文件不算已下载", () => {
  // hasFiles 表示「目录里有文件」，可能是封面、弹幕、字幕 —— 不能当已下载
  assert.equal(core.downloadMatchIsDownloaded({ hasFiles: true }), false);
  assert.equal(core.downloadMatchIsDownloaded({ hasFiles: true, hasMedia: false, marked: false }), false);
});

test("downloadMatchIsDownloaded：空值一律 false", () => {
  assert.equal(core.downloadMatchIsDownloaded({}), false);
  assert.equal(core.downloadMatchIsDownloaded(null), false);
  assert.equal(core.downloadMatchIsDownloaded(undefined), false);
});

test("downloadStateFromIndex：index 不是 Map 时保留旧状态（下载目录读不到 ≠ 空了）", () => {
  const previous = {
    downloaded: true, hasDownloadFiles: true,
    downloadDirectoryName: "老的", downloadCollectionName: "收藏夹",
    downloadDirectoryHandle: { fake: true }
  };
  for (const bad of [null, undefined, "x", 1, {}]) {
    const state = core.downloadStateFromIndex("收藏夹", new Set(), bad, previous);
    assert.equal(state.downloaded, true, `index=${String(bad)} 时应保留旧状态`);
    assert.equal(state.name, "老的");
    assert.equal(state.handle, previous.downloadDirectoryHandle);
  }
});

test("downloadStateFromIndex：空 Map 表示确实没有下载文件，状态要清掉", () => {
  const state = core.downloadStateFromIndex("收藏夹", new Set(["bvid:BV1xx411c7mD"]), new Map(), { downloaded: true });
  assert.equal(state.downloaded, false);
  assert.equal(state.name, "");
  assert.equal(state.handle, null);
});

test("downloadStateFromIndex：命中同一收藏夹的记录", () => {
  const index = new Map();
  index.set(core.downloadIndexKey("收藏夹", "bvid:BV1xx411c7mD"), {
    hasMedia: true, hasFiles: true, name: "视频目录", collectionName: "收藏夹", handle: "H"
  });
  const state = core.downloadStateFromIndex("收藏夹", new Set(["bvid:BV1xx411c7mD"]), index);
  assert.equal(state.downloaded, true);
  assert.equal(state.name, "视频目录");
  assert.equal(state.handle, "H");
});

test("findDownloadMatch：先找同收藏夹，再退回 legacy（3.5 时代写在未分类收藏）", () => {
  const index = new Map();
  index.set("legacy\u0000bvid:BV1xx411c7mD", { name: "旧的" });
  assert.equal(core.findDownloadMatch("收藏夹", ["bvid:BV1xx411c7mD"], index).name, "旧的");

  index.set(core.downloadIndexKey("收藏夹", "bvid:BV1xx411c7mD"), { name: "新的" });
  assert.equal(core.findDownloadMatch("收藏夹", ["bvid:BV1xx411c7mD"], index).name, "新的", "同收藏夹优先于 legacy");
});

/* ───────────────────────── 媒体文件判定 ───────────────────────── */

test("isMediaFileName 只认媒体扩展名", () => {
  for (const name of ["a.mp4", "a.MP4", "a.mkv", "a.webm", "a.m4s", "a.flv", "a.mov", "a.avi"]) {
    assert.equal(core.isMediaFileName(name), true, `${name} 应算媒体文件`);
  }
  for (const name of ["封面.png", "封面.webp", "视频信息.txt", "请将视频放到这里.txt", "a.jpg", "noext", ""]) {
    assert.equal(core.isMediaFileName(name), false, `${name} 不该算媒体文件`);
  }
});

/* ───────────────────────── 路径拼接 ───────────────────────── */

test("downloadPathLabel 用反斜杠拼，并去掉两端的斜杠", () => {
  assert.equal(core.downloadPathLabel("收藏夹", "视频目录"), "收藏夹\\视频目录");
  assert.equal(core.downloadPathLabel("/收藏夹/", "\\视频目录\\"), "收藏夹\\视频目录");
  assert.equal(core.downloadPathLabel("收藏夹", ""), "收藏夹");
  assert.equal(core.downloadPathLabel("", ""), "");
});

test("joinDownloadPath：基路径去尾斜杠，空了就退回相对路径", () => {
  assert.equal(core.joinDownloadPath("C:\\base", "收藏夹", "视频"), "C:\\base\\收藏夹\\视频");
  assert.equal(core.joinDownloadPath("C:\\base\\", "收藏夹", "视频"), "C:\\base\\收藏夹\\视频");
  assert.equal(core.joinDownloadPath("", "收藏夹", "视频"), "收藏夹\\视频");
  assert.equal(core.joinDownloadPath("C:\\base", "", ""), "C:\\base");
});

/* ───────────────────────── 占位值 ───────────────────────── */

test("isPlaceholderValue 认得所有占位写法", () => {
  for (const value of ["", "无", "未知", "-", "--", "—", "暂无", "/", "N/A", "n/a", "null", "undefined"]) {
    assert.equal(core.isPlaceholderValue(value), true, `${JSON.stringify(value)} 应算占位`);
  }
  for (const value of ["真的内容", "0", "0播放", "未知视频标题吗", "a-b"]) {
    assert.equal(core.isPlaceholderValue(value), false, `${JSON.stringify(value)} 不该算占位`);
  }
});

test("isPlaceholderValue 会先 trim", () => {
  assert.equal(core.isPlaceholderValue("  未知  "), true);
  assert.equal(core.isPlaceholderValue("\t-\n"), true);
});

/* ───────────────────────── parseInfoFile ───────────────────────── */

const SAMPLE = [
  "\uFEFF【基本信息】",
  "视频收藏时间：2026年10月09日 01时19分50秒.175",
  "视频标题：示例标题",
  "视频链接：https://www.bilibili.com/video/BV1xx411c7mD/",
  "视频状态：正常",
  "",
  "【UP主】",
  "UP主昵称：某人",
  "UP主UID：12345",
  "",
  "【互动数据】",
  "播放量：1000",
  "弹幕量：20",
  "",
  "【标签】",
  "标签一、标签二,标签三，标签四",
  "",
  "【视频简介】",
  "第一行简介",
  "第二行简介"
].join("\r\n");

test("parseInfoFile 解析字段、去掉 BOM、容忍 CRLF", () => {
  const info = core.parseInfoFile(SAMPLE);
  assert.equal(info.fields["视频标题"], "示例标题");
  assert.equal(info.fields["视频状态"], "正常");
  assert.equal(info.fields["UP主UID"], "12345");
  assert.equal(info.fields["播放量"], "1000");
});

test("parseInfoFile 的标签按中英文顿号/逗号拆开", () => {
  const info = core.parseInfoFile(SAMPLE);
  assert.deepEqual(info.sections["标签"], ["标签一", "标签二", "标签三", "标签四"]);
});

test("parseInfoFile 的简介保留原始多行", () => {
  const info = core.parseInfoFile(SAMPLE);
  assert.deepEqual(info.sections["视频简介"], ["第一行简介", "第二行简介"]);
});

test("parseInfoFile 保留 raw 原文", () => {
  const info = core.parseInfoFile(SAMPLE);
  assert.equal(info.raw, SAMPLE);
});

test("parseInfoFile 对空输入不抛错", () => {
  const info = core.parseInfoFile("");
  assert.deepEqual(info.fields, {});
  assert.equal(core.descriptionFromInfo(info), "");
  assert.deepEqual(core.tagsFromInfo(info), []);
});

test("descriptionFromInfo：整段都是占位符才算空", () => {
  assert.equal(core.descriptionFromInfo(core.parseInfoFile("【视频简介】\n-")), "");
  assert.equal(core.descriptionFromInfo(core.parseInfoFile("【视频简介】\n未知")), "");
  // 正文里出现破折号是正常简介，不能误伤（4.1 的修复点）
  assert.equal(core.descriptionFromInfo(core.parseInfoFile("【视频简介】\n这是标题 - 副标题")), "这是标题 - 副标题");
});

test("tagsFromInfo 过滤掉占位标签", () => {
  const info = core.parseInfoFile("【标签】\n未知、真实标签");
  assert.deepEqual(core.tagsFromInfo(info), ["真实标签"]);
});

/* ───────────────────────── pageSequence ───────────────────────── */

test("pageSequence：总数 ≤ 7 时全部列出", () => {
  assert.deepEqual(core.pageSequence(1, 1), [1]);
  assert.deepEqual(core.pageSequence(3, 7), [1, 2, 3, 4, 5, 6, 7]);
});

test("pageSequence：总数非法时返回空数组", () => {
  assert.deepEqual(core.pageSequence(1, 0), []);
  assert.deepEqual(core.pageSequence(1, -5), []);
  assert.deepEqual(core.pageSequence(1, NaN), []);
  assert.deepEqual(core.pageSequence(1, Infinity), []);
});

test("pageSequence：中间页首尾各留一段，用 gap 表示省略", () => {
  assert.deepEqual(core.pageSequence(10, 20), [1, "gap", 9, 10, 11, "gap", 20]);
});

test("pageSequence：靠近开头时多列几页", () => {
  assert.deepEqual(core.pageSequence(1, 20), [1, 2, 3, 4, "gap", 20]);
  assert.deepEqual(core.pageSequence(3, 20), [1, 2, 3, 4, "gap", 20]);
});

test("pageSequence：靠近结尾时多列几页", () => {
  assert.deepEqual(core.pageSequence(20, 20), [1, "gap", 17, 18, 19, 20]);
});

test("pageSequence：输出永远落在 1..total 内且严格递增", () => {
  for (const total of [8, 15, 20, 99]) {
    for (let current = 1; current <= total; current += 1) {
      const pages = core.pageSequence(current, total).filter((x) => x !== "gap");
      assert.ok(pages.every((p) => p >= 1 && p <= total), `total=${total} current=${current} 越界`);
      assert.deepEqual(pages, [...pages].sort((a, b) => a - b), `total=${total} current=${current} 未排序`);
      assert.equal(new Set(pages).size, pages.length, `total=${total} current=${current} 有重复`);
      assert.ok(pages.includes(current), `total=${total} current=${current} 没包含当前页`);
    }
  }
});

/* ───────────────────────── 分享文案拆分 ───────────────────────── */

const SHARE = "真正的简介内容, 视频播放量 71953、弹幕量 82、点赞数 642、投硬币枚数 172、收藏人数 269、转发人数 10, 视频作者 某人, 作者简介 xxx, 相关视频：yyy";

test("splitShareText：把统计信息从句子里切出去", () => {
  const result = core.splitShareText(SHARE);
  assert.equal(result.isShareText, true);
  assert.equal(result.description, "真正的简介内容");
});

test("splitShareText：普通简介原样返回", () => {
  const result = core.splitShareText("就是一段普通简介");
  assert.equal(result.isShareText, false);
  assert.equal(result.description, "就是一段普通简介");
});

test("parseShareStats：六个数值都取到（字符串形式，不丢精度）", () => {
  const stats = core.parseShareStats(SHARE);
  assert.deepEqual(stats, { view: "71953", danmaku: "82", like: "642", coin: "172", favorite: "269", share: "10" });
});

test("parseShareStats：没有的字段不编造", () => {
  assert.deepEqual(core.parseShareStats("视频播放量 100"), { view: "100" });
  assert.deepEqual(core.parseShareStats(""), {});
});

/* ───────────────────────── patchVolatileFields ─────────────────────────
   全项目最该被真测的函数：它直接改写用户的 视频信息.txt。 */

const ARCHIVE = [
  "【基本信息】",
  "视频收藏时间：2026年10月09日 01时19分50秒.175",
  "视频标题：不该被动到的标题",
  "视频链接：https://www.bilibili.com/video/BV1xx411c7mD/",
  "视频状态：正常",
  "分区：未知",
  "视频发布时间：未知",
  "",
  "【UP主】",
  "UP主昵称：某人",
  "UP主UID：12345",
  "UP主主页：https://space.bilibili.com/12345",
  "",
  "【互动数据】",
  "播放量：1",
  "弹幕量：2",
  "点赞数：3",
  "投硬币枚数：4",
  "收藏人数：5",
  "转发人数：6",
  "",
  "【标签】",
  "标签一、标签二",
  "",
  "【视频简介】",
  "简介第一行",
  "简介第二行"
].join("\n");

test("patchVolatileFields：只改该改的，其余逐字不动", () => {
  const out = core.patchVolatileFields(ARCHIVE, { upFans: 999, stats: { view: "111", danmaku: "222" } });
  assert.ok(out.includes("UP主粉丝数：999"), "应补上粉丝数");
  assert.ok(out.includes("播放量：111"), "播放量应更新");
  assert.ok(out.includes("弹幕量：222"), "弹幕量应更新");
  // 这些必须一字不变
  for (const keep of ["视频标题：不该被动到的标题", "UP主UID：12345", "标签一、标签二", "简介第一行", "简介第二行", "视频状态：正常"]) {
    assert.ok(out.includes(keep), `被误改了：${keep}`);
  }
});

test("patchVolatileFields：粉丝数补在 UID 之后，不是文件末尾", () => {
  const out = core.patchVolatileFields(ARCHIVE, { upFans: 999 });
  const lines = out.split("\n");
  assert.equal(lines[lines.findIndex((l) => l.startsWith("UP主UID：")) + 1], "UP主粉丝数：999");
});

test("patchVolatileFields：发布时间只补空缺，已有值不动", () => {
  const filled = core.patchVolatileFields(ARCHIVE, { pubdateText: "2026-08-14 06:00:00 星期五" });
  assert.ok(filled.includes("视频发布时间：2026-08-14 06:00:00 星期五"));

  const already = ARCHIVE.replace("视频发布时间：未知", "视频发布时间：2020-01-01 00:00:00 星期三");
  const kept = core.patchVolatileFields(already, { pubdateText: "2026-08-14 06:00:00 星期五" });
  assert.ok(kept.includes("视频发布时间：2020-01-01 00:00:00 星期三"), "已有发布时间不该被覆盖");
});

test("patchVolatileFields：占位值不当成数据写进去", () => {
  const out = core.patchVolatileFields(ARCHIVE, { upFans: "未知", stats: { view: "-" } });
  assert.ok(!out.includes("UP主粉丝数：未知"), "占位粉丝数不该写");
  assert.ok(out.includes("播放量：未知"), "互动数据里的占位要写成「未知」而不是「-」");
});

test("patchVolatileFields：CRLF 进来就 CRLF 出去", () => {
  const crlf = ARCHIVE.replace(/\n/g, "\r\n");
  const out = core.patchVolatileFields(crlf, { upFans: 999 });
  assert.ok(out.includes("\r\n"), "应保留 CRLF");
  // 把 CRLF 全去掉之后不该还剩任何 \n —— 剩下的就是裸 LF
  assert.equal(out.replace(/\r\n/g, "").includes("\n"), false, "输出里不该有裸 LF");
  // 只比原文多一行（补上的「UP主粉丝数」）
  assert.equal(out.split("\r\n").length, crlf.split("\r\n").length + 1);
});

test("patchVolatileFields：LF 进来就 LF 出去（不要凭空升级成 CRLF）", () => {
  const out = core.patchVolatileFields(ARCHIVE, { upFans: 999 });
  assert.equal(out.includes("\r"), false, "LF 原文不该被写成 CRLF");
});

test("patchVolatileFields：完全没数据时不该改动任何一行", () => {
  const out = core.patchVolatileFields(ARCHIVE, {});
  assert.equal(out, ARCHIVE);
});

test("patchVolatileFields：老档案缺「互动数据」整块时，插在【标签】之前", () => {
  const old = ["【基本信息】", "视频标题：t", "", "【标签】", "a", "", "【视频简介】", "d"].join("\n");
  const out = core.patchVolatileFields(old, { stats: { view: "1" } });
  const lines = out.split("\n");
  assert.ok(lines.includes("【互动数据】"), "应插入互动数据块");
  assert.ok(lines.indexOf("【互动数据】") < lines.indexOf("【标签】"), "应在【标签】之前");
});

test("patchVolatileFields：视频状态能写进去", () => {
  const out = core.patchVolatileFields(ARCHIVE, { videoStatus: "已失效视频（已尝试恢复）" });
  assert.ok(out.includes("视频状态：已失效视频（已尝试恢复）"));
});

test("patchVolatileFields：老档案没有「视频状态」行时补在视频链接之后", () => {
  const old = ["【基本信息】", "视频标题：t", "视频链接：https://x/", "分区：y"].join("\n");
  const out = core.patchVolatileFields(old, { videoStatus: "正常" });
  const lines = out.split("\n");
  assert.equal(lines[lines.findIndex((l) => l.startsWith("视频链接：")) + 1], "视频状态：正常");
});

test("patchVolatileFields：对空输入不抛错", () => {
  assert.equal(core.patchVolatileFields("", { upFans: 1 }), "");
  assert.equal(core.patchVolatileFields(null, {}), "");
});

/* ───────────────────────── withSourceCollection ───────────────────────── */

test("withSourceCollection 带上收藏夹名并清洗", () => {
  const video = core.withSourceCollection({ title: "t" }, { collection: "a/b" });
  assert.equal(video.collection, "a_b");
  assert.equal(video.title, "t");
});

test("withSourceCollection 没有来源收藏夹时用兜底", () => {
  assert.equal(core.withSourceCollection({}, {}).collection, "未分类收藏");
  assert.equal(core.withSourceCollection(null, {}).collection, "未分类收藏");
});

/* ───────────────────────── 汇总 ─────────────────────────
   直接运行时：打印结果并设置退出码。
   被 stability.test.cjs require 时：只把 results 交出去，由那边并进它自己的断言。 */

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
