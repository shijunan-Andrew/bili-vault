"use strict";

/* 设置页：外观（主题）、语言、使用说明。
   主题走 BcaTheme（localStorage 是权威、chrome.storage 是给内容脚本看的镜像），
   语言走 BcaI18n（chrome.storage.local[interfaceLocale]）。
   两个都是改完立即生效，并且留在本页——设置页不关自己。 */

const themeButtons = [...document.querySelectorAll(".segmented button[data-theme-value]")];
const localeButtons = [...document.querySelectorAll(".segmented button[data-locale]")];

// 只改选中态、绝不写 textContent：切完语言后写死的文字会把译文盖回中文
function renderThemeOptions() {
  for (const button of themeButtons) {
    button.setAttribute("aria-pressed", String(button.dataset.themeValue === BcaTheme.current()));
  }
}

function renderLocaleOptions() {
  for (const button of localeButtons) {
    button.setAttribute("aria-pressed", String(button.dataset.locale === BcaI18n.locale()));
  }
}

// <title> 不在 apply() 的管辖范围里（data-i18n-title 改的是元素的 title 属性），只能手写
function applyTitle() {
  document.title = BcaI18n.t("哔哩藏库 · 设置");
}

async function applyLocale(locale) {
  await BcaI18n.use(locale);
  renderLocaleOptions();
}

async function boot() {
  await BcaI18n.init().catch(() => {});
  applyTitle();
  renderThemeOptions();
  renderLocaleOptions();

  // 主题：BcaTheme.use 自己会写 localStorage、镜像到 chrome.storage 并通知监听者，
  // 别的页面改主题时 theme.js 的 storage 事件也会走到这里，所以只挂一个 onChange 就够
  BcaTheme.onChange(renderThemeOptions);
  for (const button of themeButtons) {
    button.addEventListener("click", () => BcaTheme.use(button.dataset.themeValue));
  }

  BcaI18n.onChange(() => {
    applyTitle();
    renderLocaleOptions();
  });
  for (const button of localeButtons) {
    button.addEventListener("click", () => { applyLocale(button.dataset.locale).catch(() => {}); });
  }

  // 弹窗里改了语言也要跟上（i18n.js 自己没有 storage 监听）。
  // chrome.storage.onChanged 在写入方自己的页面里也会触发，所以这里必须认一下
  // 「这就是我刚写的」：BcaI18n.use() 是先换 current 再写存储的，值一样就什么都不做。
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    const next = changes[BcaI18n.STORAGE_KEY]?.newValue;
    if (!BcaI18n.isSupported(next) || next === BcaI18n.locale()) return;
    Promise.resolve(BcaI18n.use(next, { silent: true })).catch(() => {}).then(renderLocaleOptions);
  });

  // 齿轮是在收藏库那个标签页里点开的，本页是新开的一个标签：能关就直接关掉、回到原来
  // 那个收藏库标签（用户手动输地址进来时关不掉，才退回导航过去）。和 tutorial.js 的
  // 关窗按钮同一套做法，两道都兜住，用户不会卡在一个退不出去的页面上。
  document.getElementById("settingsBack")?.addEventListener("click", () => {
    window.close();
    setTimeout(() => {
      chrome.tabs.getCurrent((tab) => {
        if (tab?.id !== undefined) chrome.tabs.update(tab.id, { url: chrome.runtime.getURL("library.html") });
      });
    }, 60);
  });
}

boot().catch(() => {});
