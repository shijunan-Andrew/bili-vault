// tools/verify-md5.js — the archived thumbnails are content-addressed: i*.hdslb.com/<size>/video/<ab>/<md5>.jpg
// means the file name IS the md5 of the bytes. If the bytes still hash to that name, the file is the
// original 2015 upload, not a modern re-encode and not a "video was deleted" placeholder.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ROOT = path.resolve(__dirname, '..');
const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'MANIFEST.json'), 'utf8'));

let checked = 0, match = 0, mismatch = 0, notContentAddressed = 0, gone = 0;
const bad = [];
for (const [url, e] of Object.entries(man)) {
  if (!e || e.status !== 'ok' || !e.file) continue;
  const m = /([0-9a-f]{32})\.(jpe?g|png|gif)$/i.exec(url);
  if (!m) { notContentAddressed++; continue; }
  if (!fs.existsSync(e.file)) { gone++; continue; }
  const h = crypto.createHash('md5').update(fs.readFileSync(e.file)).digest('hex');
  checked++;
  if (h === m[1].toLowerCase()) match++; else { mismatch++; bad.push(url + ' -> ' + h); }
}
console.log('content-addressed files checked:', checked);
console.log('  md5(file) === name in url (original bytes):', match);
console.log('  mismatch:', mismatch);
console.log('  not content-addressed (promote/face/etc):', notContentAddressed, '| file gone:', gone);
if (bad.length) console.log('  examples of mismatch:\n   ' + bad.slice(0, 5).join('\n   '));
