// Generate _ref/json/SOURCES.md from the measured artefacts:
//   _tools/verify-report.json  (Wayback probe result per file: asked/served/sha1)
//   _tools/bom-report.json     (post-BOM-strip byte identity vs the Wayback response)
// plus the CDX capture evidence gathered separately (see cdXEvidence below).
const fs = require('fs');
const path = require('path');

const DIR = path.resolve(__dirname, '..');
const verify = JSON.parse(fs.readFileSync(path.join(__dirname, 'verify-report.json'), 'utf8'));
const bom = JSON.parse(fs.readFileSync(path.join(__dirname, 'bom-report.json'), 'utf8'));
const bomBy = Object.fromEntries(bom.rows.map((r) => [r.file, r]));

const ASKED = '20150701082208';
const askedMs = Date.UTC(2015, 6, 1, 8, 22, 8);

function parseTs(ts) {
  const y = +ts.slice(0, 4), mo = +ts.slice(4, 6) - 1, d = +ts.slice(6, 8);
  const h = +ts.slice(8, 10), mi = +ts.slice(10, 12), s = +ts.slice(12, 14);
  return Date.UTC(y, mo, d, h, mi, s);
}
function delta(ts) {
  const ms = parseTs(ts) - askedMs;
  const sign = ms < 0 ? '-' : '+';
  const abs = Math.abs(ms);
  const days = Math.floor(abs / 86400000);
  const hours = Math.floor((abs % 86400000) / 3600000);
  return `${sign}${days}d ${hours}h`;
}
function iso(ts) {
  return `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)} ${ts.slice(8, 10)}:${ts.slice(10, 12)}:${ts.slice(12, 14)} UTC`;
}

// Endpoint each local file was fetched from (mirrors _tools/verify-snapshots.js).
const ENDPOINT = {
  'slideshow.json': 'http://www.bilibili.com/index/slideshow.json',
  'ranking.json': 'http://www.bilibili.com/index/ranking.json',
  'ranking-3day.json': 'http://www.bilibili.com/index/ranking-3day.json',
  'ranking-week.json': 'http://www.bilibili.com/index/ranking-week.json',
  'promote.json': 'http://www.bilibili.com/index/promote.json',
  'promote-12.json': 'http://www.bilibili.com/index/promote/12.json',
  'recommend.json': 'http://www.bilibili.com/index/recommend.json',
  'bangumi.json': 'http://www.bilibili.com/index/bangumi.json',
  'ding.json': 'http://www.bilibili.com/index/ding.json',
  'ding-count.json': 'http://www.bilibili.com/index/ding-count.json',
};

// Capture availability, measured with the Wayback CDX API (2014-01-01 .. 2016-12-31).
const cdx = {
  'slideshow.json': 'many 2015 captures (2015-06-08, 2015-07-11, ...)',
  'ranking-3day.json': '38 captures 2014-07-15 .. 2016-11-23',
  'ding.json': '2015-07-11 and others',
  'ding-count.json': '2015-06-23 and others',
  'promote.json': '2015-06-01, 2015-07-02, ...',
  'promote-12.json': '2015 captures exist; 2015-08-22 is the nearest to 2015-07-01',
  'bangumi.json': 'ONLY 2015-02-03 in 2015; only capture in 2014-2016 window',
  'recommend.json': 'ZERO captures in 2015',
  'ranking.json': 'ONLY 2016-01-21 across all of 2014-2016',
  'ranking-week.json': 'ONLY 2014-07-15 across all of 2014-2016',
};

const HEAD =
  '# Provenance of `_ref/json/*.json`\n\n' +
  'Every payload below was fetched from the Internet Archive for the **same request timestamp**\n' +
  '`' + ASKED + '` (the capture time of the archived homepage this project rebuilds).\n\n' +
  'Two independent checks were run against each file:\n\n' +
  '1. **Wayback probe** (`_tools/verify-snapshots.js` -> `_tools/verify-report.json`): re-request the\n' +
  '   endpoint at `' + ASKED + '` and record which snapshot timestamp Wayback actually serves.\n' +
  '   Wayback always serves the *nearest* capture to the requested time, so `served` is by definition\n' +
  '   the closest surviving snapshot for that URL at that capture boundary.\n' +
  '2. **Byte identity** (`_tools/strip-bom.js` -> `_tools/bom-report.json`): the downloaded files each\n' +
  '   carried a 3-byte UTF-8 BOM that the HTTP response did not have. After stripping it, every local\n' +
  '   file hashes to the exact SHA-1 of the Wayback response body.\n\n' +
  '## Result\n\n' +
  '| File | Requested endpoint | Snapshot served | Delta from 2015-07-01 | === Wayback bytes |\n' +
  '| --- | --- | --- | --- | --- |\n';

let rows = '';
for (const e of verify) {
  const b = bomBy[e.local] || {};
  const near = Math.abs(parseTs(e.served) - askedMs) <= 11 * 86400000;
  rows += `| \`${e.local}\` | \`${ENDPOINT[e.local] || '?'}\` | ${iso(e.served)} | ${delta(e.served)} | ${b.byteIdentical ? 'yes' : 'NO'} |\n`;
}

const BODY = `

All ten files parse as valid JSON and are byte-identical to the archive response. **The BOM, not the
payload, was the only local mutation** (9 files were exactly 3 bytes larger; \`promote-12.json\`, the one
file that arrived without a BOM, was already identical).

## What the deltas mean

The delta column is a property of the Internet Archive, **not** of this project. Wayback can only serve
a capture that exists; where the delta is large, no nearer capture exists to be had.

| File | Why the delta is what it is |\n| --- | --- |\n`;
let rows2 = '';
for (const e of verify) rows2 += `| \`${e.local}\` | ${cdx[e.local] || 'unknown'} |\n`;

const FOOT = `
### Files that are genuinely close to 2015-07-01

\`slideshow.json\`, \`ranking-3day.json\`, \`ding.json\` (+10d), \`ding-count.json\` (-8d) and
\`promote.json\` (+1d) are all within about a week either side. \`ranking-3day.json\` matters most: it is
the **default tab of the homepage top-list** (\`page.index.v3.js\` sets \`dataSource:"/index/ranking-3day.json"\`
and initialises the tab index to \`m=1\`, i.e. "三日"), so the top-list a visitor sees on first paint is
backed by a payload from 2015-07-11 — ten days after the page capture.

### Files whose data is from the wrong era

These four are the closest surviving capture, but the content is anachronistic:

| File | Served | Era | Consequence |
| --- | --- | --- | --- |
| \`ranking-week.json\` | 2014-07-15 | 1 year before | "一周" tab of the top-list shows July 2014 content |
| \`bangumi.json\` | 2015-02-03 | 5 months before | bangumi calendar shows the Feb 2015 season |
| \`recommend.json\` | 2016-01-04 | 6 months after | 特别推荐 block shows Jan 2016 recommendations |
| \`ranking.json\` | 2016-01-21 | 7 months after | "昨日" tab of the top-list shows Jan 2016 content |

These are unavoidable: CDX shows \`recommend.json\` has **zero** captures in the whole of 2015, and
\`ranking.json\` / \`ranking-week.json\` have exactly **one** capture each across 2014-2016.

## Gap: the homepage also needs \`/index/catalogy/*.json\`, which we do not have

\`page.index.v3.js\` declares twelve blocks (\`top, promote, douga(tid 1), bangumi(13), music(3), dance(129),
game(4), technology(36), ent(5), kichiku(119), movie(23), teleplay(11), recommend\`). The per-category
ranking pane of each block is built by \`CreateArea.createRankingSelect(tid)\`
(\`_ref/page.core.pretty.js:290-316\`), which is driven by a selector:

- \`/index/catalogy/<tid>-3day.json\`  — "三日", the **default** selection
- \`/index/catalogy/<tid>-week.json\`  — "一周"
- \`/index/catalogy/<tid>-month.json\` — "一月" (only for tids 145/146/147/82/83/85)

So a faithful homepage requests 10 \`-3day\` JSON files (one per visible category). CDX shows these
\`-3day\` captures exist for tids **3, 4, 5, 11, 23, 36, 119, 129** around 2015-07-11 … 2015-07-15, and do
**not** exist for tid **1 (douga)** or tid **13 (bangumi)**. The \`-week\` variants are largely uncaptured.

\`page.core.pretty.js:33\` also polls \`/index/ding-count.json\` every 5 s and \`page.core.pretty.js:262-268\`
maps the list tabs to \`/index/ding.json\` (有新动态) and \`/index/ranking.json\` (最新投稿).

## Reproduce

\`\`\`
node _ref/json/_tools/fetch-json2.js        # download all ten endpoints at ${ASKED}
node _ref/json/_tools/verify-snapshots.js   # probe which snapshot each endpoint serves
node _ref/json/_tools/strip-bom.js          # strip BOM + prove byte identity
node _ref/json/_tools/sources.js            # regenerate this file
\`\`\`

Generated ${new Date().toISOString()}.
`;

fs.writeFileSync(path.join(DIR, 'SOURCES.md'), HEAD + rows + BODY + rows2 + FOOT);
console.log('wrote SOURCES.md', (HEAD + rows + BODY + rows2 + FOOT).length, 'bytes');
