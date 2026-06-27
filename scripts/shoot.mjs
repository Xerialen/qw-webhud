// shoot.mjs -- reliable full-res screenshot of a URL via Chrome DevTools Protocol (zero deps; Node's
// global fetch + a vendored RFC 6455 client, so it runs on Node 18 + Windows/Linux/macOS). Avoids the
// flaky `chrome --screenshot` flag (profile collisions + virtual-time-budget vs the page's open
// WebSocket). Usage: node shoot.mjs [url] [outPng] [waitMs] [width] [height]
// width/height default to 1920x1080; pass e.g. 2560 1440 to validate layout at a non-unit stage scale.
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { wsConnect } from '../src/ws-lite.js';
import { resolveChrome, profileDir } from './_chrome.mjs';

const CHROME = resolveChrome();
const PORT = 9444;
const URL = process.argv[2] || 'http://localhost:7777/overlay.html?spec=demoshots&bg=/_clean3d.jpg';
const OUT = process.argv[3] || 'composite.png';   // cwd-relative default (machine-agnostic)
const WAIT = Number(process.argv[4] || 3800);
const W = Number(process.argv[5] || 1920);
const H = Number(process.argv[6] || 1080);
const UD = profileDir(`qwcdp-${process.pid}`);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const SANDBOX = process.platform === 'linux' ? ['--no-sandbox', '--disable-dev-shm-usage'] : [];
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', ...SANDBOX, '--no-first-run', '--no-default-browser-check',
  `--user-data-dir=${UD}`, `--remote-debugging-port=${PORT}`,
  '--force-device-scale-factor=1', `--window-size=${W},${H}`, '--hide-scrollbars', 'about:blank',
], { stdio: 'ignore' });

try {
  // wait for the page target's debugger ws
  let pageWs = null;
  for (let i = 0; i < 40 && !pageWs; i++) {
    await sleep(250);
    try {
      const list = await fetch(`http://127.0.0.1:${PORT}/json`, { signal: AbortSignal.timeout(2000) }).then(r => r.json());
      const page = list.find(t => t.type === 'page');
      if (page) pageWs = page.webSocketDebuggerUrl;
    } catch {}
  }
  if (!pageWs) throw new Error('chrome devtools not reachable');

  const ws = wsConnect(pageWs);
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('cdp ws open timeout')), 10000);
    ws.onopen = () => { clearTimeout(t); res(); };
    ws.onerror = () => { clearTimeout(t); rej(new Error('cdp ws open failed')); };
  });
  let id = 0; const pending = new Map();
  const finish = (i, fn) => { const p = pending.get(i); if (p) { clearTimeout(p.to); pending.delete(i); fn(p); } };
  const failAll = (err) => { for (const i of [...pending.keys()]) finish(i, (p) => p.rej(err)); };
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id) finish(m.id, (p) => p.res(m)); };
  ws.onclose = () => failAll(new Error('cdp ws closed'));
  ws.onerror = () => failAll(new Error('cdp ws error'));
  const cmd = (method, params = {}) => new Promise((res, rej) => {
    const i = ++id;
    const to = setTimeout(() => finish(i, (p) => p.rej(new Error('cdp timeout: ' + method))), 15000);
    pending.set(i, { res, rej, to });
    ws.send(JSON.stringify({ id: i, method, params }));
  });

  await cmd('Page.enable');
  await cmd('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await cmd('Page.navigate', { url: URL });
  await sleep(WAIT);  // load + /api/snapshot fetch + first WS frame + render
  const shot = await cmd('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: W, height: H, scale: 1 }, captureBeyondViewport: true });
  if (!shot.result?.data) throw new Error('captureScreenshot returned no data');
  fs.writeFileSync(OUT, Buffer.from(shot.result.data, 'base64'));
  console.log('SAVED', OUT, fs.statSync(OUT).size, 'bytes');
  ws.close();
} catch (e) {
  console.error('ERR', e.message);
  process.exitCode = 1;
} finally {
  chrome.kill();
  try { fs.rmSync(UD, { recursive: true, force: true }); } catch {}
}
