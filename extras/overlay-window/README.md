# overlay-window — HTML HUD on top of ezQuake, in-game, no OBS

A transparent, always-on-top, click-through Electron window that renders the qw-webhud overlay
**directly over a running ezQuake window** — the "live, on top of the game" path from the main
README's roadmap. No OBS, no capture card, no second machine.

## How it works

```
ezQuake (cl_hudexport)  ──UDP 27999──▶  bridge  ──WebSocket :7777──▶  overlay.html
   borderless WINDOWED                  (src/bridge.js)                rendered inside
   native HUD hidden                    (runs in WSL here)             this transparent
   2560×1440 @ (0,0)                                                   Electron window
```

ezQuake runs **borderless-windowed** (not fullscreen — a topmost overlay can't cover exclusive or
desktop-fullscreen). The Electron window fills the same monitor, is `transparent` + `frame:false`,
sits at `alwaysOnTop('screen-saver')`, and is click-through (`setIgnoreMouseEvents`,
`focusable:false`), so it floats over the game without stealing input.

## Prerequisites

- The bridge must be running (`node src/bridge.js` from the repo root — here it lives in WSL on
  `:7777`, UDP `27999`).
- An ezQuake build with `cl_hudexport` (the `ezquake-hud.exe` lab build).
- `npm install` in this folder once (pulls Electron).

## Run

```powershell
# 1) start the overlay (primary display, demoshots spec by default)
npm start
#    overrides:  $env:OVERLAY_URL="http://localhost:7777/overlay.html?spec=hub"; $env:QW_DISPLAY=1; npm start

# 2) launch ezQuake windowed-borderless, native HUD off, playing a 4on4 MVD
./play-quake.ps1                       # defaults: book_vs dm3, seek 60s, port 27999
```

In normal play Quake is the foreground window, so the overlay sits on top automatically.
Panic-close the overlay: **Ctrl+Alt+Q**.

## Engine facts that make this work (ezQuake / SDL2)

- **`-window -width 2560 -height 1440`** on the command line forces `r_fullscreen 0` *before the first
  window is created* (`vid_sdl2.c`). You must boot windowed: the windowed code path has **no
  `SDL_SetWindowFullscreen(...,0)`**, so a fullscreen→windowed switch via cfg + `vid_restart` won't take.
- Borderless + position come from the launch cfg, applied by one `vid_restart`:
  `vid_win_borderless 1`, **`vid_xpos 0` / `vid_ypos 0`** (the names `vid_window_x/y` do **not** exist),
  `vid_win_width/height`, `vid_win_save_pos 0`, `vid_win_save_size 0`.
- `cl_hudexport 1`, `cl_hudexport_port`, `cl_hudexport_hidehud 1` (suppress the native HUD).
- Demo playback needs `demo_setspeed 100` (percentage) — `cl_demospeed 1` alone can still race to match end.

## Files

| file | purpose |
|------|---------|
| `main.js` | the transparent overlay window |
| `play-quake.ps1` | launches ezQuake borderless-windowed with the export cfg + a 4on4 MVD |
| `shoot-desktop.ps1` | captures the primary monitor to a PNG (for verifying the composite) |
