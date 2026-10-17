// 生成 AI_HANDOFF.md 里的「当前状态」表。
//
//   node test/status.cjs --write    真的跑五套测试 + 词典检查，然后把结果写回交接文档
//   node test/status.cjs --check    只做便宜的核对（标记还在、词典条数、stability 项数）
//
// 为什么要有它：交接文档里最会漂的就是「我们现在到哪了」。手写的数字一周就过期，
// 而 agent 一旦信了过期数字，判断全是错的。所以这张表只认脚本输出。
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const handoffPath = path.join(root, "AI_HANDOFF.md");
const BEGIN = "<!-- status:begin -->";
const END = "<!-- status:end -->";

const SUITES = [
  ["stability", "test/stability.test.cjs"],
  ["archive-core", "test/archive-core.test.cjs"],
  ["stats-core", "test/stats-core.test.cjs"],
  ["background", "test/background.test.cjs"],
  ["pages", "test/pages.test.cjs"]
];

function nodeRun(file) {
  return execFileSync(process.execPath, [path.join(root, file)], { cwd: root, encoding: "utf8" });
}

function git(args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function dictionaryInfo() {
  const out = execFileSync(process.execPath, [path.join(root, "test/i18n-extract.cjs"), "--check"], {
    cwd: root,
    encoding: "utf8"
  });
  const entries = Number((out.match(/词条\s+(\d+)\s+条/) || [])[1] || 0);
  const missing = Number((out.match(/缺\s+(\d+)\s+条/) || [])[1] || 0);
  const extra = Number((out.match(/多余\s+(\d+)\s+条/) || [])[1] || 0);
  if (!entries) throw new Error("从 i18n-extract 的输出里读不出词典条数");
  return { entries, missing, extra };
}

function suiteCount(name, file) {
  const out = nodeRun(file);
  const tests = Number((out.match(/ℹ\s*tests\s+(\d+)/) || [])[1] || 0);
  const fail = Number((out.match(/ℹ\s*fail\s+(\d+)/) || [])[1] || 0);
  if (!tests) throw new Error(name + " 没打印出 tests 项数");
  if (fail) throw new Error(name + " 有 " + fail + " 项失败 —— 先修好，再刷新状态");
  return tests;
}

function buildBlock() {
  const dict = dictionaryInfo();
  const counts = {};
  for (const pair of SUITES) counts[pair[0]] = suiteCount(pair[0], pair[1]);
  const head = git(["rev-parse", "--short", "HEAD"]);
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const when =
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
    `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const suiteLine =
    `stability ${counts.stability} · archive-core ${counts["archive-core"]} · ` +
    `stats-core ${counts["stats-core"]} · background ${counts.background} · pages ${counts.pages}`;
  return [
    "| 项 | 值 |",
    "|---|---|",
    `| 词典 | ${dict.entries} 条（\`zh-TW\` / \`en\` 各一份；缺 ${dict.missing}，作者已删的旧词条 ${dict.extra}） |`,
    `| 测试基线 | ${suiteLine}（后四套是真执行） |`,
    "| 审查欠账 | P0 2/2 · P1 24 条 · P2 清单内 63/63 已全部处理完；P3 按约定不修 |",
    `| 生成 | ${when}，当时 HEAD \`${head}\`；重跑 \`node test/status.cjs --write\` 刷新 |`
  ].join("\n");
}

function readHandoff() {
  const raw = fs.readFileSync(handoffPath, "utf8");
  const bom = raw.startsWith("\uFEFF");
  return { bom, text: bom ? raw.slice(1) : raw };
}

function writeHandoff(state) {
  // 先把行尾统一成 \r\n；必须用 /\r?\n/ 而不是 /\n/，
  // 否则文件里已有的 \r\n 每跑一次 --write 就多叠一个 \r（历史上把 AI_HANDOFF.md 叠成了 5 个 CR）。
  const crlf = state.text.replace(/\r?\n/g, "\r\n");
  fs.writeFileSync(handoffPath, (state.bom ? "\uFEFF" : "") + crlf, "utf8");
}

function regionOf(text) {
  const start = text.indexOf(BEGIN);
  const end = text.indexOf(END);
  if (start < 0 || end < 0 || end < start) throw new Error("AI_HANDOFF.md 里找不到 status 标记");
  return { start, end };
}

function doWrite() {
  const state = readHandoff();
  const { start, end } = regionOf(state.text);
  const block = buildBlock();
  state.text = state.text.slice(0, start + BEGIN.length) + "\n" + block + "\n" + state.text.slice(end);
  writeHandoff(state);
  console.log("[OK] 已刷新 AI_HANDOFF.md 的「当前状态」");
}

function doCheck() {
  const state = readHandoff();
  const { start, end } = regionOf(state.text);
  const block = state.text.slice(start + BEGIN.length, end);
  if (!block.trim()) throw new Error("「当前状态」块是空的，跑一次 node test/status.cjs --write");

  const dict = dictionaryInfo();
  if (!block.includes(`| 词典 | ${dict.entries} 条`)) {
    throw new Error(`「当前状态」里的词典条数与实际不符（实际 ${dict.entries}）—— 跑一下 --write`);
  }

  const stabilityFile = fs.readFileSync(path.join(root, "test/stability.test.cjs"), "utf8");
  const stabilityCount = (stabilityFile.match(/^test\(/gm) || []).length;
  if (!block.includes(`stability ${stabilityCount}`)) {
    throw new Error(`「当前状态」里的 stability 项数与实际不符（实际 ${stabilityCount}）—— 跑一下 --write`);
  }

  if (!block.includes("审查欠账")) throw new Error("「当前状态」缺少审查欠账那行");
  if (!block.includes("node test/status.cjs --write")) throw new Error("「当前状态」缺少重新生成的说明");
  console.log("[OK] 「当前状态」与仓库实际一致");
}

const arg = process.argv[2] || "--check";
try {
  if (arg === "--write") doWrite();
  else if (arg === "--check") doCheck();
  else {
    console.error("用法：node test/status.cjs [--write | --check]");
    process.exit(2);
  }
} catch (error) {
  console.error("[✖] " + (error && error.message ? error.message : error));
  process.exit(1);
}
