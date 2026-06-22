<#
  shoot-desktop.ps1 — capture the PRIMARY monitor (game + always-on-top overlay composited)
  to a PNG so we can verify the HTML HUD is actually drawing over ezQuake in-game.
#>
param([string]$Out = "C:\Users\benya\qw-overlay-shot.png")

# Be DPI-aware so CopyFromScreen captures real pixels (not scaled) on a high-DPI desktop.
Add-Type @"
using System;using System.Runtime.InteropServices;
public class Dpi { [DllImport("user32.dll")] public static extern bool SetProcessDPIAware(); }
"@ 2>$null
[Dpi]::SetProcessDPIAware() | Out-Null

Add-Type -AssemblyName System.Windows.Forms, System.Drawing
$s = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bmp = New-Object System.Drawing.Bitmap $s.Width, $s.Height
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($s.X, $s.Y, 0, 0, $bmp.Size)
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
Write-Output "saved $Out ($($s.Width)x$($s.Height))"
