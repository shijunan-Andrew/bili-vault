// tools/diag-navsrc.js — how did the ORIGINAL bootstrap place #index_nav? (it is display:none in css)
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
for (const f of ['_ref/original-20150701.html', '_ref/body.html']) {
  const s = read(f);
  const i = s.indexOf('IndexNavigator');
  console.log(`--- ${f}: IndexNavigator at ${i} ---`);
  if (i >= 0) console.log(s.slice(Math.max(0, i - 700), i + 900));
}
const css = read('build/index.css').split('\n');
console.log('\n--- .index-nav rules in build/index.css ---');
css.forEach((l, n) => { if (/\.index-nav[^{]*\{/.test(l)) console.log((n + 1) + ': ' + l.trim()); });
