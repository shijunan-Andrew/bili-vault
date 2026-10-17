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
    // 用 .*? 而不是 [^)]*：参数表里可能有嵌套括号（例如默认值写 `now = Date.now()`），
    // 内层那个 ) 会让 [^)]* 提前收尾、整条正则匹配不上，加载器就报"找不到函数"。
    // V1.1.4 加 importWithinRecentDays(items, recentDays, now = Date.now()) 时正是栽在这里。
    // 点号默认不匹配换行，所以不会跨行误匹配。
    const pattern = new RegExp(`^function ${name}\\(.*?\\) \\{[\\s\\S]*?^\\}`, "m");
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

// 1.3.0 删掉了下载页：download.html / download.js / download.css 已整体移除，
// 下面这些清单里不再有它们（「下载功能已经整体移除」那条测试盯着别回来）。
// 1.6.0 补上后来新增的页面与脚本：宠物挂件（pet.css / pet.js）、数据统计页（stats.css / stats.js）、
// 主题引擎（theme.js）。之前这几个文件不在清单里，等于「11px 字号下限」「不许用字符当图标」
// 「图标名必须存在」三条守卫对它们完全失明（外观审查把这条列为 P1-2）。
const PAGE_STYLES = ["library.css", "popup.css", "settings.css", "pet.css", "stats.css"];
const PAGE_SCRIPTS = ["library.js", "popup.js", "content.js", "settings.js", "theme.js", "pet.js", "stats.js"];

/* 去掉注释后再扫，避免把说明文字里的示例字符当成真实用法。

   原来这里是一行正则：`replace(/\/\*[\s\S]*?\*\//g, "")` 再删行注释。它不认识字符串 ——
   看到「星号加斜杠」就当中块注释开始，于是 background.js:3654 那个字符串字面量
   （匹配串是 https://space.bilibili.com 加一个星号、再加 /favlist 和星号）里的那一对
   字符与 :3662 注释结尾的「星号加斜杠」配成了一对，**3654-3662 九行整段被吃掉**。
   用剥离文本做的断言对那一段完全失明，而且里面原本通过的断言只是碰巧
   （正好没有断言落在那一块）。

   注意 `//` 也在这类字符串里出现过（URL 的 `https://`）—— 行注释那一步用
   `(?<!:)` 绕开它，所以两种注释都必须按「当前是否在字符串/模板/正则里」判断，
   不能只靠正则。这里改成一次逐字符扫描的状态机：

     · 在字符串（单/双引号，含 \ 转义）、模板字面量、正则字面量、正则字符组里
       一律原样拷贝，所以字符串里的块注释起止符与双斜杠都不再被当成注释；
     · 注释只把注释体换成空格，**换行原样保留**，所以剥离前后的行号与行数完全一致，
       正则里带 `m` 标志的断言、以及靠 `\r?\n` 对齐的断言都还照旧工作；
     · 长度也保持一致（替换的是等长空白），所以字符串里的坐标不会整体前移。
       代价是注释体本身仍然留在文本里（变成空白），要断言「某句话只在注释里」
       的测试请用 readProjectFile 的原文，别用剥离后的结果。

   正则字面量的开头靠「前一个非空字符」判定：`=`、`(`、`,`、`return` 这类位置后面
   的 `/` 是正则开头，标识符或 `)`、`]` 后面的 `/` 是除号。判错的直接后果是多余的
   空白（测试会报出来），不会把代码当成注释 —— 这也是它比原实现安全的地方。 */
const REGEX_CAN_START_BEFORE = "([{=,:;!&|?+-*%~^<>";
const stripComments = (text) => {
  const out = [];
  let state = "code";
  let quote = "";
  let prev = "";
  for (let index = 0; index < text.length; index += 1) {
    const ch = text[index];
    const next = text[index + 1];
    if (state === "string" || state === "template" || state === "regex") {
      out.push(ch);
      if (ch === "\\") { out.push(next === undefined ? "" : next); index += 1; continue; }
      if (state === "string" && ch === quote) state = "code";
      else if (state === "template" && ch === "`") state = "code";
      else if (state === "regex" && ch === "/") state = "code";
      if (ch !== "\r" && ch !== "\n") prev = ch;
      continue;
    }
    if (state === "charclass") {
      out.push(ch);
      if (ch === "\\") { out.push(next === undefined ? "" : next); index += 1; continue; }
      if (ch === "]") state = "regex";
      prev = ch;
      continue;
    }
    if (ch === "/" && next === "*") {
      out.push(" ", " ");
      index += 1;
      while (index + 1 < text.length && !(text[index] === "*" && text[index + 1] === "/")) {
        index += 1;
        const inner = text[index];
        out.push(inner === "\r" || inner === "\n" ? inner : " ");
      }
      if (index + 1 < text.length) { index += 1; out.push(" "); }
      continue;
    }
    if (ch === "/" && next === "/") {
      out.push(" ", " ");
      index += 1;
      while (index + 1 < text.length && text[index + 1] !== "\n" && text[index + 1] !== "\r") {
        index += 1;
        out.push(" ");
      }
      continue;
    }
    if (ch === "/" && (REGEX_CAN_START_BEFORE.includes(prev) || /[\w$)\]]/.test(prev) === false)) {
      state = "regex";
      out.push(ch);
      continue;
    }
    out.push(ch);
    if (ch === '"' || ch === "'") { state = "string"; quote = ch; }
    else if (ch === "`") state = "template";
    if (ch !== "\r" && ch !== "\n") prev = ch;
  }
  return out.join("");
};

/* stripComments 自己的守卫。P3-32：background.js:3654 的字符串
   `"https://space.bilibili.com/" + BLOCK_END + "favlist" + BLOCK_END` 里那个「星号加斜杠」
   与 :3662 注释结尾的「星号加斜杠」凑成一对，把 3654-3662 九行整段藏起来 —— 而那一块里有
   tabs.query 的 URL 匹配、URL 正则解析和 uid 回退，凡用剥离文本做的断言对它都是失明的。
   下面钉住三件事：函数名与匹配串在剥离后仍然看得见、行数不变、长度不变。

   注意这份文件自己也不能写出那两个字面字符（写在注释里同样会把注释提前收尾，
   直接 SyntaxError），所以下面用 BLOCK_END 拼出来。 */
test("stripComments 不许把字符串里的块注释起止符当成注释（P3-32）", () => {
  const raw = readProjectFile("background.js");
  const stripped = stripComments(raw);
  const BLOCK_END = "*" + "/";
  // 匹配串是 https:// 加 space.bilibili.com，再加一个斜杠、一个星号，然后是 /favlist 和星号。
  // 本文件里不能写出「星号紧跟斜杠」那两个字符（写在哪都是块注释收尾，直接 SyntaxError），
  // 所以用字符码拼出来 —— 下面第一条断言就是为了防止这里退化成拼错、永远匹配不上的字面量。
  const matcher = "space.bilibili.com/" + BLOCK_END + "favlist*";
  assert.ok(!stripped.includes("space.bilibili.com" + "BLOCK_END"),
    "前提：剥离后的文本里不该出现拼接用的占位名字，否则下面的断言是空转");
  assert.ok(stripped.includes(matcher),
    "background.js:3654 的 tabs.query 匹配串必须能在剥离后看到（它整个落在块注释盲区里）");
  assert.ok(stripped.includes("async function resolveDiffUid("),
    "紧随其后的函数名也必须看得见");
  assert.ok(stripped.includes("return { uid: found, tabId: tab.id ?? null };"),
    "3659 那行（字符串里的块注释结束符之后的内容）也要看得见");
  // 字符串里的双斜杠（URL 的 https 后那两撇）同样不算行注释
  assert.ok(stripped.includes("https://" + matcher),
    "URL 里的双斜杠不能被当成行注释");
  assert.ok(!stripped.includes("space.bilibili.com/favlist"),
    "前提：匹配串里那对「斜杠 + 星号」不能被扫描器吃掉，否则上一条断言是空转");
  assert.equal(stripped.split("\n").length, raw.split("\n").length,
    "注释体只换成空白，行数必须一致（否则带 m 的断言会整体错位）");
  assert.equal(stripped.length, raw.length,
    "注释体换成等长空白，长度必须一致（否则区间断言会整体前移）");
  // 换行本身不能被子串替换吃掉：拿一个真实块注释确认它内部的 \r\n 还在
  assert.ok(/\/\*[\s\S]{0,80}\r\n[\s\S]{0,80}\*\//.test(raw), "前提：仓库里块注释确实跨行");
  assert.ok(/[^\s]/.test(stripped), "剥离后不该变成全空白");
});

test("every page loads the shared design tokens and the icon set", () => {
  for (const page of ["library.html", "popup.html", "settings.html"]) {
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
    // 只盯「全局重定义」：选择器必须是一条独立的 [hidden]（行首，或跟在 , { } ; 后面）。
    // 原来的 /\[hidden\]\s*\{/ 会误伤 `.bca-pet-menu[hidden] { … }` 这种作用域内的正常写法 ——
    // 1.6.0 把 pet.css 收进清单后它立刻误报（pet.css 三处 [hidden] 全是带前缀的），
    // 于是把这条守卫收紧，而不是把 pet.css 从清单里拿掉（那等于退回失明）。
    const css = stripComments(readProjectFile(file));
    assert.equal(
      /(?:^|[\s,{};])\[hidden\]\s*\{/m.test(css),
      false,
      `${file} 不应再重复定义全局 [hidden]`
    );
  }
});

// 3.x 里下载页日志是 9px、“视频/音频”副标题是 8px，中文基本不可读
// （下载页 1.3.0 已整体删除，这条守卫现在盯着剩下的页面样式表）。
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
  for (const file of ["library.html", "popup.html", ...PAGE_SCRIPTS]) {
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
  for (const file of ["library.html", "popup.html", "settings.html"]) {
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
  assert.equal(manifest.version, "1.7.25");
  // 4.3：library.html 不再作为 web_accessible_resource 暴露给 B 站页面
  assert.equal(manifest.web_accessible_resources, undefined, "扩展页不应暴露给任何网页");
  // notifications 是 1.7.3 加的：导入要跑几分钟，用户多半已经关掉弹窗，只把结果写进
  // storage 等于没有终态提示（store 审核与真机反馈都指向这一点）。
  // unlimitedStorage 是 1.7.10 加的（facet-storage P2-5）：背景图存在 IndexedDB 里，
  // 没有这个权限时 chrome.storage.local 只有 10MB 硬配额、IndexedDB 随时可能被回收；
  // 加上它同时解决「配额」与「会被清掉」两件事。不接受其它任何权限。
  assert.deepEqual(manifest.permissions.slice().sort(), ["clipboardWrite", "nativeMessaging", "notifications", "storage", "unlimitedStorage"]);
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
  // 下载页（download.js）1.3.0 已整体删除，它那份「请勿公开分享」的提示随之消失，
  // 只剩后台这一处 —— 上面两条断言就是它的全部守卫。
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
  // 默认开启。注意这个开关的语义（用户 2026-10-10 澄清过，别搞混）：
  //   它做的是「从 APP 接口 / 稍后再看 / 观看历史里**拼凑失效视频的信息**（封面、标题）」
  //   不是「把失效视频恢复成正常状态」—— 后者一般做不到，用户说的"不用增加恢复功能"指的是后者。
  // 真机上验证过它有效（封面和标题确实能找回来），所以默认开启。
  assert.match(background, /const recoverInvalidVideos = settings\?\.recoverInvalidVideos !== false/);
  assert.match(popup, /recoverInvalidCheckbox\.checked = saved\?\.recoverInvalidVideos !== false/);
  assert.match(popup, /recoverInvalidCheckbox\.checked = true/, "兜底默认值必须是开");
  // 弹窗里的复选框默认勾选
  assert.match(html, /<input id="recoverInvalid" type="checkbox" checked>/);
  // 界面文字要能区分这两种概念，别写成"恢复失效视频"
  assert.match(html, /尝试找回失效视频的部分信息/, "开关名字要避免和「恢复成正常状态」混淆");
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
  // 收藏库 scanRoot() 按 background.js 的 STAT_LABELS 里这些字段名取统计
  const labels = source.match(/const STAT_LABELS = \{([^}]*)\}/);
  assert.ok(labels, "background.js 缺少 STAT_LABELS");
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
  // 抓取结果串在同一队列里，避免和保存/导入同时改写归档文件。
  // 出队回调里现在先放掉「排队中」那笔账再调 importBiliFavorites，所以这里不写死成一行
  // （那笔账的来龙去脉见下面「导入占位」那条测试）。
  assert.match(
    source,
    /const task = saveQueue\.then\(\(\) => \{[\s\S]{0,200}?return importBiliFavorites\(data, tabId\);/,
    "抓取要串在 saveQueue 上"
  );
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
    ["importClean", "importIsPlaceholder", "importPlaceholderWorthRetry", "recordNeedsRefresh"],
    ["IMPORT_PLACEHOLDER_VALUES", "IMPORT_SYMBOL_PLACEHOLDER_VALUES", "COVER_PENDING_LINE"]
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
  // V1.2.8：占位要分两种。B 站这条本来就没写简介（接口回的就是一个 `-`）时，再抓一百次
  // 也还是同一个符号 —— 不该每次都重写一遍。真机上的表现是"6 个视频的收藏夹每次导入都报更新 3"。
  for (const symbol of ["-", "--", "—", "/"]) {
    assert.equal(
      recordNeedsRefresh({ text: complete.replace("真正的简介", symbol) }),
      false,
      `简介是纯符号「${symbol}」（B 站本来就没有）不该触发重写`
    );
  }
  // 而「未知」是另一回事：多半是上一次没取到，仍要再试一次（旧档案就是这么补回来的）
  assert.equal(recordNeedsRefresh({ text: complete.replace("真正的简介", "未知") }), true);
  assert.equal(recordNeedsRefresh({ text: complete.replace("真正的简介", "暂无") }), true);
  // 标签/发布时间那两处判据同样走新的分法
  assert.equal(recordNeedsRefresh({ text: complete.replace("拉面、治愈", "-") }), false);
  assert.equal(recordNeedsRefresh({ text: complete.replace("拉面、治愈", "未知") }), true);
});

test("the new info layout carries the followers count and a separate stats block", () => {
  const source = readProjectFile("background.js");
  assert.match(source, /UP主粉丝数：\$\{fansText\}/);
  assert.match(source, /lines\.push\("【互动数据】"\)/);
  assert.match(source, /const STAT_LABELS = \{ view: "播放量", danmaku: "弹幕量", like: "点赞数", coin: "投硬币枚数", favorite: "收藏人数", share: "转发人数" \}/);
  // 只有真的抓到互动数据时才写这一区块，自动归档的老格式不受影响
  assert.match(source, /const hasStats = STAT_KEYS\.some\(\(key\) => !importIsPlaceholder\(stats\[key\]\)\)/);
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
    ["IMPORT_PLACEHOLDER_VALUES", "STAT_KEYS", "STAT_LABELS", "SECTION_HEADING_PATTERN"]
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
  // 详情里的按钮不再直接刷新，而是先确认。
  // V1.2.0：openDetail 补了 null 守卫，元素先取进变量再判空（缺元素时不再抛异常）。
  assert.match(
    library,
    /if \(\w+\) \w+\.addEventListener\("click", \(\) => openStatusConfirm\(\[video\], "detail"\)\)/,
    "详情里的「更新视频状态」要先弹确认框"
  );
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

test("the downloaded rule is computed in exactly one place", () => {
  const core = readProjectFile("archive-core.js");
  const library = readProjectFile("library.js");
  // 这条规则曾经漂移过：downloadStateFromIndex 认了「手动标记」，而 library.js 里
  // 页面重新获得焦点时跑的 refreshDownloadStatuses 没认，导致标记被冲掉、要刷新才回来。
  assert.match(core, /function downloadMatchIsDownloaded\(match\)/);
  assert.match(library, /BcaArchiveCore\.downloadMatchIsDownloaded\(match\)/);
  // 业务文件里不许再出现自己拼的判据
  assert.equal(/match\?\.hasMedia \|\| match\?\.marked/.test(library), false, "收藏库不该自己拼「已下载」判据");
  assert.equal(/Boolean\(match\?\.hasMedia\)/.test(library), false, "收藏库不该只看 hasMedia");
});

test("the collection list scrolls instead of pushing the footer out", () => {
  const css = readProjectFile("library.css");
  const block = css.match(/\.collection-list \{[^}]*\}/)[0];
  // 侧栏是固定高度的 flex 列：列表必须能收缩（min-height:0）并自己滚
  assert.match(block, /flex: 1 1 auto/);
  assert.match(block, /min-height: 0/);
  assert.match(block, /overflow-y: auto/);
  // 顶部对齐，条目少时不要被 grid 拉伸
  assert.match(block, /align-content: start/);
  // 底部信息靠 margin-top:auto 定位，前提是列表能收缩
  assert.match(css, /\.sidebar-bottom \{ margin-top: auto;/);
});

test("copying a download path prefers an absolute path", () => {
  const library = readProjectFile("library.js");
  // 三档来源：原生助手 > 手填根目录 > 相对路径。
  // 「手填」那个入口在下载页上（download.html 的 #downloadRootPath），1.3.0 连页面一起删了；
  // 读取端（chrome.storage 里的 downloadRootPath）与相对路径兜底仍然保留，所以这里继续守着。
  assert.match(library, /source: "manual"/);
  assert.match(library, /BcaArchiveCore\.joinDownloadPath\(manualRoot, collection, directory\)/);
  assert.match(library, /async function readDownloadRootPath\(\)/);
  // 只有真的拿不到绝对路径时才提示相对路径
  assert.match(library, /resolved\.source === "relative"/);
  assert.match(library, /已复制完整路径：\{path\}/);
});

test("every shipped script actually parses", () => {
  // 这套测试是按文本读文件做正则断言的，所以它天生看不见语法错误——
  // 4.8.2 就真的漏过一次：替换时少删了一行，留下一句孤立的 ": ..." 三元分支，
  // 104 项测试全过，而 library.js 根本跑不起来。这条断言补上那个盲区。
  const vm = require("node:vm");
  const child = require("node:child_process");
  const scripts = [
    "archive-core.js", "background.js", "content.js",
    "favorites-import.js", "i18n.js", "icons.js", "library.js", "popup.js", "theme.js",
    "stats-core.js", "pet.js"
  ];
  // 1.5.0：background.js 是模块 service worker（manifest 里 "type": "module"），
  // 它用静态 `import "./stats-core.js"` 把纯函数拿进来 —— 静态 import 在脚本模式里
  // 是语法错误，所以带 import/export 的文件改用 `node --check`（它会自己按模块语法检测）。
  const moduleLike = [];
  for (const name of scripts) {
    const source = readProjectFile(name);
    if (/^\s*(?:import|export)[\s{*]/m.test(source)) {
      moduleLike.push(name);
      continue;
    }
    try {
      // 只解析不执行，所以 chrome.* 之类的宿主 API 不影响
      new vm.Script(source, { filename: name });
    } catch (error) {
      assert.fail(`${name} 解析失败：${error.message}`);
    }
  }
  assert.deepEqual(moduleLike, ["background.js"], "只有模块 service worker 才允许带 import/export");
  for (const name of moduleLike) {
    const result = child.spawnSync(process.execPath, ["--check", path.join(projectRoot, name)], { encoding: "utf8" });
    assert.equal(result.status, 0, `${name} 解析失败：${result.stderr || result.stdout}`);
  }
});

test("every t() literal in the shipped scripts has a dictionary entry", () => {
  // 这条**不走 i18n-extract**，而是直接扫源码里所有的 BcaI18n.t("字面量")。
  // 原因：提取器会漏掉嵌在长模板字符串 ${} 里的 t() —— V1.0.0 真的漏过两条
  // （library.js 详情面板的「UP 主主页」「打开 UP 主主页」），而 --check 当时是全绿的。
  const SOURCES = ["library.js", "popup.js", "content.js", "background.js"];
  const NEVER = new Set(["简体中文", "繁體中文", "English", "DownKyi", "本地收藏库", "LOCAL VIDEO LIBRARY"]);
  const dicts = ["zh-TW", "en"].map((loc) => JSON.parse(readProjectFile(`locales/${loc}.json`)));
  const missing = [];
  for (const file of SOURCES) {
    // 先剥掉注释：注释里也会出现 BcaI18n.t("字面量") 这种示例，会把测试带偏。
    // **必须先统一换行** —— JS 的 `.` 不匹配 \r（它属于 LineTerminator），
    // 所以在 CRLF 文件上 /^\s*\/\/.*$/ 永远匹配不到行尾，剥注释会静默失效。
    const source = readProjectFile(file)
      .replace(/\r\n?/g, "\n")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .map((line) => line.replace(/^\s*\/\/.*$/, ""))
      .join("\n");
    // t("…")：允许字符串里有转义序列（例如路径里的 \\ ）
    for (const match of source.matchAll(/BcaI18n\.t\("((?:[^"\\\n]|\\.)+)"/g)) {
      // 源码里写的是转义形式，取运行时真值后再与词典比对
      const key = match[1].replace(/\\(.)/g, "$1");
      if (NEVER.has(key)) continue;
      if (!/[\u4e00-\u9fff]/.test(key)) continue;   // 不含中文的 key 不需要词典
      for (const dict of dicts) {
        if (dict[key] === undefined) missing.push(`${file}: ${key}`);
      }
    }
  }
  assert.deepEqual([...new Set(missing)], [], "这些 t() 字面量没有词典条目：" + [...new Set(missing)].join(" / "));
});

/* ------------------------- 4.9 全面修复 ------------------------- */
test("the archive cache evicts one entry instead of clearing itself", () => {
  const library = readProjectFile("library.js");
  // 4.9：原来是 store.clear()，两个后果：① 4000 条以上每轮扫描从零重读，缓存形同虚设；
  // ② 被清掉的条目的封面 blob: URL 再也没人 revoke。改成 LRU 淘汰单条。
  assert.equal(/store\.clear\(\)\s*;/.test(library), false, "不该再用 store.clear() 整表清空");
  // 按 Map 的插入序取最旧的一条淘汰（配合命中即刷新位置构成 LRU）
  assert.match(library, /const oldestKey = store\.keys\(\)\.next\(\)\.value;/);
  assert.match(library, /store\.delete\(oldestKey\);/, "要真的删掉最旧那条");
  assert.match(library, /dropCacheEntry\(oldest\);/, "淘汰时必须交还它持有的封面引用");
  // 命中要把条目挪到末尾，否则不是 LRU
  assert.match(library, /function cacheEntryFor\(/);
});

test("cover blob URLs are reference counted before being revoked", () => {
  const library = readProjectFile("library.js");
  // 淘汰即 revoke 会在最需要淘汰的 >4000 条场景造成裂图：被淘汰的那条可能正是
  // 同一次扫描早先渲染成卡片的那个 URL，而卡片封面是 loading="lazy"。
  for (const fn of ["addCoverRef", "releaseCoverRef", "revokeAllCoverRefs", "dropCacheEntry", "releaseVideoCoverRefs", "retainDetailCover", "releaseDetailCover"]) {
    assert.match(library, new RegExp(`function ${fn}\\(`), `缺少 ${fn}`);
  }
  // 计数归零才 revoke
  // 计数归零才 revoke；重复交还被 has() 挡下
  assert.match(library, /coverRefCounts/);
  // 详情面板要单独保一份引用：它是唯一能在 collections 被换掉后还留在页面上的 DOM
  assert.match(library, /retainDetailCover\(video\.cover\)/);
  // 卸载时兜底
  assert.match(library, /revokeAllCoverRefs\(\)/);
});

test("the library no longer rescans the download tree on a timer", () => {
  const library = readProjectFile("library.js");
  // 4.9：删掉了 60 秒的 setInterval —— 10000 条时它每分钟打 12000 次文件系统调用。
  // 只允许出现在注释里说明为什么删。
  const code = library.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.equal(/setInterval/.test(code), false, "代码里不该再有 setInterval");
  // 1.7.7（P0-2）：按需触发只剩两条 —— "下载真的写完"（downloadRevision，可绕过节流）
  // 与"标签页重新可见"（受最小间隔节流）；window 的 focus 监听已删（与 visibilitychange
  // 重复，等于同一棵树扫两遍）。
  assert.match(library, /changes\.downloadRevision/);
  assert.match(library, /refreshDownloadStatuses\(true\)/, "downloadRevision 要能绕过最小间隔");
  assert.match(library, /addEventListener\("visibilitychange"/);
  assert.match(library, /DOWNLOAD_STATUS_MIN_INTERVAL_MS/, "切回标签页时的整树扫描要有最小间隔");
  assert.equal(/addEventListener\("focus", refreshDownloadStatuses\)/.test(library), false, "focus 监听不该再整树重扫");
});

test("filter options are rebuilt on demand, not on every keystroke", () => {
  const library = readProjectFile("library.js");
  // 选项池要移出 renderVideos：它对全量数据做词频统计 + 全排序 + replaceChildren
  // 重建整个 select，10000 条时每次按键新建上千个 option。
  const start = library.indexOf("function renderVideos");
  assert.ok(start > 0, "找不到 renderVideos");
  const nextFn = library.indexOf("\nfunction ", start + 10);
  const body = library.slice(start, nextFn > 0 ? nextFn : library.length);
  assert.equal(/syncVideoFilterOptions/.test(body), false, "选项池不该在 renderVideos 里重建");
  assert.match(library, /function refreshVideoFilterOptions\(/);
  // 搜索防抖
  assert.match(library, /const SEARCH_DEBOUNCE_MS = \d+;/);
  assert.match(library, /clearTimeout\(searchDebounceTimer\)/);
  // 扫描时预拼搜索索引，避免每次按键 join 7 个字段
  assert.match(library, /searchIndex,/);
});

test("a missing download root is unknown, not empty", () => {
  const library = readProjectFile("library.js");
  const start = library.indexOf("async function scanDownloadedDirectories");
  assert.ok(start > 0, "找不到 scanDownloadedDirectories");
  const body = library.slice(start, start + 2600);
  // 4.9：原来返回空 Map，调用方当成"确实一个下载文件都没有"，于是清掉所有「已下载」标记，
  // 还让「同时删除关联下载」永久隐藏。现在与权限被拒一样返回 null（状态未知）。
  assert.match(body, /if \(!parent\) return null;/);
  assert.equal(/if \(!parent\) return new Map\(\);/.test(body), false, "不该再返回空 Map");
});

test("covers are small WebP files, and both generations of the name are readable", () => {
  const background = readProjectFile("background.js");
  const library = readProjectFile("library.js");
  // 实测老规则：137 张封面 221.4 MB，均值 1.6 MB（原图尺寸 + PNG）。缩到 320×180 WebP 后约 15 KB。
  assert.match(background, /const COVER_FILE_NAME = "封面\.webp";/);
  assert.match(background, /const COVER_WIDTH = 320;/);
  assert.match(background, /const COVER_HEIGHT = 180;/);
  assert.match(background, /new OffscreenCanvas\(COVER_WIDTH, COVER_HEIGHT\)/, "输出尺寸要固定 320×180");
  assert.match(background, /const COVER_MIME_TYPE = "image\/webp";/);
  assert.match(background, /COVER_MIME_TYPE/, "要输出 WebP");
  // 老档案里的 封面.png 不迁移、不重下 —— 读取与存在性检查都要认两个名字
  assert.match(background, /const COVER_FILE_NAMES = \["封面\.png", COVER_FILE_NAME\];/);
  assert.match(background, /for \(const name of COVER_FILE_NAMES\)/);
  assert.match(library, /optionalFileHandle\(recordEntry, "封面\.webp"\)/);
  assert.match(library, /coverHandle = await optionalFileHandle\(recordEntry, "封面\.png"\)/);
  // 绝不能再把 WebP 字节写进 .png：MIME 会按扩展名推断成 image/png，
  // 只能指望浏览器嗅探内容，那是审计点名的唯一跨文件语义风险。
  assert.equal(/COVER_FILE_NAME = "封面\.png"/.test(background), false);
});

test("the import pipeline keeps the service worker alive explicitly", () => {
  const background = readProjectFile("background.js");
  // MV3 的 SW 只认"扩展 API 调用/事件"来重置空闲计时器，纯 await 不算。
  // 导入要跑 2.5~14 小时，没有显式保活必然中途被回收。
  assert.match(background, /function keepServiceWorkerAlive\(/);
  assert.match(background, /chrome\.runtime\.getPlatformInfo\(\)/);
  assert.match(background, /IMPORT_KEEPALIVE_INTERVAL_MS/);
  // 内存态才算"真的在跑"；importState.running 只是残影，必须能复位
  assert.match(background, /importRun\.active/);
  assert.match(background, /bca-import-probe/);
  // 中断状态要说清楚，而不是留个转不动的界面
  assert.match(background, /上次导入已中断/);
});

test("the import pipeline notices rate limiting instead of faking success", () => {
  const background = readProjectFile("background.js");
  // HTTP 412 / -412 / -352 都要识别
  assert.match(background, /rateLimited = true/);
  assert.match(background, /-412/);
  assert.match(background, /-352/);
  // 连续限流要熔断整轮，而不是继续写一堆"标签未知"的残缺记录
  assert.match(background, /触发 B 站风控，已停止导入/);
  // 分页缺口要与 total 对账，不能静默丢尾部
  assert.match(background, /IMPORT_MAX_PAGES = \d+/);
  assert.match(background, /IMPORT_FAVORITE_PAGE_SIZE = \d+/);
  assert.match(background, /分页未取全/);
});

test("imports write the cover before the info file", () => {
  const background = readProjectFile("background.js");
  // 让 视频信息.txt 充当"完成标记"：中途被杀只会留下没有 txt 的目录（下次重做），
  // 而不是"有 txt 没封面"被当成完整记录永远跳过。
  const start = background.indexOf("async function saveImportedItem");
  assert.ok(start > 0, "找不到 saveImportedItem");
  const body = background.slice(start, start + 2000);
  const coverAt = body.search(/COVER_FILE_NAME|封面/);
  const infoAt = body.indexOf("视频信息.txt");
  assert.ok(coverAt >= 0 && infoAt > coverAt, "必须先写封面、后写 视频信息.txt");
});


test("a short page is not mistaken for a pagination gap", () => {
  const background = readProjectFile("background.js");
  // B 站的 media_count 把"已失效视频"也算进总数，而列表接口不返回它们的内容。
  // 于是"读完了却比总数少"是接口口径差异 —— 4.9 曾把它计入 failed，
  // 用户会在报告里看到一个没有解释的「失败：25」（真实案例：749 报 724）。
  assert.match(background, /let sawLastPage = false;/);
  assert.match(background, /if \(result\.hasMore === false \|\| result\.items\.length < IMPORT_FAVORITE_PAGE_SIZE\) sawLastPage = true;/);
  // 只有"没读到自然末尾"才可能是真缺口
  assert.match(background, /if \(missingCount > 0 && !sawLastPage\) \{/);
});

test("an aborted import still explains what the current folder logged", () => {
  const background = readProjectFile("background.js");
  // folderLog 原本只在每轮收藏夹循环的末尾渲染，而风控是在保存阶段抛出的、
  // 抛在渲染之前 —— 报告于是只有一个裸的「失败：N」。
  assert.match(background, /let activeFolderLog = \[\];/);
  assert.match(background, /activeFolderLog = folderLog;/);
  assert.match(background, /const flushActiveFolderLog = \(\) => \{/);
  // 中止路径必须调用它，且在写报告之前
  const abortAt = background.indexOf("if (rateLimited) {");
  const flushCall = background.indexOf("flushActiveFolderLog();", abortAt);
  const reportWrite = background.indexOf("persistErrorReport(reportLines.join", abortAt);
  assert.ok(abortAt > 0 && flushCall > abortAt && reportWrite > flushCall, "中止路径要先补渲日志再写报告");
  // 已渲染过的不要重复渲染
  assert.match(background, /folderLog\.length = 0;/, "渲染后要清空，避免重复");
});

test("a 412 from the page-context fetch falls back instead of aborting the import", () => {
  const background = readProjectFile("background.js");
  // 实测事故（4.9 → 4.9.1）：B 站对「页面上下文」发出的请求本来就返回 HTTP 412，
  // 且响应体不是 JSON —— favorites-import.js 会把它转成
  // 「B站接口没有返回有效数据（HTTP 412）。」，这句话经 biliImportPageApiGet 回到后台。
  // 4.8.3 的 catch 是「一律退回后台直连」，后台直连能拿到数据，所以旧版本一切正常。
  // 4.9 加的 importIsRateLimitedError 只看到消息里有 "HTTP 412" 就抛风控、不再退回，
  // 于是每个请求都被判成风控，连续 5 条即中止整轮（4 秒）。
  // 对照实测：同一账号同一时刻，旧版本导入 128 条全部成功。
  const start = background.indexOf("await biliImportPageApiGet(tabId");
  assert.ok(start > 0, "找不到页面代取调用");
  const catchAt = background.indexOf("} catch (pageError) {", start);
  assert.ok(catchAt > start, "页面代取必须有自己的 catch 分支（失败要能退回）");
  const branch = background.slice(catchAt, background.indexOf("\n      }", catchAt));
  const fetchAt = branch.indexOf("const response = await fetch(url.toString()");
  assert.ok(fetchAt >= 0, "页面代取失败后必须退回后台直连");
  // 风控判定只允许出现在「后台直连已经拿到响应」之后，不能抢在退路前面
  const limitAt = branch.indexOf("importRateLimitError");
  if (limitAt >= 0) {
    assert.ok(limitAt > fetchAt, "风控判定必须排在退回后台直连之后");
    assert.ok(branch.slice(0, fetchAt).indexOf("importRateLimitError") < 0, "退路之前不许判定风控");
  }
});

test("a count mismatch is reported as information, not as a failure", () => {
  const background = readProjectFile("background.js");
  // 实测案例：B 站页面显示「生存」有 239 项，本地导入 230 项。
  // 查下来导入链路内部自洽（读取 240 = 6+3+231，导入 239 = 本地实际总数），
  // 差在"接口自报 239 而实际只返回 231" —— 差额来自 B 站接口的口径。
  //
  // 这里踩过两次：
  //   4.9   —— 把差额计入 failed，报告出现没有解释的「失败：25」；
  //   4.9.1 —— 改成完全静默，用户看到 239 vs 230 时无从判断到底丢没丢。
  // 正确做法：不当失败，但必须如实说出来。
  assert.match(background, /const coverageNotes = \[\];/);
  assert.match(background, /} else if \(missingCount > 0\) \{/);
  assert.match(background, /coverageNotes\.push\(/);
  // 完成消息与报告里都要带上
  assert.match(background, /coverageNotes\.length \? `（\$\{coverageNotes\.join/);
  assert.match(background, /if \(coverageNotes\.length\) \{/);
  assert.match(background, /"接口口径说明（不是失败）：", \.\.\.coverageNotes/);
  // 文案要把"差额来自 B 站收藏夹的占位空槽"讲清楚，否则用户还是会以为漏了
  assert.match(background, /占位空槽/);
  assert.match(background, /不是导入遗漏/);
  // 说明分支绝不能计入失败或触发报告
  const gap = background.indexOf("if (missingCount > 0 && !sawLastPage)");
  const branch = background.slice(gap, gap + 1200);
  const elseAt = branch.indexOf("} else if (missingCount > 0) {");
  const noteBranch = branch.slice(elseAt, elseAt + 400);
  assert.equal(/failed \+=/.test(noteBranch), false, "口径差额不该计入失败");
  assert.equal(/hasIssues = true/.test(noteBranch), false, "口径差额不该触发错误报告");
});

test("the scan progress never writes into the notice container itself", () => {
  const library = readProjectFile("library.js");
  const html = readProjectFile("library.html");
  // 实测事故：4.8.3 给 #scanNotice 加了文字 span 和关闭按钮之后，
  // progressNotifier 仍然写 #scanNotice.textContent —— 那会把两个子节点整个抹掉。
  // 之后 setScanNotice() 全写进了脱离 DOM 的孤立 span，屏幕上永远停在「正在读取 0/0…」。
  assert.equal(/progressNotifier\(scanNotice,/.test(library), false, "不能把带子元素的容器交给 progressNotifier");
  assert.match(library, /progressNotifier\(scanNoticeText,/);
  assert.equal([...library.matchAll(/progressNotifier\(scanNoticeText,/g)].length, 2, "两处进度条都要写文字节点");
  // 约束要写在函数旁边，避免以后又传错
  assert.match(library, /element 必须是只放文字的节点/);
  // 结构上的证据：#scanNotice 里确实有子元素，所以它不能被 textContent 写
  const notice = html.match(/<div id="scanNotice"[\s\S]*?<\/div>/)[0];
  assert.match(notice, /<span id="scanNoticeText"/);
  assert.match(notice, /id="dismissScanNotice"/);
  // 而且只有 setScanNotice 允许写那个 span
  assert.equal([...library.matchAll(/scanNoticeText\.textContent\s*=/g)].length, 1);
});

test("the status-refresh dialog explains what happens to unavailable videos", () => {
  const html = readProjectFile("library.html");
  // 4.4 的原始约定：更新时若发现视频失效，不覆盖原文件，而是标记为「已失效」
  // （标题变红、封面变灰）。确认框必须把这件事说清楚，否则用户不敢点。
  assert.match(html, /如果更新时发现视频已经失效：不会用新数据覆盖原有资料/);
  assert.match(html, /标记为「已失效」/);
  assert.match(html, /标题变红、封面变灰/);
  // 防風控提示仍在
  assert.match(html, /请勿频繁更新/);
});

test("the default download folder is created when it is missing", () => {
  const library = readProjectFile("library.js");
  const popup = readProjectFile("popup.js");
  // 实测问题：000视频下载 只在真正下载时才被创建。从没下载过的用户根本没有它，
  // 「标记为已下载」直接失败，而报错说的却是"请先到下载页选择保存位置"——保存位置早就选好了。
  // ① 弹窗里选保存位置时顺手建出来（那时一定是 readwrite 权限）
  //    V1.4.4 起固定目录一起建：000视频下载 / 001错误报告 / 002同步报告
  //    V1.5.0 起再加 003database（本地数据库根目录）
  assert.match(popup, /const DOWNLOAD_FOLDER_NAME = "000视频下载";/);
  assert.match(popup, /const ROOT_STRUCTURE_DIRECTORIES = \[DOWNLOAD_FOLDER_NAME, "001错误报告", "002同步报告", "003database"\];/);
  assert.match(popup, /for \(const name of ROOT_STRUCTURE_DIRECTORIES\) \{/);
  assert.match(popup, /await handle\.getDirectoryHandle\(name, \{ create: true \}\)/);
  // ② 老用户（根目录已设好但没这个文件夹）也能立刻用上：标记时按需创建
  assert.match(library, /async function getWritableDownloadParent\(\{ create = false \} = \{\}\)/);
  assert.match(library, /const parent = await getWritableDownloadParent\(\{ create: true \}\);/);
  assert.match(library, /await rootHandle\.getDirectoryHandle\("000视频下载", \{ create \}\)/);
  // 创建前要先拿到根目录写权限，否则会抛出更难懂的错
  assert.match(library, /const rootPermission = await rootHandle\.requestPermission\(\{ mode: "readwrite" \}\);/);
  // 删除流程仍然用无参调用：那里不该顺手建目录
  assert.equal([...library.matchAll(/getWritableDownloadParent\(\)/g)].length, 2, "只有两处调用不该创建");
});

test("the native host folder is pinned under LOCALAPPDATA", () => {
  const install = readProjectFile("install-native-folder-opener.ps1");
  const uninstall = readProjectFile("uninstall-native-folder-opener.ps1");
  for (const [name, source] of [["install", install], ["uninstall", uninstall]]) {
    assert.match(source, /function Assert-HostRootSafe\(\[string\]\$Path\)/, `${name} 缺少目录限位函数`);
    // 必须真的调用它，否则函数只是摆设
    assert.match(source, /\$HostRoot = Assert-HostRootSafe \$HostRoot/, `${name} 没有应用限位`);
    // 前缀比较要带分隔符，否则 BcaFolderOpenerEvil 这种撞名会被放行
    assert.match(source, /TrimEnd\(\[System\.IO\.Path\]::DirectorySeparatorChar, \[System\.IO\.Path\]::AltDirectorySeparatorChar\) \+ \[System\.IO\.Path\]::DirectorySeparatorChar/);
    assert.match(source, /OrdinalIgnoreCase/);
    // 用 GetFullPath 归一，才能挡住 "..\..\Windows" 这类
    assert.match(source, /\[System\.IO\.Path\]::GetFullPath\(\$Path\)/);
  }
  // 卸载脚本会 Remove-Item -Recurse -Force 这个目录，校验必须排在它前面
  const assertAt = uninstall.indexOf("Assert-HostRootSafe $HostRoot");
  const removeAt = uninstall.indexOf("Remove-Item -LiteralPath $HostRoot");
  assert.ok(assertAt >= 0 && removeAt > assertAt, "卸载脚本的目录限位必须排在删除之前");
});

test("the PowerShell sources keep their BOM", () => {
  // PowerShell 5.1 的 Get-Content 默认按系统 ANSI 读，无 BOM 会把中文路径解坏。
  // .ps1 / .cs 必须带 BOM，其余文件必须不带（带了会让 JSON.parse 直接失败）。
  const withBom = ["release.ps1", "install-native-folder-opener.ps1", "uninstall-native-folder-opener.ps1", "test-native-folder-opener.ps1", "native/folder-opener-host.ps1", "native/folder-opener-launcher.cs"];
  const withoutBom = ["manifest.json", "library.js", "library.html", "library.css", "background.js", "popup.js", "theme.css", "locales/zh-TW.json"];
  const fs = require("node:fs");
  const path = require("node:path");
  const root = path.dirname(__dirname);
  const hasBom = (file) => {
    const buffer = fs.readFileSync(path.join(root, file));
    return buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf;
  };
  for (const file of withBom) assert.equal(hasBom(file), true, `${file} 缺少 BOM`);
  for (const file of withoutBom) assert.equal(hasBom(file), false, `${file} 不该有 BOM`);
});

/* ------------------------- 4.8.3 美化 ------------------------- */

test("secondary buttons stand out from the card background", () => {
  const css = readProjectFile("library.css");
  const theme = readProjectFile("theme.css");
  const light = Object.fromEntries([...theme.match(/:root \{([\s\S]*?)\n\}/)[1].matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
  const dark = Object.assign({}, light, Object.fromEntries([...theme.match(/:root\[data-theme="dark"\] \{([\s\S]*?)\n\}/)[1].matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()])));
  // 原来是白底 + 深色字，压在白卡片上几乎看不出是按钮
  assert.equal(/\.button-quiet \{ color: var\(--text\)/.test(css), false, "不该再是白底深字");
  assert.match(css, /\.button-quiet \{ color: var\(--brand-deep\); border-color: var\(--brand-line\); background: var\(--brand-soft\); \}/);
  // 悬停不能靠加深底色：--brand-line 上的文字对比度只有 4.23，不达标
  assert.match(css, /\.button-quiet:hover:not\(:disabled\) \{ border-color: var\(--brand\); background: var\(--brand-soft\); box-shadow: 0 0 0 3px var\(--brand-ring\); \}/);
  for (const [mode, table] of [["浅色", light], ["深色", dark]]) {
    const ratio = contrastRatio(table["--brand-deep"], table["--brand-soft"]);
    assert.ok(ratio >= 4.5, `${mode}下次要按钮文字对比度只有 ${ratio.toFixed(2)}`);
  }
});

test("the scan notice can be closed and stays closed for the same result", () => {
  const html = readProjectFile("library.html");
  const js = readProjectFile("library.js");
  const css = readProjectFile("library.css");
  assert.match(html, /id="scanNotice" class="scan-notice"/);
  assert.match(html, /id="scanNoticeText"/);
  assert.match(html, /id="dismissScanNotice"/);
  assert.match(css, /\.scan-notice \{ display: flex/);
  assert.match(css, /\.scan-notice-close \{/);
  // 关掉之后，扫描结果没变就不该再冒出来（否则每次重扫都烦一次）
  assert.match(js, /let dismissedScanNotice = "";/);
  assert.match(js, /scanNotice\.hidden = !value \|\| value === dismissedScanNotice;/);
  assert.match(js, /dismissScanNoticeButton\?\.addEventListener\("click"/);
  assert.match(js, /dismissedScanNotice = scanNoticeText\?\.textContent \|\| "";/);
});

/* ------------------------- 4.8.1 入口与分页 ------------------------- */

test("page sizes are multiples of the five-per-row grid", () => {
  const library = readProjectFile("library.js");
  const match = library.match(/const PAGE_SIZES = \[([^\]]+)\];/);
  assert.ok(match, "找不到 PAGE_SIZES");
  const sizes = match[1].split(",").map((value) => Number(value.trim()));
  assert.deepEqual(sizes, [25, 50, 100]);
  // 一行 5 个，所以每页条数必须是 5 的倍数，否则最后一行会缺一个
  for (const size of sizes) assert.equal(size % 5, 0, `${size} 不是 5 的倍数`);
  assert.equal(sizes.includes(24), false, "不该再留着 24");
});

test("the sidebar offers a support link and a repository link", () => {
  const html = readProjectFile("library.html");
  const css = readProjectFile("library.css");
  // 放在版本号下方
  assert.ok(html.indexOf("side-support") > html.indexOf("side-version"), "两个入口应在版本号下方");
  assert.ok(html.indexOf("side-support") < html.indexOf("</aside>"), "两个入口应在侧栏里");
  // 一键三连指向 B 站主页，用「小电视」图标
  assert.match(html, /<a class="support-link" href="https:\/\/space\.bilibili\.com\/\d+" target="_blank" rel="noopener noreferrer"><span data-icon="tv"><\/span>/);
  // 仓库地址带 Github 图标
  assert.match(html, /<a class="repo-link" href="https:\/\/github\.com\/shijunan-Andrew\/bili-vault" target="_blank" rel="noopener noreferrer"><span data-icon="github"><\/span>/);
  assert.match(css, /\.side-support \{/);
  assert.match(css, /\.repo-link \{/);
});

test("the plugin footer shows the repository link next to the support link", () => {
  const html = readProjectFile("popup.html");
  const css = readProjectFile("popup.css");
  assert.match(html, /<div class="foot-left">/);
  const foot = html.slice(html.indexOf('<div class="foot-left">'), html.indexOf("</div>", html.indexOf('<div class="foot-left">')));
  assert.match(foot, /class="support-link"/);
  assert.match(foot, /class="repo-link"/);
  // 仓库链接排在支持链接右边（同一个竖排容器里在下面，DOM 顺序在后）
  assert.ok(foot.indexOf("repo-link") > foot.indexOf("support-link"), "仓库链接应在支持链接之后");
  assert.match(foot, /data-icon="tv"/);
  assert.match(foot, /data-icon="github"/);
  assert.match(css, /\.foot-left \{/);
  assert.match(css, /\.repo-link \{/);
});

test("both banners carry the Github mark", () => {
  const library = readProjectFile("library.html");
  const popup = readProjectFile("popup.html");
  const icons = readProjectFile("icons.js");
  // 两个图标都要真存在，否则水合后是空白
  assert.match(icons, /github: '/);
  assert.match(icons, /tv: '/);
  // 收藏库横幅的两段都要带图标（跑马灯整段克隆，少一段就会出现没图标的重复）
  assert.equal([...library.matchAll(/banner-icon" data-icon="github"/g)].length, 2);
  assert.match(library, /class="banner-icon" data-icon="github"><\/span><span data-i18n="本项目已在 GitHub 上开源/);
  assert.match(popup, /data-icon="github"><\/span>\s*<span data-i18n="此项目已在 Github 上开源/);
  // 克隆出来的图标节点没被水合过，必须补一次
  assert.match(readProjectFile("library.js"), /BcaIcons\.hydrate\(githubBanner\)/);
});

test("the Github mark is filled, unlike the line icon set", () => {
  const icons = readProjectFile("icons.js");
  // svg() 默认 fill:none / stroke:currentColor，猫标是实心品牌标识，必须单独覆盖
  const github = icons.match(/github: '([^']+)'/)[1];
  assert.match(github, /fill="currentColor"/);
  assert.match(github, /stroke="none"/);
  // 用 g transform 缩小，免得比同排的线性图标大一圈
  assert.match(github, /transform="translate/);
});

/* ------------------------- 4.8 标记与站外搜索 ------------------------- */

test("the download-directory naming lives in one place", () => {
  const core = readProjectFile("archive-core.js");
  const library = readProjectFile("library.js");
  assert.match(core, /function videoDirectoryLabel\(video, index = 0, options = \{\}\)/);
  assert.match(core, /function safeName\(value, fallback = "未知", maxLength = RECORD_NAME_MAX_CHARS\)/);
  // 共享实现只有 archive-core.js 一份。1.3.0 删掉 download.js 之后仓库里只剩收藏库
  // 一个调用方，它必须继续调共享实现 —— 否则「手动标记」建的目录换个入口就认不出来，
  // 又会建一个副本。
  assert.match(library, /BcaArchiveCore\.videoDirectoryLabel\(video, 0, \{ collectionName/);
  assert.equal(/function videoDirectoryLabel\(/.test(library), false, "library.js 里不该再留一份命名实现");
  assert.equal(/safeName\(video\.title/.test(library), false, "library.js 里不该自己拼目录名");
});

test("a marked video directory is recognised as downloaded", () => {
  const core = readProjectFile("archive-core.js");
  const library = readProjectFile("library.js");
  // 说明文件必须被扫描认出来，并且算作「已下载」
  assert.match(library, /const DOWNLOAD_MARKER_FILE = "请将视频放到这里\.txt";/);
  assert.match(library, /const DOWNLOAD_MARKER_TEXT = "请将别的地方下载的视频复制或移动到此处";/);
  assert.match(library, /result\.marked \|\|= entry\.name === DOWNLOAD_MARKER_FILE/);
  assert.match(library, /marked: contents\.marked/);
  assert.match(core, /downloaded: downloadMatchIsDownloaded\(match\)/);
  assert.match(core, /function downloadMatchIsDownloaded\(match\) \{\s*return Boolean\(match\?\.hasMedia \|\| match\?\.marked\);/);
  // 说明文件让 hasFiles 成立，所以扫描的既有条件不用放宽
  assert.match(library, /if \(!identifiers\.size \|\| !contents\.hasFiles\) continue;/);
});

test("the mark-as-downloaded flow is wired end to end", () => {
  const library = readProjectFile("library.js");
  const html = readProjectFile("library.html");
  for (const id of ["markDownloadedDialog", "markDownloadedPath", "markDownloadedStatus", "markDownloadedGo", "markDownloadedCancel"]) {
    assert.match(html, new RegExp(`id="${id}"`), `library.html 缺少 #${id}`);
  }
  // 已下载的记录不显示这个按钮
  assert.match(library, /class="button button-quiet mark-downloaded" type="button"\$\{video\.downloaded \? " hidden" : ""\}/);
  assert.match(library, /async function markVideoDownloaded\(video\)/);
  assert.match(library, /markDownloadedGo\?\.addEventListener\("click", runMarkDownloaded\)/);
  assert.match(library, /markDownloadedCancel\?\.addEventListener\("click"/);
  // 标记后要立刻反映到卡片与详情，不必等下一次重扫
  assert.match(library, /video\.downloaded = true;/);
  assert.match(library, /video\.hasDownloadFiles = true;/);
  // 说明做不到的事要说清楚：不能声称会下载视频
  assert.equal(/markVideoDownloaded[\s\S]{0,600}fetch\(/.test(library), false, "标记过程不该发起任何网络请求");
});

test("invalid videos get an off-site search escape hatch", () => {
  const library = readProjectFile("library.js");
  const css = readProjectFile("library.css");
  assert.match(library, /video\.isInvalid \? `<a class="button button-quiet search-invalid"/);
  assert.match(library, /https:\/\/www\.bing\.com\/search\?q=\$\{encodeURIComponent\(video\.title \|\| ""\)\}/);
  assert.match(library, /target="_blank" rel="noopener noreferrer" href=""[^>]*>\$\{BcaIcons\.svg\("search"\)\}/);
  assert.match(css, /\.search-invalid \{/);
  // 搜索的是标题，且必须转义，不能拼接原始字符串
  assert.equal(/bing\.com\/search\?q=" \+ video\.title/.test(library), false, "标题必须经过 encodeURIComponent");
});

test("detail cover and title link out, and fall back to a Bing search for invalid videos", () => {
  const library = readProjectFile("library.js");
  const css = readProjectFile("library.css");

  // 出口只有两个：失效视频 → Bing 搜标题；其余 → 归档里记的 B 站链接
  assert.match(library, /const detailHref = video\.isInvalid/);
  assert.match(library, /https:\/\/www\.bing\.com\/search\?q=\$\{encodeURIComponent\(video\.title \|\| ""\)\}/);
  assert.match(library, /: \(video\.url \|\| ""\);/);

  // 有链接才包 a；没有链接必须退回原来的 div —— href="" 会把扩展页自己导航走
  assert.match(library, /<a class="detail-cover detail-cover-link" href="\$\{escapeHtml\(detailHref\)\}"/);
  assert.match(library, /<div class="detail-cover">\$\{safeCover\(video\.cover\)\}<\/div>/);
  assert.match(library, /<h2 class="detail-title">\$\{titleHtml\}<\/h2>/);
  assert.match(library, /const titleHtml = detailHref[\s\S]{0,300}: "";/);

  // 标题文字要写给 a：只认 .detail-title 会把链接连同标题文字一起清空
  assert.match(library, /querySelector\("\.detail-title-link"\) \|\| detailContent\.querySelector\("\.detail-title"\)/);

  // 两个入口都走普通链接：新窗口 + noopener noreferrer
  for (const className of ["detail-cover-link", "detail-title-link"]) {
    assert.match(library, new RegExp(`class="[^"]*${className}"[^>]*target="_blank" rel="noopener noreferrer"`), `${className} 必须是新窗口普通链接`);
  }

  // 复用已有词典键，不新增词条
  assert.match(library, /video\.isInvalid \? BcaI18n\.t\("全网搜索该视频"\) : BcaI18n\.t\("在 B 站打开视频"\)/);

  // 样式：a 要补成块级，否则 aspect-ratio 与 overflow 撑不起来；两个入口都要有悬停反馈
  assert.match(css, /a\.detail-cover \{ display: block; \}/);
  assert.match(css, /\.detail-cover-link:hover \{/);
  assert.match(css, /\.detail-title-link:hover \{/);
});

test("the popup banner is static, full-bleed, closable, and gives its height back", () => {
  const html = readProjectFile("popup.html");
  const js = readProjectFile("popup.js");
  const css = readProjectFile("popup.css");
  const theme = readProjectFile("theme.css");
  for (const id of ["githubBanner", "githubBannerLink", "dismissGithubBanner"]) {
    assert.match(html, new RegExp(`id="${id}"`), `popup.html 缺少 #${id}`);
  }
  assert.match(html, /此项目已在 Github 上开源，点击查看/);
  assert.match(html, /https:\/\/github\.com\/shijunan-Andrew\/bili-vault/);
  assert.match(html, /rel="noopener noreferrer"/);

  const bannerBlock = css.match(/\.popup-banner \{[\s\S]*?\n\}/)[0];
  // 静态：这个横幅不该有动画（收藏库那个才是滚动的）
  assert.equal(/animation/.test(bannerBlock), false, "插件横幅应当是静态的");
  // 不做 sticky：sticky 的 top 是吸附阈值，负值会把顶部切掉，
  // 而且常驻可视区会一直占掉高度
  assert.equal(/position:\s*sticky/.test(bannerBlock), false, "横幅不该 sticky");
  // 负外边距必须正好抵消 main 的内边距（上 sp-3、左右 sp-4），否则不通栏
  assert.match(readProjectFile("popup.css"), /main \{ padding: var\(--sp-3\) var\(--sp-4\) var\(--sp-2\); \}/);
  assert.match(bannerBlock, /margin: calc\(var\(--sp-3\) \* -1\) calc\(var\(--sp-4\) \* -1\) var\(--sp-1\);/);
  // 净增高要小：高度 - 抵消掉的上内边距 + 下外边距
  const height = Number(bannerBlock.match(/height: (\d+)px/)[1]);
  const growth = height - 12 + 4;
  assert.ok(growth <= 20, `横幅净增高 ${growth}px，太多`);

  // 关掉之后必须真的让出高度：靠的是 theme.css 里那条全局规则。
  // .popup-banner { display: flex } 的优先级高于 [hidden] 的浏览器默认值，
  // 没有这条 !important，横幅会永远关不掉。
  assert.match(theme, /\[hidden\] \{ display: none !important; \}/);
  assert.match(html, /id="githubBanner" class="popup-banner" hidden/);
  assert.match(js, /function dismissGithubBanner\(\) \{[\s\S]*?banner\.hidden = true;/);

  // 关闭状态要记住，且与收藏库的横幅互不影响
  assert.match(js, /restoreGithubBanner\(\);/);
  assert.match(js, /addEventListener\("click", dismissGithubBanner\)/);
  assert.match(js, /popupGithubBannerDismissed/);
  assert.equal(/popupGithubBannerDismissed/.test(readProjectFile("library.js")), false);
});

/* ------------------------- 4.7 细节修复 ------------------------- */

test("the banner marquee fills the width and survives reduced-motion", () => {
  const library = readProjectFile("library.js");
  const css = readProjectFile("library.css");
  // 轨道只有两份文字时宽屏右边会空一大块：要按容器宽度补足份数
  assert.match(library, /function buildBannerMarquee/);
  assert.match(library, /Math\.ceil\(githubBanner\.clientWidth/, "份数要按容器宽度算");
  // 前后两半必须等宽，位移 50% 才能无缝
  assert.match(library, /track\.replaceChildren\(\.\.\.half, \.\.\.second\)/);
  // 窗口变宽要重建
  assert.match(library, /addEventListener\("resize"/);
  // theme.css 的全局 reduced-motion 会把动画压成「跑一次就弹回原位」，
  // 对跑马灯等于完全不动，所以必须有一条豁免
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.banner-scroll \{ animation-duration: 40s !important; animation-iteration-count: infinite !important; \}/);
});

test("filter dropdowns keep a stable width", () => {
  const css = readProjectFile("library.css");
  // 工具栏是右对齐的，select 宽度随选中项变长就会让整行窜动
  assert.match(css, /\.video-filter select \{ width: 132px; \}/);
  assert.match(css, /\.sort-select select \{ width: 124px; \}/);
  assert.match(css, /\.view-controls \{ display: flex; align-items: center; justify-content: flex-end/);
});

test("the native helper instructions come first and are bold", () => {
  const library = readProjectFile("library.js");
  const css = readProjectFile("library.css");
  assert.match(library, /function setDownloadPathNote\(text, isError = false, help = ""\)/);
  assert.match(library, /strong\.className = "download-path-help"/);
  assert.match(css, /\.download-path-help \{ display: block; margin-bottom: var\(--sp-2\); font-weight: 700; \}/);
  // 旧措辞必须彻底消失
  assert.equal(/若尚未安装原生助手：运行插件目录/.test(library), false, "旧的安装说明应已被替换");
  assert.match(library, /请运行插件目录中的 install-native-folder-opener\.bat/);
  // 调用点必须把 help 传进去（才会置顶加粗）
  assert.match(library, /setDownloadPathNote\(lines\.join\("\\n"\), true, help\)/);
});

test("the version shown in the UI carries a release-channel prefix", () => {
  // 两份实现必须给出同样的结果，否则收藏库和弹窗会显示不同的版本号
  const extract = (source) => {
    const match = source.match(/const RELEASE_CHANNEL = "(\w+)";[\s\S]*?function displayVersion\(raw\) \{[\s\S]*?\n\}/);
    if (!match) throw new Error("找不到 displayVersion");
    return new Function(match[0] + "; return displayVersion;")();
  };
  const fromLibrary = extract(readProjectFile("library.js"));
  const fromPopup = extract(readProjectFile("popup.js"));
  for (const raw of ["4.7.0", "4.7.1", "1.0.0", ""]) {
    assert.equal(fromLibrary(raw), fromPopup(raw), "两个文件的 displayVersion 对 " + raw + " 结果不一致");
  }
  // 正式版：渠道为 release，显示 V + 完整三段版本号
  assert.equal(fromLibrary("1.0.0"), "V1.0.0");
  assert.equal(fromLibrary("1.0.1"), "V1.0.1");
  assert.equal(fromLibrary("4.7.0"), "V4.7.0");
  // 渠道常量本身也要是 release —— 测试版时期这里是 "beta"
  assert.match(readProjectFile("library.js"), /const RELEASE_CHANNEL = "release";/);
  assert.match(readProjectFile("popup.js"), /const RELEASE_CHANNEL = "release";/);
  assert.match(readProjectFile("library.js"), /sideVersion\.textContent = displayVersion\(/);
  assert.match(readProjectFile("popup.js"), /displayVersion\(chrome\.runtime\.getManifest\(\)\.version\)/);
});

test("the import card is highlighted in orange", () => {
  const css = readProjectFile("popup.css");
  const theme = readProjectFile("theme.css");
  for (const token of ["--feature:", "--feature-soft:", "--feature-line:"]) {
    assert.ok(theme.includes(token), "theme.css 缺少 " + token);
  }
  assert.match(css, /\.import-card \{ border-color: var\(--feature-line\); \}/);
  assert.match(css, /\.import-card > summary strong \{ color: var\(--feature\); \}/);
  // 4.8.3：图标做成实心（橘黄底 + 浅橘图形），深浅主题都达标
  assert.match(css, /\.import-card > summary \.import-summary-icon \{ color: var\(--feature-soft\); background: var\(--feature\); \}/);
  // 折叠态与展开态统一底色，视觉上不再有断层
  assert.match(css, /\.import-card > summary \{ background: var\(--feature-soft\); \}/);
  // 这一组必须排在 .import-card > summary 那几条之后。4.7 时写在前面，
  // 同为 (0,2,1) 的 :hover 被后面的规则盖掉，橘黄悬停从来没生效过。
  const baseAt = css.indexOf(".import-card > summary {");
  const iconAt = css.indexOf(".import-card > summary .import-summary-icon");
  assert.ok(baseAt >= 0 && iconAt > baseAt, "橘黄规则必须排在基础规则之后，否则会被覆盖");
});

test("the folder-move warning is part of the shared notice", () => {
  const warning = "从 chrome://extensions 导入插件后请不要移动插件文件夹位置";
  for (const page of ["library.html", "popup.html"]) {
    assert.ok(readProjectFile(page).includes(warning), page + " 缺少「不要移动插件文件夹」的提示");
  }
});

/* ------------------------- 4.6 收藏库改造 ------------------------- */

test("the library scans incrementally but always keeps a full-scan escape", () => {
  const library = readProjectFile("library.js");
  // 缓存：按根目录隔离 + 以 size/mtime 为键
  assert.match(library, /new WeakMap\(\)/, "缓存要按根目录 handle 隔离");
  assert.match(library, /lastModified/, "缓存键必须包含修改时间");
  assert.match(library, /function clearArchiveCache\(/);
  assert.match(library, /forceFullScan = true;[\s\S]{0,80}clearArchiveCache\(rootHandle\)/, "刷新按钮必须走强制全量");
  // 扫描进度
  assert.match(library, /正在读取 \{done\}\/\{total\}…/);
  assert.match(library, /本次扫描 \{count\} 条记录，其中 \{reused\} 条直接复用缓存。/);
});

test("the library filters by collection, uploader and tag", () => {
  const html = readProjectFile("library.html");
  const library = readProjectFile("library.js");
  for (const id of ["collectionFilter", "collectionFilterEmpty", "upFilter", "tagFilter"]) {
    assert.match(html, new RegExp(`id="${id}"`), `library.html 缺少 #${id}`);
  }
  assert.match(library, /collectionFilterInput\?\.addEventListener\("input"/);
  assert.match(html, /data-i18n="没有匹配的收藏夹"/);
  assert.match(html, /id="upFilter"[^>]*data-i18n-aria="按 UP 主筛选"/);
  assert.match(html, /id="tagFilter"[^>]*data-i18n-aria="按标签筛选"/);
  // 选项池不能受自身选择影响，否则选中后其它选项会消失
  assert.match(library, /全部 UP 主/);
  assert.match(library, /全部标签/);
});

test("the library is keyboard navigable and traps focus in overlays", () => {
  const library = readProjectFile("library.js");
  assert.match(library, /const ARROW_KEYS = new Set\(\["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"\]\)/);
  assert.match(library, /function trapFocus\(/);
  assert.match(library, /event\.key === "Escape"/);
});

test("cards show relative dates and keep the exact time in the tooltip", () => {
  const library = readProjectFile("library.js");
  for (const key of ["今天", "昨天", "{count} 天前", "{count} 个月前"]) {
    assert.ok(library.includes(`BcaI18n.t("${key}"`), `缺少相对时间文案 ${key}`);
  }
  assert.match(library, /\.title = /, "完整时间要放进 title");
});

test("batch refresh reports progress and can list its failures", () => {
  const html = readProjectFile("library.html");
  const library = readProjectFile("library.js");
  assert.match(html, /id="failurePanel"/);
  assert.match(library, /正在更新视频状态 \{counter\}/);
  assert.match(html, /data-i18n="复制全部"/);
  // background.js 不许为了这个功能被改
  assert.equal(/failurePanel/.test(readProjectFile("background.js")), false);
});

test("settings export never leaks directory handles or archive data", () => {
  const library = readProjectFile("library.js");
  assert.match(library, /导出配置/);
  assert.match(library, /导入配置/);
  assert.match(library, /这个文件不是合法的 JSON，无法导入。/);
  assert.match(library, /这不是哔哩藏库导出的配置文件。/);
  // 导出内容里绝不能出现目录句柄或 B 站数据
  const exportBlock = library.slice(library.indexOf("导出配置") - 200, library.indexOf("导出配置") + 2400);
  for (const forbidden of ["rootHandle", "collectionHandle", "directoryHandle", "cover", "bvid", "upMid"]) {
    assert.equal(exportBlock.includes(forbidden), false, `导出配置里不该出现 ${forbidden}`);
  }
});

test("the theme reaches the content script through chrome.storage", () => {
  const theme = readProjectFile("theme.js");
  const content = readProjectFile("content.js");
  // 内容脚本读不到扩展的 localStorage，必须靠 storage 镜像
  assert.match(theme, /chrome\?\.storage\?\.local/);
  assert.match(content, /chrome\.storage\.local/);
  assert.match(content, /interfaceTheme/);
  // 卡片根节点的属性名故意避开宿主页面可能用到的 data-theme
  assert.match(content, /data-bca-theme/);
  assert.equal(/:host\(\[data-theme=/.test(content), false, "不该再用裸 data-theme 选择器");
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
  // download.css 随下载页一起删了，剩下的两个页面样式表都要扫（两个都定义了实心绿按钮）
  for (const cssFile of PAGE_STYLES) {
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

test("the abuse warning is emphasised on both surfaces", () => {
  for (const [htmlFile, cssFile] of [["library.html", "library.css"], ["popup.html", "popup.css"]]) {
    assert.match(readProjectFile(htmlFile), /<li class="safety-abuse" data-i18n="请勿滥用：/, `${htmlFile} 的「请勿滥用」缺少 safety-abuse 标记`);
    const rule = (readProjectFile(cssFile).match(/\.safety[-a-z]*list li\.safety-abuse \{[^}]*\}/) || [""])[0];
    assert.match(rule, /font-weight: 700/, `${cssFile} 的「请勿滥用」应加粗`);
    assert.match(rule, /text-decoration: underline/, `${cssFile} 的「请勿滥用」应加下划线`);
    // 强调色必须走令牌，深色下才正常
    assert.match(rule, /var\(--warning\)/, `${cssFile} 的强调色应使用 --warning 令牌`);
  }
});
test("theme, language, and the guide all live in the settings page behind one gear", () => {
  const html = readProjectFile("library.html");
  // 注释里会提到删掉的那些东西，所以查“不该再有”之前先剥注释
  const library = stripComments(readProjectFile("library.js"));
  // 4.5.1 的侧栏 <select>、V1.3.1 的三个悬浮球，V1.3.2 起合成一个齿轮进设置页
  assert.equal(/id="themeSelect"/.test(html), false, "旧的主题下拉框应已删除");
  assert.equal(/id="localeSelect"/.test(html), false, "旧的语言下拉框应已删除");
  for (const gone of ["themeBall", "themeBallIcon", "themeMenu", "localeBall", "localeMenu", "guide-fab"]) {
    assert.equal(html.includes(gone), false, `library.html 里不应再有 ${gone}`);
  }
  // 右下角两个球：齿轮 + 它上面的「回到顶部」，跟原来一样共用 .dock-ball 的圆形浮标观感
  assert.match(html, /<button id="settingsFab" class="dock-ball"/, "收藏库右下角要有一个设置齿轮");
  assert.match(html, /<button id="scrollTopFab" class="dock-ball is-hidden"/, "齿轮上方要有回到顶部");
  assert.match(html, /id="scrollTopFab"[^>]*data-i18n-title="回到顶部"/, "回到顶部的 title 要能翻译");
  assert.match(html, /id="scrollTopFab"[\s\S]{0,200}?data-icon="arrow-up"/, "回到顶部要用 icons.js 里的 arrow-up 图标");
  assert.ok(html.indexOf('id="scrollTopFab"') < html.indexOf('id="settingsFab"'), "回到顶部要排在齿轮上方");
  assert.match(readProjectFile("icons.js"), /"arrow-up": '<path /, "icons.js 里要有 arrow-up");
  assert.match(html, /id="settingsFab"[^>]*data-i18n-title="设置"/, "齿轮的 title 要能翻译");
  assert.match(html, /id="settingsFab"[\s\S]{0,200}?data-icon="settings"/, "齿轮要用 icons.js 里的 settings 图标");
  // 点齿轮开独立的设置页（扩展页面可以直接被扩展自己打开，不需要 web_accessible_resources）
  assert.match(library, /settingsFab\.addEventListener\("click"/);
  assert.match(library, /chrome\.tabs\.create\(\{ url: chrome\.runtime\.getURL\("settings\.html"\) \}\)/);
  // V1.4.1：回到顶部。收藏库是整页跟着窗口滚的，所以滚 window；滚过一段距离才露出来，
  // 停在顶部时按它不会有任何变化，露着反而像坏了。
  assert.match(library, /const SCROLL_TOP_REVEAL_AT = 240;/);
  assert.match(library, /scrollTopFab\.classList\.toggle\("is-hidden", nearTop\)/);
  assert.match(library, /scrollTopFab\.tabIndex = nearTop \? -1 : 0;/);
  assert.match(library, /window\.scrollTo\(\{ top: 0, behavior: prefersReducedMotion\(\) \? "auto" : "smooth" \}\)/);
  assert.match(library, /window\.addEventListener\("scroll", syncScrollTopFab, \{ passive: true \}\)/);
  // 旧悬浮球那套菜单逻辑不许留死代码
  for (const gone of ["THEME_ICONS", "function themeLabel(", "function toggleDockMenu(", "function closeDockMenus(", "function buildDockMenu(", "function renderDockMenus(", "BcaTheme.onChange("]) {
    assert.equal(library.includes(gone), false, `library.js 里不应再有 ${gone}`);
  }
  // 浮标容器还在：两个球都钉在右下角，而且整体抬高一档（原来 bottom 只有 22px，贴着页脚）
  const rule = (readProjectFile("library.css").match(/\.floating-dock \{[^}]*\}/) || [""])[0];
  assert.match(rule, /position: fixed/);
  assert.match(rule, /right:/);
  assert.match(rule, /bottom: calc\(var\(--sp-6\) \+ var\(--sp-5\)\)/, "整排要抬高一档");
  const css = stripComments(readProjectFile("library.css"));
  assert.match(css, /\.dock-ball\.is-hidden \{ opacity: 0; pointer-events: none; \}/, "收起时不该还能点");
  assert.equal(css.includes(".dock-menu"), false, "菜单样式应随菜单一起删掉");
  assert.equal(css.includes(".guide-fab"), false, "问号球样式应随问号球一起删掉");
});

test("the settings page offers theme, language, and the two help pages", () => {
  const html = readProjectFile("settings.html");
  const script = readProjectFile("settings.js");
  // 顶部沿用「标题 + 一句说明 + 右上角返回收藏库」的形态
  assert.match(html, /<h1 data-i18n="哔哩藏库 · 设置">/, "设置页标题要能翻译");
  // 返回收藏库：把这个标签页本身导航回去。V1.4.1 之前是先 window.close()，但「关掉标签页」
  // 只在「上一个被激活的标签恰好是收藏库」时才看起来正确 —— 用户真机上报过
  // 「点返回收藏库只是把设置页关掉，人没转到收藏库」。
  assert.match(html, /<button id="settingsBack"[^>]*data-i18n="返回收藏库">/, "设置页要有返回收藏库的按钮");
  assert.match(script, /getElementById\("settingsBack"\)\?\.addEventListener\("click"/);
  assert.match(script, /chrome\.tabs\.getCurrent\(\(tab\) => \{/);
  assert.match(script, /chrome\.tabs\.update\(tab\.id, \{ url \}\)/);
  assert.match(script, /window\.location\.href = url;/, "拿不到 tab 时要退回就地导航，别把人卡住");
  // 外观：三个主题选项（分段控件与弹窗共用 theme.css 里的那一份）
  assert.match(html, /class="segmented"/);
  for (const mode of ["system", "light", "dark"]) {
    assert.match(html, new RegExp(`data-theme-value="${mode}"[^>]*aria-pressed="false"`), `设置页缺少主题选项 ${mode}`);
  }
  // 语言：三个选项
  for (const locale of ["zh-CN", "zh-TW", "en"]) {
    assert.match(html, new RegExp(`data-locale="${locale}"[^>]*aria-pressed="false"`), `设置页缺少语言选项 ${locale}`);
  }
  // 使用说明与安装教程的入口
  assert.match(html, /href="guide\.html"[^>]*data-i18n="打开使用说明"/);
  assert.match(html, /href="tutorial\.html"[^>]*data-i18n="打开安装教程"/);
  // i18n 四件套：引 i18n.js、标界面文字、标题在 JS 里设（data-i18n-title 改不了 <title>）
  assert.match(html, /<script src="i18n\.js"><\/script>/);
  assert.match(html, /<link rel="stylesheet" href="settings\.css">/);
  assert.match(script, /await BcaI18n\.init\(\)\.catch\(\(\) => \{\}\)/);
  assert.match(script, /document\.title = BcaI18n\.t\("哔哩藏库 · 设置"\)/);
  // 两个开关都走现成 API，改完立即生效并且留在本页
  assert.match(script, /BcaTheme\.use\(button\.dataset\.themeValue\)/);
  assert.match(script, /await BcaI18n\.use\(locale\)/);
  assert.match(script, /BcaTheme\.onChange\(renderThemeOptions\)/);
  assert.match(script, /BcaI18n\.onChange\(/);
  // 别处（弹窗）改了语言要跟上，同时要认出「这是我自己刚写的」
  assert.match(script, /chrome\.storage\.onChanged\.addListener/);
  assert.match(script, /next === BcaI18n\.locale\(\)/);
  // 改设置本身不该关掉设置页，也不该再靠关标签页「返回收藏库」（V1.4.1 改成导航）。
  // 查「关页」要剥注释 —— 说明文字里会提到旧写法。
  const settingsCode = stripComments(script);
  assert.doesNotMatch(settingsCode, /chrome\.tabs\.remove/);
  assert.equal(/window\.close\(\)/.test(settingsCode), false, "设置页不再靠关标签页返回，也就不该有关页调用");
  // 只改选中态、不写文字：切完语言后写死的文字会把译文盖回中文
  assert.doesNotMatch(script, /textContent\s*=/);
  // 毛玻璃开关的视觉是 .off 类画的（照 popup.css 的约定）。只写 aria-pressed 的话，
  // 「上次已经开着毛玻璃」的用户再打开设置页会看到一个显示为「关」的开关。
  assert.match(html, /id="glassToggle" class="toggle-switch off"/);
  assert.match(script, /glass\.classList\.toggle\("off", !appearance\.glass\)/);
});
test("the interface language switcher offers three locales", () => {
  const html = readProjectFile("library.html");
  const library = readProjectFile("library.js");
  const settings = readProjectFile("settings.html");
  assert.match(html, /<script src="i18n\.js"><\/script>/);
  assert.match(html, /<script src="theme\.js"><\/script>/);
  // V1.3.2：切换语言的三个选项搬到了设置页，收藏库只跟着变
  for (const locale of ["zh-CN", "zh-TW", "en"]) {
    assert.match(settings, new RegExp(`data-locale="${locale}"`), `设置页缺少语言选项 ${locale}`);
  }
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
  // 主题/语言名本身不翻译：语言名是各语言的自称，任何界面下都原样显示
  for (const label of ["简体中文", "繁體中文", "English"]) {
    assert.match(settings, new RegExp(`>${label}</button>`), `设置页缺少语言名 ${label}`);
    assert.equal(new RegExp(`data-i18n="[^"]*">${label}</button>`).test(settings), false, `${label} 是自称，不该挂 data-i18n`);
  }
});
// 使用须知必须在两个界面逐字一致，否则用户在不同入口看到的说法会不一样。
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

test("both surfaces show the same six safety items, abuse warning first", () => {
  const surfaces = ["library.html", "popup.html"];
  const lists = Object.fromEntries(surfaces.map((file) => [file, noticeItems(readProjectFile(file))]));
  for (const file of surfaces) {
    assert.equal(lists[file].length, 6, `${file} 的使用须知应正好六条`);
    // 4.5：请勿滥用提到最前面
    assert.ok(lists[file][0].startsWith("请勿滥用："), `${file} 的第一条必须是「请勿滥用」`);
    assert.equal(lists[file].filter((item) => item.startsWith("请勿滥用：")).length, 1, `${file} 的「请勿滥用」只应出现一次`);
    const html = readProjectFile(file);
    // 1.3.0：原来这一条是「自带下载器不稳定，建议改用 DownKyi」并带一个第三方下载器链接，
    // 随下载功能一起删掉了 —— 插件不再提供下载，也就不该再替用户指路去找下载器。
    // 换成了必须说清的那件事：本版本不再提供下载功能。
    assert.ok(html.includes("不再提供下载功能"), `${file} 的须知没有说明 1.3.0 起不再提供下载功能`);
    // 页面上剩下的外链仍然必须带新窗口保护（node 端没法验证 rel 的语义，至少不许漏写）
    for (const anchor of html.match(/<a\b[^>]*target="_blank"[^>]*>/g) || []) {
      assert.match(anchor, /rel="noopener/, `${file} 的外链缺少 noopener：${anchor.slice(0, 90)}`);
    }
  }
  assert.deepEqual(lists["popup.html"], lists["library.html"], "弹窗与收藏库的须知必须逐字一致");
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
  for (const file of ["library.css", "popup.css"]) {
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
function loadThemeModule({ stored = null, prefersDark = false, appearance = null } = {}) {
  const attributes = {};
  const properties = {};
  const classes = new Set();
  const listeners = {};
  // 1.4.0 起 theme.js 还会读写 interfaceAppearance，所以这里按「键」分清：
  // 界面主题仍走 .value（老用例直接改它来模拟别的页面写入），外观走 .values。
  const storage = {
    value: stored,
    values: {},
    getItem(key) {
      if (key === "interfaceAppearance") return this.values[key] ?? null;
      return this.value;
    },
    setItem(key, next) {
      if (key === "interfaceAppearance") { this.values[key] = next; return; }
      this.value = next;
    }
  };
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
      classList: {
        toggle(name, on) { if (on) classes.add(name); else classes.delete(name); return Boolean(on); },
        contains(name) { return classes.has(name); }
      },
      style: {
        setProperty(name, value) { properties[name] = value; },
        removeProperty(name) { delete properties[name]; }
      },
      setAttribute(name, value) { attributes[name] = value; },
      removeAttribute(name) { delete attributes[name]; }
    }
  };
  if (appearance) storage.values["interfaceAppearance"] = JSON.stringify(appearance);
  new Function("globalThis", "document", readProjectFile("theme.js"))(sandbox, fakeDocument);
  return { api: sandbox.BcaTheme, attributes, dataset: fakeDocument.documentElement.dataset, properties, classes, storage, sandbox };
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
  for (const file of ["library.js", "popup.js", "content.js"]) {
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
// ---- V1.7.9（审查报告 P2 批次 2）------------------------------------------

test("毛玻璃的降级清单同时覆盖统计页，高对比度模式也有兜底（V1.7.9）", () => {
  // 统计页的毛玻璃类名写在 stats.css 里，theme.css 的两份降级清单以前只管
  // 收藏库与设置页 —— 统计页照样跟着主题透，却不肯在减少动态效果时关掉 blur。
  const statsStyles = readProjectFile("stats.css");
  const glassClasses = [".stats-card", ".stats-foot", ".stats-topbar", ".stats-picker-menu", ".stats-tile", ".stats-top-row"];
  for (const name of glassClasses) {
    assert.ok(statsStyles.includes(name), `stats.css 里应该有毛玻璃类名 ${name}`);
  }
  const theme = readProjectFile("theme.css");
  const reduced = theme.match(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\n\}/);
  assert.ok(reduced, "theme.css 里应该有 prefers-reduced-motion 块");
  assert.match(reduced[0], /backdrop-filter: none !important/);
  const forced = theme.match(/@media \(forced-colors: active\) \{[\s\S]*?\n\}/);
  assert.ok(forced, "theme.css 里应该有 forced-colors: active 块");
  for (const name of glassClasses) {
    assert.ok(reduced[0].includes(name), `减少动态效果的玻璃清单漏了 ${name}`);
    assert.ok(forced[0].includes(name), `高对比度的玻璃清单漏了 ${name}`);
  }
  // 高对比度下颜色被系统换成单一调色板，块与块的分界只能靠系统色画的边框。
  assert.match(forced[0], /background: Canvas;/);
  assert.match(forced[0], /border: 1px solid CanvasText;/);
  // 饼图每一片、像素画每一帧的颜色本身就是信息，不能被系统涂成同一个颜色。
  assert.match(forced[0], /forced-color-adjust: none/);
});

test("界面与词典统一说「本地归档」，术语表给出对照（V1.7.9）", () => {
  // 「本地收藏夹」和 B 站账户里的「收藏夹」只差两个字，删除确认时最容易点错。
  // guide.html 的术语表本身要提到旧说法（解释为什么改名），是唯一豁免。
  const uiFiles = ["library.html", "library.js", "popup.html", "popup.js", "tutorial.html",
    "tutorial.js", "settings.html", "settings.js", "stats.html", "stats.js",
    "content.js", "background.js", "manifest.json", "guide.html"];
  const offenders = [];
  for (const file of uiFiles) {
    const hits = (readProjectFile(file).match(/本地收藏夹/g) || []).length;
    if (hits) offenders.push(`${file} 命中 ${hits} 次`);
  }
  assert.ok(
    offenders.length <= 1 && offenders[0].startsWith("guide.html"),
    `旧说法「本地收藏夹」只允许留在 guide.html 的术语表里，实际：${offenders.join("、") || "无"}`
  );
  for (const locale of ["zh-TW", "en"]) {
    const dictionary = i18nTools.readDictionary(locale) || {};
    for (const [key, value] of Object.entries(dictionary)) {
      if (key.startsWith("1.7.9 起统一改口")) continue; // 术语表那条要复述旧说法
      assert.ok(!key.includes("本地收藏夹"), `${locale} 里还留着旧键：${key}`);
      assert.ok(!String(value).includes("本地收藏夹"), `${locale} 的译文里还留着旧说法：${key}`);
    }
  }
  const guide = readProjectFile("guide.html");
  assert.match(guide, /术语对照：三个「夹」别混/);
  assert.match(guide, /data-i18n="本地归档"/);
  assert.match(guide, /data-i18n="本地备份文件夹"/);
});

test("两张统计图都能以表格读到（V1.7.9）", () => {
  const stats = readProjectFile("stats.js");
  assert.match(stats, /function renderChartTable\(host, caption, headCells, rows\) \{/);
  for (const [name, signature] of [
    ["drawChart", /function drawChart\(host, rows, options\) \{[\s\S]*?\n\}/],
    ["drawPieTo", /function drawPieTo\(host, slices, total, options\) \{[\s\S]*?\n\}/]
  ]) {
    const body = stats.match(signature);
    assert.ok(body, `stats.js 里应该有 ${name}`);
    assert.ok(body[0].includes("renderChartTable("), `${name} 应该配一份可读的数据表`);
  }
  // 表格本身要是真表格：有 caption，不是拿 div 拼的。
  assert.match(stats, /<caption>/);
  assert.match(stats, /document\.createElement\("table"\)/);
  assert.match(readProjectFile("stats.css"), /\.stats-table/);
});

test("批量进度播报有节流，且弹层关掉后不会再补写一次（V1.7.9）", () => {
  const library = readProjectFile("library.js");
  const throttle = library.match(/const STATUS_PROGRESS_THROTTLE_MS = (\d+);/);
  assert.ok(throttle, "library.js 里应该有 STATUS_PROGRESS_THROTTLE_MS");
  assert.ok(Number(throttle[1]) >= 500, `进度播报间隔至少 500ms，实际 ${throttle[1]}ms`);
  const apply = library.match(/function applyStatusProgress\(message\) \{[\s\S]*?\n\}/);
  assert.ok(apply, "library.js 里应该有 applyStatusProgress");
  assert.ok(apply[0].includes("STATUS_PROGRESS_THROTTLE_MS"), "applyStatusProgress 应该走节流，不能每条都写 role=status");
  // 有节流就必须有取消，否则弹层关掉、进度条刚清空，那个 setTimeout 还会回来补写一次。
  assert.match(library, /function cancelStatusProgressTimer\(\) \{/);
  assert.ok(library.includes("cancelStatusProgressTimer();"), "取消函数必须真的被调用");
});

test("快捷键交给读屏，失败时弹窗给出人话摘要，移除背景图要确认且有反馈（V1.7.9）", () => {
  // Ctrl K 画成 <kbd> 只是给人看的；语义挂在 input 上才读得出来。
  assert.match(readProjectFile("library.html"), /id="searchInput"[^>]*aria-keyshortcuts="Control\+K"/);
  assert.match(readProjectFile("settings.html"), /aria-keyshortcuts="Control\+K"/);
  // 出错时不展开、不报读屏，报告就埋在折叠区里没人看见。
  const popupHtml = readProjectFile("popup.html");
  assert.match(popupHtml, /id="errorTitle"/);
  assert.match(popupHtml, /role="alert"/);
  assert.match(popupHtml, /<summary data-i18n="查看错误详情">查看错误详情<\/summary>/);
  const popup = readProjectFile("popup.js");
  assert.match(popup, /function errorSummaryText\(error\) \{/);
  assert.match(popup, /errorSummary\.textContent = errorSummaryText\(/);
  assert.match(popup, /if \(statusCard\) statusCard\.open = true;/);
  assert.match(popup, /errorTitle\?\.focus\(/);
  // 移除背景图：先问一句，成了要给 role=status 的反馈。
  const settings = readProjectFile("settings.js");
  assert.match(settings, /const WALLPAPER_STATUS_MS = \d+;/);
  assert.match(settings, /window\.confirm\(BcaI18n\.t\("移除后要重新选图才能恢复，确定移除背景图片吗？"\)\)/);
  assert.match(settings, /showWallpaperStatus\("背景图已移除"\)/);
  assert.match(readProjectFile("settings.html"), /id="wallpaperStatus" role="status" hidden/);
});

// ---- V1.7.10（审查报告 P2 批次 3）------------------------------------------

test("归档侧的两个写者共用同一把跨上下文闸门（V1.7.10）", () => {
  const background = readProjectFile("background.js");
  const library = readProjectFile("library.js");
  // 闸门键名与陈旧阈值必须在两边逐字一致 —— 名字差一个字，两边就各锁各的，等于没有互斥
  for (const source of [background, library]) {
    assert.match(source, /const ARCHIVE_WRITE_LOCK_KEY = "archiveWriteLock";/);
    assert.match(source, /const ARCHIVE_WRITE_LOCK_MAX_AGE_MS = 30 \* 60 \* 1000;/);
    assert.match(source, /chrome\.storage\.session/);
  }
  // 后台：导入开始时锁上、结束时放掉
  assert.match(background, /setArchiveWriteLock\("import"\);/);
  assert.match(background, /async function finishImportRunSnapshot\(\) \{\s*\n\s*\/\/[\s\S]{0,200}?await clearArchiveWriteLock\("import"\);/);
  // 后台开始导入之前要看收藏库那侧有没有人在写
  assert.match(background, /if \(await archiveWriteLockHeldBy\("library"\)\) \{/);
  // 页面：三个写入标志任意一个为真就立锁，并在这四条写路径上先问后台
  assert.match(library, /function publishLibraryWriteLock\(\) \{/);
  assert.match(library, /const busy = deleteInProgress \|\| collectionCreateInProgress \|\| videoAddInProgress;/);
  assert.equal([...library.matchAll(/if \(await archiveWriteLockedByImport\(\)\) \{/g)].length, 4, "删除 / 搬运 / 新建收藏夹 / 手动添加四条写路径都要先查闸门");
  assert.equal([...library.matchAll(/publishLibraryWriteLock\(\);/g)].length, 6, "三个标志各在置位与复位处同步一次闸门");
  // 只清自己那一把：不能把别人后写进来的锁顺手抹掉
  assert.match(background, /if \(!lock \|\| !kind \|\| lock\.kind === kind\) await chrome\.storage\.session\.remove/);
});

test("统计库够不够格被覆盖，要看这一次扫到多少（V1.7.10）", () => {
  const library = readProjectFile("library.js");
  assert.match(library, /const STATS_SHRINK_KEEP_RATIO = 0\.7;/);
  // 旧库解析不出来时先把现场留档，备份失败就不动它 —— 原来是「解析失败就当没有旧库」，
  // 接着照写，把唯一一份完整历史覆盖掉。
  assert.match(library, /previousBroken/);
  assert.match(library, /database\.bad\.\$\{/);
  assert.match(library, /本地数据库读不出来，这次先不动它，免得把唯一的现场覆盖掉。/);
  // 扫描结果比旧库少太多时只提示不覆盖；「刷新」按钮是用户明确表示「确实删了」的出口
  assert.match(library, /videos\.length < previousCount \* STATS_SHRINK_KEEP_RATIO/);
  assert.match(library, /forceStatsSync: true/);
  assert.match(library, /async function syncStatsDatabase\(handle, options = \{\}\)/);
});

test("收藏夹顺序没读出来时不许写回，配置导入要有上限和交代（V1.7.10）", () => {
  const library = readProjectFile("library.js");
  // 「确实没保存过」和「这次没读出来」分开：后者清空内存顺序就等于把用户排好的顺序扔了
  assert.match(library, /let collectionOrderLoaded = false;/);
  assert.match(library, /collectionOrderLoaded = true;/);
  assert.match(library, /if \(!collectionOrderLoaded\) \{\s*\n\s*\/\/[^\n]*\n\s*showToast\(BcaI18n\.t\("这次没能读到已保存的收藏夹顺序，为避免覆盖它，本次排序只临时生效。"\)\);/);
  assert.equal(/collectionOrder = \[\]; \}\)/.test(library), false, "读失败不许清空顺序");
  assert.match(library, /const MAX_CONFIG_BYTES = 256 \* 1024;/);
  assert.match(library, /file\.size > MAX_CONFIG_BYTES/);
  // 单条目录名与两个筛选值都要有长度上限 + 与实际收藏夹求交集
  assert.match(library, /\.slice\(0, 500\)\.map\(\(name\) => name\.slice\(0, 120\)\)/);
  assert.match(library, /const known = new Set\(collections\.map\(\(collection\) => collection\.name\)\);/);
  // 写失败不能再是空 catch
  assert.equal(/storage\.local\.set\(\{ collectionOrder \}\)[^\n]*catch \(_\) \{\}/.test(library), false, "配置导入写 storage 失败要说话");
});

test("归档目录名的 200 字节闸、坏库留档、半截目录都钉住（V1.7.10）", () => {
  const core = readProjectFile("archive-core.js");
  const background = readProjectFile("background.js");
  const library = readProjectFile("library.js");
  // 文件名上限是字节不是字符：85 个汉字就到 NTFS 的 255 字节了
  assert.match(core, /const MAX_SEGMENT_BYTES = 200;/);
  assert.match(core, /function truncateToBytes\(text, maxBytes\) \{/);
  assert.match(background, /function truncateToBytes\(text, maxBytes\) \{/);
  assert.match(core, /truncateToBytes\(name\.slice\(0, COLLECTION_NAME_MAX_CHARS\), MAX_SEGMENT_BYTES\) \|\| fallback/);
  assert.match(background, /return truncateToBytes\(value\.slice\(0, COLLECTION_NAME_MAX_CHARS\), MAX_SEGMENT_BYTES\);/);
  // 坏库改带时间戳，且只留最近几份
  assert.equal(/STATS_DATABASE_BACKUP_NAME/.test(background), false, "固定的 database.bad.json 会被第二次损坏覆盖");
  assert.match(background, /const STATS_DATABASE_BACKUP_PREFIX = "database\.bad\.";/);
  assert.match(background, /const STATS_DATABASE_KEEP_BACKUPS = 5;/);
  // 统计写入失败要把这批记录放回队首，不能先清队再写、失败即丢整批
  assert.match(background, /async function flushStatsPendingRecords\(root, insertedKeys = null\) \{/);
  assert.match(background, /statsPendingRecords\.unshift\(\.\.\.batch\);/);
  assert.match(background, /const STATS_PENDING_MAX_RECORDS = 20000;/);
  // 复制原语不许覆盖已存在的目标文件
  assert.match(library, /async function copyDirectoryContents\(source, target, result = \{ copied: 0, skipped: \[\] \}\) \{/);
  assert.match(library, /目标目录里已经有同名文件，没有覆盖/);
  // 下载清理「这次没法确认」要和「确实没有」分开说
  assert.match(library, /没找到下载文件夹（000视频下载），关联的下载文件这次一个都没动。/);
  // 半截目录（没有 视频信息.txt）要单独报出来，不能静默 continue
  assert.match(library, /async function isUnfinishedRecord\(recordEntry\) \{/);
  assert.match(library, /另有 \{count\} 个目录没写完（没有 视频信息\.txt，多半是上次导入被打断）：\{list\}/);
  assert.match(library, /unfinished: result\.unfinished \|\| \[\]/);
  // 背景图要请求持久化存储，别让浏览器当临时数据回收
  assert.match(readProjectFile("manifest.json"), /"unlimitedStorage"/);
  assert.match(readProjectFile("theme.js"), /storage\.persist\(\)/);
});

// ---- V1.7.11（审查报告 P2 批次 4）------------------------------------------

test("出网口只有白名单里的域名，报告里的本机路径先打码再进 storage（V1.7.11）", () => {
  const background = readProjectFile("background.js");
  const manifest = readProjectFile("manifest.json");

  // 封面白名单必须和 manifest 的 host_permissions 对齐：代码放行的域名如果没被授权，
  // service worker 侧 fetch 会被 Chrome 直接拦掉，用户只看到「封面恢复不了」
  assert.match(background, /const COVER_HOST_SUFFIXES = \["\.hdslb\.com"\];/,
    "封面白名单只留 manifest 已授权的 hdslb 系域名");
  assert.equal(/\.bilibili\.com/.test(background.match(/const COVER_HOST_SUFFIXES = \[[^\]]*\];/)?.[0] || ""), false,
    "bilibili.com 没在 manifest 的 host_permissions 里，代码白名单不许放行它");
  assert.match(manifest, /"https:\/\/\*\.hdslb\.com\/\*"/);
  assert.match(background, /以后要加域名，必须同步改 manifest\.json 的 host_permissions/,
    "注释里要写明新增域名必须同步 manifest.json 的 host_permissions");

  // 唯一带 cookie 的出网口要自己断言 origin —— 将来谁把 path 拼成绝对地址就会被当场拦下
  assert.match(background, /const url = new URL\(path, "https:\/\/api\.bilibili\.com"\);/);
  assert.match(background, /if \(url\.origin !== "https:\/\/api\.bilibili\.com"\) \{\s*\n\s*throw new Error\("接口地址不在允许的域名里。"\);/,
    "biliImportApiGet 必须自己校验解析后的 origin");

  // 报告正文里的 C:\\Users\\<真名>\\... 不再原样进 chrome.storage.local
  assert.match(background, /function maskLocalUserPaths\(text\) \{/);
  assert.equal(/lastError: \{ report: report\.slice\(0, 16000\)/.test(background), false,
    "报告正文进 storage 前必须先打码，不许裸写");
  const rawWrites = background.match(/report: (?!maskLocalUserPaths)[A-Za-z]/g) || [];
  assert.deepEqual(rawWrites, [], "所有 report 写入点都要走 maskLocalUserPaths");
  assert.match(background, /reportPath: storageReportLabel\(/);
});

test("缓存的 B 站 UID 有清除入口，剪贴板提示说了实话（V1.7.11）", () => {
  const settingsHtml = readProjectFile("settings.html");
  const settingsJs = readProjectFile("settings.js");
  const library = readProjectFile("library.js");

  assert.match(settingsHtml, /id="forgetUid"/, "设置页要有「忘记已记住的 UID」按钮");
  assert.match(settingsHtml, /data-i18n="归档会记录收藏时间"/,
    "归档会记收藏时刻这件事要让用户知情（facet-privacy P2-5）");
  assert.match(settingsJs, /chrome\.storage\.local\.remove\("lastImportUid"\)/,
    "按钮必须真的清掉 lastImportUid");
  assert.match(settingsJs, /\$\("forgetUid"\)\?\.addEventListener\("click"/);

  // 剪贴板不会被自动清空这件事要写在提示里，别让用户以为插件替他收拾了
  assert.match(library, /剪贴板不会被自动清空，贴完记得覆盖掉。/);
});

test("归档文本的字段解析关得住简介里的换行注入（V1.7.11）", () => {
  const archive = readProjectFile("archive-core.js");
  const background = readProjectFile("background.js");

  // 读侧：只认已知段、同键首次出现优先、进过内容段就不再重开字段段
  assert.match(archive, /const FIELD_SECTIONS = new Set\(\["基本信息", "UP主", "互动数据"\]\);/);
  assert.match(archive, /const CONTENT_SECTIONS = new Set\(\["标签", "视频简介"\]\);/);
  assert.match(archive, /if \(key && !\(key in fields\)\) fields\[key\] = value;/,
    "同一个键要首次出现优先，否则后面的行能覆盖真实值");
  assert.match(archive, /if \(divider > 0 && !fieldsClosed && FIELD_SECTIONS\.has\(section\)\)/,
    "进过内容段之后不许再认字段");

  // 写侧：单行字段一律走 infoLineValue，把换行/控制符压成空格
  assert.match(background, /function infoLineValue\(value, fallback = "未知"\) \{/);
  assert.match(background, /const title = infoLineValue\(metadata\.title\);/);
  assert.match(background, /const videoUrl = infoLineValue\(metadata\.url\);/);
  assert.match(background, /const upName = infoLineValue\(metadata\.upName\);/);
  assert.match(background, /所属收藏夹：\$\{infoLineValue\(folderName\)\}/);

  // 渲染侧：链接只认 B 站自己的域名，注入成功也只会变成一行纯文本
  const library = readProjectFile("library.js");
  assert.match(library, /function bilibiliLink\(value\) \{/);
  assert.match(library, /url: bilibiliLink\(url\),/);
  assert.match(library, /upHome: bilibiliLink\(field\(info, "UP主主页"\)\),/);
});

test("保留目录名只有一份权威名单，收藏库那条链路也查（V1.7.11）", () => {
  const archive = readProjectFile("archive-core.js");
  const background = readProjectFile("background.js");
  const library = readProjectFile("library.js");

  assert.match(archive, /const RESERVED_COLLECTION_NAMES = \[/);
  assert.match(archive, /function isReservedCollectionName\(name\) \{/);
  assert.match(archive, /isReservedCollectionName,/);
  // 名单内容两边必须逐项一致（SW 拿不到经典脚本，只能留一份副本）
  const names = (source, pattern) => {
    const block = source.match(pattern)?.[0] || "";
    return [...block.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
  };
  assert.deepEqual(
    names(archive, /const RESERVED_COLLECTION_NAMES = \[[\s\S]*?\];/),
    names(background, /const RESERVED_COLLECTION_NAMES = new Set\(\[[\s\S]*?\]\);/),
    "两边的保留目录名必须逐项一致"
  );
  assert.match(library, /if \(BcaArchiveCore\.isReservedCollectionName\(collectionName\)\) \{/,
    "「把下载好的视频放进收藏夹」那条链路也要查保留名单");
});

// ---- V1.7.12（审查报告 P2 批次 5）----

test("十年区间的日历表不再每次重算，筛选器排序复用同一个 collator（V1.7.12）", () => {
  const stats = readProjectFile("stats.js");
  const core = readProjectFile("stats-core.js");
  const library = readProjectFile("library.js");
  // PF-1：十年区间一次渲染要铺 3653 天，原来每次 render 重算 4 遍
  assert.match(stats, /let dayListCache = \{ key: "", keys: null \};/, "日历表要有单槽缓存");
  assert.match(stats, /if \(dayListCache\.keys && dayListCache\.key === cacheKey\) return dayListCache\.keys;/,
    "命中缓存要直接返回，别再重算");
  assert.match(stats, /dayListCache = \{ key: cacheKey, keys: keys \};/, "算完要回填缓存");
  assert.match(core, /const direct = dayStartTime\(end\.getFullYear\(\), end\.getMonth\(\), end\.getDate\(\) - \(span - 1\)\);/,
    "clampSpan 要用闭式求解，别一天一天往回退");
  // PF-2：词频排序的比较器不能每比较一次就现建一个 collator
  assert.match(library, /const OPTION_TEXT_COLLATOR = new Intl\.Collator\("zh-CN"\);/);
  assert.equal(/localeCompare\(right\[0\], "zh-CN"\)/.test(library), false, "排序比较器里不该再现场建 collator");
  assert.match(library, /\.sort\(\(left, right\) => right\[1\] - left\[1\] \|\| OPTION_TEXT_COLLATOR\.compare\(left\[0\], right\[0\]\)\)/);
  // 逐键那条路走缓存入口；所有「数据变了」的入口仍然走不带缓存的那条（顺带清缓存）
  const searchStart = library.indexOf("function applySearchNow()");
  assert.ok(searchStart > 0, "找不到 applySearchNow");
  const nextFn = library.indexOf("\nfunction ", searchStart + 10);
  const searchBody = library.slice(searchStart, nextFn > 0 ? nextFn : library.length);
  assert.match(searchBody, /refreshVideoFilterOptionsForSearch\(\)/, "搜索逐键要走带缓存的入口");
  assert.equal(/refreshVideoFilterOptions\(\)/.test(searchBody.replace(/refreshVideoFilterOptionsForSearch/g, "")), false,
    "搜索逐键不该再走不带缓存的入口");
  assert.match(library, /videoFilterPoolCache\.clear\(\);/);
  assert.match(library, /const VIDEO_FILTER_POOL_CACHE_MAX = \d+;/);
});

test("收藏夹列表按输入重画时复用行节点，缓存过的根目录有上限（V1.7.12）", () => {
  const library = readProjectFile("library.js");
  // PF-3：逐键重画整个侧栏时，只有指纹变了才重建 <li>
  assert.match(library, /function collectionRowsFingerprint\(rows, allLabel\)/);
  assert.match(library, /function buildCollectionRow\(row\)/);
  assert.match(library, /if \(signature !== collectionRowsSignature \|\| collectionRowNodes\.size !== rows\.length\) \{/,
    "指纹没变就不该重建行节点");
  assert.match(library, /const node = collectionRowNodes\.get\(row\.key\);/,
    "过滤命中与否应落在已有节点上");
  // PF-4：根目录个数也要有上限，超出时连 storageUsageCache / lastScanRecordCount 一起清
  assert.match(library, /const ARCHIVE_CACHE_MAX_ROOTS = \d+;/);
  assert.match(library, /function dropRootCaches\(rootKey\) \{/);
  assert.match(library, /storageUsageCache\.delete\(rootKey\);/);
  assert.match(library, /lastScanRecordCount\.delete\(rootKey\);/);
  assert.match(library, /while \(archiveCacheOrder\.length > ARCHIVE_CACHE_MAX_ROOTS\) dropRootCaches\(archiveCacheOrder\[0\]\);/,
    "超上限要从最久没用的那份开始丢");
  assert.match(library, /function clearArchiveCache\(handle\) \{\s*dropRootCaches\(rootCacheKey\(handle\)\);/,
    "「刷新」的整表丢弃也要走同一条路径");
});

test("导入进度的落盘窗口放宽，复制绑定做了幂等（V1.7.12）", () => {
  const background = readProjectFile("background.js");
  const library = readProjectFile("library.js");
  // PF-5：报告点的 500ms 整包重写
  assert.match(background, /const IMPORT_STATE_PUBLISH_INTERVAL_MS = (\d+);/);
  const interval = Number(background.match(/const IMPORT_STATE_PUBLISH_INTERVAL_MS = (\d+);/)[1]);
  assert.ok(interval >= 1000, `落盘窗口至少放宽到 1000ms（当前 ${interval}）`);
  assert.match(background, /if \(!force && now - importStatePublishAt < IMPORT_STATE_PUBLISH_INTERVAL_MS\) return;/);
  assert.match(background, /if \(text === importStatePublishedText\) return;/, "内容没变仍然不写");
  // PF-7：报告点名的 bindCopyButton 不存在，但绑定这一层要有幂等闸
  assert.match(library, /const copyBoundElements = new WeakSet\(\);/);
  assert.match(library, /function bindCopyToClipboard\(element, value, successMessage\) \{\s*if \(copyBoundElements\.has\(element\)\) return element;/,
    "同一个元素只认第一次绑定");
  const copyFieldStart = library.indexOf("function copyFieldButton(value, label)");
  assert.ok(copyFieldStart > 0, "找不到 copyFieldButton");
  const nextFn = library.indexOf("\nfunction ", copyFieldStart + 10);
  const copyFieldBody = library.slice(copyFieldStart, nextFn > 0 ? nextFn : library.length);
  assert.match(copyFieldBody, /bindCopyToClipboard\(button, value, /, "复制按钮要走幂等绑定");
  assert.equal(/button\.addEventListener\("click"/.test(copyFieldBody), false, "别在 copyFieldButton 里裸绑 click");
});

// ---- V1.7.13（审查报告 P2 批次 6：原生宿主）----
// 原生宿主是独立的 PowerShell / C# 进程，测试跑不到它，只能靠文本断言守两件事：
// 「两侧常量必须一致」和「已经修好的行为不许被改回去」。协议行为本身由
// b_catch/_p2-batch6-native-probe.ps1 的探针真跑一遍（分片长度头 + 1 MiB 放大）。
test("原生宿主的协议号三处一致，扩展侧真的会校验（V1.7.13）", () => {
  const worker = readProjectFile("native/folder-opener-host.ps1");
  const launcher = readProjectFile("native/folder-opener-launcher.cs");
  const library = readProjectFile("library.js");
  assert.match(worker, /\$protocolVersion = 3\b/, "工作脚本要报协议号 3");
  assert.match(launcher, /LauncherProtocolVersion = 3;/, "启动器要报同一个协议号");
  assert.match(library, /const NATIVE_PROTOCOL_VERSION = 3;/, "扩展侧要认得同一个协议号");
  // 以前是单向握手：宿主每次都报 version，扩展从不看 —— 装了一版对不上的宿主
  // 只会表现成「点了没反应」。
  assert.match(library, /protocol !== NATIVE_PROTOCOL_VERSION/, "扩展侧必须真的比对协议号");
  // 启动器自己产生的错误帧（长度非法、找不到工作脚本……）也要带 protocol，
  // 否则扩展分不清「宿主版本旧」和「宿主根本没起来」。
  assert.match(launcher, /"\{\\"ok\\":false,\\"protocol\\":" \+ LauncherProtocolVersion/, "启动器错误帧要带 protocol");
  // 每条响应统一补 protocol / version，调用方不再各写一遍（漏一个就少一条握手信息）。
  assert.match(worker, /if \(-not \$Response\.ContainsKey\("protocol"\)\) \{ \$Response\["protocol"\] = \$protocolVersion \}/, "响应要统一补 protocol");
  assert.match(worker, /if \(-not \$Response\.ContainsKey\("version"\)\) \{ \$Response\["version"\] = \$hostVersion \}/, "响应要统一补 version");
});

test("长度头分片要读满、长度非法要先排空 body（V1.7.13）", () => {
  const worker = readProjectFile("native/folder-opener-host.ps1");
  // 修前是「一次裸 Read + 短读就 break」：帧头分片到达时脚本静默退出，
  // stdout 0 字节、退出码 0，上层只看到「宿主没了」。
  assert.match(worker, /while \(\$headerRead -lt 4\) \{/, "4 字节长度头必须循环读满");
  assert.equal(/\$headerRead = \$inputStream\.Read\(\$header, 0, 4\)/.test(worker), false, "不许回到「一次裸 Read」");
  // 修前拒绝非法的长度时不消费 body，剩下的字节被当成新的长度头 ——
  // 实测一个 1 MiB 负载会放大出 262,146 条错误帧（19.4 MB stdout、63.8 秒）。
  assert.match(worker, /if \(\$length -gt 0\) \{\s*\$remaining = \[int64\]\$length/, "长度非法时要把 body 排空");
  assert.match(worker, /if \(-not \$drained\) \{ break \}/, "流断了就别再回帧");
});

test("自检不再结构性假绿：清单 ID 要跟已装的扩展 ID 比（V1.7.13）", () => {
  const selfCheck = readProjectFile("test-native-folder-opener.ps1");
  assert.match(selfCheck, /\$script:problems \+= 1/, "Write-Check 必须自己计数");
  assert.equal(/\[bool\]\$manifest\.allowed_origins/.test(selfCheck), false, "别回到「只判非空」");
  assert.match(selfCheck, /-contains "chrome-extension:\/\/\$expectedId\/"/, "allowed_origins 要跟 settings.json 里的 extensionId 比对");
  assert.match(selfCheck, /\$expectedId = \[string\]\(Get-Content -LiteralPath \$settingsPath/, "期望 ID 来自 settings.json");
  assert.match(selfCheck, /-like "\*→ \$manifestPath"/, "注册表默认值必须正好指向本目录的清单，指向别处的旧清单不算过");
  // 只注册 Google Chrome 一个键 → Edge / Brave / Chrome Beta 上 sendNativeMessage
  // 必然失败，而脚本照样打印「安装完成」。1.7.13 起按「本机装了哪些」逐个注册。
  const installer = readProjectFile("install-native-folder-opener.ps1");
  const browserKeys = installer.match(/NativeMessagingHosts\\\$hostName"/g) || [];
  assert.ok(browserKeys.length >= 8, `安装脚本要按浏览器铺注册表键（现在 ${browserKeys.length} 条）`);
  assert.match(readProjectFile("uninstall-native-folder-opener.ps1"), /foreach \(\$registryPath in \$registryPaths\)/, "卸载要逐个清掉这些键");
});

test("安装脚本先编译再落文件，-SkipRegistry 不许说「安装完成」（V1.7.13）", () => {
  const installer = readProjectFile("install-native-folder-opener.ps1");
  const compileIndex = installer.indexOf("正在编译宿主启动器");
  const copyIndex = installer.indexOf("Copy-Item -LiteralPath $sourceScript");
  assert.ok(compileIndex > 0 && copyIndex > 0, "找不到编译或拷贝步骤");
  assert.ok(compileIndex < copyIndex, "编译必须排在拷贝工作脚本之前，否则编译失败会留下「新脚本 + 旧启动器」的混合态");
  // 盘符根目录（D:\）的 GetDirectoryName 是 $null，不能拿它去 Test-Path
  assert.match(installer, /if \(\[string\]::IsNullOrWhiteSpace\(\$parentPath\)\) \{/, "盘符根目录要单独处理");
  assert.match(installer, /if \(\$SkipRegistry\) \{\s*Write-Host "已安装，但注册表未写入/, "-SkipRegistry 时不能打印「安装完成」");
});

test("所有 .ps1 / .cs 都存成 UTF-8 带 BOM（1.7.13 红线）", () => {
  // AI_HANDOFF.md 的红线：PowerShell 5.1 会按系统 ANSI 代码页（本机 gb2312/936）
  // 解析没有 BOM 的 .ps1，里面的中文注释会直接变成语法错误 —— 一个字节的差别，
  // 症状却是「脚本全是乱码报错」。编辑工具很容易顺手把 BOM 剥掉，所以钉在这里。
  // 唯一的例外是 bili-old-2015/tools/download.ps1：它自公开版本起就没有 BOM。
  const allowNoBom = new Set(["bili-old-2015/tools/download.ps1"]);
  const found = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === ".git" || entry.name === "_ref") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!/\.(ps1|cs)$/i.test(entry.name)) continue;
      const relative = path.relative(projectRoot, full).split(path.sep).join("/");
      found.push(relative);
      if (allowNoBom.has(relative)) continue;
      const buffer = fs.readFileSync(full);
      assert.ok(buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf, `${relative} 必须带 UTF-8 BOM`);
    }
  };
  walk(projectRoot);
  assert.ok(found.length >= 7, `至少要扫到 7 个脚本（现在扫到 ${found.length} 个）`);
});

// ---- V1.7.14（审查报告 P2 批次 7）----
test("stats-core 的导出面与统计页的真实用法对得上（V1.7.14）", () => {
  // 1.7.14（deadcode P2-1）：stats-core.js 的注释曾声称界面用它的聚合 API，实际
  // stats.js 只读 5 个成员，两张图和三个大数字都走 snapshot() 的预聚合字段。
  // 这份名单就是契约：统计页多读一个成员，说明依赖关系变了，注释与说明要跟着改。
  const core = readProjectFile("stats-core.js");
  const stats = readProjectFile("stats.js");
  const used = [...new Set([...stats.matchAll(/(?<![-\w])core\s*\??\.\s*([A-Za-z_$][A-Za-z0-9_$]*)/g)].map((match) => match[1]))].sort();
  assert.deepEqual(used, ["MAX_RANGE_DAYS", "RECENT_WINDOW_DAYS", "dayKeyToTime", "localDayKey", "rangeFor"],
    "统计页读的 stats-core 成员变了，请同步更新 stats-core.js 顶部 1.7.14 的说明与本断言");
  // 说明必须是事实：不许再写着「界面按 RANGE_PRESETS 渲染下拉框」这类不成立的承诺
  assert.equal(core.includes("界面按 RANGE_PRESETS"), false, "stats-core.js 不许再声称界面按 RANGE_PRESETS 渲染下拉框");
  assert.equal(core.includes("柱状图（seriesInRange）、大数字（totalInRange）、饼图（collectionBreakdown）"), false,
    "stats-core.js 不许再声称这三处聚合是界面的实现");
  assert.match(core, /1\.7\.14（deadcode P2-1）/, "stats-core.js 顶部要写明导出面与真实用法的差距");
});

// ---- V1.7.15（审计复核补漏：两处「说了没做」）----
test("文件系统错误的分类表与处理函数，两份必须逐字相同（V1.7.15）", () => {
  // 1.7.14（facet-compat C4）：archive-core.js 是权威出处，background.js 里有一份
  // 逐字副本（service worker 是 ES module，拿不到经典脚本）。两边的注释都写着
  // 「由守卫断言逐项比对」—— 可 1.7.14 只写了这句承诺，断言根本没落地
  // （审计复核时在 test/ 里搜 FILE_SYSTEM_ERROR_HINTS / describeFileSystemError /
  // NotAllowedError 全部零命中）。这条断言就是那句承诺本身。
  const core = readProjectFile("archive-core.js");
  const background = readProjectFile("background.js");
  const normalize = (text) => text.replace(/\s+/g, " ").trim();
  const grab = (source, pattern, label) => {
    const match = source.match(pattern);
    assert.ok(match, `${label} 必须写出来`);
    return normalize(match[1]);
  };
  const tablePattern = /const FILE_SYSTEM_ERROR_HINTS = Object\.freeze\(\{([\s\S]*?)\}\);/;
  const fnPattern = /function describeFileSystemError\(error\) \{([\s\S]*?)\n\s*\}/;
  const coreTable = grab(core, tablePattern, "archive-core.js 的 FILE_SYSTEM_ERROR_HINTS");
  assert.equal(coreTable, grab(background, tablePattern, "background.js 的 FILE_SYSTEM_ERROR_HINTS"),
    "两处错误分类表不一致：改一处就要改另一处");
  assert.equal(grab(core, fnPattern, "archive-core.js 的 describeFileSystemError"),
    grab(background, fnPattern, "background.js 的 describeFileSystemError"),
    "两处 describeFileSystemError 不一致");
  for (const name of ["NotAllowedError", "NoModificationAllowedError", "QuotaExceededError", "InvalidModificationError"]) {
    assert.ok(coreTable.includes(name), `错误分类表里少了 ${name}`);
  }
});

test("删除下载的提示数组必须先声明再 push（V1.7.15）", () => {
  // 1.7.10 把 const downloadCleanupNotes = [] 写在第一次 push 的后面几行，撞上 TDZ：
  // ReferenceError: Cannot access 'downloadCleanupNotes' before initialization。
  // 触发条件正是它想覆盖的那个场景 —— 勾了「同时删除关联下载」而 000视频下载 不在。
  // 异常被外层 catch 接住，用户看到「删除失败」，可文件其实已经删掉了。
  const library = readProjectFile("library.js");
  const declared = library.indexOf("const downloadCleanupNotes = [];");
  const pushed = library.indexOf("downloadCleanupNotes.push(");
  assert.ok(declared > 0, "downloadCleanupNotes 要用 const 字面量声明");
  assert.ok(pushed > 0, "downloadCleanupNotes 至少要被 push 一次");
  assert.ok(declared < pushed, "downloadCleanupNotes 必须先声明再 push，否则就是 TDZ ReferenceError");
});

// ---- V1.7.16（destructive P1-1：归档原子写重上 + 写失败不再删记录）----

test("换名失败一律退回就地写，不许再按错误名挑名单（V1.7.16）", () => {
  const bg = readProjectFile("background.js");
  const start = bg.indexOf("async function writeFile(directory, name, content) {");
  assert.ok(start > 0, "找不到 background.js 的 writeFile");
  // 注释里引用了旧代码的那一行（`unsupported`），比对前必须剥掉注释，否则误报。
  const body = stripComments(bg.slice(start, bg.indexOf("\n}\n", start)));
  // 1.7.0 的兜底只认 NotSupportedError / TypeError，而真机上报的是 NoModificationAllowedError
  // （目标被别的进程或另一个 writable 占用）—— 不在名单里，于是它没退回就地写、直接把异常
  // 抛给了「失败就删整条记录」的调用方。这份名单和那句 throw 都不许再回来。
  assert.doesNotMatch(body, /unsupported/, "换名失败不许再按错误名挑名单");
  assert.doesNotMatch(body, /throw moveError/, "换名失败必须退回就地写，不许原样抛出");
  assert.match(body, /await temp\.move\(directory, name\);/, "要真的试过换名覆盖");
  assert.match(body, /renameNote = renameFailureNote\(error\);/, "换名失败要把错误名记下来");
  // 兜底必须是「无条件」的：从换名调用到记下原因之间不许出现任何 throw。
  // 只写 assert.doesNotMatch(body, /unsupported/) 不够 —— 把名单换个变量名，
  // 或者写成 if (error.name !== 'NoModificationAllowedError') throw error; 都能绕过去。
  const moveAt = body.indexOf("await temp.move(directory, name);");
  const noteAt = body.indexOf("renameFailureNote(error)", moveAt);
  assert.ok(moveAt > 0 && noteAt > moveAt, "换名之后要能把失败原因记下来");
  assert.doesNotMatch(body.slice(moveAt, noteAt), /throw\b/, "换名失败不许在记原因之前抛出");
  // library.js 那一份同样要能报出原因（两份必须行为一致）
  const lib = readProjectFile("library.js");
  assert.match(lib, /function renameFailureNote\(error\) \{/);
  assert.match(lib, /renameNote = renameFailureNote\(moveError\);/);
  // 「最近状态」与错误报告都要带上这条签名，否则真机再出问题还是只能靠猜
  assert.match(bg, /换名失败的原因：\$\{renameNote \|\| "未知"\}/);
  assert.match(bg, /最近一次换名覆盖失败：\$\{lastRenameFailureNote\}/);
});

test("写失败不再无条件删记录：有内容就留、空的才删（V1.7.16）", () => {
  const bg = readProjectFile("background.js");
  assert.match(bg, /async function discardFailedRecord\(parent, name, error\) \{/);
  assert.match(bg, /for await \(const _entry of record\.values\(\)\) \{ kept = true; break; \}/);
  assert.match(bg, /已经写进去的内容留在「\$\{name\}」里，没有删/);
  // 三处「写失败 → 删掉刚建的整条记录」全部改走它
  assert.equal((bg.match(/await discardFailedRecord\(/g) || []).length, 3, "三处写失败都要走 discardFailedRecord");
  assert.doesNotMatch(bg, /removeEntry\(record\.name, \{ recursive: true \}\)\.catch/, "写失败不许再无条件删记录");
  assert.doesNotMatch(bg, /removeEntry\(recordFolder\.name, \{ recursive: true \}\)\.catch/, "写失败不许再无条件删记录");
  // 复制 / 搬运那一处**故意**保留删除（半份副本会被扫描当成记录，而源目录还在），但必须写明理由
  const lib = readProjectFile("library.js");
  const copyCatch = lib.indexOf("await targetCollection.removeEntry(targetRecordName, { recursive: true })");
  assert.ok(copyCatch > 0, "复制回滚的删除应该保留");
  assert.match(lib.slice(Math.max(0, copyCatch - 500), copyCatch), /这里的回滚\*\*故意保留\*\*/);
});

// ---- V1.7.17（审计补漏：compat ① 最低版本可验证、原生助手清单三处同步）----

test("最低 Chrome 版本的理由写清楚，且与 manifest 同源（V1.7.17）", () => {
  const manifest = JSON.parse(readProjectFile("manifest.json"));
  assert.equal(manifest.minimum_chrome_version, "111", "111 是硬底线：改成别的值之前先确认 color-mix 有替代方案");
  const theme = readProjectFile("theme.css");
  assert.ok(theme.includes("color-mix("), "毛玻璃底色是从 --surface 用 color-mix() 推出来的，这就是 111 的理由");
  const readme = readProjectFile("README.md");
  const at = readme.indexOf("### 运行环境");
  assert.ok(at > 0, "README 要有「运行环境」一节，把最低版本和理由写在用户看得到的地方");
  const section = readme.slice(at, at + 1200);
  assert.match(section, /Chrome 111/, "要写明最低版本");
  assert.match(section, /color-mix\(\)/, "要写明为什么是 111");
  assert.match(section, /minimum_chrome_version/, "要指出数字的唯一出处，别让两边各写一个");
  assert.match(section, /只注册了 Chrome/, "Edge / Brave 能装但原生助手用不了，这件事必须说出来");
  assert.match(readProjectFile("AI_HANDOFF.md"), /color-mix\(\)/, "AI_HANDOFF 也要写同一个理由");
});

test("原生宿主的浏览器清单三处一致（V1.7.17）", () => {
  const vendorPattern = /HKCU:\\Software\\([A-Za-z0-9 .\\-]+?)\\NativeMessagingHosts/g;
  const listOf = (text) => [...text.matchAll(vendorPattern)].map((match) => match[1]);
  const install = listOf(readProjectFile("install-native-folder-opener.ps1"));
  const uninstall = listOf(readProjectFile("uninstall-native-folder-opener.ps1"));
  assert.ok(install.length >= 6, "至少覆盖 Chrome / Edge / Brave 这几家");
  assert.deepEqual(install, uninstall, "安装与卸载脚本的浏览器清单必须一致，否则卸载会漏键");
  const block = (readProjectFile("settings.js").match(/const NATIVE_CLEANUP_VENDORS = \[([\s\S]*?)\];/) || [])[1];
  assert.ok(block, "设置页要有一份能从界面复制的清理命令");
  const cleanup = [...block.matchAll(/"([^"]+)"/g)].map((match) => match[1].replace(/\\\\/g, "\\"));
  assert.deepEqual(cleanup, install, "设置页复制的清理命令要覆盖同一批浏览器，不能只清 Chrome");
  const script = readProjectFile("settings.js");
  assert.match(script, /LOCALAPPDATA\\\\BcaFolderOpener/, "残留文件夹（里面有扩展 ID 与下载目录路径）也要一起清掉");
});

// ---- V1.7.18（P1 第三批：取消导入的统计回滚 + 下载目录复制的字节校验）------------

test("取消导入会把已落盘的统计行一起撤掉（V1.7.18）", () => {
  const background = readProjectFile("background.js");
  const core = readProjectFile("stats-core.js");

  // 统计侧的减法只给回滚用，且导出了才能被 background.js 调到
  assert.match(core, /function removeRecords\(database, keys\) \{/);
  assert.match(core, /\n    removeRecords,\n/);
  // 「新增的行」必须在 addRecord 之前判定 —— 加完就分不出新旧了
  assert.match(background, /async function writeStatsDatabase\(root, records, insertedKeys = null\) \{/);
  assert.match(background,
    /if \(key && !\(next\.videos && Object\.prototype\.hasOwnProperty\.call\(next\.videos, key\)\)\) insertedKeys\.push\(key\);/,
    "新建判定要在 addRecord 之前");
  assert.match(background, /async function flushStatsPendingRecords\(root, insertedKeys = null\) \{/);
  assert.match(background, /await writeStatsDatabase\(root, batch, insertedKeys\);/);
  assert.match(background, /const importStatsKeys = \[\];/);
  assert.match(background, /await flushStatsPendingRecords\(root, importStatsKeys\);/);

  // 回滚要有实现，而且顺序不能反：先文件、后统计
  assert.match(background, /async function rollbackStatsRecords\(root, keys\) \{/);
  assert.match(background, /const removed = BcaStatsCore\.removeRecords\(read\.database, keys\);/);
  const fileFirst = background.indexOf("rollback = await rollbackImport(journal);");
  const statsThen = background.indexOf("statsRollback = await rollbackStatsRecords(root, importStatsKeys);");
  assert.ok(fileFirst > 0, "取消路径要先回滚文件");
  assert.ok(statsThen > fileFirst, "统计回滚必须排在文件回滚之后");

  // 对用户的说法要包含统计那一半，不能再只说「导入前的本地内容没有被改动」
  assert.match(background, /并从统计库里撤掉了对应的 \$\{statsRollback\.removed\} 行。/);
  assert.match(background, /统计库里对应的一行这次没能撤掉，下次打开收藏库重新扫描会纠正。/);
});

test("下载目录的复制也要逐文件比字节，再允许删源（V1.7.18）", () => {
  const library = readProjectFile("library.js");

  // 归档记录目录那条路 1.7.0 就有复核；下载目录那条路以前没有 —— 这里钉住它
  assert.match(library, /const problems = await diffCopiedDirectory\(source\.directory, targetDirectory\);/,
    "下载目录复制完要比对字节数");
  assert.match(library, /下载文件复制校验没通过：\$\{problems\.slice\(0, 3\)\.join\("；"\)\}/);
  // 不通过要抛错 → 调用方删掉刚建的目标目录、保留源目录
  const verifyAt = library.indexOf("const problems = await diffCopiedDirectory(source.directory, targetDirectory);");
  const throwAt = library.indexOf("下载文件复制校验没通过", verifyAt);
  const rollbackAt = library.indexOf("await targetCollection.removeEntry(targetNameOnDisk, { recursive: true }).catch(() => {});", verifyAt);
  assert.ok(throwAt > verifyAt && rollbackAt > throwAt, "校验失败要抛错，交给调用方的回滚分支处理");
  // 清理失败不能只报个数
  assert.match(library, /下载文件已复制，但有 \{count\} 个旧目录未能清理：\{first\}/);
  assert.match(library, /first: downloadCleanupWarnings\[0\]/);
});

// ---- V1.7.21（收尾：统计库写入口互斥 / 批量搬运进度与中止 / 词典闸门报多余）----

test("统计库的三个写入口共用一条链，不再互相盖掉（V1.7.21）", async () => {
  const bg = readProjectFile("background.js");
  assert.match(bg, /function withStatsWriteSlot\(task\) \{/, "要有串行化助手");
  for (const [pub, inner] of [
    ["writeStatsDatabase", "writeStatsDatabaseInner"],
    ["rollbackStatsRecords", "rollbackStatsRecordsInner"],
    ["touchPetInDatabase", "touchPetInDatabaseInner"]
  ]) {
    assert.match(bg, new RegExp("async function " + pub + "\\([^)]*\\) \\{\\s*\\r?\\n\\s*return withStatsWriteSlot\\(\\(\\) => " + inner + "\\("), pub + " 必须过槽");
    assert.match(bg, new RegExp("async function " + inner + "\\("), inner + " 必须存在");
  }
  // 调用方不许再包一层：槽里进槽会自己等自己，整条链直接死锁。
  assert.doesNotMatch(bg, /flushStatsPendingRecords\([^)]*\) \{\s*\r?\n\s*return withStatsWriteSlot/, "调用方不许包槽");

  // 行为：把助手抠出来真跑一遍。没有串行化时顺序是 a1 b1 a2 b2 —— 那正是「宠物挂件
  // 点一下正好落在导入收尾的读与写之间，后写的把前一个的改动整份盖掉」。
  const start = bg.indexOf("let statsWriteChain = Promise.resolve();");
  assert.ok(start > 0, "抠不出串行化助手源码");
  const end = bg.indexOf("\n}", bg.indexOf("statsWriteChain = run.then(", start));
  assert.ok(end > start, "抠不出串行化助手源码的结尾");
  const withStatsWriteSlot = new Function(bg.slice(start, end + 2) + "\nreturn withStatsWriteSlot;")();
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const order = [];
  await Promise.all([
    withStatsWriteSlot(async () => { order.push("a1"); await wait(20); order.push("a2"); }),
    withStatsWriteSlot(async () => { order.push("b1"); await wait(1); order.push("b2"); })
  ]);
  assert.deepEqual(order, ["a1", "a2", "b1", "b2"], "第二个任务必须等第一个跑完");

  // 一个任务抛错不许把后面的卡死（链上挂了失败也要放行）。
  const settled = await Promise.allSettled([
    withStatsWriteSlot(async () => { throw new Error("boom"); }),
    withStatsWriteSlot(async () => "ok")
  ]);
  assert.equal(settled[0].status, "rejected");
  assert.equal(settled[1].value, "ok", "前一个任务失败也要放行下一个");
});

test("批量搬运有进度也能中止，中止后不许再往下搬（V1.7.21）", () => {
  const html = readProjectFile("library.html");
  const lib = readProjectFile("library.js");
  assert.match(html, /id="collectionActionProgress"[^>]*role="status"/, "搬运对话框里要有进度行");
  assert.match(lib, /COLLECTION_ACTION_PROGRESS_MS = 400/, "进度播报要节流，别刷屏读屏软件");
  // 中止判断必须落在搬运循环体里，挪到循环外就等于没有。
  const loopAt = lib.indexOf("for (const video of action.videos) {");
  const breakAt = lib.indexOf("if (collectionActionAbort) break;");
  assert.ok(loopAt > 0 && breakAt > loopAt, "中止判断要落在搬运循环里");
  assert.match(lib, /collectionActionAbort = true;/, "取消按钮要能立起中止标志");
  assert.match(lib, /hideCollectionActionProgress\(\);\s*\r?\n\s*collectionActionAbort = false;/, "finally 要复位进度与标志");
  assert.match(lib, /BcaI18n\.t\("已中止，剩下 \{count\} 个没有处理"/, "结果要说清还剩几个没处理");
  assert.match(lib, /BcaI18n\.t\("移动或复制已中止"\)/, "标题要区分「中止」与「部分完成」");
});

test("release.ps1 每次发版都要把「多余词条」的条数打出来（V1.7.21）", () => {
  const script = readProjectFile("release.ps1");
  assert.match(script, /多余\\s\+\(\\d\+\)/, "要从 i18n 输出里读出多余条数");
  assert.match(script, /作者已删的旧词条（不影响界面）：/, "要把条数打给发版的人看");
  const at = script.indexOf("$orphanCounts = @()");
  assert.ok(at > 0, "找不到多余条数那一段");
  const block = script.slice(at, script.indexOf("# 文档里写的词典条数", at));
  assert.ok(block.length > 0, "多余条数那一段要落在文档条数检查之前");
  assert.doesNotMatch(block, /\$failed = \$true/, "多余只播报，不做闸门");
});

// ---- V1.7.24（facet-compat §3.2：Windows 260 字符路径上限的度量与报错分类）----

test("路径预算的常量与报错文案在 archive-core.js / background.js 两份逐字相同（V1.7.24）", () => {
  const core = readProjectFile("archive-core.js");
  const bg = readProjectFile("background.js");
  for (const line of [
    "const WINDOWS_PATH_LIMIT_CHARS = 260;",
    "const COLLECTION_NAME_MAX_CHARS = 120;",
    "const RECORD_NAME_MAX_CHARS = 100;"
  ]) {
    assert.ok(core.includes(line), `archive-core.js 少了 ${line}`);
    assert.ok(bg.includes(line), `background.js 少了 ${line}`);
  }
  assert.match(core, /const PATH_SEGMENT_BUDGET_CHARS = WINDOWS_PATH_LIMIT_CHARS - PATH_ROOT_ALLOWANCE_CHARS - PATH_RESERVED_CHARS;/);
  assert.ok(bg.includes("const PATH_SEGMENT_BUDGET_CHARS = 168;"), "SW 那份要写死算好的 168");
  // 报错文案：两处函数体必须一模一样（只比函数体，注释各自写给自己的读者）
  const body = (source, name) => {
    const start = source.indexOf(`function ${name}(`);
    assert.ok(start > 0, `${name} 不见了`);
    const open = source.indexOf("{", start);
    let depth = 0;
    let end = open;
    for (let index = open; index < source.length; index += 1) {
      const char = source[index];
      if (char === "{") depth += 1;
      else if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          end = index + 1;
          break;
        }
      }
    }
    return stripComments(source.slice(open, end)).replace(/\s+/g, " ");
  };
  assert.equal(body(core, "describeDirectoryCreateError"), body(bg, "describeDirectoryCreateError"), "两份文案必须逐字相同");
  // 常量名不许退回魔法数字
  assert.ok(!/truncateToBytes\(name\.slice\(0, 120\)/.test(core), "safeCollectionName 要用常量");
  assert.ok(!/truncateToBytes\(value\.slice\(0, 120\)/.test(bg), "safeSegment 要用常量");
  assert.ok(!/maxLength = 100\)/.test(core), "safeName 的默认上限要用常量");
});

test("路径太长的报错真的接在建目录的那几条链路上（V1.7.24）", () => {
  const core = readProjectFile("archive-core.js");
  const bg = readProjectFile("background.js");
  const lib = readProjectFile("library.js");
  // background.js：create:true 失败时先问 describeDirectoryCreateError，再决定抛什么
  assert.match(bg, /async function createDirectoryOrExplain\(parent, name\)/);
  assert.ok(bg.includes("const explained = describeDirectoryCreateError(inner, candidate);"), "uniqueTimeFolder 的 create 分支要转译");
  assert.ok(bg.includes("const collectionFolder = await createDirectoryOrExplain(root, folderName);"), "自动归档那条链路要转译");
  assert.ok(bg.includes("collection = await createDirectoryOrExplain(root, collectionName);"), "导入那条链路要转译");
  // library.js：两处建目录 + 标题段按预算收
  assert.ok(lib.includes("BcaArchiveCore.describeDirectoryCreateError(error, collectionName") || lib.includes("BcaArchiveCore.describeDirectoryCreateError(error, collectionName +"), "标记已下载那条要转译");
  assert.ok(lib.includes("BcaArchiveCore.describeDirectoryCreateError(error, targetRecordName)"), "搬运那条要转译");
  assert.ok(lib.includes("BcaArchiveCore.videoDirectoryLabel(video, 0, { collectionName })"), "知道收藏夹名就要把预算传下去");
  // 度量：扫描时按「两段合起来」的相对长度收，并报出来
  assert.match(lib, /const longNames = \[\];/);
  assert.ok(lib.includes("> BcaArchiveCore.PATH_SEGMENT_BUDGET_CHARS) longNames.push("), "扫描要有度量");
  assert.ok(lib.includes("info.longNames?.length"), "度量要出现在扫描提示里");
  // 收藏夹段的 120 不许被偷偷改小：磁盘上已有的目录名要能原样读回来
  assert.equal(core.match(/const COLLECTION_NAME_MAX_CHARS = 120;/g).length, 1);
  assert.match(core, /收藏夹段是 round-trip 的/);
});

test("AI_HANDOFF 只留入口，架构参考与版本日志各在各的文档里（V1.7.25）", () => {
  const handoff = readProjectFile("AI_HANDOFF.md");
  const arch = readProjectFile("docs/ARCHITECTURE.md");
  const history = readProjectFile("docs/HISTORY.md");
  // 入口文档不许再长出逐版本小节 —— 否则又会涨回几百行没人读
  assert.doesNotMatch(handoff, /^## \d+\.\d+\.\d+[：:]/m, "版本日志要放 docs/HISTORY.md");
  // 三份文档的地图必须互相指得到
  assert.match(handoff, /\]\(docs\/ARCHITECTURE\.md\)/, "入口文档要指向架构参考");
  assert.match(handoff, /\]\(docs\/HISTORY\.md\)/, "入口文档要指向版本日志");
  assert.doesNotMatch(arch, /^## \d+\.\d+\.\d+[：:]/m, "版本日志不该塞进架构参考");
  assert.match(history, /^## \d+\.\d+\.\d+[：:]/m, "版本日志里要有版本小节");
  // 硬规则必须留在入口文档第一屏，不能被拆出去
  for (const rule of ["只在 `theme.css` 定义", "UTF-8 带 BOM", "BcaI18n.t(", "node --check"]) {
    assert.ok(handoff.includes(rule), `快速开始的硬规则里要有：${rule}`);
  }
});
test("交接文档的「维护规范」与「协作规矩」不许被删（V1.7.26）", () => {
  const handoff = readProjectFile("AI_HANDOFF.md");
  // 维护规范必须在开头，且回答「什么时候改」
  assert.ok(handoff.includes("## 本文档的维护规范"), "维护规范要写进交接文档");
  assert.ok(handoff.indexOf("## 本文档的维护规范") < handoff.indexOf("## 快速开始"), "维护规范要排在快速开始之前");
  assert.ok(handoff.includes("什么时候必须更新"), "维护规范要写清什么时候更新");
  // 协作规矩：子智能体的边界、浏览器收尾、问询先回答
  assert.ok(handoff.includes("## 开发环境与协作规矩"), "协作规矩要写进交接文档");
  for (const rule of ["子智能体的产出一律视为", "bsk_session action=stop", "在用户明确点头之前不要改文件"]) {
    assert.ok(handoff.includes(rule), `协作规矩里要有：${rule}`);
  }
});
test("发版不强制开系统代理：git 先直连、失败才走代理（V1.7.26）", () => {
  const script = readProjectFile("release.ps1");
  assert.match(script, /function Invoke-GitRemote \{/, "release.ps1 要有直连 / 代理回退助手");
  assert.match(script, /\$direct = Invoke-Native \$Git \$Arguments/, "先试直连");
  for (const call of ["ls-remote", "push", "fetch"]) {
    assert.ok(script.includes(`Invoke-GitRemote @('${call}'`), `${call} 要走回退助手`);
  }
  assert.doesNotMatch(script, /-not \$portOpen/, "端口没开不许直接退出：系统代理关着也要能发版");
  assert.ok(script.includes("系统代理不用开"), "连不上时的提示要说清系统代理不用开");
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
  // V1.3.1：使用说明页也接进了 i18n，所以一并接受这套逐字校验
  // 1.5.0：数据统计页同理
  for (const file of ["library.html", "popup.html", "guide.html", "tutorial.html", "settings.html", "stats.html"]) {
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
  assert.ok(readProjectFile("popup.html").includes('src="i18n.js"'), "弹窗未引入 i18n.js");
  const manifest = JSON.parse(readProjectFile("manifest.json"));
  assert.ok(manifest.content_scripts[0].js.includes("i18n.js"), "内容脚本需要 i18n.js 才能翻译提示卡");
  for (const file of ["library.html", "popup.html", "guide.html", "settings.html", "stats.html"]) {
    const marked = [...readProjectFile(file).matchAll(/data-i18n(?:-html|-title|-placeholder|-aria)?="/g)].length;
    assert.ok(marked >= 15, `${file} 只标了 ${marked} 处，覆盖面明显不足`);
  }
  // V1.3.1：安装教程页能标的位置天然少（资源管理器、cmd 黑窗、chrome://extensions 那几张
  // 拟真图与目录名按规矩不翻，示例数据同样不翻），所以阈值单独给，不并进上面那个 15。
  const tutorialMarked = [...readProjectFile("tutorial.html").matchAll(/data-i18n(?:-html|-title|-placeholder|-aria)?="/g)].length;
  assert.ok(tutorialMarked >= 12, `tutorial.html 只标了 ${tutorialMarked} 处，覆盖面明显不足`);
  for (const file of ["library.js", "popup.js"]) {
    const calls = [...readProjectFile(file).matchAll(/(?:\bBcaI18n\.)?\bt\("/g)].length;
    assert.ok(calls >= 20, `${file} 只用了 ${calls} 次 t()，动态文案覆盖不足`);
  }
  // 1.5.0 新增的三脚本：动态文案同样必须走 t()/translate()。阈值按各自体量给：
  // settings.js 的文案几乎全在 data-i18n 静态标记里，只有 2 处动态的，所以单列。
  for (const [file, least] of [["settings.js", 2], ["pet.js", 4], ["stats.js", 4]]) {
    const calls = [...readProjectFile(file).matchAll(/(?:\bBcaI18n\.)?(?:\bt|translate)\("/g)].length;
    assert.ok(calls >= least, `${file} 只用了 ${calls} 次 t()/translate()，动态文案覆盖不足`);
  }
});

test("every element the scripts reach for actually exists in the markup", () => {
  // getElementById 拿不到只会得到 null，很多地方是 `?.` 静默跳过，坏了也很难发现
  for (const [htmlFile, jsFiles] of [
    ["library.html", ["library.js"]],
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
  for (const file of ["library.css", "popup.css", "theme.css", "settings.css"]) {
    const css = readProjectFile(file);
    // 页面自己也可以定义布局用的局部变量（例如横幅的 --banner-h），
    // 只要它在本文件里定义过就行；真正的设计令牌仍然必须来自 theme.css。
    const localDefined = new Set([...css.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((match) => match[1]));
    for (const match of css.matchAll(/var\((--[a-z0-9-]+)/g)) {
      if (!defined.has(match[1]) && !localDefined.has(match[1])) problems.push(`${file} 用了未定义的令牌 ${match[1]}`);
    }
  }
  // JS 里动态拼过 var(--x) 的也要算上
  for (const file of ["library.js", "popup.js", "icons.js", "settings.js"]) {
    const source = readProjectFile(file);
    for (const match of source.matchAll(/var\((--[a-z0-9-]+)/g)) {
      if (!defined.has(match[1])) problems.push(`${file} 用了未定义的令牌 ${match[1]}`);
    }
  }
  assert.deepEqual([...new Set(problems)], [], `发现未定义的设计令牌：\n${[...new Set(problems)].join("\n")}`);
});

/* ------------------------- V1.1.4：对话框里的按钮必须被绑定 -------------------------

   V1.1.0 给收藏库加了「与 B 站对比」按钮，忘了 addEventListener；
   V1.1.3 加对比结果对话框，又忘了给「关闭」按钮绑定。同一个文件、同一类错误犯了两次，
   两次都是用户点下去发现没反应才暴露的。

   这条测试很便宜也很粗：凡是写在 <dialog> 里的 <button id="x">，
   它的 id 至少要在对应的 JS 里出现过（要么 getElementById、要么 x.addEventListener）。
   完全没出现 = 铁定没人管它，点了必然没反应。
   type="submit" 配 <form method="dialog"> 的原生关闭按钮除外。 */

test("对话框里的按钮都有人管（不会点了没反应）", () => {
  const pairs = [["library.html", "library.js"], ["popup.html", "popup.js"]];
  const problems = [];
  for (const [html, js] of pairs) {
    const markup = readProjectFile(html);
    const script = readProjectFile(js);
    for (const dialog of markup.matchAll(/<dialog\b[\s\S]*?<\/dialog>/g)) {
      const block = dialog[0];
      const nativeClose = /method\s*=\s*"dialog"/.test(block);
      if (nativeClose) continue;
      for (const button of block.matchAll(/<button\b[^>]*\bid="([\w-]+)"/g)) {
        const id = button[1];
        if (!script.includes(`"${id}"`)) problems.push(`${html} 的对话框按钮 #${id} 在 ${js} 里从未出现，多半没绑事件`);
      }
    }
  }
  assert.deepEqual(problems, [], problems.join("\n"));
});

/* ------------------------- V1.1.3：<label> 容器的 display 陷阱 -------------------------

   library.css 里有一条 `.editor-dialog label { display: block; ... }`，特异性是 (0,1,1)。
   凡是拿 <label> 当布局容器（为了点整行就能勾选）的组件，只要选择器只有一个类
   (0,1,0)，它的 display:grid / display:flex 就会被这条规则盖成 block ——
   表现是"勾选框和图标在上、名称和数量在下"的错位。

   V1.1.0 的「移动或复制」就踩了这个坑（当时用 !important 顶了 margin/color/
   font-size/font-weight，偏偏漏了 display），同一个坑还埋着 videoDialog 里的
   target-checkbox-option。这条测试盯着这一类。 */

test("用 <label> 当容器的组件，display 必须压得过 .editor-dialog label", () => {
  const css = readProjectFile("library.css");
  const js = readProjectFile("library.js");

  const dialogLabelRule = css.match(/\.editor-dialog label\s*\{([^}]*)\}/);
  assert.ok(dialogLabelRule, "找不到 .editor-dialog label 规则，这条测试的前提变了，请重新检查");
  assert.match(dialogLabelRule[1], /display:\s*block/, ".editor-dialog label 现在不设 display 了，本测试可以放宽");

  // library.js 里所有 createElement("label") 之后设置的 className
  const lines = js.split("\n");
  const labelClasses = [];
  lines.forEach((line, i) => {
    if (!line.includes('createElement("label")')) return;
    for (let j = i; j < Math.min(i + 4, lines.length); j += 1) {
      const m = lines[j].match(/^\s*\w+\.className = "([\w-]+)"/);
      if (m) { labelClasses.push(m[1]); return; }
    }
  });
  assert.ok(labelClasses.length >= 3, `只找到 ${labelClasses.length} 个 label 容器，解析可能失效了`);

  // 只看会出现在对话框里的：对话框外的不受影响。
  // 目前 pager-size 在分页器里（不在 .editor-dialog 内），其余两个在对话框里。
  const inDialog = labelClasses.filter((name) => name !== "pager-size");
  const problems = [];
  for (const cls of inDialog) {
    // 用 indexOf 而不是拼正则 —— 反斜杠转义太容易写错（这里已经写错过一次）
    const at = css.indexOf(`.editor-dialog .${cls}`);
    if (at < 0) {
      problems.push(`${cls} 没有 .editor-dialog 前缀的规则，display 会被 .editor-dialog label 盖成 block`);
      continue;
    }
    const open = css.indexOf("{", at);
    const close = css.indexOf("}", open);
    if (!/display\s*:/.test(css.slice(open, close))) problems.push(`${cls} 的 .editor-dialog 规则里没写 display`);
  }
  assert.deepEqual(problems, [], problems.join("\n"));
});

/* ------------------------- V1.1.6：出网限速是硬约束 -------------------------

   README 的「使用须知」第一条就是"请勿滥用 …… 请求过密可能触发风控"。
   但 V1.1.6 之前这个约定只靠"每个调用点自己记得加延迟"，
   于是「最近 N 天」先拉全 71 页再过滤，把开发者本人扫进了风控。

   现在限速放在唯一的出网口 biliImportApiGet() 里。这条测试守三件事：
     1. 全局最小间隔没有被调小
     2. 翻页间隔不低于全局下限
     3. 打 B 站接口的裸 fetch 必须登记在白名单里 —— 新增的必须走限速器 */

test("默认档位是「较低」，且大收藏夹配快档要再提醒一次", () => {
  const src = readProjectFile("background.js");
  assert.match(src, /const DEFAULT_REQUEST_SPEED = "lower"/,
    "默认档位不是「较低」——大收藏夹是常态，「较低」是唯一带分批停顿的档位");

  const popup = readProjectFile("popup.js");
  // 弹窗的兜底也要跟着改，否则读不到设置时会退回旧默认值
  assert.match(popup, /currentSpeed = "lower"/, "弹窗的默认档位没跟着改成「较低」");

  // 档位偏快 + 总量偏大 → 动手前再拦一次
  assert.match(popup, /const RISKY_TOTAL_ITEMS = 500/, "没有「总量阈值」这个判断");
  assert.match(popup, /function riskySpeedWarning\(\)/, "没有档位风险判断函数");
  assert.match(popup, /function confirmRiskySpeed\(\)/, "没有共用的前置检查");
  const entries = (popup.match(/await confirmRiskySpeed\(\)|confirmRiskySpeed\(\)\.then/g) || []).length;
  assert.ok(entries >= 3, `只有 ${entries} 个入口调用了风险提醒，导入/更新/差异三个都要`);
  assert.match(readProjectFile("popup.html"), /id="riskyWarnDialog"/, "风险提醒弹窗不存在");
});

test("收藏库的档位风险判断要用线上条数，不能用本地条数", () => {
  const library = readProjectFile("library.js");
  // 必须是问后台要线上条数 —— 用本地条数做代理，本地为空时是 0，
  // 快档跑 700 多条也不会提醒（真机上就是这么漏掉的）
  assert.match(library, /type: "bca-fav-counts"/, "收藏库没有查线上条数");
  assert.match(library, /response\.counts\?\.\[selectedCollection\]/, "没有用后台返回的条数");
  assert.match(library, /RISKY_SPEEDS\.has\(response\.speed\)/, "档位要用后台的真实值，不能用本地缓存的");

  const src = readProjectFile("background.js");
  assert.match(src, /message\?\.type === "bca-fav-counts"/, "后台没有这个查询入口");
  assert.match(src, /counts\[folder\.title\] = Number\(folder\.count\)/, "没有返回各收藏夹的条数");
  assert.match(src, /speed: requestSpeedId/, "没有把当前档位一并返回");
});

test("「更新视频状态」发现失效时，只改状态，不动其它内容", () => {
  const src = readProjectFile("background.js");
  const at = src.indexOf("async function refreshOneArchiveStatus");
  assert.ok(at > 0, "找不到 refreshOneArchiveStatus");
  const body = src.slice(at, src.indexOf("\n}\n", at));

  // 失效分支里只能交给 patchVolatileFields 一个 videoStatus —— 多传任何字段
  // 都会改写本地内容，而"保住完好的内容"是这个项目最核心的约定
  const invalidBranchAt = body.indexOf("if (invalid) {");
  assert.ok(invalidBranchAt > 0, "找不到失效分支");
  const invalidBranch = body.slice(invalidBranchAt, body.indexOf("\n  }", invalidBranchAt));
  const calls = [...invalidBranch.matchAll(/patchVolatileFields\([^)]*\)/g)];
  assert.equal(calls.length, 1, `失效分支里调用了 ${calls.length} 次 patchVolatileFields`);
  assert.match(calls[0][0], /\{ videoStatus:[^}]*\}/,
    "失效分支传给 patchVolatileFields 的不止 videoStatus —— 那会覆盖本地内容");
  assert.equal(/title|description|tags|cover|cid/.test(calls[0][0]), false,
    "失效分支动了标题/简介/标签之类的字段");

  // 已经标记过失效的不再重复改写（重复写只会丢信息）
  assert.match(invalidBranch, /视频状态：.*失效/, "没有跳过「已经标记过失效」的记录");
});

test("importItemIsTrustworthy：占位符不算数据（真跑）", () => {
  // 依赖要一起加载：importUsefulTitle 内部用 IMPORT_INVALID_TITLES 这个常量
  const { importItemIsTrustworthy, importClean, importUsefulTitle, importIsInvalidTitle } =
    loadBackgroundFunctions(["importItemIsTrustworthy", "importClean", "importUsefulTitle", "importIsInvalidTitle"], ["IMPORT_INVALID_TITLES"]);
  // 前两版守卫依赖的谓词，对照用
  assert.equal(importUsefulTitle("未知"), true, "前提变了：importUsefulTitle 现在认为「未知」不可用，本测试可放宽");
  assert.equal(importIsInvalidTitle("未知"), false);

  // 唯一被信任的情形：标题是真实标题
  assert.equal(importItemIsTrustworthy({ title: "【哆啦A梦】国语版 800集全 4K修复" }), true);
  // 三种不可信：失效、占位「未知」、空标题
  assert.equal(importItemIsTrustworthy({ title: "【哆啦A梦】", isInvalid: true }), false, "失效条目不可信");
  assert.equal(importItemIsTrustworthy({ title: "未知" }), false, "「未知」是占位符，不是数据");
  assert.equal(importItemIsTrustworthy({ title: "" }), false, "空标题不可信");
  assert.equal(importItemIsTrustworthy({ title: "   " }), false, "只有空白也不可信");
  assert.equal(importItemIsTrustworthy({ title: "已失效视频" }), false);
  assert.equal(importItemIsTrustworthy(null), false);
  assert.equal(importItemIsTrustworthy({}), false);
});

test("attr 是删除原因枚举：非 0 即失效（真跑 + 真数据）", () => {
  const { importAttrIsInvalid } = loadBackgroundFunctions(["importAttrIsInvalid"]);
  // 真机数据（2026-10-10 抓自 3 个收藏夹共 282 条）：
  // 250 条有效视频 attr 全为 0；32 条失效视频 attr 全非 0（1 和 9 两种取值）
  assert.equal(importAttrIsInvalid(0), false, "有效视频");
  assert.equal(importAttrIsInvalid(1), true, "哆啦a梦、研 里失效视频的取值");
  assert.equal(importAttrIsInvalid(9), true, "沙雕动画 5 条、研 17 条失效视频的取值");
  // ★ 这两条是「按位判最低位」写法会漏掉的：2 是偶数，但它是版权原因，同样失效
  assert.equal(importAttrIsInvalid(2), true, "版权原因 —— & 1 写法会当成有效");
  assert.equal(importAttrIsInvalid(11), true, "已锁定");
  assert.equal(importAttrIsInvalid(5), true, "视频已失效");
  // 边界：缺字段 / 空值 / 字符串
  assert.equal(importAttrIsInvalid(undefined), false);
  assert.equal(importAttrIsInvalid(null), false);
  assert.equal(importAttrIsInvalid(""), false);
  assert.equal(importAttrIsInvalid("0"), false);
  assert.equal(importAttrIsInvalid("9"), true, "字符串形态也要认");
});

test("失效判据三个来源缺一不可", () => {
  const src = readProjectFile("background.js");
  const line = src.split("\n").find((l) => l.includes("isInvalid: media.is_invalid"));
  assert.ok(line, "找不到 isInvalid 的判据行");
  assert.match(line, /media\.is_invalid === true/, "少了接口给的显式字段");
  assert.match(line, /importAttrIsInvalid\(media\.attr\)/, "少了 attr 兜底");
  assert.match(line, /importIsInvalidTitle\(title\)/, "少了标题兜底");
  // 两次差点写错的写法都禁止退回：
  //   attr === 1 → 漏掉 attr=9（UP主自行删除），实测 22 条
  //   attr & 1   → 漏掉 attr=2（版权原因）这类偶数值
  assert.equal(/attr\s*===\s*1/.test(src), false, "不许用 === 1 判 attr，它是枚举不是布尔");
  assert.equal(/attr\s*&\s*1/.test(src), false, "不许按位判最低位 —— 1 和 9 都是奇数只是巧合");
  assert.match(src, /function importAttrIsInvalid\(value\) \{ return Number\(value \|\| 0\) !== 0; \}/,
    "importAttrIsInvalid 必须判「非 0」");
});

/* ------------------------- V1.1.35 显示失效原因 ------------------------- */

test("失效原因：attr → 文案映射（真跑）", () => {
  const { importAttrReason } = loadBackgroundFunctions(["importAttrReason"], ["IMPORT_ATTR_LABELS"]);
  // 0 是「有效」：必须返回空串。归档端靠「空串就不写这一行」保证有效视频的 视频信息.txt 一个字节不变
  assert.equal(importAttrReason(0), "", "0 是有效视频，没有原因可说");
  assert.equal(importAttrReason(undefined), "", "缺字段");
  assert.equal(importAttrReason(null), "");
  assert.equal(importAttrReason(""), "");
  assert.equal(importAttrReason("0"), "", "字符串形态的 0 也是有效");
  // 表里的 6 个取值逐个对文案
  assert.equal(importAttrReason(1), "其他");
  assert.equal(importAttrReason(2), "版权原因", "★ 2 是偶数 —— 按位判最低位的写法会漏掉它");
  assert.equal(importAttrReason(3), "违规内容");
  assert.equal(importAttrReason(5), "视频已失效");
  assert.equal(importAttrReason(9), "UP主自行删除", "真机上最常见的失效取值");
  assert.equal(importAttrReason(11), "已锁定");
  assert.equal(importAttrReason("9"), "UP主自行删除", "字符串形态也要认");
  // 表外的取值要有兜底，且不能退化成两种错误形态：
  //   ① 空串 —— 界面会当成「老存档没写原因」，把「原因(7)」显示成「已失效」，线索全丢
  //   ② 「其他」—— 那是 attr=1 的确切含义，冒充它等于撒谎
  const fallback = importAttrReason(7);
  assert.ok(fallback, "未知 attr 不能返回空串");
  assert.notEqual(fallback, "其他", "未知取值不许冒充 attr=1 的「其他」");
  assert.match(fallback, /7/, "兜底文案要带上原始取值");
});

test("失效原因写进 视频信息.txt：失效才写，有效一个字都不加（真跑）", () => {
  // 依赖一起加载：buildInfo 内部用 format*/importIsPlaceholder，importIsPlaceholder 用 importClean
  const { buildInfo } = loadBackgroundFunctions(
    ["buildInfo", "infoLineValue", "importIsPlaceholder", "importClean", "importAttrReason",
      "formatDateTime", "formatChineseDateTime", "formatDuration", "formatPublishDate", "localDateParts"],
    ["STAT_KEYS", "STAT_LABELS", "IMPORT_PLACEHOLDER_VALUES", "IMPORT_ATTR_LABELS"]
  );
  const savedAt = new Date("2026-10-10T12:00:00");
  const metadata = {
    imported: true, title: "已失效视频", url: "未知", bvid: "未知", aid: "", description: "未知",
    upName: "账号已注销", upMid: "未知", upFans: "未知", category: "未知", duration: 0, pubdate: 0,
    tags: [], stats: {}, recoverySummary: "未能找回资料", invalid: true, attr: 9
  };
  const build = (extra) => buildInfo({ metadata: { ...metadata, ...extra }, favoriteAt: savedAt.getTime() }, "沙雕动画", savedAt);

  const invalid = build({});
  assert.match(invalid, /^失效原因：UP主自行删除$/m, "失效视频必须写下原因");
  // 位置：紧跟在「恢复情况」之后，人扫一眼就看得到
  const lines = invalid.split("\n");
  assert.equal(lines[lines.findIndex((l) => l.startsWith("恢复情况：")) + 1], "失效原因：UP主自行删除", "「失效原因」要跟在「恢复情况」后面");

  // 有效视频：一个字节都不多 —— 这次改动不会污染任何现有归档
  const valid = build({ invalid: false, attr: 0 });
  assert.equal(/失效原因/.test(valid), false, "有效视频不该出现「失效原因」这一行");
  assert.match(valid, /^视频状态：正常$/m);

  // attr 缺失（老数据）或接口没给：不写空行，界面按「已失效」兜底
  assert.equal(/失效原因/.test(build({ attr: undefined })), false, "attr 缺失时不写空行");
  assert.equal(/失效原因/.test(build({ attr: 0 })), false, "接口说失效但 attr=0 时也不写");

  // 接口将来新增枚举值：原样写下来，不吞掉
  assert.match(build({ attr: 7 }), /^失效原因：原因\(7\)$/m, "未知 attr 要原样落到存档里");
});

test("失效原因的全链路：接口 attr → importMetadata → 视频信息.txt（真跑）", () => {
  // 这条盯的是一个很容易漏的接缝：buildInfo 读的是 metadata.attr，而 metadata 是
  // importMetadata 现造的**另一个对象**。只在 buildInfo 里写逻辑、忘了在 importMetadata
  // 里带上 attr 的话，原因永远只停在内存里，txt 里一行都不会有（而且不会有任何报错）。
  const { importMetadata, buildInfo } = loadBackgroundFunctions(
    ["importMetadata", "buildInfo", "infoLineValue", "importUsefulTitle", "importIsInvalidTitle", "importClean",
      "importBvToAid", "importAidToBv", "importAttrReason", "importIsPlaceholder",
      "formatDateTime", "formatChineseDateTime", "formatDuration", "formatPublishDate", "localDateParts"],
    ["IMPORT_INVALID_TITLES", "IMPORT_BV_TABLE", "IMPORT_ATTR_LABELS", "STAT_KEYS", "STAT_LABELS", "IMPORT_PLACEHOLDER_VALUES"]
  );
  const item = {
    title: "已失效视频", bvid: "", aid: "", cover: "", description: "未知", author: "账号已注销",
    authorMid: "", upFans: "", stats: {}, category: "", duration: 0, pubdate: 0, tags: [],
    recoverySources: [], isInvalid: true, attr: 9
  };
  const savedAt = new Date("2026-10-10T12:00:00");
  const metadata = importMetadata(item, null);
  assert.equal(metadata.invalid, true);
  assert.equal(metadata.attr, 9, "importMetadata 没把 attr 带到归档写入端");
  const text = buildInfo({ metadata, favoriteAt: savedAt.getTime() }, "沙雕动画", savedAt);
  assert.match(text, /^失效原因：UP主自行删除$/m, "全链路走完，原因没落进 视频信息.txt");
  // 有效视频走同一条链路：attr=0，一行都不该多
  const validText = buildInfo({
    metadata: importMetadata({ ...item, isInvalid: false, attr: 0, title: "【哆啦A梦】国语版" }, null),
    favoriteAt: savedAt.getTime()
  }, "哆啦a梦", savedAt);
  assert.equal(/失效原因/.test(validText), false, "有效视频被写进了「失效原因」");
});

test("失效原因映射表不许退回错写法（静态回归）", () => {
  const src = readProjectFile("background.js");
  const line = src.split("\n").find((l) => l.includes("const IMPORT_ATTR_LABELS ="));
  assert.ok(line, "找不到 IMPORT_ATTR_LABELS 映射表");
  for (const [code, label] of [[1, "其他"], [2, "版权原因"], [3, "违规内容"], [5, "视频已失效"], [9, "UP主自行删除"], [11, "已锁定"]]) {
    assert.match(line, new RegExp(`\\b${code}: "${label}"`), `映射表少了 ${code}: ${label}`);
  }
  // ★ 单拎出来说一遍：2 是偶数，是最容易被人当成「不是失效」而漏掉的一项
  assert.match(line, /\b2: "版权原因"/, "版权原因（attr=2）必须留在表里");
  // 反向断言：前两版连续栽在按位判和等值判上，不许退回
  //   attr & 1 → attr=2（版权原因）被误判成有效
  //   attr === 1 → attr=9（UP主自行删除）整类漏掉，实测 22 条
  assert.equal(/attr\s*&\s*1/.test(src), false, "不许按位判最低位 —— attr=2 会被当成有效");
  assert.equal(/attr\s*===\s*1/.test(src), false, "不许用 === 1 判 attr，它是枚举不是布尔");
  // 未知取值必须走兜底，不许 return IMPORT_ATTR_LABELS[code] 直接漏出 undefined
  assert.match(src, /IMPORT_ATTR_LABELS\[code\] \|\| `原因\(\$\{code\}\)`/, "未知 attr 要有兜底文案");
});

test("收藏库把失效原因读回来并显示（静态回归）", () => {
  const library = readProjectFile("library.js");
  // 1) 从 视频信息.txt 读回来。键就是中文原文；老存档没有这一行时 field() 给空串，不是「未知」
  assert.match(library, /invalidReason: invalidReasonText\(field\(info, "失效原因"\)\)/,
    "没有把「失效原因」从存档读回来（或没走 invalidReasonText 兜底）");
  // 2) 映射：六条 case 都要在，且 key 必须是字面量（t() 的 key 是拼接/变量的话词典必然漏条目）
  for (const label of ["其他", "版权原因", "违规内容", "视频已失效", "UP主自行删除", "已锁定"]) {
    assert.ok(library.includes(`case "${label}": return BcaI18n.t("${label}");`), `invalidReasonText 少了「${label}」`);
  }

  // 3) 卡片副标题：有效视频走原来的 UP 主名；失效视频改说原因，没原因就只说「已失效」
  const at = library.indexOf('card.querySelector(".card-up").textContent');
  assert.ok(at > 0, "找不到卡片副标题那一行");
  const card = library.slice(at, at + 300);
  assert.match(card, /video\.isInvalid/, "卡片副标题没有按失效与否分流");
  assert.match(card, /video\.invalidReason \?/, "失效且知道原因时要显示原因");
  assert.match(card, /BcaI18n\.t\("已失效"\)/, "失效要显示「已失效」");
  assert.match(card, /video\.upName \|\| video\.bvid/, "有效视频必须保持原来的 UP 主名");
  assert.equal(/未知/.test(card), false, "老存档不许显示「未知」");

  // 4) 详情面板：只在失效时多一行「失效原因」，值缺失时兜底成「已失效」
  const detailLine = library.split("\n").find((l) => l.includes('addField(rows, BcaI18n.t("失效原因")'));
  assert.ok(detailLine, "详情面板没有加「失效原因」这一行");
  assert.match(detailLine, /if \(video\.isInvalid\)/, "「失效原因」只该在失效视频的详情里出现");
  assert.match(detailLine, /video\.invalidReason \|\| BcaI18n\.t\("已失效"\)/, "老存档要兜底成「已失效」，不是「未知」");
  assert.equal(/未知/.test(detailLine), false, "详情面板也不许把没写原因显示成「未知」");
});

test("失效视频不许覆盖本地已有的记录", () => {
  const src = readProjectFile("background.js");
  // 在"已存在"的分支里，失效条目必须先被丢弃再谈刷新
  const at = src.indexOf("skipped += 1;");
  assert.ok(at > 0, "找不到已存在条目的处理分支");
  const branch = src.slice(at, at + 1600);
  assert.match(branch, /if \(!importItemIsTrustworthy\(item\)\) \{[\s\S]{0,120}continue;/,
    "降级条目没有被挡在刷新之前");
  // 前两版分别栽在 item.isInvalid 和 importUsefulTitle 上，不许退回那两种写法
  assert.equal(/if \(item\.isInvalid\) \{/.test(branch), false, "判据退回了只看 isInvalid");
  assert.equal(/!importUsefulTitle\(item\.title\)\) \{/.test(branch), false,
    "判据退回了 importUsefulTitle —— 「未知」能骗过它，那正是真机上漏掉的那一类");
  assert.match(src, /protectedCount \+= 1/, "没有统计被保留的降级条目");
  // 本地没有的失效条目仍然要正常写入（pendingItems 那条分支不受影响）
  assert.match(src, /pendingItems\.push\(item\)/, "本地没有的条目仍然要写入");
});

test("完成弹窗只弹一次（点掉之后再打开插件不该重放）", () => {
  const src = readProjectFile("background.js");
  // 摘要落盘时要带上"还没提示过"
  assert.match(src, /acknowledged: false/, "摘要里没有「已提示」标记");

  const popup = readProjectFile("popup.js");
  // 恢复时只有没提示过才弹
  assert.match(popup, /if \(!state\.summary\.acknowledged\)/, "恢复结果时没有判断「已提示」，弹窗会重放");
  // 点掉之后要把标记写回去
  assert.match(popup, /summary: \{ \.\.\.state\.summary, acknowledged: true \}/, "点掉弹窗后没有回写标记");
  assert.match(
    popup,
    /function dismissDoneDialog\(\)[\s\S]{0,600}?acknowledged: true/,
    "回写标记没有放在 dismissDoneDialog 里"
  );
  // 「知道了」和 Esc 必须走同一条路：只绑 click 的话，Esc 关掉不写标记，下次打开插件又弹一遍
  assert.match(popup, /getElementById\("doneDialogClose"\)\.addEventListener\("click", dismissDoneDialog\)/);
  assert.match(popup, /doneDialog\.addEventListener\("cancel", dismissDoneDialog\)/, "Esc 关掉没有回写「已提示」");
});

test("进度区按操作类型显示，差异对比不给暂停/取消", () => {
  const popup = readProjectFile("popup.js");
  // 三种操作的标题必须是字面量调用（提取器要扫得到）
  for (const label of ["正在导入收藏夹", "正在更新收藏夹", "正在对比差异", "导入已暂停", "更新已暂停"]) {
    assert.ok(popup.includes(`BcaI18n.t("${label}")`), `「${label}」没有写成字面量调用，翻译会静默缺失`);
  }
  // 对比是只读短任务，按钮要整个藏起来 —— 以前照搬导入那套，点了没用
  assert.match(popup, /importControl\.hidden = !importBusy \|\| isDiff/,
    "差异对比时没有隐藏暂停/取消按钮");
  assert.match(popup, /activeOperation = "diff"/, "差异对比没有标记操作类型");
  assert.match(popup, /activeOperation = options\.recentDays \? "update" : "import"/,
    "更新与导入没有区分文案");

  // 收藏库那边也要过同一道风险检查
  const library = readProjectFile("library.js");
  assert.match(library, /confirmLibraryRiskySpeed/, "收藏库的「与 B 站对比」没有档位风险检查");
  assert.match(library, /RISKY_SPEEDS = new Set\(\["higher", "high"\]\)/, "收藏库的风险档位集合不对");
  assert.match(readProjectFile("library.html"), /id="diffRiskyDialog"/, "收藏库的风险提醒弹窗不存在");
});

test("差异对比的状态要落盘（切走弹窗再回来不能看起来断了）", () => {
  const src = readProjectFile("background.js");
  assert.match(src, /function publishDiffState\(/, "差异状态没有落盘函数");
  assert.match(src, /chrome\.storage\.local\.set\(\{ diffState/, "没有把差异状态写进 storage");
  // 结果只存摘要：完整列表在报告文件里，界面本来也只显示摘要
  assert.match(src, /summary: \{/, "没有保存结果摘要");
  assert.match(src, /folderTitle: d\.folderTitle/, "摘要里没有各收藏夹的数字");

  const popup = readProjectFile("popup.js");
  assert.match(popup, /chrome\.storage\.local\.get\("diffState"\)/, "弹窗打开时没有恢复差异状态");
  assert.match(popup, /state\.running/, "没有区分「还在跑」和「跑完了」");
});

test("收藏夹列表要有短时缓存（差异对比与导入读的是同一份）", () => {
  const src = readProjectFile("background.js");
  const ttl = Number(src.match(/IMPORT_LIST_CACHE_TTL_MS = ([\d\s*]+);/)?.[1].replace(/\s/g, "").split("*").reduce((a, b) => a * Number(b), 1) || 0);
  assert.ok(ttl > 0 && ttl <= 15 * 60 * 1000,
    `列表缓存 TTL 是 ${ttl}ms —— 太长会拿到过期列表，没有缓存则"先看差异再导入"要读两遍`);

  // fetchImportFavoritePage 必须查缓存、写缓存
  const at = src.indexOf("async function fetchImportFavoritePage");
  assert.ok(at > 0, "找不到 fetchImportFavoritePage");
  const body = src.slice(at, src.indexOf("\n}\n", at));
  assert.match(body, /importListCacheRead\(/, "读列表前没有查缓存");
  assert.match(body, /importListCacheWrite\(/, "读到列表后没有写缓存");

  // 导入**不应该**清缓存：全程只有 GET，导入只写本地，改不了 B 站的列表。
  // 之前真的清了一次，结果把后面几个收藏夹的缓存也一起清了，缓存等于白加。
  assert.equal(/importListCacheClear/.test(src), false, "导入不该再清列表缓存，见 importListCacheStore 上方的说明");
});

test("请求放大器都有硬预算，不能无限翻页", () => {
  const src = readProjectFile("background.js");
  const num = (name) => Number(src.match(new RegExp(name + " = (\\d+)"))?.[1] || 0);

  // 失效恢复：原来 4 轮 × 100 页 × 3 次重试 = 最多 1200 次，是项目里最大的放大器
  const recovery = num("IMPORT_RECOVERY_MAX_REQUESTS");
  const passes = num("IMPORT_RECOVERY_MAX_PASSES");
  assert.ok(recovery > 0 && recovery <= 300, `失效恢复的请求预算是 ${recovery}，太大`);
  assert.ok(passes > 0 && passes <= 3, `失效恢复轮数是 ${passes}，太大`);
  assert.match(src, /recoveryRequests >= IMPORT_RECOVERY_MAX_REQUESTS/, "恢复循环没有真的检查预算");

  // 观看历史
  const history = num("IMPORT_HISTORY_MAX_REQUESTS");
  assert.ok(history > 0 && history <= 80, `观看历史的请求预算是 ${history}，太大`);
  assert.match(src, /page < IMPORT_HISTORY_MAX_REQUESTS/, "观看历史没有用预算常量");

  // 页面代取：失败几次之后本轮就别再试了，否则每次请求都发两遍
  const proxyLimit = num("IMPORT_PAGE_PROXY_FAILURE_LIMIT");
  assert.ok(proxyLimit > 0 && proxyLimit <= 5, `页面代取的失败上限是 ${proxyLimit}`);
  assert.match(src, /importPageProxyFailures < IMPORT_PAGE_PROXY_FAILURE_LIMIT/, "页面代取没有跳过逻辑");

  // 回退直连也是真实请求，必须再领一张限速票
  const apiGetAt = src.indexOf("async function biliImportApiGet");
  const body = src.slice(apiGetAt, src.indexOf("\n}\n", apiGetAt));
  const tickets = (body.match(/await biliThrottleWait\(\)/g) || []).length;
  assert.ok(tickets >= 2, `biliImportApiGet 里有 ${tickets} 张限速票，但它最多会发两次请求（页面代取 + 回退）`);
});

test("B 站出网必须过限速器，裸 fetch 要登记在案", () => {
  const src = readProjectFile("background.js");

  // 请求速度档位表
  const intervals = [...src.matchAll(/intervalMs: (\d+)/g)].map((m) => Number(m[1]));
  assert.ok(intervals.length >= 4, `速度档位只有 ${intervals.length} 档`);
  const standard = Number(src.match(/standard: \{ intervalMs: (\d+)/)?.[1] || 0);
  assert.ok(standard >= 250, `默认（标准）档间隔只有 ${standard}ms —— 太激进`);
  const fastest = Math.min(...intervals);
  assert.ok(fastest >= 150, `最快的档位是 ${fastest}ms，太快了`);
  assert.ok(fastest < standard, "「标准」应该不是最快的一档，档位表可能写反了");

  // 「较低」必须是真的"分批"，而不只是把间隔拉长 —— 用户要的是更接近人的模式
  assert.match(src, /lower:\s*\{ intervalMs: \d+, batchSize: [1-9]\d*, pauseMs: [1-9]\d* \}/,
    "「较低」档没有分批停顿（batchSize/pauseMs 都是 0），那只是慢一点的「标准」");
  assert.match(src, /if \(speed\.batchSize > 0\)/, "限速器没有实现分批停顿");

  // 档位必须听用户的：存在 storage 里、并监听变化
  // 用 session 而不是 local：关掉浏览器要回到默认的「较低」，不沿用上次的选择
  assert.match(src, /chrome\.storage\.session\.get\("requestSpeed"\)/, "没有读取用户选的档位");
  assert.equal(/storage\.local[\s\S]{0,80}requestSpeed/.test(src), false,
    "档位不该存在 storage.local —— 那样关掉浏览器还会沿用上次的选择");
  assert.match(src, /chrome\.storage\.onChanged\.addListener/, "没有监听档位变化，改了要重启才生效");

  // 「较高」与「高」必须先弹提醒（用户明确要求）
  const popup = readProjectFile("popup.js");
  assert.match(popup, /REQUEST_SPEED_RISKY = new Set\(\["higher", "high"\]\)/, "快速档位没有标记为有风险");
  assert.match(popup, /speedWarnDialog\.showModal\(\)/, "切到快速档位时没有弹提醒");
  assert.match(readProjectFile("popup.html"), /id="speedWarnDialog"/, "提醒弹窗不存在");
  assert.match(readProjectFile("popup.html"), /500 条以下/, "提醒文案里没有「控制总量」的提示");

  // 唯一的出网口必须在发请求之前排队
  const apiGetAt = src.indexOf("async function biliImportApiGet");
  assert.ok(apiGetAt > 0, "找不到 biliImportApiGet");
  const apiGetBody = src.slice(apiGetAt, src.indexOf("\n}\n", apiGetAt));
  assert.match(apiGetBody, /await biliThrottleWait\(\)/, "biliImportApiGet 没有接限速器");

  // 高频路径必须经过它
  for (const name of ["fetchVideoDetail", "fetchImportFavoritePage"]) {
    const at = src.indexOf(`function ${name}(`);
    assert.ok(at > 0, `找不到 ${name}`);
    const body = src.slice(at, src.indexOf("\n}\n", at));
    assert.match(body, /biliImportApiGet\(/, `${name} 没走 biliImportApiGet —— 高频路径必须受限速器管`);
  }

  // 白名单：低频调用或 CDN 图片。
  // 新增裸 fetch 必须来这里登记 —— 这是"忘了加限速"的唯一防线。
  //   biliImportApiGet        —— 限速器所在的唯一出网口
  //   loadCoverPng            —— 封面图走图片 CDN（credentials: omit），
  //                              且被详情循环的 IMPORT_DETAIL_DELAY_MS 带着走，不会快
  //   （fetchManualVideoMetadata 在 1.6.0 的 P0-2 里改走 biliImportApiGet，已撤下豁免；
  //     下载链路 getDownloadWbiKey / biliDownloadApi 已随 1.3.0 整体删除，不再登记）
  const allowlist = ["biliImportApiGet", "loadCoverPng"];
  const offenders = [];
  let current = "(顶层)";
  for (const line of src.split("\n")) {
    const declared = line.match(/^(?:async )?function (\w+)/);
    if (declared) current = declared[1];
    if (/await fetch\(/.test(line) && !/locales\//.test(line) && !allowlist.includes(current)) {
      offenders.push(`${current} (第 ${src.slice(0, src.indexOf(line)).split("\n").length} 行)`);
    }
  }
  assert.deepEqual([...new Set(offenders)], [],
    `这些地方有裸 fetch 打 B 站接口，请改成 biliImportApiGet，或确认安全后登记到白名单：\n${[...new Set(offenders)].join("\n")}`);
});

/* ------------------------- V1.1.4：增量更新的时间窗口 -------------------------

   真机事故：V1.1.4 第一版的「最近 N 天」过滤拿 Date.now()（毫秒）去比
   接口返回的 fav_time（秒），条件永远为假，上千条一条都没命中，
   用户看到的是"读取视频 0 / 失败 0"——没有报错，就是什么都没有。

   根因很低级：本文件里已经有两处做过这个换算，写过滤时没去看。
   所以这两个函数必须真跑测试，而不是靠读源码。 */

test("收藏时间：秒与毫秒都要认", () => {
  const { favoriteTimeMs } = loadBackgroundFunctions(["favoriteTimeMs"]);
  const ms = 1761613600000;                       // 2026-10-28 前后
  assert.equal(favoriteTimeMs(ms), ms, "毫秒原样返回");
  assert.equal(favoriteTimeMs(Math.floor(ms / 1000)), ms, "秒要乘 1000");
  assert.equal(favoriteTimeMs(0), 0);
  assert.equal(favoriteTimeMs(null), 0);
  assert.equal(favoriteTimeMs(undefined), 0);
  assert.equal(favoriteTimeMs(""), 0);
  assert.equal(favoriteTimeMs("abc"), 0);
  assert.equal(favoriteTimeMs("1761613600"), ms, "字符串形式的秒也要认");
});

test("最近 N 天过滤：边界与单位", () => {
  // 注意要把依赖一起加载：加载器只抽列出来的函数，
  // importWithinRecentDays 内部调用 favoriteTimeMs，不一起抽出来就会 ReferenceError。
  const { importWithinRecentDays } = loadBackgroundFunctions(["favoriteTimeMs", "importWithinRecentDays"]);
  const now = 1761613600000;
  const day = 86400000;
  const at = (daysAgo) => Math.floor((now - daysAgo * day) / 1000);   // 秒，和接口一致

  const items = [
    { favoriteAt: at(0.5), title: "半天前" },
    { favoriteAt: at(3), title: "正好 3 天前" },
    { favoriteAt: at(5), title: "5 天前" },
    { favoriteAt: at(30), title: "30 天前" }
  ];

  assert.deepEqual(importWithinRecentDays(items, 3, now).map((x) => x.title), ["半天前", "正好 3 天前"]);
  assert.deepEqual(importWithinRecentDays(items, 7, now).map((x) => x.title), ["半天前", "正好 3 天前", "5 天前"]);
  assert.equal(importWithinRecentDays(items, 15, now).length, 3);
  assert.equal(importWithinRecentDays(items, 0, now).length, 4, "0 天等于不过滤");
  assert.equal(importWithinRecentDays(items, -5, now).length, 4, "负数也当不过滤");
  assert.equal(importWithinRecentDays(null, 3, now).length, 0);
});

test("提前收工：整页都早于窗口才算数", () => {
  const { importPageEntirelyBefore } = loadBackgroundFunctions(["favoriteTimeMs", "importPageEntirelyBefore"]);
  const now = 1761613600000;
  const cutoff = now - 3 * 86400000;
  const sec = (ms) => Math.floor(ms / 1000);

  // 整页都早于窗口 → 可以停
  assert.equal(importPageEntirelyBefore([{ favoriteAt: sec(now - 10 * 86400000) }], cutoff), true);
  // 有一条还在窗口内 → 不能停
  assert.equal(importPageEntirelyBefore(
    [{ favoriteAt: sec(now - 10 * 86400000) }, { favoriteAt: sec(now - 86400000) }], cutoff), false);
  // 有一条读不到时间 → 不能停（宁可多翻一页）
  assert.equal(importPageEntirelyBefore(
    [{ favoriteAt: sec(now - 10 * 86400000) }, { favoriteAt: 0 }], cutoff), false);
  // 空页 / 没有窗口 → 不能停
  assert.equal(importPageEntirelyBefore([], cutoff), false);
  assert.equal(importPageEntirelyBefore([{ favoriteAt: sec(now - 10 * 86400000) }], 0), false);
  // 正好卡在窗口边界上（毫秒相等）→ 不能停，边界要算"窗口内"
  assert.equal(importPageEntirelyBefore([{ favoriteAt: sec(cutoff) }], cutoff), false);
});

test("最近 N 天过滤：读不到收藏时间的条目要保留", () => {
  // 注意要把依赖一起加载：加载器只抽列出来的函数，
  // importWithinRecentDays 内部调用 favoriteTimeMs，不一起抽出来就会 ReferenceError。
  const { importWithinRecentDays } = loadBackgroundFunctions(["favoriteTimeMs", "importWithinRecentDays"]);
  const now = 1761613600000;
  const kept = importWithinRecentDays([
    { favoriteAt: 0, title: "没有时间" },
    { favoriteAt: undefined, title: "undefined" },
    { favoriteAt: null, title: "null" },
    { favoriteAt: Math.floor((now - 90 * 86400000) / 1000), title: "90 天前" }
  ], 3, now);
  // 宁可多处理一条，也不要漏掉读不到时间的记录
  assert.deepEqual(kept.map((x) => x.title), ["没有时间", "undefined", "null"]);
});

/* ------------------------- V1.1.0：同步差异报告 -------------------------

   核心是纯函数 computeFavoriteDiff，从 background.js 里抽出来真跑。
   这里要守住的最重要一条：**差异只比较列表，绝不抓详情** ——
   一旦有人往里加 fetchVideoDetail，这个功能就从"1~2 分钟"变成"39 分钟"，
   失去存在意义。下面有断言直接查这一条。 */

test("同步差异：四项差异都算对", () => {
  const { computeFavoriteDiff } = loadBackgroundFunctions(["computeFavoriteDiff"]);
  const entry = (bvid, title, invalid) => ({ bvid, keys: [`bvid:${bvid}`, `aid:${bvid.slice(2)}`], title, invalid });
  const record = (directory, title, invalid, bvid) => ({ directory, title, invalid, keys: [`bvid:${bvid}`, `aid:${bvid.slice(2)}`] });

  const diff = computeFavoriteDiff(
    [entry("BV1", "两边都有", false), entry("BV2", "只有线上有", false),
     entry("BV3", "刚变成失效", true), entry("BV4", "又活过来了", false),
     entry("BV5", "线上失效且本地没有", true)],
    [record("d1", "两边都有", false, "BV1"), record("d3", "刚变成失效", false, "BV3"),
     record("d4", "又活过来了", true, "BV4"), record("d6", "本地才有", false, "BV6"),
     record("d7", "本地才有且已失效", true, "BV7")]
  );

  assert.deepEqual(diff.added.map((x) => x.bvid), ["BV2", "BV5"]);
  assert.equal(diff.added[1].invalid, true, "线上就失效的新增项要带上标记");
  assert.deepEqual(diff.removed.map((x) => x.directory), ["d6", "d7"]);
  assert.deepEqual(diff.newlyInvalid.map((x) => x.bvid), ["BV3"]);
  assert.deepEqual(diff.recovered.map((x) => x.bvid), ["BV4"]);
  assert.equal(diff.unchanged, 1);
});

test("同步差异：同一记录有 bvid 与 aid 两个键，只能算一项", () => {
  const { computeFavoriteDiff } = loadBackgroundFunctions(["computeFavoriteDiff"]);
  const diff = computeFavoriteDiff([], [{ directory: "d", title: "t", invalid: false, keys: ["bvid:BV1", "aid:1"] }]);
  assert.equal(diff.removed.length, 1, "不能因为有两个键就算成两条");
});

test("同步差异：只要任一键匹配上就不算新增/已移除", () => {
  const { computeFavoriteDiff } = loadBackgroundFunctions(["computeFavoriteDiff"]);
  const diff = computeFavoriteDiff(
    [{ bvid: "BV1", keys: ["bvid:BV1", "aid:1"], title: "t", invalid: false }],
    [{ directory: "d", title: "t", keys: ["aid:1"], invalid: false }]
  );
  assert.equal(diff.added.length, 0);
  assert.equal(diff.removed.length, 0);
  assert.equal(diff.unchanged, 1);
});

test("同步差异：空输入不炸", () => {
  const { computeFavoriteDiff } = loadBackgroundFunctions(["computeFavoriteDiff"]);
  for (const [r, l] of [[[], []], [null, null], [undefined, undefined]]) {
    const diff = computeFavoriteDiff(r, l);
    assert.deepEqual([diff.added, diff.removed, diff.newlyInvalid, diff.recovered], [[], [], [], []]);
    assert.equal(diff.unchanged, 0);
  }
  assert.equal(computeFavoriteDiff([], [{ directory: "d", keys: ["bvid:BV1"] }]).removed.length, 1);
  assert.equal(computeFavoriteDiff([{ bvid: "BV1", keys: ["bvid:BV1"] }], []).added.length, 1);
});

test("同步差异：本地记录的状态解析", () => {
  const { localRecordIsInvalid, localRecordTitle, groupLocalImportRecords } =
    loadBackgroundFunctions(["localRecordIsInvalid", "localRecordTitle", "groupLocalImportRecords"]);

  assert.equal(localRecordIsInvalid("视频状态：正常"), false);
  assert.equal(localRecordIsInvalid("视频状态：已失效视频"), true);
  assert.equal(localRecordIsInvalid("视频状态：已失效视频（已尝试恢复）"), true);
  assert.equal(localRecordIsInvalid("没有这一行"), false, "读不到状态时按正常处理，不要误报成失效");
  assert.equal(localRecordIsInvalid(null), false);

  assert.equal(localRecordTitle("视频标题：示例"), "示例");
  assert.equal(localRecordTitle("视频标题："), "");
  assert.equal(localRecordTitle(null), "");

  const records = new Map([
    ["bvid:BV1", { directory: "d1", text: "视频标题：甲\n视频状态：正常" }],
    ["aid:1", { directory: "d1", text: "视频标题：甲\n视频状态：正常" }],
    ["bvid:BV2", { directory: "d2", text: "视频标题：乙\n视频状态：已失效视频" }]
  ]);
  const grouped = groupLocalImportRecords({ records });
  assert.equal(grouped.length, 2, "同一个目录的两个键要并成一条");
  assert.deepEqual(grouped.map((x) => x.directory).sort(), ["d1", "d2"]);
  assert.equal(grouped.find((x) => x.directory === "d2").invalid, true);
  assert.equal(grouped.find((x) => x.directory === "d2").title, "乙");
  assert.deepEqual(groupLocalImportRecords(null), []);
});

test("同步差异报告的正文包含该有的段落", () => {
  const { buildDiffReportText } = loadBackgroundFunctions(["buildDiffReportText"], ["ERROR_REPORT_NOTICE"]);
  const diff = {
    folderTitle: "测试收藏夹", collectionName: "测试收藏夹", collectionExists: true,
    remoteTotal: 10, remoteFetched: 9, localTotal: 8, incomplete: true, failedPages: 1,
    added: [{ bvid: "BV1", title: "新增的", invalid: false }],
    removed: [{ directory: "d1", title: "没了" }],
    newlyInvalid: [{ directory: "d2", title: "刚失效", bvid: "BV2" }],
    recovered: [], unchanged: 5
  };
  const text = buildDiffReportText([diff], "2026-10-10 12:00:00");

  assert.ok(text.includes("B站收藏夹同步差异报告"));
  assert.ok(text.includes("2026-10-10 12:00:00"));
  assert.ok(text.includes("收藏夹：测试收藏夹"));
  assert.ok(text.includes("新增的"));
  assert.ok(text.includes("没了"));
  assert.ok(text.includes("刚失效"));
  assert.ok(text.includes("本次读取可能不完整"), "页面失败时必须说明结果可能不全");
  assert.ok(text.includes("占位空槽"), "要解释清楚空槽不会被算成差异");
  assert.equal(text.includes("【已恢复"), false, "空的分类不打印标题");
});

test("同步差异：接口自报条数与实际读到不符时，报告要解释差额", () => {
  const { buildDiffReportText } = loadBackgroundFunctions(["buildDiffReportText"], ["ERROR_REPORT_NOTICE"]);
  const base = {
    folderTitle: "默认收藏夹", collectionExists: false, localTotal: 0,
    added: [], removed: [], newlyInvalid: [], recovered: [], unchanged: 0
  };
  // 1204 自报、1120 实际 —— 差额是 B 站的占位空槽，不是读取失败。
  // 4.9.1 就因为没区分这两者，凭空报出过"失败：25"。
  const read = buildDiffReportText(
    [{ ...base, remoteTotal: 1204, remoteFetched: 1120, incomplete: false, failedPages: 0 }], "t");
  assert.ok(read.includes("1204"), "要写出接口自报的总数");
  assert.ok(read.includes("1120"), "要写出实际读到的条数");
  assert.ok(read.includes("占位空槽"), "要说明差额是占位空槽，不是读取失败");
  assert.ok(read.includes("不是读取失败"), "要明确排除读取失败这个可能");
  // 本地没有同名收藏夹时要说清楚，否则"新增 1120"看不出所以然
  assert.ok(read.includes("本地没有同名收藏夹"));

  // 反过来：真的没读全时，不能拿"占位空槽"糊弄过去
  const short = buildDiffReportText(
    [{ ...base, remoteTotal: 1204, remoteFetched: 500, incomplete: true, failedPages: 3 }], "t");
  assert.ok(short.includes("可能不完整"), "没读全时必须说结果可能不全");
  assert.ok(short.includes("3 页失败"), "要写出失败了多少页");
});

test("同步差异：四项都是 0 时给出明确结论，而不是一片空白", () => {
  const { buildDiffReportText } = loadBackgroundFunctions(["buildDiffReportText"], ["ERROR_REPORT_NOTICE"]);
  const text = buildDiffReportText([{
    folderTitle: "一致的", collectionExists: true, remoteTotal: 3, remoteFetched: 3,
    localTotal: 3, incomplete: false, failedPages: 0,
    added: [], removed: [], newlyInvalid: [], recovered: [], unchanged: 3
  }], "t");
  assert.ok(text.includes("完全一致"));
});

test("同步差异绝不抓详情（否则就从 2 分钟变成 39 分钟）", () => {
  const source = readProjectFile("background.js");
  const start = source.indexOf("async function fetchFavoriteListOnly");
  const end = source.indexOf("async function diffBiliFavorites");
  assert.ok(start > 0 && end > start, "找不到差异引擎那一段");
  const block = source.slice(start, end);
  assert.equal(/fetchVideoDetail|fetchImportDetails|enrichImportedInvalidVideos/.test(block), false,
    "差异引擎里出现了详情请求 —— 那会让它从 1~2 分钟变成 39 分钟");
  for (const file of ["library.js", "background.js"]) {
    assert.match(readProjectFile(file), /"002同步报告"/, `${file} 里没有 002同步报告`);
  }
});

/* ------------------------- archive-core 的真执行单元测试 -------------------------

   上面这一整个文件都是「读文件 + 正则断言」——它证明的是「源码里有没有这行字」，
   证明不了「函数真的能跑」。这里把 test/archive-core.test.cjs 并进来补那一半：
   那个文件 require 了 archive-core.js 并真的调用它的 20 个纯函数。

   这样 `node test/stability.test.cjs` 一条命令就能跑全部。
   也可以单独跑：`node test/archive-core.test.cjs`（会打印自己的进度条）。 */

test("archive-core 的纯函数在真执行下全部通过", () => {
  const { results } = require("./archive-core.test.cjs");
  assert.ok(results.passed > 0, "单元测试一项都没跑起来，检查 require 路径");
  assert.equal(
    results.failed,
    0,
    `${results.failed} 项失败：\n` +
      results.failures.map((f) => `  - ${f.name}\n      ${f.error.message.split("\n")[0]}`).join("\n")
  );
});

test("标记为已下载成功后，不许再抛错把成功提示覆盖成失败（静态回归）", () => {
  const library = readProjectFile("library.js");

  // 曾经的写法是 if (currentDetailVideo && ...) —— 那个变量从未声明过。
  // 它抛 ReferenceError 的位置在 markVideoDownloaded 成功之后、又被同一个 catch 接住，
  // 于是「文件夹都建好了」却弹出「标记失败」。这条断言专盯这个回退。
  assert.doesNotMatch(
    library,
    /if \(currentDetailVideo/,
    "currentDetailVideo 从未声明过，用它会抛 ReferenceError 并被 catch 误报成失败"
  );
  // 详情重画必须走 detailVideo()（按 detailContent.dataset.videoId 查当前打开的那条）
  assert.match(library, /function detailVideo\(\) \{/);
  assert.match(library, /const openDetailVideo = detailVideo\(\);/);
  assert.match(
    library,
    /if \(openDetailVideo && openDetailVideo\.id === markDownloadedVideo\.id\) openDetail\(markDownloadedVideo\);/,
    "标记成功后重画详情，要按「当前打开的是不是这条」判断"
  );

  // 真跑一遍那个判断：三种情况都要对
  const findOpen = (videos, videoId) => videos.find((v) => v.id === videoId) || null;
  const marked = { id: "a", title: "x" };
  assert.equal(findOpen([marked], "a")?.id, "a", "详情正开着这条时应当重画");
  assert.equal(findOpen([{ id: "b" }], "a"), null, "详情开的是别的视频时不该重画");
  assert.equal(findOpen([], "a"), null, "详情没开时不该重画");
});

test("弹窗和收藏库对同一个根目录用同一套叫法（静态回归）", () => {
  const popupHtml = readProjectFile("popup.html");
  const popupJs = readProjectFile("popup.js");
  const libraryHtml = readProjectFile("library.html");
  const background = readProjectFile("background.js");

  // 代码里只有一个根目录：同一个 IndexedDB 库、同一个表、同一个键 rootHandle。
  // 以前弹窗叫它「本地保存位置」、收藏库叫它「收藏根目录」，用户以为是两个地方，
  // 于是在收藏库里选的目录被当成"另一处"，实际把弹窗那次选择覆盖了。
  for (const file of ["popup.js", "library.js", "background.js"]) {
    const src = readProjectFile(file);
    assert.match(src, /const DB_NAME = "bili-fav-archiver";/, `${file} 应当用同一个 IndexedDB`);
    assert.match(src, /const DB_STORE = "settings";/, `${file} 应当用同一个 store`);
  }
  assert.match(readProjectFile("library.js"), /put\(handle, "rootHandle"\)/);
  assert.match(background, /\.get\("rootHandle"\)/);

  // 弹窗那一格必须和收藏库叫同一个名字
  assert.match(libraryHtml, /data-i18n="选择本地备份文件夹"/, "收藏库的按钮文案是基准");
  assert.match(popupHtml, /data-i18n="本地备份文件夹"/);
  assert.match(popupHtml, /data-i18n="选择本地备份文件夹"/);
  assert.match(popupHtml, /data-i18n="重新授权本地备份文件夹"/);
  assert.match(popupJs, /BcaI18n\.t\("选择本地备份文件夹"\)/);
  assert.match(popupJs, /BcaI18n\.t\("重新授权本地备份文件夹"\)/);

  // 旧叫法不许回来
  assert.doesNotMatch(popupHtml, /本地保存位置/, "「本地保存位置」是旧叫法，会让人以为是另一处目录");
  assert.doesNotMatch(popupHtml, /选择保存文件夹/, "「选择保存文件夹」是旧叫法");
  assert.doesNotMatch(popupJs, /重新授权保存位置/);
  assert.doesNotMatch(background, /“重新授权保存位置”/, "报错里让用户点的按钮名必须和界面一致");
  // V1.2.0 起统一叫「本地备份文件夹」；「本地收藏根目录 / 收藏根目录」是上一轮的旧叫法
  for (const file of ["popup.html", "popup.js", "library.html", "library.js", "background.js"]) {
    assert.doesNotMatch(
      readProjectFile(file),
      /收藏根目录/,
      `${file} 里不该再有「收藏根目录」这个旧叫法`
    );
  }

  // 必须明说和收藏库是同一个位置，否则光改名还是会有歧义
  assert.match(
    popupHtml,
    /和收藏库右上角「选择本地备份文件夹」是同一个位置/,
    "弹窗要写清这里选的就是收藏库那个按钮，且位置（顶栏右侧）要说对"
  );
});

// ───────── V1.2.0 全库审计修掉的东西，下面这些盯着它们别退回去 ─────────

test("content.js 认 B 站界面文字时，简体和繁體都要认（静态回归）", () => {
  const src = readProjectFile("content.js");

  // 这里认的是 B 站自己的界面文字，不是扩展的界面语言。B 站可以切成繁體，
  // 只认简体会让「点收藏自动归档」静默失效：收藏成功了，归档却没触发，
  // 界面上一点提示都没有。规则是只放宽、不收窄 —— 认不出来的后果是漏判。
  assert.match(src, /const FAV_DIALOG_TITLE = \/添加到收藏\[夹夾\]\//);
  assert.match(src, /const CONFIRM_TEXT = \/\^\[确確\]定\$\//);
  assert.match(src, /仅自己可见\|僅自己可見/, "可见性标签要认繁體");
  assert.match(src, /所有人可见\|所有人可見/, "可见性标签要认繁體");
  assert.match(src, /编辑\|編輯\|删除\|刪除/, "行尾的「编辑 / 删除」要认繁體");

  // 不许退回只认简体那一版
  assert.doesNotMatch(src, /text\.includes\("添加到收藏夹"\)/);
  assert.doesNotMatch(src, /text === "确定"/);
  assert.doesNotMatch(src, /\[\(\?:私密\|公开\|仅自己可见\|所有人可见\)\]/);
});

test("扩展补上了静态图标，四个尺寸的文件都在（静态回归）", () => {
  const manifest = JSON.parse(readProjectFile("manifest.json"));
  const expected = { 16: "icon-16.png", 32: "icon-32.png", 48: "icon-48.png", 128: "icon-128.png" };

  // 没有 icons 时，chrome://extensions 和安装提示里显示的是 Chrome 的默认拼图图标。
  assert.deepEqual(manifest.icons, expected, "manifest.icons 要补齐四个尺寸");
  assert.deepEqual(manifest.action.default_icon, expected, "工具栏也要有一份静态默认图标");

  // 工具栏图标平时是 background.js 用 OffscreenCanvas 画出来的（开启蓝、关闭灰），
  // 静态图标只服务于「扩展管理页 / 安装时」那一下。文件必须真的存在、真的能解码，
  // 否则 Chrome 会直接拒绝加载整个扩展。
  for (const [size, file] of Object.entries(expected)) {
    const buf = fs.readFileSync(path.join(projectRoot, file));
    assert.equal(buf.subarray(1, 4).toString("ascii"), "PNG", `${file} 不是 PNG`);
    assert.equal(buf.readUInt32BE(16), Number(size), `${file} 的宽度应当是 ${size}`);
    assert.equal(buf.readUInt32BE(20), Number(size), `${file} 的高度应当是 ${size}`);
  }
});

test("删掉的零使用样式不许回来，还在用的也不许跟着删（静态回归）", () => {
  const theme = readProjectFile("theme.css");
  assert.doesNotMatch(theme, /\.sr-only\s*\{/, ".sr-only 全仓库零使用，V1.2.0 删了");
  assert.doesNotMatch(theme, /\.stack\s*\{/, ".stack 全仓库零使用，V1.2.0 删了");
  // 同一个「通用工具类」块里的这两个是真的在用，别顺手一起删
  assert.match(theme, /\.row\s*\{/);
  assert.match(theme, /\.spacer\s*\{/);

  // .button-download 唯一的使用者是批量工具条的 #downloadSelected（class="button button-download"）。
  // 1.3.0 删掉下载功能后，仓库里已经没有任何元素再用这个类 —— 它就成了一条零使用的死规则，
  // 样式必须跟着功能一起走，不然就是"功能删了、残骸还在"。
  for (const cssFile of fs.readdirSync(projectRoot).filter((name) => name.endsWith(".css"))) {
    assert.doesNotMatch(
      readProjectFile(cssFile),
      /\.button-download\b/,
      cssFile + " 里还留着没人用的 .button-download"
    );
  }
});

test("文档里的测试项数和真实数量一致（静态回归）", () => {
  const real = (readProjectFile("test/stability.test.cjs").match(/^test\(/gm) || []).length;

  // 这三处以前各写各的（141 / 141 / 127），实际早就涨上去了 —— 和 README 版本历史
  // 是同一类问题：数字写死在文档里就一定会过期。release.ps1 也用同一套标记核对。
  for (const doc of ["SMOKE_TEST.md", "README.md", "AI_HANDOFF.md"]) {
    const markers = [...readProjectFile(doc).matchAll(/<!--\s*test-count:(\d+)\s*-->/g)].map((m) => Number(m[1]));
    assert.ok(markers.length > 0, `${doc} 里要有 <!-- test-count:N --> 标记（渲染时看不见）`);
    for (const n of markers) assert.equal(n, real, `${doc} 写的是 ${n} 项，实际是 ${real} 项`);
  }
});

test("公开仓库里不留本机真实路径和真实规模（静态回归）", () => {
  // 仓库是公开的：作者的下载目录、真实收藏夹条数都不该出现在示例和注释里
  assert.doesNotMatch(
    readProjectFile("install-native-folder-opener.ps1"),
    /D:\\本地收藏夹/,
    "安装脚本的示例路径不能是作者本机的真实目录"
  );
  assert.doesNotMatch(readProjectFile("SMOKE_TEST.md"), /2799/, "冒烟清单别引用真实收藏夹的条数");
});

test("弹窗里关于默认档位的注释和实际默认值一致（静态回归）", () => {
  const html = readProjectFile("popup.html");
  const lower = html.match(/<button[^>]*data-speed-value="lower"[^>]*>/)?.[0] || "";
  assert.match(lower, /aria-pressed="true"/, "默认档位是「较低」");
  assert.doesNotMatch(html, /默认「标准」/, "注释不能还写着默认「标准」（V1.1.20 起默认就是较低）");
});

test("改收藏夹归属时，新旧两种磁盘标签都要认（静态回归）", () => {
  // 视频信息.txt 里那一行记录「这条视频属于哪个 B 站收藏夹」。字段名以前叫
  // 「保存文件夹：」，和用户选的根目录撞名 —— 同一个词指两个完全不同的东西，
  // V1.2.0 起写入方改成「所属收藏夹：」。改写方必须同时认两种标签：只认旧标签
  // 的话，新文件匹配不到，updated === text 直接 return，改了归属却什么都没发生，
  // 而且不报错。
  const library = readProjectFile("library.js");
  assert.match(
    library,
    /const updated = text\.replace\(\/\^\(\?:保存文件夹\|所属收藏夹\)\[：:\]\.\*\$\/m, `所属收藏夹：\$\{folderName\}`\)/,
    "改写方要同时认新旧标签，并且写回新标签（顺手迁移老文件）"
  );
  assert.match(
    readProjectFile("background.js"),
    /所属收藏夹：\$\{infoLineValue\(folderName\)\}/,
    "background.js 的 buildInfo 是唯一的写入方，要用新标签（1.7.11 起值还要过单行净化）"
  );
  // 不许退回只认旧标签
  assert.doesNotMatch(library, /\/\^保存文件夹\[：:\]\.\*\$\/m/);
});

test("互动数据的六键与六个标签全仓只有一份（V1.7.8）", () => {
  // 这三个文件以前各抄一份字面量、用了四个不同的名字（library.js 的 STAT_FIELDS /
  // STAT_LABEL_KEYS、background.js 的 IMPORT_STAT_KEYS / STAT_KEYS），改一处口径要改
  // 四处，漏一处就是「详情卡片显示的数值和归档文件里写的不一致」。
  // 现在出处只有一个：archive-core.js 的冻结 api，library.js 直接引用。
  // background.js 是 ES module、import 不了经典脚本，只能各留一份 —— 所以这里逐字比对。
  const core = readProjectFile("archive-core.js");
  const background = readProjectFile("background.js");
  const literal = (code, name) => {
    const found = code.match(new RegExp(`const ${name} = (\\[[^\\]]*\\]|\\{[^}]*\\});`));
    return found ? found[1].replace(/\s+/g, " ") : "";
  };
  for (const name of ["STAT_KEYS", "STAT_LABELS"]) {
    assert.ok(literal(core, name), `archive-core.js 里要有 const ${name} = …`);
    assert.equal(literal(background, name), literal(core, name),
      `background.js 的 ${name} 必须和 archive-core.js 逐字一致（SW import 不了经典脚本，只能靠这条断言守着）`);
  }
  const library = readProjectFile("library.js");
  assert.match(library, /const STAT_KEYS = BcaArchiveCore\.STAT_KEYS;/);
  assert.match(library, /const STAT_LABELS = BcaArchiveCore\.STAT_LABELS;/);
  // 四个旧名字在**代码**里一个都不许再有（注释里写历史沿革不算）
  const withoutComments = (text) => text.split("\n").filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line)).join("\n");
  for (const gone of ["STAT_FIELDS", "STAT_LABEL_KEYS", "IMPORT_STAT_KEYS", "IMPORT_STAT_LABELS"]) {
    for (const [file, text] of [["library.js", library], ["background.js", background], ["archive-core.js", core]]) {
      assert.equal(withoutComments(text).includes(gone), false, `${file} 里不该再有 ${gone} 这个名字`);
    }
  }
});

test("判断标识符交集的两份副本必须同名同体（V1.7.8）", () => {
  // P2-9：同一个「两组 BV/av 标识符有没有交集」的函数，background.js 叫 identifiersIntersect、
  // library.js 叫 identifiersOverlap，函数体逐字相同。名字不同 → 搜索只能搜到一半、
  // 改一处漏一处。现在统一叫 identifiersOverlap，两处名字与函数体由这条断言守着。
  const body = (code) => {
    const found = code.match(/function identifiersOverlap\(left, right\) \{\r?\n([\s\S]*?)\r?\n\}/);
    return found ? found[1].replace(/\s+/g, " ").trim() : "";
  };
  const library = readProjectFile("library.js");
  const background = readProjectFile("background.js");
  assert.equal(body(library), "for (const key of right) if (left.has(key)) return true; return false;");
  assert.equal(body(background), body(library), "两份副本必须逐字一致，改一边必须同时改另一边");
  assert.equal(/identifiersIntersect/.test(library + background), false,
    "identifiersIntersect 这个旧名字应该已经统一成 identifiersOverlap");
});

test("示意图里的版本号从 manifest 现读，不许写死（静态回归）", () => {
  // 写死在 HTML 里的版本号一定会过期：V1.2.0 审计时教程第三步的示意图还停在
  // 1.1.28，落后十个版本，没有任何机制会发现它。library.html 的 sideVersion
  // 由 library.js 现读覆盖，教程这张卡片以前没有脚本管，所以才烂在那儿。
  const tutorialHtml = readProjectFile("tutorial.html");
  assert.doesNotMatch(
    tutorialHtml,
    /class="ext-ver"[^>]*>\s*\d+\.\d+\.\d+/,
    "教程示意图的版本号不许写死，交给 tutorial.js 从 manifest 现读"
  );
  assert.match(tutorialHtml, /id="tutorialVersion"/);

  const tutorialJs = readProjectFile("tutorial.js");
  assert.match(tutorialJs, /getElementById\("tutorialVersion"\)/);
  assert.match(tutorialJs, /getManifest\(\)\.version/);
});

test("完成提示弹窗不会因为两个来源抢着弹而丢掉一条（静态回归）", () => {
  const popupJs = readProjectFile("popup.js");

  // 导入完成（importDone）和差异对比完成（diffState）各自异步恢复，
  // 互不知情却都可能要弹同一个 <dialog>。原生 dialog 开着时再 showModal()
  // 会抛 InvalidStateError，而调用点都是 .catch(() => {}) —— 异常被吞，
  // 用户就永远看不到第二条提示。所以要排队。
  assert.match(popupJs, /const pendingDoneDialogs = \[\];/, "要有排队用的数组");
  assert.match(
    popupJs,
    /if \(doneDialog\.open\) \{\s*pendingDoneDialogs\.push\(\{ text, failed: Boolean\(failed\) \}\);\s*return;\s*\}/,
    "已经开着时不许再 showModal()，要排队（1.7.20 起队列里带着 failed 标记）"
  );
  assert.match(popupJs, /function showNextDoneDialog\(\)/, "要有弹出下一条的入口");
  assert.match(
    popupJs,
    /function dismissDoneDialog\(\)[\s\S]{0,900}?showNextDoneDialog\(\);/,
    "点掉「知道了」（或按 Esc）之后要接着弹排队里的下一条"
  );
  // 反向断言：不许退回"直接 showModal、不看是否已打开"的写法
  assert.doesNotMatch(
    popupJs,
    /function showDoneDialog\(text\) \{\s*doneDialogText\.textContent = text;\s*doneDialog\.showModal\(\);\s*\}/,
    "无条件的 showModal 会让第二条提示静默丢失"
  );
});

test("同一支视频躺在多个收藏夹里时，「移动或复制」要标出全部已收录的收藏夹（静态回归）", () => {
  // V1.1.20 之前这个对话框只勾「你点进来的那个收藏夹」。可同一支视频完全可能同时
  // 躺在好几个收藏夹里（每个目录下各有一份归档，BV 号相同），界面只勾了一个，
  // 用户一确认就把别处那几份也一起挪走了 —— 全程没有任何提示。
  const library = readProjectFile("library.js");

  assert.match(library, /function collectionsHoldingEveryVideo\(videos\) \{/, "要有跨收藏夹的查重函数");
  // 判据必须是「被选的视频全部都在这个收藏夹里」：单条视频时它退化成
  // 「这个收藏夹里有这支视频」，批量选 80 条时则只在真正重复的收藏夹上出现。
  // 用 some 代替 every 会让每个收藏夹都命中，满屏「已收录」等于没有信息。
  assert.ok(
    library.includes("if (wanted.every((keys) => present.some((other) => identifiersOverlap(keys, other)))) held.add(collection.name);"),
    "判据要用 every：全部被选视频都在这个收藏夹里才算「已收录」"
  );
  // 没有 BV/av 号的档案没法和别的目录比对，宁可不标也不能标错
  assert.ok(library.includes(".filter((keys) => keys.size)"), "无标识键的档案要排除在比对之外");
  assert.ok(
    library.includes("checkbox.checked = sourceCollections.has(collection.name);"),
    "只有原收藏夹默认勾选"
  );
  // 「已收录」只做提示，不许顺手把它也默认勾上：勾选在这个对话框里是「目标」的
  // 意思，而 moveVideoRecordToTargets 只在 video.collection 不在目标里时才移走
  // 那一个副本 —— 默认勾上既没效果，又会让用户以为「取消勾选 = 从那里删掉」，
  // 点了看着像干了什么其实什么都没干。
  assert.doesNotMatch(
    library,
    /checkbox\.checked = sourceCollections\.has\(collection\.name\) \|\| holdingCollections/,
    "不许把「已收录」的收藏夹默认勾上"
  );

  assert.match(library, /heldBadge\.className = "collection-source-badge collection-held-badge";/);
  assert.match(library, /heldBadge\.textContent = BcaI18n\.t\("已收录"\);/);
  // 两种徽标必须长得不一样，否则「原收藏夹」和「这里也有一份」分不开
  assert.match(readProjectFile("library.css"), /\.collection-held-badge \{[^}]*color: var\(--muted\)[^}]*\}/);
  assert.ok(
    readProjectFile("library.html").includes("它们不是这次操作的目标，内容不会被改动"),
    "说明文字要让用户知道「已收录」是什么意思、会不会被改动"
  );
});

test("标签点一下就跳去 B 站搜同类视频（静态回归）", () => {
  // 看到「哆啦A梦」这种标签，用户下一步十有八九就是想去 B 站找同类视频。
  const library = readProjectFile("library.js");
  const tagLink = '<a class="detail-tag" href="https://search.bilibili.com/all?keyword=${encodeURIComponent(tag)}" target="_blank" rel="noopener noreferrer"';
  assert.ok(library.includes(tagLink), "标签要变成指向 B 站搜索页的链接");
  // 标签是用户数据：encodeURIComponent 只保证 URL 合法，不等于 HTML 安全，
  // 显示的那一份仍然必须转义。
  assert.ok(library.includes(">${escapeHtml(tag)}</a>"), "标签文本仍要转义");
  assert.ok(tagLink.includes('rel="noopener noreferrer"'), "少了 noopener，B 站页面能反过来操作扩展页");

  // 普通链接跳转不需要 host_permissions，所以合规红线里的域名白名单不该被撑开。
  // 这条同时看住「别忘了加权限」和「别顺手加权限」两种改法。
  const manifest = JSON.parse(readProjectFile("manifest.json"));
  const hosts = manifest.host_permissions;
  assert.equal(hosts.some((host) => host.includes("search.bilibili.com")), false, "只是打开一个链接，不该新增主机权限");
  for (const host of hosts) {
    assert.ok(
      /bilibili\.com|hdslb\.com|bilivideo\.(com|cn)|akamaized\.net/.test(host),
      `主机权限超出白名单：${host}`
    );
  }

  // 链接自带下划线，会把标签胶囊的样子整个改掉
  assert.match(readProjectFile("library.css"), /a\.detail-tag \{[^}]*text-decoration: none/);
  assert.match(readProjectFile("library.css"), /a\.detail-tag:hover \{/);
});

/* ---- 顶栏不能被封面徽标盖住 ---- */
test("滚动时封面徽标不许盖住顶栏（静态回归）", () => {
  const css = readProjectFile("library.css");
  // 取一个选择器的声明块（只认第一条完全匹配的定义，对这几个类够用）
  const blockOf = (selector) => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = css.match(new RegExp(escaped + "\\s*\\{([^}]*)\\}"));
    assert.ok(match, `library.css 里找不到 ${selector} 的定义`);
    return match[1];
  };
  const zIndexOf = (selector) => {
    const match = blockOf(selector).match(/z-index:\s*(-?\d+)/);
    assert.ok(match, `${selector} 没有写 z-index`);
    return Number(match[1]);
  };

  // 这些徽标都挂在 .card-cover 上，而 .card-cover 只是 position:relative、没有
  // z-index，**不会自建层叠上下文** —— 所以它们其实是在根层叠上下文里和 .topbar
  // 比大小。z-index 相等时由 DOM 顺序决定，而卡片排在顶栏后面：一旦徽标 ≥ 顶栏，
  // 滚动时就会糊在顶栏上（V1.2.2 修的就是这个）。
  const badges = [".cover-badge", ".cover-views", ".invalid-badge", ".downloaded-badge", ".card-select"];
  const topbar = zIndexOf(".topbar");
  for (const badge of badges) {
    const badgeZ = zIndexOf(badge);
    assert.ok(topbar > badgeZ, `顶栏 z-index(${topbar}) 必须严格大于 ${badge} 的 ${badgeZ}，否则会被盖住`);
  }

  // 但也不能一路抬上去：详情遮罩是 5，打开视频详情时顶栏应该被遮罩压住，
  // 不该浮在半透明遮罩之上。
  assert.ok(topbar < zIndexOf(".detail-backdrop"), `顶栏 z-index(${topbar}) 必须低于详情遮罩`);
});

/* ---- 1.3.0：下载功能整体移除（合规 / 安全），下面这条盯着它别悄悄回来 ---- */
test("下载功能已经整体移除（V1.3.0）", () => {
  // 页面、脚本、样式三个文件是一起删的，任何一个回来都说明这次整改没做干净
  for (const file of ["download.html", "download.js", "download.css"]) {
    assert.equal(fs.existsSync(path.join(projectRoot, file)), false, file + " 应当已经从仓库删除");
  }

  // 后台的下载链路要一起走干净：WBI 签名、媒体流、字幕。留着这些标识符
  // 说明删除只做了一半，视频流域名和权限多半也会跟着回来。
  const background = readProjectFile("background.js");
  for (const token of ["bca-download", "getDownloadWbiKey", "biliDownloadApi", "bilivideo", "akamaized"]) {
    assert.equal(background.includes(token), false, "background.js 里不该再有下载链路的残留：" + token);
  }

  // 收藏库里的下载入口：打开下载界面、批量下载按钮
  const library = readProjectFile("library.js");
  for (const token of ["openDownloadInterface", "downloadSelected"]) {
    assert.equal(library.includes(token), false, "library.js 里不该再有下载入口：" + token);
  }
  assert.equal(readProjectFile("library.html").includes("downloadSelected"), false, "library.html 里不该再有批量下载按钮");

  // 不再申请视频流 CDN 的 host_permissions —— 这是「不再拉视频本体」最硬的证据
  const manifest = JSON.parse(readProjectFile("manifest.json"));
  for (const origin of manifest.host_permissions) {
    assert.equal(/bilivideo|akamaized/.test(origin), false, "manifest.json 不该再申请视频流域名：" + origin);
  }

  // 使用说明里不能再教用户点「下载视频」
  assert.equal(/下载视频/.test(readProjectFile("guide.html")), false, "guide.html 里不该再有「下载视频」按钮文案");

  // 反向兜底：下面这些词属于「把本地视频放进收藏夹」那条链路，现在仍然合法，
  // 清理下载功能时不许把它们一起删掉（更细的断言在各自的测试里）。
  assert.ok(library.includes("DOWNLOAD_MARKER_FILE"), "手动标记用的说明文件名仍然在用");
  assert.ok(readProjectFile("popup.js").includes("DOWNLOAD_FOLDER_NAME"), "000视频下载 目录名仍然在用");
  assert.ok(background.includes("ERROR_REPORT_NOTICE"), "「下载错误报告」入口保留");
  assert.ok(readProjectFile("guide.html").includes("000视频下载"), "使用说明仍然解释 000视频下载 目录");
});

test("插件和收藏库显示的备份文件夹名同源（静态回归）", () => {
  const popup = readProjectFile("popup.js");
  const library = readProjectFile("library.js");
  const background = readProjectFile("background.js");

  // 目录名只能有一个来源：IndexedDB 里那个句柄的 handle.name。
  // 曾经另存一份 baseFolderName 给弹窗显示，只有弹窗自己换目录时才更新 ——
  // 于是在收藏库里换了目录，弹窗还显示上一个名字。
  assert.match(popup, /const folderLabel = rootHandle\?\.name \|\| "";/, "弹窗的目录名要从句柄上读");
  assert.match(popup, /folderName\.textContent = folderLabel \|\| BcaI18n\.t\("尚未选择文件夹"\);/);
  assert.equal(/status\.baseFolderName/.test(popup), false, "不许再从 get-status 里读 baseFolderName");
  assert.equal(
    /chrome\.storage\.local\.set\(\{[^}]*baseFolderName/.test(popup),
    false,
    "不许再往 chrome.storage 里另存一份文件夹名"
  );
  assert.equal(/baseFolderName/.test(background), false, "后台不许再透传 baseFolderName");

  // 换目录要能通知到另一边：IndexedDB 没有跨页面变更事件，靠这个时间戳当信号。
  // 两边换目录走的都是各自的 saveXxxHandle，所以两处都必须写。
  const revisionWrite = /await chrome\.storage\.local\.set\(\{ rootHandleRevision: Date\.now\(\) \}\);/;
  assert.match(popup, revisionWrite, "弹窗换目录要发变更信号");
  assert.match(library, revisionWrite, "收藏库换目录要发变更信号");
  assert.match(popup, /if \(areaName === "local" && changes\.rootHandleRevision\) syncFolderLabelFromHandle\(\);/, "弹窗要收听信号");
  assert.match(library, /if \(changes\.rootHandleRevision\) syncRootFromStorage\(\);/, "收藏库要收听信号");

  // 收藏库这边收到信号必须避开「自己刚写的那个」：chooseAndScan 先 setBusy(true) 再
  // saveHandle，所以信号回来时 busyNow 是 true，直接返回，不会自己重扫一遍。
  assert.match(library, /let busyNow = false;/, "要记住当前是否正在扫描目录");
  assert.match(library, /function setBusy\(isBusy, busyKey = "reading"\) \{\s*busyNow = isBusy;/, "setBusy 要同步 busyNow");
  assert.match(library, /async function syncRootFromStorage\(\) \{\s*if \(busyNow\) return;/, "正在忙时不要跟着信号跑");
  // 名字没变就直接返回：保存句柄本身也会写信号，不能每次都被它带着白扫一遍
  assert.match(library, /if \(handle\.name === rootHandle\.name\) return;/, "名字没变就别动");

  // 弹窗那边只更新名字这一行，不整页重刷状态（导入进度、上次结果不该被一次改名重置）
  assert.match(popup, /async function syncFolderLabelFromHandle\(\)/);
  assert.match(
    popup,
    /async function syncFolderLabelFromHandle\(\) \{[\s\S]*?folderName\.textContent = label \|\| BcaI18n\.t\("尚未选择文件夹"\);[\s\S]*?\n\}/,
    "同步函数只改名字"
  );

  // 换目录后不自动重扫，只提示用户点「刷新」
  assert.match(library, /备份文件夹已改为“\{name\}”，点右上角“刷新”重新读取。/);
});

test("导入占位：一轮导入不会把自己判成「已经有一轮在进行」（真跑一遍控制流）", async () => {
  const background = readProjectFile("background.js");

  // 这次线上出问题的地方全在「谁先谁后」上：调用方（消息处理器）在同步代码里先给
  // 「排队中」记账，任务出队时再用 claimImportRun 置位。账记晚了挡不住连点；
  // 账记久了（一直记到任务结束）就会自己挡自己 —— 表现是「一导入就提示已经有一轮导入
  // 正在进行」，而对比差异、下载这些不走这条队列的链路完全正常。
  // 用正则只能钉住写法；这几段控制流能抠出来跑，就直接跑一遍，钉住行为。
  const sliceBlock = (text, from) => {
    let depth = 0;
    let i = text.indexOf("{", from);
    for (; i < text.length; i += 1) {
      if (text[i] === "{") depth += 1;
      else if (text[i] === "}") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    return text.slice(from, i + 1);
  };
  const grabFunction = (name) => {
    const start = background.indexOf(`function ${name}(`);
    assert.notEqual(start, -1, `background.js 里找不到 ${name}`);
    return sliceBlock(background, start);
  };

  // 被 claim 挡住就不往下走的那两行，照抄真实代码，免得测试里手写一份「等价逻辑」。
  const claimUse = background.match(/const run = claimImportRun\(\);\s*\n\s*if \(!run\) throw new Error\("[^"]+"\);/);
  assert.ok(claimUse, "找不到 claimImportRun 的用法");

  const branchStart = background.indexOf('if (message?.type === "import-bili-favorites") {');
  assert.notEqual(branchStart, -1, "找不到 import-bili-favorites 分支");
  const branch = sliceBlock(background, branchStart);

  // 静态：先查「有排队或有在跑」，再记账，最后才入队。三行的顺序不能换。
  const guardAt = branch.search(/\n\s*if \(importPending > 0 \|\| importRun\.active\) \{/);
  const addAt = branch.search(/\n\s*importPending \+= 1;/);
  const enqueueAt = branch.search(/\n\s*importBiliFavoritesInOrder\(/);
  assert.ok(guardAt !== -1, "第二次点击要先查队列和在跑的那一轮");
  assert.ok(guardAt < addAt && addAt < enqueueAt, "顺序必须是：先查 → 再记账 → 再入队");

  // 出队时就要把那笔账放掉：记到任务结束的话，任务自己会看到它。
  assert.match(
    background,
    /const task = saveQueue\.then\(\(\) => \{\s*importPending = Math\.max\(0, importPending - 1\);\s*return importBiliFavorites\(data, tabId\);\s*\}\);/,
    "出队时就要放掉自己那笔账"
  );
  assert.equal(/task\.finally\(/.test(grabFunction("importBiliFavoritesInOrder")), false, "不许再记到任务结束");

  const makeHarness = () => new Function("sender", "chrome", "logError", `
    let importRun = { active: false, paused: false, cancelled: false, waiters: [] };
    let importPending = 0;
    let saveQueue = Promise.resolve();
    let hold = null;
    ${grabFunction("notifyImportOutcome")}
    ${grabFunction("claimImportRun")}
    ${grabFunction("importBiliFavoritesInOrder")}
    function importBiliFavorites() {
      ${claimUse[0]}
      const finish = () => { importRun.active = false; return { ok: true, imported: 1 }; };
      return hold ? hold.then(finish) : finish();
    }
    function handle(msg) {
      const message = msg;
      let settle;
      const sent = new Promise((resolve) => { settle = resolve; });
      const sendResponse = (value) => settle(value);
      const handled = (() => { ${branch} return false; })();
      return handled ? sent : Promise.resolve(null);
    }
    return {
      handle,
      pending: () => importPending,
      active: () => importRun.active,
      holdNext() { let release; hold = new Promise((resolve) => { release = resolve; }); return () => release(); }
    };
  `)({ tab: { id: 1 } }, { storage: { local: { set: async () => {} } } }, async () => ({ reportPath: "" }));

  // 一次普通的导入：以前这里会被自己挡下，回一句「已经有一轮导入正在进行」。
  const h = makeHarness();
  const first = await h.handle({ type: "import-bili-favorites", folderIds: ["4088934635"] });
  assert.equal(first?.ok, true, `一次普通导入不该被拒绝（实际回了 ${JSON.stringify(first)}）`);
  assert.equal(h.pending(), 0, "跑完之后「排队中」要归零");
  assert.equal(h.active(), false, "跑完之后占位要放掉");

  // 连点第二次：第一轮还停在中途时再点一次必须被挡掉，而且不能把第一轮带崩。
  const slow = makeHarness();
  const release = slow.holdNext();
  const running = slow.handle({ type: "import-bili-favorites", folderIds: ["4088934635"] });
  const refused = await slow.handle({ type: "import-bili-favorites", folderIds: ["4088934635"] });
  assert.equal(refused?.ok, false, "连点第二次要被挡掉");
  assert.match(refused?.message || "", /已经有一轮导入正在进行/, "拒绝的话要说清原因");
  release();
  assert.equal((await running)?.ok, true, "第一轮不能被第二次点击带崩");
  assert.equal(slow.pending(), 0, "被拒的那一次不该留下没放掉的账");
  assert.equal(slow.active(), false, "跑完之后占位要放掉");
});

test("导入流程的 root 句柄要在函数作用域里声明，不能锁进 try 块（静态回归）", () => {
  const background = readProjectFile("background.js");

  // V1.2.0 把「取根目录 → 查授权 → 查勾选」几步包进 try 之后，`const root` 也跟着落进了
  // 块作用域 —— try 一结束 root 就没了。导入走到「建收藏夹目录」那一步直接
  // ReferenceError: root is not defined。**语法完全没问题，`node --check` 查不出来**，
  // 只有真跑到那一行才炸；而且它一直被前面那个「导入占位」的 bug 挡在门口，没能暴露。
  // 判据就一条：root 声明在函数作用域、只在 try 里赋值、这一段不许再出现块内的 const root。
  const marker = background.indexOf("async function importBiliFavorites(");
  assert.notEqual(marker, -1, "background.js 里找不到 importBiliFavorites");
  const headEnd = background.indexOf("const importRun = run;", marker);
  assert.notEqual(headEnd, -1, "找不到 importBiliFavorites 里那段 try/catch 的收尾");
  const head = background.slice(marker, headEnd);

  assert.match(head, /let root;/, "root 要在函数作用域里先声明");
  // 函数开头还有个 try（读插件版本号那个小函数），所以不能拿整个 head 里的第一个 try 比，
  // 要拿「赋值那一行前面最近的那个 try」比。
  const declareAt = head.indexOf("let root;");
  const assignAt = head.indexOf("root = await getRootHandle();");
  const tryAt = head.lastIndexOf("try {", assignAt);
  assert.ok(declareAt < assignAt, "先声明、再在 try 里赋值");
  assert.ok(declareAt < tryAt, "声明要在那个 try 之前，不能锁进块里");
  assert.match(head, /^\s*root = await getRootHandle\(\);/m, "在 try 里只赋值，不要再声明一次");
  // 只认「行首（允许缩进）的 const root」—— 上面那段注释里也写着这几个字，不能连注释一起算。
  assert.equal(/^\s*const root\b/m.test(head), false, "这一段里不许再出现块内的 const root");

  // 后面整条流程都靠这个 root 干活：挑两处 try 之外的用法当哨兵。
  assert.match(background, /collection = await root\.getDirectoryHandle\(collectionName\);/);
  assert.match(background, /const result = await saveImportedItem\(root, folder, item, journal\);/);
});

test("重复导入不该给内容没变的记录刷新时间戳、也不该报成更新（V1.2.8）", () => {
  const background = readProjectFile("background.js");
  const { importStableInfoText } = loadBackgroundFunctions(["importStableInfoText"]);

  // 就是用户那份归档里的样子：简介是「未知」（B 站这条没有简介）
  const file = [
    "【基本信息】",
    "视频收藏时间：2026年10月08日 23时07分46秒.000",
    "信息保存于：2026-10-11 21:11:18",
    "视频标题：2025年【哆啦A梦新番】 第十九季 全集",
    "",
    "【互动数据】",
    "播放量：37495",
    "",
    "【视频简介】",
    "未知"
  ].join("\n");

  // 只有「信息保存于」不同 —— 这正是重复导入时发生的事：buildInfo 每次都用新的 savedAt。
  // 以前这里直接比原文，于是文件永远"变了"：每导入一次就重写一遍、还报一次「更新 N」。
  const restamped = file.replace("信息保存于：2026-10-11 21:11:18", "信息保存于：2026-10-12 00:30:00");
  assert.equal(importStableInfoText(restamped), importStableInfoText(file), "只有时间戳不同，不该算内容变了");
  assert.notEqual(restamped, file, "（前提）原文确实不同，所以旧写法会判成变了");

  // 真的变了还是要认出来，否则"以后再补"的能力就没了
  assert.notEqual(importStableInfoText(file.replace("未知", "真正的简介")), importStableInfoText(file), "简介补上了要算变化");
  assert.notEqual(importStableInfoText(file.replace("播放量：37495", "播放量：40000")), importStableInfoText(file), "播放量涨了要算变化");

  // 接线：refreshImportedRecord 必须拿归一化后的文本比，不能直接比带时间戳的原文
  const refreshAt = background.indexOf("async function refreshImportedRecord(");
  assert.notEqual(refreshAt, -1, "background.js 里找不到 refreshImportedRecord");
  const refreshBody = background.slice(refreshAt, background.indexOf("\n}", refreshAt));
  assert.match(refreshBody, /if \(importStableInfoText\(refreshedText\) !== importStableInfoText\(original\)\) \{/);
  assert.equal(/if \(refreshedText !== original\)/.test(refreshBody), false, "不要再拿带时间戳的原文直接比");
});

// V1.3.1：切界面语言会把早就关掉的详情页重新弹回来。
// 根因：closeDetail() 不会清 detailContent.dataset.videoId，而 detailVideo() 只认那个 id，
// 于是任何「重画一遍界面」的动作（BcaI18n.onChange → relabelAfterLocaleChange）都会
// 拿到上一条视频并重新 openDetail。修法是让 detailVideo() 在面板关着时一律返回 null。
// 在收藏库页里切语言、和在弹窗里切语言（弹窗写 storage，收藏库的 onChanged 收到信号）都会触发。
test("详情关掉之后就不算「正在看这条」，切语言不会再把它弹回来（V1.3.1）", () => {
  const library = readProjectFile("library.js");

  const at = library.indexOf("function detailVideo() {");
  assert.notEqual(at, -1, "library.js 里找不到 detailVideo");
  const source = library.slice(at, library.indexOf("\n}", at) + 2);

  // 真的把生产代码里那份 detailVideo() 拿出来跑，而不是只做文本断言
  const videos = [{ id: "BV1", title: "甲" }, { id: "BV2", title: "乙" }];
  const build = (panelOpen) => {
    const detailPanel = { classList: { contains: (name) => name === "open" && panelOpen } };
    const detailContent = { dataset: { videoId: "BV2" } };
    const allVideos = () => videos;
    return new Function("detailPanel", "detailContent", "allVideos", `${source};\nreturn detailVideo;`)(
      detailPanel,
      detailContent,
      allVideos
    );
  };

  assert.equal(build(true)()?.id, "BV2", "面板开着时要按 dataset.videoId 找到那一条");
  assert.equal(
    build(false)(),
    null,
    "面板关着时 dataset.videoId 还留着上一条，也必须算「没在看任何详情」"
  );

  // 接线：切语言后要不要重开详情，必须以 detailVideo() 为准
  assert.ok(library.includes("const current = detailVideo();"), "relabelAfterLocaleChange 的判据要用 detailVideo()");
  assert.ok(
    library.includes("if (current) openDetail(current, null, { trap: false });"),
    "只有真的还在看详情时才重开，且不要再叠一层焦点陷阱"
  );

  /* 弹窗里切语言走的是 chrome.storage → 收藏库 onChanged 这条转发。
     这条一旦丢了，用户会看到「在弹窗切了语言，收藏库毫无反应」。 */
  assert.match(
    library,
    /const next = changes\[BcaI18n\.STORAGE_KEY\]\?\.newValue;/,
    "收藏库要在 onChanged 里读语言设置的新值"
  );
  assert.match(
    library,
    /BcaI18n\.use\(next, \{ silent: true \}\)/,
    "读到新语言后要真的切过去（silent：别让它在收藏库页再写一次 storage）"
  );
});

/* ---- 1.4.0：外观（自定义背景 + 毛玻璃），外观统一在设置页改 ---- */

test("外观多了「自定义」，底色仍按白天算（真跑一遍 theme.js）", () => {
  const theme = loadThemeModule({ stored: "custom", prefersDark: true });

  // 自定义 = data-theme="light" + data-appearance="custom"。这样原本所有按深色
  // 写的规则都不用动，弹窗也就自动是白天色 —— 不用为它单写一套「自定义」配色。
  assert.equal(theme.api.current(), "custom");
  assert.equal(theme.api.resolved(), "light", "自定义要压过系统深色，一律按白天算");
  assert.equal(theme.attributes["data-theme"], "light", "必须挂 data-theme=light，否则挡不住系统深色");
  assert.equal(theme.dataset.appearance, "custom");
  assert.equal(theme.api.modes().length, 4, "四种外观：跟随系统 / 白天 / 夜晚 / 自定义");

  // 另外三种仍是纯色：不该挂成 custom（否则会去找背景图）
  assert.equal(loadThemeModule({ stored: "dark" }).dataset.appearance, "plain");
});

test("外观的三个数值都会落到 <html> 的 CSS 变量上（真跑一遍 theme.js）", () => {
  const theme = loadThemeModule({
    stored: "custom",
    appearance: { veil: 80, blur: 24, glass: true, glassBlur: 12 }
  });

  assert.equal(theme.classes.has("bca-glass"), true, "开了毛玻璃要挂 bca-glass");
  assert.equal(theme.properties["--bca-wallpaper-blur"], "24px");
  assert.equal(theme.properties["--bca-glass-blur"], "12px");
  // 遮罩是「页面底色的雾」，不是黑幕：黑幕会把整页拖进深色，后面的白卡片看着
  // 就是浮起来的。颜色改由 theme.css 的 --bca-veil-rgb 按主题给（浅色浅雾、
  // 夜晚深雾），这里只填 alpha —— 写死浅色的话夜晚主题会白蒙蒙一层（V1.7.19）。
  assert.equal(theme.properties["--bca-wallpaper-veil"], "rgba(var(--bca-veil-rgb), 0.736)");

  // 关掉毛玻璃要把类名摘掉，不能只靠「不再写变量」——类名留着，卡片还是半透明
  theme.api.setAppearance({ glass: false });
  assert.equal(theme.classes.has("bca-glass"), false);

  // 设置页的滑块靠这条通知回填，不用自己去读 localStorage
  let seen = null;
  theme.api.onAppearanceChange((next) => { seen = next.veil; });
  theme.api.setAppearance({ veil: 20 });
  assert.equal(seen, 20, "改外观要通知订阅者");
});

// ---- V1.7.19（残留 P1 三条：统计镜像 / 可信点击 / 深色雾）----

test("交给调用方的空库必须先过统计镜像，四条出口一条都不许漏（V1.7.19）", () => {
  const bg = readProjectFile("background.js");
  // 直接 assert.doesNotMatch：只要有人把 result(BcaStatsCore.emptyDatabase()) 写回来就红
  assert.doesNotMatch(bg, /result\(BcaStatsCore\.emptyDatabase\(\)/,
    "空库必须先过 applyStatsMirror 再交给调用方，不许直接塞进 result()");
  assert.equal(
    [...bg.matchAll(/applyStatsMirror\(BcaStatsCore\.emptyDatabase\(\), mirror\)/g)].length,
    4,
    "四条空库出口（读不出来 / 空文件 / 坏库没留档 / 坏库已留档）都要用镜像顶回累计值"
  );
  // 全新安装时镜像还不存在，applyStatsMirror 必须原样返回，不许凭空造数
  assert.match(bg, /function applyStatsMirror\(database, mirror\) \{\s*\n\s*if \(!mirror\) return database;/,
    "没有镜像时必须原样返回，不能凭空造数");
});

test("自动归档只认真实用户点击，合成事件不许替用户按下确认（V1.7.19）", () => {
  const content = readProjectFile("content.js");
  const at = content.indexOf('document.addEventListener("click"');
  assert.ok(at > 0, "找不到收藏确认的点击监听");
  const handler = content.slice(at, content.indexOf("}, true);", at));
  assert.match(handler, /if \(!event\.isTrusted\) return;/,
    "确认收藏的监听要先查 event.isTrusted；合成点击能骗过 700ms 去抖与签名去重");
  // 这条守卫要挡在「有没有开启归档」之前：关掉功能时也不该被合成事件唤起
  assert.ok(handler.indexOf("!event.isTrusted") < handler.indexOf("!archiveEnabled"),
    "isTrusted 要在 archiveEnabled 之前判");
  // 插件自己从来不该合成点击 —— 一旦有了，上面的检查会把自己的路也堵死
  assert.doesNotMatch(content, /\.click\(\)|dispatchEvent\(/,
    "content.js 里不许出现合成点击");
});

test("壁纸遮罩的颜色跟着主题走，theme.js 只填 alpha（V1.7.19）", () => {
  const css = readProjectFile("theme.css");
  const js = readProjectFile("theme.js");
  assert.match(css, /--bca-veil-rgb: 242, 245, 249;/, "浅色主题要给出雾的 RGB 通道");
  assert.match(css, /--bca-wallpaper-veil: rgba\(var\(--bca-veil-rgb\), 0\.46\)/,
    "兜底遮罩要用主题色，不许再写死十六进制");
  const manualDark = css.match(/:root\[data-theme="dark"\] \{([\s\S]*?)\n\}/)[1];
  const systemDark = css.match(/:root:not\(\[data-theme="light"\]\) \{([\s\S]*?)\n  \}/)[1];
  for (const [label, block] of [["手动深色", manualDark], ["跟随系统深色", systemDark]]) {
    assert.match(block, /--bca-veil-rgb: 15, 18, 22;/, `${label}块要给出深雾的 RGB 通道（= --bg）`);
  }
  assert.ok(js.includes("rgba(var(--bca-veil-rgb), "), "theme.js 只该填 alpha，颜色交给 --bca-veil-rgb");
  assert.equal(js.includes("rgba(242, 245, 249"), false, "theme.js 里不许再写死浅色雾");
});

test("外观的取值会被夹在范围内，脏数据不许穿透（真跑一遍 theme.js）", () => {
  const theme = loadThemeModule({
    stored: "custom",
    appearance: { veil: 500, blur: -20, glassBlur: 999 }
  });

  assert.equal(theme.api.appearance().veil, 100, "遮罩上限 100");
  assert.equal(theme.api.appearance().blur, 0, "模糊下限 0");
  assert.equal(theme.api.appearance().glassBlur, 20, "毛玻璃强度上限 20（与参考实现在同一量级）");
  assert.equal(theme.api.setAppearance({ glassBlur: 0 }).glassBlur, 1, "下限 1：0 等于没开，要用开关而不是把强度调到 0");
  assert.equal(theme.api.setAppearance({ glassBlur: "abc" }).glassBlur, 16, "非法值退回默认 16");

  // 外观与界面主题是两份设置、两个键：写一份不能把另一份覆盖掉
  assert.notEqual(theme.storage.values["interfaceAppearance"], undefined, "外观写进 interfaceAppearance");
  assert.equal(theme.storage.value, "custom", "写外观不该改掉界面主题");
});

test("背景图存 IndexedDB 的 Blob，不进 chrome.storage（静态回归）", () => {
  const theme = readProjectFile("theme.js");
  const css = readProjectFile("theme.css");

  // 一张手机照片动辄几 MB，chrome.storage.local 默认只有 10MB，还得跟别的设置挤
  assert.match(theme, /WALLPAPER_DB = "bili-vault-appearance"/);
  assert.match(theme, /indexedDB\.open\(WALLPAPER_DB, 1\)/);
  assert.equal(/mirrorToStorage\([^)]*[Ww]allpaper/.test(theme), false, "图片不许进 chrome.storage");
  // 1.7.10（facet-storage P2-5）：这条原来钉的是「不许有任何新权限」。加 unlimitedStorage
  // 是为了让背景图所在的 IndexedDB 不被浏览器当临时数据回收、并解开 chrome.storage.local
  // 的 10MB 硬配额。权限清单的完整白名单由 manifest 那条测试守着，这里只钉两件事：
  // 图片本身仍然不进 chrome.storage，以及存图后确实请求了持久化存储。
  assert.match(theme, /storage\.persist\(\)/, "存图后要请求持久化存储，别让浏览器把背景图当临时数据回收");

  // 存之前先压一道：长边 2560 + webp 0.92（压不动就原样存 —— 压不了不该挡住用户设背景）
  assert.match(theme, /file\.type\.startsWith\("image\/"\)/, "只接受图片");
  assert.match(theme, /const MAX_EDGE = 2560;/);
  assert.match(theme, /"image\/webp", 0\.92\)/);

  // 弹窗不铺背景图：靠 <html data-wallpaper-scope="popup"> 认出来；
  // 而且「页面让出底色」那条规则要放过它，否则弹窗只剩浏览器窗口色。
  assert.match(readProjectFile("popup.html"), /<html lang="zh-CN" data-wallpaper-scope="popup">/);
  assert.match(theme, /dataset\.wallpaperScope === "popup"/);
  assert.match(
    css,
    /html\[data-appearance="custom"\]:not\(\[data-wallpaper-scope="popup"\]\) body \{ background: transparent; \}/
  );

  // V1.4.1：换图 / 删图要能通知到已经开着的别的页面。localStorage 那条通道看不见
  // IndexedDB 里的 Blob，所以另发一个时间戳到 chrome.storage，收到就重读一次
  // （真机上报过「设置页选了背景，收藏库要手动刷新才变」）。
  assert.match(theme, /const WALLPAPER_REVISION_KEY = "interfaceWallpaperRevision";/);
  assert.match(theme, /function announceWallpaperChange\(\)/);
  assert.match(theme, /global\.chrome\?\.storage\?\.local\?\.set\(\{ \[WALLPAPER_REVISION_KEY\]: Date\.now\(\) \}\)/);
  assert.match(theme, /chrome\?\.storage\?\.onChanged\?\.addListener\(\(changes, areaName\) => \{/);
  assert.match(theme, /if \(areaName !== "local" \|\| !changes\[WALLPAPER_REVISION_KEY\]\) return;/);
  // 存图与删图两条路都要发信号，否则删掉图以后旧页面会一直挂着那张图
  const saves = theme.match(/announceWallpaperChange\(\);/g) || [];
  assert.equal(saves.length, 2, "存图与删图各发一次信号");
});

test("毛玻璃糊在哪些面上、怎么糊，都钉住（静态回归）", () => {
  const css = readProjectFile("theme.css");

  assert.match(css, /--bca-glass-blur: 16px;/, "要有兜底默认值：设置还没读完时也得能看");
  assert.match(css, /html\.bca-glass :is\(\.sidebar, \.video-card, \.detail-panel, \.batch-toolbar,/);
  assert.match(css, /backdrop-filter: blur\(var\(--bca-glass-blur\)\) saturate\(170%\)/);
  assert.match(css, /-webkit-backdrop-filter: blur\(var\(--bca-glass-blur\)\) saturate\(170%\)/, "Safari 要前缀");
  // 玻璃边缘高光：没有它，半透明卡片看着像「没画完」而不是「磨砂」
  assert.match(css, /html\.bca-glass :is\(\.video-card, \.settings-card, \.detail-panel\) \{[\s\S]{0,240}inset 0 0 12px/);
  // 四个玻璃令牌都必须从当前主题的令牌推出来：写死白色的话，夜晚主题下
  // 卡片会亮成一片、字压在亮底上看不清，边缘高光还会顶着一圈白边（theme=dark&glass=1 真跑出来过）。
  // 底色 / 高光 / 暗部从 --surface 推，描边从 --line 推，两者都是跟着主题走的令牌。
  for (const [token, base] of [["--bca-glass-surface", "--surface"], ["--bca-glass-line", "--line"],
    ["--bca-glass-glow", "--surface"], ["--bca-glass-shade", "--surface"]]) {
    const declaration = (css.match(new RegExp(`${token}: [^;]+;`)) || [""])[0];
    assert.match(declaration, /color-mix\(/, `${token} 要用 color-mix 从主题色推出来`);
    assert.ok(declaration.includes(`var(${base})`), `${token} 要跟着 ${base} 走`);
    // 取值本身如果是写死的白色（#fff / rgba(255,255,255)）就算犯规；
    // color-mix(...) 里的 #fff / #000 是允许的 —— 它们带着「往白/黑提多少」的百分比，
    // 仍然以主题色为主（--bca-glass-glow: color-mix(in srgb, var(--surface), #fff 55%)）。
    // 只钉「整段颜色就是写死值」这一种：末尾的 color-mix(...) 参数如果是不带百分比的
    // 十六进制色，说明底色被写死了，夜晚主题下会亮成一片。
    assert.equal(/(#[0-9a-f]{3,8}\s*\)|#[0-9a-f]{3,8}\s*;|rgba?\(\s*255\s*,)/i.test(declaration), false,
      `${token} 不许把颜色写死（夜晚主题下会亮成一片）`);
  }

  // 背景图那层：模糊按半径外扩。只用 transform: scale() 的话，模糊一大边缘会透出底色。
  assert.match(css, /\.bca-wallpaper::before \{[\s\S]{0,240}inset: calc\(-1 \* \(var\(--bca-wallpaper-blur\) \+ 12px\)\);/);
  assert.equal(/\.bca-wallpaper::before \{[\s\S]{0,320}transform: scale/.test(css), false, "别再用 scale 硬撑边缘");
  // 模糊只做在图这一层：遮罩层再来一次整屏 backdrop-filter，成本高得多
  assert.equal(/\.bca-wallpaper::after \{[^}]*backdrop-filter/.test(css), false, "遮罩不该再糊一次");
});

test("弹窗不再有主题滑块：外观只在设置页改（V1.4.0）", () => {
  const popupHtml = readProjectFile("popup.html");
  const popupJs = readProjectFile("popup.js");

  assert.equal(/themeButtons|renderThemeOptions/.test(popupJs), false, "弹窗不该再渲染主题选项");
  assert.equal(/data-theme-value/.test(popupHtml), false, "弹窗里不该再有主题按钮");
  assert.equal(/BcaTheme/.test(popupJs), false, "弹窗不该再碰主题");
  // 但弹窗仍要跟着主题走，也不能顺手把语言一起搬走
  assert.match(popupHtml, /<script src="theme\.js"><\/script>/, "theme.js 必须在：弹窗的配色靠它");
  assert.match(popupHtml, /data-locale="en"/, "语言仍然留在弹窗里");
});


test("上线前审查第一批：P0/P1 那几处都钉住了（V1.4.2）", () => {
  const backgroundCode = stripComments(readProjectFile("background.js"));
  const libraryCode = stripComments(readProjectFile("library.js"));
  const contentCode = stripComments(readProjectFile("content.js"));
  const libraryHtml = readProjectFile("library.html");
  const pack = readProjectFile("pack.ps1");

  // P0-1：收尾要先写"跑完了"的快照再清，否则整轮成功导入会被当成中断的那一轮
  assert.match(backgroundCode, /async function finishImportRunSnapshot\(\)/);
  assert.equal((backgroundCode.match(/await finishImportRunSnapshot\(\);/g) || []).length, 3,
    "取消 / 风控 / 成功三条收尾都要走 it");
  assert.match(backgroundCode, /if \(leftover && leftover\.active !== true\)/,
    "快照明明写着没在跑，就不能当成中断");
  assert.equal(/if \(!snapshot\?\.active\) return false;/.test(backgroundCode), false,
    "不能把「快照说没在跑」也当成中断");

  // P1-2：回滚入口整块删掉，对用户的承诺也要跟着改
  assert.equal(/rollbackInterruptedImport/.test(backgroundCode), false, "死代码入口不该还在");
  assert.equal(/bca-import-rollback-recovered/.test(backgroundCode), false);
  assert.equal(/markImportRunInterrupted|IMPORT_INTERRUPTED_SESSION_KEY/.test(backgroundCode), false);
  assert.equal(/回滚日志已保存在本次浏览器会话中/.test(backgroundCode), false, "不能再承诺一个点不到的回滚");

  // P1-1：删下载目录前先认归属，不是本插件写的就不删
  assert.match(libraryCode, /async function collectionDownloadDirectoryLooksManaged\(handle\)/);
  assert.match(libraryCode, /if \(!await collectionDownloadDirectoryLooksManaged\(handle\)\)/);
  assert.match(libraryCode, /目录里有不是本插件写入的内容，为了安全没有删除。/);
  assert.match(libraryCode, /BcaArchiveCore\.identifiersFromDirectoryName\(entry\.name\)/,
    "认归属要用带命名空间的写法，archive-core 的成员在 library.js 里没有解构出来");
  // P0-1：这条断言原来钉的是**裸调用**原文 `identifiersFromDirectoryName(entry.name).size`，
  // 于是那个 ReferenceError 被测试保护了下来（删除收藏夹 + 同时删下载文件 + 子目录 → 必抛）。
  // 除了上面那条正向断言，再加一条反向的：不许再出现不带 BcaArchiveCore. 的裸调用。
  const bareCoreCall = (name) => new RegExp(`^\\s*${name}\\(`, "m");
  for (const name of ["identifiersFromDirectoryName", "parseInfoFile", "descriptionFromInfo",
    "tagsFromInfo", "pageSequence", "safeCollectionName", "withSourceCollection", "downloadIndexKey",
    "findDownloadMatch", "downloadStateFromIndex", "isMediaFileName", "splitShareText", "parseShareStats"]) {
    assert.equal(bareCoreCall(name).test(libraryCode), false,
      `library.js 里 ${name}(…) 少了 BcaArchiveCore. 前缀，会直接抛 ReferenceError`);
  }
  // 上面这条按「行首」判定，是为了放过两处合法的同名写法：archive-core.js 里的函数**定义**，
  // 以及 library.js 顶部的**局部别名** `const pageSequence = BcaArchiveCore.pageSequence;` ——
  // 别名是赋值不是调用，所以行首不会出现 `名字(`。真正会漏掉的是嵌在表达式里的裸调用，
  // 这里再补一条不锚行首的扫描，把「前面不是点也不是标识符字符」的调用一并挡下。
  assert.equal(/(^|[^\w.$])identifiersFromDirectoryName\s*\(/m.test(
    libraryCode.split("\n").filter((line) => !/^\s*const\s/.test(line)).join("\n")), false,
    "identifiersFromDirectoryName 必须带 BcaArchiveCore. 前缀（局部别名行除外）");

  // P1-3：排队等待加上限；去重表只在真的归档成功之后才记
  assert.match(backgroundCode, /async function runInSaveQueueWithDeadline\(task, label\)/);
  assert.equal((backgroundCode.match(/runInSaveQueueWithDeadline\(/g) || []).length, 4,
    "定义 1 处 + 保存收藏 / 手动添加 / 补存三个入口各 1 处");
  assert.match(contentCode, /function rememberSeen\(signature\) \{[\s\S]{0,160}seen\.add\(signature\);/);
  assert.equal((contentCode.match(/seen\.add\(/g) || []).length, 1, "去重表只该在 rememberSeen 里写一次");
  assert.match(contentCode, /if \(seen\.has\(signature\)\) return;\r?\n\s*sendFavorite\(data, signature\);/,
    "观察器里只查重，不再先记掉");
  assert.match(contentCode, /rememberSeen\(signature\);\r?\n\s*showNotice\(BcaI18n\.t\("归档成功"\)/,
    "只有真的归档成功才记进去重表");

  // P1-4：纯本地读的两个循环也要保活
  assert.equal((backgroundCode.match(/await keepServiceWorkerAlive\("scan"\);/g) || []).length, 2);
  assert.match(backgroundCode, /await keepServiceWorkerAlive\("refresh"\);/);

  // P1-6：同名位置上是文件时不能当成致命错误（换个后缀继续试）
  assert.match(backgroundCode, /if \(error\?\.name !== "NotFoundError" && error\?\.name !== "TypeMismatchError"\) throw error;/);

  // P1-7：确认框里固定写一句"删掉不可恢复"
  assert.match(libraryHtml, /class="confirm-warning" data-i18n="本地删除不可恢复：不会进系统回收站，删掉就找不回来了。"/);

  // P1-8：风控码补全；恢复扫描撞风控要整轮停，不能继续加压
  assert.match(backgroundCode, /const IMPORT_RATE_LIMIT_CODES = new Set\(\[-412, -352, -509, -799\]\);/);
  assert.match(backgroundCode, /let rateLimitedAbort = false;/);
  assert.match(backgroundCode, /budgetExhausted \|\| rateLimitedAbort/);

  // P2-21：打包白名单脚本在，且排除清单里确实有开发文件
  for (const name of [".node-path", "test", "AI_HANDOFF.md", "README.md", "SMOKE_TEST.md", "release.ps1", "docs"]) {
    assert.ok(pack.includes(`"${name}"`), `pack.ps1 要排除 ${name}`);
  }

  // 文档：release.ps1 要拿 git tag 全量核 README（只核「这次要发的版本」漏掉过 V1.4.0 整节）
  const releaseScript = readProjectFile("release.ps1");
  assert.match(releaseScript, /Invoke-Native \$Git @\('tag'\)/, "release.ps1 要全量比对 tag 与 README 小节");
  assert.match(releaseScript, /个已打 tag 的版本小节/, "缺小节时要报出缺哪几版");

  // README：每一版都要有小节，且必须从新到旧排（V1.4.0 / V1.3.1 的标题都被误删过）
  const readme = readProjectFile("README.md");
  for (const version of ["V1.4.0", "V1.3.1"]) {
    assert.match(readme, new RegExp(`^## ${version.replace(/\./g, "\\.")}[：:]`, "m"),
      `${version} 的小节标题不能再丢`);
  }
  const sections = [...readme.matchAll(/^## V(\d+(?:\.\d+)*)[：:]/gm)].map((m) => m[1]);
  assert.ok(sections.length >= 40, `README 的「## V…」小节数不对：${sections.length}`);
  const toNumbers = (v) => v.split(".").map(Number);
  const compare = (a, b) => {
    for (let i = 0; i < 3; i += 1) {
      const x = a[i] || 0;
      const y = b[i] || 0;
      if (x !== y) return x - y;
    }
    return 0;
  };
  for (let i = 1; i < sections.length; i += 1) {
    assert.ok(compare(toNumbers(sections[i - 1]), toNumbers(sections[i])) > 0,
      `README 版本小节必须从新到旧：${sections[i - 1]} 之后出现了 ${sections[i]}`);
  }
});

test("上线前审查第二批：保留目录名、导入残影、队列文案、报告轮转、封面出网都钉住了（V1.4.3）", () => {
  const backgroundRaw = readProjectFile("background.js");
  const background = stripComments(backgroundRaw);

  // P2-3：保留目录名收成一份名单，三条链路（手动添加 / 导入 / 自动归档）都要挡
  assert.ok(background.includes("const RESERVED_COLLECTION_NAMES = new Set(["), "保留目录名应该只有一份名单");
  assert.ok((background.match(/collectionNameIsReserved\(/g) || []).length >= 4,
    "保留目录名的判断应该在定义之外至少被三个入口用到（手动添加 / 导入 / 自动归档）");
  assert.ok(!background.includes('["错误报告", "001错误报告", "002同步报告", "000视频下载"].includes(name)'),
    "手动添加不该再自己写一份名单");
  assert.ok(!background.includes('"视频下载", "000视频下载"].includes(safeSegment(folder.title))'),
    "导入不该再自己写一份名单");
  assert.ok(background.includes("const folderName = safeSegment(folder.name);"),
    "自动归档那条链路必须先把收藏夹名算出来再判保留名");
  assert.ok(background.includes("和插件自己用的目录重名，为免写乱本地文件，这次没有保存到本地。"),
    "自动归档撞保留名时要给出能看懂的失败原因");

  // P2-6：残影复位不再等时间窗口
  assert.ok(!background.includes("IMPORT_STALE_STATE_MS"), "时间窗口判据已经删掉，别引回来");
  assert.ok(background.includes("running: false, paused: false, updatedAt: Date.now() }"),
    "残影复位要就地把 running 置回 false");
  assert.ok(backgroundRaw.includes("而 session 里没有 active 快照就说明上一轮的进程已经没了"),
    "残影复位的判据要写在注释里，避免以后又被改回时间窗口");

  // P2-7：队列超时的文案不许声称「已取消」，任务其实还在队列里
  assert.ok(!background.includes("本次状态更新已取消"), "队列超时的文案不能再声称「已取消」");
  assert.ok(background.includes("这次不再等它了"), "要如实说明只是不再等待、任务仍在队列里");

  // P2-18：tabs.query 在缺 tabs 权限时拿不到 url，提示必须换成真能做到的动作
  assert.ok(!background.includes("请先打开一次自己的 B 站收藏夹页面"),
    "这条提示照做也没用（没有 tabs 权限），不许再出现");
  assert.ok(background.includes("请在 B 站收藏夹页面打开插件并开始一次导入（这一步会记住 UID）"),
    "缺 UID 的提示要指向真的能解决它的动作");

  // P2-19：两个报告目录都要有上限，别随失败次数无限堆积
  assert.ok(background.includes("const REPORT_KEEP_FILES = 50;"), "报告目录要有保留上限常量");
  assert.ok((background.match(/trimReportDirectory\(/g) || []).length >= 3,
    "trimReportDirectory 应该有 1 处定义 + 错误报告与同步报告各 1 处调用");
  assert.ok(background.includes('await trimReportDirectory(directory, REPORT_KEEP_FILES, "错误报告.txt");'));
  assert.ok(background.includes('await trimReportDirectory(directory, REPORT_KEEP_FILES, "同步差异报告.txt");'));

  // P2-15 / P2-16 / P2-17：封面出网与页面代取的兜底
  assert.ok(background.includes("const COVER_FETCH_TIMEOUT_MS = 20000;"), "封面下载必须有超时");
  assert.ok(background.includes('const COVER_HOST_SUFFIXES = [".hdslb.com"];'),
    "封面域名白名单只允许 B 站图床");
  // 1.7.11（facet-privacy P2-1）：白名单必须和 manifest 的 host_permissions 对得上。
  // 原来这里写着 `.bilibili.com`，而 manifest 只授权了 `*.hdslb.com` 与 `api.bilibili.com`，
  // 于是「代码放行、Chrome 拦截」—— 用户只看到「封面恢复不了」。这条断言把两者钉在一起，
  // 以后加域名必须两边一起改。
  const manifestHosts = JSON.parse(readProjectFile("manifest.json")).host_permissions || [];
  const coverExact = (background.match(/const COVER_EXACT_HOSTS = \[([^\]]*)\];/) || [, ""])[1]
    .split(",").map((item) => item.trim().replace(/^"|"$/g, "")).filter(Boolean);
  for (const suffix of [".hdslb.com"]) {
    assert.ok(manifestHosts.includes(`https://*${suffix}/*`),
      `封面后缀白名单 ${suffix} 必须在 manifest 的 host_permissions 里有对应授权，实际 ${JSON.stringify(manifestHosts)}`);
  }
  assert.deepEqual(coverExact, ["hdslb.com", "api.bilibili.com"],
    "精确白名单必须与 manifest 授权的 api.bilibili.com 一致");
  assert.ok(!/COVER_HOST_SUFFIXES[\s\S]{0,200}(bilivideo|akamaized)/.test(background),
    "白名单里不许出现 bilivideo / akamaized（1.3.0 已删掉的三条权限）");
  assert.ok(background.includes("const coverUrl = coverFetchUrl(normalized);"),
    "不在白名单里的封面地址要直接跳过，不许发请求");
  assert.ok(background.includes('if (!coverUrl) throw new Error("封面地址不在允许的域名里，已跳过。");'),
    "白名单不通过时必须抛错，不能继续 fetch");
  assert.ok(background.includes("await biliThrottleWait();"),
    "封面下载要与 B 站接口共用同一个限速器");
  assert.ok(background.includes("const guardMs = Math.max(1000, (Number(timeoutMs) || 15000) + 2000);"),
    "页面代取必须有后台侧兜底超时，否则关掉收藏夹标签页会卡死整轮导入");

  // P2-3 的保留目录名单在 library.js 里还有两份副本（两个页面脚本没法共享常量），
  // 这里钉住它们必须和 background.js 的完全一致 —— 防以后改一处漏一处。
  // V1.4.4 起多了一份三名字的「固定目录」名单（选完目录就建出来），所以放行两种形状。
  const libraryForNames = stripComments(readProjectFile("library.js"));
  const reservedLists = [...libraryForNames.matchAll(/\[("(?:错误报告|001错误报告|002同步报告|003database|000视频下载|视频下载)"(?:,\s*"[^"]+")*)\]/g)];
  const namesOf = (literal) => [...literal.matchAll(/"([^"]+)"/g)].map((m) => m[1]).sort();
  // 保留目录名（扫描时要跳过的一整份名单）与固定目录名（选完目录就建出来的那几个）
  // 是两种形状：1.5.0 起 003database 同时属于两者。
  const shapeReserved = ["000视频下载", "001错误报告", "002同步报告", "003database", "视频下载", "错误报告"].join("|");
  const shapeStructure = ["000视频下载", "001错误报告", "002同步报告", "003database"].join("|");
  const shapes = reservedLists.map(([literal]) => namesOf(literal).join("|"));
  assert.ok(shapes.filter((shape) => shape === shapeReserved).length >= 2,
    `library.js 里应该有两份「扫描时跳过的保留目录名」，实际 ${JSON.stringify(shapes)}`);
  assert.ok(shapes.includes(shapeStructure),
    `library.js 里应该有 V1.4.4 的固定目录名单，实际 ${JSON.stringify(shapes)}`);
  for (const shape of shapes) {
    assert.ok(shape === shapeReserved || shape === shapeStructure,
      `library.js 里的目录名名单只允许两种形状（保留目录 / 固定目录），实际 ${shape}`);
  }
});

test("上线前审查第二批（收藏库侧）：导入提示、单飞对比、风险确认与体积统计都钉住了（V1.4.3）", () => {
  const library = stripComments(readProjectFile("library.js"));
  const html = readProjectFile("library.html");

  // P2-8：导入期间只给提示，不禁用按钮、不弹对话框
  assert.ok(html.includes('id="importRunningNotice"'), "收藏库要有「导入进行中」的提示条容器");
  assert.ok(html.includes('id="importRunningText"'), "提示条要有可写的文案节点");
  assert.match(html, /id="importRunningNotice"[^>]*\bhidden\b/, "提示条默认必须是隐藏的");
  assert.ok(library.includes("changes.importState"), "要订阅 importState 才跟得上后台的导入状态");
  assert.ok(library.includes("function applyImportState("), "显不显示提示条要由一个地方统一决定");
  assert.ok(library.includes("restoreImportState()"), "打开收藏库时要先读一次当前导入状态");
  assert.ok(library.includes('BcaI18n.t("导入正在进行：这期间在收藏库里移动、删除或标记「已下载」可能与它互相影响，建议等它结束后再操作。")'),
    "导入进行中要说明它与收藏库操作的关系");
  assert.ok(library.includes('BcaI18n.t("导入已暂停：这期间在收藏库里移动、删除或标记「已下载」可能与它互相影响，建议等它结束后再操作。")'),
    "导入已暂停是另一种说法，不能和进行中共用一句");

  // P2-9：对比必须单飞，第二次点击直接丢掉
  assert.ok(library.includes("if (diffInFlight) return;"), "第二次点「与 B 站对比」要直接丢掉");
  assert.ok(library.includes("function setDiffInFlight("), "进出对比中的按钮状态要统一改");
  assert.ok(library.includes('diffConfirmGo.addEventListener("click", () => { startDiffWithBilibili(); })'),
    "「开始对比」必须走同一条单飞入口，否则连点两次会发两条请求");

  // P2-10：风险档确认的等待者恰好被结算一次
  assert.ok(library.includes("function closeDiffRisky("), "关对话框与结算等待者要合成一个出口");
  assert.ok(library.includes("closeDiffRisky(false);"), "新的确认到来前，先把上一次按「取消」结算掉");

  // P2-13：换页滚动尊重系统的「减少动态效果」
  assert.ok(library.includes('behavior: prefersReducedMotion() ? "auto" : "smooth"'),
    "换页不许无条件平滑滚动");

  // P2-14：等待后台时如实说「不再等待」，并且真的能退出等待
  assert.ok(library.includes('BcaI18n.t("不再等待")'), "等待期间的按钮文案要如实");
  assert.ok(library.includes("function abandonStatusWait("), "要有「不再等待」的出口");
  assert.ok(library.includes("if (statusWaitingForBackground) { abandonStatusWait(); return; }"),
    "「取消」与 Esc 都要走「不再等待」，不能把用户锁在模态框里");
  assert.ok(library.includes('BcaI18n.t("已不再等待：后台仍会继续处理这一批，结束后才能发起新的更新；完成后点右上角的「刷新」查看结果。")'),
    "结果文案要说清后台仍会继续写回文件");

  // P2-12：体积统计不挡首屏、能复用就复用
  assert.ok(library.includes("function whenIdle("), "体积统计要等浏览器空闲再跑");
  assert.ok(library.includes("if (document.hidden) return;"), "页面在后台时不要打盘");
  assert.ok(library.includes("const storageUsageCache = new Map();"), "体积统计要有结果缓存");
  assert.ok(library.includes("storageUsageCache.get(key)"), "档案签名没变就直接复用上次结果");
  assert.ok(library.includes("invalidateStorageUsageCache();"), "下载目录变化时要作废缓存");

  // 「与 B 站对比」的按钮禁用状态只能有一处算出来 —— 两处各自快照会在交叉时错位
  assert.ok(library.includes("function syncDiffButton("), "对比按钮的状态要统一算");
  assert.equal((library.match(/diffLibraryButton\.disabled/g) || []).length, 1,
    "diffLibraryButton.disabled 只允许在 syncDiffButton 里出现一次");
});

test("选完目录必须真的读一次，空文件夹也要建出三个固定目录（V1.4.4）", () => {
  const library = stripComments(readProjectFile("library.js"));
  const popup = stripComments(readProjectFile("popup.js"));
  const background = stripComments(readProjectFile("background.js"));

  // 1) displayRoot 的写入守卫里不能出现 busyNow：
  //    四个扫描入口（刷新 / 选择目录 / 连接上次目录 / 恢复上次目录）都是先
  //    setBusy(true) 再调 displayRoot，带上 busyNow 就等于每次扫描都被自己挡回去
  //    —— V1.4.3 的真实事故：选完目录、老用户进来，界面一律停在「尚未选择目录」。
  const guardStart = library.indexOf("if (!options.allowDuringWrite &&");
  assert.ok(guardStart > 0, "displayRoot 要保留写入守卫");
  const guard = library.slice(guardStart, library.indexOf("return;", guardStart));
  assert.ok(!/busyNow/.test(guard), "displayRoot 的守卫不能用 busyNow 当判据");
  for (const flag of ["videoAddInProgress", "deleteInProgress", "collectionCreateInProgress"]) {
    assert.ok(guard.includes(flag), `写入守卫要挡住 ${flag}`);
  }

  // 2) 收藏库：一份固定目录名单 + 一个建目录助手，选择目录与连接上次目录都要走它
  //    1.5.0 起多一个 003database（本地数据库根目录）
  assert.ok(library.includes('const ROOT_STRUCTURE_DIRECTORIES = ["000视频下载", "001错误报告", "002同步报告", "003database"];'),
    "收藏库要有一份固定目录名单");
  assert.ok(library.includes("async function ensureRootStructure("), "要有建目录的助手");
  assert.ok(library.includes("await ensureRootStructure(handle);"), "选择目录后要建出固定目录");
  assert.ok(library.includes("await ensureRootStructure(rootHandle);"), "连接上次目录时也要补齐");
  assert.ok(library.includes('showDirectoryPicker({ mode: "readwrite" })'),
    "收藏库要按读写要权限，否则建不了目录");

  // 3) 弹窗：一次建齐，名字与收藏库同一份
  assert.ok(popup.includes('const ROOT_STRUCTURE_DIRECTORIES = [DOWNLOAD_FOLDER_NAME, "001错误报告", "002同步报告", "003database"];'),
    "弹窗的固定目录名单要和收藏库一致");
  assert.ok(popup.includes("for (const name of ROOT_STRUCTURE_DIRECTORIES)"),
    "弹窗要按名单逐个创建");

  // 4) 这些名字必须在 background.js 的保留目录名单里（几处一起改，别让名单漂移）
  for (const name of ["000视频下载", "001错误报告", "002同步报告", "003database"]) {
    assert.ok(library.includes(`"${name}"`), `收藏库的固定目录里有 ${name}`);
    assert.ok(popup.includes(`"${name}"`), `弹窗的固定目录里有 ${name}`);
    assert.ok(background.includes(`"${name}"`), `${name} 也要在 background.js 的保留名单里`);
  }
});

test("封面白名单接受接口回的 http 地址并升到 https（V1.4.5）", () => {
  const { coverFetchUrl } = loadBackgroundFunctions(["coverFetchUrl", "normalizeUrl"], ["COVER_HOST_SUFFIXES", "COVER_EXACT_HOSTS"]);

  // V1.4.3 的 P2-17 白名单只认 https，而 B 站接口回的 pic 是 http://i0.hdslb.com/...
  // 而 manifest 只申请了 https://*.hdslb.com/* —— 于是「接口来的封面候选」全被挡掉：
  // 收藏夹页面开着时还有页面抓来的 https 候选顶着，页面一关（含导入中途关掉）就整批
  // 写成「封面暂不可恢复」。这条用例专门盯这个回归。
  assert.equal(coverFetchUrl("http://i0.hdslb.com/bfs/archive/a.jpg"), "https://i0.hdslb.com/bfs/archive/a.jpg",
    "接口回的 http 封面要升成 https 再取");
  assert.equal(coverFetchUrl("http://hdslb.com/a.jpg"), "https://hdslb.com/a.jpg");
  assert.equal(coverFetchUrl("//i0.hdslb.com/a.jpg"), "https://i0.hdslb.com/a.jpg");
  assert.equal(coverFetchUrl("https://i0.hdslb.com/a.jpg"), "https://i0.hdslb.com/a.jpg");
  assert.equal(coverFetchUrl("http://api.bilibili.com/a.jpg"), "https://api.bilibili.com/a.jpg");

  // 白名单之外一律拒绝（不能因为放行 http 就把任意域名也放进来）
  for (const blocked of [
    "http://evil.com/i0.hdslb.com.jpg",
    "https://i0.hdslb.com.evil.com/a.jpg",
    "https://i0.bilivideo.com/a.jpg",
    "https://i0.akamaized.net/a.jpg",
    "ftp://i0.hdslb.com/a.jpg",
    "",
    "not a url"
  ]) {
    assert.equal(coverFetchUrl(blocked), "", `${blocked} 不该被放行`);
  }

  // 真正发请求的必须是升级后的地址：原始 http 地址没有 host 权限，必失败
  const background = stripComments(readProjectFile("background.js"));
  assert.ok(background.includes("const coverUrl = coverFetchUrl(normalized);"), "loadCoverPng 要先过白名单并升级");
  assert.ok(background.includes('fetch(coverUrl, { credentials: "omit"'), "取封面要用升级后的地址");
  assert.ok(!/coverUrlAllowed/.test(background), "旧的、只认 https 的 coverUrlAllowed 不该再留着");
});

test("导入途中关掉收藏夹页面时，弹窗不许报假失败、也不许漏掉完成提示（V1.4.7）", () => {
  const popup = stripComments(readProjectFile("popup.js"));

  // 页面被关掉 ≠ 导入失败：catch 里先问一句后台还在不在跑
  assert.ok(popup.includes("async function importStillRunning()"), "要有「后台还在跑吗」的判断");
  assert.ok(popup.includes("if (await importStillRunning())"), "catch 里要用它分流");
  assert.ok(popup.includes("页面已关闭，导入仍在后台继续；完成后这里会提示。"), "后台仍在跑时要说实话，不是报错");
  assert.ok(popup.includes("awaitingBackgroundImport = startedAt;"), "要记下在等哪一次的结果");
  assert.ok(popup.includes("const startedAt = Date.now();"), "开始时要记时间戳，免得收到上一轮的旧结果");

  // 后台自己跑完那一轮：结果只写在 importDone 里，storage 变更要接住
  assert.ok(/changes\.importDone && awaitingBackgroundImport/.test(popup), "要接住后台写完的结果");
  assert.ok(popup.includes("importStatus.textContent = done.text;"), "结果要写回状态行");
  assert.ok(popup.includes("showDoneDialog(done.text, done.failed);"), "也要弹完成提示（失败时带 failed）");

  // 两条老路径不许被改坏：页面还在时的直接响应、以及重开弹窗时补显示
  assert.ok(popup.includes("showDoneDialog(doneText);"), "页面还在时的老路径要留着");
  assert.ok(popup.includes('chrome.storage.local.get("importDone")'), "重开弹窗时仍要读上次结果");
});

// ---- V1.7.20（残留 P1：导入失败终态 / 角标时机 / 窄窗口排序 / 页面状态）----

test("导入失败也要落一份 importDone，弹窗要按失败态弹（V1.7.20）", () => {
  const bg = stripComments(readProjectFile("background.js"));
  const popup = stripComments(readProjectFile("popup.js"));

  // 成功写 importDone、失败不写 —— 这条不对称就是「关掉弹窗等结果」只对成功生效的原因
  const failureAt = bg.indexOf("const reportImportFailure = async (error) => {");
  assert.ok(failureAt > 0, "找不到导入失败的处理函数");
  const failureBody = bg.slice(failureAt, bg.indexOf("sendResponse({ ok: false, message: error?.message", failureAt));
  assert.match(failureBody, /importDone: \{ text: failureText, acknowledged: false, failed: true, at: Date\.now\(\) \}/,
    "失败也要写 importDone，否则弹窗没有可补弹的终态");
  assert.match(failureBody, /lastResult: \{ message: .*failed: true \}/, "失败的老路径（最近状态）也要留着");

  // 弹窗侧：两条补弹路径都要把 failed 传下去，标题要换字
  assert.ok(popup.includes("showDoneDialog(done.text, done.failed);"), "storage 变更路径要带 failed");
  assert.equal([...popup.matchAll(/showDoneDialog\(done\.text, done\.failed\);/g)].length, 2,
    "两条补弹路径（onChanged 与 boot 补弹）都要带 failed");
  assert.ok(popup.includes('if (failed) doneDialogTitle.textContent = BcaI18n.t("导入没有完成");'),
    "失败时标题要说「没跑完」，不能顶着「已完成」");
});

test("角标要等结果真的呈现出来才清，不许一打开弹窗就灭（V1.7.20）", () => {
  const popup = stripComments(readProjectFile("popup.js"));

  // boot 里不许再有无条件的清角标
  const bootAt = popup.indexOf("async function boot() {");
  assert.ok(bootAt > 0, "找不到 boot()");
  const bootBody = popup.slice(bootAt);
  assert.doesNotMatch(bootBody, /runtime\.sendMessage\(\{ type: "bca-badge-clear" \}\)/,
    "boot 里不许再无条件清角标 —— 「打开了」不等于「看到了」");

  // 收口在 clearBadgeIfSeen：还有没读过的 importDone 就不清
  assert.ok(popup.includes("async function clearBadgeIfSeen()"), "要有「结果看到了吗」的判断");
  assert.ok(popup.includes("if (done && !done.acknowledged && done.text) return;"),
    "有未读结果时必须留着角标");
  assert.ok(popup.indexOf("clearBadgeIfSeen();", bootAt) > bootAt, "boot 末尾要按未读结果决定");
  const dismissAt = popup.indexOf("function dismissDoneDialog()");
  const dismissBody = popup.slice(dismissAt, popup.indexOf("\n}", dismissAt));
  assert.match(dismissBody, /clearBadge\(\);/, "用户真的读掉并关掉对话框之后才清角标");
});

test("窄窗口也要能排序：收藏夹行支持 Alt+↑/↓（V1.7.20）", () => {
  const library = stripComments(readProjectFile("library.js"));
  const html = readProjectFile("library.html");

  // ≤760px 的胶囊布局把拖动把手 display:none 了，拖动本身也没了可发现性 ——
  // 所以必须有一条不依赖拖动的入口
  assert.ok(library.includes('if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;'),
    "收藏夹行要接 Alt+↑/↓");
  assert.ok(library.includes('reorderCollection(name, order[to], event.key === "ArrowDown");'),
    "要走和拖动同一条 reorderCollection（「没读到顺序就不落盘」那条保护才生效）");
  assert.ok(library.includes("function focusCollectionRow(name)"), "重画之后要把焦点放回同一行，否则连按第二下会落空");
  assert.ok(library.includes("focusCollectionRow(name);"), "键盘排序之后要还原焦点");
  assert.ok(html.includes("Alt+↑/↓"), "侧栏的排序提示要写出这条键盘入口");
});

test("content.js 不许再假装读得到页面的全局状态（V1.7.20）", () => {
  const content = stripComments(readProjectFile("content.js"));
  // 内容脚本跑在隔离世界，window.__INITIAL_STATE__ 恒为 undefined
  assert.doesNotMatch(content, /__INITIAL_STATE__|__initialState__/,
    "隔离世界读不到页面全局变量，这条通道根本不存在，别留着误导人");
  assert.ok(content.includes("const state = {};"), "把结论写清楚：页面状态这条来源不存在");
  // DOM 兜底必须还在（删掉页面状态之后，bvid/aid/标签/UID 全靠它）
  assert.ok(content.includes(String.raw`url.match(/\bBV[\w]+/i)`), "bvid 仍要从地址栏兜底");
  assert.match(content, /document\.querySelectorAll\('\.video-tag-container a/, "标签仍要从 DOM 取");
});

test("1.5.0：本地数据库与宠物挂件的契约都钉住了", () => {
  const html = readProjectFile("library.html");
  const library = readProjectFile("library.js");
  const background = readProjectFile("background.js");
  const settingsHtml = readProjectFile("settings.html");
  const settings = readProjectFile("settings.js");
  const pet = readProjectFile("pet.js");
  const core = readProjectFile("stats-core.js");
  const extractor = fs.readFileSync(path.join(__dirname, "i18n-extract.cjs"), "utf8");

  // 纯函数模块：浏览器里挂全局，node 里能 require（单元测试靠这个）
  assert.ok(core.includes("global.BcaStatsCore = api;"), "统计核心要挂到全局");
  assert.ok(core.includes("module.exports = api;"), "node 里也要能 require");
  assert.ok(core.includes('const DATABASE_FOLDER_NAME = "003database";'), "数据库目录名写在核心里");
  assert.ok(core.includes('const DATABASE_FILE_NAME = "database.json";'), "库文件名写在核心里");

  // 页面脚本顺序：纯函数必须排在使用它的脚本之前
  const order = ["stats-core.js", "library.js", "pet.js"].map((name) => html.indexOf(name));
  assert.ok(order.every((at, i) => at >= 0 && (i === 0 || at > order[i - 1])), "library.html 的脚本顺序不对");
  assert.ok(html.includes('href="pet.css"'), "宠物样式要跟着加载");

  // 后台：模块 service worker import 纯函数，写库，接宠物互动
  assert.ok(background.includes('import "./stats-core.js";'), "后台要 import 统计核心");
  assert.ok(background.includes("const BcaStatsCore = globalThis.BcaStatsCore;"), "后台从全局取它");
  assert.ok(background.includes("async function readStatsDatabase("), "要有读库助手");
  assert.ok(background.includes("async function writeStatsDatabase("), "要有写库助手");
  assert.ok(background.includes("BcaStatsCore.snapshot(database)"), "写完要把快照算出来");
  assert.ok(background.includes("chrome.storage.local.set({ bcaStats:"), "快照的键名是 bcaStats");
  // 1.5.0：snapshot() 的 days.days 是「库里有几天」这个数字（宠物拿它数陪伴天数），
  // 统计页画柱子要的是每日明细，必须另带一份 daily；两边发布点形状要一致。
  assert.ok(background.includes("daily: BcaStatsCore.recentDays(database)"), "后台快照要带上每日明细");
  assert.ok(library.includes("daily: core.recentDays(database)"), "收藏库快照也要带每日明细");
  assert.ok(background.includes('message?.type === "bca-pet-touch"'), "宠物互动要有消息分支");
  assert.ok(background.includes("BcaStatsCore.touchPet(read.database)"), "互动要落进数据库");
  // 1.7.0（批次 A / P0）：读库读不出来（权限被撤、文件被锁、同步盘正在替换）时，
  // 老代码会拿一份空库整份重写回去 —— 历史统计与宠物亲密度无声归零。现在两个写入口
  // 共用同一道守卫，读不可信就一个字节都不写；三个不可恢复字段另留 storage 镜像；
  // 每次成功写库之前把上一版原文轮转成 database.bak.json。
  assert.ok(background.includes("function statsDatabaseWriteBlocked("), "要有「读不到库就不许写」的守卫");
  assert.ok(background.includes("const blocked = statsDatabaseWriteBlocked(read);"), "两个写入口都要过这道守卫");
  assert.ok(background.includes("return { ok: false, blocked: true, lineIndex: null };"), "摸头读不到库时不许写");
  assert.ok(background.includes("STATS_MIRROR_KEY"), "三个不可恢复字段要有 storage 镜像");
  assert.ok(background.includes("STATS_PREVIOUS_DATABASE_NAME"), "写库前要把上一版留成 database.bak.json");
  // service worker 里没有词典：后台只回下标，翻译留在界面侧
  assert.ok(background.includes("lineIndex"), "后台回的是台词下标");
  assert.ok(!/bca-pet-touch[\s\S]{0,600}?BcaI18n/.test(background), "后台不许翻译台词");

  // 收藏库：扫描完把数据库整份重建（看得到的才算数，删掉的视频不该留在统计里）
  assert.ok(library.includes("async function syncStatsDatabase("), "收藏库要有同步助手");
  assert.ok(library.includes("core.databaseFromVideos(videos, { previous })"), "要整份重建并保留宠物状态");
  assert.ok(library.includes("const payload = Object.assign(core.snapshot(database), { daily: core.recentDays(database) })"), "同步完也要发同形状的快照");
  // 1.7.7（P0-1）：写之前必须比实质指纹 —— 少了它，"写 → onChanged → 重扫 → 再写"
  // 就是一个开着页面就每秒一轮、永不停止的环路。
  assert.ok(library.includes("publishedStatsFingerprintOf"), "快照没变时不许再写（P0-1 环路）");
  // 1.7.10（P2-3）：同步助手要接受并收到 options —— 「刷新」靠 forceStatsSync 越过
  // 「比旧库少太多就先不覆盖」那道闸门。断言按语义写，不钉死某一行的字面量。
  assert.match(library, /async function syncStatsDatabase\(handle, options = \{\}\)/, "同步助手要接受 options");
  assert.ok(library.includes("syncStatsDatabase(handle, options)"), "同步助手要真的被调用，且把 options 透传进去");

  // 设置页：数据统计与宠物挂件两个入口
  assert.ok(settingsHtml.includes('data-group="stats"'), "左导航要有数据统计这一项");
  assert.ok(settingsHtml.includes('id="openStats"'), "要有「点击查看最近收藏统计」按钮");
  assert.ok(settingsHtml.includes("点击查看最近收藏统计"), "按钮文案要对");
  assert.ok(settingsHtml.includes('id="petToggle"'), "要有宠物挂件开关");
  assert.ok(settings.includes('chrome.runtime.getURL("stats.html")'), "按钮要打开统计页");
  assert.ok(settings.includes("interfacePet"), "开关要写 interfacePet");
  assert.ok(settings.includes("chrome.storage.local.set({ interfacePet: next })"), "开关要落盘（整份合并写）");
  // 1.6.0：原来这里钉的是「只带 enabled 的局部对象」那次写入 —— 那一写会把 size/x/y/paused
  // 全抹回默认（96↔144 闪动、位置回屏幕正中），测试等于在保护 bug。现在反过来盯它别回来。
  assert.equal(
    /chrome\.storage\.local\.set\(\{ interfacePet: \{ enabled \} \}\)/.test(settings),
    false,
    "不许再写只带 enabled 的局部对象（会抹掉 size/x/y/paused）"
  );

  // 宠物：读快照、受开关控制、点一下发消息、台词按下标翻译
  assert.ok(pet.includes('const STATS_KEY = "bcaStats";'), "宠物要读统计快照");
  assert.ok(pet.includes("interfacePet"), "宠物要受开关控制");
  assert.ok(pet.includes('const TOUCH_MESSAGE = "bca-pet-touch";'), "点一下要发消息");
  assert.ok(pet.includes("function touchLine(index)"), "台词要按下标取");
  // 四句台词必须写成 translate("…") 调用：塞进数组字面量的话 i18n 抽取器看不见，
  // 缺了也不报错，只是切语言那四句永远不翻译。
  for (const line of ["摸摸头～", "今天也要记得备份哦", "收藏得越多，我越有精神", "又见面啦"]) {
    assert.ok(pet.includes(`translate("${line}")`), `台词「${line}」要写成 translate("…") 调用`);
  }

  // i18n 抽取器要把这两件新事算进去
  assert.ok(extractor.includes('"pet.js"'), "pet.js 要进 i18n 的扫描清单");
  assert.ok(extractor.includes("|translate)"), "抽取器要认得 translate() 这层包装");
});

/* ---- 1.7.22：执行级测试覆盖（background.js / 原生消息）---- */

// 这一套的新意：前面 238 条都是「读文件 + 正则」，证明源码里写着某行字；
// test/background.test.cjs 把 background.js 整份丢进 vm 跑起来，配内存版
// chrome.storage 与内存版目录树，真调那些函数。壳是 test/harness.cjs。
// 壳一旦坏掉（名字改了、vm 跑不起来），那 24 条会**静默空转**，所以在这里钉住。
test("执行级测试的壳真能跑起来，导出的名字一个都不能少（V1.7.22）", () => {
  const harness = require("./harness.cjs");
  const bg = harness.loadBackground();
  assert.deepEqual(bg.__missing, [], "BACKGROUND_EXPORTS 里导不出来的名字 = 对应的测试在空转");
  const exported = Object.keys(bg.__test);
  assert.ok(exported.length >= 25, "导出太少（" + exported.length + " 个），多半是壳坏了");
  for (const name of ["readStatsDatabase", "writeStatsDatabase", "flushStatsPendingRecords", "rollbackStatsRecords"]) {
    assert.equal(typeof bg.__test[name], "function", name + " 必须真的掏得出来");
  }
  // vm 里必须拿到一份能用的 chrome.storage，否则上面几个函数一进去就炸
  assert.equal(typeof bg.chrome.storage.local.get, "function");
  assert.equal(typeof bg.chrome.storage.local.set, "function");
});

test("新的执行级测试不许重写一份被测实现，且必须接进发版流程（V1.7.22）", () => {
  const testSrc = readProjectFile("test/background.test.cjs");
  // 抄一份实现来测，测的就是抄本 —— 磁盘上那份改坏了照样绿
  for (const name of ["readStatsDatabase", "writeStatsDatabase", "flushStatsPendingRecords",
                      "rollbackStatsRecords", "nativeHostRequest", "maskLocalUserPaths"]) {
    assert.doesNotMatch(testSrc, new RegExp("function\\s+" + name + "\\s*\\("), name + " 不许在测试里重写一份");
  }
  // 从 library.js 抠函数是允许的，但必须抠的是磁盘上那份
  assert.match(testSrc, /readSource\("library\.js"\)/, "原生消息那条要从 library.js 现读");
  assert.match(testSrc, /carveFunction\(source, "nativeHostRequest"\)/);

  const release = readProjectFile("release.ps1");
  assert.match(release, /test\/background\.test\.cjs/, "发版第 4 步要真的跑它，否则这套测试是摆设");
  assert.ok(fs.existsSync(path.join(projectRoot, "test", "harness.cjs")), "test/harness.cjs 要在包里");

  // 变异测试打的那几行必须是可执行语句，不是注释 —— 打在注释上会得出"守卫有效"的错误结论（1.7.16 踩过）
  const background = readProjectFile("background.js");
  const library = readProjectFile("library.js");
  for (const anchor of [
    [background, "const blocked = statsDatabaseWriteBlocked(read);", "P0 红线"],
    [background, "statsPendingRecords.unshift(...batch);", "写失败回队"],
    [background, "const run = statsWriteChain.then(task, task);", "写入口互斥"],
    [library, "if (protocol !== NATIVE_PROTOCOL_VERSION) {", "协议号校验"]
  ]) {
    const source = anchor[0];
    const needle = anchor[1];
    const label = anchor[2];
    const lines = source.split("\n").filter((line) => line.includes(needle));
    assert.ok(lines.length >= 1, "变异锚点不见了：" + label + "（" + needle + "）");
    for (const line of lines) {
      assert.doesNotMatch(line.trim(), /^(\/\/|\*|\/\*)/, "变异锚点落在注释里了：" + label + " —— 变异会变成假绿");
    }
  }
});
