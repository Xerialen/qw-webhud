# Wire protocol — the engine ↔ web contract

One **UDP datagram = one JSON object = the full current HUD state** for the tracked
player, emitted **once per rendered frame** by the source (the ezQuake engine, or the
mock/MVD feeds). The Node bridge forwards each datagram verbatim over WebSocket to the
browser; the browser renders the **latest** snapshot it has received.

Design choices:

- **Snapshot, not event stream.** The source already holds the full state every frame
  (`cl.stats[]`), so it ships the whole picture each time. The web side is stateless —
  it just draws the most recent snapshot. No event replay, no drift, lowest latency.
- **Raw-ish fields; derive in the browser.** The engine ships raw QuakeWorld values
  (the `items` bitmask, the active-weapon bit, the four ammo counts). The browser derives
  owned-weapons / armour colour / powerups from `items` (see `public/js/qw-constants.js`)
  — one place for the QW semantics. The mock feed produces the identical shape.
- **Everything optional except `me` + `match.gametime`.** A live-play source may not have
  `teams`/`teaminfo` (those need teamplay or MVD). The renderer draws whatever is present.

## Transport

| Hop | Default | Notes |
|-----|---------|-------|
| source → bridge | UDP `127.0.0.1:27999` | fire-and-forget; newest wins, stale frames simply dropped |
| bridge → browser | WebSocket `ws://localhost:7777/ws` | `TCP_NODELAY`, unmasked text frames |
| bridge static | HTTP `http://localhost:7777/` | serves `src/public/` (`overlay.html`, `editor.html`) |

Ports override via env: `HUD_UDP_PORT`, `HUD_HTTP_PORT`. (ezQuake side: `cl_hudexport_port`.)

## The snapshot object

```jsonc
{
  "v": 1,                       // protocol version (bump on breaking change)
  "seq": 12345,                 // monotonic frame counter (gap = dropped frames)
  "t_engine": 1234.56,          // source clock, seconds (for latency diagnostics)
  "src": "engine",              // "engine" | "mock" | "mvd"
  "mvd": false,                 // true during demo/MVD playback
  "alive": true,                // are the "me" stat fields meaningful right now
                                //   (engine: cl.spectator == cl.autocam gate)

  "me": {                       // REQUIRED. The tracked player.
    "name": "X-ray",
    "team": "-fu-",
    "health": 100,              // STAT_HEALTH (may be <=0 / >100)
    "armor": 150,               // STAT_ARMOR (current value)
    "armortype": 2,             // 0 none, 1 green, 2 yellow, 3 red  (derived from items; sent for convenience)
    "ammo": { "shells": 12, "nails": 88, "rockets": 5, "cells": 30 }, // STAT_SHELLS/NAILS/ROCKETS/CELLS
    "weapon": 32,               // STAT_ACTIVEWEAPON  (raw IT_ bit of the active weapon)
    "weapon_ammo": 5,           // STAT_AMMO (ammo for the active weapon)
    "items": 4202528,           // STAT_ITEMS (raw bitmask — browser derives weapons/armour/powerups)
    "frags": 17,                // cl.players[track].frags (NOT in cl.stats)
    "ping": 25,
    "speed": 320                // optional; horizontal speed (ups)
  },

  "match": {                    // REQUIRED (at least gametime)
    "map": "dm3",
    "gametime": 312.4,          // raw seconds; browser formats mm:ss
    "timelimit": 1200,          // seconds; 0 if unknown
    "standby": false,           // pre-game / warmup
    "countdown": false
  },

  "teams": [                    // optional; the score bar
    { "name": "-fu-", "frags": 84, "color": 4 },
    { "name": "GoF!", "frags": 51, "color": 13 }
  ],

  "players": [                  // optional; full roster (scoreboard)
    { "slot": 0, "name": "X-ray", "team": "-fu-", "frags": 17, "ping": 25,
      "pl": 0, "spectator": false, "topcolor": 4, "bottomcolor": 4 }
  ],

  "teaminfo": [                 // optional; right-side teammate panel (teamplay / MVD only)
    { "slot": 1, "name": "GoF!", "loc": "rl", "health": 74, "armor": 120,
      "armortype": 3, "weapon": 64, "ammo": 12, "items": 0, "stale": false }
  ],

  "events": {                   // optional
    "messages": [               // raw QW console lines (obituaries + chat), newest first; the browser
      "enemy was rocketed by X-ray"   // parses obituaries into the killfeed (qw-constants.js parseKill)
    ],
    "centerprint": "",
    "last_damage": { "health": 0, "armor": 0, "at": -100 } // for a damage-flash effect
  }
}
```

### Field provenance (engine side — see the cl_hudexport integration report)

| wire field | ezQuake source |
|---|---|
| `me.health/armor/ammo/weapon/weapon_ammo` | `cl.stats[STAT_*]` (`common.h:85-105`) |
| `me.items`, `me.armortype` | `cl.stats[STAT_ITEMS]`, `IT_ARMOR1/2/3` (`common.h:107-132`, `hud_armor.c:31`) |
| `me.frags`, `me.name` | `cl.players[track]` (`client.h:135`); `track` via `Cam_TrackNum()` / `cl.viewplayernum` |
| `match.gametime` | `cl.gametime` (`client.h:628`); count-up/down per `cl.countdown/standby` |
| `teaminfo[]` | `ti_clients[]` (`hud_teaminfo.c:662`, struct `screen.h:138`); honour 5 s `TI_TIMEOUT` |
| `mvd` | `cls.mvdplayback` |

`powerup_timers` (quad/pent/ring seconds remaining) are **MVD-only** — live play has only the
on/off bit. Send them under `me.powerup_timers` when `mvd` is true; omit otherwise.

## Versioning

`v` starts at `1`. Add fields freely (the renderer ignores unknown keys). Bump `v` only when an
existing field changes meaning, and have the renderer warn on a `v` it doesn't know.
