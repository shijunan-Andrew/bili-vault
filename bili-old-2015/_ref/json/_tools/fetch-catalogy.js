// Fetch the per-category ranking payloads the homepage's category blocks need.
//
// page.index.v3.js declares blocks for tids 1,3,4,5,11,13,23,36,119,129. Each block's
// ranking pane is built by CreateArea.createRankingSelect(tid) (_ref/page.core.pretty.js:290-316),
// whose items are:
//     /index/catalogy/<tid>-3day.json   "三日"  <- default selection
//     /index/catalogy/<tid>-week.json   "一周"
//     /index/catalogy/<tid>-month.json  "一月"  (never used: only tids 145/146/147/82/83/85)
//
// Strategy: ask the CDX index what captures exist AT ALL (any year 2010-2018) rather than
// assuming a 2015 capture, then download the capture closest to the homepage's own
// 2015-07-01T08:22:08Z. An off-era ranking list still beats an empty pane, and the served
// timestamp is recorded per file so provenance stays honest.
//
// Saves to _ref/json/catalogy/<tid>-<variant>.json and records provenance in
// _ref/json/catalogy/SOURCES.json. Idempotent: existing non-empty files are kept.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const OUT = path.resolve(__dirname, '..', 'catalogy');
const HOME = Date.UTC(2015, 6, 1, 8, 22, 8);
const TIDS = [1, 3, 4, 5, 11, 13, 23, 36, 119, 129];
const NAMES = { 1: 'douga', 3: 'music', 4: 'game', 5: 'ent', 11: 'teleplay', 13: 'bangumi', 23: 'movie', 36: 'technology', 119: 'kichiku', 129: 'dance' };
const variants = process.argv.includes('--3day-only') ? ['3day'] : ['3day', 'week'];

// Output filename convention requested by the builder:
//   <tid>-<name>-<variant>.json      e.g. 23-movie-3day.json
const fileFor = (tid, v) => `${tid}-${NAMES[tid]}-${v}.json`;

const UA = { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha1 = (b) => crypto.createHash('sha1').update(b).digest('hex');
const tsDate = (t) => new Date(Date.UTC(+t.slice(0, 4), +t.slice(4, 6) - 1, +t.slice(6, 8), +t.slice(8, 10), +t.slice(10, 12), +t.slice(12, 14)));

async function cdxAll() {
  // one query for the whole /index/catalogy/ prefix, every year
  const url = 'http://web.archive.org/cdx/search/cdx?url=bilibili.com/index/catalogy/' +
    '&matchType=prefix&from=2010&to=2018&output=json&fl=timestamp,original,statuscode,length,digest' +
    '&filter=statuscode:200&collapse=digest&limit=5000';
  for (let a = 0; a < 3; a++) {
    try {
      const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(120000) });
      if ([429, 502, 503, 504].includes(res.status)) { console.log(`cdx throttle ${res.status}, retry`); await sleep(25000 * (a + 1)); continue; }
      if (res.status !== 200) { console.log('cdx status', res.status); return null; }
      const rows = JSON.parse(await res.text());
      return rows.slice(1).map((r) => ({ timestamp: r[0], original: r[1], status: r[2], length: r[3], digest: r[4] }));
    } catch (e) { console.log('cdx err', e.message.slice(0, 80)); await sleep(15000 * (a + 1)); }
  }
  return null;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  console.log('querying CDX for every /index/catalogy/ capture, 2010-2018 ...');
  const all = await cdxAll();
  if (!all) { console.log('CDX unavailable — falling back to blind per-tid fetch'); }

  const report = fs.existsSync(path.join(OUT, 'SOURCES.json')) ? JSON.parse(fs.readFileSync(path.join(OUT, 'SOURCES.json'), 'utf8')) : {};
  const index = {};
  const CDX_CACHE = path.join(__dirname, 'cdx-catalogy.json');
  if (!all && fs.existsSync(CDX_CACHE)) {
    Object.assign(index, JSON.parse(fs.readFileSync(CDX_CACHE, 'utf8')));
    console.log('using cached CDX index', CDX_CACHE);
  }
  if (all) {
    for (const r of all) {
      const m = /\/(\d+)-(3day|week|month)\.json$/.exec(r.original);
      if (!m) continue;
      const k = `${m[1]}-${m[2]}`;
      (index[k] = index[k] || []).push(r.timestamp);
    }
    console.log(`\nCDX availability (${all.length} rows, ${Object.keys(index).length} distinct tid-variant files):`);
    for (const k of Object.keys(index).sort((a, b) => TIDS.indexOf(+a.split('-')[0]) - TIDS.indexOf(+b.split('-')[0]) || (a < b ? -1 : 1))) {
      console.log(`  ${k.padEnd(12)} ${index[k].length} capture(s): ${index[k].sort().join(' ')}`);
    }
    fs.writeFileSync(path.join(OUT, '..', '_tools', 'cdx-catalogy.json'), JSON.stringify(index, null, 2));
  }

  let ok = 0, miss = 0;
  for (const tid of TIDS) {
    for (const v of variants) {
      const key = `${tid}-${v}`;
      const url = `http://www.bilibili.com/index/catalogy/${key}.json`;
      const dest = path.join(OUT, fileFor(tid, v));
      if (fs.existsSync(dest) && fs.statSync(dest).size > 2) { console.log('cached', key); ok++; continue; }

      // pick the capture closest to the homepage timestamp
      let candidates = index[key] ? [...index[key]] : [];
      candidates.sort((a, b) => Math.abs(tsDate(a) - HOME) - Math.abs(tsDate(b) - HOME));
      if (!candidates.length && Object.keys(index).length) {
        // CDX says this endpoint was never captured in 2010-2018 - do not waste requests on it
        report[key] = {
          url, tid, name: NAMES[tid], variant: v, status: 'MISSING',
          note: 'no capture of this endpoint exists in the CDX index for any year 2010-2018',
        };
        miss++;
        console.log(`MISSING ${key} (no capture in CDX 2010-2018)`);
        continue;
      }
      const picks = candidates.length ? candidates.slice(0, 3) : [null];   // null = let wayback redirect from 20150701082208

      let done = false;
      for (const ts of picks) {
        if (done) break;
        const target = ts
          ? `https://web.archive.org/web/${ts}id_/${url}`
          : `https://web.archive.org/web/20150701082208if_/${url}`;
        for (let attempt = 0; attempt < 3 && !done; attempt++) {
          try {
            const res = await fetch(target, { redirect: 'follow', headers: UA, signal: AbortSignal.timeout(90000) });
            if ([429, 502, 503, 504].includes(res.status)) {
              console.log(`throttle ${res.status} ${key}, wait ${20 * (attempt + 1)}s`);
              await res.arrayBuffer().catch(() => {});
              await sleep(20000 * (attempt + 1));
              continue;
            }
            if (res.status !== 200) { await res.arrayBuffer().catch(() => {}); break; }
            const buf = Buffer.from(await res.arrayBuffer());
            const hadBom = buf.length > 2 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
            const txt = buf.toString('utf8').replace(/^\uFEFF/, '').trim();
            if (!/^[[{]/.test(txt)) { console.log(`not-json ${key}${ts ? '@' + ts : ''}: ${txt.slice(0, 70)}`); break; }
            let parsed;
            try { parsed = JSON.parse(txt); } catch (e) { console.log(`parse-fail ${key}: ${e.message.slice(0, 60)}`); break; }
            const body = Buffer.from(txt, 'utf8');
            fs.writeFileSync(dest, body);
            const servedM = /\/web\/(\d{14})/.exec(res.url);
            const served = servedM ? servedM[1] : ts;
            report[key] = {
              url, tid, name: NAMES[tid], variant: v, file: fileFor(tid, v), served,
              deltaDays: served ? Math.round((tsDate(served) - HOME) / 86400000) : null,
              bytes: body.length, sha1: sha1(body), bomStripped: hadBom,
              shape: Array.isArray(parsed) ? `array[${parsed.length}]` : `object{${Object.keys(parsed).slice(0, 8).join(',')}}`,
              topKeys: Array.isArray(parsed) ? null : Object.keys(parsed).slice(0, 12),
              recommendLength: Array.isArray(parsed && parsed.recommend) ? parsed.recommend.length
                : (parsed && parsed.recommend && typeof parsed.recommend === 'object' ? Object.keys(parsed.recommend).length : null),
            };
            ok++;
            done = true;
            console.log(`OK ${fileFor(tid, v)} served=${served} delta=${report[key].deltaDays}d ${body.length}B recommend=${report[key].recommendLength}`);
          } catch (e) {
            console.log(`err ${key}${ts ? '@' + ts : ''} try${attempt}: ${e.message.slice(0, 70)}`);
            if (attempt < 2) await sleep(8000 * (attempt + 1));
          }
        }
        if (!done) await sleep(4000);
      }
      if (!done) { report[key] = { url, tid: NAMES[tid], name: NAMES[tid], variant: v, status: 'MISSING', note: candidates.length ? `${candidates.length} capture(s) existed but none downloaded` : 'no capture of this endpoint exists in CDX for any year 2010-2018' }; miss++; console.log(`MISSING ${key}`); }
      await sleep(3000);
    }
  }
  fs.writeFileSync(path.join(OUT, 'SOURCES.json'), JSON.stringify(report, null, 2));
  console.log(`\ndone: ok=${ok} missing=${miss} -> ${path.relative(process.cwd(), OUT)}`);
})();
