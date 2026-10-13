// tools/fetch-icons.js — fetch the 8 game-dropdown icons referenced by inline styles
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const ROOT = path.resolve(__dirname, '..');
const list = fs.readFileSync(path.join(ROOT, 'build', 'inline-urls.txt'), 'utf8').split(/\r?\n/).filter(Boolean);
const MAGIC = { jpg: [0xff, 0xd8, 0xff], png: [0x89, 0x50, 0x4e, 0x47], gif: [0x47, 0x49, 0x46] };
const isImage = (b) => Object.values(MAGIC).some((sig) => sig.every((v, i) => b[i] === v));

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
    req.setTimeout(15000, () => { req.destroy(); resolve({ status: 'TIMEOUT', buf: Buffer.alloc(0) }); });
  });
}

(async () => {
  const report = [];
  for (const url of list) {
    const rel = url.replace(/^https?:\/\/[^/]+\//, '');
    const file = path.join(ROOT, 'assets', rel.replace(/\//g, path.sep));
    if (fs.existsSync(file) && fs.statSync(file).size > 100) { report.push([url, file, 'cached', fs.statSync(file).size]); continue; }
    let r = await get(url);
    if (r.status !== 200 || !isImage(r.buf)) {
      // try the wayback copy as a fallback
      const wb = 'http://web.archive.org/web/20150701082208if_/' + url;
      const w = await get(wb);
      if (w.status === 200 && isImage(w.buf)) r = w; else { report.push([url, '', String(r.status) + (isImage(r.buf) ? '' : ' not-an-image'), 0]); continue; }
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, r.buf);
    report.push([url, file, 'ok', r.buf.length]);
    await new Promise((res) => setTimeout(res, 400));
  }
  const rel = (f) => (f ? path.relative(ROOT, f).replace(/\\/g, '/') : '');
  fs.writeFileSync(path.join(ROOT, 'assets', 'ICONS.md'),
    '# game-dropdown icons\n\n| original url | local file | status | bytes |\n|---|---|---|---|\n' +
    report.map(([u, f, s, b]) => `| ${u} | ${rel(f)} | ${s} | ${b} |`).join('\n') + '\n', 'utf8');
  for (const [u, f, s, b] of report) console.log(s.padEnd(14), String(b).padStart(7), rel(f) || u);
})();
