// tools/diag-manifest.js — what shape is MANIFEST.json / NEEDED.json in now, and do the files exist?
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const p = (...a) => path.join(ROOT, ...a);
const size = (f) => { try { return fs.statSync(f).size; } catch { return 0; } };
const m = JSON.parse(fs.readFileSync(p('assets', 'MANIFEST.json'), 'utf8'));
const keys = Object.keys(m);
console.log('MANIFEST entries:', keys.length);
console.log('sample keys:', keys.slice(0, 3));
console.log('sample value:', JSON.stringify(m[keys[0]]));
let ok = 0, miss = 0, nofile = 0, nodisk = 0;
const samples = [];
for (const [k, e] of Object.entries(m)) {
  if (!e || !e.file) { nofile++; if (samples.length < 5) samples.push('NO .file: ' + k + ' -> ' + JSON.stringify(e)); continue; }
  if (!size(p(e.file))) { nodisk++; if (samples.length < 8) samples.push('NOT ON DISK: ' + e.file); continue; }
  if (e.status === 'ok' || !e.status) ok++; else miss++;
}
console.log(`usable=${ok} status-missing=${miss} no-file-field=${nofile} file-not-on-disk=${nodisk}`);
samples.forEach((s) => console.log('   ', s));
const n = JSON.parse(fs.readFileSync(p('assets', 'NEEDED.json'), 'utf8'));
console.log('NEEDED rows:', n.length, '| sample:', JSON.stringify(n[0]));
let nok = 0, nbad = 0;
for (const r of n) { if (r && r.rel && size(p('assets', r.rel))) nok++; else if (r && r.status !== 'missing') nbad++; }
console.log('NEEDED usable=', nok, 'declared-present-but-missing=', nbad);
