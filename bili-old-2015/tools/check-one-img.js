// tools/check-one-img.js — why did a known-good manifest entry not resolve?
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'MANIFEST.json'), 'utf8'));
const u = 'http://i1.hdslb.com/promote/7973f7d20baaa6370583d09b95c56b7e.jpg';
console.log('entry:', JSON.stringify(man[u]));
const e = man[u];
if (e && e.file) {
  console.log('file exists:', fs.existsSync(e.file), 'bytes:', fs.existsSync(e.file) ? fs.statSync(e.file).size : '-');
}
// how many manifest entries with status ok actually have bytes on disk?
let ok = 0; let okFiles = 0; let missingFile = 0;
for (const [, v] of Object.entries(man)) {
  if (v && v.status === 'ok') { ok++; if (v.file && fs.existsSync(v.file) && fs.statSync(v.file).size) okFiles++; else missingFile++; }
}
console.log('manifest ok:', ok, '| file on disk:', okFiles, '| file gone:', missingFile);
// and what does build.js see for this url after norm()?
const norm = (x) => {
  let s = String(x).trim().replace(/&amp;/g, '&');
  s = s.replace(/^(?:https?:)?\/\/web\.archive\.org\/web\/[0-9a-z_]*\//i, '').replace(/^\/web\/[0-9a-z_]*\//i, '');
  if (s.startsWith('//')) s = 'http:' + s;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = 'http://static.hdslb.com/' + s.replace(/^\/+/, '');
  if (/^https?:\/\//i.test(s)) s = s.replace(/([^:])\/{2,}/g, '$1/');
  return s.replace(/[?#].*$/, '');
};
const key = norm(u);
console.log('norm key:', key);
const matches = Object.keys(man).filter((k) => norm(k) === key);
console.log('manifest keys normalising to that key:', matches.length);
for (const m of matches) console.log('  ', m, '->', man[m].status, man[m].file);
