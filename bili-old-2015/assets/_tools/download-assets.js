// Download every asset the 2015 rebuild needs into assets/ (task-2 part B).
//
// Job sources:
//   1. url() refs in _ref/new_z2.css, _ref/index.css, _ref/jquery-ui.css  -> assets/<original path>
//   2. thumbnails in _ref/pic-urls.txt (JSON pic/cover/image urls)        -> assets/pic/<basename>
//
// Source preference per asset: live CDN (https://<host><path>) first, then
// Wayback (https://web.archive.org/web/20150701082208if_/<original-url>).
// NOTE: the live CDN 404s for nearly all 2015 static paths; Wayback is the
// real source. Live is still tried first because it is fast and free of rate limits.
//
// Usage: node assets/_tools/download-assets.js [--only=static|pic] [--limit=N] [--no-live]
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const ASSETS = path.join(ROOT, 'assets');
const REF = path.join(ROOT, '_ref');
const MANIFEST = path.join(ASSETS, 'MANIFEST.json');

const argv = process.argv.slice(2);
const ONLY = (argv.find((a) => a.startsWith('--only=')) || '').split('=')[1] || '';
const LIMIT = Number((argv.find((a) => a.startsWith('--limit=')) || '').split('=')[1] || 0);
const NO_LIVE = argv.includes('--no-live');

const UA = { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => new Date().toISOString().slice(11, 19);
const log = (...a) => console.log(now(), ...a);

// ------------------------------------------------------------------ magic bytes
function imageKind(buf) {
  if (!buf || buf.length < 4) return null;
  const h4 = buf.slice(0, 4).toString('hex');
  const h3 = buf.slice(0, 3).toString('hex');
  const h2 = buf.slice(0, 2).toString('hex');
  const txt = buf.slice(0, 200).toString('latin1').trim().toLowerCase();
  if (txt.startsWith('<!doc') || txt.startsWith('<html') || txt.startsWith('<?xml-stylesheet')) return null; // wayback error page
  if (h2 === 'ffd8') return 'jpg';
  if (h4 === '89504e47') return 'png';
  if (h3 === '474966' || h3 === '474946') return 'gif';
  if (h4 === '00000100') return 'ico';
  if (h4 === '774f4646') return 'woff';
  if (h4 === '774f4632') return 'woff2';
  if (h4 === '00010000' || buf.slice(0, 4).toString('latin1') === 'true') return 'ttf';
  if (txt.startsWith('<?xml') || txt.startsWith('<svg')) return 'svg';
  if (buf.slice(0, 4).toString('latin1') === 'RIFF') return 'webp';
  return null;
}

// ------------------------------------------------------------------ job build
function normalizeRef(raw, base) {
  let u = raw.trim().replace(/^['"]|['"]$/g, '');
  if (!u || u.startsWith('data:') || u.startsWith('#')) return null;
  // unwrap wayback rewriting:  http://web.archive.org/web/<ts>im_/<orig>   or  /web/<ts>im_/<orig>
  const wb = /^(?:https?:)?(?:\/\/web\.archive\.org)?\/web\/\d{14}(?:im_|if_|id_|cs_|js_)?\/(.+)$/.exec(u);
  if (wb) u = wb[1];
  if (/^\/\//.test(u)) u = 'http:' + u;
  if (/^https?:\/\//i.test(u)) return u.replace(/^https:/i, 'http:');
  if (u.startsWith('/')) return base + u;          // root-relative
  return base + (base.endsWith('/') ? '' : '/') + u; // document-relative
}

function collectCss() {
  const specs = [
    ['new_z2.css', 'http://static.hdslb.com/'],
    ['index.css', 'http://static.hdslb.com/'],
    ['jquery-ui.css', 'http://static.hdslb.com/css/'],
  ];
  const found = new Map(); // url -> {url, dest}
  for (const [file, base] of specs) {
    const p = path.join(REF, file);
    if (!fs.existsSync(p)) { log('WARN missing css', file); continue; }
    const txt = fs.readFileSync(p, 'utf8');
    const re = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g;
    let m;
    while ((m = re.exec(txt))) {
      const abs = normalizeRef(m[2], base);
      if (!abs) continue;
      if (!/\.(png|jpe?g|gif|ico|svg|webp|woff2?|ttf|eot|cur)(\?|$)/i.test(abs)) continue;
      const pn = new URL(abs).pathname.replace(/^\/+/, '');
      const dest = pn; // assets/<original path>
      if (!found.has(abs)) found.set(abs, { url: abs, dest, kind: 'static', from: file });
    }
  }
  return [...found.values()];
}

function collectPics() {
  const p = path.join(REF, 'pic-urls.txt');
  if (!fs.existsSync(p)) { log('WARN no pic-urls.txt'); return []; }
  const urls = [...new Set(fs.readFileSync(p, 'utf8').split(/\r?\n/).map((s) => s.trim()).filter(Boolean))];
  const byName = new Map();
  for (const u of urls) {
    let base;
    try { base = path.basename(new URL(u).pathname); } catch { continue; }
    if (!base) continue;
    if (!byName.has(base)) byName.set(base, []);
    byName.get(base).push(u);
  }
  const jobs = [];
  const crypto = require('crypto');
  for (const [base, list] of byName) {
    if (list.length === 1) jobs.push({ url: list[0], dest: 'pic/' + base, kind: 'pic' });
    else for (const u of list) {
      const h = crypto.createHash('sha1').update(u).digest('hex').slice(0, 8);
      jobs.push({ url: u, dest: `pic/${h}-${base}`, kind: 'pic' });
    }
  }
  return jobs;
}

// ------------------------------------------------------------------ fetching
let paceMs = 2500;           // wayback pacing
let consecutiveThrottle = 0;

async function tryLive(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  const httpsUrl = 'https://' + u.host + u.pathname + u.search;
  try {
    const res = await fetch(httpsUrl, { redirect: 'follow', headers: UA, signal: AbortSignal.timeout(25000) });
    if (res.status !== 200) { await res.arrayBuffer().catch(() => {}); return null; }
    const buf = Buffer.from(await res.arrayBuffer());
    return imageKind(buf) ? { buf, source: 'live' } : null;
  } catch { return null; }
}

async function tryWayback(url, tries = 3) {
  const target = `https://web.archive.org/web/20150701082208if_/${url}`;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(target, { redirect: 'follow', headers: UA, signal: AbortSignal.timeout(70000) });
      if ([429, 502, 503, 504].includes(res.status)) {
        consecutiveThrottle++;
        paceMs = Math.min(12000, 2500 + consecutiveThrottle * 1500);
        const wait = 20000 * (i + 1);
        log(`  throttle ${res.status} -> pace=${paceMs}ms wait=${wait / 1000}s`);
        await res.arrayBuffer().catch(() => {});
        await sleep(wait);
        continue;
      }
      consecutiveThrottle = 0;
      if (res.status !== 200) { await res.arrayBuffer().catch(() => {}); return null; }
      const buf = Buffer.from(await res.arrayBuffer());
      const k = imageKind(buf);
      if (!k) return null;
      const m = /\/web\/(\d{14})/.exec(res.url);
      return { buf, source: 'wayback', served: m ? m[1] : null };
    } catch (e) {
      if (i === tries - 1) return null;
      await sleep(8000 * (i + 1));
    }
  }
  return null;
}

// ------------------------------------------------------------------ main
(async () => {
  fs.mkdirSync(path.join(ASSETS, 'pic'), { recursive: true });
  const manifest = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : {};

  let jobs = [];
  if (!ONLY || ONLY === 'static') jobs = jobs.concat(collectCss());
  if (!ONLY || ONLY === 'pic') jobs = jobs.concat(collectPics());
  if (LIMIT) jobs = jobs.slice(0, LIMIT);

  const stats = { okLive: 0, okWayback: 0, okCached: 0, missing: 0, total: jobs.length };
  const missing = [];
  const destSeen = new Map();

  log(`jobs=${jobs.length} (static=${jobs.filter((j) => j.kind === 'static').length} pic=${jobs.filter((j) => j.kind === 'pic').length})`);

  let i = 0;
  for (const job of jobs) {
    i++;
    const abs = path.join(ASSETS, job.dest);
    destSeen.set(job.dest, (destSeen.get(job.dest) || 0) + 1);
    const key = job.url;
    // already have a good copy on disk?
    if (fs.existsSync(abs) && fs.statSync(abs).size > 0 && imageKind(fs.readFileSync(abs))) {
      const bytes = fs.statSync(abs).size;
      manifest[key] = { url: job.url, path: job.dest.replace(/\\/g, '/'), file: abs, bytes, status: 'ok', source: (manifest[key] && manifest[key].source) || 'cached' };
      stats.okCached++;
      if (i % 25 === 0) log(`[${i}/${jobs.length}] cached ${stats.okCached}`);
      continue;
    }
    let got = NO_LIVE ? null : await tryLive(job.url);
    if (!got) got = await tryWayback(job.url);
    if (got) {
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, got.buf);
      manifest[key] = {
        url: job.url,
        path: job.dest.replace(/\\/g, '/'),
        file: abs,
        bytes: got.buf.length,
        status: 'ok',
        source: got.source,
        served: got.served || null,
        from: job.from || null,
      };
      if (got.source === 'live') stats.okLive++; else stats.okWayback++;
      log(`[${i}/${jobs.length}] OK ${got.source}${got.served ? '@' + got.served : ''} ${job.dest} ${got.buf.length}B`);
    } else {
      manifest[key] = { url: job.url, path: job.dest.replace(/\\/g, '/'), status: 'missing' };
      stats.missing++;
      missing.push(job.dest + '  <-  ' + job.url);
      log(`[${i}/${jobs.length}] MISS ${job.dest}`);
    }
    if (got && got.source !== 'live') await sleep(paceMs);
    else if (!got) await sleep(paceMs);
  }

  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(ASSETS, '_tools', 'missing.json'), JSON.stringify({ missing, stats }, null, 2));
  log('--- stats', JSON.stringify(stats));
  log('manifest entries', Object.keys(manifest).length, 'ok', Object.values(manifest).filter((v) => v.status === 'ok').length);
  const dupes = [...destSeen.entries()].filter(([, n]) => n > 1);
  if (dupes.length) log('WARN dest collisions:', JSON.stringify(dupes));
})();
