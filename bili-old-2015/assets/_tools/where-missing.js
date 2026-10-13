// For every MISSED asset, report which stylesheet(s) reference it, so the Lead can
// judge whether the gap is visible on the homepage or purely ornamental.
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const REF = path.join(ROOT, '_ref');
const miss = JSON.parse(fs.readFileSync(path.join(__dirname, 'missing.json'), 'utf8')).missing;

const sheets = ['new_z2.css', 'index.css', 'jquery-ui.css'];
const css = {};
for (const s of sheets) {
  const p = path.join(REF, s);
  css[s] = fs.existsSync(p) ? fs.readFileSync(p, 'utf8').toLowerCase() : '';
}

// index.html inline styles too
const inline = fs.existsSync(path.join(ROOT, 'index.html')) ? fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').toLowerCase() : '';

const groups = {};
for (const line of miss) {
  const dest = line.split('  <-  ')[0].trim();
  const url = line.split('  <-  ')[1] || '';
  const leaf = dest.split('/').pop().toLowerCase();
  const where = sheets.filter((s) => css[s].includes(leaf) || css[s].includes(dest.toLowerCase()));
  if (inline.includes(leaf)) where.push('index.html(inline)');
  const key = where.length ? where.join('+') : '(not referenced by any stylesheet)';
  (groups[key] = groups[key] || []).push({ dest, url });
}

for (const [k, v] of Object.entries(groups).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`\n### ${k}  (${v.length})`);
  for (const x of v) console.log('   ', x.dest);
}
