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

  const api = Object.freeze({
    safeCollectionName,
    withSourceCollection,
    identifiersFromDirectoryName,
    downloadIndexKey,
    findDownloadMatch,
    downloadStateFromIndex,
    isMediaFileName,
    downloadPathLabel,
    joinDownloadPath
  });
  global.BcaArchiveCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis);
