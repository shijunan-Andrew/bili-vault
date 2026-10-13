// Strip UTF-8 BOMs from _ref/json/*.json and prove each file is now byte-identical
// to the Wayback response recorded in _tools/verify-report.json (offline, no refetch).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DIR = path.resolve(__dirname, '..');
const rep = JSON.parse(fs.readFileSync(path.join(__dirname, 'verify-report.json'), 'utf8'));
const sha1 = (b) => crypto.createHash('sha1').update(b).digest('hex');
const rows = [];
for (const e of rep) {
  const p = path.join(DIR, e.local);
  if (!fs.existsSync(p)) { rows.push({ file: e.local, status: 'MISSING' }); continue; }
  const raw = fs.readFileSync(p);
  const bom = raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf;
  const out = bom ? raw.slice(3) : raw;
  if (bom) fs.writeFileSync(p, out);
  let parse = 'ok';
  try { JSON.parse(out.toString('utf8')); } catch (err) { parse = 'PARSE-FAIL ' + err.message.slice(0, 60); }
  const remote = e.probes && e.probes[0] ? e.probes[0] : {};
  rows.push({
    file: e.local,
    bomStripped: bom,
    bytes: out.length,
    remoteBytes: remote.bytes,
    sha1: sha1(out),
    remoteSha1: remote.sha1,
    byteIdentical: sha1(out) === remote.sha1,
    served: e.served,
    json: parse,
  });
}
console.log('file'.padEnd(22), 'BOM', 'bytes'.padStart(7), 'remote'.padStart(7), 'identical', 'served', 'json');
for (const r of rows) {
  if (r.status === 'MISSING') { console.log(r.file.padEnd(22), r.status); continue; }
  console.log(
    r.file.padEnd(22),
    (r.bomStripped ? 'yes' : 'no ').padEnd(3),
    String(r.bytes).padStart(7),
    String(r.remoteBytes).padStart(7),
    (r.byteIdentical ? 'YES' : 'NO ').padEnd(9),
    r.served,
    r.json,
  );
}
const ok = rows.filter((r) => r.byteIdentical).length;
console.log(`\nbyte-identical to Wayback response: ${ok}/${rows.length}`);
writeReport(rows);
function writeReport(rows) {
  fs.writeFileSync(
    path.join(__dirname, 'bom-report.json'),
    JSON.stringify({ checkedAt: new Date().toISOString(), rows, identical: rows.filter((r) => r.byteIdentical).length, total: rows.length }, null, 2),
  );
}
