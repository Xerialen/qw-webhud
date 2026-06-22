// bridge.js — the one process you run.
//   * listens for UDP state snapshots from the source (ezQuake cl_hudexport / mock / mvd)
//   * forwards each datagram verbatim over WebSocket to every connected browser
//   * serves the static web app (src/public) and a tiny spec-persistence API
//
//   node src/bridge.js            # real engine feed
//   node src/bridge.js --mock     # also run the synthetic mock feed (dev, no engine)
import http from 'node:http';
import dgram from 'node:dgram';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { attachWS } from './ws-lite.js';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, 'public');
const SPECS  = path.join(PUBLIC, 'specs');

const HTTP_PORT = Number(process.env.HUD_HTTP_PORT || 7777);
const UDP_PORT  = Number(process.env.HUD_UDP_PORT  || 27999);
const USE_MOCK  = process.argv.includes('--mock');
let lastSnapshot = null;   // most recent UDP snapshot, served at GET /api/snapshot (immediate render on load / headless)

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
};
const SPEC_NAME = /^[a-z0-9._-]+$/i;

const log = (...a) => console.log('[qw-webhud]', ...a);
const send = (res, code, body, headers = {}) => { res.writeHead(code, headers); res.end(body); };

async function handleApi(req, res, u) {
  const parts = u.pathname.split('/').filter(Boolean); // ['api', 'specs'|'snapshot', ...]
  if (parts[1] === 'snapshot') {
    return send(res, 200, lastSnapshot || '{}', { 'content-type': 'application/json', 'cache-control': 'no-cache' });
  }
  if (parts[1] !== 'specs') return send(res, 404, 'not found');
  await fs.promises.mkdir(SPECS, { recursive: true });

  if (parts.length === 2) { // list
    if (req.method !== 'GET') return send(res, 405, 'method not allowed');
    const files = (await fs.promises.readdir(SPECS)).filter(f => f.endsWith('.json'));
    return send(res, 200, JSON.stringify(files.map(f => f.replace(/\.json$/, ''))),
      { 'content-type': 'application/json' });
  }

  const name = parts[2];
  if (!SPEC_NAME.test(name)) return send(res, 400, 'bad spec name');
  const file = path.join(SPECS, name.endsWith('.json') ? name : name + '.json');

  if (req.method === 'GET') {
    try { return send(res, 200, await fs.promises.readFile(file), { 'content-type': 'application/json' }); }
    catch { return send(res, 404, 'no such spec'); }
  }
  if (req.method === 'PUT') {
    const chunks = []; for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks).toString('utf8');
    try { JSON.parse(body); } catch { return send(res, 400, 'invalid json'); }
    await fs.promises.writeFile(file, body);
    log(`saved spec "${name}" (${body.length} bytes)`);
    return send(res, 200, JSON.stringify({ ok: true, name }), { 'content-type': 'application/json' });
  }
  return send(res, 405, 'method not allowed');
}

async function handleHttp(req, res) {
  const u = new URL(req.url, `http://localhost:${HTTP_PORT}`);
  if (u.pathname.startsWith('/api/')) return handleApi(req, res, u);

  let p = decodeURIComponent(u.pathname);
  if (p === '/' || p === '') p = '/overlay.html';
  const filePath = path.normalize(path.join(PUBLIC, p));
  const relPath = path.relative(PUBLIC, filePath);
  if (relPath.startsWith('..') || path.isAbsolute(relPath)) return send(res, 403, 'forbidden');
  try {
    const data = await fs.promises.readFile(filePath);
    send(res, 200, data, { 'content-type': MIME[path.extname(filePath)] || 'application/octet-stream',
      'cache-control': 'no-cache' });
  } catch { send(res, 404, 'not found: ' + p); }
}

const server = http.createServer((req, res) =>
  handleHttp(req, res).catch(e => { log('http error', e); send(res, 500, String(e)); }));
const ws = attachWS(server, { path: '/ws' });
server.listen(HTTP_PORT, '127.0.0.1', () =>
  log(`web  -> http://localhost:${HTTP_PORT}/overlay.html   (editor: /editor.html)`));

// --- UDP ingest -> WS broadcast ---
const udp = dgram.createSocket('udp4');
let frames = 0;
udp.on('message', (msg) => { frames++; lastSnapshot = msg.toString('utf8'); ws.broadcast(lastSnapshot); });
udp.on('error', (e) => log('udp error', e.message));
udp.bind(UDP_PORT, '127.0.0.1', () =>
  log(`feed <- udp 127.0.0.1:${UDP_PORT}  (ezQuake cl_hudexport_port)`));

setInterval(() => { if (frames) { log(`relaying ${(frames / 2).toFixed(0)} fps -> ${ws.size} client(s)`); frames = 0; } }, 2000);

if (USE_MOCK) {
  import('./feeds/mock.js')
    .then(m => { m.start({ port: UDP_PORT }); log('mock feed ON (--mock)'); })
    .catch(e => log('mock feed failed to start', e));
}
