// tools/fetch-json.js — fetch remaining archived JSON payloads into _ref/json/.
const fs = require('fs');
const path = require('path');
const OUT = path.resolve(__dirname, '../_ref/json');
fs.mkdirSync(OUT, { recursive: true });

const TIDS = [1, 3, 4, 5, 11, 13, 23, 36, 119, 129];
const PROMOS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16];
const jobs = [];
for (const t of TIDS) {
  jobs.push([`catalogy-${t}-3day.json`, `/index/catalogy/${t}-3day.json`]);
  jobs.push([`catalogy-${t}-week.json`, `/index/catalogy/${t}-week.json`]);
}
for (const p of PROMOS) jobs.push([`promote-${p}.json`, `/index/promote/${p}.json`]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function grab(name, urlPath) {
  const dest = path.join(OUT, name);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 40) return `skip ${name} (${fs.statSync(dest).size}B)`;
  const url = `http://web.archive.org/web/20150701082208id_/http://www.bilibili.com${urlPath}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
    const txt = (await r.text()).replace(/^\uFEFF/, '');
    clearTimeout(timer);
    if (!r.ok) return `FAIL ${name} HTTP ${r.status}`;
    if (txt.length < 20) return `FAIL ${name} too short (${txt.length})`;
    try { JSON.parse(txt); } catch (e) { return `FAIL ${name} not JSON: ${txt.slice(0, 60).replace(/\n/g, ' ')}`; }
    fs.writeFileSync(dest, txt, 'utf8');
    return `OK   ${name} ${txt.length}B`;
  } catch (e) {
    clearTimeout(timer);
    return `FAIL ${name} ${e.message}`;
  }
}

(async () => {
  for (const [name, p] of jobs) {
    // eslint-disable-next-line no-await-in-loop
    const res = await grab(name, p);
    console.log(res);
    await sleep(400);
  }
  const files = fs.readdirSync(OUT).filter((f) => f.endsWith('.json'));
  console.log(`\nTOTAL json files: ${files.length}`);
})();
