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

/* ══ ① 全局出网限速器，装在唯一的出网口上 ══ */
edit("background.js", [
  [
    `const IMPORT_PAGE_DELAY_MS = 220;`,
    `const IMPORT_PAGE_DELAY_MS = 220;

/* ---------- 全局出网限速（所有 B 站接口调用都必须过这里） ----------

   README 的「使用须知」第一条就是：
     「请勿滥用：插件会代替你请求 B 站接口，请求过密可能触发风控，
       导致 IP 或账号被临时限制。请分批、低速使用。」

   但在 V1.1.6 之前，这个约定只靠**每个调用点自己记得加延迟** ——
   于是一个新写的功能（「最近 N 天」先拉全 71 页再过滤）就把用户扫进了风控，
   停了好一会儿没法继续开发。靠人记的规则迟早会被忘掉。

   所以把限速放进**唯一的出网口** biliImportApiGet() 里：
   不管谁调用、调用多少次，两次请求之间都至少隔 BILI_MIN_REQUEST_INTERVAL_MS。
   新增功能即使完全不写延迟，也不可能快过这个下限。

   修改这个常量前先想清楚：它同时决定了"最快能多快"和"多久会被限流"。 */
const BILI_MIN_REQUEST_INTERVAL_MS = 320;
let biliRequestSlotAt = 0;

// 预约一个不早于"上次预约 + 最小间隔"的时间点再往下走。
// 先占坑再等待，所以并发调用也会被排成有间隔的一串，而不是同时冲出去。
async function biliThrottleWait() {
  const slot = Math.max(Date.now(), biliRequestSlotAt + BILI_MIN_REQUEST_INTERVAL_MS);
  biliRequestSlotAt = slot;
  const wait = slot - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
}`,
    "加全局限速器"
  ],
  [
    `async function biliImportApiGet(path, params = {}, timeoutMs = 15000, tabId = null) {
  const url = new URL(path, "https://api.bilibili.com");`,
    `async function biliImportApiGet(path, params = {}, timeoutMs = 15000, tabId = null) {
  // 唯一的出网口 —— 所有 B 站请求都在这里排队限速，见 biliThrottleWait 的说明
  await biliThrottleWait();
  const url = new URL(path, "https://api.bilibili.com");`,
    "出网口接上限速器"
  ]
]);

/* ══ ② 红线写进 AI_HANDOFF ══ */
edit("AI_HANDOFF.md", [[
  `8. 改动以上任一项前，先回到这一节确认，并在汇报里说明理由。`,
  `8. **不得绕过出网限速**：所有 B 站接口调用必须走 \`biliImportApiGet()\`，那里有全局最小间隔（\`BILI_MIN_REQUEST_INTERVAL_MS\`）。**不要在别处写裸 \`fetch\` 打 B 站接口，也不要把间隔调小。** README 的「使用须知」第一条就是"请勿滥用：请求过密可能触发风控，导致 IP 或账号被临时限制"—— 这不只是给用户看的提示，是**开发时必须遵守的约束**。2026-10-10 就因为一个新功能（「最近 N 天」先拉全 71 页再过滤）把开发者本人扫进了风控，停了好一阵没法继续测。**加任何会多发请求的功能前，先算一遍它会产生多少次请求**：一次收藏夹列表 = \`条数 / 40\` 次，一条视频详情 = 1 次（限速 1.25 秒/条）。算不清就别写。
   \`\`\`powershell
   Select-String -LiteralPath background.js -Pattern 'await fetch\\('   # 除 biliImportApiGet 内部外应为空
   \`\`\`
9. 改动以上任一项前，先回到这一节确认，并在汇报里说明理由。`,
  "红线加「不得绕过限速」"
]]);
