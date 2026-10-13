// tools/coverage2.js — which fragment image URLs are already local, and where are the rest from?
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const P = (...a) => path.join(ROOT, ...a);
const read = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return null; } };
const frag = JSON.parse(read(P('build', 'fragments.json')));
const urlsByKey = {};
for (const [k, v] of Object.entries(frag)) {
  const s = new Set();
  for (const m of String(v).matchAll(/data-img="([^"]+)"/g)) s.add(m[1]);
  for (const m of String(v).matchAll(/url\(([^)'"]+)\)/g)) s.add(m[1]);
  urlsByKey[k] = [...s];
}
let manifest = {};
for (const f of ['assets/MANIFEST.json', 'assets/manifest.json']) {
  const t = read(P(f)); if (t) Object.assign(manifest, JSON.parse(t));
}
const norm = (u) => String(u).replace(/^https?:\/\//, '').replace(/[?#].*$/, '');
const keys = new Set(Object.keys(manifest).map(norm));
const short = (u) => u.replace(/^https?:\/\/[^/]+/, '');
for (const [k, list] of Object.entries(urlsByKey)) {
  const have = list.filter((u) => keys.has(norm(u))).length;
  console.log(`${k.padEnd(16)} refs=${String(list.length).padStart(4)}  in-manifest=${String(have).padStart(4)}`);
  list.slice(0, 3).forEach((u) => console.log('     ', keys.has(norm(u)) ? 'HAVE' : 'MISS', short(u)));
}
// manifest: how many entries point at files that actually exist?
let ok = 0, bad = 0, bytes = 0;
for (const [, e] of Object.entries(manifest)) {
  if (!e || !e.file) { bad++; continue; }
  const f = P(e.file);
  if (fs.existsSync(f) && fs.statSync(f).size) { ok++; bytes += fs.statSync(f).size; } else bad++;
}
console.log(`\nmanifest entries: ${Object.keys(manifest).length} | files present ${ok} | missing/empty ${bad} | ${(bytes / 1048576).toFixed(1)} MB`);
console.log('sample manifest record:', JSON.stringify(Object.entries(manifest)[0]));
