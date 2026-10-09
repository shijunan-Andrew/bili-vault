# AI 项目交接说明：B站收藏信息归档 4.2

本文面向后续接手代码的 AI，记录当前项目结构、数据流、关键约束和验证方法。请先阅读本文，再看 [README.md](README.md) 和相关源文件。

## 项目基线

- 项目目录：`C:\Users\Maxwell\Desktop\b_catch\b_catch_4.2`（历史版本另存于 `C:\Users\Maxwell\Desktop\cdx1\b_catch_1.0` … `b_catch_3.8`）。
- 扩展版本：`4.2.0`，Chrome Manifest V3，最低 Chrome 版本 111。
- `b_catch_4.1beta` 是 4.2 的来源基线，原目录保持不变。用户要求版本间使用独立目录；后续版本继续使用新目录并保留历史版本，除非用户明确要求直接改当前目录。
- **4.2 是继 4.1beta 之后第二次大改底层**：重写了导入/更新流程（每条视频都抓完整资料、支持暂停取消回滚、区分全量导入与增量更新），并调整了 `视频信息.txt` 的排布（新增 `UP主粉丝数` 与 `【互动数据】` 区块、简介剥离 B 站分享文案）。磁盘目录结构不变。
- 项目没有 npm 依赖或打包步骤。扩展直接从 `chrome://extensions` 加载解压目录。原生辅助程序是唯一需要“构建”的部分：安装脚本用系统自带 `csc.exe` 把 `native\folder-opener-launcher.cs` 编译成宿主启动器。
- 用户主要使用中文界面和 Windows/Chrome。回答修改结果时用中文、清楚说明文件、行为变化和检查结果。
- 注意：Chrome 的扩展程序 ID 由插件所在**绝对路径**推导。换目录（3.8 → 4.0）ID 就会变，安装原生助手时必须填入新 ID。

## 功能概览

1. 在 B 站视频页确认收藏后，将视频信息和封面写入用户选择的本地目录。
2. 在 B 站个人空间收藏夹页选择收藏夹，批量导入或更新本地归档；对失效视频尝试恢复可找回的信息。
3. 打开本地收藏库后，按固定目录结构解析视频，支持搜索、筛选、详情、新建/删除收藏夹、添加视频、移动/复制、批量操作。
4. 下载视频、音频、弹幕、字幕、封面和信息文件；暂停/继续、取消，并在卡片同步下载状态。
5. 通过可选的 Windows Native Messaging 辅助程序，在文件资源管理器打开视频目录。

## 目录结构

```text
b_catch_4.1/
├── manifest.json                 # MV3 权限、后台 worker、页面脚本注册、library.html 的 web_accessible_resources
├── background.js                 # 保存、导入、视频 API、错误报告、后台消息路由（4.0/4.1 未改动）
├── content.js                    # B 站视频页：监听收藏操作、采集视频数据 + 4.0 重写的提示卡
├── favorites-import.js           # B 站收藏夹页：提供页面 API 代理和导入入口
├── theme.css                     # 4.0 新增：唯一的设计令牌与通用基元（所有页面共用）
├── icons.js                      # 4.0 新增：线性 SVG 图标，替代字符图标
├── popup.html/js/css              # 插件弹窗、自动归档开关、根目录和导入界面
├── library.html/js/css            # 本地收藏库页面（4.1 加分页与网格/竖列切换）
├── archive-core.js                # 可复用的纯逻辑：安全名称、下载目录匹配、下载路径、视频信息解析、页码序列
├── download.html/js/css           # 视频解析和下载界面
├── native/
│   ├── folder-opener-launcher.cs  # 原生消息宿主启动器源码（编译成 exe）
│   └── folder-opener-host.ps1     # 原生消息主机工作脚本
├── install-native-folder-opener.bat / .ps1
├── uninstall-native-folder-opener.ps1
├── test-native-folder-opener.ps1   # 不依赖 Chrome 的安装自检脚本
├── test/stability.test.cjs         # Node 内置测试，无第三方依赖
├── test/archive-audit.cjs          # 本地归档的标签/简介覆盖情况体检
├── test/import-trial.cjs           # 4.2：只读预览导入会抓到什么，不改任何文件
├── README.md                       # 面向使用者的安装与功能说明
└── AI_HANDOFF.md                   # 本文件
```

4.0 删除了 `download-folder.html/js/css`（3.2 之后就被原生助手取代，全项目零引用）。

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

后台串行执行保存操作，读取 IndexedDB 中的根目录句柄，检查写入权限，在每个实际收藏夹下创建时间目录，保存 `视频信息.txt` 和 `封面.png`。保存失败时尝试写入 `001错误报告`，并把最近状态、错误详情放入扩展存储供弹窗展示。

### B 站收藏夹导入

`favorites-import.js` 注入个人空间收藏夹页，为后台请求提供页面上下文 API 代理，并接收列表收藏夹、导入所选收藏夹的消息。`popup.js` 展示可选列表和导入进度。后台分页获取收藏视频、对本地 BV/av 去重，并写入与自动归档相同的目录格式。

失效视频恢复逻辑主要在 `background.js`：尝试从 APP 收藏夹数据、稍后再看、观看历史和视频资料等来源恢复标题、封面、UP 主及其他字段。未找回的字段应保留为“未知”；封面无法恢复时使用占位图，避免本地库漏掉该记录。B 站接口和页面结构会变化，导入失败时应保留部分已成功结果并记录错误。

### 导入/更新流程（4.2 重写）

`importBiliFavorites()` 现在按下面的顺序跑，每个循环迭代开始都调 `importWaitIfPaused()`：

1. 列远程收藏夹 → 逐个读分页（`/x/v3/fav/resource/list`）。
2. 本地同名收藏夹**不存在**就新建（记进回滚日志），**存在**就读取已有记录（`readExistingImportRecords()` 同时返回去重标识符和每条记录的原文）。
3. 按 BV/av 把远程条目分成「缺失的」和「已存在但 `recordNeedsRefresh()` 为真」的两类。
4. 失效视频先走原有恢复流程（APP 收藏夹 / 稍后再看 / 观看历史）。
5. **对上面两类条目都抓一次完整资料**：`fetchImportDetails()` → `fetchVideoDetail()` 调 `/x/web-interface/view`（简介、发布时间、分区、时长、UP 主、`stat`）与 `/x/tag/archive/tags`（标签），再调 `/x/relation/stat` 取 UP 主粉丝数（`upFansCache` 按 mid 缓存，同一个 UP 只请求一次）。并发 2、间隔 350ms。
6. 已存在的记录用 `refreshImportedRecord()` 按新格式重写，**保留原来的收藏时间与目录名**，原文进回滚日志。
7. 缺失的条目批量下载封面后写入（`saveImportedItem(..., journal)`，目录句柄先登记再写）。

**暂停 / 取消 / 回滚**：`bca-import-control` 消息设置 `importRun.paused/cancelled`；暂停时 `importWaitIfPaused()` 用 Promise 挂起，继续或取消时 `importReleaseWaiters()` 唤醒。取消会抛 `ImportCancelled`（`error.name`），在最外层捕获后调用 `rollbackImport(journal)`：先删 `createdRecords`、再按 `modifiedFiles` 还原原文、最后清掉本次新建且为空的收藏夹。进度通过 `chrome.storage.local.importState` 持久化，所以弹窗关掉再打开也能恢复按钮状态；`get-status` 会带上 `importState`。

**接口抓不到数据的处理**：`/x/web-interface/view` 的 `desc` 对不少视频就是空的或 `-`（实测 `BV1LKGm6ZErR` 返回 `-`），这时简介会退回收藏夹接口 `intro` 清理后的文本；`stat` 通常都有。

### 本地收藏库

`library.js` 通过 File System Access API 读取本地目录，只认下列视频归档结构：

```text
根目录/
└── 收藏夹名称/
    └── YYYY年M月D日H时M分S秒[_n]/
        ├── 视频信息.txt
        └── 封面.png
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

下载后写入 `chrome.storage.local.downloadRevision`，收藏库监听此变化并扫描状态；页面聚焦/显示时检查，前台定时扫描间隔为 60 秒。

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
- 还可能包含导入任务进度及其他 UI 状态；改动前搜索全项目读写点。

**`chrome.storage.session`**：临时批量下载队列，键名 `bcaDownloadQueue:<UUID>`。下载页读取后删除。

## 常用验证

在项目根目录执行：

```powershell
node test/stability.test.cjs
```

当前包含 36 项检查：9 项纯逻辑回归、9 项表现层静态回归、7 项 4.1 回归（占位值按无数据处理、真实标签与多行简介解析、以破折号开头的简介不被误判、空标签占位符不再抢占 `.detail-description`、已下载标题绿色且失效优先红色、B 站式页码窗口、分页与视图切换的接线），以及 11 项 4.2 回归（background 与 archive-core 的分享文案拆分必须一致、真实档案的分享文案被正确拆分、`recordNeedsRefresh` 只挑出真正不完整的记录、新格式含粉丝数与独立互动数据区块、暂停/取消/回滚与三个接口的接线、登记先于写入、弹窗暂停取消与状态恢复、网页端占用统计与提示条、补全功能彻底移除）。无第三方包。

其中 4.1beta 的两项会**从 `background.js` 里把函数源码抽出来执行**（`loadBackgroundFunctions`），因为 background.js 是模块化 service worker、无法 `require`；这样测到的就是生产代码本身，而不是复制品。

另外在本地归档上跑一次体检（统计有多少条记录其实没有标签或简介）：

```powershell
node test/archive-audit.cjs "C:\Users\Maxwell\Desktop\本地收藏夹"
```

只读预览 4.2 的导入会抓到什么（不改任何文件，适合改完接口逻辑后先验证）：

```powershell
node test/import-trial.cjs "C:\Users\Maxwell\Desktop\本地收藏夹" 3
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
- 4.2 的导入会对每条视频发 2–3 个请求（view + tags + 每个 UP 一次的 relation/stat），**这是用户明确要求的完整抓取**。并发 2、间隔 350ms；如果将来风控变严，应先调 `IMPORT_DETAIL_CONCURRENCY` / `IMPORT_DETAIL_DELAY_MS`，而不是回到“只补缺失字段”的老逻辑。
- 3.7 的下载目录日志修复仍建议在 Chrome/B 站实际触发一次验证，因为历史报告表明错误发生在目录创建的运行时路径。

## 修改原则

1. 先确认目标版本目录，再编辑；按用户的版本目录习惯保留已发布稳定版。
2. 先读本文件、`README.md`、相关页面和消息两端，不要只改单侧响应协议。
3. 保持用户本地文件格式向后兼容，尤其是时间目录、`视频信息.txt` 字段名、`000视频下载`/`001错误报告` 和历史 `未分类收藏` 下载。
4. 目录删除、移动、覆盖属于数据操作；保持显式确认，复制失败时回滚新建目录，不删除未被明确选中的下载文件。
5. 界面改动遵守上文“界面与设计系统”的六条约定；改完跑 `node test/stability.test.cjs`，它会拦住字号回退、字符图标复活和页面漏引 theme.css/icons.js。
6. 原生消息清单绝不添加 `args`；`.ps1` 与 `.cs` 源文件保存为 UTF-8 带 BOM，读取 UTF-8 配置时显式写 `-Encoding UTF8`。改完原生助手要重新编译并跑自检脚本。
7. 完成后报告改动内容、检查方式和未验证的真实环境行为。
