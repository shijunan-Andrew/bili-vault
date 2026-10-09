/*
 * 补全功能的小批量试跑（安全模式）
 *
 * 只做三件事：
 *   1. 只读扫描本地归档，找出缺少标签/简介的记录；
 *   2. 调 B 站接口取资料；
 *   3. 把补全后的内容写到 test/_trial/ 下的一份副本里。
 *
 * **绝不会改写你的原始 视频信息.txt。** 想真正落盘请在扩展里点“补全缺失资料”。
 *
 * 用法：
 *   node test/enrich-trial.cjs "C:\Users\Maxwell\Desktop\本地收藏夹" [条数，默认 3]
 */
const fs = require("node:fs");
const path = require("node:path");
const core = require("../archive-core.js");

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36";
const REQUEST_DELAY_MS = 600;
const SKIP_DIRECTORIES = new Set(["001错误报告", "错误报告", "视频下载", "000视频下载", "002回收站"]);

const root = process.argv[2];
const limit = Math.max(1, Number(process.argv[3]) || 3);
if (!root) {
  console.error('用法：node test/enrich-trial.cjs "C:\\Users\\Maxwell\\Desktop\\本地收藏夹" [条数]');
  process.exit(1);
}
if (!fs.existsSync(root)) {
  console.error(`目录不存在：${root}`);
  process.exit(1);
}

// 复用 background.js 里真正跑在生产环境的那两个文本补丁函数
function loadPatchers() {
  const source = fs.readFileSync(path.join(__dirname, "..", "background.js"), "utf8");
  const names = ["replaceInfoTagLine", "replaceInfoDescription"];
  const bodies = names.map((name) => {
    const match = source.match(new RegExp(`^function ${name}\\([^)]*\\) \\{[\\s\\S]*?^\\}`, "m"));
    if (!match) throw new Error(`background.js 中找不到 ${name}`);
    return match[0];
  });
  return new Function(`${bodies.join("\n\n")}\nreturn { ${names.join(", ")} };`)();
}

const { replaceInfoTagLine, replaceInfoDescription } = loadPatchers();

function collectCandidates() {
  const found = [];
  for (const collection of fs.readdirSync(root, { withFileTypes: true })) {
    if (!collection.isDirectory() || SKIP_DIRECTORIES.has(collection.name)) continue;
    const collectionPath = path.join(root, collection.name);
    for (const record of fs.readdirSync(collectionPath, { withFileTypes: true })) {
      if (!record.isDirectory()) continue;
      const infoPath = path.join(collectionPath, record.name, "视频信息.txt");
      if (!fs.existsSync(infoPath)) continue;
      const text = fs.readFileSync(infoPath, "utf8");
      const info = core.parseInfoFile(text);
      const tags = core.tagsFromInfo(info);
      const description = core.descriptionFromInfo(info);
      const bvid = (info.fields["BV号"] || "").trim();
      if (!/^BV[0-9A-Za-z]{10}$/.test(bvid)) continue;
      if (tags.length && description) continue;
      found.push({ collection: collection.name, directory: record.name, infoPath, text, tags, description, bvid, title: info.fields["视频标题"] || record.name });
    }
  }
  return found;
}

async function apiGet(pathname, params) {
  const url = new URL(pathname, "https://api.bilibili.com");
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Referer: "https://www.bilibili.com/" },
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.code !== 0) throw new Error(payload.message || `错误码 ${payload.code}`);
  return payload.data;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function showSection(label, before, after) {
  const trimmedBefore = (before || "").trim() || "（空）";
  const trimmedAfter = (after || "").trim() || "（空）";
  const same = trimmedBefore === trimmedAfter;
  console.log(`  ${label}`);
  console.log(`    原来：${trimmedBefore.slice(0, 120)}${trimmedBefore.length > 120 ? "…" : ""}`);
  console.log(`    现在：${trimmedAfter.slice(0, 120)}${trimmedAfter.length > 120 ? "…" : ""}${same ? "   ← 没有新数据，保持原样" : ""}`);
}

async function main() {
  const candidates = collectCandidates();
  console.log(`扫描 ${root}`);
  console.log(`缺少标签或简介且带 BV 号的记录：${candidates.length} 条\n`);
  if (!candidates.length) return;

  const targets = candidates.slice(0, limit);
  const trialDir = path.join(__dirname, "_trial");
  fs.rmSync(trialDir, { recursive: true, force: true });
  console.log(`本次试跑 ${targets.length} 条，结果写入 ${trialDir}（原文件不动）\n`);

  let updated = 0;
  let unchanged = 0;
  for (let index = 0; index < targets.length; index += 1) {
    const item = targets[index];
    console.log(`[${index + 1}/${targets.length}] ${item.collection}/${item.directory}`);
    console.log(`  标题：${item.title}   ${item.bvid}`);
    try {
      let nextTagsLine = item.tags.join("、");
      let nextDescription = item.description;
      const needTags = !item.tags.length;
      const needDescription = !item.description;

      if (needDescription) {
        const data = await apiGet("/x/web-interface/view", { bvid: item.bvid });
        const description = String(data?.desc ?? "").trim();
        if (description && !core.isPlaceholderValue(description)) nextDescription = description;
        await sleep(REQUEST_DELAY_MS);
      }
      if (needTags) {
        const tagData = await apiGet("/x/tag/archive/tags", { bvid: item.bvid });
        const tags = [...new Set((Array.isArray(tagData) ? tagData : []).map((tag) => String(tag.tag_name || "").trim()).filter(Boolean))];
        if (tags.length) nextTagsLine = tags.join("、");
        await sleep(REQUEST_DELAY_MS);
      }

      showSection("标签", item.tags.join("、"), nextTagsLine);
      showSection("简介", item.description, nextDescription);

      if (nextTagsLine === item.tags.join("、") && nextDescription === item.description) {
        unchanged += 1;
      } else {
        updated += 1;
      }
      const patched = replaceInfoDescription(replaceInfoTagLine(item.text, nextTagsLine || item.tags.join("、")), nextDescription);
      if (!patched.includes("【基本信息】") || !patched.includes("【视频简介】")) throw new Error("补全结果未通过校验");
      const outPath = path.join(trialDir, item.collection, item.directory, "视频信息.txt");
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, patched, "utf8");
      console.log(`  已写出副本：${path.relative(process.cwd(), outPath)}`);
    } catch (error) {
      console.log(`  失败：${error.message}`);
    }
    console.log("");
  }
  console.log(`试跑结束：有变化 ${updated} 条，无新数据 ${unchanged} 条。原归档文件未做任何改动。`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
