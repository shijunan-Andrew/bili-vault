# Bilibili 2015-07-01 homepage — DOM / data / CSS structure spec

Target archive: `http://web.archive.org/web/20150701082208/http://www.bilibili.com/` (page JS captured 2015-06-13 / CSS 2015-06-26).
Goal: allow a builder to emit **one static HTML file** that reproduces the DOM produced by the archived JS, **without re-reading the JS**.

Sources (read-only, all under `_ref/`):

| file | role |
|---|---|
| `_ref/page.index.v3.js` / `.pretty.js` (+ `.clean`) | `indexBlock` config: per-section `id`/`tid`/`area`/`template`/`panes` (wrapper, dataContainer, dataSource, pagesize, render, tab, selector, sliderParams) |
| `_ref/page.core.js` / `.pretty.js` | `CreateArea` + every `render*` function + `createPromote` + `ModuleManage` |
| `_ref/base.core.v3.js` / `.pretty.js` | `TabModule`/`bindTab`, `SelectModule`/`bindSlt`, `LazyImage`, `SliderController`, `IndexNavigator`, `formatFriendlyNumber`(= `utils.formatNum`), `bindPOCoins2` |
| `_ref/new_z2.css` | **the only stylesheet the index page needs** |
| `_ref/index.css` | legacy homepage stylesheet — **NOT used by this page** (see §9.1) |
| `_ref/jquery-ui.css`, `_ref/jquery.min.js` | jQuery UI (dialogs/login box) — no index-page classes |

Legend: `{{...}}` = placeholder filled from JSON. Line refs `file:NNN–NNN` are `new_z2.css` unless stated.

---

## 0. How the page is assembled (read this first)

### 0.1 Order of sections
`indexBlock` (page.index.v3.pretty.js:36–484) object key order, which is also the DOM order:

1. `top` → `#b_index_top` (no `tid`)
2. `promote` → `#b_promote`
3. `douga` → `#b_douga` (tid 1)
4. `bangumi` → `#b_bangumi` (tid 13)
5. `music` → `#b_music` (tid 3)
6. `dance` → `#b_dance` (tid 129)
7. `game` → `#b_game` (tid 4)
8. `technology` → `#b_technology` (tid 36)
9. `ent` → `#b_ent` (tid 5)
10. `kichiku` → `#b_kichiku` (tid 119)
11. `movie` → `#b_movie` (tid 23)
12. `teleplay` → `#b_teleplay` (tid 11) — *note: its pane keys are mis-named `movieList`/`movieRanking` in the original*
13. `recommend` → `#b_recommend` (`empty:true`)

All are emitted inside `#index_container` unless the page bootstrap passes an extra `container` (see §9.2).
`ModuleManage.load(indexBlock, {nav:…})` is called from the **archived page's inline `<script>`** (it is *not* inside page.index.v3.js) — the builder must not reproduce it.

### 0.2 `CreateArea` shell algorithm (page.core.pretty.js:187–221)
1. `AREA` default (page.core.pretty.js:189):
   ```html
   <div class="container-row"><div class="b-l"><div class="b-head"></div><div class="b-body"></div></div><div class="b-r"><div class="b-head"></div><div class="b-body"></div></div></div>
   ```
2. If `params.area` is given (only `top` gives one), that string is used instead; `id` is put on it.
3. If an element with that `id` already exists in the HTML, **it is reused as-is** (`d = true`), else the id is set on the generated markup.
4. `empty:true` → `area.empty()`.
5. The container gets `attr("area","")` → **every section div ends up with `area=""`**.
6. Append target: `params.container` if present (only `top`: `#index_container`); a missing `container` makes `appendTo($(undefined))` a no-op — so every other section must either already exist in the static HTML or receive a `container` from the bootstrap. Final DOM is identical either way.

### 0.3 Pane normalisation (page.core.pretty.js:343–406)
Per pane: `template` (default = the whole section) → `templateTarget` (append target inside the section) → `wrapper` (default = template) → `body = wrapper.find(bodyClass)` (default `.b-body`; fallback = wrapper) → `head = wrapper.find(".b-head")` → **`head.html(title)`** → `dataContainer` (string → `$(str).appendTo(body)`, object → use as-is, `null` → `body`) → selector → tab → push → `onInitComplete`.
Consequences to copy literally:
* the `title` string **replaces** `.b-head`'s innerHTML (so `.b-head` = title + tabs + read-push);
* panes that give `wrapper:".b-l"` / `".b-r"` write into the section's existing `.b-l` / `.b-r`.

### 0.4 Container / template extras from `createPromote()` (page.core.js, index call = `createPromote()` → `j=0`)
`m[0] = [4,5,6,7,8,9,10,11,13,14,16]`; each entry adds an **extra pane** to an existing section:

| promote json | target element | render | body (append target) | dataContainer | pagesize |
|---|---|---|---|---|---|
| `/index/promote/4.json` | `#b_douga` | `renderAds` | `.b-r` | `<div class="r-promote"></div>` | 2 |
| `/index/promote/5.json` | `#b_bangumi` | `renderEndedBangumiPromote` | `.b-r.bangumi` (wrapper) | `<ul class="r-list-pmt"></ul>` | 6 |
| `/index/promote/6.json` | `#b_music` | `renderAds` | `.b-r` | `<div class="r-promote"></div>` | 2 |
| `/index/promote/7.json` | `#b_game` | `renderAds` | `.b-r` | `<div class="r-promote"></div>` | 2 |
| `/index/promote/8.json` | `#b_technology` | `renderAds` | `.b-r` | `<div class="r-promote"></div>` | 2 |
| `/index/promote/9.json` | `#b_ent` | `renderAds` | `.b-r` | `<div class="r-promote"></div>` | 2 |
| `/index/promote/10.json` | `#b_dance` | `renderAds` | `.b-r` | `<div class="r-promote"></div>` | 2 |
| `/index/promote/11.json` | `#b_kichiku` | `renderAds` | `.b-r` | `<div class="r-promote"></div>` | 2 |
| `/index/promote/13.json` | `#b_movie` | `renderAds` | `.b-r` | `<div class="r-promote"></div>` | 2 |
| `/index/promote/14.json` | `#b_teleplay` | `renderAds` | `.b-r` | `<div class="r-promote"></div>` | 2 |
| `/index/promote/16.json` | `#b_recommend` | `renderAds` | `.b-r` | `<div class="r-promote multi"></div>` | all |

`/index/promote/12.json` is **not** from `createPromote` — it is indexBlock's own `promote.ad` pane → `<div class="index-promote"></div>` inside `#b_promote .b-r .b-body`.
`renderAds`'s `renderComplete` is an empty function → the picList panes get **no** lazy-image wrap and no number formatting.

### 0.5 Temporary nodes that must NOT appear in the static output
* `<div class="b-loading p-loading" loading></div>` — prepended by `parseData`, removed on success.
* `<div class="p-loading"></div>` — slider loading placeholder, removed when `/index/slideshow.json` arrives.
* `.page.prev` / `.page.next` in the top list start hidden (CSS `display:none`), so `style="display:none"` is the faithful inline state after `fadeOut`.
* `.read-push` is built `.hide()` → emit with `style="display:none"`.

### 0.6 Numbers are pre-formatted by JS — the static HTML must contain the formatted text
`formatFriendlyNumber` = `utils.formatNum` (base.core.v3.pretty.js:703–729, exposed at :786):
`undefined`/non-numeric → `--`; value containing `万` → unchanged; `parseInt`; if `>= 10000` → `(n/10000).toFixed(1) + "万"` (e.g. `12345` → `1.2万`, `99999` → `10.0万`), else the plain integer.
Applied by `renderComplete` (page.core.pretty.js:734–736) to **`.v .i .i1`, `.v .i .i2`, `.rlist .i .c1`, `.rlist .i .c2`** only (plus `#dianji`, `.w_info .*`). Everything else (`.v .x .x2` duration, top-list numbers, `.play`) stays raw.

### 0.7 Lazy images (LazyImage, base.core.v3.pretty.js:13109–13375)
`renderComplete` calls `lazyImage.lazy(dataContainer, cb)` for every pane **except** the `createPromote` picList panes. For each `img[data-img]` not yet `loaded`:
1. wrap in `<div class="img-loading">` with inline `background:#f5f5f5 url(http://static.hdslb.com/images/v3images/img_loading.png) center center no-repeat; height:100%` (CSS `.img-loading` 136–139, `.preview img{display:block}` 140–142);
2. on load: `src=data-img`, `data-img=""`, `alt` swap, `loaded="loaded"`, `style="opacity: 1;"`, wrapper unwrapped.
**Builder guidance:** write the plain `<img src="{{pic}}" alt="{{title}}">` (no `.img-loading` wrapper, no `data-img`) — visually identical; the wrapper only exists while loading.

### 0.8 `bindPOCoins2` (base.core.v3.pretty.js:5634–5668)
For each `.v` inside a rendered pane: `yb` (= `coins`) `>=200 && <300` → add class **`m200`**; `>=300` → **`m300`**. That is what shows the rank medal (`.v.m200 .medal` 877, `.v.m300 .medal` 878). Note: `renderComplete` binds `.v` only — the top-list `.v-item` never gets `m200/m300` on the index page.
`renderHot` (not used on this page) binds `li` elements instead.

### 0.9 Things that do NOT exist in this build (checked)
* **No `video-cover` class, no `lazy-image` class, no `b-icon` in any index render function.** (`b-icon` appears once in base.core for the coin menu; `video-cover`/`lazy-image` appear nowhere.)
* `renderSubRecommend`, `renderHot`, `renderSubRanking`, `renderSubList`, `renderBangumiCalendar`-for-`bgmbox`, `loadRecentBangumi`, `createBanner`, `CreateCalendar` are **channel/sub-page** code — not used by the index page.

---

## 1. Reusable skeletons

### 1.1 Section shell (`container-row`)
```html
<div id="b_douga" class="container-row" area="">
  <div class="b-l">
    <div class="b-head">{{title}}{{tab}}</div>
    <div class="b-body">{{dataContainer}}{{more-link}}</div>
  </div>
  <div class="b-r">
    <div class="b-head">{{ranking title}}{{tab}}</div>
    <div class="b-body rb">{{r-list-body}}{{more-link}}</div>
    <div class="r-promote">{{0–2 pmt-item}}</div>
  </div>
</div>
```
CSS: `.container-row` 4733–4735 (980px / `.widescreen` 1160px), `.container-row .b-l` 5057–5062 (`float:left;width:700px`, widescreen 880px), `#index_container .container-row .b-r` 5065–5066 (`float:right;width:250px;height:425px;min-height:425px;padding:10px 0 0 10px;background:repeatline.png repeat-y;border-radius:0`), `#index_container #b_promote.container-row .b-r` 5067–5068 (`height:215px`), `#index_container #b_recommend.container-row .b-r` 5069 (`height:auto`), `#index_container #b_bangumi.container-row .b-r.bangumi` 5071 (`height:375px`), `.container-row .b-l .b-body` 5060 (`margin-right:-20px`).

### 1.2 `.b-head` and the title fragments
* `.b-head` 4832, `.container-row .b-head` 4833; `.b-body` 4834; `.b-body.rb` 4835 (the class `renderHotBefore` adds to the ranking body).
* `.b-head .b-head-i` 4839–4848, with per-section background positions:
  `#b_promote` 4855, `#b_douga` 4858, `#b_bangumi` 4861, `#b_music` 4864, `#b_dance` 4867, `#b_game` 4870, `#b_technology` 4873, `#b_ent` 4876, `#b_kichiku` 4879, `#b_movie` 4882, `#b_teleplay` 4885, `#b_recommend` 4888 (base rule for `#index_container .b-l .b-head .b-head-i` at 4849).
* `.b-head .b-head-t` 4891–4912 (`h2` 4901, `h3` 4904, `a` 4907), `.b-head .b-head-s` 4913, `.b-head a.b-head-link` 4921.
* `.container-row .b-l .b-head .right` 4922.

### 1.3 Tabs — `CreateArea.createListTab()` / `createRankingTab()` → `TabModule.create`
`TabModule.create` (base.core.v3.pretty.js:11455–11511) emits `<ul class="b-slt-tab">`; `selected` items get `class="on"`; attributes are copied verbatim.
* **List tab** (`createListTab`, page.core.pretty.js:256–274):
  ```html
  <ul class="b-slt-tab"><li class="on" data-source="/index/ding.json" push="">有新动态</li><li data-source="/index/ranking.json">最新投稿</li></ul>
  ```
  (`push=""` is added to the first `li` by `initPush` when the pane has `push:true` — all category list panes have it.)
* **Ranking tab** (`createRankingTab`, page.core.pretty.js:237–255):
  ```html
  <ul class="b-slt-tab"><li class="on" type="hot">全部</li><li type="hot_original">原创</li></ul>
  ```
  Clicking switches `pane.type` → the ranking reads `data.hot.list` / `data.hot_original.list`, and (for `.r-list-wrapper` panes) slides the wrapper by `margin-left:-100%`.
CSS: `.b-slt-tab` 4923–4935 (`#index_container .b-l .b-head .b-slt-tab` 4934).

### 1.4 Selector — `CreateArea.createRankingSelect(tid)` → `SelectModule.create`
```html
<div class="b-slt">
  <span class="txt">三日</span>
  <div class="b-slt-arrow"></div>
  <ul class="list">
    <li selected="selected" data-source="/index/catalogy/{{tid}}-3day.json">三日</li>
    <li data-source="/index/catalogy/{{tid}}-week.json">一周</li>
  </ul>
</div>
```
`txt` is a copy of the selected `li`'s text (`SelectMenu.prototype.init`, base.core.v3.pretty.js:10961–10976). `createRankingSelect(tid, {month:true})` would add a third `一月` item — **not used on the index page** (all index calls pass no options).
CSS: `.b-slt` 4936–5022 (`.b-slt-arrow` 4975, `.txt` 4986, `.list` 4994/5008, `.list li` 5009–5021, `.container-row .b-r .b-slt .list li` 5109).

### 1.5 `查看更多` more-link (`renderReadMore`, page.core.pretty.js:702–717)
```html
<div class="more-link"><a href="{{href}}"{{ target="_blank"}}>查看更多&gt;</a></div>
```
Inserted **after** the pane's dataContainer (or after `.r-list-body` when the dataContainer lives inside one), only once per wrapper, skipped when `readmore:false`. hrefs:

| render | href | target |
|---|---|---|
| `renderList` (category left list) | `/video/{{block name}}.html` (e.g. `/video/douga.html`) | none |
| `renderIndexRanking` (right ranking) | `/list/rank-{{block name}}.html#order=hot&page=1&range={{3d date}}` | `_blank` |
| `renderRecommend`, `renderPromote`, `renderAds`, `renderBangumiCalendar`, `renderEndedBangumiPromote` | — (no more-link) | — |

The `range` value is `imod_box_get3d_date()` = today `YYYY-MM-DD`.
CSS: `.container-row .more-link` 5079–5100, `.container-row .more-link a` 5086–5100, `.container-row .b-r .more-link` 5101, `.container-row .b-r .more-link a` 5104–5107.

### 1.6 no-data / loading / read-push
* Empty UL → `<li class="no-data">没有数据</li>`; empty non-UL → `<div class="no-data">没有数据</div>` (page.core.pretty.js:726–732). CSS 4809–4818.
* `.read-push` (`initPush`, page.core.pretty.js:517): `<div class="read-push" style="display:none"><span class="icon-refresh"></span><span class="info"></span></div>` appended to `.b-head`. CSS 5112–5133.
* `.b-loading` / `.p-loading` do **not** survive (§0.5). CSS `.p-loading` 4575–4601, `.b-loading` 6030–6038.

### 1.7 Ranking slide container (`.r-list-body` / `.r-list-wrapper` / `.rlist`)
For every `.b-r` ranking pane **that has a tab** (all except bangumi), `renderBefore` = `renderHotBefore` (page.core.pretty.js:804–808) rewrites the pane:
```html
<div class="r-list-body vertical">
  <div class="r-list-wrapper" style="margin-left: 0%;">
    <ul class="rlist" loaded="true">{{6 items, type=hot}}</ul>
    <ul class="rlist" loaded="true">{{6 items, type=hot_original}}</ul>
  </div>
</div>
```
* one `<ul class="rlist">` per tab item, appended to `.r-list-wrapper`;
* `.b-body` gets class `rb`;
* `loaded="true"` is set by `renderIndexRanking` **only when the pane has a tab**;
* the active tab's UL is `:eq(index)`; switching sets `margin-left: -100% * index`;
* `.b-r .rlist` has `padding-top:15px; min-height:476px` (932–938) but `#index_container .b-r .rlist{min-height:255px}` (934) and `.bangumi-ranking{min-height:335px}` (935);
* `.r-list-body` 5162, `.r-list-wrapper` 5163–5169 (`width:200%`, children `width:50%;float:left`).

---

## 2. `#b_index_top`

Block config: `area` string (page.index.v3.pretty.js:39), `container:"#index_container"`, one pane `list`.
`area` html:
```html
<div class="container-top-wrapper"><div class="container-top"><div class="b-l"></div><div class="b-r"><div class="top-list-wrapper"></div></div></div></div>
```
`id="b_index_top"` + `area=""` are added by `CreateArea`; CSS uses `#b_index_top .topic-preview-wrapper{height:220px}` (4606) and `#b_index_top .b-l .p-loading` (4586).

### 2.1 Left — topic carousel (`SliderController`, base.core.v3.pretty.js:13376–13800; params `sliderParams` at page.index.v3.pretty.js:98–121)
Final DOM (`.b-l`):
```html
<div class="b-l">
  <div class="topic-preview-wrapper">
    <ul class="topic-preview clearfix" style="width: {{N*100}}%;">
      <li preview="preview"><a href="{{img.link}}" target="_blank"><img src="{{img.img}}"></a></li>
      <!-- one li per entry of /index/slideshow.json .list -->
    </ul>
    <a class="more-topic" href="/topic/integrated-1.html" target="_blank">更多></a>
    <div class="s-bottom">
      <ul id="topic_slider" class="slider-bar">
        <li bar="bar" class="on"></li>
        <li bar="bar"></li>
        <!-- one per slide; first also has class "on" -->
      </ul>
      <div class="title">
        <span style="display:inline;"><a href="{{img.link}}">{{img.title}}</a></span>
        <span><a href="{{img.link}}">{{img.title}}</a></span>
      </div>
    </div>
  </div>
</div>
```
Notes (all literal):
* order inside the wrapper: `<ul class="topic-preview">` is **prepended**, `.more-topic` then `.s-bottom` follow; the bar is appended into `.s-bottom` **before** `.title`.
* inline `width` = `N*100 + 100`-ish: `SliderController.add` sets `container.width((index+1)*100 + "%")` per item → final `N*100%` (N = slide count).
* every slide `li` carries `preview="preview"`; `img/@src` = `data.img`, `a/@href` = `data.link`.
* `.title` gets one `<span><a>` per slide from `renderCallback`; only index 0 is `.show()`n, the rest are hidden by `.topic-preview-wrapper .title span{display:none}` (4725).
* bar `<li>`s get `bar="bar"`; the first also `class="on"` (also forced by `$("[bar]:eq(0)").addClass("on")`).
* `slide()` animates `margin-left: -index*100%` — for the initial state slide 0 → no offset.
CSS: 4601–4729 (`.topic-preview-wrapper` 4605, `.topic-preview` 4609, `li` 4610, `img` 4614, `.slider-bar` 4615–4663, `li` 4641–4663, `.s-bottom` 4697–4722, `.title` 4723–4725, `.more-topic` 4726–4727).

### 2.2 Right — 3-day ranking list (pane `list`, dataContainer `<ul class="top-list clearfix">`, dataSource `/index/ranking-3day.json`, pagesize 8, render `renderTopList`)
```html
<div class="b-r">
  <div class="top-list-wrapper">
    <ul class="top-list clearfix">
      <li><div class="v-item" gk="{{play}}" sc="{{favorites}}" pl="{{review}}" dm="{{video_review}}" up="{{author}}" subtitle="{{subtitle}}" lm="{{typename}}" tg="{{create}}" txt="{{description quotes→''}}" yb="{{coins}}"><a href="/video/av{{aid}}/" target="_blank" title="{{title}}"><div class="medal"></div><div class="original"></div><div class="preview"><img data-img="{{pic}}" alt="{{title}}" /></div><div class="mask"></div><div class="play-icon"></div><div class="info"><div class="t">{{title}}</div><p class="up">up主：{{author}}</p><p class="play">播放：{{play}}</p></div></a></div></li>
      <!-- 8 items -->
    </ul>
    <div class="page prev no-select" style="display:none">昨日</div>
    <div class="page next no-select" style="display:none">一周</div>
  </div>
</div>
```
* `renderTopList` (page.core.pretty.js:850–852) — `g = data.recommend || data`, then `g.list`.
* On hover the `.page` divs fade in; labels come from `onInitComplete`: prev="昨日", next="一周" for the initial dataset `ranking-3day.json` (三日前 = current); the click cycle is `[/index/ranking.json, /index/ranking-3day.json, /index/ranking-week.json]` with labels 昨日/三日/一周.
* `no-select` should be kept (CSS `user-select:none`).
* Element order: UL first, then prev, then next (`appendTo(i.wrapper)`), both after the UL.
CSS: `.container-top-wrapper` 4739, `.container-top` 4741–4763 (980px, widescreen 1160px), `.container-top .b-l{float:left;width:440px}` 4749, `.container-top .b-r{float:right;width:540px}` 4750 (widescreen 720px), `.container-top .top-list-wrapper{position:relative;height:240px;overflow:hidden;margin-left:20px}` 4764, `.prev/.next` 4766–4769, `.top-list` 4772, `li` 4774–4776, `.v-item` 4777–4806, `.prev/.next` 4766–4769, `.no-data` 4809/4819–4823.

---

## 3. `#b_promote`

Panes: `recommedList` (left, pagesize 5, dataSource `/index/promote.json`, render `renderPromote`) and `ad` (right, dataSource `/index/promote/12.json`, render `renderAds`).

```html
<div id="b_promote" class="container-row" area="">
  <div class="b-l">
    <div class="b-head"><div class="left"><span class="b-head-i"></span><span class="b-head-t"><h2>推广</h2></span></div><a href="http://h.bilibili.com/wallpaper?action=list" target="_blank"><div class="bg-link">壁纸</div></a></div>
    <div class="b-body">
      <ul class="rm-list">
        <li><div class="v" gk="{{play}}" sc="{{favorites}}" pl="{{review}}" dm="{{video_review}}" up="{{author}}" subtitle="{{subtitle}}" lm="{{typename}}" tg="{{create}}" txt="{{description quotes→''}}" yb="{{coins}}"><a class="preview" href="/video/av{{aid}}/?tg" target="_blank" title="{{title}}"><div class="border"></div><img data-img="{{pic}}" alt="{{title}}" /><div class="x"><b class="x2">{{duration}}</b></div></a><a href="/video/av{{aid}}/?tg" target="_blank" title="{{title}}"><div class="t">{{title}}</div></a></div></li>
        <!-- 5 items -->
      </ul>
    </div>
  </div>
  <div class="b-r">
    <div class="b-head"></div>
    <div class="b-body">
      <div class="index-promote">
        <div class="pmt-item"><a href="{{link}}" target="_blank"><img src="{{image}}"></a></div>
        <!-- add class "pmt-mid" when item.width != 1 -->
      </div>
    </div>
  </div>
</div>
```
* `renderPromote` (page.core.pretty.js:1056–1067) — data `{list:[…]}`; note the `?tg` suffix on both links and **no `.i` counts block** (only `.t`), and it stops at `pagesize` (5).
* if `item.ads` is truthy, a `<div class="ads">广告</div>` is appended into `.preview` (CSS `.v .ads` 872).
* the title's wallpaper link: archived href is `http://web.archive.org/web/20150613210912/http://h.bilibili.com/wallpaper?action=list`; original is `http://h.bilibili.com/wallpaper?action=list`.
* `renderAds` (page.core.pretty.js:854–873): requires `data.zone.enabled`; if false the whole `.index-promote` is **removed**. `pmt-mid` is added when `item.width != 1`.
CSS: `.index-promote` 5280–5298 (250×150), `.pmt-item` 5282–5296, `.container-row .bg-link` 5400–5401, `.rm-list` 5398–5415.

---

## 4. The ten category sections (identical pattern)

Every section `#b_douga`, `#b_bangumi`, `#b_music`, `#b_dance`, `#b_game`, `#b_technology`, `#b_ent`, `#b_kichiku`, `#b_movie`, `#b_teleplay` uses the **same two panes** (bangumi adds two more, §5): a left `renderList` list and a right `renderIndexRanking` ranking, plus the `createPromote` ad block (§0.4).

### 4.1 Left pane (`renderList`) — literal per-section `title` and targets
```html
<div class="b-l">
  <div class="b-head">{{title}}<ul class="b-slt-tab"><li class="on" data-source="/index/ding.json" push="">有新动态</li><li data-source="/index/ranking.json">最新投稿</li></ul></div>
  <div class="b-body">
    <ul class="vidbox v-list">
      <li><div class="v" gk="{{play}}" sc="{{favorites}}" pl="{{review}}" dm="{{video_review}}" up="{{author}}" subtitle="{{subtitle}}" lm="{{typename}}" tg="{{create}}" txt="{{description quotes→''}}" yb="{{coins}}"><a class="preview" href="/video/av{{aid}}/" target="_blank" title="{{title}}"><div class="medal"></div><div class="original"></div><div class="border"></div><img data-img="{{pic}}" alt="{{title}}"><div class="x"><b class="x2">{{duration}}</b></div></a><a href="/video/av{{aid}}/" target="_blank" title="{{title}}"><div class="t">{{title}}</div><div class="i"><b class="i1">{{play→formatFriendlyNumber}}</b><b class="i2">{{video_review→formatFriendlyNumber}}</b></div></a></div></li>
      <!-- pagesize = 10 items -->
    </ul>
    <div class="more-link"><a href="/video/{{section}}.html">查看更多&gt;</a></div>
  </div>
</div>
```
`renderList` is page.core.pretty.js:738–778 (note `<img …>` has **no** self-closing slash, while `renderTopList`/`renderRanking` do use `/>`).
Data lookup: `data[{{type}}].list` (e.g. `data.douga.list`), fallback `data[{{type}}]`, then `data.list`, then `data` itself.

| section (`id`) | pane key | `type` | literal `title` (goes into `.b-head`) | `tabTarget` |
|---|---|---|---|---|
| `#b_douga` | `dougaList` | `douga` | `<div class="left"><span class="b-head-i"></span><span class="b-head-t"><a href="/video/douga.html" title="动画"><h2>动画</h2></a></span></div>` | `.b-head .left` |
| `#b_bangumi` | `bangumiList` | `bangumi` | `<div class="left"><span class="b-head-i"></span><span class="b-head-t"><a href="/video/bangumi.html" title="番剧"><h2>番剧</h2></a></span></div>` | `.b-head .left` |
| `#b_music` | `musicList` | `music` | `<span class="b-head-i"></span><span class="b-head-t"><a href="/video/music.html" title="音乐"><h2>音乐</h2></a></span>` | `.b-head` |
| `#b_dance` | `danceList` | `dance` | `<span class="b-head-i"></span><span class="b-head-t"><a href="/video/dance.html" title="舞蹈"><h2>舞蹈</h2></a></span>` | `.b-head` |
| `#b_game` | `gameList` | `game` | `<span class="b-head-i"></span><span class="b-head-t"><a href="/video/game.html" title="游戏"><h2>游戏</h2></a></span>` | `.b-head` |
| `#b_technology` | `techList` | `technology` | `<span class="b-head-i"></span><span class="b-head-t"><a href="/video/technology.html" title="科学·技术"><h2>科学·技术</h2></a></span>` | `.b-head` |
| `#b_ent` | `entList` | `ent` | `<span class="b-head-i"></span><span class="b-head-t"><a href="/video/ent.html" title="娱乐"><h2>娱乐</h2></a></span>` | `.b-head` |
| `#b_kichiku` | `kichikuList` | `kichiku` | `<span class="b-head-i"></span><span class="b-head-t"><a href="/video/kichiku.html" title="鬼畜"><h2>鬼畜</h2></a></span>` | `.b-head` |
| `#b_movie` | `movieList` | `movie` | `<span class="b-head-i"></span><span class="b-head-t"><a href="/video/movie.html" title="电影"><h2>电影</h2></a></span>` | `.b-head` |
| `#b_teleplay` | **`movieList`** *(sic)* | `teleplay` | `<span class="b-head-i"></span><span class="b-head-t"><a href="/video/teleplay.html" title="电视剧"><h2>电视剧</h2></a></span>` | `.b-head` |

Also: `pagesize:10`, `tab:CreateArea.createListTab()`, `tabChange:"tabChange"`, `push:true` for all ten.
Difference to copy literally: **douga and bangumi** wrap the title in `<div class="left">…</div>` and append the tab into `.b-head .left`; the other eight append the `<ul class="b-slt-tab">` directly into `.b-head` (after the two spans).
CSS: `.vidbox` 3628–3638, `.container-row .v-list{width:100%;height:335px;overflow:hidden;padding-top:15px}` 5133–5148, `.v` 856–890 (`.preview` 857, `.preview img` 858, `.border` 859–860, `.t` 864, `.i` 866, `.i1/.i2` 868–869, `.x` 870–875, `.ads` 872, `.medal` 877–879, `.original` 881), `.container-row .b-l .b-head .right` 4922, `.more-link` 5079–5100.

### 4.2 Right pane (`renderIndexRanking`)
```html
<div class="b-r">
  <div class="b-head">
    <div class="left"><span class="b-head-t"><h3>{{X}}排行</h3></span><ul class="b-slt-tab"><li class="on" type="hot">全部</li><li type="hot_original">原创</li></ul></div>
    <div class="right"><div class="b-slt"><span class="txt">三日</span><div class="b-slt-arrow"></div><ul class="list"><li selected="selected" data-source="/index/catalogy/{{tid}}-3day.json">三日</li><li data-source="/index/catalogy/{{tid}}-week.json">一周</li></ul></div></div>
  </div>
  <div class="b-body rb">
    <div class="r-list-body vertical">
      <div class="r-list-wrapper" style="margin-left: 0%;">
        <ul class="rlist" loaded="true">
          <li gk="{{play}}" sc="{{favorites}}" pl="{{review}}" dm="{{video_review}}" up="{{author}}" subtitle="{{subtitle}}" lm="{{typename}}" tg="{{create}}" txt="{{description}}"><i class="number">1</i><div class="preview"><a href="/video/av{{aid}}/" title="{{title}} 播放:{{play}} {{duration}}" target="_blank"><img data-img="{{pic}}" alt="{{title}}" /></a></div><a href="/video/av{{aid}}/" title="{{title}} 播放:{{play}} {{duration}}" target="_blank"><div class="title t">{{title}}</div><div class="i"><b class="c1">{{play→friendly}}</b><b class="c2">{{video_review→friendly}}</b></div></a></li>
          <!-- pagesize = 6 items; item 1 additionally gets class "on", items 1–3 get .number class n1/n2/n3; the other items get class "off" -->
        </ul>
        <ul class="rlist"></ul>   <!-- the 原创 tab; filled only after a click, empty on load -->
      </div>
    </div>
    <div class="more-link"><a href="/list/rank-{{section}}.html#order=hot&page=1&range={{YYYY-MM-DD}}" target="_blank">查看更多&gt;</a></div>
    <div class="r-promote">
      <div class="pmt-item"><a href="{{link}}" target="_blank"><img src="{{image}}"></a></div>
      <!-- 2 items; each gets class "pmt-mid" when item.width != 1 -->
    </div>
  </div>
</div>
```
`renderRanking` item HTML is page.core.pretty.js:832–850; `renderIndexRanking`'s callback (page.core.pretty.js:848) adds `on` to index 0, `off` to the rest, and `n1`/`n2`/`n3` to the first three `.number` elements. `<li>` attributes: `yb` plus the 9 gk/sc/pl/dm/up/subtitle/lm/tg/txt. Note the `title` attribute format `"{{title}} 播放:{{play}} {{duration}}"` (space-separated).
Data lookup: `data[{{pane.type}}].list` where `pane.type` is `hot` / `hot_original` from the active tab (or the pane's own `type`).
`loaded="true"` is set only for panes with a tab (all but bangumi).

| section | pane key | `h3` text | dataContainer template | pagesize | tab? | selector tid | `selectorTarget` |
|---|---|---|---|---|---|---|---|
| `#b_douga` | `dougaRanking` | 动画排行 | `<div class="r-list-body vertical"><div class="r-list-wrapper"></div></div>` | 6 | yes | `createRankingSelect(1)` | `.b-head .right` |
| `#b_bangumi` | `bangumiRanking` | 番剧排行 | `<ul class="rlist bangumi-ranking"></ul>` | 8 | **no** | `createRankingSelect(13)` | `.b-head .right` |
| `#b_music` | `musicRanking` | 音乐排行 | `r-list-body vertical > r-list-wrapper` | 6 | yes | `createRankingSelect(3)` | `.b-head .right` |
| `#b_dance` | `danceRanking` | 舞蹈排行 | `r-list-body vertical > r-list-wrapper` | 6 | yes | `createRankingSelect(129)` | `.b-head .right` |
| `#b_game` | `gameRanking` | 游戏排行 | `r-list-body vertical > r-list-wrapper` | 6 | yes | `createRankingSelect(4)` | `.b-head .right` |
| `#b_technology` | `techRanking` | 科技排行 | `r-list-body vertical > r-list-wrapper` | 6 | yes | `createRankingSelect(36)` | `.b-head .right` |
| `#b_ent` | `entRanking` | 娱乐排行 | `r-list-body vertical > r-list-wrapper` | 6 | yes | `createRankingSelect(5)` | `.b-head .right` |
| `#b_kichiku` | `kichikuRanking` | 鬼畜排行 | `r-list-body vertical > r-list-wrapper` | 6 | yes | `createRankingSelect(119)` | `.b-head .right` |
| `#b_movie` | `movieRanking` | 电影排行 | `r-list-body vertical > r-list-wrapper` | 6 | yes | `createRankingSelect(23)` | `.b-head .right` |
| `#b_teleplay` | **`movieRanking`** *(sic)* | 电视剧排行 | `r-list-body vertical > r-list-wrapper` | 6 | yes | `createRankingSelect(11)` | `.b-head .right` |

All ten ranking `title` strings have the shape `<div class="left"><span class="b-head-t"><h3>{{X}}排行</h3></span></div><div class="right"></div>` (no `.b-head-i`), `render:"renderIndexRanking"`, `tabChange:"tabChange"`, `selectChange:"selectChange"`.
**Bangumi exception:** its ranking dataContainer is the UL itself, it has `type:"hot"` and no tab → no `renderHotBefore`, no `.r-list-wrapper`, no `loaded="true"`; the `.more-link` is inserted directly after the `<ul class="rlist bangumi-ranking">`; the first item still gets `on` + `n1`.
CSS: `.rlist` 932–964 (`#index_container .b-r .rlist` 934–935, `li` 939–955, `.number` 941–942, `.on/.off` 944–947, `.i b.c1/.c2` 957–958), `.r-list-body` 5162, `.r-list-wrapper` 5163–5169, `.container-row .b-r .more-link` 5101–5107, `.r-promote` 5298–5312.

---

## 5. `#b_bangumi` extras (calendar + 完结动画推荐)

Final child order inside the section (panes run in config order, and the two `template` panes are appended to the section):
```html
<div id="b_bangumi" class="container-row" area="">
  <div class="b-l">…§4.1 (番剧 list)…</div>
  <div class="b-r">…§4.2 (番剧排行, `<ul class="rlist bangumi-ranking">`)…</div>
  <div class="b-l bgm-calendar">…§5.1…</div>
  <div class="b-r bangumi">…§5.2…</div>
</div>
```
`.container-row .b-l.bgm-calendar{clear:both;padding-bottom:0}` (5312–5316) forces the calendar onto a new row; `#index_container #b_bangumi.container-row .b-r.bangumi{min-height:375px;height:375px}` (5071).

### 5.1 `bangumiCalendar` pane
Config: `template:'<div class="b-l bgm-calendar"><div class="b-head"></div><div class="b-body"></div></div>'`, `dataContainer:'<ul class="c-list clearfix"></ul>'`, `dataSource:"/index/bangumi.json"`, `render:"renderBangumiCalendar"`, `tab:'<div class="b-tab"><ul class="clearfix"><li day="0"><span>星期日</span></li><li day="1"><span>星期一</span></li><li day="2"><span>星期二</span></li><li day="3"><span>星期三</span></li><li day="4"><span>星期四</span></li><li day="5"><span>星期五</span></li><li day="6"><span>星期六</span></li></ul></div>'`, `tabTarget:".b-head"`, `onInitComplete` adds `class="on"` to the `li` whose index = `new Date().getDay()`.
```html
<div class="b-l bgm-calendar">
  <div class="b-head">
    <div class="b-tab">
      <ul class="clearfix on">   <!-- "on" comes from TabModule.Tabs when no li.on exists yet -->
        <li day="0"><span>星期日</span></li>
        <li day="1"><span>星期一</span></li>
        <li day="2"><span>星期二</span></li>
        <li day="3"><span>星期三</span></li>
        <li day="4"><span>星期四</span></li>
        <li day="5"><span>星期五</span></li>
        <li day="6" class="on"><span>星期六</span></li>   <!-- today; class added by onInitComplete -->
      </ul>
    </div>
  </div>
  <div class="b-body">
    <ul class="c-list clearfix custom-scrollbar" style="opacity: 1;">
      <li class="new"><div class="c-item"><a class="preview" href="/sp/{{title}}" target="_blank" title="{{title}}"><img data-img="{{cover}}" alt="{{title}}" /></a><div class="r-i"><a href="/sp/{{title}}" target="_blank" title="{{title}}"><p class="t"><span>{{title}}</span></p></a><p class="num">更新至<span>{{bgmcount}}话</span></p></div></div></li>
      <!-- class="new" only when item["new"] is truthy -->
    </ul>
    <div class="c-bottom clearfix"><div class="more-link right"><a class="gobgm" href="/video/bgm_calendar.html" target="_blank">新番放送表</a></div></div>
  </div>
</div>
```
`renderBangumiCalendar` is page.core.pretty.js:976–1038. Data `/index/bangumi.json` is an **array** (`i.list||i`) of `{weekday, title, cover, bgmcount, new, video_view}`; items are grouped by `weekday` (0–6), each group sorted by `video_view` desc, and only the selected day is rendered. The UL always ends up with `custom-scrollbar`; the `c-bottom` div is (re)inserted after it.
CSS: `.bgm-calendar` 5312–5396 (`.b-tab` 5316–5321, `.c-list` 5323–5324, `.custom-scrollbar` 5325–5367, `li` 5369–5387, `.c-item` 5371–5386, `.c-bottom` 5390–5396).

### 5.2 `bangumiPromote` pane (`div.b-r.bangumi`) — filled by `createPromote` id 5
Config: `template:'<div class="b-r bangumi"><div class="b-head"></div><div class="b-body"></div></div>'` (the pane itself has no render); the createPromote pane adds `wrapper:".b-r.bangumi"`, `title:'<span class="b-head-t">完结动画推荐</span>'`, `dataContainer:'<ul class="r-list-pmt"></ul>'`, `pagesize:6`, `render:"renderEndedBangumiPromote"`, `dataSource:"/index/promote/5.json"`.
```html
<div class="b-r bangumi">
  <div class="b-head"><span class="b-head-t">完结动画推荐</span></div>
  <div class="b-body">
    <ul class="r-list-pmt">
      <li class="ipt"><div class="r-item"><a href="/sp/{{title}}" target="_blank" title="{{title}}"><div class="preview"><img data-img="{{index_cover|image}}" alt="{{title}}" />{{num}}</div><p class="t"><span>{{title}}</span></p></a><p class="play">总播放：{{video_view→friendly}}</p></div></li>
      <!-- items 0 and 1 use the li.ipt form above (i.e. o < 2) -->
      <li><div class="r-item"><a class="preview" href="/sp/{{title}}" target="_blank" title="{{title}}"><img data-img="{{item.image}}" alt="{{title}}" /></a><div class="r-i"><a href="/sp/{{title}}" target="_blank" title="{{title}}"><p class="t"><span>{{title}}</span></p></a>{{num}}</div></div></li>
      <!-- items 2..5 use this compact form -->
    </ul>
  </div>
</div>
```
`renderEndedBangumiPromote` is page.core.pretty.js:946–975; **no `zone.enabled` check** (it renders whenever `item` exists), stops at `pagesize` (6). `{{num}}` by `item.type`:
* `sp` → img src `index_cover`, `<p class="num">全{{episode_count}}话</p>`
* `topic` → img src `image`, `<p class="num">话题</p>`
* `video` → img src `image`, `{{num}}` = `` (empty)
For `o >= 2` the `img` always uses `item.image` (not `index_cover`), but `{{num}}` is still produced by the same switch.
CSS: `.container-row .r-list-pmt` 5169–5197, `#index_container .container-row .r-list-pmt{margin-right:0}` 5176.

---

## 6. `#b_recommend` (特别推荐)

`empty:true`; single pane `recommedList` with `template:'<div class="b-l"><div class="b-head"></div><div class="b-body"></div></div><div class="b-r"></div>'`, `dataContainer:'<ul class="rm-list recommend"></ul>'`, `dataSource:"/index/recommend.json"`, `render:"renderRecommend"`, `pagesize:5` (⚠ `renderRecommend` ignores `pagesize` — it iterates **all** entries).
```html
<div id="b_recommend" class="container-row" area="">
  <div class="b-l">
    <div class="b-head"><span class="b-head-i"></span><span class="b-head-t"><a href="/list/recommend/1.html" title="特别推荐"><h2>特别推荐</h2></a></span></div>
    <div class="b-body">
      <ul class="rm-list recommend">
        <li><div class="rm-item"><a class="face" card="{{last_recommend[0].uname}}" href="http://space.bilibili.com/{{last_recommend[0].mid}}" target="_blank"><img data-img="{{last_recommend[0].face}}"></a><a class="name" card="{{last_recommend[0].uname}}" href="http://space.bilibili.com/{{last_recommend[0].mid}}" target="_blank">{{last_recommend[0].uname}}</a><span>推荐</span><a class="preview" href="/video/av{{aid}}/" target="_blank" title="{{title}}"><img data-img="{{pic}}" alt="{{title}}" /><p class="t">{{title}}</p></a></div></li>
      </ul>
    </div>
  </div>
  <div class="b-r">
    <div class="r-promote multi">
      <div class="pmt-item"><a href="{{link}}" target="_blank"><img src="{{image}}"></a></div>
    </div>
  </div>
</div>
```
`renderRecommend` is page.core.pretty.js:1040–1055; data shape `{list:{"0":{aid,title,pic,last_recommend:[{uname,mid,face}]}, …}}` (iterated with `for in`, entries that are not objects are skipped). The archived JS rewrites the space URL as `http://web.archive.org/web/20150630082746/http://space.bilibili.com/{{mid}}` — the original site href is `http://space.bilibili.com/{{mid}}` (use either; the archive form keeps the link meaningful).
No `.more-link` for this pane (see §1.5). CSS: `.container-row .rm-list` 5398–5415 (`.recommend` 5402–5403, `li` 5403, `.rm-item` 5404–5415), `.r-promote.multi .pmt-item{margin-top:15px}` 5299–5300, `#index_container #b_recommend.container-row .b-r` 5069.

---

## 7. JSON data contract (endpoint → shape → field → placeholder)

Reference video object (all `renderList`/`renderTopList`/`renderRanking` fields):

```json
{"aid":"2541000","title":"【自制】某某视频标题","pic":"http://i0.hdslb.com/group1/M00/xx.jpg","play":123456,"video_review":2345,"favorites":678,"review":12,"author":"某UP主","subtitle":"字幕组","typename":"动画","create":"2015-06-30 12:00","description":"简介文本","coins":250,"duration":"24:03"}
```

| endpoint | expected JSON | consumed by | field → placeholder |
|---|---|---|---|
| `/index/slideshow.json` | `{"list":[{"img":"…","link":"/topic/xxx.html","title":"话题标题"}]}` | `SliderController` (base.core.v3.pretty.js:13467–13530) | `img`→`<li><a><img src>`, `link`→`a/@href`, `title`→`.title span a` |
| `/index/ranking.json`, `/index/ranking-3day.json`, `/index/ranking-week.json` | top pane: `{"recommend":{"list":[video,…]}}` **or** `{"list":[…]} `(`g = data.recommend \|\| data; g.list`); the list panes' *最新投稿* tab reads the same URL as `data[type].list` | `renderTopList`, `renderList` | see §2.2 / §4.1 |
| `/index/ding.json`, `/index/ding/{tid}.json` | `{"douga":{"list":[video,…]},"music":{…},…}` (lookup `data[type].list`, fallback `data[type]`, `data.list`, `data`) | `renderList` | §4.1 |
| `/index/promote.json` | `{"list":[video,…]}` | `renderPromote` | §3 |
| `/index/promote/12.json` | `{"zone":{"enabled":true},"item":[{"link":"…","image":"…","width":1}]}` | `renderAds` | `link`→`a/@href`, `image`→`img/@src`, `width!=1`→`class+=" pmt-mid"`; `zone.enabled=false`→ dataContainer removed |
| `/index/promote/4,6,7,8,9,10,11,13,14,16.json` | same as 12.json | `renderAds` | §0.4 |
| `/index/promote/5.json` | `{"item":[{"type":"sp","title":"番剧名","image":"…","index_cover":"…","episode_count":12,"video_view":123456,"spid":123}]}` (`type` ∈ `sp`/`topic`/`video`) | `renderEndedBangumiPromote` | §5.2 |
| `/index/catalogy/{tid}-3day.json`, `…-week.json` | `{"hot":{"list":[video,…]},"hot_original":{"list":[video,…]}}` | `renderIndexRanking` | §4.2 (active tab decides `hot` / `hot_original`) |
| `/index/bangumi.json` | `[{"weekday":6,"title":"番剧名","cover":"…","bgmcount":12,"new":true,"video_view":123456}]` (array, not an object) | `renderBangumiCalendar` | §5.1 (`weekday` groups, `video_view` sorts desc, `new` → `li.new`) |
| `/index/recommend.json` | `{"list":[{"aid":"…","title":"…","pic":"…","last_recommend":[{"uname":"用户名","mid":12345,"face":"…"}]}]}` | `renderRecommend` | §6 |
| `/index/ding-count.json` | `{"1":12,"3":4,…}` (tid → count) | `initPush` only | `.read-push .info` text |

Two behaviours the JSON cannot express and the builder must bake in:
* `formatFriendlyNumber` on `.i1/.i2` (categories) and `.c1/.c2` (rankings) — see §0.6. Top list, `.play`, `总播放：`, `.x2` duration keep raw values.
* `m200`/`m300` from `yb` (coins) on `.v` elements — see §0.8.
* the ranking `range=` query string is `imod_box_get3d_date()` → for this snapshot use `2015-07-01`.

---

## 8. CSS map (which stylesheet styles what)

**Required stylesheet: `_ref/new_z2.css` only.** Line ranges below are `new_z2.css` (≈6 253 lines).

| component / class | lines |
|---|---|
| `.clearfix` | 133–134 |
| `.b-btn` (订阅 button, unused on index) | 43–91 |
| `.img-loading`, `.preview img` | 136–142 |
| small interface bits / mini windows | 180–400 |
| top bar: `.i_menu` | 205–232 |
| top bar: `.z_top_container`, `.z_top`, `.z_header`, `.z_top_nav` | 232–273 |
| top bar: `.uns_box` (login/register/post box) | 274–400 |
| global header `.header`, `.header .num li.m-i` | 689–780 |
| `.v` video card (`.preview`, `.border`, `.t`, `.i`, `.i1`, `.i2`, `.x`, `.x2`, `.ads`, `.medal`, `.original`) | 856–890 |
| `.rlist` right ranking (`li`, `.number`, `.n1-.n3`, `.on/.off`, `.preview`, `.t`, `.i b.c1/.c2`, `.x`) | 932–964 |
| `.bgmtts`, `.bgmr`, `.bgmmbox` (not index) | 964–980 |
| `.searchlist .b-slt-tab` etc. | 1190–1191 |
| `.footer` (+`.footer-cnt`, `.boston-postcards`, `.partner`, `.partner-banner`, `.wx-ewm`) | 3077–3094 |
| `.vidbox`, `.vidbox .v` | 3628–3638 |
| `.bgm-calendar.bgmbox` (calendar sub-page) | 3688–3693 |
| `.index-nav` side nav (`.custom-bg` 4455, `.pointer-block` 4474, `.border` 4483, `.tip` 4494, `.nav-list` 4509, `.n-i` 4513–4520, `.n-i.gotop` 4521–4535/4556–4563, `.n-i.customize` 4536, `.n-i .name` 4541–4555, `.n-i.on` 4549/4553) | 4442–4565 |
| `.p-loading` (incl. `#b_index_top .b-l .p-loading` 4586) | 4575–4601 |
| `.topic-preview-wrapper` carousel (`.topic-preview`, `.slider-bar`, `.s-bottom`, `.title`, `.more-topic`) | 4601–4729 |
| `.container-row` / `.widescreen .container-row` | 4733–4735 |
| `.container-top-wrapper`, `.container-top`, `.container-top .b-l/.b-r`, `.container-top-sub` | 4739–4763 |
| `.container-top .top-list-wrapper`, `.prev`, `.next` | 4764–4773 |
| `.container-top .top-list li`, `.v-item`, `.mask`, `.play-icon`, `.info`, `.medal`, `.original` | 4774–4806 |
| `.container-row .container-row`, `.container-row .no-data`, `.topic-preview-wrapper .no-data` | 4808–4826 |
| `.container-row.cnt-m`, `.container-row .container-row:first-child` | 4826–4830 |
| `.b-head`, `.container-row .b-head`, `.b-body`, `.b-body.rb` | 4832–4838 |
| `.b-head .b-head-i` (+ per-section backgrounds `#b_promote`…`#b_recommend` 4855–4890) | 4839–4890 |
| `.b-head .b-head-t` (`h2` 4901, `h3` 4904, `a` 4907), `.b-head-s`, `a.b-head-link` | 4891–4922 |
| `.container-row .b-l .b-head .right` | 4922 |
| `.b-slt-tab` (+ `#index_container .b-l .b-head .b-slt-tab` 4934) | 4923–4935 |
| `.b-slt` selector (`.b-slt-arrow` 4975, `.txt` 4986, `.list` 4994/5008, `.list li` 5009–5021) | 4936–5022 |
| `.cld-new` (新番放送表 page, not index) | 5026–5054 |
| `.container-row .b-m-s`, `.container-row .b-l`, `.b-l .b-body`, `.b-l .sort` | 5057–5062 |
| `.container-row .b-r` + `#index_container` overrides | 5065–5071 |
| `.container-row .b-r .b-head-t`, `.rank-more` | 5071–5078 |
| `.container-row .more-link` (a 5086, hover 5098, `.b-r` variants 5101–5107) | 5079–5107 |
| `.container-row .b-r .b-slt .list li` | 5109–5112 |
| `.b-head .read-push` (`.icon-refresh` 5117, `.info` 5126) | 5112–5133 |
| `.container-row .v-list` (+ `.sub`, `.long`, `li`) | 5133–5148 |
| `.container-row .r-list`, `.r-list li .r-item` (channel 热门, not index) | 5150–5161 |
| `.r-list-body`, `.r-list-wrapper` | 5162–5169 |
| `.container-row .r-list-pmt` (+ `.ipt` 5169–5197) | 5169–5197 |
| `.b-list` (not index) | 5199–5215 |
| `.b-recommend` (本区推荐, channel pages only) | 5216–5279 |
| `.index-promote` (+ `.pmt-item`) | 5280–5298 |
| `.r-promote` (`.pmt-item`, `.pmt-mid`, `.multi`, `.kichiku`) | 5298–5312 |
| `.bgm-calendar` (`.b-tab` 5316–5321, `.c-list` 5323, `.custom-scrollbar` 5325–5367, `li` 5369–5387, `.c-item` 5371–5386, `.c-bottom` 5390–5396) | 5312–5396 |
| `.container-row .rm-list` (+ `.recommend`, `.rm-item`, `a.face`, `a.name`, `p.t`) | 5398–5415 |
| `.b-loading` | 6030–6038 |
| `.recommend-area` (another page) | 6198–6225 |

Not needed but harmless: `_ref/jquery-ui.css` (dialogs), `_ref/index.css` (legacy, §10.1).

---

## 9. Global skeleton (head / nav / footer)

### 9.1 What is known from my read-only inputs
* `#index_container` must exist in the archived HTML — it is the `container` of the `top` block (§0.2). Nothing in the JS creates it.
* <body> width class: base.core.v3.pretty.js:10604–10616 — when the page width is **1160** `$('body').addClass('widescreen')`, otherwise the class is removed. At 1280 px viewport the body gets `class="widescreen"` (980 px layout otherwise). `new IndexNavigator` also reads `$("body").hasClass("widescreen")` (base.core.v3.pretty.js:12122).
* Right-hand floating side nav, built by `IndexNavigator` (base.core.v3.pretty.js:11556–11637 and 11933–12098) and appended to `<body>`:
  ```html
  <div class="index-nav" id="index_nav" style="opacity: 0;">
    <div class="border"></div>
    <div class="pointer-block"></div>
    <div class="nav-list">
      <div class="n-i sortable"><div class="name">动画</div></div>
      <!-- one per nav entry whose id exists in indexBlock; order = the bootstrap's nav config -->
      <div class="n-i gotop"><div class="btn_gotop" title="返回顶部"></div></div>
      <div class="n-i n-i-mlink"><a href="http://app.bilibili.com/?channel=home_recommend" target="_blank"><div class="mlink-dl-msg"></div><div class="n-i-mlink-bg"></div></a></div>
    </div>
  </div>
  ```
  `.index-nav .nav-list` 4509, `.n-i` 4513, `.n-i.sortable` 4518, `.n-i.gotop` 4521 (+`.sub` 4524–4535, `.btn_gotop` 4556–4563), `.n-i.customize` 4536, `.n-i .name` 4541–4553. `.n-i-mlink` / `.mlink-dl-msg` / `.n-i-mlink-bg` have **no rules in new_z2.css** (styled by an in-page/other sheet) — check the raw HTML.
* `addReturnToMobile()` (base.core.v3.pretty.js:15912–15930) only runs on mobile browsers: appends `<div class="goto-mobile"><div class="bg"></div></div>` to `<body>`. **Not part of the desktop rebuild.** No `.goto-mobile` rule exists in new_z2.css.
* Top bar anchors present in new_z2.css: `.z_top_container` 232, `.z_top` 234, `.z_top .z_header` 237, `.z_top .z_top_nav` 240–265, `.uns_box` 274 onwards, `.header` 689 onwards, `.footer` 3077.
* Footer anchors: `.footer` 3077, `.footer .boston-postcards` 3079–3082, `.footer .partner-banner` 3083, `.footer .partner` 3084, `.footer .wx-ewm` 3089–3091, `.footer .footer-cnt` 3092.

### 9.2 What is NOT in my read-only set (must come from the Lead's raw archived HTML)
The literal `<head>`, top bar (`#b_nav`-like markup, search box, login box), and `<div class="footer">` markup, plus the **page's inline bootstrap `<script>`** which contains at least:
```js
ModuleManage.load(indexBlock, { nav: {…}});   // creates all 13 sections
createPromote();                               // j = 0 → the 11 promote panes of §0.4
new IndexNavigator({ container: …, nav: {…}, sortable: true });  // side nav
```
My inputs prove this script exists (page.index.v3.js only defines `indexBlock` and calls `addReturnToMobile()`) but not its exact text/order. Two things to take from it: the **nav config** (which section ids the side nav lists, and their `name`s) and the **call order** (§10.3).
Checklist for the raw HTML: `<link>` to `new_z2.css` (+ `jquery-ui.css`), `<script>` to `jquery.min.js`, `base.core.v3.js`, `page.core.js`, `page.index.v3.js`; the `<title>`; the `.z_top`/`.header` markup; `#index_container`; the `.footer`; the inline bootstrap.

---

## 10. Open points / ambiguities (for the Lead)

1. **`index.css` is legacy.** All 16 selectors are `.suggest-container`, `.slideshow-container`, `.slideshow-slider`, `.slider-wrapper`, `.slider-more`, `.slider-titles` — the pre-v3 homepage. No index-v3 element uses them (`#b_index_top` uses `.topic-preview*` from new_z2.css). Safe to omit; the real page probably still loads it.
2. **Two ways the JS produces the same section shells** — either the archived HTML already contains `<div id="b_douga" class="container-row">…</div>` shells (CreateArea reuses them, `d = true`), or the bootstrap passes `container:"#index_container"` and `CreateArea` creates them from `DEFAULT_PARAMS.AREA`. The final DOM is identical (§1.1), but the builder must not *also* keep a second shell. Decide from the raw HTML (does `#b_douga` exist there?).
3. **`createPromote()` must run after the sections exist**, otherwise `if(0!=l.area.length)` skips every pane and the `.r-promote` / `.r-list-pmt` blocks vanish. If the raw inline script calls it before `ModuleManage.load`, the archived page would have shown no right-column ads — worth a sanity check against a screenshot of the snapshot.
4. **Promote json ids are not tids**: 8→`#b_technology`, 9→`#b_ent`, 10→`#b_dance`, 11→`#b_kichiku` (§0.4). Do not "fix" this mapping.
5. **`range=` in the ranking more-links** comes from `imod_box_get3d_date()` (the render date). For the snapshot date use `2015-07-01` (or omit the query, the link target is a dead archive anyway).
6. **`.title` span visibility** in the carousel: only slide 0 is visible (`renderCallback` `.show()`), the rest rely on `.topic-preview-wrapper .title span{display:none}` (4725). If the builder wants the first title visible, keep the inline `style="display:inline"` on span 0.
7. **`.page.prev/.next` labels** (昨日 / 一周) are only correct for the initial dataset `ranking-3day.json`. The archived JS overwrites them on every click; a static page keeps the initial pair.
8. **`.read-push`** is invisible in the archived DOM (`.hide()`; the 5 s `ding-count.json` poll never fired before capture) — emit it hidden or omit it.
9. **`data-img` vs `src`** for images, and the `.img-loading` wrapper: faithful-to-JS DOM has them, but a static rebuild should write plain `src` (§0.7). Also: real image URLs are wayback-rewritten in the CSS (`/web/20150626233935im_/http://static.hdslb.com/...`); the builder needs the un-rewritten `http://static.hdslb.com/...` forms (asset-digger's job).
10. **`bgm-calendar` `<ul class="clearfix on">`** — that stray `on` class on the `<ul>` is real (TabModule adds `on` to the first child because no `li.on` existed at bind time); harmless, keep or drop.
11. **Empty-state text** is `没有数据`; the ranking ULs of the *other* tab (原创) are empty **without** a `.no-data` child (they are only rendered on click).
12. **JSON payload contents** (actual titles/pics/counts) are out of scope here by design; §7 is the field contract only. `asset-digger` supplies the values.
13. `_ref/base.core.v3.pretty.js` and `_ref/page.core.js.clean` / `page.index.v3.js.clean` were read as supporting evidence for the classes above (the task's listed inputs alone do not contain `TabModule`, `SelectModule`, `SliderController`, `LazyImage`, `formatFriendlyNumber`, `bindPOCoins2`, `IndexNavigator`, or `createPromote`).
