$ErrorActionPreference = "Stop"
$hostRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$settingsPath = Join-Path $hostRoot "settings.json"
$hostVersion = "3.8.0"
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

# settings.json 由安装脚本写成 UTF-8。PowerShell 5.1 的 Get-Content 默认按系统 ANSI
# 代码页读取，中文路径会被解坏，甚至让 ConvertFrom-Json 直接抛“无法识别的转义序列”。
# 这里必须显式指定 -Encoding UTF8。
function Get-DownloadBasePath {
  if (-not (Test-Path -LiteralPath $settingsPath -PathType Leaf)) { throw "找不到本地下载目录设置，请重新运行安装脚本。" }
  $settings = Get-Content -LiteralPath $settingsPath -Raw -Encoding UTF8 | ConvertFrom-Json
  $basePath = [string]$settings.downloadBasePath
  if ([string]::IsNullOrWhiteSpace($basePath)) { throw "本地下载目录设置不完整，请重新运行安装脚本。" }
  return [System.IO.Path]::GetFullPath($basePath)
}

function Assert-SafeDirectoryName([string]$Value, [string]$Label) {
  if ([string]::IsNullOrWhiteSpace($Value)) { throw "$Label 不能为空。" }
  if ($Value -ne [System.IO.Path]::GetFileName($Value) -or $Value -match '[\\/:*?"<>|\x00-\x1f]') { throw "$Label 无效。" }
}

function Resolve-TargetPath([string]$BasePath, [string]$CollectionName, [string]$DirectoryName) {
  Assert-SafeDirectoryName $DirectoryName "视频目录名称"
  if (-not [string]::IsNullOrWhiteSpace($CollectionName)) { Assert-SafeDirectoryName $CollectionName "收藏夹目录名称" }
  $basePrefix = $BasePath.TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
  if ([string]::IsNullOrWhiteSpace($CollectionName)) {
    $targetPath = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($BasePath, $DirectoryName))
  } else {
    $targetPath = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($BasePath, $CollectionName, $DirectoryName))
  }
  if (-not $targetPath.StartsWith($basePrefix, [System.StringComparison]::OrdinalIgnoreCase)) { throw "目标目录超出了已设置的下载目录。" }
  if (-not (Test-Path -LiteralPath $targetPath -PathType Container)) { throw "找不到视频下载目录：$targetPath" }
  return $targetPath
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
    $action = [string]$request.action

    if ($action -eq "get-config") {
      $basePath = Get-DownloadBasePath
      Write-Response $outputStream @{
        ok = $true
        version = $hostVersion
        downloadBasePath = $basePath
        downloadBaseExists = (Test-Path -LiteralPath $basePath -PathType Container)
      }
    } elseif ($action -eq "resolve-directory") {
      $targetPath = Resolve-TargetPath (Get-DownloadBasePath) ([string]$request.collectionName) ([string]$request.directoryName)
      Write-Response $outputStream @{ ok = $true; version = $hostVersion; targetPath = $targetPath }
    } elseif ($action -eq "open-directory") {
      $targetPath = Resolve-TargetPath (Get-DownloadBasePath) ([string]$request.collectionName) ([string]$request.directoryName)
      $explorerPath = Join-Path $env:WINDIR "explorer.exe"
      $quotedTarget = '"{0}"' -f $targetPath
      $null = Start-Process -FilePath $explorerPath -ArgumentList $quotedTarget
      Write-Response $outputStream @{ ok = $true; version = $hostVersion; targetPath = $targetPath; message = "已打开目录。" }
    } else {
      throw "不支持的原生目录操作：$action"
    }
  } catch {
    Write-Response $outputStream @{ ok = $false; version = $hostVersion; message = $_.Exception.Message }
  }
}
