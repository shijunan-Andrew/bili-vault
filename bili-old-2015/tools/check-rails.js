// tools/check-rails.js — audit the two things that looked suspicious in the screenshot:
// (a) are the rank numbers in each right-rail really 1..N, and (b) is the bangumi calendar
// duplicating entries because the payload has duplicates?
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const frag = JSON.parse(read('build/fragments.json'));
const sec = frag.sections;
console.log('sections length', sec.length, '| first occurrence of b_douga at', sec.indexOf('b_douga'));
console.log('section starts:', [...sec.matchAll(/id="b_([a-z]+)"/g)].map((m) => m[1]).join(' '));

// split the sections fragment on its row boundaries so each category is inspected on its own
const parts = sec.split(/(?=\t<div id="b_[a-z]+" class="container-row")/).filter((p) => /^[\s\S]*<div id="b_/.test(p));
for (const p of parts) {
  const id = (p.match(/id="b_([a-z]+)"/) || [])[1];
  if (!id) continue;
  const nums = [...p.matchAll(/<i class="number(?: n\d)?">(\d+)<\/i>/g)].map((m) => m[1]);
  const titles = [...p.matchAll(/<div class="title t">([^<]*)<\/div>/g)].map((m) => m[1]);
  console.log(`${id.padEnd(11)} rail-ranks=[${[...new Set(nums)].join(',')}] rail-items=${titles.length} first="${(titles[0] || '').slice(0, 36)}"`);
}

const bg = JSON.parse(read('_ref/json/bangumi.json').replace(/^\uFEFF/, ''));
const arr = Array.isArray(bg) ? bg : (bg.list || []);
console.log('\nbangumi payload entries:', arr.length);
for (let d = 0; d < 7; d++) {
  const t = arr.filter((x) => Number(x.weekday) === d).map((x) => String(x.title));
  const uniq = new Set(t);
  if (t.length !== uniq.size) console.log(`  weekday ${d}: ${t.length} rows / ${uniq.size} distinct -> duplicates: ${[...new Set(t.filter((x, i) => t.indexOf(x) !== i))].join(' | ').slice(0, 120)}`);
}
