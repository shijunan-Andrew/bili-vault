param(
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
$registryPath = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$hostName"
if (-not $HostRoot) { $HostRoot = Join-Path $env:LOCALAPPDATA "BcaFolderOpener" }
$HostRoot = Assert-HostRootSafe $HostRoot

$removed = @()
$failures = @()

if (-not $SkipRegistry -and (Test-Path -LiteralPath $registryPath)) {
  try {
    Remove-Item -LiteralPath $registryPath -Recurse -Force
    $removed += "注册表项 $registryPath"
  } catch {
    $failures += "注册表项 $registryPath：$($_.Exception.Message)"
  }
}

if (Test-Path -LiteralPath $HostRoot) {
  try {
    Remove-Item -LiteralPath $HostRoot -Recurse -Force
    $removed += "宿主目录 $HostRoot"
  } catch {
    $failures += "宿主目录 $HostRoot：$($_.Exception.Message)"
  }
}

if ($removed.Count) {
  Write-Host "Windows 文件夹辅助程序已移除：" -ForegroundColor Green
  $removed | ForEach-Object { Write-Host "  - $_" }
}

if ($failures.Count) {
  Write-Host "以下内容未能移除：" -ForegroundColor Red
  $failures | ForEach-Object { Write-Host "  - $_" }
  Write-Host "如果 Chrome 正在运行，请先完全退出 Chrome 后重试。" -ForegroundColor Yellow
  exit 1
}

if (-not $removed.Count) { Write-Host "没有找到已安装的 Windows 文件夹辅助程序。" -ForegroundColor Yellow }
