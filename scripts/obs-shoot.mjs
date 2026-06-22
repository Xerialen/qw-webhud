// obs-shoot.mjs -- drive OBS via obs-websocket v5 (zero-dep; Node's global WebSocket) to build a
// composite scene = ezQuake Window Capture (3D, native HUD off) + the qw-webhud browser overlay on
// top, then save a screenshot. Reads the websocket password from OBS's own config (never printed).
//
// Prereqs: obs-websocket enabled + OBS running; the qw-webhud bridge running; the capture client
// (cl_hudexport exe, native HUD off) already launched so its window exists. Usage:
//   node obs-shoot.mjs [outPath]
import crypto from 'node:crypto';
import fs from 'node:fs';

const CFG = process.env.OBS_WS_CONFIG || ((process.env.APPDATA || '').replace(/\\/g, '/') + '/obs-studio/plugin_config/obs-websocket/config.json');
const cfg = JSON.parse(fs.readFileSync(CFG, 'utf8'));
const PORT = cfg.server_port || 4455;
const PASS = cfg.server_password || '';
const OVERLAY = process.env.OVERLAY_URL || 'http://localhost:7777/overlay.html?spec=demoshots';
const OUT = process.argv[2] || 'obs-composite.png';   // cwd-relative default
const W = 1920, H = 1080;

const sha = (s) => crypto.createHash('sha256').update(s).digest('base64');
let ws, reqId = 0; const pending = new Map();
const send = (o) => ws.send(JSON.stringify(o));
function req(requestType, requestData = {}) {
  const requestId = String(++reqId);
  send({ op: 6, d: { requestType, requestId, requestData } });
  return new Promise((res, rej) => pending.set(requestId, { res, rej, requestType }));
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
ws.onerror = (e) => { console.error('WS error:', e.message || 'connect failed (is OBS running with websocket enabled?)'); process.exit(2); };
ws.onclose = () => {};
ws.onmessage = async (ev) => {
  const m = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString());
  if (m.op === 0) {                       // Hello
    const a = m.d.authentication;
    const d = { rpcVersion: 1 };
    if (a) d.authentication = sha(sha(PASS + a.salt) + a.challenge);
    send({ op: 1, d });
  } else if (m.op === 2) {                // Identified
    run().catch(e => { console.error('ERR:', e.message); process.exit(1); });
  } else if (m.op === 7) {                // RequestResponse
    const p = pending.get(m.d.requestId); pending.delete(m.d.requestId);
    if (!p) return;
    if (m.d.requestStatus.result) p.res(m.d.responseData || {});
    else p.rej(new Error(`${p.requestType}: ${m.d.requestStatus.comment || m.d.requestStatus.code}`));
  }
};

async function run() {
  const ver = await req('GetVersion');
  console.log(`OBS ${ver.obsVersion}, ws ${ver.obsWebSocketVersion}`);
  const scene = (await req('GetSceneList')).currentProgramSceneName;
  console.log('scene:', scene);
  const have = (await req('GetInputList')).inputs.map(i => i.inputName);

  // 1) browser overlay
  if (!have.includes('qw-webhud')) {
    await req('CreateInput', { sceneName: scene, inputName: 'qw-webhud', inputKind: 'browser_source',
      inputSettings: { url: OVERLAY, width: W, height: H, reroute_audio: false } });
    console.log('+ browser source qw-webhud');
  } else {
    await req('SetInputSettings', { inputName: 'qw-webhud', inputSettings: { url: OVERLAY, width: W, height: H } });
    console.log('= browser source updated');
  }

  // 2) window capture of ezQuake
  if (!have.includes('qw-engine')) {
    await req('CreateInput', { sceneName: scene, inputName: 'qw-engine', inputKind: 'window_capture', inputSettings: {} });
    console.log('+ window capture qw-engine');
  }
  const items = (await req('GetInputPropertiesListPropertyItems', { inputName: 'qw-engine', propertyName: 'window' })).propertyItems || [];
  const ez = items.find(i => /ezquake/i.test(i.itemName) || /ezquake/i.test(String(i.itemValue)));
  if (ez) { await req('SetInputSettings', { inputName: 'qw-engine', inputSettings: { window: ez.itemValue, method: 2, cursor: false } }); console.log('window ->', ez.itemName); }
  else console.log('WARN: ezQuake window not found among:', items.map(i => i.itemName).join(' | ') || '(none)');

  // 3) order (engine below, overlay above) + fit engine to canvas
  const sis = (await req('GetSceneItemList', { sceneName: scene })).sceneItems;
  const id = {}; sis.forEach(s => id[s.sourceName] = s.sceneItemId);
  if (id['qw-engine'] != null) {
    await req('SetSceneItemTransform', { sceneName: scene, sceneItemId: id['qw-engine'],
      sceneItemTransform: { boundsType: 'OBS_BOUNDS_SCALE_INNER', boundsWidth: W, boundsHeight: H, positionX: 0, positionY: 0, alignment: 5 } });
    await req('SetSceneItemIndex', { sceneName: scene, sceneItemId: id['qw-engine'], sceneItemIndex: 0 });
  }
  if (id['qw-webhud'] != null) await req('SetSceneItemIndex', { sceneName: scene, sceneItemId: id['qw-webhud'], sceneItemIndex: 1 });

  await sleep(3000);   // let the browser source connect to the bridge + receive frames
  await req('SaveSourceScreenshot', { sourceName: scene, imageFormat: 'png', imageFilePath: OUT, imageWidth: W, imageHeight: H });
  console.log('SAVED', OUT);
  process.exit(0);
}
