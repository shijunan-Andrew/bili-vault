// tools/audit-build.js — what is still missing or placeholder-like in the assembled index.html?
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const body = html.slice(html.indexOf('<body'));
const count = (re) => (body.match(re) || []).length;
const rows = [
  ['<img> without src (2015 thumbnails, unobtainable)', count(/<img\b(?![^>]*\bsrc=)[^>]*>/gi)],
  ['style="...url(http..." remote refs', count(/style="[^"]*url\(\s*['"]?https?:/gi)],
  ['href="https://..." links', count(/href="https:/gi)],
  ['addnew_ placeholders (--)', count(/class="addnew_\d+">--</g)],
  ['<script> tags in body', count(/<script/gi)],
  ['empty <div class="pmt-item"', count(/class="pmt-item"/g)],
  ['no-data blocks', count(/class="no-data"/g)],
];
for (const [k, v] of rows) console.log(String(v).padStart(5), k);

// every distinct remote host still referenced anywhere in the document
const hosts = new Set();
for (const m of body.matchAll(/https?:\/\/([^\/"'\s)]+)/g)) hosts.add(m[1]);
console.log('\nhosts referenced in body:');
[...hosts].sort().forEach((h) => console.log('  ', h));

// the two `--` counters in the header nav
const anchors = [...body.matchAll(/class="addnew_(\d+)">([^<]*)</g)].map((m) => m[0]);
console.log('\naddnew spans sample:', anchors.slice(0, 12).join(' '), '… total', anchors.length);
