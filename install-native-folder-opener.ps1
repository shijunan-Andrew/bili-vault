$ErrorActionPreference = "Stop"
$hostName = "com.bcatch.folder_opener"
$extensionId = (Read-Host "请从 chrome://extensions 复制本插件的扩展程序 ID").Trim()
if ($extensionId -notmatch "^[a-p]{32}$") { throw "扩展程序 ID 格式不正确。请复制 chrome://extensions 中显示的 32 位 ID。" }

$downloadBasePath = (Read-Host "请输入视频下载目录的完整路径（默认位置为收藏根目录\视频下载）").Trim().Trim('"')
$downloadBasePath = [Environment]::ExpandEnvironmentVariables($downloadBasePath)
if (-not [System.IO.Path]::IsPathRooted($downloadBasePath)) { throw "下载目录必须是完整路径，例如 D:\B站收藏\视频下载。" }
$downloadBasePath = [System.IO.Path]::GetFullPath($downloadBasePath)
$parentPath = [System.IO.Path]::GetDirectoryName($downloadBasePath)
if (-not (Test-Path -LiteralPath $parentPath -PathType Container)) { throw "下载目录的上级目录不存在：$parentPath" }

$hostRoot = Join-Path $env:LOCALAPPDATA "BcaFolderOpener"
New-Item -ItemType Directory -Path $hostRoot -Force | Out-Null
$hostScript = Join-Path $hostRoot "folder-opener-host.ps1"
$sourceScript = Join-Path $PSScriptRoot "native\folder-opener-host.ps1"
if (-not (Test-Path -LiteralPath $sourceScript -PathType Leaf)) { throw "找不到原生辅助程序：$sourceScript" }
Copy-Item -LiteralPath $sourceScript -Destination $hostScript -Force

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$settings = @{ downloadBasePath = $downloadBasePath } | ConvertTo-Json -Compress
[System.IO.File]::WriteAllText((Join-Path $hostRoot "settings.json"), $settings, $utf8NoBom)

$powershellExe = Join-Path $env:WINDIR "System32\WindowsPowerShell\v1.0\powershell.exe"
if (-not (Test-Path -LiteralPath $powershellExe -PathType Leaf)) { throw "找不到 Windows PowerShell：$powershellExe" }
$nativeManifestPath = Join-Path $hostRoot "com.bcatch.folder_opener.json"
$nativeManifest = @{
  name = $hostName
  description = "打开 B 站本地视频下载目录"
  path = $powershellExe
  type = "stdio"
  allowed_origins = @("chrome-extension://$extensionId/")
  args = @("-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", $hostScript)
} | ConvertTo-Json -Depth 5
[System.IO.File]::WriteAllText($nativeManifestPath, $nativeManifest, $utf8NoBom)

$registryPath = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$hostName"
New-Item -Path $registryPath -Force | Out-Null
Set-Item -Path $registryPath -Value $nativeManifestPath

Write-Host ""
Write-Host "安装完成。下载目录：$downloadBasePath" -ForegroundColor Green
Write-Host "请关闭并重新打开本地收藏库，再点击“打开本地视频目录”。"
Write-Host "如果更换了插件扩展 ID 或下载目录，请重新运行此脚本。"
