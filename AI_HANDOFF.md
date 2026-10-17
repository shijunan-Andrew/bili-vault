# AI 项目交接说明：哔哩藏库 Bili Vault

本文面向**接手这个项目的 AI**。读完本文就能开工；要细节时再按下面的地图去查另外几份。

| 文件 | 放什么 | 什么时候读 |
|---|---|---|
| `AI_HANDOFF.md`（本文） | 快速开始、项目基线、硬规则、红线、修改原则、验证与发版 | 每次接手都读 |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | 目录结构、界面与设计系统、主要数据流、`视频信息.txt` 格式、页面与消息接口、状态保存位置 | 要改某条链路时按需查 |
| [`docs/HISTORY.md`](docs/HISTORY.md) | 1.3.0 到现在逐版本改了什么、根因是什么、踩过哪些坑 | 想知道「为什么当初这么做」时查 |
| [`README.md`](README.md) | 面向使用者的安装与功能说明（对外的版本历史也在这里） | 要改用户可见行为时看 |

> **别把本文当唯一真相。** 版本号、测试项数、词典条数一律以 `manifest.json`、`git`、测试实际输出为准。本文里带 `<!-- test-count -->` / `<!-- i18n-count -->` 标记的数字会被 `release.ps1` 自动核对，没标记的数字可能已经过期。

**目录**

1. 本文档的维护规范
2. 快速开始
3. 开发环境与协作规矩
4. 项目基线
5. 功能概览
6. 路线图
7. 按任务找文件
8. 常用验证
9. 合规与安全红线
10. 修改原则
11. 已知限制与历史背景

## 本文档的维护规范

**谁读本文**：接手这个项目的 AI。所以本文写的是「现在该怎么做」，不是日记。每条结论都要能被验证 —— 给文件名、grep 锚点或测试项名，不要写「已经处理好了」这种核对不了的话。

**什么时候必须更新**

| 触发 | 改哪里 | 怎么改 |
|---|---|---|
| 发一个版本 | `docs/HISTORY.md` + `README.md`（本文只在规则/流程/现状真的变了时才动） | `docs/HISTORY.md` 顶部加该版本小节（改了什么 / 根因 / 踩的坑）；`README.md` 加用户可见的那一节（`release.ps1` 会校验，缺了就发不出去） |
| 改了硬规则、红线、设计约定 | 本文「快速开始」的十条硬规则、「合规与安全红线」、「修改原则」 | **同时加或改一条守卫断言** —— 只改文档等于下一个人照样会踩 |
| 新踩到一个「不看就会再犯」的坑 | 本文「修改原则」 | 先写结论（该怎么做），再写一句来由（哪个版本踩的、错在哪） |
| 发现本文的数字 / 路径 / 命令过期 | 就地改 | 优先改成「读法」而不是写死的值（指向 `manifest.json`、`git`、测试实际输出） |
| 本文涨到约 600 行以上 | 本文 | 先判断能不能放进 `docs/ARCHITECTURE.md` 或 `docs/HISTORY.md`。入口文档**不许**再长出逐版本小节（有守卫断言） |

**维护时不要做的四件事**

1. 不要在本文写逐版本小节 —— 版本的「为什么」归 `docs/HISTORY.md`，用户可见的版本说明归 `README.md`。
2. 不要写死版本号、测试项数、tag 数量、代码行号 —— 都会漂。测试项数与词典条数用 `<!-- test-count:N -->` / `<!-- i18n-count:N -->` 标记，`release.ps1` 每次发版自动核对。
3. 不要把「当时的临时状态」写成永久结论。已解决的写「已定性（x.y.z 处理完）」，没做的写「未修」或「已知欠账」，不要含糊其辞。
4. 不要重复描述代码里已经有的守卫细节 —— 给判断标准和守卫测试名就够了，实现看代码。

**改完自检**

```powershell
node test/stability.test.cjs        # 文档守卫：三处 test-count 标记、入口不许长版本小节、硬规则必须在本文里
node test/i18n-extract.cjs --check  # 动了词典才需要
```

再加一步人肉检查：改了**命令、路径、文件名**之后，grep 一遍旧值有没有在 `README.md` / `SMOKE_TEST.md` / `docs/*` 里残留。

## 快速开始

**这是什么**：一个 Chrome MV3 扩展，把 B 站收藏夹里的视频资料按「收藏夹 / 时间目录」的结构备份到用户自选的本地文件夹。**只在本地读写**，没有服务器、没有 npm 依赖、没有打包步骤 —— 仓库根目录就是扩展目录，直接在 `chrome://extensions` 里「加载已解压的扩展程序」即可。

**当前状态**：版本号见 `manifest.json`（唯一来源，别在别处改）；上线前审查的 P0 / P1 / P2 已全部收口，现在是功能开发阶段。

**日常四件事**（在项目根目录执行）：

```powershell
node test/stability.test.cjs      # 静态回归断言（最快；改文档、常量后必跑）
node test/background.test.cjs     # 真执行：chrome.* / FileSystem / 导入回写
node test/pages.test.cjs          # 真执行：library / popup / content 三个页面
node test/i18n-extract.cjs --check
```

改完代码至少跑这几条；**完整五套 + 发版前置检查**见「常用验证」。

**发版**（版本号不带 `V`，两个位置参数）：

```powershell
pwsh -NoProfile -File .\release.ps1 1.7.25 "一句话说明" -Yes
```

它会：检查工作区干净与能不能到 GitHub → 改写 3 处版本号 → 跑全部测试与文档标记核对 → 提交 → 打 tag → 推送。**必须用 `pwsh`（PowerShell 7），不要用 `powershell.exe`（5.1）** —— 5.1 在沙箱里拿不到子进程输出，会让检查步骤假失败并回滚版本号。

**十条不能破的硬规则**（来由见「修改原则」）

1. 颜色 / 圆角 / 阴影 / 间距 / 字号 / 动效**只在 `theme.css` 定义**，页面 CSS 只引用 `var(--…)`。
2. 字号只能用 7 个 `--fs-*` 令牌，且不得小于 11px。
3. 图标只用 `icons.js`，不要写 `▦ ▶ ＋` 这类字符图标。
4. i18n 的 key 就是**中文原文**；元素文字与词典键必须逐字相同；JS 里用 `BcaI18n.t("字面量")`。
5. 内容脚本**不能 fetch `locales/`**（不在 `web_accessible_resources` 里），要走 `bca-locale` 消息请后台代取。
6. 全仓 **CRLF**；`release.ps1`、`test-native-folder-opener.ps1` 与 `native/` 下的脚本是 **UTF-8 带 BOM** —— `edit` / `write` 会剥掉 BOM，改这些文件必须用带 BOM 的脚本。
7. 跑 `release.ps1` 用 **`pwsh`**，不要用 `powershell.exe`。
8. 改完**任何 `.js`** 都要 `node --check`：静态断言测试看不见语法错误。
9. 不要新增 npm 依赖、不要引入构建步骤、不要把 `locales/` 加回 `web_accessible_resources`。
10. **同一份判断只能有一处实现**：新增写归档的入口前先 grep 现成的守卫函数；确实需要第二份副本时，必须同时加一条「两份逐字相同」的守卫断言。

## 开发环境与协作规矩

### 环境

这个项目在 **DeepSeek Harness** 里开发，装了几个给 agent 用的插件，按需使用：

- **智能体团队 / 子智能体**（`spawn_teammate` / `subagent` / `subagent_fork` / `workflow`）
- **浏览器自动化**（`browser-skill` 提供的 `bsk_*` 工具）
- 文件、搜索、命令执行等基础工具

本机是 Windows：日常命令用 bash 工具，Windows 原生功能才用 pwsh 工具；跑 `release.ps1` 必须用 **PowerShell 7**（pwsh 工具），不能用 `powershell.exe`（5.1）。

**GitHub 访问不用开系统代理**：Clash Verge 的内核（`verge-mihomo.exe`）跑着的时候 `127.0.0.1:7897` 就一直在监听，「系统代理」那个开关关着也能走；`release.ps1` 会先直连、不通再自动走代理。平时把系统代理关着不影响发版，也就不会因为全局代理而拖慢国内网站。

### 子智能体能干什么，不能干什么

**只有这几类可以交给子智能体**：文档审阅、代码检索、只读调研、写/改测试草稿、小型且边界清晰的 bug 修复。

**这些必须自己动手**：功能开发、架构改动、重大 bug 修复，以及任何会写 `background.js` / `library.js` / `archive-core.js` / `stats-core.js` / `native/` / `release.ps1` 的改动。

三条硬要求：

1. **子智能体的产出一律视为「未验证」**，包括它说「已修好、测试全绿」。自己读 diff、自己跑测试、自己验收，必要时推倒重写。不要把它的话直接写进文档或转述给用户。
2. **不要让两个写者碰同一批文件**。要交给子智能体写任务，就先按文件划分不相交的范围，否则它会和你互相覆盖。
3. **子智能体不继承你的上下文**（`subagent_fork` 除外）。交给它的任务必须自带完整信息：文件路径、行号、要遵守的约束、验收标准。

### 浏览器类工具用完要收尾

用 `bsk_*` 做完事必须收尾，别留后台进程占着端口：

1. **先取证再关**（截图 / 控制台 / 网络）—— 关了才想起没截图，就得整轮重跑。
2. `bsk_session action=stop` 关掉浏览器会话。
3. 预览服务这类后台任务用 `job_kill` 杀掉，别留着。

### 问询型请求：先回答，别先动文件

用户问「能不能…」「为什么会…」「现在是什么状态」「有没有…」时，那是**提问**，不是指令。先把答案和证据给出来，**在用户明确点头之前不要改文件**。

判断标准：请求里有没有指向「改代码 / 改文档 / 发版」的明确动作。没有就先答，再问一句「要不要我改」。用户说「改吧」「做」「开始 1.7.x」这类才是授权。

## 项目基线

- 项目目录：`Desktop\bili-vault\` —— **仓库根就是扩展目录**，扩展文件直接放在根目录，不再套一层带版本号的文件夹（版本交给 git tag 管理）。V1.0.0 交付时曾短暂叫过 `b-vault-V1.0.0`，**该名字已废弃**。**1.0–4.9 的独立文件夹快照已经删除**：它们全部重放成了 git 历史与 tag，所以取历史版本一律走 git，不要再去找 `bili-vault-beta*` 目录（那些目录已经不存在了）。
- 扩展版本：**以 `manifest.json` 的 `version` 为准，这里不写死**（界面上的版本号是它加上 `library.js` / `popup.js` 里的 `RELEASE_CHANNEL` 前缀拼出来的；两处常量必须一致）。Chrome Manifest V3，最低 Chrome 版本 111（数字的唯一出处是 `manifest.json` 的 `minimum_chrome_version`；理由见 README 的「运行环境」一节 —— 整套毛玻璃靠 `color-mix()` 推底色，它进 Chrome 稳定版正是 111。README 那段与 manifest 由测试核对，不要只改一边）。测试版时期界面显示 `beta4.x`，差别只在那两处 `RELEASE_CHANNEL` 常量。
- **版本管理方式在 V1.0.0 改了**：以前每个版本是一个独立文件夹（`b_catch_*` → `bili-vault-beta*`），现在**改用 git**——每个版本一个 commit 与一个同名 tag（`beta1.0` … `beta4.9`、`V1.0.0` 一路到当前版本；**tag 数量每次发布都在涨，别在任何地方写死**），提交日期用的是各版本快照的真实文件时间，所以 `git log` 直接就是那条时间线。远程：`https://github.com/shijunan-Andrew/bili-vault`。**新版本直接在当前目录改并提交，不要再复制文件夹。**
- **历史版本编号沿革**：项目最初叫 `b_catch`，目录名 `b_catch_1.0` … `b_catch_3.8`，后来随改名统一成 `bili-vault-beta1.0` … `bili-vault-beta3.8`。**这些快照目录现在都已删除**，内容完整保留在 git 历史里（`git show beta2.0:manifest.json` 这样就能取到）。完整的逐版本演变见 `README.md` 的版本历史段，图示与量化数据见 `Desktop\bili-vault开发文档\`。

  **目录名与 manifest 版本号曾经不一致**——早期那套是手工复制文件夹，改名时没同步 `manifest.json`。已知对不上的只有 3 个：`beta1.0` 里写 `1.1.3`、`beta1.1` 里写 `1.1.4`、`beta3.8-uncomplete` 里写 `3.7.0`（3.8 做了一半的快照）。**查任何历史版本的版本号，一律用 `git show <tag>:manifest.json`，别信目录名。**

  **这个问题现在不会再发生了**：目录名不再带版本号（就是 `bili-vault`），版本只有两个来源——`manifest.json` 的 `version` 与 git tag，而 `release.ps1` 会把它们一起改。

- 3.6 之前没有测试套件、没有 `archive-core.js`、也没有本文件；3.6 起才建立「抽取纯逻辑 + 静态回归测试 + 交接文档」这套工程约定。
- **4.0 是一次纯界面重构**，磁盘格式与数据流完全没动：它把四份互相覆写的 CSS 收敛成 `theme.css` 单层令牌体系，并确立了 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) 里「界面与设计系统」那六条约定。4.0 之前的 CSS 是层层追加的补丁（`.library-link` 被定义 4 次、`.primary` 和 `.toggle-switch` 各 3 次），改一处样式极容易被下游区块盖掉——**若要理解某条界面约定的来历，先看这一条**。
- **4.5 新增主题与多语言两个横切能力**（`theme.js` / `theme.css` 深色令牌、`i18n.js` + `locales/`），并调整了排序、卡片徽标与「更新视频状态」的位置。
- 项目没有 npm 依赖或打包步骤。扩展直接从 `chrome://extensions` 加载解压目录。原生辅助程序是唯一需要“构建”的部分：安装脚本用系统自带 `csc.exe` 把 `native\folder-opener-launcher.cs` 编译成宿主启动器。
- 用户主要使用中文界面和 Windows/Chrome。回答修改结果时用中文、清楚说明文件、行为变化和检查结果。
- 注意：解压扩展的 ID 与加载时的**绝对路径**有关，换目录可能变 ID（这是 Chrome 对 unpacked 扩展的规则）。但**不要自己算**：1.7.13 试过 utf8 / utf8-大写 / utf16le / utf16le-大写 四种编码，都算不出已装的 `fmjfnoklnindjjemlbbagjjiaackjjhb`。ID 的唯一可信来源是 `chrome://extensions` 里显示的那个；安装脚本把当时的值记在 `%LOCALAPPDATA%\BcaFolderOpener\settings.json` 的 `extensionId` 里。**所以尽量不要改这个目录的名字**；真要改，重新加载扩展 → 核对 ID → 需要时重跑 `install-native-folder-opener.ps1`。

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
3. ~~**想清楚下载功能的定位**~~ —— **2026-10-11 用户拍板：公开版移除下载功能**，见 [`docs/HISTORY.md`](docs/HISTORY.md) 的「1.3.0：移除下载功能」。保留下来的是「手动标记已下载」这条与外部下载器对接的路。

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

## 按任务找文件

| 想做的事 | 先看这里 |
|---|---|
| 改界面样式、加组件 | `theme.css`（令牌唯一来源）+ 该页面的 CSS；规则见 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |
| 改收藏库首页、卡片、筛选、批量操作 | `library.js`（约 5000 行，初始化在文件末尾）、`library.html`、`library.css` |
| 改弹窗 | `popup.html` / `popup.js` / `popup.css` |
| 改设置页 | `settings.html` / `settings.js`；**禁用 `textContent =` 写文字**，用 `replaceChildren` |
| 改统计页与图表 | `stats.html` / `stats.js`；纯逻辑在 `stats-core.js`（node 能 require） |
| 改宠物挂件 | `pet.js` / `pet.css` |
| 改自动归档、导入、后台消息 | `background.js`（service worker，ES module，只 import `./stats-core.js`） |
| 改 B 站页面上的采集与提示 | `content.js`（隔离世界，读不到页面全局变量） |
| 改命名、匹配、解析这类纯逻辑 | `archive-core.js`（浏览器挂 `globalThis`，node 能 require） |
| 加或改界面文字 | 先写中文原文 + `data-i18n`，再改两本词典，最后跑 `i18n-extract --check` |
| 加测试 | 静态断言加进 `stability.test.cjs`；要真执行就加 `archive-core` / `stats-core` / `background` / `pages` 里对应那套 |
| 改原生目录助手 | `native/` 与三个 `*-native-folder-opener.ps1`，改完必须跑自检脚本 |
| 改发版流程 | `release.ps1`（先读「修改原则」里讲 BOM 与 pwsh 的两条）、`pack.ps1` |
| 查「为什么当初这么做」 | [`docs/HISTORY.md`](docs/HISTORY.md) |

## 常用验证

在项目根目录执行。**下面五套都要跑**，`release.ps1` 第 4 步跑的也是这五套，任一退出码非 0 就算失败：

```powershell
node test/stability.test.cjs      # 静态回归断言为主（项数以实际输出为准，别写死）
node test/archive-core.test.cjs   # 72 项真执行
node test/stats-core.test.cjs     # 61 项真执行
node test/background.test.cjs     # 25 项真执行（内存版 chrome.* + FileSystem，background.js 丢进 vm）
node test/pages.test.cjs          # 19 项真执行（dom-harness 里加载 library.html / popup.html / content.js）
node test/i18n-extract.cjs --check
```

`test/stability.test.cjs` 的构成是**绝大多数静态回归断言**——读文件比对文本，能证明「约定没被违反」，不能证明「功能真的能跑」；真正会执行代码的是后四套。静态部分按功能代次分组，分组标题里的版本号就是它们守护的那一轮改动，
可以在 `test/stability.test.cjs` 里直接按 `/* ---- … ---- */` 跳转。<!-- test-count:245 -->

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
4. 若改动 PowerShell，使用 PowerShell Parser 解析所有 `.ps1`，不要仅靠运行安装脚本验证。本机执行策略是 Restricted，直接双击/裸跑 `.ps1` 会被拒；用 `pwsh -NoProfile -File <脚本>`（PowerShell 7）跑，**不要用 `powershell.exe`（5.1）** —— 5.1 在沙箱里拿不到子进程输出，详见「修改原则」第 2 条。
5. 读取 `manifest.json`、`settings.json` 一类 UTF-8 文件时显式指定编码，PowerShell 5.1 的 `Get-Content` 默认按 ANSI 读取，中文会乱码。
6. 改动本地目录打开助手时，重新运行安装脚本（沙箱验证可加 `-SkipRegistry -HostRoot <临时目录>`）并执行 `test-native-folder-opener.ps1`，它会真正按帧协议调用编译出的启动器。
7. 有条件时在 Chrome 加载扩展，登录 B 站验证收藏、导入、手动标记已下载、移动/删除和徽标状态。Node 检查不能替代真实 B 站登录/API 测试。

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
2. **发布走 `release.ps1`，不要手工改版本号**。它会检查工作区与能不能到 GitHub → 改 3 处版本号 → 跑全部检查 → 不过就回滚 → 提交 → 打 tag → 推送。用法（**版本号不带 `V` 前缀，位置参数**）：`pwsh -NoProfile -File .\release.ps1 1.7.26 "说明" -Yes`。**GitHub 访问不用开系统代理**：脚本里的 `Invoke-GitRemote` 先直连，不通才自动加 `-c http.proxy=http://127.0.0.1:7897` 重试；只要 Clash Verge 的内核（`verge-mihomo.exe`）在跑，混合端口就一直在监听，跟「系统代理」那个开关无关（开着全局代理反而让浏览国内网站变卡）。真连不上时只需要打开 Clash Verge。发布前照 `SMOKE_TEST.md` 走一遍真机验证。

   **绝对不要用 `powershell.exe`（Windows PowerShell 5.1）跑它。** V1.7.18 发布时踩过：5.1 跑在沙箱里时，`Invoke-Native` 里 `& $Node ... | ForEach-Object` 拿不到子进程的任何输出（`$LASTEXITCODE` 仍是 0，所以测试套件的「未全过」也不报），于是「文档里的词典条数」那一步读到 0 种、报「没能从词典检查的输出里读出唯一的条数」并回滚版本号 —— 看着像词典坏了，其实词典完全正常。**判断方法**：如果第 4 步里 `ℹ tests/pass/fail` 那些行没打印出来，就是这个坑，换 `pwsh` 重跑即可。
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
9. 界面改动遵守 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) 里“界面与设计系统”的六条约定；改完跑 `node test/stability.test.cjs`，它会拦住字号回退、字符图标复活和页面漏引 theme.css/icons.js。
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
    9. **收工要关掉临时起的浏览器与预览进程**（用户 2026-10-15 要求，原话「下次在你完成工作后关掉浏览器后台任务」）：验收用的预览服务器（`C:\Users\Maxwell\Desktop\b_catch\_appearance-preview.cjs`，端口 **8792**；查询参数 `locale=` / `theme=` / `glass=` / `wallpaper=` / `veiled=` / `bad=1`）和 `bsk` 浏览器会话都是临时脚手架 —— 交付／答复之前用 `job_kill` 停掉后台作业、`bsk_session stop` 关掉会话（`bsk_session list` 确认没有残留），别把它们留在用户的任务面板和会话列表里。
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
    4. **纯函数模块要能被 node `require`**：`stats-core.js` 与 `archive-core.js` 一样，IIFE 挂 `globalThis` 给浏览器、末尾 `module.exports = api` 给 node —— 这样 `test/stats-core.test.cjs` 能在 node 里真跑（61 条），而不是只做文本断言。`release.ps1` 里这两套都要跑。
    5. **整份重建而不是增量合并**：收藏库扫描完调 `syncStatsDatabase()`，用 `databaseFromVideos(videos, { previous })` 把数据库整份重写（只保留 `createdAt` 与宠物状态）。扫描看得到的才算数 —— 用户在收藏库里删掉的视频不该继续留在统计里。

## 已知限制与历史背景

- B 站收藏弹窗、收藏夹 API、播放流权限和失效视频恢复来源可能变化；发生 API 变化时优先保留现有部分结果和错误报告，不要因单条失败中断整个批次。
- 失效视频只有在 B 站的 APP 收藏、稍后再看、观看历史或其他资料源中仍有记录时才可能恢复；无法找回时缺失字段用“未知”。
- Native Messaging 仅用于 Windows 资源管理器打开目录。它的清单不允许 `args`，`path` 必须是无参数可执行文件；没有安装或设置不正确时，网页不能直接启动 Explorer，详情页必须保留“复制视频目录路径”这类退路提示。
- 用户曾报告收藏成功但本地归档失败，并看到 B 站收藏弹窗提示 `The next() called multiple times`。另一次控制台网络错误指向 Kaspersky 浏览器组件的 `gc.kis.v2.scr.kaspersky-labs.com`。后者不是本项目域名；判断归因前需在禁用相关第三方扩展的环境中复现。不要把这类外部错误直接归为本扩展故障。
- 3.8 修复的两个本地目录打开助手缺陷都是运行时问题，Node 静态检查发现不了：一个是 Chrome 静默忽略清单 `args`，一个是 PowerShell 5.1 的默认 ANSI 读取。改动这一块必须跑 `test-native-folder-opener.ps1`，不能只做语法检查。
- **已定性（1.7.20 处理完）**：`content.js` 在 MV3 隔离世界里读不到页面的 `window.__INITIAL_STATE__`（清单没声明 `world: "MAIN"`），所以那段读取一直是死的。1.7.20 已把它删掉，只在代码里留一行注释说明为什么读不到；元数据一律走 DOM/meta 采集。**别再加回来**，要拿页面全局变量必须先加 MAIN 世界的桥。
- **归档数据本身的完整度**（4.1 实测一个上千条的档案）：只有约两成有标签、约四成有简介，将近一半两者都没有。根因是导入流程里 `normalizeImportMedia()` 把 `tags` 硬编码为 `[]`，且只有失效视频会去抓资料。4.1 负责把这些数据正确地显示出来，**4.2 负责在导入/更新时把它们抓全**——对已有档案执行一次「导入或更新」，缺失的标签、发布时间、粉丝数与互动数据都会被补上。
- **一个已证实的数据错误**：某条归档里 `UP主UID` 写的不是该视频作者的真实 `mid`（两者对不上；抽查另外 4 条记录都是对的），怀疑是收藏夹接口在个别条目上返回了错误的 `upper`。4.2 因为改从 `/x/web-interface/view` 取 UP 主信息，执行一次更新即可修正这类记录。
- 4.2 的导入会对每条视频发 2–3 个请求（view + tags + 每个 UP 一次的 relation/stat），**这是用户明确要求的完整抓取**。**注意速率在 4.3 已下调为串行 + 每条间隔 800ms**（原为并发 2 + 350ms）；如果将来风控变严，应先调 `IMPORT_DETAIL_CONCURRENCY` / `IMPORT_DETAIL_DELAY_MS`，而不是回到“只补缺失字段”的老逻辑。

### 已知限制（4.5）

- **后台文案不参与多语言**。`background.js` 是模块化 service worker，加载不了经典脚本；它产出的导入进度文本、错误消息、`001错误报告` 里的正文都固定为简体中文。界面显示处会对静态串做一次 `t()`（能翻的会翻），但带变量的动态串（例如「正在更新视频状态 3/20：xxx」）会保持中文。
  要做全的话，需要把后台改成回传**消息键 + 参数**、由界面渲染，属于一次独立重构。
- **报告文件不入词典**。`001错误报告/` 与 `视频信息.txt` 属于归档数据，保持单一语言便于长期比对。
- **`data-i18n` 只能用在纯文本元素上**。带图标或子元素的必须套一层 `<span data-i18n>`，否则 `textContent` 会把子元素清掉。
- **主题如何到达内容脚本（4.6 已解决，这里记做法）**。主题存在 `localStorage`（为了让页面在 `<head>` 里同步应用、不闪浅色），而内容脚本跑在 B 站页面里，读到的是**宿主页面的** `localStorage`，拿不到扩展的那份。4.6 的做法是：`theme.js` 在写 `localStorage` 的同时**镜像一份到 `chrome.storage.local`**，`content.js` 从那里读，两边靠异步对账保持一致。**4.5 时期提示卡只跟随系统，这个问题已经修好了**——不要再按「到不了内容脚本」去改。
- **繁体中文与英文词典由本项目的词条工具校验覆盖率**，**漏译不会报错、只会回退成中文**，所以要靠 `test/i18n-extract.cjs --check` 兜底。
