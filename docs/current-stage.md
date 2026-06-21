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
- Engine export written + wired in the fork (`feat/cl-hudexport`): `src/hud_export_fmt.h` (shared
  serializer), `src/cl_hudexport.{c,h}`, `misc/hudexport/` self-test. The serializer compiles clean
  (`-Wall -Wextra`) and the path C serializer -> UDP -> bridge -> WebSocket -> overlay renders at
  ~60fps / ~0ms age in a backgrounded tab (validated 2026-06-21). NOT yet built into a client.
- Overlay renders on each WS frame (not requestAnimationFrame), so it doesn't freeze when the
  window/OBS source is backgrounded; throttled to ~70fps.

## Next smallest useful step
**Build the ezQuake fork** with `cl_hudexport` so the overlay runs off the real game (currently it
runs off the mock + the C self-test). The module is written, wired, and committed on fork branch
`feat/cl-hudexport` (local, not pushed); its serializer + UDP path are validated end-to-end. The one
open item is a toolchain (system-provisioning decision, deliberately not done unprompted):
- **A. WSL2 cross-build** (preferred): apt-install `mingw-w64` + `ninja` in Ubuntu-24.04, bootstrap
  vcpkg, `cmake --preset mingw64-x64-cross` -> a Windows `ezquake.exe`. Keeps MSVC off the gaming box.
- **B. MSVC on Windows**: install VS 2022 "Desktop development with C++" + bootstrap vcpkg (~1.5h, GBs).
Either is an apt/installer change to flag first. Then update the clone to the fork's current master
(local HEAD 2026-01-31 < lab exe 2026-05-17), build, run a demo with `cl_hudexport 1`, and confirm
the overlay tracks the game. The engine change also needs independent cross-model review before merge.

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
