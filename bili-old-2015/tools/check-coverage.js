// tools/check-coverage.js — does the asset job list cover every image URL my fragments need?
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const P = (...a) => path.join(ROOT, ...a);
const read = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return null; } };

// 1) URLs the fragments need
const frag = JSON.parse(read(P('build', 'fragments.json')) || '{}');
const needed = new Set();
for (const v of Object.values(frag)) {
  for (const m of String(v).matchAll(/data-img="([^"]+)"/g)) needed.add(m[1]);
  for (const m of String(v).matchAll(/url\(([^)'"]+)\)/g)) needed.add(m[1]);
}
console.log('image URLs needed by fragments:', needed.size);

// 2) URLs the asset job targets
const candidates = ['_ref/json/_tools/jobs.json', '_ref/json/_tools/asset-jobs.json', 'assets/jobs.json',
  'tools/missing.json', '_ref/json/_tools/md5-proof.json'];
let jobs = new Set();
let jobsFile = null;
for (const f of candidates) {
  const t = read(P(f));
  if (!t) continue;
  const before = jobs.size;
  try {
    const j = JSON.parse(t);
    const walk = (x) => {
      if (typeof x === 'string') { if (/^https?:\/\//.test(x)) jobs.add(x); return; }
      if (Array.isArray(x)) return x.forEach(walk);
      if (x && typeof x === 'object') return Object.values(x).forEach(walk);
    };
    walk(j);
  } catch { /* not json */ }
  console.log(`  scanned ${f}: +${jobs.size - before} urls`);
  if (jobs.size) jobsFile = jobsFile || f;
}
console.log('URLs referenced by asset job files:', jobs.size, jobsFile ? `(e.g. ${jobsFile})` : '');

// 3) how many needed URLs are present in the manifest already?
let manifest = {};
for (const f of ['assets/MANIFEST.json', 'assets/thumbs.json', 'assets/manifest.json']) {
  const t = read(P(f));
  if (!t) continue;
  try { manifest = Object.assign(manifest, JSON.parse(t)); console.log('manifest loaded:', f, Object.keys(manifest).length); } catch { console.log('unparseable', f); }
}
const norm = (u) => String(u).replace(/^https?:\/\//, '').replace(/[?#].*$/, '');
const manKeys = new Set(Object.keys(manifest).map(norm));
const jobKeys = new Set([...jobs].map(norm));
let hit = 0, miss = [], notJobbed = [];
for (const u of needed) {
  const n = norm(u);
  if (manKeys.has(n)) hit++; else if (!jobKeys.has(n)) notJobbed.push(u); else miss.push(u);
}
console.log(`\nof ${needed.size} needed: in manifest ${hit} | jobbed-but-pending ${miss.length} | NOT in any job ${notJobbed.length}`);
notJobbed.slice(0, 12).forEach((u) => console.log('  NOT-JOBBED', u));
