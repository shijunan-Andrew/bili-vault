#!/usr/bin/env node
/* ==========================================================================
   i18n 词条工具（4.5）
   --------------------------------------------------------------------------
   因为采用「中文原文当 key」，简体中文不需要词典，所以词条清单必须从代码里
   反向提取。这个脚本做三件事：

     node test/i18n-extract.cjs            列出全部词条
     node test/i18n-extract.cjs --todo     生成 locales/_todo.json（给翻译用）
     node test/i18n-extract.cjs --check    校验 zh-TW / en 是否覆盖全部词条

   --check 会用于回归测试：漏翻译会让对应界面回退成中文，必须能测出来。
   ========================================================================== */
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const SOURCE_FILES = [
  "library.html", "library.js",
  // 1.3.0 起下载页（download.html / download.js）已整体删除
  "popup.html", "popup.js",
  // V1.3.1：使用说明页（guide.html）接入了 i18n —— 它加载 i18n.js 并由 tutorial.js 调 init。
  // 两页共用 tutorial.js，所以那个文件也一起扫（它里面的 t("字面量") 同样需要词条）。
  // 安装教程页（tutorial.html）同理：不写进来的话，它缺词条不会报错，只会静默退回中文。
  "guide.html", "tutorial.html", "tutorial.js",
  // V1.3.2：三个悬浮球合成右下角的齿轮，主题 / 语言 / 使用说明都搬进了设置页。
  // 不写进来的话，设置页缺词条不会报错，只会静默退回中文。
  "settings.html", "settings.js",
  // 1.5.0：数据统计页与宠物挂件。不写进来的话，它们缺词条不会报错，
  // 只会静默退回中文 —— 使用说明页当初就是这样漏掉的。
  "stats.html", "stats.js", "pet.js",
  "content.js",
  // 4.9：把后台纳入扫描。background.js 是模块化 service worker，加载不了 i18n.js，
  // 所以自己做了个存在性兜底；新增的界面文案仍写成 BcaI18n.t("字面量")。
  // 不纳入扫描的话，这些词条永远进不了词典（4.9 的 6 条就是这样漏掉的）。
  "background.js",
  // 1.9.0：归档维护从收藏库搬到设置页，扫盘/回收站/记录映射独立成 archive-tools.js；
  // 回收站是独立页面（recycle.html / recycle.js）。三个新文件都要扫，否则它们的词条
  // 只会静默退回中文。
  "archive-tools.js", "recycle.html", "recycle.js"
];
// 这些是语言名与第三方工具名，任何语言下都保持原样，不需要进词典。
// （品牌名「哔哩藏库」**要**翻译：繁中用「哔哩藏庫」、英文用 Bili Vault，所以不在此列。）
// 1.15.7（审查 C-13）：`t(变量)` 这种调用静态提取不到 —— 词条会静默退回中文。
// 这类调用只允许出现在「收 key 再翻译」的包装函数里，总数钉一个上限，新增就会被看到。
const DYNAMIC_KEY_LIMIT = 11;

const NEVER_TRANSLATE = new Set([
  "简体中文", "繁體中文", "English", "DownKyi",
  "本地收藏库", "LOCAL VIDEO LIBRARY"
]);

// 抽取器看不出来、但确实要翻的词条。两类：
//   ① 整条都是占位符、不含汉字（“{name}” 这种），被「没有汉字就不用翻」那条规则挡掉；
//   ② 后台 / 内容脚本抛给界面翻的文案（throw new Error("…")、message: "…"），界面上是
//      BcaI18n.t(error.message) 翻的 —— 抽取器只认 t("…") 的调用点，认不出这条链。
// 只能显式列出来。新增同类文案时把原文加进这张表，否则它在英文界面里会原样显示中文。
const EXTRA_KEYS = [
  "“{name}”",
  "没有找到要对比的收藏夹。如果本地归档改过名，请先在 B 站核对名称。",
  "后台没有回应（超过 15 秒）。请重新加载 B 站页面或重启浏览器再试一次。"
];

// 调用点把「中文原文」当 key 传进去、函数体里再 BcaI18n.t(key) 的助手函数。
// window 是「从函数名往后看多少个字符」，够覆盖一次调用的实参即可。
const KEY_ARGUMENT_HELPERS = [
  // content.js 的提示卡：文字通过 showNotice(...) 传进去、再挂到 dataset.i18n 上
  { source: "showNotice", window: 400 },
  // settings.js 的背景图与 UID 状态：函数体第一件事都是 BcaI18n.t(key)
  { source: "showWallpaperStatus", window: 300 },
  { source: "showWallpaperError", window: 300 },
  { source: "showForgetUidStatus", window: 300 },
  // 1.10.3：设置页的确认统一走 askConfirm(key, vars)，key 同样是词条。
  { source: "askConfirm", window: 400 },
  // 1.8.22（old-p3 security P3-2）：各扩展页开头调 BcaI18n.guardTopFrame("提示", "错误")，
  // 函数体里 t(String(message)) —— 这两个字面量同样要做成词条。
  { source: "(?:\\bBcaI18n\\.)?\\bguardTopFrame", window: 500 }
];

function decodeEntities(text) {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

// 把 JS/HTML 里的字符串字面量转成真实文本（处理 \" \' \\ \n 以及换行续行）
function unescapeLiteral(raw) {
  return raw.replace(/\\(.)/g, (match, char) => ({ n: "\n", t: "\t", r: "", "\\": "\\", '"': '"', "'": "'", "`": "`" }[char] ?? char));
}

// 剥注释：两个函数（真提取与动态 key 检查）必须用同一套规则，否则数出来的不是一回事
function stripComments(raw) {
  // 先剥掉注释：文档里举例写的 t("...") 会被当成真词条，产生查不到的“幽灵词条”
  return raw
    .replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, " "))
    // 反斜杠后面那两个斜杠是正则字面量的一部分（/^https?:\/\//i 这种写法不是注释），
    // 不排除的话整行后半截会被当成注释清空，那些词条就永远扫不到（P2 清理时踩到）。
    .replace(/(^|[^:\\])\/\/[^\n]*/g, (match, lead) => lead + " ".repeat(match.length - lead.length));
}

// 1.15.7（审查 C-13）：找 `t(变量)` 这类静态提取不到的调用，供 --check 报出来
function findDynamicKeyCalls() {
  const rows = [];
  let total = 0;
  for (const file of SOURCE_FILES) {
    if (!file.endsWith(".js")) continue;
    const source = stripComments(fs.readFileSync(path.join(ROOT, file), "utf8"));
    const hits = [...source.matchAll(/(?:\bBcaI18n\.)?\b(?:t|translate)\(\s*([A-Za-z_$][\w$]*)\s*[,)]/g)];
    if (hits.length) rows.push(`${file} ${hits.length} 处`);
    total += hits.length;
  }
  return { total, rows };
}

function extractFrom(file) {
  const raw = fs.readFileSync(path.join(ROOT, file), "utf8");
  const source = stripComments(raw);
  const keys = new Map(); // key -> 出现次数

  const add = (raw, decoded) => {
    const key = decoded ? decodeEntities(raw) : unescapeLiteral(raw);
    if (!key || !key.trim()) return;
    if (!/[\u4e00-\u9fa5]/.test(key)) return; // 没有汉字说明不需要翻译
    if (NEVER_TRANSLATE.has(key)) return;
    keys.set(key, (keys.get(key) || 0) + 1);
  };

  if (file.endsWith(".html")) {
    // data-i18n*="..."：属性值就是 key。1.17.0 起多了 -label ——
    // <optgroup> 的分组名只能通过 label 属性翻（改 textContent 会把整组选项擦掉）。
    for (const match of source.matchAll(/data-i18n(?:-html|-title|-placeholder|-aria|-label)?="([^"]*)"/g)) {
      add(match[1], true);
    }
  } else {
    // t("...") / BcaI18n.t("...") / translate("...")，双引号与单引号都收。
    // translate 是 pet.js 里那层薄包装（词典坏了也要让挂件显示原文），
    // 不认它的话挂件那 5 条词条永远扫不到。
    for (const match of source.matchAll(/(?:\bBcaI18n\.)?(?:\bt|translate)\(\s*"((?:[^"\\]|\\.)*)"/g)) add(match[1], false);
    for (const match of source.matchAll(/(?:\bBcaI18n\.)?(?:\bt|translate)\(\s*'((?:[^'\\]|\\.)*)'/g)) add(match[1], false);
    // t(条件 ? "甲" : "乙")：三元表达式落在 t( 里面，上面两条只认 t( 后紧跟引号的形态。
    // 两个分支都是可翻译文案，都收（settings.js 的「更换背景图片 / 选择背景图片」就是这种）。
    for (const match of source.matchAll(/(?:\bBcaI18n\.)?\bt\(\s*[^()]*?\?\s*"((?:[^"\\]|\\.)*)"\s*:\s*"((?:[^"\\]|\\.)*)"/g)) {
      add(match[1], false);
      add(match[2], false);
    }
    for (const match of source.matchAll(/(?:\bBcaI18n\.)?\bt\(\s*[^()]*?\?\s*'((?:[^'\\]|\\.)*)'\s*:\s*'((?:[^'\\]|\\.)*)'/g)) {
      add(match[1], false);
      add(match[2], false);
    }
    // HTML 字符串模板里的 data-i18n="..."
    for (const match of source.matchAll(/data-i18n(?:-html|-title|-placeholder|-aria)?=\\?"([^"\\]*)"/g)) add(match[1], true);

    // 「收 key 再翻译」的助手函数：函数体里写的是 BcaI18n.t(key)，调用点传的是字面量，
    // 照上面的规则一条都扫不到。这类包装函数只能在这里显式登记 —— **新写一个就把名字加进
    // 下面那张表**，否则它的文案永远进不了词典（缺了不报错，只是切语言时不翻译）。
    // 窗口内的双引号字面量全收，所以 showWallpaperError(条件 ? "甲" : "乙") 这种也能拿到。
    for (const helper of KEY_ARGUMENT_HELPERS) {
      const callPattern = new RegExp(helper.source + "\\(([\\s\\S]{0," + helper.window + "}?)\\);", "g");
      for (const match of source.matchAll(callPattern)) {
        for (const literal of match[1].matchAll(/"((?:[^"\\\\]|\\\\.)*)"/g)) add(literal[1], false);
      }
    }
    for (const match of source.matchAll(/dataset\.i18n[A-Za-z]*\s*=\s*"((?:[^"\\]|\\.)*)"/g)) add(match[1], false);
  }
  return keys;
}

function collect() {
  const all = new Map();
  for (const file of SOURCE_FILES) {
    for (const [key, count] of extractFrom(file)) {
      all.set(key, (all.get(key) || 0) + count);
    }
  }
  for (const key of EXTRA_KEYS) all.set(key, (all.get(key) || 0) + 1);
  return all;
}

function readDictionary(locale) {
  const file = path.join(ROOT, "locales", `${locale}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`locales/${locale}.json 不是合法 JSON：${error.message}`);
  }
}

function main() {
  const args = process.argv.slice(2);
  const keys = [...collect().keys()].sort((a, b) => a.localeCompare(b, "zh-CN"));

  if (args.includes("--todo")) {
    const todo = {};
    for (const key of keys) todo[key] = "";
    const file = path.join(ROOT, "locales", "_todo.json");
    fs.writeFileSync(file, JSON.stringify(todo, null, 2) + "\n", "utf8");
    console.log(`已写出 ${file}（${keys.length} 条）`);
    return;
  }

  if (args.includes("--check")) {
    let failed = false;
    for (const locale of ["zh-TW", "en"]) {
      const dictionary = readDictionary(locale);
      if (!dictionary) {
        console.log(`${locale}: 词典文件不存在，跳过`);
        continue;
      }
      const missing = keys.filter((key) => !dictionary[key]);
      const extra = Object.keys(dictionary).filter((key) => !keys.includes(key));
      console.log(`${locale}: 词条 ${Object.keys(dictionary).length} 条，缺 ${missing.length} 条，多余 ${extra.length} 条`);
      for (const key of missing.slice(0, 10)) console.log(`   缺: ${key}`);
      for (const key of extra.slice(0, 10)) console.log(`   多: ${key}`);
      if (missing.length) failed = true;
    }
    // 1.15.7（审查 C-13）：动态 key 不能增长 —— 涨了就说明有人新写了 t(变量) 却没登记
    const dynamic = findDynamicKeyCalls();
    if (dynamic.total > DYNAMIC_KEY_LIMIT) {
      console.log(`动态 key（t(变量)）${dynamic.total} 处，超过上限 ${DYNAMIC_KEY_LIMIT}：${dynamic.rows.join("、")}`);
      console.log("   这些词条静态提取不到：要么改写成字面量，要么把它登记进 KEY_ARGUMENT_HELPERS。");
      failed = true;
    } else {
      console.log(`动态 key（t(变量)）${dynamic.total} 处，未超过上限 ${DYNAMIC_KEY_LIMIT}：${dynamic.rows.join("、")}`);
    }
    if (failed) process.exitCode = 1;
    return;
  }

  console.log(`共 ${keys.length} 条待翻译词条：`);
  for (const key of keys) console.log(`  ${key}`);
}

if (require.main === module) main();
module.exports = { collect, readDictionary, SOURCE_FILES, NEVER_TRANSLATE };
