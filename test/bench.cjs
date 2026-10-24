// test/bench.cjs —— 数据层性能基准（手动跑，不进 CI）。
//
//   node test/bench.cjs            默认：N = 1000 / 3000 / 10000，每组跑 3 次取中位数
//   node test/bench.cjs --quick    冒烟：只跑 N = 1000、只跑一次，看脚本能不能通
//   node test/bench.cjs --strict   同上，但任何一项超过「软上界」就以退出码 1 结束（给发版前手动跑用）
//
//
// 为什么要有它：五套单元测试管的是「对不对」，没有一套管「慢不慢」。收藏库一多，最容易
// 写坏的就是复杂度 —— 「每条记录都 Object.keys(整个库)」或者「循环里 findIndex 扫一遍
// 全文」这种写法，300 条时完全看不出来，10000 条时统计页就卡住了。这个脚本是那面镜子。
//
// 它不是门禁：没接进 scripts/check-all.cjs，也不在那五套测试里。不同机器、不同负载下的
// 绝对数字没有可比性，拿它卡门禁只会天天红；它只在「我怀疑某处变慢了」时手动跑一次。
// 要看的不是某一格的绝对值，而是**同一台机器上 N 之间的倍率**。
//
// 依赖：只用 node 内置模块，不 npm install、不编译。数据全部由固定种子的伪随机数生成，
// 不读磁盘、不读系统时钟，「现在」也是写死的 —— 同一台机器跑两遍，数字应当基本一致。
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");

const core = require("../archive-core.js");
const stats = require("../stats-core.js");

const QUICK = process.argv.includes("--quick");
const STRICT = process.argv.includes("--strict");
const NO_LOG = process.argv.includes("--no-log");
const KNOWN_FLAGS = new Set(["--quick", "--strict", "--no-log"]);

// 1.8.8（P3-13）：软上界 —— 不进 CI 的「review 时看得见」的阈值。
// 数字取自 1.8.6 在本机（node 24 · win32）N = 10000 的实测中位数 × 约 1.6~1.7，
// 只用来抓「翻倍」级别的退化（例如快照从 20 ms 变成 45 ms），不是精确预算。
// 同一台机器、同样负载下再跑一遍确认；换机器请整表重新标。
const SOFT_LIMITS_MS = {
  10000: {
    normalize: 14,
    addRecord: 28,
    snapshot: 40,
    series7: 7,
    collectionRows: 9,
    yearly: 7,
    export: 65,
    sha256: 460,
    parse: 6
  }
};
const SIZES = QUICK ? [1000] : [1000, 3000, 10000];
const REPEATS = QUICK ? 1 : 3;
// 视频信息.txt 的解析开销与库大小无关，固定跑 200 篇，算「200 次合计」。
const PARSE_ITERATIONS = 200;
const DAY_MS = 24 * 60 * 60 * 1000;
const SEED = 20240501;
// 写死「现在」：统计页的「今天」「近 7 天」都按它算，跑在 23:59:59 也不会换一天。
const NOW = new Date(2026, 4, 20, 10, 30, 0).getTime();
const APP_VERSION = require("../manifest.json").version;
// 1.8.24（P3-14）：每次跑完把中位数追加到参考区的 bench.md，跨版本看趋势。
// 仍然不是门禁：不接 check-all、不影响退出码；目录不存在会自己建。
const BENCH_LOG = path.resolve(__dirname, "..", "..", "bili_vault_ref", "bench.md");

// 六个收藏夹轮转，和真实用户「几个夹子 + 一个临时囤货」的分布接近。
const COLLECTION_NAMES = [
  "默认收藏夹",
  "前端切图实录",
  "老番补完计划",
  "工具与效率",
  "手书与 MAD",
  "临时囤货"
];

// 标题 / 简介 / 标签的素材池：形状要像真的收藏夹，中文占多数但不是全中文。
const TITLE_PREFIXES = ["【4K 修复】", "【搬运】", "【教程】", "【实况】", "【合集】", "【鬼畜】", "【手书】", "【音乐】"];
const TITLE_STEMS = ["从零手搓一个", "三分钟讲清", "我把压箱底的", "重看", "拆解", "复刻", "重排", "数一数"];
const TITLE_OBJECTS = ["收藏夹渲染管线", "排序算法", "MV3 service worker", "键盘布局", "老番片头", "弹幕池", "本地数据库", "路径长度限制"];
const DESCRIPTION_LINES = [
  "这期把过程完整录了一遍，踩过的坑都放在置顶评论里。",
  "素材来自公开直播，已做二次剪辑，侵权请联系删除。",
  "代码在简介末尾，仅供参考，别直接拿去交作业。",
  "上一期讲的是分镜，这一期接着说配乐。",
  "整理这份资料花了三个周末，希望能帮到后来的人。",
  "原片是 720p，这里只做了缩放，没有补帧。"
];
const TAG_POOL = ["前端", "B站", "教程", "搬运", "二次元", "鬼畜", "手书", "数据库", "性能优化", "MV3", "开源", "备份"];
const UP_NAMES = ["老张", "阿黎", "糯米团子", "半糖去冰", "折腾君", "K酱", "深夜搬砖", "三号机"];

// 更新视频状态时真正会传的那几个字段，形状与 background.js 一致。
const PATCH_OPTIONS = {
  upFans: "888888",
  stats: {
    view: "1234567",
    danmaku: "4321",
    like: "98765",
    coin: "12345",
    favorite: "6789",
    share: "432"
  },
  videoStatus: "正常"
};

// 表格的列：key 对应 runSize() 返回的那一格毫秒数，label 进表头，note 是列名对照。
const COLUMNS = [
  { key: "normalize", label: "归一化", note: "stats.normalizeDatabase（整库归一化 / 重建）" },
  { key: "addRecord", label: "入库", note: "stats.addRecord × N（模拟一次扫描入库）" },
  { key: "snapshot", label: "快照", note: "stats.snapshot（统计页要的那一包）" },
  { key: "series7", label: "近7天", note: "stats.seriesInRange(stats.rangeFor(\"last7\"))" },
  { key: "collectionRows", label: "收藏夹", note: "stats.collectionRows（收藏夹排行榜）" },
  { key: "yearly", label: "年度", note: "stats.yearlySeries（年度序列）" },
  { key: "export", label: "导出", note: "buildArchiveExportPayload + serializeExportPayload" },
  { key: "sha256", label: "sha256", note: "sha256Hex(上一步的 JSON 字符串)" },
  { key: "parse", label: "解析×200", note: "parseInfoFile + patchVolatileFields，200 次合计" }
];

// 当前跑到哪一步（只有抛异常时才被打印出来，用来说明是哪一格炸的）。
let currentStage = "启动";

/* ---------- 小工具 ---------- */

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

// "YYYY-MM-DD HH:mm:ss"，与视频信息.txt 里的「视频收藏时间」同一个形状（本地时间）。
function timeText(time) {
  const date = new Date(time);
  return date.getFullYear() + "-" + pad2(date.getMonth() + 1) + "-" + pad2(date.getDate())
    + " " + pad2(date.getHours()) + ":" + pad2(date.getMinutes()) + ":" + pad2(date.getSeconds());
}

// 固定种子的线性同余（Numerical Recipes 的常数）。不用 Math.random：那样每次跑的数据
// 都不一样，两次之间的差值就分不清是代码变了还是数据变了。
function makeRandom(seed) {
  let state = (seed >>> 0) || 1;
  return function next() {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function pick(rand, list) {
  return list[Math.floor(rand() * list.length) % list.length];
}

// 终端里中文占两格，表格对齐只能按显示宽度算，不能按 String#length 算。
function displayWidth(text) {
  let width = 0;
  for (const char of String(text)) {
    const code = char.codePointAt(0);
    const wide = code >= 0x1100 && (
      code <= 0x115f
      || code === 0x2329
      || code === 0x232a
      || (code >= 0x2e80 && code <= 0xa4cf && code !== 0x303f)
      || (code >= 0xac00 && code <= 0xd7a3)
      || (code >= 0xf900 && code <= 0xfaff)
      || (code >= 0xfe30 && code <= 0xfe6f)
      || (code >= 0xff00 && code <= 0xff60)
      || (code >= 0xffe0 && code <= 0xffe6)
    );
    width += wide ? 2 : 1;
  }
  return width;
}

function padEndDisplay(text, width) {
  const pad = width - displayWidth(text);
  return pad > 0 ? text + " ".repeat(pad) : text;
}

function padStartDisplay(text, width) {
  const pad = width - displayWidth(text);
  return pad > 0 ? " ".repeat(pad) + text : text;
}

function median(values) {
  const sorted = values.slice().sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function measure(fn) {
  const startedAt = performance.now();
  fn();
  return performance.now() - startedAt;
}

function formatMs(ms) {
  if (!Number.isFinite(ms)) return "n/a";
  if (ms >= 1000) return ms.toFixed(1);
  if (ms >= 100) return ms.toFixed(2);
  if (ms >= 1) return ms.toFixed(3);
  return ms.toFixed(4);
}

function formatBytes(bytes) {
  return (bytes / 1024 / 1024).toFixed(2) + " MB";
}

/* ---------- 固定种子的假数据 ---------- */

// BV 号形状必须是 BV + 10 位，否则 stats.videoKey 不认（会退成标题兜底）。
// 后 6 位用下标的 36 进制保证唯一，前 3 位随机，看起来才像真的。
function bvidOf(index, rand) {
  const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  const unique = index.toString(36).toUpperCase().padStart(6, "0");
  let noise = "";
  for (let spot = 0; spot < 3; spot += 1) {
    noise += alphabet[Math.floor(rand() * alphabet.length)];
  }
  return "BV1" + noise + unique;
}

function generateVideos(size) {
  const rand = makeRandom(SEED);
  const videos = [];
  for (let index = 0; index < size; index += 1) {
    const bvid = bvidOf(index, rand);
    // 收藏时间：八成散在近三年，两成压进近一个月 —— 这样「近 7 天」「年度」两列都有真实数据，
    // 而不是一堆空桶。
    const recent = rand() < 0.2;
    const spanDays = recent ? 30 : 1095;
    const at = NOW - Math.floor(rand() * spanDays) * DAY_MS - Math.floor(rand() * 86400) * 1000;
    const collection = COLLECTION_NAMES[index % COLLECTION_NAMES.length];
    const title = pick(rand, TITLE_PREFIXES) + pick(rand, TITLE_STEMS) + pick(rand, TITLE_OBJECTS);
    const tags = [];
    const tagCount = 2 + Math.floor(rand() * 4);
    while (tags.length < tagCount) {
      const tag = pick(rand, TAG_POOL);
      if (!tags.includes(tag)) tags.push(tag);
    }
    const description = rand() < 0.5
      ? pick(rand, DESCRIPTION_LINES)
      : pick(rand, DESCRIPTION_LINES) + pick(rand, DESCRIPTION_LINES);
    const upMid = String(10000000 + Math.floor(rand() * 90000000));
    const video = {
      collection,
      title,
      bvid,
      aid: String(170000000 + index),
      url: "https://www.bilibili.com/video/" + bvid,
      upName: pick(rand, UP_NAMES) + String(index % 97),
      upMid,
      upHome: "https://space.bilibili.com/" + upMid,
      upFans: String(1200 + Math.floor(rand() * 5000000)),
      // 视频信息.txt 里那一行的原文（收藏库扫盘时读到的就是它）
      favoriteAt: timeText(at),
      savedAt: new Date(at).toISOString(),
      timestamp: at,
      duration: pad2(1 + Math.floor(rand() * 59)) + ":" + pad2(Math.floor(rand() * 60)),
      publishDate: timeText(at - (1 + Math.floor(rand() * 200)) * DAY_MS).slice(0, 10),
      isInvalid: false,
      invalidReason: "",
      downloaded: rand() < 0.7,
      tags,
      stats: {
        view: String(1000 + Math.floor(rand() * 900000)),
        danmaku: String(10 + Math.floor(rand() * 9000)),
        like: String(100 + Math.floor(rand() * 90000)),
        coin: String(10 + Math.floor(rand() * 30000)),
        favorite: String(10 + Math.floor(rand() * 20000)),
        share: String(Math.floor(rand() * 5000))
      },
      description,
      directory: ""
    };
    // 目录名走真实实现（标题截断、BV 后缀、字节预算都在里面），别在这里自己拼。
    video.directory = core.videoDirectoryLabel(video, index, { collectionName: collection });
    videos.push(video);
  }
  return videos;
}

// 从生成好的 video 里抽 stats-core 认的那几个字段。at 直接给毫秒，
// 与 favoriteAt 文本是同一个时刻（recordFromVideo 解析出来的也是它）。
function recordsFromVideos(videos) {
  return videos.map((video) => ({
    collection: video.collection,
    title: video.title,
    bvid: video.bvid,
    aid: video.aid,
    at: video.timestamp
  }));
}

// 假装这是从 003database/database.json 里读回来的旧库：字段齐、但 day 有一部分缺，
// normalizeDatabase 得自己按 at 现算 —— 老库升上来就是这个样子。
function buildRawDatabase(records) {
  const database = stats.emptyDatabase(NOW);
  const createdAt = new Date(NOW - 400 * DAY_MS).toISOString();
  database.version = stats.DATABASE_VERSION;
  database.createdAt = createdAt;
  database.firstSeenAt = createdAt;
  database.updatedAt = new Date(NOW - 60 * 1000).toISOString();
  database.videos = {};
  for (const record of records) {
    const key = stats.videoKey(record);
    database.videos[key] = {
      at: record.at,
      day: record.at % 3 === 0 ? "" : stats.localDayKey(record.at),
      collection: record.collection,
      title: record.title,
      bvid: record.bvid,
      aid: record.aid
    };
  }
  database.totals = { savedTotal: records.length };
  return database;
}

// 导出要的是「扫描结果」：按收藏夹分组、组内保持扫描顺序。
function groupByCollection(videos) {
  const groups = new Map();
  for (const video of videos) {
    let group = groups.get(video.collection);
    if (!group) {
      group = { name: video.collection, videos: [] };
      groups.set(video.collection, group);
    }
    group.videos.push(video);
  }
  return Array.from(groups.values());
}

// 一份视频信息.txt 的骨架，段名与字段名都照真实文件来（【基本信息】/【UP主】/【互动数据】
// /【标签】/【视频简介】）。parseInfoFile 的字段白名单就是按这几段走的。
function infoTextOf(video) {
  return [
    "【基本信息】",
    "标题：" + video.title,
    "BV号：" + video.bvid,
    "av号：av" + video.aid,
    "视频链接：" + video.url,
    "视频发布时间：" + video.publishDate + " 12:00:00",
    "视频收藏时间：" + video.favoriteAt,
    "视频状态：正常",
    "",
    "【UP主】",
    "UP主昵称：" + video.upName,
    "UP主UID：" + video.upMid,
    "UP主粉丝数：" + video.upFans,
    "UP主主页：" + video.upHome,
    "",
    "【互动数据】",
    "播放量：" + video.stats.view,
    "弹幕量：" + video.stats.danmaku,
    "点赞数：" + video.stats.like,
    "投硬币枚数：" + video.stats.coin,
    "收藏人数：" + video.stats.favorite,
    "转发人数：" + video.stats.share,
    "",
    "【标签】",
    video.tags.join("、"),
    "",
    "【视频简介】",
    video.description,
    ""
  ].join("\n");
}

/* ---------- 一次完整的测量：N 条记录，十项操作 ---------- */

function runSize(size) {
  // ---- 1. 生成测试数据（不进秒表）----
  currentStage = "N=" + size + " · 生成测试数据";
  const videos = generateVideos(size);
  const records = recordsFromVideos(videos);
  const rawDatabase = buildRawDatabase(records);
  const timings = {};

  // ---- 2. normalizeDatabase：每次打开备份文件夹都要走一遍的整库归一化 ----
  currentStage = "N=" + size + " · normalizeDatabase";
  let normalized = null;
  timings.normalize = measure(() => {
    normalized = stats.normalizeDatabase(rawDatabase, NOW);
  });
  const normalizedCount = normalized && normalized.videos ? Object.keys(normalized.videos).length : 0;
  expect(normalizedCount === size, "normalizeDatabase 之后应有 " + size + " 条，实际 " + normalizedCount + " 条");

  // ---- 3. addRecord：扫一次盘、逐条入库 ----
  currentStage = "N=" + size + " · addRecord";
  const scanned = stats.emptyDatabase(NOW);
  timings.addRecord = measure(() => {
    for (const record of records) stats.addRecord(scanned, record, NOW);
  });
  const scannedCount = Object.keys(scanned.videos).length;
  expect(scannedCount === size, "addRecord × " + size + " 之后应有 " + size + " 条，实际 " + scannedCount + " 条（BV 号撞了？）");

  // ---- 4. snapshot：统计页要的那一包现算汇总 ----
  currentStage = "N=" + size + " · snapshot";
  let snapshot = null;
  timings.snapshot = measure(() => {
    snapshot = stats.snapshot(scanned, NOW);
  });
  expect(snapshot && snapshot.videos === size, "snapshot 报的条数应当是 " + size + "，实际 " + (snapshot && snapshot.videos));

  // ---- 5. seriesInRange：近 7 天的每日柱 ----
  currentStage = "N=" + size + " · seriesInRange(last7)";
  const last7 = stats.rangeFor("last7", NOW);
  let series = [];
  timings.series7 = measure(() => {
    series = stats.seriesInRange(scanned, last7);
  });
  expect(series.length === 7, "近 7 天应当有 7 根柱子，实际 " + series.length + " 根");

  // ---- 6. collectionRows：收藏夹排行榜 ----
  currentStage = "N=" + size + " · collectionRows";
  let collectionRows = [];
  timings.collectionRows = measure(() => {
    collectionRows = stats.collectionRows(scanned, NOW);
  });
  expect(
    collectionRows.length === COLLECTION_NAMES.length,
    "收藏夹排行榜应当有 " + COLLECTION_NAMES.length + " 行，实际 " + collectionRows.length + " 行"
  );

  // ---- 7. yearlySeries：年度时间轴 ----
  currentStage = "N=" + size + " · yearlySeries";
  let yearly = [];
  timings.yearly = measure(() => {
    yearly = stats.yearlySeries(scanned);
  });
  expect(yearly.length >= 1, "年度序列不该是空的");

  // ---- 8. 导出：组装载荷 + 序列化成一整条 JSON ----
  currentStage = "N=" + size + " · 导出（build + serialize）";
  const collections = groupByCollection(videos);
  const seenKeys = new Set(Object.keys(scanned.videos));
  let payload = null;
  let exported = "";
  timings.export = measure(() => {
    payload = core.buildArchiveExportPayload({
      collections,
      database: scanned,
      seenKeys,
      databaseState: "ok",
      generatedAt: new Date(NOW).toISOString(),
      appVersion: APP_VERSION
    });
    exported = core.serializeExportPayload(payload);
  });
  expect(
    payload && payload.counts && payload.counts.records === size,
    "导出应当有 " + size + " 条记录，实际 " + (payload && payload.counts && payload.counts.records)
  );
  expect(payload.counts.stale === 0, "刚扫描完就导出，stale 应当是 0，实际 " + payload.counts.stale);
  const exportedBytes = Buffer.byteLength(exported, "utf8");

  // ---- 9. sha256Hex：给导出文件算校验和（纯 JS 实现，量的是整条字符串）----
  currentStage = "N=" + size + " · sha256Hex";
  let digest = "";
  timings.sha256 = measure(() => {
    digest = core.sha256Hex(exported);
  });
  expect(/^[0-9a-f]{64}$/.test(digest), "sha256Hex 没返回 64 位十六进制：" + digest.slice(0, 16));

  // ---- 10. 视频信息.txt 解析 + 易变字段更新，200 次 ----
  currentStage = "N=" + size + " · parseInfoFile + patchVolatileFields ×200";
  const infoTexts = videos.slice(0, PARSE_ITERATIONS).map((video) => infoTextOf(video));
  expect(infoTexts.length === PARSE_ITERATIONS, "解析样本应当有 " + PARSE_ITERATIONS + " 篇，实际 " + infoTexts.length + " 篇");
  timings.parse = measure(() => {
    for (let index = 0; index < PARSE_ITERATIONS; index += 1) {
      const text = infoTexts[index];
      const info = core.parseInfoFile(text);
      core.patchVolatileFields(text, PATCH_OPTIONS);
      // 顺手确认解析结果不是空的：解析器哪天坏了，这一列会先报错，而不是悄悄量一个空转
      if (!info.fields["标题"]) throw new Error("parseInfoFile 没解出「标题」，第 " + index + " 篇样本有问题");
    }
  });

  return { size, timings, exportedBytes };
}

function runBenchmark() {
  // 先空跑一遍最小的一组，不计入结果：V8 对 Date / Map / 正则这些路径要跑热了才稳定，
  // 不预热的话第一组（N = 1000）总被冷代码拖慢，倍率会假性偏低，读起来像「明显次线性」，
  // 其实是假象。预热也顺带把所有断言先过一遍。
  currentStage = "预热（不计入结果）";
  runSize(SIZES[0]);

  const results = [];
  for (const size of SIZES) {
    const samples = {};
    for (const column of COLUMNS) samples[column.key] = [];
    // 导出体积与 N 成正比，取最后一次的值带出去，给表格下面那行说明用。
    let exportedBytes = 0;
    for (let repeat = 0; repeat < REPEATS; repeat += 1) {
      currentStage = "N=" + size + " 第 " + (repeat + 1) + "/" + REPEATS + " 次";
      const measured = runSize(size);
      for (const column of COLUMNS) samples[column.key].push(measured.timings[column.key]);
      exportedBytes = measured.exportedBytes;
    }
    const timings = {};
    for (const column of COLUMNS) timings[column.key] = median(samples[column.key]);
    results.push({ size, timings, exportedBytes });
  }
  return results;
}

/* ---------- 输出 ---------- */

function printHeader() {
  console.log("");
  console.log("哔哩藏库 · 数据层性能基准（test/bench.cjs）");
  console.log("记录数：N = " + SIZES.join(" / ") + "    每个 N 生成一份全新的样本");
  console.log("本机：node " + process.version + " · " + process.platform);
  console.log("单位：毫秒，越小越好；每组跑 3 次取中位数。");
  if (QUICK) {
    console.log("（--quick 只跑 N = 1000 且只跑一次，数字仅用于确认脚本能跑通，别拿它下结论。）");
  }
  console.log("数据：固定种子 " + SEED + " 的伪随机样本，「现在」写死在 " + timeText(NOW) + "，不读磁盘也不读时钟。");
  console.log("预热：正式测量前先空跑一遍 N = " + SIZES[0] + "（不计入结果），免得第一组被冷代码拖慢。");
}

function formatTable(results) {
  const headerCells = ["N"].concat(COLUMNS.map((column) => column.label));
  const rows = results.map((result) => [String(result.size)].concat(
    COLUMNS.map((column) => formatMs(result.timings[column.key]))
  ));
  const widths = headerCells.map((cell, index) => {
    let width = displayWidth(cell);
    for (const row of rows) width = Math.max(width, displayWidth(row[index]));
    return width + 2;
  });
  const formatRow = (cells) => cells
    .map((cell, index) => padStartDisplay(cell, widths[index]))
    .join("")
    .replace(/\s+$/, "");
  const separator = widths.map((width) => "-".repeat(width - 1) + " ").join("").replace(/\s+$/, "");
  return [formatRow(headerCells), separator].concat(rows.map(formatRow)).join("\n");
}

function printLegend() {
  const labelWidth = COLUMNS.reduce((width, column) => Math.max(width, displayWidth(column.label)), 0);
  console.log("");
  console.log("列名对照（表头 → 实际调用）：");
  for (const column of COLUMNS) {
    console.log("  " + padEndDisplay(column.label, labelWidth) + "  " + column.note);
  }
}

// 用本次的实测数字给一句结论：谁放大得最凶、算不算线性。
function describeScaling(results) {
  if (results.length < 2) {
    return "  本次是单组（--quick），看不出倍率；要看趋势请跑默认模式。";
  }
  const first = results[0];
  const last = results[results.length - 1];
  const factor = last.size / first.size;
  let worst = null;
  for (const column of COLUMNS) {
    const from = first.timings[column.key];
    const to = last.timings[column.key];
    if (!(from > 0) || !(to > 0)) continue;
    const ratio = to / from;
    if (!worst || ratio > worst.ratio) worst = { label: column.label, ratio, from, to };
  }
  if (!worst) return "  没有可比的两组数字。";
  const head = "  本次实测：N 从 " + first.size + " 到 " + last.size + " 放大 " + factor + " 倍，"
    + "放大最多的是「" + worst.label + "」（" + formatMs(worst.from) + " ms → " + formatMs(worst.to) + " ms，"
    + worst.ratio.toFixed(1) + " 倍）";
  if (worst.ratio > factor * 1.5) {
    return head + "，已经明显超过线性的 " + factor + " 倍 —— 先翻那一段实现。";
  }
  return head + "，与线性的 " + factor + " 倍同量级，这次没看到平方项。";
}

function printHints(results) {
  console.log("");
  console.log("怎么看：");
  console.log("1. 归一化 / 入库 / 近7天 / 收藏夹 / 年度 / 导出 / sha256 都是把全库从头走一遍，随 N 线性增长："
    + "N 放大 10 倍、耗时也差不多 10 倍（8~12 倍都算正常），15 倍以上就该回头查实现。");
  console.log("2. 快照那一列常数最大是设计使然 —— 一次 snapshot() 里就调了 entriesOf / bucketByDay / 周 / 月 / 年"
    + "五六遍全库汇总；这里只该看它的倍率，不必嫌它绝对值大。");
  console.log("3. 出现非线性跳变（比如 1000→3000 就涨了 5 倍以上）通常意味着某处写成了 O(n²)："
    + "每条记录都 Object.keys(整个库)、循环里 findIndex 扫全文、或者在循环里 spread 整个数组。");
  console.log("4. 解析×200 跟 N 无关，它量的是 200 篇视频信息.txt（约 20 行中文）的解析 + 改写；"
    + "这一列漂了说明文本变长或正则退化，与收藏库大小无关，也是唯一一项绝对值只有几毫秒的。");
  console.log("5. sha256 是手写的纯 JS 实现（不借 TextEncoder / crypto），几 MB 的导出字符串花几十到几百毫秒属正常；"
    + "要压它得换实现，改调用点没用。");
  console.log("6. " + describeScaling(results).trim());
}

// 1.8.8（P3-13）：拿这次的中位数跟 SOFT_LIMITS_MS 比一遍。默认只警告，--strict 才让退出码变 1。
// 1.8.8（P3-13）：拿这次的中位数跟 SOFT_LIMITS_MS 比一遍。默认只警告，--strict 才让退出码变 1。
function reportSoftLimits(results) {
  const lines = [];
  let exceeded = 0;
  let compared = 0;
  for (const result of results) {
    const limits = SOFT_LIMITS_MS[result.size];
    if (!limits) continue;
    for (const column of COLUMNS) {
      const limit = limits[column.key];
      if (!(limit > 0)) continue;
      const actual = result.timings[column.key];
      if (!(actual > 0)) continue;
      compared += 1;
      if (actual > limit) {
        exceeded += 1;
        lines.push("[!] N=" + result.size + " · " + column.label + " " + formatMs(actual) + " ms 超过软上界 " + limit + " ms");
      }
    }
  }
  console.log("");
  if (!compared) {
    console.log("[软上界] 这次没有跑到 " + Object.keys(SOFT_LIMITS_MS).join(" / ") + " 条记录那一档（--quick 只看一千条），软上界没比对。");
    return 0;
  }
  if (!exceeded) {
    console.log("[软上界] 已比对的 " + compared + " 项都在软上界以内。");
    return 0;
  }
  for (const line of lines) console.log(line);
  console.log("软上界不是门禁：同一台机器、同样负载下再跑一遍确认；确实是这次改动带来的，就回头查那一段实现。");
  if (STRICT) {
    console.log("--strict：有 " + exceeded + " 项超过软上界，退出码按失败处理。");
    process.exitCode = 1;
  }
  return exceeded;
}

function appendTrendLog(results) {
  if (NO_LOG) return "";
  const stamp = new Date().toISOString().replace("T", " ").slice(0, 19);
  const header = "| N | " + COLUMNS.map((column) => column.label).join(" | ") + " |";
  const divider = "| --- |" + COLUMNS.map(() => " --- |").join("");
  const rows = results.map((result) => "| " + result.size + " | " + COLUMNS.map((column) => formatMs(result.timings[column.key])).join(" | ") + " |");
  const block = ["", "### " + APP_VERSION + " | " + stamp + " | node " + process.version + " | " + process.platform, header, divider].concat(rows).concat([""]).join("\n");
  fs.mkdirSync(path.dirname(BENCH_LOG), { recursive: true });
  if (!fs.existsSync(BENCH_LOG)) {
    fs.writeFileSync(BENCH_LOG, ["# 数据层基准趋势（test/bench.cjs 自动追加）", "", "> 不进 CI 门禁；同一台机器上比倍率，跨机器只当参考。", ""].join("\n"), "utf8");
  }
  fs.appendFileSync(BENCH_LOG, block + "\n", "utf8");
  return BENCH_LOG;
}

function main() {
  const unknown = process.argv.slice(2).filter((arg) => !KNOWN_FLAGS.has(arg));
  if (unknown.length) {
    console.error("不认识的参数：" + unknown.join(" ") + "；只支持 --quick（冒烟模式）、--strict（超软上界即失败）与 --no-log（不写趋势文件）。");
    process.exit(1);
  }

  const startedAt = performance.now();
  printHeader();
  console.log("");

  let results;
  try {
    results = runBenchmark();
  } catch (error) {
    console.error("");
    console.error("[基准失败] 在「" + currentStage + "」抛错：" + (error && error.message ? error.message : String(error)));
    console.error("基准不吞异常 —— 上面的错误要么是真 bug，要么是数据造得不像真的，都得先修。");
    throw error;
  }

  console.log(formatTable(results));
  printLegend();
  console.log("");
  console.log("导出字符串体积：" + results.map((result) => result.size + " → " + formatBytes(result.exportedBytes || 0)).join("，")
    + "（sha256 那列量的就是它，所以随体积走）。");
  printHints(results);
  reportSoftLimits(results);
  console.log("");
  console.log("总耗时：" + ((performance.now() - startedAt) / 1000).toFixed(2) + " 秒（含数据生成、重复与取中位数）。");
  const logPath = appendTrendLog(results);
  if (logPath) console.log("趋势已追加：" + logPath + "（--no-log 可跳过）。");
}

main();
