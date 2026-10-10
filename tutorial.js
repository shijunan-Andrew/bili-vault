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
