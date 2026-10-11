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
$DownloadBasePath = [Environment]::ExpandEnvironmentVariables($DownloadBasePath)
if (-not [System.IO.Path]::IsPathRooted($DownloadBasePath)) { throw "下载目录必须是完整路径，例如 D:\B站收藏\000视频下载。" }
$DownloadBasePath = [System.IO.Path]::GetFullPath($DownloadBasePath)
$parentPath = [System.IO.Path]::GetDirectoryName($DownloadBasePath)
if (-not (Test-Path -LiteralPath $parentPath -PathType Container)) { throw "下载目录的上级目录不存在：$parentPath" }

if (-not $HostRoot) { $HostRoot = Join-Path $env:LOCALAPPDATA "BcaFolderOpener" }
$HostRoot = Assert-HostRootSafe $HostRoot
New-Item -ItemType Directory -Path $HostRoot -Force | Out-Null

# 1) 工作脚本：真正执行目录校验和打开动作的 PowerShell 部分。
$sourceScript = Join-Path $PSScriptRoot "native\$workerName"
if (-not (Test-Path -LiteralPath $sourceScript -PathType Leaf)) { throw "找不到本地目录打开助手工作脚本：$sourceScript" }
Copy-Item -LiteralPath $sourceScript -Destination (Join-Path $HostRoot $workerName) -Force

# 2) 宿主启动器：Chrome 的原生消息清单不支持 args 字段，path 必须指向一个
#    不带参数就能运行的可执行文件，所以这里把启动器源码编译成 exe。
$sourceCode = Join-Path $PSScriptRoot "native\folder-opener-launcher.cs"
if (-not (Test-Path -LiteralPath $sourceCode -PathType Leaf)) { throw "找不到宿主启动器源码：$sourceCode" }
$launcherPath = Join-Path $HostRoot $launcherName

$compiler = $null
foreach ($candidate in @(
  (Join-Path $env:WINDIR "Microsoft.NET\Framework64\v4.0.30319\csc.exe"),
  (Join-Path $env:WINDIR "Microsoft.NET\Framework\v4.0.30319\csc.exe")
)) {
  if (Test-Path -LiteralPath $candidate -PathType Leaf) { $compiler = $candidate; break }
}
if (-not $compiler) { throw "找不到 C# 编译器 csc.exe（.NET Framework 4.x）。请先安装 .NET Framework 4.x 后重试。" }

Write-Host "正在编译宿主启动器…"
$compileOutput = & $compiler /nologo /target:exe /platform:anycpu /optimize+ /codepage:65001 "/out:$launcherPath" "$sourceCode" 2>&1
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $launcherPath -PathType Leaf)) {
  $compileOutput | ForEach-Object { Write-Host $_ }
  throw "编译宿主启动器失败，请把上面的编译错误反馈给开发者。"
}

# 3) 设置文件：写成 UTF-8 带 BOM。工作脚本始终用 -Encoding UTF8 读取，
#    这样中文下载路径不会被 PowerShell 5.1 的 ANSI 默认编码解坏。
$settingsJson = @{
  downloadBasePath = $DownloadBasePath
  extensionId = $ExtensionId
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
  $registryPath = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$hostName"
  New-Item -Path $registryPath -Force | Out-Null
  Set-Item -Path $registryPath -Value $nativeManifestPath
}

Write-Host ""
Write-Host "安装完成。" -ForegroundColor Green
Write-Host "扩展程序 ID：$ExtensionId"
Write-Host "宿主启动器：$launcherPath"
Write-Host "工作脚本：$(Join-Path $HostRoot $workerName)"
Write-Host "原生消息清单：$nativeManifestPath"
if ($SkipRegistry) { Write-Host "注册表：已跳过（-SkipRegistry）" } else { Write-Host "注册表：HKCU:\Software\Google\Chrome\NativeMessagingHosts\$hostName" }
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
