# Decision Log

## D1 — Engine-side per-frame UDP snapshot as the data source
### Date
2026-06-21
### Decision
Get live figures by adding a small export to the ezQuake fork: every rendered frame, push the tracked
player's full HUD state as one JSON UDP datagram to localhost. The browser renders the latest snapshot.
### Alternatives Considered
- MVD/QTV stream parsing (like qw-sim / local-hub): real data but higher latency, complex, demo-only.
- Reading process memory: fragile across builds.
- Reusing ezhud's baked event-timeline replay: not live.
### Evidence
The owner owns the ezQuake fork and asked for "extremely low latency from in-game events." `cl.stats[]`
already holds the full state every frame; a localhost UDP send is sub-millisecond. Engine scout
produced a complete source-cited hook plan (see findings-log).
### Expected Consequences
Lowest possible latency; works for both live play and demo/MVD casting (same `cl.stats` path). Cost:
a (small) engine change + a build.
### Revisit Conditions
If the build proves infeasible, fall back to an MVD-parse feed for the casting use case.

## D2 — Build fresh-and-lean; reuse ezhud's data shape, not its code
### Date
2026-06-21
### Decision
New, lean web app. Reuse ezhud's `GameState` *shape* (the wire contract) and element-catalog concept;
discard its `index.html` monolith, `computeRenderedSize` fidelity machinery, and cvar import/export.
### Alternatives Considered
Fork ezhud directly.
### Evidence
ezhud is a WYSIWYG cfg-*previewer* — most of its code mimics ezQuake's draw to predict a cfg. This app
*replaces* the HUD (the browser IS the render), so that fidelity machinery is pure baggage. ezhud's
state shape, though, is the convergent QW schema (matches qw-sim's Parquet).
### Expected Consequences
Smaller, purpose-fit codebase; a web-native HUD-spec (position/anchor/scale/colour/bind) instead of
ezQuake cvar bags.
### Revisit Conditions
If pixel-faithful ezQuake reproduction ever becomes a goal, revisit reusing ezhud's sizing logic.

## D3 — Zero runtime dependencies; hand-rolled WebSocket
### Date
2026-06-21
### Decision
Node stdlib only; the WS broadcast server is ~80 lines (RFC 6455 server->client).
### Evidence
Matches the owner's proven stdlib-WS pattern (thevault qw-lab-live-viewer recipe). "Clone and
`node src/bridge.js`" with no `npm install`.
### Revisit Conditions
If client->server messaging or compression is ever needed, adopt the `ws` package.

## D4 — Vendor a tiny RFC 6455 *client* (not the `ws` dep) for the CDP/OBS tooling
### Date
2026-06-26
### Decision
The headless-render tooling (`scripts/shoot.mjs`, `obs-shoot.mjs`, `wscheck.mjs`, the qw-hud-bom
`make-brief.mjs`) needs a WebSocket *client*. Node's global `WebSocket` only exists on Node >= 21, which
broke the render on a deploy host running system Node 18. Rather than add the `ws` package (D3 zero-dep),
a ~110-line RFC 6455 client `wsConnect()` was added to `src/ws-lite.js` (alongside the existing server),
masking client frames and reassembling fragmented incoming frames (large CDP screenshot payloads).
### Evidence
Keeps "clone and `node …`" with no `npm install`; D3's revisit condition (client->server *HUD* messaging)
is not met — this is dev-tooling, not a runtime dep of the HUD app. Validated rendering QHLAN on Node 18.
### Revisit Conditions
If the bidirectional HUD command path (B4) lands, re-evaluate consolidating client+server WS code.
