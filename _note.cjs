"use strict";
const fs = require("node:fs");
const FILE = "C:/Users/Maxwell/Desktop/bili-vault/AI_HANDOFF.md";
const eol = fs.readFileSync(FILE, "utf8").includes("\r\n") ? "\r\n" : "\n";
let text = fs.readFileSync(FILE, "utf8").replace(/\r\n/g, "\n");

const from = "5. 界面改动遵守上文“界面与设计系统”的六条约定；";
const to = `5. **改 \`release.ps1\` 之前先读这条**：PowerShell 5.1 下，**原生命令写到 stderr 的内容会被包装成 ErrorRecord**，配合脚本顶部的 \`$ErrorActionPreference = 'Stop'\` 会**直接终止脚本 —— 即使那条命令其实成功了**。\`git push\` 的进度、\`node --check\` 的语法错误、git 的各种警告全都写 stderr。V1.1.0 发布时就踩了这个：推送明明成功、tag 和 main 都到位了，脚本却报"推送失败"并 \`exit 1\`。**所以脚本里所有原生命令都必须走 \`Invoke-Native\`**（它把 stderr 降级成普通字符串），正确性一律靠 \`$LASTEXITCODE\` 判断。加了新的 git/node 调用后，用这条查有没有漏网的：
   \`\`\`powershell
   Select-String -LiteralPath release.ps1 -Pattern '& \\$Git|& \\$Node'   # 除 Invoke-Native 内部外应为空
   \`\`\`
   这个坑有个便宜的复现方式：\`git push\` 一个已经推完的分支，git 会往 stderr 写 "Everything up-to-date"。
6. 界面改动遵守上文“界面与设计系统”的六条约定；`;

const n = text.split(from).length - 1;
if (n !== 1) throw new Error(`锚点出现 ${n} 次`);
text = text.replace(from, to);
fs.writeFileSync(FILE, text.replace(/\n/g, eol), "utf8");
console.log("  ✅ AI_HANDOFF：新增 release.ps1 的 stderr 坑");
