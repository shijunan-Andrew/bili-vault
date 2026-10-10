"use strict";
// V1.1.0 弹窗：先看差异
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

/* ── ① background.js：tabs.query 要先判权限（manifest 没有 tabs 权限） ── */
edit("background.js", [[
  `  const tabs = await chrome.tabs.query({ url: "https://space.bilibili.com/*/favlist*" });
  for (const tab of tabs) {
    const found = String(tab?.url || "").match(/^https:\\/\\/space\\.bilibili\\.com\\/(\\d+)\\/favlist/)?.[1] || "";
    if (found) {
      await chrome.storage.local.set({ lastImportUid: found });
      return { uid: found, tabId: tab.id ?? null };
    }
  }`,
  `  // manifest 里没有 tabs 权限，这个查询可能直接抛错或返回没有 url 的标签页；
  // 都当成"找不到"处理，退回下面用缓存 uid 走后台直连。
  try {
    const tabs = await chrome.tabs.query({ url: "https://space.bilibili.com/*/favlist*" });
    for (const tab of tabs) {
      const found = String(tab?.url || "").match(/^https:\\/\\/space\\.bilibili\\.com\\/(\\d+)\\/favlist/)?.[1] || "";
      if (found) {
        await chrome.storage.local.set({ lastImportUid: found });
        return { uid: found, tabId: tab.id ?? null };
      }
    }
  } catch (_) { /* 没有 tabs 权限，正常情况，走缓存 */ }`,
  "tabs.query 加保护"
]]);

/* ── ② popup.html：按钮 + 结果块 ── */
edit("popup.html", [[
  `            <button id="startImport" class="primary" type="button" data-i18n="开始导入" disabled>开始导入</button>
          </div>`,
  `            <button id="startImport" class="primary" type="button" data-i18n="开始导入" disabled>开始导入</button>
            <button id="diffFolders" class="secondary diff-button" type="button" data-i18n="先看差异" disabled>先看差异</button>
            <p class="diff-hint" data-i18n="只对比收藏夹列表，不抓取每条视频的详情：2800 条约 1~2 分钟。导入本身要 30 分钟以上，所以建议先看一眼变了什么。">只对比收藏夹列表，不抓取每条视频的详情：2800 条约 1~2 分钟。导入本身要 30 分钟以上，所以建议先看一眼变了什么。</p>
          </div>
          <div id="diffResult" class="diff-result" hidden></div>`,
  "差异按钮与结果块"
]]);

/* ── ③ popup.js ── */
edit("popup.js", [
  [
    `const startImportButton = document.getElementById("startImport");`,
    `const startImportButton = document.getElementById("startImport");
const diffFoldersButton = document.getElementById("diffFolders");
const diffResult = document.getElementById("diffResult");`,
    "取元素"
  ],
  [
    `  startImportButton.disabled = importBusy || selected === 0;`,
    `  startImportButton.disabled = importBusy || selected === 0;
  diffFoldersButton.disabled = importBusy || selected === 0;
  diffFoldersButton.textContent = selected ? BcaI18n.t("先看差异（{count} 个）", { count: selected }) : BcaI18n.t("先看差异");`,
    "按钮状态"
  ],
  [
    `  startImportButton.addEventListener("click", startImport);`,
    `  startImportButton.addEventListener("click", startImport);
  diffFoldersButton.addEventListener("click", startDiff);`,
    "绑定点击"
  ],
  [
    `  if (message?.type !== "bca-import-progress") return;`,
    `  if (message?.type === "bca-diff-progress") { importProgressText.textContent = message.text || ""; return; }
  if (message?.type !== "bca-import-progress") return;`,
    "监听对比进度"
  ],
  [
    `async function startImport() {`,
    `/* V1.1.0：先看差异。
   只对比收藏夹列表（40 条/请求），不抓详情（1.25 条/秒）—— 这是它能"1~2 分钟出结果"的唯一原因。
   结果同时写一份到 归档根目录/002同步报告/，完整列表（可能几百条）在文件里看。 */
async function startDiff() {
  if (importBusy) return;
  const folderIds = [...importFolderList.querySelectorAll('input[type="checkbox"]:checked')].map((input) => input.value);
  if (!folderIds.length) return;
  if (!rootHandle) {
    importStatus.textContent = BcaI18n.t("请先选择本地保存文件夹。");
    importStatus.classList.add("error");
    return;
  }
  importBusy = true;
  importStatus.textContent = "";
  importStatus.classList.remove("error");
  diffResult.hidden = true;
  importProgressTitle.textContent = BcaI18n.t("正在对比差异");
  importProgressText.textContent = BcaI18n.t("正在读取 B 站收藏夹列表…");
  updateImportSelection();
  try {
    const response = await chrome.runtime.sendMessage({ type: "bca-fav-diff", data: { folderIds } });
    if (!response?.ok) throw new Error(response?.message ? BcaI18n.t(response.message) : BcaI18n.t("对比差异失败。"));
    renderDiffResult(response);
    const diffs = Array.isArray(response.diffs) ? response.diffs : [];
    const sum = (key) => diffs.reduce((n, d) => n + (d[key]?.length || 0), 0);
    importStatus.textContent = BcaI18n.t("对比完成：新增 {added}、线上已移除 {removed}、新失效 {invalid}、恢复 {recovered}。",
      { added: sum("added"), removed: sum("removed"), invalid: sum("newlyInvalid"), recovered: sum("recovered") });
    if (response.reportPath) importStatus.textContent += " " + BcaI18n.t("报告：{path}", { path: response.reportPath });
  } catch (error) {
    importStatus.textContent = error?.message ? BcaI18n.t(error.message) : BcaI18n.t("对比差异失败。");
    importStatus.classList.add("error");
  } finally {
    importBusy = false;
    updateImportSelection();
  }
}

function renderDiffResult(response) {
  const diffs = Array.isArray(response?.diffs) ? response.diffs : [];
  diffResult.replaceChildren();
  // 全部用 textContent 拼，不碰 innerHTML —— 收藏夹名与视频标题都是用户数据
  for (const diff of diffs) {
    const line = document.createElement("p");
    line.className = "diff-line";
    const name = document.createElement("strong");
    name.textContent = \`「\${diff.folderTitle}」\`;
    line.append(name, document.createTextNode(
      BcaI18n.t("新增 {added} / 线上已移除 {removed} / 新失效 {invalid} / 恢复 {recovered}",
        { added: diff.added?.length || 0, removed: diff.removed?.length || 0,
          invalid: diff.newlyInvalid?.length || 0, recovered: diff.recovered?.length || 0 })));
    if (diff.incomplete) {
      const warn = document.createElement("small");
      warn.className = "diff-warn";
      warn.textContent = BcaI18n.t("本次读取可能不完整，结果仅供参考");
      line.append(warn);
    }
    diffResult.append(line);
  }
  diffResult.hidden = diffs.length === 0;
}

async function startImport() {`,
    "startDiff 实现"
  ]
]);

/* ── ④ popup.css：只加新类的规则，用设计令牌 ── */
{
  const eol = eolOf("popup.css");
  let css = fs.readFileSync(`${REPO}/popup.css`, "utf8").replace(/\r\n/g, "\n");
  if (css.includes(".diff-button")) {
    console.log("  ⏭  popup.css：规则已存在");
  } else {
    css = css.trimEnd() + `

/* V1.1.0：先看差异。新类的规则，不覆盖任何既有选择器。 */
.diff-button {
  width: 100%;
  margin-top: var(--sp-2);
}

.diff-hint {
  margin: var(--sp-2) 0 0;
  color: var(--muted);
  font-size: var(--fs-sm);
  line-height: 1.6;
}

.diff-result {
  margin-top: var(--sp-3);
  padding: var(--sp-3);
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--surface);
}

.diff-line {
  margin: 0;
  color: var(--text);
  font-size: var(--fs-base);
  line-height: 1.7;
}

.diff-line + .diff-line {
  margin-top: var(--sp-1);
}

.diff-line strong {
  color: var(--ink);
  font-weight: 600;
}

.diff-warn {
  display: block;
  color: var(--warning-ink, var(--muted));
  font-size: var(--fs-sm);
}
`;
    fs.writeFileSync(`${REPO}/popup.css`, css.replace(/\n/g, eol), "utf8");
    console.log("  ✅ popup.css：新增 .diff-* 规则");
  }
}
