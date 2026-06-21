// feed.js — WebSocket client. Keeps the latest snapshot; the render loop reads it each rAF.
// Auto-reconnects. Exposes fps + age (ms since last frame) for the latency readout.
export class Feed {
  constructor(url) {
    this.url = url || `ws://${location.host}/ws`;
    this.latest = null;
    this.lastRecv = 0;
    this._count = 0;
    this._fps = 0;
    this._cbs = [];
    this.connected = false;
    setInterval(() => { this._fps = this._count; this._count = 0; }, 1000);
  }
  connect() {
    let ws;
    try { ws = new WebSocket(this.url); } catch { setTimeout(() => this.connect(), 1000); return; }
    this.ws = ws;
    ws.onopen = () => { this.connected = true; };
    ws.onmessage = (e) => {
      try { this.latest = JSON.parse(e.data); } catch { return; }
      this.lastRecv = performance.now();
      this._count++;
      for (const cb of this._cbs) { try { cb(this.latest); } catch {} }
    };
    ws.onclose = () => { this.connected = false; setTimeout(() => this.connect(), 1000); };
    ws.onerror = () => { try { ws.close(); } catch {} };
  }
  getLatest() { return this.latest; }
  onFrame(cb) { this._cbs.push(cb); }
  get fps() { return this._fps; }
  get age() { return this.latest ? performance.now() - this.lastRecv : Infinity; }
}
