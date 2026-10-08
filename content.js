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

  function showNotice(title, message, details, isError) {
    document.getElementById("bili-fav-archiver-host")?.remove();
    const host = document.createElement("div");
    host.id = "bili-fav-archiver-host";
    const shadow = host.attachShadow({ mode: "closed" });
    const box = document.createElement("section");
    box.setAttribute("role", "status");
    box.style.cssText = [
      "position:fixed", "z-index:2147483647", "right:24px", "bottom:24px", "width:min(390px,calc(100vw - 32px))",
      "box-sizing:border-box", "padding:18px 20px", "border-radius:12px", "background:#fff", "color:#202124",
      "box-shadow:0 8px 32px rgba(0,0,0,.24)", "font:14px/1.5 system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"
    ].join(";");
    const heading = document.createElement("div");
    heading.textContent = title;
    heading.style.cssText = `font-size:16px;font-weight:700;margin:0 28px 8px 0;color:${isError ? "#b3261e" : "#16794b"}`;
    const body = document.createElement("div");
    body.textContent = message;
    const detail = document.createElement("pre");
    detail.textContent = details || "";
    detail.style.cssText = "white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.45 inherit;color:#5f6368;margin:8px 0 0;max-height:110px;overflow:auto";
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "×";
    close.setAttribute("aria-label", "关闭");
    close.style.cssText = "position:absolute;right:12px;top:8px;border:0;background:transparent;font-size:24px;line-height:1;color:#666;cursor:pointer";
    close.addEventListener("click", () => host.remove());
    box.append(heading, body);
    if (details) box.append(detail);
    box.append(close);
    shadow.append(box);
    (document.documentElement || document.body).append(host);
    window.setTimeout(() => host.remove(), 9000);
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
        showNotice("归档成功", result.message || "已保存视频信息和封面。", result.path || "", false);
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
