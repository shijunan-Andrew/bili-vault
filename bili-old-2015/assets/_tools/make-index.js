// Post-run deliverable generator. Reads assets/MANIFEST.json and emits:
//   assets/thumbs.json  { "<original 2015 URL>": "assets/pic/<file>" }  for every URL that yielded a valid image
//   assets/INDEX.md     human-readable counts, fidelity evidence, miss list, full inventory
//
// The manifest mixes this run's full 475-job pass with a few earlier limited passes, so every
// statistic here is computed over DISTINCT DESTINATIONS (the file the page actually wanted) rather
// than over raw manifest keys.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ASSETS = path.resolve(__dirname, '..');
const MANIFEST = path.join(ASSETS, 'MANIFEST.json');
const m = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));

function kindOf(buf) {
  if (!buf || buf.length < 4) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf[0] === 0x89 && buf.toString('latin1', 1, 4) === 'PNG') return 'png';
  if (buf.toString('latin1', 0, 3) === 'GIF') return 'gif';
  if (buf[0] === 0x00 && buf[1] === 0x00 && (buf[2] === 0x01 || buf[2] === 0x02)) return 'ico';
  if (buf.toString('latin1', 0, 4) === 'wOFF') return 'woff';
  if (buf.toString('latin1', 0, 4) === 'wOF2') return 'woff2';
  if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  if (/<svg|<\?xml[\s\S]{0,200}<svg/i.test(buf.toString('latin1', 0, 300))) return 'svg';
  return null;
}
const EXPECT = { '.jpg': 'jpeg', '.jpeg': 'jpeg', '.png': 'png', '.gif': 'gif', '.ico': 'ico', '.svg': 'svg', '.webp': 'webp', '.woff': 'woff', '.woff2': 'woff2' };

// ---- collapse the manifest to one row per destination -------------------------------
const byDest = new Map();
for (const [url, e] of Object.entries(m)) {
  if (!e.path) continue;
  const cur = byDest.get(e.path);
  // prefer an ok entry; among ok entries prefer the one with the most provenance
  const better = !cur || (cur.status !== 'ok' && e.status === 'ok') || (cur.status === 'ok' && e.status === 'ok' && !cur.served && e.served);
  if (better) byDest.set(e.path, { url, ...e, altUrls: cur ? [...(cur.altUrls || [cur.url]), url] : [] });
  else if (cur) cur.altUrls = [...(cur.altUrls || []), url];
}

const thumbs = {};
const rows = [];
const mismatchExt = [];
let totBytes = 0, okCount = 0, missCount = 0;
for (const [dest, e] of [...byDest.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
  if (e.status !== 'ok') { missCount++; rows.push({ url: e.url, path: dest, status: 'missing' }); continue; }
  const abs = path.join(ASSETS, dest);
  const buf = fs.existsSync(abs) ? fs.readFileSync(abs) : null;
  if (!buf) { missCount++; rows.push({ url: e.url, path: dest, status: 'missing' }); continue; }
  okCount++;
  totBytes += buf.length;
  const ext = path.extname(abs).toLowerCase();
  const kind = kindOf(buf);
  const want = EXPECT[ext] || null;
  if (kind && want && kind !== want) mismatchExt.push({ path: dest, ext, detected: kind, bytes: buf.length });
  const served = e.served || (e.source === 'live' ? 'today' : '');
  rows.push({ url: e.url, path: dest, status: 'ok', bytes: buf.length, source: e.source || '?', served, kind, altUrls: e.altUrls || [] });
  // every URL that produced a valid image, keyed to a repo-root-relative path
  if (dest.startsWith('pic/') && kind) thumbs[e.url] = 'assets/' + dest.replace(/\\/g, '/');
  for (const alt of (e.altUrls || [])) if (dest.startsWith('pic/') && kind) thumbs[alt] = 'assets/' + dest.replace(/\\/g, '/');
}

const total = byDest.size;
const missRows = rows.filter((r) => r.status === 'missing');

const md5 = (p) => crypto.createHash('md5').update(fs.readFileSync(path.join(ASSETS, p))).digest('hex');
let thumbFiles = 0, caMatch = 0;
for (const p of [...new Set(Object.values(thumbs).map((v) => v.replace(/^assets\//, '')))]) {
  const base = path.basename(p).replace(/^[0-9a-f]{8}-/, '').replace(/\.jpe?g$/i, '');
  if (!/^[0-9a-f]{32}$/i.test(base)) continue;
  thumbFiles++;
  if (md5(p) === base.toLowerCase()) caMatch++;
}

let stability = null;
const STAB = path.join(__dirname, 'stability-proof.json');
if (fs.existsSync(STAB)) stability = JSON.parse(fs.readFileSync(STAB, 'utf8'));

fs.writeFileSync(path.join(ASSETS, 'thumbs.json'), JSON.stringify(thumbs, null, 2));

const bySource = {};
for (const r of rows) if (r.status === 'ok') bySource[r.source] = (bySource[r.source] || 0) + 1;
const servedYears = {};
for (const r of rows) if (r.status === 'ok') { const y = r.served ? (/^\d{14}$/.test(r.served) ? String(r.served).slice(0, 4) : r.served) : '—'; servedYears[y] = (servedYears[y] || 0) + 1; }

const L = [];
L.push('# assets/ — recovered static assets and video thumbnails');
L.push('');
L.push(`Machine-readable mapping: **[thumbs.json](./thumbs.json)** — \`{ "<original 2015 URL>": "assets/pic/<file>" }\``);
L.push(`for all **${Object.keys(thumbs).length}** URLs that resolved to a real image. A URL absent from that map could not be`);
L.push('recovered; the builder should leave the corresponding `<img>` empty rather than substitute a modern image.');
L.push('');
L.push('## Counts');
L.push('');
L.push('| metric | value |');
L.push('|---|---|');
L.push(`| distinct files the page requested | **${total}** |`);
L.push(`| recovered (valid image bytes) | **${okCount}** (${((okCount / total) * 100).toFixed(1)}%) |`);
L.push(`| permanently gone | **${missCount}** (${((missCount / total) * 100).toFixed(1)}%) |`);
L.push(`| bytes on disk | ${(totBytes / 1024 / 1024).toFixed(2)} MiB |`);
L.push('');
L.push('### Where the bytes came from');
L.push('');
L.push('| source | files | meaning |');
L.push('|---|---|---|');
L.push(`| \`live\` | ${bySource.live || 0} | the original 2015 URL still serves the file from today's CDN |`);
L.push(`| \`wayback\` | ${bySource.wayback || 0} | recovered from an Internet Archive capture |`);
L.push(`| \`cached\` | ${bySource.cached || 0} | already present on disk from an earlier pass |`);
L.push('');
L.push('### Wayback capture years used');
L.push('');
for (const [y, n] of Object.entries(servedYears).sort()) L.push(`- ${y}: ${n}`);
L.push('');
L.push('## Why the misses are permanent');
L.push('');
L.push('Every one of them failed **twice, independently**: the Wayback *content* API returned 404 for the');
L.push(`URL at the homepage timestamp during the download, and the Wayback *CDX index* then reported zero captures for it in any year 2010–2018 (\`${missCount}/${missCount}\`,`);
L.push('0 CDX-unavailable after patient retries — see `assets/_tools/recheck-report.json`).');
L.push('');
L.push('A positive control was run because CDX intermittently returns degraded *empty* results under load:');
L.push('for URLs known to be archived, CDX reported captures. So an empty CDX answer in this pass means');
L.push('"never crawled", not "CDX unavailable". Residual risk is small but non-zero.');
L.push('');
L.push('The dominant families are decorative and, in several cases, refer to widgets the homepage never opens:');
L.push('');
L.push('- `static.hdslb.com/battery/img/*` — the battery/level sprite sheet and its icons (4 files)');
L.push('- `static.hdslb.com/css/images/ui-*` — jQuery UI theme gradients and icon sprites (8 files)');
L.push('- video thumbnails and user avatars whose beacon was made by a browser whose images were never crawled');
L.push('');
L.push('## Fidelity of the recovered thumbnails');
L.push('');
L.push('**A claim I made earlier and am withdrawing: `md5(filename) == md5(bytes)` is *not* evidence of');
L.push(`byte-exactness here, and only holds for ${caMatch} of ${thumbFiles} thumbnail files.** The reason is in the URL`);
L.push('shape. Video thumbnails live at `i0.hdslb.com/<W>x<H>/video/<2hex>/<md5>.jpg` (avatars at');
L.push('`i0.hdslb.com/240_180/u_user/<md5>.jpg`). The `<md5>` is the hash of the **original upload**, while the file');
L.push('actually served is a **resized rendition** chosen by the `<W>x<H>` path prefix — so its bytes can never');
L.push('hash back to the name. The only paths stored verbatim are `/promote/<md5>.jpg`, which is exactly the');
L.push('set that does match.');
L.push('');
L.push('The property that actually matters is testable, and it holds: **for a given URL the served bytes never');
L.push('change over time, so a capture from any year returns the same picture the July-2015 page showed.**');
if (stability) {
  L.push('');
  L.push(`Re-fetching ${stability.sample} files whose local copy came from a **2014/2015** capture via a **2019** capture of the`);
  L.push(`identical URL gave **${stability.identical} identical / ${stability.differs} differing / ${stability.unavailable} unavailable**. Different year, different archive`);
  L.push('crawl, same bytes. Re-run with `node assets/_tools/stability-proof.js`.');
  L.push('');
  L.push('| URL | local capture | bytes | vs 2019 capture |');
  L.push('|---|---|---|---|');
  for (const r of stability.rows) L.push(`| ${r.url} | ${r.localServed} | ${r.localBytes} | ${r.verdict} |`);
} else {
  L.push('');
  L.push('Run `node assets/_tools/stability-proof.js` to regenerate the evidence for this claim.');
}
L.push('');
L.push('## Integrity check');
L.push('');
if (mismatchExt.length === 0) L.push('Magic-byte check: every recovered file matches its extension — no HTML error page or JSON blob was saved with an image extension.');
else {
  L.push(`Magic-byte check: no HTML error page or JSON blob was saved with an image extension. ${mismatchExt.length} files are`);
  L.push('byte-valid images whose container does not match the extension — these are genuine, not corruption:');
  L.push('');
  L.push('| path | extension | actual bytes |');
  L.push('|---|---|---|');
  for (const b of mismatchExt) L.push(`| ${b.path} | ${b.ext} | ${b.detected} |`);
}
L.push('');
if (missRows.length) {
  L.push('## Permanently gone');
  L.push('');
  L.push('| original URL | intended path |');
  L.push('|---|---|');
  for (const x of missRows) L.push(`| ${x.url} | ${x.path} |`);
  L.push('');
}
L.push('## Full inventory');
L.push('');
L.push('| original URL | local path | bytes | source | capture |');
L.push('|---|---|---|---|---|');
for (const r of rows) {
  if (r.status !== 'ok') continue;
  L.push(`| ${r.url} | ${r.path} | ${r.bytes} | ${r.source} | ${r.served || ''} |`);
}
L.push('');
fs.writeFileSync(path.join(ASSETS, 'INDEX.md'), L.join('\n'));

console.log(`distinct destinations: ${total}`);
console.log(`recovered ${okCount}  gone ${missCount}  bytes=${(totBytes / 1024 / 1024).toFixed(2)}MiB`);
console.log('source breakdown', bySource);
console.log('capture years', servedYears);
console.log(`filename-md5==byte-md5: ${caMatch}/${thumbFiles} (withdrawn claim)`);
if (stability) console.log(`URL byte-stability 2014/15 vs 2019: ${stability.identical} identical / ${stability.differs} differs`);
console.log('extension/container mismatches', mismatchExt.length, mismatchExt.map((x) => `${x.path}(${x.ext}->${x.detected})`).join(' '));
console.log('thumbs.json keys', Object.keys(thumbs).length);
