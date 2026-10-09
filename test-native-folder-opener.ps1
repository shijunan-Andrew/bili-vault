param(
  [string]$HostRoot,
  [string]$CollectionName,
  [string]$DirectoryName,
  [switch]$Open
)

# 原生目录助手自检脚本：完全绕开 Chrome，直接按 Native Messaging 的帧协议
# 调用已安装的宿主启动器，用来区分“安装/协议问题”和“Chrome/扩展问题”。
# 默认不打开资源管理器；只有显式加上 -Open 才会真正执行打开动作。
$ErrorActionPreference = "Stop"
$hostName = "com.bcatch.folder_opener"
if (-not $HostRoot) { $HostRoot = Join-Path $env:LOCALAPPDATA "BcaFolderOpener" }

$launcherPath = Join-Path $HostRoot "folder-opener-launcher.exe"
$workerPath = Join-Path $HostRoot "folder-opener-host.ps1"
$settingsPath = Join-Path $HostRoot "settings.json"
$manifestPath = Join-Path $HostRoot "$hostName.json"
$registryPath = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$hostName"
$problems = 0

function Write-Check([bool]$Passed, [string]$Label, [string]$Detail) {
  if ($Passed) { Write-Host ("  [OK]   {0}{1}" -f $Label, $(if ($Detail) { "：$Detail" } else { "" })) -ForegroundColor Green }
  else { Write-Host ("  [缺失] {0}{1}" -f $Label, $(if ($Detail) { "：$Detail" } else { "" })) -ForegroundColor Red }
}

Write-Host "=== 原生目录助手自检 ===" -ForegroundColor Cyan
Write-Host "宿主目录：$HostRoot"
Write-Check (Test-Path -LiteralPath $launcherPath -PathType Leaf) "宿主启动器" $launcherPath
Write-Check (Test-Path -LiteralPath $workerPath -PathType Leaf) "工作脚本" $workerPath
Write-Check (Test-Path -LiteralPath $settingsPath -PathType Leaf) "设置文件" $settingsPath
Write-Check (Test-Path -LiteralPath $manifestPath -PathType Leaf) "原生消息清单" $manifestPath

if (Test-Path -LiteralPath $manifestPath -PathType Leaf) {
  $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
  $hasArgs = $manifest.PSObject.Properties.Name -contains "args"
  Write-Check (-not $hasArgs) "清单不含 Chrome 不支持的 args 字段" $(if ($hasArgs) { "存在 args，Chrome 会忽略它并导致启动失败" } else { "" })
  if ($hasArgs) { $problems += 1 }
  Write-Check ($manifest.path -eq $launcherPath) "清单 path 指向宿主启动器" ([string]$manifest.path)
  Write-Check ([bool]$manifest.allowed_origins) "清单 allowed_origins" ([string]::Join(", ", @($manifest.allowed_origins)))
}

if (Test-Path -LiteralPath $registryPath) {
  Write-Check $true "注册表项" ([string](Get-ItemProperty -Path $registryPath).'(default)')
} else {
  Write-Check $false "注册表项" $registryPath
  $problems += 1
}

function Send-NativeRequest([hashtable]$Payload) {
  $json = ConvertTo-Json -InputObject $Payload -Compress
  $body = [System.Text.Encoding]::UTF8.GetBytes($json)

  $startInfo = New-Object System.Diagnostics.ProcessStartInfo
  $startInfo.FileName = $launcherPath
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.RedirectStandardInput = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true

  $process = [System.Diagnostics.Process]::Start($startInfo)
  try {
    $stdin = $process.StandardInput.BaseStream
    $header = [System.BitConverter]::GetBytes([uint32]$body.Length)
    $stdin.Write($header, 0, 4)
    $stdin.Write($body, 0, $body.Length)
    $stdin.Flush()
    $stdin.Close()

    $stdout = $process.StandardOutput.BaseStream
    $headerBuffer = New-Object byte[] 4
    $offset = 0
    while ($offset -lt 4) {
      $read = $stdout.Read($headerBuffer, $offset, 4 - $offset)
      if ($read -le 0) { break }
      $offset += $read
    }
    if ($offset -ne 4) {
      $stderrText = $process.StandardError.ReadToEnd()
      $process.WaitForExit()
      throw "原生助手没有返回结果（退出码 $($process.ExitCode)）。$stderrText"
    }
    $length = [System.BitConverter]::ToUInt32($headerBuffer, 0)
    $bodyBuffer = New-Object byte[] $length
    $offset = 0
    while ($offset -lt $length) {
      $read = $stdout.Read($bodyBuffer, $offset, $length - $offset)
      if ($read -le 0) { break }
      $offset += $read
    }
    $process.WaitForExit()
    return ([System.Text.Encoding]::UTF8.GetString($bodyBuffer) | ConvertFrom-Json)
  } finally {
    if (-not $process.HasExited) { $null = $process.Kill() }
    $process.Dispose()
  }
}

if (-not (Test-Path -LiteralPath $launcherPath -PathType Leaf)) {
  Write-Host ""
  Write-Host "找不到宿主启动器，无法继续协议自检。请先运行 install-native-folder-opener.bat。" -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host "--- 协议自检：get-config ---" -ForegroundColor Cyan
try {
  $config = Send-NativeRequest @{ action = "get-config" }
  if (-not $config.ok) { throw $config.message }
  Write-Host ("  [OK]   协议版本：{0}" -f $config.version) -ForegroundColor Green
  Write-Host ("  [OK]   下载目录：{0}（存在：{1}）" -f $config.downloadBasePath, $config.downloadBaseExists) -ForegroundColor Green
  if (-not $config.downloadBaseExists) {
    Write-Host "  [提示] 下载目录当前不存在；完成一次下载后它会被自动创建。" -ForegroundColor Yellow
  }
} catch {
  Write-Host ("  [失败] {0}" -f $_.Exception.Message) -ForegroundColor Red
  $problems += 1
}

if ($CollectionName -or $DirectoryName) {
  Write-Host ""
  Write-Host "--- 协议自检：resolve-directory ---" -ForegroundColor Cyan
  try {
    $resolved = Send-NativeRequest @{ action = "resolve-directory"; collectionName = $CollectionName; directoryName = $DirectoryName }
    if (-not $resolved.ok) { throw $resolved.message }
    Write-Host ("  [OK]   目标目录：{0}" -f $resolved.targetPath) -ForegroundColor Green
    if ($Open) {
      Write-Host ""
      Write-Host "--- 协议自检：open-directory ---" -ForegroundColor Cyan
      $opened = Send-NativeRequest @{ action = "open-directory"; collectionName = $CollectionName; directoryName = $DirectoryName }
      if (-not $opened.ok) { throw $opened.message }
      Write-Host ("  [OK]   已请求打开：{0}" -f $opened.targetPath) -ForegroundColor Green
    }
  } catch {
    Write-Host ("  [失败] {0}" -f $_.Exception.Message) -ForegroundColor Red
    $problems += 1
  }
} else {
  Write-Host ""
  Write-Host "（未提供 -CollectionName / -DirectoryName，跳过目录校验；加上这两个参数可验证具体视频目录。）" -ForegroundColor DarkGray
}

Write-Host ""
if ($problems -eq 0) {
  Write-Host "自检通过：原生目录助手本身可用。若扩展里仍报错，请在 chrome://extensions 重新加载插件并完全重启 Chrome。" -ForegroundColor Green
} else {
  Write-Host "自检发现 $problems 个问题，请先按上面的提示修复后再测试扩展。" -ForegroundColor Red
  exit 1
}
