(() => {
  const seen = new Set();
  const pendingStops = new Set();
  let lastConfirmAt = 0;
  let archiveEnabled = false;
  let enabledStateUpdated = false;

  chrome.storage.local.get("enabled").then(({ enabled }) => {
    if (!enabledStateUpdated) archiveEnabled = enabled !== false;
  }).catch(() => {});

  // 4.6：提示卡的深浅跟随扩展里的主题设置。主题本身存在扩展页面的 localStorage 里
  // （theme.js，为了在 <head> 里同步应用、不闪浅色），而这段脚本跑在 B 站页面里，
  // 读到的是宿主的 localStorage，拿不到扩展那一份；theme.js 因此把它镜像到了
  // chrome.storage.local，这里从那里读。键名要与 BcaTheme.STORAGE_KEY 一致
  // （内容脚本不加载 theme.js，拿不到那个常量）。
  const NOTICE_THEME_KEY = "interfaceTheme";
  const NOTICE_THEME_MODES = ["system", "light", "dark"];
  const preferDarkMedia = window.matchMedia?.("(prefers-color-scheme: dark)") || null;
  let extensionTheme = "system";
  let extensionThemeUpdated = false;

  function normalizeTheme(value) {
    return NOTICE_THEME_MODES.includes(value) ? value : "system";
  }

  // 扩展设置优先；只有选了「跟随系统」才交给 prefers-color-scheme
  function noticeTheme() {
    if (extensionTheme !== "system") return extensionTheme;
    return preferDarkMedia?.matches ? "dark" : "light";
  }

  // 只改自己插进去的那个卡片根节点，宿主页面一个属性都不碰
  function paintNoticeTheme() {
    const host = document.getElementById("bili-fav-archiver-host");
    if (host) host.dataset.bcaTheme = noticeTheme();
  }

  chrome.storage.local.get(NOTICE_THEME_KEY).then((items) => {
    if (extensionThemeUpdated) return;
    extensionTheme = normalizeTheme(items?.[NOTICE_THEME_KEY]);
    paintNoticeTheme();
  }).catch(() => {});

  // 「跟随系统」时常住页面：系统深浅色变了，已经打开的提示卡也要跟着变
  preferDarkMedia?.addEventListener?.("change", paintNoticeTheme);

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    // 用户在收藏库 / 弹窗里改了主题，已经打开的 B 站页面要立刻跟上
    if (changes[NOTICE_THEME_KEY]) {
      extensionThemeUpdated = true;
      extensionTheme = normalizeTheme(changes[NOTICE_THEME_KEY].newValue);
      paintNoticeTheme();
    }
    if (!changes.enabled) return;
    enabledStateUpdated = true;
    archiveEnabled = changes.enabled.newValue !== false;
    if (!archiveEnabled) for (const stop of [...pendingStops]) stop();
  });

  // 4.5：多语言。这段脚本跑在 B 站页面里，所以只能翻译自己插入的提示卡：
  // 给 init 传 root（提示卡那一块）之后，i18n.js 既不会翻宿主页面，也不会动 <html lang>。
  // 提示卡要等用户点收藏后才创建，这里先传一个不挂到页面上的占位容器，
  // 卡片建好后再对它单独调用 BcaI18n.apply(卡片根节点)。
  const noticeRootSlot = document.createElement("div");
  const i18nReady = BcaI18n.init({ root: noticeRootSlot });

  function visible(element) {
    if (!element?.isConnected) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) > 0.05 && rect.width > 0 && rect.height > 0;
  }

  function textOf(element) {
    return String(element?.innerText || element?.textContent || "").replace(/\s+/g, " ").trim();
  }

  function findFavoriteDialog(event) {
    for (const item of event.composedPath()) {
      if (!(item instanceof Element) || !visible(item)) continue;
      const text = textOf(item);
      if (text.includes("添加到收藏夹") && /确定/.test(text)) return item;
    }
    return null;
  }

  function clickedConfirm(event, dialog) {
    for (const item of event.composedPath()) {
      if (!(item instanceof Element) || !dialog.contains(item)) continue;
      const text = textOf(item);
      if (text === "确定" && (item.matches("button, [role=button], .ant-btn") || item.children.length === 0)) return item;
    }
    return null;
  }

  function rowForCheckbox(control, dialog) {
    const label = control.closest("label");
    if (label && dialog.contains(label)) return label;
    let current = control;
    while (current && current !== dialog) {
      const text = textOf(current);
      if (text.length < 140 && /\d+\s*\/\s*\d+/.test(text)) return current;
      current = current.parentElement;
    }
    return null;
  }

  function folderNameFromRow(row) {
    let name = textOf(row);
    // Bilibili puts a folder's item count after its visibility label, e.g. "默认收藏夹 [私密] 2802".
    // Keep digits that belong to a user-chosen folder name, and remove only the count after that label.
    name = name.replace(/(\[(?:私密|公开|仅自己可见|所有人可见)\])\s+\d[\d,]*(?:\.\d+)?\s*(?:万|亿)?$/u, "$1");
    return name
      .replace(/\b\d+\s*\/\s*\d+\b/g, " ")
      .replace(/\[(?:私密|公开|仅自己可见|所有人可见)\]/g, " ")
      .replace(/(?:编辑|删除)\s*$/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function selectedFolders(dialog) {
    const controls = Array.from(dialog.querySelectorAll(
      'input[type="checkbox"], [role="checkbox"], [aria-checked], [class*="checkbox"], [class*="Checkbox"]'
    ));
    const found = new Map();
    for (const control of controls) {
      const className = typeof control.className === "string" ? control.className : "";
      const selected = control.checked === true ||
        control.getAttribute("aria-checked") === "true" ||
        control.getAttribute("data-checked") === "true" ||
        /(?:checked|selected|is-checked)/i.test(className);
      if (!selected) continue;
      const row = rowForCheckbox(control, dialog);
      const name = folderNameFromRow(row);
      if (!name || name.includes("添加到收藏夹")) continue;
      const id = control.value || control.getAttribute("data-id") || row?.getAttribute("data-id") || "";
      found.set(`${id}|${name}`, { id, name });
    }
    return [...found.values()];
  }

  function getVideoMetadata() {
    let state = {};
    try { state = window.__INITIAL_STATE__ || window.__initialState__ || {}; } catch (_) {}
    const video = state.videoData || state.videoDataV2 || state.videoInfo || {};
    const owner = video.owner || state.upInfo || {};
    const url = location.href.split("#")[0];
    const meta = (selector) => document.querySelector(selector)?.content || "";
    const bvid = video.bvid || url.match(/\bBV[\w]+/i)?.[0] || "";
    const aid = video.aid || video.aid_v2 || url.match(/\/av(\d+)/i)?.[1] || "";
    const domTags = Array.from(document.querySelectorAll('.video-tag-container a, #v_tag a, .tag-link'))
      .map((node) => textOf(node)).filter(Boolean);
    const stateTags = Array.isArray(video.tags) ? video.tags : (Array.isArray(state.tags) ? state.tags : []);
    const tags = [...new Set([
      ...stateTags.map((tag) => typeof tag === "string" ? tag : tag?.tag_name || tag?.name || ""),
      ...domTags
    ].filter(Boolean))];
    const upLink = document.querySelector('a[href*="space.bilibili.com/"]');
    const upUrl = upLink?.href || "";
    const upMid = owner.mid || owner.uid || upUrl.match(/space\.bilibili\.com\/(\d+)/)?.[1] || "";
    const title = video.title || document.querySelector("h1")?.textContent?.trim() || document.title.replace(/_哔哩哔哩.*$/i, "").trim();
    const player = document.querySelector("video");

    return {
      title: title || "",
      url: meta('meta[property="og:url"]') || url,
      bvid,
      aid,
      cover: video.pic || meta('meta[property="og:image"]') || player?.poster || "",
      category: [video.tname || video.tid_name || "", video.tname2 || ""].filter(Boolean).join(" / "),
      duration: Number(video.duration) || (Number.isFinite(player?.duration) ? Math.floor(player.duration) : 0),
      pubdate: Number(video.pubdate) || 0,
      upName: owner.name || owner.uname || document.querySelector(".up-name, .username, .up-info .name")?.textContent?.trim() || "",
      upMid,
      description: video.desc || video.description || meta('meta[name="description"]') || "",
      tags
    };
  }

  // 注入到 B 站页面的提示卡。4.0：跟随系统深浅色、滑入动画、悬停暂停倒计时、
  // 成功后可以直接跳进本地收藏库。采集与发送逻辑没有任何改动。
  const NOTICE_ICONS = {
    ok: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5.2 12.6 4.4 4.4L18.8 7.6"/></svg>',
    error: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4.6 20.8 19.4H3.2z"/><path d="M12 10v4.1M12 16.8v.2"/></svg>'
  };

  const NOTICE_STYLE = `
    /* 提示卡挂在 B 站页面的 shadow root 里，拿不到 theme.css（4.3 起扩展页不再对
       网页暴露），所以这里放一份与 theme.css 同名的本地令牌副本，取值保持一致；
       改配色请以 theme.css 为准并同步这里。
       4.6：两套调色板仍然都写成 :host 变量，只是「用哪一套」不再只看系统——
       脚本把解析好的主题挂在卡片根节点的 data-bca-theme 上（扩展设置优先，选了
       「跟随系统」才按系统解析）。因此深色只需一份，不必再写一遍媒体查询，
       也就不会出现两处取值不一致。 */
    :host {
      --surface: #ffffff; --surface-soft: #f7f9fc; --line: #e2e8f0;
      --text: #3c4552; --muted: #5f6875; --faint: #858d9a;
      --brand: #00a1d6; --brand-strong: #0089b8; --brand-deep: #026f95;
      --brand-soft: #e9f7fc; --brand-line: #bfe5f2;
      --success: #2f9068; --success-soft: #ecf7f1; --ring: #00a1d62e;
      --shadow: 0 18px 48px #1018282e;
    }
    .notice {
      position: fixed; z-index: 2147483647; right: 24px; bottom: 24px;
      width: min(392px, calc(100vw - 32px)); box-sizing: border-box;
      padding: 15px 17px; border: 1px solid var(--line); border-radius: 14px;
      background: var(--surface); color: var(--text);
      box-shadow: var(--shadow);
      font: 13px/1.65 system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
      animation: bca-slide-in .22s cubic-bezier(.2, .8, .2, 1) both;
      text-align: left;
    }
    .notice.error { --success: #c9483f; --success-soft: #fdf1ef; }
    @keyframes bca-slide-in { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
    .head { display: flex; align-items: center; gap: 8px; margin: 0 26px 5px 0; color: var(--success); font-size: 15px; font-weight: 700; }
    .mark { display: grid; place-items: center; width: 22px; height: 22px; flex: 0 0 22px; border-radius: 7px; background: var(--success-soft); }
    .body { color: var(--text); }
    .details { margin: 9px 0 0; padding: 8px 10px; max-height: 118px; overflow: auto; border-radius: 8px; background: var(--surface-soft); color: var(--muted); font: 12px/1.6 ui-monospace, Consolas, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }
    .actions { display: flex; gap: 8px; margin-top: 12px; }
    .action { display: inline-flex; align-items: center; gap: 5px; min-height: 32px; padding: 0 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); color: var(--text); font-size: 12px; font-weight: 600; text-decoration: none; cursor: pointer; }
    .action:hover { border-color: var(--brand-line); color: var(--brand-deep); background: var(--brand-soft); }
    /* 纯白文字压在 --brand 蓝底上，属于“彩色底上的文字”，不随主题变 */
    .action.primary { border-color: transparent; background: var(--brand); color: #fff; }
    .action.primary:hover { background: var(--brand-strong); color: #fff; }
    .close { position: absolute; right: 9px; top: 9px; display: grid; place-items: center; width: 26px; height: 26px; border: 0; border-radius: 7px; background: transparent; color: var(--faint); font-size: 17px; line-height: 1; cursor: pointer; }
    .close:hover { background: var(--success-soft); color: var(--success); }
    :host([data-bca-theme="dark"]) {
      --surface: #1b2027; --surface-soft: #232a33; --line: #2f3843; --text: #dde3ea; --muted: #a3adba; --faint: #7d8794;
      --brand-deep: #7fd8f5; --brand-soft: #22303a; --brand-line: #2f4a57;
      --success: #4fbf8d; --success-soft: #1d2c26; --shadow: 0 18px 48px #00000080;
    }
    :host([data-bca-theme="dark"]) .notice.error { --success: #ef7f76; --success-soft: #35211f; }
    @media (prefers-reduced-motion: reduce) { .notice { animation: none; } }
  `;

  // 4.3：不再用 window.open 直接打开扩展页（那要求 library.html 对 B 站页面可见），
  // 改为请后台用 chrome.tabs.create 打开，扩展页因此不必暴露给任何网页。
  function openLocalLibrary() {
    try {
      chrome.runtime.sendMessage({ type: "bca-open-library" }, () => { void chrome.runtime.lastError; });
    } catch (_) {}
  }

  function showNotice(title, message, details, isError, primaryAction) {
    document.getElementById("bili-fav-archiver-host")?.remove();
    const host = document.createElement("div");
    host.id = "bili-fav-archiver-host";
    // 4.6：深浅色由扩展设置决定，解析结果挂在这里，CSS 用 :host([data-bca-theme=...]) 选调色板
  // 属性名故意不叫 data-theme：卡片挂在 B 站页面上，避免和宿主页面的选择器撞车
    host.dataset.bcaTheme = noticeTheme();
    const shadow = host.attachShadow({ mode: "closed" });

    const style = document.createElement("style");
    style.textContent = NOTICE_STYLE;
    const box = document.createElement("section");
    box.className = `notice${isError ? " error" : ""}`;
    box.setAttribute("role", "status");

    const heading = document.createElement("div");
    heading.className = "head";
    const mark = document.createElement("span");
    mark.className = "mark";
    mark.innerHTML = isError ? NOTICE_ICONS.error : NOTICE_ICONS.ok;
    const titleText = document.createElement("span");
    // 文案在调用处已经过 t()；这里同样打上 data-i18n 标记，
    // apply(box) 的作用域因此严格限制在这张卡片内，绝不会碰到 B 站页面。
    titleText.dataset.i18n = title;
    titleText.textContent = title;
    heading.append(mark, titleText);

    const body = document.createElement("div");
    body.className = "body";
    body.dataset.i18n = message;
    body.textContent = message;

    const close = document.createElement("button");
    close.type = "button";
    close.className = "close";
    close.textContent = "×";
    close.setAttribute("aria-label", BcaI18n.t("关闭"));
    close.addEventListener("click", () => host.remove());

    box.append(heading, body);
    if (details) {
      // details 是路径 / 原始错误，属于技术信息，不做翻译
      const detail = document.createElement("pre");
      detail.className = "details";
      detail.textContent = details;
      box.append(detail);
    }
    if (primaryAction?.run) {
      const actions = document.createElement("div");
      actions.className = "actions";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "action primary";
      button.dataset.i18n = primaryAction.label;
      button.textContent = primaryAction.label;
      button.addEventListener("click", () => { primaryAction.run(); host.remove(); });
      actions.append(button);
      box.append(actions);
    }
    box.append(close);
    shadow.append(style, box);
    (document.documentElement || document.body).append(host);

    // 只翻译这张提示卡自己（root 限定），不会碰宿主页面；init 还没跑完时补一次
    BcaI18n.apply(box);
    i18nReady.then(() => { if (box.isConnected) BcaI18n.apply(box); }).catch(() => {});

    // 悬停时暂停自动关闭，鼠标移开后再继续倒数
    let remaining = 9000;
    let startedAt = Date.now();
    let timer = 0;
    const schedule = () => { startedAt = Date.now(); timer = window.setTimeout(() => host.remove(), remaining); };
    box.addEventListener("mouseenter", () => { window.clearTimeout(timer); remaining -= Date.now() - startedAt; });
    box.addEventListener("mouseleave", () => { if (remaining > 0) schedule(); });
    schedule();
  }

  function sendFavorite(data) {
    showNotice(BcaI18n.t("正在归档视频…"), BcaI18n.t("B站已完成收藏，正在保存视频信息和封面。"), "", false);
    chrome.runtime.sendMessage({ type: "save-favorite", data }, (result) => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) {
        showNotice(BcaI18n.t("归档失败"), BcaI18n.t("插件后台暂时无法处理这次收藏。"), runtimeError.message, true);
      } else if (!result?.ok) {
        // result.message 来自 background，原样显示；details 是路径/原始错误，不翻译
        showNotice(BcaI18n.t("归档失败"), result?.message || BcaI18n.t("未能保存视频信息。"), result?.details || "", true);
      } else {
        showNotice(BcaI18n.t("归档成功"), result?.message || BcaI18n.t("已保存视频信息和封面。"), result?.path || "", false, { label: BcaI18n.t("打开本地收藏库"), run: openLocalLibrary });
      }
    });
  }

  function waitForSuccessfulClose(dialog, data) {
    let finished = false;
    let timeout;
    let observer;
    const stop = () => {
      if (finished) return;
      finished = true;
      observer?.disconnect();
      clearTimeout(timeout);
      pendingStops.delete(stop);
    };
    observer = new MutationObserver(() => {
      if (finished) return;
      const style = dialog.isConnected ? getComputedStyle(dialog) : null;
      const closed = !dialog.isConnected || !style || style.display === "none" || style.visibility === "hidden" || Number(style.opacity || 1) <= 0.05;
      if (!closed) return;
      stop();
      if (!archiveEnabled) return;
      data.favoriteAt = Date.now();
      const signature = `${data.metadata.bvid}|${data.folders.map((folder) => folder.name).sort().join(",")}`;
      if (seen.has(signature)) return;
      seen.add(signature);
      if (seen.size > 100) seen.clear();
      sendFavorite(data);
    });
    observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "style", "aria-hidden"] });
    pendingStops.add(stop);
    timeout = window.setTimeout(stop, 10000);
  }

  document.addEventListener("click", (event) => {
    if (!archiveEnabled) return;
    const dialog = findFavoriteDialog(event);
    if (!dialog || !clickedConfirm(event, dialog)) return;
    if (Date.now() - lastConfirmAt < 700) return;
    lastConfirmAt = Date.now();
    const folders = selectedFolders(dialog);
    if (!folders.length) return;
    const data = { folders, metadata: getVideoMetadata() };
    waitForSuccessfulClose(dialog, data);
  }, true);
})();
