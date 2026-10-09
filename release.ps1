<#
  哔哩藏库 Bili Vault · 发布脚本

  用法：
    .\release.ps1 -版本 1.0.1 -说明 "修了导入卡死"
    .\release.ps1 -版本 1.1.0 -说明 "新增 xxx" -Yes      # -Yes 跳过确认

  它按顺序做这些事：
    1. 检查工作区是否干净
    2. 检查代理（Clash 没开就提醒你去开，然后退出，不动任何东西）
    3. 改 3 处版本号（manifest.json / 测试断言 / library.html）
    4. 跑全部检查：语法 → 126 项测试 → 词典覆盖
    5. 任何一步不过，自动回滚版本号改动并退出
    6. 提交 → 打 tag（V<版本>）→ 推送

  依赖：git（PATH 里）；node（PATH 里，或写在仓库根的 .node-path 文件里，该文件已 gitignore）
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true, Position = 0)][string]$版本,
  [Parameter(Position = 1)][string]$说明 = "",
  [switch]$Yes
)

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

# ───────── 配置 ─────────
$ProxyUrl = 'http://127.0.0.1:7897'     # Clash Verge 默认混合端口；换过就在这里改
$ProxyPort = 7897
$GitArgs = @('-c', "http.proxy=$ProxyUrl", '-c', "https.proxy=$ProxyUrl")

$C_RESET = "$([char]27)[0m"; $C_RED = "$([char]27)[31m"; $C_GREEN = "$([char]27)[32m"
$C_YELLOW = "$([char]27)[33m"; $C_DIM = "$([char]27)[2m"
function Say($msg, $color = $C_RESET) { Write-Host "$color$msg$C_RESET" }
function Die($msg) { Say "`n✖ $msg" $C_RED; exit 1 }

# ───────── 0. 版本号格式 ─────────
if ($版本 -notmatch '^\d+(\.\d+){0,3}$') {
  Die "版本号只能是一到四段数字（Chrome 的硬要求），例如 1.0.1。收到的是「$版本」"
}
$Tag = "V$版本"

# ───────── 1. 工作区必须干净 ─────────
Say "`n【1/6】检查工作区" $C_DIM
$dirty = @(git status --porcelain)
if ($dirty.Count -gt 0) {
  Say "  工作区有未提交的改动：" $C_YELLOW
  $dirty | ForEach-Object { Say "    $_" $C_YELLOW }
  Die "请先提交或撤销这些改动，再发布。"
}
Say "  ✓ 干净" $C_GREEN

# ───────── 2. 代理（这一步不过就什么都不动） ─────────
Say "`n【2/6】检查代理" $C_DIM
$portOpen = Test-NetConnection -ComputerName '127.0.0.1' -Port $ProxyPort -InformationLevel Quiet -WarningAction SilentlyContinue -ErrorAction SilentlyContinue
if (-not $portOpen) {
  Say "  代理端口 $ProxyPort 没开。" $C_YELLOW
  Say "  → 请打开 Clash Verge 并确认节点已连接，然后重新运行本脚本。" $C_YELLOW
  Say "  （不开代理会卡 20 秒然后 Connection was reset；本脚本没有改动任何文件）" $C_DIM
  exit 1
}
Say "  端口 $ProxyPort 已开放，测试能否到达 GitHub…" $C_DIM
$probe = git @GitArgs ls-remote --heads origin 2>&1
if ($LASTEXITCODE -ne 0) {
  Say "  代理开着，但到 GitHub 不通：" $C_YELLOW
  $probe | Select-Object -First 3 | ForEach-Object { Say "    $_" $C_YELLOW }
  Say "  → 请在 Clash 里换一个节点，然后重新运行本脚本。" $C_YELLOW
  exit 1
}
Say "  ✓ 代理可用" $C_GREEN

# ───────── 3. 找 node ─────────
$Node = $null
if ($env:DSH_NODE -and (Test-Path -LiteralPath $env:DSH_NODE)) { $Node = $env:DSH_NODE }
if (-not $Node) { $c = Get-Command node -ErrorAction SilentlyContinue; if ($c) { $Node = $c.Source } }
if (-not $Node) {
  $localFile = Join-Path $PSScriptRoot '.node-path'
  if (Test-Path -LiteralPath $localFile) {
    $p = (Get-Content -LiteralPath $localFile -Raw).Trim()
    if (Test-Path -LiteralPath $p) { $Node = $p }
  }
}
if (-not $Node) {
  foreach ($p in @("$env:ProgramFiles\nodejs\node.exe", "${env:ProgramFiles(x86)}\nodejs\node.exe",
                   "$env:LOCALAPPDATA\Programs\nodejs\node.exe")) {
    if (Test-Path -LiteralPath $p) { $Node = $p; break }
  }
}
if (-not $Node) {
  Die "找不到 node。请安装 Node.js，或把 node.exe 的完整路径写到仓库根的 .node-path 文件里（该文件已 gitignore）。"
}
Say "`n  node: $Node" $C_DIM

# ───────── 4. 改版本号（记住原值以便回滚） ─────────
Say "`n【3/6】改版本号 → $版本" $C_DIM
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$oldVersion = (Get-Content -LiteralPath 'manifest.json' -Raw -Encoding UTF8 | ConvertFrom-Json).version

function Set-FileText($path, $from, $to, $label) {
  $text = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
  $count = ([regex]::Matches($text, [regex]::Escape($from))).Count
  if ($count -ne 1) { Die "$label：锚点出现 $count 次（应为 1）—— 文件可能已被改过" }
  [System.IO.File]::WriteAllText($path, $text.Replace($from, $to), $utf8NoBom)
  Say "  ✓ $label" $C_GREEN
}

$rollback = { git checkout -- manifest.json 'test/stability.test.cjs' library.html 2>$null }
try {
  Set-FileText 'manifest.json' "`"version`": `"$oldVersion`"" "`"version`": `"$版本`"" 'manifest.json'
  Set-FileText 'test/stability.test.cjs' "assert.equal(manifest.version, `"$oldVersion`");" "assert.equal(manifest.version, `"$版本`");" 'test/stability.test.cjs'
  Set-FileText 'library.html' "<span id=`"sideVersion`">V$oldVersion</span>" "<span id=`"sideVersion`">$Tag</span>" 'library.html'
} catch {
  & $rollback
  Die "改版本号失败，已回滚：$($_.Exception.Message)"
}

# ───────── 5. 检查 ─────────
Say "`n【4/6】跑检查" $C_DIM
$failed = $false

Say "  语法检查…" $C_DIM
$jsFiles = @(Get-ChildItem -Recurse -File -Include *.js, *.cjs | Where-Object { $_.FullName -notlike '*\.git\*' })
foreach ($f in $jsFiles) {
  & $Node --check $f.FullName 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) { Say "    ✖ $($f.Name) 语法错误" $C_RED; $failed = $true }
}
if (-not $failed) { Say "    ✓ $($jsFiles.Count) 个 JS 文件全部通过" $C_GREEN }

Say "  回归测试（126 项）…" $C_DIM
$testOut = & $Node test/stability.test.cjs 2>&1
$testOut | Select-String -Pattern '^ℹ (tests|pass|fail)' | ForEach-Object { Say "    $_" $C_DIM }
if ($LASTEXITCODE -ne 0) { Say "    ✖ 测试未全过" $C_RED; $failed = $true }

Say "  词典覆盖…" $C_DIM
$i18nOut = & $Node test/i18n-extract.cjs --check 2>&1
$i18nOut | Select-String -Pattern '词条 \d+ 条' | ForEach-Object { Say "    $_" $C_DIM }
if ($i18nOut -match '缺 [1-9]') { Say "    ✖ 有词条缺翻译" $C_RED; $failed = $true }

if ($failed) {
  & $rollback
  Die "检查未通过，版本号改动已回滚。修好之后重新运行。"
}
Say "  ✓ 全部检查通过" $C_GREEN

# ───────── 6. 确认 ─────────
$msg = if ($说明) { "$Tag：$说明" } else { $Tag }
Say "`n【5/6】即将提交" $C_DIM
Say "  版本：$oldVersion → $版本（界面显示 $Tag）"
Say "  提交：$msg"
Say "  tag ：$Tag → 推送到 origin/main"
if (-not $Yes) {
  $ans = Read-Host "`n确认发布？(y/N)"
  if ($ans -notmatch '^[yY]') { & $rollback; Say "`n已取消，版本号改动已回滚。" $C_YELLOW; exit 0 }
}

# ───────── 7. 提交 + 推送 ─────────
Say "`n【6/6】提交与推送" $C_DIM
$msgFile = Join-Path $env:TEMP "bv-release-msg.txt"
[System.IO.File]::WriteAllText($msgFile, $msg, $utf8NoBom)
git add -A
git commit -q -F $msgFile
Remove-Item -LiteralPath $msgFile -Force -ErrorAction SilentlyContinue
git tag -f $Tag | Out-Null
Say "  ✓ 已提交并打 tag $Tag" $C_GREEN

$pushOut = git @GitArgs push origin main --tags 2>&1
if ($LASTEXITCODE -ne 0) {
  Say "  ✖ 推送失败：" $C_RED
  $pushOut | Select-Object -First 5 | ForEach-Object { Say "    $_" $C_RED }
  Say "`n  提交和 tag 都在本地，网络恢复后手动重推即可：" $C_YELLOW
  Say "    git push origin main --tags" $C_YELLOW
  exit 1
}

$localSha = (git rev-parse --short main).Trim()
git @GitArgs fetch origin --quiet 2>$null
$remoteSha = (git rev-parse --short origin/main).Trim()
Say "`n✔ 发布完成：$Tag" $C_GREEN
Say "  本地 main $localSha / 远程 main $remoteSha $([char]0x2713)"
Say "  https://github.com/shijunan-Andrew/bili-vault/releases/tag/$Tag" $C_DIM
Say "`n  别忘了：在 chrome://extensions 里点一下「重新加载」，否则跑的还是旧代码。" $C_YELLOW
