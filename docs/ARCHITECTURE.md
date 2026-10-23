# 哔哩藏库 · 架构参考

> 本文是 [`AI_HANDOFF.md`](../AI_HANDOFF.md) 的配套文档：目录结构、界面与设计系统、主要数据流、`视频信息.txt` 格式、页面与消息接口、状态保存位置。
> 接手时先读 `AI_HANDOFF.md`；要改某条链路时再来这里查。

## 目录结构

```text
bili-vault/                       # 仓库根即扩展目录；改名前先看「项目基线」里那条扩展 ID 说明
├── .git/                         # 完整版本历史（tag: beta1.0 … beta4.9、V1.0.0 一路到当前版本；数量随发布增长，别写死）
├── .gitignore / .gitattributes   # 忽略本地归档；换行策略（.bat/.ps1/.cs 钉死 CRLF）
├── .node-path                    # 本机 node.exe 的路径（各人机器不同，已被 .gitignore，不进仓库）
├── manifest.json                 # MV3 权限、后台 worker、内容脚本注册
├── background.js                 # 保存、导入、视频 API、错误报告、后台消息路由
├── content.js                    # B 站视频页：监听收藏操作、采集视频数据 + 归档提示卡
├── favorites-import.js           # B 站收藏夹页：提供页面 API 代理和导入入口
├── archive-core.js               # 可复用的纯逻辑：安全名称、下载目录匹配、下载路径、视频信息解析、页码序列
├── stats-core.js                 # 1.5.0：本地数据库的纯逻辑（明细读写、按本地日分天、快照与排行、宠物亲密度）。浏览器挂 globalThis，node 里能 require
├── pet.js / pet.css              # 1.5.0：宠物挂件（自绘内联 SVG + 气泡轮播 + 点击互动），只读 chrome.storage 里的快照
├── stats.html/js/css             # 1.5.0：数据统计页（数字卡 + 最近 14 天柱状图 + 收藏夹排行），入口在设置页
├── theme.css / theme.js          # 4.0 / 4.5：唯一的设计令牌来源；theme.js 在 <head> 同步应用主题。1.4.0 起 theme.js 还管自定义外观（背景图层 + 毛玻璃变量，图片存 IndexedDB）
├── i18n.js                       # 4.5：以中文原文为 key 的翻译层
├── icons.js                      # 4.0：线性 SVG 图标，替代字符图标
├── locales/
│   ├── zh-TW.json                # 繁体词典（简体中文不需要词典，查不到就原样返回）
│   └── en.json                   # 英文词典
├── popup.html/js/css             # 插件弹窗：自动归档开关、本地备份文件夹、导入界面、语言（1.4.0 起弹窗不再有主题滑块）
├── settings.html/js/css          # 1.3.2：设置页（外观 / 语言 / 使用说明）；1.4.0 起外观含自定义背景与毛玻璃；1.5.0 起多一组「数据统计」（统计页入口 + 宠物挂件开关）
├── library.html/js/css           # 本地收藏库页面
├── guide.html / tutorial.html     # 使用说明页 / 安装教程页（两页共用 tutorial.js、page.css、mockup.css）
├── tutorial.js                    # 上面两页共用的关窗按钮脚本
├── mockup.css                     # 教程页与说明页共用的界面示意图样式（CSS 画的假截图）
├── page.css                       # 教程页与说明页共用的页面骨架样式
├── native/
│   ├── folder-opener-launcher.cs # 原生消息宿主启动器源码（安装时编译成 exe）
│   └── folder-opener-host.ps1    # 原生消息主机工作脚本
├── install-native-folder-opener.bat / .ps1
├── uninstall-native-folder-opener.ps1
├── test-native-folder-opener.ps1 # 不依赖 Chrome 的安装自检脚本
├── test/
│   ├── stability.test.cjs        # 静态回归断言为主（项数以实际输出为准，别写死）
│   ├── archive-core.test.cjs     # 真执行单元测试：require archive-core.js 真的调用它
│   ├── stats-core.test.cjs       # 真执行单元测试：require stats-core.js（固定时间戳，绝不用真实 Date.now）
│   ├── harness.cjs               # 1.7.22：执行级测试的壳：内存版 chrome.storage + 内存版 FileSystem 目录树 + 把 background.js 丢进 vm
│   ├── background.test.cjs       # 1.7.22：真执行单元测试：真调 readStatsDatabase / writeStatsDatabase / 三个写入口互斥链 / 归档写锁 / nativeHostRequest
│   ├── dom-harness.cjs           # 1.7.23：最小 DOM（选择器引擎、事件冒泡、<dialog>、ShadowRoot、真 MutationObserver），让页面脚本能真跑
│   ├── pages.test.cjs            # 1.7.23：真执行单元测试：在 dom-harness 里加载 library.html / popup.html / content.js
│   ├── i18n-extract.cjs          # 提取界面词条、校验词典覆盖率（--check / --todo）
│   ├── _unmarked.cjs             # 反向检查：找出漏标记的界面文字
│   ├── archive-audit.cjs         # 本地归档的标签/简介覆盖情况体检
│   └── import-trial.cjs          # 只读预览导入会抓到什么，不改任何文件
├── README.md                     # 面向使用者的安装与功能说明
└── AI_HANDOFF.md                 # 本文件
```

4.0 删除了 `download-folder.html/js/css`（3.2 之后就被本地目录打开助手取代，全项目零引用）。4.3 起 `library.html` **不再**作为 web_accessible resource 暴露，改由后台 `chrome.tabs.create` 打开。

**1.3.0 删除了 `download.html` / `download.js` / `download.css`**、`background.js` 里整条下载链路、`library.js` 的下载入口，以及 `manifest.json` 的三条视频流域名权限 —— 公开版本不再有取流能力。见 [`HISTORY.md`](HISTORY.md) 的「1.3.0：移除下载功能」。

## 界面与设计系统（4.0 起必须遵守）

4.0 之前，四份 CSS 是不断追加的覆写补丁：`library.css` 里依次有“2.3 柔和配色 → 3.1 恢复蓝色 → 3.4 放大字号 → 3.8”四个区块，`popup.css` 里 `.library-link` 被定义了 4 次、`.primary` 和 `.toggle-switch` 各 3 次，谁生效只能靠读到最后一行。改动因此极易被下游区块盖掉。4.0 换成如下约定，**后续任何界面改动都必须遵守**：

1. **颜色、圆角、阴影、间距、字号、动效只在 `theme.css` 定义。** 页面 CSS 只引用 `var(--…)`，不再写死色值。灰阶只用 `--ink / --text / --muted / --faint / --ghost` 五级。
2. **页面 CSS 单层直写，禁止再追加“覆写区块”。** 需要改样式就改对应规则本身。`test/stability.test.cjs` 有静态断言兜底（字号下限、令牌存在性、每页都引入 theme.css/icons.js）。
3. **字号只能用 `--fs-micro`(11) / `--fs-sm`(12) / `--fs-base`(13) / `--fs-md`(15) / `--fs-lg`(18) / `--fs-xl`(22) / `--fs-2xl`(27)。** 11px 只允许用于纯装饰文案；中文正文不低于 13px。测试会拒绝任何小于 11px 的 `font-size`。
4. **图标只用 `icons.js`。** 静态 HTML 写 `<span data-icon="folder"></span>`（DOMContentLoaded 自动填充），JS 模板串用 `BcaIcons.svg("folder")`。不要再引入 `▦ ▶ ＋ ↻` 这类字符图标——测试会拦截。
5. **按钮里带图标后，改文案不能用 `textContent`**（会把图标一起清掉）。用 `library.js` 的 `setButtonContent(button, icon, text)`。（`download.js` 的 `setButtonLabel(...)` 已随 1.3.0 删除。）
6. 键盘焦点样式与 `prefers-reduced-motion` 已经统一在 `theme.css`，页面不要重复定义。

**页面布局的关键约束**：Chrome 弹窗上限是 800×600，`popup.html` 默认视图必须控制在 600px 内，所以“导入或更新”是折叠区块（读到收藏夹或导入进行中会自动展开）；本地收藏库的卡片网格用 `repeat(auto-fill, minmax(260px, 1fr))`，不要改回固定列数。

## 主要数据流

### 视频页自动归档

`content.js` 在 B 站收藏弹窗中采集当前视频元数据和用户选中的收藏夹。它等待 B 站弹窗关闭后再提交，以确认线上收藏操作完成；用视频编号和选中收藏夹组成的签名做短期去重。随后发送 `save-favorite` 给 `background.js`。

扩展被重新加载 / 更新 / 停用之后，已打开页面里那份旧脚本的 `chrome.runtime` 会变回 `undefined`（Chrome 不给已打开的标签页重新注入内容脚本）。`content.js` 用 `extensionAlive()`（`typeof chrome !== "undefined" && Boolean(chrome.runtime?.id)`）认这件事：点击路径与 `sendFavorite()` 都先认一次，失效时弹「扩展刚更新过 / 刷新一下（F5）」的卡、不再往下走，因此也不会再抛 `Cannot read properties of undefined (reading 'sendMessage')`。

后台串行执行保存操作（`saveQueue`），读取 IndexedDB 中的根目录句柄，检查写入权限，**先把封面取一次**，再在选中的收藏夹之间并行落盘（`Promise.allSettled`）；每个收藏夹内部仍然先写 `封面.webp`、后写 `视频信息.txt` —— txt 落盘才是这条记录的完成标记。部分收藏夹失败时其余照常保存，返回 `{ ok: true, partial: true }`，界面据此摆出「部分收藏夹没保存」的清单；只有全部失败才算整次失败，此时尝试写入 `001错误报告`。每次写入前会清掉同目录里超过 10 分钟的点号临时文件（`archive-core.js` 的 `isTempFileName` / `isStaleTempFile`）。最近状态、错误详情放入扩展存储供弹窗展示。写盘分两条路（1.8.2）：目标文件还不存在时直接就地写（归档的常态 —— 每个记录目录都是刚建出来的）；只有覆盖一个已经存在的文件才写「点号临时文件 + `move()` 换名」，原子性只在那里才有意义。

### B 站收藏夹导入

`favorites-import.js` 注入个人空间收藏夹页，为后台请求提供页面上下文 API 代理，并接收列表收藏夹、导入所选收藏夹的消息。`popup.js` 展示可选列表和导入进度。后台分页获取收藏视频、对本地 BV/av 去重，并写入与自动归档相同的目录格式。

失效视频恢复逻辑主要在 `background.js`：尝试从 APP 收藏夹数据、稍后再看、观看历史和视频资料等来源恢复标题、封面、UP 主及其他字段。未找回的字段应保留为“未知”；封面无法恢复时使用占位图，避免本地库漏掉该记录。B 站接口和页面结构会变化，导入失败时应保留部分已成功结果并记录错误。

### 导入/更新流程（4.2 重写）

`importBiliFavorites()` 现在按下面的顺序跑，每个循环迭代开始都调 `importWaitIfPaused()`：

1. 列远程收藏夹 → 逐个读分页（`/x/v3/fav/resource/list`）。
2. 本地同名收藏夹**不存在**就新建（记进回滚日志），**存在**就读取已有记录（`readExistingImportRecords()` 同时返回去重标识符和每条记录的原文）。
3. 按 BV/av 把远程条目分成「缺失的」和「已存在但 `recordNeedsRefresh()` 为真」的两类。
4. 失效视频先走原有恢复流程（APP 收藏夹 / 稍后再看 / 观看历史）。
5. **对上面两类条目都抓一次完整资料**：`fetchImportDetails()` → `fetchVideoDetail()` 调 `/x/web-interface/view`（简介、发布时间、分区、时长、UP 主、`stat`）与 `/x/tag/archive/tags`（标签），再调 `/x/relation/stat` 取 UP 主粉丝数（`upFansCache` 按 mid 缓存，同一个 UP 只请求一次）。并发 1、间隔 800ms（4.3 起下调，见 [`AI_HANDOFF.md`](../AI_HANDOFF.md) 的「合规与安全红线」）。
6. 已存在的记录用 `refreshImportedRecord()` 按新格式重写，**保留原来的收藏时间与目录名**，原文进回滚日志。写盘前先过 `BcaArchiveCore.mergeInfoText(original, rebuiltText)`（1.8.3）：新值是占位而原值有真内容 → 保留原值，`【标签】` / `【视频简介】` 整块变成占位时整块换回，`【互动数据】` 逐键合并 —— **刷新链路不许把已知降级成「未知」**；`patchVolatileFields` 更新互动数据也只动 `stats` 里真出现的键（`patchStatsLines()`）。
7. 缺失的条目批量下载封面后写入（`saveImportedItem(..., journal)`，目录句柄先登记再写）。

**暂停 / 取消 / 回滚**：`bca-import-control` 消息设置 `importRun.paused/cancelled`；暂停时 `importWaitIfPaused()` 用 Promise 挂起，继续或取消时 `importReleaseWaiters()` 唤醒。取消会抛 `ImportCancelled`（`error.name`），在最外层捕获后调用 `rollbackImport(journal)`：先删 `createdRecords`、再按 `modifiedFiles` 还原原文、最后清掉本次新建且为空的收藏夹。进度通过 `chrome.storage.local.importState` 持久化，所以弹窗关掉再打开也能恢复按钮状态；`get-status` 会带上 `importState`。

**接口抓不到数据的处理**：`/x/web-interface/view` 的 `desc` 对不少视频就是空的或 `-`（实测 `BV1LKGm6ZErR` 返回 `-`），这时简介会退回收藏夹接口 `intro` 清理后的文本；`stat` 通常都有。

### 更新视频状态（4.4 引入，4.5 调整见下）

收藏库的「更新视频状态」按钮经 `bca-refresh-video-stats` 触发 `refreshVideoStatus()`，逐条调用 `refreshOneArchiveStatus()`：

- **有效视频**：调用 `/x/web-interface/view` 拿 `stat`，按 UP 缓存调用 `/x/relation/stat` 拿粉丝数，然后用 `patchVolatileFields()` **只替换** UP主粉丝数、`【互动数据】` 整块，以及原值为「未知」时的发布时间。标题、简介、标签、收藏时间、所属收藏夹、目录结构全部逐字不动（测试会核对行数与逐行差异）。
- **失效视频**：`biliImportApiGet()` 把接口错误码挂在 `error.apiCode` 上；只有 `typeof error.apiCode === "number"` 才判定为失效（网络/超时错误保持原样、记为失败），此时**只写一行** `视频状态：已失效视频（更新状态时检测到）`，其余内容一个字都不改。网页端 `isInvalid` 的依据是 `/失效/.test(视频状态)`，因此标记后立即表现为「已失效」徽标 + 红色标题 + 灰色封面，与导入时识别的失效视频一致。若该记录又能正常访问，更新时会把标记改回「正常」。

**关键约束**：`patchVolatileFields()` **只有一份**，在 `archive-core.js`。`background.js` 静态 `import "./archive-core.js";` 后从 `globalThis.BcaArchiveCore` 取，调用点写 `BcaArchiveCore.patchVolatileFields(...)`。**（V1.7.33 之前这里两边各一份，靠「多组输入逐个比对输出」的测试兜着；那只证明此刻碰巧一样，改一边不会红，所以合并了。）**后台是 ES module，`require` 不了经典脚本，但 `import` 可以 —— 以及 `archive-core.js` 不碰任何浏览器全局，service worker 里跑得动。`test/stability.test.cjs` 的守卫会把 `background.js` 载进 vm，断言它拿到的就是 `archive-core.js` 的同一个函数对象，并禁止副本重长回来。

**请求密度**：复用 `IMPORT_DETAIL_CONCURRENCY` / `IMPORT_DETAIL_DELAY_MS`，与导入同级限速，同样分批（10/20/40）并由用户点击推进。**不要为了提高刷新速度而调高频率**。

### 主题系统（4.5 新增）

- `theme.css` 是唯一的颜色来源。浅色令牌在 `:root`，深色令牌有**两处**必须保持完全一致：
  `:root[data-theme="dark"]`（用户手选夜晚）与 `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) }`（跟随系统）。
  测试会比对两处的令牌集合，改一处必须改另一处。
- `theme.js` 放在**所有页面的 `<head>` 里同步执行**，只负责挂 `data-theme`。因为要同步，它用 `localStorage`（三个扩展页面同源，共享一个键）而不是 `chrome.storage`。
  跟随系统时**不挂** `data-theme`，交给媒体查询；手选「白天」时挂 `data-theme="light"` 用来挡住系统的深色。
- **页面 CSS 里不要写死颜色**。唯一允许的例外是「画在封面图/遮罩上的恒定色」和「彩色按钮上的白字」——它们在任何主题下都成立，但必须写注释说明。
  这条不是洁癖：写死的浅色在深色下会变成刺眼亮斑或读不清的文字。4.5 已经把三个页面 CSS 里的浅色写死值全部换成令牌。
- 需要新颜色时先在 `theme.css` 加令牌，**两个深色块都要同步加**。

### 多语言系统（4.5 新增）

- `i18n.js` 暴露 `BcaI18n`，**用中文原文当 key**：简体中文不需要词典文件（`t()` 查不到就原样返回），`locales/zh-TW.json` 与 `locales/en.json` 只存需要改写的条目。
- 标记方式：
  - 静态纯文本 → `data-i18n="原文"`；**元素里有图标或子元素时必须把文字套一层 `<span data-i18n>`**，否则 `textContent` 会清掉子元素。
  - 需要内嵌标签 → `data-i18n-html`（值里的引号写 `&quot;`）。
  - `title` / `placeholder` / `aria-label` → `data-i18n-title` / `data-i18n-placeholder` / `data-i18n-aria`。
  - JS 动态文字 → `BcaI18n.t("原文")`，带变量用 `t("已选 {count} 个", { count })`。**key 必须是字符串字面量**，否则提取工具扫不到。
- **只翻译界面文字**。视频标题、UP 主名、简介、标签、收藏夹名、BV 号、目录名与文件名一律不包 `t()`。
- 切语言后 `BcaI18n.onChange()` 会触发收藏库重画；新增的动态渲染函数如果含中文，一定要在 `onChange` 的重画路径里，并且内部用 `t()` 而不是 `data-i18n`。
- **数字单位必须按语言换算，不能当翻译模板拼**。`formatCount()` 里中文用 万/亿、英文用 K/M/B，各自除以对应基数。曾用 `t("{value} 万")` 当模板、英文填 `{value}0K` 来「补零」，结果 7.4 万（74000）显示成 7.40K，**小了十倍，且只在英文模式下出现**。阈值要取「四舍五入后会进位到 1000.0」的位置（`999950` / `999950000`），否则 999999999 会显示成 1000.0M。
**词典怎么加载**：扩展页面（收藏库 / 弹窗）直接 `fetch(chrome.runtime.getURL("locales/xx.json"))`，同源无限制。**内容脚本不行**——它跑在网页里，从网页上下文读扩展资源必须声明 `web_accessible_resources`，而那是 4.3 特意去掉的（防止 B 站页面把收藏库嵌进 iframe 做点击劫持）。所以内容脚本走 `bca-locale` 消息请后台代取。**不要为了图省事把 `locales/*` 加回 `web_accessible_resources`。**
**后台（`background.js`）不翻译**。它是模块化 service worker，加载不了经典脚本；它产出的文案有两种处理方式：界面显示处包一层 `t()`（可以翻静态串），或者维持中文（导入进度、错误报告文件）。4.5 采用后者，见「已知限制」。
- 词条工具：`node test/i18n-extract.cjs` 列词条、`--todo` 生成待译清单、`--check` 校验词典覆盖率（回归测试会调用 `--check`，漏译会失败）。

### 更新视频状态（4.5 调整）

**4.4 删掉的是「无确认的单条刷新」，不是批量入口。** 详情面板那个点一下就提交、不先弹确认框的 `refreshOneVideoStatus(video)` 确实没了（`test/stability.test.cjs` 有一条断言它的名字不许回到 `library.js`）；现在**所有**刷新都先过确认框：

- **统一入口**：`openStatusConfirm(videos, source)`（`source` 是 `"detail"` 或 `"batch"`）→ 用户点「同步最近收藏」→ `runStatusRefresh()` 提交：

```
chrome.runtime.sendMessage({ type: "bca-refresh-video-stats", data: { targets, limit: STATUS_BATCH_LIMIT } })
```

- **批量入口保留着，而且必须保留**：勾选若干条后点批量工具栏的「更新视频状态」（`library.html:144` 的 `#updateSelected`），`library.js:5572` 绑的是 `openStatusConfirm(selectedRecords(), "batch")` —— 取的是**当前选中项**，不是整库、也不是别处的全选快照。`test/stability.test.cjs:957` 守着这两点：必须用 `selectedRecords()`，且不许退回 `selectedVideos()`。详情面板那个按钮（互动数据下方的 `.refresh-status`）走的是同一个 `openStatusConfirm(_, "detail")`。
- **上限**：`library.js:2477` 的 `const STATUS_BATCH_LIMIT = 80;`（4.4 那个 `statusBatchSize` 常量已经不存在了，别去找它）。超过 80 条时确认框会说「本次只处理前 80 条，完成后可以再点一次继续」，后台返回的 `remaining` 也照实显示。
- **后台实现**（`refreshVideoStatus` / `refreshOneArchiveStatus`）没有变。风控的顾虑不是靠「不做批量」解决的，而是靠**确认框 + 80 条上限 + 串行间隔**（`IMPORT_DETAIL_CONCURRENCY` / `IMPORT_DETAIL_DELAY_MS`）。**不要再把无确认的单条刷新加回来。**
- 上面几处行号是 V1.8.20 时的快照，**函数名、常量名、id 才是稳定的锚点**，行号对不上时按名字搜。
### CSS 覆盖顺序（4.8.3 的教训）

**同一组件的规则必须写在它的基础规则之后。** 4.7 给 `.import-card` 加橘黄时把新规则写在了 `.import-card > summary { … }` 前面，结果：

- `.import-card > summary:hover`（新，橘黄）与原有的 `.import-card > summary:hover { background: var(--surface-soft) }` **同优先级 (0,2,1)**，后者在文件里更靠后 → **橘黄悬停从来没生效过**
- 图标和标题之所以生效，是因为新选择器优先级更高（`.import-card > summary .import-summary-icon` 是 (0,2,1)，`.import-summary-icon` 只有 (0,1,0)）

**判断方法**：改完 CSS 后，用脚本检查新规则的下标是否大于对应基础规则的下标（测试里已经加了这样一条断言）。**只靠"看起来生效了"会漏**——图标生效了，悬停没生效，肉眼很难分辨。

### 次要按钮的对比度（4.8.3）

`.button-quiet` 现在是 `--brand-deep` on `--brand-soft`（5.17 / 8.90）。**悬停不要改成 `--brand-line` 底色**：那上面文字只有 4.23，不达标。当前方案是保持底色、加深描边并加 `--brand-ring` 光环。

### 测试套件的盲区：它看不见语法错误

`test/stability.test.cjs` 是**按文本读文件 + 正则断言**的，它不执行任何被测代码。后果是：**一个文件就算完全跑不起来，测试照样全过。**

4.8.2 真的踩了一次：我用脚本替换 `copyDownloadPath` 里的三元表达式时少删了一行，留下一句孤立的 `: BcaI18n.t(...)`，`library.js` 直接 `SyntaxError`，而 **104 项测试依然全绿**。发现它靠的是最后单独跑的 `node --check`。

现在补了一条断言（"every shipped script actually parses"），用 `new vm.Script(source)` 在进程内解析每个脚本，不需要起子进程。**验证过它有效**：故意注入一个语法错误，它会报 `library.js 解析失败：Unexpected token ':'`。

**推论**：用脚本改代码之后，必须真的跑一次语法检查；测试通过不等于代码能跑。改完 `library.js` / `background.js` / `popup.js` 这类大文件尤其要跑。

### 「已下载」判据只能有一处（4.8.2）

`BcaArchiveCore.downloadMatchIsDownloaded(match)` 是**唯一**的判据：有真实媒体文件、或有「手动标记」留下的说明文件，都算已下载。

**这里踩过一次坑，别再踩**：这条规则原本在 `downloadStateFromIndex()`（archive-core.js）和 `refreshDownloadStatuses()`（library.js）各写了一份。4.8 加「手动标记」时只改了前者，而 `refreshDownloadStatuses()` 挂在 `window` 的 `focus` 事件和 `visibilitychange` 上——**用户切到别的界面再回来就会触发它，把手动标记冲掉**；刷新走的是 `scanRoot`（用的前者），所以刷新又恢复正常。现象很迷惑：同一个状态，刷新和切页面结果不一样。

**推论**：任何"从磁盘状态推导出来的字段"都只允许有一个计算入口。如果发现第二处，把它改成调用同一个函数，而不是复制判断条件。

### 绝对路径的来源（4.8.2）

浏览器**不会**把文件夹的绝对路径给网页（File System Access API 有意如此），manifest 里也没有 `downloads` 权限。所以绝对路径只有两个来源：

1. **Windows 原生目录助手**（`resolve-directory` action，返回 `targetPath`）——首选
2. **用户早先在下载页填过的下载根目录**（`chrome.storage.local` 的 `downloadRootPath`）——1.3.0 起界面上已经没有填写入口，这一档只在老用户身上还留着一个值；**新的空档案拿不到绝对路径，会直接退到相对路径**。

`resolveDownloadPath()` 按这个顺序取，拿不到才退回相对路径，并把提示分成「已复制完整路径」和「已复制相对路径（+ 怎么办）」两档。**别把第 3 档的提示删掉**——它是唯一告诉用户怎么才能拿到绝对路径的地方。

### 侧栏滚动（4.8.2）

`.collection-list` 是 `flex: 1 1 auto; min-height: 0; overflow-y: auto`。**`min-height: 0` 不能删**：flex 项的默认 `min-height` 是 `auto`，不写它列表不会收缩，收藏夹一多就会把 `margin-top: auto` 的底部信息挤出可视区。新建收藏夹按钮和底部信息都是列表的兄弟节点，所以始终可见。

### 页面代取的 412 不是风控定论（V1.0.0 修复 1）

**`biliImportApiGet` 的 `catch (pageError)` 分支里绝不能因为消息含 "HTTP 412" 就抛风控。**

B 站对**页面上下文**发出的请求本来就返回 HTTP 412，且响应体不是 JSON —— `favorites-import.js` 会把它转成「B站接口没有返回有效数据（HTTP 412）。」这条字符串回到后台。4.8.3 的 catch 是「一律退回后台直连」，后台直连**能拿到数据**，所以旧版本一直正常。

4.9 加的 `importIsRateLimitedError` 只看到消息里有 "HTTP 412" 就抛风控、不再退回 —— 于是每个请求都被判成风控，连续 5 条即中止整轮（实测 4 秒）。**对照实验是决定性的**：同一账号、同一时刻，旧版本导入 128 条全部成功，4.9 却中止。

风控判定只以**后台直连自己的响应**为准（`response.status === 412`）。

### 收藏夹总数与接口返回数对不上是正常的（V1.0.0 修复 2）

**B 站收藏夹里的视频被删除后会留下「占位空槽」**：它仍计入收藏夹总数（页面显示、`media_count` 也算），页面上是一块空白，但 `/x/v3/fav/resource/list` 不返回它。

实测对照（用户逐一数过空槽）：

| 收藏夹 | B 站显示 | 空槽 | 实际视频 | 本地导入 |
|---|---|---|---|---|
| 生存 | 239 | 9 | 230 | **230** ✓ |
| 沙雕动画 | 129 | 1 | 128 | **128** ✓ |
| 游戏解说 | 749 | 25 | 724 | **724** ✓ |

**所以「接口自报 N 条、实际返回 M 条」不是缺陷，不要去"修"它。** 这里来回错过两次：4.9 把差额计入 `failed`（报告出现没有解释的「失败：25」），4.9.1 又改成完全静默（用户看到 239 vs 230 无从判断丢没丢）。现在的做法是**如实说明但不计失败**（`coverageNotes`，见 `missingCount` 那一段），**不计入 `failed`、不触发错误报告**。

另外 B 站的列表接口**可能把同一个条目返回两次**：上表那次「生存」读取 231、去重 1、导入 230。去重逻辑会正确合并，不必额外处理。

### 给元素写文字前先看它有没有子节点（V1.0.0 修复 3）

**`progressNotifier(element, render)` 用 `textContent` 写目标元素 —— 传进去的必须是只放文字的节点，不能是带子元素的容器**，否则会把容器里的子节点整个抹掉。函数旁边已写了这条约束。

实测事故：4.8.3 给 `#scanNotice` 加了文字 `<span>` 和关闭按钮（从"直接放文字"变成"容器 + 子节点"），但 `progressNotifier` 的目标没跟着改。第一次渲染进度时 `textContent = "正在读取 0/0…"` 把 span 和按钮都删了；`scanNoticeText` 变成脱离 DOM 的孤立节点，之后 `setScanNotice()` 的最终结果全写进那个看不见的节点里，**屏幕上永远停在「正在读取 0/0…」**。

**判定方法**：给某个元素加了子节点之后，回头搜一遍所有"直接写它 textContent / innerHTML"的地方。

### 4.9：一次全面审视后的修复

对 约 8800 行 JS 做过一次三路只读审计（导入链路规模化 / 本地加载性能 / 安全与误操作）。安全侧**未发现致命或高危漏洞**，41 项防护经核实到位；修的是导入链路与加载性能上的真问题。下面记的是**改动背后的约束**，改这些地方之前先读懂。

- **导入的保活是显式行为，不是副作用**：`keepServiceWorkerAlive()`（background.js:2219，调 `chrome.runtime.getPlatformInfo()`，内部 20 秒节流）。MV3 的 Service Worker 只认"扩展 API 调用/事件"来重置空闲计时器，**纯 `await` 不算**。原来唯一的"保活"是 `publishImportState` 每 500ms 写 storage 的副作用——没有任何一行声明这个意图，暂停态与超长 `await` 段都会失去保护。**改导入主循环时不要把这个调用删掉。**
- **`IMPORT_KEEPALIVE_INTERVAL_MS` 的余量很紧**：20 秒是审计给的保守值，而单次 `biliImportApiGet` 最坏是"页面代取 15s + 直连 15s"。已在每次请求结束补一次保活，把最坏间隙压到 15+20 秒内。**若真机上出现后台被回收，优先把这个常量调到 12000~15000**（一个常量，不影响任何测试）。
- **`importRun` 是内存态，`importState` 是落盘态，两者会不同步**。判据只有一条：**内存里的 `importRun.active` 才算"真的在跑"**。`importState.running === true` 只是残影，必须复位。复位有三重入口（`get-status` 自愈 / `bca-import-probe` / `onStartup`·`onInstalled`），**新增任何读取导入状态的地方都要走同一套复位**，否则又会锁死 UI。
- **残影复位不需要再等时间窗**（1.4.3 起）：判据是「session 里有没有 `active: true` 的快照」——没有就是上一轮的进程已经没了，立刻复位。**不要**再引入「`updatedAt` 超过 N 秒才算残影」那类时间窗口，那会让浏览器重启后的前 N 秒里弹窗一直显示"导入中"、暂停/取消按钮点了只回"当前没有正在进行的导入"（1.4.3 修的就是这个）。
- **回滚功能已在 1.4.2 整体移除**（`rollbackInterruptedImport`、`bca-import-rollback-recovered`、`markImportRunInterrupted`、`IMPORT_INTERRUPTED_SESSION_KEY` 都没了）。快照（`chrome.storage.session`）现在只剩一个用途：中断时写一份"停在哪、写了多少"的报告，以及收尾时把 `active` 置成 false 再删键（`finishImportRunSnapshot`）。**中断时写进本地的记录本身就是完整记录，重新导入会按 BV/av 跳过，不需要回滚** —— 所以别再给用户任何"可以一键还原"的承诺。
- **风控识别是导入链路的新防线**：HTTP 412 / `code === -412` / `-352` → `error.rateLimited`。**分页与失效恢复接口一旦 412 会立即中止整轮**（不走"连续 5 条"阈值），只有逐条详情走阈值。判断依据是"被限流还继续翻几百页"更危险。连带修掉一个数据损失风险：`refreshOneArchiveStatus` 以前把**任何**数字 `apiCode` 当"视频已失效"，而限流 `-412` 也带 `apiCode` → 会把整批还能看的视频错标成「已失效视频」。现在限流先 rethrow。
- **封面是 320×180 WebP，文件名 `封面.webp`**。4.9 前写的 `封面.png`（真 PNG，均值 1.6 MB）**原样保留、不迁移、不重下**；读取侧优先 `封面.webp`、退回 `封面.png`，存在性检查两个名字都认。**注意**：不要为了"打开旧封面"而把 WebP 字节写回 `封面.png` —— 那样 MIME 会按扩展名推断成 `image/png`，只能指望浏览器嗅探内容，是审计点名的唯一跨文件语义风险。
- **`saveImportedItem` 是先封面、后 `视频信息.txt`**，让 txt 充当"完成标记"。中途被杀只会留下没有 txt 的目录，下次导入会重做，而不是留下"有 txt 没封面"被当成完整记录。`recordNeedsRefresh` 增加了封面存在性判据。
- **缓存淘汰改成了 LRU，封面 URL 用引用计数后再 revoke**：一个 blob URL 有两类持有者（缓存条目 + 由它派生的 video 对象）。**淘汰即 revoke 会在最需要淘汰的 >4000 条场景造成裂图**（卡片封面是 `loading="lazy"`，没滚到的还没取图）。计数归零才 revoke，`beforeunload` 兜底。**改动时不要为了"更及时"提前 revoke。**
- **60 秒定时重扫已移除**（那条 `setInterval` 在 10000 条时每分钟打 12000 次文件系统调用）。触发路径只剩 `focus` / `visibilitychange` / `downloadRevision` 变化。**不要加回来。**
- **`background.js` 已纳入 i18n 提取器的扫描范围**（`test/i18n-extract.cjs` 的 `SOURCE_FILES`）。它用 `BcaI18n.t("字面量")` + 一个存在性兜底；不纳入扫描的话新词条永远进不了词典——4.9 的 6 条就是这样漏掉过一次。

### 回收站、归档体检与导入断点（1.8.23）

- **删除一律先挪进 `005回收站`**：`recycleCollection()` / `recycleRecords()` 把收藏夹或记录目录整体移到 `005回收站/<YYYYMMDD-HHMMSS>/<收藏夹>[/<目录>]`，同秒撞名追加 `-2`、`-3`。优先用 `DirectoryHandle.move()`；本机不支持时退化成「复制整棵树 → `directoryFingerprint()` 逐文件比 `名字:字节数` → 一致才删源」，不一致抛「复制到回收站后校验不一致，源目录没有删除。」并把源目录留在原地。`pruneRecycler()` 只删名字是 `recycleStamp()` 时间戳、且年龄 ≥ `RECYCLE_KEEP_DAYS = 30` 天的目录，每次扫描结束后 fire-and-forget 跑一次；`purgeRecycler()` 是工具栏「清空回收站」的实现。**任何删除路径都不要再直接 `removeEntry(..., { recursive: true })` 用户的记录目录**——新增删除动作必须走这两个函数，测试会盯着。
- **`005回收站` / `006报告` 是保留目录**：与 `000视频下载`…`004导出` 同一套名单（`archive-core.js` 的 `RESERVED_COLLECTION_NAMES`、`background.js` 的同名 Set、`library.js` 的扫描跳过 / 新建收藏夹拦截 / `ARCHIVE_RESERVED_DIRS`，共 9 个名字）。扫描不把它们当收藏夹，用户也不能新建同名收藏夹。
- **归档体检只读**：`writeHealthReport()` 复用 `scanRoot(rootHandle, true)` 的 `diagnostics`（`missingText` / `missingCover` / `brokenText` / `tempFiles`，由 `readArchiveRecord()` 在一次遍历里顺手收集，不额外读盘），写成 `006报告/体检-<YYYYMMDD-HHMMSS>.md`。报告只描述现状、不修任何东西；每类最多列 `HEALTH_REPORT_LIST_LIMIT = 20` 条，多出来的折成「…还有 N 条」。
- **storage 写入兜底只覆盖关键路径**：`safeLocalSet(patch, label)` 失败等 `STORAGE_WRITE_RETRY_MS = 200` 毫秒重试一次，仍失败写一条 `console.warn` + `lastStorageError`（`{ label, message, at }`）并返回 `false`——**它不抛错**，调用方必须看返回值；`setBcaStatsSnapshot()` 是统计快照专用包装，内部保留 `chrome.storage.local.set({ bcaStats: stats })` 字面量（`stability:5627` 钉着），最终失败才抛。弹窗读 `lastStorageError` 展示「本地存储没写进去」，点「知道了」把键删掉。
- **导入断点续跑**：中断时 `writeImportResume(snapshot)` 把「收藏夹名 / 页号 / 已写入数 / 总数 / folderIds」写进 `chrome.storage.local` 的 `bcaImportResume`（不含回滚日志与视频正文，重启浏览器仍然在）。弹窗据此显示「继续上次导入」；后台 `importBiliFavoritesInner` 按 `data.resume.folder` 找收藏夹下标，从那个收藏夹起跑。**匹配用的是收藏夹名**：用户中途改名或删掉收藏夹，就回退成从头开始（会写一行说明），不会崩。
- **版本号只有 `manifest.json` 一处**（1.8.23，P1-6）：`library.html` 的 `#sideVersion` 是空标签，`library.js` 启动时用 `displayVersion(chrome.runtime.getManifest().version)` 填；`release.ps1` 只替换 `manifest.json`，界面与测试里不许再出现硬编码版本号（测试盯着）。

### 内容脚本词典、页面错误留档、卡片复用与 HISTORY 索引（1.8.23）

- **内容脚本只拿自己用得到的词条**：`content-i18n-keys.js` 在 `i18n.js` 之前加载，把 `globalThis.__BCA_CONTENT_I18N_KEYS` 的 14 条键挂出来；`i18n.js` 的 `contentScriptKeys()` 只在这个全局存在时返回数组，`loadTable()` 把它塞进 `bca-locale` 消息；`background.js` 收到 `keys` 就只回这些键（限 200 条、`filtered: true`）。**白名单必须与 `content.js` 里 `BcaI18n.t("…")` 的字面量逐条一致**（`stability` 钉着）；新增一条界面文字时三处一起改：字面量、白名单、两本词典。
- **扩展页的异常也进错误报告**：`client-errors.js` 认 `<html data-bca-page>`，装 `error` / `unhandledrejection`，`report()` 10 秒内同签名只发一次（`CLIENT_REPORT_INTERVAL_MS`），消息类型 `bca-client-error`。后台 `logClientError()` 在内存里按「页面 + message + 栈前两行」合并，`CLIENT_ERROR_MERGE_MS = 24h`、缓存上限 80 条；真正落档仍走 `logError()`，报告正文多一行「来源：页面（…）」。**去重表不持久**是刻意的（不往 storage 堆状态）。
- **视频卡按 `video.id` 复用**：`renderVideos()` 先把当前页记录塞进 `pageVideoById`，再按 id 从 `videoGrid` 现有子节点里找卡片，找不到才 `createVideoCard()`，随后 `updateVideoCard(card, video, query)` 刷内容；顺序不同才逐位 `insertBefore`，多余子节点 `removeChild`。卡片的事件处理器只绑一次，**一律用 `pageVideoById.get(card.dataset.videoId)` 取当前记录**——闭包捕获旧 video 会让筛选后的点击落到上一条记录上。`paintPageCovers()` 仍按页统一读封面。
- **HISTORY 版本索引**：`scripts/history-index.cjs` 在 `docs/HISTORY.md` 顶部维护「版本 → 行号」表；`--write` 重算、`--check` 验新鲜度，`scripts/check-all.cjs` 第 7 项调它。**行号按 `blockLineCount(rows) = rows + 6` 先占位再回填**，别按插入前的行号直接写。新增/删除版本小节后跑一次 `node scripts/history-index.cjs --write`。

### 已知限制（4.9 审视结论，未修的部分）

一次覆盖 约 8800 行 JS 的只读审视确认了下面这些是**已知且暂不修**的限制。**不要把它们当 bug 去"顺手修掉"——每一条都有取舍理由。**

- **`stability.test.cjs` 仍是文本级断言，不执行被测代码**（1.7.22 / 1.7.23 之后已经有四套真执行：`archive-core`、`stats-core`、`background`（vm 里跑 `background.js`，带内存版 `chrome.*` 与 FileSystem）、`pages`（最小 DOM 里跑三个页面脚本），见「常用验证」）。`stability.test.cjs` 的其余断言是"把文件当文本读 + 正则匹配"。它**看不见语法错误**（4.8.2 真的漏过一次：`library.js` 有语法错误但 104 项全绿）。唯一能发现解析错误的是 "every shipped script actually parses" 那条（用 `vm.Script`）。**改完代码必须单独跑 `node --check`。**
- **配置没有版本迁移**。`CONFIG_VERSION = 1`，导入配置时只校验结构不做迁移。将来升版本必须补。
- **没有多标签页互斥**。两个标签页同时打开同一归档、同时做写操作（标记已下载 / 删除 / 移动）没有锁。日常使用很难触发，但理论上存在竞态。
- **没有归档完整性校验与备份机制**。`视频信息.txt` 损坏就是永久丢失，插件没有校验和、没有导出元数据的功能。
- **原生宿主名仍是 `com.bcatch.folder_opener`**（`b_catch` 时代的名字），宿主版本号 `3.9.0`（1.7.13 起每个响应都带 `protocol: 3`，扩展侧会校验）。**改名会让所有已安装用户的注册失效**，所以要么不改，要么改的时候写迁移脚本。
- **扩展 ID 推不出来，只能读**。解压扩展的 ID 与加载时的绝对路径有关，改文件夹名后**以 `chrome://extensions` 显示的 ID 为准**；ID 变了就重跑 `install-native-folder-opener.ps1`。1.7.13 试过四种编码都算不出已装 ID，所以别写任何「从路径算 ID」的脚本。
- **`openDb` 有三份**（`background.js`、`library.js`、`popup.js`；`download.js` 那一份已随 1.3.0 删除），三份都缺少 `objectStoreNames.contains` 守卫（当前版本号都是 1、升级只跑一次，所以没暴露；一旦有人把版本号改成 2 就会抛 `ConstraintError`）。
- **静默吞错按三级分档（1.7.34 起）**。一档＝用户主动发起、失败必须说出来（throw / 弹窗 / 错误报告）；二档＝尽力而为的降级，**行为不变但必须留一条带原因的 `console.warn("原因（影响面）", error)`**；三档＝**是控制流或清理、不是吞掉失败**（探测文件是否存在、`writable.abort()` 之后重新抛、focus 释放、`chrome.runtime.lastError` 没有接收方、角标 best-effort、锁清理），保持 `catch (_) {}` 并写一行注释说明为什么可以静默。**处数别写死**，要数字现数：`grep -c "catch (_) {}" *.js`；`test/stability.test.cjs` 给 `background.js` / `library.js` / `popup.js` / `content.js` 各留了一个上界（棘轮），加一处新的就先从这三档里选一档，再改上界。1.7.34 只动了二档：统计镜像写入、归档写锁的立与清、收尾快照、读已有归档的 BV/av 号，以及收藏库侧的同类路径。
- **归档路径仍要盯着 Windows 的 `MAX_PATH`（260）**。1.7.24 起改成「两段共用预算」：收藏夹段仍最多 120 字符，视频目录段按 `recordSegmentMax(collectionName)` 自动收紧，两段合计不超过 `PATH_SEGMENT_BUDGET_CHARS = 168`（= 260 − 假定根 60 − 预留 32）；`pathBudgetReport()` 能算出还差多少，`scanRoot` 碰到超长目录名会在扫描提示里报出来。**FSA 只给句柄不给真实路径**，所以根那 60 是假定值 —— 下载根放得极深时仍可能撞上限，撞上时报的是「路径过长」而不是「目录不存在」（`describeDirectoryCreateError`）。
- **导入进度广播与状态更新广播都是「窗口节流 + 收尾补发」**（1.8.21）。`importProgress(text, force = false)` 每 500ms 最多发一条，但 `publishImportState`（落盘态）每次都写——**落盘是 UI 自愈的依据，节流掉的只能是 `chrome.runtime.sendMessage`**；阶段边界与每个收藏夹的最后一条用 `force = true`，否则用户会看到进度条停在 7/8 不动。`sendStatusProgress(text, force = false)` 窗口 1500ms，被吞掉的最后一条在 `await Promise.all(runners)` 之后补发：收藏库页的看门狗（`STATUS_REFRESH_IDLE_TIMEOUT_MS = 60000`）靠这条进度续命，**补发不能省，节流窗口也别超过 60 秒**。
- **统计快照写入做了内容指纹去重**（1.8.21）：`publishStatsSnapshot` 只比 `JSON.stringify(stats)`，和上次一样就不写 `storage.local`。**但 `chrome.storage.local.set({ bcaStats:` 这个字面量必须留着**（`stability:5627` 钉它），别为了「更省」改成动态键名。
- **摸宠物的封顶窗口内连整库读都省了**（1.8.21）：`petCappedSnapshot` 记住上次提交后的 `totalTouch / todayTouch / affinity`，窗口内直接算下标回话，不再 `readStatsDatabase`。所以「读完库才判 capped」的旧分支已经删掉——**再看到 `if (touched.capped && …)` 那套写法就是回退**。
- **导入中断快照不再带 `视频信息.txt` 原文**（1.8.21）：`importJournalSnapshot` 的 `modifiedFiles` 只记 `{collection, directory, name}`。回滚从来没用过快照里的 text（真回滚读的是内存 journal 的 `entry.text`），带着它只是把 session storage 撑大。**别把 text 加回去。**
- **`lastResult.path` 本来就是相对路径**（前用户绝对路径这条审查项不成立）：四处写入点拼的都是 `${root.name}/${收藏夹}/${时间目录}`，`root` 是目录句柄、`.name` 只是末段名。`maskLocalUserPaths()` 在这里是防御性空转，不是补漏。**真正会外泄绝对路径的只有错误报告的 `reportPath`**，1.8.21 起回给页面/弹窗的一律过 `storageReportLabel()`（只留末两段）。
- **`视频信息.txt` 的「视频收藏时间」保留精确到秒**（1.8.21 明确取舍）：设置页已写明会把收藏时间一起存下来。改成日期粒度会同时动目录名与统计库 `date`，而且 `parseChineseDateTime` 不认日期-only —— 刷新路径会静默把老记录的时间改成今天。**要么整条链路一起降级，要么不做。**
- **`isMissingError()` 是「不存在」的唯一判据**（1.8.21，`archive-core.js`）：网络盘掉线时 FSA 抛的也是 `NotFoundError`，所以判据只能统一在一处，探活另走 `library.js` 的 `rootIsReachable()`（2 秒 TTL）。**`background.js` 里那份 `NotFoundError && TypeMismatchError` 联合判断是故意保留的**（`stability` 钉着这个字面量），别顺手换掉。

- **原生宿主的 `Assert-HostRootSafe` 不做 8.3 短名展开**（1.8.22 复核，不修）：有人把宿主目录写成 `%LOCALAPPDATA%\BCAFLD~1` 这种短名形式时会被当成「不是默认位置」拒掉。**拒绝比误删安全**，宁可让人重新跑安装脚本，也不要为了一条罕见写法去解析 NTFS 短名。
- **原生宿主没有调用方认证**（1.8.22 复核，不修）：协议只能读同目录的 `settings.json`、对下载根内路径做 `Test-Path`、用资源管理器打开已存在的目录，**不写、不删、不读文件内容**，所以拿到协议格式的本地进程也做不出比「打开一个文件夹」更坏的事。宿主脚本与启动器还放在用户可写目录（`%LOCALAPPDATA%`），同样只是「用户自己改自己的东西」，不构成提权；`get-config` 回明文下载路径是功能需要。
- **`视频信息.txt` 的发布时间带中文星期几**（1.8.22 复核，不修）：那是档案正文的一部分，跟 B 站页面上的写法对齐，**不进词典、不随界面语言变**。`background.js` 的 `formatPublishDate` 上方有注释，别把它当漏翻。
- **卡片用相对时间、详情用绝对时间是刻意分工**（1.8.22 复核，不修）：列表要能一眼扫「刚存的还是很久以前的」，详情要能和磁盘上的目录名逐字对上。**别为了「统一」把两处改成同一种格式。**
- **统计页的小表每次渲染都重算**（1.8.22 复核，不修）：`normalizeDayRows` 逐渲染重建 Map，`dailyRows` 上限 180 行，常数项远小于缓存 + 失效判断的成本。要改先量 `test/bench.cjs`。
- **递归删除遇到 junction / symlink 的行为只做过说明、没有自动化断言**（1.8.22）：FSA 的 `removeEntry(..., { recursive: true })` 在不同 Windows 版本上对 junction 的处理无法在 CI 里复现，只能真机验证。删除失败走失败分支并保留现场，不会静默成功。
- **回收站只按整份 30 天清理，没有「撤销这一条」**（1.8.23）：要提前捞回来只能自己从资源管理器把 `005回收站/<时间戳>/` 下的目录拖回收藏夹；`pruneRecycler()` 只认自己写的时间戳目录名，用户改过名的目录不会被自动清理，也不会被误删。
- **`safeLocalSet()` 只接了三条关键路径**（1.8.23）：统计镜像、补存登记、统计快照。其余几十处 `chrome.storage.local.set` 仍是裸写——它们失败最多丢一条界面状态，不值得逐个改；新增关键写入时再往 `safeLocalSet` 里接。
- **归档体检只描述、不修**（1.8.23）：七类问题里「只有骨架」「缺封面」这类含历史遗留的正常现象，报告不做去重也不做合并；每点一次都重新全量扫一遍（8 路并发读）。
- **`bcaImportResume` 按收藏夹名匹配**（1.8.23）：中途给收藏夹改名或删掉它，续跑就回退成从头开始（会写一行说明）。续跑只保证「不重复写已经有 `视频信息.txt` 的记录」，不保证页内顺序与上次完全一致。
- **页面错误去重只在内存里**（1.8.23）：`clientErrorSeen` 上限 80 条，刷新页面或重启浏览器就清零，同一条错误可能再进一次「001错误报告」。刻意不把去重状态写进 storage——它会随着每次上报增长，且丢了最多多一份报告，不影响正确性。
- **卡片复用依赖 `video.id` 稳定**（1.8.23）：id 变了（比如目录被改名后重新扫描）就会建新卡、丢焦点，这是可接受的降级；`updateVideoCard()` 每页都会重写标题/角标/时间，不依赖旧闭包。
- **`content-i18n-keys.js` 是手写白名单**（1.8.23）：`content.js` 新增界面文字时如果忘了加，内容脚本那条会静默回退中文（不报错、不崩），守卫只能发现「白名单与字面量不一致」，发现不了「你本来想给某个词加译文」。
- **HISTORY 索引要手动重算**（1.8.23）：`--write` 不接在 release.ps1 里（发版第 1 步先比对 tag，插索引会动行号）；发了版忘了跑，`check-all` 会以「版本索引不是最新」失败。


### 图标与外链（4.8.1）

- **`github` 图标是唯一一个实心图标**。`icons.js` 的 `svg()` 统一输出 `fill="none" stroke="currentColor"`，而 GitHub 猫标是实心品牌标识，所以在 path 上内联覆盖 `fill="currentColor" stroke="none"`，外面再套一层 `<g transform="translate(2.6 2.6) scale(0.783)">` 把它缩到和同排线性图标一样大（原路径占满 24×24，不缩会大一圈）。**再加实心品牌图标时照这个写法。**
- **`tv` 是 B 站小电视的意象，不是官方标识的复刻**：圆角机身 + 两根天线 + 两只眼睛，仍然是线框。用它是为了让人一眼认出"B 站"，同时不直接搬用商标图形。
- **跑马灯里的图标必须重新水合**：`buildBannerMarquee()` 是克隆 `.banner-run` 节点，克隆出来的 `[data-icon]` 从没被 `hydrate()` 处理过，不补一次就是空白。改动跑马灯时别把 `BcaIcons.hydrate(githubBanner)` 删掉。
- **`PAGE_SIZES` 必须是 5 的倍数**（一行 5 个）。改分页选项时留意这条，否则最后一行会缺一个。老配置里存着 24/48/96 的用户不会有问题：`sizeSelect.value` 匹配不到任何 option 会变成空串，`Number("") || PAGE_SIZES[0]` 会退回 25。
- **外链地址有两份**：`popup.html` 与 `library.html` 各自写着 B 站主页与仓库地址，改的时候两边都要改（测试会分别断言）。

### 弹窗高度与顶部横幅（4.8）

- **弹窗 600px 上限**是硬约束（Chrome 弹窗最大高度），4.5.1 时把默认视图压到了约 596.8px。4.8 加了顶部开源横幅后**净增高 18px**（`26 - 12 + 4`：高度 26px、抵消掉 main 的上内边距 `--sp-3`、自己的下外边距 `--sp-1`），所以**首次打开时默认视图会轻微滚动约 18px**。
  **这是有意的取舍**：横幅可关闭且状态记住，关掉之后它 `display: none` 离开布局，高度就回到原来的约 596.8px，不再滚动。
- **横幅不做 `position: sticky`**。两个原因：① sticky 的 `top` 是「吸附阈值」而不是偏移量，写成负值会让横幅往上滚一段才吸附、顶部被切掉一截；② 常驻可视区会一直占掉 26px，反而让弹窗更挤。普通块级元素会随内容滚走，可视区还给内容。
- **负外边距必须与 `main` 的内边距对应**：`margin: calc(var(--sp-3) * -1) calc(var(--sp-4) * -1) var(--sp-1)`。上边抵消 `--sp-3`、左右抵消 `--sp-4`（`main` 是 `padding: var(--sp-3) var(--sp-4) var(--sp-2)`）。**改 `main` 的内边距时必须同步改这里**，否则横幅不通栏、会缩进去一截。内边距用 `--sp-4` 是为了让横幅里的文字和正文左对齐。
- **横幅能关掉，靠的是 `theme.css` 里那条全局的 `[hidden] { display: none !important; }`**。`.popup-banner { display: flex }` 的优先级高于浏览器给 `[hidden]` 的默认 `display: none`——**那条 `!important` 不能删**，删了横幅就永远关不掉。同样的坑在 `.batch-toolbar` 等 flex 元素上也存在，所以那条规则是全局的。

### 手动标记已下载（4.8）

- **目录命名只有一份实现**：`videoDirectoryLabel()` / `safeName()` 在 `archive-core.js`，由 `library.js` 调用（1.3.0 前 `download.js` 调的是同一份）。**不要重新实现**——标记建的目录必须和下载器建的目录同名（至少 ` - BV号` 后缀一致），否则用户把外部下好的文件放进去时对不上号，会又建一个副本。
- **标记的做法**：在 `下载根目录/收藏夹/视频目录/` 下写一个 `请将视频放到这里.txt`（`DOWNLOAD_MARKER_FILE` / `DOWNLOAD_MARKER_TEXT` 两个常量）。**这个 txt 是设计的一部分，不是随手加的**：
  1. 目录里有文件 → 扫描的 `hasFiles` 判定天然成立，不必放宽 `if (!identifiers.size || !contents.hasFiles) continue;` 这个既有条件；
  2. 它同时是「已下载」的信号 —— `downloadStateFromIndex` 里的判据是 `match?.hasMedia || match?.marked`；
  3. 内容顺便告诉用户下一步该做什么。
- **改标记文件名要三处一起改**：`DOWNLOAD_MARKER_FILE` 常量、`inspectDownloadDirectory` 里的比对、以及文档。改名后**已标记过的旧目录会失去标记**（会退回未下载状态），用户重新点一次即可。
- **标记过程不发任何网络请求**，只写本地文件系统（测试里有一条断言守着这点）。写失败时错误要显示对话框里，不要静默。

### 版本渠道与界面约定（4.7）

- **界面版本号带渠道前缀**：`displayVersion()` 在 `library.js` 与 `popup.js` 各有一份，**必须保持同步**（测试会抽出两份实现比对同一批输入的输出）。改渠道只需把 `RELEASE_CHANNEL` 从 `"beta"` 改成别的值：beta 显示 `beta4.7`（去掉末尾的 `.0`），正式版显示 `V1.0.0`。界面上的版本号字符串以 `manifest.json` 为唯一来源（1.8.23）：`#sideVersion` 在 HTML 里是空标签，启动时由 `library.js` 现读填入。
- **顶部横幅的跑马灯**由 `buildBannerMarquee()` 在显示横幅后构建、窗口 resize 时重建。它按容器宽度补足份数并保证前后两半等宽（位移 50% 才能无缝）。`library.css` 里有一条 `@media (prefers-reduced-motion: reduce)` 显式豁免——**不要删**：`theme.css` 的全局规则会把动画压成「跑一次就弹回原位」，而 `animation-fill-mode` 默认是 `none`，元素会退回无位移状态，跑马灯就完全不动了。
- **工具栏的下拉框有固定宽度**（`.video-filter select` 132px、`.sort-select select` 124px）。工具栏是 `justify-content: flex-end` 右对齐的，**如果让 select 宽度跟着选中项文字变，整行都会左右窜**。
- **颜色令牌新增 `--feature` / `--feature-soft` / `--feature-line`**（橘黄，用于突出「导入或更新」这类主入口）。浅色 `#a5560a`、深色 `#efa45a`，对比度 4.76 / 7.39。深色那两处仍然必须完全一致。
- **使用须知现在是六条**（新增「不要移动插件文件夹位置」）。三个界面必须逐字一致，测试断言条数为 6。**1.6.4 起删掉了「本插件不是 B 站官方工具……账号风险请自行评估」那一条**（用户要求），两份词典里的对应词条同时删除。

### 收藏库的性能与可访问性（4.6）

- **增量扫描**：`scanRoot()` 现在带缓存。键 = `收藏夹/目录名`，值 = `{size, lastModified, 解析结果}`；按根目录 handle 用 `WeakMap` 发自增 id 隔离。命中时**只调 `getFile()` 取元数据、不读正文**；`size` 或 `lastModified` 变一个字节就只重读那一条。目录列表**每轮重新枚举**，所以新增/删除目录一定反映。
  **三个必须守住的点**：① 缓存键含 `lastModified`，但外部工具若保留原 mtime 改写文件会漏判 —— 所以「刷新」按钮走 `forceFullScan = true` + `clearArchiveCache()`，**这条退路不能删**；② 缓存里的记录对象被 `video.info` **共享引用**，将来任何代码都不许就地修改它，要改就赋新对象；③ 单根目录缓存上限**不是常数**（1.8.4）：容量 = `archiveCacheCapacity(记录数)` = `max(600, 记录数 + 256)`，天花板 20000；超了用 `archiveCacheDropCount()` 一次丢 25%。**写死 600 + 逐条淘汰会让「库只比容量大一点」的库命中率归零**（630 条 / 上限 600 实测 0%）；扫描期间容量跟着已读条数长，别在半路上丢掉下一条要读的条目。
- **扫描只读一遍**（1.8.4）：`scanRoot()` 不再「先枚举一遍数总数、再枚举一遍读记录」—— 进度分母先用上次扫描的条数（`lastScanRecordCount`），估少了跟着 `stats.processed` 长，真值在读完时收口。`longNames`（1.7.24 的路径长度度量）就在这一遍里算，并带回 `lastScanInfo` 显示。
- **下载目录索引有缓存**（1.8.4）：`scanDownloadedDirectories()` 的结果按根目录缓存 2 分钟（`DOWNLOAD_INDEX_TTL_MS`）；手动「刷新」与 `downloadRevision` 变化强制重算，本页删除 / 搬运下载目录后调 `invalidateDownloadIndex(rootHandle)` 立刻作废。**`downloadRevision` 自 1.3.0 删掉下载功能之后已经没人写**，别指望它兜底。
- **扫描结果会存成快照**（1.8.5）：一轮扫描结束后把每条记录的元数据写进 IndexedDB（`bca-archive-snapshot`），下次打开收藏库先按快照把列表画出来（`paintSnapshot()`），再去整库校准。**快照里不许存 `blob:` URL**（那个 URL 的生命周期只到页面关闭），记录对象的封面留空、需要时现读现造。手动「刷新」必须绕过快照 —— 它存在的意义就是不信缓存。
- **快照只写变了的**（1.8.7）：`snapshotSave()` 按 `size` / `lastModified` / `bytes` 三个字段比对，一样就跳过、变了才 `cursor.update()`、消失了的 `cursor.delete()`。**别退回「整根目录先删再全 put」** —— 1 万条就是 1 万次写，而一轮扫描通常只有几十条会变。
- **排序不做全表**（1.8.7）：`renderVideos()` 用 `selectFirstVideos(list, count, compare)` 挑「当前页及以前」的前 k 名（大小封顶为 k 的最大堆），再 `slice` 出当前页。相等项一律按下标兜底（`|| left - right`），保证与「整表稳定排序后再切页」逐项一致 —— 换算法不许让列表顺序抖动。
- **导入可以按条数收工（1.8.8）**：`bca-import-selected-folders` 载荷可带 `limit`（0 = 全部）。名额只数 `pendingItems`（本地还没有的新视频），已有记录不算；`remaining = importLimit - imported` 截断队列后置 `limitReached`，收藏夹循环据此提前 `break`，且额度用完时不再刷新旧记录。完成消息与报告都要写明「按上限」「还剩多少」，否则用户会把「只导了一半」当失败。
- **「同步最近收藏」是「开始更新」的新名字（1.8.8）**：界面、引导页、两本词典一起改名；`docs/HISTORY.md` 里的旧写法是历史记录，不改。
- **老 PNG 封面转 WebP（1.8.8）**：只走用户连上的 `rootHandle`，只碰记录目录里的 `封面.png`，先写 `封面.webp`、`close()` 之后才删原 PNG；保留目录与 `视频信息.txt` 一律不动；判断走 `archive-core.js` 的 `coverConvertAction()`，动手前先过 `archiveWriteLockedByImport()`。
- **`004导出` 只留最近 5 份（1.8.8）**：导出成功后按 `exportPruneList()` 删多余（同秒撞名的 `-2` 排在本体之后），删旧失败只记日志，不影响本次导出；用户自己放进去的文件不匹配命名规则，不会被删。

- **位置重算才允许过渡**（1.8.12）：`syncPosition(animate)` 显式传参 —— 换尺寸档、窗口 resize 传 `true`，拖动与 `settle()` 传 `false`；`settle()` 自己先写 `transition = "none"`。
- **遮罩下限 10%**（1.8.12）：`settings.html` 的滑杆与 `theme.js` 的 `sanitizeAppearance` 两处同时夹，老库里的 0 读取时抬上来。
- **外观写盘节流 120ms**（1.8.12）：`settings.js` 的 `scheduleAppearanceWrite()` 合并 patch、`flushAppearanceWrite()` 落地，`change` 事件立刻 flush。
- **未来时间戳夹到现在**（1.8.12）：`FUTURE_DAY_SLACK_MS` 一天容差，超出夹到 `now` 并计入 `futureDayCount`；`at <= 0` 丢弃。
- **台词序号单独算**（1.8.13）：`BcaStatsCore.petLineIndex(totalTouch, offset)` 是唯一实现；后台在「封顶后合写」的窗口里记 `petDeferredTouches` 并用 offset 补下标，落地清零 —— 合写省掉的是写盘，不是用户看到的变化。
- **内容没变就不重建 DOM**（1.8.14）：`renderVideos()` 先算内容签名（当前页记录的 id/标题/下载与失效标记 + 侧栏名字与条数 + 筛选排序页码），相同就只 `paintPageCovers()` 补封面 —— 快照先画一遍、扫描再画一遍时页面不会闪两下。空列表不短路，否则空态文案会停在旧的上面。
- **合成层不许常驻**（1.8.13）：`.bca-pet-dock` 平时不写 `will-change`，拖动期间才加 `.is-dragging`；常驻会让带 `backdrop-filter` 的面板反复重新采样。

- **统计快照的指纹按内容算**（1.8.11）：`stats.js` 的 `rowSignature()` 对逐日/周/月行做「行数 + 内容滚动和」，同数量不同分布的改动也会触发整页重绘。
- **删行有三条路**（1.8.11）：`removeRecords()` 先按 key 精确删，删不掉按 `bvid:`、再按 `title:收藏夹\u0000标题` 兜底 —— key 算法换过，老行也得删得掉。
- **日键要回比**（1.8.11）：`dayKeyToTime()` 只认「年月日回比一致」的输入，`2026-02-30` 返回 `NaN` 而不是被 JS 滚到 3 月 2 日。
- **宠物封顶后合写**（1.8.11）：每天摸到上限之后，`PET_CAPPED_WRITE_MS`（60 秒）内不再整库重写，只涨内存里的 `totalTouch`。
- **背景图的错误分两类**（1.8.11）：`image decode failed`（图坏了）与存储失败（空间/无痕）提示不同；连选两张时用 `wallpaperSaveChain` 串行落地。

- **统计库的判据只有一份**（1.8.10）：`stats-core.js` 的 `STATS_MIRROR_KEY` / `statsMirrorOf` / `applyStatsMirror` 同时被后台与收藏库页使用；页面侧「读不出来」只跳过并提示，永远不会拿空结果覆盖原文。
- **统计库的写入要跨上下文串行**（1.8.10）：`withStatsDatabaseLock()`（`stats-core.js`）用 Web Locks，锁名 `bili-vault-stats-database`；后台的 `withStatsWriteSlot()` 只负责本上下文排队，跨上下文交给这把锁。没有 `navigator.locks` 时直接跑。
- **写完统计库要读回自检**（1.8.10）：三个写入口共用 `commitStatsDatabase()`（留上一版 → 整份写 → 逐字节比对），不合格用 `database.bak.json` 顶回。
- **逐日明细只有 180 天**（1.8.10）：`stats.js` 的 `dailyRowsCover()` 判区间有没有被明细盖住，没盖住就退到按周 / 按月，并在图下说明粒度变粗的原因 —— 头部「区间内新增」与柱子必须同一个粒度。

- **写库只有一个写者，且「拒绝」不等于「失败」**（1.8.18）：`003database/database.json` 只有 `background.js` 的 `commitStatsDatabaseFromPage` 会写（`bca-stats-commit`）。回话三态 —— `ok` / `declined`（后台明确拒绝：旧库读不出来、写失败、载荷不对）/ 通道断了。页面只在**通道断了**时才退回自己的 `writeFileAtomically`；`declined` 时连 `bcaStats` 都不发。另外扩展重载后残留的旧页面（`chrome.runtime?.id` 已失效）一个字节都不写，只提示刷新 —— 否则它会用 7 秒的换名路径把读不出来的旧库盖掉，并把回声打回来触发整树重扫。
- **坏库只有一次留档，临时残骸跟着写库清**（1.8.19）：`database.json` 解析失败时，由「先读到它的那一方」留一份 `database.bad.<时间戳>.json`；收藏库页提交时带 `pageArchivedBroken`，`readStatsDatabase(root, { archiveBroken: false })` 据此不再归档、也不把这次提交当成读不到库。拒绝提交时**不许** `publishStatsSnapshot` 一份空库 —— 页面手上那份（已经过 `applyStatsMirror`）才是真的。`003database` 里超过 10 分钟的点号 `.tmp` 由 `cleanStatsTempFiles()` 在每次提交前清掉，形状与年龄判据仍只有 `archive-core.js` 的 `isStaleTempFile` 一份。
- **统计快照只用来「触发必要的刷新」**（1.8.15，1.8.16 收窄）：收藏库页听到 `bcaStats` 变化时**只比条数** —— 快照的 `videos` 与界面上的记录数。相等就是自己的回声（本页写完统计库会收到，写盘原子换名要几秒，所以回声总在几秒后才到），**一条重扫都不做**。别再拿「整份快照的指纹」或「收藏夹分布」当触发条件：前者任何一处字段不同就误判，后者的两个来源排序规则不同（侧栏是用户自定义顺序、快照是名字顺序），永远不相等。同一个收藏夹内部挪记录不改变总数，这类改动由本页写入路径自己重画，跨页面改动下次打开自愈。
- **统计库只有一个写者：后台**（1.8.17）。收藏库页只做「读 + 构建」，构建完用 `bca-stats-commit`
  消息把整份库交给后台的 `commitStatsDatabaseFromPage()`，由 `commitStatsDatabase()` 统一
  「留上一版 → 就地写 → 读回自检 → 不合格用 `database.bak.json` 顶回」。页面侧的
  `writeFileAtomically()` 只是消息没接住时的兜底 —— 它那条「临时文件 + 换名」在本机一次要 7 秒。
  ⚠️ 页面那把 Web Lock 只能包「读 + 构建」：包到发消息就会和后台的 `withStatsWriteSlot()`
  抢同一把锁，互相等成死锁。
- **换代时交接封面，别扔**（1.8.16）：扫描结果里每条记录都是新对象、`cover` 为空。换 `collections` 之前先按「收藏夹 + 目录名」把旧封面记下来，给新对象 `addCoverRef()` 补一次引用，再让旧对象交还 —— 顺序反了 URL 会被提前撤销，真机表现是卡片先白一下再补图。
- **搬运下载目录前先问空间**（1.8.7）：`ensureCopySpace()` 用 `navigator.storage.estimate()` 预检，不够就带着「还差 X」抛错；`estimate` 拿不到时只 `console.warn` 放行，**别拦**（老浏览器没有这个 API）。
- **老 PNG 封面只从归档目录里转**（1.8.8）：`convertLegacyPngCovers()` 只遍历 `rootHandle` 下的收藏夹 → 记录目录一层，只认记录目录里文件名叫「封面.png」的那一个，写「封面.webp」成功后才 `removeEntry("封面.png")`。下载目录（`000视频下载`）、`001错误报告` / `002同步报告` / `003database` / `004导出` / `005回收站` / `006报告`、`视频信息.txt` 以及用户自己放进去的文件，**一个都不碰**；保留目录名单与扫描跳过名单是同一套（`ARCHIVE_RESERVED_DIRS`）。「转不转」的判断在 `BcaArchiveCore.coverConvertAction()` 一处：已经有 `封面.webp` 就绝不重转。
- **`004导出` 只留最近 5 份**（1.8.8）：导出成功之后用 `BcaArchiveCore.exportPruneList()` 算出该删哪几个（只认 `归档元数据-YYYYMMDD-HHMMSS(-N)?.json`，同秒撞名时本体排在 `-2` 之前），逐个 `removeEntry`。**清理失败绝不影响这次导出**：写盘已经成功，删不掉只留一条 `console.warn`。
- **性能基准的软上界**（1.8.8）：`test/bench.cjs` 里的 `SOFT_LIMITS_MS` 记着 N = 10000 那一档的「不该再慢成什么样」（实测 × 约 2）。它**不是门禁**：默认只在汇总里打 `[!] … 超过软上界 …`，加了 `--strict` 才用退出码 1 结束。换机器请整表重标；同一台机器跑两遍再下结论。
- **整库校准是 8 路并发**（1.8.5）：`SCAN_READ_CONCURRENCY = 8` 的 worker 池从同一个队列里取 `视频信息.txt` 来读，读完再按原顺序拼回收藏夹。并发只加在「读」上，写盘仍然是后台那条串行队列。
- **体积统计复用扫描字节**（1.8.5）：`scanRoot()` 顺手把每条记录（`meta.size + coverBytes`）与下载树的字节累起来，`updateStorageUsage(handle, { total })` 有现成数字就不再递归整树。

- **封面只在要显示时才读**（1.8.6）：扫描时只记下封面句柄与字节数（`coverEntry` / `coverBytes`），**不** `createObjectURL`；卡片渲染或详情打开时才 `hydrateCover()` 现读现造，blob 用 LRU 封顶 `COVER_LAZY_MAX = 300`，超了把最旧的那条 `video.cover` 清空并 `releaseCoverRef()`。缓存命中路径不碰封面文件，稳态每条记录只剩「枚举目录 + 读 txt」两次往返。
- **UP 主粉丝数按 mid 记住 7 天**（1.8.6）：`chrome.storage.local` 的 `bcaUpFans`（`UP_FANS_TTL_MS`、封顶 `UP_FANS_MAX_ENTRIES = 2000`，写盘 2 秒合并）。`fetchUpFans(mid, tabId, options)` 默认查记忆，`{ fresh: true }` 才强制问接口 —— 「更新视频状态」是用户主动要最新数，必须走 fresh；「只缺粉丝数」的刷新用 `item.fansOnly` 快路，判据仍然是 `recordNeedsRefresh()` 一处。
- **统计库攒批落盘**（1.8.6）：`statsFlushDue()` 只在「攒够 `STATS_FLUSH_EVERY_RECORDS = 200` 条」或「距上次落盘超过 `STATS_FLUSH_EVERY_MS = 30 秒`」时才 `flushStatsPendingRecords()`，导入收尾再强制补一次。**归档文件本身不受影响** —— 这条只减少统计库的整份重写次数。
- **焦点陷阱**是手写栈（`trapFocus()`），目前注册了 `#confirmBackdrop` 与 `#detailPanel`。**再加第三层浮层时必须把它也注册进去**，否则 Tab 会穿透。
- **配置导出**绝不能带上目录句柄、B 站数据或错误报告内容（测试会扫导出代码块里有没有这些标识符）。导入只校验结构与枚举值，`CONFIG_VERSION` 升级时需要补迁移。
- **导入配置时「文件里没有的那一项就别动」**（1.8.4）：`sanitizeConfigPreferences()` 对缺失的 `filters` 返回 `null`，`applyConfigPreferences()` 见 `null` 就整段跳过。理由：「只导外观与档位」的文件本来就没有搜索词与筛选，导入它把用户正在用的筛选清成默认值，等于替用户做了他没要求的事。**新增可导入项时同样要遵守这条** —— 缺项返回 `null`，别补默认值。
- **主题到内容脚本的链路**：扩展页写 `localStorage`（首屏同步防闪色）+ 镜像到 `chrome.storage.local`；`content.js` 读 `chrome.storage` 并监听 `onChanged`。卡片根节点的属性是 `data-bca-theme`，**故意不叫 `data-theme`**——它挂在 B 站页面上，避免和宿主页面的选择器撞车。

### 交互外壳（4.5.1）

- **设置入口**：收藏库右下角挂着**两个圆球**（`.floating-dock`，`position: fixed; z-index: 6; bottom: calc(var(--sp-6) + var(--sp-5))`）—— 上面是**回到顶部** `#scrollTopFab`（`.is-hidden` 时 `opacity: 0` + `pointer-events: none`，滚过 `SCROLL_TOP_REVEAL_AT = 240` 才淡出来，点击 `window.scrollTo({ top: 0, behavior: 平滑或 auto })`，`prefers-reduced-motion` 时直接跳），下面是齿轮 `#settingsFab`，点击 `chrome.tabs.create({ url: chrome.runtime.getURL("settings.html") })` 打开**独立设置页**。设置页分三张卡：外观（`BcaTheme`）、语言（`BcaI18n`）、使用说明（`guide.html` + `tutorial.html` 两个入口）。**改完立即生效、人留在设置页**；「返回收藏库」直接 `chrome.tabs.getCurrent` + `chrome.tabs.update(tab.id, { url })` **就地导航**（V1.4.1 起不再用 `window.close()` —— 关标签页只在「上一个被激活的标签恰好是收藏库」时才对）。**主题名要翻译**（`跟随系统/白天/夜晚/自定义` 是界面文字），**语言名不翻译**（`简体中文/繁體中文/English` 是各语言自称）。旧的三球浮层菜单（`THEME_ICONS` / `toggleDockMenu` / `closeDockMenus` / `buildDockMenu` / `renderDockMenus` / `.dock-menu` / `.guide-fab`）已整块删除，测试里有反向断言，不要再抄回来。
- **插件弹窗的分段控件**：`.segmented`，按钮用 `aria-pressed` 表达选中。**主题按钮的文字必须套 `<span data-i18n>`**——按钮里还有 `<span class="segmented-icon">` 图标，`data-i18n` 用 `textContent` 会把图标清掉。
- **新建收藏夹**在收藏夹列表之后（`.collection-create-tail`），不要再放回「我的收藏夹」标题行。
- **更新视频状态必须过确认框**（`openStatusConfirm` → `#statusConfirm`）：单条与批量共用，批量走 `selectedRecords()`（**不是 `selectedVideos()`**——后者是当前收藏夹的全部视频，用错会把整个收藏夹刷一遍，正好是最容易触发风控的行为）。上限 `STATUS_BATCH_LIMIT = 80`，超出部分提示分次继续。
- **logo 三处同源**：`library.css` 的 `.brand-mark`、`popup.css` 的 `.brand-icon`、`background.js` 里 `updateActionIcon()` 用 OffscreenCanvas 画的工具栏图标。改观感时三处一起改，并保留「关闭自动归档 → 转灰」的行为（灰色也有渐变）。

### 使用须知（4.4 新增）

同一份**六条**安全声明必须同时出现在 `library.html`、`popup.html`，**逐字一致**（测试会逐条比对）。（1.3.0 前下载页也有第三份，随那张页面一起删除。）

4.4.1 起：三处统一用 --warning-soft / --warning-line 黄色底、正文 --fs-md(15px)；收藏库默认展开、可折叠，但**不允许永久关闭**（dismissSafety 按钮与 safetyNoticeDismissed 写入都已删除，只保留一次性的旧标记清理）；弹窗里**置顶**（排在 brand-row 之前）且默认折叠，避免把 600px 高的弹窗撑开。**新增任何界面入口时，请一并带上这份声明，或明确说明为什么不需要；也不要把「不再提示」加回来。**

4.5 起：**「请勿滥用……」一条必须排在最前面**（测试会断言第一条以「请勿滥用：」开头，且两个界面的**六条**文字完全一致）。条目上带 data-i18n；**1.3.0 起六条全是纯文本** —— 原来第 2 条带 DownKyi 链接、第 3 条讲下载文件不要外传，两条都换成了「1.3.0 起不再提供下载 / 放进收藏夹的文件仅限个人离线观看」，不再需要 data-i18n-html。

V1.2.3 起：**折叠的须知必须留个「口子」** —— 摘要行里固定带一句 `class="safety-hint"` 的「请勿滥用，请分批、低速使用」，风控提醒不能因为折叠就从界面上消失。V1.3.0 起只有两处：`library.html` 默认展开、`popup.html` 置顶且默认折叠。折叠一律用原生 `<details>`，**不要再引入「不再提示 / 记住已关闭」**。

### 本地收藏库

`library.js` 通过 File System Access API 读取本地目录，只认下列视频归档结构：

```text
本地备份文件夹/
└── 收藏夹名称/
    └── YYYY年M月D日H时M分S秒[_n]/
        ├── 视频信息.txt
        └── 封面.webp（4.9 前的老档案是 封面.png，读取时两个名字都认）
```

解析视频信息时依赖“【基本信息】”区块和“视频标题”等字段。不要轻易改变文件名或目录格式，否则旧档案可能不再被识别。列表中的收藏夹和视频信息是本地扫描的结果；线上 B 站收藏不会因移动/删除本地记录而改变。

移动或复制操作先按目标收藏夹判断 BV/av 重复项，再复制归档文件。勾选原收藏夹表示保留原件（复制）；不勾选表示移动。删除收藏夹/视频/批量视频前会确认；**确认后的删除一律先挪进 `005回收站`（保留 30 天），不再直接递归删**（见「回收站、归档体检与导入断点」）；扫描提示条上的「清理这些没写完的目录」同样先送回收站。用户可额外勾选同时删除关联下载，默认不删除下载。

**V1.2.1 起，这个对话框还会标出「这支视频在别的收藏夹里也有一份」**：`collectionsHoldingEveryVideo(videos)` 用 BV/av 标识键（`videoIdentifierKeys` / `identifiersOverlap`）在全库的 `collections` 里比对，命中的收藏夹加一枚灰色「已收录」徽标（和品牌色的「原收藏夹」徽标刻意分开）。**徽标只是说明，不参与搬运**：`moveVideoRecordToTargets` 只在 `video.collection` 不在目标里时才移走**那一个**副本，别处的副本它不碰 —— 所以「已收录」的收藏夹**故意不被默认勾选**。勾上不会产生任何效果，却会让用户以为「取消勾选 = 从那里删掉」，点了看着像干了什么其实什么都没干。要清理别处的副本，得先切到那个收藏夹再操作一次。没有 BV/av 号的档案（标识键为空）不参与比对：宁可漏标，不能标错。底部说明文字、`.collection-held-badge` 样式、这条规则都由测试盯着。

视频详情底部的标签是 `<a>`（不是 `<span>`）：点击在新标签页打开 `https://search.bilibili.com/all?keyword=<标签>`，`target="_blank"` + `rel="noopener noreferrer"`。它只是一个普通链接，不发请求、不读页面数据、不需要新权限；`title` 提示是「在 B 站搜索标签“…”」。

### “已下载”状态与 000视频下载

**1.3.0 起插件自己不下载了，但目录布局与判据一字未改** —— 用户自己下载的视频仍然放进同一套目录：

```text
本地备份文件夹/
├── 000视频下载/
│   └── 收藏夹名称/
│       └── 视频标题 - BV号/av号/
└── 001错误报告/
```

用户早先设过的自定义下载目录（`chrome.storage.local.downloadRootPath`）仍然会被读取，布局也是“下载根目录/收藏夹/视频目录”；1.3.0 起界面上没有改它的地方了。（1.3.0 前：`download.js` 负责目录选择、下载流、保存和进度，`background.js` 负责解析播放流和字幕。）

3.6 关键状态规则：

- ~~从本地收藏库进入下载页时的队列传递~~ —— 1.3.0 随下载页删除（`bcaDownloadQueue:<UUID>` 的界面入口没了；`archive-core.js` 里的 `withSourceCollection()` 等纯函数保留，测试仍在跑）。
- 同一收藏夹下按 BV/av 号查找并复用已有目录，防止重复下载生成 `(2)`、`(3)` 目录。
- `已下载` 徽标仅由媒体文件决定：mp4、mkv、webm、m4s、flv、mov、avi。封面、字幕或信息文件单独存在时不标记已下载，但详情页仍可打开含有文件的目录。
- 下载目录扫描权限暂时不可用时，保留已知状态；确认读取到空目录后才清除状态。
- 取消时只清理本次任务新建的目录。复用的旧目录及其中已完成文件不能删除。
- 3.5 曾把视频错误写到 `未分类收藏`。3.6 会按 BV/av 识别旧目录并显示状态，也会在管理动作中查找它们；不会自动搬动旧文件。
- ~~下载失败写 `001错误报告`~~ —— 1.3.0 随 `download.js` 删除；导入与归档失败仍照旧写报告。

手动标记（或用户自己在目录里增删文件）后写入 `chrome.storage.local.downloadRevision`，收藏库监听此变化并扫描状态；页面聚焦/显示时检查，前台不再定时重扫（4.9 已移除 60 秒定时器，改为 focus / visibilitychange / downloadRevision 变化时触发）。

### Native Messaging 原生目录助手

详情页通过 `chrome.runtime.sendNativeMessage("com.bcatch.folder_opener", …)` 请求打开下载目录。`install-native-folder-opener.ps1` 会把工作脚本、编译出的宿主启动器、设置和 Chrome 原生消息清单安装到 `%LOCALAPPDATA%\BcaFolderOpener`，并写入 `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.bcatch.folder_opener`。安装时可以交互输入，也支持参数 `-ExtensionId`、`-DownloadBasePath`、`-HostRoot`、`-SkipRegistry`（自检与自动化用它把产物写进沙箱目录）。

**两个必须记住的硬约束（3.7 的失效就是它们造成的）：**

1. **Chrome 的原生消息清单只识别 `name`、`description`、`path`、`type`、`allowed_origins`，不解析 `args`。** 3.7 把 PowerShell 的启动参数写进了 `args`，Chrome 忽略该字段后启动了一个没有任何参数的 `powershell.exe`：它把二进制帧当成命令读，协议当场损坏，扩展只能看到 `chrome.runtime.lastError`，于是永远提示“无法启动文件资源管理器”。因此清单的 `path` 必须指向一个不带参数即可运行的可执行文件，现在指向编译产物 `folder-opener-launcher.exe`。**任何后续改动都不要重新引入 `args`**（`test/stability.test.cjs` 里有对应的回归断言）。
2. **`settings.json` 必须用 `-Encoding UTF8` 读取。** 3.7 的安装脚本以无 BOM 的 UTF-8 写该文件，而工作脚本用 `Get-Content -Raw`（PowerShell 5.1 默认按系统 ANSI 代码页）读取，中文下载路径被解坏，`ConvertFrom-Json` 直接抛出“无法识别的转义序列”，即使修好 `args` 也会继续失败。现在安装脚本写 UTF-8 带 BOM，工作脚本始终显式 `-Encoding UTF8`。所有 `.ps1` 与 `.cs` 源文件本身也必须保存为 **UTF-8 带 BOM**，否则 PowerShell 5.1 解析中文会乱码；写成不带 BOM 后必须补回。

**运行链路**：Chrome 启动 `folder-opener-launcher.exe` → 启动器读取一条带 4 字节长度前缀的请求 → 转发给同目录的 `folder-opener-host.ps1`（`-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File`，`CreateNoWindow`，不闪窗）→ 把响应帧原样写回 Chrome。启动器在自身失败时也会回一条 `{"ok":false,"protocol":3,"version":…,"message":…}` 帧，所以扩展能显示真正原因，而不是只有 Chrome 的 `native host has exited`；**1.7.13 起错误帧也带协议号**，扩展才分得清「宿主版本旧」和「宿主根本没起来」。`sendNativeMessage` 每次调用都会新起一个宿主进程，因此启动器只处理一条消息后退出；若将来改用 `connectNative` 长连接，必须改成循环处理。

**工作脚本协议**（当前 `protocol` = 3、`version` = 3.9.0）：每条响应都由 `Write-Response` 统一补上 `protocol` 与 `version` —— 三处常量必须一致：`native/folder-opener-host.ps1` 的 `$protocolVersion`、`native/folder-opener-launcher.cs` 的 `LauncherProtocolVersion`、`library.js` 的 `NATIVE_PROTOCOL_VERSION`（`test/stability.test.cjs` 有断言钉住）。长度前缀是 4 字节，**长度头必须循环读满**（分片到达时一次裸 `Read` 只会回 1~3 字节），**长度非法时必须先把 body 排空再回错误帧**，否则剩下的字节会被当成新的长度头继续解析。`get-config` 返回 `downloadBasePath`、`protocol` 与 `version`；`resolve-directory` 只校验并返回绝对路径（不打开窗口），供“复制视频目录路径”使用；`open-directory` 校验后调用 `explorer.exe` 并返回 `targetPath`。三者都会校验目录名不含分隔符、目标路径必须仍在配置的下载根目录之内。

**排错顺序**：先运行 `test-native-folder-opener.ps1`（默认不打开资源管理器）。它检查宿主目录四个文件、清单是否含 `args`、`path` 是否指向启动器、`allowed_origins` 是否**逐字等于 `settings.json` 里记的扩展 ID**（1.7.13 起才真的比对 ID；在那之前只判「非空」，所以最常见的那种故障——ID 填错——照样自检通过）、注册表里至少有一个浏览器键的默认值正好指向本目录的清单，然后直接按帧协议调用启动器，并核对宿主报的 `protocol` 是不是扩展认得的那个。自检通过说明原生侧没问题，剩下的就是扩展重载或 Chrome 未重启。改脚本后务必重新做 PowerShell 语法检查并重新编译启动器（重跑安装脚本即可）。

## `视频信息.txt` 格式（4.2 起）

```text
【基本信息】
视频收藏时间：2026年10月09日 01时19分50秒.175
信息保存于：2026-10-09 01:19:50
所属收藏夹：蜡笔小新
视频标题：……
视频链接：https://www.bilibili.com/video/BV……/
BV号：……            # 导入的档案还会在此前插入「视频状态」「恢复情况」两行
av号：……            # 缺失时写“未知”
分区：……
视频时长：……
视频发布时间：2026-08-14 06:00:00 星期五

【UP主】
UP主昵称：……
UP主UID：……
UP主粉丝数：……      # 4.2 新增，来自 /x/relation/stat
UP主主页：https://space.bilibili.com/……

【互动数据】          # 4.2 新增，只有抓到数据时才写这一段
播放量：……
弹幕量：……
点赞数：……
投硬币枚数：……
收藏人数：……
转发人数：……

【标签】
标签1、标签2、……

【视频简介】
……
```

**兼容性要点**：

- 缺失字段一律写「未知」「无」或 `-`，`archive-core.js` 的 `INFO_PLACEHOLDERS` 与 `background.js` 的 `IMPORT_PLACEHOLDER_VALUES` 会把这些当空处理；**两份清单必须一起改**。
- `library.js` 的 `parseInfo()` 对任意 `【区块】` 通用，`播放量：73798` 这类行会进 `fields`，所以新增字段不会让旧页面解析失败；反过来，旧档案缺这些字段时网页端只是不显示对应模块。
- 【标签】永远是**单行**、【视频简介】永远是**最后一个区块**——4.1beta 的文本补丁依赖这两个前提（4.2 改为整文件重写，已不依赖，但改 `buildInfo()` 时仍建议保持这个顺序）。
- B 站分享文案（`…, 视频播放量 71953、…, 相关视频：…`）由 `archive-core.js` 的 `splitShareText()` 拆分：`background.js` 有一份等价实现（service worker 无法 require 经典脚本），**测试会比对两者输出必须一致**。

## 页面与消息接口

后台 `chrome.runtime.onMessage` 主要处理这些消息，改动时同步检查发送端和响应结构：

| 消息类型 | 发送端 → 处理端 | 作用 |
|---|---|---|
| `save-favorite` | `content.js` → `background.js` | 保存线上收藏的视频信息和封面 |
| `retry-pending-favorite` | `popup.js` → `background.js` | 恢复授权后重试暂存的收藏 |
| `get-status` | `popup.js` → `background.js` | 读取最近状态和错误（4.2 起附带 `importState`） |
| `bca-import-control` | `popup.js` → `background.js` | 4.2：暂停 / 继续 / 取消正在进行的导入 |
| `bca-import-state` | 任意页面 → `background.js` | 4.2：单独查询导入运行状态 |
| `bca-locale` | 内容脚本 `i18n.js` → `background.js` | 4.5：内容脚本请后台代取词典。**不能自己 fetch**——从网页上下文读扩展资源必须声明 `web_accessible_resources`，而 4.3 起刻意不开放任何扩展资源给网页；直接 fetch 会被拦、被 `try/catch` 吞成空词典，表现为提示卡永远中文且不报错 |
| `bca-open-library` | `content.js` → `background.js` | 4.3：由后台 `chrome.tabs.create` 打开本地收藏库，扩展页因此不必暴露给网页 |
| `bca-refresh-video-stats` | `library.js` → `background.js` | 4.4：重新解析并更新互动数据与粉丝数；失效只打标记 |
| `bca-status-progress` | `background.js` → `library.js` | 4.4：更新视频状态的进度回报 |
| `add-manual-video` | `library.js` → `background.js` | 解析手动添加视频并写入一个或多个收藏夹 |
| `import-bili-favorites` | `favorites-import.js` → `background.js` | 导入所选线上收藏夹 |
| `bca-list-import-folders` | `popup.js` → `favorites-import.js` | 在收藏夹页请求线上收藏夹列表 |
| `list-bili-favorite-folders` | `favorites-import.js` → `background.js` | 获取线上收藏夹列表 |
| `bca-import-selected-folders` | `popup.js` → `favorites-import.js` | 启动所选收藏夹导入 |
| `bca-page-api-get` | `background.js` → `favorites-import.js` | 通过已登录页面上下文发起收藏夹 API 请求 |

`bca-download-parse` / `bca-download-playurl` / `bca-download-subtitles` 三条消息 1.3.0 已随下载功能删除。

后台还保留 `record-favorite-error` 消息处理器，但当前项目内没有找到活跃发送端。若要清理它，先确认外部/旧版页面没有依赖。

异步消息处理器需保持 `sendResponse` 和 `return true` 的配对。修改 API 时不要把 Cookie、CSRF 或用户授权数据写入日志/错误报告。

## 设置和状态保存位置

**IndexedDB**：数据库 `bili-fav-archiver`，对象仓库 `settings`。常用键：

- `rootHandle`：本地备份文件夹的 FileSystemDirectoryHandle。
- ~~`downloadFolder` / `downloadFolderMode`~~：自选下载目录句柄与模式。1.3.0 起没有任何界面写它们（读侧保留，老用户的值还在）。

**`chrome.storage.local`**：

- `enabled`：自动归档开关，`false` 为关闭。
- `lastResult`：最近成功/失败状态。
- `lastError`：错误报告文本及路径。
- `pendingFavorite`、`authorizedErrorAt`：授权失效后待补存相关状态。
- `downloadRevision`：通知本地库刷新下载状态的版本标记。
- `collectionOrder`：网页收藏夹排序。
- `importState`：4.2 起导入的运行状态 `{ running, paused, text, startedAt, finishedAt, summary }`。弹窗靠它恢复按钮；`publishImportState()` 对进度更新做了 500ms 节流，关键状态变化传 `force=true` 立即落盘。导入结束后不会清空，只把 `running` 置 false。
- `libraryViewMode` / `libraryPageSize`：4.1 起收藏库的网格/竖列与每页数量。
- `importHintDismissed`：4.2 起收藏库顶部导入提示条是否已被关闭。
- `recoverInvalidVideos`：4.3 引入的「尝试恢复失效视频」开关。**4.4.1 起默认开启**（判定为 `!== false`，只有明确存成 false 才关闭）。关闭时导入不会调用 APP 接口恢复流程。
- `safetyNoticeDismissed`：4.4 的遗留键。4.4.1 起不再生效（须知必须常驻），`library.js` 启动时会把它清掉。
- 还可能包含导入任务进度及其他 UI 状态；改动前搜索全项目读写点。

**`chrome.storage.session`**：4.9 起用于跨进程存活的导入回滚日志（见上文）。1.3.0 前还有一份「临时批量下载队列」（`bcaDownloadQueue:<UUID>`），随下载页删除。
