// tools/peek.js — print the N-th match of a pattern in index.html with context
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const pattern = process.argv[2];
const n = Number(process.argv[3] || 1);
const before = Number(process.argv[4] || 120);
const after = Number(process.argv[5] || 300);
const re = new RegExp(pattern, 'g');
let m, i = 0;
while ((m = re.exec(html))) {
  i++;
  if (i < n) continue;
  const s = Math.max(0, m.index - before);
  console.log(html.slice(s, m.index + after).replace(/\n/g, '\\n'));
  break;
}
if (i < n) console.log(`only ${i} matches`);
