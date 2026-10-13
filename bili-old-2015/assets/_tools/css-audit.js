// Completeness audit: list every url() in the three stylesheets, classified by whether
// the downloader picked it up. Catches refs skipped by the extension filter.
const fs = require('fs');
const path = require('path');
const REF = path.resolve(__dirname, '..', '..', '_ref');
const EXT = /\.(png|jpe?g|gif|ico|svg|webp|woff2?|ttf|eot|cur)(\?|$)/i;

const specs = [
  ['new_z2.css', 'http://static.hdslb.com/'],
  ['index.css', 'http://static.hdslb.com/'],
  ['jquery-ui.css', 'http://static.hdslb.com/css/'],
];
function normalize(raw, base) {
  let u = raw.trim().replace(/^['"]|['"]$/g, '');
  if (!u || u.startsWith('#')) return u;
  const wb = /^(?:https?:)?(?:\/\/web\.archive\.org)?\/web\/\d{14}(?:im_|if_|id_|cs_|js_)?\/(.+)$/.exec(u);
  if (wb) u = wb[1];
  if (/^\/\//.test(u)) u = 'http:' + u;
  if (/^https?:\/\//i.test(u)) return u.replace(/^https:/i, 'http:');
  if (u.startsWith('/')) return base + u;
  return base + (base.endsWith('/') ? '' : '/') + u;
}
const skipped = [], taken = new Set(), dataCount = { n: 0 };
for (const [file, base] of specs) {
  const txt = fs.readFileSync(path.join(REF, file), 'utf8');
  const re = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g;
  let m;
  while ((m = re.exec(txt))) {
    const raw = m[2].trim();
    if (raw.startsWith('data:')) { dataCount.n++; continue; }
    const abs = normalize(raw, base);
    if (EXT.test(abs)) { taken.add(abs); continue; }
    skipped.push({ file, raw: raw.slice(0, 90), abs: String(abs).slice(0, 110) });
  }
}
console.log('unique asset refs collected:', taken.size);
console.log('data: URIs (inline, nothing to fetch):', dataCount.n);
console.log('refs SKIPPED by the extension filter:', skipped.length);
const seen = new Set();
for (const s of skipped) {
  const k = s.raw;
  if (seen.has(k)) continue;
  seen.add(k);
  console.log(`   [${s.file}] ${s.raw}`);
}
console.log('\nall collected refs, by host:');
const byHost = {};
for (const u of taken) { let h = '?'; try { h = new URL(u).host; } catch {} (byHost[h] = byHost[h] || []).push(u); }
for (const [h, list] of Object.entries(byHost)) console.log(`   ${h}: ${list.length}`);
