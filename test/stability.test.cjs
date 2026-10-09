const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const core = require("../archive-core.js");

const projectRoot = path.join(__dirname, "..");
const readProjectFile = (relativePath) => fs.readFileSync(path.join(projectRoot, relativePath), "utf8");

// 从 background.js 里取出指定的顶层函数并在测试里执行。
// background.js 是模块化 service worker，不能 require，但它里面的文本处理函数是纯函数，
// 直接按函数体抽出来测，测的就是真正跑在生产代码里的那份实现。
function loadBackgroundFunctions(names, constants = []) {
  const source = readProjectFile("background.js");
  const constSource = constants.map((name) => {
    const match = source.match(new RegExp(`^const ${name} = [^\\n]*;`, "m"));
    assert.ok(match, `background.js 中找不到常量 ${name}`);
    return match[0];
  });
  const bodies = names.map((name) => {
    const pattern = new RegExp(`^function ${name}\\([^)]*\\) \\{[\\s\\S]*?^\\}`, "m");
    const match = source.match(pattern);
    assert.ok(match, `background.js 中找不到函数 ${name}`);
    return match[0];
  });
  return new Function(`${constSource.join("\n")}\n${bodies.join("\n\n")}\nreturn { ${names.join(", ")} };`)();
}

test("library download queue preserves its source collection after Bilibili parsing", () => {
  const parsed = core.withSourceCollection({ bvid: "BV1abcdefgh1", title: "视频" }, { collection: "收藏夹 A" });
  assert.equal(parsed.collection, "收藏夹 A");
  assert.equal(core.withSourceCollection({ title: "手动输入" }).collection, "未分类收藏");
});

test("download directory identifiers recognize BV, av, and numbered legacy folder names", () => {
  assert.deepEqual([...core.identifiersFromDirectoryName("标题 - BV1abcdefgh1")], ["bvid:BV1abcdefgh1"]);
  assert.deepEqual([...core.identifiersFromDirectoryName("标题 - av12345 (2)")], ["aid:12345"]);
  assert.equal(core.identifiersFromDirectoryName("无编号视频").size, 0);
});

test("download lookup prefers the same collection and recognizes the 3.5 unclassified folder", () => {
  const scoped = { name: "收藏夹 A/标题 - BV1abcdefgh1", source: "scoped" };
  const legacy = { name: "未分类收藏/标题 - BV1abcdefgh1", source: "legacy" };
  const index = new Map([
    [core.downloadIndexKey("收藏夹 A", "bvid:BV1abcdefgh1"), scoped],
    ["legacy\u0000bvid:BV1abcdefgh1", legacy]
  ]);
  assert.equal(core.findDownloadMatch("收藏夹 A", ["bvid:BV1abcdefgh1"], index), scoped);
  assert.equal(core.findDownloadMatch("另一个收藏夹", ["bvid:BV1abcdefgh1"], index), legacy);
  assert.equal(core.findDownloadMatch("另一个收藏夹", ["bvid:BV2abcdefgh1"], index), null);
});

test("only media files qualify for the downloaded badge", () => {
  assert.equal(core.isMediaFileName("movie.mp4"), true);
  assert.equal(core.isMediaFileName("audio.m4s"), true);
  assert.equal(core.isMediaFileName("封面.png"), false);
  assert.equal(core.isMediaFileName("简介.srt"), false);
});

test("an unreadable download folder scan does not clear a previously known status", () => {
  const previous = {
    downloaded: true,
    hasDownloadFiles: true,
    downloadDirectoryName: "标题 - BV1abcdefgh1",
    downloadCollectionName: "收藏夹 A"
  };
  const unknown = core.downloadStateFromIndex("收藏夹 A", ["bvid:BV1abcdefgh1"], null, previous);
  assert.equal(unknown.downloaded, true);
  assert.equal(unknown.hasFiles, true);
  assert.equal(unknown.name, previous.downloadDirectoryName);

  const readableEmpty = core.downloadStateFromIndex("收藏夹 A", ["bvid:BV1abcdefgh1"], new Map(), previous);
  assert.equal(readableEmpty.downloaded, false);
  assert.equal(readableEmpty.hasFiles, false);
});

test("collection folder names stay valid and within the archive's 120 character limit", () => {
  assert.equal(core.safeCollectionName("  收藏夹A  "), "收藏夹A");
  assert.equal(core.safeCollectionName("C:\\bad:name"), "C__bad_name");
  assert.equal(core.safeCollectionName("x".repeat(140)).length, 120);
});

test("download path labels fall back to a relative path when the native helper is unavailable", () => {
  assert.equal(core.downloadPathLabel("收藏夹 A", "标题 - BV1abcdefgh1"), "收藏夹 A\\标题 - BV1abcdefgh1");
  assert.equal(core.downloadPathLabel("", "标题 - BV1abcdefgh1"), "标题 - BV1abcdefgh1");
  assert.equal(core.downloadPathLabel("收藏夹 A", ""), "收藏夹 A");
  assert.equal(core.downloadPathLabel("/收藏夹/", "\\目录\\"), "收藏夹\\目录");
  assert.equal(core.joinDownloadPath("D:\\B站收藏\\000视频下载\\", "收藏夹 A", "标题"), "D:\\B站收藏\\000视频下载\\收藏夹 A\\标题");
  assert.equal(core.joinDownloadPath("", "收藏夹 A", "标题"), "收藏夹 A\\标题");
  assert.equal(core.joinDownloadPath("D:\\下载", "", ""), "D:\\下载");
});

// Chrome 的原生消息清单只识别 name/description/path/type/allowed_origins。
// 3.7 的安装脚本把 PowerShell 启动参数写进了 args，Chrome 直接忽略它并启动了一个
// 没有任何参数的 powershell.exe，导致“打开本地视频目录”永远失败。
test("native messaging host manifest never declares the unsupported args field", () => {
  const installer = readProjectFile("install-native-folder-opener.ps1");
  assert.equal(/^\s*args\s*=/m.test(installer), false);
  assert.match(installer, /folder-opener-launcher\.exe/);
  assert.match(installer, /path = \$launcherPath/);
});

// PowerShell 5.1 的 Get-Content 默认按系统 ANSI 代码页读文件，
// UTF-8 中文下载路径会被解坏并让 ConvertFrom-Json 直接报错。
test("native host reads its UTF-8 settings with an explicit encoding", () => {
  const worker = readProjectFile(path.join("native", "folder-opener-host.ps1"));
  assert.match(worker, /Get-Content[^\r\n]*-Raw[^\r\n]*-Encoding UTF8/);
});

/* ------------------------- 4.0 表现层回归检查 ------------------------- */

const PAGE_STYLES = ["library.css", "download.css", "popup.css"];
const PAGE_SCRIPTS = ["library.js", "download.js", "popup.js", "content.js"];

// 去掉注释后再扫，避免把说明文字里的示例字符当成真实用法
const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\r\n]*/g, "$1");

test("every page loads the shared design tokens and the icon set", () => {
  for (const page of ["library.html", "download.html", "popup.html"]) {
    const html = readProjectFile(page);
    assert.match(html, /<link rel="stylesheet" href="theme\.css">/, `${page} 未引入 theme.css`);
    assert.match(html, /<script src="icons\.js"><\/script>/, `${page} 未引入 icons.js`);
    assert.ok(html.indexOf("theme.css") < html.indexOf(page.replace(".html", ".css")), `${page} 的 theme.css 必须在页面样式之前`);
    assert.ok(html.indexOf("icons.js") < html.indexOf(page.replace(".html", ".js")), `${page} 的 icons.js 必须在业务脚本之前`);
  }
});

test("theme.css owns the design tokens and the reduced-motion fallback", () => {
  const theme = readProjectFile("theme.css");
  for (const token of ["--brand", "--ink", "--text", "--muted", "--line", "--surface", "--bg", "--fs-base", "--r-md", "--shadow-md", "--sp-3"]) {
    assert.ok(theme.includes(`${token}:`), `theme.css 缺少令牌 ${token}`);
  }
  assert.match(theme, /prefers-reduced-motion/);
  assert.match(theme, /focus-visible/);
  assert.match(theme, /font-variant-numeric/);
});

// 很多组件显式写了 display（.downloaded-badge 是 inline-flex、.batch-toolbar 是 flex、
// .video-grid 是 grid），会盖掉浏览器默认的 [hidden] { display: none }，
// 少了这条全局兜底就会出现“该隐藏的元素仍然显示”。
test("theme.css keeps the global [hidden] override", () => {
  assert.match(readProjectFile("theme.css"), /\[hidden\]\s*\{\s*display:\s*none\s*!important/);
  for (const file of PAGE_STYLES) {
    assert.equal(/\[hidden\]\s*\{/.test(readProjectFile(file)), false, `${file} 不应再重复定义 [hidden]`);
  }
});

// 3.x 里下载页日志是 9px、“视频/音频”副标题是 8px，中文基本不可读。
test("no page stylesheet drops below the 11px type floor", () => {
  for (const file of PAGE_STYLES) {
    const css = stripComments(readProjectFile(file));
    for (const match of css.matchAll(/font(?:-size)?:\s*(\d+(?:\.\d+)?)px/g)) {
      assert.ok(Number(match[1]) >= 11, `${file} 出现小于 11px 的字号：${match[0]}`);
    }
  }
});

test("pages no longer use character glyphs as icons", () => {
  const glyphs = /[▦▤▣▧▥⠿⌕▰↗＋↻✦]/;
  for (const file of ["library.html", "download.html", "popup.html", ...PAGE_SCRIPTS]) {
    const text = stripComments(readProjectFile(file));
    const found = text.match(glyphs);
    assert.equal(found, null, `${file} 仍在用字符当图标：${found?.[0]}`);
  }
});

test("every referenced icon name exists in icons.js", () => {
  const icons = readProjectFile("icons.js");
  const available = new Set([...icons.matchAll(/^\s{4}"?([a-z-]+)"?:\s*'/gm)].map((match) => match[1]));
  assert.ok(available.has("library") && available.has("check") && available.has("close"));

  const wanted = new Set();
  for (const file of ["library.html", "download.html", "popup.html"]) {
    for (const match of readProjectFile(file).matchAll(/data-icon="([a-z-]+)"/g)) wanted.add(match[1]);
  }
  for (const file of PAGE_SCRIPTS) {
    const text = stripComments(readProjectFile(file));
    for (const match of text.matchAll(/svg\(\s*"([a-z-]+)"/g)) wanted.add(match[1]);
  }
  assert.ok(wanted.size > 10);
  for (const name of wanted) assert.ok(available.has(name), `icons.js 里没有图标 ${name}`);
});

test("the removed compatibility page stays removed", () => {
  for (const file of ["download-folder.html", "download-folder.js", "download-folder.css"]) {
    assert.equal(fs.existsSync(path.join(projectRoot, file)), false, `${file} 应该已经删除`);
  }
  assert.equal(/download-folder/.test(readProjectFile("manifest.json")), false);
});

test("the injected Bilibili notice follows the system colour scheme", () => {
  const content = readProjectFile("content.js");
  assert.match(content, /prefers-color-scheme: dark/);
  assert.match(content, /prefers-reduced-motion/);
  assert.match(content, /mouseenter/);
});

test("the extension never exposes its pages to web origins", () => {
  const manifest = JSON.parse(readProjectFile("manifest.json"));
  assert.equal(manifest.version, "4.3.0");
  // 4.3：library.html 不再作为 web_accessible_resource 暴露给 B 站页面
  assert.equal(manifest.web_accessible_resources, undefined, "扩展页不应暴露给任何网页");
  assert.deepEqual(manifest.permissions.slice().sort(), ["clipboardWrite", "nativeMessaging", "storage"]);
  // 打开本地收藏库改由后台 chrome.tabs.create 完成
  const background = readProjectFile("background.js");
  const content = readProjectFile("content.js");
  assert.match(background, /"bca-open-library"/);
  assert.match(background, /chrome\.tabs\.create\(\{ url: chrome\.runtime\.getURL\("library\.html"\) \}\)/);
  assert.match(content, /type: "bca-open-library"/);
  assert.equal(/window\.open\(chrome\.runtime\.getURL/.test(content), false, "不应再用 window.open 打开扩展页");
});

/* ------------------------- 4.3 安全加固 ------------------------- */

test("the library refuses to run inside a frame", () => {
  const library = readProjectFile("library.js");
  assert.match(library, /if \(window\.top !== window\.self\)/);
  // 必须在读取本地目录之前就拦下来
  const guardIndex = library.indexOf("window.top !== window.self");
  const restoreIndex = library.indexOf("restoreLastRoot()");
  assert.ok(guardIndex > 0 && restoreIndex > guardIndex, "防嵌套检查必须早于目录读取");
});

test("cover images are restricted to blob and inline image URLs", () => {
  const library = readProjectFile("library.js");
  assert.ok(library.includes("blob:|data:image"), "safeCover 应有协议白名单");
  assert.ok(library.includes('return `<img src="${escapeHtml(url)}"'), "safeCover 应转义 URL");
});

test("error reports warn that they contain local paths", () => {
  const background = readProjectFile("background.js");
  assert.match(background, /const ERROR_REPORT_NOTICE = "提示：本报告包含本地目录路径与视频链接/);
  assert.match(background, /includes\(ERROR_REPORT_NOTICE\)/, "persistErrorReport 应兜底补提示");
  assert.match(readProjectFile("download.js"), /请勿公开分享/);
});

test("the import asks Bilibili slowly instead of in bursts", () => {
  const background = readProjectFile("background.js");
  const concurrency = Number(background.match(/const IMPORT_DETAIL_CONCURRENCY = (\d+);/)?.[1]);
  const delay = Number(background.match(/const IMPORT_DETAIL_DELAY_MS = (\d+);/)?.[1]);
  assert.equal(concurrency, 1, "导入详情抓取应串行");
  assert.ok(delay >= 600, `请求间隔至少 600ms，当前 ${delay}ms`);
  assert.ok(concurrency / (delay / 1000) <= 2, `每秒请求数不应超过 2，当前 ${(concurrency / (delay / 1000)).toFixed(2)}`);
});

test("invalid-video recovery through the APP API is opt-in and off by default", () => {
  const background = readProjectFile("background.js");
  const popup = readProjectFile("popup.js");
  const html = readProjectFile("popup.html");
  assert.match(background, /const recoverInvalidVideos = settings\?\.recoverInvalidVideos === true/);
  assert.match(html, /id="recoverInvalid"/);
  assert.match(popup, /recoverInvalidVideos: recoverInvalidCheckbox\.checked/);
  // 默认关闭：只有显式存过 true 才勾选
  assert.match(popup, /recoverInvalidCheckbox\.checked = saved\?\.recoverInvalidVideos === true/);
  // 恢复流程必须被开关包住
  const gateIndex = background.indexOf("if (recoverInvalidVideos) {");
  const callIndex = background.indexOf("await enrichImportedInvalidVideos(pendingItems, folder, tabId)");
  assert.ok(gateIndex > 0 && callIndex > gateIndex, "APP 接口恢复流程必须在开关之内");
});

/* ---------------- 4.2：归档改为整条重写，不再做定点补丁 ---------------- */

// 4.1beta 用 replaceInfoTagLine / replaceInfoDescription 只改「标签」那一行和「视频简介」块，
// 4.2 取消了这个补丁路径（补全并入导入时的整条重写），两个函数已删除。
// 视频信息.txt 的区块名和字段名是收藏库解析时的对外契约，这里做静态兜底。
test("archive files are rewritten as a whole and keep the parsed section contract", () => {
  const source = readProjectFile("background.js");
  assert.equal(/function replaceInfoTagLine\(/.test(source), false, "replaceInfoTagLine 应已删除");
  assert.equal(/function replaceInfoDescription\(/.test(source), false, "replaceInfoDescription 应已删除");
  assert.match(source, /function buildInfo\(/, "归档文本必须仍由 buildInfo 统一生成");

  for (const heading of ["【基本信息】", "【UP主】", "【互动数据】", "【标签】", "【视频简介】"]) {
    assert.ok(source.includes(`"${heading}"`), `buildInfo 缺少区块 ${heading}`);
  }
  // 收藏库 scanRoot() 按 background.js 的 IMPORT_STAT_LABELS 里这些字段名取统计
  const labels = source.match(/const IMPORT_STAT_LABELS = \{([^}]*)\}/);
  assert.ok(labels, "background.js 缺少 IMPORT_STAT_LABELS");
  for (const label of ["播放量", "弹幕量", "点赞数", "投硬币枚数", "收藏人数", "转发人数"]) {
    assert.ok(labels[1].includes(`"${label}"`), `统计字段缺少 ${label}`);
  }
  assert.match(source, /UP主粉丝数：/);
});

test("the import still treats the archive placeholders as missing data", () => {
  const source = readProjectFile("background.js");
  const declaration = source.match(/const IMPORT_PLACEHOLDER_VALUES = new Set\(\[([^\]]*)\]\)/);
  assert.ok(declaration, "background.js 缺少 IMPORT_PLACEHOLDER_VALUES");
  for (const value of ['"未知"', '"无"', '"-"', '"暂无"']) {
    assert.ok(declaration[1].includes(value), `占位值集合缺少 ${value}`);
  }
  // 风控保护：详情抓取必须有并发上限与请求间隔
  assert.match(source, /const IMPORT_DETAIL_CONCURRENCY = \d+;/, "缺少详情抓取并发上限");
  assert.match(source, /const IMPORT_DETAIL_DELAY_MS = \d+;/, "缺少详情抓取请求间隔");
});

test("the import flow fetches full metadata for every entry through the Bilibili endpoints", () => {
  const source = readProjectFile("background.js");
  assert.match(source, /function fetchVideoDetail\(/);
  assert.match(source, /function fetchImportDetails\(/);
  assert.match(source, /function fetchUpFans\(/, "UP 主粉丝数需要单独请求");
  // 失效条目仍走原有的恢复补全
  assert.match(source, /enrichImportedInvalidVideos\(pendingItems/);
  assert.match(source, /"\/x\/web-interface\/view"/);
  assert.match(source, /"\/x\/tag\/archive\/tags"/);
  // 互动数据与粉丝数要写进视频信息.txt，收藏库详情面板直接读它们
  assert.match(source, /"【互动数据】"/);
  assert.match(source, /UP主粉丝数：/);
  // 抓取结果串在同一队列里，避免和保存/导入同时改写归档文件
  assert.match(source, /saveQueue\.then\(\(\) => importBiliFavorites\(/);
});

// 4.2：收藏库的「补全缺失资料」入口已整体删除（补全回到插件端的导入流程），
// 这条断言随之反过来：页面和脚本里都不允许再残留 enrich 相关的 id 或代码。
test("the library no longer offers a batched backfill for records already on disk", () => {
  const html = readProjectFile("library.html");
  const library = readProjectFile("library.js");
  for (const id of ["enrichLibrary", "enrichDialog", "enrichBatchSize", "enrichProgress", "cancelEnrich", "confirmEnrich"]) {
    assert.equal(html.includes(`id="${id}"`), false, `library.html 不应再出现 ${id}`);
  }
  assert.equal(/enrich/i.test(html), false, "library.html 不应再出现 enrich 相关代码");
  assert.equal(/enrich/i.test(library), false, "library.js 不应再出现 enrich 相关代码");
});

/* ------------------------- 4.1 归档解析与浏览 ------------------------- */

// 用户真实档案里的内容：导入来的视频标签是“未知”、简介是“-”
const PLACEHOLDER_INFO = [
  "【基本信息】",
  "视频收藏时间：2026年09月10日 15时02分20秒.000",
  "视频标题：这下是17岁未亡人了😡",
  "BV号：BV1LKGm6ZErR",
  "av号：av116645959959066",
  "",
  "【UP主】",
  "UP主昵称：长崎素世",
  "UP主UID：3706936430168922",
  "",
  "【标签】",
  "未知",
  "",
  "【视频简介】",
  "-",
  ""
].join("\n");

test("placeholder archive values are read as missing data, not as content", () => {
  const info = core.parseInfoFile(PLACEHOLDER_INFO);
  assert.equal(info.fields["视频标题"], "这下是17岁未亡人了😡");
  assert.equal(info.fields["UP主昵称"], "长崎素世");
  assert.equal(info.fields["BV号"], "BV1LKGm6ZErR");
  assert.deepEqual(core.tagsFromInfo(info), [], "“未知”不应被当成标签");
  assert.equal(core.descriptionFromInfo(info), "", "“-”不应被当成简介");
  for (const value of ["未知", "无", "-", "--", "—", "暂无", " ", ""]) {
    assert.equal(core.isPlaceholderValue(value), true, `${value} 应视为占位值`);
  }
  assert.equal(core.isPlaceholderValue("正常内容"), false);
});

test("real tags and multi-line descriptions survive parsing", () => {
  const info = core.parseInfoFile([
    "【标签】",
    "发现《Bangarang (feat. Sirah)》、人力VOCALOID、鬼畜、音mad",
    "",
    "【视频简介】",
    "我的vegas好难用。",
    "第二行",
    ""
  ].join("\n"));
  assert.deepEqual(core.tagsFromInfo(info), ["发现《Bangarang (feat. Sirah)》", "人力VOCALOID", "鬼畜", "音mad"]);
  assert.equal(core.descriptionFromInfo(info), "我的vegas好难用。\n第二行");
});

test("a description made of dashes is kept, only a lone placeholder is dropped", () => {
  const info = core.parseInfoFile(["【视频简介】", "- 第一点", "- 第二点", ""].join("\n"));
  assert.equal(core.descriptionFromInfo(info), "- 第一点\n- 第二点");
});

// 4.0 的 bug：空标签占位符复用了 .detail-description，querySelector 先取到占位符，
// 简介被写进了“标签”区块，真正的简介区永远空白。
test("the empty-tags placeholder no longer steals the description element", () => {
  const library = readProjectFile("library.js");
  assert.match(library, /class="detail-empty"/);
  assert.equal(/class="detail-description">暂无标签/.test(library), false);
  assert.equal((library.match(/class="detail-description"/g) || []).length, 1, "详情里只应存在一个 .detail-description");
  assert.match(readProjectFile("library.css"), /\.detail-empty\s*\{/);
});

test("downloaded video titles turn green while invalid ones stay red", () => {
  const css = readProjectFile("library.css");
  assert.match(css, /\.video-card\.downloaded-video \.card-title\s*\{[^}]*--success-strong/);
  assert.match(css, /\.video-card\.downloaded-video\.invalid-video \.card-title\s*\{[^}]*--danger/);
});

test("page numbers follow the Bilibili-style window", () => {
  assert.deepEqual(core.pageSequence(1, 3), [1, 2, 3]);
  assert.deepEqual(core.pageSequence(1, 38), [1, 2, 3, 4, "gap", 38]);
  assert.deepEqual(core.pageSequence(4, 38), [1, "gap", 3, 4, 5, "gap", 38]);
  assert.deepEqual(core.pageSequence(20, 38), [1, "gap", 19, 20, 21, "gap", 38]);
  assert.deepEqual(core.pageSequence(38, 38), [1, "gap", 35, 36, 37, 38]);
  assert.deepEqual(core.pageSequence(1, 0), []);
});

test("the library paginates and can switch between grid and list view", () => {
  const html = readProjectFile("library.html");
  const library = readProjectFile("library.js");
  assert.match(html, /id="videoPager"/);
  assert.match(html, /id="viewGrid"/);
  assert.match(html, /id="viewList"/);
  assert.match(html, /data-icon="view-list"/);
  assert.ok(readProjectFile("icons.js").includes('"view-list"'), "icons.js 缺少 view-list 图标");
  assert.match(library, /function renderPager\(/);
  assert.match(library, /list-view/);
  assert.match(readProjectFile("library.css"), /\.video-grid\.list-view/);
  assert.match(readProjectFile("library.css"), /\.pager-page\.current/);
});

/* ------------------------- 4.2 导入重构与展示 ------------------------- */

// 用户档案里 蜡笔小新 那条的真实简介，B 站把分享文案塞进了 intro
const SHARE_TEXT = "【蜡笔小新】冷天煮超大锅浓汤牛肠火锅，白菜韭菜和拉面热乎乎涮着吃哦小新超想这样子吃哦, 视频播放量 71953、弹幕量 82、点赞数 642、投硬币枚数 172、收藏人数 269、转发人数 10, 视频作者 蜡笔小新美食频道, 作者简介  大家能不能帮忙点个关注谢谢啦, 相关视频：【蜡笔小新】扒满满一大碗肉汁拌牛肉饭";

test("the share text splitter in background.js matches the shared implementation", () => {
  // background.js 是模块化 service worker，不能 require archive-core.js，所以有一份等价实现；
  // 这里从两边各取一份真身，逐个输入比对，防止将来改歪
  const local = loadBackgroundFunctions(["parseShareStats", "splitShareText"], ["SHARE_STATS_PATTERN"]);
  const samples = [SHARE_TEXT, "bgm：小雨天气", "", "-", "普通简介，带逗号、顿号，和（括号）"];
  for (const sample of samples) {
    assert.deepEqual(local.splitShareText(sample), core.splitShareText(sample), `splitShareText 不一致：${sample.slice(0, 20)}`);
    assert.deepEqual(local.parseShareStats(sample), core.parseShareStats(sample));
  }
});

test("the share text splitter pulls the stats out of a real archive description", () => {
  const split = core.splitShareText(SHARE_TEXT);
  assert.equal(split.isShareText, true);
  assert.equal(split.description, "【蜡笔小新】冷天煮超大锅浓汤牛肠火锅，白菜韭菜和拉面热乎乎涮着吃哦小新超想这样子吃哦");
  assert.deepEqual(split.stats, { view: "71953", danmaku: "82", like: "642", coin: "172", favorite: "269", share: "10" });
  const plain = core.splitShareText("bgm：小雨天气");
  assert.equal(plain.isShareText, false);
  assert.equal(plain.description, "bgm：小雨天气");
  assert.deepEqual(plain.stats, {});
});

test("update mode only refreshes records that are actually incomplete", () => {
  const { recordNeedsRefresh } = loadBackgroundFunctions(
    ["importClean", "importIsPlaceholder", "recordNeedsRefresh"],
    ["IMPORT_PLACEHOLDER_VALUES"]
  );
  // 4.1 之前的旧档案：没有粉丝数、没有互动数据
  assert.equal(recordNeedsRefresh({ text: PLACEHOLDER_INFO }), true);
  // 标签、简介、发布时间是占位值也要刷新
  assert.equal(recordNeedsRefresh({ text: "【标签】\n未知\n\n【视频简介】\n- 参考\n\nUP主粉丝数：1\n【互动数据】\n播放量：1\n视频发布时间：2020-01-01 00:00:00 星期三" }), true);
  // 4.2 写出来的完整档案不该被反复重写
  const complete = [
    "【基本信息】",
    "视频发布时间：2026-08-14 06:00:00 星期五",
    "",
    "【UP主】",
    "UP主粉丝数：123456",
    "",
    "【互动数据】",
    "播放量：73798",
    "",
    "【标签】",
    "拉面、治愈",
    "",
    "【视频简介】",
    "真正的简介",
    ""
  ].join("\n");
  assert.equal(recordNeedsRefresh({ text: complete }), false);
  assert.equal(recordNeedsRefresh({ text: "" }), false);
});

test("the new info layout carries the followers count and a separate stats block", () => {
  const source = readProjectFile("background.js");
  assert.match(source, /UP主粉丝数：\$\{fansText\}/);
  assert.match(source, /lines\.push\("【互动数据】"\)/);
  assert.match(source, /const IMPORT_STAT_LABELS = \{ view: "播放量", danmaku: "弹幕量", like: "点赞数", coin: "投硬币枚数", favorite: "收藏人数", share: "转发人数" \}/);
  // 只有真的抓到互动数据时才写这一区块，自动归档的老格式不受影响
  assert.match(source, /const hasStats = IMPORT_STAT_KEYS\.some\(\(key\) => !importIsPlaceholder\(stats\[key\]\)\)/);
});

test("the 4.2 layout round-trips through the archive parser", () => {
  // 与 buildInfo 生成的结构保持一致，确认网页端能原样读回来
  const sample = [
    "【基本信息】",
    "视频收藏时间：2026年10月09日 01时19分50秒.175",
    "信息保存于：2026-10-09 01:19:50",
    "保存文件夹：2026年10月09日01时19分50秒",
    "视频标题：【蜡笔小新】冷天煮超大锅浓汤牛肠火锅",
    "视频链接：https://www.bilibili.com/video/BV1pMgp6aEbu/",
    "视频状态：正常",
    "恢复情况：收藏夹资料 + 视频资料接口",
    "BV号：BV1pMgp6aEbu",
    "av号：av116645959959066",
    "分区：美食 / 美食制作",
    "视频时长：17:37",
    "视频发布时间：2026-08-14 06:00:00 星期五",
    "",
    "【UP主】",
    "UP主昵称：蜡笔小新美食频道",
    "UP主UID：87795103",
    "UP主粉丝数：123456",
    "UP主主页：https://space.bilibili.com/87795103",
    "",
    "【互动数据】",
    "播放量：73798",
    "弹幕量：84",
    "点赞数：652",
    "投硬币枚数：178",
    "收藏人数：270",
    "转发人数：10",
    "",
    "【标签】",
    "发现《夏天》、拉面、治愈",
    "",
    "【视频简介】",
    "真正的简介第一行",
    "第二行",
    ""
  ].join("\n");
  const info = core.parseInfoFile(sample);
  assert.equal(info.fields["UP主粉丝数"], "123456");
  assert.equal(info.fields["播放量"], "73798");
  assert.equal(info.fields["转发人数"], "10");
  assert.equal(info.fields["视频发布时间"], "2026-08-14 06:00:00 星期五");
  assert.equal(info.fields["视频状态"], "正常");
  assert.deepEqual(core.tagsFromInfo(info), ["发现《夏天》", "拉面", "治愈"]);
  assert.equal(core.descriptionFromInfo(info), "真正的简介第一行\n第二行");
  // 老档案没有这两块，解析不能报错
  const legacy = core.parseInfoFile(PLACEHOLDER_INFO);
  assert.equal(legacy.fields["UP主粉丝数"], undefined);
  assert.equal(legacy.fields["播放量"], undefined);
});

test("the import can be paused, resumed and cancelled with a rollback journal", () => {
  const source = readProjectFile("background.js");
  for (const name of ["importWaitIfPaused", "importReleaseWaiters", "createImportJournal", "rollbackImport", "refreshImportedRecord", "readExistingImportRecords", "fetchVideoDetail", "fetchUpFans", "fetchImportDetails"]) {
    assert.match(source, new RegExp(`^function ${name}\\(|^async function ${name}\\(`, "m"), `缺少 ${name}`);
  }
  // 取消靠一个专用错误向上冒泡
  assert.match(source, /error\.name = "ImportCancelled"/);
  assert.match(source, /if \(error\?\.name === "ImportCancelled"\)/);
  // 回滚要做三件事：删新建目录、还原被改写的文件、清空的新建收藏夹
  assert.match(source, /for \(const entry of \[\.\.\.journal\.createdRecords\]\.reverse\(\)\)/);
  assert.match(source, /for \(const entry of \[\.\.\.journal\.modifiedFiles\]\.reverse\(\)\)/);
  assert.match(source, /for \(const entry of \[\.\.\.journal\.createdCollections\]\.reverse\(\)\)/);
  // 登记必须在写之前，否则取消时会漏掉
  assert.match(source, /journal\?\.createdRecords\.push\(\{ collectionHandle: collection, name: record\.name \}\)/);
  const registerIndex = source.indexOf("journal?.createdRecords.push");
  const writeIndex = source.indexOf('await writeFile(record, "视频信息.txt"', registerIndex);
  assert.ok(registerIndex > 0, "找不到 createdRecords 登记");
  assert.ok(writeIndex > registerIndex, "createdRecords 必须先于写文件登记");
  // 三个接口都要用上
  assert.match(source, /"\/x\/web-interface\/view"/);
  assert.match(source, /"\/x\/tag\/archive\/tags"/);
  assert.match(source, /"\/x\/relation\/stat"/);
});

test("the popup exposes pause and cancel for a running import", () => {
  const html = readProjectFile("popup.html");
  const popup = readProjectFile("popup.js");
  for (const id of ["importControl", "pauseImport", "cancelImport", "importProgressTitle"]) {
    assert.match(html, new RegExp(`id="${id}"`), `popup.html 缺少 #${id}`);
  }
  assert.match(popup, /type: "bca-import-control"/);
  assert.match(popup, /importState/);
  assert.match(popup, /pauseImportButton\.addEventListener/);
  assert.match(popup, /cancelImportButton\.addEventListener/);
  // 取消是两步，避免误触
  assert.match(popup, /cancelArmed/);
  // 弹窗可能在导入中被关闭又打开，状态要从后台恢复
  assert.match(popup, /const state = status\.importState \|\| \{\}/);
  assert.match(readProjectFile("background.js"), /sendResponse\(\{ \.\.\.status, importState \}\)/);
});

test("the web side shows storage usage and no longer offers the backfill button", () => {
  const html = readProjectFile("library.html");
  const library = readProjectFile("library.js");
  assert.match(html, /id="storageUsage"/);
  assert.match(html, /id="importHint"/);
  assert.match(library, /function updateStorageUsage\(/);
  assert.match(library, /function formatCount\(/);
  assert.match(library, /detail-stats/);
  assert.match(library, /importHintDismissed/);
  assert.equal(/id="enrichLibrary"/.test(html), false, "补全缺失资料按钮应已删除");
  assert.equal(/id="enrichDialog"/.test(html), false, "补全对话框应已删除");
  assert.equal(/bca-enrich-records/.test(readProjectFile("background.js")), false, "后台不应再保留补全消息");
});

