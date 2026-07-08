---
name: qw-hud-bom
description: "Export the qw-webhud BROWSER HUD as a HUD Bill of Materials redesign package: one zip with the layout JSON, the canvas/resolution model, a full-res screenshot of the whole HUD, and a natural-language bill-of-materials prompt describing every HUD component and the live data behind it. Use when handing the current QuakeWorld web HUD to a design tool (e.g. Claude's design feature) to redesign/restyle the elements, or when the user says 'HUD bill of materials', 'HUD design brief', 'export the HUD for redesign', 'package the HUD'. NOT for editing the in-engine ezQuake HUD cvars (that is qw-cfg), and NOT a redesigner itself — it only captures the HUD as-is."
---

# qw-hud-bom — HUD Bill of Materials exporter

Captures the **qw-webhud** browser HUD *as-is* and packages it for redesign by an external design tool.
**Show-as-is only:** it does not redesign, iterate, or validate a redesign — it produces a faithful,
complete description of the current HUD so a design tool can take it from there.

## What it produces

One zip — `qw-hud-bom-<spec>.zip` — containing:

| file | what |
|---|---|
| `layout.json` | the HUD spec: every element's `type, x, y%, anchor, scale, z, opts` |
| `canvas.txt` | resolution model — design space (stage %, base 640×360) + render target 1920×1080 |
| `screenshot.png` | the whole HUD, full-res 1920×1080, composited over a 3D backdrop |
| `screenshot-2560.png` | the same HUD at 2560×1440 — confirms the layout holds at stream resolution (where the fixed-1080 stage scale ≠ 1) |
| `bom.md` | the **Bill of Materials**: what a QW HUD is + every component + the live data behind it + the redesign brief (the [HUD-BOM.md](HUD-BOM.md) reference, then this layout's manifest and task) |

## Run

From the qw-webhud repo root:

```
node .claude/skills/qw-hud-bom/scripts/make-brief.mjs [spec] [outDir]
```

- `spec` — a file in `src/public/specs/` (default `demoshots`; e.g. `hub`).
- `outDir` — where the zip lands (default `<repo>/briefs`, gitignored).
- The repo root is auto-detected (this skill lives in `<repo>/.claude/skills/`); `QW_WEBHUD_DIR` overrides it, `CHROME` overrides the Chrome path.
- Needs Node + Chrome. It starts its **own** bridge on an isolated port, pushes one crafted snapshot over
  UDP so **every** component is populated — including the kill feed, which reads `events.messages` —
  headless-captures full-res, zips, and tears everything down. No engine / MVD required; the brief is
  deterministic and reproducible.
- To instead capture a **live** HUD as-is, set `HUD_HTTP_PORT=7777 HUD_UDP_PORT=27999` so it reuses the
  running bridge and shoots whatever the engine is currently feeding it.

After it runs: **read `bom.md` and view `screenshot.png`**, then hand the zip (or `bom.md` + the screenshot)
to the design tool and ask it to redesign the elements.

## Capture note — HUD-over-Quake images

This headless render **over the `_clean3d` backdrop** is the canonical way to show the HUD over a Quake
scene — the layout is correct and reproducible. Do **not** use a live desktop grab of the transparent
overlay window (`extras/overlay-window/shoot-desktop.ps1`) to judge layout: a GDI capture of a transparent,
always-on-top window **distorts the HUD position** (it reads off-centre when the render is actually fine).
The desktop grab is only for confirming the overlay composites *on top of* the running game. Validate HUD
**layout** headlessly at the target resolution (`screenshot-2560.png`, or `scripts/shoot.mjs … 2560 1440`) —
at 1920×1080 the fixed-1080 stage scale is exactly 1, so centring is trivially correct and res-dependent
bugs never surface. (See vault `headless-hud-capture`.)

## Reference

The canonical domain knowledge — "what a QW HUD is + every component + every data field" — lives in
[HUD-BOM.md](HUD-BOM.md). `make-brief.mjs` embeds it into each exported `bom.md`. Edit HUD-BOM.md when the
qw-webhud element catalog or snapshot shape changes (see `src/public/js/elements.js`, `qw-constants.js`).

## Boundaries

- **Different surface from `qw-cfg`.** `qw-cfg` edits the *engine* HUD via ezQuake cvars and renders live
  in-engine. This skill exports the *browser* HUD (the qw-webhud spec/elements). They don't overlap.
- **Show-as-is only** — the redesign happens in whatever tool you hand the package to.
