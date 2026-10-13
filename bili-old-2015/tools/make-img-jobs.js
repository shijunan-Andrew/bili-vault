// tools/make-img-jobs.js — build {url,dest} download jobs for thumbnails/avatars referenced by the archived JSON.
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const J = path.join(ROOT, '_ref', 'json');

function destFor(u) {
  const p = new URL(u);
  let pn = decodeURIComponent(p.pathname).replace(/^\/+/, '');
  if (!pn || pn.endsWith('/')) pn += 'index';
  pn = pn.replace(/[\\:*?"<>|]/g, '_');
  const host = p.hostname.replace(/\.hdslb\.com$/, '');
  return host + '/' + pn;
}

const urls = new Set();
function walk(v) {
  if (typeof v === 'string') { if (/^https?:\/\/i[0-9]\.hdslb\.com\/.+\.(?:jpe?g|png|gif)$/i.test(v)) urls.add(v); return; }
  if (Array.isArray(v)) { v.forEach(walk); return; }
  if (v && typeof v === 'object') for (const k of Object.keys(v)) walk(v[k]);
}
for (const f of fs.readdirSync(J).filter((x) => x.endsWith('.json'))) {
  try { walk(JSON.parse(fs.readFileSync(path.join(J, f), 'utf8').replace(/^\uFEFF/, ''))); } catch (e) { /* ignore */ }
}

// the slideshow hero images first — they matter most visually
// NOTE: the archived files are BOM-prefixed and the list endpoints wrap their payload
// (`{results:N, list:[...]}`), so unwrap before reading.
function loadJson(file) {
  const raw = fs.readFileSync(path.join(J, file), 'utf8').replace(/^\uFEFF/, '');
  const v = JSON.parse(raw);
  return v && v.list ? v.list : v;
}
let slides = [];
try {
  slides = loadJson('slideshow.json').map((x) => x.img).filter(Boolean);
} catch (e) { /* ignore */ }

const ordered = [...new Set([...slides, ...[...urls].sort()])];
const jobs = ordered.map((u) => ({ url: u, dest: destFor(u) }));
fs.writeFileSync(path.join(ROOT, '_ref', 'img-jobs.json'), JSON.stringify(jobs, null, 0), 'utf8');
fs.writeFileSync(path.join(ROOT, '_ref', 'pic-urls.txt'), ordered.join('\n'), 'utf8');
console.log(`img jobs: ${jobs.length} (slideshow ${slides.length})`);
console.log(jobs.slice(0, 3).map((j) => `  ${j.dest}`).join('\n'));
