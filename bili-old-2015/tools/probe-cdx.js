// tools/probe-cdx.js — can the wayback machine actually serve the 2015 thumbnail urls?
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
const samples = [
  'i2.hdslb.com/sp/10/10bd74b80ca240b455ffc770f1fa42ef.jpg',
  'i1.hdslb.com/320_180/video/05/057e8cb32df0dc46824b34a',
  'i0.hdslb.com/320_180/u_user/b041668a707ad5f5af64076f7',
];
async function tryGet(u, timeout) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), timeout);
  try {
    const r = await fetch(u, { signal: c.signal, headers: { 'User-Agent': UA } });
    const txt = await r.text();
    return { status: r.status, body: txt.slice(0, 300) };
  } catch (e) { return { status: 'ERR', body: e.name + ': ' + e.message }; } finally { clearTimeout(t); }
}
(async () => {
  for (const s of samples) {
    const cdx = `http://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(s)}&output=json&limit=3`;
    const a = await tryGet(cdx, 30000);
    console.log(`CDX ${s}\n  ${a.status} ${a.body.replace(/\n/g, ' ').slice(0, 220)}`);
  }
  const wild = 'http://web.archive.org/cdx/search/cdx?url=i2.hdslb.com%2Fsp%2F*&output=json&limit=3&filter=statuscode:200';
  const b = await tryGet(wild, 40000);
  console.log(`CDX wildcard sp/*\n  ${b.status} ${b.body.replace(/\n/g, ' ').slice(0, 300)}`);
})();
