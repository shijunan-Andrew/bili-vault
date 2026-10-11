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
$excludeNames = @(
  ".git", ".gitattributes", ".gitignore", ".node-path", "test",
  "AI_HANDOFF.md", "README.md", "SMOKE_TEST.md", "release.ps1", "pack.ps1"
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
  foreach ($dev in @("test", "README.md", "AI_HANDOFF.md", "SMOKE_TEST.md", "release.ps1")) {
    if ($actual | Where-Object { $_ -eq $dev -or $_ -like "$dev/*" }) { throw "开发文件 $dev 混进打包结果了" }
  }

  if (-not $OutDir) { $OutDir = Split-Path $root -Parent }
  if (-not (Test-Path -LiteralPath $OutDir)) { New-Item -ItemType Directory -Path $OutDir -Force | Out-Null }
  $zip = Join-Path $OutDir ("bili-vault-" + $version + ".zip")
  if (Test-Path -LiteralPath $zip) { Remove-Item -LiteralPath $zip -Force }
  Compress-Archive -Path (Join-Path $stage "*") -DestinationPath $zip -CompressionLevel Optimal

  $size = [math]::Round((Get-Item -LiteralPath $zip).Length / 1KB, 1)
  "[OK] $zip"
  "[OK] 版本 $version，文件 $($actual.Count) 个，$size KB"
  "[OK] 已排除（开发用）：$($excludeNames -join ", ")"
} finally {
  Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
}
