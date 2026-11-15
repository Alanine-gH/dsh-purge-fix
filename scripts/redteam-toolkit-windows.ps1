<#
.SYNOPSIS
  dsh-purge 红队工具箱 —— Windows 版补齐脚本（与 redteam-setup.sh 对应）

.DESCRIPTION
  把 TOOL_CATALOG 里 Windows 有官方构建的工具下载到
  "$env:USERPROFILE\.dsh\redteam\toolkit\<工具名>\"，
  供「演练台 → 环境适配」自动识别（resolveTool 会扫 toolkit 子目录）。

  设计：
    · 幂等：已存在且非空就跳过；损坏文件删掉重下（-Force 强制重下）
    · 不猜版本：URL 固定为发布时的最新稳定版；失败时回落直连 GitHub
    · 国内加速：优先 gh-proxy.com 前缀，失败再直连
    · 每个文件校验大小 > 0；zip/gz 解压后按目标名归位
    · 最后写 toolkit\清单.md，并打印体检表

.PARAMETER Dest
  工具箱目录，默认 $env:USERPROFILE\.dsh\redteam\toolkit

.PARAMETER Force
  已存在的文件也重新下载

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\redteam-toolkit-windows.ps1
#>
[CmdletBinding()]
param(
  [string]$Dest = (Join-Path $env:USERPROFILE '.dsh\redteam\toolkit'),
  [switch]$Force,
  [string[]]$Only = @()
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

# id / 子目录 / 下载地址 / 类型 / 需要的最终文件名（逗号分隔）
$TOOLS = @(
  @{ id='nmap';        dir='nmap';        url='https://nmap.org/dist/nmap-7.92-win32.zip'; kind='zip'; want='nmap.exe' }
  @{ id='nuclei';      dir='nuclei';      url='https://github.com/projectdiscovery/nuclei/releases/download/v3.11.1/nuclei_3.11.1_windows_amd64.zip'; kind='zip'; want='nuclei.exe' }
  @{ id='ffuf';        dir='ffuf';        url='https://github.com/ffuf/ffuf/releases/download/v2.3.0/ffuf_2.3.0_windows_amd64.zip'; kind='zip'; want='ffuf.exe' }
  @{ id='fscan';       dir='fscan';       url='https://github.com/shadow1ng/fscan/releases/download/v2.2.2/fscan_2.2.2_windows_x64.exe'; kind='file'; want='fscan.exe' }
  @{ id='gogo';        dir='gogo';        url='https://github.com/chainreactors/gogo/releases/download/v2.15.0/gogo_windows_amd64.exe'; kind='file'; want='gogo.exe' }
  @{ id='suo5';        dir='suo5';        url='https://github.com/zema1/suo5/releases/download/v2.2.0/suo5-windows-amd64.exe'; kind='file'; want='suo5-windows-amd64.exe' }
  @{ id='frp';         dir='frp';         url='https://github.com/fatedier/frp/releases/download/v0.72.0/frp_0.72.0_windows_amd64.zip'; kind='zip'; want='frpc.exe,frps.exe' }
  @{ id='chisel';      dir='chisel';      url='https://github.com/jpillora/chisel/releases/download/v1.12.0/chisel_1.12.0_windows_amd64.zip'; kind='zip'; want='chisel.exe' }
  @{ id='subfinder';   dir='subfinder';   url='https://github.com/projectdiscovery/subfinder/releases/download/v2.17.0/subfinder_2.17.0_windows_amd64.zip'; kind='zip'; want='subfinder.exe' }
  @{ id='dnsx';        dir='dnsx';        url='https://github.com/projectdiscovery/dnsx/releases/download/v1.3.1/dnsx_1.3.1_windows_amd64.zip'; kind='zip'; want='dnsx.exe' }
  @{ id='httpx';       dir='httpx';       url='https://github.com/projectdiscovery/httpx/releases/download/v1.12.0/httpx_1.12.0_windows_amd64.zip'; kind='zip'; want='httpx.exe' }
  @{ id='naabu';       dir='naabu';       url='https://github.com/projectdiscovery/naabu/releases/download/v2.7.0/naabu_2.7.0_windows_amd64.zip'; kind='zip'; want='naabu.exe' }
  @{ id='ksubdomain';  dir='ksubdomain';  url='https://github.com/knownsec/ksubdomain/releases/download/v0.5.1/ksubdomain.exe.zip'; kind='zip'; want='ksubdomain.exe' }
  @{ id='ligolo';      dir='ligolo';      url='https://github.com/nicocha30/ligolo-ng/releases/download/v0.9.2/ligolo-ng_agent_0.9.2_windows_amd64.zip'; kind='zip'; want='agent.exe'; extra=@(
      @{ url='https://github.com/nicocha30/ligolo-ng/releases/download/v0.9.2/ligolo-ng_proxy_0.9.2_windows_amd64.zip'; want='proxy.exe' }
    ) }
  @{ id='gowitness';   dir='gowitness';   url='https://github.com/sensepost/gowitness/releases/download/3.2.2/gowitness-3.2.2-windows-amd64.exe'; kind='file'; want='gowitness.exe' }
)

function Write-Step([string]$Text) { Write-Host "  $Text" }
function Write-Ok([string]$Text)   { Write-Host "  [OK]   $Text" -ForegroundColor Green }
function Write-Warn2([string]$Text){ Write-Host "  [WARN] $Text" -ForegroundColor Yellow }
function Write-Bad([string]$Text)  { Write-Host "  [FAIL] $Text" -ForegroundColor Red }

function Get-Remote([string]$Url, [string]$OutFile) {
  $candidates = @("https://gh-proxy.com/$Url", $Url)
  foreach ($u in $candidates) {
    try {
      if (Test-Path $OutFile) { Remove-Item $OutFile -Force }
      $sw = [Diagnostics.Stopwatch]::StartNew()
      & curl.exe -sL --retry 2 --retry-delay 2 --fail --max-time 900 -o $OutFile $u
      $code = $LASTEXITCODE
      $sw.Stop()
      if ($code -eq 0 -and (Test-Path $OutFile) -and (Get-Item $OutFile).Length -gt 0) {
        $kb = [math]::Round((Get-Item $OutFile).Length / 1KB, 0)
        Write-Ok ("下载 " + $kb + " KB  " + [math]::Round($sw.Elapsed.TotalSeconds,1) + "s")
        return $true
      }
      Write-Warn2 ("该源失败(code=$code)，换下一个")
    } catch {
      Write-Warn2 ("异常：" + $_.Exception.Message)
    }
  }
  return $false
}

function Expand-Any([string]$Archive, [string]$Kind, [string]$Dir) {
  if ($Kind -eq 'zip') {
    Expand-Archive -LiteralPath $Archive -DestinationPath $Dir -Force
    return $true
  }
  if ($Kind -eq 'gz') {
    $in = [System.IO.File]::OpenRead($Archive)
    try {
      $gz = New-Object System.IO.Compression.GZipStream($in, [System.IO.Compression.CompressionMode]::Decompress)
      $outName = [System.IO.Path]::GetFileNameWithoutExtension($Archive)
      $outPath = Join-Path $Dir $outName
      $out = [System.IO.File]::Create($outPath)
      try { $gz.CopyTo($out) } finally { $out.Dispose(); $gz.Dispose() }
    } finally { $in.Dispose() }
    return $true
  }
  return $false
}

function Move-Flatten([string]$Dir, [string]$Name, [string]$TargetDir) {
  $hit = Get-ChildItem -LiteralPath $Dir -Recurse -File -Filter $Name -ErrorAction SilentlyContinue |
         Sort-Object { $_.FullName.Length } | Select-Object -First 1
  if (-not $hit) { return $false }
  $target = Join-Path $TargetDir $Name
  # 工具自带的 DLL/配置与 exe 同级：整目录复制后再归位 exe，避免只拿 exe 跑不起来
  $srcDir = $hit.Directory.FullName
  foreach ($f in Get-ChildItem -LiteralPath $srcDir -File) {
    Copy-Item $f.FullName (Join-Path $TargetDir $f.Name) -Force
  }
  if (([IO.Path]::GetFullPath($hit.FullName)) -ne ([IO.Path]::GetFullPath($target))) {
    Copy-Item $hit.FullName $target -Force
  }
  return $true
}

Write-Host ""
Write-Host "=== dsh-purge 红队工具箱（Windows） ===" -ForegroundColor Cyan
Write-Host "目标目录：$Dest"
New-Item -ItemType Directory -Force -Path $Dest | Out-Null

$tmpRoot = Join-Path $env:TEMP ('dsh-purge-toolkit-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $tmpRoot | Out-Null

$results = @()
try {
  foreach ($t in $TOOLS) {
    if ($Only.Count -gt 0 -and $Only -notcontains $t.id) { continue }
    Write-Host ""
    Write-Host ("-- " + $t.id + " --") -ForegroundColor Cyan
    $dir = Join-Path $Dest $t.dir
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    $wants = $t.want -split ','
    $allThere = $true
    foreach ($w in $wants) {
      $p = Join-Path $dir $w
      if (-not (Test-Path $p) -or (Get-Item $p).Length -le 0) { $allThere = $false }
    }
    if ($allThere -and -not $Force) {
      Write-Ok ($t.id + " 已存在，跳过")
      $results += [pscustomobject]@{ id=$t.id; status='skip'; dir=$dir }
      continue
    }
    $dl = Join-Path $tmpRoot ($t.id + [IO.Path]::GetExtension(($t.url -split '\?')[0]))
    Write-Step ("下载 " + $t.url)
    if (-not (Get-Remote $t.url $dl)) {
      Write-Bad ($t.id + " 下载失败")
      $results += [pscustomobject]@{ id=$t.id; status='fail'; dir=$dir }
      continue
    }
    $work = Join-Path $tmpRoot ($t.id + '-x')
    New-Item -ItemType Directory -Force -Path $work | Out-Null
    if ($t.kind -eq 'file') {
      Copy-Item $dl (Join-Path $dir $wants[0]) -Force
    } else {
      if (-not (Expand-Any $dl $t.kind $work)) {
        Write-Bad ($t.id + " 解压失败"); $results += [pscustomobject]@{ id=$t.id; status='fail'; dir=$dir }; continue
      }
      $ok = $true
      foreach ($w in $wants) { if (-not (Move-Flatten $work $w $dir)) { $ok = $false; Write-Warn2 ("包内未找到 " + $w) } }
      if (-not $ok) { $results += [pscustomobject]@{ id=$t.id; status='partial'; dir=$dir }; continue }
    }
    foreach ($w in $wants) {
      $p = Join-Path $dir $w
      if (Test-Path $p) { Write-Ok ("就位 " + $w + "  " + [math]::Round((Get-Item $p).Length/1KB,0) + " KB") }
    }
    # 附属下载（ligolo proxy）
    if ($t.extra) {
      foreach ($e in $t.extra) {
        $ed = Join-Path $tmpRoot ($t.id + '-extra')
        New-Item -ItemType Directory -Force -Path $ed | Out-Null
        $edFile = Join-Path $ed 'dl.zip'
        if (Get-Remote $e.url $edFile) {
          $ex = Join-Path $tmpRoot ($t.id + '-extra-x'); New-Item -ItemType Directory -Force -Path $ex | Out-Null
          Expand-Archive -LiteralPath $edFile -DestinationPath $ex -Force
          if (-not (Move-Flatten $ex $e.want $dir)) { Write-Warn2 ("未找到 " + $e.want) }
        }
      }
    }
    # Defender 实时保护会把 HackTool 类二进制直接删掉：装完必须复查，不能只信下载成功。
    $missingAfter = @()
    foreach ($w in $wants) { if (-not (Test-Path (Join-Path $dir $w))) { $missingAfter += $w } }
    if ($missingAfter.Count) {
      Write-Warn2 ("以下文件装完即被删除（多为 Windows Defender 拦截）: " + ($missingAfter -join ', '))
      $results += [pscustomobject]@{ id=$t.id; status='blocked'; dir=$dir }
    } else {
      $results += [pscustomobject]@{ id=$t.id; status='ok'; dir=$dir }
    }
  }
} finally {
  Remove-Item $tmpRoot -Recurse -Force -ErrorAction SilentlyContinue
}

# 清单
$lines = @('# 红队工具箱清单（Windows）', '', ('生成时间：' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')), ('目录：' + $Dest), '')
foreach ($t in $TOOLS) {
  $dir = Join-Path $Dest $t.dir
  $files = @(Get-ChildItem $dir -File -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name)
  $lines += ('- **' + $t.id + '** → `' + $dir + '`  ' + ($(if ($files.Count) { ($files -join ', ') } else { '（缺）' })))
}
$lines += ''
$lines += '> masscan：上游没有官方 Windows 构建，需在 Kali/WSL 里 `apt install masscan`。'
$lines += '> impacket：用 `pip install impacket` 安装（入口 impacket-secretsdump 等）。'
$lines | Set-Content -Encoding UTF8 (Join-Path $Dest '清单.md')

Write-Host ""
Write-Host "=== 结果 ===" -ForegroundColor Cyan
$results | ForEach-Object { "  {0,-12} {1}" -f $_.id, $_.status }
Write-Host ""
Write-Host ("清单： " + (Join-Path $Dest '清单.md'))
Write-Host ""
