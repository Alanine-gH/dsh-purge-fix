<#
.SYNOPSIS
  dsh-purge: 为「Windows 上被 Defender 拦截 / 只有 Linux 构建」的工具创建 WSL 转发 shim

.DESCRIPTION
  在 "$env:USERPROFILE\.dsh\redteam\toolkit\<工具>\" 下生成 <工具>.cmd，
  内容是 `wsl.exe -d <distro> -- bash -lc "exec \"$HOME/.dsh/redteam/toolkit/<工具>/<bin>\" \"$@\"" bash %*`。
  这样：
    · 演练台「环境适配」能识别到该工具（TOOL_CATALOG 已支持 .cmd）；
    · 智能体真正执行时，实际跑的是 Kali 里的 Linux 二进制（插件推荐的做法），
      不会因为 Windows Defender 把 HackTool 类 exe 删掉而失效。

.PARAMETER Distro
  WSL 发行版名，默认 kali-linux

.PARAMETER Dest
  工具箱目录，默认 $env:USERPROFILE\.dsh\redteam\toolkit
#>
[CmdletBinding()]
param(
  [string]$Distro = 'kali-linux',
  [string]$Dest = (Join-Path $env:USERPROFILE '.dsh\redteam\toolkit')
)

$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force -Path $Dest | Out-Null

# id / 子目录 / Kali 内相对 $HOME 的二进制路径 / .cmd 文件名
$SHIMS = @(
  @{ id='fscan';    dir='fscan';    bin='.dsh/redteam/toolkit/fscan/fscan';        cmd='fscan.cmd' }
  @{ id='gogo';     dir='gogo';     bin='.dsh/redteam/toolkit/gogo/gogo';          cmd='gogo.cmd' }
  @{ id='chisel';   dir='chisel';   bin='.dsh/redteam/toolkit/chisel/chisel';      cmd='chisel.cmd' }
  @{ id='masscan';  dir='masscan';  bin='.dsh/redteam/toolkit/masscan/masscan';    cmd='masscan.cmd' }
  @{ id='impacket'; dir='impacket'; bin='.local/bin/secretsdump.py';              cmd='impacket-secretsdump.cmd' }
)

function Test-WslFile([string]$rel) {
  $q = 'test -x "$HOME/' + $rel + '"'
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $global:LASTEXITCODE = 0
    $null = & wsl.exe -d $Distro -- bash -lc $q 2>&1
    return ($LASTEXITCODE -eq 0)
  } finally {
    $ErrorActionPreference = $prev
  }
}

Write-Host ""
Write-Host "=== 生成 WSL 转发 shim（$Distro） ===" -ForegroundColor Cyan

# 先解析 WSL 内 $HOME，生成绝对路径 shim：避免 bash -lc + `$@` 在 cmd 下的引号丢失
$prev = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
$wslHome = (& wsl.exe -d $Distro -- bash -lc 'printf %s "$HOME"' 2>$null | Where-Object { $_ -and $_ -notmatch 'wsl:|systemd' } | Select-Object -Last 1)
$ErrorActionPreference = $prev
if (-not $wslHome) { $wslHome = '/home/alanine' }
$wslHome = ([string]$wslHome).Trim().Replace('\', '/')
Write-Host "WSL HOME = $wslHome"

foreach ($s in $SHIMS) {
  $exists = $false
  try { $exists = Test-WslFile $s.bin } catch { $exists = $false }
  $targetDir = Join-Path $Dest $s.dir
  $cmdPath = Join-Path $targetDir $s.cmd
  if (-not $exists) {
    Write-Host ("  [SKIP] " + $s.id + "：Kali 内不存在 " + $s.bin) -ForegroundColor Yellow
    continue
  }
  New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
  $abs = $wslHome + '/' + $s.bin
  $body = "@echo off`r`nREM dsh-purge: runs inside WSL " + $Distro + " (native Windows copy is blocked/absent)`r`n" +
          "wsl.exe -d " + $Distro + " -- " + $abs + " %*`r`n"
  [System.IO.File]::WriteAllText($cmdPath, $body, (New-Object System.Text.ASCIIEncoding))
  Write-Host ("  [OK]   " + $s.cmd + " -> " + $abs) -ForegroundColor Green
}
Write-Host ""
