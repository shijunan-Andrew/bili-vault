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

test("videoDirectoryLabel 总长度不超过 100 字符、也不超过 200 字节（后缀必须完整）", () => {
  // 1.7.10（P2-2）：原来只卡字符数，中文标题 86 字 = 258 字节，越过 NTFS 的
  // 255 字节分量上限。现在两个上限取严的那个。
  const long = core.videoDirectoryLabel({ bvid: "BV1xx411c7mD", title: "标".repeat(300) });
  assert.ok(long.length <= 100, `字符数 ${long.length} 应 ≤ 100`);
  assert.ok(Buffer.byteLength(long, "utf8") <= 200, `字节数 ${Buffer.byteLength(long, "utf8")} 应 ≤ 200`);
  assert.ok(long.endsWith(" - BV1xx411c7mD"), "后缀必须完整保留");
  const ascii = core.videoDirectoryLabel({ bvid: "BV1xx411c7mD", title: "x".repeat(300) });
  assert.equal(ascii.length, 100, "纯 ASCII 走字符上限，行为与以前一致");
});

test("safeName / safeSegment 的 200 字节闸：中文按码点截，emoji 不切半个（1.7.10 P2-2）", () => {
  assert.equal(core.safeName("x".repeat(200)).length, 100, "ASCII 仍是 100 字符上限");
  const chinese = core.safeName("标".repeat(200));
  assert.equal(Buffer.byteLength(chinese, "utf8"), 198, "66 个汉字 = 198 字节，再放一个就 201");
  assert.equal(chinese.length, 66);
  const emoji = core.safeName("😀".repeat(100));
  assert.equal(Buffer.byteLength(emoji, "utf8"), 200, "50 个 emoji = 200 字节");
  assert.equal(emoji.length, 100, "50 个 emoji = 100 个 UTF-16 码元");
  assert.equal([...emoji].length, 50, "按码点数是 50 个完整的 emoji，没有半个代理对");
  const collection = core.safeCollectionName("夹".repeat(200));
  assert.ok(Buffer.byteLength(collection, "utf8") <= 200, "收藏夹名同样受字节闸约束");
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

/* 1.7.11（facet-security P2-1）：视频标题 / 简介 / 标签 / UP 名都是页面可控文本，
   上传者能往自己视频的简介里塞任意多行。归档文件里摘要是排在字段段之后的自由文本，
   所以「简介里写一行 视频链接：https://evil.example」曾经能覆盖真实链接 —— 详情页的
   「在 B 站打开视频」就会跳到别人站点。下面三种写法现在都必须无效。 */
test("简介里的换行注入不了字段（1.7.11 security P2-1）", () => {
  const injected = [
    "【基本信息】",
    "视频标题：真实标题",
    "视频链接：https://www.bilibili.com/video/BV1xx411c7mD",
    "BV号：BV1xx411c7mD",
    "",
    "【UP主】",
    "UP主昵称：真实UP",
    "UP主UID：12345",
    "UP主主页：https://space.bilibili.com/12345",
    "",
    "【互动数据】",
    "播放量：1000",
    "",
    "【标签】",
    "标签一",
    "",
    "【视频简介】",
    "正常的第一行",
    "视频链接：https://evil.example",
    "UP主主页：https://evil.example",
    "播放量：999999",
    "【基本信息】",
    "视频状态：已失效",
    "失效原因：被注入的原因",
    ""
  ].join("\n");
  const info = core.parseInfoFile(injected);
  assert.equal(info.fields["视频链接"], "https://www.bilibili.com/video/BV1xx411c7mD",
    "真实链接在最前，后出现的行不许覆盖它");
  assert.equal(info.fields["UP主主页"], "https://space.bilibili.com/12345",
    "UP 主主页同理");
  assert.equal(info.fields["播放量"], "1000", "互动数据不许被简介里的同名行改写");
  assert.equal(info.fields["视频状态"], undefined,
    "进过内容段之后不许再重开字段段，否则能凭空塞进本来没有的键");
  assert.equal(info.fields["失效原因"], undefined, "同上");
  assert.deepEqual(info.sections["视频简介"], ["正常的第一行", "视频链接：https://evil.example", "UP主主页：https://evil.example", "播放量：999999"],
    "注入的那几行还是简介正文，只是不再被当成字段");
});

test("同一个键在同一个段里出现两次时保留第一次（1.7.11 security P2-1）", () => {
  const info = core.parseInfoFile("【基本信息】\n视频标题：真标题\n简介残留\n视频标题：假标题\n");
  assert.equal(info.fields["视频标题"], "真标题");
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

/* ───────────── 1.7.17：配置文件的形状与「个人内容」判断（facet-privacy P1-2）─────────────
   导出侧要靠它列「里面有什么」，导入侧要靠它决定要不要二次确认 ——
   两处用的是同一份实现，所以这里真跑一遍，而不是断言「源码里有这行字」。 */

const samplePreferences = (overrides = {}) => Object.assign({
  theme: "dark",
  locale: "en",
  pageSize: 60,
  viewMode: "grid",
  collectionOrder: ["动画", "音乐"],
  filters: { search: "某科室", videoFilter: "downloaded", upFilter: "UP1", tagFilter: "", sort: "views" }
}, overrides);

test("buildConfigPayload：完整导出带收藏夹顺序与筛选，并标记含个人内容", () => {
  const payload = core.buildConfigPayload(samplePreferences());
  assert.equal(payload.app, core.CONFIG_APP_ID);
  assert.equal(payload.version, core.CONFIG_VERSION);
  assert.equal(payload._containsPersonalData, true);
  assert.deepEqual(payload.preferences.collectionOrder, ["动画", "音乐"]);
  assert.equal(payload.preferences.filters.search, "某科室");
  assert.equal(payload.preferences.theme, "dark");
});

test("buildConfigPayload：includePersonal=false 时只剩外观与档位", () => {
  const payload = core.buildConfigPayload(samplePreferences(), { includePersonal: false });
  assert.equal(payload._containsPersonalData, false);
  assert.equal(payload.preferences.collectionOrder, undefined);
  assert.equal(payload.preferences.filters, undefined);
  assert.deepEqual(Object.keys(payload.preferences).sort(), ["locale", "pageSize", "theme", "viewMode"]);
});

test("buildConfigPayload：坏输入不会让导出炸掉，坏值退回默认", () => {
  const payload = core.buildConfigPayload({ theme: 42, pageSize: "大", collectionOrder: "不是数组", filters: null });
  assert.equal(payload.preferences.theme, "system");
  assert.equal(payload.preferences.locale, "zh-CN");
  assert.deepEqual(payload.preferences.collectionOrder, []);
  assert.equal(payload.preferences.filters.search, "");
  assert.equal(payload.preferences.filters.upFilter, "all");
  assert.deepEqual(core.configPersonalFields(payload), { collections: 0, search: "", upFilter: "", tagFilter: "" });
});

test("configPersonalFields：逐项报数，空项不报", () => {
  const fields = core.configPersonalFields(core.buildConfigPayload(samplePreferences()));
  assert.equal(fields.collections, 2);
  assert.equal(fields.search, "某科室");
  assert.equal(fields.upFilter, "UP1");
  assert.equal(fields.tagFilter, "");
  const slim = core.configPersonalFields(core.buildConfigPayload(samplePreferences(), { includePersonal: false }));
  assert.deepEqual(slim, { collections: 0, search: "", upFilter: "", tagFilter: "" });
});

test("configHasPersonalData：认标记，也认实际内容（旧文件没有标记）", () => {
  assert.equal(core.configHasPersonalData(core.buildConfigPayload(samplePreferences())), true);
  assert.equal(core.configHasPersonalData(core.buildConfigPayload(samplePreferences(), { includePersonal: false })), false);
  // 1.7.17 之前导出的文件没有 _containsPersonalData，只能看内容
  const legacy = { app: core.CONFIG_APP_ID, version: 1, preferences: { theme: "dark", collectionOrder: ["老收藏夹"] } };
  assert.equal(core.configHasPersonalData(legacy), true);
  assert.equal(core.configHasPersonalData({ preferences: { theme: "dark" } }), false);
  assert.equal(core.configHasPersonalData(null), false);
});

test("normalizeConfigPreferences：收藏夹顺序条数与单条长度都封顶", () => {
  const long = "收".repeat(400);
  const many = Array.from({ length: 600 }, (_value, index) => `夹${index}`);
  const prefs = core.normalizeConfigPreferences({ collectionOrder: [...many, long, 42] });
  assert.equal(prefs.collectionOrder.length, 500, "条数封顶 500");
  assert.equal(prefs.collectionOrder[499], "夹499");
  assert.equal(prefs.collectionOrder.includes(long), false, "第 601 条是超长串，被条数闸砍掉");
  const single = core.normalizeConfigPreferences({ collectionOrder: [long, "短的"] });
  assert.equal(single.collectionOrder[0].length, 120, "单条也要封顶");
  assert.equal(single.collectionOrder[1], "短的", "没超长的原样保留");
  assert.equal(single.collectionOrder[0].startsWith("收"), true, "截断保留前缀");
  assert.equal(core.normalizeConfigPreferences({ filters: { search: "x".repeat(400) } }).filters.search.length, 120);
});

/* ───────────────────────── 汇总 ─────────────────────────
   直接运行时：打印结果并设置退出码。
   被 stability.test.cjs require 时：只把 results 交出去，由那边并进它自己的断言。 */

/* ────────────────── 路径预算（1.7.24 / facet-compat §3.2） ──────────────────
   Windows 的经典路径上限是 260 个字符，FSA 又拿不到「\\?\」长路径前缀。
   这里钉住的是「两段共用一个预算」的算法与度量，不是文案。 */

test("两段共用预算：收藏夹名越长，视频目录段收得越短（1.7.24）", () => {
  assert.equal(core.WINDOWS_PATH_LIMIT_CHARS, 260);
  assert.equal(core.PATH_SEGMENT_BUDGET_CHARS, 168);
  assert.equal(core.COLLECTION_NAME_MAX_CHARS, 120, "收藏夹段保持 120：磁盘上已有的名字要能原样读回来");
  assert.equal(core.RECORD_NAME_MAX_CHARS, 100);
  assert.equal(core.recordSegmentMax(""), 100, "不知道收藏夹名时保持原样");
  assert.equal(core.recordSegmentMax("x".repeat(20)), 100, "短收藏夹名不影响标题段");
  assert.equal(core.recordSegmentMax("x".repeat(120)), 47, "168 − 120 − 1");
  assert.equal(core.recordSegmentMax("x".repeat(200)), 24, "再长也不把标题段压没");
});

test("videoDirectoryLabel 传了收藏夹名就按预算收，不传则与以前完全一致（1.7.24）", () => {
  const long = { bvid: "BV1xx411c7mD", title: "x".repeat(300) };
  assert.equal(core.videoDirectoryLabel(long).length, 100);
  assert.equal(core.videoDirectoryLabel(long, 0, { collectionName: "x".repeat(20) }).length, 100);
  const tight = core.videoDirectoryLabel(long, 0, { collectionName: "x".repeat(120) });
  assert.equal(tight.length, 47);
  assert.ok(tight.endsWith(" - BV1xx411c7mD"), "BV 后缀是认人的依据，必须完整");
  const chinese = core.videoDirectoryLabel({ bvid: "BV1xx411c7mD", title: "标".repeat(300) }, 0, { collectionName: "x".repeat(120) });
  assert.ok(chinese.length <= 47, `字符数 ${chinese.length}`);
  assert.ok(Buffer.byteLength(chinese, "utf8") <= 200, "字节闸仍然生效");
});

test("pathBudgetReport 量路径长度：知道根目录用真的，不知道就保守估（1.7.24）", () => {
  const assumed = core.pathBudgetReport({ collectionName: "x".repeat(60), recordName: "y".repeat(80) });
  assert.equal(assumed.assumedRoot, true);
  assert.equal(assumed.rootChars, 60);
  assert.equal(assumed.used, 60 + 61 + 81 + 32);
  assert.equal(assumed.ok, true);
  assert.equal(assumed.over, 0);
  assert.equal(core.pathBudgetText(assumed), "", "没超就不出文案");
  const real = core.pathBudgetReport({ rootPath: "C:\\备份", collectionName: "夹", recordName: "视频" });
  assert.equal(real.assumedRoot, false);
  assert.equal(real.rootChars, 5);
  assert.equal(real.used, 5 + 2 + 3 + 32);
  const over = core.pathBudgetReport({ rootPath: "x".repeat(240) });
  assert.equal(over.ok, false);
  assert.equal(over.over, 240 + 32 - 260);
  assert.match(core.pathBudgetText(over), /260/);
  assert.match(core.pathBudgetText(over), /挪到更浅/);
});

test("describeDirectoryCreateError 只认 NotFoundError，且给出可执行的下一步（1.7.24）", () => {
  assert.equal(core.describeDirectoryCreateError({ name: "TypeError" }, "x"), "");
  assert.equal(core.describeDirectoryCreateError(null, "x"), "");
  const text = core.describeDirectoryCreateError({ name: "NotFoundError" }, "小鲸鱼测试");
  assert.match(text, /小鲸鱼测试/, "要把建不出来的名字带出来");
  assert.match(text, /260/);
  assert.match(text, /挪到更浅/);
});

test("按码点截字符：emoji 不许剩下孤立代理（1.7.29 facet-compat §3.4）", () => {
  const loneSurrogate = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
  assert.equal(core.sliceCodePoints("😀😀😀", 2), "😀😀");
  assert.equal(core.sliceCodePoints("abc", 2), "ab");
  assert.equal(core.sliceCodePoints("abc", 99), "abc");
  assert.equal(core.sliceCodePoints("", 5), "");
  assert.equal(core.sliceCodePoints(null, 3), "");
  assert.equal(core.sliceCodePoints("😀", 0), "");
  // 抓的正是这条旧 bug：第 120 个「码元」落在代理对中间
  const splitAt = "a".repeat(119) + "😀";
  assert.equal(loneSurrogate.test(splitAt.slice(0, 120)), true, "旧写法确实会劈开（这条断言的牙就靠它）");
  assert.equal(loneSurrogate.test(core.sliceCodePoints(splitAt, 120)), false, "按码点截不许劈开代理对");
});

test("safeCollectionName / safeName 截出来的名字里不许有孤立代理（1.7.29）", () => {
  const loneSurrogate = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
  const name = "a".repeat(119) + "😀";
  const collection = core.safeCollectionName(name);
  assert.equal(loneSurrogate.test(collection), false, "收藏夹名不许留孤立代理");
  assert.ok(collection.startsWith("a".repeat(119)), "截断不该动前面的字符");
  const record = core.safeName("a".repeat(99) + "😀", "未知");
  assert.equal(loneSurrogate.test(record), false, "safeName 不许留孤立代理");
});

test("videoDirectoryLabel 的标题段不许把 emoji 劈开，BV 后缀要完整（1.7.29）", () => {
  const loneSurrogate = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
  // 后缀 " - BV1xx411c7mD" 是 15 个字符 → 标题段预算 100 - 15 = 85，把 emoji 放在第 85 个码点上
  const label = core.videoDirectoryLabel({ title: "a".repeat(84) + "😀" + "a".repeat(20), bvid: "BV1xx411c7mD" });
  assert.equal(loneSurrogate.test(label), false, "视频目录名不许留孤立代理");
  assert.ok(/ - BV1xx411c7mD$/.test(label), "BV 后缀必须完整保留");
});

test("导出归档元数据：sha256 与已知向量逐字一致（中文与 emoji 按 UTF-8 编码）", () => {
  const crypto = require("node:crypto");
  assert.equal(core.sha256Hex(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  assert.equal(core.sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  for (const text of ["中文", "😀 emoji", "a".repeat(1000), JSON.stringify({ a: 1, b: "中" })]) {
    assert.equal(
      core.sha256Hex(text),
      crypto.createHash("sha256").update(text, "utf8").digest("hex"),
      `sha256 与 node:crypto 对不上：${text.slice(0, 12)}`
    );
  }
});

test("导出载荷：schema 身份、以磁盘为准、stale 只列数据库里多出来的行", () => {
  const payload = core.buildArchiveExportPayload({
    collections: [
      { name: "夹A", videos: [{ collection: "夹A", directory: "标题 - BV1xx411c7mD", title: "标题", bvid: "BV1xx411c7mD", tags: ["t1", 2], stats: { view: "1", danmaku: "" } }] },
      { name: "夹B", videos: [] }
    ],
    database: {
      videos: {
        "bvid:BV1xx411c7mD": { title: "在磁盘上" },
        "title:夹A\u0000旧的": { title: "旧的", collection: "夹A", at: 7 }
      }
    },
    seenKeys: new Set(["bvid:BV1xx411c7mD"]),
    databaseState: "ok",
    generatedAt: "2026-11-02T00:00:00.000Z",
    appVersion: "1.7.30"
  });
  assert.equal(payload.app, "bili-vault/archive-export");
  assert.equal(payload.schemaVersion, 1);
  assert.deepEqual(payload.counts, { collections: 2, records: 1, stale: 1 });
  assert.equal(payload.records[0].collection, "夹A");
  assert.equal(payload.records[0].downloaded, false);
  assert.deepEqual(payload.records[0].tags, ["t1"]);
  assert.deepEqual(Object.keys(payload.records[0].stats), ["view", "danmaku", "like", "coin", "favorite", "share"]);
  assert.equal(payload.stale[0].key, "title:夹A\u0000旧的");
  assert.equal(payload.stale[0].at, 7);
  assert.equal(payload.source.kind, "disk-scan");
  assert.equal(payload.source.databaseState, "ok");
  assert.match(payload.checksumNote, /SHA-256/);
  assert.equal(payload.checksum, undefined, "checksum 是文档层的，不在被打分的载荷里");
});

test("导出文件的校验和能复算；改一个字节就验不过", () => {
  const built = core.buildArchiveExportDocument({
    collections: [{ name: "夹A", videos: [{ collection: "夹A", title: "标题", bvid: "BV1xx411c7mD" }] }],
    generatedAt: "2026-11-02T00:00:00.000Z",
    appVersion: "1.7.30"
  });
  assert.equal(built.checksum.length, 64);
  const parsed = JSON.parse(built.text);
  assert.equal(parsed.checksum.algorithm, "sha256");
  const verified = core.verifyArchiveExportChecksum(parsed);
  assert.equal(verified.ok, true, "原样解析回来必须验得过");
  assert.equal(verified.actual, built.checksum);
  const tampered = JSON.parse(built.text);
  tampered.records[0].title = "改过的";
  const broken = core.verifyArchiveExportChecksum(tampered);
  assert.equal(broken.ok, false, "改过内容必须验不过");
  assert.notEqual(broken.actual, broken.expected);
  assert.equal(core.verifyArchiveExportChecksum({ ...parsed, checksum: { algorithm: "sha256", value: "" } }).ok, false, "空校验和不算过");
});

test("导出文件名带时间戳，004导出 是保留目录", () => {
  assert.equal(core.exportFileName(new Date(2026, 10, 2, 9, 5, 7)), "归档元数据-20261102-090507.json");
  assert.equal(core.EXPORT_DIR_NAME, "004导出");
  assert.equal(core.isReservedCollectionName("004导出"), true, "导出目录必须被认成保留目录");
  assert.equal(core.RESERVED_COLLECTION_NAMES.includes("004导出"), true);
  assert.equal(core.safeCollectionName("004导出"), "004导出", "保留名本身不该被改写");
});

const LIVE_ARCHIVE = [
  "【基本信息】",
  "视频收藏时间：2026年10月16日00时36分14秒 星期五",
  "信息保存于：2026-10-16 00:36:15",
  "所属收藏夹：游戏解说",
  "视频标题：标题",
  "视频链接：https://www.bilibili.com/video/BV1rsJX6vEMo/",
  "视频状态：正常",
  "BV号：BV1rsJX6vEMo",
  "av号：av11312345678",
  "分区：单机游戏",
  "视频时长：05:12",
  "视频发布时间：2026-10-15 20:00:00 星期四",
  "",
  "【UP主】",
  "UP主昵称：狗哥yo",
  "UP主UID：12345678",
  "UP主粉丝数：3456",
  "UP主主页：https://space.bilibili.com/12345678",
  "",
  "【互动数据】",
  "播放量：1000",
  "弹幕量：20",
  "点赞数：30",
  "投硬币枚数：4",
  "收藏人数：5",
  "转发人数：6",
  "",
  "【标签】",
  "漫漫长夜、单机游戏、修改器",
  "",
  "【视频简介】",
  "这是 UP 主自己写的一段简介。",
  ""
].join("\n");

// 资料接口 / 标签接口都失败时，buildInfo 整篇重建出来的样子：简介、标签、发布时间
// 全成了「未知」，【互动数据】整段消失，收藏时间也因为老格式被重排而变了一行。
const DEGRADED_REBUILD = LIVE_ARCHIVE
  .replace("视频收藏时间：2026年10月16日00时36分14秒 星期五", "视频收藏时间：2026年10月16日 00时36分14秒.15")
  .replace("视频发布时间：2026-10-15 20:00:00 星期四", "视频发布时间：未知")
  .replace("分区：单机游戏", "分区：未知")
  .replace("视频时长：05:12", "视频时长：未知")
  .replace("UP主粉丝数：3456", "UP主粉丝数：未知")
  .replace(/【互动数据】[\s\S]*?\n\n/, "")
  .replace("漫漫长夜、单机游戏、修改器", "未知")
  .replace("这是 UP 主自己写的一段简介。", "未知");

/* ───────────────────────── 1.8.3：刷新不许降级 ─────────────────────────
   导入的「更新」链路为把老档案补齐成新格式，一直拿这次抓到的资料整篇重建（buildInfo）。
   资料接口 / 标签接口任一失败，重建结果就是一堆「未知」。mergeInfoText 是写盘前的
   最后一道闸门：新值是占位、原值不是 → 保留原值；其余以新值为准。 */

test("mergeInfoText：接口失败导致的重建不许把已知内容换成「未知」（V1.8.3）", () => {
  const merged = core.mergeInfoText(LIVE_ARCHIVE, DEGRADED_REBUILD);
  for (const keep of [
    "视频发布时间：2026-10-15 20:00:00 星期四",
    "分区：单机游戏",
    "视频时长：05:12",
    "UP主粉丝数：3456",
    "漫漫长夜、单机游戏、修改器",
    "这是 UP 主自己写的一段简介。",
    "播放量：1000",
    "【互动数据】"
  ]) {
    assert.ok(merged.includes(keep), `被降级成占位了：${keep}`);
  }
  assert.equal(merged.includes("视频发布时间：未知"), false, "发布时间不该被写成未知");
  assert.equal(merged.includes("【视频简介】\n未知"), false, "简介不该被写成未知");
  assert.equal(merged.includes("【标签】\n未知"), false, "标签不该被写成未知");
});

test("mergeInfoText：新值是真数据时以新值为准（真变了就该更新）", () => {
  // 以「这次真的联网抓到了新资料」为底：简介和播放量都是真数据，不该被旧值挡住
  const candidate = LIVE_ARCHIVE
    .replace("这是 UP 主自己写的一段简介。", "UP 主后来改了简介")
    .replace("播放量：1000", "播放量：2000");
  const merged = core.mergeInfoText(LIVE_ARCHIVE, candidate);
  assert.ok(merged.includes("UP 主后来改了简介"), "新简介该写进去");
  assert.ok(merged.includes("播放量：2000"), "新播放量该写进去");
  assert.equal(merged.includes("播放量：1000"), false, "旧播放量该被换掉");
});

test("mergeInfoText：空原文 / 空候选都不抛错，也不编内容", () => {
  assert.equal(core.mergeInfoText("", "x"), "x");
  assert.equal(core.mergeInfoText("x", ""), "x");
  assert.equal(core.mergeInfoText(null, null), "");
});

test("patchVolatileFields：互动数据只改接口真给了的那几项（V1.8.3）", () => {
  const out = core.patchVolatileFields(LIVE_ARCHIVE, { stats: { view: "9999" } });
  assert.ok(out.includes("播放量：9999"), "给了的键要更新");
  for (const keep of ["弹幕量：20", "点赞数：30", "投硬币枚数：4", "收藏人数：5", "转发人数：6"]) {
    assert.ok(out.includes(keep), `没给的键不该被写成未知：${keep}`);
  }
  assert.equal(out.includes("弹幕量：未知"), false, "没给的键不许变成占位");
});

test("archiveCacheCapacity：容量跟着记录数走，小库给足下限、大库有天花板（V1.8.4）", () => {
  // 1.7.7 起上限写死 600 条，而 630 条的库正好落进「顺序扫描 + LRU 逐条淘汰」的抖动：
  // 每插入一条就淘汰掉下一条马上要读的条目，实测命中率 0%（真机复现过）。
  assert.equal(core.archiveCacheCapacity(0), 600, "不知道条数时按下限起步");
  assert.equal(core.archiveCacheCapacity(0), core.ARCHIVE_CACHE_MIN_CAPACITY);
  assert.equal(core.archiveCacheCapacity(630), 630 + 256, "630 条必须装得下");
  assert.equal(core.archiveCacheCapacity(10000), 10256);
  assert.equal(core.archiveCacheCapacity(99999), core.ARCHIVE_CACHE_MAX_CAPACITY, "再大也有天花板");
  assert.equal(core.archiveCacheCapacity(-5), 600, "非法输入退回下限");
  assert.equal(core.archiveCacheCapacity("x"), 600, "非法输入退回下限");
});

test("archiveCacheDropCount：超容量时一次丢一批，不是一条一条丢（V1.8.4）", () => {
  assert.equal(core.archiveCacheDropCount(600), 150, "600 的 25%");
  assert.equal(core.archiveCacheDropCount(886), 222, "886 的 25% 向上取整");
  assert.equal(core.archiveCacheDropCount(1), 1, "至少丢一条");
  assert.equal(core.archiveCacheDropCount(0), 150, "非法容量退回下限的 25%");
});

test("旧策略抖动、新策略不抖：630 条记录在 1.8.4 的容量下第二轮全部命中（V1.8.4）", () => {
  const total = 630;
  // 旧策略：容量固定 600、超了逐条淘汰 —— 第二轮命中 0
  const oldStore = new Map();
  let oldHits = 0;
  for (let pass = 0; pass < 2; pass += 1) {
    for (let index = 0; index < total; index += 1) {
      if (oldStore.has(index)) { oldHits += 1; oldStore.delete(index); oldStore.set(index, true); continue; }
      if (oldStore.size >= 600) oldStore.delete(oldStore.keys().next().value);
      oldStore.set(index, true);
    }
  }
  assert.equal(oldHits, 0, "旧策略第二轮也是 0 命中（这就是那条提示的来历）");
  // 新策略：容量按库大小算 + 扫描期间跟着已读条数长（library.js 的 growing），第二轮全部命中
  let capacity = core.archiveCacheCapacity(0);
  let growing = true;
  const store = new Map();
  const scanOnce = () => {
    let hits = 0;
    for (let index = 0; index < total; index += 1) {
      if (store.has(index)) { hits += 1; store.delete(index); store.set(index, true); continue; }
      if (growing) capacity = core.archiveCacheCapacity(store.size + 1);
      if (store.size >= capacity) {
        for (let drop = 0; drop < core.archiveCacheDropCount(capacity); drop += 1) {
          const oldest = store.keys().next().value;
          if (oldest === undefined) break;
          store.delete(oldest);
        }
      }
      store.set(index, true);
    }
    growing = false;
    capacity = core.archiveCacheCapacity(total);
    return hits;
  };
  scanOnce();
  assert.equal(scanOnce(), total, "第二轮应该全部复用缓存");
});


test("exportPruneList：004导出 只留最近 5 份，认不出的文件一个不碰（1.8.8）", () => {
  assert.equal(core.EXPORT_KEEP_FILES, 5, "保留份数只在这一处定义");
  const names = [
    "归档元数据-20260101-090000.json",
    "归档元数据-20260102-090000.json",
    "归档元数据-20260103-090000.json",
    "归档元数据-20260104-090000.json",
    "归档元数据-20260105-090000.json",
    "归档元数据-20260106-090000.json",
    "归档元数据-20260107-090000.json",
    "说明.txt",
    "别的.json"
  ];
  const pruned = core.exportPruneList(names);
  assert.equal(pruned.length, 2, "7 份导出只删最老的 2 份");
  assert.deepEqual(pruned, ["归档元数据-20260101-090000.json", "归档元数据-20260102-090000.json"], "删的是最老的两份");
  assert.equal(pruned.includes("说明.txt"), false, "不认识的文件不许删");
  assert.equal(pruned.includes("别的.json"), false, "别处的 json 也不许删");
  assert.deepEqual(core.exportPruneList(names.slice(0, 3)), [], "不到 5 份就一份都不删");
  assert.deepEqual(core.exportPruneList([], 5), []);
  assert.equal(core.exportPruneList(names, 1).length, 6, "keep 参数可调");
  // 同一秒撞名加 -2 的也认：它比本体旧，先删它。
  const sameSecond = ["归档元数据-20260101-090000.json", "归档元数据-20260101-090000-2.json", "归档元数据-20260102-090000.json"];
  assert.equal(core.exportPruneList(sameSecond, 2).length, 1, "撞名的那份也算一份");
  assert.deepEqual(core.exportPruneList(sameSecond, 2), ["归档元数据-20260101-090000.json"], "先删更老的那一份");
});

test("导出裁剪的函数都在 archive-core 的导出清单里（1.8.8；1.9.0 移除了封面转换）", () => {
  for (const name of ["EXPORT_KEEP_FILES", "exportPruneList"]) {
    assert.ok(name in core, name + " 要从 archive-core 导出");
  }
});

test("thumbnailEligible / thumbnailFit / thumbnailKey：缩略图的判断只有一处（1.10.2，P2-11）", () => {
  const core = BcaArchiveCore;
  // 太小的封面不缩（缩了更糊），阈值 160 KB。
  assert.equal(core.thumbnailEligible(159 * 1024), false);
  assert.equal(core.thumbnailEligible(160 * 1024), true);
  assert.equal(core.thumbnailEligible(0), false);
  assert.equal(core.thumbnailEligible(undefined), false);
  // 长边压到 320，比例不变；1920×1080 → 320×180。
  assert.deepEqual(core.thumbnailFit(1920, 1080), { width: 320, height: 180 });
  assert.deepEqual(core.thumbnailFit(1080, 1920), { width: 180, height: 320 });
  // 本来就小就不放大 —— 放大只会更糊，还更占内存。
  assert.deepEqual(core.thumbnailFit(300, 200), { width: 300, height: 200 });
  // 极端比例也不会算出 0 像素；坏输入按 1 处理。
  assert.deepEqual(core.thumbnailFit(4000, 1), { width: 320, height: 1 });
  assert.deepEqual(core.thumbnailFit(0, 0), { width: 1, height: 1 }, "坏输入也要给出至少 1 像素");
  // 键与扫描缓存 / 封面缓存同一套名字。
  assert.equal(core.thumbnailKey(" 小鲸鱼测试 ", " 2025年01月01日00时00分00秒 "), "小鲸鱼测试/2025年01月01日00时00分00秒");
  assert.equal(core.thumbnailKey(undefined, null), "/");
  // 常量也在导出清单里，library.js 不用再写死 320。
  assert.equal(core.THUMBNAIL_MAX_SIDE, 320);
  assert.equal(core.THUMBNAIL_TYPE, "image/webp");
  assert.ok(core.THUMBNAIL_QUALITY > 0 && core.THUMBNAIL_QUALITY < 1);
});
test("巡检：进了 videos 的记录带封面，就不该被算成缺封面（1.10.3）", () => {
  // 真实形状：recordToVideo() 的 cover 恒为空串（句柄在 coverEntry），缺封面只能看 diagnostics。
  const scan = {
    collections: [{
      name: "小鲸鱼测试",
      videos: [
        { directory: "d1", cover: "", description: "有简介", stats: { view: "100" } },
        { directory: "d2", cover: "", description: "", stats: { view: "200" } }
      ]
    }],
    diagnostics: { missingText: [], missingCover: [], brokenText: [], tempFiles: [] }
  };
  const summary = core.integritySummary(scan);
  assert.equal(summary.records, 2);
  assert.equal(summary.missingCover, 0, "有封面的记录不许因为 cover 是空串就被算成缺封面");
  assert.deepEqual(summary.missingCoverLabels, []);
  assert.equal(summary.missingDescription, 1, "缺简介仍按简介字段判");
  assert.equal(summary.attention, 1, "需要看一眼 = 缺简介 1 条");
});

test("巡检：缺封面只认 diagnostics 里那些没进 records 的目录（1.10.3）", () => {
  const scan = {
    collections: [{ name: "甲", videos: [{ directory: "d1", cover: "", description: "有", stats: { view: "1" } }] }],
    diagnostics: {
      missingText: [{ collection: "甲", directory: "空" }],
      missingCover: [{ collection: "甲", directory: "无封面" }],
      brokenText: [],
      tempFiles: []
    }
  };
  const summary = core.integritySummary(scan);
  assert.equal(summary.records, 1, "只有读得出来的记录进 videos");
  assert.equal(summary.missingCover, 1);
  assert.equal(summary.missingText, 1);
  assert.equal(summary.attention, 2, "缺封面 1 + 缺文本 1");
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
