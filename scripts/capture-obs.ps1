#requires -Version 5
<#
  capture-obs.ps1 - launch the cl_hudexport ezQuake with its NATIVE HUD OFF, so the engine renders
  only the 3D view and the qw-webhud browser overlay (an OBS browser source) supplies the entire HUD.

  This is the demoshots / casting capture client: engine 3D (no HUD) + cl_hudexport on -> the web HUD
  composites on top in OBS. It seeks to a fixed time, freezes (stable frame for a still / composite),
  takes ONE engine screenshot to confirm the 3D view is HUD-free, and leaves the engine RUNNING and
  streaming so OBS (or the composite-preview step) can capture the web HUD over it.

  Native HUD is suppressed with scr_newhud 0 + cl_sbar 0; the engine still renders its own crosshair,
  which is why the demoshots web spec omits a crosshair element.
#>
param(
  [Parameter(Mandatory=$true)][string]$Exe,
  # Demo defaults from $env:QW_DEMO; pass -Demo <path-to-.mvd> to override.
  [string]$Demo = $env:QW_DEMO,
  [int]$Seek    = 600,
  [int]$Port    = 27999,
  [int]$Win     = 1920,
  [int]$WinH    = 1080,
  [int]$LoadWait= 16,
  [switch]$Play,        # leave the demo PLAYING (for live OBS) instead of freezing on the seek frame
  [switch]$NativeHud,   # show ezQuake's OWN HUD (Milton's real cfg+assets) instead of suppressing it
  [switch]$Messages,    # replay teamsay + obituaries (killfeed) into the notify ring (skip_messages 0 + preroll)
  [int]$Preroll = 12,   # seconds before Seek to replay forward so notify/kills repopulate (with -Messages)
  [string]$Lab  = $(if ($env:QW_HUD_LAB) { $env:QW_HUD_LAB } else { Join-Path $HOME 'qw-hud-lab' })
)
$ErrorActionPreference = "Stop"
if (-not $Demo) { throw "No demo set. Pass -Demo <path-to-.mvd> or set `$env:QW_DEMO." }
$qw  = Join-Path $Lab "qw"
if ($qw -like "C:\nQuake*") { throw "Refusing to target the personal install C:\nQuake" }
if (-not (Test-Path -LiteralPath $Exe))  { throw "exe not found: $Exe" }
if (-not (Test-Path -LiteralPath $Demo)) { throw "demo not found: $Demo" }

Get-Process ezquake,ezquake-hud -EA SilentlyContinue | Stop-Process -Force -EA SilentlyContinue
Start-Sleep -Milliseconds 400
New-Item -ItemType Directory -Force -Path (Join-Path $qw "demos") | Out-Null
Copy-Item -LiteralPath $Demo -Destination (Join-Path $qw "demos\obs_src.mvd") -Force
$cap = Join-Path $qw "matchinfo\screenshots\obs"
Remove-Item $cap -Recurse -Force -EA SilentlyContinue
New-Item -ItemType Directory -Force -Path $cap | Out-Null

$freeze = if ($Play) { "" } else { "cl_demospeed 0; " }
$hide   = if ($NativeHud) { 0 } else { 1 }
$skipMsg = if ($Messages) { 0 } else { 1 }
$preJump = [math]::Max(0, $Seek - $Preroll)
# -Messages: ezQuake's KILLFEED is r_tracker (it shows frags AND chat via r_tracker_messages). demo_jump
# does NOT feed the tracker/notify -- only live playback does -- so we land Preroll secs early then PLAY
# forward through the fight via a timed wait-loop (fps capped so each wait is a known slice), then freeze.
if ($Messages) {
  # The "right" killfeed is his r_tracker (VULT) display at x410/y190, NOT the classic con_notify obituary
  # text. r_tracker only logs frags during PLAYBACK (not demo_jump), so PLAY through the fight -- but at
  # high demospeed with few frames so it finishes even if the window is fps-throttled. con_notify 0 drops
  # the classic obituary text + the missing-skin spam; r_tracker (his placement/colors) shows kills+chat.
  # WEB-OVERLAY mode: the browser HUD renders the killfeed, so the engine just needs the notify BUFFER
  # populated (con_fragmessages 1 -> obituaries are printed) WITHOUT drawing them on the 3D (con_notify 0
  # -> clean plate). The buffer populates on demo_jump (skip_messages 0), and cl_hudexport ships it as
  # events.messages via Con_GetNotifyLines. con_notifytime keeps the replayed lines fresh for the export.
  $msgCvars = "con_fragmessages 1`ncon_notify 0`ncon_notifytime 30"
  $doGoBody = "unalias f_spawn; cl_demospeed 1; mvd_autotrack 1; toggleconsole; demo_jump $preJump; demo_jump $Seek; wait; wait; wait; ${freeze}hud_recalculate; screenshot obs/clean3d"
} else {
  $msgCvars = ""
  $doGoBody = "unalias f_spawn; cl_demospeed 1; mvd_autotrack 1; toggleconsole; demo_jump $Seek; wait; wait; wait; wait; wait; ${freeze}hud_recalculate; screenshot obs/clean3d"
}
$launch = @"
cfg_save_onquit 0
cl_sbar 0
scr_newhud 0
vid_fullscreen 0
vid_usedesktopres 0
vid_win_width $Win
vid_win_height $WinH
gl_max_size 32768
r_drawflat 0
sys_inactivesleep 0
vid_minimize_on_focus_loss 0
vid_restart
ruleset default
sshot_format jpg
image_jpeg_quality_level 92
scr_sshot_autoname 0
cl_maxfps 0
vid_vsync 0
demo_jump_skip_messages $skipMsg
$msgCvars
cl_hightrack 1
cl_restrictions 0
mvd_autotrack 1
demo_autotrack 1
scr_autoid 0
noskins 1
cl_hudexport_port $Port
cl_hudexport 1
cl_hudexport_hidehud $hide
cl_demospeed 8
alias do_go "$doGoBody"
alias f_spawn do_go
playdemo demos/obs_src.mvd
"@
$launch | Set-Content (Join-Path $qw "ds_obs_launch.cfg") -Encoding ascii
if ($Messages) { ("wait`n" * ($Preroll * 12)) | Set-Content (Join-Path $qw "ds_play.cfg") -Encoding ascii }
# Native HUD is suppressed engine-side by cl_hudexport_hidehud (default 1) -- no cfg disabling needed.
# scr_autoid 0 hides the in-3D overhead player names; the engine still draws its own crosshair.

Add-Type @"
using System;using System.Runtime.InteropServices;
public class MFg{[DllImport("user32.dll")]public static extern bool SetForegroundWindow(IntPtr h);[DllImport("user32.dll")]public static extern bool ShowWindow(IntPtr h,int n);}
"@ 2>$null

$p = Start-Process -FilePath $Exe -ArgumentList @(
  '-basedir', $Lab, '-condebug',
  '+set','vid_fullscreen','0','+set','vid_usedesktopres','0',
  '+set','vid_win_width',"$Win",'+set','vid_win_height',"$WinH",
  '+exec','ds_obs_launch.cfg') -PassThru
Write-Output "LAUNCHED pid=$($p.Id)  exe=$Exe  ($Win x $WinH, native HUD OFF, export ON)"
Start-Sleep -Seconds 5
$proc = Get-Process -Id $p.Id -EA SilentlyContinue
if (-not $proc) { "PROCESS EXITED EARLY - check $qw\qconsole.log"; if (Test-Path (Join-Path $qw 'qconsole.log')) { Get-Content (Join-Path $qw 'qconsole.log') -Tail 25 }; throw "engine died on launch" }
# Keep the window foregrounded for the whole load+capture so ezQuake can't fps-throttle the playback
# (it caps fps hard when unfocused, which stalls the -Messages play-loop).
$waitSecs = $LoadWait + $(if ($Messages) { $Preroll + 6 } else { 0 })
for ($i = 0; $i -lt $waitSecs; $i++) {
  $proc = Get-Process -Id $p.Id -EA SilentlyContinue
  if ($proc -and $proc.MainWindowHandle -ne 0) { [MFg]::ShowWindow($proc.MainWindowHandle,9)|Out-Null; [MFg]::SetForegroundWindow($proc.MainWindowHandle)|Out-Null }
  Start-Sleep -Seconds 1
}
$shot = Get-ChildItem $cap -Filter *.jpg -EA SilentlyContinue | Sort-Object LastWriteTime | Select-Object -Last 1
if ($shot) { Write-Output "CLEAN3D SHOT: $($shot.FullName)  ($([int]($shot.Length/1KB)) KB)" } else { Write-Output "NO SHOT YET (check $qw\qconsole.log)" }
Write-Output "ENGINE RUNNING pid=$($p.Id) - 3D only, streaming cl_hudexport to 127.0.0.1:$Port"
Write-Output "Kill with: Stop-Process -Id $($p.Id) -Force"
