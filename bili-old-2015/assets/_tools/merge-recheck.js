// Fold the recheck pass's recoveries back into assets/MANIFEST.json so that
// assets/thumbs.json and assets/INDEX.md reflect them.
const fs = require('fs');
const path = require('path');
const ASSETS = path.resolve(__dirname, '..');
const MANIFEST = path.join(ASSETS, 'MANIFEST.json');
const REP = path.join(__dirname, 'recheck-report.json');

const m = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const rep = JSON.parse(fs.readFileSync(REP, 'utf8'));

let added = 0, upgraded = 0;
for (const r of rep.recovered) {
  const abs = path.join(ASSETS, r.dest);
  if (!fs.existsSync(abs)) continue;
  const bytes = fs.statSync(abs).size;
  const prev = m[r.url];
  m[r.url] = {
    url: r.url, path: r.dest.replace(/\\/g, '/'), file: abs, bytes, status: 'ok',
    source: 'wayback-recheck', served: r.recoveredAs && /^\d{14}$/.test(r.recoveredAs) ? r.recoveredAs : null,
    from: 'recheck-misses',
  };
  if (prev && prev.status !== 'ok') upgraded++; else added++;
}
// mark the ones CDX proved were never archived
let confirmedGone = 0;
for (const r of rep.trulyUnarchived) {
  if (m[r.url] && m[r.url].status !== 'ok') { m[r.url].confirmedUnarchived = true; confirmedGone++; }
}
fs.writeFileSync(MANIFEST, JSON.stringify(m, null, 2));
console.log(`recheck recoveries folded in: ${added} new, ${upgraded} upgraded`);
console.log(`CDX-confirmed never-archived: ${confirmedGone}`);
console.log(`still unclassified (CDX unavailable during recheck): ${rep.cdxUnavailable.length}`);
console.log(`manifest ok entries now: ${Object.values(m).filter((e) => e.status === 'ok').length}`);
