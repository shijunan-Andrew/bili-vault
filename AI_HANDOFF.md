# AI 项目交接说明：B站收藏信息归档 3.7

本文面向后续接手代码的 AI，记录当前项目结构、数据流、关键约束和验证方法。请先阅读本文，再看 [README.md](README.md) 和相关源文件。

## 项目基线

- 项目目录：`C:\Users\Maxwell\Desktop\cdx1\b_catch_3.7`
- 扩展版本：`3.7.0`，Chrome Manifest V3，最低 Chrome 版本 111。
- `b_catch_3.6` 是 3.7 的来源稳定基线，原目录保持不变。用户此前要求版本间使用独立目录；后续版本继续使用新目录并保留历史版本，除非用户明确要求直接改当前目录。
- 项目没有 npm 依赖或打包步骤。扩展直接从 `chrome://extensions` 加载解压目录。
- 用户主要使用中文界面和 Windows/Chrome。回答修改结果时用中文、清楚说明文件、行为变化和检查结果。

## 功能概览

1. 在 B 站视频页确认收藏后，将视频信息和封面写入用户选择的本地目录。
2. 在 B 站个人空间收藏夹页选择收藏夹，批量导入或更新本地归档；对失效视频尝试恢复可找回的信息。
3. 打开本地收藏库后，按固定目录结构解析视频，支持搜索、筛选、详情、新建/删除收藏夹、添加视频、移动/复制、批量操作。
4. 下载视频、音频、弹幕、字幕、封面和信息文件；暂停/继续、取消，并在卡片同步下载状态。
5. 通过可选的 Windows Native Messaging 辅助程序，在文件资源管理器打开视频目录。

## 目录结构

```text
b_catch_3.6/
├── manifest.json                 # MV3 权限、后台 worker、页面脚本注册
├── background.js                 # 保存、导入、视频 API、错误报告、后台消息路由
├── content.js                    # B 站视频页：监听收藏操作、采集视频数据
├── favorites-import.js           # B 站收藏夹页：提供页面 API 代理和导入入口
├── popup.html/js/css              # 插件弹窗、自动归档开关、根目录和导入界面
├── library.html/js/css            # 本地收藏库页面
├── archive-core.js                # 可复用的安全名称、下载目录匹配和状态逻辑
├── download.html/js/css           # 视频解析和下载界面
├── download-folder.html/js/css    # 兼容的本地下载目录浏览页面
├── native/
│   └── folder-opener-host.ps1     # Native Messaging 主机脚本
├── install-native-folder-opener.bat / .ps1
├── uninstall-native-folder-opener.ps1
├── test/stability.test.cjs        # Node 内置测试，无第三方依赖
├── README.md                      # 面向使用者的安装与功能说明
└── AI_HANDOFF.md                  # 本文件
```

3.7 针对下载报告中的 `directory is not defined` 修复了下载目录日志引用：目录句柄保存在 `directoryInfo.directory`，日志不能再使用不存在的局部变量 `directory`。

## 主要数据流

### 视频页自动归档

`content.js` 在 B 站收藏弹窗中采集当前视频元数据和用户选中的收藏夹。它等待 B 站弹窗关闭后再提交，以确认线上收藏操作完成；用视频编号和选中收藏夹组成的签名做短期去重。随后发送 `save-favorite` 给 `background.js`。

后台串行执行保存操作，读取 IndexedDB 中的根目录句柄，检查写入权限，在每个实际收藏夹下创建时间目录，保存 `视频信息.txt` 和 `封面.png`。保存失败时尝试写入 `001错误报告`，并把最近状态、错误详情放入扩展存储供弹窗展示。

### B 站收藏夹导入

`favorites-import.js` 注入个人空间收藏夹页，为后台请求提供页面上下文 API 代理，并接收列表收藏夹、导入所选收藏夹的消息。`popup.js` 展示可选列表和导入进度。后台分页获取收藏视频、对本地 BV/av 去重，并写入与自动归档相同的目录格式。

失效视频恢复逻辑主要在 `background.js`：尝试从 APP 收藏夹数据、稍后再看、观看历史和视频资料等来源恢复标题、封面、UP 主及其他字段。未找回的字段应保留为“未知”；封面无法恢复时使用占位图，避免本地库漏掉该记录。B 站接口和页面结构会变化，导入失败时应保留部分已成功结果并记录错误。

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

### 文件资源管理器辅助程序

详情页通过 `chrome.runtime.sendNativeMessage("com.bcatch.folder_opener", …)` 请求打开下载目录。`install-native-folder-opener.ps1` 会把主机脚本、设置和 Chrome Native Messaging 清单安装到 `%LOCALAPPDATA%\BcaFolderOpener`，并写入当前用户注册表。安装时需要扩展 ID 和下载根目录完整路径。源代码中不预置生成后的清单；卸载由 `uninstall-native-folder-opener.ps1` 完成。Windows PowerShell 5.1 中文编码问题已修复，修改脚本后应重新进行 PowerShell 语法检查。

## 页面与消息接口

后台 `chrome.runtime.onMessage` 主要处理这些消息，改动时同步检查发送端和响应结构：

| 消息类型 | 发送端 → 处理端 | 作用 |
|---|---|---|
| `save-favorite` | `content.js` → `background.js` | 保存线上收藏的视频信息和封面 |
| `retry-pending-favorite` | `popup.js` → `background.js` | 恢复授权后重试暂存的收藏 |
| `get-status` | `popup.js` → `background.js` | 读取最近状态和错误 |
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
- 还可能包含导入任务进度及其他 UI 状态；改动前搜索全项目读写点。

**`chrome.storage.session`**：临时批量下载队列，键名 `bcaDownloadQueue:<UUID>`。下载页读取后删除。

## 常用验证

在项目根目录执行：

```powershell
node test/stability.test.cjs
```

当前包含 6 项纯逻辑回归检查：收藏夹传递、BV/av 下载目录识别、同收藏夹优先与 3.5 旧目录回退、媒体文件判定、扫描权限不明时保留状态、收藏夹目录名安全处理。无第三方包。

每次改动还应执行：

1. 对所有 `.js` 执行 `node --check`。
2. 解析 `manifest.json` 并确认脚本、弹窗等本地引用存在。
3. 检查每个 HTML 的本地 JS/CSS 引用存在，确认 `library.html` 和 `download.html` 在业务脚本之前加载 `archive-core.js`。
4. 若改动 PowerShell，使用 PowerShell Parser 解析所有 `.ps1`，不要仅靠运行安装脚本验证。
5. 有条件时在 Chrome 加载扩展，登录 B 站验证收藏、导入、下载、暂停/取消、移动/删除和徽标状态。Node 检查不能替代真实 B 站登录/API 测试。

## 已知限制与历史背景

- B 站收藏弹窗、收藏夹 API、播放流权限和失效视频恢复来源可能变化；发生 API 变化时优先保留现有部分结果和错误报告，不要因单条失败中断整个批次。
- 失效视频只有在 B 站的 APP 收藏、稍后再看、观看历史或其他资料源中仍有记录时才可能恢复；无法找回时缺失字段用“未知”。
- Native Messaging 仅用于 Windows 资源管理器打开目录。没有安装或设置不正确时，网页不能直接启动 Explorer，应保留“查看路径/复制路径”之类的退路提示。
- 用户曾报告收藏成功但本地归档失败，并看到 B 站收藏弹窗提示 `The next() called multiple times`。另一次控制台网络错误指向 Kaspersky 浏览器组件的 `gc.kis.v2.scr.kaspersky-labs.com`。后者不是本项目域名；判断归因前需在禁用相关第三方扩展的环境中复现。不要把这类外部错误直接归为本扩展故障。
- 3.6 完成过纯逻辑回归和静态语法/文件引用检查；本次 3.7 下载修复需要在 Chrome/B 站实际触发一次验证，因为历史报告表明错误发生于目录创建流程的运行时。

## 修改原则

1. 先确认目标版本目录，再编辑；按用户的版本目录习惯保留已发布稳定版。
2. 先读本文件、`README.md`、相关页面和消息两端，不要只改单侧响应协议。
3. 保持用户本地文件格式向后兼容，尤其是时间目录、`视频信息.txt` 字段名、`000视频下载`/`001错误报告` 和历史 `未分类收藏` 下载。
4. 目录删除、移动、覆盖属于数据操作；保持显式确认，复制失败时回滚新建目录，不删除未被明确选中的下载文件。
5. 完成后报告改动内容、检查方式和未验证的真实环境行为。
