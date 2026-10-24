#!/usr/bin/env node
"use strict";

/**
 * scripts/check-all.cjs —— 发版与 CI 共用的那一套检查。
 *
 * 为什么要有这个文件：这套检查以前只写在 release.ps1 里（PowerShell），而且只在发版时跑。
 * 两个后果：① 推到 main 的代码在下次发版之前没人验证过，交接给多个 agent 之后最大的风险
 * 就是「有人把 main 推红而无人发现」；② CI 若要检查就得把同一套判断抄一遍，两套真相必然
 * 漂。现在 release.ps1 第 4 步和 .github/workflows/ci.yml 跑的都是这一个文件 ——
 * 检查清单只有一份，改检查只改这里。
 *
 * 检查内容（顺序与原 release.ps1 第 4 步一致）：
 *   1. node --check 全仓 *.js / *.cjs（跳过 .git/ 与 _ref/）
 *   2. 五套测试：stability / archive-core / stats-core / background / pages
 *   3. test/status.cjs --check（「当前状态」那张表与实际一致）
 *   4. test/i18n-extract.cjs --check（缺词条、多余词条都算失败；1.7.34 已把多余清零）
 *   5. 三份文档的 <!-- i18n-count:N --> 与实际词典条数一致
 *   6. 三份文档的 <!-- test-count:N --> 与 stability.test.cjs 的 test() 项数一致
 *   7. docs/HISTORY.md 的「版本 → 起始行」索引是最新的（1.8.23，TODO P2-11）
 *   8. 发布清单与体积（1.10.1）：pack.ps1 的白名单要覆盖根目录下全部运行期文件，
 *      单文件 / 总量 / 文件数上限全部从 pack.ps1 读 —— 阈值只有一处权威。
 *
 * 刻意不做的事：Windows 专属自检（test-native-folder-opener.ps1、csc 编译原生助手）不进
 * 这里，它们只能在真机上跑；CI 是 ubuntu-latest，那些检查留给人肉验证（见 SMOKE_TEST.md）。
 *
 * 用法：
 *   node scripts/check-all.cjs      # 全部通过 exit 0，任一失败 exit 1
 *
 * 仓库规矩（AI_HANDOFF.md）：改这里的检查项时，同时改 test/stability.test.cjs 里对应的
 * 守卫断言，否则下一个人只能靠读代码猜「到底该跑哪些」。
 */

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const node = process.execPath;
const DOCS = ["README.md", "AI_HANDOFF.md", "SMOKE_TEST.md"];

// 五套测试的标签沿用 release.ps1 里的说法：发版的人看成一样的输出。
const SUITES = [
  ["回归测试（静态断言）", "test/stability.test.cjs"],
  ["纯函数单元测试（真执行 archive-core.js）", "test/archive-core.test.cjs"],
  ["纯函数单元测试（真执行 stats-core.js）", "test/stats-core.test.cjs"],
  ["浏览器环境单元测试（真执行 background.js 与 library.js 的原生消息）", "test/background.test.cjs"],
  ["页面脚本单元测试（真执行 library.js / popup.js / content.js）", "test/pages.test.cjs"]
];

let failed = false;
const failures = [];

function section(title) {
  console.log(title);
}

function ok(message) {
  console.log(`  [OK] ${message}`);
}

function note(message) {
  console.log(`  ${message}`);
}

function bad(message) {
  failed = true;
  failures.push(message);
  console.log(`  [FAIL] ${message}`);
}

function readText(relativePath) {
  const file = path.join(root, relativePath);
  if (!fs.existsSync(file)) return null;
  return fs.readFileSync(file, "utf8");
}

// 跑一个 node 脚本（都是本仓的 .cjs，零依赖）。合并 stdout 与 stderr：node:test 的
// 失败详情走 stdout，语法错误 / throw 走 stderr，只留一半会在 CI 上变成「红了但不知道为啥」。
function runNode(args) {
  const result = spawnSync(node, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024
  });
  const status = typeof result.status === "number" ? result.status : 1;
  return { code: status, output: `${result.stdout || ""}${result.stderr || ""}` };
}

function printTail(output, maxLines) {
  const lines = output.split(/\r?\n/).filter((line) => line.trim());
  const tail = lines.slice(-maxLines);
  for (const line of tail) note(`    ${line}`);
}

// ───────── 1. 语法检查 ─────────
//
// 静态断言看不见语法错误，这一步是专门补那个盲区的（4.8.2 靠它拦下过一次）。
// bili-old-2015/ 是 2015 年那版老站的整站快照，里面也有 .js，照样要能编译 ——
// release.ps1 原来就不过滤它，这里保持一致（_ref/ 下的 *.pretty.js 是互联网档案馆
// 导出的 pretty-print JSON 转储，整份文件以一个 { 开头，不是可执行脚本，必须跳过）。
function listScripts(dir, prefix, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (entry.name === ".git" || entry.name === "_ref") continue;
      listScripts(path.join(dir, entry.name), relative, out);
    } else if (/\.(?:js|cjs)$/i.test(entry.name)) {
      out.push(relative);
    }
  }
  return out;
}

function checkSyntax() {
  section("语法检查…");
  const files = listScripts(root, "", []).sort();
  let broken = 0;
  for (const file of files) {
    const run = runNode(["--check", path.join(root, file)]);
    if (run.code !== 0) {
      broken += 1;
      const reason = run.output.split(/\r?\n/).find((line) => line.trim()) || "";
      bad(`${file} 语法错误${reason ? `：${reason.trim()}` : ""}`);
    }
  }
  if (!broken) ok(`${files.length} 个 JS 文件全部通过`);
}

// ───────── 2~4. 测试、状态、词典 ─────────

function checkSuite(label, file) {
  section(`${label}…`);
  // --test-reporter=spec 是必须的：Node 22 在非 TTY（CI、管道）下默认吐 TAP
  // （`# tests 254`），而这里认的是 `ℹ tests 254`。写死 reporter，本地与 CI 的输出格式才一致。
  const run = runNode(["--test-reporter=spec", path.join(root, file)]);
  for (const line of run.output.split(/\r?\n/)) {
    if (/^ℹ (tests|pass|fail)/.test(line)) note(line.trim());
  }
  if (run.code !== 0) {
    printTail(run.output, 40);
    return bad(`${file} 未全过（退出码 ${run.code}）`);
  }
  const tests = run.output.match(/^ℹ\s*tests\s+(\d+)/m);
  const fails = run.output.match(/^ℹ\s*fail\s+(\d+)/m);
  if (!tests || Number(tests[1]) === 0) return bad(`${file} 一项都没跑到，跑起来了吗？`);
  if (!fails || Number(fails[1]) !== 0) return bad(`${file} 有失败项`);
  return undefined;
}

function checkStatus() {
  section("交接文档的「当前状态」…");
  const run = runNode([path.join(root, "test/status.cjs"), "--check"]);
  if (run.code !== 0) {
    printTail(run.output, 20);
    return bad("交接文档的「当前状态」与仓库实际不一致（跑 node test/status.cjs --write 刷新，别手改数字）");
  }
  for (const line of run.output.split(/\r?\n/)) if (line.trim()) note(line.trim());
  return undefined;
}

let i18nOutput = "";

function checkDictionary() {
  section("词典覆盖…");
  const run = runNode([path.join(root, "test/i18n-extract.cjs"), "--check"]);
  i18nOutput = run.output;
  for (const line of run.output.split(/\r?\n/)) {
    if (/词条 \d+ 条/.test(line)) note(line.trim());
  }
  if (run.code !== 0 || /缺\s+[1-9]/.test(i18nOutput)) {
    printTail(run.output, 30);
    return bad("有词条缺翻译（跑 node test/i18n-extract.cjs --check 看是哪条）");
  }
  return undefined;
}

// 1.7.21 起先只播报不拦：当时两本词典各囤了 52 条作者删掉的旧词条，当闸门会让每次发版都红。
// 1.7.34 把这 52 条清干净了（多余 0），于是「多余」这个数字只剩一个含义 —— 有人删了界面文案
// 却没删词典条目，或者词典里混进了没在用的词。从这一版起它跟「缺」一样是闸门。
// 两本数字不一致另说：那说明其中一本记错了，先查清楚再谈条数。
function reportOrphans() {
  const counts = [...i18nOutput.matchAll(/多余\s+(\d+)/g)].map((match) => Number(match[1]));
  const unique = [...new Set(counts)].sort((a, b) => a - b);
  if (!unique.length) {
    return bad("没能从词典检查的输出里读出多余条数");
  }
  if (unique.length > 1) {
    return bad(`两本词典的多余条数不一致：${unique.join(" / ")}，先查清哪一本记错了`);
  }
  if (unique[0] !== 0) {
    return bad(`词典里有 ${unique[0]} 条多余词条（作者已删的旧词条）：跑 node test/i18n-extract.cjs --check 看是哪些，删掉`);
  }
  return ok("词典里没有多余词条（多余 0 条）");
}

// ───────── 5. 文档里写的词典条数 ─────────
//
// README 里那句「两本词典各 … 条」以前没人核对，加过词之后就停在旧数字上（847），而词典
// 实际早就涨到 953 条 —— 和下面的测试项数是同一类问题：数字写死在文档里就一定会过期。
// 条数直接从上面 i18n-extract --check 的输出里读；文档侧的锚点写成 HTML 注释，渲染不可见。
function checkDocDictionary() {
  section("文档里的词典条数…");
  const counts = [...i18nOutput.matchAll(/词条\s+(\d+)\s+条/g)].map((match) => Number(match[1]));
  const unique = [...new Set(counts)];
  if (unique.length !== 1) {
    return bad(`没能从词典检查的输出里读出唯一的条数（读到 ${unique.length} 种）`);
  }
  const real = unique[0];
  let markers = 0;
  const stale = [];
  for (const doc of DOCS) {
    const text = readText(doc);
    if (text === null) {
      stale.push(`${doc} 不存在`);
      continue;
    }
    for (const match of text.matchAll(/<!--\s*i18n-count:(\d+)\s*-->/g)) {
      markers += 1;
      if (Number(match[1]) !== real) stale.push(`${doc} 写的是 ${match[1]} 条，实际是 ${real} 条`);
    }
  }
  if (markers === 0) return bad("三处文档里都找不到 <!-- i18n-count:N --> 标记");
  if (stale.length) {
    for (const line of stale) bad(line);
    note(`改法：把这几处的词典条数改成 ${real}（只改数字，标记一起改）`);
    return undefined;
  }
  return ok(`文档里的词典条数与词典一致（${real} 条）`);
}

// ───────── 6. 文档里写的测试项数 ─────────
//
// 这三处以前各写各的（141 / 141 / 127），实际早就涨到 253 了，读文档的人会以为测试规模
// 还是原来那点。标记写成 HTML 注释，渲染出来看不见，但脚本能核对。
function checkDocTestCount() {
  section("文档里的测试项数…");
  const source = readText("test/stability.test.cjs") || "";
  // 1.8.22（old-p3 P3-11）：只数**行首**的 `test(`。这条正则刻意不加 `\b`/`m` 以外的花样：
  // 断言里那些提到 `test(` 的字符串（`includes("test(")` 之类）不该被算成测试项，
  // 而真正的测试项一律顶格写。缩进的 `test(` 不计入，也不该计入。
  const real = (source.match(/^test\(/gm) || []).length;
  if (!real) return bad("test/stability.test.cjs 里读不到任何 test() 项");
  const problems = [];
  for (const doc of DOCS) {
    const text = readText(doc);
    if (text === null) {
      problems.push(`${doc} 不存在`);
      continue;
    }
    const markers = [...text.matchAll(/<!--\s*test-count:(\d+)\s*-->/g)];
    if (markers.length === 0) {
      problems.push(`${doc} 里找不到 <!-- test-count:N --> 标记`);
      continue;
    }
    for (const match of markers) {
      if (Number(match[1]) !== real) problems.push(`${doc} 写的是 ${match[1]} 项，实际是 ${real} 项`);
    }
  }
  if (problems.length) {
    for (const line of problems) bad(line);
    note(`改法：把这三处文档里的 test-count 标记统一改成 ${real}（只改数字）`);
    return undefined;
  }
  return ok(`三处文档都记着 ${real} 项`);
}

// ───────── 7. HISTORY 的版本索引 ─────────
//
// 1.8.23（TODO P2-11）：HISTORY 两千多行，发版第 1 步要拿 git tag 逐条比对「这一版
// 有没有小节」。索引由 scripts/history-index.cjs 生成，这里只负责问一句「过期了吗」——
// 忘了重排的话发版会被这一步拦住，而不是让人肉去翻文件。
function checkHistoryIndex() {
  section("HISTORY 的版本索引…");
  const historyIndex = require("./history-index.cjs");
  const result = historyIndex.check();
  if (!result.ok) {
    bad(result.message);
    note("改法：node scripts/history-index.cjs --write");
    return undefined;
  }
  return ok(result.message);
}

function checkPackageSize() {
  section("发布清单与体积（pack.ps1 说了算）…");
  const result = runNode(["scripts/check-package-size.cjs"]);
  if (result.code !== 0) {
    bad("pack.ps1 的发布清单或体积上限不满足");
    printTail(result.output, 12);
    note("改法：新增运行期文件要同时加进 pack.ps1 的 $allowedTopFiles / $allowedTopDirs；"
      + " 体积超标就看是不是把开发文件算进来了。");
    return undefined;
  }
  for (const line of result.output.split(/\r?\n/)) {
    if (line.trim()) console.log(line);
  }
  return ok("发布清单与体积都在 pack.ps1 的规则内");
}

function main() {
  checkSyntax();
  for (const [label, file] of SUITES) checkSuite(label, file);
  checkStatus();
  checkDictionary();
  reportOrphans();
  checkDocDictionary();
  checkDocTestCount();
  checkHistoryIndex();
  checkPackageSize();
  console.log("");
  if (failed) {
    console.log(`[FAIL] 检查未通过（${failures.length} 处），修好之后重新跑：node scripts/check-all.cjs`);
    process.exitCode = 1;
    return;
  }
  console.log("[OK] 全部检查通过");
}

main();
