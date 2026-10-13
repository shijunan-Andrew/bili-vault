// tools/check-hero.js — are the six carousel images and the eight top-list thumbs resolved?
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const html = read('index.html');
const frag = JSON.parse(read('build/fragments.json'));

const top = frag.b_index_top;
const imgs = [...top.matchAll(/<img[^>]*>/g)].map((m) => m[0]);
console.log('images inside b_index_top fragment:', imgs.length);
for (const t of imgs.slice(0, 14)) console.log('  ', t.slice(0, 130));
const resolved = imgs.filter((t) => /src="data:/.test(t)).length;
console.log('resolved to data uri in fragment:', resolved);
console.log('built file contains data uri inside topic-preview:',
  /class="topic-preview[^"]*"[\s\S]{0,4000}?src="data:image/.test(html));

// what does the archived slideshow payload point at, and do we have those bytes?
const slide = JSON.parse(read('_ref/json/slideshow.json').replace(/^\uFEFF/, ''));
const arr = Array.isArray(slide) ? slide : (slide.list || slide.results || []);
console.log('\nslideshow entries:', arr.length);
for (const s of arr) console.log('  ', (s.img || s.pic || '').slice(0, 90), '|', (s.title || '').slice(0, 30));
const man = JSON.parse(read('assets/MANIFEST.json'));
let ok = 0;
for (const s of arr) {
  const u = s.img || s.pic;
  const e = man[u] || man[u.replace(/^http:/, 'https:')];
  console.log('   manifest:', u ? (e ? e.status + ' ' + (e.file || '') : 'ABSENT') : 'no url');
  if (e && e.status === 'ok') ok++;
}
console.log('slideshow images available:', ok, '/', arr.length);
