// tools/inspect-ranking.js — print the shape of the archived JSON payloads (no giant dumps).
const fs = require('fs');
const path = require('path');
const DIR = path.resolve(__dirname, '..', '_ref', 'json');
for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.json')).sort()) {
  const raw = fs.readFileSync(path.join(DIR, f), 'utf8');
  let j = null;
  try { j = JSON.parse(raw); } catch (e) { console.log(f, 'UNPARSEABLE', e.message.slice(0, 60)); continue; }
  const shape = (v, d = 0) => {
    if (d > 2) return typeof v;
    if (Array.isArray(v)) return `[${v.length}x ${shape(v[0], d + 1)}]`;
    if (v && typeof v === 'object') return `{${Object.keys(v).slice(0, 8).join(',')}${Object.keys(v).length > 8 ? ',…' : ''}}`;
    return typeof v;
  };
  let sample = '';
  const first = Array.isArray(j) ? j[0] : (j.list ? j.list[0] : (j.recommend ? j.recommend[0] : (j.slideshow ? j.slideshow[0] : null)));
  if (first) sample = JSON.stringify(first).slice(0, 220);
  console.log(`\n== ${f}  ${raw.length}B\n   top: ${shape(j)}${Object.keys(j).length <= 8 && !Array.isArray(j) ? ' keys=' + Object.keys(j).join(',') : ''}\n   1st: ${sample}`);
}
