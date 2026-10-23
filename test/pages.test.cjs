"use strict";
/*
  library.html / popup.html / content.js 这三份「要真 DOM 才能加载」的页面脚本，**真执行**测试。

  分工（四套测试各管一段）：
    test/stability.test.cjs  —— 读文件 + 正则：证明源码里写着某行字（防漂移）
    test/archive-core.test.cjs / test/stats-core.test.cjs —— 纯函数真执行
    test/background.test.cjs —— background.js 整份进 vm，配内存版 chrome.* 与内存目录树
    test/pages.test.cjs      —— 本文件：真解析 library.html / popup.html 的 HTML，
                                建出 DOM，把页面脚本按 <script src> 顺序跑起来，
                                然后用真事件驱动（click / input / keydown）。

  为什么值得单独写：静态断言能证明「源码里写着 element.hidden = true」，
  证明不了「点完那个按钮之后它真的被设成了 true」；也证明不了「HTML 里的 id 改名了
  但 JS 没跟着改」。1.7.23 之前这一段完全没有执行级覆盖。

  运行：node test/pages.test.cjs
*/

const assert = require("node:assert");
const vm = require("node:vm");
const harness = require("./harness.cjs");
const dom = require("./dom-harness.cjs");

const isMain = require.main === module;
const { makeChrome, makeDirectoryTree } = harness;

let passed = 0;
let failed = 0;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    if (isMain) process.stdout.write(".");
  } catch (error) {
    failed += 1;
    failures.push({ name, error });
    if (isMain) process.stdout.write("x");
  }
}

/* ---------------- 小工具 ---------------- */

/** 让 fire-and-forget 的 promise 尾巴（及其定时器）跑完。 */
async function settle(rounds = 8) {
  for (let i = 0; i < rounds; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

const INFO = (title, extra = {}) => [
  "\uFEFF【基本信息】",
  `视频收藏时间：${extra.favoriteAt || "2026年10月09日 01时19分50秒.175"}`,
  `视频标题：${title}`,
  `视频链接：${extra.url || "https://www.bilibili.com/video/BV1xx411c7mD/"}`,
  "视频状态：正常",
  "",
  "【UP主】",
  `UP主昵称：${extra.upName || "某人"}`,
  `UP主UID：${extra.upMid || "12345"}`,
  "",
  "【互动数据】",
  `播放量：${extra.view || "1000"}`,
  "弹幕量：20",
  "",
  "【标签】",
  "标签一、标签二",
  "",
  "【视频简介】",
  "第一行简介"
].join("\r\n");

/** 一份两收藏夹三视频的归档目录树。 */
function sampleTree() {
  return {
    "小鲸鱼测试": {
      "2026年10月09日01时19分50秒": { "视频信息.txt": INFO("第一条视频"), "封面.png": "PNG-1" },
      "2026年10月10日02时20分00秒": { "视频信息.txt": INFO("第二条视频", { url: "https://www.bilibili.com/video/BV1yy411c7mE/", favoriteAt: "2026年10月10日 02时20分00秒.500" }), "封面.png": "PNG-2" }
    },
    "另一个夹": {
      "2026年10月11日03时30分00秒": { "视频信息.txt": INFO("第三条视频", { url: "https://www.bilibili.com/video/av123456" }), "封面.png": "PNG-3" }
    }
  };
}

/** 起一页 library.html，并把「上次的根目录」直接塞进 rootHandle。 */
async function openLibrary(options = {}) {
  const chrome = makeChrome({ version: "1.7.23", localData: options.localData || {} });
  const page = dom.loadPage({ htmlFile: "library.html", chrome });
  // 1.8.15：用例要主动制造 storage 变化（验证「记录集没变就不重扫」），把 chrome 挂到页面上
  page.__chrome = chrome;
  await settle();
  const g = page.window;
  if (options.tree) {
    // 根目录名故意跟收藏夹名不一样，好确认面包屑第一段读的是句柄名、不是写死的
    const rootName = options.rootName || "_测试归档";
    const root = await makeDirectoryTree({ [rootName]: options.tree }).getDirectoryHandle(rootName);
    await g.displayRoot(root, "*", BcaT(page, "已读取"));
    await settle();
  }
  return page;
}

/** 词典是页面里真加载的，取值走它自己，别在测试里写死中文。 */
function BcaT(page, key, vars) {
  return page.window.BcaI18n.t(key, vars);
}

function textOf(element) {
  return element ? element.textContent.replace(/\s+/g, " ").trim() : "";
}

function idsIn(root, selector) {
  return [...root.querySelectorAll(selector)].map((element) => textOf(element));
}

/* ---------------- library.html ---------------- */

async function suiteLibrary() {
  await test("library.html 整页真加载：七个脚本都跑了，侧栏版本号来自 manifest", async () => {
    const page = await openLibrary();
    assert.deepEqual(page.ran, ["theme.js", "i18n.js", "client-errors.js", "icons.js", "archive-core.js", "archive-tools.js", "stats-core.js", "library.js", "pet.js"]);
    assert.equal(page.document.getElementById("sideVersion").textContent, "V1.7.23");
    assert.equal(page.warnings.length, 0, `加载期不该有 warning：${page.warnings.join(" | ")}`);
  });

  await test("扫描一份真实归档：收藏夹列表、视频网格、计数都按目录内容渲染（1.7.23）", async () => {
    const page = await openLibrary({ tree: sampleTree() });
    const doc = page.document;

    // 没存过 collectionOrder 时按名字排（zh-CN 拼音序）：另(l) < 小(x)
    const rows = idsIn(doc.getElementById("collectionList"), ".collection-name");
    assert.deepEqual(rows, ["全部收藏", "另一个夹", "小鲸鱼测试"]);
    assert.equal(textOf(doc.getElementById("collectionTotal")), "2", "收藏夹个数");
    assert.equal(textOf(doc.getElementById("collectionList").querySelector(".collection-button .collection-count")), "3", "全部收藏的视频数是 3");

    const cards = doc.querySelectorAll("#videoGrid .video-card");
    assert.equal(cards.length, 3, "三张卡片");
    // 默认按收藏时间倒序，具体先后由样例里的时间戳决定，这里只钉「三张都渲染出来了」
    assert.deepEqual(idsIn(doc.getElementById("videoGrid"), ".card-title").slice().sort(),
      ["第一条视频", "第三条视频", "第二条视频"].sort());
    assert.deepEqual(idsIn(doc.getElementById("videoGrid"), ".card-up"), ["某人", "某人", "某人"]);
    assert.equal(textOf(doc.getElementById("rootLabel")), "_测试归档", "面包屑第一段是真实根目录名");
    assert.equal(textOf(doc.getElementById("currentCollection")), "全部收藏");
  });

  await test("点收藏夹行只显示那一个夹的视频，再点「全部收藏」回来（1.7.23）", async () => {
    const page = await openLibrary({ tree: sampleTree() });
    const doc = page.document;
    const buttons = [...doc.querySelectorAll("#collectionList .collection-button")];
    const target = buttons.find((button) => textOf(button.querySelector(".collection-name")) === "另一个夹");
    target.click();
    await settle(4);
    assert.equal(doc.querySelectorAll("#videoGrid .video-card").length, 1);
    assert.deepEqual(idsIn(doc.getElementById("videoGrid"), ".card-title"), ["第三条视频"]);
    assert.equal(textOf(doc.getElementById("currentCollection")), "另一个夹");

    buttons[0].click();
    await settle(4);
    assert.equal(doc.querySelectorAll("#videoGrid .video-card").length, 3);
    assert.equal(textOf(doc.getElementById("currentCollection")), "全部收藏");
  });

  await test("侧栏过滤框：输不中的词只剩「没有匹配的收藏夹」，清空后全部回来（1.7.23）", async () => {
    const page = await openLibrary({ tree: sampleTree() });
    const doc = page.document;
    const filter = doc.getElementById("collectionFilter");
    const empty = doc.getElementById("collectionFilterEmpty");

    const visibleNames = () => [...doc.querySelectorAll("#collectionList .collection-row")]
      .filter((row) => !row.hidden)
      .map((row) => textOf(row.querySelector(".collection-name")));

    filter.value = "鲸鱼";
    filter.dispatchEvent(new page.window.Event("input", { bubbles: true }));
    await settle(4);
    assert.deepEqual(visibleNames(), ["小鲸鱼测试"], "只留命中的那个夹");
    assert.equal(doc.querySelectorAll("#collectionList .collection-row[hidden]").length, 2, "「全部收藏」和「另一个夹」都被隐藏");
    assert.equal(empty.hidden, true);

    filter.value = "不存在的名字";
    filter.dispatchEvent(new page.window.Event("input", { bubbles: true }));
    await settle(4);
    assert.equal(empty.hidden, false, "一条都不中时要给出空状态");
    assert.match(textOf(empty), /没有匹配的收藏夹/);

    filter.value = "";
    filter.dispatchEvent(new page.window.Event("input", { bubbles: true }));
    await settle(4);
    assert.equal(empty.hidden, true);
    assert.equal(doc.querySelectorAll("#collectionList .collection-row[hidden]").length, 0);
    assert.deepEqual(visibleNames(), ["全部收藏", "另一个夹", "小鲸鱼测试"]);
  });

  await test("搜索框真过滤卡片：命中就只剩它，清空全部回来（1.7.23）", async () => {
    const page = await openLibrary({ tree: sampleTree() });
    const doc = page.document;
    const search = doc.getElementById("searchInput");
    search.value = "第二条";
    page.window.applySearchNow();
    await settle(4);
    assert.deepEqual(idsIn(doc.getElementById("videoGrid"), ".card-title"), ["第二条视频"]);

    search.value = "";
    page.window.applySearchNow();
    await settle(4);
    assert.equal(doc.querySelectorAll("#videoGrid .video-card").length, 3);
  });
  await test("卡片封面跟着记录走：重建的卡片也能补上，刷新后不留旧图（1.9.1）", async () => {
    const page = await openLibrary({ tree: sampleTree() });
    const doc = page.document;
    const g = page.window;
    await settle(12);
    const coverSources = () => [...doc.querySelectorAll("#videoGrid .video-card")]
      .map((card) => card.querySelector(".card-cover img")?.getAttribute("src") || "");
    assert.equal(coverSources().length, 3);
    assert.ok(coverSources().every((src) => /^blob:test\//.test(src)), "首屏三张卡都该有封面");
    // 卡片被丢弃后重建（等价于翻页回来）：缓存里已经有 URL，1.8.23 的写法会拿 `video.cover`
    // 当「这张卡已经有图」的判据直接跳过，新建的卡片于是永远停在占位图上。
    doc.getElementById("videoGrid").replaceChildren();
    g.renderVideos();
    await settle(6);
    assert.ok(coverSources().every((src) => /^blob:test\//.test(src)), "重建的卡片也要有封面");
    assert.equal(doc.querySelectorAll("#videoGrid .cover-fallback").length, 0, "有封面时不该留占位图");
  });

  await test("点开卡片详情后，「标记已下载」会弹出确认对话框（1.7.23）", async () => {
    const page = await openLibrary({ tree: sampleTree() });
    const doc = page.document;
    const card = doc.querySelectorAll("#videoGrid .video-card")[0];
    card.click();
    await settle(6);

    const button = doc.querySelector(".mark-downloaded");
    assert.ok(button, "详情面板里要有「标记已下载」按钮");
    button.click();
    await settle(6);
    const dialog = doc.getElementById("markDownloadedDialog");
    assert.ok(dialog, "要有标记已下载的对话框");
    assert.equal(dialog.open, true, "点了之后要弹出来");
    assert.match(textOf(doc.getElementById("markDownloadedPath")), /\S/, "对话框里要写清目标目录");
  });

  await test("删除确认对话框：文案与按钮按「删一个视频」渲染，取消后关闭且不动磁盘（1.7.23）", async () => {
    const page = await openLibrary({ tree: sampleTree() });
    const doc = page.document;

    doc.querySelectorAll("#videoGrid .video-card")[0].click();
    await settle(6);
    const deleteLocal = doc.querySelector(".delete-local");
    assert.ok(deleteLocal, "详情面板里要有「删除本地归档」按钮");
    deleteLocal.click();
    await settle(4);

    assert.equal(doc.getElementById("confirmBackdrop").hidden, false, "对话框要打开");
    // 1.8.23（TODO P0-1）：删除改成了「先移进 005回收站」，标题口径跟着换
    assert.equal(textOf(doc.getElementById("confirmTitle")), "删除本地归档（先移进回收站）？");
    assert.match(textOf(doc.getElementById("confirmMessage")), /将删除视频目录“/);
    assert.equal(textOf(doc.getElementById("confirmDelete")).length > 0, true);

    doc.getElementById("cancelDelete").click();
    await settle(4);
    assert.equal(doc.getElementById("confirmBackdrop").hidden, true, "取消后要关掉");
  });

  await test("设置页导出配置：完整导出带个人内容，精简导出只有外观与档位（1.9.0）", async () => {
    const page = await openSettings({
      localData: {
        libraryPageSize: 50,
        libraryViewMode: "list",
        collectionOrder: ["另一个夹", "小鲸鱼测试"],
        libraryFilters: { search: "第二条", videoFilter: "invalid", upFilter: "all", tagFilter: "all", sort: "oldest" }
      }
    });
    const doc = page.document;
    const blobs = [];

    const originalCreate = page.window.URL.createObjectURL;
    page.window.URL.createObjectURL = (blob) => { blobs.push(blob); return "blob:test/captured"; };
    page.window.confirm = () => true;
    try {
      doc.getElementById("settingsExportConfigSlim").click();
      await settle(6);
      assert.equal(blobs.length, 1, "精简导出应当落一个文件");
      const slim = JSON.parse(blobs[0].parts.join("").replace(/^\uFEFF/, ""));
      assert.equal(slim.app, "bili-vault/library-settings");
      assert.deepEqual(Object.keys(slim.preferences).sort(), ["locale", "pageSize", "theme", "viewMode"]);
      assert.equal("collectionOrder" in slim.preferences, false, "精简导出不许带收藏夹顺序");
      assert.equal("filters" in slim.preferences, false, "精简导出不许带筛选词");

      doc.getElementById("settingsExportConfig").click();
      await settle(6);
      assert.equal(blobs.length, 2, "完整导出应当再落一个文件");
      const full = JSON.parse(blobs[1].parts.join("").replace(/^\uFEFF/, ""));
      assert.equal(full._containsPersonalData, true);
      assert.deepEqual(full.preferences.collectionOrder, ["另一个夹", "小鲸鱼测试"], "完整导出要带上收藏夹顺序");
      assert.equal(full.preferences.filters.search, "第二条", "完整导出要带上搜索词");
      assert.equal(full.preferences.filters.sort, "oldest", "完整导出要带上筛选与排序");
    } finally {
      page.window.URL.createObjectURL = originalCreate;
    }
  });

  await test("设置页导入配置：app 名不对、JSON 坏掉、超过 256KB 都要报错且不改界面（1.9.0）", async () => {
    const page = await openSettings();
    const g = page.window;
    const transfer = g.BcaSettingsTransfer;
    assert.ok(transfer, "设置页要暴露 BcaSettingsTransfer");
    const themeBefore = page.document.documentElement.getAttribute("data-theme");

    await assert.rejects(() => transfer.importConfigText("{ 这不是 JSON"), /合法的 JSON/);
    await assert.rejects(
      () => transfer.importConfigText(JSON.stringify({ app: "别的东西", version: 1, preferences: {} })),
      /哔哩藏库导出的配置文件/
    );
    const huge = JSON.stringify({ app: "bili-vault/library-settings", version: 1, preferences: {}, pad: "x".repeat(300 * 1024) });
    await assert.rejects(() => transfer.importConfigText(huge), /超过了/);

    assert.equal(page.document.documentElement.getAttribute("data-theme"), themeBefore, "失败不许改界面");
  });

  await test("设置页导入配置：合法文件真的会套用主题、页大小、收藏夹顺序与筛选（1.9.0）", async () => {
    const page = await openSettings();
    const g = page.window;
    const transfer = g.BcaSettingsTransfer;
    const payload = {
      app: "bili-vault/library-settings",
      version: 1,
      preferences: {
        theme: "dark",
        locale: "zh-CN",
        pageSize: 50,
        viewMode: "list",
        collectionOrder: ["另一个夹", "小鲸鱼测试"],
        filters: { search: "", videoFilter: "all", upFilter: "all", tagFilter: "all", sort: "oldest" }
      },
      _containsPersonalData: true
    };
    g.confirm = () => true;
    const warnings = await transfer.importConfigText(JSON.stringify(payload));
    await settle(6);
    assert.equal(warnings === false, false, "确认后不该被当成取消");
    assert.equal(
      page.document.documentElement.dataset.theme || page.document.documentElement.getAttribute("data-theme"),
      "dark",
      "主题要立刻套用"
    );

    const stored = await page.chrome.storage.local.get([
      "libraryPageSize", "libraryViewMode", "collectionOrder", "libraryFilters"
    ]);
    assert.equal(stored.libraryPageSize, 50, "页大小要写进 storage");
    assert.equal(stored.libraryViewMode, "list", "视图要写进 storage");
    assert.deepEqual(stored.collectionOrder, ["另一个夹", "小鲸鱼测试"], "收藏夹顺序要写进 storage");
    assert.equal(stored.libraryFilters.sort, "oldest", "筛选与排序要写进 storage");
  });

  await test("设置页导入「只导外观与档位」不会清空收藏库已有的搜索词与筛选（1.9.0）", async () => {
    const filters = { search: "第二条", videoFilter: "invalid", upFilter: "all", tagFilter: "all", sort: "oldest" };
    const page = await openSettings({ localData: { libraryFilters: filters } });
    const g = page.window;
    const transfer = g.BcaSettingsTransfer;

    const slim = {
      app: "bili-vault/library-settings",
      version: 1,
      preferences: { theme: "dark", locale: "zh-CN", pageSize: 25, viewMode: "grid" },
      _containsPersonalData: false
    };
    g.confirm = () => true;
    await transfer.importConfigText(JSON.stringify(slim));
    await settle(6);

    const stored = await page.chrome.storage.local.get("libraryFilters");
    assert.deepEqual(stored.libraryFilters, filters, "文件里没有筛选，就不许清空用户现有的筛选");
    assert.equal(
      page.document.documentElement.dataset.theme || page.document.documentElement.getAttribute("data-theme"),
      "dark",
      "外观与档位仍然要生效"
    );

    // 收藏库启动时把 storage 里的 libraryFilters 套回界面（1.9.0 的新读法）
    const library = await openLibrary({ tree: sampleTree(), localData: { libraryFilters: filters } });
    assert.equal(library.document.getElementById("searchInput").value, "第二条", "搜索词要恢复到收藏库界面");
    assert.equal(library.document.getElementById("videoFilter").value, "invalid", "视频筛选要恢复");
    assert.equal(library.document.getElementById("sortSelect").value, "oldest", "排序要恢复");
  });

  await test("只挑当前页需要的前 k 条，结果与整表稳定排序逐项一致（1.8.7）", async () => {
    const page = await openLibrary({ tree: sampleTree() });
    const g = page.window;
    const compare = (a, b) => a.key - b.key;
    // 120 条、键值有重复（(index * 37) % 120），正好覆盖「相等项怎么排」这条边界
    const list = Array.from({ length: 120 }, (_, index) => ({ key: (index * 37) % 120, order: index }));
    const picked = g.selectFirstVideos(list, 25, compare).map((item) => item.order);
    const expected = list.map((_, index) => index)
      .sort((a, b) => compare(list[a], list[b]) || a - b)
      .slice(0, 25)
      .map((index) => list[index].order);
    assert.deepEqual(picked, expected, "前 k 条必须与「整表稳定排序后切页」逐项一致");
    assert.equal(g.selectFirstVideos(list, 0, compare).length, 0, "要 0 条就返回空");
    assert.equal(g.selectFirstVideos(list, 500, compare).length, 120, "要的比总数多就全给");
  });

  await test("统计库坏掉时不许把亲密度清零：镜像把四个标量顶回来（1.8.10）", async () => {
    const brokenTree = {
      "小鲸鱼测试": {
        "2026年10月09日01时19分50秒": { "视频信息.txt": INFO("第一条视频"), "封面.png": "PNG-1" }
      },
      "003database": { "database.json": "{这不是 JSON" }
    };
    const mirror = { affinity: 500, totalTouch: 999, savedTotal: 1234, firstSeenAt: "2026-01-01T00:00:00.000Z" };
    const chrome = makeChrome({ localData: { bcaStatsMirror: mirror } });
    const page = dom.loadPage({ htmlFile: "library.html", chrome });
    await settle();
    const g = page.window;
    const root = await makeDirectoryTree({ "_测试归档": brokenTree }).getDirectoryHandle("_测试归档");
    await g.displayRoot(root, "*", BcaT(page, "已读取"));
    await settle();
    const databaseFolder = await root.getDirectoryHandle("003database");
    const databaseFile = await databaseFolder.getFileHandle("database.json");
    const text = await (await databaseFile.getFile()).text();
    const database = JSON.parse(text);
    assert.equal(database.pet.affinity, 500, "亲密度要从镜像顶回来，不能清零");
    assert.equal(database.totals.savedTotal, 1234, "累计保存数要从镜像顶回来");
    assert.equal(database.firstSeenAt, "2026-01-01T00:00:00.000Z", "陪伴开始时间要从镜像顶回来");
  });

  await test("写库交给后台：页面只发一次 bca-stats-commit，失败才自己写（1.8.17）", async () => {
    const tree = {
      "小鲸鱼测试": {
        "2026年10月09日01时19分50秒": { "视频信息.txt": INFO("交后台的第一条"), "封面.png": "PNG-1" }
      }
    };
    const page = dom.loadPage({ htmlFile: "library.html", chrome: makeChrome({ localData: {} }) });
    await settle();
    const g = page.window;
    const sent = [];
    g.chrome.runtime.sendMessage = async (message) => {
      sent.push(message);
      return { ok: true };
    };
    const root = await makeDirectoryTree({ "_测试归档": tree }).getDirectoryHandle("_测试归档");
    await g.displayRoot(root, "*", BcaT(page, "已读取"));
    await settle();
    const commits = sent.filter((item) => item && item.type === "bca-stats-commit");
    assert.equal(commits.length, 1, "构建完应该正好交一次");
    assert.equal(Object.keys(commits[0].database.videos).length, 1, "交上去的是整份库");
    const folder = await root.getDirectoryHandle("003database");
    const file = await folder.getFileHandle("database.json");
    assert.equal(await (await file.getFile()).text(), "", "后台接手了，页面就不该再往盘上写");
  });

  await test("后台没接住时页面自己写盘，不能因为消息失败就丢这次统计（1.8.17）", async () => {
    const tree = {
      "小鲸鱼测试": {
        "2026年10月09日01时19分50秒": { "视频信息.txt": INFO("兜底写盘这条"), "封面.png": "PNG-1" }
      }
    };
    const page = dom.loadPage({ htmlFile: "library.html", chrome: makeChrome({ localData: {} }) });
    await settle();
    const g = page.window;
    g.chrome.runtime.sendMessage = async () => { throw new Error("message port closed"); };
    const root = await makeDirectoryTree({ "_测试归档": tree }).getDirectoryHandle("_测试归档");
    await g.displayRoot(root, "*", BcaT(page, "已读取"));
    await settle();
    const folder = await root.getDirectoryHandle("003database");
    const file = await folder.getFileHandle("database.json");
    const database = JSON.parse(await (await file.getFile()).text());
    assert.equal(Object.keys(database.videos).length, 1, "兜底路径要把这次统计写进去");
  });
  await test("统计分天跟着「视频收藏时间」走，不跟目录名（1.9.2）", async () => {
    /* 搬运/补档过来的老目录名是旧的，视频信息.txt 里的收藏时间是今天的。
       统计页和宠物都按「今日新增」这个口径报数，它必须和卡片上的日期一致。 */
    const pad = (value) => String(value).padStart(2, "0");
    const stampOf = (date) => `${date.getFullYear()}年${pad(date.getMonth() + 1)}月${pad(date.getDate())}日`
      + `${pad(date.getHours())}时${pad(date.getMinutes())}分${pad(date.getSeconds())}秒`;
    const favoriteOf = (date) => `${date.getFullYear()}年${pad(date.getMonth() + 1)}月${pad(date.getDate())}日 `
      + `${pad(date.getHours())}时${pad(date.getMinutes())}分${pad(date.getSeconds())}秒.100`;
    const today = new Date();
    today.setHours(10, 0, 0, 0);
    const earlier = new Date(today.getTime() - 3 * 24 * 60 * 60 * 1000);
    const tree = {
      "另一个夹": {
        [stampOf(earlier)]: {
          "视频信息.txt": INFO("搬运回来的老视频", { url: "https://www.bilibili.com/video/BV1aa411c7m1/", favoriteAt: favoriteOf(today) }),
          "封面.png": "PNG-1"
        },
        [stampOf(new Date(today.getTime() + 60 * 1000))]: {
          "视频信息.txt": INFO("今天新收的视频", { url: "https://www.bilibili.com/video/BV1bb411c7m2/", favoriteAt: favoriteOf(today) }),
          "封面.png": "PNG-2"
        }
      }
    };
    const page = dom.loadPage({ htmlFile: "library.html", chrome: makeChrome({ localData: {} }) });
    await settle();
    const g = page.window;
    const sent = [];
    g.chrome.runtime.sendMessage = async (message) => {
      sent.push(message);
      return { ok: true };
    };
    const root = await makeDirectoryTree({ "_测试归档": tree }).getDirectoryHandle("_测试归档");
    await g.displayRoot(root, "*", BcaT(page, "已读取"));
    await settle();
    const commits = sent.filter((item) => item && item.type === "bca-stats-commit");
    assert.equal(commits.length, 1, "构建完应该交一次库");
    const rows = Object.values(commits[0].database.videos);
    assert.equal(rows.length, 2, "两条不同的视频不能合并");
    const todayKey = g.BcaStatsCore.localDayKey(Date.now());
    assert.deepEqual(rows.map((row) => row.day), [todayKey, todayKey], "分天要按收藏时间");
    assert.equal(g.BcaStatsCore.snapshot(commits[0].database).savedToday, 2, "两条都要算进今天");
  });
  await test("详情抽屉打开时宠物收起来，关掉再放回来（1.8.10）", async () => {
    const page = await openLibrary({
      tree: sampleTree(),
      localData: { interfacePet: { enabled: true, size: 96, x: 0.5, y: 0.5 } }
    });
    const g = page.window;
    const html = page.document.documentElement;
    const card = page.document.querySelector(".video-card");
    assert.ok(card, "要有一张视频卡片可以点");
    assert.equal(html.classList.contains("bca-pet-suspended"), false);
    card.dispatchEvent(new g.MouseEvent("click", { bubbles: true }));
    await settle();
    assert.equal(page.document.getElementById("detailPanel").classList.contains("open"), true);
    assert.equal(html.classList.contains("bca-pet-suspended"), true, "抽屉开着时宠物必须收起");
    page.document.getElementById("closeDetail").dispatchEvent(new g.MouseEvent("click", { bubbles: true }));
    await settle();
    assert.equal(html.classList.contains("bca-pet-suspended"), false, "抽屉关掉后宠物要回来");
  });

  await test("统计页能用回调式 storage 真跑起来：有数据画卡片、空库显示空态（1.8.11）", async () => {
    /* stats.js 读快照用的是 chrome.storage.local.get(key, cb) 回调式，而 harness
       只有 Promise 版 —— 不补这一层，统计页的 init 永远不完成（这也正是它此前零覆盖的原因）。 */
    const wrap = (chrome) => {
      const area = chrome.storage.local;
      const rawGet = area.get.bind(area);
      area.get = function (keys, callback) {
        if (typeof callback !== "function") return rawGet(keys);
        return rawGet(keys).then((result) => callback(result));
      };
      return chrome;
    };
    const snapshot = {
      videos: 12,
      days: 3,
      totals: { savedTotal: 12 },
      firstSeen: "2026-05-01",
      collections: 2,
      topCollection: { name: "默认收藏夹", count: 9 },
      dailyRows: [{ day: "2026-05-19", count: 4 }, { day: "2026-05-20", count: 8 }],
      weekly: [{ week: "2026-05-18", count: 12 }],
      monthly: [{ month: "2026-05", count: 12 }],
      yearly: [{ year: "2026", count: 12 }]
    };
    const page = dom.loadPage({
      htmlFile: "stats.html",
      chrome: wrap(harness.makeChrome({ localData: { bcaStats: snapshot } }))
    });
    page.document.dispatchEvent({ type: "DOMContentLoaded" });
    await settle(12);
    assert.equal(page.document.getElementById("statVideos").textContent.trim(), "12", "视频总数要画出来");
    assert.equal(page.document.getElementById("statsEmpty").hidden, true, "有数据时不该显示空态");

    const emptyPage = dom.loadPage({ htmlFile: "stats.html", chrome: wrap(harness.makeChrome()) });
    emptyPage.document.dispatchEvent({ type: "DOMContentLoaded" });
    await settle(12);
    assert.equal(emptyPage.document.getElementById("statsEmpty").hidden, false, "空库要显示空态");
  });

  await test("统计快照变了但记录集没变时，收藏库不再整树重扫（1.8.16）", async () => {
    /* 真机症状：打开收藏库约 8 秒后整页闪两下。根因是本页自己写完统计库（原子换名约 7 秒）
       收到自己的回声，旧判据把「每日明细长度/收藏夹顺序变了」当成「有新记录」→ 再扫一遍。
       这里断言：记录集没变 → 一条重扫都不发生（连收藏夹分布变了也不扫，1.8.16）；
       记录集变了 → 照常重扫。 */
    const page = await openLibrary({ tree: sampleTree() });
    const doc = page.document;
    const notice = doc.getElementById("scanNotice");
    const seen = [];
    const watcher = new page.window.MutationObserver(() => { seen.push(notice.textContent); });
    watcher.observe(notice, { childList: true, characterData: true, subtree: true });

    const cardsBefore = [...doc.querySelectorAll(".video-card")];
    assert.ok(cardsBefore.length > 0, "应该先渲染出卡片");

    // 同一份记录集（条数与收藏夹分布都和界面上一致），只是统计快照换了一份
    // 侧栏里「全部视频」那一行是聚合行（key === "*"），统计快照里没有它，别算进来
    const sameSet = {
      videos: cardsBefore.length,
      days: 1,
      totals: { videos: cardsBefore.length, downloaded: 0, invalid: 0 },
      firstSeen: "",
      collections: 2,
      /* 1.8.16：不再看收藏夹分布 —— 侧栏按用户自定义顺序排、快照按名字排，
         两边永远对不上，「自己的回声」就被当成「新记录」了（真机 8 秒后闪两下）。 */
      daily: [],
      dailyRows: []
    };
    seen.length = 0;
    await page.__chrome.storage.local.set({ bcaStats: sameSet });
    await new Promise((resolve) => setTimeout(resolve, 1100)); // 越过 900ms 防抖窗口
    await settle();
    assert.deepEqual(seen, [], `记录集没变时不该重扫，实际提示变了：${seen.join(" | ")}`);
    assert.equal(doc.querySelector(".video-card"), cardsBefore[0], "卡片不该被重建（重建会整页闪一下）");

    // 记录集真的变了（条数不一样）→ 照常重扫一次
    seen.length = 0;
    await page.__chrome.storage.local.set({ bcaStats: Object.assign({}, sameSet, { videos: cardsBefore.length + 5 }) });
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await settle();
    assert.ok(seen.length > 0, "记录集变了应该重扫，但提示一次都没变");
    watcher.disconnect();
  });

  await test("Alt+↑/↓ 在收藏夹行上换序，焦点跟着走（1.7.23）", async () => {
    const page = await openLibrary({ tree: sampleTree() });
    const doc = page.document;
    const findRow = (name) => [...doc.querySelectorAll("#collectionList .collection-button")]
      .find((button) => textOf(button.querySelector(".collection-name")) === name);

    // 起始顺序：全部收藏 / 另一个夹 / 小鲸鱼测试
    const second = findRow("小鲸鱼测试");
    second.focus();
    second.dispatchEvent(new page.window.KeyboardEvent("keydown", { key: "ArrowUp", altKey: true, bubbles: true, cancelable: true }));
    await settle(6);
    const order = [...doc.querySelectorAll("#collectionList .collection-name")].map(textOf);
    assert.deepEqual(order, ["全部收藏", "小鲸鱼测试", "另一个夹"], "Alt+↑ 把「小鲸鱼测试」挪到前面");
    assert.equal(doc.activeElement.dataset.collectionKey, "小鲸鱼测试", "焦点要跟到同一行上");
    assert.deepEqual(await page.chrome.storage.local.get("collectionOrder").then((saved) => saved.collectionOrder),
      ["小鲸鱼测试", "另一个夹"], "换序要落盘（「全部收藏」是虚拟行，不进名单）");
  });

  await test("Ctrl+K 把焦点送进搜索框，收藏夹行的无障碍属性都在（1.7.23）", async () => {
    const page = await openLibrary({ tree: sampleTree() });
    const doc = page.document;
    const search = doc.getElementById("searchInput");
    doc.dispatchEvent(new page.window.KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true, cancelable: true }));
    await settle(2);
    assert.equal(doc.activeElement, search, "Ctrl+K 应当聚焦搜索框");

    // 行本身是原生 <button>（不是 div+role），所以看的是 tagName 与 aria-current
    const currentRow = [...doc.querySelectorAll("#collectionList .collection-button")]
      .find((button) => textOf(button.querySelector(".collection-name")) === "全部收藏");
    assert.ok(currentRow, "要有「全部收藏」这一行");
    currentRow.click();
    await settle(4);
    assert.equal(currentRow.getAttribute("aria-current"), "page", "当前收藏夹要标 aria-current=page");
    assert.equal(currentRow.getAttribute("aria-current"), "page");
    assert.equal(currentRow.tagName, "BUTTON");
    assert.equal(currentRow.type, "button");
    const others = [...doc.querySelectorAll("#collectionList .collection-button")].filter((button) => button !== currentRow);
    assert.ok(others.length >= 1, "至少还有一个夹可以对照");
    others.forEach((button) => assert.equal(button.getAttribute("aria-current"), "false", "没选中的行要标 false"));

    const card = doc.querySelector("#videoGrid .video-card");
    assert.equal(card.getAttribute("role"), "button", "卡片是 div + role=button");
    assert.equal(card.getAttribute("tabindex"), "0");
    assert.ok(card.getAttribute("aria-label"), "卡片要有可访问名");
  });

  await test("设置页导出归档元数据：真写进 004导出，校验和可复算，数据库里多出来的行标 stale（1.9.0）", async () => {
    const archiveCore = require("../archive-core.js");
    const chrome = makeChrome({ version: "1.9.0", localData: {} });
    const page = dom.loadPage({ htmlFile: "settings.html", chrome });
    await settle();
    const g = page.window;
    const root = await makeDirectoryTree({ "_测试归档": sampleTree() }).getDirectoryHandle("_测试归档");

    // 根句柄放进内存版 IndexedDB：settings.js 的 loadRootHandle 走的是真代码路径
    g.indexedDB = makeRootHandleDb(root);

    // 手工把数据库写成「1 条磁盘上找不到的旧行」，用来看 stale 的对照是否真的生效
    const databaseDirectory = await root.getDirectoryHandle("003database", { create: true });
    const databaseFile = await databaseDirectory.getFileHandle("database.json", { create: true });
    const databaseWritable = await databaseFile.createWritable();
    await databaseWritable.write(JSON.stringify({
      videos: { "bvid:BV1zz411c7mZ": { at: 1, day: "2026-01-01", collection: "旧夹", title: "旧行", bvid: "BV1zz411c7mZ", aid: "" } },
      totals: { savedTotal: 1 }
    }));
    await databaseWritable.close();

    const button = page.document.getElementById("settingsExportArchive");
    assert.ok(button, "设置页要有「导出归档元数据」按钮");
    button.click();
    await settle(32);

    const exportDirectory = await root.getDirectoryHandle("004导出");
    const firstNames = [];
    for await (const entry of exportDirectory.values()) firstNames.push(entry.name);
    assert.equal(firstNames.length, 1, `应该只写一份，实际 ${JSON.stringify(firstNames)}`);
    assert.match(firstNames[0], /^归档元数据-\d{8}-\d{6}\.json$/);

    const written = await (await exportDirectory.getFileHandle(firstNames[0])).getFile();
    const exported = JSON.parse(await written.text());
    assert.equal(exported.app, "bili-vault/archive-export");
    assert.equal(exported.schemaVersion, 1);
    assert.equal(exported.counts.records, 3, "三条都来自磁盘扫描");
    assert.equal(exported.counts.stale, 1, "数据库里多出来的那一行要标 stale");
    assert.equal(exported.stale[0].key, "bvid:BV1zz411c7mZ");
    assert.equal(exported.source.databaseState, "ok");
    assert.equal(archiveCore.verifyArchiveExportChecksum(exported).ok, true, "写出来的文件校验和必须能复算");

    // 再点一次：同秒也不许覆盖前一份
    button.click();
    await settle(32);
    const secondNames = [];
    for await (const entry of exportDirectory.values()) secondNames.push(entry.name);
    assert.equal(secondNames.length, 2, `同秒连点两次要留两份，实际 ${JSON.stringify(secondNames)}`);

    // 004导出 不能被当成一个收藏夹
    const scanned = await g.BcaArchiveTools.scanArchive(root);
    assert.equal(scanned.collections.some((collection) => collection.name === "004导出"), false, "004导出 被当成收藏夹扫出来了");
  });

  await test("结果计数会播报、宠物挂件不挡读屏与 Tab（P1-5 真执行）", async () => {
    const page = await openLibrary({ tree: sampleTree() });

    // 1) 结果计数是 polite 实时区：换页/筛选后读屏能听到「多少个视频」
    const summary = page.document.getElementById("resultSummary");
    assert.ok(summary, "顶栏应该有 #resultSummary");
    assert.equal(summary.getAttribute("aria-live"), "polite", "结果计数要挂 aria-live=polite");
    assert.ok(summary.textContent.trim().length > 0, "加载归档后结果计数不该是空的");

    // 2) 宠物是装饰挂件：整块 aria-hidden，按钮移出 Tab 序列（开关在设置页）
    const pet = page.document.getElementById("bcaPet");
    assert.ok(pet, "library.html 里宠物脚本应该已经把挂件建出来");
    assert.equal(pet.getAttribute("aria-hidden"), "true", "宠物挂件要从无障碍树里摘掉");
    const petButton = pet.querySelector("button");
    assert.ok(petButton, "宠物按钮应该存在");
    assert.equal(petButton.getAttribute("tabindex"), "-1", "宠物按钮不该落在 Tab 序列里");
  });
}

/* ---------------- popup.html ---------------- */

async function suitePopup() {
  await test("popup.html 整页真加载：四个脚本都跑了，角标与错误卡的 DOM 都在（1.7.23）", async () => {
    const chrome = makeChrome({ version: "1.7.23", localData: {} });
    const page = dom.loadPage({ htmlFile: "popup.html", chrome });
    await settle();
    assert.deepEqual(page.ran, ["theme.js", "i18n.js", "client-errors.js", "icons.js", "popup.js"]);
    assert.equal(page.warnings.length, 0, `加载期不该有 warning：${page.warnings.join(" | ")}`);
    assert.ok(page.document.getElementById("lastError"));
    assert.equal(page.document.getElementById("lastError").getAttribute("role"), "alert");
    assert.ok(page.document.getElementById("errorTitle"));
    assert.ok(page.document.getElementById("errorSummary"));
  });

  await test("导入失败：弹窗标题是「导入没有完成」、正文带 error 类，关掉之后才清角标（1.7.23）", async () => {
    const chrome = makeChrome({
      version: "1.7.23",
      localData: { importDone: { text: "导入失败：网络中断，已归档 12 条。", acknowledged: false, failed: true, at: Date.now() } }
    });
    const page = dom.loadPage({ htmlFile: "popup.html", chrome });
    await settle(10);
    const doc = page.document;
    const dialog = doc.getElementById("doneDialog");
    assert.ok(dialog, "要有完成对话框");
    assert.equal(dialog.open, true, "未读结果要弹出来");
    assert.equal(textOf(doc.getElementById("doneDialogTitle")), "导入没有完成");
    assert.match(textOf(doc.getElementById("doneDialogText")), /网络中断/);
    assert.equal(doc.getElementById("doneDialogText").classList.contains("error"), true, "失败态要上色");

    const storedBefore = await chrome.storage.local.get(null);
    assert.equal(storedBefore.importDone.acknowledged, false, "还没关掉，不许先标已读");
    assert.equal(
      chrome.__messages.some((message) => message.type === "bca-badge-clear"),
      false,
      "弹窗还开着、用户还没看到，角标就不许灭"
    );

    doc.getElementById("doneDialogClose").click();
    await settle(10);
    assert.equal(dialog.open, false);
    const stored = await chrome.storage.local.get(null);
    assert.equal(stored.importDone.acknowledged, true, "关掉之后要标记已读");
  });

  await test("导入成功：标题是正常的完成语，正文不上 error 类（1.7.23）", async () => {
    const chrome = makeChrome({
      version: "1.7.23",
      localData: { importDone: { text: "导入完成：12 条。", acknowledged: false, failed: false, at: Date.now() } }
    });
    const page = dom.loadPage({ htmlFile: "popup.html", chrome });
    await settle(10);
    const doc = page.document;
    assert.equal(textOf(doc.getElementById("doneDialogTitle")), "已完成");
    assert.equal(doc.getElementById("doneDialogText").classList.contains("error"), false);
  });

  await test("错误摘要：读不出授权时给人话，读得出时取报告里第一行带「失败/中止」的（1.7.23）", async () => {
    const chrome = makeChrome({ version: "1.7.23", localData: {} });
    const page = dom.loadPage({ htmlFile: "popup.html", chrome });
    await settle();
    const summarize = page.window.errorSummaryText;
    assert.equal(typeof summarize, "function");
    assert.match(summarize({ needsReauth: true }), /写入授权已失效/);
    assert.match(summarize({ report: "第一行随便\n导入失败：网络中断\n第二行" }), /导入失败：网络中断/);
    assert.match(summarize({}), /没有成功完成/);
  });

  await test("导入条数上限：下拉的五个档位都能读成数字，默认「全部」是 0（1.8.8）", async () => {
    const chrome = makeChrome({ version: "1.8.8", localData: {} });
    const page = dom.loadPage({ htmlFile: "popup.html", chrome });
    await settle();
    const doc = page.document;
    const select = doc.getElementById("importLimit");
    assert.ok(select, "导入面板要有「每次最多导入多少条」");
    assert.deepEqual([...doc.querySelectorAll("#importLimit option")].map((option) => option.value), ["50", "100", "300", "500", "0"]);
    const selectedByDefault = doc.querySelector("#importLimit option[selected]");
    assert.equal(selectedByDefault && selectedByDefault.value, "0", "默认必须是「全部」，否则老用户会觉得导入被截断");

    const readLimit = page.window.selectedImportLimit;
    assert.equal(typeof readLimit, "function", "上限要有一个统一的读法");
    select.value = "50";
    assert.equal(readLimit(), 50);
    select.value = "500";
    assert.equal(readLimit(), 500);
    select.value = "0";
    assert.equal(readLimit(), 0, "「全部」读出来必须是 0");
    select.value = "";
    assert.equal(readLimit(), 0, "读不到值时要退成「全部」，不许变成 NaN 把导入卡死");
  });}

/* ---------------- content.js ---------------- */

const VIDEO_PAGE = `<!DOCTYPE html><html><head></head><body>
  <h1 title="示例标题">示例标题</h1>
  <div class="up-info"><a class="up-name" href="//space.bilibili.com/12345">某人</a></div>
  <div class="video-tag-container"><a href="//www.bilibili.com/v/tag/1">标签一</a></div>
  <video src="x"></video>
  <div id="toolbar">
    <div class="video-toolbar-left">
      <div class="toolbar-left-item-wrap"><span class="toolbar-left-item">收藏</span></div>
      <div class="toolbar-left-item-wrap"><span class="toolbar-left-item">分享</span></div>
    </div>
  </div>
  <div class="bili-dialog"><div class="bili-dialog-body">
    <div class="bili-dialog-title">添加到收藏夹</div>
    <div class="bili-dialog-content"><div class="fav-list">
      <label class="fav-list-item"><input type="checkbox" checked><span>默认收藏夹</span></label>
    </div></div>
    <button class="confirm">确定</button>
  </div></div>
</body></html>`;

async function suiteContent() {
  async function openVideo(html = VIDEO_PAGE, chromeOptions = {}) {
    const chrome = makeChrome({ version: "1.7.23", ...chromeOptions });
    const page = dom.loadFragment({ html, chrome, scripts: ["i18n.js", "content.js"] });
    await settle(10);
    return page;
  }

  await test("content.js 在视频页真加载：收藏确认监听挂上了，接口没被乱调（1.7.23）", async () => {
    const page = await openVideo();
    assert.equal(page.warnings.length, 0, `加载期不该有 warning：${page.warnings.join(" | ")}`);
    assert.ok(page.document.querySelector("video"));
  });

  /* 「关掉弹层」这一步：content.js 的 waitForSuccessfulClose 就在等这个，
     等到了才发消息。真页面上是 B 站自己把弹层摘掉 / 设成 display:none。 */
  async function closeDialog(page) {
    const dialog = page.document.querySelector(".bili-dialog");
    dialog.parentNode.removeChild(dialog);
    await settle(8);
  }

  await test("收藏确认：页面脚本合成的点击一律忽略，真用户点击才发归档消息（1.7.23）", async () => {
    const page = await openVideo(VIDEO_PAGE, { localData: { enabled: true } });
    const chrome = page.chrome;
    const confirm = page.document.querySelector(".bili-dialog .confirm");
    assert.ok(confirm, "页面上要有确认按钮");

    // element.click() 造的是合成事件（isTrusted=false）——点完再把弹层关掉，
    // 整条链路（问导入状态 → 发归档）一步都不许动。归档开关必须是开的，
    // 否则「没发消息」会被 archiveEnabled 挡下来，测不出 isTrusted 这道闸。
    confirm.click();
    await closeDialog(page);
    assert.equal(chrome.__messages.length, 0, "合成点击点完再关弹层，一条消息都不许发");

    // 真用户点击（isTrusted=true）走完整条链路：点了 → 弹层关上 → 问状态 → 发归档
    const page2 = await openVideo(VIDEO_PAGE, { localData: { enabled: true } });
    const confirm2 = page2.document.querySelector(".bili-dialog .confirm");
    dom.fireUserEvent(confirm2, "click");
    await settle(4);
    await closeDialog(page2);
    const sent = page2.chrome.__messages;
    assert.equal(sent.length, 2, `真点击 + 弹层关上要发两条消息，实际 ${JSON.stringify(sent)}`);
    assert.equal(sent[0].type, "bca-import-status", "先问后台有没有导入在跑");
    assert.equal(sent[1].type, "save-favorite", "再发归档请求");
    assert.deepEqual(sent[1].data.folders.map((folder) => folder.name), ["默认收藏夹"]);
    assert.equal(sent[1].data.metadata.bvid, "BV1xx411c7mD");
    assert.ok(Number.isFinite(sent[1].data.favoriteAt), "收藏时间要用点击当下取的真实时间戳");
    assert.deepEqual(dom.takeObserverErrors().map((error) => String(error && error.message)), [], "影子 DOM 里的提示卡不许抛错");
  });

  await test("窗口状态读不到就认账：content.js 里不许再有活的 __INITIAL_STATE__ 读取（1.7.23）", async () => {
    const source = harness.readSource("content.js");
    const withoutComments = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    assert.equal(withoutComments.includes("__INITIAL_STATE__"), false, "只剩注释里提它是可以的，代码里不许再读");
    assert.equal(withoutComments.includes("__initialState__"), false);
  });
}

/* ---------------- settings.html ---------------- */

/** 内存版 IndexedDB：只够 theme.js 的壁纸存取（open / transaction / get / put / delete）。 */
function makeFakeIndexedDb(initial = {}) {
  const data = new Map(Object.entries(initial));
  const request = (result) => ({ result, error: null, onsuccess: null, onerror: null, onupgradeneeded: null });
  const db = {
    objectStoreNames: { contains: () => true },
    createObjectStore() {},
    close() {},
    transaction() {
      const tx = { error: null, oncomplete: null, onerror: null, onabort: null };
      tx.objectStore = () => ({
        get: (key) => request(data.has(key) ? data.get(key) : undefined),
        put: (value, key) => { data.set(key, value); return request(undefined); },
        delete: (key) => { data.delete(key); return request(undefined); }
      });
      setTimeout(() => { if (tx.oncomplete) tx.oncomplete(); }, 0);
      return tx;
    }
  };
  return {
    open() {
      const opened = request(db);
      setTimeout(() => {
        if (opened.onupgradeneeded) opened.onupgradeneeded();
        if (opened.onsuccess) opened.onsuccess();
      }, 0);
      return opened;
    }
  };
}

/** 只够 archive-tools.loadRootHandle：get 请求要按规范异步回调 onsuccess。 */
function makeRootHandleDb(rootHandle) {
  const request = (result) => {
    const req = { result, error: null, onsuccess: null, onerror: null, onupgradeneeded: null };
    setTimeout(() => { if (req.onsuccess) req.onsuccess(); }, 0);
    return req;
  };
  const db = {
    objectStoreNames: { contains: () => true },
    createObjectStore() {},
    close() {},
    transaction() {
      const tx = { error: null, oncomplete: null, onerror: null, onabort: null };
      tx.objectStore = () => ({
        get: (key) => request(key === "rootHandle" ? rootHandle : undefined),
        put: () => request(undefined),
        delete: () => request(undefined)
      });
      setTimeout(() => { if (tx.oncomplete) tx.oncomplete(); }, 0);
      return tx;
    }
  };
  return {
    open() {
      const opened = request(db);
      setTimeout(() => {
        if (opened.onupgradeneeded) opened.onupgradeneeded();
        if (opened.onsuccess) opened.onsuccess();
      }, 0);
      return opened;
    }
  };
}

/** 起一页 settings.html（`globals` 可注 fetch 等桩）。 */
async function openSettings(options = {}) {
  const chrome = makeChrome({ version: "1.8.23", localData: options.localData || {} });
  const page = dom.loadPage({ htmlFile: "settings.html", chrome, globals: options.globals });
  page.__chrome = chrome;
  await settle();
  return page;
}

async function suiteSettings() {
  await test("设置页滑杆 input 连发只写一次 storage，松手落最后一次（1.8.12 真执行）", async () => {
    const page = await openSettings();
    const blur = page.document.getElementById("wallpaperBlur");
    assert.ok(blur, "设置页应该有毛玻璃强度滑杆");

    // theme.js 里每次 setAppearance 都会镜像一份到 chrome.storage.local
    const writes = [];
    const area = page.chrome.storage.local;
    const originalSet = area.set;
    area.set = (patch) => { writes.push(patch); return originalSet(patch); };
    const appearanceWrites = () => writes.filter((patch) => patch && Object.prototype.hasOwnProperty.call(patch, "interfaceAppearance"));

    // 拖着走：连续 5 帧 input
    for (const value of [12, 16, 20, 24, 28]) {
      blur.value = String(value);
      dom.fireUserEvent(blur, "input");
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(appearanceWrites().length, 0, "拖动过程中不该每一帧都写一次 storage");
    assert.match(page.document.getElementById("wallpaperBlurValue").textContent.trim(), /^28\s*px$/, "数值文本要即时跟上");

    // 攒批窗口过去以后只剩一次写，值是最后一帧
    await new Promise((resolve) => setTimeout(resolve, 200));
    await settle();
    assert.equal(appearanceWrites().length, 1, `五帧 input 只该合并成一次写，实际 ${appearanceWrites().length} 次`);
    const saved = JSON.parse(appearanceWrites()[0].interfaceAppearance);
    assert.equal(saved.blur, 28, "写进去的必须是最后一帧的值");

    // 松手（change）立刻落盘：再拖一次然后 change，不该等 120ms
    blur.value = "30";
    dom.fireUserEvent(blur, "input");
    dom.fireUserEvent(blur, "change");
    await new Promise((resolve) => setTimeout(resolve, 0));
    const afterChange = JSON.parse(appearanceWrites()[appearanceWrites().length - 1].interfaceAppearance);
    assert.equal(afterChange.blur, 30, "松手要立刻落最后一次，不能被节流吞掉");
  });

  await test("设置页的背景图状态跟着 IndexedDB 里的 Blob 走（有图 / 移除后 / 再选）", async () => {
    const page = await openSettings();
    const choose = page.document.getElementById("wallpaperChoose");
    assert.ok(choose, "设置页应该有背景图片按钮");
    assert.equal(choose.textContent.trim(), BcaT(page, "选择背景图片"), "一开始没有背景图");

    // BcaTheme 是冻结对象，改不了它的方法；把 indexedDB 换成内存版，走的是真代码路径
    page.window.indexedDB = makeFakeIndexedDb();
    const blob = new page.window.Blob(["fake-png"], { type: "image/png" });
    await page.window.BcaTheme.saveWallpaper(blob);
    await page.window.refreshWallpaperState();
    assert.equal(choose.textContent.trim(), BcaT(page, "更换背景图片"), "存进 Blob 以后按钮要变成「更换」");

    await page.window.BcaTheme.clearWallpaper();
    await page.window.refreshWallpaperState();
    assert.equal(choose.textContent.trim(), BcaT(page, "选择背景图片"), "移除之后按钮要回到「选择」");

    await page.window.BcaTheme.saveWallpaper(blob);
    await page.window.refreshWallpaperState();
    assert.equal(choose.textContent.trim(), BcaT(page, "更换背景图片"), "再选一张又要变回「更换」");
  });

  await test("切到英文后设置页所有 data-i18n 都重译（1.8.23 真执行）", async () => {
    // 用设置页自己的 data-i18n 键现造一份「英文」词典：只要重译真的发生了，
    // 每个元素的文字都会以 EN:: 开头 —— 键名本身不重要，覆盖率才是重点。
    const html = harness.readSource("settings.html");
    const keys = new Set([...html.matchAll(/data-i18n(?:-html|-title|-placeholder|-aria)?="([^"]+)"/g)].map((match) => match[1]));
    assert.ok(keys.size > 40, `设置页应该有大量 data-i18n 键，实际 ${keys.size}`);
    const dictionary = {};
    for (const key of keys) dictionary[key] = `EN::${key}`;

    const page = await openSettings({
      globals: { fetch: async () => ({ ok: true, status: 200, json: async () => dictionary }) }
    });
    await page.window.BcaI18n.use("en");
    await settle();

    assert.equal(page.document.documentElement.lang, "en");
    const elements = [...page.document.querySelectorAll("[data-i18n]")];
    assert.ok(elements.length > 40, `应该有大量 data-i18n 元素，实际 ${elements.length}`);
    const stale = elements.filter((element) => !element.textContent.includes(`EN::${element.dataset.i18n}`));
    assert.deepEqual(stale.map((element) => element.dataset.i18n), [],
      "切语言后还有元素停在原文（没被重译）");

    // 切回中文：词典表清空，data-i18n 元素要回到中文原文
    await page.window.BcaI18n.use("zh-CN");
    await settle();
    const backStale = [...page.document.querySelectorAll("[data-i18n]")]
      .filter((element) => element.textContent.includes("EN::"));
    assert.deepEqual(backStale.map((element) => element.dataset.i18n), [],
      "切回中文后不该还有英文残留");
  });

  await test("设置页「重建数据库」先备份旧库、再按归档重建并强制重发快照（1.9.3 真执行）", async () => {
    const page = await openSettings();
    const g = page.window;
    const root = await makeDirectoryTree({ _测试归档: sampleTree() }).getDirectoryHandle("_测试归档");
    g.indexedDB = makeRootHandleDb(root);

    // 一份「旧库」：内容故意是空的，好确认重建结果不是拿它出来的
    const directory = await root.getDirectoryHandle(g.BcaStatsCore.DATABASE_FOLDER_NAME, { create: true });
    const oldFile = await directory.getFileHandle(g.BcaStatsCore.DATABASE_FILE_NAME, { create: true });
    const oldWritable = await oldFile.createWritable();
    await oldWritable.write(JSON.stringify(g.BcaStatsCore.emptyDatabase(Date.now())));
    await oldWritable.close();

    const sent = [];
    page.chrome.runtime.sendMessage = async (message) => { sent.push(message); return { ok: true }; };

    assert.ok(page.document.getElementById("rebuildStats"), "设置页要有「重建数据库」按钮");
    const result = await g.BcaSettingsTransfer.rebuildStatsDatabase();
    assert.equal(sent.length, 1, "重建只该提交一次");
    assert.equal(sent[0].type, "bca-stats-commit");
    assert.equal(sent[0].republishSnapshot, true, "要强制后台重发快照，否则界面还停在旧口径");
    assert.equal(Object.keys(sent[0].database.videos || {}).length, 3, "三条归档记录都该进库");
    assert.equal(result.rows, 3);
    assert.match(result.backup, /^database\.backup-\d{8}-\d{6}\.json$/, "旧库要带时间后缀备份");
    const names = [];
    for await (const entry of directory.values()) names.push(entry.name);
    assert.ok(names.includes(result.backup), "备份文件要真的写进 003database");
  });
}

/* ---------------- 跑 ---------------- */

async function suite() {
  await suiteLibrary();
  await suitePopup();
  await suiteContent();
  await suiteSettings();
}

module.exports = { get results() { return { passed, failed, failures }; }, suite };

if (isMain) {
  suite().then(() => {
    process.stdout.write("\n\n");
    for (const { name, error } of failures) {
      console.log(`✖ ${name}`);
      console.log(`    ${String((error && error.message) || error).split("\n")[0]}`);
      if (error && error.expected !== undefined) {
        console.log(`  期望 ${JSON.stringify(error.expected)} / 实际 ${JSON.stringify(error.actual)}`);
      }
    }
    console.log(`ℹ tests ${passed + failed}`);
    console.log(`ℹ pass ${passed}`);
    console.log(`ℹ fail ${failed}`);
    process.exit(failed === 0 ? 0 : 1);
  }).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
