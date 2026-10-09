$ErrorActionPreference = "Stop"
$registryPath = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.bcatch.folder_opener"
$hostRoot = Join-Path $env:LOCALAPPDATA "BcaFolderOpener"
if (Test-Path -LiteralPath $registryPath) { Remove-Item -LiteralPath $registryPath -Recurse -Force }
if (Test-Path -LiteralPath $hostRoot) { Remove-Item -LiteralPath $hostRoot -Recurse -Force }
Write-Host "Windows 文件夹辅助程序已移除。" -ForegroundColor Green
