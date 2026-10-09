param(
  [string]$HostRoot,
  [switch]$SkipRegistry
)

$ErrorActionPreference = "Stop"
$hostName = "com.bcatch.folder_opener"
$registryPath = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$hostName"
if (-not $HostRoot) { $HostRoot = Join-Path $env:LOCALAPPDATA "BcaFolderOpener" }

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
