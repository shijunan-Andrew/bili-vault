"use strict";
const fs = require("node:fs");
const REPO = "C:/Users/Maxwell/Desktop/bili-vault";
const eolOf = (f) => (fs.readFileSync(`${REPO}/${f}`, "utf8").includes("\r\n") ? "\r\n" : "\n");

function edit(file, pairs) {
  const eol = eolOf(file);
  let text = fs.readFileSync(`${REPO}/${file}`, "utf8").replace(/\r\n/g, "\n");
  for (const [from, to, label] of pairs) {
    const n = text.split(from).length - 1;
    if (n !== 1) throw new Error(`${file} / ${label}：锚点出现 ${n} 次`);
    text = text.replace(from, to);
    console.log(`  ✅ ${file}：${label}`);
  }
  fs.writeFileSync(`${REPO}/${file}`, text.replace(/\n/g, eol), "utf8");
}

/* ══ ① 纯函数：判断一页是否整页都早于窗口起点 ══ */
edit("background.js", [[
  `function importIdentifierKeys(item) {`,
  `/* 这一页是不是整页都早于时间窗起点（用于「最近 N 天」提前收工）。
   只看拿到收藏时间的条目；一条时间都读不到就返回 false，宁可多翻一页。 */
function importPageEntirelyBefore(items, cutoffMs) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length || !cutoffMs) return false;
  let seen = 0;
  for (const item of list) {
    const at = favoriteTimeMs(item?.favoriteAt);
    if (!at) return false;
    if (at >= cutoffMs) return false;
    seen += 1;
  }
  return seen > 0;
}

function importIdentifierKeys(item) {`,
  "加 importPageEntirelyBefore"
]]);

/* ══ ② 分页循环：带时间窗时提前收工 ══ */
edit("background.js", [[
  `      let sawLastPage = false;
      for (let page = 2; page <= maxPages; page += 1) {`,
  `      let sawLastPage = false;
      // V1.1.6：「最近 N 天」提前收工。
      // 列表是按 order=mtime（收藏时间）倒序返回的（见 fetchImportFavoritePage），
      // 所以一旦某页里【最新】的条目都早于窗口起点，后面的只会更早，没必要再翻。
      // 上一版是先拉全 71 页再过滤 —— 请求量跟全量导入一模一样，
      // 「只同步最近 3 天」在服务端看来毫无区别，用户连跑几次就触发了风控。
      // 要求连续两页都整页早于窗口，容忍个别顺序错乱的条目：
      // 早停错了会漏掉新视频，那比多翻几页严重得多。
      const windowCutoff = Math.max(0, Number(data?.recentDays) || 0) > 0
        ? Date.now() - Math.max(0, Number(data?.recentDays) || 0) * 86400000
        : 0;
      let olderPagesSeen = 0;
      let windowStoppedEarly = false;
      for (let page = 2; page <= maxPages; page += 1) {`,
  "分页循环加提前收工变量"
]]);

edit("background.js", [[
  `          if (result.hasMore === false || result.items.length < IMPORT_FAVORITE_PAGE_SIZE) sawLastPage = true;
          publishImportRun({ journal, cursor: { folder: folder.title, page } });`,
  `          if (result.hasMore === false || result.items.length < IMPORT_FAVORITE_PAGE_SIZE) sawLastPage = true;
          publishImportRun({ journal, cursor: { folder: folder.title, page } });
          if (windowCutoff && importPageEntirelyBefore(result.items, windowCutoff)) {
            olderPagesSeen += 1;
            if (olderPagesSeen >= 2) { windowStoppedEarly = true; sawLastPage = true; break; }
          } else {
            olderPagesSeen = 0;
          }`,
  "插入提前收工判断"
]]);

/* ══ ③ 分页节奏：每页都停一下，不再 4 页连发 ══ */
edit("background.js", [
  [
    `        if (page % 4 === 0) await importDelay(150);
      }
      total += scopedItems.length;`,
    `        // V1.1.6：以前是 4 页连发再停 150ms（约 4 请求/秒）。真机上跑几次就触发了风控，
        // 改成每页之间都停一下 —— 71 页从约 18 秒变成约 30 秒，代价很小，稳得多。
        await importDelay(IMPORT_PAGE_DELAY_MS);
      }
      total += scopedItems.length;`,
    "导入分页节奏放慢"
  ],
  [
    `    if (page % 4 === 0) await importDelay(150);
  }
  return { items, expectedTotal, sawLastPage, failedPages };`,
    `    // 与导入同一节奏，见 IMPORT_PAGE_DELAY_MS 的说明
    await importDelay(IMPORT_PAGE_DELAY_MS);
  }
  return { items, expectedTotal, sawLastPage, failedPages };`,
    "差异对比分页节奏放慢"
  ],
  [
    `const IMPORT_FIRST_PAGE_ATTEMPTS = 3;`,
    `const IMPORT_FIRST_PAGE_ATTEMPTS = 3;

// 翻页之间的间隔。以前是每 4 页才停 150ms，71 页的收藏夹连跑几次就触发风控。
// 现在每页都停 —— 71 页从约 18 秒变成约 30 秒，换来的是不再被限流。
const IMPORT_PAGE_DELAY_MS = 220;`,
    "加 IMPORT_PAGE_DELAY_MS 常量"
  ]
]);
