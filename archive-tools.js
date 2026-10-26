"use strict";

/* 1.9.0（设置页集中管理归档工具）：归档目录的读写规矩都收在这一份里 —— 收藏库扫描、
   设置页的归档体检 / 导出元数据、回收站页共用同一套「怎么读一条记录、怎么挪一个目录」。
   它只碰 FSA 句柄和文本，不碰任何页面状态；两边要的东西不一样时，由页面自己拼。

   为什么放在单独一个文件：这些逻辑原来只在 library.js 里，1.9.0 把归档体检和回收站
   搬进设置页后它们要在两个页面里跑。抄一份等于同一件事有两处判断，改一处漏一处
   就会让两个页面看到不一样的归档。 */

(function (global) {
  const BcaArchiveCore = global.BcaArchiveCore;

  /* 固定目录：收藏库不把它们当收藏夹，体检也不进去数记录。
     1.14.1（审查 C-1）：名单不再各写一份，直接引用 archive-core 的权威数组 ——
     那边管「新建收藏夹时不许占用」，这里管扫描，两边必须认同一批名字。 */
  const RESERVED_DIRS = BcaArchiveCore.RESERVED_COLLECTION_NAMES;

  /* 记录目录名的唯一判据：扫描、删除前清点、回收站页都要认同一批目录名。 */
  const RECORD_DIRECTORY_PATTERN = /^\d{4}年\d{1,2}月\d{1,2}日\d{1,2}时\d{1,2}分\d{1,2}秒(?:_\d+)?$/;

  const RECYCLE_DIR_NAME = "005回收站";
  const RECYCLE_KEEP_DAYS = 30;
  const RECYCLE_RETENTION_MS = RECYCLE_KEEP_DAYS * 24 * 60 * 60 * 1000;
  const HEALTH_DIR_NAME = "006报告";
  const HEALTH_REPORT_LIST_LIMIT = 20;

  function isRecordDirectoryName(name) {
    return RECORD_DIRECTORY_PATTERN.test(String(name || ""));
  }

  function recycleStamp(date = new Date()) {
    const pad = (value) => String(value).padStart(2, "0");
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  }

  /* 从回收站的时间戳目录名反推「什么时候删的」。格式不认识就返回 0（页面上显示「时间未知」）。 */
  function stampTime(name) {
    const match = String(name || "").match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/);
    if (!match) return 0;
    return new Date(+match[1], +match[2] - 1, +match[3], +match[4], +match[5], +match[6]).getTime();
  }

  function formatMegabytes(bytes) {
    return `${(Number(bytes || 0) / 1024 / 1024).toFixed(1)} MB`;
  }

  function reportListLine(items) {
    if (!items.length) return [global.BcaI18n ? global.BcaI18n.t("- 没有") : "- 没有"];
    const lines = items.slice(0, HEALTH_REPORT_LIST_LIMIT).map((item) => `- ${item}`);
    if (items.length > HEALTH_REPORT_LIST_LIMIT) {
      lines.push(global.BcaI18n ? global.BcaI18n.t("- …还有 {count} 条，见归档目录", { count: items.length - HEALTH_REPORT_LIST_LIMIT }) : `- …还有 ${items.length - HEALTH_REPORT_LIST_LIMIT} 条，见归档目录`);
    }
    return lines;
  }

  async function subdirectoryHandle(parent, name, create = true) {
    return parent.getDirectoryHandle(name, { create });
  }

  async function directoryIsEmpty(directory) {
    for await (const _entry of directory.values()) { void _entry; return false; }
    return true;
  }

  async function copyFileHandle(source, targetDirectory) {
    const file = await source.getFile();
    const writable = await (await targetDirectory.getFileHandle(source.name, { create: true })).createWritable();
    await writable.write(file);
    await writable.close();
  }

  async function copyDirectoryTree(source, target) {
    for await (const entry of source.values()) {
      if (entry.kind === "directory") await copyDirectoryTree(entry, await subdirectoryHandle(target, entry.name));
      else await copyFileHandle(entry, target);
    }
  }

  async function directoryFingerprint(directory, prefix = "") {
    const rows = [];
    for await (const entry of directory.values()) {
      const label = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.kind === "directory") rows.push(...await directoryFingerprint(entry, label));
      else rows.push(`${label}:${(await entry.getFile()).size}`);
    }
    return rows.sort();
  }

  /* 挪目录：优先 handle.move()（一次换名、零复制）；本机不支持时退回
     「复制 → 逐文件比字节 → 才删源」，与搬归档的规矩一致。 */
  async function moveDirectoryInto(sourceHandle, sourceParent, sourceName, targetParent, targetName) {
    if (typeof sourceHandle.move === "function") {
      try {
        await sourceHandle.move(targetParent, targetName);
        return "moved";
      } catch (error) {
        console.warn("目录 move() 用不了（多半是本机不支持），改用复制 + 校验 + 删源", error);
      }
    }
    const target = await subdirectoryHandle(targetParent, targetName);
    await copyDirectoryTree(sourceHandle, target);
    const before = await directoryFingerprint(sourceHandle);
    const after = await directoryFingerprint(target);
    if (before.join("|") !== after.join("|")) throw new Error(global.BcaI18n ? global.BcaI18n.t("复制到回收站后校验不一致，源目录没有删除。") : "复制到回收站后校验不一致，源目录没有删除。");
    await sourceParent.removeEntry(sourceName, { recursive: true });
    return "copied";
  }

  async function optionalFileHandle(directory, name) {
    try { return await directory.getFileHandle(name); }
    catch (error) {
      if (BcaArchiveCore.isMissingError(error)) return null;
      throw error;
    }
  }

  /* 区分「目录没写完」和「目录内容有问题」：写入顺序是先建目录、再写封面、最后写
     视频信息.txt，所以缺 txt 而目录不空 = 导入写到一半被打断。完全空的目录不算，
     那可能只是用户自己刚建的。 */
  async function isUnfinishedRecord(recordEntry) {
    const infoHandle = await optionalFileHandle(recordEntry, "视频信息.txt");
    if (infoHandle) return false;
    for await (const entry of recordEntry.values()) {
      if (entry.kind === "file" || entry.kind === "directory") return true;
    }
    return false;
  }

  /* 读一条记录目录。调用方给的可选项：
     - diagnostics：四类问题分类收集（缺 txt / 缺封面 / 缺基本信息 / 点号 .tmp）
     - cache：收藏库的 LRU 缓存（Map，带 cacheLimit / growing），命中即复用
     - stats：{ hits, reads, bytes }，命中与读取都记一笔，体积统计复用它
     - onEvict：缓存淘汰某条时交还它持有的封面引用（收藏库用；回收站页不传）
     返回 null 表示「这不是一条能显示的归档记录」，原因已进 diagnostics。 */
  async function readRecord(collectionName, recordEntry, options = {}) {
    const diagnostics = options.diagnostics || null;
    const cache = options.cache || null;
    const stats = options.stats || null;
    const onEvict = options.onEvict || null;
    const cacheName = `${collectionName}/${recordEntry.name}`;
    const children = [];
    try {
      for await (const child of recordEntry.values()) children.push(child);
    } catch (error) {
      console.warn("读不了这个记录目录（当作不是归档记录）", error);
      return null;
    }
    const label = `${collectionName}/${recordEntry.name}`;
    if (diagnostics) {
      for (const child of children) {
        if (child.kind === "file" && /^\./.test(child.name) && /\.tmp$/i.test(child.name)) diagnostics.tempFiles.push(`${label}/${child.name}`);
      }
    }
    const infoHandle = children.find((child) => child.kind === "file" && child.name === "视频信息.txt");
    if (!infoHandle) {
      if (diagnostics) diagnostics.missingText.push(label);
      return null;
    }
    const coverEntry = children.find((child) => child.kind === "file" && child.name === "封面.webp")
      || children.find((child) => child.kind === "file" && child.name === "封面.png");
    // 一条记录目录只 getFile 一次：metadata 与正文都用同一份
    const meta = await infoHandle.getFile();
    const cached = cacheEntryFor(cache, cacheName, meta.size, meta.lastModified);
    if (cached && coverEntry) {
      if (stats) stats.hits += 1;
      if (stats) stats.bytes += cached.bytes || meta.size;
      return Object.assign({}, cached, { cover: "", coverEntry });
    }
    const raw = await meta.text();
    if (!raw.includes("【基本信息】")) {
      if (diagnostics) diagnostics.brokenText.push(label);
      return null;
    }
    const info = BcaArchiveCore.parseInfoFile(raw);
    const field = (name) => (info.fields && info.fields[name]) || "";
    if (!field("视频标题")) {
      if (diagnostics) diagnostics.brokenText.push(`${label}（没有标题）`);
      return null;
    }
    if (!coverEntry) {
      if (diagnostics) diagnostics.missingCover.push(label);
      return null;
    }
    const coverBytes = (await coverEntry.getFile()).size;
    const share = splitDescription(info);
    const record = { info, share, savedAt: field("信息保存于"), cover: "", coverEntry, coverBytes, bytes: meta.size + coverBytes };
    storeCacheEntry(cache, cacheName, meta.size, meta.lastModified, record, onEvict);
    if (stats) {
      stats.reads += 1;
      stats.bytes += record.bytes;
    }
    return record;
  }

  function splitDescription(info) {
    /* 1.9.4（用户报「txt 里明明有视频简介，详情却显示『这个归档没有记录简介』」）：
       简介解析出来放在 info.sections 里，info.fields 里没有这一项 —— 1.9.0 起这里一直读的是空，
       于是每条记录的详情都退化成「没有记录简介」。统一走 archive-core 的 descriptionFromInfo()。
       旧版本还会把 B 站页面 meta 的分享文案（标题 + 播放量 + UP 主简介 + 相关视频标题）当简介存进 txt，
       所以这里再判两道：分享文案、以及「简介就是标题」，都不算真简介 —— 详情显示「没有记录简介」才对。 */
    const raw = BcaArchiveCore.descriptionFromInfo(info);
    if (!raw) return { description: "", stats: {} };
    const split = BcaArchiveCore.splitShareText(raw);
    const title = (info.fields && info.fields["视频标题"]) || "";
    const description = split.isShareText || (title && split.description === title) ? "" : split.description;
    return { description, stats: split.stats || {} };
  }

  function cacheEntryFor(store, name, size, lastModified) {
    if (!store) return null;
    const entry = store.get(name);
    if (!entry || entry.size !== size || entry.lastModified !== lastModified) return null;
    // 命中就算「刚用过」：Map 保持插入序，把它挪到末尾，扫描到后面时不会被当成最旧的淘汰
    store.delete(name);
    store.set(name, entry);
    return entry.record;
  }

  function storeCacheEntry(store, name, size, lastModified, record, onEvict) {
    if (!store) return;
    const existing = store.get(name);
    if (existing) {
      store.delete(name);
      if (onEvict) onEvict(existing);
    }
    /* 4.9：原来是 store.clear() —— 大库每轮扫描都从零重读，而且被清掉的封面 blob: URL
       再没人 revoke。改成按插入序淘汰最旧的（配合 cacheEntryFor 的「命中即刷新位置」），
       一次淘汰一批（25%），容量按库大小算。 */
    const cacheLimit = store.growing
      ? BcaArchiveCore.archiveCacheCapacity(store.size + 1)
      : store.cacheLimit || BcaArchiveCore.archiveCacheCapacity(0);
    if (store.size >= cacheLimit) {
      const dropCount = BcaArchiveCore.archiveCacheDropCount(cacheLimit);
      for (let dropIndex = 0; dropIndex < dropCount; dropIndex += 1) {
        const oldestKey = store.keys().next().value;
        if (oldestKey === undefined) break;
        const oldest = store.get(oldestKey);
        store.delete(oldestKey);
        if (onEvict) onEvict(oldest);
      }
    }
    store.set(name, { size, lastModified, record });
  }

  /* 整库盘一遍：设置页的归档体检与「导出归档元数据」用它。收藏库自己的 scanRoot 还要
     并发、缓存、进度、下载索引，所以不共用这一层；但每条记录的读取走上面的 readRecord。 */
  async function scanArchive(root, options = {}) {
    const diagnostics = options.diagnostics ? { missingText: [], missingCover: [], brokenText: [], tempFiles: [] } : null;
    const collections = [];
    const issues = [];
    const unfinished = [];
    const longNames = [];
    const collectionEntries = [];
    for await (const entry of root.values()) {
      if (entry.kind !== "directory") continue;
      if (RESERVED_DIRS.includes(entry.name)) continue;
      collectionEntries.push(entry);
    }
    collectionEntries.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
    let bytes = 0;
    let recordCount = 0;
    for (const collectionEntry of collectionEntries) {
      const records = [];
      for await (const recordEntry of collectionEntry.values()) {
        if (recordEntry.kind !== "directory" || !isRecordDirectoryName(recordEntry.name)) continue;
        const label = `${collectionEntry.name}/${recordEntry.name}`;
        if (collectionEntry.name.length + 1 + recordEntry.name.length > BcaArchiveCore.PATH_SEGMENT_BUDGET_CHARS) longNames.push(label);
        recordCount += 1;
        if (options.onProgress) options.onProgress(recordCount, label);
        try {
          const record = await readRecord(collectionEntry.name, recordEntry, { diagnostics });
          if (!record) {
            if (await isUnfinishedRecord(recordEntry)) unfinished.push(label);
            continue;
          }
          bytes += record.bytes;
          records.push({ directory: recordEntry.name, record });
        } catch (error) {
          issues.push(`${label}：${error?.message || (global.BcaI18n ? global.BcaI18n.t("读取失败") : "读取失败")}`);
        }
      }
      collections.push({ name: collectionEntry.name, records });
    }
    return { collections, issues, unfinished, longNames, diagnostics, bytes, recordCount };
  }

  /* 删除 → 回收站 的三条路径（收藏夹 / 单条 / 批量）都走这里，回收站页恢复也走它。 */
  async function recycleCollection(root, collectionName) {
    const source = await root.getDirectoryHandle(collectionName, { create: false });
    const stamp = recycleStamp();
    const bucket = await subdirectoryHandle(root, RECYCLE_DIR_NAME);
    const stampDir = await subdirectoryHandle(bucket, stamp);
    const path = `${RECYCLE_DIR_NAME}/${stamp}/${collectionName}`;
    await moveDirectoryInto(source, root, collectionName, stampDir, collectionName);
    return path;
  }

  async function recycleRecords(root, items, onProgress) {
    const stamp = recycleStamp();
    const bucket = await subdirectoryHandle(root, RECYCLE_DIR_NAME);
    const stampDir = await subdirectoryHandle(bucket, stamp);
    const moved = [];
    for (const item of items) {
      if (onProgress) onProgress(item);
      const collectionHandle = await root.getDirectoryHandle(item.collection, { create: false });
      const source = await collectionHandle.getDirectoryHandle(item.directory, { create: false });
      const collectionDir = await subdirectoryHandle(stampDir, item.collection);
      let name = item.directory;
      for (let attempt = 2; ; attempt += 1) {
        let exists = false;
        try {
          await collectionDir.getDirectoryHandle(name, { create: false });
          exists = true;
        } catch (error) {
          if (!BcaArchiveCore.isMissingError(error)) throw error;
        }
        if (!exists) break;
        name = `${item.directory}-${attempt}`;
      }
      await moveDirectoryInto(source, collectionHandle, item.directory, collectionDir, name);
      moved.push({ ...item, name, path: `${RECYCLE_DIR_NAME}/${stamp}/${item.collection}/${name}` });
    }
    return { stamp, moved };
  }

  async function pruneRecycler(root) {
    let bucket;
    try {
      bucket = await root.getDirectoryHandle(RECYCLE_DIR_NAME, { create: false });
    } catch (error) {
      if (BcaArchiveCore.isMissingError(error)) return 0;
      console.warn("回收站读不出来（这次的过期清理先跳过）", error);
      return 0;
    }
    const now = Date.now();
    let removed = 0;
    for await (const entry of bucket.values()) {
      if (entry.kind !== "directory") continue;
      const at = stampTime(entry.name);
      // 1.13.1（审查 P0-1）：stampTime 对认不出的名字返回 0 —— 那是「页面上显示成时间未知」的兜底值，
      //   不是「已经过期」。以前写的是 `if (at && …)`，于是改名过的目录 at=0 → 判据为假 → 直接递归删除，
      //   下一次扫描（打开收藏库/刷新）就没了，而且不进系统回收站。这里必须是反向判断：认不出就留下。
      if (!at || now - at < RECYCLE_RETENTION_MS) continue;
      try {
        await bucket.removeEntry(entry.name, { recursive: true });
        removed += 1;
      } catch (error) {
        console.warn(`清理过期回收站目录 ${entry.name} 失败（下次还会再试）`, error);
      }
    }
    return removed;
  }

  async function purgeRecycler(root) {
    let bucket;
    try {
      bucket = await root.getDirectoryHandle(RECYCLE_DIR_NAME, { create: false });
    } catch (error) {
      if (BcaArchiveCore.isMissingError(error)) return { removed: 0, failures: [] };
      throw error;
    }
    let removed = 0;
    const failures = [];
    for await (const entry of bucket.values()) {
      try {
        await bucket.removeEntry(entry.name, { recursive: true });
        removed += 1;
      } catch (error) {
        failures.push(`${entry.name}：${error?.message || (global.BcaI18n ? global.BcaI18n.t("删除失败") : "删除失败")}`);
      }
    }
    return { removed, failures };
  }

  /* 回收站页：列出 005回收站/<时间戳>/<收藏夹>/<目录> 里的记录（越新越靠前）。 */
  async function listRecycled(root) {
    const entries = [];
    let bucket;
    try {
      bucket = await root.getDirectoryHandle(RECYCLE_DIR_NAME, { create: false });
    } catch (error) {
      if (BcaArchiveCore.isMissingError(error)) return entries;
      throw error;
    }
    for await (const stampEntry of bucket.values()) {
      if (stampEntry.kind !== "directory") continue;
      const deletedAt = stampTime(stampEntry.name);
      for await (const collectionEntry of stampEntry.values()) {
        if (collectionEntry.kind !== "directory") continue;
        for await (const recordEntry of collectionEntry.values()) {
          if (recordEntry.kind !== "directory") continue;
          let record = null;
          try {
            record = await readRecord(collectionEntry.name, recordEntry);
          } catch (error) {
            console.warn(`回收站里的这一项读不出来：${collectionEntry.name}/${recordEntry.name}`, error);
          }
          entries.push({
            stamp: stampEntry.name,
            deletedAt,
            collection: collectionEntry.name,
            directory: recordEntry.name,
            path: `${RECYCLE_DIR_NAME}/${stampEntry.name}/${collectionEntry.name}/${recordEntry.name}`,
            record
          });
        }
      }
    }
    entries.sort((a, b) => (b.deletedAt - a.deletedAt) || a.path.localeCompare(b.path, "zh-CN"));
    return entries;
  }

  async function uniqueRestoreName(collectionDirectory, directoryName) {
    let name = directoryName;
    for (let attempt = 2; ; attempt += 1) {
      let exists = false;
      try {
        await collectionDirectory.getDirectoryHandle(name, { create: false });
        exists = true;
      } catch (error) {
        if (!BcaArchiveCore.isMissingError(error)) throw error;
      }
      if (!exists) return name;
      name = `${directoryName}-${attempt}`;
    }
  }

  /* 恢复：把每条记录挪回 归档根/<收藏夹>/<目录>。同名目录已存在就追加 -2/-3，
     绝不覆盖用户现有的记录。 */
  async function restoreRecycled(root, entries, onProgress) {
    const restored = [];
    const failures = [];
    let bucket = null;
    try {
      bucket = await root.getDirectoryHandle(RECYCLE_DIR_NAME, { create: false });
    } catch (error) {
      if (BcaArchiveCore.isMissingError(error)) return { restored, failures };
      throw error;
    }
    for (const entry of entries) {
      if (onProgress) onProgress(entry);
      try {
        const stampDir = await subdirectoryHandle(bucket, entry.stamp, false);
        const collectionDir = await subdirectoryHandle(stampDir, entry.collection, false);
        const source = await collectionDir.getDirectoryHandle(entry.directory, { create: false });
        const targetCollection = await subdirectoryHandle(root, entry.collection);
        const name = await uniqueRestoreName(targetCollection, entry.directory);
        await moveDirectoryInto(source, collectionDir, entry.directory, targetCollection, name);
        restored.push({ ...entry, restoredName: name });
        if (await directoryIsEmpty(collectionDir)) await stampDir.removeEntry(entry.collection, { recursive: true }).catch(() => {});
        if (await directoryIsEmpty(stampDir)) await bucket.removeEntry(entry.stamp, { recursive: true }).catch(() => {});
      } catch (error) {
        if (BcaArchiveCore.isMissingError(error)) {
          failures.push(global.BcaI18n ? global.BcaI18n.t("{path}：已经不在回收站里了。", { path: entry.path }) : `${entry.path}：已经不在回收站里了。`);
        } else {
          failures.push(`${entry.path}：${error?.message || (global.BcaI18n ? global.BcaI18n.t("恢复失败") : "恢复失败")}`);
        }
      }
    }
    return { restored, failures };
  }

  /* 彻底删除：从回收站里删掉指定记录（不可逆）。删完顺手清掉空掉的时间戳目录。 */
  async function deleteRecycled(root, entries, onProgress) {
    let removed = 0;
    const failures = [];
    let bucket = null;
    try {
      bucket = await root.getDirectoryHandle(RECYCLE_DIR_NAME, { create: false });
    } catch (error) {
      if (BcaArchiveCore.isMissingError(error)) return { removed, failures };
      throw error;
    }
    for (const entry of entries) {
      if (onProgress) onProgress(entry);
      try {
        const stampDir = await subdirectoryHandle(bucket, entry.stamp, false);
        const collectionDir = await subdirectoryHandle(stampDir, entry.collection, false);
        await collectionDir.removeEntry(entry.directory, { recursive: true });
        removed += 1;
        if (await directoryIsEmpty(collectionDir)) await stampDir.removeEntry(entry.collection, { recursive: true }).catch(() => {});
        if (await directoryIsEmpty(stampDir)) await bucket.removeEntry(entry.stamp, { recursive: true }).catch(() => {});
      } catch (error) {
        if (BcaArchiveCore.isMissingError(error)) {
          failures.push(global.BcaI18n ? global.BcaI18n.t("{path}：已经不在回收站里了。", { path: entry.path }) : `${entry.path}：已经不在回收站里了。`);
        } else {
          failures.push(`${entry.path}：${error?.message || (global.BcaI18n ? global.BcaI18n.t("删除失败") : "删除失败")}`);
        }
      }
    }
    return { removed, failures };
  }

  /* 归档根句柄存在 IndexedDB（DB_NAME / DB_STORE / 键 "rootHandle"）里，收藏库与设置页
     读的是同一份。键名与库名必须与 library.js 顶部一致 —— stability 有守卫钉着。 */
  const ROOT_DB_NAME = "bili-fav-archiver";
  const ROOT_DB_STORE = "settings";
  const ROOT_DB_KEY = "rootHandle";

  async function loadRootHandle() {
    if (!global.indexedDB) return null;
    return new Promise((resolve) => {
      const request = global.indexedDB.open(ROOT_DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(ROOT_DB_STORE)) request.result.createObjectStore(ROOT_DB_STORE);
      };
      request.onerror = () => resolve(null);
      request.onsuccess = () => {
        const db = request.result;
        try {
          const read = db.transaction(ROOT_DB_STORE, "readonly").objectStore(ROOT_DB_STORE).get(ROOT_DB_KEY);
          read.onerror = () => resolve(null);
          read.onsuccess = () => { resolve(read.result || null); db.close(); };
        } catch (_) {
          resolve(null);
          db.close();
        }
      };
    });
  }

  /* 句柄还在，但权限可能被浏览器收回（重启、长时间没用）。query 不弹窗，request 才弹，
     所以调用点必须在用户点击的同一轮里。 */
  async function ensureRootPermission(handle, mode = "readwrite") {
    if (!handle || typeof handle.queryPermission !== "function") return Boolean(handle);
    const options = { mode };
    try {
      if (await handle.queryPermission(options) === "granted") return true;
      return await handle.requestPermission(options) === "granted";
    } catch (error) {
      console.warn("请求本地备份文件夹权限失败", error);
      return false;
    }
  }

  /* 记录 → 视频对象（1.9.0）：收藏库列表、设置页的元数据导出、回收站页的卡片，
     读的都是同一条记录，映射只留这一份。downloadIndex / previous 只有收藏库扫描会传
     （它还要管「下载文件夹」），别的页面传空对象即可。 */
  const BILIBILI_LINK_HOSTS = ["bilibili.com", "b23.tv"];
  function field(info, key) { return info.fields[key] || ""; }

  // 「未知 / 无 / -」这类占位值等于没有数据，不能当成内容显示
  function realField(info, key) {
    const value = field(info, key);
    return value && !BcaArchiveCore.isPlaceholderValue(value) ? value : "";
  }

  function invalidReasonText(reason) {
    const text = String(reason || "").trim();
    if (!text) return "";
    switch (text) {
      case "其他": return BcaI18n.t("其他");
      case "版权原因": return BcaI18n.t("版权原因");
      case "违规内容": return BcaI18n.t("违规内容");
      case "视频已失效": return BcaI18n.t("视频已失效");
      case "UP主自行删除": return BcaI18n.t("UP主自行删除");
      case "已锁定": return BcaI18n.t("已锁定");
      // 表外的值（将来 B 站新增枚举）原样显示，不吞掉、也不冒充「其他」
      default: return text;
    }
  }

  function statsFromInfo(info, fallbackStats = {}) {
    const stats = {};
    // 1.9.5（用户要求 3）：缺失的互动数据统一记 N/A ——
    // 老版本「没抓到就整段不写」的做法，界面上完全看不出这条能不能补。
    for (const [key, label] of Object.entries(BcaArchiveCore.STAT_LABELS)) {
      const raw = field(info, label) || String(fallbackStats[key] || "");
      const text = String(raw || "").trim();
      stats[key] = !text || BcaArchiveCore.isPlaceholderValue(text) ? "N/A" : text;
    }
    return stats;
  }

  function bilibiliLink(value) {
    const text = String(value ?? "").trim();
    let parsed;
    try {
      parsed = new URL(text);
    } catch (_) {
      return "";
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return "";
    const host = parsed.hostname.toLowerCase();
    return BILIBILI_LINK_HOSTS.some((suffix) => host === suffix || host.endsWith(`.${suffix}`)) ? text : "";
  }

  // 1.14.2（审查 C-2）：中文时间解析只有 archive-core.js 那一份，这里只做转发
  function parseDate(value, fallback) {
    return BcaArchiveCore.parseArchiveDateTime(value, fallback);
  }

  /* 1.14.2（审查 C-4 尾巴）：一条记录是不是失效视频，判据也只有一处。
     回收站页原来自己写了一份「视频状态里有『失效』」的判断，与扫描这边的
     「状态有『失效』**或**标题是已知占位」并不等价 —— 同一张卡片在两个页面可能一个显示
     失效徽标、一个不显示。 */
  function isInvalidRecord(record) {
    const info = record?.info;
    if (!info) return false;
    return /失效/.test(field(info, "视频状态")) || BcaArchiveCore.isInvalidVideoTitle(field(info, "视频标题"));
  }

  // 1.14.1（审查 C-4）：换码表只有 archive-core 那一份
  const LIBRARY_BV_TABLE = BcaArchiveCore.BV_DECODE_TABLE;
  function libraryBvidToAid(bvid) {
    const text = String(bvid || "").trim();
    if (!/^BV[0-9A-Za-z]{10}$/.test(text)) return "";
    const chars = text.split("");
    [chars[3], chars[9]] = [chars[9], chars[3]];
    [chars[4], chars[7]] = [chars[7], chars[4]];
    let value = 0n;
    for (const char of chars.slice(3, 11)) {
      const digit = LIBRARY_BV_TABLE.indexOf(char);
      if (digit < 0) return "";
      value = value * 58n + BigInt(digit);
    }
    return String((value & 2251799813685247n) ^ 23442827791579n);
  }

  function videoIdentifierKeys(video) {
    const bvid = String(video?.bvid || "").trim();
    const aid = String(video?.aid || "").trim().replace(/^av/i, "") || libraryBvidToAid(bvid);
    return new Set([bvid && bvid !== "未知" ? `bvid:${bvid}` : "", aid && aid !== "未知" ? `aid:${aid}` : ""].filter(Boolean));
  }

  function recordToVideo(collectionName, recordEntry, record, options = {}) {
    const info = record.info;
    const share = record.share;
    const downloadIndex = options.downloadIndex instanceof Map ? options.downloadIndex : null;
    const previous = options.previous instanceof Map ? options.previous : new Map();
    const url = field(info, "视频链接");
    const title = field(info, "视频标题") || recordEntry.name;
    const date = field(info, "视频收藏时间") || recordEntry.name;
    const bvid = field(info, "BV号");
    const aid = field(info, "av号");
    const upName = field(info, "UP主昵称");
    const tags = BcaArchiveCore.tagsFromInfo(info);
    const id = `${collectionName}/${recordEntry.name}`;
    const previousRecord = previous.get(id);
    const downloadState = BcaArchiveCore.downloadStateFromIndex(collectionName, videoIdentifierKeys({ bvid, aid }), downloadIndex, previousRecord);
    // 搜索比对串在扫描时拼一次就够；字段顺序与取值必须与 matchesBaseFilters 里那份一致。
    const searchIndex = [title, upName, bvid, collectionName, share.description, ...tags].join(" ").toLocaleLowerCase();
    return {
      id,
      collection: collectionName,
      directory: recordEntry.name,
      title,
      url: bilibiliLink(url),
      bvid,
      aid,
      downloaded: downloadState.downloaded,
      hasDownloadFiles: downloadState.hasFiles,
      downloadDirectoryName: downloadState.name,
      downloadCollectionName: downloadState.collectionName,
      downloadDirectoryHandle: downloadState.handle,
      // 1.14.1（审查 C-4）：失效占位标题名单在 archive-core 里，别在这里再列一遍
      isInvalid: isInvalidRecord(record),
      // 老存档没有「失效原因」这一行，读回来是空串，不是「未知」
      invalidReason: invalidReasonText(field(info, "失效原因")),
      upName,
      upMid: field(info, "UP主UID"),
      upHome: bilibiliLink(field(info, "UP主主页")),
      upFans: realField(info, "UP主粉丝数"),
      favoriteAt: date,
      savedAt: record.savedAt,
      timestamp: parseDate(date, recordEntry.name),
      duration: field(info, "视频时长"),
      publishDate: field(info, "视频发布时间"),
      description: share.description,
      stats: statsFromInfo(info, share.stats),
      tags,
      searchIndex,
      info,
      cover: record.cover || "",
      coverEntry: record.coverEntry || null
    };
  }
  const api = {
    RESERVED_DIRS,
    RECORD_DIRECTORY_PATTERN,
    RECYCLE_DIR_NAME,
    RECYCLE_KEEP_DAYS,
    RECYCLE_RETENTION_MS,
    HEALTH_DIR_NAME,
    HEALTH_REPORT_LIST_LIMIT,
    isRecordDirectoryName,
    isInvalidRecord,
    recycleStamp,
    stampTime,
    formatMegabytes,
    reportListLine,
    subdirectoryHandle,
    directoryIsEmpty,
    copyFileHandle,
    copyDirectoryTree,
    directoryFingerprint,
    moveDirectoryInto,
    optionalFileHandle,
    isUnfinishedRecord,
    readRecord,
    scanArchive,
    recycleCollection,
    recycleRecords,
    pruneRecycler,
    purgeRecycler,
    listRecycled,
    restoreRecycled,
    deleteRecycled,
    loadRootHandle,
    ensureRootPermission,
    field,
    realField,
    statsFromInfo,
    bilibiliLink,
    parseDate,
    videoIdentifierKeys,
    recordToVideo
  };

  global.BcaArchiveTools = Object.freeze(api);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
