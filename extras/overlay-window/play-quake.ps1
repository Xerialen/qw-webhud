<#
  play-quake.ps1 — launch the cl_hudexport ezQuake for the no-OBS overlay demo:
  BORDERLESS desktop-res fullscreen (so a transparent always-on-top overlay window can sit over it),
  native HUD OFF (cl_hudexport_hidehud 1 — the web HUD replaces it), cl_hudexport ON (feeds the bridge),
  a 4on4 MVD auto-tracked and PLAYING, with the notify buffer on so kills + teamsays reach events.messages.

  Pair with main.js (the transparent overlay window). Bridge must already be running (UDP $Port -> :7777).
#>
param(
  # Paths default from environment variables so nothing machine-specific is baked in.
  # Set QW_HUD_LAB / QW_HUD_EXE / QW_DEMO, or pass -Lab / -Exe / -Demo explicitly.
  [string]$Lab  = $(if ($env:QW_HUD_LAB) { $env:QW_HUD_LAB } else { Join-Path $HOME 'qw-hud-lab' }),
  [string]$Exe  = $env:QW_HUD_EXE,
  [string]$Demo = $env:QW_DEMO,
  [int]$Seek    = 60,
  [int]$Port    = 27999
)
$ErrorActionPreference = "Stop"
if (-not $Exe)  { $Exe  = Join-Path $Lab 'ezquake-hud.exe' }
if (-not $Demo) { throw "No demo set. Pass -Demo <path-to-.mvd> or set `$env:QW_DEMO." }
$qw = Join-Path $Lab "qw"
if ($qw -like "C:\nQuake*") { throw "Refusing to target the personal install C:\nQuake" }
if (-not (Test-Path -LiteralPath $Exe))  { throw "exe not found: $Exe" }
if (-not (Test-Path -LiteralPath $Demo)) { throw "demo not found: $Demo" }

Get-Process ezquake,ezquake-hud -EA SilentlyContinue | Stop-Process -Force -EA SilentlyContinue
Start-Sleep -Milliseconds 400
New-Item -ItemType Directory -Force -Path (Join-Path $qw "demos") | Out-Null
Copy-Item -LiteralPath $Demo -Destination (Join-Path $qw "demos\overlay_src.mvd") -Force

# Borderless desktop-res (vid_fullscreen 1 + vid_usedesktopres 1 = SDL_WINDOW_FULLSCREEN_DESKTOP).
# cl_hudexport_hidehud 1 suppresses the engine's own HUD entirely; the browser overlay supplies it.
# do_go runs once on first spawn (alias f_spawn) to autotrack + seek into the live action.
$launch = @"
cfg_save_onquit 0
vid_fullscreen 0
vid_win_borderless 1
vid_win_save_pos 0
vid_win_save_size 0
vid_win_width 2560
vid_win_height 1440
vid_xpos 0
vid_ypos 0
vid_win_displaynumber 0
vid_restart
ruleset default
sys_inactivesleep 0
vid_minimize_on_focus_loss 0
cl_maxfps 0
vid_vsync 0
cl_hudexport_port $Port
cl_hudexport 1
cl_hudexport_hidehud 1
scr_autoid 0
noskins 1
cl_hightrack 1
cl_restrictions 0
mvd_autotrack 1
demo_autotrack 1
con_fragmessages 1
con_notify 0
_con_notifylines 0
con_notifytime 30
demo_jump_skip_messages 0
cl_demospeed 1
demo_setspeed 100
alias f_demoend "echo F_DEMOEND_LOOP; playdemo demos/overlay_src.mvd"
alias do_go "unalias f_spawn; mvd_autotrack 1; demo_jump $Seek; toggleconsole"
alias f_spawn do_go
playdemo demos/overlay_src.mvd
"@
$launch | Set-Content (Join-Path $qw "overlay_launch.cfg") -Encoding ascii

# -window forces r_fullscreen 0 BEFORE the first window is created (vid_sdl2.c:1703), so the
# engine never boots into fullscreen (which a fullscreen->windowed cfg+vid_restart can't undo,
# because the windowed branch has no SDL_SetWindowFullscreen(...,0) call). -width/-height with
# -window set vid_win_width/height. The cfg then flips on vid_win_borderless + vid_restart.
$p = Start-Process -FilePath $Exe -ArgumentList @('-basedir',$Lab,'-window','-width','2560','-height','1440','-condebug','+exec','overlay_launch.cfg') -PassThru
Write-Output "LAUNCHED ezquake-hud pid=$($p.Id)  (borderless WINDOWED 2560x1440 @0,0, native HUD OFF, cl_hudexport -> 127.0.0.1:$Port)"
Write-Output "Demo: $(Split-Path $Demo -Leaf)  Seek: ${Seek}s"
Write-Output "Kill with: Stop-Process -Id $($p.Id) -Force"

# Bring the game window to the foreground during load so it's visible under the overlay (which is
# always-on-top above it). The overlay window keeps drawing regardless of focus.
if (-not ("Fg" -as [type])) {
Add-Type @"
using System;using System.Runtime.InteropServices;
public class Fg{[DllImport("user32.dll")]public static extern bool SetForegroundWindow(IntPtr h);[DllImport("user32.dll")]public static extern bool ShowWindow(IntPtr h,int n);}
"@ 2>$null
}
for ($i=0; $i -lt 16; $i++) {
  $proc = Get-Process -Id $p.Id -EA SilentlyContinue
  if (-not $proc) { Write-Output "ENGINE EXITED during load (i=$i)"; break }
  if ($proc.MainWindowHandle -ne 0) { [Fg]::ShowWindow($proc.MainWindowHandle,9) | Out-Null; [Fg]::SetForegroundWindow($proc.MainWindowHandle) | Out-Null }
  Start-Sleep -Seconds 1
}
