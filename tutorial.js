"use strict";
// 1.8.22（old-p3 security P3-2）：不允许被别的页面嵌进 iframe 做点击劫持（判据在 i18n.js）。
BcaI18n.guardTopFrame("这个页面需要在独立标签页中打开，请不要把它嵌入其他页面。", "页面不允许被嵌入其他页面。");
/* 教程页的关窗按钮。
   这个页面可能由扩展自己打开（chrome.tabs.create），也可能是用户手输地址进来的；
   前者能 window.close()，后者不能 —— 所以两者都兜一下，失败就退回收藏库。 */
// 教程页与使用说明页共用这个脚本，两页的按钮 id 不同
const closeButton = document.getElementById("tutorialClose") || document.getElementById("guideClose");

if (closeButton) {
  closeButton.addEventListener("click", () => {
    window.close();
    // window.close() 对"用户直接输入地址打开"的标签页无效（浏览器不允许脚本关掉它），
    // 这时把标签页导回收藏库，用户不会卡在一个关不掉的页面上
    setTimeout(() => {
      chrome.tabs.getCurrent((tab) => {
        if (tab?.id !== undefined) chrome.tabs.update(tab.id, { url: chrome.runtime.getURL("library.html") });
      });
    }, 60);
  });
}

/* 教程第三步里画了一个 chrome://extensions 的示意图，上面有版本号。
   这个数字以前是写死在 HTML 里的（停在 1.1.28，落后了十个版本都没人发现）——
   凡是写死在文档/示意图里的版本号都一定会过期。改成从 manifest 现读，
   示意图就永远和真实扩展一致。（使用说明页没有这个示意卡片，取值前先判空。） */
const versionSlot = document.getElementById("tutorialVersion");
if (versionSlot) versionSlot.textContent = chrome.runtime.getManifest().version;

/* 界面语言：使用说明页（guide.html）与安装教程页共用这个脚本。
   页面正文靠 i18n.js 扫 data-i18n* 属性翻译，<title> 没有属性可挂，
   所以这里在 init()（内部会自己 apply(document) 一次）之后单独设置。
   两页都要有标题词条，所以各自写成 t("字面量")；取不到词典时 t() 原样返回中文。
   使用说明页有 #guideClose（按钮），教程页有 #tutorialClose，用它区分当前是哪个页面。 */
const isGuidePage = !!document.getElementById("guideClose");

if (typeof BcaI18n !== "undefined" && typeof BcaI18n.init === "function") {
  BcaI18n.init()
    .catch(() => {})
    .then(() => {
      document.title = isGuidePage
        ? BcaI18n.t("哔哩藏库 · 使用说明")
        : BcaI18n.t("本地目录打开助手 · 安装教程");
    });
}

/* 1.10.21：目录高亮。使用说明页的目录是十条锚点，滚动时告诉读者「现在读到第几节」。
   不用 IntersectionObserver：这里只要「谁刚滚过顶部」，量一次坐标比维护观察器简单，
   也没有异步回调，测试里打一次 scroll 就能验。 */
function markCurrentSection() {
  /* 用「取出来自己筛」而不是 [href^="#"]：属性前缀选择器在部分环境里不支持，
     而这里本来就只关心同页锚点。 */
  const links = Array.from(document.querySelectorAll(".toc a"))
    .filter((link) => String(link.getAttribute("href") || "").startsWith("#"));
  if (!links.length) return;
  const heads = links.map((link) => document.getElementById(link.getAttribute("href").slice(1)));
  let current = 0;
  heads.forEach((head, index) => {
    if (!head) return;
    if (head.getBoundingClientRect().top <= 140) current = index;
  });
  links.forEach((link, index) => {
    const isCurrent = index === current;
    link.classList.toggle("is-current", isCurrent);
    if (isCurrent) link.setAttribute("aria-current", "location");
    else link.removeAttribute("aria-current");
  });
}

if (document.querySelector(".toc")) {
  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(() => {
      queued = false;
      markCurrentSection();
    });
  };
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule);
  /* 带 #hash 打开时，浏览器的锚点滚动发生在脚本之后，首帧可能还停在第一节 ——
     等 load 再量一次，目录就能对上用户实际看到的那一节。 */
  window.addEventListener("load", markCurrentSection);
  markCurrentSection();
}

/* 1.10.22：安装教程的五步进度条。判定口径与目录高亮一致（刚滚过顶部那一条），
   只是这里要区分「走过了」与「正在这一步」：走过的点描边、当前的实心。 */
function markCurrentStep() {
  const dots = Array.from(document.querySelectorAll(".steps-dot"));
  if (!dots.length) return;
  const steps = dots.map((dot) => document.getElementById(String(dot.getAttribute("href") || "").slice(1)));
  let current = 0;
  steps.forEach((step, index) => {
    if (!step) return;
    if (step.getBoundingClientRect().top <= 120) current = index;
  });
  dots.forEach((dot, index) => {
    dot.classList.toggle("is-current", index === current);
    dot.classList.toggle("is-done", index < current);
    if (index === current) dot.setAttribute("aria-current", "step");
    else dot.removeAttribute("aria-current");
  });
}

if (document.querySelector(".steps-progress")) {
  let stepQueued = false;
  const scheduleStep = () => {
    if (stepQueued) return;
    stepQueued = true;
    window.requestAnimationFrame(() => {
      stepQueued = false;
      markCurrentStep();
    });
  };
  window.addEventListener("scroll", scheduleStep, { passive: true });
  window.addEventListener("resize", scheduleStep);
  window.addEventListener("load", markCurrentStep);
  markCurrentStep();
}
