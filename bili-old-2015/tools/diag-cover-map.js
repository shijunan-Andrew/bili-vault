// tools/diag-cover-map.js — why are only 64 of 340 slots resolving?
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const P = (...a) => path.join(ROOT, ...a);
const read = (f) => fs.readFileSync(f, 'utf8');
const frag = JSON.parse(read(P('build', 'fragments.json')));

const titleToAid = new Map();
const walk = (n, aid) => {
  if (Array.isArray(n)) return n.forEach((x) => walk(x, aid));
  if (!n || typeof n !== 'object') return;
  const a = n.aid != null ? String(n.aid) : aid;
  if (n.title && a) titleToAid.set(String(n.title).trim(), a);
  for (const v of Object.values(n)) walk(v, a);
};
for (const f of fs.readdirSync(P('_ref', 'json')).filter((x) => x.endsWith('.json'))) {
  try { walk(JSON.parse(read(P('_ref', 'json', f))), null); } catch {}
}
const covers = new Set(fs.readdirSync(P('assets', 'cover')).map((f) => (f.match(/^(\d+)\./) || [])[1]).filter(Boolean));

for (const key of ['b_index_top', 'b_promote', 'b_recommend', 'sections', 'b_recommend_row']) {
  const html = frag[key];
  if (!html) { console.log(key, 'MISSING'); continue; }
  const items = html.split('class="v-item"').slice(1).map((c) => c.slice(0, 3000));
  let withImg = 0, titleHit = 0, titleEmpty = 0, coverHit = 0;
  const samples = [];
  for (const b of items) {
    const t = (b.match(/title="([^"]*?)"/) || [])[1];
    const img = (b.match(/data-(?:img|missing)="([^"]+)"/) || [])[1];
    if (img) withImg++;
    if (!t) { titleEmpty++; if (samples.length < 3) samples.push('NO TITLE: ' + String(img).slice(0, 80)); continue; }
    const aid = titleToAid.get(t.trim());
    if (aid) { titleHit++; if (covers.has(aid)) coverHit++; else if (samples.length < 6) samples.push('no cover aid=' + aid + ' t=' + t.slice(0, 30)); }
    else if (samples.length < 6) samples.push('title miss: ' + t.slice(0, 40));
  }
  console.log(`${key}: items=${items.length} withImg=${withImg} titleEmpty=${titleEmpty} titleMatched=${titleHit} coverHit=${coverHit}`);
  samples.forEach((s) => console.log('    ', s));
}
