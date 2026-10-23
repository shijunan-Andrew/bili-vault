#!/usr/bin/env node
/* 1.8.23（TODO P2-11）：给 docs/HISTORY.md 生成「版本 → 起始行」索引。
   ---------------------------------------------------------------------------
   HISTORY 已经两千多行；发版第 1 步要拿 git tag 逐条比对「这一版有没有小节」，
   全靠人肉在文件里翻。这里按 `## V<版本>：` 标题扫一遍，把版本、标题、起始行
   写成一张表插在文件开头，块首块尾各留一个 HTML 注释标记。

   用法：
     node scripts/history-index.cjs --write   重写索引块（发版/改 HISTORY 之后跑）
     node scripts/history-index.cjs --check   只校验，过期就退出码 1（check-all 用）
     node scripts/history-index.cjs           打印当前索引（不写文件）

   约束：只认行首的 `## V<数字>.<数字>.<数字>：`；表里不写标题里的竖线（转义成 \\|），
   免得表格断列。文件原来的换行风格会保留。
   --------------------------------------------------------------------------- */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const HISTORY = path.join(ROOT, "docs", "HISTORY.md");
const START_MARK = "<!-- history-index:start -->";
const END_MARK = "<!-- history-index:end -->";
const VERSION_HEADING = /^## (V\d+\.\d+\.\d+)：(.*)$/;

function detectEol(text) {
  const crlf = (text.match(/\r\n/g) || []).length;
  const lf = (text.match(/\n/g) || []).length;
  return crlf > lf / 2 ? "\r\n" : "\n";
}

function collectSections(text) {
  const sections = [];
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(VERSION_HEADING);
    if (match) sections.push({ version: match[1], title: match[2].trim(), line: index + 1 });
  }
  return sections;
}

// 索引块固定占 N + 6 行（标记 2 行、说明 2 行、表头 2 行、表体 N 行）。
// 第一次插入时先放一个同样行数的占位块，再基于「已经占好行数」的文本算行号，
// 否则插进去之后所有小节的起始行都会整体上移。
function blockLineCount(rows) {
  return rows + 6;
}

function renderBlock(text, eol) {
  const sections = collectSections(text);
  if (!sections.length) return "";
  const rows = sections.map((section) => {
    const title = section.title.replace(/\|/g, "\\|");
    return `| ${section.version} | ${title} | ${section.line} |`;
  });
  return [
    START_MARK,
    "**版本索引（脚本生成，勿手改；发版后跑 `node scripts/history-index.cjs --write` 重排）**",
    "",
    "| 版本 | 标题 | 起始行 |",
    "| --- | --- | --- |",
    ...rows,
    END_MARK,
  ].join(eol);
}

function insertBeforeSections(text, block, eol) {
  const lines = text.split(/\r?\n/);
  const first = lines.findIndex((line) => VERSION_HEADING.test(line));
  if (first < 0) throw new Error("HISTORY.md 里一个 `## V…：` 小节都没有");
  const head = lines.slice(0, first).join(eol).replace(/\s+$/, "");
  const tail = lines.slice(first).join(eol);
  return `${head}${eol}${eol}${block}${eol}${eol}${tail}`;
}

function currentBlock(text) {
  const start = text.indexOf(START_MARK);
  const end = text.indexOf(END_MARK);
  if (start < 0 || end < start) return null;
  return text.slice(start, end + END_MARK.length);
}

function withFreshBlock(text) {
  const eol = detectEol(text);
  const block = renderBlock(text, eol);
  if (!block) throw new Error("HISTORY.md 里一个 `## V…：` 小节都没有");
  const existing = currentBlock(text);
  if (existing !== null) {
    return { text: text.replace(existing, block), eol, changed: existing !== block };
  }
  // 没标记：先插一个与最终索引等行数的占位块，再按插好之后的文本算一次行号
  const placeholder = Array(blockLineCount(collectSections(text).length)).fill(START_MARK).join(eol);
  const withPlaceholder = insertBeforeSections(text, placeholder, eol);
  const settled = renderBlock(withPlaceholder, eol);
  if (settled.split(eol).length !== placeholder.split(eol).length) {
    throw new Error("版本索引块的行数不稳定，拒绝写入（否则后续行号会漂）");
  }
  return { text: withPlaceholder.replace(placeholder, settled), eol, changed: true };
}

function check() {
  let text;
  try {
    text = fs.readFileSync(HISTORY, "utf8");
  } catch (error) {
    return { ok: false, message: `读不到 docs/HISTORY.md：${error.message}` };
  }
  const sections = collectSections(text);
  if (!sections.length) return { ok: false, message: "docs/HISTORY.md 里一个 `## V…：` 小节都没有" };
  const existing = currentBlock(text);
  if (existing === null) {
    return { ok: false, message: "docs/HISTORY.md 里没有版本索引块（缺 history-index:start/end 标记）" };
  }
  const expected = renderBlock(text, detectEol(text));
  if (existing !== expected) {
    const rows = (existing.match(/^\| V/gm) || []).length;
    return { ok: false, message: `版本索引过期（索引里 ${rows} 条，实际 ${sections.length} 个版本小节）` };
  }
  return { ok: true, message: `版本索引是最新的（${sections.length} 个版本）` };
}

function main() {
  const mode = process.argv[2] || "";
  if (mode === "--check") {
    const result = check();
    console.log(result.ok ? `[OK] ${result.message}` : `[FAIL] ${result.message}`);
    if (!result.ok) process.exitCode = 1;
    return;
  }
  let text;
  try {
    text = fs.readFileSync(HISTORY, "utf8");
  } catch (error) {
    console.log(`[FAIL] 读不到 docs/HISTORY.md：${error.message}`);
    process.exitCode = 1;
    return;
  }
  const fresh = withFreshBlock(text);
  if (mode === "--write") {
    if (fresh.changed) {
      fs.writeFileSync(HISTORY, fresh.text, "utf8");
      console.log(`[OK] 已重写版本索引（${collectSections(fresh.text).length} 个版本）`);
    } else {
      console.log(`[OK] 版本索引已是最新（${collectSections(fresh.text).length} 个版本）`);
    }
    return;
  }
  console.log(renderBlock(text, fresh.eol));
}

if (require.main === module) main();

module.exports = { check, withFreshBlock, collectSections, START_MARK, END_MARK };
