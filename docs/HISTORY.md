# 哔哩藏库 · 版本改动与根因

> 本文是 [`AI_HANDOFF.md`](../AI_HANDOFF.md) 的配套文档，从新到旧记录每个版本改了什么、根因是什么、踩过哪些坑。
> 「现在该遵守什么」看 `AI_HANDOFF.md` 的「修改原则」；用户可见的版本说明在 [`README.md`](../README.md)。
> 行号会随代码漂移，本文里的行号按「当时那一版」记，查证时以 grep 当前代码为准。


## 1.7.29：emoji 代理对（facet-compat §3.4）与维护规范的范围

**改了什么**：按字符数截断的地方以前数的都是 UTF-16 码元，一个 emoji 占 2 个码元，正好在边界落刀就会把代理对劈成两半，留下一个孤立代理，写进目录名后 Windows 把它变成 `?`。新增 `sliceCodePoints()`（`archive-core.js` 导出、`background.js` 留一份同实现，因为后台是 ES module 无法 require 经典脚本），并替换全部 11 处按码元截的调用点：`safeCollectionName` / `safeName`（三处分支）/ `videoDirectoryLabel` 的标题段、配置的收藏夹顺序与 `search`/`upFilter`/`tagFilter`、以及 `library.js` 与 `background.js` 里的错误摘要。

**根因**：`truncateToBytes()` 是按码点走的，但它只管**字节数**，管不到「先按字符切」这一步 —— 所以两层保护各自看着都对，合起来仍然漏。§3.4 原本判为 P3，1.7.24 收掉同区域的 §3.2（路径长度 260）后才被翻出来。

**同时**：`AI_HANDOFF.md` 的「本文档的维护规范」改名「项目文档的维护规范」，范围扩到 `README.md` / `SMOKE_TEST.md` / `docs/*.md` / `bili_vault_ref/TODO.md`，并补上「待办做完了要从 TODO 里删掉」这类动作；守卫断言加了一条「维护规范要覆盖这五份文档」。

**守卫**：`test/stability.test.cjs` 新增「按字符截断的地方一律按码点截，不许把代理对劈开（V1.7.29）」（静态：11 处调用点都不许退回 `.slice(0, n)` 形式、`sliceCodePoints` 必须导出）；`test/archive-core.test.cjs` 新增 3 条真执行用例（助手本身、`safeCollectionName`/`safeName`、`videoDirectoryLabel` 的 BV 后缀边界）。测试 stability 248 → 249、archive-core 72 → 75。

## 关于 1.7.8 – 1.7.24（这 17 个版本的详细记录在 README 里）

> 本文从 1.7.25 起逐版本记录**工程侧**内容（根因、踩坑、设计取舍）。1.7.8 – 1.7.24 是 **P0–P2 审查整改的 17 个批次**，逐版本说明写在 [`README.md`](../README.md) 的「正式版更新」里（那是面向用户的写法，但每条都写了根因）。下面这张表只做索引，让新接手的人一眼看到那 17 个版本各在收什么。

| 版本 | 主题 |
|---|---|
| 1.7.8 | 命名漂移归一（互动数据六键、`identifiersOverlap`） |
| 1.7.9 | 术语统一「本地归档」+ 无障碍与交互文案 13 条 |
| 1.7.10 | 存储与数据安全 11 条（收藏夹顺序、配置导入上限、统计缩水闸、目录名字节闸） |
| 1.7.11 | 隐私与安全 10 条（封面域名白名单、唯一带 cookie 的出网口、保留目录名单下沉、路径打码） |
| 1.7.12 | 性能 7 条（日历记忆化、筛选池缓存、行节点复用、缓存根上限） |
| 1.7.13 | 原生宿主 7 条（协议号三处一致、长度头读满、安装器 8 个注册表键、自检不再假绿、BOM 守卫） |
| 1.7.14 | 最后四笔账（文件系统错误分类、词典取失败不再静默、根目录可达性、`stats-core` 导出面认账） |
| 1.7.15 | 回修审计抓到的两处自伤（TDZ 崩溃、C4 分类表守卫缺失） |
| 1.7.16 | 归档原子写重上（换名失败一律退回就地写、写失败不再删整条记录） |
| 1.7.17 | 三条小账（配置导出带个人内容、卸载残留入口、Chrome 111 的下界理由写清） |
| 1.7.18 | 取消导入回滚统计行、下载目录复制逐字节校验 |
| 1.7.19 | 坏库 / 空库两条出口的统计镜像、`isTrusted`、深色壁纸遮罩 |
| 1.7.20 | 导入失败终态、角标等你看过再清、窄窗口 Alt+↑/↓ 排序、页面全局变量的死读取 |
| 1.7.21 | 统计库三个写入口串行化、批量搬运进度与中止、词典闸门报出「多余」 |
| 1.7.22 | `test/background.test.cjs`：把碰 `chrome.*` 的那一半真跑起来 |
| 1.7.23 | `test/dom-harness.cjs` + `test/pages.test.cjs`：页面脚本真跑起来 |
| 1.7.24 | 路径 260 字符预算：两段共用预算 + `pathBudgetReport` + 超长目录名提示 |

---


## 1.7.28：文档完备性收尾（交接就绪）

**动机**：要把项目交给下一个 agent，于是把仓库里 5 份 Markdown 逐份审了一遍。内容质量够，但有三类会误导新人的问题：路径过期（探针脚本还写 `b_catch`）、数字会漂（写死 stability 条数与子套件条数）、以及「新人看不到的东西」（二十多个版本各自的增量清单里，没有一份「当前该跑哪几条」）。

**改动**
1. `SMOKE_TEST.md` 顶部加「当前全量验收清单（按功能，不按版本）」14 条；各版本增量清单保留在下面回查。
2. `docs/HISTORY.md` 加 1.7.8 – 1.7.24 的 17 行索引表 —— 那 17 个批次过去只写在 README 更新说明里，本文的历史线从 1.7.7 直接跳到 1.7.25。
3. README 两处探针路径 `b_catch/` → `bili_vault_ref/`；删掉三处写死数字。
4. 「4.1–4.2 期遗留的两条历史限制」从 `AI_HANDOFF.md` 挪进本文（4.2 已解决），入口文档留一行指针。
5. `AI_HANDOFF.md` 自维护规范的门槛 600 行 → 700 行（它当时已 660 行，原门槛与自己矛盾）。
6. 新增 1 条守卫：钉住「SMOKE 有当前全量清单」「HISTORY 有 1.7.8–1.7.24 索引」，删了就红。测试 247 → 248。

**教训**：文档里凡是「必须自己数一遍才知道对不对」的数字，早晚会错。这个项目已经形成两条可靠做法 —— 交给脚本生成（`test/status.cjs`），或者写成「现数」的读法（`grep -c`）。这一版又把三处写死数字换成了这两种。


## 1.7.27：交接文档补「当前状态」与「同一判断的权威位置」

**动机**：交接文档 1.7.25 拆成三份之后，入口那份仍然只讲「怎么做」，不讲「现在到哪了」。状态靠顺手记，记了必漂；而这个项目最容易被改漏的，恰恰是那十几处「同一份逻辑写了两份」。

**新增**

- `test/status.cjs`：`--write` 跑五套测试 + 词典检查，把结果写回 `AI_HANDOFF.md` 的 `<!-- status:begin/end -->` 块；`--check` 只核对（词典条数、stability 项数、标记还在不在）。`release.ps1` 第 4 步接的就是 `--check`。
- `AI_HANDOFF.md` 新增：`## 当前状态`、`## 同一判断的权威位置`（10 行双份实现清单，并点名哪几行没有守卫）、「改了什么跑哪几套」矩阵、五套测试分工表、领域术语表、不可逆操作清单、「完成」的定义；维护规范补一行触发条件与一条自检命令。
- 两条守卫断言（stability 245 → 247）：状态块必须与真实项数一致；权威位置表必须覆盖四个关键名字，且表里说的双份实现得真的还在两份文件里。

**踩的坑**

- 「状态块里要写 247」和「三处文档标记要写 247」互为前提：先加守卫会让两处同时红。解法是先把数字手推到新值，再跑 `--write` 让脚本自己确认 —— 顺序反了会卡住，因为 `status.cjs --write` 要跑测试，而测试又要求数字已经对。
- `patchVolatileFields` 的两份实现**不逐字相同**：后台那份的助手叫 `importIsPlaceholder`（13 处引用），核心那份叫 `isPlaceholderValue`。所以做不了逐字守卫，只能写进表里当已知缺口。

## 1.7.26：发版不再需要开系统代理

**根因**：`release.ps1` 第 2 步用 `Test-NetConnection` 探 `127.0.0.1:7897`，探不到就 `exit 1`，而脚本里所有 git 远程命令（`ls-remote` / `push` / `fetch`）一律带 `-c http.proxy=…` 强行走代理。于是「发版」和「开着系统代理」被绑在了一起 —— 可系统代理一开，浏览国内网站就变卡，用户每次发版都得手动开、发完再关。

实测还发现一个关键事实：**混合端口跟「系统代理」开关无关**。Clash Verge 的内核（`verge-mihomo.exe`）跑着的时候 `127.0.0.1:7897` 就一直在 LISTENING，而当时 `HKCU\...\Internet Settings\ProxyEnable = 0`（系统代理是关的）；同时 `git ls-remote` 直连也能成功。

**改法**：
- 新增 `Invoke-GitRemote`：先 `Invoke-Native $Git $Arguments` 直连，`$LASTEXITCODE -ne 0` 时才加 `$GitArgs`（两个 `-c *.proxy=`）重试。`ls-remote` / `push` / `fetch` 三处都换成它。
- 第 2 步不再按端口是否开放中止：端口开着打一句提示，关着就说「内核没在跑，先试直连」，真正的中止条件变成「`Invoke-GitRemote` 返回值非 0」，提示语改成「打开 Clash Verge（系统代理不用开）」。
- 交接文档同步改口：`AI_HANDOFF.md` 里「检查工作区与代理」→「检查工作区与能不能到 GitHub」，并写明「不用手工设 `HTTPS_PROXY`、不用开系统代理」。

**验证**：临时探针 `_probe-gitremote.ps1` 抠出函数跑两个分支 —— 直连成功（exit 0，输出 `78664d3`）；直连失败自动打印「改走代理…重试」并把代理侧的 `fatal: ... does not appear to be a git repository` 与 exit 128 带出来。`release.ps1` 用 `[System.Management.Automation.Language.Parser]::ParseFile` 验过 PARSE OK，BOM（`efbbbf`）保留。

**教训**：把「发版」绑在「某个外部开关必须是开着的」上面时，先验证那个开关是否真的是必要条件 —— 这里的真实依赖只是「内核在跑」，而不是「系统代理开着」，前者关着系统代理也在。

## 1.7.25：交接文档拆成「入口 + 架构 + 历史」三份

`AI_HANDOFF.md` 长到 1180 行 / 200 KB，其中版本日志 350 行、架构细节 470 行，而接手的人最先要看的「怎么测、怎么发版、哪些规则不能破」在文件末尾。**纯文档整理，代码一行没改**：

- 拆成 `AI_HANDOFF.md`（入口，435 行）+ `docs/ARCHITECTURE.md`（477 行）+ `docs/HISTORY.md`（版本日志，355 行）。
- 入口文档新增「快速开始」（四套测试命令、发版命令、十条硬规则）与「按任务找文件」对照表。
- 修掉 5 处拆分后失效的「见下文」指引，改成显式的跨文件链接。
- `pack.ps1` 排除 `docs/`；新增一条守卫钉住三份文档的分工。

## 1.7.7：断掉「库页自我维持的每秒一轮」（性能审计第 2 份，P0×2 + P1×5）

1. **P0-1 自我维持环路**（library.js）：`displayRoot` → `syncStatsDatabase()` → `storage.local.set({bcaStats})` → 本页自己的 `storage.onChanged` → `scheduleArchiveRefresh()`（900ms）→ 再 `displayRoot`。燃料是 `snapshot()` 的 `updatedAt` 每次都是新的。修法两层：`syncStatsDatabase()` 先算「实质指纹」（`publishedStatsFingerprintOf()`，只看 videos/days/totals/firstSeen/collections/daily/dailyRows/topCollection，**不算 updatedAt**），相同就直接 return（数据库与快照都不写）；`storage.onChanged` 里收到 `bcaStats` 时也先比指纹，相同就是自己的回声、不重扫。真机可验：空闲时 `database.json` 的 mtime 不再每秒跳动。
2. **P0-2 切回标签页整树重扫下载目录**（library.js）：`window.addEventListener("focus", refreshDownloadStatuses)` 删除（与 `visibilitychange` 重复）；`refreshDownloadStatuses(force = false)` 加 `DOWNLOAD_STATUS_MIN_INTERVAL_MS = 60000` 最小间隔，只有 `downloadRevision`（下载真的写完）传 `true` 绕过。
3. **P1-1 统计页每秒整页重绘**（stats.js）：`watchStorage()` 改成「实质指纹比较 + 300ms 防抖」，只有 `updatedAt` 变了的快照不再触发 `render()`。
4. **P1-2 每次写库都整份复制 `.bak`**（background.js）：`archivePreviousStatsDatabase()` 加 `STATS_BAK_MIN_INTERVAL_MS = 10 分钟` 时间闸（仍然满足「备份比正文早一版」）。
5. **P1-3 导入进度 500ms 落盘**（background.js）：`publishImportState()` 序列化后与上次写入的字符串比较，相同就不写、不广播；`IMPORT_RUN_PUBLISH_INTERVAL_MS` 5000 → 15000。
6. **P1-4 每次点击都做样式/布局计算**（content.js）：`findFavoriteDialog()` 先按 `childElementCount` 筛掉路径上的叶子节点（弹窗必是有子元素的容器），语义不变、`getComputedStyle`/`innerText` 调用量小一个量级。
7. **P2-4 封面缓存**：`ARCHIVE_CACHE_MAX_PER_ROOT` 4000 → 600。
8. **测试**：两条文本断言按新契约改写（不再要求 `focus` 监听；要求 `publishedStatsFingerprintOf` 存在），196 项保持全绿。

## 1.7.6：饼图分块口径换回「数量排名前五」

1. 规则（`stats.js`）：`const PIE_TOP_NAMED = 5; const PIE_MAX_SLICES = PIE_TOP_NAMED + 1;`，`mergePieSlices(list, otherLabel)` 只保留 `list.slice(0, PIE_TOP_NAMED)`，其余求和成一块 `{name: otherLabel, other: true}`；`list.length <= PIE_TOP_NAMED` 时不合并。
2. 删掉 `PIE_MIN_PERCENT`、`pieLabelsForCollections()`、`pieLabelsForYears()`（1.6.5 的 ≥3% 规则与两个带计数的标签）；调用点改成直接传 `t("其它收藏夹")` / `t("其它年份")`（`slicesOfDay` 与 `yearSlices`）。`yearSlices` 仍是「先按条数挑、再按时间摆回去」，`other` 那块排最后。
3. 词典：删 `其它收藏夹（不足 3%）`、`其它收藏夹（{count} 个）`、`其它年份（{count} 个）`，新增 `其它收藏夹`（zh-TW「其它收藏夾」/ en "Other collections"）→ 859 条；README.md 的 i18n 条数标记同步成 859（`release.ps1` 会拿它跟词典实数比）。
4. 教训：饼图分块规则是**用户可见的口径**，改规则要连着词典键与 README 的条数标记一起改 —— 少改一处，`release.ps1` 的 i18n 闸门就会拦下来（这次正是它拦的）。

## 1.7.5：列表重扫只由主动行为触发（挂在 bcaStats 上会变成放大环路）

1. 症状（真机）：收藏库每隔很小一段时间就整树重扫一遍视频资料，575 个记录时进度反复出现「正在读取 568/575…」，文件系统开销随记录数线性上升。
2. 根因：1.7.2 的自动刷新挂在 `chrome.storage.onChanged` 的 `changes.bcaStats` 上，而导入期间**每写一批快照都会写一次 bcaStats** → 每批都触发一次 `displayRoot()` 整树扫描（1.7.3 只是把节流从 900ms 拉到 4s、把提示静音，没有解决重复扫描本身）。
3. 修法：导入期间不再触发（`changes.bcaStats && !importIsRunning`）；导入**结束**由 `applyImportState()` 里 `wasRunning && !importIsRunning` 的分支统一收口刷一次；`visibilitychange`（切回标签页）不再重扫视频资料。删除 / 移动 / 重命名 / 「刷新」按钮 / 换根目录这些路径本来就自己调 `displayRoot`，保持不变。
4. 教训：**别把「有变化」当成「需要重算」**。storage 的变更事件在批量导入里是高频的，任何挂在它上面的读盘 / 重算都会变成放大环路；正确做法是挂在**语义终点**（导入结束）而不是中间态上。

## 1.7.4：导入期间的手动收藏要当场说清楚，不要干等

1. 1.7.3 给 `save-favorite` 加了 `busyImport` 拒绝，但用户复测仍看到「正在归档视频…」一直不消失 —— 因为拒绝发生在**后台收到请求之后**，内容脚本已经先把那条等待提示画出来了；而内容脚本的手动归档由 `waitForSuccessfulClose()`（content.js）里的 MutationObserver 在收藏弹窗关闭时触发，用户每点一次收藏就重画一次。
2. 修法：内容脚本在发 `save-favorite` 之前先发 `{ type: "bca-import-status" }` 问一句，`status.active` 为真就当场换成「导入进行中 / 目前正在导入收藏夹，归档未完成，请等收藏夹导入结束后再尝试保存。」并且**根本不发归档请求**；后台那道 `busyImport` 守卫保留，作为抢跑兜底。
3. 判据补上 `importState.running`（此前只有 `importRun.active || importPending > 0`）。它在 `publishImportState({ running: true })`（background.js）时置真、导入结束置假，启动时还会按 session 记录复位，不会留下长期为真的残影 —— 是三个判据里最耐得住 service worker 回收的一个。
4. 教训：**跨进程的「忙」判断要放在发起端**。只在被调用端拒绝，用户看到的仍是「我已经点了、界面在转」；发起端先问一句再决定要不要画那条等待提示，才谈得上「立即取消并给出提示」。

## 1.7.3：导入终态要出插件、导入期间不排收藏、自动刷新别刷屏

真机复测（1.7.2）三条反馈与修法：
1. 「导入结束后不显示已完成的弹窗，要点开插件才看到」→ `importDone` 只写 storage，用户关掉弹窗就没有终态。修法：后台在 `importDone` 写入处与 `reportImportFailure` 里各调一次 `notifyImportOutcome()`（`chrome.notifications.create`，图标 `icon-128.png`）。manifest 因此新增 `notifications` 权限 —— `test/stability.test.cjs` 的权限白名单同步加这一项，其余权限仍然一个不收；`notifyImportOutcome` 也会被测试的 `makeHarness` 一起 `grabFunction` 进去（它只用 `chrome.notifications`，stub 里没有就静默返回）。
2. 「导入进行中手动收藏会卡在『正在归档视频』」→ `save-favorite` 在 `runInSaveQueueWithDeadline` 里排队等，一直等满时限。用户要的是说清楚，不是等。修法：`importRun.active || importPending > 0` 时**立刻**回 `{ ok: false, busyImport: true }`，内容脚本按 `busyImport` 显示「导入进行中 / 目前正在导入收藏夹，归档未完成，请等收藏夹导入结束后再尝试保存。」（两本词典各加 2 条）。`withKeepAlive` 保留，用来兜住其它排队路径（添加视频 / 补存）。
3. 「收藏库每隔几秒就提示一次『已读取 N 个视频』」→ 1.7.2 加的 `scheduleArchiveRefresh()` 每次都走 `displayRoot` 的正常提示，而导入期间 `bcaStats` 一批批地写。修法：`displayRoot` 新增 `silentToast` 选项（自动刷新时静音，手动刷新照旧提示），`applyImportState` 记一个 `importIsRunning`，导入期间防抖从 900ms 放宽到 4 秒。

**教训**：「结果只写进 storage」不等于「用户看得到」。凡是可能跑几分钟、而用户会关掉界面的流程，终态都要有一条出插件的通道（系统通知 / 徽章 / 系统层面），这条以后写新流程时照做。

## 1.7.2：归档卡在「正在保存」＝ SW 被回收；收藏库不会自动刷新

**现象**（用户真机复测，1.7.1）：① 手动收藏卡在「正在归档视频…」，文件没落盘；② 导入显示成功、文件也落盘了（`辐射\…\视频信息.txt` + `封面.webp` 都在，导入报告写「读取 3 / 新导入 3 / 失败 0」），但收藏库页面看不到。

**根因**：
1. `save-favorite` / `add-manual-video` / `retry-pending-favorite` 都走 `runInSaveQueueWithDeadline()` 排队等，而**等待期间没有任何保活**。MV3 只认扩展 API 调用 / 事件重置空闲回收（background.js 的注释里就写着这一点），队列里那一个正在导入时能等几分钟 → SW 被回收 → `sendResponse` 永远不发 → 内容脚本的提示卡停在「正在归档视频…」，归档也没写。
2. 收藏库页面的 `chrome.storage.onChanged` 只订阅 `importState` / `downloadRevision` / `rootHandleRevision` / 语言；新记录落盘只改 `bcaStats`，页面不会重读根目录 → 「导入成功但看不到」。

**修法**：① 新增 `withKeepAlive(task, reason)`（按 `IMPORT_KEEPALIVE_INTERVAL_MS/2` 轮询已有的 `keepServiceWorkerAlive()`）并裹住三条排队路径；② 新增 `scheduleArchiveRefresh()`（900ms 防抖 + 只在页面可见、无弹窗、非批量选择 / 保存时 `displayRoot`），挂在 `changes.bcaStats` 与 `visibilitychange` 上。

**教训**：① 凡是「排队等 + 可能等很久」的路径都要一起保活，别只在导入循环里保活；② 页面订阅 storage 时要问「还有哪些写入会让这个页面该重读而它不知道」—— 这次漏的是 `bcaStats`；③ 定位这类真机问题的捷径是**直接看用户机器上的痕迹**：归档目录的 mtime 与文件清单、`001错误报告/*.txt`、`003database` 里的残留 `.tmp`，比反复问用户快得多（这次就是靠它们把「没落盘」和「落盘了但看不到」两件事分开的）。

## 4.1–4.2 期遗留的两条已知限制（都已解决，留作背景）

- **归档数据本身的完整度**（4.1 实测一个上千条的档案）：只有约两成有标签、约四成有简介，将近一半两者都没有。根因是导入流程里 `normalizeImportMedia()` 把 `tags` 硬编码为 `[]`，且只有失效视频会去抓资料。4.2 改成导入/更新时抓全。
- **一个已证实的数据错误**：某条归档里 `UP主UID` 写的不是该视频作者的真实 `mid`（抽查另外 4 条都对）。怀疑是收藏夹接口在个别条目上返回了错误的 `upper`；4.2 改从 `/x/web-interface/view` 取 UP 主信息后，执行一次更新即可修正。

---


## 1.7.1：`writeFile` 原子写撤回（真机回归，教训在前）

**现象**（用户真机，1.7.0）：手动收藏和导入视频都提示「正在归档视频… / B站已完成收藏，正在保存视频信息和封面。」，但本地收藏夹里最后没有记录。

**定位**：`git diff c6a2cbd e1dbd49` 里，归档链路（`addManualVideo`、`saveImportedItem`）只被改过一个函数 —— `background.js` 的 `writeFile`（1.7.0 改成「临时文件 + `temp.move(directory, name)` 覆盖」，非 `NotSupportedError`/`TypeError` 的错误原样抛出）。而两条链路都在 `writeFile` 抛错时执行 `removeEntry(record.name, { recursive: true })` 删掉整条记录，于是「更安全的写盘」直接变成「功能坏掉」。

**修法**：`writeFile` 完整退回 1.7.0 之前的就地写（不留临时文件）；`library.js` 的 `writeFileAtomically` 把「换名失败按错误类型分流」改成「一律退回就地写」（临时文件保留 + `lastResult` 写明这一点仍保留）。数据库那一侧的原子写不动。（1.7.16 更正：「页面里从 1.6.1 用到 1.6.5」不是 `move()` 可用的证据 —— `writeFileAtomically` 换名失败会静默退回就地写，成功失败都看不出来。真机探针见 `bili_vault_ref/move-probe.js` 与 `bili_vault_ref/move-probe2.js`。）验证台 `bili_vault_ref/_verify-170-p0.cjs` 的 T8 改成守「失败必须抛错、且不新增文件」（9/9 通过）。

**教训（下次别再犯）**：① 在 service worker 里用 FSA 的 `move()` 之前，必须先在真机上确认它存在、以及换名失败时抛什么错 —— 页面里的经验（`writeFileAtomically` 从 1.6.1 起就在用）不能直接搬到 SW。（**1.7.16 实测结论**：SW 里 `move()` 存在且能用、覆盖已存在文件也能用；真正的坑是兜底只认 `NotSupportedError`/`TypeError`，而真机上报的是 `NoModificationAllowedError`（目标被占用），于是它没退回就地写、直接把异常交给了「失败就删整条记录」的调用方。教训本身仍然成立 —— 但「怎么验」有了现成的探针。）② 改「写盘」这类基础函数前，先把**所有调用方在失败时的行为**列出来 —— 这次的调用方是「失败就把整条记录删掉」，后果被它放大成了「用户以为没收藏成功」；③ 一个「看起来更安全」的改造，只要让原本能成功的路径变成失败路径，就是净损失。

## 1.7.0：上线前审查的批次 A/B/C（两条 P0 + 数据面 P1 + 文档漂移）

上线前全项目审查（P0=2、P1=24、P2≈55、P3≈50，10 个分面的原文报告在开发机的 `bili_vault_ref/bili-vault-1.7.0-审查报告.md`）。用户批了批次 A/B/C，本版只做这三批。

1. **P0-1 读不到数据库时整份重写成空库**。`readStatsDatabase()`（background.js）在 `getFile().text()` 抛错时返回 `emptyDatabase()`，而 `writeStatsDatabase()` / `touchPetInDatabase()` 会在这份空库上追加本轮记录再整份写回 —— 历史统计与宠物亲密度无声归零。修法：读函数回报 `canWrite`/`reason`（`unreadable` / `empty` / `ok` / `corrupt` / `corrupt-unarchived`），两个写入口共用 `statsDatabaseWriteBlocked()` 守卫，读不可信就一个字节都不写，只把原因写进 `lastResult` 与角标。
2. **P0-2 不可恢复字段没有兜底**。`firstSeenAt` / `totals.savedTotal` / `pet.affinity` / `pet.totalTouch` 在 `chrome.storage.local.bcaStatsMirror` 留镜像（`syncStatsMirror` 只在真的变了才写），读失败时 `applyStatsMirror` 用 `Math.max` 顶回来。另外每次改写正文前 `archivePreviousStatsDatabase()` 把上一版原文写进 `database.bak.json`（**副本比正文早一版**：先写副本、成功后再重写正文，File System Access 没有 rename）。
3. **坏 JSON 且留档失败 = 也拒绝写**（`reason: "corrupt-unarchived"`）。1.5.1 只解决了「留档成功再重建」，留档失败那支还会整份重写 —— 等于把用户唯一一份坏文件也覆盖掉，事后无从恢复。
4. **批次 B（数据面 P1）**：`writeFileAtomically()`（library.js）用 `isMoveUnsupportedError()` 分清「本机没有 move()」与「这次换名失败」，后者不再退回就地写（会把正文截成半截）；临时文件写成功后不再无条件删除（它是最后一份完整副本，删了才是真丢），并把文件名写进 `lastResult`；`writeFile()`（background.js）同样处理 + 补 `lastResult`；删收藏夹的确认文案改成说清「删的是整个目录」；批量删除改走 `showResultDialog` 并列出失败明细；复制记录改成校验复制件与源逐字节一致后再删源；`rollbackImport()` 的四个 `catch (_) {}` 收集成 `failures[]` 并写进取消导入的终态文案；导入失败写 `lastResult.failed = true`，`popup.js` 的 `refreshStatus()` 据此强制展开「最近状态」（角标在弹窗打开时就被清掉，折叠卡片是唯一痕迹）；`stats.js` 两处：`monthText` 重复声明互相覆盖 + `new Date("YYYY-MM")` 按 UTC 解析（UTC 以西差一个月）、`bindResize` 丢第二个参数导致旧快照 resize 后主图空白。
5. **批次 C（一致性与文档漂移）**：彩蛋页入口先 `fetch(chrome.runtime.getURL("bili-old-2015/index.html"))` 探资源在不在包里，不在就给对话框（`pack.ps1` 排除该目录，真实安装包里点它只会开出「找不到文件」）；README / AI_HANDOFF / SMOKE_TEST 的漂移数字对齐实测（发行包 42 文件约 1.4 MB 解压后、词典 859 条、数据库纯函数 58 项、`retro.*` 早已删除）；`release.ps1` 新增「文档里的词典条数（`<!-- i18n-count:N -->`）必须和 `--check` 的实际条数一致」的闸门。
6. **教训**：`test/stability.test.cjs` 全是文本级断言，看不见「读失败 → 空库 → 整份重写」这类跨函数后果。对这一档后果（丢数据）值得写一个**内存假 FSA + 假 chrome 的验证台**：`bili_vault_ref/_verify-170-p0.cjs` 用 `vm` 装载 `stats-core.js` + `background.js`（去掉第 5 行的副作用 `import`），覆盖读失败拒写、镜像兜底、`database.bak.json` 轮转、留档失败拒写、原子写的失败路径，9/9 通过。真机上这些失败路径没法安全复现，所以这份验证台是这一版的主要证据。
7. **另一个坑**：`release.ps1` 是带 UTF-8 BOM 的 PowerShell 脚本，用 edit 工具改写会把 BOM 剥掉，PS 5.1 会按 GBK 解码整个文件（16 处语法错误）。改完必须确认 BOM 还在（`[System.IO.File]::ReadAllBytes(...)` 前 3 字节是 `EF BB BF`）。

## 1.6.5：首尾「整桶」的口径、饼图分块规则、图例滚动

1. **首尾整桶要标出来**（用户报「首尾两根柱子跟区间天数对不上」）：`weeklyRows` / `monthlyRows` / `yearlyRows` 各自算一个 `partial`（这一桶跨出了区间：周 `week < bounds.from || end > bounds.to`，月用 `key`/`end`，年用 `year + "-01-01" < bounds.from || year + "-12-31" > bounds.to`）。`drawChart` 给这类柱子加 `stats-bar-partial`（`.stats-bar-partial`：虚线描边 + `fill-opacity: .42`，和「今天」那种空心是两套样式），`renderChart` 在 `#statsChartBoundaryNote` 里按粒度写「首尾两根是整周 / 整月 / 整年，条数包含区间外的记录。」。**别试图去「修正」这个数字**：`dailyRows` 只有 180 天，区间内的逐日明细根本不在这一页手里，能给的就是「整桶 + 说明」。
2. **饼图分块**：`PIE_MAX_SLICES` 6 → 7、新增 `PIE_MIN_PERCENT = 3`，合并逻辑收进 `mergePieSlices(list, labels)`，`slicesOfDay` 与 `yearSlices` 共用。规则：占比 ≥3% 的各自一块、最多 7 块，其余并成一块；只剩一条小尾巴（`rest.length <= 1`）**不合并**（让它挂自己的名字，比塞进「其它」有用）；极端情况（每一块都不足 3%）留最大的 7 块、其余并掉。`labels.minor` 是「都因不足 3% 被并」的说法，`labels.many(n)` 是「被 7 块上限挤进来」的说法（图例上写「（11 个）」，用户一眼知道藏了几个）。**年份图先按条数挑、再按时间摆回去**（`yearSlices` 里那次 sort）—— 直接按时间挑会把后面的大年份错误地并进「其它年份」。
3. **占比取整**：新增 `withPercents(slices, total)`（最大余数法）把整数占比写到 `slice.percent`，`drawPieTo` 与 `legendInto` 各自开头调一次。**别再写 `Math.round(count / total * 100)`**：各自圆整会凑出 99% / 101%，用户会以为哪里算错了。
4. **图例**：`legendInto` 给每行加 `title` + `aria-label`（整句「名字：N 个视频，占 X%」，名字被 CSS 截断时也能看全），空名字回退到 `t("未归类收藏")`（以前摆一根横杠）；`stats.css` 的 `.stats-legend` 加 `max-height: min(38vh, 320px)` + `overflow-y: auto` + `overscroll-behavior: contain`。
5. **年份轴标签抽稀**：`drawChart` 非 dates 分支里，`labelMode === "years"` 时隔 `Math.max(1, Math.ceil(rows.length / CHART_LABEL_LIMIT))` 根标一个（第一根和最后一根一定标）；周 / 月照旧每根都标 —— 少一个标签就少一段。
6. **区间上限 1 年 → 10 年**：`stats-core.js` 的 `MAX_RANGE_DAYS` 365 → 3653；`stats.js` 的 `MAX_CUSTOM_DAYS` 改成 `numberOr(core && core.MAX_RANGE_DAYS, 3653)`（**定义挪到 `core` 之后**）；`rangeDayList` 的逐日上限从写死的 1000 改成 `MAX_CUSTOM_DAYS + 2` —— 写死会让「744 天」在日历提示里对、状态行里被算成 730 天（**同一个区间两个数**，用户第一眼就会看出来）。

## 1.6.4：上下两张图各管各的、年度饼图缺字段、返回设置别再关标签

1. **上下两张图联动**（用户报「点上面的年份柱，下面那年也跟着亮、下面饼图还被顶掉」）：1.6.3 里「每日新增收藏数」和「按年份累计」**共用** `focusedDay` / `focusedRow`。现在拆成两套 —— `focusedDay`/`focusedRow` 归上面那张图，`yearFocusDay`/`yearFocusRow` 归年份图；`drawChart` 新增 `isFocused` 选项（默认仍看 `focusedDay`，年份图传自己的进去），`toggleBar(key, row, target)` 与 `bindBarChart(element, lookupOf, target)` 都带 target，点空白只收**自己这张图**的选中；`renderYearPie` 改读 `yearFocusRow`。
2. **点年份柱子说「这一段时间还没有收藏」**：快照的 `yearly` 只有 `{year, count}`，没带 `byCollection`，饼图拿不到数据。`stats-core.js` 的 `yearlySeries` 现在带上 `byCollection`（与 `weeklySeries`/`monthlySeries` 一致，每个 entry 都会进桶，`未分类收藏` 兜底，所以「构成之和 = count」恒成立）。统计页另有兜底 `monthlyYearFallback()`：**老快照**（1.6.3 及以前写下的）用全量的 `monthly` 按年合出一份，用户不用重新导入就能看到那一年的构成。`test/stats-core.test.cjs` 三处 `deepEqual(yearly, [{year, count}])` 改成只比 `{year, count}` + 断言「byCollection 之和 = count」（避免把收藏夹名字写死在测试里）。
3. **「返回设置」把人送到别的标签**：`bindBack()` 原来先 `window.close()` —— 统计页是设置页用 `chrome.tabs.create` 打开的，**真的关得掉**，于是用户落到下面那个标签上，看着就像「按钮只是把页面关了」。现在去掉 `window.close()`，直接 `chrome.tabs.getCurrent` → `chrome.tabs.update(tab.id, {url: settings.html})`，拿不到当前标签时退回就地导航。和设置页「返回收藏库」（V1.4.1）是同一个坑。
4. **提示条配色**：`library.css` 的 `.import-running-notice` 换成危险色（`background: var(--danger-soft)`、`color: var(--danger)`、`border-color: var(--danger-line)`，连 `.import-hint-icon` 一起），`.is-paused` 保持琥珀色以示区分。这几个令牌的对比度本来就在 stability 的 PAIRS 表里（`--danger on --danger-soft` ≥ 4.5）。
5. **使用须知 7 → 6 条**：删掉「本插件不是 B 站官方工具……账号风险请自行评估」（用户要求）。连带改了：`library.html` 与 `popup.html` 各一条 `<li>`、两份词典的对应词条、README「4.4 使用须知」那条、`test/stability.test.cjs` 的「seven → six」测试（标题与断言 7 → 6）、本文件里三处「七条」。

## 1.6.3：粒度档位、年份柱的饼图、日历按年翻、气泡「先报数字再打招呼」

**1. 粒度档位由 `chartModeOf()` 一处决定，改档位只动它。** 判据从「>31 天按周 / >183 天按月」改成「**>30 天按周 / >90 天按月 / >365 天按年**」，多出「按年」一档（`yearlyRows(range)` 与 `weeklyRows` / `monthlyRows` 同构，`row.kind = "year"`，状态行写「按年份汇总」）。能这么改的前提是 `weekly` / `monthly` / `yearly` 三张表都由 `stats-core.js` **全量**带出（只有 `dailyRows` 受 `DAILY_ROWS_DAYS = 180` 限制）—— 换档位时先确认目标粒度的表在快照里是全量的，否则长区间会画出空图。

**2. 同一根柱子可以在两张图上，`focusedRow` 是共享的。** 「按年份累计」的柱子以前只影响年度卡里那张「所有年份合在一起」的饼图；用户要的是「点哪年看哪年」。做法：`renderYears()` 每行的 `by` 只带该年构成，点年度柱就照常把 `focusedRow` 落到 `yearRows` 那一行，`renderYearPie(rows)` 先看 `focusedRow.kind === "year"` 取那一行、再退回合表。**注意 `renderPie()` 的 `live` 判据必须同时认 `chartRows` 与 `yearRows`**，只认一张表会把另一张图上的焦点当成过期。

**3. 日历翻年 = 打断「视图跟随锚点」，不用动草稿。** `picker.paged` 为 `true` 时 `renderCalendar()` 不再按锚点重设视图，所以「`>>` / `<<`」只要 `picker.paged = true` + `clampCalendarView(addMonths(picker.view, ±12))`；`>>` 已经在本月时直接 `return`（不越界）。这与 1.6.2「回到今天」是同一套机制：**想动视图又不想动用户的选择，就显式关掉「视图=锚点」这层耦合。**

**4. 宠物的「两段式一轮」——修症状时别把不需要等的东西也推给后台。** 用户报「统计信息看不到了」，根因是 1.6.2 的修法把**所有**台词都塞进「等后台彩蛋回包」这一条路：回包总在几十毫秒后到，`force` 覆盖会把先挂上的 `queueBubble(统计句)` 顶掉，统计段于是永远没机会显示。现在 `onPetClick()` 按 `turn = runClicks + 1` 分三段：`turn <= 统计句数` → `showStatsLine()` **当场显示**（`awaitingReply = false`，后台这一下的回复只喂欢迎段）；有攒下的 `tempLine` 就放它；其余 `queueEgg()` 等后台（120ms 兜底用本地 `eggCursor`）。一轮总数 = 统计句数 + `TOUCH_LINE_COUNT`，整轮出完再点一下才收起（`runClicks >= runTotal`）。`refresh()` 与切语言按 `currentBubbleText()` 重画**当前这一条**（`shownEgg` 优先，否则 `shownIndex`）。

**5. 饼图文案分粒度**：天「这一天」、周/月「这几天」、年「2025年：新增 N 个视频」+ 空态「这段时间」（复用已有键，没新增）。这版词典新增 3 条（按年汇总那句等）。

**教训**：「先显示 A、再被 B 覆盖」的时序问题，先问一句 **B 真的需要先到吗**。统计句是本地快照当场就能算，彩蛋句才是必须等后台的跨端轮播号 —— 1.6.2 把两类数据混在一条等待路径上，于是修好了「哪一句」，弄坏了「哪几句先」。

## 1.6.2：五个根因（闭包抓空表、文字旋转、180 天窗口、草稿被重置、气泡两份指针）

**1. 绑定一次 + 持有可变状态 → 必须传取值函数，不能传值。** `stats.js` 里 `chartRows` / `yearRows` 在 `renderChart` / `renderYears` 每次渲染都是**整体重赋值**（`chartRows = new Map(rows.map(...))`），而 `bindChart()` 只在 `init()` 里跑一次，把**当时那个空 Map 对象**传进了 `bindBarChart(element, lookup)`。闭包抓的是对象，不是变量：`chartRows.size` 从模块变量读是 7，`lookup.get(key)` 却恒为 `undefined`。症状极隐蔽 —— 柱子点得到、也会高亮（高亮读的是模块变量 `focusedDay`），饼图的 `renderPie()` 却永远拿不到行数据而早退（顺手把 `focusedDay` 清掉，于是连高亮也会残留）。修法：`bindBarChart(el, () => chartRows)`，内部 `lookupOf().get(key)`；也可以原地 `clear() + set()`，但传函数更稳。凡是「只绑一次 + 稍后换对象」的地方都该这样写。

**2. 长文字旋转不能用「字数 × 每字宽」估。** 周标签是 `1月6日星期一 - 1月12日星期日`（20+ 字、真实宽度 200px 上下，格子只有 ~90px），旧代码用 `String(label).length * 11` 估宽、再绕 `baseline+4` 旋转 -34°，估算与真实差一倍以上：标签照旧重叠，右端还被 SVG 视口裁掉。现在轴标签分两层：`row.short`（`1/6–12`、`1/26–2/1`、`2026年1月`）给眼睛，`row.label` 全称留在 `aria-label` 与 `<title>` 里给读屏和悬停；倾角用 `getComputedTextLength()` 量真实宽度，取「不重叠所需的 `acos((slot-6)/width)`」与「不超过竖直空间上限的 `asin(room/width)`」里的小者，夹在 14°~58°，锚点改 `text-anchor:end` 并绕**文字自身的锚点**旋转（旧代码转轴在文字上方 10px，长文字会被甩出视口）。`ROLLUP_PAD.bottom` 44 → 72、`CHART_ROLLUP_HEIGHT` 236 → 266 是给倾角留的空间。

**3. `countInRange()` 只看得到最近 180 天。** `dailyRows` 只带最近 180 天（`stats-core.js` 的 `DAILY_ROWS_DAYS`），而 `weekly` / `monthly` 是全量的。长区间的「共新增 N 个视频」如果拿 `countInRange()` 求和，区间落在 180 天以外时恒为 0 —— 柱子（来自全量聚合）有数、总数是 0，看起来像聚合没累加。修法：聚合模式下总数 = **画出来的桶的合计**（`renderChart()` 里的 `total`），另抽 `rangeTotal(range)` 给总览卡「区间内新增」共用，保证卡片与状态行永远一致。

**4. `picker.paged = false` 会让日历窗口每次重画都回到锚点。** `renderCalendar()` 开头 `if (!picker.paged) picker.view = calendarView()`，而 `pickerAnchor()` 优先取 `draftFrom`。「回到今天」以前写成 `draftFrom = draftTo = 今天`，其实是在借「锚点=今天」把窗口挪回今天 —— 代价是把用户选的起止清掉了。现在保留草稿，只 `picker.paged = true` 并把视图设成今天所在月（经 `clampCalendarView`）。**想让视图动、又不想动用户的选择，就得显式打断「视图跟随选择」这层耦合。**

**5. 宠物气泡有两份「第几句」的指针。** 后台回包的 `index`（`stats-core.js` 的 `touchPet()` 按 `affinity + totalTouch` 轮换）是权威轮播位，而气泡自己的 `lineIndex` 只在 `hideBubble()` 里归零；与此同时摸头会写库 → `chrome.storage.onChanged` → `refresh()` 把「已陪伴你 N 天」重新画一次。三件事叠起来：连点时后一句被刷新盖掉（看着像「点第二下没反应」），`refresh()` 还会把指针拉回轮播第一位。现在 `showBubbleLine(index, { egg })` 是唯一入口，另有 `shownIndex` / `shownEgg` 记住「当前显示的是哪一条」，`refresh()` 与切换语言时按记录重画；彩蛋回包用 `force` 覆盖而不推进轮播，且加了一条「与上一句相同就换下一句」的兜底。**`SMOKE_TEST.md:56` 的契约必须保留：连点第 5 下收起** —— 所以「显示过几句」另外用 `runClicks` 计数，5 秒自动收起后归零，不再拿 `lineIndex` 当这个计数器。`stats-core.js` 里 `index` 之所以只落 0/2，是因为 `min(9999, affinity+1)` 与 `totalTouch += 1` 一次加 2，改成按 `totalTouch % PET_LINE_COUNT` 取，一次一跳。

**这版同一个教训**：前三条都是「文本级断言看不见」的类型（闭包捕获、真实文字宽度、180 天窗口），自动化全绿但真机就是不对 —— 统计页一定要按「点柱子 / 拉长区间 / 看标签有没有被裁」这条真机路径走一遍（`SMOKE_TEST.md` 的 V1.6.2 小节）。

## 1.6.1：统计页的粒度规则与「数据库凭空消失」的根因

**粒度**：`stats.js` 的 `chartModeOf()` 按区间长度选柱状图粒度 —— ≤31 天逐日、>31 天按自然周、>183 天按自然月。周一律从周一开始（`stats-core.js` 的 `weekStartOf / weekKeyOf / weeklySeries`，用日历算术而不是 `time - n * DAY_MS`，避免夏令时落到前一天 23:00）；月聚合走 `stats-core.js` 的 `monthlySeries()`（**全量**，不受 `dailyRows` 只有 180 天的限制）。

**快照新增字段**：`weekly` / `monthly` / `earliest`（最早收藏日，空库为 null）。5000 条 / 20 收藏夹的库：快照 16.5 KB → 28.3 KB；`test/stats-core.test.cjs` 里 `< 80KB` 的断言仍成立，另加了两道更紧的上限（月汇总单独 2.3 KB）。

**自定义区间**：下界 = `snapshot().earliest`，上界 = 今天；日历对界外日期 `disabled + aria-disabled`，`pickDay` 直接拒绝、`applyCustom` 再夹一次，翻页也被 `clampCalendarView` 限制在「最早那个月 ~ 本月」。`rangeFor` 的 730 天上限没动。

**三条可复用的教训**（都是这次真机上踩出来的）：

1. **替换文件绝不允许「先删后换名」**：`FileSystemFileHandle.move()` 的参数是「目标目录 + 新文件名」，传文件句柄必抛；而老的 `writeFileAtomically()` 恰恰是先 `removeEntry(file.name)` 再 `temp.move(file)` —— 一抛，原文件没了、临时文件又被 catch 清掉，数据库就凭空消失，用户看到的是「统计回到初始状态」加「已陪伴你 1 天」。正确写法是先按规范换名、失败再退回就地写，任一步失败原文件都还在。
2. **空扫描不是「库里没有东西」的证据**：重建型同步（拿扫描结果整份重写数据库）必须能区分「这一次扫到 0 条」与「库里确实为空」。`syncStatsDatabase()` 现在在「扫描 0 条 + 旧库里还有记录」时直接跳过写入。
3. **别把中文塞进占位符**：`t("星期{name}", { name: "一" })` 这种写法翻译不出来（英文里会漏汉字）。要么一条条写成 `t("星期一")` 字面量（抽取器才看得见），要么用能本地化的枚举。

4. **扩展页不许用内联 `<script>`**：MV3 默认 CSP 就是 `script-src 'self'`，`manifest.json` 里没有 `content_security_policy` 键也一样。彩蛋页 `bili-old-2015/index.html` 的两段内联脚本（全站跳转路由器、对话框）在真机 `chrome-extension://` 下**从未执行过** —— 症状是「按钮点得到、事件也到了按钮上，但没有任何处理器响应」，而同一个文件用 `file://` 打开一切正常（这是最容易骗过自动化验证的地方：上一轮 8 个场景全绿，跑的全是 `file://`）。所有页面脚本必须走 `<script src="…">`；`bili-old-2015/tools/build.js` 现在同时产出内联副本（给 `file://`）与外链 `egg-2015.js`（给扩展环境），`tools/verify.js` 断言两者逐字一致。
5. **两条真机事实**（这次实测出来的）：**只有扩展自己的 service worker 能打开 `chrome-extension://` 页面** —— 从别的扩展调 `chrome.tabs.create` 会被 `ERR_BLOCKED_BY_CLIENT` 拒，CDP 的 `Page.navigate` / `Target.createTarget` 一律落成 chrome-error，想验扩展页必须让该扩展自己的 SW 去开；以及**改过的扩展文件会重新读盘**，不用点「重新加载」，刷新页面就生效。

## 1.6.0：上线前审查的修复批次与统计口径

用户下的口径是「距离正式上线已经很近了，再仔细审查一下整个项目」+「审查完先发我审阅，我指示后你再改」。四份只读审查（宠物 / 外观 / 核心 / 怀旧页）产出 `bili-vault-1.6.0-审查清单.md`，用户圈了第一批 + 第二批后开工。

### 修掉的（按文件）

- **`library.js`**：删除路径里的裸标识符（漏 `BcaArchiveCore.` 前缀，删收藏夹+勾选清下载时必抛）；空库不再跳过落盘；数据库改写走 `writeFileAtomically`（临时文件 → `removeEntry` → `move`，`move` 不可用退回就地写）。
- **`background.js`**：两处裸 `fetch` 改为 `biliImportApiGet`（view 15s / tag 10s）；硬编码并发 3 → `IMPORT_DETAIL_CONCURRENCY`；`importPending` 自愈（`settlePending` 只在「这一轮仍是队尾」时清账）；坏库留档 `database.bad.json`。
- **`theme.js` / `theme.css` / `library.css`**：`guide.html` / `tutorial.html` 补引 `theme.js`（并给两页 `<html>` 加 `data-wallpaper-scope="popup"`，否则纸面规则会突然生效）；毛玻璃用新令牌槽 `--bca-card-state-shadow` 让位，卡片状态改写同特异性选择器；外观变化不再无条件重载背景图；`teardown()` + bitmap 出口回收 + storage 全部套 try。
- **`pet.js` / `settings.*` / `stats.*`**：设置页开关改成整份合并写（`set({ interfacePet: next })`）；宠物气泡四句数据源换 `firstSeen` / `totals`。
- **`pack.ps1`**：排除 `bili-old-2015` 与 `_ref`（发行包 672 文件 / 39 MB → **42 文件 / 约 1.4 MB**，解压后大小；准确值以 `pack.ps1` 的实际输出为准）。
- **`test/stability.test.cjs`**：`stripComments` 由正则改为逐字符状态机（之前字符串里的 `/*` 与 `*/` 会把 `background.js` 九行整段吃掉，剥离后的断言对该区域全部失明）；页面清单扩到覆盖 `pet.css` / `stats.css` / `theme.js` / `pet.js` / `stats.js`；`[hidden]` 守卫收紧为只认独立成条的全局重定义；裸 `fetch` 白名单收成 `["biliImportApiGet", "loadCoverPng"]`；把「宠物开关要落盘」那条断言从钉死旧写法（等于测试在保护 bug）改成断言整份合并写 + 反向断言旧写法不许回来。

### 统计口径三条铁律

1. **时间轴只有「视频收藏时间」** —— 写入时从 `视频信息.txt` 解析，解析不出不猜；**不许**退回导入时间。
2. **陪伴天数 = 插件首次启用**（`database.firstSeenAt`），不是最早一条收藏。
3. **累计 = 单调计数器**（`database.totals.savedTotal`，每次成功写盘 +1，`Math.max` 只增不减）—— 因为数据库是「从收藏库扫描整份重建」，任何从明细派生的「累计」都只是「当前」。

### stats-core.js API 速查（1.6.0）

`rangeFor(preset, now, custom)` → `{preset, from, to, days, label}`（本地日边界、两端含；custom 夹 ≤730 天）；`seriesInRange` / `totalInRange` / `collectionBreakdown` / `yearlySeries`；`snapshot()` 里 `dailyRows`（最近 180 天，`{day, count, byCollection}`，缺天补 0）+ `yearly` + `firstSeen` + `totals`。日历推进必须用日历构造，不能用 `now - N*86400000`（半小时偏移时区会漂）。

### 教训

- **测试也会保护 bug**：断言写的是「源码里有这句」时，它同时锁死了错误的实现。改行为时优先改成正向语义断言 + 反向断言。
- **发行包排除名单要跟着目录长**：新增一个大目录而不更新 `pack.ps1`，发行包会悄悄胖 78 倍。
- **样式被压掉往往不是顺序问题而是特异性**：`:is(...)` 会把权重抬到 (0,2,1)，靠源码顺序取胜全线落败。
- **一句话门槛**：`test/i18n-extract.cjs` 在没有词典文件时 exit 0，而 `release.ps1` 只看输出里有没有「缺 N」—— 两边一起才能构成门禁。

## 1.5.9：彩蛋页换成作者复刻的那一份

- 入口：`library.js` 里 `#retroEntry` 的点击 → `chrome.tabs.create({ url: chrome.runtime.getURL("bili-old-2015/index.html") })`。开在新标签是为了不盖掉用户当前的收藏库，与设置齿轮同一做法；扩展自有页面**不需要 web_accessible_resources**。
- 我上一版自制的 `retro.html` / `retro.css` / `retro.js` 已删除。README 里 V1.5.6 / V1.5.7 两节是历史记录，按规矩没动。
- 对话框在 `bili-old-2015/index.html` 里，自包含（内联 style + script，零外部资源、零网络请求、零新权限、无动画、无 `!important`）：两段文案 = 恭喜问候 + 免责声明。
- **踩过的坑（务必记住）**：那份页面有一个 **window 捕获阶段的 catch-all 链接处理器** —— 点页面上任何元素都会被当成跳转，真的打开 B 站新标签。所以弹层必须在**捕获阶段** `stopPropagation`，并用 `event.target.closest("#eggDialogOverlay")` 判定只拦弹层自身的点击；否则点「知道啦」、点遮罩、按 Esc 都会顺手多开一个标签。我们的验收里有 4 条「关闭动作没有多开标签」断言钉着这件事。
- **有边界的例外**（用户查证后拍板，写在这里以免被当成通用许可）：只复刻 2015 年那一版首页、素材来自互联网档案馆的公开快照、唯一交互是跳回现在的 B 站主页、不作为项目宣传也不商用、仅作怀旧与欣赏 —— 因此不构成严重侵权。**这条只适用于这一个彩蛋页**；不要据此把官方素材用到别处（下载功能那套红线依旧：`bilivideo|akamaized` 永不加回）。

## 1.5.8：怀旧页停机（retro.* 当时保留在仓库里）

- 当时的状态：`library.js` 里 `#retroEntry` 的点击处理是 `chrome.tabs.create({ url: "https://www.bilibili.com" })`。`retro.html` / `retro.css` / `retro.js` 三个文件**保留但没有任何入口**（全仓提到 `retro.html` 的地方只剩注释）。**这三个文件在 1.5.9 里已经删掉**，下面两条只描述 1.5.8 当时的状态。
- 重新启用**不是**把那一行改回 `chrome.runtime.getURL("retro.html")` —— 那三个文件已在 1.5.9 删掉，照抄只会得到一个打不开的页面。现在真正在跑的怀旧入口是自包含的 `bili-old-2015/index.html`（`library.js` 里 `retroEntryButton` 的点击处理打开的就是它）。1.5.8 当时那三个文件也是离线自包含的（零外部资源、DOM 里只有一处 http(s) 字面量），不需要配套改动。
- 保留原因是用户明确要求「暂时留在项目里不要清理」。停机依据：自制怀旧页验收效果一般 —— 版式数值是按归档 CSS 量的，但头版那块小图网格在归档里是 IndexNavigator 现场生成的、快照只存到空容器，行列分法只能反推，首屏留下一块留白。
- 教训：**归档里量不到依据的那一段，不要靠反推硬凑** —— 要么找到当年的渲染图，要么就别做那一块。

## 1.5.6：活动角标与怀旧彩蛋页

**角标怎么挂的**：没有在每条收尾里逐个埋点，而是在 `importBiliFavorites` / `refreshVideoStatus` / `diffBiliFavorites` 三个活动函数外面**套薄包装**（开始清、返回后判色、抛错判红）。两个理由：① 内层函数的收尾阶段自身还会抛（回滚、写错误报告、写 storage），逐条挂必漏；② 测试沙箱（`test/stability.test.cjs` 里那段）只注入 sender / chrome / logError，并且自带同名桩函数，在内层引用任何新全局标识符都会直接把它挂掉 —— 包装层在沙箱里被桩替换，绝对安全。

**两条不能忘的细节**：① `paintActivityBadge` 先写底色再写文字、`clearActivityBadge` 先清文字再复位底色，方向相反，避免出现「旧底色 + 新文字」的中间态；② **不要在模块顶层或 SW 启动时清角标** —— MV3 的 service worker 会被空闲回收并在导入进行中重启，那样会把用户还没看到的结果清掉。

**彩蛋页的边界**：自包含（不引任何外部 URL / 字体 / 图片，不发 fetch，无远程代码），**不使用 B 站的图片素材**（版式与配色参照公开快照自绘），跳转一律用 `window.location.href` 去真站。入口那行小字在 `library.html` 分页器下方居中，带 `data-i18n`，**元素文字与词典键必须逐字相同（含空格）** —— 项目有「data-i18n 与元素文字逐字一致」的测试，差一个空格就红。

## 1.5.5：宠物坐姿（别用变形假装换姿势）与两条 CSS 陷阱

**为什么改**：用户的反馈只有一句「猫坐下时还是只有这个被压缩的一帧」。查下来是三条独立缺陷相乘：① `pet.css` 里 `.is-sit-down` 上挂着一条**常驻** transform（不是动画，压下去就不回来了）；② 「坐姿」那个 state 的 `background-position` 指的就是待机那一格，所以保持相位画的是同一张图；③ `pet.js` 里 `.is-sit-down` 只在下坐时挂上、只在站起来时摘掉，把整段「保持」和「睡觉」都盖住了。

**怎么改**：坐姿用精灵图里真实的坐姿帧（行 4 那组，`background-position: 0% 75%` + `steps(1, end)` 四格各 400ms），坐下/站起来只保留 ≤2% 的过渡包络且末帧显式 `transform: none`。**不要再用变形假装换姿势** —— 精灵图里有现成的姿势就别硬凑。

**陷阱一：裸 `var(--ease)` 会让整条 animation 失效。** `--ease` 只在 `theme.css` 里定义，而宠物是挂在任意宿主页的；没有兜底时 CSS 变量的「无效」会在计算值阶段传播，`animation-name` 直接塌成 `none`、时长变 0 —— 表现是「代码明明写了动画却完全不动」。V1.5.4 因此有四处动画在收藏库以外的页面从来没跑过（其中三处是旧代码，本次只报告未修）。**写 `var()` 一律给兜底。**

**陷阱二：`:where()` 救不了权重。** 想靠源码顺序用 `.bca-pet:where(.is-x)` 压过 `.bca-pet[data-...] .bca-pet-sprite` 是不成立的（(0,2,0) 对 (0,3,0)），实测症状是「类挂上了但计算值没变」。老老实实写同权重的选择器再靠顺序取胜。

**陷阱三：`animation: none` 一刀切会误伤。** 「减少动态效果」那段原本把 `.is-sit-down` 的动画一并关掉，可这个类从坐下挂到站起来，顺手把睡觉的换帧也压掉了（实测睡觉冻在一格 60 秒）。正确做法是**在 media query 内重定义关键帧**，只让过渡退化成静止，保留换帧。

**验证口径（可复用）**：逐相位打印 `getComputedStyle` 的 `transform` 与 `background-position`，并**逐格统计非透明像素**确认没有任何帧落在空格子上（历史上就因落到空帧出现过「拖动时宠物消失」）。

## 1.5.4：宠物状态机重排（去掉走路）与两个 bug 的根因

**状态表**（顺序写死，权重轮盘与行走逻辑整段删除；同时写在 `pet.js` 文件头）：

| 状态 | 时长（实测） | 用哪一格 | 过渡 |
|---|---|---|---|
| 待机 idle（内含 1–3 次眨眼） | 4–8s | row0 col0 | — |
| 眨眼 blink | 140 + 40ms | row0 col1 | `bca-pet-blink` steps(1,end) 一次 |
| 坐下 sitDown | 360ms（实测 334–425） | row0 col0 | transform → `translateY(2px) scale(1.03,.94)` |
| 保持 hold | 4–8s | row0 col0 | 维持压扁 |
| 睡觉 sleep | 10–30s（实测 11000/12166/15749/26082） | row4 col0–col3 | `bca-pet-sleep` 2400ms steps(1,end) |
| 站起来 standUp | 360ms（实测 344–420） | row0 col0 | 同一段过渡反向播 |

点睡着的猫 → 站起 → 待机 → 眨眼；`sleepReadyAt` 给 8–15 秒不应期，避免刚醒又睡。

**根因一：气泡不自动消失。** 老 `pet.js` 全文**没有任何自动收起计时器**；唯一能收起的路径是 `advanceBubble()` 里 `lineIndex >= lines.length` 那条，必须点满五句；另一条 `onDocumentClick()→hideBubble()` 被 `onPetClick()` 开头的 `stopPropagation()` 挡住。修法：`BUBBLE_MS = 5000` + `armBubbleTimer()`（`showBubble()` 末尾武装、每次点击重新武装、`onPointerDown` 清、松手重武装），`hideBubble()` 第一行清计时器。**连带 bug**：`hideBubble()` 没把 `lineIndex` 归零 → 自动收起后再点一下会立刻命中最上面那条规则（点一下就没），一并修掉。

**根因二：拖不到上方。** `warpRange()` 只算向下空间 `yMax = max(0, bottom − EDGE_PAD)`：dock 的 `bottom` 是 52px、`EDGE_PAD` 8 → **44px**；它也算了一个 `yMin`（向上空间）却**从未被任何代码读取**（死变量）。`onPointerMove()` 写的是 `petY = clamp(dragOriginY + dy, 0, range.yMax)` —— 往上拖 `dy < 0` 被下界 0 夹回，纵向总行程只有 44px。修法：`yMin = −(vh − EDGE_PAD − petSize − bottom)`（144px 档 + 955px 视口 = −751），区间 [−751, +44]，`renderedPx()` / `onPointerMove()` / `toPx()` 统一使用，比例改双段映射（`petYPct > 0` 往上 × `yMin`、`< 0` 往下 × `yMax`、0 = 停靠位），`persistPosition()` 用 `yToPct()` 反写。**行为变化**：纵向正负号含义是「正 = 往上」，旧版本拖到过底边存下的 `y > 0` 升级后会按比例放到上方，右键「重置位置」可复位。

**教训**：
1. **算出来的边界必须真的被用上。** 死变量 `yMin` 让「只能在一个方向动」这种 bug 藏了整整一个版本。凡是「只能往一边拖」的现象，先看 clamp 的上下界与「算出来没被用」的边界。
2. **AI 生成的精灵表里，「6 帧走路」很可能是一个姿势复制了 6 份。** 判定方法：逐帧做阈值差异（`max|Δchannel| > 32`）并看**差异落在哪里** —— 如果红色全部落在轮廓上，那是抗锯齿噪声，不是肢体位移。只有「6 个格子都有画」是不够的。
3. **美术里没有的过渡帧不要伪造。** 这张表没有「坐下/站起来」的中间帧，于是坐下与站起用同一段 CSS transform 正放/倒放表达；硬画中间帧会撞上「两种线宽混在一起」，比不做更难看。
4. **隐藏依赖**：气泡的「点满才收起」与「页面点击收起」互相冲突（`stopPropagation` 让后者永远不生效），单看任一处都像正常代码。

## 1.5.3：宠物状态机重做，与五个根因

**状态表**（同时写在 `pet.js` 文件头，改行为前先读它）：

| 状态 | 权重 | 最短/停留 | 用哪几帧 | 移动 |
|---|---|---|---|---|
| sit（含眨眼） | 46 | 决策 4–8s，最短 3s | row0 第 1 格；眨眼单独走一次闭眼 | 不动 |
| sitAlt | 14 | 4–8s | row0 其它坐姿格 | 不动 |
| walkRight / walkLeft | 34（暂停时 0） | 4–8s | row1 / row2 六帧循环 | 每帧 8px、周期 48px、巡航 80px/s，撞边回头停 >1620ms |
| sleep | 6 | 10–18s | row4 四帧 | 不动 |
| drag | 一等状态（按下即进） | — | row0 第 1 格 | 跟手 1:1 |

调度用**权重轮盘 + 不应期门控**，拖动作一等等状态。参照 Shimeji-ee 的 `conf/behaviors.xml`（Frequency 权重 + Condition 门控 + 必须存在的 Dragged/Thrown + Walk*AndSit 成对出现），**只借形态、未抄代码与素材**。

**五个根因（全部真机确认）**：

1. **坐姿指向空帧**：6 列图的 `background-position` 百分比步长是 `100/(cols-1) = 20%`，旧代码按 4 列图写成 80% → 落在 row3 第 5 格（那一行只有 4 帧，后面两格全透明）。坐姿是拖动/暂停/所有动作的落点，所以「一坐就消失」。**教训：百分比步长必须由 sheet 的实际列数算出来，并且永远不要指向没有画的格子。**
2. **行走动画与列数不匹配**：行走关键帧也按 4 列公式（12.5% 一档），在 6 列图上每帧停在两格之间（半只猫 + 半只猫）；位移走 CSS transition、与帧无关；另有一个系数写错让速度达到 768px/s（设计 80）。**修法：删掉关键帧，rAF 循环用「走过的距离 → 帧号」写行内 `background-position`，位移与换帧共用同一个变量。**
3. **状态停留没有下限**：sit 2.6–5.2s / walk 1.6–3.6s 都偏低且 `PAUSE_MIN/MAX` 是死代码，叠加空帧后就是「凭空出现」。**下限：坐/走 4–8s、睡觉 10–18s，行走加 600ms 坡道。**
4. **暂停即消失 + 菜单自弹**：前者同 1；后者是 `renderMenu()` 结尾无条件 `menu.hidden = false`，而 `onStorageChanged` 每次写盘都会调它。改成 `renderMenu(show)`，只在明确需要时展开。
5. **眨眼连眨两次**：旧关键帧 0→80→87.5%(闭)→92.5→96.5%(闭)→100，1.5 秒内两次闭眼。改成 0→40%(唯一闭眼)→100，180ms + 3–7s 不应期。

**另修的既有 bug**：`settings.js` 定义了 `writePetConfig` 却三处调用 `patchPetConfig`（未定义）→ 设置页宠物开关/尺寸档/重置位置一点就 ReferenceError，全写不进（「大小/位置刷新不保持」的真正成因）。**函数改名要全仓搜一遍调用点。**

**实测口径（可复用的验收方法）**：拖动连续采样可见性与坐标（1:1，最大偏差 0.00px）；行走采样「位移/换帧」得每帧中位 7.93px（设计 8.00）、周期 47.6px（设计 48）、巡航 81px/s；240 秒 2514 帧时序日志检查最短停留、不可见帧数（0/2514）、越界帧数（0/2514）、非行走相邻帧位移（0.000px）；眨眼用 Web Animations 每 5ms 寻址 29 点，断言**闭眼段数 = 1**。

## 1.5.2：像素画素材的正确管线（踩过的坑）

**症状**：宠物换成位图精灵后「糊、嘴巴细节丢失」。

**两个原因，都不在素材上**：

1. **`image-rendering: pixelated` 只能用于整数倍放大，不能用于缩小。** 旧管线把 222 源像素的格子塞进 48 CSS px 的盒子（0.43×）还开着 pixelated —— 浏览器按最近邻挑像素，等于随机丢弃源像素，1–2 像素宽的特征（嘴、描边）必然消失。**规则：缩小交给构建期重采样，运行时只做整数倍放大。**
2. **调色板量化会吃掉细线。** 64 色 PNG-8 把嘴和描边与邻近色并到一起。逻辑分辨率下体积本来就小，**不需要量化**。

**正确管线**（现 `pet-cat.png`）：构建期把每帧按 222→48（s = 0.21622）重采样到**逻辑分辨率 48×48**、保留 **RGBA 8bit colorType=6**（alpha 256 级、零量化），拼成 6 列 × 5 行网格（288×240，97 KB）；运行时 `background-size: 600% 500%` + `background-position` 百分比 + `steps(1, end)` 逐帧，尺寸档一律取逻辑分辨率的整数倍（96/144/192/240）。

**一处对需求书的有意偏离（已实测）**：降采样**用 LANCZOS 而不是 NEAREST**。4.625:1 这个尺度下 NEAREST 会直接丢像素（嘴照样碎）；过滤式降采样把细节平均进逻辑像素，再整数倍放大，嘴和鼻才留得住。**AI 生成的「像素画」其实是被放大的位图，不是真像素画** —— 先降回逻辑分辨率，再整数倍放大，是这类素材的唯一正解。

**状态机与交互**（pet.js 现在 1000 行）：待机在 眨眼 / 左走 / 右走 / 坐下 / 睡觉 之间随机（眨眼权重最高），走路真的改位置并在视口边界停下或换向，拖动与点击用位移阈值区分（≤3px 算点击、≥6px 算拖动），位置与大小持久化在 `chrome.storage.local.interfacePet`（`{ enabled, size, x, y }`，向后兼容旧的 `{ enabled }`；`y` 用 null 哨兵表示「跟随停靠位」）。右键菜单是自绘的，**不用 `chrome.contextMenus`**（那要新权限）。

**真机才暴露的四个 bug**（静态检查完全看不出来，值得记住）：纵向夹取把停靠偏移算了两遍；拖动方向符号写反（往左拖往右跑）；`persistPosition()` 用 `petY` 反算比例，导致三处拖动只改了画面、刷新不回位；重置位置时 `persistPosition()` 把 `y` 的 null 哨兵抹成 0。**涉及「运行时状态 + 持久化 + 夹取」的代码，必须真机跑时序。**

## 1.5.1：宠物挂件的美术来源与改色管线

**素材来源（先说权利，再说做法）**：形象是**用户自己用 AI 生成的像素猫精灵表**，我们从两张候选里挑了一张，自己做的只有「改色」与「切图」。没有复用任何第三方素材、代码或美术文件——原先参考过的两个仓库都不能用：`MeteorNOX/DeepSeek-Balance-Whale-Widget` 的 `assets/**` 明确不在 MIT 覆盖范围内（PROVENANCE.md 写明「不授予再许可」），`Star-Pie/StarPie-DesktopPet-Assets` 连 LICENSE 都没有（GitHub 无许可证即保留所有权利），其关联仓库的《版权.md》还把同款小鲸素材标成 CC BY-NC 4.0（禁止商用）。所以最终形态的选择标准是「权利链干净 + 48px 下认得出」，不是「好不好看」。

**改色管线**（用户给两张色标：蓝 `#7DA7C9`、粉 `#FFC3CC`）：在 HSV 空间只替换**色相**、按目标**饱和度**等比缩放，**明度一个像素不动**——这样原图每一处的明暗层次（腿、尾巴、耳内阴影）完整保留，颜色却又落在指定色标上。只作用于两个波段：蓝色像素（色相 185–265°）与粉色像素（色相 315–360°/0–25°）；白肚皮与绿眼睛不在波段内，天然不动。**不要改成整图调色或简单替换纯色**，那会把渐变与阴影拍平。

**切图**：先按空行带切出 5 行、按空列带切出每行帧（4 / 6 / 6 / 4 / 4 = 24 帧），再补成**统一方形的单元格**（222×222，原帧 218×207）拼成 6 列 × 5 行网格，最后 `quantize(colors=64, method=Image.FASTOCTREE)` 存 PNG-8 —— 1.53 MB → 170 KB。**格子必须是方的**，否则 48×48 的盒子里会有非等比拉伸（222×211 → 纵向拉伸 5.2%）。

**CSS 只负责「露哪一格」**：`.bca-pet-sprite` 用 `background-image: url("pet-cat.png")`、`background-size: 600% 500%`（列数×100% / 行数×100%）、`image-rendering: pixelated`，格子 (c, r) 的坐标是 `x = c/(cols-1)*100%`、`y = r/(rows-1)*100%`；待机用 `@keyframes bca-pet-idle` 走 row0 的 4 格 + `steps(1, end)` 逐帧。**只接了 row0**（坐姿），row1/row2（行走）与 row4（睡觉）留在图里没接。

**修改原则补充**：换成位图素材时，必须把「色板 + 网格几何 + 每行是什么姿态」一并写进注释或文档，否则下一个人看着一张 1332×1110 的图完全无从下手。

**顺带修掉的既有 bug**：`filter: drop-shadow(var(--shadow-md))` 是无效声明——`--shadow-md` 是两条阴影的列表，而 `drop-shadow()` 只吃一条，浏览器直接丢弃整条 filter（实测算出 `none`）。这意味着挂件从鲸鱼时代起就没有投影、hover/active 也没有任何反馈。现在 hover/active 只保留 `brightness()`。**写 filter 时要确认每个函数都能吃下整个令牌**。

## 1.5.0：本地数据库（003database）与宠物挂件

用户要求（2026-10-12）：新增 `003database` 作为**数据库根目录**，能统计「共收藏了多少 / 今日新增多少 / 累计 / 近期收藏最多的收藏夹」；设置页「使用说明」下方加「数据统计」入口（按钮文案「点击查看最近收藏统计」），点开是一个带图表与表格的统计页；再加一个**宠物挂件**（参考 [DeepSeek-Balance-Whale-Widget](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget) 的气泡形态），气泡显示「已陪伴你 x 天 / 帮你保存了 x 个视频 / 今日新增收藏视频 x 个 / 你近期保存最多的收藏夹是 x」，并且**可以互动**。

**只借形态，不抄素材。** 那个仓库的代码是 MIT，但 `assets/` 里的美术素材**不在 MIT 覆盖范围内**（PROVENANCE.md 另行声明），所以鲸鱼是我们自己用内联 SVG 画的（`pet.js` 里 `.bca-pet-body/-blob/-belly/-blush/-eye/-spark/-tail/-spout`），一个字节的素材都没复用。1.4.0 参考 BewlyCat 时也是同一套做法。

**数据库是「明细」，统计全是现算的。** `stats-core.js`（IIFE + `module.exports`，浏览器与 node 两用）里没有任何「汇总字段」：

- 文件是 `003database/database.json`，形状 `{ version, createdAt, updatedAt, videos: { <键>: { at, day, collection, title, bvid, aid } }, pet: { affinity, day, todayTouch, totalTouch } }`。
- 键优先 BV 号、其次 av 号、最后「收藏夹 + 标题」（`videoKey()`）；**重复导入不会变成两行**，同一条视频再出现时**保留最早的收藏时间**、但收藏夹跟着最新走（「移到另一个收藏夹」之后排行榜要反映新位置）。
- 分天一律按**本地日**（`localDayKey()`），不是 UTC —— 否则晚上八点以后收藏的会被算进第二天。
- `snapshot()` 一次算好给界面用的全部数字（`videos / collections / savedToday / savedLast7 / topCollection / days / pet`），`recentDays()` 负责把没有收藏的日子补成 0（柱状图不能有断口）。
- **不要在数据库里另存一份汇总**：汇总与明细一定会不同步，最后变成没人能解释的「图表和列表对不上」。

**数据是怎么进来的**：导入时后台每存下一条就 `statsPendingRecords.push(statsRecordForItem(...))`，一个收藏夹跑完再 `writeStatsDatabase()` 落盘（`favoriteAtText` 与写进 `视频信息.txt` 的那行时间**同源**）；收藏库扫描完调 `syncStatsDatabase()` **整份重建**（`databaseFromVideos(videos, { previous })`，只保留 `createdAt` 与宠物状态）——扫描看得到的才算数，用户在收藏库里删掉的视频不该继续留在统计里。

**宠物挂件的契约**（三处都要对上）：`pet.js` 读 `chrome.storage.local.bcaStats` 显示；显隐由 `chrome.storage.local.interfacePet = { enabled }` 控制（设置页那个开关写它）；点一下发 `{ type: "bca-pet-touch" }`，后台 `touchPetInDatabase()` 把它落进数据库（`touchPet()`，每天最多 20 次、亲密度上限 9999）并回 `{ ok, lineIndex, affinity, todayTouch, totalTouch, capped }`。**后台只回下标、不拼中文**（service worker 里没有词典），四句台词在 `pet.js` 里逐个 `translate("…")`。

## 1.4.0：自定义外观（背景图 / 毛玻璃）

用户要求（2026-10-12）：「主题选择」改名「外观」并新增**自定义**——挑一张本机图片铺在页面背后，可调遮罩透明度与模糊强度；再加一个可选的**毛玻璃**开关与强度；插件弹窗里的主题滑块删掉；设置页重新排版（参考 [BewlyCat](https://github.com/keleus/BewlyCat)，只借交互设计与参数区间，**没抄代码**）。

**外观是「主题」的第四种取值，不是第二套主题系统。** `theme.js` 的 `MODES` 加了 `custom`，`resolved()` 把 `custom` 解析成 `light`，`paint()` 同时写 `data-theme`（light）、`data-theme-resolved`（custom）和 `data-appearance`（custom / plain）。收益是所有「夜晚」分支（深色令牌、内容脚本的提示卡）一行都不用改，弹窗自动就是白天色。**不要再给 `custom` 另造一套深色分支。**

**存储分两处，理由不同：**
- 外观三个数值 → `localStorage` 与 `chrome.storage.local` 的 `interfaceAppearance`（`APPEARANCE_KEY`，JSON 字符串）。理由同主题：`localStorage` 管同源页面之间的即时同步，`chrome.storage` 管镜像与补救。
- 背景图 → **IndexedDB**（库 `bili-vault-appearance` / store `wallpaper` / 键 `current`），存 Blob。**绝不能塞进 `chrome.storage.local`**：那里默认上限 10MB（Chrome 113 前 5MB），还要和「收藏库用哪个目录」这类小设置共享配额。参考实现正是踩过这个坑，注释里写着 to prevent the `QUOTA_BYTES quota exceeded` error。

**图片在存之前先过 canvas**：`prepareWallpaper()` 用 `createImageBitmap(file)` → canvas 等比缩到长边 2560 → `toBlob(webp, 0.92)`；原图 ≤1.5MB 时原样存；任何一步失败都退回原图。`saveWallpaper()` 里 `await` 它，所以设置页不需要自己做压缩。

**背景图层是 `z-index:-1` 的固定层，模糊不加在图上。** `.bca-wallpaper` 是 `position:fixed; inset:0; z-index:-1; pointer-events:none`；图片走它的 `::before`（`background-image: var(--bca-wallpaper-image)` + `filter: blur(var(--bca-wallpaper-blur))`），遮罩雾走 `::after`。**不要改成对背景图元素直接 `filter: blur()`** —— 那会糊掉元素边缘、出现透明羽化边；`::before` 的 `inset: calc(-1 * (var(--bca-wallpaper-blur) + 12px))` 就是给模糊留的余量，去掉它放大模糊会看到边缘发暗。

**遮罩是「浅色雾」不是黑幕**：`rgba(242, 245, 249, ·)`（页面底色），上限 92%。写成黑幕会把整页拖进深色，白卡片看着就"浮"起来了。

**「自定义」在哪几页生效。** 图层由 `theme.js` 挂到 `body` 的第一个子节点，但弹窗（`popup.html` 的 `<html data-wallpaper-scope="popup">`）与内容脚本会被跳过，`theme.css` 里「页面底色透明」那条规则也带 `:not([data-wallpaper-scope="popup"])` 守卫。**收藏库与设置页**本来就由卡片拼成，照片从卡片缝隙里透出来即可；**guide.html / tutorial.html 是长文档**，所以 `page.css` 另给 `.wrap` 加了一层纸面（`html[data-appearance="custom"][data-wallpaper="on"]` 才生效，刻意不做玻璃 —— 长正文透出照片只会更难读）。**新增页面时要自己决定属于哪一边：卡片式页面直接铺，长文页面必须自带底色。**

**毛玻璃 = 给一组「面」加半透明 + `backdrop-filter`。** `html.bca-glass` 命中 `.sidebar / .video-card / .detail-panel / .batch-toolbar / .confirm-dialog / .editor-dialog / .diff-dialog / .settings-card / .toast`；顶栏单独用 `blur(calc(var(--bca-glass-blur) + 6px))`（它本来就是 92% 的 `color-mix` 底）。**要新增「面」就往 `theme.css` 那份 `:is(...)` 里加，不要在页面 CSS 里各写一份。** 玻璃默认关：全屏背景 + 大面积 `backdrop-filter` 对低配机器是真实成本，参考实现也一样默认关。**玻璃的底色与边缘高光必须从 `--surface` 用 `color-mix` 推出来**（`--bca-glass-surface` / `--bca-glass-line` / `--bca-glass-glow` / `--bca-glass-shade`）：写死白色的话，夜晚主题下卡片会亮成一片、卡上的字几乎看不清 —— 1.4.0 实测踩过这一条。**`backdrop-filter` 会自建层叠上下文与包含块** —— 带玻璃的面里不要再放需要 `position: fixed` 的浮层（下拉、tooltip）。

**参数区间与默认值**：遮罩 0–100（默认 50）、背景模糊 0–40px（默认 0）、玻璃强度 1–20px（默认 16）、玻璃开关默认关。全部由 `theme.js` 的 `clamp` 夹住，脏数据不穿透（有测试）。

**测试**：`test/stability.test.cjs` 的 theme 沙箱原来只桩了 `document`，1.4.0 补了 `classList` / `style` / `dataset`（`dataset` 用 Proxy 指回 attributes）与一份写在内容里的外观簿记，因此能真 `require` `theme.js` 跑 `use("custom")` / `setAppearance(...)` 并断言挂出来的 CSS 变量。新增 6 项（外观四项、变量落点、脏数据夹取、图片不进 `chrome.storage`、玻璃糊在哪些面上、弹窗没有主题滑块），总数 182 → 188。

## 1.3.0：移除下载功能（公开版）

**背景**：两个第三方 B 站工具先后收到 B 站委托律所（上海市弘安律师事务所）的《侵权告知函》—— DownKyi / downkyicore（2026-07-06）与 bilibili-API-collect（2026-01-28）。函告的重点不是「下载」本身，而是：**未经授权对非公开接口、认证体系、访问控制机制、付费内容保护与会员体系作逆向分析与适配，并以客户端工具、脚本、技术文档等形式向不特定公众传播**；加重情节写的是「将上述爬取能力作为官方特性内置、持续更新、随每一次版本发布向全球不特定用户分发，已超出一般开源项目的被动托管性质，构成对相关代码的主动提供与背书」。用户据此决定：**公开版 bili-vault 不再提供下载功能，重构前的版本封存到 bili-vault-developer**。

**用户原话（2026-10-11）**：「旧版本封存到 bili-vault-developer 中；公开版本中，下载功能要取消，历史也要重建；『已下载？点击标记』改为：『将下载到本地的视频放入收藏夹中』，功能不变，『000视频下载』也不变；版本号变为 1.3.0；文档中写：出于安全考虑，1.3.0 以后插件不再提供下载功能，但仍可以将下载到本地的视频放在收藏夹中，方便点击跳转；一些文档也要进行变更。」

**删掉的东西**：

- 三个文件：`download.html` / `download.js` / `download.css`（合计约 1450 行）。
- `background.js`：`DOWNLOAD_WBI_MIXIN_ORDER`、wbi 密钥缓存、`downloadMd5`、`getDownloadWbiKey`、`biliDownloadApi`、`getDownloadVideo`、`getDownloadPlayurl`、`getDownloadSubtitles`，以及 `bca-download-parse` / `bca-download-playurl` / `bca-download-subtitles` 三条消息分支。
- `library.js`：`openDownloadInterface()`、批量工具条上的「下载」按钮及其接线、详情面板里 `.download-local` 那个「下载视频」按钮。**「已下载？点击标记」这个按钮保留、功能不变，只把文案改成「将下载到本地的视频放入收藏夹中」。**
- `manifest.json` 的 `host_permissions`：`https://*.bilivideo.com/*`、`https://*.bilivideo.cn/*`、`https://*.akamaized.net/*`。**这一条是整个改动里最要紧的** —— 权限没了，取流能力才算真的没了，而不只是「按钮藏起来了」。
- `guide.html` 的「九、下载功能」整节与相关界面示意图；`library.html` / `popup.html` 安全须知的第 2、3 条（改成「1.3.0 起不再提供下载 / 放进收藏夹的文件仅限个人离线观看」）。

**刻意留下的东西（别顺手删）**：

- `000视频下载` 目录与布局、`请将视频放到这里.txt`（`DOWNLOAD_MARKER_FILE` / `DOWNLOAD_MARKER_TEXT`）、`downloadMatchIsDownloaded()` / `downloadStateFromIndex()` / `downloadIndexKey()` / `downloadPathLabel()` 等判据、「已下载」徽标、以及在用户点标记时按需创建 `000视频下载` 的行为。
- 与下载器一致的目录命名规则（`视频标题 - BV号`）—— 用户把外部下好的文件放进去，插件必须能对上号。
- Windows 原生目录助手（打开 / 复制本地视频目录）：它只做「打开资源管理器」，与取流无关。

**公开仓库的历史也要重建**：`.git` 里能完整翻出被删的取流代码，取证时一样算「提供与传播」。做法是**新初始提交**（或 `git filter-repo`）并处理掉旧的 84 个 tag / release；`bili-vault-developer` 副本保留完整历史与旧版本。
