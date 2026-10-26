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
 *   9. 彩蛋页视觉基线（1.12.9）：bili-old-2015 的运行期子集要与 egg-baseline.json 对得上，
 *      改图之后必须显式重记基线，不能悄悄换图。
 *   8. 发布清单与体积（1.10.1）：pack.ps1 的白名单要覆盖根目录下全部运行期文件，
 *      单文件 / 总量 / 文件数上限全部从 pack.ps1 读 —— 阈值只有一处权威。
 *   9. .ps1 的语法（1.12.6，审查 P3-2）：用 PowerShell 自己的解析器过一遍，不执行任何语句。
 *      没装 pwsh 的机器跳过（不当失败）—— 原生宿主那条链路以前只有人工在 Windows 上才验得到。
 *
 * 刻意不做的事：Windows 专属自检（test-native-folder-opener.ps1、csc 编译原生助手）不进
 * 这里，它们只能在真机上跑；CI 是 ubuntu-latest，那些检查留给人肉验证（见 SMOKE_TEST.md）。
 *
 * 用法：
 *   node scripts/check-all.cjs             # 全部通过 exit 0，任一失败 exit 1
 *   node scripts/check-all.cjs --write     # 先把三处文档里的词典条数 / 测试项数按实际值改掉，再照常复检
 *                                          # （1.12.6，审查 P3-1：这类数字以前全靠手工同步，漏改一处就红）
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

// 1.12.6（审查 P3-1）：`--write` 把文档里那几个会漂的数字按实际值改掉，再走一遍正常复检。
// 「跑一条命令改数字」比「红了以后手工改三处」少一半失误 —— 审查期间确实因为漏改一处红了三次。
const WRITE = process.argv.includes("--write");

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

function writeText(relativePath, text) {
  fs.writeFileSync(path.join(root, relativePath), text, "utf8");
}

// 文档里的数字有两份：渲染时看不见的 HTML 标记，和正文里那句人话。
// 只改一处就会出现「标记说 409、正文说 407」，比完全没改更难查 —— 所以一起改。
function rewriteTestCounts(relativePath, real) {
  const text = readText(relativePath);
  if (text === null) return false;
  const next = text
    .replace(/<!--\s*test-count:\d+\s*-->/g, `<!-- test-count:${real} -->`)
    .replace(/(的 \*\*)\d+(\*\* 项里)/g, `$1${real}$2`);
  if (next === text) return false;
  writeText(relativePath, next);
  return true;
}

function rewriteDictionaryCounts(relativePath, real) {
  const text = readText(relativePath);
  if (text === null) return false;
  const next = text
    .replace(/<!--\s*i18n-count:\d+\s*-->/g, `<!-- i18n-count:${real} -->`)
    .replace(/(\*\*当前 )\d+( 条\*\*)/g, `$1${real}$2`);
  if (next === text) return false;
  writeText(relativePath, next);
  return true;
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
    if (WRITE) {
      let touched = 0;
      for (const doc of DOCS) if (rewriteDictionaryCounts(doc, real)) touched += 1;
      if (touched) {
        note(`--write：已把 ${touched} 份文档里的词典条数改成 ${real}`);
        return ok(`文档里的词典条数已按实际值补齐（${real} 条）`);
      }
    }
    for (const line of stale) bad(line);
    note(`改法：把这几处的词典条数改成 ${real}（只改数字，标记一起改）`);
    note("或者直接跑 node scripts/check-all.cjs --write 让脚本改");
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
    if (WRITE) {
      let touched = 0;
      for (const doc of DOCS) if (rewriteTestCounts(doc, real)) touched += 1;
      if (touched) {
        note(`--write：已把 ${touched} 份文档里的测试项数改成 ${real}`);
        return ok(`三处文档的测试项数已按实际值补齐（${real} 项）`);
      }
    }
    for (const line of problems) bad(line);
    note(`改法：把这三处文档里的 test-count 标记统一改成 ${real}（只改数字）`);
    note("或者直接跑 node scripts/check-all.cjs --write 让脚本改");
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

function checkEggBaseline() {
  section("彩蛋页视觉基线（2015 那页的图片与外壳）…");
  const result = runNode(["scripts/check-egg-baseline.cjs"]);
  if (result.code !== 0) {
    bad("彩蛋页与基线不一致");
    printTail(result.output, 12);
    note("改法：确认改动无误后跑 node scripts/check-egg-baseline.cjs --write 重记基线，并把这份改动写进 HISTORY。");
    return false;
  }
  note(result.output.trim().split("\n").pop());
  return ok("彩蛋页与基线一致");
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

// ───────── 9. .ps1 的语法 ─────────
//
// 1.12.6（审查 P3-2）：原生宿主那套「协议 4 + 调用方白名单」只有在 Windows 上人工跑
// test-native-folder-opener.ps1 才验得到；CI 是 ubuntu-latest，改坏一个括号、一个 `if` 结构，
// 静态正则照样全绿。这里用 PowerShell 自己的解析器（PSParser::Tokenize）只做语法检查：
// 不执行任何语句、不碰注册表、不需要 settings.json。本地 Windows 与 GitHub 的 ubuntu-latest
// 都带 pwsh 7；没装的机器跳过而不是判红 —— 否则贡献者会被一条基础设施卡住。
function listPowerShellFiles(dir, prefix, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (entry.name === ".git" || entry.name === "_ref") continue;
      listPowerShellFiles(path.join(dir, entry.name), relative, out);
    } else if (/\.ps1$/i.test(entry.name)) {
      out.push(relative);
    }
  }
  return out;
}

function checkPowerShellSyntax() {
  section("PowerShell 语法…");
  const files = listPowerShellFiles(root, "", []).sort();
  if (!files.length) return bad("一个 .ps1 都没找到，清单是不是错了");
  const probe = spawnSync("pwsh", ["-NoProfile", "-NonInteractive", "-Command", "exit 0"], {
    encoding: "utf8"
  });
  if (probe.error || probe.status !== 0) {
    note("这台机器上没有 pwsh（PowerShell 7），跳过 .ps1 语法检查；Windows 上它一般在 PATH 里");
    return undefined;
  }
  const list = files.map((file) => `'${file.replace(/'/g, "''")}'`).join(", ");
  const script = [
    "$failed = 0",
    `foreach ($file in @(${list})) {`,
    "  $errors = $null",
    "  [void][System.Management.Automation.PSParser]::Tokenize((Get-Content -Raw -LiteralPath $file), [ref]$errors)",
    "  if ($errors.Count -gt 0) {",
    "    $failed = 1",
    "    foreach ($item in $errors) { Write-Output ($file + '：' + $item.Message) }",
    "  }",
    "}",
    "exit $failed"
  ].join("; ");
  const run = spawnSync("pwsh", ["-NoProfile", "-NonInteractive", "-Command", script], {
    cwd: root,
    encoding: "utf8"
  });
  if (run.status !== 0) {
    printTail(`${run.stdout || ""}${run.stderr || ""}`, 20);
    return bad("有 .ps1 解析不过（上面是 PowerShell 给出的位置与原因）");
  }
  return ok(`${files.length} 个 .ps1 全部解析通过（只查语法，不执行）`);
}

// --write 的第一趟：先把文档数字按实际值修好，再让五套测试去核。
// 不加这一趟的话，stability 套件会先跑在「旧数字」上红一次，用户得跑两遍 --write 才绿
// （1.12.6 实测踩到过：stability 里有一条「文档里的测试项数和真实数量一致」）。
function realTestCount() {
  const source = readText("test/stability.test.cjs") || "";
  return (source.match(/^test\(/gm) || []).length;
}

function realDictionaryCount() {
  const run = runNode([path.join(root, "test/i18n-extract.cjs"), "--check"]);
  const counts = [...`${run.output}`.matchAll(/词条\s+(\d+)\s+条/g)].map((match) => Number(match[1]));
  const unique = [...new Set(counts)];
  return unique.length === 1 ? unique[0] : 0;
}

// 「当前状态」块也是脚本生成的（test/status.cjs），同样会漂；--write 里一起刷。
// 代价是 status.cjs 自己会把五套再跑一遍（--write 慢一点，但一次就绿）。
function refreshStatusBlock() {
  const run = runNode([path.join(root, "test/status.cjs"), "--write"]);
  for (const line of run.output.split(/\r?\n/)) {
    if (/当前状态|状态块/.test(line)) note(line.trim());
  }
  if (run.code !== 0) note("状态块已按实际结果刷新，但有红的套件（下面会逐条报）");
}

function prewriteDocCounts() {
  const dict = realDictionaryCount();
  const tests = realTestCount();
  let touched = 0;
  if (dict) for (const doc of DOCS) if (rewriteDictionaryCounts(doc, dict)) touched += 1;
  if (tests) for (const doc of DOCS) if (rewriteTestCounts(doc, tests)) touched += 1;
  section("--write：先按实际值对齐文档里的数字…");
  if (touched) note(`已改 ${touched} 处（词典 ${dict || "?"} 条 / 测试 ${tests || "?"} 项）`);
  else note("没有需要改的（数字已经对得上）");
  refreshStatusBlock();
}

// 审查 T-5（1.14.5）：数据层基准脚本刻意不进门禁（它跑得慢、数字依赖机器），代价是
// 性能回归没人拦。这里补一条**只警告、绝不失败**的宽预算：200 条记录整份重建统计库。
// 本机实测约 4 ms，2 秒上限宽松到几乎不可能误报；真超了说明有人写出了 O(n²)。
// 想量真实倍率还是手动跑 test 目录下那个基准脚本，那是另一件事（它刻意不进门禁）。
function checkLatencyBudget() {
  section("延迟预算（200 条记录，只警告不阻断）");
  const started = Date.now();
  try {
    const core = require(path.join(root, "stats-core.js"));
    const videos = [];
    for (let i = 0; i < 200; i += 1) {
      videos.push({
        bvid: "BV1xx411c7m" + i,
        title: "性能预算 " + i,
        collection: "性能预算",
        firstSeenAt: 1700000000000 + i * 1000,
        favoriteTime: "2024年1月1日0时0分0秒"
      });
    }
    core.databaseFromVideos(videos, {});
  } catch (error) {
    note(`跳过（${error.message}）`);
    return;
  }
  const cost = Date.now() - started;
  if (cost > 2000) note(`[warn] 200 条记录重建用了 ${cost} ms，超过 2000 ms 预算（查 O(n²)）`);
  else ok(`200 条记录重建 ${cost} ms`);
}

function main() {
  if (WRITE) prewriteDocCounts();
  checkSyntax();
  checkPowerShellSyntax();
  for (const [label, file] of SUITES) checkSuite(label, file);
  checkStatus();
  checkDictionary();
  reportOrphans();
  checkDocDictionary();
  checkDocTestCount();
  checkHistoryIndex();
  checkEggBaseline();
  checkPackageSize();
  checkLatencyBudget();
  console.log("");
  if (failed) {
    console.log(`[FAIL] 检查未通过（${failures.length} 处），修好之后重新跑：node scripts/check-all.cjs`);
    process.exitCode = 1;
    return;
  }
  console.log("[OK] 全部检查通过");
}

main();
