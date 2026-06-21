# Vision

## North star
A HUD for QuakeWorld that lives **outside** the engine: rendered in a browser, fed live in-game state
at extremely low latency, and designed visually in a browser that mocks up the quake screen — so the
HUD can look like anything (CSS, web fonts, layout freedom) while still showing the real game in real
time. The same artifact works as a live overlay (over your own game, or in OBS for casting) and as an
editable design surface.

## Why
- ezQuake's built-in HUD is configured by ~hundreds of `hud_*` cvars and drawn as bitmap sprites —
  powerful but rigid, and hard to design.
- hub.quakeworld.nu already proved the model works: it renders the world with FTE and overlays the
  HUD (score bar, teaminfo) as a web app. This project generalises that to ezQuake and makes it live
  and editable.

## What "done enough to use" looks like
You run the bridge, launch ezQuake with the built-in HUD off and `cl_hudexport 1`, open the overlay
(or add it as an OBS browser source), and play / cast with a web HUD that tracks the game with no
perceptible lag — and you can re-design that HUD in the browser editor whenever you like.
