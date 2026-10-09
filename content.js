(() => {
  const seen = new Set();
  const pendingStops = new Set();
  let lastConfirmAt = 0;
  let archiveEnabled = false;
  let enabledStateUpdated = false;

  chrome.storage.local.get("enabled").then(({ enabled }) => {
    if (!enabledStateUpdated) archiveEnabled = enabled !== false;
  }).catch(() => {});

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes.enabled) return;
    enabledStateUpdated = true;
    archiveEnabled = changes.enabled.newValue !== false;
    if (!archiveEnabled) for (const stop of [...pendingStops]) stop();
  });

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
    :host {
      --surface: #ffffff; --surface-soft: #f7f9fc; --line: #e2e8f0;
      --text: #3c4552; --muted: #5f6875; --faint: #858d9a;
      --tone: #2f9068; --tone-soft: #ecf7f1; --ring: #00a1d62e;
    }
    .notice {
      position: fixed; z-index: 2147483647; right: 24px; bottom: 24px;
      width: min(392px, calc(100vw - 32px)); box-sizing: border-box;
      padding: 15px 17px; border: 1px solid var(--line); border-radius: 14px;
      background: var(--surface); color: var(--text);
      box-shadow: 0 18px 48px #1018282e;
      font: 13px/1.65 system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
      animation: bca-slide-in .22s cubic-bezier(.2, .8, .2, 1) both;
      text-align: left;
    }
    .notice.error { --tone: #c9483f; --tone-soft: #fdf1ef; }
    @keyframes bca-slide-in { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
    .head { display: flex; align-items: center; gap: 8px; margin: 0 26px 5px 0; color: var(--tone); font-size: 15px; font-weight: 700; }
    .mark { display: grid; place-items: center; width: 22px; height: 22px; flex: 0 0 22px; border-radius: 7px; background: var(--tone-soft); }
    .body { color: var(--text); }
    .details { margin: 9px 0 0; padding: 8px 10px; max-height: 118px; overflow: auto; border-radius: 8px; background: var(--surface-soft); color: var(--muted); font: 12px/1.6 ui-monospace, Consolas, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }
    .actions { display: flex; gap: 8px; margin-top: 12px; }
    .action { display: inline-flex; align-items: center; gap: 5px; min-height: 32px; padding: 0 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); color: var(--text); font-size: 12px; font-weight: 600; text-decoration: none; cursor: pointer; }
    .action:hover { border-color: #bfe5f2; color: #026f95; background: #e9f7fc; }
    .action.primary { border-color: transparent; background: #00a1d6; color: #fff; }
    .action.primary:hover { background: #0089b8; color: #fff; }
    .close { position: absolute; right: 9px; top: 9px; display: grid; place-items: center; width: 26px; height: 26px; border: 0; border-radius: 7px; background: transparent; color: var(--faint); font-size: 17px; line-height: 1; cursor: pointer; }
    .close:hover { background: var(--tone-soft); color: var(--tone); }
    @media (prefers-color-scheme: dark) {
      :host { --surface: #1b2027; --surface-soft: #232a33; --line: #2f3843; --text: #dde3ea; --muted: #a3adba; --faint: #7d8794; --tone: #4fbf8d; --tone-soft: #1d2c26; }
      .notice { box-shadow: 0 18px 48px #00000080; }
      .notice.error { --tone: #ef7f76; --tone-soft: #35211f; }
      .action:hover { border-color: #2f4a57; background: #22303a; color: #7fd8f5; }
    }
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
    titleText.textContent = title;
    heading.append(mark, titleText);

    const body = document.createElement("div");
    body.className = "body";
    body.textContent = message;

    const close = document.createElement("button");
    close.type = "button";
    close.className = "close";
    close.textContent = "×";
    close.setAttribute("aria-label", "关闭");
    close.addEventListener("click", () => host.remove());

    box.append(heading, body);
    if (details) {
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
      button.textContent = primaryAction.label;
      button.addEventListener("click", () => { primaryAction.run(); host.remove(); });
      actions.append(button);
      box.append(actions);
    }
    box.append(close);
    shadow.append(style, box);
    (document.documentElement || document.body).append(host);

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
    showNotice("正在归档视频…", "B站已完成收藏，正在保存视频信息和封面。", "", false);
    chrome.runtime.sendMessage({ type: "save-favorite", data }, (result) => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) {
        showNotice("归档失败", "插件后台暂时无法处理这次收藏。", runtimeError.message, true);
      } else if (!result?.ok) {
        showNotice("归档失败", result?.message || "未能保存视频信息。", result?.details || "", true);
      } else {
        showNotice("归档成功", result.message || "已保存视频信息和封面。", result.path || "", false, { label: "打开本地收藏库", run: openLocalLibrary });
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
