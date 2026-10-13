// tools/audit-data.js — report coverage of the JSON payloads vs. what the index page needs.
const fs = require('fs');
const path = require('path');
const D = path.resolve(__dirname, '../_ref/json');
const read = (n) => {
  const p = path.join(D, n);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '')); } catch (e) { return { __err: e.message }; }
};

const ding = read('ding.json');
if (ding && !ding.__err) {
  console.log('ding.json sections:');
  for (const k of Object.keys(ding)) {
    const v = ding[k];
    if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
    const items = Object.keys(v).filter((x) => /^\d+$/.test(x)).map((x) => v[x]);
    const nopic = items.filter((i) => !i.pic || !/^https?:/.test(i.pic)).length;
    const ex = items[0] || {};
    console.log(`  ${k.padEnd(11)} n=${String(Object.keys(v).length).padStart(3)} items=${items.length} no-pic=${nopic} first.pic=${(ex.pic || 'NONE').slice(0, 60)}`);
  }
}
console.log('\nfield audit (which fields each source provides):');
const sources = ['slideshow.json', 'ranking-3day.json', 'promote.json', 'recommend.json', 'bangumi.json'];
for (const s of sources) {
  const j = read(s);
  if (!j) { console.log(`  ${s}: MISSING`); continue; }
  let sample;
  if (Array.isArray(j)) sample = j[0];
  else if (j.list) sample = Array.isArray(j.list) ? j.list[0] : j.list[Object.keys(j.list)[0]];
  else if (j.recommend) sample = (j.recommend.list && (j.recommend.list[0] || j.recommend.list['0']));
  console.log(`  ${s}: ${sample ? Object.keys(sample).join(',') : '??'}`);
}
const cat1 = read('catalogy-1-3day.json');
console.log('\ncatalogy-1-3day.json:', cat1 ? (cat1.__err ? 'ERR ' + cat1.__err : Object.keys(cat1).join(',')) : 'MISSING');
if (cat1 && cat1.hot && cat1.hot.list) {
  const it = cat1.hot.list[0] || cat1.hot.list['0'];
  console.log('  hot.list n=', Object.keys(cat1.hot.list).length, 'sample keys:', Object.keys(it).join(','));
  console.log('  sample:', JSON.stringify(it).slice(0, 260));
}
const p12 = read('promote-12.json');
console.log('\npromote-12.json:', p12 ? JSON.stringify(p12).slice(0, 400) : 'MISSING');
