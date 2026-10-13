# Provenance of `_ref/json/*.json`

> **`served` = nearest wayback capture; delta vs 2015-07-01 is recorded per file; no better capture exists.**
> Wayback returns the closest surviving snapshot to the requested timestamp, not the requested
> timestamp itself. Where the delta is large it is because the CDX index contains *no* capture
> anywhere near July 2015 for that endpoint — the alternatives are this payload or an empty panel.

Every payload below was fetched from the Internet Archive for the **same request timestamp**
`20150701082208` (the capture time of the archived homepage this project rebuilds).

Two independent checks were run against each file:

1. **Wayback probe** (`_tools/verify-snapshots.js` -> `_tools/verify-report.json`): re-request the
   endpoint at `20150701082208` and record which snapshot timestamp Wayback actually serves.
   Wayback always serves the *nearest* capture to the requested time, so `served` is by definition
   the closest surviving snapshot for that URL at that capture boundary.
2. **Byte identity** (`_tools/strip-bom.js` -> `_tools/bom-report.json`): the downloaded files each
   carried a 3-byte UTF-8 BOM that the HTTP response did not have. After stripping it, every local
   file hashes to the exact SHA-1 of the Wayback response body.

## Result

| File | Requested endpoint | Snapshot served | Delta from 2015-07-01 | === Wayback bytes |
| --- | --- | --- | --- | --- |
| `slideshow.json` | `http://www.bilibili.com/index/slideshow.json` | 2015-07-11 10:56:18 UTC | +10d 2h | yes |
| `ranking.json` | `http://www.bilibili.com/index/ranking.json` | 2016-01-21 10:22:17 UTC | +204d 2h | yes |
| `ranking-3day.json` | `http://www.bilibili.com/index/ranking-3day.json` | 2015-07-11 10:56:18 UTC | +10d 2h | yes |
| `ranking-week.json` | `http://www.bilibili.com/index/ranking-week.json` | 2014-07-15 05:51:52 UTC | -351d 2h | yes |
| `promote.json` | `http://www.bilibili.com/index/promote.json` | 2015-07-02 16:20:39 UTC | +1d 7h | yes |
| `promote-12.json` | `http://www.bilibili.com/index/promote/12.json` | 2015-08-22 19:26:09 UTC | +52d 11h | yes |
| `recommend.json` | `http://www.bilibili.com/index/recommend.json` | 2016-01-04 04:22:56 UTC | +186d 20h | yes |
| `bangumi.json` | `http://www.bilibili.com/index/bangumi.json` | 2015-02-03 12:54:58 UTC | -147d 19h | yes |
| `ding.json` | `http://www.bilibili.com/index/ding.json` | 2015-07-11 10:56:17 UTC | +10d 2h | yes |
| `ding-count.json` | `http://www.bilibili.com/index/ding-count.json` | 2015-06-23 00:56:44 UTC | -8d 7h | yes |


All ten files parse as valid JSON and are byte-identical to the archive response. **The BOM, not the
payload, was the only local mutation** (9 files were exactly 3 bytes larger; `promote-12.json`, the one
file that arrived without a BOM, was already identical).

## What the deltas mean

The delta column is a property of the Internet Archive, **not** of this project. Wayback can only serve
a capture that exists; where the delta is large, no nearer capture exists to be had.

| File | Why the delta is what it is |
| --- | --- |
| `slideshow.json` | many 2015 captures (2015-06-08, 2015-07-11, ...) |
| `ranking.json` | ONLY 2016-01-21 across all of 2014-2016 |
| `ranking-3day.json` | 38 captures 2014-07-15 .. 2016-11-23 |
| `ranking-week.json` | ONLY 2014-07-15 across all of 2014-2016 |
| `promote.json` | 2015-06-01, 2015-07-02, ... |
| `promote-12.json` | 2015 captures exist; 2015-08-22 is the nearest to 2015-07-01 |
| `recommend.json` | ZERO captures in 2015 |
| `bangumi.json` | ONLY 2015-02-03 in 2015; only capture in 2014-2016 window |
| `ding.json` | 2015-07-11 and others |
| `ding-count.json` | 2015-06-23 and others |

### Files that are genuinely close to 2015-07-01

`slideshow.json`, `ranking-3day.json`, `ding.json` (+10d), `ding-count.json` (-8d) and
`promote.json` (+1d) are all within about a week either side. `ranking-3day.json` matters most: it is
the **default tab of the homepage top-list** (`page.index.v3.js` sets `dataSource:"/index/ranking-3day.json"`
and initialises the tab index to `m=1`, i.e. "三日"), so the top-list a visitor sees on first paint is
backed by a payload from 2015-07-11 — ten days after the page capture.

### Files whose data is from the wrong era

These four are the closest surviving capture, but the content is anachronistic:

| File | Served | Era | Consequence |
| --- | --- | --- | --- |
| `ranking-week.json` | 2014-07-15 | 1 year before | "一周" tab of the top-list shows July 2014 content |
| `bangumi.json` | 2015-02-03 | 5 months before | bangumi calendar shows the Feb 2015 season |
| `recommend.json` | 2016-01-04 | 6 months after | 特别推荐 block shows Jan 2016 recommendations |
| `ranking.json` | 2016-01-21 | 7 months after | "昨日" tab of the top-list shows Jan 2016 content |

These are unavoidable: CDX shows `recommend.json` has **zero** captures in the whole of 2015, and
`ranking.json` / `ranking-week.json` have exactly **one** capture each across 2014-2016.

## Gap: the homepage also needs `/index/catalogy/*.json`, which we do not have

`page.index.v3.js` declares twelve blocks (`top, promote, douga(tid 1), bangumi(13), music(3), dance(129),
game(4), technology(36), ent(5), kichiku(119), movie(23), teleplay(11), recommend`). The per-category
ranking pane of each block is built by `CreateArea.createRankingSelect(tid)`
(`_ref/page.core.pretty.js:290-316`), which is driven by a selector:

- `/index/catalogy/<tid>-3day.json`  — "三日", the **default** selection
- `/index/catalogy/<tid>-week.json`  — "一周"
- `/index/catalogy/<tid>-month.json` — "一月" (only for tids 145/146/147/82/83/85)

So a faithful homepage requests 10 `-3day` JSON files (one per visible category). CDX shows these
`-3day` captures exist for tids **3, 4, 5, 11, 23, 36, 119, 129** around 2015-07-11 … 2015-07-15, and do
**not** exist for tid **1 (douga)** or tid **13 (bangumi)**. The `-week` variants are largely uncaptured.

`page.core.pretty.js:33` also polls `/index/ding-count.json` every 5 s and `page.core.pretty.js:262-268`
maps the list tabs to `/index/ding.json` (有新动态) and `/index/ranking.json` (最新投稿).

## Reproduce

```
node _ref/json/_tools/fetch-json2.js        # download all ten endpoints at 20150701082208
node _ref/json/_tools/verify-snapshots.js   # probe which snapshot each endpoint serves
node _ref/json/_tools/strip-bom.js          # strip BOM + prove byte identity
node _ref/json/_tools/sources.js            # regenerate this file
```

Generated 2026-10-13T13:55:06.361Z.

---

## Category ranking payloads — `_ref/json/catalogy/`

Each of the 10 category blocks builds its right-rail ranking pane from
`/index/catalogy/<tid>-3day.json` (the 三日 tab, which is the default — `_ref/page.core.pretty.js:290-316`).
These are separate endpoints from the site-wide `ranking-3day.json`; without them all ten rails
render the same site-wide list.

**The list lives at `hot.list`, not `recommend`.** The payload shape is
`{ hot: {code,pages,num,list}, hot_original: {code,pages,num,list} }`. Items carry the same keys as
`ranking-3day.json.recommend`, so the same renderer applies.

| file | request URL | served | delta | items |
|---|---|---|---|---|
| `1-douga-3day.json` | `http://www.bilibili.com/index/catalogy/1-3day.json` | 20150822192609 | +52d | 10 |
| `3-music-3day.json` | `http://www.bilibili.com/index/catalogy/3-3day.json` | 20150711070346 | +10d | 10 |
| `4-game-3day.json` | `http://www.bilibili.com/index/catalogy/4-3day.json` | 20150715152200 | +14d | 10 |
| `5-ent-3day.json` | `http://www.bilibili.com/index/catalogy/5-3day.json` | 20150715152200 | +14d | 10 |
| `11-teleplay-3day.json` | `http://www.bilibili.com/index/catalogy/11-3day.json` | 20150715152203 | +14d | 10 |
| `13-bangumi-3day.json` | `http://www.bilibili.com/index/catalogy/13-3day.json` | 20150203125458 | -148d | 8 |
| `23-movie-3day.json` | `http://www.bilibili.com/index/catalogy/23-3day.json` | 20150715152200 | +14d | 10 |
| `36-technology-3day.json` | `http://www.bilibili.com/index/catalogy/36-3day.json` | 20150715152200 | +14d | 10 |
| `119-kichiku-3day.json` | `http://www.bilibili.com/index/catalogy/119-3day.json` | 20150715152201 | +14d | 10 |
| `129-dance-3day.json` | `http://www.bilibili.com/index/catalogy/129-3day.json` | 20150712043825 | +11d | 10 |

`13-bangumi-3day.json` is the outlier at −148d and additionally has **no** `hot_original` key and
only 8 items instead of 10. The `-week` tab (一周) could not be filled for tids 3,4,5,11,23,36,129:
the CDX index shows no capture of those endpoints in any year 2010–2018.

Fetcher: `_ref/json/_tools/fetch-catalogy.js`. Availability index: `_ref/json/_tools/cdx-catalogy.json`.
Per-file SHA-1 and shape: `_ref/json/catalogy/SOURCES.json`.
