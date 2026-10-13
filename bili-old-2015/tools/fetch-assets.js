// tools/fetch-assets.js — download every image the 2015 index page needs, from the LIVE
// static.hdslb.com CDN first and the Wayback Machine as fallback. Writes assets/** and
// assets/MANIFEST.json { originalUrl: {path, file, bytes, status, source} }.
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const REF = path.join(ROOT, '_ref');
const ASSETS = path.join(ROOT, 'assets');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
const CONCURRENCY = 6;
const WAYBACK_TS = '20150701082208';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function addUrl(set, raw) {
  if (!raw) return;
  let u = String(raw).trim().replace(/^["']|["']$/g, '');
  if (u.startsWith('//')) u = 'http:' + u;
  if (!/^https?:\/\//i.test(u)) return;
  u = u.replace(/^http:\/\/web\.archive\.org\/web\/\d+(?:im_|if_|id_|js_|cs_)?\//i, '');
  u = u.replace(/\/web\/\d+(?:im_|if_|id_|js_|cs_)?\//i, '/');
  if (/^https?:\/\//i.test(u)) set.add(u);
}

// ---- 1. collect candidate urls -------------------------------------------------
const urls = new Set();

// a) every url(...) in the stylesheets
for (const f of ['new_z2.css', 'index.css', 'jquery-ui.css']) {
  const p = path.join(REF, f);
  if (!fs.existsSync(p)) continue;
  const css = fs.readFileSync(p, 'utf8');
  for (const m of css.matchAll(/url\(\s*([^)]+?)\s*\)/gi)) addUrl(urls, m[1]);
}

// b) the archived page body (header/footer inline background images, logo, etc.)
const bodyPath = path.join(REF, 'body.html');
if (fs.existsSync(bodyPath)) {
  const body = fs.readFileSync(bodyPath, 'utf8');
  for (const m of body.matchAll(/(?:src|href|background)\s*[:=]\s*["']?([^"'\s)]+\.(?:png|jpe?g|gif|svg))/gi)) addUrl(urls, m[1]);
  for (const m of body.matchAll(/url\(([^)]+)\)/gi)) addUrl(urls, m[1]);
  for (const m of body.matchAll(/https?:\/\/(?:i[0-9]\.hdslb\.com|static\.hdslb\.com|s1\.hdslb\.com)\/[^"'\s)\\]+/gi)) addUrl(urls, m[0]);
}

// c) known chrome images that the archived HTML hard-codes (logo / header / footer / sprites)
const known = [
  'http://static.hdslb.com/images/logo.png',
  'http://static.hdslb.com/images/header/bili6th_3xixi.jpg',
  'http://static.hdslb.com/images/v2images/repeatline.png',
  'http://static.hdslb.com/images/v3images/icons1.png',
  'http://static.hdslb.com/images/v3images/icons2.png',
  'http://static.hdslb.com/images/v2images/icons_home.png',
  'http://static.hdslb.com/images/v2images/topicons.png',
  'http://static.hdslb.com/images/v2images/footpic.gif',
  'http://static.hdslb.com/images/v3images/onlinepic.png',
  'http://static.hdslb.com/images/v3images/img_loading.png',
  'http://static.hdslb.com/images/v3images/rank.png',
  'http://static.hdslb.com/images/favicon.ico',
  'http://static.hdslb.com/ad-images/wx.jpg',
  'http://static.hdslb.com/ad-images/wx-arrow.png',
];
for (const k of known) addUrl(urls, k);

// d) thumbnails + avatars referenced by the archived JSON payloads
const JSON_DIR = path.join(REF, 'json');
const jsonPics = new Set();
function walkJson(v) {
  if (typeof v === 'string') {
    if (/^https?:\/\/i[0-9]\.hdslb\.com\/.*\.(?:jpe?g|png|gif)$/i.test(v)) jsonPics.add(v);
    return;
  }
  if (Array.isArray(v)) { v.forEach(walkJson); return; }
  if (v && typeof v === 'object') { for (const k of Object.keys(v)) walkJson(v[k]); }
}
if (fs.existsSync(JSON_DIR)) {
  for (const f of fs.readdirSync(JSON_DIR).filter((x) => x.endsWith('.json'))) {
    try { walkJson(JSON.parse(fs.readFileSync(path.join(JSON_DIR, f), 'utf8').replace(/^\uFEFF/, ''))); } catch (e) { /* ignore */ }
  }
}
for (const u of jsonPics) urls.add(u);

// ---- 2. download ---------------------------------------------------------------
function localPathFor(u) {
  let p;
  try { p = new URL(u); } catch (e) { return null; }
  let pn = decodeURIComponent(p.pathname).replace(/^\/+/, '');
  if (!pn || pn.endsWith('/')) pn += 'index';
  pn = pn.replace(/[\\:*?"<>|]/g, '_');
  // keep hdslb hosts separated so identical basenames never collide
  const host = p.hostname.replace(/^www\./, '');
  if (/^i[0-9]\.hdslb\.com$/.test(host)) return path.join('pic', pn);
  return pn;
}

async function get(url, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal, redirect: 'follow', headers: { 'User-Agent': UA, Referer: 'http://www.bilibili.com/' } });
    const buf = Buffer.from(await r.arrayBuffer());
    return { ok: r.ok && buf.length > 0, status: r.status, buf, type: r.headers.get('content-type') || '' };
  } catch (e) {
    return { ok: false, status: 0, buf: null, type: '', err: e.message };
  } finally { clearTimeout(t); }
}

const isImage = (r, u) => {
  if (!r.buf || r.buf.length < 24) return false;
  if (r.type && !/image|octet-stream/i.test(r.type)) return false;
  const b = r.buf;
  const sig =
    (b[0] === 0x89 && b[1] === 0x50) || (b[0] === 0xff && b[1] === 0xd8) ||
    (b[0] === 0x47 && b[1] === 0x49) || (b[0] === 0x42 && b[1] === 0x4d) ||
    (b.toString('ascii', 0, 5) === '<svg ') || (b.toString('ascii', 0, 4) === 'RIFF') ||
    (b[0] === 0x00 && b[1] === 0x00 && b[2] === 0x01) || /\.ico$/i.test(u);
  return sig;
};

async function one(url) {
  const rel = localPathFor(url);
  if (!rel) return { url, status: 'skip-bad-url' };
  const dest = path.join(ASSETS, rel);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 100) {
    return { url, path: rel.split(path.sep).join('/'), file: dest, bytes: fs.statSync(dest).size, status: 'ok', source: 'cached' };
  }
  const bare = url.replace(/^https?:\/\//, '');
  const attempts = [
    ['live', `https://${bare}`],
    ['wayback', `http://web.archive.org/web/${WAYBACK_TS}im_/${url}`],
    ['wayback-any', `http://web.archive.org/web/2015im_/${url}`],
  ];
  for (const [source, attempt] of attempts) {
    // eslint-disable-next-line no-await-in-loop
    const r = await get(attempt, 45000);
    if (r.ok && isImage(r, url)) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, r.buf);
      return { url, path: rel.split(path.sep).join('/'), file: dest, bytes: r.buf.length, status: 'ok', source };
    }
    if (source === 'live' && r.status === 404) break; // no point hitting the archive twice for a dead typo
  }
  return { url, status: 'missing' };
}

(async () => {
  const list = [...urls].sort();
  console.log(`collected ${list.length} candidate urls (${jsonPics.size} from json)`);
  const results = [];
  let i = 0;
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (i < list.length) {
      const idx = i++;
      // eslint-disable-next-line no-await-in-loop
      const r = await one(list[idx]);
      results.push(r);
      if (r.status === 'ok') console.log(`  ok    ${String(r.bytes).padStart(8)}B ${r.source.padEnd(12)} ${r.url}`);
      else console.log(`  ${r.status.padEnd(6)} ${r.url}`);
    }
  });
  await Promise.all(workers);

  const manifest = {};
  for (const r of results) manifest[r.url] = r;
  fs.mkdirSync(ASSETS, { recursive: true });
  fs.writeFileSync(path.join(ASSETS, 'MANIFEST.json'), JSON.stringify(manifest, null, 2), 'utf8');

  const ok = results.filter((r) => r.status === 'ok');
  console.log(`\nDONE ok=${ok.length} missing=${results.length - ok.length} bytes=${ok.reduce((a, r) => a + r.bytes, 0)}`);
})();
