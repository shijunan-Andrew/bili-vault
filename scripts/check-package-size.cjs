#!/usr/bin/env node
/* ==========================================================================
   check-package-size.cjs —— 把 pack.ps1 的「发布清单 + 体积阈值」搬到 CI 里守。

   为什么要它（1.10.1 / P1-9）：pack.ps1 只在 Windows 上手工跑，CI 一直看不见它。
   1.9.0 加的 archive-tools.js 与回收站三件套（recycle.css / recycle.html / recycle.js）
   从来没进过 pack.ps1 的白名单 —— 那份白名单停在 1.8.24，实跑时第一步就会抛
   「发布清单里出现了白名单之外的文件」。这类漂移只有真跑一遍才暴露，所以这里
   按 pack.ps1 自己声明的规则重算一遍清单，任何一项不合规就让 CI 红。

   阈值和名单**只认 pack.ps1**：这个脚本从那边读，不另抄一份数字。两份一样的
   判断会让「改了这边忘了那边」变成静默失败，那正是本仓库反复踩过的坑。

   不检查 zip（3 MB）阈值：zip 需要真的压一遍，CI 里没有 PowerShell 也不好保证
   压缩等级一致；这一条留给 pack.ps1，在这里只守源目录的单文件、总量、文件数。
   ========================================================================== */
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const PACK = path.join(ROOT, "pack.ps1");

function fail(message) {
  console.error(`[✖] ${message}`);
  process.exitCode = 1;
}

function readPack() {
  if (!fs.existsSync(PACK)) throw new Error("找不到 pack.ps1 —— 发布清单的权威在它那里");
  return fs.readFileSync(PACK, "utf8");
}

/** 抓 `$maxFileBytes = 2MB` 这一行的数字，换算成字节。 */
function threshold(source, name) {
  const match = source.match(new RegExp(`\\$${name}\\s*=\\s*(\\d+(?:\\.\\d+)?)\\s*MB`));
  if (!match) throw new Error(`pack.ps1 里找不到 $${name} 的 MB 阈值`);
  return Math.round(Number(match[1]) * 1024 * 1024);
}

/** 抓 `$maxFileCount = 150`。 */
function countLimit(source) {
  const match = source.match(/\$maxFileCount\s*=\s*(\d+)/);
  if (!match) throw new Error("pack.ps1 里找不到 $maxFileCount");
  return Number(match[1]);
}

/** 抓 `@("a", "b")` 这种数组字面量里的字符串。 */
function stringArray(source, name) {
  // 名单有的写成多行（每行一个），有的写成一行，所以按「到第一个右括号为止」抓。
  const match = source.match(new RegExp(`\\$${name}\\s*=\\s*@\\(([\\s\\S]*?)\\)`));
  if (!match) throw new Error(`pack.ps1 里找不到 $${name}`);
  return [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]);
}

function walk(directory, prefix = "") {
  const out = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...walk(path.join(directory, entry.name), rel));
    else out.push(rel);
  }
  return out;
}

function main() {
  const pack = readPack();
  const excludeNames = stringArray(pack, "excludeNames");
  // 1.11.0：彩蛋页进包后，`bili-old-2015` 不能整目录排除，改用「按前缀」的 $excludePaths
  // 只挡掉里面的开发物（_ref/、build/、spec/、tools/、清单 JSON、文档）。规则同样只认 pack.ps1。
  const excludePaths = stringArray(pack, "excludePaths");
  const allowedTopFiles = stringArray(pack, "allowedTopFiles");
  const allowedTopDirs = stringArray(pack, "allowedTopDirs");
  const maxFileBytes = threshold(pack, "maxFileBytes");
  const maxTotalBytes = threshold(pack, "maxTotalBytes");
  const maxFileCount = countLimit(pack);

  // pack.ps1 的 $expected：根目录下除了排除名单（顶层名 + 嵌套前缀）以外的一切
  const expected = walk(ROOT).filter((rel) => {
    if (excludeNames.includes(rel.split("/")[0])) return false;
    return !excludePaths.some((skip) => rel === skip || rel.startsWith(`${skip}/`));
  });

  const outside = expected.filter((rel) => {
    const top = rel.split("/")[0];
    return !allowedTopFiles.includes(rel) && !allowedTopDirs.includes(top);
  });
  if (outside.length) {
    fail(`pack.ps1 的白名单漏了 ${outside.length} 个运行期文件：${outside.join("、")}`
      + "（新增运行期文件时，要同时加进 $allowedTopFiles 或 $allowedTopDirs）");
  }

  // 少一个就不该产出 zip，所以几个关键件单独钉一下
  for (const required of ["manifest.json", "background.js", "content.js", "archive-core.js",
    "archive-tools.js", "library.html", "settings.html", "stats.html", "recycle.html",
    "bili-old-2015/index.html", "bili-old-2015/egg-2015.js",
    "locales/zh-TW.json", "locales/en.json"]) {
    if (!expected.includes(required)) fail(`运行期文件 ${required} 不在发布清单里`);
  }

  // 1.14.4（审查 R-2 / R-3）：目录级白名单只认顶层名字，容器内部一律不校验 ——
  // locales/_todo.json 就是这么混进发行包的（它还在 .gitignore 里，干净 clone 根本打不出来）。
  // 这里把两个容器的内容钉死：名单要完全对得上，且不许出现 _ 开头的开发文件。
  const containers = {
    locales: ["locales/en.json", "locales/zh-TW.json"],
    native: ["native/folder-opener-host.ps1", "native/folder-opener-launcher.cs"]
  };
  for (const [dir, wanted] of Object.entries(containers)) {
    const actualFiles = expected.filter((rel) => rel.startsWith(`${dir}/`)).sort();
    const wantSorted = [...wanted].sort();
    if (actualFiles.join("|") !== wantSorted.join("|")) {
      fail(`${dir}/ 里应该恰好是 ${wantSorted.join("、")}，实际：${actualFiles.join("、") || "（空）"}`);
      continue;
    }
    const devFiles = actualFiles.filter((rel) => path.basename(rel).startsWith("_"));
    if (devFiles.length) fail(`${dir}/ 里混进了开发文件：${devFiles.join("、")}`);
  }

  let total = 0;
  for (const rel of expected) {
    const bytes = fs.statSync(path.join(ROOT, rel)).size;
    total += bytes;
    if (bytes > maxFileBytes) {
      fail(`文件 ${rel} 有 ${(bytes / 1024).toFixed(1)} KB，超过单文件 ${maxFileBytes / 1024 / 1024} MB 上限`);
    }
  }
  if (expected.length > maxFileCount) {
    fail(`发布清单里有 ${expected.length} 个文件，超过 ${maxFileCount} 上限 —— 大概率是把开发文件算进来了`);
  }
  if (total > maxTotalBytes) {
    fail(`发布清单总大小 ${(total / 1024).toFixed(1)} KB，超过 ${maxTotalBytes / 1024 / 1024} MB 上限`);
  }

  if (!process.exitCode) {
    console.log(`  [OK] 发布清单 ${expected.length} 个文件、${(total / 1024).toFixed(1)} KB，`
      + `单文件 ${(maxFileBytes / 1024 / 1024)} MB / 总量 ${(maxTotalBytes / 1024 / 1024)} MB / `
      + `${maxFileCount} 个文件的上限都来自 pack.ps1`);
    console.log("  [OK] 白名单覆盖了根目录下全部运行期文件（不含 zip 体积，那一条交给 pack.ps1）");
  }
}

try {
  main();
} catch (error) {
  console.error(`[✖] ${error.message}`);
  process.exitCode = 1;
}
