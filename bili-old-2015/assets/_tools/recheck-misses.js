// After the main download finishes, re-verify every MISS against the CDX index.
//
// Why: during the run the CDX API was itself returning 503 / empty results under load, so a
// "no capture" answer taken while the downloader was running is not trustworthy. This pass runs
// afterwards, retries each query patiently, and separates two very different causes:
//
//   1. capture EXISTS   -> the download failed for a transient reason. Re-download it via id_.
//   2. no capture at all -> the asset was never archived; genuinely unrecoverable.
//
// Also re-checks the live CDN (today's host) as a second chance, since some assets come back.
//
// Usage: node assets/_tools/recheck-misses.js            # report only
//        node assets/_tools/recheck-misses.js --fix      # also re-download what it can
const fs = require('fs');
const path = require('path');

const ASSETS = path.resolve(__dirname, '..');
const ROOT = path.resolve(ASSETS, '..');
const HOME = Date.UTC(2015, 6, 1, 8, 22, 8);
const FIX = process.argv.includes('--fix');
const POOL = +(process.argv.find((a) => a.startsWith('--pool=')) || '--pool=4').split('=')[1];
const UA = { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function kindOf(buf) {
  if (!buf || buf.length < 4) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf[0] === 0x89 && buf.toString('latin1', 1, 4) === 'PNG') return 'png';
  if (buf.toString('latin1', 0, 3) === 'GIF') return 'gif';
  if (buf[0] === 0x00 && buf[1] === 0x00 && (buf[2] === 0x01 || buf[2] === 0x02)) return 'ico';
  if (buf.toString('latin1', 0, 4) === 'wOFF') return 'woff';
  if (buf.toString('latin1', 0, 4) === 'wOF2') return 'woff2';
  if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  if (/<svg|<\?xml[\s\S]{0,200}<svg/i.test(buf.toString('latin1', 0, 300))) return 'svg';
  return null;
}
const tsDate = (t) => Date.UTC(+t.slice(0, 4), +t.slice(4, 6) - 1, +t.slice(6, 8), +t.slice(8, 10), +t.slice(10, 12), +t.slice(12, 14));

async function cdx(url, tries = 5) {
  const q = 'http://web.archive.org/cdx/search/cdx?url=' + encodeURIComponent(url) +
    '&output=json&fl=timestamp,statuscode,length&limit=40&filter=statuscode:200&collapse=digest';
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(q, { headers: UA, signal: AbortSignal.timeout(60000) });
      const txt = await r.text();
      if (r.status === 200) {
        if (!txt.trim()) return { ok: true, captures: [] };              // authoritative: nothing archived
        const rows = JSON.parse(txt).slice(1);
        return { ok: true, captures: rows.map((x) => x[0]) };
      }
      if (![429, 502, 503, 504].includes(r.status)) return { ok: false, error: 'status ' + r.status };
    } catch (e) { if (i === tries - 1) return { ok: false, error: e.message.slice(0, 60) }; }
    await sleep(6000 * (i + 1));
  }
  return { ok: false, error: 'exhausted retries' };
}

async function fetchRaw(url, ts) {
  const target = ts ? `https://web.archive.org/web/${ts}id_/${url}` : `https://web.archive.org/web/20150701082208if_/${url}`;
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(target, { redirect: 'follow', headers: UA, signal: AbortSignal.timeout(90000) });
      if ([429, 502, 503, 504].includes(r.status)) { await r.arrayBuffer().catch(() => {}); await sleep(20000 * (i + 1)); continue; }
      if (r.status !== 200) { await r.arrayBuffer().catch(() => {}); return null; }
      const buf = Buffer.from(await r.arrayBuffer());
      return kindOf(buf) ? { buf, served: (/\/web\/(\d{14})/.exec(r.url) || [])[1] || ts } : null;
    } catch { await sleep(10000 * (i + 1)); }
  }
  return null;
}

async function tryLive(url) {
  let u; try { u = new URL(url); } catch { return null; }
  try {
    const r = await fetch('https://' + u.host + u.pathname + u.search, { headers: UA, signal: AbortSignal.timeout(25000) });
    if (r.status !== 200) { await r.arrayBuffer().catch(() => {}); return null; }
    const buf = Buffer.from(await r.arrayBuffer());
    return kindOf(buf) ? { buf, served: 'live' } : null;
  } catch { return null; }
}

(async () => {
  const mf = path.join(ASSETS, '_tools', 'missing.json');
  const miss = JSON.parse(fs.readFileSync(mf, 'utf8')).missing.map((s) => {
    const [dest, url] = s.split('  <-  ');
    return { dest: dest.trim(), url: url.trim() };
  });
  console.log(`re-checking ${miss.length} missed assets against CDX (fix=${FIX}), pool width ${POOL}`);

  const report = { checkedAt: new Date().toISOString(), hadCapture: [], trulyUnarchived: [], cdxUnavailable: [], recovered: [] };
  const summary = fs.existsSync(path.join(ASSETS, '_tools', 'recheck-report.json'))
    ? JSON.parse(fs.readFileSync(path.join(ASSETS, '_tools', 'recheck-report.json'), 'utf8'))
    : null;
  // Short-circuit anything a previous partial run already classified.
  const known = new Map();
  if (summary) for (const b of [summary.hadCapture, summary.trulyUnarchived, summary.cdxUnavailable])
    for (const x of (b || [])) known.set(x.url, x);
  for (const x of (summary ? summary.trulyUnarchived || [] : [])) report.trulyUnarchived.push(x);
  for (const x of (summary ? summary.cdxUnavailable || [] : [])) report.cdxUnavailable.push(x);
  for (const x of (summary ? summary.hadCapture || [] : [])) report.hadCapture.push(x);

  let done = 0;
  const queue = miss.filter((x) => !known.has(x.url));
  console.log(`${miss.length - queue.length} already classified by a previous run; ${queue.length} to check`);

  async function worker() {
    while (queue.length) {
      const { dest, url } = queue.shift();
      done++;
      const c = await cdx(url);
      if (!c.ok) {
        report.cdxUnavailable.push({ dest, url, error: c.error });
        console.log(`[${done}/${queue.length + done}] ?    ${dest}  (cdx unavailable: ${c.error})`);
        await sleep(300);
        continue;
      }
      if (!c.captures.length) {
        report.trulyUnarchived.push({ dest, url });
        console.log(`[${done}] GONE ${dest}  never archived`);
        await sleep(200);
        continue;
      }
      c.captures.sort((a, b) => Math.abs(tsDate(a) - HOME) - Math.abs(tsDate(b) - HOME));
      const rec = { dest, url, captures: c.captures.length, best: c.captures[0], all: c.captures };
      console.log(`[${done}] HAVE ${dest}  ${c.captures.length} capture(s), best ${c.captures[0]}`);
      report.hadCapture.push(rec);
      await sleep(200);
    }
  }
  await Promise.all(Array.from({ length: POOL }, worker));

  // Re-download, serially, only what CDX proved is archived.
  if (FIX) {
    for (const rec of report.hadCapture) {
      if (rec.recoveredAs) continue;
      const got = (await fetchRaw(rec.url, rec.best)) || (await tryLive(rec.url));
      if (got) {
        const abs = path.join(ASSETS, rec.dest);
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, got.buf);
        rec.recoveredAs = got.served;
        report.recovered.push(rec);
        console.log(`   -> recovered ${rec.dest} ${got.buf.length}B (${got.served})`);
      } else {
        rec.recoveredAs = null;
        console.log(`   -> still failed ${rec.dest}`);
      }
      await sleep(1500);
      fs.writeFileSync(path.join(ASSETS, '_tools', 'recheck-report.json'), JSON.stringify(report, null, 2));
    }
  }

  fs.writeFileSync(path.join(ASSETS, '_tools', 'recheck-report.json'), JSON.stringify(report, null, 2));
  console.log(`\ncapture-existed=${report.hadCapture.length}  never-archived=${report.trulyUnarchived.length}  cdx-unavailable=${report.cdxUnavailable.length}  recovered-now=${report.recovered.length}`);
})().catch((e) => { console.error('fatal', e); process.exit(1); });
