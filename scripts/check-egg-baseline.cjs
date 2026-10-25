#!/usr/bin/env node
/**
 * 2015 彩蛋页的视觉基线（1.12.9，审查 P3-7）。
 *
 * 为什么需要它：彩蛋页的图片是外链形态（1.11.0 起 `index.html` 不再内联 base64），
 * 而图片又被重编码过两轮（PNG 无损、JPEG q92/q90）。这两件事都「跑得过测试」：
 * 断言只看文件在不在、体积超没超，看不出某张图被换成了别的图、或者被压花了。
 * 这里给运行期子集（`index.html` + `egg-2015.js` + `assets/`）留一份 sha256 清单，
 * 改动后要么确认无误、重记一次基线，要么就被它拦下来。
 *
 * 用法：
 *   node scripts/check-egg-baseline.cjs          # 比对（CI 与 check-all 用这个）
 *   node scripts/check-egg-baseline.cjs --write  # 改动确实无误时，重记基线
 *   node scripts/check-egg-baseline.cjs --diff   # 只列出差异，不退出非零
 *
 * 基线文件是 `bili-old-2015/egg-baseline.json`，进仓库；别手改它。
 */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");
const EGG = path.join(ROOT, "bili-old-2015");
const BASELINE = path.join(EGG, "egg-baseline.json");
const ASSETS = path.join(EGG, "assets");

// 只看「真的会被用户打开」的那部分：外壳、脚本、图片。
// 生成器（build/、tools/、_ref/）、assets/_tools/ 与三份清单（NEEDED/COVER-MAP/INDEX）
// 都不进基线 —— 它们本来就是构建期产物，重跑一次生成器就会变。
const FIXED_FILES = ["index.html", "egg-2015.js"];
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico"]);
const SKIP_PREFIXES = ["assets/_tools/"];

const args = new Set(process.argv.slice(2));
const WRITE = args.has("--write");
const DIFF_ONLY = args.has("--diff");

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function walk(dir, prefix = "") {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full, rel));
    } else if (entry.isFile()) {
      // 基线自己不算进基线
      if (path.join(EGG, rel) === BASELINE) continue;
      out.push(rel);
    }
  }
  return out;
}

function collect() {
  const files = {};
  for (const rel of FIXED_FILES) {
    const full = path.join(EGG, rel);
    if (!fs.existsSync(full)) continue;
    files[rel] = sha256(fs.readFileSync(full));
  }
  if (fs.existsSync(ASSETS)) {
    for (const rel of walk(ASSETS, "assets")) {
      if (SKIP_PREFIXES.some((prefix) => rel.startsWith(prefix))) continue;
      if (!IMAGE_EXTENSIONS.has(path.extname(rel).toLowerCase())) continue;
      files[rel] = sha256(fs.readFileSync(path.join(EGG, rel)));
    }
  }
  const entries = Object.keys(files).sort();
  const bytes = entries.reduce((sum, rel) => sum + fs.statSync(path.join(EGG, rel)).size, 0);
  return { files, totals: { files: entries.length, bytes } };
}

function readBaseline() {
  if (!fs.existsSync(BASELINE)) return null;
  try {
    return JSON.parse(fs.readFileSync(BASELINE, "utf8"));
  } catch (error) {
    console.error(`[egg] 基线文件读不出来：${error.message}`);
    return null;
  }
}

function main() {
  const current = collect();
  if (WRITE) {
    const payload = {
      note: "2015 彩蛋页运行期子集的 sha256 基线（1.12.9）。改动无误后跑 node scripts/check-egg-baseline.cjs --write 重记。",
      generatedAt: new Date().toISOString().slice(0, 10),
      ...current,
    };
    fs.writeFileSync(BASELINE, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    console.log(`[egg] 已重记基线：${current.totals.files} 个文件、${(current.totals.bytes / 1024 / 1024).toFixed(2)} MB`);
    return;
  }

  const baseline = readBaseline();
  if (!baseline) {
    console.error("[egg] 缺少基线文件 bili-old-2015/egg-baseline.json（跑 --write 生成）");
    if (!DIFF_ONLY) process.exitCode = 1;
    return;
  }

  const changed = [];
  const added = [];
  const removed = [];
  for (const [rel, hash] of Object.entries(current.files)) {
    if (!(rel in baseline.files)) added.push(rel);
    else if (baseline.files[rel] !== hash) changed.push(rel);
  }
  for (const rel of Object.keys(baseline.files)) {
    if (!(rel in current.files)) removed.push(rel);
  }

  const changedTotal = changed.length + added.length + removed.length;
  if (!changedTotal) {
    console.log(`[egg] 与基线一致：${current.totals.files} 个文件、${(current.totals.bytes / 1024 / 1024).toFixed(2)} MB`);
    return;
  }

  console.log(`[egg] 与基线不一致：改了 ${changed.length}、多了 ${added.length}、少了 ${removed.length}`);
  for (const rel of changed.slice(0, 8)) console.log(`  改  ${rel}`);
  for (const rel of added.slice(0, 8)) console.log(`  多  ${rel}`);
  for (const rel of removed.slice(0, 8)) console.log(`  少  ${rel}`);
  const hidden = changedTotal - Math.min(8, changed.length) - Math.min(8, added.length) - Math.min(8, removed.length);
  if (hidden > 0) console.log(`  …另有 ${hidden} 个`);
  console.log("如果这些改动是有意的，跑一次 node scripts/check-egg-baseline.cjs --write 重记基线。");
  if (!DIFF_ONLY) process.exitCode = 1;
}

main();
