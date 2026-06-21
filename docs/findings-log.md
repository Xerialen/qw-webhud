# Findings Log

## 2026-06-21 — Web pipeline works end to end (mock feed)

### Result
Bridge + overlay + editor validated against the synthetic feed.
### Evidence
- `node scripts/wscheck.mjs`: 60 frames in 1422 ms (~42 fps), 0 seq-gaps; snapshot shape matches
  `PROTOCOL.md` (`me/match/teams/teaminfo/events`); `items:36967` = owned weapons + red-armour bits.
- Overlay DOM: 13 elements present and correctly positioned; debug readout `conn ok · age 11ms`.
- Editor self-test: 13 elements, 14-type palette, click-select, drag moved `health` 50%->59.8%,
  properties panel populated, 0 console errors; spec save round-trip `PUT 200 -> GET 200`.
### Confidence
High — the UDP -> WS -> render path and the editor both proven in a real browser.
### Follow-up
Swap the mock for the real engine feed (same wire format).

## 2026-06-21 — ezQuake `cl_hudexport` integration points (source-cited)

### Result
Complete hook plan for the engine export, against `Xerialen/ezquake-source` (local HEAD `b443a89b`,
2026-01-31). To implement in a new `src/cl_hudexport.c` (+ header), registered in `CMakeLists.txt`
client block (~line 655) and called from `CL_Frame`.
### Evidence (file:line)
- Stats: `cl.stats[]` is `int[MAX_CL_STATS=32]` at `client.h:610`; `STAT_*` at `common.h:85-105`
  (HEALTH 0, WEAPON 2, AMMO 3, ARMOR 4, SHELLS/NAILS/ROCKETS/CELLS 6-9, ACTIVEWEAPON 10, ITEMS 15).
  **Frags are NOT a stat** — read `cl.players[track].frags` (`client.h:143`).
- Items/powerups: `IT_*` bitmask `common.h:107-132` (weapons 1..64; ARMOR1/2/3 = 8192/16384/32768;
  QUAD 4194304, PENT[INVULN] 1048576, RING[INVIS] 524288, SUIT 2097152). Armour type = test ARMOR3 ->
  ARMOR2 -> ARMOR1 (`hud_armor.c:31`); value is always `STAT_ARMOR`.
- Hook point: tail of `CL_Frame` (`cl_main.c:~2744`, after the render block, before `CL_DecayLights`)
  — runs exactly once per rendered frame, past all early-returns, stats/cam current.
- Tracked player (works in demo+MVD because `cl.stats[]` already follows the tracked slot, see
  `CL_SetStat` `cl_parse.c:3354-3387`): `track = (cls.mvdplayback||cl.spectator) ? Cam_TrackNum()
  (cl_cam.c:1024) : cl.playernum; if (track<0) track = cl.viewplayernum (client.h:674)`.
- Teaminfo: `ti_clients[]` (`hud_teaminfo.c:662`, struct `screen.h:138`); populated by
  `Parse_TeamInfo` (live) / `Update_TeamInfo` (MVD, 1 Hz, `cls.mvdplayback` only); honour 5 s
  `TI_TIMEOUT`; blanks on cold seek (use `demo_jump_skip_messages 0`).
- Clock: emit raw `cl.gametime` (double, `client.h:628`); format mm:ss in the browser.
- Cvars: `cvar_t` `cvar.h:61`; register via `Cvar_SetCurrentGroup(CVAR_GROUP_NETWORK)` +
  `Cvar_Register` in `CL_InitLocal` (`cl_main.c:1789`, network block ~1900).
- Socket: **do NOT reuse `NET_SendPacket`** — `cls.socketip` is `INVALID_SOCKET` during demo/MVD
  playback (`net.c:963`), exactly when we need export. Open a dedicated send-only `SOCK_DGRAM`
  socket once (WinSock already init in `NET_Init`), `sendto` 127.0.0.1:port fire-and-forget.
### Confidence
High — every point cited and cross-checked by the engine scout. A ready-to-adapt `cl_hudexport.c`
sketch exists (in the session record; to be committed when implemented).

## 2026-06-21 — Build environment (the open item)

### Result
The fork's CMake+vcpkg project is correct but **not buildable on the Windows host as-is**: no MSVC,
no standalone CMake, no Ninja, vcpkg un-bootstrapped. WSL2 Ubuntu has **cmake 3.28.3 + gcc 13.3.0**.
### Interpretation
Avoid installing the multi-GB MSVC toolchain on the gaming Windows box. Preferred path: build in WSL2
and cross-compile to a Windows `.exe` via the `mingw64-x64-cross` preset (`BUILD.md:127`), then run
that exe in a copy of the lab client on Windows. Open question: is `x86_64-w64-mingw32-*` present in
WSL2 (probe was inconclusive), or does it need a light apt install (a dev-env provisioning choice to
flag). NB the local source (2026-01-31) is older than the lab exe (2026-05-17) — update the clone to
the fork's current master before building if the export should ship in the binary used in the lab.
### Confidence
High on the toolchain state; Medium on the exact cross-build command until tried.
### Follow-up
Confirm the WSL2 mingw toolchain; bootstrap vcpkg for the cross triplet; build; verify packets with a
UDP listener.
