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
  assert.equal(manifest.version, "4.5.2");
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

test("invalid-video recovery through the APP API is on by default but still switchable", () => {
  const background = readProjectFile("background.js");
  const popup = readProjectFile("popup.js");
  const html = readProjectFile("popup.html");
  // 4.4.1：默认开启，只有明确存成 false 才关闭
  assert.match(background, /const recoverInvalidVideos = settings\?\.recoverInvalidVideos !== false/);
  assert.match(popup, /recoverInvalidCheckbox\.checked = saved\?\.recoverInvalidVideos !== false/);
  // 弹窗里的复选框默认勾选
  assert.match(html, /<input id="recoverInvalid" type="checkbox" checked>/);
  assert.match(popup, /recoverInvalidVideos: recoverInvalidCheckbox\.checked/);
  // 恢复流程仍然必须被开关包住，用户能关掉
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

/* ------------------------- 4.4 更新视频状态与使用须知 ------------------------- */

// 归档里已有【互动数据】和视频状态行的完整样本
const FULL_INFO = [
  "【基本信息】",
  "视频收藏时间：2026年10月09日 01时19分50秒.000",
  "信息保存于：2026-10-09 01:19:50",
  "保存文件夹：2026年10月09日01时19分50秒",
  "视频标题：【蜡笔小新】冷天煮超大锅浓汤牛肠火锅",
  "视频链接：https://www.bilibili.com/video/BV1pMgp6aEbu/",
  "视频状态：正常",
  "恢复情况：收藏夹资料",
  "BV号：BV1pMgp6aEbu",
  "av号：av116645959959066",
  "分区：美食 / 美食制作",
  "视频时长：17:37",
  "视频发布时间：未知",
  "",
  "【UP主】",
  "UP主昵称：蜡笔小新美食频道",
  "UP主UID：87795103",
  "UP主粉丝数：123456",
  "UP主主页：https://space.bilibili.com/87795103",
  "",
  "【互动数据】",
  "播放量：1",
  "弹幕量：2",
  "点赞数：3",
  "投硬币枚数：4",
  "收藏人数：5",
  "转发人数：6",
  "",
  "【标签】",
  "拉面、治愈",
  "",
  "【视频简介】",
  "真正的简介",
  ""
].join("\n");

// 更老的档案：没有【互动数据】也没有视频状态行
const LEGACY_INFO = [
  "【基本信息】",
  "视频收藏时间：2022年02月05日18时27分54秒.000",
  "视频标题：平价宝藏男香",
  "视频链接：https://www.bilibili.com/video/BV14b4y1i7gN/",
  "BV号：BV14b4y1i7gN",
  "av号：未知",
  "分区：未知",
  "视频时长：未知",
  "视频发布时间：未知",
  "",
  "【UP主】",
  "UP主昵称：特务卷卷",
  "UP主UID：2065615514",
  "UP主主页：https://space.bilibili.com/2065615514",
  "",
  "【标签】",
  "未知",
  "",
  "【视频简介】",
  "-",
  ""
].join("\n");

test("the volatile-field patcher in background.js matches the shared implementation", () => {
  // background.js 是模块化 service worker，不能 require archive-core.js，所以有两份等价实现
  const local = loadBackgroundFunctions(
    ["importClean", "importIsPlaceholder", "statsSectionLines", "patchVolatileFields"],
    ["IMPORT_PLACEHOLDER_VALUES", "IMPORT_STAT_KEYS", "IMPORT_STAT_LABELS", "SECTION_HEADING_PATTERN"]
  );
  const optionsList = [
    { upFans: "999", stats: { view: 10, danmaku: 20, like: 30, coin: 40, favorite: 50, share: 60 }, pubdateText: "2026-08-14 06:00:00 星期五" },
    { videoStatus: "已失效视频（更新状态时检测到）" },
    { stats: { view: 1 } },
    { upFans: "", stats: {}, videoStatus: "正常" },
    {}
  ];
  for (const text of [FULL_INFO, LEGACY_INFO, "", "【视频简介】\n-\n"]) {
    for (const options of optionsList) {
      assert.equal(
        local.patchVolatileFields(text, options),
        core.patchVolatileFields(text, options),
        `patchVolatileFields 不一致：options=${JSON.stringify(options)}`
      );
    }
  }
});

test("updating the volatile numbers leaves everything else untouched", () => {
  const patched = core.patchVolatileFields(FULL_INFO, {
    upFans: "777",
    stats: { view: 80000, danmaku: 90, like: 700, coin: 190, favorite: 300, share: 12 },
    pubdateText: "2026-08-14 06:00:00 星期五"
  });
  const before = core.parseInfoFile(FULL_INFO);
  const after = core.parseInfoFile(patched);
  // 目标字段更新了
  assert.equal(after.fields["UP主粉丝数"], "777");
  assert.equal(after.fields["播放量"], "80000");
  assert.equal(after.fields["转发人数"], "12");
  assert.equal(after.fields["视频发布时间"], "2026-08-14 06:00:00 星期五");
  // 其它一律不动
  for (const key of ["视频标题", "视频链接", "视频收藏时间", "保存文件夹", "BV号", "av号", "分区", "视频时长", "UP主昵称", "UP主UID", "UP主主页", "视频状态", "恢复情况"]) {
    assert.equal(after.fields[key], before.fields[key], `${key} 不该被改动`);
  }
  assert.deepEqual(core.tagsFromInfo(after), core.tagsFromInfo(before));
  assert.equal(core.descriptionFromInfo(after), core.descriptionFromInfo(before));
  // 行数不变（互动数据是整块替换，不是追加）
  assert.equal(patched.split("\n").length, FULL_INFO.split("\n").length);
});

test("an invalid video only gets its status line changed, never its data", () => {
  const marker = "已失效视频（更新状态时检测到）";
  const patched = core.patchVolatileFields(FULL_INFO, { videoStatus: marker });
  assert.equal(core.parseInfoFile(patched).fields["视频状态"], marker);
  // 逐行核对：只有原来那行「视频状态：正常」变了，其余逐字相同
  const beforeLines = FULL_INFO.split("\n");
  const afterLines = patched.split("\n");
  assert.equal(afterLines.length, beforeLines.length, "不应新增或删除行");
  const diff = beforeLines.map((line, index) => (line === afterLines[index] ? null : index)).filter((index) => index !== null);
  assert.deepEqual(diff, [beforeLines.indexOf("视频状态：正常")], "除视频状态行外不应有任何差异");

  // 老档案没有视频状态行时，新增一行且不影响其它内容
  const legacyPatched = core.patchVolatileFields(LEGACY_INFO, { videoStatus: marker });
  const legacyLines = legacyPatched.split("\n");
  assert.equal(legacyLines.length, LEGACY_INFO.split("\n").length + 1);
  assert.equal(core.parseInfoFile(legacyPatched).fields["视频状态"], marker);
  assert.equal(core.parseInfoFile(legacyPatched).fields["视频标题"], "平价宝藏男香");
  assert.deepEqual(core.tagsFromInfo(core.parseInfoFile(legacyPatched)), []);
});

test("a legacy archive gains an interactive-stats block in the right place", () => {
  const patched = core.patchVolatileFields(LEGACY_INFO, {
    upFans: "702814",
    stats: { view: 29044453, danmaku: 502, like: 303835, coin: 67336, favorite: 265976, share: 22887 }
  });
  const info = core.parseInfoFile(patched);
  assert.equal(info.fields["播放量"], "29044453");
  assert.equal(info.fields["UP主粉丝数"], "702814");
  // 【互动数据】必须排在【标签】之前，且前后各留空行
  const lines = patched.split("\n");
  assert.ok(lines.indexOf("【互动数据】") < lines.indexOf("【标签】"));
  assert.ok(lines.indexOf("【互动数据】") > 0 && lines[lines.indexOf("【互动数据】") - 1] === "");
  assert.ok(lines[lines.indexOf("【互动数据】") + 7] === "", "互动数据块后应有空行");
  // 标签与简介没有被动过
  assert.deepEqual(core.tagsFromInfo(info), []);
  assert.equal(core.descriptionFromInfo(info), "");
});

test("invalid detection relies on API error codes, not on network failures", () => {
  const source = readProjectFile("background.js");
  // 接口错误码要挂在 error 上，调用方才能区分
  assert.match(source, /apiError\.apiCode = payload\.code/);
  assert.match(source, /if \(typeof error\?\.apiCode === "number"\) invalid = true;/);
  assert.match(source, /else throw error;/);
  // 失效只写标记，不碰其它字段
  assert.match(source, /const STATUS_INVALID_MARKER = "已失效视频（更新状态时检测到）"/);
  assert.match(source, /patchVolatileFields\(text, \{ videoStatus: STATUS_INVALID_MARKER \}\)/);
  // 已经标过失效的不要重复改写，避免覆盖更具体的「已尝试恢复」说明
  assert.match(source, /if \(\/\^视频状态：\.\*失效\/m\.test\(text\)\) return "unchanged";/);
  // 刷新成功时顺便把之前误标的失效清掉
  assert.match(source, /currentStatus === STATUS_INVALID_MARKER \? "正常" : undefined/);
});

test("the status refresh always asks for confirmation first", () => {
  const html = readProjectFile("library.html");
  const library = readProjectFile("library.js");
  // 4.5.1：单条与批量都先弹确认框，把「别频繁刷接口」讲清楚
  for (const id of ["statusConfirm", "statusConfirmCount", "statusConfirmGo", "statusConfirmCancel", "statusConfirmProgress"]) {
    assert.match(html, new RegExp(`id="${id}"`), `library.html 缺少 #${id}`);
  }
  assert.match(html, /请勿频繁更新：每次更新都会请求 B 站接口/);
  assert.match(library, /function openStatusConfirm\(/);
  assert.match(library, /function runStatusRefresh\(/);
  // 详情里的按钮不再直接刷新，而是先确认
  assert.match(library, /\.refresh-status"\)\.addEventListener\("click", \(\) => openStatusConfirm\(\[video\], "detail"\)\)/);
  assert.equal(/refreshOneVideoStatus/.test(library), false, "旧的无确认刷新入口应已删除");
  // 仍然共用后台的串行队列，请求频率不变
  assert.match(library, /type: "bca-refresh-video-stats"/);
  assert.match(library, /limit: STATUS_BATCH_LIMIT/);
  assert.match(library, /const STATUS_BATCH_LIMIT = 80;/);
  assert.match(readProjectFile("background.js"), /"bca-refresh-video-stats"/);
  assert.match(readProjectFile("background.js"), /saveQueue\.then\(\(\) => refreshVideoStatus/);
});

test("batch manage can refresh the selected records", () => {
  const html = readProjectFile("library.html");
  const library = readProjectFile("library.js");
  assert.match(html, /id="updateSelected"/);
  // 用勾选的记录，不是当前收藏夹的全部视频
  assert.match(library, /updateSelectedButton\.addEventListener\("click", \(\) => openStatusConfirm\(selectedRecords\(\), "batch"\)\)/);
  assert.equal(/openStatusConfirm\(selectedVideos\(\)/.test(library), false, "批量更新必须用 selectedRecords()");
  // 没有 BV/av 号的记录没法更新
  assert.match(library, /updateSelectedButton\.disabled = !records\.some\(canRefreshStatus\)/);
});
test("the library can sort by view count", () => {
  const html = readProjectFile("library.html");
  const library = readProjectFile("library.js");
  assert.match(html, /<option value="views"[^>]*>播放量从高到低<\/option>/);
  assert.match(library, /if \(sort === "views"\) return viewsOf\(b\) - viewsOf\(a\)/);
  // 没有播放量数据的记录排到最后，而不是当成 0 播放
  assert.match(library, /Number\.isFinite\(value\) && value > 0 \? value : -1/);
});

test("the video card shows the view count at the bottom-right of the cover", () => {
  const library = readProjectFile("library.js");
  const css = readProjectFile("library.css");
  assert.match(library, /<span class="cover-views tnum" hidden><\/span>/);
  assert.match(library, /const viewsBadge = card\.querySelector\("\.cover-views"\)/);
  assert.match(library, /const viewsText = formatCount\(video\.stats\?\.view\)/);
  // 右下角定位
  const rule = (css.match(/\.cover-views \{[^}]*\}/) || [""])[0];
  assert.match(rule, /right:/, "播放量徽标应贴右边");
  assert.match(rule, /bottom:/, "播放量徽标应贴底边");
  assert.match(rule, /position: absolute/);
});

/* ------------------------- 4.5 主题与多语言 ------------------------- */

test("the dark theme only redefines tokens, and both triggers agree", () => {
  const css = readProjectFile("theme.css");
  const tokensOf = (block) => [...block.matchAll(/(--[a-z0-9-]+):/g)].map((match) => match[1]).sort();
  const manual = css.match(/:root\[data-theme="dark"\] \{([\s\S]*?)\n\}/);
  const system = css.match(/:root:not\(\[data-theme="light"\]\) \{([\s\S]*?)\n  \}/);
  assert.ok(manual, "缺少手动深色的令牌块");
  assert.ok(system, "缺少跟随系统的令牌块");
  const a = tokensOf(manual[1]);
  const b = tokensOf(system[1]);
  assert.ok(a.length >= 30, `深色令牌太少：${a.length}`);
  assert.deepEqual(a, b, "两处深色令牌必须完全一致");
  // 关键令牌都要覆盖到，否则会出现深色下读不清的文字
  for (const token of ["--ink", "--text", "--muted", "--surface", "--bg", "--line", "--brand-deep", "--warning-soft", "--danger"]) {
    assert.ok(a.includes(token), `深色主题缺少 ${token}`);
  }
  // 浅色块自身要有 color-scheme，滚动条也要走令牌
  assert.match(css, /color-scheme: light;/);
  assert.match(css, /color-scheme: dark;/);
  // 滚动条也要走令牌，否则深色下会留一条亮灰
  assert.match(css, /scrollbar-color: var\(--scroll-thumb\)/);
  assert.match(css, /::-webkit-scrollbar-thumb \{[^}]*background: var\(--scroll-thumb\)/);
});

test("the open-source banner is green, scrolling and closable", () => {
  const html = readProjectFile("library.html");
  const css = readProjectFile("library.css");
  const library = readProjectFile("library.js");
  for (const id of ["githubBanner", "githubBannerLink", "dismissGithubBanner"]) {
    assert.match(html, new RegExp(`id="${id}"`), `library.html 缺少 #${id}`);
  }
  // 两段一模一样的文字才能无缝循环
  assert.equal([...html.matchAll(/class="banner-run"/g)].length, 2, "跑马灯要有两段相同文字");
  assert.match(css, /@keyframes banner-scroll \{[^\n]*translateX\(-50%\)/);
  assert.match(css, /\.banner-scroll \{[^}]*animation: banner-scroll/);
  // 悬停暂停，方便点
  assert.match(css, /\.banner-track:hover \.banner-scroll \{ animation-play-state: paused; \}/);
  // 绿色底
  assert.match(css, /\.github-banner \{[^}]*var\(--success-solid\)/);
  // 链接新窗口打开且带 rel 保护
  const anchorTag = (html.match(/<a id="githubBannerLink"[^>]*>/) || [""])[0];
  assert.match(anchorTag, /target="_blank"/);
  assert.match(anchorTag, /rel="noopener noreferrer"/);
  // 仓库地址只有一处，方便开源后替换
  assert.match(library, /const PROJECT_REPO_URL = "https:\/\/github\.com\/[^"]+";/);
  assert.equal([...library.matchAll(/const PROJECT_REPO_URL/g)].length, 1, "仓库地址只应定义一处");
  // 关闭后记住
  assert.match(library, /githubBannerDismissed/);
  assert.match(library, /document\.documentElement\.classList\.add\("banner-visible"\)/);
  assert.match(library, /document\.documentElement\.classList\.remove\("banner-visible"\)/);
  // 横幅出现时侧栏与主区要一起下移，否则会被压住
  assert.match(css, /\.sidebar \{ top: var\(--banner-h\); \}/);
  assert.match(css, /\.main-area \{ padding-top: var\(--banner-h\); \}/);
});

test("solid buttons put white text on a readable green", () => {
  const theme = readProjectFile("theme.css");
  const light = Object.fromEntries([...theme.match(/:root \{([\s\S]*?)\n\}/)[1].matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
  const dark = Object.assign({}, light, Object.fromEntries([...theme.match(/:root\[data-theme="dark"\] \{([\s\S]*?)\n\}/)[1].matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()])));
  // --success 在深色主题里是浅绿，白字压上去只有 2.2；实心按钮必须用 --success-solid
  for (const [mode, table] of [["浅色", light], ["深色", dark]]) {
    const ratio = contrastRatio("#ffffff", table["--success-solid"]);
    assert.ok(ratio >= 4.5, `${mode}的 --success-solid 上白字对比度只有 ${ratio.toFixed(2)}`);
  }
  for (const cssFile of ["library.css", "download.css"]) {
    const css = readProjectFile(cssFile);
    // 不允许再出现「白字 + var(--success)」的组合
    for (const match of css.matchAll(/\{([^}]*)\}/g)) {
      const block = match[1];
      if (/color:\s*#fff/.test(block) && /background:\s*var\(--success\)/.test(block)) {
        assert.fail(`${cssFile} 里有白字压在 --success 上：${block.trim().replace(/\s+/g, " ").slice(0, 70)}`);
      }
    }
  }
});

test("batch manage is green and its status refresh is yellow", () => {
  const html = readProjectFile("library.html");
  const css = readProjectFile("library.css");
  assert.match(html, /<button id="batchManage" class="button button-success"/);
  assert.match(html, /<button id="updateSelected" class="button button-warning"/);
  assert.match(css, /\.button-success \{[^}]*var\(--success-solid\)/);
  // 黄色按钮走软底 + 深色文字，两套主题下都清楚
  assert.match(css, /\.button-warning \{[^}]*color: var\(--warning\)[^}]*background: var\(--warning-soft\)/);
});
test("create-collection sits under the last collection", () => {
  const html = readProjectFile("library.html");
  const css = readProjectFile("library.css");
  const listAt = html.indexOf('id="collectionList"');
  const createAt = html.indexOf('id="createCollection"');
  assert.ok(listAt > 0 && createAt > listAt, "新建入口必须排在收藏夹列表之后");
  // 不能再留在「我的收藏夹」标题那一行
  const headingAt = html.indexOf('class="collection-heading"');
  assert.ok(createAt > html.indexOf("</nav>", headingAt < 0 ? 0 : headingAt), "新建入口应在列表容器之后");
  assert.match(css, /\.collection-create-tail \{[^}]*width: calc\(100% - var\(--sp-4\)\)/);
  assert.match(css, /\.collection-create-tail \{[^}]*border-style: dashed/);
});

test("the logo is styled consistently and grays out when disabled", () => {
  const libraryCss = readProjectFile("library.css");
  const popupCss = readProjectFile("popup.css");
  const background = readProjectFile("background.js");
  // 工具栏图标：圆角比例、渐变、关闭时转灰
  assert.match(background, /const radius = box \* 0\.235;/);
  assert.match(background, /createLinearGradient\(0, inset, 0, inset \+ box\)/);
  assert.match(background, /gradient\.addColorStop\(0, "#38c1ea"\)/);
  assert.match(background, /gradient\.addColorStop\(0, "#aab1ba"\)/, "关闭自动归档时要有灰色渐变");
  // 网页与弹窗的 logo 用同一套观感
  assert.match(libraryCss, /\.brand-mark \{[^}]*background: linear-gradient\(160deg, var\(--brand-tint\)/);
  assert.match(libraryCss, /\.brand-mark \{[^}]*inset 0 1px 0/);
  assert.match(popupCss, /\.brand-icon\.disabled \{ background: var\(--ghost\)/);
});

test("the abuse warning is emphasised on all three surfaces", () => {
  for (const [htmlFile, cssFile] of [["library.html", "library.css"], ["download.html", "download.css"], ["popup.html", "popup.css"]]) {
    assert.match(readProjectFile(htmlFile), /<li class="safety-abuse" data-i18n="请勿滥用：/, `${htmlFile} 的「请勿滥用」缺少 safety-abuse 标记`);
    const rule = (readProjectFile(cssFile).match(/\.safety[-a-z]*list li\.safety-abuse \{[^}]*\}/) || [""])[0];
    assert.match(rule, /font-weight: 700/, `${cssFile} 的「请勿滥用」应加粗`);
    assert.match(rule, /text-decoration: underline/, `${cssFile} 的「请勿滥用」应加下划线`);
    // 强调色必须走令牌，深色下才正常
    assert.match(rule, /var\(--warning\)/, `${cssFile} 的强调色应使用 --warning 令牌`);
  }
});
test("theme and language are floating balls, not sidebar selects", () => {
  const html = readProjectFile("library.html");
  const library = readProjectFile("library.js");
  // 4.5.1：原来的侧栏 <select> 太小，改成右下角悬浮球
  assert.equal(/id="themeSelect"/.test(html), false, "旧的主题下拉框应已删除");
  assert.equal(/id="localeSelect"/.test(html), false, "旧的语言下拉框应已删除");
  for (const id of ["themeBall", "themeMenu", "localeBall", "localeMenu", "themeBallIcon"]) {
    assert.match(html, new RegExp(`id="${id}"`), `library.html 缺少 #${id}`);
  }
  assert.match(library, /function toggleDockMenu\(/);
  assert.match(library, /function closeDockMenus\(/);
  assert.match(library, /function renderDockMenus\(/);
  assert.match(library, /BcaTheme\.use\(id\)/);
  assert.match(library, /BcaI18n\.use\(id\)/);
  // 球的图标跟着当前主题走
  assert.match(library, /const THEME_ICONS = \{ system: "monitor", light: "sun", dark: "moon" \}/);
  // 悬浮球必须真的浮起来
  const rule = (readProjectFile("library.css").match(/\.floating-dock \{[^}]*\}/) || [""])[0];
  assert.match(rule, /position: fixed/);
  assert.match(rule, /right:/);
  assert.match(rule, /bottom:/);
  // 点空白处和按 Esc 都要收起
  assert.match(library, /document\.addEventListener\("click", \(\) => closeDockMenus\(\)\)/);
  assert.match(library, /event\.key === "Escape"/);
});
test("the interface language switcher offers three locales", () => {
  const html = readProjectFile("library.html");
  const library = readProjectFile("library.js");
  assert.match(html, /<script src="i18n\.js"><\/script>/);
  assert.match(html, /<script src="theme\.js"><\/script>/);
  assert.match(library, /BcaI18n\.locales\(\)/);
  assert.match(library, /function relabelAfterLocaleChange\(/);
  assert.match(library, /BcaI18n\.onChange\(/);
  assert.match(library, /BcaI18n\.init\(\)/);
  const i18n = readProjectFile("i18n.js");
  for (const locale of ["zh-CN", "zh-TW", "en"]) {
    assert.ok(i18n.includes(`id: "${locale}"`), `i18n.js 缺少 ${locale}`);
  }
  // 简体中文是原文语言，不需要词典文件
  assert.match(i18n, /用中文原文当 key/);
  // 内容脚本不能翻译宿主页面
  assert.match(i18n, /inExtensionPage\(\)/);
  // 主题/语言名本身不翻译
  assert.match(library, /语言名用各自的写法，不翻译/);
});
// 使用须知必须在三个界面逐字一致，否则用户在不同入口看到的说法会不一样。
// 4.5 起条目上带了 data-i18n、4.5.1 又加了 class，所以先剥掉属性再比文字。
function noticeItems(html) {
  const cleaned = html.replace(/\sdata-i18n(?:-html|-title|-placeholder|-aria)?="[^"]*"/g, "").replace(/\sclass="safety-abuse"/g, "");
  const list = (cleaned.match(/<ul class="safety-(?:notice-)?list"[^>]*>([\s\S]*?)<\/ul>/) || ["", ""])[1];
  return [...list.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((match) => match[1]
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim());
}

test("all three surfaces show the same six safety items, abuse warning first", () => {
  const surfaces = ["library.html", "download.html", "popup.html"];
  const lists = Object.fromEntries(surfaces.map((file) => [file, noticeItems(readProjectFile(file))]));
  for (const file of surfaces) {
    assert.equal(lists[file].length, 6, `${file} 的使用须知应正好六条`);
    // 4.5：请勿滥用提到最前面
    assert.ok(lists[file][0].startsWith("请勿滥用："), `${file} 的第一条必须是「请勿滥用」`);
    assert.equal(lists[file].filter((item) => item.startsWith("请勿滥用：")).length, 1, `${file} 的「请勿滥用」只应出现一次`);
    const html = readProjectFile(file);
    assert.ok(html.includes("github.com/leiurayer/downkyi"), `${file} 缺少 DownKyi 链接`);
    assert.ok(html.includes("_blank") && html.includes("noopener"), `${file} 的 DownKyi 链接缺少新窗口保护`);
  }
  assert.deepEqual(lists["download.html"], lists["library.html"], "下载页与收藏库的须知必须一致");
  assert.deepEqual(lists["popup.html"], lists["library.html"], "弹窗与收藏库的须知必须一致");
});
test("the safety notice is collapsible but can no longer be dismissed", () => {
  const libraryHtml = readProjectFile("library.html");
  const libraryJs = readProjectFile("library.js");
  const popupHtml = readProjectFile("popup.html");
  // 4.4.1：去掉「知道了，不再显示」按钮，也不再写任何“已关闭”状态
  assert.equal(/id="dismissSafety"/.test(libraryHtml), false, "不该再有不再提示按钮");
  assert.equal(/dismissSafetyButton/.test(libraryJs), false, "不该再有不再提示的绑定");
  assert.equal(/safetyNoticeDismissed:\s*true/.test(libraryJs), false, "不该再写入关闭状态");
  assert.equal(/safetyNotice\.hidden\s*=\s*true/.test(libraryJs), false, "不该再隐藏须知");
  // 但保留可折叠
  assert.match(libraryHtml, /<details id="safetyNotice"/);
  assert.equal(/<details id="safetyNotice" class="safety-notice" hidden/.test(libraryHtml), false, "须知不能默认隐藏");
});

// 只挑出选择器里含 .safety 的规则，避免把相邻组件的样式算进来
function safetyRules(css) {
  return [...css.matchAll(/([^\n{}]*\.safety[^\n{}]*)\{([^}]*)\}/g)].map((match) => `${match[1]}{${match[2]}}`);
}

test("the safety notice uses the warning palette with larger type", () => {
  const popupHtml = readProjectFile("popup.html");
  for (const file of ["library.css", "download.css", "popup.css"]) {
    const rules = safetyRules(readProjectFile(file));
    assert.ok(rules.length >= 5, `${file} 里找不到须知样式`);
    const all = rules.join("\n");
    assert.match(all, /var\(--warning-soft\)/, `${file} 的须知应为黄色底`);
    assert.match(all, /var\(--warning-line\)/, `${file} 的须知应为黄色描边`);
    // 4.4.1 要求字号调大：须知正文（列表）至少 --fs-md(15px)
    assert.ok(
      rules.some((rule) => /\.safety[-a-z]*list[^{]*\{[^}]*font-size: var\(--fs-md\)/.test(rule)),
      `${file} 的须知正文字号应调到 --fs-md`
    );
    assert.equal(/var\(--brand-soft\)/.test(all), false, `${file} 的须知不该再用品牌蓝底`);
  }
  // 弹窗里须知必须排在 brand-row 之前（置顶）
  assert.ok(popupHtml.indexOf('id="safetyNotice"') < popupHtml.indexOf('class="brand-row"'), "弹窗的须知应置顶");
});

/* ------------------------- 4.5 多语言词典 ------------------------- */

// 在沙箱里加载 theme.js / i18n.js：它们都是 IIFE，参数化 globalThis 就能隔离测试
function loadThemeModule({ stored = null, prefersDark = false } = {}) {
  const attributes = {};
  const listeners = {};
  const storage = { value: stored, getItem() { return this.value; }, setItem(_key, next) { this.value = next; } };
  const sandbox = {
    localStorage: storage,
    matchMedia: () => ({ matches: prefersDark, addEventListener() {} }),
    // theme.js 会监听 localStorage 的 storage 事件做跨页同步，这里留个可派发的入口
    addEventListener(type, handler) { (listeners[type] = listeners[type] || []).push(handler); },
    dispatch(type, event) { (listeners[type] || []).forEach((handler) => handler(event)); }
  };
  const fakeDocument = {
    documentElement: {
      dataset: {},
      setAttribute(name, value) { attributes[name] = value; },
      removeAttribute(name) { delete attributes[name]; }
    }
  };
  new Function("globalThis", "document", readProjectFile("theme.js"))(sandbox, fakeDocument);
  return { api: sandbox.BcaTheme, attributes, storage, sandbox };
}

test("theme.js resolves 白天 / 夜晚 / 跟随系统 correctly", () => {
  // 默认跟随系统：不挂 data-theme，交给 theme.css 的媒体查询
  let theme = loadThemeModule({ prefersDark: false });
  assert.equal(theme.api.current(), "system");
  assert.equal(theme.attributes["data-theme"], undefined, "跟随系统时不该挂 data-theme");
  assert.equal(theme.api.resolved(), "light");

  theme = loadThemeModule({ prefersDark: true });
  assert.equal(theme.api.resolved(), "dark", "系统是深色时要解析成 dark");

  // 手选白天：必须挂 data-theme="light"，否则挡不住系统的深色
  theme = loadThemeModule({ prefersDark: true, stored: "light" });
  assert.equal(theme.attributes["data-theme"], "light");
  assert.equal(theme.api.resolved(), "light", "手选白天要压过系统深色");

  theme = loadThemeModule({ stored: "dark" });
  assert.equal(theme.attributes["data-theme"], "dark");
  assert.equal(theme.api.resolved(), "dark");

  // 切回跟随系统要摘掉属性
  theme.api.use("system");
  assert.equal(theme.attributes["data-theme"], undefined, "切回跟随系统要摘掉 data-theme");

  // 存储里是非法值时退回默认，不能让页面挂掉
  theme = loadThemeModule({ stored: "neon" });
  assert.equal(theme.api.current(), "system");
});

function loadI18nModule({ locale = null, dictionary = null, contentScript = false } = {}) {
  const sandbox = {
    location: { protocol: contentScript ? "https:" : "chrome-extension:" },
    // 内容脚本模式下让 fetch 直接抛错：真走了 fetch 测试就会挂，
    // 这样能证明它确实改走了后台代取
    fetch: async () => {
      if (contentScript) throw new Error("内容脚本不该直接 fetch 扩展资源");
      return { ok: dictionary !== null, json: async () => dictionary };
    },
    chrome: {
      runtime: {
        getURL: (path) => `chrome-extension://test/${path}`,
        sendMessage: async (message) => (message?.type === "bca-locale"
          ? { ok: dictionary !== null, dictionary }
          : { ok: false })
      },
      storage: { local: { get: async () => (locale ? { interfaceLocale: locale } : {}), set: async () => {} } }
    }
  };
  const fakeDocument = { documentElement: { lang: "" }, querySelectorAll: () => [] };
  // i18n.js 里用的是裸 chrome / fetch 全局，必须作为函数参数注入才遮得住
  new Function("globalThis", "document", "chrome", "fetch", readProjectFile("i18n.js"))(
    sandbox, fakeDocument, sandbox.chrome, sandbox.fetch
  );
  return sandbox.BcaI18n;
}

test("a theme picked elsewhere syncs into this page", () => {
  // 用户在插件弹窗里选了「夜晚」，已经打开的收藏库要跟着变。
  // 主题存在 localStorage，同源页面之间靠 storage 事件传递。
  const theme = loadThemeModule({ prefersDark: false });
  assert.equal(theme.api.current(), "system");
  assert.equal(theme.attributes["data-theme"], undefined);

  // 模拟别的页面写了 localStorage，浏览器在本页派发 storage 事件
  theme.storage.value = "dark";
  theme.sandbox.dispatch("storage", { key: "interfaceTheme", newValue: "dark" });
  assert.equal(theme.api.current(), "dark");
  assert.equal(theme.attributes["data-theme"], "dark", "别的页面改了主题，本页要跟着挂上 data-theme");

  // 别的键变化不该影响主题
  theme.storage.value = "light";
  theme.sandbox.dispatch("storage", { key: "interfaceLocale", newValue: "en" });
  assert.equal(theme.api.current(), "dark", "只有 interfaceTheme 变化才该改主题");
});
test("i18n uses the Chinese source as key and falls back to it", async () => {
  const i18n = loadI18nModule({ dictionary: { "使用须知": "Before you start", "已选 {count} 个": "{count} selected" } });
  await i18n.init();
  assert.equal(i18n.locale(), "zh-CN");
  // 简体中文没有词典文件，一律回退原文
  assert.equal(i18n.t("使用须知"), "使用须知");
  assert.equal(i18n.t("词典里没有的键"), "词典里没有的键");
  assert.equal(i18n.t("已选 {count} 个", { count: 3 }), "已选 3 个");

  await i18n.use("en");
  assert.equal(i18n.locale(), "en");
  assert.equal(i18n.t("使用须知"), "Before you start");
  assert.equal(i18n.t("已选 {count} 个", { count: 7 }), "7 selected");
  // 词典没覆盖的仍然回退原文，不会显示成空白或键名
  assert.equal(i18n.t("词典里没有的键"), "词典里没有的键");

  // 非法语言退回简体中文
  await i18n.use("ja");
  assert.equal(i18n.locale(), "zh-CN");
});

test("a content script gets its dictionary from the background, not by fetching", async () => {
  const i18n = loadI18nModule({ contentScript: true, dictionary: { "使用须知": "Before you start", "已选 {count} 个": "{count} selected" } });
  await i18n.init();
  assert.equal(i18n.t("使用须知"), "使用须知");
  await i18n.use("en");
  // 词典能拿到，说明走的是 sendMessage 那条路（fetch 在这个沙箱里是抛错的）
  assert.equal(i18n.t("使用须知"), "Before you start");
  assert.equal(i18n.t("已选 {count} 个", { count: 2 }), "2 selected");
});
test("content scripts never fetch extension resources directly", () => {
  // 4.3 起刻意移除了 web_accessible_resources（否则 B 站页面能把收藏库嵌进 iframe）。
  // 内容脚本跑在网页里，直接 fetch 扩展资源会被浏览器拦掉，而我们的 try/catch
  // 会把它吞成空词典 —— 表现为提示卡永远显示中文、且不报任何错。
  // 所以内容脚本必须走后台代取。
  const i18n = readProjectFile("i18n.js");
  const background = readProjectFile("background.js");
  const manifest = JSON.parse(readProjectFile("manifest.json"));
  assert.equal(manifest.web_accessible_resources, undefined, "不应为了让内容脚本读词典而重新开放扩展资源");
  assert.match(i18n, /if \(!inExtensionPage\(\)\) \{/, "内容脚本必须走另一条加载路径");
  assert.match(i18n, /type: "bca-locale", locale/, "内容脚本应请后台代取词典");
  assert.match(background, /"bca-locale"/, "后台需要提供词典代理");
  assert.match(background, /fetch\(chrome\.runtime\.getURL\(`locales\/\$\{locale\}\.json`\)\)/, "后台读自己的资源不受限");
  // 每个非默认语言都必须真的有词典文件
  for (const locale of ["zh-TW", "en"]) {
    assert.ok(fs.existsSync(path.join(__dirname, "..", "locales", `${locale}.json`)), `缺少 locales/${locale}.json`);
  }
});

test("i18n never touches the host page from a content script", async () => {
  const i18n = loadI18nModule({ dictionary: { "使用须知": "Before you start" } });
  const source = readProjectFile("i18n.js");
  // 内容脚本必须走 root 参数，且不能改宿主页面的 lang
  assert.match(source, /function inExtensionPage\(\)/);
  assert.match(source, /global\.location\?\.protocol === "chrome-extension:"/);
  assert.match(source, /else if \(options\.root\) \{/);
  await i18n.use("en");
  assert.equal(i18n.locale(), "en");
});
const i18nTools = require("./i18n-extract.cjs");

test("every translated string uses a literal key", () => {
  // 原文即 key，key 一旦是拼接或变量，提取工具就扫不到，词典必然漏条目。
  // 唯一例外是「把 background 的文案在显示处翻译」——那是设计上就有的动态透传
  // （见 AI_HANDOFF 的已知限制），这里显式放行并注明原因。
  const ALLOWED = [
    // 4.5：background 的文案（进度、错误）在显示处翻译，本身就是动态字符串。
    // 静态的能在词典里查到就翻，查不到的按原文显示，不会出错。
    /BcaI18n\.t\(\s*[A-Za-z_$][\w$.]*\.message\b/,
    /BcaI18n\.t\(message\.text\b/
  ];
  // 视频标题、UP 主名、简介、标签、BV 号、路径这些是固有名称，任何语言下都不能改
  const DATA_FIELDS = /\.(title|upName|upHome|description|tags|bvid|aid|cid|collection|directory|reportPath)\b/;
  for (const file of ["library.js", "popup.js", "download.js", "content.js"]) {
    const source = readProjectFile(file);
    for (const match of source.matchAll(/(?:\bBcaI18n\.)?\bt\(\s*([^"'\s)])/g)) {
      const call = source.slice(match.index, match.index + 120);
      // 只关心「第一个参数不是字面量」的调用，参数对象里的字段不算
      const argument = call.replace(/^[^(]*\(\s*/, "").split(",")[0];
      assert.equal(
        DATA_FIELDS.test(argument), false,
        `${file} 把固有名称包进了 t()：${call.split("\n")[0].slice(0, 80)}`
      );
      if (ALLOWED.some((pattern) => pattern.test(call))) continue;
      assert.fail(`${file} 里的 t() 第一个参数必须是字符串字面量，发现：${call.split("\n")[0].slice(0, 80)}`);
    }
  }
});

test("translations keep real folder and file names verbatim", () => {
  // 归档目录名与文件名是磁盘上真实存在的。译文一旦把「000视频下载」翻成
  // 「000 Video Downloads」，界面显示的名字就和实际文件夹对不上了。
  // 这类名字在任何语言下都必须逐字保留。
  const REAL_NAMES = ["000视频下载", "001错误报告", "视频信息.txt", "封面.png"];
  const keys = [...i18nTools.collect().keys()];
  for (const locale of ["zh-TW", "en"]) {
    const dictionary = i18nTools.readDictionary(locale) || {};
    for (const key of keys) {
      const value = dictionary[key];
      if (!value) continue; // 还没翻译，由覆盖率那条测试负责报
      for (const name of REAL_NAMES) {
        if (key.includes(name)) {
          assert.ok(value.includes(name), `${locale} 的译文改动了真实文件名「${name}」：${value}`);
        }
      }
    }
  }
});
test("the extractor also picks up strings passed as arguments", () => {
  // content.js 的提示卡文字是通过 showNotice(...) 传进去、再挂到 dataset.i18n 上的，
  // 属性式扫描一条都收不到。这类"传参式"文案漏掉的话，提示卡永远不会被翻译。
  const keys = [...i18nTools.collect().keys()];
  for (const text of [
    "正在归档视频…",
    "B站已完成收藏，正在保存视频信息和封面。",
    "归档成功",
    "归档失败",
    "关闭",
    "打开本地收藏库"
  ]) {
    assert.ok(keys.includes(text), `提取工具漏掉了内容脚本的文案：${text}`);
  }
});
test("the zh-TW and en dictionaries cover every interface string", () => {
  const keys = [...i18nTools.collect().keys()];
  // 提取规则一旦失效就会悄悄“全过”，所以先卡一个下限
  assert.ok(keys.length >= 150, `只提取到 ${keys.length} 条词条，提取规则可能已经失效`);
  for (const locale of ["zh-TW", "en"]) {
    const dictionary = i18nTools.readDictionary(locale);
    assert.ok(dictionary, `缺少 locales/${locale}.json`);
    const missing = keys.filter((key) => !dictionary[key]);
    assert.equal(missing.length, 0, `${locale} 还缺 ${missing.length} 条翻译：${missing.slice(0, 3).join(" / ")}`);
    // 译文不能原样照抄中文（除非确实同形，例如专有名词）
    const identical = keys.filter((key) => dictionary[key] === key);
    assert.ok(identical.length < keys.length * 0.1, `${locale} 有 ${identical.length} 条译文与原文完全相同，疑似没翻`);
  }
});

test("every data-i18n marker matches its element text exactly", () => {
  // data-i18n 用 textContent 覆盖。属性值和元素里的中文一旦不一致，
  // 切到别的语言再切回来就会显示成属性值那份——静默的错误。
  // 另外带子元素的元素不能直接用 data-i18n，否则子元素会被整块清掉。
  const problems = [];
  for (const file of ["library.html", "download.html", "popup.html"]) {
    const html = readProjectFile(file);
    for (const match of html.matchAll(/<([a-z0-9-]+)((?:[^>]*?))\sdata-i18n="([^"]*)"((?:[^>]*?))>([\s\S]*?)<\/\1>/gi)) {
      const [, tag, , key, , inner] = match;
      if (/<[a-z]/i.test(inner)) {
        problems.push(`${file}: <${tag} data-i18n="${key.slice(0, 18)}…"> 里还有子元素，textContent 会把它们清掉`);
        continue;
      }
      const text = inner.replace(/\s+/g, " ").trim();
      if (text !== key) problems.push(`${file}: data-i18n="${key.slice(0, 24)}…" 与元素文字「${text.slice(0, 24)}…」不一致`);
    }
  }
  assert.deepEqual(problems, [], `data-i18n 标记有问题：\n${problems.join("\n")}`);
});

test("the interface strings are actually marked up across every surface", () => {
  // 每个界面都要真的接入 i18n，不能只做一个页面
  assert.ok(readProjectFile("library.html").includes('src="i18n.js"'), "收藏库未引入 i18n.js");
  assert.ok(readProjectFile("download.html").includes('src="i18n.js"'), "下载页未引入 i18n.js");
  assert.ok(readProjectFile("popup.html").includes('src="i18n.js"'), "弹窗未引入 i18n.js");
  const manifest = JSON.parse(readProjectFile("manifest.json"));
  assert.ok(manifest.content_scripts[0].js.includes("i18n.js"), "内容脚本需要 i18n.js 才能翻译提示卡");
  for (const file of ["library.html", "download.html", "popup.html"]) {
    const marked = [...readProjectFile(file).matchAll(/data-i18n(?:-html|-title|-placeholder|-aria)?="/g)].length;
    assert.ok(marked >= 15, `${file} 只标了 ${marked} 处，覆盖面明显不足`);
  }
  for (const file of ["library.js", "popup.js", "download.js"]) {
    const calls = [...readProjectFile(file).matchAll(/(?:\bBcaI18n\.)?\bt\("/g)].length;
    assert.ok(calls >= 20, `${file} 只用了 ${calls} 次 t()，动态文案覆盖不足`);
  }
});

test("every element the scripts reach for actually exists in the markup", () => {
  // getElementById 拿不到只会得到 null，很多地方是 `?.` 静默跳过，坏了也很难发现
  for (const [htmlFile, jsFiles] of [
    ["library.html", ["library.js"]],
    ["download.html", ["download.js"]],
    ["popup.html", ["popup.js"]]
  ]) {
    const ids = new Set([...readProjectFile(htmlFile).matchAll(/id="([^"]+)"/g)].map((match) => match[1]));
    for (const jsFile of jsFiles) {
      const wanted = [...new Set([...readProjectFile(jsFile).matchAll(/getElementById\("([^"]+)"\)/g)].map((match) => match[1]))];
      const missing = wanted.filter((id) => !ids.has(id));
      assert.deepEqual(missing, [], `${jsFile} 引用了 ${htmlFile} 里不存在的 id`);
    }
  }
});

// WCAG 相对亮度对比度：深色模式最容易悄悄出「文字读不清」，必须机器守住
function relativeLuminance(hex) {
  const full = hex.replace("#", "").trim();
  const expanded = full.length === 3 ? full.split("").map((c) => c + c).join("") : full;
  const [r, g, b] = [0, 2, 4]
    .map((i) => parseInt(expanded.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrastRatio(a, b) {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

test("both themes keep text readable against its background", () => {
  const css = readProjectFile("theme.css");
  const parse = (block) => Object.fromEntries([...block.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
  const light = parse(css.match(/:root \{([\s\S]*?)\n\}/)[1]);
  const dark = Object.assign({}, light, parse(css.match(/:root\[data-theme="dark"\] \{([\s\S]*?)\n\}/)[1]));
  // [前景, 背景, 最低对比度, 说明]
  const PAIRS = [
    ["--ink", "--surface", 4.5, "标题"],
    ["--text", "--surface", 4.5, "正文"],
    ["--muted", "--surface", 4.5, "次要文字"],
    ["--faint", "--surface", 3.0, "弱化说明"],
    ["--text", "--surface-soft", 4.5, "卡片正文"],
    ["--ink", "--bg", 4.5, "页面背景上的标题"],
    ["--brand-deep", "--brand-soft", 4.5, "品牌软底上的文字"],
    ["--warning", "--warning-soft", 4.5, "使用须知文字"],
    ["--danger", "--danger-soft", 4.5, "错误文字"],
    ["--danger-strong", "--danger-soft", 4.5, "错误强调文字"],
    ["--success-strong", "--success-soft", 4.5, "成功文字"],
    ["--muted", "--surface-sunken", 4.5, "凹陷区文字"]
  ];
  const problems = [];
  for (const [mode, table] of [["浅色", light], ["深色", dark]]) {
    for (const [fg, bg, min, label] of PAIRS) {
      if (!table[fg] || !table[bg]) { problems.push(`${mode} 缺少令牌 ${fg} 或 ${bg}`); continue; }
      const ratio = contrastRatio(table[fg], table[bg]);
      if (ratio < min) problems.push(`${mode}：${label}（${fg} on ${bg}）对比度只有 ${ratio.toFixed(2)}，低于 ${min}`);
    }
  }
  assert.deepEqual(problems, [], `对比度不足：\n${problems.join("\n")}`);
});
test("every design token referenced by a page actually exists", () => {
  // CSS 变量名写错不会报错，只会静默失效（颜色掉成继承值），必须靠这条兜住
  const theme = readProjectFile("theme.css");
  const defined = new Set([...theme.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((match) => match[1]));
  assert.ok(defined.size >= 50, `theme.css 只定义了 ${defined.size} 个令牌，明显不对`);

  const problems = [];
  for (const file of ["library.css", "download.css", "popup.css", "theme.css"]) {
    const css = readProjectFile(file);
    // 页面自己也可以定义布局用的局部变量（例如横幅的 --banner-h），
    // 只要它在本文件里定义过就行；真正的设计令牌仍然必须来自 theme.css。
    const localDefined = new Set([...css.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((match) => match[1]));
    for (const match of css.matchAll(/var\((--[a-z0-9-]+)/g)) {
      if (!defined.has(match[1]) && !localDefined.has(match[1])) problems.push(`${file} 用了未定义的令牌 ${match[1]}`);
    }
  }
  // JS 里动态拼过 var(--x) 的也要算上
  for (const file of ["library.js", "download.js", "popup.js", "icons.js"]) {
    const source = readProjectFile(file);
    for (const match of source.matchAll(/var\((--[a-z0-9-]+)/g)) {
      if (!defined.has(match[1])) problems.push(`${file} 用了未定义的令牌 ${match[1]}`);
    }
  }
  assert.deepEqual([...new Set(problems)], [], `发现未定义的设计令牌：\n${[...new Set(problems)].join("\n")}`);
});

