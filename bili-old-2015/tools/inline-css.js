// tools/inline-css.js — turn every remote url() in build/index.css into a data: URI taken from
// assets/<original path>. The replica is ONE html file, so nothing may point at a network host.
// Looks the file up on disk (authoritative) and falls back to the manifest for odd paths.
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const ASSETS = path.join(ROOT, 'assets');
const CSSF = path.join(ROOT, 'build', 'index.css');
let css = fs.readFileSync(CSSF, 'utf8');
let MAN = {};
try { MAN = JSON.parse(fs.readFileSync(path.join(ASSETS, 'MANIFEST.json'), 'utf8')); } catch {}
const byPath = new Map();
for (const [url, e] of Object.entries(MAN)) {
  if (!e || !e.file) continue;
  const p = url.replace(/^https?:\/\/[^/]+/i, '').replace(/\/{2,}/g, '/');
  if (!byPath.has(p)) byPath.set(p, e.file);
}
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp' };
const MAGIC = [[Buffer.from([0x89, 0x50, 0x4e, 0x47]), 1], [Buffer.from([0xff, 0xd8, 0xff]), 1], [Buffer.from('GIF8'), 1], [Buffer.from([0x00, 0x00, 0x01, 0x00]), 1]];
const looksImage = (f) => {
  try {
    const b = Buffer.alloc(8);
    const fd = fs.openSync(f, 'r'); fs.readSync(fd, b, 0, 8, 0); fs.closeSync(fd);
    return MAGIC.some(([m]) => b.slice(0, m.length).equals(m));
  } catch { return false; }
};
function resolveFile(u) {
  let rel = u.startsWith('//') ? u.replace(/^\/\//, 'http://') : u;
  rel = rel.replace(/^https?:\/\/[^/]+/i, '');
  rel = rel.split('?')[0].split('#')[0].replace(/\/{2,}/g, '/').replace(/^\//, '');
  const cand = path.join(ASSETS, rel);
  if (fs.existsSync(cand) && fs.statSync(cand).size && looksImage(cand)) return cand;
  const m = byPath.get('/' + rel);
  if (m && fs.existsSync(m) && fs.statSync(m).size && looksImage(m)) return m;
  return null;
}
let inlined = 0, bytes = 0; const left = new Set();
const out = css.replace(/url\((['"]?)([^)'"]+)\1\)/g, (m, q, raw) => {
  const u = raw.trim().replace(/&amp;/g, '&');
  if (u.startsWith('data:')) return m;
  const file = resolveFile(u);
  if (!file) { left.add(u); return m; }
  const b64 = fs.readFileSync(file).toString('base64');
  inlined++; bytes += b64.length;
  return `url("data:${MIME[path.extname(file).toLowerCase()] || 'application/octet-stream'};base64,${b64}")`;
});
fs.writeFileSync(CSSF, out, 'utf8');
console.log('inlined url() occurrences:', inlined, '| base64 bytes added:', bytes);
console.log('left remote/unknown:', left.size);
[...left].forEach((u) => console.log('  LEFT', u));
