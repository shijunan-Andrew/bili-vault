"use strict";
/*
  library.html / settings.html / popup.html / stats.html / recycle.html 这几个「要真 DOM 才能加载」的页面脚本与 content.js，**真执行**测试。

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
// 1.12.4：真跑 favorites-import.js 要一个像样的扩展 id（它只接受自己人发来的消息）
const FAVORITES_EXT_ID = "abcdefghijklmnopabcdefghijklmnop";
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

const INFO = (title, extra = {}) => {
  // 1.9.4：简介要能分别造「真简介 / 分享文案 / 就是标题 / 没有」几种样本
  const description = extra.description === undefined ? "第一行简介" : extra.description;
  return [
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
    ...(extra.stats === false ? [] : [
      "【互动数据】",
      `播放量：${extra.view || "1000"}`,
      "弹幕量：20",
      ""
    ]),
    "【标签】",
    "标签一、标签二",
    "",
    "【视频简介】",
    ...(description === null ? [] : [description])
  ].join("\r\n");
};

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
  await test("空态的两张步骤卡各讲一件事，不再三张挤着重复说明（1.10.17 真执行）", async () => {
    const page = await openLibrary();
    const doc = page.document;
    const steps = doc.querySelectorAll(".welcome-step");
    assert.equal(steps.length, 2, "步骤卡从三张压成两张");
    assert.equal(steps[0].querySelector("strong").textContent.trim(), BcaT(page, "选择一个本地备份文件夹"));
    assert.equal(steps[1].querySelector("strong").textContent.trim(),
      BcaT(page, "收藏时自动归档，也能批量导入"));
  });

  await test("library.html 整页真加载：七个脚本都跑了，侧栏版本号来自 manifest", async () => {
    const page = await openLibrary();
    assert.deepEqual(page.ran, ["theme.js", "i18n.js", "client-errors.js", "icons.js", "archive-core.js", "archive-tools.js", "stats-core.js", "library.js", "pet.js"]);
    assert.equal(page.document.getElementById("sideVersion").textContent, "V1.7.23");
    assert.equal(page.warnings.length, 0, `加载期不该有 warning：${page.warnings.join(" | ")}`);
  });

  await test("扫描完把「收藏夹 → BV → 目录名」发布给后台，收藏时不再重复建目录（1.9.3）", async () => {
    const page = await openLibrary({ tree: sampleTree() });
    await settle();
    const stored = page.__chrome.storage.local.dump().biliVaultBvIndex || {};
    assert.deepEqual(stored["小鲸鱼测试"], { BV1xx411c7mD: "2026年10月09日01时19分50秒", BV1yy411c7mE: "2026年10月10日02时20分00秒" });
    assert.equal(stored["另一个夹"], undefined, "没有 BV 号的记录不进索引");
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

  await test("侧栏收藏夹能置顶：点图钉就排到最前，顺序存进 collectionOrder（1.11.6 真执行）", async () => {
    const page = await openLibrary({ tree: sampleTree() });
    await settle(6);
    const doc = page.document;
    const rows = () => idsIn(doc.getElementById("collectionList"), ".collection-name");
    assert.deepEqual(rows(), ["全部收藏", "另一个夹", "小鲸鱼测试"], "默认按名字排");

    const row = [...doc.querySelectorAll("#collectionList .collection-row")]
      .find((item) => textOf(item.querySelector(".collection-name")) === "小鲸鱼测试");
    const pin = row.querySelector(".collection-pin");
    assert.ok(pin, "非「全部收藏」的行都要有置顶按钮");
    assert.equal(doc.querySelectorAll("#collectionList .collection-pin").length, 2, "「全部收藏」那一行没有置顶按钮");

    pin.click();
    await settle(6);
    assert.deepEqual(rows(), ["全部收藏", "小鲸鱼测试", "另一个夹"], "点完就排到最前");
    const stored = page.__chrome.storage.local.dump().collectionOrder;
    assert.deepEqual(stored.slice(0, 2), ["小鲸鱼测试", "另一个夹"], "顺序写进了 collectionOrder");
  });

  await test("点已经排在最前的收藏夹图钉，底部提示条会亮起来说「已经在最上面了」（1.11.7 真执行）", async () => {
    const page = await openLibrary({ tree: sampleTree() });
    await settle(6);
    const doc = page.document;
    const toast = doc.getElementById("toast");
    assert.ok(toast, "收藏库要有 #toast 这个提示条");

    const row = [...doc.querySelectorAll("#collectionList .collection-row")]
      .find((item) => textOf(item.querySelector(".collection-name")) === "小鲸鱼测试");
    row.querySelector(".collection-pin").click();
    await settle(6);
    assert.ok(toast.classList.contains("show"), "置顶后要给回执");
    assert.equal(
      textOf(toast),
      BcaT(page, "已把「{name}」置顶", { name: "小鲸鱼测试" }),
      "置顶的文案与词典一致",
    );
    // 已经排到最前了，再点一次只会给一句提示，不动顺序
    const again = [...doc.querySelectorAll("#collectionList .collection-row")]
      .find((item) => textOf(item.querySelector(".collection-name")) === "小鲸鱼测试");
    again.querySelector(".collection-pin").click();
    await settle(4);

    assert.ok(toast.classList.contains("show"), "提示条要真的亮起来（用户的抱怨正是它亮了却看不清）");
    assert.equal(
      textOf(toast),
      BcaT(page, "「{name}」已经在最上面了", { name: "小鲸鱼测试" }),
      "文案与词典一致",
    );
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

  await test("详情里的简介来自【视频简介】：分享文案与「简介就是标题」都按没有简介处理（1.9.4）", async () => {
    const shareText = "分享文案测试, 视频播放量 157608、弹幕量 746、点赞数 5862、投硬币枚数 166、收藏人数 1127、转发人数 197, 视频作者 某人, 作者简介 简介文字, 相关视频：别的视频标题";
    const tree = {
      "小鲸鱼测试": {
        "2026年10月09日01时19分50秒": { "视频信息.txt": INFO("真简介视频", { description: "真正的简介第一行\n真正的第二行" }), "封面.png": "PNG-1" },
        "2026年10月10日02时20分00秒": { "视频信息.txt": INFO("分享文案视频", { description: shareText }), "封面.png": "PNG-2" },
        "2026年10月11日03时30分00秒": { "视频信息.txt": INFO("标题当简介视频", { description: "标题当简介视频" }), "封面.png": "PNG-3" }
      }
    };
    const page = await openLibrary({ tree });
    const doc = page.document;
    const openByTitle = async (title) => {
      const card = [...doc.querySelectorAll("#videoGrid .video-card")]
        .find((item) => textOf(item.querySelector(".card-title")) === title);
      assert.ok(card, "找不到卡片：" + title);
      card.click();
      await settle(6);
      // 没有简介时 library.js 会把该类名整个换成 detail-empty，所以两种都要找
      const box = doc.querySelector("#detailContent .detail-description") || doc.querySelector("#detailContent p.detail-empty");
      assert.ok(box, "详情面板里要有简介容器");
      return box.classList.contains("detail-empty") ? "" : box.textContent;
    };

    assert.equal(await openByTitle("真简介视频"), "真正的简介第一行\n真正的第二行");
    assert.equal(await openByTitle("分享文案视频"), "", "分享文案不算简介");
    assert.equal(await openByTitle("标题当简介视频"), "", "简介就是标题时也不显示");
  });

  await test("没有互动数据的记录显示 N/A，并提示去「更新视频数据」（1.9.5）", async () => {
    const tree = {
      "小鲸鱼测试": {
        "2026年10月09日01时19分50秒": { "视频信息.txt": INFO("没抓到数据的视频", { stats: false, upName: "某人" }), "封面.png": "PNG-1" }
      }
    };
    const page = await openLibrary({ tree });
    const doc = page.document;
    const card = doc.querySelector("#videoGrid .video-card");
    assert.ok(card, "应该有卡片");
    assert.equal(textOf(card.querySelector(".cover-views")), "N/A 播放", "卡片播放量缺失要显示 N/A");
    card.click();
    await settle(6);
    const values = [...doc.querySelectorAll("#detailContent .detail-stat-value")].map((node) => textOf(node));
    assert.equal(values.length, 6, "六项互动数据都要占位");
    assert.deepEqual(values, ["N/A", "N/A", "N/A", "N/A", "N/A", "N/A"]);
    assert.match(textOf(doc.querySelector("#detailContent .detail-up-fans")), /N\/A/, "粉丝数缺失也要显示 N/A");
    const warning = doc.querySelector("#detailContent .detail-refresh-warning");
    assert.ok(warning, "数据不完整时要有提示");
    assert.equal(textOf(warning), BcaT(page, "该视频数据不完整（粉丝数N/A或互动数据N/A），更新视频数据将重新获取这些信息，或能解决"));
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

  await test("「只导外观与档位」收进「更多导出」下拉，选完自己收起（1.10.18 真执行）", async () => {
    const page = await openSettings({ localData: {} });
    const doc = page.document;
    const more = doc.getElementById("exportMore");
    assert.ok(more, "配置行要有「更多导出」下拉");
    assert.ok(more.contains(doc.getElementById("settingsExportConfigSlim")), "精简导出必须在下拉里面");
    assert.equal(more.open, false, "下拉默认收起");

    const blobs = [];
    const originalCreate = page.window.URL.createObjectURL;
    page.window.URL.createObjectURL = (blob) => { blobs.push(blob); return "blob:test/slim"; };
    page.window.confirm = () => true;
    try {
      more.open = true;
      doc.getElementById("settingsExportConfigSlim").click();
      await settle(6);
      assert.equal(blobs.length, 1, "点下拉里的项仍然能导出");
      assert.equal(more.open, false, "选完要自己收起，别一直挡着下面的行");
    } finally {
      page.window.URL.createObjectURL = originalCreate;
    }
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
    const wrap = withCallbackStorage;
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

  await test("开源横幅是静态单行：一段文字、不滚动、可关闭（1.10.10）", async () => {
    const page = await openLibrary();
    await settle();
    const doc = page.document;
    const banner = doc.getElementById("githubBanner");
    assert.ok(banner, "library.html 里要有 #githubBanner");
    assert.equal(banner.hidden, false, "没关过就该显示");
    assert.equal(banner.querySelectorAll(".banner-run").length, 1, "只留一段文字");
    assert.equal(banner.querySelector(".banner-scroll"), null, "不该再有滚动容器");
    assert.equal(doc.documentElement.classList.contains("banner-visible"), true,
      "横幅出现时页面要靠 banner-visible 让出高度");
  });

  await test("顶栏会挂出「继续上次导入」，点关闭就不再出现（1.12.5）", async () => {
    const page = await openLibrary({
      localData: {
        bcaImportResume: { folder: "蜻蜓小新", page: 3, saved: 42, folderIds: ["11", "22"], at: Date.now() }
      }
    });
    await settle(12);
    const notice = page.document.getElementById("resumeImportNotice");
    const text = page.document.getElementById("resumeImportText");
    assert.ok(notice, "library.html 里要有 #resumeImportNotice");
    assert.equal(notice.hidden, false, "有断点记录就该挂出来");
    assert.match(textOf(text), /蜻蜓小新/);
    assert.match(textOf(text), /第 3 页/);
    dom.fireUserEvent(page.document.getElementById("dismissResumeImport"), "click");
    await settle(4);
    assert.equal(notice.hidden, true);
    const stored = await page.__chrome.storage.local.get("bcaResumeNoticeDismissedAt");
    assert.ok(Number(stored.bcaResumeNoticeDismissedAt) > 0, "关闭状态要记住");
  });

  await test("没有断点记录时，那条提示不出现（1.12.5）", async () => {
    const page = await openLibrary({ localData: {} });
    await settle(12);
    assert.equal(page.document.getElementById("resumeImportNotice").hidden, true);
  });
}


/* ---------------- popup.html ---------------- */

async function suitePopup() {
  await test("文件夹卡只剩一句提示，首屏不再被文案占满（1.10.17 真执行）", async () => {
    const chrome = makeChrome({ version: "1.10.17", localData: {} });
    const page = dom.loadPage({ htmlFile: "popup.html", chrome });
    await settle();
    const hints = [...page.document.querySelectorAll(".folder-card .hint")].filter((el) => el.hidden === false);
    assert.equal(hints.length, 1, "两块提示已经并成一句");
    assert.equal(hints[0].textContent.trim(),
      BcaT(page, "和收藏库右上角是同一个位置；选一次就会记住路径，并按收藏夹名称和时间建子目录。"));
  });

  await test("popup.html 整页真加载：四个脚本都跑了，角标与错误卡的 DOM 都在（1.7.23）", async () => {
    const chrome = makeChrome({ version: "1.7.23", localData: {} });
    const page = dom.loadPage({ htmlFile: "popup.html", chrome });
    await settle();
    assert.deepEqual(page.ran, ["theme.js", "i18n.js", "client-errors.js", "icons.js", "archive-core.js", "popup.js"]);
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

/** stats.js 读快照用回调式 storage，harness 只有 Promise 版：补这一层，init 才走得完。 */
function withCallbackStorage(chrome) {
  const area = chrome.storage.local;
  const rawGet = area.get.bind(area);
  area.get = function (keys, callback) {
    if (typeof callback !== "function") return rawGet(keys);
    return rawGet(keys).then((result) => callback(result));
  };
  return chrome;
}

/** 起一页 stats.html（统计页只读 bcaStats 快照，另外靠一条消息让后台补发）。 */
async function openStats(options = {}) {
  const chrome = withCallbackStorage(makeChrome({
    version: "1.10.0",
    localData: options.localData || {},
    onRuntimeMessage: options.onRuntimeMessage
  }));
  const page = dom.loadPage({ htmlFile: "stats.html", chrome });
  page.__chrome = chrome;
  page.document.dispatchEvent({ type: "DOMContentLoaded" });
  await settle(12);
  return page;
}

/** 起一页 recycle.html（1.10.0）。回收站的数据面全在 BcaArchiveTools 里，
    测试把那一整块换成桩，页面自己的渲染 / 选择 / 确认 / 文案走真代码。 */
async function openRecycle(options = {}) {
  const chrome = makeChrome({ version: "1.10.0", localData: options.localData || {} });
  const page = dom.loadPage({ htmlFile: "recycle.html", chrome, globals: options.globals });
  page.__chrome = chrome;
  await settle();
  return page;
}

/** 回收站工具桩：只回测试要的那几样，并把「哪些条目被恢复 / 删掉」记下来供断言。 */
function makeRecycleTools(options = {}) {
  const state = {
    entries: (options.entries || []).map((entry) => ({ ...entry })),
    restored: [],
    deleted: [],
    purged: 0,
    lists: 0
  };
  const tools = {
    loadRootHandle: async () => (options.noRoot ? null : { name: "归档" }),
    ensureRootPermission: async () => options.permission !== false,
    listRecycled: async () => {
      state.lists += 1;
      return state.entries.map((entry) => ({ ...entry }));
    },
    field: (info, name) => String((info && info[name]) || ""),
    formatMegabytes: (bytes) => `${Math.round((Number(bytes) || 0) / (1024 * 1024))} MB`,
    reportListLine: (failures) => (failures || []).map((failure) => String((failure && failure.message) || failure)),
    restoreRecycled: async (handle, chosen) => {
      const paths = chosen.map((entry) => entry.path);
      state.restored.push(paths);
      state.entries = state.entries.filter((entry) => !paths.includes(entry.path));
      return { restored: chosen, failures: [] };
    },
    deleteRecycled: async (handle, chosen) => {
      const paths = chosen.map((entry) => entry.path);
      state.deleted.push(paths);
      state.entries = state.entries.filter((entry) => !paths.includes(entry.path));
      return { removed: paths.length, failures: [] };
    },
    purgeRecycler: async () => {
      const removed = state.entries.length;
      state.purged += 1;
      state.entries = [];
      return { removed, failures: [] };
    }
  };
  return { tools, state };
}

/** 一条回收站条目（path 带 005回收站/ 前缀，和 archive-tools 给的一致）。 */
function recycleEntry(stamp, extra = {}) {
  return {
    path: `005回收站/${stamp}/小鲸鱼测试/2026年10月09日01时19分50秒`,
    collection: "小鲸鱼测试",
    directory: "2026年10月09日01时19分50秒",
    deletedAt: "2026-05-19T10:00:00.000Z",
    record: { bytes: 2 * 1024 * 1024, info: { "视频标题": extra.title || "被删掉的那一条", "UP主昵称": "小鲸鱼UP" } },
    ...extra
  };
}

async function suiteSettings() {
  await test("每张卡的标题留在页面底色上，只有行包在白卡里（1.11.6 真执行）", async () => {
    const page = await openSettings();
    const doc = page.document;
    const cards = [...doc.querySelectorAll(".settings-main .settings-card[data-group]")];
    assert.equal(cards.length, 10, "十张卡");
    for (const card of cards) {
      const title = card.querySelector("h2");
      assert.ok(title, `${card.id} 要有标题`);
      assert.equal(title.closest(".settings-panel"), null, `${card.id} 的标题不该被包进白卡`);
      const panel = card.querySelector(".settings-panel");
      assert.ok(panel, `${card.id} 要有 .settings-panel`);
      assert.ok(panel.querySelector(".setting-row"), `${card.id} 的行要留在白卡里`);
      assert.equal(panel.contains(title), false);
    }
    const localdata = doc.getElementById("group-localdata");
    assert.equal(localdata.textContent.includes("归档会记录收藏时间"), false, "这一行 1.11.6 已移除");
  });

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

  // ---- 1.10.1：导出清单 / 完整度巡检 / 补全互动数据 ----

  await test("设置页「导出清单」没选备份文件夹时说清下一步，不是一句失败（1.10.1 真执行）", async () => {
    const page = await openSettings();
    const doc = page.document;
    dom.fireUserEvent(doc.getElementById("settingsExportMarkdown"), "click");
    await settle(8);
    // 「还没选文件夹」不是故障，走状态行；错误行不该同时亮着。
    const status = doc.getElementById("exportMarkdownStatus");
    assert.equal(status.hidden, false, "状态行要露出来");
    assert.equal(status.textContent.trim(), BcaT(page, "先选一个本地备份文件夹，再导出清单。"));
    assert.equal(doc.getElementById("exportMarkdownError").hidden, true, "这不是报错，别用红色错误行");
    assert.equal(doc.getElementById("settingsExportMarkdown").disabled, false, "按钮要还回来");
  });

  await test("设置页「完整度巡检」扫完报清三种缺失，并把补全按钮放出来（1.10.1 真执行）", async () => {
    const scan = {
      collections: [
        { name: "甲", records: [{ directory: "d1", record: {} }, { directory: "d2", record: {} }] }
      ],
      diagnostics: {
        missingText: [{ collection: "甲", directory: "d1" }],
        missingCover: [{ collection: "甲", directory: "d2" }],
        brokenText: [],
        tempFiles: []
      },
      issues: { missingText: [], brokenText: [], tempFiles: [] },
      recordCount: 2,
      bytes: 0
    };
    const globals = {
      BcaArchiveTools: {
        loadRootHandle: async () => ({ name: "归档" }),
        ensureRootPermission: async () => true,
        scanArchive: async () => scan,
        // 甲/d1：缺互动数据；甲/d2：缺封面（缺封面只由 diagnostics 反映，见 1.10.3）。
        // cover 一律给空串：真实 recordToVideo() 就是这个形状（句柄在 record.coverEntry）。
        recordToVideo: (collection, entry) => ({
          collection,
          directory: entry.name,
          title: entry.name,
          cover: "",
          description: entry.name === "d2" ? "说明" : "",
          stats: entry.name === "d1"
            ? { view: "N/A", danmaku: "N/A", like: "N/A", coin: "N/A", favorite: "N/A", share: "N/A" }
            : { view: "100" }
        })
      }
    };
    // settings.html 自己会加载 archive-tools.js，把 globals 里的同名桩盖掉，
    // 所以等脚本跑完再换 —— 页面调用时按全局名取，换完就吃到桩。
    const page = await openSettings();
    page.window.BcaArchiveTools = globals.BcaArchiveTools;
    const doc = page.document;
    // archive-core.js 是页面自己真加载的，integritySummary 走真代码。
    const fillButton = doc.getElementById("fillMissingStats");
    assert.equal(fillButton.hidden, true, "还没巡检的时候补全按钮不该露面");

    dom.fireUserEvent(doc.getElementById("runIntegrityCheck"), "click");
    await settle(10);

    const status = doc.getElementById("integrityStatus");
    assert.equal(status.hidden, false, "巡检结果要显示出来");
    assert.equal(status.textContent.trim(), BcaT(page,
      "扫完 {count} 条记录：{stats} 条缺互动数据、{cover} 条缺封面、{description} 条缺简介，读不出来的目录 {broken} 个。", {
        count: page.window.BcaArchiveCore.formatCountText(2),
        stats: page.window.BcaArchiveCore.formatCountText(1),
        cover: page.window.BcaArchiveCore.formatCountText(1),
        description: page.window.BcaArchiveCore.formatCountText(1),
        broken: page.window.BcaArchiveCore.formatCountText(1)
      }));
    assert.equal(fillButton.hidden, false, "有东西可补的时候要把补全按钮放出来");
    assert.equal(doc.getElementById("runIntegrityCheck").disabled, false, "巡检按钮要还回来");
  });

  await test("「补全互动数据」按批发 bca-refresh-video-stats，补完报还剩多少（1.10.1 真执行）", async () => {
    let scans = 0;
    const scanOnce = () => {
      scans += 1;
      // 第一次巡检 25 条都缺；补完再巡 0 条。
      const count = scans === 1 ? 25 : 0;
      return {
        collections: [{
          name: "甲",
          records: Array.from({ length: count }, (unused, index) => ({ directory: `d${index}`, record: {} }))
        }],
        diagnostics: { missingCover: [], missingDescription: [] },
        issues: { missingText: [], brokenText: [], tempFiles: [] },
        recordCount: count,
        bytes: 0
      };
    };
    const globals = {
      BcaArchiveTools: {
        loadRootHandle: async () => ({ name: "归档" }),
        ensureRootPermission: async () => true,
        scanArchive: async () => scanOnce(),
        recordToVideo: (collection, entry) => ({
          collection,
          directory: entry.name,
          cover: "",
          description: "D",
          stats: { view: "N/A", danmaku: "N/A", like: "N/A", coin: "N/A", favorite: "N/A", share: "N/A" }
        })
      }
    };
    // settings.html 自己会加载 archive-tools.js，把 globals 里的同名桩盖掉，
    // 所以等脚本跑完再换 —— 页面调用时按全局名取，换完就吃到桩。
    const page = await openSettings();
    page.window.BcaArchiveTools = globals.BcaArchiveTools;
    const doc = page.document;
    const batches = [];
    // settings.js 用的是回调式 sendMessage（和扩展里一致），桩要记得回 callback。
    page.chrome.runtime.sendMessage = (message, callback) => {
      let reply;
      if (message && message.type === "bca-refresh-video-stats") {
        batches.push(message.targets.map((target) => target.directory));
        reply = { ok: true, processed: message.targets.length, updated: message.targets.length, failed: 0, remaining: 0 };
      }
      if (typeof callback === "function") { callback(reply); return undefined; }
      return Promise.resolve(reply);
    };

    dom.fireUserEvent(doc.getElementById("runIntegrityCheck"), "click");
    await settle(10);
    assert.equal(doc.getElementById("fillMissingStats").hidden, false, "25 条缺数据，补全按钮要露面");

    dom.fireUserEvent(doc.getElementById("fillMissingStats"), "click");
    await settle(30);

    assert.equal(batches.length, 2, `25 条要分两批（20 + 5），实际 ${batches.length} 批`);
    assert.equal(batches[0].length, 20, "第一批 20 条");
    assert.equal(batches[1].length, 5, "第二批 5 条");
    const status = doc.getElementById("integrityStatus");
    assert.equal(status.hidden, false);
    assert.equal(status.textContent.trim(), BcaT(page,
      "补了 {updated} 条；现在还剩 {remaining} 条缺互动数据。", { updated: "25", remaining: "0" }),
      "补完要报补了多少条、还剩多少");
    assert.equal(doc.getElementById("fillMissingStats").hidden, true, "没东西可补了就把按钮收起来");
  });

  // ---- 1.10.3：动作按钮先确认后回执 ----

  await test("归档体检 / 导出清单 / 完整度巡检都是先问再做，取消就一步都不走（1.10.3 真执行）", async () => {
    let scans = 0;
    const page = await openSettings();
    page.window.BcaArchiveTools = {
      loadRootHandle: async () => ({ name: "归档" }),
      ensureRootPermission: async () => true,
      scanArchive: async () => { scans += 1; return { collections: [], diagnostics: {}, issues: [], unfinished: [], longNames: [], bytes: 0, recordCount: 0 }; },
      recordToVideo: () => null,
      subdirectoryHandle: async () => ({ getFileHandle: async () => ({ createWritable: async () => ({ write: async () => {}, close: async () => {} }) }) })
    };
    page.window.confirm = () => false;
    const doc = page.document;
    dom.fireUserEvent(doc.getElementById("settingsHealthCheck"), "click");
    await settle(8);
    dom.fireUserEvent(doc.getElementById("settingsExportMarkdown"), "click");
    await settle(8);
    dom.fireUserEvent(doc.getElementById("runIntegrityCheck"), "click");
    await settle(8);
    assert.equal(scans, 0, "用户点了「取消」，一次扫描都不该发生");
    assert.equal(doc.getElementById("maintenanceStatus").hidden, true, "取消后不要留任何回执");
    assert.equal(doc.getElementById("exportMarkdownStatus").hidden, true, "取消后不要留任何回执");
    assert.equal(doc.getElementById("integrityStatus").hidden, true, "取消后不要留任何回执");
  });

  await test("导出归档元数据的回执落在「导入与导出」这张卡，不是跑到「归档维护」去（1.10.3 真执行）", async () => {
    // 导出会走 handle.getDirectoryHandle：004导出 要真给一个目录，003database 当没有（缺库也能导）。
    const exportDirectory = () => ({
      getFileHandle: async (name) => ({ name, createWritable: async () => ({ write: async () => {}, close: async () => {} }) }),
      values: async function* () {}
    });
    const rootHandle = {
      name: "归档",
      getDirectoryHandle: async (name) => {
        if (name === "004导出") return exportDirectory();
        const error = new Error("没有这个目录");
        error.name = "NotFoundError";
        throw error;
      }
    };
    const page = await openSettings();
    page.window.BcaArchiveTools = {
      loadRootHandle: async () => rootHandle,
      ensureRootPermission: async () => true,
      scanArchive: async () => ({
        collections: [{ name: "甲", records: [{ directory: "d1", record: {} }] }],
        diagnostics: { missingText: [], missingCover: [], brokenText: [], tempFiles: [] },
        issues: [], unfinished: [], longNames: [], bytes: 0, recordCount: 1
      }),
      recordToVideo: (collection, entry) => ({ collection, directory: entry.name, title: "t", bvid: "BV1aaaaaaaaa", url: "", upName: "", upMid: "", upHome: "", upFans: "", favoriteAt: "", savedAt: "", timestamp: "", duration: "", publishDate: "", description: "", stats: {}, tags: [], isInvalid: false, invalidReason: "", cover: "", info: {}, searchIndex: "" }),
      subdirectoryHandle: async () => exportDirectory(),
      formatMegabytes: () => "0 B"
    };
    page.window.confirm = () => true;
    const doc = page.document;
    dom.fireUserEvent(doc.getElementById("settingsExportArchive"), "click");
    await settle(10);
    const transfer = doc.getElementById("transferStatus");
    assert.equal(transfer.hidden, false, "回执要用导出按钮所在那张卡的状态行");
    assert.match(transfer.textContent, /已导出 1 条记录到/, "回执要说清导出了多少条");
    assert.equal(doc.getElementById("maintenanceStatus").hidden, true, "别把回执甩到另一张卡上");
  });

  await test("补全互动数据先问一句，取消就不发任何请求（1.10.3 真执行）", async () => {
    const scan = {
      collections: [{ name: "甲", records: [{ directory: "d1", record: {} }] }],
      diagnostics: { missingText: [], missingCover: [], brokenText: [], tempFiles: [] },
      issues: [], unfinished: [], longNames: [], bytes: 0, recordCount: 1
    };
    const page = await openSettings();
    page.window.BcaArchiveTools = {
      loadRootHandle: async () => ({ name: "归档" }),
      ensureRootPermission: async () => true,
      scanArchive: async () => scan,
      recordToVideo: (collection, entry) => ({
        collection, directory: entry.name, title: "t", cover: "", description: "有",
        stats: { view: "N/A", danmaku: "N/A", like: "N/A", coin: "N/A", favorite: "N/A", share: "N/A" }
      })
    };
    let sent = 0;
    page.chrome.runtime.sendMessage = (message, callback) => {
      if (message && message.type === "bca-refresh-video-stats") sent += 1;
      if (typeof callback === "function") { callback({ ok: true, updated: 1, failed: 0 }); return undefined; }
      return Promise.resolve({ ok: true, updated: 1, failed: 0 });
    };
    page.window.confirm = () => true;
    const doc = page.document;
    dom.fireUserEvent(doc.getElementById("runIntegrityCheck"), "click");
    await settle(10);
    page.window.confirm = () => false;
    dom.fireUserEvent(doc.getElementById("fillMissingStats"), "click");
    await settle(10);
    assert.equal(sent, 0, "取消之后一条请求都不该发出去");
  });

  await test("忘记记住的 UID 先问一句，取消就什么都不清（1.10.3 真执行）", async () => {
    const page = await openSettings({ localData: { lastImportUid: "12345" } });
    page.window.confirm = () => false;
    const doc = page.document;
    dom.fireUserEvent(doc.getElementById("forgetUid"), "click");
    await settle(6);
    const dump = page.chrome.storage.local.dump();
    assert.equal(dump.lastImportUid, "12345", "取消之后 UID 还得在");
    assert.equal(doc.getElementById("forgetUidStatus").hidden, true, "取消后不要留回执");
  });

  await test("九句确认都说清「会做什么、不会动什么」（1.10.3）", async () => {
    const said = [];
    const page = await openSettings({ localData: { lastImportUid: "1" } });
    page.window.confirm = (message) => { said.push(String(message)); return false; };
    page.window.BcaArchiveTools = {
      loadRootHandle: async () => ({ name: "归档" }),
      ensureRootPermission: async () => true,
      scanArchive: async () => ({ collections: [], diagnostics: { missingText: [], missingCover: [], brokenText: [], tempFiles: [] }, issues: [], unfinished: [], longNames: [], bytes: 0, recordCount: 0 }),
      recordToVideo: () => null,
      subdirectoryHandle: async () => ({ getFileHandle: async () => ({ createWritable: async () => ({ write: async () => {}, close: async () => {} }) }) })
    };
    const doc = page.document;
    for (const id of ["settingsExportConfig", "settingsExportConfigSlim", "settingsExportArchive", "settingsExportMarkdown", "settingsHealthCheck", "runIntegrityCheck", "forgetUid"]) {
      dom.fireUserEvent(doc.getElementById(id), "click");
      await settle(6);
    }
    assert.equal(said.length, 7, `七个按钮各问一句，实际 ${said.length} 句`);
    for (const message of said) {
      assert.ok(message.length > 12, `确认文案太短，说不清要做什么：${message}`);
      assert.match(message, /确定|要开始吗|确定开始吗/, `确认文案要有一句明确的问法：${message}`);
    }
    assert.ok(said.some((message) => message.includes("004导出/")), "导出类文案要点明写到哪");
    assert.ok(said.some((message) => message.includes("006报告/")), "体检文案要点明报告写到哪");
    assert.ok(said.some((message) => message.includes("006报告/") && message.includes("只读归档")), "体检要说明不动归档");
  });

  await test("收藏夹那行同时写出总量与近 7 天新增，不再只报一个数（1.10.12）", async () => {
    const page = await openStats({
      localData: {
        bcaStats: {
          videos: 2193,
          days: 7,
          collections: 5,
          topCollection: { name: "蜻蜓小新", count: 447, recent: 11 },
          dailyRows: [{ day: "2026-10-20", count: 4 }],
          weekly: [], monthly: [], yearly: []
        }
      }
    });
    await settle(12);

    const doc = page.document;
    assert.equal(doc.getElementById("statsTopName").textContent.trim(), "蜻蜓小新");
    const count = doc.getElementById("statsTopCount").textContent.trim();
    assert.equal(
      count,
      BcaT(page, "共 {total} 条 · 近 {days} 天新增 {recent} 条", { total: "447", days: "7", recent: "11" }),
      "要同时写出总量与近 7 天新增，别让人把 447 当成区间新增"
    );
    assert.ok(count.includes("447") && count.includes("11"), "两个数都要在");
  });

  await test("设置页「检查更新」：点一下问后台，把新版本、下载页和 SHA-256 摆出来（1.11.2）", async () => {
    const page = await openSettings();
    const sent = [];
    const reply = {
      ok: true,
      mode: "manual",
      current: "1.11.2",
      latest: "1.12.0",
      newer: true,
      released: true,
      date: "2026-11-01",
      source: "github",
      releasePageUrl: "https://github.com/shijunan-Andrew/bili-vault/releases/tag/V1.12.0",
      zipName: "bili-vault-1.12.0.zip",
      sha256: "a".repeat(64),
      notes: []
    };
    page.window.chrome.runtime.sendMessage = (message, callback) => {
      sent.push(message);
      if (typeof callback === "function") callback(reply);
      return undefined;
    };
    const button = page.document.getElementById("checkUpdate");
    assert.ok(button, "设置页要有「检查更新」按钮");
    dom.fireUserEvent(button, "click");
    await settle(6);

    assert.equal(sent.length, 1, "点一下只该问一次后台");
    assert.equal(sent[0].type, "bca-check-update");
    assert.equal(sent[0].mode, "manual", "手动触发要带 mode=manual");
    assert.equal(
      textOf(page.document.getElementById("updateStatus")),
      BcaT(page, "有新版本 {version}（{date}），去下载页拿 zip 覆盖安装。", { version: "1.12.0", date: "2026-11-01" })
    );
    assert.equal(page.document.getElementById("updateStatus").hidden, false);
    assert.equal(page.document.getElementById("updateError").hidden, true, "成功不该走错误行");
    const link = page.document.getElementById("updateLink");
    assert.equal(page.document.getElementById("updateLinkRow").hidden, false, "有下载页要给链接");
    assert.equal(link.getAttribute("href"), reply.releasePageUrl, "链接要指到后台给的那个下载页");
    assert.equal(page.document.getElementById("updateShaRow").hidden, false, "发布了就要给 SHA-256");
    assert.equal(textOf(page.document.getElementById("updateSha")), reply.sha256);
    assert.equal(button.disabled, false, "查完按钮要能再点");
  });

  await test("设置页「检查更新」：查不到时只留一句错误，下载页和 SHA 收起来（1.11.2）", async () => {
    const page = await openSettings();
    page.window.chrome.runtime.sendMessage = (message, callback) => {
      if (typeof callback === "function") callback({ ok: false, reason: "unreachable" });
      return undefined;
    };
    dom.fireUserEvent(page.document.getElementById("checkUpdate"), "click");
    await settle(6);
    assert.equal(page.document.getElementById("updateStatus").hidden, true, "失败不该占用状态行");
    assert.equal(page.document.getElementById("updateError").hidden, false);
    assert.equal(
      textOf(page.document.getElementById("updateError")),
      BcaT(page, "查不到最新版本：GitHub 和镜像都没回应，过一会儿再试。")
    );
    assert.equal(page.document.getElementById("updateLinkRow").hidden, true);
    assert.equal(page.document.getElementById("updateShaRow").hidden, true);
  });


  await test("设置页「检查更新」：公开版存在、自己装的是更新的开发版时，要说清「不用更新」（1.11.3 / 1.12.1 调口径）", async () => {
    const page = await openSettings();
    page.window.chrome.runtime.getManifest = () => ({ version: "1.11.3" });
    page.window.chrome.runtime.sendMessage = (message, callback) => {
      if (typeof callback === "function") {
        callback({
          ok: true,
          mode: "manual",
          current: "1.11.3",
          latest: "1.11.1",
          newer: false,
          released: true,
          date: "2026-10-25",
          source: "github",
          releasePageUrl: "https://github.com/shijunan-Andrew/bili-vault/releases",
          zipName: "",
          sha256: "",
          notes: []
        });
      }
      return undefined;
    };
    dom.fireUserEvent(page.document.getElementById("checkUpdate"), "click");
    await settle(6);
    assert.equal(
      textOf(page.document.getElementById("updateStatus")),
      BcaT(page, "你装的 {current} 比公开版（{version}）还新，不用更新。", { current: "1.11.3", version: "1.11.1" }),
      "开发版比公开版新时，不许说成「已经是最新公开版（1.11.1）」"
    );
    assert.equal(page.document.getElementById("updateShaRow").hidden, true);
  });
  await test("设置页「检查更新」：还没有正式下载包时，不许说「已经是最新」也不给下载页（1.12.1）", async () => {
    const page = await openSettings();
    page.window.chrome.runtime.sendMessage = (message, callback) => {
      if (typeof callback === "function") {
        callback({
          ok: true,
          mode: "manual",
          current: "1.12.1",
          latest: "1.12.1",
          newer: false,
          released: false,
          date: "2026-10-25",
          source: "github",
          releasePageUrl: "https://github.com/shijunan-Andrew/bili-vault/releases",
          zipName: "",
          sha256: "",
          notes: []
        });
      }
      return undefined;
    };
    dom.fireUserEvent(page.document.getElementById("checkUpdate"), "click");
    await settle(6);
    assert.equal(
      textOf(page.document.getElementById("updateStatus")),
      BcaT(page, "作者还没有发布正式下载包；你现在装的是 {current}，就是这个仓库的最新版本。", { current: "1.12.1" }),
      "还没发布下载包时，不能声称「已经是最新公开版」，也不能说「比公开版还新」"
    );
    assert.equal(page.document.getElementById("updateLinkRow").hidden, true, "没有 zip 就别给下载页");
    assert.equal(page.document.getElementById("updateShaRow").hidden, true);
  });

  await test("设置页「检查更新」：重开页面先显示上次查到的结论（1.11.2）", async () => {
    const page = await openSettings({
      localData: {
        updateCheck: {
          ok: true,
          mode: "manual",
          current: "1.11.2",
          latest: "1.11.2",
          newer: false,
          released: true,
          date: "2026-10-25",
          source: "jsdelivr",
          releasePageUrl: "https://github.com/shijunan-Andrew/bili-vault/releases",
          zipName: "",
          sha256: "",
          notes: []
        }
      }
    });
    await settle(8);
    assert.equal(
      textOf(page.document.getElementById("updateStatus")),
      BcaT(page, "已经是最新公开版（{version}）。", { version: "1.11.2" })
    );
    assert.equal(page.document.getElementById("updateShaRow").hidden, true, "没发布就不该显示 SHA");
    /* 1.11.5：这一行必须在自己的卡里，而不是埋在本机数据卡最后面。
       元素 id 不变 → 上面几条用例照样过；但只测 id 存在的话，搬家也能悄悄回退。 */
    const updateCard = page.document.getElementById("group-update");
    assert.ok(updateCard, "设置页要有独立的检查更新卡");
    assert.equal(updateCard.dataset.group, "update");
    assert.ok(updateCard.contains(page.document.getElementById("checkUpdate")), "按钮要在这张卡里");
    assert.ok(updateCard.contains(page.document.getElementById("updateStatus")), "状态行要在这张卡里");
    assert.equal(
      page.document.getElementById("group-localdata").contains(page.document.getElementById("checkUpdate")),
      false,
      "本机数据卡里不该再有它",
    );
    const navGroups = [...page.document.querySelectorAll("#settingsNav [data-group]")].map((el) => el.dataset.group);
    const cardGroups = [...page.document.querySelectorAll(".settings-main .settings-card[data-group]")].map(
      (el) => el.dataset.group,
    );
    assert.deepEqual(navGroups, cardGroups, "导航与卡片必须一一对应");
    assert.ok(navGroups.includes("update"), "update 这一组要在名单里");

  });
}

/* ---------------- 回收站页（1.10.0） ----------------
   1.9.0 起回收站是独立页，但 pages.test 一直只覆盖 library / settings / popup / content，
   这一页的渲染、多选、确认文案全靠人眼看过。这里换成桩驱动真代码。 */

test("「导入结束弹通知」开关默认开，点一下关掉并存下来（1.12.7）", async () => {
  // 默认：没有存过任何值 → 开
  const page = await openSettings();
  const toggle = page.document.getElementById("notifyImportToggle");
  assert.ok(toggle, "设置页应当有「导入结束弹通知」开关");
  assert.equal(toggle.getAttribute("aria-pressed"), "true", "默认是开着的");
  assert.equal(toggle.classList.contains("off"), false, "开着的时候不该有 off 类");

  // 点一下：变成关，并且写进 storage
  dom.fireUserEvent(toggle, "click");
  await settle();
  assert.equal(toggle.getAttribute("aria-pressed"), "false", "点一下应当变成关");
  assert.equal(toggle.classList.contains("off"), true, "关掉时要有 off 类");
  const dumped = page.__chrome.storage.local.dump();
  assert.equal(dumped.notifyImportFinished, false, "关掉要存进 storage");
  assert.equal(textOf(page.document.getElementById("transferStatus")), BcaT(page, "导入结束不再弹系统通知。"), "要给出回执");

  // 存过 false 的页面：开起来就是关的
  {
    const off = await openSettings({ localData: { notifyImportFinished: false } });
    const offToggle = off.document.getElementById("notifyImportToggle");
    assert.equal(offToggle.getAttribute("aria-pressed"), "false", "存过 false 时应当是关着的");
    assert.equal(offToggle.classList.contains("off"), true, "存过 false 时要有 off 类");
  }
});

test("「上次导入没有收尾」这一行只在真有记录时出现，能清掉它建的目录（1.12.2）", async () => {
  // 没有记录：整行藏起来
  {
    const page = await openSettings();
    assert.equal(textOf(page.document.getElementById("leftoverDesc")), "", "没记录时说明栏是空的");
    assert.ok(page.document.getElementById("leftoverRow").hidden, "没记录时这一行必须是 hidden");
  }
  // 有记录：显示件数，点按钮 → 确认 → 发消息 → 报结果
  const state = { confirmed: 0, messages: [] };
  const page = await openSettings({
    localData: {
      bcaImportLeftover: {
        startedAt: Date.now() - 60000,
        updatedAt: Date.now() - 60000,
        interruptedAt: Date.now() - 30000,
        summary: { collections: 1, records: 3, files: 2, rewritten: 0 },
        journal: {
          createdCollections: [{ name: "小鲸鱼测试" }],
          createdRecords: [{ collection: "小鲸鱼测试", name: "a" }],
          addedFiles: [],
          modifiedFiles: []
        }
      }
    }
  });
  // 页面加载完之后再换 sendMessage：settings.js 调用时读的是当时的 chrome 全局
  page.window.chrome.runtime.sendMessage = (message, callback) => {
    state.messages.push(message);
    if (typeof callback === "function") {
      callback({ ok: true, removedRecords: 3, removedCollections: 1, removedFiles: 2, failed: 0 });
    }
  };
  page.window.confirm = () => {
    state.confirmed += 1;
    return true;
  };
  await settle(10);
  const row = page.document.getElementById("leftoverRow");
  assert.equal(row.hidden, false, "有记录时这一行要出来");
  const desc = textOf(page.document.getElementById("leftoverDesc"));
  assert.match(desc, /3/, "说明里要写出这一轮建了几个视频目录");
  dom.fireUserEvent(page.document.getElementById("cleanupLeftover"), "click");
  await settle(12);
  assert.equal(state.confirmed, 1, "清理前必须先问一句");
  assert.ok(state.messages.some((message) => message?.type === "bca-import-cleanup-leftover"), "要真的发清理消息");
  const status = textOf(page.document.getElementById("leftoverStatus"));
  assert.match(status, /清掉了/, "成功之后要给出回执，实际：" + status);
});

/* ---- 收藏夹页面桥（favorites-import.js） ----
   1.12.4（审查 P2-6）：这个文件以前一行真执行测试都没有，而它是「导入」唯一的入口 ——
   B 站页面上那条「导入」链路全靠它把消息转给后台。这里用 dom-harness 的 loadFragment
   真跑脚本（它没有 DOM 依赖，只碰 window / location / chrome / fetch）。 */

function openFavoritesBridge(options = {}) {
  const sent = [];
  const chrome = harness.makeChrome({
    version: "1.12.4",
    onRuntimeMessage(message, respond) {
      sent.push(message);
      if (typeof options.reply === "function") return options.reply(message, respond);
      respond(options.reply === undefined ? { ok: true } : options.reply);
      return undefined;
    }
  });
  chrome.runtime.id = FAVORITES_EXT_ID;
  const page = dom.loadFragment({
    chrome,
    location: {
      href: "https://space.bilibili.com/1024/favlist?fid=1",
      origin: "https://space.bilibili.com",
      pathname: "/1024/favlist",
      search: "?fid=1",
      hash: ""
    },
    globals: options.globals || {},
    scripts: ["favorites-import.js"]
  });
  return { page, chrome, sent };
}

function bridgeListener(page) {
  const listeners = page.chrome.runtime.onMessage.listeners;
  assert.equal(listeners.length, 1, "收藏夹页只该挂一个消息监听");
  return listeners[0];
}

function ask(listener, message, sender = { id: FAVORITES_EXT_ID }) {
  return new Promise((resolve) => {
    const returned = listener(message, sender, resolve);
    if (returned !== true) resolve(undefined);
  });
}

async function suiteFavoritesImport() {
  await test("收藏夹页：不是 favlist 页面就什么都不挂", async () => {
    const page = dom.loadFragment({
      location: { href: "https://www.bilibili.com/video/BV1xx", origin: "https://www.bilibili.com", pathname: "/video/BV1xx", search: "", hash: "" },
      scripts: ["favorites-import.js"]
    });
    assert.equal(page.chrome.runtime.onMessage.listeners.length, 0, "视频页不该注册监听");
  });

  await test("收藏夹页：只接本扩展的消息，别人的直接忽略", async () => {
    const { page } = openFavoritesBridge();
    const listener = bridgeListener(page);
    const reply = await ask(listener, { type: "bca-list-import-folders" }, { id: "someone-else" });
    assert.equal(reply, undefined, "外来的 sendResponse 不该被调用");
  });

  await test("收藏夹页：页面请求只放行 https 的 B 站官方接口", async () => {
    const { page } = openFavoritesBridge({ globals: { fetch: async () => { throw new Error("不该发请求"); } } });
    const listener = bridgeListener(page);
    for (const url of ["http://api.bilibili.com/x/v3/fav/resource/list", "https://evil.example.com/x", "https://api.bilibili.com.evil.example/x"]) {
      const reply = await ask(listener, { type: "bca-page-api-get", url });
      assert.equal(reply.ok, false, `${url} 必须被挡下`);
    }
    const bad = await ask(listener, { type: "bca-page-api-get", url: "不是地址" });
    assert.equal(bad.ok, false);
    assert.equal("接口地址无效。", bad.message, "文案要照抄脚本里的原话（这个文件不加载 i18n）");
  });

  await test("收藏夹页：真把接口结果透回去，uid 来自当前路径", async () => {
    const seen = [];
    const { page, sent } = openFavoritesBridge({
      reply: (message, respond) => respond({ ok: true, folders: [{ id: 1, title: "默认收藏夹" }] }),
      globals: {
        fetch: async (url) => {
          seen.push(String(url));
          return { status: 200, json: async () => ({ code: 0, data: { list: [] } }) };
        }
      }
    });
    const listener = bridgeListener(page);

    const api = await ask(listener, { type: "bca-page-api-get", url: "https://api.bilibili.com/x/v3/fav/folder/created/list-all?up_mid=1024" });
    assert.equal(api.ok, true);
    assert.equal(api.status, 200);
    assert.deepEqual(api.payload, { code: 0, data: { list: [] } });
    assert.equal(seen.length, 1);
    assert.match(seen[0], /^https:\/\/api\.bilibili\.com\/x\/v3\/fav\/folder\/created\/list-all\?up_mid=1024$/);

    const listed = await ask(listener, { type: "bca-list-import-folders" });
    assert.equal(listed.ok, true, "后台回了什么就透什么");
    assert.equal(sent.at(-1).type, "list-bili-favorite-folders");
    assert.equal(sent.at(-1).uid, "1024", "uid 要从 /1024/favlist 里取");
  });

  await test("收藏夹页：导入请求把可选字段原样带下去", async () => {
    const { page, sent } = openFavoritesBridge({ reply: { ok: true, started: true } });
    const listener = bridgeListener(page);

    await ask(listener, { type: "bca-import-selected-folders", folderIds: [11, 22] });
    assert.deepEqual(sent.at(-1), { type: "import-bili-favorites", uid: "1024", folderIds: [11, 22] }, "不传可选项就不该多带字段");

    await ask(listener, { type: "bca-import-selected-folders", folderIds: [11], recentDays: 7, limit: 300, resume: { folder: "默认收藏夹", page: 3 } });
    assert.deepEqual(sent.at(-1), {
      type: "import-bili-favorites",
      uid: "1024",
      folderIds: [11],
      recentDays: 7,
      limit: 300,
      resume: { folder: "默认收藏夹", page: 3 }
    });
  });

  await test("收藏夹页：后台一直不回就自己结束，不把面板挂死", async () => {
    // 把 setTimeout 换成「立刻执行」，这样 15 秒兜底在测试里瞬间到点（1.7.14 加的兜底，
    // 1.12.4 起第一次有测试盯着它）。
    const timers = [];
    const { page } = openFavoritesBridge({
      // 真正的「不回」：返回一个永不 resolve 的 Promise，桩就不会替后台答话。
      reply: () => new Promise(() => {}),
      globals: {
        setTimeout: (fn) => {
          timers.push(fn);
          return timers.length;
        },
        clearTimeout: () => {}
      }
    });
    const listener = bridgeListener(page);
    const reply = new Promise((resolve) => {
      listener({ type: "bca-list-import-folders" }, { id: FAVORITES_EXT_ID }, resolve);
    });
    assert.equal(timers.length, 1, "挂起时正好有一个兜底计时器");
    timers[0]();
    const answered = await reply;
    assert.equal(answered.ok, false);
    assert.match(answered.message, /后台没有回应（超过 15 秒）/);
  });
}

async function suiteRecycle() {
  await test("侧栏底部把版本号和两个链接收进同一块（1.10.14）", async () => {
    const page = await openLibrary();
    const doc = page.document;

    const support = doc.querySelector(".sidebar-bottom .side-support");
    assert.ok(support, "找到侧栏底部那一块");
    assert.ok(support.querySelector(".side-version"), "版本号在这一块里");
    assert.equal(
      support.querySelectorAll("a.support-link, a.repo-link").length,
      2,
      "三连与仓库两个链接也在同一块里"
    );
    assert.equal(
      doc.querySelectorAll(".sidebar-bottom > .side-version").length,
      0,
      "版本号不该再作为同级的一块单独存在"
    );
  });

  await test("回收站没选过备份文件夹时给一条能照着做的错误，不是一片空白（1.10.0 真执行）", async () => {
    const page = await openRecycle();
    const { tools } = makeRecycleTools({ noRoot: true });
    page.window.BcaArchiveTools = tools;
    await page.window.BcaRecycle.reload();
    await settle();

    const doc = page.document;
    const error = doc.getElementById("recycleError");
    assert.equal(error.hidden, true, "没选文件夹不是出错，不该顶红字");
    assert.equal(doc.getElementById("recycleStatus").hidden, true, "状态行也别留着「正在读取」");
    assert.equal(doc.getElementById("recycleGrid").children.length, 0, "一条卡片都不该画");
    /* 1.10.16（R-3）：没选文件夹 ≠ 回收站是空的。这时候要引导去选文件夹，
       不能拿「回收站里现在是空的。」把人劝回去。 */
    assert.equal(doc.getElementById("recycleNoRoot").hidden, false, "没选文件夹的空态要显示");
    assert.equal(doc.getElementById("recycleChooseRoot").textContent.trim(),
      BcaT(page, "去收藏库选文件夹"), "空态里要有一个明确的下一步");
    assert.equal(doc.getElementById("recycleEmpty").hidden, true,
      "「回收站是空的」这句不许在没选文件夹时冒出来");
    /* 1.10.13（R-2）：读失败时我们并不知道回收站空不空，摘要保持隐藏，
       别再拿「回收站里现在是空的。」当占位。 */
    const summary = doc.getElementById("recycleSummary");
    assert.equal(summary.hidden, true, "读失败时摘要不该露面");
    assert.equal(summary.textContent.trim(), "", "读失败时摘要不该有文字");
  });

  await test("「正在读取回收站…」整页只说一次，摘要读到数据才露面（1.10.13）", async () => {
    const page = await openRecycle();
    const { tools } = makeRecycleTools({ noRoot: true });
    page.window.BcaArchiveTools = tools;
    await page.window.BcaRecycle.reload();
    await settle();

    const doc = page.document;
    const status = doc.getElementById("recycleStatus");
    const summary = doc.getElementById("recycleSummary");
    assert.equal(summary.hidden, true, "失败时摘要不该抢话说");
    assert.equal(summary.textContent.trim(), "", "摘要读完之前不该有文字");
    const loading = BcaT(page, "正在读取回收站…");
    const shown = [status.textContent, summary.textContent].filter((line) => line.includes(loading));
    assert.equal(shown.length, 0, "失败之后状态行已经清掉，页面里不该还留着「正在读取」");

    const ok = makeRecycleTools({ entries: [recycleEntry("2026年05月10日01时19分50秒")] });
    page.window.BcaArchiveTools = ok.tools;
    await page.window.BcaRecycle.reload();
    await settle();

    assert.equal(summary.hidden, false, "读到数据后摘要要露面");
    assert.ok(summary.textContent.includes("共 1 项"), "摘要写条数");
    assert.equal(status.hidden, true, "读完就没状态行了");
    assert.equal(summary.textContent.includes(loading), false, "摘要不是状态行，不该复读「正在读取」");
  });

  await test("回收站把一条记录画成卡片：收藏夹徽标、标题、UP 主、删于路径都在（1.10.0 真执行）", async () => {
    const page = await openRecycle();
    const { tools } = makeRecycleTools({
      entries: [
        recycleEntry("2026年05月10日01时19分50秒"),
        recycleEntry("2026年05月11日01时19分50秒", { title: "第二条" })
      ]
    });
    page.window.BcaArchiveTools = tools;
    await page.window.BcaRecycle.reload();
    await settle();

    const doc = page.document;
    const grid = doc.getElementById("recycleGrid");
    assert.equal(grid.children.length, 2, "两条要画成两张卡片");
    const first = grid.children[0];
    assert.equal(first.dataset.entryKey, "005回收站/2026年05月10日01时19分50秒/小鲸鱼测试/2026年10月09日01时19分50秒");
    assert.equal(first.querySelector(".cover-badge").textContent.trim(), "小鲸鱼测试", "徽标是收藏夹名");
    assert.equal(first.querySelector(".card-title").textContent.trim(), "被删掉的那一条");
    assert.equal(first.querySelector(".card-up").textContent.trim(), "小鲸鱼UP");
    assert.match(first.querySelector(".card-date").textContent.trim(), /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/,
      "删于时间要格式化到分钟");
    assert.equal(first.querySelector(".card-deleted").textContent.trim(),
      BcaT(page, "删于 {path}", { path: "2026年05月10日01时19分50秒/小鲸鱼测试/2026年10月09日01时19分50秒" }),
      "路径要把 005回收站/ 前缀去掉");
    assert.equal(doc.getElementById("recycleEmpty").hidden, true, "有内容就不该显示空态");
    assert.match(doc.getElementById("recycleSummary").textContent, /共 2 项/, "摘要要报条数");
    assert.equal(doc.getElementById("recyclePurge").disabled, false, "有东西时清空按钮要可用");
  });

  await test("「清空回收站」和日常操作隔着一段放：不许再挨着「彻底删除所选」（1.10.9）", async () => {
    const page = await openRecycle();
    const { tools } = makeRecycleTools({ entries: [recycleEntry("2026年05月10日01时19分50秒")] });
    page.window.BcaArchiveTools = tools;
    await page.window.BcaRecycle.reload();
    await settle();

    const doc = page.document;
    const purge = doc.getElementById("recyclePurge");
    const actions = doc.querySelector(".recycle-actions");
    const zone = doc.querySelector(".recycle-danger-zone");
    assert.ok(actions && zone, "顶部操作行与底部危险区都要在");
    assert.equal(actions.contains(purge), false, "清空回收站不许留在顶部操作行里");
    assert.equal(zone.contains(purge), true, "清空回收站要待在底部危险区");
    assert.equal(purge.disabled, false, "有内容时清空按钮可用");
    // 恢复与彻底删除是「选中的这几条」，留在顶部；只有「全清」下沉
    assert.equal(zone.contains(doc.getElementById("recycleDeleteSelected")), false, "彻底删除所选仍留在顶部");
    assert.equal(zone.contains(doc.getElementById("recycleRestore")), false, "恢复所选仍留在顶部");
  });

  await test("回收站全选按钮在「全选 / 取消全选」之间切，恢复与删除的可用状态跟着选中数走（1.10.0 真执行）", async () => {
    const page = await openRecycle();
    const { tools } = makeRecycleTools({
      entries: [recycleEntry("2026年05月10日01时19分50秒"), recycleEntry("2026年05月11日01时19分50秒")]
    });
    page.window.BcaArchiveTools = tools;
    await page.window.BcaRecycle.reload();
    await settle();

    const doc = page.document;
    const grid = doc.getElementById("recycleGrid");
    const selectAll = doc.getElementById("recycleSelectAll");
    const restore = doc.getElementById("recycleRestore");
    const remove = doc.getElementById("recycleDeleteSelected");
    assert.equal(selectAll.textContent.trim(), BcaT(page, "全选"));
    assert.equal(restore.disabled, true, "没选中时恢复不可点");
    assert.equal(remove.disabled, true, "没选中时彻底删除不可点");

    dom.fireUserEvent(selectAll, "click");
    await settle();
    assert.equal(selectAll.textContent.trim(), BcaT(page, "取消全选"));
    assert.equal(restore.disabled, false);
    assert.equal(remove.disabled, false);
    assert.equal([...grid.children].filter((card) => card.classList.contains("selected")).length, 2,
      "选中的卡片要加 selected");
    assert.ok([...grid.querySelectorAll(".card-select")].every((box) => box.checked), "复选框要跟着勾上");

    dom.fireUserEvent(selectAll, "click");
    await settle();
    assert.equal(selectAll.textContent.trim(), BcaT(page, "全选"));
    assert.equal(restore.disabled, true);
  });

  await test("回收站彻底删除先问一次不可逆确认：取消就什么都不发生，确认才真删（1.10.0 真执行）", async () => {
    const page = await openRecycle();
    const { tools, state } = makeRecycleTools({ entries: [recycleEntry("2026年05月10日01时19分50秒")] });
    page.window.BcaArchiveTools = tools;
    await page.window.BcaRecycle.reload();
    await settle();

    const doc = page.document;
    const confirmed = [];
    page.window.confirm = (text) => {
      confirmed.push(text);
      return false;
    };
    dom.fireUserEvent(doc.getElementById("recycleSelectAll"), "click");
    await page.window.BcaRecycle.deleteSelected();
    await settle();

    assert.equal(confirmed.length, 1, "删除前必须问一次");
    assert.equal(confirmed[0],
      BcaT(page, "这次操作不可逆：会把选中的 {count} 项彻底删掉，不会进系统回收站，也找不回来。确定吗？", { count: "1" }),
      "确认文案要说清不可逆、不进系统回收站");
    assert.equal(state.deleted.length, 0, "点了取消就一条都不许删");
    assert.equal(doc.getElementById("recycleGrid").children.length, 1, "取消后列表要原样");

    page.window.confirm = () => true;
    await page.window.BcaRecycle.deleteSelected();
    await settle();
    assert.deepEqual(state.deleted, [["005回收站/2026年05月10日01时19分50秒/小鲸鱼测试/2026年10月09日01时19分50秒"]],
      "确认后要真删选中的那条");
    assert.equal(doc.getElementById("recycleGrid").children.length, 0, "删完列表要空");
    assert.equal(doc.getElementById("recycleEmpty").hidden, false, "删完要回到空态");
    assert.equal(doc.getElementById("recycleStatus").textContent.trim(),
      BcaT(page, "已彻底删除 {count} 项。", { count: "1" }));
  });

  await test("回收站恢复把条目放回原收藏夹，成功文案报条数（1.10.0 真执行）", async () => {
    const page = await openRecycle();
    const { tools, state } = makeRecycleTools({ entries: [recycleEntry("2026年05月10日01时19分50秒")] });
    page.window.BcaArchiveTools = tools;
    await page.window.BcaRecycle.reload();
    await settle();

    const doc = page.document;
    dom.fireUserEvent(doc.getElementById("recycleSelectAll"), "click");
    await page.window.BcaRecycle.restoreSelected();
    await settle();

    assert.deepEqual(state.restored, [["005回收站/2026年05月10日01时19分50秒/小鲸鱼测试/2026年10月09日01时19分50秒"]],
      "恢复的要正是选中的那条");
    assert.equal(doc.getElementById("recycleGrid").children.length, 0, "恢复完列表要空");
    assert.equal(doc.getElementById("recycleStatus").textContent.trim(),
      BcaT(page, "已恢复 {count} 项，放回原来的收藏夹。", { count: "1" }));
  });

  await test("真的读到了、但一条都没有时，才说「回收站里现在是空的」（1.10.16 真执行）", async () => {
    const page = await openRecycle();
    const { tools } = makeRecycleTools({ entries: [] });
    page.window.BcaArchiveTools = tools;
    await page.window.BcaRecycle.reload();
    await settle();

    const doc = page.document;
    assert.equal(doc.getElementById("recycleEmpty").hidden, false, "空回收站要有说明");
    assert.equal(doc.getElementById("recycleNoRoot").hidden, true,
      "已经读到数据了，就不该再提示没选文件夹");
  });
}

/* ---------------- 统计页的「重新读取统计库」按钮（1.10.0） ----------------
   1.9.6 加了这条路线：快照丢了就让后台按现成的 003database 补发一份。
   只测过静态断言，没测过「点下去真的发消息、回来真的重绘」。 */

async function suiteStats() {
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

  await test("选好本地备份文件夹时，把 000…006 七本辅助目录一次建全（1.11.10 真执行）", async () => {
    const page = await openLibrary();
    const root = page.window.BcaLibraryRoot;
    assert.ok(root, "library.js 要暴露测试入口");
    assert.deepEqual(
      Array.from(root.ROOT_STRUCTURE_DIRECTORIES),
      ["000视频下载", "001错误报告", "002同步报告", "003database", "004导出", "005回收站", "006报告"],
      "名单要按编号、且七本齐全"
    );

    const made = [];
    const handle = {
      getDirectoryHandle: async (name) => { made.push(name); return { name }; }
    };
    const failed = await root.ensureRootStructure(handle);
    assert.deepEqual(made, Array.from(root.ROOT_STRUCTURE_DIRECTORIES), "每本都要真的建一次");
    assert.deepEqual(failed, [], "顺利时不该记录失败");

    // 有一本建不出来：不影响其余，失败的记下来给日志
    const partial = [];
    const picky = {
      getDirectoryHandle: async (name) => {
        if (name === "003database") throw new Error("no");
        partial.push(name);
        return { name };
      }
    };
    const failedAgain = await root.ensureRootStructure(picky);
    assert.deepEqual(failedAgain, ["003database"], "建不出来的要单独回报");
    assert.equal(partial.length, 6, "剩下六本照样建");
  });

  await test("打开时间范围菜单时把那张卡抬起来，选完再放下去（1.11.9 真执行）", async () => {
    const page = await openStats({ localData: { bcaStats: snapshot } });
    const doc = page.document;
    const button = doc.getElementById("statsRangeButton");
    const menu = doc.getElementById("statsRangeMenu");
    assert.ok(button && menu, "统计页要有时间范围按钮与菜单");
    const card = menu.closest(".stats-card");
    assert.ok(card, "菜单要在一张 .stats-card 里");
    assert.equal(card.classList.contains("menu-open"), false, "一开始没抬起来");

    button.click();
    await settle(4);
    assert.equal(menu.hidden, false, "点开菜单");
    assert.equal(card.classList.contains("menu-open"), true, "打开时整张卡抬起来");

    button.click();
    await settle(4);
    assert.equal(menu.hidden, true, "再点一次收起");
    assert.equal(card.classList.contains("menu-open"), false, "收起时放下去");
  });

  await test("统计页空态点「重新读取统计库」会让后台补发快照，回来就重绘（1.10.0 真执行）", async () => {
    let asked = 0;
    const page = await openStats({
      onRuntimeMessage: async (message) => {
        if (message && message.type === "bca-stats-republish") {
          asked += 1;
          await page.chrome.storage.local.set({ bcaStats: snapshot });
          return { ok: true };
        }
        return undefined;
      }
    });
    const doc = page.document;
    assert.equal(doc.getElementById("statsEmpty").hidden, false, "一开始没有快照，必须是空态");

    dom.fireUserEvent(doc.getElementById("statsRepublish"), "click");
    await settle(16);
    assert.equal(asked, 1, "点一次要发一条 bca-stats-republish");
    assert.equal(doc.getElementById("statVideos").textContent.trim(), "12", "补发回来要重绘");
    assert.equal(doc.getElementById("statsEmpty").hidden, true, "有数据后空态要收起来");
    const button = doc.getElementById("statsRepublish");
    assert.equal(button.disabled, false, "按钮要还回去，不能一直转");
    assert.equal(button.textContent.trim(), BcaT(page, "重新读取统计库"), "按钮文案要还原");
  });

  await test("统计页补发被拒（没选备份文件夹）时说清下一步，按钮照样还回来（1.10.0 真执行）", async () => {
    const page = await openStats({
      onRuntimeMessage: async (message) => (message && message.type === "bca-stats-republish"
        ? { ok: false, reason: "no-root" }
        : undefined)
    });
    const doc = page.document;
    dom.fireUserEvent(doc.getElementById("statsRepublish"), "click");
    await settle(16);

    assert.equal(doc.getElementById("statsEmptyText").textContent.trim(),
      BcaT(page, "还没有选择本地备份文件夹，先在收藏库里选一次。"));
    assert.equal(doc.getElementById("statsEmpty").hidden, false, "没补上就还是空态");
    const button = doc.getElementById("statsRepublish");
    assert.equal(button.disabled, false);
    assert.equal(button.textContent.trim(), BcaT(page, "重新读取统计库"));
  });

  await test("低频卡的长说明默认收在折叠块里，不再一屏塞满（1.10.15 真执行）", async () => {
    const page = await openSettings();
    const doc = page.document;
    const maintenance = doc.querySelectorAll("#group-maintenance details.row-more");
    const recycle = doc.querySelectorAll("#group-recycle details.row-more");
    const localdata = doc.querySelectorAll("#group-localdata details.row-more");
    assert.equal(maintenance.length, 1, "归档维护卡里要有一个折叠块");
    assert.equal(recycle.length, 1, "回收站卡里要有一个折叠块");
    assert.equal(localdata.length, 1, "本机数据卡里要有一个折叠块");

    for (const details of [...maintenance, ...recycle, ...localdata]) {
      assert.equal(details.open, false, "折叠块默认必须是收起的");
      assert.equal(details.querySelector("summary").textContent.trim(), BcaT(page, "它具体做什么？"));
    }

    // 长解释搬进了折叠块，行内只剩一句。
    const integrityRow = doc.getElementById("runIntegrityCheck").closest(".setting-row");
    assert.equal(integrityRow.querySelector(".setting-row-desc").textContent.trim(),
      BcaT(page, "只读扫一遍，说清缺互动数据、缺封面、缺简介各有多少条。"));
    assert.match(maintenance[0].textContent, /按限速跑/, "补全的做法要留在折叠块里");

    const cleanupRow = doc.getElementById("copyNativeCleanup").closest(".setting-row");
    assert.equal(cleanupRow.querySelector(".setting-row-desc").textContent.trim(),
      BcaT(page, "点右边按钮会复制一条命令，粘到 PowerShell 里回车即可。"));
    assert.match(localdata[0].textContent, /注册表项/, "清理范围要留在折叠块里");
  });

}

/* ---------------- 可访问性（1.10.1） ----------------
   1.9.x 起焦点陷阱已经会还原焦点，但没有测试盯着；四个页面也一直没有「跳到主要内容」的入口。
   这里盯的是这两件事本身，不是它们的实现方式。 */

async function suiteA11y() {
  await test("四个页面都有「跳到主要内容」，而且指向真的能接住焦点的主区域（1.10.1 真执行）", async () => {
    const emptySnapshot = {
      videos: 1, days: 1, totals: { savedTotal: 1 }, firstSeen: "2026-05-01", collections: 1,
      topCollection: { name: "默认收藏夹", count: 1 }, dailyRows: [], weekly: [], monthly: [], yearly: []
    };
    const cases = [
      { name: "library.html", open: () => openLibrary() },
      { name: "settings.html", open: () => openSettings() },
      { name: "stats.html", open: () => openStats({ localData: { bcaStats: emptySnapshot } }) },
      { name: "recycle.html", open: () => openRecycle() }
    ];
    for (const item of cases) {
      const page = await item.open();
      const doc = page.document;
      const link = doc.querySelector("a.skip-link");
      assert.ok(link, `${item.name} 缺「跳到主要内容」的入口`);
      assert.equal(link.dataset.i18n, "跳到主要内容", `${item.name} 的跳过链接要能跟着换语言`);
      const target = link.getAttribute("href");
      assert.ok(target && target.startsWith("#") && target.length > 1, `${item.name} 的跳过链接要有 href`);
      const element = doc.querySelector(target);
      assert.ok(element, `${item.name} 的跳过链接指向不存在的 ${target}`);
      assert.equal(element.getAttribute("tabindex"), "-1", `${item.name} 的主区域要能接住焦点（tabindex=-1）`);
    }
  });

  await test("对话框焦点陷阱放开后，焦点回到把对话框打开的那个按钮（1.10.1 真执行）", async () => {
    // trapFocus / releaseFocusTrap 在 library.js 里，所以这一条起收藏库。
    const page = await openLibrary();
    const doc = page.document;
    const opener = doc.createElement("button");
    opener.textContent = "open";
    const panel = doc.createElement("div");
    const first = doc.createElement("button");
    first.textContent = "ok";
    const last = doc.createElement("button");
    last.textContent = "cancel";
    panel.append(first, last);
    doc.body.append(opener, panel);
    opener.focus();
    assert.equal(doc.activeElement, opener, "前置条件：焦点在打开对话框的按钮上");

    page.window.trapFocus(panel, first);
    assert.equal(doc.activeElement, first, "陷阱一开，焦点要落在首选按钮上");

    last.focus();
    last.dispatchEvent(new page.window.KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
    assert.equal(doc.activeElement, first, "在最后一个按钮上按 Tab 要回到第一个");

    page.window.releaseFocusTrap(panel);
    assert.equal(doc.activeElement, opener, "放开陷阱后焦点要回到打开它的按钮");
  });
}

/* ---------------- 跑 ---------------- */

/* ---- 两个文档页：使用说明、安装教程（1.10.20 起） ---- */
async function suiteDocs() {
  await test("使用说明与安装教程都有「回去的路」：两个出口 + 回到顶部（1.10.20 真执行）", async () => {
    for (const htmlFile of ["guide.html", "tutorial.html"]) {
      const page = dom.loadPage({ htmlFile });
      await settle();
      const document = page.document;

      const bar = document.querySelector(".doc-bar");
      assert.ok(bar, `${htmlFile} 要找得到顶栏`);
      const links = Array.from(bar.querySelectorAll("a.doc-bar-link"));
      assert.equal(links.length, 2, "顶栏要有两个出口，不许多也不许少");
      assert.equal(links[0].getAttribute("href"), "settings.html", "第一个出口回设置页");
      assert.equal(links[1].getAttribute("href"), "library.html", "第二个出口去收藏库");
      assert.equal(links[0].textContent.trim(), "返回设置");
      assert.equal(links[1].textContent.trim(), "打开本地收藏库");

      const top = document.querySelector('a[href="#top"]');
      assert.ok(top, "末尾要有「回到顶部」");
      assert.equal(top.textContent.trim(), "回到顶部");
      assert.ok(document.body.id === "top", "#top 要真的落在 <body> 上，否则点了没反应");
    }
  });

  await test("使用说明的目录能点、跳得到，并且只高亮一节（1.10.21 真执行）", async () => {
    const page = dom.loadPage({ htmlFile: "guide.html" });
    await settle(12);
    const document = page.document;

    /* dom-harness 的选择器引擎不支持 [href^='#'] 这种属性前缀匹配，取出来自己筛 */
    const links = Array.from(document.querySelectorAll(".toc a"))
      .filter((link) => String(link.getAttribute("href")).startsWith("#"));
    assert.ok(links.length >= 10, "目录应该有整十节");
    for (const link of links) {
      const id = link.getAttribute("href").slice(1);
      assert.ok(document.getElementById(id), `目录里的 #${id} 要真的指向一个标题`);
    }

    const current = links.filter((link) => link.classList.contains("is-current"));
    assert.equal(current.length, 1, "任何时刻只有一节是当前节");
    assert.equal(current[0].getAttribute("aria-current"), "location", "当前节要告诉读屏");
  });

  await test("安装教程带五步进度，点一下能跳回那一步（1.10.22 真执行）", async () => {
    const page = dom.loadPage({ htmlFile: "tutorial.html" });
    await settle(12);
    const document = page.document;

    const bar = document.querySelector(".steps-progress");
    assert.ok(bar, "要有进度条");
    const dots = Array.from(bar.querySelectorAll("a.steps-dot"));
    assert.equal(dots.length, 5, "五步就是五个点");

    dots.forEach((dot, index) => {
      assert.equal(dot.getAttribute("href"), `#step-${index + 1}`);
      const step = document.getElementById(`step-${index + 1}`);
      assert.ok(step, `#step-${index + 1} 要真的指向一个步骤`);
      assert.equal(dot.textContent.trim(), String(index + 1), "点里就是步号");
    });

    const current = dots.filter((dot) => dot.classList.contains("is-current"));
    assert.equal(current.length, 1, "任何时刻只有一步是当前步");
    assert.equal(current[0].getAttribute("aria-current"), "step", "当前步要告诉读屏");
  });
}

/* 1.13.1（审查 P0-1）：回收站过期清理的真执行测试。
   pruneRecycler 每次扫描成功都会跑（library.js 里 fire-and-forget），它删的是用户文件，
   所以判据必须用「给定目录名 → 删还是留」的表格钉住，不能只靠源码里有这行字。 */
async function suitePruneRecycler() {
  const tools = require("../archive-tools.js");
  const pad = (value) => String(value).padStart(2, "0");
  const stampOf = (ms) => {
    const d = new Date(ms);
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  };
  const DAY = 24 * 60 * 60 * 1000;
  const makeBucket = (names) => {
    const entries = names.map((name) => ({ kind: "directory", name }));
    const removed = [];
    const bucket = {
      removed,
      survivorNames: () => entries.map((entry) => entry.name).filter((name) => !removed.includes(name)),
      async *values() { for (const entry of entries) yield entry; },
      async removeEntry(name) { removed.push(name); }
    };
    return bucket;
  };
  const rootOf = (bucket) => ({
    async getDirectoryHandle(name) {
      if (bucket && name === tools.RECYCLE_DIR_NAME) return bucket;
      const error = new Error(`${name} 不存在`);
      error.name = "NotFoundError";
      throw error;
    }
  });

  await test("pruneRecycler：只删「时间戳能解析、且真的超过 30 天」的目录", async () => {
    const expired = stampOf(Date.now() - 31 * DAY);
    const justOver = stampOf(Date.now() - 30 * DAY - 60 * 1000);
    const dayAgo = stampOf(Date.now() - 1 * DAY);
    const bucket = makeBucket([expired, justOver, dayAgo, "别删-重要", "2026-10-25", "20261025", "", "temp"]);
    const removedCount = await tools.pruneRecycler(rootOf(bucket));
    assert.deepEqual(bucket.removed.sort(), [expired, justOver].sort(), "只有过期的时间戳目录该被删");
    assert.equal(removedCount, 2, "返回值要等于实际删掉的条数");
    assert.deepEqual(bucket.survivorNames().sort(), [dayAgo, "", "20261025", "2026-10-25", "temp", "别删-重要"].sort(),
      "改名过的、格式不对的、没到 30 天的都必须留下");
  });

  await test("pruneRecycler：没有 005回收站 时返回 0，不抛错", async () => {
    assert.equal(await tools.pruneRecycler(rootOf(null)), 0);
  });

  await test("stampTime：只认 YYYYMMDD-HHMMSS，其余一律 0（且 0 表示「不知道」，不是「过期」）", async () => {
    const table = [
      ["20261025-101500", true],
      ["20261025-1015", false],
      ["2026-10-25", false],
      ["20261025", false],
      ["20261025-101500-2", false],
      ["别删-重要", false],
      ["", false]
    ];
    for (const [name, parseable] of table) {
      const at = tools.stampTime(name);
      if (parseable) assert.ok(at > 0, `${name} 应该解析成时间戳`);
      else assert.equal(at, 0, `${name} 应该解析不出来（返回 0）`);
    }
  });
}

async function suite() {
  await suiteLibrary();
  await suitePopup();
  await suiteContent();
  await suiteSettings();
  await suiteFavoritesImport();
  await suiteRecycle();
  await suiteStats();
  await suiteA11y();
  await suiteDocs();
  await suitePruneRecycler();
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
