# QuakeWorld HUD — Bill of Materials

A complete, itemized parts list of a **QuakeWorld spectator HUD** as rendered by `qw-webhud`.
This document is the "what a QW HUD is, and what information it contains" reference. `make-brief.mjs`
embeds it verbatim into every exported `bom.md`, then appends the *specific* layout's manifest and a
redesign brief. Read it as the spec a designer must satisfy: every component below is a part the HUD
is built from, and every field in "Raw materials" is data the HUD has available to show.

---

## What a QuakeWorld HUD is

A heads-up overlay drawn on top of the 3D view that tells you, at a glance, the live state of the
**tracked player** and the **match**. In `qw-webhud` it is a browser overlay that **replaces ezQuake's
native in-game HUD** entirely: the engine streams one state snapshot per frame, the browser renders the
HUD from it, and the result is composited over the game (transparent background — no opaque plate).

This HUD is **spectator-first**: built for taking demoshots from MVDs and for live casting. So it shows
the tracked player's status *and* both teams' state, and must stay readable at stream/broadcast scale.
When the spectator switches POV (`track <player>`), every player-bound component re-binds to the new
player — the HUD follows the camera.

## Canvas & coordinate model

- **Design space (console / HUD space):** `640 × 360` by default (a spec's `meta.baseW/baseH`).
- **Render target (video):** `1920 × 1080`, 16:9.
- Positions are **resolution-independent** so one spec works at 720p and 1080p:
  - `x`, `y` — percent of the stage `0..100`, origin top-left.
  - `anchor` — 2 chars: horizontal `l|c|r` + vertical `t|c|b` (e.g. `cb` = centre-bottom, `rt` = right-top).
  - `scale` — per-element size multiplier (`1.0` = the element's base size).
  - `z` — stacking order (higher draws on top).
- The renderer consumes a **spec**: `{ meta, elements: [ { id, type, x, y, anchor, scale, z, opts } ] }`.
  Each element's `type` selects one component from the fixed catalog below; `opts` tune it.

---

## Raw materials — the live state snapshot

The whole HUD is built from one JSON snapshot per frame. The components read these fields (and a few
derivations). This is the full set of information a QW HUD has to work with:

**`me`** — the tracked player:
| field | meaning |
|---|---|
| `name`, `team` | display name, team tag |
| `health` | 0..250 (can show negative briefly on death) |
| `armor`, `armortype` | armour points; type `0` none / `1` GA / `2` YA / `3` RA |
| `ammo` | `{ shells, nails, rockets, cells }` — all four pools |
| `weapon` | active-weapon bit (single-bit `items` mask) |
| `weapon_ammo` | ammo count for the active weapon's pool |
| `items` | bitmask: owned weapons + armour + powerups (`IT_*`, from `common.h`) |
| `frags`, `deaths`, `ping` | scoreboard numbers |
| `speed` | horizontal velocity in **ups** (units/sec) |
| `powerup_timers` | `{ quad, pent, ring, suit }` seconds remaining (when known) |

**`match`** — `{ map, gametime, timelimit, standby, countdown }` (clock + state).
**`teams[]`** — `{ name, frags, color }` per team; `color` is a QW palette index `0..13`.
**`teaminfo[]`** — per teammate `{ slot, name, loc, health, armor, armortype, weapon, ammo, stale }`
(the `say_team`/location report — what each mate has and where).
**`events`** — `{ messages[], centerprint, last_damage }`:
- `messages[]` — raw console-notify lines (obituaries + chat) newest-first; the kill feed parses these.
- `centerprint` — current centre-screen message.
- `last_damage` — `{ health, armor, at }` for a recent-damage flash.

**Derivations** (from `qw-constants.js`): `items` → owned weapons / active weapon / armour type / powerups;
team `color` → QW palette colour.

---

## The components — bill of materials

Every component, what it shows, the data behind it, and its colour semantics. Colour is meaningful —
a redesign should preserve these meanings (or deliberately design and document a new scheme).

### Tracked-player status (the bottom cluster)
| component (`type`) | shows | data | colour semantics |
|---|---|---|---|
| **Big stat: health** (`bigstat` kind=health) | current health, large | `me.health` | white > 50, **yellow ≤ 50**, **red ≤ 25** |
| **Big stat: armour** (`bigstat` kind=armor) | current armour, large | `me.armor`, `me.armortype` | **green** GA / **yellow** YA / **red** RA |
| **Big stat: ammo** (`bigstat` kind=ammo) | active weapon's ammo, large | `me.weapon_ammo` | white |
| **Ammo counts** (`ammocounts`) | all 4 pools at once | `me.ammo` | shells yellow · nails blue · rockets orange · cells purple; active pool highlit |
| **Weapons owned** (`weapons`) | which guns are held (SG→LG) | `me.items` | active highlit, owned bright, missing dimmed |
| **Powerups** (`powerups`) | active powerups + timers | `me.items`, `me.powerup_timers` | QUAD blue · PENT red · RING yellow · SUIT green |

### Match state (top)
| component (`type`) | shows | data | notes |
|---|---|---|---|
| **Team score bar** (`teamscore`) | both teams: name + frag total | `teams[]` | each team box uses its QW palette colour |
| **Game clock** (`gameclock`) | match time `mm:ss` | `match.gametime` / `timelimit` | elapsed, or remaining when `countdown` |

### Spectator & comms
| component (`type`) | shows | data | notes |
|---|---|---|---|
| **Tracking line** (`tracking`) | who the camera follows | tracked player name | the "▶ name" POV indicator |
| **Teammate panel** (`teaminfo`) | per mate: loc · name · health · armour · weapon | `teaminfo[]` | armour cell coloured by type; the team-overview at a glance |
| **Kill feed** (`killfeed`) | recent kills, **killer » victim** | `events.messages` | compact r_tracker style (parsed from raw obituaries), not verbose Quake text |
| **Center print** (`centerprint`) | centre-screen game message | `events.centerprint` | round start, "you died", etc. |

### Misc / chrome
| component (`type`) | shows | data |
|---|---|---|
| **Player name** (`playername`) | tracked player name | tracked name |
| **Speed** (`speed`) | movement speed in ups | `me.speed` |
| **Crosshair** (`crosshair`) | aim marker | static (often omitted when the engine draws its own) |
| **Static text** (`text`) | a fixed label | `opts.text` |

---

## Design constraints for any redesign

1. **Transparent overlay.** It composites over the live 3D view — never a full-screen opaque background.
2. **Colour carries meaning.** Health white/yellow/red, armour green/yellow/red by type, the per-pool ammo
   colours, team colours, powerup colours — these are read instantly by viewers. Don't recolour arbitrarily.
3. **Spectator-first.** Show the tracked player's status *and* both teams; the teammate panel and score bar
   are core, not optional. Must stay legible at broadcast/stream scale (small in frame, viewed at distance).
4. **Resolution-independent.** Positions are `%` of the stage with a per-element `scale`; design for 16:9,
   correct at 1280×720 and 1920×1080.
5. **Vocabulary.** The renderer draws from the fixed component catalog above (each `type` is one element).
   A redesign re-lays-out and restyles these; new looks may extend the catalog, but each part must still bind
   to the same live data.
