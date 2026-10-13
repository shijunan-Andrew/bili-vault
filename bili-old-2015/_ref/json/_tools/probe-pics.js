// Probe sample pic URLs against live CDN + Wayback, following redirects (fetch).
const fs = require('fs');

const urls = fs.readFileSync(process.argv[2], 'utf8').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
const N = Number(process.argv[3] || 8);
const step = Math.max(1, Math.floor(urls.length / N));
const sample = [];
for (let i = 0; i < urls.length && sample.length < N; i += step) sample.push(urls[i]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36' };

function magicOf(b) {
  if (b.length < 3) return 'short';
  const h = b.slice(0, 4).toString('hex');
  if (h.startsWith('ffd8ff')) return 'JPEG';
  if (h.startsWith('89504e47')) return 'PNG';
  if (h.startsWith('474946')) return 'GIF';
  if (b.slice(0, 5).toString('latin1').toLowerCase() === '<!doc' || b.slice(0, 5).toString('latin1').toLowerCase() === '<html') return 'HTML';
  return '?' + h;
}

async function probe(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { redirect: 'follow', headers: UA, signal: AbortSignal.timeout(70000) });
      const b = Buffer.from(await res.arrayBuffer());
      const m = /\/web\/(\d{14})/.exec(res.url);
      return { s: res.status, ct: (res.headers.get('content-type') || '').split(';')[0], n: b.length, magic: magicOf(b), served: m ? m[1] : null };
    } catch (e) { if (i === tries - 1) return { s: 'ERR', e: e.message }; await sleep(6000 * (i + 1)); }
  }
}

(async () => {
  console.log(`probing ${sample.length}/${urls.length}\n`);
  let wbOk = 0, liveOk = 0;
  for (const u of sample) {
    const stripped = u.replace(/\/\d+_\d+\//, '/');
    const [live, liveNs, wb] = [await probe(u, 1), await probe(stripped, 1), await probe(`https://web.archive.org/web/20150701082208if_/${u}`)];
    const ok = (r) => r.s === 200 && /JPEG|PNG|GIF/.test(r.magic || '');
    if (ok(live) || ok(liveNs)) liveOk++;
    if (ok(wb)) wbOk++;
    console.log(u.replace('http://', ''));
    console.log(`   live=${live.s}/${live.n}B/${live.magic}  liveNoSize=${liveNs.s}/${liveNs.n}B/${liveNs.magic}`);
    console.log(`   wb=${wb.s}/${wb.n}B/${wb.ct}/${wb.magic} served=${wb.served}`);
    await sleep(2500);
  }
  console.log(`\nSUMMARY sample=${sample.length} liveOK=${liveOk} waybackOK=${wbOk}`);
})();
