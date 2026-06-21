# Current Stage

last-verified: 2026-06-21
status: active
maturity: stage-1-prototype

## Current goal
Build a live, editable web HUD that **replaces** ezQuake's in-game HUD: it fetches the real in-game
figures in real time (extremely low latency) and is editable outside the game in a browser that mocks
up the quake screen.

## Why this matters
Yesterday's qw-cfg work established that hub.quakeworld.nu's HUD is an FTE canvas + a web-rendered
overlay. The owner wants that model generalised for ezQuake: live, low-latency, and fully editable —
a HUD you design in a browser and run over the real game.

## Last known state (2026-06-21)
Web app works end-to-end against a synthetic mock feed (validated in-browser, DOM-verified):
- `src/bridge.js` (zero-dep): UDP `127.0.0.1:27999` -> WebSocket `:7777` relay + static server + a
  spec-save API (`/api/specs`). WS smoke test: 60 frames, 0 gaps, ~42 fps, age 11 ms.
- `overlay.html`: transparent live overlay; 13 elements render correctly from the feed.
- `editor.html`: drag/select/properties/save-load/background/live-preview; save round-trip works
  (`PUT 200 -> GET 200`).
- Wire contract in `PROTOCOL.md`; element catalog in `src/public/js/elements.js`.

## Next smallest useful step
Land the ezQuake engine export (`cl_hudexport`): a per-frame UDP JSON push of the tracked player's
`cl.stats` + teaminfo + clock, on a branch of `Xerialen/ezquake-source`. Code is source-cited and
ready (see `docs/findings-log.md`). **Build is the open item** — no MSVC/CMake on the Windows host;
WSL2 has gcc 13 + cmake 3.28, so cross-compile to a Windows `.exe` via the `mingw64-x64-cross` preset
(needs confirming the mingw toolchain / a light apt install in WSL2 — a dev-env provisioning choice).

## Active constraints
- Engine export must work in demo/MVD playback, not just live (use a dedicated UDP socket, NOT
  `NET_SendPacket` — `cls.socketip` is dead during playback).
- Don't put the MSVC toolchain on the gaming Windows host without the owner's go-ahead; prefer WSL2.
- Keep the web app zero-dependency.

## Stop conditions
Stop and ask before any system-level provisioning (installing a multi-GB toolchain on Windows; even
apt installs in WSL2 are a dev-env change worth a heads-up).

## Required docs to update
`docs/findings-log.md` (engine integration points + build findings), `docs/decision-log.md`
(architecture choices), this file.
