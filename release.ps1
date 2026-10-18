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

# PowerShell 5.1 的坑：原生命令写到 stderr 的内容会被包装成 ErrorRecord，
# 配合上面的 $ErrorActionPreference='Stop' 会直接终止脚本 —— **即使命令其实成功了**。
# git push 的进度、node --check 的语法错误、git 的各种警告都写 stderr，
# 所以这里统一包一层，把 stderr 降级成普通字符串；正确性一律靠 $LASTEXITCODE 判断。
function Invoke-Native {
  param([string]$Exe, [string[]]$Arguments)
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    # 注意这里**不能**写 return ,@(...)：逗号会把整个数组当成一个对象输出，
    # 于是 "Invoke-Native ... | Select-String" 拿到的是一个被拼成一行的字符串，
    # 永远匹配不到任何行（发布时测试数字整段消失就是这么来的）。
    # 直接让它流进管道：赋值和 | Select-String 两种用法都对。
    & $Exe @Arguments 2>&1 | ForEach-Object { "$_" }
  } finally {
    $ErrorActionPreference = $previous
  }
}

# 走 GitHub 的命令（ls-remote / fetch / push）统一走这里：先直连，直连不通再自动走代理。
# 这样**系统代理保持关闭也能发版** —— 只要 Clash Verge 的内核在跑，混合端口就一直在监听，
# 跟「系统代理」那个开关无关；而开着全局代理反而会让浏览国内网站变卡。
function Invoke-GitRemote {
  param([string[]]$Arguments)
  $direct = Invoke-Native $Git $Arguments
  if ($LASTEXITCODE -eq 0) { return $direct }
  Say "  直连 GitHub 不通，改走代理 $ProxyUrl 重试…" $C_YELLOW
  $viaProxy = Invoke-Native $Git ($GitArgs + $Arguments)
  return $viaProxy
}

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
$dirty = Invoke-Native $Git @('status', '--porcelain')
if ($dirty.Count -gt 0) {
  Say "  工作区有未提交的改动：" $C_YELLOW
  $dirty | ForEach-Object { Say "    $_" $C_YELLOW }
  Die "请先提交或撤销这些改动，再发布。"
}
Say "  [$([char]0x2713)] 干净" $C_GREEN

# Chrome 拒绝加载任何以 _ 开头的文件/目录（"Filenames starting with \"_\" are reserved"）。
# 排查用的临时脚本如果留在扩展根目录，插件就直接加载不了 —— 真机上发生过一次。
# 更麻烦的是 .gitignore 里有 _*.cjs，git status 看不见它，上面那个净树检查会漏掉，
# 所以这里用文件系统直接查，不看 git。
# 版本小节分两处放：「README.md」只放**最新一版**（用户要看的），
# 「docs/HISTORY.md」放完整历史（从最新一版一路回溯到 V1.0.0 与 36 个测试版）。
# 以前所有版本都堆在 README 里，涨到 1800 行、和 HISTORY 大量重复，改一处漏一处；
# 而且 V1.x 时期 README 漏过 9 个 tag 的小节（V1.1.4–V1.1.13），V1.4.0 的标题也被误删过。
# 所以两道闸门：① 这次要发的版本必须在 README 里有小节；② 所有 tag 都必须能在 HISTORY 里找到。
$readme = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'README.md') -Raw -Encoding UTF8
if ($readme -notmatch "(?m)^## V$([regex]::Escape($版本))[：:]") {
  Say "  README.md 里没有「## V$版本：...」这一节。" $C_RED
  Say "  打了 tag 就必须有版本小节，否则版本历史会缺环。" $C_YELLOW
  Say "  写多少看改动大小：bug 修复/新功能写清楚，界面微调一行带过即可。" $C_YELLOW
  Say "  不值得单独发版的改动就别发版 —— 直接提交、不打 tag。" $C_YELLOW
  Die "发布中止：先在 README.md 里补上 V$版本 的小节。"
}

# 只查「这次要发的版本」还不够 —— V1.x 时期 V1.4.0 的 README 小节标题曾被一次编辑误删，
# 而当时发的是 V1.4.1，那一节整整缺了一版都没人发现（发现时已经隔了两个版本）。
# 所以这里把 git tag 全量过一遍：任何一个 V 开头的 tag 在 docs/HISTORY.md 里找不到
# "## V<版本>" 这一节，就不许发布。下面这段先拦住「README 里堆了多个版本小节」。
# README 只留最新一版：多于一个小节说明旧的没归档，会让「同一段历史两份」的老问题回来。
$readmeSections = @([regex]::Matches($readme, '(?m)^## V(\d+(?:\.\d+){0,3})[：:]'))
if ($readmeSections.Count -gt 1) {
  $inReadme = @($readmeSections | ForEach-Object { 'V' + $_.Groups[1].Value })
  Say "  README.md 里有 $($readmeSections.Count) 个版本小节：$($inReadme -join '、')" $C_RED
  Say "  README 只放最新一版，更早的版本要移到 docs/HISTORY.md。" $C_YELLOW
  Die "发布中止：把 README.md 里除 V$版本 以外的版本小节移进 docs/HISTORY.md。"
}

$history = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'docs/HISTORY.md') -Raw -Encoding UTF8

$tagList = @(Invoke-Native $Git @('tag') |
  ForEach-Object { $_.Trim() } |
  Where-Object { $_ -match '^V\d' })
$missingSections = @($tagList | Where-Object {
  $history -notmatch "(?m)^## $([regex]::Escape($_))[：:]"
})
if ($missingSections.Count) {
  Say "  docs/HISTORY.md 里缺 $($missingSections.Count) 个已打 tag 的版本小节：" $C_RED
  foreach ($m in $missingSections) { Say "    ## $m：..." $C_RED }
  Say "  打了 tag 就必须有版本小节，否则版本历史会缺环。" $C_YELLOW
  Die "发布中止：先补上上面这些版本的 docs/HISTORY.md 小节。"
}

$reserved = @(Get-ChildItem -LiteralPath $PSScriptRoot -Force -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -like '_*' })
if ($reserved.Count) {
  Say "  扩展根目录里有 $($reserved.Count) 个 _ 开头的条目，Chrome 会拒绝加载整个插件：" $C_RED
  $reserved | ForEach-Object { Say "    $($_.Name)" $C_RED }
  Say "  排查脚本请写到扩展目录之外，或改掉命名。" $C_YELLOW
  Die "发布中止：先清掉这些文件。"
}

# ───────── 2. 到 GitHub 的路（这一步不过就什么都不动） ─────────
Say "`n【2/6】检查能不能到 GitHub" $C_DIM
$portOpen = Test-NetConnection -ComputerName '127.0.0.1' -Port $ProxyPort -InformationLevel Quiet -WarningAction SilentlyContinue -ErrorAction SilentlyContinue
if ($portOpen) {
  Say "  Clash 混合端口 $ProxyPort 在监听（系统代理开不开都不影响 git）。" $C_DIM
} else {
  Say "  Clash Verge 的内核没在跑（端口 $ProxyPort 不通），先试直连。" $C_YELLOW
}
$probe = Invoke-GitRemote @('ls-remote', '--heads', 'origin')
if ($LASTEXITCODE -ne 0) {
  Say "  直连和代理都到不了 GitHub：" $C_YELLOW
  $probe | Select-Object -First 3 | ForEach-Object { Say "    $_" $C_YELLOW }
  Say "  → 请打开 Clash Verge（系统代理不用开），确认节点能连上，再重新运行本脚本。" $C_YELLOW
  Say "  （本步骤之前没有改动任何文件）" $C_DIM
  exit 1
}
Say "  [$([char]0x2713)] 能到 GitHub" $C_GREEN

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

$rollback = { Invoke-Native $Git @('checkout', '--', 'manifest.json', 'test/stability.test.cjs', 'library.html') | Out-Null }
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
# _ref 下的 *.pretty.js 是互联网档案馆导出的 pretty-print JSON 转储（整份文件以一个 { 开头），
# 不是可执行脚本，node --check 必然报错；它们只作对照资料，不参与扩展运行。
$jsFiles = @(Get-ChildItem -Recurse -File -Include *.js, *.cjs | Where-Object { $_.FullName -notlike '*\.git\*' -and $_.FullName -notlike '*\_ref\*' })
foreach ($f in $jsFiles) {
  Invoke-Native $Node @('--check', $f.FullName) | Out-Null
  if ($LASTEXITCODE -ne 0) { Say "    [$([char]0x2716)] $($f.Name) 语法错误" $C_RED; $failed = $true }
}
if (-not $failed) { Say "    [$([char]0x2713)] $($jsFiles.Count) 个 JS 文件全部通过" $C_GREEN }

Say "  回归测试（静态断言）…" $C_DIM
Invoke-Native $Node @('test/stability.test.cjs') | Select-String -Pattern '^ℹ (tests|pass|fail)' | ForEach-Object { Say "    $_" $C_DIM }
if ($LASTEXITCODE -ne 0) { Say "    [$([char]0x2716)] 测试未全过" $C_RED; $failed = $true }

Say "  纯函数单元测试（真执行 archive-core.js）…" $C_DIM
Invoke-Native $Node @('test/archive-core.test.cjs') | Select-String -Pattern '^ℹ (tests|pass|fail)' | ForEach-Object { Say "    $_" $C_DIM }
if ($LASTEXITCODE -ne 0) { Say "    [$([char]0x2716)] 单元测试未全过" $C_RED; $failed = $true }

# 1.5.0 起本地数据库的纯逻辑单独一套：它不碰浏览器 API，可以在 node 里真跑。
Say "  纯函数单元测试（真执行 stats-core.js）…" $C_DIM
Invoke-Native $Node @('test/stats-core.test.cjs') | Select-String -Pattern '^ℹ (tests|pass|fail)' | ForEach-Object { Say "    $_" $C_DIM }
if ($LASTEXITCODE -ne 0) { Say "    [$([char]0x2716)] 数据库单元测试未全过" $C_RED; $failed = $true }

# 1.7.22：这一套把 background.js 整份丢进 vm 跑起来（配上内存版 chrome.storage 与内存版
# 目录树），真调 readStatsDatabase / writeStatsDatabase / flushStatsPendingRecords /
# rollbackStatsRecords / 三个写入口的互斥链 / 归档写锁，外加从 library.js 抠出来的
# nativeHostRequest。以前这一整块只有静态断言盖着 —— 静态断言能证明「写着 canWrite=false」，
# 证明不了「读不出来的时候真的一字节都没写」，1.7.0 的 P0 就是这么漏过去的。
Say "  浏览器环境单元测试（真执行 background.js 与 library.js 的原生消息）…" $C_DIM
Invoke-Native $Node @('test/background.test.cjs') | Select-String -Pattern '^ℹ (tests|pass|fail)' | ForEach-Object { Say "    $_" $C_DIM }
if ($LASTEXITCODE -ne 0) { Say "    [$([char]0x2716)] 浏览器环境单元测试未全过" $C_RED; $failed = $true }

# 1.7.23：页面脚本（library.js / popup.js / content.js）也进真执行测试 —— 最小 DOM + 影子
# DOM + 真 MutationObserver，把「点确认收藏 → 弹层关上 → 发归档消息」整条链跑完。
# 之前这三份文件只有静态文本断言，「点了之后到底发没发消息」是测不到的。
Say "  页面脚本单元测试（真执行 library.js / popup.js / content.js）…" $C_DIM
Invoke-Native $Node @('test/pages.test.cjs') | Select-String -Pattern '^ℹ (tests|pass|fail)' | ForEach-Object { Say "    $_" $C_DIM }
if ($LASTEXITCODE -ne 0) { Say "    [$([char]0x2716)] 页面脚本单元测试未全过" $C_RED; $failed = $true }

# 1.7.27：交接文档里的「当前状态」必须是脚本生成的，手写必漂。--check 只读不跑测试，
# 对不上就说明文档落后了 —— 跑 node test/status.cjs --write 刷新，而不是去改数字。
Say "  交接文档的「当前状态」…" $C_DIM
Invoke-Native $Node @('test/status.cjs', '--check') | ForEach-Object { Say "    $_" $C_DIM }
if ($LASTEXITCODE -ne 0) { Say "    [$([char]0x2716)] 交接文档的「当前状态」与仓库实际不一致" $C_RED; $failed = $true }

Say "  词典覆盖…" $C_DIM
$i18nOut = Invoke-Native $Node @('test/i18n-extract.cjs', '--check')
$i18nOut | Select-String -Pattern '词条 \d+ 条' | ForEach-Object { Say "    $_" $C_DIM }
if ($i18nOut -match '缺 [1-9]') { Say "    [$([char]0x2716)] 有词条缺翻译" $C_RED; $failed = $true }

# 1.7.21：上面只拦「缺」不拦「多余」，结果就是一个数字都不报 —— 作者删掉的旧词条
# 会一直留在两本词典里没人知道（当前各 52 条）。它不影响用户看到什么，所以仍然不
# 拦发布，但每次发版把它打出来，涨了看得见；两本不一致才说明是真的记账出错。
$orphanCounts = @()
foreach ($line in $i18nOut) {
  if ("$line" -match '多余\s+(\d+)') { $orphanCounts += [int]$Matches[1] }
}
$orphanCounts = @($orphanCounts | Select-Object -Unique | Sort-Object)
if ($orphanCounts.Count -eq 1) {
  Say "    作者已删的旧词条（不影响界面）：$($orphanCounts[0]) 条" $C_DIM
} elseif ($orphanCounts.Count -gt 1) {
  Say "    [$([char]0x2716)] 两本词典的多余条数不一致：$($orphanCounts -join ' / ')" $C_YELLOW
}

# 文档里写的词典条数也必须和词典实际条数一致。README 里那句「两本词典各 … 条」以前
# 没人核对，加过词之后就停在旧数字上（847），而词典实际早就涨到 859 条了 —— 和下面
# 的测试项数是同一类问题：数字写死在文档里，就一定会过期。
# 条数直接从上面 i18n-extract --check 的输出里读；文档侧的锚点同样写成 HTML 注释。
Say "  文档里的词典条数…" $C_DIM
$dictCounts = @()
foreach ($line in $i18nOut) {
  if ("$line" -match '词条\s+(\d+)\s+条') { $dictCounts += [int]$Matches[1] }
}
$dictCounts = @($dictCounts | Select-Object -Unique)
if ($dictCounts.Count -ne 1) {
  Say "    [$([char]0x2716)] 没能从词典检查的输出里读出唯一的条数（读到 $($dictCounts.Count) 种）" $C_RED
  $failed = $true
} else {
  $realDictCount = $dictCounts[0]
  $dictMarkers = 0
  $staleDict = @()
  foreach ($doc in @('README.md', 'AI_HANDOFF.md', 'SMOKE_TEST.md')) {
    $docPath = Join-Path $PSScriptRoot $doc
    if (-not (Test-Path -LiteralPath $docPath)) { continue }
    $docText = Get-Content -LiteralPath $docPath -Raw -Encoding UTF8
    foreach ($m in [regex]::Matches($docText, '<!--\s*i18n-count:(\d+)\s*-->')) {
      $dictMarkers++
      if ([int]$m.Groups[1].Value -ne $realDictCount) {
        $staleDict += "$doc 写的是 $($m.Groups[1].Value) 条，实际是 $realDictCount 条"
      }
    }
  }
  if ($dictMarkers -eq 0) {
    Say "    [$([char]0x2716)] 三处文档里都找不到 <!-- i18n-count:N --> 标记" $C_RED
    $failed = $true
  } elseif ($staleDict.Count -gt 0) {
    foreach ($line in $staleDict) { Say "    [$([char]0x2716)] $line" $C_RED }
    Say "    改法：把上面这几个文件里的词典条数改成 $realDictCount（连同 i18n-count 标记一起改，只改数字）。" $C_YELLOW
    $failed = $true
  } else {
    Say "    [$([char]0x2713)] 文档里的词典条数与词典一致（$realDictCount 条）" $C_GREEN
  }
}

# 文档里写的测试项数必须和真实数量一致。这三处以前各写各的（141 / 141 / 127），
# 实际早就涨到 163 了，读文档的人会以为测试规模还是原来那点 —— 和 README 版本历史
# 是同一类问题：数字写死在文档里，就一定会过期。
# 标记写成 HTML 注释，渲染出来看不见，但脚本能核对。
Say "  文档里的测试项数…" $C_DIM
$stabilitySrc = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'test/stability.test.cjs') -Raw -Encoding UTF8
$realTestCount = ([regex]::Matches($stabilitySrc, '(?m)^test\(')).Count
$staleDocs = @()
foreach ($doc in @('SMOKE_TEST.md', 'README.md', 'AI_HANDOFF.md')) {
  $docPath = Join-Path $PSScriptRoot $doc
  if (-not (Test-Path -LiteralPath $docPath)) { $staleDocs += "$doc 不存在"; continue }
  $docText = Get-Content -LiteralPath $docPath -Raw -Encoding UTF8
  $markers = [regex]::Matches($docText, '<!--\s*test-count:(\d+)\s*-->')
  if ($markers.Count -eq 0) { $staleDocs += "$doc 里找不到 <!-- test-count:N --> 标记"; continue }
  foreach ($m in $markers) {
    if ([int]$m.Groups[1].Value -ne $realTestCount) {
      $staleDocs += "$doc 写的是 $($m.Groups[1].Value) 项，实际是 $realTestCount 项"
    }
  }
}
if ($staleDocs.Count -gt 0) {
  foreach ($line in $staleDocs) { Say "    [$([char]0x2716)] $line" $C_RED }
  Say "    改法：把这三处文档里的 test-count 标记统一改成 $realTestCount（只改数字）。" $C_YELLOW
  $failed = $true
} else {
  Say "    [$([char]0x2713)] 三处文档都记着 $realTestCount 项" $C_GREEN
}

if ($failed) {
  & $rollback
  Die "检查未通过，版本号改动已回滚。修好之后重新运行。"
}
Say "  [$([char]0x2713)] 全部检查通过" $C_GREEN

# ───────── 5. 确认 ─────────
$msg = if ($说明) { "$Tag：$说明" } else { $Tag }
Say "`n【5/6】发布前人工确认" $C_DIM
Say "  自动检查全过了，但下面这些只有真机能验证。没做过的话先别发。" $C_YELLOW
Say "  （照着 SMOKE_TEST.md 走，约 5 分钟）" $C_DIM
Say ""
Say "    [ ] 1. 导入一个小收藏夹，完成消息里的条数与实际一致"
Say "    [ ] 2. 点开一条记录，封面正常显示（不是裂图）"
Say "    [ ] 3. 进收藏库，扫描进度不是 0/0，关闭按钮在"
Say "    [ ] 4. 标记一条「已下载」，000视频下载 被创建"
Say "    [ ] 5. 打开本地视频目录（本地目录打开助手可用）"
Say "    [ ] 6. 点右下角齿轮进设置页：切外观与语言立即生效；「自定义」选张图、拉遮罩与模糊、开毛玻璃，回收藏库看效果"
Say "    [ ] 7. 选一个收藏夹点「先看差异」，一两分钟出结果、报告写进 002同步报告"
Say "    [ ] 8. 跑一次导入后打开 003database 里的 database.json（纯文本可读）；设置页「数据统计」进统计页，四个数字与 14 天柱状图是真实值；收藏库右下角小鲸鱼点一下会说话，设置页关掉开关后它消失"
Say ""
Say "  前置：已在 chrome://extensions 点过「重新加载」" $C_YELLOW
Say ""
Say "  版本：$oldVersion → $版本（界面显示 $Tag）"
Say "  提交：$msg"
Say "  tag ：$Tag → 推送到 origin/main"
if (-not $Yes) {
  $ans = Read-Host "`n上面 8 项都验证过了吗？确认发布？(y/N)"
  if ($ans -notmatch '^[yY]') { & $rollback; Say "`n已取消，版本号改动已回滚。" $C_YELLOW; exit 0 }
}

# ───────── 6. 提交 + 推送 ─────────
Say "`n【6/6】提交与推送" $C_DIM
$msgFile = Join-Path $env:TEMP 'bv-release-msg.txt'
[System.IO.File]::WriteAllText($msgFile, $msg, $utf8NoBom)
Invoke-Native $Git @('add', '-A') | Out-Null
Invoke-Native $Git @('commit', '-q', '-F', $msgFile) | Out-Null
Remove-Item -LiteralPath $msgFile -Force -ErrorAction SilentlyContinue
Invoke-Native $Git @('tag', '-f', $Tag) | Out-Null
Say "  [$([char]0x2713)] 已提交并打 tag $Tag" $C_GREEN

$pushOut = Invoke-GitRemote @('push', 'origin', 'main', '--tags')
if ($LASTEXITCODE -ne 0) {
  Say "  [$([char]0x2716)] 推送失败：" $C_RED
  $pushOut | Select-Object -First 5 | ForEach-Object { Say "    $_" $C_RED }
  Say "`n  提交和 tag 都在本地，网络恢复后手动重推即可：" $C_YELLOW
  Say "    git push origin main --tags" $C_YELLOW
  exit 1
}

$localSha = (Invoke-Native $Git @('rev-parse', '--short', 'main')) -join ""
Invoke-GitRemote @('fetch', 'origin', '--quiet') | Out-Null
$remoteSha = (Invoke-Native $Git @('rev-parse', '--short', 'origin/main')) -join ""
Say "`n[$([char]0x2714)] 发布完成：$Tag" $C_GREEN
Say "  本地 main $localSha / 远程 main $remoteSha"
Say "  https://github.com/shijunan-Andrew/bili-vault/releases/tag/$Tag" $C_DIM
Say "`n  别忘了：在 chrome://extensions 里点一下「重新加载」，否则跑的还是旧代码。" $C_YELLOW
