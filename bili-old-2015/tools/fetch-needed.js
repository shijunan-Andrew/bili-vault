// tools/fetch-needed.js — top up the images the replica still needs (carousel, top lists, sections),
// writing them into assets/<original path> and recording them in assets/NEEDED.json.
// Safe to run repeatedly: existing files are kept.
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const ROOT = path.resolve(__dirname, '..');
const P = (...a) => path.join(ROOT, ...a);

const frag = JSON.parse(fs.readFileSync(P('build', 'fragments.json'), 'utf8'));
const bodyHtml = fs.readFileSync(P('_ref', 'body.html'), 'utf8');
const needed = new Set();
for (const src of [bodyHtml, ...Object.values(frag)]) {
  for (const m of String(src).matchAll(/data-img="([^"]+)"/g)) needed.add(m[1]);
  for (const m of String(src).matchAll(/url\(\s*['"]?(https?:\/\/[^)'"]+)['"]?\s*\)/g)) needed.add(m[1]);
}

const SIGNATURES = [[0xff, 0xd8, 0xff], [0x89, 0x50, 0x4e, 0x47], [0x47, 0x49, 0x46], [0x52, 0x49, 0x46, 0x46]];
const isImage = (b) => b.length > 100 && SIGNATURES.some((s) => s.every((v, i) => b[i] === v));

function get(url, redirects = 0) {
  return new Promise((resolve) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', Referer: 'http://www.bilibili.com/' } }, (r) => {
      if ([301, 302, 303, 307, 308].includes(r.statusCode) && r.headers.location && redirects < 5) {
        r.resume();
        return resolve(get(new URL(r.headers.location, url).href, redirects + 1));
      }
      const c = [];
      r.on('data', (d) => c.push(d));
      r.on('end', () => resolve({ status: r.statusCode, buf: Buffer.concat(c) }));
    });
    req.on('error', (e) => resolve({ status: 'ERR ' + e.code, buf: Buffer.alloc(0) }));
    req.setTimeout(20000, () => { req.destroy(); resolve({ status: 'TIMEOUT', buf: Buffer.alloc(0) }); });
  });
}

(async () => {
  const only = process.argv[2] ? new RegExp(process.argv[2]) : null;
  const list = [...needed].filter((u) => !only || only.test(u));
  const rows = [];
  let got = 0, had = 0, miss = 0;
  for (let i = 0; i < list.length; i++) {
    const url = list[i];
    const rel = url.replace(/^https?:\/\/[^/]+\//, '');
    const file = P('assets', rel.replace(/\//g, path.sep));
    if (fs.existsSync(file) && fs.statSync(file).size > 100) { had++; rows.push({ url, rel, status: 'cached', bytes: fs.statSync(file).size }); continue; }
    let r = await get(url);
    if (!isImage(r.buf)) {
      const w = await get('http://web.archive.org/web/2015if_/' + url);
      if (isImage(w.buf)) r = w;
    }
    if (isImage(r.buf)) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, r.buf);
      got++;
      rows.push({ url, rel, status: 'ok', bytes: r.buf.length });
      console.log(`[${i + 1}/${list.length}] OK   ${rel} ${r.buf.length}B`);
    } else {
      miss++;
      rows.push({ url, rel, status: 'missing', bytes: 0 });
      console.log(`[${i + 1}/${list.length}] MISS ${rel}`);
    }
    if (i % 25 === 24) fs.writeFileSync(P('assets', 'NEEDED.json'), JSON.stringify(rows, null, 1)); // checkpoint
  }
  const prev = fs.existsSync(P('assets', 'NEEDED.json')) ? JSON.parse(fs.readFileSync(P('assets', 'NEEDED.json'), 'utf8')) : [];
  const merged = new Map(prev.map((r) => [r.url, r]));
  rows.forEach((r) => merged.set(r.url, r));
  fs.writeFileSync(P('assets', 'NEEDED.json'), JSON.stringify([...merged.values()], null, 1));
  console.log(`\nneeded=${list.length} cached=${had} downloaded=${got} missing=${miss}`);
})();
