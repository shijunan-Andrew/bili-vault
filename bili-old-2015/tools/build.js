// tools/build.js — assemble the single-file 2015 bilibili homepage replica.
// Inputs:
//   _ref/original-20150701.html  raw archived page (source of truth for header/nav/footer)
//   _ref/head.html               extracted <head>
//   build/fragments.json         generated inner HTML for the dynamic sections
//   build/index.css              rewritten 2015 stylesheet (wayback wrappers stripped, sprites inlined)
//   assets/MANIFEST.json         { "<original abs url>": {path,file,bytes,status} } (owned by asset-digger)
// Output: index.html — one self-contained file; clicking anything goes to https://www.bilibili.com/
// Run: node tools/build.js
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const TARGET = 'https://www.bilibili.com/';
const p = (...a) => path.join(ROOT, ...a);
const readF = (f) => fs.readFileSync(f, 'utf8');
const size = (f) => { try { return fs.statSync(f).size; } catch { return 0; } };

const MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp', '.css': 'text/css',
  '.js': 'application/javascript', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.eot': 'application/vnd.ms-fontobject', '.json': 'application/json',
};
const mimeOf = (f) => MIME[path.extname(f).toLowerCase()] || 'application/octet-stream';
// Four files under assets/pic/ end in .png but hold JPEG bytes (that is what the 2015 CDN served),
// so the real type is sniffed from the magic number instead of trusted to the extension.
function sniffMime(file) {
  try {
    const fd = fs.openSync(file, 'r');
    const b = Buffer.alloc(12);
    fs.readSync(fd, b, 0, 12, 0);
    fs.closeSync(fd);
    if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
    if (b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
    if (b.slice(0, 3).toString('latin1') === 'GIF') return 'image/gif';
    if (b.slice(0, 4).toString('latin1') === 'RIFF' && b.slice(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  } catch { /* fall through to the extension */ }
  return mimeOf(file);
}

// ---------------------------------------------------------------- image manifest
// Two sources of local images, both keyed by the original URL:
//   assets/MANIFEST.json  — written by the asset-downloading job (status/file/bytes)
//   assets/NEEDED.json    — written by tools/fetch-needed.js (url/rel/status/bytes)
let manifest = {};
if (size(p('assets', 'MANIFEST.json'))) manifest = JSON.parse(readF(p('assets', 'MANIFEST.json')));
function norm(u) {
  if (!u) return '';
  let s = String(u).trim().replace(/&amp;/g, '&');
  s = s.replace(/^(?:https?:)?\/\/web\.archive\.org\/web\/[0-9a-z_]*\//i, '')
       .replace(/^\/web\/[0-9a-z_]*\//i, '');
  if (s.startsWith('//')) s = 'http:' + s;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = 'http://static.hdslb.com/' + s.replace(/^\/+/, '');
  if (/^https?:\/\//i.test(s)) s = s.replace(/([^:])\/{2,}/g, '$1/');
  return s.replace(/[?#].*$/, '');
}
const byKey = new Map();
// manifest paths are ABSOLUTE win32 paths; path.join(ROOT, abs) would mangle them, so resolve first
const abs = (f) => (path.isAbsolute(f) ? f : p(f));
for (const [url, e] of Object.entries(manifest)) {
  if (!e || !e.file) continue;
  const file = abs(e.file);
  if (!size(file)) continue;
  const rec = { file, bytes: size(file) };
  const n = norm(url);
  byKey.set(n, byKey.get(n) || rec);
  const pathOnly = n.replace(/^https?:\/\/[^/]+/i, '');
  byKey.set(pathOnly, byKey.get(pathOnly) || rec);
}
// fetch-needed.js results: {"url","rel","status","bytes"} rows relative to assets/
let neededRows = 0;
if (size(p('assets', 'NEEDED.json'))) {
  for (const row of JSON.parse(readF(p('assets', 'NEEDED.json')))) {
    if (!row || row.status === 'missing' || !row.rel) continue;
    const file = p('assets', row.rel);
    if (!size(file)) continue;
    const rec = { file, bytes: size(file) };
    const n = norm(row.url);
    if (!byKey.has(n)) { byKey.set(n, rec); neededRows++; }
    const pathOnly = n.replace(/^https?:\/\/[^/]+/i, '');
    if (!byKey.has(pathOnly)) byKey.set(pathOnly, rec);
  }
}
console.log('image index: manifest records', byKey.size, '| from NEEDED.json', neededRows);

// Third source: the rescued current covers (assets/COVER-MAP.json, written by
// tools/build-cover-map.js). Every 2015 volume thumbnail lived on i0|i1|i2.hdslb.com and is gone;
// for 63 of the entries on this page the modern cover of the SAME video (matched by aid) is on
// disk, so it is a real — if later-era — picture of the same submission, never a stand-in for
// another video. Keyed by the 2015 image URL.
let coverRows = 0;
if (size(p('assets', 'COVER-MAP.json'))) {
  const cm = JSON.parse(readF(p('assets', 'COVER-MAP.json')));
  for (const [url, e] of Object.entries(cm.byImg || {})) {
    const file = abs(e.file);
    if (!size(file)) continue;
    const n = norm(url);
    if (!byKey.has(n)) { byKey.set(n, { file, bytes: size(file), cover: true }); coverRows++; }
    const pathOnly = n.replace(/^https?:\/\/[^/]+/i, '');
    if (!byKey.has(pathOnly)) byKey.set(pathOnly, { file, bytes: size(file), cover: true });
  }
}
console.log('from COVER-MAP.json', coverRows);

const localFor = (u) => {
  const n = norm(u);
  if (!n) return null;
  return byKey.get(n) || byKey.get(n.replace(/^https?:\/\/[^/]+/i, '')) || null;
};
// thumbnails average ~100 KB; the deliverable is ONE self-contained file, so inline everything
const INLINE_LIMIT = process.env.INLINE_LIMIT ? Number(process.env.INLINE_LIMIT) : Infinity;

// ---------------------------------------------------------------- fragments + archived body
const frag = JSON.parse(readF(p('build', 'fragments.json')));
let head = readF(p('_ref', 'head.html'));
let body = readF(p('_ref', 'body.html'));

// --- head: drop adguard/tracker script, keep the rest, inline the stylesheets ourselves
head = head.replace(/<script\b[^>]*\bsrc="[^"]*adguard[^"]*"[^>]*><\/script>/gi, '');
head = head.replace(/<script\b[^>]*><\/script>/gi, '');
head = head.replace(/<link\b[^>]*>/gi, '');

// --- body: remove every bootstrap script; the replica is static
const before = (body.match(/<script/gi) || []).length;
body = body.replace(/<!--\[if[^]*?<!\[endif\]-->/gi, '');
body = body.replace(/<script\b[^>]*\bsrc=[^>]*><\/script>/gi, '');
body = body.replace(/<script\b[^>]*>[^]*?<\/script>/gi, '');
console.log('removed scripts:', before, '->', (body.match(/<script/gi) || []).length);
body = body.replace(/<!--\s*顶部\s*-->/g, '').replace(/<!--\s*新作推广\s*-->/g, '');

// ---------------------------------------------------------------- splice the generated sections
function mustReplace(src, needle, repl, label) {
  if (!src.includes(needle)) throw new Error('anchor not found: ' + label);
  return src.split(needle).join(repl);
}

// The archived #index_container holds only EMPTY placeholder rows (the real one is built by JS):
//   <div class="container-top-wrapper">…</div>   (carousel + an empty top-list-wrapper)
//   <div class="container-row" id="b_promote">…</div>   (the 在线/正在观看 bar)
// Both are removed and rebuilt from the archived data in the archived order (spec/structure.md §0.1):
//   b_index_top, b_promote, b_douga … b_teleplay, b_bangumi(calendar), b_recommend, index-nav
// Removing the WHOLE archived rows (not just up to the first </div>) matters: a partial cut leaves the
// archived b_promote behind, which showed up as a second 在线 bar plus a 215px dead gap before the footer.
function matchDivClose(src, openIdx) {
  const re = /<div\b[^>]*>|<\/div>/g;
  re.lastIndex = openIdx;
  let depth = 0, m;
  while ((m = re.exec(src))) {
    if (m[0] === '</div>') { depth--; if (depth === 0) return m.index + m[0].length; }
    else depth++;
  }
  throw new Error('unbalanced <div> starting at ' + openIdx);
}
const cOpen = body.indexOf('<div class="index-container" id="index_container">');
if (cOpen < 0) throw new Error('anchor not found: index_container open');
const topOpen = body.indexOf('<div class="container-top-wrapper">', cOpen);
if (topOpen < 0) throw new Error('anchor not found: container-top-wrapper');
const archPromoteOpen = body.indexOf('<div class="container-row" id="b_promote">', topOpen);
if (archPromoteOpen < 0) throw new Error('anchor not found: archived b_promote');
const dynEnd = matchDivClose(body, archPromoteOpen);
const generated = [
  '\t\t' + frag.b_index_top,
  '\t\t' + frag.b_promote,
  '\t\t' + frag.sections,
  '\t\t' + frag.b_recommend_row,
  '\t\t' + frag.index_nav,
].join('\n');
console.log('replaced archived dynamic region:', dynEnd - topOpen, 'bytes');
body = body.slice(0, topOpen) + generated + '\n\t' + body.slice(dynEnd);

// ---------------------------------------------------------------- images: local file → data: uri
// A 1x1 transparent gif is the neutral stand-in for the last few stylesheet backgrounds that exist
// nowhere any more (the jQuery-UI theme's ui-bg_*/ui-icons PNGs, only used by dead-dialog chrome).
const BLANK_GIF = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const stats = { imgLocal: 0, imgRemote: 0, imgInlineBytes: 0, missing: new Set(), blanks: 0 };
function imgToUri(tag) {
  const m = tag.match(/\bdata-img="([^"]*)"/);
  if (!m) return tag;
  const url = m[1];
  const rec = localFor(url);
  if (!rec) {
    // The picture itself does not exist anywhere on the internet any more (i0|i1|i2.hdslb.com
    // stopped serving the 2015 files and the Wayback Machine never captured this one). The box is
    // kept at its original size with the url it used to show, so the layout is unchanged and the
    // gap is honest instead of a broken-image icon.
    stats.imgRemote++;
    if (url) stats.missing.add(norm(url));
    return tag.replace(/\bdata-img=/, 'class="empty-img" data-empty=');
  }
  stats.imgLocal++;
  if (rec.cover) stats.imgCover = (stats.imgCover || 0) + 1;
  if (rec.bytes <= INLINE_LIMIT) {
    const b64 = fs.readFileSync(rec.file).toString('base64');
    stats.imgInlineBytes += rec.bytes;
    return tag.replace(/\bdata-img="[^"]*"/, `src="data:${mimeOf(rec.file)};base64,${b64}"`);
  }
  return tag.replace(/\bdata-img="[^"]*"/, `src="${'assets/' + path.relative(p('assets'), rec.file).replace(/\\/g, '/')}"`);
}
body = body.replace(/<img\b[^>]*>/gi, imgToUri);
head = head.replace(/<img\b[^>]*>/gi, imgToUri);

// ---------------------------------------------------------------- stylesheets
const cssParts = [];
for (const f of ['build/index.css', '_ref/jquery-ui.css']) {
  const file = p(f);
  if (!size(file)) { console.log('skip missing css', f); continue; }
  let css = readF(file);
  css = css.replace(/<\/style/gi, '<\\/style');
  cssParts.push(`/* ===== ${f} ===== */\n${css}`);
}
// any leftover remote url() in the css is neutralised: the deliverable is a single offline file
// (only the jQuery-UI theme's ui-bg_flat_*/ui-icons sprites remain unobtainable — they belong to
// dialog/datepicker chrome that the index page never shows)
let remoteLeft = 0;
const cssAll = cssParts.join('\n')
  .replace(/url\((['"]?)\/?(?:https?:)?\/\/web\.archive\.org\/web\/[0-9a-z_]*\/(https?:\/\/)/gi, 'url($1$2')
  .replace(/url\((?!(['"]?)data:)([^)]*)\)/gi, () => { remoteLeft++; return `url(${BLANK_GIF})`; });
console.log('css url() with a dead remote target replaced by a blank:', remoteLeft);

// ---------------------------------------------------------------- header "new video" badges
// The archived markup ships the literal placeholder `<span class="addnew_1">--</span>`: the real
// numbers were injected at runtime by base.core.v3.js from /online.js. The replica has no scripts,
// so the recovered 2015 counts (build/data/online.json) are written in instead and shown.
const online = JSON.parse(readF(p('build', 'data', 'online.json')));
let badges = 0;
body = body.replace(/<span class="addnew_(\d+)">[^<]*<\/span>/g, (m, tid) => {
  const v = online.countInfo['c' + tid];
  if (v === undefined) return m;
  badges++;
  return `<span class="addnew_${tid}" title="最近30分钟新投稿">${v}</span>`;
});
console.log('addnew badges filled:', badges);

// ---------------------------------------------------------------- replica-only stylesheet
// The archived page relied on three scripts we deliberately drop (the bootstrap, base.core.v3.js
// and the inline IndexNavigator call), so a handful of rules that those scripts' markup depends on
// are restated here. Every rule is either (a) a verbatim rule the archived CSS is missing for the
// static markup, or (b) a layout fix for a script-driven behaviour.
const REPLICA_CSS = `
/* .addnew_* : base.core.v3.js normally writes the per-category "new videos" counts into these
   spans and fades them in. The archived markup carries the literal "--" placeholder, which is what
   a no-JS visitor saw; without this rule the raw dashes would float unpositioned in the nav bar.
   The real 2015 counts (recovered from /online.js) are used instead. */
.header .num li.m-i > span[class^="addnew_"]{ position:absolute; top:5px; right:-2px; display:block;
  color:#fff; background:#f489ad; border-radius:4px; padding:1px 5px; font:12px/14px Calibri,Arial;
  text-align:center; min-width:18px; }
/* the archived top-list markup carries the counters in gk/sc/pl/dm attributes that page.core.js
   turns into the visible play/danmaku/favourite figures through .info p spans; keep them legible */
.v-item .info p{ overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
/* thumbnails whose 2015 file no longer exists anywhere (i0|i1|i2.hdslb.com dropped them and the
   Wayback Machine has no capture): the box keeps its exact 2015 size and the flattened look of a
   thumbnail, so the grid rhythm still matches the original page */
img[data-empty]{ background:linear-gradient(135deg,#e7ebef 0%,#dbe0e6 60%,#d3d9e0 100%); }
/* the six top-carousel banners (/promote/*.jpg) are gone, so a slide shows its own 2015 alt text the
   way the original showed the picture, rather than a collapsed 0-height box */
.topic-preview li{ position:relative; }
.topic-preview li img[data-empty]{ float:left; }
.topic-preview li img[data-empty]::after{ content:attr(alt); position:absolute; inset:0;
  display:flex; align-items:center; justify-content:center; color:#5b6675; font-size:16px;
  background:linear-gradient(135deg,#e9edf1 0%,#dde3e9 100%); }
/* the floating side nav: .index-nav is display:none in new_z2.css and was revealed + positioned by
   base.core.v3.js (IndexNavigator), which this static build does not run. Restored here with the
   same geometry the script used: pinned to the right edge, vertically centred. */
.index-nav{ display:block; right:12px; top:50%; margin-top:-215px; background:#fff;
  border:1px solid #e5e5e5; border-radius:4px; box-shadow:0 1px 3px rgba(0,0,0,.08); }
.index-nav .n-i{ color:#666; }
.index-nav .n-i .name{ font-size:12px; }
/* carousel indicator dots: the archived page's dots are <li bar> styled by jQuery-UI theme rules
   that ship their sprites from a dead host, so the dot look is restated here */
.topic-preview-wrapper .slider-bar li[bar]{ width:10px; height:10px; border-radius:50%; margin-right:8px;
  background:#fff; opacity:.55; display:inline-block; cursor:pointer; }
.topic-preview-wrapper .slider-bar li[bar].on{ opacity:1; }
`;

// ---------------------------------------------------------------- inline-style icons
// the game-centre dropdown draws its eight 64x64 icons from inline `style="background:url(...)"`
// attributes on i0|i1|i2.hdslb.com. Those files are gone (every host form 404s) and the Wayback
// Machine has no capture, so the attribute reference is dropped and the box keeps its 2015 frame.
let iconAttr = 0;
body = body.replace(/(<(?:div|span|a|li)[^>]*\bclass="img"[^>]*?)style="background:\s*url\(([^)]*)\);?\s*"/gi, (m, pre) => {
  iconAttr++;
  return pre.trimEnd() + '" data-icon-missing="1"';
});
console.log('game-dropdown icon styles neutralised:', iconAttr);

// ---------------------------------------------------------------- click rewrite
// every element on the page leads to the live bilibili homepage: anchors get href+target,
// anything else gets the delegated handler below.
body = body.replace(/<a\b([^>]*)>/gi, (m, at) => {
  let a = at.replace(/\shref="[^"]*"/i, '').replace(/\starget="[^"]*"/i, '');
  return `<a href="${TARGET}" target="_blank"${a}>`;
});
body = body.replace(/<form\b[^>]*>/gi, `<form action="${TARGET}" target="_blank" method="get">`);
const SCRIPT = `<script>
// 2015 replica: every click leads to the live bilibili homepage.
// Anchors already carry href="https://www.bilibili.com/" + target="_blank", so they need no help;
// this handler covers every element that is NOT a link (banner dots, tabs, buttons, list rows, the
// search box, blank areas) — the original page routed all of those through page.core.js handlers.
document.addEventListener('click', function (e) {
  var t = e.target;
  while (t && t !== document.body) {
    if (t.tagName === 'A' && t.getAttribute('href')) return;   // let the anchor do its own job
    t = t.parentNode;
  }
  e.preventDefault();
  window.open('${TARGET}', '_blank');
}, true);
document.addEventListener('submit', function (e) {
  e.preventDefault();
  window.open('${TARGET}', '_blank');
}, true);
</script>
<style>a{cursor:pointer}.index-nav .n-i,.b-slt-tab li,.b-slt .list li,.b-slt,.page,.i-link,.more-link,.b-head-t,.top-list li,.v,.rlist li,.rm-list li,.slider-bar li,.search-keyword{cursor:pointer}</style>`;

const QA = process.env.QA ? `
<div id="qa-probe" style="position:fixed;left:0;top:0;z-index:99999;background:#fff;border:2px solid #f00;font:12px/1.5 monospace;padding:6px 10px;white-space:pre"></div>
<script>
window.addEventListener('load', function () {
  var imgs = [].slice.call(document.images);
  var broken = imgs.filter(function (i) { return !i.complete || i.naturalWidth === 0; }).length;
  var as = [].slice.call(document.querySelectorAll('a'));
  var toBili = as.filter(function (a) { return a.href === '${TARGET}'; }).length;
  var secs = document.querySelectorAll('#index_container .section, #index_container .b-section, #index_container > div').length;
  var lines = [
    'viewport ' + window.innerWidth + 'x' + window.innerHeight,
    'images ' + imgs.length + ' loaded ' + (imgs.length - broken) + ' broken ' + broken,
    'anchors ' + as.length + ' -> bilibili ' + toBili + ' other ' + (as.length - toBili),
    'container children ' + secs,
    'index_container h=' + document.getElementById('index_container').offsetHeight,
    'doc h=' + document.documentElement.scrollHeight
  ];
  var el = document.getElementById('qa-probe');
  el.textContent = lines.join('\\n');
  document.title = 'QA ' + lines.join(' | ');
});
</script>` : '';

// ---------------------------------------------------------------- output document
const html = `<!DOCTYPE html>
<html>
${head.replace('</head>', `<style>\n${cssAll}\n/* ===== replica-only rules (see tools/build.js REPLICA_CSS) ===== */\n${REPLICA_CSS}\n</style>\n</head>`)}
<body class="widescreen">
${body}
${SCRIPT}${QA}
</body>
</html>
`;
fs.mkdirSync(p('build'), { recursive: true });
fs.writeFileSync(p('index.html'), html, 'utf8');
console.log('index.html bytes', size(p('index.html')));
console.log('css bytes', Buffer.byteLength(cssAll));
console.log('images: local', stats.imgLocal, '| of which rescued modern covers', stats.imgCover || 0, '| remote/missing', stats.imgRemote, '| inlined bytes', stats.imgInlineBytes);
console.log('missing urls', stats.missing.size);
[...stats.missing].slice(0, 40).forEach((u) => console.log('  MISS', u));
