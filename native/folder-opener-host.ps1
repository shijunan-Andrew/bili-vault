$ErrorActionPreference = "Stop"
$hostRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$settingsPath = Join-Path $hostRoot "settings.json"
$hostVersion = "3.9.0"
# 1.7.13（facet-native P2-6）：协议号单独记一份，扩展侧拿它和自己认得的版本比对。
# 以前版本握手是单向的 —— 宿主每次都报 3.8.0，扩展从不看，装了一版对不上的宿主
# 只会表现出「点了没反应」。改帧格式或字段语义时必须同时改这里和 library.js 的
# NATIVE_PROTOCOL_VERSION。
$protocolVersion = 4
# 1.10.2（TODO P2-13）：这次调用的认证结论，Write-Response 统一带出去。
$script:authMode = "unknown"
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
  # 1.10.2（TODO P2-13）：响应里带上这次调用方的认证结论，扩展侧排查时不用猜。
  # whitelisted = id 匹配 settings.json 的白名单；open = 白名单还没配（老安装脚本写的设置）。
  if (-not $Response.ContainsKey("auth")) { $Response["auth"] = $script:authMode }
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
# 1.10.2（TODO P2-13）：settings.json 的读法抽成一处 —— 下载根目录与调用方白名单
# 用同一份解析结果，不再各读一遍文件。
function Read-HostSettings {
  if (-not (Test-Path -LiteralPath $settingsPath -PathType Leaf)) { throw "找不到本地下载目录设置，请重新运行安装脚本。" }
  $settingsBytes = [System.IO.File]::ReadAllBytes($settingsPath)
  $strictUtf8 = New-Object -TypeName System.Text.UTF8Encoding -ArgumentList $false, $true
  try {
    $settingsText = $strictUtf8.GetString($settingsBytes)
  } catch [System.Text.DecoderFallbackException] {
    throw "本地下载目录设置的编码不是 UTF-8（多半是被记事本另存成了 ANSI），请重新运行安装脚本。"
  }
  $settingsText = $settingsText.TrimStart([char]0xFEFF)
  try {
    return $settingsText | ConvertFrom-Json
  } catch {
    throw "本地下载目录设置文件已损坏（不是合法的 JSON），请重新运行安装脚本。"
  }
}

# 白名单来自 settings.json：安装脚本写的 extensionId（一个）加上可选的
# allowedExtensionIds（数组）。两个都认，老的设置文件不用重写也能用。
function Get-AllowedExtensionIds {
  $settings = Read-HostSettings
  $ids = New-Object System.Collections.Generic.List[string]
  $single = [string]$settings.extensionId
  if (-not [string]::IsNullOrWhiteSpace($single)) { $ids.Add($single.Trim().ToLowerInvariant()) }
  if ($settings.PSObject.Properties.Name -contains "allowedExtensionIds") {
    foreach ($candidate in @($settings.allowedExtensionIds)) {
      $text = [string]$candidate
      if (-not [string]::IsNullOrWhiteSpace($text)) { $ids.Add($text.Trim().ToLowerInvariant()) }
    }
  }
  return ,$ids.ToArray()
}

# 协议 4：每条请求都要自报扩展 id（chrome.runtime.id）与协议号。
# 这是「调用方认证」而不是密码学意义的安全边界 —— Chrome 只会启动清单里
# allowed_origins 允许的那个扩展，这里再加一道，挡住「别的扩展/别的脚本把宿主当通用
# 目录打开器用」。白名单为空（老安装脚本写的设置）时按 open 放行并如实标注。
function Assert-RequestCaller($Request) {
  $extensionId = [string]$Request.extensionId
  if ([string]::IsNullOrWhiteSpace($extensionId) -or $extensionId -notmatch '^[a-p]{32}$') {
    throw "这条请求没有带有效的扩展 ID。请重新运行一次安装脚本（协议 4 需要扩展自报身份）。"
  }
  $requestProtocol = 0
  if ($Request.PSObject.Properties.Name -contains "protocol") { $requestProtocol = [int]$Request.protocol }
  if ($requestProtocol -ne $protocolVersion) {
    throw "扩展自报的协议号（$requestProtocol）对不上（宿主是 $protocolVersion），请重新运行安装脚本。"
  }
  $allowed = @(Get-AllowedExtensionIds)
  if ($allowed.Count -eq 0) { return "open" }
  if ($allowed -notcontains $extensionId.ToLowerInvariant()) {
    throw "调用方扩展（$extensionId）不在白名单里，拒绝执行。"
  }
  return "whitelisted"
}

function Get-DownloadBasePath {
  if (-not (Test-Path -LiteralPath $settingsPath -PathType Leaf)) { throw "找不到本地下载目录设置，请重新运行安装脚本。" }
  # 1.8.22（old-p3 native L198、L208）：以前是 Get-Content -Raw -Encoding UTF8 一把梭。
  # 文件被记事本另存成 ANSI（GB2312）时，中文下载路径会被静默解成乱码；JSON 坏了则
  # 把 .NET 解析器原文（「传入的对象无效，应为“:”或“}”」）直接甩给用户。现在按字节读、
  # 严格按 UTF-8 解码（解不开就明确说是编码问题），JSON 解析也换成人话错误。
  $settings = Read-HostSettings
  $basePath = [string]$settings.downloadBasePath
  if ([string]::IsNullOrWhiteSpace($basePath)) { throw "本地下载目录设置不完整，请重新运行安装脚本。" }
  return [System.IO.Path]::GetFullPath($basePath)
}

function Assert-SafeDirectoryName([string]$Value, [string]$Label) {
  if ([string]::IsNullOrWhiteSpace($Value)) { throw "$Label 不能为空。" }
  # 1.8.22（old-p3 native L190）：「...」会被 GetFullPath 解析成下载根本身（打开整根目录）。
  # 全是点的名字不是合法文件夹名，单独拦一条。
  if ($Value -match '^\.+$') { throw "$Label 不能只由点组成。" }
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
  # 1.8.22（old-p3 native L184）：NUL、AUX 这类保留设备名会被 GetFullPath 变成
  # 设备命名空间形式（\.\NUL）。它既不是「超出下载目录」，也不是合法文件夹名；
  # 以前会掉进下面那句「目标目录超出了已设置的下载目录」的误导文案里。
  if ($targetPath.StartsWith('\\.\', [System.StringComparison]::Ordinal)) { throw "「$DirectoryName」不是有效的文件夹名（Windows 保留设备名）。" }
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
    # 1.10.2（TODO P2-13）：协议 4 先认调用方，再干活。没带 id、id 不合法、或不在
    # 白名单里，一律回一条 ok=false 的帧（带 protocol / version / auth），扩展能直接显示原因。
    $script:authMode = Assert-RequestCaller $request
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
    $errorMessage = [string]$_.Exception.Message
    $errorType = [string]$_.Exception.GetType().Name
    # 1.8.22（old-p3 native L207）：超长目录名会抛 PathTooLongException，原文是
    # 「路径或文件名必须少于 260 个字符」这种系统腔调，换成人话；类型照报，方便排查。
    if ($_.Exception -is [System.IO.PathTooLongException] -or $errorMessage -match "必须少于|too long") {
      $errorMessage = "目录名或路径太长（Windows 最多支持 260 个字符），请把这个视频的目录名改短一些。"
    }
    Write-Response $outputStream @{
      ok = $false
      message = $errorMessage
      errorType = $errorType
    }
  }
}
