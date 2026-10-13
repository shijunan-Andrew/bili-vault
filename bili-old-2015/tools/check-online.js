// tools/check-online.js — how many 在线/正在观看 bars are in the file and which row owns them?
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const rows = [...html.matchAll(/<div[^>]*class="container-row"[^>]*id="(b_[a-z_]+)"|<div[^>]*id="(b_[a-z_]+)"[^>]*class="container-row"/g)]
  .map((m) => ({ id: m[1] || m[2], at: m.index }))
  .filter((x) => x.id);
console.log('container rows:', rows.map((r) => r.id + '@' + r.at).join(', '));
let n = 0;
for (const m of html.matchAll(/index_online/g)) {
  n++;
  const owner = rows.filter((r) => r.at < m.index).pop();
  console.log(`\n[index_online #${n}] inside row: ${owner ? owner.id : '(before first row)'}`);
  console.log(html.slice(Math.max(0, m.index - 260), m.index + 300).replace(/\s+/g, ' '));
}
console.log('\ntotal index_online:', n);
console.log('position of the bar relative to b_recommend:',
  html.indexOf('index_online') < html.indexOf('id="b_recommend"') ? 'BEFORE b_recommend (correct)' : 'AFTER b_recommend (wrong)');
