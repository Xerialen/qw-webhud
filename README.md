# qw-webhud

A **live, editable web HUD overlay for ezQuake / QuakeWorld**. It replaces the in-game HUD with one
rendered in a browser, fed the real in-game figures (health / armour / ammo / weapons / powerups /
score / teaminfo / clock) in real time, and editable outside the game in a browser that mocks up the
quake screen.

This is the general, live evolution of the hub.quakeworld.nu HUD model (an FTE canvas with a
web-rendered HUD overlay): same idea, but for ezQuake, live, low-latency, and fully editable.

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

## Quick start

```bash
# 1. run the bridge with the synthetic mock feed (no engine needed)
node src/bridge.js --mock

# 2. open the editor and the overlay
#    editor:  http://localhost:7777/editor.html
#    overlay: http://localhost:7777/overlay.html?bg=check&dbg
#             (bg=check = checkerboard so you can see the transparent overlay; dbg = fps/latency)
```

With the real engine instead of `--mock`: run `node src/bridge.js`, launch the ezQuake fork built
with `cl_hudexport`, and set `cl_hudexport 1` in-game (port via `cl_hudexport_port`, default 27999).

### Using the overlay over the game / in OBS
- **OBS:** add a Browser source -> `http://localhost:7777/overlay.html`, sized to your canvas. The
  page background is transparent, so only the HUD composits over the game capture.
- **Live, on top of the game:** run the game borderless-windowed and put a transparent, always-on-top
  browser window (e.g. a dedicated Chrome `--app` window) over it. A packaged transparent overlay
  window is a planned convenience (see the roadmap).

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
      elements.js      the element catalog (health/armor/ammo/score/teaminfo/...)
      specs.js         the built-in "hub" preset + a frozen sample state for the editor
      editor.js        drag / select / properties / save-load / background / live-preview
    specs/hub.json     the default saved HUD-spec
scripts/wscheck.mjs    WebSocket smoke test
```

## Status

The web app (bridge + overlay + editor) works end-to-end against the mock feed. The ezQuake engine
export (`cl_hudexport`) is code-ready (source-cited integration plan), pending a cross-compile build.
See [`docs/current-stage.md`](docs/current-stage.md).

---

This repository follows the [ai-project-template](https://github.com/Xerialen/ai-project-template)
conventions: `AGENTS.md` is the agent contract; `docs/current-stage.md` is the re-entry point.
