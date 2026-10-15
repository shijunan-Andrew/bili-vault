# AI 项目交接说明：哔哩藏库 Bili Vault

本文面向后续接手代码的 AI，记录当前项目结构、数据流、关键约束和验证方法。请先阅读本文，再看 [README.md](README.md) 和相关源文件。

## 项目基线

- 项目目录：`Desktop\bili-vault\` —— **仓库根就是扩展目录**，扩展文件直接放在根目录，不再套一层带版本号的文件夹（版本交给 git tag 管理）。V1.0.0 交付时曾短暂叫过 `b-vault-V1.0.0`，**该名字已废弃**。**1.0–4.9 的独立文件夹快照已经删除**：它们全部重放成了 git 历史与 tag，所以取历史版本一律走 git，不要再去找 `bili-vault-beta*` 目录（那些目录已经不存在了）。
- 扩展版本：**以 `manifest.json` 的 `version` 为准，这里不写死**（界面上的版本号是它加上 `library.js` / `popup.js` 里的 `RELEASE_CHANNEL` 前缀拼出来的；两处常量必须一致）。Chrome Manifest V3，最低 Chrome 版本 111。测试版时期界面显示 `beta4.x`，差别只在那两处 `RELEASE_CHANNEL` 常量。
- **版本管理方式在 V1.0.0 改了**：以前每个版本是一个独立文件夹（`b_catch_*` → `bili-vault-beta*`），现在**改用 git**——每个版本一个 commit 与一个同名 tag（`beta1.0` … `beta4.9`、`V1.0.0` 一路到当前版本；**tag 数量每次发布都在涨，别在任何地方写死**），提交日期用的是各版本快照的真实文件时间，所以 `git log` 直接就是那条时间线。远程：`https://github.com/shijunan-Andrew/bili-vault`。**新版本直接在当前目录改并提交，不要再复制文件夹。**
- **历史版本编号沿革**：项目最初叫 `b_catch`，目录名 `b_catch_1.0` … `b_catch_3.8`，后来随改名统一成 `bili-vault-beta1.0` … `bili-vault-beta3.8`。**这些快照目录现在都已删除**，内容完整保留在 git 历史里（`git show beta2.0:manifest.json` 这样就能取到）。完整的逐版本演变见 `README.md` 的版本历史段，图示与量化数据见 `Desktop\bili-vault开发文档\`。

  **目录名与 manifest 版本号曾经不一致**——早期那套是手工复制文件夹，改名时没同步 `manifest.json`。只有下面这 3 个对不上，其余都一致，查历史时按这张表对齐，别被绕进去：

  | tag | `manifest.json` 里写的 |
  |---|---|
  | `beta1.0` | `1.1.3` |
  | `beta1.1` | `1.1.4` |
  | `beta3.8-uncomplete` | `3.7.0`（它是 3.8 做了一半的快照，版本号还没来得及改） |

  **这个问题现在不会再发生了**：目录名不再带版本号（就是 `bili-vault`），版本只有两个来源——`manifest.json` 的 `version` 与 git tag，而 `release.ps1` 会把它们一起改。想在某个历史提交上确认版本，用 `git show <tag>:manifest.json`。

- 3.6 之前没有测试套件、没有 `archive-core.js`、也没有本文件；3.6 起才建立「抽取纯逻辑 + 静态回归测试 + 交接文档」这套工程约定。
- **4.0 是一次纯界面重构**，磁盘格式与数据流完全没动：它把四份互相覆写的 CSS 收敛成 `theme.css` 单层令牌体系，并确立了本文件「界面与设计系统」那六条约定。4.0 之前的 CSS 是层层追加的补丁（`.library-link` 被定义 4 次、`.primary` 和 `.toggle-switch` 各 3 次），改一处样式极容易被下游区块盖掉——**若要理解某条界面约定的来历，先看这一条**。
- **4.5 新增主题与多语言两个横切能力**（`theme.js` / `theme.css` 深色令牌、`i18n.js` + `locales/`），并调整了排序、卡片徽标与「更新视频状态」的位置。
- 项目没有 npm 依赖或打包步骤。扩展直接从 `chrome://extensions` 加载解压目录。原生辅助程序是唯一需要“构建”的部分：安装脚本用系统自带 `csc.exe` 把 `native\folder-opener-launcher.cs` 编译成宿主启动器。
- 用户主要使用中文界面和 Windows/Chrome。回答修改结果时用中文、清楚说明文件、行为变化和检查结果。
- 注意：Chrome 的扩展程序 ID 由插件所在**绝对路径**推导。换目录（例如 `bili-vault-beta4.9` → `bili-vault`，或 V1.0.0 那次从 `b-vault-V1.0.0` 改名）ID 就会变，安装本地目录打开助手时必须填入新 ID。**所以尽量不要改这个目录的名字。**

## 功能概览

1. 在 B 站视频页确认收藏后，将视频信息和封面写入用户选择的本地目录。
2. 在 B 站个人空间收藏夹页选择收藏夹，批量导入或更新本地归档；对失效视频尝试恢复可找回的信息。
3. 打开本地收藏库后，按固定目录结构解析视频，支持搜索、筛选、详情、新建/删除收藏夹、添加视频、移动/复制、批量操作。
4. 把外部下载好的视频放进收藏夹：在详情里点「将下载到本地的视频放入收藏夹中」，插件按与下载器相同的规则建好目录，你把文件放进去，卡片就显示「已下载」。（1.3.0 起不再内置下载器。）
5. 通过可选的 Windows Native Messaging 辅助程序，在文件资源管理器打开视频目录。
6. 外观可选「自定义」（1.4.0）：整页铺一张本机图片，可调遮罩透明度 / 背景模糊，并可开启毛玻璃（强度可调）；图片存 IndexedDB 的 Blob，不进 `chrome.storage`。
7. 本地数据库与数据统计（1.5.0）：导入与扫描会把每条视频记进 `003database/database.json`，设置页「数据统计」打开统计页（数字卡 + 最近 14 天柱状图 + 收藏夹排行）。
8. 宠物挂件（1.5.0）：收藏库右下角一只自绘的小鲸鱼，点一下冒气泡说一句话（陪伴天数 / 帮你保存了多少 / 今日新增 / 最近最常收藏的收藏夹），互动次数落进数据库当亲密度；设置页可开关。

## 路线图（用户 2026-10-10 确认的方向）

V1.0.0 之后的三件事，**都是用户明确要求的下一步**。做之前先回来读这一节，别凭猜测扩展范围。

1. ~~**「同步」而不是「再导出一次」**~~ —— **V1.1.0 已实现**，见下文「同步差异报告」一节。（原描述：这是首要目标。用户最大的收藏夹 `默认收藏夹` 有 2799 条，按现在约 1.2 条/秒全量跑一次要 39 分钟。真正要的不是"重跑一遍"，而是**一份差异报告**：这段时间里 B 站那边新增了什么、删了什么、哪些变失效了。现在导入会静默跳过已存在的记录，用户看不到任何变化。）
2. **导出全部元数据为单个 JSON**。归档的可迁移性缺口：`视频信息.txt` 损坏就是永久丢失，也没有办法把整个资料库交给别的工具读。242 条记录还小，但越晚做成本越高。顺带可以做完整性校验（校验和）。
3. ~~**想清楚下载功能的定位**~~ —— **2026-10-11 用户拍板：公开版移除下载功能**，见下文「1.3.0：移除下载功能」。保留下来的是「手动标记已下载」这条与外部下载器对接的路。

### 同步差异报告（V1.1.0 已实现）

用户最大的收藏夹 `默认收藏夹` 有 2799 条，全量导入要 39 分钟，而导入会静默跳过已存在的记录 —— 跑完也不知道变了什么。V1.1.0 加了差异对比。

**核心约束：只读收藏夹列表，绝不抓详情。**

| | 每次请求 | 1000 条需要 |
|---|---|---|
| 列表（`fetchImportFavoritePage`） | 40 条 | 约 70 次请求，**1~2 分钟** |
| 详情（`fetchVideoDetail`） | 1 条（限速 1.25 秒） | 约 39 分钟 |

**差了 20 倍以上，这就是这个功能存在的全部理由。** `test/stability.test.cjs` 里有一条断言直接扫描差异引擎那一段代码，禁止出现 `fetchVideoDetail` / `fetchImportDetails` —— **改这一块之前先读懂为什么**。

实现分布：

- `computeFavoriteDiff(remoteItems, localRecords)` —— **纯函数**，算四项差异。刻意不碰 DOM、不碰 chrome API、不发请求，这样测试能把它抽出来真跑（`loadBackgroundFunctions`）。
- `fetchFavoriteListOnly()` —— 只分页拉列表。
- `diffFavoriteCollection()` / `diffBiliFavorites()` —— 串起来，逐条报进度（`bca-diff-progress`）。
- `buildDiffReportText()` —— 纯函数，拼报告正文。
- `persistDiffReport()` —— 写进 `002同步报告/`。
- 消息 `bca-fav-diff`，弹窗与收藏库共用。

**两个容易踩的点：**

1. **`002同步报告` 必须留在 4 处「保留目录」名单里**（`library.js` 两处、`background.js` 两处），否则它会被当成一个收藏夹扫出来、还会被当成可导入的目标。
2. **收藏库拿不到远程 `media_id`**（它是独立扩展页，没有 B 站标签页），所以 `bca-fav-diff` 也支持按**收藏夹名**匹配（`folderTitles`）—— 本地目录名与 B 站收藏夹名本来就要求一致。`resolveDiffUid()` 按「调用方给的 uid → 已打开的收藏夹页 → 缓存的 `lastImportUid`」三级回退；`chrome.tabs.query` 在没有 `tabs` 权限时会抛错，已经包了 try/catch。

### 明确不做的事（用户已否决，别自作主张加回来）

- **不要做「失效视频定期复查 / 恢复」功能**。用户的判断是：B 站上失效的视频基本不会恢复，为此加一套定时复查没有意义。**现在的行为就够了**——导入到本地时查一次失效视频的资料并存下来。`recoverInvalidVideos` 开关与「更新视频状态」都保持现状，不要再扩展。

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

## 1.7.1：`writeFile` 原子写撤回（真机回归，教训在前）

**现象**（用户真机，1.7.0）：手动收藏和导入视频都提示「正在归档视频… / B站已完成收藏，正在保存视频信息和封面。」，但本地收藏夹里最后没有记录。

**定位**：`git diff c6a2cbd e1dbd49` 里，归档链路（`addManualVideo`、`saveImportedItem`）只被改过一个函数 —— `background.js` 的 `writeFile`（1.7.0 改成「临时文件 + `temp.move(directory, name)` 覆盖」，非 `NotSupportedError`/`TypeError` 的错误原样抛出）。而两条链路都在 `writeFile` 抛错时执行 `removeEntry(record.name, { recursive: true })` 删掉整条记录，于是「更安全的写盘」直接变成「功能坏掉」。

**修法**：`writeFile` 完整退回 1.7.0 之前的就地写（不留临时文件）；`library.js` 的 `writeFileAtomically` 把「换名失败按错误类型分流」改成「一律退回就地写」（临时文件保留 + `lastResult` 写明这一点仍保留）。数据库那一侧的原子写不动 —— 页面里从 1.6.1 用到 1.6.5、有真机证据。验证台 `b_catch\_verify-170-p0.cjs` 的 T8 改成守「失败必须抛错、且不新增文件」（9/9 通过）。

**教训（下次别再犯）**：① 在 service worker 里用 FSA 的 `move()` 之前，必须先在真机上确认它存在、以及换名失败时抛什么错 —— 页面里的经验（`writeFileAtomically` 从 1.6.1 起就在用）不能直接搬到 SW；② 改「写盘」这类基础函数前，先把**所有调用方在失败时的行为**列出来 —— 这次的调用方是「失败就把整条记录删掉」，后果被它放大成了「用户以为没收藏成功」；③ 一个「看起来更安全」的改造，只要让原本能成功的路径变成失败路径，就是净损失。

## 1.7.0：上线前审查的批次 A/B/C（两条 P0 + 数据面 P1 + 文档漂移）

上线前全项目审查（P0=2、P1=24、P2≈55、P3≈50，10 个分面的原文报告在开发机的 `b_catch\bili-vault-1.7.0-审查报告.md`）。用户批了批次 A/B/C，本版只做这三批。

1. **P0-1 读不到数据库时整份重写成空库**。`readStatsDatabase()`（background.js）在 `getFile().text()` 抛错时返回 `emptyDatabase()`，而 `writeStatsDatabase()` / `touchPetInDatabase()` 会在这份空库上追加本轮记录再整份写回 —— 历史统计与宠物亲密度无声归零。修法：读函数回报 `canWrite`/`reason`（`unreadable` / `empty` / `ok` / `corrupt` / `corrupt-unarchived`），两个写入口共用 `statsDatabaseWriteBlocked()` 守卫，读不可信就一个字节都不写，只把原因写进 `lastResult` 与角标。
2. **P0-2 不可恢复字段没有兜底**。`firstSeenAt` / `totals.savedTotal` / `pet.affinity` / `pet.totalTouch` 在 `chrome.storage.local.bcaStatsMirror` 留镜像（`syncStatsMirror` 只在真的变了才写），读失败时 `applyStatsMirror` 用 `Math.max` 顶回来。另外每次改写正文前 `archivePreviousStatsDatabase()` 把上一版原文写进 `database.bak.json`（**副本比正文早一版**：先写副本、成功后再重写正文，File System Access 没有 rename）。
3. **坏 JSON 且留档失败 = 也拒绝写**（`reason: "corrupt-unarchived"`）。1.5.1 只解决了「留档成功再重建」，留档失败那支还会整份重写 —— 等于把用户唯一一份坏文件也覆盖掉，事后无从恢复。
4. **批次 B（数据面 P1）**：`writeFileAtomically()`（library.js）用 `isMoveUnsupportedError()` 分清「本机没有 move()」与「这次换名失败」，后者不再退回就地写（会把正文截成半截）；临时文件写成功后不再无条件删除（它是最后一份完整副本，删了才是真丢），并把文件名写进 `lastResult`；`writeFile()`（background.js）同样处理 + 补 `lastResult`；删收藏夹的确认文案改成说清「删的是整个目录」；批量删除改走 `showResultDialog` 并列出失败明细；复制记录改成校验复制件与源逐字节一致后再删源；`rollbackImport()` 的四个 `catch (_) {}` 收集成 `failures[]` 并写进取消导入的终态文案；导入失败写 `lastResult.failed = true`，`popup.js` 的 `refreshStatus()` 据此强制展开「最近状态」（角标在弹窗打开时就被清掉，折叠卡片是唯一痕迹）；`stats.js` 两处：`monthText` 重复声明互相覆盖 + `new Date("YYYY-MM")` 按 UTC 解析（UTC 以西差一个月）、`bindResize` 丢第二个参数导致旧快照 resize 后主图空白。
5. **批次 C（一致性与文档漂移）**：彩蛋页入口先 `fetch(chrome.runtime.getURL("bili-old-2015/index.html"))` 探资源在不在包里，不在就给对话框（`pack.ps1` 排除该目录，真实安装包里点它只会开出「找不到文件」）；README / AI_HANDOFF / SMOKE_TEST 的漂移数字对齐实测（发行包 42 文件约 1.4 MB 解压后、词典 859 条、数据库纯函数 58 项、`retro.*` 早已删除）；`release.ps1` 新增「文档里的词典条数（`<!-- i18n-count:N -->`）必须和 `--check` 的实际条数一致」的闸门。
6. **教训**：`test/stability.test.cjs` 全是文本级断言，看不见「读失败 → 空库 → 整份重写」这类跨函数后果。对这一档后果（丢数据）值得写一个**内存假 FSA + 假 chrome 的验证台**：`b_catch\_verify-170-p0.cjs` 用 `vm` 装载 `stats-core.js` + `background.js`（去掉第 5 行的副作用 `import`），覆盖读失败拒写、镜像兜底、`database.bak.json` 轮转、留档失败拒写、原子写的失败路径，9/9 通过。真机上这些失败路径没法安全复现，所以这份验证台是这一版的主要证据。
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

## 目录结构

```text
bili-vault/                       # 仓库根即扩展目录；改名会改变扩展 ID，必须重装本地目录打开助手
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
│   ├── stability.test.cjs        # Node 内置测试（项数以 `node test/stability.test.cjs` 的实际输出为准）：静态回归断言 + 并进来的单元测试
│   ├── archive-core.test.cjs     # 59 项真执行单元测试：require archive-core.js 真的调用它
│   ├── stats-core.test.cjs       # 1.5.0：31 项真执行单元测试：require stats-core.js（固定时间戳，绝不用真实 Date.now）
│   ├── i18n-extract.cjs          # 提取界面词条、校验词典覆盖率（--check / --todo）
│   ├── _unmarked.cjs             # 反向检查：找出漏标记的界面文字
│   ├── archive-audit.cjs         # 本地归档的标签/简介覆盖情况体检
│   └── import-trial.cjs          # 只读预览导入会抓到什么，不改任何文件
├── README.md                     # 面向使用者的安装与功能说明
└── AI_HANDOFF.md                 # 本文件
```

4.0 删除了 `download-folder.html/js/css`（3.2 之后就被本地目录打开助手取代，全项目零引用）。4.3 起 `library.html` **不再**作为 web_accessible resource 暴露，改由后台 `chrome.tabs.create` 打开。

**1.3.0 删除了 `download.html` / `download.js` / `download.css`**、`background.js` 里整条下载链路、`library.js` 的下载入口，以及 `manifest.json` 的三条视频流域名权限 —— 公开版本不再有取流能力。见下文「1.3.0：移除下载功能」。

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

后台串行执行保存操作，读取 IndexedDB 中的根目录句柄，检查写入权限，在每个实际收藏夹下创建时间目录，保存 `视频信息.txt` 和 `封面.webp`。保存失败时尝试写入 `001错误报告`，并把最近状态、错误详情放入扩展存储供弹窗展示。

### B 站收藏夹导入

`favorites-import.js` 注入个人空间收藏夹页，为后台请求提供页面上下文 API 代理，并接收列表收藏夹、导入所选收藏夹的消息。`popup.js` 展示可选列表和导入进度。后台分页获取收藏视频、对本地 BV/av 去重，并写入与自动归档相同的目录格式。

失效视频恢复逻辑主要在 `background.js`：尝试从 APP 收藏夹数据、稍后再看、观看历史和视频资料等来源恢复标题、封面、UP 主及其他字段。未找回的字段应保留为“未知”；封面无法恢复时使用占位图，避免本地库漏掉该记录。B 站接口和页面结构会变化，导入失败时应保留部分已成功结果并记录错误。

### 导入/更新流程（4.2 重写）

`importBiliFavorites()` 现在按下面的顺序跑，每个循环迭代开始都调 `importWaitIfPaused()`：

1. 列远程收藏夹 → 逐个读分页（`/x/v3/fav/resource/list`）。
2. 本地同名收藏夹**不存在**就新建（记进回滚日志），**存在**就读取已有记录（`readExistingImportRecords()` 同时返回去重标识符和每条记录的原文）。
3. 按 BV/av 把远程条目分成「缺失的」和「已存在但 `recordNeedsRefresh()` 为真」的两类。
4. 失效视频先走原有恢复流程（APP 收藏夹 / 稍后再看 / 观看历史）。
5. **对上面两类条目都抓一次完整资料**：`fetchImportDetails()` → `fetchVideoDetail()` 调 `/x/web-interface/view`（简介、发布时间、分区、时长、UP 主、`stat`）与 `/x/tag/archive/tags`（标签），再调 `/x/relation/stat` 取 UP 主粉丝数（`upFansCache` 按 mid 缓存，同一个 UP 只请求一次）。并发 1、间隔 800ms（4.3 起下调，见下文「合规与安全红线」）。
6. 已存在的记录用 `refreshImportedRecord()` 按新格式重写，**保留原来的收藏时间与目录名**，原文进回滚日志。
7. 缺失的条目批量下载封面后写入（`saveImportedItem(..., journal)`，目录句柄先登记再写）。

**暂停 / 取消 / 回滚**：`bca-import-control` 消息设置 `importRun.paused/cancelled`；暂停时 `importWaitIfPaused()` 用 Promise 挂起，继续或取消时 `importReleaseWaiters()` 唤醒。取消会抛 `ImportCancelled`（`error.name`），在最外层捕获后调用 `rollbackImport(journal)`：先删 `createdRecords`、再按 `modifiedFiles` 还原原文、最后清掉本次新建且为空的收藏夹。进度通过 `chrome.storage.local.importState` 持久化，所以弹窗关掉再打开也能恢复按钮状态；`get-status` 会带上 `importState`。

**接口抓不到数据的处理**：`/x/web-interface/view` 的 `desc` 对不少视频就是空的或 `-`（实测 `BV1LKGm6ZErR` 返回 `-`），这时简介会退回收藏夹接口 `intro` 清理后的文本；`stat` 通常都有。

### 更新视频状态（4.4 引入，4.5 调整见下）

收藏库的「更新视频状态」按钮经 `bca-refresh-video-stats` 触发 `refreshVideoStatus()`，逐条调用 `refreshOneArchiveStatus()`：

- **有效视频**：调用 `/x/web-interface/view` 拿 `stat`，按 UP 缓存调用 `/x/relation/stat` 拿粉丝数，然后用 `patchVolatileFields()` **只替换** UP主粉丝数、`【互动数据】` 整块，以及原值为「未知」时的发布时间。标题、简介、标签、收藏时间、所属收藏夹、目录结构全部逐字不动（测试会核对行数与逐行差异）。
- **失效视频**：`biliImportApiGet()` 把接口错误码挂在 `error.apiCode` 上；只有 `typeof error.apiCode === "number"` 才判定为失效（网络/超时错误保持原样、记为失败），此时**只写一行** `视频状态：已失效视频（更新状态时检测到）`，其余内容一个字都不改。网页端 `isInvalid` 的依据是 `/失效/.test(视频状态)`，因此标记后立即表现为「已失效」徽标 + 红色标题 + 灰色封面，与导入时识别的失效视频一致。若该记录又能正常访问，更新时会把标记改回「正常」。

**关键约束**：`patchVolatileFields()` 在 `archive-core.js` 与 `background.js` 各有一份（service worker 无法 require 经典脚本），**两份必须保持一致**——`test/stability.test.cjs` 会从 background.js 抽出真实函数、用多组输入与共享实现逐个比对。改其中一份必须同步改另一份。

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

- **统一入口**：`openStatusConfirm(videos, source)`（`source` 是 `"detail"` 或 `"batch"`）→ 用户点「开始更新」→ `runStatusRefresh()` 提交：

```
chrome.runtime.sendMessage({ type: "bca-refresh-video-stats", data: { targets, limit: STATUS_BATCH_LIMIT } })
```

- **批量入口保留着，而且必须保留**：勾选若干条后点批量工具栏的「更新视频状态」（`library.html:138` 的 `#updateSelected`），`library.js:3302` 绑的是 `openStatusConfirm(selectedRecords(), "batch")` —— 取的是**当前选中项**，不是整库、也不是别处的全选快照。`test/stability.test.cjs:789-798` 守着这两点：必须用 `selectedRecords()`，且不许退回 `selectedVideos()`。详情面板那个按钮（互动数据下方的 `.refresh-status`）走的是同一个 `openStatusConfirm(_, "detail")`。
- **上限**：`library.js:1446` 的 `const STATUS_BATCH_LIMIT = 80;`（4.4 那个 `statusBatchSize` 常量已经不存在了，别去找它）。超过 80 条时确认框会说「本次只处理前 80 条，完成后可以再点一次继续」，后台返回的 `remaining` 也照实显示。
- **后台实现**（`refreshVideoStatus` / `refreshOneArchiveStatus`）没有变。风控的顾虑不是靠「不做批量」解决的，而是靠**确认框 + 80 条上限 + 串行间隔**（`IMPORT_DETAIL_CONCURRENCY` / `IMPORT_DETAIL_DELAY_MS`）。**不要再把无确认的单条刷新加回来。**
- 上面几处行号是 V1.2.0 时的快照，**函数名、常量名、id 才是稳定的锚点**，行号对不上时按名字搜。
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

- **导入的保活是显式行为，不是副作用**：`keepServiceWorkerAlive()`（background.js:1357，调 `chrome.runtime.getPlatformInfo()`，内部 20 秒节流）。MV3 的 Service Worker 只认"扩展 API 调用/事件"来重置空闲计时器，**纯 `await` 不算**。原来唯一的"保活"是 `publishImportState` 每 500ms 写 storage 的副作用——没有任何一行声明这个意图，暂停态与超长 `await` 段都会失去保护。**改导入主循环时不要把这个调用删掉。**
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

### 已知限制（4.9 审视结论，未修的部分）

一次覆盖 约 8800 行 JS 的只读审视确认了下面这些是**已知且暂不修**的限制。**不要把它们当 bug 去"顺手修掉"——每一条都有取舍理由。**

- **主测试套件是文本级断言，不执行被测代码**（这一条在 V1.0.0 之后有所缓解：`test/archive-core.test.cjs` 里的单元测试是真执行的，见「常用验证」）。`stability.test.cjs` 的其余断言是"把文件当文本读 + 正则匹配"。它**看不见语法错误**（4.8.2 真的漏过一次：`library.js` 有语法错误但 104 项全绿）。唯一能发现解析错误的是 "every shipped script actually parses" 那条（用 `vm.Script`）。**改完代码必须单独跑 `node --check`。**
- **配置没有版本迁移**。`CONFIG_VERSION = 1`，导入配置时只校验结构不做迁移。将来升版本必须补。
- **没有多标签页互斥**。两个标签页同时打开同一归档、同时做写操作（标记已下载 / 删除 / 移动）没有锁。日常使用很难触发，但理论上存在竞态。
- **没有归档完整性校验与备份机制**。`视频信息.txt` 损坏就是永久丢失，插件没有校验和、没有导出元数据的功能。
- **原生宿主名仍是 `com.bcatch.folder_opener`**（`b_catch` 时代的名字），宿主版本号仍是 `3.8.0`。**改名会让所有已安装用户的注册失效**，所以要么不改，要么改的时候写迁移脚本。
- **扩展 ID 由插件所在目录的绝对路径决定**，所以**每次改文件夹名都需要重新加载扩展并重跑 `install-native-folder-opener.ps1`**。这是 Chrome 的机制，绕不过去，只能靠文档提醒。
- **`openDb` 在 `library.js` / `popup.js` 里各有一份**（`download.js` 那一份已随 1.3.0 删除），两份都缺少 `objectStoreNames.contains` 守卫（当前版本号都是 1、升级只跑一次，所以没暴露；一旦有人把版本号改成 2 就会抛 `ConstraintError`）。
- **全项目有 55 处静默吞错**（`catch (_) {}`），`library.js` 占 24 处。用户可见的失败路径里大约一半是静默的。
- **归档路径可能超过 Windows 的 `MAX_PATH`（260）**。各段上限是"收藏夹 120 + 视频目录 100"，最坏情况合计约 328 字符。开发机 `LongPathsEnabled = 1` 所以没暴露；**别人不一定开了这个**。

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

- **界面版本号带渠道前缀**：`displayVersion()` 在 `library.js` 与 `popup.js` 各有一份，**必须保持同步**（测试会抽出两份实现比对同一批输入的输出）。改渠道只需把 `RELEASE_CHANNEL` 从 `"beta"` 改成别的值：beta 显示 `beta4.7`（去掉末尾的 `.0`），正式版显示 `V1.0.0`。
- **顶部横幅的跑马灯**由 `buildBannerMarquee()` 在显示横幅后构建、窗口 resize 时重建。它按容器宽度补足份数并保证前后两半等宽（位移 50% 才能无缝）。`library.css` 里有一条 `@media (prefers-reduced-motion: reduce)` 显式豁免——**不要删**：`theme.css` 的全局规则会把动画压成「跑一次就弹回原位」，而 `animation-fill-mode` 默认是 `none`，元素会退回无位移状态，跑马灯就完全不动了。
- **工具栏的下拉框有固定宽度**（`.video-filter select` 132px、`.sort-select select` 124px）。工具栏是 `justify-content: flex-end` 右对齐的，**如果让 select 宽度跟着选中项文字变，整行都会左右窜**。
- **颜色令牌新增 `--feature` / `--feature-soft` / `--feature-line`**（橘黄，用于突出「导入或更新」这类主入口）。浅色 `#a5560a`、深色 `#efa45a`，对比度 4.76 / 7.39。深色那两处仍然必须完全一致。
- **使用须知现在是六条**（新增「不要移动插件文件夹位置」）。三个界面必须逐字一致，测试断言条数为 6。**1.6.4 起删掉了「本插件不是 B 站官方工具……账号风险请自行评估」那一条**（用户要求），两份词典里的对应词条同时删除。

### 收藏库的性能与可访问性（4.6）

- **增量扫描**：`scanRoot()` 现在带缓存。键 = `收藏夹/目录名`，值 = `{size, lastModified, 解析结果}`；按根目录 handle 用 `WeakMap` 发自增 id 隔离。命中时**只调 `getFile()` 取元数据、不读正文**；`size` 或 `lastModified` 变一个字节就只重读那一条。目录列表**每轮重新枚举**，所以新增/删除目录一定反映。
  **三个必须守住的点**：① 缓存键含 `lastModified`，但外部工具若保留原 mtime 改写文件会漏判 —— 所以「刷新」按钮走 `forceFullScan = true` + `clearArchiveCache()`，**这条退路不能删**；② 缓存里的记录对象被 `video.info` **共享引用**，将来任何代码都不许就地修改它，要改就赋新对象；③ 单根目录缓存上限 4000 条，超出整体清空一次（退化成一次性全量，不会出错）。
- **封面 URL 生命周期**：blob URL 现在由缓存持有、页面卸载时统一 revoke（不再每轮扫描重建）。好处是不再泄漏 objectURL；代价是记录被删或换根目录后，旧 URL 要等到 unload 才释放，超大库长时间开着页面内存占用比以前高。
- **焦点陷阱**是手写栈（`trapFocus()`），目前注册了 `#confirmBackdrop` 与 `#detailPanel`。**再加第三层浮层时必须把它也注册进去**，否则 Tab 会穿透。
- **配置导出**绝不能带上目录句柄、B 站数据或错误报告内容（测试会扫导出代码块里有没有这些标识符）。导入只校验结构与枚举值，`CONFIG_VERSION` 升级时需要补迁移。
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

移动或复制操作先按目标收藏夹判断 BV/av 重复项，再复制归档文件。勾选原收藏夹表示保留原件（复制）；不勾选表示移动。删除收藏夹/视频/批量视频前会确认；用户可额外勾选同时删除关联下载，默认不删除下载。

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

**运行链路**：Chrome 启动 `folder-opener-launcher.exe` → 启动器读取一条带 4 字节长度前缀的请求 → 转发给同目录的 `folder-opener-host.ps1`（`-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File`，`CreateNoWindow`，不闪窗）→ 把响应帧原样写回 Chrome。启动器在自身失败时也会回一条 `{"ok":false,"message":…}` 帧，所以扩展能显示真正原因，而不是只有 Chrome 的 `native host has exited`。`sendNativeMessage` 每次调用都会新起一个宿主进程，因此启动器只处理一条消息后退出；若将来改用 `connectNative` 长连接，必须改成循环处理。

**工作脚本协议**：`get-config` 返回 `downloadBasePath` 与 `version`；`resolve-directory` 只校验并返回绝对路径（不打开窗口），供“复制视频目录路径”使用；`open-directory` 校验后调用 `explorer.exe` 并返回 `targetPath`。三者都会校验目录名不含分隔符、目标路径必须仍在配置的下载根目录之内。

**排错顺序**：先运行 `test-native-folder-opener.ps1`（默认不打开资源管理器）。它检查宿主目录四个文件、清单是否含 `args`、`path` 是否指向启动器、注册表项，然后直接按帧协议调用启动器。自检通过说明原生侧没问题，剩下的就是扩展重载或 Chrome 未重启。改脚本后务必重新做 PowerShell 语法检查并重新编译启动器（重跑安装脚本即可）。

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

## 常用验证

在项目根目录执行：

```powershell
node test/stability.test.cjs
```

检查项数**以 `node test/stability.test.cjs` 的实际输出为准**（用例一直在加，别在这里写死）。构成是：绝大多数静态回归断言 + 1 项把 `test/archive-core.test.cjs` 的真执行单元测试并进来。静态部分按功能代次分组，分组标题里的版本号就是它们守护的那一轮改动，
可以在 `test/stability.test.cjs` 里直接按 `/* ---- … ---- */` 跳转。<!-- test-count:211 -->

- **归档与下载匹配**（开头）：BV/av 与旧版数字目录的识别、` - BV号` 后缀、媒体文件徽标判据、原生消息清单不带 `args`、宿主按 UTF-8 读设置。
- **表现层静态回归**（4.0，9 项）：设计令牌与图标、`[hidden]` 兜底、11px 字号下限、不用字符图标、扩展页不暴露给网页。
- **历代功能回归**：4.1 归档解析与浏览（7）、4.2 导入重构与展示（8）+ 归档整条重写（4）、4.3 安全加固（5）、4.4 更新视频状态与须知（9）、4.6 收藏库改造（18）、4.7 细节修复（6）、4.8 标记与站外搜索（5）、4.8.1 入口与分页（5）、4.8.3 美化（2）。
- **4.5 主题与多语言**（5 项）+ **多语言词典**（15 项）：深色令牌两处必须一致、文字对比度达标、`theme.js` 三种模式解析、`i18n.js` 原文回退与占位符、内容脚本走后台取词典且不碰宿主页面、`t()` 只能是字面量、真实文件名不得被译、`data-i18n` 与元素文字逐字一致、词典覆盖率。
- **4.9 全面修复**（18 项）：缓存单条淘汰、封面 URL 引用计数、不再定时重扫、筛选池按需重建、下载根目录缺失 ≠ 空、封面 WebP 与两代文件名、后台保活、风控识别、先封面后 txt、短页不算分页缺口、中止仍带日志、页面 412 必须退回、口径差额只说明不算失败、扫描进度不能写容器、默认下载目录按需创建。**（最后一条随 1.3.0 改了触发点：现在是在用户点「将下载到本地的视频放入收藏夹中」时按需建 `000视频下载`。）**

其中多项是**从生产文件里抽源码执行的**（`loadBackgroundFunctions` / 沙箱加载 `theme.js`、`i18n.js`、`formatCount`），测的是真正跑起来的那份实现，不是复制品。

**另外要清楚这套测试的盲区**：「每个脚本能否真正解析」那一项会用 `new vm.Script()` 把每个 JS 真编译一遍——文本级正则断言看不见语法错误，这条是专门补那个盲区的（4.8.2 真的靠它拦下过一次）。其余断言绝大多数是**读文件比对文本**，不是执行代码，所以它们能证明「约定没被违反」，不能证明「功能真的能跑」。改动逻辑之后仍然要在真机上验证。

另外在本地归档上跑一次体检（统计有多少条记录其实没有标签或简介）：

```powershell
node test/archive-audit.cjs "<你的本地备份文件夹>"
```

多语言的词条工具（改过任何界面文字之后都要跑）：

```powershell
node test/i18n-extract.cjs           # 列出全部待翻译词条
node test/i18n-extract.cjs --todo    # 生成 locales/_todo.json（交给翻译）
node test/i18n-extract.cjs --check   # 校验 zh-TW / en 覆盖了全部词条
```

**反向检查（改完界面文字一定要跑）**：

```powershell
node test/_unmarked.cjs
```

`i18n-extract` 只能证明「已经标记的能翻」，证明不了「该标的都标了」。`_unmarked` 扫描「含中文的字符串字面量、却没被 `t()` 包住」的位置，补上另一半。

**两个工具都会漏，别把 `--check` 全绿当成零漏译。** 已经证实的一类：**`BcaI18n.t("…")` 嵌在一段长模板字符串的 `${}` 里时，`i18n-extract` 提取不到**——`library.js` 详情面板拼 `UP 主主页` / `打开 UP 主主页` 的那一行就是（V1.0.0 才发现，两条都没进词典）。`test/stability.test.cjs` 里有一条**不依赖提取器**的断言直接扫源码，把每个 `t()` 字面量与词典比对，这类漏网由它兜住。4.5 就是靠它发现 `library.js` 有 74 处、`download.js` 有 46 处漏标记——界面看起来正常，但切到英文时那些文案纹丝不动。

它会有两类固定误报，看输出时要自己排除：

1. **归档格式键名**（`视频信息.txt`、`【基本信息】`、`BV号`、`分区`、`未知`…）——写进 `.txt` 的字段名，必须保持中文，**不能标**。
2. **匹配宿主页面的选择器**（`content.js` 里的 `添加到收藏夹`、`确定`）和**跨行模板字符串**——翻译了功能就坏，或只是脚本解析局限。

规律：**文案只要不是以字面量出现在 `t()` 或 `data-i18n` 里，就一定会漏。** 已经踩过两次：主题标签写在 `theme.js` 的对象里、内容脚本提示卡走 `showNotice(...)` 传参。

只读预览 4.2 的导入会抓到什么（不改任何文件，适合改完接口逻辑后先验证）：

```powershell
node test/import-trial.cjs "<你的本地备份文件夹>" 3
```

每次改动还应执行：

1. 对所有 `.js` 执行 `node --check`。
2. 解析 `manifest.json` 并确认脚本、弹窗等本地引用存在。
3. 检查每个 HTML 的本地 JS/CSS 引用存在，确认 `library.html` 在业务脚本之前加载 `archive-core.js`。
4. 若改动 PowerShell，使用 PowerShell Parser 解析所有 `.ps1`，不要仅靠运行安装脚本验证。注意本机执行策略禁止直接运行 `.ps1`，要用 `powershell.exe -NoProfile -ExecutionPolicy Bypass -File …`。
5. 读取 `manifest.json`、`settings.json` 一类 UTF-8 文件时显式指定编码，PowerShell 5.1 的 `Get-Content` 默认按 ANSI 读取，中文会乱码。
6. 改动本地目录打开助手时，重新运行安装脚本（沙箱验证可加 `-SkipRegistry -HostRoot <临时目录>`）并执行 `test-native-folder-opener.ps1`，它会真正按帧协议调用编译出的启动器。
7. 有条件时在 Chrome 加载扩展，登录 B 站验证收藏、导入、手动标记已下载、移动/删除和徽标状态。Node 检查不能替代真实 B 站登录/API 测试。

## 已知限制与历史背景

- B 站收藏弹窗、收藏夹 API、播放流权限和失效视频恢复来源可能变化；发生 API 变化时优先保留现有部分结果和错误报告，不要因单条失败中断整个批次。
- 失效视频只有在 B 站的 APP 收藏、稍后再看、观看历史或其他资料源中仍有记录时才可能恢复；无法找回时缺失字段用“未知”。
- Native Messaging 仅用于 Windows 资源管理器打开目录。它的清单不允许 `args`，`path` 必须是无参数可执行文件；没有安装或设置不正确时，网页不能直接启动 Explorer，详情页必须保留“复制视频目录路径”这类退路提示。
- 用户曾报告收藏成功但本地归档失败，并看到 B 站收藏弹窗提示 `The next() called multiple times`。另一次控制台网络错误指向 Kaspersky 浏览器组件的 `gc.kis.v2.scr.kaspersky-labs.com`。后者不是本项目域名；判断归因前需在禁用相关第三方扩展的环境中复现。不要把这类外部错误直接归为本扩展故障。
- 3.8 修复的两个本地目录打开助手缺陷都是运行时问题，Node 静态检查发现不了：一个是 Chrome 静默忽略清单 `args`，一个是 PowerShell 5.1 的默认 ANSI 读取。改动这一块必须跑 `test-native-folder-opener.ps1`，不能只做语法检查。
- 待确认（尚未定性）：`content.js` 在 MV3 隔离世界中读取页面变量 `window.__INITIAL_STATE__`，而清单未声明 `world: "MAIN"`，该变量很可能始终读不到，元数据实际走 DOM/meta 回退，自动归档的“分区/视频时长/视频发布时间/标签”容易落成“未知”。需要用一份真实的 `视频信息.txt` 核对后再决定是否改用其他采集方式。
- **归档数据本身的完整度**（4.1 实测一个上千条的档案）：只有约两成有标签、约四成有简介，将近一半两者都没有。根因是导入流程里 `normalizeImportMedia()` 把 `tags` 硬编码为 `[]`，且只有失效视频会去抓资料。4.1 负责把这些数据正确地显示出来，**4.2 负责在导入/更新时把它们抓全**——对已有档案执行一次「导入或更新」，缺失的标签、发布时间、粉丝数与互动数据都会被补上。
- **一个已证实的数据错误**：某条归档里 `UP主UID` 写的不是该视频作者的真实 `mid`（两者对不上；抽查另外 4 条记录都是对的），怀疑是收藏夹接口在个别条目上返回了错误的 `upper`。4.2 因为改从 `/x/web-interface/view` 取 UP 主信息，执行一次更新即可修正这类记录。
- 4.2 的导入会对每条视频发 2–3 个请求（view + tags + 每个 UP 一次的 relation/stat），**这是用户明确要求的完整抓取**。**注意速率在 4.3 已下调为串行 + 每条间隔 800ms**（原为并发 2 + 350ms）；如果将来风控变严，应先调 `IMPORT_DETAIL_CONCURRENCY` / `IMPORT_DETAIL_DELAY_MS`，而不是回到“只补缺失字段”的老逻辑。
- ~~3.7 的下载目录日志修复仍需真机验证~~ —— 那段代码随 1.3.0 的下载功能一起删除，此条只作历史记录。

### 已知限制（4.5）

- **后台文案不参与多语言**。`background.js` 是模块化 service worker，加载不了经典脚本；它产出的导入进度文本、错误消息、`001错误报告` 里的正文都固定为简体中文。界面显示处会对静态串做一次 `t()`（能翻的会翻），但带变量的动态串（例如「正在更新视频状态 3/20：xxx」）会保持中文。
  要做全的话，需要把后台改成回传**消息键 + 参数**、由界面渲染，属于一次独立重构。
- **报告文件不入词典**。`001错误报告/` 与 `视频信息.txt` 属于归档数据，保持单一语言便于长期比对。
- **`data-i18n` 只能用在纯文本元素上**。带图标或子元素的必须套一层 `<span data-i18n>`，否则 `textContent` 会把子元素清掉。
- **主题如何到达内容脚本（4.6 已解决，这里记做法）**。主题存在 `localStorage`（为了让页面在 `<head>` 里同步应用、不闪浅色），而内容脚本跑在 B 站页面里，读到的是**宿主页面的** `localStorage`，拿不到扩展的那份。4.6 的做法是：`theme.js` 在写 `localStorage` 的同时**镜像一份到 `chrome.storage.local`**，`content.js` 从那里读，两边靠异步对账保持一致。**4.5 时期提示卡只跟随系统，这个问题已经修好了**——不要再按「到不了内容脚本」去改。
- **繁体中文与英文词典由本项目的词条工具校验覆盖率**，**漏译不会报错、只会回退成中文**，所以要靠 `test/i18n-extract.cjs --check` 兜底。
## 合规与安全红线（4.3 确立，后续改动不得突破）

4.3 做过一次完整的安全与合规审计，结论与约束记录如下。

**合规事实**：本项目会代替用户自动请求 B 站接口（导入收藏夹、抓取视频资料），触碰《哔哩哔哩弹幕网用户使用协议》**4.3.15**（禁止以任何自动程序/脚本获取平台服务、内容、数据）与 **1.3**（官方途径是唯一合法方式）。协议没有为个人自用归档留例外；后果条款是 **2.6 / 8.3**（可删除账号、暂停或永久停止服务）。**1.3.0 起下载功能整体移除** —— 不再请求视频流地址、不再保存视频本体，manifest 的三条视频流域名权限也删掉了，所以条款 **1.2**（服务与平台分离）只剩「用户自己下载的文件」那一头。**真正的法律风险在用户分发文件的那一刻**，因此 README 必须保留「合规与使用边界」一节。

**由此确立的硬约束**：

1. **导入必须保持低速**：`IMPORT_DETAIL_CONCURRENCY = 1`、`IMPORT_DETAIL_DELAY_MS >= 600`（当前 800）。测试会断言每秒请求数 ≤ 2。**不要为了性能调回去**；要提速请先和用户确认。
2. **失效视频恢复必须保持可选**：它伪造成官方 iOS 客户端（`platform: ios, mobi_app: iphone`）请求 APP 接口，是合规上最勉强的一环。**用户已明确要求 4.4.1 起默认开启**，因此默认值改为开，但**开关必须保留**——`enrichImportedInvalidVideos()` 只能被 `recoverInvalidVideos` 包住调用，用户取消勾选后必须真的不执行。
3. **不得新增写操作**：全项目只有 GET。任何 POST/PUT/DELETE 都可能改变用户线上账号状态，属于必须避免的类别。
4. **不得新增第三方域名**：出网只能到 `api.bilibili.com` 与 `*.hdslb.com`（图片 CDN）。**1.3.0 已把 `*.bilivideo.com` / `*.bilivideo.cn` / `*.akamaized.net` 这三条视频流域名权限从 manifest 里删掉，公开版本不得加回来** —— 那是「插件有没有取流能力」在代码层面唯一的硬证据。不要引入任何统计、遥测、CDN 或"更新检查"。
5. **不得引入远程代码或 npm 依赖**：无 `eval`、无 `new Function`、无动态插标签；MV3 默认严格 CSP。
6. **扩展页不得对网页开放**：不要重新添加 `web_accessible_resources`；需要从内容脚本打开扩展页时，走 `bca-open-library` 让后台 `chrome.tabs.create`。`library.js` 顶部的 `window.top !== window.self` 防嵌套检查必须保留，且早于任何目录读取。
7. **错误报告必须带提示行**：`ERROR_REPORT_NOTICE` 常量与 `persistErrorReport()` 的兜底拼接不要删，报告里含本地路径与视频链接。
8. **不得绕过出网限速**：所有 B 站接口调用必须走 `biliImportApiGet()`，那里有全局最小间隔（`BILI_MIN_REQUEST_INTERVAL_MS`）。**不要在别处写裸 `fetch` 打 B 站接口，也不要把间隔调小。** README「使用须知」第一条就是“请勿滥用：插件会代替你请求 B 站接口，请求过密可能触发风控，导致 IP 或账号被临时限制”—— 这不只是给用户看的提示，是**开发时必须遵守的约束**。

   2026-10-10 就因为一个新功能（「最近 N 天」先拉全 71 页再过滤，在服务端看来和全量导入毫无区别）把开发者本人扫进了风控，停了好一阵没法继续测。**加任何会多发请求的功能之前，先算一遍它会产生多少次请求**：

   | 操作 | 请求数 |
   |---|---|
   | 读一个收藏夹的列表 | `条数 / 40` 次 |
   | 抓一条视频详情 | 1 次（限速 1.25 秒/条） |

   算不清就先别写。**“看起来只同步一点点”不等于“请求少”** —— 这正是我犯的错。
   ```powershell
   Select-String -LiteralPath background.js -Pattern 'fetch\('   # 除 biliImportApiGet 内部外应为空
   ```
9. 改动以上任一项前，先回到这一节确认，并在汇报里说明原因。


## 修改原则

1. **README 版本历史的写法（用户 2026-10-10 定的规矩）**：

   - **较大改动必须写清楚**：bug 修复、新功能、行为变化 —— 写"改了什么、为什么改、对用户什么影响"。
   - **小改动一行带过就行**：界面微调、小优化，不用展开。
   - **小到不值得单独发版的，就别发版** —— 直接提交、不打 tag，自然也不需要小节。这一条是关键：**不打 tag 就不会有缺环问题**。
   - **但凡是打了 tag 的版本，README 里必须有 `## V<版本>：...` 这一节（标题 + 至少一行）**，否则时间线会断。这条以前没写下来，结果 V1.1.4 到 V1.1.13 之间漏了 9 个版本：`git tag` 有 16 个而 README 只有 5 个，而漏掉的那几个恰恰是风控这一整轮最要紧的改动。**`release.ps1` 会检查这一节在不在，没有就拒绝发布。**
2. **发布走 `release.ps1`，不要手工改版本号**。它会检查工作区与代理 → 改 3 处版本号 → 跑全部检查 → 不过就回滚 → 提交 → 打 tag → 推送。用法（**版本号不带 `V` 前缀，位置参数**）：`powershell -NoProfile -ExecutionPolicy Bypass -File .\release.ps1 1.3.0 "说明" -Yes`，推送前先设 `HTTPS_PROXY` 与 `HTTP_PROXY=http://127.0.0.1:7897`。发布前照 `SMOKE_TEST.md` 走一遍真机验证。
3. 先读本文件、`README.md`、相关页面和消息两端，不要只改单侧响应协议。
4. **本地文件格式的向后兼容 —— 分两个阶段，这是一个开关（用户 2026-10-11 补充）**：

   - **测试期（现在）：不必考虑兼容性。** 插件尚未正式上线，只有用户本人在测试。用户原话：「目前这个插件没有正式上线让很多用户使用，只是我在测试，因此在更新和修补时暂时不必考虑老版本兼容性问题，老版本遗留的一些问题可以直接修改，我可以从头测试」。所以遇到历史包袱（旧字段名、旧目录布局、旧判据、改名遗留的旧键）时**可以直接改掉**，不要为了假想的兼容性而保留坏设计。
   - **正式使用期（起点由用户通知）：必须兼容。** 用户会告知「从哪个版本开始以后是用户正式使用版」；从那以后，改动必须考虑会不会不兼容老版本已归档的备份、会不会与老版本冲突 —— 即下方原有的那组约束（时间目录、`视频信息.txt` 字段名、`000视频下载`/`001错误报告`、历史 `未分类收藏` 下载）。

   **在收到用户的口头通知之前，一律按测试期处理。这是开关，不是永久豁免。**
5. 目录删除、移动、覆盖属于数据操作；保持显式确认，复制失败时回滚新建目录，不删除未被明确选中的下载文件。
6. **改 `release.ps1` 之前先读这条**：PowerShell 5.1 下，**原生命令写到 stderr 的内容会被包装成 ErrorRecord**，配合脚本顶部的 `$ErrorActionPreference = 'Stop'` 会**直接终止脚本 —— 即使那条命令其实成功了**。`git push` 的进度、`node --check` 的语法错误、git 的各种警告全都写 stderr。V1.1.0 发布时就踩了这个：推送明明成功、tag 和 main 都到位了，脚本却报"推送失败"并 `exit 1`。**所以脚本里所有原生命令都必须走 `Invoke-Native`**（它把 stderr 降级成普通字符串），正确性一律靠 `$LASTEXITCODE` 判断。加了新的 git/node 调用后，用这条查有没有漏网的：
   ```powershell
   Select-String -LiteralPath release.ps1 -Pattern '& \$Git|& \$Node'   # 除 Invoke-Native 内部外应为空
   ```
   这个坑有个便宜的复现方式：`git push` 一个已经推完的分支，git 会往 stderr 写 "Everything up-to-date"。
7. **在对话框里用 `<label>` 当布局容器时，选择器必须带 `.editor-dialog` 前缀。** `library.css` 有一条 `.editor-dialog label { display: block; ... }`，特异性是 (0,1,1)，会盖掉任何单类选择器 (0,1,0) 的 `display: grid/flex` —— 表现是"勾选框和图标在上、名称和数量在下"的错位。V1.1.0 的「移动或复制」踩过一次（当时用 `!important` 顶了 margin/color/font-size/font-weight，**偏偏漏了 display**），同一个坑还埋着 `videoDialog` 里的 `target-checkbox-option`。测试里有一条专门盯这个，改这些组件的选择器前先看它。
8. **加了按钮或对话框，立刻把事件绑定写上，并跑测试确认。** 这个项目在这上面栽过两次，都是用户点下去发现没反应才暴露的：V1.1.0 的「与 B 站对比」只写了按钮没写 `addEventListener`；V1.1.3 的对比结果对话框又漏了「关闭」。现在 `test/stability.test.cjs` 里有一条兜底：**凡是 `<dialog>` 里的 `<button id="x">`，`x` 必须在对应 JS 里出现过**（`getElementById` 或 `x.addEventListener` 都算），完全没出现就判定没人管它。新增对话框按钮后跑一遍测试即可。
9. 界面改动遵守上文“界面与设计系统”的六条约定；改完跑 `node test/stability.test.cjs`，它会拦住字号回退、字符图标复活和页面漏引 theme.css/icons.js。
10. 原生消息清单绝不添加 `args`；`.ps1` 与 `.cs` 源文件保存为 UTF-8 带 BOM，读取 UTF-8 配置时显式写 `-Encoding UTF8`。改完本地目录打开助手要重新编译并跑自检脚本。
   **注意：通用的文本编辑工具会静默去掉 BOM。** 2026-10-10 改 `release.ps1` 时就发生过一次——编辑后前 3 字节从 `239,187,191` 变成了 `60,35,10`。**用工具改完任何 `.ps1` / `.cs` 之后，都要重新确认 BOM 还在**，否则 PowerShell 5.1 解析中文会出错：
   ```powershell
   $b = [System.IO.File]::ReadAllBytes('release.ps1'); $b[0..2]
   # 必须是 239 187 191；不对就重写一遍：
   $t = [System.IO.File]::ReadAllText($p, [System.Text.Encoding]::UTF8)
   [System.IO.File]::WriteAllText($p, $t, (New-Object System.Text.UTF8Encoding($true)))
   ```
    **用 node 脚本重写 `.ps1` 时要当心「BOM 变成两个」**：`fs.readFileSync(p).toString("utf8")` **会把 BOM 留在字符串里**，再 `Buffer.concat([BOM, Buffer.from(text)])` 就写出两个 BOM —— PowerShell 5.1 会把多余的 BOM 当正文，整份脚本报一串 `Unexpected token`（1.5.0 发布时踩过，`release.ps1` 直接跑不起来）。正确做法是**先把字符串开头的 `\uFEFF` 去掉、再补一个 BOM**。检查时除了「前 3 字节是 `239,187,191`」，还要看**第 4 个字节不是 239**（连续两个 BOM 的判据）。

11. 完成后报告改动内容、检查方式和未验证的真实环境行为。

12. **要画界面示意图（教程页、帮助页）时，按真实截图的细节画，不要在这些地方省。**（用户 2026-10-10 定的标准）

    第一版教程页是被退回来的："这个 html 和实际截图还是有一点出入，特别是第 2 到第 4 步，有没有办法使其更真实一点，更像截图"。原因是我只画了"能看懂的最小骨架"——一条地址栏、一行文件名、一个空白框——而真实界面上还有标题栏、导航箭头、命令栏、搜索框、侧边栏、列头、按钮行、开关、角标。**省掉这些，用户第一眼就会觉得"这不是我看到的界面"，教程也就失去了作用。**

    具体要做到：
    - **资源管理器**：标题栏与标签页、前进后退箭头、命令栏（新建 / 剪切 / 复制 / 重命名 / 删除 / 排序 / 查看）、搜索框、左侧「此电脑」树、列头、内容区（含"此文件夹为空。"这类空状态）。
    - **`chrome://extensions`**：顶栏「扩展程序 / 开发者模式」、图标右下角角标、版本号、简介、**检查视图：Service Worker**、底部「详情 / 移除」按钮与刷新图标、开关。
    - **终端**：真正的黑底（`#0c0c0c`）+ Consolas 等宽 + `C:\WINDOWS\system32\cmd.exe` 标题栏；成功字样用绿色（`#16c60c`），说明文字用深灰，末尾留一个光标。
    - **Windows 界面的颜色单独定义一套 `--win-*`，不跟随扩展主题**：真实截图里这些窗口在深色主题下依旧是浅色的，跟随主题反而不像。唯一的例外是黑底终端，它本来就是黑的。

    两条约束不变：**示意图一律用 HTML/CSS 画，不放真实截图**（截图里会有用户名、本机路径和扩展程序 ID，而这是公开仓库；示例路径写成 `<你的用户名>`，ID 用圆点遮住）；**不引入任何图片文件**。

13. **改 `library.css` 里的 `z-index` 之前，先确认那个元素到底在哪个层叠上下文里比大小。** V1.2.2 修过一个典型：`.topbar`（`position: sticky; z-index: 1`）自建层叠上下文，而卡片徽标挂在 `.card-cover` 上 —— 它只有 `position: relative`、**没有 z-index**，所以**不自建**层叠上下文，那些 `z-index` 是拿到**根**上下文里和顶栏比的。于是同为 1 时由 DOM 顺序决定，排在后面的卡片徽标把吸附顶栏盖住了（往下滚就能看见）。**「没有 z-index 的 `position: relative`」不等于「自成一层」**，这是最容易看错的一处。

    现在这个文件的层级是：卡片徽标 1~3 < **顶栏 4** < 详情遮罩 5 < 悬浮球/详情面板 6 < 开源横幅 7 < 确认框 8 < 通用对话框 10。改动前先想清楚新值插在哪一段里。测试里有一条直接读 CSS 比大小：顶栏必须**严格大于**每一枚封面徽标、且低于详情遮罩。

14. **把一栏「钉住」（`position: sticky`）时，必须在收成单栏的媒体查询里把它改回 `position: static`。** 栏一旦吸附，窄屏合并成单栏时它会悬在内容上方、盖住后面的东西。**这条规则的来源是 V1.2.3 的下载页两栏（左设置 / 右进度），那张页面已在 1.3.0 删除** —— 规则本身继续适用于任何新的多栏布局：写一处 `sticky` 就配一处 `static`。

15. **把一个「已经静态渲染好的元素」改成链接（V1.2.4 把详情面板的封面和标题做成链接）时，有三处会静默出问题，全都不会抛错。**
    1. **没有链接可给时必须退回原来的非链接元素。** 封面原本是 `<div class="detail-cover">`，改成 `<a>` 后如果无条件渲染，老存档（归档里没记 URL、又不是失效视频）就会拿到 `href=""` —— 那是「当前页面」，点一下把扩展页自己导航走。正确做法是两条分支：有链接渲染 `<a class="detail-cover detail-cover-link" …>`，没有链接原样渲染 `<div class="detail-cover">`。测试同时钉住这两条分支。
    2. **`querySelector` 只认外层 class 会把新加的 `<a>` 里的文字清空。** 模板从 `<h2 class="detail-title"></h2>` 变成 `<h2 class="detail-title"><a class="detail-title-link"></a></h2>` 之后，原来那句 `detailContent.querySelector(".detail-title").textContent = video.title` 会把 `<a>` 整个替换成纯文本 —— 标题还在，**链接没了**，而且不报错。要写成 `(querySelector(".detail-title-link") || querySelector(".detail-title"))`，谁在就写给谁。
    3. **`<a>` 默认是行内元素，套在靠 `aspect-ratio` 撑高度的容器上必须补 `display: block`。** `.detail-cover` 只写了 `overflow: hidden; aspect-ratio: 16 / 9; border-radius`，给 `<div>` 用时没问题；换成 `<a>` 后不补 `display: block`，16:9、圆角和失效视频那层 `::after` 遮罩会一起塌掉。失效遮罩 `::after` 依赖 `.detail-panel.invalid-video .detail-cover { position: relative }`，这条对 `<a>` 同样成立，不用改。

    样式上只补悬停反馈（标题变品牌蓝 + 下划线，失效视频保持红色只加深一档），**不悬停时标题仍是原来的深色大字**——不要为了「看起来像链接」把标题常驻染蓝，那会让整个详情面板花掉。跳转一律 `target="_blank"` + `rel="noopener noreferrer"`，和标签链接同规矩：普通链接跳转不需要任何 host 权限。

16. **同一个设置不要在 `chrome.storage` 里另存一份副本 —— 权威只有一处，副本一定会过期。**（V1.2.5 修的就是这个）
    1. 备份文件夹的权威是 IndexedDB（`bili-fav-archiver` / `settings` / `rootHandle`），弹窗和收藏库读的是同一个句柄，名字就在 `handle.name` 上。曾经另外往 `chrome.storage.local.baseFolderName` 写一份给弹窗显示，而那份只有弹窗自己换目录时才更新 —— 于是在收藏库里换了目录，弹窗还显示上一个名字。**现在 `baseFolderName` 已从全部代码里删掉**（弹窗的 `refreshStatus` 改读 `rootHandle?.name`）；别再加回来。
    2. **`chrome.storage.local` 存在，是为了跨页面通知，不是为了存数据。** IndexedDB 没有跨页面变更事件，所以换目录时顺手写一个时间戳 `rootHandleRevision: Date.now()`，另一边 `chrome.storage.onChanged` 收到就回去重读句柄：弹窗只更新名字那一行（`syncFolderLabelFromHandle`，不动导入进度和上次结果），收藏库换名字 + 清占用体积和绿点 + 提示刷新（`syncRootFromStorage`）。
    3. **收到信号的一方要能认出「这是我自己刚写的」。** 收藏库自己换目录时 `chooseAndScan` 会 `setBusy(true)` → `saveHandle` 写信号 → 自己又收到通知；`setBusy` 里把 `busyNow` 一起记下来，`syncRootFromStorage` 开头 `if (busyNow) return` 就避开了自触发。名字没变时也要直接返回，否则每次保存句柄都会白扫一遍目录。
    4. **换目录后不要自动重扫。** 重读整个目录可能很慢，而且当前的筛选、排序、打开的详情不该被一次改名重置 —— 提示用户点「刷新」即可。

17. **「防连点」的占位账，放掉它的时机就是「它会不会挡住你自己」的分界线。**（V1.2.6 修的就是这个：导入和更新从 V1.2.0 到 V1.2.5 全坏，一点就报「已经有一轮导入正在进行」，而「对比差异」「下载」不走这条队列、完全正常，所以很容易被当成个别按钮的问题放过去）
    1. 导入这条链路上有两个标记：调用方在**同步代码**里记的「队列里压着一轮」（`importPending`），和任务出队时置位的「正在跑」（`importRun.active`）。消息处理器里那三行的顺序是硬要求：**先查（`if (importPending > 0 || importRun.active)`）→ 再记账（`importPending += 1`）→ 最后入队（`importBiliFavoritesInOrder(...)`）**。
    2. **账要在「出队」那一步放掉，不能等任务跑完。** 原来写成 `task.finally(() => { importPending -= 1 })`，而任务出队后的第一件事就是 `claimImportRun` —— 它看到的是这轮自己刚记下的那笔账，于是每轮导入都被挡在门口。现在 `importBiliFavoritesInOrder` 的 `saveQueue.then` 回调里第一行就是 `importPending = Math.max(0, importPending - 1)`；`importBiliFavorites` 里 `claimImportRun()` 仍在任何 await 之前，出队到 claim 之间没有 await，连点插不进去。
    3. **两个条件缺一不可**：`importPending > 0` 挡「已排队但还没开始跑」那一段（这段里 `active` 还是 false），`importRun.active` 挡「正在跑」。少任何一个，连点第二次都能排进队列、等第一轮结束再跑第二轮。
    4. **这种 bug 只按源码文本断言钉不住。** 问题全在「谁先谁后」上：写法一模一样、顺序错了照样出事，正则看不出区别。`test/stability.test.cjs` 里「导入占位」那条是把消息处理器分支、`claimImportRun`、`importBiliFavoritesInOrder` 三段**从 `background.js` 里抠出来真跑一遍**（`new Function` + 桩 `chrome` / `logError` / `sendResponse`），断言「一次普通导入要成功」「中途再点要被拒」「被拒的那次不留账」。抠出来的那段控制流要尽量照抄真实代码（连报错文案都用正则从文件里抓），别在测试里手写一份「等价逻辑」。

18. **`const` 声明别落进 `try` 块 —— 这是 `node --check` 过、静态断言也看不见的一类 bug。**（V1.2.7 修的就是这个：V1.2.0 为了给「取根目录 → 查授权 → 查勾选」分错误类型把这段包进 `try`，`const root = await getRootHandle();` 一起进了块作用域，try 一结束 `root` 就没了，导入走到「建收藏夹目录」那一步抛 `ReferenceError: root is not defined`。它被 V1.2.0–V1.2.5 那道导入自锁挡在门外，一直没暴露，修好自锁之后才露头）
    1. **`try` 只是用来分错误类型的，别把后面还要用的变量声明在里面。** 需要跨块用就在函数开头 `let x;`，块里只写 `x = …`。`try` 结束销毁的是块作用域，不是变量本身。
    2. **报错长什么样：** `ReferenceError: root is not defined`，栈指向真正用到它的那一行（不是声明那行）—— 所以「哪一行报错」和「哪儿写错了」是两个地方，顺着栈往上找一个在 `try` 里声明的 `const` 就是元凶。
    3. **写这种修复的静态回归时，判据要用「行首（允许缩进）的 `let/const`」，别用裸正则。** 注释里也会出现同样的字（比如解释这个坑的注释就写着 `const root`），裸 `/\bconst root\b/` 会把自己绊倒。同理，比「声明在不在 try 之前」不能用 `indexOf("try {")` —— 函数开头可能还有别的 `try`，要用 `lastIndexOf("try {", 赋值位置)` 取最近的那个。
    4. **同一段控制流里连续两个 bug（V1.2.6 的先后顺序、V1.2.7 的作用域）说明：改完一处要把整条路走通再收工**，否则前一个 bug 会把后一个藏起来，用户看到的就是「修了一版还是不能导入」。

19. **「内容有没有变」的比较里不能夹着每次都会变的字段 —— 否则永远判成「变了」。**（V1.2.8 修的就是这个：`视频信息.txt` 第二行是 `信息保存于：<抓取时的时间>`，由 `buildInfo` 的 `savedAt` 现写；`refreshImportedRecord` 原本直接 `refreshedText !== original` 比原文，于是每次导入都判定"变了"、重写一遍、计入「更新 N」。用户看到的现象是「6 个视频的收藏夹每次导入都报更新 3」。）
    1. **任何"要不要写盘 / 要不要计数"的比对，先把易变字段抹掉再比。** 这一版加了纯函数 `importStableInfoText(text)`（`background.js`，正则在 `refreshImportedRecord` 上方），只做一件事：删掉 `^信息保存于：.*$` 那一行。比对走 `importStableInfoText(refreshedText) !== importStableInfoText(original)`。
    2. **别把"易变"当成"没意义"就一并删掉。** 那行时间戳仍然要写，只是它的语义变了：从「每次摸一下都刷新」变成「资料真的变了才往前走」。这类字段的正确处理是**比对时剔除、写盘时保留**，不是不写。
    3. **「占位值」也要分两种 —— 判"要不要再抓一次"时它们的答案相反。** 符号类（`-` `--` `—` `/`）是「B 站这段本来就是空的」，再抓一百次还是同一个符号，刷新它纯属白写文件；词类（`未知` `无` `暂无` `N/A` `null`）多半是「上一次没取到」，值得再试。所以有了 `importPlaceholderWorthRetry()`（`background.js`，紧挨 `importIsPlaceholder`）。
    4. **`importPlaceholderWorthRetry` 不能拿去替换 `importIsPlaceholder`。** 后者问的是「这段文字算不算占位」，`refreshImportedRecord` 里 `importIsPlaceholder(favoriteAtText)` 判的是「收藏时间能不能解析」—— 那里纯符号也必须算占位，否则一条收藏时间写着 `-` 的记录会被改写成"现在"。**同一个词在两个场景含义不同时，宁可加一个名字说明区别的新函数，也别改那个共用的。**
    5. **真机现象别只信"占位"这一个词。** 一开始按"3 条都是 `-`"推断，实际跑一遍归档才看清：2 条是 `未知`（摘符号根本治不到），真正的持续改写来自那行时间戳。**对着用户真实目录跑一遍诊断脚本，比读代码推演可靠。**

20. **「关掉之后就不算还在」—— 查询「当前在做什么」的函数，不能只看「上次是哪一条」的记录。**（V1.3.1 修的就是这个：`closeDetail()` 不清 `detailContent.dataset.videoId`，而 `detailVideo()` 只认那个 id，于是任何「重画一遍界面」的动作都会把用户早就关掉的详情重新 `openDetail` 出来。两个入口都能撞上：在收藏库里切语言触发 `BcaI18n.onChange`；在弹窗里切语言写的是同一个 `interfaceLocale`，收藏库的 `chrome.storage.onChanged` 收到通知后同样走这条路。）
    1. **状态要从「现在的样子」推，不要从「最后一次设置的值」推。** 修法是给 `detailVideo()` 加一关：`if (!detailPanel.classList.contains("open")) return null;`。DOM 上的 `class="open"` 才是权威，`dataset.videoId` 只是「上次开过哪条」的历史。**凡是"重新渲染一遍 / 刷新一遍"的代码路径，都会把这类历史值当成现状** —— 所以这种函数要么读真正的现状，要么在关闭时把历史清掉（两处只做一处也不算错，但别只做历史那半边）。
    2. **同一个设置改了，别的已打开页面会收到通知 —— 写"重画界面"的代码时要假设自己是在这种被动场景里被调用的。** `chrome.storage.onChanged`（`library.js` 收 `BcaI18n.STORAGE_KEY` 与 `rootHandleRevision`）与 `BcaI18n.onChange` 都不是用户手点的按钮；出问题时用户看到的是「我什么都没点，它自己弹出来了」，最难往这条路上想。

21. **每一个界面都必须接入多语言，漏一个页面就是「整个插件都没翻译」的观感。**（V1.3.1 修的就是这个：`guide.html` 从建立起就没接过 `BcaI18n`，语言切成繁體中文或 English 只有它一动不动。使用说明又是新手最先打开的一页。）
    1. **接入方式固定四件套**：页面加载 `i18n.js` → 界面文字加 `data-i18n` / `data-i18n-html`（属性值写简体中文原文，一字不差）→ 词条补进 `locales/zh-TW.json` 与 `locales/en.json` → **把该文件加进 `test/i18n-extract.cjs` 的 `SOURCE_FILES`**。漏掉最后一步，这个页面以后缺词条也不会有任何测试报错。
    2. **`data-i18n` 是拿 `textContent` 覆盖的**，所以属性值必须与元素里的文字逐字一致（比较前只把空白归一化），而且**带子元素的元素只能用 `data-i18n-html`**，否则子元素会被整块清掉。`test/stability.test.cjs` 的「every data-i18n marker matches its element text exactly」专门拦这两种错。
    3. **不翻译数据。** 视频标题、UP 主名、简介、标签、示例目录名这类固有名称一律保留原文（`i18n.js` 顶部写着这条规矩）。`guide.html` 的演示卡片里有示例标题和示例收藏夹名，切语言时它们不该跟着变。
    4. **`<title>` 不在 `data-i18n*` 的能力范围内**（那套属性只能写元素的 `textContent` / `innerHTML` / `title` 属性 / `placeholder` / `aria-label`），页面标题要在 JS 里 `document.title = BcaI18n.t("…")`。
    5. **拟态「别的软件」的部分不翻译。** 使用说明与安装教程里都有 Windows 资源管理器、cmd 黑窗、`chrome://extensions` 的拟真卡片 —— 那些画的是**用户自己系统语言下的其他软件**，不是本插件的界面（安装脚本真实打印的就是中文），切语言时它们保持简体中文。判据是「这块字是谁的界面」：本插件自己画的界面（弹窗、收藏库、详情面板、浮标）跟着语言变，别家软件的界面、目录名与示例数据都不变。

22. **一个入口开新标签页时必须给退路；设置类改动要「就地生效、人留在原地」。**（V1.3.2 把右下角三个浮标收成一个齿轮、点开独立设置页 `settings.html`。）收藏库那个齿轮只是**入口**，真正的设置在别的文档里，于是有三条硬要求：

    1. **新标签页要能退出去。**「返回收藏库」不能只写 `<a href="library.html">` —— 那会把当前这个标签页变成第二个收藏库。正确做法是**就地导航**：`chrome.tabs.getCurrent` 拿到当前标签，再 `chrome.tabs.update(tab.id, { url: chrome.runtime.getURL("library.html") })`，拿不到 tab 时退回 `window.location.href = url`。（V1.4.1 之前写的是 `window.close()` + 兜底，真机上报过「点返回收藏库只把设置页关掉了、人没转过去」—— 关标签页只在「上一个被激活的标签恰好是收藏库」时才看起来正确，别再用。）`tutorial.js` 的关窗按钮保持两道兜底不变（它是弹出来的小窗口，关掉才是对的）。
    2. **改设置不许把页面带走。** 设置页里切换主题 / 语言只改状态、重画选中态（`aria-pressed`），不导航、不 `window.close()`、不刷新 —— 测试会数 `window.close()` 的出现次数并断言它只出现在「返回收藏库」那一个处理器里。
    3. **跨页同步不要新增信号。** 语言走 `library.js` 原有的 `chrome.storage.onChanged`（`interfaceLocale`，**必须带 `next === BcaI18n.locale()` 自触发防护**，否则自己写的值会绕回来重画一遍）；主题走 `theme.js` 的 `localStorage` `storage` 事件（它只在别的文档里触发）；设置页两处选中态一律从 `BcaTheme.current()` / `BcaI18n.locale()` **现推**，不记「上次是谁点的」。
    4. **共享控件放 `theme.css`。** `.segmented`（分段控件）原来只写在 `popup.css` 里，设置页要用就把它挪进 `theme.css` 当公共组件 —— 别在 `settings.css` 里再抄一份，两份迟早会走样。图标用 `icons.js` 里的 SVG（新增 `settings`），**不要用「⚙」这种字符**：字符当图标在不同字体下大小、基线都不一样，`test/stability.test.cjs:165-172` 已明确禁止。

23. **铺了全屏背景图以后，每一个贴在照片上的「面」都要自带底色。**（1.4.0 加自定义背景时定。）任何没有底色的文字都会直接压在照片上，滚动时尤其难看：设置页的 sticky header、页脚说明、收藏库空状态的大标题都属这一类。做法是把它放进卡片，或者给那一层补 `background: var(--surface)` / 半透明 + `backdrop-filter`（**不透明时也必须能看**）。**不要**用「给整页再盖一层黑/白」来代替——那会把卡片一起压暗。

24. **「删除 / 中断 / 超时 / 限流」这四类边界要在写的时候就一起想，别等审查。**（V1.4.2 修上线前审查第一批时定，八处都是这四类的变体。）
    1. **凡是递归删除用户看得见的目录，删之前先确认那是插件自己写的。**（P1-1）判据是 `collectionDownloadDirectoryLooksManaged()`：里面每一项都必须是 `xxx - BV号` / `xxx - av号` 形式的子目录（用 `archive-core.js` 的 `identifiersFromDirectoryName`），认不出来就整个不删、并计入 `downloadCleanupFailures`。**宁可留着让用户自己删，也不能误删别人的东西** —— 后端的 `removeEntry` 不进回收站，删了就没了。
    2. **凡是给用户看的承诺，不能指向一个点不到或已经过期的能力。**（P1-2）「回滚日志已保存在本次浏览器会话中」这句话在 V1.4.2 被删掉：日志只存在 `chrome.storage.session`、关掉浏览器就没了，而回滚入口早就不存在（没有调用者的死代码）。**改掉行为时，连带把承诺一起改。**
    3. **凡是跨页面/跨进程等待的队列，等待必须有上限，并且要能说清为什么没执行。**（P1-3）`runInSaveQueueWithDeadline()` 超时返回 `{ok:false, busy:true, message:"本地队列正忙…"}`，同时把这条收藏记进 `pendingFavorite` 以便重试。MV3 的 Service Worker 随时会被回收，**挂在队列里等着的条目等于已经丢了**。
    4. **凡是收尾（成功 / 取消 / 风控）都要先把「已经跑完」写进持久状态，再清理。**（P0-1）`finishImportRunSnapshot()` 先写 `{active:false, finished:true}` 再删键 —— 否则收尾那几个 `await` 之间被回收，快照会停在「有一轮正在进行」，下次启动就把**已经成功**的那一轮当成中断。判据侧同理：`leftover.active !== true` 时不能宣告中断。
    5. **纯本地的长循环也要保活**（P1-4：`keepServiceWorkerAlive("scan"/"refresh")`），`uniqueTimeFolder` 撞到同名**文件**（`TypeMismatchError`）要换后缀继续而不是抛错（P1-6），风控码 `IMPORT_RATE_LIMIT_CODES` 是 `{-412, -352, -509, -799}` 而恢复扫描撞上要整轮停（P1-8）。
    6. **发分发包用 `pack.ps1`，别手工压 zip**（P2-21）：它排掉 `.git` / `test/` / 三份 md / `release.ps1` / `pack.ps1` / `.node-path`，并在打包前断言「清单完整、开发文件没混进去」。
    7. **`release.ps1` 的 README 小节守卫是拿 `git tag` 全量比对的**（不只是本次要发的版本）—— 起因是 V1.4.0 的整节标题被一次编辑误删，而当时发的是 V1.4.1，隔了两个版本才发现。**编辑 README 时不要动 `## V<版本>：` 这一整行**；`test/stability.test.cjs` 里另有一条断言要求这些小节从新到旧排列、且 `## V1.4.0：` 必须存在。
    8. **开发阶段只要代码，不要 Release、不要桌面 zip**（用户 2026-10-14 明确要求，原话「现在插件还在测试开发阶段，不用上传 release，只需要上传代码就行了，以后不用在我桌面上生成 zip 了」）：`release.ps1` 照跑（它就是「提交 + 打 tag + 推送」＝上传代码），**不往 GitHub 建 Release、不把安装包传进 Release、也不再跑 `pack.ps1` 往桌面写 `bili-vault-<版本>.zip`**。注意 `release.ps1` 本身不建 Release（`api.github.com/.../releases` 一直是空的，V1.6.0–V1.6.5 都只有 tag），所以别再提醒用户「把 zip 传到 Release 页」—— 只有用户当面要安装包时才 `pack.ps1`，打完当场交给他。
    9. **收工要关掉临时起的浏览器与预览进程**（用户 2026-10-15 要求，原话「下次在你完成工作后关掉浏览器后台任务」）：验收用的预览服务器（`node b_catch\_lead-preview.cjs`，8793）和 `bsk` 浏览器会话都是临时脚手架 —— 交付／答复之前用 `job_kill` 停掉后台作业、`bsk_session stop` 关掉会话（`bsk_session list` 确认没有残留），别把它们留在用户的任务面板和会话列表里。
25. **「同一件判断散在多处」与「给用户看的假状态」是第二批审查里两种反复出现的病。**（V1.4.3 修上线前审查第二批时定。）
    1. **同一份名单/同一类判断只能有一处。**（P2-3）「保留目录名」原来在手动添加、导入两处各写一遍，自动归档那条链路就漏了 —— B 站收藏夹真叫「001错误报告」时，视频会被写进报告目录。现在只有 `RESERVED_COLLECTION_NAMES` + `collectionNameIsReserved()` 一处，**新增任何「写进用户备份文件夹」的入口时，先 grep 这个函数**。
    2. **判断「某件事还在不在跑」要用最紧的那条依据，不要用时间窗口。**（P2-6）内存里的 `importRun.active` 才是真相，`chrome.storage.local` 里的 `running: true` 只是残影。原来要求残影的 `updatedAt` 超过 90 秒才复位，于是浏览器重启后的前 90 秒里，弹窗一直显示「导入中」、暂停/取消按钮都在，点了却只回「当前没有正在进行的导入」—— **恰恰在最需要自愈的那段时间里给用户看假状态**。现在的判据是「`chrome.storage.session` 里有没有 `active: true` 的快照」，没有就立刻复位。
    3. **文案不许把「不再等待」说成「已取消」。**（P2-7）`withQueueDeadline` 超时只是不等了，任务仍然在队列里、仍然会写回 `视频信息.txt`。原来说「本次状态更新已取消」，用户以为没发生，其实稍后就改了盘。**凡是「放弃等待但任务还在」的情况，文案必须写清它还会继续。**
    4. **一条注定无效的提示等于没有提示，而且比没有更糟。**（P2-18）对比差异缺 UID 时，原来的提示是「请先打开一次自己的 B 站收藏夹页面」——但 `chrome.tabs.query({url})` 在 manifest 没有 `tabs` 权限时拿不到标签页 URL，照做也没用。**提示必须指向一个真的能改变结果的动作**（现在是「先做一次导入，那一步会记住 UID」）。同类问题别用「加权限」解决，除非那条权限本身就是必需的。
    5. **凡是「每次失败就新建一个文件」的地方都要有上限。**（P2-19）`001错误报告` 与 `002同步报告` 都属于这类：正文截断到 16000 字符撑不爆磁盘，但用户没有清理入口。现在统一走 `trimReportDirectory(directory, REPORT_KEEP_FILES, "…报告.txt")`，按文件名里 `_<毫秒时间戳>_` 保留最新 50 份，删不掉就下次再试。
    6. **唯一一条不限速的出网路径，迟早会变成最危险的那条。**（P2-15 / P2-16 / P2-17）封面下载原来「不限速 + 无超时 + 并发 4 + 域名来者不拒」，而全仓只有它这样：现在 `loadCoverPng` 与 B 站接口**共用同一个 `biliThrottleWait()` 限速器**、带 `COVER_FETCH_TIMEOUT_MS` 的 `AbortController`，并且 `coverUrlAllowed()` 只放行 `COVER_HOST_SUFFIXES`（`.hdslb.com` / `.bilibili.com`；1.3.0 删掉的那三条视频流域名权限不在里面，也不许加回来）。跨进程等待同理：`biliImportPageApiGet` 加了后台侧兜底超时，否则关掉/刷新收藏夹标签页会让详情抓取的 `await` 永远挂着、整轮导入卡死且取消无效。
    7. **收藏库和导入之间没有锁，只能靠「让用户看见」。**（P2-8）后台把导入状态写在 `chrome.storage.local` 的 `importState` 里，收藏库读它并显示一条提示；**不要**去禁用按钮或弹对话框 —— 用户可能就是想边导边整理，我们能做的是别让他以为两边互不干扰。

26. **互斥判据里不许出现「调用者自己一定会置位」的标记 —— 那叫自锁。**（V1.4.4 修 V1.4.3 带进来的事故。）
    1. **症状**：`displayRoot()` 为了挡住「写入期间重画列表」，把 `busyNow` 也写进了判断条件；而四个扫描入口（刷新、选择目录、连接上次目录、恢复上次目录）**全都是先 `setBusy(true)` 再调它** —— 于是每一次扫描都在真正读盘之前 `return`。用户看到的是：目录明明选好了（句柄在 IndexedDB 里、权限也授了），右上角却一直写着「尚未选择目录」，列表永远空白。**发版当天被用户一眼撞上。**
    2. **判据只放「别人设的」标记**：这里真正要挡的是三个写入标记（`videoAddInProgress` / `deleteInProgress` / `collectionCreateInProgress`），它们由写入路径自己置位，扫描入口从不碰。`busyNow` 只该用在「别人忙的时候别插队」的地方（比如 `syncRootFromStorage`），**不能用来判断「我自己该不该干活」**。
    3. **静态测试看不出自锁**：191 条断言全都盯着「守卫在不在」，没有一条能发现「守卫把它自己的调用者也挡住了」。补的测试直接断言 `displayRoot` 的那段守卫里**不许出现 `busyNow`**，并且三个写入标记都在。**凡是「加了守卫」的改动，都要手动过一遍所有调用者是不是也被它挡住了。**
    4. **本地预览也要认边界**：预览页能验版式和渲染，但 `showDirectoryPicker` 这类需要用户手势的 API 在预览里根本走不到 —— 选目录 / 授权这两条路只能真机点，**或者至少读一遍调用链**。
    5. **「插件的固定目录」也是同一份名单散在多处**（承 25.1）：`background.js` 的 `RESERVED_COLLECTION_NAMES`、`library.js` 扫描时跳过的内联名单（两份）、`popup.js` 与 `library.js` 的 `ROOT_STRUCTURE_DIRECTORIES`。**改名字时四处一起改**；测试里钉住了「名单只允许两种形状」（5 个的保留目录 / 3 个的固定目录），多出一份新形状就会红。
    6. **选完目录就把结构建出来**：不管是弹窗还是收藏库，选目录后都调用建目录的逻辑（收藏库现在是 `ensureRootStructure(handle)`，因此要按 `mode: "readwrite"` 要权限，与弹窗一致）。空文件夹选进来时，用户能在文件管理器里立刻看到 `000视频下载` / `001错误报告` / `002同步报告` —— 「什么都没发生」是最容易让人以为插件坏了的反馈。

27. **白名单要连「协议」一起想 —— B 站接口回的是明文 `http`，而 manifest 只授权了 `https`；另外注释里不许出现块注释开始符。**（V1.4.5 修 V1.4.3 带进来的封面事故。）
    1. **症状**：V1.4.3 的 P2-17 给封面下载加了域名白名单，判定写成「协议必须是 `https:` 且 host 在 `COVER_HOST_SUFFIXES` 里」。而 `fetchVideoDetail()` 拿到的 `data.pic` 是 `http://i0.hdslb.com/...`（B 站接口一直回明文地址），`manifest.json` 的 `host_permissions` 只有 `https://*.hdslb.com/*` —— 两道加起来，**接口给的封面候选一个都取不到**。
    2. **为什么症状挑「关掉收藏夹页面」时才出现**：收藏夹页面开着时，`favorites-import.js` / `content.js` 还会送上来一个从页面抓到的 `https` 封面候选，它顶着用；页面一关（含导入中途关掉），后面的条目只剩接口给的 `http` 地址，于是**整批**变成「封面暂不可恢复」占位图，而视频信息完全正常（信息走 `api.bilibili.com`，那条权限是有的）。用户报的就是这个组合。
    3. **改法**：`coverUrlAllowed(url)`（返回布尔）换成 `coverFetchUrl(url)`（返回「可以拿去 fetch 的地址」或空串）—— 接受 `http` / `https`，host 仍须在白名单里，**如果是 `http` 就升成 `https` 再返回**（这些域名的 https 都通）。`loadCoverPng()` 必须用返回的地址去 `fetch`，不能拿原始地址。**只放宽协议，绝不放宽域名**：`http://evil.com/i0.hdslb.com.jpg`、`https://i0.hdslb.com.evil.com/...` 仍须被拒。
    4. **占位图是可修复的**：写成占位图的记录同时写了 `COVER_PENDING_LINE`（「封面待补全」），所以 `recordMissingCover()` 认得它，重新跑一次「导入/更新」就会补真封面。**以后任何「取图失败」的降级路径都要留这种可识别的标记**，否则那条记录会被当成封面完好、永不再补。
    5. **`/*` 在 `//` 注释里是地雷**：`test/stability.test.cjs` 的 `stripComments()` 是正则实现，看到 `/*` 就当成块注释开始 —— 我在 V1.4.5 的注释里写了 `https://*.hdslb.com`，`//*` 那一截被当成块注释开头，**后面整个文件都被吃掉**，两条依赖 `background.js` 的测试立刻报「匹配不上」。凡是注释里要写带 `*` 的 URL，就把它改写成文字（「hdslb.com 域名下 https 的权限」）。改完可以用一行脚本自检：正则 `/^\s*\/\//` 的行里不许 `includes("/*")`。

28. **「取不到」的失败路径不许静默 —— 没有原因记录的降级，等于把排查成本转嫁给下一次真机复现。**（V1.4.5 修完封面白名单后真机上封面**依旧**全失败，而报告里一个字都没有，只能靠读代码猜。）
    1. **症状**：`loadImportCover()` 里每个候选都是 `try { … } catch (_) {}`，候选全失败后静静返回占位图 —— 用户看到的是「整批封面变占位图」，报告里 15 条记录全部成功、失败 0，没有任何线索。域名白名单、协议、HTTP 状态、超时、解码失败这几种原因在外部完全同形。
    2. **判据**：任何「降级返回一个兜底值」的函数，都要把**为什么降级**带出去（至少：候选数量 + 每个候选的地址与失败原因）。V1.4.6 的做法是 `loadImportCover()` 回传 `failures` 与 `candidateCount`，`noteCoverOutcome()` 累积，一个收藏夹收尾时 `importCoverFailureLine()` 往报告里写一行，同时在后台控制台 `console.warn` 一条。
    3. **顺带**：报告里要能区分「压根没有候选地址」和「有候选但全失败」，这两种的处理方向完全相反（前者是上游没给数据，后者是我这边的请求出了问题）。
    4. **别用「读代码推演」代替证据**：这一次我把 URL、协议、CDN（curl 200 + `ACAO: *`）、`host_permissions`（Chrome 的 `Secure Preferences` 里确实有 `https://*.hdslb.com/*`）、函数顺序全部核过一遍，每一项都"应该没问题"，但真机就是不行 —— 缺的正是运行时的那一句失败原因。**核对清单全绿而现象依旧时，下一步是装眼睛，不是继续推演。**

29. **「等待方断了」不等于「被等的事失败了」—— 先问一句对方还在不在跑，再决定要不要报错。**（V1.4.7 修的就是这个：一次导入是「弹窗 → 收藏夹页面 → 后台」这样转手的，页面一关，弹窗的 `await` 立刻失败，于是把「后台正跑得好好的」当成失败。）
    1. **症状**：用户在导入途中关掉 B 站收藏夹页面（这是 1.4.3 起明确支持的用法）→ 后台正常跑完、报告与封面都正常，但弹窗既不弹完成提示，还可能显示「请先打开并刷新收藏夹页面，再试一次。」这种假错误。
    2. **判据**：任何「A 等 B 干活」的地方，B 消失时都要区分「B 没干」和「B 把活交出去了」。这里用 `chrome.storage.local.get("importState")` 的 `running` 判断：还在跑就改口径（`页面已关闭，导入仍在后台继续；完成后这里会提示。`），并且**直接订阅结果**（`importDone` 落地即提示），而不是继续等那条已经断掉的通道。`startedAt` 要用 `Date.now()` 记下来，免得把上一轮的旧结果当成这一轮。
    3. **别把结果通道绑在发起方身上**：真正干活的是后台，结果就必须能从后台直接到达界面（1.4.3 起 `importDone` 就是这条通道）。否则「关掉发起页面也能继续跑」只做了一半 —— 活是跑完了，用户却看不到。

30. **跨进程只传「下标」，不传给用户看的文字；派生统计不要另存一份汇总。**（V1.5.0 做本地数据库与宠物挂件时定。）
    1. **service worker 里没有词典**：`background.js` 拿不到 `BcaI18n` 的词典（它只管 storage 与网络），所以宠物互动这条消息只回 `{ ok, lineIndex, affinity, todayTouch, totalTouch, capped }`，四句台词写在 `pet.js` 里逐个 `translate("…")`。**后台一旦自己拼中文，等于绕过整套 i18n**；而且后台拼的字符串也没法随切语言更新。
    2. **台词必须写成一条条 `translate("…")` 调用**：`pet.js` 一开始把四句塞进 `const TOUCH_LINES = [...]` 数组字面量，`test/i18n-extract.cjs` 只认调用点，这四句就永远不进词典（缺了不报错，只是切语言那四句不翻译）。抽取器现在也认 `translate(` 这层包装 —— 但**新写的包装函数要同步告诉抽取器**，否则又是一个静默漏翻。
    3. **数据库只存明细**：`003database/database.json` 里只有「一条视频一条记录」，总数 / 今日 / 近 7 天 / 排行榜 / 柱状图全部由 `stats-core.js` 现算（`snapshot()`）。存了汇总就一定要同步更新，早晚会出现「图表和列表对不上」这类无法解释的 bug。
    4. **纯函数模块要能被 node `require`**：`stats-core.js` 与 `archive-core.js` 一样，IIFE 挂 `globalThis` 给浏览器、末尾 `module.exports = api` 给 node —— 这样 `test/stats-core.test.cjs` 能在 node 里真跑（31 条），而不是只做文本断言。`release.ps1` 里这两套都要跑。
    5. **整份重建而不是增量合并**：收藏库扫描完调 `syncStatsDatabase()`，用 `databaseFromVideos(videos, { previous })` 把数据库整份重写（只保留 `createdAt` 与宠物状态）。扫描看得到的才算数 —— 用户在收藏库里删掉的视频不该继续留在统计里。

