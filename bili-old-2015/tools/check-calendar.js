// tools/check-calendar.js — does the bangumi calendar render each item once, and which day is it?
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const frag = JSON.parse(read('build/fragments.json'));
const sec = frag.sections;
const at = sec.indexOf('bgm-calendar');
const chunk = sec.slice(at, sec.indexOf('完结动画推荐', at));
const titles = [...chunk.matchAll(/<p class="t"><span>([^<]*)<\/span><\/p>/g)].map((m) => m[1]);
console.log('calendar <p class="t"> entries:', titles.length);
const dup = titles.filter((t, i) => titles.indexOf(t) !== i);
console.log('duplicated in rendered calendar:', [...new Set(dup)].join(' | ') || 'none');
console.log('titles:', titles.join(' | '));

const bg = JSON.parse(read('_ref/json/bangumi.json').replace(/^\uFEFF/, ''));
const arr = Array.isArray(bg) ? bg : (bg.list || []);
const dist = {};
for (const b of arr) dist[b.weekday] = (dist[b.weekday] || 0) + 1;
console.log('\npayload weekday distribution:', JSON.stringify(dist));
console.log('sample entry:', JSON.stringify(arr[0]).slice(0, 240));
