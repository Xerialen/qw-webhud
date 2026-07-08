# qw-webhud

A **live, editable web HUD overlay for ezQuake / QuakeWorld**. It replaces the in-game HUD with one
rendered in a browser, fed the real in-game figures (health / armour / ammo / weapons / powerups /
score / teaminfo / clock) in real time, and editable outside the game in a browser that mocks up the
quake screen.

This is the general, live evolution of the hub.quakeworld.nu HUD model (an FTE canvas with a
web-rendered HUD overlay): same idea, but for ezQuake, live, low-latency, and fully editable.

> ## ⚠️ Streaming/casting tool — not approved for competitive play
>
> Using qw-webhud **while you play has not been approved by any QuakeWorld league, admin, or
> ruleset.** It is intended for **streaming and casting**. The "Play privately" path below puts the
> HUD on top of your own live game — that is **unsanctioned**: do **not** use it in matches, pickups,
> or league games. If you run it while playing, that is entirely at your own risk. When in doubt,
> keep it on the stream, not on your game.

## How it works

```
  ezQuake (fork, cl_hudexport)        one JSON state snapshot per rendered frame
        |  UDP 127.0.0.1:27999
        v
  src/bridge.js     forwards each datagram verbatim over WebSocket, serves the web app
        |  ws://localhost:7777/ws
        v
  browser
    |- overlay.html   transparent -> render the HUD over the game (OBS source / topmost window)
    +- editor.html    render the HUD over a quake-screen mockup -> drag/style -> save HUD-spec
```

- **Snapshot, not events.** The source ships the whole HUD state every frame; the browser is
  stateless and just draws the latest snapshot — simplest path and lowest latency.
- **HUD-spec JSON** describes the layout: per element a `type`, a data binding, a position in **%**
  (resolution-independent), an anchor, scale, colour. Edited in the browser, consumed by the overlay.
- **Zero runtime dependencies.** Node stdlib only (the WebSocket server is hand-rolled).

See [`PROTOCOL.md`](PROTOCOL.md) for the wire format and [`docs/current-stage.md`](docs/current-stage.md)
for status.

## Getting started

You need **Node.js >= 18** — that's it. There are **no runtime dependencies**, so there is no
`npm install` step for the core app. Pick the path that matches what you want to do.

### Path 1 — try it / edit the HUD (no game needed)

Everything runs off a synthetic **mock feed**, so you can design and preview the HUD without Quake at
all.

```bash
# clone, then bootstrap (verifies Node and starts the mock bridge)
./bootstrap.sh          # Linux / macOS / WSL2
./bootstrap.ps1         # Windows PowerShell
#   add --check / -Check to verify the environment without starting anything
```

Or run it directly:

```bash
node src/bridge.js --mock
#   editor:  http://localhost:7777/editor.html
#   overlay: http://localhost:7777/overlay.html?bg=check&dbg
#            (bg=check = checkerboard so you can see the transparent overlay; dbg = fps/latency)
```

### Path 2 — stream / cast with the live HUD ✅ intended use

This drives the overlay from a **real game**, composited into your broadcast. It needs an ezQuake
client that can export its HUD state — the `cl_hudexport` build (see
[The ezQuake side](#the-ezquake-side--cl_hudexport) below).

1. Start the bridge: `node src/bridge.js`
2. Launch the `cl_hudexport` ezQuake build, turn its native HUD off, and set `cl_hudexport 1`
   in-game (port via `cl_hudexport_port`, default `27999`).
3. Put the overlay into your broadcast, either:
   - **OBS** — add a **Browser source** → `http://localhost:7777/overlay.html`, sized to your canvas.
     The page background is transparent, so only the HUD composites over your game capture; **or**
   - **capture the overlay window** — run `extras/overlay-window/` (a transparent, always-on-top
     window that draws the HUD over the game) and capture *that*.

Casters: `cl_hudexport` also works in **demo / MVD playback**, so you can drive the overlay straight
from a recording — no live game required.

### Path 3 — play privately with the HUD on your screen ⚠️ unapproved

> **Read the warning at the top again.** This renders the web HUD **on top of your own live game**.
> It has **not been approved by anyone** and must not be used in matches, pickups, or league play.
> For private testing only, at your own risk.

1. Start the bridge: `node src/bridge.js`
2. Run the `cl_hudexport` ezQuake build **borderless-windowed** (not exclusive fullscreen), native
   HUD off, `cl_hudexport 1`.
3. Launch the overlay window — a transparent, always-on-top, click-through Electron window that floats
   the HUD over the game with no OBS and no capture card:

   ```bash
   cd extras/overlay-window
   npm start
   ```

   See [`extras/overlay-window/README.md`](extras/overlay-window/README.md) for the window/monitor
   details.

### Helper-script configuration

The bridge and web app need no configuration. The optional helper scripts under `scripts/` and
`extras/overlay-window/` that drive a *real* ezQuake for demoshots/casting read these environment
variables so no machine-specific paths are hard-coded — set them, or pass the matching parameter:

| Variable | Used by | Meaning |
| --- | --- | --- |
| `QW_HUD_LAB` | capture-obs, prove-hudexport, play-quake | ezQuake "lab" client dir (holds `qw/` and the exe). Defaults to `$HOME/qw-hud-lab`. |
| `QW_HUD_EXE` | play-quake | The `cl_hudexport` ezQuake binary. Defaults to `$QW_HUD_LAB/ezquake-hud.exe`. |
| `QW_DEMO` | capture-obs, prove-hudexport, play-quake | Path to the `.mvd`/`.qwd` demo to play. |
| `QW_OVERLAY_SHOT` | shoot-desktop | Output PNG for the desktop grab. Defaults to `$HOME/qw-overlay-shot.png`. |

`extras/deploy/qw-webhud.service` is a systemd **template** — edit `User=` and `WorkingDirectory=`
before installing.

## The ezQuake side — `cl_hudexport`

The two live paths above (streaming and private play) need an ezQuake client that can *export* its
HUD state. That is a small, cvar-gated engine addition called **`cl_hudexport`**:

- **What it does.** Every rendered frame, the client serialises the whole HUD state (health / armour
  / ammo / weapons / powerups / score / teaminfo / clock) into one compact JSON snapshot and sends it
  over a **dedicated local UDP socket** (`127.0.0.1`, port `cl_hudexport_port`, default **27999**).
  `src/bridge.js` forwards those datagrams to the browser unchanged. See [`PROTOCOL.md`](PROTOCOL.md)
  for the exact wire format the browser consumes.
- **How to turn it on.** It is **off by default** (`cl_hudexport 0`). Set `cl_hudexport 1` to start
  exporting; change the port with `cl_hudexport_port`. It also runs during **demo / MVD playback**,
  not just live games.
- **How it's built.** It is a self-contained module (`cl_hudexport.c` plus a shared serializer
  header) added to an ezQuake fork, registered in the client build and called once per frame.

> **This repository does not ship the modified ezQuake.** The `cl_hudexport` fork and any prebuilt
> binary are **not published here**. And — once more — running a HUD export **while you play** is
> **not approved by anyone** and is unsanctioned in competitive QuakeWorld; treat `cl_hudexport`
> strictly as a streaming/casting facility. Without a `cl_hudexport`-capable client you can still run
> everything in **Path 1** against the built-in mock feed (`--mock`).

## Themes

A spec may set `meta.theme` to restyle the HUD. A theme is `body.<cls>` CSS + an optional webfont +
(for richer themes) its own element catalog, applied by `js/theme.js` for both the overlay and the
editor. Built-in themes:

- **minecraft** / **bladerunner** — CSS reskins of the default elements (`milton-mc`, `milton-br`).
- **qhlan** — the full QHLAN redesign (glass panels, condensed display type, brand-green accent).
  Three drop-in layouts — `specs/qhlan-hubrail.json`, `qhlan-lowerthird.json`, `qhlan-cockpit.json`
  (from a Claude Design handoff built off the `qw-hud-bom` export). It uses its own element catalog
  (`js/qhlan-elements.js`) on a fixed 1920×1080 stage scaled as a whole, so view it with e.g.
  `overlay.html?spec=qhlan-hubrail`. Colour stays bound to QW's data semantics; the accent tints
  chrome only.

## Layout

```
PROTOCOL.md            the engine<->web wire contract (the state-snapshot JSON)
src/
  bridge.js            UDP -> WebSocket relay + static server + spec-save API
  ws-lite.js           minimal zero-dep WebSocket broadcast hub
  feeds/mock.js        synthetic state generator (dev without the engine)
  public/
    overlay.html       the live transparent overlay
    editor.html        the browser HUD editor (mockup background)
    css/{hud,editor}.css
    js/
      qw-constants.js  QW item/weapon bitmask constants + derivations (shared by web + mock)
      feed.js          WebSocket client (keeps latest snapshot, fps/age meters)
      render.js        the Stage: positions elements in %-space, scales to the window
                       (+ a fixed-1080 mode for themed specs that need pixel layout)
      elements.js      the default element catalog (health/armor/ammo/score/teaminfo/...)
      qhlan-elements.js the QHLAN-theme element catalog (glass renderers, fixed-1080 layout)
      theme.js         per-spec theming (body class + webfont + theme CSS), shared overlay+editor
      specs.js         the built-in "hub" preset + a frozen sample state for the editor
      editor.js        drag / select / properties / save-load / background / live-preview
    css/qhlan.css      QHLAN theme styling (scoped under body.qhlan)
    specs/hub.json     the default saved HUD-spec
    specs/qhlan-*.json QHLAN-themed layouts: hubrail / lowerthird / cockpit
scripts/wscheck.mjs    WebSocket smoke test
```

## Status

The web app (bridge + overlay + editor) works end-to-end against the mock feed. The ezQuake engine
export (`cl_hudexport`) is code-ready (source-cited integration plan), pending a published client
build. See [`docs/current-stage.md`](docs/current-stage.md).

## Contributing & license

Contributions are welcome — see [`AGENTS.md`](AGENTS.md) for the project contract and
[`docs/current-stage.md`](docs/current-stage.md) for the re-entry point. This repository follows the
[ai-project-template](https://github.com/Xerialen/ai-project-template) conventions.

Licensed under the [MIT License](LICENSE).
