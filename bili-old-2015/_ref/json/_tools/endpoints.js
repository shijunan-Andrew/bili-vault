// Enumerate every /index/*.json endpoint the 2015-07-01 homepage can request,
// by static analysis of the two page scripts. Read-only.
const fs = require('fs');
const path = require('path');
const REF = path.resolve(__dirname, '..', '..', '..', '_ref');
const rd = (f) => fs.readFileSync(path.join(REF, f), 'utf8');

const idx = rd('page.index.v3.pretty.js');
const core = rd('page.core.pretty.js');

console.log('=== page.index.v3.pretty.js :: top-level indexBlock keys + tid ===');
{
  const lines = idx.split(/\r?\n/);
  lines.forEach((l, i) => {
    if (/^\s{4}[a-z]+:\s*\{/.test(l) || /\btid:\s*\d+/.test(l) || /^\s{4}id:\s*"b_/.test(l)) {
      console.log(String(i + 1).padStart(4), l.trim().slice(0, 120));
    }
  });
}

console.log('\n=== page.index.v3.pretty.js :: dataSource / dataSrc ===');
idx.split(/\r?\n/).forEach((l, i) => {
  const m = l.match(/dataSource[^,}]*|dataSrc[^,}]*/);
  if (m) console.log(String(i + 1).padStart(4), m[0].trim().slice(0, 140));
});

console.log('\n=== page.core.pretty.js :: literal /index/*.json occurrences (with line) ===');
core.split(/\r?\n/).forEach((l, i) => {
  const m = l.match(/\/index\/[A-Za-z0-9_\-./]*\.json/g) || l.match(/\/index\/[A-Za-z0-9_\-./]*"\s*\+/g);
  if (m) console.log(String(i + 1).padStart(4), [...new Set(m)].join(' ').slice(0, 160));
});

console.log('\n=== page.core.pretty.js :: dataSource assignments ===');
core.split(/\r?\n/).forEach((l, i) => {
  const m = l.match(/dataSource\s*=\s*[^;]{0,100}|"data-source"[^,}]{0,100}/);
  if (m) console.log(String(i + 1).padStart(4), m[0].replace(/\s+/g, ' ').slice(0, 150));
});

console.log('\n=== tid maps in page.core.pretty.js ===');
core.split(/\r?\n/).forEach((l, i) => {
  if (/MAIN_TIDS|tid|douga|kichiku/.test(l) && l.length < 400) {
    console.log(String(i + 1).padStart(4), l.trim().slice(0, 200));
  }
});
