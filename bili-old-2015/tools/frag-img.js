// tools/frag-img.js — how do the generated fragments reference images?
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const frag = JSON.parse(fs.readFileSync(path.join(ROOT, 'build', 'fragments.json'), 'utf8'));
const all = Object.values(frag).join('\n');
const counts = {};
for (const m of all.matchAll(/\b(src|data-img|data-src|style)="([^"]{0,120})"/g)) {
  const k = m[1] + (m[2].startsWith('data:') ? '=data-uri' : m[2].startsWith('http') ? '=http' : '');
  counts[k] = (counts[k] || 0) + 1;
}
console.log('attribute profile in fragments.json:');
for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1])) console.log('  ', String(v).padStart(4), k);
console.log('\nsample <img> tags:');
[...all.matchAll(/<img\b[^>]*>/g)].slice(0, 4).forEach((m) => console.log('  ', m[0].slice(0, 200)));
console.log('\nsample background url():');
[...all.matchAll(/url\((?:&#39;|')?([^)'"]{0,120})/g)].slice(0, 4).forEach((m) => console.log('  ', m[1]));
console.log('\nvideo entries with data-img:', (all.match(/data-img=/g) || []).length);
