// tools/fetch-css-assets.js — fetch the CSS-only sprite images that assets/MANIFEST.json lacks.
// Strategy per path: live static CDN -> wayback im_/if_ (first working 2015 timestamp) -> give up.
// Validates magic bytes so an HTML error page is never stored as an image.
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const ROOT = path.resolve(__dirname, '..');
const MAN = path.join(ROOT, 'assets', 'MANIFEST.json');
const manifest = JSON.parse(fs.readFileSync(MAN, 'utf8'));

const PATHS = [
  'images/v3images/main_icons.png',
  'images/v3images/bodyline.png',
  'images/v3images/repeatline.png',
  'images/v3images/v_ttl.png',
  'images/v3images/header/bilibili6th_logo.png',
  'images/header/bilibili6th_logo.png',
  'images/v2images/footerline.png',
  'images/v3images/index_icons.png',
  'images/v3images/icons.png',
  'images/v3images/logo.png',
  'images/v3images/tv_calendar.png',
  'images/header/bilibili_logo.png',
  'images/v3images/slider.png',
  'images/v3images/promote.png',
];

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
      r.on('end', () => resolve({ status: r.statusCode, buf: Buffer.concat(chunks), type: r.headers['content-type'] }));
    });
    req.on('error', (e) => resolve({ status: 'ERR ' + e.code }));
    req.setTimeout(20000, () => { req.destroy(); resolve({ status: 'TIMEOUT' }); });
  });
}

async function cdx(pathname) {
  const u = `http://web.archive.org/cdx/search/cdx?url=static.hdslb.com/${pathname}&from=20150101&to=20151231&output=json&limit=5&filter=statuscode:200`;
  const r = await get(u);
  if (r.status !== 200) return null;
  try {
    const rows = JSON.parse(r.buf.toString('utf8'));
    return rows.slice(1).map((x) => x[1]).filter(Boolean);
  } catch { return null; }
}

(async () => {
  const log = [];
  for (const p of PATHS) {
    const target = path.join(ROOT, 'assets', p);
    const key = 'http://static.hdslb.com/' + p;
    const already = manifest[key];
    if (fs.existsSync(target) && fs.statSync(target).size > 0 && already && already.status === 'ok') {
      console.log('HAVE    ', p, fs.statSync(target).size);
      continue;
    }
    let saved = false;
    // 1) live CDN
    let r = await get('http://static.hdslb.com/' + p);
    let src = 'live';
    if (r.status !== 200 || !looksImage(r.buf || Buffer.alloc(0))) {
      // 2) wayback
      const stamps = (await cdx(p)) || [];
      for (const ts of stamps) {
        r = await get(`http://web.archive.org/web/${ts}im_/http://static.hdslb.com/${p}`);
        if (r.status === 200 && looksImage(r.buf)) { src = 'wayback@' + ts; break; }
      }
    }
    if (r && r.status === 200 && looksImage(r.buf)) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, r.buf);
      manifest[key] = { url: key, path: p, file: target, bytes: r.buf.length, status: 'ok', source: src };
      saved = true;
      console.log('FETCHED ', p, r.buf.length, 'via', src);
    }
    if (!saved) {
      manifest[key] = manifest[key] || { url: key, status: 'missing' };
      console.log('MISSING ', p, '(last status', r && r.status, ')');
    }
    log.push(p);
  }
  fs.writeFileSync(MAN, JSON.stringify(manifest, null, 1), 'utf8');
  console.log('manifest updated:', Object.keys(manifest).length, 'entries');
})();
