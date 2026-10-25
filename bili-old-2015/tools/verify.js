// tools/verify.js — acceptance checks on the built index.html, run against the file on disk.
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const file = path.join(ROOT, 'index.html');
const html = fs.readFileSync(file, 'utf8');
const TARGET = 'https://www.bilibili.com/';
const fails = [];
const notes = [];

const count = (re) => (html.match(re) || []).length;
const bytes = Buffer.byteLength(html);
const mb = (bytes / 1048576).toFixed(2);

// 1. every anchor leads to the live homepage
const anchors = [...html.matchAll(/<a\b[^>]*>/gi)].map((m) => m[0]);
const badHref = anchors.filter((a) => !new RegExp(`href="${TARGET.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'i').test(a));
if (badHref.length) fails.push(`${badHref.length} anchors do not point at ${TARGET} (e.g. ${badHref[0].slice(0, 90)})`);
const noTarget = anchors.filter((a) => !/target="_blank"/i.test(a));
if (noTarget.length) fails.push(`${noTarget.length} anchors lack target="_blank"`);

// 2. self-contained: nothing the browser would actually FETCH points outside the file.
//    (data-empty="<url>" is inert provenance — no browser loads a data-* attribute.)
const remoteSrc = [...html.matchAll(/\bsrc(?:set)?="((?:https?:)?\/\/[^"]+)"/gi)].map((m) => m[1]);
if (remoteSrc.length) fails.push(`${remoteSrc.length} remote src references remain (e.g. ${remoteSrc.slice(0, 3).join(', ')})`);
const linkHref = [...html.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]);
if (linkHref.length) fails.push(`${linkHref.length} <link> tags survived (stylesheets must be inlined)`);
const cssUrlCount = [...html.matchAll(/url\((['"]?)([^)'"]+)\1\)/gi)].map((m) => m[2]);
// `data:` 与「真的存在、且在文档目录之内」的相对文件都算离线安全；其余（远程、跳出目录、缺文件）一律算失败。
const cssRemote = cssUrlCount.filter((u) => {
  const t = u.trim();
  if (/^data:/i.test(t)) return false;
  if (/^(?:https?:)?\/\//i.test(t) || t.includes('..')) return true;
  const abs = path.join(ROOT, t.split('?')[0].split('#')[0]);
  return !(fs.existsSync(abs) && fs.statSync(abs).size > 0);
});
if (cssRemote.length) fails.push(`${cssRemote.length} css url() still fetch a remote file (e.g. ${cssRemote.slice(0, 3).join(', ')})`);

// 3. scripts: exactly ONE tag, and it must be <script src="egg-2015.js"> as the last thing
//    before </html>. Inline scripts are forbidden outright: chrome-extension:// pages run under
//    script-src 'self', so an inline block is dead weight that also logs a CSP violation into the
//    extension's error page every time the page opens (1.11.0 shipped exactly that; fixed in 1.11.1).
const eggJsPath = path.join(ROOT, 'egg-2015.js');
const eggJs = fs.existsSync(eggJsPath) ? fs.readFileSync(eggJsPath, 'utf8') : null;
const scriptTags = [...html.matchAll(/^<script\b[^>]*>/gim)].map((m) => m[0]);
if (scriptTags.length !== 1) fails.push(`expected exactly 1 <script> tag (egg-2015.js), found ${scriptTags.length}: ${scriptTags.join(' | ')}`);
if (/<script\b[^>]*\bsrc="(?:https?:)?\/\//i.test(html)) fails.push('a remote <script src=...> survived the build');
const inlineTags = scriptTags.filter((t) => !/\bsrc=/i.test(t));
const extTags = scriptTags.filter((t) => /\bsrc=/i.test(t));
if (inlineTags.length) fails.push(`${inlineTags.length} inline <script> block(s) survived — MV3 CSP blocks them and the extension error page records a violation`);
if (extTags.length !== 1 || !/\bsrc="egg-2015\.js"/i.test(extTags[0] || '')) fails.push(`expected exactly one <script src="egg-2015.js">, found ${JSON.stringify(extTags)}`);
if (!eggJs || !eggJs.trim()) fails.push('egg-2015.js is missing next to index.html (the extension environment has nothing to run)');
else {
  notes.push(`egg-2015.js on disk (${eggJs.length} chars), no inline <script>`);
  if (!html.trimEnd().endsWith('<script src="egg-2015.js"></script>\n</html>')) fails.push('egg-2015.js is not loaded as the last tag before </html>');
}

// 4. the click router is present and correct
//    1.11.1 起这段 JS 只存在于 egg-2015.js，markup 与 CSS 仍在 html —— 合并起来一起找。
const src = `${html}\n${eggJs || ''}`;
if (!/var TARGET = 'https:\/\/www\.bilibili\.com\/';/.test(src)) fails.push('click router lost its https://www.bilibili.com/ target');
if (!/window\.open\(TARGET, '_blank'\)/.test(src)) fails.push('click router does not open the live homepage');
if (!/addEventListener\('click'/.test(src)) fails.push('click router missing');
if (!/addEventListener\('submit'/.test(src)) fails.push('submit router missing');
// 关掉之后 catch-all 不许再导航（关闭那一次手势的点击不能顺带跳走）
if (!/hasAttribute\('data-egg-dismissed'\)\) return;/.test(src)) fails.push('click router does not honour the data-egg-dismissed marker');

// 4b. the egg dialog is present and closes through paths that do not depend on script order:
//     a pure-CSS path (label -> hidden checkbox -> :checked hides the overlay), pointerdown,
//     a window-capture click guard, and Esc.
if (!/<input type="checkbox" id="eggDialogOkToggle"/.test(src)) fails.push('egg dialog css kill-switch checkbox missing');
if (!/<div id="eggDialogOverlay"/.test(src)) fails.push('egg dialog markup missing');
if (!/<label id="eggDialogOk"[^>]*for="eggDialogOkToggle"[^>]*>知道啦<\/label>/.test(src)) fails.push('egg dialog 知道啦 control missing (must be a <label for="eggDialogOkToggle">)');
if (!/#eggDialogOkToggle:checked ~ #eggDialogOverlay \{[\s\S]{0,60}display: none/.test(src)) fails.push('egg dialog css kill-switch rule missing');
if (!/html:has\(#eggDialogOkToggle:checked\) #eggDialogOverlay/.test(src)) fails.push('egg dialog css kill-switch fallback (html:has) missing');
if (!/window\.addEventListener\('pointerdown'/.test(src)) fails.push('egg dialog close path (pointerdown) missing');
if (!/window\.addEventListener\('click'/.test(src)) fails.push('egg dialog click guard missing');
if (!/=== 'Escape'/.test(src)) fails.push('egg dialog Esc close path missing');
if (!/#eggDialogOverlay \{[\s\S]{0,200}position: fixed/.test(src)) fails.push('egg dialog styles missing');
// 关掉之后本次浏览不再自己回来：带版本号的 storage 记号 + 页面加载时先查一次
if (!/biliVaultEggDismissed\.v1/.test(src)) fails.push('egg dialog versioned storage key missing');
if (!/if \(remembered\(\)\) closeDialog\(\);/.test(src)) fails.push('egg dialog does not consult the stored state on load');
if (!/sessionStorage\.setItem\(KEY/.test(src) || !/localStorage\.setItem\(KEY/.test(src)) fails.push('egg dialog does not record the dismissed state in both storages');
if (!/catch \(e\) \{\}/.test(src)) fails.push('egg dialog storage writes are not wrapped in try/catch (file:// / private mode throws)');
if (!/__bili2015Wired/.test(src)) fails.push('egg dialog lacks the __bili2015Wired guard (double wiring)');

// 5. structure: the ten category rows + the fixed pieces are all in the document
const wanted = [
  ['#b_index_top', 'id="b_index_top"'], ['#b_promote', 'id="b_promote"'],
  ['#b_douga', 'id="b_douga"'], ['#b_bangumi', 'id="b_bangumi"'], ['#b_music', 'id="b_music"'],
  ['#b_dance', 'id="b_dance"'], ['#b_game', 'id="b_game"'], ['#b_technology', 'id="b_technology"'],
  ['#b_ent', 'id="b_ent"'], ['#b_kichiku', 'id="b_kichiku"'], ['#b_movie', 'id="b_movie"'],
  ['#b_teleplay', 'id="b_teleplay"'], ['#index_nav', 'id="index_nav"'],
  ['header', 'class="header"'], ['footer', 'class="footer"'],
];
for (const [label, needle] of wanted) if (!html.includes(needle)) fails.push(`missing ${label}`);

// 6. images: inline data uris vs. asset files vs. boxes deliberately left empty
const dataImgs = count(/<img[^>]*src="data:image\//gi);
const assetImgs = count(/<img[^>]*src="assets\//gi);
const emptyImgs = count(/<img[^>]*data-empty="[^"]*"/gi);
const unresolvedImgs = count(/<img[^>]*data-(?:img|missing)="[^"]*"/gi);
// 两种形态都合法：老的单文件（全部内联）与 2026-10-25 起的瘦身形态（外链 assets/）。
if (!dataImgs && !assetImgs) fails.push('no images at all (neither data: nor assets/ references)');
if (unresolvedImgs) fails.push(`${unresolvedImgs} <img> are still waiting to be resolved (data-img/data-missing)`);

// 7. the archived page is not still referenced
if (/web\.archive\.org/i.test(html)) {
  const n = count(/web\.archive\.org/gi);
  notes.push(`${n} mentions of web.archive.org remain (wombat/comments inside vendored css?)`);
}
// 8. counters / runtime data got filled in
const placeholder = count(/class="addnew_\d+">--</g);
if (placeholder) fails.push(`${placeholder} addnew counters still show the "--" placeholder`);

notes.push(`file ${(bytes / 1048576).toFixed(2)} MB`);
notes.push(`anchors ${anchors.length}, all -> bilibili: ${anchors.length - badHref.length}`);
notes.push(`images inlined as data uri: ${dataImgs}`);
notes.push(`thumbnail boxes left empty (no 2015 file anywhere): ${emptyImgs}`);
notes.push(`css url(data:) inline: ${count(/url\(['"]?data:/gi)}`);
notes.push(`addnew badges filled: ${count(/class="addnew_\d+" title=/g)}`);
notes.push(`scripts: ${scriptTags.length} (egg-2015.js, no inline copy)`);

// 9. 从磁盘直接打开（file://）也要能用：子资源只能是 data: URI、或同目录/子目录里的真实文件。
//    2026-10-25 瘦身后默认走「外链 assets/」的形态（同一张图不再被内联 551 次），
//    所以这里不再要求「一律 data:」，改成要求「相对引用必须真的在磁盘上」——
//    远程主机、`../` 跳出目录、指向不存在的文件，仍然一律判失败。
const relSrc = [...html.matchAll(/\b(?:src|href)="(?!data:|https:\/\/www\.bilibili\.com\/|#)([^"]*)"/gi)]
  .map((m) => m[1]).filter((u) => u && !/^javascript:/i.test(u) && u !== 'egg-2015.js');
const badRefs = relSrc.filter((u) => {
  if (/^(?:https?:)?\/\//i.test(u)) return true;          // 任何远程地址都不许留
  if (u.includes('..')) return true;                       // 不许跳出这一层目录
  const abs = path.join(ROOT, u.split('?')[0].split('#')[0]);
  return !(fs.existsSync(abs) && fs.statSync(abs).size > 0);
});
if (badRefs.length) fails.push(`${badRefs.length} relative sub-resource references do not resolve to a real local file (e.g. ${badRefs.slice(0, 3).join(', ')})`);
notes.push(`relative sub-resource refs (must exist on disk, e.g. assets/…): ${relSrc.length}, unresolved: ${badRefs.length}`);

console.log('--- notes ---');
notes.forEach((n) => console.log('  ', n));
if (fails.length) {
  console.log('--- FAIL ---');
  fails.forEach((f) => console.log('  FAIL', f));
  process.exitCode = 1;
} else {
  console.log('--- all acceptance checks passed ---');
}
