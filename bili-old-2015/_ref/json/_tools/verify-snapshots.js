// Verify which Wayback snapshot each local _ref/json/*.json actually came from.
// Asks /web/<ts>id_/ and reads response.url for the served 14-digit timestamp.
// Reports served timestamp, sha1, size, and whether bytes match the local file.
// Writes nothing except the report.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const OUT = path.resolve(__dirname, '..');

const JOBS = [
  ['slideshow.json', 'http://www.bilibili.com/index/slideshow.json'],
  ['ranking.json', 'http://www.bilibili.com/index/ranking.json'],
  ['ranking-3day.json', 'http://www.bilibili.com/index/ranking-3day.json'],
  ['ranking-week.json', 'http://www.bilibili.com/index/ranking-week.json'],
  ['promote.json', 'http://www.bilibili.com/index/promote.json'],
  ['promote-12.json', 'http://www.bilibili.com/index/promote/12.json'],
  ['recommend.json', 'http://www.bilibili.com/index/recommend.json'],
  ['bangumi.json', 'http://www.bilibili.com/index/bangumi.json'],
  ['ding.json', 'http://www.bilibili.com/index/ding.json'],
  ['ding-count.json', 'http://www.bilibili.com/index/ding-count.json'],
];

const ASK_STAMPS = ['20150701082208', '20150629000000', '20150703000000'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sha1 = (b) => crypto.createHash('sha1').update(b).digest('hex');

async function get(url) {
  for (let attempt = 1; attempt <= 6; attempt++) {
    let res;
    try {
      res = await fetch(url, {
        redirect: 'follow',
        headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36' },
        signal: AbortSignal.timeout(90000),
      });
    } catch (e) { log('  net-err', e.message, 'attempt', attempt); await sleep(20000 * attempt); continue; }
    if ([429, 502, 503, 504].includes(res.status)) {
      log('  HTTP', res.status, 'throttled, wait', 25 * attempt, 's');
      await res.arrayBuffer().catch(() => {});
      await sleep(25000 * attempt);
      continue;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    return { res, buf };
  }
  return null;
}

(async () => {
  const out = [];
  for (const [local, remote] of JOBS) {
    const dest = path.join(OUT, local);
    const localBuf = fs.existsSync(dest) ? fs.readFileSync(dest) : null;
    const rec = { local, bytes: localBuf ? localBuf.length : 0, sha1: localBuf ? sha1(localBuf) : null, probes: [] };
    for (const stamp of ASK_STAMPS) {
      const got = await get(`https://web.archive.org/web/${stamp}id_/${remote}`);
      if (!got) { rec.probes.push({ asked: stamp, status: 'gave-up' }); continue; }
      const m = /\/web\/(\d{14})/.exec(got.res.url || '');
      const served = m ? m[1] : null;
      const p = {
        asked: stamp, http: got.res.status, served,
        bytes: got.buf.length, sha1: sha1(got.buf),
        sameAsLocal: localBuf ? sha1(got.buf) === sha1(localBuf) : false,
      };
      rec.probes.push(p);
      log(`${local} asked=${stamp} served=${served} http=${got.res.status} bytes=${got.buf.length} match=${p.sameAsLocal}`);
      if (got.res.status === 200) break; // nearest snapshot answered; no need for more probes
      await sleep(5000);
    }
    const hit = rec.probes.find((p) => p.http === 200);
    rec.served = hit ? hit.served : null;
    rec.matchesLocal = hit ? hit.sameAsLocal : false;
    out.push(rec);
    await sleep(9000);
  }
  const rp = path.join(OUT, '_tools', 'verify-report.json');
  fs.writeFileSync(rp, JSON.stringify(out, null, 2));
  log('report ->', rp);
})();
