(function attachArchiveCore(global) {
  "use strict";

  const MEDIA_EXTENSIONS = new Set(["mp4", "mkv", "webm", "m4s", "flv", "mov", "avi"]);

  function safeCollectionName(value, fallback = "未分类收藏") {
    let name = String(value || "").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/[. ]+$/g, "").trim();
    if (!name || name === "." || name === "..") name = fallback;
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(name)) name = `_${name}`;
    return name.slice(0, 120) || fallback;
  }

  function withSourceCollection(parsedVideo, sourceItem = {}) {
    const video = parsedVideo && typeof parsedVideo === "object" ? parsedVideo : {};
    return {
      ...video,
      collection: safeCollectionName(sourceItem.collection || video.collection || "未分类收藏")
    };
  }

  function identifiersFromDirectoryName(name) {
    const identifiers = new Set();
    const text = String(name || "");
    const bvid = text.match(/(?:^| - )(BV[0-9A-Za-z]{10})(?: \(\d+\))?$/);
    const aid = text.match(/(?:^| - )av(\d+)(?: \(\d+\))?$/i);
    if (bvid) identifiers.add(`bvid:${bvid[1]}`);
    if (aid) identifiers.add(`aid:${aid[1]}`);
    return identifiers;
  }

  function downloadIndexKey(collection, identifier) {
    return `${collection || ""}\u0000${identifier}`;
  }

  function findDownloadMatch(collection, identifiers, index) {
    for (const identifier of identifiers || []) {
      const scoped = index.get(downloadIndexKey(collection, identifier));
      if (scoped) return scoped;
    }
    for (const identifier of identifiers || []) {
      const legacy = index.get(`legacy\u0000${identifier}`);
      if (legacy) return legacy;
    }
    return null;
  }

  function downloadStateFromIndex(collection, identifiers, index, previous = {}) {
    if (!(index instanceof Map)) {
      return {
        downloaded: Boolean(previous.downloaded),
        hasFiles: Boolean(previous.hasDownloadFiles),
        name: previous.downloadDirectoryName || "",
        collectionName: previous.downloadCollectionName || "",
        handle: previous.downloadDirectoryHandle || null
      };
    }
    const match = findDownloadMatch(collection, identifiers, index);
    return {
      downloaded: Boolean(match?.hasMedia),
      hasFiles: Boolean(match?.hasFiles),
      name: match?.name || "",
      collectionName: match?.collectionName || "",
      handle: match?.handle || null
    };
  }

  function isMediaFileName(name) {
    const extension = String(name || "").split(".").pop().toLowerCase();
    return MEDIA_EXTENSIONS.has(extension);
  }

  function normalizePathSegment(value) {
    return String(value || "").trim().replace(/^[\\/]+/, "").replace(/[\\/]+$/, "");
  }

  // 下载目录相对路径：“收藏夹\视频目录”。用于原生助手不可用时的手动打开提示。
  function downloadPathLabel(collectionName, directoryName) {
    return [normalizePathSegment(collectionName), normalizePathSegment(directoryName)].filter(Boolean).join("\\");
  }

  function joinDownloadPath(basePath, collectionName, directoryName) {
    const base = String(basePath || "").trim().replace(/[\\/]+$/, "");
    const label = downloadPathLabel(collectionName, directoryName);
    if (!base) return label;
    if (!label) return base;
    return `${base}\\${label}`;
  }

  /* ---------- 视频信息.txt 解析（4.1 从 library.js 移到这里，便于单元测试） ---------- */

  // 归档时字段缺失会写成这些占位值。它们不是真实内容，必须按“无数据”处理，
  // 否则详情面板会把“未知”“-”当成标签或简介显示出来。
  const INFO_PLACEHOLDERS = new Set(["", "无", "未知", "-", "--", "—", "暂无", "/", "N/A", "n/a", "null", "undefined"]);

  function isPlaceholderValue(value) {
    return INFO_PLACEHOLDERS.has(String(value ?? "").trim());
  }

  function fieldValue(info, key) {
    return info?.fields?.[key] || "";
  }

  function parseInfoFile(text) {
    const raw = String(text ?? "");
    const fields = {};
    const sections = {};
    let section = "基本信息";
    for (const line of raw.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").split("\n")) {
      const heading = line.match(/^【(.+?)】\s*$/);
      if (heading) { section = heading[1]; sections[section] ||= []; continue; }
      if (section === "视频简介") {
        if (line.trim()) sections[section].push(line);
        continue;
      }
      if (section === "标签") {
        if (line.trim() && !isPlaceholderValue(line)) {
          sections[section].push(...line.split(/[、,，]/).map((tag) => tag.trim()).filter((tag) => tag && !isPlaceholderValue(tag)));
        }
        continue;
      }
      const divider = line.indexOf("：") >= 0 ? line.indexOf("：") : line.indexOf(":");
      if (divider > 0) {
        const key = line.slice(0, divider).trim();
        const value = line.slice(divider + 1).trim();
        if (key) fields[key] = value;
      } else if (line.trim()) {
        sections[section] ||= [];
        sections[section].push(line.trim());
      }
    }
    return { fields, sections, raw };
  }

  // 只有整段简介都是占位符时才当作空，避免误伤正文里出现“-”的正常简介
  function descriptionFromInfo(info) {
    const text = (info?.sections?.["视频简介"]?.join("\n") || fieldValue(info, "视频简介") || "").trim();
    return isPlaceholderValue(text) ? "" : text;
  }

  function tagsFromInfo(info) {
    return (info?.sections?.["标签"] || []).filter((tag) => !isPlaceholderValue(tag));
  }

  /* ---------- 分页页码（4.1，参考 B 站：首尾各留一段，中间用省略号） ---------- */

  function pageSequence(current, total) {
    if (!Number.isFinite(total) || total <= 0) return [];
    if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
    const wanted = new Set([1, total, current, current - 1, current + 1]);
    if (current <= 3) [2, 3, 4].forEach((page) => wanted.add(page));
    if (current >= total - 2) [total - 1, total - 2, total - 3].forEach((page) => wanted.add(page));
    const pages = [...wanted].filter((page) => page >= 1 && page <= total).sort((left, right) => left - right);
    const sequence = [];
    let previous = 0;
    for (const page of pages) {
      if (previous && page - previous > 1) sequence.push("gap");
      sequence.push(page);
      previous = page;
    }
    return sequence;
  }

  /* ---------- B 站分享文案拆分（4.2） ----------
     B 站收藏夹接口的 intro 字段常常带一整套分享文案：
       <真正的简介>, 视频播放量 71953、弹幕量 82、点赞数 642、投硬币枚数 172、
       收藏人数 269、转发人数 10, 视频作者 XXX, 作者简介 YYY, 相关视频：...
     这些统计信息不该挤在简介里，这里把它拆出来单独成段。 */

  const SHARE_STATS_PATTERN = /视频播放量\s*([\d.]+)\s*[、,]?\s*弹幕量\s*([\d.]+)/;

  function parseShareStats(text) {
    const source = String(text ?? "");
    const stats = {};
    const patterns = {
      view: /视频播放量\s*([\d.]+)/,
      danmaku: /弹幕量\s*([\d.]+)/,
      like: /点赞数\s*([\d.]+)/,
      coin: /投硬币枚数\s*([\d.]+)/,
      favorite: /收藏人数\s*([\d.]+)/,
      share: /转发人数\s*([\d.]+)/
    };
    for (const [key, pattern] of Object.entries(patterns)) {
      const match = source.match(pattern);
      if (match) stats[key] = match[1];
    }
    return stats;
  }

  function splitShareText(text) {
    const source = String(text ?? "");
    const match = source.match(SHARE_STATS_PATTERN);
    if (!match) return { description: source.trim(), stats: parseShareStats(source), isShareText: false };
    const cut = source.slice(0, match.index).replace(/[\s,，、]+$/, "").trim();
    return { description: cut, stats: parseShareStats(source), isShareText: true };
  }

  /* ---------- 更新易变字段（4.4） ----------
     「更新视频状态」只覆盖会变化的数值（UP主粉丝数、互动数据、缺失的发布时间）
     与失效标记，其余内容逐字不动。做成长度可控的纯函数便于单元测试。 */

  const STAT_KEYS = ["view", "danmaku", "like", "coin", "favorite", "share"];
  const STAT_LABELS = { view: "播放量", danmaku: "弹幕量", like: "点赞数", coin: "投硬币枚数", favorite: "收藏人数", share: "转发人数" };
  const SECTION_HEADING_PATTERN = /^【.+?】\s*$/;

  function statsSectionLines(stats) {
    return ["【互动数据】", ...STAT_KEYS.map((key) => `${STAT_LABELS[key]}：${isPlaceholderValue(stats?.[key]) ? "未知" : String(stats[key])}`)];
  }

  function patchVolatileFields(text, options = {}) {
    const source = String(text ?? "");
    const newline = source.includes("\r\n") ? "\r\n" : "\n";
    const lines = source.split(/\r?\n/);

    const fieldIndex = (key) => lines.findIndex((line) => line.startsWith(`${key}：`));
    const setField = (key, value) => {
      const index = fieldIndex(key);
      if (index < 0) return false;
      lines[index] = `${key}：${value}`;
      return true;
    };

    if (!isPlaceholderValue(options.upFans)) {
      // 老档案没有「UP主粉丝数」这一行，要补在 UID 后面
      if (!setField("UP主粉丝数", String(options.upFans))) {
        const anchor = fieldIndex("UP主UID") >= 0 ? fieldIndex("UP主UID") : fieldIndex("UP主昵称");
        if (anchor >= 0) lines.splice(anchor + 1, 0, `UP主粉丝数：${options.upFans}`);
      }
    }

    // 发布时间只补空缺，已经有值的不动
    if (options.pubdateText) {
      const current = (lines[fieldIndex("视频发布时间")] || "").replace(/^视频发布时间：/, "");
      if (isPlaceholderValue(current)) setField("视频发布时间", String(options.pubdateText));
    }

    if (options.stats && Object.keys(options.stats).length) {
      const block = statsSectionLines(options.stats);
      const headingIndex = lines.findIndex((line) => line.trim() === "【互动数据】");
      if (headingIndex >= 0) {
        let end = headingIndex + 1;
        while (end < lines.length && !SECTION_HEADING_PATTERN.test(lines[end].trim())) end += 1;
        // 连同块尾空行一起替换，保持与下一区块之间的空行
        lines.splice(headingIndex, end - headingIndex, ...block, "");
      } else {
        const tagIndex = lines.findIndex((line) => line.trim() === "【标签】");
        lines.splice(tagIndex >= 0 ? tagIndex : lines.length, 0, ...block, "");
      }
    }

    if (options.videoStatus) {
      if (!setField("视频状态", String(options.videoStatus))) {
        const linkIndex = fieldIndex("视频链接");
        if (linkIndex >= 0) lines.splice(linkIndex + 1, 0, `视频状态：${options.videoStatus}`);
      }
    }

    return lines.join(newline);
  }

  const api = Object.freeze({
    safeCollectionName,
    withSourceCollection,
    identifiersFromDirectoryName,
    downloadIndexKey,
    findDownloadMatch,
    downloadStateFromIndex,
    isMediaFileName,
    downloadPathLabel,
    joinDownloadPath,
    isPlaceholderValue,
    parseInfoFile,
    descriptionFromInfo,
    tagsFromInfo,
    pageSequence,
    splitShareText,
    parseShareStats,
    patchVolatileFields
  });
  global.BcaArchiveCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis);
