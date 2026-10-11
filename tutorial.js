"use strict";
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
