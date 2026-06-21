# Success Criteria

What counts as success for the prototype, and how each is measured. (Hook 1 of the verification
workflow reads this — don't invent other completion criteria.)

## Must-have (the prototype is "working" when all hold)

1. **Live figures, end to end.** A real ezQuake instance (live play or demo) drives the web HUD: when
   health/armour/ammo/weapon/score/teaminfo change in-game, the overlay reflects it.
   - *Measure:* run the engine on a demo with `cl_hudexport 1`, watch the overlay track the values;
     capture a before/after.  *Status:* PENDING engine build. Pipeline proven with the mock feed.
2. **Extremely low latency.** The overlay shows in-game state with no perceptible lag.
   - *Measure:* the snapshot "age" readout (time since last frame) stays within ~1 frame; end-to-end
     is engine-frame + sub-ms localhost UDP + WS + one rAF.  *Status:* mock path measured age ~11 ms.
3. **Replaces the HUD.** With the built-in ezQuake HUD off, the web overlay provides the full HUD
   (health, armour, ammo, weapons, powerups, team score, game clock, teaminfo, tracking).
   - *Measure:* all elements present and correct over the live game.  *Status:* all render from the
     feed; built-in-HUD-off compositing PENDING engine integration.
4. **Editable in a browser mockup.** Drag/position/style every element over a quake-screen mockup;
   save and reload the layout; the overlay consumes the same layout.
   - *Measure:* drag changes position; Save->Load round-trips; overlay renders the saved spec.
     *Status:* DONE (drag verified 50%->59.8%; PUT 200/GET 200; overlay loads `/api/specs/hub`).

## Nice-to-have (not required for the prototype)
- Authentic QW bitmap fonts / sprite icons (currently web fonts + text).
- A packaged transparent always-on-top overlay window for live play (OBS browser-source works today).
- An MVD-replay feed for casting without a live client.
- Powerup countdown timers in live play (MVD-only today).

## Explicit non-goals
- Pixel-identical reproduction of hub.quakeworld.nu's React UI (different renderer; faithful in info,
  not pixels).
- Editing ezQuake `.cfg` files (that's the qw-cfg skill's job; this is a separate web HUD).
