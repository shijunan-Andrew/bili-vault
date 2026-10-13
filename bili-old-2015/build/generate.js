// build/generate.js — turn the archived 2015 bilibili homepage data into the static DOM.
// Outputs a JSON payload of HTML fragments consumed by tools/build.js.
// Run: node build/generate.js
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const J = path.join(ROOT, '_ref', 'json');
const OUT = path.join(ROOT, 'build', 'fragments.json');

// ---------------------------------------------------------------- helpers
const read = (f) => JSON.parse(fs.readFileSync(path.join(J, f), 'utf8').replace(/^\uFEFF/, ''));
// the archived payloads come in three shapes: bare arrays, `{results,list:[...]}` wrappers,
// and `{"0":{…},"1":{…}}` maps (ding.json) — normalise all of them to an array.
function listOf(v) {
  if (v == null) return [];
  if (Array.isArray(v)) return v;
  if (typeof v === 'object' && v.list !== undefined && !Array.isArray(v.list) && typeof v.list === 'object') {
    const keys = Object.keys(v.list).filter((k) => /^\d+$/.test(k));
    if (keys.length) return keys.map((k) => v.list[k]);
  }
  if (typeof v === 'object') {
    const keys = Object.keys(v).filter((k) => /^\d+$/.test(k));
    if (keys.length) return keys.map((k) => v[k]);
  }
  return Array.isArray(v.list) ? v.list : [];
}
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const strip = (s) => String(s == null ? '' : s).replace(/"/g, '').replace(/\s+/g, ' ').trim();
// formatFriendlyNumber (base.core.v3.pretty.js:4013) — 12000 -> "1.2万"
function friendly(n) {
  n = Number(n) || 0;
  if (n >= 100000000) return (n / 100000000).toFixed(1).replace(/\.0$/, '') + '亿';
  if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, '') + '万';
  return String(n);
}
// bindPOCoins2 (base.core.v3.pretty.js:5634) — the title attribute the site put on video items
function tip(v) {
  const parts = [];
  if (v.subtitle) parts.push('字幕: ' + v.subtitle);
  if (v.lm || v.typename) parts.push('分类: ' + (v.lm || v.typename));
  if (v.tg || v.create) parts.push('投稿时间: ' + (v.tg || v.create));
  if (v.txt || v.description) parts.push('简介: ' + strip(v.txt || v.description).slice(0, 120));
  return esc(parts.join('&#10;'));
}
const attrs = (v) => `gk="${esc(v.play)}" sc="${esc(v.favorites)}" pl="${esc(v.review)}" dm="${esc(v.video_review)}" up="${esc(v.author)}" subtitle="${esc(strip(v.subtitle))}" lm="${esc(v.lm || v.typename)}" tg="${esc(v.tg || v.create)}" txt="${esc(strip(v.txt || v.description).slice(0, 120))}" yb="${esc(v.coins)}"`;
const av = (aid) => `/video/av${esc(aid)}/`;
// thumbnails from 2015 are gone from the CDN *and* were never captured by the archive
// (see spec/asset-report.md) — render the exact same <img> element without a src.
const img = (src, alt, extra) => `<img data-img="${esc(src)}" alt="${esc(alt)}"${extra || ''} />`;

// ---------------------------------------------------------------- data
const slides = listOf(read('slideshow.json'));
const rank3 = listOf(read('ranking-3day.json').recommend) || [];
const promote = listOf(read('promote.json'));
const recommend = listOf(read('recommend.json'));
const bangumi = listOf(read('bangumi.json'));
const ding = read('ding.json');

const RANGE = '2015-07-01'; // imod_box_get3d_date() for this snapshot

// ---------------------------------------------------------------- section 2.1 : topic carousel
function topicPreview() {
  const n = slides.length;
  const lis = slides.map((s) => `\t\t\t<li preview="preview"><a href="${esc(s.link)}" target="_blank"><img data-img="${esc(s.img)}" alt="${esc(s.title)}" /></a></li>`).join('\n');
  const bars = slides.map((s, i) => `\t\t\t\t<li bar="bar"${i === 0 ? ' class="on"' : ''}></li>`).join('\n');
  const titles = slides.map((s, i) => `\t\t\t\t<span${i === 0 ? ' style="display:inline;"' : ''}><a href="${esc(s.link)}">${esc(s.title)}</a></span>`).join('\n');
  return `<div class="topic-preview-wrapper">
\t\t\t<ul class="topic-preview clearfix" style="width: ${n * 100}%;">
${lis}
\t\t\t</ul>
\t\t\t<a class="more-topic" href="/topic/integrated-1.html" target="_blank">更多></a>
\t\t\t<div class="s-bottom">
\t\t\t\t<ul id="topic_slider" class="slider-bar">
${bars}
\t\t\t\t</ul>
\t\t\t\t<div class="title">
${titles}
\t\t\t\t</div>
\t\t\t</div>
\t\t</div>`;
}

// ---------------------------------------------------------------- section 2.2 : renderTopList
function topList() {
  const items = rank3.slice(0, 8).map((v) => `\t\t\t\t<li><div class="v-item" ${attrs(v)} title="${tip(v)}"><a href="${av(v.aid)}" target="_blank" title="${esc(v.title)}"><div class="medal"></div><div class="original"></div><div class="preview">${img(v.pic, v.title)}</div><div class="mask"></div><div class="play-icon"></div><div class="info"><div class="t">${esc(v.title)}</div><p class="up">up主：${esc(v.author)}</p><p class="play">播放：${friendly(v.play)}</p></div></a></div></li>`).join('\n');
  return `\t\t<div class="top-list-wrapper">
\t\t\t<ul class="top-list clearfix">
${items}
\t\t\t</ul>
\t\t\t<div class="page prev no-select" style="display:none">昨日</div>
\t\t\t<div class="page next no-select" style="display:none">一周</div>
\t\t</div>`;
}

// ---------------------------------------------------------------- section 3 : renderPromote
const VIDEO_DIV = (v) => `<div class="v" ${attrs(v)} title="${tip(v)}">`;
function promoteList() {
  const items = promote.slice(0, 5).map((v) => `\t\t\t\t<li>${VIDEO_DIV(v)}<a class="preview" href="${av(v.aid)}?tg" target="_blank" title="${esc(v.title)}"><div class="border"></div>${img(v.pic, v.title)}<div class="x"><b class="x2">${esc(v.duration)}</b></div></a><a href="${av(v.aid)}?tg" target="_blank" title="${esc(v.title)}"><div class="t">${esc(v.title)}</div></a></div></li>`).join('\n');
  return `\t\t<ul class="rm-list">
${items}
\t\t</ul>`;
}
const indexPromote = (items) => `\t\t<div class="index-promote">
${items.map((it) => `\t\t\t<div class="pmt-item"><a href="${esc(it.link || '#')}"><img data-img="${esc(it.image || '')}" alt="" /></a></div>`).join('\n')}
\t\t</div>`;

// ---------------------------------------------------------------- section 4.1 : renderList
function listItem(v) {
  return `<li>${VIDEO_DIV(v)}<a class="preview" href="${av(v.aid)}" target="_blank" title="${esc(v.title)}"><div class="medal"></div><div class="original"></div><div class="border"></div>${img(v.pic, v.title)}<div class="x"><b class="x2">${esc(v.duration)}</b></div></a><a href="${av(v.aid)}" target="_blank" title="${esc(v.title)}"><div class="t">${esc(v.title)}</div><div class="i"><b class="i1">${friendly(v.play)}</b><b class="i2">${friendly(v.video_review)}</b></div></a></div></li>`;
}
function vList(type, howmany) {
  const arr = listOf(ding[type]) || [];
  const items = arr.slice(0, howmany === undefined ? 10 : howmany).map((v) => '\t\t\t\t' + listItem(v)).join('\n');
  return `\t\t<ul class="vidbox v-list">\n${items}\n\t\t</ul>`;
}

// ---------------------------------------------------------------- section 4.2 : renderIndexRanking
function rankingItem(v, i) {
  const cls = [`\t\t\t\t<li`];
  const num = i < 3 ? ` class="number n${i + 1}"` : ' class="number"';
  return `\t\t\t\t<li ${attrs(v)} title="${tip(v)}"><i${num}>${i + 1}</i><div class="preview"><a href="${av(v.aid)}" title="${esc(v.title)} 播放:${esc(v.play)} ${esc(v.duration)}" target="_blank">${img(v.pic, v.title)}</a></div><a href="${av(v.aid)}" title="${esc(v.title)} 播放:${esc(v.play)} ${esc(v.duration)}" target="_blank"><div class="title t">${esc(v.title)}</div><div class="i"><b class="c1">${friendly(v.play)}</b><b class="c2">${friendly(v.video_review)}</b></div></a></li>`;
}
function rlistBlock(v, n, i) {
  const items = rank3.slice(0, n || 6).map((x, k) => rankingItem(x, k)).join('\n');
  return `\t\t\t<ul class="rlist${i ? '' : ' on'}" loaded="true">\n${items}\n\t\t\t</ul>`;
}
const rankingSelect = (tid) => `\t\t<div class="b-slt">
\t\t\t<span class="txt">三日</span>
\t\t\t<div class="b-slt-arrow"></div>
\t\t\t<ul class="list">
\t\t\t\t<li selected="selected" data-source="/index/catalogy/${tid}-3day.json">三日</li>
\t\t\t\t<li data-source="/index/catalogy/${tid}-week.json">一周</li>
\t\t\t</ul>
\t\t</div>`;

// Each category's right rail is a SEPARATE payload in the original page: the selector above points at
// /index/catalogy/<tid>-3day.json (default tab 三日). Filling all ten rails from the site-wide
// ranking-3day.json — which is what this generator used to do — makes every rail show identical
// titles, so each section reads its own file when the archive has one (asset-digger fetches them into
// _ref/json/catalogy/). Where no capture exists the site-wide list is kept and reported, never
// silently swapped for another category's list.
// The payload shape is { "hot": {code,pages,num,list:[…]}, "hot_original": {…} } (asset-digger
// confirmed: there is no `recommend` key in _ref/json/catalogy/*.json), so the rail list is
// payload[type].list. 13-bangumi-3day.json has no `hot_original` at all and only 8 items.
const rankCache = new Map();
const fallbackTids = [];
// local filename per tid, as delivered by asset-digger into _ref/json/catalogy/
const CATALOGY_FILE = {
  1: '1-douga-3day.json', 13: '13-bangumi-3day.json', 3: '3-music-3day.json',
  129: '129-dance-3day.json', 4: '4-game-3day.json', 36: '36-technology-3day.json',
  5: '5-ent-3day.json', 119: '119-kichiku-3day.json', 23: '23-movie-3day.json',
  11: '11-teleplay-3day.json',
};
function rankFor(tid, type) {
  const key = tid + '|' + (type || 'hot');
  if (rankCache.has(key)) return rankCache.get(key);
  let payload = null;
  try { payload = read(`catalogy/${CATALOGY_FILE[tid] || tid + '-3day.json'}`); } catch (e) { payload = null; }
  let out = null;
  if (payload) {
    const bucket = payload[type || 'hot'];
    out = listOf(bucket) || listOf((bucket || {}).list) || listOf(payload.recommend);
  }
  if (!out || !out.length) { out = rank3; if (!fallbackTids.includes(tid)) fallbackTids.push(tid); }
  rankCache.set(key, out);
  return out;
}
const rankingTab = `\t\t<div class="left"><span class="b-head-t"><h3>{H3}排行</h3></span><ul class="b-slt-tab"><li class="on" type="hot">全部</li><li type="hot_original">原创</li></ul></div>`;

// ---------------------------------------------------------------- section 5 : bangumi extras
function bangumiCalendar(day) {
  const days = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  const tab = days.map((d, i) => `\t\t\t\t<li day="${i}"${i === day ? ' class="on"' : ''}><span>${d}</span></li>`).join('\n');
  const items = bangumi.filter((b) => Number(b.weekday) === day).sort((a, b) => (b.video_view || 0) - (a.video_view || 0));
  const lis = items.map((b) => `\t\t\t<li${b.new ? ' class="new"' : ''}><div class="c-item"><a class="preview" href="/sp/${esc(b.title)}" target="_blank" title="${esc(b.title)}">${img(b.cover, b.title)}</a><div class="r-i"><a href="/sp/${esc(b.title)}" target="_blank" title="${esc(b.title)}"><p class="t"><span>${esc(b.title)}</span></p></a><p class="num">更新至<span>${esc(b.bgmcount)}话</span></p></div></div></li>`).join('\n');
  return `\t<div class="b-l bgm-calendar">
\t\t<div class="b-head">
\t\t\t<div class="b-tab">
\t\t\t\t<ul class="clearfix">
${tab}
\t\t\t\t</ul>
\t\t\t</div>
\t\t</div>
\t\t<div class="b-body">
\t\t\t<ul class="c-list clearfix custom-scrollbar">
${lis}
\t\t\t</ul>
\t\t\t<div class="c-bottom clearfix"><div class="more-link right"><a class="gobgm" href="/video/bgm_calendar.html" target="_blank">新番放送表</a></div></div>
\t\t</div>
\t</div>`;
}

// ---------------------------------------------------------------- section 6 : renderRecommend
function recommendList() {
  const items = recommend.slice(0, 6).map((v) => {
    const lr = (v.last_recommend && v.last_recommend[0]) || { uname: '', mid: '', face: '' };
    return `\t\t\t\t<li><div class="rm-item"><a class="face" card="${esc(lr.uname)}" href="http://space.bilibili.com/${esc(lr.mid)}" target="_blank">${img(lr.face, lr.uname)}</a><a class="name" card="${esc(lr.uname)}" href="http://space.bilibili.com/${esc(lr.mid)}" target="_blank">${esc(lr.uname)}</a><span>推荐</span><a class="preview" href="${av(v.aid)}" target="_blank" title="${esc(v.title)}">${img(v.pic, v.title)}<p class="t">${esc(v.title)}</p></a></div></li>`;
  }).join('\n');
  return `\t\t<ul class="rm-list recommend">\n${items}\n\t\t</ul>`;
}
// the two columns of #b_recommend (spec §6); the right column is a renderAds slot whose payload
// was never captured, so .index-promote stays empty (renderAds removes it when zone.enabled=false).
function bRecommend() {
  return `\t<div class="b-l">
\t\t<div class="b-head"><span class="b-head-i"></span><span class="b-head-t"><a href="/list/recommend/1.html" title="特别推荐"><h2>特别推荐</h2></a></span></div>
\t\t<div class="b-body">
${recommendList()}
\t\t</div>
\t</div>
\t<div class="b-r">
\t\t<div class="r-promote multi">
\t\t</div>
\t</div>`;
}

// ---------------------------------------------------------------- section 3.0 : #b_promote shell
// Archived server-rendered markup (_ref/body.html:287-305): the right .b-head carries the live
// online counters. The archived page still shows the server-rendered pair (在线:271992 /
// 正在观看:309274) because the snapshot was taken before online.js refreshed them.
const ONLINE_HEAD = `\t\t<div class="b-head">
\t\t\t<div class="index_online">
\t\t\t\t<span class="web-online">在线:271992</span>
\t\t\t\t<a class="online" href="/online.html" title="正在观看人数代表目前同时在看视频的连接数(同1用户同时开2个视频算2个)">正在观看:309274</a>
\t\t\t\t<a class="new" href="/newlist.html" title="全站最新投稿"></a>
\t\t\t\t<a class="bad" href="/account/badlist.html" title="今日黑名单"></a>
\t\t\t</div>
\t\t</div>`;
const bPromote = `\t<div id="b_promote" class="container-row" area="">
\t<div class="b-l">
\t\t<div class="b-head"><div class="left"><span class="b-head-i"></span><span class="b-head-t"><h2>推广</h2></span></div><a href="http://h.bilibili.com/wallpaper?action=list" target="_blank"><div class="bg-link">壁纸</div></a></div>
\t\t<div class="b-body">
${promoteList()}
\t\t</div>
\t</div>
\t<div class="b-r">
${ONLINE_HEAD}
\t\t<div class="b-body">
\t\t\t<div class="index-promote">
${promoteAdItems()}
\t\t\t</div>
\t\t</div>
\t</div>
\t</div>`;

// ---------------------------------------------------------------- index-nav (IndexNavigator)
const NAV = [
  ['douga', '动画'], ['bangumi', '番剧'], ['music', '音乐'], ['dance', '舞蹈'], ['game', '游戏'],
  ['technology', '科技'], ['ent', '娱乐'], ['kichiku', '鬼畜'], ['movie', '电影'], ['teleplay', 'TV剧'],
];
const indexNav = `\t<div class="index-nav" id="index_nav" style="opacity: 1;">
\t\t<div class="border"></div>
\t\t<div class="pointer-block"></div>
\t\t<div class="nav-list">
${NAV.map(([id, name]) => `\t\t\t<div class="n-i" data-target="#b_${id}"><div class="name">${name}</div></div>`).join('\n')}
\t\t</div>
\t</div>`;

// ---------------------------------------------------------------- category sections
const SECTIONS = [
  { id: 'douga', type: 'douga', name: 'douga', h3: '动画', title: '<div class="left"><span class="b-head-i"></span><span class="b-head-t"><a href="/video/douga.html" title="动画"><h2>动画</h2></a></span></div>', tabInLeft: true, tid: 1, psize: 6 },
  { id: 'bangumi', type: 'bangumi', name: 'bangumi', h3: '番剧', title: '<div class="left"><span class="b-head-i"></span><span class="b-head-t"><a href="/video/bangumi.html" title="番剧"><h2>番剧</h2></a></span></div>', tabInLeft: true, tid: 13, psize: 8, special: 'bangumi' },
  { id: 'music', type: 'music', name: 'music', h3: '音乐', title: '<span class="b-head-i"></span><span class="b-head-t"><a href="/video/music.html" title="音乐"><h2>音乐</h2></a></span>', tid: 3, psize: 6 },
  { id: 'dance', type: 'dance', name: 'dance', h3: '舞蹈', title: '<span class="b-head-i"></span><span class="b-head-t"><a href="/video/dance.html" title="舞蹈"><h2>舞蹈</h2></a></span>', tid: 129, psize: 6 },
  { id: 'game', type: 'game', name: 'game', h3: '游戏', title: '<span class="b-head-i"></span><span class="b-head-t"><a href="/video/game.html" title="游戏"><h2>游戏</h2></a></span>', tid: 4, psize: 6 },
  { id: 'technology', type: 'technology', name: 'technology', h3: '科技', title: '<span class="b-head-i"></span><span class="b-head-t"><a href="/video/technology.html" title="科学·技术"><h2>科学·技术</h2></a></span>', tid: 36, psize: 6 },
  { id: 'ent', type: 'ent', name: 'ent', h3: '娱乐', title: '<span class="b-head-i"></span><span class="b-head-t"><a href="/video/ent.html" title="娱乐"><h2>娱乐</h2></a></span>', tid: 5, psize: 6 },
  { id: 'kichiku', type: 'kichiku', name: 'kichiku', h3: '鬼畜', title: '<span class="b-head-i"></span><span class="b-head-t"><a href="/video/kichiku.html" title="鬼畜"><h2>鬼畜</h2></a></span>', tid: 119, psize: 6 },
  { id: 'movie', type: 'movie', name: 'movie', h3: '电影', title: '<span class="b-head-i"></span><span class="b-head-t"><a href="/video/movie.html" title="电影"><h2>电影</h2></a></span>', tid: 23, psize: 6 },
  { id: 'teleplay', type: 'teleplay', name: 'teleplay', h3: '电视剧', title: '<span class="b-head-i"></span><span class="b-head-t"><a href="/video/teleplay.html" title="电视剧"><h2>电视剧</h2></a></span>', tid: 11, psize: 6 },
];
const listTab = `\t\t\t<ul class="b-slt-tab"><li class="on" data-source="/index/ding.json" push="">有新动态</li><li data-source="/index/ranking.json">最新投稿</li></ul>`;

function section(s) {
  // ---- left pane
  const head = s.tabInLeft
    ? `\t\t<div class="b-head">${s.title}${listTab}\n\t\t</div>`
    : `\t\t<div class="b-head">${s.title}\n${listTab}\n\t\t</div>`;
  const left = `\t<div class="b-l">
${head}
\t\t<div class="b-body">
${vList(s.type)}
\t\t\t<div class="more-link"><a href="/video/${s.name}.html">查看更多&gt;</a></div>
\t\t</div>
\t</div>`;

  // ---- right pane
  let rightBody, rightHead;
  if (s.special === 'bangumi') {
    rightHead = `\t\t<div class="b-head">\n\t\t<div class="left"><span class="b-head-t"><h3>番剧排行</h3></span></div>\n${rankingSelect(s.tid)}\n\t\t</div>`;
    const items = rankFor(s.tid).slice(0, s.psize).map((v, k) => rankingItem(v, k)).join('\n');
    rightBody = `\t\t<div class="b-body rb">
\t\t\t<ul class="rlist bangumi-ranking" loaded="true">
${items}
\t\t\t</ul>
\t\t\t<div class="more-link"><a href="/list/rank-${s.name}.html#order=hot&page=1&range=${RANGE}" target="_blank">查看更多&gt;</a></div>
\t\t</div>`;
  } else {
    rightHead = `\t\t<div class="b-head">\n\t\t<div class="left"><span class="b-head-t"><h3>${s.h3}排行</h3></span><ul class="b-slt-tab"><li class="on" type="hot">全部</li><li type="hot_original">原创</li></ul></div>\n${rankingSelect(s.tid)}\n\t\t</div>`;
    // the two tabs of this pane are the two arrays inside the same catalogy payload: 全部 = hot,
    // 原创 = hot_original (page.core.js createRanking -> renderSubRanking with pane.type)
    const hot = rankFor(s.tid, 'hot').slice(0, s.psize).map((v, k) => rankingItem(v, k)).join('\n');
    const orig = rankFor(s.tid, 'hot_original').slice(0, s.psize).map((v, k) => rankingItem(v, k)).join('\n');
    rightBody = `\t\t<div class="b-body rb">
\t\t\t<div class="r-list-body vertical">
\t\t\t\t<div class="r-list-wrapper" style="margin-left: 0%;">
\t\t\t\t\t<ul class="rlist on" loaded="true">
${hot}
\t\t\t\t\t</ul>
\t\t\t\t\t<ul class="rlist" loaded="true">
${orig}
\t\t\t\t\t</ul>
\t\t\t\t</div>
\t\t\t</div>
\t\t\t<div class="more-link"><a href="/list/rank-${s.name}.html#order=hot&page=1&range=${RANGE}" target="_blank">查看更多&gt;</a></div>
\t\t</div>`;
  }
  const rpromote = `\t\t<div class="r-promote">\n${promoteAdItems(2)}\n\t\t</div>`;
  const right = `\t<div class="b-r">\n${rightHead}\n${rightBody}\n${rpromote}\n\t</div>`;

  let extra = '';
  if (s.special === 'bangumi') extra = '\n' + bangumiCalendar(3) + '\n' + bangumiPromote();
  return `\t<div id="b_${s.id}" class="container-row" area="">\n${left}\n${right}${extra}\n\t</div>`;
}

function promoteAdItems(n) {
  // /index/promote/<id>.json was never captured for the index page, so the ad slots stay empty
  // (the site's own renderAds removes the container when zone.enabled is false).
  return '';
}
function bangumiPromote() {
  return `\t<div class="b-r bangumi">
\t\t<div class="b-head"><span class="b-head-t">完结动画推荐</span></div>
\t\t<div class="b-body">
\t\t\t<ul class="r-list-pmt"></ul>
\t\t</div>
\t</div>`;
}

// ---------------------------------------------------------------- assemble
const frag = {
  'b_index_top': `<div class="container-top-wrapper">\n\t\t<div class="container-top" id="b_index_top">\n\t\t\t<div class="b-l">\n\t\t${topicPreview()}\n\t\t\t</div>\n\t\t\t<div class="b-r">\n${topList()}\n\t\t\t</div>\n\t\t</div>\n\t</div>`,
  'b_promote': bPromote,
  'b_recommend_row': `\t<div id="b_recommend" class="container-row" area="">
${bRecommend()}
\t</div>`,
  'index_nav': indexNav,
  'sections': SECTIONS.map((s) => section(s)).join('\n'),
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(frag, null, 1), 'utf8');
console.log('wrote build/fragments.json',
  '\n  slides:', slides.length, '\n  ranking:', rank3.length, '\n  promote:', promote.length,
  '\n  recommend:', recommend.length, '\n  bangumi:', bangumi.length, '\n  sections:', SECTIONS.length);
const perTid = SECTIONS.filter((s) => !fallbackTids.includes(s.tid)).map((s) => `${s.tid}=${rankFor(s.tid).length}`);
console.log('  per-category ranking payloads used:', perTid.length ? perTid.join(' ') : 'NONE');
console.log('  categories still on the site-wide ranking list:', fallbackTids.length ? fallbackTids.join(' ') : 'none');
