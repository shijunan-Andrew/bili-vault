$ErrorActionPreference = "Stop"
$hostRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$settingsPath = Join-Path $hostRoot "settings.json"
$inputStream = [Console]::OpenStandardInput()
$outputStream = [Console]::OpenStandardOutput()

function Read-ExactBytes([System.IO.Stream]$Stream, [int]$Count) {
  $buffer = New-Object byte[] $Count
  $offset = 0
  while ($offset -lt $Count) {
    $read = $Stream.Read($buffer, $offset, $Count - $offset)
    if ($read -le 0) { throw "Native Messaging 输入意外结束。" }
    $offset += $read
  }
  return ,$buffer
}

function Write-Response([System.IO.Stream]$Stream, [hashtable]$Response) {
  $json = ConvertTo-Json -InputObject $Response -Compress
  $body = [System.Text.Encoding]::UTF8.GetBytes($json)
  $header = [System.BitConverter]::GetBytes([uint32]$body.Length)
  $Stream.Write($header, 0, 4)
  $Stream.Write($body, 0, $body.Length)
  $Stream.Flush()
}

while ($true) {
  $header = New-Object byte[] 4
  $headerRead = $inputStream.Read($header, 0, 4)
  if ($headerRead -eq 0) { break }
  if ($headerRead -ne 4) { break }

  try {
    $length = [System.BitConverter]::ToUInt32($header, 0)
    if ($length -eq 0 -or $length -gt 1048576) { throw "请求数据长度无效。" }
    $body = Read-ExactBytes $inputStream ([int]$length)
    $request = [System.Text.Encoding]::UTF8.GetString($body) | ConvertFrom-Json
    if ($request.action -ne "open-directory") { throw "不支持的目录操作。" }

    $directoryName = [string]$request.directoryName
    if ([string]::IsNullOrWhiteSpace($directoryName) -or $directoryName -ne [System.IO.Path]::GetFileName($directoryName) -or $directoryName -match '[\\/:*?"<>|\x00-\x1f]') {
      throw "视频目录名称无效。"
    }
    if (-not (Test-Path -LiteralPath $settingsPath -PathType Leaf)) { throw "找不到本地下载目录设置，请重新运行安装脚本。" }
    $settings = Get-Content -LiteralPath $settingsPath -Raw | ConvertFrom-Json
    $basePath = [System.IO.Path]::GetFullPath([string]$settings.downloadBasePath)
    $basePrefix = $basePath.TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
    $targetPath = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($basePath, $directoryName))
    if (-not $targetPath.StartsWith($basePrefix, [System.StringComparison]::OrdinalIgnoreCase)) { throw "目标目录超出了已设置的下载目录。" }
    if (-not (Test-Path -LiteralPath $targetPath -PathType Container)) { throw "找不到视频下载目录：$targetPath" }

    $explorerPath = Join-Path $env:WINDIR "explorer.exe"
    $quotedTarget = '"{0}"' -f $targetPath
    $null = Start-Process -FilePath $explorerPath -ArgumentList $quotedTarget
    Write-Response $outputStream @{ ok = $true; message = "已打开目录。" }
  } catch {
    Write-Response $outputStream @{ ok = $false; message = $_.Exception.Message }
  }
}
