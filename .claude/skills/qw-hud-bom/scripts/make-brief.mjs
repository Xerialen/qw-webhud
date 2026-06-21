// make-brief.mjs — qw-hud-bom: export the qw-webhud BROWSER HUD *as-is* as a redesign package.
// One zip: layout.json + canvas.txt + screenshot.png + bom.md (the HUD Bill of Materials).
//
// Deterministic, no engine/MVD needed: starts the bridge (or reuses a running one), pushes ONE crafted
// snapshot over UDP so every component is populated (incl. the killfeed, which reads events.messages),
// headless-captures the whole HUD full-res via the Chrome DevTools Protocol, zips, tears down.
//
//   node make-brief.mjs [spec] [outDir]
//   spec   : a file in <repo>/src/public/specs/ (default "demoshots")
//   outDir : where the zip lands       (default <repo>/briefs)
//   env    : QW_WEBHUD_DIR (repo root), CHROME (chrome.exe), HUD_HTTP_PORT (7777), HUD_UDP_PORT (27999)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import dgram from 'node:dgram';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Project-scoped skill: it lives at <repo>/.claude/skills/qw-hud-bom/scripts, so the qw-webhud repo
// root is four levels up. QW_WEBHUD_DIR overrides (e.g. if this skill is copied elsewhere).
const REPO = process.env.QW_WEBHUD_DIR || path.resolve(__dirname, '..', '..', '..', '..');
const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
// Default to an ISOLATED port pair (not the app's 7777/27999) so a live engine feed can't hijack the
// capture: on its own port nothing competes, so the crafted snapshot below wins and EVERY component is
// populated (deterministic, reproducible brief). To instead capture a live HUD, point at the running
// bridge with HUD_HTTP_PORT=7777 (HUD_UDP_PORT=27999) and it will reuse it and shoot whatever is live.
const HTTP_PORT = Number(process.env.HUD_HTTP_PORT || 7788);
const UDP_PORT = Number(process.env.HUD_UDP_PORT || 27988);
const CDP_PORT = 9445;
const SPEC = String(process.argv[2] || 'demoshots').replace(/\.json$/, '');
const OUT_DIR = process.argv[3] || path.join(REPO, 'briefs');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('[qw-hud-bom]', ...a);

// one-line "what it shows" per component type, for the layout manifest table.
const COMPONENT = {
  bigstat: 'Big numeric stat',
  ammocounts: 'All four ammo pools (shells/nails/rockets/cells); active pool highlit',
  weapons: 'Weapons owned (SG..LG); active highlit, missing dimmed',
  powerups: 'Active powerups (quad/pent/ring/suit) + countdown timers',
  teamscore: 'Both teams: name + frag total + team colour',
  gameclock: 'Match clock (mm:ss elapsed or remaining)',
  teaminfo: 'Teammate panel: per mate loc/name/health/armour/weapon',
  tracking: 'Which player the spectator camera is following',
  killfeed: 'Recent kills as killer -> victim (compact r_tracker style)',
  centerprint: 'Centre-screen game message',
  crosshair: 'Crosshair marker',
  playername: 'Tracked player name',
  speed: 'Player speed in ups',
  text: 'Static text label',
};

async function up() {
  try { return (await fetch(`http://127.0.0.1:${HTTP_PORT}/api/snapshot`)).ok; }
  catch { return false; }
}

// connect to the page target's debugger ws, navigate, wait, capture 1920x1080, return a PNG buffer.
async function capture(url, waitMs = 3800) {
  const ud = path.join(os.tmpdir(), 'qwbom-cdp-' + process.pid);
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--user-data-dir=${ud}`, `--remote-debugging-port=${CDP_PORT}`,
    '--force-device-scale-factor=1', '--window-size=1920,1080', '--hide-scrollbars', 'about:blank',
  ], { stdio: 'ignore' });
  try {
    let pageWs = null;
    for (let i = 0; i < 40 && !pageWs; i++) {
      await sleep(250);
      try {
        const list = await fetch(`http://127.0.0.1:${CDP_PORT}/json`).then((r) => r.json());
        const page = list.find((t) => t.type === 'page');
        if (page) pageWs = page.webSocketDebuggerUrl;
      } catch {}
    }
    if (!pageWs) throw new Error('chrome devtools not reachable');

    const ws = new WebSocket(pageWs);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('cdp ws open failed')); });
    let id = 0; const pending = new Map();
    ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
    const cmd = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });

    await cmd('Page.enable');
    await cmd('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
    await cmd('Page.navigate', { url });
    await sleep(waitMs); // load + /api/snapshot fetch + first WS frame + render
    const shot = await cmd('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 1920, height: 1080, scale: 1 }, captureBeyondViewport: true });
    ws.close();
    if (!shot.result?.data) throw new Error('captureScreenshot returned no data');
    return Buffer.from(shot.result.data, 'base64');
  } finally {
    chrome.kill();
    try { fs.rmSync(ud, { recursive: true, force: true }); } catch {}
  }
}

function canvasText(spec) {
  const bw = spec?.meta?.baseW ?? 640, bh = spec?.meta?.baseH ?? 360;
  return [
    'qw-webhud HUD canvas / coordinate model',
    '',
    `Design space (console / HUD space): ${bw} x ${bh}`,
    'Render target (video):              1920 x 1080   (16:9)',
    '',
    'Element positions are RESOLUTION-INDEPENDENT:',
    '  x, y   = percent of the stage (0..100), origin top-left',
    '  anchor = 2 chars: horizontal [l|c|r] + vertical [t|c|b]  (e.g. "cb" = centre-bottom)',
    '  scale  = per-element size multiplier (1.0 = base)',
    '  z      = stacking order (higher draws on top)',
    '',
    `Spec: ${spec?.meta?.name ?? SPEC}  (${(spec.elements || []).length} elements)`,
    '',
  ].join('\n');
}

function manifest(spec) {
  const rows = (spec.elements || []).map((e) => {
    let shows = COMPONENT[e.type] || e.type;
    if (e.type === 'bigstat' && e.opts?.kind) shows = `Big ${e.opts.kind} digit`;
    const opts = e.opts ? '`' + JSON.stringify(e.opts) + '`' : '';
    return `| ${e.id} | ${e.type} | ${shows} | ${e.x} | ${e.y} | ${e.anchor} | ${e.scale ?? 1} | ${opts} |`;
  });
  return [
    "## This layout's manifest",
    '',
    `Spec **${spec?.meta?.name ?? SPEC}** places these components (positions = % of stage). This is the`,
    'current arrangement shown in `screenshot.png` and defined exactly in `layout.json`:',
    '',
    '| id | type | shows | x% | y% | anchor | scale | opts |',
    '|---|---|---|---|---|---|---|---|',
    ...rows,
    '',
  ].join('\n');
}

function taskText(spec) {
  const bw = spec?.meta?.baseW ?? 640, bh = spec?.meta?.baseH ?? 360;
  return [
    '## Your task — redesign this HUD',
    '',
    'You are redesigning the QuakeWorld spectator HUD described above. You have:',
    '- **layout.json** — the exact current element layout (the manifest above).',
    `- **canvas.txt** — the coordinate space (design ${bw}x${bh}, render 1920x1080, 16:9).`,
    '- **screenshot.png** — how the HUD looks right now, composited over the 3D view.',
    '',
    'Redesign the elements for clarity, visual hierarchy, and broadcast readability. You MAY change',
    'position, grouping, scale, typography, and colour treatment, and propose new arrangements.',
    'You MUST keep:',
    '- the **data bindings** — each component still shows the same live field;',
    '- the **colour semantics** (health white/yellow/red; armour green/yellow/red by type; per-pool',
    '  ammo colours; team colours; powerup colours) unless you deliberately design and document a new scheme;',
    '- a **transparent overlay** (no opaque full-screen background — it composites over live 3D);',
    '- **spectator-first** content (tracked player status + BOTH teams), legible at stream scale.',
    '',
    'Deliver: a revised layout (same element vocabulary as the manifest, extended if needed) plus a short',
    'visual direction (typography, colour, spacing). If you can, express the layout in the same spec shape',
    '(`elements: [{ type, x, y, anchor, scale, z, opts }]`) so it drops straight back into qw-webhud.',
    '',
  ].join('\n');
}

async function main() {
  if (!fs.existsSync(path.join(REPO, 'src', 'bridge.js'))) {
    throw new Error(`QW_WEBHUD_DIR is not the qw-webhud repo: ${REPO} (set QW_WEBHUD_DIR to override)`);
  }
  // 1. resolve + validate the spec
  const specFile = path.join(REPO, 'src', 'public', 'specs', SPEC + '.json');
  if (!fs.existsSync(specFile)) {
    const dir = path.join(REPO, 'src', 'public', 'specs');
    const avail = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')) : [];
    throw new Error(`no spec "${SPEC}" at ${specFile}. Available: ${avail.join(', ') || '(none)'}`);
  }
  const spec = JSON.parse(fs.readFileSync(specFile, 'utf8'));

  // 2. a complete, deterministic snapshot (mirrors the mock's shapes, plus events.messages for the killfeed)
  const qc = await import(pathToFileURL(path.join(REPO, 'src', 'public', 'js', 'qw-constants.js')).href);
  const mk = qc.makeItems;
  const snapshot = {
    v: 1, seq: 1, t_engine: 570, src: 'qw-hud-bom', mvd: true, alive: true,
    me: {
      name: 'X-ray', team: '-fu-', health: 87, armor: 150, armortype: 2,
      ammo: { shells: 40, nails: 120, rockets: 12, cells: 60 },
      weapon: mk(['rl']), weapon_ammo: 12,
      items: mk(['axe', 'sg', 'ssg', 'ng', 'rl', 'lg'], { armor: 2, quad: true }),
      frags: 17, deaths: 9, ping: 25, speed: 320, powerup_timers: { quad: 18 },
    },
    match: { map: 'dm3', gametime: 570, timelimit: 1200, standby: false, countdown: false },
    teams: [{ name: '-fu-', frags: 84, color: 4 }, { name: 'GoF!', frags: 51, color: 13 }],
    teaminfo: [
      { slot: 1, name: 'sail', loc: 'rl', health: 100, armor: 150, armortype: 2, weapon: mk(['rl']), ammo: 10, stale: false },
      { slot: 2, name: 'milton', loc: 'quad', health: 84, armor: 200, armortype: 3, weapon: mk(['lg']), ammo: 95, stale: false },
      { slot: 3, name: 'draqz', loc: 'ya', health: 47, armor: 60, armortype: 1, weapon: mk(['ssg']), ammo: 3, stale: false },
    ],
    events: {
      messages: [
        'GoF! was rocketed by X-ray',
        'low was zapped by sail',
        'draqz was nailed by milton',
        'enemy was telefragged by X-ray',
      ],
      centerprint: '', last_damage: { health: 9, armor: 14, at: 569 },
    },
  };

  // 3. bridge: reuse a running one, else spawn (and remember to kill it)
  let bridge = null;
  if (await up()) {
    log(`reusing the bridge already on :${HTTP_PORT}`);
  } else {
    log(`starting bridge (node src/bridge.js) on :${HTTP_PORT}`);
    bridge = spawn('node', ['src/bridge.js'], {
      cwd: REPO, stdio: 'ignore',
      env: { ...process.env, HUD_HTTP_PORT: String(HTTP_PORT), HUD_UDP_PORT: String(UDP_PORT) },
    });
    for (let i = 0; i < 40 && !(await up()); i++) await sleep(250);
    if (!(await up())) throw new Error(`bridge did not come up on :${HTTP_PORT}`);
  }

  // 4. pump the snapshot over UDP so /api/snapshot + the WS are populated before + during capture
  const sock = dgram.createSocket('udp4');
  const buf = Buffer.from(JSON.stringify(snapshot));
  const pump = setInterval(() => { try { sock.send(buf, UDP_PORT, '127.0.0.1'); } catch {} }, 200);
  sock.send(buf, UDP_PORT, '127.0.0.1');
  await sleep(500);

  try {
    // 5. capture the whole HUD over the 3D backdrop
    const url = `http://localhost:${HTTP_PORT}/overlay.html?spec=${encodeURIComponent(SPEC)}&bg=/_clean3d.jpg`;
    log(`capturing ${url}`);
    const png = await capture(url);

    // 6. stage the four artefacts
    const stage = path.join(os.tmpdir(), 'qwbom-stage-' + process.pid);
    fs.rmSync(stage, { recursive: true, force: true });
    fs.mkdirSync(stage, { recursive: true });
    fs.writeFileSync(path.join(stage, 'layout.json'), JSON.stringify(spec, null, 2));
    fs.writeFileSync(path.join(stage, 'canvas.txt'), canvasText(spec));
    fs.writeFileSync(path.join(stage, 'screenshot.png'), png);
    const bomRef = fs.readFileSync(path.join(__dirname, '..', 'HUD-BOM.md'), 'utf8');
    fs.writeFileSync(path.join(stage, 'bom.md'),
      `${bomRef}\n\n---\n\n${manifest(spec)}\n${taskText(spec)}`);

    // 7. zip (Windows-native Compress-Archive)
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const outZip = path.join(OUT_DIR, `qw-hud-bom-${SPEC}.zip`);
    fs.rmSync(outZip, { force: true });
    const z = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command',
      `Compress-Archive -Path "${stage}\\*" -DestinationPath "${outZip}" -Force`], { stdio: 'ignore' });
    fs.rmSync(stage, { recursive: true, force: true });
    if (z.status !== 0) throw new Error('Compress-Archive failed (exit ' + z.status + ')');

    const kb = (fs.statSync(outZip).size / 1024).toFixed(0);
    log(`OK  ${outZip}  (${kb} KB)`);
    log('contents: layout.json, canvas.txt, screenshot.png, bom.md');
    console.log(outZip);
  } finally {
    clearInterval(pump); try { sock.close(); } catch {}
    if (bridge) bridge.kill();
  }
}

main().catch((e) => { console.error('[qw-hud-bom] ERR', e.message); process.exitCode = 1; });
