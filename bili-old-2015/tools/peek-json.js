// tools/peek-json.js — print the shape of the archived payloads so the builder maps fields correctly.
const fs = require('fs');
const path = require('path');
const dir = path.resolve(__dirname, '../_ref/json');

const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
const preview = (v, depth = 0) => {
  if (Array.isArray(v)) return `[array ${v.length}] ` + (v.length ? preview(v[0], depth + 1) : '');
  if (v && typeof v === 'object') {
    const keys = Object.keys(v);
    return `{${keys.slice(0, 24).join(',')}${keys.length > 24 ? ',…+' + (keys.length - 24) : ''}}`;
  }
  return JSON.stringify(v);
};
for (const f of files) {
  const p = path.join(dir, f);
  let j;
  try { j = JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '')); }
  catch (e) { console.log(`\n### ${f} (${fs.statSync(p).size}B) PARSE-FAIL ${e.message}`); continue; }
  console.log(`\n### ${f} (${fs.statSync(p).size}B)`);
  if (Array.isArray(j)) {
    console.log('  top: array len', j.length, preview(j[0]));
    if (j[0] && typeof j[0] === 'object') console.log('  item0:', JSON.stringify(j[0]).slice(0, 400));
  } else {
    const keys = Object.keys(j);
    console.log('  top keys:', keys.slice(0, 30).join(','));
    for (const k of keys.slice(0, 3)) {
      const v = j[k];
      console.log(`  [${k}] ${preview(v)}`);
      if (Array.isArray(v) && v[0]) console.log('    first:', JSON.stringify(v[0]).slice(0, 330));
      else if (v && typeof v === 'object') {
        const k2 = Object.keys(v)[0];
        console.log(`    .${k2}:`, JSON.stringify(v[k2]).slice(0, 330));
        const k3 = Object.keys(v)[1];
        if (k3) console.log(`    .${k3}:`, JSON.stringify(v[k3]).slice(0, 200));
      }
    }
  }
}
