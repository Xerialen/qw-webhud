#requires -Version 5
<#
  prove-hudexport.ps1 - proof that the built ezQuake (with cl_hudexport) streams the REAL
  tracked-player HUD state during MVD playback.

  It launches the freshly-built exe in the dedicated LAB CLIENT, plays an MVD, auto-tracks an
  alive POV, seeks to a fixed time, FREEZES the demo (cl_demospeed 0) so the frame is static,
  shows ezQuake's own newhud, and takes a screenshot of that native HUD. The engine is left
  RUNNING and streaming cl_hudexport datagrams to 127.0.0.1:<Port>, so the qw-webhud overlay can
  be read and compared digit-for-digit against the engine's own HUD at the same frozen frame.

  Why freeze: a static frame lets the native-HUD screenshot (ground truth) and the live web
  overlay be compared with no timing skew - both read the same cl.stats[] snapshot.
#>
param(
  [Parameter(Mandatory=$true)][string]$Exe,
  [string]$Demo = "C:\Users\benya\demoshots-demos\4on4_]sr[_vs_book[dm3]20260109-1932.mvd",
  [int]$Seek    = 600,
  [int]$Port    = 27999,
  [int]$Win     = 1280,
  [int]$WinH    = 720,
  [int]$LoadWait= 16,
  [string]$Lab  = "C:\Users\benya\projects\quakeworld\data\quake-development\clients\ezquake-hud-lab"
)
$ErrorActionPreference = "Stop"
$qw  = Join-Path $Lab "qw"
if ($qw -like "C:\nQuake*") { throw "Refusing to target the personal install C:\nQuake" }
if (-not (Test-Path -LiteralPath $Exe))  { throw "exe not found: $Exe" }
if (-not (Test-Path -LiteralPath $Demo)) { throw "demo not found: $Demo" }

Get-Process ezquake,ezquake-hud -EA SilentlyContinue | Stop-Process -Force -EA SilentlyContinue
Start-Sleep -Milliseconds 400

New-Item -ItemType Directory -Force -Path (Join-Path $qw "demos") | Out-Null
Copy-Item -LiteralPath $Demo -Destination (Join-Path $qw "demos\proof_src.mvd") -Force
$cap = Join-Path $qw "matchinfo\screenshots\proof"
Remove-Item $cap -Recurse -Force -EA SilentlyContinue
New-Item -ItemType Directory -Force -Path $cap | Out-Null

$launch = @"
cfg_save_onquit 0
cl_sbar 0
scr_newhud 1
vid_fullscreen 0
vid_usedesktopres 0
vid_win_width $Win
vid_win_height $WinH
gl_max_size 32768
r_drawflat 0
vid_restart
ruleset default
sshot_format jpg
image_jpeg_quality_level 92
scr_sshot_autoname 0
cl_maxfps 0
vid_vsync 0
demo_jump_skip_messages 1
cl_hightrack 1
cl_restrictions 0
mvd_autotrack 1
demo_autotrack 1
cl_hudexport_port $Port
cl_hudexport 1
cl_demospeed 8
alias do_freeze "unalias f_spawn; cl_demospeed 1; mvd_autotrack 1; demo_jump $Seek; wait; wait; wait; wait; wait; cl_demospeed 0; hud_recalculate; screenshot proof/frozen"
alias f_spawn do_freeze
playdemo demos/proof_src.mvd
"@
$launch | Set-Content (Join-Path $qw "ds_proof_launch.cfg") -Encoding ascii

Add-Type @"
using System;using System.Runtime.InteropServices;
public class MFg{[DllImport("user32.dll")]public static extern bool SetForegroundWindow(IntPtr h);[DllImport("user32.dll")]public static extern bool ShowWindow(IntPtr h,int n);}
"@ 2>$null

$p = Start-Process -FilePath $Exe -ArgumentList @(
  '-basedir', $Lab, '-condebug',
  '+set','vid_fullscreen','0','+set','vid_usedesktopres','0',
  '+set','vid_win_width',"$Win",'+set','vid_win_height',"$WinH",
  '+exec','ds_proof_launch.cfg') -PassThru
Write-Output "LAUNCHED pid=$($p.Id)  exe=$Exe"
Start-Sleep -Seconds 5
$proc = Get-Process -Id $p.Id -EA SilentlyContinue
if (-not $proc) { "PROCESS EXITED EARLY - check $qw\qconsole.log"; if (Test-Path (Join-Path $qw 'qconsole.log')) { Get-Content (Join-Path $qw 'qconsole.log') -Tail 30 }; throw "engine died on launch" }
if ($proc.MainWindowHandle -ne 0) { [MFg]::ShowWindow($proc.MainWindowHandle,9)|Out-Null; [MFg]::SetForegroundWindow($proc.MainWindowHandle)|Out-Null }

Start-Sleep -Seconds $LoadWait
$shot = Get-ChildItem $cap -Filter *.jpg -EA SilentlyContinue | Sort-Object LastWriteTime | Select-Object -Last 1
if ($shot) { Write-Output "SHOT: $($shot.FullName)  ($([int]($shot.Length/1KB)) KB)" }
else       { Write-Output "NO SHOT YET (engine still running; check $qw\qconsole.log)" }
Write-Output "ENGINE STILL RUNNING pid=$($p.Id) - streaming cl_hudexport to 127.0.0.1:$Port"
Write-Output "Kill with: Stop-Process -Id $($p.Id) -Force"
