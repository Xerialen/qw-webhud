// shoot.mjs -- reliable full-res screenshot of a URL via Chrome DevTools Protocol (zero deps; Node's
// global fetch + WebSocket). Avoids the flaky `chrome --screenshot` flag (profile collisions +
// virtual-time-budget vs the page's open WebSocket). Usage: node shoot.mjs [url] [outPng] [waitMs]
import fs from 'node:fs';
import { spawn } from 'node:child_process';

const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9444;
const URL = process.argv[2] || 'http://localhost:7777/overlay.html?spec=demoshots&bg=/_clean3d.jpg';
const OUT = process.argv[3] || 'C:\\Users\\benya\\projects\\quakeworld\\qw-webhud\\scripts\\composite.png';
const WAIT = Number(process.argv[4] || 3800);
const UD = (process.env.TEMP || '.') + '\\qwcdp-' + process.pid;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--user-data-dir=${UD}`, `--remote-debugging-port=${PORT}`,
  '--force-device-scale-factor=1', '--window-size=1920,1080', '--hide-scrollbars', 'about:blank',
], { stdio: 'ignore' });

try {
  // wait for the page target's debugger ws
  let pageWs = null;
  for (let i = 0; i < 40 && !pageWs; i++) {
    await sleep(250);
    try {
      const list = await fetch(`http://127.0.0.1:${PORT}/json`).then(r => r.json());
      const page = list.find(t => t.type === 'page');
      if (page) pageWs = page.webSocketDebuggerUrl;
    } catch {}
  }
  if (!pageWs) throw new Error('chrome devtools not reachable');

  const ws = new WebSocket(pageWs);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('cdp ws open failed')); });
  let id = 0; const pending = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const cmd = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });

  await cmd('Page.enable');
  await cmd('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  await cmd('Page.navigate', { url: URL });
  await sleep(WAIT);  // load + /api/snapshot fetch + first WS frame + render
  const shot = await cmd('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 1920, height: 1080, scale: 1 }, captureBeyondViewport: true });
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
