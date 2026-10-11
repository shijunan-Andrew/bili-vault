/*
 * 4.2 导入效果试跑（安全模式）
 *
 * 对本地归档里的几条记录，实际调用 B 站接口，打印 4.2 的导入会抓到的资料。
 * **只读**：不会改写任何文件，也不会写临时副本。
 *
 * 用法：
 *   node test/import-trial.cjs "<你的收藏根目录>" [条数，默认 3]
 */
const fs = require("node:fs");
const path = require("node:path");
const core = require("../archive-core.js");

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36";
const REQUEST_DELAY_MS = 600;
const SKIP_DIRECTORIES = new Set(["001错误报告", "错误报告", "视频下载", "000视频下载", "002回收站"]);
const STAT_LABELS = { view: "播放量", danmaku: "弹幕量", like: "点赞数", coin: "投硬币枚数", favorite: "收藏人数", share: "转发人数" };

const root = process.argv[2];
const limit = Math.max(1, Number(process.argv[3]) || 3);
if (!root) {
  console.error('用法：node test/import-trial.cjs "D:\\path\\to\\收藏根目录" [条数]');
  process.exit(1);
}
if (!fs.existsSync(root)) {
  console.error(`目录不存在：${root}`);
  process.exit(1);
}

function collectRecords() {
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
      const bvid = (info.fields["BV号"] || "").trim();
      if (!/^BV[0-9A-Za-z]{10}$/.test(bvid)) continue;
      const tags = core.tagsFromInfo(info);
      const description = core.descriptionFromInfo(info);
      // 优先挑数据不完整的记录，正好能看出 4.2 补了什么
      const incomplete = !tags.length || !description || !/^UP主粉丝数：/m.test(text) || !/【互动数据】/.test(text);
      found.push({
        collection: collection.name,
        directory: record.name,
        bvid,
        tags,
        description,
        pubdate: (info.fields["视频发布时间"] || "").trim(),
        upName: (info.fields["UP主昵称"] || "").trim(),
        upFid: (info.fields["UP主UID"] || "").trim(),
        incomplete
      });
    }
  }
  found.sort((left, right) => Number(right.incomplete) - Number(left.incomplete));
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
const line = (label, before, after) => {
  const b = String(before ?? "").trim() || "（空）";
  const a = String(after ?? "").trim() || "（空）";
  console.log(`  ${label}`);
  console.log(`    归档里现在：${b.slice(0, 100)}${b.length > 100 ? "…" : ""}`);
  console.log(`    4.2 导入后 ：${a.slice(0, 100)}${a.length > 100 ? "…" : ""}${b === a ? "   ← 无变化" : ""}`);
};

async function main() {
  const records = collectRecords();
  console.log(`扫描 ${root}`);
  console.log(`可试跑的记录：${records.length} 条（其中 ${records.filter((item) => item.incomplete).length} 条数据不完整）\n`);
  const targets = records.slice(0, limit);
  console.log(`本次试跑 ${targets.length} 条，只读，不改任何文件\n`);

  for (let index = 0; index < targets.length; index += 1) {
    const record = targets[index];
    console.log(`[${index + 1}/${targets.length}] ${record.collection}/${record.directory}  ${record.bvid}`);
    try {
      const view = await apiGet("/x/web-interface/view", { bvid: record.bvid });
      await sleep(REQUEST_DELAY_MS);
      const tagData = await apiGet("/x/tag/archive/tags", { bvid: record.bvid });
      await sleep(REQUEST_DELAY_MS);
      const mid = String(view?.owner?.mid || "");
      let fans = "";
      if (/^\d+$/.test(mid)) {
        try {
          const relation = await apiGet("/x/relation/stat", { vmid: mid });
          if (Number.isFinite(Number(relation?.follower))) fans = String(Number(relation.follower));
          await sleep(REQUEST_DELAY_MS);
        } catch (_) {}
      }

      const tags = [...new Set((Array.isArray(tagData) ? tagData : []).map((tag) => String(tag.tag_name || "").trim()).filter(Boolean))];
      const stat = view?.stat || {};
      const statText = Object.entries(STAT_LABELS)
        .filter(([key]) => stat[key] !== undefined && stat[key] !== null)
        .map(([key, label]) => `${label} ${stat[key]}`)
        .join("、");
      const apiDesc = String(view?.desc || "").trim();
      const cleaned = core.splitShareText(record.description);

      line("标签", record.tags.join("、"), tags.join("、"));
      line("视频发布时间", record.pubdate, Number(view?.pubdate) > 0 ? new Date(Number(view.pubdate) * 1000).toLocaleString("zh-CN") : "仍然未知");
      line("UP主 / 粉丝数", `${record.upName} / UID ${record.upFid}`, `${view?.owner?.name || ""} / UID ${mid} / 粉丝 ${fans || "未知"}`);
      console.log(`  互动数据`);
      console.log(`    归档里现在：（没有这一项）`);
      console.log(`    4.2 导入后 ：${statText || "（接口没返回）"}`);
      console.log(`  视频简介`);
      if (cleaned.isShareText) {
        console.log(`    归档里现在：<分享文案> ${record.description.slice(0, 80)}…`);
        console.log(`    清理后     ：${cleaned.description.slice(0, 100) || "（空）"}`);
        console.log(`    从文案提取 ：${Object.entries(cleaned.stats).map(([key, value]) => `${STAT_LABELS[key] || key} ${value}`).join("、")}`);
      } else {
        console.log(`    归档里现在：${record.description.slice(0, 100) || "（空）"}`);
      }
      if (apiDesc) console.log(`    接口的简介 ：${apiDesc.slice(0, 100)}`);
      console.log("");
    } catch (error) {
      console.log(`  失败：${error.message}\n`);
    }
  }
  console.log("试跑结束。以上只是预览，本地文件没有被修改。");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
