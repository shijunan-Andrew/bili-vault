/* ==========================================================================
   retro.js —— 彩蛋页的全部脚本
   只做两件事：
   1. 把"最近投递"那 12 张占位卡片和排行榜画出来（数据写死在下面的数组里，
      一律用 createElement + textContent 建节点，不用 innerHTML、不用 eval）。
   2. 整页点击都跳去现在的 B 站首页。
   --------------------------------------------------------------------------
   为什么跳转用一个 document 级**捕获**监听：
   捕获阶段在目标元素自己的处理器之前跑，所以链接、按钮、封面、空白处——
   点哪儿都拦得住，不需要给每个元素单独挂事件，也不怕页面之后加了新元素。
   为什么用 window.location.href 同标签跳，而不是 window.open 开新标签：
   这是彩蛋，点下去就该"从十年前的页面回到现在"，同标签最符合这个动作；
   而且 window.open 在 chrome-extension:// 页面里更容易被弹窗拦截器吃掉，
   同标签跳转没有这个风险。要改成新标签，只需要把 goToBilibiliNow 里那一行
   换成 chrome.tabs.create —— 但 manifest 里没有 tabs 权限，得先补权限。
   这个文件里出现的唯一一个 http(s) 地址就是下面的跳转目标，别再加别的。
   ========================================================================== */
(function retroPage(global) {
  "use strict";

  var BILIBILI_HOME = "https://www.bilibili.com";

  var navigated = false;

  // 同标签跳转。加个一次性闩，避免连点两次触发两次导航。
  function goToBilibiliNow() {
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

  // 捕获阶段拦下整页的点击：链接、按钮、封面、文字、空白处，全都算。
  // 顺手 preventDefault —— 页面里的链接 href 都是 "#"，不挡的话点一下先
  // 跳一次页内锚点，浏览器地址栏会闪一下 #。
  document.addEventListener("click", function (event) {
    event.preventDefault();
    goToBilibiliNow();
  }, true);

  // 键盘：<a> 和 <button> 按 Enter 会自己派发 click（上面那条已经接住了），
  // 但 <button> 的 Space 不会 —— 这里补上，免得键盘用户觉得页面是坏的。
  document.addEventListener("keydown", function (event) {
    if (event.key !== "Enter" && event.key !== " " && event.key !== "Spacebar") return;
    var target = event.target;
    var tag = target && target.tagName ? String(target.tagName).toLowerCase() : "";
    if (tag !== "a" && tag !== "button") return;
    if (event.key === "Enter") return;   // Enter 交给浏览器派发的 click
    event.preventDefault();
    goToBilibiliNow();
  }, true);

  /* ---------------- 占位内容 ---------------- */

  // 「最近投递」的补充卡片。列名、播放量都是写的假数据，只为了让版面像那么回事。
  var NEWEST = [
    { title: "【钢琴】把这首曲子重新弹了一遍", up: "键盘上的猫", play: "3.2万", duration: "03:26", cover: 5 },
    { title: "【实况】生存第 100 天，先盖个房子", up: "方块研究所", play: "6.8万", duration: "15:40", cover: 6 },
    { title: "【翻唱】夏天的风，吹过很久很久", up: "会唱歌的鲸", play: "9.4万", duration: "04:02", cover: 7 },
    { title: "【教程】十分钟讲清楚排序算法", up: "代码夜宵", play: "2.1万", duration: "10:12", cover: 8 },
    { title: "【手书】画了一整个夏天的故事", up: "铅笔与纸", play: "4.6万", duration: "02:48", cover: 9 },
    { title: "【料理】一个人也要好好吃饭", up: "厨房小分队", play: "1.5万", duration: "06:31", cover: 1 },
    { title: "【评测】这块键盘敲起来真舒服", up: "数码阳台", play: "7.3万", duration: "08:05", cover: 2 },
    { title: "【旅行】坐了两天火车去看海", up: "背包与相机", play: "5.9万", duration: "12:20", cover: 3 }
  ];

  var RANK = [
    { title: "【原创】把夏天的蝉鸣做成了歌", stat: "播放 48.2万 · 弹幕 1.1万" },
    { title: "【动画】三分钟看懂这一季新番", stat: "播放 36.7万 · 弹幕 8600" },
    { title: "【鬼畜】这段配音我能听一天", stat: "播放 31.4万 · 弹幕 2.3万" },
    { title: "【游戏】第一次通关就破纪录了", stat: "播放 22.8万 · 弹幕 5400" },
    { title: "【舞蹈】在家也能跳的宅舞", stat: "播放 19.5万 · 弹幕 4200" },
    { title: "【音乐】安利一首很安静的歌", stat: "播放 14.1万 · 弹幕 3100" },
    { title: "【科技】自己攒了一台小主机", stat: "播放 11.6万 · 弹幕 2700" },
    { title: "【生活】记录一个普通的周末", stat: "播放 8.9万 · 弹幕 1500" }
  ];

  function makeCard(entry) {
    var item = document.createElement("li");
    item.className = "video-card";

    var cover = document.createElement("div");
    cover.className = "card-cover";

    var art = document.createElement("span");
    // 封面图示全部来自 retro.css 里的 .cover-N 渐变，没有一张图
    art.className = "cover-art cover-" + (Number(entry.cover) || 1);

    var mask = document.createElement("span");
    mask.className = "cover-mask";
    var play = document.createElement("span");
    play.className = "cover-play";
    mask.appendChild(play);

    var duration = document.createElement("span");
    duration.className = "cover-duration";
    duration.textContent = String(entry.duration || "");

    cover.appendChild(art);
    cover.appendChild(mask);
    cover.appendChild(duration);

    var title = document.createElement("h3");
    title.className = "card-title";
    title.textContent = String(entry.title || "");

    var meta = document.createElement("p");
    meta.className = "card-meta";
    var up = document.createElement("span");
    up.className = "meta-up";
    up.textContent = String(entry.up || "");
    var views = document.createElement("span");
    views.className = "meta-play";
    views.textContent = String(entry.play || "");
    meta.appendChild(up);
    meta.appendChild(views);

    item.appendChild(cover);
    item.appendChild(title);
    item.appendChild(meta);
    return item;
  }

  function renderNewest() {
    var grid = document.getElementById("newestGrid");
    if (!grid) return;
    NEWEST.forEach(function (entry) { grid.appendChild(makeCard(entry)); });
  }

  function renderRank() {
    var list = document.getElementById("rankList");
    if (!list) return;
    RANK.forEach(function (entry) {
      var item = document.createElement("li");
      var link = document.createElement("a");
      link.href = "#";
      link.textContent = String(entry.title || "");
      var stat = document.createElement("span");
      stat.className = "rank-stat";
      stat.textContent = String(entry.stat || "");
      item.appendChild(link);
      item.appendChild(stat);
      list.appendChild(item);   // stat 必须和 link 一起挂进 li，不能挂到 li 外面
    });
  }

  renderNewest();
  renderRank();
})(window);
