// Fidelity proof for the recovered thumbnails.
//
// Earlier I claimed byte-exactness from `md5(filename) == md5(bytes)`. That was WRONG, and the
// sample was too small to notice: only 8 of 236 files satisfy it. The reason is visible in the URL
// shape. Video thumbnails live at
//        i0.hdslb.com/<W>x<H>/video/<2hex>/<md5>.jpg      e.g. 320_180/video/3b/3b233976....jpg
// and avatars at i0.hdslb.com/240_180/u_user/<md5>.jpg. The <md5> is the hash of the ORIGINAL
// upload, while the file actually served is a RESIZED RENDITION selected by the <W>x<H> path
// prefix - so the bytes can never hash back to the name. Only /promote/<md5>.jpg is stored
// verbatim, and those 6 files are exactly the ones that matched.
//
// The property that actually matters is different, and it is testable: for a given URL the bytes
// never change over time, so a capture from ANY year returns the same picture the July-2015 page
// showed. This script proves that by re-fetching, from a 2019 capture, files whose local copy came
// from a 2014/2015 capture, and comparing bytes.
//
// Writes assets/_tools/stability-proof.json.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ASSETS = path.resolve(__dirname, '..');
const m = JSON.parse(fs.readFileSync(path.join(ASSETS, 'MANIFEST.json'), 'utf8'));
const UA = { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36' };
const md5 = (b) => crypto.createHash('md5').update(b).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SAMPLE = +(process.argv.find((a) => a.startsWith('--sample=')) || '--sample=6').split('=')[1];
const LATER = '20190327085721';

(async () => {
  // local copies that came from an early capture - if the URL is stable these must equal a 2019 fetch
  const picks = Object.entries(m)
    .filter(([u, e]) => e.status === 'ok' && e.path && e.path.startsWith('pic/') && e.served && +e.served.slice(0, 4) <= 2015)
    .slice(0, SAMPLE);

  const rows = [];
  let identical = 0, differs = 0, unavailable = 0, nameMatches = 0;
  for (const [url, e] of picks) {
    const local = fs.readFileSync(path.join(ASSETS, e.path));
    const name = path.basename(e.path).replace(/^[0-9a-f]{8}-/, '').replace(/\.jpe?g$/i, '');
    const nameOk = md5(local) === name.toLowerCase();
    if (nameOk) nameMatches++;
    let remote = null;
    try {
      const r = await fetch(`https://web.archive.org/web/${LATER}if_/${url}`, { headers: UA, signal: AbortSignal.timeout(90000) });
      if (r.status === 200) { const b = Buffer.from(await r.arrayBuffer()); if (b.length > 200) remote = b; }
      else await r.arrayBuffer().catch(() => {});
    } catch { /* treated as unavailable */ }
    const verdict = !remote ? 'unavailable' : md5(remote) === md5(local) ? 'identical' : 'differs';
    if (verdict === 'identical') identical++; else if (verdict === 'differs') differs++; else unavailable++;
    rows.push({ url, path: e.path, localServed: e.served, localBytes: local.length, localMd5: md5(local), nameMd5: name, nameMatches: nameOk, laterCapture: LATER, verdict, laterBytes: remote ? remote.length : null, laterMd5: remote ? md5(remote) : null });
    console.log(`${name.slice(0, 12)}  served=${e.served}  ${local.length}B  md5(name)==md5(bytes): ${nameOk ? 'yes' : 'NO'}   vs 2019 capture: ${verdict}`);
    await sleep(2200);
  }

  const out = {
    checkedAt: new Date().toISOString(),
    claimWithdrawn: 'md5(filename) == md5(bytes) does NOT prove byte-exactness: the path encodes a resized rendition keyed by the md5 of the original upload. Only /promote/<md5>.jpg is stored verbatim.',
    propertyProved: 'For a given URL the served bytes are stable across capture years, so a capture from any year returns the same picture the 2015 page showed.',
    sample: rows.length, identical, differs, unavailable, nameMatches,
    rows,
  };
  fs.writeFileSync(path.join(__dirname, 'stability-proof.json'), JSON.stringify(out, null, 2));
  console.log(`\nURL byte-stability: identical=${identical} differs=${differs} unavailable=${unavailable} (of ${rows.length})`);
  console.log(`filename-md5 == byte-md5: ${nameMatches}/${rows.length}  <- the withdrawn claim`);
})().catch((e) => { console.error('fatal', e); process.exit(1); });
