/*
 * 档案体检：统计本地归档目录里 视频信息.txt 的解析覆盖情况。
 * 用来回答“有多少条归档其实没有标签 / 没有简介”，以及新版解析是否把它们读对了。
 *
 * 用法：
 *   node test/archive-audit.cjs "C:\Users\Maxwell\Desktop\本地收藏夹"
 */
const fs = require("node:fs");
const path = require("node:path");
const core = require("../archive-core.js");

const SKIP_DIRECTORIES = new Set(["001错误报告", "错误报告", "视频下载", "000视频下载", "002回收站"]);

const root = process.argv[2];
if (!root) {
  console.error("用法：node test/archive-audit.cjs <收藏根目录>");
  process.exit(1);
}
if (!fs.existsSync(root)) {
  console.error(`目录不存在：${root}`);
  process.exit(1);
}

const stats = {
  collections: 0,
  records: 0,
  withTags: 0,
  withDescription: 0,
  withBoth: 0,
  withNeither: 0,
  invalid: 0,
  unreadable: 0
};
const emptySamples = [];
const tagHistogram = new Map();

function auditRecord(collectionName, folderName, infoPath) {
  stats.records += 1;
  let text;
  try {
    text = fs.readFileSync(infoPath, "utf8");
  } catch (_) {
    stats.unreadable += 1;
    return;
  }
  const info = core.parseInfoFile(text);
  const tags = core.tagsFromInfo(info);
  const description = core.descriptionFromInfo(info);
  const title = info.fields["视频标题"] || folderName;
  if (/失效/.test(info.fields["视频状态"] || "") || ["已失效视频", "该视频已失效"].includes(title)) stats.invalid += 1;
  if (tags.length) {
    stats.withTags += 1;
    tagHistogram.set(tags.length, (tagHistogram.get(tags.length) || 0) + 1);
  }
  if (description) stats.withDescription += 1;
  if (tags.length && description) stats.withBoth += 1;
  if (!tags.length && !description) {
    stats.withNeither += 1;
    if (emptySamples.length < 6) emptySamples.push(`${collectionName}/${folderName} · ${title}`);
  }
}

for (const collection of fs.readdirSync(root, { withFileTypes: true })) {
  if (!collection.isDirectory() || SKIP_DIRECTORIES.has(collection.name)) continue;
  const collectionPath = path.join(root, collection.name);
  const records = fs.readdirSync(collectionPath, { withFileTypes: true }).filter((entry) => entry.isDirectory);
  if (!records.length) continue;
  stats.collections += 1;
  for (const record of records) auditRecord(collection.name, record.name, path.join(collectionPath, record.name, "视频信息.txt"));
}

const percent = (value) => `${((value / Math.max(1, stats.records)) * 100).toFixed(1)}%`;
console.log(`收藏根目录：${root}`);
console.log(`收藏夹 ${stats.collections} 个，归档记录 ${stats.records} 条\n`);
console.log(`有标签      ${String(stats.withTags).padStart(5)}  ${percent(stats.withTags)}`);
console.log(`有简介      ${String(stats.withDescription).padStart(5)}  ${percent(stats.withDescription)}`);
console.log(`标签+简介都有 ${String(stats.withBoth).padStart(5)}  ${percent(stats.withBoth)}`);
console.log(`两者都没有   ${String(stats.withNeither).padStart(5)}  ${percent(stats.withNeither)}   ← 详情页会显示空状态`);
console.log(`已失效视频   ${String(stats.invalid).padStart(5)}`);
if (stats.unreadable) console.log(`读取失败     ${String(stats.unreadable).padStart(5)}`);
if (tagHistogram.size) {
  const summary = [...tagHistogram.entries()].sort((left, right) => left[0] - right[0]).map(([count, folders]) => `${count} 个标签×${folders}`).join("，");
  console.log(`标签数量分布：${summary}`);
}
if (emptySamples.length) {
  console.log("\n“两者都没有”示例：");
  emptySamples.forEach((sample) => console.log(`  ${sample}`));
}
