<#
  shoot-desktop.ps1 — capture the PRIMARY monitor (game + always-on-top overlay composited)
  to a PNG so we can verify the HTML HUD is actually drawing over ezQuake in-game.
#>
param([string]$Out = $(if ($env:QW_OVERLAY_SHOT) { $env:QW_OVERLAY_SHOT } else { Join-Path $HOME 'qw-overlay-shot.png' }))

# Capture real pixels on a high-DPI / multi-monitor desktop. Prefer per-monitor-aware V2 (correct when
# monitors run at different scaling, as on a mixed 27"+49" rig); fall back to the legacy system-DPI call.
# NOTE: a GDI grab of a TRANSPARENT, always-on-top overlay can still be unreliable (layered-window
# compositing; or a game changing the display mode mid-session — which once yielded a 1920x1440 grab here).
# For authoritative HUD-LAYOUT checks use ../../scripts/shoot.mjs at the target resolution (a deterministic
# headless render); this desktop grab is for confirming the overlay composites ON TOP of the game.
Add-Type @"
using System;using System.Runtime.InteropServices;
public class Dpi {
  [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr ctx);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
}
"@ 2>$null
# DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2 = (HANDLE)-4; legacy SetProcessDPIAware is the fallback.
try { if (-not [Dpi]::SetProcessDpiAwarenessContext([IntPtr]::new(-4))) { [void][Dpi]::SetProcessDPIAware() } }
catch { try { [void][Dpi]::SetProcessDPIAware() } catch {} }

Add-Type -AssemblyName System.Windows.Forms, System.Drawing
$s = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bmp = New-Object System.Drawing.Bitmap $s.Width, $s.Height
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($s.X, $s.Y, 0, 0, $bmp.Size)
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$w = $bmp.Width; $h = $bmp.Height
$g.Dispose(); $bmp.Dispose()
Write-Output "saved $Out (${w}x${h})"
if ($w -ne 2560 -or $h -ne 1440) { Write-Output "WARN: expected 2560x1440 — desktop res may have changed (e.g. the game grabbed a mode); layout check via shoot.mjs is authoritative." }
