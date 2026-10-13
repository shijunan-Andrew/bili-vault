// Patient, resumable fetcher for archived 2015 bilibili JSON.
// Avoids the CDX API (rate-limited) by asking /web/<ts>id_/ directly and reading
// response.url to learn which snapshot was actually served.
//
//   node fetch-json2.js            -> fetch every endpoint still missing
//   node fetch-json2.js --force    -> refetch everything
//   node fetch-json2.js <name>...  -> only the named local files
const fs = require('fs');
const path = require('path');

const OUT = path.resolve(__dirname, '..');
const FORCE = process.argv.includes('--force');
const ONLY = process.argv.slice(2).filter((a) => !a.startsWith('--'));

// Local filename -> candidate remote URLs (tried in order)
const JOBS = [
  ['slideshow.json', ['http://www.bilibili.com/index/slideshow.json']],
  ['ranking.json', ['http://www.bilibili.com/index/ranking.json']],
  ['ranking-3day.json', ['http://www.bilibili.com/index/ranking-3day.json']],
  ['ranking-week.json', ['http://www.bilibili.com/index/ranking-week.json']],
  ['promote.json', ['http://www.bilibili.com/index/promote.json']],
  ['promote-12.json', ['http://www.bilibili.com/index/promote/12.json']],
  ['recommend.json', ['http://www.bilibili.com/index/recommend.json']],
  ['bangumi.json', ['http://www.bilibili.com/index/bangumi.json']],
  ['ding.json', ['http://www.bilibili.com/index/ding.json']],
  ['ding-count.json', ['http://www.bilibili.com/index/ding-count.json']],
];

// Snapshot timestamps to try, nearest to the page capture first.
const STAMPS = ['20150701082208', '20150629000000', '20150703000000', '20150601000000', '20150801000000'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function get(url, { accept = '*/*' } = {}) {
  for (let attempt = 1; attempt <= 6; attempt++) {
    let res;
    try {
      res = await fetch(url, {
        redirect: 'follow',
        headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36', accept },
        signal: AbortSignal.timeout(90000),
      });
    } catch (e) {
      log(`  net-err (${e.message}) attempt ${attempt}`);
      await sleep(20000 * attempt);
      continue;
    }
    if (res.status === 429 || res.status === 503 || res.status === 504 || res.status === 502) {
      const wait = 25000 * attempt;
      log(`  HTTP ${res.status} throttled; waiting ${Math.round(wait / 1000)}s`);
      await res.arrayBuffer().catch(() => {});
      await sleep(wait);
      continue;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    return { res, buf };
  }
  return null;
}

function isJson(buf) {
  const s = buf.toString('utf8').replace(/^\uFEFF/, '').trimStart();
  return s.startsWith('{') || s.startsWith('[');
}

(async () => {
  const results = [];
  for (const [local, remotes] of JOBS) {
    if (ONLY.length && !ONLY.includes(local)) continue;
    const dest = path.join(OUT, local);
    if (!FORCE && fs.existsSync(dest) && fs.statSync(dest).size > 2 && isJson(fs.readFileSync(dest))) {
      log(`SKIP ${local} (already present)`);
      results.push({ local, status: 'SKIP' });
      continue;
    }
    let done = false;
    for (const remote of remotes) {
      if (done) break;
      for (const stamp of STAMPS) {
        const url = `https://web.archive.org/web/${stamp}id_/${remote}`;
        log(`GET ${local} <- ${stamp}`);
        const got = await get(url);
        if (!got) { log(`  gave up on ${stamp}`); continue; }
        const { res, buf } = got;
        const m = /\/web\/(\d{14})/.exec(res.url || '');
        const served = m ? m[1] : stamp;
        if (res.status === 200 && isJson(buf) && buf.length > 2) {
          fs.writeFileSync(dest, buf);
          let shape = '?';
          try {
            const p = JSON.parse(buf.toString('utf8'));
            shape = Array.isArray(p) ? `array[${p.length}]` : `object{${Object.keys(p).join(',')}}`;
          } catch { shape = 'unparseable'; }
          log(`  OK ${local} ${buf.length}B served=${served} ${shape}`);
          results.push({ local, status: 'OK', bytes: buf.length, requested: stamp, served, remote, shape });
          done = true;
          break;
        }
        log(`  miss http=${res.status} json=${isJson(buf)} bytes=${buf.length}`);
        await sleep(4000);
      }
    }
    if (!done) {
      log(`  MISSING ${local}`);
      results.push({ local, status: 'MISSING' });
    }
    await sleep(9000);
  }
  const repPath = path.join(OUT, '_tools', 'fetch-report2.json');
  fs.writeFileSync(repPath, JSON.stringify(results, null, 2));
  log('report ->', repPath);
  log(`${results.filter((r) => r.status === 'OK').length} ok / ${results.filter((r) => r.status === 'MISSING').length} missing`);
})();
