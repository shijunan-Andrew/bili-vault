# tools/download.ps1 — download a list of urls through the local proxy, one file at a time.
# Input : a JSON array  [{ "url": "<original url>", "dest": "<path relative to assets/>" }, ...]
# Output: a JSON array  [{ url, dest, ok, bytes, status, source, route }]
# Usage : pwsh -File tools/download.ps1 -List _ref/img-jobs.json -Out _ref/img-results.json
param(
  [Parameter(Mandatory = $true)][string]$List,
  [Parameter(Mandatory = $true)][string]$Out,
  [int]$Concurrency = 8,
  [string]$Proxy = 'http://127.0.0.1:7897',
  [string]$Ts = '20150701082208'
)
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
$assets = Join-Path $root 'assets'
$jobs = Get-Content -Raw -LiteralPath $List | ConvertFrom-Json
$results = [System.Collections.Concurrent.ConcurrentBag[object]]::new()
$queue = [System.Collections.Concurrent.ConcurrentQueue[object]]::new()
foreach ($j in $jobs) { $queue.Enqueue($j) }
$UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'
$total = $jobs.Count
$done = [ref]0

function Get-Bytes([string]$url, [string]$referer) {
  try {
    $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 40 -Proxy $Proxy -UserAgent $UA `
      -Headers @{ Referer = $referer } -MaximumRedirection 5
    if ($r.StatusCode -ne 200) { return $null }
    $bytes = $r.Content
    if ($bytes -is [string]) { return $null }
    return , $bytes
  } catch { return $null }
}

function Test-Image([byte[]]$b, [string]$url) {
  if ($null -eq $b -or $b.Length -lt 24) { return $false }
  if ($b[0] -eq 0x89 -and $b[1] -eq 0x50) { return $true }
  if ($b[0] -eq 0xFF -and $b[1] -eq 0xD8) { return $true }
  if ($b[0] -eq 0x47 -and $b[1] -eq 0x49) { return $true }
  if ($b[0] -eq 0x42 -and $b[1] -eq 0x4D) { return $true }
  if ($url -match '\.ico$') { return $true }
  return $false
}

$worker = {
  param($queue, $results, $assets, $Proxy, $Ts, $UA, $root, $done, $total)
  $item = $null
  while ($queue.TryDequeue([ref]$item)) {
    $u = $item.url
    $dest = Join-Path $assets $item.dest
    $entry = [ordered]@{ url = $u; dest = $item.dest; ok = $false; bytes = 0; source = ''; status = 'missing' }
    if (Test-Path -LiteralPath $dest) {
      $len = (Get-Item -LiteralPath $dest).Length
      if ($len -gt 100) { $entry.ok = $true; $entry.bytes = $len; $entry.source = 'cached'; $entry.status = 'ok'; $results.Add([pscustomobject]$entry); continue }
    }
    $routes = @(
      @{ n = 'wayback-ts'; u = "http://web.archive.org/web/$($Ts)im_/$u" },
      @{ n = 'wayback-any'; u = "http://web.archive.org/web/2015im_/$u" },
      @{ n = 'live'; u = $u }
    )
    foreach ($r in $routes) {
      $b = Get-Bytes $r.u 'http://www.bilibili.com/'
      if ((Test-Image $b $u)) {
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dest) | Out-Null
        [System.IO.File]::WriteAllBytes($dest, $b)
        $entry.ok = $true; $entry.bytes = $b.Length; $entry.source = $r.n; $entry.status = 'ok'
        break
      }
    }
    $results.Add([pscustomobject]$entry)
    $n = [System.Threading.Interlocked]::Increment($done)
    if ($n % 10 -eq 0) { Write-Host "  progress $n / $total" }
  }
}

$pool = [runspacefactory]::CreateRunspacePool(1, $Concurrency)
$pool.Open()
$handles = @()
for ($i = 0; $i -lt $Concurrency; $i++) {
  $ps = [powershell]::Create()
  $ps.RunspacePool = $pool
  [void]$ps.AddScript($worker).AddArgument($queue).AddArgument($results).AddArgument($assets).AddArgument($Proxy).AddArgument($Ts).AddArgument($UA).AddArgument($root).AddArgument($done).AddArgument($total)
  $handles += [pscustomobject]@{ ps = $ps; h = $ps.BeginInvoke() }
}
foreach ($h in $handles) { [void]$h.ps.EndInvoke($h.h); $h.ps.Dispose() }
$pool.Close(); $pool.Dispose()

$arr = @($results.ToArray())
$arr | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $Out -Encoding UTF8
$ok = @($arr | Where-Object { $_.ok })
Write-Host "DONE ok=$($ok.Count) missing=$($arr.Count - $ok.Count) bytes=$(($ok | Measure-Object -Property bytes -Sum).Sum)"
