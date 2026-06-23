// editor.js — the HUD-spec editor. Reuses the shared Stage/elements renderer over a quake-screen
// mockup background; lets you drag/select/style elements and save/load the spec as JSON.
import { Stage } from './render.js';
import { ELEMENTS, PALETTE } from './elements.js';
import { QHLAN_ELEMENTS, QHLAN_PALETTE } from './qhlan-elements.js';
import { applyTheme } from './theme.js';
import { DEFAULT_SPEC, SAMPLE_STATE } from './specs.js';
import { Feed } from './feed.js';

const $ = (id) => document.getElementById(id);
const clone = (o) => structuredClone(o);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const screen = $('screen');
const stage = new Stage($('stage'));
const feed = new Feed();
let feedStarted = false;

let spec = clone(DEFAULT_SPEC);
let selectedId = null;
let live = false;

// themed specs (meta.theme === 'qhlan') use a different element registry + editor palette.
const regFor = (sp) => (sp?.meta?.theme === 'qhlan' ? QHLAN_ELEMENTS : ELEMENTS);
const paletteFor = (sp) => (sp?.meta?.theme === 'qhlan' ? QHLAN_PALETTE : PALETTE);

// type-specific option editors: { key, label, kind, options? }
const OPT_FIELDS = {
  bigstat: [{ key: 'kind', label: 'stat', kind: 'select', options: ['health', 'armor', 'ammo'] }],
  killfeed: [
    { key: 'keep', label: 'keep', kind: 'number', min: 1, max: 12, step: 1 },
    { key: 'align', label: 'align', kind: 'select', options: ['left', 'center', 'right'] },
  ],
  teaminfo: [{ key: 'align', label: 'align', kind: 'select', options: ['left', 'center', 'right'] }],
  teamscore: [{ key: 'withClock', label: 'clock', kind: 'select', options: ['', 'true'] }],
  ammocounts: [{ key: 'dir', label: 'dir', kind: 'select', options: ['row', 'col', 'grid'] }],
  panel: [
    { key: 'w', label: 'w (px)', kind: 'number', min: 0, max: 1920, step: 4 },
    { key: 'h', label: 'h (px)', kind: 'number', min: 0, max: 1080, step: 4 },
    { key: 'variant', label: 'variant', kind: 'select', options: ['bar', 'bare'] },
  ],
  text: [{ key: 'text', label: 'text', kind: 'text' }],
  crosshair: [{ key: 'char', label: 'char', kind: 'text' }],
};
const ANCHORS = [
  ['lt', 'top-left'], ['ct', 'top-center'], ['rt', 'top-right'],
  ['lc', 'center-left'], ['cc', 'center'], ['rc', 'center-right'],
  ['lb', 'bottom-left'], ['cb', 'bottom-center'], ['rb', 'bottom-right'],
];

// ---- render / selection ----
function render() {
  applyTheme(spec);            // body theme class + webfont + theme CSS (shared with the overlay)
  stage.setSpec(spec);
  if (selectedId && !spec.elements.some(e => e.id === selectedId)) selectedId = null;
  stage.update(currentState());
  if (selectedId) markSelected(selectedId);
}
function currentState() { return live ? (feed.getLatest() || SAMPLE_STATE) : SAMPLE_STATE; }
function elById(id) { return spec.elements.find(e => e.id === id); }

function markSelected(id) {
  for (const n of stage.root.querySelectorAll('.hel.sel, .hud-el.sel')) n.classList.remove('sel');
  const n = stage.getNode(id);
  if (n) n.classList.add('sel');
}
function select(id) { selectedId = id; markSelected(id); buildProps(); }
function deselect() { selectedId = null; for (const n of stage.root.querySelectorAll('.hel.sel, .hud-el.sel')) n.classList.remove('sel'); buildProps(); }

// ---- properties panel ----
function buildProps() {
  const props = $('props');
  const el = elById(selectedId);
  if (!el) { props.innerHTML = `<div class="empty">Click an element to edit it.<br><br>Drag to move · arrow keys nudge<br>(<span class="kbd">Shift</span> = bigger steps)</div>`; return; }
  const def = regFor(spec)[el.type] || {};
  const rows = [];
  rows.push(`<h3>${el.id} <span class="muted">(${el.type})</span></h3>`);
  rows.push(row('show', `<input type="checkbox" data-k="show" ${el.show === false ? '' : 'checked'}>`));
  rows.push(row('x %', numInput('x', el.x, 0, 100, 0.5)));
  rows.push(row('y %', numInput('y', el.y, 0, 100, 0.5)));
  rows.push(row('scale', numInput('scale', el.scale ?? 1, 0.1, 6, 0.05)));
  rows.push(row('anchor', selInput('anchor', ANCHORS.map(a => a[0]), el.anchor || 'cc', ANCHORS.map(a => a[1]))));
  rows.push(row('color', `<input type="color" data-k="color" value="${el.color || '#ffffff'}"><button data-act="autocolor" title="use element default">auto</button>`));
  rows.push(row('z', numInput('z', el.z ?? 1, 0, 99, 1)));
  for (const f of (OPT_FIELDS[el.type] || [])) {
    const val = (el.opts && el.opts[f.key] != null) ? el.opts[f.key] : (def.defaultOpts?.[f.key] ?? '');
    if (f.kind === 'select') rows.push(row(f.label, selInput('opt:' + f.key, f.options, val)));
    else if (f.kind === 'number') rows.push(row(f.label, `<input type="number" data-k="opt:${f.key}" value="${val}" min="${f.min}" max="${f.max}" step="${f.step}">`));
    else rows.push(row(f.label, `<input type="text" data-k="opt:${f.key}" value="${String(val).replace(/"/g, '&quot;')}">`));
  }
  rows.push(`<div class="pactions"><button data-act="dup">Duplicate</button><button data-act="del" class="danger">Delete</button></div>`);
  props.innerHTML = rows.join('');

  props.querySelectorAll('[data-k]').forEach(inp => inp.addEventListener('input', onPropInput));
  props.querySelector('[data-act="dup"]')?.addEventListener('click', () => duplicate(el.id));
  props.querySelector('[data-act="del"]')?.addEventListener('click', () => removeEl(el.id));
  props.querySelector('[data-act="autocolor"]')?.addEventListener('click', () => { delete el.color; applyLayout(el); buildProps(); });
}
const row = (label, html) => `<div class="row"><label>${label}</label>${html}</div>`;
const numInput = (k, v, min, max, step) => `<input type="number" data-k="${k}" value="${v}" min="${min}" max="${max}" step="${step}">`;
const selInput = (k, opts, val, labels) => `<select data-k="${k}">${opts.map((o, i) => `<option value="${o}" ${o === val ? 'selected' : ''}>${labels ? labels[i] : o}</option>`).join('')}</select>`;

function onPropInput(e) {
  const el = elById(selectedId); if (!el) return;
  const k = e.target.dataset.k;
  let v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
  if (e.target.type === 'number') v = parseFloat(v);
  if (k === 'show') { el.show = v; }
  else if (k.startsWith('opt:')) { el.opts = el.opts || {}; el.opts[k.slice(4)] = v; stage.update(currentState()); return; }
  else { el[k] = v; }
  applyLayout(el);
}
function applyLayout(el) { const n = stage.getNode(el.id); if (n) stage.layout(n, el); }

// ---- add / duplicate / delete ----
function uniqueId(base) { let i = 1, id = base; while (spec.elements.some(e => e.id === id)) id = base + (++i); return id; }
function addElement(type) {
  const def = regFor(spec)[type]; if (!def) return;
  const el = { id: uniqueId(type), type, x: 50, y: 50, anchor: 'cc', scale: 1.0, z: 3, opts: clone(def.defaultOpts || {}) };
  spec.elements.push(el); render(); select(el.id);
}
function duplicate(id) {
  const src = elById(id); if (!src) return;
  const copy = clone(src); copy.id = uniqueId(src.type); copy.x = clamp(src.x + 3, 0, 100); copy.y = clamp(src.y + 3, 0, 100);
  spec.elements.push(copy); render(); select(copy.id);
}
function removeEl(id) {
  spec.elements = spec.elements.filter(e => e.id !== id);
  if (selectedId === id) selectedId = null;
  render(); buildProps();
}

// ---- drag ----
let drag = null;
$('stage').addEventListener('mousedown', (e) => {
  const node = e.target.closest('.hel, .hud-el'); if (!node) { deselect(); return; }
  const id = node.dataset.id; select(id);
  const el = elById(id); const rect = $('stage').getBoundingClientRect();
  drag = { id, sx: e.clientX, sy: e.clientY, x0: el.x, y0: el.y, rw: rect.width, rh: rect.height };
  node.classList.add('dragging');
  e.preventDefault();
});
window.addEventListener('mousemove', (e) => {
  if (!drag) return;
  const el = elById(drag.id); if (!el) return;
  el.x = clamp(drag.x0 + (e.clientX - drag.sx) / drag.rw * 100, 0, 100);
  el.y = clamp(drag.y0 + (e.clientY - drag.sy) / drag.rh * 100, 0, 100);
  applyLayout(el);
});
window.addEventListener('mouseup', () => {
  if (!drag) return;
  stage.getNode(drag.id)?.classList.remove('dragging');
  drag = null; buildProps(); // refresh x/y fields
});

// ---- keyboard nudge ----
window.addEventListener('keydown', (e) => {
  if (!selectedId) return;
  if (/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName)) return;
  const el = elById(selectedId); if (!el) return;
  const step = e.shiftKey ? 2 : 0.5;
  let used = true;
  if (e.key === 'ArrowLeft') el.x = clamp(el.x - step, 0, 100);
  else if (e.key === 'ArrowRight') el.x = clamp(el.x + step, 0, 100);
  else if (e.key === 'ArrowUp') el.y = clamp(el.y - step, 0, 100);
  else if (e.key === 'ArrowDown') el.y = clamp(el.y + step, 0, 100);
  else used = false;
  if (used) { e.preventDefault(); applyLayout(el); buildProps(); }
});

// ---- save / load ----
async function save() {
  const name = ($('specName').value || 'hud').trim();
  spec.meta = spec.meta || {}; spec.meta.name = name;
  try {
    const r = await fetch('/api/specs/' + encodeURIComponent(name), {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(spec, null, 2),
    });
    status(r.ok ? `saved "${name}"` : `save failed (${r.status})`, !r.ok);
  } catch (err) { status('save failed: ' + err.message, true); }
}
async function load() {
  const name = ($('specName').value || 'hub').trim();
  try {
    const r = await fetch('/api/specs/' + encodeURIComponent(name));
    if (r.ok) { spec = await r.json(); }
    else if (name === 'hub') { spec = clone(DEFAULT_SPEC); }
    else { status(`no spec "${name}"`, true); return; }
    selectedId = null; refreshPalette(); applyBg(); render(); buildProps(); status(`loaded "${name}"`);
  } catch (err) { status('load failed: ' + err.message, true); }
}
function status(msg, err) { const s = $('status'); s.textContent = msg; s.style.color = err ? '#ff8080' : '#7fd08a'; }

// ---- background ----
function applyBg() {
  const img = $('bg'); const src = spec.meta?.bg;
  if (src) { img.src = src; img.classList.add('show'); } else { img.removeAttribute('src'); img.classList.remove('show'); }
}
$('btnBg').addEventListener('click', () => $('bgFile').click());
$('bgFile').addEventListener('change', (e) => {
  const f = e.target.files?.[0]; if (!f) return;
  const rd = new FileReader();
  rd.onload = () => { spec.meta = spec.meta || {}; spec.meta.bg = rd.result; applyBg(); status('background set (saved with spec)'); };
  rd.readAsDataURL(f);
});
$('btnBgClear').addEventListener('click', () => { if (spec.meta) delete spec.meta.bg; applyBg(); });

// ---- toolbar wiring ----
$('btnSave').addEventListener('click', save);
$('btnLoad').addEventListener('click', load);
$('btnAdd').addEventListener('click', () => addElement($('addType').value));
$('btnGrid').addEventListener('click', (e) => { screen.classList.toggle('grid'); e.currentTarget.classList.toggle('on'); });
$('btnLive').addEventListener('click', (e) => {
  live = !live; e.currentTarget.classList.toggle('on', live);
  if (live && !feedStarted) { feed.connect(); feedStarted = true; }
  if (!live) stage.update(SAMPLE_STATE);
});

// populate the add-element dropdown (the palette depends on the current spec's theme registry)
function refreshPalette() {
  $('addType').innerHTML = paletteFor(spec).map(p => `<option value="${p.type}">${p.label}</option>`).join('');
}
refreshPalette();

// ---- boot ----
const params = new URLSearchParams(location.search);
if (params.get('spec')) $('specName').value = params.get('spec');
applyBg();
render();
buildProps();
(function loop() { stage.update(currentState()); requestAnimationFrame(loop); })();
// try to load the named spec from the server (falls back to the in-memory default)
load();
