// Discover every captured *.json under www.bilibili.com/index/ in 2015 (CDX prefix scan).
const PROXY = 'http://127.0.0.1:7897';
process.env.HTTPS_PROXY = PROXY; process.env.HTTP_PROXY = PROXY;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function cdx(url) {
  for (let i = 0; i < 6; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        signal: AbortSignal.timeout(90000),
      });
      if (res.status === 429) { console.log('429 -> backoff', 15 * (i + 1), 's'); await sleep(15000 * (i + 1)); continue; }
      const t = await res.text();
      return { status: res.status, text: t };
    } catch (e) { console.log('err', e.message, '- retry'); await sleep(8000 * (i + 1)); }
  }
  return { status: 0, text: '' };
}

(async () => {
  const seen = new Map();
  for (const [label, u] of [
    ['index-prefix', 'https://web.archive.org/cdx/search/cdx?url=www.bilibili.com/index/*&from=20150101&to=20151231&output=json&limit=4000&collapse=urlkey'],
    ['json-any', 'https://web.archive.org/cdx/search/cdx?url=www.bilibili.com&matchType=domain&from=20150601&to=20150801&output=json&limit=6000&filter=original:.*index.*\\.json&collapse=urlkey'],
  ]) {
    console.log('=== ' + label + ' ===');
    const r = await cdx(u);
    console.log('status', r.status, 'len', r.text.length);
    if (!r.text.trim()) { await sleep(5000); continue; }
    let rows;
    try { rows = JSON.parse(r.text); } catch (e) { console.log('parse fail', r.text.slice(0, 200)); await sleep(5000); continue; }
    const head = rows[0] || [];
    const iOrig = head.indexOf('original'), iTs = head.indexOf('timestamp'), iSt = head.indexOf('statuscode');
    for (const row of rows.slice(1)) {
      const orig = row[iOrig];
      if (!/\.json(\?|$)/i.test(orig)) continue;
      const key = orig.replace(/^https?:\/\//, '').toLowerCase();
      if (!seen.has(key)) seen.set(key, { orig, ts: row[iTs], st: row[iSt] });
    }
    console.log('cumulative json urls:', seen.size);
    await sleep(8000);
  }
  const out = [...seen.values()].sort((a, b) => a.orig.localeCompare(b.orig));
  console.log('\n=== ' + out.length + ' distinct json urls ===');
  for (const o of out) console.log(`${o.ts} ${o.st} ${o.orig}`);
  require('fs').writeFileSync(__dirname + '/discover.json', JSON.stringify(out, null, 2));
})();
