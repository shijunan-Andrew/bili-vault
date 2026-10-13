// 2015 replica: every click leads to the live bilibili homepage, plus the easter-egg dialog.
//
// 这一段在两个地方出现，内容必须逐字一致：
//   1) index.html 末尾的内联 <script>  —— 双击 index.html 直接打开（file://）时靠它；
//   2) 同目录的 egg-2015.js，由 <script src="egg-2015.js"> 引入 —— chrome-extension:// 页面
//      的 CSP 是 script-src 'self'，内联脚本会被整段拦掉（真机上「知道啦」点不动的根因就是这个）。
// 两份都加载时靠 window.__bili2015Wired 保证只有第一份生效。
(function () {
  if (window.__bili2015Wired) return;
  window.__bili2015Wired = 1;

  var TARGET = 'https://www.bilibili.com/';
  var docEl = document.documentElement;

  // 彩蛋对话框：遮罩 #eggDialogOverlay / 卡片 #eggDialogCard / 文案 #eggDialogText / 按钮 #eggDialogOk。
  // 关闭有四条互不依赖的通道，任意一条活着就能关掉：
  //   A. 纯 CSS：按钮其实是 <label for="eggDialogOkToggle">，点一下勾上隐藏的复选框，
  //      #eggDialogOkToggle:checked ~ #eggDialogOverlay 就把遮罩 display:none —— 一行 JS 都不用；
  //   B. 指针：window 捕获阶段的 pointerdown（最早注册），按下就关，不等 click；
  //   C. 点击：window 捕获阶段的 click 硬守卫，preventDefault + stopImmediatePropagation 按死这一次；
  //   D. 键盘：Esc（按钮聚焦时还包括 Enter / 空格），同样在 window 捕获阶段。
  // 「关掉的那一次手势不能顺带导航」用 <html data-egg-dismissed> 记号 + dismissedAt 时间窗解决：
  // 记号只在这一次手势里有效，下一次新手势一到就撤掉，之后点页面别处照旧跳 B 站。
  var overlay = document.getElementById('eggDialogOverlay');
  var box = document.getElementById('eggDialogBox');
  var ok = document.getElementById('eggDialogOk');
  var toggle = document.getElementById('eggDialogOkToggle');

  var KEY = 'biliVaultEggDismissed.v1';   // 带版本号，换实现就换版本
  var GESTURE_MS = 400;                   // 同一次手势的保护窗口（含双击的第二下）
  var PERSIST_MS = 60000;                 // localStorage 兜底有效期：刚关过又立刻打开同一页就别再弹
  var dismissedAt = 0;

  function readStore(name) {
    try { var s = window[name]; return s ? s.getItem(KEY) : null; } catch (e) { return null; }
  }
  function writeStores() {
    var now = String(Date.now());
    try { if (window.sessionStorage) window.sessionStorage.setItem(KEY, now); } catch (e) {}
    try { if (window.localStorage) window.localStorage.setItem(KEY, now); } catch (e) {}
  }
  // 关掉之后，本次浏览里不要再自己回来。sessionStorage 管这个标签页；localStorage 是兜底，
  // 管「刚关掉、页面又被重新打开一次」这种短时间内的重复弹出。
  function remembered() {
    if (readStore('sessionStorage')) return true;
    var t = parseInt(readStore('localStorage') || '', 10);
    return !!t && (Date.now() - t) < PERSIST_MS;
  }
  function openDialog() { return !!(overlay && overlay.parentNode); }
  function closeDialog() {
    if (toggle) { try { toggle.checked = true; } catch (e) {} }   // 先走 A 那条 CSS 通道
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
  }
  function dismiss() {
    dismissedAt = Date.now();
    docEl.setAttribute('data-egg-dismissed', '1');
    writeStores();
    closeDialog();
  }
  // 只有「新手势」才撤记号：关闭动作之后 GESTURE_MS 内的按住仍然算同一次手势（双击的第二下）。
  function gestureStart() {
    if (!docEl.hasAttribute('data-egg-dismissed')) return;
    if (Date.now() - dismissedAt < GESTURE_MS) return;
    docEl.removeAttribute('data-egg-dismissed');
  }
  function swallow(e) {
    if (!e) return;
    if (e.cancelable !== false && e.preventDefault) e.preventDefault();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
  }
  // 只有这两处点击算「关掉对话框」：按钮本身，或卡片外面的遮罩空白。卡片正文点了不关。
  function isCloseTarget(el) {
    return el === ok || el === overlay || el === box || el === toggle;
  }

  // ---- B 按下就关
  window.addEventListener('pointerdown', function (e) {
    if (openDialog() && isCloseTarget(e.target)) { dismiss(); return; }
    gestureStart();
  }, true);
  // 没有 pointer 事件的输入路径（老的合成 mousedown）也要能撤记号
  window.addEventListener('mousedown', function () { gestureStart(); }, true);
  window.addEventListener('touchstart', function () { gestureStart(); }, true);

  // ---- C click 硬守卫：对话框范围内的点击不许变成跳转，是关闭点的就顺手关掉
  window.addEventListener('click', function (e) {
    var el = e.target;
    var marked = docEl.hasAttribute('data-egg-dismissed') || (Date.now() - dismissedAt) < GESTURE_MS;
    var inDialog = !!(el && el.nodeType === 1 && el.closest && el.closest('[data-egg-dialog]'));
    if (!marked && !inDialog) return;                 // 页面自己的点击：一律不管
    if (isCloseTarget(el) || marked) dismiss();
    swallow(e);
  }, true);

  // ---- D 键盘
  window.addEventListener('keydown', function (e) {
    var k = e.key || '';
    var esc = (k === 'Escape' || k === 'Esc' || e.keyCode === 27);
    var activate = (k === 'Enter' || k === ' ' || k === 'Spacebar' || e.keyCode === 13 || e.keyCode === 32) && document.activeElement === ok;
    if (openDialog() && (esc || activate)) { swallow(e); dismiss(); return; }
    gestureStart();
  }, true);

  // ---- 页面 catch-all：其余地方点哪儿都跳 B 站（彩蛋的一部分，不许破坏）
  // 链接自己带 href + target="_blank"，不用管；这里管的是 banner 圆点、tab、按钮、列表行、
  // 搜索框、空白区域这些 2015 年靠 page.core.js 跳转的元素。
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (t && t.nodeType === 1 && t.closest && t.closest('[data-egg-dialog]')) return;
    if (docEl.hasAttribute('data-egg-dismissed')) return;
    if ((Date.now() - dismissedAt) < GESTURE_MS) return;
    if (overlay && overlay.parentNode && overlay.contains && overlay.contains(t)) return;
    var n = t;
    while (n && n !== document.body) {
      if (n.tagName === 'A' && n.getAttribute('href')) return;   // let the anchor do its own job
      n = n.parentNode;
    }
    if (e.cancelable !== false && e.preventDefault) e.preventDefault();
    window.open(TARGET, '_blank');
  }, true);
  document.addEventListener('submit', function (e) {
    e.preventDefault();
    window.open(TARGET, '_blank');
  }, true);

  // ---- 这次浏览里已经关过（哪怕打开的是缓存下来的旧 HTML）：直接不显示对话框
  if (remembered()) closeDialog();
})();
