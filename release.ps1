<#
  哔哩藏库 Bili Vault · 发布脚本

  用法：
    .\release.ps1 -版本 1.0.1 -说明 "修了导入卡死"
    .\release.ps1 -版本 1.1.0 -说明 "新增 xxx" -Yes      # -Yes 跳过确认

  它按顺序做这些事：
    1. 检查工作区是否干净
    2. 检查代理（Clash 没开就提醒你去开，然后退出，不动任何东西）
    3. 改 3 处版本号（manifest.json / 测试断言 / library.html）
    4. 跑全部检查：语法 → 回归测试 → 词典覆盖
    5. 任何一步不过，自动回滚版本号改动并退出
    6. 提交 → 打 tag（V<版本>）→ 推送

  依赖：git 与 node。两者都会自动查找（PATH → 常见安装位置 → 仓库根的 .node-path），
  所以不要求你的终端 PATH 已经刷新过。.node-path 已 gitignore，不会进公开仓库。
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

$C_RESET = "$([char]27)[0m"; $C_RED = "$([char]27)[31m"; $C_GREEN = "$([char]27)[32m"
$C_YELLOW = "$([char]27)[33m"; $C_DIM = "$([char]27)[2m"
function Say($msg, $color = $C_RESET) { Write-Host "$color$msg$C_RESET" }
function Die($msg) { Say "`n[$([char]0x2716)] $msg" $C_RED; exit 1 }

# ───────── 找 git 与 node（都不依赖终端 PATH 已刷新） ─────────
function Find-Exe {
  param([string]$Name, [string[]]$Candidates, [string]$LocalHint)
  if ($LocalHint) {
    $hintFile = Join-Path $PSScriptRoot $LocalHint
    if (Test-Path -LiteralPath $hintFile) {
      $p = (Get-Content -LiteralPath $hintFile -Raw).Trim()
      if ($p -and (Test-Path -LiteralPath $p)) { return $p }
    }
  }
  $cmd = Get-Command $Name -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  foreach ($p in $Candidates) { if (Test-Path -LiteralPath $p) { return $p } }
  return $null
}

$Git = Find-Exe -Name 'git' -LocalHint '.git-path' -Candidates @(
  'D:\Git\cmd\git.exe',
  'C:\Program Files\Git\cmd\git.exe',
  "${env:ProgramFiles(x86)}\Git\cmd\git.exe",
  "$env:LOCALAPPDATA\Programs\Git\cmd\git.exe"
)
if (-not $Git) { Die "找不到 git。请安装 Git for Windows，或把 git.exe 的完整路径写到仓库根的 .git-path 文件里。" }

$Node = Find-Exe -Name 'node' -LocalHint '.node-path' -Candidates @(
  "$env:ProgramFiles\nodejs\node.exe",
  "${env:ProgramFiles(x86)}\nodejs\node.exe",
  "$env:LOCALAPPDATA\Programs\nodejs\node.exe"
)
if (-not $Node) { Die "找不到 node。请安装 Node.js，或把 node.exe 的完整路径写到仓库根的 .node-path 文件里（该文件已 gitignore）。" }

$GitArgs = @('-c', "http.proxy=$ProxyUrl", '-c', "https.proxy=$ProxyUrl")

# ───────── 0. 版本号格式 ─────────
if ($版本 -notmatch '^\d+(\.\d+){0,3}$') {
  Die "版本号只能是一到四段数字（Chrome 的硬要求），例如 1.0.1。收到的是「$版本」"
}
$Tag = "V$版本"

Say "`n  git : $Git" $C_DIM
Say "  node: $Node" $C_DIM

# ───────── 1. 工作区必须干净 ─────────
Say "`n【1/6】检查工作区" $C_DIM
$dirty = @(& $Git status --porcelain)
if ($dirty.Count -gt 0) {
  Say "  工作区有未提交的改动：" $C_YELLOW
  $dirty | ForEach-Object { Say "    $_" $C_YELLOW }
  Die "请先提交或撤销这些改动，再发布。"
}
Say "  [$([char]0x2713)] 干净" $C_GREEN

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
$probe = & $Git @GitArgs ls-remote --heads origin 2>&1
if ($LASTEXITCODE -ne 0) {
  Say "  代理开着，但到 GitHub 不通：" $C_YELLOW
  $probe | Select-Object -First 3 | ForEach-Object { Say "    $_" $C_YELLOW }
  Say "  → 请在 Clash 里换一个节点，然后重新运行本脚本。" $C_YELLOW
  exit 1
}
Say "  [$([char]0x2713)] 代理可用" $C_GREEN

# ───────── 3. 改版本号（记住原值以便回滚） ─────────
Say "`n【3/6】改版本号 → $版本" $C_DIM
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$oldVersion = (Get-Content -LiteralPath 'manifest.json' -Raw -Encoding UTF8 | ConvertFrom-Json).version

function Set-FileText($path, $from, $to, $label) {
  $text = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
  $count = ([regex]::Matches($text, [regex]::Escape($from))).Count
  if ($count -ne 1) { Die "$label：锚点出现 $count 次（应为 1）—— 文件可能已被改过" }
  [System.IO.File]::WriteAllText($path, $text.Replace($from, $to), $utf8NoBom)
  Say "  [$([char]0x2713)] $label" $C_GREEN
}

$rollback = { & $Git checkout -- manifest.json 'test/stability.test.cjs' library.html 2>$null }
try {
  Set-FileText 'manifest.json' "`"version`": `"$oldVersion`"" "`"version`": `"$版本`"" 'manifest.json'
  Set-FileText 'test/stability.test.cjs' "assert.equal(manifest.version, `"$oldVersion`");" "assert.equal(manifest.version, `"$版本`");" 'test/stability.test.cjs'
  Set-FileText 'library.html' "<span id=`"sideVersion`">V$oldVersion</span>" "<span id=`"sideVersion`">$Tag</span>" 'library.html'
} catch {
  & $rollback
  Die "改版本号失败，已回滚：$($_.Exception.Message)"
}

# ───────── 4. 检查 ─────────
Say "`n【4/6】跑检查" $C_DIM
$failed = $false

Say "  语法检查…" $C_DIM
$jsFiles = @(Get-ChildItem -Recurse -File -Include *.js, *.cjs | Where-Object { $_.FullName -notlike '*\.git\*' })
foreach ($f in $jsFiles) {
  & $Node --check $f.FullName 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) { Say "    [$([char]0x2716)] $($f.Name) 语法错误" $C_RED; $failed = $true }
}
if (-not $failed) { Say "    [$([char]0x2713)] $($jsFiles.Count) 个 JS 文件全部通过" $C_GREEN }

Say "  回归测试…" $C_DIM
& $Node test/stability.test.cjs 2>&1 | Select-String -Pattern '^ℹ (tests|pass|fail)' | ForEach-Object { Say "    $_" $C_DIM }
if ($LASTEXITCODE -ne 0) { Say "    [$([char]0x2716)] 测试未全过" $C_RED; $failed = $true }

Say "  词典覆盖…" $C_DIM
$i18nOut = & $Node test/i18n-extract.cjs --check 2>&1
$i18nOut | Select-String -Pattern '词条 \d+ 条' | ForEach-Object { Say "    $_" $C_DIM }
if ($i18nOut -match '缺 [1-9]') { Say "    [$([char]0x2716)] 有词条缺翻译" $C_RED; $failed = $true }

if ($failed) {
  & $rollback
  Die "检查未通过，版本号改动已回滚。修好之后重新运行。"
}
Say "  [$([char]0x2713)] 全部检查通过" $C_GREEN

# ───────── 5. 确认 ─────────
$msg = if ($说明) { "$Tag：$说明" } else { $Tag }
Say "`n【5/6】即将提交" $C_DIM
Say "  版本：$oldVersion → $版本（界面显示 $Tag）"
Say "  提交：$msg"
Say "  tag ：$Tag → 推送到 origin/main"
if (-not $Yes) {
  $ans = Read-Host "`n确认发布？(y/N)"
  if ($ans -notmatch '^[yY]') { & $rollback; Say "`n已取消，版本号改动已回滚。" $C_YELLOW; exit 0 }
}

# ───────── 6. 提交 + 推送 ─────────
Say "`n【6/6】提交与推送" $C_DIM
$msgFile = Join-Path $env:TEMP 'bv-release-msg.txt'
[System.IO.File]::WriteAllText($msgFile, $msg, $utf8NoBom)
& $Git add -A
& $Git commit -q -F $msgFile
Remove-Item -LiteralPath $msgFile -Force -ErrorAction SilentlyContinue
& $Git tag -f $Tag | Out-Null
Say "  [$([char]0x2713)] 已提交并打 tag $Tag" $C_GREEN

$pushOut = & $Git @GitArgs push origin main --tags 2>&1
if ($LASTEXITCODE -ne 0) {
  Say "  [$([char]0x2716)] 推送失败：" $C_RED
  $pushOut | Select-Object -First 5 | ForEach-Object { Say "    $_" $C_RED }
  Say "`n  提交和 tag 都在本地，网络恢复后手动重推即可：" $C_YELLOW
  Say "    git push origin main --tags" $C_YELLOW
  exit 1
}

$localSha = (& $Git rev-parse --short main).Trim()
& $Git @GitArgs fetch origin --quiet 2>$null
$remoteSha = (& $Git rev-parse --short origin/main).Trim()
Say "`n[$([char]0x2714)] 发布完成：$Tag" $C_GREEN
Say "  本地 main $localSha / 远程 main $remoteSha"
Say "  https://github.com/shijunan-Andrew/bili-vault/releases/tag/$Tag" $C_DIM
Say "`n  别忘了：在 chrome://extensions 里点一下「重新加载」，否则跑的还是旧代码。" $C_YELLOW
