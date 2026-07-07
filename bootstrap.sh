#!/usr/bin/env bash
# bootstrap.sh — get qw-webhud running from a fresh clone (Linux / macOS / WSL2).
# Zero runtime dependencies: no `npm install`, just Node >= 18 and the stdlib.
#
#   ./bootstrap.sh          # verify the environment, then start the mock bridge
#   ./bootstrap.sh --check  # verify only, don't start anything
set -euo pipefail
cd "$(dirname "$0")"

MIN_MAJOR=18
say() { printf '  %s\n' "$*"; }

echo "qw-webhud bootstrap"
echo "==================="

# 1. Node >= 18 (the WebSocket server is hand-rolled; no packages to install).
if ! command -v node >/dev/null 2>&1; then
  say "ERROR: Node.js not found. Install Node >= ${MIN_MAJOR} and re-run." >&2
  exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt "$MIN_MAJOR" ]; then
  say "ERROR: Node $(node -v) found, but >= ${MIN_MAJOR} is required." >&2
  exit 1
fi
say "Node $(node -v) OK — zero dependencies, nothing to install."

# 2. Optional environment for the ezQuake capture/overlay helper scripts.
#    These are only needed to drive a real engine; the mock bridge below needs none of them.
echo
echo "Optional env vars (only for the ezQuake capture/overlay scripts):"
say "QW_HUD_LAB   ${QW_HUD_LAB:-<unset — defaults to \$HOME/qw-hud-lab>}"
say "QW_HUD_EXE   ${QW_HUD_EXE:-<unset — defaults to \$QW_HUD_LAB/ezquake-hud.exe>}"
say "QW_DEMO      ${QW_DEMO:-<unset — pass a .mvd/.qwd path to the capture scripts>}"

# 3. Start the mock bridge unless --check.
if [ "${1:-}" = "--check" ]; then
  echo
  say "Environment OK. Start the mock feed with: node src/bridge.js --mock"
  exit 0
fi
echo
echo "Starting the mock bridge on http://localhost:7777 (Ctrl-C to stop):"
say "editor:  http://localhost:7777/editor.html"
say "overlay: http://localhost:7777/overlay.html?bg=check&dbg"
echo
exec node src/bridge.js --mock
