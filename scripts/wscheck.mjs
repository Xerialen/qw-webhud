// wscheck.mjs — smoke-test the bridge: connect to the WS, collect N frames, print shape + fps.
// Uses the vendored RFC 6455 client (zero-dep; runs on Node 18). Run while `bridge.js --mock` is up.
//   node scripts/wscheck.mjs
import { wsConnect } from '../src/ws-lite.js';
const url = process.env.WS || 'ws://localhost:7777/ws';
const want = Number(process.env.N || 60);
const ws = wsConnect(url);
let n = 0, first = null, t0 = 0, lastSeq = null, gaps = 0;

ws.onopen = () => console.log('connected:', url);
ws.onerror = (e) => { console.error('ws error:', e?.message || e); process.exit(1); };
ws.onmessage = (e) => {
  n++;
  if (!first) { first = e.data; t0 = performance.now(); }
  try {
    const s = JSON.parse(e.data);
    if (lastSeq !== null && s.seq !== lastSeq + 1) gaps++;
    lastSeq = s.seq;
  } catch { console.error('non-JSON frame'); }
  if (n >= want) {
    const dt = performance.now() - t0;
    const snap = JSON.parse(first);
    console.log(`frames: ${n} in ${dt.toFixed(0)}ms  (~${(n / (dt / 1000)).toFixed(0)} fps), seq-gaps: ${gaps}`);
    console.log('top keys:', Object.keys(snap).join(', '));
    console.log('me     :', JSON.stringify(snap.me));
    console.log('match  :', JSON.stringify(snap.match));
    console.log('teams  :', JSON.stringify(snap.teams));
    console.log('mate[0]:', JSON.stringify(snap.teaminfo?.[0]));
    console.log('events :', JSON.stringify(snap.events));
    ws.close();
    process.exit(0);
  }
};
setTimeout(() => { console.error(`timeout: only ${n} frames`); process.exit(2); }, 6000);
