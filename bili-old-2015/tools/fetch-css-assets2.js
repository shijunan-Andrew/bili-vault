// tools/fetch-css-assets2.js — fetch EVERY path still remotely referenced by build/index.css.
// live static.hdslb.com -> wayback im_ (any 2015 capture) -> record as missing.
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const ROOT = path.resolve(__dirname, '..');
const MAN = path.join(ROOT, 'assets', 'MANIFEST.json');
const manifest = JSON.parse(fs.readFileSync(MAN, 'utf8'));
const paths = fs.readFileSync(path.join(ROOT, 'build', 'remote-css-urls.txt'), 'utf8')
  .split('\n').map((s) => s.trim()).filter(Boolean);

const MAGIC = [
  [Buffer.from([0x89, 0x50, 0x4e, 0x47]), '.png'],
  [Buffer.from([0xff, 0xd8, 0xff]), '.jpg'],
  [Buffer.from('GIF8'), '.gif'],
  [Buffer.from([0x00, 0x00, 0x01, 0x00]), '.ico'],
];
const looksImage = (b) => MAGIC.some(([m]) => b.length > m.length && b.slice(0, m.length).equals(m));

function get(url, redirects) {
  return new Promise((resolve) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, (r) => {
      if ([301, 302, 303, 307, 308].includes(r.statusCode) && r.headers.location) {
        r.resume();
        if ((redirects || 0) > 5) return resolve({ status: 'REDIR' });
        return resolve(get(new URL(r.headers.location, url).href, (redirects || 0) + 1));
      }
      const chunks = [];
      r.on('data', (c) => chunks.push(c));
      r.on('end', () => resolve({ status: r.statusCode, buf: Buffer.concat(chunks) }));
    });
    req.on('error', (e) => resolve({ status: 'ERR ' + e.code }));
    req.setTimeout(20000, () => { req.destroy(); resolve({ status: 'TIMEOUT' }); });
  });
}
async function cdx(p) {
  const u = `http://web.archive.org/cdx/search/cdx?url=static.hdslb.com${p}&from=20140101&to=20151231&output=json&limit=4&filter=statuscode:200`;
  const r = await get(u);
  if (r.status !== 200) return [];
  try { return JSON.parse(r.buf.toString('utf8')).slice(1).map((x) => x[1]).filter(Boolean); } catch { return []; }
}

(async () => {
  const ok = [], miss = [];
  for (const p of paths) {
    const target = path.join(ROOT, 'assets', p.replace(/^\//, ''));
    const key = 'http://static.hdslb.com' + p;
    if (fs.existsSync(target) && fs.statSync(target).size > 0) { ok.push(p); continue; }
    let r = await get('http://static.hdslb.com' + p);
    let src = 'live';
    if (r.status !== 200 || !looksImage(r.buf || Buffer.alloc(0))) {
      for (const ts of await cdx(p)) {
        r = await get(`http://web.archive.org/web/${ts}im_/http://static.hdslb.com${p}`);
        if (r.status === 200 && looksImage(r.buf)) { src = 'wayback@' + ts; break; }
      }
    }
    if (r && r.status === 200 && looksImage(r.buf)) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, r.buf);
      manifest[key] = { url: key, path: p.replace(/^\//, ''), file: target, bytes: r.buf.length, status: 'ok', source: src };
      ok.push(p);
      console.log('OK   ', String(r.buf.length).padStart(7), src.padEnd(20), p);
    } else {
      miss.push(p);
      console.log('MISS ', String(r && r.status).padStart(7), ''.padEnd(20), p);
    }
  }
  fs.writeFileSync(MAN, JSON.stringify(manifest, null, 1), 'utf8');
  console.log('\nfetched/available:', ok.length, '| missing:', miss.length);
  fs.writeFileSync(path.join(ROOT, 'build', 'remote-css-urls.txt'), miss.join('\n'), 'utf8');
})();
