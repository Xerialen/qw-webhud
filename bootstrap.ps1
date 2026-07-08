<#
  bootstrap.ps1 — get qw-webhud running from a fresh clone (Windows / PowerShell).
  Zero runtime dependencies: no `npm install`, just Node >= 18 and the stdlib.

    ./bootstrap.ps1          # verify the environment, then start the mock bridge
    ./bootstrap.ps1 -Check   # verify only, don't start anything
#>
param([switch]$Check)
$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot
$MinMajor = 18

Write-Host "qw-webhud bootstrap"
Write-Host "==================="

# 1. Node >= 18 (the WebSocket server is hand-rolled; no packages to install).
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { throw "Node.js not found. Install Node >= $MinMajor and re-run." }
$major = [int](node -p 'process.versions.node.split(".")[0]')
if ($major -lt $MinMajor) { throw "Node $(node -v) found, but >= $MinMajor is required." }
Write-Host "  Node $(node -v) OK — zero dependencies, nothing to install."

# 2. Optional environment for the ezQuake capture/overlay helper scripts.
#    Only needed to drive a real engine; the mock bridge below needs none of them.
function Show($name, $val, $hint) {
  if ([string]::IsNullOrEmpty($val)) { Write-Host "  $name  <unset — $hint>" }
  else { Write-Host "  $name  $val" }
}
Write-Host ""
Write-Host "Optional env vars (only for the ezQuake capture/overlay scripts):"
Show "QW_HUD_LAB " $env:QW_HUD_LAB 'defaults to $HOME\qw-hud-lab'
Show "QW_HUD_EXE " $env:QW_HUD_EXE 'defaults to $QW_HUD_LAB\ezquake-hud.exe'
Show "QW_DEMO    " $env:QW_DEMO    'pass a .mvd/.qwd path to the capture scripts'

# 3. Start the mock bridge unless -Check.
if ($Check) {
  Write-Host ""
  Write-Host "  Environment OK. Start the mock feed with: node src/bridge.js --mock"
  return
}
Write-Host ""
Write-Host "Starting the mock bridge on http://localhost:7777 (Ctrl-C to stop):"
Write-Host "  editor:  http://localhost:7777/editor.html"
Write-Host "  overlay: http://localhost:7777/overlay.html?bg=check&dbg"
Write-Host ""
node src/bridge.js --mock
