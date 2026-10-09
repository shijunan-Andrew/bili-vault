# AI 项目交接说明：哔哩藏库 Bili Vault

本文面向后续接手代码的 AI，记录当前项目结构、数据流、关键约束和验证方法。请先阅读本文，再看 [README.md](README.md) 和相关源文件。

## 项目基线

- 项目目录：`Desktop\bili-vault\` —— **仓库根就是扩展目录**，扩展文件直接放在根目录，不再套一层带版本号的文件夹（版本交给 git tag 管理）。V1.0.0 交付时曾短暂叫过 `b-vault-V1.0.0`，**该名字已废弃**。**1.0–4.9 的独立文件夹快照已经删除**：它们全部重放成了 git 历史与 tag，所以取历史版本一律走 git，不要再去找 `bili-vault-beta*` 目录（那些目录已经不存在了）。
- 扩展版本：`1.0.0`（界面显示 `V1.0.0`），Chrome Manifest V3，最低 Chrome 版本 111。测试版时期界面显示 `beta4.x`，差别只在 `library.js` / `popup.js` 里的 `RELEASE_CHANNEL` 常量。
- **版本管理方式在 V1.0.0 改了**：以前每个版本是一个独立文件夹（`b_catch_*` → `bili-vault-beta*`），现在**改用 git**——36 个版本对应 36 个 commit 与 36 个同名 tag（`beta1.0` … `beta4.9`、`V1.0.0`），提交日期用的是各版本快照的真实文件时间，所以 `git log` 直接就是那条时间线。远程：`https://github.com/shijunan-Andrew/bili-vault`。**新版本直接在当前目录改并提交，不要再复制文件夹。**
- **历史版本编号沿革**：项目最初叫 `b_catch`，目录名 `b_catch_1.0` … `b_catch_3.8`，后来随改名统一成 `bili-vault-beta1.0` … `bili-vault-beta3.8`。**这些快照目录现在都已删除**，内容完整保留在 git 历史里（`git show beta2.0:manifest.json` 这样就能取到）。完整的逐版本演变见 `README.md` 的版本历史段，图示与量化数据见 `Desktop\bili-vault开发文档\`。

  **目录名与 manifest 版本号曾经不一致**——早期那套是手工复制文件夹，改名时没同步 `manifest.json`。只有下面 3 个对不上，其余 33 个一致，查历史时按这张表对齐，别被绕进去：

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
- 注意：Chrome 的扩展程序 ID 由插件所在**绝对路径**推导。换目录（例如 `bili-vault-beta4.9` → `bili-vault`，或 V1.0.0 那次从 `b-vault-V1.0.0` 改名）ID 就会变，安装原生助手时必须填入新 ID。**所以尽量不要改这个目录的名字。**

## 功能概览

1. 在 B 站视频页确认收藏后，将视频信息和封面写入用户选择的本地目录。
2. 在 B 站个人空间收藏夹页选择收藏夹，批量导入或更新本地归档；对失效视频尝试恢复可找回的信息。
3. 打开本地收藏库后，按固定目录结构解析视频，支持搜索、筛选、详情、新建/删除收藏夹、添加视频、移动/复制、批量操作。
4. 下载视频、音频、弹幕、字幕、封面和信息文件；暂停/继续、取消，并在卡片同步下载状态。
5. 通过可选的 Windows Native Messaging 辅助程序，在文件资源管理器打开视频目录。

## 路线图（用户 2026-10-10 确认的方向）

V1.0.0 之后的三件事，**都是用户明确要求的下一步**。做之前先回来读这一节，别凭猜测扩展范围。

1. **「同步」而不是「再导出一次」**——这是**首要目标**。用户最大的收藏夹 `默认收藏夹` 有 2799 条，按现在约 1.2 条/秒全量跑一次要 39 分钟。真正要的不是"重跑一遍"，而是**一份差异报告**：这段时间里 B 站那边新增了什么、删了什么、哪些变失效了。现在导入会静默跳过已存在的记录，用户看不到任何变化。
2. **导出全部元数据为单个 JSON**。归档的可迁移性缺口：`视频信息.txt` 损坏就是永久丢失，也没有办法把整个资料库交给别的工具读。242 条记录还小，但越晚做成本越高。顺带可以做完整性校验（校验和）。
3. **想清楚下载功能的定位**。用户自己的 README 里写着「自带的下载器并不稳定，大批量下载建议改用 DownKyi」，而 4.8 的「手动标记已下载」其实已经承认了这一点。两条路选一条：**要么**把内置下载器明确定位成"补几条"的辅助工具，**要么**把重心移到"和外部下好的文件正确对接"上——后者更贴近用户的实际用法。

### 明确不做的事（用户已否决，别自作主张加回来）

- **不要做「失效视频定期复查 / 恢复」功能**。用户的判断是：B 站上失效的视频基本不会恢复，为此加一套定时复查没有意义。**现在的行为就够了**——导入到本地时查一次失效视频的资料并存下来。`recoverInvalidVideos` 开关与「更新视频状态」都保持现状，不要再扩展。

## 目录结构

```text
bili-vault/                       # 仓库根即扩展目录；改名会改变扩展 ID，必须重装原生助手
├── .git/                         # 36 个版本的完整历史（tag: beta1.0 … beta4.9、V1.0.0）
├── .gitignore / .gitattributes   # 忽略本地归档；换行策略（.bat/.ps1/.cs 钉死 CRLF）
├── manifest.json                 # MV3 权限、后台 worker、内容脚本注册
├── background.js                 # 保存、导入、视频 API、错误报告、后台消息路由
├── content.js                    # B 站视频页：监听收藏操作、采集视频数据 + 归档提示卡
├── favorites-import.js           # B 站收藏夹页：提供页面 API 代理和导入入口
├── archive-core.js               # 可复用的纯逻辑：安全名称、下载目录匹配、下载路径、视频信息解析、页码序列
├── theme.css / theme.js          # 4.0 / 4.5：唯一的设计令牌来源；theme.js 在 <head> 同步应用主题
├── i18n.js                       # 4.5：以中文原文为 key 的翻译层
├── icons.js                      # 4.0：线性 SVG 图标，替代字符图标
├── locales/
│   ├── zh-TW.json                # 繁体词典（简体中文不需要词典，查不到就原样返回）
│   └── en.json                   # 英文词典
├── popup.html/js/css             # 插件弹窗：自动归档开关、根目录、导入界面、主题与语言
├── library.html/js/css           # 本地收藏库页面
├── download.html/js/css          # 视频解析和下载界面
├── native/
│   ├── folder-opener-launcher.cs # 原生消息宿主启动器源码（安装时编译成 exe）
│   └── folder-opener-host.ps1    # 原生消息主机工作脚本
├── install-native-folder-opener.bat / .ps1
├── uninstall-native-folder-opener.ps1
├── test-native-folder-opener.ps1 # 不依赖 Chrome 的安装自检脚本
├── test/
│   ├── stability.test.cjs        # Node 内置测试（127 项）：静态回归断言 + 并进来的单元测试
│   ├── archive-core.test.cjs     # 59 项真执行单元测试：require archive-core.js 真的调用它
│   ├── i18n-extract.cjs          # 提取界面词条、校验词典覆盖率（--check / --todo）
│   ├── _unmarked.cjs             # 反向检查：找出漏标记的界面文字
│   ├── archive-audit.cjs         # 本地归档的标签/简介覆盖情况体检
│   └── import-trial.cjs          # 只读预览导入会抓到什么，不改任何文件
├── README.md                     # 面向使用者的安装与功能说明
└── AI_HANDOFF.md                 # 本文件
```

4.0 删除了 `download-folder.html/js/css`（3.2 之后就被原生助手取代，全项目零引用）。4.3 起 `library.html` **不再**作为 web_accessible resource 暴露，改由后台 `chrome.tabs.create` 打开。

## 界面与设计系统（4.0 起必须遵守）

4.0 之前，四份 CSS 是不断追加的覆写补丁：`library.css` 里依次有“2.3 柔和配色 → 3.1 恢复蓝色 → 3.4 放大字号 → 3.8”四个区块，`popup.css` 里 `.library-link` 被定义了 4 次、`.primary` 和 `.toggle-switch` 各 3 次，谁生效只能靠读到最后一行。改动因此极易被下游区块盖掉。4.0 换成如下约定，**后续任何界面改动都必须遵守**：

1. **颜色、圆角、阴影、间距、字号、动效只在 `theme.css` 定义。** 页面 CSS 只引用 `var(--…)`，不再写死色值。灰阶只用 `--ink / --text / --muted / --faint / --ghost` 五级。
2. **页面 CSS 单层直写，禁止再追加“覆写区块”。** 需要改样式就改对应规则本身。`test/stability.test.cjs` 有静态断言兜底（字号下限、令牌存在性、每页都引入 theme.css/icons.js）。
3. **字号只能用 `--fs-micro`(11) / `--fs-sm`(12) / `--fs-base`(13) / `--fs-md`(15) / `--fs-lg`(18) / `--fs-xl`(22) / `--fs-2xl`(27)。** 11px 只允许用于纯装饰文案；中文正文不低于 13px。测试会拒绝任何小于 11px 的 `font-size`。
4. **图标只用 `icons.js`。** 静态 HTML 写 `<span data-icon="folder"></span>`（DOMContentLoaded 自动填充），JS 模板串用 `BcaIcons.svg("folder")`。不要再引入 `▦ ▶ ＋ ↻` 这类字符图标——测试会拦截。
5. **按钮里带图标后，改文案不能用 `textContent`**（会把图标一起清掉）。用 `library.js` 的 `setButtonContent(button, icon, text)` 或 `download.js` 的 `setButtonLabel(...)`。
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

- **有效视频**：调用 `/x/web-interface/view` 拿 `stat`，按 UP 缓存调用 `/x/relation/stat` 拿粉丝数，然后用 `patchVolatileFields()` **只替换** UP主粉丝数、`【互动数据】` 整块，以及原值为「未知」时的发布时间。标题、简介、标签、收藏时间、保存文件夹、目录结构全部逐字不动（测试会核对行数与逐行差异）。
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
**词典怎么加载**：扩展页面（收藏库 / 下载页 / 弹窗）直接 `fetch(chrome.runtime.getURL("locales/xx.json"))`，同源无限制。**内容脚本不行**——它跑在网页里，从网页上下文读扩展资源必须声明 `web_accessible_resources`，而那是 4.3 特意去掉的（防止 B 站页面把收藏库嵌进 iframe 做点击劫持）。所以内容脚本走 `bca-locale` 消息请后台代取。**不要为了图省事把 `locales/*` 加回 `web_accessible_resources`。**
**后台（`background.js`）不翻译**。它是模块化 service worker，加载不了经典脚本；它产出的文案有两种处理方式：界面显示处包一层 `t()`（可以翻静态串），或者维持中文（导入进度、错误报告文件）。4.5 采用后者，见「已知限制」。
- 词条工具：`node test/i18n-extract.cjs` 列词条、`--todo` 生成待译清单、`--check` 校验词典覆盖率（回归测试会调用 `--check`，漏译会失败）。

### 更新视频状态（4.5 调整）

4.4 的批量刷新（页面标题栏 + 对话框 + `statusBatchSize`）**已整体删除**。现在按钮在**视频详情面板的互动数据下方**，经 `refreshOneVideoStatus(video)` 一次只提交一条：

```
chrome.runtime.sendMessage({ type: "bca-refresh-video-stats", data: { targets: [target], limit: 1 } })
```

后台实现（`refreshVideoStatus` / `refreshOneArchiveStatus`）没有变。这样设计是为了避免批量刷接口触发风控——不要再把批量入口加回来。
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

**推论**：用脚本改代码之后，必须真的跑一次语法检查；测试通过不等于代码能跑。改完 `library.js` / `download.js` / `popup.js` 这类大文件尤其要跑。

### 「已下载」判据只能有一处（4.8.2）

`BcaArchiveCore.downloadMatchIsDownloaded(match)` 是**唯一**的判据：有真实媒体文件、或有「手动标记」留下的说明文件，都算已下载。

**这里踩过一次坑，别再踩**：这条规则原本在 `downloadStateFromIndex()`（archive-core.js）和 `refreshDownloadStatuses()`（library.js）各写了一份。4.8 加「手动标记」时只改了前者，而 `refreshDownloadStatuses()` 挂在 `window` 的 `focus` 事件和 `visibilitychange` 上——**用户切到别的界面再回来就会触发它，把手动标记冲掉**；刷新走的是 `scanRoot`（用的前者），所以刷新又恢复正常。现象很迷惑：同一个状态，刷新和切页面结果不一样。

**推论**：任何"从磁盘状态推导出来的字段"都只允许有一个计算入口。如果发现第二处，把它改成调用同一个函数，而不是复制判断条件。

### 绝对路径的来源（4.8.2）

浏览器**不会**把文件夹的绝对路径给网页（File System Access API 有意如此），manifest 里也没有 `downloads` 权限。所以绝对路径只有两个来源：

1. **Windows 原生目录助手**（`resolve-directory` action，返回 `targetPath`）——首选
2. **用户在下载页手填的下载根目录**（`chrome.storage.local` 的 `downloadRootPath`）——助手不可用时的退路

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
- **纯 local 残影的复位要求 `importState.updatedAt` 超过 90 秒**，避免把"刚正常结束还没落盘"误判成中断。有 session 断点时立即复位、不受这个窗口影响。
- **回滚日志（journal）现在跨进程存活**：存在 `chrome.storage.session`，只存**名字**（收藏夹名/目录名/文件名/被改写原文），回滚时按名字重取句柄——句柄不能序列化。原文总预算 2MB，超出的标 `textUnavailable` 并如实报数。**没有做"自动续跑"**：SW 被回收后 Promise 链、句柄与调用作用域全没了，无法原地恢复。交付的是"精确告知断点 + 重新导入按 BV/av 跳过已写入 + 按名字回滚"。
- **风控识别是导入链路的新防线**：HTTP 412 / `code === -412` / `-352` → `error.rateLimited`。**分页与失效恢复接口一旦 412 会立即中止整轮**（不走"连续 5 条"阈值），只有逐条详情走阈值。判断依据是"被限流还继续翻几百页"更危险。连带修掉一个数据损失风险：`refreshOneArchiveStatus` 以前把**任何**数字 `apiCode` 当"视频已失效"，而限流 `-412` 也带 `apiCode` → 会把整批还能看的视频错标成「已失效视频」。现在限流先 rethrow。
- **封面是 320×180 WebP，文件名 `封面.webp`**。4.9 前写的 `封面.png`（真 PNG，均值 1.6 MB）**原样保留、不迁移、不重下**；读取侧优先 `封面.webp`、退回 `封面.png`，存在性检查两个名字都认。**注意**：不要为了"打开旧封面"而把 WebP 字节写回 `封面.png` —— 那样 MIME 会按扩展名推断成 `image/png`，只能指望浏览器嗅探内容，是审计点名的唯一跨文件语义风险。
- **`saveImportedItem` 是先封面、后 `视频信息.txt`**，让 txt 充当"完成标记"。中途被杀只会留下没有 txt 的目录，下次导入会重做，而不是留下"有 txt 没封面"被当成完整记录。`recordNeedsRefresh` 增加了封面存在性判据。
- **缓存淘汰改成了 LRU，封面 URL 用引用计数后再 revoke**：一个 blob URL 有两类持有者（缓存条目 + 由它派生的 video 对象）。**淘汰即 revoke 会在最需要淘汰的 >4000 条场景造成裂图**（卡片封面是 `loading="lazy"`，没滚到的还没取图）。计数归零才 revoke，`beforeunload` 兜底。**改动时不要为了"更及时"提前 revoke。**
- **60 秒定时重扫已移除**（那条 `setInterval` 在 10000 条时每分钟打 12000 次文件系统调用）。触发路径只剩 `focus` / `visibilitychange` / `downloadRevision` 变化。**不要加回来。**
- **`background.js` 已纳入 i18n 提取器的扫描范围**（`test/i18n-extract.cjs` 的 `SOURCE_FILES`）。它用 `BcaI18n.t("字面量")` + 一个存在性兜底；不纳入扫描的话新词条永远进不了词典——4.9 的 6 条就是这样漏掉过一次。

### 已知限制（4.9 审视结论，未修的部分）

一次覆盖 约 8800 行 JS 的只读审视确认了下面这些是**已知且暂不修**的限制。**不要把它们当 bug 去"顺手修掉"——每一条都有取舍理由。**

- **主测试套件是文本级断言，不执行被测代码**（这一条在 V1.0.0 之后有所缓解：`test/archive-core.test.cjs` 的 59 项是真执行的，见「常用验证」）。`stability.test.cjs` 的其余断言是"把文件当文本读 + 正则匹配"。它**看不见语法错误**（4.8.2 真的漏过一次：`library.js` 有语法错误但 104 项全绿）。唯一能发现解析错误的是 "every shipped script actually parses" 那条（用 `vm.Script`）。**改完代码必须单独跑 `node --check`。**
- **配置没有版本迁移**。`CONFIG_VERSION = 1`，导入配置时只校验结构不做迁移。将来升版本必须补。
- **没有多标签页互斥**。两个标签页同时打开同一归档、同时做写操作（标记已下载 / 删除 / 移动）没有锁。日常使用很难触发，但理论上存在竞态。
- **没有归档完整性校验与备份机制**。`视频信息.txt` 损坏就是永久丢失，插件没有校验和、没有导出元数据的功能。
- **原生宿主名仍是 `com.bcatch.folder_opener`**（`b_catch` 时代的名字），宿主版本号仍是 `3.8.0`。**改名会让所有已安装用户的注册失效**，所以要么不改，要么改的时候写迁移脚本。
- **扩展 ID 由插件所在目录的绝对路径决定**，所以**每次改文件夹名都需要重新加载扩展并重跑 `install-native-folder-opener.ps1`**。这是 Chrome 的机制，绕不过去，只能靠文档提醒。
- **`openDb` 在 `library.js` / `popup.js` / `download.js` 里各有一份**，其中前两份缺少 `objectStoreNames.contains` 守卫（当前版本号都是 1、升级只跑一次，所以没暴露；一旦有人把版本号改成 2 就会抛 `ConstraintError`）。
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

- **目录命名只有一份实现**：`videoDirectoryLabel()` / `safeName()` 在 `archive-core.js`，`download.js` 和 `library.js` 都调它。**不要在任何一边重新实现**——手动标记建的目录必须和下载器建的目录同名（至少 ` - BV号` 后缀一致），否则将来真下载时 `findOrCreateVideoDirectory` 认不出来，会又建一个副本。
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
- **使用须知现在是七条**（新增「不要移动插件文件夹位置」）。三个界面必须逐字一致，测试断言条数为 7。

### 收藏库的性能与可访问性（4.6）

- **增量扫描**：`scanRoot()` 现在带缓存。键 = `收藏夹/目录名`，值 = `{size, lastModified, 解析结果}`；按根目录 handle 用 `WeakMap` 发自增 id 隔离。命中时**只调 `getFile()` 取元数据、不读正文**；`size` 或 `lastModified` 变一个字节就只重读那一条。目录列表**每轮重新枚举**，所以新增/删除目录一定反映。
  **三个必须守住的点**：① 缓存键含 `lastModified`，但外部工具若保留原 mtime 改写文件会漏判 —— 所以「刷新」按钮走 `forceFullScan = true` + `clearArchiveCache()`，**这条退路不能删**；② 缓存里的记录对象被 `video.info` **共享引用**，将来任何代码都不许就地修改它，要改就赋新对象；③ 单根目录缓存上限 4000 条，超出整体清空一次（退化成一次性全量，不会出错）。
- **封面 URL 生命周期**：blob URL 现在由缓存持有、页面卸载时统一 revoke（不再每轮扫描重建）。好处是不再泄漏 objectURL；代价是记录被删或换根目录后，旧 URL 要等到 unload 才释放，超大库长时间开着页面内存占用比以前高。
- **焦点陷阱**是手写栈（`trapFocus()`），目前注册了 `#confirmBackdrop` 与 `#detailPanel`。**再加第三层浮层时必须把它也注册进去**，否则 Tab 会穿透。
- **配置导出**绝不能带上目录句柄、B 站数据或错误报告内容（测试会扫导出代码块里有没有这些标识符）。导入只校验结构与枚举值，`CONFIG_VERSION` 升级时需要补迁移。
- **主题到内容脚本的链路**：扩展页写 `localStorage`（首屏同步防闪色）+ 镜像到 `chrome.storage.local`；`content.js` 读 `chrome.storage` 并监听 `onChanged`。卡片根节点的属性是 `data-bca-theme`，**故意不叫 `data-theme`**——它挂在 B 站页面上，避免和宿主页面的选择器撞车。

### 交互外壳（4.5.1）

- **主题与语言的悬浮球**：收藏库右下角两个固定球（`.floating-dock`，`position: fixed; z-index: 6`），点开是 `.dock-menu` 浮层。菜单由 `renderDockMenus()` 重建，球的图标跟着 `BcaTheme.current()` 走（`THEME_ICONS` 映射 monitor/sun/moon）。**主题名要翻译**（`跟随系统/白天/夜晚` 是界面文字），**语言名不翻译**（`简体中文/繁體中文/English` 是各语言自称）。
- **插件弹窗的分段控件**：`.segmented`，按钮用 `aria-pressed` 表达选中。**主题按钮的文字必须套 `<span data-i18n>`**——按钮里还有 `<span class="segmented-icon">` 图标，`data-i18n` 用 `textContent` 会把图标清掉。
- **新建收藏夹**在收藏夹列表之后（`.collection-create-tail`），不要再放回「我的收藏夹」标题行。
- **更新视频状态必须过确认框**（`openStatusConfirm` → `#statusConfirm`）：单条与批量共用，批量走 `selectedRecords()`（**不是 `selectedVideos()`**——后者是当前收藏夹的全部视频，用错会把整个收藏夹刷一遍，正好是最容易触发风控的行为）。上限 `STATUS_BATCH_LIMIT = 80`，超出部分提示分次继续。
- **logo 三处同源**：`library.css` 的 `.brand-mark`、`popup.css` 的 `.brand-icon`、`background.js` 里 `updateActionIcon()` 用 OffscreenCanvas 画的工具栏图标。改观感时三处一起改，并保留「关闭自动归档 → 转灰」的行为（灰色也有渐变）。

### 使用须知（4.4 新增）

同一份**七条**安全声明必须同时出现在 `library.html`、`download.html`、`popup.html`，**逐字一致**（测试会逐条比对）。

4.4.1 起：三处统一用 --warning-soft / --warning-line 黄色底、正文 --fs-md(15px)；收藏库默认展开、可折叠，但**不允许永久关闭**（dismissSafety 按钮与 safetyNoticeDismissed 写入都已删除，只保留一次性的旧标记清理）；弹窗里**置顶**（排在 brand-row 之前）且默认折叠，避免把 600px 高的弹窗撑开。**新增任何界面入口时，请一并带上这份声明，或明确说明为什么不需要；也不要把「不再提示」加回来。**

4.5 起：**「请勿滥用……」一条必须排在最前面**（测试会断言第一条以「请勿滥用：」开头，且三个界面的**七条**文字完全一致）。条目上带 data-i18n，其中含 DownKyi 链接的那条用 data-i18n-html。

### 本地收藏库

`library.js` 通过 File System Access API 读取本地目录，只认下列视频归档结构：

```text
根目录/
└── 收藏夹名称/
    └── YYYY年M月D日H时M分S秒[_n]/
        ├── 视频信息.txt
        └── 封面.webp（4.9 前的老档案是 封面.png，读取时两个名字都认）
```

解析视频信息时依赖“【基本信息】”区块和“视频标题”等字段。不要轻易改变文件名或目录格式，否则旧档案可能不再被识别。列表中的收藏夹和视频信息是本地扫描的结果；线上 B 站收藏不会因移动/删除本地记录而改变。

移动或复制操作先按目标收藏夹判断 BV/av 重复项，再复制归档文件。勾选原收藏夹表示保留原件（复制）；不勾选表示移动。删除收藏夹/视频/批量视频前会确认；用户可额外勾选同时删除关联下载，默认不删除下载。

### 下载与“已下载”状态

默认下载布局：

```text
根目录/
├── 000视频下载/
│   └── 收藏夹名称/
│       └── 视频标题 - BV号/av号/
└── 001错误报告/
```

旧设置的自定义下载目录仍可用，布局也是“下载根目录/收藏夹/视频目录”。`download.js` 负责目录选择、下载流、保存和进度；`background.js` 负责通过 B 站接口解析视频、播放流和字幕。

3.6 关键状态规则：

- 从本地收藏库进入下载页时，收藏夹名要随队列项传入解析结果。通过 `chrome.storage.session` 的 `bcaDownloadQueue:<UUID>` 传递队列，避免把大 JSON 放到 URL。`archive-core.js` 的 `withSourceCollection()` 用于保留来源收藏夹。
- 同一收藏夹下按 BV/av 号查找并复用已有目录，防止重复下载生成 `(2)`、`(3)` 目录。
- `已下载` 徽标仅由媒体文件决定：mp4、mkv、webm、m4s、flv、mov、avi。封面、字幕或信息文件单独存在时不标记已下载，但详情页仍可打开含有文件的目录。
- 下载目录扫描权限暂时不可用时，保留已知状态；确认读取到空目录后才清除状态。
- 取消时只清理本次任务新建的目录。复用的旧目录及其中已完成文件不能删除。
- 3.5 曾把视频错误写到 `未分类收藏`。3.6 会按 BV/av 识别旧目录并显示状态，也会在管理动作中查找它们；不会自动搬动旧文件。
- 发生下载失败时，`download.js` 尝试将错误详情保存到根目录 `001错误报告`。若根目录写入授权不可用，页面日志会说明失败原因。

下载后写入 `chrome.storage.local.downloadRevision`，收藏库监听此变化并扫描状态；页面聚焦/显示时检查，前台不再定时重扫（4.9 已移除 60 秒定时器，改为 focus / visibilitychange / downloadRevision 变化时触发）。

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
保存文件夹：2026年10月09日01时19分50秒
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
| `bca-download-parse` | `download.js` → `background.js` | 解析 BV/av/视频网址 |
| `bca-download-playurl` | `download.js` → `background.js` | 获取视频播放流 |
| `bca-download-subtitles` | `download.js` → `background.js` | 获取字幕列表 |
| `bca-page-api-get` | `background.js` → `favorites-import.js` | 通过已登录页面上下文发起收藏夹 API 请求 |

后台还保留 `record-favorite-error` 消息处理器，但当前项目内没有找到活跃发送端。若要清理它，先确认外部/旧版页面没有依赖。

异步消息处理器需保持 `sendResponse` 和 `return true` 的配对。修改 API 时不要把 Cookie、CSRF 或用户授权数据写入日志/错误报告。

## 设置和状态保存位置

**IndexedDB**：数据库 `bili-fav-archiver`，对象仓库 `settings`。常用键：

- `rootHandle`：本地收藏根目录的 FileSystemDirectoryHandle。
- `downloadFolder`：自选下载目录句柄。
- `downloadFolderMode`：`default` 或 `custom`。

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

**`chrome.storage.session`**：临时批量下载队列，键名 `bcaDownloadQueue:<UUID>`。下载页读取后删除。

## 常用验证

在项目根目录执行：

```powershell
node test/stability.test.cjs
```

当前包含 **127 项检查**（126 项静态回归 + 1 项把 `test/archive-core.test.cjs` 的 59 项真执行单元测试并进来）。静态部分按功能代次分组，分组标题里的版本号就是它们守护的那一轮改动，
可以在 `test/stability.test.cjs` 里直接按 `/* ---- … ---- */` 跳转。

- **归档与下载匹配**（开头，9 项）：下载队列的收藏夹传递、BV/av 与旧版数字目录的识别、` - BV号` 后缀、媒体文件徽标判据、原生消息清单不带 `args`、宿主按 UTF-8 读设置。
- **表现层静态回归**（4.0，9 项）：设计令牌与图标、`[hidden]` 兜底、11px 字号下限、不用字符图标、扩展页不暴露给网页。
- **历代功能回归**：4.1 归档解析与浏览（7）、4.2 导入重构与展示（8）+ 归档整条重写（4）、4.3 安全加固（5）、4.4 更新视频状态与须知（9）、4.6 收藏库改造（18）、4.7 细节修复（6）、4.8 标记与站外搜索（5）、4.8.1 入口与分页（5）、4.8.3 美化（2）。
- **4.5 主题与多语言**（5 项）+ **多语言词典**（15 项）：深色令牌两处必须一致、文字对比度达标、`theme.js` 三种模式解析、`i18n.js` 原文回退与占位符、内容脚本走后台取词典且不碰宿主页面、`t()` 只能是字面量、真实文件名不得被译、`data-i18n` 与元素文字逐字一致、词典覆盖率。
- **4.9 全面修复**（18 项）：缓存单条淘汰、封面 URL 引用计数、不再定时重扫、筛选池按需重建、下载根目录缺失 ≠ 空、封面 WebP 与两代文件名、后台保活、风控识别、先封面后 txt、短页不算分页缺口、中止仍带日志、页面 412 必须退回、口径差额只说明不算失败、扫描进度不能写容器、默认下载目录按需创建。

其中多项是**从生产文件里抽源码执行的**（`loadBackgroundFunctions` / 沙箱加载 `theme.js`、`i18n.js`、`formatCount`），测的是真正跑起来的那份实现，不是复制品。

**另外要清楚这套测试的盲区**：「每个脚本能否真正解析」那一项会用 `new vm.Script()` 把每个 JS 真编译一遍——文本级正则断言看不见语法错误，这条是专门补那个盲区的（4.8.2 真的靠它拦下过一次）。其余断言绝大多数是**读文件比对文本**，不是执行代码，所以它们能证明「约定没被违反」，不能证明「功能真的能跑」。改动逻辑之后仍然要在真机上验证。

另外在本地归档上跑一次体检（统计有多少条记录其实没有标签或简介）：

```powershell
node test/archive-audit.cjs "<你的收藏根目录>"
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
node test/import-trial.cjs "<你的收藏根目录>" 3
```

每次改动还应执行：

1. 对所有 `.js` 执行 `node --check`。
2. 解析 `manifest.json` 并确认脚本、弹窗等本地引用存在。
3. 检查每个 HTML 的本地 JS/CSS 引用存在，确认 `library.html` 和 `download.html` 在业务脚本之前加载 `archive-core.js`。
4. 若改动 PowerShell，使用 PowerShell Parser 解析所有 `.ps1`，不要仅靠运行安装脚本验证。注意本机执行策略禁止直接运行 `.ps1`，要用 `powershell.exe -NoProfile -ExecutionPolicy Bypass -File …`。
5. 读取 `manifest.json`、`settings.json` 一类 UTF-8 文件时显式指定编码，PowerShell 5.1 的 `Get-Content` 默认按 ANSI 读取，中文会乱码。
6. 改动原生助手时，重新运行安装脚本（沙箱验证可加 `-SkipRegistry -HostRoot <临时目录>`）并执行 `test-native-folder-opener.ps1`，它会真正按帧协议调用编译出的启动器。
7. 有条件时在 Chrome 加载扩展，登录 B 站验证收藏、导入、下载、暂停/取消、移动/删除和徽标状态。Node 检查不能替代真实 B 站登录/API 测试。

## 已知限制与历史背景

- B 站收藏弹窗、收藏夹 API、播放流权限和失效视频恢复来源可能变化；发生 API 变化时优先保留现有部分结果和错误报告，不要因单条失败中断整个批次。
- 失效视频只有在 B 站的 APP 收藏、稍后再看、观看历史或其他资料源中仍有记录时才可能恢复；无法找回时缺失字段用“未知”。
- Native Messaging 仅用于 Windows 资源管理器打开目录。它的清单不允许 `args`，`path` 必须是无参数可执行文件；没有安装或设置不正确时，网页不能直接启动 Explorer，详情页必须保留“复制视频目录路径”这类退路提示。
- 用户曾报告收藏成功但本地归档失败，并看到 B 站收藏弹窗提示 `The next() called multiple times`。另一次控制台网络错误指向 Kaspersky 浏览器组件的 `gc.kis.v2.scr.kaspersky-labs.com`。后者不是本项目域名；判断归因前需在禁用相关第三方扩展的环境中复现。不要把这类外部错误直接归为本扩展故障。
- 3.8 修复的两个原生助手缺陷都是运行时问题，Node 静态检查发现不了：一个是 Chrome 静默忽略清单 `args`，一个是 PowerShell 5.1 的默认 ANSI 读取。改动这一块必须跑 `test-native-folder-opener.ps1`，不能只做语法检查。
- 待确认（尚未定性）：`content.js` 在 MV3 隔离世界中读取页面变量 `window.__INITIAL_STATE__`，而清单未声明 `world: "MAIN"`，该变量很可能始终读不到，元数据实际走 DOM/meta 回退，自动归档的“分区/视频时长/视频发布时间/标签”容易落成“未知”。需要用一份真实的 `视频信息.txt` 核对后再决定是否改用其他采集方式。
- **归档数据本身的完整度**（4.1 实测用户档案 333 条记录）：只有 75 条（22.5%）有标签、142 条（42.6%）有简介，150 条（45%）两者都没有。根因是导入流程里 `normalizeImportMedia()` 把 `tags` 硬编码为 `[]`，且只有失效视频会去抓资料。4.1 负责把这些数据正确地显示出来，**4.2 负责在导入/更新时把它们抓全**——对已有档案执行一次「导入或更新」，缺失的标签、发布时间、粉丝数与互动数据都会被补上。
- **一个已证实的数据错误**：`蜡笔小新/2026年10月09日01时19分50秒` 的归档里 `UP主UID` 写成了 `1515305135`，而接口返回的真实 `owner.mid` 是 `87795103`。抽查另外 4 条记录都是对的，怀疑是收藏夹接口在个别条目上返回了错误的 `upper`。4.2 因为改从 `/x/web-interface/view` 取 UP 主信息，执行一次更新即可修正这类记录。
- 4.2 的导入会对每条视频发 2–3 个请求（view + tags + 每个 UP 一次的 relation/stat），**这是用户明确要求的完整抓取**。**注意速率在 4.3 已下调为串行 + 每条间隔 800ms**（原为并发 2 + 350ms）；如果将来风控变严，应先调 `IMPORT_DETAIL_CONCURRENCY` / `IMPORT_DETAIL_DELAY_MS`，而不是回到“只补缺失字段”的老逻辑。
- 3.7 的下载目录日志修复仍建议在 Chrome/B 站实际触发一次验证，因为历史报告表明错误发生在目录创建的运行时路径。

### 已知限制（4.5）

- **后台文案不参与多语言**。`background.js` 是模块化 service worker，加载不了经典脚本；它产出的导入进度文本、错误消息、`001错误报告` 里的正文都固定为简体中文。界面显示处会对静态串做一次 `t()`（能翻的会翻），但带变量的动态串（例如「正在更新视频状态 3/20：xxx」）会保持中文。
  要做全的话，需要把后台改成回传**消息键 + 参数**、由界面渲染，属于一次独立重构。
- **报告文件不入词典**。`001错误报告/` 与 `视频信息.txt` 属于归档数据，保持单一语言便于长期比对。
- **`data-i18n` 只能用在纯文本元素上**。带图标或子元素的必须套一层 `<span data-i18n>`，否则 `textContent` 会把子元素清掉。
- **主题如何到达内容脚本（4.6 已解决，这里记做法）**。主题存在 `localStorage`（为了让页面在 `<head>` 里同步应用、不闪浅色），而内容脚本跑在 B 站页面里，读到的是**宿主页面的** `localStorage`，拿不到扩展的那份。4.6 的做法是：`theme.js` 在写 `localStorage` 的同时**镜像一份到 `chrome.storage.local`**，`content.js` 从那里读，两边靠异步对账保持一致。**4.5 时期提示卡只跟随系统，这个问题已经修好了**——不要再按「到不了内容脚本」去改。
- **繁体中文与英文词典由本项目的词条工具校验覆盖率**，**漏译不会报错、只会回退成中文**，所以要靠 `test/i18n-extract.cjs --check` 兜底。
## 合规与安全红线（4.3 确立，后续改动不得突破）

4.3 做过一次完整的安全与合规审计，结论与约束记录如下。

**合规事实**：本项目会代替用户自动请求 B 站接口并下载内容，触碰《哔哩哔哩弹幕网用户使用协议》**4.3.15**（禁止以任何自动程序/脚本获取平台服务、内容、数据）、**1.2**（服务与平台分离）、**1.3**（官方途径是唯一合法方式）、**6.5**（禁止私自转载传播）。协议没有为个人自用归档留例外；后果条款是 **2.6 / 8.3**（可删除账号、暂停或永久停止服务）。这是所有第三方下载类工具的共性处境，不是本项目特有的缺陷。**真正的法律风险在用户分发下载文件的那一刻**，因此 README 必须保留「合规与使用边界」一节。

**由此确立的硬约束**：

1. **导入必须保持低速**：`IMPORT_DETAIL_CONCURRENCY = 1`、`IMPORT_DETAIL_DELAY_MS >= 600`（当前 800）。测试会断言每秒请求数 ≤ 2。**不要为了性能调回去**；要提速请先和用户确认。
2. **失效视频恢复必须保持可选**：它伪造成官方 iOS 客户端（`platform: ios, mobi_app: iphone`）请求 APP 接口，是合规上最勉强的一环。**用户已明确要求 4.4.1 起默认开启**，因此默认值改为开，但**开关必须保留**——`enrichImportedInvalidVideos()` 只能被 `recoverInvalidVideos` 包住调用，用户取消勾选后必须真的不执行。
3. **不得新增写操作**：全项目只有 GET。任何 POST/PUT/DELETE 都可能改变用户线上账号状态，属于必须避免的类别。
4. **不得新增第三方域名**：出网只能到 bilibili.com / hdslb.com / bilivideo.com(.cn) / akamaized.net。不要引入任何统计、遥测、CDN 或"更新检查"。
5. **不得引入远程代码或 npm 依赖**：无 `eval`、无 `new Function`、无动态插标签；MV3 默认严格 CSP。
6. **扩展页不得对网页开放**：不要重新添加 `web_accessible_resources`；需要从内容脚本打开扩展页时，走 `bca-open-library` 让后台 `chrome.tabs.create`。`library.js` 顶部的 `window.top !== window.self` 防嵌套检查必须保留，且早于任何目录读取。
7. **错误报告必须带提示行**：`ERROR_REPORT_NOTICE` 常量与 `persistErrorReport()` 的兜底拼接不要删，报告里含本地路径与视频链接。
8. 改动以上任一项前，先回到这一节确认，并在汇报里说明原因。


## 修改原则

1. **发布走 `release.ps1`，不要手工改版本号**。它会检查工作区与代理 → 改 3 处版本号 → 跑全部检查 → 不过就回滚 → 提交 → 打 tag → 推送。用法：`.\release.ps1 -版本 1.0.1 -说明 "修了 xxx"`。发布前照 `SMOKE_TEST.md` 走一遍真机六项。
2. 先读本文件、`README.md`、相关页面和消息两端，不要只改单侧响应协议。
3. 保持用户本地文件格式向后兼容，尤其是时间目录、`视频信息.txt` 字段名、`000视频下载`/`001错误报告` 和历史 `未分类收藏` 下载。
4. 目录删除、移动、覆盖属于数据操作；保持显式确认，复制失败时回滚新建目录，不删除未被明确选中的下载文件。
5. 界面改动遵守上文“界面与设计系统”的六条约定；改完跑 `node test/stability.test.cjs`，它会拦住字号回退、字符图标复活和页面漏引 theme.css/icons.js。
6. 原生消息清单绝不添加 `args`；`.ps1` 与 `.cs` 源文件保存为 UTF-8 带 BOM，读取 UTF-8 配置时显式写 `-Encoding UTF8`。改完原生助手要重新编译并跑自检脚本。
   **注意：通用的文本编辑工具会静默去掉 BOM。** 2026-10-10 改 `release.ps1` 时就发生过一次——编辑后前 3 字节从 `239,187,191` 变成了 `60,35,10`。**用工具改完任何 `.ps1` / `.cs` 之后，都要重新确认 BOM 还在**，否则 PowerShell 5.1 解析中文会出错：
   ```powershell
   $b = [System.IO.File]::ReadAllBytes('release.ps1'); $b[0..2]
   # 必须是 239 187 191；不对就重写一遍：
   $t = [System.IO.File]::ReadAllText($p, [System.Text.Encoding]::UTF8)
   [System.IO.File]::WriteAllText($p, $t, (New-Object System.Text.UTF8Encoding($true)))
   ```
7. 完成后报告改动内容、检查方式和未验证的真实环境行为。

