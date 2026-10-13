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
const cssRemote = cssUrlCount.filter((u) => !/^data:/i.test(u.trim()));
if (cssRemote.length) fails.push(`${cssRemote.length} css url() still fetch a remote file (e.g. ${cssRemote.slice(0, 3).join(', ')})`);

// 3. no <script src>, and the page carries exactly its two inline scripts:
//    the click router and the self-contained egg dialog (they must not merge: the dialog script
//    owns the close paths, the router owns the jump, and each is asserted separately below).
if (/<script[^>]*\bsrc=/i.test(html)) fails.push('a <script src=...> survived the build');
if (count(/<script\b/gi) !== 2) fails.push(`expected exactly 2 inline scripts (click router + egg dialog), found ${count(/<script\b/gi)}`);

// 4. the click router is present and correct
if (!/window\.open\('https:\/\/www\.bilibili\.com\/', '_blank'\)/.test(html)) fails.push('click router does not open the live homepage');
if (!/addEventListener\('click'/.test(html)) fails.push('click router missing');
if (!/addEventListener\('submit'/.test(html)) fails.push('submit router missing');

// 4b. the egg dialog is present and self-contained (script + markup + its own styles)
if (!/<div id="eggDialogOverlay"/.test(html)) fails.push('egg dialog markup missing');
if (!/<button id="eggDialogOk"[^>]*>知道啦<\/button>/.test(html)) fails.push('egg dialog 知道啦 button missing');
if (!/overlay\.addEventListener\('pointerdown'/.test(html)) fails.push('egg dialog close path (pointerdown) missing');
if (!/window\.addEventListener\('click'/.test(html)) fails.push('egg dialog click guard missing');
if (!/#eggDialogOverlay \{[\s\S]{0,200}position: fixed/.test(html)) fails.push('egg dialog styles missing');

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

// 6. images: inline data uris vs. boxes deliberately left empty
const dataImgs = count(/<img[^>]*src="data:image\//gi);
const emptyImgs = count(/<img[^>]*data-empty="[^"]*"/gi);
const unresolvedImgs = count(/<img[^>]*data-(?:img|missing)="[^"]*"/gi);
if (!dataImgs) fails.push('no inlined images at all');
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
notes.push(`scripts: ${count(/<script\b/gi)}`);

// 9. the file must work when opened directly from disk (file://): every sub-resource is a data: uri,
//    so no relative path can 404 and no CORS rule applies.
const relSrc = [...html.matchAll(/\b(?:src|href)="(?!data:|https:\/\/www\.bilibili\.com\/|#)([^"]*)"/gi)]
  .map((m) => m[1]).filter((u) => u && !/^javascript:/i.test(u));
if (relSrc.length) fails.push(`${relSrc.length} relative sub-resource references would break file:// (e.g. ${relSrc.slice(0, 3).join(', ')})`);
notes.push(`relative sub-resource refs (file:// safety): ${relSrc.length}`);

console.log('--- notes ---');
notes.forEach((n) => console.log('  ', n));
if (fails.length) {
  console.log('--- FAIL ---');
  fails.forEach((f) => console.log('  FAIL', f));
  process.exitCode = 1;
} else {
  console.log('--- all acceptance checks passed ---');
}
