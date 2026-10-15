$ErrorActionPreference = "Stop"
$hostRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$settingsPath = Join-Path $hostRoot "settings.json"
$hostVersion = "3.9.0"
# 1.7.13（facet-native P2-6）：协议号单独记一份，扩展侧拿它和自己认得的版本比对。
# 以前版本握手是单向的 —— 宿主每次都报 3.8.0，扩展从不看，装了一版对不上的宿主
# 只会表现出「点了没反应」。改帧格式或字段语义时必须同时改这里和 library.js 的
# NATIVE_PROTOCOL_VERSION。
$protocolVersion = 3
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
  # 1.7.13（facet-native P2-6）：每条帧都带 protocol + version，调用方不用各写一遍。
  if (-not $Response.ContainsKey("protocol")) { $Response["protocol"] = $protocolVersion }
  if (-not $Response.ContainsKey("version")) { $Response["version"] = $hostVersion }
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
  # 1.7.13（facet-native P2-2）：4 字节长度头以前是「一次裸 Read」，短读就直接 break。
  # Native Messaging 的帧走管道，分片到达时 Read 可能只回 1~3 字节 —— 那时脚本会静默
  # 退出（不回任何帧、退出码 0），上层只看到「宿主没了」。现在读满 4 字节为止：
  # 0 字节才算正常关流（EOF），1~3 字节继续读。这段读被有意放在 try 之外，
  # 保持「正常的流结束要安静退出」。
  $header = New-Object byte[] 4
  $headerRead = 0
  while ($headerRead -lt 4) {
    $read = $inputStream.Read($header, $headerRead, 4 - $headerRead)
    if ($read -le 0) { break }
    $headerRead += $read
  }
  if ($headerRead -eq 0) { break }
  if ($headerRead -ne 4) { break }

  try {
    $length = [System.BitConverter]::ToUInt32($header, 0)
    if ($length -eq 0 -or $length -gt 1048576) {
      # 1.7.13（facet-native P2-1）：拒绝之前必须先把 body 读掉。以前直接 throw，
      # body 的剩余字节会被下一轮循环当成新的 4 字节长度头继续解析 —— 实测喂一个
      # 1 MiB 的负载会在 63 秒里放大出 26 万条错误帧（19.4 MB stdout）。
      # 按块丢弃，避免为超大长度一次性分配缓冲区。
      $drained = $true
      if ($length -gt 0) {
        $remaining = [int64]$length
        $sink = New-Object byte[] 65536
        while ($remaining -gt 0) {
          $want = [int][System.Math]::Min($remaining, [int64]$sink.Length)
          $got = $inputStream.Read($sink, 0, $want)
          if ($got -le 0) { $drained = $false; break }
          $remaining -= $got
        }
      }
      if (-not $drained) { break }
      throw "请求数据长度无效。"
    }
    $body = Read-ExactBytes $inputStream ([int]$length)
    $request = [System.Text.Encoding]::UTF8.GetString($body) | ConvertFrom-Json
    $action = [string]$request.action

    if ($action -eq "get-config") {
      $basePath = Get-DownloadBasePath
      Write-Response $outputStream @{
        ok = $true
        downloadBasePath = $basePath
        downloadBaseExists = (Test-Path -LiteralPath $basePath -PathType Container)
      }
    } elseif ($action -eq "resolve-directory") {
      $targetPath = Resolve-TargetPath (Get-DownloadBasePath) ([string]$request.collectionName) ([string]$request.directoryName)
      Write-Response $outputStream @{ ok = $true; targetPath = $targetPath }
    } elseif ($action -eq "open-directory") {
      $targetPath = Resolve-TargetPath (Get-DownloadBasePath) ([string]$request.collectionName) ([string]$request.directoryName)
      $explorerPath = Join-Path $env:WINDIR "explorer.exe"
      $quotedTarget = '"{0}"' -f $targetPath
      $null = Start-Process -FilePath $explorerPath -ArgumentList $quotedTarget
      Write-Response $outputStream @{ ok = $true; targetPath = $targetPath; message = "已打开目录。" }
    } else {
      throw "不支持的原生目录操作：$action"
    }
  } catch {
    # 1.7.13（facet-native P2-6）：异常分支以前只报 ok=false + 原因，不带 version，
    # 扩展侧只能猜宿主是哪一版。现在 version/protocol 由 Write-Response 统一补上。
    # 另外把异常类型也报出来：裸 PowerShell 脚本的报错常常只有一句中文，
    # 排查时分不清是「参数不对」还是「脚本压根没跑起来」。
    Write-Response $outputStream @{
      ok = $false
      message = [string]$_.Exception.Message
      errorType = [string]$_.Exception.GetType().Name
    }
  }
}
