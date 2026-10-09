"use strict";
// 反向检查：找出「看起来是界面文字、却没有被 t() 包住」的中文字符串字面量。
// 提取工具只能证明“已经标记的能翻”，证明不了“该标的都标了”——这个脚本补上另一半。
const fs = require("node:fs");
const files = ["library.js", "popup.js", "download.js", "content.js"];

// 这些是内部用的常量/日志/查询键，不是界面文字
const IGNORE = [
  /^unknown$/i,
  /^(GET|POST)$/,
  /^bca-/,
  /^\d/,
  /^[\x00-\x7F]+$/
];

// 归档/报告的格式键名与正文：写进 视频信息.txt 或 001错误报告/ 的内容，
// 任何语言下都必须保持中文，**翻译了归档格式就乱了**。
// 它们出现在 STAT_FIELDS 这类「解析用映射表」的值里，看着像界面文字但不是。
const ARCHIVE_FORMAT = new Set([
  "视频信息.txt", "封面.png", "下载错误报告_",
  "【基本信息】", "【UP主】", "【标签】", "【视频简介】", "【互动数据】", "【视频信息】",
  "视频标题", "视频链接", "视频收藏时间", "信息保存于", "保存文件夹", "恢复情况",
  "BV号", "av号", "视频状态", "已失效视频", "该视频已失效",
  "UP主昵称", "UP主UID", "UP主主页", "UP主粉丝数",
  "分区", "视频时长", "视频发布时间", "未知", "未分类收藏",
  "000视频下载", "001错误报告",
  "播放量", "弹幕量", "点赞数", "投硬币枚数", "收藏人数", "转发人数",
  "收藏夹：", "生成时间：", "错误数：", "MP4 单文件", "DASH 音视频分轨"
]);

// 匹配宿主页面 DOM 的选择器：翻译了就再也匹配不上，功能直接坏
const HOST_SELECTORS = new Set([
  "添加到收藏夹", "确定", "私密", "公开", "仅自己可见", "所有人可见", "编辑", "删除"
]);

function stripCommentsAndT(frame) {
  // 把已经被 t(...) 包住的字面量抹掉，剩下的才是可疑的
  return frame.replace(/(?:\bBcaI18n\.)?\bt\(\s*"(?:[^"\\]|\\.)*"/g, "t(«已标记»");
}

for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  const withoutComments = source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + " ".repeat(m.length - p1.length));
  const scanned = stripCommentsAndT(withoutComments);
  const suspects = [];
  for (const match of scanned.matchAll(/"((?:[^"\\]|\\.)*)"/g)) {
    const text = match[1];
    if (!/[\u4e00-\u9fa5]/.test(text)) continue;
    if (IGNORE.some((pattern) => pattern.test(text))) continue;
    if (ARCHIVE_FORMAT.has(text) || HOST_SELECTORS.has(text)) continue;
    // 跨行模板字符串（带 ${} 的代码片段）是解析局限，不是漏标记
    if (text.includes("${") || text.length > 60) continue;
    const line = scanned.slice(0, match.index).split("\n").length;
    suspects.push({ line, text });
  }
  console.log(`\n=== ${file}：${suspects.length} 处可疑 ===`);
  for (const item of suspects) console.log(`  ${String(item.line).padStart(5)}  ${item.text.slice(0, 78)}`);
}
