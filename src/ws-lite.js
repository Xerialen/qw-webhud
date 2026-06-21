// ws-lite.js — minimal zero-dependency WebSocket broadcast hub (RFC 6455, server->client text).
// We only push frames out; client frames are read solely to answer ping (0x9) and close (0x8).
// Pattern + gotchas: thevault reference/recipes/qw-lab-live-viewer.md (stdlib WS, ~80 lines).
import crypto from 'node:crypto';

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
