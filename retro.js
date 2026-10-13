/* ==========================================================================
   retro.js —— 彩蛋页的全部脚本
   只做三件事：
   1. 把页面里重复的版块画出来：「推广」那一排、十个分区板块（板块标题 +
      两个小 tab + 一行视频卡 + 右侧排行栏）、底部「特别推荐」。
      数据全部写死在下面的数组里，一律 createElement + textContent 建节点，
      不用 innerHTML、不用 eval。
   2. 点一下轮播圆点,换一张轮播 —— 页面里唯一被允许改变状态的交互。
   3. 整页点击/回车都跳去现在的 B 站首页。
   --------------------------------------------------------------------------
   为什么跳转用一个 document 级**捕获**监听：
   捕获阶段在目标元素自己的处理器之前跑，所以链接、按钮、封面、空白处——
   点哪儿都拦得住，不需要给每个元素单独挂事件，也不怕页面之后加了新元素。
   为什么用 window.location.href 同标签跳，而不是 window.open 开新标签：
   这是彩蛋，点下去就该「从十年前的页面回到现在」，同标签最符合这个动作；
   而且 window.open 在 chrome-extension:// 页面里更容易被弹窗拦截器吃掉，
   同标签跳转没有这个风险。要改成新标签，只需要把 goToBilibiliNow 里那一行
   换成 chrome.tabs.create —— 但 manifest 里没有 tabs 权限，得先补权限。
   这个文件里出现的唯一一个 http(s) 地址就是下面的跳转目标，别再加别的。
   封面一个都不能是图片：全是自绘的「正在加载中」占位（小电视 + 进度条），
   这是这一版的明确要求。
   ========================================================================== */
(function retroPage(global) {
  "use strict";

  var BILIBILI_HOME = "https://www.bilibili.com";

  var doc = global.document;
  var navigated = false;

  /* ---------------- 跳转 ---------------- */

  // 同标签跳转。加个一次性闩，避免连点两次触发两次导航。
  function goToBilibiliNow() {
    // 自动化测试用的闩：headless 里把 __noNav 置 true，跳转目标就只记进
    // __navLog 不真跳 —— 好让「点哪儿都跳到同一个地址」这条能在同一个
    // 页面实例里连着验十几处。正常运行时不设这两个变量，走下面的原路径。
    var probe = global.__navLog;
    if (global.__noNav === true && probe && typeof probe.push === "function") {
      probe.push(BILIBILI_HOME);
      return;
    }
    if (navigated) return;
    navigated = true;
    try {
      global.location.href = BILIBILI_HOME;
    } catch (_) {
      // 正常情况下走不到这里（chrome-extension:// 页面可以正常跳到 https）。
      // 真跳不动时也不能停在这个页面上什么反应都没有，再试一次赋值即可。
      try { global.location.assign(BILIBILI_HOME); } catch (_) {}
    }
  }

  // 捕获阶段拦下整页的点击：链接、按钮、封面、圆点、文字、空白处，全都算。
  // 顺手 preventDefault —— 页面里的链接 href 都是 "#"，不挡的话点一下先
  // 跳一次页内锚点，浏览器地址栏会闪一下 #。
  doc.addEventListener("click", function (event) {
    event.preventDefault();
    goToBilibiliNow();
  }, true);

  // 键盘：<a> 和 <button> 按 Enter 会自己派发 click（上面那条已经接住了），
  // 但 <button> 的 Space 不会 —— 这里补上，免得键盘用户觉得页面是坏的。
  doc.addEventListener("keydown", function (event) {
    if (event.key !== "Enter" && event.key !== " " && event.key !== "Spacebar") return;
    var target = event.target;
    var tag = target && target.tagName ? String(target.tagName).toLowerCase() : "";
    if (tag !== "a" && tag !== "button") return;
    if (event.key === "Enter") return;   // Enter 交给浏览器派发的 click
    event.preventDefault();
    goToBilibiliNow();
  }, true);

  // 当年那个搜索框是提交到 /search 的。现在整页都归跳转管，
  // 这里只挡住表单的默认提交，免得浏览器把页面重载一遍（地址栏会闪）。
  doc.addEventListener("submit", function (event) {
    event.preventDefault();
    goToBilibiliNow();
  }, true);

  /* ---------------- 建节点的小工具 ---------------- */
  // 一律 createElement + textContent：数据虽然是写死的，但保持这个习惯，
  // 以后有人从别处塞字符串进来也不会变成 XSS。
  //
  // SVG 命名空间不写字面量：页面里本来就有一堆内联 <svg>，直接从它们身上
  // 问命名空间即可 —— 这样这个文件里就只剩下一处 http(s) 字面量(跳转目标)，
  // 「整页只允许一个 http(s) 字面量」那条规矩才真的成立。
  var SVG_NS = (function () {
    var probe = doc.querySelector("svg");
    if (probe && probe.namespaceURI) return probe.namespaceURI;
    return "svg";   // 理论上走不到：页面里必有内联 SVG
  })();

  function el(tag, className, text) {
    var node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function svg(viewBox, className) {
    var node = doc.createElementNS(SVG_NS, "svg");
    node.setAttribute("viewBox", viewBox);
    node.setAttribute("aria-hidden", "true");
    node.setAttribute("focusable", "false");
    if (className) node.setAttribute("class", className);
    return node;
  }

  function path(d, fill, stroke, strokeWidth) {
    var p = doc.createElementNS(SVG_NS, "path");
    p.setAttribute("d", d);
    p.setAttribute("fill", fill || "none");
    if (stroke) {
      p.setAttribute("stroke", stroke);
      p.setAttribute("stroke-width", String(strokeWidth || 2));
      p.setAttribute("stroke-linecap", "round");
      p.setAttribute("stroke-linejoin", "round");
    }
    return p;
  }

  function dot(cx, cy, r, fill) {
    var c = doc.createElementNS(SVG_NS, "circle");
    c.setAttribute("cx", String(cx));
    c.setAttribute("cy", String(cy));
    c.setAttribute("r", String(r));
    c.setAttribute("fill", fill);
    return c;
  }

  function rect(x, y, w, h, attrs) {
    var r = doc.createElementNS(SVG_NS, "rect");
    r.setAttribute("x", String(x));
    r.setAttribute("y", String(y));
    r.setAttribute("width", String(w));
    r.setAttribute("height", String(h));
    if (attrs) {
      Object.keys(attrs).forEach(function (key) { r.setAttribute(key, String(attrs[key])); });
    }
    return r;
  }

  /* ---------------- 自绘素材 ---------------- */

  // 「正在加载中」占位。传入的 viewBox 决定画布大小；下面所有坐标都按
  // 宽 160 / 高 100 的基准画，再按需缩放，所以一张模板能喂给所有尺寸。
  // 结构：灰底 + 白底 + 小电视轮廓 + 眯眼笑脸 + 底部进度条。
  function makeLoadingCover(viewBox, fillColor) {
    var box = svg(viewBox, "loader");
    var fill = fillColor || "#f25d8e";

    box.appendChild(rect(0, 0, 160, 100, { fill: "#e9ebee" }));
    box.appendChild(rect(1, 1, 158, 98, { rx: 4, fill: "#ffffff" }));
    box.appendChild(path("M73 24 80 31h8l7-7", null, "#00a1d6", 3));
    box.appendChild(rect(59, 31, 42, 26, { rx: 5, fill: "none", stroke: "#00a1d6", "stroke-width": 3 }));
    box.appendChild(path("M68 42h9M92 42h9", null, "#00a1d6", 3));
    box.appendChild(dot(74, 51, 2.6, "#00a1d6"));
    box.appendChild(dot(94, 51, 2.6, "#00a1d6"));

    var bar = svg("0 0 40 12", "loader-bar");
    bar.appendChild(rect(1, 2, 38, 8, { rx: 4, fill: "none", stroke: "#c6ccd4", "stroke-width": 2 }));
    var barFill = rect(4, 5, 17, 2, { rx: 1, fill: fill });
    barFill.setAttribute("class", "loader-fill");
    bar.appendChild(barFill);

    var wrap = doc.createElementNS(SVG_NS, "g");
    wrap.setAttribute("transform", "translate(60 68)");
    wrap.appendChild(bar);
    box.appendChild(wrap);

    return box;
  }

  // 视频卡上那两个小图标（当年是背景雪碧图里的播放数 / 弹幕数）
  function makePlayIcon() {
    var box = svg("0 0 11 11", "i-svg");
    box.appendChild(path("M1.6 1.4 9.4 5.5 1.6 9.6z", "currentColor"));
    return box;
  }

  function makeDanmakuIcon() {
    var box = svg("0 0 11 11", "i-svg");
    box.appendChild(rect(0.8, 1.4, 9.4, 7.2, { rx: 2, fill: "none", stroke: "currentColor", "stroke-width": 1.6 }));
    box.appendChild(path("M3.2 10 5.4 8.4h2.2", null, "currentColor", 1.6));
    return box;
  }

  // 板块标题左边那枚图标。当年是一张雪碧图，这里按各分区各自画一个。
  var ICONS = {
    star: function (box) {
      box.appendChild(path("M12 2.6 14.6 9.4 21.4 12 14.6 14.6 12 21.4 9.4 14.6 2.6 12 9.4 9.4z", "currentColor"));
    },
    film: function (box) {
      box.appendChild(rect(2.4, 5.4, 19.2, 15.2, { rx: 3, fill: "none", stroke: "currentColor", "stroke-width": 2.6 }));
      box.appendChild(path("M2.4 9.6h19.2M2.4 16.4h19.2M7.6 5.4v15.2M16.4 5.4v15.2", null, "currentColor", 1.6));
    },
    tv: function (box) {
      box.appendChild(path("M8.4 5.6 12 9.2l3.6-3.6", null, "currentColor", 2.2));
      box.appendChild(rect(3.2, 9.2, 17.6, 11.6, { rx: 2.6, fill: "none", stroke: "currentColor", "stroke-width": 2.6 }));
      box.appendChild(dot(9, 15, 1.6, "currentColor"));
      box.appendChild(dot(15, 15, 1.6, "currentColor"));
    },
    note: function (box) {
      box.appendChild(path("M10 18.2V7.4l9-2v10.4", null, "currentColor", 2.6));
      box.appendChild(dot(7.4, 18.4, 2.6, "currentColor"));
      box.appendChild(dot(16.4, 15.8, 2.6, "currentColor"));
    },
    dance: function (box) {
      box.appendChild(path("M12 3.2a2 2 0 1 0 0 4 2 2 0 0 0 0-4z", "currentColor"));
      box.appendChild(path("M12 7.6 12 14m0 0-4 6m4-6 4 6M6.4 9.6 12 8.6l5.6 1", null, "currentColor", 2.2));
    },
    game: function (box) {
      box.appendChild(path("M3 8.4h18v7.2a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3z", "none", "currentColor", 2.6));
      box.appendChild(path("M8 12v3M6.5 13.5h3M15.6 12.4h.02M17.6 14.6h.02", null, "currentColor", 2.2));
    },
    tech: function (box) {
      box.appendChild(rect(3.4, 4.4, 17.2, 12, { rx: 2.6, fill: "none", stroke: "currentColor", "stroke-width": 2.6 }));
      box.appendChild(path("M8.6 20.2h6.8M12 16.4v3.8", null, "currentColor", 2.2));
    },
    ent: function (box) {
      box.appendChild(path("M12 3.6 14.4 10.6 21 12l-6.6 1.4L12 20.4 9.6 13.4 3 12l6.6-1.4z", "none", "currentColor", 2.2));
      box.appendChild(dot(19.4, 5, 1.5, "currentColor"));
    },
    kichiku: function (box) {
      box.appendChild(path("M12 3.4c3.6 0 6.2 2.9 6.2 6.6 0 2.4-1.2 3.6-1.2 5.6 0 1.6-1.4 2.6-2.4 2.6-1.2 0-1.8-2.4-2.6-2.4s-1.4 2.4-2.6 2.4c-1 0-2.4-1-2.4-2.6 0-2-1.2-3.2-1.2-5.6 0-3.7 2.6-6.6 6.2-6.6z", "none", "currentColor", 2.2));
      box.appendChild(dot(9.6, 10.4, 1.4, "currentColor"));
      box.appendChild(dot(14.4, 10.4, 1.4, "currentColor"));
    },
    movie: function (box) {
      box.appendChild(rect(3.2, 8.6, 17.6, 11.6, { rx: 2.4, fill: "none", stroke: "currentColor", "stroke-width": 2.4 }));
      box.appendChild(path("M4.4 4.2 19.6 8.6M10.6 3.2 14.6 8.6", null, "currentColor", 2.2));
      box.appendChild(dot(12, 14.4, 2.2, "currentColor"));
    },
    teleplay: function (box) {
      box.appendChild(rect(2.6, 6, 18.8, 13, { rx: 2.6, fill: "none", stroke: "currentColor", "stroke-width": 2.4 }));
      box.appendChild(path("M8 3.4 12 6l4-2.6M7.4 19v2M16.6 19v2", null, "currentColor", 2));
      box.appendChild(path("M9.6 10.4 14.6 12.4 9.6 14.4z", "currentColor"));
    },
    refresh: function (box) {
      box.appendChild(path("M20 12a8 8 0 1 1-2.6-5.9", null, "currentColor", 2.2));
      box.appendChild(path("M20.4 4.2v3.6h-3.6", null, "currentColor", 2.2));
    }
  };

  function makeSectionIcon(name) {
    var box = svg("0 0 24 24");
    (ICONS[name] || ICONS.star)(box);
    return box;
  }

  /* ---------------- 内容（全部虚构，量级按 2015 年那个首页来） ---------------- */
  // cover: "loading" 是默认的「正在加载中」；"failed" 与 "empty" 是另外两种状态，
  // 默认那一屏不会用到（用户明确要求默认只出现「正在加载中」）。

  var PROMOTE = [
    { t: "【自制】用 CSS 画一只会动的小电视", dur: "04:12", up: "前端研究所", play: "12.4万", dan: "1863" },
    { t: "【搬运】今年夏天最带感的一首电音", dur: "05:38", up: "夜航船", play: "8.7万", dan: "942" },
    { t: "【MMD】夏日祭的和风舞步", dur: "03:07", up: "海边的猫", play: "5.1万", dan: "1204" },
    { t: "【鬼畜】把这段采访调成了循环播放", dur: "01:48", up: "音MAD小组", play: "23.9万", dan: "6821" },
    { t: "【翻唱】夏の終わり（个人翻唱第一弹）", dur: "04:55", up: "会唱歌的鲸", play: "16.3万", dan: "2540" }
  ];

  var SECTIONS = [
    {
      id: "b_douga", icon: "film", name: "动画", more: "动画区", badge: "3",
      sub: "今天的新投稿 1,284 件",
      vids: [
        { t: "【手书】画了一整个夏天的故事", dur: "05:37", up: "铅笔与纸", play: "7.8万", dan: "1128" },
        { t: "【MAD】把这三年的片段剪成一首歌", dur: "03:22", up: "剪辑小屋", play: "14.2万", dan: "3305" },
        { t: "【原创动画】第 01 话 · 会飞的信箱", dur: "08:14", up: "ひとり制作组", play: "26.7万", dan: "5412" },
        { t: "【AMV】那些年我们追过的夏天", dur: "02:56", up: "海边放映厅", play: "5.4万", dan: "860" }
      ],
      rank: [
        { t: "【原创动画】会飞的信箱 第 01 话", play: "26.7万", dan: "5412" },
        { t: "【MAD】把这三年的片段剪成一首歌", play: "14.2万", dan: "3305" },
        { t: "【手书】画了一整个夏天的故事", play: "7.8万", dan: "1128" },
        { t: "【AMV】那些年我们追过的夏天", play: "5.4万", dan: "860" },
        { t: "【教程】手书从打草稿到成片全流程", play: "4.6万", dan: "712" },
        { t: "【混剪】一分钟看完这一季的新番", play: "3.9万", dan: "602" },
        { t: "【搬运】国外画师的一小时作画过程", play: "3.1万", dan: "455" },
        { t: "【自制】用脚本生成了 100 张分镜", play: "2.2万", dan: "318" }
      ]
    },
    {
      id: "b_bangumi", icon: "tv", name: "番剧", more: "番剧",
      sub: "本季新番 42 部",
      vids: [
        { t: "【新番】第七集 · 主角终于开口了", dur: "24:00", up: "追番小分队", play: "18.2万", dan: "8632" },
        { t: "【新番】第三集 · 这一集的作画有点猛", dur: "24:00", up: "作画考察组", play: "11.7万", dan: "4211" },
        { t: "【新番】第一集 · 开局就是王炸", dur: "23:40", up: "番剧研究所", play: "32.4万", dan: "12058" },
        { t: "【新番】第十一集 · 这一集我不敢看第二遍", dur: "24:00", up: "剧透禁止", play: "9.6万", dan: "3402" }
      ],
      rank: [
        { t: "【新番】第一集 · 开局就是王炸", play: "32.4万", dan: "12058" },
        { t: "【新番】第七集 · 主角终于开口了", play: "18.2万", dan: "8632" },
        { t: "【新番】第三集 · 作画有点猛", play: "11.7万", dan: "4211" },
        { t: "【新番】第十一集 · 不敢看第二遍", play: "9.6万", dan: "3402" },
        { t: "【完结】这部片子我们追了整整两年", play: "8.2万", dan: "2854" },
        { t: "【完结】补番指南 · 三小时看完一季", play: "6.8万", dan: "1930" },
        { t: "【新番】第二集 · 这一集有彩蛋", play: "5.9万", dan: "1742" },
        { t: "【完结】最后三分钟我哭了", play: "5.1万", dan: "1608" }
      ]
    },
    {
      id: "b_music", icon: "note", name: "音乐", more: "音乐", badge: "2",
      sub: "今天的原创曲 216 首",
      vids: [
        { t: "【原创】把夏天的蝉鸣做成了歌", dur: "04:36", up: "蝉鸣计划", play: "21.5万", dan: "4210" },
        { t: "【翻唱】夏の終わり（个人翻唱）", dur: "04:55", up: "会唱歌的鲸", play: "16.3万", dan: "2540" },
        { t: "【钢琴】把这首曲子重新弹了一遍", dur: "03:26", up: "键盘上的猫", play: "12.8万", dan: "1180" },
        { t: "【古风】琵琶与电子乐的奇妙组合", dur: "05:02", up: "半城烟雨", play: "9.4万", dan: "2260" }
      ],
      rank: [
        { t: "【原创】把夏天的蝉鸣做成了歌", play: "21.5万", dan: "4210" },
        { t: "【翻唱】夏の終わり（个人翻唱）", play: "16.3万", dan: "2540" },
        { t: "【钢琴】把这首曲子重新弹了一遍", play: "12.8万", dan: "1180" },
        { t: "【古风】琵琶与电子乐的奇妙组合", play: "9.4万", dan: "2260" },
        { t: "【VOCALOID】用软件做了第一首歌", play: "8.1万", dan: "3304" },
        { t: "【安利】十首适合通宵写作业的歌", play: "6.7万", dan: "1420" },
        { t: "【纯音乐】两小时白噪音·雨声", play: "5.3万", dan: "908" },
        { t: "【翻唱】把这首老歌唱出了新味道", play: "4.2万", dan: "760" }
      ]
    },
    {
      id: "b_dance", icon: "dance", name: "舞蹈", more: "舞蹈",
      sub: "今天的宅舞投稿 88 件",
      vids: [
        { t: "【宅舞】在家也能跳的夏日祭舞步", dur: "02:58", up: "海边的猫", play: "6.3万", dan: "1420" },
        { t: "【翻跳】三个人练了两周的成果", dur: "03:44", up: "练习室小组", play: "4.8万", dan: "960" },
        { t: "【教学】分解动作 · 新手也能学会", dur: "06:12", up: "舞蹈教室", play: "3.6万", dan: "680" },
        { t: "【MMD】换上泳装的舞步（自建模）", dur: "02:30", up: "模型研究所", play: "8.9万", dan: "2040" }
      ],
      rank: [
        { t: "【MMD】换上泳装的舞步（自建模）", play: "8.9万", dan: "2040" },
        { t: "【宅舞】在家也能跳的夏日祭舞步", play: "6.3万", dan: "1420" },
        { t: "【翻跳】三个人练了两周的成果", play: "4.8万", dan: "960" },
        { t: "【教学】分解动作 · 新手也能学会", play: "3.6万", dan: "680" },
        { t: "【街舞】广场上练了一段 Breaking", play: "2.9万", dan: "520" },
        { t: "【宅舞】第一次投稿 · 请多指教", play: "2.2万", dan: "410" },
        { t: "【编舞】自己编了一段简单的舞", play: "1.8万", dan: "330" },
        { t: "【翻跳】一镜到底 · 没剪过", play: "1.4万", dan: "260" }
      ]
    },
    {
      id: "b_game", icon: "game", name: "游戏", more: "游戏", badge: "1",
      sub: "今天的实况投稿 3,120 件",
      vids: [
        { t: "【实况】生存第 100 天，先盖个房子", dur: "15:40", up: "方块研究所", play: "9.6万", dan: "2380" },
        { t: "【攻略】这一关其实有个邪道打法", dur: "07:22", up: "速通小队", play: "12.1万", dan: "1940" },
        { t: "【集锦】今天排位遇到的五位神人", dur: "09:15", up: "每日集锦", play: "7.4万", dan: "3120" },
        { t: "【解说】新手怎么在前期攒资源", dur: "11:08", up: "攻略组", play: "5.8万", dan: "880" }
      ],
      rank: [
        { t: "【攻略】这一关其实有个邪道打法", play: "12.1万", dan: "1940" },
        { t: "【实况】生存第 100 天，先盖个房子", play: "9.6万", dan: "2380" },
        { t: "【集锦】今天排位遇到的五位神人", play: "7.4万", dan: "3120" },
        { t: "【解说】新手怎么在前期攒资源", play: "5.8万", dan: "880" },
        { t: "【剧情】这一段我看了三遍才看懂", play: "4.9万", dan: "1120" },
        { t: "【联机】和朋友玩了六个小时", play: "4.1万", dan: "760" },
        { t: "【评测】这块显卡值不值得换", play: "3.3万", dan: "620" },
        { t: "【模组】自己做了一个小地图插件", play: "2.6万", dan: "480" }
      ]
    },
    {
      id: "b_technology", icon: "tech", name: "科技", more: "科技", badge: "3",
      sub: "今天的科技区投稿 402 件",
      vids: [
        { t: "【教程】十分钟讲清楚排序算法", dur: "10:12", up: "代码夜宵", play: "3.1万", dan: "512" },
        { t: "【评测】这块键盘敲起来真舒服", dur: "08:05", up: "数码阳台", play: "6.4万", dan: "1180" },
        { t: "【自制】用旧零件攒了一台小主机", dur: "12:40", up: "阳台工作室", play: "4.7万", dan: "830" },
        { t: "【纪录片】把家里十年前的老电脑修好", dur: "18:20", up: "修复车间", play: "9.2万", dan: "1620" }
      ],
      rank: [
        { t: "【纪录片】把十年前的老电脑修好", play: "9.2万", dan: "1620" },
        { t: "【评测】这块键盘敲起来真舒服", play: "6.4万", dan: "1180" },
        { t: "【自制】用旧零件攒了一台小主机", play: "4.7万", dan: "830" },
        { t: "【教程】十分钟讲清楚排序算法", play: "3.1万", dan: "512" },
        { t: "【科普】为什么你的网速总是慢一半", play: "2.8万", dan: "470" },
        { t: "【软件】自己写了一个小工具", play: "2.2万", dan: "360" },
        { t: "【开箱】二手市场淘到的好东西", play: "1.9万", dan: "300" },
        { t: "【折腾】给老路由器刷了固件", play: "1.5万", dan: "240" }
      ]
    },
    {
      id: "b_ent", icon: "ent", name: "娱乐", more: "娱乐",
      sub: "今天的娱乐区投稿 1,860 件",
      vids: [
        { t: "【搞笑】这段采访被我们剪坏了", dur: "03:18", up: "快乐剪报", play: "13.5万", dan: "4210" },
        { t: "【综艺】把朋友骗去参加挑战", dur: "09:44", up: "整蛊小队", play: "8.2万", dan: "2160" },
        { t: "【日常】记录一个普通的周末", dur: "06:31", up: "生活记录仪", play: "4.3万", dan: "640" },
        { t: "【爆笑】失误集锦 · 第一弹", dur: "05:20", up: "失误收集者", play: "11.4万", dan: "3820" }
      ],
      rank: [
        { t: "【搞笑】这段采访被我们剪坏了", play: "13.5万", dan: "4210" },
        { t: "【爆笑】失误集锦 · 第一弹", play: "11.4万", dan: "3820" },
        { t: "【综艺】把朋友骗去参加挑战", play: "8.2万", dan: "2160" },
        { t: "【日常】记录一个普通的周末", play: "4.3万", dan: "640" },
        { t: "【街采】夏天你最喜欢做什么", play: "3.6万", dan: "520" },
        { t: "【吐槽】这一集广告也太多了", play: "2.9万", dan: "700" },
        { t: "【翻拍】用手机重拍了那道名场面", play: "2.3万", dan: "410" },
        { t: "【整活】把家里改造成小型电影院", play: "1.8万", dan: "280" }
      ]
    },
    {
      id: "b_kichiku", icon: "kichiku", name: "鬼畜", more: "鬼畜", badge: "2",
      sub: "今天的鬼畜投稿 96 件",
      vids: [
        { t: "【鬼畜】这段采访我能循环一天", dur: "01:52", up: "音MAD小组", play: "31.5万", dan: "9120" },
        { t: "【调教】把台词接成了一首歌", dur: "03:05", up: "音节工厂", play: "18.6万", dan: "5410" },
        { t: "【全明星】把所有素材缝在了一起", dur: "04:20", up: "缝合车间", play: "12.3万", dan: "3204" },
        { t: "【人力】一个人配完了整段对话", dur: "02:41", up: "十六分音符", play: "9.8万", dan: "2410" }
      ],
      rank: [
        { t: "【鬼畜】这段采访我能循环一天", play: "31.5万", dan: "9120" },
        { t: "【调教】把台词接成了一首歌", play: "18.6万", dan: "5410" },
        { t: "【全明星】把所有素材缝在了一起", play: "12.3万", dan: "3204" },
        { t: "【人力】一个人配完了整段对话", play: "9.8万", dan: "2410" },
        { t: "【音MAD】素材库第 12 期", play: "7.6万", dan: "1860" },
        { t: "【节奏】这段鼓点真的踩在心上了", play: "6.1万", dan: "1420" },
        { t: "【重制】把三年前的旧作重做了一遍", play: "4.8万", dan: "1120" },
        { t: "【合辑】夏日鬼畜精选", play: "3.5万", dan: "860" }
      ]
    },
    {
      id: "b_movie", icon: "movie", name: "电影", more: "电影",
      sub: "今天的影视投稿 620 件",
      vids: [
        { t: "【解说】十分钟看完这部老片子", dur: "10:05", up: "放映室小张", play: "8.6万", dan: "1420" },
        { t: "【混剪】把所有雨天镜头剪在一起", dur: "04:44", up: "雨夜剪辑", play: "6.2万", dan: "1180" },
        { t: "【拉片】这个长镜头到底怎么拍的", dur: "14:30", up: "镜头语言", play: "5.4万", dan: "960" },
        { t: "【盘点】五部适合夏夜看的电影", dur: "08:18", up: "片单小组", play: "4.1万", dan: "620" }
      ],
      rank: [
        { t: "【解说】十分钟看完这部老片子", play: "8.6万", dan: "1420" },
        { t: "【混剪】把所有雨天镜头剪在一起", play: "6.2万", dan: "1180" },
        { t: "【拉片】这个长镜头到底怎么拍的", play: "5.4万", dan: "960" },
        { t: "【盘点】五部适合夏夜看的电影", play: "4.1万", dan: "620" },
        { t: "【花絮】删掉的那三分钟讲了什么", play: "3.4万", dan: "520" },
        { t: "【影评】为什么这个结局让人难受", play: "2.8万", dan: "440" },
        { t: "【对比】翻拍版和原版差在哪", play: "2.2万", dan: "380" },
        { t: "【推荐】冷门但好看的三部片子", play: "1.7万", dan: "260" }
      ]
    },
    {
      id: "b_teleplay", icon: "teleplay", name: "电视剧", more: "电视剧", badge: "1",
      sub: "今天的剧集投稿 340 件",
      vids: [
        { t: "【追剧】这一集的信息量有点大", dur: "09:38", up: "追剧日常", play: "7.2万", dan: "1620" },
        { t: "【盘点】那些年被砍掉的好剧", dur: "11:26", up: "剧集档案馆", play: "5.6万", dan: "1080" },
        { t: "【解说】前三分钟就把坑埋好了", dur: "12:04", up: "剧情拆解", play: "4.8万", dan: "820" },
        { t: "【合集】把经典台词剪在了一起", dur: "06:48", up: "台词收藏家", play: "3.9万", dan: "700" }
      ],
      rank: [
        { t: "【追剧】这一集的信息量有点大", play: "7.2万", dan: "1620" },
        { t: "【盘点】那些年被砍掉的好剧", play: "5.6万", dan: "1080" },
        { t: "【解说】前三分钟就把坑埋好了", play: "4.8万", dan: "820" },
        { t: "【合集】把经典台词剪在了一起", play: "3.9万", dan: "700" },
        { t: "【吐槽】这一集的造型有点离谱", play: "3.2万", dan: "580" },
        { t: "【安利】这部老剧现在看依然好看", play: "2.6万", dan: "420" },
        { t: "【对比】原著和剧版差了多少", play: "2.1万", dan: "340" },
        { t: "【回顾】第一季的伏笔全在这", play: "1.6万", dan: "260" }
      ]
    }
  ];

  var RECOMMEND = [
    { id: "b_index_top", t: "【头版】今天最值得看的一条投稿", dur: "06:12", up: "头版编辑", play: "28.4万", dan: "5230" },
    { t: "【实验】把十个浏览器标签同时打开会怎样", dur: "05:44", up: "折腾实验室", play: "9.1万", dan: "1360" },
    { t: "【手作】用纸板做了一个小电视", dur: "07:30", up: "纸板工坊", play: "6.8万", dan: "1020" },
    { t: "【摄影】夏天傍晚的十分钟", dur: "04:20", up: "背包与相机", play: "5.2万", dan: "860" },
    { t: "【料理】一个人也要好好吃饭", dur: "06:31", up: "厨房小分队", play: "3.7万", dan: "540" },
    { t: "【翻唱】把这首老歌重新编了曲", dur: "04:08", up: "会唱歌的鲸", play: "2.9万", dan: "420" }
  ];

  /* ---------------- 造卡片 ---------------- */

  var COVER_TINT = ["#f25d8e", "#00a1d6", "#f25d8e", "#00a1d6", "#f25d8e", "#00a1d6"];

  function makeVideoCard(entry, index, coverSize) {
    var li = el("li");

    var v = el("div", "v");

    var preview = el("a", "preview");
    preview.setAttribute("href", "#");
    preview.setAttribute("tabindex", "0");
    preview.setAttribute("aria-label", String(entry.t || ""));

    var state = entry.cover || "loading";
    if (state === "failed") {
      // 「加载失败」：深一档的底 + 一个感叹号
      var failBox = svg(coverSize || "0 0 160 100", "loader");
      failBox.appendChild(rect(0, 0, 160, 100, { fill: "#dcdfe3" }));
      failBox.appendChild(rect(1, 1, 158, 98, { rx: 4, fill: "#eceef1" }));
      failBox.appendChild(dot(80, 40, 15, "#c6ccd4"));
      failBox.appendChild(path("M80 31v14", null, "#ffffff", 4));
      failBox.appendChild(dot(80, 52, 2.4, "#ffffff"));
      failBox.appendChild(path("M56 70h48", null, "#c6ccd4", 3));
      preview.appendChild(failBox);
    } else if (state === "empty") {
      // 「暂无封面」：只有灰底和一行短横线
      var emptyBox = svg(coverSize || "0 0 160 100", "loader");
      emptyBox.appendChild(rect(0, 0, 160, 100, { fill: "#e9ebee" }));
      emptyBox.appendChild(rect(1, 1, 158, 98, { rx: 4, fill: "#f7f8fa" }));
      emptyBox.appendChild(path("M56 48h48", null, "#c6ccd4", 3));
      emptyBox.appendChild(path("M64 58h32", null, "#dcdfe3", 3));
      preview.appendChild(emptyBox);
    } else {
      preview.appendChild(makeLoadingCover(coverSize || "0 0 160 100", COVER_TINT[index % COVER_TINT.length]));
    }

    var border = el("span", "border");
    preview.appendChild(border);

    var dur = el("span", "cover-dur", entry.dur || "");
    preview.appendChild(dur);

    v.appendChild(preview);

    var title = el("a", "t", entry.t || "");
    title.setAttribute("href", "#");
    v.appendChild(title);

    var info = el("p", "i");
    var play = el("b", "i1", entry.play || "");
    play.appendChild(makePlayIcon());
    var dan = el("b", "i2", entry.dan || "");
    dan.appendChild(makeDanmakuIcon());
    info.appendChild(play);
    info.appendChild(dan);
    v.appendChild(info);

    li.appendChild(v);
    return li;
  }

  // 右侧排行栏的一条：名次 + 标题 + 播放数 + 弹幕数
  function makeRankItem(entry, index) {
    var li = el("li");
    var num = el("span", "number" + (index < 3 ? " n" + (index + 1) : ""), String(index + 1));
    var title = el("a", "t", entry.t || "");
    title.setAttribute("href", "#");
    var info = el("p", "i");
    var play = el("b", "i1", "播放 " + (entry.play || ""));
    var dan = el("b", "i2", "弹幕 " + (entry.dan || ""));
    info.appendChild(play);
    info.appendChild(dan);

    li.appendChild(num);
    li.appendChild(title);
    li.appendChild(info);
    return li;
  }

  function makeTabRow(items, activeIndex, extraClass) {
    var ul = el("ul", "b-slt-tab " + (extraClass || ""));
    items.forEach(function (text, i) {
      var li = el("li", i === activeIndex ? "on" : "", text);
      ul.appendChild(li);
    });
    return ul;
  }

  /* ---------------- 渲染 ---------------- */

  function renderPromote() {
    var list = doc.getElementById("promoteList");
    if (!list) return;
    // 封面画布按归档 new_z2.css:887 的 116×87（.index-tjbox .v .preview）传
    PROMOTE.forEach(function (entry, i) { list.appendChild(makeVideoCard(entry, i, "0 0 116 87")); });
  }

  function renderRecommend() {
    var list = doc.getElementById("recommendList");
    if (!list) return;
    // 归档 new_z2.css:5403-5415 的 .rm-list 用的是标准 160×100 封面（不是小号），
    // 所以这里不再传小 viewBox，直接吃默认的 0 0 160 100。
    RECOMMEND.forEach(function (entry, i) {
      list.appendChild(makeVideoCard(entry, i));
    });
  }

  function renderSection(section) {
    var row = el("div", "container-row");
    row.id = section.id;

    // ---- 左：板块标题 + 两个小 tab + 一行视频卡 ----
    var left = el("div", "b-l");

    var head = el("div", "b-head");
    var icon = el("span", "b-head-i");
    icon.appendChild(makeSectionIcon(section.icon));
    head.appendChild(icon);

    var title = el("span", "b-head-t");
    var titleLink = el("a", section.name, "");
    titleLink.textContent = "";
    titleLink.appendChild(doc.createTextNode(section.name));
    titleLink.setAttribute("href", "#");
    title.appendChild(titleLink);
    head.appendChild(title);

    if (section.sub) head.appendChild(el("span", "b-head-s", section.sub));

    // 「有新动态 / 最新投稿」两个小 tab（当年就是这两个）
    head.appendChild(makeTabRow(["有新动态", "最新投稿"], 1));

    var push = el("span", "read-push");
    var refresh = el("span", "i-refresh");
    refresh.appendChild(makeSectionIcon("refresh"));
    push.appendChild(refresh);
    push.appendChild(doc.createTextNode("换一换"));
    head.appendChild(push);

    left.appendChild(head);

    var body = el("div", "b-body");
    var vList = el("ul", "v-list");
    section.vids.forEach(function (entry, i) { vList.appendChild(makeVideoCard(entry, i)); });
    body.appendChild(vList);
    left.appendChild(body);
    row.appendChild(left);

    // ---- 右：XX排行 侧栏 ----
    var right = el("div", "b-r");
    var rmtHead = el("div", "rmt-head");

    var rmtTitle = el("span", "b-head-t");
    var rmtLink = doc.createElement("a");
    rmtLink.setAttribute("href", "#");
    rmtLink.appendChild(doc.createTextNode(section.name + "排行"));
    rmtTitle.appendChild(rmtLink);
    rmtHead.appendChild(rmtTitle);

    var tabs = el("span", "rmt-tabs");
    tabs.appendChild(makeTabRow(["全部", "原创"], 0, "rmt-slt"));
    tabs.appendChild(makeTabRow(["三日", "一周"], 0, "rmt-slt"));
    rmtHead.appendChild(tabs);
    right.appendChild(rmtHead);

    var rlist = el("ul", "rlist");
    (section.rank || []).forEach(function (entry, i) { rlist.appendChild(makeRankItem(entry, i)); });
    right.appendChild(rlist);

    var more = el("a", "rank-more", "查看完整排行榜 >");
    more.setAttribute("href", "#");
    right.appendChild(more);

    row.appendChild(right);
    return row;
  }

  // 番剧板块比别的板块多一排星期切换 + 一行「完结动画推荐」
  function renderWeekdayBar() {
    var days = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
    var today = new Date().getDay();

    var bar = el("ul", "weekday-bar");
    days.forEach(function (name, i) {
      var li = el("li", i === today ? "on" : "", name.slice(1));
      li.setAttribute("title", name);
      bar.appendChild(li);
    });

    var row = el("div", "cld-row");
    row.appendChild(doc.createTextNode("完结动画推荐"));
    row.appendChild(el("em", "", "　挑几部已经完结的，一口气看完"));
    return { bar: bar, row: row };
  }

  function renderSections() {
    var area = doc.getElementById("sectionArea");
    if (!area) return;

    SECTIONS.forEach(function (section) {
      var row = renderSection(section);
      area.appendChild(row);

      if (section.id === "b_bangumi") {
        var extra = renderWeekdayBar();
        var left = row.querySelector(".b-l");
        var head = left && left.querySelector(".b-head");
        if (head && head.parentNode === left) {
          left.insertBefore(extra.bar, head.nextSibling);
          left.insertBefore(extra.row, extra.bar.nextSibling);
        }
      }
    });
  }

  /* ---------------- 轮播：点圆点换一张（页面里唯一允许的状态变化） ---------------- */

  function initSlider() {
    var slider = doc.getElementById("slider");
    var dots = doc.getElementById("sliderDots");
    if (!slider || !dots) return;

    var slides = slider.querySelectorAll(".slider-slide");
    var dotItems = dots.querySelectorAll(".dot");
    if (!slides.length || slides.length !== dotItems.length) return;

    function show(index) {
      var i;
      for (i = 0; i < slides.length; i++) {
        if (i === index) {
          slides[i].className = "slider-slide is-on";
          dotItems[i].className = "dot is-on";
        } else {
          slides[i].className = "slider-slide";
          dotItems[i].className = "dot";
        }
      }
    }

    // hover / 聚焦时先把圆点挪过去，让用户看得见「点了会去哪一张」。
    // 真正的跳转由上面那条 document 级捕获监听负责，这里不改状态机。
    Array.prototype.forEach.call(dotItems, function (dotNode, i) {
      dotNode.addEventListener("mouseenter", function () { show(i); });
      dotNode.addEventListener("focus", function () { show(i); });
    });

    // 自动轮播：只在用户没有要求「减少动效」时开，且鼠标在页面上就停。
    var reduce = global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)");
    if (!reduce || reduce.matches) return;

    var current = 0;
    var timer = global.setInterval(function () {
      if (navigated) { global.clearInterval(timer); return; }
      current = (current + 1) % slides.length;
      show(current);
    }, 4500);

    doc.addEventListener("visibilitychange", function () {
      if (doc.hidden) {
        global.clearInterval(timer);
      } else if (!navigated) {
        timer = global.setInterval(function () {
          current = (current + 1) % slides.length;
          show(current);
        }, 4500);
      }
    });
  }

  /* ---------------- 开工 ---------------- */
  renderPromote();
  renderSections();
  renderRecommend();
  initSlider();
})(window);
