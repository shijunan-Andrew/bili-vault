// tools/diag-marks.js — show the actual class names / list-item templates used by the generated fragments.
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const frag = JSON.parse(fs.readFileSync(path.join(ROOT, 'build', 'fragments.json'), 'utf8'));
const html = [frag.b_index_top, frag.b_promote, frag.sections, frag.b_recommend_row].join('\n');
const counts = new Map();
for (const m of html.matchAll(/class="([^"]+)"/g)) {
  for (const c of m[1].split(/\s+/)) if (c) counts.set(c, (counts.get(c) || 0) + 1);
}
console.log([...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k, v]) => `${k}=${v}`).join('  '));
const i = html.indexOf('ul class="vidbox');
console.log('\n--- first vidbox slice ---\n' + html.slice(i - 20, i + 900).replace(/></g, '>\n<'));
