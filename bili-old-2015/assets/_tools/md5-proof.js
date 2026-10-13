// Fidelity proof for content-addressed thumbnails.
// i0/i1/i2.hdslb.com/bfs/archive/<hash>.jpg -- if <hash> is the MD5 of the bytes,
// then a 2019 Wayback capture of that URL yields the same bytes as 2015, because
// the hash in the path can only ever address one file content.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ASSETS = path.resolve(__dirname, '..');
const PIC = path.join(ASSETS, 'pic');
if (!fs.existsSync(PIC)) { console.log('no assets/pic yet'); process.exit(0); }

let n = 0, md5Match = 0, md5Mismatch = [];
for (const name of fs.readdirSync(PIC)) {
  if (!/\.(jpg|jpeg)$/i.test(name)) continue;
  const base = name.replace(/^\w{8}-/, '').replace(/\.(jpg|jpeg)$/i, '');
  if (!/^[0-9a-f]{32}$/i.test(base)) continue;              // only content-addressed names
  n++;
  const buf = fs.readFileSync(path.join(PIC, name));
  const md5 = crypto.createHash('md5').update(buf).digest('hex');
  if (md5 === base.toLowerCase()) md5Match++; else md5Mismatch.push({ file: name, named: base, actual: md5 });
}
console.log('content-addressed thumbnails checked:', n);
console.log('  md5(filename) === md5(bytes)  (proves byte-exact original):', md5Match);
console.log('  mismatches:', md5Mismatch.length);
for (const x of md5Mismatch.slice(0, 15)) console.log('    ', x.file, 'named', x.named, 'actual', x.actual);
fs.writeFileSync(path.join(__dirname, 'md5-proof.json'), JSON.stringify({ checked: n, md5Match, mismatches: md5Mismatch }, null, 2));
