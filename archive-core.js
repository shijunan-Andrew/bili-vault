(function attachArchiveCore(global) {
  "use strict";

  const MEDIA_EXTENSIONS = new Set(["mp4", "mkv", "webm", "m4s", "flv", "mov", "avi"]);

  /* 1.7.10（facet-destructive P2-2）：文件名还有个「字节」上限，原来只按字符截。
     NTFS 的单个路径分量上限是 255 字节，而一个汉字在 UTF-8 下占 3 字节：标题上限
     100 字符 = 最多 300 字节，收藏夹名 120 字符 = 最多 360 字节，再拼上「 - BV号」
     就直接越线 —— getDirectoryHandle 抛错，那一条视频稳定导不进来，用户只看到
     「保存失败」而不知道原因。两个上限取严的那个，字符上限照旧保留（纯 ASCII
     的行为一个字都不变），并且按码点累加，不会把 emoji 切成半个代理对。
     留 200 而不是 255：后面 uniqueRecordFolderName 还可能追加「 (1)」。 */
  const MAX_SEGMENT_BYTES = 200;

  function utf8ByteLength(text) {
    let bytes = 0;
    for (const char of String(text || "")) {
      const code = char.codePointAt(0);
      bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
    }
    return bytes;
  }

  function truncateToBytes(text, maxBytes) {
    const source = String(text || "");
    if (maxBytes <= 0) return "";
    if (utf8ByteLength(source) <= maxBytes) return source;
    let used = 0;
    let result = "";
    for (const char of source) {
      const size = utf8ByteLength(char);
      if (used + size > maxBytes) break;
      used += size;
      result += char;
    }
    return result;
  }

  function safeCollectionName(value, fallback = "未分类收藏") {
    let name = String(value || "").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/[. ]+$/g, "").trim();
    if (!name || name === "." || name === "..") name = fallback;
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(name)) name = `_${name}`;
    return truncateToBytes(name.slice(0, 120), MAX_SEGMENT_BYTES) || fallback;
  }

  /* 1.7.11（facet-security P2-3）：这几个目录名保留给插件自己用，收藏夹不许占用。
     原来这份名单只写在 background.js 里（手动添加 / 导入两条链路会查），而
     「将下载到本地的视频放入收藏夹中」那条链路走的是本文件的 safeName，**不查名单** ——
     一个真叫「001错误报告」的 B 站收藏夹会被建成同名目录，和插件的错误报告目录混在一起。
     现在名单下沉到这里当唯一一份；background.js 与 library.js 都引用它（SW 是 ES module，
     拿不到经典脚本，所以那边保留一份逐字相同的常量，靠稳定性测试逐字比对）。 */
  const RESERVED_COLLECTION_NAMES = [
    "错误报告",
    "001错误报告",
    "002同步报告",
    "视频下载",
    "000视频下载",
    "003database"
  ];

  function isReservedCollectionName(name) {
    return RESERVED_COLLECTION_NAMES.includes(safeCollectionName(name));
  }

  function withSourceCollection(parsedVideo, sourceItem = {}) {
    const video = parsedVideo && typeof parsedVideo === "object" ? parsedVideo : {};
    return {
      ...video,
      collection: safeCollectionName(sourceItem.collection || video.collection || "未分类收藏")
    };
  }

  // 4.8：视频目录命名原本只写在下载页里（那张页面 1.3.0 已删除）。收藏库的
  // 「将下载到本地的视频放入收藏夹中」也必须用同一套规则建目录 —— 用户用别的工具
  // 下好的文件要能凭 BV 号认出这个目录并对上号，所以提到这里共享，全项目只此一份实现。
  function safeName(value, fallback = "未知", maxLength = 100) {
    const name = String(value || "").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/[. ]+$/g, "").trim();
    if (!name || name === "." || name === "..") return truncateToBytes(fallback.slice(0, maxLength), MAX_SEGMENT_BYTES);
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(name)) return truncateToBytes(`_${name}`.slice(0, maxLength), MAX_SEGMENT_BYTES);
    return truncateToBytes(name.slice(0, maxLength), MAX_SEGMENT_BYTES);
  }

  // 目录名以 " - BV号"（或 av 号）结尾，identifiersFromDirectoryName 靠这个后缀认人。
  function videoDirectoryLabel(video, index = 0) {
    const rawBvid = String(video?.bvid || "").trim();
    const rawAid = String(video?.aid || "").trim().replace(/^av/i, "");
    const suffix = /^BV[0-9A-Za-z]{10}$/.test(rawBvid) ? rawBvid : /^\d+$/.test(rawAid) ? `av${rawAid}` : `视频${index + 1}`;
    const tail = ` - ${suffix}`;
    // 后缀（BV/av 号）是认人的依据，必须整段留住：字节预算先扣掉它，剩下的给标题。
    const titleBudget = Math.max(1, MAX_SEGMENT_BYTES - utf8ByteLength(tail));
    const title = truncateToBytes(safeName(video?.title, "未知").slice(0, Math.max(1, 100 - tail.length)), titleBudget);
    return `${title}${tail}`;
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

  // 4.8.2：「这条记录算不算已下载」只能有这一个判据。
  // 之前 downloadStateFromIndex 和 library.js 的 refreshDownloadStatuses 各写了一份，
  // 加了「手动标记」之后前者改了、后者没改 —— 页面重新获得焦点时重算就会把标记冲掉。
  // 有真实媒体文件，或者有「手动标记」留下的说明文件，都算已下载。
  function downloadMatchIsDownloaded(match) {
    return Boolean(match?.hasMedia || match?.marked);
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
      downloaded: downloadMatchIsDownloaded(match),
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

  // 下载目录相对路径：“收藏夹\视频目录”。用于本地目录打开助手不可用时的手动打开提示。
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

  /* 1.7.11（facet-security P2-1）：视频标题 / 简介 / 标签 / UP 名都是**页面可控**的文本
     （上传者能往自己视频的简介里塞任意多行），而原来这里是「后出现的行覆盖先出现的行」+
     「任何段里的 `键：值` 都算字段」。于是简介里写一行 `视频链接：https://evil.example`
     就能覆盖掉真实链接，详情页的「在 B 站打开视频」会跳到攻击者站点；写 `视频状态：已失效`
     能让记录显示成失效、引导用户去删。不执行代码，但足以伪造本地归档的元数据。
     两道闸：① 只在已知的元数据段里认字段（【视频简介】/【标签】本来就另有出口）；
     ② 同一个键**首次出现优先** —— 真值在前，简介在后，伪造就覆盖不了了。 */
  const FIELD_SECTIONS = new Set(["基本信息", "UP主", "互动数据"]);

  /* 【标签】/【视频简介】是**内容段**：它们整段是页面可控的自由文本（上传者想写什么写什么），
     而 buildInfo 把它们排在字段段之后。所以一旦进过内容段，后面再出现的 `【基本信息】`
     之类一律不再认 —— 少了这一刀，简介里写一行 `【基本信息】` 就能重开字段解析段，
     把真实文件里本来没有的键（视频状态 / 失效原因）塞进来。 */
  const CONTENT_SECTIONS = new Set(["标签", "视频简介"]);

  function parseInfoFile(text) {
    const raw = String(text ?? "");
    const fields = {};
    const sections = {};
    let section = "基本信息";
    let fieldsClosed = false;
    for (const line of raw.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").split("\n")) {
      const heading = line.match(/^【(.+?)】\s*$/);
      if (heading) {
        section = heading[1];
        if (CONTENT_SECTIONS.has(section)) fieldsClosed = true;
        sections[section] ||= [];
        continue;
      }
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
      if (divider > 0 && !fieldsClosed && FIELD_SECTIONS.has(section)) {
        const key = line.slice(0, divider).trim();
        const value = line.slice(divider + 1).trim();
        if (key && !(key in fields)) fields[key] = value;
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

  // 互动数据的六个键与六个中文标签。**全仓唯一一份**，出处就是这里：
  // 上面 statsSectionLines() 用它拼【互动数据】段，下面 api 把它导出给
  // background.js（更新视频状态）与 library.js（详情卡片）引用。
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

  /* 1.7.9（ux P2-6）：全站统一的数字格式。
     原来体积是「1.50 MB」（两位小数）、计数是「1234 个」（没有分隔符）、进度是「1/20」
     （斜杠硬拼），同一个界面里三种风格；上千条时读不出量级。
     这里集中成一个小模块，页面侧（library.js）通过 BcaArchiveCore 取用。 */
  function formatCountText(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return value === undefined || value === null ? "" : String(value);
    // 三种界面语言（简中 / 繁中 / 英文）的分组符号都是逗号，所以固定按 en-US 分组，
    // 不让数字格式跟着界面语言漂。单位换算（万 / 亿 vs K / M / B）是 formatCount 的职责，不在这里。
    return num.toLocaleString("en-US");
  }

  // B / KB / MB / GB，KB 及以上保留 2 位小数（顶部占用与详情里的下载体积共用）
  function formatBytes(value) {
    const bytes = Number(value) || 0;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(2)} KB`;
    if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
    return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  }

  // 进度一律「已完成/总数」，两个数都过 formatCountText，与计数文案同源
  function formatProgressCounter(done, total) {
    return `${formatCountText(done)}/${formatCountText(total)}`;
  }

  /* 1.7.14（facet-compat C4）：文件系统错误的分类。
     以前只有 NotFoundError / TypeMismatchError 有专门分支，于是三种很常见的环境问题
     全都冒泡成「一次归档失败 + 一句看不懂的英文」：
       - 目标目录只读 / 被 ACL、BitLocker 或同步盘保护 → createWritable() 抛 NoModificationAllowedError
       - 磁盘满 → QuotaExceededError
       - 授权在 queryPermission 与 createWritable() 之间被撤销 → NotAllowedError
     这份映射是权威出处；background.js 里有一份逐字相同的副本（service worker 是
     ES module，拿不到经典脚本），由 test/stability.test.cjs 的守卫断言逐项比对。 */
  const FILE_SYSTEM_ERROR_HINTS = Object.freeze({
    NotAllowedError: "写入授权已失效，请在插件图标里点“重新授权本地备份文件夹”，允许访问后重试。",
    NoModificationAllowedError: "目标文件夹不可写（只读、被系统保护，或同步盘临时锁定）。请换一个本地文件夹再试。",
    QuotaExceededError: "磁盘空间不足，写不进去了。清出一些空间或换一个本地文件夹再试。",
    InvalidModificationError: "目标文件夹不允许这样改动，请换一个本地文件夹再试。"
  });

  function describeFileSystemError(error) {
    const name = String(error?.name || "");
    const hint = FILE_SYSTEM_ERROR_HINTS[name];
    if (!hint) return "";
    const detail = String(error?.message || "").trim();
    return detail ? `${hint}（${name}：${detail}）` : `${hint}（${name}）`;
  }

  /* ------------------------------------------------------------------
     配置文件（导出 / 导入）的形状：全仓唯一一份。

     1.7.17（facet-privacy P1-1/P1-2）：以前这个对象由 library.js 自己拼，于是只有那一页
     知道「导出去的到底包含什么」—— 导出前没有任何提示，也没有「只导外观」的选项，
     而配置文件偏偏是本项目里唯一「设计上要交给别人」的产物。挪到这里有两个好处：
       ① 「包含哪些个人内容」变成可测的纯函数：导出前的提示、导入时的二次确认、设置页的
          「只导外观与档位」读的是同一份判断，不会各说各话；
       ② 设置页也能用它，不必再复制一份字面量。

     个人内容 = 收藏夹顺序（一串用户自建的收藏夹名）+ 搜索关键词 + UP 主筛选 + 标签筛选。
     ------------------------------------------------------------------ */
  const CONFIG_APP_ID = "bili-vault/library-settings";
  const CONFIG_VERSION = 1;
  // 配置文件的显示名：给机器/人读的英文标识，不进词典（不是界面文字）
  const CONFIG_NAME = "Bili Vault · library settings";

  // 与 library.js 导入侧同一组上限：最多 500 条、每条最多 120 字符
  const CONFIG_MAX_ORDER_ENTRIES = 500;
  const CONFIG_MAX_TEXT_LENGTH = 120;

  function normalizeConfigPreferences(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    const filters = source.filters && typeof source.filters === "object" ? source.filters : {};
    return {
      theme: typeof source.theme === "string" ? source.theme : "system",
      locale: typeof source.locale === "string" ? source.locale : "zh-CN",
      pageSize: source.pageSize,
      viewMode: source.viewMode,
      // 1.7.17：封顶跟着形状一起搬过来。原来只有导入侧的 sanitizeConfigPreferences 封顶，
      // 导出侧不封 —— 收藏夹多、关键词长的时候，导出的文件本身就能撑到几百 KB。
      collectionOrder: (Array.isArray(source.collectionOrder) ? source.collectionOrder : [])
        .filter((name) => typeof name === "string")
        .slice(0, CONFIG_MAX_ORDER_ENTRIES)
        .map((name) => name.slice(0, CONFIG_MAX_TEXT_LENGTH)),
      filters: {
        search: typeof filters.search === "string" ? filters.search.slice(0, CONFIG_MAX_TEXT_LENGTH) : "",
        upFilter: typeof filters.upFilter === "string" ? filters.upFilter.slice(0, CONFIG_MAX_TEXT_LENGTH) : "all",
        tagFilter: typeof filters.tagFilter === "string" ? filters.tagFilter.slice(0, CONFIG_MAX_TEXT_LENGTH) : "all"
      }
    };
  }

  /* includePersonal === false 时只导出主题、语言、每页数量、视图模式 —— 也就是「外观与档位」，
     可以放心发给别人。true / 不传时带上收藏夹顺序与三项筛选。
     `_containsPersonalData` 是给导入方看的自述字段：导入时按它（以及真实的字段存在性）
     决定要不要弹二次确认。 */
  function buildConfigPayload(preferences, options = {}) {
    const includePersonal = options.includePersonal !== false;
    const prefs = normalizeConfigPreferences(preferences);
    const payload = {
      app: CONFIG_APP_ID,
      version: CONFIG_VERSION,
      name: CONFIG_NAME,
      exportedAt: new Date().toISOString(),
      _containsPersonalData: includePersonal,
      preferences: {
        theme: prefs.theme,
        locale: prefs.locale,
        pageSize: prefs.pageSize,
        viewMode: prefs.viewMode
      }
    };
    if (includePersonal) {
      payload.preferences.collectionOrder = prefs.collectionOrder.slice();
      payload.preferences.filters = { ...prefs.filters };
    }
    return payload;
  }

  /* 这份配置里到底带了哪些个人内容 —— 导出前的提示、导入时的二次确认、
     设置页的说明都读它。返回「有什么」，拼文案是调用方的事。 */
  function configPersonalFields(payload) {
    const prefs = payload && payload.preferences && typeof payload.preferences === "object" ? payload.preferences : {};
    const filters = prefs.filters && typeof prefs.filters === "object" ? prefs.filters : {};
    return {
      collections: Array.isArray(prefs.collectionOrder) ? prefs.collectionOrder.filter((name) => typeof name === "string").length : 0,
      search: typeof filters.search === "string" ? filters.search : "",
      upFilter: typeof filters.upFilter === "string" && filters.upFilter !== "all" ? filters.upFilter : "",
      tagFilter: typeof filters.tagFilter === "string" && filters.tagFilter !== "all" ? filters.tagFilter : ""
    };
  }

  function configHasPersonalData(payload) {
    if (payload && payload._containsPersonalData === true) return true;
    const fields = configPersonalFields(payload);
    return Boolean(fields.collections || fields.search || fields.upFilter || fields.tagFilter);
  }

  const api = Object.freeze({
    safeCollectionName,
    isReservedCollectionName,
    RESERVED_COLLECTION_NAMES,
    withSourceCollection,
    identifiersFromDirectoryName,
    downloadIndexKey,
    downloadMatchIsDownloaded,
    safeName,
    videoDirectoryLabel,
    findDownloadMatch,
    downloadStateFromIndex,
    isMediaFileName,
    downloadPathLabel,
    joinDownloadPath,
    isPlaceholderValue,
    // 数字格式化：体积 / 计数 / 进度三处共用同一份实现（ux P2-6）
    formatCountText,
    formatBytes,
    formatProgressCounter,
    describeFileSystemError,
    // 互动数据六键与六个中文标签：全仓唯一一份。写归档的 statsSectionLines /
    // patchVolatileFields 与界面侧的 library.js 都引用这里，不再各自复制字面量。
    STAT_KEYS,
    STAT_LABELS,
    // 配置文件的形状与「带了哪些个人内容」：library.js 与 settings.js 共用同一份
    CONFIG_APP_ID,
    CONFIG_VERSION,
    CONFIG_NAME,
    normalizeConfigPreferences,
    buildConfigPayload,
    configPersonalFields,
    configHasPersonalData,
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
