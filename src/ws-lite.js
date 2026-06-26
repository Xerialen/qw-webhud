// ws-lite.js — minimal zero-dependency WebSocket broadcast hub (RFC 6455, server->client text).
// We only push frames out; client frames are read solely to answer ping (0x9) and close (0x8).
// Pattern + gotchas: thevault reference/recipes/qw-lab-live-viewer.md (stdlib WS, ~80 lines).
// Also exports a tiny RFC 6455 *client* (wsConnect) so the CDP/OBS/bridge tooling works on
// Node 18 (no global WebSocket until Node >= 21) while keeping the repo zero-dependency.
import crypto from 'node:crypto';
import net from 'node:net';
import tls from 'node:tls';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

export function attachWS(httpServer, { path = '/ws' } = {}) {
  const clients = new Set();

  httpServer.on('upgrade', (req, socket) => {
    if (path && req.url.split('?')[0] !== path) { socket.destroy(); return; }
    const key = req.headers['sec-websocket-key'];
    if (!key) { socket.destroy(); return; }
    const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
    );
    socket.setNoDelay(true); // low latency: disable Nagle
    clients.add(socket);
    socket.on('data', (buf) => onClientData(buf, socket));
    const drop = () => { clients.delete(socket); };
    socket.on('close', drop);
    socket.on('error', () => { drop(); try { socket.destroy(); } catch {} });
  });

  function onClientData(buf, socket) {
    // Minimal frame inspection: opcode is in the low nibble of byte 0 (not masked).
    // We ignore payloads; just react to control opcodes.
    if (buf.length < 1) return;
    const opcode = buf[0] & 0x0f;
    if (opcode === 0x8) { clients.delete(socket); try { socket.end(encodeFrame(Buffer.alloc(0), 0x8)); } catch {} }
    else if (opcode === 0x9) { try { socket.write(encodeFrame(Buffer.alloc(0), 0xA)); } catch {} } // pong
  }

  function broadcast(str) {
    if (!clients.size) return;
    const frame = encodeFrame(Buffer.from(str, 'utf8'), 0x1); // text
    for (const c of clients) {
      if (c.writable) { try { c.write(frame); } catch { clients.delete(c); } }
    }
  }

  return { broadcast, get size() { return clients.size; } };
}

// Server->client frame: FIN set, no mask. Length encoded per RFC 6455.
function encodeFrame(payload, opcode) {
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.allocUnsafe(2); header[1] = len;
  } else if (len < 65536) {
    header = Buffer.allocUnsafe(4); header[1] = 126; header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.allocUnsafe(10); header[1] = 127; header.writeBigUInt64BE(BigInt(len), 2);
  }
  header[0] = 0x80 | opcode; // FIN + opcode
  return Buffer.concat([header, payload]);
}

// ---------------------------------------------------------------------------
// Minimal RFC 6455 *client* — a browser-WebSocket-like surface so the CDP / OBS /
// bridge scripts run without Node's global WebSocket (Node >= 21 only). Client->server
// frames are masked per spec; incoming frames are reassembled across fragments (large
// CDP screenshot payloads arrive fragmented). ws:// and wss:// supported.
//   const ws = wsConnect('ws://127.0.0.1:9444/devtools/page/...');
//   ws.onopen = () => {}; ws.onmessage = (e) => use(e.data); ws.send(str); ws.close();
export function wsConnect(url) {
  const u = new URL(url);
  const secure = u.protocol === 'wss:';
  const host = u.hostname;
  const port = Number(u.port || (secure ? 443 : 80));
  const reqPath = (u.pathname || '/') + (u.search || '');
  const key = crypto.randomBytes(16).toString('base64');

  const queue = [];
  let onmessage = null;
  const api = {
    onopen: null, onerror: null, onclose: null, readyState: 0, send, close,
    get onmessage() { return onmessage; },
    set onmessage(fn) { onmessage = fn; if (fn) while (queue.length) fn(queue.shift()); },
  };

  let buf = Buffer.alloc(0);
  let upgraded = false;
  let frag = Buffer.alloc(0);

  const connect = secure ? tls.connect : net.connect;
  const sock = connect({ host, port, servername: secure ? host : undefined }, () => {
    sock.write(
      `GET ${reqPath} HTTP/1.1\r\n` +
      `Host: ${u.host}\r\n` +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Key: ${key}\r\n` +
      'Sec-WebSocket-Version: 13\r\n\r\n'
    );
  });
  sock.setNoDelay?.(true);
  sock.on('error', (e) => { api.readyState = 3; if (api.onerror) api.onerror(e); });
  sock.on('close', () => { api.readyState = 3; if (api.onclose) api.onclose(); });
  sock.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    if (!upgraded) {
      const i = buf.indexOf('\r\n\r\n');
      if (i < 0) return;
      const head = buf.slice(0, i).toString('latin1');
      if (!/^HTTP\/1\.1 101/i.test(head)) {
        api.readyState = 3;
        if (api.onerror) api.onerror(new Error('ws upgrade failed: ' + head.split('\r\n')[0]));
        sock.destroy(); return;
      }
      upgraded = true; api.readyState = 1; buf = buf.slice(i + 4);
      if (api.onopen) api.onopen();
    }
    let f;
    while ((f = decodeClientFrame(buf))) {
      buf = f.rest;
      if (f.opcode === 0x8) { close(); return; }            // close
      if (f.opcode === 0x9) { try { sock.write(encodeClientFrame(f.payload, 0xA)); } catch {} continue; } // ping->pong
      if (f.opcode === 0xA) continue;                        // pong
      if (f.opcode === 0x0) frag = Buffer.concat([frag, f.payload]); // continuation
      else frag = f.payload;                                 // text/binary start
      if (f.fin) {
        const data = frag.toString('utf8'); frag = Buffer.alloc(0);
        if (onmessage) onmessage({ data }); else queue.push({ data });
      }
    }
  });

  function send(str) {
    const payload = Buffer.from(typeof str === 'string' ? str : String(str), 'utf8');
    try { sock.write(encodeClientFrame(payload, 0x1)); } catch {}
  }
  function close() {
    if (api.readyState >= 2) return;
    api.readyState = 2;
    try { sock.write(encodeClientFrame(Buffer.alloc(0), 0x8)); } catch {}
    try { sock.end(); } catch {}
  }
  return api;
}

// Parse one frame from buf; return {fin, opcode, payload, rest} or null if incomplete.
function decodeClientFrame(buf) {
  if (buf.length < 2) return null;
  const fin = (buf[0] & 0x80) !== 0;
  const opcode = buf[0] & 0x0f;
  const masked = (buf[1] & 0x80) !== 0;
  let len = buf[1] & 0x7f;
  let off = 2;
  if (len === 126) { if (buf.length < 4) return null; len = buf.readUInt16BE(2); off = 4; }
  else if (len === 127) { if (buf.length < 10) return null; len = Number(buf.readBigUInt64BE(2)); off = 10; }
  let mask = null;
  if (masked) { if (buf.length < off + 4) return null; mask = buf.slice(off, off + 4); off += 4; }
  if (buf.length < off + len) return null;
  let payload = buf.slice(off, off + len);
  if (masked) { payload = Buffer.from(payload); for (let i = 0; i < len; i++) payload[i] ^= mask[i & 3]; }
  return { fin, opcode, payload, rest: buf.slice(off + len) };
}

// Client->server frame: FIN + opcode, payload masked (RFC 6455 requires client masking).
function encodeClientFrame(payload, opcode) {
  const len = payload.length;
  const mask = crypto.randomBytes(4);
  let header;
  if (len < 126) { header = Buffer.allocUnsafe(2); header[1] = 0x80 | len; }
  else if (len < 65536) { header = Buffer.allocUnsafe(4); header[1] = 0x80 | 126; header.writeUInt16BE(len, 2); }
  else { header = Buffer.allocUnsafe(10); header[1] = 0x80 | 127; header.writeBigUInt64BE(BigInt(len), 2); }
  header[0] = 0x80 | opcode;
  const out = Buffer.allocUnsafe(len);
  for (let i = 0; i < len; i++) out[i] = payload[i] ^ mask[i & 3];
  return Buffer.concat([header, mask, out]);
}
