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
  "download.html", "download.js",
  "popup.html", "popup.js",
  "content.js",
  // 4.9：把后台纳入扫描。background.js 是模块化 service worker，加载不了 i18n.js，
  // 所以自己做了个存在性兜底；新增的界面文案仍写成 BcaI18n.t("字面量")。
  // 不纳入扫描的话，这些词条永远进不了词典（4.9 的 6 条就是这样漏掉的）。
  "background.js"
];
// 这些是语言名与第三方工具名，任何语言下都保持原样，不需要进词典。
// （品牌名「哔哩藏库」**要**翻译：繁中用「哔哩藏庫」、英文用 Bili Vault，所以不在此列。）
const NEVER_TRANSLATE = new Set([
  "简体中文", "繁體中文", "English", "DownKyi",
  "本地收藏库", "LOCAL VIDEO LIBRARY"
]);

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

function extractFrom(file) {
  const raw = fs.readFileSync(path.join(ROOT, file), "utf8");
  // 先剥掉注释：文档里举例写的 t("...") 会被当成真词条，产生查不到的“幽灵词条”
  const source = raw
    .replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (match, lead) => lead + " ".repeat(match.length - lead.length));
  const keys = new Map(); // key -> 出现次数

  const add = (raw, decoded) => {
    const key = decoded ? decodeEntities(raw) : unescapeLiteral(raw);
    if (!key || !key.trim()) return;
    if (!/[\u4e00-\u9fa5]/.test(key)) return; // 没有汉字说明不需要翻译
    if (NEVER_TRANSLATE.has(key)) return;
    keys.set(key, (keys.get(key) || 0) + 1);
  };

  if (file.endsWith(".html")) {
    // data-i18n*="..."：属性值就是 key
    for (const match of source.matchAll(/data-i18n(?:-html|-title|-placeholder|-aria)?="([^"]*)"/g)) {
      add(match[1], true);
    }
  } else {
    // t("...") / BcaI18n.t("...")，双引号与单引号都收
    for (const match of source.matchAll(/(?:\bBcaI18n\.)?\bt\(\s*"((?:[^"\\]|\\.)*)"/g)) add(match[1], false);
    for (const match of source.matchAll(/(?:\bBcaI18n\.)?\bt\(\s*'((?:[^'\\]|\\.)*)'/g)) add(match[1], false);
    // HTML 字符串模板里的 data-i18n="..."
    for (const match of source.matchAll(/data-i18n(?:-html|-title|-placeholder|-aria)?=\\?"([^"\\]*)"/g)) add(match[1], true);

    // content.js 特例：提示卡的文字是通过 showNotice(...) 传进去、再挂到
    // dataset.i18n 上的（值来自参数变量），照上面的规则一条都扫不到。
    // 不收的话提示卡就永远不会被翻译。
    for (const match of source.matchAll(/showNotice\(([\s\S]{0,400}?)\);/g)) {
      for (const literal of match[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)) add(literal[1], false);
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
    if (failed) process.exitCode = 1;
    return;
  }

  console.log(`共 ${keys.length} 条待翻译词条：`);
  for (const key of keys) console.log(`  ${key}`);
}

if (require.main === module) main();
module.exports = { collect, readDictionary, SOURCE_FILES, NEVER_TRANSLATE };
