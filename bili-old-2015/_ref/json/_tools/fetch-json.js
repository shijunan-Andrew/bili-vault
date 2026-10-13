// Fetch real archived 2015 bilibili JSON payloads from the Wayback Machine.
// Node's OpenSSL stack bypasses the shell's schannel restriction.
// Usage: node _ref/json/_tools/fetch-json.js
const fs = require('fs');
const path = require('path');

const OUT = path.resolve(__dirname, '..');
const PROXY = 'http://127.0.0.1:7897';
process.env.HTTPS_PROXY = PROXY;
process.env.HTTP_PROXY = PROXY;
process.env.NODE_USE_ENV_PROXY = '1';

// Endpoint list: [remote path, local filename]
const ENDPOINTS = [
  ['slideshow.json', 'slideshow.json'],
  ['ranking.json', 'ranking.json'],
  ['ranking-3day.json', 'ranking-3day.json'],
  ['ranking-week.json', 'ranking-week.json'],
  ['promote.json', 'promote.json'],
  ['promote/12.json', 'promote-12.json'],
  ['recommend.json', 'recommend.json'],
  ['bangumi.json', 'bangumi.json'],
  ['ding.json', 'ding.json'],
  ['ding-count.json', 'ding-count.json'],
];

const TARGET = Date.parse('2015-07-01T08:22:08Z');
const SOFT_FROM = '20150625';
const SOFT_TO = '20150707';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function tsToDate(ts) {
  // 20150701082208 -> Date
  const s = `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}T${ts.slice(8, 10)}:${ts.slice(10, 12)}:${ts.slice(12, 14)}Z`;
  return Date.parse(s);
}

async function getText(url, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, {
        redirect: 'follow',
        headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        signal: AbortSignal.timeout(60000),
      });
      const buf = Buffer.from(await res.arrayBuffer());
      return { res, buf };
    } catch (e) {
      lastErr = e;
      await sleep(1500 * (i + 1));
    }
  }
  throw lastErr;
}

async function cdx(remote) {
  const u = `https://web.archive.org/cdx/search/cdx?url=www.bilibili.com/index/${remote}` +
    `&from=20150101&to=20151231&output=json&limit=500&filter=statuscode:200`;
  const { buf } = await getText(u);
  const txt = buf.toString('utf8').trim();
  if (!txt) return [];
  let rows;
  try { rows = JSON.parse(txt); } catch { return []; }
  if (!Array.isArray(rows) || rows.length < 2) return [];
  const head = rows[0];
  const iTs = head.indexOf('timestamp');
  const iLen = head.indexOf('length');
  return rows.slice(1).map((r) => ({ ts: r[iTs], len: Number(r[iLen]) }));
}

function pick(rows) {
  if (!rows.length) return null;
  const inWindow = rows.filter((r) => {
    const d = r.ts.slice(0, 8);
    return d >= SOFT_FROM && d <= SOFT_TO;
  });
  const pool = inWindow.length ? inWindow : rows;
  let best = pool[0], bestD = Infinity;
  for (const r of pool) {
    const d = Math.abs(tsToDate(r.ts) - TARGET);
    if (d < bestD) { bestD = d; best = r; }
  }
  return { ...best, window: inWindow.length > 0 };
}

function isJson(buf) {
  const s = buf.toString('utf8').replace(/^\uFEFF/, '').trimStart();
  return s.startsWith('{') || s.startsWith('[');
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const report = [];
  for (const [remote, local] of ENDPOINTS) {
    const rec = { remote, local, status: 'MISSING', ts: '', bytes: 0, note: '' };
    try {
      const rows = await cdx(remote);
      rec.captures = rows.length;
      const chosen = pick(rows);
      if (!chosen) { rec.note = 'no CDX capture with status 200'; report.push(rec); console.log(JSON.stringify(rec)); continue; }
      rec.cdxTs = chosen.ts;
      rec.cdxWindow = chosen.window;
      const url = `https://web.archive.org/web/${chosen.ts}id_/http://www.bilibili.com/index/${remote}`;
      const { res, buf } = await getText(url);
      // effective timestamp actually served (wayback may redirect)
      const m = /web\/(\d{14})/.exec(res.url);
      rec.servedTs = m ? m[1] : chosen.ts;
      rec.httpStatus = res.status;
      if (res.status !== 200 || !isJson(buf) || buf.length < 2) {
        rec.status = 'BAD';
        rec.note = `http=${res.status} json=${isJson(buf)} bytes=${buf.length}`;
        report.push(rec); console.log(JSON.stringify(rec)); continue;
      }
      fs.writeFileSync(path.join(OUT, local), buf);
      let parsed = null;
      try { parsed = JSON.parse(buf.toString('utf8')); } catch (e) { rec.note = 'parse-warn:' + e.message; }
      rec.status = 'OK';
      rec.bytes = buf.length;
      rec.ts = rec.servedTs;
      rec.shape = Array.isArray(parsed) ? `array[${parsed.length}]` : (parsed && typeof parsed === 'object' ? `object{${Object.keys(parsed).join(',')}}` : String(parsed));
      report.push(rec);
      console.log(JSON.stringify(rec));
    } catch (e) {
      rec.note = 'ERR ' + (e && e.message);
      report.push(rec);
      console.log(JSON.stringify(rec));
    }
    await sleep(600);
  }
  fs.writeFileSync(path.join(OUT, '_tools', 'fetch-report.json'), JSON.stringify(report, null, 2));
  console.log('--- done ---');
})();
