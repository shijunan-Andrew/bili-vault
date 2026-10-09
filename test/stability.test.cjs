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
function loadBackgroundFunctions(names) {
  const source = readProjectFile("background.js");
  const bodies = names.map((name) => {
    const pattern = new RegExp(`^function ${name}\\([^)]*\\) \\{[\\s\\S]*?^\\}`, "m");
    const match = source.match(pattern);
    assert.ok(match, `background.js 中找不到函数 ${name}`);
    return match[0];
  });
  return new Function(`${bodies.join("\n\n")}\nreturn { ${names.join(", ")} };`)();
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

test("manifest opens the library page to Bilibili pages only", () => {
  const manifest = JSON.parse(readProjectFile("manifest.json"));
  assert.equal(manifest.version, "4.1.1");
  const entry = (manifest.web_accessible_resources || []).find((item) => item.resources.includes("library.html"));
  assert.ok(entry, "缺少 library.html 的 web_accessible_resources");
  assert.ok(entry.matches.every((pattern) => pattern.includes("bilibili.com")), "library.html 只应对 B 站页面开放");
  assert.ok(manifest.permissions.includes("clipboardWrite"));
});

/* ---------------- 4.1beta：为正常条目补全标签和简介 ---------------- */

const ARCHIVE_SAMPLE = [
  "【基本信息】",
  "视频收藏时间：2026年09月10日 15时02分20秒.000",
  "信息保存于：2026-10-09 01:11:21",
  "保存文件夹：2026年09月10日15时02分20秒",
  "视频标题：这下是17岁未亡人了😡",
  "视频链接：https://www.bilibili.com/video/BV1LKGm6ZErR/",
  "BV号：BV1LKGm6ZErR",
  "av号：av116645959959066",
  "",
  "【UP主】",
  "UP主昵称：长崎素世",
  "UP主主页：https://space.bilibili.com/3706936430168922",
  "",
  "【标签】",
  "未知",
  "",
  "【视频简介】",
  "-",
  ""
].join("\n");

test("patching an archive file only rewrites the tag line and the description block", () => {
  const { replaceInfoTagLine, replaceInfoDescription } = loadBackgroundFunctions(["replaceInfoTagLine", "replaceInfoDescription"]);

  const withTags = replaceInfoTagLine(ARCHIVE_SAMPLE, "cos、Banddream、白栎、Mygo、Cosplay、长崎素世");
  assert.match(withTags, /【标签】\ncos、Banddream、白栎、Mygo、Cosplay、长崎素世\n\n【视频简介】\n-\n$/);
  // 除标签那一行外，其余内容必须逐字不变
  assert.equal(withTags.replace(/【标签】\n[^\n]*/, "【标签】\n未知"), ARCHIVE_SAMPLE);

  const patched = replaceInfoDescription(withTags, "第一行\n第二行");
  assert.match(patched, /【视频简介】\n第一行\n第二行\n$/);
  assert.ok(patched.includes("【UP主】\nUP主昵称：长崎素世"), "不该动到前面的区块");
  assert.ok(patched.includes("【标签】\ncos、Banddream、白栎、Mygo、Cosplay、长崎素世"));

  // 简介里出现 $ 时不能被当成替换模式
  const dollar = replaceInfoDescription(ARCHIVE_SAMPLE, "价格是 $& 和 $1 元");
  assert.match(dollar, /价格是 \$& 和 \$1 元/);
});

test("the backfill treats the archive placeholders as missing data", () => {
  const source = readProjectFile("background.js");
  const declaration = source.match(/const IMPORT_PLACEHOLDER_VALUES = new Set\(\[([^\]]*)\]\)/);
  assert.ok(declaration, "background.js 缺少 IMPORT_PLACEHOLDER_VALUES");
  for (const value of ['"未知"', '"无"', '"-"', '"暂无"']) {
    assert.ok(declaration[1].includes(value), `占位值集合缺少 ${value}`);
  }
  // 风控保护：必须有单次上限与请求间隔
  assert.match(source, /const IMPORT_ENRICH_LIMIT = \d+;/, "缺少每次导入的补全上限");
  assert.match(source, /const IMPORT_ENRICH_DELAY_MS = \d+;/, "缺少请求间隔");
  assert.match(source, /Math\.min\(Number\(data\?\.limit\) \|\| 20, 80\)/, "收藏库补全缺少条数上限");
});

test("the import flow now enriches normal items through the two Bilibili endpoints", () => {
  const source = readProjectFile("background.js");
  assert.match(source, /function enrichPendingImportedItems\(/);
  assert.match(source, /function enrichArchiveRecord\(/);
  assert.match(source, /function enrichArchiveRecords\(/);
  assert.match(source, /enrichPendingImportedItems\(pendingItems\.filter\(\(item\) => !item\.isInvalid\)/, "正常条目必须也走补全");
  assert.match(source, /"\/x\/web-interface\/view"/);
  assert.match(source, /"\/x\/tag\/archive\/tags"/);
  // 补全要串在同一队列里，避免和保存/导入同时改写归档文件
  assert.match(source, /saveQueue\.then\(\(\) => enrichArchiveRecords/);
  assert.match(source, /"bca-enrich-records"/);
  // 写回前必须做完整性校验
  assert.match(source, /补全后的内容未通过校验/);
});

test("the library offers a batched backfill for records already on disk", () => {
  const html = readProjectFile("library.html");
  const library = readProjectFile("library.js");
  assert.match(html, /id="enrichLibrary"/);
  assert.match(html, /id="enrichDialog"/);
  assert.match(html, /id="enrichBatchSize"/);
  assert.match(html, /id="enrichProgress"/);
  assert.match(library, /function enrichmentCandidates\(/);
  assert.match(library, /function runEnrichment\(/);
  assert.match(library, /type: "bca-enrich-records"/);
  assert.match(library, /bca-enrich-progress/);
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
