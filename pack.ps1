<#
  pack.ps1 —— 打一个「只含运行期文件」的 zip（上传 / 分发用）。

  为什么需要它：这个仓库的根目录**就是**扩展目录，开发用的东西（test/、*.md、
  release.ps1、.node-path、.git*）平时和运行期文件混在一起放。Chrome 加载未打包扩展时
  会忽略它们，但打包分发时会被一并塞进 zip（P2-21）。这个脚本按排除清单挑文件，
  并且用「文件清单必须与源目录完全一致」做反向断言 —— 少一个就报错、不产出 zip，
  所以排除清单写错也不会悄悄漏掉运行期文件。

  用法：
    powershell -NoProfile -ExecutionPolicy Bypass -File .\pack.ps1
    powershell -NoProfile -ExecutionPolicy Bypass -File .\pack.ps1 -OutDir D:\分发
#>
param([string]$OutDir = "")

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$manifestPath = Join-Path $root "manifest.json"
$manifest = [System.IO.File]::ReadAllText($manifestPath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
$version = $manifest.version

# 只排除「开发用」的东西；其余一律照打。
#
# 1.5.1（P0-3）：bili-old-2015/ 是 2015 年那版老站的整站快照，只给开发时对照界面用，
#   不是扩展的一部分 —— 实测它一个目录就 672 个文件 / 约 39MB，而真正的扩展只有
#   约 1.3MB / 42 个文件。少了这一条，发行包里 97% 的体积都是这份快照，上传又慢又容易被
#   审核当成无关内容退回。_ref/ 是同一类"只给开发看的参考目录"（目前它嵌在
#   bili-old-2015/ 里，一起写上是为了以后有人把参考文件放到根目录时不会再混进包）。
#
# 注意：这里的每一项都会同时参与下面「运行期文件清单」的反向断言（$expected 与
# $actual 必须完全一致）—— 排除多了会把运行期文件一起丢掉，脚本会当场报错，
# 而不是悄悄打出一个残缺的包。
$excludeNames = @(
  ".git", ".gitattributes", ".gitignore", ".github", ".node-path", "test", "scripts",
  "AI_HANDOFF.md", "README.md", "SMOKE_TEST.md", "release.ps1", "pack.ps1",
  "bili-old-2015", "_ref", "docs"
)

$expected = New-Object System.Collections.Generic.List[string]
Get-ChildItem -LiteralPath $root -Recurse -File -Force | ForEach-Object {
  $rel = $_.FullName.Substring($root.Length + 1).Replace("\", "/")
  $top = $rel.Split("/")[0]
  if ($excludeNames -contains $top) { return }
  $expected.Add($rel)
}

$stage = Join-Path $env:TEMP ("bili-vault-pack-" + [guid]::NewGuid().ToString("N").Substring(0, 8))
New-Item -ItemType Directory -Path $stage -Force | Out-Null
try {
  foreach ($rel in $expected) {
    $src = Join-Path $root ($rel.Replace("/", "\"))
    $dst = Join-Path $stage ($rel.Replace("/", "\"))
    New-Item -ItemType Directory -Path (Split-Path $dst -Parent) -Force | Out-Null
    Copy-Item -LiteralPath $src -Destination $dst -Force
  }

  $actual = New-Object System.Collections.Generic.List[string]
  Get-ChildItem -LiteralPath $stage -Recurse -File -Force | ForEach-Object {
    $actual.Add($_.FullName.Substring($stage.Length + 1).Replace("\", "/"))
  }
  $missing = $expected | Where-Object { -not ($actual -contains $_) }
  $extra = $actual | Where-Object { -not ($expected -contains $_) }
  if ($missing.Count -or $extra.Count) {
    throw "打包内容与源目录不一致：缺失 $($missing.Count) 个（$($missing -join ", ")）；多出 $($extra.Count) 个（$($extra -join ", ")）"
  }
  foreach ($required in @("manifest.json", "background.js", "content.js", "popup.html", "library.html", "settings.html", "locales/zh-TW.json", "locales/en.json")) {
    if (-not ($actual -contains $required)) { throw "运行期文件 $required 不在打包结果里" }
  }
  foreach ($dev in @("test", "scripts", ".github", "README.md", "AI_HANDOFF.md", "SMOKE_TEST.md", "release.ps1", "bili-old-2015", "_ref", "docs")) {
    if ($actual | Where-Object { $_ -eq $dev -or $_ -like "$dev/*" }) { throw "开发文件 $dev 混进打包结果了" }
  }


  # 1.8.24（P3-12）：发布清单校验 —— 白名单、单文件体积、总量、文件数。
  # 商店审核看到包里混着源码映射、测试数据或几十 MB 的快照会直接退回；这里把
  # 「什么可以出现在包里」显式写死，体积和数量超限都当失败，而不是打印一行警告。
  # 新增运行期文件时，必须同时把它加进 $allowedTopFiles（或 $allowedTopDirs）。
  $allowedTopFiles = @(
    "archive-core.js", "background.js", "client-errors.js", "content-i18n-keys.js",
    "content.js", "favorites-import.js", "guide.html", "i18n.js", "icons.js",
    "icon-16.png", "icon-32.png", "icon-48.png", "icon-128.png",
    "install-native-folder-opener.bat", "install-native-folder-opener.ps1",
    "library.css", "library.html", "library.js", "manifest.json", "mockup.css",
    "page.css", "pet-cat.png", "pet.css", "pet.js",
    "popup.css", "popup.html", "popup.js",
    "settings.css", "settings.html", "settings.js",
    "stats-core.js", "stats.css", "stats.html", "stats.js", "theme.css", "theme.js",
    "test-native-folder-opener.ps1", "tutorial.html", "tutorial.js",
    "uninstall-native-folder-opener.ps1"
  )
  $allowedTopDirs = @("locales", "native")
  $maxFileBytes = 2MB
  $maxTotalBytes = 6MB
  $maxZipBytes = 3MB
  $maxFileCount = 150
  foreach ($rel in $actual) {
    $top = $rel.Split("/")[0]
    $allowed = ($allowedTopFiles -contains $rel) -or ($allowedTopDirs -contains $top)
    if (-not $allowed) { throw "发布清单里出现了白名单之外的文件：$rel（要发布新文件，请先加进 pack.ps1 的 $allowedTopFiles / $allowedTopDirs）" }
    $bytes = (Get-Item -LiteralPath (Join-Path $stage ($rel.Replace("/", "\")))).Length
    if ($bytes -gt $maxFileBytes) { throw "文件 $rel 有 $([math]::Round($bytes / 1KB, 1)) KB，超过单文件 2 MB 上限" }
  }
  if ($actual.Count -gt $maxFileCount) { throw "发布包里有 $($actual.Count) 个文件，超过 $maxFileCount 上限 —— 大概率是把开发文件打进来了" }
  $stagedBytes = (Get-ChildItem -LiteralPath $stage -Recurse -File | Measure-Object -Property Length -Sum).Sum
  if ($stagedBytes -gt $maxTotalBytes) { throw "发布包总大小 $([math]::Round($stagedBytes / 1KB, 1)) KB，超过 6 MB 上限" }
  if (-not $OutDir) { $OutDir = Split-Path $root -Parent }
  if (-not (Test-Path -LiteralPath $OutDir)) { New-Item -ItemType Directory -Path $OutDir -Force | Out-Null }
  $zip = Join-Path $OutDir ("bili-vault-" + $version + ".zip")
  if (Test-Path -LiteralPath $zip) { Remove-Item -LiteralPath $zip -Force }
  Compress-Archive -Path (Join-Path $stage "*") -DestinationPath $zip -CompressionLevel Optimal

  $zipBytes = (Get-Item -LiteralPath $zip).Length
  if ($zipBytes -gt $maxZipBytes) {
    Remove-Item -LiteralPath $zip -Force
    throw "zip 有 $([math]::Round($zipBytes / 1KB, 1)) KB，超过 3 MB 上限，已删掉这个包"
  }
  $size = [math]::Round($zipBytes / 1KB, 1)
  "[OK] $zip"
  "[OK] 版本 $version，文件 $($actual.Count) 个，源目录 $([math]::Round($stagedBytes / 1KB, 1)) KB，zip $size KB"
  "[OK] 发布清单：locales、native 两个目录 + $($allowedTopFiles.Count) 个文件，均在允许范围内"
  "[OK] 已排除（开发用）：$($excludeNames -join ", ")"
} finally {
  Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
}
