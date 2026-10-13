// tools/check-ids.js — list every top-level section id in the generated markup, in order
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const frag = JSON.parse(fs.readFileSync(path.join(ROOT, 'build', 'fragments.json'), 'utf8'));
const html = String(frag.sections);
const ids = [...html.matchAll(/id="(b_[a-z_]+)"/g)].map((m) => m[1]);
console.log('ids in order:', ids.join(' → '));
console.log('count:', ids.length);
const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
console.log('duplicates:', [...new Set(dup)].join(', ') || 'none');
// count of every section's own markup
for (const id of ids) {
  const seg = html.split(`id="${id}"`)[1] || '';
  console.log(`${id.padEnd(16)} v-item=${(seg.slice(0, 40000).match(/class="v-item"/g) || []).length} rlist=${(seg.slice(0, 40000).match(/class="rlist/g) || []).length}`);
}
