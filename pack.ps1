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
# 1.5.1（P0-3）：bili-old-2015/ 曾是只给开发对照用的老站快照，整目录 672 文件 / 约 39MB，
#   而扩展本体只有约 1.3MB —— 那时它整目录被排除。
# 1.11.0：它成了功能的一部分（收藏库左下角「给 up 一个一键三连」点开就是这一页），
#   所以从 1.5.1 起的「整目录排除」改成「只带运行期子集」：index.html + egg-2015.js +
#   assets 里的图片。开发物（_ref/、build/、spec/、tools/、assets/_tools/、各种 *.md 与
#   清单 JSON）一律不进包 —— 它们由下面的 $excludePaths 按前缀排除。
#   瘦身过程见 docs/HISTORY.md 的 V1.11.0：内联 551 处 data: URI 改成 192 个外链文件，
#   同一张图不再被重复内联。_ref/ 仍是"只给开发看的参考目录"，继续整目录排除。
#
# 注意：这里的每一项都会同时参与下面「运行期文件清单」的反向断言（$expected 与
# $actual 必须完全一致）—— 排除多了会把运行期文件一起丢掉，脚本会当场报错，
# 而不是悄悄打出一个残缺的包。
$excludeNames = @(
  ".git", ".gitattributes", ".gitignore", ".github", ".node-path", "test", "scripts",
  "AI_HANDOFF.md", "README.md", "SMOKE_TEST.md", "release.ps1", "pack.ps1",
  "_ref", "docs"
)

# 1.11.0：$excludeNames 只能按「顶层名字」排除，彩蛋页要「留目录、去开发物」，
# 所以再补一份按前缀匹配的清单（相对仓库根，不带结尾斜杠）。命中规则见下面的 $expected 循环。
$excludePaths = @(
  "bili-old-2015/_ref", "bili-old-2015/build", "bili-old-2015/spec", "bili-old-2015/tools",
  "bili-old-2015/README.md", "bili-old-2015/assets/_tools",
  "bili-old-2015/egg-baseline.json",
  "bili-old-2015/assets/MANIFEST.json", "bili-old-2015/assets/NEEDED.json",
  "bili-old-2015/assets/COVER-MAP.json", "bili-old-2015/assets/COVER-MAP.md",
  "bili-old-2015/assets/COVER-WIRING.md", "bili-old-2015/assets/ICONS.md",
  "bili-old-2015/assets/INDEX.md", "bili-old-2015/assets/thumbs.json",
  # 1.11.2：检查更新读的是仓库（和 jsDelivr 镜像）上那份 version.json，本地这份只给发布流程用，
  # 装进包里反而让人以为要手改它。
  "version.json"
)

$expected = New-Object System.Collections.Generic.List[string]
Get-ChildItem -LiteralPath $root -Recurse -File -Force | ForEach-Object {
  $rel = $_.FullName.Substring($root.Length + 1).Replace("\", "/")
  $top = $rel.Split("/")[0]
  if ($excludeNames -contains $top) { return }
  foreach ($skip in $excludePaths) {
    if ($rel -eq $skip -or $rel.StartsWith($skip + "/")) { return }
  }
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
  foreach ($dev in @("test", "scripts", ".github", "README.md", "AI_HANDOFF.md", "SMOKE_TEST.md", "release.ps1", "_ref", "docs")) {
    if ($actual | Where-Object { $_ -eq $dev -or $_ -like "$dev/*" }) { throw "开发文件 $dev 混进打包结果了" }
  }


  # 1.8.24（P3-12）：发布清单校验 —— 白名单、单文件体积、总量、文件数。
  # 商店审核看到包里混着源码映射、测试数据或几十 MB 的快照会直接退回；这里把
  # 「什么可以出现在包里」显式写死，体积和数量超限都当失败，而不是打印一行警告。
  # 新增运行期文件时，必须同时把它加进 $allowedTopFiles（或 $allowedTopDirs）。
  $allowedTopFiles = @(
    "archive-core.js", "archive-tools.js", "background.js", "client-errors.js", "content-i18n-keys.js",
    "content.js", "favorites-import.js", "guide.html", "i18n.js", "icons.js",
    "icon-16.png", "icon-32.png", "icon-48.png", "icon-128.png",
    "install-native-folder-opener.bat", "install-native-folder-opener.ps1",
    "library.css", "library.html", "library.js", "manifest.json", "mockup.css",
    "page.css", "pet-cat.png", "pet.css", "pet.js",
    "popup.css", "popup.html", "popup.js",
    "recycle.css", "recycle.html", "recycle.js",
    "settings.css", "settings.html", "settings.js",
    "stats-core.js", "stats.css", "stats.html", "stats.js", "theme.css", "theme.js",
    "test-native-folder-opener.ps1", "tutorial.html", "tutorial.js",
    "uninstall-native-folder-opener.ps1"
  )
  $allowedTopDirs = @("locales", "native", "bili-old-2015")
  # 1.11.0：彩蛋页进包后，运行期子集约 3.4MB（index.html 0.6MB + 重编码后的 assets 图片 2.4MB），
  # 扩展本体仍约 2.1MB。上限按「本体 + 彩蛋」给足余量，同时继续挡住「把开发物打进来」。
  $maxFileBytes = 2MB
  $maxTotalBytes = 7MB
  $maxZipBytes = 5MB
  $maxFileCount = 260
  foreach ($rel in $actual) {
    $top = $rel.Split("/")[0]
    $allowed = ($allowedTopFiles -contains $rel) -or ($allowedTopDirs -contains $top)
    if (-not $allowed) { throw "发布清单里出现了白名单之外的文件：$rel（要发布新文件，请先加进 pack.ps1 的 $allowedTopFiles / $allowedTopDirs）" }
    $bytes = (Get-Item -LiteralPath (Join-Path $stage ($rel.Replace("/", "\")))).Length
    if ($bytes -gt $maxFileBytes) { throw "文件 $rel 有 $([math]::Round($bytes / 1KB, 1)) KB，超过单文件 2 MB 上限" }
  }
  if ($actual.Count -gt $maxFileCount) { throw "发布包里有 $($actual.Count) 个文件，超过 $maxFileCount 上限 —— 大概率是把开发文件打进来了" }
  $stagedBytes = (Get-ChildItem -LiteralPath $stage -Recurse -File | Measure-Object -Property Length -Sum).Sum
  if ($stagedBytes -gt $maxTotalBytes) { throw "发布包总大小 $([math]::Round($stagedBytes / 1KB, 1)) KB，超过 7 MB 上限" }
  if (-not $OutDir) { $OutDir = Split-Path $root -Parent }
  if (-not (Test-Path -LiteralPath $OutDir)) { New-Item -ItemType Directory -Path $OutDir -Force | Out-Null }
  $zip = Join-Path $OutDir ("bili-vault-" + $version + ".zip")
  if (Test-Path -LiteralPath $zip) { Remove-Item -LiteralPath $zip -Force }
  Compress-Archive -Path (Join-Path $stage "*") -DestinationPath $zip -CompressionLevel Optimal

  $zipBytes = (Get-Item -LiteralPath $zip).Length
  if ($zipBytes -gt $maxZipBytes) {
    Remove-Item -LiteralPath $zip -Force
    throw "zip 有 $([math]::Round($zipBytes / 1KB, 1)) KB，超过 5 MB 上限，已删掉这个包"
  }
  $size = [math]::Round($zipBytes / 1KB, 1)
  "[OK] $zip"
  "[OK] 版本 $version，文件 $($actual.Count) 个，源目录 $([math]::Round($stagedBytes / 1KB, 1)) KB，zip $size KB"
  "[OK] 发布清单：locales、native 两个目录 + $($allowedTopFiles.Count) 个文件，均在允许范围内"
  "[OK] 已排除（开发用）：$($excludeNames -join ", ")"
} finally {
  Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
}
