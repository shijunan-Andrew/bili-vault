// Append the per-category ranking provenance to _ref/json/SOURCES.md.
const fs = require('fs');
const rep = JSON.parse(fs.readFileSync('_ref/json/catalogy/SOURCES.json', 'utf8'));
const L = [];
L.push('');
L.push('---');
L.push('');
L.push('## Category ranking payloads — `_ref/json/catalogy/`');
L.push('');
L.push('Each of the 10 category blocks builds its right-rail ranking pane from');
L.push('`/index/catalogy/<tid>-3day.json` (the 三日 tab, which is the default — `_ref/page.core.pretty.js:290-316`).');
L.push('These are separate endpoints from the site-wide `ranking-3day.json`; without them all ten rails');
L.push('render the same site-wide list.');
L.push('');
L.push('**The list lives at `hot.list`, not `recommend`.** The payload shape is');
L.push('`{ hot: {code,pages,num,list}, hot_original: {code,pages,num,list} }`. Items carry the same keys as');
L.push('`ranking-3day.json.recommend`, so the same renderer applies.');
L.push('');
L.push('| file | request URL | served | delta | items |');
L.push('|---|---|---|---|---|');
const order = [1, 3, 4, 5, 11, 13, 23, 36, 119, 129];
const byTid = {};
for (const k of Object.keys(rep)) byTid[rep[k].tid] = rep[k];
for (const t of order) {
  const e = byTid[t];
  if (!e) continue;
  L.push(`| \`${e.file}\` | \`${e.url}\` | ${e.served} | ${e.deltaDays > 0 ? '+' : ''}${e.deltaDays}d | ${e.hotListLength} |`);
}
L.push('');
L.push('`13-bangumi-3day.json` is the outlier at −148d and additionally has **no** `hot_original` key and');
L.push('only 8 items instead of 10. The `-week` tab (一周) could not be filled for tids 3,4,5,11,23,36,129:');
L.push('the CDX index shows no capture of those endpoints in any year 2010–2018.');
L.push('');
L.push('Fetcher: `_ref/json/_tools/fetch-catalogy.js`. Availability index: `_ref/json/_tools/cdx-catalogy.json`.');
L.push('Per-file SHA-1 and shape: `_ref/json/catalogy/SOURCES.json`.');
L.push('');
fs.appendFileSync('_ref/json/SOURCES.md', L.join('\n'), 'utf8');
console.log('appended', L.length, 'lines to _ref/json/SOURCES.md');
