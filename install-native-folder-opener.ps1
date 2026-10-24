param(
  [string]$ExtensionId,
  [string]$DownloadBasePath,
  [string]$HostRoot,
  [switch]$SkipRegistry
)

$ErrorActionPreference = "Stop"

# 4.9：宿主目录必须位于本用户的 LOCALAPPDATA 之下。
# 理由有两条，任一条都足以要求这个校验：
#   1. 这个目录里的 folder-opener-host.ps1 会被启动器以 -ExecutionPolicy Bypass 执行，
#      目录可写就等于能以当前用户权限执行任意 PowerShell；
#   2. 卸载脚本会对这个目录做 Remove-Item -Recurse -Force，参数传错就会递归删掉任意目录。
# 所以这里不接受"任意路径"，只接受默认位置及其子目录。
function Assert-HostRootSafe([string]$Path) {
  $default = Join-Path $env:LOCALAPPDATA "BcaFolderOpener"
  $full = [System.IO.Path]::GetFullPath($Path)
  $base = [System.IO.Path]::GetFullPath($default)
  $prefix = $base.TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
  if ($full -ne $base -and -not $full.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "宿主目录必须位于 $base 之下（收到：$full）。这是为了防止误删或误写到其它位置。"
  }
  return $full
}

$hostName = "com.bcatch.folder_opener"
$workerName = "folder-opener-host.ps1"
$launcherName = "folder-opener-launcher.exe"

if (-not $ExtensionId) { $ExtensionId = (Read-Host "请从 chrome://extensions 复制本插件的扩展程序 ID（在插件介绍下方有一个 ID:xxxxxxxx，把那串复制到这条命令后按回车）").Trim() }
if ($ExtensionId -notmatch "^[a-p]{32}$") { throw "扩展程序 ID 格式不正确。请复制 chrome://extensions 中显示的 32 位 ID。" }

if (-not $DownloadBasePath) { $DownloadBasePath = (Read-Host "请输入视频下载目录的完整绝对路径（例如 D:\B站收藏\000视频下载）：打开你的视频下载文件夹，在文件资源管理器上方的地址栏点一下，把里面的绝对地址复制到这条命令后按回车").Trim().Trim('"') }
  # 1.8.22（old-p3 native L196）：-DownloadBasePath 参数分支以前不做 Trim('"')，
  # 传 "D:\B站收藏" 这种带引号的值会在下面 IsPathRooted 一步误报「必须是完整路径」。
  # 交互分支本来就会 Trim，这里统一一次，两条入口行为一致。
  $DownloadBasePath = $DownloadBasePath.Trim().Trim('"')
$DownloadBasePath = [Environment]::ExpandEnvironmentVariables($DownloadBasePath)
# 1.8.22（old-p3 security P3-4）：不接受 UNC（\\服务器\共享）下载根 ——
# 原生助手只在本机磁盘上操作，网络路径的可达性与身份验证都不由我们控制。
if ($DownloadBasePath.StartsWith('\\')) { throw '不支持网络路径（如 \\服务器\共享）；请填本机磁盘上的完整路径，例如 D:\B站收藏\000视频下载。' }

if (-not [System.IO.Path]::IsPathRooted($DownloadBasePath)) { throw "下载目录必须是完整路径，例如 D:\B站收藏\000视频下载。" }
$DownloadBasePath = [System.IO.Path]::GetFullPath($DownloadBasePath)
$parentPath = [System.IO.Path]::GetDirectoryName($DownloadBasePath)
# 1.7.13（facet-native P2-3）：盘符根目录（比如 D:\）的 GetDirectoryName 返回 $null，
# 上一版那句 Test-Path -LiteralPath $null 会抛 ParameterBindingValidationException
# （“无法将参数绑定到参数 LiteralPath，因为该参数是空值”），看起来完全不像路径问题。
# 而运行时是明确支持盘符根的（folder-opener-host.ps1 的 Resolve-TargetPath 自己会拼
# 基路径前缀），所以这里不能用 $null 去探测。
if ([string]::IsNullOrWhiteSpace($parentPath)) {
  if (-not (Test-Path -LiteralPath $DownloadBasePath -PathType Container)) { throw "这个盘符不存在或不可访问：$DownloadBasePath" }
  Write-Host "提示：下载目录直接放在盘符根目录（$DownloadBasePath）。可以用，但不建议——系统盘根目录常常要管理员权限，文件也容易和其它程序混在一起。" -ForegroundColor Yellow
} elseif (-not (Test-Path -LiteralPath $parentPath -PathType Container)) {
  throw "下载目录的上级目录不存在：$parentPath"
}

if (-not $HostRoot) { $HostRoot = Join-Path $env:LOCALAPPDATA "BcaFolderOpener" }
$HostRoot = Assert-HostRootSafe $HostRoot
New-Item -ItemType Directory -Path $HostRoot -Force | Out-Null

# 1.7.13（facet-native P2-n1）：原生消息的注册表键是按浏览器分的。
# 上一版只写 Google Chrome 正式版那一个键，于是在 Edge / Brave / Chrome Beta·Dev·Canary
# 里 sendNativeMessage 必然失败，而脚本照样打印「安装完成」——用户会反复重装，
# 功能永远不生效，还看不出原因。这里按「本机装了哪些」逐个注册。
# 同一份清单文件与同一份 allowed_origins 对所有 Chromium 浏览器都有效
# （免打包扩展的 ID 由目录路径推导，换浏览器不变）。
$browserTargets = @(
  @{ Name = "Google Chrome"; Key = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$hostName"; Detect = "HKCU:\Software\Google\Chrome\BLBeacon"; Always = $true },
  @{ Name = "Chrome Beta"; Key = "HKCU:\Software\Google\Chrome Beta\NativeMessagingHosts\$hostName"; Detect = "HKCU:\Software\Google\Chrome Beta\BLBeacon"; Always = $false },
  @{ Name = "Chrome Dev"; Key = "HKCU:\Software\Google\Chrome Dev\NativeMessagingHosts\$hostName"; Detect = "HKCU:\Software\Google\Chrome Dev\BLBeacon"; Always = $false },
  @{ Name = "Chrome Canary"; Key = "HKCU:\Software\Google\Chrome SxS\NativeMessagingHosts\$hostName"; Detect = "HKCU:\Software\Google\Chrome SxS\BLBeacon"; Always = $false },
  @{ Name = "Microsoft Edge"; Key = "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\$hostName"; Detect = "HKCU:\Software\Microsoft\Edge\BLBeacon"; Always = $false },
  @{ Name = "Brave"; Key = "HKCU:\Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\$hostName"; Detect = "HKCU:\Software\BraveSoftware\Brave-Browser\BLBeacon"; Always = $false },
  @{ Name = "Vivaldi"; Key = "HKCU:\Software\Vivaldi\NativeMessagingHosts\$hostName"; Detect = "HKCU:\Software\Vivaldi\BLBeacon"; Always = $false },
  @{ Name = "Chromium"; Key = "HKCU:\Software\Chromium\NativeMessagingHosts\$hostName"; Detect = "HKCU:\Software\Chromium\BLBeacon"; Always = $false }
)

# 1) 宿主启动器：Chrome 的原生消息清单不支持 args 字段，path 必须指向一个
#    不带参数就能运行的可执行文件，所以这里把启动器源码编译成 exe。
#    1.7.13（facet-native P2-5）：编译必须排在「拷贝工作脚本」之前。
#    以前是先拷工作脚本、再找编译器、最后编译 —— 编译失败时工作脚本已经换成新版，
#    exe 还是旧的（或者压根没有），留下一个「新脚本 + 旧启动器」的混合态；用户只看到
#    一句安装失败，再跑一次也未必对得上。现在先把所有会失败的前置条件验完、把 exe
#    编出来，再往宿主目录里写任何东西。
$sourceCode = Join-Path $PSScriptRoot "native\folder-opener-launcher.cs"
if (-not (Test-Path -LiteralPath $sourceCode -PathType Leaf)) { throw "找不到宿主启动器源码：$sourceCode" }
$sourceScript = Join-Path $PSScriptRoot "native\$workerName"
if (-not (Test-Path -LiteralPath $sourceScript -PathType Leaf)) { throw "找不到本地目录打开助手工作脚本：$sourceScript" }
$launcherPath = Join-Path $HostRoot $launcherName

$compiler = $null
foreach ($candidate in @(
  (Join-Path $env:WINDIR "Microsoft.NET\Framework64\v4.0.30319\csc.exe"),
  (Join-Path $env:WINDIR "Microsoft.NET\Framework\v4.0.30319\csc.exe")
)) {
  if (Test-Path -LiteralPath $candidate -PathType Leaf) { $compiler = $candidate; break }
}
if (-not $compiler) { throw "找不到 C# 编译器 csc.exe（.NET Framework 4.x）。请先安装 .NET Framework 4.x 后重试。宿主目录没有被改动。" }

Write-Host "正在编译宿主启动器…"
$compileOutput = & $compiler /nologo /target:exe /platform:anycpu /optimize+ /codepage:65001 "/out:$launcherPath" "$sourceCode" 2>&1
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $launcherPath -PathType Leaf)) {
  $compileOutput | ForEach-Object { Write-Host $_ }
  throw "编译宿主启动器失败，请把上面的编译错误反馈给开发者。安装到此为止，宿主目录里没有留下半新半旧的文件。"
}

# 2) 工作脚本：真正执行目录校验和打开动作的 PowerShell 部分。
$destScript = Join-Path $HostRoot $workerName
Copy-Item -LiteralPath $sourceScript -Destination $destScript -Force
# 1.7.13（facet-native 加固）：宿主用 [System.IO.File]::Exists + FileStream 读这个脚本，
# 只要目标带 Hidden/System 属性就会抛 UnauthorizedAccessException，报错却完全看不出
# 是属性问题（Copy-Item 会继承目标的属性）。装完顺手清掉这两个属性。
if (Test-Path -LiteralPath $destScript -PathType Leaf) {
  try { (Get-Item -LiteralPath $destScript -Force).Attributes = [System.IO.FileAttributes]::Normal } catch { }
}

# 3) 设置文件：写成 UTF-8 带 BOM。工作脚本始终用 -Encoding UTF8 读取，
#    这样中文下载路径不会被 PowerShell 5.1 的 ANSI 默认编码解坏。
$settingsJson = @{
  downloadBasePath = $DownloadBasePath
  extensionId = $ExtensionId
  # 1.10.2（TODO P2-13）：协议 4 起宿主按这份白名单核对调用方。
  # 显式写成数组（而不是只留 extensionId），以后要放行开发用的第二个 id 时直接往下加。
  allowedExtensionIds = @($ExtensionId)
} | ConvertTo-Json -Compress
[System.IO.File]::WriteAllText((Join-Path $HostRoot "settings.json"), $settingsJson, (New-Object System.Text.UTF8Encoding($true)))

# 4) Chrome 原生消息清单：只写 Chrome 支持的五个字段，绝不写 args。
$nativeManifestPath = Join-Path $HostRoot "$hostName.json"
$nativeManifestJson = @{
  name = $hostName
  description = "打开 B 站本地视频下载目录"
  path = $launcherPath
  type = "stdio"
  allowed_origins = @("chrome-extension://$ExtensionId/")
} | ConvertTo-Json -Depth 5
[System.IO.File]::WriteAllText($nativeManifestPath, $nativeManifestJson, (New-Object System.Text.UTF8Encoding($false)))

# 5) 自检：把刚写出的清单读回来核对，避免再次出现“装完却连不上”的情况。
$written = Get-Content -LiteralPath $nativeManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ($written.PSObject.Properties.Name -contains "args") { throw "原生消息清单不应包含 args 字段，请把这个问题反馈给开发者。" }
if ($written.path -ne $launcherPath) { throw "原生消息清单的 path 与宿主启动器路径不一致。" }
if (-not (Test-Path -LiteralPath $written.path -PathType Leaf)) { throw "原生消息清单的 path 指向的文件不存在：$($written.path)" }
if ($written.allowed_origins -notcontains "chrome-extension://$ExtensionId/") { throw "原生消息清单的 allowed_origins 与扩展程序 ID 不一致。" }

if (-not $SkipRegistry) {
  # 1.7.13（facet-native P2-n1）：按浏览器逐个注册，而不是只写 Chrome 一个键。
  $registeredBrowsers = @()
  foreach ($target in $browserTargets) {
    if (-not $target.Always -and -not (Test-Path -LiteralPath $target.Detect)) { continue }
    New-Item -Path $target.Key -Force | Out-Null
    Set-Item -Path $target.Key -Value $nativeManifestPath
    $registeredBrowsers += $target.Name
  }
  if (-not $registeredBrowsers.Count) { $registeredBrowsers = @("Google Chrome") }
}

Write-Host ""
# 1.7.13（facet-native P2-5）：-SkipRegistry 时不写注册表，那就不是「安装完成」——
# 上一版照样打印「安装完成。」，用户看不出原生消息其实还没接上。
if ($SkipRegistry) {
  Write-Host "已安装，但注册表未写入（-SkipRegistry）：浏览器还连不上原生助手。" -ForegroundColor Yellow
} else {
  Write-Host "安装完成。" -ForegroundColor Green
}
Write-Host "扩展程序 ID：$ExtensionId"
Write-Host "宿主启动器：$launcherPath"
Write-Host "工作脚本：$(Join-Path $HostRoot $workerName)"
Write-Host "原生消息清单：$nativeManifestPath"
if ($SkipRegistry) { Write-Host "注册表：已跳过（-SkipRegistry）" } else { Write-Host "注册表：已为以下浏览器注册原生消息宿主 —— $([string]::Join("、", $registeredBrowsers))" }
Write-Host "下载目录：$DownloadBasePath"
Write-Host ""
Write-Host "接下来请按顺序操作：" -ForegroundColor Yellow
Write-Host "1. 在 chrome://extensions 中重新加载本插件（如果换了插件目录，ID 会变化，必须以新 ID 重新运行本脚本）。"
Write-Host "2. 完全退出 Chrome（关闭所有窗口，必要时在任务管理器结束 chrome.exe），再重新打开。"
Write-Host "3. 打开本地收藏库，在视频详情中点击“打开本地视频目录”。"
Write-Host ""
Write-Host "安装后自检（不打开资源管理器，只验证协议与路径）："
Write-Host "  powershell -NoProfile -ExecutionPolicy Bypass -File `"$PSScriptRoot\test-native-folder-opener.ps1`" -CollectionName `"收藏夹名称`" -DirectoryName `"视频目录名称`""
Write-Host "如果更换了扩展程序 ID 或下载目录，请重新运行此脚本。"
