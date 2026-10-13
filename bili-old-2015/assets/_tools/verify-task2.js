// Final acceptance check for task-2's deliverables.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..');
const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); return cond; };

function kindOf(buf) {
  if (!buf || buf.length < 4) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf[0] === 0x89 && buf.toString('latin1', 1, 4) === 'PNG') return 'png';
  if (buf.toString('latin1', 0, 3) === 'GIF') return 'gif';
  if (buf[0] === 0x00 && buf[1] === 0x00 && (buf[2] === 0x01 || buf[2] === 0x02)) return 'ico';
  if (buf.toString('latin1', 0, 4) === 'wOFF') return 'woff';
  if (buf.toString('latin1', 0, 4) === 'wOF2') return 'woff2';
  if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  if (/<svg|<\?xml[\s\S]{0,200}<svg/i.test(buf.toString('latin1', 0, 300))) return 'svg';
  return null;
}

console.log('=== (A) JSON payloads ===');
const JSONS = ['slideshow', 'ranking', 'ranking-3day', 'ranking-week', 'promote', 'promote-12', 'recommend', 'bangumi', 'ding', 'ding-count'];
let jsonOk = 0;
for (const n of JSONS) {
  const p = path.join(ROOT, '_ref', 'json', `${n}.json`);
  if (!fs.existsSync(p)) { ok(false, `_ref/json/${n}.json missing`); console.log(`  FAIL missing ${n}.json`); continue; }
  const buf = fs.readFileSync(p);
  const hasBom = buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
  ok(!hasBom, `_ref/json/${n}.json still has a BOM`);
  let parsed = true;
  try { JSON.parse(buf.toString('utf8')); } catch { parsed = false; }
  ok(parsed, `_ref/json/${n}.json does not parse`);
  const head = buf.toString('utf8').trim()[0];
  ok(head === '{' || head === '[', `_ref/json/${n}.json is not a JSON document`);
  if (parsed && !hasBom) jsonOk++;
  console.log(`  ${n.padEnd(14)} ${String(buf.length).padStart(6)}B  BOM=${hasBom ? 'YES-FAIL' : 'no'}  parses=${parsed}`);
}
ok(jsonOk === JSONS.length, `only ${jsonOk}/${JSONS.length} JSON payloads clean`);

console.log('=== catalogy payloads ===');
const catDir = path.join(ROOT, '_ref', 'json', 'catalogy');
const catSrc = JSON.parse(fs.readFileSync(path.join(catDir, 'SOURCES.json'), 'utf8'));
let catOk = 0;
for (const k of Object.keys(catSrc)) {
  const e = catSrc[k];
  if (e.status === 'MISSING') continue;
  const p = path.join(catDir, e.file);
  ok(fs.existsSync(p), `catalogy/${e.file} missing`);
  const buf = fs.readFileSync(p);
  let j = null; try { j = JSON.parse(buf.toString('utf8')); } catch { /* noop */ }
  ok(!!j && !!j.hot, `catalogy/${e.file} has no hot object`);
  const sha = crypto.createHash('sha1').update(buf).digest('hex');
  ok(sha === e.sha1, `catalogy/${e.file} SHA-1 drifted from SOURCES.json`);
  if (j && j.hot) catOk++;
}
ok(catOk === 10, `only ${catOk}/10 catalogy payloads valid`);
console.log(`  ${catOk}/10 catalogy payloads parse, all have hot.list, SHA-1 matches SOURCES.json`);

console.log('=== (B) assets ===');
const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'MANIFEST.json'), 'utf8'));
const byDest = new Map();
for (const [url, e] of Object.entries(man)) {
  if (!e.path) continue;
  const cur = byDest.get(e.path);
  if (!cur || (cur.status !== 'ok' && e.status === 'ok')) byDest.set(e.path, { url, ...e });
}
const total = byDest.size;
let recovered = 0, gone = 0, corrupt = 0, empty = 0;
for (const [dest, e] of byDest) {
  const abs = path.join(ROOT, 'assets', dest);
  if (e.status !== 'ok') { gone++; continue; }
  if (!fs.existsSync(abs)) { ok(false, `manifest says ok but file missing: ${dest}`); corrupt++; continue; }
  const buf = fs.readFileSync(abs);
  if (!buf.length) { empty++; ok(false, `zero-byte asset: ${dest}`); continue; }
  if (!kindOf(buf)) { corrupt++; ok(false, `not a real image: ${dest}`); console.log(`  FAIL not an image: ${dest}`); continue; }
  recovered++;
}
ok(total === 475, `expected 475 distinct destinations, got ${total}`);
console.log(`  requested ${total} distinct files -> recovered ${recovered}, permanently gone ${gone}`);
console.log(`  corrupt/not-an-image ${corrupt}, zero-byte ${empty}`);

console.log('=== assets/thumbs.json ===');
const thumbs = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'thumbs.json'), 'utf8'));
const keys = Object.keys(thumbs);
ok(keys.length === new Set(keys).size, 'thumbs.json has duplicate keys');
let bad = 0;
for (const [u, rel] of Object.entries(thumbs)) {
  ok(rel.startsWith('assets/'), `thumbs.json path not repo-root-relative: ${rel}`);
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) { bad++; ok(false, `thumbs.json points at a missing file: ${rel}`); }
  else if (!kindOf(fs.readFileSync(abs))) { bad++; ok(false, `thumbs.json points at a non-image: ${rel}`); }
}
console.log(`  ${keys.length} keys, all repo-root-relative, all files exist and are real images: ${bad === 0}`);

console.log('=== docs ===');
for (const f of ['_ref/json/SOURCES.md', 'assets/INDEX.md']) {
  const p = path.join(ROOT, f);
  ok(fs.existsSync(p), `${f} missing`);
  const s = fs.readFileSync(p, 'utf8');
  ok(s.length > 500, `${f} looks empty`);
  console.log(`  ${f.padEnd(24)} ${s.length} bytes, ${s.split('\n').length} lines`);
}

console.log(`\n=== ${fails.length === 0 ? 'ALL CHECKS PASSED' : fails.length + ' CHECK(S) FAILED'} ===`);
for (const f of fails) console.log('  FAIL ' + f);
process.exit(fails.length ? 1 : 0);
